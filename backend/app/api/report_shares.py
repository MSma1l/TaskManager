"""API pentru "View Account" — linkuri publice read-only catre rapoarte.

Endpoints autentificate (creator-only):
  - POST /api/report-shares            → creeaza un link
  - GET  /api/report-shares            → linkurile mele active
  - POST /api/report-shares/{id}/revoke → dezactiveaza un link

Endpoint PUBLIC (fara auth):
  - GET  /api/report-shares/public/{token} → raportul agregat read-only
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services import report_share_service

router = APIRouter(prefix="/api/report-shares", tags=["report-shares"])


class CreateShareBody(BaseModel):
    scope: str = "team"
    projectId: str | None = None
    label: str | None = None


# ── authed ───────────────────────────────────────────────────────────

@router.post("")
def create_share(
    body: CreateShareBody,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return report_share_service.create_share(
        db, user.id, body.scope, body.projectId, body.label
    )


@router.get("")
def list_shares(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return report_share_service.list_shares(db, user.id)


@router.post("/{share_id}/revoke")
def revoke_share(
    share_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return report_share_service.revoke_share(db, user.id, share_id)


# ── public (no auth) ─────────────────────────────────────────────────

@router.get("/public/{token}")
def public_report(token: str, db: Session = Depends(get_db)):
    return report_share_service.get_public_report(db, token)
