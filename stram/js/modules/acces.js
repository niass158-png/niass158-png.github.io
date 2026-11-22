/* STRAM Suivi — Entreprises, ouvriers, personnes habilitées et registre des accès */
'use strict';
(() => {
  const st = { tab: 'reg', date: '', q: '', ent: '' };
  const hm = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const duree = (a, b) => { if (!a || !b) return ''; const [h1, m1] = a.split(':').map(Number), [h2, m2] = b.split(':').map(Number); let m = (h2 * 60 + m2) - (h1 * 60 + m1); if (m < 0) m += 1440; return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };

  function editEnt(e = {}) {
    UI.form({ title: e.id ? e.nom : 'Nouvelle entreprise', wide: true, value: e, fields: [
      { k: 'nom', label: 'Nom de l\'entreprise', required: true }, { k: 'corpsEtat', label: 'Corps d\'état', required: true },
      { k: 'lot', label: 'Lot / description de l\'intervention', full: true },
      { k: 'responsable', label: 'Responsable sur site' }, { k: 'tel', label: 'Téléphone' }, { k: 'email', label: 'E-mail' },
      { k: 'effectifPrevu', label: 'Effectif prévu', type: 'number' }, { k: 'debut', label: 'Début d\'intervention (contrat)', type: 'date' }, { k: 'fin', label: 'Fin d\'intervention (contrat)', type: 'date' },
      { k: 'couleur', label: 'Couleur au planning', type: 'color', default: '#B48F70' },
    ], onSave: v => { S.save('entreprises', Object.assign({ id: e.id }, v), `Entreprise « ${v.nom} » enregistrée`); UI.toast('Entreprise enregistrée'); },
    onDelete: e.id ? () => { if (S.list('taches').some(t => t.entrepriseId === e.id) || S.list('marches').some(m => m.entrepriseId === e.id)) { UI.toast('Entreprise liée à des tâches ou un marché : suppression impossible', 'err'); return; } S.remove('entreprises', e.id, `Entreprise « ${e.nom} » supprimée`); } : null });
  }
  function editPers(p = {}) {
    UI.form({ title: p.id ? p.nom : 'Nouvel ouvrier / intervenant', value: p, fields: [
      { k: 'nom', label: 'Nom et prénom', required: true }, { k: 'entrepriseId', label: 'Entreprise', type: 'select', options: UI.opts(S.list('entreprises').sort(U.by('nom'))), required: true },
      { k: 'fonction', label: 'Fonction' }, { k: 'piece', label: 'N° pièce d\'identité' }, { k: 'tel', label: 'Téléphone' },
      { k: 'statut', label: 'Statut', type: 'select', options: ['Actif', 'Sorti du chantier'], default: 'Actif', required: true },
    ], onSave: v => S.save('personnes', Object.assign({ id: p.id }, v), `Ouvrier « ${v.nom} » enregistré`), onDelete: p.id ? () => S.remove('personnes', p.id, `Ouvrier « ${p.nom} » supprimé`) : null });
  }
  function editHab(h = {}) {
    const id = h.id || U.uid();
    UI.form({ title: h.id ? h.nom : 'Personne habilitée', value: h, fields: [
      { k: 'role', label: 'Rôle', type: 'select', options: ['Titulaire', 'Suppléant', 'Responsable monte-charge'], required: true },
      { k: 'nom', label: 'Nom et prénom', required: true }, { k: 'fonction', label: 'Fonction' }, { k: 'tel', label: 'Téléphone' },
      { k: 'perimetre', label: 'Périmètre d\'autorisation', full: true, default: 'Tous matériaux et matériel' }, { k: 'dateDesignation', label: 'Désignée le', type: 'date', default: U.today() },
      { k: 'pin', label: h.pinHash ? 'Nouveau code PIN (laisser vide pour conserver)' : 'Code PIN de validation (4 à 8 chiffres)', type: 'password', hint: 'Exigé à chaque bon de sortie qu\'elle autorise' },
    ], onSave: v => {
      const pin = v.pin; delete v.pin;
      if (pin && !/^\d{4,8}$/.test(pin)) { UI.toast('Le PIN doit comporter 4 à 8 chiffres', 'err'); return false; }
      const go = hash => { const o = Object.assign({ id }, v); if (hash) o.pinHash = hash; if (!h.id) { S.data.habilites.push(Object.assign({ cree: new Date().toISOString() }, o, { maj: new Date().toISOString() })); S.log(`Personne habilitée « ${v.nom} » (${v.role})`); S.persist(); APP.refresh(); } else S.save('habilites', o, `Personne habilitée « ${v.nom} » (${v.role})`); };
      if (!S.can('habilites')) { UI.toast('Droits insuffisants', 'err'); return false; }
      if (pin) UIX.hash(pin, id).then(go); else go(null);
    }, onDelete: h.id ? () => S.remove('habilites', h.id, 'Personne habilitée retirée') : null });
  }
  function editAcces(a = {}) {
    const pers = S.list('personnes').filter(p => p.statut !== 'Sorti du chantier');
    UI.form({ title: a.id ? 'Passage' : 'Enregistrer une entrée', value: a, fields: [
      { k: 'date', label: 'Date', type: 'date', required: true, default: U.today() },
      { k: 'nom', label: 'Nom et prénom', type: 'datalist', options: pers.map(p => p.nom), required: true },
      { k: 'entreprise', label: 'Entreprise / organisme', type: 'datalist', options: S.list('entreprises').map(e => e.nom) },
      { k: 'piece', label: 'N° pièce d\'identité' },
      { k: 'heureEntree', label: 'Heure d\'entrée', type: 'time', default: hm(), required: true }, { k: 'heureSortie', label: 'Heure de sortie', type: 'time' },
      { k: 'motif', label: 'Motif / visiteur', full: true },
    ], onSave: v => {
      const p = pers.find(x => U.norm(x.nom) === U.norm(v.nom));
      if (p) { v.personneId = p.id; if (!v.entreprise) v.entreprise = APP.entNom(p.entrepriseId); if (!v.piece) v.piece = p.piece || ''; }
      v.surListe = !!p;
      S.save('acces', Object.assign({ id: a.id }, v), `Accès : ${v.nom} ${a.id ? 'modifié' : 'entré à ' + v.heureEntree}`);
      if (!p) UI.toast('Personne hors liste : accord d\'une personne habilitée requis', 'warn'); else UI.toast('Entrée enregistrée');
    }, onDelete: a.id ? () => S.remove('acces', a.id) : null });
  }

  function render(v) {
    v.innerHTML = `<div class="tabs">${[['reg', 'Registre des accès'], ['ent', 'Entreprises'], ['ouv', 'Ouvriers'], ['hab', 'Personnes habilitées']].map(([k, l]) => `<button data-t="${k}" class="${st.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="aBody"></div>`;
    UI.$$('[data-t]', v).forEach(b => b.onclick = () => { st.tab = b.dataset.t; APP.refresh(); });
    const h = UI.$('#aBody', v);
    if (st.tab === 'reg') {
      const d = st.date || U.today();
      const rows = S.list('acces').filter(a => a.date === d && (!st.q || U.norm(a.nom + ' ' + a.entreprise).includes(U.norm(st.q))));
      const presents = rows.filter(a => !a.heureSortie);
      h.innerHTML = `<div class="kpis">${UI.kpi('Passages du jour', rows.length)}${UI.kpi('Présents actuellement', presents.length, '', presents.length ? 'good' : '')}${UI.kpi('Hors liste', rows.filter(a => !a.surListe).length, 'à justifier', rows.some(a => !a.surListe) ? 'warn' : '')}${UI.kpi('Entreprises présentes', new Set(rows.map(a => a.entreprise)).size)}</div>
        <div class="toolbar"><button class="btn primary" id="rIn">${APP.icon('enter', 15)} Entrée</button><span class="sep"></span><input type="date" id="rD" value="${d}"><input type="search" id="rQ" placeholder="Rechercher…" value="${U.esc(st.q)}"><span class="sep"></span><button class="btn ghost" id="rXls">${APP.icon('download', 15)} Excel</button></div><div id="rT"></div>`;
      UI.$('#rIn', h).onclick = () => editAcces();
      UI.$('#rD', h).onchange = e => { st.date = e.target.value; APP.refresh(); };
      UI.$('#rQ', h).oninput = U.debounce(e => { st.q = e.target.value; APP.refresh(); }, 300);
      UI.table(UI.$('#rT', h), { id: 'reg', sortKey: 'he', sortDir: -1, rows, onRow: editAcces, empty: 'Aucun passage enregistré ce jour.', rowCls: a => a.surListe ? '' : 'row-warn', cols: [
        { k: 'nom', label: 'Nom', render: a => `<b>${U.esc(a.nom)}</b>` }, { k: 'entreprise', label: 'Entreprise' }, { k: 'piece', label: 'Pièce d\'identité' },
        { k: 'he', label: 'Entrée', sort: a => a.heureEntree, render: a => a.heureEntree }, { k: 'hs', label: 'Sortie', sort: a => a.heureSortie, render: a => a.heureSortie || `<button class="btn xs" data-out="${a.id}">← Sortie</button>` },
        { k: 'du', label: 'Durée', nosort: true, render: a => duree(a.heureEntree, a.heureSortie) }, { k: 'motif', label: 'Motif' },
        { k: 'li', label: 'Contrôle', sort: a => a.surListe, render: a => a.surListe ? UI.badge('Sur la liste', 'b-green') : UI.badge('Hors liste', 'b-amber') }] });
      UI.$$('[data-out]', h).forEach(b => b.onclick = () => S.save('acces', { id: b.dataset.out, heureSortie: hm() }, 'Accès : sortie enregistrée'));
      UI.$('#rXls', h).onclick = () => UI.xlsx(`STRAM_Acces_${U.today()}.xlsx`, { 'Registre des accès': [['Date', 'Nom', 'Entreprise', 'Pièce', 'Entrée', 'Sortie', 'Durée', 'Motif', 'Contrôle'], ...S.list('acces').sort(U.by(a => a.date + a.heureEntree)).map(a => [U.fr(a.date), a.nom, a.entreprise, a.piece, a.heureEntree, a.heureSortie, duree(a.heureEntree, a.heureSortie), a.motif, a.surListe ? 'Sur la liste' : 'Hors liste'])] });
    } else if (st.tab === 'ent') {
      h.innerHTML = `<div class="toolbar"><button class="btn primary" id="eAdd">+ Entreprise</button></div><div id="eT"></div>`;
      UI.$('#eAdd', h).onclick = () => editEnt();
      UI.table(UI.$('#eT', h), { id: 'ents', sortKey: 'debut', rows: S.list('entreprises'), onRow: editEnt, cols: [
        { k: 'nom', label: 'Entreprise', render: e => `<span class="dot" style="background:${e.couleur}"></span> <b>${U.esc(e.nom)}</b>` }, { k: 'corpsEtat', label: 'Corps d\'état' },
        { k: 'lot', label: 'Intervention', render: e => `<small>${U.esc(e.lot || '')}</small>` }, { k: 'responsable', label: 'Responsable' }, { k: 'tel', label: 'Téléphone' },
        { k: 'debut', label: 'Début', render: e => U.fr(e.debut) }, { k: 'fin', label: 'Fin', render: e => U.fr(e.fin) },
        { k: 'ouv', label: 'Ouvriers', cls: 'r', sort: e => S.list('personnes').filter(p => p.entrepriseId === e.id && p.statut !== 'Sorti du chantier').length, render: e => S.list('personnes').filter(p => p.entrepriseId === e.id && p.statut !== 'Sorti du chantier').length || '' },
        { k: 'statut', label: 'Statut', sort: e => e.fin, render: e => e.fin && e.fin < U.today() ? UI.badge('Terminée', 'b-grey') : e.debut && e.debut > U.today() ? UI.badge('À venir', 'b-blue') : UI.badge('En cours', 'b-green') }] });
    } else if (st.tab === 'ouv') {
      h.innerHTML = `<div class="toolbar"><button class="btn primary" id="oAdd">+ Ouvrier</button><span class="sep"></span><select id="oEnt"><option value="">Toutes les entreprises</option>${S.list('entreprises').sort(U.by('nom')).map(e => `<option value="${e.id}" ${st.ent === e.id ? 'selected' : ''}>${U.esc(e.nom)}</option>`).join('')}</select><span class="sep"></span><button class="btn ghost" id="oImp">${APP.icon('upload', 15)} Importer Excel</button></div><div id="oT"></div>`;
      UI.$('#oAdd', h).onclick = () => editPers(st.ent ? { entrepriseId: st.ent } : {});
      UI.$('#oEnt', h).onchange = e => { st.ent = e.target.value; APP.refresh(); };
      UI.$('#oImp', h).onclick = () => UI.pickFile('.xlsx,.xls', buf => { try { const wb = XLSX.read(buf, { type: 'array' }); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames.find(n => /ouvrier/i.test(n)) || wb.SheetNames[0]], { header: 1, defval: '' }); const hi = rows.findIndex(r => r.some(c => /nom/i.test(c))); const H = rows[hi].map(U.norm); const ix = k => H.findIndex(c => c.includes(k)); let n = 0;
        rows.slice(hi + 1).forEach(r => { const nom = String(r[ix('nom')] || '').trim(); if (!nom) return; const en = S.list('entreprises').find(e => U.norm(e.nom) === U.norm(r[ix('entreprise')])); S.save('personnes', { nom, entrepriseId: en?.id || st.ent || '', piece: ix('piece') >= 0 ? r[ix('piece')] : '', tel: ix('tel') >= 0 ? r[ix('tel')] : '', fonction: ix('fonction') >= 0 ? r[ix('fonction')] : '', statut: 'Actif' }); n++; });
        S.log(`Ouvriers : ${n} importé(s) depuis Excel`); UI.toast(`${n} ouvrier(s) importé(s)`); } catch (e) { UI.toast('Import impossible : ' + e.message, 'err'); } });
      UI.table(UI.$('#oT', h), { id: 'ouv', sortKey: 'nom', rows: S.list('personnes').filter(p => !st.ent || p.entrepriseId === st.ent), onRow: editPers, empty: 'Aucun ouvrier. Saisissez ou importez les listes nominatives transmises par les entreprises.', cols: [
        { k: 'nom', label: 'Nom et prénom', render: p => `<b>${U.esc(p.nom)}</b>` }, { k: 'ent', label: 'Entreprise', sort: p => APP.entNom(p.entrepriseId), render: p => U.esc(APP.entNom(p.entrepriseId)) },
        { k: 'fonction', label: 'Fonction' }, { k: 'piece', label: 'Pièce d\'identité' }, { k: 'tel', label: 'Téléphone' }, { k: 'statut', label: 'Statut', render: p => UI.badge(p.statut || 'Actif', p.statut === 'Sorti du chantier' ? 'b-grey' : 'b-green') }] });
    } else {
      h.innerHTML = `<div class="toolbar"><button class="btn primary" id="hAdd">+ Personne habilitée</button></div><p class="muted">Seules ces personnes peuvent autoriser les sorties de matériaux et de matériel. Les pièces du monte-charge exigent une double validation.</p><div id="hT"></div>`;
      UI.$('#hAdd', h).onclick = () => editHab();
      UI.table(UI.$('#hT', h), { id: 'hab', sortKey: 'role', rows: S.list('habilites'), onRow: editHab, empty: 'Aucune personne habilitée : désignez le titulaire, le suppléant et le responsable du monte-charge.', cols: [
        { k: 'role', label: 'Rôle', render: x => `<b>${U.esc(x.role)}</b>` }, { k: 'nom', label: 'Nom' }, { k: 'fonction', label: 'Fonction' }, { k: 'tel', label: 'Téléphone' }, { k: 'perimetre', label: 'Périmètre' }, { k: 'dateDesignation', label: 'Désignée le', render: x => U.fr(x.dateDesignation) }, { k: 'pinHash', label: 'PIN', render: x => x.pinHash ? UI.badge('Actif', 'b-green') : UI.badge('Aucun', 'b-grey') }] });
    }
  }

  APP.mod('acces', { title: 'Accès & personnel', short: 'Accès', icon: '⚇', group: 'Chantier', mobile: true, sub: 'Entreprises, ouvriers, personnes habilitées et registre des entrées', render,
    badge: () => S.list('acces').filter(a => a.date === U.today() && !a.heureSortie).length });
})();
