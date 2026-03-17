# Manuale Utente

## Accesso

1. Apri `http://localhost:8001` nel browser.
2. Inserisci le credenziali e premi **Login**.
3. Credenziali default: `admin` / `admin123` — cambiarle subito.

Dopo il login sei reindirizzato alla pagina **Ask**.

---

## Navigazione

| Pagina | Percorso | Accesso |
|--------|----------|---------|
| Ask | `/ask` | Tutti |
| Watchlist | `/watchlist` | Tutti |
| Runs | `/runs` | Tutti |
| Admin Users | `/admin/users` | Solo admin |

---

## Ask — Ricerca immediata

La pagina **Ask** esegue una ricerca web one-shot e genera un digest Markdown.

**Passaggi:**
1. Inserisci la query nel campo testo.
2. (Opzionale) Modifica i filtri avanzati se necessario.
3. Premi **Run**.
4. Attendi il digest — può richiedere qualche secondo (dipende da Ollama).

**Cosa succede internamente:**
- La query viene inviata a SearXNG
- I risultati vengono scaricati e il testo estratto
- Ollama genera un riassunto in Markdown con fonti citate
- Il run viene salvato nello storico

---

## Watchlist — Ricerche schedulate

### Watchlist personali

Sono ricerche ricorrenti gestite da ogni utente per sé stesso.

**Creare una watchlist personale:**
1. Vai su **Watchlist**.
2. Compila il form:
   - **Name**: nome descrittivo
   - **Query**: testo della ricerca
   - **Cron**: schedulazione (es. `0 8 * * *` = ogni giorno alle 8)
   - **Recency days**: quanti giorni indietro cercare
   - **Max results**: numero massimo di risultati
   - **Domains allow**: domini da includere (separati da virgola)
   - **Domains block**: domini da escludere
3. Premi **Create personal**.

**Eseguire manualmente:**
- Usa il pulsante **Run now** accanto alla watchlist.

**Sintassi cron (esempi):**

| Cron | Significato |
|------|-------------|
| `0 8 * * *` | Ogni giorno alle 8:00 |
| `0 9 * * 1` | Ogni lunedì alle 9:00 |
| `*/10 * * * *` | Ogni 10 minuti (per test) |
| `0 8 * * 1-5` | Ogni giorno feriale alle 8:00 |

### Watchlist globali (admin)

Gestite solo dall'admin tramite API. Visibili a tutti gli utenti in read-only.

---

## Runs — Storico esecuzioni

La pagina **Runs** mostra le ultime 100 esecuzioni.

Per ogni run è disponibile:
- ID e query
- Data/ora di esecuzione
- Dettaglio completo con digest e lista fonti (via API: `GET /api/runs/{id}`)

**Visibilità:**
- **admin**: vede tutti i run
- **user**: vede solo i propri (da Ask + watchlist personali)

---

## Admin Users (solo admin)

La pagina **Admin Users** permette di:
- Creare nuovi utenti con ruolo `admin` o `user`
- Vedere l'elenco degli utenti
- Disattivare o resettare la password di un utente (via API)

---

## Ruoli e permessi

| Azione | admin | user |
|--------|:-----:|:----:|
| Ricerca Ask | ✓ | ✓ |
| Vedere watchlist globali | ✓ | ✓ (read-only) |
| Creare watchlist personali | ✓ | ✓ |
| Modificare proprie watchlist | ✓ | ✓ |
| Creare/modificare watchlist globali | ✓ | ✗ |
| Eseguire Run now (proprie) | ✓ | ✓ |
| Eseguire Run now (tutte) | ✓ | ✗ |
| Vedere tutti i run | ✓ | ✗ |
| Gestire utenti | ✓ | ✗ |

---

## Troubleshooting

| Problema | Causa probabile | Soluzione |
|----------|-----------------|-----------|
| Login non riuscito | Credenziali errate o utente disattivato | Verifica username/password; contatta admin |
| Nessun risultato | Query troppo generica o filtri restrittivi | Modifica query o rimuovi filtri dominio |
| Watchlist non esegue | Cron errato, `enabled=false`, worker fermo | Controlla cron syntax, stato enabled, log worker |
| Errore 429 | Rate limit superato | Attendi qualche minuto |
| Digest assente | SearXNG o Ollama non raggiungibili | Verifica `docker compose logs api worker` |
| UI bianca o errori JS | Cache browser obsoleta | Ricarica con Ctrl+Shift+R |

---

## Checklist operativa

- [ ] Login admin funzionante
- [ ] Creazione utente test
- [ ] Ask produce digest Markdown
- [ ] Watchlist personale creata con cron `*/10 * * * *`
- [ ] Run now eseguito con successo
- [ ] Run visibile nello storico
- [ ] Worker produce run schedulati automatici
