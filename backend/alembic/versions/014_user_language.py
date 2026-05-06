"""add language column to users (ro / ru)

Revision ID: 014
Revises: 013
Create Date: 2026-05-06 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def _has_column(bind, table: str, column: str) -> bool:
    insp = sa.inspect(bind)
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_column(bind, "users", "language"):
        op.add_column(
            "users",
            sa.Column("language", sa.String(5), nullable=False, server_default="ro"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _has_column(bind, "users", "language"):
        op.drop_column("users", "language")
