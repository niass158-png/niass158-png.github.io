/* STRAM Suivi — import d'un planning (format Phase / Tâche / Intervenant / Début / Fin / %) */
'use strict';
const IMPORT = (() => {
  const key = s => U.norm(s).replace(/[^a-z0-9]/g, '');
  const ROLES = { MO: "Maître d'ouvrage", MOE: "Maîtrise d'œuvre / BET", FOURN: 'Fournisseurs', TRANSPORT: 'Transport maritime', TRANSIT: 'Transit / dédouanement',
    KONE: 'Ascenseur (fabricant)', ENT: 'Entreprise à préciser', TOUS: 'Tous corps d\'état', SENELEC: 'Concessionnaire électricité', SONATEL: 'Opérateur télécom', BCT: 'Bureau de contrôle' };
  const SOFT = ['#8D9197', '#96999E', '#95999E', '#6797C1', '#92959A', '#5D90BD', '#7B8086', '#93969B', '#9EA1A5', '#8A8E93', '#9A9DA2', '#709DC5', '#898D92', '#94989D', '#A5A8AD'];

  /** Lit une feuille Excel (tableau de lignes) et repère les colonnes ; les lignes sans tâche servent de titres de phase */
  function rowsFromSheet(rows) {
    const h = rows.findIndex(r => r.some(c => /^t[aâ]che/i.test(String(c).trim())) && r.some(c => /^d[ée]but/i.test(String(c).trim())));
    if (h < 0) throw new Error('Colonnes « Tâche » et « Début » introuvables');
    const H = rows[h].map(c => U.norm(String(c)).trim());
    const ix = re => H.findIndex(c => re.test(c));
    const iP = ix(/^phase/), iT = ix(/^tache/), iI = ix(/^(intervenant|entreprise|responsable)/), iD = ix(/^debut/), iF = ix(/^fin/), iA = ix(/^(%|avancement)/);
    const toIso = v => { if (v instanceof Date) return U.iso(new Date(v.getFullYear(), v.getMonth(), v.getDate() + (v.getHours() >= 12 ? 1 : 0))); if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400000)); return U.iso(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); } const m = String(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; return /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : ''; };
    let phase = ''; const out = [];
    rows.slice(h + 1).forEach(r => {
      const nom = String(r[iT] ?? '').trim(), p = iP >= 0 ? String(r[iP] ?? '').trim() : '';
      if (!nom && p) { phase = p; return; }
      if (!nom || /^t[aâ]che$/i.test(nom)) return;
      const debut = toIso(r[iD]), fin = toIso(r[iF]);
      if (!debut || !fin) return;
      out.push({ phase: p || phase, nom, interv: iI >= 0 ? String(r[iI] ?? '').trim() : '', debut, fin, pct: iA >= 0 ? String(r[iA] ?? '').trim() : '' });
    });
    return out;
  }

  /** Convertit l'avancement saisi (100 %, 0,98, 1/7, « en cours »…) à la date du point de situation */
  function parsePct(raw, debut, fin, point) {
    const s = String(raw ?? '').trim().toLowerCase();
    let av = null, started = false;
    if (/^\d+\s*\/\s*\d+$/.test(s)) { const [a, b] = s.split('/').map(Number); av = b ? Math.round(100 * a / b) : null; }
    else if (/^[\d.,]+\s*%?$/.test(s)) { let n = U.num(s.replace('%', '')); if (!s.includes('%') && n <= 1) n *= 100; av = Math.round(n); }
    else if (/en (cours|prod)|demarr|démarr/.test(s)) started = true;
    if (av === 0 && point && debut >= point) av = null; // pas encore commencé au point de situation : rien à constater
    return { av, started: started || (av !== null && av > 0) };
  }

  /** Remplace le planning de la base par celui fourni (rows) ; crée les intervenants manquants, les liens et l'historique d'avancement */
  function apply(d, { rows, liens = [], point = '', source = 'Import Excel', reception = '' }) {
    const now = new Date().toISOString();
    const mk = o => Object.assign({ id: U.uid(), cree: now, maj: now }, o);
    // suppression logique des anciennes tâches et de leur historique
    d.taches.forEach(t => { if (!t._del) { Object.keys(t).forEach(k => { if (!['id', 'cree'].includes(k)) delete t[k]; }); t._del = true; t.maj = now; } });
    (d.avancements || []).forEach(a => { if (!a._del) { Object.keys(a).forEach(k => { if (!['id', 'cree'].includes(k)) delete a[k]; }); a._del = true; a.maj = now; } });
    if (!d.avancements) d.avancements = [];
    const ents = () => d.entreprises.filter(e => !e._del);
    const findEnt = tok => { const k = key(tok); return ents().find(e => key(e.nom) === k) || ents().find(e => k.length >= 4 && key(e.nom).startsWith(k)); };
    let ci = ents().length;
    const entFor = interv => {
      const tok = String(interv || 'ENT.').split(/[+/]/)[0].trim() || 'ENT.';
      let e = findEnt(tok);
      if (!e) { const r = ROLES[key(tok).toUpperCase()] || 'Intervenant'; e = mk({ nom: tok, corpsEtat: r, lot: r, responsable: '', tel: '', email: '', couleur: SOFT[ci++ % SOFT.length], debut: '', fin: '', role: ['MO', 'MOE'].includes(key(tok).toUpperCase()) ? 'Pilotage' : '' }); d.entreprises.push(e); }
      return e;
    };
    const byName = new Map();
    rows.forEach(r => {
      const e = entFor(r.interv);
      const { av, started } = parsePct(r.pct, r.debut, r.fin, point);
      const t = mk({ entrepriseId: e.id, intervenant: r.interv, phase: r.phase, nom: r.nom, zone: '', duree: Math.max(1, U.countWork(r.debut, r.fin)),
        debutImpose: r.debut, predecesseurs: [], avancement: av, debutReel: started ? r.debut : '', finReel: av === 100 ? (point && r.fin > point ? point : r.fin) : '',
        notes: `${source}${point ? ' — avancement au ' + U.fr(point) : ''}${r.pct ? ' : « ' + r.pct + ' »' : ''}` });
      t.type = PLAN.typeOf(t);
      d.taches.push(t); byName.set(r.nom, t);
      if (av !== null) d.avancements.push(mk({ tacheId: t.id, date: point || U.today(), av, commentaire: 'Valeur du planning importé', auteur: source }));
    });
    let nl = 0;
    liens.forEach(([a, b, type, lag]) => { const A = byName.get(a), B = byName.get(b); if (A && B) { B.predecesseurs.push({ id: A.id, type: type || 'FD', decalage: lag || 0 }); nl++; } });
    if (reception) { if (!d.projet.dateFinInitiale) d.projet.dateFinInitiale = reception; if (!(d.projet.avenantsDelai || []).length) d.projet.dateFinContractuelle = reception; }
    if (point) d.projet.pointSituation = point;
    d.projet.planningSource = source; d.projet.maj = now;
    d.historique.unshift({ t: now, texte: `Planning importé (${source}) : ${rows.length} tâches, ${nl} liens` });
    return { taches: rows.length, liens: nl };
  }

  return { rowsFromSheet, parsePct, apply, key };
})();
