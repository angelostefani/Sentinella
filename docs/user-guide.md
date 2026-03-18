# User Guide

## Access

1. Open `http://localhost:8001` in your browser.
2. Enter your credentials and click **Login**.
3. Default credentials: `admin` / `admin123` — change them immediately.

After login you are redirected to the **Ask** page.

---

## Navigation

| Page | Route | Access |
|--------|----------|---------|
| Ask | `/ask` | Everyone |
| Watchlist | `/watchlist` | Everyone |
| Runs | `/runs` | Everyone |
| Admin Users | `/admin/users` | Admin only |

---

## Ask — Immediate Search

The **Ask** page runs a one-shot web search and generates a Markdown digest.

**Steps:**
1. Enter the query in the text field.
2. Optionally adjust advanced filters if needed.
3. Click **Run**.
4. Wait for the digest — it may take a few seconds depending on Ollama.

**What happens internally:**
- The query is sent to SearXNG
- Results are fetched and text is extracted
- Ollama generates a Markdown summary with cited sources
- The run is saved in the history

---

## Watchlist — Scheduled Searches

### Personal Watchlists

These are recurring searches managed by each user for their own account.

**Create a personal watchlist:**
1. Go to **Watchlist**.
2. Fill in the form:
   - **Name**: descriptive name
   - **Query**: search text
   - **Cron**: schedule (for example `0 8 * * *` = every day at 8)
   - **Recency days**: how many days back to search
   - **Max results**: maximum number of results
   - **Domains allow**: domains to include (comma-separated)
   - **Domains block**: domains to exclude
3. Click **Create personal**.

**Run manually:**
- Use the **Run now** button next to the watchlist.

**Cron syntax examples:**

| Cron | Meaning |
|------|-------------|
| `0 8 * * *` | Every day at 08:00 |
| `0 9 * * 1` | Every Monday at 09:00 |
| `*/10 * * * *` | Every 10 minutes (for testing) |
| `0 8 * * 1-5` | Every weekday at 08:00 |

### Global Watchlists (admin)

Managed only by the admin through the API. Visible to all users in read-only mode.

---

## Runs — Execution History

The **Runs** page shows the latest 100 executions.

For each run you can access:
- ID and query
- Execution date/time
- Full detail with digest and source list (via API: `GET /api/runs/{id}`)

**Visibility:**
- **admin**: sees all runs
- **user**: sees only their own runs (from Ask + personal watchlists)

---

## Admin Users (admin only)

The **Admin Users** page allows you to:
- Create new users with role `admin` or `user`
- View the user list
- Deactivate a user or reset their password (via API)

---

## Roles and Permissions

| Action | admin | user |
|--------|:-----:|:----:|
| Ask search | ✓ | ✓ |
| View global watchlists | ✓ | ✓ (read-only) |
| Create personal watchlists | ✓ | ✓ |
| Edit own watchlists | ✓ | ✓ |
| Create/edit global watchlists | ✓ | ✗ |
| Run now (own watchlists) | ✓ | ✓ |
| Run now (all watchlists) | ✓ | ✗ |
| View all runs | ✓ | ✗ |
| Manage users | ✓ | ✗ |

---

## Troubleshooting

| Problem | Likely Cause | Solution |
|----------|-----------------|-----------|
| Login failed | Wrong credentials or deactivated user | Verify username/password; contact admin |
| No results | Query too generic or restrictive filters | Refine the query or remove domain filters |
| Watchlist does not run | Invalid cron, `enabled=false`, worker stopped | Check cron syntax, enabled status, worker logs |
| Error 429 | Rate limit exceeded | Wait a few minutes |
| Missing digest | SearXNG or Ollama unreachable | Check `docker compose logs api worker` |
| Blank UI or JS errors | Stale browser cache | Reload with Ctrl+Shift+R |

---

## Operational Checklist

- [ ] Admin login works
- [ ] Test user created
- [ ] Ask produces a Markdown digest
- [ ] Personal watchlist created with cron `*/10 * * * *`
- [ ] Run now executed successfully
- [ ] Run visible in history
- [ ] Worker produces scheduled runs automatically
