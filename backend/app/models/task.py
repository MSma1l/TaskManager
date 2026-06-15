from datetime import datetime
from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import generate_cuid


class Task(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, default=generate_cuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category_id = Column(String, ForeignKey("categories.id"), nullable=True)
    day_of_week = Column(Integer, nullable=True)  # 1=Mon, 7=Sun
    scheduled_date = Column(DateTime, nullable=True)
    reminder_time = Column(String, nullable=True)  # "HH:MM"
    is_recurring = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    priority = Column(String, default="MEDIUM", nullable=False)
    estimated_minutes = Column(Integer, nullable=True)
    due_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project_id = Column(String, ForeignKey("projects.id"), nullable=True)

    # ── Board (Kanban) ──────────────────────────────────────────────
    board_column_id = Column(String, ForeignKey("board_columns.id"), nullable=True, index=True)
    board_order = Column(Integer, nullable=True)
    assignee_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    task_number = Column(Integer, nullable=True)  # numar secvential per proiect (cheie: KEY-<task_number>)

    category = relationship("Category", back_populates="tasks")
    completions = relationship("TaskCompletion", back_populates="task")
    project = relationship("Project", back_populates="tasks")
    labels = relationship("Label", secondary="task_labels")
