"""perf_indexes: indici pe coloane fierbinti folosite des in filter()

Adauga indici care lipseau pe cai critice (board, stats, reminders):
  - tasks.project_id        (board_service.get_board, performance, sprint)
  - tasks.category_id       (FK fara index)
  - task_completions.task_id + (task_id, week_start) compus (stats, streaks, auto-move)
  - task_completions.week_start
  - reminder_logs.task_id   (check_reminders ruleaza la fiecare minut)
  - reminder_logs.sent_at

Idempotenta: fiecare create/drop e protejat de un guard pe get_indexes, deci
migrarea poate fi re-rulata pe o baza care are deja (o parte din) indici.

Revision ID: 029
Revises: 028
Create Date: 2026-06-16 18:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "029"
down_revision = "028"
branch_labels = None
depends_on = None


def _indexes(bind, table: str) -> set[str]:
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return set()
    return {ix["name"] for ix in insp.get_indexes(table)}


# (index_name, table, [columns], unique)
_INDEXES = [
    ("ix_tasks_project_id", "tasks", ["project_id"], False),
    ("ix_tasks_category_id", "tasks", ["category_id"], False),
    ("ix_task_completions_task_id", "task_completions", ["task_id"], False),
    ("ix_task_completions_week_start", "task_completions", ["week_start"], False),
    ("ix_task_completions_task_week", "task_completions", ["task_id", "week_start"], False),
    ("ix_reminder_logs_task_id", "reminder_logs", ["task_id"], False),
    ("ix_reminder_logs_sent_at", "reminder_logs", ["sent_at"], False),
]


def upgrade() -> None:
    bind = op.get_bind()
    for name, table, cols, unique in _INDEXES:
        insp = sa.inspect(bind)
        if not insp.has_table(table):
            continue
        if name not in _indexes(bind, table):
            op.create_index(name, table, cols, unique=unique)


def downgrade() -> None:
    bind = op.get_bind()
    for name, table, _cols, _unique in reversed(_INDEXES):
        insp = sa.inspect(bind)
        if not insp.has_table(table):
            continue
        if name in _indexes(bind, table):
            op.drop_index(name, table_name=table)
