import re
from datetime import datetime, timezone
from sqlalchemy.orm import Session, joinedload
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.task import Task
from app.services import membership_service
from app.services.project_zone import compute_zone, resolve_zone, VALID_PRIORITIES


def _to_naive_utc(dt):
    """Normalizeaza un datetime la naive UTC (consistent cu restul codebase-ului).
    Daca vine cu timezone, il converteste la UTC si scoate tzinfo. None ramane None."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _clean_priority(value):
    """Valideaza override-ul de prioritate; None daca lipseste / e invalid."""
    if not value:
        return None
    v = str(value).strip().upper()
    return v if v in VALID_PRIORITIES else None


def get_all_projects(db: Session, user_id: str, statuses: list[str] | None = None):
    ids = membership_service.get_accessible_project_ids(db, user_id)
    if not ids:
        return []
    query = db.query(Project).filter(Project.is_active == True, Project.id.in_(ids))
    if statuses:
        query = query.filter(Project.status.in_(statuses))
    # Ordine: pozitia in zona (nulls last), apoi cele mai noi. Frontend-ul re-sorteaza
    # in cadrul fiecarei zone, dar emitem o ordine stabila de baza.
    return query.order_by(
        Project.zone_order.asc().nullslast(), Project.created_at.desc()
    ).all()


def get_project(db: Session, user_id: str, project_id: str):
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.is_active == True)
        .first()
    )
    if not project:
        return None
    if membership_service.get_member(db, project_id, user_id) is None:
        return None
    return project


def get_project_with_tasks(db: Session, user_id: str, project_id: str):
    project = get_project(db, user_id, project_id)
    if not project:
        return None, []
    tasks = (
        db.query(Task)
        .filter(
            Task.project_id == project_id,
            Task.is_active == True,
            Task.board_column_id.is_(None),
        )
        .options(joinedload(Task.category))
        .order_by(Task.day_of_week, Task.title)
        .all()
    )
    return project, tasks


def _derive_key(name: str) -> str:
    """Cheie din nume: caractere alfanumerice, uppercase, max 4, fallback PRJ."""
    if not name:
        return "PRJ"
    alnum = re.sub(r"[^A-Za-z0-9]", "", name)
    if not alnum:
        return "PRJ"
    return alnum[:4].upper()


def create_project(db: Session, user_id: str, data: dict) -> Project:
    raw_key = (data.get("key") or "").strip()
    key = raw_key.upper()[:10] if raw_key else _derive_key(data["name"])
    deadline = _to_naive_utc(data.get("deadline"))
    priority = _clean_priority(data.get("priority"))
    project = Project(
        user_id=user_id,
        name=data["name"],
        description=data.get("description"),
        github_url=data.get("githubUrl"),
        color=data.get("color", "#3b82f6"),
        key=key,
        task_counter=0,
        deadline=deadline,
        priority=priority,
        # Bookkeeping: zona initiala calculata, pentru detectarea tranzitiilor.
        last_zone=compute_zone(deadline, priority, datetime.utcnow()),
    )
    db.add(project)
    db.flush()  # ensure project.id is populated before linking the owner membership

    owner = ProjectMember(
        project_id=project.id,
        user_id=user_id,
        role="OWNER",
        invited_by=user_id,
        created_at=datetime.utcnow(),
    )
    db.add(owner)

    db.commit()
    db.refresh(project)
    return project


def update_project(db: Session, user_id: str, project_id: str, data: dict) -> Project | None:
    membership_service.require_membership(db, project_id, user_id, min_role="ADMIN")
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.is_active == True)
        .first()
    )
    if not project:
        return None

    if "name" in data and data["name"] is not None:
        project.name = data["name"]
    if "description" in data:
        project.description = data["description"]
    if "githubUrl" in data:
        project.github_url = data["githubUrl"]
    if "color" in data and data["color"] is not None:
        project.color = data["color"]
    if "isActive" in data and data["isActive"] is not None:
        project.is_active = data["isActive"]
    if "key" in data and data["key"]:
        project.key = data["key"].strip().upper()[:10]
    if "status" in data and data["status"] is not None:
        if data["status"] in ("ACTIVE", "ON_HOLD", "ARCHIVED"):
            project.status = data["status"]
    if "showOnToday" in data and data["showOnToday"] is not None:
        project.show_on_today = data["showOnToday"]

    # Deadline / prioritate / pin: aplica doar cheile prezente (exclude_unset).
    # Trimiterea explicita a `deadline: null` sterge deadline-ul ("pe asteptare");
    # `pinnedZone: null` scoate pin-ul manual (unpin).
    zone_dirty = False
    if "deadline" in data:
        project.deadline = _to_naive_utc(data["deadline"])
        zone_dirty = True
    if "priority" in data:
        project.priority = _clean_priority(data["priority"])
        zone_dirty = True
    if "pinnedZone" in data:
        project.pinned_zone = _clean_priority(data["pinnedZone"])
        zone_dirty = True

    # La schimbare de deadline/prioritate/pin, recalculeaza si stocheaza zona curenta.
    if zone_dirty:
        project.last_zone = resolve_zone(
            project.pinned_zone, project.deadline, project.priority, datetime.utcnow()
        )

    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(project)
    return project


def reorder_zone(
    db: Session,
    user_id: str,
    moved_id: str,
    target_zone: str | None,
    ordered_ids: list[str],
    repin: bool,
) -> None:
    """Reordoneaza proiectele intr-o zona (drag & drop) si optional re-pin-uieste
    proiectul mutat pe zona tinta.

    - Necesita ADMIN pe proiectul mutat (`moved_id`).
    - `repin=True`: seteaza pinned_zone = target_zone (validat; None = unpin) si
      recalculeaza last_zone.
    - Pentru fiecare id din `ordered_ids` la care userul are acces (e membru),
      seteaza zone_order = indexul lui in lista.
    """
    membership_service.require_membership(db, moved_id, user_id, min_role="ADMIN")

    moved = (
        db.query(Project)
        .filter(Project.id == moved_id, Project.is_active == True)  # noqa: E712
        .first()
    )
    if not moved:
        return

    if repin:
        moved.pinned_zone = _clean_priority(target_zone)
        moved.last_zone = resolve_zone(
            moved.pinned_zone, moved.deadline, moved.priority, datetime.utcnow()
        )
        moved.updated_at = datetime.utcnow()

    # Proiectele la care userul are acces (e membru), ca sa nu rescriem ordinea altora.
    accessible = set(membership_service.get_accessible_project_ids(db, user_id))
    for index, pid in enumerate(ordered_ids or []):
        if pid not in accessible:
            continue
        project = (
            db.query(Project)
            .filter(Project.id == pid, Project.is_active == True)  # noqa: E712
            .first()
        )
        if project is None:
            continue
        project.zone_order = index

    db.commit()


def delete_project(db: Session, user_id: str, project_id: str) -> bool:
    membership_service.require_membership(db, project_id, user_id, min_role="OWNER")
    project = (
        db.query(Project)
        .filter(Project.id == project_id)
        .first()
    )
    if not project:
        return False
    project.is_active = False
    project.updated_at = datetime.utcnow()
    db.commit()
    return True


def finalize_project(db: Session, user_id: str, project_id: str) -> Project | None:
    """Finalizeaza un proiect: status -> ARCHIVED si STERGE PERMANENT (hard delete)
    toate taskurile arhivate (archived_at setat = Verificate).

    Doar OWNER/ADMIN al proiectului. Taskurile ne-arhivate NU se sterg.
    Sterge intai randurile copil (FK) pentru taskurile vizate, apoi taskurile.
    Intoarce proiectul actualizat (sau None daca nu exista)."""
    membership_service.require_membership(db, project_id, user_id, min_role="ADMIN")
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.is_active == True)  # noqa: E712
        .first()
    )
    if not project:
        return None

    # Id-urile taskurilor arhivate (Verificate) ale proiectului.
    archived_ids = [
        tid for (tid,) in (
            db.query(Task.id)
            .filter(
                Task.project_id == project_id,
                Task.archived_at.isnot(None),
            )
            .all()
        )
    ]

    if archived_ids:
        from app.models.completion import TaskCompletion
        from app.models.label import TaskLabel
        from app.models.task_activity import TaskActivity
        from app.models.task_assignee import TaskAssignee
        from app.models.task_comment import TaskComment
        from app.models.task_watcher import TaskWatcher
        from app.models.quick_task import QuickTask

        # Sterge randurile copil (in ordinea sigura fata de FK) inainte de taskuri.
        db.query(TaskAssignee).filter(TaskAssignee.task_id.in_(archived_ids)).delete(synchronize_session=False)
        db.query(TaskWatcher).filter(TaskWatcher.task_id.in_(archived_ids)).delete(synchronize_session=False)
        db.query(TaskLabel).filter(TaskLabel.task_id.in_(archived_ids)).delete(synchronize_session=False)
        db.query(TaskComment).filter(TaskComment.task_id.in_(archived_ids)).delete(synchronize_session=False)
        db.query(TaskActivity).filter(TaskActivity.task_id.in_(archived_ids)).delete(synchronize_session=False)
        db.query(TaskCompletion).filter(TaskCompletion.task_id.in_(archived_ids)).delete(synchronize_session=False)
        # Quick task-urile pastreaza un FK catre task_id -> dezleaga-l ca sa nu pice FK.
        db.query(QuickTask).filter(QuickTask.task_id.in_(archived_ids)).update(
            {QuickTask.task_id: None}, synchronize_session=False
        )
        # In final, sterge taskurile (subtaskurile sunt JSON pe task -> pleaca cu el).
        db.query(Task).filter(Task.id.in_(archived_ids)).delete(synchronize_session=False)

    project.status = "ARCHIVED"
    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(project)
    return project


def get_project_task_count(db: Session, user_id: str, project_id: str) -> int:
    return (
        db.query(Task)
        .filter(
            Task.project_id == project_id,
            Task.is_active == True,
        )
        .count()
    )
