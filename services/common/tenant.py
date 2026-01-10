import os
from fastapi import Request, HTTPException

DEFAULT_TENANT = os.getenv("DEFAULT_TENANT_ID", "demo-hospital")


def get_tenant_id_from_payload(payload: dict) -> str:
    return str((payload or {}).get("tenantId") or DEFAULT_TENANT)


def require_tenant_header(request: Request) -> str:
    tid = (
        request.headers.get("x-tenant-id")
        or request.headers.get("X-Tenant-Id")
        or DEFAULT_TENANT
    )
    if not tid:
        raise HTTPException(status_code=400, detail="missing_tenant_id")
    return str(tid)


def require_payload_tenant(payload: dict) -> str:
    tid = get_tenant_id_from_payload(payload)
    if not tid:
        raise HTTPException(status_code=400, detail="missing_tenant_id")
    return tid
