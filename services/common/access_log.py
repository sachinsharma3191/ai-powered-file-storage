import os, json, datetime
import psycopg2
from typing import Any

DB_DSN = os.getenv(
    "DB_DSN", "dbname=hospital user=postgres password=postgres host=postgres port=5432"
)


def conn():
    return psycopg2.connect(DB_DSN)


def ensure_access_schema():
    with conn() as c:
        with c.cursor() as cur:
            cur.execute(
                """
CREATE TABLE IF NOT EXISTS access_audit (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_id TEXT,
  actor_role TEXT,
  actor_key TEXT,
  action TEXT,
  resource_type TEXT,
  resource_id TEXT,
  decision TEXT,
  reason TEXT
);
CREATE INDEX IF NOT EXISTS access_audit_tenant_ts_idx ON access_audit(tenant_id, ts DESC);
"""
            )
        c.commit()


def log_access(
    tenant_id: str,
    actor: dict,
    action: str,
    resource_type: str,
    resource_id: str,
    decision: str,
    reason: str = "",
):
    try:
        ensure_access_schema()
        with conn() as c:
            with c.cursor() as cur:
                cur.execute(
                    "INSERT INTO access_audit(tenant_id, actor_role, actor_key, action, resource_type, resource_id, decision, reason) "
                    "VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
                    (
                        tenant_id,
                        (actor or {}).get("role"),
                        (actor or {}).get("apiKey"),
                        action,
                        resource_type,
                        resource_id,
                        decision,
                        reason,
                    ),
                )
            c.commit()
    except Exception:
        return
