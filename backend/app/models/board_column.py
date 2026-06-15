from datetime import datetime
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey
from app.core.database import Base
from app.models.base import generate_cuid


class BoardColumn(Base):
    __tablename__ = "board_columns"

    id = Column(String, primary_key=True, default=generate_cuid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    position = Column(Integer, nullable=False, default=0)
    color = Column(String, nullable=True)
    is_done_column = Column(Boolean, nullable=False, default=False)
    # BACKLOG | PLANNED | IN_PROGRESS | DONE | APPROVED | CUSTOM (vezi ColumnType in models/base.py)
    column_type = Column(String(20), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
