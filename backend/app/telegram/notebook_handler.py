"""Telegram bot handler for the Personal Notebook module.
All callback_data prefixed with 'nb_' to avoid conflicts."""

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from app.core.database import SessionLocal
from app.services import notebook_service
from app.telegram.conversations import get_session, set_session, clear_session

# ── KEYBOARDS ────────────────────────────────────────

def nb_main_menu():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("Time Management", callback_data="nb_tm")],
        [InlineKeyboardButton("Idei", callback_data="nb_ideas")],
    ])


def nb_tm_menu():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("Pasi", callback_data="nb_tm_steps")],
        [InlineKeyboardButton("Taskuri", callback_data="nb_tm_tasks")],
        [InlineKeyboardButton("Inapoi", callback_data="nb_main")],
    ])


def nb_steps_menu():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("+ Adauga pas", callback_data="nb_add_step")],
        [InlineKeyboardButton("Inapoi", callback_data="nb_tm")],
    ])


def nb_tasks_menu():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("+ Adauga task", callback_data="nb_add_task")],
        [InlineKeyboardButton("Inapoi", callback_data="nb_tm")],
    ])


def nb_task_status_buttons(note_id, current_status):
    buttons = []
    statuses = [("Todo", "todo"), ("In Progress", "in_progress"), ("Done", "done")]
    row = []
    for label, status in statuses:
        if status != current_status:
            row.append(InlineKeyboardButton(label, callback_data=f"nb_status_{note_id}_{status}"))
    buttons.append(row)
    buttons.append([
        InlineKeyboardButton("Edit", callback_data=f"nb_edit_{note_id}"),
        InlineKeyboardButton("Sterge", callback_data=f"nb_del_{note_id}"),
    ])
    return buttons


def nb_note_actions(note_id):
    return [
        InlineKeyboardButton("Edit", callback_data=f"nb_edit_{note_id}"),
        InlineKeyboardButton("Sterge", callback_data=f"nb_del_{note_id}"),
    ]


def nb_ideas_menu(topics):
    buttons = []
    for t in topics:
        label = f"{t.emoji} {t.name}" if t.emoji else t.name
        buttons.append([InlineKeyboardButton(label, callback_data=f"nb_topic_{t.id}")])
    buttons.append([InlineKeyboardButton("+ Topic nou", callback_data="nb_add_topic")])
    buttons.append([InlineKeyboardButton("Inapoi", callback_data="nb_main")])
    return InlineKeyboardMarkup(buttons)


def nb_topic_menu(topic_id):
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("+ Idee noua", callback_data=f"nb_add_idea_{topic_id}")],
        [
            InlineKeyboardButton("Edit topic", callback_data=f"nb_edit_topic_{topic_id}"),
            InlineKeyboardButton("Sterge topic", callback_data=f"nb_del_topic_{topic_id}"),
        ],
        [InlineKeyboardButton("Inapoi", callback_data="nb_ideas")],
    ])


# ── STATUS ICONS ─────────────────────────────────────

TASK_ICONS = {
    "todo": "[ ]",
    "in_progress": "[~]",
    "done": "[x]",
}


# ── COMMAND HANDLER ──────────────────────────────────

async def cmd_notes(update: Update, context):
    """Handle /notes command - show main notebook menu."""
    await update.message.reply_text(
        "Carnetul meu",
        reply_markup=nb_main_menu(),
    )


# ── TEXT INPUT HANDLER ───────────────────────────────

