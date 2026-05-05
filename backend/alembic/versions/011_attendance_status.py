"""add attendance_status + attendance_note on calendar_events

Revision ID: 011
Revises: 010
Create Date: 2026-05-04 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def _has_column(bind, table: str, column: str) -> bool:
    insp = sa.inspect(bind)
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    # Idempotent: only add columns that don't already exist on the live DB.
    # Some servers had this schema applied manually (or via a prior partial
    # migration run) before alembic_version was bumped to 011.
    bind = op.get_bind()
    if not _has_column(bind, "calendar_events", "attendance_status"):
        op.add_column(
            "calendar_events",
            sa.Column("attendance_status", sa.String(20), nullable=False, server_default="PENDING"),
        )
    if not _has_column(bind, "calendar_events", "attendance_note"):
        op.add_column(
            "calendar_events",
            sa.Column("attendance_note", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _has_column(bind, "calendar_events", "attendance_note"):
        op.drop_column("calendar_events", "attendance_note")
    if _has_column(bind, "calendar_events", "attendance_status"):
        op.drop_column("calendar_events", "attendance_status")
