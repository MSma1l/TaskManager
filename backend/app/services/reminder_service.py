import asyncio
from datetime import datetime, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.task import Task
from app.models.completion import TaskCompletion
from app.models.reminder import ReminderLog
from app.models.session import TelegramSession
from app.models.base import TaskStatus
from app.services import task_service, stats_service

scheduler = AsyncIOScheduler()

DAYS_RO = ["Luni", "Marti", "Miercuri", "Joi", "Vineri", "Sambata", "Duminica"]


async def _send_telegram(text: str):
    from app.telegram.bot import send_message
    try:
        await send_message(text)
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
    # Every minute - check reminders
    scheduler.add_job(check_reminders, 'cron', minute='*', id='check_reminders')
    # Monday 09:00 - weekly summary
    scheduler.add_job(weekly_summary, 'cron', day_of_week='mon', hour=9, minute=0, id='weekly_summary')
    # Sunday 20:00 - weekly report
    scheduler.add_job(weekly_report, 'cron', day_of_week='sun', hour=20, minute=0, id='weekly_report')
    # Every minute - cleanup expired sessions
    scheduler.add_job(cleanup_sessions, 'cron', minute='*', id='cleanup_sessions')

    scheduler.start()
    print("Scheduler started")
