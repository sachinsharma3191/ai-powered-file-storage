import os, base64, json
from cryptography.fernet import Fernet

# Field-level encryption for PHI. Use a stable key in env.
# Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
PHI_FERNET_KEY = os.getenv("PHI_FERNET_KEY", "")
if not PHI_FERNET_KEY:
    PHI_FERNET_KEY = Fernet.generate_key()
else:
    PHI_FERNET_KEY = PHI_FERNET_KEY.encode("utf-8") if isinstance(PHI_FERNET_KEY, str) else PHI_FERNET_KEY

try:
    _fernet = Fernet(PHI_FERNET_KEY)
except Exception:
    _fernet = Fernet(Fernet.generate_key())


def encrypt_str(s: str) -> str:
    if s is None:
        return ""
    return _fernet.encrypt(s.encode("utf-8")).decode("utf-8")


def decrypt_str(token: str) -> str:
    if not token:
        return ""
    return _fernet.decrypt(token.encode("utf-8")).decode("utf-8")


def encrypt_json(obj: dict) -> str:
    return encrypt_str(json.dumps(obj, ensure_ascii=False))


def decrypt_json(token: str) -> dict:
    s = decrypt_str(token)
    return json.loads(s) if s else {}
