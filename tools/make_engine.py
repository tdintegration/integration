import re
src = open('tools/source_main.js', encoding='utf-8').read()
h = src

def rep(old, new, count=1):
    global h
    assert h.count(old) == count, (old[:90], h.count(old))
    h = h.replace(old, new)

def cut(start_marker, end_marker):
    """remove from start_marker (inclusive) up to end_marker (exclusive)"""
    global h
    i = h.index(start_marker); j = h.index(end_marker, i)
    h = h[:i] + h[j:]

# ---- header comment
h = h.replace("/* TD Integration Plan Management - logica applicativa. Nessuna dipendenza esterna. */",
 "/* TD Integration Plan Management - motore GANTT (vanilla JS), portato dalla pagina autocontenuta alla webapp td-integration.\n   Stato caricato dal server (REST), modifiche sincronizzate per singola entità, aggiornamenti in tempo reale via SSE. */", 1)

# ---- T(): no ART
rep("function T(k) { var d = (ART && I18N[k + '_pub']) || I18N[k]; return d ? (d[LANG] || d.it) : k; }",
    "function T(k) { var d = I18N[k + '_app'] || I18N[k]; return d ? (d[LANG] || d.it) : k; }")

# ---- i18n app variants
rep("  saveFile: { it: 'Salva nel file', en: 'Save to file' },\n",
"""  saveFile: { it: 'Salva nel file', en: 'Save to file' },
  chipDirty_app: { it: 'salvataggio in corso…', en: 'saving…' },
  chipSync_app: { it: 'sincronizzato', en: 'synced' },
  chipOffline: { it: 'offline: modifiche in coda', en: 'offline: changes queued' },
  chipErr: { it: 'errore di salvataggio', en: 'save error' },
  revLog_app: { it: 'Ultime modifiche (registro attività)', en: 'Latest changes (activity log)' },
  revNone_app: { it: 'Nessuna modifica registrata.', en: 'No change recorded yet.' },
  roMsg: { it: 'Profilo in sola lettura: le modifiche non sono consentite.', en: 'Read-only profile: changes are not allowed.' },
  conflictMsg: { it: 'Un altro utente ha appena modificato questo elemento: la riga è stata aggiornata con la sua versione.', en: 'Another user just changed this item: the row has been refreshed with their version.' },
  remoteChange: { it: '{who} ha aggiornato {what}', en: '{who} updated {what}' },
  importConfirm: { it: 'Importare i dati dal file nel database condiviso? Le attività più recenti nel file sostituiscono quelle attuali (viene salvato prima uno snapshot di sicurezza).', en: 'Import the file data into the shared database? Newer activities in the file replace current ones (a safety snapshot is saved first).' },
  importDone: { it: 'Importazione completata e condivisa con il team.', en: 'Import completed and shared with the team.' },
""")

# ---- STATE: empty until loaded
rep("""var STATE = { targets: seedTargets(), team: JSON.parse(JSON.stringify(TD_TEAM)), page: 'cover',
  meta: { rev: 0, savedBy: '', savedAt: '', log: [] } };
STATE.targets.forEach(sortActs);
""", """var STATE = { targets: [], team: [], page: 'cover', meta: { rev: 0, savedBy: '', savedAt: '', log: [] } };
""")
rep("""var DIRTY = false, BOOT_SRC = '', BANNER_OFF = false, FLASH = '', FILE_HANDLE = null, LAST_SAVE_VIA = '';
/* modalità pagina pubblicata su claude.ai: ART = capability artifact (publish), DL = capability downloads */
var ART = null, ART_RO = false, DL = null, PUBLISHING = false, BODY_SRC = '';""",
"""var DIRTY = false, BOOT_SRC = '', BANNER_OFF = false, FLASH = '';
/* contesto applicativo (impostato da IPM.mount) */
var IPM_OPTS = { api: null, user: null, readOnly: true, onState: null, onToast: null };
function canEdit() { return !IPM_OPTS.readOnly; }
function roToast() { if (IPM_OPTS.onToast) IPM_OPTS.onToast(T('roMsg'), 'err'); }""")

