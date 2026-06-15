from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models.board_column import BoardColumn
from app.models.project_member import ProjectMember
from app.models.sprint import Sprint
from app.models.task import Task
from app.models.user import User
from app.services import board_service, membership_service


# Coloanele care inseamna "munca terminata" pentru calculul de performanta.
DONE_COLUMN_TYPES = {"DONE", "APPROVED"}


# ── helpers interne ─────────────────────────────────────────────────

def _parse_dt(value):
    if value is None or isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Data invalida (format ISO)")


def _get_sprint(db: Session, project_id: str, sprint_id: str) -> Sprint:
    sprint = (
        db.query(Sprint)
        .filter(Sprint.id == sprint_id, Sprint.project_id == project_id)
        .first()
    )
    if sprint is None:
        raise HTTPException(status_code=404, detail="Sprint inexistent")
    return sprint


def _done_column_ids(db: Session, project_id: str) -> set[str]:
    """Id-urile coloanelor cu column_type in (DONE, APPROVED) pentru proiect."""
    rows = (
        db.query(BoardColumn.id)
        .filter(
            BoardColumn.project_id == project_id,
            BoardColumn.column_type.in_(DONE_COLUMN_TYPES),
        )
        .all()
    )
    return {r[0] for r in rows}


def _sprint_tasks(db: Session, sprint_id: str) -> list[Task]:
    return (
        db.query(Task)
        .filter(Task.sprint_id == sprint_id, Task.is_active == True)
        .all()
    )


def _assignee_points_in_sprint(db: Session, sprint_id: str, assignee_id: str) -> int:
    total = 0
    for t in _sprint_tasks(db, sprint_id):
        if t.assignee_id == assignee_id and t.story_points:
            total += t.story_points
    return total


# ── serializer ──────────────────────────────────────────────────────

def sprint_to_dict(db: Session, sprint: Sprint, members: list[ProjectMember] | None = None,
                   users: dict | None = None) -> dict:
    if members is None:
        members = membership_service.list_members(db, sprint.project_id)
    if users is None:
        ids = [m.user_id for m in members]
        rows = db.query(User).filter(User.id.in_(ids)).all() if ids else []
        users = {u.id: u for u in rows}

    tasks = _sprint_tasks(db, sprint.id)
    total_points = sum(t.story_points or 0 for t in tasks)

    # Puncte pe membru (suma story_points pentru taskurile pe care le are alocate).
    points_by_user: dict[str, int] = {}
    for t in tasks:
        if t.assignee_id and t.story_points:
            points_by_user[t.assignee_id] = points_by_user.get(t.assignee_id, 0) + t.story_points

    per_member = []
    for m in members:
        u = users.get(m.user_id)
        points = points_by_user.get(m.user_id, 0)
        capacity = m.capacity_points if m.capacity_points is not None else 0
        per_member.append({
            "userId": m.user_id,
            "username": u.username if u else None,
            "points": points,
            "capacityPoints": capacity,
            "overCapacity": points > capacity,
        })

    return {
        "id": sprint.id,
        "name": sprint.name,
        "goal": sprint.goal,
        "startDate": sprint.start_date.isoformat() if sprint.start_date else None,
        "endDate": sprint.end_date.isoformat() if sprint.end_date else None,
        "status": sprint.status,
        "totalPoints": total_points,
        "taskCount": len(tasks),
        "perMember": per_member,
    }


# ── read ────────────────────────────────────────────────────────────

def list_sprints(db: Session, user_id: str, project_id: str) -> list[dict]:
    membership_service.require_membership(db, project_id, user_id, min_role="VIEWER")
    sprints = (
        db.query(Sprint)
        .filter(Sprint.project_id == project_id)
        .order_by(Sprint.created_at.asc())
        .all()
    )
    members = membership_service.list_members(db, project_id)
    ids = [m.user_id for m in members]
    rows = db.query(User).filter(User.id.in_(ids)).all() if ids else []
    users = {u.id: u for u in rows}
    return [sprint_to_dict(db, s, members, users) for s in sprints]


def list_backlog(db: Session, user_id: str, project_id: str) -> list[dict]:
    membership_service.require_membership(db, project_id, user_id, min_role="VIEWER")
    tasks = (
        db.query(Task)
        .filter(
            Task.project_id == project_id,
            Task.is_active == True,
            Task.board_column_id.isnot(None),
            Task.sprint_id.is_(None),
        )
        .options(joinedload(Task.labels))
        .order_by(Task.board_order.asc())
        .all()
    )
    return [board_service.board_task_to_dict(db, t) for t in tasks]


# ── write (CRUD) ────────────────────────────────────────────────────

