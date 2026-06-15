from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, UniqueConstraint
from app.core.database import Base
from app.models.base import generate_cuid


class ProjectMember(Base):
    __tablename__ = "project_members"

    id = Column(String, primary_key=True, default=generate_cuid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String(20), nullable=False, default="MEMBER")  # OWNER | ADMIN | MEMBER | VIEWER
    # Capacitate (story points) per sprint pe care si-o asuma membrul
    capacity_points = Column(Integer, nullable=False, default=10, server_default="10")
    invited_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_member"),
    )
