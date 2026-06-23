# 08 — Botul Telegram

Botul Telegram este una dintre cele trei suprafețe ale aplicației. Rulează prin **polling**, în **același proces** cu API-ul FastAPI (pornit din `lifespan`), și lovește aceeași bază de date Postgres — un task adăugat din chat apare instant în Web App. Toate mesajele sunt în **română**, cu suport **RU** (limba e per-user).

Acest document descrie cele două bot-uri, cum pornesc, cum sunt rutate mesajele și ce comenzi există. Pentru flow-urile de logare prin Telegram (`/link`, cod 2FA, QR, Mini App) vezi [Autentificare](07-auth.md). Pentru remindere vezi [Remindere](09-reminders.md). Pentru tabele vezi [Baza de date](06-database.md).

Codul relevant: `backend/app/telegram/` (`bot.py`, `commands.py`, `free_text.py`, `conversations.py`, `notebook_handler.py`, `keyboards.py`, `i18n.py`) și `backend/app/main.py` (`lifespan`).

---

## Două bot-uri (main + admin)

| Bot | Token | Obligatoriu? | Rol |
|---|---|---|---|
| Main | `TELEGRAM_BOT_TOKEN` | **Da** | Bot-ul pentru toți userii. |
| Admin | `ADMIN_TELEGRAM_BOT_TOKEN` | Nu | Bot separat doar pentru admini. |

Ambele bot-uri au **exact aceleași handler-e** (`_wire_handlers` le sârmuie pe amândouă). Diferența e doar la **trimitere**: `_bot_for_role(role)` alege bot-ul admin pentru userii `ADMIN` dacă e configurat, altfel cade pe bot-ul main. Dacă `ADMIN_TELEGRAM_BOT_TOKEN` lipsește (sau e placeholder-ul `your_bot_token_here`), `create_admin_bot()` întoarce `None` și **adminii folosesc bot-ul main** — fallback transparent.

## Pornire din lifespan

În `main.py`, `lifespan` pornește scheduler-ul de remindere, apoi bot-urile:

```python
if settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_BOT_TOKEN != "your_bot_token_here":
    main_bot = await _start_bot(create_bot(), "main")
# admin opțional, pe același tipar
```

`_start_bot` face `initialize()` → `start()` → `updater.start_polling(drop_pending_updates=True)`. Dacă există cel puțin un bot, `setup_bot_commands()` înregistrează meniul de comenzi în Telegram și butonul de meniu (Mini App pe HTTPS, fallback la meniul de comenzi pe HTTP/dev). La shutdown, `_stop_bot` oprește polling-ul curat.

> Pornirea bot-ului eșuat e **non-fatală**: dacă tokenul e invalid, API-ul pornește oricum și logează eroarea.

---

## Conversații cu stare

