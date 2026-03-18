from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.notebook import NotebookTopic, NotebookNote, NotebookNoteHistory


# ── TOPICS ──────────────────────────────────────────

def get_topics(db: Session, user_id: str):
    return (
        db.query(NotebookTopic)
        .filter(NotebookTopic.user_id == user_id, NotebookTopic.is_deleted == False)
        .order_by(NotebookTopic.name)
        .all()
    )


def get_topic(db: Session, user_id: str, topic_id: str):
    return (
        db.query(NotebookTopic)
        .filter(NotebookTopic.id == topic_id, NotebookTopic.user_id == user_id, NotebookTopic.is_deleted == False)
        .first()
    )


def create_topic(db: Session, user_id: str, name: str, emoji: str = None, description: str = None, is_predefined: bool = False):
    name = name.strip()[:100]
    existing = (
        db.query(NotebookTopic)
        .filter(NotebookTopic.user_id == user_id, NotebookTopic.name == name, NotebookTopic.is_deleted == False)
        .first()
    )
    if existing:
        return None  # duplicate

    topic = NotebookTopic(
        user_id=user_id,
        name=name,
        emoji=emoji,
        description=description.strip()[:500] if description else None,
        is_predefined=is_predefined,
    )
    db.add(topic)
    db.commit()
    db.refresh(topic)
    return topic


def update_topic(db: Session, user_id: str, topic_id: str, name: str = None, emoji: str = None, description: str = None):
    topic = get_topic(db, user_id, topic_id)
    if not topic:
        return None
    if name is not None:
        topic.name = name.strip()[:100]
    if emoji is not None:
        topic.emoji = emoji
    if description is not None:
        topic.description = description.strip()[:500] if description else None
    db.commit()
    db.refresh(topic)
    return topic


def delete_topic(db: Session, user_id: str, topic_id: str):
    topic = get_topic(db, user_id, topic_id)
    if not topic:
        return False
    topic.is_deleted = True
    # Orphan the notes (don't delete them)
    db.query(NotebookNote).filter(
        NotebookNote.topic_id == topic_id, NotebookNote.user_id == user_id
    ).update({"topic_id": None})
    db.commit()
    return True


def ensure_predefined_topics(db: Session, user_id: str):
    """Create predefined topics if they don't exist for this user."""
    predefined = [
        ("Proiecte", "Idei pentru proiecte noi"),
        ("Business", "Idei de business si oportunitati"),
        ("Invatare", "Lucruri de invatat si resurse"),
        ("Personal", "Obiective si note personale"),
    ]
    for name, desc in predefined:
        existing = (
            db.query(NotebookTopic)
            .filter(NotebookTopic.user_id == user_id, NotebookTopic.name == name, NotebookTopic.is_deleted == False)
            .first()
        )
        if not existing:
            create_topic(db, user_id, name, description=desc, is_predefined=True)


# ── NOTES - TIME MANAGEMENT STEPS ──────────────────

def get_steps(db: Session, user_id: str):
    return (
        db.query(NotebookNote)
        .filter(
            NotebookNote.user_id == user_id,
            NotebookNote.note_type == "step",
            NotebookNote.is_deleted == False,
        )
        .order_by(NotebookNote.step_order.asc())
        .all()
    )


