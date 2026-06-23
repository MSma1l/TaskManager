from datetime import datetime
from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.models.base import generate_cuid
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

def _is_office_project(db: Session, project_id: str | None) -> bool:
    """True daca proiectul e Birou (system_key='OFFICE'). Taskurile lui nu se arhiveaza."""
    if not project_id:
        return False
    row = db.query(Project.system_key).filter(Project.id == project_id).first()
    return bool(row) and row[0] == "OFFICE"


def _apply_archive_state(db: Session, task: Task, target_column: BoardColumn) -> None:
    """Seteaza/sterge `archived_at` cand un task (non-Birou) intra/iese dintr-o
    coloana de tip APPROVED (Verificat). Taskurile de Birou nu se arhiveaza niciodata."""
    if _is_office_project(db, task.project_id):
        return
    if target_column.column_type == "APPROVED":
        if task.archived_at is None:
            task.archived_at = datetime.utcnow()
    else:
        if task.archived_at is not None:
            task.archived_at = None


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
        .options(joinedload(Task.labels), joinedload(Task.assignees))
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


def comment_counts(db: Session, task_ids: list[str]) -> dict[str, int]:
    """Numarul de comentarii pentru o lista de taskuri intr-un singur query."""
    if not task_ids:
        return {}
    from app.models.task_comment import TaskComment
    rows = (
        db.query(TaskComment.task_id, func.count(TaskComment.id))
        .filter(TaskComment.task_id.in_(task_ids))
        .group_by(TaskComment.task_id)
        .all()
    )
    return {tid: cnt for tid, cnt in rows}


def board_task_to_dict(
    db: Session,
    task: Task,
    comment_count: int | None = None,
    *,
    users: dict | None = None,
    project_key: str | None = None,
) -> dict:
    """Serializeaza un task de board in dict camelCase (cu assignee + cheie).

    Folosit de sprint_service / ai_service ca sa intoarca acelasi contract ca
    api/board.py, fara a importa stratul api (evita import circular).

    Pentru apeluri in bucla (ex. sprint_service.list_backlog), apelantul poate
    pasa `users` (map id->User), `project_key` si `comment_count` deja incarcate,
    ca sa evite query-uri per-task (N+1). Daca lipsesc, se rezolva lazy.
    """
    def _resolve(uid: str) -> dict:
        u = users.get(uid) if users is not None else (
            db.query(User).filter(User.id == uid).first()
        )
        return {
            "userId": uid,
            "username": u.username if u else None,
            "fullName": u.full_name if u else None,
        }

    # Lista completa de responsabili (din relatia many-to-many).
    assignee_ids = [a.id for a in (task.assignees or [])]
    # `assignee_id` (primary) e tinut in fruntea listei pentru afisare consistenta.
    if task.assignee_id and task.assignee_id in assignee_ids:
        assignee_ids = [task.assignee_id] + [aid for aid in assignee_ids if aid != task.assignee_id]
    assignees = [_resolve(uid) for uid in assignee_ids]

    # Backward compat: `assignee` ramane responsabilul primar.
    assignee = None
    if task.assignee_id:
        assignee = next(
            (a for a in assignees if a["userId"] == task.assignee_id),
            _resolve(task.assignee_id),
        )

    if project_key is None and task.project_id:
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
        "assignees": assignees,
        "labels": [_label_to_dict(l) for l in (task.labels or [])],
        "boardColumnId": task.board_column_id,
        "boardOrder": task.board_order,
        "taskNumber": task.task_number,
        "taskKey": task_key,
        "dueDate": task.due_date.isoformat() if task.due_date else None,
        "estimateMinutes": task.estimated_minutes,
        "storyPoints": task.story_points,
        "approvalStatus": task.approval_status,
        "sprintId": task.sprint_id,
        "dayOfWeek": task.day_of_week,
        "scheduledDate": task.scheduled_date.isoformat() if task.scheduled_date else None,
        "reminderTime": task.reminder_time,
        "commentCount": comment_count if comment_count is not None else _comment_count(db, task.id),
        "subtasks": list(task.subtasks or []),
        "attachments": list(task.attachments or []),
    }


# ── board read ──────────────────────────────────────────────────────

