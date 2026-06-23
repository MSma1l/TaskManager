from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.project import Project
from app.schemas.board import (
    ColumnCreate,
    ColumnUpdate,
    BoardTaskCreate,
    BoardTaskUpdate,
    MoveTask,
    AssignTask,
    LabelCreate,
    TaskTransition,
    SubtaskCreate,
    SubtaskUpdate,
    SubtaskReorder,
)
from app.services import board_service

router = APIRouter(prefix="/api/projects/{project_id}/board", tags=["board"])


# ── serializers (camelCase) ─────────────────────────────────────────

def label_to_dict(label):
    return {
        "id": label.id,
        "name": label.name,
        "color": label.color,
    }


def board_task_to_dict(task, users: dict | None = None, project_key: str | None = None, comment_counts: dict | None = None):
    users = users or {}
    comment_counts = comment_counts or {}

    def _resolve(uid: str) -> dict:
        u = users.get(uid)
        return {
            "userId": uid,
            "username": u.username if u else None,
            "fullName": u.full_name if u else None,
        }

    # Lista de responsabili (many-to-many), cu primarul (assignee_id) in frunte.
    assignee_ids = [a.id for a in (task.assignees or [])]
    if task.assignee_id and task.assignee_id in assignee_ids:
        assignee_ids = [task.assignee_id] + [aid for aid in assignee_ids if aid != task.assignee_id]
    assignees = [_resolve(uid) for uid in assignee_ids]

    assignee = None
    if task.assignee_id:
        assignee = next(
            (a for a in assignees if a["userId"] == task.assignee_id),
            _resolve(task.assignee_id),
        )
    task_key = (
        f"{project_key}-{task.task_number}"
        if project_key and task.task_number is not None
        else None
    )
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "priority": task.priority,
        "assignee": assignee,
        "assignees": assignees,
        "labels": [label_to_dict(l) for l in (task.labels or [])],
        "boardColumnId": task.board_column_id,
        "boardOrder": task.board_order,
        "taskNumber": task.task_number,
        "taskKey": task_key,
        "dueDate": task.due_date.isoformat() if task.due_date else None,
        "estimateMinutes": task.estimated_minutes,
        "storyPoints": task.story_points,
        "approvalStatus": task.approval_status,
        "sprintId": task.sprint_id,
        "dayOfWeek": task.day_of_week,
        "scheduledDate": task.scheduled_date.isoformat() if task.scheduled_date else None,
        "reminderTime": task.reminder_time,
        "commentCount": comment_counts.get(task.id, 0),
        "subtasks": list(task.subtasks or []),
    }


def column_to_dict(column, tasks=None, users: dict | None = None, project_key: str | None = None, comment_counts: dict | None = None):
    return {
        "id": column.id,
        "name": column.name,
        "position": column.position,
        "color": column.color,
        "isDoneColumn": column.is_done_column,
        "columnType": column.column_type,
        "tasks": [board_task_to_dict(t, users, project_key, comment_counts) for t in (tasks or [])],
    }


# ── board ───────────────────────────────────────────────────────────

