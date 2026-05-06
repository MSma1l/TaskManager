from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, hash_secret, verify_secret
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
    AdminPasswordLoginRequest,
    SetPasswordRequest,
    UsernameUpdateRequest,
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
        "language": getattr(user, "language", None) or "ro",
        "notificationSettings": user.notification_settings or None,
    }


# ── 2FA flow ─────────────────────────────────────────────────────────────────

# ── Telegram Mini App (WebApp) ───────────────────────────────────────────────

def _verify_telegram_init_data(init_data: str, bot_token: str) -> dict | None:
    """Validate Telegram WebApp initData per the official spec
    (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).

    Returns the parsed dict on success, or None if HMAC mismatches / data is
    older than 24h. NEVER trust client-provided initData without this check.
    """
    import hmac
    import hashlib
    import time
    from urllib.parse import parse_qsl

    if not init_data or not bot_token:
        return None
    pairs = dict(parse_qsl(init_data, keep_blank_values=True, strict_parsing=False))
    received_hash = pairs.pop("hash", "")
    if not received_hash:
        return None

    data_check_string = "\n".join(
        f"{k}={pairs[k]}" for k in sorted(pairs.keys())
    )
    secret_key = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()
    computed = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(computed, received_hash):
        return None

    auth_date = int(pairs.get("auth_date", "0") or "0")
    if auth_date and time.time() - auth_date > 24 * 3600:
        return None
    return pairs


@router.post("/telegram-webapp")
async def telegram_webapp_auth(payload: dict, db: Session = Depends(get_db)):
    """Authenticate a Telegram Mini App user via signed initData.

    Accepts {"initData": "<raw query string from Telegram.WebApp.initData>"}
    and returns a session token if the chat_id matches an existing linked
    user. If no user exists, returns 404 with a hint to /register in the bot.
    """
    import json
    init_data = (payload or {}).get("initData") or ""
    bot_token = (settings.TELEGRAM_BOT_TOKEN or "").strip()
    parsed = _verify_telegram_init_data(init_data, bot_token)
    if parsed is None:
        # Try the admin bot token as a fallback (for the admin Mini App door)
        admin_token = (settings.ADMIN_TELEGRAM_BOT_TOKEN or "").strip()
        if admin_token:
            parsed = _verify_telegram_init_data(init_data, admin_token)
    if parsed is None:
        raise HTTPException(status_code=401, detail="initData invalid sau expirat")

    user_field = parsed.get("user")
    if not user_field:
        raise HTTPException(status_code=400, detail="initData fara campul user")
    try:
        tg_user = json.loads(user_field)
    except Exception:
        raise HTTPException(status_code=400, detail="initData.user nu se poate parsa")

    chat_id = str(tg_user.get("id") or "")
    if not chat_id:
        raise HTTPException(status_code=400, detail="Telegram user.id lipseste")

    user = (
        db.query(User)
        .filter(User.telegram_chat_id == chat_id, User.is_active == True)
        .first()
    )
    if not user:
        raise HTTPException(
            status_code=404,
            detail="Niciun cont legat la acest Telegram. Foloseste /register in bot.",
        )

    from datetime import datetime
    user.last_login_at = datetime.utcnow()
    db.commit()
    return auth_service.issue_session(user)


# ── QR scan-to-login ─────────────────────────────────────────────────────────

