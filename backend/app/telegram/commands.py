from datetime import datetime, timedelta
from telegram import Update
from telegram.ext import ContextTypes
from app.core.database import SessionLocal
from app.core.security import verify_secret
from app.models.task import Task
from app.models.completion import TaskCompletion
from app.models.base import TaskStatus
from app.models.category import Category
from app.models.user import User, LoginCode
from app.services import task_service, completion_service, stats_service
from app.telegram.keyboards import (
    task_actions_keyboard, week_days_keyboard, pending_tasks_keyboard, days_keyboard,
    main_menu_keyboard, all_tasks_keyboard, confirm_delete_keyboard,
)
from app.telegram.conversations import (
    start_add_flow, start_skip_flow, start_notdone_flow, clear_session,
)

DAYS_RO = ["Luni", "Marti", "Miercuri", "Joi", "Vineri", "Sambata", "Duminica"]
DAYS_LOWER = ["luni", "marti", "miercuri", "joi", "vineri", "sambata", "duminica"]

PRIORITY_LABELS = {"URGENT": "URGENT", "HIGH": "Inalta", "MEDIUM": "Medie", "LOW": "Scazuta"}


def _status_icon(status: str) -> str:
    icons = {"DONE": "Done ", "PENDING": "Pending ", "SKIPPED": "Skipped ", "NOT_DONE": "Not Done "}
    return icons.get(status, "")


def _format_tasks_for_day(tasks: list, day_name: str, date_str: str) -> str:
    if not tasks:
        return f"Taskuri pentru {day_name}, {date_str}:\n\nNu ai taskuri programate."

    lines = [f"Taskuri pentru {day_name}, {date_str}:\n"]
    done_count = 0
    total_minutes = 0
    for task in tasks:
        comp = task.completions[0] if task.completions else None
        status = comp.status.value if comp else "PENDING"
        if status == "DONE":
            done_count += 1

        icon = _status_icon(status)
        reminder = f" la {task.reminder_time}" if task.reminder_time else ""
        duration = ""
        if task.estimated_minutes:
            total_minutes += task.estimated_minutes
            if task.estimated_minutes >= 60:
                h = task.estimated_minutes // 60
                m = task.estimated_minutes % 60
                duration = f" [{h}h{m}m]" if m else f" [{h}h]"
            else:
                duration = f" [{task.estimated_minutes}m]"
        prio = ""
        if task.priority and task.priority not in ("MEDIUM", None):
            prio = f" [{PRIORITY_LABELS.get(task.priority, task.priority)}]"
        reason = ""
        if status == "NOT_DONE" and comp and comp.skip_reason:
            reason = f"\n    Motiv: {comp.skip_reason}"
        elif status == "SKIPPED" and comp and comp.moved_to_date:
            reason = f"\n    Mutat pe {comp.moved_to_date.strftime('%d.%m')}"

        lines.append(f"{icon}{task.title}{prio}{duration}{reminder}{reason}")

    lines.append(f"\nProgres: {done_count}/{len(tasks)} completate")
    if total_minutes > 0:
        h = total_minutes // 60
        m = total_minutes % 60
        time_str = f"{h}h {m}m" if h else f"{m}m"
        lines.append(f"Timp estimat total: {time_str}")
    return "\n".join(lines)


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "Weekly Task Manager Bot\n\n"
        "Foloseste butoanele de mai jos sau comenzile:\n\n"
        "/today - Taskurile de azi\n"
        "/week - Taskurile saptamanii\n"
        "/tasks - Alege ziua si vezi taskurile\n"
        "/add - Adauga task nou\n"
        "/done - Marcheaza task ca facut\n"
        "/skip - Muta task pe alta zi\n"
        "/notdone - Marcheaza ca nefacut\n"
        "/delete - Sterge un task\n"
        "/stats - Statistici\n"
        "/help - Ajutor\n\n"
        "Adaugare rapida: scrie \"task <titlu>\" direct in chat.",
        reply_markup=main_menu_keyboard(),
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await cmd_start(update, context)


