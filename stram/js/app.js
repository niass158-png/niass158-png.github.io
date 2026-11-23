/* STRAM Suivi — coquille de l'application : navigation, en-tête, synchronisation */
'use strict';
const APP = (() => {
  const mods = [];
  let current = null;
  const GROUPS = ['Pilotage', 'Logistique', 'Finances', 'Chantier', 'Système'];
  const mod = (id, def) => mods.push(Object.assign({ id }, def));
  const P = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    planning: '<path d="M4 6h10M4 12h16M4 18h7"/>',
    stock: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/>',
    commandes: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    finances: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
    chantier: '<path d="M5 4h11l3 3v13H5z"/><path d="M9 10h6M9 14h6"/>',
    acces: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4a3 3 0 010 6M21 20c0-2.6-1.6-4.8-4-5.6"/>',
    parametres: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    sync: '<path d="M21 12a9 9 0 01-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0115.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v7h-4M14 18v3"/>', scan: '<path d="M3 7V4a1 1 0 011-1h3M17 3h3a1 1 0 011 1v3M21 17v3a1 1 0 01-1 1h-3M7 21H4a1 1 0 01-1-1v-3M7 12h10"/>',
    rapports: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 17v-3M12 17v-6M15 17v-4"/>', qualite: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
    point: '<path d="M4 20h16"/><path d="M6 16l4-5 3 3 5-7"/>', bell: '<path d="M6 16V11a6 6 0 1112 0v5l2 2H4z"/><path d="M10 20a2 2 0 004 0"/>', chat: '<path d="M4 5h16v11H9l-5 4z"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>', lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>', send: '<path d="M4 12l16-8-6 16-2-7z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 21h16"/>', upload: '<path d="M12 21V9M7 14l5-5 5 5"/><path d="M4 3h16"/>',
    print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>', flag: '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>', undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>', folder: '<path d="M3 6a2 2 0 012-2h4l2 3h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>', enter: '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/>', check: '<path d="M5 12l5 5L20 7"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', box: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/>', trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>', coin: '<circle cx="12" cy="12" r="9"/><path d="M9 9h4.5a2 2 0 010 4H9v4M9 13h5"/>',
  };
  const icon = (n, size = 18) => `<svg class="i" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${P[n] || ''}</svg>`;

  function nav() {
    const n = UI.$('#nav');
    n.innerHTML = GROUPS.map(g => {
      const items = mods.filter(m => m.group === g);
      return items.length ? `<div class="ngroup">${g}</div>` + items.map(m => `<a href="#${m.id}" data-id="${m.id}" class="${current === m.id ? 'on' : ''}"><span class="ni">${icon(m.id)}</span>${m.nav || m.title}<em class="nbadge" id="nb_${m.id}"></em></a>`).join('') : '';
    }).join('');
    const b = UI.$('#bottomNav');
    b.innerHTML = mods.filter(m => m.mobile).map(m => `<a href="#${m.id}" class="${current === m.id ? 'on' : ''}">${icon(m.id, 21)}${m.short || m.title}</a>`).join('') + `<a href="#" id="moreBtn">${icon('menu', 21)}Plus</a>`;
    UI.$('#moreBtn').onclick = e => { e.preventDefault(); document.body.classList.toggle('side-open'); };
    badges();
  }
  function badges() {
    mods.forEach(m => { const el = document.getElementById('nb_' + m.id); if (!el || !m.badge) return; const v = m.badge(); el.textContent = v || ''; el.style.display = v ? 'inline-block' : 'none'; });
    if (typeof NOUV !== 'undefined') NOUV.paint();
  }
  function header() {
    const p = S.data.projet;
    UI.$('#brandSub').textContent = p.intitule || 'Projet ' + (p.nom || '');
    if (typeof CLOUD !== 'undefined') CLOUD.paint();
    const cd = UI.$('#countdown');
    if (p.dateFinContractuelle) {
      const j = U.diffDays(U.today(), p.dateFinContractuelle);
      cd.innerHTML = `<span>Fin contractuelle</span><b>${U.fr(p.dateFinContractuelle)}</b><em class="${j < 0 ? 'neg' : j < 60 ? 'warn' : ''}">${j >= 0 ? 'J-' + j : 'Dépassée de ' + (-j) + ' j'}</em>`;
    } else cd.innerHTML = '';
  }
  function go(id) {
    const m = mods.find(x => x.id === id) || mods[0];
    current = m.id;
    document.body.classList.remove('side-open');
    UI.$('#pageTitle').textContent = m.title;
    UI.$('#pageSub').textContent = m.sub || '';
    const v = UI.$('#view'); v.innerHTML = ''; v.className = 'view-' + m.id;
    try { m.render(v); } catch (e) { console.error(e); v.innerHTML = `<div class="card err">Erreur d'affichage : ${U.esc(e.message)}</div>`; }
    UI.$$('#nav a, #bottomNav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + m.id));
    v.scrollTop = 0; window.scrollTo(0, 0);
    if (typeof NOUV !== 'undefined') NOUV.vu(m.id);
  }
  const refresh = () => { header(); badges(); if (current) { const y = UI.$('#view').scrollTop; go(current); UI.$('#view').scrollTop = y; } };

  function syncDialog() {
    const isApp = !!S.host;
    UI.modal({
      title: 'Synchroniser PC ↔ mobile', wide: false,
      body: `<div class="banner" style="margin-bottom:12px"><b>Nouveau :</b> reliez vos appareils à la base de données en ligne pour une synchronisation automatique. <a href="#" id="goCloud">Paramètres › Base de données en ligne</a></div><p>Les données sont gardées <b>sur cet appareil</b>. Pour échanger les saisies entre le PC du bureau et le téléphone du chantier :</p>
        <ol class="steps"><li><b>Exporter</b> un fichier de synchronisation sur l'appareil qui a les nouvelles saisies.</li>
        <li>Le transférer (WhatsApp, e-mail, clé USB…).</li><li><b>Importer</b> ce fichier sur l'autre appareil : les données sont fusionnées, la modification la plus récente l'emporte.</li></ol>
        <p class="muted">${isApp ? 'Une sauvegarde automatique est aussi faite chaque jour sur ce PC (Paramètres › Sauvegardes).' : 'Pensez à exporter régulièrement : sur mobile, les données vivent dans le navigateur.'}</p>`,
      actions: [
        { label: 'Importer et fusionner', onClick: () => { UI.pickFile('.json,application/json', txt => { try { const r = S.merge(JSON.parse(txt)); UI.toast(`Synchronisation réussie : ${r.ajout} ajout(s), ${r.maj} mise(s) à jour`); } catch (e) { UI.toast(e.message, 'err'); } }); } },
        { label: 'Exporter le fichier', cls: 'primary', onClick: () => { UI.download(`STRAM_synchro_${U.today()}.json`, S.exportJSON()); S.log('Fichier de synchronisation exporté'); } },
      ],
    });
  }

  function start() {
    nav(); header();
    window.addEventListener('hashchange', () => go(location.hash.slice(1)));
    UI.$('#menuBtn').onclick = () => document.body.classList.toggle('side-open');
    UI.$('#btnSync').onclick = () => typeof CLOUD === 'undefined' ? syncDialog() : CLOUD.actif() ? CLOUD.sync(true) : CLOUD.autoOff() ? syncDialog() : CLOUD.connecter(CLOUD.DEFAUT);
    S.onChange(() => { const s = UI.$('#saveState'); s.textContent = '● Enregistrement…'; s.className = 'saving'; setTimeout(() => { s.textContent = '● Données enregistrées sur ce poste'; s.className = ''; }, 600); refresh(); });
    UI.$('#btnSync').innerHTML = icon('sync', 16) + ' Synchroniser'; UI.$('#menuBtn').innerHTML = icon('menu', 22);
    if (S.host && S.host.version) S.host.version().then(v => UI.$('#ver').textContent = v);
    go(location.hash.slice(1) || 'dashboard');
  }

  /* ---- calcul partagé du planning, mis en cache tant que les données ne changent pas ---- */
  let cache = null;
  S.onChange(() => { cache = null; });
  const plan = () => cache || (cache = PLAN.compute(S.list('taches'), S.data.projet, S.data.reference));

  /* ---- outils partagés entre modules ---- */
  const ent = id => S.get('entreprises', id);
  const entNom = id => ent(id)?.nom || '—';
  const stockOf = (articleId) => {
    const a = S.get('articles', articleId); if (!a) return 0;
    return S.list('mouvements').filter(m => m.articleId === articleId).reduce((s, m) => s + (m.type === 'Sortie' ? -1 : 1) * U.num(m.quantite), U.num(a.stockInitial));
  };
  const nextNum = (col, prefix, field = 'num') => {
    const n = S.list(col).filter(r => String(r[field] || '').startsWith(prefix)).map(r => parseInt(String(r[field] || '').replace(/\D/g, ''), 10) || 0);
    return prefix + String((n.length ? Math.max(...n) : 0) + 1).padStart(4, '0');
  };

  return { icon, mod, start, go, refresh, plan, ent, entNom, stockOf, nextNum, get current() { return current; }, mods };
})();
