"""Notificare in-app (clopotel) la @mention intr-un comentariu.

Pe langa Telegram (testat in test_collaboration.py), un user mentionat trebuie
sa primeasca si o notificare in-app de tip MENTION. Telegram dispatch e
monkeypatch-uit ca sa nu atinga asyncio / retea.
"""
import pytest

from app.models.board_column import BoardColumn
from app.services import board_service, collaboration_service, notification_service


@pytest.fixture(autouse=True)
def _capture_telegram(monkeypatch):
    """Captureaza _dispatch_telegram ca sa nu se atinga asyncio/retea."""
    calls = []
    monkeypatch.setattr(
        collaboration_service,
        "_dispatch_telegram",
        lambda text, chat_id, role: calls.append((text, chat_id, role)),
    )
    return calls


def _board_task(db, owner, project, title="t"):
    board_service.ensure_columns(db, project.id)
    col = (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project.id)
        .order_by(BoardColumn.position)
        .first()
    )
    return board_service.create_task(db, owner.id, project.id, {"title": title, "columnId": col.id})


def test_mention_creates_in_app_notification(db, make_user, make_project, add_member):
    owner = make_user(username="owner", full_name="Owner Name")
    bob = make_user(username="bob")
    project = make_project(owner)
    add_member(project, bob, role="MEMBER")
    task = _board_task(db, owner, project, title="Reparatie bug")

    collaboration_service.add_comment(db, owner.id, task.id, "ai timp pentru asta @bob?")

    notes = notification_service.list_for_user(db, bob.id)
    mention_notes = [n for n in notes if n.type == "MENTION"]
    assert len(mention_notes) == 1

    n = mention_notes[0]
    assert n.user_id == bob.id
    assert "te-a mentionat" in n.title          # text RO
    assert n.link == f"/projects/{project.id}/board"
    assert n.meta["taskId"] == task.id
    assert n.meta["actorId"] == owner.id
    assert "commentId" in n.meta


def test_author_not_notified_for_self(db, make_user, make_project, add_member):
    owner = make_user(username="owner")
    bob = make_user(username="bob")
    project = make_project(owner)
    add_member(project, bob, role="MEMBER")
    task = _board_task(db, owner, project)

    # Autorul se mentioneaza pe sine -> nicio notificare in-app pentru el.
    collaboration_service.add_comment(db, owner.id, task.id, "doar eu @owner")

    owner_mentions = [n for n in notification_service.list_for_user(db, owner.id) if n.type == "MENTION"]
    assert owner_mentions == []


def test_no_mention_no_notification(db, make_user, make_project, add_member):
    owner = make_user(username="owner")
    bob = make_user(username="bob")
    project = make_project(owner)
    add_member(project, bob, role="MEMBER")
    task = _board_task(db, owner, project)

    collaboration_service.add_comment(db, owner.id, task.id, "comentariu fara mentiune")

    assert [n for n in notification_service.list_for_user(db, bob.id) if n.type == "MENTION"] == []
