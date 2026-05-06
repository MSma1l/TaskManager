from telegram import Update, BotCommand, MenuButtonWebApp, MenuButtonDefault, WebAppInfo
from telegram.ext import (
    Application, CommandHandler, MessageHandler, CallbackQueryHandler, filters,
)
from app.core.config import settings
from app.core.database import SessionLocal
from app.telegram.commands import (
    cmd_start, cmd_help, cmd_today, cmd_week, cmd_tasks,
    cmd_add, cmd_done, cmd_skip, cmd_notdone, cmd_stats, cmd_delete, cmd_link, cmd_attended, cmd_missed,
    cmd_register,
)
from app.telegram.conversations import (
    handle_conversation, handle_callback_conversation,
)
from app.telegram.free_text import handle_free_text
from app.telegram.notebook_handler import cmd_notes, handle_notebook_callback, handle_notebook_text
from app.services import completion_service, task_service

application: Application | None = None       # main user-facing bot
admin_application: Application | None = None  # optional separate admin bot

# Map bottom menu button text to command handlers
MENU_BUTTON_MAP = {
    "taskuri azi": cmd_today,
    "saptamana": cmd_week,
    "adauga task": cmd_add,
    "statistici": cmd_stats,
    "marcheaza facut": cmd_done,
    "ajutor": cmd_help,
    "carnet": cmd_notes,
}


async def _handle_message(update: Update, context):
    """Main message router: menu buttons > conversation > free text."""
    if not update.message or not update.message.text:
        return

    text = update.message.text.strip().lower()

    # Check if it's a bottom menu button press
    if text in MENU_BUTTON_MAP:
        await MENU_BUTTON_MAP[text](update, context)
        return

    # Check for notebook conversation state first
    chat_id = str(update.effective_chat.id)
    db_check = SessionLocal()
    try:
        from app.telegram.conversations import get_session
        session_state = get_session(db_check, chat_id)
        if session_state and session_state.get("flow") == "notebook":
            db_check.close()
            await handle_notebook_text(update, context, session_state)
            return
    finally:
        db_check.close()

    # Check for active conversation first
    handled = await handle_conversation(update, context)
    if handled:
        return

    # Try free text handler
    await handle_free_text(update, context)


