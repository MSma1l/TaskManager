"""Tests pentru raportul de sprint (sprint_service._build_report / complete_sprint /
list_reports). Oglindeste stilul din test_sprint_service.py.

Ruleaza pe SQLite in-memory din conftest. Taskurile de board sunt create prin
board_service ca sa poarte board_column_id / story_points corect.
"""
import pytest
from fastapi import HTTPException

from app.models.board_column import BoardColumn
from app.models.notification import Notification
from app.models.sprint import Sprint
from app.services import board_service, sprint_service


# ── helpers (copiate din test_sprint_service.py) ─────────────────────

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


def _mk_task(db, owner, project, col, title="t", assignee=None, points=None):
    return board_service.create_task(db, owner.id, project.id, {
        "title": title,
        "columnId": col.id,
        "assigneeId": assignee.id if assignee else None,
        "storyPoints": points,
    })


# ── complete_sprint: report content + closed_at + status ─────────────

def test_complete_sprint_builds_report_and_sets_closed_at(db, make_user, make_project):
    owner = make_user(username="owner")
    project = make_project(owner)
    cols = _columns(db, project.id)
    done_col = _done_column(db, project.id)
    s = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S1"})

    done_task = _mk_task(db, owner, project, cols[0], title="done", assignee=owner, points=3)
    open_task = _mk_task(db, owner, project, cols[0], title="open", assignee=owner, points=5)
    sprint_service.add_task_to_sprint(db, owner.id, project.id, s["id"], done_task.id)
    sprint_service.add_task_to_sprint(db, owner.id, project.id, s["id"], open_task.id)

    # Muta done_task in coloana "terminat".
    done_task.board_column_id = done_col.id
    db.commit()

    out = sprint_service.complete_sprint(db, owner.id, project.id, s["id"])
    assert out["status"] == "COMPLETED"

    sprint = db.query(Sprint).filter(Sprint.id == s["id"]).first()
    assert sprint.status == "COMPLETED"
    assert sprint.closed_at is not None

    report = sprint.report
    assert report["totalTasks"] == 2
    assert report["completedTasks"] == 1
    assert report["completionPct"] == 50
    assert report["totalPoints"] == 8
    assert report["completedPoints"] == 3
    assert report["generatedAt"]

    # perMember: owner are 1 task done (3 puncte) + 1 task pending.
    by_user = {pm["userId"]: pm for pm in report["perMember"]}
    assert by_user[owner.id]["tasksDone"] == 1
    assert by_user[owner.id]["storyPointsDone"] == 3
    assert by_user[owner.id]["tasksPending"] == 1
    assert by_user[owner.id]["username"] == "owner"

    # burndown: 2 puncte (start/end), actual final = totalPoints - completedPoints.
    assert report["burndown"] == [
        {"label": "start", "ideal": 8, "actual": 8},
        {"label": "end", "ideal": 0, "actual": 5},
    ]


def test_complete_sprint_notifies_members(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    cols = _columns(db, project.id)
    s = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S1"})
    task = _mk_task(db, owner, project, cols[0], points=2)
    sprint_service.add_task_to_sprint(db, owner.id, project.id, s["id"], task.id)

    sprint_service.complete_sprint(db, owner.id, project.id, s["id"])

    notes = (
        db.query(Notification)
        .filter(Notification.user_id == member.id, Notification.type == "SPRINT_CLOSED")
        .all()
    )
    assert len(notes) == 1
    assert "S1" in notes[0].title


def test_complete_sprint_empty_report(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    s = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S1"})

    sprint_service.complete_sprint(db, owner.id, project.id, s["id"])
    sprint = db.query(Sprint).filter(Sprint.id == s["id"]).first()
    assert sprint.report["totalTasks"] == 0
    assert sprint.report["completionPct"] == 0
    assert sprint.report["totalPoints"] == 0


def test_complete_sprint_member_403(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    s = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S1"})

    with pytest.raises(HTTPException) as exc:
        sprint_service.complete_sprint(db, member.id, project.id, s["id"])
    assert exc.value.status_code == 403


# ── list_reports: doar COMPLETED, cel mai recent primul, membership ───

def test_list_reports_only_completed_newest_first(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)

    s1 = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S1"})
    s2 = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S2"})
    # Sprint planificat (NU apare in rapoarte).
    sprint_service.create_sprint(db, owner.id, project.id, {"name": "S3"})

    sprint_service.complete_sprint(db, owner.id, project.id, s1["id"])
    sprint_service.complete_sprint(db, owner.id, project.id, s2["id"])
    # Forteaza closed_at ca s2 sa fie mai recent decat s1.
    from datetime import datetime, timedelta
    r1 = db.query(Sprint).filter(Sprint.id == s1["id"]).first()
    r2 = db.query(Sprint).filter(Sprint.id == s2["id"]).first()
    r1.closed_at = datetime(2026, 1, 1)
    r2.closed_at = datetime(2026, 2, 1)
    db.commit()

    reports = sprint_service.list_reports(db, owner.id, project.id)
    assert [r["name"] for r in reports] == ["S2", "S1"]
    assert all("report" in r and "closedAt" in r for r in reports)


def test_list_reports_requires_membership(db, make_user, make_project):
    owner = make_user()
    outsider = make_user()
    project = make_project(owner)

    with pytest.raises(HTTPException) as exc:
        sprint_service.list_reports(db, outsider.id, project.id)
    assert exc.value.status_code == 403
