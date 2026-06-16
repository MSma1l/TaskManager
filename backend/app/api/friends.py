from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.friend import FriendRequestCreate
from app.services import friend_service

router = APIRouter(prefix="/api/friends", tags=["friends"])


@router.get("")
async def get_friends(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lista colaboratorilor acceptati (din ambele directii)."""
    return friend_service.list_friends(db, user.id)


@router.get("/incoming")
async def get_incoming(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cereri primite, in asteptare."""
    return friend_service.list_incoming(db, user.id)


@router.get("/outgoing")
async def get_outgoing(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cereri trimise, in asteptare."""
    return friend_service.list_outgoing(db, user.id)


@router.post("")
async def send_friend_request(
    data: FriendRequestCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trimite o cerere de colaborare catre {username}."""
    fr = friend_service.send_request(db, user.id, data.username, data.relation or "colleague")
    return friend_service.to_dict(fr)


@router.post("/{friendship_id}/accept")
async def accept_friend_request(
    friendship_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    fr = friend_service.respond(db, user.id, friendship_id, accept=True)
    return friend_service.to_dict(fr)


@router.post("/{friendship_id}/reject")
async def reject_friend_request(
    friendship_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    fr = friend_service.respond(db, user.id, friendship_id, accept=False)
    return friend_service.to_dict(fr)


@router.delete("/{friend_user_id}")
async def remove_friend(
    friend_user_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    removed = friend_service.remove(db, user.id, friend_user_id)
    return {"message": "Colaborator eliminat" if removed else "Nu exista o relatie activa"}
