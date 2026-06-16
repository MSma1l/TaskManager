from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text
from app.core.database import Base
from app.models.base import generate_cuid


class AccessRequest(Base):
    """Public sign-up request submitted from /request-access. Awaits admin approval."""
    __tablename__ = "access_requests"

    id = Column(String, primary_key=True, default=generate_cuid)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(150), nullable=True)
    phone = Column(String(40), nullable=True)
    telegram_chat_id = Column(String(50), nullable=True)  # pre-filled when submitted via bot link
    purpose = Column(String(20), nullable=False, default="personal")  # personal | collective
    reason = Column(Text, nullable=True)

    status = Column(String(20), nullable=False, default="PENDING", index=True)  # PENDING | APPROVED | REJECTED
    rejection_reason = Column(Text, nullable=True)

    processed_by_user_id = Column(String, nullable=True)
    processed_at = Column(DateTime, nullable=True)
    created_user_id = Column(String, nullable=True)  # populated after approval

    # Sesiunea web "login Telegram" care așteaptă aprobarea (flow tglogin).
    # La aprobare îi emitem token-ul ca să intre automat și pe web.
    qr_session_id = Column(String, nullable=True)
    # personal | collective | telegram (signup direct din bot)
    source = Column(String(20), nullable=False, default="web")

    # Self-signup: userul isi alege username + parola + PIN; le aplicam la aprobare.
    desired_username = Column(String(50), nullable=True)
    password_hash = Column(String(200), nullable=True)
    pin_hash = Column(String(200), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
