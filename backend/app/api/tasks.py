from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.board_column import BoardColumn
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.schemas.task import TaskCreate, TaskUpdate
from app.schemas.board import VerifyReason
from app.services import task_service, board_service

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def task_to_dict(task):
    project_dict = None
    if task.project:
        project_dict = {
            "id": task.project.id,
            "name": task.project.name,
            "color": task.project.color,
        }
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "categoryId": task.category_id,
        "category": (
            {
                "id": task.category.id,
                "name": task.category.name,
                "icon": task.category.icon,
                "color": task.category.color,
            }
            if task.category
            else None
        ),
        "dayOfWeek": task.day_of_week,
        "assigneeId": task.assignee_id,
        "boardColumnId": task.board_column_id,
        "boardOrder": task.board_order,
        "scheduledDate": task.scheduled_date.isoformat() if task.scheduled_date else None,
        "reminderTime": task.reminder_time,
        "isRecurring": task.is_recurring,
        "isActive": task.is_active,
        "priority": task.priority,
        "estimatedMinutes": task.estimated_minutes,
        "projectId": task.project_id,
        "project": project_dict,
        "completions": [
            {
                "id": c.id,
                "taskId": c.task_id,
                "weekStart": c.week_start.isoformat(),
                "status": c.status.value if hasattr(c.status, 'value') else c.status,
                "completedAt": c.completed_at.isoformat() if c.completed_at else None,
                "movedToDate": c.moved_to_date.isoformat() if c.moved_to_date else None,
                "skipReason": c.skip_reason,
                "note": c.note,
            }
            for c in (task.completions or [])
        ],
    }


@router.get("")
async def get_tasks(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tasks = task_service.get_all_tasks(db, user.id)
    return [task_to_dict(t) for t in tasks]


@router.get("/week")
async def get_week_tasks(
    date: str = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tasks = task_service.get_tasks_for_week(db, user.id, date)
    return [task_to_dict(t) for t in tasks]


@router.get("/assigned")
async def get_assigned_tasks(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Task-urile de board repartizate userului curent, din toate proiectele.

    Nu cere parametri de membership — sunt task-urile proprii ale userului.
    """
    tasks = (
        db.query(Task)
        .filter(
            Task.assignee_id == user.id,
            Task.is_active == True,
            Task.board_column_id.isnot(None),
        )
        .order_by(Task.project_id.asc(), Task.board_order.asc())
        .all()
    )
    if not tasks:
        return []

    column_ids = {t.board_column_id for t in tasks if t.board_column_id}
    project_ids = {t.project_id for t in tasks if t.project_id}

    columns = {}
    if column_ids:
        rows = db.query(BoardColumn).filter(BoardColumn.id.in_(column_ids)).all()
        columns = {c.id: c for c in rows}

    projects = {}
    if project_ids:
        rows = db.query(Project).filter(Project.id.in_(project_ids)).all()
        projects = {p.id: p for p in rows}

    result = []
    for t in tasks:
        column = columns.get(t.board_column_id)
        project = projects.get(t.project_id)
        task_key = (
            f"{project.key}-{t.task_number}"
            if project and project.key and t.task_number is not None
            else None
        )
        result.append({
            "id": t.id,
            "title": t.title,
            "description": t.description,
            "priority": t.priority,
            "taskNumber": t.task_number,
            "taskKey": task_key,
            "dueDate": t.due_date.isoformat() if t.due_date else None,
            "estimateMinutes": t.estimated_minutes,
            "dayOfWeek": t.day_of_week,
            "scheduledDate": t.scheduled_date.isoformat() if t.scheduled_date else None,
            "reminderTime": t.reminder_time,
            "columnId": t.board_column_id,
            "columnName": column.name if column else None,
            "columnType": column.column_type if column else None,
            "origin": t.origin,  # "QUICK" = venit dintr-un task rapid
            "project": (
                {
                    "id": project.id,
                    "name": project.name,
                    "color": project.color,
                    "key": project.key,
                }
                if project
                else None
            ),
        })
    return result


# ── Ciclu de verificare / aprobare (admin) ──────────────────────────

@router.get("/pending-verification")
async def pending_verification(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Task-urile in asteptare de verificare din proiectele in care userul e ADMIN/OWNER."""
    return board_service.list_pending_verification(db, user.id)


@router.post("/{task_id}/approve")
async def approve_task(
    task_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return board_service.approve_task(db, user.id, task_id)


@router.post("/{task_id}/return")
async def return_task(
    task_id: str,
    data: VerifyReason,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return board_service.return_task(db, user.id, task_id, data.reason)


@router.post("/{task_id}/reject")
async def reject_task(
    task_id: str,
    data: VerifyReason,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return board_service.reject_task(db, user.id, task_id, data.reason)


@router.post("")
async def create_task(
    data: TaskCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = task_service.create_task(db, user.id, data.model_dump())
    return task_to_dict(task)


@router.put("/{task_id}")
async def update_task(
    task_id: str,
    data: TaskUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = task_service.update_task(db, user.id, task_id, data.model_dump(exclude_unset=True))
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task_to_dict(task)


@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    success = task_service.delete_task(db, user.id, task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task deleted"}
