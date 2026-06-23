# 01 — Conceptul aplicației

**Weekly Task Manager** este un manager de taskuri & calendar multi-user. Aceeași bază de date Postgres este atinsă de **trei suprafețe** diferite (Web, API, Bot), astfel încât o modificare făcută într-un loc apare instant în celelalte: adaugi un task din Telegram → îl vezi imediat în Web App.

Acest document explică *ce* este aplicația și *de ce* există. Pentru detalii tehnice vezi [Arhitectura](03-architecture.md), [Baza de date](06-database.md) și plimbarea prin [Funcționalități](10-features.md).

---

## Ce este

O aplicație full-stack pentru organizarea muncii de echipă și personale, cu accent pe rutina **săptămânală** și pe un calendar de tip Outlook. Este multi-user, cu admini separați, autentificare 2FA prin Telegram și temă light/dark. Interfața, mesajele botului și textele user-facing sunt în **română**, cu suport **i18n RO/RU** (limba e per-user).

## Pentru cine e

- **Utilizatori normali** — își gestionează taskurile săptămânale, calendarul, proiectele și carnetul de notițe. Intră pe `/`.
- **Admini** — gestionează userii (creare, roluri, dezactivare, generare cod `/link` pentru Telegram) și văd un dashboard de sumar. Intră pe `/admin_task_manager` (login separat, doar rol `ADMIN`).

## Ce probleme rezolvă

- **Rutina săptămânală scapă de sub control** → grilă de taskuri pe zile, cu status per săptămână și remindere automate.
- **Întâlnirile și termenele se pierd** → calendar Outlook-like cu recurență și notificări multi-reminder pe Telegram.
- **Munca în echipă e împrăștiată** → board tip Jira per proiect, plus board «Repartizate» și un sistem «Birou» pentru taskuri rapide din birou.
- **Accesul rapid de pe telefon** → bot Telegram pentru adăugare/marcat taskuri din chat + PWA instalabilă.

---

## Cele trei suprafețe

Toate trei lovesc **același Postgres** — nu există stare duplicată între ele.

```
        ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
        │    Web App       │   │    REST API      │   │  Telegram Bot    │
        │  React + Vite    │   │   FastAPI        │   │  (polling)       │
        │  PWA             │   │                  │   │  pornit din      │
        │                  │   │                  │   │  lifespan-ul     │
        │  useri  →  /     │   │  /api/...        │   │  FastAPI         │
        │  admini →        │   │  Swagger:        │   │                  │
        │  /admin_task_... │   │  /api/docs       │   │                  │
        └────────┬─────────┘   └────────┬─────────┘   └────────┬─────────┘
                 │                      │                      │
                 │  HTTP /api           │  SQLAlchemy          │ SQLAlchemy
                 └──────────────────────┼──────────────────────┘
                                        ▼
                              ┌────────────────────┐
                              │   PostgreSQL 15    │
                              │    taskmanager     │
                              └────────────────────┘
```

| Suprafață | Tehnologie | Rol |
|-----------|------------|-----|
| **Web App** | React + TypeScript + Vite (PWA) | Interfața vizuală. Useri normali la `/`, admini la `/admin_task_manager`. |
| **REST API** | FastAPI + SQLAlchemy + Alembic | Toată logica de business; endpoint-uri sub `/api/...`. Swagger la `/api/docs`. |
| **Telegram Bot** | python-telegram-bot (polling) | Acces rapid din chat. **Rulează în același proces cu API-ul**, pornit din lifespan-ul FastAPI. |

> Nota: există un al doilea bot **opțional** pentru admini (`ADMIN_TELEGRAM_BOT_TOKEN`). Dacă nu e setat, adminii folosesc botul principal.

---

## Funcționalitățile mari

- **Taskuri săptămânale** — grilă pe zile, status per task per săptămână (`PENDING / DONE / SKIPPED / NOT_DONE`, ultimul cere motiv), categorii cu culoare/icon, remindere la oră fixă pe Telegram. Un task poate avea **responsabili multipli**.
- **Calendar Outlook-like** — view Zi / Săptămână / Lună, tipuri de evenimente (ședință online/în persoană, programare, reminder, personal, task), recurență zilnic/săptămânal/lunar/anual, multi-reminder (0/5/10/15/30/60/120/1440 min înainte), participanți, categorii cu auto-color.
- **Proiecte / board tip Jira** — echipă per proiect cu roluri (OWNER/ADMIN/MEMBER/VIEWER), board Kanban, backlog + sprinturi, story points cu estimare AI (cu fallback pe euristici), comentarii, @mention pe Telegram, watchers, activity log. Vezi [docs/JIRA_MODULE.md](JIRA_MODULE.md).
- **«Birou» — quick tasks din birou** — proiect-sistem special pentru taskuri rapide din birou. Fiecare user are board-ul lui în secțiunea «Azi». Există un formular public simplificat de quick task (cu captură de ecran/upload/paste și mesaj vocal).
- **Board «Repartizate» în Weekly** — taskurile repartizate apar într-un board dedicat, cu arhivă și finalizare de proiect.
- **Notebook (carnet)** — topicuri și notițe personale, accesibile și din bot (`/notes`).
- **Statistici** — progresul săptămânii curente (și `/stats` pe Telegram).

---

## Limba (RO/RU)

Tot textul user-facing implicit este în **română**. Aplicația are i18n cu suport **RU**, iar limba este setată per user (`users.language`). Stringurile botului trăiesc în `backend/app/telegram/i18n.py`. Când adaugi text nou, pune-l în i18n — nu hardcoda.

---

Următorul pas pentru a porni proiectul local: [02 — Getting Started](02-getting-started.md).
