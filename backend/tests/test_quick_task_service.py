"""Tests pentru app.services.quick_task_service (Quick Tasks).

Acopera fluxul public (create_public), inbox-ul de admin (list_quick_tasks),
distribuirea (assign — ADMIN, creeaza Task origin=QUICK + notificare), respingerea
(dismiss) si jobul de notificare a adminilor (notify_admins_new_quick_tasks).

Ruleaza pe SQLite in-memory din conftest; oglindeste stilul existent.
"""
import pytest
from fastapi import HTTPException

from app.models.notification import Notification
from app.models.quick_task import QuickTask
from app.models.task import Task
from app.services import quick_task_service


# ── create_public (validare) ─────────────────────────────────────────

def test_create_public_ok(db):
    out = quick_task_service.create_public(db, {
        "requesterName": "Ion Pop", "title": "Repara login", "priority": "URGENT",
    })
    assert out["ok"] is True
    qt = db.query(QuickTask).filter(QuickTask.id == out["id"]).first()
    assert qt.status == "NEW"
    assert qt.priority == "URGENT"
    assert qt.requester_name == "Ion Pop"


def test_create_public_missing_name_400(db):
    with pytest.raises(HTTPException) as exc:
        quick_task_service.create_public(db, {"requesterName": "  ", "title": "x"})
    assert exc.value.status_code == 400


def test_create_public_missing_title_400(db):
    with pytest.raises(HTTPException) as exc:
        quick_task_service.create_public(db, {"requesterName": "Ana", "title": "  "})
    assert exc.value.status_code == 400


def test_create_public_invalid_priority_defaults_normal(db):
    out = quick_task_service.create_public(db, {
        "requesterName": "Ana", "title": "t", "priority": "WAT",
    })
    qt = db.query(QuickTask).filter(QuickTask.id == out["id"]).first()
    assert qt.priority == "NORMAL"


# ── list_quick_tasks (filtru status) ─────────────────────────────────

def test_list_quick_tasks_status_filter(db, make_user):
    user = make_user()
    a = quick_task_service.create_public(db, {"requesterName": "A", "title": "a"})
    b = quick_task_service.create_public(db, {"requesterName": "B", "title": "b"})
    # Marcheaza b ca DISMISSED.
    quick_task_service.dismiss(db, user.id, b["id"])

    new_only = quick_task_service.list_quick_tasks(db, user.id, status="NEW")
    new_ids = {q["id"] for q in new_only}
    assert a["id"] in new_ids
    assert b["id"] not in new_ids

    dismissed = quick_task_service.list_quick_tasks(db, user.id, status="DISMISSED")
    assert {q["id"] for q in dismissed} == {b["id"]}


def test_list_quick_tasks_all_returns_new_and_assigned(db, make_user, make_project, add_member):
    owner = make_user()
    assignee = make_user()
    project = make_project(owner)
    add_member(project, assignee, role="MEMBER")

    a = quick_task_service.create_public(db, {"requesterName": "A", "title": "a"})
    b = quick_task_service.create_public(db, {"requesterName": "B", "title": "b"})
    quick_task_service.assign(db, owner.id, b["id"], project.id, assignee.id)

    out = quick_task_service.list_quick_tasks(db, owner.id, status="ALL")
    statuses = {q["id"]: q["status"] for q in out}
    assert statuses[a["id"]] == "NEW"
    assert statuses[b["id"]] == "ASSIGNED"


# ── assign (ADMIN -> Task origin=QUICK + notificare) ─────────────────

def test_assign_creates_board_task_and_links(db, make_user, make_project, add_member):
    owner = make_user()
    assignee = make_user()
    project = make_project(owner)
    add_member(project, assignee, role="MEMBER")

    qt = quick_task_service.create_public(db, {
        "requesterName": "Client", "title": "Task important", "priority": "URGENT",
    })

    res = quick_task_service.assign(db, owner.id, qt["id"], project.id, assignee.id)

    assert res["quickTask"]["status"] == "ASSIGNED"
    task = db.query(Task).filter(Task.id == res["task"]["id"]).first()
    assert task.origin == "QUICK"
    assert task.assignee_id == assignee.id
    assert task.project_id == project.id

    row = db.query(QuickTask).filter(QuickTask.id == qt["id"]).first()
    assert row.task_id == task.id
    assert row.assignee_id == assignee.id
    assert row.processed_by_user_id == owner.id

    # Notificare QUICK_ASSIGNED catre responsabil.
    notes = (
        db.query(Notification)
        .filter(Notification.user_id == assignee.id, Notification.type == "QUICK_ASSIGNED")
        .all()
    )
    assert len(notes) == 1


