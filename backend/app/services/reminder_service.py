import asyncio
from datetime import datetime, timedelta, date as date_t
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import SessionLocal
from app.models.task import Task
from app.models.completion import TaskCompletion
from app.models.reminder import ReminderLog
from app.models.session import TelegramSession
from app.models.calendar import CalendarEvent, CalendarReminderLog
from app.models.project import Project
from app.models.project_reminder_log import ProjectReminderLog
from app.models.task_reminder_log import TaskReminderLog
from app.models.user import User
from app.models.base import TaskStatus
from app.services import task_service, stats_service, calendar_service, completion_service, push_service, membership_service, notification_service
from app.services.project_zone import resolve_zone, days_remaining

scheduler = AsyncIOScheduler()

DAYS_RO = ["Luni", "Marti", "Miercuri", "Joi", "Vineri", "Sambata", "Duminica"]
DAYS_RU = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"]


async def _send_telegram(text: str, chat_id: str | None = None, role: str | None = None):
    from app.telegram.bot import send_message
    try:
        await send_message(text, chat_id=chat_id, role=role)
    except Exception as e:
        print(f"Failed to send telegram message: {e}")


def check_reminders():
    """Check for tasks with reminder at current time. Sends each reminder
    ONLY to the task owner's Telegram chat (no cross-user leakage)."""
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        current_time = now.strftime("%H:%M")
        day_of_week = now.isoweekday()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        from sqlalchemy.orm import joinedload
        tasks = (
            db.query(Task)
            .filter(
                Task.is_active == True,
                Task.reminder_time == current_time,
                Task.day_of_week == day_of_week,
            )
            .options(joinedload(Task.category))
            .all()
        )

        for task in tasks:
            existing = (
                db.query(ReminderLog)
                .filter(
                    ReminderLog.task_id == task.id,
                    ReminderLog.sent_at >= today_start,
                    ReminderLog.channel == "telegram",
                )
                .first()
            )
            if existing:
                continue

            # Resolve the owner — silently skip orphan / unowned tasks rather
            # than dumping them to a single shared chat.
            owner = _get_user(db, task.user_id) if task.user_id else None

            lines = [f"Reminder: {task.title}"]
            if task.description:
                lines.append(task.description)
            if task.category:
                lines.append(f"Categorie: {task.category.icon} {task.category.name}")
            if task.priority and task.priority != "MEDIUM":
                priority_labels = {"LOW": "Mica", "HIGH": "Mare", "URGENT": "URGENT"}
                lines.append(f"Prioritate: {priority_labels.get(task.priority, task.priority)}")
            if task.estimated_minutes:
                if task.estimated_minutes >= 60:
                    dur = f"{task.estimated_minutes // 60}h{task.estimated_minutes % 60}m" if task.estimated_minutes % 60 else f"{task.estimated_minutes // 60}h"
                else:
                    dur = f"{task.estimated_minutes}m"
                lines.append(f"Durata: ~{dur}")
            lines.append(f"Ora: {task.reminder_time}")
            message = "\n".join(lines)

            # Web Push (best-effort, non-fatal) — merge chiar daca Telegram nu e legat.
            _push_to_user(owner, now, f"Reminder: {task.title}", message, url="/")

            if not owner or not owner.telegram_chat_id or not _telegram_allowed(owner, now):
                # Still log so we don't keep retrying the same minute
                db.add(ReminderLog(task_id=task.id, channel="telegram_skipped"))
                continue

            asyncio.create_task(_send_telegram(
                message, chat_id=owner.telegram_chat_id, role=owner.role,
            ))
            db.add(ReminderLog(task_id=task.id, channel="telegram"))

        db.commit()
    except Exception as e:
        print(f"Reminder check error: {e}")
    finally:
        db.close()


def _iter_users_with_telegram(db: Session):
    return (
        db.query(User)
        .filter(User.is_active == True, User.telegram_chat_id.isnot(None))
        .all()
    )


def weekly_summary():
    """Monday 09:00 — send each user their own weekly task list (no cross-user leakage)."""
    db = SessionLocal()
    try:
        for user in _iter_users_with_telegram(db):
            tasks = task_service.get_tasks_for_week(db, user.id)
            if not tasks:
                asyncio.create_task(_send_telegram(
                    "Saptamana noua! Nu ai taskuri programate.",
                    chat_id=user.telegram_chat_id, role=user.role,
                ))
                continue

            by_day: dict[int, list] = {}
            for task in tasks:
                by_day.setdefault(task.day_of_week, []).append(task)

            lines = ["Saptamana noua! Iata taskurile tale:\n"]
            for day_num in sorted(by_day.keys()):
                day_tasks = by_day[day_num]
                day_name = DAYS_RO[day_num - 1]
                lines.append(f"\n{day_name}:")
                for t in day_tasks:
                    reminder = f" la {t.reminder_time}" if t.reminder_time else ""
                    lines.append(f"  - {t.title}{reminder}")

            asyncio.create_task(_send_telegram(
                "\n".join(lines), chat_id=user.telegram_chat_id, role=user.role,
            ))
    except Exception as e:
        print(f"Weekly summary error: {e}")
    finally:
        db.close()


