"""Tests pentru completion_service.mark_started ("luat in lucru"): seteaza
PENDING + note, curata completed_at / starile terminale.
"""
from app.models.base import TaskStatus
from app.services import completion_service


def test_mark_started_sets_pending_and_note(db, make_user, make_project, make_task):
    owner = make_user()
    project = make_project(owner)
    task = make_task(project, owner)

    comp = completion_service.mark_started(db, task.id, note="lucrez la asta")
    assert comp is not None
    assert comp.status == TaskStatus.PENDING
    assert comp.note == "lucrez la asta"
    assert comp.completed_at is None


def test_mark_started_clears_done_state(db, make_user, make_project, make_task):
    owner = make_user()
    project = make_project(owner)
    task = make_task(project, owner)

    completion_service.mark_done(db, task.id, note="gata")
    comp = completion_service.mark_started(db, task.id, note="reluat")
    assert comp.status == TaskStatus.PENDING
    assert comp.completed_at is None
    assert comp.moved_to_date is None
    assert comp.skip_reason is None
    assert comp.note == "reluat"


def test_mark_started_empty_note_becomes_none(db, make_user, make_project, make_task):
    owner = make_user()
    project = make_project(owner)
    task = make_task(project, owner)

    comp = completion_service.mark_started(db, task.id, note="   ")
    assert comp.status == TaskStatus.PENDING
    assert comp.note is None


def test_mark_started_unknown_task_returns_none(db):
    assert completion_service.mark_started(db, "nope", note="x") is None
