// Test end-to-end delle API (server avviato su un database di prova con il seed).
// Avvio: DATABASE_URL=... SESSION_SECRET=x SEED_ADMIN_EMAIL=admin@test.it SEED_ADMIN_PASSWORD=Admin-Password-2026 DISABLE_SCHEDULER=true node src/index.js
// poi: BASE=http://localhost:3000 npm test
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://localhost:3000';
const ADMIN = { email: process.env.SEED_ADMIN_EMAIL || 'admin@test.it', password: process.env.SEED_ADMIN_PASSWORD || 'Admin-Password-2026' };

class Client {
  constructor() { this.cookie = ''; }
  async req(method, url, body, headers = {}) {
    const res = await fetch(BASE + '/api' + url, {
      method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'td-integration', Cookie: this.cookie, ...headers },
      body: body ? JSON.stringify(body) : undefined, redirect: 'manual',
    });
    const sc = res.headers.getSetCookie?.() || [];
    if (sc.length) this.cookie = sc.map((c) => c.split(';')[0]).join('; ');
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, data: ct.includes('json') ? await res.json() : await res.text() };
  }
  get(u) { return this.req('GET', u); } post(u, b) { return this.req('POST', u, b || {}); }
  put(u, b) { return this.req('PUT', u, b); } patch(u, b) { return this.req('PATCH', u, b); } del(u) { return this.req('DELETE', u); }
}

const admin = new Client();
let viewer = null;

before(async () => {
  const h = await admin.get('/health'); assert.equal(h.status, 200);
  let r = await admin.post('/auth/login', ADMIN); assert.equal(r.status, 200, JSON.stringify(r.data));
  if (r.data.mustChangePassword) {
    const np = ADMIN.password + '-X1';
    r = await admin.post('/auth/change-password', { currentPassword: ADMIN.password, newPassword: np }); assert.equal(r.status, 200);
    ADMIN.password = np;
  }
});

test('piano caricato dal seed: 6 target, 262 attività, 18 ruoli', async () => {
  const { status, data } = await admin.get('/plan');
  assert.equal(status, 200);
  assert.equal(data.targets.length, 6);
  assert.equal(data.targets.reduce((n, t) => n + t.atts.length, 0), 262);
  assert.equal(data.team.length, 18);
  assert.equal(data.targets[0].id, 'gentras');
  assert.equal(data.targets[0].atts[0].id, 'a1');
});

test('CSRF: scrittura senza header rifiutata', async () => {
  const r = await admin.req('PATCH', '/targets/gentras/activities/a1', { note: 'x' }, { 'X-Requested-With': 'no' });
  assert.equal(r.status, 403);
});

test('modifica attività con versione, audit e conflitto', async () => {
  const plan = (await admin.get('/plan')).data;
  const a = plan.targets[0].atts[1];
  const r1 = await admin.patch(`/targets/gentras/activities/${a.id}`, { ...a, note: 'nota test', version: a.version });
  assert.equal(r1.status, 200); assert.equal(r1.data.note, 'nota test'); assert.equal(r1.data.version, a.version + 1);
  const r2 = await admin.patch(`/targets/gentras/activities/${a.id}`, { ...a, st: 1, version: a.version });   // versione vecchia
  assert.equal(r2.status, 409); assert.equal(r2.data.current.row.note, 'nota test');
  const au = (await admin.get('/audit?limit=5')).data;
  const last = au.find((x) => x.action === 'ACTIVITY_UPDATED');
  assert.ok(last && last.data.note && last.data.note[1] === 'nota test');
  // ripristino valore
  const r3 = await admin.patch(`/targets/gentras/activities/${a.id}`, { note: a.note, version: r1.data.version }); assert.equal(r3.status, 200);
});

test('cambio stato completata registra prima/dopo leggibile', async () => {
  const plan = (await admin.get('/plan')).data;
  const a = plan.targets[1].atts.find((x) => x.st === 0);
  const r = await admin.patch(`/targets/cifs/activities/${a.id}`, { st: 2, fine: '2026-10-04', version: a.version });
  assert.equal(r.status, 200); assert.equal(r.data.st, 2);
  const au = (await admin.get('/audit?limit=1&target=cifs')).data[0];
  assert.match(au.label, /stato: da iniziare → completata/);
  await admin.patch(`/targets/cifs/activities/${a.id}`, { st: 0, fine: '', version: r.data.version });
});

