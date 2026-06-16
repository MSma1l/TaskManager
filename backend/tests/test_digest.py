"""Teste pentru digest-ul zilnic Telegram ("Agenda ta de azi").

Verifica:
  1. Construirea textului digest-ului (taskuri personale + board + evenimente).
  2. Selectia userilor: cei fara telegram_chat_id sau cu dailyDigest=false / telegram=false
     sunt sariti, iar trimiterea Telegram e mock-uita (fara retea).
"""
from datetime import datetime, timedelta

from app.services import reminder_service, task_service, calendar_service


# O zi fixa, ca testele sa fie deterministe. Folosim "azi" la nivel de UTC dar
# fortam day_of_week-ul prin parametrul `now` dat lui build_daily_digest.
def _now_on(weekday_iso: int) -> datetime:
    """Un datetime al carui isoweekday() == weekday_iso (1=Luni)."""
    base = datetime(2026, 6, 15, 8, 0, 0)  # 2026-06-15 e Luni (isoweekday=1)
    return base + timedelta(days=(weekday_iso - 1))


def test_build_digest_includes_tasks_and_events(db, make_user, make_category):
    user = make_user()
    user.telegram_chat_id = "123456"
    user.language = "ro"
    db.commit()

    now = _now_on(1)  # Luni
    cat = make_category()

    # Task personal recurent pe Luni cu reminder.
    task_service.create_task(
        db, user.id,
        {
            "title": "Sport dimineata",
            "categoryId": cat.id,
            "dayOfWeek": 1,
            "isRecurring": True,
            "reminderTime": "07:30",
        },
    )

    # Eveniment de calendar azi.
    calendar_service.create_event(
        db, user.id,
        title="Sedinta echipa",
        event_date=now.date(),
        start_time="10:00",
        end_time="11:00",
        location="Sala 2",
        event_type="meeting_in_person",
    )

    text = reminder_service.build_daily_digest(db, user, now)

    assert "Agenda ta de azi" in text
    assert "Luni" in text
    # Taskul personal + ora reminder
    assert "Sport dimineata" in text
    assert "07:30" in text
    # Evenimentul de calendar + ora + locatie
    assert "Sedinta echipa" in text
    assert "10:00" in text
    assert "Sala 2" in text


def test_build_digest_includes_board_task_due_today(db, make_user, make_project):
    from app.services import board_service
    from app.models.board_column import BoardColumn

    owner = make_user()
    owner.telegram_chat_id = "999"
    db.commit()
    project = make_project(owner)
    board_service.ensure_columns(db, project.id)
    col = (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project.id)
        .order_by(BoardColumn.position)
        .first()
    )

    now = _now_on(3)  # Miercuri
    board_service.create_task(
        db, owner.id, project.id,
        {
            "title": "Implementeaza API",
            "columnId": col.id,
            "assigneeId": owner.id,
            "dueDate": now.date().isoformat(),
        },
    )

    text = reminder_service.build_daily_digest(db, owner, now)
    assert "Taskuri atribuite" in text
    assert "Implementeaza API" in text


def test_build_digest_empty_message(db, make_user):
    user = make_user()
    user.telegram_chat_id = "111"
    db.commit()
    text = reminder_service.build_daily_digest(db, user, _now_on(2))
    assert "Nimic programat azi" in text


def test_build_digest_russian(db, make_user, make_category):
    user = make_user()
    user.telegram_chat_id = "222"
    user.language = "ru"
    db.commit()
    task_service.create_task(
        db, user.id,
        {"title": "Zadacha", "categoryId": make_category().id, "dayOfWeek": 1, "isRecurring": True},
    )
    text = reminder_service.build_daily_digest(db, user, _now_on(1))
    assert "Твоя повестка на сегодня" in text
    assert "Задачи на сегодня" in text
    assert "Zadacha" in text


def test_send_digest_skips_users_without_telegram_or_disabled(db, make_user, monkeypatch):
    # User OK — primeste digest.
    u_ok = make_user(username="ok_user")
    u_ok.telegram_chat_id = "100"
    # User fara telegram — sarit.
    u_no_tg = make_user(username="no_tg")
    u_no_tg.telegram_chat_id = None
    # User cu dailyDigest=false — sarit.
    u_off = make_user(username="digest_off")
    u_off.telegram_chat_id = "200"
    u_off.notification_settings = {"dailyDigest": False}
    # User cu telegram=false — sarit.
    u_tg_off = make_user(username="tg_off")
    u_tg_off.telegram_chat_id = "300"
    u_tg_off.notification_settings = {"telegram": False}
    db.commit()

    # Mock pe trimiterea Telegram (fara retea) si pe sesiunea DB folosita de job.
    sent: list[dict] = []

    async def _fake_send(text, chat_id=None, role=None):
        sent.append({"text": text, "chat_id": chat_id})

    monkeypatch.setattr(reminder_service, "_send_telegram", _fake_send)
    monkeypatch.setattr(reminder_service, "SessionLocal", lambda: db)
    # Evita o sesiune inchisa peste fixtura `db`.
    monkeypatch.setattr(db, "close", lambda: None)

    # asyncio.create_task are nevoie de un event loop care ruleaza; il inlocuim cu
    # o rulare sincrona ca sa putem inspecta apelurile fara loop.
    scheduled: list = []
    monkeypatch.setattr(
        reminder_service.asyncio, "create_task",
        lambda coro: scheduled.append(coro) or coro.close(),
    )

    # Curata guard-ul in-memory ca testul sa fie independent.
    reminder_service._digest_sent.clear()

    reminder_service.send_daily_digest()

    # Un singur user (u_ok) a fost programat pentru trimitere.
    assert len(scheduled) == 1
    # Guard-ul retine doar userul OK.
    today_iso = datetime.utcnow().date().isoformat()
    assert (u_ok.id, today_iso) in reminder_service._digest_sent
    assert (u_no_tg.id, today_iso) not in reminder_service._digest_sent
    assert (u_off.id, today_iso) not in reminder_service._digest_sent
    assert (u_tg_off.id, today_iso) not in reminder_service._digest_sent


def test_send_digest_not_sent_twice_same_day(db, make_user, monkeypatch):
    user = make_user(username="dup_user")
    user.telegram_chat_id = "555"
    db.commit()

    monkeypatch.setattr(reminder_service, "SessionLocal", lambda: db)
    monkeypatch.setattr(db, "close", lambda: None)

    scheduled: list = []
    monkeypatch.setattr(
        reminder_service.asyncio, "create_task",
        lambda coro: scheduled.append(coro) or coro.close(),
    )
    reminder_service._digest_sent.clear()

    reminder_service.send_daily_digest()
    reminder_service.send_daily_digest()  # a doua oara in aceeasi zi

    assert len(scheduled) == 1
