from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import verify_token
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.services import project_service

router = APIRouter(prefix="/api/projects", tags=["projects"])
security = HTTPBearer()


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
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    projects = project_service.get_all_projects(db)
    result = []
    for p in projects:
        count = project_service.get_project_task_count(db, p.id)
        result.append(project_to_dict(p, count))
    return result


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    project, tasks = project_service.get_project_with_tasks(db, project_id)
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
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    project = project_service.create_project(db, data.model_dump())
    return project_to_dict(project)


@router.put("/{project_id}")
async def update_project(
    project_id: str,
    data: ProjectUpdate,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    project = project_service.update_project(db, project_id, data.model_dump(exclude_unset=True))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project_to_dict(project)


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    success = project_service.delete_project(db, project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"message": "Project deleted"}
