/* STRAM Suivi — Planning des corps d'état : Gantt par phase, point hebdomadaire, courbe en S, import Excel */
'use strict';
const PLANNING = (() => {
  const st = { zoom: 3, ent: '', etat: '', type: '', phase: '', crit: false, q: '', vue: window.innerWidth < 820 ? 'liste' : 'gantt', closed: {}, pointDate: '' };
  const tname = t => t ? `${APP.entNom(t.entrepriseId)} — ${t.nom || ''}${t.zone && t.nom !== t.zone ? ' (' + t.zone + ')' : ''}` : '?';
  const TYPES = ['Travaux', 'Validation MO', 'Approvisionnement', 'Jalon'];
  const tb = ty => ty === 'Validation MO' ? '<span class="tbadge tb-mo">MO</span>' : ty === 'Approvisionnement' ? '<span class="tbadge tb-ap">APPRO</span>' : ty === 'Jalon' ? '<span class="tbadge tb-j">JALON</span>' : '';
  const phases = () => { const o = []; S.list('taches').forEach(t => { const p = t.phase || 'Sans phase'; if (!o.includes(p)) o.push(p); }); return o; };

  function editTask(t = {}) {
    const all = S.list('taches').filter(x => x.id !== t.id).sort(U.by(x => tname(x)));
    const preds = (t.predecesseurs || []).map(p => ({ ...p }));
    const box = document.createElement('div'); box.className = 'preds';
    const draw = () => {
      box.innerHTML = `<label>Tâches prédécesseurs (liens)</label>${preds.map((p, i) => `<div class="pred-row">
        <select data-i="${i}" data-f="id">${all.map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${U.esc(tname(x))}</option>`).join('')}</select>
        <select data-i="${i}" data-f="type">${[['FD', 'Fin → Début'], ['DD', 'Début → Début'], ['FF', 'Fin → Fin']].map(([v, l]) => `<option value="${v}" ${p.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input data-i="${i}" data-f="decalage" type="number" value="${U.num(p.decalage)}" title="Décalage en jours ouvrés (négatif = chevauchement)">
        <button type="button" class="icon-btn" data-del="${i}" title="Retirer">✕</button></div>`).join('')}
        <button type="button" class="btn sm ghost" id="addPred" ${all.length ? '' : 'disabled'}>+ Ajouter un lien</button>
        <small>La tâche démarre automatiquement après ses prédécesseurs. Décalage en jours ouvrés (ex. 2 = temps de séchage ; −3 = chevauchement).</small>`;
      UI.$$('[data-f]', box).forEach(el => el.onchange = () => { preds[+el.dataset.i][el.dataset.f] = el.dataset.f === 'decalage' ? U.num(el.value) : el.value; });
      UI.$$('[data-del]', box).forEach(b => b.onclick = () => { preds.splice(+b.dataset.del, 1); draw(); });
      UI.$('#addPred', box).onclick = () => { preds.push({ id: all[0].id, type: 'FD', decalage: 0 }); draw(); };
    };
    draw();
    const wrap = document.createElement('div'); wrap.appendChild(box);
    if (t.id) { const g = document.createElement('div'); g.innerHTML = '<label class="lbl" style="margin-top:12px">Photos de la tâche</label>'; g.appendChild(UIX.gallery('taches', t.id, { legende: t.nom })); wrap.appendChild(g);
      const h = S.list('avancements').filter(a => a.tacheId === t.id).sort(U.by('date', -1));
      if (h.length) { const d = document.createElement('div'); d.innerHTML = `<label class="lbl" style="margin-top:12px">Historique d'avancement</label><table class="tbl mini"><tbody>${h.slice(0, 8).map(a => `<tr><td>${U.fr(a.date)}</td><td class="r"><b>${a.av} %</b></td><td>${U.esc(a.commentaire || '')}</td><td class="muted">${U.esc(a.auteur || '')}</td></tr>`).join('')}</tbody></table>`; wrap.appendChild(d); } }
    UI.form({
      title: t.id ? 'Modifier la tâche' : 'Nouvelle tâche', wide: true, value: Object.assign({ type: PLAN.typeOf(t) }, t), extra: wrap,
      fields: [
        { k: 'nom', label: 'Désignation de la tâche', required: true, full: true },
        { k: 'entrepriseId', label: 'Entreprise / intervenant principal', type: 'select', options: UI.opts(S.list('entreprises').sort(U.by('nom')), e => `${e.nom} — ${e.corpsEtat || ''}`), required: true },
        { k: 'intervenant', label: 'Intervenants (texte libre)', placeholder: 'ex. NIANG+BCT' },
        { k: 'phase', label: 'Phase', type: 'datalist', options: phases() },
        { k: 'type', label: 'Type', type: 'select', options: TYPES, required: true },
        { k: 'zone', label: 'Zone / étage', type: 'datalist', options: [...new Set(S.list('taches').map(x => x.zone).filter(Boolean))] },
        { k: 'duree', label: 'Durée (jours ouvrés)', type: 'number', required: true, min: 1 },
        { k: 'debutImpose', label: 'Début au plus tôt (contrainte)', type: 'date', hint: 'Vide = démarrage piloté par les liens' },
        { k: 'avancement', label: 'Avancement (%)', type: 'number', min: 0, max: 100, hint: 'Vide si non renseigné' },
        { k: 'debutReel', label: 'Début réel', type: 'date' },
        { k: 'finReel', label: 'Fin réelle', type: 'date' },
        { k: 'poids', label: 'Poids dans l\'avancement global', type: 'number', hint: 'Vide = durée de la tâche' },
        { k: 'notes', label: 'Observations', type: 'textarea', full: true, rows: 2 },
      ],
      onSave: val => {
        if (preds.some(p => p.id === t.id)) { UI.toast('Une tâche ne peut pas dépendre d\'elle-même', 'err'); return false; }
        const old = t.avancement;
        if (val.avancement !== '') val.avancement = Math.max(0, Math.min(100, U.num(val.avancement))); else val.avancement = null;
        if (val.avancement !== null && val.avancement !== old) val.majAvancement = U.today();
        if (val.avancement === 100 && !val.finReel) val.finReel = U.today();
        val.predecesseurs = preds.filter(p => p.id);
        const r = S.save('taches', Object.assign({ id: t.id }, val), `Planning : ${t.id ? 'modification' : 'création'} de « ${val.nom} »`);
        if (val.avancement !== null && val.avancement !== old) S.save('avancements', { tacheId: r.id, date: U.today(), av: val.avancement, commentaire: 'Saisie dans la fiche tâche', auteur: S.user?.nom || '' });
        UI.toast('Tâche enregistrée — planning recalculé');
      },
      onDelete: t.id ? () => {
        S.list('taches').forEach(x => { if ((x.predecesseurs || []).some(p => p.id === t.id)) S.save('taches', { id: x.id, predecesseurs: x.predecesseurs.filter(p => p.id !== t.id) }); });
        S.remove('taches', t.id, `Planning : suppression de « ${t.nom} »`);
      } : null,
    });
  }

  function generateur() {
    const ents = S.list('entreprises').sort(U.by('nom'));
    const body = document.createElement('div');
    body.innerHTML = `<p class="muted">Créez en une fois l'enchaînement des corps d'état par zone (ex. chape → étanchéité → faux plafond → peinture → carrelage, étage par étage). Les liens sont posés automatiquement : chaque corps d'état suit le précédent dans la même zone, et chaque équipe passe d'une zone à la suivante.</p>
      <div class="grid-form">
        <div class="field full"><label>Zones (une par ligne, dans l'ordre d'exécution)</label><textarea id="gZones" rows="4">RDC\nÉtage 1\nÉtage 2\nÉtage 3\nÉtage 4\nÉtage 5\nÉtage 6\nTriplex</textarea></div>
        <div class="field"><label>Début de la séquence</label><input type="date" id="gDeb" value="${U.nextWork(U.today())}"></div>
        <div class="field"><label>Décalage entre corps d'état (j ouvrés)</label><input type="number" id="gLag" value="0"></div>
        <div class="field full"><label class="chk"><input type="checkbox" id="gChain" checked> Une seule équipe par corps d'état (passe d'une zone à la suivante)</label></div>
      </div>
      <table class="tbl mini"><thead><tr><th>Ordre</th><th>Corps d'état (entreprise)</th><th>Désignation</th><th>Durée par zone (j)</th><th></th></tr></thead><tbody id="gRows"></tbody></table>
      <button class="btn sm ghost" id="gAdd">+ Ajouter un corps d'état</button>`;
    const rows = [];
    const draw = () => {
      UI.$('#gRows', body).innerHTML = rows.map((r, i) => `<tr><td>${i + 1}</td><td><select data-i="${i}" data-f="e">${ents.map(e => `<option value="${e.id}" ${e.id === r.e ? 'selected' : ''}>${U.esc(e.nom)} — ${U.esc(e.corpsEtat || '')}</option>`).join('')}</select></td>
        <td><input data-i="${i}" data-f="n" value="${U.esc(r.n)}"></td><td><input type="number" data-i="${i}" data-f="d" value="${r.d}" min="1" style="width:80px"></td><td><button class="icon-btn" data-x="${i}">✕</button></td></tr>`).join('');
      UI.$$('[data-f]', body).forEach(el => el.onchange = () => { const r = rows[+el.dataset.i]; r[el.dataset.f] = el.dataset.f === 'd' ? U.num(el.value) : el.value; if (el.dataset.f === 'e') { r.n = S.get('entreprises', el.value)?.corpsEtat || ''; draw(); } });
      UI.$$('[data-x]', body).forEach(b => b.onclick = () => { rows.splice(+b.dataset.x, 1); draw(); });
    };
    UI.$('#gAdd', body).onclick = () => { const e = ents[rows.length % ents.length]; rows.push({ e: e.id, n: e.corpsEtat || '', d: 5 }); draw(); };
    UI.$('#gAdd', body).click();
    UI.modal({ title: 'Générateur de séquence par zone', wide: true, body, actions: [{ label: 'Annuler' }, { label: 'Générer les tâches', cls: 'primary', onClick: () => {
      const zones = UI.$('#gZones', body).value.split('\n').map(s => s.trim()).filter(Boolean);
      if (!zones.length || !rows.length) { UI.toast('Indiquez au moins une zone et un corps d\'état', 'err'); return false; }
      const ts = PLAN.generer({ entreprises: rows.map(r => r.e), zones, durees: rows.map(r => r.d), debut: UI.$('#gDeb', body).value, decalage: UI.$('#gLag', body).value, chainerZones: UI.$('#gChain', body).checked });
      ts.forEach(t => { const r = rows[rows.findIndex(x => x.e === t.entrepriseId)]; t.nom = `${r.n} — ${t.zone}`; S.data.taches.push(Object.assign(t, { cree: new Date().toISOString(), maj: new Date().toISOString() })); });
      S.log(`Planning : ${ts.length} tâches générées (${rows.length} corps d'état × ${zones.length} zones)`);
      S.persist(); APP.refresh(); UI.toast(`${ts.length} tâches créées et liées`);
    } }] });
  }

  function figer() {
    const P = APP.plan(), ref = { date: U.today(), taches: {} };
    S.list('taches').forEach(t => { const r = P.R.get(t.id); ref.taches[t.id] = { debut: r.prev.debut, fin: r.prev.fin }; });
    UI.confirm(`Figer le planning actuel comme planning de référence (au ${U.fr(U.today())}) ? Les retards seront ensuite mesurés par rapport à cette référence.`, () => { S.setReference(ref); S.log('Planning de référence figé'); UI.toast('Planning de référence enregistré'); }, 'Figer la référence');
  }


  function importer(payload, label) {
    UI.confirm(`Remplacer le planning actuel par ${label} ? Les tâches actuelles et leur historique d'avancement seront archivés. Les entreprises, le stock, les marchés et le journal sont conservés.`, () => {
      if (!S.can('taches')) { UI.toast('Droits insuffisants', 'err'); return; }
      const r = IMPORT.apply(S.data, payload); delete S.data.proposerV5; S.data.reference = null;
      S.persist(true); APP.refresh(); UI.toast(`Planning importé : ${r.taches} tâches, ${r.liens} liens`);
    }, 'Importer');
  }
  function importExcel() {
    UI.pickFile('.xlsx,.xls', buf => {
      try {
        const wb = XLSX.read(buf, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames.find(n => /planning/i.test(n)) || wb.SheetNames[0]];
        const rows = IMPORT.rowsFromSheet(XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }));
        if (!rows.length) throw new Error('aucune tâche reconnue');
        const all = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).slice(0, 4).flat().join(' ');
        const m = all.match(/situation au (\d{2})\/(\d{2})\/(\d{4})/i), rc = all.match(/r[ée]ception[^:]*:\s*(\d{1,2}) (\w+) (\d{4})/i);
        const MO = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };
        const point = m ? `${m[3]}-${m[2]}-${m[1]}` : U.today();
        const reception = rc && MO[U.norm(rc[2])] ? `${rc[3]}-${String(MO[U.norm(rc[2])]).padStart(2, '0')}-${rc[1].padStart(2, '0')}` : '';
        // les liens existants sont conservés quand les désignations des tâches correspondent
        const oldNames = new Map(S.list('taches').map(t => [t.id, t.nom]));
        const liens = []; S.list('taches').forEach(t => (t.predecesseurs || []).forEach(p => { if (oldNames.has(p.id)) liens.push([oldNames.get(p.id), t.nom, p.type, p.decalage]); }));
        if (typeof PLANV5 !== 'undefined') PLANV5.liens.forEach(l => liens.push(l));
        importer({ rows, liens, point, source: 'Import Excel du ' + U.fr(U.today()), reception }, `les ${rows.length} tâches du fichier (avancements au ${U.fr(point)})`);
      } catch (e) { UI.toast('Import impossible : ' + e.message, 'err'); }
    });
  }

  function bindAv(host) {
    UI.$$('.avq', host).forEach(inp => inp.onchange = () => {
      const t = S.get('taches', inp.dataset.id); const v = inp.value === '' ? null : Math.max(0, Math.min(100, U.num(inp.value)));
      const patch = { id: t.id, avancement: v, majAvancement: U.today() };
      if (v > 0 && !t.debutReel) patch.debutReel = APP.plan().R.get(t.id).prev.debut <= U.today() ? APP.plan().R.get(t.id).prev.debut : U.today();
      if (v === 100 && !t.finReel) patch.finReel = U.today();
      if (v !== 100 && t.finReel) patch.finReel = '';
      S.save('taches', patch, `Avancement « ${t.nom} » : ${v ?? '—'} %`);
      if (v !== null) S.save('avancements', { tacheId: t.id, date: U.today(), av: v, commentaire: '', auteur: S.user?.nom || '' });
    });
  }

  function rowsFiltered() {
    const P = APP.plan();
    return S.list('taches').map(t => ({ t, r: P.R.get(t.id), e: APP.ent(t.entrepriseId) })).filter(({ t, r, e }) => {
      if (st.ent && t.entrepriseId !== st.ent) return false;
      if (st.phase && (t.phase || 'Sans phase') !== st.phase) return false;
      if (st.type && r.type !== st.type) return false;
      if (st.crit && !r.critique) return false;
      if (st.etat === 'retard' && !r.enRetard) return false;
      if (st.etat === 'decale' && !r.decale) return false;
      if (st.etat === 'encours' && r.etat !== 'En cours' && r.etat !== 'Avancement non renseigné') return false;
      if (st.etat === 'avenir' && r.etat !== 'À venir') return false;
      if (st.etat === 'fini' && r.etat !== 'Terminée') return false;
      if (st.q && !U.norm(`${e?.nom} ${e?.corpsEtat} ${t.nom} ${t.zone} ${t.intervenant} ${t.phase}`).includes(U.norm(st.q))) return false;
      return true;
    });
  }
  const sortRows = rows => { const ph = phases(); return rows.sort((a, b) => (ph.indexOf(a.t.phase || 'Sans phase') - ph.indexOf(b.t.phase || 'Sans phase')) || a.r.prev.debut.localeCompare(b.r.prev.debut)); };

  function gantt(host, rowsIn) {
    const P = APP.plan(), p = S.data.projet; const rows = sortRows(rowsIn);
    if (!rows.length) { host.innerHTML = '<div class="card"><p class="muted">Aucune tâche pour ces filtres.</p></div>'; return; }
    let d0 = rows.reduce((m, x) => [x.r.plan.debut, x.r.prev.debut].reduce((a, b) => b < a ? b : a, m), rows[0].r.prev.debut);
    let d1 = rows.reduce((m, x) => [x.r.prev.fin, x.r.plan.fin].reduce((a, b) => b > a ? b : a, m), d0);
    if (p.dateFinContractuelle && p.dateFinContractuelle > d1) d1 = p.dateFinContractuelle;
    d0 = U.iso(new Date(U.parse(d0).getFullYear(), U.parse(d0).getMonth(), 1));
    d1 = U.iso(new Date(U.parse(d1).getFullYear(), U.parse(d1).getMonth() + 1, 0));
    const px = st.zoom, W = (U.diffDays(d0, d1) + 1) * px, X = d => U.diffDays(d0, d) * px;
    let mh = '', m = U.parse(d0);
    while (U.iso(m) <= d1) { const n = new Date(m.getFullYear(), m.getMonth() + 1, 1); const w = Math.min(U.diffDays(U.iso(m), U.iso(n)), U.diffDays(U.iso(m), d1) + 1) * px; mh += `<div class="gm" style="width:${w}px">${w > 38 ? U.moisAn(U.iso(m)) : ''}</div>`; m = n; }
    const todayX = X(U.today()), finX = p.dateFinContractuelle ? X(p.dateFinContractuelle) + px : null;
    const groups = []; rows.forEach(x => { const ph = x.t.phase || 'Sans phase'; let g = groups.find(g => g.ph === ph); if (!g) groups.push(g = { ph, rows: [] }); g.rows.push(x); });
    const rowHtml = ({ t, r, e }) => {
      const col = e?.couleur || '#B48F70';
      const ref = r.ref ? `<div class="gb-ref" style="left:${X(r.ref.debut)}px;width:${(U.diffDays(r.ref.debut, r.ref.fin) + 1) * px}px" title="Référence : ${U.fr(r.ref.debut)} → ${U.fr(r.ref.fin)}"></div>` : '';
      const ghost = (r.plan.debut !== r.prev.debut || r.plan.fin !== r.prev.fin) ? `<div class="gb-plan" style="left:${X(r.plan.debut)}px;width:${(U.diffDays(r.plan.debut, r.plan.fin) + 1) * px}px" title="Planifié : ${U.fr(r.plan.debut)} → ${U.fr(r.plan.fin)}"></div>` : '';
      const cls = r.type === 'Validation MO' ? 'mo' : r.type === 'Approvisionnement' ? 'ap' : r.type === 'Jalon' ? 'jal' : '';
      return `<div class="g-row ${r.critique ? 'crit' : ''} ${r.enRetard ? 'late' : ''}" data-id="${t.id}">
        <div class="g-left"><span class="gl-name"><i style="background:${col}"></i>${tb(r.type)}<b>${U.esc(e?.nom || '—')}</b> ${U.esc(t.nom || '')}</span>
        <span>${r.dur} j</span><span>${U.frShort(r.prev.debut)}</span><span class="${r.marge !== null && r.marge < 0 ? 'neg' : ''}" title="${r.decale ? 'Décalée de ' + r.decale + ' j ouvrés par ses prédécesseurs (date du planning source : ' + U.fr(t.debutImpose) + ')' : ''}">${U.fr(r.prev.fin)}${r.decale ? ' ⚠' : ''}</span>
        <span><input class="avq" type="number" min="0" max="100" value="${r.av ?? ''}" placeholder="—" data-id="${t.id}" title="Avancement réel (%)"></span>
        <span class="${r.marge !== null && r.marge < 0 ? 'neg' : r.critique ? 'warnc' : ''}">${r.etat === 'Terminée' ? '✓' : r.marge ?? ''}</span></div>
        <div class="g-track" style="width:${W}px">${ref}${ghost}<div class="gb ${cls}" style="left:${X(r.prev.debut)}px;width:${(U.diffDays(r.prev.debut, r.prev.fin) + 1) * px}px;--c:${col}" title="${U.esc(tname(t))}&#10;Prévu : ${U.fr(r.prev.debut)} → ${U.fr(r.prev.fin)}&#10;${r.etat}${r.av !== null ? ' — ' + r.av + ' %' : ''} · attendu ${r.attendu} %&#10;Marge : ${r.marge ?? '—'} j ouvrés${r.critique ? ' (critique)' : ''}"><i style="width:${r.av ?? 0}%"></i></div></div></div>`;
    };
    host.innerHTML = `<div class="gantt"><div class="g-head"><div class="g-left"><span>Phase / tâche</span><span>Durée</span><span>Début</span><span>Fin prévue</span><span>Av.</span><span>Marge</span></div><div class="g-months" style="width:${W}px">${mh}</div></div>
      <div class="g-body">${groups.map(g => {
        const deb = g.rows.reduce((m, x) => x.r.prev.debut < m ? x.r.prev.debut : m, g.rows[0].r.prev.debut), fin = g.rows.reduce((m, x) => x.r.prev.fin > m ? x.r.prev.fin : m, g.rows[0].r.prev.fin);
        const late = g.rows.filter(x => x.r.enRetard).length, closed = st.closed[g.ph];
        return `<div class="phase-h" data-ph="${U.esc(g.ph)}"><div class="g-left"><span>${closed ? '▸' : '▾'} ${U.esc(g.ph)}</span><span class="muted" style="font-weight:600">${g.rows.length} tâches${late ? ` · <span class="neg">${late} en retard</span>` : ''}</span></div><div class="g-track" style="width:${W}px"><div class="gb-plan" style="left:${X(deb)}px;width:${(U.diffDays(deb, fin) + 1) * px}px;top:15px;height:8px;background:#CDBBAB"></div></div></div>` + (closed ? '' : g.rows.map(rowHtml).join(''));
      }).join('')}<div class="g-today" style="left:calc(var(--gl) + ${todayX}px)" title="Aujourd'hui"></div>
      ${finX !== null ? `<div class="g-fin" style="left:calc(var(--gl) + ${finX}px)" title="Fin contractuelle ${U.fr(p.dateFinContractuelle)}"></div>` : ''}</div></div>`;
    UI.$$('.g-row', host).forEach(r => r.onclick = e => { if (e.target.closest('input')) return; editTask(S.get('taches', r.dataset.id)); });
    UI.$$('.phase-h', host).forEach(h => h.onclick = () => { st.closed[h.dataset.ph] = !st.closed[h.dataset.ph]; gantt(host, rowsIn); });
    bindAv(host);
    const sc = UI.$('.gantt', host); if (todayX > 300) sc.scrollLeft = todayX - 260;
  }

  function liste(host, rowsIn) {
    const rows = sortRows(rowsIn); let ph = null;
    host.innerHTML = rows.length ? `<div class="tlist">${rows.map(({ t, r, e }) => { const head = (t.phase || 'Sans phase') !== ph ? (ph = t.phase || 'Sans phase', `<h3 style="margin:10px 0 0;font-size:14px;color:var(--ink2)">${U.esc(ph)}</h3>`) : '';
      return head + `<div class="titem ${r.enRetard ? 'late' : ''}" style="--c:${e?.couleur || '#B48F70'}" data-id="${t.id}">
      <div>${tb(r.type)}<b>${U.esc(e?.nom || '—')}</b> · ${U.esc(t.nom || '')}<br><small>${U.fr(r.prev.debut)} → ${U.fr(r.prev.fin)} · ${r.dur} j · ${r.etat}${r.critique && r.etat !== 'Terminée' ? ' · <span class="neg">critique</span>' : ''}</small></div>
      <input class="avq" type="number" min="0" max="100" value="${r.av ?? ''}" placeholder="%" data-id="${t.id}">
      ${UI.bar(r.av ?? r.attendu, r.enRetard ? 'bad' : r.av === null ? 'na' : 'ok', r.av === null ? `≈ ${r.attendu} % (théorique)` : `${r.av} % · attendu ${r.attendu} %`)}</div>`; }).join('')}</div>` : '<div class="card"><p class="muted">Aucune tâche pour ces filtres.</p></div>';
    UI.$$('.titem', host).forEach(x => x.onclick = ev => { if (ev.target.closest('input')) return; editTask(S.get('taches', x.dataset.id)); });
    bindAv(host);
  }

  /* ---------- Point hebdomadaire ---------- */
  function point(host) {
    const P = APP.plan(), today = U.today(), date = st.pointDate || today;
    const from = U.addDays(date, -28), to = U.addDays(date, 14);
    const rows = sortRows(S.list('taches').map(t => ({ t, r: P.R.get(t.id), e: APP.ent(t.entrepriseId) })).filter(({ t, r }) => {
      if (r.etat === 'Terminée' || r.type === 'Jalon') return false;
      if (st.ent && t.entrepriseId !== st.ent) return false;
      const inWin = r.prev.debut <= to && r.prev.fin >= from;
      return inWin || (r.av === null && r.attendu > 0) || (r.av !== null && r.av < 100 && r.prev.debut <= date);
    }));
    const changes = new Map();
    host.innerHTML = `<div class="banner" style="background:#fff;border-color:var(--line)"><b>Point du</b><input type="date" id="ptDate" value="${date}"><select id="ptEnt"><option value="">Toutes les entreprises</option>${S.list('entreprises').sort(U.by('nom')).map(e => `<option value="${e.id}" ${st.ent === e.id ? 'selected' : ''}>${U.esc(e.nom)}</option>`).join('')}</select>
      <span class="muted">${rows.length} tâches à mettre à jour : en cours, attendues ou prévues dans les 2 semaines.</span><button class="btn primary" id="ptSave" style="margin-left:auto">${APP.icon('check', 16)} Enregistrer le point</button></div>
      <div class="ph-list">${rows.map(({ t, r, e }) => `<div class="pw" data-id="${t.id}">
        <div><div>${tb(r.type)}<b>${U.esc(t.nom)}</b></div><div class="meta">${U.esc(e?.nom || '')}${t.intervenant && t.intervenant !== e?.nom ? ' (' + U.esc(t.intervenant) + ')' : ''} · ${U.fr(r.prev.debut)} → ${U.fr(r.prev.fin)} · attendu <b>${r.attendu} %</b> · actuel <b>${r.av === null ? 'non renseigné' : r.av + ' %'}</b>${r.critique ? ' · <span class="neg">critique</span>' : ''}</div></div>
        <div class="quick">${[0, 25, 50, 75, 100].map(v => `<button type="button" data-q="${v}" class="${r.av === v ? 'on' : ''}">${v}</button>`).join('')}<input type="number" min="0" max="100" class="pv" value="${r.av ?? ''}" placeholder="%" style="width:66px;height:36px"></div>
        <div class="full" style="display:flex;gap:8px;align-items:center"><input class="pc" placeholder="Commentaire (difficulté, effectif, attente…)" style="flex:1"><button type="button" class="btn sm ghost pp" title="Ajouter une photo">${APP.icon('camera', 16)} ${UIX.photosOf('taches', t.id).length || ''}</button></div></div>`).join('') || '<div class="card"><p class="muted">Aucune tâche à mettre à jour pour cette période.</p></div>'}</div>`;
    UI.$('#ptDate', host).onchange = e => { st.pointDate = e.target.value; point(host); };
    UI.$('#ptEnt', host).onchange = e => { st.ent = e.target.value; point(host); };
    UI.$$('.pw', host).forEach(w => {
      const id = w.dataset.id, inp = UI.$('.pv', w), mark = v => { changes.set(id, Object.assign(changes.get(id) || {}, { av: v })); w.classList.add('chg'); UI.$$('.quick button', w).forEach(b => b.classList.toggle('on', +b.dataset.q === v)); };
      UI.$$('.quick button', w).forEach(b => b.onclick = () => { inp.value = b.dataset.q; mark(+b.dataset.q); });
      inp.oninput = () => { if (inp.value !== '') mark(Math.max(0, Math.min(100, U.num(inp.value)))); };
      UI.$('.pc', w).oninput = e => { changes.set(id, Object.assign(changes.get(id) || {}, { com: e.target.value })); w.classList.add('chg'); };
      UI.$('.pp', w).onclick = () => UIX.addPhotos({ col: 'taches', id }, S.get('taches', id).nom + ' — point du ' + U.fr(date));
    });
    UI.$('#ptSave', host).onclick = () => {
      if (!S.can('taches')) { UI.toast('Droits insuffisants pour saisir l\'avancement', 'err'); return; }
      let n = 0; const now = new Date().toISOString();
      changes.forEach((c, id) => {
        const t = S.data.taches.find(x => x.id === id); if (!t) return;
        if (c.av !== undefined && c.av !== t.avancement) {
          t.avancement = c.av; t.majAvancement = date; t.maj = now;
          if (c.av > 0 && !t.debutReel) t.debutReel = APP.plan().R.get(id).prev.debut <= date ? APP.plan().R.get(id).prev.debut : date;
          if (c.av === 100 && !t.finReel) t.finReel = date; if (c.av !== 100 && t.finReel) t.finReel = '';
        }
        if (c.av !== undefined || c.com) { S.data.avancements.push({ id: U.uid(), cree: now, maj: now, tacheId: id, date, av: c.av ?? t.avancement ?? 0, commentaire: c.com || '', auteur: S.user?.nom || '' }); n++; }
      });
      if (!n) { UI.toast('Aucune modification'); return; }
      S.log(`Point d'avancement du ${U.fr(date)} : ${n} tâche(s) mises à jour`); S.persist(true); APP.refresh(); UI.toast(`Point enregistré : ${n} tâche(s)`);
    };
  }

  /* ---------- Courbe en S ---------- */
  function svgCourbe(w = 900, h = 300) {
    const P = APP.plan(), p = S.data.projet, T = S.list('taches');
    const from = p.dateDebut || T.reduce((m, t) => { const r = P.R.get(t.id); return !m || r.plan.debut < m ? r.plan.debut : m; }, null) || U.today();
    const to = [p.dateFinContractuelle, P.finPrevue].filter(Boolean).sort().pop();
    const pts = PLAN.courbeS(T, P, S.list('avancements'), from, to);
    const n = pts.length, L = 44, B = 30, Wd = w - L - 12, Hd = h - B - 12;
    const x = i => L + (n > 1 ? i * Wd / (n - 1) : 0), y = v => 12 + Hd - v / 100 * Hd;
    const line = (k) => { let d = '', on = false; pts.forEach((q, i) => { if (q[k] === null) { on = false; return; } d += (on ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(q[k]).toFixed(1); on = true; }); return d; };
    const ti = pts.findIndex(q => q.d > U.today()); const tx = ti < 0 ? x(n - 1) : x(Math.max(0, ti - 1));
    const lastR = [...pts].reverse().find(q => q.reel !== null), atT = pts[Math.max(0, ti - 1)] || pts[n - 1];
    const nm = Math.max(1, Math.ceil(n / 4.35 / 12)); let labs = '', mi = 0; pts.forEach((q, i) => { if (+q.d.slice(8, 10) <= 7) { if (mi % nm === 0) labs += `<text x="${x(i)}" y="${h - 8}" text-anchor="middle">${U.moisAn(q.d)}</text>`; mi++; } });
    return { svg: `<svg class="scurve" viewBox="0 0 ${w} ${h}" role="img" aria-label="Courbe en S">${[0, 25, 50, 75, 100].map(v => `<line class="grid" x1="${L}" x2="${w - 12}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v} %</text>`).join('')}
      <path class="area" d="${line('prevu')}L${x(n - 1)} ${y(0)}L${x(0)} ${y(0)}Z"/><path class="prev" d="${line('prevu')}"/><path class="reel" d="${line('reel')}"/>
      <line class="today" x1="${tx}" x2="${tx}" y1="12" y2="${12 + Hd}"/>${labs}</svg>`, prevuAuj: atT ? atT.prevu : 0, reel: lastR ? lastR.reel : null, pts };
  }
  function courbe(host) {
    const P = APP.plan(), c = svgCourbe();
    const T = S.list('taches');
    const ph = phases().map(name => { let w = 0, a = 0, x = 0, mo = 0, mop = 0; T.filter(t => (t.phase || 'Sans phase') === name).forEach(t => { const r = P.R.get(t.id); if (r.type === 'Validation MO') { mo++; if (r.etat !== 'Terminée') mop++; } if (!r.poids) return; w += r.poids; a += r.poids * (r.av ?? r.attendu) / 100; x += r.poids * r.attendu / 100; }); return { name, av: w ? Math.round(100 * a / w) : null, att: w ? Math.round(100 * x / w) : null, mo, mop }; });
    host.innerHTML = `<div class="card"><h3>Courbe en S — avancement physique pondéré</h3>${c.svg}
      <p class="muted small">Pointillés : avancement prévu par le planning. Trait plein : avancement réel issu des points saisis. Seuls les travaux comptent (validations MO, approvisionnements et jalons exclus). Prévu à ce jour : <b>${Math.round(c.prevuAuj)} %</b> · dernier réel connu : <b>${c.reel === null ? '—' : Math.round(c.reel) + ' %'}</b>.</p></div>
      <div class="card"><h3>Par phase</h3><div class="lotrows">${ph.map(x => `<div class="lotrow"><div><b>${U.esc(x.name)}</b><small>${x.mo ? `${x.mop}/${x.mo} validation(s) MO en attente` : ''}</small></div><div class="tr"><i style="width:${x.av ?? 0}%"></i></div><em>${x.av === null ? '—' : x.av + ' % / ' + x.att + ' %'}</em></div>`).join('')}</div><p class="muted small" style="margin:10px 0 0">Réel (ou théorique si non saisi) / attendu à ce jour.</p></div>`;
  }

  function render(v) {
    const P = APP.plan();
    const nDec = S.list('taches').filter(t => P.R.get(t.id)?.decale).length;
    const nMO = S.list('taches').filter(t => { const r = P.R.get(t.id); return r.type === 'Validation MO' && r.etat !== 'Terminée'; }).length;
    v.innerHTML = `${S.data.proposerV5 ? `<div class="banner">${APP.icon('rapports', 20)}<div style="flex:1"><b>Planning général v5 disponible</b><br><span class="muted">116 tâches en 5 phases, 69 liens logiques, avancements au 19/08/2026. Il remplacera le planning simplifié actuel.</span></div><button class="btn primary" id="pV5">Importer le planning v5</button></div>` : ''}
      <div class="tabs">${[['gantt', 'Gantt'], ['liste', 'Liste'], ['point', 'Point hebdo'], ['courbe', 'Courbe en S']].map(([k, l]) => `<button data-v="${k}" class="${st.vue === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${['gantt', 'liste'].includes(st.vue) ? `<div class="toolbar">
        <button class="btn primary" id="pAdd">+ Tâche</button><button class="btn" id="pGen">${APP.icon('gear', 15)} Générateur</button><button class="btn" id="pRef">${APP.icon('flag', 15)} Figer la référence</button><button class="btn ghost" id="pImp">${APP.icon('upload', 15)} Importer Excel</button>
        <span class="sep"></span>
        <input type="search" id="pQ" placeholder="Rechercher…" value="${U.esc(st.q)}">
        <select id="pPh"><option value="">Toutes les phases</option>${phases().map(x => `<option ${st.phase === x ? 'selected' : ''}>${U.esc(x)}</option>`).join('')}</select>
        <select id="pTy"><option value="">Tous les types</option>${TYPES.map(x => `<option ${st.type === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
        <select id="pEnt"><option value="">Toutes les entreprises</option>${S.list('entreprises').sort(U.by('nom')).map(e => `<option value="${e.id}" ${st.ent === e.id ? 'selected' : ''}>${U.esc(e.nom)}</option>`).join('')}</select>
        <select id="pEtat"><option value="">Tous les états</option>${[['retard', 'En retard'], ['decale', 'Décalées par les liens'], ['encours', 'En cours'], ['avenir', 'À venir'], ['fini', 'Terminées']].map(([a, b]) => `<option value="${a}" ${st.etat === a ? 'selected' : ''}>${b}</option>`).join('')}</select>
        <label class="chk"><input type="checkbox" id="pCrit" ${st.crit ? 'checked' : ''}> Chemin critique</label>
        ${st.vue === 'gantt' ? `<div class="seg"><button data-z="2" class="${st.zoom === 2 ? 'on' : ''}">Trimestre</button><button data-z="3" class="${st.zoom === 3 ? 'on' : ''}">Mois</button><button data-z="9" class="${st.zoom === 9 ? 'on' : ''}">Semaine</button></div>` : ''}
        <button class="btn ghost" id="pXls">${APP.icon('download', 15)} Excel</button></div>
        <div class="infobar">Fin prévisionnelle <b>${U.fr(P.finPrevue)}</b> · fin contractuelle <b>${U.fr(S.data.projet.dateFinContractuelle) || '—'}</b>${(S.data.projet.avenantsDelai || []).length ? ` <span class="muted">(initiale ${U.fr(S.data.projet.dateFinInitiale)})</span>` : ''} · ${P.ecartFin > 0 ? `<b class="neg">dépassement prévisible +${P.ecartFin} j ouvrés</b>` : '<b class="pos">dans les délais</b>'} <a href="#" id="pDelai">Délai contractuel…</a> · marge minimale ${P.minMarge} j · <b>${nMO}</b> validation(s) MO en attente${nDec ? ` · <a href="#" id="pDec" class="neg">${nDec} tâche(s) décalée(s) par les liens</a>` : ''}
        <span class="legend"><i class="lg-bar"></i>Prévision <i class="lg-plan"></i>Planifié <i class="lg-ref"></i>Référence <i class="lg-crit"></i>Critique <i class="lg-today"></i>Aujourd'hui</span></div>` : ''}
        <div id="pG"></div>`;
    if (UI.$('#pDelai', v)) UI.$('#pDelai', v).onclick = e => { e.preventDefault(); delai(); };
    const host = UI.$('#pG', v);
    const draw = () => st.vue === 'liste' ? liste(host, rowsFiltered()) : st.vue === 'point' ? point(host) : st.vue === 'courbe' ? courbe(host) : gantt(host, rowsFiltered());
    draw();
    UI.$$('.tabs [data-v]', v).forEach(b => b.onclick = () => { st.vue = b.dataset.v; APP.refresh(); });
    if (UI.$('#pV5', v)) UI.$('#pV5', v).onclick = () => importer({ rows: PLANV5.taches, liens: PLANV5.liens, point: PLANV5.pointSituation, source: PLANV5.source, reception: PLANV5.reception }, 'le planning général v5 (116 tâches)');
    if (!['gantt', 'liste'].includes(st.vue)) return;
    UI.$('#pAdd', v).onclick = () => editTask({ duree: 5, predecesseurs: [], phase: st.phase || '' });
    UI.$('#pGen', v).onclick = generateur; UI.$('#pRef', v).onclick = figer; UI.$('#pImp', v).onclick = importExcel;
    if (UI.$('#pDec', v)) UI.$('#pDec', v).onclick = e => { e.preventDefault(); st.etat = 'decale'; APP.refresh(); };
    UI.$('#pQ', v).oninput = U.debounce(e => { st.q = e.target.value; draw(); }, 200);
    [['#pEnt', 'ent'], ['#pEtat', 'etat'], ['#pPh', 'phase'], ['#pTy', 'type']].forEach(([s, k]) => UI.$(s, v).onchange = e => { st[k] = e.target.value; draw(); });
    UI.$('#pCrit', v).onchange = e => { st.crit = e.target.checked; draw(); };
    UI.$$('[data-z]', v).forEach(b => b.onclick = () => { st.zoom = +b.dataset.z; APP.refresh(); });
    UI.$('#pXls', v).onclick = () => {
      const rows = sortRows(rowsFiltered());
      UI.xlsx(`STRAM_Planning_${U.today()}.xlsx`, { Planning: [['Phase', 'Type', 'Tâche', 'Intervenant', 'Entreprise', 'Durée (j ouvrés)', 'Début planifié', 'Fin planifiée', 'Début prévu', 'Fin prévue', 'Avancement %', 'Attendu %', 'Marge (j)', 'Critique', 'État', 'Décalage liens (j)', 'Prédécesseurs'],
        ...rows.map(({ t, r, e }) => [t.phase, r.type, t.nom, t.intervenant, e?.nom, r.dur, U.fr(r.plan.debut), U.fr(r.plan.fin), U.fr(r.prev.debut), U.fr(r.prev.fin), r.av ?? '', r.attendu, r.marge ?? '', r.critique ? 'Oui' : '', r.etat, r.decale || '', (t.predecesseurs || []).map(p => (S.get('taches', p.id)?.nom || '?') + ' (' + p.type + (U.num(p.decalage) ? (p.decalage > 0 ? '+' : '') + p.decalage : '') + ')').join(' ; ')])] });
    };
  }

  APP.mod('planning', {
    title: 'Planning des corps d\'état', nav: 'Planning', short: 'Planning', group: 'Pilotage', mobile: true, sub: 'Phases, liens, point hebdomadaire et courbe en S',
    badge: () => { const P = APP.plan(); return S.list('taches').filter(t => P.R.get(t.id)?.enRetard).length; },
    render,
  });
  /* ---------- délai contractuel : initial + prolongations (avenants, ordres de service) ---------- */
  function finActuelle(p) { const av = (p.avenantsDelai || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')); return av.length ? av[av.length - 1].nouvelleFin : (p.dateFinInitiale || p.dateFinContractuelle || ''); }
  function delai() {
    const p = S.data.projet, P = APP.plan();
    const av = (p.avenantsDelai || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const body = document.createElement('div');
    const ini = p.dateFinInitiale || p.dateFinContractuelle || '';
    body.innerHTML = `<p>Le délai contractuel n'est pas figé : chaque prolongation accordée (avenant, ordre de service) est enregistrée ici avec son motif. La fin prévisionnelle, elle, est calculée par le planning et peut dépasser la fin contractuelle : l'écart est alors signalé partout (tableau de bord, planning, rapports).</p>
      <div class="kp2"><div><span>Fin contractuelle initiale</span><b>${U.fr(ini) || '—'}</b></div><div><span>Fin contractuelle actuelle</span><b>${U.fr(p.dateFinContractuelle) || '—'}</b></div><div><span>Fin prévisionnelle (planning)</span><b class="${P.ecartFin > 0 ? 'neg' : ''}">${U.fr(P.finPrevue)}</b></div><div><span>Écart</span><b class="${P.ecartFin > 0 ? 'neg' : 'pos'}">${P.ecartFin > 0 ? '+' + P.ecartFin + ' j ouvrés' : 'dans les délais'}</b></div></div>
      <h4 style="margin:16px 0 6px">Prolongations accordées</h4>
      ${av.length ? `<table class="tbl mini"><thead><tr><th>Date</th><th>Référence</th><th>Motif</th><th>Nouvelle fin</th><th class="r">Jours</th><th></th></tr></thead><tbody>${av.map(a => `<tr><td>${U.fr(a.date)}</td><td>${U.esc(a.ref || '')}</td><td>${U.esc(a.motif || '')}</td><td><b>${U.fr(a.nouvelleFin)}</b></td><td class="r">+${U.diffDays(a.ancienneFin || ini, a.nouvelleFin)} j</td><td><button type="button" class="icon-btn" data-del="${a.id}" aria-label="Retirer">✕</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucune prolongation : la fin contractuelle est la fin initiale.</p>'}
      <h4 style="margin:16px 0 6px">Enregistrer une prolongation</h4>
      <div class="grid-form"><div class="field"><label>Nouvelle date de fin contractuelle</label><input type="date" id="dNew" value="${P.ecartFin > 0 ? P.finPrevue : ''}"></div><div class="field"><label>Référence (avenant n°, OS n°…)</label><input id="dRef" placeholder="Avenant n°1"></div>
      <div class="field full"><label>Motif</label><input id="dMot" list="dlMot" placeholder="Intempéries, retard de décision MO, travaux supplémentaires…"><datalist id="dlMot"><option value="Intempéries"><option value="Retard de décision du maître d'ouvrage"><option value="Travaux supplémentaires"><option value="Retard d'approvisionnement"><option value="Retard d'un concessionnaire (Senelec, Sonatel…)"></datalist></div>
      <div class="field"><label>Date de la décision</label><input type="date" id="dDate" value="${U.today()}"></div></div>
      <p class="small muted">Fin initiale : à modifier seulement si le contrat d'origine a été mal saisi.</p><div class="grid-form"><div class="field"><label>Fin contractuelle initiale</label><input type="date" id="dIni" value="${ini}"></div></div>`;
    const save = (patch, lib) => { try { S.setProjet(patch); if (lib) S.log(lib); } catch (e) { UI.toast(e.message, 'err'); return false; } };
    const m = UI.modal({ title: 'Délai contractuel', wide: true, body, actions: [{ label: 'Fermer' }, { label: 'Enregistrer', cls: 'primary', onClick: () => {
      const nv = UI.$('#dNew', body).value, newIni = UI.$('#dIni', body).value;
      const patch = {};
      if (newIni && newIni !== ini) patch.dateFinInitiale = newIni;
      let list = (p.avenantsDelai || []).slice();
      if (nv) {
        const cur = p.dateFinContractuelle || ini;
        if (nv <= cur) { UI.toast(`La nouvelle date doit être après la fin actuelle (${U.fr(cur)})`, 'err'); return false; }
        list.push({ id: U.uid(), date: UI.$('#dDate', body).value || U.today(), ref: UI.$('#dRef', body).value.trim(), motif: UI.$('#dMot', body).value.trim(), ancienneFin: cur, nouvelleFin: nv });
        patch.avenantsDelai = list;
      }
      if (!Object.keys(patch).length) return;
      const q = Object.assign({}, p, patch); patch.dateFinContractuelle = finActuelle(q);
      if (save(patch, nv ? `Délai contractuel prolongé au ${U.fr(nv)}${patch.avenantsDelai.slice(-1)[0].ref ? ' (' + patch.avenantsDelai.slice(-1)[0].ref + ')' : ''}` : 'Fin contractuelle initiale corrigée') === false) return false;
      UI.toast('Délai contractuel enregistré');
    } }] });
    UI.$$('[data-del]', body).forEach(b => b.onclick = () => UI.confirm('Retirer cette prolongation ?', () => {
      const list = (p.avenantsDelai || []).filter(a => a.id !== b.dataset.del); const q = Object.assign({}, p, { avenantsDelai: list });
      save({ avenantsDelai: list, dateFinContractuelle: finActuelle(q) }, 'Prolongation de délai retirée'); m.close(); setTimeout(delai, 100);
    }, 'Retirer'));
  }
  return { editTask, svgCourbe, tb, delai, finActuelle };
})();
