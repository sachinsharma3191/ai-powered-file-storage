import json
import os
import threading
import time
import uuid
from typing import Callable, Any

import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
PRIORITIES = ["high", "normal", "low"]
DEFAULT_PRIORITY = os.getenv("DEFAULT_PRIORITY", "normal")
# Simple per-agent priority overrides (demo)
PRIORITY_OVERRIDES = {
    "a2a-er-agent": "high",
}

MAX_ATTEMPTS = int(os.getenv("QUEUE_MAX_ATTEMPTS", "3"))
WEBHOOK_TIMEOUT_S = float(os.getenv("WEBHOOK_TIMEOUT_S", "5"))

QUEUE_PREFIX = os.getenv("REDIS_QUEUE_PREFIX", "q:")
DLQ_PREFIX = os.getenv("REDIS_DLQ_PREFIX", "dlq:")

TASK_PREFIX = os.getenv("REDIS_TASK_PREFIX", "task:")


def _r():
    return redis.Redis.from_url(REDIS_URL, decode_responses=True)


def enqueue(
    tenant_id: str,
    agent_id: str,
    payload: dict,
    meta: dict,
    priority: str | None = None,
    webhook_url: str | None = None,
) -> str:
    task_id = meta.get("taskId") or f"t-{uuid.uuid4().hex[:12]}"
    r = _r()
    task_key = TASK_PREFIX + task_id
    p_in = priority or payload.get("priority") or meta.get("priority")
    p = p_in or PRIORITY_OVERRIDES.get(agent_id) or DEFAULT_PRIORITY
    if p not in PRIORITIES:
        p = DEFAULT_PRIORITY
    wh = webhook_url or payload.get("webhookUrl") or meta.get("webhookUrl")
    req = {"payload": payload, "meta": meta, "priority": p, "webhookUrl": wh}
    r.hset(
        task_key,
        mapping={
            "status": "queued",
            "request": json.dumps(req, separators=(",", ":")),
            "createdAt": str(int(time.time() * 1000)),
            "updatedAt": str(int(time.time() * 1000)),
            "tenantId": tenant_id,
            "agentId": agent_id,
            "attempts": "0",
            "priority": p,
            "webhookUrl": wh or "",
            "traceId": meta.get("traceId", ""),
            "spanId": meta.get("spanId", ""),
        },
    )
    r.rpush(_queue_key(tenant_id, agent_id, p), task_id)
    return task_id


def get_task(task_id: str) -> dict:
    r = _r()
    h = r.hgetall(TASK_PREFIX + task_id)
    if not h:
        return {"ok": False, "taskId": task_id, "status": "not_found"}
    out = {"ok": True, "taskId": task_id}
    out.update(h)
    # decode result/error if present
    if "result" in out:
        try:
            out["result"] = json.loads(out["result"])
        except Exception:
            pass
    if "error" in out:
        try:
            out["error"] = json.loads(out["error"])
        except Exception:
            pass
    return out


def list_dlq(tenant_id: str, agent_id: str, limit: int = 50) -> dict:
    r = _r()
    key = _dlq_key(tenant_id, agent_id)
    items = r.lrange(key, max(0, -limit), -1)
    return {"ok": True, "tenantId": tenant_id, "agentId": agent_id, "items": items}


def requeue(
    task_id: str, tenant_id: str, agent_id: str, priority: str | None = None
) -> dict:
    r = _r()
    h = r.hgetall(TASK_PREFIX + task_id)
    if not h:
        return {"ok": False, "taskId": task_id, "status": "not_found"}
    pr = priority or h.get("priority") or DEFAULT_PRIORITY
    if pr not in PRIORITIES:
        pr = DEFAULT_PRIORITY
    r.lrem(_dlq_key(tenant_id, agent_id), 1, task_id)
    _set(task_id, status="queued")
    r.rpush(_queue_key(tenant_id, agent_id, pr), task_id)
    return {
        "ok": True,
        "taskId": task_id,
        "tenantId": tenant_id,
        "agentId": agent_id,
        "priority": pr,
        "status": "queued",
    }


def _dlq_key(tenant_id: str, agent_id: str):
    return f"{DLQ_PREFIX}{tenant_id}:{agent_id}"


def _queue_key(tenant_id: str, agent_id: str, priority: str):
    return f"{QUEUE_PREFIX}{tenant_id}:{agent_id}:{priority}"


def _post_webhook(url: str, body: dict):
    if not url:
        return
    try:
        import requests

        requests.post(url, json=body, timeout=WEBHOOK_TIMEOUT_S)
    except Exception:
        pass


def _set(task_id: str, **fields):
    r = _r()
    fields["updatedAt"] = str(int(time.time() * 1000))
    r.hset(
        TASK_PREFIX + task_id,
        mapping={
            k: (json.dumps(v) if isinstance(v, (dict, list)) else str(v))
            for k, v in fields.items()
        },
    )


def start_worker(
    tenant_id: str,
    agent_id: str,
    handler: Callable[[dict, dict], Any],
    stop_event: threading.Event,
):
    def loop():
        r = _r()
        qkeys = [_queue_key(tenant_id, agent_id, p) for p in PRIORITIES]
        while not stop_event.is_set():
            item = r.blpop(qkeys, timeout=2)
            if not item:
                continue
            _, task_id = item
            try:
                task = r.hgetall(TASK_PREFIX + task_id)
                if not task:
                    continue
                attempts = int(task.get("attempts", "0") or "0") + 1
                _set(task_id, status="running", attempts=str(attempts))
                req = json.loads(task.get("request", "{}") or "{}")
                payload = req.get("payload") or {}
                meta = req.get("meta") or {}
                res = handler(payload, meta)
                _set(task_id, status="succeeded", result=res)
                wh = task.get("webhookUrl", "")
                _post_webhook(
                    wh,
                    {
                        "taskId": task_id,
                        "status": "succeeded",
                        "tenantId": tenant_id,
                        "agentId": agent_id,
                        "result": res,
                    },
                )
            except Exception as e:
                _set(
                    task_id,
                    status="failed",
                    error={"message": str(e), "type": e.__class__.__name__},
                )
                wh = task.get("webhookUrl", "")
                _post_webhook(
                    wh,
                    {
                        "taskId": task_id,
                        "status": "failed",
                        "tenantId": tenant_id,
                        "agentId": agent_id,
                        "error": {"message": str(e), "type": e.__class__.__name__},
                    },
                )
                # retry or DLQ
                try:
                    attempts = int(task.get("attempts", "0") or "0")
                except Exception:
                    attempts = 1
                if attempts < MAX_ATTEMPTS:
                    pr = task.get("priority") or DEFAULT_PRIORITY
                    # simple backoff: sleep attempts seconds
                    time.sleep(min(5, attempts))
                    r.rpush(_queue_key(tenant_id, agent_id, pr), task_id)
                    _set(task_id, status="queued")
                else:
                    r.rpush(_dlq_key(tenant_id, agent_id), task_id)
                    _set(task_id, status="dead_letter")

    t = threading.Thread(target=loop, daemon=True)
    t.start()
