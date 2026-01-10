import os, re, hashlib
from typing import Any

RE_EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
RE_PHONE = re.compile(r"(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}")
RE_SSN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
RE_DOB = re.compile(
    r"\b(?:19|20)\d{2}[-/](?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01])\b"
)

HASH_SALT = os.getenv("PHI_HASH_SALT", "dev-salt")

DEFAULT_KEYS = {
    "name",
    "fullName",
    "firstName",
    "lastName",
    "email",
    "phone",
    "mobile",
    "ssn",
    "dob",
    "dateOfBirth",
    "address",
    "street",
    "city",
    "state",
    "zip",
    "postalCode",
    "mrn",
    "patientId",
    "memberId",
    "insuranceId",
}
EXTRA_KEYS = set([k.strip() for k in os.getenv("PHI_KEYS", "").split(",") if k.strip()])
PHI_KEYS = DEFAULT_KEYS | EXTRA_KEYS


def _hash(value: str) -> str:
    h = hashlib.sha256((HASH_SALT + value).encode("utf-8")).hexdigest()[:12]
    return f"hash:{h}"


def redact_text(s: str) -> str:
    s = RE_EMAIL.sub("[REDACTED_EMAIL]", s)
    s = RE_PHONE.sub("[REDACTED_PHONE]", s)
    s = RE_SSN.sub("[REDACTED_SSN]", s)
    s = RE_DOB.sub("[REDACTED_DOB]", s)
    return s


def redact(obj: Any) -> Any:
    if obj is None:
        return None
    if isinstance(obj, str):
        return redact_text(obj)
    if isinstance(obj, (int, float, bool)):
        return obj
    if isinstance(obj, list):
        return [redact(x) for x in obj]
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k in PHI_KEYS and v is not None:
                if isinstance(v, (str, int, float)):
                    out[k] = _hash(str(v))
                else:
                    out[k] = "[REDACTED]"
            else:
                out[k] = redact(v)
        return out
    return "[REDACTED]"
