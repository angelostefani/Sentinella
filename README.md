# Sentinella

Sentinella e una web app self-hosted in LAN per ricerca web aggiornata via SearXNG, digest markdown con Ollama locale, watchlist schedulate e gestione multiutente con JWT.

## Servizi Docker

- nginx: UI + reverse proxy `/api/*`
- frontend_build: build one-shot Vite React
- api: FastAPI
- worker: APScheduler
- postgres: persistenza
- ollama: LLM locale
- ollama_init: pull modello all'avvio
- searxng + searxng_redis: ricerca web JSON

## Setup

1. Copia `.env.example` in `.env`
2. Imposta almeno `JWT_SECRET`
3. Avvia stack:

```bash
docker compose up --build
```

Endpoint attesi:

- UI: `http://localhost:8001`
- API health: `http://localhost:8001/api/health`

Credenziali bootstrap:

- username: `admin`
- password: `admin123`

## How to test (curl)

Base URL:

```bash
export BASE="http://localhost:8001"
```

1. Health

```bash
curl -s "$BASE/api/health"
```

2. Login admin

```bash
curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

3. Salva token admin

```bash
export TOKEN="INCOLLA_TOKEN_ADMIN"
```

4. Verifica /api/me

```bash
curl -s "$BASE/api/me" -H "Authorization: Bearer $TOKEN"
```

5. Crea utente

```bash
curl -s -X POST "$BASE/api/admin/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"angelo","password":"password123","role":"user"}'
```

6. Login user

```bash
curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"angelo","password":"password123"}'
```

```bash
export TOKEN_USER="INCOLLA_TOKEN_USER"
```

7. Crea watch personale con cron test ogni 10 minuti

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

8. Lista watchlist

```bash
curl -s "$BASE/api/watchlist" -H "Authorization: Bearer $TOKEN_USER"
```

9. Run now

```bash
export WATCH_ID="INCOLLA_ID"
curl -s -X POST "$BASE/api/watchlist/$WATCH_ID/run" \
  -H "Authorization: Bearer $TOKEN_USER"
```

10. Lista runs

```bash
curl -s "$BASE/api/runs" -H "Authorization: Bearer $TOKEN_USER"
```

11. Dettaglio run

```bash
export RUN_ID="INCOLLA_RUN_ID"
curl -s "$BASE/api/runs/$RUN_ID" -H "Authorization: Bearer $TOKEN_USER"
```

12. Verifica scheduler worker

```bash
docker compose logs -f worker
```

13. Verifica SearXNG JSON

```bash
docker compose exec api python -c "import os,httpx;print(httpx.get(os.getenv('SEARXNG_URL') + '/search', params={'q':'test','format':'json'}).status_code)"
```

14. Verifica Ollama

```bash
curl -s "http://localhost:11434/api/tags"
```

## Rate limiting

Endpoint protetti:

- `POST /api/ask`
- `POST /api/watchlist/{id}/run`

Configurazione: `RATE_LIMIT_RPM`.

## Backup strategy

Backup manuale:

```bash
docker compose exec -T postgres pg_dump -U assistant assistant > backup.sql
```

Esempio job giornaliero host:

```bash
0 2 * * * docker compose exec -T postgres pg_dump -U assistant assistant > /path/to/backups/sentinella_$(date +\%F).sql
```

## Troubleshooting

- API 404 via nginx: controlla `nginx/nginx.conf` proxy `/api/`
- Scheduler fermo: verifica watch enabled + cron valido + log worker
- JSON SearXNG non attivo: verifica mount `searxng/settings.yml`
- Ollama lento al primo avvio: attesa pull modello da `ollama_init`

## Checklist finale test

- [ ] `docker compose up --build` completo
- [ ] UI raggiungibile su `http://localhost:8001`
- [ ] API health `http://localhost:8001/api/health`
- [ ] Login admin funzionante
- [ ] Creazione watch personale con `*/10 * * * *`
- [ ] Worker produce runs schedulati
- [ ] SearXNG ricerca JSON `200`
- [ ] Digest Ollama valorizza `digest_md`
