"""office_and_archive: proiectul de sistem "Birou" + arhivarea taskurilor

Adauga:
  - projects.system_key (String(20), index) — "OFFICE" pentru proiectul Birou.
  - tasks.archived_at (DateTime) — setat cand taskul intra in coloana Verificat.

Idempotent: add_column protejat de guard pe inspector (stil 032/033).

Revision ID: 034
Revises: 033
Create Date: 2026-06-23 13:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "034"
down_revision = "033"
branch_labels = None
depends_on = None


def _cols(bind, table: str) -> set[str]:
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def _indexes(bind, table: str) -> set[str]:
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return set()
    return {ix["name"] for ix in insp.get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if "projects" in tables and "system_key" not in _cols(bind, "projects"):
        op.add_column("projects", sa.Column("system_key", sa.String(length=20), nullable=True))
        if "ix_projects_system_key" not in _indexes(bind, "projects"):
            op.create_index("ix_projects_system_key", "projects", ["system_key"])

    if "tasks" in tables and "archived_at" not in _cols(bind, "tasks"):
        op.add_column("tasks", sa.Column("archived_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()

    if "archived_at" in _cols(bind, "tasks"):
        op.drop_column("tasks", "archived_at")

    if "system_key" in _cols(bind, "projects"):
        if "ix_projects_system_key" in _indexes(bind, "projects"):
            op.drop_index("ix_projects_system_key", table_name="projects")
        op.drop_column("projects", "system_key")
