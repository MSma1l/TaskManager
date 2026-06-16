"""Tests pentru participanti reali la evenimente de calendar.

Inregistram explicit modelele atinse pentru ca fixtura `engine` din conftest sa
le creeze pe Base.metadata (la fel ca test_friends.py).
"""
import app.models.calendar  # noqa: F401
import app.models.calendar_attendee  # noqa: F401
import app.models.notification  # noqa: F401

from datetime import date, datetime, timedelta

from app.models.calendar import CalendarEvent
from app.models.notification import Notification
from app.services import calendar_service


def _make_event(db, owner, day: date | None = None) -> CalendarEvent:
    day = day or date.today()
    ev = CalendarEvent(
        user_id=owner.id,
        title="Sedinta echipa",
        event_date=day,
        start_time="10:00",
        end_time="11:00",
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


def test_adding_participant_creates_notification(db, make_user):
    owner = make_user(username="owner")
    guest = make_user(username="guest")
    ev = _make_event(db, owner)

    calendar_service.set_event_attendees(db, ev, [guest.id])

    atts = calendar_service.list_event_attendees(db, ev.id)
    assert len(atts) == 1
    assert atts[0].user_id == guest.id
    assert atts[0].status == "INVITED"

    notifs = db.query(Notification).filter(
        Notification.user_id == guest.id,
        Notification.type == "EVENT_INVITE",
    ).all()
    assert len(notifs) == 1
    assert "Sedinta echipa" in notifs[0].title


def test_participant_sees_event_in_range(db, make_user):
    owner = make_user(username="owner")
    guest = make_user(username="guest")
    today = date.today()
    ev = _make_event(db, owner, today)
    calendar_service.set_event_attendees(db, ev, [guest.id])

    start, end = today - timedelta(days=2), today + timedelta(days=2)

    # Guest vede evenimentul desi nu e owner
    guest_view = calendar_service.get_events_for_range(db, guest.id, start, end)
    assert any(m.id == ev.id for m, _ in guest_view)

    # Un user complet nelegat NU vede evenimentul
    stranger = make_user(username="stranger")
    stranger_view = calendar_service.get_events_for_range(db, stranger.id, start, end)
    assert all(m.id != ev.id for m, _ in stranger_view)


def test_owner_always_sees_own_event(db, make_user):
    owner = make_user(username="owner")
    today = date.today()
    ev = _make_event(db, owner, today)
    start, end = today - timedelta(days=2), today + timedelta(days=2)
    owner_view = calendar_service.get_events_for_range(db, owner.id, start, end)
    assert any(m.id == ev.id for m, _ in owner_view)


def test_decline_hides_event_for_participant(db, make_user):
    owner = make_user(username="owner")
    guest = make_user(username="guest")
    today = date.today()
    ev = _make_event(db, owner, today)
    calendar_service.set_event_attendees(db, ev, [guest.id])

    att = calendar_service.respond_to_invite(db, ev.id, guest.id, accept=False)
    assert att.status == "DECLINED"

    start, end = today - timedelta(days=2), today + timedelta(days=2)
    guest_view = calendar_service.get_events_for_range(db, guest.id, start, end)
    assert all(m.id != ev.id for m, _ in guest_view)

    # Accept readuce evenimentul in calendarul lui
    att2 = calendar_service.respond_to_invite(db, ev.id, guest.id, accept=True)
    assert att2.status == "ACCEPTED"
    guest_view2 = calendar_service.get_events_for_range(db, guest.id, start, end)
    assert any(m.id == ev.id for m, _ in guest_view2)


def test_set_attendees_syncs_add_and_remove(db, make_user):
    owner = make_user(username="owner")
    a = make_user(username="a")
    b = make_user(username="b")
    ev = _make_event(db, owner)

    calendar_service.set_event_attendees(db, ev, [a.id, b.id])
    assert {x.user_id for x in calendar_service.list_event_attendees(db, ev.id)} == {a.id, b.id}

    # Resync doar cu b -> a e scos
    calendar_service.set_event_attendees(db, ev, [b.id])
    assert {x.user_id for x in calendar_service.list_event_attendees(db, ev.id)} == {b.id}


def test_owner_cannot_be_own_attendee(db, make_user):
    owner = make_user(username="owner")
    ev = _make_event(db, owner)
    calendar_service.set_event_attendees(db, ev, [owner.id])
    assert calendar_service.list_event_attendees(db, ev.id) == []


def test_task_items_for_assignee_in_range(db, make_user, make_project, make_category):
    from app.models.task import Task
    from app.models.base import generate_cuid

    owner = make_user(username="owner")
    assignee = make_user(username="assignee")
    proj = make_project(owner)
    cat = make_category()
    today = date.today()
    due = datetime(today.year, today.month, today.day, 14, 30)

    t = Task(
        id=generate_cuid(),
        user_id=owner.id,
        title="Task cu deadline",
        category_id=cat.id,
        project_id=proj.id,
        assignee_id=assignee.id,
        due_date=due,
        is_active=True,
    )
    db.add(t)
    db.commit()

    items = calendar_service.get_task_items_for_range(
        db, assignee.id, today - timedelta(days=1), today + timedelta(days=1)
    )
    assert len(items) == 1
    assert items[0]["taskId"] == t.id
    assert items[0]["eventDate"] == today.isoformat()
    assert items[0]["startTime"] == "14:30"

    # Owner (nu e assignee) nu vede taskul ca item de calendar
    owner_items = calendar_service.get_task_items_for_range(
        db, owner.id, today - timedelta(days=1), today + timedelta(days=1)
    )
    assert owner_items == []
