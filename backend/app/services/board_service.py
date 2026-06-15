from datetime import datetime
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.board_column import BoardColumn
from app.models.label import Label, TaskLabel
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.services import membership_service


# Coloanele implicite (RO) create automat pentru orice proiect fara coloane.
# Fluxul pe 5 stadii: (name, position, is_done_column, column_type).
DEFAULT_COLUMNS = [
    ("Backlog", 0, False, "BACKLOG"),
    ("Planificate", 1, False, "PLANNED"),
    ("In lucru", 2, False, "IN_PROGRESS"),
    ("Finalizate", 3, True, "DONE"),
    ("Aprobate", 4, False, "APPROVED"),
]


# column_type-urile care inseamna "munca terminata".
DONE_COLUMN_TYPES = ("DONE", "APPROVED")


# ── done detection (robust la customizarea coloanelor) ──────────────

def is_done_column_obj(col: BoardColumn | None) -> bool:
    """O coloana inseamna "terminat" daca are flag-ul is_done_column SAU
    column_type in (DONE, APPROVED). Robust cand adminul pune CUSTOM/rename."""
    if col is None:
        return False
    return bool(col.is_done_column) or (col.column_type in DONE_COLUMN_TYPES)


def done_column_ids(db: Session, project_id: str) -> set[str]:
    """Id-urile coloanelor "terminat" pentru proiect (is_done_column sau type)."""
    rows = (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project_id)
        .all()
    )
    return {c.id for c in rows if is_done_column_obj(c)}


# ── helpers interne ─────────────────────────────────────────────────

def _parse_dt(value):
    """Parseaza un string ISO in datetime (sau lasa datetime/None neschimbat)."""
    if value is None or isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Data invalida (format ISO)")


def ensure_columns(db: Session, project_id: str) -> None:
    """Daca proiectul nu are coloane, creeaza cele 3 implicite (RO).

    Apelat lazy din get_board, asa incat orice proiect (inclusiv cele
    create via API dupa migrare) sa aiba intotdeauna coloane.
    """
    existing = (
        db.query(BoardColumn.id)
        .filter(BoardColumn.project_id == project_id)
        .first()
    )
    if existing is not None:
        return
    for name, position, is_done, column_type in DEFAULT_COLUMNS:
        db.add(BoardColumn(
            project_id=project_id,
            name=name,
            position=position,
            color=None,
            is_done_column=is_done,
            column_type=column_type,
            created_at=datetime.utcnow(),
        ))
    db.commit()


def _get_column(db: Session, project_id: str, column_id: str) -> BoardColumn:
    column = (
        db.query(BoardColumn)
        .filter(BoardColumn.id == column_id, BoardColumn.project_id == project_id)
        .first()
    )
    if column is None:
        raise HTTPException(status_code=404, detail="Coloana inexistenta")
    return column


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


def _get_label(db: Session, project_id: str, label_id: str) -> Label:
    label = (
        db.query(Label)
        .filter(Label.id == label_id, Label.project_id == project_id)
        .first()
    )
    if label is None:
        raise HTTPException(status_code=404, detail="Eticheta inexistenta")
    return label


def _max_order(db: Session, column_id: str) -> int:
    """Cel mai mare board_order din coloana, sau -1 daca e goala."""
    value = (
        db.query(func.max(Task.board_order))
        .filter(
            Task.board_column_id == column_id,
            Task.is_active == True,
        )
        .scalar()
    )
    return value if value is not None else -1


def _set_labels(db: Session, task: Task, project_id: str, label_ids: list[str]) -> None:
    """Inlocuieste etichetele unui task cu cele date (validate pe proiect)."""
    labels = []
    for lid in (label_ids or []):
        labels.append(_get_label(db, project_id, lid))
    task.labels = labels


def _reindex_column(db: Session, column_id: str) -> None:
    """Recalculeaza board_order 0..n contiguu pentru o coloana."""
    tasks = (
        db.query(Task)
        .filter(
            Task.board_column_id == column_id,
            Task.is_active == True,
        )
        .order_by(Task.board_order.asc(), Task.created_at.asc())
        .all()
    )
    for index, task in enumerate(tasks):
        task.board_order = index


# ── serializer board task (camelCase) ───────────────────────────────

def _label_to_dict(label):
    return {"id": label.id, "name": label.name, "color": label.color}


