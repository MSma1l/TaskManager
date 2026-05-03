"""add password_hash to users for admin password login

Revision ID: 009
Revises: 008
Create Date: 2026-05-02 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "password_hash")
