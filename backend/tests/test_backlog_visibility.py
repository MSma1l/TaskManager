"""Spec §2.2 — vizibilitatea backlog-ului pentru TOȚI participanții.

"Toți participanții proiectului pot vedea task-urile din backlog în view-ul Board."

Backlog-ul (taskuri fără sprint, sprint_id NULL) e spațiu comun de planificare:
orice membru al proiectului — OWNER / ADMIN / MEMBER / VIEWER — vede toate
task-urile din backlog, atât prin sprint_service.list_backlog cât și prin
board_service.get_board (inclusiv scope-ul "backlog"). Un outsider (fără
membership) primește 403.

Spre deosebire de backlog, taskurile dintr-un sprint rămân filtrate pe rol
pentru un MEMBER simplu (vede doar ce-i e atribuit) — vezi
test_role_permissions.test_member_sees_only_own_tasks.
"""
import pytest
from fastapi import HTTPException

from app.models.board_column import BoardColumn
from app.services import board_service, sprint_service


def _backlog_col(db, project_id):
    board_service.ensure_columns(db, project_id)
    return (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project_id)
        .order_by(BoardColumn.position)
        .first()
    )


def _board_task_ids(board) -> set[str]:
    ids: set[str] = set()
    for tasks in board["tasks_by_column"].values():
        for t in tasks:
            ids.add(t.id)
    return ids


def _setup(db, make_user, make_project, add_member):
    """Owner + un backlog task neatribuit + un MEMBER și un VIEWER străini de task."""
    owner = make_user(username="bv_owner")
    member = make_user(username="bv_member")
    viewer = make_user(username="bv_viewer")
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    add_member(project, viewer, role="VIEWER")

    col = _backlog_col(db, project.id)
    # Task de backlog (fără sprint) creat de owner, NEatribuit niciunui membru.
    task = board_service.create_task(
        db, owner.id, project.id, {"title": "backlog-shared", "columnId": col.id}
    )
    assert task.sprint_id is None  # confirmă că e în backlog
    return owner, member, viewer, project, task


# ── list_backlog: vizibil tuturor rolurilor ─────────────────────────────────

def test_list_backlog_visible_to_member_and_viewer(db, make_user, make_project, add_member):
    owner, member, viewer, project, task = _setup(db, make_user, make_project, add_member)

    for actor in (owner, member, viewer):
        backlog = sprint_service.list_backlog(db, actor.id, project.id)
        ids = {t["id"] for t in backlog}
        assert task.id in ids, f"{actor.username} ar trebui să vadă taskul din backlog"


def test_list_backlog_forbidden_for_outsider(db, make_user, make_project, add_member):
    _, _, _, project, _ = _setup(db, make_user, make_project, add_member)
    outsider = make_user(username="bv_outsider")

    with pytest.raises(HTTPException) as exc:
        sprint_service.list_backlog(db, outsider.id, project.id)
    assert exc.value.status_code == 403


# ── get_board: backlog vizibil tuturor rolurilor (inclusiv MEMBER) ──────────

def test_get_board_backlog_visible_to_member_and_viewer(db, make_user, make_project, add_member):
    owner, member, viewer, project, task = _setup(db, make_user, make_project, add_member)

    # Atât în view-ul implicit ("toate") cât și în scope-ul explicit "backlog",
    # MEMBER-ul (deși taskul nu-i e atribuit) și VIEWER-ul îl văd.
    for actor in (owner, member, viewer):
        full = board_service.get_board(db, actor.id, project.id)
        assert task.id in _board_task_ids(full), (
            f"{actor.username} ar trebui să vadă backlog-ul în board-ul complet"
        )

        scoped = board_service.get_board(db, actor.id, project.id, sprint_id="backlog")
        assert task.id in _board_task_ids(scoped), (
            f"{actor.username} ar trebui să vadă backlog-ul în scope-ul 'backlog'"
        )


def test_get_board_forbidden_for_outsider(db, make_user, make_project, add_member):
    _, _, _, project, _ = _setup(db, make_user, make_project, add_member)
    outsider = make_user(username="bv_outsider2")

    with pytest.raises(HTTPException) as exc:
        board_service.get_board(db, outsider.id, project.id)
    assert exc.value.status_code == 403
