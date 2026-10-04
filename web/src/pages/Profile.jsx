import React, { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Card, Field, ErrorBox, useToast } from '../components/ui.jsx';
import { ROLE, AUTH } from '../format.js';

export default function Profile() {
  const { user, authMethod, refresh } = useAuth();
  const toast = useToast();
  const [cur, setCur] = useState(''); const [nw, setNw] = useState(''); const [err, setErr] = useState(null);
  const local = user.auth_provider !== 'ENTRA';
  const change = async (e) => {
    e.preventDefault(); setErr(null);
    try { await api.post('/auth/change-password', { currentPassword: cur, newPassword: nw }); toast('Password aggiornata'); setCur(''); setNw(''); refresh(); }
    catch (e2) { setErr(e2); }
  };
  return (
    <div className="page">
      <div className="page-head"><div><h1>Profilo</h1><div className="sub">Il tuo account e il metodo di accesso</div></div></div>
      <div className="grid g2">
        <Card title="Account">
          <div className="small muted">Nome</div><div className="strong">{user.full_name}</div>
          <div className="small muted mt">Email</div><div>{user.email}</div>
          <div className="small muted mt">Profilo</div><div>{ROLE[user.role]}</div>
          <div className="small muted mt">Organizzazione</div><div>{user.organization || '–'}</div>
          <div className="small muted mt">Accesso</div><div>{AUTH[user.auth_provider]} · sessione corrente: {authMethod === 'ENTRA' ? 'Microsoft 365' : 'password'}</div>
        </Card>
        {local && <Card title={user.must_change_password ? 'Cambia la password temporanea' : 'Cambia password'}>
          <form onSubmit={change} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ErrorBox error={err} />
            <Field label="Password attuale"><input type="password" value={cur} onChange={(e) => setCur(e.target.value)} required autoComplete="current-password" /></Field>
            <Field label="Nuova password" help="Minimo 12 caratteri, con maiuscola, minuscola e numero"><input type="password" value={nw} onChange={(e) => setNw(e.target.value)} required autoComplete="new-password" /></Field>
            <div><button className="btn">Aggiorna password</button></div>
          </form>
        </Card>}
      </div>
    </div>
  );
}
