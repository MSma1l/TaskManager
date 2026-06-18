from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.sprint import Sprint
from app.models.task import Task
from app.models.user import User
from app.services import board_service, membership_service, notification_service


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
                   users: dict | None = None, tasks: list[Task] | None = None) -> dict:
    if members is None:
        members = membership_service.list_members(db, sprint.project_id)
    if users is None:
        ids = [m.user_id for m in members]
        rows = db.query(User).filter(User.id.in_(ids)).all() if ids else []
        users = {u.id: u for u in rows}

    if tasks is None:
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

    # Serializeaza taskurile sprintului in acelasi contract ca backlog/board,
    # ca planificarea (drag&drop intre backlog si sprinturi) sa aiba cardurile.
    project_key = None
    if tasks:
        row = db.query(Project.key).filter(Project.id == sprint.project_id).first()
        project_key = row[0] if row else None
    counts = board_service.comment_counts(db, [t.id for t in tasks])
    task_dicts = [
        board_service.board_task_to_dict(
            db, t,
            comment_count=counts.get(t.id, 0),
            users=users,
            project_key=project_key,
        )
        for t in tasks
    ]

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
        "tasks": task_dicts,
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

    # Preia toate taskurile active din sprinturile proiectului intr-un singur
    # query si grupeaza-le pe sprint (evita N+1: cate un query per sprint).
    sprint_ids = [s.id for s in sprints]
    tasks_by_sprint: dict[str, list] = {}
    if sprint_ids:
        all_tasks = (
            db.query(Task)
            .filter(Task.sprint_id.in_(sprint_ids), Task.is_active == True)
            .all()
        )
        for t in all_tasks:
            tasks_by_sprint.setdefault(t.sprint_id, []).append(t)

    return [
        sprint_to_dict(db, s, members, users, tasks_by_sprint.get(s.id, []))
        for s in sprints
    ]


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

    # Preincarca assignee-ii, cheia proiectului si numarul de comentarii intr-un
    # numar fix de query-uri (evita N+1 in serializatorul board_task_to_dict).
    project = db.query(Project).filter(Project.id == project_id).first()
    project_key = project.key if project else None

    assignee_ids = {t.assignee_id for t in tasks if t.assignee_id}
    users = {}
    if assignee_ids:
        rows = db.query(User).filter(User.id.in_(assignee_ids)).all()
        users = {u.id: u for u in rows}

    counts = board_service.comment_counts(db, [t.id for t in tasks])

    return [
        board_service.board_task_to_dict(
            db, t,
            comment_count=counts.get(t.id, 0),
            users=users,
            project_key=project_key,
        )
        for t in tasks
    ]


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


