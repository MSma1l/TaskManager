"""Tests for board_service.transition_task (Phase 2.5 workflow).

Covers the plan/start/done/approve actions, the role gates (only team
lead approves; assignee or lead can plan/start/done), invalid actions and
the fallback when a target column_type is missing.
"""
import pytest
from fastapi import HTTPException

from app.models.board_column import BoardColumn
from app.services import board_service


def _columns(db, project_id):
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


def _setup(db, owner, make_project, assignee=None):
    project = make_project(owner, key="WF")
    board_service.ensure_columns(db, project.id)
    backlog = _col_by_type(db, project.id, "BACKLOG")
    data = {"title": "task", "columnId": backlog.id}
    if assignee is not None:
        data["assigneeId"] = assignee.id
    task = board_service.create_task(db, owner.id, project.id, data)
    return project, task


# ── happy path for each action ──────────────────────────────────────

def test_plan_sets_estimate_day_scheduled_and_moves_to_planned(db, make_user, make_project):
    owner = make_user()
    project, task = _setup(db, owner, make_project)

    result = board_service.transition_task(
        db, owner.id, project.id, task.id, "plan",
        estimate_minutes=120, day_of_week=3,
        scheduled_date="2026-07-02T09:00:00", reminder_time="08:30",
    )

    planned = _col_by_type(db, project.id, "PLANNED")
    assert result.board_column_id == planned.id
    assert result.estimated_minutes == 120
    assert result.day_of_week == 3
    assert result.scheduled_date is not None
    assert result.reminder_time == "08:30"


def test_start_moves_to_in_progress(db, make_user, make_project):
    owner = make_user()
    project, task = _setup(db, owner, make_project)
    result = board_service.transition_task(db, owner.id, project.id, task.id, "start")
    assert result.board_column_id == _col_by_type(db, project.id, "IN_PROGRESS").id


def test_done_moves_to_done(db, make_user, make_project):
    owner = make_user()
    project, task = _setup(db, owner, make_project)
    result = board_service.transition_task(db, owner.id, project.id, task.id, "done")
    assert result.board_column_id == _col_by_type(db, project.id, "DONE").id


def test_approve_by_owner_moves_to_approved(db, make_user, make_project):
    owner = make_user()  # OWNER >= ADMIN
    project, task = _setup(db, owner, make_project)
    result = board_service.transition_task(db, owner.id, project.id, task.id, "approve")
    assert result.board_column_id == _col_by_type(db, project.id, "APPROVED").id


def test_approve_by_admin_ok(db, make_user, make_project, add_member):
    owner = make_user()
    admin = make_user()
    project, task = _setup(db, owner, make_project)
    add_member(project, admin, role="ADMIN")
    result = board_service.transition_task(db, admin.id, project.id, task.id, "approve")
    assert result.board_column_id == _col_by_type(db, project.id, "APPROVED").id


# ── permission gates ────────────────────────────────────────────────