# ---- touch(): schedule sync
rep("function touch(o) { if (o) o.lm = Date.now(); DIRTY = true; }",
    "function touch(o) { if (o) { o.lm = Date.now(); SYNC.schedule(o); } DIRTY = true; }")

# ---- save(): no local persistence; the chip reflects SYNC state
rep("""function save() {
  ensureMeta();
  var ts = DIRTY ? Date.now() : (Date.parse(STATE.meta.savedAt) || 0);
  try { localStorage.setItem('td_ipm_v3', JSON.stringify({ v: 2, targets: STATE.targets, team: STATE.team, meta: STATE.meta, touchedAt: ts })); } catch (e) {}
}""", "function save() { /* lo stato vive sul server: niente persistenza locale */ }")

# ---- remove readEmbed / tryLoad
cut("function readEmbed() {", "function render() {")

# ---- render(): nav + no header, no save()
rep("""  h += '<span class="sp"></span>';
  h += '<span class="syncchip ' + (DIRTY ? 'warn' : 'ok') + '" title="' + T('rev') + ' ' + (ensureMeta().rev || 0) + '"><span class="dot"></span>' + T(DIRTY ? 'chipDirty' : 'chipSync') + '</span>';
  if (!ART_RO) h += '<button class="navsave" onclick="saveToFile()">💾 ' + T('saveFile') + '</button>';
  h += '<button onclick="addTarget()">' + T('newTarget') + '</button>';
  h += '<button onclick="exportJSON()">📊 ' + T('export_') + '</button>';
  h += '<button onclick="byId(\\'impfile\\').click()">📂 ' + T('import_') + '</button>';
  h += '<button onclick="byId(\\'mrgfile\\').click()">⇪ ' + T('mergeBtn') + '</button>';
  h += '<button onclick="openPrint()">🖨 ' + T('print') + '</button>';
  nav.innerHTML = h;
  renderBanner();
  byId('h-title').innerHTML = LANG === 'it' ? 'Integration <span class="hl">Plan Management</span>' : 'Integration <span class="hl">Plan Management</span>';
  byId('h-sub').textContent = T('sub');
  var m = byId('main');
  if (STATE.page === 'cover') renderCover(m); else renderTarget(m, STATE.targets.find(function (t) { return t.id === STATE.page; }));
  save();
}""", """  h += '<span class="sp"></span>';
  h += syncChipHtml();
  if (canEdit()) h += '<button onclick="addTarget()">' + T('newTarget') + '</button>';
  h += '<button onclick="exportJSON()">📊 ' + T('export_') + '</button>';
  if (IPM_OPTS.user && IPM_OPTS.user.role === 'ADMIN') {
    h += '<button onclick="byId(\\'impfile\\').click()">📂 ' + T('import_') + '</button>';
    h += '<button onclick="byId(\\'mrgfile\\').click()">⇪ ' + T('mergeBtn') + '</button>';
  }
  h += '<button onclick="openPrint()">🖨 ' + T('print') + '</button>';
  nav.innerHTML = h;
  renderBanner();
  var m = byId('main');
  if (STATE.page === 'cover') renderCover(m); else renderTarget(m, STATE.targets.find(function (t) { return t.id === STATE.page; }));
  if (IPM_OPTS.onState) IPM_OPTS.onState({ page: STATE.page, targets: STATE.targets.map(function (t) { return { id: t.id, nome: t.nome }; }) });
}
function syncChipHtml() {
  var s = SYNC.status();
  var cls = s === 'ok' ? 'ok' : (s === 'err' ? 'err' : 'warn');
  var key = s === 'ok' ? 'chipSync' : s === 'pending' ? 'chipDirty' : s === 'offline' ? 'chipOffline' : 'chipErr';
  return '<span class="syncchip ' + cls + '" title="' + T('rev') + ' ' + (ensureMeta().rev || 0) + '"><span class="dot"></span>' + T(key) + '</span>';
}""")

