/* STRAM Suivi — moteur de planification : liens, recalage automatique, prévision, marges et chemin critique */
'use strict';
const PLAN = (() => {
  const wdBetween = (a, b) => { // écart signé en jours ouvrés (b - a)
    if (!a || !b) return 0;
    if (a === b) return 0;
    return U.parse(b) > U.parse(a) ? U.countWork(U.addDays(a, 1), b) : -U.countWork(U.addDays(b, 1), a);
  };

  function topo(tasks) {
    const byId = new Map(tasks.map(t => [t.id, t]));
    const state = new Map(), order = [], cycles = new Set();
    const visit = (t, stack) => {
      const s = state.get(t.id);
      if (s === 2) return; if (s === 1) { stack.forEach(id => cycles.add(id)); return; }
      state.set(t.id, 1);
      (t.predecesseurs || []).forEach(p => { const pt = byId.get(p.id); if (pt) visit(pt, [...stack, t.id]); });
      state.set(t.id, 2); order.push(t);
    };
    tasks.forEach(t => visit(t, []));
    return { order, cycles, byId };
  }

  /**
   * Calcule pour chaque tâche : dates théoriques (plan), dates prévisionnelles (avec l'avancement réel
   * et la date du jour), marge totale, criticité, avancement attendu et retard.
   */
  function compute(tasks, projet, reference, todayIso) {
    const today = todayIso || U.today();
    const start0 = projet.dateDebut || today;
    const { order, cycles, byId } = topo(tasks);
    const R = new Map();

    const fromPreds = (t, key) => { // key: 'plan' ou 'prev'
      let es = null;
      (t.predecesseurs || []).forEach(p => {
        const pr = R.get(p.id); if (!pr || cycles.has(p.id)) return;
        const P = pr[key], lag = U.num(p.decalage), dur = Math.max(1, U.num(t.duree));
        let c;
        if (p.type === 'DD') c = U.addWork(U.nextWork(P.debut), lag);
        else if (p.type === 'FF') c = U.addWork(U.addWork(P.fin, lag), -(dur - 1));
        else c = U.addWork(P.fin, 1 + lag); // FD (fin → début)
        if (!es || U.parse(c) > U.parse(es)) es = c;
      });
      return es;
    };

    order.forEach(t => {
      const dur = Math.max(1, U.num(t.duree));
      // ---- plan théorique
      let es = t.debutImpose || start0;
      const fp = fromPreds(t, 'plan'); if (fp && U.parse(fp) > U.parse(es)) es = fp;
      es = U.nextWork(es);
      const plan = { debut: es, fin: U.endOf(es, dur) };
      // ---- prévision
      let prev, etat;
      const av = t.avancement === null || t.avancement === undefined || t.avancement === '' ? null : U.num(t.avancement);
      if (t.finReel || av === 100) {
        const fin = t.finReel || t.majAvancement || today;
        prev = { debut: t.debutReel || plan.debut, fin }; etat = 'Terminée';
      } else {
        let ps = t.debutImpose || start0;
        const fpp = fromPreds(t, 'prev'); if (fpp && U.parse(fpp) > U.parse(ps)) ps = fpp;
        ps = U.nextWork(ps);
        if (t.debutReel && av === null) {
          const deb = t.debutReel; prev = { debut: deb, fin: U.endOf(deb, dur) }; etat = 'Avancement non renseigné';
        } else if (t.debutReel || (av !== null && av > 0)) {
          const deb = t.debutReel || ps;
          const reste = Math.max(1, Math.ceil(dur * (1 - (av || 0) / 100)));
          const fin = U.parse(today) > U.parse(deb) ? U.endOf(U.nextWork(U.addDays(today, 0)), reste) : U.endOf(deb, dur);
          prev = { debut: deb, fin }; etat = 'En cours';
        } else if (av === 0 && U.parse(ps) < U.parse(today)) {
          const deb = U.nextWork(today); prev = { debut: deb, fin: U.endOf(deb, dur) }; etat = 'Non démarrée (en retard)';
        } else {
          prev = { debut: ps, fin: U.endOf(ps, dur) };
          etat = U.parse(ps) > U.parse(today) ? 'À venir' : (av === null ? 'Avancement non renseigné' : 'À venir');
        }
      }
      // avancement attendu à la date du jour
      let attendu = 0;
      if (U.parse(today) >= U.parse(plan.fin)) attendu = 100;
      else if (U.parse(today) >= U.parse(plan.debut)) attendu = Math.round(100 * U.countWork(plan.debut, today) / dur);
      const ref = reference && reference.taches ? reference.taches[t.id] : null;
      const decale = t.debutImpose && plan.debut > U.nextWork(t.debutImpose) ? wdBetween(U.nextWork(t.debutImpose), plan.debut) : 0;
      R.set(t.id, { id: t.id, plan, prev, etat, av, attendu, dur, ref, decale, cycle: cycles.has(t.id),
        retardRef: ref ? wdBetween(ref.fin, prev.fin) : null, ecartAvancement: av === null ? null : av - attendu });
    });

    // ---- la réception ne peut pas précéder la fin des travaux : elle glisse avec les retards
    const hasSucc = new Set(); tasks.forEach(t => (t.predecesseurs || []).forEach(p => hasSucc.add(p.id)));
    order.filter(t => /r[ée]ception/i.test(t.nom || '') && PLAN.typeOf(t) === 'Jalon' && !hasSucc.has(t.id)).forEach(t => {
      const r = R.get(t.id); if (!r || r.etat === 'Terminée') return;
      // glissement = plus grand retard (en jours ouvrés) des travaux qui devaient être finis pour la réception
      const glis = order.filter(x => x.id !== t.id && PLAN.typeOf(x) !== 'Jalon' && U.parse(R.get(x.id).plan.fin) <= U.parse(r.plan.fin))
        .reduce((m, x) => { const rx = R.get(x.id); return Math.max(m, wdBetween(rx.plan.fin, rx.prev.fin)); }, 0);
      const base = U.parse(r.prev.debut) > U.parse(r.plan.debut) ? r.prev.debut : r.plan.debut;
      if (glis > 0) { const d = U.addWork(r.plan.debut, glis); if (U.parse(d) > U.parse(base)) { r.prev = { debut: d, fin: U.endOf(d, r.dur) }; r.glisse = glis; } }
    });
    // ---- passe arrière (marges) sur la prévision, par rapport à la date de fin contractuelle
    const finProjet = order.reduce((m, t) => { const f = R.get(t.id).prev.fin; return !m || U.parse(f) > U.parse(m) ? f : m; }, null) || today;
    const cible = projet.dateFinContractuelle || finProjet;
    const succ = new Map(); tasks.forEach(t => (t.predecesseurs || []).forEach(p => { if (!succ.has(p.id)) succ.set(p.id, []); succ.get(p.id).push({ t, p }); }));
    [...order].reverse().forEach(t => {
      const r = R.get(t.id); let lf = cible;
      (succ.get(t.id) || []).forEach(({ t: s, p }) => {
        const rs = R.get(s.id); if (!rs || !rs.ls) return; const lag = U.num(p.decalage);
        let c;
        if (p.type === 'DD') c = U.endOf(U.addWork(rs.ls, -lag), r.dur);
        else if (p.type === 'FF') c = U.addWork(rs.lf, -lag);
        else c = U.addWork(rs.ls, -(1 + lag));
        if (U.parse(c) < U.parse(lf)) lf = c;
      });
      r.lf = U.prevWork(lf); r.ls = U.addWork(r.lf, -(r.dur - 1));
      r.marge = r.etat === 'Terminée' ? null : wdBetween(r.prev.fin, r.lf);
    });
    const marges = [...R.values()].filter(r => r.marge !== null).map(r => r.marge);
    const minMarge = marges.length ? Math.min(...marges) : 0;
    R.forEach(r => { r.critique = r.marge !== null && r.marge <= Math.max(0, minMarge); r.enRetard = (r.marge !== null && r.marge < 0) || (r.ecartAvancement !== null && r.ecartAvancement < -10) || r.etat === 'Non démarrée (en retard)'; });

    // ---- indicateurs globaux (pondérés par la durée)
    let w = 0, wa = 0, we = 0, renseigne = 0;
    const byId2 = new Map(tasks.map(t => [t.id, t]));
    R.forEach(r => { const t = byId2.get(r.id); r.type = PLAN.typeOf(t); r.poids = r.type === 'Travaux' ? (U.num(t.poids) || r.dur) : 0; if (!r.poids) return;
      w += r.poids; we += r.poids * r.attendu / 100; if (r.av !== null) { renseigne++; wa += r.poids * r.av / 100; } else wa += r.poids * r.attendu / 100; });
    const debutProjet = projet.dateDebut || today;
    return {
      R, cycles, finPrevue: finProjet, finContractuelle: projet.dateFinContractuelle || '', finInitiale: projet.dateFinInitiale || projet.dateFinContractuelle || '',
      ecartFin: projet.dateFinContractuelle ? wdBetween(projet.dateFinContractuelle, finProjet) : 0,
      avancementGlobal: w ? Math.round(100 * wa / w) : 0, avancementAttendu: w ? Math.round(100 * we / w) : 0,
      renseigne, total: [...R.values()].filter(r => r.poids).length, minMarge,
      delaiEcoule: projet.dateFinContractuelle ? Math.max(0, Math.min(100, Math.round(100 * U.diffDays(debutProjet, today) / Math.max(1, U.diffDays(debutProjet, projet.dateFinContractuelle))))) : 0,
      joursRestants: projet.dateFinContractuelle ? U.diffDays(today, projet.dateFinContractuelle) : null,
    };
  }

  /** Générateur de séquence : enchaîne des corps d'état sur une liste de zones (étages…) */
  function generer({ entreprises, zones, durees, debut, decalage, chainerZones }) {
    const out = [], grid = {};
    entreprises.forEach((eid, i) => {
      zones.forEach((z, j) => {
        const id = U.uid(); grid[i + ':' + j] = id;
        const preds = [];
        if (i > 0) preds.push({ id: grid[(i - 1) + ':' + j], type: 'FD', decalage: U.num(decalage) });
        if (chainerZones && j > 0) preds.push({ id: grid[i + ':' + (j - 1)], type: 'FD', decalage: 0 });
        out.push({ id, entrepriseId: eid, zone: z, duree: U.num(durees[i]) || 5, debutImpose: i === 0 && j === 0 ? debut : (i === 0 && !chainerZones ? debut : ''), predecesseurs: preds, avancement: null, debutReel: '', finReel: '' });
      });
    });
    return out;
  }

  /** Type de tâche : Travaux, Validation MO, Approvisionnement, Jalon */
  function typeOf(t) {
    if (!t) return 'Travaux';
    if (t.type) return t.type;
    const n = U.norm(t.nom), i = U.norm(t.intervenant || '');
    if (/^★|reception$/.test(n.trim()) || n.includes('★')) return 'Jalon';
    if (n.includes('validation mo') || ((/^mo(e)?([^a-z]|$)/.test(i)) && /(validation|choix|commande|devis|etude|dossier)/.test(n))) return 'Validation MO';
    if (/(fourn|transport|transit|kone)/.test(i) || /(production|fabrication|transport maritime|sortie port| livraison)/.test(n) || /— livraison/.test(t.nom)) return 'Approvisionnement';
    return 'Travaux';
  }

  /** Courbe en S hebdomadaire : avancement prévu (planning) et réel (saisies d'avancement), en % pondéré */
  function courbeS(tasks, P, historique, from, to) {
    const T = tasks.filter(t => { const r = P.R.get(t.id); return r && r.poids; });
    const W = T.reduce((s, t) => s + P.R.get(t.id).poids, 0) || 1;
    const hist = new Map(); (historique || []).forEach(h => { if (!hist.has(h.tacheId)) hist.set(h.tacheId, []); hist.get(h.tacheId).push(h); });
    hist.forEach(a => a.sort((x, y) => x.date.localeCompare(y.date)));
    const pts = []; let d = from; const today = U.today();
    while (d <= to) {
      let prevu = 0, reel = 0, known = false;
      T.forEach(t => { const r = P.R.get(t.id);
        const a = d < r.plan.debut ? 0 : d >= r.plan.fin ? 1 : U.countWork(r.plan.debut, d) / r.dur;
        prevu += r.poids * a;
        const h = (hist.get(t.id) || []).filter(x => x.date <= d).pop();
        if (h) { reel += r.poids * U.num(h.av) / 100; known = true; }
      });
      pts.push({ d, prevu: 100 * prevu / W, reel: d <= today && known ? 100 * reel / W : null });
      d = U.addDays(d, 7);
    }
    return pts;
  }

  return { compute, generer, wdBetween, typeOf, courbeS };
})();
