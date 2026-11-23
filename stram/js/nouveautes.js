/* STRAM Suivi — pastilles : nouveautés du logiciel et modifications reçues des autres appareils */
'use strict';
const NOUV = (() => {
  const VERSION = '2.6.2';
  const NOTES = [
    { v: '2.6.2', date: '23/11/2026', mods: ['dashboard'], items: [
      'Liaison directe avec la base de données : une saisie faite sur le PC apparaît en une à deux secondes sur la version web et le mobile, et inversement (point vert « liaison directe » en bas du menu).'] },
    { v: '2.6.1', date: '23/11/2026', mods: ['parametres'], items: [
      'Mises à jour automatiques : le logiciel Windows télécharge seul chaque nouvelle version et propose de redémarrer (ou l\'installe à la fermeture).',
      'La version web et l\'application Android se mettent à jour d\'elles-mêmes dès qu\'une nouvelle version est publiée.'] },
    { v: '2.6.0', date: '23/11/2026', mods: ['parametres', 'dashboard'], items: [
      'Connexion automatique à la base en ligne « Chantier STRAM » : plus de clé à saisir, chaque appareil se synchronise tout seul.',
      'Pastilles bleues dans le menu : elles signalent les modules modifiés depuis un autre appareil depuis votre dernière visite.',
      'Étiquettes « Nouveau » sur les écrans changés par la mise à jour, et cette fenêtre « Quoi de neuf ».'] },
    { v: '2.5.1', date: '23/11/2026', mods: ['rapports'], items: ['Rapports : ajout de tâches (du planning ou libres) dans les travaux de la période et le programme ; retrait de lignes du rapport.'] },
    { v: '2.5.0', date: '23/11/2026', mods: ['rapports'], items: ['Rapports hebdomadaire et mensuel remplissables : statuts définis et modifiables, textes libres, contrôle de cohérence, validation et transmission avec contenu figé.'] },
  ];
  const MAP = { taches: 'planning', avancements: 'planning', lots: 'planning', entreprises: 'planning', articles: 'stock', mouvements: 'stock', commandes: 'commandes', fournisseurs: 'commandes',
    marches: 'finances', situations: 'finances', budget: 'finances', journal: 'chantier', reunions: 'chantier', actions: 'chantier', acces: 'acces', personnes: 'acces', habilites: 'acces',
    reserves: 'qualite', plans: 'qualite', essais: 'qualite', autocontroles: 'qualite', opr: 'qualite', documents: 'qualite', rapports: 'rapports', utilisateurs: 'parametres' };
  const LR = 'stram-recents', LV = 'stram-vu-version', LN = 'stram-nouveau-vus';
  const lire = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (e) { return def; } };
  const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const cmp = (a, b) => { const x = String(a || '0').split('.').map(Number), y = String(b || '0').split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };
  const E = s => U.esc(s);
  const hm = t => new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  /* nouveautés pas encore vues sur cet appareil */
  function vuVersion() {
    let v = lire(LV, null);
    if (v === null) { // première ouverture : un nouvel appareil n'a pas d'historique de versions
      const ancien = (S.data.historique || []).length > 1;
      v = ancien ? '2.4.0' : VERSION; ecrire(LV, v);
    }
    return v;
  }
  const notesNonVues = () => NOTES.filter(n => cmp(n.v, vuVersion()) > 0);
  const modsNouveaux = () => { const vus = lire(LN, []); return [...new Set(notesNonVues().flatMap(n => n.mods))].filter(m => !vus.includes(m)); };

  /* modifications reçues des autres appareils */
  function recevoir(rows) {
    if (!rows || !rows.length) return;
    const r = lire(LR, {}); const now = new Date().toISOString(); let n = 0; const textes = [];
    rows.forEach(o => {
      if (o.col === '_hist' && o.data && o.data.texte) { textes.push({ t: o.data.t || now, texte: o.data.texte }); return; }
      const m = MAP[o.col]; if (!m || m === APP.current) return;
      r[m] = r[m] || { n: 0, depuis: now }; r[m].n++; r[m].t = now; n++;
    });
    if (textes.length) { const j = lire(LR + '-journal', []); ecrire(LR + '-journal', [...textes, ...j].sort((a, b) => b.t.localeCompare(a.t)).slice(0, 40)); }
    ecrire(LR, r); paint();
    if (n) UI.toast(`${n} modification(s) reçue(s) d'un autre appareil`);
  }
  function vu(mod) {
    const r = lire(LR, {}); if (r[mod]) { delete r[mod]; ecrire(LR, r); }
    if (modsNouveaux().includes(mod)) { const vus = lire(LN, []); vus.push(mod); ecrire(LN, vus); if (!modsNouveaux().length) { ecrire(LV, VERSION); ecrire(LN, []); } }
    paint();
  }
  function paint() {
    const r = lire(LR, {}), nv = modsNouveaux();
    document.querySelectorAll('#nav a[data-id]').forEach(a => {
      const id = a.dataset.id;
      a.querySelectorAll('.ndot,.ntag').forEach(x => x.remove());
      const em = a.querySelector('.nbadge');
      if (nv.includes(id)) em.insertAdjacentHTML('beforebegin', '<span class="ntag" title="Écran modifié par la dernière mise à jour">Nouveau</span>');
      if (r[id]) em.insertAdjacentHTML('beforebegin', `<span class="ndot" title="${r[id].n} modification(s) faite(s) depuis un autre appareil (dernière le ${hm(r[id].t)})"></span>`);
    });
    const total = Object.keys(r).length + nv.length;
    const b = document.getElementById('btnNouv');
    if (b) { b.classList.toggle('on', total > 0); b.querySelector('b').textContent = total || ''; }
  }

  function panneau() {
    const r = lire(LR, {}), j = lire(LR + '-journal', []), nn = notesNonVues();
    const nomMod = id => (APP.mods.find(m => m.id === id) || {}).title || id;
    const body = `
      <h4 style="margin:0 0 8px">Modifications reçues des autres appareils</h4>
      ${Object.keys(r).length ? `<ul class="nv-list">${Object.entries(r).map(([m, x]) => `<li><span class="ndot"></span><a href="#${m}" data-close>${E(nomMod(m))}</a> — ${x.n} modification(s), dernière le ${hm(x.t)}</li>`).join('')}</ul>` : '<p class="muted">Aucune modification non vue.</p>'}
      ${j.length ? `<details style="margin:6px 0 14px"><summary class="muted">Dernières actions des autres utilisateurs</summary><ul class="nv-journal">${j.slice(0, 15).map(h => `<li><span class="muted">${hm(h.t)}</span> ${E(h.texte)}</li>`).join('')}</ul></details>` : ''}
      <h4 style="margin:14px 0 8px">Quoi de neuf dans STRAM Suivi</h4>
      ${NOTES.map(n => `<div class="nv-ver ${nn.includes(n) ? 'new' : ''}"><b>Version ${n.v}</b> <span class="muted">· ${n.date}</span>${nn.includes(n) ? ' <span class="ntag">Nouveau</span>' : ''}<ul>${n.items.map(i => `<li>${E(i)}</li>`).join('')}</ul></div>`).join('')}`;
    const m = UI.modal({ title: 'Nouveautés et modifications récentes', body, actions: [
      { label: 'Tout marquer comme vu', onClick: () => { ecrire(LR, {}); ecrire(LV, VERSION); ecrire(LN, []); paint(); } },
      { label: 'Fermer', cls: 'primary' }] });
    ecrire('stram-popup-version', VERSION);
    document.querySelectorAll('[data-close]').forEach(a => a.addEventListener('click', () => document.querySelectorAll('.overlay').forEach(o => o.remove())));
    return m;
  }

  /* ---- mises à jour automatiques ---- */
  const versionCourante = () => (document.getElementById('ver') || {}).textContent || VERSION;
  const saisieEnCours = () => { const ae = document.activeElement; return !!(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.closest('#view, .modal') && ae.value) || [...document.querySelectorAll('.badge.b-red')].some(b => /non enregistr/.test(b.textContent)); };
  function proposerRedemarrage(info) {
    if (document.getElementById('majModal')) return;
    const m = UI.modal({ title: 'Mise à jour ' + info.version + ' prête', body: `<div id="majModal"></div><p>La nouvelle version de STRAM Suivi a été téléchargée automatiquement.</p>${info.notes ? `<p class="muted">${E(info.notes)}</p>` : ''}<p>Elle s'installe en quelques secondes ; vos données sont conservées.</p>`,
      actions: [{ label: 'À la fermeture du logiciel', onClick: () => { S.host.installUpdate('plus-tard'); UI.toast('La mise à jour s\'installera à la fermeture de STRAM Suivi'); } },
        { label: 'Redémarrer maintenant', cls: 'primary', onClick: () => { S.persist(true).then(() => S.host.installUpdate('maintenant')); } }] });
    return m;
  }
  let webVu = '';
  async function verifierWeb() {
    if (S.host || !/^https?:/.test(location.protocol)) return;
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
      const j = await r.json(); if (!j.version || cmp(j.version, versionCourante()) <= 0 || webVu === j.version) return;
      const go = async () => {
        if (saisieEnCours()) return setTimeout(go, 30000);
        webVu = j.version; try { if (sessionStorage.getItem('stram-maj-tentee') === j.version) return; sessionStorage.setItem('stram-maj-tentee', j.version); } catch (e) { }
        UI.toast('Nouvelle version ' + j.version + ' : mise à jour en cours…');
        try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) await reg.update(); } catch (e) { }
        setTimeout(() => location.reload(), 1500);
      };
      go();
    } catch (e) { /* hors ligne : nouvel essai plus tard */ }
  }
  function majAuto() {
    if (S.host && S.host.onUpdateReady) {
      S.host.onUpdateReady(info => proposerRedemarrage(info));
      S.host.updateStatus && S.host.updateStatus().then(i => i && proposerRedemarrage(i));
    } else {
      setTimeout(verifierWeb, 5000); setInterval(verifierWeb, 15 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verifierWeb(); });
    }
  }

  function start() {
    majAuto();
    const f = document.querySelector('.sidebar .ver, .ver');
    if (f && !document.getElementById('btnNouv')) f.insertAdjacentHTML('afterend', '<button id="btnNouv" class="nv-btn" title="Nouveautés et modifications récentes">Nouveautés <b></b></button>');
    const b = document.getElementById('btnNouv'); if (b) b.onclick = () => panneau();
    paint();
    if (notesNonVues().length && lire('stram-popup-version', '') !== VERSION) setTimeout(() => { if (!document.querySelector('.overlay')) panneau(); }, 1500);
  }
  return { VERSION, recevoir, vu, paint, panneau, start };
})();
