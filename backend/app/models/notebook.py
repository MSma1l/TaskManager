import enum
from datetime import datetime
from sqlalchemy import Column, String, Integer, SmallInteger, Boolean, DateTime, Text, ForeignKey, Enum
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import generate_cuid


class NoteType(str, enum.Enum):
    STEP = "step"           # Time management - free step
    TASK = "task"           # Time management - task with status
    IDEA = "idea"           # Ideas section


class TaskStatus(str, enum.Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class NotebookTopic(Base):
    __tablename__ = "nb_topics"

    id = Column(String, primary_key=True, default=generate_cuid)
    user_id = Column(String, nullable=False)  # telegram chat_id or web user
    name = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)
    emoji = Column(String(10), nullable=True)
    is_predefined = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    notes = relationship("NotebookNote", back_populates="topic")


class NotebookNote(Base):
    __tablename__ = "nb_notes"

    id = Column(String, primary_key=True, default=generate_cuid)
    user_id = Column(String, nullable=False)
    note_type = Column(String(20), nullable=False)  # step, task, idea
    topic_id = Column(String, ForeignKey("nb_topics.id"), nullable=True)
    content = Column(Text, nullable=False)
    step_order = Column(SmallInteger, nullable=True)
    task_status = Column(String(20), nullable=True)  # todo, in_progress, done
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    topic = relationship("NotebookTopic", back_populates="notes")
    history = relationship("NotebookNoteHistory", back_populates="note", order_by="NotebookNoteHistory.edited_at.desc()")


class NotebookNoteHistory(Base):
    __tablename__ = "nb_note_history"

    id = Column(String, primary_key=True, default=generate_cuid)
    note_id = Column(String, ForeignKey("nb_notes.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    edited_at = Column(DateTime, default=datetime.utcnow)

    note = relationship("NotebookNote", back_populates="history")
