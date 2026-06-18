from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, Boolean, ForeignKey
from app.core.database import Base
from app.models.base import generate_cuid


class QuickTask(Base):
    """Task rapid trimis din formularul PUBLIC (fără login).

    Admin-ul îl preia din inbox-ul Quick Tasks și îl distribuie:
      - îl atașează la un proiect (intră în Backlog) și
      - alege responsabilul (apare în Weekly View-ul persoanei).
    La asignare se creează un Task real, iar `task_id` îl leagă.
    """
    __tablename__ = "quick_tasks"

    id = Column(String, primary_key=True, default=generate_cuid)
    # "Nume + Prenume" pe o singură linie, așa cum vine din formular.
    requester_name = Column(String(150), nullable=False)
    title = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)
    # URGENT | NORMAL | LATER (Poate Aștepta)
    priority = Column(String(20), nullable=False, default="NORMAL")
    # NEW | ASSIGNED | DISMISSED
    status = Column(String(20), nullable=False, default="NEW", index=True)

    # Completate la asignare de către admin.
    project_id = Column(String, ForeignKey("projects.id"), nullable=True)
    assignee_id = Column(String, ForeignKey("users.id"), nullable=True)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=True)
    processed_by_user_id = Column(String, nullable=True)
    processed_at = Column(DateTime, nullable=True)

    # Anti-duplicare la notificarea admin (la fiecare minut).
    notified_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
