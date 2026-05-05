"""add user_id to tasks + projects (per-user isolation)

Until now, tasks and projects were SHARED across all users (no user_id
column), which meant any new user — including via Telegram — could see and
modify everyone else's data. This migration assigns existing rows to the
oldest admin and tightens future writes.

Revision ID: 012
Revises: 011
Create Date: 2026-05-05 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def _has_column(bind, table: str, column: str) -> bool:
    insp = sa.inspect(bind)
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()

    # ── tasks.user_id ──────────────────────────────────────────────
    if not _has_column(bind, "tasks", "user_id"):
        op.add_column("tasks", sa.Column("user_id", sa.String(), nullable=True))

    # ── projects.user_id ───────────────────────────────────────────
    if not _has_column(bind, "projects", "user_id"):
        op.add_column("projects", sa.Column("user_id", sa.String(), nullable=True))

    # Backfill: assign every existing task / project to the OLDEST admin.
    # If no admin exists yet (very first run), leave NULL — seed will
    # create the admin and a later assignment can be done manually if
    # the user wants pre-existing tasks tied somewhere else.
    admin_row = bind.execute(sa.text(
        "SELECT id FROM users WHERE role = 'ADMIN' AND is_active = true "
        "ORDER BY created_at ASC LIMIT 1"
    )).fetchone()

    if admin_row is not None:
        admin_id = admin_row[0]
        bind.execute(sa.text(
            "UPDATE tasks SET user_id = :uid WHERE user_id IS NULL"
        ), {"uid": admin_id})
        bind.execute(sa.text(
            "UPDATE projects SET user_id = :uid WHERE user_id IS NULL"
        ), {"uid": admin_id})

    # Index for fast per-user filtering
    op.create_index("ix_tasks_user_id", "tasks", ["user_id"])
    op.create_index("ix_projects_user_id", "projects", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    op.drop_index("ix_projects_user_id", table_name="projects")
    op.drop_index("ix_tasks_user_id", table_name="tasks")
    if _has_column(bind, "projects", "user_id"):
        op.drop_column("projects", "user_id")
    if _has_column(bind, "tasks", "user_id"):
        op.drop_column("tasks", "user_id")
