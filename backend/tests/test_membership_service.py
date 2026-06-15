"""Unit tests for app.services.membership_service."""
import pytest
from fastapi import HTTPException

from app.services import membership_service as ms


def test_role_rank_ordering():
    assert ms.ROLE_RANK["VIEWER"] < ms.ROLE_RANK["MEMBER"]
    assert ms.ROLE_RANK["MEMBER"] < ms.ROLE_RANK["ADMIN"]
    assert ms.ROLE_RANK["ADMIN"] < ms.ROLE_RANK["OWNER"]
    assert ms.ROLE_RANK == {"VIEWER": 0, "MEMBER": 1, "ADMIN": 2, "OWNER": 3}


def test_get_member_none(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    stranger = make_user()
    assert ms.get_member(db, project.id, stranger.id) is None


def test_get_member_found(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    found = ms.get_member(db, project.id, owner.id)
    assert found is not None
    assert found.role == "OWNER"
    assert found.user_id == owner.id


def test_add_member(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    bob = make_user()
    m = ms.add_member(db, project.id, bob.id, role="MEMBER", invited_by=owner.id)
    assert m.id is not None
    assert m.role == "MEMBER"
    assert m.invited_by == owner.id
    assert ms.get_member(db, project.id, bob.id) is not None


def test_add_member_default_role(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    bob = make_user()
    m = ms.add_member(db, project.id, bob.id)
    assert m.role == "MEMBER"
    assert m.invited_by is None


def test_get_accessible_project_ids(db, make_user, make_project):
    alice = make_user()
    bob = make_user()
    p1 = make_project(alice, name="p1")
    p2 = make_project(alice, name="p2")
    p3 = make_project(bob, name="p3")  # bob's, alice not a member

    alice_ids = ms.get_accessible_project_ids(db, alice.id)
    assert set(alice_ids) == {p1.id, p2.id}
    assert p3.id not in alice_ids

    # Add alice as MEMBER of p3 -> now accessible.
    ms.add_member(db, p3.id, alice.id, role="MEMBER")
    assert p3.id in ms.get_accessible_project_ids(db, alice.id)


def test_get_accessible_project_ids_empty(db, make_user):
    user = make_user()
    assert ms.get_accessible_project_ids(db, user.id) == []


def test_list_members(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    b = make_user()
    c = make_user()
    ms.add_member(db, project.id, b.id, role="MEMBER")
    ms.add_member(db, project.id, c.id, role="VIEWER")
    members = ms.list_members(db, project.id)
    assert len(members) == 3
    assert {m.user_id for m in members} == {owner.id, b.id, c.id}


def test_count_owners(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    assert ms.count_owners(db, project.id) == 1
    second = make_user()
    ms.add_member(db, project.id, second.id, role="OWNER")
    assert ms.count_owners(db, project.id) == 2
    member = make_user()
    ms.add_member(db, project.id, member.id, role="MEMBER")
    assert ms.count_owners(db, project.id) == 2  # MEMBER does not count


# ── require_membership ───────────────────────────────────────────────────────

def test_require_membership_not_a_member_raises_403(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    stranger = make_user()
    with pytest.raises(HTTPException) as exc:
        ms.require_membership(db, project.id, stranger.id, min_role="VIEWER")
    assert exc.value.status_code == 403


def test_require_membership_passes_at_min_role(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    bob = make_user()
    ms.add_member(db, project.id, bob.id, role="MEMBER")
    m = ms.require_membership(db, project.id, bob.id, min_role="MEMBER")
    assert m.role == "MEMBER"


def test_require_membership_passes_above_min_role(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    # OWNER >= ADMIN
    m = ms.require_membership(db, project.id, owner.id, min_role="ADMIN")
    assert m.role == "OWNER"


def test_require_membership_below_min_role_raises_403(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    viewer = make_user()
    ms.add_member(db, project.id, viewer.id, role="VIEWER")
    with pytest.raises(HTTPException) as exc:
        ms.require_membership(db, project.id, viewer.id, min_role="ADMIN")
    assert exc.value.status_code == 403


def test_require_membership_default_min_role_is_viewer(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    viewer = make_user()
    ms.add_member(db, project.id, viewer.id, role="VIEWER")
    m = ms.require_membership(db, project.id, viewer.id)  # default VIEWER
    assert m.role == "VIEWER"
