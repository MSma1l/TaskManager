"""Permisiuni pe roluri (admin vs member vs viewer):
  - doar ADMIN/OWNER schimbă responsabilul,
  - MEMBER vede doar taskurile lui; ADMIN/VIEWER văd toate,
  - MEMBER mută doar taskurile lui și nu poate muta în coloana APPROVED.
"""
import pytest
from fastapi import HTTPException

from app.services import board_service, sprint_service
from app.models.board_column import BoardColumn


def _cols(db, project_id):
    board_service.ensure_columns(db, project_id)
    return (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project_id)
        .order_by(BoardColumn.position)
        .all()
    )


def _approved_col(db, project_id):
    return (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project_id, BoardColumn.column_type == "APPROVED")
        .first()
    )


def _visible_count(board):
    return sum(len(v) for v in board["tasks_by_column"].values())


# ── assignee: doar ADMIN/OWNER ────────────────────────────────────────────────

def test_member_cannot_change_assignee(db, make_user, make_project, add_member):
    owner = make_user(username="o1")
    member = make_user(username="m1")
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    col = _cols(db, project.id)[0]
    task = board_service.create_task(db, owner.id, project.id, {"title": "t", "columnId": col.id})
    with pytest.raises(HTTPException) as e:
        board_service.assign_task(db, member.id, project.id, task.id, member.id)
    assert e.value.status_code == 403


def test_admin_member_can_change_assignee(db, make_user, make_project, add_member):
    owner = make_user(username="o2")
    admin = make_user(username="a2")
    worker = make_user(username="w2")
    project = make_project(owner)
    add_member(project, admin, role="ADMIN")
    add_member(project, worker, role="MEMBER")
    col = _cols(db, project.id)[0]
    task = board_service.create_task(db, owner.id, project.id, {"title": "t", "columnId": col.id})
    out = board_service.assign_task(db, admin.id, project.id, task.id, worker.id)
    assert out.assignee_id == worker.id


# ── vizibilitate ──────────────────────────────────────────────────────────────

def test_member_sees_only_own_tasks(db, make_user, make_project, add_member):
    owner = make_user(username="o3")
    m1 = make_user(username="m3a")
    m2 = make_user(username="m3b")
    project = make_project(owner)
    add_member(project, m1, role="MEMBER")
    add_member(project, m2, role="MEMBER")
    col = _cols(db, project.id)[0]
    t1 = board_service.create_task(db, owner.id, project.id, {"title": "for-m1", "columnId": col.id})
    t2 = board_service.create_task(db, owner.id, project.id, {"title": "for-m2", "columnId": col.id})

    # Mută taskurile dintr-un backlog comun (vizibil tuturor) într-un sprint, unde
    # se aplică vizibilitatea pe rol: un MEMBER vede DOAR taskul atribuit lui.
    sprint = sprint_service.create_sprint(db, owner.id, project.id, {"name": "S1"})
    sprint_service.add_task_to_sprint(db, owner.id, project.id, sprint["id"], t1.id)
    sprint_service.add_task_to_sprint(db, owner.id, project.id, sprint["id"], t2.id)
    board_service.assign_task(db, owner.id, project.id, t1.id, m1.id)

    board_m1 = board_service.get_board(db, m1.id, project.id)
    assert _visible_count(board_m1) == 1  # doar taskul lui m1 (sprint, non-backlog)


def test_admin_and_viewer_see_all_tasks(db, make_user, make_project, add_member):
    owner = make_user(username="o4")
    viewer = make_user(username="v4")
    project = make_project(owner)
    add_member(project, viewer, role="VIEWER")
    col = _cols(db, project.id)[0]
    board_service.create_task(db, owner.id, project.id, {"title": "a", "columnId": col.id})
    board_service.create_task(db, owner.id, project.id, {"title": "b", "columnId": col.id})

    assert _visible_count(board_service.get_board(db, owner.id, project.id)) == 2   # owner: tot
    assert _visible_count(board_service.get_board(db, viewer.id, project.id)) == 2  # viewer: tot (read-only)


# ── move_task ─────────────────────────────────────────────────────────────────

def test_member_cannot_move_others_task(db, make_user, make_project, add_member):
    owner = make_user(username="o5")
    member = make_user(username="m5")
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    cols = _cols(db, project.id)
    task = board_service.create_task(db, owner.id, project.id, {"title": "t", "columnId": cols[0].id})
    # taskul nu e al lui member → nu-l poate muta
    with pytest.raises(HTTPException) as e:
        board_service.move_task(db, member.id, project.id, task.id, cols[1].id, 0)
    assert e.value.status_code == 403


def test_member_cannot_move_to_approved(db, make_user, make_project, add_member):
    owner = make_user(username="o6")
    member = make_user(username="m6")
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    cols = _cols(db, project.id)
    approved = _approved_col(db, project.id)
    task = board_service.create_task(db, owner.id, project.id, {"title": "t", "columnId": cols[0].id})
    board_service.assign_task(db, owner.id, project.id, task.id, member.id)
    if approved is None:
        pytest.skip("proiectul nu are coloana APPROVED")
    with pytest.raises(HTTPException) as e:
        board_service.move_task(db, member.id, project.id, task.id, approved.id, 0)
    assert e.value.status_code == 403


def test_admin_can_move_to_approved(db, make_user, make_project, add_member):
    owner = make_user(username="o7")
    project = make_project(owner)
    cols = _cols(db, project.id)
    approved = _approved_col(db, project.id)
    if approved is None:
        pytest.skip("proiectul nu are coloana APPROVED")
    task = board_service.create_task(db, owner.id, project.id, {"title": "t", "columnId": cols[0].id})
    # ownerul (lead) poate muta in APPROVED
    board_service.move_task(db, owner.id, project.id, task.id, approved.id, 0)
    db.refresh(task)
    assert task.board_column_id == approved.id
