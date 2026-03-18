# Configuration

All environment variables are defined in `.env` (starting from `.env.example`).

## Required Variables

| Variable | Default | Description |
|-----------|---------|-------------|
| `JWT_SECRET` | — | HMAC secret for JWT signing. **No default — must be set.** |

## General

| Variable | Default | Description |
|-----------|---------|-------------|
| `TZ` | `Europe/Rome` | Timezone used for cron, logs, and scheduler. Not hardcoded in code. |

## JWT Authentication

| Variable | Default | Description |
|-----------|---------|-------------|
| `JWT_SECRET` | — | Secret for HS256 signing |
| `JWT_EXPIRE_HOURS` | `12` | Token lifetime in hours |

## Ollama (LLM)

| Variable | Default | Description |
|-----------|---------|-------------|
| `OLLAMA_URL` | `http://ollama:11434` | Ollama service URL |
| `OLLAMA_MODEL` | `llama3.2` | Model used for digests |

## SearXNG (Search)

| Variable | Default | Description |
|-----------|---------|-------------|
| `SEARXNG_URL` | `http://searxng:8080` | SearXNG service URL |

## Rate Limiting

| Variable | Default | Description |
|-----------|---------|-------------|
| `RATE_LIMIT_RPM` | `60` | Maximum requests per minute for `POST /api/ask` and `POST /api/watchlist/{id}/run` |

> The rate limiter is in-memory (per process). For multi-instance production use, consider Redis.

## Fetch/Extract Limits

| Variable | Default | Description |
|-----------|---------|-------------|
| `MAX_FETCH_BYTES` | `2000000` | Maximum HTTP response size (2 MB) |
| `FETCH_TIMEOUT_S` | `15` | Timeout in seconds for each URL fetch |
| `MAX_TEXT_CHARS_PER_SOURCE` | `4000` | Maximum extracted characters per source |

## Worker (Scheduler)

| Variable | Default | Description |
|-----------|---------|-------------|
| `WORKER_MAX_WORKERS` | `4` | BackgroundScheduler thread pool size |
| `WATCHLIST_SYNC_INTERVAL_S` | `30` | Interval in seconds for syncing jobs from DB |
| `WATCH_JITTER_MAX_S` | `30` | Maximum random jitter (seconds) before each run to avoid bursts |

## Database

| Variable | Default | Description |
|-----------|---------|-------------|
| `DATABASE_URL` | `postgresql+psycopg://assistant:assistant@postgres:5432/assistant` | SQLAlchemy connection string |
| `POSTGRES_USER` | `assistant` | PostgreSQL user |
| `POSTGRES_PASSWORD` | `assistant` | PostgreSQL password |
| `POSTGRES_DB` | `assistant` | Database name |

## Example `.env`

```env
TZ=Europe/Rome

JWT_SECRET=replace_this_value_with_something_secure
JWT_EXPIRE_HOURS=12

OLLAMA_URL=http://ollama:11434
OLLAMA_MODEL=llama3.2

SEARXNG_URL=http://searxng:8080

RATE_LIMIT_RPM=60

MAX_FETCH_BYTES=2000000
FETCH_TIMEOUT_S=15
MAX_TEXT_CHARS_PER_SOURCE=4000

WORKER_MAX_WORKERS=4
WATCHLIST_SYNC_INTERVAL_S=30
WATCH_JITTER_MAX_S=30

DATABASE_URL=postgresql+psycopg://assistant:assistant@postgres:5432/assistant
POSTGRES_USER=assistant
POSTGRES_PASSWORD=assistant
POSTGRES_DB=assistant
```
