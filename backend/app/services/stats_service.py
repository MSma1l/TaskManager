from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.task import Task
from app.models.completion import TaskCompletion
from app.models.base import TaskStatus
from app.services.task_service import get_week_start


def get_weekly_stats(db: Session, week_start_str: str | None = None) -> dict:
    if week_start_str:
        week_start = datetime.fromisoformat(week_start_str)
    else:
        week_start = get_week_start(datetime.utcnow())

    completions = (
        db.query(TaskCompletion)
        .filter(TaskCompletion.week_start == week_start)
        .all()
    )

    total = len(completions)
    done = sum(1 for c in completions if c.status == TaskStatus.DONE)
    skipped = sum(1 for c in completions if c.status == TaskStatus.SKIPPED)
    not_done = sum(1 for c in completions if c.status == TaskStatus.NOT_DONE)
    percentage = round((done / total * 100) if total > 0 else 0, 1)

    return {
        "total": total,
        "done": done,
        "skipped": skipped,
        "notDone": not_done,
        "percentage": percentage,
    }


def get_history(db: Session, weeks: int = 8) -> list[dict]:
    now = datetime.utcnow()
    current_week_start = get_week_start(now)
    history = []

    for i in range(weeks):
        week_start = current_week_start - timedelta(weeks=i)
        completions = (
            db.query(TaskCompletion)
            .filter(TaskCompletion.week_start == week_start)
            .all()
        )
        total = len(completions)
        done = sum(1 for c in completions if c.status == TaskStatus.DONE)
        percentage = round((done / total * 100) if total > 0 else 0, 1)

        history.append({
            "weekStart": week_start.isoformat(),
            "total": total,
            "done": done,
            "percentage": percentage,
        })

    history.reverse()
    return history


def get_streaks(db: Session) -> list[dict]:
    tasks = db.query(Task).filter(Task.is_active == True).all()
    streaks = []

    now = datetime.utcnow()
    current_week_start = get_week_start(now)

    for task in tasks:
        streak = 0
        week = current_week_start

        while True:
            completion = (
                db.query(TaskCompletion)
                .filter(
                    TaskCompletion.task_id == task.id,
                    TaskCompletion.week_start == week,
                    TaskCompletion.status == TaskStatus.DONE,
                )
                .first()
            )
            if completion:
                streak += 1
                week -= timedelta(weeks=1)
            else:
                break

        if streak > 0:
            streaks.append({
                "taskId": task.id,
                "taskTitle": task.title,
                "streak": streak,
            })

    streaks.sort(key=lambda x: x["streak"], reverse=True)
    return streaks


def get_missed(db: Session) -> list[dict]:
    results = (
        db.query(
            TaskCompletion.task_id,
            func.count(TaskCompletion.id).label("missed_count"),
        )
        .filter(TaskCompletion.status == TaskStatus.NOT_DONE)
        .group_by(TaskCompletion.task_id)
        .order_by(func.count(TaskCompletion.id).desc())
        .limit(5)
        .all()
    )

    missed = []
    for task_id, count in results:
        task = db.query(Task).filter(Task.id == task_id).first()
        if task:
            missed.append({
                "taskId": task.id,
                "taskTitle": task.title,
                "missedCount": count,
            })

    return missed