@router.post("/qr/init")
async def qr_init(db: Session = Depends(get_db)):
    """Desktop creates a fresh QR session. Returns the id (encoded in the QR)
    and how long it is valid. No authentication needed — the session is
    useless until a logged-in mobile approves it."""
    from datetime import datetime, timedelta
    from app.models.qr_session import QRSession

    # Cleanup: expire stale rows (>15 min) so the table doesn't grow forever
    cutoff = datetime.utcnow() - timedelta(minutes=15)
    db.query(QRSession).filter(QRSession.created_at < cutoff).delete()

    record = QRSession(
        status="PENDING",
        expires_at=datetime.utcnow() + timedelta(minutes=5),
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    # Build a Telegram deep-link the desktop's QR will encode. Scanning the
    # QR opens the bot directly with /start qr_<id> — handler approves the
    # session in the bot, so the user never has to navigate the web app.
    bot = (settings.TELEGRAM_BOT_USERNAME or "").strip().lstrip("@")
    telegram_deep_link = f"https://t.me/{bot}?start=qr_{record.id}" if bot else None

    return {
        "qrId": record.id,
        "expiresAt": record.expires_at.isoformat(),
        "ttlSeconds": 300,
        "telegramDeepLink": telegram_deep_link,
    }


@router.get("/qr/status")
async def qr_status(qrId: str, db: Session = Depends(get_db)):
    """Desktop polls this every ~2s. When approved, returns the freshly-issued
    session token and marks the QR session CONSUMED so it can't be re-used."""
    from datetime import datetime
    from app.models.qr_session import QRSession

    record = db.query(QRSession).filter(QRSession.id == qrId).first()
    if not record:
        raise HTTPException(status_code=404, detail="QR session inexistenta")

    if record.expires_at < datetime.utcnow() and record.status not in {"APPROVED", "CONSUMED"}:
        record.status = "EXPIRED"
        db.commit()

    if record.status == "EXPIRED":
        return {"status": "EXPIRED"}
    if record.status == "PENDING":
        return {"status": "PENDING"}
    if record.status == "APPROVED" and record.issued_token:
        # Hand the token over once, then mark consumed
        token = record.issued_token
        expires = record.token_expires_at
        record.status = "CONSUMED"
        record.consumed_at = datetime.utcnow()
        record.issued_token = None
        db.commit()
        # Look up user info for the response
        user = db.query(User).filter(User.id == record.user_id).first()
        return {
            "status": "APPROVED",
            "token": token,
            "expiresAt": expires.isoformat() if expires else None,
            "role": user.role if user else None,
            "username": user.username if user else None,
            "userId": user.id if user else None,
        }
    if record.status == "CONSUMED":
        # Already used — desktop should restart
        return {"status": "CONSUMED"}

    return {"status": record.status}


@router.post("/qr/confirm")
async def qr_confirm(
    payload: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mobile (already logged in) confirms a desktop QR session. Server
    issues a fresh token bound to the calling user and stores it on the row;
    desktop's poll picks it up next."""
    from datetime import datetime
    from app.models.qr_session import QRSession

    qr_id = (payload or {}).get("qrId") or ""
    record = db.query(QRSession).filter(QRSession.id == qr_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="QR session inexistenta")
    if record.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="QR-ul a expirat — genereaza altul pe desktop")
    if record.status not in {"PENDING"}:
        raise HTTPException(status_code=409, detail=f"QR deja {record.status.lower()}")

    # Issue a fresh session token tied to the confirming user
    from app.core.security import issue_token
    token, exp = issue_token(user)
    record.status = "APPROVED"
    record.user_id = user.id
    record.issued_token = token
    record.token_expires_at = exp
    record.approved_at = datetime.utcnow()
    user.last_login_at = datetime.utcnow()
    db.commit()
    return {
        "ok": True,
        "username": user.username,
        "fullName": user.full_name,
    }


# ── Public, unauthenticated config the frontend reads on login pages ─────────

@router.get("/public-config")
async def public_config():
    """Public, unauthenticated config the frontend reads on login pages.
    Only exposes safe / public values (no secrets)."""
    bot = (settings.TELEGRAM_BOT_USERNAME or "").strip().lstrip("@")
    return {
        "telegramBotUsername": bot or None,
        "telegramRegisterDeepLink": f"https://t.me/{bot}?start=register" if bot else None,
        "telegramBotDeepLink": f"https://t.me/{bot}" if bot else None,
    }


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


@router.post("/admin/password-login", response_model=TokenOut)
async def admin_password_login(data: AdminPasswordLoginRequest, db: Session = Depends(get_db)):
    """Admin direct login with username + password. Bypasses Telegram 2FA."""
    user = auth_service.get_user_by_username(db, data.username)
    if not user or user.role != "ADMIN":
        raise HTTPException(status_code=401, detail="Credentiale admin invalide")
    if not user.password_hash or not verify_secret(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credentiale admin invalide")
    from datetime import datetime
    user.last_login_at = datetime.utcnow()
    db.commit()
    return auth_service.issue_session(user)


@router.post("/password-login")
async def password_login(data: AdminPasswordLoginRequest, db: Session = Depends(get_db)):
    """Combined credentials flow for any user (USER or ADMIN).

    Returns either a TokenOut (admin shortcut, no 2FA) OR a LoginChallengeOut
    asking for a Telegram code (regular users that have Telegram linked).
    The frontend dispatches based on the `kind` field in the response.
    """
    user = auth_service.get_user_by_username(db, data.username)
    if not user or not user.password_hash or not verify_secret(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Username sau parola gresita")

    # Admin: no second factor needed (already had a password)
    if user.role == "ADMIN":
        from datetime import datetime
        user.last_login_at = datetime.utcnow()
        db.commit()
        session = auth_service.issue_session(user)
        return {"kind": "session", **session}

    # Regular user with linked Telegram → require 2FA code as second factor
    if user.telegram_chat_id:
        record, _code, delivered_via = auth_service.create_login_challenge(db, user, purpose="login")
        return {
            "kind": "challenge",
            "challengeId": record.id,
            "expiresAt": record.expires_at.isoformat(),
            "deliveredVia": delivered_via,
            "hint": auth_service.telegram_hint(user),
        }

    # User without Telegram linked: password alone is enough (single factor)
    from datetime import datetime
    user.last_login_at = datetime.utcnow()
    db.commit()
    session = auth_service.issue_session(user)
    return {"kind": "session", **session}


@router.put("/password")
async def set_user_password(
    data: SetPasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """User sets / changes their own password (used for combined login flow)."""
    pwd = (data.password or "").strip()
    if len(pwd) < 6:
        raise HTTPException(status_code=400, detail="Parola minim 6 caractere")
    user.password_hash = hash_secret(pwd)
    db.commit()
    return {"ok": True}


@router.put("/admin/password", response_model=MeOut)
async def set_admin_password(
    data: SetPasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Set / change admin password. Admin-only and applies to the calling admin's own account."""
    if user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Doar adminii pot seta parola")
    pwd = (data.password or "").strip()
    if len(pwd) < 6:
        raise HTTPException(status_code=400, detail="Parola minim 6 caractere")
    user.password_hash = hash_secret(pwd)
    db.commit()
    db.refresh(user)
    return _user_to_me(user)


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
    if data.language is not None:
        if data.language not in {"ro", "ru"}:
            raise HTTPException(status_code=400, detail="Limba trebuie sa fie 'ro' sau 'ru'")
        user.language = data.language
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


# ── Username availability + change ───────────────────────────────────────────

import re

USERNAME_RE = re.compile(r"^[a-z0-9_.]{3,30}$")


@router.get("/username-available")
async def username_available(
    username: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check if a username is free. Returns {available: bool, reason?: str}.

    Rules:
      - 3–30 chars, only lowercase letters/digits/underscore/dot
      - free if no OTHER user owns it (case-insensitive) — current user
        always sees their own username as 'available' (no-op rename).
    """
    candidate = (username or "").strip().lower()
    if not candidate:
        return {"available": False, "reason": "Username gol"}
    if not USERNAME_RE.match(candidate):
        return {"available": False, "reason": "3-30 caractere: a-z, 0-9, _, ."}
    if candidate == (user.username or "").lower():
        return {"available": True, "reason": "Username actual"}
    taken = (
        db.query(User)
        .filter(User.username == candidate, User.id != user.id)
        .first()
    )
    if taken:
        return {"available": False, "reason": "Username deja folosit"}
    return {"available": True}


@router.put("/username")
async def update_username(
    data: UsernameUpdateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change own username. Validates format + uniqueness."""
    candidate = (data.username or "").strip().lower()
    if not USERNAME_RE.match(candidate):
        raise HTTPException(
            status_code=400,
            detail="Username trebuie sa aiba 3-30 caractere: a-z, 0-9, _, .",
        )
    if candidate == (user.username or "").lower():
        # No-op rename; just refresh the response.
        return _user_to_me(user)

    taken = (
        db.query(User)
        .filter(User.username == candidate, User.id != user.id)
        .first()
    )
    if taken:
        raise HTTPException(status_code=409, detail="Username deja folosit")

    user.username = candidate
    db.commit()
    db.refresh(user)
    return _user_to_me(user)


@router.post("/me/link-code")
async def generate_my_link_code(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """User generates their own /link code (no admin needed)."""
    from datetime import datetime, timedelta
    from app.core.security import generate_login_code
    from app.models.user import LoginCode

    db.query(LoginCode).filter(
        LoginCode.user_id == user.id,
        LoginCode.purpose == "link",
        LoginCode.used_at.is_(None),
    ).update({"used_at": datetime.utcnow()})

    code = generate_login_code()
    record = LoginCode(
        user_id=user.id,
        code_hash=hash_secret(code),
        purpose="link",
        expires_at=datetime.utcnow() + timedelta(minutes=30),
    )
    db.add(record)
    db.commit()
    return {
        "code": code,
        "expiresAt": record.expires_at,
        "instructions": (
            f"Trimite pe botul de Telegram: /link {code}\n"
            f"Cod valabil 30 min."
        ),
    }


@router.delete("/me/telegram")
async def unlink_telegram(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    user.telegram_chat_id = None
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
