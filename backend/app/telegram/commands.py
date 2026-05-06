from datetime import datetime, timedelta
from telegram import Update
from telegram.ext import ContextTypes
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.core.security import verify_secret
from app.models.task import Task
from app.models.completion import TaskCompletion
from app.models.base import TaskStatus
from app.models.user import User, LoginCode
from app.services import task_service, completion_service, stats_service
from app.telegram.keyboards import (
    task_actions_keyboard, week_days_keyboard, pending_tasks_keyboard, days_keyboard,
    main_menu_keyboard, all_tasks_keyboard, confirm_delete_keyboard,
)
from app.telegram.conversations import (
    start_add_flow, start_skip_flow, start_notdone_flow, clear_session,
    start_register_flow,
)

DAYS_RO = ["Luni", "Marti", "Miercuri", "Joi", "Vineri", "Sambata", "Duminica"]
DAYS_LOWER = ["luni", "marti", "miercuri", "joi", "vineri", "sambata", "duminica"]

PRIORITY_LABELS = {"URGENT": "URGENT", "HIGH": "Inalta", "MEDIUM": "Medie", "LOW": "Scazuta"}


# ── User resolution ────────────────────────────────────────────────────────

def _resolve_user(db: Session, update: Update) -> User | None:
    """Get the User account bound to this Telegram chat_id, or None."""
    chat_id = str(update.effective_chat.id)
    return (
        db.query(User)
        .filter(User.telegram_chat_id == chat_id, User.is_active == True)
        .first()
    )


async def _require_user(update: Update, db: Session) -> User | None:
    """Resolve the bound user or send a friendly "not linked" message.

    Every command except /start, /help and /link must call this so that no
    user can read or modify another user's data via the bot.
    """
    user = _resolve_user(db, update)
    if user is None:
        from app.core.config import settings
        base = (settings.FRONTEND_URL or "http://localhost").rstrip("/")
        if "3000" in base:
            base = "http://localhost"
        chat_id = str(update.effective_chat.id)
        await update.message.reply_text(
            "Acest chat nu este legat la niciun cont.\n\n"
            "Ca sa folosesti botul, leaga-l la cont:\n"
            "  • genereaza un cod /link din profilul tau pe site, apoi\n"
            "  • trimite aici: /link <cod>\n\n"
            f"Fara cont nu pot sa-ti arat taskurile altor utilizatori.\n"
            f"Cont nou? {base}/request-access?tg={chat_id}"
        )
    return user


# ── Helpers ────────────────────────────────────────────────────────────────

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


