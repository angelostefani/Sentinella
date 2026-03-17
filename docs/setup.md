# Setup e Installazione

## Prerequisiti

- Docker Engine 24+
- Docker Compose v2
- Almeno 4 GB di RAM (Ollama + PostgreSQL + servizi)
- Porta `8001` libera sull'host

## Avvio rapido

1. Copia il file di configurazione d'esempio:

```bash
cp .env.example .env
```

2. Imposta almeno `JWT_SECRET` nel file `.env`:

```bash
JWT_SECRET=cambia_questo_valore_segreto
```

3. Avvia lo stack completo:

```bash
docker compose up --build
```

> Il primo avvio scarica il modello Ollama (es. `llama3.2` ~2 GB). Il servizio `ollama_init` si occupa del pull automatico.

## Verifica avvio

| Check | Comando |
|-------|---------|
| UI raggiungibile | Apri `http://localhost:8001` nel browser |
| API health | `curl http://localhost:8001/api/health` → `{"status":"ok"}` |
| Login admin | Vedi sotto |

## Primo login

- **URL**: `http://localhost:8001`
- **Username**: `admin`
- **Password**: `admin123`

> Cambiare la password admin tramite l'API al primo accesso:
> ```bash
> curl -X PUT http://localhost:8001/api/admin/users/1 \
>   -H "Authorization: Bearer $TOKEN" \
>   -H "Content-Type: application/json" \
>   -d '{"password":"nuova_password_sicura"}'
> ```

## Servizi Docker

| Servizio | Ruolo | Porta interna |
|----------|-------|---------------|
| `nginx` | UI React + reverse proxy `/api/` | 80 → host:8001 |
| `frontend_build` | Build one-shot React/Vite | — |
| `api` | FastAPI — REST API | 8000 |
| `worker` | APScheduler — watchlist schedulate | — |
| `postgres` | Database PostgreSQL 16 | 5432 |
| `ollama` | LLM locale (digest Markdown) | 11434 |
| `ollama_init` | Pull modello one-shot all'avvio | — |
| `searxng` | Meta-search engine JSON | 8080 |
| `searxng_redis` | Cache Redis per SearXNG | 6379 |

## Arresto e pulizia

```bash
# Arresto (mantiene volumi/dati)
docker compose down

# Arresto e rimozione volumi (reset completo)
docker compose down -v
```

## Aggiornamento

```bash
docker compose down
git pull
docker compose up --build
```
