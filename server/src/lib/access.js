import { one } from '../db.js';
import { HttpError, forbidden } from './util.js';

export const ROLES = ['ADMIN', 'EDITOR', 'VIEWER'];

export async function loadUser(req, _res, next) {
  try {
    const id = req.session?.userId;
    if (id) {
      const u = await one(
        `SELECT id, email, full_name, role, status, auth_provider, organization, entra_tid, must_change_password, last_login_at
           FROM users WHERE id = $1`, [id]);
      if (u && u.status === 'ACTIVE') req.user = u;
      else if (u && u.status === 'PENDING') req.pendingUser = u;   // autenticato ma non ancora abilitato
      else req.session.userId = null;
    }
    next();
  } catch (e) { next(e); }
}

export function requireAuth(req, _res, next) {
  if (!req.user) {
    if (req.pendingUser) return next(Object.assign(new HttpError(403, 'Account in attesa di abilitazione'), { code: 'PENDING' }));
    return next(new HttpError(401, 'Sessione scaduta o non autenticata'));
  }
  if (req.user.must_change_password && req.session.authMethod === 'LOCAL' && !/^\/api\/auth\//.test(req.originalUrl)) {
    return next(Object.assign(new HttpError(403, 'Cambio password obbligatorio'), { code: 'PASSWORD_CHANGE_REQUIRED' }));
  }
  next();
}

export const requireRole = (...roles) => (req, _res, next) => (roles.includes(req.user?.role) ? next() : next(forbidden()));
export const requireEditor = requireRole('ADMIN', 'EDITOR');
export const requireAdmin = requireRole('ADMIN');
export const isAdmin = (u) => u?.role === 'ADMIN';
export const canEdit = (u) => u?.role === 'ADMIN' || u?.role === 'EDITOR';
