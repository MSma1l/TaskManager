"""Tests pentru Feature A: nu poti finaliza un task (mutare in VERIFY sau intr-o
coloana "terminat") fara story points > 0. Vezi board_service.move_task /
_require_story_points.
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


def _done_column(db, project_id):
    return next(c for c in _columns(db, project_id) if c.column_type == "DONE")


def test_move_into_done_without_points_400(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    cols = _columns(db, project.id)
    done = _done_column(db, project.id)
    task = board_service.create_task(db, owner.id, project.id, {"title": "t", "columnId": cols[0].id})

    with pytest.raises(HTTPException) as exc:
        board_service.move_task(db, owner.id, project.id, task.id, done.id, 0)
    assert exc.value.status_code == 400


def test_move_into_done_with_points_ok(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    cols = _columns(db, project.id)
    done = _done_column(db, project.id)
    task = board_service.create_task(
        db, owner.id, project.id, {"title": "t", "columnId": cols[0].id, "storyPoints": 3}
    )

    board_service.move_task(db, owner.id, project.id, task.id, done.id, 0)
    refreshed = db.query(Task).filter(Task.id == task.id).first()
    assert refreshed.board_column_id == done.id


def test_move_into_verify_column_without_points_400(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    cols = _columns(db, project.id)
    verify = board_service.create_column(db, owner.id, project.id, "Verificare", None, "VERIFY")
    task = board_service.create_task(db, owner.id, project.id, {"title": "t", "columnId": cols[0].id})

    with pytest.raises(HTTPException) as exc:
        board_service.move_task(db, owner.id, project.id, task.id, verify.id, 0)
    assert exc.value.status_code == 400


def test_move_into_non_done_column_without_points_ok(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    cols = _columns(db, project.id)
    task = board_service.create_task(db, owner.id, project.id, {"title": "t", "columnId": cols[0].id})

    # Mutare in IN_PROGRESS (nu e "terminat") -> nu cere story points.
    in_progress = next(c for c in cols if c.column_type == "IN_PROGRESS")
    board_service.move_task(db, owner.id, project.id, task.id, in_progress.id, 0)
    refreshed = db.query(Task).filter(Task.id == task.id).first()
    assert refreshed.board_column_id == in_progress.id