async def handle_notebook_text(update: Update, context, state: dict):
    """Handle text input during notebook conversation flows."""
    chat_id = str(update.effective_chat.id)
    text = update.message.text.strip()
    action = state.get("action")
    db = SessionLocal()

    try:
        if action == "add_step":
            note = notebook_service.add_step(db, state["user_id"], text)
            clear_session(db, chat_id)
            if note:
                await update.message.reply_text("Pasul a fost adaugat")
                await _show_steps(update, db, state["user_id"])
            else:
                await update.message.reply_text("Textul nu poate fi gol")

        elif action == "add_task":
            note = notebook_service.add_task_note(db, state["user_id"], text)
            clear_session(db, chat_id)
            if note:
                await update.message.reply_text("Task adaugat")
                await _show_tasks(update, db, state["user_id"])
            else:
                await update.message.reply_text("Textul nu poate fi gol")

        elif action == "add_topic":
            # Parse emoji if first char is emoji
            emoji = None
            name = text
            if text and not text[0].isalnum():
                parts = text.split(None, 1)
                if len(parts) == 2:
                    emoji = parts[0]
                    name = parts[1]
                elif len(parts) == 1:
                    name = parts[0]

            topic = notebook_service.create_topic(db, state["user_id"], name, emoji)
            clear_session(db, chat_id)
            if topic:
                label = f"{topic.emoji} {topic.name}" if topic.emoji else topic.name
                await update.message.reply_text(f"Topic creat: {label}")
                await _show_topics(update, db, state["user_id"])
            else:
                await update.message.reply_text("Acest topic exista deja")

        elif action == "add_idea":
            topic_id = state.get("topic_id")
            note = notebook_service.add_idea(db, state["user_id"], topic_id, text)
            clear_session(db, chat_id)
            if note:
                await update.message.reply_text("Idee salvata")
                await _show_topic_ideas(update, db, state["user_id"], topic_id)
            else:
                await update.message.reply_text("Eroare la salvare")

        elif action == "edit_note":
            note_id = state.get("note_id")
            note = notebook_service.edit_note(db, state["user_id"], note_id, text)
            clear_session(db, chat_id)
            if note:
                await update.message.reply_text("Actualizat cu succes")
                # Return to appropriate view
                if note.note_type == "step":
                    await _show_steps(update, db, state["user_id"])
                elif note.note_type == "task":
                    await _show_tasks(update, db, state["user_id"])
                elif note.note_type == "idea" and note.topic_id:
                    await _show_topic_ideas(update, db, state["user_id"], note.topic_id)
            else:
                await update.message.reply_text("Nota nu a fost gasita")

        elif action == "edit_topic":
            topic_id = state.get("topic_id")
            # Parse emoji + name
            emoji = None
            name = text
            if text and not text[0].isalnum():
                parts = text.split(None, 1)
                if len(parts) == 2:
                    emoji = parts[0]
                    name = parts[1]
            topic = notebook_service.update_topic(db, state["user_id"], topic_id, name=name, emoji=emoji)
            clear_session(db, chat_id)
            if topic:
                await update.message.reply_text("Topic actualizat")
                await _show_topics(update, db, state["user_id"])
            else:
                await update.message.reply_text("Eroare la actualizare")

        else:
            clear_session(db, chat_id)

    finally:
        db.close()


# ── CALLBACK HANDLER ─────────────────────────────────

