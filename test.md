Smoke test API/UI
    Apri http://localhost:8001
    Verifica http://localhost:8001/api/health → {"status":"ok"}
Auth e ruoli
    Login admin (admin/admin123)
    Crea utente user
    Login come user e verifica che /admin/users sia bloccata (403 o UI non accessibile)
Watchlist permessi
    Da admin crea una watch global
    Da user verifica che la veda ma non possa modificarla/cancellarla/run-now
    Da user crea una watch personal e verifica CRUD completo
Ask end-to-end
    Esegui POST /api/ask con query reale
    Controlla che il run abbia watch_id = null, user_id = me, digest_md non vuoto
    Run now + Runs visibility
    Da user esegui run now su watch personale
    Verifica che appaia in /api/runs
    Da admin verifica che veda anche i run degli altri utenti
    Da user verifica che non veda run di altri
Scheduler reale
    Crea watch personale con cron */10 * * * *
    Attendi il tick e monitora docker compose logs -f worker
    Verifica run automatico creato senza chiamata manuale
Filtri dominio
    domains_allow=["github.com"] e query generica: risultati solo github
    domains_block=["github.com"]: github assente
    Prova wildcard *.example.com
Recency mapping
    Test recency_days=1,7,30,31
    Verifica nei log/query che mappi a day/week/month/year
Rate limiting
    Lancia molte POST /api/ask in 1 minuto (script loop)
    Attendi risposta 429 oltre soglia RATE_LIMIT_RPM
Failure tests utili
    Spegni ollama e prova ask/run now (errore gestito, no crash API)
    Spegni searxng e verifica comportamento errore
    Riaccendi servizi e verifica recovery
Data persistence
    Crea utenti/watch/runs
    docker compose down e poi up -d
    Verifica dati ancora presenti (volume Postgres)
Security sanity
    Chiamata API senza token → 401
    Token malformato/scaduto → 401
    User non admin su endpoint admin → 403
    Se vuoi, nel prossimo step ti preparo uno script unico (PowerShell) che esegue automaticamente questi test e stampa PASS/FAIL.


