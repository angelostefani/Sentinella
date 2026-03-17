# Configurazione

Tutte le variabili d'ambiente sono definite nel file `.env` (partire da `.env.example`).

## Variabili obbligatorie

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `JWT_SECRET` | — | Segreto HMAC per la firma JWT. **Non ha default — deve essere impostato.** |

## Generali

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `TZ` | `Europe/Rome` | Timezone per cron, log e scheduler. Non hardcoded nel codice. |

## Autenticazione JWT

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `JWT_SECRET` | — | Segreto per firma HS256 |
| `JWT_EXPIRE_HOURS` | `12` | Durata del token in ore |

## Ollama (LLM)

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `OLLAMA_URL` | `http://ollama:11434` | URL del servizio Ollama |
| `OLLAMA_MODEL` | `llama3.2` | Modello da usare per il digest |

## SearXNG (ricerca)

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `SEARXNG_URL` | `http://searxng:8080` | URL del servizio SearXNG |

## Rate limiting

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `RATE_LIMIT_RPM` | `60` | Massimo richieste al minuto per `POST /api/ask` e `POST /api/watchlist/{id}/run` |

> Il rate limiter è in-memory (per processo). Per produzione multi-istanza considerare Redis.

## Limiti fetch/extract

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `MAX_FETCH_BYTES` | `2000000` | Dimensione massima risposta HTTP (2 MB) |
| `FETCH_TIMEOUT_S` | `15` | Timeout in secondi per ogni fetch URL |
| `MAX_TEXT_CHARS_PER_SOURCE` | `4000` | Caratteri massimi estratti per fonte |

## Worker (scheduler)

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `WORKER_MAX_WORKERS` | `4` | Thread pool del BackgroundScheduler |
| `WATCHLIST_SYNC_INTERVAL_S` | `30` | Intervallo in secondi per sincronizzare job da DB |
| `WATCH_JITTER_MAX_S` | `30` | Jitter casuale massimo (secondi) prima di ogni run per evitare burst |

## Database

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `DATABASE_URL` | `postgresql+psycopg://assistant:assistant@postgres:5432/assistant` | SQLAlchemy connection string |
| `POSTGRES_USER` | `assistant` | Utente PostgreSQL |
| `POSTGRES_PASSWORD` | `assistant` | Password PostgreSQL |
| `POSTGRES_DB` | `assistant` | Nome database |

## Esempio `.env`

```env
TZ=Europe/Rome

JWT_SECRET=cambia_questo_valore_con_qualcosa_di_sicuro
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
