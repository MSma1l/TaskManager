# Documentație — Weekly Task Manager

Acest folder conține documentația tehnică a proiectului, împărțită pe teme. Fiecare fișier acoperă o parte importantă a aplicației și poate fi citit independent.

## Cuprins

| # | Document | Despre ce e |
|---|----------|-------------|
| 1 | [01-concept.md](01-concept.md) | Conceptul aplicației — ce face, pentru cine, cele trei suprafețe (Web, API, Bot) |
| 2 | [02-getting-started.md](02-getting-started.md) | Cum pornești totul local cu Docker Compose, URL-uri, variabile `.env` |
| 3 | [03-architecture.md](03-architecture.md) | Arhitectura de ansamblu — cum se leagă serviciile, fluxul unei cereri |
| 4 | [04-backend.md](04-backend.md) | Backend FastAPI: structura pe straturi (api / services / models / schemas) |
| 5 | [05-frontend.md](05-frontend.md) | Frontend React + TypeScript: structura feature-based, routing, client axios, temă |
| 6 | [06-database.md](06-database.md) | Baza de date Postgres: toate tabelele, coloanele, relațiile și convențiile |
| 7 | [07-auth.md](07-auth.md) | Autentificare: flow 2FA, PIN, admin, JWT, linking Telegram |
| 8 | [08-telegram-bot.md](08-telegram-bot.md) | Bot-ul de Telegram: comenzi, conversații cu stare, i18n |
| 9 | [09-reminders.md](09-reminders.md) | Sistemul de remindere (APScheduler) pentru taskuri și calendar |
| 10 | [10-features.md](10-features.md) | Plimbare prin funcționalități: taskuri, calendar, proiecte/board, notebook, quick tasks, statistici |
| 11 | [11-deployment.md](11-deployment.md) | Deployment pe server în spatele nginx-proxy + TLS |

## Alte documente

- [CICD.md](CICD.md) — pipeline CI/CD
- [JIRA_MODULE.md](JIRA_MODULE.md) — modulul de tip Jira (board / proiecte)

---

> Notă: textele user-facing din aplicație sunt în română (cu suport RO/RU). Documentația urmează același ton.