def _log(db: Session, task: Task, actor_user_id: str, action: str, meta: dict | None = None) -> None:
    """Logare de activitate non-fatala (import lazy pt. a evita import circular)."""
    try:
        from app.services import collaboration_service
        collaboration_service.log_activity(db, task, actor_user_id, action, meta)
    except Exception as e:
        print(f"activity log failed ({action}): {e}")


def _comment_count(db: Session, task_id: str) -> int:
    from app.models.task_comment import TaskComment
    return (
        db.query(func.count(TaskComment.id))
        .filter(TaskComment.task_id == task_id)
        .scalar()
    ) or 0


def board_task_to_dict(db: Session, task: Task, comment_count: int | None = None) -> dict:
    """Serializeaza un task de board in dict camelCase (cu assignee + cheie).

    Folosit de sprint_service / ai_service ca sa intoarca acelasi contract ca
    api/board.py, fara a importa stratul api (evita import circular).
    """
    assignee = None
    if task.assignee_id:
        u = db.query(User).filter(User.id == task.assignee_id).first()
        assignee = {
            "userId": task.assignee_id,
            "username": u.username if u else None,
            "fullName": u.full_name if u else None,
        }

    project_key = None
    if task.project_id:
        row = db.query(Project.key).filter(Project.id == task.project_id).first()
        project_key = row[0] if row else None
    task_key = (
        f"{project_key}-{task.task_number}"
        if project_key and task.task_number is not None
        else None
    )

    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "priority": task.priority,
        "assignee": assignee,
        "labels": [_label_to_dict(l) for l in (task.labels or [])],
        "boardColumnId": task.board_column_id,
        "boardOrder": task.board_order,
        "taskNumber": task.task_number,
        "taskKey": task_key,
        "dueDate": task.due_date.isoformat() if task.due_date else None,
        "estimateMinutes": task.estimated_minutes,
        "storyPoints": task.story_points,
        "sprintId": task.sprint_id,
        "dayOfWeek": task.day_of_week,
        "scheduledDate": task.scheduled_date.isoformat() if task.scheduled_date else None,
        "reminderTime": task.reminder_time,
        "commentCount": comment_count if comment_count is not None else _comment_count(db, task.id),
    }


# ── board read ──────────────────────────────────────────────────────

def get_board(db: Session, user_id: str, project_id: str, sprint_id: str | None = None):
    membership_service.require_membership(db, project_id, user_id, min_role="VIEWER")
    ensure_columns(db, project_id)

    project = _get_project(db, project_id)

    columns = (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project_id)
        .order_by(BoardColumn.position.asc())
        .all()
    )

    query = (
        db.query(Task)
        .filter(
            Task.project_id == project_id,
            Task.is_active == True,
            Task.board_column_id.isnot(None),
        )
    )

    # Scoping optional dupa sprint:
    #   "backlog" -> taskuri fara sprint; <id> -> taskuri din sprintul respectiv;
    #   None/omis -> toate taskurile de pe board (comportamentul implicit).
    if sprint_id == "backlog":
        query = query.filter(Task.sprint_id.is_(None))
    elif sprint_id:
        query = query.filter(Task.sprint_id == sprint_id)

    tasks = (
        query
        .options(joinedload(Task.labels))
        .order_by(Task.board_order.asc())
        .all()
    )

    # Rezolva utilizatorii (assignee) intr-un singur query.
    assignee_ids = {t.assignee_id for t in tasks if t.assignee_id}
    users = {}
    if assignee_ids:
        rows = db.query(User).filter(User.id.in_(assignee_ids)).all()
        users = {u.id: u for u in rows}

    tasks_by_column: dict[str, list] = {}
    for task in tasks:
        tasks_by_column.setdefault(task.board_column_id, []).append(task)

    # Numara comentariile per task intr-un singur query (evita N+1).
    comment_counts: dict[str, int] = {}
    task_ids = [t.id for t in tasks]
    if task_ids:
        from app.models.task_comment import TaskComment
        rows = (
            db.query(TaskComment.task_id, func.count(TaskComment.id))
            .filter(TaskComment.task_id.in_(task_ids))
            .group_by(TaskComment.task_id)
            .all()
        )
        comment_counts = {tid: cnt for tid, cnt in rows}

    labels = (
        db.query(Label)
        .filter(Label.project_id == project_id)
        .order_by(Label.created_at.asc())
        .all()
    )

    return {
        "columns": columns,
        "tasks_by_column": tasks_by_column,
        "users": users,
        "labels": labels,
        "project_key": project.key,
        "comment_counts": comment_counts,
    }


