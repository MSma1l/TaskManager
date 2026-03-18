from pydantic import BaseModel
from typing import Optional


class TopicCreate(BaseModel):
    name: str
    emoji: Optional[str] = None
    description: Optional[str] = None


class TopicUpdate(BaseModel):
    name: Optional[str] = None
    emoji: Optional[str] = None
    description: Optional[str] = None


class NoteCreate(BaseModel):
    content: str
    topicId: Optional[str] = None
    taskStatus: Optional[str] = None


class NoteUpdate(BaseModel):
    content: Optional[str] = None
    taskStatus: Optional[str] = None
