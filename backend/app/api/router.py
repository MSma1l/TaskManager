from fastapi import APIRouter
from app.api import auth, tasks, completions, categories, stats, projects, members, board, notifications, notebook, calendar, users, access_requests

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(access_requests.router)
api_router.include_router(users.router)
api_router.include_router(tasks.router)
api_router.include_router(completions.router)
api_router.include_router(categories.router)
api_router.include_router(stats.router)
api_router.include_router(projects.router)
api_router.include_router(members.router)
api_router.include_router(board.router)
api_router.include_router(notifications.router)
api_router.include_router(notebook.router)
api_router.include_router(calendar.router)
