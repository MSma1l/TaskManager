from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class AccessRequestCreate(BaseModel):
    firstName: str
    lastName: str
    email: Optional[str] = None
    phone: Optional[str] = None
    telegramChatId: Optional[str] = None
    purpose: str = "personal"  # personal | collective
    reason: Optional[str] = None
    # Self-signup: username + parola + PIN alese de user (toate optionale).
    username: Optional[str] = None
    password: Optional[str] = None
    pin: Optional[str] = None


class AccessRequestApprove(BaseModel):
    username: Optional[str] = None  # if omitted, auto-generated from the name
    role: str = "USER"  # USER | ADMIN
    pin: Optional[str] = None  # if omitted, the user can set later


class AccessRequestReject(BaseModel):
    reason: Optional[str] = None


class AccessRequestOut(BaseModel):
    id: str
    firstName: str
    lastName: str
    email: Optional[str] = None
    phone: Optional[str] = None
    telegramChatId: Optional[str] = None
    purpose: str
    reason: Optional[str] = None
    status: str
    rejectionReason: Optional[str] = None
    processedByUserId: Optional[str] = None
    processedAt: Optional[datetime] = None
    createdUserId: Optional[str] = None
    createdAt: datetime
