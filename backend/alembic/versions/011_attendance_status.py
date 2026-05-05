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


def upgrade() -> None:
    op.add_column(
        "calendar_events",
        sa.Column("attendance_status", sa.String(20), nullable=False, server_default="PENDING"),
    )
    op.add_column(
        "calendar_events",
        sa.Column("attendance_note", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("calendar_events", "attendance_note")
    op.drop_column("calendar_events", "attendance_status")
