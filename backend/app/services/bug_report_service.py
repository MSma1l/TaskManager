"""Serviciu pentru modulul QA / Bug Report (rapoarte de testare per proiect).

Fiecare raport (`BugReport`) apartine unui proiect si trece prin
`membership_service` pentru permisiuni:
- VIEWER pentru citire (list/get),
- MEMBER pentru creare / comentarii / atasamente,
- creator-sau-ADMIN pentru editare / stergere.

Forma JSON expusa catre frontend foloseste chei camelCase, exact ca
`sprint_service` / `collaboration_service`. Notificarile in-app sunt
best-effort (`notification_service.create_safe` nu arunca niciodata).
"""
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.base import generate_cuid
from app.models.bug_report import BugReport, BugReportAttachment, BugReportComment
from app.models.project_member import ProjectMember
from app.models.user import User
from app.services import membership_service, notification_service


VALID_STATUSES = {"OPEN", "IN_PROGRESS", "PASSED", "FAILED"}
VALID_SEVERITIES = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
VALID_STEP_RESULTS = {"pass", "fail", None}


# ── helpers interne ──────────────────────────────────────────────────

def _user_map(db: Session, user_ids) -> dict:
    ids = {uid for uid in user_ids if uid}
    if not ids:
        return {}
    rows = db.query(User).filter(User.id.in_(ids)).all()
    return {u.id: u for u in rows}


def _get_report(db: Session, project_id: str, report_id: str) -> BugReport:
    """Incarca raportul si verifica apartenenta la proiect (404 altfel)."""
    report = (
        db.query(BugReport)
        .filter(
            BugReport.id == report_id,
            BugReport.project_id == project_id,
            BugReport.is_active == True,  # noqa: E712
        )
        .first()
    )
    if report is None:
        raise HTTPException(status_code=404, detail="Raport inexistent")
    return report


def _is_admin(member: ProjectMember) -> bool:
    return membership_service.ROLE_RANK.get(member.role, -1) >= membership_service.ROLE_RANK["ADMIN"]


def _normalize_steps(steps) -> list | None:
    """Normalizeaza checklist-ul de pasi: fiecare pas primeste id/text/done/result."""
    if steps is None:
        return None
    if not isinstance(steps, list):
        raise HTTPException(status_code=400, detail="Pasii trebuie sa fie o lista")
    out = []
    for raw in steps:
        if isinstance(raw, dict):
            text = (raw.get("text") or "").strip()
            step_id = raw.get("id") or generate_cuid()
            done = bool(raw.get("done", False))
            result = raw.get("result")
        else:
            text = str(raw).strip()
            step_id = generate_cuid()
            done = False
            result = None
        if result not in VALID_STEP_RESULTS:
            raise HTTPException(status_code=400, detail="Rezultat pas invalid")
        out.append({"id": step_id, "text": text, "done": done, "result": result})
    return out


def _steps_summary(steps) -> dict:
    if not steps or not isinstance(steps, list):
        return {"doneCount": 0, "total": 0}
    total = len(steps)
    done = sum(1 for s in steps if isinstance(s, dict) and s.get("done"))
    return {"doneCount": done, "total": total}


# ── serializare ──────────────────────────────────────────────────────

def _attachment_to_dict(att: BugReportAttachment) -> dict:
    return {
        "id": att.id,
        "imageData": att.image_data,
        "caption": att.caption,
        "createdBy": att.created_by,
        "createdAt": att.created_at.isoformat() if att.created_at else None,
    }


def _comment_to_dict(comment: BugReportComment, user: User | None) -> dict:
    return {
        "id": comment.id,
        "userId": comment.user_id,
        "username": user.username if user else None,
        "fullName": user.full_name if user else None,
        "body": comment.body,
        "createdAt": comment.created_at.isoformat() if comment.created_at else None,
    }


def _report_summary_dict(
    db: Session,
    report: BugReport,
    users: dict,
    attachment_count: int,
    comment_count: int,
) -> dict:
    """Forma "usoara" pentru listare (fara description/steps/attachments/comments)."""
    creator = users.get(report.created_by)
    assignee = users.get(report.assignee_id)
    return {
        "id": report.id,
        "projectId": report.project_id,
        "title": report.title,
        "status": report.status,
        "severity": report.severity,
        "stepsSummary": _steps_summary(report.steps),
        "attachmentCount": attachment_count,
        "commentCount": comment_count,
        "createdBy": report.created_by,
        "createdByUsername": creator.username if creator else None,
        "assigneeId": report.assignee_id,
        "assigneeUsername": assignee.username if assignee else None,
        "createdAt": report.created_at.isoformat() if report.created_at else None,
        "updatedAt": report.updated_at.isoformat() if report.updated_at else None,
    }


