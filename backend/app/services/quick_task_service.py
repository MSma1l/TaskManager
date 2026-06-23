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
from app.models.user import User
from app.services import task_service, membership_service, notification_service, office_service


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
        "attachments": qt.attachments or [],
    }


# Atasamente acceptate de pe formularul public (screenshot-uri + voice).
_MAX_ATTACHMENTS = 10


def _clean_attachments(raw) -> list | None:
    """Valideaza si normalizeaza atasamentele venite din formularul public.

    Accepta o lista de {"type": "image"|"audio", "data": data-URL, "caption"?}.
    Ignora orice intrare invalida; intoarce None daca nu ramane nimic.
    """
    if not isinstance(raw, list):
        return None
    out = []
    for item in raw[:_MAX_ATTACHMENTS]:
        if not isinstance(item, dict):
            continue
        atype = str(item.get("type") or "").lower()
        data = item.get("data")
        if atype not in {"image", "audio"}:
            continue
        if not isinstance(data, str) or not data.startswith("data:"):
            continue
        caption = item.get("caption")
        out.append({
            "type": atype,
            "data": data,
            "caption": (str(caption)[:300] if caption else None),
        })
    return out or None


def _fallback_title(attachments: list | None) -> str:
    """Titlu implicit cand userul trimite doar voce / imagine (fara text).

    Astfel inbox-ul de admin nu ramane gol. Audio are prioritate fata de imagine.
    """
    if attachments:
        types = {a.get("type") for a in attachments if isinstance(a, dict)}
        if "audio" in types:
            return "Notă vocală"
        if "image" in types:
            return "Imagine"
    return "Cerere rapidă"


# ── Public (fara auth) ────────────────────────────────────────────────────────

def create_public(db: Session, data: dict) -> dict:
    """Creeaza un quick task din formularul public. NU necesita autentificare."""
    requester = (data.get("requesterName") or "").strip()
    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    attachments = _clean_attachments(data.get("attachments"))

    if not requester:
        raise HTTPException(status_code=400, detail="Numele este obligatoriu")
    # Acceptam submisia daca avem text (titlu/descriere) SAU cel putin un atasament.
    if not title and not description and not attachments:
        raise HTTPException(
            status_code=400,
            detail="Scrie un mesaj sau ataseaza ceva (imagine / nota vocala)",
        )

    # Titlul nu poate fi NULL in DB: daca lipseste, derivam un fallback din atasamente.
    if not title:
        title = _fallback_title(attachments)

    priority = (data.get("priority") or "NORMAL").strip().upper()
    if priority not in VALID_PRIORITIES:
        priority = "NORMAL"

    qt = QuickTask(
        requester_name=requester[:150],
        title=title[:300],
        description=description or None,
        priority=priority,
        status="NEW",
        attachments=attachments,
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


def count_new(db: Session, user_id: str) -> int:
    """Numarul de quick task-uri NEW (pentru badge-ul din sidebar).

    Doar adminii/owner-ii (cei care vad inbox-ul) primesc un numar > 0;
    pentru restul intoarce 0, ca badge-ul sa nu apara degeaba.
    """
    if user_id not in _admin_user_ids(db):
        return 0
    return (
        db.query(QuickTask)
        .filter(QuickTask.is_active == True, QuickTask.status == "NEW")  # noqa: E712
        .count()
    )


def assign(
    db: Session,
    user_id: str,
    quick_task_id: str,
    project_id: str | None,
    assignee_id: str,
    *,
    is_global_admin: bool = False,
) -> dict:
    """Atribuie un quick task: creeaza un Task real in Backlog-ul proiectului,
    atribuit persoanei alese.

    `project_id` e OPTIONAL: cand lipseste, taskul intra in proiectul Birou (OFFICE).
    Pentru proiectele obisnuite, caller-ul trebuie sa fie ADMIN+ pe proiect; pentru
    Birou e suficient ADMIN global (sau ADMIN+ pe proiectul Birou)."""
    qt = (
        db.query(QuickTask)
        .filter(QuickTask.id == quick_task_id, QuickTask.is_active == True)  # noqa: E712
        .first()
    )
    if not qt:
        raise HTTPException(status_code=404, detail="Quick task inexistent")
    if qt.status != "NEW":
        raise HTTPException(status_code=409, detail="Quick task-ul a fost deja procesat")

    # Fara proiect explicit -> proiectul Birou (creat la nevoie).
    is_office = False
    if not project_id:
        office = office_service.ensure_office_project(db, user_id)
        db.flush()
        project_id = office.id
        is_office = True

    # Permisiuni: pentru Birou accepta ADMIN global; altfel ADMIN+ pe proiect.
    member = membership_service.get_member(db, project_id, user_id)
    is_project_lead = member is not None and (
        membership_service.ROLE_RANK.get(member.role, -1) >= membership_service.ROLE_RANK["ADMIN"]
    )
    if not (is_project_lead or (is_office and is_global_admin)):
        raise HTTPException(status_code=403, detail="Permisiuni insuficiente pentru a distribui acest task")

    # Responsabilul trebuie sa faca parte din proiect. Pentru Birou il adaugam automat.
    if membership_service.get_member(db, project_id, assignee_id) is None:
        if is_office:
            office_service.ensure_office_membership(db, assignee_id)
            db.flush()
        else:
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

    # create_task nu cunoaste assignee / origin / story points -> le setam dupa creare.
    task.assignee_id = assignee_id
    task.origin = "QUICK"
    # Populeaza si lista multi-assignee (task_assignees) ca array-ul `assignees`
    # din contractul de board sa fie populat pentru noul responsabil.
    assignee_user = db.query(User).filter(User.id == assignee_id).first()
    if assignee_user is not None:
        task.assignees = [assignee_user]
    # Default story points = 1 pentru taskurile noi (quick task nu vine cu estimare).
    if task.story_points is None:
        task.story_points = 1
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
        # Trimite userul direct in tab-ul "Repartizate" (Weekly View) unde
        # task-ul nou ii apare marcat "Nou / Trebuie inceput".
        link="/?tab=assigned",
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