def get_board(db: Session, user_id: str, project_id: str, sprint_id: str | None = None):
    member = membership_service.require_membership(db, project_id, user_id, min_role="VIEWER")
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

    # Vizibilitate pe rol: un MEMBER simplu vede DOAR taskurile atribuite lui.
    # ADMIN/OWNER (gestionari) și VIEWER (read-only) văd toate taskurile.
    # Excepție (spec §2.2): backlog-ul (taskurile fără sprint) e spațiu comun de
    # planificare — TOȚI participanții îl văd în view-ul Board, indiferent de rol.
    # Deci pentru un MEMBER nu ascundem taskurile din backlog (sprint_id NULL).
    if member.role == "MEMBER":
        query = query.filter(
            or_(Task.assignee_id == user_id, Task.sprint_id.is_(None))
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
        .options(joinedload(Task.labels), joinedload(Task.assignees))
        .order_by(Task.board_order.asc())
        .all()
    )

    # Rezolva utilizatorii (toti responsabilii) intr-un singur query.
    assignee_ids: set[str] = set()
    for t in tasks:
        if t.assignee_id:
            assignee_ids.add(t.assignee_id)
        for a in (t.assignees or []):
            assignee_ids.add(a.id)
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

    # Responsabili: prefera lista `assigneeIds`; fallback la `assigneeId` singular
    # (compat cu formularele care inca trimit un singur responsabil).
    assignee_ids: list[str] = []
    for aid in (data.get("assigneeIds") or []):
        if aid and aid not in assignee_ids:
            assignee_ids.append(aid)
    if not assignee_ids and data.get("assigneeId"):
        assignee_ids = [data["assigneeId"]]
    for aid in assignee_ids:
        _validate_assignee(db, project_id, aid)

    # Numar secvential per proiect (cheia afisata: KEY-<task_number>).
    project.task_counter = (project.task_counter or 0) + 1

    # Story points: default 1 daca lipseste (None/unset). Un 0 explicit ramane 0.
    story_points = data.get("storyPoints")
    if story_points is None:
        story_points = 1

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
        assignee_id=assignee_ids[0] if assignee_ids else None,
        task_number=project.task_counter,
        due_date=_parse_dt(data.get("dueDate")),
        estimated_minutes=data.get("estimateMinutes"),
        story_points=story_points,
        is_active=True,
    )
    db.add(task)
    db.flush()

    if assignee_ids:
        _set_assignees(db, task, assignee_ids)

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
    member = membership_service.require_membership(db, project_id, user_id, min_role="MEMBER")
    task = _get_board_task(db, project_id, task_id)
    target_column = _get_column(db, project_id, to_column_id)

    # Restrictii pentru un MEMBER simplu (nu OWNER/ADMIN):
    #   - poate muta DOAR taskurile atribuite lui,
    #   - NU poate muta in coloana de APROBARE (aprobarea e doar a leadului).
    is_lead = membership_service.ROLE_RANK.get(member.role, -1) >= membership_service.ROLE_RANK["ADMIN"]
    if not is_lead:
        if task.assignee_id != user_id:
            raise HTTPException(status_code=403, detail="Poti muta doar taskurile atribuite tie")
        if target_column.column_type == "APPROVED":
            raise HTTPException(status_code=403, detail="Doar team lead-ul poate aproba (muta in coloana aprobat)")

    # Feature A: nu poti finaliza un task (mutare in VERIFY sau intr-o coloana
    # "terminat") fara story points setate.
    if target_column.column_type == "VERIFY" or is_done_column_obj(target_column):
        _require_story_points(task)

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

    # Arhivare: intrarea intr-o coloana Verificat (APPROVED) arhiveaza taskul
    # (doar pentru proiectele non-Birou); iesirea il dezarhiveaza.
    _apply_archive_state(db, task, target_column)

    db.flush()

    # Daca s-a mutat intre coloane, recompacteaza si coloana sursa.
    if source_column_id != target_column.id:
        _reindex_column(db, source_column_id)

    _log(db, task, user_id, "MOVED", {"fromColumnId": source_column_id, "toColumnId": target_column.id})

    db.commit()


