from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Text, Date
from app.core.database import Base
from app.models.base import generate_cuid


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id = Column(String, primary_key=True, default=generate_cuid)
    user_id = Column(String, nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    color = Column(String(20), nullable=True, default="#3b82f6")  # blue-500
    event_date = Column(Date, nullable=False)
    start_time = Column(String(5), nullable=False)   # "08:00" format HH:MM
    end_time = Column(String(5), nullable=False)      # "09:30"
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
