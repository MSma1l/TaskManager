"""Tests pentru campul `status` al proiectului (project_service):
- update_project seteaza status doar pentru ADMIN+, ignora valori invalide;
- get_all_projects filtreaza dupa status.
"""
import pytest
from fastapi import HTTPException

from app.services import project_service as ps


def test_update_project_sets_valid_status(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)

    out = ps.update_project(db, owner.id, project.id, {"status": "ON_HOLD"})
    assert out.status == "ON_HOLD"

    out2 = ps.update_project(db, owner.id, project.id, {"status": "ARCHIVED"})
    assert out2.status == "ARCHIVED"


def test_update_project_invalid_status_ignored(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    # Status default e ACTIVE; o valoare invalida e ignorata (nu schimba).
    out = ps.update_project(db, owner.id, project.id, {"status": "BOGUS"})
    assert out.status == "ACTIVE"


def test_update_project_status_denied_for_member(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")

    with pytest.raises(HTTPException) as exc:
        ps.update_project(db, member.id, project.id, {"status": "ARCHIVED"})
    assert exc.value.status_code == 403


def test_get_all_projects_filters_by_status(db, make_user, make_project):
    owner = make_user()
    active = make_project(owner, name="Active", key="ACT")
    archived = make_project(owner, name="Archived", key="ARC")
    ps.update_project(db, owner.id, archived.id, {"status": "ARCHIVED"})

    only_archived = ps.get_all_projects(db, owner.id, statuses=["ARCHIVED"])
    assert {p.id for p in only_archived} == {archived.id}

    only_active = ps.get_all_projects(db, owner.id, statuses=["ACTIVE"])
    assert {p.id for p in only_active} == {active.id}


def test_get_all_projects_no_status_returns_all(db, make_user, make_project):
    owner = make_user()
    p1 = make_project(owner, name="A", key="AA")
    p2 = make_project(owner, name="B", key="BB")
    ps.update_project(db, owner.id, p2.id, {"status": "ARCHIVED"})

    all_projects = ps.get_all_projects(db, owner.id)
    assert {p.id for p in all_projects} == {p1.id, p2.id}
