"""show_on_today: flag per proiect pentru board-ul comun "Astazi" (Today)

Adauga projects.show_on_today (boolean, NOT NULL, default false). Cand e True,
taskurile proiectului apar pe board-ul agregat "Astazi".

Idempotent: add_column/drop_column protejate de guard pe inspector.

Revision ID: 036
Revises: 035
Create Date: 2026-06-23 13:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "036"
down_revision = "035"
branch_labels = None
depends_on = None


def _cols(bind, table: str) -> set[str]:
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if "projects" in sa.inspect(bind).get_table_names() and "show_on_today" not in _cols(bind, "projects"):
        op.add_column(
            "projects",
            sa.Column("show_on_today", sa.Boolean(), nullable=False, server_default="false"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if "show_on_today" in _cols(bind, "projects"):
        op.drop_column("projects", "show_on_today")
