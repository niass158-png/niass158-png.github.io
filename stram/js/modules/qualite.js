/* STRAM Suivi — Qualité : plans et visas, essais et contrôles, autocontrôles, préparation de la réception */
'use strict';
(() => {
  const st = { tab: 'plans', statut: '' };
  const E = U.esc;
  const PSC = { 'À viser': 'b-amber', 'Visé': 'b-green', 'Visé avec observations': 'b-blue', 'Refusé': 'b-red' };
  const RSC = { 'Conforme': 'b-green', 'Non conforme': 'b-red', 'En attente': 'b-amber' };
  const ZONES = ['RDC', 'Étage 1', 'Étage 2', 'Étage 3', 'Étage 4', 'Étage 5', 'Étage 6', 'Triplex', 'Parties communes', 'Façade', 'Toiture / terrasse', 'Local technique'];
  const CHECK = {
    plomb: ['Essais d\'étanchéité / pression réalisés', 'Pentes d\'évacuation conformes', 'Fixations et colliers en place', 'Robinetterie posée et fonctionnelle', 'Siphons et regards accessibles'],
    elec: ['Sections conformes aux plans', 'Repérage des circuits au tableau', 'Appareillages fixés et alignés', 'Essais des différentiels', 'Mesure de la prise de terre'],
    plafond: ['Planéité des plafonds', 'Joints traités et poncés', 'Trappes de visite en place', 'Réservations des spots conformes'],
    carrel: ['Planéité et absence de désaffleurs', 'Joints réguliers', 'Calepinage respecté', 'Sonnage : pas de carreaux creux', 'Plinthes posées'],
    peint: ['Support préparé (enduit, ponçage)', 'Teinte conforme', 'Nombre de couches respecté', 'Absence de coulures et reprises'],
    etanch: ['Relevés conformes', 'Essai à l\'eau 48 h concluant', 'Protection de l\'étanchéité en place'],
    menuis: ['Aplomb et niveau', 'Fonctionnement des ouvrants', 'Étanchéité périphérique', 'Quincaillerie complète'],
    clim: ['Supports et fixations des unités', 'Évacuation des condensats testée', 'Mise en service et essais', 'Isolation des liaisons'],
    gen: ['Conformité aux plans visés', 'Propreté de la zone', 'Protection des ouvrages voisins', 'Sécurité des intervenants'],
  };
  const tplFor = e => { const k = U.norm((e?.corpsEtat || '') + ' ' + (e?.lot || '')); return k.includes('plomb') ? 'plomb' : k.includes('electr') ? 'elec' : k.includes('plafond') ? 'plafond' : k.includes('carrel') ? 'carrel' : k.includes('peint') ? 'peint' : k.includes('etanch') ? 'etanch' : k.includes('menuis') ? 'menuis' : k.includes('clim') ? 'clim' : 'gen'; };

  /* ---------- fichiers joints (plans, PV) ---------- */
  function attach(onDone) {
    UI.pickFile('.pdf,.png,.jpg,.jpeg,.dwg,.docx,.xlsx', null);
  }
  function pickFichier(cb) {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.pdf,.png,.jpg,.jpeg,.dwg,.docx,.xlsx';
    i.onchange = () => { const f = i.files[0]; if (!f) return; if (f.size > 8 * 1024 * 1024) { UI.toast('Fichier trop volumineux (8 Mo maximum)', 'err'); return; }
      const r = new FileReader(); r.onload = () => { const x = S.save('fichiers', { nom: f.name, type: f.type, taille: f.size, data: r.result }); cb(x); }; r.readAsDataURL(f); };
    i.click();
  }
  function openFichier(id) {
    const f = S.get('fichiers', id); if (!f) return;
    fetch(f.data).then(r => r.blob()).then(b => UI.download(f.nom, b));
  }

  function editPlan(x = {}) {
    let fid = x.fichierId || '';
    const box = document.createElement('div');
    const draw = () => { const f = fid ? S.get('fichiers', fid) : null; box.innerHTML = `<label class="lbl">Fichier du plan</label><div class="btnrow">${f ? `<button type="button" class="btn sm" id="fOpen">${APP.icon('download', 14)} ${E(f.nom)} (${Math.round(f.taille / 1024)} Ko)</button>` : '<span class="muted small">Aucun fichier joint</span>'}<button type="button" class="btn sm ghost" id="fAdd">${APP.icon('upload', 14)} Joindre</button></div>`;
      if (UI.$('#fOpen', box)) UI.$('#fOpen', box).onclick = () => openFichier(fid); UI.$('#fAdd', box).onclick = () => pickFichier(f2 => { fid = f2.id; draw(); }); };
    draw();
    UI.form({ title: x.id ? `Plan ${x.ref || ''}` : 'Nouveau plan à viser', wide: true, value: x, extra: box, fields: [
      { k: 'ref', label: 'Référence', required: true }, { k: 'indice', label: 'Indice', default: 'A' },
      { k: 'titre', label: 'Titre', required: true, full: true },
      { k: 'entrepriseId', label: 'Émis par (entreprise / BET)', type: 'select', options: UI.opts(S.list('entreprises').sort(U.by('nom'))) },
      { k: 'dateRecu', label: 'Reçu le', type: 'date', default: U.today() },
      { k: 'statut', label: 'Statut', type: 'select', options: Object.keys(PSC), required: true, default: 'À viser' },
      { k: 'visePar', label: 'Visé par' }, { k: 'dateVisa', label: 'Date du visa', type: 'date' },
      { k: 'observations', label: 'Observations', type: 'textarea', full: true, rows: 2 },
    ], onSave: v => { if (v.statut !== 'À viser' && !v.dateVisa) v.dateVisa = U.today(); S.save('plans', Object.assign({ id: x.id }, v, { fichierId: fid }), `Plan ${v.ref} ind. ${v.indice} : ${v.statut}`); }, onDelete: x.id ? () => S.remove('plans', x.id, `Plan ${x.ref} supprimé`) : null });
  }
  function editEssai(x = {}) {
    let fid = x.fichierId || '';
    const box = document.createElement('div');
    const draw = () => { box.innerHTML = ''; const f = fid ? S.get('fichiers', fid) : null; const b = document.createElement('div'); b.innerHTML = `<label class="lbl">PV d'essai</label><div class="btnrow">${f ? `<button type="button" class="btn sm" id="fOpen">${APP.icon('download', 14)} ${E(f.nom)}</button>` : ''}<button type="button" class="btn sm ghost" id="fAdd">${APP.icon('upload', 14)} Joindre le PV</button></div>`; box.appendChild(b);
      if (UI.$('#fOpen', b)) UI.$('#fOpen', b).onclick = () => openFichier(fid); UI.$('#fAdd', b).onclick = () => pickFichier(f2 => { fid = f2.id; draw(); });
      if (x.id) { const g = document.createElement('div'); g.innerHTML = '<label class="lbl" style="margin-top:10px">Photos</label>'; g.appendChild(UIX.gallery('essais', x.id, { legende: x.objet })); box.appendChild(g); } };
    draw();
    UI.form({ title: x.id ? 'Essai / contrôle' : 'Nouvel essai ou contrôle', wide: true, value: x, extra: box, fields: [
      { k: 'date', label: 'Date', type: 'date', required: true, default: U.today() },
      { k: 'entrepriseId', label: 'Lot / entreprise', type: 'select', options: UI.opts(S.list('entreprises').sort(U.by('nom'))) },
      { k: 'objet', label: 'Essai / contrôle', type: 'datalist', options: ['Essai de pression plomberie', 'Essai d\'étanchéité 48 h', 'Réception réseaux électriques', 'Mesure de terre', 'Essais climatisation', 'Visite du bureau de contrôle', 'Essais ascenseur', 'Contrôle des courants faibles'], required: true, full: true },
      { k: 'zone', label: 'Zone', type: 'datalist', options: ZONES }, { k: 'organisme', label: 'Organisme / contrôleur', default: 'BCT' },
      { k: 'resultat', label: 'Résultat', type: 'select', options: Object.keys(RSC), required: true, default: 'En attente' }, { k: 'refPV', label: 'Référence du PV' },
      { k: 'observations', label: 'Observations', type: 'textarea', full: true, rows: 2 },
    ], onSave: v => { S.save('essais', Object.assign({ id: x.id }, v, { fichierId: fid }), `Essai « ${v.objet} » : ${v.resultat}`); }, onDelete: x.id ? () => S.remove('essais', x.id, 'Essai supprimé') : null });
  }
  function editAuto(x = {}) {
    const items = (x.items || []).map(i => ({ ...i }));
    const box = document.createElement('div');
    const draw = () => {
      box.innerHTML = `<label class="lbl">Points de contrôle</label><table class="tbl mini"><tbody>${items.map((it, i) => `<tr><td>${E(it.libelle)}</td><td style="width:220px"><div class="seg">${['OK', 'NOK', 'S.O.'].map(r => `<button type="button" data-i="${i}" data-r="${r}" class="${it.res === r ? 'on' : ''}">${r}</button>`).join('')}</div></td></tr>`).join('') || '<tr><td class="muted">Choisissez l\'entreprise pour charger la liste</td></tr>'}</tbody></table>`;
      UI.$$('[data-r]', box).forEach(b => b.onclick = () => { items[+b.dataset.i].res = b.dataset.r; draw(); });
    };
    const f = UI.form({ title: x.id ? 'Fiche d\'autocontrôle' : 'Nouvelle fiche d\'autocontrôle', wide: true, value: x, extra: box, fields: [
      { k: 'entrepriseId', label: 'Entreprise', type: 'select', options: UI.opts(S.list('entreprises').sort(U.by('nom')), e => `${e.nom} — ${e.corpsEtat || ''}`), required: true },
      { k: 'zone', label: 'Zone', type: 'datalist', options: ZONES, required: true }, { k: 'date', label: 'Date', type: 'date', default: U.today() },
      { k: 'controleur', label: 'Contrôlé par' }, { k: 'conclusion', label: 'Conclusion', type: 'textarea', full: true, rows: 2 },
    ], onSave: v => {
      const r = S.save('autocontroles', Object.assign({ id: x.id }, v, { items }), `Autocontrôle ${APP.entNom(v.entrepriseId)} — ${v.zone}`);
      const nok = items.filter(i => i.res === 'NOK');
      if (nok.length && !x.id) setTimeout(() => UI.confirm(`${nok.length} point(s) non conforme(s) : créer les réserves correspondantes ?`, () => nok.forEach(i => S.save('reserves', { num: APP.nextNum('reserves', 'R-'), zone: v.zone, entrepriseId: v.entrepriseId, origine: 'Visite de chantier', description: i.libelle + ' — autocontrôle du ' + U.fr(v.date), dateConstat: v.date, echeance: U.addDays(v.date, 14), statut: 'Ouverte' }, 'Réserve créée depuis un autocontrôle')), 'Créer les réserves'), 200);
      void r;
    }, onDelete: x.id ? () => S.remove('autocontroles', x.id, 'Autocontrôle supprimé') : null });
    const load = () => { const e = S.get('entreprises', f.form.elements.entrepriseId.value); if (!items.length || !x.id) { items.length = 0; CHECK[tplFor(e)].concat(CHECK.gen.slice(0, 2)).forEach(l => items.push({ libelle: l, res: '' })); } draw(); };
    f.form.elements.entrepriseId.addEventListener('change', () => { items.length = 0; load(); });
    if (!items.length) load(); else draw();
  }
  function opr() {
    const body = document.createElement('div');
    body.innerHTML = `<div class="grid-form"><div class="field"><label>Zone visitée</label><input id="oZ" list="oZl"><datalist id="oZl">${ZONES.map(z => `<option value="${E(z)}">`).join('')}</datalist></div><div class="field"><label>Date</label><input type="date" id="oD" value="${U.today()}"></div>
      <div class="field full"><label>Participants</label><input id="oP" placeholder="MO, MOE, BCT, entreprises…"></div>
      <div class="field full"><label>Observations — une par ligne, au format « ENTREPRISE : description »</label><textarea id="oO" rows="7" placeholder="CARRELEUR : carreau fêlé devant la porte d'entrée&#10;PEINTRE : reprise de peinture plafond séjour"></textarea><small>Chaque ligne crée une réserve d'origine « Pré-réception », à lever sous 15 jours.</small></div></div>`;
    UI.modal({ title: 'Visite de pré-réception (OPR)', wide: true, body, actions: [{ label: 'Annuler' }, { label: 'Créer les réserves', cls: 'primary', onClick: () => {
      const z = UI.$('#oZ', body).value.trim(), d = UI.$('#oD', body).value || U.today(); if (!z) { UI.toast('Indiquez la zone', 'err'); return false; }
      const lines = UI.$('#oO', body).value.split('\n').map(s => s.trim()).filter(Boolean); let n = 0;
      lines.forEach(l => { const m = l.match(/^([^:]{2,30}):\s*(.+)$/); const ent = m ? S.list('entreprises').find(e => IMPORT.key(e.nom) === IMPORT.key(m[1])) : null; S.save('reserves', { num: APP.nextNum('reserves', 'R-'), zone: z, entrepriseId: ent?.id || '', origine: 'Pré-réception', description: m && ent ? m[2] : l, dateConstat: d, echeance: U.addDays(d, 15), statut: 'Ouverte' }); n++; });
      S.save('opr', { zone: z, date: d, participants: UI.$('#oP', body).value, nbObservations: n }, `Pré-réception ${z} : ${n} réserve(s)`); UI.toast(`${n} réserve(s) créée(s)`);
    } }] });
  }

  function render(v) {
    v.innerHTML = `<div class="tabs">${[['plans', 'Plans & visas'], ['essais', 'Essais & contrôles'], ['auto', 'Autocontrôles'], ['recep', 'Préparation de la réception']].map(([k, l]) => `<button data-t="${k}" class="${st.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="qB"></div>`;
    UI.$$('[data-t]', v).forEach(b => b.onclick = () => { st.tab = b.dataset.t; APP.refresh(); });
    const h = UI.$('#qB', v);
    if (st.tab === 'plans') {
      const rows = S.list('plans');
      h.innerHTML = `<div class="kpis">${UI.kpi('Plans enregistrés', rows.length)}${UI.kpi('À viser', rows.filter(p => p.statut === 'À viser').length, '', rows.some(p => p.statut === 'À viser') ? 'warn' : 'good')}${UI.kpi('Refusés', rows.filter(p => p.statut === 'Refusé').length, '', rows.some(p => p.statut === 'Refusé') ? 'bad' : '')}</div>
        <div class="toolbar"><button class="btn primary" id="qAdd">+ Plan</button></div><div id="qT"></div>`;
      UI.$('#qAdd', h).onclick = () => editPlan();
      UI.table(UI.$('#qT', h), { id: 'plans', sortKey: 'dateRecu', sortDir: -1, rows, onRow: editPlan, empty: 'Aucun plan. Enregistrez les plans d\'exécution reçus pour suivre leur visa.', cols: [
        { k: 'ref', label: 'Référence', render: p => `<b>${E(p.ref)}</b>` }, { k: 'indice', label: 'Ind.' }, { k: 'titre', label: 'Titre' }, { k: 'ent', label: 'Émis par', sort: p => APP.entNom(p.entrepriseId), render: p => E(APP.entNom(p.entrepriseId)) },
        { k: 'dateRecu', label: 'Reçu le', render: p => U.fr(p.dateRecu) }, { k: 'statut', label: 'Statut', render: p => UI.badge(p.statut, PSC[p.statut]) }, { k: 'dateVisa', label: 'Visa', render: p => U.fr(p.dateVisa) },
        { k: 'f', label: '', nosort: true, render: p => p.fichierId ? APP.icon('rapports', 16) : '' }] });
    } else if (st.tab === 'essais') {
      const rows = S.list('essais');
      h.innerHTML = `<div class="toolbar"><button class="btn primary" id="qAdd">+ Essai / contrôle</button></div><div id="qT"></div>`;
      UI.$('#qAdd', h).onclick = () => editEssai();
      UI.table(UI.$('#qT', h), { id: 'essais', sortKey: 'date', sortDir: -1, rows, onRow: editEssai, empty: 'Aucun essai enregistré.', cols: [
        { k: 'date', label: 'Date', render: e => U.fr(e.date) }, { k: 'objet', label: 'Essai / contrôle', render: e => `<b>${E(e.objet)}</b>` }, { k: 'ent', label: 'Lot', sort: e => APP.entNom(e.entrepriseId), render: e => E(APP.entNom(e.entrepriseId)) },
        { k: 'zone', label: 'Zone' }, { k: 'organisme', label: 'Organisme' }, { k: 'resultat', label: 'Résultat', render: e => UI.badge(e.resultat, RSC[e.resultat]) }, { k: 'refPV', label: 'PV' }] });
    } else if (st.tab === 'auto') {
      const rows = S.list('autocontroles');
      h.innerHTML = `<div class="toolbar"><button class="btn primary" id="qAdd">+ Fiche d'autocontrôle</button></div><div id="qT"></div>`;
      UI.$('#qAdd', h).onclick = () => editAuto();
      UI.table(UI.$('#qT', h), { id: 'auto', sortKey: 'date', sortDir: -1, rows, onRow: editAuto, empty: 'Aucune fiche. Les fiches proposent des points de contrôle adaptés au corps d\'état.', cols: [
        { k: 'date', label: 'Date', render: a => U.fr(a.date) }, { k: 'ent', label: 'Entreprise', sort: a => APP.entNom(a.entrepriseId), render: a => `<b>${E(APP.entNom(a.entrepriseId))}</b>` }, { k: 'zone', label: 'Zone' },
        { k: 'res', label: 'Résultat', nosort: true, render: a => { const it = a.items || [], ok = it.filter(i => i.res === 'OK').length, nok = it.filter(i => i.res === 'NOK').length; return `${UI.badge(ok + ' OK', 'b-green')} ${nok ? UI.badge(nok + ' NOK', 'b-red') : ''}`; } }, { k: 'controleur', label: 'Contrôlé par' }] });
    } else {
      const res = S.list('reserves');
      const zones = [...new Set([...ZONES, ...res.map(r => r.zone).filter(Boolean)])];
      h.innerHTML = `<div class="toolbar"><button class="btn primary" id="qOpr">+ Visite de pré-réception</button><span class="muted">Chaque observation devient une réserve suivie dans « Journal & réunions › Réserves ».</span></div>
        <div class="card"><h3>État des zones avant réception</h3><div class="tbl-wrap" style="box-shadow:none"><table class="tbl"><thead><tr><th>Zone</th><th class="r">Réserves</th><th class="r">Levées</th><th class="r">Ouvertes</th><th>Avancement de levée</th><th>Dernière visite</th></tr></thead><tbody>
        ${zones.map(z => { const rz = res.filter(r => r.zone === z), l = rz.filter(r => r.statut === 'Levée').length, o = rz.length - l, last = S.list('opr').filter(x => x.zone === z).sort(U.by('date')).pop(); return `<tr><td><b>${E(z)}</b></td><td class="r">${rz.length}</td><td class="r">${l}</td><td class="r">${o ? `<span class="neg">${o}</span>` : 0}</td><td>${rz.length ? UI.bar(100 * l / rz.length, o ? '' : 'ok') : '<span class="muted">pas encore visitée</span>'}</td><td>${last ? U.fr(last.date) : '—'}</td></tr>`; }).join('')}</tbody></table></div></div>`;
      UI.$('#qOpr', h).onclick = opr;
    }
  }
  void attach;
  APP.mod('qualite', { title: 'Qualité & réception', nav: 'Qualité', group: 'Chantier', sub: 'Plans et visas, essais, autocontrôles et préparation de la réception', render,
    badge: () => S.list('plans').filter(p => p.statut === 'À viser').length + S.list('essais').filter(e => e.resultat === 'Non conforme').length });
})();
