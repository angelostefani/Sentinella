# SENTINELLA — SPEC (MVP+)

**Sentinella** è una web app self-hosted in LAN che fa:
- ricerca web aggiornata (**senza API key esterne**)
- sintesi con LLM locale (**Ollama**)
- watchlist con scheduler (**cron**)
- multi-utente (**login + JWT**) con ruoli minimi (**admin/user**)

Obiettivo: avere un prodotto interno semplice ma solido, estendibile nel tempo.

---

## 1) Architettura (un solo docker-compose)

Servizi obbligatori nel `docker-compose.yml`:

- `nginx`
  - serve la UI React
  - reverse proxy `/api/` verso `api:8000`

- `frontend_build`
  - build Vite React su volume condiviso (`frontend_dist`)
  - **build one-shot**: compila e termina (non watch mode)

- `api` (FastAPI)
  - espone `/health`
  - espone tutte le API `/api/*`
  - auth JWT, RBAC
  - esegue ricerche on-demand
  - CRUD watchlist
  - rate limiting

- `worker` (Python)
  - APScheduler vero
  - cron per ogni watch enabled
  - sync jobs da DB ogni 30s
  - esegue watch schedulate

- `postgres` (Postgres 16)
  - persistenza su volume
  - niente migrazioni (solo `Base.metadata.create_all`)

- `ollama`
  - LLM locale
  - usato per digest Markdown

- `ollama_init`
  - **one-shot init container**
  - esegue `ollama pull $OLLAMA_MODEL` al bootstrap e poi termina

- `searxng` + `searxng_redis`
  - ricerca web senza API key
  - deve supportare output JSON

---

## 2) Configurazione (env)

Il repo deve includere `.env.example` con:

### Generali
- `TZ` (default `Europe/Rome`)  
  > timezone configurabile, non hardcoded nel codice

### Auth
- `JWT_SECRET` (obbligatorio)
- `JWT_EXPIRE_HOURS` (default 12)

### Ollama
- `OLLAMA_URL` (default `http://ollama:11434`)
- `OLLAMA_MODEL` (default `llama3.2`)

### SearXNG
- `SEARXNG_URL` (default `http://searxng:8080`)

### Rate limiting
- `RATE_LIMIT_RPM` (default 60)

### Limiti fetch/extract
- `MAX_FETCH_BYTES` (default 2000000)
- `FETCH_TIMEOUT_S` (default 15)
- `MAX_TEXT_CHARS_PER_SOURCE` (default 4000)

### Worker
- `WORKER_MAX_WORKERS` (default 4)
- `WATCHLIST_SYNC_INTERVAL_S` (default 30)
- `WATCH_JITTER_MAX_S` (default 30)

---

## 3) Requisiti funzionali

### 3.1 Multi-utente (login + JWT)
- password hash bcrypt
- ruoli minimi:
  - `admin`
  - `user`

Endpoint:
- `POST /api/auth/login`
- `GET /api/me`

Admin-only:
- `POST /api/admin/users` (crea utente)
- `GET /api/admin/users`
- `PUT /api/admin/users/{id}` (disable/reset password)

Bootstrap:
- se DB vuoto, creare admin default:
  - username: `admin`
  - password: `admin123`
- loggare warning chiaro: “cambiare password”.

JWT:
- header: `Authorization: Bearer <token>`
- secret: `JWT_SECRET` da env (obbligatorio)
- scadenza: configurabile (`JWT_EXPIRE_HOURS`, default 12)

---

### 3.2 Watchlist (global + personal)
- **Global**: create/modificate solo da admin
- **Personal**: ogni user gestisce le proprie

Regole:
- user vede global in read-only
- user può eseguire “run now” solo sulle proprie personal
- admin può eseguire “run now” su tutto

---

### 3.3 Runs (storico)
- `/api/ask` crea un run con:
  - `watch_id = NULL`
  - `user_id = me`
- watch schedulata crea run:
  - personal: `user_id = owner_user_id`
  - global: `user_id = NULL`

Permessi:
- user vede solo i propri run (ask + personal)
- admin vede tutto

---

### 3.4 Scheduler vero (APScheduler)
- per ogni watch enabled crea un job
- trigger: `CronTrigger.from_crontab(w.cron, timezone=TZ)`
- job id: `watch:{id}`
- sync jobs ogni 30s:
  - crea nuovi
  - aggiorna se cambiano cron/query/filtri/enabled
  - rimuove se disabilitato o cancellato
- impostazioni:
  - `misfire_grace_time=300`
  - `coalesce=True`
  - `max_instances=1` (per watch)

Default cron:
- `"0 8 * * *"` (08:00 daily)

Per test:
- usare `"*/10 * * * *"` (non */2)

Concurrency:
- scheduler usa `ThreadPoolExecutor(max_workers=WORKER_MAX_WORKERS)`
- per evitare burst: ogni run applica un delay random `0..WATCH_JITTER_MAX_S` secondi

Timezone:
- NON hardcodare
- usare env `TZ` (default `Europe/Rome`)

---

## 4) Ricerca web (senza API key)

### 4.1 SearXNG
Chiamata:
- `GET {SEARXNG_URL}/search`

Parametri:
- `q=<query>`
- `format=json`
- `time_range=day|week|month|year` (opzionale)
- `language=it-IT`
- `safesearch=1`

⚠️ Nota: molte istanze hanno JSON disabilitato.
Nel repo deve esserci `searxng/settings.yml` configurato per consentire output JSON e testato.

---

### 4.2 Mapping recency_days → time_range (deterministico)
- `recency_days <= 1`  → `day`
- `recency_days <= 7`  → `week`
- `recency_days <= 30` → `month`
- else → `year`

---

### 4.3 Filtri domini
- `domains_allow`: se non vuoto, accetta solo quei domini
- `domains_block`: rifiuta sempre quei domini

