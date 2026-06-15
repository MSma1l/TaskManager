"""Tests for app.services.collaboration_service + comment/activity/watcher APIs.

Telegram dispatch is monkeypatched so no asyncio loop / network is needed.
"""
import pytest
from fastapi import HTTPException

from app.models.board_column import BoardColumn
from app.models.task_activity import TaskActivity
from app.models.task_watcher import TaskWatcher
from app.services import board_service, collaboration_service, membership_service


# ── fixtures ─────────────────────────────────────────────────────────

@pytest.fixture()
def collab_client(TestingSessionLocal):
    """TestClient mounting comments + activity + watchers routers."""
    from fastapi import FastAPI, HTTPException as HE
    from fastapi.testclient import TestClient
    from app.core.database import get_db
    from app.core.security import get_current_user
    from app.api.comments import router as comments_router
    from app.api.activity import router as activity_router
    from app.api.watchers import router as watchers_router

    application = FastAPI()
    application.include_router(comments_router)
    application.include_router(activity_router)
    application.include_router(watchers_router)

    state = {"user": None}

    def _override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    def _override_current_user():
        if state["user"] is None:
            raise HE(status_code=401, detail="no test user")
        return state["user"]

    application.dependency_overrides[get_db] = _override_get_db
    application.dependency_overrides[get_current_user] = _override_current_user

    client = TestClient(application)

    def set_user(user):
        state["user"] = user

    yield client, set_user
    application.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def _capture_telegram(monkeypatch):
    """Capture _dispatch_telegram calls so nothing touches asyncio/network."""
    calls = []
    monkeypatch.setattr(
        collaboration_service,
        "_dispatch_telegram",
        lambda text, chat_id, role: calls.append((text, chat_id, role)),
    )
    return calls


def _board_task(db, owner, project, title="t"):
    board_service.ensure_columns(db, project.id)
    col = (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project.id)
        .order_by(BoardColumn.position)
        .first()
    )
    return board_service.create_task(db, owner.id, project.id, {"title": title, "columnId": col.id})


# ── add_comment (service) ────────────────────────────────────────────

