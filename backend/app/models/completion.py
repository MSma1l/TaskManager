from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, Enum, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import generate_cuid, TaskStatus


class TaskCompletion(Base):
    __tablename__ = "task_completions"

    id = Column(String, primary_key=True, default=generate_cuid)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False)
    week_start = Column(DateTime, nullable=False)
    status = Column(Enum(TaskStatus), default=TaskStatus.PENDING, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    moved_to_date = Column(DateTime, nullable=True)
    skip_reason = Column(Text, nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    task = relationship("Task", back_populates="completions")

    __table_args__ = (
        # Unique constraint: one completion per task per week
        {"sqlite_autoincrement": False},
    )