def assign_task(db: Session, user_id: str, project_id: str, task_id: str, assignee_ids: list[str]) -> Task:
    # Doar OWNER/ADMIN pot atribui sau schimba responsabilii.
    membership_service.require_membership(db, project_id, user_id, min_role="ADMIN")
    task = _get_board_task(db, project_id, task_id)

    # Normalizeaza: pastreaza ordinea, fara duplicate, fara valori goale.
    new_ids: list[str] = []
    for aid in (assignee_ids or []):
        if aid and aid not in new_ids:
            new_ids.append(aid)
    for aid in new_ids:
        _validate_assignee(db, project_id, aid)

    prev_ids = {a.id for a in (task.assignees or [])}
    _set_assignees(db, task, new_ids)
    task.updated_at = datetime.utcnow()

    _log(db, task, user_id, "ASSIGNED", {"assigneeIds": new_ids})

    # Notifica responsabilii NOI (non-fatal): doar pe cei adaugati acum, nu pe
    # cei deja prezenti si nu pe actor (auto-atribuire). Rides commit=False.
    for aid in new_ids:
        if aid != user_id and aid not in prev_ids:
            try:
                from app.services import notification_service
                notification_service.create_safe(
                    db, user_id=aid, type="TASK_ASSIGNED",
                    title=f"Ti s-a atribuit taskul {task.title}",
                    link=f"/projects/{project_id}/board",
                    meta={"taskId": task.id, "projectId": project_id, "actorId": user_id},
                    commit=False,
                )
            except Exception as e:  # noqa: BLE001
                print(f"[notification] assign_task notify error: {e}")

    db.commit()
    db.refresh(task)
    return _get_board_task(db, project_id, task.id)


def _set_assignees(db: Session, task: Task, assignee_ids: list[str]) -> None:
    """Inlocuieste responsabilii task-ului cu lista data (deja validata + unica).

    Sincronizeaza `assignee_id` (primary) = primul din lista (sau None daca goala).
    Foloseste relatia ORM `task.assignees` ca SA sa scrie randurile in task_assignees.
    """
    users = []
    for aid in assignee_ids:
        u = db.query(User).filter(User.id == aid).first()
        if u:
            users.append(u)
    task.assignees = users
    task.assignee_id = users[0].id if users else None


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

    # Ciclu de aprobare: "done" inseamna "Raporteaza ca Finalizat" (-> VERIFY,
    # PENDING_REVIEW); "approve" e validarea adminului (-> APPROVED).
    if action == "done":
        return report_done(db, user_id, project_id, task_id)
    if action == "approve":
        return approve_task(db, user_id, task_id)

    rank = membership_service.ROLE_RANK.get(member.role, -1)
    is_lead = rank >= membership_service.ROLE_RANK["ADMIN"]
    is_member = rank >= membership_service.ROLE_RANK["MEMBER"]
    is_assignee = task.assignee_id == user_id

    # Doar plan / start ajung aici (done / approve sunt delegate mai sus).
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


# ── ciclu de aprobare (raportare -> verificare -> aprobare) ─────────

def _require_story_points(task: Task) -> None:
    """Feature A: un task nu poate fi finalizat fara story points (> 0)."""
    if not task.story_points or task.story_points <= 0:
        raise HTTPException(status_code=400, detail="Story points obligatorii inainte de finalizare")


