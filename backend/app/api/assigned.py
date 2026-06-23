"""View-ul "Repartizate": taskurile atribuite mie din toate proiectele (fara Birou),
grupate pe zone de workflow, plus sectiunea de arhiva (taskuri Verificate)."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services import assigned_service

router = APIRouter(prefix="/api/assigned", tags=["assigned"])


@router.get("/board")
async def get_assigned_board(
    projectId: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return assigned_service.get_assigned_board(db, user.id, project_id=projectId)