# ── Public commands ────────────────────────────────────────────────────────

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """If the chat isn't linked to any user, send the registration form URL.

    Supports deep-link /start register — kicks off the in-bot signup wizard
    (no admin approval needed, generates random PIN + suggests username).
    """
    # Deep-link handler: /start register
    args = context.args or []
    if args and args[0].lower() in {"register", "signup", "inregistrare"}:
        await _start_register_flow(update, context)
        return

    # Deep-link handler: /start qr_<sessionId>
    if args and args[0].lower().startswith("qr_"):
        qr_id = args[0][3:]  # strip "qr_" prefix
        await _handle_qr_deep_link(update, qr_id)
        return

    db = SessionLocal()
    try:
        bound = _resolve_user(db, update)
    finally:
        db.close()

    if not bound:
        from app.core.config import settings
        base = (settings.FRONTEND_URL or "http://localhost").rstrip("/")
        if "3000" in base:
            base = "http://localhost"
        chat_id = str(update.effective_chat.id)
        first_name = update.effective_user.first_name if update.effective_user else "vizitator"
        await update.message.reply_text(
            f"Buna {first_name}! Acest chat nu este legat la niciun cont Task Manager.\n\n"
            f"Ca sa primesti acces, completeaza formularul:\n"
            f"{base}/request-access?tg={chat_id}\n\n"
            f"Dupa ce admin-ul aproba cererea, vei primi un mesaj aici si vei putea intra direct.\n\n"
            f"Daca ai deja cont, genereaza un cod /link din profilul tau pe site si trimite aici:\n"
            f"  /link <cod>"
        )
        return

    await update.message.reply_text(
        f"Bun venit inapoi, {bound.full_name or bound.username}!\n\n"
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
        "/notes - Carnet\n"
        "/attended - Confirma o sedinta\n"
        "/link - Leaga chat-ul la un cont\n"
        "/help - Ajutor\n\n"
        "Adaugare rapida: scrie \"task <titlu>\" direct in chat.",
        reply_markup=main_menu_keyboard(),
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await cmd_start(update, context)


async def _handle_qr_deep_link(update: Update, qr_id: str):
    """Mobile arrived from a desktop QR scan via t.me/<bot>?start=qr_<id>.

    If the chat is bound to a user, we approve the QR session immediately —
    same effect as opening /qr-confirm/<id> on the website. Otherwise we
    explain how to register first.
    """
    from datetime import datetime
    from app.models.qr_session import QRSession
    from app.core.security import issue_token

    chat_id = str(update.effective_chat.id)
    db = SessionLocal()
    try:
        bound = (
            db.query(User)
            .filter(User.telegram_chat_id == chat_id, User.is_active == True)
            .first()
        )
        if not bound:
            await update.message.reply_text(
                "QR-ul tau e ok, dar acest chat nu e legat la niciun cont.\n\n"
                "Foloseste /register sa creezi un cont, apoi scaneaza QR-ul din nou."
            )
            return

        record = db.query(QRSession).filter(QRSession.id == qr_id).first()
        if not record:
            await update.message.reply_text("QR sessions inexistenta sau invalida.")
            return
        if record.expires_at < datetime.utcnow():
            await update.message.reply_text(
                "QR-ul a expirat. Genereaza altul pe desktop si scaneaza din nou."
            )
            return
        if record.status != "PENDING":
            await update.message.reply_text(
                f"QR-ul a fost deja folosit (status: {record.status.lower()}).\n"
                f"Genereaza altul pe desktop daca vrei sa intri."
            )
            return

        token, exp = issue_token(bound)
        record.status = "APPROVED"
        record.user_id = bound.id
        record.issued_token = token
        record.token_expires_at = exp
        record.approved_at = datetime.utcnow()
        bound.last_login_at = datetime.utcnow()
        db.commit()

        await update.message.reply_text(
            f"Logare desktop aprobata!\n\n"
            f"Te-ai conectat ca @{bound.username} ({bound.full_name or 'cont nou'}).\n"
            f"Browser-ul tau de pe desktop va intra in cateva secunde."
        )
    finally:
        db.close()


async def _start_register_flow(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Kick off the in-bot registration wizard."""
    chat_id = str(update.effective_chat.id)
    db = SessionLocal()
    try:
        existing = (
            db.query(User)
            .filter(User.telegram_chat_id == chat_id, User.is_active == True)
            .first()
        )
        if existing:
            await update.message.reply_text(
                f"Acest chat este deja legat la contul @{existing.username}.\n"
                f"Daca vrei sa schimbi PIN-ul sau parola, mergi pe site la sectiunea Profil."
            )
            return
        start_register_flow(db, chat_id)
    finally:
        db.close()
    await update.message.reply_text(
        "Hai sa-ti facem cont!\n\n"
        "Pasul 1/2: Cum te numesti? (numele complet, ex: Ion Popescu)"
    )


async def cmd_register(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Direct /register entry point (same as /start register)."""
    await _start_register_flow(update, context)


async def cmd_today(update: Update, context: ContextTypes.DEFAULT_TYPE):
    db = SessionLocal()
    try:
        user = await _require_user(update, db)
        if not user: return

        now = datetime.utcnow()
        day_of_week = now.isoweekday()
        tasks = task_service.get_tasks_for_day(db, user.id, day_of_week)
        day_name = DAYS_RO[day_of_week - 1]
        date_str = now.strftime("%d %B")

        text = _format_tasks_for_day(tasks, day_name, date_str)
        await update.message.reply_text(text, reply_markup=main_menu_keyboard())

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
        user = await _require_user(update, db)
        if not user: return

        tasks = task_service.get_tasks_for_week(db, user.id)
        if not tasks:
            await update.message.reply_text(
                "Nu ai taskuri programate saptamana aceasta.",
                reply_markup=main_menu_keyboard(),
            )
            return

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
    db = SessionLocal()
    try:
        user = await _require_user(update, db)
        if not user: return

        if not args:
            await update.message.reply_text(
                "Alege ziua:",
                reply_markup=week_days_keyboard(),
            )
            return

        arg = args[0].lower()
        now = datetime.utcnow()
        if arg == "azi" or arg == "today":
            day_of_week = now.isoweekday()
        elif arg in DAYS_LOWER:
            day_of_week = DAYS_LOWER.index(arg) + 1
        else:
            await update.message.reply_text("Zi necunoscuta. Foloseste: luni, marti, ..., duminica, azi")
            return

        tasks = task_service.get_tasks_for_day(db, user.id, day_of_week)
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
        user = await _require_user(update, db)
        if not user: return
        chat_id = str(update.effective_chat.id)
        start_add_flow(db, chat_id)
        await update.message.reply_text("Titlul taskului?")
    finally:
        db.close()


async def cmd_done(update: Update, context: ContextTypes.DEFAULT_TYPE):
    db = SessionLocal()
    try:
        user = await _require_user(update, db)
        if not user: return
        args = context.args
        if args:
            task_id = args[0]
            # Ownership check: only allow marking your own task
            task = (
                db.query(Task)
                .filter(Task.id == task_id, Task.user_id == user.id)
                .first()
            )
            if not task:
                await update.message.reply_text("Task negasit sau nu este al tau.")
                return
            result = completion_service.mark_done(db, task_id)
            if result:
                await update.message.reply_text(f"Done! Task \"{task.title}\" marcat ca facut.")
            else:
                await update.message.reply_text("Task negasit.")
        else:
            now = datetime.utcnow()
            day_of_week = now.isoweekday()
            tasks = task_service.get_tasks_for_day(db, user.id, day_of_week)
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
        user = await _require_user(update, db)
        if not user: return
        args = context.args
        if not args:
            now = datetime.utcnow()
            day_of_week = now.isoweekday()
            tasks = task_service.get_tasks_for_day(db, user.id, day_of_week)
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
        task = db.query(Task).filter(Task.id == task_id, Task.user_id == user.id).first()
        if not task:
            await update.message.reply_text("Task negasit sau nu este al tau.")
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
        user = await _require_user(update, db)
        if not user: return
        args = context.args
        if not args:
            now = datetime.utcnow()
            day_of_week = now.isoweekday()
            tasks = task_service.get_tasks_for_day(db, user.id, day_of_week)
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
        task = db.query(Task).filter(Task.id == task_id, Task.user_id == user.id).first()
        if not task:
            await update.message.reply_text("Task negasit sau nu este al tau.")
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
        user = await _require_user(update, db)
        if not user: return
        args = context.args
        if args:
            task_id = args[0]
            task = (
                db.query(Task)
                .filter(Task.id == task_id, Task.is_active == True, Task.user_id == user.id)
                .first()
            )
            if not task:
                await update.message.reply_text("Task negasit sau nu este al tau.")
                return
            await update.message.reply_text(
                f"Sigur vrei sa stergi taskul \"{task.title}\"?",
                reply_markup=confirm_delete_keyboard(task.id),
            )
        else:
            tasks = task_service.get_all_tasks(db, user.id)
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


async def _set_attendance(update: Update, context: ContextTypes.DEFAULT_TYPE, status: str):
    """Shared logic for /attended and /missed."""
    from app.models.calendar import CalendarEvent

    args = context.args
    if not args:
        cmd = "/attended" if status == "ATTENDED" else "/missed"
        await update.message.reply_text(f"Foloseste: {cmd} <event_id> [nota]")
        return

    event_id = args[0].split("::", 1)[0]
    note = " ".join(args[1:]).strip()

    db = SessionLocal()
    try:
        user = await _require_user(update, db)
        if not user: return

        event = (
            db.query(CalendarEvent)
            .filter(CalendarEvent.id == event_id, CalendarEvent.is_deleted == False)
            .first()
        )
        if not event:
            await update.message.reply_text("Eveniment negasit.")
            return

        # Strict ownership: only the event's owner can change attendance
        if event.user_id != user.id:
            await update.message.reply_text("Acest eveniment nu este al tau.")
            return

        event.attendance_status = status
        if note:
            event.attendance_note = note
        event.updated_at = datetime.utcnow()
        db.commit()

        if status == "ATTENDED":
            msg = f"Confirmat: ai fost la \"{event.title}\""
        else:
            msg = f"Marcat: nu ai fost la \"{event.title}\""
        if note:
            msg += "\nNota salvata."
        await update.message.reply_text(msg)
    finally:
        db.close()


async def cmd_attended(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await _set_attendance(update, context, "ATTENDED")


async def cmd_missed(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await _set_attendance(update, context, "MISSED")


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
            f"De acum primesti aici codurile de logare si notificarile.\n"
            f"Doar TASKURILE TALE iti vor fi vizibile in acest chat."
        )
    finally:
        db.close()


async def cmd_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    db = SessionLocal()
    try:
        user = await _require_user(update, db)
        if not user: return

        stats = stats_service.get_weekly_stats(db, user_id=user.id)
        streaks = stats_service.get_streaks(db, user_id=user.id)

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
