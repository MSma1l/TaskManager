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


def get_project_task_count(db: Session, user_id: str, project_id: str) -> int:
    return (
        db.query(Task)
        .filter(
            Task.project_id == project_id,
            Task.is_active == True,
        )
        .count()
    )
