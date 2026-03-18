from datetime import datetime, date
from sqlalchemy.orm import Session
from app.models.calendar import CalendarEvent


def get_events_for_range(db: Session, user_id: str, start_date: date, end_date: date):
    return (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.user_id == user_id,
            CalendarEvent.is_deleted == False,
            CalendarEvent.event_date >= start_date,
            CalendarEvent.event_date <= end_date,
        )
        .order_by(CalendarEvent.event_date, CalendarEvent.start_time)
        .all()
    )


def get_events_for_date(db: Session, user_id: str, target_date: date):
    return (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.user_id == user_id,
            CalendarEvent.is_deleted == False,
            CalendarEvent.event_date == target_date,
        )
        .order_by(CalendarEvent.start_time)
        .all()
    )


def create_event(db: Session, user_id: str, title: str, event_date: date,
                  start_time: str, end_time: str, description: str = None, color: str = "#3b82f6"):
    title = title.strip()[:200]
    if not title:
        return None

    event = CalendarEvent(
        user_id=user_id,
        title=title,
        description=description.strip()[:2000] if description else None,
        color=color,
        event_date=event_date,
        start_time=start_time,
        end_time=end_time,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def update_event(db: Session, user_id: str, event_id: str,
                 title: str = None, description: str = None, color: str = None,
                 event_date: date = None, start_time: str = None, end_time: str = None):
    event = db.query(CalendarEvent).filter(
        CalendarEvent.id == event_id,
        CalendarEvent.user_id == user_id,
        CalendarEvent.is_deleted == False,
    ).first()
    if not event:
        return None

    if title is not None:
        event.title = title.strip()[:200]
    if description is not None:
        event.description = description.strip()[:2000] if description else None
    if color is not None:
        event.color = color
    if event_date is not None:
        event.event_date = event_date
    if start_time is not None:
        event.start_time = start_time
    if end_time is not None:
        event.end_time = end_time

    event.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(event)
    return event


def delete_event(db: Session, user_id: str, event_id: str):
    event = db.query(CalendarEvent).filter(
        CalendarEvent.id == event_id,
        CalendarEvent.user_id == user_id,
        CalendarEvent.is_deleted == False,
    ).first()
    if not event:
        return False
    event.is_deleted = True
    event.updated_at = datetime.utcnow()
    db.commit()
    return True