# ---- cover: team editing guarded for read-only
rep("""  h += '</tbody></table></div><div style="margin-top:8px"><button class="btn mini ghost" onclick="addTeam()">' + T('addRole') + '</button></div></div>';""",
    """  h += '</tbody></table></div>' + (canEdit() ? '<div style="margin-top:8px"><button class="btn mini ghost" onclick="addTeam()">' + T('addRole') + '</button></div>' : '') + '</div>';""")

# ---- team mutations
rep("function edTeam(i, k, v) { STATE.team[i][k] = v; touch(STATE.team[i]); render(); }\nfunction delTeam(i) { STATE.team.splice(i, 1); render(); }\nfunction addTeam() { STATE.team.push({ r: '', f: 'Interna', n: '' }); render(); }",
    "function edTeam(i, k, v) { if (!canEdit()) return roToast(); STATE.team[i][k] = v; STATE.team[i].lm = Date.now(); SYNC.team(); render(); }\nfunction delTeam(i) { if (!canEdit()) return roToast(); STATE.team.splice(i, 1); SYNC.team(); render(); }\nfunction addTeam() { if (!canEdit()) return roToast(); STATE.team.push({ r: '', f: 'Interna', n: '' }); SYNC.team(); render(); }")

# ---- target field setters
rep("""function setNF(tid, k, v) {
  var n = parseInt(String(v).replace(/[^\\d-]/g, ''), 10);
  tg(tid)[k] = isNaN(n) ? '' : n;
  render();
}""", """function setNF(tid, k, v) {
  if (!canEdit()) return roToast();
  var n = parseInt(String(v).replace(/[^\\d-]/g, ''), 10);
  var t = tg(tid); t[k] = isNaN(n) ? '' : n; touch(t);
  render();
}""")
rep("""function delTarget(tid) {
  var t = tg(tid);
  tdConfirm(T('confermaDel') + ' ' + t.nome + '?', function () {
    STATE.targets = STATE.targets.filter(function (x) { return x.id !== tid; });
    DIRTY = true;
    go('cover');
  });
}""", """function delTarget(tid) {
  if (!canEdit()) return roToast();
  var t = tg(tid);
  tdConfirm(T('confermaDel') + ' ' + t.nome + '?', function () {
    STATE.targets = STATE.targets.filter(function (x) { return x.id !== tid; });
    SYNC.deleteTarget(tid);
    go('cover');
  });
}""")
rep("function setF(tid, k, v) { var t = tg(tid); t[k] = v; touch(t); render(); }\nfunction setHor(tid, v) { var t = tg(tid); t.hor = Math.max(8, Math.min(52, +v || 24)); touch(t); render(); }\nfunction togLinea(tid, l) {\n  var t = tg(tid); var i = t.linee.indexOf(l);\n  if (i >= 0) t.linee.splice(i, 1); else t.linee.push(l);\n  render();\n}",
    "function setF(tid, k, v) { if (!canEdit()) return roToast(); var t = tg(tid); t[k] = v; touch(t); render(); }\nfunction setHor(tid, v) { if (!canEdit()) return roToast(); var t = tg(tid); t.hor = Math.max(8, Math.min(52, +v || 24)); touch(t); render(); }\nfunction togLinea(tid, l) {\n  if (!canEdit()) return roToast();\n  var t = tg(tid); t.linee = t.linee || []; var i = t.linee.indexOf(l);\n  if (i >= 0) t.linee.splice(i, 1); else t.linee.push(l);\n  touch(t);\n  render();\n}")

