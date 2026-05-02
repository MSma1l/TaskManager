import asyncio
from datetime import datetime, timedelta, date as date_t
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.task import Task
from app.models.completion import TaskCompletion
from app.models.reminder import ReminderLog
from app.models.session import TelegramSession
from app.models.calendar import CalendarEvent, CalendarReminderLog
from app.models.user import User
from app.models.base import TaskStatus
from app.services import task_service, stats_service, calendar_service

scheduler = AsyncIOScheduler()

DAYS_RO = ["Luni", "Marti", "Miercuri", "Joi", "Vineri", "Sambata", "Duminica"]


async def _send_telegram(text: str, chat_id: str | None = None):
    from app.telegram.bot import send_message
    try:
        await send_message(text, chat_id=chat_id)
    except Exception as e:
        print(f"Failed to send telegram message: {e}")


def check_reminders():
    """Check for tasks with reminder at current time."""
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
            # Check if already sent today
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

            # Build rich message
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

            asyncio.create_task(_send_telegram("\n".join(lines)))

            # Log
            log = ReminderLog(task_id=task.id, channel="telegram")
            db.add(log)

        db.commit()
    except Exception as e:
        print(f"Reminder check error: {e}")
    finally:
        db.close()


def weekly_summary():
    """Monday 09:00 - send weekly task list."""
    db = SessionLocal()
    try:
        tasks = task_service.get_tasks_for_week(db)
        if not tasks:
            asyncio.create_task(_send_telegram("Saptamana noua! Nu ai taskuri programate."))
            return

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

        asyncio.create_task(_send_telegram("\n".join(lines)))
    except Exception as e:
        print(f"Weekly summary error: {e}")
    finally:
        db.close()


def weekly_report():
    """Sunday 20:00 - send weekly report."""
    db = SessionLocal()
    try:
        stats = stats_service.get_weekly_stats(db)
        streaks = stats_service.get_streaks(db)
        missed = stats_service.get_missed(db)

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

        asyncio.create_task(_send_telegram("\n".join(lines)))
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
                        asyncio.create_task(_send_telegram(text, chat_id=chat_id))

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
    # Monday 09:00 - weekly summary
    scheduler.add_job(weekly_summary, 'cron', day_of_week='mon', hour=9, minute=0, id='weekly_summary')
    # Sunday 20:00 - weekly report
    scheduler.add_job(weekly_report, 'cron', day_of_week='sun', hour=20, minute=0, id='weekly_report')
    # Every minute - cleanup expired sessions
    scheduler.add_job(cleanup_sessions, 'cron', minute='*', id='cleanup_sessions')

    scheduler.start()
    print("Scheduler started")
