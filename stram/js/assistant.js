/* STRAM Suivi — Assistant intégré : moteur local, IA OpenAI facultative (clé par poste) */
'use strict';
const ASSIST = (() => {
  const E = U.esc;
  let open = false, busy = false;
  const msgs = [];
  const link = (mod, txt) => `<a href="#${mod}">${E(txt)}</a>`;
  const P = () => APP.plan();
  const tl = t => `${t.nom} (${t.intervenant || APP.entNom(t.entrepriseId)})`;

  function contexte() {
    const p = P(), T = S.list('taches'), R = id => p.R.get(id);
    return {
      date: U.today(), projet: S.data.projet.intitule || S.data.projet.nom, finContractuelle: S.data.projet.dateFinContractuelle, finPrevisionnelle: p.finPrevue, ecartJoursOuvres: p.ecartFin,
      avancementReel: p.avancementGlobal, avancementAttendu: p.avancementAttendu,
      retards: T.filter(t => R(t.id).enRetard).map(t => ({ tache: tl(t), finPrevue: R(t.id).prev.fin, avancement: R(t.id).av, marge: R(t.id).marge })).slice(0, 25),
      critiques: T.filter(t => R(t.id).critique && R(t.id).etat !== 'Terminée').map(t => tl(t)).slice(0, 20),
      validationsMO: T.filter(t => R(t.id).type === 'Validation MO' && R(t.id).etat !== 'Terminée').map(t => ({ tache: t.nom, echeance: R(t.id).prev.fin })),
      approvisionnements: T.filter(t => R(t.id).type === 'Approvisionnement' && R(t.id).etat !== 'Terminée').map(t => ({ tache: t.nom, arrivee: R(t.id).prev.fin })),
      prochaines2Semaines: T.filter(t => { const r = R(t.id); return r.etat !== 'Terminée' && r.prev.debut > U.today() && r.prev.debut <= U.addDays(U.today(), 14); }).map(t => ({ tache: tl(t), debut: R(t.id).prev.debut })),
      stockAlertes: STOCK.etat().filter(r => ['Écart', 'Sous le seuil', 'Épuisé'].includes(r.statut)).map(r => ({ article: r.a.designation, solde: r.solde, unite: r.a.unite })),
      finances: FIN.totaux(), commandesAPasser: S.list('commandes').filter(c => c.statut === 'À passer').map(c => ({ num: c.num, avant: window.CMD ? CMD.commanderAvant(c) : '' })),
      actionsOuvertes: S.list('actions').filter(a => a.statut !== 'Soldée').map(a => ({ action: a.description, responsable: a.responsable, echeance: a.echeance })).slice(0, 20),
      reservesOuvertes: S.list('reserves').filter(r => r.statut !== 'Levée').length,
    };
  }

  /* ---------- moteur local ---------- */
  function local(q) {
    const n = U.norm(q), p = P(), T = S.list('taches'), R = id => p.R.get(id);
    if (/^(pv|compte rendu|redige|rédige)/.test(n) || n.includes('redige le pv') || n.includes('rediger le pv')) return pv(q);
    // entreprise citée
    const rx = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ent = S.list('entreprises').filter(e => U.norm(e.nom).length >= 4 && e.role !== 'Pilotage' && !/^tous$/i.test(e.nom)).find(e => new RegExp('(^|[^a-z0-9])' + rx(U.norm(e.nom)) + '([^a-z0-9]|$)').test(n));
    if (ent && !/stock|magasin/.test(n)) {
      const ts = T.filter(t => t.entrepriseId === ent.id).map(t => ({ t, r: R(t.id) }));
      const enc = ts.filter(x => x.r.etat !== 'Terminée' && x.r.prev.debut <= U.addDays(U.today(), 14));
      const m = S.list('marches').find(x => x.entrepriseId === ent.id);
      return `<b>${E(ent.nom)}</b> — ${E(ent.corpsEtat || '')}\n${ts.length} tâche(s) au planning, ${ts.filter(x => x.r.etat === 'Terminée').length} terminée(s), ${ts.filter(x => x.r.enRetard).length} en retard.\n` +
        (enc.length ? 'En cours ou imminentes :\n' + enc.slice(0, 6).map(x => `• ${E(x.t.nom)} — fin ${U.fr(x.r.prev.fin)}${x.r.av !== null ? ' · ' + x.r.av + ' %' : ''}${x.r.critique ? ' · critique' : ''}`).join('\n') : 'Aucune tâche en cours.') +
        (m ? `\nMarché : ${U.money(FIN.montantMarche(m))} HT · reste à payer ${U.money(FIN.totaux(ent.id).resteAPayer)}` : '') + `\n${link('planning', 'Voir le planning')}`;
    }
    if (/(retard|critique|delai|fin du chantier|livraison du batiment|reception|en avance|glisse)/.test(n)) {
      const late = T.filter(t => R(t.id).enRetard), cr = T.filter(t => R(t.id).critique && R(t.id).etat !== 'Terminée');
      return `Fin prévisionnelle : <b>${U.fr(p.finPrevue)}</b> pour une fin contractuelle au ${U.fr(S.data.projet.dateFinContractuelle)} — ${p.ecartFin > 0 ? `<b class="neg">retard prévisible de ${p.ecartFin} j ouvrés</b>` : 'dans les délais'}.\nAvancement réel ${p.avancementGlobal} % pour ${p.avancementAttendu} % attendus.\n` +
        (late.length ? `\n${late.length} tâche(s) en retard :\n` + late.slice(0, 6).map(t => `• ${E(tl(t))} — fin ${U.fr(R(t.id).prev.fin)}`).join('\n') : '\nAucune tâche en retard.') +
        (cr.length ? `\n\nChemin critique (${cr.length}) :\n` + cr.slice(0, 5).map(t => `• ${E(t.nom)}`).join('\n') : '') + `\n${link('planning', 'Ouvrir le planning')}`;
    }
    if (/(validation|decision|maitre d.ouvrage|\bmo\b|arbitrage)/.test(n)) {
      const mo = T.filter(t => R(t.id).type === 'Validation MO' && R(t.id).etat !== 'Terminée').sort((a, b) => R(a.id).prev.fin.localeCompare(R(b.id).prev.fin));
      return mo.length ? `${mo.length} décision(s) du maître d'ouvrage en attente :\n` + mo.slice(0, 10).map(t => `• ${E(t.nom)} — échéance ${U.fr(R(t.id).prev.fin)}${R(t.id).prev.fin < U.today() ? ' (dépassée)' : ''}`).join('\n') + `\n${link('rapports', 'Les inclure dans le rapport hebdomadaire')}` : 'Aucune décision du maître d\'ouvrage en attente.';
    }
    if (/(appro|livraison|conteneur|transport|port|fabrication|production)/.test(n)) {
      const ap = T.filter(t => R(t.id).type === 'Approvisionnement' && R(t.id).etat !== 'Terminée').sort((a, b) => R(a.id).prev.fin.localeCompare(R(b.id).prev.fin));
      return ap.length ? `Approvisionnements en cours :\n` + ap.map(t => `• ${E(t.nom)} — arrivée prévue ${U.fr(R(t.id).prev.fin)}`).join('\n') : 'Aucun approvisionnement en cours au planning.';
    }
    if (/(sortie|sorti|consomm)/.test(n)) {
      const d = /mois/.test(n) ? U.addDays(U.today(), -30) : U.addDays(U.today(), -7);
      const mv = S.list('mouvements').filter(m => m.type === 'Sortie' && m.date >= d).sort(U.by('date', -1));
      return mv.length ? `${mv.length} sortie(s) depuis le ${U.fr(d)} :\n` + mv.slice(0, 12).map(m => { const a = S.get('articles', m.articleId) || {}; return `• ${U.fr(m.date)} · ${U.qty(m.quantite)} ${E(a.unite || '')} ${E(a.designation || '')} → ${E(m.demandeur || '')}`; }).join('\n') + `\n${link('stock', 'Voir le magasin')}` : `Aucune sortie de matériel depuis le ${U.fr(d)}.`;
    }
    if (/(stock|magasin|rupture|seuil|article|reste)/.test(n)) {
      const al = STOCK.etat().filter(r => ['Écart', 'Sous le seuil', 'Épuisé'].includes(r.statut));
      const art = S.list('articles').find(a => n.includes(U.norm(a.designation).split(' ')[0]) && U.norm(a.designation).split(' ')[0].length > 3);
      if (art) return `<b>${E(art.designation)}</b> : ${U.qty(APP.stockOf(art.id))} ${E(art.unite)} en stock${art.seuil !== '' && art.seuil !== undefined ? ` (seuil ${U.qty(art.seuil)})` : ''}.`;
      return (al.length ? `${al.length} alerte(s) de stock :\n` + al.map(r => `• ${E(r.a.designation)} — ${U.qty(r.solde)} ${E(r.a.unite)} (${r.statut})`).join('\n') : `Aucune alerte : ${S.list('articles').length} articles suivis.`) + `\n${link('stock', 'Ouvrir le magasin')}`;
    }
    if (/(commande|fournisseur|acheter|passer)/.test(n)) {
      const c = S.list('commandes').filter(x => !['Livrée', 'Annulée'].includes(x.statut));
      return c.length ? `${c.length} commande(s) en cours :\n` + c.map(x => `• ${E(x.num)} — ${x.statut}${x.statut === 'À passer' && window.CMD ? ' · à commander avant le ' + U.fr(CMD.commanderAvant(x)) : x.livraisonPrevue ? ' · livraison ' + U.fr(x.livraisonPrevue) : ''}`).join('\n') : 'Aucune commande en cours.';
    }
    if (/(pay|factur|situation|tresorerie|argent|budget|decompte|marche)/.test(n)) {
      const F = FIN.totaux(), tr = FIN.tresorerie().slice(0, 3);
      return `Marchés : ${U.money(F.marches)} HT · exécuté ${U.money(F.cumul)} · payé ${U.money(F.paye)} · <b>reste à payer ${U.money(F.resteAPayer)}</b>.\nBesoins de trésorerie : ` + tr.map(r => `${U.moisAn(r.mois)} ${U.money(r.total)}`).join(' · ') + `\n${link('finances', 'Ouvrir les finances')}`;
    }
    if (/(semaine|prochain|demain|planning|programme|a venir|à venir)/.test(n)) {
      const lim = U.addDays(U.today(), 14), ev = [];
      T.forEach(t => { const r = R(t.id); if (r.etat === 'Terminée') return; if (r.prev.debut > U.today() && r.prev.debut <= lim) ev.push([r.prev.debut, 'Démarrage', t]); if (r.prev.fin >= U.today() && r.prev.fin <= lim) ev.push([r.prev.fin, 'Fin', t]); });
      ev.sort((a, b) => a[0].localeCompare(b[0]));
      return ev.length ? 'Les deux prochaines semaines :\n' + ev.slice(0, 14).map(([d, k, t]) => `• ${U.fr(d)} · ${k} — ${E(tl(t))}`).join('\n') : 'Rien de prévu dans les deux prochaines semaines.';
    }
    if (/(reserve|qualite|plan|visa|essai)/.test(n)) {
      return `Réserves ouvertes : ${S.list('reserves').filter(r => r.statut !== 'Levée').length} · plans à viser : ${S.list('plans').filter(p => p.statut === 'À viser').length} · essais non conformes : ${S.list('essais').filter(e => e.resultat === 'Non conforme').length}.\n${link('qualite', 'Ouvrir la qualité')}`;
    }
    return `Je peux répondre sur : les retards et la date de fin, les décisions du maître d'ouvrage, les approvisionnements, le stock et les sorties, les commandes, les paiements, le programme des deux prochaines semaines, une entreprise (ex. « NIANG »).\nPour rédiger un PV : commencez par « PV : » puis collez vos notes (une ligne par point ; « Action : … / responsable / date » pour les actions).${S.host && S.host.aiStatus ? '\nAstuce : ajoutez une clé OpenAI dans Paramètres pour des questions libres.' : ''}`;
  }

  function pv(q) {
    const txt = q.replace(/^\s*(pv|compte rendu|r[ée]dige[rz]?( le pv)?)\s*:?\s*/i, '');
    const lines = txt.split(/\n|;/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) return 'Collez vos notes après « PV : » (une ligne par point).';
    const points = [], actions = [];
    lines.forEach(l => { const m = l.match(/^action\s*:?\s*(.+)$/i); if (m) { const [d, r, e] = m[1].split('/').map(s => s.trim()); const dm = (e || '').match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/); actions.push({ description: d, responsable: r || '', echeance: dm ? `${dm[3] || new Date().getFullYear()}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}` : U.addDays(U.today(), 7), statut: 'À faire' }); } else points.push(l.replace(/^[-•*]\s*/, '')); });
    if (!S.can('reunions')) return 'Votre profil ne permet pas de créer un PV.';
    const num = APP.nextNum('reunions', 'PV-');
    const r = S.save('reunions', { date: U.today(), type: 'Réunion de chantier hebdomadaire', num, lieu: 'Bureau de chantier', objet: 'Réunion de chantier', compteRendu: points.map((p, i) => `${i + 1}. ${p}`).join('\n'), prochaine: U.addDays(U.today(), 7) }, `PV ${num} rédigé par l'assistant`);
    actions.forEach(a => S.save('actions', Object.assign(a, { reunionId: r.id, origine: `${num} du ${U.fr(U.today())}` })));
    return `PV <b>${num}</b> créé : ${points.length} point(s), ${actions.length} action(s).\n${link('chantier', 'Ouvrir Journal & réunions pour le relire et l\'imprimer')}`;
  }

  async function ask(q) {
    if (S.host && S.host.askAI && S.host.aiStatus) {
      try {
        const st = await S.host.aiStatus();
        if (st && st.ready && !/^\s*(pv|compte rendu)/i.test(q)) {
          const r = await S.host.askAI({ question: q, contexte: contexte(), historique: msgs.slice(-6).map(m => ({ role: m.me ? 'user' : 'assistant', content: m.txt.replace(/<[^>]+>/g, '') })) });
          if (r && r.text) return E(r.text);
        }
      } catch (e) { console.warn(e); }
    }
    return local(q);
  }

  function ui() {
    const b = document.createElement('button'); b.id = 'asstBtn'; b.title = 'Assistant STRAM'; b.setAttribute('aria-label', 'Ouvrir l\'assistant'); b.innerHTML = APP.icon('chat', 26);
    const p = document.createElement('section'); p.id = 'asst'; p.setAttribute('aria-label', 'Assistant');
    p.innerHTML = `<header>${APP.icon('chat', 20)}<div><b>Assistant STRAM</b><small id="asstMode">Réponses à partir de vos données</small></div><button class="icon-btn" id="asstX" style="margin-left:auto;color:#fff" aria-label="Fermer">✕</button></header>
      <div class="msgs" id="asstMsgs"></div><div class="sugg">${['Quels lots sont en retard ?', 'Décisions MO en attente', 'Programme des 2 semaines', 'Alertes de stock', 'Reste à payer'].map(s => `<button type="button">${s}</button>`).join('')}</div>
      <form id="asstF"><input id="asstQ" placeholder="Posez une question…" autocomplete="off"><button class="btn primary" aria-label="Envoyer">${APP.icon('send', 16)}</button></form>`;
    document.body.append(b, p);
    const add = (txt, me) => { msgs.push({ txt, me }); const d = document.createElement('div'); d.className = 'msg ' + (me ? 'me' : 'bot'); d.innerHTML = me ? E(txt) : txt; UI.$('#asstMsgs').appendChild(d); d.scrollIntoView({ block: 'end' }); UI.$$('a', d).forEach(a => a.onclick = () => { p.classList.remove('open'); }); };
    const send = async q => { if (!q.trim() || busy) return; add(q, true); busy = true; const w = document.createElement('div'); w.className = 'msg bot'; w.textContent = '…'; UI.$('#asstMsgs').appendChild(w); const r = await ask(q); w.remove(); busy = false; add(r, false); };
    b.onclick = () => { open = !open; p.classList.toggle('open', open); if (open && !msgs.length) add(`Bonjour${S.user ? ' ' + E(S.user.nom) : S.data.projet.utilisateur ? ' ' + E(S.data.projet.utilisateur) : ''}. Posez-moi une question sur le chantier, ou dictez un PV en commençant par « PV : ».`, false); if (open) UI.$('#asstQ').focus();
      if (S.host && S.host.aiStatus) S.host.aiStatus().then(s => { UI.$('#asstMode').textContent = s && s.ready ? 'IA OpenAI activée sur ce poste' : 'Réponses à partir de vos données'; }); };
    UI.$('#asstX').onclick = () => { open = false; p.classList.remove('open'); };
    UI.$('#asstF').onsubmit = e => { e.preventDefault(); const q = UI.$('#asstQ').value; UI.$('#asstQ').value = ''; send(q); };
    UI.$$('.sugg button', p).forEach(x => x.onclick = () => send(x.textContent));
  }
  return { ui, local, contexte };
})();