def _report_full_dict(db: Session, report: BugReport) -> dict:
    attachments = (
        db.query(BugReportAttachment)
        .filter(BugReportAttachment.bug_report_id == report.id)
        .order_by(BugReportAttachment.created_at.asc())
        .all()
    )
    comments = (
        db.query(BugReportComment)
        .filter(BugReportComment.bug_report_id == report.id)
        .order_by(BugReportComment.created_at.asc())
        .all()
    )
    users = _user_map(
        db,
        [report.created_by, report.assignee_id]
        + [c.user_id for c in comments],
    )
    creator = users.get(report.created_by)
    assignee = users.get(report.assignee_id)
    return {
        "id": report.id,
        "projectId": report.project_id,
        "title": report.title,
        "description": report.description,
        "status": report.status,
        "severity": report.severity,
        "steps": report.steps or [],
        "stepsSummary": _steps_summary(report.steps),
        "createdBy": report.created_by,
        "createdByUsername": creator.username if creator else None,
        "assigneeId": report.assignee_id,
        "assigneeUsername": assignee.username if assignee else None,
        "attachments": [_attachment_to_dict(a) for a in attachments],
        "comments": [_comment_to_dict(c, users.get(c.user_id)) for c in comments],
        "createdAt": report.created_at.isoformat() if report.created_at else None,
        "updatedAt": report.updated_at.isoformat() if report.updated_at else None,
    }


# ── read ─────────────────────────────────────────────────────────────

def list_reports(db: Session, user_id: str, project_id: str, status: str | None = None) -> list[dict]:
    membership_service.require_membership(db, project_id, user_id, min_role="VIEWER")

    q = db.query(BugReport).filter(
        BugReport.project_id == project_id,
        BugReport.is_active == True,  # noqa: E712
    )
    if status:
        if status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail="Status invalid")
        q = q.filter(BugReport.status == status)
    reports = q.order_by(BugReport.created_at.desc()).all()

    if not reports:
        return []

    report_ids = [r.id for r in reports]
    users = _user_map(db, [r.created_by for r in reports] + [r.assignee_id for r in reports])

    # Counts atasamente / comentarii intr-un numar fix de query-uri (evita N+1).
    att_counts: dict[str, int] = {}
    for att in db.query(BugReportAttachment.bug_report_id).filter(
        BugReportAttachment.bug_report_id.in_(report_ids)
    ).all():
        att_counts[att[0]] = att_counts.get(att[0], 0) + 1

    com_counts: dict[str, int] = {}
    for com in db.query(BugReportComment.bug_report_id).filter(
        BugReportComment.bug_report_id.in_(report_ids)
    ).all():
        com_counts[com[0]] = com_counts.get(com[0], 0) + 1

    return [
        _report_summary_dict(
            db, r, users, att_counts.get(r.id, 0), com_counts.get(r.id, 0)
        )
        for r in reports
    ]


def get_report(db: Session, user_id: str, project_id: str, report_id: str) -> dict:
    membership_service.require_membership(db, project_id, user_id, min_role="VIEWER")
    report = _get_report(db, project_id, report_id)
    return _report_full_dict(db, report)


# ── write (CRUD) ─────────────────────────────────────────────────────

