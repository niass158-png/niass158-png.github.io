/* STRAM Suivi — connexion par utilisateur et code PIN, rappels automatiques */
'use strict';
const AUTH = (() => {
  const E = U.esc;
  const KEY = 'stram-session';
  function chip() {
    let c = UI.$('#userChip');
    if (!c) { c = document.createElement('button'); c.id = 'userChip'; c.className = 'userchip'; UI.$('.top-right').prepend(c); }
    if (!S.list('utilisateurs').length) { c.remove(); return; }
    c.innerHTML = `${APP.icon('user', 16)}<span>${E(S.user?.nom || 'Invité')} · ${E(S.user?.role || '')}</span>`;
    c.title = 'Changer d\'utilisateur';
    c.onclick = () => UI.confirm('Se déconnecter et changer d\'utilisateur ?', () => { try { sessionStorage.removeItem(KEY); } catch (e) { /* stockage indisponible */ } S.setUser(null); login(); }, 'Changer');
  }
  function login(done) {
    const users = S.list('utilisateurs');
    if (!users.length) { S.setUser(null); done && done(); return; }
    try { const id = sessionStorage.getItem(KEY); const u = id && S.get('utilisateurs', id); if (u) { S.setUser(u); chip(); done && done(); return; } } catch (e) { /* stockage indisponible */ }
    let sel = users[0];
    const ov = document.createElement('div'); ov.className = 'login';
    ov.innerHTML = `<div class="box"><div class="brand" style="padding:0"><div class="logo-mark">S</div><div><b style="color:var(--ink2)">STRAM Suivi</b><small style="color:var(--muted)">${E(S.data.projet.intitule || '')}</small></div></div>
      <h2>Connexion</h2><div class="users">${users.map(u => `<button type="button" data-id="${u.id}"><i>${E(u.nom.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase())}</i><span><b>${E(u.nom)}</b><br><small class="muted">${E(u.role)}</small></span></button>`).join('')}</div>
      <div class="field"><label for="lgPin">Code PIN</label><input id="lgPin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" style="font-size:22px;letter-spacing:6px;text-align:center"></div>
      <button class="btn primary" id="lgGo" style="height:48px;justify-content:center">${APP.icon('lock', 16)} Ouvrir STRAM Suivi</button><p class="muted small" id="lgErr" style="margin:0;min-height:16px"></p></div>`;
    document.body.appendChild(ov);
    const mark = () => UI.$$('.users button', ov).forEach(b => b.classList.toggle('on', b.dataset.id === sel.id));
    UI.$$('.users button', ov).forEach(b => b.onclick = () => { sel = S.get('utilisateurs', b.dataset.id); mark(); UI.$('#lgPin', ov).focus(); });
    mark();
    const go = async () => { const h = await UIX.hash(UI.$('#lgPin', ov).value, sel.id); if (h === sel.pinHash) { S.setUser(sel); try { sessionStorage.setItem(KEY, sel.id); } catch (e) { /* ignoré */ } ov.remove(); chip(); S.log('Connexion'); APP.refresh(); done && done(); } else { UI.$('#lgErr', ov).textContent = 'Code PIN incorrect.'; UI.$('#lgPin', ov).value = ''; } };
    UI.$('#lgGo', ov).onclick = go; UI.$('#lgPin', ov).onkeydown = e => { if (e.key === 'Enter') go(); };
    setTimeout(() => UI.$('#lgPin', ov).focus(), 80);
  }

  /* ---------- rappels ---------- */
  function rappels(force) {
    if (S.data.projet.rappels === false || typeof Notification === 'undefined') return;
    const urg = ALERTES().filter(a => a.niv >= 2);
    if (!urg.length) return;
    const k = 'stram-rappel-' + U.today() + '-' + urg.length;
    try { if (!force && localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch (e) { /* ignoré */ }
    const show = () => { const n = new Notification('STRAM Suivi — ' + urg.length + ' point(s) de vigilance', { body: urg.slice(0, 3).map(a => '• ' + a.txt).join('\n'), icon: 'icons/icon-192.png', tag: 'stram-rappel' }); n.onclick = () => { window.focus(); APP.go('dashboard'); }; };
    if (Notification.permission === 'granted') show();
    else if (Notification.permission !== 'denied') Notification.requestPermission().then(p => { if (p === 'granted') show(); });
  }
  function startRappels() { setTimeout(() => rappels(false), 4000); setInterval(() => rappels(false), 2 * 3600 * 1000); }

  return { login, chip, rappels, startRappels };
})();
