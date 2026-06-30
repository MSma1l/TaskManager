"""Time tracking pe taskuri de board: start / pauza(stop) + raport pentru owner.

Reguli:
  - Un singur timer activ per user la un moment dat (in toate taskurile). Pornirea
    unui timer nou opreste automat timer-ul activ anterior (oriunde ar fi).
  - "Pauza" foloseste acelasi stop; reluarea e un nou start.
  - Toate datetime-urile sunt naive UTC (datetime.utcnow()), consistent cu codebase-ul.
"""
from datetime import datetime
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.task import Task
from app.models.task_time_entry import TaskTimeEntry
from app.models.project import Project
from app.models.user import User
from app.services import membership_service


# ── helpers de agregare (folosite la serializarea board-ului, evita N+1) ──────

def time_spent_map(db: Session, task_ids: list[str]) -> dict[str, int]:
    """Suma `duration_seconds` peste pontajele OPRITE (stopped_at not null), grupat
    pe task_id. Pontajele in derulare sunt excluse (frontend-ul adauga timpul live)."""
    if not task_ids:
        return {}
    rows = (
        db.query(TaskTimeEntry.task_id, func.coalesce(func.sum(TaskTimeEntry.duration_seconds), 0))
        .filter(
            TaskTimeEntry.task_id.in_(task_ids),
            TaskTimeEntry.stopped_at.isnot(None),
        )
        .group_by(TaskTimeEntry.task_id)
        .all()
    )
    return {tid: int(total or 0) for tid, total in rows}


def running_timers_map(db: Session, task_ids: list[str]) -> dict[str, list[dict]]:
    """Pentru fiecare task, lista timerelor active (stopped_at is null), cu user.
    Forma: {taskId: [{userId, username, fullName, startedAt(iso)}]}"""
    if not task_ids:
        return {}
    rows = (
        db.query(TaskTimeEntry, User)
        .join(User, User.id == TaskTimeEntry.user_id)
        .filter(
            TaskTimeEntry.task_id.in_(task_ids),
            TaskTimeEntry.stopped_at.is_(None),
        )
        .all()
    )
    out: dict[str, list[dict]] = {}
    for entry, user in rows:
        out.setdefault(entry.task_id, []).append({
            "userId": user.id,
            "username": user.username,
            "fullName": user.full_name,
            "startedAt": entry.started_at.isoformat() if entry.started_at else None,
        })
    return out


# ── intern ────────────────────────────────────────────────────────────────────

