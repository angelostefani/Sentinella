# User Manual - Sentinella

## 1. Overview
Sentinella is a self-hosted web application for:
- running up-to-date web searches
- generating a Markdown digest
- scheduling recurring searches with watchlists
- managing users with `admin` and `user` roles

Main interfaces:
- Web UI: `http://localhost:8001`
- API Health: `http://localhost:8001/api/health`

## 2. Prerequisites
Before using the application, make sure the stack is running:

```bash
docker compose up --build
```

Quick check:
- UI reachable at `http://localhost:8001`
- `GET /api/health` returns `{"status":"ok"}`

## 3. First Login
Default bootstrap credentials:
- Username: `admin`
- Password: `admin123`

Steps:
1. Open `http://localhost:8001`.
2. Go to **Login**.
3. Enter the admin credentials.
4. After login, you are redirected to **Ask**.

Note: changing the admin password as soon as possible is recommended.

## 4. UI Navigation
Available menu:
- **Ask**: immediate search with digest
- **Watchlist**: scheduled personal rules
- **Runs**: execution history
- **Admin Users**: user management (admin only)

## 5. Using Ask
The **Ask** page is used for a one-shot search.

Steps:
1. Enter the query in the text field.
2. Click **Run**.
3. View the generated digest in Markdown format.

Behavior:
- web results are fetched and processed
- the digest is saved as a historical run

## 6. Managing Personal Watchlists
The **Watchlist** page allows you to create recurring personal searches.

Main fields:
- `name`: rule name
- `query`: search text
- `cron`: schedule expression (for example `*/10 * * * *`)

Steps:
1. Fill in the form.
2. Click **Create personal**.
3. Verify the rule in the list.
4. Use **Run now** for immediate execution.

Operational notes:
- a personal watchlist is visible to its owner and to admins
- the UI supports personal watchlist creation; advanced management can be handled through the API

## 7. Global Watchlists (Admin)
Global watchlists are intended for administrators and apply to the whole instance.

Main API endpoints:
- `POST /api/watchlist/global`
- `PUT /api/watchlist/global/{watch_id}`
- `DELETE /api/watchlist/global/{watch_id}`

Constraints:
- only `admin` can create, edit, or delete global watchlists
- manual execution of a global watchlist is restricted to admins

## 8. Run History
The **Runs** page shows the most recent executions.

For each run you may see:
- `id`
- `query`
- creation date/time
- markdown digest and processed items (via detail API)

Visibility:
- `admin`: can see up to 100 global runs
- `user`: can see up to 100 of their own runs

## 9. User Management (Admin Users)
The **Admin Users** page allows the administrator to:
- create new users
- assign the `user` or `admin` role
- verify the `active` status

Additional useful APIs:
- `GET /api/admin/users`
- `PUT /api/admin/users/{user_id}` (deactivation or password reset)

## 10. Roles and Permissions
`admin`:
- full access to users, watchlists, and runs
- global watchlist management

`user`:
- login and Ask usage
- personal watchlist management
- access to their own runs

## 11. Limits and Security
- Rate limiting is applied to:
  - `POST /api/ask`
  - `POST /api/watchlist/{id}/run`
- authentication uses JWT Bearer tokens
- if the token is invalid, the UI forces a redirect back to login

## 12. Quick Troubleshooting
- **Login failed**: verify username/password and that the user is active.
- **No useful results**: try a more specific query or adjust domain filters.
- **Watchlist does not start**: check cron syntax, `enabled` status, and worker logs.
- **429 errors**: you exceeded the rate limit, try again after a few minutes.
- **Digest missing or empty**: check connectivity to SearXNG/Ollama and API/worker logs.

## 13. Operational Checklist
- [ ] Admin login works
- [ ] Test user creation succeeded
- [ ] Ask produces a markdown digest
- [ ] Personal watchlist created
- [ ] Run now executed successfully
- [ ] Runs visible in history
