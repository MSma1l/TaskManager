from pydantic import BaseModel
from typing import Optional


class SprintCreate(BaseModel):
    name: str
    goal: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None


class SprintUpdate(BaseModel):
    name: Optional[str] = None
    goal: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    status: Optional[str] = None
