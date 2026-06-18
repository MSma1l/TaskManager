"""Tests pentru report_share_service ("View Account" — linkuri publice read-only).

Acopera create_share (team/project, permisiuni ADMIN, validare), list_shares,
revoke_share si get_public_report (404 lipsa/inactiv, payload team + project).
"""
import pytest
from fastapi import HTTPException

from app.models.board_column import BoardColumn
from app.models.report_share import ReportShare
from app.services import board_service, report_share_service, sprint_service


# ── helpers ──────────────────────────────────────────────────────────

def _columns(db, project_id):
    board_service.ensure_columns(db, project_id)
    return (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project_id)
        .order_by(BoardColumn.position)
        .all()
    )


def _done_column(db, project_id):
    return next(c for c in _columns(db, project_id) if c.column_type == "DONE")


def _completed_sprint_with_done_task(db, owner, project):
    """Inchide un sprint cu un task terminat (-> sprint.report cu perMember)."""
    cols = _columns(db, project.id)
    done = _done_column(db, project.id)
    s = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S1"})
    task = board_service.create_task(db, owner.id, project.id, {
        "title": "t", "columnId": cols[0].id, "assigneeId": owner.id, "storyPoints": 4,
    })
    sprint_service.add_task_to_sprint(db, owner.id, project.id, s["id"], task.id)
    task.board_column_id = done.id
    db.commit()
    sprint_service.complete_sprint(db, owner.id, project.id, s["id"])


# ── create_share ─────────────────────────────────────────────────────

def test_create_share_team(db, make_user):
    owner = make_user()
    out = report_share_service.create_share(db, owner.id, "team", label="Echipa")
    assert out["scope"] == "team"
    assert out["projectId"] is None
    assert out["token"]
    assert out["path"] == f"/view/{out['token']}"


def test_create_share_project_admin_ok(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    out = report_share_service.create_share(db, owner.id, "project", project.id)
    assert out["scope"] == "project"
    assert out["projectId"] == project.id


def test_create_share_project_member_403(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    with pytest.raises(HTTPException) as exc:
        report_share_service.create_share(db, member.id, "project", project.id)
    assert exc.value.status_code == 403


def test_create_share_project_without_id_400(db, make_user):
    owner = make_user()
    with pytest.raises(HTTPException) as exc:
        report_share_service.create_share(db, owner.id, "project")
    assert exc.value.status_code == 400


def test_create_share_invalid_scope_400(db, make_user):
    owner = make_user()
    with pytest.raises(HTTPException) as exc:
        report_share_service.create_share(db, owner.id, "weird")
    assert exc.value.status_code == 400


# ── list / revoke ────────────────────────────────────────────────────

def test_list_shares_only_own_active(db, make_user):
    owner = make_user()
    other = make_user()
    a = report_share_service.create_share(db, owner.id, "team")
    report_share_service.create_share(db, other.id, "team")  # alt creator

    shares = report_share_service.list_shares(db, owner.id)
    assert {s["id"] for s in shares} == {a["id"]}


def test_revoke_share(db, make_user):
    owner = make_user()
    a = report_share_service.create_share(db, owner.id, "team")
    out = report_share_service.revoke_share(db, owner.id, a["id"])
    assert out["isActive"] is False
    row = db.query(ReportShare).filter(ReportShare.id == a["id"]).first()
    assert row.is_active is False
    # Nu mai apare in list_shares (filtrat pe is_active).
    assert report_share_service.list_shares(db, owner.id) == []


def test_revoke_share_unknown_404(db, make_user):
    owner = make_user()
    with pytest.raises(HTTPException) as exc:
        report_share_service.revoke_share(db, owner.id, "nope")
    assert exc.value.status_code == 404


def test_revoke_share_other_user_404(db, make_user):
    owner = make_user()
    other = make_user()
    a = report_share_service.create_share(db, owner.id, "team")
    with pytest.raises(HTTPException) as exc:
        report_share_service.revoke_share(db, other.id, a["id"])
    assert exc.value.status_code == 404


# ── get_public_report ────────────────────────────────────────────────

def test_get_public_report_team(db, make_user, make_project):
    owner = make_user(username="owner")
    project = make_project(owner)
    _completed_sprint_with_done_task(db, owner, project)
    share = report_share_service.create_share(db, owner.id, "team")

    out = report_share_service.get_public_report(db, share["token"])
    assert out["scope"] == "team"
    assert any(p["id"] == project.id for p in out["projects"])
    # Productivitatea echipei agregata din rapoartele sprinturilor inchise.
    by_user = {m["userId"]: m for m in out["teamMemberProductivity"]}
    assert by_user[owner.id]["storyPointsDone"] == 4


def test_get_public_report_project(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    _completed_sprint_with_done_task(db, owner, project)
    share = report_share_service.create_share(db, owner.id, "project", project.id)

    out = report_share_service.get_public_report(db, share["token"])
    assert out["scope"] == "project"
    assert len(out["projects"]) == 1
    assert out["projects"][0]["id"] == project.id
    assert out["teamMemberProductivity"] == out["projects"][0]["memberProductivity"]


def test_get_public_report_missing_token_404(db):
    with pytest.raises(HTTPException) as exc:
        report_share_service.get_public_report(db, "no-such-token")
    assert exc.value.status_code == 404


def test_get_public_report_revoked_404(db, make_user):
    owner = make_user()
    share = report_share_service.create_share(db, owner.id, "team")
    report_share_service.revoke_share(db, owner.id, share["id"])
    with pytest.raises(HTTPException) as exc:
        report_share_service.get_public_report(db, share["token"])
    assert exc.value.status_code == 404


def test_get_public_report_project_inactive_404(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    share = report_share_service.create_share(db, owner.id, "project", project.id)
    project.is_active = False
    db.commit()
    with pytest.raises(HTTPException) as exc:
        report_share_service.get_public_report(db, share["token"])
    assert exc.value.status_code == 404


# ── API (app.api.report_shares) ──────────────────────────────────────

def _share_client(TestingSessionLocal):
    from fastapi import FastAPI, HTTPException
    from fastapi.testclient import TestClient
    from app.core.database import get_db
    from app.core.security import get_current_user
    from app.api.report_shares import router as shares_router

    application = FastAPI()
    application.include_router(shares_router)
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


def test_api_create_list_revoke_and_public(db, TestingSessionLocal, make_user):
    owner = make_user()
    client, state = _share_client(TestingSessionLocal)
    state["user"] = owner

    created = client.post("/api/report-shares", json={"scope": "team", "label": "Echipa"})
    assert created.status_code == 200
    token = created.json()["token"]
    share_id = created.json()["id"]

    listed = client.get("/api/report-shares")
    assert any(s["id"] == share_id for s in listed.json())

    # Endpoint public (fara auth) — folosim acelasi client, dar nu necesita user.
    public = client.get(f"/api/report-shares/public/{token}")
    assert public.status_code == 200
    assert public.json()["scope"] == "team"

    revoked = client.post(f"/api/report-shares/{share_id}/revoke")
    assert revoked.status_code == 200
    assert revoked.json()["isActive"] is False