# ---- activity mutations
rep("""  var moved = t.atts.splice(from, 1)[0];
  t.atts.splice(to, 0, moved);
  DRAG_AID = null;
  DIRTY = true;
  render();
}""", """  var moved = t.atts.splice(from, 1)[0];
  t.atts.splice(to, 0, moved);
  DRAG_AID = null;
  SYNC.reorder(t);
  render();
}""")
rep("function dragDrop(ev, tid, aid) {\n  ev.preventDefault();", "function dragDrop(ev, tid, aid) {\n  ev.preventDefault();\n  if (!canEdit()) { DRAG_AID = null; return roToast(); }")
rep("""function delA(tid, aid) {
  var t = tg(tid);
  t.atts = t.atts.filter(function (x) { return x.id !== aid; });
  DIRTY = true;
  OPEN_EDIT = null; render();
}""", """function delA(tid, aid) {
  if (!canEdit()) return roToast();
  var t = tg(tid);
  t.atts = t.atts.filter(function (x) { return x.id !== aid; });
  SYNC.deleteActivity(tid, aid);
  OPEN_EDIT = null; render();
}""")
rep("""function addFromCat(tid, cid) {
  var t = tg(tid), c = catById(cid);
  var a = act(cid, c.sw || 0, c.ew || 0);
  a.id = 'cat_' + cid;
  touch(a);
  t.atts.push(a);
  render();
}""", """function addFromCat(tid, cid) {
  if (!canEdit()) return roToast();
  var t = tg(tid), c = catById(cid);
  var a = act(cid, c.sw || 0, c.ew || 0);
  a.id = 'cat_' + cid;
  if (t.atts.some(function (x) { return x.id === a.id; })) a.id += '_' + Date.now().toString(36);
  bindAct(a, t.id);
  t.atts.push(a);
  SYNC.createActivity(t, a);
  render();
}""")
rep("""  a.id = 'x' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  touch(a);
  t.atts.push(a);
  OPEN_EDIT = a.id;
  render();
}""", """  a.id = 'x' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  bindAct(a, t.id);
  t.atts.push(a);
  SYNC.createActivity(t, a);
  OPEN_EDIT = a.id;
  render();
}""")
rep("function addCustom(tid) {\n  var t = tg(tid);", "function addCustom(tid) {\n  if (!canEdit()) return roToast();\n  var t = tg(tid);")
rep("function cellClick(tid, aid, w) {\n", "function cellClick(tid, aid, w) {\n  if (!canEdit()) return roToast();\n")
rep("function edA(tid, aid, k, v) {\n", "function edA(tid, aid, k, v) {\n  if (!canEdit()) return roToast();\n")
rep("function togSupport(tid, aid, r) {\n", "function togSupport(tid, aid, r) {\n  if (!canEdit()) return roToast();\n")
rep("function sortChrono(tid) { sortActs(tg(tid)); render(); }", "function sortChrono(tid) { if (!canEdit()) return roToast(); var t = tg(tid); sortActs(t); SYNC.reorder(t); render(); }")
rep("function alignOwnership(tid) {\n  var src = tg(tid);", "function alignOwnership(tid) {\n  if (!canEdit()) return roToast();\n  var src = tg(tid);")

# addTarget: create on server
old_add = h[h.index('function addTarget() {'):]
old_add = old_add[:old_add.index('\n}\n') + 3]
new_add = old_add.replace("function addTarget() {\n", "function addTarget() {\n  if (!canEdit()) return roToast();\n") \
                 .replace("  touch(nt);\n  STATE.targets.push(nt);\n  go(id);", "  nt.atts.forEach(function (a) { bindAct(a, nt.id); });\n  nt.lm = Date.now();\n  STATE.targets.push(nt);\n  SYNC.createTarget(nt);\n  go(id);")
assert new_add != old_add
h = h.replace(old_add, new_add)

# ---- import / merge: admin-only full import via server
rep("""      try { if (applyLoaded(JSON.parse(r.result))) { DIRTY = true; STATE.page = 'cover'; render(); return; } } catch (e) {}
      tdAlert(T('importErr'));""", """      try { var dj = JSON.parse(r.result); if (dj && dj.targets && dj.targets.length) { importIntoServer(dj); return; } } catch (e) {}
      tdAlert(T('importErr'));""")
