"""Tests for app.services.bug_report_service (QA / Bug Report module).

Uses the SQLite in-memory DB + helpers from conftest. Mirrors the style of
test_sprint_service.py: HTTPException-based permission/validation assertions.
"""
import pytest
from fastapi import HTTPException

from app.services import bug_report_service


# ── create: permissions + validation ─────────────────────────────────

def test_create_report_member_ok(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")

    out = bug_report_service.create_report(
        db, member.id, project.id, {"title": "Login broken"}
    )
    assert out["title"] == "Login broken"
    assert out["status"] == "OPEN"
    assert out["severity"] == "MEDIUM"
    assert out["createdBy"] == member.id
    assert out["steps"] == []
    assert out["attachments"] == []
    assert out["comments"] == []


def test_create_report_owner_ok(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    out = bug_report_service.create_report(
        db, owner.id, project.id,
        {"title": "Crash", "description": "boom", "severity": "HIGH", "status": "IN_PROGRESS"},
    )
    assert out["severity"] == "HIGH"
    assert out["status"] == "IN_PROGRESS"
    assert out["description"] == "boom"


def test_create_report_viewer_403(db, make_user, make_project, add_member):
    owner = make_user()
    viewer = make_user()
    project = make_project(owner)
    add_member(project, viewer, role="VIEWER")
    with pytest.raises(HTTPException) as exc:
        bug_report_service.create_report(db, viewer.id, project.id, {"title": "x"})
    assert exc.value.status_code == 403


def test_create_report_outsider_403(db, make_user, make_project):
    owner = make_user()
    outsider = make_user()
    project = make_project(owner)
    with pytest.raises(HTTPException) as exc:
        bug_report_service.create_report(db, outsider.id, project.id, {"title": "x"})
    assert exc.value.status_code == 403


def test_create_report_empty_title_400(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    with pytest.raises(HTTPException) as exc:
        bug_report_service.create_report(db, owner.id, project.id, {"title": "   "})
    assert exc.value.status_code == 400


def test_create_report_invalid_status_400(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    with pytest.raises(HTTPException) as exc:
        bug_report_service.create_report(
            db, owner.id, project.id, {"title": "x", "status": "WAT"}
        )
    assert exc.value.status_code == 400


def test_create_report_invalid_severity_400(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    with pytest.raises(HTTPException) as exc:
        bug_report_service.create_report(
            db, owner.id, project.id, {"title": "x", "severity": "MEGA"}
        )
    assert exc.value.status_code == 400


# ── steps normalization ──────────────────────────────────────────────

def test_create_report_normalizes_steps(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    out = bug_report_service.create_report(db, owner.id, project.id, {
        "title": "steps",
        "steps": [
            {"text": "Open page"},
            {"id": "fixed", "text": "Click", "done": True, "result": "pass"},
            "plain string step",
        ],
    })
    steps = out["steps"]
    assert len(steps) == 3
    # All steps have the 4 keys.
    for s in steps:
        assert set(s.keys()) == {"id", "text", "done", "result"}
    assert steps[0]["done"] is False
    assert steps[0]["result"] is None
    assert steps[0]["id"]  # auto-generated
    assert steps[1]["id"] == "fixed"
    assert steps[1]["done"] is True
    assert steps[1]["result"] == "pass"
    assert steps[2]["text"] == "plain string step"
    assert out["stepsSummary"] == {"doneCount": 1, "total": 3}


def test_create_report_invalid_step_result_400(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    with pytest.raises(HTTPException) as exc:
        bug_report_service.create_report(db, owner.id, project.id, {
            "title": "x", "steps": [{"text": "a", "result": "maybe"}],
        })
    assert exc.value.status_code == 400


def test_create_report_steps_not_list_400(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    with pytest.raises(HTTPException) as exc:
        bug_report_service.create_report(
            db, owner.id, project.id, {"title": "x", "steps": "notalist"}
        )
    assert exc.value.status_code == 400


# ── list + status filter ─────────────────────────────────────────────

def test_list_reports_newest_first_and_summary(db, make_user, make_project):
    owner = make_user(username="owner")
    project = make_project(owner)
    r1 = bug_report_service.create_report(db, owner.id, project.id, {"title": "first"})
    r2 = bug_report_service.create_report(db, owner.id, project.id, {"title": "second"})

    out = bug_report_service.list_reports(db, owner.id, project.id)
    assert len(out) == 2
    # Newest first.
    assert out[0]["id"] == r2["id"]
    assert out[1]["id"] == r1["id"]
    # Summary shape: no heavy fields.
    assert "description" not in out[0]
    assert "steps" not in out[0]
    assert "attachments" not in out[0]
    assert out[0]["attachmentCount"] == 0
    assert out[0]["commentCount"] == 0
    assert out[0]["createdByUsername"] == "owner"
    assert out[0]["stepsSummary"] == {"doneCount": 0, "total": 0}


def test_list_reports_status_filter(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    bug_report_service.create_report(db, owner.id, project.id, {"title": "a", "status": "OPEN"})
    bug_report_service.create_report(db, owner.id, project.id, {"title": "b", "status": "PASSED"})

    passed = bug_report_service.list_reports(db, owner.id, project.id, status="PASSED")
    assert len(passed) == 1
    assert passed[0]["title"] == "b"


def test_list_reports_invalid_status_400(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    with pytest.raises(HTTPException) as exc:
        bug_report_service.list_reports(db, owner.id, project.id, status="NOPE")
    assert exc.value.status_code == 400


def test_list_reports_viewer_ok(db, make_user, make_project, add_member):
    owner = make_user()
    viewer = make_user()
    project = make_project(owner)
    add_member(project, viewer, role="VIEWER")
    bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    out = bug_report_service.list_reports(db, viewer.id, project.id)
    assert len(out) == 1


def test_list_reports_outsider_403(db, make_user, make_project):
    owner = make_user()
    outsider = make_user()
    project = make_project(owner)
    with pytest.raises(HTTPException) as exc:
        bug_report_service.list_reports(db, outsider.id, project.id)
    assert exc.value.status_code == 403


def test_list_reports_excludes_soft_deleted(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "del"})
    bug_report_service.delete_report(db, owner.id, project.id, r["id"])
    out = bug_report_service.list_reports(db, owner.id, project.id)
    assert out == []


# ── get ──────────────────────────────────────────────────────────────

def test_get_report_full(db, make_user, make_project):
    owner = make_user(username="owner")
    project = make_project(owner)
    r = bug_report_service.create_report(
        db, owner.id, project.id, {"title": "full", "description": "d"}
    )
    out = bug_report_service.get_report(db, owner.id, project.id, r["id"])
    assert out["description"] == "d"
    assert out["createdByUsername"] == "owner"
    assert out["attachments"] == []
    assert out["comments"] == []


def test_get_report_404_wrong_id(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    with pytest.raises(HTTPException) as exc:
        bug_report_service.get_report(db, owner.id, project.id, "nope")
    assert exc.value.status_code == 404


def test_get_report_404_wrong_project(db, make_user, make_project):
    owner = make_user()
    project_a = make_project(owner, name="A", key="AAA")
    project_b = make_project(owner, name="B", key="BBB")
    r = bug_report_service.create_report(db, owner.id, project_a.id, {"title": "x"})
    with pytest.raises(HTTPException) as exc:
        bug_report_service.get_report(db, owner.id, project_b.id, r["id"])
    assert exc.value.status_code == 404


# ── update ───────────────────────────────────────────────────────────

def test_update_report_creator_ok(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    out = bug_report_service.update_report(db, owner.id, project.id, r["id"], {
        "title": "y", "status": "FAILED", "severity": "CRITICAL", "description": "dd",
    })
    assert out["title"] == "y"
    assert out["status"] == "FAILED"
    assert out["severity"] == "CRITICAL"
    assert out["description"] == "dd"


def test_update_report_admin_ok(db, make_user, make_project, add_member):
    owner = make_user()
    admin = make_user()
    project = make_project(owner)
    add_member(project, admin, role="ADMIN")
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    out = bug_report_service.update_report(db, admin.id, project.id, r["id"], {"status": "PASSED"})
    assert out["status"] == "PASSED"


def test_update_report_member_non_creator_403(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    with pytest.raises(HTTPException) as exc:
        bug_report_service.update_report(db, member.id, project.id, r["id"], {"status": "PASSED"})
    assert exc.value.status_code == 403


def test_update_report_invalid_status_400(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    with pytest.raises(HTTPException) as exc:
        bug_report_service.update_report(db, owner.id, project.id, r["id"], {"status": "WAT"})
    assert exc.value.status_code == 400


def test_update_report_invalid_severity_400(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    with pytest.raises(HTTPException) as exc:
        bug_report_service.update_report(db, owner.id, project.id, r["id"], {"severity": "MEGA"})
    assert exc.value.status_code == 400


def test_update_report_empty_title_400(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    with pytest.raises(HTTPException) as exc:
        bug_report_service.update_report(db, owner.id, project.id, r["id"], {"title": "  "})
    assert exc.value.status_code == 400


def test_update_report_steps_and_assignee(db, make_user, make_project, add_member):
    owner = make_user()
    assignee = make_user(username="bob")
    project = make_project(owner)
    add_member(project, assignee, role="MEMBER")
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    out = bug_report_service.update_report(db, owner.id, project.id, r["id"], {
        "steps": [{"text": "step1", "done": True, "result": "pass"}],
        "assigneeId": assignee.id,
    })
    assert out["assigneeId"] == assignee.id
    assert out["assigneeUsername"] == "bob"
    assert out["stepsSummary"] == {"doneCount": 1, "total": 1}


def test_update_report_404(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    with pytest.raises(HTTPException) as exc:
        bug_report_service.update_report(db, owner.id, project.id, "nope", {"title": "y"})
    assert exc.value.status_code == 404


# ── delete (soft) ────────────────────────────────────────────────────

def test_delete_report_soft(db, make_user, make_project):
    from app.models.bug_report import BugReport
    owner = make_user()
    project = make_project(owner)
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    bug_report_service.delete_report(db, owner.id, project.id, r["id"])
    row = db.query(BugReport).filter(BugReport.id == r["id"]).first()
    assert row is not None
    assert row.is_active is False


def test_delete_report_member_non_creator_403(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    with pytest.raises(HTTPException) as exc:
        bug_report_service.delete_report(db, member.id, project.id, r["id"])
    assert exc.value.status_code == 403


def test_delete_report_admin_ok(db, make_user, make_project, add_member):
    from app.models.bug_report import BugReport
    owner = make_user()
    admin = make_user()
    project = make_project(owner)
    add_member(project, admin, role="ADMIN")
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    bug_report_service.delete_report(db, admin.id, project.id, r["id"])
    row = db.query(BugReport).filter(BugReport.id == r["id"]).first()
    assert row.is_active is False


# ── attachments ──────────────────────────────────────────────────────

def test_add_attachment_ok(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    att = bug_report_service.add_attachment(db, owner.id, project.id, r["id"], {
        "imageData": "data:image/png;base64,AAAA", "caption": "screenshot",
    })
    assert att["imageData"].startswith("data:image/png")
    assert att["caption"] == "screenshot"
    full = bug_report_service.get_report(db, owner.id, project.id, r["id"])
    assert len(full["attachments"]) == 1


def test_add_attachment_empty_400(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    with pytest.raises(HTTPException) as exc:
        bug_report_service.add_attachment(db, owner.id, project.id, r["id"], {"imageData": "  "})
    assert exc.value.status_code == 400


def test_add_attachment_viewer_403(db, make_user, make_project, add_member):
    owner = make_user()
    viewer = make_user()
    project = make_project(owner)
    add_member(project, viewer, role="VIEWER")
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    with pytest.raises(HTTPException) as exc:
        bug_report_service.add_attachment(
            db, viewer.id, project.id, r["id"], {"imageData": "data:x"}
        )
    assert exc.value.status_code == 403


def test_delete_attachment_creator_ok(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    att = bug_report_service.add_attachment(db, member.id, project.id, r["id"], {"imageData": "data:x"})
    bug_report_service.delete_attachment(db, member.id, project.id, r["id"], att["id"])
    full = bug_report_service.get_report(db, owner.id, project.id, r["id"])
    assert full["attachments"] == []


def test_delete_attachment_other_member_403(db, make_user, make_project, add_member):
    owner = make_user()
    m1 = make_user()
    m2 = make_user()
    project = make_project(owner)
    add_member(project, m1, role="MEMBER")
    add_member(project, m2, role="MEMBER")
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    att = bug_report_service.add_attachment(db, m1.id, project.id, r["id"], {"imageData": "data:x"})
    with pytest.raises(HTTPException) as exc:
        bug_report_service.delete_attachment(db, m2.id, project.id, r["id"], att["id"])
    assert exc.value.status_code == 403


def test_delete_attachment_admin_ok(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    admin = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    add_member(project, admin, role="ADMIN")
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    att = bug_report_service.add_attachment(db, member.id, project.id, r["id"], {"imageData": "data:x"})
    bug_report_service.delete_attachment(db, admin.id, project.id, r["id"], att["id"])
    full = bug_report_service.get_report(db, owner.id, project.id, r["id"])
    assert full["attachments"] == []


def test_delete_attachment_404(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    with pytest.raises(HTTPException) as exc:
        bug_report_service.delete_attachment(db, owner.id, project.id, r["id"], "nope")
    assert exc.value.status_code == 404


# ── comments ─────────────────────────────────────────────────────────

def test_add_comment_ok(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user(username="carol")
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    com = bug_report_service.add_comment(db, member.id, project.id, r["id"], "hello")
    assert com["body"] == "hello"
    assert com["username"] == "carol"
    full = bug_report_service.get_report(db, owner.id, project.id, r["id"])
    assert len(full["comments"]) == 1


def test_add_comment_empty_400(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    with pytest.raises(HTTPException) as exc:
        bug_report_service.add_comment(db, owner.id, project.id, r["id"], "   ")
    assert exc.value.status_code == 400


def test_add_comment_viewer_403(db, make_user, make_project, add_member):
    owner = make_user()
    viewer = make_user()
    project = make_project(owner)
    add_member(project, viewer, role="VIEWER")
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    with pytest.raises(HTTPException) as exc:
        bug_report_service.add_comment(db, viewer.id, project.id, r["id"], "hi")
    assert exc.value.status_code == 403


def test_delete_comment_author_ok(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    com = bug_report_service.add_comment(db, member.id, project.id, r["id"], "hi")
    bug_report_service.delete_comment(db, member.id, project.id, r["id"], com["id"])
    full = bug_report_service.get_report(db, owner.id, project.id, r["id"])
    assert full["comments"] == []


def test_delete_comment_other_member_403(db, make_user, make_project, add_member):
    owner = make_user()
    m1 = make_user()
    m2 = make_user()
    project = make_project(owner)
    add_member(project, m1, role="MEMBER")
    add_member(project, m2, role="MEMBER")
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    com = bug_report_service.add_comment(db, m1.id, project.id, r["id"], "hi")
    with pytest.raises(HTTPException) as exc:
        bug_report_service.delete_comment(db, m2.id, project.id, r["id"], com["id"])
    assert exc.value.status_code == 403


def test_delete_comment_admin_ok(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    admin = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    add_member(project, admin, role="ADMIN")
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    com = bug_report_service.add_comment(db, member.id, project.id, r["id"], "hi")
    bug_report_service.delete_comment(db, admin.id, project.id, r["id"], com["id"])
    full = bug_report_service.get_report(db, owner.id, project.id, r["id"])
    assert full["comments"] == []


def test_delete_comment_404(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    r = bug_report_service.create_report(db, owner.id, project.id, {"title": "x"})
    with pytest.raises(HTTPException) as exc:
        bug_report_service.delete_comment(db, owner.id, project.id, r["id"], "nope")
    assert exc.value.status_code == 404


# ── report belongs-to-project enforcement on sub-resources ───────────

def test_add_comment_wrong_project_404(db, make_user, make_project):
    owner = make_user()
    project_a = make_project(owner, name="A", key="AAA")
    project_b = make_project(owner, name="B", key="BBB")
    r = bug_report_service.create_report(db, owner.id, project_a.id, {"title": "x"})
    with pytest.raises(HTTPException) as exc:
        bug_report_service.add_comment(db, owner.id, project_b.id, r["id"], "hi")
    assert exc.value.status_code == 404
