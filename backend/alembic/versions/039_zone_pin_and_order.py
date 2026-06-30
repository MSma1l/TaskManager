"""zone_pin_and_order: pin manual de zona + ordine in zona (proiecte + taskuri board)

Adauga:
  - projects.pinned_zone (String(20)) — pin manual de zona care invinge deadline-ul.
  - projects.zone_order  (Integer)    — pozitia in zona (drag & drop intra-zona).
  - tasks.pinned_zone    (String(20)) — pin manual de zona care invinge deadline-ul.
  - tasks.zone_order     (Integer)    — pozitia in zona (drag & drop intra-zona).

Idempotent: add_column protejate de guard pe inspector (stil 038).

Revision ID: 039
Revises: 038
Create Date: 2026-06-30 13:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "039"
down_revision = "038"
branch_labels = None
depends_on = None


def _cols(bind, table: str) -> set[str]:
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())

    if "projects" in tables:
        project_cols = _cols(bind, "projects")
        if "pinned_zone" not in project_cols:
            op.add_column("projects", sa.Column("pinned_zone", sa.String(length=20), nullable=True))
        if "zone_order" not in project_cols:
            op.add_column("projects", sa.Column("zone_order", sa.Integer(), nullable=True))

    if "tasks" in tables:
        task_cols = _cols(bind, "tasks")
        if "pinned_zone" not in task_cols:
            op.add_column("tasks", sa.Column("pinned_zone", sa.String(length=20), nullable=True))
        if "zone_order" not in task_cols:
            op.add_column("tasks", sa.Column("zone_order", sa.Integer(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()

    task_cols = _cols(bind, "tasks")
    if "zone_order" in task_cols:
        op.drop_column("tasks", "zone_order")
    if "pinned_zone" in task_cols:
        op.drop_column("tasks", "pinned_zone")

    project_cols = _cols(bind, "projects")
    if "zone_order" in project_cols:
        op.drop_column("projects", "zone_order")
    if "pinned_zone" in project_cols:
        op.drop_column("projects", "pinned_zone")
