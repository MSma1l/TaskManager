"""Colaborare (Faza 3B): comentarii, jurnal de activitate, @mention -> Telegram, watchers.

Toate operatiile sunt scopate pe proiectul task-ului si trec prin
`membership_service` pentru permisiuni. Notificarile Telegram sunt best-effort
(async, niciodata nu arunca spre client) si refolosesc mecanismul existent din
`reminder_service` (toggle Telegram + fereastra "Nu deranja").
"""
import asyncio
import re
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.task import Task
from app.models.user import User
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.task_comment import TaskComment
from app.models.task_activity import TaskActivity
from app.models.task_watcher import TaskWatcher
from app.services import membership_service


MENTION_RE = re.compile(r"@(\w+)")
SNIPPET_MAX = 120


# ── helpers interne ──────────────────────────────────────────────────

def _require_task_membership(db: Session, task_id: str, user_id: str, min_role: str = "VIEWER"):
    """Incarca task-ul si verifica apartenenta la proiectul lui.

    Returneaza (task, member). 404 daca task-ul nu are proiect (task personal,
    fara colaborare).
    """
    task = db.query(Task).filter(Task.id == task_id, Task.is_active == True).first()
    if task is None or not task.project_id:
        raise HTTPException(status_code=404, detail="Task inexistent")
    member = membership_service.require_membership(db, task.project_id, user_id, min_role)
    return task, member


def _user_map(db: Session, user_ids) -> dict:
    ids = {uid for uid in user_ids if uid}
    if not ids:
        return {}
    rows = db.query(User).filter(User.id.in_(ids)).all()
    return {u.id: u for u in rows}


def _comment_to_dict(comment: TaskComment, user: User | None) -> dict:
    return {
        "id": comment.id,
        "body": comment.body,
        "userId": comment.user_id,
        "username": user.username if user else None,
        "fullName": user.full_name if user else None,
        "createdAt": comment.created_at.isoformat() if comment.created_at else None,
        "updatedAt": comment.updated_at.isoformat() if comment.updated_at else None,
    }


def _task_key(db: Session, task: Task) -> str | None:
    if not task.project_id or task.task_number is None:
        return None
    row = db.query(Project.key).filter(Project.id == task.project_id).first()
    key = row[0] if row else None
    return f"{key}-{task.task_number}" if key else None


# ── jurnal de activitate ─────────────────────────────────────────────

def log_activity(db: Session, task: Task, actor_user_id: str | None, action: str, meta: dict | None = None) -> None:
    """Insereaza o intrare de activitate (project_id luat din task).

    Apelantii trebuie sa trateze logarea ca non-fatala (vezi hook-urile din
    board_service): orice eroare aici nu trebuie sa rupa mutatia principala.
    """
    if not task.project_id:
        return
    db.add(TaskActivity(
        task_id=task.id,
        project_id=task.project_id,
        user_id=actor_user_id,
        action=action,
        meta=meta,
        created_at=datetime.utcnow(),
    ))


# ── comentarii ───────────────────────────────────────────────────────

def list_comments(db: Session, user_id: str, task_id: str) -> list[dict]:
    _require_task_membership(db, task_id, user_id, min_role="VIEWER")
    comments = (
        db.query(TaskComment)
        .filter(TaskComment.task_id == task_id)
        .order_by(TaskComment.created_at.asc())
        .all()
    )
    users = _user_map(db, [c.user_id for c in comments])
    return [_comment_to_dict(c, users.get(c.user_id)) for c in comments]


