import json
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from telegram import Update, InlineKeyboardMarkup, InlineKeyboardButton
from telegram.ext import ContextTypes

from app.core.database import SessionLocal
from app.models.session import TelegramSession
from app.models.category import Category
from app.models.task import Task
from app.services import task_service
from app.telegram.keyboards import (
    categories_keyboard, days_keyboard, reminder_times_keyboard, recurring_keyboard,
    task_actions_keyboard, days_keyboard,
)


def get_session(db: Session, chat_id: str) -> dict | None:
    session = db.query(TelegramSession).filter(TelegramSession.chat_id == chat_id).first()
    if session:
        return json.loads(session.state)
    return None


def set_session(db: Session, chat_id: str, state: dict):
    session = db.query(TelegramSession).filter(TelegramSession.chat_id == chat_id).first()
    state_json = json.dumps(state)
    if session:
        session.state = state_json
        session.updated_at = datetime.utcnow()
    else:
        session = TelegramSession(chat_id=chat_id, state=state_json, updated_at=datetime.utcnow())
        db.add(session)
    db.commit()


def clear_session(db: Session, chat_id: str):
    session = db.query(TelegramSession).filter(TelegramSession.chat_id == chat_id).first()
    if session:
        db.delete(session)
        db.commit()


def _parse_date_input(text: str) -> datetime | None:
    """Parse date from DD.MM.YYYY or DD/MM/YYYY format."""
    for fmt in ("%d.%m.%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(text.strip(), fmt)
        except ValueError:
            continue
    return None


def _date_to_str(dt: datetime) -> str:
    days_ro = ["Luni", "Marti", "Miercuri", "Joi", "Vineri", "Sambata", "Duminica"]
    return f"{dt.strftime('%d.%m.%Y')} ({days_ro[dt.weekday()]})"


async def handle_conversation(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    """Handle ongoing conversation. Returns True if handled, False if no active session."""
    db = SessionLocal()
    try:
        chat_id = str(update.effective_chat.id)
        state = get_session(db, chat_id)
        if not state:
            return False

        flow = state.get("flow")
        step = state.get("step", 0)
        data = state.get("data", {})

        if flow == "add_task":
            return await _handle_add_task(update, context, db, chat_id, step, data, state)
        elif flow == "free_task":
            return await _handle_free_task(update, context, db, chat_id, step, data, state)
        elif flow == "skip_task":
            return await _handle_skip_task(update, context, db, chat_id, step, data, state)
        elif flow == "notdone_task":
            return await _handle_notdone_task(update, context, db, chat_id, step, data, state)
        elif flow == "register":
            return await handle_register_text(update, db, chat_id, step, data, state)
        elif flow == "tglogin":
            return await handle_tglogin_text(update, db, chat_id, step, data, state)

        return False
    finally:
        db.close()


async def handle_callback_conversation(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    """Handle callback queries for active conversations."""
    db = SessionLocal()
    try:
        query = update.callback_query
        chat_id = str(query.message.chat_id)
        state = get_session(db, chat_id)
        if not state:
            return False

        flow = state.get("flow")
        step = state.get("step", 0)
        data = state.get("data", {})
        callback_data = query.data

        await query.answer()

        if flow in ("add_task", "free_task"):
            return await _handle_add_free_callback(
                update, context, db, chat_id, step, data, state, callback_data, flow
            )
        elif flow == "skip_task":
            return await _handle_skip_callback(
                update, context, db, chat_id, step, data, state, callback_data
            )

        return False
    finally:
        db.close()


async def _handle_add_task(update, context, db, chat_id, step, data, state):
    text = update.message.text.strip() if update.message and update.message.text else ""

    if step == 1:
        # Waiting for title
        data["title"] = text
        state["step"] = 2
        state["data"] = data
        set_session(db, chat_id, state)

        categories = db.query(Category).order_by(Category.name).all()
        await update.message.reply_text(
            "Alege categoria:",
            reply_markup=categories_keyboard(categories),
        )
        return True

    if step == 4:
        # Waiting for custom date input
        parsed = _parse_date_input(text)
        if not parsed:
            await update.message.reply_text("Format invalid. Scrie data in format DD.MM.YYYY sau DD/MM/YYYY:")
            return True
        data["date"] = parsed.isoformat()
        data["dayOfWeek"] = parsed.isoweekday()
        state["step"] = 5
        state["data"] = data
        set_session(db, chat_id, state)
        await update.message.reply_text("Ora reminder?", reply_markup=reminder_times_keyboard())
        return True

    return False


async def _handle_free_task(update, context, db, chat_id, step, data, state):
    text = update.message.text.strip() if update.message and update.message.text else ""

    if step == 4:
        # Waiting for custom date input
        parsed = _parse_date_input(text)
        if not parsed:
            await update.message.reply_text("Format invalid. Scrie data in format DD.MM.YYYY sau DD/MM/YYYY:")
            return True
        data["date"] = parsed.isoformat()
        data["dayOfWeek"] = parsed.isoweekday()
        state["step"] = 5
        state["data"] = data
        set_session(db, chat_id, state)
        await update.message.reply_text("Ora reminder?", reply_markup=reminder_times_keyboard())
        return True

    return False


async def _handle_skip_task(update, context, db, chat_id, step, data, state):
    text = update.message.text.strip() if update.message and update.message.text else ""

    if step == 2:
        # Waiting for custom date
        parsed = _parse_date_input(text)
        if not parsed:
            await update.message.reply_text("Format invalid. Scrie data in format DD.MM.YYYY sau DD/MM/YYYY:")
            return True
        data["movedToDate"] = parsed.isoformat()
        state["step"] = 3
        state["data"] = data
        set_session(db, chat_id, state)
        await update.message.reply_text("Scrie motivul sau trimite /skip pentru a omite:")
        return True

    if step == 3:
        # Waiting for reason (optional)
        from app.services import completion_service
        reason = None if text == "/skip" else text
        completion_service.mark_skip(db, data["taskId"], data["movedToDate"], reason)
        clear_session(db, chat_id)

        date_obj = datetime.fromisoformat(data["movedToDate"])
        await update.message.reply_text(f"Task mutat pe {_date_to_str(date_obj)}")
        return True

    return False


async def _handle_notdone_task(update, context, db, chat_id, step, data, state):
    text = update.message.text.strip() if update.message and update.message.text else ""

    if step == 1:
        if not text or len(text.strip()) < 3:
            await update.message.reply_text("Motivul este obligatoriu. De ce nu ai putut face acest task?")
            return True

        from app.services import completion_service
        completion_service.mark_not_done(db, data["taskId"], text)
        clear_session(db, chat_id)
        await update.message.reply_text(f"Task marcat ca nefacut. Motiv: {text}")
        return True

    return False


async def _handle_add_free_callback(update, context, db, chat_id, step, data, state, callback_data, flow):
    query = update.callback_query
    now = datetime.utcnow()

    # Step 2: Category selection
    if callback_data.startswith("cat_") and step == 2:
        cat_id = callback_data[4:]
        data["categoryId"] = cat_id
        state["step"] = 3
        state["data"] = data
        set_session(db, chat_id, state)
        await query.edit_message_text("Pe ce data vrei sa adaugi acest task?", reply_markup=days_keyboard())
        return True

    # Step 3: Date selection
    if step == 3:
        if callback_data == "day_today":
            data["date"] = now.isoformat()
            data["dayOfWeek"] = now.isoweekday()
        elif callback_data == "day_tomorrow":
            tomorrow = now + timedelta(days=1)
            data["date"] = tomorrow.isoformat()
            data["dayOfWeek"] = tomorrow.isoweekday()
        elif callback_data == "day_after_tomorrow":
            after = now + timedelta(days=2)
            data["date"] = after.isoformat()
            data["dayOfWeek"] = after.isoweekday()
        elif callback_data == "day_pick":
            state["step"] = 4
            set_session(db, chat_id, state)
            await query.edit_message_text("Scrie data in format DD.MM.YYYY sau DD/MM/YYYY:")
            return True
        else:
            return False

        state["step"] = 5
        state["data"] = data
        set_session(db, chat_id, state)
        await query.edit_message_text("Ora reminder?", reply_markup=reminder_times_keyboard())
        return True

    # Step 5: Reminder time
    if callback_data.startswith("rem_") and step == 5:
        time_val = callback_data[4:]
        data["reminderTime"] = None if time_val == "none" else time_val
        state["step"] = 6
        state["data"] = data
        set_session(db, chat_id, state)

        if flow == "add_task":
            await query.edit_message_text("Task repetabil saptamanal?", reply_markup=recurring_keyboard())
        else:
            # free_task: create directly (non-recurring)
            data["isRecurring"] = False
            await _create_task_from_state(query, db, chat_id, data)
        return True

    # Step 6: Recurring (only for add_task)
    if (callback_data.startswith("recurring_")) and step == 6:
        data["isRecurring"] = callback_data == "recurring_yes"
        await _create_task_from_state(query, db, chat_id, data)
        return True

    return False


async def _handle_skip_callback(update, context, db, chat_id, step, data, state, callback_data):
    query = update.callback_query
    now = datetime.utcnow()

    if step == 1:
        if callback_data == "day_today":
            data["movedToDate"] = now.isoformat()
        elif callback_data == "day_tomorrow":
            data["movedToDate"] = (now + timedelta(days=1)).isoformat()
        elif callback_data == "day_after_tomorrow":
            data["movedToDate"] = (now + timedelta(days=2)).isoformat()
        elif callback_data == "day_pick":
            state["step"] = 2
            set_session(db, chat_id, state)
            await query.edit_message_text("Scrie data in format DD.MM.YYYY sau DD/MM/YYYY:")
            return True
        else:
            return False

        state["step"] = 3
        state["data"] = data
        set_session(db, chat_id, state)
        await query.edit_message_text("Scrie motivul sau trimite /skip pentru a omite:")
        return True

    return False


async def _create_task_from_state(query, db, chat_id, data):
    from app.models.user import User
    date_obj = datetime.fromisoformat(data["date"]) if data.get("date") else datetime.utcnow()
    cat = db.query(Category).filter(Category.id == data.get("categoryId")).first()
    cat_name = f"{cat.icon} {cat.name}" if cat else "Unknown"

    bound = (
        db.query(User)
        .filter(User.telegram_chat_id == chat_id, User.is_active == True)
        .first()
    )
    if not bound:
        clear_session(db, chat_id)
        await query.edit_message_text(
            "Acest chat nu este legat la niciun cont — taskul NU a fost creat. "
            "Foloseste /link <cod> ca sa il legi."
        )
        return

    task_data = {
        "title": data.get("title", "Untitled"),
        "categoryId": data.get("categoryId", "cat-other"),
        "dayOfWeek": data.get("dayOfWeek", date_obj.isoweekday()),
        "scheduledDate": data.get("date"),
        "reminderTime": data.get("reminderTime"),
        "isRecurring": data.get("isRecurring", False),
    }

    task_service.create_task(db, bound.id, task_data)
    clear_session(db, chat_id)

    reminder_text = f", reminder la {data['reminderTime']}" if data.get("reminderTime") else ""
    recurring_text = ", repetabil saptamanal" if data.get("isRecurring") else ""

    await query.edit_message_text(
        f"Task adaugat: \"{data.get('title')}\" pe {_date_to_str(date_obj)} "
        f"in categoria {cat_name}{reminder_text}{recurring_text}"
    )


def start_add_flow(db: Session, chat_id: str):
    state = {"flow": "add_task", "step": 1, "data": {}}
    set_session(db, chat_id, state)


def start_free_task_flow(db: Session, chat_id: str, title: str):
    state = {"flow": "free_task", "step": 2, "data": {"title": title}}
    set_session(db, chat_id, state)


def start_skip_flow(db: Session, chat_id: str, task_id: str):
    state = {"flow": "skip_task", "step": 1, "data": {"taskId": task_id}}
    set_session(db, chat_id, state)


def start_notdone_flow(db: Session, chat_id: str, task_id: str):
    state = {"flow": "notdone_task", "step": 1, "data": {"taskId": task_id}}
    set_session(db, chat_id, state)


def start_register_flow(db: Session, chat_id: str):
    """Pornește wizardul de înregistrare din bot (acum cu aprobare admin).

    Pasul 1: numele complet → creează o cerere de acces PENDING + notifică
    adminul global. Userul NU mai e creat instant — adminul aprobă cu un buton.
    """
    state = {"flow": "register", "step": 1, "data": {}}
    set_session(db, chat_id, state)


def start_tglogin_flow(db: Session, chat_id: str, session_id: str):
    """Pornește colectarea datelor pentru login simplu din Telegram (web așteaptă)."""
    state = {"flow": "tglogin", "step": 1, "data": {"sessionId": session_id}}
    set_session(db, chat_id, state)


def _admin_decision_keyboard(request_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Permite", callback_data=f"accreq_approve_{request_id}"),
        InlineKeyboardButton("❌ Refuza", callback_data=f"accreq_reject_{request_id}"),
    ]])


async def notify_admin_new_signup(request) -> None:
    """Trimite adminului global întrebarea cu butoane Da/Nu pentru o cerere nouă."""
    from app.telegram.bot import send_message
    from app.core.config import settings

    name = f"{request.first_name} {request.last_name}".strip()
    via = "web (Telegram)" if request.source == "telegram" else request.source
    text = (
        f"Cerere noua de logare:\n"
        f"  Nume: {name}\n"
        f"  Sursa: {via}\n\n"
        f"Permiti acestei persoane sa se logheze?"
    )
    markup = _admin_decision_keyboard(request.id)
    target = (settings.ADMIN_TELEGRAM_CHAT_ID or "").strip()
    try:
        if target:
            await send_message(text, reply_markup=markup, chat_id=target, role="ADMIN")
            return
        # Fallback: toți adminii cu chat legat (dacă nu e setat adminul global).
        from app.models.user import User
        admin_db = SessionLocal()
        try:
            admins = (
                admin_db.query(User)
                .filter(User.role == "ADMIN", User.is_active == True)
                .all()
            )
            chat_ids = [a.telegram_chat_id for a in admins if a.telegram_chat_id]
        finally:
            admin_db.close()
        for cid in chat_ids:
            await send_message(text, reply_markup=markup, chat_id=cid, role="ADMIN")
    except Exception as e:
        print(f"notify_admin_new_signup error: {e}")


async def handle_register_text(update, db, chat_id: str, step: int, data: dict, state: dict) -> bool:
    """Pasul 1 al /register: numele → cerere de acces PENDING + notificare admin."""
    text = (update.message.text or "").strip()

    if step == 1:
        if len(text) < 2 or len(text) > 100:
            await update.message.reply_text(
                "Numele trebuie sa aiba 2-100 caractere. Incearca din nou:"
            )
            return True
        from app.services import access_service
        request = access_service.create_telegram_signup(db, chat_id, text)
        clear_session(db, chat_id)
        await notify_admin_new_signup(request)
        await update.message.reply_text(
            f"Multumesc, {text}!\n\n"
            "Cererea ta a fost trimisa adminului. Vei fi anuntat aici, pe Telegram, "
            "imediat ce este aprobata — apoi te poti loga."
        )
        return True

    return False


async def handle_tglogin_text(update, db, chat_id: str, step: int, data: dict, state: dict) -> bool:
    """Pasul 1 al login-ului din Telegram pentru un chat nelegat: numele →
    cerere de acces legată de sesiunea web → notificare admin."""
    text = (update.message.text or "").strip()

    if step == 1:
        if len(text) < 2 or len(text) > 100:
            await update.message.reply_text(
                "Numele trebuie sa aiba 2-100 caractere. Incearca din nou:"
            )
            return True
        from app.services import access_service
        from app.models.qr_session import QRSession

        session_id = data.get("sessionId")
        request = access_service.create_telegram_signup(db, chat_id, text, qr_session_id=session_id)
        # Marchează sesiunea web ca "așteaptă aprobarea adminului".
        if session_id:
            session = db.query(QRSession).filter(QRSession.id == session_id).first()
            if session and session.status not in {"CONSUMED", "EXPIRED", "APPROVED"}:
                session.status = "AWAITING_ADMIN"
                session.access_request_id = request.id
                db.commit()
        clear_session(db, chat_id)
        await notify_admin_new_signup(request)
        await update.message.reply_text(
            f"Multumesc, {text}!\n\n"
            "Cererea ta a fost trimisa adminului. Cand o aproba, vei fi logat "
            "automat aici si in browser-ul de pe care ai pornit."
        )
        return True

    return False
