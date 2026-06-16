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
    verify_password,
    hash_password,
    password_needs_rehash,
    issue_token,
)
from app.models.user import User, LoginCode


# ── Brute-force lockout (parolă / PIN) ───────────────────────────────────────
# După MAX_FAILED încercări greșite consecutive, contul e blocat LOCKOUT_MINUTES.
# Contorul se resetează la o autentificare reușită sau după expirarea blocării.
MAX_FAILED = 5
LOCKOUT_MINUTES = 15


def account_locked(user: User) -> bool:
    locked_until = getattr(user, "locked_until", None)
    return bool(locked_until and locked_until > datetime.utcnow())


def lock_remaining_seconds(user: User) -> int:
    locked_until = getattr(user, "locked_until", None)
    if not locked_until:
        return 0
    return max(0, int((locked_until - datetime.utcnow()).total_seconds()))


def register_failed_attempt(db: Session, user: User) -> None:
    """Incrementează contorul de eșecuri; blochează contul la prag."""
    user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
    if user.failed_login_attempts >= MAX_FAILED:
        user.locked_until = datetime.utcnow() + timedelta(minutes=LOCKOUT_MINUTES)
        user.failed_login_attempts = 0
    db.commit()


def register_successful_login(db: Session, user: User) -> None:
    """Resetează lockout-ul și marchează ultima autentificare."""
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = datetime.utcnow()
    db.commit()


def verify_user_password(db: Session, user: User, password: str) -> bool:
    """Verifică parola cu KDF-ul curent; upgradează hash-ul vechi la succes."""
    if not user or not user.password_hash:
        return False
    if not verify_password((password or "").strip(), user.password_hash):
        return False
    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password((password or "").strip())
        db.commit()
    return True


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


_MD2_ESCAPE = "_*[]()~`>#+-=|{}.!"


def _md2_escape(text: str) -> str:
    """Escape every MarkdownV2 special char so plain text doesn't break the parser.
    Per https://core.telegram.org/bots/api#markdownv2-style.
    """
    return "".join("\\" + c if c in _MD2_ESCAPE else c for c in text)


def _deliver_code(user: User, code: str, purpose: str) -> str:
    """Send the code to the user via Telegram. Falls back to console log if no chat linked.

    Admins use the dedicated admin bot when configured; regular users use the main bot.
    The message is localized to the user's language and uses Markdown so the
    code is rendered as a big monospaced block — easy to copy with one tap.
    """
    lang = (getattr(user, "language", None) or "ro").strip().lower()
    if lang not in ("ro", "ru"):
        lang = "ro"

    labels = {
        "ro": {"login": "logare", "refresh": "reinnoire sesiune", "admin": "logare admin"},
        "ru": {"login": "вход", "refresh": "обновление сессии", "admin": "вход админа"},
    }
    titles = {
        "ro": "Cod {label}",
        "ru": "Код {label}",
    }
    footers = {
        "ro": "Valabil {ttl} min. Nu il trimite nimanui.",
        "ru": "Действителен {ttl} мин. Никому не отправляйте.",
    }

    label = labels[lang].get(purpose, purpose)
    title = titles[lang].format(label=label)
    footer = footers[lang].format(ttl=settings.LOGIN_CODE_TTL_MINUTES)

    if not user.telegram_chat_id:
        print(
            f"[AUTH] {user.username} ({label}) code={code} — Telegram not linked, "
            f"check server console."
        )
        return "console"

    # MarkdownV2 hero block — every plain-text segment must be escaped, but
    # the code stays inside `inline-code` (where escaping rules are simpler:
    # only ` and \ need escaping, neither of which appears in a 6-digit number).
    text = (
        f"*TaskManager*\n"
        f"_{_md2_escape(title)}_\n\n"
        f"`{code}`\n\n"
        f"{_md2_escape(footer)}"
    )
    try:
        from app.telegram.bot import _bot_for_role
        bot_app = _bot_for_role(user.role)
        if bot_app and bot_app.bot:
            asyncio.create_task(
                bot_app.bot.send_message(
                    chat_id=user.telegram_chat_id,
                    text=text,
                    parse_mode="MarkdownV2",
                )
            )
            return "telegram"
    except Exception as e:
        print(f"[AUTH] Failed to send code via Telegram: {e}")
    print(f"[AUTH] {user.username} ({label}) code={code} — fallback console")
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


class AccountLockedError(Exception):
    """Ridicată când contul e blocat temporar după prea multe eșecuri."""
    def __init__(self, retry_after: int):
        self.retry_after = retry_after
        super().__init__("account locked")


def refresh_with_pin(db: Session, username: str, pin: str) -> Optional[User]:
    user = get_user_by_username(db, username)
    if not user or not user.pin_hash:
        return None
    if account_locked(user):
        raise AccountLockedError(lock_remaining_seconds(user))
    if not verify_password((pin or "").strip(), user.pin_hash):
        register_failed_attempt(db, user)
        return None
    # Upgrade hash-ul vechi (SHA256) la KDF-ul curent, transparent.
    if password_needs_rehash(user.pin_hash):
        user.pin_hash = hash_password((pin or "").strip())
    register_successful_login(db, user)
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
