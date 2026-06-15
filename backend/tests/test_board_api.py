"""HTTP integration tests for the board API (app.api.board + tasks/assigned).

Drives the FastAPI TestClient end to end: create project (auto key + 5
columns), create a board task (taskKey), move, assign, transition, read the
board shape and the /api/tasks/assigned feed.
"""


def _create_project(client, set_user, owner, name="Alpha Project", key=None):
    set_user(owner)
    payload = {"name": name}
    if key is not None:
        payload["key"] = key
    r = client.post("/api/projects", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def _get_board(client, project_id):
    r = client.get(f"/api/projects/{project_id}/board")
    assert r.status_code == 200, r.text
    return r.json()


def test_create_project_gets_key_and_five_columns(board_client, make_user):
    client, set_user = board_client
    owner = make_user()
    proj = _create_project(client, set_user, owner, name="Alpha Project")
    assert proj["key"] == "ALPH"  # derived from name

    board = _get_board(client, proj["id"])
    types = [c["columnType"] for c in board["columns"]]
    assert types == ["BACKLOG", "PLANNED", "IN_PROGRESS", "DONE", "APPROVED"]


def test_create_board_task_returns_task_key(board_client, make_user):
    client, set_user = board_client
    owner = make_user()
    proj = _create_project(client, set_user, owner, key="IA")
    board = _get_board(client, proj["id"])
    backlog = board["columns"][0]

    r = client.post(
        f"/api/projects/{proj['id']}/board/tasks",
        json={"title": "first", "columnId": backlog["id"]},
    )
    assert r.status_code == 200, r.text
    task = r.json()
    assert task["taskNumber"] == 1
    assert task["taskKey"] == "IA-1"
    assert task["boardColumnId"] == backlog["id"]


def test_full_flow_move_assign_transition(board_client, make_user):
    client, set_user = board_client
    owner = make_user()
    proj = _create_project(client, set_user, owner, key="FL")
    pid = proj["id"]

    board = _get_board(client, pid)
    backlog, planned = board["columns"][0], board["columns"][1]

    # Create two tasks.
    r1 = client.post(f"/api/projects/{pid}/board/tasks", json={"title": "t1", "columnId": backlog["id"]})
    r2 = client.post(f"/api/projects/{pid}/board/tasks", json={"title": "t2", "columnId": backlog["id"]})
    t1, t2 = r1.json(), r2.json()
    assert [t1["boardOrder"], t2["boardOrder"]] == [0, 1]

    # Move t1 to planned column index 0.
    rm = client.post(
        f"/api/projects/{pid}/board/tasks/{t1['id']}/move",
        json={"toColumnId": planned["id"], "toIndex": 0},
    )
    assert rm.status_code == 200, rm.text

    board = _get_board(client, pid)
    cols = {c["columnType"]: c for c in board["columns"]}
    assert [t["id"] for t in cols["PLANNED"]["tasks"]] == [t1["id"]]
    assert [t["id"] for t in cols["BACKLOG"]["tasks"]] == [t2["id"]]
    assert cols["BACKLOG"]["tasks"][0]["boardOrder"] == 0  # reindexed

    # Transition t2: start -> IN_PROGRESS via API.
    rt = client.post(
        f"/api/projects/{pid}/board/tasks/{t2['id']}/transition",
        json={"action": "start"},
    )
    assert rt.status_code == 200, rt.text
    assert rt.json()["boardColumnId"] == cols["IN_PROGRESS"]["id"]


def test_assign_and_assigned_feed(board_client, make_user, add_member, db):
    client, set_user = board_client
    owner = make_user()
    member = make_user()
    proj = _create_project(client, set_user, owner, key="ZZ")
    pid = proj["id"]

    # Add `member` to the project (membership not exposed via these routers).
    from app.models.project import Project
    from app.services import membership_service
    project_obj = db.query(Project).filter(Project.id == pid).first()
    membership_service.add_member(db, pid, member.id, role="MEMBER", invited_by=owner.id)

    board = _get_board(client, pid)
    backlog = board["columns"][0]
    r = client.post(f"/api/projects/{pid}/board/tasks", json={"title": "assigned task", "columnId": backlog["id"]})
    task = r.json()

    # Assign to member.
    ra = client.put(
        f"/api/projects/{pid}/board/tasks/{task['id']}/assign",
        json={"assigneeId": member.id},
    )
    assert ra.status_code == 200, ra.text
    assert ra.json()["assignee"]["userId"] == member.id

    # The member's /api/tasks/assigned feed must include the task w/ project key.
    set_user(member)
    rf = client.get("/api/tasks/assigned")
    assert rf.status_code == 200, rf.text
    feed = rf.json()
    assert len(feed) == 1
    assert feed[0]["id"] == task["id"]
    assert feed[0]["taskKey"] == "ZZ-1"
    assert feed[0]["project"]["key"] == "ZZ"


def test_assigned_feed_empty_for_user_without_tasks(board_client, make_user):
    client, set_user = board_client
    user = make_user()
    set_user(user)
    r = client.get("/api/tasks/assigned")
    assert r.status_code == 200
    assert r.json() == []


def test_label_endpoints(board_client, make_user):
    client, set_user = board_client
    owner = make_user()
    proj = _create_project(client, set_user, owner, key="LB")
    pid = proj["id"]

    rc = client.post(f"/api/projects/{pid}/board/labels", json={"name": "urgent", "color": "#f00"})
    assert rc.status_code == 200, rc.text
    label = rc.json()

    rl = client.get(f"/api/projects/{pid}/board/labels")
    assert rl.status_code == 200
    assert [l["id"] for l in rl.json()] == [label["id"]]

    rd = client.delete(f"/api/projects/{pid}/board/labels/{label['id']}")
    assert rd.status_code == 200
    assert client.get(f"/api/projects/{pid}/board/labels").json() == []


def test_board_access_forbidden_for_non_member(board_client, make_user):
    client, set_user = board_client
    owner = make_user()
    outsider = make_user()
    proj = _create_project(client, set_user, owner)

    set_user(outsider)
    r = client.get(f"/api/projects/{proj['id']}/board")
    assert r.status_code == 403


def test_column_crud_endpoints(board_client, make_user):
    client, set_user = board_client
    owner = make_user()
    proj = _create_project(client, set_user, owner)
    pid = proj["id"]
    _get_board(client, pid)  # lazy-seed the 5 default columns first

    rc = client.post(f"/api/projects/{pid}/board/columns", json={"name": "Extra", "color": "#abc"})
    assert rc.status_code == 200, rc.text
    col = rc.json()
    assert col["name"] == "Extra"

    ru = client.put(
        f"/api/projects/{pid}/board/columns/{col['id']}",
        json={"name": "Renamed", "isDoneColumn": True},
    )
    assert ru.status_code == 200, ru.text
    assert ru.json()["name"] == "Renamed"
    assert ru.json()["isDoneColumn"] is True

    rd = client.delete(f"/api/projects/{pid}/board/columns/{col['id']}")
    assert rd.status_code == 200


def test_task_update_and_delete_endpoints(board_client, make_user):
    client, set_user = board_client
    owner = make_user()
    proj = _create_project(client, set_user, owner, key="UD")
    pid = proj["id"]
    board = _get_board(client, pid)
    backlog = board["columns"][0]

    r = client.post(f"/api/projects/{pid}/board/tasks", json={"title": "x", "columnId": backlog["id"]})
    task = r.json()

    ru = client.put(
        f"/api/projects/{pid}/board/tasks/{task['id']}",
        json={"title": "updated", "priority": "HIGH", "estimateMinutes": 45},
    )
    assert ru.status_code == 200, ru.text
    assert ru.json()["title"] == "updated"
    assert ru.json()["estimateMinutes"] == 45

    rd = client.delete(f"/api/projects/{pid}/board/tasks/{task['id']}")
    assert rd.status_code == 200
    # Gone from the board.
    board = _get_board(client, pid)
    remaining = [t for c in board["columns"] for t in c["tasks"]]
    assert remaining == []


def test_transition_invalid_action_400(board_client, make_user):
    client, set_user = board_client
    owner = make_user()
    proj = _create_project(client, set_user, owner)
    pid = proj["id"]
    board = _get_board(client, pid)
    backlog = board["columns"][0]
    r = client.post(f"/api/projects/{pid}/board/tasks", json={"title": "t", "columnId": backlog["id"]})
    task = r.json()

    rt = client.post(
        f"/api/projects/{pid}/board/tasks/{task['id']}/transition",
        json={"action": "teleport"},
    )
    assert rt.status_code == 400