async def handle_notebook_callback(update: Update, context):
    """Handle all nb_ prefixed callbacks."""
    query = update.callback_query
    data = query.data
    await query.answer()

    chat_id = str(query.message.chat_id)
    db = SessionLocal()
    # Use chat_id as user_id
    user_id = chat_id

    try:
        # ── MAIN MENU ──
        if data == "nb_main":
            await query.edit_message_text("Carnetul meu", reply_markup=nb_main_menu())

        # ── TIME MANAGEMENT ──
        elif data == "nb_tm":
            await query.edit_message_text("Time Management", reply_markup=nb_tm_menu())

        elif data == "nb_tm_steps":
            await _show_steps_edit(query, db, user_id)

        elif data == "nb_tm_tasks":
            await _show_tasks_edit(query, db, user_id)

        elif data == "nb_add_step":
            set_session(db, chat_id, {"flow": "notebook", "action": "add_step", "user_id": user_id})
            await query.edit_message_text("Scrie pasul tau:")

        elif data == "nb_add_task":
            set_session(db, chat_id, {"flow": "notebook", "action": "add_task", "user_id": user_id})
            await query.edit_message_text("Scrie taskul tau:")

        # ── TASK STATUS ──
        elif data.startswith("nb_status_"):
            parts = data[len("nb_status_"):].rsplit("_", 1)
            if len(parts) == 2:
                note_id, status = parts
                notebook_service.update_task_status(db, user_id, note_id, status)
                await _show_tasks_edit(query, db, user_id)

        # ── IDEAS ──
        elif data == "nb_ideas":
            notebook_service.ensure_predefined_topics(db, user_id)
            await _show_topics_edit(query, db, user_id)

        elif data.startswith("nb_topic_"):
            topic_id = data[len("nb_topic_"):]
            await _show_topic_ideas_edit(query, db, user_id, topic_id)

        elif data == "nb_add_topic":
            set_session(db, chat_id, {"flow": "notebook", "action": "add_topic", "user_id": user_id})
            await query.edit_message_text("Scrie numele topicului (emoji optional, ex: Marketing):")

        elif data.startswith("nb_add_idea_"):
            topic_id = data[len("nb_add_idea_"):]
            set_session(db, chat_id, {"flow": "notebook", "action": "add_idea", "user_id": user_id, "topic_id": topic_id})
            await query.edit_message_text("Scrie ideea ta:")

        elif data.startswith("nb_edit_topic_"):
            topic_id = data[len("nb_edit_topic_"):]
            set_session(db, chat_id, {"flow": "notebook", "action": "edit_topic", "user_id": user_id, "topic_id": topic_id})
            await query.edit_message_text("Scrie noul nume (emoji optional):")

        elif data.startswith("nb_del_topic_"):
            topic_id = data[len("nb_del_topic_"):]
            await query.edit_message_text(
                "Esti sigur ca vrei sa stergi topicul?",
                reply_markup=InlineKeyboardMarkup([
                    [
                        InlineKeyboardButton("Da, sterge", callback_data=f"nb_confirm_del_topic_{topic_id}"),
                        InlineKeyboardButton("Nu", callback_data="nb_ideas"),
                    ]
                ])
            )

        elif data.startswith("nb_confirm_del_topic_"):
            topic_id = data[len("nb_confirm_del_topic_"):]
            notebook_service.delete_topic(db, user_id, topic_id)
            await query.edit_message_text("Topic sters")
            topics = notebook_service.get_topics(db, user_id)
            await query.message.reply_text("Idei", reply_markup=nb_ideas_menu(topics))

        # ── EDIT NOTE ──
        elif data.startswith("nb_edit_"):
            note_id = data[len("nb_edit_"):]
            note = notebook_service.get_note(db, user_id, note_id)
            if note:
                set_session(db, chat_id, {"flow": "notebook", "action": "edit_note", "user_id": user_id, "note_id": note_id})
                await query.edit_message_text(f"Text curent:\n{note.content}\n\nTrimite textul nou:")
            else:
                await query.edit_message_text("Nota nu a fost gasita")

        # ── DELETE NOTE ──
        elif data.startswith("nb_del_"):
            note_id = data[len("nb_del_"):]
            await query.edit_message_text(
                "Esti sigur ca vrei sa stergi?",
                reply_markup=InlineKeyboardMarkup([
                    [
                        InlineKeyboardButton("Da, sterge", callback_data=f"nb_confirm_del_{note_id}"),
                        InlineKeyboardButton("Nu", callback_data="nb_main"),
                    ]
                ])
            )

        elif data.startswith("nb_confirm_del_"):
            note_id = data[len("nb_confirm_del_"):]
            # Get note type before deleting for navigation
            note = notebook_service.get_note(db, user_id, note_id)
            note_type = note.note_type if note else None
            topic_id = note.topic_id if note else None
            notebook_service.delete_note(db, user_id, note_id)
            await query.edit_message_text("Sters")
            # Return to appropriate view
            if note_type == "step":
                steps = notebook_service.get_steps(db, user_id)
                await _send_steps_list(query.message, steps)
            elif note_type == "task":
                tasks = notebook_service.get_tasks(db, user_id)
                await _send_tasks_list(query.message, tasks)
            elif note_type == "idea" and topic_id:
                topic = notebook_service.get_topic(db, user_id, topic_id)
                ideas = notebook_service.get_ideas_by_topic(db, user_id, topic_id)
                await _send_ideas_list(query.message, topic, ideas, topic_id)

    finally:
        db.close()