# ── coloane ─────────────────────────────────────────────────────────

def create_column(db: Session, user_id: str, project_id: str, name: str, color: str | None, column_type: str | None = None) -> BoardColumn:
    membership_service.require_membership(db, project_id, user_id, min_role="ADMIN")

    max_pos = (
        db.query(func.max(BoardColumn.position))
        .filter(BoardColumn.project_id == project_id)
        .scalar()
    )
    position = (max_pos + 1) if max_pos is not None else 0

    column = BoardColumn(
        project_id=project_id,
        name=name,
        position=position,
        color=color,
        is_done_column=False,
        column_type=column_type or "CUSTOM",
        created_at=datetime.utcnow(),
    )
    db.add(column)
    db.commit()
    db.refresh(column)
    return column


def update_column(db: Session, user_id: str, project_id: str, column_id: str, data: dict) -> BoardColumn:
    membership_service.require_membership(db, project_id, user_id, min_role="ADMIN")
    column = _get_column(db, project_id, column_id)

    if data.get("name") is not None:
        column.name = data["name"]
    if "color" in data:
        column.color = data["color"]
    if data.get("position") is not None:
        column.position = data["position"]
    if data.get("isDoneColumn") is not None:
        column.is_done_column = data["isDoneColumn"]
    if data.get("columnType") is not None:
        column.column_type = data["columnType"]

    db.commit()
    db.refresh(column)
    return column


def delete_column(db: Session, user_id: str, project_id: str, column_id: str) -> None:
    membership_service.require_membership(db, project_id, user_id, min_role="ADMIN")
    column = _get_column(db, project_id, column_id)

    columns = (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project_id)
        .order_by(BoardColumn.position.asc())
        .all()
    )
    if len(columns) <= 1:
        raise HTTPException(status_code=400, detail="Nu poti sterge ultima coloana")

    # Prima coloana ramasa (dupa pozitie), excluzand-o pe cea stearsa.
    target = next((c for c in columns if c.id != column_id), None)

    # Muta task-urile la coloana tinta, in continuarea ei.
    tasks = (
        db.query(Task)
        .filter(
            Task.board_column_id == column_id,
            Task.is_active == True,
        )
        .order_by(Task.board_order.asc())
        .all()
    )
    next_order = _max_order(db, target.id) + 1
    for task in tasks:
        task.board_column_id = target.id
        task.board_order = next_order
        next_order += 1

    db.delete(column)
    db.commit()


# ── task-uri board ──────────────────────────────────────────────────

def _get_project(db: Session, project_id: str) -> Project:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.is_active == True)
        .first()
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Proiect inexistent")
    return project


def create_task(db: Session, user_id: str, project_id: str, data: dict) -> Task:
    membership_service.require_membership(db, project_id, user_id, min_role="MEMBER")

    project = _get_project(db, project_id)
    column = _get_column(db, project_id, data["columnId"])

    assignee_id = data.get("assigneeId")
    if assignee_id is not None:
        _validate_assignee(db, project_id, assignee_id)

    # Numar secvential per proiect (cheia afisata: KEY-<task_number>).
    project.task_counter = (project.task_counter or 0) + 1

    task = Task(
        user_id=user_id,
        title=data["title"],
        description=data.get("description"),
        category_id=None,
        day_of_week=None,
        priority=data.get("priority") or "MEDIUM",
        project_id=project_id,
        board_column_id=column.id,
        board_order=_max_order(db, column.id) + 1,
        assignee_id=assignee_id,
        task_number=project.task_counter,
        due_date=_parse_dt(data.get("dueDate")),
        estimated_minutes=data.get("estimateMinutes"),
        story_points=data.get("storyPoints"),
        is_active=True,
    )
    db.add(task)
    db.flush()

    _set_labels(db, task, project_id, data.get("labelIds") or [])

    _log(db, task, user_id, "CREATED")

    db.commit()
    db.refresh(task)
    return _get_board_task(db, project_id, task.id)


