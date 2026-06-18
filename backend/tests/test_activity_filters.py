"""Tests pentru parametrii noi de filtrare/sortare din
collaboration_service.list_project_activity (action / user_id_filter / sort).
"""
import pytest
from fastapi import HTTPException

from app.models.board_column import BoardColumn
from app.services import board_service, collaboration_service


def _columns(db, project_id):
    board_service.ensure_columns(db, project_id)
    return (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project_id)
        .order_by(BoardColumn.position)
        .all()
    )


def _setup_two_activities(db, make_user, make_project, add_member):
    """owner creeaza un task atribuit lui member (CREATED de owner); member il
    muta in IN_PROGRESS (MOVED de member). Returneaza (owner, member, project)."""
    owner = make_user(username="owner")
    member = make_user(username="dev")
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    cols = _columns(db, project.id)
    in_progress = next(c for c in cols if c.column_type == "IN_PROGRESS")

    task = board_service.create_task(db, owner.id, project.id, {
        "title": "t", "columnId": cols[0].id, "assigneeId": member.id,
    })
    board_service.move_task(db, member.id, project.id, task.id, in_progress.id, 0)
    return owner, member, project


def test_default_sort_is_recent_first(db, make_user, make_project, add_member):
    owner, member, project = _setup_two_activities(db, make_user, make_project, add_member)
    out = collaboration_service.list_project_activity(db, owner.id, project.id)
    assert out[0]["action"] == "MOVED"
    assert out[-1]["action"] == "CREATED"
    # Cheia interna de sortare nu se scurge in raspuns.
    assert all("_statusPos" not in it for it in out)


def test_sort_date_ascending(db, make_user, make_project, add_member):
    owner, member, project = _setup_two_activities(db, make_user, make_project, add_member)
    out = collaboration_service.list_project_activity(db, owner.id, project.id, sort="date")
    assert out[0]["action"] == "CREATED"
    assert out[-1]["action"] == "MOVED"


def test_filter_by_concrete_action(db, make_user, make_project, add_member):
    owner, member, project = _setup_two_activities(db, make_user, make_project, add_member)
    out = collaboration_service.list_project_activity(db, owner.id, project.id, action="CREATED")
    assert len(out) == 1
    assert out[0]["action"] == "CREATED"


def test_filter_by_action_group_status_change(db, make_user, make_project, add_member):
    owner, member, project = _setup_two_activities(db, make_user, make_project, add_member)
    out = collaboration_service.list_project_activity(
        db, owner.id, project.id, action="STATUS_CHANGE"
    )
    actions = {it["action"] for it in out}
    assert actions == {"MOVED"}


def test_filter_by_user(db, make_user, make_project, add_member):
    owner, member, project = _setup_two_activities(db, make_user, make_project, add_member)
    out = collaboration_service.list_project_activity(
        db, owner.id, project.id, user_id_filter=member.id
    )
    assert all(it["userId"] == member.id for it in out)
    assert {it["action"] for it in out} == {"MOVED"}


def test_invalid_sort_falls_back_to_recent(db, make_user, make_project, add_member):
    owner, member, project = _setup_two_activities(db, make_user, make_project, add_member)
    out = collaboration_service.list_project_activity(db, owner.id, project.id, sort="bogus")
    assert out[0]["action"] == "MOVED"


def test_enrich_fields_present(db, make_user, make_project, add_member):
    owner, member, project = _setup_two_activities(db, make_user, make_project, add_member)
    out = collaboration_service.list_project_activity(db, owner.id, project.id)
    created = next(it for it in out if it["action"] == "CREATED")
    assert created["taskTitle"] == "t"
    assert "taskPriority" in created
    assert "taskStatus" in created


def test_list_project_activity_requires_membership(db, make_user, make_project):
    owner = make_user()
    outsider = make_user()
    project = make_project(owner)
    with pytest.raises(HTTPException) as exc:
        collaboration_service.list_project_activity(db, outsider.id, project.id)
    assert exc.value.status_code == 403


def test_sort_person_and_priority_do_not_crash(db, make_user, make_project, add_member):
    owner, member, project = _setup_two_activities(db, make_user, make_project, add_member)
    by_person = collaboration_service.list_project_activity(db, owner.id, project.id, sort="person")
    by_priority = collaboration_service.list_project_activity(db, owner.id, project.id, sort="priority")
    by_status = collaboration_service.list_project_activity(db, owner.id, project.id, sort="status")
    assert len(by_person) == len(by_priority) == len(by_status) == 2
