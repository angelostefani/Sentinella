# API Reference

Base URL: `http://localhost:8001`

All endpoints except `/health` and `/api/auth/login` require this header:
```
Authorization: Bearer <access_token>
```

---

## Health

### `GET /health` or `GET /api/health`

Checks that the API service is running.

**Response:**
```json
{"status": "ok"}
```

---

## Authentication

### `POST /api/auth/login`

Login with username and password.

**Body:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response:**
```json
{
  "access_token": "<jwt_token>",
  "token_type": "bearer"
}
```

---

### `GET /api/me`

Returns information about the current user.

**Response:**
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

## Ask (On-Demand Search)

### `POST /api/ask`

Runs an immediate web search and generates a Markdown digest.

> Rate limited: `RATE_LIMIT_RPM` requests per minute per user.

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

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | string | — | Search query (required) |
| `recency_days` | int | 7 | Filters results by recency (1=day, 7=week, 30=month, >30=year) |
| `max_results` | int | 5 | Maximum number of results |
| `domains_allow` | list[string] | [] | Only these domains (empty = all) |
| `domains_block` | list[string] | [] | Exclude these domains |

**Response:**
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
  "digest_md": "## Qdrant Updates\n\n- ...\n\n### Sources\n[1] ...",
  "created_at": "2025-03-16T10:30:00"
}
```

---

## Watchlist

### `GET /api/watchlist`

Lists all watchlists accessible to the current user.
- **admin**: sees global + personal watchlists for all users
- **user**: sees global (read-only) + their own personal watchlists

**Response:** array of watchlist objects.

---

### `POST /api/watchlist/personal`

Creates a new personal watchlist.

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

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | — | Descriptive name |
| `query` | string | — | Search query |
| `cron` | string | `"0 8 * * *"` | Cron schedule |
| `enabled` | bool | true | Enable/disable |
| `recency_days` | int | 7 | Recency filter |
| `max_results` | int | 5 | Max results |
| `domains_allow` | list[string] | [] | Domain whitelist |
| `domains_block` | list[string] | [] | Domain blacklist |

**Response:** created watchlist object.

---

### `PUT /api/watchlist/personal/{id}`

Updates a personal watchlist (owner or admin only).

**Body:** same fields as POST (partial).

---

### `DELETE /api/watchlist/personal/{id}`

Deletes a personal watchlist (owner or admin only).

---

### `POST /api/watchlist/global` *(admin only)*

Creates a global watchlist. Same fields as `/personal`.

---

### `PUT /api/watchlist/global/{id}` *(admin only)*

Updates a global watchlist.

---

### `DELETE /api/watchlist/global/{id}` *(admin only)*

Deletes a global watchlist.

---

### `POST /api/watchlist/{id}/run`

Runs a watchlist manually.

> Rate limited. Admin can run any watchlist; users can only run their own personal watchlists.

**Response:** created run object (same format as `/api/ask`).

---

## Runs

### `GET /api/runs`

Lists recent executions (max 100).
- **admin**: sees all runs
- **user**: sees only their own runs (Ask + personal watchlists)

**Response:**
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

Full run detail (includes `items` and `digest_md`).

**Response:**
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

## Admin — User Management *(admin only)*

### `POST /api/admin/users`

Creates a new user.

**Body:**
```json
{
  "username": "mario",
  "password": "password123",
  "role": "user"
}
```

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `username` | string | — | Unique username |
| `password` | string | — | Plain password (hashed with bcrypt) |
| `role` | string | `admin` / `user` | Role |

---

### `GET /api/admin/users`

Lists all users.

---

### `PUT /api/admin/users/{id}`

Updates a user: can deactivate (`is_active: false`) or reset the password.

**Body (partial):**
```json
{
  "is_active": false
}
```
or
```json
{
  "password": "new_password"
}
```

---

## Permission Matrix

| Endpoint | admin | user |
|----------|:-----:|:----:|
| `POST /api/ask` | ✓ | ✓ |
| `GET /api/watchlist` | ✓ (all) | ✓ (global + own) |
| `POST /api/watchlist/personal` | ✓ | ✓ |
| `PUT/DELETE /api/watchlist/personal/{id}` | ✓ (all) | ✓ (own) |
| `POST/PUT/DELETE /api/watchlist/global` | ✓ | ✗ |
| `POST /api/watchlist/{id}/run` | ✓ (all) | ✓ (own) |
| `GET /api/runs` | ✓ (all) | ✓ (own) |
| `GET /api/runs/{id}` | ✓ | ✓ (own) |
| `POST/GET/PUT /api/admin/users` | ✓ | ✗ |
