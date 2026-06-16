"""Cautare globala (Cmd-K): scoping pe user + potrivire pe titlu/nume."""
import pytest


@pytest.fixture()
def search_client(TestingSessionLocal):
    from fastapi import FastAPI, HTTPException
    from fastapi.testclient import TestClient
    from app.core.database import get_db
    from app.core.security import get_current_user
    from app.api.search import router as search_router

    application = FastAPI()
    application.include_router(search_router)
    state = {"user": None}

    def _db():
        s = TestingSessionLocal()
        try:
            yield s
        finally:
            s.close()

    def _user():
        if state["user"] is None:
            raise HTTPException(status_code=401, detail="no user")
        return state["user"]

    application.dependency_overrides[get_db] = _db
    application.dependency_overrides[get_current_user] = _user
    client = TestClient(application)

    def set_user(u):
        state["user"] = u

    yield client, set_user
    application.dependency_overrides.clear()


def test_search_short_query_returns_empty(db, search_client, make_user):
    client, set_user = search_client
    set_user(make_user(username="s1"))
    r = client.get("/api/search", params={"q": "a"})
    assert r.status_code == 200
    assert r.json() == {"projects": [], "tasks": [], "events": []}


def test_search_finds_own_project(db, search_client, make_user, make_project):
    client, set_user = search_client
    owner = make_user(username="s2")
    make_project(owner, name="Proiect Alfa", key="ALF")
    set_user(owner)
    body = client.get("/api/search", params={"q": "alfa"}).json()
    assert any(p["name"] == "Proiect Alfa" for p in body["projects"])


def test_search_does_not_leak_other_users_project(db, search_client, make_user, make_project):
    client, set_user = search_client
    owner = make_user(username="s3")
    other = make_user(username="s4")
    make_project(owner, name="Secret Beta", key="BET")
    set_user(other)  # other nu e membru
    body = client.get("/api/search", params={"q": "beta"}).json()
    assert body["projects"] == []


def test_search_finds_assigned_task(db, search_client, make_user, make_project, add_member):
    from app.services import board_service
    from app.models.board_column import BoardColumn
    client, set_user = search_client
    owner = make_user(username="s5")
    worker = make_user(username="s6")
    project = make_project(owner)
    add_member(project, worker, role="MEMBER")
    board_service.ensure_columns(db, project.id)
    col = db.query(BoardColumn).filter(BoardColumn.project_id == project.id).order_by(BoardColumn.position).first()
    task = board_service.create_task(db, owner.id, project.id, {"title": "Cauta-ma", "columnId": col.id})
    board_service.assign_task(db, owner.id, project.id, task.id, worker.id)
    set_user(worker)
    body = client.get("/api/search", params={"q": "cauta"}).json()
    assert any(t["title"] == "Cauta-ma" for t in body["tasks"])