def weekly_report():
    """Sunday 20:00 — per-user report."""
    db = SessionLocal()
    try:
        for user in _iter_users_with_telegram(db):
            stats = stats_service.get_weekly_stats(db, user_id=user.id)
            streaks = stats_service.get_streaks(db, user_id=user.id)
            missed = stats_service.get_missed(db, user_id=user.id)

            lines = [
                "Raport saptamanal:\n",
                f"Total: {stats['total']}",
                f"Completate: {stats['done']}",
                f"Mutate: {stats['skipped']}",
                f"Nefacute: {stats['notDone']}",
                f"Progres: {stats['percentage']}%",
            ]

            if streaks:
                lines.append("\nStreak-uri:")
                for s in streaks[:3]:
                    lines.append(f"  {s['taskTitle']}: {s['streak']} sapt.")

            if missed:
                lines.append("\nCel mai des ratate:")
                for m in missed[:3]:
                    lines.append(f"  {m['taskTitle']}: {m['missedCount']}x")

            asyncio.create_task(_send_telegram(
                "\n".join(lines), chat_id=user.telegram_chat_id, role=user.role,
            ))
    except Exception as e:
        print(f"Weekly report error: {e}")
    finally:
        db.close()


EVENT_TYPE_LABELS = {
    "meeting_online": "Sedinta online",
    "meeting_in_person": "Sedinta",
    "appointment": "Programare",
    "reminder": "Reminder",
    "personal": "Eveniment",
    "task": "Task",
}


def _format_event_message(event: CalendarEvent, occurrence: date_t, minutes_before: int) -> str:
    label = EVENT_TYPE_LABELS.get(event.event_type or "personal", "Eveniment")

    if minutes_before == 0:
        when = "incepe ACUM"
    elif minutes_before < 60:
        when = f"in {minutes_before} min"
    elif minutes_before % 60 == 0:
        when = f"in {minutes_before // 60}h"
    else:
        when = f"in {minutes_before} min"

    lines = [f"{label}: {event.title} {when}"]
    lines.append(f"Cand: {occurrence.strftime('%d.%m.%Y')} {event.start_time}–{event.end_time}")
    if event.location:
        lines.append(f"Unde: {event.location}")
    if event.meeting_url:
        lines.append(f"Link: {event.meeting_url}")
    if event.description:
        lines.append("")
        lines.append(event.description.strip()[:500])
    return "\n".join(lines)


def _user_chat(db: Session, user_id: str) -> str | None:
    user = db.query(User).filter(User.id == user_id).first()
    if user and user.telegram_chat_id:
        return user.telegram_chat_id
    # Legacy: user_id may already be a chat id (single-tenant migration)
    if user_id and user_id.lstrip("-").isdigit():
        return user_id
    return None


def _get_user(db: Session, user_id: str) -> User | None:
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        return user
    # Legacy: try matching by chat id
    return db.query(User).filter(User.telegram_chat_id == user_id).first()


def _telegram_allowed(user: User | None, now: datetime) -> bool:
    """Check the user's notification_settings: telegram channel + do-not-disturb window."""
    if not user:
        return True  # legacy single-user, no preferences
    settings_dict = user.notification_settings or {}
    if settings_dict.get("telegram") is False:
        return False
    start = (settings_dict.get("doNotDisturbStart") or "").strip()
    end = (settings_dict.get("doNotDisturbEnd") or "").strip()
    if not start or not end:
        return True
    return not _in_dnd_window(start, end, now)


def _web_allowed(user: User | None, now: datetime) -> bool:
    """La fel ca _telegram_allowed dar pentru canalul web/push: respecta toggle-ul
    `web` din notification_settings + fereastra "Nu deranja"."""
    if not user:
        return True
    settings_dict = user.notification_settings or {}
    if settings_dict.get("web") is False:
        return False
    start = (settings_dict.get("doNotDisturbStart") or "").strip()
    end = (settings_dict.get("doNotDisturbEnd") or "").strip()
    if not start or not end:
        return True
    return not _in_dnd_window(start, end, now)


def _push_to_user(user: User | None, now: datetime, title: str, body: str, url: str = "/"):
    """Trimite un Web Push best-effort catre user, respectand `web` + DND.
    Non-fatal: orice eroare e inghitita ca sa nu strice loop-ul de reminder.
    Foloseste o sesiune proprie ca sa nu interfereze cu tranzactia apelantului."""
    if not user or not _web_allowed(user, now):
        return
    try:
        push_db = SessionLocal()
        try:
            push_service.send_to_user(push_db, user.id, title, body, url)
        finally:
            push_db.close()
    except Exception as e:  # noqa: BLE001
        print(f"[reminder] push error: {e}")


