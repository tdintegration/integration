import React from 'react';
import { useAuth } from '../auth.jsx';

export default function Pending() {
  const { user, logout, refresh } = useAuth();
  return (
    <div className="login">
      <div className="art">
        <img src="/logo-light.svg" alt="Toscana Diagnostica" />
        <div className="claim">Account riconosciuto, <span>in attesa di abilitazione</span>.</div>
        <div className="foot">Integration Plan Management · Toscana Diagnostica</div>
      </div>
      <div className="pane">
        <form onSubmit={(e) => { e.preventDefault(); refresh(); }}>
          <h1>Quasi fatto</h1>
          <div className="muted">Hai effettuato l'accesso come <b>{user.email}</b>. Un amministratore di Toscana Diagnostica deve assegnarti un profilo (sola lettura o modifica) prima che tu possa vedere il piano. Riceverai conferma direttamente da chi ti ha invitato.</div>
          <button className="btn lg">Ho ricevuto l'abilitazione, riprova</button>
          <button type="button" className="btn ghost" onClick={logout}>Esci</button>
        </form>
      </div>
    </div>
  );
}
