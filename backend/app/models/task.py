from datetime import datetime
from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import generate_cuid


class Task(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, default=generate_cuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category_id = Column(String, ForeignKey("categories.id"), nullable=True)
    day_of_week = Column(Integer, nullable=True)  # 1=Mon, 7=Sun
    scheduled_date = Column(DateTime, nullable=True)
    reminder_time = Column(String, nullable=True)  # "HH:MM"
    is_recurring = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    priority = Column(String, default="MEDIUM", nullable=False)
    estimated_minutes = Column(Integer, nullable=True)
    due_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project_id = Column(String, ForeignKey("projects.id"), nullable=True)

    # ── Zone de prioritate (board) ──────────────────────────────────
    # Override manual de zona, distinct de `priority` (care e LOW/MEDIUM/HIGH/URGENT).
    # Valori: URGENT|MEDIUM|NORMAL|BACKLOG. Folosit cand nu exista deadline (due_date).
    zone_override = Column(String(20), nullable=True)
    # Ultima zona calculata (bookkeeping pentru detectarea tranzitiilor de scheduler).
    last_zone = Column(String(20), nullable=True)
    # Pin manual de zona: invinge deadline-ul (URGENT|MEDIUM|NORMAL|BACKLOG). NULL = neprins.
    pinned_zone = Column(String(20), nullable=True)
    # Pozitia in zona (drag & drop intra-zona). NULL = nesetat.
    zone_order = Column(Integer, nullable=True)

    # ── Board (Kanban) ──────────────────────────────────────────────
    board_column_id = Column(String, ForeignKey("board_columns.id"), nullable=True, index=True)
    board_order = Column(Integer, nullable=True)
    assignee_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    task_number = Column(Integer, nullable=True)  # numar secvential per proiect (cheie: KEY-<task_number>)

    # ── Story points + sprint (Faza 3A) ─────────────────────────────
    story_points = Column(Integer, nullable=True)  # estimare efort 1-10
    sprint_id = Column(String, ForeignKey("sprints.id"), nullable=True, index=True)

    # ── Ciclu de aprobare (Quick Tasks / verificare) ────────────────
    # NULL | PENDING_REVIEW (raportat finalizat, asteapta admin) |
    # NEEDS_FIX (intors la corectare) | APPROVED | REJECTED
    approval_status = Column(String(20), nullable=True, index=True)
    # Sursa task-ului: NULL = normal | "QUICK" = creat dintr-un Quick Task public
    origin = Column(String(20), nullable=True)

    # ── Subtaskuri / checklist (Faza 4) ─────────────────────────────
    # Lista de {"id": cuid, "title": str, "done": bool}, ordonata.
    subtasks = Column(JSON, nullable=True)

    # ── Atasamente (preluate din Quick Task la asignare) ─────────────
    # Screenshot-uri + mesaje vocale ca data URL base64, aceeasi forma ca la
    # quick_tasks.attachments: lista de
    # {"type": "image"|"audio", "data": "data:...;base64,...", "caption": str|None}
    attachments = Column(JSON, nullable=True)

    # ── Arhivare (Verificat) ────────────────────────────────────────
    # Setat cand taskul (intr-un proiect non-Birou) intra intr-o coloana
    # de tip APPROVED (Verificat). Sters cand iese din ea. Folosit de view-ul
    # "Repartizate" pentru sectiunea de arhiva si de finalize (hard delete).
    archived_at = Column(DateTime, nullable=True)

    category = relationship("Category", back_populates="tasks")
    completions = relationship("TaskCompletion", back_populates="task")
    project = relationship("Project", back_populates="tasks")
    labels = relationship("Label", secondary="task_labels")
    assignees = relationship("User", secondary="task_assignees")
