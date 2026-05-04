"""add access_requests table + phone column on users

Revision ID: 010
Revises: 009
Create Date: 2026-05-03 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone", sa.String(40), nullable=True))

    op.create_table(
        "access_requests",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(150), nullable=True),
        sa.Column("phone", sa.String(40), nullable=True),
        sa.Column("telegram_chat_id", sa.String(50), nullable=True),
        sa.Column("purpose", sa.String(20), nullable=False, server_default="personal"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("processed_by_user_id", sa.String(), nullable=True),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
        sa.Column("created_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_access_requests_status", "access_requests", ["status"])


def downgrade() -> None:
    op.drop_index("ix_access_requests_status", table_name="access_requests")
    op.drop_table("access_requests")
    op.drop_column("users", "phone")
