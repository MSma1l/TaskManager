"""Serviciu Web Push (VAPID).

Trimite notificari push catre browsere chiar cu aplicatia INCHISA, prin push
service-ul browserului (FCM / Mozilla / etc). Foloseste `pywebpush`.

Degradare gratioasa pe doua niveluri:
  1. Daca `pywebpush` NU e instalat (import esueaza), serviciul ramane functional
     pentru save/delete; doar `send_to_user` devine no-op. Asta lasa testele sa
     ruleze fara libraria instalata local.
  2. Daca cheile VAPID lipsesc din config, `send_to_user` e tot no-op.

Cand un endpoint returneaza 404/410 (abonament expirat), randul e sters automat.
"""
from __future__ import annotations

import json
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.base import generate_cuid
from app.models.push_subscription import PushSubscription

# Import non-fatal: daca pywebpush nu e instalat, push-ul devine no-op dar
# restul serviciului (save/delete) functioneaza normal.
try:
    from pywebpush import webpush, WebPushException  # type: ignore

    _HAS_PYWEBPUSH = True
except Exception:  # noqa: BLE001
    webpush = None  # type: ignore
    WebPushException = Exception  # type: ignore
    _HAS_PYWEBPUSH = False


def push_enabled() -> bool:
    """True doar daca avem libraria SI cheile VAPID configurate."""
    return bool(
        _HAS_PYWEBPUSH
        and (settings.VAPID_PRIVATE_KEY or "").strip()
        and (settings.VAPID_PUBLIC_KEY or "").strip()
    )


def get_public_key() -> str:
    """Cheia publica VAPID (base64url) pe care o consuma frontend-ul ca
    applicationServerKey. Goala daca push-ul nu e configurat."""
    return (settings.VAPID_PUBLIC_KEY or "").strip()


def save_subscription(
    db: Session,
    user_id: str,
    *,
    endpoint: str,
    p256dh: str,
    auth: str,
) -> PushSubscription:
    """Creeaza sau actualizeaza abonamentul pentru un endpoint dat.

    `endpoint` e unic: re-abonarea aceluiasi browser updateaza randul existent
    (cheile se pot schimba, iar proprietarul poate fi alt user pe acelasi device).
    """
    sub = (
        db.query(PushSubscription)
        .filter(PushSubscription.endpoint == endpoint)
        .first()
    )
    if sub:
        sub.user_id = user_id
        sub.p256dh = p256dh
        sub.auth = auth
    else:
        sub = PushSubscription(
            id=generate_cuid(),
            user_id=user_id,
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
        )
        db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def delete_subscription(db: Session, user_id: str, endpoint: str) -> bool:
    """Sterge abonamentul (la dezabonare). Scoped la user ca sa nu poata sterge
    altcineva endpoint-ul. Intoarce True daca a sters ceva."""
    deleted = (
        db.query(PushSubscription)
        .filter(
            PushSubscription.endpoint == endpoint,
            PushSubscription.user_id == user_id,
        )
        .delete()
    )
    db.commit()
    return bool(deleted)


def _delete_by_endpoint(db: Session, endpoint: str) -> None:
    """Curata un endpoint mort (410/404) indiferent de proprietar."""
    db.query(PushSubscription).filter(PushSubscription.endpoint == endpoint).delete()
    db.commit()


def send_to_user(
    db: Session,
    user_id: str,
    title: str,
    body: str,
    url: Optional[str] = None,
) -> int:
    """Trimite o notificare push catre TOATE abonamentele unui user.

    Best-effort si non-fatal: daca push-ul nu e configurat (lipsa libra / chei),
    intoarce 0 fara sa arunce. Endpoint-urile expirate (404/410) sunt sterse.
    Intoarce numarul de push-uri trimise cu succes.
    """
    if not push_enabled():
        return 0

    subs = (
        db.query(PushSubscription)
        .filter(PushSubscription.user_id == user_id)
        .all()
    )
    if not subs:
        return 0

    payload = json.dumps({
        "title": title,
        "body": body,
        "url": url or "/",
    })

    sent = 0
    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY.strip(),
                vapid_claims={"sub": settings.VAPID_SUBJECT or "mailto:admin@example.com"},
            )
            sent += 1
        except WebPushException as e:  # noqa: PERF203
            # 404/410 => abonament mort, il curatam ca sa nu mai reincercam
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status in (404, 410):
                try:
                    _delete_by_endpoint(db, sub.endpoint)
                except Exception:  # noqa: BLE001
                    pass
            else:
                print(f"[push] webpush error for user {user_id}: {e}")
        except Exception as e:  # noqa: BLE001
            print(f"[push] unexpected error for user {user_id}: {e}")

    return sent
