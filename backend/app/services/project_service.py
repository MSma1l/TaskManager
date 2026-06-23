import re
from datetime import datetime
from sqlalchemy.orm import Session, joinedload
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.task import Task
from app.services import membership_service


def get_all_projects(db: Session, user_id: str, statuses: list[str] | None = None):
    ids = membership_service.get_accessible_project_ids(db, user_id)
    if not ids:
        return []
    query = db.query(Project).filter(Project.is_active == True, Project.id.in_(ids))
    if statuses:
        query = query.filter(Project.status.in_(statuses))
    return query.order_by(Project.created_at.desc()).all()


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
    project = Project(
        user_id=user_id,
        name=data["name"],
        description=data.get("description"),
        github_url=data.get("githubUrl"),
        color=data.get("color", "#3b82f6"),
        key=key,
        task_counter=0,
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

    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(project)
    return project


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
