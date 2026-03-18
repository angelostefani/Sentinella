# Development, Testing, and Operations

## Manual Testing with curl

Set the base URL:
```bash
export BASE="http://localhost:8001"
```

### 1. Health check
```bash
curl -s "$BASE/api/health"
```

### 2. Admin login
```bash
curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### 3. Save the token
```bash
export TOKEN="<paste_admin_token>"
```

### 4. Check current user
```bash
curl -s "$BASE/api/me" -H "Authorization: Bearer $TOKEN"
```

### 5. Create user
```bash
curl -s -X POST "$BASE/api/admin/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"mario","password":"password123","role":"user"}'
```

### 6. User login
```bash
curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"mario","password":"password123"}'

export TOKEN_USER="<paste_user_token>"
```

### 7. Create personal watchlist (cron every 10 minutes for testing)
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

### 8. List watchlists
```bash
curl -s "$BASE/api/watchlist" -H "Authorization: Bearer $TOKEN_USER"
```

### 9. Manual run
```bash
export WATCH_ID="<paste_watch_id>"
curl -s -X POST "$BASE/api/watchlist/$WATCH_ID/run" \
  -H "Authorization: Bearer $TOKEN_USER"
```

### 10. List runs
```bash
curl -s "$BASE/api/runs" -H "Authorization: Bearer $TOKEN_USER"
```

### 11. Run detail
```bash
export RUN_ID="<paste_run_id>"
curl -s "$BASE/api/runs/$RUN_ID" -H "Authorization: Bearer $TOKEN_USER"
```

---

## Service Verification

### Worker logs (scheduling)
```bash
docker compose logs -f worker
```

### Verify SearXNG JSON
```bash
docker compose exec api python -c \
  "import os,httpx; print(httpx.get(os.getenv('SEARXNG_URL') + '/search', params={'q':'test','format':'json'}).status_code)"
```

### Verify Ollama
```bash
curl -s "http://localhost:11434/api/tags"
```

### Docker service status
```bash
docker compose ps
```

---

## Domain Filters — Behavior

- `domains_allow`: if not empty, accepts **only** URLs from those domains
- `domains_block`: always excludes the listed domains
- `domains_allow` has priority over `domains_block`
- Normalization: `www.` removed, case-insensitive
- Wildcard: `*.example.com` matches all subdomains

**`recency_days` → `time_range` SearXNG mapping:**

| recency_days | time_range |
|:---:|:---:|
| ≤ 1 | `day` |
| ≤ 7 | `week` |
| ≤ 30 | `month` |
| > 30 | `year` |

---

## Structured Logging

API and Worker emit JSON logs to stdout:

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
# Follow logs in real time
docker compose logs -f api
docker compose logs -f worker

# Filter only errors
docker compose logs api | grep '"level":"ERROR"'
```

---

## Database Backup

```bash
# Manual dump
docker compose exec -T postgres pg_dump -U assistant assistant > backup.sql

# Restore
docker compose exec -T postgres psql -U assistant assistant < backup.sql
```

Daily cron on the host:
```bash
0 2 * * * cd /path/to/sentinella && docker compose exec -T postgres pg_dump -U assistant assistant > /backup/sentinella_$(date +\%F).sql
```

---

## Code Structure

```
Sentinella/
├── api/app/
│   ├── main.py           # FastAPI app, endpoints, middleware, bootstrap
│   ├── models.py         # SQLAlchemy ORM (User, Watchlist, Run, SeenItem)
│   ├── schemas.py        # Pydantic request/response schemas
│   ├── config.py         # Settings from env (pydantic)
│   ├── db.py             # Database session and engine
│   ├── security.py       # JWT and bcrypt
│   ├── deps.py           # Dependency injection (auth)
│   ├── pipeline.py       # search_web, fetch_extract, digest_markdown
│   ├── domain_filters.py # Domain filtering and recency mapping
│   ├── rate_limit.py     # InMemoryRateLimiter
│   └── logging_utils.py  # JsonFormatter
├── worker/app/
│   ├── main.py           # BackgroundScheduler, sync_jobs, run_watch
│   ├── models.py         # Read-only ORM
│   ├── config.py         # Settings
│   ├── pipeline.py       # Pipeline (worker version)
│   └── logging_utils.py  # JsonFormatter
├── frontend/src/
│   ├── main.jsx          # React entry point + routing
│   ├── App.jsx           # Page components + api() wrapper
│   └── styles.css
├── nginx/nginx.conf      # Reverse proxy
├── searxng/settings.yml  # Enables JSON format
├── docker-compose.yml
├── .env.example
└── docs/                 # This documentation
```

---

## Deployment Checklist

- [ ] `docker compose up --build` completed without errors
- [ ] UI reachable at `http://localhost:8001`
- [ ] `GET /api/health` returns `{"status":"ok"}`
- [ ] Admin login works
- [ ] SearXNG responds with JSON (status 200)
- [ ] Ollama has the model downloaded (`/api/tags`)
- [ ] Creating a watch with `*/10 * * * *` produces automatic runs
- [ ] Admin password changed
