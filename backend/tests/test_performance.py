"""Tests for app.services.performance_service (Phase 3 performance dashboard)."""
import pytest
from fastapi import HTTPException

from app.models.board_column import BoardColumn
from app.services import board_service, membership_service, performance_service, sprint_service


def _columns(db, project_id):
    board_service.ensure_columns(db, project_id)
    return (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project_id)
        .order_by(BoardColumn.position)
        .all()
    )


def _by_type(cols, t):
    return next(c for c in cols if c.column_type == t)


def _mk(db, owner, project, col, assignee=None, points=None, title="t"):
    return board_service.create_task(db, owner.id, project.id, {
        "title": title, "columnId": col.id,
        "assigneeId": assignee.id if assignee else None,
        "storyPoints": points,
    })


def test_requires_membership(db, make_user, make_project):
    owner = make_user()
    outsider = make_user()
    project = make_project(owner)
    with pytest.raises(HTTPException) as exc:
        performance_service.project_performance(db, outsider.id, project.id)
    assert exc.value.status_code == 403


def test_completed_points_only_done_and_approved(db, make_user, make_project, add_member):
    owner = make_user(username="owner")
    project = make_project(owner)
    cols = _columns(db, project.id)
    backlog = _by_type(cols, "BACKLOG")
    in_prog = _by_type(cols, "IN_PROGRESS")
    done = _by_type(cols, "DONE")
    approved = _by_type(cols, "APPROVED")

    # owner assigned: 2 (backlog) + 3 (in progress) + 4 (done) + 5 (approved) = 14 assigned
    # completed = done + approved = 9
    _mk(db, owner, project, backlog, assignee=owner, points=2)
    _mk(db, owner, project, in_prog, assignee=owner, points=3)
    _mk(db, owner, project, done, assignee=owner, points=4)
    _mk(db, owner, project, approved, assignee=owner, points=5)

    out = performance_service.project_performance(db, owner.id, project.id)
    pm = {m["userId"]: m for m in out["perMember"]}[owner.id]
    assert pm["assignedPoints"] == 14
    assert pm["completedPoints"] == 9
    assert pm["completedTasks"] == 2
    # completionRate = 9/14
    assert pm["completionRate"] == round(9 / 14, 4)
    assert out["totals"]["totalCompletedPoints"] == 9


def test_completion_rate_zero_when_no_assigned(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    _columns(db, project.id)
    out = performance_service.project_performance(db, owner.id, project.id)
    pm = {m["userId"]: m for m in out["perMember"]}[owner.id]
    assert pm["assignedPoints"] == 0
    assert pm["completionRate"] == 0
    assert pm["completedPoints"] == 0


def test_per_sprint_committed_vs_completed(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    cols = _columns(db, project.id)
    backlog = _by_type(cols, "BACKLOG")
    done = _by_type(cols, "DONE")

    s = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S1"})

    t_done = _mk(db, owner, project, done, assignee=owner, points=5, title="d")
    t_open = _mk(db, owner, project, backlog, assignee=owner, points=3, title="o")
    sprint_service.add_task_to_sprint(db, owner.id, project.id, s["id"], t_done.id)
    sprint_service.add_task_to_sprint(db, owner.id, project.id, s["id"], t_open.id)

    out = performance_service.project_performance(db, owner.id, project.id)
    sp = {x["sprintId"]: x for x in out["sprints"]}[s["id"]]
    assert sp["committedPoints"] == 8   # 5 + 3
    assert sp["completedPoints"] == 5   # only the DONE one
    assert sp["name"] == "S1"
    assert out["totals"]["totalCommittedPoints"] == 8


def test_done_detection_custom_column_with_is_done_flag(db, make_user, make_project):
    """A CUSTOM-typed column flagged is_done_column counts as completed; a
    normal CUSTOM column (flag False) does not."""
    owner = make_user()
    project = make_project(owner)
    # Custom board without DONE/APPROVED column_type.
    open_col = board_service.create_column(db, owner.id, project.id, "Open", None)
    done_col = board_service.create_column(db, owner.id, project.id, "Gata", None)
    done_col.is_done_column = True  # CUSTOM type but marked as done
    db.commit()

    # 3 points in a CUSTOM is_done_column -> completed; 2 points in plain CUSTOM -> not.
    _mk(db, owner, project, done_col, assignee=owner, points=3, title="done")
    _mk(db, owner, project, open_col, assignee=owner, points=2, title="open")

    out = performance_service.project_performance(db, owner.id, project.id)
    pm = {m["userId"]: m for m in out["perMember"]}[owner.id]
    assert pm["assignedPoints"] == 5
    assert pm["completedPoints"] == 3
    assert pm["completedTasks"] == 1
    assert out["totals"]["totalCompletedPoints"] == 3


def test_tasks_without_points_count_as_zero(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    cols = _columns(db, project.id)
    done = _by_type(cols, "DONE")
    _mk(db, owner, project, done, assignee=owner, points=None)

    out = performance_service.project_performance(db, owner.id, project.id)
    pm = {m["userId"]: m for m in out["perMember"]}[owner.id]
    assert pm["completedPoints"] == 0
    assert pm["completedTasks"] == 1  # counted as a completed task, 0 points
