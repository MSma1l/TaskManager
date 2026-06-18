"""Tests pentru metricile PM din stats_service: get_my_points (personal) si
get_team_points (echipa, ADMIN+). Taskurile de board sunt create prin
board_service ca sa poarte board_column_id / story_points corect.
"""
import pytest
from fastapi import HTTPException

from app.models.board_column import BoardColumn
from app.services import board_service, stats_service


def _columns(db, project_id):
    board_service.ensure_columns(db, project_id)
    return (
        db.query(BoardColumn)
        .filter(BoardColumn.project_id == project_id)
        .order_by(BoardColumn.position)
        .all()
    )


def _done_column(db, project_id):
    return next(c for c in _columns(db, project_id) if c.column_type == "DONE")


def _mk_task(db, owner, project, col, title="t", assignee=None, points=None):
    return board_service.create_task(db, owner.id, project.id, {
        "title": title,
        "columnId": col.id,
        "assigneeId": assignee.id if assignee else None,
        "storyPoints": points,
    })


# ── get_my_points ────────────────────────────────────────────────────

def test_get_my_points_counts_finished_tasks(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    cols = _columns(db, project.id)
    done = _done_column(db, project.id)

    task = _mk_task(db, owner, project, cols[0], assignee=owner, points=5)
    # Muta in coloana "terminat" (are story points -> trece de Feature A).
    board_service.move_task(db, owner.id, project.id, task.id, done.id, 0)

    out = stats_service.get_my_points(db, owner.id)
    assert out["careerStoryPoints"] == 5
    assert out["tasksFinished"]["total"] == 1
    assert out["storyPointsThisWeek"] == 5
    assert out["trend"] in ("up", "down", "flat")
    assert len(out["monthlySeries"]) == 6


def test_get_my_points_no_projects_returns_zeros(db, make_user):
    user = make_user()
    out = stats_service.get_my_points(db, user.id)
    assert out["careerStoryPoints"] == 0
    assert out["tasksFinished"]["total"] == 0
    assert out["storyPointsThisWeek"] == 0
    assert out["trend"] == "flat"


def test_get_my_points_ignores_unfinished(db, make_user, make_project):
    owner = make_user()
    project = make_project(owner)
    cols = _columns(db, project.id)
    # Task atribuit dar ramas in backlog (neterminat) -> nu intra in cariera.
    _mk_task(db, owner, project, cols[0], assignee=owner, points=8)

    out = stats_service.get_my_points(db, owner.id)
    assert out["careerStoryPoints"] == 0
    assert out["tasksFinished"]["total"] == 0


# ── get_team_points (ADMIN+) ─────────────────────────────────────────

def test_get_team_points_per_member_and_completion_rate(db, make_user, make_project, add_member):
    owner = make_user(username="owner")
    member = make_user(username="dev")
    project = make_project(owner)
    add_member(project, member, role="MEMBER")
    cols = _columns(db, project.id)
    done = _done_column(db, project.id)

    finished = _mk_task(db, owner, project, cols[0], assignee=member, points=3)
    _mk_task(db, owner, project, cols[0], assignee=member, points=2)  # ramane neterminat
    board_service.move_task(db, owner.id, project.id, finished.id, done.id, 0)

    out = stats_service.get_team_points(db, owner.id, project.id)
    assert out["projectId"] == project.id
    by_user = {m["userId"]: m for m in out["perMember"]}
    dev = by_user[member.id]
    assert dev["storyPoints"] == 3
    assert dev["tasksFinished"] == 1
    assert dev["assignedTasks"] == 2
    assert dev["completionRate"] == 0.5
    assert isinstance(out["recommendations"], list)
    assert len(out["recommendations"]) >= 1


def test_get_team_points_member_403(db, make_user, make_project, add_member):
    owner = make_user()
    member = make_user()
    project = make_project(owner)
    add_member(project, member, role="MEMBER")

    with pytest.raises(HTTPException) as exc:
        stats_service.get_team_points(db, member.id, project.id)
    assert exc.value.status_code == 403


def test_get_team_points_balanced_recommendation(db, make_user, make_project):
    owner = make_user(username="solo")
    project = make_project(owner)
    cols = _columns(db, project.id)
    done = _done_column(db, project.id)
    task = _mk_task(db, owner, project, cols[0], assignee=owner, points=4)
    board_service.move_task(db, owner.id, project.id, task.id, done.id, 0)

    out = stats_service.get_team_points(db, owner.id, project.id)
    owner_row = next(m for m in out["perMember"] if m["userId"] == owner.id)
    assert owner_row["completionRate"] == 1.0
