"""Outlook-style calendar: event types, attendees, recurrence, multi-reminders, categories.

Revision ID: 007
Revises: 006
Create Date: 2026-05-02 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Event categories ─────────────────────────────────────────────────────
    op.create_table(
        "event_categories",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("color", sa.String(20), nullable=False, server_default="#3b82f6"),
        sa.Column("icon", sa.String(20), nullable=True),
        sa.Column("is_visible", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("sort_order", sa.String(10), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_event_categories_user_id", "event_categories", ["user_id"])

    # ── Calendar event extensions ────────────────────────────────────────────
    op.add_column("calendar_events", sa.Column("event_type", sa.String(20), nullable=False, server_default="personal"))
    op.add_column("calendar_events", sa.Column("location", sa.String(255), nullable=True))
    op.add_column("calendar_events", sa.Column("meeting_url", sa.String(500), nullable=True))
    op.add_column("calendar_events", sa.Column("is_all_day", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("calendar_events", sa.Column("event_status", sa.String(20), nullable=False, server_default="CONFIRMED"))
    op.add_column("calendar_events", sa.Column("recurrence_rule", sa.String(20), nullable=True))
    op.add_column("calendar_events", sa.Column("recurrence_until", sa.Date(), nullable=True))
    op.add_column("calendar_events", sa.Column("reminder_minutes", sa.JSON(), nullable=True))
    op.add_column("calendar_events", sa.Column("attendees", sa.JSON(), nullable=True))
    op.add_column("calendar_events", sa.Column("category_id", sa.String(), sa.ForeignKey("event_categories.id"), nullable=True))

    # ── Reminder logs ────────────────────────────────────────────────────────
    op.create_table(
        "calendar_reminder_logs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("event_id", sa.String(), nullable=False),
        sa.Column("occurrence_date", sa.Date(), nullable=False),
        sa.Column("minutes_before", sa.String(10), nullable=False),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("fired_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_calendar_reminder_logs_event", "calendar_reminder_logs", ["event_id", "occurrence_date"])

    # ── User preferences (theme + notification opts) ────────────────────────
    op.add_column("users", sa.Column("theme", sa.String(20), nullable=False, server_default="dark"))
    op.add_column("users", sa.Column("notification_settings", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "notification_settings")
    op.drop_column("users", "theme")
    op.drop_index("ix_calendar_reminder_logs_event", table_name="calendar_reminder_logs")
    op.drop_table("calendar_reminder_logs")

    op.drop_column("calendar_events", "category_id")
    op.drop_column("calendar_events", "attendees")
    op.drop_column("calendar_events", "reminder_minutes")
    op.drop_column("calendar_events", "recurrence_until")
    op.drop_column("calendar_events", "recurrence_rule")
    op.drop_column("calendar_events", "event_status")
    op.drop_column("calendar_events", "is_all_day")
    op.drop_column("calendar_events", "meeting_url")
    op.drop_column("calendar_events", "location")
    op.drop_column("calendar_events", "event_type")

    op.drop_index("ix_event_categories_user_id", table_name="event_categories")
    op.drop_table("event_categories")
