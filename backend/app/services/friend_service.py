"""Serviciu pentru lista de colaboratori (prieteni / colegi).

Un user isi construieste o lista de colaboratori prin cereri PENDING ->
ACCEPTED. Lista acceptata e folosita ulterior la add-member in proiecte
(selectie rapida din colaboratori).

Reguli:
- nu te poti adauga pe tine;
- nu poti trimite o noua cerere daca exista deja o relatie activa
  (PENDING sau ACCEPTED) intre voi, in oricare directie;
- dupa REJECT/REMOVE se poate re-cere (nu exista UNIQUE hard pe DB).
"""
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import Session

from app.models.friendship import Friendship
from app.models.user import User
from app.services.avatar import avatar_url

ACTIVE_STATUSES = ("PENDING", "ACCEPTED")
VALID_RELATIONS = {"friend", "colleague"}


def _lookup_user(db: Session, username: str) -> User | None:
    if not username:
        return None
    return (
        db.query(User)
        .filter(
            func.lower(User.username) == username.strip().lower(),
            User.is_active == True,  # noqa: E712
        )
        .first()
    )


def _active_between(db: Session, a: str, b: str) -> Friendship | None:
    """Relatia activa (PENDING/ACCEPTED) intre doi useri, in oricare directie."""
    return (
        db.query(Friendship)
        .filter(
            Friendship.status.in_(ACTIVE_STATUSES),
            or_(
                and_(Friendship.requester_id == a, Friendship.addressee_id == b),
                and_(Friendship.requester_id == b, Friendship.addressee_id == a),
            ),
        )
        .first()
    )


def are_friends(db: Session, a: str, b: str) -> bool:
    """True daca exista o relatie ACCEPTED intre a si b (oricare directie)."""
    if a == b:
        return False
    row = (
        db.query(Friendship.id)
        .filter(
            Friendship.status == "ACCEPTED",
            or_(
                and_(Friendship.requester_id == a, Friendship.addressee_id == b),
                and_(Friendship.requester_id == b, Friendship.addressee_id == a),
            ),
        )
        .first()
    )
    return row is not None


def send_request(
    db: Session, requester_id: str, target_username: str, relation: str = "colleague"
) -> Friendship:
    relation = (relation or "colleague").strip().lower()
    if relation not in VALID_RELATIONS:
        relation = "colleague"

    target = _lookup_user(db, target_username)
    # Privacy: nu dezvaluim daca username-ul exista sau nu — mesaj generic.
    if target is None:
        raise HTTPException(status_code=404, detail="Utilizatorul nu a fost gasit")

    if target.id == requester_id:
        raise HTTPException(status_code=400, detail="Nu te poti adauga pe tine")

    existing = _active_between(db, requester_id, target.id)
    if existing is not None:
        if existing.status == "ACCEPTED":
            raise HTTPException(status_code=409, detail="Sunteti deja colaboratori")
        raise HTTPException(status_code=409, detail="Exista deja o cerere in asteptare")

    fr = Friendship(
        requester_id=requester_id,
        addressee_id=target.id,
        status="PENDING",
        relation=relation,
        created_at=datetime.utcnow(),
    )
    db.add(fr)
    db.commit()
    db.refresh(fr)

    # Notificare in-app non-fatala pentru destinatar.
    try:
        from app.services import notification_service

        requester = db.query(User).filter(User.id == requester_id).first()
        rname = (requester.full_name or requester.username) if requester else "Cineva"
        notification_service.create_safe(
            db,
            user_id=target.id,
            type="FRIEND_REQUEST",
            title=f"{rname} vrea sa te adauge ca colaborator",
            link="/profile",
            meta={"friendshipId": fr.id, "requesterId": requester_id, "relation": relation},
            commit=True,
        )
    except Exception as e:  # noqa: BLE001
        print(f"[notification] friend request notify error: {e}")

    return fr


def respond(db: Session, user_id: str, friendship_id: str, accept: bool) -> Friendship:
    fr = db.query(Friendship).filter(Friendship.id == friendship_id).first()
    if fr is None:
        raise HTTPException(status_code=404, detail="Cererea nu a fost gasita")
    if fr.addressee_id != user_id:
        raise HTTPException(status_code=403, detail="Nu poti raspunde la aceasta cerere")
    if fr.status != "PENDING":
        raise HTTPException(status_code=409, detail="Cererea a fost deja procesata")

    fr.status = "ACCEPTED" if accept else "REJECTED"
    fr.responded_at = datetime.utcnow()
    db.commit()
    db.refresh(fr)

    if accept:
        try:
            from app.services import notification_service

            me = db.query(User).filter(User.id == user_id).first()
            mname = (me.full_name or me.username) if me else "Cineva"
            notification_service.create_safe(
                db,
                user_id=fr.requester_id,
                type="FRIEND_ACCEPTED",
                title=f"{mname} ti-a acceptat cererea de colaborare",
                link="/profile",
                meta={"friendshipId": fr.id},
                commit=True,
            )
        except Exception as e:  # noqa: BLE001
            print(f"[notification] friend accept notify error: {e}")

    return fr


