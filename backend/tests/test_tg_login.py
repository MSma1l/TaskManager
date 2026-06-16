"""Phase 1 — Telegram login with admin approval.

Covers the testable (non-bot) surface: access_service (auto username, signup,
approve/reject + web-session token issuance) and the /tg-login API polling.
Bot handlers are wired separately and verified manually.
"""
import pytest
from datetime import datetime, timedelta

from app.services import access_service
from app.models.access_request import AccessRequest
from app.models.user import User
from app.models.qr_session import QRSession
from app.models.base import generate_cuid


# ── auto username generation ─────────────────────────────────────────────────

def test_generate_unique_username_slug(db):
    assert access_service.generate_unique_username(db, "Ion Popescu") == "ion"


def test_generate_unique_username_suffix_on_collision(db):
    db.add(User(id=generate_cuid(), username="ion", role="USER", is_active=True))
    db.commit()
    assert access_service.generate_unique_username(db, "Ion Popescu") == "ion2"


def test_generate_unique_username_short_name_padded(db):
    # "Al" → slug "al" prea scurt → completat la minim 3 caractere.
    out = access_service.generate_unique_username(db, "Al")
    assert len(out) >= 3


# ── telegram signup → pending access request ─────────────────────────────────

def test_create_telegram_signup(db):
    r = access_service.create_telegram_signup(db, "555111", "Maria Ionescu")
    assert r.status == "PENDING"
    assert r.source == "telegram"
    assert r.telegram_chat_id == "555111"
    assert r.first_name == "Maria" and r.last_name == "Ionescu"


# ── approval creates the user + links Telegram ───────────────────────────────

def test_approve_creates_user_with_auto_username(db, make_user):
    admin = make_user(username="admin1", role="ADMIN")
    r = access_service.create_telegram_signup(db, "999", "Vlad Test")
    user = access_service.approve_access_request(db, r, admin.id)
    assert user.username == "vlad"
    assert user.role == "USER"
    assert user.telegram_chat_id == "999"
    db.refresh(r)
    assert r.status == "APPROVED"
    assert r.created_user_id == user.id


def test_approve_twice_raises(db, make_user):
    admin = make_user(username="admin2", role="ADMIN")
    r = access_service.create_telegram_signup(db, "1", "X Y")
    access_service.approve_access_request(db, r, admin.id)
    with pytest.raises(ValueError):
        access_service.approve_access_request(db, r, admin.id)


def test_reject_marks_rejected(db, make_user):
    admin = make_user(username="admin3", role="ADMIN")
    r = access_service.create_telegram_signup(db, "2", "Rej Ected")
    access_service.reject_access_request(db, r, admin.id, "spam")
    db.refresh(r)
    assert r.status == "REJECTED"
    assert r.rejection_reason == "spam"


# ── linked web session gets a token on approval ──────────────────────────────

def _tglogin_session(db):
    s = QRSession(
        id=generate_cuid(), flow="tglogin", status="AWAITING_ADMIN",
        expires_at=datetime.utcnow() + timedelta(minutes=10),
    )
    db.add(s)
    db.commit()
    return s


def test_approve_issues_token_on_linked_session(db, make_user):
    admin = make_user(username="admin4", role="ADMIN")
    session = _tglogin_session(db)
    r = access_service.create_telegram_signup(db, "77", "Web User", qr_session_id=session.id)
    user = access_service.approve_access_request(db, r, admin.id)
    db.refresh(session)
    assert session.status == "APPROVED"
    assert session.user_id == user.id
    assert session.issued_token


def test_reject_marks_linked_session_rejected(db, make_user):
    admin = make_user(username="admin5", role="ADMIN")
    session = _tglogin_session(db)
    r = access_service.create_telegram_signup(db, "78", "Web User", qr_session_id=session.id)
    access_service.reject_access_request(db, r, admin.id)
    db.refresh(session)
    assert session.status == "REJECTED"


# ── /tg-login API ────────────────────────────────────────────────────────────

@pytest.fixture()
def auth_client(TestingSessionLocal):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.core.database import get_db
    from app.api.auth import router as auth_router

    application = FastAPI()
    application.include_router(auth_router)

    def _override_get_db():
        s = TestingSessionLocal()
        try:
            yield s
        finally:
            s.close()

    application.dependency_overrides[get_db] = _override_get_db
    client = TestClient(application)
    yield client
    application.dependency_overrides.clear()


def test_tg_login_init_creates_pending_session(db, auth_client):
    r = auth_client.post("/api/auth/tg-login/init")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sessionId"]
    # status pending la început
    s = auth_client.get("/api/auth/tg-login/status", params={"sessionId": body["sessionId"]})
    assert s.json()["status"] == "PENDING"


def test_tg_login_status_404_for_unknown(auth_client):
    r = auth_client.get("/api/auth/tg-login/status", params={"sessionId": "nope"})
    assert r.status_code == 404


def test_tg_login_full_flow_delivers_token_once(db, auth_client, make_user):
    admin = make_user(username="admin6", role="ADMIN")
    # web pornește sesiunea
    init = auth_client.post("/api/auth/tg-login/init").json()
    session_id = init["sessionId"]
    # botul (chat nelegat) creează cererea legată + admin aprobă (via service)
    r = access_service.create_telegram_signup(db, "640", "Token Test", qr_session_id=session_id)
    sess = db.query(QRSession).filter(QRSession.id == session_id).first()
    sess.status = "AWAITING_ADMIN"
    db.commit()
    # înainte de aprobare: AWAITING_ADMIN
    assert auth_client.get("/api/auth/tg-login/status", params={"sessionId": session_id}).json()["status"] == "AWAITING_ADMIN"

    access_service.approve_access_request(db, r, admin.id)

    # primul poll întoarce token-ul
    first = auth_client.get("/api/auth/tg-login/status", params={"sessionId": session_id}).json()
    assert first["status"] == "APPROVED"
    assert first["token"]
    assert first["username"] == "token"  # auto din "Token Test"
    # al doilea poll: consumat, fără token
    second = auth_client.get("/api/auth/tg-login/status", params={"sessionId": session_id}).json()
    assert second["status"] == "CONSUMED"
