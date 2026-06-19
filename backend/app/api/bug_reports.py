from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.bug_report import (
    AttachmentInput,
    BugReportCreate,
    BugReportUpdate,
    CommentInput,
)
from app.services import bug_report_service

router = APIRouter(prefix="/api/projects/{project_id}/bug-reports", tags=["bug-reports"])


@router.get("")
async def list_reports(
    project_id: str,
    status: Optional[str] = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return bug_report_service.list_reports(db, user.id, project_id, status)


@router.post("")
async def create_report(
    project_id: str,
    data: BugReportCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return bug_report_service.create_report(db, user.id, project_id, data.model_dump())


@router.get("/{report_id}")
async def get_report(
    project_id: str,
    report_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return bug_report_service.get_report(db, user.id, project_id, report_id)


@router.put("/{report_id}")
async def update_report(
    project_id: str,
    report_id: str,
    data: BugReportUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return bug_report_service.update_report(
        db, user.id, project_id, report_id, data.model_dump(exclude_unset=True)
    )


@router.delete("/{report_id}")
async def delete_report(
    project_id: str,
    report_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    bug_report_service.delete_report(db, user.id, project_id, report_id)
    return {"message": "Raport sters"}


@router.post("/{report_id}/attachments")
async def add_attachment(
    project_id: str,
    report_id: str,
    data: AttachmentInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return bug_report_service.add_attachment(
        db, user.id, project_id, report_id, data.model_dump()
    )


@router.delete("/{report_id}/attachments/{attachment_id}")
async def delete_attachment(
    project_id: str,
    report_id: str,
    attachment_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    bug_report_service.delete_attachment(
        db, user.id, project_id, report_id, attachment_id
    )
    return {"message": "Atasament sters"}


@router.post("/{report_id}/comments")
async def add_comment(
    project_id: str,
    report_id: str,
    data: CommentInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return bug_report_service.add_comment(db, user.id, project_id, report_id, data.body)


@router.delete("/{report_id}/comments/{comment_id}")
async def delete_comment(
    project_id: str,
    report_id: str,
    comment_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    bug_report_service.delete_comment(db, user.id, project_id, report_id, comment_id)
    return {"message": "Comentariu sters"}
