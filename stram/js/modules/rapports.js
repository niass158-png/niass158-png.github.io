/* STRAM Suivi — Rapports hebdomadaire et mensuel (PDF) */
'use strict';
const RAPPORTS = (() => {
  const st = { type: 'hebdo', date: '' };
  const E = U.esc;
  const lundi = d => { const x = U.parse(d); const k = (x.getDay() + 6) % 7; x.setDate(x.getDate() - k); return U.iso(x); };
  const tbl = (head, rows, empty = 'Néant', cls = '') => rows.length ? `<table class="t ${cls}"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table>` : `<p class="vide">${empty}</p>`;
  const sec = (n, titre, html, legende) => `<section><h2><span>${String(n).padStart(2, '0')}</span>${titre}</h2>${legende ? `<p class="leg">${legende}</p>` : ''}${html}</section>`;
  const LEG = 'Statut : Fait / En cours / À faire / Reporté';
  const ent = t => S.get('entreprises', t.entrepriseId) || {};
  const lotDe = t => { const e = ent(t); return e.corpsEtat || (e.lot || '').split(/\s+[-–]\s+/)[0] || t.phase || '—'; };
  const interv = t => { const e = ent(t); return e.responsable || t.intervenant || e.nom || '—'; };
  /** Statut au sens du rapport journalier */
  const statut = r => r.etat === 'Terminée' ? 'Fait' : (r.etat === 'En cours' || r.etat === 'Avancement non renseigné' && r.prev.debut <= U.today()) ? 'En cours' : (r.etat === 'Non démarrée (en retard)' || U.parse(r.prev.debut) > U.parse(r.plan.debut)) ? 'Reporté' : 'À faire';
  const stCls = s => ({ Fait: 'ok', Reporté: 'bad', 'En cours': 'enc' }[s] || '');

  function build(type, ref) {
    const P = APP.plan(), p = S.data.projet, T = S.list('taches');
    let d0, d1, titre, sous;
    if (type === 'hebdo') {
      d0 = lundi(ref); d1 = U.addDays(d0, 6);
      const sem = (() => { const x = U.parse(d0); const j = new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate() + 3)); const y = new Date(Date.UTC(j.getUTCFullYear(), 0, 4)); return 1 + Math.round(((j - y) / 864e5 - 3 + ((y.getUTCDay() + 6) % 7)) / 7); })();
      titre = `Rapport hebdomadaire du ${U.fr(d0)} au ${U.fr(d1)}`; sous = `Semaine ${sem} · avancement, délais et logistique`;
    } else {
      const x = U.parse(ref); d0 = U.iso(new Date(x.getFullYear(), x.getMonth(), 1)); d1 = U.iso(new Date(x.getFullYear(), x.getMonth() + 1, 0));
      const mois = x.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      titre = `Rapport mensuel de ${mois}`; sous = `Du ${U.fr(d0)} au ${U.fr(d1)} · avancement, délais, logistique et finances`;
    }
    const inP = d => d && d >= d0 && d <= d1;
    const R = id => P.R.get(id);
    const auteur = S.user?.nom || p.utilisateur || '';
    const Tw = T.filter(t => R(t.id) && R(t.id).type === 'Travaux');
    const ecart = P.ecartFin;
    const av = (p.avenantsDelai || []);

    let h = `<div class="id"><table><tr><th>Projet</th><td>${E(p.nom || 'STRAM')}</td><th>Client</th><td>${E(p.maitreOuvrage || '—')}</td></tr>
      <tr><th>Période</th><td>${U.fr(d0)} – ${U.fr(d1)}</td><th>Établi par</th><td>${E(auteur)}${p.maitreOeuvre ? ` (${E(p.maitreOeuvre)})` : ''}</td></tr></table></div>`;

    // 01 synthèse
    const faits = Tw.filter(t => inP(R(t.id).prev.fin) && R(t.id).etat === 'Terminée');
    const saisis = S.list('avancements').filter(a => inP(a.date) && !/importé/i.test(a.commentaire || ''));
    const parLot = {}; [...faits, ...saisis.map(a => S.get('taches', a.tacheId)).filter(Boolean)].forEach(t => { const l = lotDe(t); (parLot[l] = parLot[l] || new Set()).add(t.nom); });
    const lignes = [
      `Avancement global : <b>${P.avancementGlobal} %</b> (attendu ${P.avancementAttendu} %)`,
      `Fin contractuelle : <b>${U.fr(p.dateFinContractuelle)}</b>${av.length ? ` (initiale ${U.fr(p.dateFinInitiale)}, ${av.length} prolongation(s))` : ''} · fin prévisionnelle : <b class="${ecart > 0 ? 'bad' : ''}">${U.fr(P.finPrevue)}</b> · ${ecart > 0 ? `<b class="bad">dépassement prévisible de ${ecart} j ouvrés</b>` : '<b class="ok">dans les délais</b>'}`,
      ...Object.entries(parLot).slice(0, 10).map(([l, s]) => `${E(l)} : ${E([...s].slice(0, 3).map(n => U.norm(n).startsWith(U.norm(l).slice(0, 6)) ? n.replace(/^[^–-]+[–-]\s*/, '') : n).join(', '))}`),
    ];
    h += sec(1, type === 'hebdo' ? 'Synthèse de la semaine' : 'Synthèse du mois', `<ul class="syn">${lignes.map(x => `<li>${x}</li>`).join('')}</ul>`);

    // 02 avancement et délais
    const c = PLANNING.svgCourbe(860, 240);
    const phases = []; T.forEach(t => { const ph = t.phase || 'Sans phase'; if (!phases.includes(ph)) phases.push(ph); });
    h += sec(2, 'Avancement et délais', `<table class="k"><tr><td><span>Avancement réel</span><b>${P.avancementGlobal} %</b></td><td><span>Attendu à ce jour</span><b>${P.avancementAttendu} %</b></td><td><span>Fin contractuelle</span><b>${U.fr(p.dateFinContractuelle)}</b></td><td><span>Fin prévisionnelle</span><b class="${ecart > 0 ? 'bad' : ''}">${U.fr(P.finPrevue)}</b></td><td><span>Écart</span><b class="${ecart > 0 ? 'bad' : 'ok'}">${ecart > 0 ? '+' + ecart + ' j' : 'aucun'}</b></td></tr></table>
      ${c.svg}<p class="leg">Pointillés : avancement prévu · trait plein : avancement réel saisi (travaux uniquement).</p>
      ${tbl(['Phase', 'Avancement', 'Attendu', 'Tâches en retard'], phases.map(ph => { let w = 0, a = 0, x = 0, l = 0; T.filter(t => (t.phase || 'Sans phase') === ph).forEach(t => { const r = R(t.id); if (r.enRetard) l++; if (!r.poids) return; w += r.poids; a += r.poids * (r.av ?? r.attendu) / 100; x += r.poids * r.attendu / 100; });
        return [E(ph), w ? Math.round(100 * a / w) + ' %' : '—', w ? Math.round(100 * x / w) + ' %' : '—', l ? `<span class="bad">${l}</span>` : '0']; }))}
      ${av.length ? `<p class="leg" style="margin-top:8px">Prolongations accordées : ${av.map(a => `${U.fr(a.date)} ${E(a.ref || '')} → ${U.fr(a.nouvelleFin)}${a.motif ? ' (' + E(a.motif) + ')' : ''}`).join(' · ')}</p>` : ''}`);

    // 03 travaux de la période
    const actifs = Tw.filter(t => { const r = R(t.id); return r.prev.debut <= d1 && r.prev.fin >= d0; }).sort((a, b) => lotDe(a).localeCompare(lotDe(b)) || R(a.id).prev.fin.localeCompare(R(b.id).prev.fin));
    const comm = t => { const a = saisis.filter(x => x.tacheId === t.id).sort(U.by('date')).pop(); return a ? `<div class="cm">${a.av} %${a.commentaire ? ' — ' + E(a.commentaire) : ''}</div>` : ''; };
    h += sec(3, type === 'hebdo' ? 'Travaux de la semaine' : 'Travaux du mois', tbl(['Lot', 'Travaux', 'Intervenant', 'Fin prévue', 'Statut'], actifs.map(t => { const r = R(t.id), s = statut(r); return [E(lotDe(t)), E(t.nom) + comm(t), E(interv(t)), U.fr(r.prev.fin).slice(0, 5), `<span class="${stCls(s)}">${s}</span>`]; }), 'Aucun travail sur la période.'), LEG);

    // 04 programme
    const horizon = U.addDays(d1, type === 'hebdo' ? 7 : 31);
    const next = Tw.filter(t => { const r = R(t.id); return r.etat !== 'Terminée' && r.prev.debut <= horizon && r.prev.fin > d1; }).sort((a, b) => R(a.id).prev.debut.localeCompare(R(b.id).prev.debut));
    h += sec(4, type === 'hebdo' ? 'Programme de la semaine prochaine' : 'Programme du mois prochain', tbl(['Lot', 'Travaux', 'Intervenant', 'Fin prévue', 'Statut'], next.map(t => { const r = R(t.id), s = statut(r); return [E(lotDe(t)), E(t.nom), E(interv(t)), U.fr(r.prev.fin).slice(0, 5), `<span class="${stCls(s)}">${s}</span>`]; }), 'Rien de prévu.'), LEG);

    // 05 retards
    const late = T.filter(t => R(t.id).enRetard).sort((a, b) => (R(a.id).marge ?? 999) - (R(b.id).marge ?? 999));
    const dec = T.filter(t => R(t.id).decale > 0);
    h += sec(5, 'Retards et points de vigilance', tbl(['Tâche', 'Intervenant', 'Fin prévue', 'Avancement', 'Marge'], late.map(t => { const r = R(t.id); return [E(t.nom), E(interv(t)), U.fr(r.prev.fin), r.av === null ? '<span class="vide">non saisi</span>' : r.av + ' %', `<span class="${r.marge < 0 ? 'bad' : ''}">${r.marge ?? '—'} j</span>`]; }), 'Aucune tâche en retard.')
      + (dec.length ? `<p class="leg" style="margin-top:8px">Incohérences du planning source : ${dec.map(t => `${E(t.nom)} (+${R(t.id).decale} j)`).join(' · ')}</p>` : ''));

    // 06 décisions MO
    const mo = T.filter(t => R(t.id).type === 'Validation MO' && R(t.id).etat !== 'Terminée').sort((a, b) => R(a.id).prev.fin.localeCompare(R(b.id).prev.fin));
    h += sec(6, 'Décisions attendues du maître d\'ouvrage', tbl(['Décision', 'Échéance', 'Travaux bloqués'], mo.map(t => { const r = R(t.id); return [E(t.nom), `<span class="${r.prev.fin < U.today() ? 'bad' : ''}">${U.fr(r.prev.fin)}</span>`, E(T.filter(x => (x.predecesseurs || []).some(pp => pp.id === t.id)).map(x => x.nom).join(' · ') || '—')]; }), 'Aucune décision en attente.'));

    // 07 approvisionnements et commandes
    const appro = T.filter(t => R(t.id).type === 'Approvisionnement' && R(t.id).etat !== 'Terminée' && R(t.id).prev.fin <= horizon).sort((a, b) => R(a.id).prev.fin.localeCompare(R(b.id).prev.fin));
    const cmd = S.list('commandes').filter(c => c.statut === 'À passer' || (!['Livrée', 'Annulée'].includes(c.statut)) || inP(c.dateLivraison));
    h += sec(7, 'Approvisionnements et commandes', tbl(['Approvisionnement', 'Arrivée prévue', 'Pour'], appro.map(t => [E(t.nom), U.fr(R(t.id).prev.fin), E(T.filter(x => (x.predecesseurs || []).some(pp => pp.id === t.id)).map(x => x.nom).join(' · ') || '—')]), 'Aucun approvisionnement attendu.')
      + (cmd.length ? tbl(['Bon de commande', 'Fournisseur', 'Statut', 'Commander avant', 'Livraison'], cmd.map(c => [`<b>${E(c.num)}</b>`, E(S.get('fournisseurs', c.fournisseurId)?.nom || ''), c.statut, window.CMD ? U.fr(CMD.commanderAvant(c)) : '', U.fr(c.dateLivraison || c.livraisonPrevue)])) : ''));

    // 08 magasin
    const mv = S.list('mouvements').filter(m => inP(m.date));
    const bons = {}; mv.forEach(m => { (bons[m.numBon] = bons[m.numBon] || []).push(m); });
    const alertes = STOCK.etat().filter(r => ['Écart', 'Sous le seuil', 'Épuisé'].includes(r.statut));
    h += sec(8, 'Magasin', `<p>${Object.values(bons).filter(L => L[0].type === 'Sortie').length} bon(s) de sortie, ${Object.values(bons).filter(L => L[0].type === 'Entrée').length} entrée(s), ${Object.values(bons).filter(L => L[0].type === 'Retour').length} retour(s) · ${alertes.length} alerte(s) de stock.</p>`
      + tbl(['Bon', 'Date', 'Entreprise / fournisseur', 'Articles', 'Autorisé par'], Object.entries(bons).sort((a, b) => a[1][0].date.localeCompare(b[1][0].date)).map(([n, L]) => [`<b>${E(n)}</b>`, U.fr(L[0].date), E(L[0].demandeur || L[0].fournisseur || ''), L.map(m => { const a = S.get('articles', m.articleId) || {}; return `${E(a.code)} ${E(a.designation)} × ${U.qty(m.quantite)}`; }).join('<br>'), E(L[0].autorisePar || '')]), 'Aucun mouvement sur la période.')
      + (alertes.length ? tbl(['Article', 'Solde', 'Seuil', 'Statut'], alertes.map(r => [`${E(r.a.code)} ${E(r.a.designation)}`, `${U.qty(r.solde)} ${E(r.a.unite)}`, U.qty(r.a.seuil), `<span class="bad">${r.statut}</span>`])) : ''));

    // 09 personnel, accès, journal
    const ac = S.list('acces').filter(a => inP(a.date)); const byE = {}; ac.forEach(a => byE[a.entreprise || '—'] = (byE[a.entreprise || '—'] || 0) + 1);
    const jr = S.list('journal').filter(j => inP(j.date)).sort(U.by('date'));
    h += sec(9, 'Personnel, accès et journal de chantier', `<p>${ac.length} passage(s) enregistré(s)${Object.keys(byE).length ? ' : ' + Object.entries(byE).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${E(k)} ${v}`).join(' · ') : ''}.</p>`
      + tbl(['Date', 'Météo', 'Effectif', 'Travaux réalisés', 'Incidents'], jr.map(j => [U.fr(j.date), E(j.meteo || ''), E(j.effectif || ''), E(j.travaux || '').replace(/\n/g, '<br>'), E(j.incidents || '')]), 'Aucune entrée de journal sur la période.'));

    // 10 actions et réserves
    const acts = S.list('actions').filter(a => a.statut !== 'Soldée').sort(U.by('echeance'));
    const res = S.list('reserves').filter(r => r.statut !== 'Levée');
    h += sec(10, 'Actions et réserves', tbl(['Action', 'Responsable', 'Échéance', 'Statut'], acts.map(a => [E(a.description), E(a.responsable || ''), `<span class="${a.echeance && a.echeance < U.today() ? 'bad' : ''}">${U.fr(a.echeance)}</span>`, E(a.statut || '')]), 'Aucune action ouverte.')
      + (res.length ? tbl(['Réserve', 'Zone', 'Entreprise', 'Description', 'Échéance'], res.map(r => [E(r.num), E(r.zone), E(APP.entNom(r.entrepriseId)), E(r.description), U.fr(r.echeance)])) : ''));

    let n = 11;
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
        + tbl(['Mois', 'Travaux', 'Situations', 'Approvisionnements', 'Besoin total TTC'], tr.map(r => [U.moisAn(r.mois), U.money(r.travaux), U.money(r.situations), U.money(r.appro), `<b>${U.money(r.total)}</b>`])));
    }
    // reportage photos, présenté comme le rapport journalier
    const ph = S.list('photos').filter(x => inP(x.date));
    if (ph.length) {
      const grp = {}; ph.forEach(x => { const k = x.cible ? x.cible.col + ':' + x.cible.id : 'libre'; (grp[k] = grp[k] || []).push(x); });
      const blocs = Object.entries(grp).slice(0, 12).map(([k, L]) => {
        const [col, id] = k.split(':'); const o = col !== 'libre' ? S.get(col, id) : null;
        let lot = '—', tache = L[0].legende || 'Photo', qui = '—', st2 = '';
        if (col === 'taches' && o) { lot = lotDe(o); tache = o.nom; qui = interv(o); st2 = statut(R(o.id)); }
        else if (col === 'reserves' && o) { lot = APP.entNom(o.entrepriseId); tache = 'Réserve ' + (o.num || '') + ' — ' + (o.description || ''); st2 = o.statut || ''; }
        else if (col === 'journal' && o) { lot = 'Journal'; tache = `Journal du ${U.fr(o.date)}`; }
        const loc = (o && (o.zone || o.localisation)) || '';
        return `<div class="bloc"><table class="t"><tr><th>Lot</th><th>Tâche</th><th>Intervenant</th><th>Statut</th></tr><tr><td>${E(lot)}</td><td>${E(tache)}</td><td>${E(qui)}</td><td><span class="${stCls(st2)}">${E(st2)}</span></td></tr></table>
          <div class="ph">${L.slice(0, 2).map(x => `<figure><img src="${x.data}"><table class="lc">${loc ? `<tr><th>Localisation</th><td>${E(loc)}</td></tr>` : ''}<tr><th>Commentaire</th><td>${E(x.legende || '')}</td></tr></table></figure>`).join('')}</div></div>`;
      });
      h += `<section class="photos"><h2><span>${String(n++).padStart(2, '0')}</span>Reportage photos</h2>${blocs.join('')}</section>`;
    }
    h += `<p class="sign">Établi par ${E(auteur.toUpperCase())}, le ${U.fr(U.today())}</p>`;
    return { titre, sous, html: h, pied: `STRAM · ${type === 'hebdo' ? 'Rapport hebdomadaire' : 'Rapport mensuel'}`, nom: `STRAM_${type === 'hebdo' ? 'Rapport_hebdo_' + d0 : 'Rapport_mensuel_' + d0.slice(0, 7)}.pdf` };
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
      .pied{position:fixed;bottom:0;left:0;right:0;text-align:center;color:#999;font-size:8.5px}@media screen{.pied{display:none}}`;
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${E(R.titre)}</title><style>${css}</style></head><body>
      <div class="head"><div><h1>${E(R.titre)}</h1><small>${E(R.sous || '')}</small></div></div>${R.html}<div class="pied">${E(R.pied)}</div></body></html>`;
  }

  function render(v) {
    const d = st.date || U.today();
    v.innerHTML = `<div class="tabs">${[['hebdo', 'Rapport hebdomadaire'], ['mensuel', 'Rapport mensuel']].map(([k, l]) => `<button data-t="${k}" class="${st.type === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="toolbar"><label class="chk">${st.type === 'hebdo' ? 'Semaine du' : 'Mois de'}</label><input type="date" id="rDate" value="${d}"><span class="sep"></span>
      <button class="btn primary" id="rPdf">${APP.icon('download', 15)} Enregistrer en PDF</button><button class="btn" id="rPrint">${APP.icon('print', 15)} Imprimer</button></div>
      <div class="card" style="padding:0;overflow:hidden"><iframe id="rPrev" title="Aperçu du rapport" style="width:100%;height:calc(100vh - 250px);border:0;background:#fff"></iframe></div>`;
    const R = build(st.type, d);
    UI.$('#rPrev', v).srcdoc = doc(R);
    UI.$$('[data-t]', v).forEach(b => b.onclick = () => { st.type = b.dataset.t; APP.refresh(); });
    UI.$('#rDate', v).onchange = e => { st.date = e.target.value; APP.refresh(); };
    UI.$('#rPdf', v).onclick = () => { UIX.pdf(R.nom, R.titre, doc(R), { brut: true, pied: R.pied }); S.log(`${R.titre} généré`); };
    UI.$('#rPrint', v).onclick = () => UI.printDoc(R.titre, doc(R), { brut: true });
  }

  APP.mod('rapports', { title: 'Rapports', group: 'Pilotage', sub: 'Rapports hebdomadaire et mensuel prêts à transmettre au maître d\'ouvrage', render });
  return { build, doc };
})();
