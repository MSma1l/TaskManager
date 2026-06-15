"""
Pytest fixtures for Phase 1 (per-project membership) tests.

The whole suite runs against a fresh SQLite in-memory database so it needs no
running Postgres. We share a single in-memory connection across sessions via a
StaticPool, create the schema from the SQLAlchemy metadata, and override the
FastAPI `get_db` / `get_current_user` dependencies so the TestClient talks to
the same DB and authenticates as a chosen test user.
"""
import os

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Importing the models package registers every ORM model on Base.metadata.
import app.models  # noqa: F401
from app.core.database import Base, get_db
from app.core.security import get_current_user
from app.models.base import generate_cuid
from app.models.category import Category
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.services import membership_service


@pytest.fixture()
def engine():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # Enforce foreign keys on SQLite (off by default).
    @event.listens_for(eng, "connect")
    def _fk_pragma(dbapi_con, _):
        cur = dbapi_con.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture()
def TestingSessionLocal(engine):
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def db(TestingSessionLocal):
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


# ── Data helpers ─────────────────────────────────────────────────────────────

@pytest.fixture()
def make_user(db):
    def _make(username=None, role="USER", full_name=None, is_active=True):
        username = username or f"user_{generate_cuid()[:8]}"
        u = User(
            id=generate_cuid(),
            username=username,
            full_name=full_name or username,
            role=role,
            is_active=is_active,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        return u

    return _make


@pytest.fixture()
def make_category(db):
    def _make(name="General"):
        c = Category(id=generate_cuid(), name=name, icon="star", color="#fff")
        db.add(c)
        db.commit()
        db.refresh(c)
        return c

    return _make


@pytest.fixture()
def make_project(db):
    def _make(owner, name="Proj", with_owner_membership=True, key="PRJ"):
        p = Project(
            id=generate_cuid(), user_id=owner.id, name=name,
            key=key, task_counter=0, is_active=True,
        )
        db.add(p)
        db.commit()
        db.refresh(p)
        if with_owner_membership:
            membership_service.add_member(
                db, p.id, owner.id, role="OWNER", invited_by=owner.id
            )
        return p

    return _make


@pytest.fixture()
def add_member(db):
    """Adauga un user ca membru intr-un proiect cu un rol dat."""
    def _add(project, user, role="MEMBER"):
        return membership_service.add_member(
            db, project.id, user.id, role=role, invited_by=user.id
        )

    return _add


@pytest.fixture()
def make_task(db, make_category):
    def _make(project, user, title="t", day_of_week=1):
        cat = make_category()
        t = Task(
            id=generate_cuid(),
            user_id=user.id,
            title=title,
            category_id=cat.id,
            day_of_week=day_of_week,
            project_id=project.id,
            is_active=True,
        )
        db.add(t)
        db.commit()
        db.refresh(t)
        return t

    return _make


# ── App / TestClient ─────────────────────────────────────────────────────────

@pytest.fixture()
def app_client(TestingSessionLocal):
    """
    Returns (client, set_user).

    `set_user(user)` chooses which User the `get_current_user` dependency
    returns for subsequent requests.
    """
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.api.members import router as members_router
    from app.api.projects import router as projects_router

    application = FastAPI()
    application.include_router(members_router)
    application.include_router(projects_router)

    state = {"user": None}

    def _override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    def _override_current_user():
        if state["user"] is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=401, detail="no test user")
        return state["user"]

    application.dependency_overrides[get_db] = _override_get_db
    application.dependency_overrides[get_current_user] = _override_current_user

    client = TestClient(application)

    def set_user(user):
        state["user"] = user

    yield client, set_user
    application.dependency_overrides.clear()


@pytest.fixture()
def board_client(TestingSessionLocal):
    """Like `app_client` but mounts the board + tasks + projects routers.

    Returns (client, set_user) where set_user(user) picks the authenticated
    user for the `get_current_user` dependency.
    """
    from fastapi import FastAPI, HTTPException
    from fastapi.testclient import TestClient
    from app.api.board import router as board_router
    from app.api.projects import router as projects_router
    from app.api.tasks import router as tasks_router

    application = FastAPI()
    application.include_router(board_router)
    application.include_router(projects_router)
    application.include_router(tasks_router)

    state = {"user": None}

    def _override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    def _override_current_user():
        if state["user"] is None:
            raise HTTPException(status_code=401, detail="no test user")
        return state["user"]

    application.dependency_overrides[get_db] = _override_get_db
    application.dependency_overrides[get_current_user] = _override_current_user

    client = TestClient(application)

    def set_user(user):
        state["user"] = user

    yield client, set_user
    application.dependency_overrides.clear()
