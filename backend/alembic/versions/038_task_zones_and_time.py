"""task_zones_and_time: zone de prioritate pe taskuri de board + time tracking

Adauga:
  - tasks.zone_override (String(20)) — override manual de zona: URGENT|MEDIUM|NORMAL|BACKLOG.
  - tasks.last_zone     (String(20)) — ultima zona calculata (bookkeeping pentru
    detectarea tranzitiilor de catre scheduler).
  - task_time_entries — pontaje (start/stop) per task / user, cu durata in secunde.
  - task_reminder_logs — dedup pentru remindere zilnice pe taskuri (countdown URGENT).

Idempotent: add_column / create_table protejate de guard pe inspector (stil 037).

Revision ID: 038
Revises: 037
Create Date: 2026-06-30 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "038"
down_revision = "037"
branch_labels = None
depends_on = None


def _cols(bind, table: str) -> set[str]:
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def _has_table(bind, table: str) -> bool:
    return sa.inspect(bind).has_table(table)


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())

    if "tasks" in tables:
        task_cols = _cols(bind, "tasks")
        if "zone_override" not in task_cols:
            op.add_column("tasks", sa.Column("zone_override", sa.String(length=20), nullable=True))
        if "last_zone" not in task_cols:
            op.add_column("tasks", sa.Column("last_zone", sa.String(length=20), nullable=True))

    if not _has_table(bind, "task_time_entries"):
        op.create_table(
            "task_time_entries",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("task_id", sa.String(), sa.ForeignKey("tasks.id"), nullable=False),
            sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("started_at", sa.DateTime(), nullable=False),
            sa.Column("stopped_at", sa.DateTime(), nullable=True),
            sa.Column("duration_seconds", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_task_time_entries_task_id", "task_time_entries", ["task_id"])
        op.create_index("ix_task_time_entries_project_id", "task_time_entries", ["project_id"])
        op.create_index("ix_task_time_entries_user_id", "task_time_entries", ["user_id"])

    if not _has_table(bind, "task_reminder_logs"):
        op.create_table(
            "task_reminder_logs",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("task_id", sa.String(), sa.ForeignKey("tasks.id"), nullable=False),
            sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("kind", sa.String(length=20), nullable=False),
            sa.Column("sent_date", sa.String(length=10), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint(
                "task_id", "user_id", "kind", "sent_date",
                name="uq_task_reminder_log",
            ),
        )
        op.create_index("ix_task_reminder_logs_task_id", "task_reminder_logs", ["task_id"])
        op.create_index("ix_task_reminder_logs_project_id", "task_reminder_logs", ["project_id"])
        op.create_index("ix_task_reminder_logs_user_id", "task_reminder_logs", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()

    if _has_table(bind, "task_reminder_logs"):
        op.drop_table("task_reminder_logs")

    if _has_table(bind, "task_time_entries"):
        op.drop_table("task_time_entries")

    task_cols = _cols(bind, "tasks")
    if "last_zone" in task_cols:
        op.drop_column("tasks", "last_zone")
    if "zone_override" in task_cols:
        op.drop_column("tasks", "zone_override")
