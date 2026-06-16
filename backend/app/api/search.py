"""Cautare globala (command palette Cmd-K).

Returneaza, pentru userul curent, rezultate din: proiecte accesibile, taskuri
personale + de board atribuite lui, si evenimente de calendar. Scoping strict pe
user — nu expune date care nu i-ar fi vizibile oricum.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.task import Task
from app.models.project import Project
from app.models.calendar import CalendarEvent
from app.services import membership_service

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("")
async def search(
    q: str = "",
    limit: int = 8,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    term = (q or "").strip()
    if len(term) < 2:
        return {"projects": [], "tasks": [], "events": []}

    like = f"%{term.lower()}%"
    accessible = membership_service.get_accessible_project_ids(db, user.id)

    # Proiecte accesibile care se potrivesc.
    projects = []
    if accessible:
        rows = (
            db.query(Project)
            .filter(
                Project.id.in_(accessible),
                Project.is_active == True,  # noqa: E712
                Project.name.ilike(like),
            )
            .limit(limit)
            .all()
        )
        projects = [
            {"id": p.id, "name": p.name, "key": p.key, "link": f"/projects/{p.id}"}
            for p in rows
        ]

    # Taskuri: personale (user_id == me) SAU de board atribuite mie.
    task_rows = (
        db.query(Task)
        .filter(
            Task.is_active == True,  # noqa: E712
            Task.title.ilike(like),
            or_(Task.user_id == user.id, Task.assignee_id == user.id),
        )
        .order_by(Task.updated_at.desc().nullslast())
        .limit(limit)
        .all()
    )
    tasks = []
    for t in task_rows:
        is_board = t.board_column_id is not None
        tasks.append({
            "id": t.id,
            "title": t.title,
            "isBoard": is_board,
            "link": f"/projects/{t.project_id}/board" if is_board and t.project_id else "/",
        })

    # Evenimente de calendar ale userului.
    event_rows = (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.user_id == user.id,
            CalendarEvent.is_deleted == False,  # noqa: E712
            CalendarEvent.title.ilike(like),
        )
        .order_by(CalendarEvent.event_date.desc())
        .limit(limit)
        .all()
    )
    events = [
        {
            "id": e.id,
            "title": e.title,
            "eventDate": e.event_date.isoformat() if e.event_date else None,
            "link": "/calendar",
        }
        for e in event_rows
    ]

    return {"projects": projects, "tasks": tasks, "events": events}
