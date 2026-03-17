# Sentinella

Web app self-hosted in LAN per ricerca web intelligente con digest AI, watchlist schedulate e gestione multiutente.

## Avvio rapido

```bash
cp .env.example .env
# Imposta JWT_SECRET in .env
docker compose up --build
```

- UI: `http://localhost:8001`
- Login: `admin` / `admin123`

> Cambiare la password admin al primo accesso.

## Documentazione

Tutta la documentazione si trova nella cartella [`docs/`](docs/):

| Documento | Descrizione |
|-----------|-------------|
| [docs/setup.md](docs/setup.md) | Installazione e avvio |
| [docs/architecture.md](docs/architecture.md) | Architettura e stack tecnologico |
| [docs/configuration.md](docs/configuration.md) | Variabili d'ambiente |
| [docs/api.md](docs/api.md) | Riferimento API REST |
| [docs/data-model.md](docs/data-model.md) | Schema database |
| [docs/user-guide.md](docs/user-guide.md) | Manuale utente |
| [docs/development.md](docs/development.md) | Testing, backup, troubleshooting |
