from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey
from app.core.database import Base


class TaskWatcher(Base):
    """Utilizatori care urmaresc un task (primesc notificari la comentarii noi)."""
    __tablename__ = "task_watchers"

    task_id = Column(String, ForeignKey("tasks.id"), primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
