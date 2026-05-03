from datetime import datetime
from sqlalchemy.orm import Session
from app.models.completion import TaskCompletion
from app.models.task import Task
from app.models.base import TaskStatus
from app.services.task_service import get_week_start


def _get_or_create_completion(db: Session, task_id: str, week_start: datetime) -> TaskCompletion:
    completion = (
        db.query(TaskCompletion)
        .filter(
            TaskCompletion.task_id == task_id,
            TaskCompletion.week_start == week_start,
        )
        .first()
    )
    if not completion:
        completion = TaskCompletion(
            task_id=task_id,
            week_start=week_start,
            status=TaskStatus.PENDING,
        )
        db.add(completion)
        db.commit()
        db.refresh(completion)
    return completion


def _resolve_week_start(week_start_iso: str | None) -> datetime:
    if week_start_iso:
        try:
            return get_week_start(datetime.fromisoformat(week_start_iso))
        except ValueError:
            pass
    return get_week_start(datetime.utcnow())


def mark_done(db: Session, task_id: str, note: str | None = None, week_start_iso: str | None = None) -> TaskCompletion | None:
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        return None

    week_start = _resolve_week_start(week_start_iso)
    completion = _get_or_create_completion(db, task_id, week_start)
    completion.status = TaskStatus.DONE
    completion.completed_at = datetime.utcnow()
    completion.note = note
    completion.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(completion)
    return completion


def mark_skip(db: Session, task_id: str, moved_to_date: str, skip_reason: str | None = None, week_start_iso: str | None = None) -> TaskCompletion | None:
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        return None

    week_start = _resolve_week_start(week_start_iso)
    completion = _get_or_create_completion(db, task_id, week_start)
    completion.status = TaskStatus.SKIPPED
    completion.moved_to_date = datetime.fromisoformat(moved_to_date)
    completion.skip_reason = skip_reason
    completion.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(completion)

    # Create a new task entry for the moved date if needed
    new_date = datetime.fromisoformat(moved_to_date)
    new_day_of_week = new_date.isoweekday()  # 1=Mon, 7=Sun

    # Create a one-time task copy for the moved date
    moved_task = Task(
        title=task.title,
        description=task.description,
        category_id=task.category_id,
        day_of_week=new_day_of_week,
        scheduled_date=new_date,
        reminder_time=task.reminder_time,
        is_recurring=False,
    )
    db.add(moved_task)
    db.commit()

    return completion


def mark_not_done(db: Session, task_id: str, skip_reason: str, week_start_iso: str | None = None) -> TaskCompletion | None:
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        return None

    week_start = _resolve_week_start(week_start_iso)
    completion = _get_or_create_completion(db, task_id, week_start)
    completion.status = TaskStatus.NOT_DONE
    completion.skip_reason = skip_reason
    completion.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(completion)
    return completion


def move_task(db: Session, task_id: str, moved_to_date: str, note: str | None = None, week_start_iso: str | None = None) -> TaskCompletion | None:
    return mark_skip(db, task_id, moved_to_date, note, week_start_iso)
