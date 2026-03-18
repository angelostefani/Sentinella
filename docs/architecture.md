# Architecture

## Overview

Sentinella is composed of multiple services orchestrated with Docker Compose. All services communicate over the internal Docker network; only nginx exposes a port on the host.

```
Host (port 8001)
      │
   nginx
   ├── /          → React frontend (static files from frontend_dist volume)
   └── /api/*     → api:8000 (FastAPI)
                       │
                  ┌────┴────────────────────────────┐
                  │                                 │
               postgres                          searxng
               (database)                      (web search)
                  │                                 │
               worker                           searxng_redis
           (APScheduler)                         (cache)
                  │
               ollama
             (local LLM)
```

## Main Services

### API (FastAPI)

- File: `api/app/main.py`
- Handles all REST requests under `/api/*`
- JWT authentication, RBAC (`admin` / `user`)
- In-memory rate limiting
- On startup: creates DB tables and bootstraps the admin user
- Structured JSON logging to stdout

### Worker (APScheduler)

- File: `worker/app/main.py`
- Independent Python process using `BackgroundScheduler`
- Every 30s it syncs jobs from the DB (add/update/remove)
- Each enabled watch gets a `CronTrigger` job
- Jobs execute `run_watch()`: search → extract → digest → save
- URL deduplication through the `seen_items` table
- Concurrency: `ThreadPoolExecutor(max_workers=WORKER_MAX_WORKERS)`

### Frontend (React + Vite)

- File: `frontend/src/App.jsx`
- React 18 SPA with React Router 6
- One-shot build in `frontend_build`, output stored in the `frontend_dist` volume
- JWT token stored in `localStorage`
- Automatic redirect to `/login` on HTTP 401 responses

### Pipeline (API + Worker)

Both services share the same pipeline logic:

```
search_web()        → SearXNG JSON → domain-filtered URL list
fetch_extract()     → httpx fetch + trafilatura text extraction
digest_markdown()   → Ollama /api/generate → Markdown with sources
```

## Main Flows

### On-Demand Search (Ask)

```
POST /api/ask
  → auth + rate limit
  → search_web() via SearXNG
  → fetch_extract() for each URL
  → digest_markdown() via Ollama
  → save Run(watch_id=NULL, user_id=me)
  → return RunOut
```

### Scheduled Watch (Worker)

```
sync_jobs() every 30s
  → reads enabled watchlists from DB
  → creates/updates/removes APScheduler jobs

CronTrigger fires
  → run_watch(watch_id)
      → jitter 0..WATCH_JITTER_MAX_S seconds
      → search_web() + fetch + digest
      → save Run(watch_id=id)
      → upsert seen_items (URL dedup)
```

### Authentication

```
POST /api/auth/login {username, password}
  → verify_password (bcrypt)
  → create_token (JWT HS256, 12h)
  → return access_token

Subsequent requests: Authorization: Bearer <token>
  → get_current_user() → decode_token() → verify is_active
```

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Web API | FastAPI + Uvicorn | 0.115 / 0.30 |
| ORM | SQLAlchemy | 2.0 |
| Database | PostgreSQL | 16 |
| Scheduler | APScheduler | 3.10 |
| HTTP client | httpx | 0.27 |
| Content extraction | trafilatura | 1.12 |
| Auth | python-jose + passlib (bcrypt) | — |
| Frontend | React 18 + React Router 6 | — |
| Build tool | Vite | 5.4 |
| LLM | Ollama (`llama3.2` by default) | latest |
| Search | SearXNG | latest |
| Proxy | nginx alpine | latest |
| Language | Python 3.11 / JavaScript | — |
