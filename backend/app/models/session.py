from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text
from app.core.database import Base


class TelegramSession(Base):
    __tablename__ = "telegram_sessions"

    chat_id = Column(String, primary_key=True)
    state = Column(Text, nullable=False)  # JSON
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