def _get_board_task(db: Session, project_id: str, task_id: str) -> Task:
    task = (
        db.query(Task)
        .filter(
            Task.id == task_id,
            Task.project_id == project_id,
            Task.is_active == True,  # noqa: E712
            Task.board_column_id.isnot(None),
        )
        .first()
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Task inexistent pe board")
    return task


def _stop_entry(entry: TaskTimeEntry, now: datetime) -> None:
    """Inchide un pontaj: seteaza stopped_at + duration_seconds (>= 0)."""
    entry.stopped_at = now
    delta = int((now - entry.started_at).total_seconds()) if entry.started_at else 0
    entry.duration_seconds = max(0, delta)


# ── operatii ────────────────────────────────────────────────────────────────────

def start_timer(db: Session, project_id: str, task_id: str, user_id: str) -> TaskTimeEntry:
    """Porneste un timer pentru user pe acest task. Opreste intai orice timer activ
    al userului (oriunde). Necesita membership MEMBER+."""
    membership_service.require_membership(db, project_id, user_id, min_role="MEMBER")
    _get_board_task(db, project_id, task_id)

    now = datetime.utcnow()

    # Un singur timer activ per user: opreste-le pe toate cele deschise (orice task).
    active = (
        db.query(TaskTimeEntry)
        .filter(
            TaskTimeEntry.user_id == user_id,
            TaskTimeEntry.stopped_at.is_(None),
        )
        .all()
    )
    for entry in active:
        _stop_entry(entry, now)

    new_entry = TaskTimeEntry(
        task_id=task_id,
        project_id=project_id,
        user_id=user_id,
        started_at=now,
        created_at=now,
    )
    db.add(new_entry)
    db.commit()
    db.refresh(new_entry)
    return new_entry


def stop_timer(db: Session, project_id: str, task_id: str, user_id: str) -> TaskTimeEntry | None:
    """Opreste (pauza) timer-ul activ al userului pe ACEST task. No-op daca nu exista."""
    membership_service.require_membership(db, project_id, user_id, min_role="MEMBER")
    _get_board_task(db, project_id, task_id)

    entry = (
        db.query(TaskTimeEntry)
        .filter(
            TaskTimeEntry.task_id == task_id,
            TaskTimeEntry.user_id == user_id,
            TaskTimeEntry.stopped_at.is_(None),
        )
        .order_by(TaskTimeEntry.started_at.desc())
        .first()
    )
    if entry is None:
        return None

    _stop_entry(entry, datetime.utcnow())
    db.commit()
    db.refresh(entry)
    return entry


def get_time_report(db: Session, project_id: str, user_id: str) -> dict:
    """Raport de timp per membru pentru un proiect (doar OWNER).

    Aduna toate pontajele proiectului. Pentru pontajele active include timpul live
    (now - started_at). Membrii sunt sortati descrescator dupa total, iar taskurile
    din fiecare membru la fel.
    """
    membership_service.require_membership(db, project_id, user_id, min_role="OWNER")

    now = datetime.utcnow()

    entries = (
        db.query(TaskTimeEntry)
        .filter(TaskTimeEntry.project_id == project_id)
        .all()
    )

    project = db.query(Project).filter(Project.id == project_id).first()
    project_key = project.key if project else None

    # Strange task-urile si userii implicati intr-un minim de query-uri.
    task_ids = {e.task_id for e in entries}
    user_ids = {e.user_id for e in entries}

    tasks = {}
    if task_ids:
        rows = db.query(Task).filter(Task.id.in_(task_ids)).all()
        tasks = {t.id: t for t in rows}
    users = {}
    if user_ids:
        rows = db.query(User).filter(User.id.in_(user_ids)).all()
        users = {u.id: u for u in rows}

    def _entry_seconds(entry: TaskTimeEntry) -> int:
        if entry.stopped_at is not None:
            return int(entry.duration_seconds or 0)
        # Pontaj activ: timp live.
        return max(0, int((now - entry.started_at).total_seconds())) if entry.started_at else 0

    # Acumuleaza: per (user) -> total + per (user, task) -> secunde.
    members_acc: dict[str, dict] = {}
    for entry in entries:
        secs = _entry_seconds(entry)
        m = members_acc.setdefault(entry.user_id, {"total": 0, "tasks": {}})
        m["total"] += secs
        m["tasks"][entry.task_id] = m["tasks"].get(entry.task_id, 0) + secs

    members_out: list[dict] = []
    total_seconds = 0
    for uid, acc in members_acc.items():
        user = users.get(uid)
        total_seconds += acc["total"]

        tasks_out: list[dict] = []
        for tid, secs in acc["tasks"].items():
            task = tasks.get(tid)
            task_key = (
                f"{project_key}-{task.task_number}"
                if project_key and task and task.task_number is not None
                else None
            )
            tasks_out.append({
                "taskId": tid,
                "taskKey": task_key,
                "title": task.title if task else None,
                "seconds": secs,
            })
        tasks_out.sort(key=lambda x: x["seconds"], reverse=True)

        members_out.append({
            "userId": uid,
            "username": user.username if user else None,
            "fullName": user.full_name if user else None,
            "totalSeconds": acc["total"],
            "taskCount": len(acc["tasks"]),
            "tasks": tasks_out,
        })

    members_out.sort(key=lambda m: m["totalSeconds"], reverse=True)

    return {"totalSeconds": total_seconds, "members": members_out}
