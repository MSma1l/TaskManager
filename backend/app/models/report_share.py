from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey
from app.core.database import Base
from app.models.base import generate_cuid


class ReportShare(Base):
    """Link public read-only ("View Account") pentru rapoarte.

    Adminul generează un token; oricine îl are vede rapoarte agregate
    (stats echipă, status proiecte, sprint performance) FĂRĂ login și
    fără permisiuni de edit. Scope:
      - "team"    → toate proiectele la care are acces creatorul
      - "project" → un singur proiect (project_id)
    """
    __tablename__ = "report_shares"

    id = Column(String, primary_key=True, default=generate_cuid)
    token = Column(String(40), nullable=False, unique=True, index=True)
    scope = Column(String(20), nullable=False, default="team")  # team | project
    project_id = Column(String, ForeignKey("projects.id"), nullable=True)
    label = Column(String(150), nullable=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
