import hashlib
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


# ── Password / PIN / Code hashing ────────────────────────────────────────────

def hash_secret(value: str) -> str:
    """Sha256 of secret + JWT_SECRET as salt. Fine for short PINs / codes."""
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


# ── JWT helpers ──────────────────────────────────────────────────────────────

def issue_token(user: User, ttl_hours: Optional[int] = None) -> tuple[str, datetime]:
    ttl = ttl_hours if ttl_hours is not None else settings.JWT_EXPIRE_HOURS
    expires_at = datetime.utcnow() + timedelta(hours=ttl)
    payload = {
        "sub": user.id,
        "username": user.username,
        "role": user.role,
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
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin only")
    return user
