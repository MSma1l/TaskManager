"""iCal (.ics) feed export API.

Doua endpoint-uri:
- `GET /api/ical/me/token` (autentificat) — intoarce / creeaza tokenul userului
  curent + URL-ul absolut al feed-ului, gata de copiat in aplicatia de calendar.
- `GET /api/ical/{token}.ics` (PUBLIC) — intoarce feed-ul `text/calendar` pentru
  userul care detine tokenul. 404 generic la token invalid (fara a divulga existenta).

Securitate: feed read-only (doar GET), token cu entropie mare (secrets.token_urlsafe),
404 generic la token gresit.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services import ical_service

router = APIRouter(prefix="/api/ical", tags=["ical"])


@router.get("/me/token")
async def get_my_ical_token(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Intoarce (sau creeaza) tokenul de feed iCal al userului curent + URL-ul."""
    token = ical_service.ensure_token(db, user)
    base = (settings.FRONTEND_URL or "").rstrip("/")
    feed_url = f"{base}/api/ical/{token}.ics"
    return {"token": token, "feedUrl": feed_url}


@router.get("/{token}.ics")
async def get_ical_feed(token: str, db: Session = Depends(get_db)):
    """Feed PUBLIC read-only. 404 generic daca tokenul nu corespunde niciunui user."""
    user = (
        db.query(User)
        .filter(
            User.calendar_token == token,
            User.is_active == True,  # noqa: E712
        )
        .first()
    )
    if not user or not token:
        raise HTTPException(status_code=404, detail="Not found")

    ics = ical_service.build_ics(db, user)
    return Response(
        content=ics,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": 'inline; filename="calendar.ics"',
            "Cache-Control": "no-cache",
        },
    )