def create_report(db: Session, user_id: str, project_id: str, data: dict) -> dict:
    membership_service.require_membership(db, project_id, user_id, min_role="MEMBER")

    title = (data.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Titlul raportului este obligatoriu")

    status = data.get("status") or "OPEN"
    if status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Status invalid")

    severity = data.get("severity") or "MEDIUM"
    if severity not in VALID_SEVERITIES:
        raise HTTPException(status_code=400, detail="Severitate invalida")

    steps = _normalize_steps(data.get("steps"))
    assignee_id = data.get("assigneeId")

    now = datetime.utcnow()
    report = BugReport(
        project_id=project_id,
        title=title,
        description=data.get("description"),
        status=status,
        severity=severity,
        steps=steps,
        created_by=user_id,
        assignee_id=assignee_id,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    _notify_new_report(db, report, user_id)
    if assignee_id and assignee_id != user_id:
        _notify_assignment(db, report, assignee_id)

    return _report_full_dict(db, report)


def update_report(db: Session, user_id: str, project_id: str, report_id: str, data: dict) -> dict:
    member = membership_service.require_membership(db, project_id, user_id, min_role="VIEWER")
    report = _get_report(db, project_id, report_id)

    if not (report.created_by == user_id or _is_admin(member)):
        raise HTTPException(
            status_code=403,
            detail="Doar autorul sau un administrator poate edita raportul",
        )

    if data.get("title") is not None:
        title = data["title"].strip()
        if not title:
            raise HTTPException(status_code=400, detail="Titlul raportului este obligatoriu")
        report.title = title
    if "description" in data:
        report.description = data["description"]
    if data.get("status") is not None:
        if data["status"] not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail="Status invalid")
        report.status = data["status"]
    if data.get("severity") is not None:
        if data["severity"] not in VALID_SEVERITIES:
            raise HTTPException(status_code=400, detail="Severitate invalida")
        report.severity = data["severity"]
    if "steps" in data:
        report.steps = _normalize_steps(data["steps"])

    prev_assignee = report.assignee_id
    if "assigneeId" in data:
        report.assignee_id = data["assigneeId"]

    report.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(report)

    new_assignee = report.assignee_id
    if new_assignee and new_assignee != prev_assignee and new_assignee != user_id:
        _notify_assignment(db, report, new_assignee)

    return _report_full_dict(db, report)


def delete_report(db: Session, user_id: str, project_id: str, report_id: str) -> None:
    member = membership_service.require_membership(db, project_id, user_id, min_role="VIEWER")
    report = _get_report(db, project_id, report_id)

    if not (report.created_by == user_id or _is_admin(member)):
        raise HTTPException(
            status_code=403,
            detail="Doar autorul sau un administrator poate sterge raportul",
        )

    report.is_active = False
    report.updated_at = datetime.utcnow()
    db.commit()


# ── atasamente ───────────────────────────────────────────────────────

def add_attachment(db: Session, user_id: str, project_id: str, report_id: str, data: dict) -> dict:
    membership_service.require_membership(db, project_id, user_id, min_role="MEMBER")
    _get_report(db, project_id, report_id)

    image_data = (data.get("imageData") or "").strip()
    if not image_data:
        raise HTTPException(status_code=400, detail="Imaginea este obligatorie")

    att = BugReportAttachment(
        bug_report_id=report_id,
        image_data=image_data,
        caption=data.get("caption"),
        created_by=user_id,
        created_at=datetime.utcnow(),
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    return _attachment_to_dict(att)


def delete_attachment(
    db: Session, user_id: str, project_id: str, report_id: str, attachment_id: str
) -> None:
    member = membership_service.require_membership(db, project_id, user_id, min_role="MEMBER")
    _get_report(db, project_id, report_id)

    att = (
        db.query(BugReportAttachment)
        .filter(
            BugReportAttachment.id == attachment_id,
            BugReportAttachment.bug_report_id == report_id,
        )
        .first()
    )
    if att is None:
        raise HTTPException(status_code=404, detail="Atasament inexistent")

    if not (att.created_by == user_id or _is_admin(member)):
        raise HTTPException(
            status_code=403,
            detail="Doar autorul sau un administrator poate sterge atasamentul",
        )

    db.delete(att)
    db.commit()


# ── comentarii ───────────────────────────────────────────────────────

def add_comment(db: Session, user_id: str, project_id: str, report_id: str, body: str) -> dict:
    membership_service.require_membership(db, project_id, user_id, min_role="MEMBER")
    _get_report(db, project_id, report_id)

    body = (body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Comentariul nu poate fi gol")

    comment = BugReportComment(
        bug_report_id=report_id,
        user_id=user_id,
        body=body,
        created_at=datetime.utcnow(),
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    author = db.query(User).filter(User.id == user_id).first()
    return _comment_to_dict(comment, author)


def delete_comment(
    db: Session, user_id: str, project_id: str, report_id: str, comment_id: str
) -> None:
    member = membership_service.require_membership(db, project_id, user_id, min_role="VIEWER")
    _get_report(db, project_id, report_id)

    comment = (
        db.query(BugReportComment)
        .filter(
            BugReportComment.id == comment_id,
            BugReportComment.bug_report_id == report_id,
        )
        .first()
    )
    if comment is None:
        raise HTTPException(status_code=404, detail="Comentariu inexistent")

    if not (comment.user_id == user_id or _is_admin(member)):
        raise HTTPException(
            status_code=403,
            detail="Doar autorul sau un administrator poate sterge comentariul",
        )

    db.delete(comment)
    db.commit()


# ── notificari (best-effort) ─────────────────────────────────────────

def _notify_new_report(db: Session, report: BugReport, actor_id: str) -> None:
    """Notifica adminii proiectului (mai putin autorul) de un raport nou."""
    try:
        members = membership_service.list_members(db, report.project_id)
        for m in members:
            if m.user_id == actor_id:
                continue
            if membership_service.ROLE_RANK.get(m.role, -1) < membership_service.ROLE_RANK["ADMIN"]:
                continue
            notification_service.create_safe(
                db,
                user_id=m.user_id,
                type="BUG_REPORT_NEW",
                title=f"Raport QA nou: {report.title}",
                link=f"/projects/{report.project_id}/qa",
                meta={"projectId": report.project_id, "reportId": report.id, "actorId": actor_id},
                commit=True,
            )
    except Exception as e:  # noqa: BLE001
        print(f"[bug_report] notify new report error: {e}")


def _notify_assignment(db: Session, report: BugReport, assignee_id: str) -> None:
    """Notifica responsabilul alocat unui raport."""
    notification_service.create_safe(
        db,
        user_id=assignee_id,
        type="BUG_REPORT_ASSIGNED",
        title=f"Ai fost alocat la raportul QA: {report.title}",
        link=f"/projects/{report.project_id}/qa",
        meta={"projectId": report.project_id, "reportId": report.id},
        commit=True,
    )
