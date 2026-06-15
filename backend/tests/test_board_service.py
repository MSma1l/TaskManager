"""Unit tests for app.services.board_service (Phase 2 Kanban board).

Runs against the SQLite in-memory DB from conftest. Exercises column seeding,
task creation/numbering, reorder/move, delete-column reflow, assignee
validation and label CRUD.
"""
import pytest
from fastapi import HTTPException

from app.models.board_column import BoardColumn
from app.models.task import Task
from app.services import board_service


# ── ensure_columns ──────────────────────────────────────────────────

def test_ensure_columns_seeds_five_typed_columns(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)

    board_service.ensure_columns(db, project.id)

    cols = (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project.id)
        .order_by(BoardColumn.position)
        .all()
    )
    assert len(cols) == 5
    assert [c.column_type for c in cols] == [
        "BACKLOG", "PLANNED", "IN_PROGRESS", "DONE", "APPROVED",
    ]
    # "Finalizate" (DONE) is the done column.
    done = next(c for c in cols if c.column_type == "DONE")
    assert done.is_done_column is True


def test_ensure_columns_is_idempotent(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)

    board_service.ensure_columns(db, project.id)
    board_service.ensure_columns(db, project.id)  # second call must not double

    count = (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project.id)
        .count()
    )
    assert count == 5


# ── get_board ───────────────────────────────────────────────────────

def test_get_board_lazy_seeds_and_returns_key(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner, key="ABC")

    board = board_service.get_board(db, owner.id, project.id)

    assert len(board["columns"]) == 5
    assert board["project_key"] == "ABC"
    assert board["tasks_by_column"] == {}


def test_get_board_requires_membership(db, make_user, make_project):
    owner = make_user()
    outsider = make_user()
    project = make_project(owner)

    with pytest.raises(HTTPException) as exc:
        board_service.get_board(db, outsider.id, project.id)
    assert exc.value.status_code == 403


# ── create_task: sequential numbering + counter bump ────────────────

def _first_column(db, project_id):
    return (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project_id)
        .order_by(BoardColumn.position)
        .first()
    )


def test_create_task_assigns_sequential_numbers_and_bumps_counter(
    db, make_user, make_project
):
    owner = make_user()
    project = make_project(owner, key="KEY")
    board_service.ensure_columns(db, project.id)
    col = _first_column(db, project.id)

    t1 = board_service.create_task(db, owner.id, project.id, {"title": "a", "columnId": col.id})
    t2 = board_service.create_task(db, owner.id, project.id, {"title": "b", "columnId": col.id})
    t3 = board_service.create_task(db, owner.id, project.id, {"title": "c", "columnId": col.id})

    assert [t1.task_number, t2.task_number, t3.task_number] == [1, 2, 3]
    assert [t1.board_order, t2.board_order, t3.board_order] == [0, 1, 2]

    db.refresh(project)
    assert project.task_counter == 3


def test_create_task_requires_member_role(db, make_user, make_project, add_member):
    owner = make_user()
    viewer = make_user()
    project = make_project(owner)
    add_member(project, viewer, role="VIEWER")
    board_service.ensure_columns(db, project.id)
    col = _first_column(db, project.id)

    with pytest.raises(HTTPException) as exc:
        board_service.create_task(db, viewer.id, project.id, {"title": "x", "columnId": col.id})
    assert exc.value.status_code == 403


def test_create_task_rejects_non_member_assignee(db, make_user, make_project):
    owner = make_user()
    stranger = make_user()
    project = make_project(owner)
    board_service.ensure_columns(db, project.id)
    col = _first_column(db, project.id)

    with pytest.raises(HTTPException) as exc:
        board_service.create_task(
            db, owner.id, project.id,
            {"title": "x", "columnId": col.id, "assigneeId": stranger.id},
        )
    assert exc.value.status_code == 400


# ── move_task: contiguous reorder within / across columns ───────────

def _make_three(db, owner, project):
    board_service.ensure_columns(db, project.id)
    col = _first_column(db, project.id)
    tasks = [
        board_service.create_task(db, owner.id, project.id, {"title": t, "columnId": col.id})
        for t in ("a", "b", "c")
    ]
    return col, tasks


