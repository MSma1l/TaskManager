"""calendar_token: secret per-user token pentru feed iCal (.ics) read-only

Revision ID: 027
Revises: 026
Create Date: 2026-06-16 16:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "027"
down_revision = "026"
branch_labels = None
depends_on = None


def _columns(bind, table: str) -> set[str]:
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return set()
    return {col["name"] for col in insp.get_columns(table)}


def _indexes(bind, table: str) -> set[str]:
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return set()
    return {ix["name"] for ix in insp.get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if "calendar_token" not in _columns(bind, "users"):
        op.add_column("users", sa.Column("calendar_token", sa.String(64), nullable=True))
    if "ix_users_calendar_token" not in _indexes(bind, "users"):
        op.create_index(
            "ix_users_calendar_token",
            "users",
            ["calendar_token"],
            unique=True,
        )


def downgrade() -> None:
    bind = op.get_bind()
    if "ix_users_calendar_token" in _indexes(bind, "users"):
        op.drop_index("ix_users_calendar_token", table_name="users")
    if "calendar_token" in _columns(bind, "users"):
        op.drop_column("users", "calendar_token")
