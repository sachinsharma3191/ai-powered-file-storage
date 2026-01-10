import os

from fastapi import Request, HTTPException

API_KEYS_RAW = os.getenv("API_KEYS", "dev-admin:admin").strip()
API_KEYS = {}
for item in [x.strip() for x in API_KEYS_RAW.split(",") if x.strip()]:
    if ":" in item:
        k, r = item.split(":", 1)
        API_KEYS[k.strip()] = r.strip()
    else:
        API_KEYS[item] = "admin"


def require_role(request: Request, allowed_roles: set[str]):
    key = request.headers.get("x-api-key") or request.headers.get("X-API-Key")
    if not key or key not in API_KEYS:
        raise HTTPException(status_code=401, detail="missing_or_invalid_api_key")
    role = API_KEYS[key]
    if role not in allowed_roles:
        raise HTTPException(status_code=403, detail="insufficient_role")
    return {"apiKey": key, "role": role}