def test_assign_unknown_quick_task_404(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    with pytest.raises(HTTPException) as exc:
        quick_task_service.assign(db, owner.id, "nope", project.id, owner.id)
    assert exc.value.status_code == 404


def test_assign_already_processed_409(db, make_user, make_project, add_member):
    owner = make_user()
    assignee = make_user()
    project = make_project(owner)
    add_member(project, assignee, role="MEMBER")
    qt = quick_task_service.create_public(db, {"requesterName": "C", "title": "t"})
    quick_task_service.assign(db, owner.id, qt["id"], project.id, assignee.id)

    with pytest.raises(HTTPException) as exc:
        quick_task_service.assign(db, owner.id, qt["id"], project.id, assignee.id)
    assert exc.value.status_code == 409


def test_assign_non_admin_403(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    qt = quick_task_service.create_public(db, {"requesterName": "C", "title": "t"})

    with pytest.raises(HTTPException) as exc:
        quick_task_service.assign(db, member.id, qt["id"], project.id, member.id)
    assert exc.value.status_code == 403


def test_assign_assignee_not_member_400(db, make_user, make_project):
    owner = make_user()
    stranger = make_user()
    project = make_project(owner)
    qt = quick_task_service.create_public(db, {"requesterName": "C", "title": "t"})

    with pytest.raises(HTTPException) as exc:
        quick_task_service.assign(db, owner.id, qt["id"], project.id, stranger.id)
    assert exc.value.status_code == 400


# ── dismiss ──────────────────────────────────────────────────────────

def test_dismiss_soft_deletes(db, make_user):
    user = make_user()
    qt = quick_task_service.create_public(db, {"requesterName": "C", "title": "t"})

    out = quick_task_service.dismiss(db, user.id, qt["id"])
    assert out["status"] == "DISMISSED"

    row = db.query(QuickTask).filter(QuickTask.id == qt["id"]).first()
    assert row.is_active is False
    assert row.processed_by_user_id == user.id


def test_dismiss_unknown_404(db, make_user):
    user = make_user()
    with pytest.raises(HTTPException) as exc:
        quick_task_service.dismiss(db, user.id, "nope")
    assert exc.value.status_code == 404


# ── notify_admins_new_quick_tasks (notified_at + idempotent) ─────────

def test_notify_admins_sets_notified_and_is_idempotent(db, make_user, make_project):
    owner = make_user()  # OWNER pe proiect -> admin pentru quick tasks
    make_project(owner)
    qt = quick_task_service.create_public(db, {"requesterName": "C", "title": "Urgent"})

    processed = quick_task_service.notify_admins_new_quick_tasks(db)
    assert processed == 1

    row = db.query(QuickTask).filter(QuickTask.id == qt["id"]).first()
    assert row.notified_at is not None

    notes = (
        db.query(Notification)
        .filter(Notification.user_id == owner.id, Notification.type == "QUICK_NEW")
        .all()
    )
    assert len(notes) == 1

    # Al doilea apel nu mai proceseaza nimic (anti-duplicare prin notified_at).
    assert quick_task_service.notify_admins_new_quick_tasks(db) == 0


def test_notify_admins_no_pending_returns_zero(db, make_user, make_project):
    owner = make_user()
    make_project(owner)
    assert quick_task_service.notify_admins_new_quick_tasks(db) == 0


# ── API (app.api.quick_tasks) ────────────────────────────────────────

def _quick_client(TestingSessionLocal):
    from fastapi import FastAPI, HTTPException
    from fastapi.testclient import TestClient
    from app.core.database import get_db
    from app.core.security import get_current_user
    from app.api.quick_tasks import router as quick_router

    application = FastAPI()
    application.include_router(quick_router)
    state = {"user": None}

    def _override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    def _override_current_user():
        if state["user"] is None:
            raise HTTPException(status_code=401, detail="no test user")
        return state["user"]

    application.dependency_overrides[get_db] = _override_get_db
    application.dependency_overrides[get_current_user] = _override_current_user
    return TestClient(application), state


def test_api_public_submit_no_auth(db, TestingSessionLocal):
    client, _state = _quick_client(TestingSessionLocal)
    r = client.post("/api/quick-tasks/public", json={
        "requesterName": "Ion", "title": "Ceva", "priority": "URGENT",
    })
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_api_inbox_assign_and_dismiss(db, TestingSessionLocal, make_user, make_project, add_member):
    owner = make_user()
    assignee = make_user()
    project = make_project(owner)
    add_member(project, assignee, role="MEMBER")

    client, state = _quick_client(TestingSessionLocal)
    state["user"] = owner

    created = client.post("/api/quick-tasks/public", json={"requesterName": "X", "title": "a"})
    qid = created.json()["id"]

    listed = client.get("/api/quick-tasks", params={"status": "NEW"})
    assert listed.status_code == 200
    assert any(q["id"] == qid for q in listed.json())

    assigned = client.post(
        f"/api/quick-tasks/{qid}/assign",
        json={"projectId": project.id, "assigneeId": assignee.id},
    )
    assert assigned.status_code == 200
    assert assigned.json()["quickTask"]["status"] == "ASSIGNED"

    other = client.post("/api/quick-tasks/public", json={"requesterName": "Y", "title": "b"})
    oid = other.json()["id"]
    dismissed = client.post(f"/api/quick-tasks/{oid}/dismiss")
    assert dismissed.status_code == 200
    assert dismissed.json()["status"] == "DISMISSED"


# ── count_new (badge sidebar) ────────────────────────────────────────

def test_count_new_zero_for_non_admin(db, make_user):
    """Un user fara rol de admin/owner pe vreun proiect vede 0 (badge ascuns)."""
    plain = make_user()
    quick_task_service.create_public(db, {"requesterName": "A", "title": "a"})
    assert quick_task_service.count_new(db, plain.id) == 0


def test_count_new_counts_new_for_admin(db, make_user, make_project):
    """Owner-ul unui proiect (admin/owner) vede numarul de quick task-uri NEW."""
    owner = make_user()
    make_project(owner)  # ii da owner-ului o calitate de OWNER
    quick_task_service.create_public(db, {"requesterName": "A", "title": "a"})
    quick_task_service.create_public(db, {"requesterName": "B", "title": "b"})
    assert quick_task_service.count_new(db, owner.id) == 2


def test_count_new_excludes_assigned_and_dismissed(db, make_user, make_project, add_member):
    owner = make_user()
    assignee = make_user()
    project = make_project(owner)
    add_member(project, assignee, role="MEMBER")

    keep = quick_task_service.create_public(db, {"requesterName": "A", "title": "a"})
    gone = quick_task_service.create_public(db, {"requesterName": "B", "title": "b"})
    quick_task_service.assign(db, owner.id, keep["id"], project.id, assignee.id)
    quick_task_service.dismiss(db, owner.id, gone["id"])

    # Ambele au iesit din starea NEW -> count 0.
    assert quick_task_service.count_new(db, owner.id) == 0


# ── attachments (screenshot-uri + voice) ─────────────────────────────

def test_create_public_with_attachments_kept(db):
    out = quick_task_service.create_public(db, {
        "requesterName": "Ana", "title": "bug vizual",
        "attachments": [
            {"type": "image", "data": "data:image/png;base64,AAAA", "caption": "shot"},
            {"type": "audio", "data": "data:audio/webm;base64,BBBB"},
        ],
    })
    qt = db.query(QuickTask).filter(QuickTask.id == out["id"]).first()
    assert qt.attachments is not None
    assert len(qt.attachments) == 2
    assert qt.attachments[0]["type"] == "image"
    assert qt.attachments[1]["type"] == "audio"


def test_create_public_filters_invalid_attachments(db):
    out = quick_task_service.create_public(db, {
        "requesterName": "Ana", "title": "t",
        "attachments": [
            {"type": "image", "data": "not-a-data-url"},   # data invalid -> skip
            {"type": "video", "data": "data:video/mp4;base64,CC"},  # tip invalid -> skip
            "garbage",                                       # non-dict -> skip
            {"type": "image", "data": "data:image/png;base64,OK"},  # valid
        ],
    })
    qt = db.query(QuickTask).filter(QuickTask.id == out["id"]).first()
    assert len(qt.attachments) == 1
    assert qt.attachments[0]["data"].endswith("OK")


def test_create_public_no_attachments_is_none(db):
    out = quick_task_service.create_public(db, {"requesterName": "Ana", "title": "t"})
    qt = db.query(QuickTask).filter(QuickTask.id == out["id"]).first()
    assert qt.attachments is None