def _build_report(db: Session, sprint: Sprint, tasks: list[Task], done_ids: set) -> dict:
    """Construieste snapshot-ul raportului de sprint (doar taskurile sprintului).

    Forma JSON stocata in `sprint.report`:
    {
      "totalTasks": int,                # nr taskuri planificate in sprint
      "completedTasks": int,            # taskuri intr-o coloana "terminat"
      "completionPct": int,             # 0..100, procent taskuri terminate
      "totalPoints": int,               # suma story_points planificate
      "completedPoints": int,           # suma story_points terminate
      "perMember": [
        {
          "userId": str,
          "username": str | None,
          "tasksDone": int,             # taskuri terminate alocate userului
          "storyPointsDone": int,       # puncte terminate alocate userului
          "tasksPending": int,          # taskuri neterminate alocate userului
        }, ...
      ],
      "burndown": [                     # serie ideal-vs-actual (2 puncte: start/end)
        {"label": "start", "ideal": totalPoints, "actual": totalPoints},
        {"label": "end",   "ideal": 0,           "actual": totalPoints - completedPoints},
      ],
      "generatedAt": ISO str,
    }
    """
    total_tasks = len(tasks)
    completed_tasks = sum(1 for t in tasks if t.board_column_id in done_ids)
    completion_pct = round(completed_tasks / total_tasks * 100) if total_tasks else 0

    total_points = sum(t.story_points or 0 for t in tasks)
    completed_points = sum(
        (t.story_points or 0) for t in tasks if t.board_column_id in done_ids
    )

    # Per-membru: agregare pe assignee.
    members = membership_service.list_members(db, sprint.project_id)
    ids = [m.user_id for m in members]
    rows = db.query(User).filter(User.id.in_(ids)).all() if ids else []
    users = {u.id: u for u in rows}

    agg: dict[str, dict] = {}
    for t in tasks:
        if not t.assignee_id:
            continue
        a = agg.setdefault(
            t.assignee_id, {"tasksDone": 0, "storyPointsDone": 0, "tasksPending": 0}
        )
        if t.board_column_id in done_ids:
            a["tasksDone"] += 1
            a["storyPointsDone"] += t.story_points or 0
        else:
            a["tasksPending"] += 1

    per_member = []
    for m in members:
        a = agg.get(m.user_id, {"tasksDone": 0, "storyPointsDone": 0, "tasksPending": 0})
        u = users.get(m.user_id)
        per_member.append({
            "userId": m.user_id,
            "username": u.username if u else None,
            "tasksDone": a["tasksDone"],
            "storyPointsDone": a["storyPointsDone"],
            "tasksPending": a["tasksPending"],
        })

    burndown = [
        {"label": "start", "ideal": total_points, "actual": total_points},
        {"label": "end", "ideal": 0, "actual": total_points - completed_points},
    ]

    return {
        "totalTasks": total_tasks,
        "completedTasks": completed_tasks,
        "completionPct": completion_pct,
        "totalPoints": total_points,
        "completedPoints": completed_points,
        "perMember": per_member,
        "burndown": burndown,
        "generatedAt": datetime.utcnow().isoformat(),
    }


def complete_sprint(db: Session, user_id: str, project_id: str, sprint_id: str) -> dict:
    membership_service.require_membership(db, project_id, user_id, min_role="ADMIN")
    sprint = _get_sprint(db, project_id, sprint_id)
    sprint.status = "COMPLETED"

    done_ids = board_service.done_column_ids(db, project_id)
    tasks = _sprint_tasks(db, sprint_id)

    # 1. Genereaza raportul DIN taskurile sprintului INAINTE de a dezlega
    #    taskurile neterminate (altfel pierdem legatura sprint↔task).
    report = _build_report(db, sprint, tasks, done_ids)
    sprint.report = report
    sprint.closed_at = datetime.utcnow()

    # 2. Taskurile neterminate (coloana NU e "terminat") revin in backlog.
    for t in tasks:
        if t.board_column_id not in done_ids:
            t.sprint_id = None

    db.commit()
    db.refresh(sprint)

    # 3. Notifica toti membrii proiectului (in-app, non-fatal).
    project = db.query(Project).filter(Project.id == project_id).first()
    pname = project.name if project else "proiect"
    for m in membership_service.list_members(db, project_id):
        notification_service.create_safe(
            db,
            user_id=m.user_id,
            type="SPRINT_CLOSED",
            title=f"Sprintul „{sprint.name}” a fost inchis",
            body=f"{report['completedTasks']}/{report['totalTasks']} taskuri terminate "
                 f"({report['completionPct']}%) in {pname}.",
            link="/reports",
            meta={
                "projectId": project_id,
                "sprintId": sprint.id,
                "completionPct": report["completionPct"],
            },
            commit=True,
        )

    return sprint_to_dict(db, sprint)


def list_reports(db: Session, user_id: str, project_id: str) -> list[dict]:
    """Rapoartele sprinturilor inchise (status COMPLETED), cel mai recent primul."""
    membership_service.require_membership(db, project_id, user_id, min_role="VIEWER")
    sprints = (
        db.query(Sprint)
        .filter(Sprint.project_id == project_id, Sprint.status == "COMPLETED")
        .order_by(Sprint.closed_at.desc().nullslast(), Sprint.created_at.desc())
        .all()
    )
    return [
        {
            "sprintId": s.id,
            "name": s.name,
            "goal": s.goal,
            "startDate": s.start_date.isoformat() if s.start_date else None,
            "endDate": s.end_date.isoformat() if s.end_date else None,
            "closedAt": s.closed_at.isoformat() if s.closed_at else None,
            "report": s.report,
        }
        for s in sprints
    ]


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
