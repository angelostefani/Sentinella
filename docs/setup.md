# Setup and Installation

## Prerequisites

- Docker Engine 24+
- Docker Compose v2
- At least 4 GB of RAM (Ollama + PostgreSQL + services)
- Port `8001` available on the host

## Quick Start

1. Copy the example configuration file:

```bash
cp .env.example .env
```

2. Set at least `JWT_SECRET` in `.env`:

```bash
JWT_SECRET=change_this_secret_value
```

3. Start the full stack:

```bash
docker compose up --build
```

> On first startup, the Ollama model is downloaded automatically (for example `llama3.2`, about 2 GB). The `ollama_init` service handles the pull.

## Startup Verification

| Check | Command |
|-------|---------|
| UI reachable | Open `http://localhost:8001` in the browser |
| API health | `curl http://localhost:8001/api/health` → `{"status":"ok"}` |
| Admin login | See below |

## First Login

- **URL**: `http://localhost:8001`
- **Username**: `admin`
- **Password**: `admin123`

> Change the admin password via API on first login:
> ```bash
> curl -X PUT http://localhost:8001/api/admin/users/1 \
>   -H "Authorization: Bearer $TOKEN" \
>   -H "Content-Type: application/json" \
>   -d '{"password":"new_secure_password"}'
> ```

## Docker Services

| Service | Role | Internal Port |
|----------|-------|---------------|
| `nginx` | React UI + `/api/` reverse proxy | 80 → host:8001 |
| `frontend_build` | One-shot React/Vite build | — |
| `api` | FastAPI — REST API | 8000 |
| `worker` | APScheduler — scheduled watchlists | — |
| `postgres` | PostgreSQL 16 database | 5432 |
| `ollama` | Local LLM (Markdown digests) | 11434 |
| `ollama_init` | One-shot model pull at startup | — |
| `searxng` | JSON meta-search engine | 8080 |
| `searxng_redis` | Redis cache for SearXNG | 6379 |

## Stop and Cleanup

```bash
# Stop (keeps volumes/data)
docker compose down

# Stop and remove volumes (full reset)
docker compose down -v
```

## Update

```bash
docker compose down
git pull
docker compose up --build
```
