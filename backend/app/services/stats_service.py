from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.task import Task
from app.models.user import User
from app.models.completion import TaskCompletion
from app.models.base import TaskStatus
from app.services.task_service import get_week_start
from app.services import board_service, membership_service


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


# ─────────────────────────────────────────────────────────────────────
# PM metrics: story points colectate (Faza 3 — §3.2 / §11)
# ─────────────────────────────────────────────────────────────────────

# Un task de board e "finalizat" pentru metrici daca a ajuns intr-o coloana
# done/approved SAU are approval_status = APPROVED. Folosim updated_at ca
# moment al finalizarii (board-ul nu are un camp explicit completed_at).
_APPROVED = "APPROVED"


def _done_ids_by_project(db: Session, project_ids: list[str]) -> dict[str, set[str]]:
    """Mapeaza fiecare proiect -> set de id-uri de coloane "terminat"."""
    return {pid: board_service.done_column_ids(db, pid) for pid in project_ids}


def _is_finished(task: Task, done_ids: set[str]) -> bool:
    if task.approval_status == _APPROVED:
        return True
    return task.board_column_id is not None and task.board_column_id in done_ids


def _month_key(dt: datetime) -> str:
    return f"{dt.year:04d}-{dt.month:02d}"


def _last_n_month_keys(now: datetime, n: int) -> list[str]:
    keys = []
    y, m = now.year, now.month
    for _ in range(n):
        keys.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    keys.reverse()
    return keys


def get_my_points(db: Session, user_id: str) -> dict:
    """Metrici PM personale: story points colectati (cariera), taskuri
    finalizate pe ferestre de timp, performanta pe saptamana + trend, si o
    serie pe ultimele 6 luni pentru grafic."""
    project_ids = membership_service.get_accessible_project_ids(db, user_id)
    now = datetime.utcnow()
    week_start = get_week_start(now)
    last_week_start = week_start - timedelta(weeks=1)
    cutoff_30 = now - timedelta(days=30)
    cutoff_90 = now - timedelta(days=90)
    cutoff_365 = now - timedelta(days=365)
    month_keys = _last_n_month_keys(now, 6)

    career_points = 0
    tasks_finished_total = 0
    finished_30 = finished_90 = finished_365 = 0
    points_this_week = points_last_week = 0
    monthly: dict[str, int] = {k: 0 for k in month_keys}

    if project_ids:
        done_by_project = _done_ids_by_project(db, project_ids)
        tasks = (
            db.query(Task)
            .filter(
                Task.project_id.in_(project_ids),
                Task.assignee_id == user_id,
                Task.is_active == True,
                Task.board_column_id.isnot(None),
            )
            .all()
        )
        for t in tasks:
            done_ids = done_by_project.get(t.project_id, set())
            if not _is_finished(t, done_ids):
                continue
            points = t.story_points or 0
            when = t.updated_at or t.created_at or now

            career_points += points
            tasks_finished_total += 1
            if when >= cutoff_30:
                finished_30 += 1
            if when >= cutoff_90:
                finished_90 += 1
            if when >= cutoff_365:
                finished_365 += 1
            if when >= week_start:
                points_this_week += points
            elif when >= last_week_start:
                points_last_week += points

            mk = _month_key(when)
            if mk in monthly:
                monthly[mk] += points

    delta = points_this_week - points_last_week
    if delta > 0:
        trend = "up"
    elif delta < 0:
        trend = "down"
    else:
        trend = "flat"

    return {
        "careerStoryPoints": career_points,
        "tasksFinished": {
            "total": tasks_finished_total,
            "month": finished_30,
            "quarter": finished_90,
            "year": finished_365,
        },
        "storyPointsThisWeek": points_this_week,
        "storyPointsLastWeek": points_last_week,
        "trend": trend,
        "trendDelta": delta,
        "monthlySeries": [{"month": k, "points": monthly[k]} for k in month_keys],
    }


def get_team_points(db: Session, user_id: str, project_id: str) -> dict:
    """Metrici de echipa pentru admini (ADMIN+ pe proiect): per membru
    {storyPoints, tasksFinished, completionRate} + recomandari (RO) pentru
    perioada urmatoare. completionRate = taskuri finalizate / taskuri atribuite."""
    membership_service.require_membership(db, project_id, user_id, min_role="ADMIN")

    members = membership_service.list_members(db, project_id)
    ids = [m.user_id for m in members]
    rows = db.query(User).filter(User.id.in_(ids)).all() if ids else []
    users = {u.id: u for u in rows}

    done_ids = board_service.done_column_ids(db, project_id)
    tasks = (
        db.query(Task)
        .filter(
            Task.project_id == project_id,
            Task.is_active == True,
            Task.board_column_id.isnot(None),
        )
        .all()
    )

    per_member = []
    for m in members:
        story_points = 0
        tasks_finished = 0
        assigned_tasks = 0
        for t in tasks:
            if t.assignee_id != m.user_id:
                continue
            assigned_tasks += 1
            if _is_finished(t, done_ids):
                tasks_finished += 1
                story_points += t.story_points or 0
        completion_rate = (tasks_finished / assigned_tasks) if assigned_tasks else 0
        u = users.get(m.user_id)
        per_member.append({
            "userId": m.user_id,
            "username": u.username if u else None,
            "role": m.role,
            "storyPoints": story_points,
            "tasksFinished": tasks_finished,
            "assignedTasks": assigned_tasks,
            "completionRate": round(completion_rate, 4),
        })

    per_member.sort(key=lambda x: x["storyPoints"], reverse=True)

    # ── Recomandari euristice pentru perioada urmatoare (RO) ───────────
    recommendations: list[str] = []
    active = [m for m in per_member if m["assignedTasks"] > 0]
    for m in per_member:
        name = m["username"] or "Necunoscut"
        if m["assignedTasks"] == 0:
            recommendations.append(f"{name} nu are taskuri atribuite — distribuie-i din backlog.")
        elif m["tasksFinished"] == 0:
            recommendations.append(f"{name} nu a finalizat nimic — verifica blocajele.")
        elif m["completionRate"] < 0.5:
            pct = round(m["completionRate"] * 100)
            recommendations.append(f"{name} a finalizat doar {pct}% din taskuri — redu incarcarea.")

    if active:
        avg_points = sum(m["storyPoints"] for m in active) / len(active)
        top = active[0]
        if top["storyPoints"] > avg_points * 1.5 and len(active) > 1:
            recommendations.append(
                f"{top['username'] or 'Top'} duce mult mai mult decat media — reechilibreaza echipa."
            )

    if not recommendations:
        recommendations.append("Echipa este echilibrata — mentine ritmul pentru perioada urmatoare.")

    return {
        "projectId": project_id,
        "perMember": per_member,
        "recommendations": recommendations,
    }
