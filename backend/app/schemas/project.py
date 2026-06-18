from pydantic import BaseModel
from typing import Optional


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    githubUrl: Optional[str] = None
    color: Optional[str] = "#3b82f6"
    key: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    githubUrl: Optional[str] = None
    color: Optional[str] = None
    isActive: Optional[bool] = None
    key: Optional[str] = None
    status: Optional[str] = None
