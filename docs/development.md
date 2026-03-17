# Sviluppo, Testing e Operazioni

## Testing manuale con curl

Imposta la base URL:
```bash
export BASE="http://localhost:8001"
```

### 1. Health check
```bash
curl -s "$BASE/api/health"
```

### 2. Login admin
```bash
curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### 3. Salva il token
```bash
export TOKEN="<incolla_token_admin>"
```

### 4. Verifica utente corrente
```bash
curl -s "$BASE/api/me" -H "Authorization: Bearer $TOKEN"
```

### 5. Crea utente
```bash
curl -s -X POST "$BASE/api/admin/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"mario","password":"password123","role":"user"}'
```

### 6. Login utente
```bash
curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"mario","password":"password123"}'

export TOKEN_USER="<incolla_token_user>"
```

### 7. Crea watchlist personale (cron ogni 10 minuti per test)
```bash
curl -s -X POST "$BASE/api/watchlist/personal" \
  -H "Authorization: Bearer $TOKEN_USER" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Qdrant updates",
    "query":"qdrant release changelog",
    "cron":"*/10 * * * *",
    "enabled":true,
    "recency_days":7,
    "max_results":5,
    "domains_allow":["github.com","qdrant.tech"],
    "domains_block":[]
  }'
```

### 8. Lista watchlist
```bash
curl -s "$BASE/api/watchlist" -H "Authorization: Bearer $TOKEN_USER"
```

### 9. Run manuale
```bash
export WATCH_ID="<incolla_id_watch>"
curl -s -X POST "$BASE/api/watchlist/$WATCH_ID/run" \
  -H "Authorization: Bearer $TOKEN_USER"
```

### 10. Lista runs
```bash
curl -s "$BASE/api/runs" -H "Authorization: Bearer $TOKEN_USER"
```

### 11. Dettaglio run
```bash
export RUN_ID="<incolla_run_id>"
curl -s "$BASE/api/runs/$RUN_ID" -H "Authorization: Bearer $TOKEN_USER"
```

---

## Verifica dei servizi

### Log worker (schedulazione)
```bash
docker compose logs -f worker
```

### Verifica SearXNG JSON
```bash
docker compose exec api python -c \
  "import os,httpx; print(httpx.get(os.getenv('SEARXNG_URL') + '/search', params={'q':'test','format':'json'}).status_code)"
```

### Verifica Ollama
```bash
curl -s "http://localhost:11434/api/tags"
```

### Stato servizi Docker
```bash
docker compose ps
```

---

## Filtri domini — comportamento

- `domains_allow`: se non vuoto, accetta **solo** URL di quei domini
- `domains_block`: esclude sempre i domini indicati
- `domains_allow` ha priorità su `domains_block`
- Normalizzazione: `www.` rimosso, case-insensitive
- Wildcard: `*.example.com` matcha tutti i sottodomini

**Mapping `recency_days` → `time_range` SearXNG:**

| recency_days | time_range |
|:---:|:---:|
| ≤ 1 | `day` |
| ≤ 7 | `week` |
| ≤ 30 | `month` |
| > 30 | `year` |

---

## Logging strutturato

API e Worker emettono log JSON su stdout:

```json
{
  "timestamp": "2025-03-16T10:30:45.123456+00:00",
  "level": "INFO",
  "service": "api",
  "message": "request completed",
  "request_id": "uuid",
  "user_id": 1,
  "endpoint": "/api/ask",
  "duration_ms": 1500,
  "status_code": 200,
  "error": null
}
```

```bash
# Seguire i log in real-time
docker compose logs -f api
docker compose logs -f worker

# Filtrare solo errori
docker compose logs api | grep '"level":"ERROR"'
```

---

## Backup database

```bash
# Dump manuale
docker compose exec -T postgres pg_dump -U assistant assistant > backup.sql

# Ripristino
docker compose exec -T postgres psql -U assistant assistant < backup.sql
```

Cron giornaliero sull'host:
```bash
0 2 * * * cd /path/to/sentinella && docker compose exec -T postgres pg_dump -U assistant assistant > /backup/sentinella_$(date +\%F).sql
```

---

## Struttura del codice

```
Sentinella/
├── api/app/
│   ├── main.py          # FastAPI app, endpoint, middleware, bootstrap
│   ├── models.py        # SQLAlchemy ORM (User, Watchlist, Run, SeenItem)
│   ├── schemas.py       # Pydantic request/response schemas
│   ├── config.py        # Settings da env (pydantic)
│   ├── db.py            # Session e engine database
│   ├── security.py      # JWT e bcrypt
│   ├── deps.py          # Dependency injection (auth)
│   ├── pipeline.py      # search_web, fetch_extract, digest_markdown
│   ├── domain_filters.py # Filtraggio domini e mapping recency
│   ├── rate_limit.py    # InMemoryRateLimiter
│   └── logging_utils.py # JsonFormatter
├── worker/app/
│   ├── main.py          # BackgroundScheduler, sync_jobs, run_watch
│   ├── models.py        # ORM sola lettura
│   ├── config.py        # Settings
│   ├── pipeline.py      # Pipeline (versione worker)
│   └── logging_utils.py # JsonFormatter
├── frontend/src/
│   ├── main.jsx         # Entry point React + routing
│   ├── App.jsx          # Componenti pagine + api() wrapper
│   └── styles.css
├── nginx/nginx.conf     # Reverse proxy
├── searxng/settings.yml # Abilita formato JSON
├── docker-compose.yml
├── .env.example
└── docs/                # Questa documentazione
```

---

## Checklist deploy

- [ ] `docker compose up --build` completato senza errori
- [ ] UI raggiungibile su `http://localhost:8001`
- [ ] `GET /api/health` restituisce `{"status":"ok"}`
- [ ] Login admin funzionante
- [ ] SearXNG risponde JSON (status 200)
- [ ] Ollama ha il modello scaricato (`/api/tags`)
- [ ] Creazione watch con `*/10 * * * *` produce run automatici
- [ ] Password admin cambiata