def test_approve_by_member_forbidden(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project, task = _setup(db, owner, make_project)
    add_member(project, member, role="MEMBER")

    with pytest.raises(HTTPException) as exc:
        board_service.transition_task(db, member.id, project.id, task.id, "approve")
    assert exc.value.status_code == 403
    assert "team lead" in exc.value.detail


def test_approve_by_viewer_forbidden(db, make_user, make_project, add_member):
    owner = make_user()
    viewer = make_user()
    project, task = _setup(db, owner, make_project)
    add_member(project, viewer, role="VIEWER")

    with pytest.raises(HTTPException) as exc:
        board_service.transition_task(db, viewer.id, project.id, task.id, "approve")
    assert exc.value.status_code == 403


def test_viewer_cannot_transition_even_if_assignee(db, make_user, make_project, add_member):
    owner = make_user()
    viewer = make_user()
    member = make_user()
    project = make_project(owner, key="WF")
    add_member(project, viewer, role="VIEWER")
    add_member(project, member, role="MEMBER")
    board_service.ensure_columns(db, project.id)
    backlog = _col_by_type(db, project.id, "BACKLOG")
    # Create the task assigned to a MEMBER (cannot assign to a VIEWER), then
    # force the assignee to the viewer to simulate "somehow assigned".
    task = board_service.create_task(
        db, owner.id, project.id,
        {"title": "mine", "columnId": backlog.id, "assigneeId": member.id},
    )
    task.assignee_id = viewer.id
    db.commit()

    # A VIEWER must stay read-only: no transition even on their "own" task.
    with pytest.raises(HTTPException) as exc:
        board_service.transition_task(db, viewer.id, project.id, task.id, "start")
    assert exc.value.status_code == 403


def test_member_assignee_can_plan_start_done_own_task(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner, key="WF")
    add_member(project, member, role="MEMBER")
    board_service.ensure_columns(db, project.id)
    backlog = _col_by_type(db, project.id, "BACKLOG")
    task = board_service.create_task(
        db, owner.id, project.id,
        {"title": "mine", "columnId": backlog.id, "assigneeId": member.id},
    )

    # MEMBER assignee may plan -> start -> done their own task.
    board_service.transition_task(db, member.id, project.id, task.id, "plan")
    board_service.transition_task(db, member.id, project.id, task.id, "start")
    result = board_service.transition_task(db, member.id, project.id, task.id, "done")
    assert result.board_column_id == _col_by_type(db, project.id, "DONE").id


def test_non_assignee_member_cannot_transition_others_task(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project, task = _setup(db, owner, make_project)  # unassigned
    add_member(project, member, role="MEMBER")

    with pytest.raises(HTTPException) as exc:
        board_service.transition_task(db, member.id, project.id, task.id, "start")
    assert exc.value.status_code == 403


def test_non_member_transition_forbidden(db, make_user, make_project):
    owner = make_user()
    outsider = make_user()
    project, task = _setup(db, owner, make_project)

    with pytest.raises(HTTPException) as exc:
        board_service.transition_task(db, outsider.id, project.id, task.id, "start")
    assert exc.value.status_code == 403


def test_invalid_action_400(db, make_user, make_project):
    owner = make_user()
    project, task = _setup(db, owner, make_project)
    with pytest.raises(HTTPException) as exc:
        board_service.transition_task(db, owner.id, project.id, task.id, "bogus")
    assert exc.value.status_code == 400


# ── fallback when target column_type absent ─────────────────────────

def test_fallback_to_next_column_when_target_type_missing(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner, key="WF")
    # Custom board with NO typed columns: positions 0,1,2.
    c0 = board_service.create_column(db, owner.id, project.id, "First", None)
    c1 = board_service.create_column(db, owner.id, project.id, "Second", None)
    board_service.create_column(db, owner.id, project.id, "Third", None)

    task = board_service.create_task(db, owner.id, project.id, {"title": "t", "columnId": c0.id})

    # No PLANNED column exists -> fallback to next column after current.
    result = board_service.transition_task(db, owner.id, project.id, task.id, "start")
    assert result.board_column_id == c1.id


def test_no_target_and_no_next_column_400(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner, key="WF")
    # Single column at the last position, no typed target.
    only = board_service.create_column(db, owner.id, project.id, "Only", None)
    task = board_service.create_task(db, owner.id, project.id, {"title": "t", "columnId": only.id})

    with pytest.raises(HTTPException) as exc:
        board_service.transition_task(db, owner.id, project.id, task.id, "start")
    assert exc.value.status_code == 400


def test_done_routes_to_is_done_column_when_no_done_type(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner, key="WF")
    # Custom board: no DONE column_type, but a CUSTOM column flagged is_done_column.
    c0 = board_service.create_column(db, owner.id, project.id, "Todo", None)
    board_service.create_column(db, owner.id, project.id, "Doing", None)
    done = board_service.create_column(db, owner.id, project.id, "Gata", None)
    done.is_done_column = True
    done.column_type = "CUSTOM"
    db.commit()

    task = board_service.create_task(db, owner.id, project.id, {"title": "t", "columnId": c0.id})

    # "done" prefers the is_done_column over the positional next column.
    result = board_service.transition_task(db, owner.id, project.id, task.id, "done")
    assert result.board_column_id == done.id


# ── assignment: VIEWER cannot be assigned ───────────────────────────

def test_assign_to_viewer_400(db, make_user, make_project, add_member):
    owner = make_user()
    viewer = make_user()
    project, task = _setup(db, owner, make_project)
    add_member(project, viewer, role="VIEWER")

    with pytest.raises(HTTPException) as exc:
        board_service.assign_task(db, owner.id, project.id, task.id, viewer.id)
    assert exc.value.status_code == 400
    assert "VIEWER" in exc.value.detail


def test_assign_to_member_ok_and_unassign_ok(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project, task = _setup(db, owner, make_project)
    add_member(project, member, role="MEMBER")

    res = board_service.assign_task(db, owner.id, project.id, task.id, member.id)
    assert res.assignee_id == member.id

    # Unassign (null) stays allowed.
    res2 = board_service.assign_task(db, owner.id, project.id, task.id, None)
    assert res2.assignee_id is None


def test_create_task_assignee_viewer_400(db, make_user, make_project, add_member):
    owner = make_user()
    viewer = make_user()
    project = make_project(owner, key="WF")
    add_member(project, viewer, role="VIEWER")
    board_service.ensure_columns(db, project.id)
    backlog = _col_by_type(db, project.id, "BACKLOG")

    with pytest.raises(HTTPException) as exc:
        board_service.create_task(
            db, owner.id, project.id,
            {"title": "t", "columnId": backlog.id, "assigneeId": viewer.id},
        )
    assert exc.value.status_code == 400
    assert "VIEWER" in exc.value.detail
