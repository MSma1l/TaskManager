"""task_attachments: coloana JSON pentru atasamente preluate din Quick Tasks

Adauga tasks.attachments (lista de {type, data(base64), caption}), aceeasi forma
ca quick_tasks.attachments. Preluata pe Task la asignarea unui quick task.

Idempotent: add_column protejat de guard pe inspector.

Revision ID: 035
Revises: 034
Create Date: 2026-06-23 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "035"
down_revision = "034"
branch_labels = None
depends_on = None


def _cols(bind, table: str) -> set[str]:
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if "tasks" in sa.inspect(bind).get_table_names() and "attachments" not in _cols(bind, "tasks"):
        op.add_column("tasks", sa.Column("attachments", sa.JSON(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if "attachments" in _cols(bind, "tasks"):
        op.drop_column("tasks", "attachments")
