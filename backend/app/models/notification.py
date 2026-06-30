"""Notificare in-app persistată (centru de notificări / clopoțel).

Distinctă de reminderele calendar/task (care sunt calculate la poll și trimise
ca push în browser). Aici stocăm evenimente: „adăugat în proiect", „task atribuit"
etc. `is_read` e flag-ul de ciclu de viață (fără soft-delete, ca task_comments).
"""
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Text, JSON
from app.core.database import Base
from app.models.base import generate_cuid


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String, primary_key=True, default=generate_cuid)
    user_id = Column(String, nullable=False, index=True)   # destinatarul
    type = Column(String(40), nullable=False)              # PROJECT_ADDED | TASK_ASSIGNED
    title = Column(String, nullable=False)
    body = Column(Text, nullable=True)
    link = Column(String, nullable=True)                   # ruta frontend, ex. /projects/<id>/board
    meta = Column(JSON, nullable=True)                     # {projectId, taskId, actorId}
    priority = Column(String(20), nullable=False, default="STANDARD", server_default="STANDARD")  # STANDARD | URGENT
    is_read = Column(Boolean, nullable=False, default=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    read_at = Column(DateTime, nullable=True)
