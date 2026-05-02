from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user, require_admin, hash_secret, generate_login_code
from app.models.user import User, LoginCode
from app.schemas.user import UserCreate, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])


def _user_to_dict(u: User) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "fullName": u.full_name,
        "telegramChatId": u.telegram_chat_id,
        "role": u.role,
        "isActive": u.is_active,
        "hasPin": bool(u.pin_hash),
        "lastLoginAt": u.last_login_at,
        "createdAt": u.created_at,
    }


def _normalize_username(value: str) -> str:
    return (value or "").strip().lower()


def _validate_role(role: str) -> str:
    role = (role or "USER").upper()
    if role not in {"USER", "ADMIN"}:
        raise HTTPException(status_code=400, detail="Rol invalid (USER sau ADMIN)")
    return role


def _validate_pin(pin: str | None) -> str | None:
    if pin is None or pin == "":
        return None
    pin = pin.strip()
    if not pin.isdigit() or not (4 <= len(pin) <= 8):
        raise HTTPException(status_code=400, detail="PIN-ul trebuie sa fie 4–8 cifre")
    return pin


@router.get("")
async def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.created_at.asc()).all()
    return [_user_to_dict(u) for u in users]


@router.post("")
async def create_user(data: UserCreate, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    username = _normalize_username(data.username)
    if not username or len(username) < 3:
        raise HTTPException(status_code=400, detail="Username minim 3 caractere")

    existing = db.query(User).filter(User.username == username).first()
    if existing:
        raise HTTPException(status_code=409, detail="Username deja existent")
    if data.email:
        if db.query(User).filter(User.email == data.email).first():
            raise HTTPException(status_code=409, detail="Email deja existent")

    pin = _validate_pin(data.pin)
    user = User(
        username=username,
        email=data.email or None,
        full_name=data.fullName or None,
        telegram_chat_id=data.telegramChatId or None,
        role=_validate_role(data.role),
        pin_hash=hash_secret(pin) if pin else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _user_to_dict(user)


@router.put("/{user_id}")
async def update_user(
    user_id: str,
    data: UserUpdate,
    actor: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilizator inexistent")

    if data.email is not None:
        user.email = data.email or None
    if data.fullName is not None:
        user.full_name = data.fullName or None
    if data.telegramChatId is not None:
        user.telegram_chat_id = data.telegramChatId or None
    if data.role is not None:
        user.role = _validate_role(data.role)
    if data.isActive is not None:
        if not data.isActive and user.id == actor.id:
            raise HTTPException(status_code=400, detail="Nu te poti dezactiva singur")
        user.is_active = data.isActive
    if data.pin is not None:
        pin = _validate_pin(data.pin)
        user.pin_hash = hash_secret(pin) if pin else None

    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return _user_to_dict(user)


@router.delete("/{user_id}")
async def delete_user(
    user_id: str, actor: User = Depends(require_admin), db: Session = Depends(get_db)
):
    if user_id == actor.id:
        raise HTTPException(status_code=400, detail="Nu te poti sterge singur")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilizator inexistent")
    # Soft delete by deactivation — preserves historical data
    user.is_active = False
    user.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.post("/{user_id}/reset-pin")
async def reset_pin(
    user_id: str,
    data: UserUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilizator inexistent")
    pin = _validate_pin(data.pin)
    user.pin_hash = hash_secret(pin) if pin else None
    db.commit()
    return {"ok": True}


@router.post("/{user_id}/link-code")
async def generate_telegram_link_code(
    user_id: str, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    """Admin generates a 6-digit code the user types as `/link <code>` on the bot
    to bind their Telegram chat to this account."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilizator inexistent")

    # Invalidate previous unused link codes
    db.query(LoginCode).filter(
        LoginCode.user_id == user.id,
        LoginCode.purpose == "link",
        LoginCode.used_at.is_(None),
    ).update({"used_at": datetime.utcnow()})

    code = generate_login_code()
    record = LoginCode(
        user_id=user.id,
        code_hash=hash_secret(code),
        purpose="link",
        expires_at=datetime.utcnow() + timedelta(minutes=30),
    )
    db.add(record)
    db.commit()

    return {
        "code": code,
        "expiresAt": record.expires_at,
        "instructions": (
            f"Trimite pe botul de Telegram comanda: /link {code}\n"
            f"Cod valabil 30 min."
        ),
    }
