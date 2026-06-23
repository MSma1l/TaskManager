from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel


class QuickTaskAttachment(BaseModel):
    """Screenshot sau mesaj vocal, ca data URL base64."""
    type: str  # "image" | "audio"
    data: str  # data:...;base64,...
    caption: Optional[str] = None


class QuickTaskCreate(BaseModel):
    """Payload-ul formularului PUBLIC (fara login)."""
    requesterName: str
    # Optional: submisiile doar cu voce / imagine nu au text.
    title: Optional[str] = None
    description: Optional[str] = None
    # URGENT | NORMAL | LATER — default NORMAL daca lipseste / invalid.
    priority: str = "NORMAL"
    # Screenshot-uri + mesaje vocale (optional).
    attachments: Optional[List[QuickTaskAttachment]] = None


class QuickTaskAssign(BaseModel):
    """Admin-ul preia un quick task si il distribuie la o persoana.

    `projectId` e OPTIONAL: cand lipseste, taskul intra in proiectul Birou (OFFICE).
    """
    projectId: Optional[str] = None
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
    attachments: Optional[List[Any]] = None
