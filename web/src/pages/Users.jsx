import React, { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, Loading, Empty, Field, Modal, ErrorBox, Badge, useToast } from '../components/ui.jsx';
import { ROLE, USTATUS, AUTH, itDateTime } from '../format.js';

const ROLE_HELP = {
  ADMIN: 'Gestisce utenti, snapshot e import; modifica tutto il piano.',
  EDITOR: 'Modifica attività, target e registro ruoli.',
  VIEWER: 'Consulta il piano, stampa ed esporta. Nessuna modifica (investitore, banche).',
};

function TempPassword({ value }) {
  return <div className="alert warn">Password temporanea (mostrata una sola volta): <b className="mono" style={{ fontSize: 15 }}>{value}</b> · l'utente dovrà cambiarla al primo accesso.</div>;
}

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const { data, reload } = useApi('/users');
  const [modal, setModal] = useState(null);   // 'new' | user
  const [form, setForm] = useState({});
  const [err, setErr] = useState(null);
  const [temp, setTemp] = useState(null);

  const openNew = () => { setForm({ email: '', full_name: '', role: 'VIEWER', organization: '', auth_provider: 'ENTRA' }); setErr(null); setTemp(null); setModal('new'); };
  const openEdit = (u) => { setForm({ full_name: u.full_name, role: u.role, status: u.status, organization: u.organization || '' }); setErr(null); setTemp(null); setModal(u); };
  const save = async () => {
    setErr(null);
    try {
      if (modal === 'new') { const r = await api.post('/users', form); if (r.tempPassword) { setTemp(r.tempPassword); } else setModal(null); toast('Utente creato'); }
      else { await api.put(`/users/${modal.id}`, form); setModal(null); toast('Utente aggiornato'); }
      reload();
    } catch (e) { setErr(e); }
  };
  const quick = async (u, patch, msg) => { try { await api.put(`/users/${u.id}`, patch); toast(msg); reload(); } catch (e) { toast(e.message, 'err'); } };
  const reset = async (u) => { try { const r = await api.post(`/users/${u.id}/reset-password`); setForm({}); setTemp(r.tempPassword); setModal(u); } catch (e) { toast(e.message, 'err'); } };

  const pending = (data || []).filter((u) => u.status === 'PENDING');
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Utenti e accessi</h1><div className="sub">Chi può entrare e con quale profilo. Gli account Microsoft 365 del dominio Toscana Diagnostica vengono abilitati in automatico come Editor al primo accesso; tutti gli altri (investitore, banche, consulenti) restano in attesa finché non li abiliti qui.</div></div>
        <button className="btn" onClick={openNew}>Nuovo utente</button>
      </div>
      {pending.length > 0 && <div className="alert info">{pending.length} {pending.length === 1 ? 'account in attesa di abilitazione' : 'account in attesa di abilitazione'}: assegna un profilo oppure disabilita.</div>}
      <div className="card">
        {!data ? <Loading /> : !data.length ? <Empty>Nessun utente</Empty> : (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Utente</th><th>Organizzazione</th><th>Profilo</th><th>Stato</th><th>Accesso</th><th>Ultimo accesso</th><th></th></tr></thead>
            <tbody>{data.map((u) => (
              <tr key={u.id}>
                <td><div className="strong">{u.full_name}</div><div className="small muted">{u.email}</div></td>
                <td className="small">{u.organization || '–'}</td>
                <td><Badge tone={u.role === 'ADMIN' ? 'teal' : u.role === 'EDITOR' ? 'blue' : 'grey'}>{ROLE[u.role]}</Badge></td>
                <td><Badge tone={USTATUS[u.status].tone}>{USTATUS[u.status].label}</Badge></td>
                <td className="small">{AUTH[u.auth_provider]}</td>
                <td className="small muted">{itDateTime(u.last_login_at) || 'mai'}</td>
                <td><div className="doc-actions" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {u.status === 'PENDING' && <>
                    <button className="btn sm" onClick={() => quick(u, { status: 'ACTIVE', role: 'VIEWER' }, 'Abilitato in sola lettura')}>Abilita sola lettura</button>
                    <button className="btn sm ghost" onClick={() => quick(u, { status: 'ACTIVE', role: 'EDITOR' }, 'Abilitato come editor')}>Abilita editor</button>
                  </>}
                  <button className="btn sm ghost" onClick={() => openEdit(u)}>Modifica</button>
                  {u.auth_provider !== 'ENTRA' && <button className="btn sm ghost" onClick={() => reset(u)}>Reset password</button>}
                  {u.id !== me.id && u.status !== 'DISABLED' && <button className="btn sm danger" onClick={() => quick(u, { status: 'DISABLED' }, 'Utente disabilitato')}>Disabilita</button>}
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      {modal && <Modal title={modal === 'new' ? 'Nuovo utente' : `Modifica ${modal.email}`} onClose={() => setModal(null)}
        footer={temp ? <button className="btn" onClick={() => setModal(null)}>Chiudi</button> : <><button className="btn ghost" onClick={() => setModal(null)}>Annulla</button><button className="btn" onClick={save}>Salva</button></>}>
        <ErrorBox error={err} />
        {temp ? <TempPassword value={temp} /> : <div style={{ display: 'grid', gap: 12 }}>
          {modal === 'new' && <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>}
          <Field label="Nome e cognome"><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
          <Field label="Organizzazione" help="Es. Toscana Diagnostica, nome della banca o dell'investitore"><input value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} /></Field>
          <Field label="Profilo" help={ROLE_HELP[form.role]}>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </Field>
          {modal === 'new' ? (
            <Field label="Metodo di accesso" help="Microsoft 365 è il metodo consigliato: l'utente accede con il proprio account aziendale, anche di un'altra organizzazione. Email e password solo per chi non ha un account Microsoft.">
              <select value={form.auth_provider} onChange={(e) => setForm({ ...form, auth_provider: e.target.value })}><option value="ENTRA">Microsoft 365</option><option value="LOCAL">Email e password</option><option value="BOTH">Microsoft 365 o password</option></select>
            </Field>
          ) : (
            <Field label="Stato"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{Object.entries(USTATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
          )}
        </div>}
      </Modal>}
    </div>
  );
}
