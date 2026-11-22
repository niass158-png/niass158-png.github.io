/* STRAM Suivi — Gestion des stocks de matériaux et de matériel */
'use strict';
const STOCK = (() => {
  const st = { tab: 'etat', q: '', cat: '', alerte: false };
  const etat = () => {
    const mv = S.list('mouvements');
    return S.list('articles').map(a => {
      const m = mv.filter(x => x.articleId === a.id);
      const sum = t => m.filter(x => x.type === t).reduce((s, x) => s + U.num(x.quantite), 0);
      const r = { a, ini: U.num(a.stockInitial), ent: sum('Entrée'), sor: sum('Sortie'), ret: sum('Retour'), aju: sum('Ajustement') };
      r.solde = r.ini + r.ent + r.ret + r.aju - r.sor;
      r.statut = r.solde < 0 ? 'Écart' : (a.seuil !== '' && a.seuil !== undefined && r.solde <= U.num(a.seuil)) ? 'Sous le seuil' : r.solde === 0 ? 'Épuisé' : 'Disponible';
      r.valeur = r.solde * U.num(a.prixUnitaire);
      r.conso = r.sor - r.ret; r.pctConso = U.num(a.qtePrevue) ? Math.round(100 * r.conso / U.num(a.qtePrevue)) : null;
      return r;
    });
  };
  const artLabel = a => `${a.code} — ${a.designation} (${a.unite})`;

  function editArticle(a = {}) {
    const f0 = a.id ? NOM.familleDe(a) : '';
    UI.form({ title: a.id ? `Article ${a.code}` : 'Nouvel article', value: Object.assign({ famille: f0 }, a), fields: [
      { k: 'famille', label: 'Famille', type: 'select', required: true, options: NOM.FAMILLES.map(f => ({ v: f.code, l: `${f.code} — ${f.nom}` })) },
      { k: 'code', label: 'Code article', hint: 'Laissez vide : le code est attribué selon la famille (ex. LIA-004)' },
      { k: 'designation', label: 'Désignation', required: true, full: true },
      { k: 'unite', label: 'Unité', type: 'datalist', options: [...new Set(S.list('articles').map(x => x.unite).filter(Boolean))], required: true },
      { k: 'stockInitial', label: 'Stock initial (inventaire)', type: 'number' },
      { k: 'seuil', label: 'Seuil d\'alerte', type: 'number', hint: 'Une alerte apparaît quand le stock passe sous ce niveau' },
      { k: 'prixUnitaire', label: 'Prix unitaire (FCFA)', type: 'number' },
      { k: 'emplacement', label: 'Emplacement', default: 'Magasin chantier' },
      { k: 'qtePrevue', label: 'Quantité prévue au projet', type: 'number', hint: 'Besoin total estimé : sert à suivre la consommation' },
      { k: 'fournisseurId', label: 'Fournisseur habituel', type: 'select', options: UI.opts(S.list('fournisseurs')) },
    ], onSave: v => {
      v.code = String(v.code || '').trim().toUpperCase();
      if (!v.code || !v.code.startsWith(v.famille + '-')) v.code = NOM.prochainCode(v.famille, a.id);
      if (S.list('articles').some(x => x.id !== a.id && (x.code || '').toUpperCase() === v.code)) { UI.toast(`Le code ${v.code} est déjà utilisé`, 'err'); return false; }
      v.categorie = NOM.fam(v.famille).nom;
      S.save('articles', Object.assign({ id: a.id }, v), `Stock : article ${v.code} « ${v.designation} » ${a.id ? 'modifié' : 'créé'}`); UI.toast(`Article ${v.code} enregistré`);
    },
    onDelete: a.id ? () => { if (S.list('mouvements').some(m => m.articleId === a.id)) { UI.toast('Article utilisé dans des mouvements : suppression impossible', 'err'); return; } S.remove('articles', a.id, `Stock : article « ${a.designation} » supprimé`); } : null });
  }

  /* ---------- Bon de sortie / d'entrée / de retour : plusieurs articles, saisie par code ---------- */
  const PREFIXE = { Sortie: 'BS', 'Entrée': 'BE', Retour: 'BR' };
  const TITRE = { Sortie: 'Bon de sortie', 'Entrée': 'Bon d\'entrée', Retour: 'Bon de retour' };
  const estMonteCharge = a => a && (a.famille === 'MCH' || /monte|ascenseur/i.test(`${a.categorie} ${a.designation}`));
  function bon(type = 'Sortie', preset = {}) {
    const hab = S.list('habilites').filter(h => h.nom);
    const ents = S.list('entreprises').sort(U.by('nom'));
    const lignes = (preset.lignes || []).map(l => ({ ...l }));
    if (!lignes.length) lignes.push({ code: '', quantite: '' });
    const date0 = U.today();
    const box = document.createElement('div');
    box.className = 'bonf';
    const opt = (list, v) => list.map(x => `<option ${x === v ? 'selected' : ''}>${U.esc(x)}</option>`).join('');
    box.innerHTML = `${NOM.datalist()}
      <div class="grid-form">
        <div class="field"><label>N° du bon</label><input id="bNum" value="${NOM.prochainBon(PREFIXE[type])}" readonly class="ro"></div>
        <div class="field"><label>Date</label><input type="date" id="bDate" value="${date0}"></div>
        ${type === 'Sortie' ? `<div class="field"><label>Entreprise bénéficiaire *</label><select id="bEnt"><option value="">— choisir —</option>${opt(ents.map(e => e.nom), preset.demandeur)}</select></div>
        <div class="field"><label>Autorisé par *</label>${hab.length ? `<select id="bAut"><option value="">— personne habilitée —</option>${opt(hab.map(h => h.nom))}</select>` : '<input id="bAut" placeholder="Nom (déclarez les personnes habilitées dans Accès)">'}</div>` : ''}
        ${type === 'Entrée' ? `<div class="field"><label>Fournisseur / provenance</label><input id="bFou" list="dlFou"><datalist id="dlFou">${S.list('fournisseurs').map(f => `<option value="${U.esc(f.nom)}">`).join('')}</datalist></div>
        <div class="field"><label>N° de commande / BL</label><input id="bCmd" list="dlCmd" placeholder="BC-2026-0001"><datalist id="dlCmd">${S.list('commandes').map(c => `<option value="${U.esc(c.num)}">`).join('')}</datalist></div>` : ''}
        ${type === 'Retour' ? `<div class="field full"><label>Entreprise qui rapporte</label><select id="bEnt"><option value="">— choisir —</option>${opt(ents.map(e => e.nom))}</select></div>` : ''}
      </div>
      <label class="lbl" style="margin-top:14px">Articles <span class="muted">— tapez le code (ex. LIA-001) ou choisissez dans la liste</span></label>
      <table class="tbl mini bonl"><thead><tr><th style="width:150px">Code article</th><th>Désignation</th><th class="r" style="width:110px">Quantité</th><th style="width:40px"></th></tr></thead><tbody id="bL"></tbody></table>
      <button type="button" class="btn sm ghost" id="bAdd">+ Ajouter un article</button>
      <div class="field" style="margin-top:12px"><label>${type === 'Entrée' ? 'Observations (état, réserves à la livraison…)' : 'Destination / motif'}</label><input id="bMot" value="${U.esc(preset.motif || '')}"></div>
      ${type === 'Sortie' ? `<details id="bOpt" style="margin-top:10px"><summary>Options : 2e validation, véhicule, urgence</summary><div class="grid-form" style="margin-top:8px">
        <div class="field"><label>2e validation (obligatoire pour le monte-charge)</label>${hab.length ? `<select id="bV2"><option value="">—</option>${opt(hab.map(h => h.nom))}</select>` : '<input id="bV2">'}</div>
        <div class="field"><label>Véhicule (immatriculation)</label><input id="bVeh"></div>
        <label class="chk full"><input type="checkbox" id="bUrg"> Autorisation donnée par téléphone : bon à régulariser sous 24 h</label></div></details>` : ''}`;
    const tb = UI.$('#bL', box);
    const draw = () => {
      tb.innerHTML = lignes.map((l, i) => {
        const a = NOM.trouver(l.code);
        const info = !l.code ? '<span class="muted">—</span>' : a ? `<b>${U.esc(a.designation)}</b> <span class="muted">· ${U.esc(a.unite)} · stock ${U.qty(APP.stockOf(a.id))}</span>${estMonteCharge(a) && type === 'Sortie' ? ' ' + UI.badge('2e validation', 'b-amber') : ''}` : '<span class="neg">Code inconnu</span>';
        return `<tr><td><input data-i="${i}" data-f="code" list="dlArt" value="${U.esc(a ? a.code : l.code)}" placeholder="LIA-001" autocomplete="off" style="text-transform:uppercase"></td><td>${info}</td>
          <td class="r"><input type="number" step="any" min="0" data-i="${i}" data-f="quantite" value="${l.quantite}" style="width:90px"></td><td><button type="button" class="icon-btn" data-x="${i}" aria-label="Retirer la ligne">✕</button></td></tr>`;
      }).join('');
      UI.$$('input[data-f]', tb).forEach(el => el.onchange = () => { lignes[+el.dataset.i][el.dataset.f] = el.value; if (el.dataset.f === 'code') { draw(); const q = UI.$(`input[data-i="${el.dataset.i}"][data-f="quantite"]`, tb); q && q.focus(); } });
      UI.$$('[data-x]', tb).forEach(b => b.onclick = () => { lignes.splice(+b.dataset.x, 1); if (!lignes.length) lignes.push({ code: '', quantite: '' }); draw(); });
      if (type === 'Sortie' && lignes.some(l => estMonteCharge(NOM.trouver(l.code)))) UI.$('#bOpt', box).open = true;
    };
    draw();
    UI.$('#bAdd', box).onclick = () => { lignes.push({ code: '', quantite: '' }); draw(); const c = UI.$$('input[data-f="code"]', tb).pop(); c && c.focus(); };
    UI.$('#bDate', box).onchange = e => { UI.$('#bNum', box).value = NOM.prochainBon(PREFIXE[type], 'mouvements', 'numBon', e.target.value || U.today()); };
    const val = id => { const el = UI.$('#' + id, box); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };

    UI.modal({ title: TITRE[type], wide: true, body: box, actions: [{ label: 'Annuler' }, { label: `Enregistrer le ${TITRE[type].toLowerCase()}`, cls: 'primary', onClick: () => {
      const L = lignes.filter(l => l.code || l.quantite).map(l => ({ a: NOM.trouver(l.code), q: U.num(l.quantite), code: l.code }));
      if (!L.length) { UI.toast('Ajoutez au moins un article', 'err'); return false; }
      const bad = L.find(l => !l.a); if (bad) { UI.toast(`Code article inconnu : ${bad.code || '(vide)'}`, 'err'); return false; }
      if (L.some(l => l.q <= 0)) { UI.toast('Chaque ligne doit avoir une quantité positive', 'err'); return false; }
      const head = { date: val('bDate') || U.today(), numBon: val('bNum'), motif: val('bMot') };
      if (type === 'Sortie') {
        Object.assign(head, { demandeur: val('bEnt'), autorisePar: val('bAut'), validation2: val('bV2'), vehicule: val('bVeh'), urgence: val('bUrg') });
        if (!head.demandeur) { UI.toast('Choisissez l\'entreprise bénéficiaire', 'err'); return false; }
        if (!head.autorisePar) { UI.toast('Indiquez la personne habilitée qui autorise la sortie', 'err'); return false; }
        const parArt = {}; L.forEach(l => { parArt[l.a.id] = (parArt[l.a.id] || 0) + l.q; });
        const manque = Object.keys(parArt).map(id => ({ a: S.get('articles', id), q: parArt[id], d: APP.stockOf(id) })).find(x => x.q > x.d);
        if (manque) { UI.toast(`Stock insuffisant pour ${manque.a.code} : ${U.qty(manque.d)} ${manque.a.unite} disponible(s)`, 'err'); return false; }
        if (L.some(l => estMonteCharge(l.a)) && !head.validation2) { UI.$('#bOpt', box).open = true; UI.toast('Pièce du monte-charge : la 2e validation est obligatoire', 'err'); return false; }
        if (head.validation2 && head.validation2 === head.autorisePar) { UI.toast('La 2e validation doit être faite par une autre personne', 'err'); return false; }
      } else if (type === 'Entrée') Object.assign(head, { fournisseur: val('bFou'), commandeNum: val('bCmd') });
      else Object.assign(head, { demandeur: val('bEnt') });
      const commit = () => {
        try {
          L.forEach(l => S.save('mouvements', Object.assign({ type, articleId: l.a.id, quantite: l.q }, head)));
          S.log(`Stock : ${TITRE[type].toLowerCase()} ${head.numBon} — ${L.length} article(s)${head.demandeur ? ' pour ' + head.demandeur : ''}`);
          UI.toast(`${TITRE[type]} ${head.numBon} enregistré`);
          if (type === 'Sortie') setTimeout(() => UI.confirm(`Imprimer le bon ${head.numBon} ?`, () => printBon(head.numBon), 'Imprimer'), 200);
        } catch (e) { UI.toast(e.message, 'err'); }
        m.close();
      };
      // validation par code PIN des personnes habilitées qui en ont un
      const pins = type === 'Sortie' ? [head.autorisePar, head.validation2].filter(Boolean).map(n => hab.find(h => h.nom === n)).filter(h => h && h.pinHash) : [];
      const next = i => i >= pins.length ? commit() : UIX.askPin(`Validation de ${pins[i].nom} — code PIN`, pins[i].pinHash, pins[i].id, () => next(i + 1));
      next(0);
      return false;
    } }] });
    const m = { close: () => { const ov = box.closest('.overlay'); ov && ov.remove(); } };
    setTimeout(() => { const c = UI.$('input[data-f="code"]', tb); if (type !== 'Sortie' && c) c.focus(); }, 80);
  }

  function editMouvement(m = {}, type) {
    type = m.type || type || 'Sortie';
    const arts = S.list('articles').sort(U.by('code'));
    const hab = S.list('habilites').map(h => h.nom).filter(Boolean);
    const prefix = { Sortie: 'BS-', Entrée: 'BE-', Retour: 'BR-', Ajustement: 'AJ-' }[type];
    const fields = [
      { k: 'date', label: 'Date', type: 'date', required: true, default: U.today() },
      { k: 'numBon', label: 'N° de bon', required: true, default: NOM.prochainBon(prefix.replace('-', '')) },
      { k: 'articleId', label: 'Article', type: 'select', options: arts.map(a => ({ v: a.id, l: `${artLabel(a)} — stock ${U.qty(APP.stockOf(a.id))}` })), required: true, full: true },
      { k: 'quantite', label: type === 'Ajustement' ? 'Écart constaté (+ ou −)' : 'Quantité', type: 'number', required: true },
    ];
    if (type === 'Sortie') fields.push(
      { k: 'demandeur', label: 'Entreprise / demandeur', type: 'datalist', options: S.list('entreprises').map(e => e.nom), required: true },
      { k: 'autorisePar', label: 'Autorisé par (personne habilitée)', type: hab.length ? 'select' : 'text', options: hab, required: true, hint: hab.length ? '' : 'Déclarez les personnes habilitées dans « Accès & personnel »' },
      { k: 'validation2', label: '2e validation (pièces monte-charge)', type: hab.length ? 'select' : 'text', options: hab },
      { k: 'vehicule', label: 'Véhicule (immatriculation)' },
      { k: 'motif', label: 'Destination / motif', full: true },
      { k: 'urgence', label: 'Autorisation téléphonique', type: 'checkbox', text: 'Bon à régulariser sous 24 h' });
    else if (type === 'Entrée') fields.push(
      { k: 'fournisseur', label: 'Fournisseur / provenance', type: 'datalist', options: S.list('fournisseurs').map(f => f.nom) },
      { k: 'commandeNum', label: 'N° de commande', type: 'datalist', options: S.list('commandes').map(c => c.num) },
      { k: 'motif', label: 'Observations (BL, état…)', full: true });
    else fields.push({ k: 'demandeur', label: type === 'Retour' ? 'Entreprise qui rapporte' : 'Constaté par', type: 'datalist', options: S.list('entreprises').map(e => e.nom) }, { k: 'motif', label: 'Motif', full: true });
    UI.form({ title: `${type === 'Sortie' ? 'Bon de sortie' : type === 'Entrée' ? 'Entrée en stock' : type === 'Retour' ? 'Retour au magasin' : 'Ajustement d\'inventaire'}`, value: m, wide: true, fields,
      onSave: v => {
        const a = S.get('articles', v.articleId);
        const dispo = APP.stockOf(v.articleId) + (m.id && m.type === 'Sortie' ? U.num(m.quantite) : 0);
        if (type !== 'Ajustement' && U.num(v.quantite) <= 0) { UI.toast('La quantité doit être positive', 'err'); return false; }
        if (type === 'Sortie' && U.num(v.quantite) > dispo) { UI.toast(`Stock insuffisant : ${U.qty(dispo)} ${a.unite} disponible(s)`, 'err'); return false; }
        if (type === 'Sortie' && /monte/i.test(a.categorie + a.designation) && !v.validation2) { UI.toast('Pièce du monte-charge : la 2e validation est obligatoire', 'err'); return false; }
        const commit = () => {
          try {
            const r = S.save('mouvements', Object.assign({ id: m.id, type }, v), `Stock : ${type.toLowerCase()} ${v.numBon} — ${U.qty(v.quantite)} ${a.unite} ${a.designation}`);
            UI.toast(`${type} enregistrée`);
            if (type === 'Sortie' && !m.id) setTimeout(() => UI.confirm('Imprimer le bon de sortie ?', () => printBon(r), 'Imprimer'), 200);
          } catch (e) { UI.toast(e.message, 'err'); }
        };
        // validation par code PIN des personnes habilitées qui en ont un
        const pins = type === 'Sortie' && !m.id ? [v.autorisePar, v.validation2].filter(Boolean).map(n => S.list('habilites').find(h => h.nom === n)).filter(h => h && h.pinHash) : [];
        if (!pins.length) { commit(); return; }
        const next = i => i >= pins.length ? commit() : UIX.askPin(`Validation de ${pins[i].nom}`, pins[i].pinHash, pins[i].id, () => next(i + 1));
        next(0);
      },
      onDelete: m.id ? () => S.remove('mouvements', m.id, `Stock : mouvement ${m.numBon} supprimé`) : null });
  }

  function listeCodes() {
    const arts = S.list('articles').sort(U.by('code'));
    UI.printDoc('Nomenclature des articles du magasin', `<p class="muted">Affichez cette liste au magasin : chaque bon de sortie, d'entrée ou de retour se fait avec le code de l'article.</p>
      ${NOM.FAMILLES.map(f => { const L = arts.filter(a => NOM.familleDe(a) === f.code); return L.length ? `<h3>${f.code} — ${U.esc(f.nom)}</h3><table><tr><th style="width:90px">Code</th><th>Désignation</th><th>Unité</th><th>Emplacement</th></tr>${L.map(a => `<tr><td><b>${U.esc(a.code)}</b></td><td>${U.esc(a.designation)}</td><td>${U.esc(a.unite)}</td><td>${U.esc(a.emplacement || '')}</td></tr>`).join('')}</table>` : ''; }).join('')}`);
  }

  function printBon(ref) {
    const num = typeof ref === 'string' ? ref : ref.numBon;
    const L = S.list('mouvements').filter(x => x.numBon === num && x.type === 'Sortie');
    if (!L.length) return;
    const m = L[0];
    const pin = n => S.list('habilites').some(h => h.nom === n && h.pinHash);
    UI.printDoc(`Bon de sortie n° ${num}`, `<table><tr><th>Date</th><td>${U.fr(m.date)}</td><th>Entreprise bénéficiaire</th><td>${U.esc(m.demandeur || '')}</td></tr>
      <tr><th>Véhicule</th><td>${U.esc(m.vehicule || '')}</td><th>Destination / motif</th><td>${U.esc(m.motif || '')}</td></tr></table>
      <table><tr><th>Code</th><th>Désignation</th><th>Unité</th><th class="r">Quantité</th></tr>${L.map(x => { const a = S.get('articles', x.articleId) || {}; return `<tr><td><b>${U.esc(a.code)}</b></td><td>${U.esc(a.designation)}</td><td>${U.esc(a.unite)}</td><td class="r">${U.qty(x.quantite)}</td></tr>`; }).join('')}</table>
      ${m.urgence ? '<p><b>Autorisation téléphonique — bon à régulariser sous 24 h.</b></p>' : ''}
      <div class="sig"><div>Autorisé par<br><b>${U.esc(m.autorisePar || '')}</b>${pin(m.autorisePar) ? '<br><small>validé par code PIN</small>' : ''}</div>${m.validation2 ? `<div>2e validation<br><b>${U.esc(m.validation2)}</b>${pin(m.validation2) ? '<br><small>validé par code PIN</small>' : ''}</div>` : ''}<div>Remis par (magasinier)<br>nom et signature</div><div>Reçu par (bénéficiaire)<br>nom et signature</div></div>`);
  }

  function inventaire() {
    const E = etat().sort(U.by(r => r.a.code));
    const body = document.createElement('div');
    body.innerHTML = `<p class="muted">Saisissez les quantités comptées. Les écarts sont enregistrés comme ajustements d'inventaire datés du jour.</p>
      <div class="tbl-wrap" style="max-height:55vh"><table class="tbl"><thead><tr><th>Code</th><th>Désignation</th><th>Unité</th><th class="r">Stock théorique</th><th class="r">Compté</th></tr></thead>
      <tbody>${E.map(r => `<tr><td>${U.esc(r.a.code)}</td><td>${U.esc(r.a.designation)}</td><td>${U.esc(r.a.unite)}</td><td class="r">${U.qty(r.solde)}</td><td class="r"><input type="number" step="any" data-id="${r.a.id}" data-s="${r.solde}" style="width:90px"></td></tr>`).join('')}</tbody></table></div>`;
    UI.modal({ title: `Inventaire contradictoire du ${U.fr(U.today())}`, wide: true, body, actions: [{ label: 'Annuler' }, { label: 'Enregistrer les écarts', cls: 'primary', onClick: () => {
      let n = 0; const num = APP.nextNum('mouvements', 'INV-', 'numBon').replace(/^\D+/, 'INV-');
      UI.$$('input[data-id]', body).forEach(i => { if (i.value === '') return; const d = U.num(i.value) - U.num(i.dataset.s); if (Math.abs(d) < 1e-9) return;
        S.data.mouvements.push({ id: U.uid(), cree: new Date().toISOString(), maj: new Date().toISOString(), type: 'Ajustement', date: U.today(), numBon: num, articleId: i.dataset.id, quantite: d, motif: 'Inventaire contradictoire' }); n++; });
      S.log(`Stock : inventaire du ${U.fr(U.today())} — ${n} écart(s) enregistrés`); S.persist(); APP.refresh(); UI.toast(n ? `${n} écart(s) enregistré(s)` : 'Aucun écart : stock conforme');
    } }] });
  }

  function importExcel() {
    UI.pickFile('.xlsx,.xls', (buf) => {
      try {
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames.find(n => /stock|inventaire|article/i.test(n)) || wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        const h = rows.findIndex(r => r.some(c => /d[ée]signation/i.test(c)));
        if (h < 0) throw new Error('Colonne « Désignation » introuvable');
        const H = rows[h].map(c => U.norm(c));
        const ix = k => H.findIndex(c => c.includes(k));
        const iC = ix('code'), iD = ix('designation'), iCat = ix('categ'), iU = ix('unit'), iQ = H.findIndex(c => c.includes('quantit') || c.includes('stock')), iS = ix('seuil');
        let n = 0, m = 0;
        rows.slice(h + 1).forEach(r => { const d = String(r[iD] || '').trim(); if (!d) return;
          const ex = S.list('articles').find(a => (iC >= 0 && r[iC] && a.code === r[iC]) || U.norm(a.designation) === U.norm(d));
          const o = { code: iC >= 0 ? String(r[iC]) : '', designation: d, categorie: iCat >= 0 ? r[iCat] : '', unite: iU >= 0 ? String(r[iU]).trim() : '', stockInitial: iQ >= 0 ? U.num(r[iQ]) : 0, seuil: iS >= 0 && r[iS] !== '' ? U.num(r[iS]) : '' };
          if (ex) { S.save('articles', Object.assign({ id: ex.id }, o)); m++; } else { S.save('articles', o); n++; } });
        S.log(`Stock : import Excel — ${n} article(s) créés, ${m} mis à jour`); UI.toast(`Import terminé : ${n} créé(s), ${m} mis à jour`);
      } catch (e) { UI.toast('Import impossible : ' + e.message, 'err'); }
    });
  }

  function render(v) {
    v.innerHTML = `<div class="tabs">${[['etat', 'État du stock'], ['mvt', 'Mouvements'], ['art', 'Articles'], ['nom', 'Nomenclature']].map(([k, l]) => `<button data-t="${k}" class="${st.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="toolbar"><button class="btn primary" data-m="Sortie">− Bon de sortie</button><button class="btn" data-m="Entrée">+ Entrée</button><button class="btn" data-m="Retour">${APP.icon('undo', 15)} Retour</button>
      <button class="btn" id="sInv">${APP.icon('check', 15)} Inventaire</button><button class="btn" id="sArt">+ Article</button><button class="btn ghost" id="sCodes">${APP.icon('print', 15)} Liste des codes</button><span class="sep"></span>
      <input type="search" id="sQ" placeholder="Rechercher un article…" value="${U.esc(st.q)}">
      <select id="sCat"><option value="">Toutes catégories</option>${[...new Set(S.list('articles').map(a => a.categorie).filter(Boolean))].sort().map(c => `<option ${st.cat === c ? 'selected' : ''}>${U.esc(c)}</option>`).join('')}</select>
      <label class="chk"><input type="checkbox" id="sAl" ${st.alerte ? 'checked' : ''}> Alertes seulement</label><span class="sep"></span>
      <button class="btn ghost" id="sImp">${APP.icon('upload', 15)} Importer Excel</button><button class="btn ghost" id="sXls">${APP.icon('download', 15)} Excel</button><button class="btn ghost" id="sPr">${APP.icon('print', 15)} Imprimer</button></div><div id="sBody"></div>`;
    UI.$$('[data-t]', v).forEach(b => b.onclick = () => { st.tab = b.dataset.t; APP.refresh(); });
    UI.$$('[data-m]', v).forEach(b => b.onclick = () => bon(b.dataset.m));
    UI.$('#sInv', v).onclick = inventaire; UI.$('#sCodes', v).onclick = listeCodes; UI.$('#sArt', v).onclick = () => editArticle(); UI.$('#sImp', v).onclick = importExcel;
    UI.$('#sQ', v).oninput = U.debounce(e => { st.q = e.target.value; body(); }, 200);
    UI.$('#sCat', v).onchange = e => { st.cat = e.target.value; body(); };
    UI.$('#sAl', v).onchange = e => { st.alerte = e.target.checked; body(); };
    const filt = r => (!st.q || U.norm(`${r.a.code} ${r.a.designation} ${r.a.categorie}`).includes(U.norm(st.q))) && (!st.cat || r.a.categorie === st.cat) && (!st.alerte || ['Écart', 'Sous le seuil', 'Épuisé'].includes(r.statut));
    const cls = s => ({ 'Écart': 'b-red', 'Sous le seuil': 'b-amber', 'Épuisé': 'b-grey', 'Disponible': 'b-green' }[s]);
    const body = () => {
      const h = UI.$('#sBody', v);
      if (st.tab === 'etat') {
        const rows = etat().filter(filt);
        UI.table(h, { id: 'stock', sortKey: 'code', rows, onRow: r => editArticle(r.a), cols: [
          { k: 'code', label: 'Code', sort: r => r.a.code, render: r => U.esc(r.a.code) },
          { k: 'des', label: 'Désignation', sort: r => r.a.designation, render: r => `<b>${U.esc(r.a.designation)}</b>` },
          { k: 'cat', label: 'Catégorie', sort: r => r.a.categorie, render: r => U.esc(r.a.categorie) },
          { k: 'u', label: 'Unité', render: r => U.esc(r.a.unite), nosort: true },
          { k: 'ini', label: 'Initial', cls: 'r', render: r => U.qty(r.ini) },
          { k: 'ent', label: 'Entrées', cls: 'r', render: r => r.ent ? U.qty(r.ent) : '' },
          { k: 'ret', label: 'Retours', cls: 'r', render: r => r.ret ? U.qty(r.ret) : '' },
          { k: 'sor', label: 'Sorties', cls: 'r', render: r => r.sor ? U.qty(r.sor) : '' },
          { k: 'aju', label: 'Ajust.', cls: 'r', render: r => r.aju ? U.qty(r.aju) : '' },
          { k: 'solde', label: 'Solde', cls: 'r', render: r => `<b>${U.qty(r.solde)}</b>` },
          { k: 'seuil', label: 'Seuil', cls: 'r', sort: r => U.num(r.a.seuil), render: r => r.a.seuil !== '' && r.a.seuil !== undefined ? U.qty(r.a.seuil) : '' },
          { k: 'conso', label: 'Consommé / prévu', sort: r => r.pctConso ?? -1, render: r => r.pctConso === null ? '<span class="muted">—</span>' : UI.bar(r.pctConso, r.pctConso > 100 ? 'bad' : '', `${U.qty(r.conso)} / ${U.qty(r.a.qtePrevue)}`) },
          { k: 'valeur', label: 'Valeur', cls: 'r', render: r => r.valeur ? U.money(r.valeur) : '', sum: rs => U.money(rs.reduce((s, r) => s + r.valeur, 0)) },
          { k: 'statut', label: 'Statut', render: r => UI.badge(r.statut, cls(r.statut)) },
        ] });
      } else if (st.tab === 'mvt') {
        const rows = S.list('mouvements').map(m => ({ m, a: S.get('articles', m.articleId) || {} })).filter(({ a }) => (!st.q || U.norm(`${a.code} ${a.designation}`).includes(U.norm(st.q))) && (!st.cat || a.categorie === st.cat));
        UI.table(h, { id: 'mvt', sortKey: 'date', sortDir: -1, rows, onRow: r => editMouvement(r.m), cols: [
          { k: 'date', label: 'Date', sort: r => r.m.date + r.m.numBon, render: r => U.fr(r.m.date) },
          { k: 'bon', label: 'N° bon', sort: r => r.m.numBon, render: r => U.esc(r.m.numBon) },
          { k: 'type', label: 'Type', sort: r => r.m.type, render: r => UI.badge(r.m.type, { Sortie: 'b-red', 'Entrée': 'b-green', Retour: 'b-blue', Ajustement: 'b-grey' }[r.m.type]) + (r.m.urgence ? ' ' + UI.badge('À régulariser', 'b-amber') : '') },
          { k: 'art', label: 'Article', sort: r => r.a.designation, render: r => `${U.esc(r.a.designation)} <small class="muted">${U.esc(r.a.code)}</small>` },
          { k: 'q', label: 'Quantité', cls: 'r', sort: r => U.num(r.m.quantite), render: r => `${U.qty(r.m.quantite)} ${U.esc(r.a.unite || '')}` },
          { k: 'dem', label: 'Demandeur / provenance', sort: r => r.m.demandeur || r.m.fournisseur, render: r => U.esc(r.m.demandeur || r.m.fournisseur || '') },
          { k: 'aut', label: 'Autorisé par', render: r => U.esc(r.m.autorisePar || ''), sort: r => r.m.autorisePar },
          { k: 'mot', label: 'Motif', render: r => U.esc(r.m.motif || ''), nosort: true },
          { k: 'pr', label: '', nosort: true, render: r => r.m.type === 'Sortie' ? `<button class="btn xs" data-pr="${r.m.id}">${APP.icon('print', 15)} Bon</button>` : '' },
        ] });
        UI.$$('[data-pr]', h).forEach(b => b.onclick = () => printBon(S.get('mouvements', b.dataset.pr).numBon));
      } else if (st.tab === 'nom') {
        const arts = S.list('articles');
        h.innerHTML = `<div class="card soft"><h3>Comment lire les codes</h3><p><b>Articles :</b> 3 lettres pour la famille, puis un numéro — <b>LIA-001</b> = 1er article de la famille Liants. Un nouvel article reçoit automatiquement le numéro suivant de sa famille.</p>
          <p><b>Bons :</b> type, année, numéro — <b>BS-2026-0012</b> bon de sortie, <b>BE-</b> entrée, <b>BR-</b> retour, <b>BC-</b> bon de commande. La numérotation repart à 1 chaque année.</p></div>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Famille</th><th>Libellé</th><th class="r">Articles</th><th>Prochain code</th></tr></thead><tbody>${NOM.FAMILLES.map(f => `<tr><td><b>${f.code}</b></td><td>${U.esc(f.nom)}</td><td class="r">${arts.filter(a => NOM.familleDe(a) === f.code).length}</td><td class="muted">${NOM.prochainCode(f.code)}</td></tr>`).join('')}</tbody></table></div>`;
      } else {
        const rows = S.list('articles').filter(a => (!st.q || U.norm(`${a.code} ${a.designation}`).includes(U.norm(st.q))) && (!st.cat || a.categorie === st.cat));
        UI.table(h, { id: 'art', sortKey: 'code', rows, onRow: editArticle, cols: [
          { k: 'code', label: 'Code', render: a => `<b>${U.esc(a.code)}</b>${a.ancienCode ? ` <small class="muted">ex ${U.esc(a.ancienCode)}</small>` : ''}` }, { k: 'designation', label: 'Désignation' }, { k: 'categorie', label: 'Famille' }, { k: 'unite', label: 'Unité' },
          { k: 'stockInitial', label: 'Stock initial', cls: 'r', render: a => U.qty(a.stockInitial) }, { k: 'seuil', label: 'Seuil', cls: 'r' },
          { k: 'prixUnitaire', label: 'Prix unitaire', cls: 'r', render: a => a.prixUnitaire ? U.money(a.prixUnitaire) : '' }, { k: 'emplacement', label: 'Emplacement' },
        ] });
      }
    };
    body();
    UI.$('#sXls', v).onclick = () => {
      const E = etat();
      UI.xlsx(`STRAM_Stock_${U.today()}.xlsx`, {
        'État du stock': [['Code', 'Désignation', 'Catégorie', 'Unité', 'Stock initial', 'Entrées', 'Retours', 'Sorties', 'Ajustements', 'Solde', 'Seuil', 'Prix unitaire', 'Valeur', 'Statut'], ...E.map(r => [r.a.code, r.a.designation, r.a.categorie, r.a.unite, r.ini, r.ent, r.ret, r.sor, r.aju, r.solde, r.a.seuil, r.a.prixUnitaire, r.valeur, r.statut])],
        'Mouvements': [['Date', 'N° bon', 'Type', 'Code', 'Article', 'Quantité', 'Unité', 'Demandeur / provenance', 'Autorisé par', '2e validation', 'Véhicule', 'Motif'], ...S.list('mouvements').sort(U.by('date')).map(m => { const a = S.get('articles', m.articleId) || {}; return [U.fr(m.date), m.numBon, m.type, a.code, a.designation, U.num(m.quantite), a.unite, m.demandeur || m.fournisseur || '', m.autorisePar || '', m.validation2 || '', m.vehicule || '', m.motif || '']; })],
      });
    };
    UI.$('#sPr', v).onclick = () => { const E = etat().sort(U.by(r => r.a.code)); UI.printDoc(`État du stock au ${U.fr(U.today())}`, `<table><tr><th>Code</th><th>Désignation</th><th>Unité</th><th class="r">Initial</th><th class="r">Entrées</th><th class="r">Sorties</th><th class="r">Solde</th><th>Statut</th></tr>${E.map(r => `<tr><td>${U.esc(r.a.code)}</td><td>${U.esc(r.a.designation)}</td><td>${U.esc(r.a.unite)}</td><td class="r">${U.qty(r.ini)}</td><td class="r">${U.qty(r.ent + r.ret)}</td><td class="r">${U.qty(r.sor)}</td><td class="r"><b>${U.qty(r.solde)}</b></td><td>${r.statut}</td></tr>`).join('')}</table><div class="sig"><div>Magasinier</div><div>Représentant du maître d'ouvrage</div></div>`); };
  }

  APP.mod('stock', { title: 'Stocks', icon: '▣', group: 'Logistique', mobile: true, sub: 'Matériaux et matériel du magasin chantier', render,
    badge: () => etat().filter(r => ['Écart', 'Sous le seuil'].includes(r.statut)).length });
  return { etat, editMouvement, bon, printBon };
})();
