from telegram import Update
from telegram.ext import ContextTypes
from app.core.database import SessionLocal
from app.models.category import Category
from app.telegram.conversations import start_free_task_flow, get_session
from app.telegram.keyboards import categories_keyboard, main_menu_keyboard

HELP_TEXT = (
    "Foloseste butoanele de mai jos sau comenzile:\n\n"
    "/today - Taskurile de azi\n"
    "/week - Taskurile saptamanii\n"
    "/tasks - Alege ziua\n"
    "/add - Adauga task nou\n"
    "/done - Marcheaza ca facut\n"
    "/skip - Muta pe alta zi\n"
    "/notdone - Marcheaza ca nefacut\n"
    "/delete - Sterge un task\n"
    "/stats - Statistici\n"
    "/help - Ajutor\n\n"
    "Adaugare rapida: scrie \"task <titlu>\" direct in chat."
)


async def handle_free_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    """Handle free text messages. Returns True if handled."""
    if not update.message or not update.message.text:
        return False

    text = update.message.text.strip()
    chat_id = str(update.effective_chat.id)

    # Check if message starts with "task " (case-insensitive)
    if text.lower().startswith("task "):
        title = text[5:].strip()
        if not title:
            await update.message.reply_text("Trebuie sa specifici titlul. Exemplu: task verifica backup servere")
            return True

        # Capitalize first letter
        title = title[0].upper() + title[1:]

        db = SessionLocal()
        try:
            # Refuse if chat isn't bound to a user — prevents creating a
            # task that ends up assigned to nobody (or to the wrong owner).
            from app.models.user import User
            bound = (
                db.query(User)
                .filter(User.telegram_chat_id == chat_id, User.is_active == True)
                .first()
            )
            if not bound:
                await update.message.reply_text(
                    "Acest chat nu este legat la un cont. Foloseste /link <cod>."
                )
                return True

            start_free_task_flow(db, chat_id, title)

            categories = db.query(Category).order_by(Category.name).all()
            await update.message.reply_text(
                f"Task: \"{title}\"\n\nAlege categoria:",
                reply_markup=categories_keyboard(categories),
            )
        finally:
            db.close()

        return True

    # Not a recognized pattern - show help
    await update.message.reply_text(HELP_TEXT, reply_markup=main_menu_keyboard())
    return True
