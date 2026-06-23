# 07 — Autentificare (Auth)

Autentificarea TaskManager este **2FA prin Telegram**: userul își dovedește identitatea cu un cod de 6 cifre primit pe bot, iar serverul îi întoarce un JWT cu durată limitată. Adminii au o ușă separată (`/admin_task_manager`), dar trec prin același mecanism. La expirarea tokenului, userul poate re-loga rapid cu un **PIN personal** în loc să mai aștepte un cod.

Acest document descrie flow-urile, endpoint-urile și comportamentul frontend-ului. Pentru arhitectura generală vezi [Backend](04-backend.md); pentru tabelele implicate vezi [Baza de date](06-database.md).

Codul relevant:
- `backend/app/core/security.py` — hashing, JWT, dependențe FastAPI.
- `backend/app/api/auth.py` — rutele.
- `backend/app/services/auth_service.py` — logica (challenge, verificare, lockout, sesiune).
- `frontend/src/features/auth/` — paginile de login + `hooks/useAuth.ts`.
- `frontend/src/app/routes.tsx` — `ProtectedRoute` / `AdminRoute`.
- `frontend/src/shared/api/client.ts` — interceptorul axios.

---

## Flow user normal (2FA cod Telegram)

1. **Username** → userul introduce username-ul în `/login`. Frontend-ul apelează `POST /api/auth/login`.
2. **Cod 6 cifre** → serverul generează un cod numeric (`generate_login_code`), îi stochează doar **hash-ul** (`hash_secret`, SHA256 keyed cu `JWT_SECRET`) într-un rând `LoginCode` cu `purpose="login"` și `expires_at = acum + LOGIN_CODE_TTL_MINUTES`, apoi îl trimite pe Telegram (`_deliver_code`), localizat după limba userului. Răspunsul conține `challengeId`, `expiresAt`, `deliveredVia` (`telegram` sau `console` dacă chat-ul nu e legat) și un `hint` cu chat-ul mascat.
3. **Verificare** → userul trimite codul. Frontend-ul apelează `POST /api/auth/verify` cu `challengeId` + `code`. Dacă e valid, neexpirat și sub `LOGIN_CODE_MAX_ATTEMPTS`, serverul îl marchează folosit și emite un **JWT de 12h** (vezi mai jos).

```text
username ──login──▶ challengeId + cod pe Telegram ──verify──▶ JWT (12h)
```

Anti-abuz: codurile vechi nefolosite pe același user/purpose sunt invalidate la fiecare challenge nou; fiecare încercare greșită incrementează `attempts`, iar la depășirea limitei codul devine inutil.

### Re-logare la expirare: cod nou sau PIN personal

Când JWT-ul expiră, userul are două opțiuni:

- **Cod nou** — reia `POST /api/auth/login` + `POST /api/auth/verify`.
- **PIN personal** — dacă și-a setat un PIN în profil (`PUT /api/auth/pin`, 4–8 cifre, stocat ca `pin_hash` cu KDF scrypt/pbkdf2), poate apela direct `POST /api/auth/refresh` cu `username` + `pin`, fără să mai treacă prin Telegram.

PIN-ul e gândit ca *al doilea drum* spre o sesiune nouă, nu ca înlocuitor al 2FA inițial. La PIN greșit se înregistrează un eșec (`register_failed_attempt`); după prea multe eșecuri contul e blocat temporar și `/refresh` întoarce **429** cu header `Retry-After`.

---

## Flow admin

