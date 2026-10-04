# tools/

- `source_artifact_rev5.html` — pagina autocontenuta originale (artifact claude.ai, rev 5 del 14/09/2026): fonte della migrazione.
- `source_state_rev5.json` — stato JSON estratto dal blocco `td-embed` della pagina.
- `source_main.js` — logica applicativa originale estratta dalla pagina.
- `make_engine.py` — trasformazione riproducibile da `source_main.js` a `web/public/ipm-engine.js` (strato dati REST + SSE, modalità sola lettura, rimozione del salvataggio su file). Eseguire da root: `python3 tools/make_engine.py`, poi riapplicare le due correzioni manuali documentate in fondo al file.
- `server/test/reconcile.mjs` — riconciliazione campo per campo tra database e `source_state_rev5.json`.
