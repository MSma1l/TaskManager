from telegram import InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, KeyboardButton


def main_menu_keyboard() -> ReplyKeyboardMarkup:
    """Persistent bottom menu with main actions."""
    return ReplyKeyboardMarkup(
        [
            [KeyboardButton("Taskuri azi"), KeyboardButton("Saptamana")],
            [KeyboardButton("Adauga task"), KeyboardButton("Statistici")],
            [KeyboardButton("Marcheaza facut"), KeyboardButton("Carnet")],
            [KeyboardButton("Ajutor")],
        ],
        resize_keyboard=True,
        is_persistent=True,
    )


def days_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("Azi", callback_data="day_today"),
            InlineKeyboardButton("Maine", callback_data="day_tomorrow"),
            InlineKeyboardButton("Poimaine", callback_data="day_after_tomorrow"),
        ],
        [InlineKeyboardButton("Alege data", callback_data="day_pick")],
    ])


def categories_keyboard(categories: list) -> InlineKeyboardMarkup:
    buttons = []
    row = []
    for cat in categories:
        row.append(InlineKeyboardButton(
            f"{cat.icon} {cat.name}",
            callback_data=f"cat_{cat.id}"
        ))
        if len(row) == 2:
            buttons.append(row)
            row = []
    if row:
        buttons.append(row)
    return InlineKeyboardMarkup(buttons)


def reminder_times_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("08:00", callback_data="rem_08:00"),
            InlineKeyboardButton("09:00", callback_data="rem_09:00"),
            InlineKeyboardButton("12:00", callback_data="rem_12:00"),
        ],
        [
            InlineKeyboardButton("14:00", callback_data="rem_14:00"),
            InlineKeyboardButton("18:00", callback_data="rem_18:00"),
            InlineKeyboardButton("20:00", callback_data="rem_20:00"),
        ],
        [InlineKeyboardButton("Fara reminder", callback_data="rem_none")],
    ])


def priority_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("Mica", callback_data="prio_LOW"),
            InlineKeyboardButton("Medie", callback_data="prio_MEDIUM"),
        ],
        [
            InlineKeyboardButton("Mare", callback_data="prio_HIGH"),
            InlineKeyboardButton("URGENT", callback_data="prio_URGENT"),
        ],
    ])


def task_actions_keyboard(task_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("Done", callback_data=f"action_done_{task_id}"),
            InlineKeyboardButton("Muta", callback_data=f"action_skip_{task_id}"),
            InlineKeyboardButton("Nu am facut", callback_data=f"action_notdone_{task_id}"),
        ],
        [
            InlineKeyboardButton("Sterge", callback_data=f"action_delete_{task_id}"),
        ],
    ])


def week_days_keyboard() -> InlineKeyboardMarkup:
    days = [
        ("Luni", 1), ("Marti", 2), ("Miercuri", 3),
        ("Joi", 4), ("Vineri", 5), ("Sambata", 6),
        ("Duminica", 7),
    ]
    buttons = []
    row = []
    for name, num in days:
        row.append(InlineKeyboardButton(name, callback_data=f"weekday_{num}"))
        if len(row) == 3:
            buttons.append(row)
            row = []
    if row:
        buttons.append(row)
    buttons.append([InlineKeyboardButton("Azi", callback_data="weekday_today")])
    return InlineKeyboardMarkup(buttons)


def recurring_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("Da, saptamanal", callback_data="recurring_yes"),
            InlineKeyboardButton("Nu, doar aceasta data", callback_data="recurring_no"),
        ],
    ])


def pending_tasks_keyboard(tasks_with_completions: list) -> InlineKeyboardMarkup:
    buttons = []
    for task, completion in tasks_with_completions:
        status = completion.status.value if completion else "PENDING"
        if status == "PENDING":
            buttons.append([InlineKeyboardButton(
                f"Done: {task.title}",
                callback_data=f"action_done_{task.id}"
            )])
    return InlineKeyboardMarkup(buttons) if buttons else InlineKeyboardMarkup([[
        InlineKeyboardButton("Nu exista taskuri PENDING", callback_data="noop")
    ]])


def confirm_delete_keyboard(task_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("Da, sterge", callback_data=f"confirm_delete_{task_id}"),
            InlineKeyboardButton("Anuleaza", callback_data="noop"),
        ],
    ])


def all_tasks_keyboard(tasks: list) -> InlineKeyboardMarkup:
    """Inline buttons for each pending task with all actions."""
    buttons = []
    for task in tasks:
        comp = task.completions[0] if task.completions else None
        status = comp.status.value if comp else "PENDING"
        if status == "PENDING":
            prio = ""
            if hasattr(task, 'priority') and task.priority:
                prio_icons = {"URGENT": "!", "HIGH": "!", "MEDIUM": "", "LOW": ""}
                prio = prio_icons.get(task.priority, "")
            buttons.append([InlineKeyboardButton(
                f"{prio}{task.title}",
                callback_data=f"taskdetail_{task.id}"
            )])
    if not buttons:
        buttons.append([InlineKeyboardButton("Toate taskurile sunt completate!", callback_data="noop")])
    return InlineKeyboardMarkup(buttons)
