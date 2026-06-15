"""Tests for app.services.sprint_service and app.api.sprints (Phase 3).

Uses the SQLite in-memory DB + helpers from conftest. Board tasks are created
through board_service so they carry board_column_id / task_number correctly.
"""
import pytest
from fastapi import HTTPException

from app.models.board_column import BoardColumn
from app.models.task import Task
from app.services import board_service, membership_service, sprint_service


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


def _mk_task(db, owner, project, col, title="t", assignee=None, points=None):
    task = board_service.create_task(db, owner.id, project.id, {
        "title": title,
        "columnId": col.id,
        "assigneeId": assignee.id if assignee else None,
        "storyPoints": points,
    })
    return task


# ── create_sprint permission ─────────────────────────────────────────

def test_create_sprint_admin_ok(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    out = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S1"})
    assert out["name"] == "S1"
    assert out["status"] == "PLANNED"
    assert out["taskCount"] == 0


def test_create_sprint_member_403(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")

    with pytest.raises(HTTPException) as exc:
        sprint_service.create_sprint(db, member.id, project.id, {"name": "S1"})
    assert exc.value.status_code == 403


def test_create_sprint_empty_name_400(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    with pytest.raises(HTTPException) as exc:
        sprint_service.create_sprint(db, owner.id, project.id, {"name": "   "})
    assert exc.value.status_code == 400


def test_create_sprint_parses_dates_and_invalid_400(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    out = sprint_service.create_sprint(db, owner.id, project.id, {
        "name": "S1", "goal": "g",
        "startDate": "2026-06-01T00:00:00Z", "endDate": "2026-06-14T00:00:00Z",
    })
    assert out["goal"] == "g"
    assert out["startDate"].startswith("2026-06-01")

    with pytest.raises(HTTPException) as exc:
        sprint_service.create_sprint(db, owner.id, project.id, {
            "name": "Bad", "startDate": "not-a-date",
        })
    assert exc.value.status_code == 400


# ── update / status ──────────────────────────────────────────────────

def test_update_sprint_fields_and_status(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    s = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S1"})

    out = sprint_service.update_sprint(db, owner.id, project.id, s["id"], {
        "name": "S1b", "goal": None, "startDate": "2026-06-01T00:00:00",
        "endDate": "2026-06-14T00:00:00", "status": "ACTIVE",
    })
    assert out["name"] == "S1b"
    assert out["status"] == "ACTIVE"


def test_update_sprint_invalid_status_400(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    s = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S1"})
    with pytest.raises(HTTPException) as exc:
        sprint_service.update_sprint(db, owner.id, project.id, s["id"], {"status": "WAT"})
    assert exc.value.status_code == 400


def test_get_sprint_404(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    with pytest.raises(HTTPException) as exc:
        sprint_service.update_sprint(db, owner.id, project.id, "nope", {"name": "x"})
    assert exc.value.status_code == 404


def test_start_sprint(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    s = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S1"})
    out = sprint_service.start_sprint(db, owner.id, project.id, s["id"])
    assert out["status"] == "ACTIVE"


# ── add_task_to_sprint: sets sprint_id + overCapacity warning ────────

def test_add_task_sets_sprint_id_no_warning_without_assignee(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    cols = _columns(db, project.id)
    s = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S1"})
    task = _mk_task(db, owner, project, cols[0], points=3)

    res = sprint_service.add_task_to_sprint(db, owner.id, project.id, s["id"], task.id)
    assert res["warning"] is None
    db.refresh(task)
    assert task.sprint_id == s["id"]
    assert res["task"]["sprintId"] == s["id"]


def test_add_task_overcapacity_warning(db, make_user, make_project, add_member):
    owner = make_user()
    assignee = make_user()
    project = make_project(owner)
    member = add_member(project, assignee, role="MEMBER")
    member.capacity_points = 5
    db.commit()

    cols = _columns(db, project.id)
    s = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S1"})
    # 8 points assigned, capacity 5 -> overCapacity True
    task = _mk_task(db, owner, project, cols[0], assignee=assignee, points=8)

    res = sprint_service.add_task_to_sprint(db, owner.id, project.id, s["id"], task.id)
    assert res["warning"]["overCapacity"] is True
    assert res["warning"]["assigneePoints"] == 8
    assert res["warning"]["capacityPoints"] == 5


def test_add_task_under_capacity_no_warning(db, make_user, make_project, add_member):
    owner = make_user()
    assignee = make_user()
    project = make_project(owner)
    member = add_member(project, assignee, role="MEMBER")
    member.capacity_points = 10
    db.commit()

    cols = _columns(db, project.id)
    s = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S1"})
    task = _mk_task(db, owner, project, cols[0], assignee=assignee, points=3)

    res = sprint_service.add_task_to_sprint(db, owner.id, project.id, s["id"], task.id)
    assert res["warning"]["overCapacity"] is False
    assert res["warning"]["assigneePoints"] == 3


def test_add_task_member_403(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    cols = _columns(db, project.id)
    s = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S1"})
    task = _mk_task(db, owner, project, cols[0], points=1)

    with pytest.raises(HTTPException) as exc:
        sprint_service.add_task_to_sprint(db, member.id, project.id, s["id"], task.id)
    assert exc.value.status_code == 403


def test_add_task_unknown_task_404(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    s = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S1"})
    with pytest.raises(HTTPException) as exc:
        sprint_service.add_task_to_sprint(db, owner.id, project.id, s["id"], "nope")
    assert exc.value.status_code == 404


def test_remove_task_from_sprint(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    cols = _columns(db, project.id)
    s = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S1"})
    task = _mk_task(db, owner, project, cols[0], points=2)
    sprint_service.add_task_to_sprint(db, owner.id, project.id, s["id"], task.id)

    res = sprint_service.remove_task_from_sprint(db, owner.id, project.id, s["id"], task.id)
    db.refresh(task)
    assert task.sprint_id is None
    assert res["task"]["sprintId"] is None


# ── complete_sprint: non-done tasks back to backlog ──────────────────

def test_complete_sprint_returns_unfinished_tasks(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    cols = _columns(db, project.id)
    done_col = _done_column(db, project.id)
    s = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S1"})

    finished = _mk_task(db, owner, project, cols[0], title="fin", points=2)
    unfinished = _mk_task(db, owner, project, cols[0], title="unf", points=3)
    sprint_service.add_task_to_sprint(db, owner.id, project.id, s["id"], finished.id)
    sprint_service.add_task_to_sprint(db, owner.id, project.id, s["id"], unfinished.id)

    # Move finished into DONE column.
    finished.board_column_id = done_col.id
    db.commit()

    out = sprint_service.complete_sprint(db, owner.id, project.id, s["id"])
    assert out["status"] == "COMPLETED"

    db.refresh(finished)
    db.refresh(unfinished)
    assert finished.sprint_id == s["id"]   # stays
    assert unfinished.sprint_id is None     # back to backlog


def test_complete_sprint_keeps_custom_is_done_column_tasks(db, make_user, make_project):
    """A CUSTOM-typed column flagged is_done_column counts as "done": its tasks
    stay in the sprint; a plain CUSTOM column's tasks go back to backlog."""
    owner = make_user()
    project = make_project(owner)
    open_col = board_service.create_column(db, owner.id, project.id, "Open", None)
    done_col = board_service.create_column(db, owner.id, project.id, "Gata", None)
    done_col.is_done_column = True  # CUSTOM type, marked as done
    db.commit()

    s = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S1"})
    finished = _mk_task(db, owner, project, done_col, title="fin", points=2)
    unfinished = _mk_task(db, owner, project, open_col, title="unf", points=3)
    sprint_service.add_task_to_sprint(db, owner.id, project.id, s["id"], finished.id)
    sprint_service.add_task_to_sprint(db, owner.id, project.id, s["id"], unfinished.id)

    sprint_service.complete_sprint(db, owner.id, project.id, s["id"])

    db.refresh(finished)
    db.refresh(unfinished)
    assert finished.sprint_id == s["id"]   # CUSTOM is_done_column -> stays
    assert unfinished.sprint_id is None     # plain CUSTOM -> back to backlog


# ── delete_sprint clears sprint_id ───────────────────────────────────

def test_delete_sprint_clears_task_sprint_id(db, make_user, make_project):
    from app.models.sprint import Sprint
    owner = make_user()
    project = make_project(owner)
    cols = _columns(db, project.id)
    s = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S1"})
    task = _mk_task(db, owner, project, cols[0], points=1)
    sprint_service.add_task_to_sprint(db, owner.id, project.id, s["id"], task.id)

    sprint_service.delete_sprint(db, owner.id, project.id, s["id"])

    db.refresh(task)
    assert task.sprint_id is None
    assert db.query(Sprint).filter(Sprint.id == s["id"]).first() is None


# ── list_backlog: only board tasks with sprint_id null ───────────────

def test_list_backlog_only_unassigned_board_tasks(db, make_user, make_project, make_task):
    owner = make_user()
    project = make_project(owner)
    cols = _columns(db, project.id)
    s = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S1"})

    in_backlog = _mk_task(db, owner, project, cols[0], title="bk", points=1)
    in_sprint = _mk_task(db, owner, project, cols[0], title="sp", points=1)
    sprint_service.add_task_to_sprint(db, owner.id, project.id, s["id"], in_sprint.id)

    # A weekly (non-board) task must be excluded.
    make_task(project, owner, title="weekly")

    backlog = sprint_service.list_backlog(db, owner.id, project.id)
    ids = {t["id"] for t in backlog}
    assert in_backlog.id in ids
    assert in_sprint.id not in ids
    assert len(backlog) == 1


def test_list_backlog_requires_membership(db, make_user, make_project):
    owner = make_user()
    outsider = make_user()
    project = make_project(owner)
    with pytest.raises(HTTPException) as exc:
        sprint_service.list_backlog(db, outsider.id, project.id)
    assert exc.value.status_code == 403


# ── list_sprints + sprint_to_dict perMember aggregation ──────────────

def test_sprint_to_dict_per_member_aggregation(db, make_user, make_project, add_member):
    owner = make_user(username="owner")
    alice = make_user(username="alice")
    project = make_project(owner)
    m_owner = membership_service.get_member(db, project.id, owner.id)
    m_owner.capacity_points = 4
    m_alice = add_member(project, alice, role="MEMBER")
    m_alice.capacity_points = 10
    db.commit()

    cols = _columns(db, project.id)
    s = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S1"})

    # owner: 5 points (over capacity 4); alice: 3 points (under 10).
    t1 = _mk_task(db, owner, project, cols[0], assignee=owner, points=5)
    t2 = _mk_task(db, owner, project, cols[0], assignee=alice, points=3)
    sprint_service.add_task_to_sprint(db, owner.id, project.id, s["id"], t1.id)
    sprint_service.add_task_to_sprint(db, owner.id, project.id, s["id"], t2.id)

    sprints = sprint_service.list_sprints(db, owner.id, project.id)
    assert len(sprints) == 1
    sd = sprints[0]
    assert sd["totalPoints"] == 8
    assert sd["taskCount"] == 2

    by_user = {pm["username"]: pm for pm in sd["perMember"]}
    assert by_user["owner"]["points"] == 5
    assert by_user["owner"]["capacityPoints"] == 4
    assert by_user["owner"]["overCapacity"] is True
    assert by_user["alice"]["points"] == 3
    assert by_user["alice"]["overCapacity"] is False
