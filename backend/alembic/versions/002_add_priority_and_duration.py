"""add priority and estimated_minutes to tasks

Revision ID: 002
Revises: 001
Create Date: 2024-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("priority", sa.String(), nullable=False, server_default="MEDIUM"))
    op.add_column("tasks", sa.Column("estimated_minutes", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "estimated_minutes")
    op.drop_column("tasks", "priority")
