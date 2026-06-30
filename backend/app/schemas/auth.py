from datetime import datetime
from pydantic import BaseModel
from typing import Optional


# Legacy single-PIN login (kept so old clients still work)
class PinInput(BaseModel):
    pin: str


class TokenOut(BaseModel):
    token: str
    expiresAt: Optional[datetime] = None
    role: Optional[str] = None
    username: Optional[str] = None
    userId: Optional[str] = None


# 2FA flow
class LoginRequest(BaseModel):
    username: str


class LoginChallengeOut(BaseModel):
    challengeId: str
    expiresAt: datetime
    deliveredVia: str  # "telegram" | "console" (when no chat_id linked)
    hint: Optional[str] = None  # e.g. "Cod trimis pe Telegram (chat ****1234)"


class VerifyCodeRequest(BaseModel):
    challengeId: str
    code: str


class RefreshRequest(BaseModel):
    """Refresh after token expiry. Either supply a fresh 2FA code, or your PIN."""
    code: Optional[str] = None
    pin: Optional[str] = None
    username: Optional[str] = None  # required when token has fully expired


class AdminPasswordLoginRequest(BaseModel):
    username: str
    password: str


class SignupRequest(BaseModel):
    """Self-signup fără aprobare admin: username + parolă + nume afișat."""
    username: str
    password: str
    fullName: str
    email: Optional[str] = None


class SetPasswordRequest(BaseModel):
    password: str


class UsernameUpdateRequest(BaseModel):
    username: str


class MeOut(BaseModel):
    id: str
    username: str
    email: Optional[str] = None
    fullName: Optional[str] = None
    role: str
    telegramLinked: bool
    hasPin: bool
    lastLoginAt: Optional[datetime] = None
    theme: str = "dark"
    language: str = "ro"
    notificationSettings: Optional[dict] = None
    mustChangePassword: bool = False
    avatarUrl: Optional[str] = None   # /api/users/{id}/avatar?v={n} sau None (fara avatar)


class UpdateMeRequest(BaseModel):
    fullName: Optional[str] = None
    email: Optional[str] = None
    theme: Optional[str] = None       # "dark" | "light"
    language: Optional[str] = None    # "ro" | "ru"
    notificationSettings: Optional[dict] = None
    # avatar: data URL base64 (data:image/...). "" = sterge avatarul. None = neschimbat.
    avatar: Optional[str] = None
