"""pm_platform: status proiect, ciclu aprobare task, raport sprint, quick tasks, report shares

Adauga fundatia pentru platforma de project management extinsa:
  - projects.status            (ACTIVE | ON_HOLD | ARCHIVED)
  - tasks.approval_status      (NULL | PENDING_REVIEW | NEEDS_FIX | APPROVED | REJECTED)
  - tasks.origin               (NULL | QUICK)
  - sprints.closed_at, sprints.report (snapshot raport la inchidere)
  - tabel quick_tasks          (taskuri rapide din formular public)
  - tabel report_shares        (linkuri publice read-only "View Account")

Idempotent: fiecare add_column / create_table e protejat de un guard pe
inspector, deci migrarea poate fi re-rulata fara erori.

Revision ID: 030
Revises: 029
Create Date: 2026-06-18 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "030"
down_revision = "029"
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

    # ── projects.status ──────────────────────────────────────────────
    if "status" not in _cols(bind, "projects"):
        op.add_column(
            "projects",
            sa.Column("status", sa.String(length=20), nullable=False, server_default="ACTIVE"),
        )

    # ── tasks.approval_status / origin ───────────────────────────────
    task_cols = _cols(bind, "tasks")
    if "approval_status" not in task_cols:
        op.add_column("tasks", sa.Column("approval_status", sa.String(length=20), nullable=True))
        op.create_index("ix_tasks_approval_status", "tasks", ["approval_status"])
    if "origin" not in task_cols:
        op.add_column("tasks", sa.Column("origin", sa.String(length=20), nullable=True))

    # ── sprints.closed_at / report ───────────────────────────────────
    sprint_cols = _cols(bind, "sprints")
    if "closed_at" not in sprint_cols:
        op.add_column("sprints", sa.Column("closed_at", sa.DateTime(), nullable=True))
    if "report" not in sprint_cols:
        op.add_column("sprints", sa.Column("report", sa.JSON(), nullable=True))

    # ── quick_tasks ──────────────────────────────────────────────────
    if not _has_table(bind, "quick_tasks"):
        op.create_table(
            "quick_tasks",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("requester_name", sa.String(length=150), nullable=False),
            sa.Column("title", sa.String(length=300), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("priority", sa.String(length=20), nullable=False, server_default="NORMAL"),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="NEW"),
            sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id"), nullable=True),
            sa.Column("assignee_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("task_id", sa.String(), sa.ForeignKey("tasks.id"), nullable=True),
            sa.Column("processed_by_user_id", sa.String(), nullable=True),
            sa.Column("processed_at", sa.DateTime(), nullable=True),
            sa.Column("notified_at", sa.DateTime(), nullable=True),
            sa.Column("is_active", sa.Boolean(), server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_quick_tasks_status", "quick_tasks", ["status"])

    # ── report_shares ────────────────────────────────────────────────
    if not _has_table(bind, "report_shares"):
        op.create_table(
            "report_shares",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("token", sa.String(length=40), nullable=False),
            sa.Column("scope", sa.String(length=20), nullable=False, server_default="team"),
            sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id"), nullable=True),
            sa.Column("label", sa.String(length=150), nullable=True),
            sa.Column("created_by", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("is_active", sa.Boolean(), server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_report_shares_token", "report_shares", ["token"], unique=True)


def downgrade() -> None:
    bind = op.get_bind()

    if _has_table(bind, "report_shares"):
        op.drop_table("report_shares")
    if _has_table(bind, "quick_tasks"):
        op.drop_table("quick_tasks")

    sprint_cols = _cols(bind, "sprints")
    if "report" in sprint_cols:
        op.drop_column("sprints", "report")
    if "closed_at" in sprint_cols:
        op.drop_column("sprints", "closed_at")

    task_cols = _cols(bind, "tasks")
    if "origin" in task_cols:
        op.drop_column("tasks", "origin")
    if "approval_status" in task_cols:
        op.drop_index("ix_tasks_approval_status", table_name="tasks")
        op.drop_column("tasks", "approval_status")

    if "status" in _cols(bind, "projects"):
        op.drop_column("projects", "status")