Mulți pași (adăugare task ghidată, înregistrare cont, motiv „nefăcut", carnet) sunt **multi-mesaj**. Starea conversației e **persistată** în tabelul `telegram_sessions` (cheie = `chat_id`), nu ținută în memorie — deci supraviețuiește restart-ului procesului. Când vine un mesaj, handler-ul citește starea curentă (`get_session`) și știe la ce pas e userul.

Sesiunile vechi (> 10 min) sunt curățate la fiecare minut de job-ul `cleanup_sessions` din scheduler.

---

## Routing-ul mesajelor

Două routere principale, în `bot.py`:

### Mesaje text — `_handle_message`

Ordinea de verificare (primul care prinde câștigă):

1. **Buton de meniu** (tastatura de jos) — text-ul lowercase e căutat în `MENU_BUTTON_MAP` (`taskuri azi`, `saptamana`, `adauga task`, `statistici`, `marcheaza facut`, `ajutor`, `carnet`) → apelează comanda corespunzătoare.
2. **Conversație carnet** — dacă sesiunea curentă are `flow == "notebook"` → `handle_notebook_text`.
3. **Conversație activă** — `handle_conversation` (add/skip/notdone/register/tglogin).
4. **Text liber** — `handle_free_text`: dacă mesajul începe cu `task <titlu>`, pornește adăugarea rapidă (cere categoria); altfel afișează ajutorul.

### Callback-uri inline — `_handle_callback`

1. **Callback de conversație** — `handle_callback_conversation`.
2. **Prefix `nb_`** = notebook → `handle_notebook_callback`.
3. Callback-uri speciale: `start_register`, `lang_*` (selector limbă), `accreq_*` (admin aprobă/respinge cereri de logare).
4. Acțiuni pe task: `action_done_`, `action_skip_`, `action_notdone_`, `action_delete_`, `confirm_delete_`, `taskdetail_`, `weekday_`.

**Verificare de proprietate**: înainte de orice mutare a unui task, `_owner_check` confirmă că task-ul aparține userului legat la acel chat — niciun user nu poate vedea sau modifica taskurile altuia prin bot.

```text
mesaj/callback
  ├─ buton meniu? ──────────────▶ comandă
  ├─ conversație activă? ───────▶ pas conversație
  ├─ callback nb_*? ────────────▶ notebook
  └─ text "task ..."? ──────────▶ adăugare rapidă
                 └─ altfel ─────▶ ajutor
```

---

## Comenzi principale

Înregistrate în meniul Telegram prin `_setup_commands` (`bot.py`) și implementate în `commands.py`:

| Comandă | Descriere |
|---|---|
| `/start` | Pornire. Chat nelegat → ghid de înregistrare + selector limbă; chat legat → salut + buton „Deschide aplicația". Suportă deep-links: `register`, `qr_<id>`, `tglogin_<id>`. |
| `/help` | Ajutor (alias pentru `/start`). |
| `/today` | Taskurile de azi + butoane de acțiune pentru cele PENDING. |
| `/week` | Taskurile săptămânii, grupate pe zile, cu timp estimat. |
| `/tasks` | Alege ziua (`/tasks luni`, `/tasks azi`, ...) sau tastatura de zile. |
| `/add` | Adăugare task ghidată (conversație cu stare). |
| `/done` | Marchează un task ca făcut (cu argument `<task_id>` sau alegere din listă). |
| `/skip` | Mută un task pe altă zi. |
| `/notdone` | Marchează ca nefăcut — cere **motiv obligatoriu**. |
| `/delete` | Șterge un task (cu confirmare). |
| `/stats` | Statistici săptămâna curentă + top streak-uri. |
| `/notes` | Carnetul personal (notebook, callback-uri `nb_`). |
| `/link <cod>` | Leagă acest chat de un cont (cod de unică folosință). Vezi [Auth](07-auth.md). |
| `/register` | Creează un cont nou (nume → username → PIN), cu aprobare admin. |
| `/language` | Schimbă limba RO/RU (`/language`, apoi butoanele). |
| `/attended <event_id> [notă]` | Confirmă prezența la un eveniment (post-meeting). |
| `/missed <event_id> [motiv]` | Marchează că nu ai fost la un eveniment. |

> `/attended` și `/missed` nu apar în meniul afișat de Telegram, dar sunt sârmuite ca handler-e și folosite de prompt-urile post-întâlnire (vezi [Remindere](09-reminders.md)).

Comenzile (în afară de `/start`, `/help`, `/link`) trec prin `_require_user`, care răspunde cu un mesaj prietenos „chat nelegat" dacă nu există cont legat.

---

## i18n (RO / RU)

Stringurile bot-ului sunt în `telegram/i18n.py`, cu RO (default) și RU. Limba e **per-user** (`users.language`); funcția `get_lang(user)` o citește, iar `t(key, lang, **kwargs)` traduce (fallback: RO → cheia însăși).

```python
from app.telegram.i18n import t, get_lang
lang = get_lang(user)
await update.message.reply_text(t("welcome_back", lang, name=user.full_name))
```

Userii noi (fără cont) primesc default RO și un selector inline RO/RU. La schimbarea limbii (callback `lang_ro` / `lang_ru`), `handle_lang_callback` actualizează `users.language`.

> Convenție: adaugă orice text nou în `_BOT_STRINGS`, nu hardcodat. Codurile de login trimise pe bot (`auth_service._deliver_code`) sunt și ele localizate.
