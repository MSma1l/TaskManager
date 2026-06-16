from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.board_column import BoardColumn
from app.models.user import User
from app.schemas.ai import (
    TaskQuestionsRequest,
    EstimateRequest,
    CreateTaskRequest,
    SprintPlanInput,
    SprintPlanApplyInput,
)
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
    """Creare rapida: insert direct in baza, FARA niciun apel la AI.

    Story points-ul vine de la client (estimarea AI deja facuta in wizard sau
    o valoare manuala). Estimarea AI traieste doar pe /ai/estimate si /ai/plan.
    """
    membership_service.require_membership(db, project_id, user.id, min_role="MEMBER")

    # Determina coloana tinta (cea data sau BACKLOG / prima coloana).
    column_id = data.columnId or _backlog_column(db, project_id).id

    # Valideaza assignee (daca exista) ca membru al proiectului.
    if data.assigneeId is not None:
        if membership_service.get_member(db, project_id, data.assigneeId) is None:
            raise HTTPException(status_code=400, detail="Responsabilul trebuie sa fie membru al proiectului")

    story_points = (
        ai_service._clamp_points(data.storyPoints)
        if data.storyPoints is not None
        else None
    )

    task = board_service.create_task(db, user.id, project_id, {
        "title": data.title,
        "description": data.description,
        "columnId": column_id,
        "assigneeId": data.assigneeId,
        "storyPoints": story_points,
        "labelIds": [],
    })

    return {"task": board_service.board_task_to_dict(db, task)}


# ── planificare sprint AI (MEMBER in proiect) ───────────────────────

@router.post("/projects/{project_id}/ai/plan")
async def plan_sprint(
    project_id: str,
    data: SprintPlanInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Preview: transforma un brief liber in taskuri propuse. Nu creeaza nimic."""
    membership_service.require_membership(db, project_id, user.id, min_role="MEMBER")

    brief = (data.brief or "").strip()
    if not brief:
        raise HTTPException(status_code=400, detail="Descrierea sprintului nu poate fi goala")

    return ai_service.plan_sprint(brief)


@router.post("/projects/{project_id}/ai/plan/apply")
async def apply_sprint_plan(
    project_id: str,
    data: SprintPlanApplyInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Creeaza in masa taskurile alese in coloana BACKLOG (sprint null)."""
    membership_service.require_membership(db, project_id, user.id, min_role="MEMBER")

    tasks = data.tasks or []
    if not tasks:
        raise HTTPException(status_code=400, detail="Lista de taskuri este goala")
    tasks = tasks[:50]

    # Aceeasi rezolvare a coloanei BACKLOG ca la create-task.
    default_column_id = _backlog_column(db, project_id).id

    created = []
    for item in tasks:
        column_id = item.columnId or default_column_id
        story_points = (
            ai_service._clamp_points(item.storyPoints)
            if item.storyPoints is not None
            else None
        )
        task = board_service.create_task(db, user.id, project_id, {
            "title": item.title,
            "description": item.description,
            "columnId": column_id,
            "assigneeId": None,
            "storyPoints": story_points,
            "labelIds": [],
        })
        created.append(board_service.board_task_to_dict(db, task))

    return {"created": created, "count": len(created)}
