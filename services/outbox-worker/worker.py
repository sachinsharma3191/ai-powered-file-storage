import os
import signal
import threading
import time
import urllib.parse

import psycopg
import requests

def _normalize_db_url(db_url: str) -> str:
    try:
        parsed = urllib.parse.urlparse(db_url)
        qs = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
        schema = (qs.pop("schema", [""]) or [""])[0]
        if not schema:
            return db_url

        existing_options = (qs.get("options", [""]) or [""])[0]
        extra = f"-c search_path={schema}"
        qs["options"] = [f"{existing_options} {extra}".strip()]
 
        new_query = urllib.parse.urlencode(qs, doseq=True, quote_via=urllib.parse.quote)
        return urllib.parse.urlunparse(parsed._replace(query=new_query))
    except Exception:
        return db_url


DB = _normalize_db_url(os.getenv("DATABASE_URL") or "")
POLL_MS = int(os.getenv("POLL_INTERVAL_MS", "2000"))
AGENT_ER_URL = os.getenv("AGENT_ER_URL", "http://agent-er:9101")
AGENT_STAFFING_URL = os.getenv("AGENT_STAFFING_URL", "http://agent-staffing:9102")
AGENT_SURGERY_URL = os.getenv("AGENT_SURGERY_URL", "http://agent-surgery:9103")
AGENT_PHARMACY_URL = os.getenv("AGENT_PHARMACY_URL", "http://agent-pharmacy:9104")
AGENT_BILLING_URL = os.getenv("AGENT_BILLING_URL", "http://agent-billing:9105")
AGENT_BED_URL = os.getenv("AGENT_BED_URL", "http://agent-bed-manager:9106")
AGENT_AMBULANCE_URL = os.getenv("AGENT_AMBULANCE_URL", "http://agent-ambulance:9107")
AGENT_PARKING_URL = os.getenv("AGENT_PARKING_URL", "http://agent-parking:9108")
AGENT_DISCHARGE_URL = os.getenv("AGENT_DISCHARGE_URL", "http://agent-discharge:9111")

if not DB:
    raise RuntimeError("DATABASE_URL not set")


STOP_EVENT = threading.Event()


def _handle_term(_signum, _frame):
    try:
        STOP_EVENT.set()
    except Exception:
        pass


signal.signal(signal.SIGTERM, _handle_term)
signal.signal(signal.SIGINT, _handle_term)


def fetch_pending(conn, limit=50):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, event_type, aggregate_type, aggregate_id, payload, created_at "
            "FROM outbox_events WHERE status='pending' ORDER BY created_at ASC LIMIT %s",
            (limit,),
        )
        rows = cur.fetchall()
        events = []
        for r in rows:
            events.append(
                {
                    "id": r[0],
                    "eventType": r[1],
                    "aggregateType": r[2],
                    "aggregateId": r[3],
                    "payload": r[4],
                    "createdAt": r[5].isoformat() if r[5] else None,
                }
            )
        return events


def mark_sent(conn, ids):
    if not ids:
        return
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE outbox_events SET status='sent' WHERE id = ANY(%s::uuid[])",
            (ids,),
        )
    conn.commit()


def mark_failed(conn, ids):
    if not ids:
        return
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE outbox_events SET status='failed' WHERE id = ANY(%s::uuid[])",
            (ids,),
        )
    conn.commit()


def route_event(e):
    if e["eventType"] == "SHIFT_UNDERSTAFFED":
        return f"{AGENT_STAFFING_URL}/events"
    if e["eventType"] == "SURGERY_SCHEDULE_REQUESTED":
        return f"{AGENT_SURGERY_URL}/events"
    if e["eventType"] == "ORDER_CREATED":
        # fan-out: billing + pharmacy
        return "__FANOUT_ORDER_CREATED__"
    if e["eventType"] == "ADMISSION_CREATED":
        return "__FANOUT_ADMISSION_CREATED__"
    if e["eventType"] == "SURGERY_SCHEDULED":
        return "__FANOUT_SURGERY_SCHEDULED__"
    if e["eventType"] == "DISCHARGE_REQUESTED":
        return f"{AGENT_DISCHARGE_URL}/events"
    # MVP routing: only ER triage update events go to ER agent
    if e["eventType"] == "ER_TRIAGE_UPDATED":
        return "__FANOUT_ER_TRIAGE_UPDATED__"
    return None


def main():
    print("outbox-worker starting...")
    while not STOP_EVENT.is_set():
        try:
            with psycopg.connect(DB) as conn:
                events = fetch_pending(conn)
                if not events:
                    STOP_EVENT.wait(POLL_MS / 1000.0)
                    continue

                sent_ids = []
                failed_ids = []
                for e in events:
                    url = route_event(e)
                    if url == "__FANOUT_ORDER_CREATED__":
                        ok_all = True
                        for u in [
                            f"{AGENT_BILLING_URL}/events",
                            f"{AGENT_PHARMACY_URL}/events",
                        ]:
                            try:
                                r2 = requests.post(u, json=e, timeout=5)
                                ok_all = ok_all and (200 <= r2.status_code < 300)
                            except Exception as _ex:
                                ok_all = False
                        (sent_ids if ok_all else failed_ids).append(e["id"])
                        continue

                    if url == "__FANOUT_ADMISSION_CREATED__":
                        ok_all = True
                        for u in [
                            f"{AGENT_BED_URL}/events",
                            f"{AGENT_PARKING_URL}/events",
                        ]:
                            try:
                                r2 = requests.post(u, json=e, timeout=5)
                                ok_all = ok_all and (200 <= r2.status_code < 300)
                            except Exception as _ex:
                                ok_all = False
                        (sent_ids if ok_all else failed_ids).append(e["id"])
                        continue

                    if url == "__FANOUT_SURGERY_SCHEDULED__":
                        ok_all = True
                        for u in [f"{AGENT_PARKING_URL}/events"]:
                            try:
                                r2 = requests.post(u, json=e, timeout=5)
                                ok_all = ok_all and (200 <= r2.status_code < 300)
                            except Exception as _ex:
                                ok_all = False
                        (sent_ids if ok_all else failed_ids).append(e["id"])
                        continue

                    if url == "__FANOUT_ER_TRIAGE_UPDATED__":
                        ok_all = True
                        for u in [
                            f"{AGENT_ER_URL}/events",
                            f"{AGENT_AMBULANCE_URL}/events",
                        ]:
                            try:
                                r2 = requests.post(u, json=e, timeout=5)
                                ok_all = ok_all and (200 <= r2.status_code < 300)
                            except Exception as _ex:
                                ok_all = False
                        (sent_ids if ok_all else failed_ids).append(e["id"])
                        continue

                    if not url:
                        # mark as sent (no subscribers) to avoid infinite loop in demo
                        sent_ids.append(e["id"])
                        continue
                    try:
                        r = requests.post(url, json=e, timeout=5)
                        if r.status_code >= 200 and r.status_code < 300:
                            sent_ids.append(e["id"])
                        else:
                            failed_ids.append(e["id"])
                            print("agent rejected", e["id"], r.status_code, r.text)
                    except Exception as ex:
                        failed_ids.append(e["id"])
                        print("agent error", e["id"], ex)

                mark_sent(conn, sent_ids)
                mark_failed(conn, failed_ids)

        except Exception as ex:
            print("worker loop error:", ex)

        STOP_EVENT.wait(POLL_MS / 1000.0)


if __name__ == "__main__":
    main()
