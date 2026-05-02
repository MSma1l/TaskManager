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


class MeOut(BaseModel):
    id: str
    username: str
    email: Optional[str] = None
    fullName: Optional[str] = None
    role: str
    telegramLinked: bool
    hasPin: bool
    lastLoginAt: Optional[datetime] = None
