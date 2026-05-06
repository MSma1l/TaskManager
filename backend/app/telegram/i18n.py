"""Bot translations — Romanian (default) + Russian.

Each user has a `language` column on users table. Bot replies use that
value. A new chat (no User row yet) defaults to RO; the language picker
inline keyboard offers to switch.
"""
from __future__ import annotations
from app.models.user import User

DEFAULT_LANG = "ro"
SUPPORTED = ("ro", "ru")


_BOT_STRINGS = {
    "ro": {
        "lang_picker_title": "Alege limba / Choose a language:",
        "lang_set": "Limba setata: Romana ✓",
        "lang_set_other": "Язык установлен: Русский ✓",

        "welcome_unbound_greeting": "Bun venit, {name}!",
        "welcome_unbound_body": (
            "Recomandam sa folosesti aplicatia direct in Telegram — apesi butonul "
            "\"Deschide aplicatia\" si gata.\n\n"
            "Ai cont nou? Apasa /register sau butonul de mai jos si te ghidez prin "
            "crearea contului (numele tau + un username)."
        ),
        "welcome_back": (
            "Bun venit inapoi, {name}!\n\n"
            "Apasa \"Deschide aplicatia\" ca sa vezi taskurile de azi si calendarul "
            "direct in Telegram.\n\n"
            "Comenzi rapide: /today /week /add /done /stats /notes /help"
        ),
        "btn_open_app": "Deschide aplicatia",
        "btn_register": "Cont nou (/register)",

        "register_step1": "Hai sa-ti facem cont!\n\nPasul 1/2: Cum te numesti? (numele complet, ex: Ion Popescu)",
        "register_existing": "Acest chat este deja legat la contul @{username}.\nDaca vrei sa schimbi PIN-ul sau parola, mergi pe site la sectiunea Profil.",
        "register_name_invalid": "Numele trebuie sa aiba 2-100 caractere. Incearca din nou:",
        "register_step2": "Salut {name}! Acum alege un username pentru cont.\n\nReguli: 3-30 caractere, doar a-z, 0-9, _ sau .\nSugerat: {suggested}\n\nTrimite username-ul dorit:",
        "register_username_invalid": "Username invalid. 3-30 caractere, doar a-z, 0-9, _, . Trimite altul:",
        "register_username_taken": "Username-ul \"{candidate}\" e deja folosit. Trimite altul:",
        "register_done": (
            "Cont creat cu succes!\n\n"
            "  Username: {username}\n  PIN: {pin}\n\n"
            "Cu aceste date intri pe site:\n  {url}\n\n"
            "Foloseste \"Am deja PIN — re-logare rapida\".\n\n"
            "PASTREAZA PIN-UL — il poti schimba mai tarziu din Profil.\n\n"
            "Acum esti logat aici si poti folosi botul: /help"
        ),

        "not_linked": (
            "Acest chat nu este legat la niciun cont.\n\n"
            "Ca sa folosesti botul, leaga-l la cont:\n"
            "  • genereaza un cod /link din profilul tau pe site, apoi\n"
            "  • trimite aici: /link <cod>\n\n"
            "Fara cont nu pot sa-ti arat taskurile altor utilizatori.\n"
            "Cont nou? {url}/request-access?tg={chat_id}"
        ),

        "task_not_found": "Task negasit sau nu este al tau.",
        "no_pending_today": "Nu ai taskuri PENDING de azi.",
    },

    "ru": {
        "lang_picker_title": "Выберите язык / Alege limba:",
        "lang_set": "Язык установлен: Русский ✓",
        "lang_set_other": "Limba setata: Romana ✓",

        "welcome_unbound_greeting": "Добро пожаловать, {name}!",
        "welcome_unbound_body": (
            "Рекомендуем пользоваться приложением прямо в Telegram — нажмите кнопку "
            "«Открыть приложение» и всё.\n\n"
            "Новый аккаунт? Нажмите /register или кнопку ниже — я проведу вас "
            "через создание аккаунта (ФИО + имя пользователя)."
        ),
        "welcome_back": (
            "С возвращением, {name}!\n\n"
            "Нажмите «Открыть приложение», чтобы увидеть задачи и календарь "
            "прямо в Telegram.\n\n"
            "Команды: /today /week /add /done /stats /notes /help"
        ),
        "btn_open_app": "Открыть приложение",
        "btn_register": "Новый аккаунт (/register)",

        "register_step1": "Давайте создадим аккаунт!\n\nШаг 1/2: Как вас зовут? (полное имя, напр.: Иван Петров)",
        "register_existing": "Этот чат уже привязан к аккаунту @{username}.\nЕсли хотите сменить PIN или пароль, зайдите в раздел «Профиль» на сайте.",
        "register_name_invalid": "Имя должно содержать 2-100 символов. Попробуйте ещё раз:",
        "register_step2": "Здравствуйте, {name}! Теперь выберите имя пользователя для аккаунта.\n\nПравила: 3-30 символов, только a-z, 0-9, _ или .\nПредложение: {suggested}\n\nОтправьте желаемое имя пользователя:",
        "register_username_invalid": "Неверное имя пользователя. 3-30 символов, только a-z, 0-9, _, . Отправьте другое:",
        "register_username_taken": "Имя пользователя «{candidate}» уже занято. Отправьте другое:",
        "register_done": (
            "Аккаунт успешно создан!\n\n"
            "  Имя пользователя: {username}\n  PIN: {pin}\n\n"
            "С этими данными вы заходите на сайт:\n  {url}\n\n"
            "Используйте «Уже есть PIN — быстрый вход».\n\n"
            "СОХРАНИТЕ PIN — его можно изменить позже в Профиле.\n\n"
            "Сейчас вы вошли здесь и можете пользоваться ботом: /help"
        ),

        "not_linked": (
            "Этот чат не привязан ни к одному аккаунту.\n\n"
            "Чтобы пользоваться ботом, привяжите его:\n"
            "  • сгенерируйте код /link в Профиле на сайте, затем\n"
            "  • отправьте сюда: /link <код>\n\n"
            "Без аккаунта я не могу показывать задачи.\n"
            "Новый аккаунт? {url}/request-access?tg={chat_id}"
        ),

        "task_not_found": "Задача не найдена или не принадлежит вам.",
        "no_pending_today": "У вас нет задач PENDING на сегодня.",
    },
}


def get_lang(user: User | None) -> str:
    """Read the language from a User. Falls back to RO."""
    if not user:
        return DEFAULT_LANG
    lang = (getattr(user, "language", None) or DEFAULT_LANG).strip().lower()
    return lang if lang in SUPPORTED else DEFAULT_LANG


def t(key: str, lang: str | None = None, **kwargs) -> str:
    """Translate a key. Missing keys fall back to RO, then to the key itself."""
    lang = (lang or DEFAULT_LANG).strip().lower()
    if lang not in SUPPORTED:
        lang = DEFAULT_LANG
    s = _BOT_STRINGS.get(lang, {}).get(key)
    if s is None:
        s = _BOT_STRINGS[DEFAULT_LANG].get(key, key)
    if kwargs:
        try:
            return s.format(**kwargs)
        except (KeyError, IndexError):
            return s
    return s
