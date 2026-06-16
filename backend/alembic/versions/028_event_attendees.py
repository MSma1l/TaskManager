"""event_attendees: participanti reali (utilizatori) la evenimente de calendar

Tabel nou `calendar_event_attendees` (event_id FK, user_id FK, status, timestamps).
Idempotent — verifica existenta tabelei/indecsilor inainte de creare.

Revision ID: 028
Revises: 027
Create Date: 2026-06-16 18:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "028"
down_revision = "027"
branch_labels = None
depends_on = None


def _has_table(bind, table: str) -> bool:
    return sa.inspect(bind).has_table(table)


def _indexes(bind, table: str) -> set[str]:
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return set()
    return {ix["name"] for ix in insp.get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "calendar_event_attendees"):
        op.create_table(
            "calendar_event_attendees",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("event_id", sa.String(), sa.ForeignKey("calendar_events.id"), nullable=False),
            sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="INVITED"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
    existing = _indexes(bind, "calendar_event_attendees")
    if "ix_calendar_event_attendees_event_id" not in existing:
        op.create_index(
            "ix_calendar_event_attendees_event_id",
            "calendar_event_attendees",
            ["event_id"],
        )
    if "ix_calendar_event_attendees_user_id" not in existing:
        op.create_index(
            "ix_calendar_event_attendees_user_id",
            "calendar_event_attendees",
            ["user_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    existing = _indexes(bind, "calendar_event_attendees")
    if "ix_calendar_event_attendees_user_id" in existing:
        op.drop_index("ix_calendar_event_attendees_user_id", table_name="calendar_event_attendees")
    if "ix_calendar_event_attendees_event_id" in existing:
        op.drop_index("ix_calendar_event_attendees_event_id", table_name="calendar_event_attendees")
    if _has_table(bind, "calendar_event_attendees"):
        op.drop_table("calendar_event_attendees")
