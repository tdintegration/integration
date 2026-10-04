// Configurazione da variabili d'ambiente (stesso schema di td-cash-management)
const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  baseUrl: env.BASE_URL || 'http://localhost:3000',
  databaseUrl: env.DATABASE_URL || 'postgres://postgres@localhost:5432/tdi',
  sessionSecret: env.SESSION_SECRET || 'dev-only-change-me',
  secureCookies: env.NODE_ENV === 'production',
  sessionHours: Number(env.SESSION_HOURS || 10),
  entra: {
    // Multi-tenant: "organizations" accetta qualsiasi account aziendale Microsoft; l'abilitazione resta nell'app.
    authority: env.ENTRA_AUTHORITY || 'organizations',
    clientId: env.ENTRA_CLIENT_ID || '',
    clientSecret: env.ENTRA_CLIENT_SECRET || '',
    // tenant consentiti (vuoto = tutti); es. "tenant-id-1,tenant-id-2"
    allowedTenants: (env.ENTRA_ALLOWED_TENANTS || '').split(',').map((s) => s.trim()).filter(Boolean),
    get enabled() { return Boolean(this.clientId && this.clientSecret); },
  },
  // domini email abilitati in automatico al primo login (ruolo EDITOR); gli altri restano in attesa di approvazione
  autoEditorDomains: (env.AUTO_EDITOR_DOMAINS || 'toscanadiagnostica.it').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  seed: {
    adminEmail: (env.SEED_ADMIN_EMAIL || '').toLowerCase(),
    adminName: env.SEED_ADMIN_NAME || 'Amministratore',
    adminPassword: env.SEED_ADMIN_PASSWORD || '',
    importPlan: (env.SEED_IMPORT_PLAN || 'true') === 'true',   // importa seed/plan_rev5.json se il database è vuoto
  },
  snapshotHourRome: Number(env.SNAPSHOT_HOUR || 2),   // snapshot giornaliero automatico (ora di Roma)
  appName: 'Toscana Diagnostica · Integration Plan',
};

if (env.NODE_ENV === 'production' && config.sessionSecret === 'dev-only-change-me') {
  throw new Error('SESSION_SECRET obbligatorio in produzione');
}
