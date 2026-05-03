from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.calendar import CalendarEvent
from app.schemas.calendar import (
    CalendarEventCreate,
    CalendarEventUpdate,
    EventCategoryCreate,
    EventCategoryUpdate,
)
from app.services import calendar_service

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


def _attendees_to_list(value):
    if not value:
        return []
    if isinstance(value, list):
        return value
    return []


def _event_to_dict(event: CalendarEvent, occurrence_date: date | None = None) -> dict:
    occ = occurrence_date or event.event_date
    is_recurring = bool(event.recurrence_rule and event.recurrence_rule != "NONE")
    return {
        "id": f"{event.id}::{occ.isoformat()}" if is_recurring and occ != event.event_date else event.id,
        "masterId": event.id,
        "title": event.title,
        "description": event.description,
        "color": event.color,
        "eventType": event.event_type,
        "location": event.location,
        "meetingUrl": event.meeting_url,
        "isAllDay": bool(event.is_all_day),
        "eventStatus": event.event_status,
        "recurrenceRule": event.recurrence_rule,
        "recurrenceUntil": event.recurrence_until.isoformat() if event.recurrence_until else None,
        "reminderMinutes": event.reminder_minutes or [],
        "attendees": _attendees_to_list(event.attendees),
        "categoryId": event.category_id,
        "eventDate": occ.isoformat(),
        "originalDate": event.event_date.isoformat() if event.event_date else None,
        "isRecurringInstance": is_recurring and occ != event.event_date,
        "startTime": event.start_time,
        "endTime": event.end_time,
        "createdAt": event.created_at.isoformat() if event.created_at else None,
        "updatedAt": event.updated_at.isoformat() if event.updated_at else None,
    }


def _cat_to_dict(cat) -> dict:
    return {
        "id": cat.id,
        "name": cat.name,
        "color": cat.color,
        "icon": cat.icon,
        "isVisible": bool(cat.is_visible),
        "isDefault": bool(cat.is_default),
        "sortOrder": cat.sort_order,
        "createdAt": cat.created_at.isoformat() if cat.created_at else None,
    }


def _build_create_kwargs(data: CalendarEventCreate) -> dict:
    return {
        "title": data.title,
        "description": data.description,
        "color": data.color,
        "event_type": data.eventType,
        "location": data.location,
        "meeting_url": data.meetingUrl,
        "is_all_day": data.isAllDay or False,
        "event_status": data.eventStatus or "CONFIRMED",
        "recurrence_rule": data.recurrenceRule,
        "recurrence_until": date.fromisoformat(data.recurrenceUntil) if data.recurrenceUntil else None,
        "reminder_minutes": data.reminderMinutes,
        "attendees": [a.model_dump() for a in (data.attendees or [])] if data.attendees else None,
        "category_id": data.categoryId,
        "event_date": date.fromisoformat(data.eventDate),
        "start_time": data.startTime,
        "end_time": data.endTime,
    }


def _build_update_kwargs(data: CalendarEventUpdate) -> dict:
    """Use exclude_unset so passing `null` actually clears nullable fields,
    while skipping fields the client didn't include at all."""
    sent = data.model_dump(exclude_unset=True)
    mapping = {
        "title": "title",
        "description": "description",
        "color": "color",
        "eventType": "event_type",
        "location": "location",
        "meetingUrl": "meeting_url",
        "isAllDay": "is_all_day",
        "eventStatus": "event_status",
        "recurrenceRule": "recurrence_rule",
        "reminderMinutes": "reminder_minutes",
        "categoryId": "category_id",
        "startTime": "start_time",
        "endTime": "end_time",
    }
    out: dict = {}
    for camel, snake in mapping.items():
        if camel in sent:
            value = sent[camel]
            # Empty string on nullable fields → None
            if snake in {"description", "location", "meeting_url", "recurrence_rule", "category_id"}:
                value = value or None
            out[snake] = value
    if "eventDate" in sent and sent["eventDate"]:
        out["event_date"] = date.fromisoformat(sent["eventDate"])
    if "recurrenceUntil" in sent:
        v = sent["recurrenceUntil"]
        out["recurrence_until"] = date.fromisoformat(v) if v else None
    if "attendees" in sent:
        out["attendees"] = sent["attendees"] or None
    return out


# ── Events ───────────────────────────────────────────────────────────────────

@router.get("/events")
async def get_events(
    start: str = None,
    end: str = None,
    date_param: str = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Range query expands recurring events into virtual instances."""
    if date_param:
        target = date.fromisoformat(date_param)
        instances = calendar_service.get_events_for_date(db, user.id, target)
    elif start and end:
        start_d = date.fromisoformat(start)
        end_d = date.fromisoformat(end)
        instances = calendar_service.get_events_for_range(db, user.id, start_d, end_d)
    else:
        today = date.today()
        start_d = today - timedelta(days=today.weekday())
        end_d = start_d + timedelta(days=6)
        instances = calendar_service.get_events_for_range(db, user.id, start_d, end_d)

    return [_event_to_dict(event, occ) for event, occ in instances]


@router.post("/events")
async def create_event(
    data: CalendarEventCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = calendar_service.create_event(db, user.id, **_build_create_kwargs(data))
    if not event:
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    return _event_to_dict(event)


@router.put("/events/{event_id}")
async def update_event(
    event_id: str,
    data: CalendarEventUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Strip virtual-instance suffix if present
    master_id = event_id.split("::", 1)[0]
    event = calendar_service.update_event(db, user.id, master_id, **_build_update_kwargs(data))
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return _event_to_dict(event)


@router.delete("/events/{event_id}")
async def delete_event(
    event_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    master_id = event_id.split("::", 1)[0]
    success = calendar_service.delete_event(db, user.id, master_id)
    if not success:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"message": "Event deleted"}


# ── Event categories ─────────────────────────────────────────────────────────

@router.get("/categories")
async def list_categories(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    calendar_service.ensure_default_categories(db, user.id)
    return [_cat_to_dict(c) for c in calendar_service.list_categories(db, user.id)]


@router.post("/categories")
async def create_category(
    data: EventCategoryCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cat = calendar_service.create_category(
        db, user.id, data.name, data.color or "#3b82f6", data.icon, data.isVisible if data.isVisible is not None else True
    )
    if not cat:
        raise HTTPException(status_code=400, detail="Numele categoriei nu poate fi gol")
    return _cat_to_dict(cat)


@router.put("/categories/{cat_id}")
async def update_category(
    cat_id: str,
    data: EventCategoryUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cat = calendar_service.update_category(
        db, user.id, cat_id,
        name=data.name, color=data.color, icon=data.icon, is_visible=data.isVisible,
    )
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    return _cat_to_dict(cat)


@router.delete("/categories/{cat_id}")
async def delete_category(
    cat_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    success = calendar_service.delete_category(db, user.id, cat_id)
    if not success:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"ok": True}