- Adminii intră pe un URL separat: **`/admin_task_manager`**.
- `POST /api/auth/admin/login` este identic cu `/login`, dar **respinge** orice user care nu are `role == "ADMIN"` (mesaj generic „Cont admin invalid", ca să nu scurgă existența conturilor).
- Verificarea folosește același `POST /api/auth/verify`.
- Există și o scurtătură cu parolă: `POST /api/auth/admin/password-login` (username + parolă, fără 2FA Telegram) și varianta combinată `POST /api/auth/password-login`, care întoarce fie o sesiune (admin), fie un challenge 2FA (user normal cu Telegram legat).

Pe partea de protecție a rutelor API, dependența `require_admin` (în `security.py`) verifică `user.role == "ADMIN"` și ridică **403** dacă nu e admin.

---

## Linking Telegram (`/link`)

Userii noi nu au `telegram_chat_id`, deci nu pot primi coduri. Legarea chat-ului se face cu un cod de unică folosință:

1. Codul se generează fie de admin (din pagina de utilizatori), fie de user însuși din profil: `POST /api/auth/me/link-code` creează un `LoginCode` cu `purpose="link"`, valabil 30 min.
2. Userul trimite botului: `/link <cod>`. Handler-ul (`telegram/commands.py:cmd_link`) caută codurile `link` nefolosite și neexpirate, verifică hash-ul, dezleagă orice alt user de pe chat-ul respectiv și setează `telegram_chat_id` pe contul corect.

```text
/link 482915
→ Cont legat: @ion. De acum primești aici codurile de logare și notificările.
```

Dezlegarea se face cu `DELETE /api/auth/me/telegram`. Există și alte porți de intrare prin Telegram (QR scan-to-login, „login Telegram" cu aprobare admin, Mini App via `initData` semnat) — vezi [Botul Telegram](08-telegram-bot.md).

---

## JWT — emitere, durată, expirare

`issue_token` (în `security.py`) creează un token **HS256** cu payload-ul:

```json
{
  "sub": "<user_id>",
  "username": "ion",
  "role": "USER",
  "tv": 0,            // token_version — bump-ul invalidează toate tokenurile vechi
  "iat": "...",
  "exp": "..."
}
```

- **Durata** e configurabilă cu `JWT_EXPIRE_HOURS` (default **12**).
- **Revocare**: claim-ul `tv` reflectă `users.token_version`. Dacă versiunea din token nu coincide cu cea curentă a userului, `get_current_user` ridică **401** („Token revoked") — util la logout-all / compromitere.
- **Token expirat** → `decode_token` prinde `ExpiredSignatureError` și ridică **401** („Token expired"). Token invalid → tot **401**.
- **Securitate la boot**: `assert_secure_config` refuză pornirea în producție dacă `JWT_SECRET` e slab (default din repo sau < 32 caractere); în dev doar avertizează.

| Stare token | Cod HTTP | Detail |
|---|---|---|
| Lipsă token | 401 | `Token missing` |
| Expirat | 401 | `Token expired` |
| Invalid / semnătură greșită | 401 | `Invalid token` |
| `token_version` vechi | 401 | `Token revoked` |
| User dezactivat / inexistent | 401 | `User not found or disabled` |
| Autentificat, dar nu admin (pe rută admin) | 403 | `Admin only` |
| Cont blocat după prea multe eșecuri | 429 | + header `Retry-After` |

---

## Frontend — stocare token, gărzi de rută, redirect pe 401

### Stocarea tokenului

`useAuth` (`hooks/useAuth.ts`) salvează sesiunea în `localStorage`: `token`, `username`, `userRole`, `tokenExpiresAt` (ms epoch). Interceptorul din `shared/api/client.ts` atașează automat `Authorization: Bearer <token>` la fiecare request — **nu** re-implementa asta în feature-uri.

### Gărzi de rută

În `app/routes.tsx`:
- `ProtectedRoute` — dacă nu există token, redirect la `/login`.
- `AdminRoute` — dacă nu e autentificat → `/admin_task_manager`; dacă e autentificat dar nu e admin → `/`.

### Redirect pe 401 (user vs admin)

Interceptorul axios prinde orice răspuns **401** (în afara apelurilor de login/verify/refresh), curăță tokenul, emite evenimentul `auth:expired` și redirecționează:
- `userRole === "ADMIN"` → `/admin_task_manager`
- altfel → `/login`

Doar rutele **exacte** `/login` și `/admin_task_manager` sunt considerate „pagini de login"; o pagină reală precum `/admin_task_manager/dashboard` cu token mort e redirecționată corect.

### Verificare proactivă de expirare

Ca adminul (și userul) să nu rămână blocat pe o pagină cu token mort până la următorul apel API, `useAuth` rulează `enforceTokenExpiry` la montare **și la fiecare 30s**: dacă `tokenExpiresAt` e în trecut, curăță sesiunea și redirecționează către login-ul corect (admin vs user), exact ca interceptorul.

---

## Endpoint-uri auth

Toate sub prefixul `/api/auth`.

| Metodă & rută | Auth | Descriere |
|---|---|---|
| `POST /api/auth/login` | publică | Pas 1: username → trimite cod 6 cifre pe Telegram. Întoarce `challengeId`. |
| `POST /api/auth/admin/login` | publică | Ca `/login`, dar doar pentru `role=ADMIN`. |
| `POST /api/auth/verify` | publică | Pas 2: `challengeId` + `code` → JWT 12h. |
| `POST /api/auth/refresh` | publică | Re-emite token cu `username` + `pin`. |
| `POST /api/auth/password-login` | publică | Login combinat: întoarce sesiune (admin / user fără Telegram) sau challenge 2FA. |
| `POST /api/auth/admin/password-login` | publică | Admin username + parolă, fără 2FA. |
| `POST /api/auth/logout` | token | JWT e stateless — clientul doar șterge tokenul. Endpoint păstrat pentru simetrie. |
| `GET  /api/auth/me` | token | Datele userului curent. |
| `PUT  /api/auth/me` | token | Update profil (nume, email, temă, limbă, notificări). |
| `PUT  /api/auth/pin` | token | Setează/schimbă PIN-ul (4–8 cifre) pentru refresh. |
| `PUT  /api/auth/password` | token | Userul își setează parola (min 6 caractere). |
| `PUT  /api/auth/admin/password` | token (admin) | Adminul își setează parola. |
| `GET  /api/auth/username-available` | token | Verifică disponibilitatea unui username. |
| `PUT  /api/auth/username` | token | Schimbă username-ul (3–30 caractere: `a-z 0-9 _ .`). |
| `POST /api/auth/me/link-code` | token | Userul își generează propriul cod `/link` (valabil 30 min). |
| `DELETE /api/auth/me/telegram` | token | Dezleagă chat-ul Telegram de cont. |
| `GET  /api/auth/public-config` | publică | Config public pentru paginile de login (username bot, deep-links). |
| `POST /api/auth/telegram-webapp` | publică | Login din Telegram Mini App via `initData` semnat. |
| `POST /api/auth/qr/init` · `GET /api/auth/qr/status` · `POST /api/auth/qr/confirm` | mixt | Flow QR scan-to-login (desktop ↔ mobil). |
| `POST /api/auth/tg-login/init` · `GET /api/auth/tg-login/status` | publică | „Login Telegram" cu aprobare admin pentru conturi noi. |

> Hashing: codurile OTP/`link` folosesc `hash_secret` (SHA256 keyed, efemer, TTL scurt). Parolele și PIN-urile folosesc `hash_password` (scrypt cu fallback pbkdf2, salt per-valoare), cu upgrade transparent al hash-urilor vechi la login.
