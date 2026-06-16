"""QR login session — short-lived rendez-vous between a desktop browser
that wants to log in and a mobile (or other authenticated session) that
scans the QR and approves.

Flow:
  1. Desktop calls POST /auth/qr/init  → server creates a fresh QRSession
     row (status='PENDING') and returns its id.
  2. Desktop renders the QR encoding the URL  /qr-confirm/<id>.
  3. Mobile (already logged in) opens that URL → calls POST /auth/qr/confirm
     → server marks the row as APPROVED, attaches user_id, and stores a
     freshly-issued session token.
  4. Desktop polls GET /auth/qr/status?id=... — when status=APPROVED, server
     returns the token and marks the row CONSUMED so it can't be reused.
"""
from datetime import datetime
from sqlalchemy import Column, String, DateTime
from app.core.database import Base
from app.models.base import generate_cuid


class QRSession(Base):
    __tablename__ = "qr_sessions"

    id = Column(String, primary_key=True, default=generate_cuid)
    # qr → scan-to-login clasic; tglogin → login simplu din Telegram cu aprobare admin.
    # Status-uri tglogin: PENDING (aștept botul) → AWAITING_ADMIN (aștept aprobarea)
    #   → APPROVED (token emis) / REJECTED / EXPIRED → CONSUMED (token preluat de web).
    flow = Column(String(20), nullable=False, default="qr")
    status = Column(String(20), nullable=False, default="PENDING")
    user_id = Column(String, nullable=True)            # set when approved
    # Cererea de acces legată (flow=tglogin, user nou ce așteaptă aprobare admin).
    access_request_id = Column(String, nullable=True)
    issued_token = Column(String, nullable=True)       # short-lived JWT, returned to desktop on poll
    token_expires_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    approved_at = Column(DateTime, nullable=True)
    consumed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
