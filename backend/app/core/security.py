import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User

security = HTTPBearer(auto_error=False)

# Valoarea-placeholder din repo. Dacă JWT_SECRET rămâne asta în producție,
# oricine poate forja un token de admin — refuzăm pornirea (vezi assert_secure_config).
_DEFAULT_JWT_SECRET = "change_this_to_a_random_secret_string"


# ── Short ephemeral codes (OTP login / link) hashing ─────────────────────────
# Codurile OTP sunt scurte și efemere (TTL 5 min, max attempts + lockout), deci
# un hash rapid keyed e suficient. NU folosi asta pentru parole/PIN-uri — vezi
# hash_password / verify_password mai jos.

def hash_secret(value: str) -> str:
    """Sha256 of secret + JWT_SECRET as salt. Fine for short ephemeral codes."""
    if value is None:
        return ""
    salted = (settings.JWT_SECRET + ":" + value).encode("utf-8")
    return hashlib.sha256(salted).hexdigest()


def verify_secret(value: str, hashed: str) -> bool:
    if not value or not hashed:
        return False
    return secrets.compare_digest(hash_secret(value), hashed)


def generate_login_code() -> str:
    """6-digit numeric code, zero-padded."""
    return f"{secrets.randbelow(1_000_000):06d}"


# ── Password / PIN hashing (KDF cu salt per-valoare) ─────────────────────────
# Folosim un KDF lent + salt random per-valoare pentru secrete de lungă durată
# (parole admin, PIN-uri). scrypt (memory-hard) când e disponibil, altfel
# pbkdf2-hmac-sha256 — ambele din stdlib, zero dependențe noi. Formatul stocat
# include algoritmul + parametrii, deci verificarea e self-describing și putem
# face upgrade transparent de la hash-urile vechi (SHA256) la login.

_SCRYPT_N = 2 ** 14
_SCRYPT_R = 8
_SCRYPT_P = 1
_PBKDF2_ITERS = 240_000


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")


def _ub64(text: str) -> bytes:
    return base64.b64decode(text.encode("ascii"))


def hash_password(value: str) -> str:
    """Hash a long-lived secret (password / PIN) with a per-value random salt.

    Returns a self-describing string: ``scrypt$N$r$p$salt$dk`` (or a pbkdf2
    variant if scrypt is unavailable on the platform).
    """
    if not value:
        return ""
    salt = secrets.token_bytes(16)
    try:
        dk = hashlib.scrypt(
            value.encode("utf-8"), salt=salt,
            n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=32,
        )
        return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${_b64(salt)}${_b64(dk)}"
    except (ValueError, MemoryError):
        # scrypt poate eșua dacă OpenSSL nu are memoria cerută — fallback robust.
        dk = hashlib.pbkdf2_hmac("sha256", value.encode("utf-8"), salt, _PBKDF2_ITERS)
        return f"pbkdf2${_PBKDF2_ITERS}${_b64(salt)}${_b64(dk)}"


def verify_password(value: str, hashed: str) -> bool:
    """Verify a password/PIN against any supported format.

    Supports the new KDF formats AND the legacy SHA256 (`hash_secret`) format,
    so existing users keep logging in while we upgrade their hash on success.
    """
    if not value or not hashed:
        return False
    try:
        if hashed.startswith("scrypt$"):
            _, n, r, p, salt_b64, dk_b64 = hashed.split("$")
            dk = hashlib.scrypt(
                value.encode("utf-8"), salt=_ub64(salt_b64),
                n=int(n), r=int(r), p=int(p), dklen=len(_ub64(dk_b64)),
            )
            return hmac.compare_digest(dk, _ub64(dk_b64))
        if hashed.startswith("pbkdf2$"):
            _, iters, salt_b64, dk_b64 = hashed.split("$")
            dk = hashlib.pbkdf2_hmac(
                "sha256", value.encode("utf-8"), _ub64(salt_b64), int(iters),
                dklen=len(_ub64(dk_b64)),
            )
            return hmac.compare_digest(dk, _ub64(dk_b64))
    except (ValueError, MemoryError):
        return False
    # Legacy SHA256 format (hex digest) — verify with the old scheme.
    return verify_secret(value, hashed)


def password_needs_rehash(hashed: str) -> bool:
    """True if a stored hash is in a legacy/weaker format and should be upgraded
    to the current KDF the next time we have the plaintext (i.e. on login)."""
    return bool(hashed) and not (hashed.startswith("scrypt$") or hashed.startswith("pbkdf2$"))


# ── Boot-time config validation ──────────────────────────────────────────────

def jwt_secret_is_weak() -> bool:
    return (not settings.JWT_SECRET) or settings.JWT_SECRET == _DEFAULT_JWT_SECRET or len(settings.JWT_SECRET) < 32


def assert_secure_config() -> None:
    """Refuse to boot in production with an insecure JWT secret.

    In dev/test we only warn, so the checked-in default keeps local work and
    the test suite running.
    """
    if jwt_secret_is_weak():
        env = (settings.NODE_ENV or "development").strip().lower()
        msg = (
            "JWT_SECRET nesigur: setează o valoare random de minim 32 de caractere "
            "(ex. `python -c \"import secrets; print(secrets.token_urlsafe(48))\"`)."
        )
        if env == "production":
            raise RuntimeError(msg)
        print(f"[SECURITY][WARN] {msg}")


# ── JWT helpers ──────────────────────────────────────────────────────────────

def issue_token(user: User, ttl_hours: Optional[int] = None) -> tuple[str, datetime]:
    ttl = ttl_hours if ttl_hours is not None else settings.JWT_EXPIRE_HOURS
    expires_at = datetime.utcnow() + timedelta(hours=ttl)
    payload = {
        "sub": user.id,
        "username": user.username,
        "role": user.role,
        # token_version — bump-ul pe User invalidează toate token-urile vechi
        # (revocare la logout-all / compromitere). Lipsa claim-ului ⇒ 0.
        "tv": getattr(user, "token_version", 0) or 0,
        "exp": expires_at,
        "iat": datetime.utcnow(),
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")
    return token, expires_at


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ── FastAPI dependencies ─────────────────────────────────────────────────────

async def verify_token(credentials: HTTPAuthorizationCredentials = None, token: str = None):
    """Legacy dep — returns the decoded payload. Prefer get_current_user."""
    tok = token or (credentials.credentials if credentials else None)
    if not tok:
        raise HTTPException(status_code=401, detail="Token missing")
    return decode_token(tok)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Token missing")
    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found or disabled")
    # Revocare: dacă token_version din token e mai vechi decât cel curent al
    # userului, token-ul a fost invalidat (logout-all / compromitere).
    if int(payload.get("tv", 0) or 0) != (getattr(user, "token_version", 0) or 0):
        raise HTTPException(status_code=401, detail="Token revoked")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin only")
    return user
