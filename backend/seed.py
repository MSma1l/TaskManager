"""Seed script - run after migrations to populate initial data.

Creates default categories and an initial admin user (idempotent).
"""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from app.core.database import SessionLocal
from app.core.config import settings
from app.core.security import hash_secret
from app.models.category import Category
from app.models.user import User

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

    if has_admin:
        changed = False
        # Ensure admin can always log in via password (fixes "can't enter as admin")
        if admin_password and not has_admin.password_hash:
            has_admin.password_hash = hash_secret(admin_password)
            changed = True
        if pin and not has_admin.pin_hash:
            has_admin.pin_hash = hash_secret(pin)
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
        pin_hash=hash_secret(pin) if pin else None,
        password_hash=hash_secret(admin_password) if admin_password else None,
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


def seed():
    db = SessionLocal()
    try:
        seed_categories(db)
        seed_admin(db)
        db.commit()
        print("Seed completed: categories + admin")
    except Exception as e:
        db.rollback()
        print(f"Seed error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
