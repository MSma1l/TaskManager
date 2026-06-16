"""API Web Push (VAPID).

  GET  /api/push/public-key   → cheia publica VAPID (sau "" daca push dezactivat)
  POST /api/push/subscribe    → salveaza abonamentul service worker-ului
  POST /api/push/unsubscribe  → sterge abonamentul

Subscribe/unsubscribe cer autentificare (abonamentul e legat de userul curent).
public-key e public (frontend-ul are nevoie de el inainte sa stie cine e userul).
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services import push_service

router = APIRouter(prefix="/api/push", tags=["push"])


class SubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class SubscribeBody(BaseModel):
    endpoint: str
    keys: SubscriptionKeys


class UnsubscribeBody(BaseModel):
    endpoint: str


@router.get("/public-key")
async def public_key():
    """Cheia publica VAPID pentru applicationServerKey. Goala = push dezactivat."""
    return {"publicKey": push_service.get_public_key(), "enabled": push_service.push_enabled()}


@router.post("/subscribe")
async def subscribe(
    body: SubscribeBody,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    push_service.save_subscription(
        db, user.id,
        endpoint=body.endpoint,
        p256dh=body.keys.p256dh,
        auth=body.keys.auth,
    )
    return {"ok": True}


@router.post("/unsubscribe")
async def unsubscribe(
    body: UnsubscribeBody,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    removed = push_service.delete_subscription(db, user.id, body.endpoint)
    return {"ok": True, "removed": removed}
