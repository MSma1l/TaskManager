from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import generate_cuid


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=generate_cuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    github_url = Column(String, nullable=True)
    color = Column(String, default="#3b82f6")
    # Cheia proiectului (ex: "IA") folosita pentru numerotarea task-urilor: IA-1, IA-2...
    key = Column(String(10), nullable=True)
    task_counter = Column(Integer, nullable=False, default=0, server_default="0")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tasks = relationship("Task", back_populates="project")
    members = relationship("ProjectMember", cascade="all, delete-orphan")
