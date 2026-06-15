"""API-layer tests for sprints + ai routers (Phase 3) via TestClient.

These exercise the FastAPI route handlers (request parsing + service wiring)
that the service-level tests don't reach. No live network: the AI path is
left on the rule-based fallback (no OpenRouter key).
"""
import pytest

from app.models.board_column import BoardColumn
from app.services import board_service, sprint_service


@pytest.fixture()
def phase3_client(TestingSessionLocal):
    from fastapi import FastAPI, HTTPException
    from fastapi.testclient import TestClient
    from app.core.database import get_db
    from app.core.security import get_current_user
    from app.api.sprints import router as sprints_router, backlog_router
    from app.api.ai import router as ai_router
    from app.api.performance import router as performance_router

    application = FastAPI()
    application.include_router(sprints_router)
    application.include_router(backlog_router)
    application.include_router(ai_router)
    application.include_router(performance_router)

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

    client = TestClient(application)

    def set_user(user):
        state["user"] = user

    yield client, set_user
    application.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def _no_ai_key(monkeypatch):
    from app.services import ai_service
    monkeypatch.setattr(ai_service.settings, "OPENROUTER_API_KEY", "", raising=False)


def _first_col(db, project_id):
    board_service.ensure_columns(db, project_id)
    return (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project_id)
        .order_by(BoardColumn.position)
        .first()
    )


# ── sprints API ──────────────────────────────────────────────────────

def test_sprints_api_crud_and_lifecycle(db, phase3_client, make_user, make_project):
    client, set_user = phase3_client
    owner = make_user()
    project = make_project(owner)
    set_user(owner)

    # create
    r = client.post(f"/api/projects/{project.id}/sprints", json={"name": "S1", "goal": "g"})
    assert r.status_code == 200, r.text
    sid = r.json()["id"]

    # list
    r = client.get(f"/api/projects/{project.id}/sprints")
    assert r.status_code == 200
    assert len(r.json()) == 1

    # update
    r = client.put(f"/api/projects/{project.id}/sprints/{sid}", json={"name": "S1b"})
    assert r.status_code == 200
    assert r.json()["name"] == "S1b"

    # start / complete
    assert client.post(f"/api/projects/{project.id}/sprints/{sid}/start").json()["status"] == "ACTIVE"
    assert client.post(f"/api/projects/{project.id}/sprints/{sid}/complete").json()["status"] == "COMPLETED"

    # delete
    r = client.delete(f"/api/projects/{project.id}/sprints/{sid}")
    assert r.status_code == 200
    assert client.get(f"/api/projects/{project.id}/sprints").json() == []


def test_sprints_api_add_remove_task_and_backlog(db, phase3_client, make_user, make_project):
    client, set_user = phase3_client
    owner = make_user()
    project = make_project(owner)
    set_user(owner)
    col = _first_col(db, project.id)
    task = board_service.create_task(db, owner.id, project.id, {"title": "t", "columnId": col.id, "storyPoints": 3})

    sid = client.post(f"/api/projects/{project.id}/sprints", json={"name": "S1"}).json()["id"]

    # backlog has the task before assignment
    r = client.get(f"/api/projects/{project.id}/backlog")
    assert r.status_code == 200
    assert any(t["id"] == task.id for t in r.json())

    # add to sprint
    r = client.post(f"/api/projects/{project.id}/sprints/{sid}/tasks/{task.id}")
    assert r.status_code == 200
    assert r.json()["task"]["sprintId"] == sid

    # backlog now empty
    assert client.get(f"/api/projects/{project.id}/backlog").json() == []

    # remove from sprint
    r = client.delete(f"/api/projects/{project.id}/sprints/{sid}/tasks/{task.id}")
    assert r.status_code == 200
    assert r.json()["task"]["sprintId"] is None


def test_sprints_api_member_forbidden(db, phase3_client, make_user, make_project, add_member):
    client, set_user = phase3_client
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    set_user(member)
    r = client.post(f"/api/projects/{project.id}/sprints", json={"name": "S1"})
    assert r.status_code == 403


# ── ai API ───────────────────────────────────────────────────────────

def test_ai_task_questions_endpoint(db, phase3_client, make_user):
    client, set_user = phase3_client
    set_user(make_user())
    r = client.post("/api/ai/task-questions", json={"title": "Add feature"})
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "rules"
    assert len(body["questions"]) >= 3


def test_ai_estimate_endpoint(db, phase3_client, make_user, make_project):
    client, set_user = phase3_client
    owner = make_user()
    project = make_project(owner)
    set_user(owner)
    r = client.post(f"/api/projects/{project.id}/ai/estimate",
                    json={"title": "Task", "description": "d", "answers": {}})
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "rules"
    assert 1 <= body["storyPoints"] <= 10


def test_ai_estimate_requires_member(db, phase3_client, make_user, make_project):
    client, set_user = phase3_client
    owner = make_user()
    outsider = make_user()
    project = make_project(owner)
    set_user(outsider)
    r = client.post(f"/api/projects/{project.id}/ai/estimate", json={"title": "Task"})
    assert r.status_code == 403


def test_ai_create_task_endpoint(db, phase3_client, make_user, make_project):
    client, set_user = phase3_client
    owner = make_user()
    project = make_project(owner)
    set_user(owner)
    # No columnId -> falls back to BACKLOG column.
    r = client.post(f"/api/projects/{project.id}/ai/create-task",
                    json={"title": "Build thing", "description": "complex migr"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["task"]["title"] == "Build thing"
    assert body["task"]["storyPoints"] == body["estimate"]["storyPoints"]
    # Landed in the BACKLOG column.
    backlog = (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project.id, BoardColumn.column_type == "BACKLOG")
        .first()
    )
    assert body["task"]["boardColumnId"] == backlog.id


def test_ai_create_task_explicit_column_and_assignee(db, phase3_client, make_user, make_project, add_member):
    client, set_user = phase3_client
    owner = make_user()
    assignee = make_user()
    project = make_project(owner)
    add_member(project, assignee, role="MEMBER")
    set_user(owner)
    col = _first_col(db, project.id)
    r = client.post(f"/api/projects/{project.id}/ai/create-task",
                    json={"title": "T", "columnId": col.id, "assigneeId": assignee.id})
    assert r.status_code == 200, r.text
    assert r.json()["task"]["assignee"]["userId"] == assignee.id


def test_ai_create_task_bad_assignee_400(db, phase3_client, make_user, make_project):
    client, set_user = phase3_client
    owner = make_user()
    stranger = make_user()
    project = make_project(owner)
    set_user(owner)
    r = client.post(f"/api/projects/{project.id}/ai/create-task",
                    json={"title": "T", "assigneeId": stranger.id})
    assert r.status_code == 400


# ── performance API ──────────────────────────────────────────────────

def test_performance_api(db, phase3_client, make_user, make_project):
    client, set_user = phase3_client
    owner = make_user()
    project = make_project(owner)
    set_user(owner)
    _first_col(db, project.id)
    r = client.get(f"/api/projects/{project.id}/performance")
    assert r.status_code == 200
    body = r.json()
    assert "perMember" in body and "sprints" in body and "totals" in body
