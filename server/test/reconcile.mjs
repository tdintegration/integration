// Riconciliazione: stato nel database vs snapshot artifact rev 5 (campo per campo)
import fs from 'node:fs';
import { pool } from '../src/db.js';
import { readPlan } from '../src/lib/plan.js';
const src = JSON.parse(fs.readFileSync(new URL('../../tools/source_state_rev5.json', import.meta.url)));
const db = await readPlan();
const A = ['cid','nome','proc','sw','ew','owner','support','dett','note','st','pl','ms','fine','lm'];
const TF = ['nome','rs','ind','piva','ref','tel','mail','web','pec','fatt','pfn','ev','linee','loi','prelim','closing','hor','lm'];
const canon = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? Object.fromEntries(Object.entries(v).sort()) : v;
const norm = (k, v) => {
  if (v === undefined) return k === 'support' || k === 'linee' ? [] : (k === 'nome' ? null : (['pl','ms'].includes(k) ? false : (['lm','sw','ew','st'].includes(k) ? 0 : '')));
  if (k === 'nome' && v === '') return null;
  return canon(v);
};
let errs = 0, checked = 0;
if (src.targets.length !== db.targets.length) { console.log('N target diverso', src.targets.length, db.targets.length); errs++; }
for (const [i, st] of src.targets.entries()) {
  const dt = db.targets.find((t) => t.id === st.id);
  if (!dt) { console.log('target mancante', st.id); errs++; continue; }
  if (dt.position !== i) { console.log('ordine target', st.id, i, dt.position); errs++; }
  for (const k of TF) { checked++; if (JSON.stringify(norm(k, st[k])) !== JSON.stringify(norm(k, dt[k]))) { console.log('T', st.id, k, JSON.stringify(st[k]), '!=', JSON.stringify(dt[k])); errs++; } }
  if (st.atts.length !== dt.atts.length) { console.log('N att', st.id, st.atts.length, dt.atts.length); errs++; }
  for (const [j, sa] of st.atts.entries()) {
    const da = dt.atts[j];
    if (!da || da.id !== sa.id) { console.log('ordine/att', st.id, j, sa.id, da && da.id); errs++; continue; }
    for (const k of A) { checked++; if (JSON.stringify(norm(k, sa[k])) !== JSON.stringify(norm(k, da[k]))) { console.log('A', st.id, sa.id, k, JSON.stringify(sa[k]), '!=', JSON.stringify(da[k])); errs++; } }
  }
}
for (const [i, sm] of src.team.entries()) {
  const dm = db.team[i];
  checked += 3;
  if (!dm || dm.r !== sm.r || dm.f !== sm.f || dm.n !== sm.n) { console.log('team', i, sm, dm); errs++; }
}
console.log(`RICONCILIAZIONE: ${checked} campi confrontati, ${errs} differenze; target ${db.targets.length}, attività ${db.targets.reduce((n,t)=>n+t.atts.length,0)}, completate ${db.targets.reduce((n,t)=>n+t.atts.filter(a=>a.st===2).length,0)}, team ${db.team.length}`);
await pool.end();
process.exit(errs ? 1 : 0);
