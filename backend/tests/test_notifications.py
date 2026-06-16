"""Notificări in-app: serviciu + declanșatori (adăugat în proiect, task atribuit)."""
import pytest

from app.services import notification_service, membership_service, board_service
from app.models.notification import Notification
from app.models.board_column import BoardColumn


def _first_col(db, project_id):
    board_service.ensure_columns(db, project_id)
    return (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project_id)
        .order_by(BoardColumn.position)
        .first()
    )


# ── service ──────────────────────────────────────────────────────────────────

def test_create_and_unread_count(db, make_user):
    u = make_user(username="n1")
    notification_service.create(db, user_id=u.id, type="X", title="Salut")
    assert notification_service.unread_count(db, u.id) == 1
    items = notification_service.list_for_user(db, u.id)
    assert items[0].title == "Salut" and items[0].is_read is False


def test_mark_read_and_mark_all(db, make_user):
    u = make_user(username="n2")
    a = notification_service.create(db, user_id=u.id, type="X", title="a")
    notification_service.create(db, user_id=u.id, type="X", title="b")
    notification_service.mark_read(db, u.id, a.id)
    assert notification_service.unread_count(db, u.id) == 1
    assert notification_service.mark_all_read(db, u.id) == 1
    assert notification_service.unread_count(db, u.id) == 0


def test_mark_read_scoped_to_user(db, make_user):
    u1, u2 = make_user(username="n3"), make_user(username="n4")
    n = notification_service.create(db, user_id=u1.id, type="X", title="a")
    # u2 nu poate marca notificarea lui u1.
    assert notification_service.mark_read(db, u2.id, n.id) is None


# ── trigger: adăugat în proiect ───────────────────────────────────────────────

def test_add_member_creates_notification(db, make_user, make_project):
    owner = make_user(username="own")
    newbie = make_user(username="newbie")
    project = make_project(owner)  # creează owner membership (invited_by=owner == owner → fără notif)
    membership_service.add_member(db, project.id, newbie.id, role="MEMBER", invited_by=owner.id)

    notes = notification_service.list_for_user(db, newbie.id)
    assert len(notes) == 1
    assert notes[0].type == "PROJECT_ADDED"
    assert project.name in notes[0].title
    assert notes[0].link == f"/projects/{project.id}"


def test_self_add_no_notification(db, make_user, make_project):
    owner = make_user(username="own2")
    make_project(owner)  # owner se adaugă singur (invited_by == owner)
    assert notification_service.unread_count(db, owner.id) == 0


# ── trigger: task atribuit ────────────────────────────────────────────────────

def test_assign_task_notifies_new_assignee(db, make_user, make_project, add_member):
    owner = make_user(username="own3")
    worker = make_user(username="worker")
    project = make_project(owner)
    add_member(project, worker, role="MEMBER")
    col = _first_col(db, project.id)
    task = board_service.create_task(db, owner.id, project.id, {"title": "T", "columnId": col.id})

    board_service.assign_task(db, owner.id, project.id, task.id, worker.id)

    notes = notification_service.list_for_user(db, worker.id)
    assigned = [n for n in notes if n.type == "TASK_ASSIGNED"]
    assert len(assigned) == 1
    assert "T" in assigned[0].title


def test_assign_to_self_no_notification(db, make_user, make_project):
    owner = make_user(username="own4")
    project = make_project(owner)
    col = _first_col(db, project.id)
    task = board_service.create_task(db, owner.id, project.id, {"title": "T", "columnId": col.id})
    board_service.assign_task(db, owner.id, project.id, task.id, owner.id)
    # owner s-a auto-atribuit → fără notificare TASK_ASSIGNED
    notes = [n for n in notification_service.list_for_user(db, owner.id) if n.type == "TASK_ASSIGNED"]
    assert notes == []
