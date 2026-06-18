"""Service pentru "View Account" — linkuri publice read-only catre rapoarte.

Adminul/owner-ul genereaza un link cu un token unic. Oricine are linkul vede
rapoarte agregate (status proiecte, sprint performance, productivitate membri)
FARA login si fara permisiuni de edit.

Reguli:
  - create/list/revoke cer autentificare (user_id) si verificari de membership.
  - get_public_report NU primeste user_id: e calea publica. Foloseste DOAR
    query-uri self-contained (filtrate dupa created_by / project_id), niciodata
    functii care impun membership pe viewer.
  - Payload-ul public contine doar nume + numere agregate (zero date sensibile).
"""
import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.report_share import ReportShare
from app.models.sprint import Sprint
from app.models.task import Task
from app.models.user import User
from app.services import board_service, membership_service


# ── helpers ──────────────────────────────────────────────────────────

def _gen_token(db: Session) -> str:
    """Token unic (uuid4 hex, 32 caractere — incape in String(40))."""
    for _ in range(10):
        token = uuid.uuid4().hex
        if not db.query(ReportShare.id).filter(ReportShare.token == token).first():
            return token
    # Extrem de improbabil; ultimul fallback ramane unic prin lungime suplimentara.
    return (uuid.uuid4().hex + uuid.uuid4().hex)[:40]


def _share_to_dict(s: ReportShare) -> dict:
    return {
        "id": s.id,
        "token": s.token,
        "scope": s.scope,
        "projectId": s.project_id,
        "label": s.label,
        "isActive": s.is_active,
        "createdAt": s.created_at.isoformat() if s.created_at else None,
        "path": f"/view/{s.token}",
    }


# ── CRUD (authed) ────────────────────────────────────────────────────