def _in_dnd_window(start: str, end: str, now: datetime) -> bool:
    """Both 'HH:MM'. Window can wrap midnight (e.g. 22:00 - 07:00)."""
    try:
        sh, sm = map(int, start.split(":"))
        eh, em = map(int, end.split(":"))
    except Exception:
        return False
    cur = now.hour * 60 + now.minute
    s = sh * 60 + sm
    e = eh * 60 + em
    if s == e:
        return False
    if s < e:
        return s <= cur < e
    return cur >= s or cur < e


def check_calendar_reminders():
    """Fire reminders for calendar events whose offset matches the current minute."""
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        today = now.date()
        # Look ahead 7 days max — covers most reminder offsets (max ~10080 min = 7 days)
        horizon = today + timedelta(days=7)

        masters = (
            db.query(CalendarEvent)
            .filter(
                CalendarEvent.is_deleted == False,
                CalendarEvent.event_status != "CANCELLED",
                CalendarEvent.event_date <= horizon,
            )
            .all()
        )

        for event in masters:
            offsets = event.reminder_minutes or []
            if not offsets:
                continue

            # Compute next occurrences in the next 8 days for recurrence
            occurrences = calendar_service._occurrences_in_range(event, today, horizon)

            for occ in occurrences:
                try:
                    h, m = (event.start_time or "00:00").split(":")
                    occ_dt = datetime(occ.year, occ.month, occ.day, int(h), int(m))
                except Exception:
                    continue

                for offset in offsets:
                    try:
                        offset = int(offset)
                    except (TypeError, ValueError):
                        continue

                    fire_at = occ_dt - timedelta(minutes=offset)
                    # Match within ±30 sec of the current minute
                    delta = abs((fire_at - now).total_seconds())
                    if delta > 30:
                        continue

                    already = (
                        db.query(CalendarReminderLog)
                        .filter(
                            CalendarReminderLog.event_id == event.id,
                            CalendarReminderLog.occurrence_date == occ,
                            CalendarReminderLog.minutes_before == str(offset),
                            CalendarReminderLog.channel == "telegram",
                        )
                        .first()
                    )
                    if already:
                        continue

                    user_obj = _get_user(db, event.user_id)

                    # Web Push (best-effort, non-fatal). Anti-duplicare proprie pe
                    # canalul "push" ca sa nu trimitem acelasi reminder de doua ori.
                    push_already = (
                        db.query(CalendarReminderLog)
                        .filter(
                            CalendarReminderLog.event_id == event.id,
                            CalendarReminderLog.occurrence_date == occ,
                            CalendarReminderLog.minutes_before == str(offset),
                            CalendarReminderLog.channel == "push",
                        )
                        .first()
                    )
                    if not push_already and _web_allowed(user_obj, now):
                        text_push = _format_event_message(event, occ, offset)
                        _push_to_user(
                            user_obj, now,
                            f"{EVENT_TYPE_LABELS.get(event.event_type or 'personal', 'Eveniment')}: {event.title}",
                            text_push, url="/calendar",
                        )
                        db.add(CalendarReminderLog(
                            event_id=event.id,
                            occurrence_date=occ,
                            minutes_before=str(offset),
                            channel="push",
                        ))

                    if not _telegram_allowed(user_obj, now):
                        # Still mark as fired so we don't retry on the next minute
                        db.add(CalendarReminderLog(
                            event_id=event.id,
                            occurrence_date=occ,
                            minutes_before=str(offset),
                            channel="telegram_skipped",
                        ))
                        continue

                    text = _format_event_message(event, occ, offset)
                    chat_id = _user_chat(db, event.user_id)
                    if chat_id:
                        role = user_obj.role if user_obj else None
                        asyncio.create_task(_send_telegram(text, chat_id=chat_id, role=role))

                    db.add(CalendarReminderLog(
                        event_id=event.id,
                        occurrence_date=occ,
                        minutes_before=str(offset),
                        channel="telegram",
                    ))
        db.commit()
    except Exception as e:
        print(f"Calendar reminder check error: {e}")
    finally:
        db.close()


