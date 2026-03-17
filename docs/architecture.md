# Architettura

## Panoramica

Sentinella è composta da più servizi orchestrati con Docker Compose. Tutti i servizi comunicano sulla rete interna Docker; solo nginx espone una porta sull'host.

```
Host (porta 8001)
      │
   nginx
   ├── /          → frontend React (static files da volume frontend_dist)
   └── /api/*     → api:8000 (FastAPI)
                       │
                  ┌────┴────────────────────────────┐
                  │                                 │
               postgres                          searxng
               (database)                      (ricerca web)
                  │                                 │
               worker                           searxng_redis
           (APScheduler)                         (cache)
                  │
               ollama
             (LLM locale)
```

## Servizi principali

### API (FastAPI)

- File: `api/app/main.py`
- Gestisce tutte le richieste REST su `/api/*`
- Autenticazione JWT, RBAC (admin/user)
- Rate limiting in-memory
- All'avvio: crea tabelle DB e bootstrap utente admin
- Logging strutturato JSON su stdout

### Worker (APScheduler)

- File: `worker/app/main.py`
- Processo Python indipendente con `BackgroundScheduler`
- Ogni 30s sincronizza i job dal DB (aggiunge/aggiorna/rimuove)
- Ogni watch abilitata ottiene un job con `CronTrigger`
- I job eseguono `run_watch()`: cerca → estrae → digest → salva
- Deduplicazione URL tramite tabella `seen_items`
- Concorrenza: `ThreadPoolExecutor(max_workers=WORKER_MAX_WORKERS)`

### Frontend (React + Vite)

- File: `frontend/src/App.jsx`
- SPA React 18 con React Router 6
- Build one-shot in `frontend_build`, output nel volume `frontend_dist`
- Token JWT salvato in `localStorage`
- Redirect automatico a `/login` su risposta 401

### Pipeline (API + Worker)

Entrambi i servizi condividono la stessa logica di pipeline:

```
search_web()        → SearXNG JSON → lista URL filtrati per dominio
fetch_extract()     → httpx fetch + trafilatura estrazione testo
digest_markdown()   → Ollama /api/generate → Markdown con fonti
```

## Flussi principali

### Ricerca on-demand (Ask)

```
POST /api/ask
  → auth + rate limit
  → search_web() via SearXNG
  → fetch_extract() per ogni URL
  → digest_markdown() via Ollama
  → salva Run(watch_id=NULL, user_id=me)
  → ritorna RunOut
```

### Watch schedulata (Worker)

```
sync_jobs() ogni 30s
  → legge watchlist abilitate da DB
  → crea/aggiorna/rimuove job APScheduler

CronTrigger fires
  → run_watch(watch_id)
      → jitter 0..WATCH_JITTER_MAX_S secondi
      → search_web() + fetch + digest
      → salva Run(watch_id=id)
      → upsert seen_items (dedup URL)
```

### Autenticazione

```
POST /api/auth/login {username, password}
  → verify_password (bcrypt)
  → create_token (JWT HS256, 12h)
  → ritorna access_token

Richieste successive: Authorization: Bearer <token>
  → get_current_user() → decode_token() → verifica is_active
```

## Stack tecnologico

| Layer | Tecnologia | Versione |
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
| LLM | Ollama (llama3.2 default) | latest |
| Search | SearXNG | latest |
| Proxy | nginx alpine | latest |
| Linguaggio | Python 3.11 / JavaScript | — |
