"""Calculul zonei de prioritate a unui proiect.

Functii pure (fara DB) folosite atat la serializare (API) cat si de scheduler.
Datetime-urile sunt naive UTC, consistent cu restul codebase-ului (datetime.utcnow()).

Zone (in ordinea urgentei):
  URGENT  — deadline peste cel mult 7 zile (include intarziat / negativ).
  MEDIUM  — deadline peste 8..14 zile (Curand).
  NORMAL  — deadline peste cel putin 15 zile (Planificat).
  BACKLOG — fara deadline si fara prioritate (Idei / In asteptare).

Cand nu exista deadline, zona vine din override-ul manual `priority`.
"""
from datetime import datetime

# Cele 4 constante valide pentru zona / override-ul manual de prioritate.
VALID_PRIORITIES = {"URGENT", "MEDIUM", "NORMAL", "BACKLOG"}


def days_remaining(deadline, now: datetime | None = None) -> int | None:
    """Numarul de zile (calendaristice) pana la deadline. None daca nu exista deadline.

    Negativ daca deadline-ul a trecut. Compara pe granularitate de zi (date()).
    """
    if deadline is None:
        return None
    now = now or datetime.utcnow()
    return (deadline.date() - now.date()).days


def compute_zone(deadline, priority, now: datetime | None = None) -> str:
    """Intoarce zona proiectului: "URGENT" | "MEDIUM" | "NORMAL" | "BACKLOG".

    - Daca exista deadline, zona vine din numarul de zile ramase.
    - Altfel, zona vine din override-ul manual `priority` (fallback BACKLOG).
    """
    now = now or datetime.utcnow()
    if deadline is not None:
        dr = (deadline.date() - now.date()).days
        if dr <= 7:
            return "URGENT"
        if dr <= 14:
            return "MEDIUM"
        return "NORMAL"

    if priority in VALID_PRIORITIES:
        return priority
    return "BACKLOG"


def resolve_zone(pinned_zone, deadline, manual_priority, now: datetime | None = None) -> str:
    """Zona efectiva: pin-ul manual invinge totul; altfel se calculeaza din deadline."""
    if pinned_zone in VALID_PRIORITIES:
        return pinned_zone
    return compute_zone(deadline, manual_priority, now)
