"""Auth service: login codes (2FA via Telegram), validation, refresh."""
import asyncio
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    generate_login_code,
    hash_secret,
    verify_secret,
    issue_token,
)
from app.models.user import User, LoginCode


def _mask_chat(chat_id: str) -> str:
    if not chat_id:
        return "necunoscut"
    if len(chat_id) <= 4:
        return "*" * len(chat_id)
    return "*" * (len(chat_id) - 4) + chat_id[-4:]


def get_user_by_username(db: Session, username: str) -> Optional[User]:
    if not username:
        return None
    return (
        db.query(User)
        .filter(User.username == username.strip().lower(), User.is_active == True)
        .first()
    )


def get_user_by_id(db: Session, user_id: str) -> Optional[User]:
    return db.query(User).filter(User.id == user_id, User.is_active == True).first()


def create_login_challenge(db: Session, user: User, purpose: str = "login") -> tuple[LoginCode, str, str]:
    """Generate a fresh code, persist its hash, return (record, plain_code, delivery_method)."""
    # Invalidate previous unused codes for this user/purpose
    db.query(LoginCode).filter(
        LoginCode.user_id == user.id,
        LoginCode.purpose == purpose,
        LoginCode.used_at.is_(None),
    ).update({"used_at": datetime.utcnow()})

    code = generate_login_code()
    record = LoginCode(
        user_id=user.id,
        code_hash=hash_secret(code),
        purpose=purpose,
        attempts=0,
        expires_at=datetime.utcnow() + timedelta(minutes=settings.LOGIN_CODE_TTL_MINUTES),
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    delivery = _deliver_code(user, code, purpose)
    return record, code, delivery


def _deliver_code(user: User, code: str, purpose: str) -> str:
    """Send the code to the user via Telegram. Falls back to console log if no chat linked."""
    label = {
        "login": "logare",
        "refresh": "reinnoire sesiune",
        "admin": "logare admin",
    }.get(purpose, purpose)

    if not user.telegram_chat_id:
        # No chat bound — print to server log so the admin/user can still proceed
        print(
            f"[AUTH] {user.username} ({label}) cod={code} — Telegram nelegat, "
            f"deschide pe server consola pentru cod."
        )
        return "console"

    text = (
        f"Cod {label} TaskManager: {code}\n"
        f"Valabil {settings.LOGIN_CODE_TTL_MINUTES} min. Nu il trimite nimanui."
    )
    try:
        from app.telegram.bot import application as bot_app

        if bot_app and bot_app.bot:
            asyncio.create_task(
                bot_app.bot.send_message(chat_id=user.telegram_chat_id, text=text)
            )
            return "telegram"
    except Exception as e:
        print(f"[AUTH] Failed to send code via Telegram: {e}")
    print(f"[AUTH] {user.username} ({label}) cod={code} — fallback console")
    return "console"


def verify_login_code(db: Session, challenge_id: str, code: str) -> Optional[User]:
    record = db.query(LoginCode).filter(LoginCode.id == challenge_id).first()
    if not record:
        return None
    if record.used_at is not None:
        return None
    if record.expires_at < datetime.utcnow():
        return None
    if record.attempts >= settings.LOGIN_CODE_MAX_ATTEMPTS:
        return None

    record.attempts += 1
    if not verify_secret((code or "").strip(), record.code_hash):
        db.commit()
        return None

    record.used_at = datetime.utcnow()
    db.commit()

    user = get_user_by_id(db, record.user_id)
    if user:
        user.last_login_at = datetime.utcnow()
        db.commit()
    return user


def refresh_with_pin(db: Session, username: str, pin: str) -> Optional[User]:
    user = get_user_by_username(db, username)
    if not user or not user.pin_hash:
        return None
    if not verify_secret((pin or "").strip(), user.pin_hash):
        return None
    user.last_login_at = datetime.utcnow()
    db.commit()
    return user


def issue_session(user: User) -> dict:
    token, expires_at = issue_token(user)
    return {
        "token": token,
        "expiresAt": expires_at,
        "role": user.role,
        "username": user.username,
        "userId": user.id,
    }


def telegram_hint(user: User) -> str:
    if user.telegram_chat_id:
        return f"Cod trimis pe Telegram (chat {_mask_chat(user.telegram_chat_id)})"
    return "Telegram nelegat — cere admin-ului sa lege chat-ul"
