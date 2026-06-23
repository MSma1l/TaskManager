"""Serviciu central pentru cererile de acces (signup + aprobare admin).

Reutilizat de:
  - API public/admin (`api/access_requests.py`),
  - bot Telegram (`/register` + login Telegram cu aprobare),
ca logica de creare cont + aprobare să trăiască într-un singur loc (regula:
business logic în services/, nu în api/ sau în handlerele bot).

Aprobarea creează userul; dacă cererea e legată de o sesiune web "tglogin",
îi emitem token-ul pe sesiune ca browserul să intre automat prin polling.
"""
import re
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.core.security import issue_token, hash_password
from app.models.access_request import AccessRequest
from app.models.user import User
from app.models.qr_session import QRSession

_USERNAME_RE = re.compile(r"^[a-z0-9_.]{3,30}$")


def generate_unique_username(db: Session, full_name: str) -> str:
    """Derivă un username unic din numele complet (slug + sufix numeric).

    Ex: "Ion Popescu" → "ion" / "ion2" / "ion3" ... Garantat ≤ 30 caractere
    și conform regulilor de format. Fallback "user" dacă slug-ul iese gol.
    """
    first = (full_name or "").strip().lower().split()
    base = re.sub(r"[^a-z0-9]", "", first[0])[:20] if first else ""
    if len(base) < 3:
        base = (base + "user")[:20]

    candidate = base
    suffix = 1
    while db.query(User).filter(User.username == candidate).first() is not None:
        suffix += 1
        tail = str(suffix)
        candidate = f"{base[:30 - len(tail)]}{tail}"
    return candidate


def create_telegram_signup(
    db: Session, chat_id: str, full_name: str, qr_session_id: Optional[str] = None
) -> AccessRequest:
    """Creează o cerere de acces PENDING pornită din botul Telegram.

    `chat_id` vine server-side din chat-ul verificat al botului (NU de la client),
    deci nu poate fi spoofed. Numele se desparte naiv în prenume/nume.
    """
    parts = (full_name or "").strip().split(None, 1)
    first = parts[0][:100] if parts else "—"
    last = (parts[1][:100] if len(parts) > 1 else "")

    request = AccessRequest(
        first_name=first,
        last_name=last,
        telegram_chat_id=(chat_id or "").strip()[:50] or None,
        purpose="personal",
        status="PENDING",
        source="telegram",
        qr_session_id=qr_session_id,
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


def approve_access_request(
    db: Session,
    r: AccessRequest,
    actor_id: str,
    username: Optional[str] = None,
    role: str = "USER",
    pin: Optional[str] = None,
) -> User:
    """Aprobă o cerere: creează userul, leagă Telegram, și (dacă există o
    sesiune web tglogin legată) emite token-ul pe ea ca web-ul să intre.

    `username` opțional — dacă lipsește, se generează automat din nume.
    """
    if r.status != "PENDING":
        raise ValueError(f"Cererea este deja {r.status}")

    role = (role or "USER").upper()
    if role not in {"USER", "ADMIN"}:
        raise ValueError("Rol invalid")

    # Username: explicit (admin) > ales de user la signup > auto din nume.
    username = (username or "").strip().lower() or (r.desired_username or "").strip().lower()
    if username:
        if not _USERNAME_RE.match(username):
            raise ValueError("Username invalid (3-30: a-z, 0-9, _, .)")
        if db.query(User).filter(User.username == username).first():
            raise ValueError("Username deja folosit")
    else:
        full = f"{r.first_name} {r.last_name}".strip()
        username = generate_unique_username(db, full)

    # PIN: explicit (admin) > ales de user la signup.
    pin_hash = r.pin_hash
    if pin:
        pin = pin.strip()
        if not pin.isdigit() or not (4 <= len(pin) <= 8):
            raise ValueError("PIN-ul trebuie sa fie 4-8 cifre")
        pin_hash = hash_password(pin)

    new_user = User(
        username=username,
        email=r.email,
        full_name=f"{r.first_name} {r.last_name}".strip() or username,
        phone=r.phone,
        telegram_chat_id=r.telegram_chat_id,
        role=role,
        # Parola aleasă de user la signup (dacă a pus una).
        password_hash=r.password_hash,
        pin_hash=pin_hash,
        is_active=True,
    )
    db.add(new_user)
    db.flush()  # obține id-ul

    # Adaugă noul user ca membru al proiectului Birou (non-fatal).
    from app.services import office_service
    office_service.ensure_office_membership(db, new_user.id)

    r.status = "APPROVED"
    r.processed_by_user_id = actor_id
    r.processed_at = datetime.utcnow()
    r.created_user_id = new_user.id

    # Dacă există o sesiune web tglogin legată, emite-i token-ul ca să intre.
    if r.qr_session_id:
        session = db.query(QRSession).filter(QRSession.id == r.qr_session_id).first()
        if session and session.status not in {"CONSUMED", "EXPIRED"}:
            token, exp = issue_token(new_user)
            session.status = "APPROVED"
            session.user_id = new_user.id
            session.issued_token = token
            session.token_expires_at = exp
            session.approved_at = datetime.utcnow()

    db.commit()
    db.refresh(new_user)
    return new_user


def reject_access_request(
    db: Session, r: AccessRequest, actor_id: str, reason: Optional[str] = None
) -> AccessRequest:
    if r.status != "PENDING":
        raise ValueError(f"Cererea este deja {r.status}")
    r.status = "REJECTED"
    r.rejection_reason = (reason or "").strip()[:2000] or None
    r.processed_by_user_id = actor_id
    r.processed_at = datetime.utcnow()

    if r.qr_session_id:
        session = db.query(QRSession).filter(QRSession.id == r.qr_session_id).first()
        if session and session.status not in {"CONSUMED", "EXPIRED"}:
            session.status = "REJECTED"

    db.commit()
    db.refresh(r)
    return r
