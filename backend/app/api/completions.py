from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import verify_token
from app.schemas.completion import MarkDoneInput, MarkSkipInput, MarkNotDoneInput, MoveTaskInput
from app.services import completion_service

router = APIRouter(prefix="/api/completions", tags=["completions"])
security = HTTPBearer()


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


@router.post("/{task_id}/done")
async def mark_done(
    task_id: str,
    data: MarkDoneInput = MarkDoneInput(),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    result = completion_service.mark_done(db, task_id, data.note, data.weekStart)
    if not result:
        raise HTTPException(status_code=404, detail="Task not found")
    return completion_to_dict(result)


@router.post("/{task_id}/skip")
async def mark_skip(
    task_id: str,
    data: MarkSkipInput,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    result = completion_service.mark_skip(db, task_id, data.movedToDate, data.skipReason, data.weekStart)
    if not result:
        raise HTTPException(status_code=404, detail="Task not found")
    return completion_to_dict(result)


@router.post("/{task_id}/not-done")
async def mark_not_done(
    task_id: str,
    data: MarkNotDoneInput,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
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
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    result = completion_service.move_task(db, task_id, data.movedToDate, data.note, data.weekStart)
    if not result:
        raise HTTPException(status_code=404, detail="Task not found")
    return completion_to_dict(result)
