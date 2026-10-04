# Toscana Diagnostica · Integration Plan Management

Webapp per la gestione del piano di integrazione post-closing delle società target del processo M&A di Toscana Diagnostica. Sostituisce la pagina HTML autocontenuta (file condiviso / artifact claude.ai) con un database condiviso, lavoro contemporaneo di più utenti, accesso con Microsoft 365 e registro completo delle modifiche. Destinata a `integration.toscanadiagnostica.it`.

## Cosa fa

Per ogni società target: anagrafica, disegno dell'operazione (LOI, preliminare, closing, orizzonte) e GANTT settimanale delle attività di integrazione, costruito dal catalogo comune degli adempimenti (generali e operativi) o con attività su misura. Per ogni attività: owner, support, processo, stato, data fine effettiva, impatto P&L, milestone, dettaglio e note. Cruscotto con avanzamento per target, attività senza owner, carico di lavoro per ruolo e ultime modifiche. Export Excel (con stato completo incorporato, utile come backup portabile), stampa PDF per società o per owner, import e unione da file della versione precedente.

**Lavoro contemporaneo.** Ogni modifica viene salvata subito nel database per singola attività/target, con controllo di versione (optimistic locking): se due persone toccano la stessa riga nello stesso istante, la seconda riceve un avviso e vede la versione dell'altra, mai una sovrascrittura silenziosa. Tutti i client collegati ricevono gli aggiornamenti in tempo reale (Server-Sent Events). Se la rete cade le modifiche restano in coda nel browser e vengono inviate alla riconnessione.

**Registro attività e snapshot.** Ogni modifica è registrata con autore, data, campo e valore prima/dopo. Il piano viene fotografato ogni notte e prima di ogni import, ripristino o eliminazione di target; gli amministratori possono salvare snapshot manuali e ripristinare il piano a uno stato precedente.

**Profili.** Amministratore (utenti, snapshot, import, tutto il piano), Editor (modifica il piano), Sola lettura (consulta, stampa, esporta: investitore, banche).

## Architettura

Stessa impostazione di td-cash-management: `server/` Node.js 22 + Express + PostgreSQL 16 (sessioni su database, Helmet, protezione CSRF, rate limit sul login, audit log); `web/` React 18 + Vite con lo stile condiviso (`web/src/styles.css`); Docker su Render tramite `render.yaml`. Il motore del GANTT (`web/public/ipm-engine.js`) è il codice della webapp originale, con lo strato dati sostituito da API REST + SSE: la logica di pianificazione, il catalogo, i calcoli di workload, export e stampa sono invariati.

## Dati iniziali e migrazione

Il file `server/seed/plan_rev5.json` contiene lo stato dell'artifact claude.ai alla **revisione 5 del 14/09/2026** (6 target, 262 attività di cui 17 completate, 18 ruoli). Al primo avvio su database vuoto viene importato, registrato nel registro attività come "Migrazione iniziale" e fotografato come snapshot. La riconciliazione campo per campo (3.830 valori confrontati, 0 differenze) è in `server/test/reconcile.mjs`.

**Procedura di cut-over consigliata**

1. Deploy su Render con il seed (sotto). Verifica del piano, degli accessi e di una modifica di prova.
2. Se nel frattempo il team ha aggiornato l'artifact: scaricare la pagina dall'artifact (o il suo XLSX) e usare **Unisci da file** (amministratore): le attività con data di modifica più recente aggiornano quelle del database, le altre restano. Viene salvato uno snapshot prima dell'import.
3. Comunicare al team il nuovo indirizzo e congelare l'artifact (banner "spostato su integration.toscanadiagnostica.it").

## Deploy su Render

1. Repository GitHub `tdintegration/td-integration` con questo codice. Su render.com: **New > Blueprint**, collegare il repository: `render.yaml` crea database e applicazione (regione Francoforte, piano Starter + database Basic con backup giornalieri, come td-cash).
2. Nel pannello dell'app, variabili: `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` (sotto) e, facoltativa, `SEED_ADMIN_PASSWORD` (min 12 caratteri: password locale di emergenza per il primo amministratore, da cambiare al primo accesso).
3. Primo avvio: schema, amministratore `francesco.epifani@toscanadiagnostica.it`, import del piano rev 5. L'app risponde su `https://td-integration.onrender.com`.
4. Dominio ufficiale: Settings > Custom Domains > `integration.toscanadiagnostica.it`, record DNS `CNAME integration -> td-integration.onrender.com`, poi `BASE_URL=https://integration.toscanadiagnostica.it` e aggiornamento del redirect URI nella registrazione Entra. Ogni richiesta su un altro host viene reindirizzata al dominio ufficiale.

