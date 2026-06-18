from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class QuickTaskCreate(BaseModel):
    """Payload-ul formularului PUBLIC (fara login)."""
    requesterName: str
    title: str
    description: Optional[str] = None
    # URGENT | NORMAL | LATER — default NORMAL daca lipseste / invalid.
    priority: str = "NORMAL"


class QuickTaskAssign(BaseModel):
    """Admin-ul preia un quick task si il distribuie la proiect + persoana."""
    projectId: str
    assigneeId: str


class QuickTaskOut(BaseModel):
    id: str
    requesterName: str
    title: str
    description: Optional[str] = None
    priority: str
    status: str
    projectId: Optional[str] = None
    assigneeId: Optional[str] = None
    taskId: Optional[str] = None
    processedByUserId: Optional[str] = None
    processedAt: Optional[datetime] = None
    createdAt: Optional[datetime] = None
