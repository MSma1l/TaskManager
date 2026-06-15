from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services import collaboration_service

router = APIRouter(prefix="/api/tasks/{task_id}", tags=["watchers"])


@router.post("/watch")
async def add_watcher(
    task_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    collaboration_service.add_watcher(db, user.id, task_id)
    return {"message": "Urmaresti acest task"}


@router.delete("/watch")
async def remove_watcher(
    task_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    collaboration_service.remove_watcher(db, user.id, task_id)
    return {"message": "Nu mai urmaresti acest task"}


@router.get("/watchers")
async def list_watchers(
    task_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return collaboration_service.list_watchers(db, user.id, task_id)
