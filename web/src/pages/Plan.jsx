import React, { useEffect, useRef, useState, useContext } from 'react';
import { api } from '../api.js';
import { useAuth, canEdit } from '../auth.jsx';
import { useToast, Loading, ErrorBox } from '../components/ui.jsx';
import { PlanCtx } from '../App.jsx';

// Carica una sola volta il motore GANTT (script classico: usa handler inline e funzioni globali)
let enginePromise = null;
function loadEngine() {
  if (window.IPM) return Promise.resolve();
  if (enginePromise) return enginePromise;
  enginePromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/ipm-engine.js?v=1';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Impossibile caricare il motore del piano'));
    document.head.appendChild(s);
  });
  return enginePromise;
}

export default function Plan() {
  const { user } = useAuth();
  const toast = useToast();
  const { setPlan } = useContext(PlanCtx);
  const root = useRef(null);
  const [state, setState] = useState({ loading: true, error: null });
  const [lang, setLang] = useState('it');

  useEffect(() => {
    let alive = true;
    loadEngine().then(() => {
      if (!alive) return;
      window.__TDI_CLIENT_ID = window.IPM.clientId;
      return window.IPM.mount({
        api: { get: api.get, post: api.post, put: api.put, patch: api.patch, del: api.del },
        user,
        readOnly: !canEdit(user),
        onToast: (msg, kind) => toast(msg, kind === 'err' ? 'err' : 'ok'),
        onState: (s) => setPlan((p) => ({ ...p, ...s })),
      });
    }).then(() => { if (alive) { setLang(window.IPM.getLang()); setState({ loading: false, error: null }); } })
      .catch((e) => { if (alive) setState({ loading: false, error: e }); });
    return () => { alive = false; window.IPM?.unmount(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchLang = (l) => { window.IPM?.setLang(l); setLang(l); };

  return (
    <div className="page ipm" id="ipm-root">
      <div className="page-head">
        <div>
          <h1>Integration Plan Management</h1>
          <div className="sub">{lang === 'it' ? 'Gestione e coordinamento del piano di integrazione post closing · Target Phase 1. Ogni modifica viene salvata subito e condivisa con il team in tempo reale.' : 'Post-closing integration plan management · Target Phase 1. Every change is saved immediately and shared with the team in real time.'}</div>
        </div>
        <div className="lang"><button id="lang-it" className={lang === 'it' ? 'on' : ''} onClick={() => switchLang('it')}>IT</button><button id="lang-en" className={lang === 'en' ? 'on' : ''} onClick={() => switchLang('en')}>EN</button></div>
      </div>
      <ErrorBox error={state.error} />
      {state.loading && !state.error && <Loading text="Caricamento del piano…" />}
      <nav className="nav" id="nav" />
      <div id="td-banner" />
      <div id="main" />
      <datalist id="ownlist" />
      <input type="file" id="impfile" accept=".xlsx,.json" style={{ display: 'none' }} />
      <input type="file" id="mrgfile" accept=".html,.htm,.xlsx,.json" style={{ display: 'none' }} />
      <div className="ipm-modal" id="printmodal">
        <div className="mbox">
          <h3 id="pm_t">Stampa PDF</h3>
          <div className="mrow"><div className="fld"><label id="pm_l1">Perimetro</label>
            <select id="pr_scope" defaultValue="this"><option value="this" id="pm_o1">Questa società</option><option value="all" id="pm_o2">Tutte le società</option></select></div></div>
          <div className="mrow"><div className="fld"><label id="pm_l2">Vista</label>
            <select id="pr_mode" defaultValue="full" onChange={(e) => { document.getElementById('pr_ownrow').style.display = e.target.value === 'owner' ? 'block' : 'none'; }}>
              <option value="full" id="pm_o3">GANTT totale per società</option>
              <option value="owner" id="pm_o4">GANTT per owner (una pagina per persona)</option></select></div></div>
          <div className="mrow" id="pr_ownrow" style={{ display: 'none' }}><div className="fld"><label>Owner</label><select id="pr_owner" /></div></div>
          <div className="mrow" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn ghost" id="pm_c" onClick={() => document.getElementById('printmodal').classList.remove('show')}>Annulla</button>
            <button className="btn canary" id="pm_go" onClick={() => window.doPrint && window.doPrint()}>Genera e stampa</button>
          </div>
        </div>
      </div>
      <div id="printarea" />
    </div>
  );
}
