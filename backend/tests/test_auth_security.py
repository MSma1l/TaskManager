"""Security-baseline tests: KDF password hashing, brute-force lockout,
token revocation, boot-time config validation, removed legacy backdoor."""
import pytest
from datetime import datetime, timedelta

from app.core import security
from app.services import auth_service
from app.models.user import User
from app.models.base import generate_cuid


# ── KDF password / PIN hashing ───────────────────────────────────────────────

def test_hash_password_roundtrip():
    h = security.hash_password("hunter2")
    assert h.startswith("scrypt$") or h.startswith("pbkdf2$")
    assert security.verify_password("hunter2", h) is True
    assert security.verify_password("wrong", h) is False


def test_hash_password_uses_per_value_salt():
    # Două hash-uri ale aceleiași parole diferă (salt random per-valoare).
    assert security.hash_password("same") != security.hash_password("same")


def test_verify_password_accepts_legacy_sha256():
    """Hash-urile vechi (hash_secret/SHA256) trebuie să verifice în continuare."""
    legacy = security.hash_secret("oldpin")
    assert security.verify_password("oldpin", legacy) is True
    assert security.verify_password("nope", legacy) is False


def test_password_needs_rehash():
    assert security.password_needs_rehash(security.hash_secret("x")) is True
    assert security.password_needs_rehash(security.hash_password("x")) is False
    assert security.password_needs_rehash("") is False


# ── JWT secret boot validation ───────────────────────────────────────────────

def test_jwt_secret_default_is_weak():
    assert security.jwt_secret_is_weak() is True  # repo default e cel slab


def test_assert_secure_config_raises_in_production(monkeypatch):
    monkeypatch.setattr(security.settings, "NODE_ENV", "production", raising=False)
    with pytest.raises(RuntimeError):
        security.assert_secure_config()


def test_assert_secure_config_only_warns_in_dev(monkeypatch):
    monkeypatch.setattr(security.settings, "NODE_ENV", "development", raising=False)
    security.assert_secure_config()  # nu aruncă


def test_strong_secret_not_weak(monkeypatch):
    monkeypatch.setattr(security.settings, "JWT_SECRET", "x" * 40, raising=False)
    assert security.jwt_secret_is_weak() is False


# ── Token revocation via token_version ───────────────────────────────────────

def test_token_version_revocation(db, make_user):
    user = make_user(username="rev_user")
    token, _ = security.issue_token(user)

    class _Creds:
        credentials = token

    # Token valid cât timp token_version coincide.
    resolved = security.get_current_user(credentials=_Creds(), db=db)
    assert resolved.id == user.id

    # Bump token_version ⇒ token-ul vechi e revocat.
    user.token_version = 1
    db.commit()
    with pytest.raises(Exception) as exc:
        security.get_current_user(credentials=_Creds(), db=db)
    assert getattr(exc.value, "status_code", None) == 401


# ── Brute-force lockout ──────────────────────────────────────────────────────

def _user_with_pin(db, pin="1234"):
    u = User(
        id=generate_cuid(), username=f"u_{generate_cuid()[:6]}", role="USER",
        is_active=True, pin_hash=security.hash_password(pin),
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def test_refresh_with_pin_locks_after_max_failures(db):
    user = _user_with_pin(db, pin="4321")
    # MAX_FAILED încercări greșite → cont blocat.
    for _ in range(auth_service.MAX_FAILED):
        assert auth_service.refresh_with_pin(db, user.username, "0000") is None
    db.refresh(user)
    assert auth_service.account_locked(user) is True
    # Chiar și PIN-ul corect e refuzat cât timp e blocat.
    with pytest.raises(auth_service.AccountLockedError):
        auth_service.refresh_with_pin(db, user.username, "4321")


def test_successful_pin_resets_failures(db):
    user = _user_with_pin(db, pin="4321")
    auth_service.refresh_with_pin(db, user.username, "0000")  # 1 eșec
    db.refresh(user)
    assert user.failed_login_attempts == 1
    ok = auth_service.refresh_with_pin(db, user.username, "4321")
    assert ok is not None
    db.refresh(user)
    assert user.failed_login_attempts == 0
    assert user.locked_until is None


def test_pin_hash_upgraded_on_successful_refresh(db):
    """PIN stocat în format vechi (SHA256) se upgradează la KDF la login reușit."""
    u = User(
        id=generate_cuid(), username=f"u_{generate_cuid()[:6]}", role="USER",
        is_active=True, pin_hash=security.hash_secret("9999"),
    )
    db.add(u)
    db.commit()
    assert security.password_needs_rehash(u.pin_hash) is True
    ok = auth_service.refresh_with_pin(db, u.username, "9999")
    assert ok is not None
    db.refresh(u)
    assert security.password_needs_rehash(u.pin_hash) is False


# ── API: lockout + removed legacy endpoint ───────────────────────────────────

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


def test_password_login_lockout_returns_429(db, auth_client):
    u = User(
        id=generate_cuid(), username="lockme", role="USER", is_active=True,
        password_hash=security.hash_password("correct-horse"),
    )
    db.add(u)
    db.commit()

    # MAX_FAILED parole greșite → contul se blochează.
    for _ in range(auth_service.MAX_FAILED):
        r = auth_client.post("/api/auth/password-login",
                             json={"username": "lockme", "password": "bad"})
        assert r.status_code == 401
    # Următoarea cerere (chiar cu parola corectă) e respinsă cu 429.
    r = auth_client.post("/api/auth/password-login",
                         json={"username": "lockme", "password": "correct-horse"})
    assert r.status_code == 429
    assert "Retry-After" in r.headers


def test_login_legacy_endpoint_removed(auth_client):
    r = auth_client.post("/api/auth/login-legacy", json={"pin": "1111"})
    assert r.status_code == 404  # backdoor eliminat
