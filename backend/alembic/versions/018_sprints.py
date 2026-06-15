"""sprints + story points + member capacity

Phase 3A of collaboration: project-management core. Adds a `sprints` table,
`tasks.story_points` + `tasks.sprint_id`, and `project_members.capacity_points`.
Tasks can be grouped into a sprint; members declare a per-sprint capacity in
story points so we can warn about over-allocation.

Revision ID: 018
Revises: 017
Create Date: 2026-06-15 18:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def _has_table(bind, table: str) -> bool:
    insp = sa.inspect(bind)
    return insp.has_table(table)


def _has_column(bind, table: str, column: str) -> bool:
    insp = sa.inspect(bind)
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()

    # ── sprints (creat INAINTE de FK-ul tasks.sprint_id) ────────────
    if not _has_table(bind, "sprints"):
        op.create_table(
            "sprints",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("project_id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("goal", sa.Text(), nullable=True),
            sa.Column("start_date", sa.DateTime(), nullable=True),
            sa.Column("end_date", sa.DateTime(), nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="PLANNED"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_sprints_project_id", "sprints", ["project_id"])

    # ── tasks.story_points ──────────────────────────────────────────
    if not _has_column(bind, "tasks", "story_points"):
        op.add_column("tasks", sa.Column("story_points", sa.Integer(), nullable=True))

    # ── tasks.sprint_id (+ index, + FK catre sprints) ───────────────
    if not _has_column(bind, "tasks", "sprint_id"):
        op.add_column(
            "tasks",
            sa.Column(
                "sprint_id",
                sa.String(),
                sa.ForeignKey("sprints.id"),
                nullable=True,
            ),
        )
        op.create_index("ix_tasks_sprint_id", "tasks", ["sprint_id"])

    # ── project_members.capacity_points (backfill la 10) ────────────
    if not _has_column(bind, "project_members", "capacity_points"):
        op.add_column(
            "project_members",
            sa.Column("capacity_points", sa.Integer(), nullable=False, server_default="10"),
        )
        # Backfill explicit (server_default acopera deja, dar fim consecventi).
        bind.execute(sa.text(
            "UPDATE project_members SET capacity_points = 10 WHERE capacity_points IS NULL"
        ))


def downgrade() -> None:
    bind = op.get_bind()

    if _has_column(bind, "project_members", "capacity_points"):
        op.drop_column("project_members", "capacity_points")

    if _has_column(bind, "tasks", "sprint_id"):
        op.drop_index("ix_tasks_sprint_id", table_name="tasks")
        op.drop_column("tasks", "sprint_id")
    if _has_column(bind, "tasks", "story_points"):
        op.drop_column("tasks", "story_points")

    if _has_table(bind, "sprints"):
        op.drop_index("ix_sprints_project_id", table_name="sprints")
        op.drop_table("sprints")
