from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from app.core.database import Base
from app.models.base import generate_cuid


class TaskTimeEntry(Base):
    """Pontaj (time tracking) pentru un task de board.

    Fiecare rand e un interval start/stop al unui user pe un task. Cat timp
    `stopped_at` e None, intervalul e in derulare (timer activ). La oprire se
    seteaza `stopped_at` si `duration_seconds`. Un user poate avea cel mult un
    singur timer activ la un moment dat (vezi time_tracking_service).
    """

    __tablename__ = "task_time_entries"

    id = Column(String, primary_key=True, default=generate_cuid)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False, index=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    started_at = Column(DateTime, nullable=False)
    stopped_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