rep("""        if (applyLoaded(found)) { DIRTY = true; STATE.page = 'cover'; render(); return; }
      } catch (e) {}
      tdAlert(T('importErr'));""", """        if (found && found.targets && found.targets.length) { importIntoServer(found); return; }
      } catch (e) {}
      tdAlert(T('importErr'));""")
rep("""    if (!st) { tdAlert(T('mergeErr')); return; }
    var rep = mergeStates(st);
    save(); render();
    var tot = rep.aU + rep.aN + rep.tN + rep.gU;
    FLASH = tot ? T('mergeRep').replace('{aU}', rep.aU).replace('{aN}', rep.aN).replace('{tN}', rep.tN).replace('{gU}', rep.gU) : T('mergeNo');
    render();""", """    if (!st) { tdAlert(T('mergeErr')); return; }
    importIntoServer(st);""")

# ---- remove banner ART/BOOT branches
rep("""  if (ART_RO && !FLASH) h += '<div class="bnr warn">🔒 ' + T('pubRO') + '</div>';
  if (BOOT_SRC && !BANNER_OFF) {
    if (BOOT_SRC === 'file') {
      var m = ensureMeta(), d = m.savedAt ? new Date(m.savedAt) : null;
      h += '<div class="bnr info">📄 ' + T('srcFile') + (m.rev ? ' · ' + T('rev') + ' ' + m.rev : '') +
        (m.savedBy ? ' · ' + esc(m.savedBy) : '') +
        (d ? ' · ' + fmtDY(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : '') +
        '<button class="x" onclick="BANNER_OFF=true;render()">✕</button></div>';
    } else {
      h += '<div class="bnr warn">⚠ ' + T(BOOT_SRC === 'localNew' ? 'srcLocalNew' : 'srcLocalOnly') +
        '<button class="x" onclick="BANNER_OFF=true;render()">✕</button></div>';
    }
  }
  el.innerHTML = h;""", """  if (IPM_OPTS.readOnly) h += '<div class="bnr info">🔒 ' + T('roMsg') + '</div>';
  el.innerHTML = h;""")

# ---- remove file-save machinery (captureBodySrc .. doSaveFile)
cut("function captureBodySrc() {", "function stateFromXlsxBytes(u8) {")

# ---- exportJSON: plain download
rep("""  if (DL) {
    DL.save({ filename: fname, data: blob }).then(function () { FLASH = T('saved'); render(); })
      .catch(function (e) { if (e && e.code === 'declined') return; tdAlert(T('pubErr')); });
    return;
  }
""", "")
rep("""  a.click();
  tdAlert(T('saved'));
}""", """  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  if (IPM_OPTS.onToast) IPM_OPTS.onToast(T('saved'));
}""")

# ---- setLang: no header buttons
rep("""function setLang(l) {
  LANG = l;
  byId('lang-it').classList.toggle('on', l === 'it');
  byId('lang-en').classList.toggle('on', l === 'en');
  document.documentElement.lang = l;
  render();
}""", """function setLang(l) {
  LANG = l;
  try { localStorage.setItem('tdi_lang', l); } catch (e) {}
  var bi = byId('lang-it'), be = byId('lang-en');
  if (bi) bi.classList.toggle('on', l === 'it');
  if (be) be.classList.toggle('on', l === 'en');
  render();
}""")

# ---- boot -> mount
old_boot = h[h.index('function boot() {'):h.index('/* ---------------- finestre di dialogo')]
h = h.replace(old_boot, "")
# dialogs mount inside root so scoped CSS applies
rep("  document.body.appendChild(d);\n  var close = function () { d.remove(); };", "  (byId('ipm-root') || document.body).appendChild(d);\n  var close = function () { d.remove(); };")
rep("var _render0 = render;\nrender = function () { _render0(); refreshOwnlist(); };\nboot();",
    "var _render0 = render;\nrender = function () { if (!byId('main')) return; _render0(); refreshOwnlist(); };")

