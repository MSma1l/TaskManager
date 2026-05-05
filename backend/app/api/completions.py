from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.task import Task
from app.schemas.completion import MarkDoneInput, MarkSkipInput, MarkNotDoneInput, MoveTaskInput
from app.services import completion_service

router = APIRouter(prefix="/api/completions", tags=["completions"])


def completion_to_dict(c):
    return {
        "id": c.id,
        "taskId": c.task_id,
        "weekStart": c.week_start.isoformat(),
        "status": c.status.value if hasattr(c.status, 'value') else c.status,
        "completedAt": c.completed_at.isoformat() if c.completed_at else None,
        "movedToDate": c.moved_to_date.isoformat() if c.moved_to_date else None,
        "skipReason": c.skip_reason,
        "note": c.note,
    }


def _own_or_404(db: Session, user: User, task_id: str):
    """Raise 404 if the task doesn't belong to the calling user. Hides
    existence of other users' tasks (no info-leak via 403)."""
    task = (
        db.query(Task)
        .filter(Task.id == task_id, Task.user_id == user.id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/{task_id}/done")
async def mark_done(
    task_id: str,
    data: MarkDoneInput = MarkDoneInput(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _own_or_404(db, user, task_id)
    result = completion_service.mark_done(db, task_id, data.note, data.weekStart)
    if not result:
        raise HTTPException(status_code=404, detail="Task not found")
    return completion_to_dict(result)


@router.post("/{task_id}/skip")
async def mark_skip(
    task_id: str,
    data: MarkSkipInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _own_or_404(db, user, task_id)
    result = completion_service.mark_skip(db, task_id, data.movedToDate, data.skipReason, data.weekStart)
    if not result:
        raise HTTPException(status_code=404, detail="Task not found")
    return completion_to_dict(result)


@router.post("/{task_id}/not-done")
async def mark_not_done(
    task_id: str,
    data: MarkNotDoneInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _own_or_404(db, user, task_id)
    if not data.skipReason or len(data.skipReason.strip()) == 0:
        raise HTTPException(status_code=400, detail="Reason is required")
    result = completion_service.mark_not_done(db, task_id, data.skipReason, data.weekStart)
    if not result:
        raise HTTPException(status_code=404, detail="Task not found")
    return completion_to_dict(result)


@router.post("/{task_id}/move")
async def move_task(
    task_id: str,
    data: MoveTaskInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _own_or_404(db, user, task_id)
    result = completion_service.move_task(db, task_id, data.movedToDate, data.note, data.weekStart)
    if not result:
        raise HTTPException(status_code=404, detail="Task not found")
    return completion_to_dict(result)
