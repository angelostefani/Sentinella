# Sentinella — Documentation

**Sentinella** is a self-hosted LAN web app for intelligent web search, AI digests, scheduled watchlists, and multi-user management.

## Index

| Document | Description |
|-----------|-------------|
| [setup.md](setup.md) | Installation, Docker Compose startup, and verification |
| [architecture.md](architecture.md) | Architecture, services, and technology stack |
| [configuration.md](configuration.md) | Environment variables and configuration |
| [api.md](api.md) | Complete REST API reference |
| [data-model.md](data-model.md) | PostgreSQL database schema |
| [user-guide.md](user-guide.md) | User guide (UI and common operations) |
| [development.md](development.md) | Testing, backup, troubleshooting, and development |

## At a Glance

```bash
docker compose up --build
# UI: http://localhost:8001
# Login: admin / admin123
```

> **Warning**: change the admin password on first login.
