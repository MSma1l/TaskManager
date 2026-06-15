from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.board_column import BoardColumn
from app.models.user import User
from app.schemas.ai import TaskQuestionsRequest, EstimateRequest, CreateTaskRequest
from app.services import ai_service, board_service, membership_service

router = APIRouter(prefix="/api", tags=["ai"])


# ── intrebari (orice user autentificat) ─────────────────────────────

@router.post("/ai/task-questions")
async def task_questions(
    data: TaskQuestionsRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ai_service.generate_questions(data.title, data.description or "")


# ── estimare (MEMBER in proiect) ────────────────────────────────────

@router.post("/projects/{project_id}/ai/estimate")
async def estimate(
    project_id: str,
    data: EstimateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership_service.require_membership(db, project_id, user.id, min_role="MEMBER")
    return ai_service.estimate(data.title, data.description or "", data.answers or {})


# ── creare task din estimare (MEMBER in proiect) ────────────────────

def _backlog_column(db: Session, project_id: str) -> BoardColumn:
    """Coloana BACKLOG a proiectului; fallback la prima coloana dupa pozitie."""
    board_service.ensure_columns(db, project_id)
    column = (
        db.query(BoardColumn)
        .filter(
            BoardColumn.project_id == project_id,
            BoardColumn.column_type == "BACKLOG",
        )
        .order_by(BoardColumn.position.asc())
        .first()
    )
    if column is None:
        column = (
            db.query(BoardColumn)
            .filter(BoardColumn.project_id == project_id)
            .order_by(BoardColumn.position.asc())
            .first()
        )
    if column is None:
        raise HTTPException(status_code=400, detail="Proiectul nu are coloane pe board")
    return column


@router.post("/projects/{project_id}/ai/create-task")
async def create_task(
    project_id: str,
    data: CreateTaskRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership_service.require_membership(db, project_id, user.id, min_role="MEMBER")

    # Estimeaza intai (AI sau reguli) ca sa luam story points + motivare.
    estimate = ai_service.estimate(data.title, data.description or "", data.answers or {})

    # Determina coloana tinta (cea data sau BACKLOG / prima coloana).
    column_id = data.columnId or _backlog_column(db, project_id).id

    # Valideaza assignee (daca exista) ca membru al proiectului.
    if data.assigneeId is not None:
        if membership_service.get_member(db, project_id, data.assigneeId) is None:
            raise HTTPException(status_code=400, detail="Responsabilul trebuie sa fie membru al proiectului")

    task = board_service.create_task(db, user.id, project_id, {
        "title": data.title,
        "description": data.description,
        "columnId": column_id,
        "assigneeId": data.assigneeId,
        "storyPoints": estimate["storyPoints"],
        "labelIds": [],
    })

    return {
        "task": board_service.board_task_to_dict(db, task),
        "estimate": estimate,
    }
