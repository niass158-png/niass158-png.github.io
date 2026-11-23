/* STRAM Suivi — Paramètres du projet, sauvegardes, synchronisation et historique */
'use strict';
(() => {
  const JOURS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
  function render(v) {
    const p = S.data.projet;
    v.innerHTML = `<div class="cols2">
      <div class="card"><h3>Projet</h3><form id="pf" class="grid-form">
        <div class="field"><label>Votre prénom (accueil)</label><input name="utilisateur" value="${U.esc(p.utilisateur || '')}"></div>
        <div class="field"><label>Code projet</label><input name="nom" value="${U.esc(p.nom || '')}"></div>
        <div class="field"><label>Intitulé</label><input name="intitule" value="${U.esc(p.intitule || '')}"></div>
        <div class="field"><label>Maître d'ouvrage</label><input name="maitreOuvrage" value="${U.esc(p.maitreOuvrage || '')}"></div>
        <div class="field"><label>Maîtrise d'œuvre / conduite</label><input name="maitreOeuvre" value="${U.esc(p.maitreOeuvre || '')}"></div>
        <div class="field full"><label>Localisation</label><input name="localisation" value="${U.esc(p.localisation || '')}"></div>
        <div class="field"><label>Date de démarrage des travaux</label><input type="date" name="dateDebut" value="${p.dateDebut || ''}"></div>
        <div class="field"><label>Fin contractuelle actuelle</label><div style="display:flex;gap:8px"><input type="date" name="dateFinContractuelle" value="${p.dateFinContractuelle || ''}" readonly class="ro" style="flex:1"><button type="button" class="btn" id="pDel">Prolonger / modifier…</button></div><small>${(p.avenantsDelai || []).length ? `Initiale ${U.fr(p.dateFinInitiale)} · ${p.avenantsDelai.length} prolongation(s)` : 'Fin initiale du contrat'}</small></div>
        <div class="field full"><label>Jours ouvrés</label><div class="days">${[1, 2, 3, 4, 5, 6, 0].map(d => `<label class="chk"><input type="checkbox" name="jo" value="${d}" ${(p.joursOuvres || []).includes(d) ? 'checked' : ''}> ${JOURS[d]}</label>`).join('')}</div></div>
        <div class="field full"><label>Jours fériés / non travaillés (AAAA-MM-JJ, séparés par des espaces)</label><textarea name="feries" rows="2">${U.esc(p.feries || '')}</textarea><small>Les dates de Tabaski, Korité, Maouloud, Tamkharit… sont à ajouter chaque année.</small></div>
        <div class="field"><label>TVA par défaut (%)</label><input type="number" name="tva" value="${p.tva ?? 18}"></div>
        <div class="field"><label>Devise</label><input name="devise" value="${U.esc(p.devise || 'FCFA')}"></div>
        <div class="full"><button class="btn primary" type="submit">Enregistrer les paramètres</button></div></form></div>
      <div>
        <div class="card cloud-card" id="cloudCard"></div>
        <div class="card"><h3>Synchronisation par fichier (secours)</h3><p class="muted">Sans Internet, exportez un fichier de synchronisation et importez-le sur l'autre appareil : les saisies sont fusionnées, la plus récente l'emporte.</p>
          <div class="btnrow"><button class="btn primary" id="sx">${APP.icon('upload', 15)} Exporter le fichier de synchronisation</button><button class="btn" id="si">${APP.icon('download', 15)} Importer et fusionner</button></div></div>
        <div class="card"><h3>Sauvegardes</h3>
          <p class="muted">${S.host ? 'Une sauvegarde automatique est créée chaque jour sur ce PC (30 derniers jours conservés).' : 'Sur mobile, exportez régulièrement une sauvegarde complète.'}</p>
          <div class="btnrow"><button class="btn" id="bx">${APP.icon('download', 15)} Sauvegarde complète (.json)</button><button class="btn" id="br">${APP.icon('upload', 15)} Restaurer une sauvegarde</button>${S.host ? '<button class="btn ghost" id="bo">' + APP.icon('folder', 15) + ' Ouvrir le dossier des données</button>' : ''}<button class="btn ghost" id="xa">${APP.icon('download', 15)} Export Excel complet</button></div>
          <div id="bl"></div></div>
        <div class="card"><h3>Utilisateurs et droits</h3><p class="muted">Dès qu'un utilisateur existe, STRAM Suivi demande une connexion par code PIN et l'historique indique qui a fait quoi. Rôles : Administrateur (tout), Conducteur de travaux (tout sauf les utilisateurs), Magasinier (magasin, commandes, accès, journal), Lecture seule (maître d'ouvrage).</p>
          <div id="uList"></div><button class="btn sm" id="uAdd">+ Utilisateur</button></div>
        ${S.host ? `<div class="card"><h3>Emplacement de la base de données</h3><p class="muted">Placez la base dans un dossier OneDrive (ou tout dossier partagé) pour la retrouver sur plusieurs PC. Un verrou signale quand elle est déjà ouverte ailleurs, et l'affichage se met à jour quand un autre poste enregistre.</p>
          <p class="small"><b>Dossier actuel :</b> <span id="dDir" class="muted">…</span></p><div class="btnrow"><button class="btn" id="dChg">${APP.icon('folder', 15)} Choisir un dossier (ex. OneDrive)</button><button class="btn ghost" id="dDef">Revenir au dossier local</button></div></div>
        <div class="card"><h3>Assistant IA (facultatif)</h3><p class="muted">Sans clé, l'assistant répond à partir des données du chantier. Avec une clé OpenAI enregistrée sur ce poste uniquement, il répond aux questions libres. Seul un résumé des données du chantier est envoyé.</p>
          <div class="grid-form"><div class="field"><label>Clé API OpenAI</label><input type="password" id="aiKey" placeholder="sk-…" autocomplete="off"></div><div class="field"><label>Modèle</label><input id="aiModel" placeholder="gpt-4o-mini"></div></div>
          <div class="btnrow" style="margin-top:10px"><button class="btn" id="aiSave">Enregistrer</button><button class="btn ghost" id="aiDel">Retirer la clé</button><span class="muted small" id="aiSt"></span></div></div>
        <div class="card"><h3>Mises à jour</h3><p class="muted"><b>Automatiques</b> : le logiciel vérifie chaque heure la version publiée sur niass158-png.github.io, la télécharge seul et propose de redémarrer pour l’installer (ou l’installe à la fermeture). Ce bouton force une vérification immédiate.</p>
          <div class="grid-form"><div class="field"><label>Dépôt GitHub (secours)</label><input id="upRepo" placeholder="niass158-png/niass158-png.github.io"></div><div class="field" style="justify-content:flex-end"><button class="btn" id="upChk">Vérifier les mises à jour</button></div></div><p class="small" id="upRes"></p></div>` : ''}
        <div class="card"><h3>Rappels</h3><label class="chk"><input type="checkbox" id="rpOn" ${S.data.projet.rappels === false ? '' : 'checked'}> Afficher une notification des points urgents (à l'ouverture, puis toutes les 2 heures)</label><div class="btnrow" style="margin-top:10px"><button class="btn sm ghost" id="rpTest">Tester maintenant</button></div></div>
        <div class="card"><h3>Zone sensible</h3><p class="muted">Repartir des données initiales du projet STRAM (22 entreprises, 28 articles). Toutes les saisies seront perdues : faites d'abord une sauvegarde.</p><button class="btn danger ghost" id="rz">Réinitialiser la base</button></div>
      </div></div>
      <div class="card"><h3>Historique des modifications <span class="muted">(${S.data.historique.length})</span></h3><div class="histo">${S.data.historique.slice(0, 200).map(h => `<div><time>${new Date(h.t).toLocaleString('fr-FR')}</time>${U.esc(h.texte)}</div>`).join('') || '<p class="muted">Aucune modification.</p>'}</div></div>`;
    UI.$('#pDel', v).onclick = () => PLANNING.delai();
    UI.$('#pf', v).onsubmit = e => {
      e.preventDefault(); const f = e.target;
      const jo = UI.$$('input[name=jo]:checked', f).map(i => +i.value);
      if (!jo.length) { UI.toast('Cochez au moins un jour ouvré', 'err'); return; }
      const bad = f.feries.value.split(/[\s,;]+/).filter(Boolean).filter(d => !/^\d{4}-\d{2}-\d{2}$/.test(d));
      if (bad.length) { UI.toast('Dates non reconnues : ' + bad.join(', '), 'err'); return; }
      S.setProjet({ utilisateur: f.utilisateur.value.trim(), nom: f.nom.value.trim(), intitule: f.intitule.value.trim(), maitreOuvrage: f.maitreOuvrage.value.trim(), maitreOeuvre: f.maitreOeuvre.value.trim(), localisation: f.localisation.value.trim(),
        dateDebut: f.dateDebut.value, dateFinContractuelle: f.dateFinContractuelle.value, joursOuvres: jo, feries: f.feries.value.trim(), tva: U.num(f.tva.value), devise: f.devise.value.trim() });
      UI.toast('Paramètres enregistrés — planning recalculé');
    };
    cloudCard(UI.$('#cloudCard', v));
    UI.$('#sx', v).onclick = () => { UI.download(`STRAM_synchro_${U.today()}.json`, S.exportJSON()); S.log('Fichier de synchronisation exporté'); };
    UI.$('#si', v).onclick = () => UI.pickFile('.json', t => { try { const r = S.merge(JSON.parse(t)); UI.toast(`Fusion réussie : ${r.ajout} ajout(s), ${r.maj} mise(s) à jour`); } catch (e) { UI.toast(e.message, 'err'); } });
    UI.$('#bx', v).onclick = () => UI.download(`STRAM_sauvegarde_${U.today()}.json`, S.exportJSON());
    UI.$('#br', v).onclick = () => UI.pickFile('.json', t => { let d; try { d = JSON.parse(t); } catch (e) { UI.toast('Fichier illisible', 'err'); return; } UI.confirm('Remplacer toutes les données actuelles par cette sauvegarde ?', () => { try { S.replaceAll(d); UI.toast('Sauvegarde restaurée'); } catch (e) { UI.toast(e.message, 'err'); } }, 'Restaurer'); });
    UI.$('#rz', v).onclick = () => UI.confirm('Effacer toutes les saisies et repartir des données initiales ?', () => { S.resetDemo(); UI.toast('Base réinitialisée'); }, 'Réinitialiser');
    UI.$('#xa', v).onclick = exportAll;
    // utilisateurs
    const ROLES = Object.keys(S.ROLES);
    const editU = (u = {}) => { const id = u.id || U.uid(); UI.form({ title: u.id ? u.nom : 'Nouvel utilisateur', value: u, fields: [
      { k: 'nom', label: 'Nom et prénom', required: true }, { k: 'role', label: 'Rôle', type: 'select', options: ROLES, required: true, default: S.list('utilisateurs').length ? 'Conducteur de travaux' : 'Administrateur' },
      { k: 'pin', label: u.id ? 'Nouveau code PIN (vide = inchangé)' : 'Code PIN (4 à 8 chiffres)', type: 'password', required: !u.id }],
      onSave: x => { const pin = x.pin; delete x.pin;
        if (!S.list('utilisateurs').length && x.role !== 'Administrateur') { UI.toast('Le premier utilisateur doit être Administrateur', 'err'); return false; }
        if (pin && !/^\d{4,8}$/.test(pin)) { UI.toast('Le PIN doit comporter 4 à 8 chiffres', 'err'); return false; }
        if (S.list('utilisateurs').length && !S.can('utilisateurs')) { UI.toast('Réservé à l\'administrateur', 'err'); return false; }
        const first = !S.list('utilisateurs').length;
        UIX.hash(pin || '', id).then(h => { const o = Object.assign({ id }, x); if (pin) o.pinHash = h; if (u.id) S.save('utilisateurs', o, `Utilisateur « ${x.nom} » modifié`); else { S.data.utilisateurs.push(Object.assign({ cree: new Date().toISOString(), maj: new Date().toISOString() }, o)); S.log(`Utilisateur « ${x.nom} » (${x.role}) créé`); S.persist(true); }
          if (first) { S.setUser(S.get('utilisateurs', id)); try { sessionStorage.setItem('stram-session', id); } catch (e) { /* ignoré */ } AUTH.chip(); }
          APP.refresh(); UI.toast('Utilisateur enregistré'); }); },
      onDelete: u.id ? () => { if (S.user && S.user.id === u.id) { UI.toast('Vous ne pouvez pas supprimer votre propre compte', 'err'); return; } S.remove('utilisateurs', u.id, `Utilisateur « ${u.nom} » supprimé`); } : null }); };
    UI.table(UI.$('#uList', v), { id: 'users', rows: S.list('utilisateurs'), onRow: editU, empty: 'Aucun utilisateur : l\'application s\'ouvre sans connexion.', cols: [{ k: 'nom', label: 'Nom', render: u => `<b>${U.esc(u.nom)}</b>` }, { k: 'role', label: 'Rôle' }] });
    UI.$('#uAdd', v).onclick = () => editU();
    UI.$('#rpOn', v).onchange = e => S.setProjet({ rappels: e.target.checked });
    UI.$('#rpTest', v).onclick = () => AUTH.rappels(true);
    if (S.host) {
      S.host.getDataDir().then(d => { UI.$('#dDir', v).textContent = d; });
      UI.$('#dChg', v).onclick = async () => { const r = await S.host.chooseDataDir(); if (r && r.dir) { UI.toast(r.loaded ? 'Base existante chargée depuis ' + r.dir : 'Base copiée dans ' + r.dir); await S.reloadFromHost(); } };
      UI.$('#dDef', v).onclick = async () => { const r = await S.host.resetDataDir(); if (r) { UI.toast('Base locale rétablie'); await S.reloadFromHost(); } };
      S.host.aiStatus().then(st => { UI.$('#aiSt', v).textContent = st && st.ready ? 'Clé enregistrée sur ce poste' : 'Aucune clé'; UI.$('#aiModel', v).value = (st && st.model) || ''; UI.$('#upRepo', v).value = (st && st.repo) || 'niass158-png/niass158-png.github.io'; });
      UI.$('#aiSave', v).onclick = async () => { await S.host.setConfig({ aiKey: UI.$('#aiKey', v).value.trim() || undefined, aiModel: UI.$('#aiModel', v).value.trim() || 'gpt-4o-mini' }); UI.$('#aiKey', v).value = ''; UI.toast('Réglages de l\'assistant enregistrés'); APP.refresh(); };
      UI.$('#aiDel', v).onclick = async () => { await S.host.setConfig({ aiKey: '' }); UI.toast('Clé retirée'); APP.refresh(); };
      UI.$('#upChk', v).onclick = async () => { const repo = UI.$('#upRepo', v).value.trim(); await S.host.setConfig({ repo }); UI.$('#upRes', v).textContent = 'Vérification…'; const r = await S.host.checkUpdate(repo);
        if (r.error) UI.$('#upRes', v).innerHTML = `<span class="neg">${U.esc(r.error)}</span>`;
        else if (r.newer) { UI.$('#upRes', v).innerHTML = `Nouvelle version <b>${U.esc(r.latest)}</b> disponible (vous avez ${U.esc(r.current)}). <button class="btn sm primary" id="upGo">Télécharger</button>`; UI.$('#upGo', v).onclick = () => S.host.openUrl(r.url); }
        else UI.$('#upRes', v).innerHTML = `<span class="pos">Vous avez la dernière version (${U.esc(r.current)}).</span>`; };
    }
    if (S.host) {
      UI.$('#bo', v).onclick = () => S.host.openDataFolder();
      S.host.listBackups().then(list => { UI.$('#bl', v).innerHTML = list.length ? `<table class="tbl mini"><thead><tr><th>Sauvegarde automatique</th><th class="r">Taille</th><th></th></tr></thead><tbody>${list.slice(0, 10).map(b => `<tr><td>${U.esc(b.name)}</td><td class="r">${Math.round(b.size / 1024)} Ko</td><td><button class="btn xs" data-rb="${U.esc(b.name)}">Restaurer</button></td></tr>`).join('')}</tbody></table>` : '';
        UI.$$('[data-rb]', v).forEach(b => b.onclick = () => UI.confirm(`Restaurer la sauvegarde ${b.dataset.rb} ?`, async () => { const t = await S.host.readBackup(b.dataset.rb); S.replaceAll(JSON.parse(t)); UI.toast('Sauvegarde restaurée'); }, 'Restaurer')); });
    }
  }

  function exportAll() {
    const P = APP.plan();
    UI.xlsx(`STRAM_Export_complet_${U.today()}.xlsx`, {
      'Entreprises': [['Entreprise', 'Corps d\'état', 'Intervention', 'Responsable', 'Téléphone', 'Début', 'Fin'], ...S.list('entreprises').map(e => [e.nom, e.corpsEtat, e.lot, e.responsable, e.tel, U.fr(e.debut), U.fr(e.fin)])],
      'Planning': [['Entreprise', 'Tâche', 'Zone', 'Durée', 'Début prévu', 'Fin prévue', 'Avancement', 'Marge', 'État'], ...S.list('taches').map(t => { const r = P.R.get(t.id); return [APP.entNom(t.entrepriseId), t.nom, t.zone, r.dur, U.fr(r.prev.debut), U.fr(r.prev.fin), r.av ?? '', r.marge ?? '', r.etat]; })],
      'Stock': [['Code', 'Désignation', 'Catégorie', 'Unité', 'Solde', 'Seuil', 'Statut'], ...STOCK.etat().map(r => [r.a.code, r.a.designation, r.a.categorie, r.a.unite, r.solde, r.a.seuil, r.statut])],
      'Commandes': [['N°', 'Date', 'Statut', 'Fournisseur', 'Livraison prévue'], ...S.list('commandes').map(c => [c.num, U.fr(c.date), c.statut, S.get('fournisseurs', c.fournisseurId)?.nom || '', U.fr(c.livraisonPrevue)])],
      'Situations': [['Entreprise', 'N°', 'Reçue le', 'Cumul HT', 'Net TTC', 'Statut', 'Payé'], ...S.list('situations').map(s => { const d = FIN.decompte(s); return [APP.entNom(d.m.entrepriseId), s.num, U.fr(s.dateReception), d.cum, Math.round(d.ttc), s.statut, U.num(s.montantPaye)]; })],
      'Actions': [['Action', 'Responsable', 'Échéance', 'Statut', 'Origine'], ...S.list('actions').map(a => [a.description, a.responsable, U.fr(a.echeance), a.statut, a.origine])],
      'Réserves': [['N°', 'Zone', 'Entreprise', 'Description', 'Échéance', 'Statut'], ...S.list('reserves').map(r => [r.num, r.zone, APP.entNom(r.entrepriseId), r.description, U.fr(r.echeance), r.statut])],
    });
  }

  function cloudCard(el) {
    const on = CLOUD.actif(), c = S.data._cloud || {};
    const admin = !S.list('utilisateurs').length || (S.user && ['Administrateur', 'Conducteur de travaux'].includes(S.user.role));
    if (!on) {
      el.innerHTML = `<h3>Base de données en ligne</h3>
        <p class="muted">Reliez cet appareil à la base en ligne du chantier : le PC et les téléphones partagent alors les mêmes données, mises à jour automatiquement toutes les 20 secondes. Chaque appareil garde une copie et continue de fonctionner sans Internet ; les saisies partent dès que la connexion revient.</p>
        <div class="grid-form"><div class="field full"><label>Clé de synchronisation du chantier</label><input id="ckKey" placeholder="STRAM-XXXXX-XXXXX-XXXXX-XXXXX" autocomplete="off" autocapitalize="characters" spellcheck="false"></div></div>
        <div class="btnrow" style="margin-top:10px"><button class="btn primary" id="ckGo">${APP.icon('enter', 15)} Connecter cet appareil</button><button class="btn" id="ckScan">${APP.icon('scan', 15)} Scanner le QR code du PC</button></div>
        <p class="small muted" style="margin-top:8px">Sur le téléphone : ouvrez ce menu sur le PC déjà connecté, affichez son QR code et scannez-le.</p>`;
      const go = k => CLOUD.connecter(k, () => cloudCard(el));
      UI.$('#ckGo', el).onclick = () => go(UI.$('#ckKey', el).value);
      UI.$('#ckScan', el).onclick = () => UIX.scan(t => go(t), { titre: 'Scanner le QR code du PC', aide: 'Visez le QR code affiché sur le PC (Paramètres › Base de données en ligne › Relier un téléphone).', label: '… ou saisissez la clé', ph: 'STRAM-XXXXX-XXXXX-XXXXX-XXXXX' });
      return;
    }
    const e = CLOUD.etat;
    el.innerHTML = `<h3>Base de données en ligne</h3>
      <p><span class="cloud-st ${e.st} big" id="ckSt">${U.esc(e.msg)}</span></p>
      <p class="small muted">Base : <b>${U.esc(c.espace || 'Chantier STRAM')}</b> · reliée depuis le ${c.depuis ? new Date(c.depuis).toLocaleDateString('fr-FR') : '—'} · dernière synchronisation : ${c.derniere ? new Date(c.derniere).toLocaleString('fr-FR') : '—'}<br>Synchronisation automatique toutes les 20 secondes et après chaque saisie.</p>
      <div class="btnrow"><button class="btn primary" id="ckNow">${APP.icon('sync', 15)} Synchroniser maintenant</button>${admin ? `<button class="btn" id="ckQr">${APP.icon('qr', 15)} Relier un téléphone</button>` : ''}<button class="btn ghost" id="ckOff">Déconnecter cet appareil</button></div>
      <div id="ckQrBox"></div>`;
    UI.$('#ckNow', el).onclick = () => CLOUD.sync(true).then(() => cloudCard(el));
    if (admin) UI.$('#ckQr', el).onclick = () => {
      const k = CLOUD.cle();
      UI.$('#ckQrBox', el).innerHTML = `<div class="cloud-qr">${UIX.qrSvg('STRAM:SYNC:' + k, 170)}<div><b>Sur le téléphone</b><ol class="small"><li>Ouvrez STRAM Suivi → Paramètres</li><li>Touchez « Scanner le QR code du PC »</li><li>Choisissez « Récupérer la base »</li></ol><p class="small muted">Ou saisissez la clé :</p><code>${U.esc(k)}</code><p class="small muted" style="margin-top:6px">Ne communiquez cette clé qu'aux personnes autorisées : elle donne accès aux données du chantier.</p></div></div>`;
    };
    UI.$('#ckOff', el).onclick = () => UI.confirm('Déconnecter cet appareil de la base en ligne ? Ses données restent sur l\'appareil mais ne seront plus synchronisées.', () => { CLOUD.deconnecter(); cloudCard(el); }, 'Déconnecter');
  }

  APP.mod('parametres', { title: 'Paramètres & données', short: 'Réglages', icon: '', group: 'Système', sub: 'Projet, calendrier, synchronisation, sauvegardes et historique', render });
})();