async def cmd_today(update: Update, context: ContextTypes.DEFAULT_TYPE):
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        day_of_week = now.isoweekday()
        tasks = task_service.get_tasks_for_day(db, day_of_week)
        day_name = DAYS_RO[day_of_week - 1]
        date_str = now.strftime("%d %B")

        text = _format_tasks_for_day(tasks, day_name, date_str)
        await update.message.reply_text(text, reply_markup=main_menu_keyboard())

        # Send action buttons for pending tasks
        for task in tasks:
            comp = task.completions[0] if task.completions else None
            status = comp.status.value if comp else "PENDING"
            if status == "PENDING":
                await update.message.reply_text(
                    f"{task.title}",
                    reply_markup=task_actions_keyboard(task.id),
                )
    finally:
        db.close()


async def cmd_week(update: Update, context: ContextTypes.DEFAULT_TYPE):
    db = SessionLocal()
    try:
        tasks = task_service.get_tasks_for_week(db)
        if not tasks:
            await update.message.reply_text(
                "Nu ai taskuri programate saptamana aceasta.",
                reply_markup=main_menu_keyboard(),
            )
            return

        # Group by day
        by_day: dict[int, list] = {}
        for task in tasks:
            by_day.setdefault(task.day_of_week, []).append(task)

        now = datetime.utcnow()
        week_start = task_service.get_week_start(now)

        lines = ["Taskurile saptamanii:\n"]
        total_est = 0
        for day_num in sorted(by_day.keys()):
            day_tasks = by_day[day_num]
            day_name = DAYS_RO[day_num - 1]
            day_date = (week_start + timedelta(days=day_num - 1)).strftime("%d.%m")
            is_today = day_num == now.isoweekday()
            marker = " <<< AZI" if is_today else ""
            lines.append(f"\n{day_name} ({day_date}){marker}:")
            for task in day_tasks:
                comp = task.completions[0] if task.completions else None
                status = comp.status.value if comp else "PENDING"
                icon = _status_icon(status)
                duration = ""
                if task.estimated_minutes:
                    total_est += task.estimated_minutes
                    duration = f" [{task.estimated_minutes}m]"
                lines.append(f"  {icon}{task.title}{duration}")

        if total_est > 0:
            h = total_est // 60
            m = total_est % 60
            lines.append(f"\nTimp estimat total saptamana: {h}h {m}m" if h else f"\nTimp estimat total: {m}m")

        await update.message.reply_text("\n".join(lines), reply_markup=main_menu_keyboard())
    finally:
        db.close()


