"""push_subscriptions: abonamente Web Push (VAPID) per browser/dispozitiv

Revision ID: 026
Revises: 025
Create Date: 2026-06-16 16:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "026"
down_revision = "025"
branch_labels = None
depends_on = None


def _has_table(bind, table: str) -> bool:
    return sa.inspect(bind).has_table(table)


def _indexes(bind, table: str) -> set[str]:
    if not _has_table(bind, table):
        return set()
    return {ix["name"] for ix in sa.inspect(bind).get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "push_subscriptions"):
        op.create_table(
            "push_subscriptions",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("endpoint", sa.Text(), nullable=False),
            sa.Column("p256dh", sa.String(), nullable=False),
            sa.Column("auth", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("endpoint", name="uq_push_subscriptions_endpoint"),
        )

    existing = _indexes(bind, "push_subscriptions")
    if "ix_push_subscriptions_user_id" not in existing:
        op.create_index("ix_push_subscriptions_user_id", "push_subscriptions", ["user_id"])
    if "ix_push_subscriptions_created_at" not in existing:
        op.create_index("ix_push_subscriptions_created_at", "push_subscriptions", ["created_at"])


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "push_subscriptions"):
        return
    existing = _indexes(bind, "push_subscriptions")
    for name in ("ix_push_subscriptions_created_at", "ix_push_subscriptions_user_id"):
        if name in existing:
            op.drop_index(name, table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
