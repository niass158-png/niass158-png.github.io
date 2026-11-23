/* STRAM Suivi — synchronisation automatique avec la base de données en ligne (Supabase)
   Chaque appareil garde une copie locale (fonctionne hors connexion) ; les modifications sont envoyées
   et récupérées automatiquement dès qu'Internet est disponible. La plus récente l'emporte. */
'use strict';
const CLOUD = (() => {
  const URL_ = 'https://raqlhspskrzveduntove.supabase.co/rest/v1/rpc/';
  const APIKEY = 'sb_publishable_s5DTOXloQNPEuF31-e4jNg_3Igu7hut';
  const LK = 'stram-cloud-cle';
  const PERIODE = 20000;
  /* clé de l'espace « Chantier STRAM » intégrée : tout appareil installé se connecte seul à la base du chantier */
  const DEFAUT = 'STRAM-HHPC3-QXZ3E-WFCRY-B6PNY';
  const OFF = 'stram-cloud-off';
  let autoTimer = null;
  let etat = { st: 'off', msg: 'Non connectée', t: null };
  let busy = false, again = false, timer = null, deb = null;
  const subs = [];

  const cle = () => { try { return localStorage.getItem(LK) || ''; } catch (e) { return ''; } };
  const setCle = k => { try { k ? localStorage.setItem(LK, k) : localStorage.removeItem(LK); } catch (e) { } };
  const actif = () => !!cle();
  const set = (st, msg) => { etat = { st, msg, t: st === 'ok' ? new Date() : etat.t }; subs.forEach(f => f(etat)); paint(); };
  function paint() {
    const el = document.getElementById('lastSync'); if (!el) return;
    const h = etat.t ? ' à ' + etat.t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
    el.textContent = etat.st === 'ok' ? etat.msg + h : etat.msg; el.className = 'cloud-st ' + etat.st;
    const ck = document.getElementById('ckSt'); if (ck) { ck.textContent = el.textContent; ck.className = 'cloud-st big ' + etat.st; }
    const b = document.getElementById('btnSync');
    if (b) { b.classList.toggle('cloud-on', actif()); b.dataset.st = etat.st; b.title = actif() ? 'Base en ligne : ' + etat.msg + h + ' (cliquer pour synchroniser maintenant)' : 'Synchroniser avec le mobile ou le PC'; }
  }
  const onState = f => { subs.push(f); f(etat); };
  const norm = k => String(k || '').trim().toUpperCase().replace(/^STRAM:SYNC:/, '').replace(/^STRAM:ART:/, '').replace(/\s+/g, '');

  async function rpc(fn, body) {
    let r;
    try {
      r = await fetch(URL_ + fn, { method: 'POST', headers: { apikey: APIKEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) { const x = new Error('Pas de connexion Internet'); x.reseau = true; throw x; }
    const t = await r.text();
    if (!r.ok) { let m = t; try { m = JSON.parse(t).message || t; } catch (e) { } const x = new Error(m); x.status = r.status; throw x; }
    return t ? JSON.parse(t) : null;
  }
  const info = k => rpc('stram_info', { p_cle: k });

  /* découpe en paquets d'environ 1,5 Mo (les photos sont volumineuses) */
  function paquets(rows) {
    const out = []; let cur = [], taille = 0;
    rows.forEach(r => { const n = JSON.stringify(r).length; if (cur.length && (taille + n > 1500000 || cur.length >= 200)) { out.push(cur); cur = []; taille = 0; } cur.push(r); taille += n; });
    if (cur.length) out.push(cur);
    return out;
  }

  async function sync(manuel) {
    if (!actif()) { set('off', 'Non connectée'); return; }
    if (busy) { again = true; return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { set('hors', 'Hors ligne · ' + S.pendingCount() + ' en attente'); return; }
    busy = true; set('cours', 'Synchronisation…');
    const d = S.data; d._cloud = d._cloud || { seq: 0 };
    let envoyes = 0, recus = 0;
    try {
      // 1. envoi des modifications locales
      const rows = S.dirtyRows();
      for (const p of paquets(rows)) {
        await rpc('stram_push', { p_cle: cle(), p_appareil: d.appareil, p_rows: p });
        S.clearDirty(p); envoyes += p.length;
      }
      // 2. réception des modifications des autres appareils (différée si une saisie est en cours à l'écran)
      const ae = document.activeElement;
      const saisie = !manuel && ae && ae.closest && ae.closest('#view') && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName);
      const initial = !(d._cloud.seq > 0);
      for (let i = 0; i < 200 && !saisie; i++) {
        const lot = await rpc('stram_pull', { p_cle: cle(), p_depuis: d._cloud.seq || 0, p_limite: 300 });
        if (!lot || !lot.length) break;
        if (!initial && typeof NOUV !== 'undefined') NOUV.recevoir(lot.filter(o => o.appareil !== d.appareil));
        recus += S.applyRemote(lot);
        d._cloud.seq = lot[lot.length - 1].seq;
        if (lot.length < 300) break;
      }
      d._cloud.derniere = new Date().toISOString(); d.derniereSync = d._cloud.derniere;
      S.persist();
      const att = S.pendingCount();
      set('ok', att ? `Synchronisée · ${att} en attente` : 'Synchronisée');
      if (manuel) UI.toast(`Synchronisation terminée : ${envoyes} envoi(s), ${recus} mise(s) à jour reçue(s)`);
    } catch (e) {
      console.warn('Synchronisation', e);
      if (e.reseau) set('hors', 'Hors ligne · ' + S.pendingCount() + ' en attente');
      else if (/inconnue/i.test(e.message)) set('err', 'Clé de synchronisation refusée');
      else set('err', 'Erreur : ' + e.message.slice(0, 80));
      if (manuel) UI.toast('Synchronisation impossible : ' + e.message, 'err');
    } finally {
      busy = false;
      if (again) { again = false; setTimeout(() => sync(), 500); }
    }
  }

  /* première connexion d'un appareil à la base */
  async function connecter(k, onDone) {
    k = norm(k);
    if (!/^STRAM-[A-Z0-9]{5}(-[A-Z0-9]{5}){3}$/.test(k)) { UI.toast('Clé invalide : elle a la forme STRAM-XXXXX-XXXXX-XXXXX-XXXXX', 'err'); return; }
    let i;
    try { i = await info(k); } catch (e) { UI.toast(e.reseau ? 'Pas de connexion Internet' : (/inconnue/i.test(e.message) ? 'Clé de synchronisation inconnue' : e.message), 'err'); return; }
    const go = mode => lancer(k, i, mode, onDone);
    if (!i.enregistrements) {
      UI.modal({ title: 'Base « ' + i.nom + ' » vide', body: '<p>La base en ligne ne contient encore aucune donnée. Les données de cet appareil vont y être envoyées : elles deviendront la référence pour tous les autres appareils.</p><p class="muted">Faites-le depuis le PC qui contient les vraies données du chantier.</p>',
        actions: [{ label: 'Annuler' }, { label: 'Envoyer mes données', cls: 'primary', onClick: () => go('envoyer') }] });
    } else {
      UI.modal({ title: 'Base « ' + i.nom + ' » trouvée', body: `<p>La base en ligne contient déjà <b>${i.enregistrements}</b> fiches.</p>
        <p><b>Récupérer la base</b> (recommandé pour un nouvel appareil ou un téléphone) : les données de cet appareil sont remplacées par celles de la base. Vous devrez vous reconnecter avec votre code PIN.</p>
        <p><b>Fusionner</b> : à n'utiliser que si cet appareil contient des saisies qui ne sont pas encore dans la base.</p>`,
        actions: [{ label: 'Annuler' }, { label: 'Fusionner', onClick: () => go('fusionner') }, { label: 'Récupérer la base', cls: 'primary', onClick: () => go('recuperer') }] });
    }
  }
  async function lancer(k, i, mode, onDone) {
    setCle(k); try { localStorage.removeItem(OFF); } catch (e) { }
    if (mode === 'recuperer') {
      const ancien = JSON.parse(JSON.stringify(S.data));
      await S.wipeForCloud();
      S.data._cloud = { seq: 0, espace: i.nom, depuis: new Date().toISOString() };
      await sync();
      if (etat.st !== 'ok') { setCle(''); await S.restoreRaw(ancien); UI.toast('Récupération interrompue : les données de cet appareil sont conservées. Réessayez avec une bonne connexion.', 'err'); return; }
      try { sessionStorage.removeItem('stram-session'); } catch (e) { }
      await S.persist(true);
      UI.toast('Données récupérées depuis la base en ligne');
      setTimeout(() => location.reload(), 600);
      return;
    }
    S.data._cloud = { seq: 0, espace: i.nom, depuis: new Date().toISOString() };
    S.markAll(); S.persist();
    await sync();
    UI.toast(mode === 'envoyer' ? 'Données de cet appareil envoyées dans la base en ligne' : 'Données fusionnées avec la base en ligne');
    start(); onDone && onDone();
  }

  function deconnecter() { setCle(''); try { localStorage.setItem(OFF, '1'); } catch (e) { } if (S.data._cloud) delete S.data._cloud; S.persist(); stop(); set('off', 'Non connectée'); }

  /* appareil sans saisie propre : rien à perdre à récupérer la base */
  const vierge = () => !S.list('avancements').some(a => !/import/i.test(a.commentaire || '')) && ['mouvements', 'commandes', 'journal', 'acces', 'reserves', 'situations', 'marches', 'rapports', 'actions', 'reunions', 'utilisateurs'].every(c => !S.list(c).length);
  const autoOff = () => { try { return !!localStorage.getItem(OFF); } catch (e) { return true; } };
  async function auto() {
    clearTimeout(autoTimer);
    if (actif() || autoOff()) return;
    const plusTard = (msg, ms = 60000) => { set('off', msg); autoTimer = setTimeout(auto, ms); };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return plusTard('Hors ligne · connexion automatique dès le retour du réseau');
    let i; try { i = await info(DEFAUT); } catch (e) { return plusTard(e.reseau ? 'Hors ligne · connexion automatique dès le retour du réseau' : 'Connexion automatique impossible : ' + e.message.slice(0, 60)); }
    if (!i.enregistrements) {
      if (vierge()) return plusTard('En attente des premières données du chantier', 120000);
      set('cours', 'Connexion à la base « ' + i.nom + ' »…'); return lancer(DEFAUT, i, 'envoyer');
    }
    if (vierge()) { set('cours', 'Récupération de la base « ' + i.nom + ' »…'); return lancer(DEFAUT, i, 'recuperer'); }
    try { if (sessionStorage.getItem('stram-auto-demande')) return set('off', 'Non connectée · cliquer sur Synchroniser'); sessionStorage.setItem('stram-auto-demande', '1'); } catch (e) { }
    connecter(DEFAUT); // cet appareil a ses propres saisies : l'utilisateur choisit entre récupérer et fusionner
  }

  function start() {
    stop();
    if (!actif()) { set('off', 'Non connectée'); auto(); return; }
    sync();
    timer = setInterval(() => sync(), PERIODE);
  }
  function stop() { clearInterval(timer); timer = null; }

  // envoi rapide après chaque modification
  S.onChange(col => { if (!actif() || col === '*' || col === 'sync') return; clearTimeout(deb); deb = setTimeout(() => sync(), 2500); });
  window.addEventListener('online', () => actif() ? sync() : auto());
  document.addEventListener('click', e => { if (e.target && e.target.id === 'goCloud') { e.preventDefault(); document.querySelectorAll('.overlay').forEach(o => o.remove()); APP.go('parametres'); setTimeout(() => { const c = document.getElementById('cloudCard'); c && c.scrollIntoView({ behavior: 'smooth' }); }, 150); } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });

  return { DEFAUT, auto, autoOff, paint, start, sync, connecter, deconnecter, actif, cle, onState, get etat() { return etat; }, norm };
})();
