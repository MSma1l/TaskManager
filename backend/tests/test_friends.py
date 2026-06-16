"""Tests pentru lista de colaboratori (friend_service).

NOTA: modelul `Friendship` nu e (inca) inregistrat in `app/models/__init__.py`,
deci il importam explicit aici inainte ca fixtura `engine` din conftest sa
ruleze `Base.metadata.create_all`. Importul atinge metadata Base, deci tabela
`friendships` e creata in DB-ul de test. Dupa ce modelul e inregistrat in
__init__.py, acest import devine redundant (dar inofensiv).
"""
import app.models.friendship  # noqa: F401  (inregistreaza tabela friendships pe Base.metadata)

import pytest
from fastapi import HTTPException

from app.services import friend_service


def test_send_accept_makes_bidirectional_friends(db, make_user):
    a = make_user(username="alice")
    b = make_user(username="bob")

    fr = friend_service.send_request(db, a.id, "bob", "colleague")
    assert fr.status == "PENDING"

    # Inca neacceptata -> nu apare ca prieten.
    assert friend_service.list_friends(db, a.id) == []
    assert friend_service.are_friends(db, a.id, b.id) is False

    accepted = friend_service.respond(db, b.id, fr.id, accept=True)
    assert accepted.status == "ACCEPTED"

    a_friends = friend_service.list_friends(db, a.id)
    b_friends = friend_service.list_friends(db, b.id)
    assert [f["id"] for f in a_friends] == [b.id]
    assert [f["id"] for f in b_friends] == [a.id]
    assert friend_service.are_friends(db, a.id, b.id) is True
    assert friend_service.are_friends(db, b.id, a.id) is True


def test_cannot_friend_yourself(db, make_user):
    a = make_user(username="alice")
    with pytest.raises(HTTPException) as exc:
        friend_service.send_request(db, a.id, "alice", "colleague")
    assert exc.value.status_code == 400


def test_case_insensitive_lookup(db, make_user):
    a = make_user(username="alice")
    make_user(username="bob")
    fr = friend_service.send_request(db, a.id, "BOB", "friend")
    assert fr.status == "PENDING"
    assert fr.relation == "friend"


def test_unknown_user_is_generic_404(db, make_user):
    a = make_user(username="alice")
    with pytest.raises(HTTPException) as exc:
        friend_service.send_request(db, a.id, "nuexista", "colleague")
    assert exc.value.status_code == 404


def test_double_request_errors(db, make_user):
    a = make_user(username="alice")
    make_user(username="bob")
    friend_service.send_request(db, a.id, "bob", "colleague")
    with pytest.raises(HTTPException) as exc:
        friend_service.send_request(db, a.id, "bob", "colleague")
    assert exc.value.status_code == 409


def test_request_when_already_friends_errors(db, make_user):
    a = make_user(username="alice")
    b = make_user(username="bob")
    fr = friend_service.send_request(db, a.id, "bob", "colleague")
    friend_service.respond(db, b.id, fr.id, accept=True)
    # b incearca acum sa-l ceara pe a -> deja colaboratori
    with pytest.raises(HTTPException) as exc:
        friend_service.send_request(db, b.id, "alice", "colleague")
    assert exc.value.status_code == 409


def test_reject_not_in_friends_and_allows_recfrom(db, make_user):
    a = make_user(username="alice")
    b = make_user(username="bob")
    fr = friend_service.send_request(db, a.id, "bob", "colleague")
    rejected = friend_service.respond(db, b.id, fr.id, accept=False)
    assert rejected.status == "REJECTED"
    assert friend_service.list_friends(db, a.id) == []
    assert friend_service.are_friends(db, a.id, b.id) is False

    # Dupa reject se poate re-cere.
    fr2 = friend_service.send_request(db, a.id, "bob", "colleague")
    assert fr2.status == "PENDING"


def test_only_addressee_can_respond(db, make_user):
    a = make_user(username="alice")
    make_user(username="bob")
    c = make_user(username="carol")
    fr = friend_service.send_request(db, a.id, "bob", "colleague")
    # carol (un tert) nu poate raspunde
    with pytest.raises(HTTPException) as exc:
        friend_service.respond(db, c.id, fr.id, accept=True)
    assert exc.value.status_code == 403
    # nici requester-ul nu poate accepta propria cerere
    with pytest.raises(HTTPException) as exc2:
        friend_service.respond(db, a.id, fr.id, accept=True)
    assert exc2.value.status_code == 403


def test_incoming_outgoing_lists(db, make_user):
    a = make_user(username="alice")
    b = make_user(username="bob")
    friend_service.send_request(db, a.id, "bob", "colleague")

    out = friend_service.list_outgoing(db, a.id)
    inc = friend_service.list_incoming(db, b.id)
    assert len(out) == 1 and out[0]["userId"] == b.id and out[0]["username"] == "bob"
    assert len(inc) == 1 and inc[0]["userId"] == a.id and inc[0]["username"] == "alice"
    # invers nu apar
    assert friend_service.list_incoming(db, a.id) == []
    assert friend_service.list_outgoing(db, b.id) == []


def test_remove_friend(db, make_user):
    a = make_user(username="alice")
    b = make_user(username="bob")
    fr = friend_service.send_request(db, a.id, "bob", "colleague")
    friend_service.respond(db, b.id, fr.id, accept=True)
    assert friend_service.are_friends(db, a.id, b.id) is True

    removed = friend_service.remove(db, a.id, b.id)
    assert removed is True
    assert friend_service.list_friends(db, a.id) == []
    assert friend_service.list_friends(db, b.id) == []
    assert friend_service.are_friends(db, a.id, b.id) is False

    # Remove pe ceva inexistent -> False
    assert friend_service.remove(db, a.id, b.id) is False
