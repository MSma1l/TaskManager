"""Unit tests for subtasks (checklist) on board tasks.

Runs against the SQLite in-memory DB from conftest. Exercises add/toggle/
remove/reorder of subtasks plus role authorization (MEMBER required, VIEWER
rejected) and the 404 paths for unknown task / subtask.
"""
import pytest
from fastapi import HTTPException

from app.models.board_column import BoardColumn
from app.services import board_service


def _first_column(db, project_id):
    return (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project_id)
        .order_by(BoardColumn.position)
        .first()
    )


def _new_task(db, owner, project, title="t"):
    board_service.ensure_columns(db, project.id)
    col = _first_column(db, project.id)
    return board_service.create_task(db, owner.id, project.id, {"title": title, "columnId": col.id})


# ── add ─────────────────────────────────────────────────────────────

def test_add_subtask_appends_and_defaults_not_done(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    task = _new_task(db, owner, project)

    board_service.add_subtask(db, owner.id, project.id, task.id, "step 1")
    updated = board_service.add_subtask(db, owner.id, project.id, task.id, "step 2")

    assert [s["title"] for s in updated.subtasks] == ["step 1", "step 2"]
    assert all(s["done"] is False for s in updated.subtasks)
    assert all(s["id"] for s in updated.subtasks)


def test_add_subtask_blank_title_400(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    task = _new_task(db, owner, project)

    with pytest.raises(HTTPException) as exc:
        board_service.add_subtask(db, owner.id, project.id, task.id, "   ")
    assert exc.value.status_code == 400


# ── toggle / update ─────────────────────────────────────────────────

def test_toggle_subtask_done(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    task = _new_task(db, owner, project)
    task = board_service.add_subtask(db, owner.id, project.id, task.id, "do it")
    sid = task.subtasks[0]["id"]

    updated = board_service.update_subtask(db, owner.id, project.id, task.id, sid, done=True)
    assert updated.subtasks[0]["done"] is True

    updated = board_service.update_subtask(db, owner.id, project.id, task.id, sid, done=False)
    assert updated.subtasks[0]["done"] is False


def test_update_subtask_title(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    task = _new_task(db, owner, project)
    task = board_service.add_subtask(db, owner.id, project.id, task.id, "old")
    sid = task.subtasks[0]["id"]

    updated = board_service.update_subtask(db, owner.id, project.id, task.id, sid, title="new")
    assert updated.subtasks[0]["title"] == "new"


def test_update_unknown_subtask_404(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    task = _new_task(db, owner, project)

    with pytest.raises(HTTPException) as exc:
        board_service.update_subtask(db, owner.id, project.id, task.id, "nope", done=True)
    assert exc.value.status_code == 404


# ── remove ──────────────────────────────────────────────────────────

def test_remove_subtask(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    task = _new_task(db, owner, project)
    task = board_service.add_subtask(db, owner.id, project.id, task.id, "a")
    task = board_service.add_subtask(db, owner.id, project.id, task.id, "b")
    sid = task.subtasks[0]["id"]

    updated = board_service.remove_subtask(db, owner.id, project.id, task.id, sid)
    assert [s["title"] for s in updated.subtasks] == ["b"]


def test_remove_unknown_subtask_404(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    task = _new_task(db, owner, project)

    with pytest.raises(HTTPException) as exc:
        board_service.remove_subtask(db, owner.id, project.id, task.id, "nope")
    assert exc.value.status_code == 404


# ── reorder ─────────────────────────────────────────────────────────

def test_reorder_subtasks(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    task = _new_task(db, owner, project)
    for title in ("a", "b", "c"):
        task = board_service.add_subtask(db, owner.id, project.id, task.id, title)
    ids = [s["id"] for s in task.subtasks]

    # reverse order
    updated = board_service.reorder_subtasks(
        db, owner.id, project.id, task.id, [ids[2], ids[1], ids[0]]
    )
    assert [s["title"] for s in updated.subtasks] == ["c", "b", "a"]


def test_reorder_with_missing_ids_keeps_remaining(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    task = _new_task(db, owner, project)
    for title in ("a", "b", "c"):
        task = board_service.add_subtask(db, owner.id, project.id, task.id, title)
    ids = [s["id"] for s in task.subtasks]

    # only pass one id — the rest must be appended, none lost
    updated = board_service.reorder_subtasks(db, owner.id, project.id, task.id, [ids[1]])
    titles = [s["title"] for s in updated.subtasks]
    assert titles[0] == "b"
    assert set(titles) == {"a", "b", "c"}


# ── authorization ───────────────────────────────────────────────────

def test_add_subtask_requires_member(db, make_user, make_project, add_member):
    owner = make_user()
    viewer = make_user()
    project = make_project(owner)
    add_member(project, viewer, role="VIEWER")
    task = _new_task(db, owner, project)

    with pytest.raises(HTTPException) as exc:
        board_service.add_subtask(db, viewer.id, project.id, task.id, "x")
    assert exc.value.status_code == 403


def test_member_can_manage_subtasks(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    task = _new_task(db, owner, project)

    updated = board_service.add_subtask(db, member.id, project.id, task.id, "ok")
    assert updated.subtasks[0]["title"] == "ok"


def test_add_subtask_unknown_task_404(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    board_service.ensure_columns(db, project.id)

    with pytest.raises(HTTPException) as exc:
        board_service.add_subtask(db, owner.id, project.id, "nope", "x")
    assert exc.value.status_code == 404
