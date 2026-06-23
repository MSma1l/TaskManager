"""Board-ul de Birou (proiectul de sistem partajat pentru Quick Tasks).

Read-only aici: mutarile de coloana, comentariile, subtaskurile si atribuirea
REFOLOSESC endpoint-urile existente de board (/api/projects/{projectId}/board/...
si /api/tasks/{taskId}/comments), folosind `projectId`-ul intors mai jos.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services import office_service

router = APIRouter(prefix="/api/office", tags=["office"])


@router.get("/board")
async def get_office_board(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return office_service.get_office_board(db, user)