async def _handle_callback(update: Update, context):
    """Main callback router: conversation callbacks > action callbacks."""
    query = update.callback_query

    # Check for active conversation callback
    handled = await handle_callback_conversation(update, context)
    if handled:
        return

    data = query.data

    # Route all nb_ prefixed callbacks to notebook handler
    if data.startswith("nb_"):
        await handle_notebook_callback(update, context)
        return

    await query.answer()

    # Resolve owner from chat — every task action below must verify the
    # task belongs to this chat's user before mutating anything.
    chat_id = str(query.message.chat_id)

    def _owner_check(db, task_id: str):
        from app.models.task import Task
        from app.models.user import User
        bound = (
            db.query(User)
            .filter(User.telegram_chat_id == chat_id, User.is_active == True)
            .first()
        )
        if not bound:
            return None, None
        task = (
            db.query(Task)
            .filter(Task.id == task_id, Task.user_id == bound.id)
            .first()
        )
        return bound, task

    # Handle task action callbacks
    if data.startswith("action_done_"):
        task_id = data[len("action_done_"):]
        db = SessionLocal()
        try:
            bound, task = _owner_check(db, task_id)
            if not bound or not task:
                await query.edit_message_text("Task negasit sau nu este al tau.")
                return
            result = completion_service.mark_done(db, task_id)
            if result:
                await query.edit_message_text(f"Done! \"{task.title}\" marcat ca facut.")
            else:
                await query.edit_message_text("Task negasit.")
        finally:
            db.close()

    elif data.startswith("action_skip_"):
        task_id = data[len("action_skip_"):]
        db = SessionLocal()
        try:
            bound, task = _owner_check(db, task_id)
            if not bound or not task:
                await query.edit_message_text("Task negasit sau nu este al tau.")
                return
            from app.telegram.conversations import start_skip_flow
            from app.telegram.keyboards import days_keyboard
            start_skip_flow(db, chat_id, task_id)
            await query.edit_message_text("Muta pe:", reply_markup=days_keyboard())
        finally:
            db.close()

    elif data.startswith("action_notdone_"):
        task_id = data[len("action_notdone_"):]
        db = SessionLocal()
        try:
            bound, task = _owner_check(db, task_id)
            if not bound or not task:
                await query.edit_message_text("Task negasit sau nu este al tau.")
                return
            from app.telegram.conversations import start_notdone_flow
            start_notdone_flow(db, chat_id, task_id)
            await query.edit_message_text("De ce nu ai putut face acest task? (motivul este obligatoriu)")
        finally:
            db.close()

    elif data.startswith("action_delete_"):
        task_id = data[len("action_delete_"):]
        db = SessionLocal()
        try:
            bound, task = _owner_check(db, task_id)
            if not bound or not task or not task.is_active:
                await query.edit_message_text("Task negasit sau nu este al tau.")
                return
            from app.telegram.keyboards import confirm_delete_keyboard
            await query.edit_message_text(
                f"Sigur vrei sa stergi taskul \"{task.title}\"?",
                reply_markup=confirm_delete_keyboard(task.id),
            )
        finally:
            db.close()

    elif data.startswith("confirm_delete_"):
        task_id = data[len("confirm_delete_"):]
        db = SessionLocal()
        try:
            bound, task = _owner_check(db, task_id)
            if not bound or not task:
                await query.edit_message_text("Task negasit sau nu este al tau.")
                return
            success = task_service.delete_task(db, bound.id, task_id)
            if success:
                await query.edit_message_text("Task sters cu succes!")
            else:
                await query.edit_message_text("Task negasit.")
        finally:
            db.close()

    elif data.startswith("taskdetail_"):
        task_id = data[len("taskdetail_"):]
        db = SessionLocal()
        try:
            bound, task = _owner_check(db, task_id)
            if not bound or not task:
                await query.edit_message_text("Task negasit sau nu este al tau.")
                return
            from app.telegram.keyboards import task_actions_keyboard
            await query.edit_message_text(
                f"{task.title}",
                reply_markup=task_actions_keyboard(task.id),
            )
        finally:
            db.close()

    elif data.startswith("weekday_"):
        val = data[len("weekday_"):]
        db = SessionLocal()
        try:
            from datetime import datetime, timedelta
            from app.telegram.keyboards import task_actions_keyboard
            from app.models.user import User

            bound = (
                db.query(User)
                .filter(User.telegram_chat_id == chat_id, User.is_active == True)
                .first()
            )
            if not bound:
                await query.edit_message_text("Acest chat nu este legat la niciun cont. Foloseste /link <cod>.")
                return

            now = datetime.utcnow()
            if val == "today":
                day_of_week = now.isoweekday()
            else:
                day_of_week = int(val)

            tasks = task_service.get_tasks_for_day(db, bound.id, day_of_week)
            days_ro = ["Luni", "Marti", "Miercuri", "Joi", "Vineri", "Sambata", "Duminica"]
            day_name = days_ro[day_of_week - 1]

            if not tasks:
                await query.edit_message_text(f"Nu ai taskuri programate {day_name}.")
                return

            lines = [f"Taskuri {day_name}:\n"]
            for task in tasks:
                comp = task.completions[0] if task.completions else None
                status = comp.status.value if comp else "PENDING"
                icons = {"DONE": "Done ", "PENDING": "Pending ", "SKIPPED": "Skipped ", "NOT_DONE": "Not Done "}
                lines.append(f"  {icons.get(status, '')}{task.title}")

            await query.edit_message_text("\n".join(lines))

            # Send action buttons for pending
            for task in tasks:
                comp = task.completions[0] if task.completions else None
                status = comp.status.value if comp else "PENDING"
                if status == "PENDING":
                    await query.message.reply_text(
                        task.title,
                        reply_markup=task_actions_keyboard(task.id),
                    )
        finally:
            db.close()

    elif data == "noop":
        pass


def _mini_app_url() -> str | None:
    """Build the Mini App URL from FRONTEND_URL. Telegram requires HTTPS,
    so we silently skip the menu button setup when running on http (dev)."""
    base = (settings.FRONTEND_URL or "").strip().rstrip("/")
    if not base.startswith("https://"):
        return None
    return f"{base}/tg-app"


