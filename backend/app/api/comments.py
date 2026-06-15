from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.comment import CommentInput
from app.services import collaboration_service

router = APIRouter(prefix="/api/tasks/{task_id}/comments", tags=["comments"])


@router.get("")
async def list_comments(
    task_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return collaboration_service.list_comments(db, user.id, task_id)


@router.post("")
async def add_comment(
    task_id: str,
    data: CommentInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return collaboration_service.add_comment(db, user.id, task_id, data.body)


@router.put("/{comment_id}")
async def edit_comment(
    task_id: str,
    comment_id: str,
    data: CommentInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return collaboration_service.edit_comment(db, user.id, task_id, comment_id, data.body)


@router.delete("/{comment_id}")
async def delete_comment(
    task_id: str,
    comment_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    collaboration_service.delete_comment(db, user.id, task_id, comment_id)
    return {"message": "Comentariu sters"}
