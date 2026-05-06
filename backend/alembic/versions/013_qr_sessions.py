"""qr_sessions table for QR scan-to-login flow

Revision ID: 013
Revises: 012
Create Date: 2026-05-05 14:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def _has_table(bind, table: str) -> bool:
    insp = sa.inspect(bind)
    return insp.has_table(table)


def upgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "qr_sessions"):
        return
    op.create_table(
        "qr_sessions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("issued_token", sa.String(), nullable=True),
        sa.Column("token_expires_at", sa.DateTime(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_qr_sessions_status", "qr_sessions", ["status"])


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "qr_sessions"):
        op.drop_index("ix_qr_sessions_status", table_name="qr_sessions")
        op.drop_table("qr_sessions")