def post_meeting_prompts():
    """Right after each event ends, ask the attendee on Telegram to confirm presence and add a quick note.

    Reuses CalendarReminderLog with channel="post_meeting" so we only ask once per occurrence.
    """
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        today = now.date()
        # Look at events that ended in the last hour (covers cron jitter / restart)
        lower = now - timedelta(hours=1)

        masters = (
            db.query(CalendarEvent)
            .filter(
                CalendarEvent.is_deleted == False,
                CalendarEvent.event_status != "CANCELLED",
                CalendarEvent.event_date >= today - timedelta(days=1),
                CalendarEvent.event_date <= today,
            )
            .all()
        )

        for event in masters:
            # Only meeting-style events get the post prompt
            if event.event_type not in ("meeting_online", "meeting_in_person", "appointment"):
                continue

            occurrences = calendar_service._occurrences_in_range(event, today - timedelta(days=1), today)
            for occ in occurrences:
                try:
                    h, m = (event.end_time or "00:00").split(":")
                    end_dt = datetime(occ.year, occ.month, occ.day, int(h), int(m))
                except Exception:
                    continue

                # Fire only after the event ended, within the last hour
                if not (lower <= end_dt <= now):
                    continue

                already = (
                    db.query(CalendarReminderLog)
                    .filter(
                        CalendarReminderLog.event_id == event.id,
                        CalendarReminderLog.occurrence_date == occ,
                        CalendarReminderLog.channel == "post_meeting",
                    )
                    .first()
                )
                if already:
                    continue

                user_obj = _get_user(db, event.user_id)
                chat_id = _user_chat(db, event.user_id)

                # Auto-mark attendance: if the user hasn't already said anything,
                # assume they were there. They can flip it to MISSED later.
                if event.attendance_status == "PENDING":
                    event.attendance_status = "AUTO_ATTENDED"

                if not chat_id or not _telegram_allowed(user_obj, now):
                    db.add(CalendarReminderLog(
                        event_id=event.id, occurrence_date=occ,
                        minutes_before="post", channel="post_meeting_skipped",
                    ))
                    continue

                lines = [
                    f"Sedinta s-a incheiat: {event.title}",
                    f"Cand: {occ.strftime('%d.%m.%Y')} {event.start_time}–{event.end_time}",
                ]
                if event.location:
                    lines.append(f"Unde: {event.location}")
                lines.append("")
                lines.append("Am bifat-o automat ca participat. Daca a fost altfel:")
                lines.append(f"  • /attended {event.id} <nota>  — confirmi cu nota")
                lines.append(f"  • /missed {event.id} <motiv>   — nu ai fost")

                role = user_obj.role if user_obj else None
                asyncio.create_task(_send_telegram("\n".join(lines), chat_id=chat_id, role=role))

                db.add(CalendarReminderLog(
                    event_id=event.id, occurrence_date=occ,
                    minutes_before="post", channel="post_meeting",
                ))

        db.commit()
    except Exception as e:
        print(f"Post-meeting prompt error: {e}")
    finally:
        db.close()


def auto_move_overdue_tasks():
    """At 23:55 each day, move any PENDING task to the next day. Notifies
    each owner separately so taskurile lor nu apar in chatul altui user."""
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        today_dow = now.isoweekday()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start + timedelta(days=1)
        tomorrow_iso = (today_start + timedelta(days=1)).date().isoformat()

        tasks = (
            db.query(Task)
            .filter(Task.is_active == True)
            .all()
        )

        moved_by_user: dict[str, list] = {}
        for task in tasks:
            is_today = False
            if task.is_recurring and task.day_of_week == today_dow:
                is_today = True
            elif task.scheduled_date and today_start <= task.scheduled_date < today_end:
                is_today = True
            if not is_today:
                continue

            week_start = task_service.get_week_start(now)
            completion = (
                db.query(TaskCompletion)
                .filter(
                    TaskCompletion.task_id == task.id,
                    TaskCompletion.week_start == week_start,
                )
                .first()
            )
            current_status = completion.status if completion else TaskStatus.PENDING
            if current_status != TaskStatus.PENDING:
                continue

            try:
                completion_service.mark_skip(
                    db, task.id, tomorrow_iso, skip_reason="Auto-mutat: neexecutat azi"
                )
                if task.user_id:
                    moved_by_user.setdefault(task.user_id, []).append(task)
            except Exception as e:
                print(f"Failed to auto-move task {task.id}: {e}")

        # Notify each owner separately
        for user_id, user_tasks in moved_by_user.items():
            owner = _get_user(db, user_id)
            if not owner or not owner.telegram_chat_id or not _telegram_allowed(owner, now):
                continue
            lines = ["Atentie — taskuri ne-executate azi mutate pe maine:"]
            for t in user_tasks[:10]:
                lines.append(f"  · {t.title}")
            if len(user_tasks) > 10:
                lines.append(f"  …si inca {len(user_tasks) - 10}")
            lines.append("")
            lines.append("Maine e o noua sansa. Mult succes!")
            asyncio.create_task(_send_telegram(
                "\n".join(lines), chat_id=owner.telegram_chat_id, role=owner.role,
            ))

    except Exception as e:
        print(f"Auto-move overdue error: {e}")
    finally:
        db.close()


# ── Daily digest ("Agenda ta de azi") ─────────────────────────────────────────

