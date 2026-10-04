import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool, one } from './db.js';
import { config } from './config.js';
import { importPlan, takeSnapshot } from './lib/plan.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, 'migrations');

export async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);
  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    const c = await pool.connect();
    try {
      await c.query('BEGIN'); await c.query(sql);
      await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
      await c.query('COMMIT');
      console.log(`[migrate] applicata ${f}`);
    } catch (e) { await c.query('ROLLBACK'); throw new Error(`Migrazione ${f} fallita: ${e.message}`); }
    finally { c.release(); }
  }
  await seed();
}

async function seed() {
  // Primo amministratore (accesso Microsoft 365; password locale opzionale per l'avvio)
  if (config.seed.adminEmail) {
    const ex = await one('SELECT id, role, status FROM users WHERE lower(email)=$1', [config.seed.adminEmail]);
    if (!ex) {
      const pwd = config.seed.adminPassword && config.seed.adminPassword.length >= 12 ? await bcrypt.hash(config.seed.adminPassword, 12) : null;
      await pool.query(
        `INSERT INTO users (email, full_name, role, status, auth_provider, organization, password_hash, must_change_password)
         VALUES ($1,$2,'ADMIN','ACTIVE',$3,'Toscana Diagnostica',$4,$5)`,
        [config.seed.adminEmail, config.seed.adminName, pwd ? 'BOTH' : 'ENTRA', pwd, Boolean(pwd)]);
      console.log(`[seed] creato amministratore ${config.seed.adminEmail}`);
    } else if (ex.role !== 'ADMIN' || ex.status !== 'ACTIVE') {
      await pool.query(`UPDATE users SET role='ADMIN', status='ACTIVE' WHERE id=$1`, [ex.id]);
    }
  }
  // Dati iniziali: stato dell'artifact claude.ai rev 5 (14/09/2026), importato una sola volta su database vuoto
  if (config.seed.importPlan) {
    const n = await one('SELECT count(*)::int AS n FROM targets');
    if (n.n === 0) {
      const file = path.join(here, '..', 'seed', 'plan_rev5.json');
      if (fs.existsSync(file)) {
        const s = JSON.parse(fs.readFileSync(file, 'utf8'));
        const targets = s.targets.map((t) => ({ ...t, atts: s.activities.filter((a) => a.target_id === t.id) }));
        const rep = await importPlan({ targets, team: s.team }, { userId: null });
        await pool.query(`INSERT INTO audit_log (action, entity, label, data) VALUES ('PLAN_SEEDED','plan',$1,$2)`,
          [`Migrazione iniziale dall'artifact claude.ai rev ${s.source.rev} (${s.source.savedBy}, ${s.source.savedAt})`, JSON.stringify({ ...rep, source: s.source })]);
        await takeSnapshot('migration', `Stato importato dall'artifact rev ${s.source.rev}`, null);
        console.log(`[seed] piano importato: ${rep.tN} target, ${rep.aN} attività, ${rep.team} ruoli`);
      }
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('migrate.js')) {
  migrate().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
