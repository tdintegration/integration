import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Field, ErrorBox } from '../components/ui.jsx';

export default function Login() {
  const { refresh } = useAuth();
  const [cfg, setCfg] = useState({ entraEnabled: false });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(() => { const e = new URLSearchParams(window.location.search).get('error'); return e ? new Error(e) : null; });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/auth/config').then(setCfg).catch(() => {}); }, []);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await api.post('/auth/login', { email, password });
      window.history.replaceState(null, '', '/');
      await refresh();
    } catch (e2) { setErr(e2); }
    setBusy(false);
  };

  return (
    <div className="login">
      <div className="art">
        <img src="/logo-light.svg" alt="Toscana Diagnostica" />
        <div className="claim">Ogni acquisizione, ogni attività, <span>un unico piano</span> condiviso.</div>
        <div className="foot">Integration Plan Management · piano di integrazione post-closing delle società target · accesso riservato</div>
      </div>
      <div className="pane">
        <form onSubmit={submit}>
          <div>
            <h1>Accedi</h1>
            <div className="muted" style={{ marginTop: 4 }}>Team Toscana Diagnostica, investitori e istituti di credito con il proprio account Microsoft 365; collaboratori esterni con email e password.</div>
          </div>
          <ErrorBox error={err} />
          {cfg.entraEnabled && <>
            <a className="btn ms lg" href="/api/auth/entra/login">
              <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022" /><rect x="11" y="1" width="9" height="9" fill="#7fba00" /><rect x="1" y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" /></svg>
              Accedi con Microsoft 365
            </a>
            <div className="or">oppure con email e password</div>
          </>}
          <Field label="Email"><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={!cfg.entraEnabled} /></Field>
          <Field label="Password"><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
          <button className="btn lg" disabled={busy}>{busy ? 'Verifica…' : 'Accedi'}</button>
          <div className="small muted">Il primo accesso con un account Microsoft esterno a Toscana Diagnostica resta in attesa finché un amministratore non lo abilita.</div>
        </form>
      </div>
    </div>
  );
}