# Anti-duplicare in-memory: retine (user_id, data_iso) pentru care s-a trimis deja
# digest-ul azi. Simplu si robust pentru un singur proces (scheduler-ul ruleaza in
# acelasi proces cu API-ul). NOTA: se reseteaza la restart — daca procesul reporneste
# fix la ora digest-ului, un user ar putea primi un al doilea digest in acelasi minut;
# acceptabil pentru un mesaj informativ (nu actiune).
_digest_sent: set[tuple[str, str]] = set()


def _digest_i18n(lang: str) -> dict:
    """Stringuri RO/RU pentru digest (default RO)."""
    if (lang or "ro").lower().startswith("ru"):
        return {
            "header": "Твоя повестка на сегодня",
            "tasks": "Задачи на сегодня",
            "board": "Назначенные задачи (проекты)",
            "events": "События календаря",
            "empty": "На сегодня ничего не запланировано. Хорошего дня!",
            "all_day": "весь день",
            "days": DAYS_RU,
        }
    return {
        "header": "Agenda ta de azi",
        "tasks": "Taskuri de azi",
        "board": "Taskuri atribuite (proiecte)",
        "events": "Evenimente in calendar",
        "empty": "Nimic programat azi. Zi buna!",
        "all_day": "toata ziua",
        "days": DAYS_RO,
    }


def _board_tasks_due_today(db: Session, user_id: str, today: date_t) -> list[Task]:
    """Taskuri de board atribuite userului cu due_date azi (optional in digest)."""
    start = datetime(today.year, today.month, today.day)
    end = start + timedelta(days=1)
    return (
        db.query(Task)
        .filter(
            Task.is_active == True,
            Task.assignee_id == user_id,
            Task.board_column_id.isnot(None),
            Task.due_date >= start,
            Task.due_date < end,
        )
        .order_by(Task.title)
        .all()
    )


def build_daily_digest(db: Session, user: User, now: datetime | None = None) -> str | None:
    """Construieste textul digest-ului zilnic pentru un user.

    Aduna: taskuri personale de azi (task_service), taskuri de board atribuite cu
    due azi (board), si evenimentele de calendar de azi. Localizeaza dupa
    `user.language`. Intoarce None daca nu e nimic de afisat? Nu — intoarce un
    mesaj "gol" prietenos, ca userul sa stie ca digest-ul functioneaza.
    """
    now = now or datetime.utcnow()
    today = now.date()
    day_of_week = now.isoweekday()
    t = _digest_i18n(user.language)

    lines = [f"{t['header']} — {t['days'][day_of_week - 1]}, {today.strftime('%d.%m.%Y')}"]
    has_content = False

    # 1) Taskuri personale (saptamanale) de azi
    personal = task_service.get_tasks_for_day(db, user.id, day_of_week, date=now)
    if personal:
        has_content = True
        lines.append("")
        lines.append(f"{t['tasks']}:")
        for task in personal:
            reminder = f" la {task.reminder_time}" if task.reminder_time else ""
            lines.append(f"  - {task.title}{reminder}")

    # 2) Taskuri de board atribuite cu due azi
    board_tasks = _board_tasks_due_today(db, user.id, today)
    if board_tasks:
        has_content = True
        lines.append("")
        lines.append(f"{t['board']}:")
        for task in board_tasks:
            lines.append(f"  - {task.title}")

    # 3) Evenimente de calendar de azi
    events = calendar_service.get_events_for_date(db, user.id, today)
    if events:
        has_content = True
        lines.append("")
        lines.append(f"{t['events']}:")
        # events e o lista de (master_event, occurrence_date) — sortam dupa ora
        for event, _occ in sorted(events, key=lambda e: (e[0].is_all_day, e[0].start_time or "")):
            when = t["all_day"] if event.is_all_day else f"{event.start_time}–{event.end_time}"
            location = f" @ {event.location}" if event.location else ""
            lines.append(f"  - {when}  {event.title}{location}")

    if not has_content:
        lines.append("")
        lines.append(t["empty"])

    return "\n".join(lines)


def _digest_enabled(user: User) -> bool:
    """Userul primeste digest daca toggle-ul telegram nu e False SI dailyDigest nu e
    False (ambele default true daca lipsesc)."""
    s = user.notification_settings or {}
    if s.get("telegram") is False:
        return False
    if s.get("dailyDigest") is False:
        return False
    return True


