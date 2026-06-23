"""Board-ul comun "Astazi" (Today): taskurile atribuite userului curent din
proiectele marcate show_on_today=True sau din Birou, grupate pe zone de workflow.

Acelasi shape ca /api/assigned/board (zones / projects / archived)."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services import today_service

router = APIRouter(prefix="/api/today", tags=["today"])


@router.get("/board")
async def get_today_board(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return today_service.get_today_board(db, user.id)
