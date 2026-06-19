"""API tests for app.api.bug_reports.

Mounts only the bug-reports router on a local FastAPI app, mirroring the
app_client pattern from conftest (get_db / get_current_user overrides).
"""
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.core.security import get_current_user
from app.api.bug_reports import router as bug_reports_router


@pytest.fixture()
def qa_client(TestingSessionLocal):
    application = FastAPI()
    application.include_router(bug_reports_router)

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


def _base(project_id):
    return f"/api/projects/{project_id}/bug-reports"


def test_api_crud_flow(qa_client, make_user, make_project):
    client, set_user = qa_client
    owner = make_user(username="owner")
    project = make_project(owner)
    set_user(owner)

    # create
    resp = client.post(_base(project.id), json={"title": "Bug A", "severity": "HIGH"})
    assert resp.status_code == 200, resp.text
    report = resp.json()
    rid = report["id"]
    assert report["severity"] == "HIGH"

    # list
    resp = client.get(_base(project.id))
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    # list with status filter (no match)
    resp = client.get(_base(project.id), params={"status": "PASSED"})
    assert resp.json() == []

    # get
    resp = client.get(f"{_base(project.id)}/{rid}")
    assert resp.status_code == 200
    assert resp.json()["title"] == "Bug A"

    # update
    resp = client.put(f"{_base(project.id)}/{rid}", json={"status": "PASSED"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "PASSED"

    # delete
    resp = client.delete(f"{_base(project.id)}/{rid}")
    assert resp.status_code == 200
    resp = client.get(_base(project.id))
    assert resp.json() == []


def test_api_attachments_and_comments(qa_client, make_user, make_project):
    client, set_user = qa_client
    owner = make_user()
    project = make_project(owner)
    set_user(owner)

    rid = client.post(_base(project.id), json={"title": "Bug B"}).json()["id"]

    # attachment
    resp = client.post(
        f"{_base(project.id)}/{rid}/attachments",
        json={"imageData": "data:image/png;base64,AAAA", "caption": "shot"},
    )
    assert resp.status_code == 200, resp.text
    att_id = resp.json()["id"]

    # comment
    resp = client.post(f"{_base(project.id)}/{rid}/comments", json={"body": "looks bad"})
    assert resp.status_code == 200
    com_id = resp.json()["id"]

    full = client.get(f"{_base(project.id)}/{rid}").json()
    assert len(full["attachments"]) == 1
    assert len(full["comments"]) == 1

    # delete attachment + comment
    assert client.delete(f"{_base(project.id)}/{rid}/attachments/{att_id}").status_code == 200
    assert client.delete(f"{_base(project.id)}/{rid}/comments/{com_id}").status_code == 200

    full = client.get(f"{_base(project.id)}/{rid}").json()
    assert full["attachments"] == []
    assert full["comments"] == []


def test_api_outsider_403(qa_client, make_user, make_project):
    client, set_user = qa_client
    owner = make_user()
    outsider = make_user()
    project = make_project(owner)
    set_user(outsider)
    resp = client.get(_base(project.id))
    assert resp.status_code == 403


def test_api_get_404(qa_client, make_user, make_project):
    client, set_user = qa_client
    owner = make_user()
    project = make_project(owner)
    set_user(owner)
    resp = client.get(f"{_base(project.id)}/nope")
    assert resp.status_code == 404
