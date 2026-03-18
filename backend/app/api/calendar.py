from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import verify_token
from app.core.config import settings
from app.schemas.calendar import CalendarEventCreate, CalendarEventUpdate
from app.services import calendar_service

router = APIRouter(prefix="/api/calendar", tags=["calendar"])
security = HTTPBearer()


def _get_user_id():
    return settings.TELEGRAM_CHAT_ID


def _event_to_dict(event):
    return {
        "id": event.id,
        "title": event.title,
        "description": event.description,
        "color": event.color,
        "eventDate": event.event_date.isoformat() if event.event_date else None,
        "startTime": event.start_time,
        "endTime": event.end_time,
        "createdAt": event.created_at.isoformat() if event.created_at else None,
        "updatedAt": event.updated_at.isoformat() if event.updated_at else None,
    }


@router.get("/events")
async def get_events(
    start: str = None,
    end: str = None,
    date_param: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    """Get events for a date range or a specific date.
    Query params: ?start=2026-03-16&end=2026-03-22 or ?date=2026-03-18
    """
    await verify_token(credentials)
    user_id = _get_user_id()

    if date_param:
        target = date.fromisoformat(date_param)
        events = calendar_service.get_events_for_date(db, user_id, target)
    elif start and end:
        start_d = date.fromisoformat(start)
        end_d = date.fromisoformat(end)
        events = calendar_service.get_events_for_range(db, user_id, start_d, end_d)
    else:
        # Default: current week (Mon-Sun)
        today = date.today()
        weekday = today.weekday()
        start_d = today.replace(day=today.day - weekday)
        from datetime import timedelta
        end_d = start_d + timedelta(days=6)
        events = calendar_service.get_events_for_range(db, user_id, start_d, end_d)

    return [_event_to_dict(e) for e in events]


@router.post("/events")
async def create_event(
    data: CalendarEventCreate,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    user_id = _get_user_id()
    event_date = date.fromisoformat(data.eventDate)
    event = calendar_service.create_event(
        db, user_id, data.title, event_date,
        data.startTime, data.endTime, data.description, data.color
    )
    if not event:
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    return _event_to_dict(event)


@router.put("/events/{event_id}")
async def update_event(
    event_id: str,
    data: CalendarEventUpdate,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    user_id = _get_user_id()
    event_date = date.fromisoformat(data.eventDate) if data.eventDate else None
    event = calendar_service.update_event(
        db, user_id, event_id,
        title=data.title,
        description=data.description,
        color=data.color,
        event_date=event_date,
        start_time=data.startTime,
        end_time=data.endTime,
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return _event_to_dict(event)


@router.delete("/events/{event_id}")
async def delete_event(
    event_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    user_id = _get_user_id()
    success = calendar_service.delete_event(db, user_id, event_id)
    if not success:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"message": "Event deleted"}
