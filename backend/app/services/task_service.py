from datetime import datetime, timedelta
from sqlalchemy.orm import Session, joinedload
from app.models.task import Task
from app.models.completion import TaskCompletion
from app.models.base import TaskStatus


def get_week_start(date: datetime) -> datetime:
    """Get Monday 00:00:00 of the week containing the given date."""
    days_since_monday = date.weekday()  # Monday=0
    monday = date - timedelta(days=days_since_monday)
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


def get_all_tasks(db: Session):
    return (
        db.query(Task)
        .filter(Task.is_active == True)
        .options(joinedload(Task.category), joinedload(Task.project))
        .order_by(Task.day_of_week, Task.title)
        .all()
    )


def get_tasks_for_week(db: Session, date_str: str | None = None):
    if date_str:
        date = datetime.fromisoformat(date_str)
    else:
        date = datetime.utcnow()

    week_start = get_week_start(date)

    tasks = (
        db.query(Task)
        .filter(Task.is_active == True)
        .options(joinedload(Task.category), joinedload(Task.project))
        .order_by(Task.day_of_week, Task.title)
        .all()
    )

    # Filter: recurring tasks + one-time tasks for this week
    week_end = week_start + timedelta(days=7)
    result = []
    for task in tasks:
        if task.is_recurring:
            result.append(task)
        elif task.scheduled_date and week_start <= task.scheduled_date < week_end:
            result.append(task)

    # Ensure completions exist for this week
    for task in result:
        completion = (
            db.query(TaskCompletion)
            .filter(
                TaskCompletion.task_id == task.id,
                TaskCompletion.week_start == week_start,
            )
            .first()
        )
        if not completion:
            completion = TaskCompletion(
                task_id=task.id,
                week_start=week_start,
                status=TaskStatus.PENDING,
            )
            db.add(completion)

    db.commit()

    # Re-fetch with completions filtered to this week
    for task in result:
        task.completions = (
            db.query(TaskCompletion)
            .filter(
                TaskCompletion.task_id == task.id,
                TaskCompletion.week_start == week_start,
            )
            .all()
        )

    return result


def create_task(db: Session, data: dict) -> Task:
    task = Task(
        title=data["title"],
        description=data.get("description"),
        category_id=data["categoryId"],
        day_of_week=data["dayOfWeek"],
        scheduled_date=datetime.fromisoformat(data["scheduledDate"]) if data.get("scheduledDate") else None,
        reminder_time=data.get("reminderTime"),
        is_recurring=data.get("isRecurring", False),
        priority=data.get("priority", "MEDIUM"),
        estimated_minutes=data.get("estimatedMinutes"),
        project_id=data.get("projectId"),
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    # Load category
    db.refresh(task, ["category"])
    return task


def update_task(db: Session, task_id: str, data: dict) -> Task | None:
    task = db.query(Task).filter(Task.id == task_id, Task.is_active == True).first()
    if not task:
        return None

    if "title" in data and data["title"] is not None:
        task.title = data["title"]
    if "description" in data and data["description"] is not None:
        task.description = data["description"]
    if "categoryId" in data and data["categoryId"] is not None:
        task.category_id = data["categoryId"]
    if "dayOfWeek" in data and data["dayOfWeek"] is not None:
        task.day_of_week = data["dayOfWeek"]
    if "scheduledDate" in data and data["scheduledDate"] is not None:
        task.scheduled_date = datetime.fromisoformat(data["scheduledDate"])
    if "reminderTime" in data:
        task.reminder_time = data["reminderTime"]
    if "isRecurring" in data and data["isRecurring"] is not None:
        task.is_recurring = data["isRecurring"]
    if "priority" in data and data["priority"] is not None:
        task.priority = data["priority"]
    if "estimatedMinutes" in data:
        task.estimated_minutes = data["estimatedMinutes"]
    if "projectId" in data:
        task.project_id = data["projectId"]

    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task, ["category"])
    return task


def delete_task(db: Session, task_id: str) -> bool:
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        return False
    task.is_active = False
    task.updated_at = datetime.utcnow()
    db.commit()
    return True


def get_tasks_for_day(db: Session, day_of_week: int, date: datetime | None = None):
    """Get tasks for a specific day of the week."""
    if date is None:
        date = datetime.utcnow()

    week_start = get_week_start(date)

    all_day_tasks = (
        db.query(Task)
        .filter(Task.is_active == True, Task.day_of_week == day_of_week)
        .options(joinedload(Task.category), joinedload(Task.project))
        .order_by(Task.title)
        .all()
    )

    # Filter: recurring tasks always show, one-time tasks only in their scheduled week
    week_end = week_start + timedelta(days=7)
    tasks = []
    for task in all_day_tasks:
        if task.is_recurring:
            tasks.append(task)
        elif task.scheduled_date and week_start <= task.scheduled_date < week_end:
            tasks.append(task)

    for task in tasks:
        completion = (
            db.query(TaskCompletion)
            .filter(
                TaskCompletion.task_id == task.id,
                TaskCompletion.week_start == week_start,
            )
            .first()
        )
        if not completion:
            completion = TaskCompletion(
                task_id=task.id,
                week_start=week_start,
                status=TaskStatus.PENDING,
            )
            db.add(completion)

    db.commit()

    for task in tasks:
        task.completions = (
            db.query(TaskCompletion)
            .filter(
                TaskCompletion.task_id == task.id,
                TaskCompletion.week_start == week_start,
            )
            .all()
        )

    return tasks