Il piano Free di Render spegne l'app dopo 15 minuti di inattività (riavvio di ~30 s, connessioni realtime interrotte) e cancella il database dopo 30 giorni: non adatto a uno strumento consultato da investitore e banche.

## Microsoft 365: accesso multi-tenant

A differenza di td-cash (single tenant), qui possono entrare anche account aziendali Microsoft di altre organizzazioni (investitore, banche). L'abilitazione resta però nell'app: chi non appartiene a un dominio auto-abilitato finisce "in attesa" finché un amministratore non gli assegna un profilo.

Registrazione (nuova, separata da td-cash; serve un Global Administrator del tenant TD):

1. Microsoft Entra ID > App registrations > **New registration**: nome "TD Integration Plan", **Accounts in any organizational directory (Any Microsoft Entra ID tenant – Multitenant)**, piattaforma Web, redirect URI `https://td-integration.onrender.com/api/auth/entra/callback` (aggiungere poi `https://integration.toscanadiagnostica.it/api/auth/entra/callback`).
2. Certificates & secrets > New client secret (24 mesi): copiare subito il valore.
3. Token configuration > Add optional claim > ID token > `email`.
4. API permissions: `openid`, `profile`, `email` (User.Read delegato è sufficiente) > Grant admin consent per il tenant TD.
5. Overview: copiare Application (client) ID. Variabili su Render: `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_AUTHORITY=organizations`.
6. Facoltativo: `ENTRA_ALLOWED_TENANTS=<tenant id TD>,<tenant id banca>` per limitare i tenant ammessi; `AUTO_EDITOR_DOMAINS=toscanadiagnostica.it` per i domini abilitati in automatico come Editor.

Gli utenti esterni, al primo accesso, vedono la schermata di consenso Microsoft della propria organizzazione; alcune organizzazioni bloccano le app di terzi: in quel caso l'amministratore TD crea l'utente con metodo "Email e password" (password temporanea mostrata una volta sola, cambio obbligatorio al primo accesso). Gli amministratori accedono solo con Microsoft 365.

## Sviluppo locale

```bash
docker run -d --name tdidb -p 5432:5432 -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=tdintegration postgres:16-alpine
cd server && npm install
DATABASE_URL=postgres://postgres:dev@localhost:5432/tdintegration SEED_ADMIN_EMAIL=tu@esempio.it SEED_ADMIN_PASSWORD=Password-Temporanea-1 npm start
cd web && npm install && npm run dev        # http://localhost:5173, proxy API su :3000
# test end-to-end delle API (server avviato su database vuoto + seed)
cd server && BASE=http://localhost:3000 SEED_ADMIN_EMAIL=tu@esempio.it SEED_ADMIN_PASSWORD=Password-Temporanea-1 npm test
```

In alternativa `cp .env.example .env` e `docker compose up --build` (app su http://localhost:3000).

## API

Tutte sotto `/api`, autenticazione via cookie di sessione, header `X-Requested-With: td-integration` obbligatorio sulle richieste che modificano dati, `X-Client-Id` facoltativo (il client ignora gli eventi generati da sé stesso).

- `auth`: config, login, logout, me, change-password, entra/login, entra/callback
- `plan` (GET): stato completo; `events` (GET, SSE): `activity.updated|created|deleted`, `activities.reordered`, `target.updated|created|deleted`, `team.updated`, `plan.replaced`
- `targets` POST; `targets/:id` PATCH (con `version`, 409 + `current` in caso di conflitto) / DELETE; `targets/:id/order` PUT
- `targets/:id/activities` POST; `targets/:id/activities/:aid` PATCH (con `version`) / DELETE
- `team` PUT (elenco completo)
- `plan/import` POST (admin: merge per data di modifica, snapshot automatico prima)
- `snapshots` GET/POST, `snapshots/:id` GET, `snapshots/:id/restore` POST (admin)
- `audit` GET (`?target=&action=&limit=`)
- `users` GET/POST, `users/:id` PUT, `users/:id/reset-password` POST (admin)

## Sicurezza

Sessioni httpOnly/SameSite su database, cookie `secure` in produzione, CSRF via header custom, rate limit e blocco temporaneo dopo 5 tentativi di login, password min 12 caratteri con hash bcrypt, verifica dell'ID token Microsoft (firma JWKS, audience, nonce, issuer coerente con il tenant), CSP restrittiva (il motore GANTT richiede `unsafe-inline` per handler e stili inline), redirect al dominio canonico, disabilitazione di un utente che revoca immediatamente le sue sessioni. Il piano contiene dati personali (nomi di dipendenti delle target nei dettagli attività): accesso tracciato per utente, profili di sola lettura per gli esterni.
