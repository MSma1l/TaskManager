# 09 — Remindere

Reminderele sunt trimise de un **APScheduler** pornit la `lifespan`-ul FastAPI (în același proces cu API-ul și bot-ul). Job-urile de remindere rulează **la fiecare minut** și trimit notificări pe **Telegram** (prin bot-ul potrivit rolului) și, best-effort, **Web Push**. Fiecare reminder ajunge **doar la owner-ul** task-ului/evenimentului — fără scurgeri între useri.

Cod relevant: `backend/app/services/reminder_service.py`. Pentru bot vezi [Botul Telegram](08-telegram-bot.md); pentru tabele vezi [Baza de date](06-database.md).

---

## Cum pornește

`start_scheduler()` (apelat din `main.py:lifespan`) înregistrează job-urile pe un `AsyncIOScheduler` cu trigger `cron`:

| Job | Frecvență | Ce face |
|---|---|---|
| `check_reminders` | **la fiecare minut** | Remindere pentru taskuri săptămânale. |
| `check_calendar_reminders` | **la fiecare minut** | Remindere pentru evenimente calendar. |
| `post_meeting_prompts` | la fiecare minut | După fiecare ședință, cere confirmarea prezenței. |
| `notify_quick_tasks` | la fiecare minut | Notifică adminii despre quick task-uri noi. |
| `cleanup_sessions` | la fiecare minut | Expiră sesiunile Telegram > 10 min. |
| `auto_move_overdue_tasks` | zilnic 23:55 | Mută taskurile PENDING pe a doua zi + notifică. |
| `weekly_summary` | Luni 09:00 | Lista taskurilor săptămânii, per user. |
| `weekly_report` | Duminică 20:00 | Raport săptămânal (progres, streak-uri, ratate). |
| `send_daily_digest` | zilnic `DAILY_DIGEST_HOUR`:00 (UTC) | „Agenda ta de azi" (taskuri + board + calendar). |

> Toate orele sunt **UTC**. Ține cont la testare și la fereastra „Nu deranja".

---

## Remindere pentru taskuri săptămânale

`check_reminders` rulează la fiecare minut și caută taskuri active al căror `reminder_time` este **fix ora curentă** (`HH:MM`) **pe ziua curentă** (`day_of_week == isoweekday()`):

```python
tasks = (db.query(Task)
    .filter(Task.is_active == True,
            Task.reminder_time == current_time,   # "HH:MM"
            Task.day_of_week == day_of_week)
    .all())
```

Pentru fiecare task, mesajul include titlu, descriere, categorie (icon + nume), prioritate (dacă nu e MEDIUM), durată estimată și ora. Reminder-ul se trimite **doar pe chat-ul owner-ului**, cu rolul lui (deci pe bot-ul corect).

---

## Remindere pentru evenimente calendar

`check_calendar_reminders` rulează la fiecare minut. Pentru că evenimentele pot fi **recurente**, recurența e **expandată la query** (`calendar_service._occurrences_in_range`) pe un orizont de 7 zile, nu stocată ca rânduri separate.

Pentru fiecare eveniment cu remindere setate (`reminder_minutes`), pentru fiecare ocurență și fiecare offset, se calculează momentul de declanșare `fire_at = start - offset` și se trimite dacă diferă de „acum" cu **±30 secunde**. Offset-urile uzuale (în minute înainte):

```
0  ·  5  ·  10  ·  15  ·  30  ·  60  ·  120  ·  1440
(la moment) ............................ (1 oră) ... (1 zi)
```

Mesajul e formatat după tipul evenimentului (ședință online/fizică, programare, reminder, eveniment) și conține data, intervalul orar, locația și link-ul de ședință dacă există.

---

## Anti-duplicare

Ca un reminder să nu fie trimis de mai multe ori (loop-ul rulează la fiecare minut), se folosesc tabele de log:

- **`reminder_logs`** — pentru taskuri. Înainte de trimitere se verifică dacă există deja un log pe `task_id` din ziua curentă pe canalul respectiv; dacă da, se sare.
- **`calendar_reminder_logs`** — pentru evenimente. Cheia logică e `(event_id, occurrence_date, minutes_before, channel)`.

Canalele folosite: `telegram` (trimis), `telegram_skipped` (sărit din cauza setărilor userului, dar logat ca să nu reîncerce în minutul următor), `push` (Web Push), `post_meeting` / `post_meeting_skipped`.

Digest-ul zilnic folosește în plus o **gardă in-memory** (`_digest_sent` cu `(user_id, data)`), care se resetează la restart.

---

## Setările userului (toggle Telegram + „Nu deranja")

Înainte de trimitere, fiecare reminder respectă `user.notification_settings`:

- `_telegram_allowed(user, now)` — întoarce `False` dacă `telegram` e dezactivat **sau** dacă `now` cade în fereastra „Nu deranja" (`doNotDisturbStart`–`doNotDisturbEnd`, format `HH:MM`, poate trece peste miezul nopții).
- `_web_allowed(user, now)` — la fel, pentru canalul Web Push (toggle `web`).

Când un reminder e suprimat de aceste setări, se loghează totuși ca `*_skipped` ca să nu se reîncerce în fiecare minut.

> **Excepție**: digest-ul zilnic (`send_daily_digest`) **ignoră intenționat** fereastra „Nu deranja" — e la o oră fixă aleasă de admin, altfel un user cu DND la ora respectivă nu l-ar primi niciodată. Respectă totuși toggle-ul `telegram` și `dailyDigest`.

---

## Cum testezi

1. Creează un task (sau eveniment) cu `reminder_time` la **+1–2 minute** în viitor, pe **ziua curentă**. Atenție: ora e **UTC**.
2. Asigură-te că ai chat-ul Telegram legat (vezi [Auth](07-auth.md) → `/link`) și că `telegram` nu e dezactivat / nu ești în fereastra „Nu deranja".
3. Urmărește log-urile backend-ului:

```bash
docker compose logs -f backend
```

La fiecare minut vei vedea rularea job-urilor; când ora coincide, reminder-ul ajunge pe Telegram. Dacă nu primești nimic, verifică în ordine: ora UTC vs locală, `is_active`/`day_of_week` corecte, chat legat, setările de notificare și existența unui rând în `reminder_logs` / `calendar_reminder_logs` (un log existent înseamnă că a fost deja trimis în acel interval).
