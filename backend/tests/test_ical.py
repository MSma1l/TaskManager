"""Tests for the iCal (.ics) feed export."""
from datetime import date

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.base import generate_cuid
from app.models.calendar import CalendarEvent
from app.services import ical_service


@pytest.fixture()
def ical_client(TestingSessionLocal):
    """Mounts only the ical router; set_user picks the authenticated user."""
    from app.api.ical import router as ical_router

    application = FastAPI()
    application.include_router(ical_router)

    state = {"user": None}

    def _override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    def _override_current_user():
        if state["user"] is None:
            raise HTTPException(status_code=401, detail="no test user")
        return state["user"]

    application.dependency_overrides[get_db] = _override_get_db
    application.dependency_overrides[get_current_user] = _override_current_user

    client = TestClient(application)

    def set_user(user):
        state["user"] = user

    yield client, set_user
    application.dependency_overrides.clear()


def _make_event(db, user, **kw):
    today = date.today()
    ev = CalendarEvent(
        id=generate_cuid(),
        user_id=user.id,
        title=kw.get("title", "Sedinta, importanta; nota"),
        description=kw.get("description", "Linia 1\nLinia 2"),
        location=kw.get("location", "Birou A"),
        event_type="meeting_online",
        is_all_day=kw.get("is_all_day", False),
        event_status="CONFIRMED",
        recurrence_rule=kw.get("recurrence_rule"),
        recurrence_until=kw.get("recurrence_until"),
        event_date=kw.get("event_date", today),
        start_time=kw.get("start_time", "10:00"),
        end_time=kw.get("end_time", "11:30"),
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


def test_build_ics_contains_vcalendar_and_vevent(db, make_user):
    user = make_user()
    _make_event(db, user)

    ics = ical_service.build_ics(db, user)

    assert "BEGIN:VCALENDAR" in ics
    assert "END:VCALENDAR" in ics
    assert "BEGIN:VEVENT" in ics
    assert "END:VEVENT" in ics
    assert "DTSTART:" in ics
    assert "DTEND:" in ics
    # Text escaping: virgula si punct-virgula escapate, newline -> \n
    assert "Sedinta\\, importanta\\; nota" in ics
    assert "Linia 1\\nLinia 2" in ics
    # CRLF line endings (RFC 5545)
    assert "\r\n" in ics


def test_invalid_token_returns_404(ical_client, db, make_user):
    client, set_user = ical_client
    resp = client.get("/api/ical/nu-exista-acest-token.ics")
    assert resp.status_code == 404


def test_token_is_stable_across_calls(db, make_user):
    user = make_user()
    t1 = ical_service.ensure_token(db, user)
    t2 = ical_service.ensure_token(db, user)
    assert t1 == t2
    assert len(t1) >= 24


def test_feed_endpoint_returns_calendar(ical_client, db, make_user):
    client, set_user = ical_client
    user = make_user()
    _make_event(db, user)
    token = ical_service.ensure_token(db, user)

    resp = client.get(f"/api/ical/{token}.ics")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/calendar")
    assert "BEGIN:VCALENDAR" in resp.text
    assert "BEGIN:VEVENT" in resp.text


def test_me_token_endpoint_returns_token_and_url(ical_client, db, make_user):
    client, set_user = ical_client
    user = make_user()
    set_user(user)

    resp = client.get("/api/ical/me/token")
    assert resp.status_code == 200
    body = resp.json()
    assert body["token"]
    assert body["feedUrl"].endswith(f"/api/ical/{body['token']}.ics")


def test_recurring_event_emits_multiple_vevents(db, make_user):
    from datetime import timedelta

    user = make_user()
    today = date.today()
    _make_event(
        db, user,
        title="Daily standup",
        recurrence_rule="DAILY",
        recurrence_until=today + timedelta(days=4),
    )

    ics = ical_service.build_ics(db, user)
    # 5 ocurente (azi + 4 zile) -> 5 VEVENT-uri.
    assert ics.count("BEGIN:VEVENT") == 5
