"""Public sign-up endpoint + admin approval workflow."""
import asyncio
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_admin
from app.models.access_request import AccessRequest
from app.models.user import User
from app.schemas.access_request import (
    AccessRequestCreate,
    AccessRequestApprove,
    AccessRequestReject,
)
from app.services import access_service

router = APIRouter(prefix="/api/access-requests", tags=["access-requests"])


def _request_to_dict(r: AccessRequest) -> dict:
    return {
        "id": r.id,
        "firstName": r.first_name,
        "lastName": r.last_name,
        "email": r.email,
        "phone": r.phone,
        "telegramChatId": r.telegram_chat_id,
        "purpose": r.purpose,
        "reason": r.reason,
        "status": r.status,
        "rejectionReason": r.rejection_reason,
        "processedByUserId": r.processed_by_user_id,
        "processedAt": r.processed_at.isoformat() if r.processed_at else None,
        "createdUserId": r.created_user_id,
        "createdAt": r.created_at.isoformat() if r.created_at else None,
    }


# ── Public submission ────────────────────────────────────────────────────────

@router.post("")
async def submit_request(data: AccessRequestCreate, db: Session = Depends(get_db)):
    first = (data.firstName or "").strip()
    last = (data.lastName or "").strip()
    if not first or not last:
        raise HTTPException(status_code=400, detail="Numele si prenumele sunt obligatorii")
    purpose = (data.purpose or "personal").strip().lower()
    if purpose not in {"personal", "collective"}:
        raise HTTPException(status_code=400, detail="Scop invalid (personal sau collective)")

    # Soft anti-spam: cap pending requests from same email (dacă e dat).
    email = (data.email or "").strip()[:150] or None
    if email:
        existing = (
            db.query(AccessRequest)
            .filter(
                AccessRequest.email == email,
                AccessRequest.status == "PENDING",
            )
            .first()
        )
        if existing:
            return {"id": existing.id, "status": "PENDING", "message": "Cerere deja trimisa, asteapta aprobare."}

    # SECURITATE: nu avem încredere în telegram_chat_id trimis de client (spoofing).
    # Legarea Telegram se face DOAR prin flux verificat server-side (/link <cod>
    # după aprobare, sau deep-link semnat din bot). Aici e mereu None.
    request = AccessRequest(
        first_name=first[:100],
        last_name=last[:100],
        email=email,
        phone=(data.phone or "").strip()[:40] or None,
        telegram_chat_id=None,
        purpose=purpose,
        reason=(data.reason or "").strip()[:2000] or None,
    )
    db.add(request)
    db.commit()
    db.refresh(request)

    # Notify admins on Telegram so they know to review
    asyncio.create_task(_notify_admins_new_request(db, request))

    return {
        "id": request.id,
        "status": request.status,
        "message": "Cerere trimisa. Te vom contacta cand admin-ul aproba contul.",
    }


async def _notify_admins_new_request(db: Session, r: AccessRequest):
    """Best-effort Telegram ping to all admins with linked chats."""
    try:
        from app.telegram.bot import send_message
        admins = db.query(User).filter(User.role == "ADMIN", User.is_active == True).all()
        text = (
            f"Cerere noua de acces: {r.first_name} {r.last_name}\n"
            f"Email: {r.email or '—'} · Telefon: {r.phone or '—'}\n"
            f"Scop: {r.purpose}\n"
            f"Motiv: {(r.reason or '')[:300] or '—'}"
        )
        for admin in admins:
            if admin.telegram_chat_id:
                try:
                    await send_message(text, chat_id=admin.telegram_chat_id, role="ADMIN")
                except Exception as e:
                    print(f"Failed to notify admin {admin.username}: {e}")
    except Exception as e:
        print(f"_notify_admins_new_request error: {e}")


# ── Admin endpoints ──────────────────────────────────────────────────────────

@router.get("")
async def list_requests(
    status: str | None = None,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(AccessRequest)
    if status:
        q = q.filter(AccessRequest.status == status.upper())
    requests = q.order_by(AccessRequest.created_at.desc()).all()
    return [_request_to_dict(r) for r in requests]


@router.get("/{req_id}")
async def get_request(
    req_id: str, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    r = db.query(AccessRequest).filter(AccessRequest.id == req_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Cerere inexistenta")
    return _request_to_dict(r)


@router.post("/{req_id}/approve")
async def approve_request(
    req_id: str,
    data: AccessRequestApprove,
    actor: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    r = db.query(AccessRequest).filter(AccessRequest.id == req_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Cerere inexistenta")

    pin = (data.pin or "").strip() or None
    # Username opțional: dacă lipsește, serviciul îl generează automat din nume.
    try:
        new_user = access_service.approve_access_request(
            db, r, actor.id,
            username=(data.username or "").strip().lower() or None,
            role=(data.role or "USER"),
            pin=pin,
        )
    except ValueError as e:
        msg = str(e)
        code = 409 if "folosit" in msg else 400
        raise HTTPException(status_code=code, detail=msg)

    # Welcome message via Telegram if linked
    if new_user.telegram_chat_id:
        asyncio.create_task(_send_welcome_to_user(new_user, pin))

    return {
        "request": _request_to_dict(r),
        "user": {
            "id": new_user.id,
            "username": new_user.username,
            "role": new_user.role,
            "telegramLinked": bool(new_user.telegram_chat_id),
        },
    }


async def _send_welcome_to_user(user: User, pin: str | None):
    try:
        from app.telegram.bot import send_message
        lines = [
            f"Bine ai venit, {user.full_name or user.username}!",
            f"Contul tau in Task Manager este activ.",
            f"Username: {user.username}",
        ]
        if pin:
            lines.append(f"PIN initial: {pin} (foloseste-l la refresh dupa 12h, schimba-l din profil)")
        lines.append("")
        lines.append("Logheaza-te la /login si introdu username-ul. Codul de logare il vei primi aici, pe Telegram.")
        await send_message("\n".join(lines), chat_id=user.telegram_chat_id, role=user.role)
    except Exception as e:
        print(f"_send_welcome_to_user error: {e}")


@router.post("/{req_id}/reject")
async def reject_request(
    req_id: str,
    data: AccessRequestReject,
    actor: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    r = db.query(AccessRequest).filter(AccessRequest.id == req_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Cerere inexistenta")
    try:
        access_service.reject_access_request(db, r, actor.id, data.reason)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Optional: notify the requester if they provided a chat id
    if r.telegram_chat_id:
        asyncio.create_task(_send_rejection(r))

    return _request_to_dict(r)


async def _send_rejection(r: AccessRequest):
    try:
        from app.telegram.bot import send_message
        text = "Cererea ta de acces a fost respinsa."
        if r.rejection_reason:
            text += f"\nMotiv: {r.rejection_reason}"
        await send_message(text, chat_id=r.telegram_chat_id)
    except Exception as e:
        print(f"_send_rejection error: {e}")