def send_daily_digest():
    """Ruleaza la HH:00 unde HH == DAILY_DIGEST_HOUR (UTC). Trimite UN SINGUR mesaj
    pe Telegram fiecarui user activ cu chat legat care nu a dezactivat digest-ul.

    Fereastra "nu deranja" e IGNORATA intentionat: digest-ul e la o ora fixa aleasa
    de admin, deci nu il suprimam chiar daca pica in DND (altfel userul nu l-ar primi
    niciodata daca ora coincide cu fereastra de liniste).
    """
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        today_iso = now.date().isoformat()
        for user in _iter_users_with_telegram(db):
            if not _digest_enabled(user):
                continue
            guard = (user.id, today_iso)
            if guard in _digest_sent:
                continue
            text = build_daily_digest(db, user, now)
            if not text:
                continue
            asyncio.create_task(_send_telegram(
                text, chat_id=user.telegram_chat_id, role=user.role,
            ))
            _digest_sent.add(guard)

        # Curata intrarile vechi (din zilele trecute) ca setul sa nu creasca la infinit
        for entry in list(_digest_sent):
            if entry[1] != today_iso:
                _digest_sent.discard(entry)
    except Exception as e:
        print(f"Daily digest error: {e}")
    finally:
        db.close()


def notify_quick_tasks():
    """La fiecare minut — notifica adminii/owner-ii despre quick task-uri noi.
    Sesiune proprie, totul wrap-uit ca o eroare sa nu strice loop-ul."""
    db = SessionLocal()
    try:
        from app.services import quick_task_service
        quick_task_service.notify_admins_new_quick_tasks(db)
    except Exception as e:
        print(f"Quick task notify error: {e}")
    finally:
        db.close()


# ── Zone de prioritate proiecte (tranzitii + countdown URGENT) ────────────────


def _zone_transition_message(name: str, new_zone: str, dr: int | None) -> str:
    """Mesaj RO pentru tranzitia unui proiect intr-o zona noua. `dr` = zile ramase
    (None cand zona vine din override manual, fara deadline)."""
    days = f" ({dr} zile)" if dr is not None else ""
    if new_zone == "URGENT":
        if dr is not None:
            return f"🔴 Proiectul «{name}» a intrat în zona URGENT — deadline peste {dr} zile."
        return f"🔴 Proiectul «{name}» a intrat în zona URGENT."
    if new_zone == "MEDIUM":
        return f"🟠 Proiectul «{name}» a trecut în zona Curând{days}."
    if new_zone == "NORMAL":
        return f"🟢 Proiectul «{name}» e în zona Planificat{days}."
    # BACKLOG
    return f"🟣 Proiectul «{name}» a fost mutat în Idei / În așteptare."


def _urgent_countdown_message(name: str, deadline: datetime, now: datetime) -> str:
    """Mesaj RO de countdown zilnic pentru un proiect URGENT cu deadline setat."""
    dr = days_remaining(deadline, now)
    if dr is not None and dr < 0:
        return f"⚠️ «{name}» — deadline depășit cu {abs(dr)} zile!"
    if dr is not None and dr >= 1:
        return f"🔴 «{name}» — mai sunt {dr} zile până la deadline."
    # Sub o zi: arata orele ramase (nu coboram sub 0).
    hours = max(0, int(round((deadline - now).total_seconds() / 3600)))
    return f"🔴 «{name}» — mai sunt {hours} ore până la deadline."


def check_project_zones():
    """La fiecare minut: pentru fiecare proiect activ recalculeaza zona de prioritate.

    1) Tranzitie de zona: daca zona s-a schimbat (si last_zone nu e None), anunta pe
       Telegram fiecare membru al proiectului (respecta toggle Telegram + DND).
    2) Countdown zilnic URGENT: pentru proiectele in zona URGENT cu deadline, trimite
       o data pe zi fiecarui membru un countdown (dedup prin project_reminder_logs).

    Prima atribuire de zona (last_zone is None) se face silentios, fara mesaj, ca sa
    nu spamam la rollout.
    """
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        today_iso = now.date().isoformat()

        projects = db.query(Project).filter(Project.is_active == True).all()

        for project in projects:
            # Zona efectiva: pin manual invinge deadline-ul (nu genera tranzitii false).
            new_zone = resolve_zone(project.pinned_zone, project.deadline, project.priority, now)
            dr = days_remaining(project.deadline, now)

            members = membership_service.list_members(db, project.id)

            # 1) Tranzitie de zona
            if project.last_zone is None:
                # Prima atribuire — seteaza silentios, fara notificare.
                project.last_zone = new_zone
            elif new_zone != project.last_zone:
                text = _zone_transition_message(project.name, new_zone, dr)
                for member in members:
                    user_obj = _get_user(db, member.user_id)
                    if not user_obj:
                        continue
                    # In-app (clopotel) — pentru fiecare membru, indiferent de Telegram/DND.
                    notification_service.create_safe(
                        db, user_id=user_obj.id, type="PROJECT_ZONE_CHANGED",
                        title=text, link=f"/projects/{project.id}",
                        meta={"projectId": project.id, "zone": new_zone},
                        commit=False,
                    )
                    # Telegram — doar daca are chat legat si nu e in DND / toggle off.
                    if not user_obj.telegram_chat_id or not _telegram_allowed(user_obj, now):
                        continue
                    asyncio.create_task(_send_telegram(
                        text, chat_id=user_obj.telegram_chat_id, role=user_obj.role,
                    ))
                project.last_zone = new_zone

            # 2) Countdown zilnic pentru URGENT cu deadline
            if new_zone == "URGENT" and project.deadline is not None:
                msg = _urgent_countdown_message(project.name, project.deadline, now)
                for member in members:
                    user_obj = _get_user(db, member.user_id)
                    if not user_obj:
                        continue
                    # Dedup: o singura data pe zi per (proiect, user) — acopera ambele
                    # canale (in-app + Telegram) ca sa nu dublam countdown-ul.
                    already = (
                        db.query(ProjectReminderLog)
                        .filter(
                            ProjectReminderLog.project_id == project.id,
                            ProjectReminderLog.user_id == user_obj.id,
                            ProjectReminderLog.kind == "URGENT_DAILY",
                            ProjectReminderLog.sent_date == today_iso,
                        )
                        .first()
                    )
                    if already:
                        continue
                    # In-app (clopotel) — intotdeauna, indiferent de Telegram/DND.
                    notification_service.create_safe(
                        db, user_id=user_obj.id, type="PROJECT_DEADLINE_URGENT",
                        title=msg, link=f"/projects/{project.id}",
                        meta={"projectId": project.id},
                        commit=False,
                    )
                    # Telegram — doar daca are chat legat si nu e in DND / toggle off.
                    if user_obj.telegram_chat_id and _telegram_allowed(user_obj, now):
                        asyncio.create_task(_send_telegram(
                            msg, chat_id=user_obj.telegram_chat_id, role=user_obj.role,
                        ))
                    db.add(ProjectReminderLog(
                        project_id=project.id,
                        user_id=user_obj.id,
                        kind="URGENT_DAILY",
                        sent_date=today_iso,
                    ))

        db.commit()
    except Exception as e:
        print(f"Project zone check error: {e}")
    finally:
        db.close()


