"""Board tasks must not leak into the weekly / personal task views.

A task that lives on a board (board_column_id set) is excluded from the
weekly list, the day list and the personal "get all" list; a normal weekly
task (board_column_id NULL) still shows up.
"""
from app.services import board_service, task_service
from app.models.board_column import BoardColumn


def _first_column(db, project_id):
    return (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project_id)
        .order_by(BoardColumn.position)
        .first()
    )


def test_board_task_excluded_from_weekly_views(db, make_user, make_project, make_category):
    owner = make_user()
    project = make_project(owner)
    board_service.ensure_columns(db, project.id)
    col = _first_column(db, project.id)

    # A board task (no day/category, lives on a column).
    board_task = board_service.create_task(
        db, owner.id, project.id, {"title": "board only", "columnId": col.id}
    )

    # A normal recurring weekly task owned by the same user.
    weekly = task_service.create_task(
        db, owner.id,
        {
            "title": "weekly",
            "categoryId": make_category().id,
            "dayOfWeek": 1,
            "isRecurring": True,
        },
    )

    all_tasks = task_service.get_all_tasks(db, owner.id)
    all_ids = {t.id for t in all_tasks}
    assert weekly.id in all_ids
    assert board_task.id not in all_ids

    week_tasks = task_service.get_tasks_for_week(db, owner.id)
    week_ids = {t.id for t in week_tasks}
    assert weekly.id in week_ids
    assert board_task.id not in week_ids

    day_tasks = task_service.get_tasks_for_day(db, owner.id, 1)
    day_ids = {t.id for t in day_tasks}
    assert weekly.id in day_ids
    assert board_task.id not in day_ids


def test_project_detail_excludes_board_tasks(db, make_user, make_project, make_category):
    owner = make_user()
    project = make_project(owner)
    board_service.ensure_columns(db, project.id)
    col = _first_column(db, project.id)

    board_task = board_service.create_task(
        db, owner.id, project.id, {"title": "board", "columnId": col.id}
    )
    # A non-board task attached to the project.
    plain = task_service.create_task(
        db, owner.id,
        {
            "title": "plain",
            "categoryId": make_category().id,
            "dayOfWeek": 2,
            "projectId": project.id,
        },
    )

    from app.services import project_service
    _, tasks = project_service.get_project_with_tasks(db, owner.id, project.id)
    ids = {t.id for t in tasks}
    assert plain.id in ids
    assert board_task.id not in ids


def test_board_task_appears_in_board_view(db, make_user, make_project):
    """Sanity: the excluded task IS visible on its board."""
    owner = make_user()
    project = make_project(owner)
    board_service.ensure_columns(db, project.id)
    col = _first_column(db, project.id)
    board_task = board_service.create_task(
        db, owner.id, project.id, {"title": "b", "columnId": col.id}
    )
    board = board_service.get_board(db, owner.id, project.id)
    all_board_ids = {t.id for tasks in board["tasks_by_column"].values() for t in tasks}
    assert board_task.id in all_board_ids
