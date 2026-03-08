import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.router import api_router
from app.services.reminder_service import start_scheduler
from app.telegram.bot import create_bot, setup_bot_commands


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("Starting Task Manager Backend...")

    # Start scheduler
    start_scheduler()

    # Start Telegram bot
    bot_app = None
    if settings.TELEGRAM_BOT_TOKEN != "your_bot_token_here":
        try:
            bot_app = create_bot()
            await bot_app.initialize()
            await bot_app.start()
            await bot_app.updater.start_polling(drop_pending_updates=True)
            await setup_bot_commands()
            print("Telegram bot started with commands menu")
        except Exception as e:
            print(f"Telegram bot failed to start: {e}")
            bot_app = None
    else:
        print("Telegram bot token not configured, skipping bot startup")

    yield

    # Shutdown
    if bot_app:
        try:
            await bot_app.updater.stop()
            await bot_app.stop()
            await bot_app.shutdown()
        except Exception:
            pass
    print("Shutting down...")


app = FastAPI(title="Task Manager API", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000", "http://localhost:80"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(api_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
