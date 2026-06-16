"""friendships: lista de colaboratori (prieteni / colegi) per user

Revision ID: 024
Revises: 023
Create Date: 2026-06-16 15:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "024"
down_revision = "023"
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
    if not _has_table(bind, "friendships"):
        op.create_table(
            "friendships",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("requester_id", sa.String(), nullable=False),
            sa.Column("addressee_id", sa.String(), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
            sa.Column("relation", sa.String(20), nullable=False, server_default="colleague"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("responded_at", sa.DateTime(), nullable=True),
        )

    existing = _indexes(bind, "friendships")
    if "ix_friendships_requester_id" not in existing:
        op.create_index("ix_friendships_requester_id", "friendships", ["requester_id"])
    if "ix_friendships_addressee_id" not in existing:
        op.create_index("ix_friendships_addressee_id", "friendships", ["addressee_id"])
    if "ix_friendships_status" not in existing:
        op.create_index("ix_friendships_status", "friendships", ["status"])
    if "ix_friendships_pair" not in existing:
        op.create_index("ix_friendships_pair", "friendships", ["requester_id", "addressee_id"])


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "friendships"):
        return
    existing = _indexes(bind, "friendships")
    for name in (
        "ix_friendships_pair",
        "ix_friendships_status",
        "ix_friendships_addressee_id",
        "ix_friendships_requester_id",
    ):
        if name in existing:
            op.drop_index(name, table_name="friendships")
    op.drop_table("friendships")
