from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.task import TaskCreate, TaskUpdate
from app.services import task_service

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
