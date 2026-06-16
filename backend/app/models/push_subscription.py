"""Web Push subscription (VAPID) — un abonament per browser/dispozitiv.

Stocheaza endpoint-ul si cheile returnate de `pushManager.subscribe()` din
service worker. Un user poate avea mai multe abonamente (mai multe device-uri /
browsere). `endpoint` e unic — re-abonarea aceluiasi browser updateaza randul
existent in loc sa creeze unul nou (vezi push_service.save_subscription).

Fara soft-delete: cand un endpoint devine invalid (410 Gone de la push service)
sau userul se dezaboneaza, randul e sters efectiv.
"""
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text
from app.core.database import Base
from app.models.base import generate_cuid


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(String, primary_key=True, default=generate_cuid)
    user_id = Column(String, nullable=False, index=True)        # detinatorul abonamentului
    endpoint = Column(Text, nullable=False, unique=True)        # URL-ul push service (poate fi lung)
    p256dh = Column(String, nullable=False)                     # cheia publica de criptare a clientului
    auth = Column(String, nullable=False)                       # secretul de autentificare
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
