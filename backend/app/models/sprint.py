from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, ForeignKey
from app.core.database import Base
from app.models.base import generate_cuid


class Sprint(Base):
    __tablename__ = "sprints"

    id = Column(String, primary_key=True, default=generate_cuid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    goal = Column(Text, nullable=True)
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    # PLANNED | ACTIVE | COMPLETED
    status = Column(String(20), nullable=False, default="PLANNED", server_default="PLANNED")
    created_at = Column(DateTime, default=datetime.utcnow)
