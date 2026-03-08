from fastapi import APIRouter, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import verify_token
from app.services import stats_service

router = APIRouter(prefix="/api/stats", tags=["stats"])
security = HTTPBearer()


@router.get("/weekly")
async def weekly_stats(
    weekStart: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    return stats_service.get_weekly_stats(db, weekStart)


@router.get("/history")
async def history(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    return stats_service.get_history(db)


@router.get("/streaks")
async def streaks(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    return stats_service.get_streaks(db)


@router.get("/missed")
async def missed(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    return stats_service.get_missed(db)
