from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey
from app.core.database import Base
from app.models.base import generate_cuid


class CalendarEventAttendee(Base):
    """Participant real (utilizator al aplicatiei) invitat la un eveniment.

    Owner-ul evenimentului ataseaza utilizatori (din membrii proiectelor /
    colaboratori). Participantul:
      - primeste o notificare in-app (EVENT_INVITE);
      - vede evenimentul in propriul calendar (get_events_for_range il include
        si pentru evenimente unde e PARTICIPANT, nu doar owner).

    Status: INVITED (default) | ACCEPTED | DECLINED.
    """
    __tablename__ = "calendar_event_attendees"

    id = Column(String, primary_key=True, default=generate_cuid)
    event_id = Column(String, ForeignKey("calendar_events.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="INVITED")  # INVITED | ACCEPTED | DECLINED
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
