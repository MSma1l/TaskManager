from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    githubUrl: Optional[str] = None
    color: Optional[str] = "#3b82f6"
    key: Optional[str] = None
    deadline: Optional[datetime] = None
    priority: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    githubUrl: Optional[str] = None
    color: Optional[str] = None
    isActive: Optional[bool] = None
    key: Optional[str] = None
    status: Optional[str] = None
    showOnToday: Optional[bool] = None
    # Trimite explicit `null` ca sa stergi deadline-ul ("pe asteptare"). Ruta foloseste
    # exclude_unset=True, deci cheia ajunge la service doar daca a fost trimisa.
    deadline: Optional[datetime] = None
    priority: Optional[str] = None
    # Pin manual de zona (URGENT|MEDIUM|NORMAL|BACKLOG); `null` = scoate pin-ul (unpin).
    pinnedZone: Optional[str] = None


class ZoneReorder(BaseModel):
    """Reordonare intra-zona (drag & drop) + optional re-pin pe zona tinta."""
    movedId: str
    targetZone: Optional[str] = None
    orderedIds: list[str] = []
    repin: bool = False
