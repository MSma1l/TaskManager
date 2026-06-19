"""quick_task_attachments: coloana JSON pentru screenshot-uri + mesaje vocale

Adauga quick_tasks.attachments (lista de {type, data(base64), caption}).

Idempotent: add_column protejat de guard pe inspector.

Revision ID: 032
Revises: 031
Create Date: 2026-06-19 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "032"
down_revision = "031"
branch_labels = None
depends_on = None


def _cols(bind, table: str) -> set[str]:
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if "quick_tasks" in sa.inspect(bind).get_table_names() and "attachments" not in _cols(bind, "quick_tasks"):
        op.add_column("quick_tasks", sa.Column("attachments", sa.JSON(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if "attachments" in _cols(bind, "quick_tasks"):
        op.drop_column("quick_tasks", "attachments")
