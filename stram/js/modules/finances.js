/* STRAM Suivi — Marchés, situations / décomptes des prestataires et budget */
'use strict';
const FIN = (() => {
  const st = { tab: 'syn', ent: '', statut: '' };
  const SST = ['Reçue', 'Vérifiée', 'Validée', 'Payée', 'Rejetée'];
  const SC = { 'Reçue': 'b-blue', 'Vérifiée': 'b-violet', 'Validée': 'b-amber', 'Payée': 'b-green', 'Rejetée': 'b-red' };
  const montantMarche = m => U.num(m.montantHT) + (m.avenants || []).reduce((s, a) => s + U.num(a.montant), 0);

  /** Calcul d'un décompte à partir du cumul des travaux */
  function decompte(s) {
    const m = S.get('marches', s.marcheId) || {};
    const sits = S.list('situations').filter(x => x.marcheId === s.marcheId && x.statut !== 'Rejetée' && U.num(x.num) < U.num(s.num)).sort(U.by(x => U.num(x.num)));
    const prev = sits[sits.length - 1];
    const cum = U.num(s.cumulHT), mt = montantMarche(m);
    const avance = U.num(m.montantHT) * U.num(m.avancePct) / 100;
    const calc = (c, penCum) => {
      const rg = c * U.num(m.retenuePct) / 100;
      const remb = Math.min(avance, c * U.num(m.avancePct) / 100 * (U.num(m.rembCoef) || 1));
      return { rg, remb, net: c - rg - remb - penCum };
    };
    const penCum = sits.reduce((t, x) => t + U.num(x.penalites), 0) + U.num(s.penalites);
    const now = calc(cum, penCum), before = prev ? calc(U.num(prev.cumulHT), penCum - U.num(s.penalites)) : { rg: 0, remb: 0, net: 0 };
    const netHT = now.net - before.net, tva = U.num(m.tva ?? S.data.projet.tva);
    return { m, mt, cum, cumPrec: prev ? U.num(prev.cumulHT) : 0, periode: cum - (prev ? U.num(prev.cumulHT) : 0), pctCum: mt ? 100 * cum / mt : 0,
      rg: now.rg, remb: now.remb, penCum, netCum: now.net, netHT, tva: netHT * tva / 100, ttc: netHT * (1 + tva / 100), tauxTVA: tva, avance };
  }

  function totaux(entId) {
    let marches = 0, facture = 0, paye = 0, valide = 0, cumul = 0;
    S.list('marches').filter(m => !entId || m.entrepriseId === entId).forEach(m => {
      marches += montantMarche(m);
      const ss = S.list('situations').filter(s => s.marcheId === m.id && s.statut !== 'Rejetée');
      ss.forEach(s => { const d = decompte(s); facture += d.ttc; paye += U.num(s.montantPaye); if (['Validée', 'Payée'].includes(s.statut)) valide += d.ttc; });
      const last = ss.sort(U.by(x => U.num(x.num))).pop(); if (last) cumul += U.num(last.cumulHT);
    });
    return { marches, facture, paye, valide, cumul, resteAPayer: Math.max(0, facture - paye), resteAFacturer: Math.max(0, marches - cumul) };
  }

  const dqeTotal = L => L.reduce((t, l) => t + U.num(l.qte) * U.num(l.pu), 0);
  function readDQE(buf) {
    const wb = XLSX.read(buf, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    const h = rows.findIndex(r => r.some(c => /d[ée]signation/i.test(c)) && r.some(c => /(qt|quantit)/i.test(c)));
    if (h < 0) throw new Error('Colonnes « Désignation » et « Quantité » introuvables');
    const H = rows[h].map(c => U.norm(String(c)));
    const ix = re => H.findIndex(c => re.test(c));
    const iN = ix(/^(n|no|n°|item|art)/), iD = ix(/designation/), iU = ix(/^u(nite)?/), iQ = ix(/(qte|quantite)/), iP = ix(/(p\.?u|prix unit|prix)/);
    return rows.slice(h + 1).map(r => ({ id: U.uid(), num: iN >= 0 ? String(r[iN]) : '', designation: String(r[iD] || '').trim(), unite: iU >= 0 ? String(r[iU]) : '', qte: U.num(r[iQ]), pu: iP >= 0 ? U.num(r[iP]) : 0 }))
      .filter(l => l.designation && (l.qte || l.pu));
  }
  function editMarche(m = {}) {
    const av = (m.avenants || []).map(a => ({ ...a }));
    let dqe = (m.lignes || []).map(l => ({ ...l }));
    const box = document.createElement('div');
    const dqeBox = document.createElement('div');
    const drawDqe = () => {
      dqeBox.innerHTML = `<label class="lbl" style="margin-top:14px">Devis quantitatif estimatif (DQE)</label>${dqe.length ? `<div class="tbl-wrap" style="max-height:260px;box-shadow:none;border:1px solid var(--line)"><table class="tbl mini"><thead><tr><th>N°</th><th>Désignation</th><th>U</th><th class="r">Qté</th><th class="r">P.U.</th><th class="r">Montant</th></tr></thead><tbody>${dqe.map(l => `<tr><td>${U.esc(l.num)}</td><td>${U.esc(l.designation)}</td><td>${U.esc(l.unite)}</td><td class="r">${U.qty(l.qte)}</td><td class="r">${U.fmt(l.pu)}</td><td class="r">${U.fmt(U.num(l.qte) * U.num(l.pu))}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="5" class="r">Total HT</td><td class="r">${U.money(dqeTotal(dqe))}</td></tr></tfoot></table></div>` : '<p class="muted small">Importez le DQE (Excel) : les situations se calculeront à partir des quantités exécutées.</p>'}
        <div class="btnrow"><button type="button" class="btn sm" id="dqeImp">${APP.icon('upload', 14)} Importer le DQE (Excel)</button>${dqe.length ? '<button type="button" class="btn sm ghost" id="dqeDel">Retirer le DQE</button>' : ''}</div>`;
      UI.$('#dqeImp', dqeBox).onclick = () => UI.pickFile('.xlsx,.xls', buf => { try { dqe = readDQE(buf); drawDqe(); const f = dqeBox.closest('form'); if (f && f.elements.montantHT && dqe.length) f.elements.montantHT.value = Math.round(dqeTotal(dqe)); UI.toast(`${dqe.length} ligne(s) de DQE importée(s)`); } catch (e) { UI.toast('Import impossible : ' + e.message, 'err'); } });
      if (UI.$('#dqeDel', dqeBox)) UI.$('#dqeDel', dqeBox).onclick = () => { dqe = []; drawDqe(); };
    };
    drawDqe();
    const draw = () => {
      box.innerHTML = `<label class="lbl">Avenants</label><table class="tbl mini"><thead><tr><th>Date</th><th>Objet</th><th class="r">Montant HT (+/−)</th><th></th></tr></thead><tbody>
        ${av.map((a, i) => `<tr><td><input type="date" data-i="${i}" data-f="date" value="${a.date || ''}"></td><td><input data-i="${i}" data-f="objet" value="${U.esc(a.objet || '')}"></td><td><input type="number" step="any" data-i="${i}" data-f="montant" value="${a.montant ?? ''}"></td><td><button type="button" class="icon-btn" data-x="${i}">✕</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Aucun avenant</td></tr>'}</tbody></table>
        <button type="button" class="btn sm ghost" id="avAdd">+ Avenant</button>`;
      UI.$$('[data-f]', box).forEach(el => el.onchange = () => { av[+el.dataset.i][el.dataset.f] = el.dataset.f === 'montant' ? U.num(el.value) : el.value; });
      UI.$$('[data-x]', box).forEach(b => b.onclick = () => { av.splice(+b.dataset.x, 1); draw(); });
      UI.$('#avAdd', box).onclick = () => { av.push({ date: U.today(), objet: '', montant: 0 }); draw(); };
    };
    draw();
    const ex = document.createElement('div'); ex.appendChild(box); ex.appendChild(dqeBox);
    UI.form({ title: m.id ? 'Marché / contrat' : 'Nouveau marché', wide: true, value: m, extra: ex, fields: [
      { k: 'entrepriseId', label: 'Entreprise', type: 'select', options: UI.opts(S.list('entreprises').sort(U.by('nom')), e => `${e.nom} — ${e.corpsEtat || ''}`), required: true },
      { k: 'reference', label: 'Référence du marché / contrat' },
      { k: 'objet', label: 'Objet', full: true },
      { k: 'montantHT', label: 'Montant initial HT (FCFA)', type: 'number', required: true },
      { k: 'tva', label: 'TVA (%)', type: 'number', default: S.data.projet.tva ?? 18 },
      { k: 'retenuePct', label: 'Retenue de garantie (%)', type: 'number', default: 5 },
      { k: 'avancePct', label: 'Avance de démarrage (%)', type: 'number', default: 0, hint: 'Remboursée au prorata des travaux exécutés' },
      { k: 'dateSignature', label: 'Date de signature', type: 'date' },
      { k: 'modePaiement', label: 'Modalités de paiement', placeholder: 'ex. situations mensuelles, paiement à 30 jours' },
      { k: 'delaiPaiement', label: 'Délai de paiement (jours)', type: 'number', default: 30, hint: 'Sert à la prévision de trésorerie' },
    ], onSave: v => { S.save('marches', Object.assign({ id: m.id }, v, { lignes: dqe, avenants: av.filter(a => a.objet || a.montant) }), `Marché ${APP.entNom(v.entrepriseId)} enregistré (${U.money(v.montantHT)} HT)`); UI.toast('Marché enregistré'); },
    onDelete: m.id ? () => { if (S.list('situations').some(s => s.marcheId === m.id)) { UI.toast('Ce marché a des situations : supprimez-les d\'abord', 'err'); return; } S.remove('marches', m.id, 'Marché supprimé'); } : null });
  }

  function editSituation(s = {}) {
    const ms = S.list('marches');
    if (!ms.length) { UI.toast('Enregistrez d\'abord le marché de l\'entreprise (onglet Marchés)', 'err'); return; }
    const nextNum = mid => 1 + Math.max(0, ...S.list('situations').filter(x => x.marcheId === mid).map(x => U.num(x.num)));
    const f = UI.form({ title: s.id ? `Situation n°${s.num}` : 'Nouvelle situation / facture', wide: true, value: s, fields: [
      { k: 'marcheId', label: 'Marché', type: 'select', options: ms.map(m => ({ v: m.id, l: `${APP.entNom(m.entrepriseId)} — ${m.reference || m.objet || ''} (${U.money(montantMarche(m))})` })), required: true },
      { k: 'num', label: 'N° de situation', type: 'number', required: true, default: s.marcheId ? nextNum(s.marcheId) : nextNum(ms[0].id) },
      { k: 'periode', label: 'Période', placeholder: 'ex. novembre 2026' },
      { k: 'factureRef', label: 'Référence facture' },
      { k: 'dateReception', label: 'Date de réception', type: 'date', default: U.today(), required: true },
      { k: 'cumulHT', label: 'Travaux exécutés cumulés HT (FCFA)', type: 'number', required: true, hint: 'Montant cumulé depuis le début, après vérification' },
      { k: 'penalites', label: 'Pénalités appliquées sur ce décompte (FCFA)', type: 'number' },
      { k: 'statut', label: 'Statut', type: 'select', options: SST, required: true, default: 'Reçue' },
      { k: 'dateValidation', label: 'Date de validation', type: 'date' },
      { k: 'montantPaye', label: 'Montant payé (FCFA)', type: 'number' },
      { k: 'datePaiement', label: 'Date de paiement', type: 'date' },
      { k: 'observations', label: 'Observations (vérification, réfactions…)', type: 'textarea', full: true, rows: 2 },
    ], onSave: v => {
      const d = decompte(Object.assign({}, s, v));
      if (U.num(v.cumulHT) < d.cumPrec) { UI.toast(`Le cumul ne peut pas être inférieur à la situation précédente (${U.money(d.cumPrec)})`, 'err'); return false; }
      if (v.statut === 'Payée' && !v.montantPaye) v.montantPaye = Math.round(d.ttc);
      if (v.statut === 'Payée' && !v.datePaiement) v.datePaiement = U.today();
      const mm = S.get('marches', v.marcheId); if (mm && (mm.lignes || []).length) v.quantites = f.form.__q();
      S.save('situations', Object.assign({ id: s.id }, v), `Situation n°${v.num} ${APP.entNom(d.m.entrepriseId)} : ${v.statut} (${U.money(d.ttc)} TTC)`); UI.toast('Situation enregistrée');
    }, onDelete: s.id ? () => S.remove('situations', s.id, `Situation n°${s.num} supprimée`) : null });
    // situation calculée à partir des quantités du DQE
    const qBox = document.createElement('div'); qBox.className = 'full'; f.form.appendChild(qBox);
    let quantites = Object.assign({}, s.quantites || {});
    const drawQ = () => {
      const m = S.get('marches', f.form.elements.marcheId.value); const L = (m && m.lignes) || [];
      if (!L.length) { qBox.innerHTML = ''; f.form.elements.cumulHT.readOnly = false; return; }
      if (!s.id && !Object.keys(quantites).length) { const p = S.list('situations').filter(x => x.marcheId === m.id && x.quantites).sort(U.by(x => U.num(x.num))).pop(); if (p) quantites = Object.assign({}, p.quantites); }
      qBox.innerHTML = `<label class="lbl">Quantités exécutées cumulées (DQE)</label><div class="tbl-wrap" style="max-height:300px;box-shadow:none;border:1px solid var(--line)"><table class="tbl mini"><thead><tr><th>Désignation</th><th>U</th><th class="r">Marché</th><th class="r">Exécuté cumulé</th><th class="r">%</th><th class="r">Montant</th></tr></thead><tbody>
        ${L.map(l => { const q = U.num(quantites[l.id]); return `<tr><td>${U.esc(l.num ? l.num + ' · ' : '')}${U.esc(l.designation)}</td><td>${U.esc(l.unite)}</td><td class="r">${U.qty(l.qte)}</td><td class="r"><input type="number" step="any" data-l="${l.id}" value="${quantites[l.id] ?? ''}" style="width:90px"></td><td class="r">${l.qte ? Math.round(100 * q / l.qte) : 0} %</td><td class="r">${U.fmt(q * U.num(l.pu))}</td></tr>`; }).join('')}</tbody></table></div>`;
      const tot = () => L.reduce((t, l) => t + U.num(quantites[l.id]) * U.num(l.pu), 0);
      f.form.elements.cumulHT.value = Math.round(tot()); f.form.elements.cumulHT.readOnly = true;
      UI.$$('input[data-l]', qBox).forEach(i => i.onchange = () => { quantites[i.dataset.l] = i.value === '' ? '' : U.num(i.value); drawQ(); upd(); });
    };
    f.form.addEventListener('change', e => { if (e.target.name === 'marcheId') { quantites = {}; drawQ(); } });
    f.form.__q = () => quantites;
    setTimeout(drawQ, 0);
    const upd = () => { const v = f.read(); const d = decompte(Object.assign({}, s, v, { id: s.id })); prev.innerHTML = `<div class="calc"><span>Travaux de la période <b>${U.money(d.periode)}</b></span><span>Avancement financier <b>${U.fmt(d.pctCum, 1)} %</b></span><span>Retenue de garantie cumulée <b>${U.money(d.rg)}</b></span><span>Avance remboursée cumulée <b>${U.money(d.remb)}</b></span><span>Net à payer HT <b>${U.money(d.netHT)}</b></span><span>Net à payer TTC <b class="big">${U.money(d.ttc)}</b></span></div>`; };
    const prev = document.createElement('div'); prev.className = 'full'; f.form.appendChild(prev);
    f.form.addEventListener('input', upd); f.form.addEventListener('change', e => { if (e.target.name === 'marcheId' && !s.id) f.form.elements.num.value = nextNum(e.target.value); upd(); }); upd();
  }

  function printDecompte(s) {
    const d = decompte(s), e = APP.ent(d.m.entrepriseId) || {};
    const row = (l, v, b) => `<tr><td>${l}</td><td class="r">${b ? '<b>' : ''}${U.money(v)}${b ? '</b>' : ''}</td></tr>`;
    UI.printDoc(`Décompte provisoire n° ${s.num}`, `<table><tr><th>Entreprise</th><td>${U.esc(e.nom)} — ${U.esc(e.corpsEtat || '')}</td><th>Marché</th><td>${U.esc(d.m.reference || d.m.objet || '')}</td></tr>
      <tr><th>Période</th><td>${U.esc(s.periode || '')}</td><th>Facture</th><td>${U.esc(s.factureRef || '')} reçue le ${U.fr(s.dateReception)}</td></tr></table>
      <table><tr><th>Désignation</th><th class="r">Montant (FCFA)</th></tr>
      ${row('Montant du marché (avenants compris) HT', d.mt)}${row('Travaux cumulés à ce jour HT', d.cum, true)}${row('À déduire : travaux cumulés précédents', d.cumPrec)}${row('Travaux de la période HT', d.periode)}
      ${row(`Retenue de garantie cumulée (${U.num(d.m.retenuePct)} %)`, -d.rg)}${row('Remboursement de l\'avance (cumul)', -d.remb)}${row('Pénalités cumulées', -d.penCum)}
      ${row('Net à payer HT sur ce décompte', d.netHT, true)}${row(`TVA ${d.tauxTVA} %`, d.tva)}${row('NET À PAYER TTC', d.ttc, true)}</table>
      <p>Avancement financier : <b>${U.fmt(d.pctCum, 1)} %</b>. ${U.esc(s.observations || '')}</p>
      <div class="sig"><div>Vérifié par (maîtrise d'œuvre)</div><div>Validé par (maître d'ouvrage)</div><div>L'entreprise</div></div>`);
  }

  /** Prévision de trésorerie mensuelle : reste des marchés réparti selon le planning, situations à régler, commandes à livrer */
  function tresorerie(nMois = 9) {
    const P = APP.plan(), today = U.today();
    const m0 = new Date(U.parse(today).getFullYear(), U.parse(today).getMonth(), 1);
    const fin = [S.data.projet.dateFinContractuelle, P.finPrevue].filter(Boolean).sort().pop() || today;
    const months = []; let d = new Date(m0);
    while ((U.iso(d) <= fin || months.length < 3) && months.length < Math.max(nMois, 3) + 12) { months.push(U.iso(d).slice(0, 7)); d = new Date(d.getFullYear(), d.getMonth() + 1, 1); if (months.length >= 24) break; }
    const row = () => months.map(() => 0);
    const tra = row(), sit = row(), app = row();
    const idx = iso => { const k = iso.slice(0, 7); const i = months.indexOf(k); return i < 0 ? (k < months[0] ? 0 : months.length - 1) : i; };
    S.list('marches').forEach(m => {
      const tva = U.num(m.tva ?? S.data.projet.tva) / 100, lag = U.num(m.delaiPaiement || 30);
      const ss = S.list('situations').filter(x => x.marcheId === m.id && x.statut !== 'Rejetée').sort(U.by(x => U.num(x.num)));
      const cum = ss.length ? U.num(ss[ss.length - 1].cumulHT) : 0, reste = Math.max(0, montantMarche(m) - cum);
      ss.forEach(x => { const dd = decompte(x); const due = Math.max(0, dd.ttc - U.num(x.montantPaye)); if (due > 1) sit[idx(U.addDays(x.dateReception || today, lag) < today ? today : U.addDays(x.dateReception || today, lag))] += due; });
      if (reste <= 0) return;
      // répartition au prorata des jours ouvrés restants des tâches de l'entreprise
      const ts = S.list('taches').filter(t => t.entrepriseId === m.entrepriseId).map(t => P.R.get(t.id)).filter(r => r && r.etat !== 'Terminée');
      const w = row(); ts.forEach(r => { let x = r.prev.debut < today ? today : r.prev.debut; while (x <= r.prev.fin) { if (U.isWork(x)) w[idx(U.addDays(x, lag))]++; x = U.addDays(x, 1); } });
      const W = w.reduce((a, b) => a + b, 0);
      const net = reste * (1 + tva) * (1 - U.num(m.retenuePct) / 100);
      if (!W) tra[idx(U.addDays(today, lag))] += net; else w.forEach((v, i) => { tra[i] += net * v / W; });
    });
    S.list('commandes').forEach(c => { if (['Livrée', 'Annulée'].includes(c.statut)) return; const mt = (c.lignes || []).reduce((t, l) => t + (U.num(l.quantite) - U.num(l.recu)) * U.num(l.prixUnitaire), 0) * (1 + U.num(S.data.projet.tva) / 100); if (mt > 0) app[idx(c.livraisonPrevue || c.dateBesoin || today)] += mt; });
    let cumul = 0;
    return months.map((k, i) => { const total = tra[i] + sit[i] + app[i]; cumul += total; return { mois: k + '-01', travaux: tra[i], situations: sit[i], appro: app[i], total, cumul }; });
  }

  function editBudget(b = {}) {
    UI.form({ title: b.id ? 'Ligne budgétaire' : 'Nouvelle ligne budgétaire', value: b, fields: [
      { k: 'poste', label: 'Poste', required: true, full: true },
      { k: 'nature', label: 'Nature', type: 'select', options: ['Travaux (marché)', 'Approvisionnements', 'Honoraires & études', 'Frais de chantier', 'Imprévus', 'Autre'], required: true, default: 'Travaux (marché)' },
      { k: 'entrepriseId', label: 'Entreprise liée (travaux)', type: 'select', options: UI.opts(S.list('entreprises').sort(U.by('nom'))), hint: 'L\'engagé et le payé sont alors calculés depuis le marché et ses situations' },
      { k: 'prevu', label: 'Budget prévu HT (FCFA)', type: 'number', required: true },
      { k: 'engageManuel', label: 'Engagé HT (saisie libre, si non lié)', type: 'number' },
      { k: 'payeManuel', label: 'Payé (saisie libre, si non lié)', type: 'number' },
    ], onSave: v => S.save('budget', Object.assign({ id: b.id }, v), `Budget : ligne « ${v.poste} » enregistrée`), onDelete: b.id ? () => S.remove('budget', b.id, 'Budget : ligne supprimée') : null });
  }
  const budgetRow = b => {
    let eng = U.num(b.engageManuel), paye = U.num(b.payeManuel);
    if (b.entrepriseId) { const t = totaux(b.entrepriseId); eng = t.marches; paye = t.paye; }
    else if (b.nature === 'Approvisionnements' && b.engageManuel === '') { eng = S.list('commandes').filter(c => c.statut !== 'Annulée').reduce((s, c) => s + (c.lignes || []).reduce((x, l) => x + U.num(l.quantite) * U.num(l.prixUnitaire), 0), 0); }
    return { b, prevu: U.num(b.prevu), eng, paye, ecart: U.num(b.prevu) - eng };
  };

  function render(v) {
    v.innerHTML = `<div class="tabs">${[['syn', 'Synthèse'], ['mar', 'Marchés'], ['sit', 'Situations & décomptes'], ['tre', 'Trésorerie'], ['bud', 'Budget']].map(([k, l]) => `<button data-t="${k}" class="${st.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="fBody"></div>`;
    UI.$$('[data-t]', v).forEach(b => b.onclick = () => { st.tab = b.dataset.t; APP.refresh(); });
    const h = UI.$('#fBody', v);
    if (st.tab === 'syn') {
      const T = totaux();
      const rows = S.list('entreprises').map(e => ({ e, t: totaux(e.id) })).filter(r => r.t.marches || r.t.facture);
      h.innerHTML = `<div class="kpis">${UI.kpi('Montant des marchés', U.money(T.marches), 'avenants compris, HT')}${UI.kpi('Travaux exécutés', U.money(T.cumul), T.marches ? U.fmt(100 * T.cumul / T.marches, 1) + ' % des marchés' : '')}${UI.kpi('Facturé (TTC net)', U.money(T.facture))}${UI.kpi('Payé', U.money(T.paye), '', 'good')}${UI.kpi('Reste à payer', U.money(T.resteAPayer), 'situations reçues non réglées', T.resteAPayer ? 'warn' : '')}${UI.kpi('Reste à facturer', U.money(T.resteAFacturer), 'HT')}</div>
        <div class="toolbar"><button class="btn primary" id="xSit">+ Situation / facture</button><button class="btn" id="xMar">+ Marché</button><span class="sep"></span><button class="btn ghost" id="xXls">${APP.icon('download', 15)} Excel</button></div><div id="synT"></div>`;
      UI.table(UI.$('#synT', h), { id: 'syn', sortKey: 'nom', rows, empty: 'Aucun marché saisi. Commencez par enregistrer les marchés des entreprises (onglet Marchés).', cols: [
        { k: 'nom', label: 'Entreprise', sort: r => r.e.nom, render: r => `<b>${U.esc(r.e.nom)}</b> <small class="muted">${U.esc(r.e.corpsEtat || '')}</small>` },
        { k: 'mar', label: 'Marché HT', cls: 'r', sort: r => r.t.marches, render: r => U.money(r.t.marches), sum: rs => U.money(rs.reduce((s, r) => s + r.t.marches, 0)) },
        { k: 'cum', label: 'Exécuté HT', cls: 'r', sort: r => r.t.cumul, render: r => U.money(r.t.cumul), sum: rs => U.money(rs.reduce((s, r) => s + r.t.cumul, 0)) },
        { k: 'pct', label: 'Avancement financier', sort: r => r.t.marches ? r.t.cumul / r.t.marches : 0, render: r => UI.bar(r.t.marches ? 100 * r.t.cumul / r.t.marches : 0) },
        { k: 'fac', label: 'Facturé TTC', cls: 'r', sort: r => r.t.facture, render: r => U.money(r.t.facture), sum: rs => U.money(rs.reduce((s, r) => s + r.t.facture, 0)) },
        { k: 'pay', label: 'Payé', cls: 'r', sort: r => r.t.paye, render: r => U.money(r.t.paye), sum: rs => U.money(rs.reduce((s, r) => s + r.t.paye, 0)) },
        { k: 'rap', label: 'Reste à payer', cls: 'r', sort: r => r.t.resteAPayer, render: r => r.t.resteAPayer ? `<b>${U.money(r.t.resteAPayer)}</b>` : '—', sum: rs => U.money(rs.reduce((s, r) => s + r.t.resteAPayer, 0)) },
      ] });
      UI.$('#xSit', h).onclick = () => editSituation(); UI.$('#xMar', h).onclick = () => editMarche();
      UI.$('#xXls', h).onclick = () => UI.xlsx(`STRAM_Finances_${U.today()}.xlsx`, {
        'Synthèse': [['Entreprise', 'Corps d\'état', 'Marché HT', 'Exécuté HT', 'Facturé TTC', 'Payé', 'Reste à payer', 'Reste à facturer HT'], ...rows.map(r => [r.e.nom, r.e.corpsEtat, r.t.marches, r.t.cumul, Math.round(r.t.facture), r.t.paye, Math.round(r.t.resteAPayer), r.t.resteAFacturer])],
        'Situations': [['Entreprise', 'N°', 'Période', 'Reçue le', 'Cumul HT', 'Période HT', 'Retenue cumulée', 'Avance remboursée', 'Pénalités cumulées', 'Net HT', 'TVA', 'Net TTC', 'Statut', 'Payé', 'Payé le'], ...S.list('situations').map(s => { const d = decompte(s); return [APP.entNom(d.m.entrepriseId), s.num, s.periode, U.fr(s.dateReception), d.cum, d.periode, Math.round(d.rg), Math.round(d.remb), d.penCum, Math.round(d.netHT), Math.round(d.tva), Math.round(d.ttc), s.statut, U.num(s.montantPaye), U.fr(s.datePaiement)]; })],
        'Budget': [['Poste', 'Nature', 'Prévu HT', 'Engagé HT', 'Payé', 'Écart'], ...S.list('budget').map(budgetRow).map(r => [r.b.poste, r.b.nature, r.prevu, r.eng, r.paye, r.ecart])],
      });
    } else if (st.tab === 'mar') {
      h.innerHTML = `<div class="toolbar"><button class="btn primary" id="mAdd">+ Marché</button></div><div id="mT"></div>`;
      UI.$('#mAdd', h).onclick = () => editMarche();
      UI.table(UI.$('#mT', h), { id: 'mar', sortKey: 'ent', rows: S.list('marches'), onRow: editMarche, empty: 'Aucun marché. Ajoutez le marché de chaque entreprise pour suivre ses situations et paiements.', cols: [
        { k: 'ent', label: 'Entreprise', sort: m => APP.entNom(m.entrepriseId), render: m => `<b>${U.esc(APP.entNom(m.entrepriseId))}</b>` },
        { k: 'reference', label: 'Référence' }, { k: 'objet', label: 'Objet' },
        { k: 'montantHT', label: 'Initial HT', cls: 'r', render: m => U.money(m.montantHT), sum: rs => U.money(rs.reduce((s, m) => s + U.num(m.montantHT), 0)) },
        { k: 'av', label: 'Avenants', cls: 'r', sort: m => montantMarche(m) - U.num(m.montantHT), render: m => (m.avenants || []).length ? U.money(montantMarche(m) - U.num(m.montantHT)) : '' },
        { k: 'tot', label: 'Total HT', cls: 'r', sort: montantMarche, render: m => `<b>${U.money(montantMarche(m))}</b>`, sum: rs => U.money(rs.reduce((s, m) => s + montantMarche(m), 0)) },
        { k: 'retenuePct', label: 'RG %', cls: 'r' }, { k: 'avancePct', label: 'Avance %', cls: 'r' },
      ] });
    } else if (st.tab === 'sit') {
      h.innerHTML = `<div class="toolbar"><button class="btn primary" id="sAdd">+ Situation / facture</button><span class="sep"></span><select id="sEnt"><option value="">Toutes les entreprises</option>${S.list('marches').map(m => m.entrepriseId).filter((x, i, a) => a.indexOf(x) === i).map(id => `<option value="${id}" ${st.ent === id ? 'selected' : ''}>${U.esc(APP.entNom(id))}</option>`).join('')}</select>
        <select id="sSt"><option value="">Tous statuts</option>${SST.map(s => `<option ${st.statut === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div><div id="sT"></div>`;
      UI.$('#sAdd', h).onclick = () => editSituation();
      UI.$('#sEnt', h).onchange = e => { st.ent = e.target.value; APP.refresh(); }; UI.$('#sSt', h).onchange = e => { st.statut = e.target.value; APP.refresh(); };
      const rows = S.list('situations').map(s => ({ s, d: decompte(s) })).filter(r => (!st.ent || r.d.m.entrepriseId === st.ent) && (!st.statut || r.s.statut === st.statut));
      UI.table(UI.$('#sT', h), { id: 'sit', sortKey: 'date', sortDir: -1, rows, onRow: r => editSituation(r.s), empty: 'Aucune situation enregistrée.',
        rowCls: r => ['Reçue', 'Vérifiée', 'Validée'].includes(r.s.statut) && U.diffDays(r.s.dateReception, U.today()) > 30 ? 'row-late' : '', cols: [
        { k: 'ent', label: 'Entreprise', sort: r => APP.entNom(r.d.m.entrepriseId), render: r => `<b>${U.esc(APP.entNom(r.d.m.entrepriseId))}</b>` },
        { k: 'num', label: 'N°', cls: 'r', sort: r => U.num(r.s.num), render: r => r.s.num }, { k: 'per', label: 'Période', sort: r => r.s.periode, render: r => U.esc(r.s.periode || '') },
        { k: 'date', label: 'Reçue le', sort: r => r.s.dateReception, render: r => U.fr(r.s.dateReception) },
        { k: 'cum', label: 'Cumul HT', cls: 'r', sort: r => r.d.cum, render: r => U.money(r.d.cum) },
        { k: 'pct', label: '% marché', cls: 'r', sort: r => r.d.pctCum, render: r => U.fmt(r.d.pctCum, 1) + ' %' },
        { k: 'ttc', label: 'Net TTC', cls: 'r', sort: r => r.d.ttc, render: r => `<b>${U.money(r.d.ttc)}</b>`, sum: rs => U.money(rs.filter(r => r.s.statut !== 'Rejetée').reduce((s, r) => s + r.d.ttc, 0)) },
        { k: 'paye', label: 'Payé', cls: 'r', sort: r => U.num(r.s.montantPaye), render: r => r.s.montantPaye ? U.money(r.s.montantPaye) : '', sum: rs => U.money(rs.reduce((s, r) => s + U.num(r.s.montantPaye), 0)) },
        { k: 'st', label: 'Statut', sort: r => r.s.statut, render: r => UI.badge(r.s.statut, SC[r.s.statut]) },
        { k: 'pr', label: '', nosort: true, render: r => `<button class="btn xs ghost" data-pd="${r.s.id}">${APP.icon('print', 15)} Décompte</button>` },
      ] });
      UI.$$('[data-pd]', h).forEach(b => b.onclick = () => printDecompte(S.get('situations', b.dataset.pd)));
    } else if (st.tab === 'tre') {
      const T = tresorerie(), mx = Math.max(1, ...T.map(r => r.total));
      const W = 900, H = 220, bw = W / T.length;
      h.innerHTML = `<div class="card"><h3>Besoins de trésorerie prévisionnels (TTC)</h3>
        <svg viewBox="0 -14 ${W} ${H + 40}" class="chart">${T.map((r, i) => { const hh = r.total / mx * H; return `<g><rect x="${i * bw + 5}" y="${H - hh}" width="${bw - 10}" height="${Math.max(1, hh)}" rx="6" class="${i === 0 ? 'cur' : 'fut'}"><title>${U.moisAn(r.mois)} : ${U.money(r.total)}</title></rect>${r.total ? `<text x="${i * bw + bw / 2}" y="${H - hh - 5}" class="v">${U.fmt(r.total / 1e6, 1)} M</text>` : ''}<text x="${i * bw + bw / 2}" y="${H + 15}">${U.moisAn(r.mois)}</text></g>`; }).join('')}</svg>
        <p class="muted small">Montants en millions de FCFA. Travaux : reste de chaque marché (TTC, retenue de garantie déduite) réparti selon les jours ouvrés restants de l'entreprise au planning, décalé du délai de paiement. Situations : décomptes reçus non réglés. Approvisionnements : commandes non livrées, payées à la livraison.</p></div><div id="tT"></div>`;
      UI.table(UI.$('#tT', h), { id: 'tre', rows: T, cols: [
        { k: 'mois', label: 'Mois', render: r => `<b>${U.moisAn(r.mois)}</b>`, nosort: true },
        { k: 'travaux', label: 'Travaux (marchés)', cls: 'r', render: r => U.money(r.travaux), sum: rs => U.money(rs.reduce((t, r) => t + r.travaux, 0)), nosort: true },
        { k: 'situations', label: 'Situations à régler', cls: 'r', render: r => U.money(r.situations), sum: rs => U.money(rs.reduce((t, r) => t + r.situations, 0)), nosort: true },
        { k: 'appro', label: 'Approvisionnements', cls: 'r', render: r => U.money(r.appro), sum: rs => U.money(rs.reduce((t, r) => t + r.appro, 0)), nosort: true },
        { k: 'total', label: 'Total du mois', cls: 'r', render: r => `<b>${U.money(r.total)}</b>`, sum: rs => U.money(rs.reduce((t, r) => t + r.total, 0)), nosort: true },
        { k: 'cumul', label: 'Cumul', cls: 'r', render: r => U.money(r.cumul), nosort: true }] });
      if (!S.list('marches').length) h.insertAdjacentHTML('afterbegin', '<div class="banner">Saisissez les marchés des entreprises (onglet Marchés) pour obtenir la prévision des paiements de travaux.</div>');
    } else {
      const rows = S.list('budget').map(budgetRow);
      const P = rows.reduce((s, r) => s + r.prevu, 0), Eg = rows.reduce((s, r) => s + r.eng, 0), Py = rows.reduce((s, r) => s + r.paye, 0);
      h.innerHTML = `<div class="kpis">${UI.kpi('Budget prévu', U.money(P), 'HT')}${UI.kpi('Engagé', U.money(Eg), P ? U.fmt(100 * Eg / P, 1) + ' % du budget' : '', Eg > P ? 'bad' : '')}${UI.kpi('Payé', U.money(Py), '', 'good')}${UI.kpi('Disponible', U.money(P - Eg), '', P - Eg < 0 ? 'bad' : 'good')}</div>
        <div class="toolbar"><button class="btn primary" id="bAdd">+ Ligne budgétaire</button><button class="btn" id="bGen">Créer une ligne par entreprise</button></div><div id="bT"></div>`;
      UI.$('#bAdd', h).onclick = () => editBudget();
      UI.$('#bGen', h).onclick = () => { let n = 0; S.list('entreprises').forEach(e => { if (!S.list('budget').some(b => b.entrepriseId === e.id)) { S.data.budget.push({ id: U.uid(), cree: new Date().toISOString(), maj: new Date().toISOString(), poste: `${e.corpsEtat || e.lot} — ${e.nom}`, nature: 'Travaux (marché)', entrepriseId: e.id, prevu: 0, engageManuel: '', payeManuel: '' }); n++; } }); S.log(`Budget : ${n} ligne(s) créées`); S.persist(); APP.refresh(); UI.toast(`${n} ligne(s) créée(s) : saisissez les montants prévus`); };
      UI.table(UI.$('#bT', h), { id: 'bud', sortKey: 'poste', rows, onRow: r => editBudget(r.b), empty: 'Aucune ligne budgétaire.', rowCls: r => r.ecart < 0 ? 'row-late' : '', cols: [
        { k: 'poste', label: 'Poste', sort: r => r.b.poste, render: r => `<b>${U.esc(r.b.poste)}</b>` }, { k: 'nat', label: 'Nature', sort: r => r.b.nature, render: r => U.esc(r.b.nature) },
        { k: 'prevu', label: 'Prévu HT', cls: 'r', render: r => U.money(r.prevu), sum: rs => U.money(rs.reduce((s, r) => s + r.prevu, 0)) },
        { k: 'eng', label: 'Engagé HT', cls: 'r', render: r => U.money(r.eng), sum: rs => U.money(rs.reduce((s, r) => s + r.eng, 0)) },
        { k: 'consom', label: 'Consommation', nosort: true, render: r => UI.bar(r.prevu ? 100 * r.eng / r.prevu : 0, r.eng > r.prevu ? 'bad' : '') },
        { k: 'paye', label: 'Payé', cls: 'r', render: r => U.money(r.paye), sum: rs => U.money(rs.reduce((s, r) => s + r.paye, 0)) },
        { k: 'ecart', label: 'Écart (prévu − engagé)', cls: 'r', render: r => `<span class="${r.ecart < 0 ? 'neg' : ''}">${U.money(r.ecart)}</span>`, sum: rs => U.money(rs.reduce((s, r) => s + r.ecart, 0)) },
      ] });
    }
  }

  APP.mod('finances', { title: 'Marchés & décomptes', short: 'Finances', icon: '₣', group: 'Finances', sub: 'Facturation des prestataires, paiements et budget', render,
    badge: () => S.list('situations').filter(s => ['Reçue', 'Vérifiée', 'Validée'].includes(s.statut)).length });
  return { totaux, decompte, montantMarche, tresorerie };
})();