@router.get("")
async def get_board(
    project_id: str,
    sprint_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    board = board_service.get_board(db, user.id, project_id, sprint_id)
    users = board["users"]
    tasks_by_column = board["tasks_by_column"]
    project_key = board["project_key"]
    comment_counts = board["comment_counts"]
    return {
        "columns": [
            column_to_dict(c, tasks_by_column.get(c.id, []), users, project_key, comment_counts)
            for c in board["columns"]
        ],
        "labels": [label_to_dict(l) for l in board["labels"]],
    }


# ── coloane ─────────────────────────────────────────────────────────

@router.post("/columns")
async def create_column(
    project_id: str,
    data: ColumnCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    column = board_service.create_column(db, user.id, project_id, data.name, data.color, data.columnType)
    return column_to_dict(column)


@router.put("/columns/{column_id}")
async def update_column(
    project_id: str,
    column_id: str,
    data: ColumnUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    column = board_service.update_column(
        db, user.id, project_id, column_id, data.model_dump(exclude_unset=True)
    )
    return column_to_dict(column)


@router.delete("/columns/{column_id}")
async def delete_column(
    project_id: str,
    column_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    board_service.delete_column(db, user.id, project_id, column_id)
    return {"message": "Coloana stearsa"}


# ── task-uri board ──────────────────────────────────────────────────

def _task_with_assignee(db: Session, task, project_id: str | None = None):
    """Construieste maparea user pentru un singur task (assignee) + cheia proiectului."""
    users = {}
    assignee_ids = {a.id for a in (task.assignees or [])}
    if task.assignee_id:
        assignee_ids.add(task.assignee_id)
    if assignee_ids:
        rows = db.query(User).filter(User.id.in_(assignee_ids)).all()
        users = {u.id: u for u in rows}
    project_key = None
    pid = project_id or task.project_id
    if pid:
        row = db.query(Project.key).filter(Project.id == pid).first()
        project_key = row[0] if row else None
    comment_counts = {task.id: board_service._comment_count(db, task.id)}
    return board_task_to_dict(task, users, project_key, comment_counts)


@router.post("/tasks")
async def create_task(
    project_id: str,
    data: BoardTaskCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = board_service.create_task(db, user.id, project_id, data.model_dump())
    return _task_with_assignee(db, task, project_id)


@router.put("/tasks/{task_id}")
async def update_task(
    project_id: str,
    task_id: str,
    data: BoardTaskUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = board_service.update_task(
        db, user.id, project_id, task_id, data.model_dump(exclude_unset=True)
    )
    return _task_with_assignee(db, task, project_id)


@router.delete("/tasks/{task_id}")
async def delete_task(
    project_id: str,
    task_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    board_service.delete_task(db, user.id, project_id, task_id)
    return {"message": "Task sters"}


@router.post("/tasks/{task_id}/move")
async def move_task(
    project_id: str,
    task_id: str,
    data: MoveTask,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    board_service.move_task(db, user.id, project_id, task_id, data.toColumnId, data.toIndex)
    return {"message": "Task mutat"}


@router.put("/tasks/{task_id}/assign")
async def assign_task(
    project_id: str,
    task_id: str,
    data: AssignTask,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = board_service.assign_task(db, user.id, project_id, task_id, data.assigneeIds)
    return _task_with_assignee(db, task, project_id)


@router.post("/tasks/{task_id}/transition")
async def transition_task(
    project_id: str,
    task_id: str,
    data: TaskTransition,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.action not in {"plan", "start", "done", "approve"}:
        raise HTTPException(status_code=400, detail="Actiune invalida")
    task = board_service.transition_task(
        db, user.id, project_id, task_id, data.action,
        estimate_minutes=data.estimateMinutes,
        day_of_week=data.dayOfWeek,
        scheduled_date=data.scheduledDate,
        reminder_time=data.reminderTime,
    )
    return _task_with_assignee(db, task, project_id)


# ── etichete (labels) ───────────────────────────────────────────────

@router.get("/labels")
async def list_labels(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    labels = board_service.list_labels(db, user.id, project_id)
    return [label_to_dict(l) for l in labels]


@router.post("/labels")
async def create_label(
    project_id: str,
    data: LabelCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    label = board_service.create_label(db, user.id, project_id, data.name, data.color)
    return label_to_dict(label)


@router.delete("/labels/{label_id}")
async def delete_label(
    project_id: str,
    label_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    board_service.delete_label(db, user.id, project_id, label_id)
    return {"message": "Eticheta stearsa"}


# ── subtaskuri (checklist) ──────────────────────────────────────────

@router.post("/tasks/{task_id}/subtasks")
async def add_subtask(
    project_id: str,
    task_id: str,
    data: SubtaskCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = board_service.add_subtask(db, user.id, project_id, task_id, data.title)
    return _task_with_assignee(db, task, project_id)


@router.patch("/tasks/{task_id}/subtasks/{subtask_id}")
async def update_subtask(
    project_id: str,
    task_id: str,
    subtask_id: str,
    data: SubtaskUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = board_service.update_subtask(
        db, user.id, project_id, task_id, subtask_id,
        title=data.title, done=data.done,
    )
    return _task_with_assignee(db, task, project_id)


@router.delete("/tasks/{task_id}/subtasks/{subtask_id}")
async def remove_subtask(
    project_id: str,
    task_id: str,
    subtask_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = board_service.remove_subtask(db, user.id, project_id, task_id, subtask_id)
    return _task_with_assignee(db, task, project_id)


@router.put("/tasks/{task_id}/subtasks/reorder")
async def reorder_subtasks(
    project_id: str,
    task_id: str,
    data: SubtaskReorder,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = board_service.reorder_subtasks(db, user.id, project_id, task_id, data.order)
    return _task_with_assignee(db, task, project_id)
