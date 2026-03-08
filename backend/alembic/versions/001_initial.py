"""Initial migration

Revision ID: 001
Revises:
Create Date: 2024-01-01

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

taskstatus = postgresql.ENUM('PENDING', 'DONE', 'SKIPPED', 'NOT_DONE', name='taskstatus', create_type=False)


def upgrade() -> None:
    # Create enum type first
    op.execute("CREATE TYPE taskstatus AS ENUM ('PENDING', 'DONE', 'SKIPPED', 'NOT_DONE')")

    op.create_table(
        'categories',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('icon', sa.String(), nullable=False),
        sa.Column('color', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        'tasks',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('category_id', sa.String(), sa.ForeignKey('categories.id'), nullable=False),
        sa.Column('day_of_week', sa.Integer(), nullable=False),
        sa.Column('scheduled_date', sa.DateTime(), nullable=True),
        sa.Column('reminder_time', sa.String(), nullable=True),
        sa.Column('is_recurring', sa.Boolean(), server_default='false'),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        'task_completions',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('task_id', sa.String(), sa.ForeignKey('tasks.id'), nullable=False),
        sa.Column('week_start', sa.DateTime(), nullable=False),
        sa.Column('status', taskstatus, server_default='PENDING', nullable=False),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('moved_to_date', sa.DateTime(), nullable=True),
        sa.Column('skip_reason', sa.Text(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint('task_id', 'week_start', name='uq_task_completion_week'),
    )

    op.create_table(
        'reminder_logs',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('task_id', sa.String(), nullable=False),
        sa.Column('sent_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('channel', sa.String(), nullable=False),
    )

    op.create_table(
        'telegram_sessions',
        sa.Column('chat_id', sa.String(), primary_key=True),
        sa.Column('state', sa.Text(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('telegram_sessions')
    op.drop_table('reminder_logs')
    op.drop_table('task_completions')
    op.drop_table('tasks')
    op.drop_table('categories')
    op.execute('DROP TYPE taskstatus')
