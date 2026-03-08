from pydantic import BaseModel
from typing import Optional


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    githubUrl: Optional[str] = None
    color: Optional[str] = "#3b82f6"


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    githubUrl: Optional[str] = None
    color: Optional[str] = None
    isActive: Optional[bool] = None
