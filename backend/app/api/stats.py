from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services import stats_service

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/weekly")
async def weekly_stats(
    weekStart: str = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return stats_service.get_weekly_stats(db, weekStart, user_id=user.id)


@router.get("/history")
async def history(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return stats_service.get_history(db, user_id=user.id)


@router.get("/streaks")
async def streaks(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return stats_service.get_streaks(db, user_id=user.id)


@router.get("/missed")
async def missed(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return stats_service.get_missed(db, user_id=user.id)