def add_comment(db: Session, user_id: str, task_id: str, body: str) -> dict:
    task, _ = _require_task_membership(db, task_id, user_id, min_role="MEMBER")

    body = (body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Comentariul nu poate fi gol")

    now = datetime.utcnow()
    comment = TaskComment(
        task_id=task_id,
        user_id=user_id,
        body=body,
        created_at=now,
        updated_at=now,
    )
    db.add(comment)

    # Autorul devine watcher (idempotent).
    _ensure_watcher(db, task_id, user_id)

    # Jurnal de activitate (non-fatal).
    try:
        log_activity(db, task, user_id, "COMMENTED")
    except Exception as e:
        print(f"log_activity COMMENTED failed: {e}")

    db.commit()
    db.refresh(comment)

    # Notificari Telegram (best-effort, nu arunca niciodata).
    try:
        _notify_comment(db, task, comment, user_id)
    except Exception as e:
        print(f"comment notify error: {e}")

    author = db.query(User).filter(User.id == user_id).first()
    return _comment_to_dict(comment, author)


def edit_comment(db: Session, user_id: str, task_id: str, comment_id: str, body: str) -> dict:
    task, member = _require_task_membership(db, task_id, user_id, min_role="VIEWER")
    comment = _get_comment(db, task_id, comment_id)

    is_author = comment.user_id == user_id
    is_admin = membership_service.ROLE_RANK.get(member.role, -1) >= membership_service.ROLE_RANK["ADMIN"]
    if not (is_author or is_admin):
        raise HTTPException(status_code=403, detail="Doar autorul sau un administrator poate edita comentariul")

    body = (body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Comentariul nu poate fi gol")

    comment.body = body
    comment.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(comment)

    author = db.query(User).filter(User.id == comment.user_id).first()
    return _comment_to_dict(comment, author)


def delete_comment(db: Session, user_id: str, task_id: str, comment_id: str) -> None:
    _, member = _require_task_membership(db, task_id, user_id, min_role="VIEWER")
    comment = _get_comment(db, task_id, comment_id)

    is_author = comment.user_id == user_id
    is_admin = membership_service.ROLE_RANK.get(member.role, -1) >= membership_service.ROLE_RANK["ADMIN"]
    if not (is_author or is_admin):
        raise HTTPException(status_code=403, detail="Doar autorul sau un administrator poate sterge comentariul")

    db.delete(comment)
    db.commit()


def _get_comment(db: Session, task_id: str, comment_id: str) -> TaskComment:
    comment = (
        db.query(TaskComment)
        .filter(TaskComment.id == comment_id, TaskComment.task_id == task_id)
        .first()
    )
    if comment is None:
        raise HTTPException(status_code=404, detail="Comentariu inexistent")
    return comment


# ── activitate (read) ────────────────────────────────────────────────

def list_task_activity(db: Session, user_id: str, task_id: str) -> list[dict]:
    _require_task_membership(db, task_id, user_id, min_role="VIEWER")
    rows = (
        db.query(TaskActivity)
        .filter(TaskActivity.task_id == task_id)
        .order_by(TaskActivity.created_at.desc())
        .all()
    )
    return _activity_list_to_dict(db, rows)


def list_project_activity(db: Session, user_id: str, project_id: str, limit: int = 50) -> list[dict]:
    membership_service.require_membership(db, project_id, user_id, min_role="VIEWER")
    limit = max(1, min(int(limit or 50), 200))
    rows = (
        db.query(TaskActivity)
        .filter(TaskActivity.project_id == project_id)
        .order_by(TaskActivity.created_at.desc())
        .limit(limit)
        .all()
    )
    return _activity_list_to_dict(db, rows)


def _activity_list_to_dict(db: Session, rows: list[TaskActivity]) -> list[dict]:
    users = _user_map(db, [r.user_id for r in rows])
    result = []
    for r in rows:
        u = users.get(r.user_id)
        result.append({
            "id": r.id,
            "action": r.action,
            "meta": r.meta,
            "taskId": r.task_id,
            "userId": r.user_id,
            "username": u.username if u else None,
            "createdAt": r.created_at.isoformat() if r.created_at else None,
        })
    return result


# ── watchers ─────────────────────────────────────────────────────────

def _ensure_watcher(db: Session, task_id: str, user_id: str) -> None:
    """Adauga un watcher daca nu exista deja (idempotent, fara commit)."""
    existing = (
        db.query(TaskWatcher)
        .filter(TaskWatcher.task_id == task_id, TaskWatcher.user_id == user_id)
        .first()
    )
    if existing is None:
        db.add(TaskWatcher(task_id=task_id, user_id=user_id, created_at=datetime.utcnow()))


def add_watcher(db: Session, user_id: str, task_id: str) -> None:
    _require_task_membership(db, task_id, user_id, min_role="MEMBER")
    _ensure_watcher(db, task_id, user_id)
    db.commit()


def remove_watcher(db: Session, user_id: str, task_id: str) -> None:
    _require_task_membership(db, task_id, user_id, min_role="MEMBER")
    db.query(TaskWatcher).filter(
        TaskWatcher.task_id == task_id,
        TaskWatcher.user_id == user_id,
    ).delete(synchronize_session=False)
    db.commit()


def list_watchers(db: Session, user_id: str, task_id: str) -> list[dict]:
    _require_task_membership(db, task_id, user_id, min_role="VIEWER")
    rows = db.query(TaskWatcher).filter(TaskWatcher.task_id == task_id).all()
    users = _user_map(db, [r.user_id for r in rows])
    result = []
    for r in rows:
        u = users.get(r.user_id)
        result.append({"userId": r.user_id, "username": u.username if u else None})
    return result


# ── @mentions -> Telegram (best-effort) ──────────────────────────────

def _resolve_mentions(db: Session, project_id: str, body: str, exclude_user_id: str) -> list[User]:
    """Rezolva @username -> membri ai proiectului (case-insensitive), exclus autorul."""
    names = {m.lower() for m in MENTION_RE.findall(body or "")}
    if not names:
        return []
    member_ids = [
        r[0] for r in db.query(ProjectMember.user_id).filter(
            ProjectMember.project_id == project_id
        ).all()
    ]
    if not member_ids:
        return []
    members = db.query(User).filter(User.id.in_(member_ids)).all()
    return [
        u for u in members
        if u.username and u.username.lower() in names and u.id != exclude_user_id
    ]


def _notify_comment(db: Session, task: Task, comment: TaskComment, author_id: str) -> None:
    """Notifica pe Telegram membrii mentionati + watcherii (mai putin autorul)."""
    author = db.query(User).filter(User.id == author_id).first()
    actor_name = (author.full_name or author.username) if author else "Cineva"

    task_key = _task_key(db, task) or "task"
    snippet = comment.body.strip().replace("\n", " ")
    if len(snippet) > SNIPPET_MAX:
        snippet = snippet[:SNIPPET_MAX].rstrip() + "…"

    mentioned = _resolve_mentions(db, task.project_id, comment.body, author_id)
    mentioned_ids = {u.id for u in mentioned}

    # Watcheri (mai putin autorul si cei deja notificati ca mentionati).
    watcher_ids = {
        r[0] for r in db.query(TaskWatcher.user_id).filter(
            TaskWatcher.task_id == task.id
        ).all()
    }
    watcher_ids.discard(author_id)
    watcher_ids -= mentioned_ids

    targets: dict[str, str] = {}  # user_id -> mesaj

    for u in mentioned:
        targets[u.id] = f"{actor_name} te-a mentionat in {task_key}: {snippet}"

    if watcher_ids:
        watchers = db.query(User).filter(User.id.in_(watcher_ids)).all()
        watcher_msg = f"Comentariu nou la {task_key} de la {actor_name}"
        for u in watchers:
            targets[u.id] = watcher_msg

    if not targets:
        return

    # Construieste lista de (chat_id, role, text) respectand toggle + DND.
    from app.services import reminder_service
    now = datetime.utcnow()

    rows = db.query(User).filter(User.id.in_(list(targets.keys()))).all()
    for u in rows:
        if not u.telegram_chat_id:
            continue
        if not reminder_service._telegram_allowed(u, now):
            continue
        text = targets[u.id]
        _dispatch_telegram(text, u.telegram_chat_id, u.role)


def _dispatch_telegram(text: str, chat_id: str, role: str | None) -> None:
    """Trimite un mesaj Telegram async, fara a arunca daca nu exista event loop."""
    from app.services import reminder_service
    try:
        asyncio.create_task(reminder_service._send_telegram(text, chat_id=chat_id, role=role))
    except RuntimeError:
        # Niciun event loop activ (ex: context sincron de test) — ignora.
        pass
