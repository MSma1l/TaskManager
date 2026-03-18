"""add notebook tables

Revision ID: 004
Revises: 003
Create Date: 2024-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "nb_topics",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("emoji", sa.String(10), nullable=True),
        sa.Column("is_predefined", sa.Boolean(), server_default="false"),
        sa.Column("is_deleted", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("idx_nb_topics_user", "nb_topics", ["user_id"], postgresql_where=sa.text("is_deleted = false"))

    op.create_table(
        "nb_notes",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("note_type", sa.String(20), nullable=False),
        sa.Column("topic_id", sa.String(), sa.ForeignKey("nb_topics.id"), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("step_order", sa.SmallInteger(), nullable=True),
        sa.Column("task_status", sa.String(20), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("idx_nb_notes_user", "nb_notes", ["user_id"], postgresql_where=sa.text("is_deleted = false"))
    op.create_index("idx_nb_notes_topic", "nb_notes", ["topic_id"], postgresql_where=sa.text("is_deleted = false"))

    op.create_table(
        "nb_note_history",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("note_id", sa.String(), sa.ForeignKey("nb_notes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("edited_at", sa.DateTime(), nullable=True),
    )
    op.create_index("idx_nb_history_note", "nb_note_history", ["note_id"])


def downgrade() -> None:
    op.drop_table("nb_note_history")
    op.drop_table("nb_notes")
    op.drop_table("nb_topics")