def list_friends(db: Session, user_id: str) -> list[dict]:
    """Toti colaboratorii ACCEPTED, din ambele directii.

    Intoarce dict-uri cu (id, username, fullName, relation) — `id` e id-ul
    celuilalt user, gata de folosit la add-member.
    """
    rows = (
        db.query(Friendship)
        .filter(
            Friendship.status == "ACCEPTED",
            or_(
                Friendship.requester_id == user_id,
                Friendship.addressee_id == user_id,
            ),
        )
        .all()
    )
    other_ids = [
        (fr.addressee_id if fr.requester_id == user_id else fr.requester_id)
        for fr in rows
    ]
    relation_by_id = {
        (fr.addressee_id if fr.requester_id == user_id else fr.requester_id): fr.relation
        for fr in rows
    }
    if not other_ids:
        return []

    users = db.query(User).filter(User.id.in_(other_ids), User.is_active == True).all()  # noqa: E712
    return [
        {
            "id": u.id,
            "username": u.username,
            "fullName": u.full_name,
            "avatarUrl": avatar_url(u),
            "relation": relation_by_id.get(u.id, "colleague"),
        }
        for u in users
    ]


def _pending_with_users(db: Session, rows: list[Friendship], direction: str) -> list[dict]:
    """direction = 'incoming' (afisam requester) | 'outgoing' (afisam addressee)."""
    if not rows:
        return []
    other_ids = [
        (fr.requester_id if direction == "incoming" else fr.addressee_id) for fr in rows
    ]
    users = {u.id: u for u in db.query(User).filter(User.id.in_(other_ids)).all()}
    out = []
    for fr in rows:
        oid = fr.requester_id if direction == "incoming" else fr.addressee_id
        u = users.get(oid)
        out.append(
            {
                "id": fr.id,
                "userId": oid,
                "username": u.username if u else None,
                "fullName": u.full_name if u else None,
                "avatarUrl": avatar_url(u),
                "relation": fr.relation,
                "createdAt": fr.created_at.isoformat() if fr.created_at else None,
            }
        )
    return out


def list_incoming(db: Session, user_id: str) -> list[dict]:
    rows = (
        db.query(Friendship)
        .filter(Friendship.addressee_id == user_id, Friendship.status == "PENDING")
        .order_by(Friendship.created_at.desc())
        .all()
    )
    return _pending_with_users(db, rows, "incoming")


def list_outgoing(db: Session, user_id: str) -> list[dict]:
    rows = (
        db.query(Friendship)
        .filter(Friendship.requester_id == user_id, Friendship.status == "PENDING")
        .order_by(Friendship.created_at.desc())
        .all()
    )
    return _pending_with_users(db, rows, "outgoing")


def remove(db: Session, user_id: str, friend_user_id: str) -> bool:
    """Sterge relatia activa (PENDING/ACCEPTED) cu un user, oricare directie.

    Dezactivam prin REJECTED ca sa pastram istoricul si sa permitem re-cererea.
    Returneaza True daca exista ceva de eliminat.
    """
    rows = (
        db.query(Friendship)
        .filter(
            Friendship.status.in_(ACTIVE_STATUSES),
            or_(
                and_(Friendship.requester_id == user_id, Friendship.addressee_id == friend_user_id),
                and_(Friendship.requester_id == friend_user_id, Friendship.addressee_id == user_id),
            ),
        )
        .all()
    )
    if not rows:
        return False
    now = datetime.utcnow()
    for fr in rows:
        fr.status = "REJECTED"
        fr.responded_at = now
    db.commit()
    return True


def to_dict(fr: Friendship) -> dict:
    return {
        "id": fr.id,
        "requesterId": fr.requester_id,
        "addresseeId": fr.addressee_id,
        "status": fr.status,
        "relation": fr.relation,
        "createdAt": fr.created_at.isoformat() if fr.created_at else None,
        "respondedAt": fr.responded_at.isoformat() if fr.responded_at else None,
    }
