from datetime import datetime
from fastapi import APIRouter, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.core.security import verify_token
from app.models.task import Task
from app.models.reminder import ReminderLog

router = APIRouter(prefix="/api/notifications", tags=["notifications"])
security = HTTPBearer()


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
