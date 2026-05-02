from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, hash_secret
from app.core.config import settings
from app.models.user import User
from app.schemas.auth import (
    PinInput,
    TokenOut,
    LoginRequest,
    LoginChallengeOut,
    VerifyCodeRequest,
    RefreshRequest,
    MeOut,
    UpdateMeRequest,
)
from app.services import auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_to_me(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "fullName": user.full_name,
        "role": user.role,
        "telegramLinked": bool(user.telegram_chat_id),
        "hasPin": bool(user.pin_hash),
        "lastLoginAt": user.last_login_at,
        "theme": user.theme or "dark",
        "notificationSettings": user.notification_settings or None,
    }


# ── 2FA flow ─────────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginChallengeOut)
async def login_request_code(data: LoginRequest, db: Session = Depends(get_db)):
    """Step 1: user provides username, server sends 6-digit code via Telegram."""
    user = auth_service.get_user_by_username(db, data.username)
    if not user:
        # Generic message to avoid leaking which usernames exist
        raise HTTPException(status_code=401, detail="Utilizator invalid sau dezactivat")

    record, _code, delivered_via = auth_service.create_login_challenge(db, user, purpose="login")
    return {
        "challengeId": record.id,
        "expiresAt": record.expires_at,
        "deliveredVia": delivered_via,
        "hint": auth_service.telegram_hint(user),
    }


@router.post("/admin/login", response_model=LoginChallengeOut)
async def admin_login_request_code(data: LoginRequest, db: Session = Depends(get_db)):
    """Same as /login but only allows ADMIN users (used from /admin_task_manager)."""
    user = auth_service.get_user_by_username(db, data.username)
    if not user or user.role != "ADMIN":
        raise HTTPException(status_code=401, detail="Cont admin invalid")

    record, _code, delivered_via = auth_service.create_login_challenge(db, user, purpose="admin")
    return {
        "challengeId": record.id,
        "expiresAt": record.expires_at,
        "deliveredVia": delivered_via,
        "hint": auth_service.telegram_hint(user),
    }


@router.post("/verify", response_model=TokenOut)
async def verify_code(data: VerifyCodeRequest, db: Session = Depends(get_db)):
    """Step 2: user submits the 6-digit code, gets a 12h JWT."""
    user = auth_service.verify_login_code(db, data.challengeId, data.code)
    if not user:
        raise HTTPException(status_code=401, detail="Cod invalid sau expirat")
    return auth_service.issue_session(user)


@router.post("/refresh", response_model=TokenOut)
async def refresh(data: RefreshRequest, db: Session = Depends(get_db)):
    """Re-issue a token after the previous one expired.

    Two paths:
      - PIN refresh: requires `username` + `pin` (PIN was set in profile)
      - Code refresh: requires a fresh challengeId+code via /login first
    """
    if data.pin and data.username:
        user = auth_service.refresh_with_pin(db, data.username, data.pin)
        if not user:
            raise HTTPException(status_code=401, detail="Username sau PIN gresit")
        return auth_service.issue_session(user)

    raise HTTPException(
        status_code=400,
        detail="Pentru reinnoire trimite username+pin sau foloseste /login + /verify",
    )


@router.post("/logout")
async def logout(user: User = Depends(get_current_user)):
    """Stateless JWT — client just drops the token. Endpoint kept for symmetry."""
    return {"ok": True}


@router.get("/me", response_model=MeOut)
async def me(user: User = Depends(get_current_user)):
    return _user_to_me(user)


@router.put("/me", response_model=MeOut)
async def update_me(
    data: UpdateMeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.fullName is not None:
        user.full_name = data.fullName.strip()[:150] or None
    if data.email is not None:
        user.email = data.email.strip()[:150] or None
    if data.theme is not None:
        if data.theme not in {"dark", "light"}:
            raise HTTPException(status_code=400, detail="Tema trebuie sa fie 'dark' sau 'light'")
        user.theme = data.theme
    if data.notificationSettings is not None:
        user.notification_settings = data.notificationSettings
    db.commit()
    db.refresh(user)
    return _user_to_me(user)


@router.put("/pin")
async def set_pin(data: PinInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Set / change the fallback PIN used for token refresh."""
    pin = (data.pin or "").strip()
    if not pin.isdigit() or not (4 <= len(pin) <= 8):
        raise HTTPException(status_code=400, detail="PIN-ul trebuie sa fie 4–8 cifre")
    user.pin_hash = hash_secret(pin)
    db.commit()
    return {"ok": True}


# ── Legacy endpoint (kept so old single-PIN clients keep working) ─────────────

@router.post("/login-legacy", response_model=TokenOut)
async def legacy_login(data: PinInput, db: Session = Depends(get_db)):
    """Single-PIN login from before multi-user — finds the admin and issues a token."""
    if data.pin != settings.APP_PIN:
        raise HTTPException(status_code=401, detail="Invalid PIN")
    admin = (
        db.query(User)
        .filter(User.role == "ADMIN", User.is_active == True)
        .order_by(User.created_at.asc())
        .first()
    )
    if not admin:
        raise HTTPException(status_code=503, detail="Niciun admin configurat")
    return auth_service.issue_session(admin)
