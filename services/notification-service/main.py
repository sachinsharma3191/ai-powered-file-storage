import os, json, smtplib
from email.message import EmailMessage
from fastapi import FastAPI, Request
from pydantic import BaseModel

app = FastAPI(title="Notification Service", version="v41")

# Email (optional)
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", "noreply@example.com")
SMTP_TO_DEFAULT = os.getenv("SMTP_TO_DEFAULT", "")

# Webhook (optional)
ALERT_WEBHOOK_URL = os.getenv("ALERT_WEBHOOK_URL", "")


# Azure-friendly: structured JSON logs (Azure Container Apps / App Service picks up stdout)
def _log(event: str, payload: dict):
    print(json.dumps({"event": event, **(payload or {})}, default=str), flush=True)


def _send_email(subject: str, body: str, to_addr: str):
    if not SMTP_HOST or not to_addr:
        return {"sent": False, "reason": "smtp_not_configured"}
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = to_addr
    msg.set_content(body)
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as s:
        s.starttls()
        if SMTP_USER:
            s.login(SMTP_USER, SMTP_PASS)
        s.send_message(msg)
    return {"sent": True, "to": to_addr}


def _send_webhook(payload: dict):
    if not ALERT_WEBHOOK_URL:
        return {"sent": False, "reason": "webhook_not_configured"}
    import requests

    r = requests.post(ALERT_WEBHOOK_URL, json=payload, timeout=5)
    return {"sent": True, "status": r.status_code}


class NotifyReq(BaseModel):
    event: str
    payload: dict = {}
    emailTo: str | None = None
    subject: str | None = None


@app.post("/notify")
def notify(req: NotifyReq, request: Request = None):
    _log(req.event, req.payload)
    out = {"ok": True, "event": req.event}
    # webhook
    try:
        out["webhook"] = _send_webhook({"event": req.event, **req.payload})
    except Exception as e:
        out["webhook"] = {"sent": False, "error": str(e)}
    # email
    to_addr = req.emailTo or SMTP_TO_DEFAULT
    subj = req.subject or f"[HospitalAI] {req.event}"
    body = json.dumps(req.payload, indent=2, default=str)
    try:
        out["email"] = _send_email(subj, body, to_addr)
    except Exception as e:
        out["email"] = {"sent": False, "error": str(e)}
    return out
