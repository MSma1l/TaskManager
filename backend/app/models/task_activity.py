from datetime import datetime
from sqlalchemy import Column, String, DateTime, JSON, ForeignKey
from app.core.database import Base
from app.models.base import generate_cuid


class TaskActivity(Base):
    """Jurnal de activitate per task / proiect (CREATED, MOVED, COMMENTED ...)."""
    __tablename__ = "task_activities"

    id = Column(String, primary_key=True, default=generate_cuid)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False, index=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)  # actorul (poate fi sistem)
    action = Column(String(40), nullable=False)
    meta = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
