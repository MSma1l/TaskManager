"""Self-signup: userul isi alege username + parola + PIN la cerere; dupa
aprobare se logheaza direct cu username + parola (sau PIN)."""
import pytest

from app.services import access_service
from app.core import security
from app.models.access_request import AccessRequest
from app.models.user import User
from app.models.base import generate_cuid


@pytest.fixture()
def auth_access_client(TestingSessionLocal):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.core.database import get_db
    from app.api.auth import router as auth_router
    from app.api.access_requests import router as ar_router

    application = FastAPI()
    application.include_router(auth_router)
    application.include_router(ar_router)

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


def test_submit_stores_username_password_pin(db, auth_access_client):
    r = auth_access_client.post("/api/access-requests", json={
        "firstName": "Ion", "lastName": "Pop",
        "username": "ion.pop", "password": "secret123", "pin": "4321",
    })
    assert r.status_code == 200, r.text
    req = db.query(AccessRequest).filter(AccessRequest.id == r.json()["id"]).first()
    assert req.desired_username == "ion.pop"
    assert req.password_hash and security.verify_password("secret123", req.password_hash)
    assert req.pin_hash and security.verify_password("4321", req.pin_hash)


def test_submit_rejects_short_password(db, auth_access_client):
    r = auth_access_client.post("/api/access-requests", json={
        "firstName": "Ion", "lastName": "Pop", "username": "ion2", "password": "123",
    })
    assert r.status_code == 400


def test_submit_rejects_taken_username(db, auth_access_client, make_user):
    make_user(username="taken")
    r = auth_access_client.post("/api/access-requests", json={
        "firstName": "Ion", "lastName": "Pop", "username": "taken", "password": "secret123",
    })
    assert r.status_code == 409


def test_approve_applies_chosen_credentials(db, make_user):
    admin = make_user(username="adm", role="ADMIN")
    req = AccessRequest(
        id=generate_cuid(), first_name="Ion", last_name="Pop", status="PENDING",
        desired_username="ion.pop",
        password_hash=security.hash_password("secret123"),
        pin_hash=security.hash_password("4321"),
    )
    db.add(req)
    db.commit()

    user = access_service.approve_access_request(db, req, admin.id)
    assert user.username == "ion.pop"
    assert security.verify_password("secret123", user.password_hash)
    assert security.verify_password("4321", user.pin_hash)


def test_full_self_signup_then_password_login(db, auth_access_client, make_user):
    """End-to-end: submit (user) → approve (service) → password-login (user)."""
    admin = make_user(username="adm2", role="ADMIN")
    submit = auth_access_client.post("/api/access-requests", json={
        "firstName": "Maria", "lastName": "Ion",
        "username": "maria", "password": "parola-mea",
    })
    req = db.query(AccessRequest).filter(AccessRequest.id == submit.json()["id"]).first()

    access_service.approve_access_request(db, req, admin.id)

    # Userul nou (fara Telegram legat) se logheaza direct cu username + parola.
    login = auth_access_client.post("/api/auth/password-login", json={
        "username": "maria", "password": "parola-mea",
    })
    assert login.status_code == 200, login.text
    body = login.json()
    assert body["kind"] == "session"
    assert body["token"]
    assert body["username"] == "maria"
