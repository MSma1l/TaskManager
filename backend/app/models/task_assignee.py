from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey
from app.core.database import Base


class TaskAssignee(Base):
    """Utilizatori responsabili de un task (atribuiri multiple per task)."""
    __tablename__ = "task_assignees"

    task_id = Column(String, ForeignKey("tasks.id"), primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
