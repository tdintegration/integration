import express from 'express';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { loadUser, requireAuth } from './lib/access.js';
import { HttpError } from './lib/util.js';
import { takeSnapshot } from './lib/plan.js';
import { clientCount } from './lib/events.js';
import authRoutes from './routes/auth.js';
import planRoutes from './routes/plan.js';
import userRoutes from './routes/users.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Dominio canonico (come td-cash): richieste su altri host -> redirect permanente
const canonicalHost = (() => { try { const u = new URL(config.baseUrl); return /localhost|127\.0\.0\.1/.test(u.hostname) ? null : u.host; } catch { return null; } })();
if (canonicalHost) {
  app.use((req, res, next) => {
    if (req.path === '/api/health' || req.hostname === canonicalHost) return next();
    res.redirect(301, `https://${canonicalHost}${req.originalUrl}`);
  });
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      // il motore GANTT usa handler inline (onclick) e stili inline: necessari 'unsafe-inline'
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      formAction: ["'self'", 'https://login.microsoftonline.com'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '8mb' }));

const PgStore = pgSession(session);
app.use(session({
  store: new PgStore({ pool, tableName: 'session', createTableIfMissing: false }),
  name: 'tdi.sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly: true, sameSite: 'lax', secure: config.secureCookies, maxAge: config.sessionHours * 3600 * 1000 },
}));

// CSRF: le richieste che modificano dati devono arrivare dal client dell'app (header custom)
app.use('/api', (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'td-integration') return next(new HttpError(403, 'Richiesta non valida'));
  next();
});

app.use(loadUser);
app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, sse: clientCount() }); } catch { res.status(503).json({ ok: false }); }
});
app.use('/api/auth', authRoutes);
app.use('/api', requireAuth);
app.use('/api', planRoutes);
app.use('/api', userRoutes);
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Endpoint inesistente')));

// Frontend (build Vite)
const webDir = process.env.WEB_DIR || path.join(__dirname, '..', 'public');
if (fs.existsSync(webDir)) {
  app.use(express.static(webDir, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(webDir, 'index.html')));
}

app.use((err, req, res, _next) => {
  const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
  if (status >= 500) console.error(`[${req.method} ${req.originalUrl}]`, err);
  if (err.code === '23505') return res.status(409).json({ error: 'Elemento duplicato' });
  res.status(status).json({ error: status >= 500 ? 'Errore interno del server' : err.message, code: err.code, details: err.details, current: err.current });
});

// Snapshot giornaliero automatico (ora di Roma)
function startScheduler() {
  let lastDay = '';
  setInterval(async () => {
    const now = new Date();
    const rome = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', hour: 'numeric', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = (t) => rome.find((p) => p.type === t)?.value;
    const day = `${get('year')}-${get('month')}-${get('day')}`;
    if (Number(get('hour')) === config.snapshotHourRome && lastDay !== day) {
      lastDay = day;
      try { await takeSnapshot('daily', `Snapshot automatico ${day}`, null); console.log(`[snapshot] giornaliero ${day}`); }
      catch (e) { console.error('[snapshot]', e.message); }
    }
  }, 5 * 60 * 1000);
}

async function start() {
  const deadline = Date.now() + 150_000;
  for (let attempt = 1; ; attempt++) {
    try { await pool.query('SELECT 1'); break; }
    catch (e) {
      if (Date.now() > deadline) throw new Error(`Database non raggiungibile: ${e.message}`);
      console.log(`[avvio] database non ancora pronto (tentativo ${attempt}). Riprovo tra 5 s`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  await migrate();
  app.listen(config.port, () => console.log(`TD Integration in ascolto su :${config.port}`));
  if (process.env.DISABLE_SCHEDULER !== 'true') startScheduler();
}
start().catch((e) => { console.error(e); process.exit(1); });
