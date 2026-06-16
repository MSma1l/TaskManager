"""Web Push (VAPID): save/delete subscription + degradare gratioasa fara VAPID.

Importam explicit modelul ca sa il inregistram pe Base.metadata inainte ca
fixture-ul `engine` din conftest sa ruleze create_all (altfel tabela
push_subscriptions nu ar exista in DB-ul SQLite de test).
"""
import app.models.push_subscription  # noqa: F401  (inregistreaza tabela)
from app.models.push_subscription import PushSubscription
from app.services import push_service


# ── save / delete subscription ───────────────────────────────────────────────

def test_save_subscription_creates_row(db, make_user):
    u = make_user(username="p1")
    sub = push_service.save_subscription(
        db, u.id, endpoint="https://push.example/abc", p256dh="KEY", auth="AUTH"
    )
    assert sub.id and sub.user_id == u.id
    assert db.query(PushSubscription).count() == 1


def test_save_subscription_is_idempotent_per_endpoint(db, make_user):
    u = make_user(username="p2")
    push_service.save_subscription(db, u.id, endpoint="https://push.example/x", p256dh="A", auth="B")
    # Re-abonarea aceluiasi endpoint updateaza, nu dubleaza.
    push_service.save_subscription(db, u.id, endpoint="https://push.example/x", p256dh="A2", auth="B2")
    rows = db.query(PushSubscription).all()
    assert len(rows) == 1
    assert rows[0].p256dh == "A2" and rows[0].auth == "B2"


def test_save_subscription_reassigns_owner_on_same_device(db, make_user):
    u1, u2 = make_user(username="p3a"), make_user(username="p3b")
    push_service.save_subscription(db, u1.id, endpoint="https://push.example/shared", p256dh="A", auth="B")
    push_service.save_subscription(db, u2.id, endpoint="https://push.example/shared", p256dh="A", auth="B")
    rows = db.query(PushSubscription).all()
    assert len(rows) == 1 and rows[0].user_id == u2.id


def test_delete_subscription_scoped_to_user(db, make_user):
    u1, u2 = make_user(username="p4a"), make_user(username="p4b")
    push_service.save_subscription(db, u1.id, endpoint="https://push.example/d", p256dh="A", auth="B")
    # u2 nu poate sterge endpoint-ul lui u1.
    assert push_service.delete_subscription(db, u2.id, "https://push.example/d") is False
    assert db.query(PushSubscription).count() == 1
    # proprietarul il poate sterge.
    assert push_service.delete_subscription(db, u1.id, "https://push.example/d") is True
    assert db.query(PushSubscription).count() == 0


# ── degradare gratioasa fara VAPID ────────────────────────────────────────────

def test_send_to_user_noop_without_vapid(db, make_user, monkeypatch):
    """Fara chei VAPID (sau fara pywebpush), send_to_user intoarce 0 si nu arunca."""
    u = make_user(username="p5")
    push_service.save_subscription(db, u.id, endpoint="https://push.example/n", p256dh="A", auth="B")

    # Fortam absenta cheilor indiferent de .env-ul local.
    monkeypatch.setattr(push_service.settings, "VAPID_PRIVATE_KEY", "", raising=False)
    monkeypatch.setattr(push_service.settings, "VAPID_PUBLIC_KEY", "", raising=False)

    assert push_service.push_enabled() is False
    assert push_service.send_to_user(db, u.id, "T", "B", "/") == 0


def test_get_public_key_empty_without_config(db, monkeypatch):
    monkeypatch.setattr(push_service.settings, "VAPID_PUBLIC_KEY", "", raising=False)
    assert push_service.get_public_key() == ""


def test_send_to_user_no_subscriptions_returns_zero(db, make_user, monkeypatch):
    u = make_user(username="p6")
    # Chiar daca push-ul ar fi "enabled", fara abonamente intoarce 0.
    monkeypatch.setattr(push_service, "push_enabled", lambda: True)
    assert push_service.send_to_user(db, u.id, "T", "B", "/") == 0
