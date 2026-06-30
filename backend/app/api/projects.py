from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectUpdate, ZoneReorder
from app.services import project_service, membership_service
from app.services.project_zone import resolve_zone, days_remaining

router = APIRouter(prefix="/api/projects", tags=["projects"])


def project_to_dict(project, task_count: int = 0, role: str = None, member_count: int = 0):
    now = datetime.utcnow()
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "githubUrl": project.github_url,
        "color": project.color,
        "key": project.key,
        "isActive": project.is_active,
        "status": project.status,
        "showOnToday": project.show_on_today,
        "deadline": project.deadline.isoformat() if project.deadline else None,
        "priority": project.priority,
        # Zona de prioritate efectiva: pin manual invinge deadline-ul; altfel din deadline/priority.
        "zone": resolve_zone(project.pinned_zone, project.deadline, project.priority, now),
        "pinnedZone": project.pinned_zone,
        "zoneOrder": project.zone_order,
        "daysRemaining": days_remaining(project.deadline, now),
        "taskCount": task_count,
        "role": role,
        "memberCount": member_count,
        "createdAt": project.created_at.isoformat() if project.created_at else None,
        "updatedAt": project.updated_at.isoformat() if project.updated_at else None,
    }


@router.get("")
async def get_projects(
    status: Optional[str] = Query(None, description="Comma-separated statuses (ACTIVE,ON_HOLD,ARCHIVED) to filter by"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    statuses = None
    if status:
        statuses = [s.strip().upper() for s in status.split(",") if s.strip()]
    projects = project_service.get_all_projects(db, user.id, statuses=statuses)
    result = []
    for p in projects:
        count = project_service.get_project_task_count(db, user.id, p.id)
        member = membership_service.get_member(db, p.id, user.id)
        member_count = len(membership_service.list_members(db, p.id))
        result.append(project_to_dict(
            p, count,
            role=member.role if member else None,
            member_count=member_count,
        ))
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

    member = membership_service.get_member(db, project.id, user.id)
    member_count = len(membership_service.list_members(db, project.id))

    from app.api.tasks import task_to_dict
    return {
        **project_to_dict(
            project, len(tasks),
            role=member.role if member else None,
            member_count=member_count,
        ),
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


@router.post("/zones/reorder")
async def reorder_zones(
    data: ZoneReorder,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reordoneaza proiectele intr-o zona (drag & drop) si, optional, re-pin pe zona
    tinta. Necesita ADMIN pe proiectul mutat. Intoarce {"ok": true}."""
    project_service.reorder_zone(
        db, user.id, data.movedId, data.targetZone, data.orderedIds, data.repin,
    )
    return {"ok": True}


@router.post("/{project_id}/finalize")
async def finalize_project(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Finalizeaza proiectul (status ARCHIVED) si sterge permanent taskurile
    arhivate (Verificate). Necesita OWNER/ADMIN pe proiect."""
    project = project_service.finalize_project(db, user.id, project_id)
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
