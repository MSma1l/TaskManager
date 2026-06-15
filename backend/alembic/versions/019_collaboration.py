"""collaboration: comments + activity log + watchers

Phase 3B of collaboration. Adds three tables:
  - `task_comments` — comentarii per task (corp text, autor).
  - `task_activities` — jurnal de activitate per task / proiect (CREATED, MOVED ...).
  - `task_watchers` — utilizatori care urmaresc un task (PK compus task+user).

Revision ID: 019
Revises: 018
Create Date: 2026-06-15 20:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def _has_table(bind, table: str) -> bool:
    insp = sa.inspect(bind)
    return insp.has_table(table)


def upgrade() -> None:
    bind = op.get_bind()

    # ── task_comments ───────────────────────────────────────────────
    if not _has_table(bind, "task_comments"):
        op.create_table(
            "task_comments",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("task_id", sa.String(), sa.ForeignKey("tasks.id"), nullable=False),
            sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_task_comments_task_id", "task_comments", ["task_id"])

    # ── task_activities ─────────────────────────────────────────────
    if not _has_table(bind, "task_activities"):
        op.create_table(
            "task_activities",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("task_id", sa.String(), sa.ForeignKey("tasks.id"), nullable=False),
            sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("action", sa.String(40), nullable=False),
            sa.Column("meta", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_task_activities_task_id", "task_activities", ["task_id"])
        op.create_index("ix_task_activities_project_id", "task_activities", ["project_id"])
        op.create_index("ix_task_activities_created_at", "task_activities", ["created_at"])

    # ── task_watchers (PK compus task+user) ─────────────────────────
    if not _has_table(bind, "task_watchers"):
        op.create_table(
            "task_watchers",
            sa.Column("task_id", sa.String(), sa.ForeignKey("tasks.id"), primary_key=True),
            sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), primary_key=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_task_watchers_task_id", "task_watchers", ["task_id"])
        op.create_index("ix_task_watchers_user_id", "task_watchers", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()

    if _has_table(bind, "task_watchers"):
        op.drop_index("ix_task_watchers_user_id", table_name="task_watchers")
        op.drop_index("ix_task_watchers_task_id", table_name="task_watchers")
        op.drop_table("task_watchers")

    if _has_table(bind, "task_activities"):
        op.drop_index("ix_task_activities_created_at", table_name="task_activities")
        op.drop_index("ix_task_activities_project_id", table_name="task_activities")
        op.drop_index("ix_task_activities_task_id", table_name="task_activities")
        op.drop_table("task_activities")

    if _has_table(bind, "task_comments"):
        op.drop_index("ix_task_comments_task_id", table_name="task_comments")
        op.drop_table("task_comments")
