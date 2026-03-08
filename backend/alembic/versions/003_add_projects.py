"""add projects table and project_id to tasks

Revision ID: 003
Revises: 002
Create Date: 2024-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("github_url", sa.String(), nullable=True),
        sa.Column("color", sa.String(), server_default="#3b82f6"),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.add_column("tasks", sa.Column("project_id", sa.String(), nullable=True))
    op.create_foreign_key("fk_tasks_project_id", "tasks", "projects", ["project_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_tasks_project_id", "tasks", type_="foreignkey")
    op.drop_column("tasks", "project_id")
    op.drop_table("projects")
