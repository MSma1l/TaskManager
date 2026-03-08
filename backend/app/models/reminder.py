from datetime import datetime
from sqlalchemy import Column, String, DateTime
from app.core.database import Base
from app.models.base import generate_cuid


class ReminderLog(Base):
    __tablename__ = "reminder_logs"

    id = Column(String, primary_key=True, default=generate_cuid)
    task_id = Column(String, nullable=False)
    sent_at = Column(DateTime, default=datetime.utcnow)
    channel = Column(String, nullable=False)  # "telegram" | "web"
