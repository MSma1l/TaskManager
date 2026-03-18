from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import verify_token
from app.core.config import settings
from app.schemas.notebook import TopicCreate, TopicUpdate, NoteCreate, NoteUpdate
from app.services import notebook_service

router = APIRouter(prefix="/api/notebook", tags=["notebook"])
security = HTTPBearer()


def _get_user_id():
    """For now, use the configured chat_id as user_id (single-user setup).
    In a multi-user setup, this would come from the JWT token."""
    return settings.TELEGRAM_CHAT_ID


def _topic_to_dict(topic):
    return {
        "id": topic.id,
        "name": topic.name,
        "emoji": topic.emoji,
        "description": topic.description,
        "isPredefined": topic.is_predefined,
        "createdAt": topic.created_at.isoformat() if topic.created_at else None,
    }


def _note_to_dict(note):
    return {
        "id": note.id,
        "noteType": note.note_type,
        "topicId": note.topic_id,
        "content": note.content,
        "stepOrder": note.step_order,
        "taskStatus": note.task_status,
        "createdAt": note.created_at.isoformat() if note.created_at else None,
        "updatedAt": note.updated_at.isoformat() if note.updated_at else None,
    }


# ── TOPICS ──────────────────────────────────────────

@router.get("/topics")
async def get_topics(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    user_id = _get_user_id()
    notebook_service.ensure_predefined_topics(db, user_id)
    topics = notebook_service.get_topics(db, user_id)
    result = []
    for t in topics:
        d = _topic_to_dict(t)
        d["ideaCount"] = notebook_service.count_ideas_in_topic(db, user_id, t.id)
        result.append(d)
    return result


@router.post("/topics")
async def create_topic(
    data: TopicCreate,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    user_id = _get_user_id()
    topic = notebook_service.create_topic(db, user_id, data.name, data.emoji, data.description)
    if not topic:
        raise HTTPException(status_code=400, detail="Topic already exists")
    return _topic_to_dict(topic)


@router.put("/topics/{topic_id}")
async def update_topic(
    topic_id: str,
    data: TopicUpdate,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    user_id = _get_user_id()
    topic = notebook_service.update_topic(db, user_id, topic_id, data.name, data.emoji, data.description)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    return _topic_to_dict(topic)


@router.delete("/topics/{topic_id}")
async def delete_topic(
    topic_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    user_id = _get_user_id()
    success = notebook_service.delete_topic(db, user_id, topic_id)
    if not success:
        raise HTTPException(status_code=404, detail="Topic not found")
    return {"message": "Topic deleted"}


# ── STEPS (time management) ────────────────────────

@router.get("/steps")
async def get_steps(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    user_id = _get_user_id()
    steps = notebook_service.get_steps(db, user_id)
    return [_note_to_dict(s) for s in steps]


@router.post("/steps")
async def add_step(
    data: NoteCreate,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    user_id = _get_user_id()
    note = notebook_service.add_step(db, user_id, data.content)
    if not note:
        raise HTTPException(status_code=400, detail="Content cannot be empty")
    return _note_to_dict(note)


# ── TASKS (time management) ────────────────────────

@router.get("/tasks")
async def get_notebook_tasks(
    status: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    user_id = _get_user_id()
    tasks = notebook_service.get_tasks(db, user_id, status)
    return [_note_to_dict(t) for t in tasks]


@router.post("/tasks")
async def add_notebook_task(
    data: NoteCreate,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    user_id = _get_user_id()
    note = notebook_service.add_task_note(db, user_id, data.content, data.taskStatus or "todo")
    if not note:
        raise HTTPException(status_code=400, detail="Content cannot be empty")
    return _note_to_dict(note)


# ── IDEAS ───────────────────────────────────────────

@router.get("/ideas/{topic_id}")
async def get_ideas(
    topic_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    user_id = _get_user_id()
    ideas = notebook_service.get_ideas_by_topic(db, user_id, topic_id)
    return [_note_to_dict(i) for i in ideas]


@router.post("/ideas/{topic_id}")
async def add_idea(
    topic_id: str,
    data: NoteCreate,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    user_id = _get_user_id()
    note = notebook_service.add_idea(db, user_id, topic_id, data.content)
    if not note:
        raise HTTPException(status_code=400, detail="Invalid topic or empty content")
    return _note_to_dict(note)


# ── EDIT & DELETE (all note types) ──────────────────

@router.put("/notes/{note_id}")
async def update_note(
    note_id: str,
    data: NoteUpdate,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    user_id = _get_user_id()
    if data.content is not None:
        note = notebook_service.edit_note(db, user_id, note_id, data.content)
    elif data.taskStatus is not None:
        note = notebook_service.update_task_status(db, user_id, note_id, data.taskStatus)
    else:
        raise HTTPException(status_code=400, detail="Nothing to update")
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return _note_to_dict(note)


@router.delete("/notes/{note_id}")
async def delete_note(
    note_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    await verify_token(credentials)
    user_id = _get_user_id()
    success = notebook_service.delete_note(db, user_id, note_id)
    if not success:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"message": "Note deleted"}
