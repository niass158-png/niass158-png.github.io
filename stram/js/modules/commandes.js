/* STRAM Suivi — Commandes à passer, suivi des livraisons et fournisseurs */
'use strict';
(() => {
  const st = { tab: 'cmd', statut: '', q: '' };
  const STATUTS = ['À passer', 'Validée', 'Envoyée', 'Partiellement livrée', 'Livrée', 'Annulée'];
  const SC = { 'À passer': 'b-amber', 'Validée': 'b-violet', 'Envoyée': 'b-blue', 'Partiellement livrée': 'b-cyan', 'Livrée': 'b-green', 'Annulée': 'b-grey' };
  const tot = c => (c.lignes || []).reduce((s, l) => s + U.num(l.quantite) * U.num(l.prixUnitaire), 0);
  const fnom = id => S.get('fournisseurs', id)?.nom || '—';
  /** Date de commande au plus tard : début prévu de la tâche (ou date de besoin) − délai fournisseur − 7 jours de sécurité */
  const besoin = c => { if (c.tacheId) { const r = APP.plan().R.get(c.tacheId); if (r) return r.prev.debut; } return c.dateBesoin || ''; };
  const commanderAvant = c => { const b = besoin(c); if (!b) return ''; const f = S.get('fournisseurs', c.fournisseurId); return U.addDays(b, -(U.num(f?.delai) || 0) - 7); };
  const lineLabel = l => l.articleId ? (S.get('articles', l.articleId)?.designation || '?') : l.designation;

  /* Bon de commande simplifié : fournisseur, besoin, lignes saisies par code article */
  function editCommande(c = {}) {
    const lignes = (c.lignes || []).map(l => ({ ...l, code: l.articleId ? (S.get('articles', l.articleId)?.code || '') : (l.designation || '') }));
    if (!lignes.length) lignes.push({ code: '', quantite: '', prixUnitaire: '' });
    const fous = S.list('fournisseurs').sort(U.by('nom'));
    const taches = S.list('taches').filter(t => ['Travaux', 'Approvisionnement'].includes(PLAN.typeOf(t))).map(t => ({ t, r: APP.plan().R.get(t.id) })).filter(x => x.r && (x.r.etat !== 'Terminée' || x.t.id === c.tacheId)).sort((a, b) => a.r.prev.debut.localeCompare(b.r.prev.debut));
    const sel = (list, v) => list.map(o => `<option value="${U.esc(o.v)}" ${o.v === v ? 'selected' : ''}>${U.esc(o.l)}</option>`).join('');
    const num = c.num || NOM.prochainBon('BC', 'commandes', 'num');
    const box = document.createElement('div');
    box.className = 'bonf';
    box.innerHTML = `${NOM.datalist()}
      <div class="grid-form">
        <div class="field"><label>N° du bon de commande</label><input id="cNum" value="${U.esc(num)}" readonly class="ro"></div>
        <div class="field"><label>Statut</label><select id="cStat">${STATUTS.map(x => `<option ${x === (c.statut || 'À passer') ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        <div class="field"><label>Fournisseur *</label><select id="cFou"><option value="">— choisir —</option>${sel(fous.map(f => ({ v: f.id, l: f.nom + (f.delai ? ` (délai ${f.delai} j)` : '') })), c.fournisseurId)}</select></div>
        <div class="field"><label>Besoin pour la tâche du planning</label><select id="cTache"><option value="">— aucune / date libre —</option>${sel(taches.map(({ t, r }) => ({ v: t.id, l: `${U.fr(r.prev.debut)} · ${t.nom}` })), c.tacheId)}</select></div>
      </div>
      <label class="lbl" style="margin-top:14px">Articles <span class="muted">— code article (ex. CAR-002) ou désignation libre pour un article hors stock</span></label>
      <table class="tbl mini bonl"><thead><tr><th style="width:150px">Code / désignation</th><th>Article</th><th class="r" style="width:90px">Qté</th><th class="r" style="width:120px">P.U. HT (FCFA)</th><th class="r" style="width:120px">Montant</th><th style="width:40px"></th></tr></thead><tbody id="cL"></tbody>
      <tfoot><tr><td colspan="4" class="r">Total HT</td><td class="r"><b id="cTot"></b></td><td></td></tr></tfoot></table>
      <button type="button" class="btn sm ghost" id="cLAdd">+ Ajouter un article</button>
      <details style="margin-top:12px" ${c.dateBesoin || c.livraisonPrevue || c.entrepriseId || c.notes ? 'open' : ''}><summary>Plus d'options : dates, lot, observations</summary><div class="grid-form" style="margin-top:8px">
        <div class="field"><label>Date de la commande</label><input type="date" id="cDate" value="${c.date || U.today()}"></div>
        <div class="field"><label>Besoin sur chantier le (sans tâche)</label><input type="date" id="cBes" value="${c.dateBesoin || ''}"></div>
        <div class="field"><label>Livraison prévue le</label><input type="date" id="cLiv" value="${c.livraisonPrevue || ''}"></div>
        <div class="field"><label>Pour le lot / l'entreprise</label><select id="cEnt"><option value="">—</option>${sel(S.list('entreprises').sort(U.by('nom')).map(e => ({ v: e.id, l: e.nom })), c.entrepriseId)}</select></div>
        <div class="field"><label>Demandé par</label><input id="cDem" value="${U.esc(c.demandeur || (S.user ? S.user.nom : ''))}"></div>
        <div class="field full"><label>Observations</label><input id="cNot" value="${U.esc(c.notes || '')}"></div>
      </div></details>`;
    const tb = UI.$('#cL', box);
    const res = l => { const a = NOM.trouver(l.code); return a ? { a, des: a.designation, u: a.unite } : { a: null, des: String(l.code || '').trim(), u: l.unite || '' }; };
    const draw = () => {
      tb.innerHTML = lignes.map((l, i) => { const r = res(l); return `<tr><td><input data-i="${i}" data-f="code" list="dlArt" value="${U.esc(r.a ? r.a.code : l.code || '')}" placeholder="CAR-002" autocomplete="off"></td>
        <td>${!l.code ? '<span class="muted">—</span>' : r.a ? `<b>${U.esc(r.a.designation)}</b> <span class="muted">· ${U.esc(r.a.unite)}</span>` : `<span class="muted">hors stock :</span> ${U.esc(r.des)} <input data-i="${i}" data-f="unite" value="${U.esc(l.unite || '')}" placeholder="unité" style="width:70px">`}</td>
        <td class="r"><input type="number" step="any" min="0" data-i="${i}" data-f="quantite" value="${l.quantite}" style="width:80px"></td>
        <td class="r"><input type="number" step="any" min="0" data-i="${i}" data-f="prixUnitaire" value="${l.prixUnitaire}" style="width:110px"></td>
        <td class="r">${U.money(U.num(l.quantite) * U.num(l.prixUnitaire))}</td><td><button type="button" class="icon-btn" data-x="${i}" aria-label="Retirer la ligne">✕</button></td></tr>`; }).join('');
      UI.$('#cTot', box).textContent = U.money(lignes.reduce((s, l) => s + U.num(l.quantite) * U.num(l.prixUnitaire), 0));
      UI.$$('input[data-f]', tb).forEach(el => el.onchange = () => { const l = lignes[+el.dataset.i]; l[el.dataset.f] = el.value;
        if (el.dataset.f === 'code') { const a = NOM.trouver(el.value); if (a && !U.num(l.prixUnitaire) && a.prixUnitaire) l.prixUnitaire = U.num(a.prixUnitaire); }
        draw(); });
      UI.$$('[data-x]', tb).forEach(b => b.onclick = () => { lignes.splice(+b.dataset.x, 1); if (!lignes.length) lignes.push({ code: '', quantite: '', prixUnitaire: '' }); draw(); });
    };
    draw();
    UI.$('#cLAdd', box).onclick = () => { lignes.push({ code: '', quantite: '', prixUnitaire: '' }); draw(); const x = UI.$$('input[data-f="code"]', tb).pop(); x && x.focus(); };
    const val = id => UI.$('#' + id, box).value.trim();
    const actions = [{ label: 'Annuler' }];
    if (c.id) actions.unshift({ label: 'Supprimer', cls: 'danger ghost', left: true, onClick: () => { UI.confirm(`Supprimer la commande ${c.num} ?`, () => S.remove('commandes', c.id, `Commande ${c.num} supprimée`), 'Supprimer'); } });
    actions.push({ label: c.id ? 'Enregistrer' : 'Créer le bon de commande', cls: 'primary', onClick: () => {
      const L = lignes.filter(l => String(l.code || '').trim()).map(l => { const r = res(l); return { articleId: r.a ? r.a.id : '', designation: r.des, unite: r.u, quantite: U.num(l.quantite), prixUnitaire: l.prixUnitaire === '' ? '' : U.num(l.prixUnitaire), recu: U.num(l.recu) || 0 }; });
      if (!val('cFou')) { UI.toast('Choisissez le fournisseur', 'err'); return false; }
      if (!L.length) { UI.toast('Ajoutez au moins un article', 'err'); return false; }
      if (L.some(l => l.quantite <= 0)) { UI.toast('Chaque ligne doit avoir une quantité positive', 'err'); return false; }
      const v = { num, statut: val('cStat'), fournisseurId: val('cFou'), tacheId: val('cTache'), date: val('cDate') || U.today(), dateBesoin: val('cBes'), livraisonPrevue: val('cLiv'), entrepriseId: val('cEnt'), demandeur: val('cDem'), notes: val('cNot'), lignes: L };
      try { S.save('commandes', Object.assign({ id: c.id }, v), `Commande ${num} ${c.id ? 'modifiée' : 'créée'} (${v.statut})`); UI.toast(`Bon de commande ${num} enregistré`); }
      catch (e) { UI.toast(e.message, 'err'); return false; }
      if (!c.id) setTimeout(() => UI.confirm(`Imprimer le bon de commande ${num} ?`, () => printCmd(S.list('commandes').find(x => x.num === num)), 'Imprimer'), 200);
    } });
    UI.modal({ title: c.id ? `Bon de commande ${c.num}` : 'Nouveau bon de commande', wide: true, body: box, actions });
  }

  function reception(c) {
    const body = document.createElement('div');
    body.innerHTML = `<p class="muted">Indiquez les quantités livrées. Les articles du stock sont automatiquement entrés au magasin.</p>
      <div class="grid-form"><div class="field"><label>Date de livraison</label><input type="date" id="rD" value="${U.today()}"></div><div class="field"><label>N° bon de livraison</label><input id="rBL"></div></div>
      <table class="tbl mini"><thead><tr><th>Désignation</th><th class="r">Commandé</th><th class="r">Déjà reçu</th><th class="r">Reçu ce jour</th></tr></thead><tbody>
      ${c.lignes.map((l, i) => `<tr><td>${U.esc(lineLabel(l))}${l.articleId ? '' : ' <small class="muted">(hors stock)</small>'}</td><td class="r">${U.qty(l.quantite)}</td><td class="r">${U.qty(l.recu || 0)}</td><td class="r"><input type="number" step="any" data-i="${i}" value="${Math.max(0, U.num(l.quantite) - U.num(l.recu))}" style="width:90px"></td></tr>`).join('')}</tbody></table>`;
    UI.modal({ title: `Réception — commande ${c.num}`, wide: true, body, actions: [{ label: 'Annuler' }, { label: 'Valider la réception', cls: 'primary', onClick: () => {
      const d = UI.$('#rD', body).value || U.today(), bl = UI.$('#rBL', body).value;
      const L = c.lignes.map(l => ({ ...l }));
      let n = 0; const numBE = NOM.prochainBon('BE', 'mouvements', 'numBon', d);
      UI.$$('input[data-i]', body).forEach(i => { const q = U.num(i.value); if (q <= 0) return; const l = L[+i.dataset.i]; l.recu = U.num(l.recu) + q; n++;
        if (l.articleId) S.save('mouvements', { type: 'Entrée', date: d, numBon: numBE, articleId: l.articleId, quantite: q, fournisseur: fnom(c.fournisseurId), commandeNum: c.num, motif: bl ? 'BL ' + bl : 'Réception commande ' + c.num }); });
      const complet = L.every(l => U.num(l.recu) >= U.num(l.quantite));
      S.save('commandes', { id: c.id, lignes: L, statut: complet ? 'Livrée' : 'Partiellement livrée', dateLivraison: d }, `Commande ${c.num} : réception du ${U.fr(d)}${complet ? ' (soldée)' : ' (partielle)'}`);
      UI.toast(n ? 'Réception enregistrée, stock mis à jour' : 'Aucune quantité saisie');
    } }] });
  }

  function printCmd(c) {
    const f = S.get('fournisseurs', c.fournisseurId) || {};
    const t = tot(c), tva = U.num(S.data.projet.tva);
    UI.printDoc(`Bon de commande n° ${c.num}`, `<table><tr><th>Date</th><td>${U.fr(c.date)}</td><th>Fournisseur</th><td>${U.esc(f.nom || '')}<br><small>${U.esc(f.tel || '')} ${U.esc(f.email || '')}</small></td></tr>
      <tr><th>Livraison souhaitée</th><td>${U.fr(c.livraisonPrevue || c.dateBesoin)}</td><th>Lieu de livraison</th><td>Chantier ${U.esc(S.data.projet.nom)} — ${U.esc(S.data.projet.localisation || '')}</td></tr></table>
      <table><tr><th>Code</th><th>Désignation</th><th>Unité</th><th class="r">Quantité</th><th class="r">Prix unitaire</th><th class="r">Montant HT</th></tr>
      ${c.lignes.map(l => `<tr><td><b>${U.esc(l.articleId ? S.get('articles', l.articleId)?.code || '' : '')}</b></td><td>${U.esc(lineLabel(l))}</td><td>${U.esc(l.articleId ? S.get('articles', l.articleId)?.unite : l.unite || '')}</td><td class="r">${U.qty(l.quantite)}</td><td class="r">${l.prixUnitaire ? U.money(l.prixUnitaire) : ''}</td><td class="r">${l.prixUnitaire ? U.money(U.num(l.quantite) * U.num(l.prixUnitaire)) : ''}</td></tr>`).join('')}
      <tr><td colspan="5" class="r"><b>Total HT</b></td><td class="r"><b>${U.money(t)}</b></td></tr><tr><td colspan="5" class="r">TVA ${tva} %</td><td class="r">${U.money(t * tva / 100)}</td></tr><tr><td colspan="5" class="r"><b>Total TTC</b></td><td class="r"><b>${U.money(t * (1 + tva / 100))}</b></td></tr></table>
      ${c.notes ? `<p>${U.esc(c.notes)}</p>` : ''}<div class="sig"><div>Établi par</div><div>Visa du maître d'ouvrage</div><div>Accusé de réception fournisseur</div></div>`);
  }

  function suggestions() {
    const out = [];
    STOCK.etat().forEach(r => {
      if (r.a.seuil === '' || r.a.seuil === undefined || r.solde > U.num(r.a.seuil)) return;
      const enCours = S.list('commandes').some(c => !['Livrée', 'Annulée'].includes(c.statut) && (c.lignes || []).some(l => l.articleId === r.a.id && U.num(l.recu) < U.num(l.quantite)));
      if (!enCours) out.push({ a: r.a, solde: r.solde, q: Math.max(1, Math.ceil(U.num(r.a.seuil) * 2 - r.solde)) });
    });
    return out;
  }

  function render(v) {
    const sug = suggestions();
    v.innerHTML = `<div class="tabs">${[['cmd', 'Commandes'], ['fou', 'Fournisseurs']].map(([k, l]) => `<button data-t="${k}" class="${st.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${st.tab === 'cmd' ? `<div class="toolbar"><button class="btn primary" id="cAdd">+ Commande</button><span class="sep"></span><input type="search" id="cQ" placeholder="Rechercher…" value="${U.esc(st.q)}">
      <select id="cSt"><option value="">Tous statuts</option>${STATUTS.map(s => `<option ${st.statut === s ? 'selected' : ''}>${s}</option>`).join('')}</select><span class="sep"></span><button class="btn ghost" id="cXls">${APP.icon('download', 15)} Excel</button></div>
      ${sug.length ? `<div class="card soft"><h3>Commandes à prévoir (stock sous le seuil) <span class="muted">(${sug.length})</span></h3><div class="chips">${sug.map(s => `<span class="chip">${U.esc(s.a.designation)} — reste ${U.qty(s.solde)} ${U.esc(s.a.unite)} · proposer ${U.qty(s.q)}</span>`).join('')}</div><button class="btn sm" id="cSug">Créer une commande avec ces articles</button></div>` : ''}
      <div id="cBody"></div>` : `<div class="toolbar"><button class="btn primary" id="fAdd">+ Fournisseur</button></div><div id="fBody"></div>`}`;
    UI.$$('[data-t]', v).forEach(b => b.onclick = () => { st.tab = b.dataset.t; APP.refresh(); });
    if (st.tab === 'fou') {
      const editF = (f = {}) => UI.form({ title: f.id ? f.nom : 'Nouveau fournisseur', value: f, fields: [{ k: 'nom', label: 'Raison sociale', required: true }, { k: 'specialite', label: 'Spécialité / produits' }, { k: 'contact', label: 'Interlocuteur' }, { k: 'tel', label: 'Téléphone' }, { k: 'email', label: 'E-mail' }, { k: 'adresse', label: 'Adresse' }, { k: 'delai', label: 'Délai de livraison habituel (jours)', type: 'number' }, { k: 'notes', label: 'Notes', type: 'textarea', full: true }],
        onSave: x => { S.save('fournisseurs', Object.assign({ id: f.id }, x), `Fournisseur « ${x.nom} » enregistré`); }, onDelete: f.id ? () => S.remove('fournisseurs', f.id, `Fournisseur « ${f.nom} » supprimé`) : null });
      UI.$('#fAdd', v).onclick = () => editF();
      UI.table(UI.$('#fBody', v), { id: 'fou', sortKey: 'nom', rows: S.list('fournisseurs'), onRow: editF, empty: 'Aucun fournisseur. Ajoutez vos fournisseurs habituels (ciment, fer, électricité…).', cols: [
        { k: 'nom', label: 'Fournisseur', render: f => `<b>${U.esc(f.nom)}</b>` }, { k: 'specialite', label: 'Spécialité' }, { k: 'contact', label: 'Interlocuteur' }, { k: 'tel', label: 'Téléphone' }, { k: 'email', label: 'E-mail' },
        { k: 'n', label: 'Commandes', cls: 'r', sort: f => S.list('commandes').filter(c => c.fournisseurId === f.id).length, render: f => S.list('commandes').filter(c => c.fournisseurId === f.id).length },
        { k: 'm', label: 'Montant commandé', cls: 'r', sort: f => S.list('commandes').filter(c => c.fournisseurId === f.id && c.statut !== 'Annulée').reduce((s, c) => s + tot(c), 0), render: f => U.money(S.list('commandes').filter(c => c.fournisseurId === f.id && c.statut !== 'Annulée').reduce((s, c) => s + tot(c), 0)) }] });
      return;
    }
    UI.$('#cAdd', v).onclick = () => editCommande();
    if (UI.$('#cSug', v)) UI.$('#cSug', v).onclick = () => editCommande({ statut: 'À passer', lignes: sug.map(s => ({ articleId: s.a.id, designation: s.a.designation, unite: s.a.unite, quantite: s.q, prixUnitaire: U.num(s.a.prixUnitaire) || '' })) });
    const body = () => {
      const rows = S.list('commandes').filter(c => (!st.statut || c.statut === st.statut) && (!st.q || U.norm(`${c.num} ${fnom(c.fournisseurId)} ${(c.lignes || []).map(lineLabel).join(' ')}`).includes(U.norm(st.q))));
      const h = UI.$('#cBody', v);
      UI.table(h, { id: 'cmd', sortKey: 'date', sortDir: -1, rows, onRow: editCommande, empty: 'Aucune commande enregistrée.',
        rowCls: c => !['Livrée', 'Annulée'].includes(c.statut) && c.livraisonPrevue && c.livraisonPrevue < U.today() ? 'row-late' : '',
        cols: [
          { k: 'num', label: 'N°', render: c => `<b>${U.esc(c.num)}</b>` }, { k: 'date', label: 'Date', render: c => U.fr(c.date) },
          { k: 'four', label: 'Fournisseur', sort: c => fnom(c.fournisseurId), render: c => U.esc(fnom(c.fournisseurId)) },
          { k: 'obj', label: 'Objet', nosort: true, render: c => U.esc((c.lignes || []).map(l => `${lineLabel(l)} ×${U.qty(l.quantite)}`).join(', ')).slice(0, 90) },
          { k: 'ent', label: 'Lot', sort: c => APP.entNom(c.entrepriseId), render: c => c.entrepriseId ? U.esc(APP.entNom(c.entrepriseId)) : '' },
          { k: 'besoin', label: 'Besoin le', sort: besoin, render: c => U.fr(besoin(c)) },
          { k: 'avant', label: 'Commander avant', sort: commanderAvant, render: c => { const a = commanderAvant(c); if (!a || c.statut !== 'À passer') return a ? `<span class="muted">${U.fr(a)}</span>` : ''; const j = U.diffDays(U.today(), a); return `<span class="${j < 0 ? 'neg' : j <= 7 ? 'warnc' : ''}">${U.fr(a)}${j < 0 ? ' (dépassée)' : j <= 7 ? ' (J-' + j + ')' : ''}</span>`; } }, { k: 'livraisonPrevue', label: 'Livraison prévue', render: c => U.fr(c.livraisonPrevue) },
          { k: 'mt', label: 'Montant HT', cls: 'r', sort: tot, render: c => tot(c) ? U.money(tot(c)) : '', sum: rs => U.money(rs.filter(c => c.statut !== 'Annulée').reduce((s, c) => s + tot(c), 0)) },
          { k: 'statut', label: 'Statut', render: c => UI.badge(c.statut, SC[c.statut]) },
          { k: 'act', label: '', nosort: true, render: c => `<span class="nowrap">${['Envoyée', 'Validée', 'Partiellement livrée'].includes(c.statut) ? `<button class="btn xs" data-rec="${c.id}">Réceptionner</button> ` : ''}<button class="btn xs ghost" data-prc="${c.id}" aria-label="Imprimer">${APP.icon('print', 15)}</button></span>` },
        ] });
      UI.$$('[data-rec]', h).forEach(b => b.onclick = () => reception(S.get('commandes', b.dataset.rec)));
      UI.$$('[data-prc]', h).forEach(b => b.onclick = () => printCmd(S.get('commandes', b.dataset.prc)));
    };
    body();
    UI.$('#cQ', v).oninput = U.debounce(e => { st.q = e.target.value; body(); }, 200);
    UI.$('#cSt', v).onchange = e => { st.statut = e.target.value; body(); };
    UI.$('#cXls', v).onclick = () => UI.xlsx(`STRAM_Commandes_${U.today()}.xlsx`, { Commandes: [['N°', 'Date', 'Statut', 'Fournisseur', 'Lot', 'Besoin le', 'Livraison prévue', 'Désignation', 'Unité', 'Quantité', 'Reçu', 'P.U.', 'Montant HT'],
      ...S.list('commandes').flatMap(c => (c.lignes || []).map(l => [c.num, U.fr(c.date), c.statut, fnom(c.fournisseurId), APP.entNom(c.entrepriseId), U.fr(c.dateBesoin), U.fr(c.livraisonPrevue), lineLabel(l), l.articleId ? S.get('articles', l.articleId)?.unite : l.unite, U.num(l.quantite), U.num(l.recu), U.num(l.prixUnitaire), U.num(l.quantite) * U.num(l.prixUnitaire)]))] });
  }

  window.CMD = { commanderAvant, besoin };
  APP.mod('commandes', { title: 'Commandes', icon: '⛟', group: 'Logistique', sub: 'Commandes à passer, livraisons et fournisseurs', render,
    badge: () => S.list('commandes').filter(c => c.statut === 'À passer').length });
})();
