"""bug_reports: modul QA — rapoarte de testare/bug per proiect

Adauga:
  - bug_reports             (titlu, descriere, status, severitate, steps JSON)
  - bug_report_attachments  (imagini base64, ca nb_sketches)
  - bug_report_comments     (comentarii pe raport)

Idempotent: create_table protejat de guard pe inspector.

Revision ID: 031
Revises: 030
Create Date: 2026-06-19 09:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "031"
down_revision = "030"
branch_labels = None
depends_on = None


def _has_table(bind, table: str) -> bool:
    return sa.inspect(bind).has_table(table)


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "bug_reports"):
        op.create_table(
            "bug_reports",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("title", sa.String(length=300), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="OPEN"),
            sa.Column("severity", sa.String(length=20), nullable=False, server_default="MEDIUM"),
            sa.Column("steps", sa.JSON(), nullable=True),
            sa.Column("created_by", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("assignee_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("is_active", sa.Boolean(), server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_bug_reports_project_id", "bug_reports", ["project_id"])
        op.create_index("ix_bug_reports_status", "bug_reports", ["status"])

    if not _has_table(bind, "bug_report_attachments"):
        op.create_table(
            "bug_report_attachments",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "bug_report_id", sa.String(),
                sa.ForeignKey("bug_reports.id", ondelete="CASCADE"), nullable=False,
            ),
            sa.Column("image_data", sa.Text(), nullable=False),
            sa.Column("caption", sa.String(length=300), nullable=True),
            sa.Column("created_by", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_bug_report_attachments_bug_report_id", "bug_report_attachments", ["bug_report_id"]
        )

    if not _has_table(bind, "bug_report_comments"):
        op.create_table(
            "bug_report_comments",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "bug_report_id", sa.String(),
                sa.ForeignKey("bug_reports.id", ondelete="CASCADE"), nullable=False,
            ),
            sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_bug_report_comments_bug_report_id", "bug_report_comments", ["bug_report_id"]
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "bug_report_comments"):
        op.drop_table("bug_report_comments")
    if _has_table(bind, "bug_report_attachments"):
        op.drop_table("bug_report_attachments")
    if _has_table(bind, "bug_reports"):
        op.drop_table("bug_reports")
