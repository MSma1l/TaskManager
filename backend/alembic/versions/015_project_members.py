"""project_members table for per-project membership with roles

Phase 1 of collaboration: projects gain explicit membership rows so that
access is determined by membership (not just the legacy projects.user_id).
Every existing project gets a single OWNER membership row for its current
owner (projects.user_id) so nobody loses access after the migration.

Revision ID: 015
Revises: 014
Create Date: 2026-06-15 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# alembic/env.py inserts the backend root into sys.path before running
# migrations, so `app` is importable here.
from app.models.base import generate_cuid


revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def _has_table(bind, table: str) -> bool:
    insp = sa.inspect(bind)
    return insp.has_table(table)


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "project_members"):
        op.create_table(
            "project_members",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("project_id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("role", sa.String(20), nullable=False, server_default="MEMBER"),
            sa.Column("invited_by", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("project_id", "user_id", name="uq_project_member"),
        )
        op.create_index("ix_project_members_project_id", "project_members", ["project_id"])
        op.create_index("ix_project_members_user_id", "project_members", ["user_id"])

    # Backfill: one OWNER membership per existing project with a known owner.
    # Skip projects whose user_id is NULL or that already have a membership row.
    projects = bind.execute(sa.text(
        "SELECT id, user_id FROM projects WHERE user_id IS NOT NULL"
    )).fetchall()

    for project_id, owner_id in projects:
        exists = bind.execute(sa.text(
            "SELECT 1 FROM project_members "
            "WHERE project_id = :pid AND user_id = :uid LIMIT 1"
        ), {"pid": project_id, "uid": owner_id}).fetchone()
        if exists is not None:
            continue
        bind.execute(sa.text(
            "INSERT INTO project_members "
            "(id, project_id, user_id, role, invited_by, created_at) "
            "VALUES (:id, :pid, :uid, 'OWNER', :uid, NOW())"
        ), {"id": generate_cuid(), "pid": project_id, "uid": owner_id})


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "project_members"):
        op.drop_index("ix_project_members_user_id", table_name="project_members")
        op.drop_index("ix_project_members_project_id", table_name="project_members")
        op.drop_table("project_members")
