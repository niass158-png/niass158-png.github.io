/* STRAM Suivi — Tableau de bord des délais et alertes */
'use strict';
const ALERTES = () => {
  const P = APP.plan(), out = [];
  const T = S.list('taches');
  T.forEach(t => {
    const r = P.R.get(t.id); if (!r) return;
    const nom = `${APP.entNom(t.entrepriseId)} — ${t.nom || t.zone || ''}`;
    if (r.cycle) out.push({ niv: 3, mod: 'planning', txt: `Boucle de dépendances sur « ${nom} »` });
    else if (r.etat === 'Non démarrée (en retard)') out.push({ niv: 3, mod: 'planning', txt: `${nom} : démarrage prévu le ${U.fr(r.plan.debut)} non effectué` });
    else if (r.marge !== null && r.marge < 0) out.push({ niv: 3, mod: 'planning', txt: `${nom} : marge de ${r.marge} j ouvrés — ${r.prev.fin > (S.data.projet.dateFinContractuelle || '') ? `fin prévue le ${U.fr(r.prev.fin)}, après la date contractuelle` : 'retarde une tâche qui la suit et la fin du projet'}` });
    else if (r.ecartAvancement !== null && r.ecartAvancement < -10) out.push({ niv: 2, mod: 'planning', txt: `${nom} : avancement ${r.av} % pour ${r.attendu} % attendus` });
  });
  const dec = T.filter(t => P.R.get(t.id)?.decale > 0);
  dec.forEach(t => out.push({ niv: 2, mod: 'planning', txt: `${t.nom} : décalée de ${P.R.get(t.id).decale} j ouvrés par ses prédécesseurs (incohérence du planning source)` }));
  const nonRens = T.filter(t => { const r = P.R.get(t.id); return r && r.etat === 'Avancement non renseigné'; }).length;
  if (nonRens) out.push({ niv: 1, mod: 'planning', txt: `${nonRens} tâche(s) démarrée(s) sans avancement renseigné : la prévision les suppose dans les temps` });
  S.list('articles').forEach(a => {
    const s = APP.stockOf(a.id);
    if (s < 0) out.push({ niv: 3, mod: 'stock', txt: `Stock négatif : ${a.designation} (${U.qty(s)} ${a.unite})` });
    else if (a.seuil !== '' && a.seuil !== undefined && s <= U.num(a.seuil)) out.push({ niv: 2, mod: 'stock', txt: `Sous le seuil : ${a.designation} — ${U.qty(s)} ${a.unite} (seuil ${U.qty(a.seuil)})` });
  });
  S.list('commandes').forEach(c => {
    if (['Envoyée', 'Partiellement livrée', 'Validée'].includes(c.statut) && c.livraisonPrevue && c.livraisonPrevue < U.today())
      out.push({ niv: 2, mod: 'commandes', txt: `Commande ${c.num} : livraison attendue le ${U.fr(c.livraisonPrevue)}` });
    const av = window.CMD ? CMD.commanderAvant(c) : c.dateBesoin;
    if (c.statut === 'À passer' && av && U.diffDays(U.today(), av) <= 7)
      out.push({ niv: U.diffDays(U.today(), av) < 0 ? 3 : 2, mod: 'commandes', txt: `Commande ${c.num || ''} à passer : à commander avant le ${U.fr(av)}` });
  });
  S.list('situations').forEach(s => {
    if (['Reçue', 'Vérifiée', 'Validée'].includes(s.statut) && s.dateReception && U.diffDays(s.dateReception, U.today()) > 30)
      out.push({ niv: 2, mod: 'finances', txt: `Situation n°${s.num} de ${APP.entNom(S.get('marches', s.marcheId)?.entrepriseId)} en attente depuis ${U.diffDays(s.dateReception, U.today())} jours` });
  });
  S.list('actions').forEach(a => { if (a.statut !== 'Soldée' && a.echeance && a.echeance < U.today()) out.push({ niv: 2, mod: 'chantier', txt: `Action échue (${U.fr(a.echeance)}) : ${a.description} — ${a.responsable || ''}` }); });
  S.list('reserves').forEach(r => { if (r.statut !== 'Levée' && r.echeance && r.echeance < U.today()) out.push({ niv: 2, mod: 'chantier', txt: `Réserve non levée (échéance ${U.fr(r.echeance)}) : ${r.description}` }); });
  return out.sort((a, b) => b.niv - a.niv);
};

