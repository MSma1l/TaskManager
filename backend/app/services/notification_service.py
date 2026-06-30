"""Serviciu pentru notificările in-app. Sursă unică folosită atât de triggere
(membership_service, board_service) cât și de API.

`create_safe` e wrapper-ul non-fatal pentru triggere: o eroare de notificare NU
trebuie să strice operația principală (add_member / assign_task), exact ca
`board_service._log`.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models.notification import Notification


def create(
    db: Session,
    *,
    user_id: str,
    type: str,
    title: str,
    body: Optional[str] = None,
    link: Optional[str] = None,
    meta: Optional[dict] = None,
    priority: str = "STANDARD",
    commit: bool = True,
) -> Notification:
    n = Notification(
        user_id=user_id, type=type, title=title, body=body, link=link, meta=meta,
        priority=priority, is_read=False, created_at=datetime.utcnow(),
    )
    db.add(n)
    if commit:
        db.commit()
        db.refresh(n)
    return n


def broadcast(
    db: Session,
    *,
    user_ids: list[str],
    title: str,
    body: Optional[str] = None,
    priority: str = "STANDARD",
    type: str = "ADMIN_BROADCAST",
    link: Optional[str] = None,
    meta: Optional[dict] = None,
) -> int:
    """Creeaza aceeasi notificare in-app pentru fiecare destinatar distinct.

    Telegram-ul (pentru URGENT) e tratat in endpoint, nu aici. Returneaza numarul
    de notificari create.
    """
    created = 0
    seen: set[str] = set()
    for uid in user_ids:
        if not uid or uid in seen:
            continue
        seen.add(uid)
        create(
            db,
            user_id=uid,
            type=type,
            title=title,
            body=body,
            link=link,
            meta=meta,
            priority=priority,
            commit=False,
        )
        created += 1
    db.commit()
    return created


def create_safe(db: Session, **kwargs) -> Optional[Notification]:
    """Variantă non-fatală pentru triggere — nu aruncă niciodată."""
    try:
        return create(db, **kwargs)
    except Exception as e:  # noqa: BLE001
        print(f"[notification] create_safe error: {e}")
        return None


def list_for_user(db: Session, user_id: str, *, only_unread: bool = False, limit: int = 50) -> list[Notification]:
    q = db.query(Notification).filter(Notification.user_id == user_id)
    if only_unread:
        q = q.filter(Notification.is_read == False)  # noqa: E712
    return q.order_by(Notification.created_at.desc()).limit(limit).all()


def unread_count(db: Session, user_id: str) -> int:
    return (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.is_read == False)  # noqa: E712
        .count()
    )


def mark_read(db: Session, user_id: str, notification_id: str) -> Optional[Notification]:
    n = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user_id)
        .first()
    )
    if not n:
        return None
    if not n.is_read:
        n.is_read = True
        n.read_at = datetime.utcnow()
        db.commit()
        db.refresh(n)
    return n


def mark_all_read(db: Session, user_id: str) -> int:
    updated = (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.is_read == False)  # noqa: E712
        .update({"is_read": True, "read_at": datetime.utcnow()})
    )
    db.commit()
    return updated


def to_dict(n: Notification) -> dict:
    return {
        "id": n.id,
        "type": n.type,
        "title": n.title,
        "body": n.body,
        "link": n.link,
        "meta": n.meta,
        "priority": n.priority or "STANDARD",
        "isRead": n.is_read,
        "createdAt": n.created_at.isoformat() if n.created_at else None,
        "readAt": n.read_at.isoformat() if n.read_at else None,
    }
