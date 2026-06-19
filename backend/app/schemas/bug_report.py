from pydantic import BaseModel
from typing import Optional, List, Any


class BugReportCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: Optional[str] = None
    severity: Optional[str] = None
    steps: Optional[List[Any]] = None
    assigneeId: Optional[str] = None


class BugReportUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    severity: Optional[str] = None
    steps: Optional[List[Any]] = None
    assigneeId: Optional[str] = None


class AttachmentInput(BaseModel):
    imageData: str
    caption: Optional[str] = None


class CommentInput(BaseModel):
    body: str