APP.mod('dashboard', {
  title: 'Tableau de bord', short: 'Accueil', icon: '', group: 'Pilotage', mobile: true, sub: '',
  badge: () => ALERTES().filter(a => a.niv === 3).length,
  render(v) {
    const P = APP.plan(), p = S.data.projet, T = S.list('taches');
    const al = ALERTES(), ic = APP.icon;
    const retard = T.filter(t => P.R.get(t.id)?.enRetard).length;
    const crit = T.filter(t => { const r = P.R.get(t.id); return r && r.critique && r.etat !== 'Terminée'; }).length;
  const nonRens = T.filter(t => P.R.get(t.id)?.etat === 'Avancement non renseigné').length;
    const arts = S.list('articles');
    const sousSeuil = arts.filter(a => { const s = APP.stockOf(a.id); return s < 0 || (a.seuil !== '' && a.seuil !== undefined && s <= U.num(a.seuil)); }).length;
    const F = FIN.totaux();
    const ecart = P.ecartFin;
    const now = new Date(), h = now.getHours();
    const salut = h < 13 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
    const qui = p.utilisateur ? ' ' + U.esc(p.utilisateur) : '';
    const etatTxt = ecart > 0 ? `risque de dépasser sa fin contractuelle de ${ecart} jours ouvrés.` : 'est dans les délais.';
    const jours = P.joursRestants;
    const C = 2 * Math.PI * 54, dash = C * Math.min(100, P.delaiEcoule) / 100;
    const longDate = d => { const x = U.parse(d); return x ? x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'; };
    const dateDuJour = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // à faire : alertes + échéances proches
    const lim = U.addDays(U.today(), 14), ev = [];
    T.forEach(t => { const r = P.R.get(t.id); if (r.etat === 'Terminée') return;
      if (r.prev.fin >= U.today() && r.prev.fin <= lim) ev.push({ d: r.prev.fin, t: `Fin ${APP.entNom(t.entrepriseId)}`, s: t.nom, mod: 'planning' });
      if (r.prev.debut > U.today() && r.prev.debut <= lim) ev.push({ d: r.prev.debut, t: `Démarrage ${APP.entNom(t.entrepriseId)}`, s: t.nom, mod: 'planning' }); });
    S.list('commandes').forEach(c => { if (c.livraisonPrevue >= U.today() && c.livraisonPrevue <= lim && !['Livrée', 'Annulée'].includes(c.statut)) ev.push({ d: c.livraisonPrevue, t: `Livraison ${c.num}`, s: S.get('fournisseurs', c.fournisseurId)?.nom || '', mod: 'commandes' }); });
    S.list('reunions').forEach(r => { if (r.prochaine >= U.today() && r.prochaine <= lim) ev.push({ d: r.prochaine, t: 'Réunion de chantier', s: r.type, mod: 'chantier' }); });
    ev.sort(U.by('d'));
    const todo = [];
    const mo = T.map(t => ({ t, r: P.R.get(t.id) })).filter(x => x.r.type === 'Validation MO' && x.r.etat !== 'Terminée' && x.r.prev.fin <= U.addDays(U.today(), 14)).sort((a, b) => a.r.prev.fin.localeCompare(b.r.prev.fin));
    if (mo.length) todo.push({ niv: mo.some(x => x.r.prev.fin < U.today()) ? 3 : 2, mod: 'planning', t: `${mo.length} validation(s) du maître d'ouvrage attendue(s)`, s: mo.slice(0, 2).map(x => x.t.nom.replace(/^.*Validation MO\s*[:—–-]?\s*/i, '')).join(' · ') });
    if (!S.list('habilites').length) todo.push({ niv: 2, mod: 'acces', t: 'Désigner les personnes habilitées', s: 'Titulaire, suppléant, monte-charge' });
    al.forEach(a => { if (a.niv === 1 && /avancement/.test(a.txt)) todo.push({ niv: 2, mod: 'planning', t: `Saisir ${nonRens} avancement(s)`, s: 'Lots démarrés sans avancement renseigné' }); else todo.push({ niv: a.niv, mod: a.mod, t: a.txt.split(' : ')[0], s: a.txt.split(' : ').slice(1).join(' : ') }); });
    if (F.resteAPayer > 0) todo.push({ niv: 1, mod: 'finances', t: `Reste à payer : ${U.money(F.resteAPayer)}`, s: 'Situations reçues non réglées' });

    // corps d'état en cours
    const lots = S.list('entreprises').map(e => {
      const ts = T.filter(t => t.entrepriseId === e.id && P.R.get(t.id)?.poids); if (!ts.length) return null;
      let w = 0, a = 0, fin = null, ret = false, cr = false, rens = false, deb = null;
      ts.forEach(t => { const r = P.R.get(t.id); w += r.dur; a += r.dur * (r.av ?? r.attendu) / 100; if (!fin || r.prev.fin > fin) fin = r.prev.fin; if (!deb || r.prev.debut < deb) deb = r.prev.debut; if (r.enRetard) ret = true; if (r.critique && r.etat !== 'Terminée') cr = true; if (r.av !== null) rens = true; });
      return { e, av: Math.round(100 * a / w), fin, deb, ret, cr, rens };
    }).filter(x => x && x.deb <= U.today() && x.fin >= U.today()).sort((a, b) => (b.cr - a.cr) || a.fin.localeCompare(b.fin));

    v.innerHTML = `
      <div class="hello"><span>${dateDuJour.charAt(0).toUpperCase() + dateDuJour.slice(1)}</span><h2>${salut}${qui}, le chantier ${U.esc(p.nom || '')} ${etatTxt}</h2></div>
      <div class="dash-top">
        <a class="hero" href="#planning">
          <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label="Délai consommé : ${P.delaiEcoule} %"><circle cx="66" cy="66" r="54" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="12"/><circle cx="66" cy="66" r="54" fill="none" stroke="#93B5D3" stroke-width="12" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 66 66)"/><text x="66" y="63" text-anchor="middle" font-size="${jours !== null && Math.abs(jours) > 999 ? 22 : 29}" font-weight="800" fill="#E3ECF4">${jours === null ? '—' : jours >= 0 ? 'J-' + jours : 'J+' + (-jours)}</text><text x="66" y="84" text-anchor="middle" font-size="11" fill="#C5D7E7">${P.delaiEcoule} % du délai</text></svg>
          <div style="display:flex;flex-direction:column;gap:5px"><span class="lbl2">Fin contractuelle</span><span class="big">${longDate(p.dateFinContractuelle)}</span>${(p.avenantsDelai || []).length ? `<span class="sub">Initiale ${U.fr(p.dateFinInitiale)}</span>` : ''}<span class="sub">Fin prévisionnelle : ${U.fr(P.finPrevue)}</span><span class="pill ${ecart > 0 ? 'late' : ''}">${ecart > 0 ? `Hors délai : +${ecart} j ouvrés` : 'Dans les délais'}</span></div>
        </a>
        <div class="kpi"><span class="kl">Avancement global</span><span class="kv">${P.avancementGlobal} %</span><div class="lotrow" style="display:block"><div class="tr"><i style="width:${P.avancementGlobal}%;background:linear-gradient(90deg,#81A9CB,#8D9197)"></i></div></div><span class="ks">Attendu à ce jour : ${P.avancementAttendu} %</span></div>
        <div class="kpi"><span class="kl">Tâches en retard</span><span class="kv">${retard}</span><span class="ks">${crit} tâche(s) sur le chemin critique</span>${nonRens ? `<span class="badge b-amber" style="align-self:flex-start">${nonRens} avancement(s) à saisir</span>` : retard ? '<span class="badge b-red" style="align-self:flex-start">À traiter</span>' : '<span class="badge b-green" style="align-self:flex-start">Planning à jour</span>'}</div>
        <div class="kpi"><span class="kl">Magasin</span><span class="kv">${arts.length}</span><span class="ks">articles suivis · ${sousSeuil} alerte(s)</span><span class="badge ${sousSeuil ? 'b-amber' : 'b-green'}" style="align-self:flex-start">${sousSeuil ? 'Réapprovisionner' : 'Stock conforme'}</span></div>
      </div>
      <div class="dash-main">
        <div class="card"><div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px"><h3 style="margin:0">Corps d'état en cours</h3><a href="#planning" style="font-size:13px;font-weight:600">Voir le planning</a></div>
          <div class="lotrows">${lots.length ? lots.slice(0, 7).map(l => `<a class="lotrow" href="#planning"><div><b>${U.esc(l.e.nom)}</b><small>${U.esc(l.e.corpsEtat || '')}</small></div><div class="tr" title="${l.rens ? l.av + ' %' : '≈ ' + l.av + ' % (théorique)'}"><i class="${l.ret ? 'late' : l.cr ? 'crit' : ''} ${l.rens ? '' : 'na'}" style="width:${l.av}%"></i></div><em class="${l.cr || l.ret ? 'c' : ''}">${l.ret ? 'en retard' : l.cr ? 'critique' : 'fin ' + U.frShort(l.fin)}</em></a>`).join('') : '<p class="muted">Aucun corps d\'état en cours.</p>'}</div>
          <p class="muted small" style="margin:14px 0 0">Barres hachurées : avancement théorique, à confirmer par une saisie.</p></div>
        <div class="card" style="display:flex;flex-direction:column"><h3>Entreprises présentes par mois</h3><div id="presChart" style="margin-top:14px"></div><p class="muted small" id="presNote" style="margin:10px 0 0"></p></div>
        <div class="todo"><h3>À faire</h3>
          ${todo.slice(0, 4).map(t => `<a class="tdi n${t.niv}" href="#${t.mod}"><i></i><div><b>${U.esc(t.t)}</b><small>${U.esc(t.s || '')}</small></div></a>`).join('')}
          ${ev.slice(0, 3).map(e => `<a class="tdi ev" href="#${e.mod}"><i></i><div><b>${U.frShort(e.d)} · ${U.esc(e.t)}</b><small>${U.esc(e.s || '')}</small></div></a>`).join('')}
          ${!todo.length && !ev.length ? '<p class="muted">Rien d\'urgent : tout est à jour.</p>' : ''}
          <button class="btn" id="dBon">${ic('plus', 16)} Bon de sortie</button></div>
      </div>`;
    UI.$('#dBon', v).onclick = () => STOCK.bon('Sortie');
    // présence par mois
    const months = []; let m0 = U.parse(p.dateDebut || U.today()); m0 = new Date(m0.getFullYear(), m0.getMonth(), 1);
    const end = U.parse(P.finPrevue > (p.dateFinContractuelle || '') ? P.finPrevue : p.dateFinContractuelle || P.finPrevue);
    while (m0 <= end && months.length < 24) { months.push(U.iso(m0)); m0 = new Date(m0.getFullYear(), m0.getMonth() + 1, 1); }
    const counts = months.map(ms => { const me = U.iso(new Date(U.parse(ms).getFullYear(), U.parse(ms).getMonth() + 1, 0)); const set = new Set(); T.forEach(t => { const r = P.R.get(t.id); if (r.poids && r.prev.debut <= me && r.prev.fin >= ms) set.add(t.entrepriseId); }); return set.size; });
    const mx = Math.max(1, ...counts), W = 420, H = 190, bw = W / Math.max(1, months.length), cm = U.today().slice(0, 7);
    UI.$('#presChart', v).innerHTML = `<svg viewBox="0 -16 ${W} ${H + 46}" class="chart">${counts.map((c, i) => { const hh = Math.max(2, (c / mx) * H); const k = months[i].slice(0, 7); const cls = k === cm ? 'cur' : k < cm ? 'past' : 'fut'; return `<g><rect x="${i * bw + 3}" y="${H - hh}" width="${bw - 6}" height="${hh}" rx="6" class="${cls}"><title>${U.moisAn(months[i])} : ${c} entreprise(s)</title></rect>${c ? `<text x="${i * bw + bw / 2}" y="${H - hh - 6}" class="v">${c}</text>` : ''}<text x="${i * bw + bw / 2}" y="${H + 15}" class="l">${U.MOIS[U.parse(months[i]).getMonth()].charAt(0).toUpperCase()}</text>${months[i].slice(5, 7) === '01' || i === 0 ? `<text x="${i * bw + bw / 2}" y="${H + 30}" class="l y">${months[i].slice(0, 4)}</text>` : ''}</g>`; }).join('')}</svg>`;
    const pic = Math.max(...counts); const pm = months.filter((_, i) => counts[i] === pic).map(x => U.moisAn(x));
    UI.$('#presNote', v).textContent = pic ? `Pic de ${pic} entreprises (${pm.join(', ')}) : renforcer le contrôle des accès.` : '';
  },
});