def update_task(db: Session, user_id: str, project_id: str, task_id: str, data: dict) -> Task:
    membership_service.require_membership(db, project_id, user_id, min_role="MEMBER")
    task = _get_board_task(db, project_id, task_id)

    if data.get("title") is not None:
        task.title = data["title"]
    if "description" in data:
        task.description = data["description"]
    if data.get("priority") is not None:
        task.priority = data["priority"]
    if data.get("labelIds") is not None:
        _set_labels(db, task, project_id, data["labelIds"])
    if "dueDate" in data:
        task.due_date = _parse_dt(data["dueDate"])
    if "estimateMinutes" in data:
        task.estimated_minutes = data["estimateMinutes"]
    if "storyPoints" in data:
        task.story_points = data["storyPoints"]

    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return _get_board_task(db, project_id, task.id)


def delete_task(db: Session, user_id: str, project_id: str, task_id: str) -> None:
    membership_service.require_membership(db, project_id, user_id, min_role="MEMBER")
    task = _get_board_task(db, project_id, task_id)

    source_column_id = task.board_column_id
    task.is_active = False
    task.updated_at = datetime.utcnow()
    db.flush()

    # Recompacteaza ordinea coloanei sursa.
    _reindex_column(db, source_column_id)
    db.commit()


def move_task(db: Session, user_id: str, project_id: str, task_id: str, to_column_id: str, to_index: int) -> None:
    membership_service.require_membership(db, project_id, user_id, min_role="MEMBER")
    task = _get_board_task(db, project_id, task_id)
    target_column = _get_column(db, project_id, to_column_id)

    source_column_id = task.board_column_id

    # Lista task-urilor din coloana tinta, excluzand task-ul mutat.
    target_tasks = (
        db.query(Task)
        .filter(
            Task.board_column_id == target_column.id,
            Task.is_active == True,
            Task.id != task.id,
        )
        .order_by(Task.board_order.asc())
        .all()
    )

    index = max(0, min(to_index, len(target_tasks)))
    target_tasks.insert(index, task)

    task.board_column_id = target_column.id
    for i, t in enumerate(target_tasks):
        t.board_order = i

    db.flush()

    # Daca s-a mutat intre coloane, recompacteaza si coloana sursa.
    if source_column_id != target_column.id:
        _reindex_column(db, source_column_id)

    _log(db, task, user_id, "MOVED", {"fromColumnId": source_column_id, "toColumnId": target_column.id})

    db.commit()


def assign_task(db: Session, user_id: str, project_id: str, task_id: str, assignee_id: str | None) -> Task:
    membership_service.require_membership(db, project_id, user_id, min_role="MEMBER")
    task = _get_board_task(db, project_id, task_id)

    if assignee_id is not None:
        _validate_assignee(db, project_id, assignee_id)

    task.assignee_id = assignee_id
    task.updated_at = datetime.utcnow()

    _log(db, task, user_id, "ASSIGNED", {"assigneeId": assignee_id})

    db.commit()
    db.refresh(task)
    return _get_board_task(db, project_id, task.id)


def _validate_assignee(db: Session, project_id: str, assignee_id: str) -> None:
    member = membership_service.get_member(db, project_id, assignee_id)
    if member is None:
        raise HTTPException(status_code=400, detail="Responsabilul trebuie sa fie membru al proiectului")
    # Un VIEWER e read-only: nu i se pot atribui sarcini.
    if membership_service.ROLE_RANK.get(member.role, -1) < membership_service.ROLE_RANK["MEMBER"]:
        raise HTTPException(status_code=400, detail="Nu poti atribui sarcini unui vizualizator (VIEWER)")


# ── workflow (tranzitii intre stadii) ───────────────────────────────

# Maparea actiune -> column_type tinta.
ACTION_TARGET = {
    "plan": "PLANNED",
    "start": "IN_PROGRESS",
    "done": "DONE",
    "approve": "APPROVED",
}


