from datetime import datetime, date
from pydantic import BaseModel
from typing import Optional, List


class AttendeeIn(BaseModel):
    name: str
    email: Optional[str] = None
    telegramChatId: Optional[str] = None


class CalendarEventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    color: Optional[str] = "#3b82f6"
    eventDate: str
    startTime: str
    endTime: str

    eventType: Optional[str] = "personal"
    location: Optional[str] = None
    meetingUrl: Optional[str] = None
    isAllDay: Optional[bool] = False
    eventStatus: Optional[str] = "CONFIRMED"

    recurrenceRule: Optional[str] = None
    recurrenceUntil: Optional[str] = None

    reminderMinutes: Optional[List[int]] = None
    attendees: Optional[List[AttendeeIn]] = None
    categoryId: Optional[str] = None


class CalendarEventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    eventDate: Optional[str] = None
    startTime: Optional[str] = None
    endTime: Optional[str] = None

    eventType: Optional[str] = None
    location: Optional[str] = None
    meetingUrl: Optional[str] = None
    isAllDay: Optional[bool] = None
    eventStatus: Optional[str] = None

    recurrenceRule: Optional[str] = None
    recurrenceUntil: Optional[str] = None

    reminderMinutes: Optional[List[int]] = None
    attendees: Optional[List[AttendeeIn]] = None
    categoryId: Optional[str] = None


class EventCategoryCreate(BaseModel):
    name: str
    color: Optional[str] = "#3b82f6"
    icon: Optional[str] = None
    isVisible: Optional[bool] = True


class EventCategoryUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    isVisible: Optional[bool] = None
