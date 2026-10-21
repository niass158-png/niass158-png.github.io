/* ==========================================================================
   A&A Group — Registre des Offres · coquille de la version web
   Chargée APRÈS app.js. Ne touche à aucune donnée : elle habille la même
   page pour un téléphone (barre d'onglets en bas, feuille « Plus », filtres
   repliés), adapte quelques libellés pensés pour Windows, gère
   l'installation sur l'écran d'accueil et les mises à jour du site.
   Les boutons qu'elle crée ne font que « cliquer » sur ceux de la page :
   toute la logique reste dans app.js.
   ========================================================================== */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const ic = (id) => '<svg class="ico"><use href="#i-' + id + '"/></svg>';
  const web = window.AAWeb || {};
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const autonome = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;

  function clique(sel) { const b = $(sel); if (b) b.click(); }

  // ------------------------------------------------------------ libellés
  function texte(sel, t) { const el = $(sel); if (el) el.textContent = t; }
  function libelleBouton(sel, t) {
    const b = $(sel); if (!b) return;
    Array.from(b.childNodes).forEach(n => { if (n.nodeType === 3 && n.textContent.trim()) n.remove(); });
    b.appendChild(document.createTextNode(t));
  }
  texte("#settings-dialog .modal-head p", "Enregistrés uniquement sur cet appareil.");
  libelleBouton("#ia-effacer", "Effacer la clé de cet appareil");
  const aideIA = $("#ia-effacer") && $("#ia-effacer").nextElementSibling;
  if (aideIA && aideIA.classList.contains("help")) {
    aideIA.textContent = "Sur téléphone, la clé est chiffrée par le navigateur avec une clé qu'il ne laisse pas lire — "
      + "mais la protection est moindre que celle de Windows sur PC. Ne l'enregistrez que sur un appareil personnel, verrouillé par un code. "
      + "La consommation est facturée sur votre compte OpenAI ; vos questions et les extraits du registre nécessaires sont transmis à OpenAI.";
  }
  libelleBouton("#logout-btn", "Se déconnecter de cet appareil");
  const aideLogout = $("#logout-btn") && $("#logout-btn").closest(".acces-row");
  if (aideLogout && aideLogout.nextElementSibling && aideLogout.nextElementSibling.classList.contains("help")) {
    aideLogout.nextElementSibling.textContent = "Ferme la session du registre sur cet appareil ; les données du registre ne sont pas touchées.";
  }
  const aideCode = $("#login-code") && $("#login-code").parentElement.querySelector(".help");
  if (aideCode) aideCode.textContent = "Le code n'est pas conservé : l'appareil garde seulement la session ouverte, jusqu'à « Se déconnecter ».";

  // ------------------------------------------------------- barre du haut
  const topbar = $(".topbar");
  const moi = document.createElement("button");
  moi.type = "button";
  moi.className = "web-moi";
  moi.setAttribute("aria-label", "Mon profil et la connexion");
  moi.innerHTML = '<span class="web-marque">A&amp;A</span><span class="web-titre"><strong>Registre des Offres</strong><span id="web-conn">Connexion…</span></span>';
  moi.addEventListener("click", () => clique("#user-chip"));
  if (topbar) topbar.insertBefore(moi, topbar.firstChild);

  function suisConnexion() {
    const conn = $("#conn"); if (!conn) return;
    moi.dataset.conn = conn.dataset.state || "";
    const nom = ($("#user-name") || {}).textContent || "";
    const etat = ($("#conn-label") || {}).textContent || "";
    $("#web-conn").textContent = (nom && nom !== "Me présenter" ? nom + " · " : "") + etat;
  }
  ["#conn", "#user-name"].forEach(sel => {
    const el = $(sel);
    if (el) new MutationObserver(suisConnexion).observe(el, { attributes: true, childList: true, subtree: true, characterData: true });
  });
  suisConnexion();

  // ------------------------------------------------------ barre d'onglets
  const ONGLETS = [
    { tab: "veille", icone: "radar", nom: "Registre" },
    { tab: "go", icone: "route", nom: "Offres GO" },
    { tab: "soumissions", icone: "flag", nom: "Soumissions" },
    { tab: "bord", icone: "chart", nom: "Tableau" }
  ];
  const PLUS = [
    { tab: "attente", icone: "hourglass", nom: "En attente" },
    { tab: "prospection", icone: "target", nom: "Prospection" },
    { sel: "#contacts-btn", icone: "users", nom: "Contacts" },
    { sel: "#sources-btn", icone: "cloud-down", nom: "Sources", n: "#nav-n-sources" },
    { tab: "corbeille", icone: "trash", nom: "Corbeille" },
    { sel: "#settings-btn", icone: "settings", nom: "Paramètres" }
  ];

  const barre = document.createElement("nav");
  barre.className = "web-barre";
  barre.setAttribute("aria-label", "Sections");
  barre.innerHTML = ONGLETS.map(o =>
    '<button type="button" class="web-onglet" data-web-tab="' + o.tab + '">' + ic(o.icone)
    + '<span class="l">' + o.nom + '</span><span class="n" data-web-n="' + o.tab + '"></span></button>').join("")
    + '<button type="button" class="web-onglet" data-web-plus aria-haspopup="true">' + ic("grid") + '<span class="l">Plus</span><span class="n" data-web-n="plus"></span></button>';
  document.body.appendChild(barre);

  const voile = document.createElement("div");
  voile.className = "web-voile";
  const feuille = document.createElement("div");
  feuille.className = "web-feuille";
  feuille.setAttribute("role", "dialog");
  feuille.setAttribute("aria-label", "Autres sections");
  feuille.innerHTML = '<div class="poignee"></div><div class="grille">'
    + PLUS.map((o, i) => '<button type="button" data-web-i="' + i + '">' + ic(o.icone) + '<span>' + o.nom + '</span>'
      + '<span class="n" data-web-n="' + (o.tab || o.sel) + '"></span></button>').join("")
    + '</div><p class="pied">A&amp;A Registre des Offres · version web ' + (web.VERSION || "") + '</p>';
  document.body.append(voile, feuille);

  function plus(ouvert) { document.documentElement.classList.toggle("web-plus-ouvert", ouvert); }
  voile.addEventListener("click", () => plus(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") plus(false); });

  function ouvreOnglet(tab) { clique('.rail-nav .nav-item[data-tab="' + tab + '"]'); }

  barre.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.hasAttribute("data-web-plus")) { plus(!document.documentElement.classList.contains("web-plus-ouvert")); return; }
    plus(false);
    ouvreOnglet(b.dataset.webTab);
  });
  feuille.addEventListener("click", (e) => {
    const b = e.target.closest("[data-web-i]"); if (!b) return;
    const o = PLUS[Number(b.dataset.webI)];
    plus(false);
    if (o.tab) ouvreOnglet(o.tab); else clique(o.sel);
  });

  // Onglet actif et pastilles : recopiés du rail, qui reste la référence.
  function suisRail() {
    const actif = $(".rail-nav .nav-item.is-active[data-tab]");
    const tab = actif ? actif.dataset.tab : "";
    const dansPlus = PLUS.some(o => o.tab === tab);
    barre.querySelectorAll("[data-web-tab]").forEach(b => b.classList.toggle("is-active", b.dataset.webTab === tab));
    barre.querySelector("[data-web-plus]").classList.toggle("is-active", dansPlus);
    ONGLETS.concat(PLUS).forEach(o => {
      const cle = o.tab || o.sel;
      const src = o.tab ? $("#tab-n-" + o.tab) : (o.n ? $(o.n) : null);
      const v = src ? src.textContent.trim() : "";
      document.querySelectorAll('[data-web-n="' + cle + '"]').forEach(el => { el.textContent = v; });
    });
    const att = $("#tab-n-attente");
    barre.querySelector('[data-web-n="plus"]').textContent = att && att.classList.contains("is-alerte") ? "!" : "";
  }
  const rail = $(".rail");
  if (rail) new MutationObserver(suisRail).observe(rail, { attributes: true, attributeFilter: ["class"], childList: true, subtree: true, characterData: true });
  suisRail();

  // ------------------------------------------------------------ filtres
  const layout = $("#view-veille .layout");
  const gauche = $("#view-veille .toolbar-left");
  if (layout && gauche) {
    const bf = document.createElement("button");
    bf.type = "button";
    bf.className = "btn small web-filtres-btn";
    bf.innerHTML = ic("filter") + "Filtres <span class=\"web-n\"></span>";
    bf.setAttribute("aria-expanded", "false");
    bf.addEventListener("click", () => {
      const ouvert = layout.classList.toggle("web-filtres-ouverts");
      bf.setAttribute("aria-expanded", String(ouvert));
    });
    gauche.insertBefore(bf, gauche.firstChild);
    const puces = $("#active-chips");
    const compte = () => { $(".web-n", bf).textContent = puces && puces.children.length ? String(puces.children.length) : ""; };
    if (puces) new MutationObserver(compte).observe(puces, { childList: true });
    compte();
  }

  // ------------------------------------------- fenêtre « prêt à ouvrir »
  // Remplace l'annonce du pont : un <dialog> modal passe au-dessus d'une
  // fiche ouverte, une notification non.
  if (web.ouvreLien) {
    const dlg = document.createElement("dialog");
    dlg.className = "web-lien";
    dlg.innerHTML = '<p id="web-lien-texte">Le document est prêt.</p><div class="web-lien-actions">'
      + '<button type="button" class="btn" data-web-fermer>Fermer</button>'
      + '<a class="btn primary" id="web-lien-a" target="_blank" rel="noopener">' + ic("external") + 'Ouvrir</a></div>';
    document.body.appendChild(dlg);
    dlg.querySelector("[data-web-fermer]").addEventListener("click", () => dlg.close());
    $("#web-lien-a").addEventListener("click", () => setTimeout(() => dlg.close(), 200));
    web.proposeLien = (url, libelle) => {
      $("#web-lien-a").href = url;
      $("#web-lien-texte").textContent = (libelle || "Le document") + " — touchez « Ouvrir ».";
      if (!dlg.open) dlg.showModal();
    };
  }

  // ------------------------------------------- installation et mises à jour
  let invite = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); invite = e; majSection(); });
  window.addEventListener("appinstalled", () => { invite = null; majSection(); });

  let enregistrement = null;
  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("sw.js").then((r) => {
      enregistrement = r;
      // Nouvelle version téléchargée en arrière-plan : on la propose.
      r.addEventListener("updatefound", () => {
        const nouveau = r.installing;
        if (!nouveau) return;
        nouveau.addEventListener("statechange", () => {
          if (nouveau.state === "installed" && navigator.serviceWorker.controller) proposeRechargement();
        });
      });
      setInterval(() => r.update().catch(() => {}), 6 * 3600 * 1000);
    }).catch(() => {});
    let recharge = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (!recharge) { recharge = true; location.reload(); } });
  }
  function proposeRechargement() {
    if (web.annonce) web.annonce("Nouvelle version du registre disponible : touchez ici pour l'appliquer.", "success", 15000);
    const t = document.querySelector("#toasts .toast:last-child");
    if (t) t.addEventListener("click", appliqueMaj, { once: true });
  }
  function appliqueMaj() {
    if (enregistrement && enregistrement.waiting) enregistrement.waiting.postMessage("activer");
    else location.reload();
  }

  const corps = $("#settings-dialog .modal-body");
  const section = document.createElement("div");
  section.className = "settings-section web-appli";
  section.innerHTML = '<h3>Application mobile</h3>'
    + '<p class="help">Version web <span class="web-version">' + (web.VERSION || "") + '</span> — elle se met à jour toute seule. '
    + 'La veille automatique, les fenêtres de consultation et Tender AI restent sur le logiciel installé sur PC ; '
    + 'le téléphone voit tout ce qu\'ils ajoutent au registre.</p>'
    + '<p><span class="web-etat" id="web-etat"></span></p>'
    + '<div class="web-actions">'
    + '<button type="button" class="btn primary small" id="web-installer" hidden>' + ic("download") + 'Installer sur l\'écran d\'accueil</button>'
    + '<button type="button" class="btn small" id="web-verifier">' + ic("refresh") + 'Rechercher une nouvelle version</button>'
    + '</div>'
    + '<div id="web-ios" hidden><p class="help">Sur iPhone : dans Safari,</p><ol>'
    + '<li>touchez le bouton Partager (le carré avec une flèche) ;</li>'
    + '<li>choisissez « Sur l\'écran d\'accueil » ;</li>'
    + '<li>touchez « Ajouter ». L\'icône A&amp;A apparaît avec vos applications.</li></ol></div>';
  if (corps) corps.insertBefore(section, corps.firstChild);

  function majSection() {
    const etat = $("#web-etat");
    if (!etat) return;
    const installe = autonome();
    etat.className = "web-etat" + (installe ? "" : " non");
    etat.textContent = installe ? "✓ Installée sur cet appareil" : "Ouverte dans le navigateur";
    $("#web-installer").hidden = installe || !invite;
    $("#web-ios").hidden = installe || !ios;
  }
  majSection();
  $("#web-installer") && $("#web-installer").addEventListener("click", async () => {
    if (!invite) return;
    invite.prompt();
    try { await invite.userChoice; } catch (_) {}
    invite = null;
    majSection();
  });
  $("#web-verifier") && $("#web-verifier").addEventListener("click", async () => {
    const b = $("#web-verifier");
    b.disabled = true; b.classList.add("is-busy");
    try {
      if (enregistrement) {
        await enregistrement.update();
        if (enregistrement.waiting || enregistrement.installing) { proposeRechargement(); }
        else if (web.annonce) web.annonce("Le registre est à jour (version " + (web.VERSION || "") + ").", "success");
      } else if (web.annonce) {
        web.annonce("Mises à jour automatiques indisponibles dans ce navigateur : rechargez la page.", "info");
      }
    } catch (_) {
      if (web.annonce) web.annonce("Vérification impossible : connexion Internet ?", "error");
    }
    b.disabled = false; b.classList.remove("is-busy");
  });
})();
