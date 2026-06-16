from datetime import datetime
from sqlalchemy import Column, String, DateTime, Index
from app.core.database import Base
from app.models.base import generate_cuid


class Friendship(Base):
    """Relatie de colaborare intre doi useri (prieten / coleg).

    Nu punem un UNIQUE hard pe (requester_id, addressee_id) ca sa permitem
    re-cererea dupa un REJECT. Unicitatea relatiei active per pereche e
    verificata in `friend_service` (PENDING/ACCEPTED).
    """
    __tablename__ = "friendships"

    id = Column(String, primary_key=True, default=generate_cuid)
    requester_id = Column(String, nullable=False, index=True)   # cine trimite cererea
    addressee_id = Column(String, nullable=False, index=True)   # cine o primeste

    status = Column(String(20), nullable=False, default="PENDING", index=True)  # PENDING | ACCEPTED | REJECTED
    relation = Column(String(20), nullable=False, default="colleague")          # friend | colleague

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    responded_at = Column(DateTime, nullable=True)


Index("ix_friendships_pair", Friendship.requester_id, Friendship.addressee_id)
