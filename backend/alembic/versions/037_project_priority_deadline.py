"""project_priority_deadline: zone de prioritate + deadline + notificari pe proiecte

Adauga:
  - projects.deadline   (DateTime) — termenul limita al proiectului (optional).
  - projects.priority   (String(20)) — override manual de zona: URGENT|MEDIUM|NORMAL|BACKLOG.
  - projects.last_zone  (String(20)) — ultima zona calculata (bookkeeping pentru
    detectarea tranzitiilor de catre scheduler).
  - project_reminder_logs — dedup pentru remindere zilnice (ex: countdown URGENT).

Idempotent: add_column / create_table protejate de guard pe inspector (stil 034/036).

Revision ID: 037
Revises: 036
Create Date: 2026-06-30 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "037"
down_revision = "036"
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

    if "projects" in tables:
        proj_cols = _cols(bind, "projects")
        if "deadline" not in proj_cols:
            op.add_column("projects", sa.Column("deadline", sa.DateTime(), nullable=True))
        if "priority" not in proj_cols:
            op.add_column("projects", sa.Column("priority", sa.String(length=20), nullable=True))
        if "last_zone" not in proj_cols:
            op.add_column("projects", sa.Column("last_zone", sa.String(length=20), nullable=True))

    if not _has_table(bind, "project_reminder_logs"):
        op.create_table(
            "project_reminder_logs",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("kind", sa.String(length=20), nullable=False),
            sa.Column("sent_date", sa.String(length=10), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint(
                "project_id", "user_id", "kind", "sent_date",
                name="uq_project_reminder_log",
            ),
        )
        op.create_index(
            "ix_project_reminder_logs_project_id", "project_reminder_logs", ["project_id"]
        )
        op.create_index(
            "ix_project_reminder_logs_user_id", "project_reminder_logs", ["user_id"]
        )


def downgrade() -> None:
    bind = op.get_bind()

    if _has_table(bind, "project_reminder_logs"):
        op.drop_table("project_reminder_logs")

    proj_cols = _cols(bind, "projects")
    if "last_zone" in proj_cols:
        op.drop_column("projects", "last_zone")
    if "priority" in proj_cols:
        op.drop_column("projects", "priority")
    if "deadline" in proj_cols:
        op.drop_column("projects", "deadline")