def _find_target_column(db: Session, project_id: str, target_type: str, current_column_id: str) -> BoardColumn:
    """Coloana cu column_type tinta (prima dupa pozitie); fallback: urmatoarea
    coloana dupa pozitie fata de coloana curenta (workflow custom).

    Pentru "done" (target_type=DONE), daca nu exista coloana cu column_type=DONE,
    prefera o coloana cu is_done_column=True inainte de fallback-ul pozitional."""
    target = (
        db.query(BoardColumn)
        .filter(
            BoardColumn.project_id == project_id,
            BoardColumn.column_type == target_type,
        )
        .order_by(BoardColumn.position.asc())
        .first()
    )
    if target is not None:
        return target

    # Pentru tranzitia "done", onoreaza si flag-ul is_done_column.
    if target_type == "DONE":
        done_flagged = (
            db.query(BoardColumn)
            .filter(
                BoardColumn.project_id == project_id,
                BoardColumn.is_done_column == True,
            )
            .order_by(BoardColumn.position.asc())
            .first()
        )
        if done_flagged is not None:
            return done_flagged

    current = (
        db.query(BoardColumn)
        .filter(BoardColumn.id == current_column_id)
        .first()
    )
    if current is not None:
        nxt = (
            db.query(BoardColumn)
            .filter(
                BoardColumn.project_id == project_id,
                BoardColumn.position > current.position,
            )
            .order_by(BoardColumn.position.asc())
            .first()
        )
        if nxt is not None:
            return nxt

    raise HTTPException(status_code=400, detail="Nu exista o coloana tinta pentru aceasta tranzitie")


def transition_task(
    db: Session,
    user_id: str,
    project_id: str,
    task_id: str,
    action: str,
    *,
    estimate_minutes: int | None = None,
    day_of_week: int | None = None,
    scheduled_date=None,
    reminder_time: str | None = None,
) -> Task:
    member = membership_service.require_membership(db, project_id, user_id, min_role="VIEWER")
    task = _get_board_task(db, project_id, task_id)

    if action not in ACTION_TARGET:
        raise HTTPException(status_code=400, detail="Actiune necunoscuta")

    rank = membership_service.ROLE_RANK.get(member.role, -1)
    is_lead = rank >= membership_service.ROLE_RANK["ADMIN"]
    is_member = rank >= membership_service.ROLE_RANK["MEMBER"]
    is_assignee = task.assignee_id == user_id

    if action == "approve":
        if not is_lead:
            raise HTTPException(status_code=403, detail="Doar team lead-ul poate aproba")
    else:  # plan / start / done
        # Un VIEWER nu poate face tranzitii, chiar daca e cumva responsabil.
        if not is_member:
            raise HTTPException(status_code=403, detail="Un vizualizator (VIEWER) nu poate modifica sarcini")
        if not (is_assignee or is_lead):
            raise HTTPException(status_code=403, detail="Doar responsabilul sau team lead-ul poate face aceasta tranzitie")

    target_column = _find_target_column(db, project_id, ACTION_TARGET[action], task.board_column_id)

    if action == "plan":
        if estimate_minutes is not None:
            task.estimated_minutes = estimate_minutes
        if day_of_week is not None:
            task.day_of_week = day_of_week
        if scheduled_date is not None:
            task.scheduled_date = _parse_dt(scheduled_date)
        if reminder_time is not None:
            task.reminder_time = reminder_time

    source_column_id = task.board_column_id
    if target_column.id != source_column_id:
        task.board_column_id = target_column.id
        task.board_order = _max_order(db, target_column.id) + 1

    task.updated_at = datetime.utcnow()
    db.flush()

    if target_column.id != source_column_id:
        _reindex_column(db, source_column_id)

    _log(db, task, user_id, action.upper())

    db.commit()
    db.refresh(task)
    return _get_board_task(db, project_id, task.id)


# ── etichete (labels) ───────────────────────────────────────────────

def list_labels(db: Session, user_id: str, project_id: str) -> list[Label]:
    membership_service.require_membership(db, project_id, user_id, min_role="VIEWER")
    return (
        db.query(Label)
        .filter(Label.project_id == project_id)
        .order_by(Label.created_at.asc())
        .all()
    )


def create_label(db: Session, user_id: str, project_id: str, name: str, color: str) -> Label:
    membership_service.require_membership(db, project_id, user_id, min_role="ADMIN")
    label = Label(
        project_id=project_id,
        name=name,
        color=color or "#3b82f6",
        created_at=datetime.utcnow(),
    )
    db.add(label)
    db.commit()
    db.refresh(label)
    return label


def delete_label(db: Session, user_id: str, project_id: str, label_id: str) -> None:
    membership_service.require_membership(db, project_id, user_id, min_role="ADMIN")
    label = _get_label(db, project_id, label_id)

    # Elimina asocierile cu task-uri inainte de stergere.
    db.query(TaskLabel).filter(TaskLabel.label_id == label_id).delete(synchronize_session=False)
    db.delete(label)
    db.commit()