def create_share(
    db: Session,
    user_id: str,
    scope: str,
    project_id: str | None = None,
    label: str | None = None,
) -> dict:
    scope = (scope or "team").strip().lower()
    if scope not in ("team", "project"):
        raise HTTPException(status_code=400, detail="Scope invalid (team sau project)")

    if scope == "project":
        if not project_id:
            raise HTTPException(status_code=400, detail="project_id este obligatoriu pentru scope project")
        # Doar ADMIN+ pe proiect poate genera un link public.
        membership_service.require_membership(db, project_id, user_id, min_role="ADMIN")
    else:
        project_id = None

    share = ReportShare(
        token=_gen_token(db),
        scope=scope,
        project_id=project_id,
        label=(label or "").strip()[:150] or None,
        created_by=user_id,
        is_active=True,
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return _share_to_dict(share)


def list_shares(db: Session, user_id: str) -> list[dict]:
    shares = (
        db.query(ReportShare)
        .filter(ReportShare.created_by == user_id, ReportShare.is_active == True)
        .order_by(ReportShare.created_at.desc())
        .all()
    )
    return [_share_to_dict(s) for s in shares]


def revoke_share(db: Session, user_id: str, share_id: str) -> dict:
    share = (
        db.query(ReportShare)
        .filter(ReportShare.id == share_id, ReportShare.created_by == user_id)
        .first()
    )
    if share is None:
        raise HTTPException(status_code=404, detail="Link inexistent")
    share.is_active = False
    db.commit()
    return {"id": share.id, "isActive": False}


# ── public report (NO auth, self-contained queries) ──────────────────

def _completed_sprint_reports(db: Session, project_id: str) -> list[dict]:
    """Rapoartele sprinturilor inchise (snapshot JSON stocat in sprint.report)."""
    sprints = (
        db.query(Sprint)
        .filter(Sprint.project_id == project_id, Sprint.status == "COMPLETED")
        .order_by(Sprint.closed_at.desc().nullslast(), Sprint.created_at.desc())
        .all()
    )
    out = []
    for s in sprints:
        out.append({
            "sprintId": s.id,
            "name": s.name,
            "goal": s.goal,
            "startDate": s.start_date.isoformat() if s.start_date else None,
            "endDate": s.end_date.isoformat() if s.end_date else None,
            "closedAt": s.closed_at.isoformat() if s.closed_at else None,
            "report": s.report,
        })
    return out


def _active_sprint_performance(db: Session, project_id: str) -> list[dict]:
    """Performanta sprinturilor active (calculata live, fara membership)."""
    sprints = (
        db.query(Sprint)
        .filter(Sprint.project_id == project_id, Sprint.status == "ACTIVE")
        .order_by(Sprint.created_at.asc())
        .all()
    )
    if not sprints:
        return []

    done_ids = board_service.done_column_ids(db, project_id)
    out = []
    for s in sprints:
        tasks = (
            db.query(Task)
            .filter(Task.sprint_id == s.id, Task.is_active == True)
            .all()
        )
        total_tasks = len(tasks)
        completed_tasks = sum(1 for t in tasks if t.board_column_id in done_ids)
        total_points = sum(t.story_points or 0 for t in tasks)
        completed_points = sum(
            (t.story_points or 0) for t in tasks if t.board_column_id in done_ids
        )
        out.append({
            "sprintId": s.id,
            "name": s.name,
            "goal": s.goal,
            "startDate": s.start_date.isoformat() if s.start_date else None,
            "endDate": s.end_date.isoformat() if s.end_date else None,
            "totalTasks": total_tasks,
            "completedTasks": completed_tasks,
            "completionPct": round(completed_tasks / total_tasks * 100) if total_tasks else 0,
            "totalPoints": total_points,
            "completedPoints": completed_points,
        })
    return out


def _aggregate_member_productivity(reports: list[dict]) -> list[dict]:
    """Agrega perMember[] din rapoartele de sprint inchise pe userId.

    Suma tasksDone / storyPointsDone / tasksPending peste toate sprinturile.
    """
    agg: dict[str, dict] = {}
    for r in reports:
        data = r.get("report") or {}
        for m in data.get("perMember", []) or []:
            uid = m.get("userId")
            if not uid:
                continue
            a = agg.setdefault(uid, {
                "userId": uid,
                "username": m.get("username"),
                "tasksDone": 0,
                "storyPointsDone": 0,
                "tasksPending": 0,
            })
            if not a["username"] and m.get("username"):
                a["username"] = m.get("username")
            a["tasksDone"] += m.get("tasksDone", 0) or 0
            a["storyPointsDone"] += m.get("storyPointsDone", 0) or 0
            a["tasksPending"] += m.get("tasksPending", 0) or 0
    out = list(agg.values())
    out.sort(key=lambda x: (-x["storyPointsDone"], -x["tasksDone"]))
    return out


def _project_payload(db: Session, project: Project) -> dict:
    """Rapoartele agregate pentru un singur proiect (read-only)."""
    completed = _completed_sprint_reports(db, project.id)
    active = _active_sprint_performance(db, project.id)
    members = _aggregate_member_productivity(completed)

    total_completed_tasks = sum(
        (r.get("report") or {}).get("completedTasks", 0) for r in completed
    )
    total_completed_points = sum(
        (r.get("report") or {}).get("completedPoints", 0) for r in completed
    )

    return {
        "id": project.id,
        "name": project.name,
        "status": project.status,
        "color": project.color,
        "completedSprintCount": len(completed),
        "activeSprintCount": len(active),
        "totalCompletedTasks": total_completed_tasks,
        "totalCompletedPoints": total_completed_points,
        "sprintReports": completed,
        "activeSprints": active,
        "memberProductivity": members,
    }


def get_public_report(db: Session, token: str) -> dict:
    """Construieste payload-ul public (read-only) pentru un token de share.

    404 daca tokenul lipseste sau e revocat. NU primeste user_id: calculam
    totul prin query-uri filtrate dupa share (project_id / created_by).
    """
    share = (
        db.query(ReportShare)
        .filter(ReportShare.token == token, ReportShare.is_active == True)
        .first()
    )
    if share is None:
        raise HTTPException(status_code=404, detail="Link inexistent sau dezactivat")

    if share.scope == "project":
        project = (
            db.query(Project)
            .filter(Project.id == share.project_id, Project.is_active == True)
            .first()
        )
        if project is None:
            raise HTTPException(status_code=404, detail="Proiect inexistent")
        proj = _project_payload(db, project)
        return {
            "scope": "project",
            "label": share.label,
            "generatedAt": _now_iso(),
            "projects": [proj],
            # Agregat pe toata "echipa" = un singur proiect aici.
            "teamMemberProductivity": proj["memberProductivity"],
        }

    # scope == "team": toate proiectele accesibile creatorului linkului.
    project_ids = (
        membership_service.get_accessible_project_ids(db, share.created_by)
        if share.created_by else []
    )
    projects: list[dict] = []
    if project_ids:
        rows = (
            db.query(Project)
            .filter(Project.id.in_(project_ids), Project.is_active == True)
            .order_by(Project.created_at.desc())
            .all()
        )
        projects = [_project_payload(db, p) for p in rows]

    # Productivitate agregata pe toata echipa (peste toate proiectele).
    all_reports: list[dict] = []
    for p in projects:
        all_reports.extend(p["sprintReports"])
    team_members = _aggregate_member_productivity(all_reports)

    return {
        "scope": "team",
        "label": share.label,
        "generatedAt": _now_iso(),
        "projects": projects,
        "teamMemberProductivity": team_members,
    }


def _now_iso() -> str:
    from datetime import datetime
    return datetime.utcnow().isoformat()