async def cmd_tasks(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = context.args
    if not args:
        await update.message.reply_text(
            "Alege ziua:",
            reply_markup=week_days_keyboard(),
        )
        return

    arg = args[0].lower()
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        if arg == "azi" or arg == "today":
            day_of_week = now.isoweekday()
        elif arg in DAYS_LOWER:
            day_of_week = DAYS_LOWER.index(arg) + 1
        else:
            await update.message.reply_text("Zi necunoscuta. Foloseste: luni, marti, ..., duminica, azi")
            return

        tasks = task_service.get_tasks_for_day(db, day_of_week)
        day_name = DAYS_RO[day_of_week - 1]
        diff = day_of_week - now.isoweekday()
        date_obj = now + timedelta(days=diff)
        date_str = date_obj.strftime("%d.%m.%Y")

        text = _format_tasks_for_day(tasks, day_name, date_str)
        await update.message.reply_text(text)

        for task in tasks:
            comp = task.completions[0] if task.completions else None
            status = comp.status.value if comp else "PENDING"
            if status == "PENDING":
                await update.message.reply_text(
                    f"{task.title}",
                    reply_markup=task_actions_keyboard(task.id),
                )
    finally:
        db.close()


async def cmd_add(update: Update, context: ContextTypes.DEFAULT_TYPE):
    db = SessionLocal()
    try:
        chat_id = str(update.effective_chat.id)
        start_add_flow(db, chat_id)
        await update.message.reply_text("Titlul taskului?")
    finally:
        db.close()


async def cmd_done(update: Update, context: ContextTypes.DEFAULT_TYPE):
    db = SessionLocal()
    try:
        args = context.args
        if args:
            task_id = args[0]
            result = completion_service.mark_done(db, task_id)
            if result:
                task = db.query(Task).filter(Task.id == task_id).first()
                name = task.title if task else task_id
                await update.message.reply_text(f"Done! Task \"{name}\" marcat ca facut.")
            else:
                await update.message.reply_text("Task negasit.")
        else:
            now = datetime.utcnow()
            day_of_week = now.isoweekday()
            tasks = task_service.get_tasks_for_day(db, day_of_week)
            pending = [(t, t.completions[0] if t.completions else None) for t in tasks]
            pending = [(t, c) for t, c in pending if not c or c.status == TaskStatus.PENDING]

            if not pending:
                await update.message.reply_text("Nu ai taskuri PENDING de azi.")
                return

            await update.message.reply_text(
                "Alege taskul de marcat ca facut:",
                reply_markup=pending_tasks_keyboard(pending),
            )
    finally:
        db.close()


async def cmd_skip(update: Update, context: ContextTypes.DEFAULT_TYPE):
    db = SessionLocal()
    try:
        args = context.args
        if not args:
            # Show pending tasks for today with skip option
            now = datetime.utcnow()
            day_of_week = now.isoweekday()
            tasks = task_service.get_tasks_for_day(db, day_of_week)
            pending = [t for t in tasks if not t.completions or t.completions[0].status == TaskStatus.PENDING]
            if not pending:
                await update.message.reply_text("Nu ai taskuri PENDING de azi.")
                return
            await update.message.reply_text(
                "Alege taskul de mutat:",
                reply_markup=all_tasks_keyboard(pending),
            )
            return

        task_id = args[0]
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            await update.message.reply_text("Task negasit.")
            return

        chat_id = str(update.effective_chat.id)
        start_skip_flow(db, chat_id, task_id)
        await update.message.reply_text(
            f"Muta taskul \"{task.title}\" pe:",
            reply_markup=days_keyboard(),
        )
    finally:
        db.close()


async def cmd_notdone(update: Update, context: ContextTypes.DEFAULT_TYPE):
    db = SessionLocal()
    try:
        args = context.args
        if not args:
            now = datetime.utcnow()
            day_of_week = now.isoweekday()
            tasks = task_service.get_tasks_for_day(db, day_of_week)
            pending = [t for t in tasks if not t.completions or t.completions[0].status == TaskStatus.PENDING]
            if not pending:
                await update.message.reply_text("Nu ai taskuri PENDING de azi.")
                return
            await update.message.reply_text(
                "Alege taskul:",
                reply_markup=all_tasks_keyboard(pending),
            )
            return

        task_id = args[0]
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            await update.message.reply_text("Task negasit.")
            return

        chat_id = str(update.effective_chat.id)
        start_notdone_flow(db, chat_id, task_id)
        await update.message.reply_text(
            f"De ce nu ai putut face taskul \"{task.title}\"? (motivul este obligatoriu)"
        )
    finally:
        db.close()


async def cmd_delete(update: Update, context: ContextTypes.DEFAULT_TYPE):
    db = SessionLocal()
    try:
        args = context.args
        if args:
            task_id = args[0]
            task = db.query(Task).filter(Task.id == task_id, Task.is_active == True).first()
            if not task:
                await update.message.reply_text("Task negasit.")
                return
            await update.message.reply_text(
                f"Sigur vrei sa stergi taskul \"{task.title}\"?",
                reply_markup=confirm_delete_keyboard(task.id),
            )
        else:
            # Show all active tasks to pick from
            tasks = task_service.get_all_tasks(db)
            if not tasks:
                await update.message.reply_text("Nu ai taskuri active.")
                return
            buttons = []
            from telegram import InlineKeyboardButton, InlineKeyboardMarkup
            for task in tasks:
                prio = ""
                if task.priority and task.priority not in ("MEDIUM", None):
                    prio_icons = {"URGENT": "!", "HIGH": "!", "LOW": ""}
                    prio = prio_icons.get(task.priority, "")
                buttons.append([InlineKeyboardButton(
                    f"{prio}{task.category.icon} {task.title}",
                    callback_data=f"action_delete_{task.id}",
                )])
            await update.message.reply_text(
                "Alege taskul de sters:",
                reply_markup=InlineKeyboardMarkup(buttons),
            )
    finally:
        db.close()


async def cmd_attended(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Mark a meeting as attended, optionally with a note appended after the event id."""
    args = context.args
    if not args:
        await update.message.reply_text("Foloseste: /attended <event_id> [nota]")
        return

    from app.models.calendar import CalendarEvent
    event_id = args[0].split("::", 1)[0]
    note = " ".join(args[1:]).strip()
    chat_id = str(update.effective_chat.id)

    db = SessionLocal()
    try:
        event = (
            db.query(CalendarEvent)
            .filter(CalendarEvent.id == event_id, CalendarEvent.is_deleted == False)
            .first()
        )
        if not event:
            await update.message.reply_text("Eveniment negasit.")
            return

        # Verify the chat is bound to the event's user
        bound_user = db.query(User).filter(User.telegram_chat_id == chat_id).first()
        if not bound_user or bound_user.id != event.user_id:
            # Fallback for legacy single-tenant
            if event.user_id != chat_id:
                await update.message.reply_text("Acest eveniment nu este al tau.")
                return

        prefix = "ATTENDED"
        existing = (event.description or "").strip()
        body = f"[{prefix}] {note}" if note else f"[{prefix}]"
        if existing:
            event.description = f"{body}\n---\n{existing}" if prefix not in existing else (
                f"{existing}\n{body}" if note else existing
            )
        else:
            event.description = body
        event.updated_at = datetime.utcnow()
        db.commit()

        await update.message.reply_text(
            f"Confirmat: ai fost la \"{event.title}\". Nota salvata." if note
            else f"Confirmat: ai fost la \"{event.title}\"."
        )
    finally:
        db.close()


async def cmd_link(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Bind this Telegram chat to a user account via a one-time code from the admin."""
    args = context.args
    if not args:
        await update.message.reply_text(
            "Foloseste: /link <cod>\n"
            "Codul ti-l da admin-ul din pagina de utilizatori."
        )
        return

    raw_code = args[0].strip()
    chat_id = str(update.effective_chat.id)
    db = SessionLocal()
    try:
        candidates = (
            db.query(LoginCode)
            .filter(
                LoginCode.purpose == "link",
                LoginCode.used_at.is_(None),
                LoginCode.expires_at > datetime.utcnow(),
            )
            .all()
        )
        match = next((c for c in candidates if verify_secret(raw_code, c.code_hash)), None)
        if not match:
            await update.message.reply_text("Cod invalid sau expirat.")
            return

        user = db.query(User).filter(User.id == match.user_id).first()
        if not user:
            await update.message.reply_text("Utilizatorul nu mai exista.")
            return

        # If another user is bound to this chat, unbind it first
        db.query(User).filter(
            User.telegram_chat_id == chat_id, User.id != user.id
        ).update({"telegram_chat_id": None})

        user.telegram_chat_id = chat_id
        match.used_at = datetime.utcnow()
        db.commit()

        await update.message.reply_text(
            f"Cont legat: @{user.username}\n"
            f"De acum primesti aici codurile de logare si notificarile."
        )
    finally:
        db.close()


async def cmd_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    db = SessionLocal()
    try:
        stats = stats_service.get_weekly_stats(db)
        streaks = stats_service.get_streaks(db)

        bar_len = 10
        filled = round(stats['percentage'] / 100 * bar_len)
        bar = "=" * filled + "-" * (bar_len - filled)

        text = (
            f"Statistici saptamana curenta:\n\n"
            f"[{bar}] {stats['percentage']}%\n\n"
            f"Total: {stats['total']}\n"
            f"Completate: {stats['done']}\n"
            f"Mutate: {stats['skipped']}\n"
            f"Nefacute: {stats['notDone']}\n"
        )

        if streaks:
            text += "\nTop streak-uri:"
            for s in streaks[:3]:
                text += f"\n  {s['taskTitle']}: {s['streak']} saptamani consecutive"

        await update.message.reply_text(text, reply_markup=main_menu_keyboard())
    finally:
        db.close()
