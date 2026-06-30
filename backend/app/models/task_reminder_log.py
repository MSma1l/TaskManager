from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, UniqueConstraint
from app.core.database import Base
from app.models.base import generate_cuid


class TaskReminderLog(Base):
    """Dedup pentru remindere de task de board (ex: countdown zilnic URGENT).

    Un rand per (task, user, tip, zi) — constrangerea unica impiedica
    trimiterea de doua ori a aceluiasi reminder in aceeasi zi.
    """

    __tablename__ = "task_reminder_logs"

    id = Column(String, primary_key=True, default=generate_cuid)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False, index=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    kind = Column(String(20), nullable=False)  # ex: "URGENT_DAILY"
    sent_date = Column(String(10), nullable=False)  # "YYYY-MM-DD"
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "task_id", "user_id", "kind", "sent_date",
            name="uq_task_reminder_log",
        ),
    )