def test_add_comment_creates_watcher_and_activity(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    task = _board_task(db, owner, project)

    out = collaboration_service.add_comment(db, owner.id, task.id, "Salut")
    assert out["body"] == "Salut"
    assert out["userId"] == owner.id

    # Author is now a watcher.
    w = db.query(TaskWatcher).filter(
        TaskWatcher.task_id == task.id, TaskWatcher.user_id == owner.id
    ).first()
    assert w is not None

    # COMMENTED activity logged.
    act = db.query(TaskActivity).filter(
        TaskActivity.task_id == task.id, TaskActivity.action == "COMMENTED"
    ).first()
    assert act is not None


def test_add_comment_empty_400(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    task = _board_task(db, owner, project)
    with pytest.raises(HTTPException) as exc:
        collaboration_service.add_comment(db, owner.id, task.id, "   ")
    assert exc.value.status_code == 400


def test_add_comment_requires_member(db, make_user, make_project, add_member):
    owner = make_user()
    viewer = make_user()
    project = make_project(owner)
    add_member(project, viewer, role="VIEWER")
    task = _board_task(db, owner, project)
    with pytest.raises(HTTPException) as exc:
        collaboration_service.add_comment(db, viewer.id, task.id, "hi")
    assert exc.value.status_code == 403


def test_comment_on_personal_task_404(db, make_user, make_project, make_task):
    owner = make_user()
    project = make_project(owner)
    weekly = make_task(project, owner)  # personal/weekly, no board column -> still has project_id
    # Use a task with no project to hit the 404 path.
    from app.models.task import Task
    from app.models.base import generate_cuid
    personal = Task(id=generate_cuid(), user_id=owner.id, title="p", project_id=None, is_active=True)
    db.add(personal)
    db.commit()
    with pytest.raises(HTTPException) as exc:
        collaboration_service.add_comment(db, owner.id, personal.id, "hi")
    assert exc.value.status_code == 404


# ── edit / delete permissions ────────────────────────────────────────

def test_edit_comment_by_author(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    task = _board_task(db, owner, project)
    c = collaboration_service.add_comment(db, owner.id, task.id, "v1")
    out = collaboration_service.edit_comment(db, owner.id, task.id, c["id"], "v2")
    assert out["body"] == "v2"


def test_edit_comment_empty_400(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    task = _board_task(db, owner, project)
    c = collaboration_service.add_comment(db, owner.id, task.id, "v1")
    with pytest.raises(HTTPException) as exc:
        collaboration_service.edit_comment(db, owner.id, task.id, c["id"], " ")
    assert exc.value.status_code == 400


def test_edit_comment_non_author_non_admin_403(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    task = _board_task(db, owner, project)
    c = collaboration_service.add_comment(db, owner.id, task.id, "v1")
    with pytest.raises(HTTPException) as exc:
        collaboration_service.edit_comment(db, member.id, task.id, c["id"], "hax")
    assert exc.value.status_code == 403


def test_edit_comment_by_admin_ok(db, make_user, make_project, add_member):
    owner = make_user()
    admin = make_user()
    project = make_project(owner)
    add_member(project, admin, role="ADMIN")
    task = _board_task(db, owner, project)
    c = collaboration_service.add_comment(db, owner.id, task.id, "v1")
    out = collaboration_service.edit_comment(db, admin.id, task.id, c["id"], "edited by admin")
    assert out["body"] == "edited by admin"


def test_delete_comment_by_author(db, make_user, make_project):
    from app.models.task_comment import TaskComment
    owner = make_user()
    project = make_project(owner)
    task = _board_task(db, owner, project)
    c = collaboration_service.add_comment(db, owner.id, task.id, "v1")
    collaboration_service.delete_comment(db, owner.id, task.id, c["id"])
    assert db.query(TaskComment).filter(TaskComment.id == c["id"]).first() is None


def test_delete_comment_non_author_403(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    task = _board_task(db, owner, project)
    c = collaboration_service.add_comment(db, owner.id, task.id, "v1")
    with pytest.raises(HTTPException) as exc:
        collaboration_service.delete_comment(db, member.id, task.id, c["id"])
    assert exc.value.status_code == 403


def test_delete_comment_by_admin_ok(db, make_user, make_project, add_member):
    from app.models.task_comment import TaskComment
    owner = make_user()
    admin = make_user()
    project = make_project(owner)
    add_member(project, admin, role="ADMIN")
    task = _board_task(db, owner, project)
    c = collaboration_service.add_comment(db, owner.id, task.id, "v1")
    collaboration_service.delete_comment(db, admin.id, task.id, c["id"])
    assert db.query(TaskComment).filter(TaskComment.id == c["id"]).first() is None


def test_get_comment_404(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    task = _board_task(db, owner, project)
    with pytest.raises(HTTPException) as exc:
        collaboration_service.edit_comment(db, owner.id, task.id, "nope", "x")
    assert exc.value.status_code == 404


# ── mention resolution: only project members, excludes author ────────

def test_resolve_mentions_only_members_excludes_author(db, make_user, make_project, add_member):
    owner = make_user(username="owner")
    bob = make_user(username="bob")
    carol = make_user(username="carol")       # NOT a member
    project = make_project(owner)
    add_member(project, bob, role="MEMBER")

    body = "Hey @bob and @carol and @owner please look"
    resolved = collaboration_service._resolve_mentions(db, project.id, body, owner.id)
    names = {u.username for u in resolved}
    assert names == {"bob"}            # carol excluded (not member), owner excluded (author)


def test_resolve_mentions_case_insensitive(db, make_user, make_project, add_member):
    owner = make_user(username="owner")
    bob = make_user(username="Bob")
    project = make_project(owner)
    add_member(project, bob, role="MEMBER")
    resolved = collaboration_service._resolve_mentions(db, project.id, "yo @BOB", owner.id)
    assert {u.username for u in resolved} == {"Bob"}


def test_resolve_mentions_none(db, make_user, make_project):
    owner = make_user(username="owner")
    project = make_project(owner)
    assert collaboration_service._resolve_mentions(db, project.id, "no mentions here", owner.id) == []


# ── notify dispatch targets mentioned + watchers (not author) ────────

def test_notify_comment_dispatches_to_mentioned(db, make_user, make_project, add_member, _capture_telegram):
    owner = make_user(username="owner")
    bob = make_user(username="bob")
    bob.telegram_chat_id = "12345"
    project = make_project(owner)
    add_member(project, bob, role="MEMBER")
    db.commit()
    task = _board_task(db, owner, project)

    collaboration_service.add_comment(db, owner.id, task.id, "ping @bob")

    chat_ids = [c[1] for c in _capture_telegram]
    assert "12345" in chat_ids


def test_notify_comment_skips_when_no_chat_id(db, make_user, make_project, add_member, _capture_telegram):
    owner = make_user(username="owner")
    bob = make_user(username="bob")  # no telegram_chat_id
    project = make_project(owner)
    add_member(project, bob, role="MEMBER")
    task = _board_task(db, owner, project)

    collaboration_service.add_comment(db, owner.id, task.id, "ping @bob")
    assert _capture_telegram == []  # nobody reachable


# ── watch / unwatch ──────────────────────────────────────────────────

def test_watch_and_unwatch(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    task = _board_task(db, owner, project)

    collaboration_service.add_watcher(db, owner.id, task.id)
    assert len(collaboration_service.list_watchers(db, owner.id, task.id)) == 1
    # Idempotent.
    collaboration_service.add_watcher(db, owner.id, task.id)
    assert len(collaboration_service.list_watchers(db, owner.id, task.id)) == 1

    collaboration_service.remove_watcher(db, owner.id, task.id)
    assert collaboration_service.list_watchers(db, owner.id, task.id) == []


# ── activity read + hooks fire on board ops ──────────────────────────

def test_list_task_activity_has_created(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    task = _board_task(db, owner, project)
    acts = collaboration_service.list_task_activity(db, owner.id, task.id)
    assert any(a["action"] == "CREATED" for a in acts)


def test_activity_hooks_on_move_and_assign(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    board_service.ensure_columns(db, project.id)
    cols = (
        db.query(BoardColumn).filter(BoardColumn.project_id == project.id)
        .order_by(BoardColumn.position).all()
    )
    task = board_service.create_task(db, owner.id, project.id, {"title": "t", "columnId": cols[0].id})

    board_service.move_task(db, owner.id, project.id, task.id, cols[1].id, 0)
    board_service.assign_task(db, owner.id, project.id, task.id, member.id)

    actions = {a["action"] for a in collaboration_service.list_task_activity(db, owner.id, task.id)}
    assert "MOVED" in actions
    assert "ASSIGNED" in actions


def test_activity_hook_on_transition(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    board_service.ensure_columns(db, project.id)
    cols = (
        db.query(BoardColumn).filter(BoardColumn.project_id == project.id)
        .order_by(BoardColumn.position).all()
    )
    task = board_service.create_task(db, owner.id, project.id, {"title": "t", "columnId": cols[0].id})
    board_service.transition_task(db, owner.id, project.id, task.id, "start")
    actions = {a["action"] for a in collaboration_service.list_task_activity(db, owner.id, task.id)}
    assert "START" in actions


def test_list_project_activity_limit_clamped(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    task = _board_task(db, owner, project)
    out = collaboration_service.list_project_activity(db, owner.id, project.id, limit=99999)
    assert isinstance(out, list)
    # CREATED activity present.
    assert any(a["action"] == "CREATED" for a in out)


# ── commentCount reflected in board task dict ────────────────────────

def test_comment_count_in_board_task_dict(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    task = _board_task(db, owner, project)
    collaboration_service.add_comment(db, owner.id, task.id, "one")
    collaboration_service.add_comment(db, owner.id, task.id, "two")

    d = board_service.board_task_to_dict(db, task)
    assert d["commentCount"] == 2


# ── API layer (TestClient) ───────────────────────────────────────────

def test_comments_api_full_flow(db, collab_client, make_user, make_project):
    client, set_user = collab_client
    owner = make_user()
    project = make_project(owner)
    task = _board_task(db, owner, project)
    set_user(owner)

    r = client.post(f"/api/tasks/{task.id}/comments", json={"body": "hello"})
    assert r.status_code == 200, r.text
    cid = r.json()["id"]

    r = client.get(f"/api/tasks/{task.id}/comments")
    assert r.status_code == 200
    assert len(r.json()) == 1

    r = client.put(f"/api/tasks/{task.id}/comments/{cid}", json={"body": "edited"})
    assert r.status_code == 200
    assert r.json()["body"] == "edited"

    r = client.delete(f"/api/tasks/{task.id}/comments/{cid}")
    assert r.status_code == 200

    r = client.get(f"/api/tasks/{task.id}/comments")
    assert r.json() == []


def test_comments_api_empty_body_400(db, collab_client, make_user, make_project):
    client, set_user = collab_client
    owner = make_user()
    project = make_project(owner)
    task = _board_task(db, owner, project)
    set_user(owner)
    r = client.post(f"/api/tasks/{task.id}/comments", json={"body": "   "})
    assert r.status_code == 400


def test_watchers_api(db, collab_client, make_user, make_project):
    client, set_user = collab_client
    owner = make_user()
    project = make_project(owner)
    task = _board_task(db, owner, project)
    set_user(owner)

    assert client.post(f"/api/tasks/{task.id}/watch").status_code == 200
    r = client.get(f"/api/tasks/{task.id}/watchers")
    assert len(r.json()) == 1
    assert client.delete(f"/api/tasks/{task.id}/watch").status_code == 200
    assert client.get(f"/api/tasks/{task.id}/watchers").json() == []


def test_activity_api(db, collab_client, make_user, make_project):
    client, set_user = collab_client
    owner = make_user()
    project = make_project(owner)
    task = _board_task(db, owner, project)
    set_user(owner)

    r = client.get(f"/api/tasks/{task.id}/activity")
    assert r.status_code == 200
    assert any(a["action"] == "CREATED" for a in r.json())

    r = client.get(f"/api/projects/{project.id}/activity?limit=10")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