async def _setup_menu_button(app: Application):
    """Set the bot's persistent menu button to open the Mini App.

    Equivalent to BotFather → Bot Settings → Menu Button → Configure menu
    button, but done programmatically via the Bot API. Setting chat_id=None
    applies it as the default for every user that opens the chat.
    """
    url = _mini_app_url()
    try:
        if url:
            await app.bot.set_chat_menu_button(
                chat_id=None,
                menu_button=MenuButtonWebApp(
                    text="Open App",
                    web_app=WebAppInfo(url=url),
                ),
            )
            print(f"[BOT] Menu button set → Mini App at {url}")
        else:
            # Fallback to Telegram's default ("commands menu") on http / dev
            await app.bot.set_chat_menu_button(
                chat_id=None,
                menu_button=MenuButtonDefault(),
            )
    except Exception as e:
        print(f"[BOT] set_chat_menu_button failed (skipping): {e}")


async def _setup_commands(app: Application):
    """Set bot commands menu in Telegram."""
    commands = [
        BotCommand("today", "Taskurile de azi"),
        BotCommand("week", "Taskurile saptamanii"),
        BotCommand("tasks", "Alege ziua"),
        BotCommand("add", "Adauga task nou"),
        BotCommand("done", "Marcheaza ca facut"),
        BotCommand("skip", "Muta pe alta zi"),
        BotCommand("notdone", "Marcheaza ca nefacut"),
        BotCommand("delete", "Sterge un task"),
        BotCommand("stats", "Statistici"),
        BotCommand("notes", "Carnetul meu"),
        BotCommand("link", "Leaga acest chat de un cont"),
        BotCommand("register", "Creeaza un cont nou (username + PIN)"),
        BotCommand("help", "Ajutor"),
    ]
    await app.bot.set_my_commands(commands)


def _wire_handlers(app: Application):
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("today", cmd_today))
    app.add_handler(CommandHandler("week", cmd_week))
    app.add_handler(CommandHandler("tasks", cmd_tasks))
    app.add_handler(CommandHandler("add", cmd_add))
    app.add_handler(CommandHandler("done", cmd_done))
    app.add_handler(CommandHandler("skip", cmd_skip))
    app.add_handler(CommandHandler("notdone", cmd_notdone))
    app.add_handler(CommandHandler("delete", cmd_delete))
    app.add_handler(CommandHandler("stats", cmd_stats))
    app.add_handler(CommandHandler("notes", cmd_notes))
    app.add_handler(CommandHandler("link", cmd_link))
    app.add_handler(CommandHandler("register", cmd_register))
    app.add_handler(CommandHandler("attended", cmd_attended))
    app.add_handler(CommandHandler("missed", cmd_missed))
    app.add_handler(CallbackQueryHandler(_handle_callback))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, _handle_message))


def create_bot() -> Application:
    """Create the main user-facing bot."""
    global application
    application = Application.builder().token(settings.TELEGRAM_BOT_TOKEN).build()
    _wire_handlers(application)
    return application


def create_admin_bot() -> Application | None:
    """Create the optional admin-only bot (separate token). Returns None if not configured."""
    global admin_application
    token = (settings.ADMIN_TELEGRAM_BOT_TOKEN or "").strip()
    if not token or token == "your_bot_token_here":
        return None
    admin_application = Application.builder().token(token).build()
    _wire_handlers(admin_application)
    return admin_application


async def setup_bot_commands():
    """Register command menu and Mini App menu button on both bots."""
    if application:
        await _setup_commands(application)
        await _setup_menu_button(application)
    if admin_application:
        await _setup_commands(admin_application)
        await _setup_menu_button(admin_application)


def _bot_for_role(role: str | None) -> Application | None:
    """Pick which bot to use for sending. Admin → admin bot if available; else main bot."""
    if role == "ADMIN" and admin_application:
        return admin_application
    return application


async def send_message(
    text: str,
    reply_markup=None,
    chat_id: str | None = None,
    role: str | None = None,
):
    """Send a message via the appropriate bot for the user's role."""
    bot_app = _bot_for_role(role)
    if not bot_app or not bot_app.bot:
        return
    target = chat_id or (
        settings.ADMIN_TELEGRAM_CHAT_ID if role == "ADMIN" and settings.ADMIN_TELEGRAM_CHAT_ID
        else settings.TELEGRAM_CHAT_ID
    )
    if not target:
        return
    await bot_app.bot.send_message(chat_id=target, text=text, reply_markup=reply_markup)