Dominio:
- case-insensitive
- normalizzare rimuovendo `www.`
- supportare pattern:
  - `example.com` (match esatto)
  - `*.example.com` (wildcard subdomain)

---

### 4.4 Fetch + Extract
- fetch HTML con `httpx`
- estrazione testo con `trafilatura`
- limiti difensivi configurabili via env:
  - `MAX_FETCH_BYTES` (default 2MB)
  - `FETCH_TIMEOUT_S` (default 15s)
  - `MAX_TEXT_CHARS_PER_SOURCE` (default 4000)

---

## 5) Digest con Ollama

Endpoint:
- `POST {OLLAMA_URL}/api/chat`

Env:
- `OLLAMA_URL` (default `http://ollama:11434`)
- `OLLAMA_MODEL` (default `llama3.2`)

Prompt:
- riassunto in italiano basato SOLO sulle fonti fornite
- output Markdown con:
  - titolo
  - 5-10 bullet “Novità/Takeaways” con citazioni `[n]`
  - (opzionale) “Cosa tenere d’occhio”
  - sezione “Fonti” con `[n] Titolo — URL`

Ollama model pull:
- usare servizio `ollama_init` one-shot:
  - aspetta Ollama up
  - esegue `ollama pull $OLLAMA_MODEL`
  - termina

Healthcheck di Ollama:
- verifica solo server up (es. `/api/tags`)
- NON deve bloccare aspettando il modello.

---

## 6) Rate limiting (API)

- Proteggere endpoint costosi:
  - `POST /api/ask`
  - `POST /api/watchlist/*/run`

- Rate limit configurabile:
  - env `RATE_LIMIT_RPM` (default 60)

- MVP: in-memory va bene
- Documentare che per prod conviene Redis.

---

## 7) Logging strutturato (JSON)

API e Worker devono loggare in formato JSON con campi minimi:

- `timestamp`
- `level`
- `service` (api|worker)
- `request_id` (per api)
- `user_id` (se disponibile)
- `endpoint`
- `duration_ms`
- `status_code`
- `error` (se presente)

API:
- middleware genera `request_id`
- logga request start/end e errori

Worker:
- logga:
  - added/updated/removed job watch:{id}
  - run completati
  - errori fetch/search/ollama

---

## 8) Healthchecks Docker (obbligatori)

Ogni servizio deve avere un `healthcheck` nel compose:

- api: GET `/health`
- nginx: GET `/`
- postgres: `pg_isready`
- ollama: GET `/api/tags` (o check porta)
- searxng: GET `/` e (se possibile) test JSON search (q=test&format=json)
- redis: `redis-cli ping`

---

## 9) Persistenza e backup

- Postgres deve avere volume persistente.
- README deve includere una mini backup strategy:
  - esempio `pg_dump` manuale
  - esempio job giornaliero (anche solo comando)

---

## 10) UI (React + Vite)

Pagine e routing:
- `/login`
- `/ask`
- `/watchlist`
- `/runs`
- `/admin/users` (solo admin)

UI Watchlist:
- tab “Global” (read-only per user)
- tab “Le mie” (CRUD)
- form include:
  - name
  - query
  - cron (default `*/10 * * * *` per test)
  - recency_days
  - max_results
  - domains_allow (comma-separated)
  - domains_block (comma-separated)

Auth UI:
- token JWT salvato in localStorage
- header `Authorization: Bearer ...` su tutte le chiamate
- se 401 -> redirect /login

---

## 11) API endpoints (riassunto)

### Public
- `GET /health`

### Auth
- `POST /api/auth/login`
- `GET /api/me`

### Ask
- `POST /api/ask`

### Watchlist
- `GET /api/watchlist`
- `POST /api/watchlist/personal`
- `PUT /api/watchlist/personal/{id}`
- `DELETE /api/watchlist/personal/{id}`

Admin global:
- `POST /api/watchlist/global`
- `PUT /api/watchlist/global/{id}`
- `DELETE /api/watchlist/global/{id}`

Run now:
- `POST /api/watchlist/{id}/run`

### Runs
- `GET /api/runs`
- `GET /api/runs/{id}`

### Admin users
- `POST /api/admin/users`
- `GET /api/admin/users`
- `PUT /api/admin/users/{id}`

---

## 12) Modello dati (Postgres) — NO migrazioni

Usare SQLAlchemy + `Base.metadata.create_all`.

Tabelle:

- `users`
  - id
  - username (unique)
  - password_hash
  - role (admin|user)
  - is_active
  - created_at

- `watchlist`
  - id
  - name
  - query
  - cron
  - enabled
  - scope ('global'|'personal')
  - owner_user_id (nullable)
  - recency_days
  - max_results
  - domains_allow (json)
  - domains_block (json)
  - created_at

- `runs`
  - id
  - watch_id (nullable)
  - user_id (nullable)
  - query
  - items (json)
  - digest_md (text)
  - created_at

- `seen_items`
  - id
  - watch_id
  - url_hash
  - url
  - first_seen

---

## 13) Output richiesto da Codex

Codex deve:
- generare tutti i file necessari
- eseguire `docker compose up --build`
- correggere errori fino ad avere:
  - UI su `http://localhost:8001`
  - API su `http://localhost:8001/api/health`
  - login admin funzionante
  - SearXNG JSON funzionante
  - watch personale con cron `*/10 * * * *` che produce runs dal worker

---

## 14) README: sezione “How to test” (curl)

Il README deve includere una sezione completa di comandi curl:
- login
- create user (admin)
- create personal watch
- run now
- list runs
- view run details

---

## 15) Vincoli
- NO Alembic/migrazioni
- NO API key esterne
- dipendenze minime
- codice leggibile e modulare