def add_step(db: Session, user_id: str, content: str, step_order: int = None):
    content = content.strip()[:4000]
    if not content:
        return None
    if step_order is None:
        max_order = (
            db.query(func.max(NotebookNote.step_order))
            .filter(NotebookNote.user_id == user_id, NotebookNote.note_type == "step", NotebookNote.is_deleted == False)
            .scalar()
        )
        step_order = (max_order or 0) + 1

    note = NotebookNote(
        user_id=user_id,
        note_type="step",
        content=content,
        step_order=step_order,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


# ── NOTES - TIME MANAGEMENT TASKS ──────────────────

def get_tasks(db: Session, user_id: str, status: str = None):
    q = db.query(NotebookNote).filter(
        NotebookNote.user_id == user_id,
        NotebookNote.note_type == "task",
        NotebookNote.is_deleted == False,
    )
    if status:
        q = q.filter(NotebookNote.task_status == status)
    return q.order_by(NotebookNote.created_at.desc()).all()


def add_task_note(db: Session, user_id: str, content: str, status: str = "todo"):
    content = content.strip()[:4000]
    if not content:
        return None
    note = NotebookNote(
        user_id=user_id,
        note_type="task",
        content=content,
        task_status=status,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def update_task_status(db: Session, user_id: str, note_id: str, status: str):
    note = db.query(NotebookNote).filter(
        NotebookNote.id == note_id,
        NotebookNote.user_id == user_id,
        NotebookNote.note_type == "task",
        NotebookNote.is_deleted == False,
    ).first()
    if not note:
        return None
    note.task_status = status
    note.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(note)
    return note


# ── NOTES - IDEAS ───────────────────────────────────

def get_ideas_by_topic(db: Session, user_id: str, topic_id: str):
    return (
        db.query(NotebookNote)
        .filter(
            NotebookNote.user_id == user_id,
            NotebookNote.topic_id == topic_id,
            NotebookNote.note_type == "idea",
            NotebookNote.is_deleted == False,
        )
        .order_by(NotebookNote.created_at.desc())
        .all()
    )


def add_idea(db: Session, user_id: str, topic_id: str, content: str):
    content = content.strip()[:4000]
    if not content:
        return None
    # Verify topic belongs to user
    topic = get_topic(db, user_id, topic_id)
    if not topic:
        return None
    note = NotebookNote(
        user_id=user_id,
        note_type="idea",
        topic_id=topic_id,
        content=content,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


# ── EDIT & DELETE (all note types) ──────────────────

def edit_note(db: Session, user_id: str, note_id: str, new_content: str):
    note = db.query(NotebookNote).filter(
        NotebookNote.id == note_id,
        NotebookNote.user_id == user_id,
        NotebookNote.is_deleted == False,
    ).first()
    if not note:
        return None

    # Save old version to history (max 10 enforced at read)
    history = NotebookNoteHistory(note_id=note.id, content=note.content)
    db.add(history)

    # Cleanup: keep only last 10
    old_history = (
        db.query(NotebookNoteHistory)
        .filter(NotebookNoteHistory.note_id == note.id)
        .order_by(NotebookNoteHistory.edited_at.desc())
        .offset(10)
        .all()
    )
    for h in old_history:
        db.delete(h)

    note.content = new_content.strip()[:4000]
    note.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(note)
    return note


def delete_note(db: Session, user_id: str, note_id: str):
    note = db.query(NotebookNote).filter(
        NotebookNote.id == note_id,
        NotebookNote.user_id == user_id,
        NotebookNote.is_deleted == False,
    ).first()
    if not note:
        return False
    note.is_deleted = True
    note.updated_at = datetime.utcnow()
    db.commit()
    return True


def get_note(db: Session, user_id: str, note_id: str):
    return db.query(NotebookNote).filter(
        NotebookNote.id == note_id,
        NotebookNote.user_id == user_id,
        NotebookNote.is_deleted == False,
    ).first()


# ── COUNTS (for limits) ────────────────────────────

def count_topics(db: Session, user_id: str) -> int:
    return db.query(NotebookTopic).filter(
        NotebookTopic.user_id == user_id, NotebookTopic.is_deleted == False
    ).count()


def count_ideas_in_topic(db: Session, user_id: str, topic_id: str) -> int:
    return db.query(NotebookNote).filter(
        NotebookNote.user_id == user_id,
        NotebookNote.topic_id == topic_id,
        NotebookNote.note_type == "idea",
        NotebookNote.is_deleted == False,
    ).count()


def count_steps(db: Session, user_id: str) -> int:
    return db.query(NotebookNote).filter(
        NotebookNote.user_id == user_id,
        NotebookNote.note_type == "step",
        NotebookNote.is_deleted == False,
    ).count()
