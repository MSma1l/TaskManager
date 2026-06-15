"""workflow: project key + task counter, task number + due date

Phase 2.5 of collaboration: projects gain a short KEY (ex: "IA") and a
per-project task_counter so board tasks get a human-friendly number
(IA-1, IA-2, ...). Tasks gain task_number and due_date.

Revision ID: 017
Revises: 016
Create Date: 2026-06-15 16:00:00.000000
"""
import re

from alembic import op
import sqlalchemy as sa


revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def _has_column(bind, table: str, column: str) -> bool:
    insp = sa.inspect(bind)
    return column in {c["name"] for c in insp.get_columns(table)}


def _derive_key(name: str) -> str:
    """Cheie din nume: literele/cifrele alfanumerice, uppercase, max 4, fallback PRJ."""
    if not name:
        return "PRJ"
    alnum = re.sub(r"[^A-Za-z0-9]", "", name)
    if not alnum:
        return "PRJ"
    return alnum[:4].upper()


def upgrade() -> None:
    bind = op.get_bind()

    # ── projects.key / projects.task_counter ────────────────────────
    if not _has_column(bind, "projects", "key"):
        op.add_column("projects", sa.Column("key", sa.String(10), nullable=True))
    if not _has_column(bind, "projects", "task_counter"):
        op.add_column(
            "projects",
            sa.Column("task_counter", sa.Integer(), nullable=False, server_default="0"),
        )

    # ── tasks.task_number / tasks.due_date ──────────────────────────
    if not _has_column(bind, "tasks", "task_number"):
        op.add_column("tasks", sa.Column("task_number", sa.Integer(), nullable=True))
    if not _has_column(bind, "tasks", "due_date"):
        op.add_column("tasks", sa.Column("due_date", sa.DateTime(), nullable=True))

    # ── backfill key + task_counter pentru proiectele existente ─────
    projects = bind.execute(sa.text(
        "SELECT id, name FROM projects WHERE key IS NULL"
    )).fetchall()
    for project_id, name in projects:
        bind.execute(sa.text(
            "UPDATE projects SET key = :key, task_counter = 0 WHERE id = :pid"
        ), {"key": _derive_key(name), "pid": project_id})


def downgrade() -> None:
    bind = op.get_bind()

    if _has_column(bind, "tasks", "due_date"):
        op.drop_column("tasks", "due_date")
    if _has_column(bind, "tasks", "task_number"):
        op.drop_column("tasks", "task_number")
    if _has_column(bind, "projects", "task_counter"):
        op.drop_column("projects", "task_counter")
    if _has_column(bind, "projects", "key"):
        op.drop_column("projects", "key")
