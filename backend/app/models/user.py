from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Integer, JSON, Text
from sqlalchemy.orm import deferred
from app.core.database import Base
from app.models.base import generate_cuid


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_cuid)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(150), unique=True, nullable=True, index=True)
    full_name = Column(String(150), nullable=True)
    phone = Column(String(40), nullable=True)
    telegram_chat_id = Column(String(50), nullable=True, index=True)
    role = Column(String(20), nullable=False, default="USER")  # USER | ADMIN
    pin_hash = Column(String(200), nullable=True)
    password_hash = Column(String(200), nullable=True)  # admins log in with username + password (skips Telegram 2FA)
    # Secret token for the read-only iCal (.ics) feed subscription (Google/Apple/Outlook).
    # Stable per user; rotated only on demand. Acts as a bearer for the public feed URL.
    calendar_token = Column(String(64), unique=True, nullable=True, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    last_login_at = Column(DateTime, nullable=True)

    # Avatar de profil: data URL base64 (data:image/...;base64,...). DEFERRED ca sa
    # NU se incarce in listari/board (poll la 5s) — doar endpoint-ul de avatar il atinge.
    avatar = deferred(Column(Text, nullable=True))
    # Versiune avatar: bumped la fiecare schimbare; 0 = fara avatar. Coloana normala
    # (incarcata cu randul) folosita pentru cache-busting (?v=) + check ieftin "are avatar".
    avatar_version = Column(Integer, nullable=False, default=0, server_default="0")

    # Securitate: brute-force lockout + revocare token + forțare schimbare parolă
    failed_login_attempts = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime, nullable=True)
    token_version = Column(Integer, nullable=False, default=0)
    must_change_password = Column(Boolean, nullable=False, default=False)

    # Preferences
    theme = Column(String(20), nullable=False, default="dark")  # dark | light
    language = Column(String(5), nullable=False, default="ro")   # ro | ru
    notification_settings = Column(JSON, nullable=True)
    # { "telegram": true, "web": true, "doNotDisturbStart": "22:00", "doNotDisturbEnd": "07:00",
    #   "defaultReminderMinutes": [15] }

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class LoginCode(Base):
    """One-time 6-digit code sent via Telegram for 2FA login or token refresh."""
    __tablename__ = "login_codes"

    id = Column(String, primary_key=True, default=generate_cuid)
    user_id = Column(String, nullable=False, index=True)
    code_hash = Column(String(200), nullable=False)
    purpose = Column(String(20), nullable=False, default="login")  # login | refresh | admin
    attempts = Column(Integer, default=0, nullable=False)
    used_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
