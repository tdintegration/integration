import React, { useState } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth, isAdmin } from './auth.jsx';
import { ToastProvider, Icon, Loading, BusyBar } from './components/ui.jsx';
import { ROLE } from './format.js';
import Login from './pages/Login.jsx';
import Pending from './pages/Pending.jsx';
import Plan from './pages/Plan.jsx';
import Users from './pages/Users.jsx';
import Audit from './pages/Audit.jsx';
import Snapshots from './pages/Snapshots.jsx';
import Profile from './pages/Profile.jsx';
import Guide from './pages/Guide.jsx';
import Onboarding from './pages/Onboarding.jsx';

export const PlanCtx = React.createContext({ targets: [], page: 'cover' });

function Shell() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState({ targets: [], page: 'cover' });
  const loc = useLocation();
  const nav = useNavigate();
  React.useEffect(() => setOpen(false), [loc.pathname]);
  const admin = isAdmin(user);
  const goTarget = (id) => { nav('/'); setTimeout(() => window.IPM?.go(id), 0); };
  const onPlan = loc.pathname === '/';
  const L = ({ to, icon, children, end }) => (<NavLink to={to} end={end}><Icon name={icon} />{children}</NavLink>);
  return (
    <PlanCtx.Provider value={{ ...plan, setPlan }}>
      <div className="shell">
        <aside className={`side ${open ? 'open' : ''}`}>
          <div className="brand"><img src="/logo-light.svg" alt="Toscana Diagnostica" /><div className="app">Integration Plan</div></div>
          <nav>
            <button className={`navlink ${onPlan && plan.page === 'cover' ? 'active' : ''}`} onClick={() => goTarget('cover')}><Icon name="home" />Cruscotto</button>
            <div className="group">Società target</div>
            {plan.targets.map((t) => (
              <button key={t.id} className={`navlink ${onPlan && plan.page === t.id ? 'active' : ''}`} onClick={() => goTarget(t.id)}><Icon name="building" />{t.nome || t.id}</button>
            ))}
            <div className="group">Strumenti</div>
            <button className="navlink" onClick={() => { if (!onPlan) nav('/'); setTimeout(() => window.IPM?.exportXlsx(), 50); }}><Icon name="download" />Esporta XLSX</button>
            <button className="navlink" onClick={() => { if (!onPlan) nav('/'); setTimeout(() => window.IPM?.print(), 50); }}><Icon name="print" />Stampa PDF</button>
            <L to="/guida" icon="list">Guida all'uso</L>
            {admin && <>
              <div className="group">Amministrazione</div>
              <L to="/utenti" icon="users">Utenti e accessi</L>
              <L to="/audit" icon="shield">Registro attività</L>
              <L to="/snapshot" icon="cash">Snapshot e ripristino</L>
            </>}
          </nav>
          <div className="me">
            <div className="name">{user.full_name}</div>
            <div>{ROLE[user.role]}{user.organization ? ` · ${user.organization}` : ''}</div>
            <div className="row" style={{ marginTop: 8 }}>
              <NavLink to="/profilo" className="btn sm ghost" style={{ color: 'var(--teal)' }}>Profilo</NavLink>
              <button className="btn sm dark" onClick={logout}>Esci</button>
            </div>
          </div>
        </aside>
        <main className="main">
          <div className="topbar"><button onClick={() => setOpen(!open)} aria-label="Menu">☰</button><img src="/logo-light.svg" alt="" /></div>
          <Routes>
            <Route path="/" element={<Plan />} />
            <Route path="/guida" element={<Guide />} />
            {admin && <Route path="/utenti" element={<Users />} />}
            {admin && <Route path="/audit" element={<Audit />} />}
            {admin && <Route path="/snapshot" element={<Snapshots />} />}
            <Route path="/profilo" element={<Profile />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </PlanCtx.Provider>
  );
}

function Gate() {
  const { loading, user, pending, authMethod } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>;
  if (user.must_change_password && authMethod === 'LOCAL') return <Onboarding />;
  if (pending) return <Pending />;
  return <Shell />;
}

export default function App() {
  return (
    <ToastProvider>
      <BusyBar />
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ToastProvider>
  );
}
