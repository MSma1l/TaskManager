from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.base import ProjectRole
from app.models.user import User
from app.schemas.member import MemberInvite, MemberRoleUpdate
from app.services import membership_service

router = APIRouter(prefix="/api/projects/{project_id}/members", tags=["members"])

# Roluri care pot fi atribuite la invitare / schimbare (OWNER nu se acorda manual)
ASSIGNABLE_ROLES = {ProjectRole.ADMIN.value, ProjectRole.MEMBER.value, ProjectRole.VIEWER.value}


def member_to_dict(member, user, current_user_id):
    return {
        "userId": member.user_id,
        "username": user.username if user else None,
        "fullName": user.full_name if user else None,
        "role": member.role,
        "capacityPoints": member.capacity_points,
        "isYou": member.user_id == current_user_id,
    }


def _user_map(db: Session, user_ids):
    if not user_ids:
        return {}
    users = db.query(User).filter(User.id.in_(user_ids)).all()
    return {u.id: u for u in users}


@router.get("")
async def get_members(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership_service.require_membership(db, project_id, user.id, min_role="VIEWER")
    members = membership_service.list_members(db, project_id)
    users = _user_map(db, [m.user_id for m in members])
    return [member_to_dict(m, users.get(m.user_id), user.id) for m in members]


@router.post("")
async def invite_member(
    project_id: str,
    data: MemberInvite,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership_service.require_membership(db, project_id, user.id, min_role="ADMIN")

    role = data.role or "MEMBER"
    if role not in ASSIGNABLE_ROLES:
        raise HTTPException(status_code=400, detail="Rol invalid")

    target = (
        db.query(User)
        .filter(
            func.lower(User.username) == data.username.lower(),
            User.is_active == True,
        )
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="Utilizator inexistent")

    if membership_service.get_member(db, project_id, target.id) is not None:
        raise HTTPException(status_code=409, detail="Deja membru")

    member = membership_service.add_member(
        db, project_id, target.id, role=role, invited_by=user.id
    )
    return member_to_dict(member, target, user.id)


@router.put("/{user_id}")
async def update_member_role(
    project_id: str,
    user_id: str,
    data: MemberRoleUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Apelantul trebuie sa fie cel putin membru; nivelul concret e validat per actiune.
    caller = membership_service.require_membership(db, project_id, user.id, min_role="VIEWER")

    member = membership_service.get_member(db, project_id, user_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Membru inexistent")

    # ── schimbare rol: doar OWNER ───────────────────────────────────
    if data.role is not None:
        if membership_service.ROLE_RANK.get(caller.role, -1) < membership_service.ROLE_RANK["OWNER"]:
            raise HTTPException(status_code=403, detail="Doar OWNER poate schimba rolul")
        if data.role not in {r.value for r in ProjectRole}:
            raise HTTPException(status_code=400, detail="Rol invalid")

        # Protectie ultimul OWNER: nu poti retrograda singurul OWNER
        if (
            member.role == "OWNER"
            and data.role != "OWNER"
            and membership_service.count_owners(db, project_id) == 1
        ):
            raise HTTPException(status_code=400, detail="Trebuie sa ramana cel putin un OWNER")

        member.role = data.role

    # ── schimbare capacitate: ADMIN+ sau el insusi ──────────────────
    if data.capacityPoints is not None:
        is_lead = membership_service.ROLE_RANK.get(caller.role, -1) >= membership_service.ROLE_RANK["ADMIN"]
        is_self = caller.user_id == user_id
        if not (is_lead or is_self):
            raise HTTPException(status_code=403, detail="Permisiuni insuficiente pentru a schimba capacitatea")
        member.capacity_points = data.capacityPoints

    db.commit()
    db.refresh(member)

    target = db.query(User).filter(User.id == user_id).first()
    return member_to_dict(member, target, user.id)


@router.delete("/{user_id}")
async def remove_member(
    project_id: str,
    user_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership_service.require_membership(db, project_id, user.id, min_role="ADMIN")

    member = membership_service.get_member(db, project_id, user_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Membru inexistent")

    # Protectie ultimul OWNER
    if member.role == "OWNER" and membership_service.count_owners(db, project_id) == 1:
        raise HTTPException(status_code=400, detail="Trebuie sa ramana cel putin un OWNER")

    db.delete(member)
    db.commit()
    return {"message": "Membru eliminat"}
