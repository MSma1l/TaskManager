from datetime import datetime
from sqlalchemy import Column, String, DateTime
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import generate_cuid


class Category(Base):
    __tablename__ = "categories"

    id = Column(String, primary_key=True, default=generate_cuid)
    name = Column(String, nullable=False)
    icon = Column(String, nullable=False)
    color = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    tasks = relationship("Task", back_populates="category")
