from datetime import datetime
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.project_member import ProjectMember


ROLE_RANK = {"VIEWER": 0, "MEMBER": 1, "ADMIN": 2, "OWNER": 3}


def get_member(db: Session, project_id: str, user_id: str) -> ProjectMember | None:
    return (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
        .first()
    )


def get_accessible_project_ids(db: Session, user_id: str) -> list[str]:
    rows = (
        db.query(ProjectMember.project_id)
        .filter(ProjectMember.user_id == user_id)
        .all()
    )
    return [r[0] for r in rows]


def require_membership(
    db: Session, project_id: str, user_id: str, min_role: str = "VIEWER"
) -> ProjectMember:
    member = get_member(db, project_id, user_id)
    if member is None:
        raise HTTPException(status_code=403, detail="Permisiuni insuficiente in proiect")
    if ROLE_RANK.get(member.role, -1) < ROLE_RANK.get(min_role, 0):
        raise HTTPException(status_code=403, detail="Permisiuni insuficiente in proiect")
    return member


def add_member(
    db: Session,
    project_id: str,
    user_id: str,
    role: str = "MEMBER",
    invited_by: str = None,
) -> ProjectMember:
    member = ProjectMember(
        project_id=project_id,
        user_id=user_id,
        role=role,
        invited_by=invited_by,
        created_at=datetime.utcnow(),
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    # Notificare „ai fost adaugat in proiect" (non-fatal, nu la auto-adaugare).
    if invited_by and invited_by != user_id:
        try:
            from app.services import notification_service
            from app.models.project import Project
            proj = db.query(Project).filter(Project.id == project_id).first()
            pname = proj.name if proj else "un proiect"
            notification_service.create_safe(
                db, user_id=user_id, type="PROJECT_ADDED",
                title=f"Ai fost adaugat in proiectul {pname}",
                link=f"/projects/{project_id}",
                meta={"projectId": project_id, "actorId": invited_by},
                commit=True,
            )
        except Exception as e:  # noqa: BLE001
            print(f"[notification] add_member notify error: {e}")

    return member


def list_members(db: Session, project_id: str) -> list[ProjectMember]:
    return (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id)
        .all()
    )


def count_owners(db: Session, project_id: str) -> int:
    return (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.role == "OWNER",
        )
        .count()
    )