def test_move_task_reorders_within_column(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    col, (a, b, c) = _make_three(db, owner, project)

    # Move "a" (index 0) to index 2 -> order should become b, c, a.
    board_service.move_task(db, owner.id, project.id, a.id, col.id, 2)

    ordered = (
        db.query(Task)
        .filter(Task.board_column_id == col.id, Task.is_active == True)
        .order_by(Task.board_order)
        .all()
    )
    assert [t.title for t in ordered] == ["b", "c", "a"]
    assert [t.board_order for t in ordered] == [0, 1, 2]


def test_move_task_across_columns_reindexes_both(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    col0, (a, b, c) = _make_three(db, owner, project)
    cols = (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project.id)
        .order_by(BoardColumn.position)
        .all()
    )
    col1 = cols[1]

    # Move "b" (middle of col0) to col1 index 0.
    board_service.move_task(db, owner.id, project.id, b.id, col1.id, 0)

    src = (
        db.query(Task)
        .filter(Task.board_column_id == col0.id, Task.is_active == True)
        .order_by(Task.board_order).all()
    )
    dst = (
        db.query(Task)
        .filter(Task.board_column_id == col1.id, Task.is_active == True)
        .order_by(Task.board_order).all()
    )
    assert [t.title for t in src] == ["a", "c"]
    assert [t.board_order for t in src] == [0, 1]  # contiguous after removal
    assert [t.title for t in dst] == ["b"]
    assert dst[0].board_order == 0


def test_move_task_clamps_out_of_range_index(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    col, (a, b, c) = _make_three(db, owner, project)

    # to_index way past the end -> append at the tail, still contiguous.
    board_service.move_task(db, owner.id, project.id, a.id, col.id, 99)
    ordered = (
        db.query(Task)
        .filter(Task.board_column_id == col.id, Task.is_active == True)
        .order_by(Task.board_order).all()
    )
    assert [t.title for t in ordered] == ["b", "c", "a"]
    assert [t.board_order for t in ordered] == [0, 1, 2]


# ── delete_task reflows source column ───────────────────────────────

def test_delete_task_reindexes_column(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    col, (a, b, c) = _make_three(db, owner, project)

    board_service.delete_task(db, owner.id, project.id, b.id)

    ordered = (
        db.query(Task)
        .filter(Task.board_column_id == col.id, Task.is_active == True)
        .order_by(Task.board_order).all()
    )
    assert [t.title for t in ordered] == ["a", "c"]
    assert [t.board_order for t in ordered] == [0, 1]


# ── columns CRUD ────────────────────────────────────────────────────

def test_create_column_requires_admin(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")

    with pytest.raises(HTTPException) as exc:
        board_service.create_column(db, member.id, project.id, "Extra", None)
    assert exc.value.status_code == 403


def test_create_and_update_column(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    board_service.ensure_columns(db, project.id)

    col = board_service.create_column(db, owner.id, project.id, "Extra", "#abc", "CUSTOM")
    assert col.position == 5  # appended after the 5 defaults
    assert col.column_type == "CUSTOM"

    updated = board_service.update_column(
        db, owner.id, project.id, col.id,
        {"name": "Renamed", "color": None, "isDoneColumn": True, "columnType": "DONE"},
    )
    assert updated.name == "Renamed"
    assert updated.color is None
    assert updated.is_done_column is True
    assert updated.column_type == "DONE"


def test_delete_column_moves_tasks_to_first_remaining(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    board_service.ensure_columns(db, project.id)
    cols = (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project.id)
        .order_by(BoardColumn.position).all()
    )
    # Put a task in column index 1, and one in column 0 so target is non-empty.
    t_in_0 = board_service.create_task(db, owner.id, project.id, {"title": "keep", "columnId": cols[0].id})
    t_moved = board_service.create_task(db, owner.id, project.id, {"title": "move", "columnId": cols[1].id})

    board_service.delete_column(db, owner.id, project.id, cols[1].id)

    db.refresh(t_moved)
    # Moved to the first remaining column (cols[0]) appended after existing.
    assert t_moved.board_column_id == cols[0].id
    assert t_moved.board_order == 1  # after t_in_0 (order 0)
    # Column is gone.
    assert db.query(BoardColumn).filter(BoardColumn.id == cols[1].id).first() is None


def test_delete_last_column_blocked(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    # Single manual column, no defaults.
    only = board_service.create_column(db, owner.id, project.id, "Solo", None)

    with pytest.raises(HTTPException) as exc:
        board_service.delete_column(db, owner.id, project.id, only.id)
    assert exc.value.status_code == 400


# ── assign_task membership validation ───────────────────────────────

def test_assign_task_to_member_ok_and_clear(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    col, (a, _b, _c) = _make_three(db, owner, project)

    board_service.assign_task(db, owner.id, project.id, a.id, member.id)
    db.refresh(a)
    assert a.assignee_id == member.id

    board_service.assign_task(db, owner.id, project.id, a.id, None)
    db.refresh(a)
    assert a.assignee_id is None


def test_assign_task_to_non_member_rejected(db, make_user, make_project):
    owner = make_user()
    stranger = make_user()
    project = make_project(owner)
    col, (a, _b, _c) = _make_three(db, owner, project)

    with pytest.raises(HTTPException) as exc:
        board_service.assign_task(db, owner.id, project.id, a.id, stranger.id)
    assert exc.value.status_code == 400


# ── update_task ─────────────────────────────────────────────────────

def test_update_task_fields_and_due_date(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    col, (a, _b, _c) = _make_three(db, owner, project)

    updated = board_service.update_task(
        db, owner.id, project.id, a.id,
        {"title": "new", "priority": "HIGH", "dueDate": "2026-07-01T10:00:00",
         "estimateMinutes": 90, "description": "desc"},
    )
    assert updated.title == "new"
    assert updated.priority == "HIGH"
    assert updated.estimated_minutes == 90
    assert updated.due_date is not None


def test_update_task_invalid_due_date_400(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    col, (a, _b, _c) = _make_three(db, owner, project)

    with pytest.raises(HTTPException) as exc:
        board_service.update_task(db, owner.id, project.id, a.id, {"dueDate": "not-a-date"})
    assert exc.value.status_code == 400


def test_get_board_task_404_for_non_board_task(db, make_user, make_project, make_task):
    owner = make_user()
    project = make_project(owner)
    weekly = make_task(project, owner)  # no board_column_id

    with pytest.raises(HTTPException) as exc:
        board_service.update_task(db, owner.id, project.id, weekly.id, {"title": "x"})
    assert exc.value.status_code == 404


# ── labels CRUD ─────────────────────────────────────────────────────

def test_label_crud_and_task_association(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    board_service.ensure_columns(db, project.id)
    col = _first_column(db, project.id)

    label = board_service.create_label(db, owner.id, project.id, "bug", "#f00")
    assert label.name == "bug"

    listed = board_service.list_labels(db, owner.id, project.id)
    assert [l.id for l in listed] == [label.id]

    # Create a task carrying the label, then delete the label and confirm
    # the association is removed without orphaning the task.
    task = board_service.create_task(
        db, owner.id, project.id,
        {"title": "t", "columnId": col.id, "labelIds": [label.id]},
    )
    assert [l.id for l in task.labels] == [label.id]

    board_service.delete_label(db, owner.id, project.id, label.id)
    assert board_service.list_labels(db, owner.id, project.id) == []
    refreshed = board_service.update_task(db, owner.id, project.id, task.id, {})
    assert refreshed.labels == []


def test_create_label_requires_admin(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")

    with pytest.raises(HTTPException) as exc:
        board_service.create_label(db, member.id, project.id, "x", "#000")
    assert exc.value.status_code == 403


def test_create_task_with_unknown_label_404(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    board_service.ensure_columns(db, project.id)
    col = _first_column(db, project.id)

    with pytest.raises(HTTPException) as exc:
        board_service.create_task(
            db, owner.id, project.id,
            {"title": "t", "columnId": col.id, "labelIds": ["nope"]},
        )
    assert exc.value.status_code == 404
