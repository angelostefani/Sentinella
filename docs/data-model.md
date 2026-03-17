# Modello Dati

Il database è PostgreSQL 16. Le tabelle vengono create automaticamente da SQLAlchemy con `Base.metadata.create_all` all'avvio dell'API (nessuna migrazione).

## Tabelle

### `users`

| Colonna | Tipo | Note |
|---------|------|------|
| `id` | INTEGER PK | Auto-increment |
| `username` | VARCHAR UNIQUE | Username univoco |
| `password_hash` | VARCHAR | Hash bcrypt |
| `role` | VARCHAR | `admin` o `user` |
| `is_active` | BOOLEAN | Default `true` |
| `created_at` | TIMESTAMP | Ora creazione |

**Bootstrap**: se la tabella è vuota all'avvio, viene creato automaticamente `admin` / `admin123`.

---

### `watchlist`

| Colonna | Tipo | Note |
|---------|------|------|
| `id` | INTEGER PK | — |
| `name` | VARCHAR | Nome descrittivo |
| `query` | TEXT | Query di ricerca |
| `cron` | VARCHAR | Espressione cron (es. `"0 8 * * *"`) |
| `enabled` | BOOLEAN | Default `true` |
| `scope` | VARCHAR | `global` o `personal` |
| `owner_user_id` | INTEGER FK `users.id` | NULL per global |
| `recency_days` | INTEGER | Default 7 |
| `max_results` | INTEGER | Default 5 |
| `domains_allow` | JSONB | Lista domini whitelist |
| `domains_block` | JSONB | Lista domini blacklist |
| `created_at` | TIMESTAMP | — |

**Indici**: `scope`, `owner_user_id`

---

### `runs`

| Colonna | Tipo | Note |
|---------|------|------|
| `id` | INTEGER PK | — |
| `watch_id` | INTEGER FK `watchlist.id` | NULL per run da `/api/ask` |
| `user_id` | INTEGER FK `users.id` | NULL per run di watch globali |
| `query` | TEXT | Query usata |
| `items` | JSONB | Array di `{title, url, snippet, text}` |
| `digest_md` | TEXT | Digest Markdown generato da Ollama |
| `created_at` | TIMESTAMP | — |

**Indici**: `watch_id`, `user_id`

---

### `seen_items`

| Colonna | Tipo | Note |
|---------|------|------|
| `id` | INTEGER PK | — |
| `watch_id` | INTEGER FK `watchlist.id` | — |
| `url_hash` | VARCHAR | SHA256 dell'URL |
| `url` | TEXT | URL originale |
| `first_seen` | TIMESTAMP | Prima volta visto |

**Indice UNIQUE**: `(watch_id, url_hash)` — garantisce deduplicazione per watch.

**Scopo**: evitare di includere nei digest URL già processati nelle esecuzioni precedenti della stessa watch.

---

## Relazioni

```
users (1) ──< watchlist (personal, owner_user_id)
users (1) ──< runs (user_id)
watchlist (1) ──< runs (watch_id)
watchlist (1) ──< seen_items (watch_id)
```

## Backup

```bash
# Dump manuale
docker compose exec -T postgres pg_dump -U assistant assistant > backup.sql

# Ripristino
docker compose exec -T postgres psql -U assistant assistant < backup.sql
```

Esempio cron giornaliero sull'host:
```bash
0 2 * * * cd /path/to/sentinella && docker compose exec -T postgres pg_dump -U assistant assistant > /backup/sentinella_$(date +\%F).sql
```
