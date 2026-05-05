from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.services import project_service

router = APIRouter(prefix="/api/projects", tags=["projects"])


def project_to_dict(project, task_count: int = 0):
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "githubUrl": project.github_url,
        "color": project.color,
        "isActive": project.is_active,
        "taskCount": task_count,
        "createdAt": project.created_at.isoformat() if project.created_at else None,
        "updatedAt": project.updated_at.isoformat() if project.updated_at else None,
    }


@router.get("")
async def get_projects(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    projects = project_service.get_all_projects(db, user.id)
    result = []
    for p in projects:
        count = project_service.get_project_task_count(db, user.id, p.id)
        result.append(project_to_dict(p, count))
    return result


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project, tasks = project_service.get_project_with_tasks(db, user.id, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    from app.api.tasks import task_to_dict
    return {
        **project_to_dict(project, len(tasks)),
        "tasks": [task_to_dict(t) for t in tasks],
    }


@router.post("")
async def create_project(
    data: ProjectCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = project_service.create_project(db, user.id, data.model_dump())
    return project_to_dict(project)


@router.put("/{project_id}")
async def update_project(
    project_id: str,
    data: ProjectUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = project_service.update_project(db, user.id, project_id, data.model_dump(exclude_unset=True))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project_to_dict(project)


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    success = project_service.delete_project(db, user.id, project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"message": "Project deleted"}
