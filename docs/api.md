# API Reference

Base URL: `http://localhost:8001`

Tutti gli endpoint (tranne `/health` e `/api/auth/login`) richiedono l'header:
```
Authorization: Bearer <access_token>
```

---

## Health

### `GET /health` o `GET /api/health`

Verifica che il servizio API sia attivo.

**Risposta:**
```json
{"status": "ok"}
```

---

## Autenticazione

### `POST /api/auth/login`

Login con username e password.

**Body:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Risposta:**
```json
{
  "access_token": "<jwt_token>",
  "token_type": "bearer"
}
```

---

### `GET /api/me`

Restituisce le informazioni dell'utente corrente.

**Risposta:**
```json
{
  "id": 1,
  "username": "admin",
  "role": "admin",
  "is_active": true,
  "created_at": "2025-01-01T00:00:00"
}
```

---

## Ask (ricerca on-demand)

### `POST /api/ask`

Esegue una ricerca web immediata e genera un digest Markdown.

> Rate limited: `RATE_LIMIT_RPM` richieste al minuto per utente.

**Body:**
```json
{
  "query": "qdrant release changelog",
  "recency_days": 7,
  "max_results": 5,
  "domains_allow": ["github.com", "qdrant.tech"],
  "domains_block": []
}
```

| Campo | Tipo | Default | Descrizione |
|-------|------|---------|-------------|
| `query` | string | — | Query di ricerca (obbligatorio) |
| `recency_days` | int | 7 | Filtra risultati per recency (1=day, 7=week, 30=month, >30=year) |
| `max_results` | int | 5 | Numero massimo di risultati |
| `domains_allow` | list[string] | [] | Solo questi domini (vuoto = tutti) |
| `domains_block` | list[string] | [] | Escludi questi domini |

**Risposta:**
```json
{
  "id": 42,
  "query": "qdrant release changelog",
  "items": [
    {
      "title": "Qdrant v1.x Release Notes",
      "url": "https://github.com/qdrant/qdrant/releases",
      "snippet": "...",
      "text": "..."
    }
  ],
  "digest_md": "## Novità Qdrant\n\n- ...\n\n### Fonti\n[1] ...",
  "created_at": "2025-03-16T10:30:00"
}
```

---

## Watchlist

### `GET /api/watchlist`

Lista tutte le watchlist accessibili all'utente corrente.
- **admin**: vede global + personal di tutti
- **user**: vede global (read-only) + proprie personal

**Risposta:** array di oggetti watchlist.

---

### `POST /api/watchlist/personal`

Crea una nuova watchlist personale.

**Body:**
```json
{
  "name": "Qdrant updates",
  "query": "qdrant release changelog",
  "cron": "0 8 * * *",
  "enabled": true,
  "recency_days": 7,
  "max_results": 5,
  "domains_allow": ["github.com", "qdrant.tech"],
  "domains_block": []
}
```

| Campo | Tipo | Default | Descrizione |
|-------|------|---------|-------------|
| `name` | string | — | Nome descrittivo |
| `query` | string | — | Query di ricerca |
| `cron` | string | `"0 8 * * *"` | Schedulazione cron |
| `enabled` | bool | true | Attiva/disattiva |
| `recency_days` | int | 7 | Filtra per recency |
| `max_results` | int | 5 | Max risultati |
| `domains_allow` | list[string] | [] | Whitelist domini |
| `domains_block` | list[string] | [] | Blacklist domini |

**Risposta:** oggetto watchlist creato.

---

### `PUT /api/watchlist/personal/{id}`

Aggiorna una watchlist personale (solo proprietario o admin).

**Body:** stessi campi di POST (parziale).

---

### `DELETE /api/watchlist/personal/{id}`

Elimina una watchlist personale (solo proprietario o admin).

---

### `POST /api/watchlist/global` *(admin only)*

Crea una watchlist globale. Stessi campi di `/personal`.

---

### `PUT /api/watchlist/global/{id}` *(admin only)*

Aggiorna una watchlist globale.

---

### `DELETE /api/watchlist/global/{id}` *(admin only)*

Elimina una watchlist globale.

---

### `POST /api/watchlist/{id}/run`

Esegue manualmente una watchlist.

> Rate limited. Admin può eseguire qualsiasi watchlist; user solo le proprie personal.

**Risposta:** oggetto run creato (stesso formato di `/api/ask`).

---

## Runs

### `GET /api/runs`

Lista le ultime esecuzioni (max 100).
- **admin**: vede tutti i run
- **user**: vede solo i propri (ask + personal)

**Risposta:**
```json
[
  {
    "id": 42,
    "query": "qdrant release changelog",
    "watch_id": 3,
    "user_id": 1,
    "created_at": "2025-03-16T10:30:00"
  }
]
```

---

### `GET /api/runs/{id}`

Dettaglio completo di un run (include `items` e `digest_md`).

**Risposta:**
```json
{
  "id": 42,
  "query": "qdrant release changelog",
  "watch_id": 3,
  "user_id": 1,
  "items": [...],
  "digest_md": "## ...",
  "created_at": "2025-03-16T10:30:00"
}
```

---

## Admin — Gestione Utenti *(admin only)*

### `POST /api/admin/users`

Crea un nuovo utente.

**Body:**
```json
{
  "username": "mario",
  "password": "password123",
  "role": "user"
}
```

| Campo | Tipo | Valori | Descrizione |
|-------|------|--------|-------------|
| `username` | string | — | Username univoco |
| `password` | string | — | Password in chiaro (hashata con bcrypt) |
| `role` | string | `admin` / `user` | Ruolo |

---

### `GET /api/admin/users`

Lista tutti gli utenti.

---

### `PUT /api/admin/users/{id}`

Aggiorna un utente: può disattivare (`is_active: false`) o resettare la password.

**Body (parziale):**
```json
{
  "is_active": false
}
```
oppure
```json
{
  "password": "nuova_password"
}
```

---

## Matrice permessi

| Endpoint | admin | user |
|----------|:-----:|:----:|
| `POST /api/ask` | ✓ | ✓ |
| `GET /api/watchlist` | ✓ (tutti) | ✓ (global + proprie) |
| `POST /api/watchlist/personal` | ✓ | ✓ |
| `PUT/DELETE /api/watchlist/personal/{id}` | ✓ (tutti) | ✓ (proprie) |
| `POST/PUT/DELETE /api/watchlist/global` | ✓ | ✗ |
| `POST /api/watchlist/{id}/run` | ✓ (tutti) | ✓ (proprie) |
| `GET /api/runs` | ✓ (tutti) | ✓ (propri) |
| `GET /api/runs/{id}` | ✓ | ✓ (propri) |
| `POST/GET/PUT /api/admin/users` | ✓ | ✗ |
