from fastapi import APIRouter
from app.api import auth, tasks, completions, categories, stats, projects, notifications

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(tasks.router)
api_router.include_router(completions.router)
api_router.include_router(categories.router)
api_router.include_router(stats.router)
api_router.include_router(projects.router)
api_router.include_router(notifications.router)
