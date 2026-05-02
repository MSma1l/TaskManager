"""add notebook sketches table for stylus / hand-drawn notes

Revision ID: 008
Revises: 007
Create Date: 2026-05-02 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "nb_sketches",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("topic_id", sa.String(), sa.ForeignKey("nb_topics.id"), nullable=True),
        sa.Column("title", sa.String(150), nullable=True),
        sa.Column("image_data", sa.Text(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_nb_sketches_user_id", "nb_sketches", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_nb_sketches_user_id", table_name="nb_sketches")
    op.drop_table("nb_sketches")
