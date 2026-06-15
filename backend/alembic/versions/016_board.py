"""board (Kanban): columns, labels, board fields on tasks

Phase 2 of collaboration: projects gain a Kanban board. Tasks may now live
on a board column (board_column_id) with a manual ordering (board_order) and
an optional assignee (assignee_id). Board tasks have no category / day_of_week
(those columns become nullable). Each project gets 3 default RO columns.

Revision ID: 016
Revises: 015
Create Date: 2026-06-15 14:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# alembic/env.py inserts the backend root into sys.path before running
# migrations, so `app` is importable here.
from app.models.base import generate_cuid


revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def _has_table(bind, table: str) -> bool:
    insp = sa.inspect(bind)
    return insp.has_table(table)


def _has_column(bind, table: str, column: str) -> bool:
    insp = sa.inspect(bind)
    return column in {c["name"] for c in insp.get_columns(table)}


# Fluxul implicit pe 5 stadii (name, position, is_done_column, column_type).
DEFAULT_COLUMNS = [
    ("Backlog", 0, False, "BACKLOG"),
    ("Planificate", 1, False, "PLANNED"),
    ("In lucru", 2, False, "IN_PROGRESS"),
    ("Finalizate", 3, True, "DONE"),
    ("Aprobate", 4, False, "APPROVED"),
]


def upgrade() -> None:
    bind = op.get_bind()

    # ── relax NOT NULL on tasks.day_of_week / category_id ───────────
    op.alter_column("tasks", "day_of_week", existing_type=sa.Integer(), nullable=True)
    op.alter_column("tasks", "category_id", existing_type=sa.String(), nullable=True)

    # ── board_columns ───────────────────────────────────────────────
    if not _has_table(bind, "board_columns"):
        op.create_table(
            "board_columns",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("project_id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("color", sa.String(), nullable=True),
            sa.Column("is_done_column", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("column_type", sa.String(20), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_board_columns_project_id", "board_columns", ["project_id"])
    elif not _has_column(bind, "board_columns", "column_type"):
        # Tabelul exista deja dintr-o rulare partiala anterioara: adauga coloana lipsa.
        op.add_column("board_columns", sa.Column("column_type", sa.String(20), nullable=True))

    # ── labels ──────────────────────────────────────────────────────
    if not _has_table(bind, "labels"):
        op.create_table(
            "labels",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("project_id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("color", sa.String(), nullable=False, server_default="#3b82f6"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_labels_project_id", "labels", ["project_id"])

    # ── task_labels (M2M) ───────────────────────────────────────────
    if not _has_table(bind, "task_labels"):
        op.create_table(
            "task_labels",
            sa.Column("task_id", sa.String(), nullable=False),
            sa.Column("label_id", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("task_id", "label_id"),
        )
        op.create_index("ix_task_labels_task_id", "task_labels", ["task_id"])
        op.create_index("ix_task_labels_label_id", "task_labels", ["label_id"])

    # ── board fields on tasks ───────────────────────────────────────
    if not _has_column(bind, "tasks", "board_column_id"):
        op.add_column(
            "tasks",
            sa.Column(
                "board_column_id",
                sa.String(),
                sa.ForeignKey("board_columns.id"),
                nullable=True,
            ),
        )
        op.create_index("ix_tasks_board_column_id", "tasks", ["board_column_id"])
    if not _has_column(bind, "tasks", "board_order"):
        op.add_column("tasks", sa.Column("board_order", sa.Integer(), nullable=True))
    if not _has_column(bind, "tasks", "assignee_id"):
        op.add_column(
            "tasks",
            sa.Column(
                "assignee_id",
                sa.String(),
                sa.ForeignKey("users.id"),
                nullable=True,
            ),
        )
        op.create_index("ix_tasks_assignee_id", "tasks", ["assignee_id"])

    # ── SEED 3 default columns per active project (idempotent) ──────
    projects = bind.execute(sa.text(
        "SELECT id FROM projects WHERE is_active = true"
    )).fetchall()

    for (project_id,) in projects:
        has_cols = bind.execute(sa.text(
            "SELECT 1 FROM board_columns WHERE project_id = :pid LIMIT 1"
        ), {"pid": project_id}).fetchone()
        if has_cols is not None:
            continue
        for name, position, is_done, column_type in DEFAULT_COLUMNS:
            bind.execute(sa.text(
                "INSERT INTO board_columns "
                "(id, project_id, name, position, color, is_done_column, column_type, created_at) "
                "VALUES (:id, :pid, :name, :pos, NULL, :done, :ctype, NOW())"
            ), {
                "id": generate_cuid(),
                "pid": project_id,
                "name": name,
                "pos": position,
                "done": is_done,
                "ctype": column_type,
            })


def downgrade() -> None:
    bind = op.get_bind()

    # Drop board fields on tasks
    if _has_column(bind, "tasks", "assignee_id"):
        op.drop_index("ix_tasks_assignee_id", table_name="tasks")
        op.drop_column("tasks", "assignee_id")
    if _has_column(bind, "tasks", "board_order"):
        op.drop_column("tasks", "board_order")
    if _has_column(bind, "tasks", "board_column_id"):
        op.drop_index("ix_tasks_board_column_id", table_name="tasks")
        op.drop_column("tasks", "board_column_id")

    # Drop tables
    if _has_table(bind, "task_labels"):
        op.drop_index("ix_task_labels_label_id", table_name="task_labels")
        op.drop_index("ix_task_labels_task_id", table_name="task_labels")
        op.drop_table("task_labels")
    if _has_table(bind, "labels"):
        op.drop_index("ix_labels_project_id", table_name="labels")
        op.drop_table("labels")
    if _has_table(bind, "board_columns"):
        op.drop_index("ix_board_columns_project_id", table_name="board_columns")
        op.drop_table("board_columns")

    # Restore NOT NULL. NOTE: this will FAIL if any task has NULL
    # day_of_week / category_id (i.e. board tasks still exist). Clean
    # those rows first if you really need to roll back.
    op.alter_column("tasks", "category_id", existing_type=sa.String(), nullable=False)
    op.alter_column("tasks", "day_of_week", existing_type=sa.Integer(), nullable=False)
