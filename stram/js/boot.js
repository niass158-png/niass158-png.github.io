/* STRAM Suivi — démarrage */
'use strict';
window.addEventListener('unhandledrejection', e => { if (e.reason && e.reason.droits) { UI.toast(e.reason.message, 'err'); e.preventDefault(); } });
window.addEventListener('error', e => { if (e.error && e.error.droits) { UI.toast(e.error.message, 'err'); e.preventDefault(); } });
S.load().then(() => {
  NOM.migrer();
  if (!S.data.projet.maitreOuvrage) S.patchProjet({ maitreOuvrage: 'SCI ALBA' });
  if (!S.data.projet.dateFinInitiale && S.data.projet.dateFinContractuelle) S.patchProjet({ dateFinInitiale: S.data.projet.dateFinContractuelle });
  APP.start();
  CLOUD.start();
  AUTH.login(() => AUTH.chip());
  ASSIST.ui();
  AUTH.startRappels();
  if (S.host && S.host.onExternalChange) S.host.onExternalChange(() => { UI.toast('Les données ont été modifiées depuis un autre poste : mise à jour de l\'affichage'); S.reloadFromHost(); });
  if (S.host && S.host.lockInfo) S.host.lockInfo().then(l => { if (l && l.other) UI.modal({ title: 'Base ouverte sur un autre poste', body: `<p>La base de données est actuellement ouverte sur <b>${U.esc(l.other.poste)}</b> (${U.esc(l.other.user || '')}) depuis ${new Date(l.other.t).toLocaleString('fr-FR')}.</p><p>Pour éviter d'écraser les saisies de l'autre poste, fermez STRAM Suivi sur ce poste-là, ou travaillez en consultation ici.</p>`, actions: [{ label: 'J\'ai compris', cls: 'primary' }] }); });
}).catch(e => { document.getElementById('view').innerHTML = '<div class="card err">Impossible de charger les données : ' + U.esc(e.message) + '</div>'; console.error(e); });
if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
