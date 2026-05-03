from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.notebook import NotebookSketch
from app.schemas.notebook import TopicCreate, TopicUpdate, NoteCreate, NoteUpdate
from app.services import notebook_service

router = APIRouter(prefix="/api/notebook", tags=["notebook"])


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
async def get_topics(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    notebook_service.ensure_predefined_topics(db, user.id)
    topics = notebook_service.get_topics(db, user.id)
    result = []
    for t in topics:
        d = _topic_to_dict(t)
        d["ideaCount"] = notebook_service.count_ideas_in_topic(db, user.id, t.id)
        result.append(d)
    return result


@router.post("/topics")
async def create_topic(data: TopicCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    topic = notebook_service.create_topic(db, user.id, data.name, data.emoji, data.description)
    if not topic:
        raise HTTPException(status_code=400, detail="Topic already exists")
    return _topic_to_dict(topic)


@router.put("/topics/{topic_id}")
async def update_topic(
    topic_id: str, data: TopicUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    topic = notebook_service.update_topic(db, user.id, topic_id, data.name, data.emoji, data.description)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    return _topic_to_dict(topic)


@router.delete("/topics/{topic_id}")
async def delete_topic(
    topic_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    success = notebook_service.delete_topic(db, user.id, topic_id)
    if not success:
        raise HTTPException(status_code=404, detail="Topic not found")
    return {"message": "Topic deleted"}


# ── STEPS (time management) ────────────────────────

@router.get("/steps")
async def get_steps(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [_note_to_dict(s) for s in notebook_service.get_steps(db, user.id)]


@router.post("/steps")
async def add_step(data: NoteCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = notebook_service.add_step(db, user.id, data.content)
    if not note:
        raise HTTPException(status_code=400, detail="Content cannot be empty")
    return _note_to_dict(note)


# ── TASKS (time management) ────────────────────────

@router.get("/tasks")
async def get_notebook_tasks(
    status: str = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return [_note_to_dict(t) for t in notebook_service.get_tasks(db, user.id, status)]


@router.post("/tasks")
async def add_notebook_task(
    data: NoteCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    note = notebook_service.add_task_note(db, user.id, data.content, data.taskStatus or "todo")
    if not note:
        raise HTTPException(status_code=400, detail="Content cannot be empty")
    return _note_to_dict(note)


# ── IDEAS ───────────────────────────────────────────

@router.get("/ideas/{topic_id}")
async def get_ideas(
    topic_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return [_note_to_dict(i) for i in notebook_service.get_ideas_by_topic(db, user.id, topic_id)]


@router.post("/ideas/{topic_id}")
async def add_idea(
    topic_id: str, data: NoteCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    note = notebook_service.add_idea(db, user.id, topic_id, data.content)
    if not note:
        raise HTTPException(status_code=400, detail="Invalid topic or empty content")
    return _note_to_dict(note)


# ── EDIT & DELETE (all note types) ──────────────────

@router.put("/notes/{note_id}")
async def update_note(
    note_id: str, data: NoteUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if data.content is not None:
        note = notebook_service.edit_note(db, user.id, note_id, data.content)
    elif data.taskStatus is not None:
        note = notebook_service.update_task_status(db, user.id, note_id, data.taskStatus)
    else:
        raise HTTPException(status_code=400, detail="Nothing to update")
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return _note_to_dict(note)


@router.delete("/notes/{note_id}")
async def delete_note(
    note_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    success = notebook_service.delete_note(db, user.id, note_id)
    if not success:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"message": "Note deleted"}


# ── SKETCHES (stylus / hand-drawn notes) ────────────────────────────────

class SketchCreate(BaseModel):
    title: Optional[str] = None
    topicId: Optional[str] = None
    imageData: str
    width: Optional[int] = None
    height: Optional[int] = None


class SketchUpdate(BaseModel):
    title: Optional[str] = None
    topicId: Optional[str] = None
    imageData: Optional[str] = None


def _sketch_to_dict(s: NotebookSketch) -> dict:
    return {
        "id": s.id,
        "title": s.title,
        "topicId": s.topic_id,
        "imageData": s.image_data,
        "width": s.width,
        "height": s.height,
        "createdAt": s.created_at.isoformat() if s.created_at else None,
        "updatedAt": s.updated_at.isoformat() if s.updated_at else None,
    }


@router.get("/sketches")
async def list_sketches(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sketches = (
        db.query(NotebookSketch)
        .filter(NotebookSketch.user_id == user.id, NotebookSketch.is_deleted == False)
        .order_by(NotebookSketch.created_at.desc())
        .all()
    )
    return [_sketch_to_dict(s) for s in sketches]


@router.post("/sketches")
async def create_sketch(
    data: SketchCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not data.imageData or not data.imageData.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="imageData trebuie sa fie data URL")
    if len(data.imageData) > 4_000_000:  # ~3MB after base64
        raise HTTPException(status_code=413, detail="Imagine prea mare (max ~3MB)")
    sketch = NotebookSketch(
        user_id=user.id,
        title=(data.title or "").strip()[:150] or None,
        topic_id=data.topicId or None,
        image_data=data.imageData,
        width=data.width,
        height=data.height,
    )
    db.add(sketch)
    db.commit()
    db.refresh(sketch)
    return _sketch_to_dict(sketch)


@router.put("/sketches/{sketch_id}")
async def update_sketch(
    sketch_id: str,
    data: SketchUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    s = (
        db.query(NotebookSketch)
        .filter(NotebookSketch.id == sketch_id, NotebookSketch.user_id == user.id, NotebookSketch.is_deleted == False)
        .first()
    )
    if not s:
        raise HTTPException(status_code=404, detail="Schita inexistenta")
    if data.title is not None:
        s.title = data.title.strip()[:150] or None
    if data.topicId is not None:
        s.topic_id = data.topicId or None
    if data.imageData is not None:
        if not data.imageData.startswith("data:image/"):
            raise HTTPException(status_code=400, detail="imageData trebuie sa fie data URL")
        s.image_data = data.imageData
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    return _sketch_to_dict(s)


@router.delete("/sketches/{sketch_id}")
async def delete_sketch(
    sketch_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    s = (
        db.query(NotebookSketch)
        .filter(NotebookSketch.id == sketch_id, NotebookSketch.user_id == user.id, NotebookSketch.is_deleted == False)
        .first()
    )
    if not s:
        raise HTTPException(status_code=404, detail="Schita inexistenta")
    s.is_deleted = True
    s.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}
