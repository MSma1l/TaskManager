"""Seed script - run after migrations to populate initial categories."""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from app.core.database import SessionLocal
from app.models.category import Category

CATEGORIES = [
    {"id": "cat-infrastructure", "name": "Infrastructure", "icon": "\U0001F5A5\uFE0F", "color": "#3B82F6"},
    {"id": "cat-deploy", "name": "Deploy", "icon": "\U0001F680", "color": "#10B981"},
    {"id": "cat-monitoring", "name": "Monitoring", "icon": "\U0001F4CA", "color": "#F59E0B"},
    {"id": "cat-security", "name": "Security", "icon": "\U0001F512", "color": "#EF4444"},
    {"id": "cat-personal", "name": "Personal", "icon": "\U0001F464", "color": "#8B5CF6"},
    {"id": "cat-other", "name": "Other", "icon": "\U0001F4CC", "color": "#6B7280"},
]


def seed():
    db = SessionLocal()
    try:
        for cat_data in CATEGORIES:
            existing = db.query(Category).filter(Category.id == cat_data["id"]).first()
            if existing:
                existing.name = cat_data["name"]
                existing.icon = cat_data["icon"]
                existing.color = cat_data["color"]
            else:
                db.add(Category(**cat_data))
        db.commit()
        print("Seed completed: categories created/updated")
    except Exception as e:
        db.rollback()
        print(f"Seed error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
