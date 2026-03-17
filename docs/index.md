# Sentinella — Documentazione

**Sentinella** è una web app self-hosted in LAN per ricerca web intelligente con digest AI, watchlist schedulate e gestione multiutente.

## Indice

| Documento | Descrizione |
|-----------|-------------|
| [setup.md](setup.md) | Installazione, avvio con Docker Compose, verifica |
| [architecture.md](architecture.md) | Architettura, servizi, stack tecnologico |
| [configuration.md](configuration.md) | Variabili d'ambiente e configurazione |
| [api.md](api.md) | Riferimento completo API REST |
| [data-model.md](data-model.md) | Schema del database PostgreSQL |
| [user-guide.md](user-guide.md) | Manuale utente (UI e operazioni comuni) |
| [development.md](development.md) | Testing, backup, troubleshooting, sviluppo |

## In breve

```
docker compose up --build
# UI: http://localhost:8001
# Login: admin / admin123
```

> **Attenzione**: cambiare la password admin al primo accesso.
