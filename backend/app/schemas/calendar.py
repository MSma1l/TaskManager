from pydantic import BaseModel
from typing import Optional


class CalendarEventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    color: Optional[str] = "#3b82f6"
    eventDate: str       # "2026-03-18"
    startTime: str       # "08:00"
    endTime: str         # "09:30"


class CalendarEventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    eventDate: Optional[str] = None
    startTime: Optional[str] = None
    endTime: Optional[str] = None
