from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.base import TaskStatus


class CompletionOut(BaseModel):
    id: str
    taskId: str
    weekStart: datetime
    status: TaskStatus
    completedAt: Optional[datetime] = None
    movedToDate: Optional[datetime] = None
    skipReason: Optional[str] = None
    note: Optional[str] = None

    class Config:
        from_attributes = True


class MarkDoneInput(BaseModel):
    note: Optional[str] = None


class MarkSkipInput(BaseModel):
    movedToDate: str
    skipReason: Optional[str] = None


class MarkNotDoneInput(BaseModel):
    skipReason: str


class MoveTaskInput(BaseModel):
    movedToDate: str
    note: Optional[str] = None