test('attività: creazione, riordino, eliminazione', async () => {
  const c = await admin.post('/targets/gentras/activities', { id: 'test_x1', cid: 'nuova', nome: 'Attività di prova', proc: 'ops', sw: 2, ew: 3, owner: 'CEO', support: [] });
  assert.equal(c.status, 201); assert.equal(c.data.id, 'test_x1');
  const dup = await admin.post('/targets/gentras/activities', { id: 'test_x1', cid: 'nuova' }); assert.equal(dup.status, 409);
  const plan = (await admin.get('/plan')).data; const ids = plan.targets[0].atts.map((x) => x.id);
  ids.unshift(ids.pop());  // sposta l'ultima in cima
  const o = await admin.put('/targets/gentras/order', { ids }); assert.equal(o.status, 200);
  const plan2 = (await admin.get('/plan')).data; assert.equal(plan2.targets[0].atts[0].id, 'test_x1');
  const d = await admin.del('/targets/gentras/activities/test_x1'); assert.equal(d.status, 200);
  const plan3 = (await admin.get('/plan')).data; assert.equal(plan3.targets[0].atts.some((x) => x.id === 'test_x1'), false);
  // ripristina ordine originale
  const orig = ids.filter((x) => x !== 'test_x1'); await admin.put('/targets/gentras/order', { ids: orig });
});

test('target: creazione con attività, modifica scheda, eliminazione con snapshot', async () => {
  const c = await admin.post('/targets', { id: 'ttest', nome: 'TEST SRL', hor: 24, linee: ['lab'], atts: [{ id: 'a1', cid: 'G1', proc: 'gov', sw: 1, ew: 1 }, { id: 'a2', cid: 'G2', proc: 'gov', sw: 1, ew: 1 }] });
  assert.equal(c.status, 201);
  const plan = (await admin.get('/plan')).data; const t = plan.targets.find((x) => x.id === 'ttest');
  assert.equal(t.atts.length, 2);
  const u = await admin.patch('/targets/ttest', { closing: '2026-12-01', fatt: 123456, version: t.version });
  assert.equal(u.status, 200); assert.equal(u.data.closing, '2026-12-01'); assert.equal(u.data.fatt, 123456);
  const before = (await admin.get('/snapshots')).data.length;
  const d = await admin.del('/targets/ttest'); assert.equal(d.status, 200);
  const after = (await admin.get('/snapshots')).data.length; assert.equal(after, before + 1);
});

test('team: sostituzione elenco ruoli', async () => {
  const plan = (await admin.get('/plan')).data;
  const members = plan.team.map(({ r, f, n, lm }) => ({ r, f, n, lm }));
  members.push({ r: 'Ruolo Test', f: 'Esterna', n: 'Mario Rossi' });
  const r = await admin.put('/team', { members }); assert.equal(r.status, 200); assert.equal(r.data.length, members.length);
  const r2 = await admin.put('/team', { members: members.slice(0, -1) }); assert.equal(r2.data.length, plan.team.length);
});

test('utenti: creazione viewer locale, permessi di sola lettura, disabilitazione', async () => {
  const email = `viewer.${Date.now()}@banca-test.it`;
  const c = await admin.post('/users', { email, full_name: 'Analista Test', role: 'VIEWER', organization: 'Banca Test', auth_provider: 'LOCAL' });
  assert.equal(c.status, 201); assert.ok(c.data.tempPassword);
  viewer = new Client();
  let l = await viewer.post('/auth/login', { email, password: c.data.tempPassword }); assert.equal(l.status, 200); assert.equal(l.data.mustChangePassword, true);
  const p = (await viewer.get('/plan')); assert.equal(p.status, 403); assert.equal(p.data.code, 'PASSWORD_CHANGE_REQUIRED');
  const cp = await viewer.post('/auth/change-password', { currentPassword: c.data.tempPassword, newPassword: 'Viewer-Password-2026' }); assert.equal(cp.status, 200);
  assert.equal((await viewer.get('/plan')).status, 200);
  assert.equal((await viewer.patch('/targets/gentras/activities/a1', { note: 'x' })).status, 403);
  assert.equal((await viewer.get('/users')).status, 403);
  assert.equal((await viewer.get('/snapshots')).status, 403);
  const adminLocal = await admin.post('/users', { email: 'x' + email, full_name: 'Admin Locale', role: 'ADMIN', auth_provider: 'LOCAL' });
  assert.equal(adminLocal.status, 400, 'gli amministratori usano solo Microsoft 365');
  const dis = await admin.put(`/users/${c.data.id}`, { status: 'DISABLED' }); assert.equal(dis.status, 200);
  assert.equal((await viewer.get('/plan')).status, 401, 'sessione revocata alla disabilitazione');
});