# ── DISPLAY HELPERS ──────────────────────────────────

async def _show_steps(update, db, user_id):
    """Send steps list as a new message (after text input)."""
    steps = notebook_service.get_steps(db, user_id)
    await _send_steps_list(update.message, steps)


async def _show_steps_edit(query, db, user_id):
    """Edit existing message to show steps."""
    steps = notebook_service.get_steps(db, user_id)
    if not steps:
        await query.edit_message_text(
            "Nu ai niciun pas inca.",
            reply_markup=nb_steps_menu(),
        )
        return
    lines = ["Pasii tai:\n"]
    for i, s in enumerate(steps, 1):
        lines.append(f"{i}. {s.content}")

    buttons = []
    for s in steps:
        buttons.append([
            InlineKeyboardButton(f"Edit #{steps.index(s)+1}", callback_data=f"nb_edit_{s.id}"),
            InlineKeyboardButton(f"Sterge #{steps.index(s)+1}", callback_data=f"nb_del_{s.id}"),
        ])
    buttons.append([InlineKeyboardButton("+ Adauga pas", callback_data="nb_add_step")])
    buttons.append([InlineKeyboardButton("Inapoi", callback_data="nb_tm")])

    text = "\n".join(lines)
    if len(text) > 4000:
        text = text[:3997] + "..."
    await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(buttons))


async def _show_tasks(update, db, user_id):
    tasks = notebook_service.get_tasks(db, user_id)
    await _send_tasks_list(update.message, tasks)


async def _show_tasks_edit(query, db, user_id):
    tasks = notebook_service.get_tasks(db, user_id)
    if not tasks:
        await query.edit_message_text(
            "Nu ai niciun task inca.",
            reply_markup=nb_tasks_menu(),
        )
        return

    lines = ["Taskurile tale:\n"]
    for t in tasks:
        icon = TASK_ICONS.get(t.task_status, "[ ]")
        lines.append(f"{icon} {t.content}")

    buttons = []
    for t in tasks:
        buttons.extend(nb_task_status_buttons(t.id, t.task_status))
    buttons.append([InlineKeyboardButton("+ Adauga task", callback_data="nb_add_task")])
    buttons.append([InlineKeyboardButton("Inapoi", callback_data="nb_tm")])

    text = "\n".join(lines)
    if len(text) > 4000:
        text = text[:3997] + "..."
    await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(buttons))


async def _show_topics(update, db, user_id):
    topics = notebook_service.get_topics(db, user_id)
    await update.message.reply_text("Idei", reply_markup=nb_ideas_menu(topics))


async def _show_topics_edit(query, db, user_id):
    topics = notebook_service.get_topics(db, user_id)
    await query.edit_message_text("Idei", reply_markup=nb_ideas_menu(topics))


async def _show_topic_ideas(update, db, user_id, topic_id):
    topic = notebook_service.get_topic(db, user_id, topic_id)
    ideas = notebook_service.get_ideas_by_topic(db, user_id, topic_id)
    await _send_ideas_list(update.message, topic, ideas, topic_id)


async def _show_topic_ideas_edit(query, db, user_id, topic_id):
    topic = notebook_service.get_topic(db, user_id, topic_id)
    ideas = notebook_service.get_ideas_by_topic(db, user_id, topic_id)
    if not topic:
        await query.edit_message_text("Topic negasit", reply_markup=nb_main_menu())
        return

    label = f"{topic.emoji} {topic.name}" if topic.emoji else topic.name
    if not ideas:
        await query.edit_message_text(
            f"{label}\n\nNu sunt idei in acest topic inca.",
            reply_markup=nb_topic_menu(topic_id),
        )
        return

    lines = [f"{label}\n"]
    if topic.description:
        lines.append(f"{topic.description}\n")
    for i, idea in enumerate(ideas, 1):
        lines.append(f"{i}. {idea.content}")

    buttons = []
    for idea in ideas:
        buttons.append([
            InlineKeyboardButton(f"Edit #{ideas.index(idea)+1}", callback_data=f"nb_edit_{idea.id}"),
            InlineKeyboardButton(f"Sterge #{ideas.index(idea)+1}", callback_data=f"nb_del_{idea.id}"),
        ])
    buttons.append([InlineKeyboardButton("+ Idee noua", callback_data=f"nb_add_idea_{topic_id}")])
    buttons.append([
        InlineKeyboardButton("Edit topic", callback_data=f"nb_edit_topic_{topic_id}"),
        InlineKeyboardButton("Sterge topic", callback_data=f"nb_del_topic_{topic_id}"),
    ])
    buttons.append([InlineKeyboardButton("Inapoi", callback_data="nb_ideas")])

    text = "\n".join(lines)
    if len(text) > 4000:
        text = text[:3997] + "..."
    await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(buttons))