# ── Zone de prioritate taskuri board (tranzitii + countdown URGENT) ───────────


def _task_zone_transition_message(title: str, new_zone: str, dr: int | None) -> str:
    """Mesaj RO pentru tranzitia unui task de board intr-o zona noua."""
    days = f" ({dr} zile)" if dr is not None else ""
    if new_zone == "URGENT":
        if dr is not None:
            return f"🔴 Taskul «{title}» a intrat în URGENT — deadline peste {dr} zile."
        return f"🔴 Taskul «{title}» a intrat în zona URGENT."
    if new_zone == "MEDIUM":
        return f"🟠 Taskul «{title}» a trecut în zona Curând{days}."
    if new_zone == "NORMAL":
        return f"🟢 Taskul «{title}» e în zona Planificat{days}."
    # BACKLOG
    return f"🟣 Taskul «{title}» a fost mutat în Idei / În așteptare."


def _task_urgent_countdown_message(title: str, deadline: datetime, now: datetime) -> str:
    """Mesaj RO de countdown zilnic pentru un task URGENT cu deadline setat."""
    dr = days_remaining(deadline, now)
    if dr is not None and dr < 0:
        return f"⚠️ Taskul «{title}» — deadline depășit cu {abs(dr)} zile!"
    if dr is not None and dr >= 1:
        return f"🔴 Taskul «{title}» — mai sunt {dr} zile până la deadline."
    # Sub o zi: arata orele ramase (nu coboram sub 0).
    hours = max(0, int(round((deadline - now).total_seconds() / 3600)))
    return f"🔴 Taskul «{title}» — mai sunt {hours} ore până la deadline."


