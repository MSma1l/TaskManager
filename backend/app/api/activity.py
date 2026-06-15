from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services import collaboration_service

router = APIRouter(tags=["activity"])


@router.get("/api/tasks/{task_id}/activity")
async def list_task_activity(
    task_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return collaboration_service.list_task_activity(db, user.id, task_id)


@router.get("/api/projects/{project_id}/activity")
async def list_project_activity(
    project_id: str,
    limit: int = 50,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return collaboration_service.list_project_activity(db, user.id, project_id, limit)
