/* STRAM Suivi — Rapports hebdomadaire et mensuel : saisie, statuts, contrôle de cohérence, validation, PDF */
'use strict';
const RAPPORTS = (() => {
  const st = { type: 'hebdo', date: '', vue: 'remplir', draft: null, cle: '' };
  const E = U.esc;
  const lundi = d => { const x = U.parse(d); const k = (x.getDay() + 6) % 7; x.setDate(x.getDate() - k); return U.iso(x); };
  const tbl = (head, rows, empty = 'Néant', cls = '') => rows.length ? `<table class="t ${cls}"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table>` : `<p class="vide">${empty}</p>`;
  const sec = (n, titre, html, legende) => `<section><h2><span>${String(n).padStart(2, '0')}</span>${titre}</h2>${legende ? `<p class="leg">${legende}</p>` : ''}${html}</section>`;
  const para = s => String(s || '').split(/\n{2,}/).map(b => /^\s*[-•]/m.test(b) ? `<ul class="syn">${b.split('\n').filter(x => x.trim()).map(x => `<li>${E(x.replace(/^\s*[-•]\s*/, ''))}</li>`).join('')}</ul>` : `<p>${E(b).replace(/\n/g, '<br>')}</p>`).join('');
  const ent = t => S.get('entreprises', t.entrepriseId) || {};
  const lotDe = t => { const e = ent(t); return e.corpsEtat || (e.lot || '').split(/\s+[-–]\s+/)[0] || t.phase || '—'; };
  const interv = t => { const e = ent(t); return e.responsable || t.intervenant || e.nom || '—'; };

  /* ---------- Référentiel des statuts ---------- */
  const STATUTS = [
    { k: 'Fait', cls: 'ok', b: 'b-green', def: 'Travaux terminés : avancement saisi à 100 %.' },
    { k: 'En cours', cls: 'enc', b: 'b-blue', def: 'Travaux démarrés (avancement entre 1 et 99 %) et dans les temps : marge positive ou nulle.' },
    { k: 'En retard', cls: 'bad', b: 'b-red', def: 'Travaux démarrés mais en retard : marge négative ou avancement inférieur de plus de 10 points à l\'attendu.' },
    { k: 'À faire', cls: '', b: 'b-grey', def: 'Travaux non démarrés dont la date de début prévue n\'est pas encore atteinte.' },
    { k: 'Reporté', cls: 'bad', b: 'b-amber', def: 'Travaux non démarrés alors que leur début prévu est dépassé, ou décalés par rapport au planning de référence.' },
    { k: 'Bloqué', cls: 'bad', b: 'b-violet', def: 'Travaux qui ne peuvent pas avancer : ils attendent une décision du maître d\'ouvrage, un approvisionnement ou un préalable non levé.' },
  ];
  const stCls = s => (STATUTS.find(x => x.k === s) || {}).cls || '';
  const LEG = 'Statuts : ' + STATUTS.map(x => x.k).join(' / ') + ' — définitions en fin de rapport';

  /** Statut calculé à partir du planning et des avancements saisis */
  function statutAuto(t, R) {
    const r = R(t.id); if (!r) return 'À faire';
    if (r.etat === 'Terminée') return 'Fait';
    const today = U.today();
    const commence = (r.av !== null && r.av > 0) || !!t.debutReel;
    const bloque = (t.predecesseurs || []).some(pp => { const q = R(pp.id); return q && q.etat !== 'Terminée' && ['Validation MO', 'Approvisionnement'].includes(q.type) && q.prev.fin < today; });
    if (commence) return r.enRetard ? 'En retard' : 'En cours';
    if (bloque) return 'Bloqué';
    if (r.etat === 'Non démarrée (en retard)' || r.etat === 'Avancement non renseigné' || (r.plan && U.parse(r.prev.debut) > U.parse(r.plan.debut))) return 'Reporté';
    return 'À faire';
  }

  /* ---------- Période, lignes et rapport enregistré ---------- */
  function periode(type, ref) {
    let d0, d1, titre, sous;
    if (type === 'hebdo') {
      d0 = lundi(ref); d1 = U.addDays(d0, 6);
      const x = U.parse(d0); const j = new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate() + 3)); const y = new Date(Date.UTC(j.getUTCFullYear(), 0, 4)); const sem = 1 + Math.round(((j - y) / 864e5 - 3 + ((y.getUTCDay() + 6) % 7)) / 7);
      titre = `Rapport hebdomadaire du ${U.fr(d0)} au ${U.fr(d1)}`; sous = `Semaine ${sem} · avancement, délais et logistique`;
    } else {
      const x = U.parse(ref); d0 = U.iso(new Date(x.getFullYear(), x.getMonth(), 1)); d1 = U.iso(new Date(x.getFullYear(), x.getMonth() + 1, 0));
      titre = `Rapport mensuel de ${x.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`; sous = `Du ${U.fr(d0)} au ${U.fr(d1)} · avancement, délais, logistique et finances`;
    }
    return { d0, d1, titre, sous };
  }
  function lignes(type, d0, d1, P) {
    const R = id => P.R.get(id);
    const Tw = S.list('taches').filter(t => R(t.id) && R(t.id).type === 'Travaux');
    const actifs = Tw.filter(t => { const r = R(t.id); return r.prev.debut <= d1 && r.prev.fin >= d0; }).sort((a, b) => lotDe(a).localeCompare(lotDe(b)) || R(a.id).prev.fin.localeCompare(R(b.id).prev.fin));
    const horizon = U.addDays(d1, type === 'hebdo' ? 7 : 31);
    const vus = new Set(actifs.map(t => t.id));
    const next = Tw.filter(t => { const r = R(t.id); return !vus.has(t.id) && r.etat !== 'Terminée' && r.prev.debut <= horizon && r.prev.fin > d1; }).sort((a, b) => R(a.id).prev.debut.localeCompare(R(b.id).prev.debut));
    return { Tw, actifs, next, horizon };
  }
  const enreg = (type, d0) => S.list('rapports').find(x => x.type === type && x.debut === d0) || null;
  const vierge = () => ({ redacteur: S.user?.nom || S.data.projet.utilisateur || '', textes: {}, lignes: {}, ajouts: { semaine: [], programme: [] }, masques: [] });
  function brouillon(type, d0) {
    const cle = type + ':' + d0;
    if (st.cle !== cle || !st.draft) { const r = enreg(type, d0); st.draft = r ? JSON.parse(JSON.stringify({ redacteur: r.redacteur || '', textes: r.textes || {}, lignes: r.lignes || {}, ajouts: r.ajouts || { semaine: [], programme: [] }, masques: r.masques || [] })) : vierge(); st.cle = cle; st.modifie = false; }
    return st.draft;
  }

  /* ---------- Construction du rapport ---------- */
  function build(type, ref, draft, rec) {
    if (rec && rec.statut !== 'Brouillon' && rec.fige) return Object.assign({}, rec.fige, { statut: rec.statut, rec });
    draft = draft || (rec ? rec : vierge());
    const P = APP.plan(), p = S.data.projet, T = S.list('taches');
    const { d0, d1, titre, sous } = periode(type, ref);
    const inP = d => d && d >= d0 && d <= d1;
    const R = id => P.R.get(id);
    const L = lignes(type, d0, d1, P), Tw = L.Tw;
    const ov = t => (draft.lignes || {})[t.id] || {};
    const stF = t => ov(t).statut || statutAuto(t, R);
    const ovc = t => ov(t).commentaire ? `<div class="cm">${E(ov(t).commentaire)}</div>` : '';
    const txt = k => String((draft.textes || {})[k] || '').trim();
    const masq = new Set(draft.masques || []);
    const ajouts = k => ((draft.ajouts || {})[k] || []).filter(a => String(a.nom || '').trim()).map(a => { const t = a.tacheId ? S.get('taches', a.tacheId) : null; return Object.assign({}, a, { statut: a.statut || (t ? statutAuto(t, R) : 'À faire') }); });
    const ligneAj = a => [E(a.lot || '—'), E(a.nom) + (a.commentaire ? `<div class="cm">${E(a.commentaire)}</div>` : ''), E(a.interv || '—'), a.fin ? U.fr(a.fin).slice(0, 5) : '', `<span class="${stCls(a.statut)}">${E(a.statut)}</span>`];
    const auteur = draft.redacteur || S.user?.nom || p.utilisateur || '';
    const ecart = P.ecartFin;
    const av = (p.avenantsDelai || []);
    let n = 1;

    let h = `<div class="id"><table><tr><th>Projet</th><td>${E(p.nom || 'STRAM')}</td><th>Client</th><td>${E(p.maitreOuvrage || '—')}</td></tr>
      <tr><th>Période</th><td>${U.fr(d0)} – ${U.fr(d1)}</td><th>Établi par</th><td>${E(auteur)}${p.maitreOeuvre ? ` (${E(p.maitreOeuvre)})` : ''}</td></tr></table></div>`;

    // synthèse
    const faits = Tw.filter(t => inP(R(t.id).prev.fin) && R(t.id).etat === 'Terminée');
    const saisis = S.list('avancements').filter(a => inP(a.date) && !/importé/i.test(a.commentaire || ''));
    const parLot = {}; [...faits, ...saisis.map(a => S.get('taches', a.tacheId)).filter(Boolean)].forEach(t => { const l = lotDe(t); (parLot[l] = parLot[l] || new Set()).add(t.nom); });
    const cpt = {}; L.actifs.filter(t => !masq.has(t.id)).forEach(t => { const s = stF(t); cpt[s] = (cpt[s] || 0) + 1; }); ajouts('semaine').forEach(a => { cpt[a.statut] = (cpt[a.statut] || 0) + 1; });
    const synth = [
      `Avancement global : <b>${P.avancementGlobal} %</b> (attendu ${P.avancementAttendu} %)`,
      `Fin contractuelle : <b>${U.fr(p.dateFinContractuelle)}</b>${av.length ? ` (initiale ${U.fr(p.dateFinInitiale)}, ${av.length} prolongation(s))` : ''} · fin prévisionnelle : <b class="${ecart > 0 ? 'bad' : ''}">${U.fr(P.finPrevue)}</b> · ${ecart > 0 ? `<b class="bad">dépassement prévisible de ${ecart} j ouvrés</b>` : '<b class="ok">dans les délais</b>'}`,
      Object.keys(cpt).length ? `Travaux de la période : ${STATUTS.filter(x => cpt[x.k]).map(x => `<span class="${x.cls}">${cpt[x.k]} ${x.k.toLowerCase()}</span>`).join(' · ')}` : '',
      ...Object.entries(parLot).slice(0, 10).map(([l, s]) => `${E(l)} : ${E([...s].slice(0, 3).map(nm => U.norm(nm).startsWith(U.norm(l).slice(0, 6)) ? nm.replace(/^[^–-]+[–-]\s*/, '') : nm).join(', '))}`),
    ].filter(Boolean);
    h += sec(n++, type === 'hebdo' ? 'Synthèse de la semaine' : 'Synthèse du mois', (txt('faits') ? `<p class="sst">Faits marquants</p>${para(txt('faits'))}<p class="sst">Indicateurs</p>` : '') + `<ul class="syn">${synth.map(x => `<li>${x}</li>`).join('')}</ul>`);

    // 02 avancement et délais
    const c = PLANNING.svgCourbe(860, 240);
    const phases = []; T.forEach(t => { const ph = t.phase || 'Sans phase'; if (!phases.includes(ph)) phases.push(ph); });
    h += sec(n++, 'Avancement et délais', `<table class="k"><tr><td><span>Avancement réel</span><b>${P.avancementGlobal} %</b></td><td><span>Attendu à ce jour</span><b>${P.avancementAttendu} %</b></td><td><span>Fin contractuelle</span><b>${U.fr(p.dateFinContractuelle)}</b></td><td><span>Fin prévisionnelle</span><b class="${ecart > 0 ? 'bad' : ''}">${U.fr(P.finPrevue)}</b></td><td><span>Écart</span><b class="${ecart > 0 ? 'bad' : 'ok'}">${ecart > 0 ? '+' + ecart + ' j' : 'aucun'}</b></td></tr></table>
      ${c.svg}<p class="leg">Pointillés : avancement prévu · trait plein : avancement réel saisi (travaux uniquement).</p>
      ${tbl(['Phase', 'Avancement', 'Attendu', 'Tâches en retard'], phases.map(ph => { let w = 0, a = 0, x = 0, l = 0; T.filter(t => (t.phase || 'Sans phase') === ph).forEach(t => { const r = R(t.id); if (r.enRetard) l++; if (!r.poids) return; w += r.poids; a += r.poids * (r.av ?? r.attendu) / 100; x += r.poids * r.attendu / 100; });
        return [E(ph), w ? Math.round(100 * a / w) + ' %' : '—', w ? Math.round(100 * x / w) + ' %' : '—', l ? `<span class="bad">${l}</span>` : '0']; }))}
      ${av.length ? `<p class="leg" style="margin-top:8px">Prolongations accordées : ${av.map(a => `${U.fr(a.date)} ${E(a.ref || '')} → ${U.fr(a.nouvelleFin)}${a.motif ? ' (' + E(a.motif) + ')' : ''}`).join(' · ')}</p>` : ''}`);

    // 03 travaux de la période
    const { actifs, next, horizon } = L;
    const comm = t => { const a = saisis.filter(x => x.tacheId === t.id).sort(U.by('date')).pop(); return a ? `<div class="cm">${a.av} %${a.commentaire ? ' — ' + E(a.commentaire) : ''}</div>` : ''; };
    h += sec(n++, type === 'hebdo' ? 'Travaux de la semaine' : 'Travaux du mois', tbl(['Lot', 'Travaux', 'Intervenant', 'Fin prévue', 'Statut'], [...actifs.filter(t => !masq.has(t.id)).map(t => { const r = R(t.id), s = stF(t); return [E(lotDe(t)), E(t.nom) + comm(t) + ovc(t), E(interv(t)), U.fr(r.prev.fin).slice(0, 5), `<span class="${stCls(s)}">${s}</span>`]; }), ...ajouts('semaine').map(ligneAj)], 'Aucun travail sur la période.'), LEG);

    // 04 programme
    h += sec(n++, type === 'hebdo' ? 'Programme de la semaine prochaine' : 'Programme du mois prochain', tbl(['Lot', 'Travaux', 'Intervenant', 'Fin prévue', 'Statut'], [...next.filter(t => !masq.has(t.id)).map(t => { const r = R(t.id), s = stF(t); return [E(lotDe(t)), E(t.nom) + ovc(t), E(interv(t)), U.fr(r.prev.fin).slice(0, 5), `<span class="${stCls(s)}">${s}</span>`]; }), ...ajouts('programme').map(ligneAj)], 'Rien de prévu.'), LEG);

    // 05 retards
    const late = T.filter(t => R(t.id).enRetard).sort((a, b) => (R(a.id).marge ?? 999) - (R(b.id).marge ?? 999));
    const dec = T.filter(t => R(t.id).decale > 0);
    h += sec(n++, 'Retards et points de vigilance', tbl(['Tâche', 'Intervenant', 'Fin prévue', 'Avancement', 'Marge'], late.map(t => { const r = R(t.id); return [E(t.nom), E(interv(t)), U.fr(r.prev.fin), r.av === null ? '<span class="vide">non saisi</span>' : r.av + ' %', `<span class="${r.marge < 0 ? 'bad' : ''}">${r.marge ?? '—'} j</span>`]; }), 'Aucune tâche en retard.')
      + (dec.length ? `<p class="leg" style="margin-top:8px">Incohérences du planning source : ${dec.map(t => `${E(t.nom)} (+${R(t.id).decale} j)`).join(' · ')}</p>` : ''));
    if (txt('difficultes')) h += sec(n++, 'Difficultés et points bloquants', para(txt('difficultes')));

    // 06 décisions MO
    const mo = T.filter(t => R(t.id).type === 'Validation MO' && R(t.id).etat !== 'Terminée').sort((a, b) => R(a.id).prev.fin.localeCompare(R(b.id).prev.fin));
    h += sec(n++, 'Décisions attendues du maître d\'ouvrage', tbl(['Décision', 'Échéance', 'Travaux bloqués'], mo.map(t => { const r = R(t.id); return [E(t.nom), `<span class="${r.prev.fin < U.today() ? 'bad' : ''}">${U.fr(r.prev.fin)}</span>`, E(T.filter(x => (x.predecesseurs || []).some(pp => pp.id === t.id)).map(x => x.nom).join(' · ') || '—')]; }), 'Aucune décision en attente.') + (txt('demandesMO') ? `<p class="sst">Demandes adressées au maître d'ouvrage</p>${para(txt('demandesMO'))}` : ''));

    // 07 approvisionnements et commandes
    const appro = T.filter(t => R(t.id).type === 'Approvisionnement' && R(t.id).etat !== 'Terminée' && R(t.id).prev.fin <= horizon).sort((a, b) => R(a.id).prev.fin.localeCompare(R(b.id).prev.fin));
    const cmd = S.list('commandes').filter(c => c.statut === 'À passer' || (!['Livrée', 'Annulée'].includes(c.statut)) || inP(c.dateLivraison));
    h += sec(n++, 'Approvisionnements et commandes', tbl(['Approvisionnement', 'Arrivée prévue', 'Pour'], appro.map(t => [E(t.nom), U.fr(R(t.id).prev.fin), E(T.filter(x => (x.predecesseurs || []).some(pp => pp.id === t.id)).map(x => x.nom).join(' · ') || '—')]), 'Aucun approvisionnement attendu.')
      + (cmd.length ? tbl(['Bon de commande', 'Fournisseur', 'Statut', 'Commander avant', 'Livraison'], cmd.map(c => [`<b>${E(c.num)}</b>`, E(S.get('fournisseurs', c.fournisseurId)?.nom || ''), c.statut, window.CMD ? U.fr(CMD.commanderAvant(c)) : '', U.fr(c.dateLivraison || c.livraisonPrevue)])) : ''));

    // 08 magasin
    const mv = S.list('mouvements').filter(m => inP(m.date));
    const bons = {}; mv.forEach(m => { (bons[m.numBon] = bons[m.numBon] || []).push(m); });
    const alertes = STOCK.etat().filter(r => ['Écart', 'Sous le seuil', 'Épuisé'].includes(r.statut));
    h += sec(n++, 'Magasin', `<p>${Object.values(bons).filter(L => L[0].type === 'Sortie').length} bon(s) de sortie, ${Object.values(bons).filter(L => L[0].type === 'Entrée').length} entrée(s), ${Object.values(bons).filter(L => L[0].type === 'Retour').length} retour(s) · ${alertes.length} alerte(s) de stock.</p>`
      + tbl(['Bon', 'Date', 'Entreprise / fournisseur', 'Articles', 'Autorisé par'], Object.entries(bons).sort((a, b) => a[1][0].date.localeCompare(b[1][0].date)).map(([n, L]) => [`<b>${E(n)}</b>`, U.fr(L[0].date), E(L[0].demandeur || L[0].fournisseur || ''), L.map(m => { const a = S.get('articles', m.articleId) || {}; return `${E(a.code)} ${E(a.designation)} × ${U.qty(m.quantite)}`; }).join('<br>'), E(L[0].autorisePar || '')]), 'Aucun mouvement sur la période.')
      + (alertes.length ? tbl(['Article', 'Solde', 'Seuil', 'Statut'], alertes.map(r => [`${E(r.a.code)} ${E(r.a.designation)}`, `${U.qty(r.solde)} ${E(r.a.unite)}`, U.qty(r.a.seuil), `<span class="bad">${r.statut}</span>`])) : ''));

    // 09 personnel, accès, journal
    const ac = S.list('acces').filter(a => inP(a.date)); const byE = {}; ac.forEach(a => byE[a.entreprise || '—'] = (byE[a.entreprise || '—'] || 0) + 1);
    const jr = S.list('journal').filter(j => inP(j.date)).sort(U.by('date'));
    h += sec(n++, 'Personnel, accès et journal de chantier', `<p>${ac.length} passage(s) enregistré(s)${Object.keys(byE).length ? ' : ' + Object.entries(byE).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${E(k)} ${v}`).join(' · ') : ''}.</p>`
      + tbl(['Date', 'Météo', 'Effectif', 'Travaux réalisés', 'Incidents'], jr.map(j => [U.fr(j.date), E(j.meteo || ''), E(j.effectif || ''), E(j.travaux || '').replace(/\n/g, '<br>'), E(j.incidents || '')]), 'Aucune entrée de journal sur la période.'));
    if (txt('hse')) h += sec(n++, 'Sécurité, hygiène et environnement', para(txt('hse')));

    // 10 actions et réserves
    const acts = S.list('actions').filter(a => a.statut !== 'Soldée').sort(U.by('echeance'));
    const res = S.list('reserves').filter(r => r.statut !== 'Levée');
    h += sec(n++, 'Actions et réserves', tbl(['Action', 'Responsable', 'Échéance', 'Statut'], acts.map(a => [E(a.description), E(a.responsable || ''), `<span class="${a.echeance && a.echeance < U.today() ? 'bad' : ''}">${U.fr(a.echeance)}</span>`, E(a.statut || '')]), 'Aucune action ouverte.')
      + (res.length ? tbl(['Réserve', 'Zone', 'Entreprise', 'Description', 'Échéance'], res.map(r => [E(r.num), E(r.zone), E(APP.entNom(r.entrepriseId)), E(r.description), U.fr(r.echeance)])) : ''));

    // qualité
    const ess = S.list('essais').filter(e => inP(e.date)), pl = S.list('plans').filter(x => /attente|à viser/i.test(x.statut || ''));
    if (ess.length || pl.length) h += sec(n++, 'Qualité', (ess.length ? tbl(['Date', 'Essai / contrôle', 'Organisme', 'Résultat'], ess.map(e => [U.fr(e.date), E(e.objet), E(e.organisme || ''), `<span class="${e.resultat === 'Non conforme' ? 'bad' : e.resultat === 'Conforme' ? 'ok' : ''}">${E(e.resultat || '')}</span>`])) : '') + (pl.length ? `<p>${pl.length} plan(s) en attente de visa : ${pl.map(x => E(x.ref || x.titre)).join(', ')}.</p>` : ''));
    // finances (mensuel)
    if (type === 'mensuel') {
      const F = FIN.totaux();
      const sm = S.list('situations').filter(s => inP(s.dateReception) || inP(s.datePaiement));
      const tr = FIN.tresorerie().slice(0, 4);
      h += sec(n++, 'Situation financière', `<table class="k"><tr><td><span>Marchés</span><b>${U.money(F.marches)}</b></td><td><span>Exécuté HT</span><b>${U.money(F.cumul)}</b></td><td><span>Payé</span><b>${U.money(F.paye)}</b></td><td><span>Reste à payer</span><b>${U.money(F.resteAPayer)}</b></td></tr></table>`
        + tbl(['Entreprise', 'Situation', 'Reçue le', 'Net TTC', 'Statut', 'Payé'], sm.map(s => { const d = FIN.decompte(s); return [E(APP.entNom(d.m.entrepriseId)), 'n° ' + s.num, U.fr(s.dateReception), U.money(d.ttc), E(s.statut), s.montantPaye ? U.money(s.montantPaye) : '']; }), 'Aucune situation reçue ou payée sur la période.')
        + tbl(['Mois', 'Travaux', 'Situations', 'Approvisionnements', 'Besoin total TTC'], tr.map(r => [U.moisAn(r.mois), U.money(r.travaux), U.money(r.situations), U.money(r.appro), `<b>${U.money(r.total)}</b>`]))
        + (txt('finances') ? `<p class="sst">Commentaire</p>${para(txt('finances'))}` : ''));
    }
    // reportage photos, présenté comme le rapport journalier
    const ph = S.list('photos').filter(x => inP(x.date));
    if (ph.length) {
      const grp = {}; ph.forEach(x => { const k = x.cible ? x.cible.col + ':' + x.cible.id : 'libre'; (grp[k] = grp[k] || []).push(x); });
      const blocs = Object.entries(grp).slice(0, 12).map(([k, L]) => {
        const [col, id] = k.split(':'); const o = col !== 'libre' ? S.get(col, id) : null;
        let lot = '—', tache = L[0].legende || 'Photo', qui = '—', st2 = '';
        if (col === 'taches' && o) { lot = lotDe(o); tache = o.nom; qui = interv(o); st2 = stF(o); }
        else if (col === 'reserves' && o) { lot = APP.entNom(o.entrepriseId); tache = 'Réserve ' + (o.num || '') + ' — ' + (o.description || ''); st2 = o.statut || ''; }
        else if (col === 'journal' && o) { lot = 'Journal'; tache = `Journal du ${U.fr(o.date)}`; }
        const loc = (o && (o.zone || o.localisation)) || '';
        return `<div class="bloc"><table class="t"><tr><th>Lot</th><th>Tâche</th><th>Intervenant</th><th>Statut</th></tr><tr><td>${E(lot)}</td><td>${E(tache)}</td><td>${E(qui)}</td><td><span class="${stCls(st2)}">${E(st2)}</span></td></tr></table>
          <div class="ph">${L.slice(0, 2).map(x => `<figure><img data-ph="${x.id}"><table class="lc">${loc ? `<tr><th>Localisation</th><td>${E(loc)}</td></tr>` : ''}<tr><th>Commentaire</th><td>${E(x.legende || '')}</td></tr></table></figure>`).join('')}</div></div>`;
      });
      h += `<section class="photos"><h2><span>${String(n++).padStart(2, '0')}</span>Reportage photos</h2>${blocs.join('')}</section>`;
    }
    if (txt('observations')) h += sec(n++, 'Observations et conclusion', para(txt('observations')));
    // définitions des statuts
    h += `<section class="defs"><h2><span>${String(n++).padStart(2, '0')}</span>Définition des statuts</h2>${tbl(['Statut', 'Définition'], STATUTS.map(x => [`<span class="${x.cls}">${x.k}</span>`, E(x.def)]))}</section>`;
    return { auteur, titre, sous, html: h, statut: (rec && rec.statut) || 'Brouillon', rec, pied: `STRAM · ${type === 'hebdo' ? 'Rapport hebdomadaire' : 'Rapport mensuel'}`, nom: `STRAM_${type === 'hebdo' ? 'Rapport_hebdo_' + d0 : 'Rapport_mensuel_' + d0.slice(0, 7)}.pdf` };
  }

  /* ---------- Contrôle de cohérence ---------- */
  function controles(type, ref, draft) {
    const out = []; const add = (niv, dom, msg, mod) => out.push({ niv, dom, msg, mod });
    const P = APP.plan(), p = S.data.projet, T = S.list('taches'), today = U.today();
    const { d0, d1 } = periode(type, ref); const inP = d => d && d >= d0 && d <= d1; const fin = d1 < today ? d1 : today;
    const R = id => P.R.get(id); const L = lignes(type, d0, d1, P);
    const nm = t => `« ${t.nom} »`;
    // statuts saisis
    [...L.actifs, ...L.next].forEach(t => {
      const o = (draft.lignes || {})[t.id]; if (!o || !o.statut) return;
      const r = R(t.id), auto = statutAuto(t, R);
      if (o.statut === 'Fait' && r.etat !== 'Terminée') add('Erreur', 'Statuts', `${nm(t)} est déclarée « Fait » mais son avancement saisi est de ${r.av ?? 0} % : saisir 100 % dans le planning ou corriger le statut.`, 'planning');
      else if (o.statut !== 'Fait' && r.etat === 'Terminée') add('Erreur', 'Statuts', `${nm(t)} est à 100 % mais déclarée « ${o.statut} ».`, 'planning');
      else if (o.statut !== auto && !String(o.commentaire || '').trim()) add('Alerte', 'Statuts', `${nm(t)} : statut modifié (« ${auto} » → « ${o.statut} ») sans justification. Ajouter un commentaire.`);
      if (['En cours', 'En retard'].includes(o.statut) && !(r.av > 0) && !t.debutReel) add('Alerte', 'Statuts', `${nm(t)} est déclarée « ${o.statut} » sans aucun avancement saisi.`, 'planning');
    });
    // lignes ajoutées ou retirées
    ['semaine', 'programme'].forEach(k => ((draft.ajouts || {})[k] || []).forEach(a => {
      if (!String(a.nom || '').trim()) { if (a.lot || a.commentaire) add('Alerte', 'Statuts', `Une ligne ajoutée (${k === 'semaine' ? 'travaux de la période' : 'programme'}) n'a pas d'intitulé : elle ne sera pas imprimée.`); return; }
      const t = a.tacheId ? S.get('taches', a.tacheId) : null, r = t && R(t.id);
      if (t && [...L.actifs, ...L.next].some(x => x.id === t.id) && !(draft.masques || []).includes(t.id)) add('Info', 'Statuts', `« ${a.nom} » est ajoutée alors qu'elle figure déjà dans le tableau : elle apparaîtra deux fois.`);
      if (r && a.statut === 'Fait' && r.etat !== 'Terminée') add('Erreur', 'Statuts', `« ${a.nom} » (ligne ajoutée) est déclarée « Fait » mais son avancement saisi est de ${r.av ?? 0} %.`, 'planning');
      if (!t && !a.interv) add('Info', 'Statuts', `« ${a.nom} » (ligne ajoutée) n'a pas d'intervenant.`);
    }));
    if ((draft.masques || []).length) add('Info', 'Statuts', `${draft.masques.length} tâche(s) du planning retirée(s) du rapport.`);
    // avancements
    const parT = {}; S.list('avancements').forEach(a => (parT[a.tacheId] = parT[a.tacheId] || []).push(a));
    Object.entries(parT).forEach(([id, A]) => {
      const t = S.get('taches', id); if (!t) return; A.sort(U.by('date'));
      A.forEach((a, i) => {
        if (a.date > today) add('Erreur', 'Avancement', `${nm(t)} : avancement daté du ${U.fr(a.date)}, dans le futur.`, 'planning');
        if (i && inP(a.date) && U.num(a.av) < U.num(A[i - 1].av)) add('Erreur', 'Avancement', `${nm(t)} : l'avancement recule de ${A[i - 1].av} % à ${a.av} % le ${U.fr(a.date)}.`, 'planning');
      });
    });
    L.actifs.forEach(t => {
      const r = R(t.id); if (r.etat === 'Terminée') return;
      const A = parT[t.id] || [], last = A[A.length - 1];
      if (r.prev.debut <= fin && !A.length && !t.debutReel) add('Alerte', 'Avancement', `${nm(t)} devait démarrer le ${U.fr(r.prev.debut)} : aucun avancement saisi.`, 'planning');
      else if (last && r.av > 0 && U.diffDays(last.date, fin) > 7) add('Alerte', 'Avancement', `${nm(t)} : dernier avancement saisi le ${U.fr(last.date)} (${last.av} %), plus de 7 jours avant la fin de période.`, 'planning');
      if (interv(t) === '—') add('Info', 'Planning', `${nm(t)} n'a ni entreprise ni intervenant.`, 'planning');
    });
    T.forEach(t => {
      const r = R(t.id); if (!r || !(r.av > 0 || r.etat === 'Terminée')) return;
      (t.predecesseurs || []).forEach(pp => { const q = R(pp.id), pt = S.get('taches', pp.id); if (q && pt && q.type === 'Travaux' && q.etat !== 'Terminée' && !(q.av > 0)) add('Alerte', 'Planning', `${nm(t)} a avancé alors que son préalable ${nm(pt)} n'a pas démarré.`, 'planning'); });
    });
    const dec = T.filter(t => R(t.id) && R(t.id).decale > 0); if (dec.length) add('Info', 'Planning', `${dec.length} tâche(s) décalée(s) dans le planning source par rapport à leurs préalables.`, 'planning');
    // délais
    if (P.ecartFin > 0) add('Alerte', 'Délais', `Fin prévisionnelle (${U.fr(P.finPrevue)}) au-delà de la fin contractuelle (${U.fr(p.dateFinContractuelle)}) de ${P.ecartFin} j ouvrés : prévoir un plan de rattrapage ou une demande de prolongation.`, 'planning');
    (p.avenantsDelai || []).forEach(a => { if (a.ancienneFin && a.nouvelleFin && a.nouvelleFin < a.ancienneFin) add('Erreur', 'Délais', `Prolongation ${a.ref || ''} du ${U.fr(a.date)} : la nouvelle fin (${U.fr(a.nouvelleFin)}) est antérieure à l'ancienne (${U.fr(a.ancienneFin)}).`, 'planning'); });
    const moE = T.filter(t => R(t.id) && R(t.id).type === 'Validation MO' && R(t.id).etat !== 'Terminée' && R(t.id).prev.fin < today).sort((x, y) => R(x.id).prev.fin.localeCompare(R(y.id).prev.fin));
    if (moE.length) add('Alerte', 'Délais', `${moE.length} décision(s) du maître d'ouvrage dont l'échéance est dépassée (la plus ancienne : ${nm(moE[0])}, ${U.fr(R(moE[0].id).prev.fin)}). Les relancer dans « Demandes au maître d'ouvrage » ou mettre à jour le planning si elles sont prises.`, 'planning');
    // magasin
    if (window.STOCK) STOCK.etat().filter(r => r.solde < 0).forEach(r => add('Erreur', 'Magasin', `Stock négatif : ${r.a.code} ${r.a.designation} (${U.qty(r.solde)} ${r.a.unite || ''}). Une entrée manque ou une sortie est en trop.`, 'stock'));
    const bons = {}; S.list('mouvements').forEach(m => { if (inP(m.date) || m.date > today) (bons[m.numBon || '?'] = bons[m.numBon || '?'] || []).push(m); });
    Object.entries(bons).forEach(([nb, M]) => {
      if (M.some(m => m.date > today)) add('Erreur', 'Magasin', `Bon ${nb} daté dans le futur (${U.fr(M[0].date)}).`, 'stock');
      if (M[0].type === 'Sortie' && !M[0].autorisePar) add('Alerte', 'Magasin', `Bon de sortie ${nb} du ${U.fr(M[0].date)} sans « autorisé par ».`, 'stock');
      if (M.some(m => !(U.num(m.quantite) > 0))) add('Erreur', 'Magasin', `Bon ${nb} : une ligne a une quantité nulle ou négative.`, 'stock');
    });
    S.list('commandes').forEach(c => {
      const ca = window.CMD ? CMD.commanderAvant(c) : '';
      if (c.statut === 'À passer' && ca && ca < today) add('Alerte', 'Commandes', `${c.num} : à commander avant le ${U.fr(ca)}, toujours « À passer ».`, 'commandes');
      if (!['Livrée', 'Annulée'].includes(c.statut) && c.livraisonPrevue && c.livraisonPrevue < today) add('Alerte', 'Commandes', `${c.num} : livraison prévue le ${U.fr(c.livraisonPrevue)}, non réceptionnée.`, 'commandes');
      if (c.statut === 'Livrée' && !S.list('mouvements').some(m => m.commandeNum === c.num)) add('Alerte', 'Commandes', `${c.num} est « Livrée » sans bon d'entrée au magasin.`, 'commandes');
    });
    // finances
    if (window.FIN) S.list('situations').filter(s => s.statut !== 'Rejetée').forEach(s => {
      const d = FIN.decompte(s), qui = `${APP.entNom(d.m.entrepriseId)} n° ${s.num}`;
      if (U.num(s.montantPaye) > d.ttc + 1) add('Erreur', 'Finances', `Situation ${qui} : payé ${U.money(s.montantPaye)} pour un net de ${U.money(d.ttc)}.`, 'finances');
      if (s.statut === 'Payée' && !s.datePaiement) add('Alerte', 'Finances', `Situation ${qui} « Payée » sans date de paiement.`, 'finances');
      if (d.cum < d.cumPrec) add('Erreur', 'Finances', `Situation ${qui} : cumul HT inférieur à la situation précédente.`, 'finances');
      if (d.pctCum > 100.5) add('Alerte', 'Finances', `Situation ${qui} : cumul à ${Math.round(d.pctCum)} % du marché (avenant à régulariser ?).`, 'finances');
    });
    // qualité, actions, journal
    const resE = S.list('reserves').filter(r => r.statut !== 'Levée' && r.echeance && r.echeance < today);
    if (resE.length) add('Alerte', 'Qualité', `${resE.length} réserve(s) non levée(s) après échéance : ${resE.slice(0, 5).map(r => r.num).join(', ')}${resE.length > 5 ? '…' : ''}.`, 'qualite');
    S.list('essais').filter(e => inP(e.date) && e.resultat === 'Non conforme').forEach(e => add('Info', 'Qualité', `Essai non conforme le ${U.fr(e.date)} (${e.objet}) : vérifier qu'une action corrective ou une réserve est ouverte.`, 'qualite'));
    const actE = S.list('actions').filter(a => a.statut !== 'Soldée' && a.echeance && a.echeance < today);
    if (actE.length) add('Alerte', 'Actions', `${actE.length} action(s) en retard sur leur échéance.`, 'chantier');
    const jours = []; for (let x = d0; x <= fin; x = U.addDays(x, 1)) if (U.isWork(x) && !S.list('journal').some(j => j.date === x)) jours.push(x);
    if (jours.length) add('Alerte', 'Journal', `${jours.length} jour(s) ouvré(s) sans journal de chantier : ${jours.slice(0, 6).map(x => U.fr(x).slice(0, 5)).join(', ')}${jours.length > 6 ? '…' : ''}.`, 'chantier');
    const sansSortie = S.list('acces').filter(a => a.date && a.date < today && inP(a.date) && a.heureEntree && !a.heureSortie);
    if (sansSortie.length) add('Info', 'Accès', `${sansSortie.length} entrée(s) sans heure de sortie.`, 'acces');
    const phs = S.list('photos').filter(x => inP(x.date) && !String(x.legende || '').trim()); if (phs.length) add('Info', 'Photos', `${phs.length} photo(s) sans commentaire.`);
    // rapport lui-même
    if (!String((draft.textes || {}).faits || '').trim()) add('Info', 'Rapport', 'Rubrique « Faits marquants » vide.');
    if (!String(draft.redacteur || '').trim()) add('Alerte', 'Rapport', 'Rédacteur non renseigné.');
    const prec = periode(type, type === 'hebdo' ? U.addDays(d0, -7) : U.addDays(d0, -1)).d0, rp = enreg(type, prec);
    if (rp && rp.statut === 'Brouillon') add('Info', 'Rapport', `Le rapport précédent (${U.fr(prec)}) est encore en brouillon.`);
    const ordre = { Erreur: 0, Alerte: 1, Info: 2 };
    return out.sort((a, b) => ordre[a.niv] - ordre[b.niv] || a.dom.localeCompare(b.dom));
  }

  /** Document complet, sobre, sur le modèle du rapport journalier (sans logo) */
  function doc(R) {
    const css = `@page{size:A4;margin:14mm 14mm 16mm}*{box-sizing:border-box}
      body{font-family:Aptos,Calibri,'Segoe UI',Arial,sans-serif;color:#222;font-size:10.5px;margin:22px;line-height:1.45}
      @media print{body{margin:0}}
      .head{display:flex;justify-content:flex-end;border-bottom:1.5px solid #222;padding-bottom:8px;margin-bottom:12px}
      .head div{text-align:right}.head h1{margin:0;font-size:19px;font-weight:700}.head small{display:block;color:#666;font-size:10px;margin-top:3px}
      .id table{width:100%;border-collapse:collapse;margin-bottom:14px}.id th{text-align:left;font-weight:400;color:#555;width:13%;padding:6px 4px;border-bottom:1px solid #D9D9D9;font-size:10px}.id td{padding:6px 4px;border-bottom:1px solid #D9D9D9;width:37%}
      section{margin:18px 0 6px;page-break-inside:auto}
      h2{break-after:avoid;page-break-after:avoid;font-size:11px;letter-spacing:2.2px;text-transform:uppercase;font-weight:700;margin:0 0 6px;color:#222}h2 span{color:#999;font-weight:400;margin-right:8px;letter-spacing:1px}
      .leg{color:#888;font-size:9px;margin:-2px 0 6px;break-after:avoid}thead{display:table-header-group}
      table.t{width:100%;border-collapse:collapse;margin:4px 0 8px}
      table.t th{background:#F2F2F2;color:#777;font-weight:400;text-transform:uppercase;letter-spacing:1px;font-size:8.5px;text-align:left;padding:6px 6px}
      table.t td{padding:7px 6px;border-bottom:1px solid #D9D9D9;vertical-align:top}table.t tr{page-break-inside:avoid}
      ul.syn{list-style:none;margin:0;padding:0}ul.syn li{padding:7px 2px;border-bottom:1px solid #D9D9D9}
      table.k{width:100%;border-collapse:collapse;margin:4px 0 8px}table.k td{border-bottom:1px solid #D9D9D9;padding:6px 6px;vertical-align:bottom}table.k span{display:block;color:#888;font-size:8.5px;text-transform:uppercase;letter-spacing:1px}table.k b{font-size:15px}
      .bad{color:#B0402A;font-weight:700}.ok{color:#3F7A4C;font-weight:700}.enc{color:#8A6420;font-weight:700}.vide{color:#999}
      .cm{color:#666;font-size:9.5px;margin-top:2px}.sign{text-align:right;font-weight:700;margin-top:26px}
      .scurve{width:100%;height:auto}.scurve .prev{fill:none;stroke:#9A9A9A;stroke-width:2;stroke-dasharray:6 4}.scurve .reel{fill:none;stroke:#222;stroke-width:2.5}.scurve .area{fill:rgba(0,0,0,.04)}.scurve text{font-size:10px;fill:#888}.scurve .grid{stroke:#EEE}.scurve .today{stroke:#B0402A;stroke-width:1.2}
      .bloc{page-break-inside:avoid;margin:10px 0 18px}.ph{display:flex;gap:18px;margin-top:8px}.ph figure{margin:0;width:48%}.ph img{width:100%;height:190px;object-fit:cover}
      table.lc{width:100%;border-collapse:collapse;margin-top:6px}table.lc th{text-align:left;font-weight:400;color:#777;font-size:8.5px;text-transform:uppercase;letter-spacing:1px;width:34%;padding:5px 4px;border-bottom:1px solid #D9D9D9}table.lc td{padding:5px 4px;border-bottom:1px solid #D9D9D9}
      .pied{position:fixed;bottom:0;left:0;right:0;text-align:center;color:#999;font-size:8.5px}@media screen{.pied{display:none}}
      .sst{font-size:9px;letter-spacing:1.6px;text-transform:uppercase;color:#777;margin:10px 0 3px;break-after:avoid}section p{margin:3px 0 6px}
      table.vis{width:100%;border-collapse:collapse;margin-top:26px;page-break-inside:avoid}table.vis td{width:33%;border:1px solid #D9D9D9;padding:8px 8px 34px;vertical-align:top;font-size:10px;color:#555}table.vis span{display:block;color:#888;font-size:8.5px;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px}table.vis b{display:block;color:#222;font-size:11px}
      .filigrane{position:fixed;top:42%;left:0;right:0;text-align:center;font-size:90px;font-weight:700;color:rgba(176,64,42,.08);transform:rotate(-28deg);pointer-events:none;letter-spacing:8px}`;
    const r0 = R.rec || {};
    const vis = `<table class="vis"><tr><td><span>Établi par</span><b>${E(R.auteur || '')}</b>${U.fr(r0.cree ? r0.cree.slice(0, 10) : U.today())}</td><td><span>Validé par</span><b>${E(r0.valideur || '')}</b>${r0.valideLe ? U.fr(r0.valideLe) : ''}</td><td><span>Transmis au maître d'ouvrage</span><b>${r0.transmisLe ? U.fr(r0.transmisLe) : ''}</b>${E(r0.transmisLe ? r0.transmisA || '' : '')}</td></tr></table>`;
    const html = String(R.html) + vis.replace(/<img data-ph="([^"]+)">/g, (m, id) => { const ph = S.get('photos', id); return ph ? `<img src="${ph.data}">` : ''; });
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${E(R.titre)}</title><style>${css}</style></head><body>
      ${R.statut === 'Brouillon' ? '<div class="filigrane">BROUILLON</div>' : ''}<div class="head"><div><h1>${E(R.titre)}</h1><small>${E(R.sous || '')}${R.statut && R.statut !== 'Brouillon' ? ' · ' + E(R.statut) : ''}</small></div></div>${html}<div class="pied">${E(R.pied)}</div></body></html>`;
  }

  /* ---------- Écran ---------- */
  const BADGE = { Brouillon: 'b-amber', Validé: 'b-green', Transmis: 'b-blue' };
  const NIV = { Erreur: 'b-red', Alerte: 'b-amber', Info: 'b-grey' };
  const TEXTES = [
    ['faits', 'Faits marquants', 'Événements importants de la période : démarrages, achèvements, réunions, visites, livraisons… Une ligne commençant par « - » devient une puce.'],
    ['difficultes', 'Difficultés et points bloquants', 'Ce qui freine le chantier et ce qui est fait pour y remédier.'],
    ['hse', 'Sécurité, hygiène et environnement', 'Incidents, accidents, presqu\'accidents, port des EPI, propreté du chantier.'],
    ['demandesMO', 'Demandes au maître d\'ouvrage', 'Décisions, validations ou informations attendues de SCI ALBA, avec la date souhaitée.'],
    ['observations', 'Observations et conclusion', 'Appréciation générale et priorités de la période suivante.'],
  ];

  function render(v) {
    const ref = st.date || U.today();
    const { d0, titre } = periode(st.type, ref);
    const rec = enreg(st.type, d0), dr = brouillon(st.type, d0);
    const fige = rec && rec.statut !== 'Brouillon';
    const peut = S.can('rapports');
    const ro = fige || !peut;
    const P = APP.plan(), R = id => P.R.get(id), L = lignes(st.type, d0, periode(st.type, ref).d1, P);
    const ctl = controles(st.type, ref, dr), nE = ctl.filter(c => c.niv === 'Erreur').length, nA = ctl.filter(c => c.niv === 'Alerte').length;
    const statutRec = rec ? rec.statut : 'Non commencé';
    const textes = st.type === 'mensuel' ? [...TEXTES.slice(0, 4), ['finances', 'Commentaire financier', 'Situations reçues, paiements, besoins de trésorerie.'], TEXTES[4]] : TEXTES;

    v.innerHTML = `<div class="tabs">${[['hebdo', 'Rapport hebdomadaire'], ['mensuel', 'Rapport mensuel']].map(([k, l]) => `<button data-t="${k}" class="${st.type === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="toolbar"><label class="chk">${st.type === 'hebdo' ? 'Semaine du' : 'Mois de'}</label><input type="date" id="rDate" value="${ref}">
        <span class="badge ${BADGE[statutRec] || 'b-grey'}">${E(statutRec)}</span>${st.modifie ? '<span class="badge b-red">Modifications non enregistrées</span>' : ''}<span class="sep"></span>
        ${!ro ? `<button class="btn" id="rSave">Enregistrer</button><button class="btn primary" id="rVal">Valider le rapport</button>` : ''}
        ${fige && peut && rec.statut === 'Validé' ? '<button class="btn primary" id="rTrans">Marquer transmis</button>' : ''}
        ${fige && peut ? '<button class="btn" id="rOpen">Rouvrir</button>' : ''}
        <button class="btn" id="rPdf">${APP.icon('download', 15)} PDF</button><button class="btn" id="rPrint">${APP.icon('print', 15)} Imprimer</button></div>
      <div class="tabs">${[['remplir', '1. Remplir'], ['controle', `2. Contrôle${nE + nA ? ` (${nE ? nE + ' erreur' + (nE > 1 ? 's' : '') : ''}${nE && nA ? ', ' : ''}${nA ? nA + ' alerte' + (nA > 1 ? 's' : '') : ''})` : ' ✓'}`], ['apercu', '3. Aperçu'], ['histo', 'Historique']].map(([k, l]) => `<button data-v="${k}" class="${st.vue === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div id="rBody"></div>`;
    const body = UI.$('#rBody', v);
    const lire = () => {
      if (ro) return;
      UI.$$('[data-tx]', body).forEach(x => { dr.textes[x.dataset.tx] = x.value; });
      const red = UI.$('#rRed', body); if (red) dr.redacteur = red.value;
      dr.ajouts = dr.ajouts || { semaine: [], programme: [] };
      UI.$$('[data-aj]', body).forEach(tr => { const [k, i] = tr.dataset.aj.split(':'); const a = dr.ajouts[k][+i]; if (!a) return; UI.$$('[data-af]', tr).forEach(f => { a[f.dataset.af] = f.value; }); });
      UI.$$('[data-ls]', body).forEach(x => { const id = x.dataset.ls; const c = UI.$(`[data-lc="${id}"]`, body); const o = { statut: x.value, commentaire: c ? c.value.trim() : '' }; if (o.statut || o.commentaire) dr.lignes[id] = o; else delete dr.lignes[id]; });
    };
    const marque = () => { if (!st.modifie) { st.modifie = true; const tb = UI.$('.toolbar', v); if (tb && !UI.$('.b-red', tb)) UI.$('.sep', tb).insertAdjacentHTML('beforebegin', '<span class="badge b-red">Modifications non enregistrées</span>'); } };
    const enregistrer = (extra = {}, lib) => {
      lire();
      const r = S.save('rapports', Object.assign({ id: rec?.id, type: st.type, debut: d0, fin: periode(st.type, ref).d1, titre, statut: rec?.statut || 'Brouillon' }, JSON.parse(JSON.stringify(dr)), extra), lib || `${titre} : brouillon enregistré`);
      st.modifie = false; return r;
    };

    if (st.vue === 'remplir') {
      const ligne = t => { const r = R(t.id), auto = statutAuto(t, R), o = dr.lignes[t.id] || {};
        return `<tr><td>${ro ? '' : `<button class="icon-btn" data-masq="${t.id}" title="Retirer cette tâche du rapport">✕</button>`}</td><td>${E(lotDe(t))}</td><td><b>${E(t.nom)}</b><div class="muted">${E(interv(t))} · fin prévue ${U.fr(r.prev.fin)}</div></td><td style="white-space:nowrap">${r.av === null ? '<span class="muted">—</span>' : r.av + ' %'}</td>
          <td>${UI.badge(auto, (STATUTS.find(x => x.k === auto) || {}).b)}</td>
          <td><select data-ls="${t.id}" ${ro ? 'disabled' : ''}><option value="">Automatique</option>${STATUTS.map(x => `<option ${o.statut === x.k ? 'selected' : ''}>${x.k}</option>`).join('')}</select></td>
          <td><input data-lc="${t.id}" value="${E(o.commentaire || '')}" placeholder="${o.statut && o.statut !== auto ? 'Justification requise' : 'Commentaire (facultatif)'}" ${ro ? 'disabled' : ''} style="width:100%"></td></tr>`; };
      dr.ajouts = dr.ajouts || { semaine: [], programme: [] }; dr.masques = dr.masques || [];
      const travaux = L.Tw.slice().sort((x, y) => x.nom.localeCompare(y.nom));
      const dis = ro ? 'disabled' : '';
      const ligneM = t => `<tr class="muted"><td>${ro ? '' : `<button class="icon-btn" data-unm="${t.id}" title="Remettre dans le rapport">↺</button>`}</td><td>${E(lotDe(t))}</td><td><s>${E(t.nom)}</s> <span class="muted">— retirée du rapport (↺ pour la remettre)</span></td><td></td><td></td><td></td><td></td></tr>`;
      const ligneA = (k, a, i) => { const t = a.tacheId ? S.get('taches', a.tacheId) : null, r = t && R(t.id), auto = t ? statutAuto(t, R) : '';
        return `<tr data-aj="${k}:${i}" class="ajout"><td>${ro ? '' : `<button class="icon-btn" data-delaj="${k}:${i}" title="Supprimer la ligne">✕</button>`}</td><td><input data-af="lot" value="${E(a.lot || '')}" placeholder="Lot" ${dis} style="width:100%;min-width:90px"></td>
          <td><input data-af="nom" list="rTachesL" value="${E(a.nom || '')}" placeholder="Tâche du planning ou nouvelle tâche" ${dis} style="width:100%;min-width:220px;max-width:340px;font-weight:600">
            <div style="display:flex;gap:6px;margin-top:4px;max-width:340px"><input data-af="interv" value="${E(a.interv || '')}" placeholder="Intervenant" ${dis} style="flex:1;min-width:0"><input data-af="fin" type="date" value="${E(a.fin || '')}" title="Fin prévue" ${dis} style="width:150px"></div></td>
          <td style="white-space:nowrap">${r && r.av !== null ? r.av + ' %' : '<span class="muted">—</span>'}</td>
          <td>${auto ? UI.badge(auto, (STATUTS.find(x => x.k === auto) || {}).b) : UI.badge('Ajoutée', 'b-cyan')}</td>
          <td><select data-af="statut" ${dis}>${t ? '<option value="">Automatique</option>' : ''}${STATUTS.map(x => `<option ${a.statut === x.k ? 'selected' : ''}>${x.k}</option>`).join('')}</select></td>
          <td><input data-af="commentaire" value="${E(a.commentaire || '')}" placeholder="Commentaire (facultatif)" ${dis} style="width:100%"></td></tr>`; };
      const tab = (titre2, rows, k) => { const vis = rows.filter(t => !dr.masques.includes(t.id)), mq = rows.filter(t => dr.masques.includes(t.id)), aj = dr.ajouts[k] || [];
        const nb = vis.length + aj.length;
        return `<div class="card"><h3>${titre2} <span class="muted">(${nb})</span></h3>${nb || mq.length ? `<div style="overflow-x:auto"><table class="tbl"><thead><tr><th style="width:34px"></th><th>Lot</th><th>Travaux</th><th>Avct</th><th>Statut calculé</th><th>Statut retenu</th><th>Commentaire du rapport</th></tr></thead><tbody>${vis.map(ligne).join('')}${aj.map((a, i) => ligneA(k, a, i)).join('')}${mq.map(ligneM).join('')}</tbody></table></div>` : '<p class="muted">Aucune tâche.</p>'}
          ${ro ? '' : `<div style="margin-top:10px"><button class="btn" data-addaj="${k}">+ Ajouter une tâche</button> <span class="muted" style="margin-left:8px">Choisissez une tâche du planning dans la liste ou écrivez une nouvelle tâche.</span></div>`}</div>`; };
      body.innerHTML = `${fige ? `<div class="card" style="border-left:4px solid var(--caramel)"><b>Rapport ${E(rec.statut.toLowerCase())}</b> par ${E(rec.valideur || '')} le ${U.fr(rec.valideLe)}${rec.transmisLe ? `, transmis le ${U.fr(rec.transmisLe)}` : ''}. Son contenu est figé ; « Rouvrir » le repasse en brouillon.</div>` : ''}
        ${!peut ? '<div class="card"><b>Lecture seule</b> : votre profil ne permet pas de remplir les rapports.</div>' : ''}
        <div class="card"><div class="grid-form"><div class="field"><label>Rédacteur</label><input id="rRed" value="${E(dr.redacteur || '')}" ${ro ? 'disabled' : ''}></div><div class="field"><label>Période</label><input value="${E(titre)}" disabled></div></div></div>
        ${tab(st.type === 'hebdo' ? 'Travaux de la semaine' : 'Travaux du mois', L.actifs, 'semaine')}
        ${tab(st.type === 'hebdo' ? 'Programme de la semaine prochaine' : 'Programme du mois prochain', L.next, 'programme')}
        <datalist id="rTachesL">${travaux.map(t => `<option value="${E(t.nom)}">`).join('')}</datalist>
        <div class="card"><h3>Textes du rapport</h3><div class="grid-form">${textes.map(([k, l, hint]) => `<div class="field full"><label>${E(l)}</label><textarea data-tx="${k}" rows="4" placeholder="${E(hint)}" ${ro ? 'disabled' : ''}>${E(dr.textes[k] || '')}</textarea></div>`).join('')}</div>
          <p class="muted" style="margin-top:8px">Les rubriques laissées vides n'apparaissent pas dans le PDF. Les tableaux (délais, magasin, commandes, réserves, finances) sont remplis automatiquement à partir des données saisies.</p></div>
        <div class="card"><h3>Définition des statuts</h3><table class="tbl"><tbody>${STATUTS.map(x => `<tr><td style="width:130px">${UI.badge(x.k, x.b)}</td><td>${E(x.def)}</td></tr>`).join('')}</tbody></table>
          <p class="muted" style="margin-top:8px">Le statut est calculé automatiquement. Vous pouvez le remplacer ligne par ligne ; tout écart avec le calcul doit être justifié dans le commentaire.</p></div>`;
      const redessine = () => { st.modifie = true; const y = UI.$('#view') ? UI.$('#view').scrollTop : 0; APP.refresh(); if (UI.$('#view')) UI.$('#view').scrollTop = y; };
      UI.$$('[data-addaj]', body).forEach(b => b.onclick = () => { lire(); dr.ajouts[b.dataset.addaj].push({ k: U.uid(), lot: '', nom: '', interv: '', fin: '', statut: b.dataset.addaj === 'programme' ? 'À faire' : 'En cours', commentaire: '' }); redessine(); const L2 = UI.$$(`[data-aj^="${b.dataset.addaj}:"] [data-af="nom"]`); L2.length && L2[L2.length - 1].focus(); });
      UI.$$('[data-delaj]', body).forEach(b => b.onclick = () => { lire(); const [k, i] = b.dataset.delaj.split(':'); dr.ajouts[k].splice(+i, 1); redessine(); });
      UI.$$('[data-masq]', body).forEach(b => b.onclick = () => { lire(); if (!dr.masques.includes(b.dataset.masq)) dr.masques.push(b.dataset.masq); redessine(); });
      UI.$$('[data-unm]', body).forEach(b => b.onclick = () => { lire(); dr.masques = dr.masques.filter(x => x !== b.dataset.unm); redessine(); });
      UI.$$('[data-af="nom"]', body).forEach(x => x.addEventListener('change', () => { const t = travaux.find(t => t.nom === x.value.trim()); if (!t) { lire(); const [k, i] = x.closest('[data-aj]').dataset.aj.split(':'); dr.ajouts[k][+i].tacheId = ''; return; }
        lire(); const [k, i] = x.closest('[data-aj]').dataset.aj.split(':'); const a = dr.ajouts[k][+i]; const r = R(t.id);
        Object.assign(a, { tacheId: t.id, lot: a.lot || lotDe(t), interv: a.interv || (interv(t) !== '—' ? interv(t) : ''), fin: a.fin || (r ? r.prev.fin : ''), statut: '' }); redessine(); }));
      UI.$$('input,textarea,select', body).forEach(x => x.addEventListener(x.tagName === 'SELECT' ? 'change' : 'input', () => { lire(); marque(); if (x.dataset.ls !== undefined) { const c = UI.$(`[data-lc="${x.dataset.ls}"]`, body); if (c) c.placeholder = x.value ? 'Justification requise' : 'Commentaire (facultatif)'; } }));
    } else if (st.vue === 'controle') {
      const doms = [...new Set(ctl.map(c => c.dom))];
      body.innerHTML = `<div class="card"><p><b>${ctl.length ? `${nE} erreur(s), ${nA} alerte(s), ${ctl.length - nE - nA} information(s)` : 'Aucune incohérence détectée.'}</b></p>
        <p class="muted">Erreur : donnée fausse à corriger avant validation. Alerte : point à vérifier ou à expliquer dans le rapport. Info : suggestion d'amélioration.</p></div>
        ${doms.map(dm => `<div class="card"><h3>${E(dm)}</h3><table class="tbl"><tbody>${ctl.filter(c => c.dom === dm).map(c => `<tr><td style="width:90px">${UI.badge(c.niv, NIV[c.niv])}</td><td>${E(c.msg)}</td><td style="width:110px;text-align:right">${c.mod ? `<button class="btn sm" data-go="${c.mod}">Corriger</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`).join('')}`;
      UI.$$('[data-go]', body).forEach(b => b.onclick = () => APP.go(b.dataset.go));
    } else if (st.vue === 'apercu') {
      body.innerHTML = `<div class="card" style="padding:0;overflow:hidden"><iframe id="rPrev" title="Aperçu du rapport" style="width:100%;height:calc(100vh - 300px);border:0;background:#fff"></iframe></div>`;
      UI.$('#rPrev', body).srcdoc = doc(build(st.type, ref, dr, rec));
    } else {
      const L2 = S.list('rapports').sort(U.by('debut', -1));
      body.innerHTML = `<div class="card">${L2.length ? `<table class="tbl"><thead><tr><th>Rapport</th><th>Statut</th><th>Rédacteur</th><th>Validé</th><th>Transmis</th><th></th></tr></thead><tbody>${L2.map(r => `<tr><td><b>${E(r.titre || r.debut)}</b></td><td>${UI.badge(r.statut, BADGE[r.statut])}</td><td>${E(r.redacteur || '')}</td><td>${r.valideLe ? U.fr(r.valideLe) + ' · ' + E(r.valideur || '') : ''}</td><td>${r.transmisLe ? U.fr(r.transmisLe) : ''}</td><td style="text-align:right"><button class="btn sm" data-open="${r.id}">Ouvrir</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucun rapport enregistré pour le moment.</p>'}</div>`;
      UI.$$('[data-open]', body).forEach(b => b.onclick = () => { const r = S.get('rapports', b.dataset.open); st.type = r.type; st.date = r.debut; st.vue = 'apercu'; st.cle = ''; APP.refresh(); });
    }

    const garde = f => () => { if (st.modifie && !confirm('Des modifications ne sont pas enregistrées. Continuer sans enregistrer ?')) return; st.modifie = false; st.cle = ''; f(); APP.refresh(); };
    UI.$$('[data-t]', v).forEach(b => b.onclick = garde(() => { st.type = b.dataset.t; }));
    UI.$('#rDate', v).onchange = e => { const val = e.target.value; garde(() => { st.date = val; })(); };
    UI.$$('[data-v]', v).forEach(b => b.onclick = () => { lire(); st.vue = b.dataset.v; APP.refresh(); });
    const bS = UI.$('#rSave', v); if (bS) bS.onclick = () => { enregistrer(); UI.toast('Rapport enregistré (brouillon)'); };
    const bV = UI.$('#rVal', v); if (bV) bV.onclick = () => {
      lire(); const c2 = controles(st.type, ref, dr), e2 = c2.filter(c => c.niv === 'Erreur').length;
      const go = () => {
        const r = enregistrer({ statut: 'Validé', valideur: S.user?.nom || dr.redacteur, valideLe: U.today() }, `${titre} validé`);
        const Rf = build(st.type, ref, dr, r); S.save('rapports', { id: r.id, fige: { auteur: Rf.auteur, titre: Rf.titre, sous: Rf.sous, html: Rf.html, pied: Rf.pied, nom: Rf.nom } }); UI.toast('Rapport validé : son contenu est figé'); };
      if (e2) UI.confirm(`Le contrôle signale ${e2} erreur(s). Il est conseillé de les corriger avant de valider. Valider quand même ?`, go, 'Valider quand même');
      else UI.confirm('Valider ce rapport ? Son contenu sera figé tel qu\'il apparaît dans l\'aperçu.', go, 'Valider');
    };
    const bT = UI.$('#rTrans', v); if (bT) bT.onclick = () => UI.confirm(`Marquer ce rapport comme transmis à ${S.data.projet.maitreOuvrage || 'au maître d\'ouvrage'} aujourd'hui ?`, () => { S.save('rapports', { id: rec.id, statut: 'Transmis', transmisLe: U.today(), transmisA: S.data.projet.maitreOuvrage || '' }, `${titre} transmis au maître d'ouvrage`); UI.toast('Rapport marqué transmis'); }, 'Confirmer');
    const bO = UI.$('#rOpen', v); if (bO) bO.onclick = () => UI.confirm('Rouvrir ce rapport ? Il repassera en brouillon et sera recalculé avec les données actuelles.', () => { S.save('rapports', { id: rec.id, statut: 'Brouillon', fige: null, valideLe: '', valideur: '', transmisLe: '' }, `${titre} rouvert`); st.cle = ''; }, 'Rouvrir');
    const courant = () => { lire(); return build(st.type, ref, dr, rec); };
    UI.$('#rPdf', v).onclick = () => { const Rp = courant(); UIX.pdf(Rp.nom, Rp.titre, doc(Rp), { brut: true, pied: Rp.pied }); S.log(`${Rp.titre} : PDF généré (${Rp.statut})`); };
    UI.$('#rPrint', v).onclick = () => { const Rp = courant(); UI.printDoc(Rp.titre, doc(Rp), { brut: true }); };
  }

  APP.mod('rapports', { title: 'Rapports', group: 'Pilotage', sub: 'Rapports hebdomadaire et mensuel : remplir, contrôler, valider et transmettre au maître d\'ouvrage', render });
  return { build, doc, controles, statutAuto, STATUTS };
})();