test('snapshot manuale e ripristino', async () => {
  const s = await admin.post('/snapshots', { note: 'test' }); assert.equal(s.status, 201);
  const plan = (await admin.get('/plan')).data; const a = plan.targets[0].atts[0];
  await admin.patch('/targets/gentras/activities/a1', { dett: 'modifica da annullare', version: a.version });
  const r = await admin.post(`/snapshots/${s.data.id}/restore`); assert.equal(r.status, 200);
  const plan2 = (await admin.get('/plan')).data;
  assert.equal(plan2.targets[0].atts[0].dett, a.dett);
  assert.equal(plan2.targets.reduce((n, t) => n + t.atts.length, 0), 262);
});

test('import/merge: le attività più recenti nel file aggiornano, le vecchie no', async () => {
  const plan = (await admin.get('/plan')).data;
  const t = plan.targets[0]; const a0 = t.atts[0], a1 = t.atts[1];
  const file = { targets: [{ id: t.id, nome: t.nome, lm: 0, atts: [
    { ...a0, note: 'da file recente', lm: Date.now() + 1000 },
    { ...a1, note: 'da file vecchio', lm: 1 },
    { id: 'imp_new', cid: 'nuova', nome: 'Importata', proc: 'ops', sw: 3, ew: 3, lm: Date.now() },
  ] }], team: [] };
  const r = await admin.post('/plan/import', file); assert.equal(r.status, 200);
  assert.equal(r.data.aU, 1); assert.equal(r.data.aN, 1);
  const p2 = (await admin.get('/plan')).data; const t2 = p2.targets[0];
  assert.equal(t2.atts.find((x) => x.id === a0.id).note, 'da file recente');
  assert.equal(t2.atts.find((x) => x.id === a1.id).note, a1.note);
  assert.ok(t2.atts.some((x) => x.id === 'imp_new'));
  // pulizia
  await admin.del('/targets/gentras/activities/imp_new');
  const a0n = (await admin.get('/plan')).data.targets[0].atts[0];
  await admin.patch('/targets/gentras/activities/a1', { note: a0.note, version: a0n.version });
});

test('SSE: un evento arriva entro 2 secondi', async () => {
  const ctrl = new AbortController();
  const res = await fetch(BASE + '/api/events', { headers: { Cookie: admin.cookie }, signal: ctrl.signal });
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  const plan = (await admin.get('/plan')).data; const a = plan.targets[2].atts[0];
  await admin.patch(`/targets/biolabor/activities/${a.id}`, { note: 'sse', version: a.version });
  const deadline = Date.now() + 2000; let found = null;
  while (Date.now() < deadline && !found) {
    const { value } = await Promise.race([reader.read(), new Promise((r) => setTimeout(() => r({ value: null }), 300))]);
    if (value) buf += dec.decode(value);
    found = buf.split('\n').map((l) => l.startsWith('data: ') ? JSON.parse(l.slice(6)) : null).find((e) => e && e.type === 'activity.updated');
  }
  ctrl.abort();
  assert.ok(found, 'evento non ricevuto'); assert.equal(found.data.id, a.id); assert.ok(found.meta.rev > 0);
  const cur = (await admin.get('/plan')).data.targets[2].atts[0];
  await admin.patch(`/targets/biolabor/activities/${a.id}`, { note: a.note, version: cur.version });
});
