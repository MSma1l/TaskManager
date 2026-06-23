"""Seed script - run after migrations to populate initial data.

Creates default categories and an initial admin user (idempotent).
"""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from app.core.database import SessionLocal
from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.models.category import Category
from app.models.user import User
from app.models.project_member import ProjectMember
from app.services import office_service

# Parola checked-in din repo — dacă admin-ul e creat cu ea, îl forțăm să o
# schimbe la primul login (must_change_password) și avertizăm în consolă.
_WEAK_DEFAULT_ADMIN_PASSWORD = "admin1234"

CATEGORIES = [
    {"id": "cat-infrastructure", "name": "Infrastructure", "icon": "\U0001F5A5️", "color": "#3B82F6"},
    {"id": "cat-deploy", "name": "Deploy", "icon": "\U0001F680", "color": "#10B981"},
    {"id": "cat-monitoring", "name": "Monitoring", "icon": "\U0001F4CA", "color": "#F59E0B"},
    {"id": "cat-security", "name": "Security", "icon": "\U0001F512", "color": "#EF4444"},
    {"id": "cat-personal", "name": "Personal", "icon": "\U0001F464", "color": "#8B5CF6"},
    {"id": "cat-other", "name": "Other", "icon": "\U0001F4CC", "color": "#6B7280"},
]


def seed_categories(db):
    for cat_data in CATEGORIES:
        existing = db.query(Category).filter(Category.id == cat_data["id"]).first()
        if existing:
            existing.name = cat_data["name"]
            existing.icon = cat_data["icon"]
            existing.color = cat_data["color"]
        else:
            db.add(Category(**cat_data))


def seed_admin(db):
    """Create the initial admin from .env values, or repair an existing admin
    that is missing the password_hash / pin_hash (fixes login lockouts after
    schema upgrades or DB restores)."""
    has_admin = db.query(User).filter(User.role == "ADMIN").first()
    pin = settings.APP_PIN
    admin_password = settings.ADMIN_PASSWORD
    weak_pw = bool(admin_password) and admin_password == _WEAK_DEFAULT_ADMIN_PASSWORD
    if weak_pw:
        print(
            "[SECURITY][WARN] ADMIN_PASSWORD este valoarea default slabă. Adminul va fi "
            "obligat să o schimbe la primul login. Setează ADMIN_PASSWORD în .env."
        )

    if has_admin:
        changed = False
        # Ensure admin can ALWAYS log in with the .env credentials. Re-set the
        # hash when it's missing OR no longer verifies — this self-heals after a
        # JWT_SECRET rotation (legacy hashes were salted with JWT_SECRET) and
        # migrates the admin to the new KDF.
        if admin_password and (
            not has_admin.password_hash
            or not verify_password(admin_password, has_admin.password_hash)
        ):
            has_admin.password_hash = hash_password(admin_password)
            if weak_pw:
                has_admin.must_change_password = True
            changed = True
        if pin and (
            not has_admin.pin_hash
            or not verify_password(pin, has_admin.pin_hash)
        ):
            has_admin.pin_hash = hash_password(pin)
            changed = True
        if not has_admin.is_active:
            has_admin.is_active = True
            changed = True
        if changed:
            db.flush()
            print(
                f"Admin reparat: username={has_admin.username} (password/pin reset din .env)"
            )
        return has_admin

    username = (settings.ADMIN_USERNAME or "admin").strip().lower()
    chat_id = settings.TELEGRAM_CHAT_ID if settings.TELEGRAM_CHAT_ID and settings.TELEGRAM_CHAT_ID != "your_chat_id_here" else None

    # Use the existing chat_id as the admin's user_id so legacy calendar
    # events (which already store user_id = TELEGRAM_CHAT_ID) keep working.
    admin_kwargs = dict(
        username=username,
        email=settings.ADMIN_EMAIL or None,
        full_name=settings.ADMIN_FULL_NAME or "Administrator",
        telegram_chat_id=chat_id,
        role="ADMIN",
        pin_hash=hash_password(pin) if pin else None,
        password_hash=hash_password(admin_password) if admin_password else None,
        must_change_password=weak_pw,
        is_active=True,
    )
    if chat_id:
        admin_kwargs["id"] = chat_id

    admin = User(**admin_kwargs)
    db.add(admin)
    db.flush()
    print(
        f"Admin creat: username={admin.username}, telegram_chat_id={admin.telegram_chat_id or 'NEELEGAT'}"
    )
    return admin


def seed_office(db, admin):
    """Asigura proiectul de sistem "Birou" (system_key='OFFICE'), detinut de admin,
    cu cele 4 coloane, si adauga TOTI userii activi ca membri (MEMBER). Idempotent."""
    owner_id = admin.id if admin else None
    if not owner_id:
        print("[office] niciun admin -> sar peste seed-ul proiectului Birou")
        return

    project = office_service.ensure_office_project(db, owner_id)
    db.flush()

    # Adauga fiecare user activ ca membru (MEMBER) daca nu e deja membru.
    existing_member_ids = {
        uid for (uid,) in (
            db.query(ProjectMember.user_id)
            .filter(ProjectMember.project_id == project.id)
            .all()
        )
    }
    users = db.query(User).filter(User.is_active == True).all()  # noqa: E712
    added = 0
    for u in users:
        if u.id in existing_member_ids:
            continue
        db.add(ProjectMember(
            project_id=project.id,
            user_id=u.id,
            role="MEMBER",
        ))
        existing_member_ids.add(u.id)
        added += 1
    print(f"[office] proiectul Birou OK (id={project.id}); membri noi adaugati: {added}")


def seed():
    db = SessionLocal()
    try:
        seed_categories(db)
        admin = seed_admin(db)
        db.flush()
        seed_office(db, admin)
        db.commit()
        print("Seed completed: categories + admin + birou")
    except Exception as e:
        db.rollback()
        print(f"Seed error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
