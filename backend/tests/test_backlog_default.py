"""Tests for the BACKLOG-default flow.

Orice task creat prin task_service.create_task cu un projectId intra automat in
backlog: primeste o coloana de board (BACKLOG), un task_number si ramane fara
sprint (sprint_id NULL), deci apare in sprint_service.list_backlog.
"""
from app.models.task import Task
from app.services import sprint_service, task_service


def _create_project_task(db, make_category, owner, project, title="t"):
    cat = make_category()
    return task_service.create_task(db, owner.id, {
        "title": title,
        "description": None,
        "categoryId": cat.id,
        "dayOfWeek": None,
        "projectId": project.id,
    })


def test_create_task_with_project_lands_in_backlog(db, make_user, make_project, make_category):
    owner = make_user()
    project = make_project(owner)

    task = _create_project_task(db, make_category, owner, project, title="alpha")

    # Coloana de board atribuita + ramane in backlog (fara sprint).
    assert task.board_column_id is not None
    assert task.sprint_id is None
    assert task.task_number is not None
    assert task.board_order is not None

    # Apare in backlog-ul proiectului.
    backlog = sprint_service.list_backlog(db, owner.id, project.id)
    ids = {t["id"] for t in backlog}
    assert task.id in ids


def test_create_task_increments_task_counter(db, make_user, make_project, make_category):
    owner = make_user()
    project = make_project(owner)

    t1 = _create_project_task(db, make_category, owner, project, title="a")
    t2 = _create_project_task(db, make_category, owner, project, title="b")

    assert t1.task_number == 1
    assert t2.task_number == 2


def test_create_task_without_project_is_plain_weekly(db, make_user, make_category):
    owner = make_user()
    cat = make_category()

    task = task_service.create_task(db, owner.id, {
        "title": "weekly",
        "description": None,
        "categoryId": cat.id,
        "dayOfWeek": 1,
    })

    # Fara proiect -> task saptamanal clasic, fara coloana de board.
    assert task.board_column_id is None
    assert task.task_number is None


def test_create_task_respects_explicit_board_column(db, make_user, make_project, make_category):
    """Daca apelantul trimite deja board_column_id, nu il suprascriem cu backlog."""
    from app.services import board_service
    owner = make_user()
    project = make_project(owner)
    board_service.ensure_columns(db, project.id)
    from app.models.board_column import BoardColumn
    in_progress = (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project.id, BoardColumn.column_type == "IN_PROGRESS")
        .first()
    )
    cat = make_category()

    task = task_service.create_task(db, owner.id, {
        "title": "explicit",
        "categoryId": cat.id,
        "dayOfWeek": None,
        "projectId": project.id,
        "board_column_id": in_progress.id,
    })

    assert task.board_column_id == in_progress.id
