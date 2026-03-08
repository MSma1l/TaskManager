from datetime import datetime
from sqlalchemy.orm import Session, joinedload
from app.models.project import Project
from app.models.task import Task


def get_all_projects(db: Session):
    return (
        db.query(Project)
        .filter(Project.is_active == True)
        .order_by(Project.created_at.desc())
        .all()
    )


def get_project(db: Session, project_id: str):
    return (
        db.query(Project)
        .filter(Project.id == project_id, Project.is_active == True)
        .first()
    )


def get_project_with_tasks(db: Session, project_id: str):
    project = get_project(db, project_id)
    if not project:
        return None, []
    tasks = (
        db.query(Task)
        .filter(Task.project_id == project_id, Task.is_active == True)
        .options(joinedload(Task.category))
        .order_by(Task.day_of_week, Task.title)
        .all()
    )
    return project, tasks


def create_project(db: Session, data: dict) -> Project:
    project = Project(
        name=data["name"],
        description=data.get("description"),
        github_url=data.get("githubUrl"),
        color=data.get("color", "#3b82f6"),
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def update_project(db: Session, project_id: str, data: dict) -> Project | None:
    project = db.query(Project).filter(Project.id == project_id, Project.is_active == True).first()
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

    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(project)
    return project


def delete_project(db: Session, project_id: str) -> bool:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return False
    project.is_active = False
    project.updated_at = datetime.utcnow()
    db.commit()
    return True


def get_project_task_count(db: Session, project_id: str) -> int:
    return db.query(Task).filter(Task.project_id == project_id, Task.is_active == True).count()
