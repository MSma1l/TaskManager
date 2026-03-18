from telegram import Update, BotCommand
from telegram.ext import (
    Application, CommandHandler, MessageHandler, CallbackQueryHandler, filters,
)
from app.core.config import settings
from app.core.database import SessionLocal
from app.telegram.commands import (
    cmd_start, cmd_help, cmd_today, cmd_week, cmd_tasks,
    cmd_add, cmd_done, cmd_skip, cmd_notdone, cmd_stats, cmd_delete,
)
from app.telegram.conversations import (
    handle_conversation, handle_callback_conversation,
)
from app.telegram.free_text import handle_free_text
from app.telegram.notebook_handler import cmd_notes, handle_notebook_callback, handle_notebook_text
from app.services import completion_service, task_service

application: Application | None = None

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

    # Handle task action callbacks
    if data.startswith("action_done_"):
        task_id = data[len("action_done_"):]
        db = SessionLocal()
        try:
            result = completion_service.mark_done(db, task_id)
            if result:
                from app.models.task import Task
                task = db.query(Task).filter(Task.id == task_id).first()
                name = task.title if task else task_id
                await query.edit_message_text(f"Done! \"{name}\" marcat ca facut.")
            else:
                await query.edit_message_text("Task negasit.")
        finally:
            db.close()

    elif data.startswith("action_skip_"):
        task_id = data[len("action_skip_"):]
        db = SessionLocal()
        try:
            from app.telegram.conversations import start_skip_flow
            from app.telegram.keyboards import days_keyboard
            chat_id = str(query.message.chat_id)
            start_skip_flow(db, chat_id, task_id)
            await query.edit_message_text("Muta pe:", reply_markup=days_keyboard())
        finally:
            db.close()

    elif data.startswith("action_notdone_"):
        task_id = data[len("action_notdone_"):]
        db = SessionLocal()
        try:
            from app.telegram.conversations import start_notdone_flow
            chat_id = str(query.message.chat_id)
            start_notdone_flow(db, chat_id, task_id)
            await query.edit_message_text("De ce nu ai putut face acest task? (motivul este obligatoriu)")
        finally:
            db.close()

    elif data.startswith("action_delete_"):
        task_id = data[len("action_delete_"):]
        db = SessionLocal()
        try:
            from app.models.task import Task
            from app.telegram.keyboards import confirm_delete_keyboard
            task = db.query(Task).filter(Task.id == task_id, Task.is_active == True).first()
            if not task:
                await query.edit_message_text("Task negasit.")
                return
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
            success = task_service.delete_task(db, task_id)
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
            from app.models.task import Task
            from app.telegram.keyboards import task_actions_keyboard
            task = db.query(Task).filter(Task.id == task_id).first()
            if task:
                await query.edit_message_text(
                    f"{task.title}",
                    reply_markup=task_actions_keyboard(task.id),
                )
            else:
                await query.edit_message_text("Task negasit.")
        finally:
            db.close()

    elif data.startswith("weekday_"):
        val = data[len("weekday_"):]
        db = SessionLocal()
        try:
            from datetime import datetime, timedelta
            from app.telegram.keyboards import task_actions_keyboard

            now = datetime.utcnow()
            if val == "today":
                day_of_week = now.isoweekday()
            else:
                day_of_week = int(val)

            tasks = task_service.get_tasks_for_day(db, day_of_week)
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
        BotCommand("help", "Ajutor"),
    ]
    await app.bot.set_my_commands(commands)


def create_bot() -> Application:
    global application
    app_builder = Application.builder().token(settings.TELEGRAM_BOT_TOKEN)
    application = app_builder.build()

    # Command handlers
    application.add_handler(CommandHandler("start", cmd_start))
    application.add_handler(CommandHandler("help", cmd_help))
    application.add_handler(CommandHandler("today", cmd_today))
    application.add_handler(CommandHandler("week", cmd_week))
    application.add_handler(CommandHandler("tasks", cmd_tasks))
    application.add_handler(CommandHandler("add", cmd_add))
    application.add_handler(CommandHandler("done", cmd_done))
    application.add_handler(CommandHandler("skip", cmd_skip))
    application.add_handler(CommandHandler("notdone", cmd_notdone))
    application.add_handler(CommandHandler("delete", cmd_delete))
    application.add_handler(CommandHandler("stats", cmd_stats))
    application.add_handler(CommandHandler("notes", cmd_notes))

    # Callback query handler
    application.add_handler(CallbackQueryHandler(_handle_callback))

    # Message handler (menu buttons + conversations + free text)
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, _handle_message))

    return application


async def setup_bot_commands():
    """Call after bot is initialized to register command menu."""
    if application:
        await _setup_commands(application)


async def send_message(text: str, reply_markup=None):
    """Send a message to the configured chat."""
    if application and application.bot:
        await application.bot.send_message(
            chat_id=settings.TELEGRAM_CHAT_ID,
            text=text,
            reply_markup=reply_markup,
        )
