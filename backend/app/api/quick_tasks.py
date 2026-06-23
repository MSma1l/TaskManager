"""Quick Tasks: formular PUBLIC (fara auth) + inbox admin (authed).

Rutele sunt subtiri: valideaza + autentifica + deleaga la `quick_task_service`.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.quick_task import QuickTaskCreate, QuickTaskAssign
from app.services import quick_task_service

router = APIRouter(prefix="/api/quick-tasks", tags=["quick-tasks"])


# ── Public submission (FARA auth) ─────────────────────────────────────────────

@router.post("/public")
async def submit_public(data: QuickTaskCreate, db: Session = Depends(get_db)):
    return quick_task_service.create_public(db, data.model_dump())


# ── Admin inbox (authed) ──────────────────────────────────────────────────────

@router.get("")
async def list_quick_tasks(
    status: str | None = "NEW",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return quick_task_service.list_quick_tasks(db, user.id, status=status)


@router.get("/count")
async def count_new_quick_tasks(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Badge sidebar: cate quick task-uri NEW sunt (0 pentru ne-admini)."""
    return {"count": quick_task_service.count_new(db, user.id)}


@router.post("/{quick_task_id}/assign")
async def assign_quick_task(
    quick_task_id: str,
    data: QuickTaskAssign,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return quick_task_service.assign(
        db, user.id, quick_task_id, data.projectId, data.assigneeId,
        is_global_admin=(user.role == "ADMIN"),
    )


@router.post("/{quick_task_id}/dismiss")
async def dismiss_quick_task(
    quick_task_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return quick_task_service.dismiss(db, user.id, quick_task_id)
