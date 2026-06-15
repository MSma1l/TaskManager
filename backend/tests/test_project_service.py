"""Tests for membership-based access in app.services.project_service."""
import pytest
from fastapi import HTTPException

from app.services import project_service as ps
from app.services import membership_service as ms


def test_create_project_adds_owner_membership(db, make_user):
    user = make_user()
    project = ps.create_project(db, user.id, {"name": "New"})
    assert project.id is not None
    member = ms.get_member(db, project.id, user.id)
    assert member is not None
    assert member.role == "OWNER"
    assert ms.count_owners(db, project.id) == 1


def test_create_project_defaults(db, make_user):
    user = make_user()
    project = ps.create_project(db, user.id, {"name": "X"})
    assert project.color == "#3b82f6"
    assert project.description is None


def test_get_all_projects_only_member_projects(db, make_user, make_project):
    alice = make_user()
    bob = make_user()
    p1 = make_project(alice, name="a1")
    make_project(bob, name="b1")  # alice not a member

    result = ps.get_all_projects(db, alice.id)
    assert [p.id for p in result] == [p1.id]


def test_get_all_projects_empty(db, make_user):
    user = make_user()
    assert ps.get_all_projects(db, user.id) == []


def test_get_all_projects_excludes_inactive(db, make_user, make_project):
    user = make_user()
    p1 = make_project(user, name="active")
    p2 = make_project(user, name="inactive")
    p2.is_active = False
    db.commit()
    ids = {p.id for p in ps.get_all_projects(db, user.id)}
    assert p1.id in ids
    assert p2.id not in ids


def test_get_project_member_can_access(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    bob = make_user()
    ms.add_member(db, project.id, bob.id, role="MEMBER")
    got = ps.get_project(db, bob.id, project.id)
    assert got is not None
    assert got.id == project.id


def test_get_project_non_member_gets_none(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    stranger = make_user()
    assert ps.get_project(db, stranger.id, project.id) is None


def test_get_project_missing_returns_none(db, make_user):
    user = make_user()
    assert ps.get_project(db, user.id, "nonexistent") is None


def test_update_project_denied_for_viewer(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    viewer = make_user()
    ms.add_member(db, project.id, viewer.id, role="VIEWER")
    with pytest.raises(HTTPException) as exc:
        ps.update_project(db, viewer.id, project.id, {"name": "x"})
    assert exc.value.status_code == 403


def test_update_project_denied_for_member(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    member = make_user()
    ms.add_member(db, project.id, member.id, role="MEMBER")
    with pytest.raises(HTTPException) as exc:
        ps.update_project(db, member.id, project.id, {"name": "x"})
    assert exc.value.status_code == 403


def test_update_project_allowed_for_admin(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    admin = make_user()
    ms.add_member(db, project.id, admin.id, role="ADMIN")
    updated = ps.update_project(db, admin.id, project.id, {"name": "Renamed"})
    assert updated is not None
    assert updated.name == "Renamed"


def test_update_project_allowed_for_owner(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    updated = ps.update_project(
        db, owner.id, project.id,
        {"description": "d", "githubUrl": "g", "color": "#000", "isActive": True},
    )
    assert updated.description == "d"
    assert updated.github_url == "g"
    assert updated.color == "#000"


def test_delete_project_allowed_only_for_owner(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    ok = ps.delete_project(db, owner.id, project.id)
    assert ok is True
    # soft delete
    refreshed = ps.get_project(db, owner.id, project.id)
    assert refreshed is None  # is_active False -> get_project filters it out


def test_delete_project_denied_for_admin(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    admin = make_user()
    ms.add_member(db, project.id, admin.id, role="ADMIN")
    with pytest.raises(HTTPException) as exc:
        ps.delete_project(db, admin.id, project.id)
    assert exc.value.status_code == 403


def test_get_project_with_tasks_returns_all_members_tasks(db, make_user, make_project, make_task):
    owner = make_user()
    project = make_project(owner)
    bob = make_user()
    ms.add_member(db, project.id, bob.id, role="MEMBER")

    # Tasks created by two different members; no user_id filter should apply.
    make_task(project, owner, title="owner-task")
    make_task(project, bob, title="bob-task")

    # bob (a member) sees both tasks.
    proj, tasks = ps.get_project_with_tasks(db, bob.id, project.id)
    assert proj is not None
    titles = {t.title for t in tasks}
    assert titles == {"owner-task", "bob-task"}


def test_get_project_with_tasks_non_member(db, make_user, make_project, make_task):
    owner = make_user()
    project = make_project(owner)
    make_task(project, owner)
    stranger = make_user()
    proj, tasks = ps.get_project_with_tasks(db, stranger.id, project.id)
    assert proj is None
    assert tasks == []


def test_get_project_task_count(db, make_user, make_project, make_task):
    owner = make_user()
    project = make_project(owner)
    bob = make_user()
    make_task(project, owner)
    make_task(project, bob)
    assert ps.get_project_task_count(db, owner.id, project.id) == 2
