import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.router import api_router
from app.services.reminder_service import start_scheduler
from app.telegram.bot import create_bot, create_admin_bot, setup_bot_commands


async def _start_bot(app, label: str):
    try:
        await app.initialize()
        await app.start()
        await app.updater.start_polling(drop_pending_updates=True)
        print(f"Telegram bot ({label}) started")
        return app
    except Exception as e:
        print(f"Telegram bot ({label}) failed to start: {e}")
        return None


async def _stop_bot(app):
    try:
        await app.updater.stop()
        await app.stop()
        await app.shutdown()
    except Exception:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting Task Manager Backend...")

    # Securitate: refuză pornirea în producție cu un JWT_SECRET nesigur (în dev
    # doar avertizează, ca testele și lucrul local să meargă cu default-ul).
    from app.core.security import assert_secure_config
    assert_secure_config()

    start_scheduler()

    main_bot = None
    admin_bot = None

    if settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_BOT_TOKEN != "your_bot_token_here":
        main_bot = await _start_bot(create_bot(), "main")
    else:
        print("Main Telegram bot token not configured, skipping")

    if settings.ADMIN_TELEGRAM_BOT_TOKEN and settings.ADMIN_TELEGRAM_BOT_TOKEN != "your_bot_token_here":
        admin_app = create_admin_bot()
        if admin_app:
            admin_bot = await _start_bot(admin_app, "admin")
    else:
        print("Admin Telegram bot not configured (optional), admins fall back to main bot")

    if main_bot or admin_bot:
        try:
            await setup_bot_commands()
        except Exception as e:
            print(f"setup_bot_commands failed: {e}")

    yield

    if main_bot:
        await _stop_bot(main_bot)
    if admin_bot:
        await _stop_bot(admin_bot)
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
