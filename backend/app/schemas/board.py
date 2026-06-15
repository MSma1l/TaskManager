from pydantic import BaseModel
from typing import Optional


class ColumnCreate(BaseModel):
    name: str
    color: Optional[str] = None
    columnType: Optional[str] = None


class ColumnUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    position: Optional[int] = None
    isDoneColumn: Optional[bool] = None
    columnType: Optional[str] = None


class BoardTaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    columnId: str
    assigneeId: Optional[str] = None
    priority: Optional[str] = "MEDIUM"
    labelIds: list[str] = []
    dueDate: Optional[str] = None
    estimateMinutes: Optional[int] = None
    storyPoints: Optional[int] = None


class BoardTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    labelIds: Optional[list[str]] = None
    dueDate: Optional[str] = None
    estimateMinutes: Optional[int] = None
    storyPoints: Optional[int] = None


class TaskTransition(BaseModel):
    action: str
    estimateMinutes: Optional[int] = None
    dayOfWeek: Optional[int] = None
    scheduledDate: Optional[str] = None
    reminderTime: Optional[str] = None


class MoveTask(BaseModel):
    toColumnId: str
    toIndex: int


class AssignTask(BaseModel):
    assigneeId: Optional[str] = None


class LabelCreate(BaseModel):
    name: str
    color: str = "#3b82f6"
