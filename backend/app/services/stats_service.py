from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.task import Task
from app.models.completion import TaskCompletion
from app.models.base import TaskStatus
from app.services.task_service import get_week_start


def _user_task_ids(db: Session, user_id: str) -> list[str]:
    rows = db.query(Task.id).filter(Task.user_id == user_id).all()
    return [r[0] for r in rows]


def get_weekly_stats(db: Session, week_start_str: str | None = None, user_id: str | None = None) -> dict:
    if week_start_str:
        week_start = datetime.fromisoformat(week_start_str)
    else:
        week_start = get_week_start(datetime.utcnow())

    q = db.query(TaskCompletion).filter(TaskCompletion.week_start == week_start)
    if user_id is not None:
        ids = _user_task_ids(db, user_id) or ["__none__"]
        q = q.filter(TaskCompletion.task_id.in_(ids))

    completions = q.all()

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


def get_history(db: Session, weeks: int = 8, user_id: str | None = None) -> list[dict]:
    now = datetime.utcnow()
    current_week_start = get_week_start(now)
    history = []

    user_ids = _user_task_ids(db, user_id) if user_id is not None else None
    if user_id is not None and not user_ids:
        user_ids = ["__none__"]

    for i in range(weeks):
        week_start = current_week_start - timedelta(weeks=i)
        q = db.query(TaskCompletion).filter(TaskCompletion.week_start == week_start)
        if user_ids is not None:
            q = q.filter(TaskCompletion.task_id.in_(user_ids))
        completions = q.all()
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


def get_streaks(db: Session, user_id: str | None = None) -> list[dict]:
    q = db.query(Task).filter(Task.is_active == True)
    if user_id is not None:
        q = q.filter(Task.user_id == user_id)
    tasks = q.all()
    streaks = []

    now = datetime.utcnow()
    current_week_start = get_week_start(now)

    # Fetch all DONE completions for these tasks in a single query, then compute
    # the contiguous streak (from the current week backwards) in memory. Evita
    # N+1: vechiul cod facea cate un query per task per saptamana.
    task_ids = [t.id for t in tasks]
    done_weeks: dict[str, set] = {}
    if task_ids:
        rows = (
            db.query(TaskCompletion.task_id, TaskCompletion.week_start)
            .filter(
                TaskCompletion.task_id.in_(task_ids),
                TaskCompletion.status == TaskStatus.DONE,
            )
            .all()
        )
        for tid, week_start in rows:
            done_weeks.setdefault(tid, set()).add(week_start)

    for task in tasks:
        weeks_done = done_weeks.get(task.id)
        if not weeks_done:
            continue

        streak = 0
        week = current_week_start
        while week in weeks_done:
            streak += 1
            week -= timedelta(weeks=1)

        if streak > 0:
            streaks.append({
                "taskId": task.id,
                "taskTitle": task.title,
                "streak": streak,
            })

    streaks.sort(key=lambda x: x["streak"], reverse=True)
    return streaks


def get_missed(db: Session, user_id: str | None = None) -> list[dict]:
    q = (
        db.query(
            TaskCompletion.task_id,
            func.count(TaskCompletion.id).label("missed_count"),
        )
        .filter(TaskCompletion.status == TaskStatus.NOT_DONE)
    )
    if user_id is not None:
        ids = _user_task_ids(db, user_id) or ["__none__"]
        q = q.filter(TaskCompletion.task_id.in_(ids))

    results = (
        q.group_by(TaskCompletion.task_id)
        .order_by(func.count(TaskCompletion.id).desc())
        .limit(5)
        .all()
    )

    # Rezolva titlurile taskurilor intr-un singur query (evita N+1 per rezultat).
    result_ids = [task_id for task_id, _ in results]
    titles = {}
    if result_ids:
        rows = db.query(Task.id, Task.title).filter(Task.id.in_(result_ids)).all()
        titles = dict(rows)

    missed = []
    for task_id, count in results:
        if task_id in titles:
            missed.append({
                "taskId": task_id,
                "taskTitle": titles[task_id],
                "missedCount": count,
            })

    return missed
