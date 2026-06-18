"""Tests pentru ciclul de aprobare din board_service:
report_done / approve_task / return_task / reject_task / list_pending_verification.

Stilul si helperele (_columns / _col_by_type) urmeaza test_board_transition.py.
"""
import pytest
from fastapi import HTTPException

from app.models.board_column import BoardColumn
from app.models.task import Task
from app.services import board_service


def _columns(db, project_id):
    board_service.ensure_columns(db, project_id)
    return (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project_id)
        .order_by(BoardColumn.position)
        .all()
    )


def _col_by_type(db, project_id, ctype):
    return (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project_id, BoardColumn.column_type == ctype)
        .first()
    )


def _mk_task(db, owner, project, col, title="t", assignee=None, points=None):
    return board_service.create_task(db, owner.id, project.id, {
        "title": title,
        "columnId": col.id,
        "assigneeId": assignee.id if assignee else None,
        "storyPoints": points,
    })


# ── report_done ──────────────────────────────────────────────────────

def test_report_done_sets_pending_review_and_moves(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    cols = _columns(db, project.id)
    task = _mk_task(db, owner, project, cols[0], assignee=owner, points=3)

    out = board_service.report_done(db, owner.id, project.id, task.id)
    assert out.approval_status == "PENDING_REVIEW"
    # Fara coloana VERIFY -> fallback la DONE.
    assert out.board_column_id == _col_by_type(db, project.id, "DONE").id


def test_report_done_requires_story_points_400(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    cols = _columns(db, project.id)
    task = _mk_task(db, owner, project, cols[0], assignee=owner)  # fara puncte

    with pytest.raises(HTTPException) as exc:
        board_service.report_done(db, owner.id, project.id, task.id)
    assert exc.value.status_code == 400


def test_report_done_non_assignee_member_403(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    cols = _columns(db, project.id)
    task = _mk_task(db, owner, project, cols[0], points=3)  # neatribuit lui member

    with pytest.raises(HTTPException) as exc:
        board_service.report_done(db, member.id, project.id, task.id)
    assert exc.value.status_code == 403


def test_report_done_assignee_member_ok(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    cols = _columns(db, project.id)
    task = _mk_task(db, owner, project, cols[0], assignee=member, points=2)

    out = board_service.report_done(db, member.id, project.id, task.id)
    assert out.approval_status == "PENDING_REVIEW"


# ── approve_task (ADMIN+) ────────────────────────────────────────────

def test_approve_task_moves_to_approved(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    cols = _columns(db, project.id)
    task = _mk_task(db, owner, project, cols[0], assignee=owner, points=3)
    board_service.report_done(db, owner.id, project.id, task.id)

    out = board_service.approve_task(db, owner.id, task.id)
    assert out.approval_status == "APPROVED"
    assert out.board_column_id == _col_by_type(db, project.id, "APPROVED").id


def test_approve_task_member_403(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    cols = _columns(db, project.id)
    task = _mk_task(db, owner, project, cols[0], assignee=owner, points=3)

    with pytest.raises(HTTPException) as exc:
        board_service.approve_task(db, member.id, task.id)
    assert exc.value.status_code == 403


# ── return_task (ADMIN+) ─────────────────────────────────────────────

def test_return_task_moves_to_in_progress(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    cols = _columns(db, project.id)
    task = _mk_task(db, owner, project, cols[0], assignee=member, points=3)
    board_service.report_done(db, member.id, project.id, task.id)

    out = board_service.return_task(db, owner.id, task.id, reason="mai lucreaza")
    assert out.approval_status == "NEEDS_FIX"
    assert out.board_column_id == _col_by_type(db, project.id, "IN_PROGRESS").id


def test_return_task_member_403(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    cols = _columns(db, project.id)
    task = _mk_task(db, owner, project, cols[0], assignee=member, points=3)

    with pytest.raises(HTTPException) as exc:
        board_service.return_task(db, member.id, task.id)
    assert exc.value.status_code == 403


# ── reject_task (ADMIN+) ─────────────────────────────────────────────

def test_reject_task_soft_deletes(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    cols = _columns(db, project.id)
    task = _mk_task(db, owner, project, cols[0], assignee=owner, points=3)

    res = board_service.reject_task(db, owner.id, task.id, reason="duplicat")
    assert res == {"id": task.id, "rejected": True}

    refreshed = db.query(Task).filter(Task.id == task.id).first()
    assert refreshed.is_active is False
    assert refreshed.approval_status == "REJECTED"


def test_reject_task_member_403(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    cols = _columns(db, project.id)
    task = _mk_task(db, owner, project, cols[0], assignee=owner, points=3)

    with pytest.raises(HTTPException) as exc:
        board_service.reject_task(db, member.id, task.id)
    assert exc.value.status_code == 403


# ── list_pending_verification ────────────────────────────────────────

def test_list_pending_verification_for_lead(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    cols = _columns(db, project.id)
    task = _mk_task(db, owner, project, cols[0], assignee=owner, points=3)
    board_service.report_done(db, owner.id, project.id, task.id)

    out = board_service.list_pending_verification(db, owner.id)
    assert len(out) == 1
    assert out[0]["id"] == task.id
    assert out[0]["projectId"] == project.id
    assert out[0]["project"]["id"] == project.id


def test_list_pending_verification_empty_for_non_lead(db, make_user):
    stranger = make_user()  # nu e ADMIN/OWNER nicaieri
    assert board_service.list_pending_verification(db, stranger.id) == []
