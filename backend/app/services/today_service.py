"""Board-ul comun "Astazi" (Today): taskurile atribuite mie din proiectele
marcate cu show_on_today=True SAU din proiectul Birou (system_key='OFFICE',
mereu inclus), grupate pe aceleasi zone de workflow ca board-ul "Repartizate".

Reutilizeaza forma raspunsului si helperele de serializare din assigned_service,
ca sa pastreze paritate completa (inclusiv campurile de atasamente)."""
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.models.board_column import BoardColumn
from app.models.project import Project
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.models.user import User
from app.services import board_service
from app.services.assigned_service import ZONES, _map_column_type_to_zone
from app.services.office_service import OFFICE_SYSTEM_KEY


def get_today_board(db: Session, user_id: str) -> dict:
    """Acelasi shape ca get_assigned_board (zones / projects / archived), dar
    filtrat la taskurile atribuite userului din proiectele eligibile pentru Astazi."""
    # Proiectele eligibile: show_on_today=True SAU proiectul Birou (OFFICE).
    eligible_project_ids = {
        pid for (pid,) in (
            db.query(Project.id)
            .filter(
                Project.is_active == True,  # noqa: E712
                or_(
                    Project.show_on_today == True,  # noqa: E712
                    Project.system_key == OFFICE_SYSTEM_KEY,
                ),
            )
            .all()
        )
    }

    if not eligible_project_ids:
        return {
            "zones": [{"zone": z, "label": label, "tasks": []} for z, label in ZONES],
            "projects": [],
            "archived": [],
        }

    # Taskurile atribuite mie: prin task_assignees SAU prin assignee_id (legacy).
    assigned_task_ids = {
        tid for (tid,) in (
            db.query(TaskAssignee.task_id)
            .filter(TaskAssignee.user_id == user_id)
            .all()
        )
    }

    all_tasks = (
        db.query(Task)
        .filter(
            Task.is_active == True,  # noqa: E712
            Task.board_column_id.isnot(None),
            Task.project_id.in_(eligible_project_ids),
            or_(
                Task.assignee_id == user_id,
                Task.id.in_(assigned_task_ids) if assigned_task_ids else False,
            ),
        )
        .options(joinedload(Task.labels), joinedload(Task.assignees))
        .all()
    )

    active_tasks = [t for t in all_tasks if t.archived_at is None]
    archived_tasks = [t for t in all_tasks if t.archived_at is not None]

    # Pre-incarca coloanele, proiectele, userii, comentariile (minimizeaza N+1).
    column_ids = {t.board_column_id for t in all_tasks if t.board_column_id}
    columns = {}
    if column_ids:
        rows = db.query(BoardColumn).filter(BoardColumn.id.in_(column_ids)).all()
        columns = {c.id: c for c in rows}

    project_ids = {t.project_id for t in all_tasks if t.project_id}
    projects = {}
    if project_ids:
        rows = db.query(Project).filter(Project.id.in_(project_ids)).all()
        projects = {p.id: p for p in rows}

    assignee_ids: set[str] = set()
    for t in all_tasks:
        if t.assignee_id:
            assignee_ids.add(t.assignee_id)
        for a in (t.assignees or []):
            assignee_ids.add(a.id)
    users = {}
    if assignee_ids:
        rows = db.query(User).filter(User.id.in_(assignee_ids)).all()
        users = {u.id: u for u in rows}

    counts = board_service.comment_counts(db, [t.id for t in all_tasks])

    def _serialize(t: Task) -> dict:
        project = projects.get(t.project_id)
        column = columns.get(t.board_column_id)
        d = board_service.board_task_to_dict(
            db, t, counts.get(t.id, 0),
            users=users,
            project_key=project.key if project else None,
        )
        d["projectId"] = t.project_id
        d["projectName"] = project.name if project else None
        d["columnName"] = column.name if column else None
        d["archivedAt"] = t.archived_at.isoformat() if t.archived_at else None
        return d

    # Grupeaza taskurile active pe zone.
    zone_tasks: dict[str, list[dict]] = {z: [] for z, _ in ZONES}
    for t in active_tasks:
        column = columns.get(t.board_column_id)
        zone = _map_column_type_to_zone(
            column.column_type if column else None,
            column.position if column else 0,
        )
        zone_tasks[zone].append(_serialize(t))

    zones = [
        {"zone": z, "label": label, "tasks": zone_tasks[z]}
        for z, label in ZONES
    ]

    # Proiecte distincte ale taskurilor mele ACTIVE (pentru dropdown-ul de filtru).
    distinct_project_ids = {t.project_id for t in active_tasks if t.project_id}
    projects_list = [
        {"id": p.id, "name": p.name}
        for pid in distinct_project_ids
        for p in [projects.get(pid)]
        if p is not None
    ]
    projects_list.sort(key=lambda x: (x["name"] or "").lower())

    archived = [_serialize(t) for t in archived_tasks]

    return {
        "zones": zones,
        "projects": projects_list,
        "archived": archived,
    }
