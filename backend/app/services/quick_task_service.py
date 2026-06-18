"""Logica de business pentru Quick Tasks.

Flux:
  1. Cineva (fara login) trimite un task din formularul public -> QuickTask status NEW.
  2. Un job la fiecare minut notifica adminii/owner-ii de proiecte ca au taskuri noi.
  3. Adminul preia taskul din inbox, alege proiect + responsabil -> se creeaza un
     Task real (intra in Backlog-ul proiectului, atribuit persoanei), iar quick
     task-ul devine ASSIGNED si pastreaza legatura prin `task_id`.
  4. Alternativ, adminul poate respinge taskul -> DISMISSED + soft-delete.

Rutele din `api/quick_tasks.py` sunt subtiri si deleaga aici (regula de aur).
"""
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.quick_task import QuickTask
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.services import task_service, membership_service, notification_service


VALID_PRIORITIES = {"URGENT", "NORMAL", "LATER"}

# Quick task priority -> board task priority. Board task-urile folosesc scala
# LOW / MEDIUM / HIGH / URGENT, deci mapam ca sa ramana coerent vizual.
_BOARD_PRIORITY = {"URGENT": "URGENT", "NORMAL": "MEDIUM", "LATER": "LOW"}

# Etichete RO pentru notificari (in-app, mereu RO ca restul triggerelor).
_PRIORITY_LABEL_RO = {"URGENT": "Urgent", "NORMAL": "Normal", "LATER": "Poate astepta"}
_PRIORITY_EMOJI = {"URGENT": "🔴", "NORMAL": "🟡", "LATER": "⚪"}


def _to_dict(qt: QuickTask) -> dict:
    return {
        "id": qt.id,
        "requesterName": qt.requester_name,
        "title": qt.title,
        "description": qt.description,
        "priority": qt.priority,
        "status": qt.status,
        "projectId": qt.project_id,
        "assigneeId": qt.assignee_id,
        "taskId": qt.task_id,
        "processedByUserId": qt.processed_by_user_id,
        "processedAt": qt.processed_at.isoformat() if qt.processed_at else None,
        "createdAt": qt.created_at.isoformat() if qt.created_at else None,
    }


# ── Public (fara auth) ────────────────────────────────────────────────────────

def create_public(db: Session, data: dict) -> dict:
    """Creeaza un quick task din formularul public. NU necesita autentificare."""
    requester = (data.get("requesterName") or "").strip()
    title = (data.get("title") or "").strip()
    if not requester:
        raise HTTPException(status_code=400, detail="Numele este obligatoriu")
    if not title:
        raise HTTPException(status_code=400, detail="Titlul este obligatoriu")

    priority = (data.get("priority") or "NORMAL").strip().upper()
    if priority not in VALID_PRIORITIES:
        priority = "NORMAL"

    qt = QuickTask(
        requester_name=requester[:150],
        title=title[:300],
        description=(data.get("description") or "").strip() or None,
        priority=priority,
        status="NEW",
    )
    db.add(qt)
    db.commit()
    db.refresh(qt)
    return {"id": qt.id, "ok": True}


# ── Admin inbox ───────────────────────────────────────────────────────────────

def list_quick_tasks(db: Session, user_id: str, status: str | None = "NEW") -> list[dict]:
    """Lista quick task-urilor active pentru inbox-ul de admin, cele mai noi primele.

    `status` poate fi un status anume ("NEW"/"ASSIGNED"/"DISMISSED") sau orice
    valoare „falsy"/"ALL" pentru a intoarce NEW + ASSIGNED.
    """
    q = db.query(QuickTask).filter(QuickTask.is_active == True)  # noqa: E712
    normalized = (status or "ALL").strip().upper()
    if normalized in {"NEW", "ASSIGNED", "DISMISSED"}:
        q = q.filter(QuickTask.status == normalized)
    else:
        q = q.filter(QuickTask.status.in_(["NEW", "ASSIGNED"]))
    rows = q.order_by(QuickTask.created_at.desc()).all()
    return [_to_dict(qt) for qt in rows]


