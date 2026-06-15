"""Integration tests for app.api.members via FastAPI TestClient."""
from app.services import membership_service as ms


def _url(project_id, user_id=None):
    base = f"/api/projects/{project_id}/members"
    return f"{base}/{user_id}" if user_id else base


# ── GET members ──────────────────────────────────────────────────────────────

def test_get_members_lists_them(app_client, make_user, make_project):
    client, set_user = app_client
    owner = make_user(username="owner")
    project = make_project(owner)
    set_user(owner)
    r = client.get(_url(project.id))
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["role"] == "OWNER"
    assert body[0]["username"] == "owner"
    assert body[0]["isYou"] is True


def test_get_members_non_member_forbidden(app_client, make_user, make_project):
    client, set_user = app_client
    owner = make_user()
    project = make_project(owner)
    stranger = make_user()
    set_user(stranger)
    r = client.get(_url(project.id))
    assert r.status_code == 403


# ── POST invite ──────────────────────────────────────────────────────────────

def test_invite_existing_user_200(app_client, make_user, make_project, db):
    client, set_user = app_client
    owner = make_user(username="owner")
    project = make_project(owner)
    bob = make_user(username="bob")
    set_user(owner)
    r = client.post(_url(project.id), json={"username": "bob", "role": "MEMBER"})
    assert r.status_code == 200
    assert r.json()["username"] == "bob"
    assert r.json()["role"] == "MEMBER"
    assert ms.get_member(db, project.id, bob.id) is not None


def test_invite_case_insensitive_username(app_client, make_user, make_project):
    client, set_user = app_client
    owner = make_user(username="owner")
    project = make_project(owner)
    make_user(username="Bob")
    set_user(owner)
    r = client.post(_url(project.id), json={"username": "bOB"})
    assert r.status_code == 200


def test_invite_unknown_username_404(app_client, make_user, make_project):
    client, set_user = app_client
    owner = make_user(username="owner")
    project = make_project(owner)
    set_user(owner)
    r = client.post(_url(project.id), json={"username": "ghost"})
    assert r.status_code == 404
    assert r.json()["detail"] == "Utilizator inexistent"


def test_invite_already_member_409(app_client, make_user, make_project):
    client, set_user = app_client
    owner = make_user(username="owner")
    project = make_project(owner)
    bob = make_user(username="bob")
    set_user(owner)
    client.post(_url(project.id), json={"username": "bob"})
    r = client.post(_url(project.id), json={"username": "bob"})
    assert r.status_code == 409
    assert r.json()["detail"] == "Deja membru"


def test_invite_bad_role_400(app_client, make_user, make_project):
    client, set_user = app_client
    owner = make_user(username="owner")
    project = make_project(owner)
    make_user(username="bob")
    set_user(owner)
    r = client.post(_url(project.id), json={"username": "bob", "role": "SUPERBOSS"})
    assert r.status_code == 400
    assert r.json()["detail"] == "Rol invalid"


def test_invite_owner_role_rejected(app_client, make_user, make_project):
    # OWNER is not in ASSIGNABLE_ROLES.
    client, set_user = app_client
    owner = make_user(username="owner")
    project = make_project(owner)
    make_user(username="bob")
    set_user(owner)
    r = client.post(_url(project.id), json={"username": "bob", "role": "OWNER"})
    assert r.status_code == 400


def test_invite_non_admin_forbidden_403(app_client, make_user, make_project):
    client, set_user = app_client
    owner = make_user(username="owner")
    project = make_project(owner)
    member = make_user(username="member")
    # add member as MEMBER (below ADMIN)
    set_user(owner)
    client.post(_url(project.id), json={"username": "member", "role": "MEMBER"})
    target = make_user(username="newbie")
    set_user(member)
    r = client.post(_url(project.id), json={"username": "newbie"})
    assert r.status_code == 403
    assert target.username == "newbie"


# ── PUT change role ──────────────────────────────────────────────────────────

def test_put_change_role(app_client, make_user, make_project, db):
    client, set_user = app_client
    owner = make_user(username="owner")
    project = make_project(owner)
    bob = make_user(username="bob")
    set_user(owner)
    client.post(_url(project.id), json={"username": "bob", "role": "MEMBER"})
    r = client.put(_url(project.id, bob.id), json={"role": "ADMIN"})
    assert r.status_code == 200
    assert r.json()["role"] == "ADMIN"
    assert ms.get_member(db, project.id, bob.id).role == "ADMIN"


def test_put_invalid_role_400(app_client, make_user, make_project):
    client, set_user = app_client
    owner = make_user(username="owner")
    project = make_project(owner)
    bob = make_user(username="bob")
    set_user(owner)
    client.post(_url(project.id), json={"username": "bob"})
    r = client.put(_url(project.id, bob.id), json={"role": "NOPE"})
    assert r.status_code == 400


def test_put_unknown_member_404(app_client, make_user, make_project):
    client, set_user = app_client
    owner = make_user(username="owner")
    project = make_project(owner)
    set_user(owner)
    r = client.put(_url(project.id, "ghostid"), json={"role": "ADMIN"})
    assert r.status_code == 404


def test_put_last_owner_demote_400(app_client, make_user, make_project):
    client, set_user = app_client
    owner = make_user(username="owner")
    project = make_project(owner)
    set_user(owner)
    r = client.put(_url(project.id, owner.id), json={"role": "ADMIN"})
    assert r.status_code == 400
    assert "OWNER" in r.json()["detail"]


def test_put_non_owner_forbidden_403(app_client, make_user, make_project):
    client, set_user = app_client
    owner = make_user(username="owner")
    project = make_project(owner)
    admin = make_user(username="adm")
    set_user(owner)
    client.post(_url(project.id), json={"username": "adm", "role": "ADMIN"})
    set_user(admin)  # ADMIN cannot change roles (needs OWNER)
    r = client.put(_url(project.id, owner.id), json={"role": "MEMBER"})
    assert r.status_code == 403


# ── DELETE member ────────────────────────────────────────────────────────────

def test_delete_member(app_client, make_user, make_project, db):
    client, set_user = app_client
    owner = make_user(username="owner")
    project = make_project(owner)
    bob = make_user(username="bob")
    set_user(owner)
    client.post(_url(project.id), json={"username": "bob"})
    r = client.delete(_url(project.id, bob.id))
    assert r.status_code == 200
    assert ms.get_member(db, project.id, bob.id) is None


def test_delete_unknown_member_404(app_client, make_user, make_project):
    client, set_user = app_client
    owner = make_user(username="owner")
    project = make_project(owner)
    set_user(owner)
    r = client.delete(_url(project.id, "ghost"))
    assert r.status_code == 404


def test_delete_last_owner_400(app_client, make_user, make_project):
    client, set_user = app_client
    owner = make_user(username="owner")
    project = make_project(owner)
    set_user(owner)
    r = client.delete(_url(project.id, owner.id))
    assert r.status_code == 400
    assert "OWNER" in r.json()["detail"]


def test_delete_non_admin_forbidden_403(app_client, make_user, make_project):
    client, set_user = app_client
    owner = make_user(username="owner")
    project = make_project(owner)
    member = make_user(username="m")
    set_user(owner)
    client.post(_url(project.id), json={"username": "m", "role": "MEMBER"})
    set_user(member)
    r = client.delete(_url(project.id, owner.id))
    assert r.status_code == 403