def _get_active_task(db: Session, task_id: str) -> Task:
    """Incarca un task de board activ dupa id (fara a sti proiectul dinainte)."""
    task = (
        db.query(Task)
        .filter(
            Task.id == task_id,
            Task.is_active == True,
            Task.board_column_id.isnot(None),
        )
        .options(joinedload(Task.labels), joinedload(Task.assignees))
        .first()
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Task inexistent pe board")
    return task


def _find_verify_column(db: Session, project_id: str, current_column_id: str) -> BoardColumn:
    """Coloana de verificare (VERIFY) sau, daca lipseste, coloana DONE."""
    target = (
        db.query(BoardColumn)
        .filter(
            BoardColumn.project_id == project_id,
            BoardColumn.column_type == "VERIFY",
        )
        .order_by(BoardColumn.position.asc())
        .first()
    )
    if target is not None:
        return target
    return _find_target_column(db, project_id, "DONE", current_column_id)


def _find_approved_column(db: Session, project_id: str, current_column_id: str) -> BoardColumn:
    """Coloana APPROVED sau, daca lipseste, coloana DONE."""
    target = (
        db.query(BoardColumn)
        .filter(
            BoardColumn.project_id == project_id,
            BoardColumn.column_type == "APPROVED",
        )
        .order_by(BoardColumn.position.asc())
        .first()
    )
    if target is not None:
        return target
    return _find_target_column(db, project_id, "DONE", current_column_id)


def _move_to_column(db: Session, task: Task, target_column: BoardColumn) -> None:
    """Muta task-ul in coloana tinta (la coada) si recompacteaza sursa."""
    source_column_id = task.board_column_id
    # Arhivare: aliniaza `archived_at` la tipul coloanei tinta (non-Birou).
    _apply_archive_state(db, task, target_column)
    if target_column.id != source_column_id:
        task.board_column_id = target_column.id
        task.board_order = _max_order(db, target_column.id) + 1
        db.flush()
        _reindex_column(db, source_column_id)


def _notify_project_leads(
    db: Session, project_id: str, *, exclude_user_id: str | None,
    type: str, title: str, body: str | None = None, link: str | None = None, meta: dict | None = None,
) -> None:
    """Notifica toti ADMIN/OWNER ai proiectului (non-fatal, ride pe tranzactie)."""
    try:
        from app.models.project_member import ProjectMember
        from app.services import notification_service
        leads = (
            db.query(ProjectMember)
            .filter(
                ProjectMember.project_id == project_id,
                ProjectMember.role.in_(["ADMIN", "OWNER"]),
            )
            .all()
        )
        for m in leads:
            if m.user_id == exclude_user_id:
                continue
            notification_service.create_safe(
                db, user_id=m.user_id, type=type, title=title, body=body,
                link=link, meta=meta, commit=False,
            )
    except Exception as e:  # noqa: BLE001
        print(f"[notification] notify leads error: {e}")


def _notify_user(
    db: Session, user_id: str | None, *,
    type: str, title: str, body: str | None = None, link: str | None = None, meta: dict | None = None,
) -> None:
    if not user_id:
        return
    try:
        from app.services import notification_service
        notification_service.create_safe(
            db, user_id=user_id, type=type, title=title, body=body,
            link=link, meta=meta, commit=False,
        )
    except Exception as e:  # noqa: BLE001
        print(f"[notification] notify user error: {e}")


def report_done(db: Session, user_id: str, project_id: str, task_id: str) -> Task:
    """"Raporteaza ca Finalizat": responsabilul (sau leadul) trimite task-ul la
    verificare. Cere story points (Feature A). Muta in VERIFY (fallback DONE) si
    seteaza approval_status=PENDING_REVIEW; notifica liderii proiectului."""
    member = membership_service.require_membership(db, project_id, user_id, min_role="MEMBER")
    task = _get_board_task(db, project_id, task_id)

    rank = membership_service.ROLE_RANK.get(member.role, -1)
    is_lead = rank >= membership_service.ROLE_RANK["ADMIN"]
    if not (task.assignee_id == user_id or is_lead):
        raise HTTPException(status_code=403, detail="Doar responsabilul sau team lead-ul poate raporta finalizarea")

    _require_story_points(task)

    target_column = _find_verify_column(db, project_id, task.board_column_id)
    _move_to_column(db, task, target_column)
    task.approval_status = "PENDING_REVIEW"
    task.updated_at = datetime.utcnow()

    _log(db, task, user_id, "DONE")
    _notify_project_leads(
        db, project_id, exclude_user_id=user_id, type="TASK_PENDING_REVIEW",
        title=f"Task de verificat: {task.title}",
        link="/verify",
        meta={"taskId": task.id, "projectId": project_id, "actorId": user_id},
    )

    db.commit()
    db.refresh(task)
    return _get_board_task(db, project_id, task.id)


def approve_task(db: Session, user_id: str, task_id: str) -> Task:
    """Admin: aproba un task raportat. Muta in APPROVED (fallback DONE),
    approval_status=APPROVED, notifica responsabilul."""
    task = _get_active_task(db, task_id)
    project_id = task.project_id
    membership_service.require_membership(db, project_id, user_id, min_role="ADMIN")

    target_column = _find_approved_column(db, project_id, task.board_column_id)
    _move_to_column(db, task, target_column)
    task.approval_status = "APPROVED"
    task.updated_at = datetime.utcnow()

    _log(db, task, user_id, "APPROVED")
    _notify_user(
        db, task.assignee_id, type="TASK_APPROVED",
        title="Task-ul tau a fost aprobat",
        body=task.title,
        link=f"/projects/{project_id}/board",
        meta={"taskId": task.id, "projectId": project_id, "actorId": user_id},
    )

    db.commit()
    db.refresh(task)
    return _get_board_task(db, project_id, task.id)


def return_task(db: Session, user_id: str, task_id: str, reason: str | None = None) -> Task:
    """Admin: intoarce task-ul la corectare. Muta in IN_PROGRESS,
    approval_status=NEEDS_FIX, notifica responsabilul cu motivul."""
    task = _get_active_task(db, task_id)
    project_id = task.project_id
    membership_service.require_membership(db, project_id, user_id, min_role="ADMIN")

    target_column = _find_target_column(db, project_id, "IN_PROGRESS", task.board_column_id)
    _move_to_column(db, task, target_column)
    task.approval_status = "NEEDS_FIX"
    task.updated_at = datetime.utcnow()

    _log(db, task, user_id, "RETURNED", {"reason": reason} if reason else None)
    _notify_user(
        db, task.assignee_id, type="TASK_RETURNED",
        title="Task intors la corectare",
        body=reason or task.title,
        link=f"/projects/{project_id}/board",
        meta={"taskId": task.id, "projectId": project_id, "actorId": user_id, "reason": reason},
    )

    db.commit()
    db.refresh(task)
    return _get_board_task(db, project_id, task.id)


def reject_task(db: Session, user_id: str, task_id: str, reason: str | None = None) -> dict:
    """Admin: respinge task-ul. Soft-delete (is_active=False),
    approval_status=REJECTED, notifica responsabilul cu motivul."""
    task = _get_active_task(db, task_id)
    project_id = task.project_id
    membership_service.require_membership(db, project_id, user_id, min_role="ADMIN")

    source_column_id = task.board_column_id
    assignee_id = task.assignee_id
    title = task.title
    task.approval_status = "REJECTED"
    task.is_active = False
    task.updated_at = datetime.utcnow()
    db.flush()
    _reindex_column(db, source_column_id)

    _log(db, task, user_id, "REJECTED", {"reason": reason} if reason else None)
    _notify_user(
        db, assignee_id, type="TASK_REJECTED",
        title="Task respins",
        body=reason or title,
        link=f"/projects/{project_id}/board",
        meta={"taskId": task.id, "projectId": project_id, "actorId": user_id, "reason": reason},
    )

    db.commit()
    return {"id": task_id, "rejected": True}


def list_pending_verification(db: Session, user_id: str) -> list[dict]:
    """Task-urile in asteptare de verificare (PENDING_REVIEW) din proiectele in
    care userul e ADMIN/OWNER. Folosit de inbox-ul de verificare."""
    from app.models.project_member import ProjectMember

    lead_project_ids = [
        pid for (pid,) in (
            db.query(ProjectMember.project_id)
            .filter(
                ProjectMember.user_id == user_id,
                ProjectMember.role.in_(["ADMIN", "OWNER"]),
            )
            .all()
        )
    ]
    if not lead_project_ids:
        return []

    tasks = (
        db.query(Task)
        .filter(
            Task.project_id.in_(lead_project_ids),
            Task.is_active == True,
            Task.board_column_id.isnot(None),
            Task.approval_status == "PENDING_REVIEW",
        )
        .options(joinedload(Task.labels), joinedload(Task.assignees))
        .order_by(Task.updated_at.desc())
        .all()
    )
    if not tasks:
        return []

    # Rezolva assignee + proiect + numarul de comentarii intr-un minim de query-uri.
    assignee_ids = {t.assignee_id for t in tasks if t.assignee_id}
    users = {}
    if assignee_ids:
        rows = db.query(User).filter(User.id.in_(assignee_ids)).all()
        users = {u.id: u for u in rows}

    project_ids = {t.project_id for t in tasks if t.project_id}
    projects = {}
    if project_ids:
        rows = db.query(Project).filter(Project.id.in_(project_ids)).all()
        projects = {p.id: p for p in rows}

    counts = comment_counts(db, [t.id for t in tasks])

    result: list[dict] = []
    for t in tasks:
        project = projects.get(t.project_id)
        d = board_task_to_dict(
            db, t, counts.get(t.id, 0),
            users=users,
            project_key=project.key if project else None,
        )
        d["project"] = (
            {"id": project.id, "name": project.name, "color": project.color, "key": project.key}
            if project else None
        )
        d["projectId"] = t.project_id
        result.append(d)
    return result


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


# ── subtaskuri (checklist) ──────────────────────────────────────────

def _normalize_subtasks(raw) -> list[dict]:
    """Curata lista de subtaskuri intr-o forma canonica {id, title, done}."""
    out: list[dict] = []
    for item in (raw or []):
        if not isinstance(item, dict):
            continue
        out.append({
            "id": item.get("id") or generate_cuid(),
            "title": str(item.get("title") or "").strip(),
            "done": bool(item.get("done")),
        })
    return out


def _save_subtasks(db: Session, task: Task, items: list[dict]) -> None:
    """Persista lista de subtaskuri (JSON e mutat ca obiect nou ca SA sa observe)."""
    task.subtasks = items
    task.updated_at = datetime.utcnow()


def add_subtask(db: Session, user_id: str, project_id: str, task_id: str, title: str) -> Task:
    membership_service.require_membership(db, project_id, user_id, min_role="MEMBER")
    task = _get_board_task(db, project_id, task_id)

    title = (title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Titlul subtaskului e obligatoriu")

    items = _normalize_subtasks(task.subtasks)
    items.append({"id": generate_cuid(), "title": title, "done": False})
    _save_subtasks(db, task, items)

    db.commit()
    db.refresh(task)
    return _get_board_task(db, project_id, task.id)


def update_subtask(
    db: Session,
    user_id: str,
    project_id: str,
    task_id: str,
    subtask_id: str,
    *,
    title: str | None = None,
    done: bool | None = None,
) -> Task:
    membership_service.require_membership(db, project_id, user_id, min_role="MEMBER")
    task = _get_board_task(db, project_id, task_id)

    items = _normalize_subtasks(task.subtasks)
    target = next((s for s in items if s["id"] == subtask_id), None)
    if target is None:
        raise HTTPException(status_code=404, detail="Subtask inexistent")

    if title is not None:
        new_title = title.strip()
        if not new_title:
            raise HTTPException(status_code=400, detail="Titlul subtaskului e obligatoriu")
        target["title"] = new_title
    if done is not None:
        target["done"] = bool(done)

    _save_subtasks(db, task, items)
    db.commit()
    db.refresh(task)
    return _get_board_task(db, project_id, task.id)


def remove_subtask(db: Session, user_id: str, project_id: str, task_id: str, subtask_id: str) -> Task:
    membership_service.require_membership(db, project_id, user_id, min_role="MEMBER")
    task = _get_board_task(db, project_id, task_id)

    items = _normalize_subtasks(task.subtasks)
    new_items = [s for s in items if s["id"] != subtask_id]
    if len(new_items) == len(items):
        raise HTTPException(status_code=404, detail="Subtask inexistent")

    _save_subtasks(db, task, new_items)
    db.commit()
    db.refresh(task)
    return _get_board_task(db, project_id, task.id)


def reorder_subtasks(db: Session, user_id: str, project_id: str, task_id: str, order: list[str]) -> Task:
    membership_service.require_membership(db, project_id, user_id, min_role="MEMBER")
    task = _get_board_task(db, project_id, task_id)

    items = _normalize_subtasks(task.subtasks)
    by_id = {s["id"]: s for s in items}
    # Subtaskurile in ordinea ceruta, urmate de eventuale ramase (robust la id-uri lipsa).
    reordered = [by_id[sid] for sid in (order or []) if sid in by_id]
    for s in items:
        if s["id"] not in {x["id"] for x in reordered}:
            reordered.append(s)

    _save_subtasks(db, task, reordered)
    db.commit()
    db.refresh(task)
    return _get_board_task(db, project_id, task.id)