def check_task_zones():
    """La fiecare minut: pentru fiecare task de board activ cu deadline (due_date)
    recalculeaza zona de prioritate.

    1) Tranzitie de zona: daca zona s-a schimbat (si last_zone nu e None), anunta
       fiecare RESPONSABIL (task.assignees — nu toti membrii) in-app + Telegram.
    2) Countdown zilnic URGENT: pentru taskurile URGENT cu deadline, o data pe zi
       fiecarui responsabil (dedup prin task_reminder_logs).

    Prima atribuire de zona (last_zone is None) se face silentios. Totul wrap-uit
    intr-un try/except ca o eroare sa nu strice loop-ul de scheduler.
    """
    db = SessionLocal()
    try:
        from sqlalchemy.orm import joinedload

        now = datetime.utcnow()
        today_iso = now.date().isoformat()

        # Doar taskuri de board active cu deadline setat (tranzitiile sunt relevante
        # doar cand exista due_date — zona pe override pur nu se schimba in timp).
        tasks = (
            db.query(Task)
            .filter(
                Task.is_active == True,
                Task.board_column_id.isnot(None),
                Task.due_date.isnot(None),
            )
            .options(joinedload(Task.assignees))
            .all()
        )

        for task in tasks:
            # Zona efectiva: pin manual invinge deadline-ul (nu genera tranzitii false).
            new_zone = resolve_zone(task.pinned_zone, task.due_date, task.zone_override, now)
            dr = days_remaining(task.due_date, now)
            assignees = task.assignees or []

            # 1) Tranzitie de zona
            if task.last_zone is None:
                task.last_zone = new_zone
            elif new_zone != task.last_zone:
                text = _task_zone_transition_message(task.title, new_zone, dr)
                for user_obj in assignees:
                    if not user_obj:
                        continue
                    notification_service.create_safe(
                        db, user_id=user_obj.id, type="TASK_ZONE_CHANGED",
                        title=text, link=f"/projects/{task.project_id}/board",
                        meta={"taskId": task.id, "projectId": task.project_id, "zone": new_zone},
                        commit=False,
                    )
                    if not user_obj.telegram_chat_id or not _telegram_allowed(user_obj, now):
                        continue
                    asyncio.create_task(_send_telegram(
                        text, chat_id=user_obj.telegram_chat_id, role=user_obj.role,
                    ))
                task.last_zone = new_zone

            # 2) Countdown zilnic pentru URGENT cu deadline
            if new_zone == "URGENT" and task.due_date is not None:
                msg = _task_urgent_countdown_message(task.title, task.due_date, now)
                for user_obj in assignees:
                    if not user_obj:
                        continue
                    already = (
                        db.query(TaskReminderLog)
                        .filter(
                            TaskReminderLog.task_id == task.id,
                            TaskReminderLog.user_id == user_obj.id,
                            TaskReminderLog.kind == "URGENT_DAILY",
                            TaskReminderLog.sent_date == today_iso,
                        )
                        .first()
                    )
                    if already:
                        continue
                    notification_service.create_safe(
                        db, user_id=user_obj.id, type="TASK_DEADLINE_URGENT",
                        title=msg, link=f"/projects/{task.project_id}/board",
                        meta={"taskId": task.id, "projectId": task.project_id},
                        commit=False,
                    )
                    if user_obj.telegram_chat_id and _telegram_allowed(user_obj, now):
                        asyncio.create_task(_send_telegram(
                            msg, chat_id=user_obj.telegram_chat_id, role=user_obj.role,
                        ))
                    db.add(TaskReminderLog(
                        task_id=task.id,
                        project_id=task.project_id,
                        user_id=user_obj.id,
                        kind="URGENT_DAILY",
                        sent_date=today_iso,
                    ))

        db.commit()
    except Exception as e:
        print(f"Task zone check error: {e}")
    finally:
        db.close()


def cleanup_sessions():
    """Expire telegram sessions older than 10 minutes."""
    db = SessionLocal()
    try:
        cutoff = datetime.utcnow() - timedelta(minutes=10)
        db.query(TelegramSession).filter(TelegramSession.updated_at < cutoff).delete()
        db.commit()
    except Exception as e:
        print(f"Session cleanup error: {e}")
    finally:
        db.close()


def start_scheduler():
    # Every minute - check task reminders
    scheduler.add_job(check_reminders, 'cron', minute='*', id='check_reminders')
    # Every minute - check calendar event reminders
    scheduler.add_job(check_calendar_reminders, 'cron', minute='*', id='check_calendar_reminders')
    # Daily 23:55 - move all pending tasks to tomorrow + notify
    scheduler.add_job(auto_move_overdue_tasks, 'cron', hour=23, minute=55, id='auto_move_overdue')
    # Every minute - post-meeting attendance prompts
    scheduler.add_job(post_meeting_prompts, 'cron', minute='*', id='post_meeting_prompts')
    # Monday 09:00 - weekly summary
    scheduler.add_job(weekly_summary, 'cron', day_of_week='mon', hour=9, minute=0, id='weekly_summary')
    # Sunday 20:00 - weekly report
    scheduler.add_job(weekly_report, 'cron', day_of_week='sun', hour=20, minute=0, id='weekly_report')
    # Daily HH:00 (UTC, HH = DAILY_DIGEST_HOUR) - daily digest ("Agenda ta de azi")
    scheduler.add_job(send_daily_digest, 'cron', hour=settings.DAILY_DIGEST_HOUR, minute=0, id='daily_digest')
    # Every minute - notifica adminii despre quick task-uri noi
    scheduler.add_job(notify_quick_tasks, 'cron', minute='*', id='notify_quick_tasks')
    # Every minute - zone de prioritate proiecte (tranzitii + countdown URGENT)
    scheduler.add_job(check_project_zones, 'cron', minute='*', id='check_project_zones')
    # Every minute - zone de prioritate taskuri board (tranzitii + countdown URGENT)
    scheduler.add_job(check_task_zones, 'cron', minute='*', id='check_task_zones')
    # Every minute - cleanup expired sessions
    scheduler.add_job(cleanup_sessions, 'cron', minute='*', id='cleanup_sessions')

    scheduler.start()
    print("Scheduler started")