async def _send_steps_list(message, steps):
    if not steps:
        await message.reply_text("Nu ai niciun pas inca.", reply_markup=nb_steps_menu())
        return
    lines = ["Pasii tai:\n"]
    for i, s in enumerate(steps, 1):
        lines.append(f"{i}. {s.content}")
    buttons = []
    for s in steps:
        buttons.append([
            InlineKeyboardButton(f"Edit #{steps.index(s)+1}", callback_data=f"nb_edit_{s.id}"),
            InlineKeyboardButton(f"Sterge #{steps.index(s)+1}", callback_data=f"nb_del_{s.id}"),
        ])
    buttons.append([InlineKeyboardButton("+ Adauga pas", callback_data="nb_add_step")])
    buttons.append([InlineKeyboardButton("Inapoi", callback_data="nb_tm")])
    text = "\n".join(lines)
    if len(text) > 4000:
        text = text[:3997] + "..."
    await message.reply_text(text, reply_markup=InlineKeyboardMarkup(buttons))


async def _send_tasks_list(message, tasks):
    if not tasks:
        await message.reply_text("Nu ai niciun task inca.", reply_markup=nb_tasks_menu())
        return
    lines = ["Taskurile tale:\n"]
    for t in tasks:
        icon = TASK_ICONS.get(t.task_status, "[ ]")
        lines.append(f"{icon} {t.content}")
    buttons = []
    for t in tasks:
        buttons.extend(nb_task_status_buttons(t.id, t.task_status))
    buttons.append([InlineKeyboardButton("+ Adauga task", callback_data="nb_add_task")])
    buttons.append([InlineKeyboardButton("Inapoi", callback_data="nb_tm")])
    text = "\n".join(lines)
    if len(text) > 4000:
        text = text[:3997] + "..."
    await message.reply_text(text, reply_markup=InlineKeyboardMarkup(buttons))


async def _send_ideas_list(message, topic, ideas, topic_id):
    if not topic:
        await message.reply_text("Topic negasit", reply_markup=nb_main_menu())
        return
    label = f"{topic.emoji} {topic.name}" if topic.emoji else topic.name
    if not ideas:
        await message.reply_text(
            f"{label}\n\nNu sunt idei in acest topic inca.",
            reply_markup=nb_topic_menu(topic_id),
        )
        return
    lines = [f"{label}\n"]
    if topic.description:
        lines.append(f"{topic.description}\n")
    for i, idea in enumerate(ideas, 1):
        lines.append(f"{i}. {idea.content}")
    buttons = []
    for idea in ideas:
        buttons.append([
            InlineKeyboardButton(f"Edit #{ideas.index(idea)+1}", callback_data=f"nb_edit_{idea.id}"),
            InlineKeyboardButton(f"Sterge #{ideas.index(idea)+1}", callback_data=f"nb_del_{idea.id}"),
        ])
    buttons.append([InlineKeyboardButton("+ Idee noua", callback_data=f"nb_add_idea_{topic_id}")])
    buttons.append([InlineKeyboardButton("Inapoi", callback_data="nb_ideas")])
    text = "\n".join(lines)
    if len(text) > 4000:
        text = text[:3997] + "..."
    await message.reply_text(text, reply_markup=InlineKeyboardMarkup(buttons))
