# Manuale Utente - Sentinella

## 1. Panoramica
Sentinella e una web app self-hosted per:
- fare ricerche web aggiornate
- generare un digest in Markdown
- pianificare ricerche ricorrenti con watchlist
- gestire utenti con ruoli `admin` e `user`

Interfacce principali:
- UI Web: `http://localhost:8001`
- API Health: `http://localhost:8001/api/health`

## 2. Prerequisiti
Prima dell'uso assicurati che lo stack sia avviato:

```bash
docker compose up --build
```

Verifica rapida:
- UI raggiungibile su `http://localhost:8001`
- endpoint `GET /api/health` risponde con `{"status":"ok"}`

## 3. Primo Accesso
Credenziali bootstrap predefinite:
- Username: `admin`
- Password: `admin123`

Passi:
1. Apri `http://localhost:8001`.
2. Vai su **Login**.
3. Inserisci le credenziali admin.
4. Dopo il login vieni reindirizzato su **Ask**.

Nota: e consigliato cambiare la password admin il prima possibile.

## 4. Navigazione della UI
Menu disponibile:
- **Ask**: ricerca immediata con digest
- **Watchlist**: regole schedulate personali
- **Runs**: storico esecuzioni
- **Admin Users**: gestione utenti (solo admin)

## 5. Uso di Ask
La pagina **Ask** serve per una ricerca one-shot.

Passi:
1. Inserisci la query nel campo testo.
2. Premi **Run**.
3. Visualizza il digest generato in formato Markdown.

Comportamento:
- i risultati web vengono recuperati e processati
- il digest viene salvato come run storico

## 6. Gestione Watchlist Personale
La pagina **Watchlist** permette di creare ricerche ricorrenti personali.

Campi principali:
- `name`: nome della regola
- `query`: testo ricerca
- `cron`: schedulazione (es. `*/10 * * * *`)

Passi:
1. Compila il form.
2. Premi **Create personal**.
3. Verifica la regola nella lista.
4. Usa **Run now** per esecuzione immediata.

Note operative:
- la watchlist personale e visibile al proprietario e agli admin
- da UI e disponibile la creazione personale; la gestione avanzata puo essere fatta via API

## 7. Watchlist Globali (Admin)
Le watchlist globali sono pensate per l'amministratore e valgono per l'istanza.

Endpoint API principali:
- `POST /api/watchlist/global`
- `PUT /api/watchlist/global/{watch_id}`
- `DELETE /api/watchlist/global/{watch_id}`

Vincoli:
- solo `admin` puo creare/modificare/eliminare watchlist globali
- il run manuale di una watchlist globale e riservato ad admin

## 8. Storico Runs
La pagina **Runs** mostra le ultime esecuzioni.

Per ogni run puoi avere:
- `id`
- `query`
- data/ora creazione
- digest markdown e item elaborati (via API dettaglio)

Visibilita:
- `admin`: vede fino a 100 run globali
- `user`: vede fino a 100 run proprie

## 9. Gestione Utenti (Admin Users)
La pagina **Admin Users** consente all'amministratore di:
- creare nuovi utenti
- assegnare ruolo `user` o `admin`
- verificare lo stato `active`

API aggiuntive utili:
- `GET /api/admin/users`
- `PUT /api/admin/users/{user_id}` (disattivazione o reset password)

## 10. Ruoli e Permessi
`admin`:
- accesso completo a utenti, watchlist e run
- gestione watchlist globali

`user`:
- login e uso Ask
- gestione watchlist personali
- accesso alle proprie run

## 11. Limiti e Sicurezza
- Rate limit applicato su:
  - `POST /api/ask`
  - `POST /api/watchlist/{id}/run`
- autenticazione via JWT Bearer token
- in caso di token non valido la UI forza il ritorno al login

## 12. Troubleshooting Rapido
- **Login non riuscito**: verifica username/password e stato utente attivo.
- **Nessun risultato utile**: prova query piu specifiche o modifica filtri dominio.
- **Watchlist non parte**: controlla cron, stato `enabled` e log worker.
- **Errori 429**: hai superato il rate limit, riprova dopo qualche minuto.
- **Digest assente o vuoto**: controlla connettivita a SearXNG/Ollama e log API/worker.

## 13. Checklist Operativa
- [ ] Login admin funzionante
- [ ] Creazione utente test riuscita
- [ ] Ask produce digest markdown
- [ ] Watchlist personale creata
- [ ] Run now eseguito con successo
- [ ] Runs visibili in storico
