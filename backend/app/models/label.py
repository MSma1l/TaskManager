from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey
from app.core.database import Base
from app.models.base import generate_cuid


class Label(Base):
    __tablename__ = "labels"

    id = Column(String, primary_key=True, default=generate_cuid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    color = Column(String, nullable=False, default="#3b82f6")
    created_at = Column(DateTime, default=datetime.utcnow)


class TaskLabel(Base):
    __tablename__ = "task_labels"

    task_id = Column(String, ForeignKey("tasks.id"), primary_key=True, index=True)
    label_id = Column(String, ForeignKey("labels.id"), primary_key=True, index=True)
