from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.core.security import verify_token, get_current_user
from app.models.task import Task
from app.models.reminder import ReminderLog
from app.models.calendar import CalendarEvent, CalendarReminderLog
from app.models.user import User
from app.services import calendar_service, notification_service

router = APIRouter(prefix="/api/notifications", tags=["notifications"])
security = HTTPBearer()


# ── Persisted in-app notifications (centru de notificari) ────────────────────

@router.get("")
async def list_notifications(
    unread: bool = False,
    limit: int = 50,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = notification_service.list_for_user(db, user.id, only_unread=unread, limit=limit)
    return [notification_service.to_dict(n) for n in items]


@router.get("/unread-count")
async def notifications_unread_count(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return {"count": notification_service.unread_count(db, user.id)}


@router.post("/read-all")
async def notifications_read_all(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return {"updated": notification_service.mark_all_read(db, user.id)}


@router.post("/{notification_id}/read")
async def notification_mark_read(
    notification_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    n = notification_service.mark_read(db, user.id, notification_id)
    if not n:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Notificare inexistenta")
    return notification_service.to_dict(n)


@router.get("/pending")
async def get_pending_notifications(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    """Return tasks with reminders due now that haven't been sent via web channel yet."""
    await verify_token(credentials)

    now = datetime.utcnow()
    current_time = now.strftime("%H:%M")
    day_of_week = now.isoweekday()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

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

    notifications = []
    for task in tasks:
        # Check if already sent via web today
        existing = (
            db.query(ReminderLog)
            .filter(
                ReminderLog.task_id == task.id,
                ReminderLog.sent_at >= today_start,
                ReminderLog.channel == "web",
            )
            .first()
        )
        if existing:
            continue

        # Mark as sent
        log = ReminderLog(task_id=task.id, channel="web")
        db.add(log)

        notifications.append({
            "id": task.id,
            "title": task.title,
            "description": task.description,
            "category": task.category.name if task.category else None,
            "categoryIcon": task.category.icon if task.category else None,
            "priority": task.priority,
            "reminderTime": task.reminder_time,
        })

    if notifications:
        db.commit()

    return notifications


EVENT_LABELS = {
    "meeting_online": "Sedinta online",
    "meeting_in_person": "Sedinta",
    "appointment": "Programare",
    "reminder": "Reminder",
    "personal": "Eveniment",
    "task": "Task",
}


@router.get("/calendar-pending")
async def get_pending_calendar_notifications(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return calendar-event reminders that should fire right now for THIS user.

    Behavior mirrors the Telegram scheduler but the channel is "web". Each (event, occurrence,
    offset) gets logged so the browser only pops it once.
    """
    settings_dict = user.notification_settings or {}
    if settings_dict.get("web") is False:
        return []

    now = datetime.utcnow()
    today = now.date()
    horizon = today + timedelta(days=7)

    masters = (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.user_id == user.id,
            CalendarEvent.is_deleted == False,
            CalendarEvent.event_status != "CANCELLED",
            CalendarEvent.event_date <= horizon,
        )
        .all()
    )

    out = []
    for event in masters:
        offsets = event.reminder_minutes or []
        if not offsets:
            continue

        for occ in calendar_service._occurrences_in_range(event, today, horizon):
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
                # Allow a ±60s window so a poll that lands a bit late still picks it up
                delta = (fire_at - now).total_seconds()
                if abs(delta) > 60:
                    continue

                already = (
                    db.query(CalendarReminderLog)
                    .filter(
                        CalendarReminderLog.event_id == event.id,
                        CalendarReminderLog.occurrence_date == occ,
                        CalendarReminderLog.minutes_before == str(offset),
                        CalendarReminderLog.channel == "web",
                    )
                    .first()
                )
                if already:
                    continue

                out.append({
                    "id": f"{event.id}::{occ.isoformat()}::{offset}",
                    "title": event.title,
                    "type": event.event_type,
                    "typeLabel": EVENT_LABELS.get(event.event_type or "personal", "Eveniment"),
                    "occurrenceDate": occ.isoformat(),
                    "startTime": event.start_time,
                    "endTime": event.end_time,
                    "minutesBefore": offset,
                    "location": event.location,
                    "meetingUrl": event.meeting_url,
                    "description": event.description,
                    "color": event.color,
                })

                db.add(CalendarReminderLog(
                    event_id=event.id,
                    occurrence_date=occ,
                    minutes_before=str(offset),
                    channel="web",
                ))

    if out:
        db.commit()
    return out
