from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Text, Date, ForeignKey, JSON
from app.core.database import Base
from app.models.base import generate_cuid


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id = Column(String, primary_key=True, default=generate_cuid)
    user_id = Column(String, nullable=False, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    color = Column(String(20), nullable=True, default="#3b82f6")

    # Outlook-style metadata
    event_type = Column(String(20), nullable=False, default="personal")
    # personal | meeting_online | meeting_in_person | appointment | reminder | task
    location = Column(String(255), nullable=True)
    meeting_url = Column(String(500), nullable=True)
    is_all_day = Column(Boolean, default=False, nullable=False)
    event_status = Column(String(20), default="CONFIRMED", nullable=False)
    # CONFIRMED | TENTATIVE | CANCELLED

    # Recurrence (simple): DAILY | WEEKLY | MONTHLY | None
    recurrence_rule = Column(String(20), nullable=True)
    recurrence_until = Column(Date, nullable=True)

    # Multi-reminder offsets (e.g. [15, 60] = 15min and 1h before)
    reminder_minutes = Column(JSON, nullable=True)
    # Attendees list — [{ "name": "...", "email": "...", "telegramChatId": "..." }, ...]
    attendees = Column(JSON, nullable=True)

    category_id = Column(String, ForeignKey("event_categories.id"), nullable=True)

    event_date = Column(Date, nullable=False)
    start_time = Column(String(5), nullable=False)   # "08:00"
    end_time = Column(String(5), nullable=False)     # "09:30"

    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class EventCategory(Base):
    __tablename__ = "event_categories"

    id = Column(String, primary_key=True, default=generate_cuid)
    user_id = Column(String, nullable=False, index=True)
    name = Column(String(80), nullable=False)
    color = Column(String(20), nullable=False, default="#3b82f6")
    icon = Column(String(20), nullable=True)
    is_visible = Column(Boolean, default=True, nullable=False)
    is_default = Column(Boolean, default=False, nullable=False)
    sort_order = Column(String(10), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CalendarReminderLog(Base):
    """Track which (event, offset_min) reminders have already fired today."""
    __tablename__ = "calendar_reminder_logs"

    id = Column(String, primary_key=True, default=generate_cuid)
    event_id = Column(String, nullable=False, index=True)
    occurrence_date = Column(Date, nullable=False)  # for recurring events
    minutes_before = Column(String(10), nullable=False)  # stringified int
    channel = Column(String(20), nullable=False)  # telegram | web
    fired_at = Column(DateTime, default=datetime.utcnow, nullable=False)