# ---- strip the embedded seed data (seedTargets) to keep the engine lean
i = h.index('function seedTargets() {'); j = h.index('function sortActs(t) {')
h = h[:i] + "function seedTargets() { return []; }\n" + h[j:]

# ---- append sync layer + mount API
h += r'''

/* ================= strato dati: REST + SSE ================= */
function bindAct(a, tid) { Object.defineProperty(a, '_t', { value: tid, enumerable: false, writable: true, configurable: true }); return a; }
function cleanObj(o) { var c = {}; Object.keys(o).forEach(function (k) { if (k !== 'atts' && k[0] !== '_') c[k] = o[k]; }); return c; }
function applyServerRow(local, row) { Object.keys(row).forEach(function (k) { if (k === 'atts' || k === 'position' || k === 'target_id') return; local[k] = row[k]; }); }

var SYNC = (function () {
  var pending = {};        // key -> {kind, obj, tid}
  var timer = null, inflight = 0, offline = false, lastErr = false;
  var TARGET_DEBOUNCE = 350;
  function key(kind, tid, id) { return kind + ':' + (tid || '') + ':' + (id || ''); }
  function status() {
    if (offline) return 'offline';
    if (lastErr) return 'err';
    if (inflight || Object.keys(pending).length) return 'pending';
    return 'ok';
  }
  function schedule(o) {
    if (!o) return;
    if (o.atts) pending[key('target', o.id)] = { kind: 'target', obj: o };
    else if (o._t) pending[key('act', o._t, o.id)] = { kind: 'act', obj: o, tid: o._t };
    else if ('r' in o && 'f' in o) { team(); return; }
    clearTimeout(timer); timer = setTimeout(flush, TARGET_DEBOUNCE);
    updateChip();
  }
  function team() { pending[key('team')] = { kind: 'team' }; clearTimeout(timer); timer = setTimeout(flush, TARGET_DEBOUNCE); updateChip(); }
  function reorder(t) { pending[key('order', t.id)] = { kind: 'order', obj: t }; clearTimeout(timer); timer = setTimeout(flush, 50); updateChip(); }
  function createActivity(t, a) { run(function () { return IPM_OPTS.api.post('/targets/' + enc(t.id) + '/activities', cleanObj(a)); }, function (row) { applyServerRow(a, row); }); }
  function deleteActivity(tid, aid) { run(function () { return IPM_OPTS.api.del('/targets/' + enc(tid) + '/activities/' + enc(aid)); }); }
  function createTarget(t) {
    var body = cleanObj(t); body.atts = t.atts.map(cleanObj);
    run(function () { return IPM_OPTS.api.post('/targets', body); }, function (row) { applyServerRow(t, row); });
  }
  function deleteTarget(tid) { run(function () { return IPM_OPTS.api.del('/targets/' + enc(tid)); }); }
  function enc(s) { return encodeURIComponent(s); }
  function updateChip() { var n = document.querySelector('#ipm-root .syncchip'); if (n) n.outerHTML = syncChipHtml(); }
  function run(fn, onOk) {
    inflight++; updateChip();
    return fn().then(function (row) {
      inflight--; offline = false; lastErr = false;
      if (onOk) onOk(row);
      updateChip();
      return row;
    }).catch(function (e) {
      inflight--;
      handleErr(e);
      updateChip();
    });
  }
  function handleErr(e) {
    if (e && e.status === 409 && e.current) {
      // conflitto: adotta la versione del server
      adoptCurrent(e.current);
      if (IPM_OPTS.onToast) IPM_OPTS.onToast(T('conflictMsg'), 'err');
      render();
      return;
    }
    if (e && e.status === 403) { if (IPM_OPTS.onToast) IPM_OPTS.onToast(e.message || T('roMsg'), 'err'); reloadAll(); return; }
    if (e && e.status === 401) return; // gestito dalla shell (sessione scaduta)
    if (!e || !e.status) { offline = true; retrySoon(); return; }
    lastErr = true;
    if (IPM_OPTS.onToast) IPM_OPTS.onToast((e && e.message) || 'Errore di salvataggio', 'err');
  }
  var retryTimer = null;
  function retrySoon() { clearTimeout(retryTimer); retryTimer = setTimeout(function () { flush(); }, 4000); }
  function adoptCurrent(cur) {
    if (cur.kind === 'activity') {
      var t = tg(cur.row.target_id); if (!t) return;
      var a = t.atts.find(function (x) { return x.id === cur.row.id; });
      if (a) applyServerRow(a, cur.row);
    } else if (cur.kind === 'target') {
      var tt = tg(cur.row.id); if (tt) applyServerRow(tt, cur.row);
    }
  }
  function flush() {
    var items = pending; pending = {};
    Object.keys(items).forEach(function (k) {
      var it = items[k];
      if (it.kind === 'act') {
        var a = it.obj, tid = it.tid;
        run(function () { return IPM_OPTS.api.patch('/targets/' + enc(tid) + '/activities/' + enc(a.id), cleanObj(a)); },
            function (row) { applyServerRow(a, row); });
      } else if (it.kind === 'target') {
        var t = it.obj;
        run(function () { return IPM_OPTS.api.patch('/targets/' + enc(t.id), cleanObj(t)); }, function (row) { applyServerRow(t, row); });
      } else if (it.kind === 'order') {
        var tt = it.obj;
        run(function () { return IPM_OPTS.api.put('/targets/' + enc(tt.id) + '/order', { ids: tt.atts.map(function (a) { return a.id; }) }); });
      } else if (it.kind === 'team') {
        run(function () { return IPM_OPTS.api.put('/team', { members: STATE.team.map(cleanObj) }); },
            function (rows) { if (Array.isArray(rows)) STATE.team = rows; });
      }
    });
    updateChip();
  }
  function flushNow() { clearTimeout(timer); flush(); }
  return { schedule: schedule, team: team, reorder: reorder, createActivity: createActivity, deleteActivity: deleteActivity,
           createTarget: createTarget, deleteTarget: deleteTarget, status: status, flushNow: flushNow, isIdle: function () { return !inflight && !Object.keys(pending).length; } };
})();

function loadPlan(data) {
  STATE.targets = (data.targets || []).map(function (t) { (t.atts || []).forEach(function (a) { normAtt(a); bindAct(a, t.id); }); return t; });
  STATE.team = data.team || [];
  STATE.meta = data.meta || { rev: 0, log: [] };
  ensureMeta();
  if (STATE.page !== 'cover' && !tg(STATE.page)) STATE.page = 'cover';
}
function reloadAll() {
  return IPM_OPTS.api.get('/plan').then(function (d) { loadPlan(d); render(); });
}
function importIntoServer(st) {
  tdConfirm(T('importConfirm'), function () {
    IPM_OPTS.api.post('/plan/import', { targets: st.targets, team: st.team || [], meta: st.meta || null })
      .then(function () { return reloadAll(); })
      .then(function () { FLASH = T('importDone'); STATE.page = 'cover'; render(); })
      .catch(function (e) { tdAlert((e && e.message) || T('importErr')); });
  });
}

/* eventi in tempo reale dagli altri utenti */
function applyRemoteEvent(ev) {
  if (!ev || !ev.type) return;
  if (ev.clientId && ev.clientId === IPM_CLIENT_ID) return;   // già applicato localmente
  var d = ev.data || {};
  if (ev.type === 'activity.updated' || ev.type === 'activity.created') {
    var t = tg(d.target_id); if (!t) return reloadAll();
    var a = t.atts.find(function (x) { return x.id === d.id; });
    if (!a) { a = bindAct({}, t.id); t.atts.push(a); }
    applyServerRow(a, d); normAtt(a);
    if (ev.type === 'activity.created' || d.position != null) { t.atts.sort(function (x, y) { return (x.position || 0) - (y.position || 0); }); }
  } else if (ev.type === 'activity.deleted') {
    var t2 = tg(d.target_id); if (t2) t2.atts = t2.atts.filter(function (x) { return x.id !== d.id; });
  } else if (ev.type === 'activities.reordered') {
    var t3 = tg(d.target_id); if (!t3) return;
    var pos = {}; (d.ids || []).forEach(function (id, i) { pos[id] = i; });
    t3.atts.forEach(function (a) { a.position = pos[a.id] != null ? pos[a.id] : 9999; });
    t3.atts.sort(function (x, y) { return x.position - y.position; });
  } else if (ev.type === 'target.updated') {
    var t4 = tg(d.id); if (t4) applyServerRow(t4, d); else return reloadAll();
  } else if (ev.type === 'target.created' || ev.type === 'target.deleted' || ev.type === 'plan.replaced') {
    return reloadAll();
  } else if (ev.type === 'team.updated') {
    STATE.team = d.members || STATE.team;
  }
  if (ev.meta) STATE.meta = ev.meta;
  if (ev.by && IPM_OPTS.onToast && ev.type !== 'team.updated') {
    IPM_OPTS.onToast(T('remoteChange').replace('{who}', ev.by).replace('{what}', ev.label || ''), 'info');
  }
  render();
}

var IPM_CLIENT_ID = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
var IPM_ES = null;
function connectEvents() {
  if (IPM_ES) { try { IPM_ES.close(); } catch (e) {} }
  if (typeof EventSource === 'undefined') return;
  IPM_ES = new EventSource('/api/events');
  IPM_ES.onmessage = function (m) { try { applyRemoteEvent(JSON.parse(m.data)); } catch (e) {} };
  IPM_ES.onerror = function () { /* il browser riconnette da solo; al ritorno ricarichiamo lo stato */ };
  IPM_ES.onopen = function () { if (IPM_BOOTED) reloadAll(); };
}
var IPM_BOOTED = false;

window.IPM = {
  mount: function (opts) {
    IPM_OPTS = Object.assign(IPM_OPTS, opts || {});
    IPM_OPTS.api = Object.assign({}, IPM_OPTS.api, { clientId: IPM_CLIENT_ID });
    try { var l = localStorage.getItem('tdi_lang'); if (l === 'en' || l === 'it') LANG = l; } catch (e) {}
    var imp = byId('impfile'), mrg = byId('mrgfile');
    if (imp) imp.addEventListener('change', importJSON);
    if (mrg) mrg.addEventListener('change', mergeFile);
    return IPM_OPTS.api.get('/plan').then(function (d) {
      loadPlan(d);
      render();
      connectEvents();
      IPM_BOOTED = true;
    });
  },
  unmount: function () { if (IPM_ES) { try { IPM_ES.close(); } catch (e) {} IPM_ES = null; } IPM_BOOTED = false; },
  go: function (p) { go(p); },
  setLang: setLang,
  getLang: function () { return LANG; },
  exportXlsx: function () { exportJSON(); },
  print: function () { openPrint(); },
  flush: function () { SYNC.flushNow(); },
  clientId: IPM_CLIENT_ID,
  state: function () { return STATE; },
};
window.addEventListener('beforeunload', function () { SYNC.flushNow(); });
'''

# sanity: no leftovers
for bad in ['ART', 'localStorage.getItem(\'td_ipm', 'showSaveFilePicker', 'td-embed', 'h-title', 'captureBodySrc', 'seedTargets()']:
    pass
assert 'showSaveFilePicker' not in h and "byId('h-title')" not in h and 'captureBodySrc' not in h
assert 'ART_RO' not in h and 'readEmbed' not in h
open('web/public/ipm-engine.js', 'w', encoding='utf-8').write(h)
print('ok', len(src), '->', len(h))

# Correzioni manuali applicate dopo la generazione (già presenti in web/public/ipm-engine.js):
# 1) tdDialog: d.className = 'ipm-modal show' (evita il conflitto con la classe .modal di td-cash)
# 2) renderCover: la tabella "ultime modifiche" mostra anche la descrizione (e.what) e usa '#' + e.rev
