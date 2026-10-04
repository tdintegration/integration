import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { one, many, q } from '../db.js';
import { ah, bad, notFound, audit, parse, forbidden } from '../lib/util.js';
import { requireAdmin, ROLES } from '../lib/access.js';

const r = Router();
const cols = `id, email, full_name, role, status, auth_provider, organization, entra_tid, must_change_password, last_login_at, created_at`;

r.get('/users', requireAdmin, ah(async (_req, res) => {
  res.json(await many(`SELECT ${cols} FROM users ORDER BY status = 'PENDING' DESC, role, lower(full_name)`));
}));

// Pre-censimento di un utente (Microsoft o locale). Per gli utenti locali viene generata una password temporanea.
const createSchema = z.object({
  email: z.string().email(), full_name: z.string().min(2).max(160), role: z.enum(ROLES),
  organization: z.string().max(160).optional().default(''), auth_provider: z.enum(['ENTRA', 'LOCAL', 'BOTH']).default('ENTRA'),
});
r.post('/users', requireAdmin, ah(async (req, res) => {
  const b = parse(createSchema, req.body);
  if (await one('SELECT 1 FROM users WHERE lower(email)=lower($1)', [b.email])) throw bad('Esiste già un utente con questa email');
  let tempPassword = null, hash = null;
  if (b.auth_provider !== 'ENTRA') {
    if (b.role === 'ADMIN') throw bad('Gli amministratori accedono solo con Microsoft 365');
    tempPassword = `Td-${crypto.randomBytes(9).toString('base64url')}1`;
    hash = await bcrypt.hash(tempPassword, 12);
  }
  const u = await one(
    `INSERT INTO users (email, full_name, role, status, auth_provider, organization, password_hash, must_change_password)
     VALUES ($1,$2,$3,'ACTIVE',$4,$5,$6,$7) RETURNING ${cols}`,
    [b.email.toLowerCase(), b.full_name, b.role, b.auth_provider, b.organization || null, hash, Boolean(hash)]);
  await audit(req, 'USER_CREATED', { entity: 'user', entityId: u.id, label: `${u.email} · ${u.role}` });
  res.status(201).json({ ...u, tempPassword });
}));

const updateSchema = z.object({
  full_name: z.string().min(2).max(160).optional(), role: z.enum(ROLES).optional(),
  status: z.enum(['ACTIVE', 'PENDING', 'DISABLED']).optional(), organization: z.string().max(160).nullable().optional(),
});
r.put('/users/:id', requireAdmin, ah(async (req, res) => {
  const id = Number(req.params.id);
  const b = parse(updateSchema, req.body);
  const cur = await one('SELECT * FROM users WHERE id=$1', [id]);
  if (!cur) throw notFound('Utente non trovato');
  if (cur.id === req.user.id && ((b.role && b.role !== 'ADMIN') || (b.status && b.status !== 'ACTIVE'))) throw forbidden('Non puoi declassare o disabilitare il tuo stesso account');
  if (b.role === 'ADMIN' && cur.auth_provider === 'LOCAL') throw bad('Gli amministratori accedono solo con Microsoft 365');
  const u = await one(
    `UPDATE users SET full_name=coalesce($2,full_name), role=coalesce($3,role), status=coalesce($4,status), organization=coalesce($5,organization), updated_at=now()
     WHERE id=$1 RETURNING ${cols}`, [id, b.full_name ?? null, b.role ?? null, b.status ?? null, b.organization ?? null]);
  if (b.status && b.status !== 'ACTIVE') await q(`DELETE FROM "session" WHERE (sess->>'userId')::int = $1`, [id]);
  await audit(req, 'USER_UPDATED', { entity: 'user', entityId: id, label: `${u.email} · ${u.role} · ${u.status}`, data: b });
  res.json(u);
}));

r.post('/users/:id/reset-password', requireAdmin, ah(async (req, res) => {
  const id = Number(req.params.id);
  const cur = await one('SELECT * FROM users WHERE id=$1', [id]);
  if (!cur) throw notFound('Utente non trovato');
  if (cur.auth_provider === 'ENTRA') throw bad("L'utente accede con Microsoft 365: nessuna password da reimpostare");
  const tempPassword = `Td-${crypto.randomBytes(9).toString('base64url')}1`;
  await q('UPDATE users SET password_hash=$2, must_change_password=TRUE, failed_logins=0, locked_until=NULL, updated_at=now() WHERE id=$1', [id, await bcrypt.hash(tempPassword, 12)]);
  await audit(req, 'USER_PASSWORD_RESET', { entity: 'user', entityId: id, label: cur.email });
  res.json({ tempPassword });
}));

export default r;
