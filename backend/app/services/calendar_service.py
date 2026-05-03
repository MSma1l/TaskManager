from datetime import datetime, date, timedelta
from typing import Optional, List
from sqlalchemy.orm import Session

from app.models.calendar import CalendarEvent, EventCategory


# ── Categories ───────────────────────────────────────────────────────────────

DEFAULT_CATEGORIES = [
    {"name": "Munca", "color": "#3b82f6", "icon": "💼", "is_default": True},
    {"name": "Personal", "color": "#a855f7", "icon": "🏠", "is_default": False},
    {"name": "Familie", "color": "#22c55e", "icon": "👨‍👩‍👧", "is_default": False},
    {"name": "Sanatate", "color": "#ef4444", "icon": "❤️", "is_default": False},
    {"name": "Important", "color": "#f97316", "icon": "⭐", "is_default": False},
]


def ensure_default_categories(db: Session, user_id: str) -> None:
    """Create the standard category set for a user the first time they hit the calendar."""
    has_any = db.query(EventCategory).filter(EventCategory.user_id == user_id).first()
    if has_any:
        return
    for idx, cat in enumerate(DEFAULT_CATEGORIES):
        db.add(EventCategory(
            user_id=user_id,
            name=cat["name"],
            color=cat["color"],
            icon=cat["icon"],
            is_default=cat["is_default"],
            sort_order=str(idx),
        ))
    db.commit()


def list_categories(db: Session, user_id: str) -> List[EventCategory]:
    return (
        db.query(EventCategory)
        .filter(EventCategory.user_id == user_id)
        .order_by(EventCategory.sort_order.asc(), EventCategory.created_at.asc())
        .all()
    )


def create_category(db: Session, user_id: str, name: str, color: str, icon: Optional[str], is_visible: bool = True):
    name = (name or "").strip()[:80]
    if not name:
        return None
    cat = EventCategory(
        user_id=user_id,
        name=name,
        color=color or "#3b82f6",
        icon=icon,
        is_visible=is_visible,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


def update_category(db: Session, user_id: str, cat_id: str, **fields):
    cat = db.query(EventCategory).filter(EventCategory.id == cat_id, EventCategory.user_id == user_id).first()
    if not cat:
        return None
    for key, value in fields.items():
        if value is not None and hasattr(cat, key):
            setattr(cat, key, value)
    cat.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(cat)
    return cat


def delete_category(db: Session, user_id: str, cat_id: str) -> bool:
    cat = db.query(EventCategory).filter(EventCategory.id == cat_id, EventCategory.user_id == user_id).first()
    if not cat:
        return False
    # Detach events from this category instead of deleting them
    db.query(CalendarEvent).filter(
        CalendarEvent.user_id == user_id, CalendarEvent.category_id == cat_id
    ).update({"category_id": None})
    db.delete(cat)
    db.commit()
    return True


# ── Events ───────────────────────────────────────────────────────────────────

def _occurrences_in_range(event: CalendarEvent, start_d: date, end_d: date) -> List[date]:
    """Expand a recurring master into actual dates that fall in [start_d, end_d]."""
    rule = (event.recurrence_rule or "").upper()
    if not rule or rule == "NONE":
        return [event.event_date] if start_d <= event.event_date <= end_d else []

    until = event.recurrence_until or end_d
    until = min(until, end_d)
    if event.event_date > until:
        return []

    out: List[date] = []
    current = event.event_date
    safety = 0
    while current <= until and safety < 800:
        if current >= start_d:
            out.append(current)
        if rule == "DAILY":
            current = current + timedelta(days=1)
        elif rule == "WEEKLY":
            current = current + timedelta(days=7)
        elif rule == "MONTHLY":
            year = current.year + (current.month // 12)
            month = (current.month % 12) + 1
            day = min(current.day, _days_in_month(year, month))
            current = date(year, month, day)
        elif rule == "YEARLY":
            try:
                current = current.replace(year=current.year + 1)
            except ValueError:
                # Feb 29 → Feb 28
                current = date(current.year + 1, current.month, 28)
        else:
            break
        safety += 1
    return out


def _days_in_month(year: int, month: int) -> int:
    if month == 12:
        return 31
    return (date(year, month + 1, 1) - date(year, month, 1)).days


def get_events_for_range(db: Session, user_id: str, start_date: date, end_date: date):
    """Return master events whose recurrence touches [start_date, end_date]."""
    masters = (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.user_id == user_id,
            CalendarEvent.is_deleted == False,
            CalendarEvent.event_date <= end_date,
        )
        .order_by(CalendarEvent.event_date, CalendarEvent.start_time)
        .all()
    )

    instances = []
    for m in masters:
        # Filter at python level so we can also keep recurrence-aware filtering
        if not m.recurrence_rule or m.recurrence_rule == "NONE":
            if start_date <= m.event_date <= end_date:
                instances.append((m, m.event_date))
            continue
        for occ in _occurrences_in_range(m, start_date, end_date):
            instances.append((m, occ))
    return instances


def get_events_for_date(db: Session, user_id: str, target_date: date):
    return get_events_for_range(db, user_id, target_date, target_date)


def get_event(db: Session, user_id: str, event_id: str) -> Optional[CalendarEvent]:
    return (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.id == event_id,
            CalendarEvent.user_id == user_id,
            CalendarEvent.is_deleted == False,
        )
        .first()
    )


def create_event(db: Session, user_id: str, **fields) -> Optional[CalendarEvent]:
    title = (fields.get("title") or "").strip()[:200]
    if not title:
        return None

    event = CalendarEvent(
        user_id=user_id,
        title=title,
        description=(fields.get("description") or None),
        color=fields.get("color") or "#3b82f6",
        event_type=fields.get("event_type") or "personal",
        location=fields.get("location") or None,
        meeting_url=fields.get("meeting_url") or None,
        is_all_day=bool(fields.get("is_all_day", False)),
        event_status=fields.get("event_status") or "CONFIRMED",
        recurrence_rule=fields.get("recurrence_rule") or None,
        recurrence_until=fields.get("recurrence_until"),
        reminder_minutes=fields.get("reminder_minutes"),
        attendees=fields.get("attendees"),
        category_id=fields.get("category_id") or None,
        event_date=fields["event_date"],
        start_time=fields["start_time"],
        end_time=fields["end_time"],
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def update_event(db: Session, user_id: str, event_id: str, **fields):
    event = get_event(db, user_id, event_id)
    if not event:
        return None
    # Fields where None is a meaningful "clear" value (nullable columns)
    nullable = {
        "description", "location", "meeting_url",
        "recurrence_rule", "recurrence_until",
        "reminder_minutes", "attendees", "category_id",
    }
    # Non-nullable fields — None means "don't touch"
    non_nullable = {
        "title", "color", "event_type", "is_all_day", "event_status",
        "event_date", "start_time", "end_time",
    }
    for key, value in fields.items():
        if key in non_nullable:
            if value is None:
                continue
            if key == "title":
                value = value.strip()[:200] if value else value
            setattr(event, key, value)
        elif key in nullable:
            # Pass-through; None clears the field
            setattr(event, key, value)
    event.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(event)
    return event


def delete_event(db: Session, user_id: str, event_id: str) -> bool:
    event = get_event(db, user_id, event_id)
    if not event:
        return False
    event.is_deleted = True
    event.updated_at = datetime.utcnow()
    db.commit()
    return True