def create_sprint(db: Session, user_id: str, project_id: str, data: dict) -> dict:
    membership_service.require_membership(db, project_id, user_id, min_role="ADMIN")
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Numele sprintului este obligatoriu")

    sprint = Sprint(
        project_id=project_id,
        name=name,
        goal=data.get("goal"),
        start_date=_parse_dt(data.get("startDate")),
        end_date=_parse_dt(data.get("endDate")),
        status="PLANNED",
        created_at=datetime.utcnow(),
    )
    db.add(sprint)
    db.commit()
    db.refresh(sprint)
    return sprint_to_dict(db, sprint)


def update_sprint(db: Session, user_id: str, project_id: str, sprint_id: str, data: dict) -> dict:
    membership_service.require_membership(db, project_id, user_id, min_role="ADMIN")
    sprint = _get_sprint(db, project_id, sprint_id)

    if data.get("name") is not None:
        sprint.name = data["name"]
    if "goal" in data:
        sprint.goal = data["goal"]
    if "startDate" in data:
        sprint.start_date = _parse_dt(data["startDate"])
    if "endDate" in data:
        sprint.end_date = _parse_dt(data["endDate"])
    if data.get("status") is not None:
        if data["status"] not in {"PLANNED", "ACTIVE", "COMPLETED"}:
            raise HTTPException(status_code=400, detail="Status invalid")
        sprint.status = data["status"]

    db.commit()
    db.refresh(sprint)
    return sprint_to_dict(db, sprint)


def delete_sprint(db: Session, user_id: str, project_id: str, sprint_id: str) -> None:
    membership_service.require_membership(db, project_id, user_id, min_role="ADMIN")
    sprint = _get_sprint(db, project_id, sprint_id)

    # Dezleaga taskurile inainte de stergere (revin in backlog).
    db.query(Task).filter(Task.sprint_id == sprint_id).update(
        {"sprint_id": None}, synchronize_session=False
    )
    db.delete(sprint)
    db.commit()


def start_sprint(db: Session, user_id: str, project_id: str, sprint_id: str) -> dict:
    membership_service.require_membership(db, project_id, user_id, min_role="ADMIN")
    sprint = _get_sprint(db, project_id, sprint_id)
    sprint.status = "ACTIVE"
    db.commit()
    db.refresh(sprint)
    return sprint_to_dict(db, sprint)


def complete_sprint(db: Session, user_id: str, project_id: str, sprint_id: str) -> dict:
    membership_service.require_membership(db, project_id, user_id, min_role="ADMIN")
    sprint = _get_sprint(db, project_id, sprint_id)
    sprint.status = "COMPLETED"

    # Taskurile neterminate (coloana NU e DONE/APPROVED) revin in backlog.
    done_ids = _done_column_ids(db, project_id)
    for t in _sprint_tasks(db, sprint_id):
        if t.board_column_id not in done_ids:
            t.sprint_id = None

    db.commit()
    db.refresh(sprint)
    return sprint_to_dict(db, sprint)


# ── taskuri in sprint ───────────────────────────────────────────────

def _get_board_task(db: Session, project_id: str, task_id: str) -> Task:
    task = (
        db.query(Task)
        .filter(
            Task.id == task_id,
            Task.project_id == project_id,
            Task.is_active == True,
            Task.board_column_id.isnot(None),
        )
        .options(joinedload(Task.labels))
        .first()
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Task inexistent pe board")
    return task


def add_task_to_sprint(db: Session, user_id: str, project_id: str, sprint_id: str, task_id: str) -> dict:
    membership_service.require_membership(db, project_id, user_id, min_role="ADMIN")
    sprint = _get_sprint(db, project_id, sprint_id)
    task = _get_board_task(db, project_id, task_id)

    task.sprint_id = sprint.id
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)

    warning = None
    if task.assignee_id:
        member = membership_service.get_member(db, project_id, task.assignee_id)
        capacity = member.capacity_points if member and member.capacity_points is not None else 0
        assignee_points = _assignee_points_in_sprint(db, sprint.id, task.assignee_id)
        warning = {
            "overCapacity": assignee_points > capacity,
            "assigneePoints": assignee_points,
            "capacityPoints": capacity,
        }

    return {"task": board_service.board_task_to_dict(db, task), "warning": warning}


def remove_task_from_sprint(db: Session, user_id: str, project_id: str, sprint_id: str, task_id: str) -> dict:
    membership_service.require_membership(db, project_id, user_id, min_role="ADMIN")
    _get_sprint(db, project_id, sprint_id)
    task = _get_board_task(db, project_id, task_id)

    task.sprint_id = None
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return {"task": board_service.board_task_to_dict(db, task)}