def assign(
    db: Session,
    user_id: str,
    quick_task_id: str,
    project_id: str,
    assignee_id: str,
) -> dict:
    """Atribuie un quick task: creeaza un Task real in Backlog-ul proiectului,
    atribuit persoanei alese. Caller-ul trebuie sa fie ADMIN+ pe proiect."""
    qt = (
        db.query(QuickTask)
        .filter(QuickTask.id == quick_task_id, QuickTask.is_active == True)  # noqa: E712
        .first()
    )
    if not qt:
        raise HTTPException(status_code=404, detail="Quick task inexistent")
    if qt.status != "NEW":
        raise HTTPException(status_code=409, detail="Quick task-ul a fost deja procesat")

    # Doar adminii/owner-ii proiectului pot distribui taskuri.
    membership_service.require_membership(db, project_id, user_id, min_role="ADMIN")

    # Responsabilul trebuie sa faca parte din proiect, altfel taskul ar fi orfan.
    if membership_service.get_member(db, project_id, assignee_id) is None:
        raise HTTPException(status_code=400, detail="Responsabilul nu este membru al proiectului")

    # Construim un Task de board (project_id setat -> intra automat in BACKLOG).
    # `create_task` cere cheile categoryId / dayOfWeek; pentru board sunt NULL.
    task = task_service.create_task(
        db,
        user_id,
        {
            "title": qt.title,
            "description": qt.description,
            "categoryId": None,
            "dayOfWeek": None,
            "priority": _BOARD_PRIORITY.get(qt.priority, "MEDIUM"),
            "projectId": project_id,
        },
    )

    # create_task nu cunoaste assignee / origin -> le setam dupa creare.
    task.assignee_id = assignee_id
    task.origin = "QUICK"
    qt.task_id = task.id
    qt.project_id = project_id
    qt.assignee_id = assignee_id
    qt.status = "ASSIGNED"
    qt.processed_by_user_id = user_id
    qt.processed_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    db.refresh(qt)

    # Notificam responsabilul (non-fatal).
    project = db.query(Project).filter(Project.id == project_id).first()
    pname = project.name if project else "un proiect"
    label = _PRIORITY_LABEL_RO.get(qt.priority, qt.priority)
    emoji = _PRIORITY_EMOJI.get(qt.priority, "")
    notification_service.create_safe(
        db,
        user_id=assignee_id,
        type="QUICK_ASSIGNED",
        title=f"Task nou atribuit: {qt.title}",
        body=f"{emoji} Prioritate: {label} · de la {qt.requester_name} · proiect {pname}",
        link=f"/projects/{project_id}",
        meta={
            "quickTaskId": qt.id,
            "taskId": task.id,
            "projectId": project_id,
            "priority": qt.priority,
        },
        commit=True,
    )

    return {"task": {"id": task.id, "title": task.title}, "quickTask": _to_dict(qt)}


def dismiss(db: Session, user_id: str, quick_task_id: str) -> dict:
    """Respinge un quick task: status DISMISSED + soft-delete."""
    qt = (
        db.query(QuickTask)
        .filter(QuickTask.id == quick_task_id, QuickTask.is_active == True)  # noqa: E712
        .first()
    )
    if not qt:
        raise HTTPException(status_code=404, detail="Quick task inexistent")

    qt.status = "DISMISSED"
    qt.is_active = False
    qt.processed_by_user_id = user_id
    qt.processed_at = datetime.utcnow()
    db.commit()
    db.refresh(qt)
    return _to_dict(qt)


# ── Scheduler: notificare admini despre quick task-uri noi ─────────────────────

def _admin_user_ids(db: Session) -> list[str]:
    """User-ii care sunt ADMIN sau OWNER pe cel putin un proiect (distinct)."""
    rows = (
        db.query(ProjectMember.user_id)
        .filter(ProjectMember.role.in_(["ADMIN", "OWNER"]))
        .distinct()
        .all()
    )
    return [r[0] for r in rows if r[0]]


def notify_admins_new_quick_tasks(db: Session) -> int:
    """Pentru fiecare quick task NEW ne-notificat, ping in-app la toti adminii/owner-ii.

    Anti-duplicare prin `notified_at`. Rezilient: o eroare pe un item nu opreste
    restul. Intoarce cate quick task-uri au fost procesate."""
    pending = (
        db.query(QuickTask)
        .filter(
            QuickTask.is_active == True,  # noqa: E712
            QuickTask.status == "NEW",
            QuickTask.notified_at.is_(None),
        )
        .order_by(QuickTask.created_at.asc())
        .all()
    )
    if not pending:
        return 0

    admin_ids = _admin_user_ids(db)
    processed = 0
    for qt in pending:
        try:
            label = _PRIORITY_LABEL_RO.get(qt.priority, qt.priority)
            emoji = _PRIORITY_EMOJI.get(qt.priority, "")
            for uid in admin_ids:
                notification_service.create_safe(
                    db,
                    user_id=uid,
                    type="QUICK_NEW",
                    title=f"Quick task nou: {qt.title}",
                    body=f"{emoji} Prioritate: {label} · de la {qt.requester_name}",
                    link="/quick-tasks",
                    meta={"quickTaskId": qt.id, "priority": qt.priority},
                    commit=False,
                )
            qt.notified_at = datetime.utcnow()
            db.commit()
            processed += 1
        except Exception as e:  # noqa: BLE001
            db.rollback()
            print(f"[quick_task] notify error for {qt.id}: {e}")
    return processed
