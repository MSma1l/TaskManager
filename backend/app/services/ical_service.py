"""iCal (.ics) export service.

Genereaza un feed VCALENDAR read-only per user, ca utilizatorul sa-si aboneze
evenimentele din calendar in Google / Apple / Outlook. Feed-ul e protejat printr-un
token secret (`User.calendar_token`) cu entropie mare, nu prin auth Bearer — aplicatiile
de calendar nu trimit headere de autorizare cand fac fetch periodic.

Recurenta evenimentelor e expandata la query (vezi calendar_service), deci aici emitem
cate un VEVENT pentru fiecare ocurenta dintr-un orizont rezonabil (-30 .. +180 zile).
"""
from datetime import datetime, date, timedelta
import secrets

from sqlalchemy.orm import Session

from app.models.user import User
from app.models.calendar import CalendarEvent
from app.services.calendar_service import _occurrences_in_range


# Cat in trecut / viitor expandam recurentele in feed.
HORIZON_PAST_DAYS = 30
HORIZON_FUTURE_DAYS = 180


def ensure_token(db: Session, user: User) -> str:
    """Return the user's iCal feed token, generating one on first use.

    Tokenul e stabil intre apeluri — odata generat nu se schimba (decat la o rotatie
    explicita, neexpusa aici). Entropie mare via `secrets.token_urlsafe`.
    """
    if not user.calendar_token:
        # `merge` ataseaza userul la sesiunea activa chiar daca obiectul vine din
        # alta sesiune (ex. dependinta get_current_user), evitand conflicte de bind.
        attached = db.merge(user)
        attached.calendar_token = secrets.token_urlsafe(24)
        db.commit()
        db.refresh(attached)
        user.calendar_token = attached.calendar_token
    return user.calendar_token


def _escape_text(value: str) -> str:
    """Escape text conform RFC 5545: backslash, virgula, punct-virgula, newline."""
    if value is None:
        return ""
    return (
        value.replace("\\", "\\\\")
        .replace(",", "\\,")
        .replace(";", "\\;")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
        .replace("\r", "\\n")
    )


def _fold_line(line: str) -> str:
    """Fold long lines la 75 octeti conform RFC 5545 (continuare cu space)."""
    encoded = line.encode("utf-8")
    if len(encoded) <= 75:
        return line
    out = []
    chunk = b""
    for ch in line:
        cb = ch.encode("utf-8")
        # 74 ca sa lasam loc pentru spatiul de continuare la liniile urmatoare.
        limit = 75 if not out else 74
        if len(chunk) + len(cb) > limit:
            out.append(chunk.decode("utf-8"))
            chunk = cb
        else:
            chunk += cb
    if chunk:
        out.append(chunk.decode("utf-8"))
    return "\r\n ".join(out)


def _parse_hhmm(value: str) -> tuple[int, int]:
    try:
        h, m = (value or "00:00").split(":")[:2]
        return int(h), int(m)
    except (ValueError, AttributeError):
        return 0, 0


def _dt_value(d: date, hhmm: str) -> str:
    """Local floating date-time value: YYYYMMDDTHHMMSS (fara Z / TZID)."""
    h, m = _parse_hhmm(hhmm)
    return f"{d.strftime('%Y%m%d')}T{h:02d}{m:02d}00"


def _date_value(d: date) -> str:
    return d.strftime("%Y%m%d")


def build_ics(db: Session, user: User) -> str:
    """Build a valid VCALENDAR string with one VEVENT per event occurrence."""
    today = date.today()
    start_d = today - timedelta(days=HORIZON_PAST_DAYS)
    end_d = today + timedelta(days=HORIZON_FUTURE_DAYS)

    events = (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.user_id == user.id,
            CalendarEvent.is_deleted == False,  # noqa: E712
        )
        .order_by(CalendarEvent.event_date, CalendarEvent.start_time)
        .all()
    )

    dtstamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")

    lines: list[str] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//TaskManager//Calendar Export//RO",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_escape_text((user.full_name or user.username or 'Calendar'))}",
    ]

    for event in events:
        occurrences = _occurrences_in_range(event, start_d, end_d)
        for occ in occurrences:
            lines.extend(_build_vevent(event, occ, dtstamp))

    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold_line(ln) for ln in lines) + "\r\n"


def _build_vevent(event: CalendarEvent, occ: date, dtstamp: str) -> list[str]:
    # UID unic & stabil per ocurenta.
    uid = f"{event.id}-{occ.strftime('%Y%m%d')}@taskmanager"

    block: list[str] = ["BEGIN:VEVENT", f"UID:{uid}", f"DTSTAMP:{dtstamp}"]

    if event.is_all_day:
        end_occ = occ + timedelta(days=1)
        block.append(f"DTSTART;VALUE=DATE:{_date_value(occ)}")
        block.append(f"DTEND;VALUE=DATE:{_date_value(end_occ)}")
    else:
        block.append(f"DTSTART:{_dt_value(occ, event.start_time)}")
        # Daca end < start (date corupte), nu emite DTEND eronat.
        sh, sm = _parse_hhmm(event.start_time)
        eh, em = _parse_hhmm(event.end_time)
        if (eh, em) < (sh, sm):
            block.append(f"DTEND:{_dt_value(occ, event.start_time)}")
        else:
            block.append(f"DTEND:{_dt_value(occ, event.end_time)}")

    block.append(f"SUMMARY:{_escape_text(event.title or '')}")
    if event.description:
        block.append(f"DESCRIPTION:{_escape_text(event.description)}")
    if event.location:
        block.append(f"LOCATION:{_escape_text(event.location)}")

    status = (event.event_status or "CONFIRMED").upper()
    if status in ("CONFIRMED", "TENTATIVE", "CANCELLED"):
        block.append(f"STATUS:{status}")

    block.append("END:VEVENT")
    return block
