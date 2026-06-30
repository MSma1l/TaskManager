from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class UserCreate(BaseModel):
    username: str
    email: Optional[str] = None
    fullName: Optional[str] = None
    phone: Optional[str] = None
    telegramChatId: Optional[str] = None
    role: str = "USER"  # USER | ADMIN
    pin: Optional[str] = None  # initial PIN (4–8 digits)


class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    fullName: Optional[str] = None
    phone: Optional[str] = None
    telegramChatId: Optional[str] = None
    role: Optional[str] = None
    isActive: Optional[bool] = None
    pin: Optional[str] = None
    password: Optional[str] = None


class UserOut(BaseModel):
    id: str
    username: str
    email: Optional[str] = None
    fullName: Optional[str] = None
    phone: Optional[str] = None
    telegramChatId: Optional[str] = None
    role: str
    isActive: bool
    hasPin: bool
    lastLoginAt: Optional[datetime] = None
    createdAt: datetime
