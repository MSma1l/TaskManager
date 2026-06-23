"""Proiectul de sistem "Birou" (system_key='OFFICE') + board-ul de birou.

Biroul e un proiect special, partajat de toti userii (toti sunt membri MEMBER),
in care ajung Quick Task-urile nedistribuite. Adminul le vede in "inbox" si le
atribuie unor persoane; persoana isi vede taskurile pe board-ul de birou.

Reguli:
  - Exista un singur proiect Birou (gasit dupa system_key='OFFICE').
  - Coloane: Backlog / In lucru / Finalizat / Verificat (BACKLOG/IN_PROGRESS/DONE/APPROVED).
  - Taskurile de birou NU se arhiveaza (raman pe board, vezi board_service.move_task).
"""
from datetime import datetime

from sqlalchemy.orm import Session, joinedload

from app.models.board_column import BoardColumn
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.task import Task
from app.models.user import User
from app.services import board_service


OFFICE_SYSTEM_KEY = "OFFICE"

# Coloanele board-ului de birou: (name, position, is_done_column, column_type).
OFFICE_COLUMNS = [
    ("Backlog", 0, False, "BACKLOG"),
    ("În lucru", 1, False, "IN_PROGRESS"),
    ("Finalizat", 2, True, "DONE"),
    ("Verificat", 3, False, "APPROVED"),
]


def get_office_project(db: Session) -> Project | None:
    """Proiectul Birou (system_key='OFFICE'), sau None daca nu exista inca."""
    return (
        db.query(Project)
        .filter(Project.system_key == OFFICE_SYSTEM_KEY)
        .first()
    )


def ensure_office_project(db: Session, owner_user_id: str) -> Project:
    """Asigura existenta proiectului Birou (idempotent), cu cele 4 coloane.

    Daca lipseste, il creeaza (owner = `owner_user_id`). Garanteaza si coloanele.
    Nu face commit (apelantul controleaza tranzactia)."""
    project = get_office_project(db)
    if project is None:
        project = Project(
            user_id=owner_user_id,
            name="Birou",
            description="Proiectul comun pentru cererile rapide (Quick Tasks).",
            color="#3b82f6",
            key="BIROU",
            task_counter=0,
            status="ACTIVE",
            system_key=OFFICE_SYSTEM_KEY,
            is_active=True,
        )
        db.add(project)
        db.flush()  # obtine project.id

        # Owner-ul (de obicei adminul) e membru OWNER.
        if owner_user_id and membership_missing(db, project.id, owner_user_id):
            db.add(ProjectMember(
                project_id=project.id,
                user_id=owner_user_id,
                role="OWNER",
                invited_by=owner_user_id,
                created_at=datetime.utcnow(),
            ))

    ensure_office_columns(db, project.id)
    return project


def ensure_office_columns(db: Session, project_id: str) -> None:
    """Creeaza cele 4 coloane de birou daca proiectul nu are inca niciuna."""
    existing = (
        db.query(BoardColumn.id)
        .filter(BoardColumn.project_id == project_id)
        .first()
    )
    if existing is not None:
        return
    for name, position, is_done, column_type in OFFICE_COLUMNS:
        db.add(BoardColumn(
            project_id=project_id,
            name=name,
            position=position,
            color=None,
            is_done_column=is_done,
            column_type=column_type,
            created_at=datetime.utcnow(),
        ))


def membership_missing(db: Session, project_id: str, user_id: str) -> bool:
    return (
        db.query(ProjectMember.id)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
        .first()
    ) is None


def ensure_office_membership(db: Session, user_id: str) -> None:
    """Adauga userul ca MEMBER al proiectului Birou daca nu e deja membru.

    Non-fatal: daca proiectul Birou inca nu exista (ex. seed neexecutat), nu
    arunca — doar iese. NU face commit (apelantul controleaza tranzactia)."""
    if not user_id:
        return
    try:
        project = get_office_project(db)
        if project is None:
            return
        if membership_missing(db, project.id, user_id):
            db.add(ProjectMember(
                project_id=project.id,
                user_id=user_id,
                role="MEMBER",
                invited_by=None,
                created_at=datetime.utcnow(),
            ))
    except Exception as e:  # noqa: BLE001
        print(f"[office] ensure_office_membership error: {e}")


# ── board birou ──────────────────────────────────────────────────────

def _column_to_dict(col: BoardColumn) -> dict:
    return {
        "id": col.id,
        "name": col.name,
        "columnType": col.column_type,
        "position": col.position,
        "isDoneColumn": bool(col.is_done_column),
    }


def get_office_board(db: Session, user: User) -> dict:
    """Board-ul de birou pentru userul curent.

    - columns: cele 4 coloane ordonate.
    - tasks: taskuri ATRIBUITE (nu in inbox). Non-admin: doar cele unde e responsabil.
             Admin: toate taskurile atribuite din birou.
    - inbox: taskuri FARA niciun responsabil (Quick Tasks in asteptare). Admin: toate;
             non-admin: gol.
    """
    is_admin = (user.role == "ADMIN")

    project = get_office_project(db)
    if project is None:
        return {
            "projectId": None,
            "isAdmin": is_admin,
            "columns": [],
            "tasks": [],
            "inbox": [],
        }

    board_service.ensure_columns(db, project.id)
    # Asigura ca userul curent e membru (pentru a putea folosi endpoint-urile reuse).
    if membership_missing(db, project.id, user.id):
        ensure_office_membership(db, user.id)
        db.commit()

    columns = (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project.id)
        .order_by(BoardColumn.position.asc())
        .all()
    )

    tasks = (
        db.query(Task)
        .filter(
            Task.project_id == project.id,
            Task.is_active == True,  # noqa: E712
            Task.board_column_id.isnot(None),
        )
        .options(joinedload(Task.labels), joinedload(Task.assignees))
        .order_by(Task.board_order.asc())
        .all()
    )

    # Pre-incarca userii (toti responsabilii) + numarul de comentarii.
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

    counts = board_service.comment_counts(db, [t.id for t in tasks])

    assigned: list[dict] = []
    inbox: list[dict] = []
    for t in tasks:
        t_assignee_ids = {a.id for a in (t.assignees or [])}
        if t.assignee_id:
            t_assignee_ids.add(t.assignee_id)

        d = board_service.board_task_to_dict(
            db, t, counts.get(t.id, 0), users=users, project_key=project.key
        )

        if not t_assignee_ids:
            # Fara responsabil = inbox (doar adminul il vede).
            if is_admin:
                inbox.append(d)
            continue

        # Are responsabil: e in lista de "tasks".
        if is_admin or user.id in t_assignee_ids:
            assigned.append(d)

    return {
        "projectId": project.id,
        "isAdmin": is_admin,
        "columns": [_column_to_dict(c) for c in columns],
        "tasks": assigned,
        "inbox": inbox,
    }
