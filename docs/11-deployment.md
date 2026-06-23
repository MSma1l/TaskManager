# 11 — Deployment pe server

Cum publici Weekly Task Manager pe un server, în spatele unui **nginx-proxy extern** (un container nginx separat care servește mai multe aplicații) cu **TLS Let's Encrypt**. Comunicarea proxy ↔ aplicație se face printr-o **rețea Docker partajată** numită `proxy`, ca proxy-ul să poată rezolva containerele după nume.

Pentru pornirea locală vezi [02 — Getting Started](02-getting-started.md). Acest document presupune că ai deja un `nginx-proxy` care rulează pe server.

---

## Cum arată setup-ul

```
                 Internet (HTTPS :443)
                        │
              ┌─────────▼──────────┐
              │  container         │   TLS Let's Encrypt
              │  nginx-proxy       │   (certbot / webroot)
              │  (extern, shared)  │
              └─────────┬──────────┘
                        │  rețea Docker `proxy`
          ┌─────────────┼──────────────────┐
          ▼                                ▼
 taskmanager-backend-1:3001     taskmanager-frontend-1:3000
          │                                │
          └──────────── default ───────────┘
                        ▼
              taskmanager-postgres-1:5432
```

Proxy-ul **nu** e pe host — e în containerul `nginx-proxy`. Containerele aplicației se atașează la rețeaua `proxy` automat prin `docker compose` (în `docker-compose.yml` au `networks: [default, proxy]`, iar `proxy` e declarată `external: true`). Vhost-ul face `proxy_pass` către containere **după nume** (`taskmanager-backend-1`, `taskmanager-frontend-1`).

---

## Pași de deployment (în ordine)

### 1. Pregătește rețeaua partajată (o singură dată)

```bash
docker network create proxy 2>/dev/null || true
docker network connect proxy nginx-proxy 2>/dev/null || true
```

### 2. `.env` de producție

Completează `.env` pe server cu valori de **producție**:

- `FRONTEND_URL=https://<domeniul-tău>` (ex. `https://taskmanager.sma1lsoft.eu`)
- `NODE_ENV=production`
- `JWT_SECRET` random și puternic (`openssl rand -hex 32`), `APP_PIN`, `ADMIN_PASSWORD` schimbate
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` reale

Vezi tabelul complet de variabile în [02 — Getting Started](02-getting-started.md).

### 3. Build & up

```bash
docker compose up -d --build
```

Aplicația se atașează la rețeaua `proxy` și pornește `backend`, `frontend`, `postgres`.

### 4. Migrările și seed-ul — OBLIGATORIU

> [!IMPORTANT]
> `backend/start.sh` rulează `alembic upgrade head` și `python seed.py` **automat** la pornire. Dar dacă schimbi schema, faci deploy cu DB nou, sau ceva eșuează la boot, rulează-le **manual** — altfel aplicația crapă, iar board-ul **«Birou»** (proiectul-sistem de quick tasks) apare **gol** pentru că nu a fost seedat.

```bash
docker compose exec backend alembic upgrade head    # aplică toate migrările
docker compose exec backend python seed.py          # seed idempotent (admin inițial + proiect «Birou»)
```

Confirmă în loguri că au trecut fără erori:

```bash
docker compose logs -f backend
```

### 5. Vhost-ul nginx-proxy

Fișierul versionat [`deploy/nginx-proxy/taskmanager.conf`](../deploy/nginx-proxy/taskmanager.conf) este vhost-ul gata făcut. **Copiază-l** în directorul montat în containerul proxy (nu-l rescrie manual pe server):

```bash
cp deploy/nginx-proxy/taskmanager.conf /opt/nginx-proxy/conf.d/taskmanager.conf
# host /opt/nginx-proxy/conf.d  ->  container /etc/nginx/conf.d
```

Vhost-ul:

- ascultă pe **80** (ACME challenge `/.well-known/acme-challenge/` + redirect → HTTPS) și pe **443** (aplicația);
- `proxy_pass` pentru `/api/` → `http://taskmanager-backend-1:3001`;
- `proxy_pass` pentru restul → `http://taskmanager-frontend-1:3000`;
- servește `/sw.js` mereu proaspăt (`Cache-Control: no-store`) — esențial pentru PWA;
- `client_max_body_size 25m` pentru upload-uri (capturi de ecran din quick task, schițe notebook).

### 6. Certificate TLS (Let's Encrypt)

Certurile sunt așteptate la:

```
/etc/letsencrypt/live/<domeniu>/fullchain.pem
/etc/letsencrypt/live/<domeniu>/privkey.pem
```

Le obții cu **certbot** prin webroot (challenge-ul HTTP-01 e servit pe portul 80 din vhost). După emitere, certbot se ocupă de reînnoirea automată.

### 7. Test + reload (din container) + verificare

```bash
docker exec nginx-proxy nginx -t && docker exec nginx-proxy nginx -s reload
curl -I https://<domeniul-tău>/
```

---

## Capcane comune

- **NU edita vhost-ul pe server cu `cat << EOF` / `nano` + paste.** Lipirea multi-linie se duce în bash și strică fișierul. Copiază fișierul versionat cu `cp` — zero lipire, zero erori.
- **`proxy_pass` dă „host not found" / 502** — proxy-ul nu e pe rețeaua `proxy`, sau numele containerului nu coincide. Verifică `docker network connect proxy nginx-proxy` și că rulează `taskmanager-backend-1` / `taskmanager-frontend-1`.
- **Board «Birou» gol / erori 500 la pornire** — nu a rulat seed-ul / migrările. Rulează manual pasul 4.
- **`nginx -t` / `reload` nu au efect** — le rulezi pe host, nu în container. Folosește `docker exec nginx-proxy ...`.
- **PWA servește o versiune veche** — `sw.js` e cache-uit. Vhost-ul îl forțează `no-store`; dacă l-ai modificat, restabilește acel `location = /sw.js`.
- **`docker compose down -v`** șterge volumul Postgres (pierzi datele). Pe producție folosește doar `down` fără `-v`.
- **`DATABASE_URL` greșit** — host-ul trebuie să fie `postgres` (numele serviciului), iar user/parola/db să coincidă cu `POSTGRES_*`.

---

## Note

- Există și un nginx „intern" la `nginx/nginx.conf` (rutare `/api` → backend, rest → frontend) — relevant pentru un setup mono-host fără proxy extern. Pe setup-ul cu nginx-proxy partajat, vhost-ul canonic e cel din [`deploy/nginx-proxy/taskmanager.conf`](../deploy/nginx-proxy/taskmanager.conf).
- Pentru pipeline-ul automat de CI/CD vezi [CICD.md](CICD.md).

---

Înapoi la [cuprins](README.md).
