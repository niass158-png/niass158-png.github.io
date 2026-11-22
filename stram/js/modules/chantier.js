/* STRAM Suivi — Journal de chantier, réunions (PV et actions) et réserves */
'use strict';
(() => {
  const st = { tab: 'jour', act: 'ouvertes', res: 'ouvertes', ent: '' };
  const ASC = { 'À faire': 'b-amber', 'En cours': 'b-blue', 'Soldée': 'b-green' };
  const RSC = { 'Ouverte': 'b-red', 'En cours': 'b-amber', 'Levée': 'b-green' };

  function editJour(j = {}) {
    UI.form({ title: j.id ? `Journal du ${U.fr(j.date)}` : 'Nouvelle entrée du journal', wide: true, value: j, fields: [
      { k: 'date', label: 'Date', type: 'date', required: true, default: U.today() },
      { k: 'meteo', label: 'Météo', type: 'select', options: ['Ensoleillé', 'Nuageux', 'Vent fort', 'Pluie', 'Forte chaleur', 'Poussière / harmattan'] },
      { k: 'effectif', label: 'Effectif total sur site', type: 'number' },
      { k: 'entreprises', label: 'Entreprises présentes', placeholder: 'ex. NIANG (6), NDIAGA (4)…' },
      { k: 'travaux', label: 'Travaux réalisés', type: 'textarea', full: true, rows: 4 },
      { k: 'livraisons', label: 'Livraisons / approvisionnements', type: 'textarea', full: true, rows: 2 },
      { k: 'incidents', label: 'Incidents, sécurité, arrêts', type: 'textarea', full: true, rows: 2 },
      { k: 'visiteurs', label: 'Visites (MOA, BCT, concessionnaires…)', full: true },
      { k: 'redacteur', label: 'Rédigé par' },
    ], extra: j.id ? (() => { const d = document.createElement('div'); d.innerHTML = '<label class="lbl">Photos du jour</label>'; d.appendChild(UIX.gallery('journal', j.id, { legende: 'Journal du ' + U.fr(j.date) })); return d; })() : null,
    onSave: v => { S.save('journal', Object.assign({ id: j.id }, v), `Journal de chantier du ${U.fr(v.date)} enregistré`); UI.toast('Journal enregistré'); },
    onDelete: j.id ? () => S.remove('journal', j.id, `Journal du ${U.fr(j.date)} supprimé`) : null });
  }

  function editReunion(r = {}) {
    const acts = S.list('actions').filter(a => a.reunionId && a.reunionId === r.id).map(a => ({ ...a })); const removed = [];
    const box = document.createElement('div');
    const draw = () => {
      box.innerHTML = `<label class="lbl">Actions décidées</label><table class="tbl mini"><thead><tr><th>Action</th><th>Responsable</th><th>Échéance</th><th>Statut</th><th></th></tr></thead><tbody>
        ${acts.map((a, i) => `<tr><td><input data-i="${i}" data-f="description" value="${U.esc(a.description || '')}"></td><td><input data-i="${i}" data-f="responsable" value="${U.esc(a.responsable || '')}" list="respL"></td>
        <td><input type="date" data-i="${i}" data-f="echeance" value="${a.echeance || ''}"></td><td><select data-i="${i}" data-f="statut">${Object.keys(ASC).map(s => `<option ${a.statut === s ? 'selected' : ''}>${s}</option>`).join('')}</select></td><td><button type="button" class="icon-btn" data-x="${i}">✕</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Aucune action</td></tr>'}</tbody></table>
        <datalist id="respL">${[...S.list('entreprises').map(e => e.nom), ...S.list('habilites').map(h => h.nom)].map(n => `<option value="${U.esc(n)}">`).join('')}</datalist>
        <button type="button" class="btn sm ghost" id="aAdd">+ Action</button>`;
      UI.$$('[data-f]', box).forEach(el => el.onchange = () => { acts[+el.dataset.i][el.dataset.f] = el.value; });
      UI.$$('[data-x]', box).forEach(b => b.onclick = () => { const a = acts.splice(+b.dataset.x, 1)[0]; if (a.id) removed.push(a.id); draw(); });
      UI.$('#aAdd', box).onclick = () => { acts.push({ description: '', responsable: '', echeance: U.addDays(U.today(), 7), statut: 'À faire' }); draw(); };
    };
    draw();
    UI.form({ title: r.id ? `Réunion du ${U.fr(r.date)}` : 'Nouvelle réunion / PV', wide: true, value: r, extra: box, fields: [
      { k: 'date', label: 'Date', type: 'date', required: true, default: U.today() },
      { k: 'type', label: 'Type', type: 'select', options: ['Réunion de chantier hebdomadaire', 'Réunion maître d\'ouvrage', 'Visite du bureau de contrôle', 'Réunion de coordination', 'Réception / pré-réception', 'Autre'], required: true, default: 'Réunion de chantier hebdomadaire' },
      { k: 'num', label: 'N° de PV', default: APP.nextNum('reunions', 'PV-') },
      { k: 'lieu', label: 'Lieu', default: 'Bureau de chantier' },
      { k: 'participants', label: 'Participants', type: 'textarea', full: true, rows: 2 },
      { k: 'objet', label: 'Ordre du jour / objet', full: true },
      { k: 'compteRendu', label: 'Points abordés et décisions', type: 'textarea', full: true, rows: 6 },
      { k: 'prochaine', label: 'Prochaine réunion', type: 'date', default: U.addDays(U.today(), 7) },
    ], onSave: v => {
      const rr = S.save('reunions', Object.assign({ id: r.id }, v), `Réunion du ${U.fr(v.date)} enregistrée`);
      removed.forEach(id => S.remove('actions', id)); acts.forEach(a => { if (!a.description) return; S.save('actions', Object.assign({ ...a }, { reunionId: rr.id, origine: `${v.num || 'PV'} du ${U.fr(v.date)}` })); });
      UI.toast('PV et actions enregistrés');
    }, onDelete: r.id ? () => { S.list('actions').filter(a => a.reunionId === r.id).forEach(a => S.remove('actions', a.id)); S.remove('reunions', r.id, 'Réunion supprimée'); } : null });
  }

  function printPV(r) {
    const acts = S.list('actions').filter(a => a.reunionId === r.id);
    UI.printDoc(`Procès-verbal ${r.num || ''} — ${r.type}`, `<table><tr><th>Date</th><td>${U.fr(r.date)}</td><th>Lieu</th><td>${U.esc(r.lieu || '')}</td></tr><tr><th>Participants</th><td colspan="3">${U.esc(r.participants || '').replace(/\n/g, '<br>')}</td></tr><tr><th>Objet</th><td colspan="3">${U.esc(r.objet || '')}</td></tr></table>
      <h3>Points abordés et décisions</h3><p>${U.esc(r.compteRendu || '').replace(/\n/g, '<br>')}</p>
      <h3>Actions à mener</h3><table><tr><th>Action</th><th>Responsable</th><th>Échéance</th><th>Statut</th></tr>${acts.map(a => `<tr><td>${U.esc(a.description)}</td><td>${U.esc(a.responsable)}</td><td>${U.fr(a.echeance)}</td><td>${a.statut}</td></tr>`).join('') || '<tr><td colspan="4">—</td></tr>'}</table>
      <p>Prochaine réunion : <b>${U.fr(r.prochaine) || 'à définir'}</b></p><div class="sig"><div>Rédacteur</div><div>Maître d'ouvrage</div></div>`);
  }

  function editAction(a = {}) {
    UI.form({ title: a.id ? 'Action' : 'Nouvelle action', value: a, fields: [
      { k: 'description', label: 'Action', required: true, full: true }, { k: 'responsable', label: 'Responsable', type: 'datalist', options: S.list('entreprises').map(e => e.nom) },
      { k: 'echeance', label: 'Échéance', type: 'date' }, { k: 'statut', label: 'Statut', type: 'select', options: Object.keys(ASC), required: true, default: 'À faire' },
      { k: 'origine', label: 'Origine', placeholder: 'ex. PV-0003, visite BCT…' }, { k: 'commentaire', label: 'Commentaire', type: 'textarea', full: true, rows: 2 },
    ], onSave: v => { if (v.statut === 'Soldée' && !a.dateSolde) v.dateSolde = U.today(); S.save('actions', Object.assign({ id: a.id }, v), `Action « ${v.description} » : ${v.statut}`); }, onDelete: a.id ? () => S.remove('actions', a.id, 'Action supprimée') : null });
  }
  function editReserve(r = {}) {
    UI.form({ title: r.id ? 'Réserve' : 'Nouvelle réserve', wide: true, value: r, fields: [
      { k: 'num', label: 'N°', default: APP.nextNum('reserves', 'R-') }, { k: 'zone', label: 'Zone / local', type: 'datalist', options: [...new Set([...S.list('reserves').map(x => x.zone), ...S.list('taches').map(t => t.zone)].filter(Boolean))], required: true },
      { k: 'entrepriseId', label: 'Entreprise concernée', type: 'select', options: UI.opts(S.list('entreprises').sort(U.by('nom'))), required: true },
      { k: 'origine', label: 'Origine', type: 'select', options: ['Visite de chantier', 'Bureau de contrôle', 'Pré-réception', 'Réception', 'Maître d\'ouvrage'] },
      { k: 'description', label: 'Description de la réserve', type: 'textarea', full: true, rows: 3, required: true },
      { k: 'dateConstat', label: 'Constatée le', type: 'date', default: U.today() }, { k: 'echeance', label: 'À lever avant le', type: 'date', default: U.addDays(U.today(), 14) },
      { k: 'statut', label: 'Statut', type: 'select', options: Object.keys(RSC), required: true, default: 'Ouverte' }, { k: 'dateLevee', label: 'Levée le', type: 'date' },
    ], extra: r.id ? (() => { const d = document.createElement('div'); d.innerHTML = '<label class="lbl">Photos de la réserve</label>'; d.appendChild(UIX.gallery('reserves', r.id, { legende: 'Réserve ' + (r.num || '') })); return d; })() : null,
    onSave: v => { if (v.statut === 'Levée' && !v.dateLevee) v.dateLevee = U.today(); S.save('reserves', Object.assign({ id: r.id }, v), `Réserve ${v.num} (${APP.entNom(v.entrepriseId)}) : ${v.statut}`); }, onDelete: r.id ? () => S.remove('reserves', r.id, `Réserve ${r.num} supprimée`) : null });
  }

  function render(v) {
    v.innerHTML = `<div class="tabs">${[['jour', 'Journal de chantier'], ['reu', 'Réunions & PV'], ['act', 'Actions'], ['res', 'Réserves']].map(([k, l]) => `<button data-t="${k}" class="${st.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="cBody"></div>`;
    UI.$$('[data-t]', v).forEach(b => b.onclick = () => { st.tab = b.dataset.t; APP.refresh(); });
    const h = UI.$('#cBody', v);
    if (st.tab === 'jour') {
      h.innerHTML = `<div class="toolbar"><button class="btn primary" id="jAdd">+ Journal du jour</button><span class="sep"></span><button class="btn ghost" id="jXls">${APP.icon('download', 15)} Excel</button></div><div id="jT"></div>`;
      UI.$('#jAdd', h).onclick = () => editJour(S.list('journal').find(j => j.date === U.today()) || {});
      UI.table(UI.$('#jT', h), { id: 'jour', sortKey: 'date', sortDir: -1, rows: S.list('journal'), onRow: editJour, empty: 'Aucune entrée. Tenez le journal chaque jour : effectifs, travaux, livraisons, incidents.', cols: [
        { k: 'date', label: 'Date', render: j => `<b>${U.fr(j.date)}</b>` }, { k: 'meteo', label: 'Météo' }, { k: 'effectif', label: 'Effectif', cls: 'r' },
        { k: 'travaux', label: 'Travaux réalisés', nosort: true, render: j => U.esc((j.travaux || '').slice(0, 140)) }, { k: 'incidents', label: 'Incidents', nosort: true, render: j => j.incidents ? UI.badge('Oui', 'b-red') + ' ' + U.esc(j.incidents.slice(0, 60)) : '' },
      ] });
      UI.$('#jXls', h).onclick = () => UI.xlsx(`STRAM_Journal_${U.today()}.xlsx`, { Journal: [['Date', 'Météo', 'Effectif', 'Entreprises', 'Travaux', 'Livraisons', 'Incidents', 'Visites', 'Rédigé par'], ...S.list('journal').sort(U.by('date')).map(j => [U.fr(j.date), j.meteo, j.effectif, j.entreprises, j.travaux, j.livraisons, j.incidents, j.visiteurs, j.redacteur])] });
    } else if (st.tab === 'reu') {
      h.innerHTML = `<div class="toolbar"><button class="btn primary" id="rAdd">+ Réunion / PV</button></div><div id="rT"></div>`;
      UI.$('#rAdd', h).onclick = () => editReunion();
      UI.table(UI.$('#rT', h), { id: 'reu', sortKey: 'date', sortDir: -1, rows: S.list('reunions'), onRow: editReunion, empty: 'Aucune réunion enregistrée.', cols: [
        { k: 'date', label: 'Date', render: r => `<b>${U.fr(r.date)}</b>` }, { k: 'num', label: 'N° PV' }, { k: 'type', label: 'Type' }, { k: 'objet', label: 'Objet' },
        { k: 'na', label: 'Actions ouvertes', cls: 'r', sort: r => S.list('actions').filter(a => a.reunionId === r.id && a.statut !== 'Soldée').length, render: r => S.list('actions').filter(a => a.reunionId === r.id && a.statut !== 'Soldée').length || '' },
        { k: 'prochaine', label: 'Prochaine', render: r => U.fr(r.prochaine) },
        { k: 'pr', label: '', nosort: true, render: r => `<button class="btn xs ghost" data-pv="${r.id}">${APP.icon('print', 15)} PV</button>` }] });
      UI.$$('[data-pv]', h).forEach(b => b.onclick = () => printPV(S.get('reunions', b.dataset.pv)));
    } else if (st.tab === 'act') {
      h.innerHTML = `<div class="toolbar"><button class="btn primary" id="aNew">+ Action</button><span class="sep"></span><div class="seg">${[['ouvertes', 'Ouvertes'], ['echues', 'Échues'], ['toutes', 'Toutes']].map(([k, l]) => `<button data-a="${k}" class="${st.act === k ? 'on' : ''}">${l}</button>`).join('')}</div></div><div id="aT"></div>`;
      UI.$('#aNew', h).onclick = () => editAction();
      UI.$$('[data-a]', h).forEach(b => b.onclick = () => { st.act = b.dataset.a; APP.refresh(); });
      const rows = S.list('actions').filter(a => st.act === 'toutes' || (st.act === 'ouvertes' ? a.statut !== 'Soldée' : a.statut !== 'Soldée' && a.echeance && a.echeance < U.today()));
      UI.table(UI.$('#aT', h), { id: 'act', sortKey: 'echeance', rows, onRow: editAction, empty: 'Aucune action.', rowCls: a => a.statut !== 'Soldée' && a.echeance && a.echeance < U.today() ? 'row-late' : '', cols: [
        { k: 'description', label: 'Action', render: a => `<b>${U.esc(a.description)}</b>` }, { k: 'responsable', label: 'Responsable' }, { k: 'echeance', label: 'Échéance', render: a => U.fr(a.echeance) },
        { k: 'statut', label: 'Statut', render: a => UI.badge(a.statut, ASC[a.statut]) }, { k: 'origine', label: 'Origine' },
        { k: 'ok', label: '', nosort: true, render: a => a.statut !== 'Soldée' ? `<button class="btn xs" data-ok="${a.id}">✓ Solder</button>` : '' }] });
      UI.$$('[data-ok]', h).forEach(b => b.onclick = () => S.save('actions', { id: b.dataset.ok, statut: 'Soldée', dateSolde: U.today() }, 'Action soldée'));
    } else {
      h.innerHTML = `<div class="toolbar"><button class="btn primary" id="resAdd">+ Réserve</button><span class="sep"></span><div class="seg">${[['ouvertes', 'Non levées'], ['toutes', 'Toutes']].map(([k, l]) => `<button data-r="${k}" class="${st.res === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <select id="resEnt"><option value="">Toutes les entreprises</option>${S.list('entreprises').sort(U.by('nom')).map(e => `<option value="${e.id}" ${st.ent === e.id ? 'selected' : ''}>${U.esc(e.nom)}</option>`).join('')}</select><span class="sep"></span><button class="btn ghost" id="resPr">${APP.icon('print', 15)} Liste par entreprise</button></div><div id="resT"></div>`;
      UI.$('#resAdd', h).onclick = () => editReserve();
      UI.$$('[data-r]', h).forEach(b => b.onclick = () => { st.res = b.dataset.r; APP.refresh(); });
      UI.$('#resEnt', h).onchange = e => { st.ent = e.target.value; APP.refresh(); };
      const rows = S.list('reserves').filter(r => (st.res === 'toutes' || r.statut !== 'Levée') && (!st.ent || r.entrepriseId === st.ent));
      UI.table(UI.$('#resT', h), { id: 'res', sortKey: 'num', rows, onRow: editReserve, empty: 'Aucune réserve.', rowCls: r => r.statut !== 'Levée' && r.echeance && r.echeance < U.today() ? 'row-late' : '', cols: [
        { k: 'num', label: 'N°' }, { k: 'zone', label: 'Zone' }, { k: 'ent', label: 'Entreprise', sort: r => APP.entNom(r.entrepriseId), render: r => U.esc(APP.entNom(r.entrepriseId)) },
        { k: 'description', label: 'Description', render: r => U.esc(r.description) }, { k: 'dateConstat', label: 'Constatée', render: r => U.fr(r.dateConstat) },
        { k: 'echeance', label: 'Échéance', render: r => U.fr(r.echeance) }, { k: 'statut', label: 'Statut', render: r => UI.badge(r.statut, RSC[r.statut]) }] });
      UI.$('#resPr', h).onclick = () => { const by = {}; rows.forEach(r => (by[r.entrepriseId] = by[r.entrepriseId] || []).push(r));
        UI.printDoc('Liste des réserves non levées', Object.entries(by).map(([id, rs]) => `<h3>${U.esc(APP.entNom(id))} (${rs.length})</h3><table><tr><th>N°</th><th>Zone</th><th>Description</th><th>Échéance</th><th>Statut</th></tr>${rs.map(r => `<tr><td>${U.esc(r.num)}</td><td>${U.esc(r.zone)}</td><td>${U.esc(r.description)}</td><td>${U.fr(r.echeance)}</td><td>${r.statut}</td></tr>`).join('')}</table>`).join('') || '<p>Aucune réserve.</p>'); };
    }
  }

  APP.mod('chantier', { title: 'Journal & réunions', short: 'Journal', icon: '✎', group: 'Chantier', mobile: true, sub: 'Journal de chantier, PV de réunions, actions et réserves', render,
    badge: () => S.list('actions').filter(a => a.statut !== 'Soldée' && a.echeance && a.echeance < U.today()).length + S.list('reserves').filter(r => r.statut !== 'Levée' && r.echeance && r.echeance < U.today()).length });
})();
