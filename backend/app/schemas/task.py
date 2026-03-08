from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.base import TaskStatus
from app.schemas.category import CategoryOut
from app.schemas.completion import CompletionOut


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    categoryId: str
    dayOfWeek: int
    scheduledDate: Optional[str] = None
    reminderTime: Optional[str] = None
    isRecurring: Optional[bool] = False
    priority: Optional[str] = "MEDIUM"
    estimatedMinutes: Optional[int] = None
    projectId: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    categoryId: Optional[str] = None
    dayOfWeek: Optional[int] = None
    scheduledDate: Optional[str] = None
    reminderTime: Optional[str] = None
    isRecurring: Optional[bool] = None
    priority: Optional[str] = None
    estimatedMinutes: Optional[int] = None
    projectId: Optional[str] = None


class TaskOut(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    categoryId: str
    category: CategoryOut
    dayOfWeek: int
    scheduledDate: Optional[datetime] = None
    reminderTime: Optional[str] = None
    isRecurring: bool
    isActive: bool
    priority: str = "MEDIUM"
    estimatedMinutes: Optional[int] = None
    completions: list[CompletionOut] = []

    class Config:
        from_attributes = True
