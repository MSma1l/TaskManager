from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.sprint import SprintCreate, SprintUpdate
from app.services import sprint_service

router = APIRouter(prefix="/api/projects/{project_id}/sprints", tags=["sprints"])

# Router separat pentru backlog (alt prefix sub acelasi proiect).
backlog_router = APIRouter(prefix="/api/projects/{project_id}", tags=["sprints"])


@router.get("")
async def list_sprints(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return sprint_service.list_sprints(db, user.id, project_id)


@router.post("")
async def create_sprint(
    project_id: str,
    data: SprintCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return sprint_service.create_sprint(db, user.id, project_id, data.model_dump())


@router.put("/{sprint_id}")
async def update_sprint(
    project_id: str,
    sprint_id: str,
    data: SprintUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return sprint_service.update_sprint(
        db, user.id, project_id, sprint_id, data.model_dump(exclude_unset=True)
    )


@router.delete("/{sprint_id}")
async def delete_sprint(
    project_id: str,
    sprint_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sprint_service.delete_sprint(db, user.id, project_id, sprint_id)
    return {"message": "Sprint sters"}


@router.post("/{sprint_id}/start")
async def start_sprint(
    project_id: str,
    sprint_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return sprint_service.start_sprint(db, user.id, project_id, sprint_id)


@router.post("/{sprint_id}/complete")
async def complete_sprint(
    project_id: str,
    sprint_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return sprint_service.complete_sprint(db, user.id, project_id, sprint_id)


@router.post("/{sprint_id}/tasks/{task_id}")
async def add_task_to_sprint(
    project_id: str,
    sprint_id: str,
    task_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return sprint_service.add_task_to_sprint(db, user.id, project_id, sprint_id, task_id)


@router.delete("/{sprint_id}/tasks/{task_id}")
async def remove_task_from_sprint(
    project_id: str,
    sprint_id: str,
    task_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return sprint_service.remove_task_from_sprint(db, user.id, project_id, sprint_id, task_id)


@backlog_router.get("/backlog")
async def list_backlog(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return sprint_service.list_backlog(db, user.id, project_id)
