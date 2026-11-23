/* STRAM Suivi — stockage local, historique, sauvegardes et synchronisation par fichier */
'use strict';
const S = (() => {
  const COLS = ['lots', 'entreprises', 'taches', 'articles', 'mouvements', 'fournisseurs', 'commandes', 'marches', 'situations',
    'budget', 'journal', 'reunions', 'actions', 'reserves', 'personnes', 'habilites', 'acces', 'documents',
    'avancements', 'photos', 'utilisateurs', 'plans', 'essais', 'autocontroles', 'opr', 'fichiers', 'rapports'];
  /* droits par rôle : collections modifiables */
  const ROLES = {
    'Administrateur': '*',
    'Conducteur de travaux': COLS_ALL => COLS_ALL.filter(c => c !== 'utilisateurs'),
    'Magasinier': ['mouvements', 'articles', 'commandes', 'fournisseurs', 'acces', 'personnes', 'journal', 'photos'],
    'Lecture seule': [],
  };
  let user = null;
  const KEY = 'stram-suivi-data-v1';
  const host = window.stramHost || null; // fourni par Electron (preload)
  let data = null;
  const listeners = [];

  const blank = () => {
    const d = { schema: 1, appareil: U.uid(), creeLe: new Date().toISOString(), projet: {}, historique: [], reference: null };
    COLS.forEach(c => d[c] = []);
    return d;
  };

  async function load() {
    let raw = null;
    try { raw = host ? await host.load() : localStorage.getItem(KEY); } catch (e) { console.error(e); }
    if (raw) { try { data = JSON.parse(raw); } catch (e) { data = null; } }
    if (!data) { data = blank(); if (typeof SEED !== 'undefined') SEED.apply(data); await persist(true); }
    COLS.forEach(c => { if (!Array.isArray(data[c])) data[c] = []; });
    if (!data.historique) data.historique = [];
    if (data.projet && data.projet.utilisateur === undefined) data.projet.utilisateur = 'Aliou';
    if (!data.taches.some(t => !t._del && t.phase) && typeof PLANV5 !== 'undefined') data.proposerV5 = true;
    if (typeof SEED !== 'undefined' && SEED.migrateColors) SEED.migrateColors(data);
    applyCalendar();
    return data;
  }
  const applyCalendar = () => U.setCalendar(data.projet.joursOuvres, (data.projet.feries || '').split(/[\s,;]+/).filter(Boolean));

  let saveTimer = null;
  function persist(now) {
    const write = async () => {
      const json = JSON.stringify(data);
      try { if (host) await host.save(json); else localStorage.setItem(KEY, json); }
      catch (e) { console.error(e); typeof UI !== 'undefined' && UI.toast('Échec de l\'enregistrement : ' + e.message, 'err'); }
    };
    clearTimeout(saveTimer);
    if (now) return write();
    saveTimer = setTimeout(write, 300);
  }
  /* ---- suivi des modifications à envoyer à la base en ligne ---- */
  const DK = (c, i) => c + '\u0001' + i;
  const hid = h => h.t + '|' + String(h.texte).slice(0, 60);
  function mark(col, id) { if (!data._dirty) data._dirty = {}; data._dirty[DK(col, id)] = 1; }
  function markAll() {
    data._dirty = {};
    COLS.forEach(c => data[c].forEach(r => mark(c, r.id)));
    mark('_meta', 'projet'); if (data.reference) mark('_meta', 'reference');
    data.historique.forEach(h => mark('_hist', hid(h)));
  }
  function rowOf(col, id) {
    if (col === '_meta') {
      if (id === 'projet') return { col, id, data: data.projet || {}, maj: (data.projet && data.projet.maj) || '0', del: false };
      if (id === 'reference') return { col, id, data: { reference: data.reference }, maj: data.referenceMaj || '0', del: false };
      return null;
    }
    if (col === '_hist') { const h = data.historique.find(x => hid(x) === id); return h ? { col, id, data: h, maj: h.t, del: false } : null; }
    if (!data[col]) return null;
    const r = data[col].find(x => x.id === id); if (!r) return null;
    return { col, id, data: r, maj: r.maj || r.cree || '0', del: !!r._del };
  }
  function dirtyRows() {
    return Object.keys(data._dirty || {}).map(k => { const [c, i] = k.split('\u0001'); return rowOf(c, i); }).filter(Boolean);
  }
  function clearDirty(rows) { rows.forEach(r => { const cur = rowOf(r.col, r.id); if (!cur || cur.maj === r.maj) delete data._dirty[DK(r.col, r.id)]; }); persist(); }
  /* marque une fiche modifiée hors formulaire (migration…) pour l'enregistrer et la synchroniser */
  function touch(col, r) { r.maj = new Date().toISOString(); mark(col, r.id); }
  const pendingCount = () => Object.keys(data._dirty || {}).length;
  /* applique des fiches reçues de la base : la modification la plus récente l'emporte */
  function applyRemote(rows) {
    let n = 0; let cal = false;
    rows.forEach(o => {
      const k = DK(o.col, o.id);
      if (o.col === '_meta') {
        if (o.id === 'projet' && (o.maj || '') > ((data.projet && data.projet.maj) || '')) { data.projet = o.data; cal = true; n++; delete (data._dirty || {})[k]; }
        if (o.id === 'reference' && (o.maj || '') > (data.referenceMaj || '')) { data.reference = o.data.reference; data.referenceMaj = o.maj; n++; delete (data._dirty || {})[k]; }
        return;
      }
      if (o.col === '_hist') { if (!data.historique.some(h => hid(h) === o.id)) { data.historique.push(o.data); n++; } return; }
      if (!COLS.includes(o.col)) return;
      const mine = data[o.col].find(x => x.id === o.id);
      if (!mine) { data[o.col].push(o.data); n++; }
      else if ((o.maj || '') > (mine.maj || mine.cree || '')) { Object.keys(mine).forEach(x => delete mine[x]); Object.assign(mine, o.data); n++; delete (data._dirty || {})[k]; }
    });
    if (n) {
      data.historique.sort((a, b) => b.t.localeCompare(a.t)); if (data.historique.length > 800) data.historique.length = 800;
      if (cal) applyCalendar();
      persist(); listeners.forEach(f => f('*'));
    }
    return n;
  }
  /* remplace les données de cet appareil par une base vide avant de tout récupérer depuis la base en ligne */
  function restoreRaw(d) { data = d; COLS.forEach(c => { if (!Array.isArray(data[c])) data[c] = []; }); applyCalendar(); listeners.forEach(f => f('*')); return persist(true); }
  function wipeForCloud() { const app = data.appareil; data = blank(); data.appareil = app; data._dirty = {}; return persist(true); }

  const changed = (col) => { persist(); listeners.forEach(f => f(col)); };
  const onChange = f => listeners.push(f);

  const log = (texte) => {
    const h = { t: new Date().toISOString(), texte: user ? `${texte} — ${user.nom}` : texte };
    data.historique.unshift(h); mark('_hist', hid(h));
    if (data.historique.length > 800) data.historique.length = 800;
  };

  const list = col => data[col].filter(r => !r._del);
  const get = (col, id) => data[col].find(r => r.id === id && !r._del) || null;
  function can(col) {
    if (!user) return !list('utilisateurs').length;
    const r = ROLES[user.role];
    if (r === '*') return true;
    const allowed = typeof r === 'function' ? r(COLS) : (r || []);
    return allowed.includes(col);
  }
  function guard(col) { if (!can(col)) { const e = new Error('Droits insuffisants : votre profil ne permet pas cette modification'); e.droits = true; throw e; } }
  function save(col, obj, libelle) {
    guard(col);
    const now = new Date().toISOString();
    obj = Object.assign({}, obj); if (!obj.id) delete obj.id;
    let r = obj.id ? data[col].find(x => x.id === obj.id) : null;
    if (r) Object.assign(r, obj, { maj: now });
    else { r = Object.assign({ id: U.uid(), cree: now }, obj, { maj: now }); data[col].push(r); }
    mark(col, r.id);
    if (libelle) log(libelle);
    changed(col);
    return r;
  }
  function remove(col, id, libelle) {
    guard(col);
    const r = data[col].find(x => x.id === id);
    if (!r) return;
    // suppression logique : conservée pour la synchronisation
    Object.keys(r).forEach(k => { if (!['id', 'cree'].includes(k)) delete r[k]; });
    r._del = true; r.maj = new Date().toISOString(); mark(col, id);
    if (libelle) log(libelle);
    changed(col);
  }
  function setProjet(p) { if (user && !['Administrateur', 'Conducteur de travaux'].includes(user.role)) guard('projet_'); return setProjetRaw(p); }
  const adminOnly = () => { if (list('utilisateurs').length && (!user || user.role !== 'Administrateur')) { const e = new Error('Réservé à l\'administrateur'); e.droits = true; throw e; } };
  function setProjetRaw(p) { data.projet = Object.assign({}, data.projet, p, { maj: new Date().toISOString() }); mark('_meta', 'projet'); applyCalendar(); log('Paramètres du projet modifiés'); changed('projet'); }
  function patchProjet(p, libelle) { data.projet = Object.assign({}, data.projet, p, { maj: new Date().toISOString() }); mark('_meta', 'projet'); applyCalendar(); if (libelle) log(libelle); changed('projet'); }
  function setReference(ref) { guard('taches'); data.reference = ref; data.referenceMaj = new Date().toISOString(); mark('_meta', 'reference'); changed('reference'); }

  /* ---- Synchronisation PC ↔ mobile par fichier ---- */
  const exportJSON = () => { data.derniereSync = new Date().toISOString(); changed('sync'); return JSON.stringify(Object.assign({}, data, { _dirty: undefined, _cloud: undefined, exporteLe: new Date().toISOString(), exportePar: data.appareil }), null, 0); };
  function merge(other) {
    if (user && user.role === 'Lecture seule') guard('x');
    if (!other || other.schema !== 1) throw new Error('Fichier non reconnu comme une sauvegarde STRAM Suivi.');
    let ajout = 0, maj = 0;
    COLS.forEach(c => {
      (other[c] || []).forEach(o => {
        const mine = data[c].find(x => x.id === o.id);
        if (!mine) { data[c].push(o); ajout++; mark(c, o.id); }
        else if ((o.maj || '') > (mine.maj || '')) { Object.keys(mine).forEach(k => delete mine[k]); Object.assign(mine, o); maj++; mark(c, o.id); }
      });
    });
    if ((other.projet?.maj || '') > (data.projet?.maj || '')) { data.projet = other.projet; mark('_meta', 'projet'); }
    if ((other.referenceMaj || '') > (data.referenceMaj || '')) { data.reference = other.reference; data.referenceMaj = other.referenceMaj; mark('_meta', 'reference'); }
    const seen = new Set(data.historique.map(h => h.t + h.texte));
    (other.historique || []).forEach(h => { if (!seen.has(h.t + h.texte)) { data.historique.push(h); mark('_hist', hid(h)); } });
    data.historique.sort((a, b) => b.t.localeCompare(a.t));
    applyCalendar();
    data.derniereSync = new Date().toISOString();
    log(`Synchronisation importée (${ajout} ajout(s), ${maj} mise(s) à jour)`);
    changed('*');
    return { ajout, maj };
  }
  function replaceAll(other) {
    adminOnly();
    if (!other || other.schema !== 1) throw new Error('Fichier non reconnu comme une sauvegarde STRAM Suivi.');
    const cloud = data._cloud; data = other; data._cloud = cloud; COLS.forEach(c => { if (!Array.isArray(data[c])) data[c] = []; }); if (!data.historique) data.historique = []; applyCalendar();
    markAll(); log('Sauvegarde restaurée'); persist(true); listeners.forEach(f => f('*'));
  }
  function resetDemo() { adminOnly(); const cloud = data._cloud; data = blank(); SEED.apply(data); data._cloud = cloud; markAll(); persist(true); listeners.forEach(f => f('*')); }

  const setUser = u => { user = u; };
  async function reloadFromHost() { const raw = host ? await host.load() : null; if (!raw) return; data = JSON.parse(raw); COLS.forEach(c => { if (!Array.isArray(data[c])) data[c] = []; }); applyCalendar(); listeners.forEach(f => f('*')); }
  return { patchProjet, touch, restoreRaw, markAll, dirtyRows, clearDirty, pendingCount, applyRemote, wipeForCloud, adminOnly, can, setUser, get user() { return user; }, ROLES, reloadFromHost, load, list, get, save, remove, setProjet, setReference, onChange, log, exportJSON, merge, replaceAll, resetDemo, persist, COLS,
    get data() { return data; }, host };
})();
