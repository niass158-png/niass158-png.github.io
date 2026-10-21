(function () {
  "use strict";

  // ======================================================================
  // Référentiels
  // ======================================================================
  const FILIALES = [
    { value: "A&A Strategy", short: "Strategy", cls: "f-strategy" },
    { value: "A&A Finance and Investment Advisory", short: "Finance & Investment", cls: "f-finance" },
    { value: "A&A Project Delivery", short: "Project Delivery", cls: "f-delivery" },
    { value: "A&A Knowledge Institute", short: "Knowledge Institute", cls: "f-knowledge" }
  ];
  const FILIALE_BY_VALUE = Object.fromEntries(FILIALES.map(f => [f.value, f]));
  const filialeMeta = (v) => FILIALE_BY_VALUE[v] || { value: "", short: "À qualifier", cls: "f-none" };

  const STATUTS = [
    { value: "Nouvelle", cls: "ws-nouvelle" },
    { value: "À qualifier", cls: "ws-qualifier" },
    { value: "En cours", cls: "ws-encours" },
    { value: "Soumise", cls: "ws-soumise" },
    { value: "Gagnée", cls: "ws-gagnee" },
    { value: "Perdue", cls: "ws-perdue" }
  ];
  const statutCls = (v) => (STATUTS.find(s => s.value === v) || STATUTS[0]).cls;

  const ECHEANCES = ["Sous 7 jours", "Plus de 7 jours", "Sans échéance", "Clôturées"];

  // Groupes de filtres de la colonne de gauche (la filiale a ses propres onglets).
  const FILTER_GROUPS = [
    { key: "echeance", label: "Échéance", open: true, options: () => ECHEANCES, get: o => echeanceBucket(o) },
    { key: "pertinence", label: "Pertinence A&A", open: true, options: () => ["Forte", "Moyenne", "Faible"], get: o => pertinenceDe(o).court },
    { key: "statut_traitement", label: "Suivi", open: true, options: () => STATUTS.map(s => s.value), get: o => o.statut_traitement || "Nouvelle" },
    { key: "type", label: "Type d'offre", open: true },
    { key: "secteur", label: "Secteur", open: false },
    { key: "region", label: "Région", open: false },
    { key: "origine", label: "Émetteur", open: false, options: () => ["État", "Privé"] },
    { key: "source_id", label: "Source de l'information", open: true, get: o => sourceLabel(o.source_id) },
    { key: "cycle", label: "Temporalité", open: false, get: o => cycleVie(o).label }
  ];

  // ======================================================================
  // Pertinence A&A — au regard des 65 missions de référence (references.js)
  // ======================================================================
  const CACHE_PERT = new Map();
  /** Pertinence d'une offre, calculée une fois par version de l'offre. */
  function pertinenceDe(o) {
    const cle = o.id + "|" + (o.maj_le || o.updated_at || "") + "|" + (o.titre || "").length;
    let p = CACHE_PERT.get(cle);
    if (!p) {
      p = AA.references ? AA.references.pertinence(o) : { score: 0, niveau: "faible", domaines: [], secteurs: [], clients: [], references: [], raisons: [] };
      p.court = { forte: "Forte", moyenne: "Moyenne", faible: "Faible", hors: "Faible" }[p.niveau];
      CACHE_PERT.set(cle, p);
    }
    return p;
  }

  /**
   * Le bloc « Pertinence A&A » de la fiche : pourquoi l'offre nous concerne,
   * et les missions déjà menées qu'on citera dans l'offre technique.
   */
  function renderPertinenceFiche(o) {
    const box = $("#dlg-pert");
    if (!box) return;
    const p = pertinenceDe(o);
    const lignes = [];
    if (p.domaines.length) lignes.push(["Domaine", p.domaines.slice(0, 2).map(d => d.libelle).join(" · ")]);
    if (p.secteurs.length) lignes.push(["Secteur", p.secteurs.slice(0, 3).map(x => x.libelle).join(" · ")]);
    if (p.clients.length) lignes.push(["Client de référence", p.clients.join(", ")]);
    if (p.geo) lignes.push(["Zone", p.geo.libelle]);
    const refs = p.references;
    box.innerHTML = `
      <div class="block-label">Pertinence A&amp;A <span class="pert pert-${esc(p.court.toLowerCase())}"><i style="--p:${p.score}%"></i>${esc(p.court)} · ${p.score}/100</span></div>
      ${lignes.length ? `<dl class="pert-faits">${lignes.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`
        : `<p class="muted-line">Aucun domaine d'intervention du groupe reconnu dans l'intitulé : vérifiez l'objet de la mission avant d'y consacrer du temps.</p>`}
      <div class="pert-refs-titre">${refs.length ? "Missions comparables déjà réalisées" : "Aucune mission comparable dans les références"}</div>
      ${refs.length ? `<ol class="pert-refs">${refs.map(r => `
        <li><span class="pert-an">${esc(String(r.annee))}</span>
          <div><b>${esc(r.client)}</b><span>${esc(r.intitule)}</span>
          <em>${esc(r.pourquoi.join(" · "))}${r.pays && r.pays !== "Sénégal" ? " · " + esc(r.pays) : ""}</em></div></li>`).join("")}</ol>` : ""}
      <p class="pert-source">Source : références de missions A&amp;A Strategy (65 missions, 2019-2026).</p>`;
  }

  /** La pastille de pertinence d'une carte ou d'une ligne. */
  function pucePertinence(o) {
    const p = pertinenceDe(o);
    const ref = p.references[0];
    const titre = "Pertinence A&A : " + p.score + "/100"
      + (p.domaines[0] ? " — " + p.domaines[0].libelle : "")
      + (ref ? "\nMission comparable : " + ref.client + " (" + ref.annee + ") — " + ref.intitule : "");
    return `<span class="pert pert-${esc(p.court.toLowerCase())}" title="${esc(titre)}"><i style="--p:${p.score}%"></i>${esc(p.court)}</span>`;
  }

  // ======================================================================
  // État
  // ======================================================================
  let OFFERS = [];
  let FILE_COUNTS = {};   // offer_id -> nombre de documents
  let SOURCES = [];       // sources de veille ajoutées par l'équipe
  let OPPS = [];          // opportunités de prospection
  let CONTACTS = [];      // carnet de contacts pour les arbitrages
  let VOTES = [];         // avis GO / NO GO de l'offre ouverte
  let CORBEILLE = [];     // offres supprimées ou devenues obsolètes, restaurables
  let currentTab = "veille";
  const POIDS = { fit: 0.25, relation: 0.25, financement: 0.20, urgence: 0.15, concurrence: 0.15 };
  const RESULTATS = ["En attente", "Retenu (présélection)", "Gagné", "Perdu", "Retrait / marché annulé"];
  let fuse = null;
  let sb = null;
  let realtimeChannel = null;
  let currentDetailId = null;
  let whoami = "";
  let profil = "contributeur";        // "contributeur" ou "administrateur"
  let COMPTES = {};                   // adresses des deux comptes d'équipe
  const estAdmin = () => profil === "administrateur";
  let filialeTab = ""; // "" = toutes
  const active = {}; FILTER_GROUPS.forEach(g => active[g.key] = new Set());
  const ui = { sort: pref("sort", "echeance"), view: pref("view", "cards"), collectorRunning: false };

  // ======================================================================
  // Utilitaires
  // ======================================================================
  // Le noyau (noyau.js) porte tout ce qui ne dépend d'aucun état : le document,
  // l'échappement, les dates, l'échéance. On le range ici sous les mêmes noms,
  // si bien que le reste du fichier n'a pas à savoir qu'il a déménagé.
  const {
    $, $$, esc, icon, initials, plural,
    aplati, sansAccent,
    jourIso, jourIsoDe, jourDecale, anneeDe,
    fmtDate, fmtTime,
    urgency, echeanceBucket, duePill, compareEcheance
  } = window.AA.noyau;

  // ======================================================================
  // Travail à plusieurs : qui est en ligne, qui a fait quoi, et un bouton
  // pour se remettre à jour
  // ======================================================================
  // Le temps réel existait déjà, mais rien ne disait à l'écran s'il tenait :
  // quand la liaison tombait (réseau, mise en veille du PC), un GO tranché
  // sur un autre poste n'arrivait jamais, sans le moindre signe. On montre
  // donc l'état de la liaison, on bascule sur une relecture régulière quand
  // elle est coupée, et le bouton « Actualiser » recharge tout, à la demande.
  //
  // La personne est désignée par le nom saisi dans « Me présenter » : les
  // comptes du registre sont des comptes d'équipe, la base ne peut donc pas
  // savoir qui est derrière le clavier. Chaque modification est signée de ce
  // nom (maj_par), et un déclencheur de la base en tient l'historique.

  const ACTIONS_JOURNAL = {
    decision: (d) => d === "GO" ? "a tranché GO" : d === "NO GO" ? "a tranché NO GO" : "a mis l'offre « " + (d || "non arbitrée") + " »",
    statut: (d) => "a passé l'offre en « " + (d || "Nouvelle") + " »",
    assignation: (d) => d ? "a assigné l'offre à " + d : "a retiré le responsable",
    corbeille: (d) => "a envoyé l'offre à la corbeille" + (d ? " (" + d + ")" : ""),
    restauration: () => "a remis l'offre au registre",
    resultat: (d) => "a noté le résultat : " + d,
    soumission: (d) => "a noté la soumission du " + d,
    exigences: (d) => "a mis à jour les exigences du DAO (" + d + ")"
  };

  const heure = (iso) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const avatarDe = (nom, cls) => `<span class="avatar sm${cls ? " " + cls : ""}" title="${esc(nom || "Collaborateur non présenté")}">${esc(nom ? initials(nom) : "?")}</span>`;

  /** Il y a combien de temps, en clair. */
  function ilYa(iso) {
    if (!iso) return "";
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "à l'instant";
    if (s < 3600) return "il y a " + Math.round(s / 60) + " min";
    if (s < 86400) return "il y a " + Math.round(s / 3600) + " h";
    return fmtTime(iso);
  }

  /** Ajoute la signature de la personne à toute modification d'une offre. */
  function signe(patch, auteur) {
    const p = Object.assign({}, patch, { maj_par: auteur || whoami || "Anonyme", maj_le: new Date().toISOString() });
    if (Object.prototype.hasOwnProperty.call(patch, "statut_traitement")) {
      p.statut_par = p.maj_par; p.statut_le = p.maj_le;
    }
    return p;
  }

  // --------------------------------------------- liaison et actualisation
  const SYNC = { tempsReel: "connexion", derniere: 0, releve: null, enCours: false };

  function majSync() {
    const sub = $("#sync-sub"), btn = $("#sync-btn");
    if (!sub || !btn) return;
    btn.dataset.etat = SYNC.tempsReel;
    const quand = SYNC.derniere ? "à jour " + heure(SYNC.derniere) : "—";
    sub.textContent = SYNC.tempsReel === "ok" ? "Temps réel · " + quand
      : SYNC.tempsReel === "coupe" ? "Liaison coupée · " + quand
      : quand;
    btn.title = SYNC.tempsReel === "ok"
      ? "Les modifications de l'équipe arrivent d'elles-mêmes. Cliquez pour tout recharger (F5)."
      : "La liaison en direct est coupée : le registre se relit toutes les 45 secondes. Cliquez pour recharger maintenant (F5).";
  }

  function demarreReleve() {
    if (SYNC.releve) return;
    SYNC.releve = setInterval(() => actualiserTout(false), 45000);
  }
  function arreteReleve() {
    if (SYNC.releve) { clearInterval(SYNC.releve); SYNC.releve = null; }
  }

  /** Recharge tout ce que l'équipe a pu changer. */
  async function actualiserTout(manuel) {
    if (!sb || SYNC.enCours) return;
    SYNC.enCours = true;
    const btn = $("#sync-btn");
    if (btn) btn.classList.add("is-busy");
    try {
      await loadOffers();
      if (currentDetailId && detailDlg.open) {
        loadNotes(currentDetailId); loadVotes(currentDetailId); loadFiles(currentDetailId); loadJournal(currentDetailId);
      }
      if (!$("#presence-pop").hidden) loadActivite();
      // La liaison est tombée : on la renoue au passage.
      if (SYNC.tempsReel !== "ok") { subscribeRealtime(); rejoindrePresence(); }
      if (manuel) toast("Registre à jour — dernières modifications de l'équipe chargées.", "success", 2500);
    } finally {
      SYNC.enCours = false;
      if (btn) btn.classList.remove("is-busy");
    }
  }

  $("#sync-btn").addEventListener("click", () => actualiserTout(true));
  document.addEventListener("keydown", (e) => {
    if (e.key === "F5") { e.preventDefault(); actualiserTout(true); }
  });
  // Retour sur l'application après un moment ailleurs (ou au réveil du PC) :
  // on se remet à jour sans attendre qu'on le demande.
  window.addEventListener("focus", () => {
    if (sb && SYNC.derniere && Date.now() - SYNC.derniere > 60000) actualiserTout(false);
  });
  setInterval(majSync, 30000);

  /** Statut de la liaison en direct, reçu de Supabase. */
  function surEtatTempsReel(status) {
    if (status === "SUBSCRIBED") { SYNC.tempsReel = "ok"; arreteReleve(); }
    else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") { SYNC.tempsReel = "coupe"; demarreReleve(); }
    majSync();
  }

  // --------------------------------------- ce que les collègues viennent de faire
  const RECENTS = new Map();   // id d'offre → horodatage d'une modification venue d'un autre poste

  /**
   * Un changement arrive du temps réel. On le compare à ce que l'écran montre
   * encore, pour dire en une phrase ce qu'un collègue vient de faire. Ses
   * propres gestes ne sont pas annoncés : on les a sous les yeux.
   */
  function annonceChangement(p) {
    if (!p || p.eventType !== "UPDATE" || !p.new) return;
    const n = p.new;
    const avant = OFFERS.find(x => x.id === n.id);
    if (!avant) return;
    const auteur = n.maj_par || "";
    if (auteur && whoami && auteur === whoami) return;
    const qui = auteur || "Un collaborateur";
    const titre = "« " + String(n.titre || avant.titre || "").slice(0, 70) + (String(n.titre || "").length > 70 ? "…" : "") + " »";
    let phrase = null;
    if (n.decision !== avant.decision && (n.decision === "GO" || n.decision === "NO GO")) {
      phrase = qui + " a tranché " + n.decision + " : " + titre;
    } else if (n.statut_traitement !== avant.statut_traitement) {
      phrase = qui + " a passé " + titre + " en « " + (n.statut_traitement || "Nouvelle") + " »";
    } else if ((n.assigne || "") !== (avant.assigne || "")) {
      phrase = n.assigne ? qui + " a assigné " + titre + " à " + n.assigne : qui + " a retiré le responsable de " + titre;
    } else if (n.supprime_le && !avant.supprime_le) {
      phrase = qui + " a envoyé " + titre + " à la corbeille";
    }
    if (!phrase) return;
    RECENTS.set(n.id, Date.now());
    toast(phrase, "info", 7000);
  }

  /** Une offre modifiée par un collègue il y a moins de 3 minutes. */
  const estRecente = (id) => {
    const t = RECENTS.get(id);
    if (!t) return false;
    if (Date.now() - t > 180000) { RECENTS.delete(id); return false; }
    return true;
  };

  // ------------------------------------------------------- les initiales
  /** Pastille GO / NO GO avec les initiales de qui a tranché. */
  function puceDecision(o) {
    const d = o.decision;
    if (d !== "GO" && d !== "NO GO" && d !== "En arbitrage") return "";
    const qui = o.decision_par || "";
    const titre = d === "En arbitrage" ? "En attente d'arbitrage"
      : "Tranché " + d + (qui ? " par " + qui : "") + (o.decision_le ? " — " + fmtTime(o.decision_le) : "");
    const cls = d === "GO" ? "go" : d === "NO GO" ? "nogo" : "attente";
    return `<span class="dchip ${cls}" title="${esc(titre)}">${esc(d === "En arbitrage" ? "Arbitrage" : d)}${d !== "En arbitrage" && qui ? `<i>${esc(initials(qui))}</i>` : ""}</span>`;
  }

  /** Initiales de qui a fixé le statut, collées à la pastille de statut. */
  function initialesStatut(o) {
    if (!o.statut_par) return "";
    return `<i class="wstatus-par" title="${esc("Statut fixé par " + o.statut_par + (o.statut_le ? " — " + fmtTime(o.statut_le) : ""))}">${esc(initials(o.statut_par))}</i>`;
  }

  /** Le pied de la fiche : dernière modification, et qui d'autre la regarde. */
  function renderCollabFiche(o) {
    const maj = $("#dlg-maj");
    if (maj) {
      maj.innerHTML = o && o.maj_par && o.maj_le
        ? `${avatarDe(o.maj_par)} Modifiée ${esc(ilYa(o.maj_le))} par <b>${esc(o.maj_par)}</b>`
        : "";
    }
    const sp = $("#dlg-statut-par");
    if (sp) {
      sp.innerHTML = o && o.statut_par
        ? `${avatarDe(o.statut_par)} « ${esc(o.statut_traitement || "Nouvelle")} » fixé par <b>${esc(o.statut_par)}</b>${o.statut_le ? " " + esc(fmtTime(o.statut_le)) : ""}`
        : "";
    }
    renderPresentsFiche();
  }

  // ------------------------------------------------------------ historique
  async function loadJournal(offerId) {
    const box = $("#dlg-journal");
    if (!sb || !box) return;
    const { data, error } = await sb.from("offer_journal").select("action,detail,par,le").eq("offer_id", offerId).order("le", { ascending: false }).limit(60);
    if (currentDetailId !== offerId) return;
    if (error) { box.innerHTML = `<p class="muted-line">Historique indisponible (${esc(error.message)}).</p>`; return; }
    const lignes = data || [];
    $("#dlg-journal-count").textContent = lignes.length || "";
    box.innerHTML = lignes.length ? lignes.map(j => `
      <div class="journal-ligne">
        ${avatarDe(j.par)}
        <div><b>${esc(j.par || "Collaborateur non présenté")}</b> ${esc((ACTIONS_JOURNAL[j.action] || (() => j.action))(j.detail))}
          <div class="journal-quand">${esc(fmtTime(j.le))}</div></div>
      </div>`).join("")
      : '<p class="muted-line">Rien d\'enregistré depuis la mise en place de l\'historique (version 1.12).</p>';
  }

  async function loadActivite() {
    const box = $("#activite-list");
    if (!sb || !box) return;
    const { data, error } = await sb.from("offer_journal").select("offer_id,action,detail,par,le").order("le", { ascending: false }).limit(15);
    if (error) { box.innerHTML = `<p class="muted-line">Activité indisponible (${esc(error.message)}).</p>`; return; }
    const lignes = (data || []).filter(j => j.action !== "corbeille" || j.par !== "Archivage automatique");
    box.innerHTML = lignes.length ? lignes.map(j => {
      const o = OFFERS.concat(CORBEILLE).find(x => x.id === j.offer_id);
      return `<button type="button" class="activite-ligne" ${o ? `data-open="${esc(o.id)}"` : "disabled"}>
        ${avatarDe(j.par)}
        <span><b>${esc(j.par || "Collaborateur")}</b> ${esc((ACTIONS_JOURNAL[j.action] || (() => j.action))(j.detail))}
          ${o ? `<span class="activite-offre">${esc(String(o.titre || "").slice(0, 80))}</span>` : ""}
          <span class="journal-quand">${esc(ilYa(j.le))}</span></span>
      </button>`;
    }).join("") : '<p class="muted-line">Aucune action enregistrée pour l\'instant.</p>';
  }

  // --------------------------------------------------------------- présence
  // Présence Supabase : chaque poste annonce son nom, son profil et la fiche
  // ouverte. Rien n'est écrit en base ; à la fermeture, la présence s'éteint.
  let presenceCanal = null;
  let PRESENTS = [];
  const DEBUT_SESSION = new Date().toISOString();
  const CLE_POSTE = Math.random().toString(36).slice(2, 10);

  function etatPresence() {
    const o = currentDetailId ? OFFERS.concat(CORBEILLE).find(x => x.id === currentDetailId) : null;
    return {
      nom: whoami || "",
      profil,
      vue: currentTab || "veille",
      offre: currentDetailId && detailDlg.open ? currentDetailId : null,
      titre: o && detailDlg.open ? String(o.titre || "").slice(0, 90) : null,
      depuis: DEBUT_SESSION
    };
  }

  let annonceTimer = null;
  function annoncePresence() {
    clearTimeout(annonceTimer);
    annonceTimer = setTimeout(() => {
      if (presenceCanal && presenceCanal.state === "joined") presenceCanal.track(etatPresence()).catch(() => {});
      renderPresentsFiche();
    }, 250);
  }

  function rejoindrePresence() {
    if (!sb) return;
    if (presenceCanal) { try { sb.removeChannel(presenceCanal); } catch (_) {} }
    presenceCanal = sb.channel("registre-presence", { config: { presence: { key: CLE_POSTE } } });
    presenceCanal
      .on("presence", { event: "sync" }, () => {
        const etat = presenceCanal.presenceState();
        PRESENTS = Object.entries(etat).map(([cle, metas]) => Object.assign({ cle }, metas[metas.length - 1] || {}));
        renderPresence();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") presenceCanal.track(etatPresence()).catch(() => {});
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { PRESENTS = []; renderPresence(); }
      });
  }

  const NOMS_VUES = { veille: "Veille & registre", go: "Offres GO", attente: "En attente de décision", soumissions: "Soumissions", prospection: "Prospection", tableau: "Tableau de bord", corbeille: "Corbeille" };

  /** Une personne peut avoir deux fenêtres ouvertes : on la compte une fois. */
  function personnesEnLigne() {
    const parNom = new Map();
    PRESENTS.forEach(p => {
      const k = p.nom ? p.nom.toLowerCase() : "anonyme:" + p.cle;
      const deja = parNom.get(k);
      if (!deja || (p.offre && !deja.offre)) parNom.set(k, Object.assign({ moi: p.cle === CLE_POSTE || (deja && deja.moi) }, p));
      else if (p.cle === CLE_POSTE) deja.moi = true;
    });
    return Array.from(parNom.values()).sort((a, b) => (b.moi ? 1 : 0) - (a.moi ? 1 : 0) || String(a.nom).localeCompare(String(b.nom)));
  }

  function renderPresence() {
    const gens = personnesEnLigne();
    const autres = gens.filter(p => !p.moi);
    const lab = $("#presence-label");
    $("#presence").dataset.n = gens.length;
    lab.textContent = !gens.length ? "Hors ligne"
      : autres.length ? plural(gens.length, "en ligne", "en ligne") : "Vous seul en ligne";
    const visibles = gens.slice(0, 4);
    $("#presence-avatars").innerHTML = visibles.map(p => avatarDe(p.nom, p.moi ? "moi" : "")).join("")
      + (gens.length > 4 ? `<span class="avatar sm plus">+${gens.length - 4}</span>` : "");
    $("#presence-n").textContent = gens.length || "";
    $("#presence-list").innerHTML = gens.length ? gens.map(p => `
      <div class="presence-ligne">
        ${avatarDe(p.nom, p.moi ? "moi" : "")}
        <div><b>${esc(p.nom || "Collaborateur non présenté")}</b>${p.moi ? ' <span class="muted">(vous)</span>' : ""}
          <span class="presence-role">${p.profil === "administrateur" ? "administrateur" : "contributeur"} · connecté ${esc(p.depuis ? "depuis " + heure(p.depuis) : "")}</span>
          <span class="presence-ou">${p.titre ? "Sur la fiche « " + esc(p.titre) + " »" : "Dans « " + esc(NOMS_VUES[p.vue] || p.vue || "le registre") + " »"}</span>
        </div>
      </div>`).join("") : '<p class="muted-line">Liaison en direct indisponible : la présence n\'est pas connue.</p>';
    renderPresentsFiche();
  }

  /** Dans la fiche : qui d'autre l'a ouverte en ce moment. */
  function renderPresentsFiche() {
    const box = $("#dlg-presents");
    if (!box) return;
    const ici = currentDetailId ? personnesEnLigne().filter(p => !p.moi && p.offre === currentDetailId) : [];
    box.innerHTML = ici.length
      ? `<span class="presents-pastille">${ici.map(p => avatarDe(p.nom)).join("")} ${esc(ici.map(p => p.nom || "un collaborateur").join(", "))} ${ici.length > 1 ? "consultent" : "consulte"} aussi cette fiche</span>`
      : "";
  }

  // Ouverture / fermeture de la fenêtre « en ligne et activité ».
  $("#presence").addEventListener("click", (e) => {
    e.stopPropagation();
    const pop = $("#presence-pop");
    pop.hidden = !pop.hidden;
    if (!pop.hidden) loadActivite();
  });
  document.addEventListener("click", (e) => {
    const pop = $("#presence-pop");
    if (!pop.hidden && !e.target.closest("#presence-pop") && !e.target.closest("#presence")) pop.hidden = true;
    if (e.target.closest("#presence-pop [data-open]")) pop.hidden = true;
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#presence-pop").hidden = true; });


  // Les règles métier (metier.js) : ce qu'est une offre déposée, gagnée,
  // perdue, engagée. Une seule définition pour tous les écrans — il y en avait
  // trois, et elles ne donnaient pas le même nombre.
  const AA = window.AA;
  const { estSoumise, estGagnee, estPerdue, estEngagee, estArbitree, bilanFiliale } = AA.metier;


  // ------------------------------------------------------- bibliothèques
  // Chargées depuis node_modules (aucun téléchargement à l'ouverture) ; le CDN
  // ne sert que de secours, et le module Excel n'est chargé qu'à l'export.
  // La version web (téléphone) livre les mêmes fichiers dans son propre
  // dossier : son pont indique où (window.aa.libs).
  const BASE_LIBS = (window.aa && window.aa.libs) || "../node_modules/";
  const LIBS = {
    supabase: { global: "supabase", local: BASE_LIBS + "@supabase/supabase-js/dist/umd/supabase.js", cdn: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.js" },
    fuse:     { global: "Fuse",     local: BASE_LIBS + "fuse.js/dist/fuse.min.js",                   cdn: "https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js" },
    xlsx:     { global: "XLSX",     local: BASE_LIBS + "xlsx/dist/xlsx.full.min.js",                 cdn: "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js" }
  };
  const libLoaded = {};
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src; el.onload = resolve; el.onerror = reject;
      document.head.appendChild(el);
    });
  }
  async function ensureLib(name) {
    const lib = LIBS[name];
    if (window[lib.global]) return true;
    if (libLoaded[name]) return !!window[lib.global];
    libLoaded[name] = true;
    try { await loadScript(lib.local); } catch (_) { /* absent en développement */ }
    if (window[lib.global]) return true;
    try { await loadScript(lib.cdn); } catch (_) { /* hors ligne */ }
    return !!window[lib.global];
  }

  function pref(key, fallback) {
    try { return localStorage.getItem("aa." + key) || fallback; } catch { return fallback; }
  }
  function setPref(key, value) {
    try { localStorage.setItem("aa." + key, value); } catch { /* sans importance */ }
  }

  // Offres importées depuis une fenêtre de consultation du logiciel.
  const IMPORTS = { "devaid:import": "Development AID", "ungm:import": "UNGM", "bm:import": "Banque mondiale",
    "dgmpci:import": "DGMP Côte d'Ivoire", "linkedin:import": "LinkedIn" };

  function sourceLabel(id) {
    if (!id || id === "manuel") return "Saisie manuelle";
    if (id === "seed") return "Exemple";
    if (id === "hors-logiciel") return "Saisie hors logiciel";
    if (id === "assistant") return "Saisie par l'assistant";
    if (id === "import-excel") return "Import Excel";
    if (id === "aps") return "Veille · APS";
    if (id === "senoffre") return "Veille · SenOffre";
    if (IMPORTS[id]) return "Import · " + IMPORTS[id];
    if (id === "alertes:developmentaid") return "Alertes e-mail · Development AID";
    if (String(id).startsWith("src:")) {
      const src = SOURCES.find(x => x.id === String(id).slice(4));
      return "Veille · " + (src ? src.nom : "source personnalisée");
    }
    return "Veille · " + id;
  }



  // ------------------------------------------------------------ notifications
  function toast(message, type = "info", ms) {
    const box = $("#toasts");
    const el = document.createElement("div");
    el.className = "toast " + type;
    const ic = type === "success" ? "check" : type === "error" ? "alert" : "bell";
    el.innerHTML = `${icon(ic)}<div class="toast-msg"></div><button class="icon-btn" type="button" title="Fermer">${icon("x")}</button>`;
    el.querySelector(".toast-msg").textContent = message;
    el.querySelector("button").addEventListener("click", () => el.remove());
    box.appendChild(el);
    setTimeout(() => el.remove(), ms || (type === "error" ? 9000 : 3800));
  }

  // ======================================================================
  // Paramètres & profil
  // ======================================================================
  const settingsDlg = $("#settings-dialog");
  const settingsForm = $("#settings-form");

  function renderUser() {
    const chip = $("#user-chip");
    chip.classList.toggle("is-empty", !whoami);
    chip.dataset.profil = profil;
    chip.title = whoami
      ? whoami + " — " + (estAdmin() ? "administrateur" : "contributeur")
      : "Mon profil et la connexion";
    $("#user-avatar").textContent = whoami ? initials(whoami) : "?";
    $("#user-name").textContent = whoami || "Me présenter";
    annoncePresence();
  }

  async function openSettings(focusName) {
    const cfg = await window.aa.getSettings();
    settingsForm.whoami.value = cfg.whoami || "";
    settingsForm.veilleAuDemarrage.checked = cfg.veilleAuDemarrage !== false;
    settingsForm.supabaseUrl.value = cfg.supabaseUrl || "";
    settingsForm.supabaseAnonKey.value = cfg.supabaseAnonKey || "";
    settingsDlg.showModal();
    settingsForm.whoami.focus();
  }

  $("#settings-btn").addEventListener("click", () => openSettings(false));
  $("#user-chip").addEventListener("click", () => openSettings(true));

  settingsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const before = await window.aa.getSettings();
    const patch = {
      whoami: settingsForm.whoami.value.trim(),
      veilleAuDemarrage: settingsForm.veilleAuDemarrage.checked,
      supabaseUrl: settingsForm.supabaseUrl.value.trim(),
      supabaseAnonKey: settingsForm.supabaseAnonKey.value.trim()
    };
    await window.aa.setSettings(patch);
    whoami = patch.whoami;
    renderUser();
    settingsDlg.close();
    if (patch.supabaseUrl !== before.supabaseUrl || patch.supabaseAnonKey !== before.supabaseAnonKey || !sb) {
      initSupabase(patch.supabaseUrl, patch.supabaseAnonKey);
      toast("Connexion au registre enregistrée.", "success");
    } else {
      toast("Paramètres enregistrés.", "success");
    }
  });

  function setConn(state, label) {
    $("#conn").dataset.state = state;
    $("#conn-label").textContent = label;
    $("#conn").title = label;
  }

  // ======================================================================
  // Supabase (côté interface : lecture, édition, temps réel)
  // ======================================================================
  // ======================================================================
  // Connexion au registre — code d'équipe
  //
  // Deux comptes existent dans le registre : l'un contributeur, l'autre
  // administrateur. Le collaborateur ne saisit qu'un code ; c'est le compte
  // auquel ce code correspond qui détermine ses droits. Les droits sont
  // ensuite appliqués par la base elle-même : masquer un bouton ne protège
  // rien, c'est une politesse envers l'utilisateur, pas une sécurité.
  // ======================================================================
  const loginDlg = $("#login-dialog");

  function erreurConnexion(message) {
    const box = $("#login-error");
    box.textContent = message || "";
    box.hidden = !message;
  }

  /** Essaie le code sur les deux comptes ; renvoie le profil obtenu, ou null. */
  async function tenteConnexion(code) {
    for (const [role, email] of [["contributeur", COMPTES.contributeur], ["administrateur", COMPTES.administrateur]]) {
      if (!email) continue;
      const { data, error } = await sb.auth.signInWithPassword({ email, password: code });
      if (!error && data && data.session) return { role, session: data.session };
      // Un identifiant refusé fait partie du jeu : on passe au compte suivant.
      // Toute autre erreur (réseau, projet injoignable) doit remonter.
      if (error && !/invalid login credentials|invalid_grant/i.test(error.message)) throw error;
    }
    return null;
  }

  /**
   * Le rôle fait foi côté base, pas côté application : on le relit dans
   * app_roles plutôt que de déduire des droits du compte utilisé.
   */
  async function lisProfil(secours, userId) {
    try {
      // Il faut filtrer sur le compte connecté. Sans ce eq(), la requête
      // renvoyait la première ligne venue de la table des rôles : un
      // administrateur se retrouvait catalogué contributeur — et la veille
      // échouait, le collecteur présentant alors l'adresse du contributeur
      // avec le code de l'administrateur.
      let q = sb.from("app_roles").select("role");
      if (userId) q = q.eq("user_id", userId);
      const { data } = await q.limit(1);
      if (data && data.length && data[0].role) return data[0].role;
    } catch (_) { /* table absente : on retombe sur le compte utilisé */ }
    return secours;
  }

  async function connecte(code, nom) {
    const res = await tenteConnexion(code);
    if (!res) return null;
    const userId = res.session && res.session.user ? res.session.user.id : null;
    profil = await lisProfil(res.role, userId);
    whoami = nom || whoami;
    await window.aa.rememberTeamCode(code, profil);
    await window.aa.setSettings({ whoami });
    return profil;
  }

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    erreurConnexion("");
    const nom = $("#login-nom").value.trim();
    const code = $("#login-code").value;
    if (!nom || !code) return;
    const btn = $("#login-submit");
    btn.disabled = true;
    btn.classList.add("is-busy");
    try {
      const ok = await connecte(code, nom);
      if (!ok) {
        erreurConnexion("Code d'équipe non reconnu. Vérifiez-le auprès de l'administrateur du registre.");
        $("#login-code").select();
        return;
      }
      loginDlg.close();
      appliqueProfil();
      renderUser();
      showState("loading", "Chargement du registre…");
      loadOffers();
      subscribeRealtime();
      rejoindrePresence();
      toast("Connecté au registre — profil " + profil + ".", "success");
    } catch (err) {
      erreurConnexion(estPanneReseau(err && err.message)
        ? "Registre injoignable : vérifiez la connexion Internet de ce poste."
        : "Connexion impossible : " + (err && err.message ? err.message : err));
    } finally {
      btn.disabled = false;
      btn.classList.remove("is-busy");
    }
  });

  function demandeConnexion(message) {
    erreurConnexion(message || "");
    $("#login-nom").value = whoami || "";
    $("#login-code").value = "";
    if (!loginDlg.open) loginDlg.showModal();
    setTimeout(() => (whoami ? $("#login-code") : $("#login-nom")).focus(), 50);
  }

  $("#logout-btn").addEventListener("click", async () => {
    await window.aa.forgetTeamCode();
    try { await sb.auth.signOut(); } catch (_) { /* sans importance */ }
    settingsDlg.close();
    OFFERS = []; OPPS = []; SOURCES = []; CONTACTS = [];
    render();
    demandeConnexion("Déconnecté de ce poste. Saisissez le code d'équipe pour revenir.");
  });

  // ======================================================================
  // Droits : ce qu'un contributeur ne voit pas
  // ======================================================================
  function appliqueProfil() {
    document.body.dataset.profil = profil;
    const admin = estAdmin();
    // Arbitrage : un contributeur donne son avis, il ne tranche pas.
    ["#dlg-go", "#dlg-nogo"].forEach(sel => { const b = $(sel); if (b) b.hidden = !admin; });
    // Réglages partagés : sources et carnet de contacts.
    $("#source-form").hidden = !admin;
    $("#catalogue").hidden = !admin;
    const cf = $("#contact-form"); if (cf) cf.hidden = !admin;
    const ap = $("#acces-profil");
    if (ap) {
      ap.textContent = admin ? "Administrateur — tous les droits" : "Contributeur — lecture, ajout et suivi";
      ap.dataset.role = profil;
    }
  }

  async function initSupabase(url, key) {
    if (!window.supabase || !window.supabase.createClient) await ensureLib("supabase");
    if (!window.supabase || !window.supabase.createClient) {
      setConn("offline", "Bibliothèque Supabase non chargée");
      showState("error", "Impossible de charger la bibliothèque Supabase. Vérifiez la connexion Internet puis relancez l'application.");
      return;
    }
    try {
      sb = window.supabase.createClient(url, key);
    } catch (e) {
      sb = null;
      setConn("offline", "URL ou clé invalide");
      toast("Connexion impossible : " + e.message, "error");
      return;
    }
    setConn("connecting", "Connexion…");

    // Version web (téléphone) : aucun code n'est conservé par le navigateur ;
    // c'est la session du registre, qu'il garde jusqu'à la déconnexion, qui
    // évite de ressaisir le code à chaque ouverture.
    if (window.aa.plateforme === "web") {
      try {
        const { data } = await sb.auth.getSession();
        const s = data && data.session;
        if (s && s.user) {
          const secours = s.user.email && s.user.email === COMPTES.administrateur ? "administrateur" : "contributeur";
          profil = await lisProfil(secours, s.user.id);
          await window.aa.rememberTeamCode(null, profil);
          appliqueProfil();
          renderUser();
          showState("loading", "Chargement du registre…");
          loadOffers();
          subscribeRealtime();
          rejoindrePresence();
          return;
        }
      } catch (_) { /* session illisible : on redemande le code */ }
    }

    // Reconnexion silencieuse si le poste a déjà mémorisé le code.
    const codeMemorise = await window.aa.getTeamCode();
    if (codeMemorise) {
      try {
        const ok = await connecte(codeMemorise, whoami);
        if (ok) {
          appliqueProfil();
          renderUser();
          showState("loading", "Chargement du registre…");
          loadOffers();
          subscribeRealtime();
          rejoindrePresence();
          return;
        }
        // Le code a été changé côté registre depuis la dernière ouverture.
        await window.aa.forgetTeamCode();
        demandeConnexion("Le code d'équipe a changé. Saisissez le nouveau.");
      } catch (err) {
        setConn("offline", "Hors connexion");
        showState("error", "Impossible de joindre le registre : " + (err && err.message ? err.message : err));
      }
      return;
    }
    demandeConnexion();
  }

  let relanceChargement = null;

  /** Attend `ms`, en s'annulant proprement si une autre tentative démarre. */
  function patiente(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function loadOffers() {
    if (!sb) return;
    if (relanceChargement) { clearTimeout(relanceChargement); relanceChargement = null; }
    const COLS = "id,titre,emetteur,origine,filiale,type,secteur,region,montant,date_publication,date_limite,lien_source,description,criteres,contact,statut_traitement,assigne,source_id,created_at,created_by,zone,date_soumission,date_depouillement,date_relance,commentaire_suivi,resultat,decision,decision_par,decision_le,decision_motif,supprime_le,supprime_par,motif_suppression,exigences,maj_par,maj_le,statut_par,statut_le,hash_dedup";

    // Une coupure de quelques secondes ne doit pas vider l'écran : on réessaie
    // trois fois en espaçant, puis on repasse en boucle lente en arrière-plan.
    let error = null, data = null;
    for (let essai = 0; essai < 3; essai++) {
      if (essai) {
        setConn("connecting", "Nouvelle tentative…");
        await patiente(essai * 1500);
      }
      const res = await sb.from("offers").select(COLS).order("date_limite", { ascending: true, nullsFirst: false });
      data = res.data; error = res.error;
      if (!error || !estPanneReseau(error.message)) break;
    }

    if (error) {
      setConn("offline", estPanneReseau(error.message) ? "Hors connexion" : "Erreur : " + error.message);
      if (OFFERS.length) {
        // On garde ce qui est déjà affiché plutôt que de tout effacer.
        toast("Registre injoignable : les données affichées datent de la dernière synchronisation.", "error");
      } else {
        showState("error", "Impossible de charger le registre : " + error.message);
      }
      if (estPanneReseau(error.message)) relanceChargement = setTimeout(loadOffers, 30000);
      return;
    }
    const toutes = data || [];
    // Une offre supprimée n'est pas effacée : elle est mise de côté. Le
    // registre ne montre que les vivantes, la corbeille garde le reste.
    CORBEILLE = toutes.filter(o => o.supprime_le);
    OFFERS = toutes.filter(o => !o.supprime_le);
    if (!window.Fuse) ensureLib("fuse").then(() => { if (window.Fuse) buildFuse(); });
    buildFuse();
    setConn("live", "Synchronisé");
    SYNC.derniere = Date.now(); majSync();
    $("#loading").hidden = true;
    loadFileCounts();
    loadSources();
    loadOpportunites();
    loadContacts();
    loadTaches();
    loadProfilAA();
    render();
    archiveObsoletes();
    if (currentDetailId && $("#detail").open) fillDetail(currentDetailId);
  }

  function buildFuse() {
    fuse = window.Fuse ? new window.Fuse(OFFERS, {
      keys: [{ name: "titre", weight: 0.5 }, { name: "emetteur", weight: 0.2 }, { name: "description", weight: 0.2 }, { name: "secteur", weight: 0.1 }],
      threshold: 0.34, ignoreLocation: true
    }) : null;
  }

  let reloadTimer = null;
  function scheduleReload() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(loadOffers, 300);
  }

  function subscribeRealtime() {
    if (realtimeChannel) sb.removeChannel(realtimeChannel);
    realtimeChannel = sb.channel("registre-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "offers" }, (p) => { annonceChangement(p); scheduleReload(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "offer_journal" }, (p) => {
        if (currentDetailId && p.new && p.new.offer_id === currentDetailId) loadJournal(currentDetailId);
        if (!$("#presence-pop").hidden) loadActivite();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "offer_notes" }, (p) => {
        const offerId = (p.new && p.new.offer_id) || (p.old && p.old.offer_id);
        if (currentDetailId && offerId === currentDetailId) loadNotes(currentDetailId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sources" }, () => loadSources())
      .on("postgres_changes", { event: "*", schema: "public", table: "opportunites" }, () => loadOpportunites())
      .on("postgres_changes", { event: "*", schema: "public", table: "offer_taches" }, () => loadTaches())
      .on("postgres_changes", { event: "*", schema: "public", table: "profil_entreprise" }, () => loadProfilAA())
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, () => loadContacts())
      .on("postgres_changes", { event: "*", schema: "public", table: "offer_votes" }, (p) => {
        const offerId = (p.new && p.new.offer_id) || (p.old && p.old.offer_id);
        if (currentDetailId && offerId === currentDetailId) loadVotes(currentDetailId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "offer_files" }, (p) => {
        const offerId = (p.new && p.new.offer_id) || (p.old && p.old.offer_id);
        loadFileCounts().then(render);
        if (currentDetailId && offerId === currentDetailId) loadFiles(currentDetailId);
      })
      .subscribe(surEtatTempsReel);
  }

  /**
   * Une coupure réseau et une mauvaise configuration ne se soignent pas
   * pareil : autant le dire à l'écran plutôt que d'afficher le message brut.
   */
  function estPanneReseau(message) {
    return /failed to fetch|fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|network|injoignable|load failed/i.test(String(message || ""));
  }

  function showState(kind, message) {
    const box = $("#loading");
    box.hidden = false;
    if (kind !== "error") {
      box.innerHTML = `<div class="spinner"></div><p>${esc(message)}</p>`;
      return;
    }
    const reseau = estPanneReseau(message);
    const titre = reseau ? "Pas de connexion au registre partagé" : "Registre indisponible";
    const corps = reseau
      ? `<p>Le poste n'arrive pas à joindre le serveur du registre. Les données sont intactes : elles reviendront dès que la connexion sera rétablie.</p>
         <p class="state-hint">Si votre navigateur ouvre bien d'autres sites, c'est souvent le DNS : ouvrez une invite de commandes en administrateur et tapez <b>ipconfig /flushdns</b>, ou réglez le DNS de votre connexion sur <b>1.1.1.1</b> et <b>8.8.8.8</b>.</p>
         <p class="state-tech">${esc(message)}</p>`
      : `<p>${esc(message)}</p>`;
    const actions = reseau
      ? `<div class="state-actions"><button class="btn primary" type="button" data-retry>${icon("refresh")}Réessayer</button><button class="btn" type="button" data-open-settings>${icon("settings")}Vérifier les paramètres</button></div>`
      : `<button class="btn" type="button" data-open-settings>${icon("settings")}Vérifier les paramètres</button>`;
    box.innerHTML = `${icon("alert").replace('class="ico"', 'class="ico state-ico"')}<p class="state-title">${esc(titre)}</p>${corps}${actions}`;
    const btn = box.querySelector("[data-open-settings]");
    if (btn) btn.addEventListener("click", () => openSettings(false));
    const retry = box.querySelector("[data-retry]");
    if (retry) retry.addEventListener("click", () => { showState("loading", "Nouvelle tentative…"); loadOffers(); });
  }

  // ======================================================================
  // Filtres & résultats
  // ======================================================================
  function groupValue(group, o) {
    return group.get ? group.get(o) : (o[group.key] || "");
  }

  // ------------------------------------------------------------------
  // Le registre de travail : tout, sauf les offres déposées qui attendent
  // leur résultat. Celles-ci n'ont plus rien à faire dans la veille — ni à
  // qualifier, ni à arbitrer, ni à préparer — et vivent dans l'onglet
  // « En attente de décision » (règle unique : AA.metier.estEnAttente).
  // ------------------------------------------------------------------
  const dansRegistre = (o) => !AA.metier.estEnAttente(o);
  function registre() { return OFFERS.filter(dansRegistre); }

  /** Toutes les offres qui répondent à la recherche, attente comprise. */
  function rechercheBrute() {
    const q = $("#search").value.trim();
    if (!q) return OFFERS.slice();
    if (fuse) return fuse.search(q).map(r => r.item);
    const needle = q.toLowerCase();
    return OFFERS.filter(o => [o.titre, o.emetteur, o.description, o.secteur, o.type].join(" ").toLowerCase().includes(needle));
  }

  function searchBase() {
    return rechercheBrute().filter(dansRegistre);
  }

  function passes(o, exceptKey) {
    if (exceptKey !== "filiale" && filialeTab) {
      const wanted = filialeTab === "__none__" ? "" : filialeTab; // « À qualifier » = filiale vide en base
      if ((o.filiale || "") !== wanted) return false;
    }
    for (const g of FILTER_GROUPS) {
      if (g.key === exceptKey) continue;
      if (active[g.key].size && !active[g.key].has(groupValue(g, o))) return false;
    }
    return true;
  }

  function sortRows(rows) {
    const byTitle = (a, b) => String(a.titre || "").localeCompare(String(b.titre || ""), "fr");
    if (ui.sort === "titre") return rows.sort(byTitle);
    if (ui.sort === "pertinence") return rows.sort((a, b) => pertinenceDe(b).score - pertinenceDe(a).score || byTitle(a, b));
    if (ui.sort === "recent") return rows.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    // Échéance : ouvertes d'abord (plus proche en premier), puis sans échéance, puis clôturées.
    const rank = (o) => { const u = urgency(o.date_limite); return u.key === "cloture" ? 2e6 - u.days : u.key === "none" ? 1e6 : u.days; };
    return rows.sort((a, b) => rank(a) - rank(b) || byTitle(a, b));
  }

  function currentResults() {
    return sortRows(searchBase().filter(o => passes(o)));
  }

  function anyFilterActive() {
    return !!filialeTab || FILTER_GROUPS.some(g => active[g.key].size) || !!$("#search").value.trim();
  }

  function clearFilters() {
    FILTER_GROUPS.forEach(g => active[g.key].clear());
    filialeTab = "";
    $("#search").value = "";
    render();
  }

  // ======================================================================
  // Rendu
  // ======================================================================
  function render() {
    const results = currentResults();
    renderToday();
    renderKpis();
    renderFilialeTabs();
    renderFilterGroups();
    renderActiveChips();
    renderPriority();

    // Seul l'onglet visible est reconstruit. Les autres sont marqués « à
    // rafraîchir » et le seront à leur ouverture : reconstruire six écrans à
    // chaque frappe de recherche faisait saccader la saisie, refermait les
    // menus déroulants sous le doigt et perdait le défilement des listes.
    rendVue(currentTab);
    renderTabCounts();
    renderNoteAttente();
    $("#count").textContent = plural(results.length, "offre", "offres");
    const noData = OFFERS.length === 0;
    $("#empty").hidden = results.length > 0 || noData;
    if (noData && sb) {
      $("#loading").hidden = false;
      $("#loading").innerHTML = `${icon("folder").replace('class="ico"', 'class="ico state-ico"')}<p class="state-title">Le registre est vide</p><p>Ajoutez une première offre ou lancez la veille automatique.</p>`;
    }

    const showCards = ui.view === "cards";
    $("#grid").hidden = !showCards;
    $("#table-wrap").hidden = showCards || results.length === 0;
    $$(".view-toggle button").forEach(b => b.classList.toggle("is-active", b.dataset.view === ui.view));
    $("#sort").value = ui.sort;

    if (showCards) {
      $("#grid").innerHTML = results.map(cardHtml).join("");
    } else {
      $("#table-body").innerHTML = results.map(rowHtml).join("");
    }
  }

  function renderToday() {
    const d = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const n = registre().length;
    $("#today-label").textContent = d.charAt(0).toUpperCase() + d.slice(1) + (n ? " · " + plural(n, "offre", "offres") + " au registre" : "");
  }

  function sameSet(set, values) {
    return set.size === values.length && values.every(v => set.has(v));
  }

  // ======================================================================
  // Tuiles d'indicateurs : dégradé, mini-courbe de tendance, compteur animé
  // ======================================================================

  /** Teintes de la charte : couleur de face et couleur de fond du dégradé. */
  const TEINTES = {
    dark: ["#115C67", "#0A3E46"],
    teal: ["#24988A", "#12604F"],
    sky:  ["#00A7E1", "#0A5E85"],
    blue: ["#2F75B5", "#1B4874"],
    crit: ["#D1434B", "#8C2930"]
  };

  const REDUIRE_ANIM = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DERNIERES_VALEURS = new Map();

  /** Trace une courbe de tendance à partir d'une série de nombres. */
  function sparkline(values) {
    const pts = (values || []).filter(v => Number.isFinite(v));
    if (pts.length < 3) return "";
    const max = Math.max(...pts, 1), min = Math.min(...pts, 0);
    const span = max - min || 1;
    const x = i => (i / (pts.length - 1)) * 120;
    const y = v => 22 - ((v - min) / span) * 19;
    const ligne = pts.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1)).join(" ");
    const aire = ligne + " L120 24 L0 24 Z";
    return `<svg class="kpi-spark" viewBox="0 0 120 24" preserveAspectRatio="none" aria-hidden="true">
      <path class="area" d="${aire}"/><path d="${ligne}"/></svg>`;
  }

  /** Nombre d'éléments par tranche de temps, de la plus ancienne à la plus récente. */
  function serieTemporelle(rows, champ, tranches, joursParTranche) {
    const now = Date.now(), jour = 86400000;
    const out = [];
    for (let i = tranches - 1; i >= 0; i--) {
      const fin = now - i * joursParTranche * jour;
      const debut = fin - joursParTranche * jour;
      out.push(rows.filter(o => {
        const t = Date.parse(o[champ] || "");
        return Number.isFinite(t) && t > debut && t <= fin;
      }).length);
    }
    return out;
  }

  /** Construit le HTML d'une tuile. `t.teinte` est une clé de TEINTES. */
  function kpiTile(t) {
    const [face, deep] = TEINTES[t.teinte] || TEINTES.dark;
    return `<${t.id ? "button type=\"button\"" : "div"} class="kpi${t.id ? "" : " is-static"}${t.active ? " is-active" : ""}"${t.id ? ` data-kpi="${t.id}"` : ""} style="--kpi-color:${face};--kpi-deep:${deep}">
      <div class="kpi-top"><span>${esc(t.label)}</span>${icon(t.ic)}</div>
      <div class="kpi-value" data-kpi-key="${esc(t.key || t.label)}" data-kpi-to="${esc(String(t.value))}">${esc(String(t.value))}</div>
      <div class="kpi-hint">${esc(t.hint)}</div>
      ${t.spark ? sparkline(t.spark) : ""}
    </${t.id ? "button" : "div"}>`;
  }

  /** Fait défiler les chiffres qui ont changé depuis le dernier rendu. */
  function animerCompteurs(root) {
    $$(".kpi-value[data-kpi-key]", root).forEach(el => {
      const key = el.dataset.kpiKey;
      const cible = Number(String(el.dataset.kpiTo).replace(",", "."));
      const depart = DERNIERES_VALEURS.has(key) ? DERNIERES_VALEURS.get(key) : 0;
      if (Number.isFinite(cible)) DERNIERES_VALEURS.set(key, cible);
      if (REDUIRE_ANIM || !Number.isFinite(cible) || cible === depart) return;
      const suffixe = String(el.dataset.kpiTo).replace(/[\d.,\s-]/g, "");
      const decimales = (String(el.dataset.kpiTo).split(/[.,]/)[1] || "").length;
      const t0 = performance.now(), duree = 550;
      (function pas(now) {
        const k = Math.min(1, (now - t0) / duree);
        const v = depart + (cible - depart) * (1 - Math.pow(1 - k, 3));
        el.textContent = (decimales ? v.toFixed(decimales).replace(".", ",") : Math.round(v)) + suffixe;
        if (k < 1) requestAnimationFrame(pas);
        else el.textContent = el.dataset.kpiTo;
      })(t0);
    });
  }

  function renderKpis() {
    const OFFERS = registre();   // les tuiles de la veille ne comptent que le registre de travail
    const urgent = OFFERS.filter(o => echeanceBucket(o) === "Sous 7 jours" && !["Gagnée", "Perdue"].includes(o.statut_traitement)).length;
    const nouvelles = OFFERS.filter(o => (o.statut_traitement || "Nouvelle") === "Nouvelle").length;
    const TRAITEMENT = ["À qualifier", "En cours", "Soumise"];
    const enCours = OFFERS.filter(o => TRAITEMENT.includes(o.statut_traitement)).length;
    const gagnees = OFFERS.filter(o => o.statut_traitement === "Gagnée").length;

    const tiles = [
      { id: "all", key: "v-all", label: "Offres au registre", value: OFFERS.length, hint: "Toutes filiales confondues", ic: "folder", teinte: "dark", active: !anyFilterActive(), spark: serieTemporelle(OFFERS, "created_at", 8, 7) },
      { id: "urgent", key: "v-urgent", label: "Échéances sous 7 jours", value: urgent, hint: urgent ? "À traiter en priorité" : "Rien d'urgent", ic: "bell", teinte: "crit", active: sameSet(active.echeance, ["Sous 7 jours"]) && !active.statut_traitement.size },
      { id: "new", key: "v-new", label: "Nouvelles à qualifier", value: nouvelles, hint: "Pas encore examinées", ic: "radar", teinte: "sky", active: sameSet(active.statut_traitement, ["Nouvelle"]) },
      { id: "wip", key: "v-wip", label: "En traitement", value: enCours, hint: gagnees ? plural(gagnees, "offre gagnée", "offres gagnées") : "Qualifiées, en cours ou soumises", ic: "check", teinte: "teal", active: sameSet(active.statut_traitement, TRAITEMENT) }
    ];
    $("#kpis").innerHTML = tiles.map(kpiTile).join("");
    animerCompteurs($("#kpis"));
  }

  $("#kpis").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-kpi]");
    if (!btn) return;
    const id = btn.dataset.kpi;
    const wasActive = btn.classList.contains("is-active");
    FILTER_GROUPS.forEach(g => active[g.key].clear());
    if (!wasActive) {
      if (id === "urgent") active.echeance.add("Sous 7 jours");
      if (id === "new") active.statut_traitement.add("Nouvelle");
      if (id === "wip") ["À qualifier", "En cours", "Soumise"].forEach(v => active.statut_traitement.add(v));
    }
    if (id === "all") { filialeTab = ""; $("#search").value = ""; }
    render();
  });

  function renderFilialeTabs() {
    const counts = {};
    const base = searchBase().filter(o => passes(o, "filiale"));
    base.forEach(o => { counts[o.filiale || ""] = (counts[o.filiale || ""] || 0) + 1; });
    const tabs = [{ value: "", short: "Toutes les filiales", cls: "", n: base.length }]
      .concat(FILIALES.map(f => Object.assign({}, f, { n: counts[f.value] || 0 })));
    if (counts[""]) tabs.push({ value: "__none__", short: "À qualifier", cls: "f-none", n: counts[""] });
    $("#filiale-tabs").innerHTML = tabs.map(t => {
      const isActive = (t.value === "__none__" ? filialeTab === "__none__" : filialeTab === t.value);
      return `<button type="button" class="ftab ${t.cls}${isActive ? " is-active" : ""}" data-filiale="${esc(t.value)}">
        ${t.cls ? '<span class="fdot"></span>' : ""}${esc(t.short)}<span class="n">${t.n}</span></button>`;
    }).join("");
  }

  $("#filiale-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filiale]");
    if (!btn) return;
    const v = btn.dataset.filiale;
    filialeTab = filialeTab === v ? "" : v;
    render();
  });

  const openGroups = new Set(FILTER_GROUPS.filter(g => g.open).map(g => g.key));

  function renderFilterGroups() {
    const base = searchBase();
    $("#filter-groups").innerHTML = FILTER_GROUPS.map(g => {
      const counts = {};
      base.filter(o => passes(o, g.key)).forEach(o => { const v = groupValue(g, o); if (v) counts[v] = (counts[v] || 0) + 1; });
      let options = g.options ? g.options() : [...new Set(OFFERS.map(o => groupValue(g, o)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
      if (g.key === "source_id") options = [...new Set(OFFERS.map(o => groupValue(g, o)))].sort((a, b) => a.localeCompare(b, "fr"));
      if (!options.length) return "";
      const sel = active[g.key].size;
      return `<details class="fgroup" data-group="${g.key}"${openGroups.has(g.key) || sel ? " open" : ""}>
        <summary><span>${esc(g.label)}${sel ? `<span class="sel">${sel}</span>` : ""}</span>${icon("chevron")}</summary>
        <div class="fopts">${options.map(v => `
          <label class="fopt"><input type="checkbox" data-key="${g.key}" value="${esc(v)}"${active[g.key].has(v) ? " checked" : ""}>
            <span class="lbl">${esc(v)}</span><span class="n">${counts[v] || 0}</span></label>`).join("")}
        </div></details>`;
    }).join("");
  }

  $("#filter-groups").addEventListener("change", (e) => {
    const cb = e.target.closest("input[type=checkbox]");
    if (!cb) return;
    if (cb.checked) active[cb.dataset.key].add(cb.value); else active[cb.dataset.key].delete(cb.value);
    render();
  });
  $("#filter-groups").addEventListener("toggle", (e) => {
    const d = e.target.closest("details[data-group]");
    if (!d) return;
    if (d.open) openGroups.add(d.dataset.group); else openGroups.delete(d.dataset.group);
  }, true);

  function renderActiveChips() {
    const chips = [];
    const q = $("#search").value.trim();
    if (q) chips.push({ kind: "search", label: "« " + q + " »" });
    if (filialeTab) chips.push({ kind: "filiale", label: filialeTab === "__none__" ? "Filiale à qualifier" : filialeMeta(filialeTab).short });
    FILTER_GROUPS.forEach(g => active[g.key].forEach(v => chips.push({ kind: g.key, value: v, label: v })));
    $("#active-chips").innerHTML = chips.map(c => `<button type="button" class="achip" data-kind="${esc(c.kind)}" data-value="${esc(c.value || "")}" title="Retirer ce filtre">${esc(c.label)}${icon("x")}</button>`).join("")
      + (chips.length > 1 ? `<button type="button" class="link-btn" data-kind="__all">Tout effacer</button>` : "");
  }

  $("#active-chips").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-kind]");
    if (!btn) return;
    const { kind, value } = btn.dataset;
    if (kind === "__all") return clearFilters();
    if (kind === "search") $("#search").value = "";
    else if (kind === "filiale") filialeTab = "";
    else active[kind].delete(value);
    render();
  });

  function renderPriority() {
    const urgent = registre()
      .filter(o => echeanceBucket(o) === "Sous 7 jours" && !["Gagnée", "Perdue"].includes(o.statut_traitement))
      .sort((a, b) => urgency(a.date_limite).days - urgency(b.date_limite).days);
    const box = $("#priority");
    const redundant = sameSet(active.echeance, ["Sous 7 jours"]);
    box.hidden = urgent.length === 0 || redundant;
    if (box.hidden) return;
    $("#priority-sub").textContent = plural(urgent.length, "offre arrive", "offres arrivent") + " à échéance dans les 7 jours";
    const shown = urgent.slice(0, 4);
    $("#priority-rows").innerHTML = shown.map(o => `
      <button type="button" class="prow" data-open="${esc(o.id)}">
        ${duePill(o, false)}
        <span class="t">${esc(o.titre)}</span>
        <span class="e">${esc(o.emetteur || "")}${o.assigne ? " · " + esc(o.assigne) : ""}</span>
      </button>`).join("")
      + (urgent.length > shown.length ? `<button type="button" class="link-btn" data-show-urgent style="margin:4px 10px 0">Voir les ${urgent.length} échéances →</button>` : "");
  }

  $("#priority").addEventListener("click", (e) => {
    if (e.target.closest("[data-show-urgent]")) { active.echeance.clear(); active.echeance.add("Sous 7 jours"); render(); }
  });

  function cardHtml(o) {
    const fm = filialeMeta(o.filiale);
    const statut = o.statut_traitement || "Nouvelle";
    return `
      <button type="button" class="card ${fm.cls}${estRecente(o.id) ? " is-recent" : ""}" data-open="${esc(o.id)}">
        <div class="card-top">
          <span class="fbadge">${esc(fm.short)}</span>
          <span class="tag">${esc(o.type || "—")}</span>
          ${pucePertinence(o)}
          ${puceDecision(o)}
        </div>
        <h3>${esc(o.titre || "(sans titre)")}</h3>
        <div class="emitter">${esc(o.emetteur || "Émetteur non renseigné")}${o.origine ? " · " + esc(o.origine) : ""}</div>
        <div class="card-prov">${provenanceChip(o)}</div>
        <div class="card-meta">
          <span>${icon("pin")}${esc(o.region || "—")}</span>
          ${o.secteur ? `<span>${icon("tag")}${esc(o.secteur)}</span>` : ""}
          ${o.montant ? `<span>${icon("wallet")}${esc(o.montant)}</span>` : ""}
        </div>
        <div class="card-foot">
          <div class="card-foot-left">
            <span class="wstatus ${statutCls(statut)}">${esc(statut)}${initialesStatut(o)}</span>
            ${FILE_COUNTS[o.id] ? `<span class="clip" title="${FILE_COUNTS[o.id]} document(s) joint(s)">${icon("paperclip")}${FILE_COUNTS[o.id]}</span>` : ""}
            ${o.assigne ? `<span class="avatar sm" title="Assignée à ${esc(o.assigne)}">${esc(initials(o.assigne))}</span>` : ""}
          </div>
          ${duePill(o, true)}
        </div>
      </button>`;
  }

  function rowHtml(o) {
    const fm = filialeMeta(o.filiale);
    const statut = o.statut_traitement || "Nouvelle";
    return `
      <tr data-open="${esc(o.id)}"${estRecente(o.id) ? ' class="is-recent"' : ""}>
        <td>${duePill(o, true)}</td>
        <td class="t-main"><div class="t-title" title="${esc(o.titre || "")}">${esc(o.titre || "(sans titre)")}${FILE_COUNTS[o.id] ? ` <span class="clip">${icon("paperclip")}${FILE_COUNTS[o.id]}</span>` : ""}</div><div class="t-sub">${esc([o.emetteur, o.type, o.region].filter(Boolean).join(" · "))}</div>
          <div class="t-sub">${provenanceChip(o)}</div></td>
        <td class="${fm.cls}"><div class="t-fil"><span class="fbadge">${esc(fm.short)}</span>${pucePertinence(o)}</div></td>
        <td class="muted t-amount">${esc(o.montant || "—")}</td>
        <td><div class="t-status"><span class="wstatus ${statutCls(statut)}">${esc(statut)}${initialesStatut(o)}</span>${puceDecision(o)}${o.assigne ? `<span class="avatar sm" title="Assignée à ${esc(o.assigne)}">${esc(initials(o.assigne))}</span>` : ""}</div></td>
      </tr>`;
  }

  // Ouverture d'une fiche depuis n'importe quelle liste
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-open]");
    if (!el || el.closest("dialog")) return;
    // Un bouton, une case ou un lien posé DANS une ligne a sa propre action :
    // il ne doit pas, en plus, ouvrir la fiche par-dessus (c'est ce qui rendait
    // inopérant le bouton « Définitif » de la corbeille).
    const ctl = e.target.closest("button, a, input, select, textarea, label");
    if (ctl && ctl !== el && el.contains(ctl)) return;
    openDetail(el.dataset.open);
  });

  // Recherche, tri, affichage
  let searchTimer = null;
  $("#search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 140);
  });
  $("#sort").addEventListener("change", (e) => { ui.sort = e.target.value; setPref("sort", ui.sort); render(); });
  $$(".view-toggle button").forEach(b => b.addEventListener("click", () => { ui.view = b.dataset.view; setPref("view", ui.view); render(); }));
  $("#reset").addEventListener("click", clearFilters);
  $("#empty-reset").addEventListener("click", clearFilters);
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("#search").focus(); $("#search").select(); }
  });

  // ======================================================================
  // Fiche d'une offre
  // ======================================================================
  const detailDlg = $("#detail");

  function openDetail(id) {
    // Une offre en corbeille doit pouvoir être relue avant qu'on décide de la
    // restaurer : la fiche sait déjà l'afficher, seule cette garde l'interdisait.
    if (!OFFERS.concat(CORBEILLE).find(x => x.id === id)) return;
    currentDetailId = id;
    fillDetail(id);
    $("#dlg-note-text").value = "";
    $("#dlg-notes").innerHTML = '<p class="muted-line">Chargement des notes…</p>';
    $("#dlg-notes-count").textContent = "";
    FILES = [];
    $("#dlg-docs").innerHTML = '<p class="muted-line">Chargement des documents…</p>';
    $("#dlg-docs-count").textContent = "";
    VOTES = [];
    $("#dlg-votes").innerHTML = '<p class="muted-line">Chargement des avis…</p>';
    loadNotes(id);
    loadFiles(id);
    loadVotes(id);
    $("#dlg-journal").innerHTML = '<p class="muted-line">Chargement…</p>';
    $("#dlg-journal-count").textContent = "";
    loadJournal(id);
    if (!detailDlg.open) detailDlg.showModal();
    annoncePresence();
    $(".drawer-body", detailDlg).scrollTop = 0;
  }

  function fillDetail(id) {
    // La fiche d'une offre en corbeille se lit aussi : elle était vide parce
    // qu'on ne la cherchait que parmi les offres vivantes.
    const o = OFFERS.find(x => x.id === id) || CORBEILLE.find(x => x.id === id);
    if (!o) return;
    renderBandeauCorbeille(o);
    const fm = filialeMeta(o.filiale);
    const isAuto = o.source_id && !["manuel", "seed"].includes(o.source_id);
    $("#dlg-badges").innerHTML = `<span class="${fm.cls}"><span class="fbadge">${esc(fm.short)}</span></span>`
      + `<span class="tag">${esc(o.type || "Type non précisé")}</span>`
      + (o.origine ? `<span class="tag">${esc(o.origine)}</span>` : "")
      + (isAuto ? `<span class="tag auto">${esc(sourceLabel(o.source_id))}</span>` : "");
    $("#dlg-title").textContent = o.titre || "(sans titre)";
    $("#dlg-emitter").textContent = o.emetteur || "Émetteur non renseigné";
    $("#dlg-deadline").innerHTML = `${duePill(o, false)}<span>Date limite : <b>${esc(fmtDate(o.date_limite, { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}</b></span>`;

    const statut = o.statut_traitement || "Nouvelle";
    $("#dlg-pipeline").innerHTML = STATUTS.map(s => `<button type="button" data-statut="${esc(s.value)}" class="${s.value === statut ? "is-active" : ""}${s.value === "Gagnée" ? " won" : s.value === "Perdue" ? " lost" : ""}">${esc(s.value)}</button>`).join("");

    if (document.activeElement !== $("#dlg-assigne")) $("#dlg-assigne").value = o.assigne || "";
    $("#dlg-desc").textContent = o.description || "Aucune description renseignée.";
    $("#dlg-filiale").textContent = o.filiale || "À qualifier";
    $("#dlg-type").textContent = o.type || "—";
    $("#dlg-secteur").textContent = o.secteur || "—";
    $("#dlg-region").textContent = o.region || "—";
    $("#dlg-montant").textContent = o.montant || "—";
    $("#dlg-pub").textContent = fmtDate(o.date_publication);
    $("#dlg-criteres").textContent = o.criteres || "—";
    $("#dlg-contact").textContent = o.contact || "—";
    const pv = provenance(o);
    $("#dlg-prov").innerHTML = `
      <div class="block-label">D'où vient cette offre</div>
      <div class="prov-ligne">${provenanceChip(o)}
        ${o.lien_source ? `<button class="btn small prov-lien-btn" type="button" data-prov-ouvrir="${esc(o.lien_source)}">${icon("external")}Ouvrir la page d'origine</button>` : ""}</div>
      <p class="prov-detail">Entrée au registre le <b>${esc(fmtDate(o.created_at))}</b>${pv.par ? " par <b>" + esc(pv.par) + "</b>" : ""}${pv.site ? ", depuis <b>" + esc(pv.site) + "</b>" : ""}.
        ${pv.importee ? "Importée depuis la fenêtre " + esc(IMPORTS[o.source_id]) + " du logiciel, après le même contrôle que la veille."
          : pv.auto ? "Collectée automatiquement par la veille : vérifiez la page d'origine avant de vous engager." : "Saisie par l'équipe, pas par la veille automatique."}</p>
      <p class="prov-detail">Cycle de vie : <b>${esc(cycleVie(o).label)}</b> — ${esc(cycleVie(o).aide)}.</p>`;
    renderPertinenceFiche(o);
    const link = $("#dlg-link");
    link.disabled = !o.lien_source;
    link.dataset.url = o.lien_source || "";
    $("#dlg-fetch-docs").hidden = !o.lien_source;

    // Arbitrage et suivi de la soumission
    const dec = o.decision || "Non arbitrée";
    const badge = $("#dlg-decision");
    badge.innerHTML = (dec === "GO" || dec === "NO GO") && o.decision_par
      ? `${esc(dec)} <span class="avatar sm">${esc(initials(o.decision_par))}</span> ${esc(o.decision_par)}${o.decision_le ? " · " + esc(fmtTime(o.decision_le)) : ""}`
      : esc(dec);
    badge.className = "decision-badge " + (dec === "GO" ? "is-go" : dec === "NO GO" ? "is-nogo" : dec === "En arbitrage" ? "is-pending" : "");
    const setVal = (sel, v) => { const el = $(sel); if (document.activeElement !== el) el.value = v || ""; };
    setVal("#dlg-date-soumission", o.date_soumission);
    setVal("#dlg-date-depouillement", o.date_depouillement);
    setVal("#dlg-date-relance", o.date_relance);
    setVal("#dlg-resultat", o.resultat);
    setVal("#dlg-commentaire-suivi", o.commentaire_suivi);
    renderEligibilite(o);
    renderCollabFiche(o);
  }

  async function loadNotes(offerId) {
    if (!sb) return;
    const { data, error } = await sb.from("offer_notes").select("*").eq("offer_id", offerId).order("created_at", { ascending: false });
    if (currentDetailId !== offerId) return;
    if (error) { $("#dlg-notes").innerHTML = `<p class="muted-line">Impossible de charger les notes (${esc(error.message)}).</p>`; return; }
    const notes = data || [];
    $("#dlg-notes-count").textContent = notes.length ? notes.length : "";
    $("#dlg-notes").innerHTML = notes.length ? notes.map(n => `
      <div class="note">
        <span class="avatar sm">${esc(initials(n.author))}</span>
        <div class="note-bubble">
          <div class="note-meta"><b>${esc(n.author || "Anonyme")}</b> · ${n.created_at ? esc(new Date(n.created_at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })) : ""}</div>
          <div class="note-text">${esc(n.text)}</div>
        </div>
      </div>`).join("") : '<p class="muted-line">Aucune note pour le moment. Partagez la première information utile.</p>';
  }

  async function saveField(id, patch) {
    if (!sb) { toast("Non connecté au registre.", "error"); return false; }
    patch = signe(patch);
    const o = OFFERS.find(x => x.id === id);
    const previous = o ? Object.fromEntries(Object.keys(patch).map(k => [k, o[k]])) : null;
    const avantAttente = o ? AA.metier.estEnAttente(o) : false;
    if (o) { Object.assign(o, patch); render(); fillDetail(id); } // mise à jour immédiate à l'écran
    if (o) annonceChangementDeMonde(o, avantAttente);
    const { error } = await sb.from("offers").update(patch).eq("id", id);
    if (error) {
      if (o && previous) { Object.assign(o, previous); render(); fillDetail(id); }
      toast("Échec de l'enregistrement : " + error.message, "error");
      return false;
    }
    return true;
  }

  // ======================================================================
  // Éligibilité — les exigences du DAO jugées contre le profil d'A&A
  // ======================================================================
  // Le moteur est dans eligibilite.js ; ici, on ne fait que le relier à
  // l'écran et à la base. Les portes éliminatoires sont jugées une à une, et
  // le score technique n'apparaît qu'une fois ces portes franchissables.
  //
  // PROFIL_AA et non « profil » : ce nom désigne déjà, plus haut, le rôle de la
  // personne connectée (contributeur ou administrateur).
  let PROFIL_AA = {};
  let PROFIL_AA_MAJ = null;

  async function loadProfilAA() {
    if (!sb) return;
    const { data, error } = await sb.from("profil_entreprise").select("donnees,updated_at,maj_par").eq("id", 1);
    // Base antérieure à la 1.10 : pas de table. La fiche dira « profil non
    // renseigné », ce qui est exact, plutôt que de lever une erreur.
    if (error) return;
    const ligne = (data || [])[0];
    PROFIL_AA = (ligne && ligne.donnees) || {};
    PROFIL_AA_MAJ = ligne ? { le: ligne.updated_at, par: ligne.maj_par } : null;
    if (currentDetailId && $("#detail").open) renderEligibilite(OFFERS.find(x => x.id === currentDetailId));
  }

  const profilAARenseigne = () =>
    ["chiffre_affaires_fcfa", "annee_creation", "references_nombre", "certifications"].some(k => PROFIL_AA[k] != null);

  const CLASSE_VERDICT = { POSTULER: "is-go", POSTULER_EN_GROUPEMENT: "is-pending", NE_PAS_POSTULER: "is-nogo", A_COMPLETER: "" };
  const LIBELLE_STATUT_EXIGENCE = { CONFORME: "Conforme", NON_CONFORME: "Non conforme", A_VERIFIER: "À vérifier" };

  function renderEligibilite(o) {
    const zone = $("#dlg-elig-corps"), badge = $("#dlg-elig-verdict");
    if (!zone || !badge || !o || !AA.eligibilite) return;
    if (IA_DAO.offreId && IA_DAO.offreId !== o.id) { IA_DAO.offreId = null; fermeIaDao(); }
    const exigences = Array.isArray(o.exigences) ? o.exigences : [];
    const r = AA.eligibilite.evalue(o, exigences, PROFIL_AA);

    badge.textContent = r.libelle + (r.role_aa ? " · " + r.role_aa : "");
    badge.className = "decision-badge " + (CLASSE_VERDICT[r.verdict] || "");

    const alerte = profilAARenseigne() ? "" :
      `<p class="elig-alerte">Le profil d'A&amp;A n'est pas encore renseigné : sans chiffre d'affaires, certifications ni ancienneté, l'analyse ne peut rien conclure.
        <button type="button" class="link-btn" data-elig-profil>${estAdmin() ? "Renseigner le profil" : "Voir le profil"}</button></p>`;

    const lignes = r.criteres.map(c => {
      const partenaire = c.groupable === false ? " · exigée du soumissionnaire lui-même"
                       : c.groupable === true ? " · un partenaire peut l'apporter" : "";
      return `
      <div class="elig-ligne s-${esc(String(c.statut).toLowerCase())}">
        <span class="elig-statut">${esc(LIBELLE_STATUT_EXIGENCE[c.statut] || c.statut)}</span>
        <div class="elig-corps-ligne">
          <b>${esc(c.intitule || c.exigence || "Exigence")}</b>
          <span class="elig-tag${c.bloquant ? "" : " doux"}">${c.bloquant ? "éliminatoire" : "indicatif"}</span>
          ${c.source === "ia" ? `<span class="elig-tag doux" title="${esc(c.document ? "Relevé dans « " + c.document + " »" : "Relevé par l'IA")}${c.reference ? " — " + esc(c.reference) : ""}">lu par l'IA</span>` : ""}
          <div class="elig-motif">${esc(c.motif)}${esc(partenaire)}</div>
        </div>
        <div class="elig-actions">
          <select data-elig-manuel="${esc(c.id || "")}" title="Trancher à la main : votre jugement prime sur le calcul">
            <option value="">Auto</option>
            <option value="CONFORME"${c.statut_manuel === "CONFORME" ? " selected" : ""}>Conforme</option>
            <option value="NON_CONFORME"${c.statut_manuel === "NON_CONFORME" ? " selected" : ""}>Non conforme</option>
          </select>
          <button type="button" class="icon-btn" data-elig-retirer="${esc(c.id || "")}" title="Retirer cette exigence">${icon("x")}</button>
        </div>
      </div>`;
    }).join("");

    const liste = (titre, items, cls) => items.length
      ? `<div class="elig-liste ${cls}"><div class="elig-sous">${titre}</div><ul>${items.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";

    const score = r.score ? `
      <div class="elig-score">
        <div class="elig-sous">Score technique <b>${r.score.total == null ? "—" : r.score.total + " %"}</b>
          <span class="elig-note">calculé seulement une fois les portes franchissables</span></div>
        ${r.score.composantes.map(c => `
          <div class="elig-comp">
            <span>${esc(c.nom)}</span>
            <span class="elig-barre"><i style="width:${c.max ? Math.round(100 * c.points / c.max) : 0}%"></i></span>
            <b>${c.points}/${c.max}</b>
            <small>${esc(c.detail)}</small>
          </div>`).join("")}
      </div>` : "";

    zone.innerHTML = alerte
      + (exigences.length ? `<div class="elig-criteres">${lignes}</div>`
         : `<p class="muted-line">Aucune exigence relevée. Ouvrez le DAO et recopiez ci-dessous chaque critère éliminatoire : chiffre d'affaires, certifications, ancienneté, références.</p>`)
      + liste("Pourquoi", r.raisons, "raisons")
      + liste("Conditions pour y aller", r.conditions, "conditions")
      + score;
  }

  /** Remplace les exigences de l'offre ouverte par `transforme(anciennes)`. */
  async function majExigences(transforme, message) {
    if (!currentDetailId) return false;
    const o = OFFERS.find(x => x.id === currentDetailId);
    if (!o) return false;
    const nouvelles = transforme(Array.isArray(o.exigences) ? o.exigences.slice() : []);
    const ok = await saveField(currentDetailId, { exigences: nouvelles });
    if (ok && message) toast(message, "success", 2200);
    return ok;
  }

  const eligForm = $("#elig-form");
  const eligChamp = (n) => eligForm.elements.namedItem(n);

  // À la frappe, le moteur devine la nature et le seuil. Dès que l'équipe
  // corrige l'un des champs devinés, on cesse de les écraser.
  eligChamp("texte").addEventListener("input", () => {
    if (eligForm.dataset.corrige === "1") return;
    const g = AA.eligibilite.devineCritere(eligChamp("texte").value);
    eligChamp("type").value = g.type;
    eligChamp("valeur").value = g.valeur == null ? "" : String(g.valeur);
    eligChamp("code").value = g.code || "";
  });
  ["type", "valeur", "code"].forEach(n => eligChamp(n).addEventListener("input", () => { eligForm.dataset.corrige = "1"; }));

  eligForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const texte = eligChamp("texte").value.trim();
    if (!texte) return;
    const brut = eligChamp("valeur").value.replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
    const g = eligChamp("groupable").value;
    const exigence = {
      id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2),
      type: eligChamp("type").value || "autre",
      intitule: texte.length > 110 ? texte.slice(0, 107) + "…" : texte,
      exigence: texte,
      valeur: brut === "" || !isFinite(Number(brut)) ? null : Number(brut),
      code: eligChamp("code").value.trim() || null,
      bloquant: eligChamp("bloquant").checked,
      groupable: g === "oui" ? true : g === "non" ? false : null,
      statut_manuel: null,
      ajoute_par: whoami || null,
      ajoute_le: new Date().toISOString()
    };
    if (await majExigences(l => l.concat([exigence]), "Exigence ajoutée — verdict recalculé.")) {
      eligForm.reset();
      delete eligForm.dataset.corrige;
      eligChamp("bloquant").checked = true;
      eligChamp("texte").focus();
    }
  });

  $("#dlg-elig-corps").addEventListener("change", (e) => {
    const s = e.target.closest("[data-elig-manuel]");
    if (!s) return;
    const id = s.dataset.eligManuel;
    majExigences(l => l.map(c => c.id === id ? Object.assign({}, c, { statut_manuel: s.value || null }) : c),
                 s.value ? "Exigence tranchée à la main." : "Exigence rendue au calcul.");
  });

  $("#dlg-elig-corps").addEventListener("click", (e) => {
    if (e.target.closest("[data-elig-profil]")) { ouvreProfilAA(); return; }
    const b = e.target.closest("[data-elig-retirer]");
    if (!b) return;
    const id = b.dataset.eligRetirer;
    majExigences(l => l.filter(c => c.id !== id), "Exigence retirée.");
  });

  // ------------------------------------------------- lecture du DAO par l'IA
  // L'IA propose, l'équipe dispose : les exigences relevées dans le DAO sont
  // montrées avec leur citation, cochées seulement si la citation se retrouve
  // dans le document, et rien n'entre dans la fiche avant le clic « Ajouter ».
  const IA_DAO = { offreId: null, etat: "ferme", document: null, propositions: [], remarques: "", message: "", jeton: 0 };
  const EXT_DAO = /\.(pdf|docx|txt|odt|rtf|html?|md)$/i;
  const UNITE_IA = { chiffre_affaires: "FCFA", experience: "ans", references: "référence(s)" };
  const iaPanneau = $("#elig-ia-panneau");

  function fermeIaDao() {
    IA_DAO.etat = "ferme"; IA_DAO.propositions = []; IA_DAO.jeton++;
    iaPanneau.hidden = true; iaPanneau.innerHTML = "";
    $("#elig-ia-lancer").disabled = false;
  }

  function renderIaDao() {
    const p = iaPanneau;
    if (IA_DAO.etat === "ferme") { p.hidden = true; p.innerHTML = ""; return; }
    p.hidden = false;
    $("#elig-ia-lancer").disabled = IA_DAO.etat === "encours";

    if (IA_DAO.etat === "choix") {
      // Les pièces sans extension (fréquentes chez certaines sources) sont
      // proposées aussi : le poste reconnaît un PDF à ses premiers octets.
      const docs = FILES.filter(f => EXT_DAO.test(f.nom) || /pdf|word/i.test(f.type_mime || "") || !/\.[A-Za-z0-9]{1,8}$/.test(f.nom))
        .sort((a, b) => (EST_TDR.test(b.nom) ? 1 : 0) - (EST_TDR.test(a.nom) ? 1 : 0));
      p.innerHTML = `
        <div class="elig-sous">Quel document faire lire ?</div>
        ${docs.length ? `<div class="elig-ia-docs">${docs.map(f => `
          <button type="button" class="elig-ia-doc" data-ia-doc="${esc(f.id)}">
            <span class="doc-ext">${esc((String(f.nom).match(/\.([A-Za-z0-9]{1,8})$/) || [, /pdf/i.test(f.type_mime || "") ? "PDF" : "?"])[1].toUpperCase())}</span>
            <span class="elig-ia-doc-nom">${esc(f.nom)}</span>${EST_TDR.test(f.nom) ? '<span class="doc-tdr">DAO</span>' : ""}
          </button>`).join("")}</div>`
        : `<p class="muted-line">Aucun PDF ni Word dans les documents de cette offre. Récupérez-les depuis la source (section Documents), ou choisissez le fichier sur ce poste.</p>`}
        <div class="elig-ia-pied">
          <button type="button" class="btn small" data-ia-poste>${icon("upload")}Un fichier de ce poste…</button>
          <button type="button" class="link-btn" data-ia-fermer>Annuler</button>
        </div>
        <p class="help">Le texte du document part chez OpenAI avec la clé de ce poste. Rien n'est ajouté à la fiche sans votre accord.</p>`;
      return;
    }

    if (IA_DAO.etat === "encours") {
      p.innerHTML = `<p class="elig-ia-attente"><span class="spinner"></span>Lecture de « ${esc(IA_DAO.document || "document")} » puis analyse par l'IA — compter 20 secondes à une minute…</p>
        <div class="elig-ia-pied"><button type="button" class="link-btn" data-ia-fermer>Abandonner</button></div>`;
      return;
    }

    if (IA_DAO.etat === "erreur") {
      p.innerHTML = `<p class="elig-alerte">${esc(IA_DAO.message)}</p>
        <div class="elig-ia-pied"><button type="button" class="btn small" data-ia-reprendre>Choisir un autre document</button>
        <button type="button" class="link-btn" data-ia-fermer>Fermer</button></div>`;
      return;
    }

    // Résultat
    const props = IA_DAO.propositions;
    const n = props.filter(x => x.coche).length;
    const d = IA_DAO.meta || {};
    const portee = d.numerise ? "document numérisé, lu page par page" : d.integral ? "lu en entier" : `extraits retenus : ${d.part || "?"} % du texte`;
    p.innerHTML = `
      <div class="elig-sous">Proposé par l'IA <span class="elig-note">« ${esc(IA_DAO.document)} » — ${esc(portee)}</span></div>
      ${props.length ? `
        <p class="elig-ia-avert">Vérifiez chaque ligne contre le DAO : l'IA peut se tromper. Seules les lignes cochées seront ajoutées.</p>
        <div class="elig-ia-liste">${props.map(x => {
          const unite = UNITE_IA[x.type];
          return `
          <div class="elig-ia-ligne${x.coche ? " is-coche" : ""}${x.citation_retrouvee ? "" : " is-douteux"}">
            <input type="checkbox" data-ia-coche="${x.rang}"${x.coche ? " checked" : ""} aria-label="Retenir cette exigence">
            <div class="elig-corps-ligne">
              <b>${esc(x.intitule)}</b>
              <span class="elig-tag${x.bloquant ? "" : " doux"}">${x.bloquant ? "éliminatoire" : "indicatif"}</span>
              <span class="elig-tag doux">${esc((AA.eligibilite.TYPES[x.type] || AA.eligibilite.TYPES.autre).libelle)}</span>
              ${x.exigence && x.exigence !== x.intitule ? `<q class="elig-ia-citation">${esc(x.exigence)}</q>` : ""}
              ${x.reference ? `<div class="elig-motif">Où : ${esc(x.reference)}</div>` : ""}
              ${x.notes.length ? `<div class="elig-ia-notes">${x.notes.map(esc).join(" ")}</div>` : ""}
            </div>
            <div class="elig-ia-reglages">
              ${unite ? `<label>Seuil <input data-ia-valeur="${x.rang}" inputmode="decimal" value="${x.valeur == null ? "" : esc(String(x.valeur))}" placeholder="?"> <small>${esc(unite)}</small></label>` : ""}
              <select data-ia-groupable="${x.rang}" title="Un partenaire du groupement peut-il apporter cette exigence ?">
                <option value=""${x.groupable == null ? " selected" : ""}>Partenaire : non précisé</option>
                <option value="oui"${x.groupable === true ? " selected" : ""}>Partenaire : admis</option>
                <option value="non"${x.groupable === false ? " selected" : ""}>Partenaire : exclu</option>
              </select>
            </div>
          </div>`;
        }).join("")}</div>`
      : `<p class="muted-line">L'IA n'a relevé aucun critère éliminatoire dans ce document. Si le DAO en contient, ils sont peut-être dans une autre pièce (données particulières, section III).</p>`}
      ${IA_DAO.remarques ? `<p class="elig-motif">Remarque de l'IA : ${esc(IA_DAO.remarques)}</p>` : ""}
      <div class="elig-ia-pied">
        ${props.length ? `<button type="button" class="btn small primary" data-ia-ajouter${n ? "" : " disabled"}>${n ? "Ajouter " + plural(n, "exigence cochée", "exigences cochées") : "Cochez au moins une exigence"}</button>` : ""}
        <button type="button" class="link-btn" data-ia-reprendre>Lire un autre document</button>
        <button type="button" class="link-btn" data-ia-fermer>Fermer</button>
      </div>`;
  }

  async function ouvreIaDao() {
    const o = OFFERS.find(x => x.id === currentDetailId);
    if (!o) return;
    if (!window.aa || !window.aa.dao) { toast("Fonction disponible dans l'application installée.", "info"); return; }
    let st = null;
    try { st = await window.aa.ia.statut(); } catch (_) {}
    IA_DAO.offreId = o.id;
    if (!st || !st.cleEnregistree) {
      IA_DAO.etat = "erreur";
      IA_DAO.message = "Aucune clé OpenAI sur ce poste. Renseignez-la dans Paramètres → Assistant IA, puis relancez la lecture.";
    } else {
      IA_DAO.etat = "choix";
    }
    renderIaDao();
  }

  async function lanceIaDao(charge, nom) {
    const o = OFFERS.find(x => x.id === currentDetailId);
    if (!o) return;
    const jeton = ++IA_DAO.jeton;
    IA_DAO.etat = "encours"; IA_DAO.document = nom || "fichier du poste"; IA_DAO.offreId = o.id;
    renderIaDao();
    let r;
    try {
      r = await window.aa.dao.analyser(Object.assign({ offre: { titre: o.titre, emetteur: o.emetteur } }, charge));
    } catch (e) {
      r = { ok: false, message: e && e.message ? e.message : String(e) };
    }
    // Fiche refermée, autre offre ouverte ou lecture abandonnée entre-temps.
    if (jeton !== IA_DAO.jeton || currentDetailId !== o.id) return;
    if (!r || !r.ok) {
      if (r && r.categorie === "annule") { IA_DAO.etat = "choix"; renderIaDao(); return; }
      IA_DAO.etat = "erreur";
      IA_DAO.message = (r && r.message) || "La lecture n'a pas abouti.";
      renderIaDao();
      return;
    }
    const courant = OFFERS.find(x => x.id === o.id) || o;
    const res = AA.dao.normalise(r.brut, r.texteAnalyse, Array.isArray(courant.exigences) ? courant.exigences : [], { numerise: !!r.numerise });
    IA_DAO.etat = "resultat";
    IA_DAO.document = (r.document && r.document.nom) || IA_DAO.document;
    IA_DAO.meta = r.document || {};
    IA_DAO.propositions = res.propositions;
    IA_DAO.remarques = res.remarques;
    renderIaDao();
  }

  $("#elig-ia-lancer").addEventListener("click", () => ouvreIaDao());

  iaPanneau.addEventListener("click", async (e) => {
    if (e.target.closest("[data-ia-fermer]")) { fermeIaDao(); return; }
    if (e.target.closest("[data-ia-reprendre]")) { IA_DAO.etat = "choix"; renderIaDao(); return; }
    if (e.target.closest("[data-ia-poste]")) { lanceIaDao({ choisir: true }, null); return; }
    const d = e.target.closest("[data-ia-doc]");
    if (d) {
      const f = FILES.find(x => x.id === d.dataset.iaDoc);
      if (!f) return;
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(f.chemin, 600);
      if (error || !data || !data.signedUrl) { toast("Document inaccessible : " + (error ? error.message : "lien indisponible"), "error"); return; }
      lanceIaDao({ url: data.signedUrl, nom: f.nom }, f.nom);
      return;
    }
    const aj = e.target.closest("[data-ia-ajouter]");
    if (aj) {
      const retenues = IA_DAO.propositions.filter(x => x.coche);
      if (!retenues.length) return;
      aj.disabled = true;
      const meta = { document: IA_DAO.document, ajoutePar: whoami || null };
      const ok = await majExigences(l => l.concat(retenues.map(x => AA.dao.versExigence(x, meta))),
        plural(retenues.length, "exigence ajoutée", "exigences ajoutées") + " depuis le DAO — verdict recalculé.");
      if (ok) fermeIaDao(); else aj.disabled = false;
    }
  });

  iaPanneau.addEventListener("change", (e) => {
    const c = e.target.closest("[data-ia-coche]");
    if (c) {
      const x = IA_DAO.propositions.find(p => String(p.rang) === c.dataset.iaCoche);
      if (x) x.coche = c.checked;
      renderIaDao();
      return;
    }
    const g = e.target.closest("[data-ia-groupable]");
    if (g) {
      const x = IA_DAO.propositions.find(p => String(p.rang) === g.dataset.iaGroupable);
      if (x) x.groupable = g.value === "oui" ? true : g.value === "non" ? false : null;
      return;
    }
    const v = e.target.closest("[data-ia-valeur]");
    if (v) {
      const x = IA_DAO.propositions.find(p => String(p.rang) === v.dataset.iaValeur);
      if (!x) return;
      const t = v.value.replace(/[\s  ]/g, "").replace(",", ".");
      x.valeur = t === "" || !isFinite(Number(t)) ? null : Number(t);
    }
  });

  $("#dlg-elig-profil").addEventListener("click", () => ouvreProfilAA());
  $("#ouvrir-profil-aa").addEventListener("click", () => ouvreProfilAA());

  // ------------------------------------------------------------- le profil
  const enListe = (s) => String(s || "").split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
  const enNombre = (s) => {
    const t = String(s || "").replace(/[\s\u00a0\u202f.]/g, "").replace(",", ".");
    if (!t) return null;
    const n = Number(t);
    return isFinite(n) ? n : null;
  };

  function ouvreProfilAA() {
    const f = $("#profil-form"), p = PROFIL_AA || {};
    const champ = (n) => f.elements.namedItem(n);
    champ("chiffre_affaires_fcfa").value = p.chiffre_affaires_fcfa != null ? Number(p.chiffre_affaires_fcfa).toLocaleString("fr-FR") : "";
    champ("annee_creation").value = p.annee_creation != null ? p.annee_creation : "";
    champ("references_nombre").value = p.references_nombre != null ? p.references_nombre : "";
    champ("certifications").value = Array.isArray(p.certifications) ? p.certifications.join(", ") : "";
    champ("aucune_certification").checked = Array.isArray(p.certifications) && !p.certifications.length;
    champ("agrements").value = Array.isArray(p.agrements) ? p.agrements.join(", ") : "";
    champ("aucun_agrement").checked = Array.isArray(p.agrements) && !p.agrements.length;
    champ("localisations").value = Array.isArray(p.localisations) ? p.localisations.join(", ") : "";
    const filiales = (Array.isArray(p.filiales) && p.filiales.length) ? p.filiales : AA.eligibilite.FILIALES_PAR_DEFAUT;
    champ("filiales").value = filiales.map(x => x.nom + " : " + (x.domaines || []).join(", ")).join("\n");

    const admin = estAdmin();
    Array.from(f.elements).forEach(el => { if (el.name) el.disabled = !admin; });
    $("#profil-enregistrer").hidden = !admin;
    $("#profil-droits").textContent = admin
      ? "Vous êtes administrateur : vos modifications s'appliquent à toute l'équipe, et les verdicts sont recalculés aussitôt."
      : "Lecture seule : seul un administrateur peut modifier le profil, car ces chiffres engagent l'entreprise.";
    $("#profil-maj").textContent = PROFIL_AA_MAJ && PROFIL_AA_MAJ.le && profilAARenseigne()
      ? "Dernière mise à jour le " + fmtDate(PROFIL_AA_MAJ.le) + (PROFIL_AA_MAJ.par ? " par " + PROFIL_AA_MAJ.par : "") + "."
      : "Jamais renseigné.";
    $("#profil-dialog").showModal();
  }

  $("#profil-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!estAdmin()) { toast("Seul un administrateur peut modifier le profil d'A&A.", "error"); return; }
    if (!sb) { toast("Non connecté au registre.", "error"); return; }
    const f = e.target, champ = (n) => f.elements.namedItem(n);
    const certifs = enListe(champ("certifications").value);
    const agrements = enListe(champ("agrements").value);
    const donnees = {
      chiffre_affaires_fcfa: enNombre(champ("chiffre_affaires_fcfa").value),
      annee_creation: enNombre(champ("annee_creation").value),
      references_nombre: enNombre(champ("references_nombre").value),
      // null = « non renseigné », [] = « aucune » : le moteur ne conclut que sur le second.
      certifications: certifs.length ? certifs : (champ("aucune_certification").checked ? [] : null),
      agrements: agrements.length ? agrements : (champ("aucun_agrement").checked ? [] : null),
      localisations: enListe(champ("localisations").value),
      filiales: champ("filiales").value.split("\n").map(l => {
        const i = l.indexOf(":");
        if (i < 0) return null;
        const nom = l.slice(0, i).trim();
        return nom ? { nom, domaines: enListe(l.slice(i + 1)) } : null;
      }).filter(Boolean)
    };
    // On demande la ligne en retour : si la base refuse l'écriture (droits),
    // PostgREST ne renvoie pas d'erreur mais aucune ligne. Sans ce contrôle,
    // l'écran annoncerait un enregistrement qui n'a pas eu lieu.
    const { data, error } = await sb.from("profil_entreprise")
      .update({ donnees, maj_par: whoami || null }).eq("id", 1).select("id");
    if (error) { toast("Échec de l'enregistrement du profil : " + error.message, "error"); return; }
    if (!data || !data.length) { toast("La base a refusé l'enregistrement : droits d'administrateur requis.", "error"); return; }
    PROFIL_AA = donnees;
    PROFIL_AA_MAJ = { le: new Date().toISOString(), par: whoami || null };
    $("#profil-dialog").close();
    toast("Profil d'A&A enregistré — les verdicts sont recalculés.", "success");
    if (currentDetailId && $("#detail").open) fillDetail(currentDetailId);
  });

  $("#dlg-pipeline").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-statut]");
    if (!btn || !currentDetailId) return;
    if (await saveField(currentDetailId, { statut_traitement: btn.dataset.statut })) toast("Statut mis à jour : " + btn.dataset.statut, "success", 2200);
  });
  $("#dlg-assigne").addEventListener("change", (e) => { if (currentDetailId) saveField(currentDetailId, { assigne: e.target.value.trim() }); });

  // Champs de suivi de la soumission (enregistrés à la sortie du champ)
  const SUIVI_FIELDS = {
    "#dlg-date-soumission": "date_soumission",
    "#dlg-date-depouillement": "date_depouillement",
    "#dlg-date-relance": "date_relance",
    "#dlg-resultat": "resultat",
    "#dlg-commentaire-suivi": "commentaire_suivi"
  };
  Object.entries(SUIVI_FIELDS).forEach(([sel, col]) => {
    $(sel).addEventListener("change", async (e) => {
      if (!currentDetailId) return;
      const val = e.target.value.trim ? e.target.value.trim() : e.target.value;
      const patch = {};
      patch[col] = val || null;
      // Un résultat tranché met le statut de suivi en cohérence.
      if (col === "resultat") {
        if (/gagn/i.test(val)) patch.statut_traitement = "Gagnée";
        else if (/perdu|retrait|annul/i.test(val)) patch.statut_traitement = "Perdue";
        else if (val) patch.statut_traitement = "Soumise";
      }
      if (col === "date_soumission" && val) {
        const o = OFFERS.find(x => x.id === currentDetailId);
        if (o && ["Nouvelle", "À qualifier", "En cours"].includes(o.statut_traitement)) patch.statut_traitement = "Soumise";
      }
      if (await saveField(currentDetailId, patch)) toast("Suivi mis à jour.", "success", 2000);
    });
  });
  $("#dlg-claim").addEventListener("click", async () => {
    if (!whoami) { toast("Indiquez d'abord votre nom dans votre profil.", "info"); openSettings(true); return; }
    $("#dlg-assigne").value = whoami;
    if (currentDetailId && await saveField(currentDetailId, { assigne: whoami })) toast("Offre assignée à " + whoami + ".", "success", 2200);
  });
  $("#dlg-link").addEventListener("click", (e) => {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    if (window.aa.openExternal) window.aa.openExternal(url); else window.open(url, "_blank", "noopener");
  });

  // Cette fonction sortait en silence dans trois cas : pas de texte, pas
  // d'offre ouverte, pas de connexion. Rien ne se passait, et l'utilisateur
  // n'avait aucun moyen de savoir pourquoi — c'est ainsi qu'une note n'a
  // jamais été publiée depuis l'installation. Désormais chaque sortie parle.
  async function addNote() {
    const zone = $("#dlg-note-text");
    const text = zone.value.trim();
    if (!text) { toast("Écrivez d'abord votre note.", "info", 2600); zone.focus(); return; }
    if (!currentDetailId) { toast("Ouvrez d'abord la fiche d'une offre.", "error"); return; }
    if (!sb) { toast("Registre non connecté : la note ne peut pas être enregistrée.", "error"); return; }

    const btn = $("#dlg-note-add");
    btn.disabled = true; btn.classList.add("is-busy");
    const { error } = await sb.from("offer_notes").insert({ offer_id: currentDetailId, author: whoami || "Anonyme", text });
    btn.disabled = false; btn.classList.remove("is-busy");
    if (error) { toast("Note non publiée : " + error.message, "error", 7000); return; }
    zone.value = "";
    loadNotes(currentDetailId);
    toast("Note publiée — toute l'équipe la voit sur cette offre.", "success", 3000);
  }
  $("#dlg-note-add").addEventListener("click", addNote);
  $("#dlg-note-text").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addNote(); } });

  detailDlg.addEventListener("close", () => { currentDetailId = null; annoncePresence(); });

  // Fermeture des dialogues (bouton ✕, Annuler, clic sur le fond)
  $$("[data-close]").forEach(btn => btn.addEventListener("click", () => btn.closest("dialog").close()));
  $$("dialog").forEach(d => d.addEventListener("mousedown", (e) => { if (e.target === d) d.close(); }));

  // ======================================================================
  // Documents de l'offre (TDR, DAO, annexes) — bucket Supabase « tdr »
  // ======================================================================
  const BUCKET = "tdr";
  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  let FILES = [];

  async function loadFileCounts() {
    if (!sb) return;
    const { data, error } = await sb.from("offer_files").select("offer_id");
    if (error) return;
    const counts = {};
    (data || []).forEach(r => { counts[r.offer_id] = (counts[r.offer_id] || 0) + 1; });
    FILE_COUNTS = counts;
  }

  function fmtSize(bytes) {
    const n = Number(bytes || 0);
    if (!n) return "";
    if (n < 1024) return n + " o";
    if (n < 1024 * 1024) return Math.round(n / 1024) + " Ko";
    return (n / 1048576).toFixed(1).replace(".", ",") + " Mo";
  }

  async function loadFiles(offerId) {
    if (!sb) return;
    const { data, error } = await sb.from("offer_files").select("*").eq("offer_id", offerId).order("created_at", { ascending: false });
    if (currentDetailId !== offerId) return;
    if (error) { $("#dlg-docs").innerHTML = `<p class="muted-line">Documents indisponibles (${esc(error.message)}).</p>`; return; }
    FILES = data || [];
    FILE_COUNTS[offerId] = FILES.length;
    renderFiles();
  }

  function renderFiles() {
    $("#dlg-docs-count").textContent = FILES.length ? FILES.length : "";
    // Les termes de référence passent devant : c'est la pièce qu'on ouvre.
    const ordre = FILES.slice().sort((a, b) => (EST_TDR.test(b.nom) ? 1 : 0) - (EST_TDR.test(a.nom) ? 1 : 0));
    $("#dlg-docs").innerHTML = ordre.length ? ordre.map(f => {
      const ext = (String(f.nom).match(/\.([A-Za-z0-9]{1,8})$/) || [, ""])[1].toUpperCase();
      const auto = f.source === "collecte";
      const tdr = EST_TDR.test(f.nom);
      return `<div class="doc${tdr ? " is-tdr" : ""}" data-doc="${esc(f.id)}">
        <span class="doc-ext">${esc(ext || "?")}</span>
        <div class="doc-main">
          <div class="doc-name" title="${esc(f.nom)}">${esc(f.nom)}${tdr ? '<span class="doc-tdr">TDR</span>' : ""}</div>
          <div class="doc-meta">${esc(fmtSize(f.taille))}${f.taille ? " · " : ""}${auto ? "récupéré par la veille" : "déposé par " + esc(f.author || "un collaborateur")} · ${esc(fmtDate(f.created_at))}</div>
        </div>
        <button class="icon-btn" data-doc-open="${esc(f.id)}" title="Ouvrir le document">${icon("external")}</button>
        <button class="icon-btn" data-doc-download="${esc(f.id)}" title="Télécharger">${icon("download")}</button>
        <button class="icon-btn" data-admin-only data-doc-delete="${esc(f.id)}" title="Supprimer">${icon("trash")}</button>
      </div>`;
    }).join("") : '<p class="muted-line">Aucun document pour le moment. Les TDR déposés ici sont téléchargeables par toute l\'équipe.</p>';
    appliqueProfil();
  }

  async function uploadFiles(fileList) {
    const offerId = currentDetailId;
    if (!offerId || !sb) return;
    const dz = $("#dlg-dropzone");
    for (const file of Array.from(fileList || [])) {
      if (file.size > MAX_FILE_BYTES) { toast(`« ${file.name} » dépasse 25 Mo.`, "error"); continue; }
      dz.classList.add("is-busy");
      $(".dz-main", dz).textContent = "Envoi de " + file.name + "…";
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-100);
      const chemin = offerId + "/" + Date.now() + "-" + safe;
      const up = await sb.storage.from(BUCKET).upload(chemin, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (up.error) { toast("Envoi impossible : " + up.error.message, "error"); dz.classList.remove("is-busy"); continue; }
      const { error } = await sb.from("offer_files").insert({
        offer_id: offerId, nom: file.name, chemin, taille: file.size,
        type_mime: file.type || null, source: "manuel", author: whoami || "Anonyme"
      });
      dz.classList.remove("is-busy");
      if (error) { toast("Document non enregistré : " + error.message, "error"); continue; }
      toast(`« ${file.name} » ajouté à l'offre.`, "success");
    }
    $(".dz-main", dz).innerHTML = 'Glissez un document ici ou <button type="button" class="link-btn" id="dlg-pick">parcourez vos fichiers</button>';
    await loadFiles(offerId);
    render();
  }

  async function downloadDoc(f) {
    // Le dossier des TDR est privé : on demande un lien signé, valable une
    // heure, plutôt qu'une adresse publique qui resterait ouverte à jamais.
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(f.chemin, 3600);
    if (error || !data || !data.signedUrl) {
      toast("Téléchargement impossible : " + (error ? error.message : "lien indisponible"), "error");
      return;
    }
    try {
      const res = await window.aa.downloadFile(data.signedUrl, f.nom);
      if (res && res.saved) toast("Document enregistré : " + res.filePath, "success", 6000);
    } catch (e) {
      toast("Téléchargement impossible : " + (e && e.message ? e.message : e), "error");
    }
  }

  async function deleteDoc(f) {
    const rm = await sb.storage.from(BUCKET).remove([f.chemin]);
    if (rm.error) { toast("Suppression impossible : " + rm.error.message, "error"); return; }
    const { error } = await sb.from("offer_files").delete().eq("id", f.id);
    if (error) { toast("Suppression impossible : " + error.message, "error"); return; }
    toast("Document supprimé.", "success", 2500);
    await loadFiles(currentDetailId);
    render();
  }

  $("#dlg-docs").addEventListener("click", async (e) => {
    const dl = e.target.closest("[data-doc-download]");
    const del = e.target.closest("[data-doc-delete]");
    if (dl) {
      const f = FILES.find(x => x.id === dl.dataset.docDownload);
      if (f) downloadDoc(f);
      return;
    }
    if (del) {
      const f = FILES.find(x => x.id === del.dataset.docDelete);
      if (!f) return;
      if (del.dataset.confirm) { deleteDoc(f); return; }
      del.dataset.confirm = "1";
      del.classList.add("is-danger");
      del.title = "Cliquez à nouveau pour confirmer";
      setTimeout(() => { delete del.dataset.confirm; del.classList.remove("is-danger"); del.title = "Supprimer"; }, 4000);
      toast("Cliquez une seconde fois sur la corbeille pour supprimer.", "info", 3500);
    }
  });

  document.addEventListener("click", (e) => { if (e.target.closest("#dlg-pick")) $("#dlg-file-input").click(); });
  $("#dlg-file-input").addEventListener("change", (e) => { uploadFiles(e.target.files); e.target.value = ""; });

  const dropzone = $("#dlg-dropzone");
  ["dragenter", "dragover"].forEach(ev => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach(ev => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove("is-over"); }));
  dropzone.addEventListener("drop", (e) => uploadFiles(e.dataTransfer.files));
  // Un fichier lâché à côté de la zone ne doit pas remplacer la fenêtre.
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());

  $("#dlg-fetch-docs").addEventListener("click", async () => {
    const o = OFFERS.find(x => x.id === currentDetailId);
    if (!o) return;
    if (!o.lien_source) { toast("Cette offre n'a pas de lien source.", "info"); return; }
    const btn = $("#dlg-fetch-docs");
    btn.disabled = true; btn.classList.add("is-busy");
    $("span", btn).textContent = "Recherche en cours…";
    try {
      const res = await window.aa.fetchAttachments(o.id, o.lien_source);
      if (res && res.error) toast(res.error, "error");
      else if (res && res.added) toast(plural(res.added, "document récupéré", "documents récupérés") + " depuis la source.", "success");
      else toast("Aucun document téléchargeable trouvé sur la page source.", "info", 5000);
      await loadFiles(o.id);
      render();
    } catch (e) {
      toast("Recherche impossible : " + (e && e.message ? e.message : e), "error");
    } finally {
      btn.disabled = false; btn.classList.remove("is-busy");
      $("span", btn).textContent = "Chercher les documents sur la source";
    }
  });

  // ======================================================================
  // Ajouter une offre
  // ======================================================================
  $("#add-btn").addEventListener("click", () => {
    $("#add-dialog").showModal();
    $("#add-form").titre.focus();
  });
  $("#add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!sb) { toast("Non connecté au registre : configurez d'abord la connexion.", "error"); return; }
    const v = Object.fromEntries(new FormData(e.target).entries());
    const row = {
      titre: v.titre.trim(), emetteur: v.emetteur.trim(), origine: v.origine, filiale: v.filiale || "",
      type: v.type, secteur: v.secteur, region: v.region, montant: v.montant || null,
      date_publication: v.datePublication || null, date_limite: v.dateLimite || null,
      lien_source: v.lienSource || null, description: v.description || null,
      criteres: v.criteres || null, contact: v.contact || null,
      statut_traitement: "Nouvelle", assigne: "", source_id: "manuel",
      created_by: whoami || "Anonyme"
    };
    const submit = e.target.querySelector('[type="submit"]');
    submit.disabled = true;
    const { error } = await sb.from("offers").insert(row);
    submit.disabled = false;
    if (error) { toast("Échec de l'ajout : " + error.message, "error"); return; }
    toast("Offre ajoutée au registre.", "success");
    e.target.reset();
    $("#add-dialog").close();
    loadOffers();
  });

  // ======================================================================
  // Onglets
  // ======================================================================
  const VIEWS = { veille: "#view-veille", go: "#view-go", attente: "#view-attente", soumissions: "#view-soumissions",
    prospection: "#view-prospection", bord: "#view-bord", corbeille: "#view-corbeille" };

  // Chaque onglet sait s'il doit être redessiné. Le registre n'est pas listé :
  // il est rendu par render() lui-même, qui s'occupe de la grille et des filtres.
  const RENDU_VUE = {
    attente: renderAttente,
    soumissions: renderSuivi,
    prospection: () => { renderOpps(); renderArbitrage(); },
    go: renderGo,
    bord: renderBord,
    corbeille: renderCorbeille
  };
  const aRafraichir = new Set();

  /** Rend la vue demandée ; les autres sont notées comme périmées. */
  function rendVue(tab) {
    Object.keys(RENDU_VUE).forEach(k => { if (k !== tab) aRafraichir.add(k); });
    const f = RENDU_VUE[tab];
    if (f) { f(); aRafraichir.delete(tab); }
  }

  /**
   * Appelé quand une donnée change sans que tout l'écran ait à être refait :
   * la vue concernée est redessinée si elle est à l'écran, sinon simplement
   * marquée périmée — elle se remettra à jour à son ouverture.
   */
  function rafraichit(...vues) {
    vues.forEach(v => {
      if (v === currentTab && RENDU_VUE[v]) { RENDU_VUE[v](); aRafraichir.delete(v); }
      else aRafraichir.add(v);
    });
  }

  function setTab(tab) {
    currentTab = VIEWS[tab] ? tab : "veille";
    // À l'ouverture d'un onglet resté en arrière-plan, on le remet à jour.
    if (aRafraichir.has(currentTab) && RENDU_VUE[currentTab]) {
      RENDU_VUE[currentTab](); aRafraichir.delete(currentTab);
    }
    Object.entries(VIEWS).forEach(([k, sel]) => { $(sel).hidden = k !== currentTab; });
    $$(".rail-nav .nav-item[data-tab]").forEach(b => b.classList.toggle("is-active", b.dataset.tab === currentTab));
    setPref("tab", currentTab);
    annoncePresence();
    window.scrollTo({ top: 0 });
  }
  // La Corbeille est rangée avec les outils, en bas du rail : ses clics
  // doivent ouvrir une vue comme ceux des onglets du haut.
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".rail-nav .nav-item[data-tab]");
    if (b) setTab(b.dataset.tab);
  });

  function renderTabCounts() {
    $("#tab-n-veille").textContent = registre().length || "";
    const nAttente = OFFERS.filter(AA.metier.estEnAttente);
    const nRelance = nAttente.filter(o => AA.metier.attente(o).aRelancer).length;
    const pastille = $("#tab-n-attente");
    pastille.textContent = nAttente.length || "";
    pastille.classList.toggle("is-alerte", nRelance > 0);
    pastille.title = nRelance ? plural(nRelance, "offre à relancer", "offres à relancer") : "";
    $("#tab-n-soumissions").textContent = soumissions().length || "";
    $("#tab-n-prospection").textContent = OPPS.length || "";
    $("#tab-n-go").textContent = offresGo().filter(o => phaseGo(o) === "prepa").length || "";
    $("#tab-n-corbeille").textContent = CORBEILLE.length || "";
    $("#nav-n-sources").textContent = SOURCES.filter(s => s.actif !== false).length || "";
  }

  // ======================================================================
  // En attente de décision
  //
  // Les offres déposées dont le résultat n'est pas connu. Elles quittent la
  // veille (règle : AA.metier.estEnAttente) et sont suivies ici jusqu'au
  // résultat : depuis quand on attend, qui relancer, et le résultat en un
  // clic — après quoi l'offre rejoint l'historique des Soumissions.
  // ======================================================================
  const attenteFiltre = { filiale: "", vue: "", tri: "attente", q: "" };
  const confirmations = new Map();   // bouton de résultat armé → minuteur

  function offresEnAttente() { return OFFERS.filter(AA.metier.estEnAttente); }

  const fmtCourt = (d) => d ? fmtDate(d, { day: "2-digit", month: "2-digit", year: "numeric" }) : "";

  /** Le bandeau de la veille : où sont passées les offres déposées. */
  function renderNoteAttente() {
    const note = $("#registre-attente");
    if (!note) return;
    const toutes = offresEnAttente();
    const q = $("#search").value.trim();
    const trouvees = q ? rechercheBrute().filter(AA.metier.estEnAttente) : [];
    if (q && trouvees.length) {
      note.innerHTML = `${icon("hourglass")}<span><b>${plural(trouvees.length, "offre correspondante est", "offres correspondantes sont")}</b> en attente de décision : ${trouvees.length > 1 ? "elles ne s'affichent" : "elle ne s'affiche"} plus ici.</span>
        <button type="button" class="link-btn" data-voir-attente="recherche">Les voir →</button>`;
      note.hidden = false;
    } else if (toutes.length) {
      const relance = toutes.filter(o => AA.metier.attente(o).aRelancer).length;
      note.innerHTML = `${icon("hourglass")}<span>${plural(toutes.length, "offre déposée attend", "offres déposées attendent")} une décision${relance ? ", dont <b>" + plural(relance, "à relancer", "à relancer") + "</b>" : ""} — rangée${toutes.length > 1 ? "s" : ""} dans « En attente de décision ».</span>
        <button type="button" class="link-btn" data-voir-attente>Ouvrir →</button>`;
      note.hidden = false;
    } else {
      note.hidden = true;
    }
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-voir-attente]");
    if (!b) return;
    attenteFiltre.q = b.dataset.voirAttente === "recherche" ? $("#search").value.trim() : "";
    attenteFiltre.vue = "";
    const champ = $("#attente-recherche");
    if (champ) champ.value = attenteFiltre.q;
    setTab("attente");
    renderAttente();
  });

  /**
   * Quand une offre change de monde (déposée → attente, résultat → historique),
   * on le dit : sinon elle disparaît de l'écran sous les yeux de la personne.
   */
  function annonceChangementDeMonde(o, avant) {
    const apres = AA.metier.estEnAttente(o);
    if (avant === apres) return;
    if (apres && currentTab !== "attente") {
      toast("Offre déposée : elle passe dans « En attente de décision » jusqu'au résultat.", "info", 6000);
    } else if (!apres && avant) {
      const issue = AA.metier.estGagnee(o) ? "gagnée" : AA.metier.estPerdue(o) ? "close sans contrat" : "sortie de l'attente";
      toast("Offre " + issue + " : elle quitte « En attente de décision » et reste dans l'historique des Soumissions.", AA.metier.estGagnee(o) ? "success" : "info", 6000);
    }
  }

  function filtreAttente(o, a) {
    if (attenteFiltre.filiale && (o.filiale || "") !== (attenteFiltre.filiale === "__none__" ? "" : attenteFiltre.filiale)) return false;
    if (attenteFiltre.vue === "relancer" && !a.aRelancer) return false;
    if (attenteFiltre.vue === "preselection" && !a.preselection) return false;
    if (attenteFiltre.vue === "longue" && a.niveau !== "longue") return false;
    if (attenteFiltre.vue === "sansdate" && a.base === "depot") return false;
    if (attenteFiltre.q) {
      const t = aplatiRecherche([o.titre, o.emetteur, o.description, o.secteur, o.assigne].join(" "));
      if (!aplatiRecherche(attenteFiltre.q).split(/\s+/).filter(Boolean).every(m => t.includes(m))) return false;
    }
    return true;
  }

  const aplatiRecherche = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  function trieAttente(lignes) {
    const cle = {
      attente: (x) => -(x.a.jours == null ? -1 : x.a.jours),
      recent: (x) => x.a.jours == null ? 1e9 : x.a.jours,
      depouillement: (x) => x.o.date_depouillement ? Date.parse(x.o.date_depouillement) : 9e15
    }[attenteFiltre.tri];
    if (!cle) return lignes.sort((p, q) => String(p.o.emetteur || "").localeCompare(String(q.o.emetteur || ""), "fr"));
    return lignes.sort((p, q) => cle(p) - cle(q) || String(p.o.titre || "").localeCompare(String(q.o.titre || ""), "fr"));
  }

  function renderAttente() {
    const vue = $("#view-attente");
    if (!vue) return;
    const toutes = offresEnAttente().map(o => ({ o, a: AA.metier.attente(o) }));

    // Indicateurs
    const relance = toutes.filter(x => x.a.aRelancer).length;
    const depouille = toutes.filter(x => x.a.depouillementPasse).length;
    const longues = toutes.filter(x => x.a.niveau === "longue").length;
    const avecJours = toutes.filter(x => x.a.jours != null);
    const moyenne = avecJours.length ? Math.round(avecJours.reduce((s, x) => s + x.a.jours, 0) / avecJours.length) : null;
    $("#kpis-attente").innerHTML = [
      { id: "tout", key: "a-all", label: "En attente de décision", value: toutes.length, hint: toutes.filter(x => x.a.preselection).length ? plural(toutes.filter(x => x.a.preselection).length, "présélectionnée", "présélectionnées") : "Dossiers déposés, résultat inconnu", ic: "hourglass", teinte: "dark", active: !attenteFiltre.vue },
      { id: "relancer", key: "a-rel", label: "À relancer", value: relance, hint: relance ? "Sans nouvelles depuis 3 semaines ou plus" : "Aucune relance due", ic: "bell", teinte: relance ? "crit" : "teal", active: attenteFiltre.vue === "relancer" },
      { id: "longue", key: "a-long", label: "Attente de 90 jours et plus", value: longues, hint: longues ? "Validité des offres sans doute échue" : "Aucune attente anormale", ic: "clock", teinte: longues ? "crit" : "sky", active: attenteFiltre.vue === "longue" },
      { key: "a-moy", label: "Attente moyenne", value: moyenne == null ? "—" : moyenne + " j", hint: depouille ? plural(depouille, "dépouillement passé sans résultat", "dépouillements passés sans résultat") : "Depuis la date de dépôt", ic: "calendar", teinte: "blue" }
    ].map(kpiTile).join("");
    animerCompteurs($("#kpis-attente"));

    // Filiales
    const counts = {};
    toutes.forEach(x => { counts[x.o.filiale || ""] = (counts[x.o.filiale || ""] || 0) + 1; });
    const onglets = [{ value: "", short: "Toutes les filiales", cls: "", n: toutes.length }]
      .concat(FILIALES.map(f => ({ value: f.value, short: f.short, cls: f.cls, n: counts[f.value] || 0 })));
    if (counts[""]) onglets.push({ value: "__none__", short: "À qualifier", cls: "f-none", n: counts[""] });
    $("#attente-filiales").innerHTML = onglets.map(t =>
      `<button type="button" class="ftab ${t.cls}${attenteFiltre.filiale === t.value ? " is-active" : ""}" data-attente-filiale="${esc(t.value)}">
        ${t.cls ? '<span class="fdot"></span>' : ""}${esc(t.short)}<span class="n">${t.n}</span></button>`).join("");

    // Pastilles de filtre
    const vues = [
      { k: "", l: "Toutes" },
      { k: "relancer", l: "À relancer", n: relance },
      { k: "preselection", l: "Présélectionnées", n: toutes.filter(x => x.a.preselection).length },
      { k: "longue", l: "90 jours et plus", n: longues },
      { k: "sansdate", l: "Date de dépôt à renseigner", n: toutes.filter(x => x.a.base !== "depot").length }
    ];
    $("#attente-filtres").innerHTML = vues.filter(v => !v.k || v.n || attenteFiltre.vue === v.k).map(v =>
      `<button type="button" class="chip${attenteFiltre.vue === v.k ? " is-active" : ""}" data-attente-vue="${esc(v.k)}">${esc(v.l)}${v.n ? ` <b>${v.n}</b>` : ""}</button>`).join("");
    $("#attente-tri").value = attenteFiltre.tri;
    if (document.activeElement !== $("#attente-recherche")) $("#attente-recherche").value = attenteFiltre.q;

    const lignes = trieAttente(toutes.filter(x => filtreAttente(x.o, x.a)));
    $("#attente-count").textContent = plural(lignes.length, "offre", "offres") + (lignes.length !== toutes.length ? " sur " + toutes.length : "");
    const vide = lignes.length === 0;
    $("#attente-vide").hidden = !vide;
    $("#attente-vide-titre").textContent = toutes.length ? "Aucune offre ne correspond" : "Aucune offre en attente de décision";
    $("#attente-vide-texte").textContent = toutes.length
      ? "Modifiez la recherche ou les filtres."
      : "Une offre arrive ici dès qu'elle est déposée (statut « Soumise » ou date de dépôt renseignée), et en repart dès que son résultat est enregistré.";
    confirmations.forEach(t => clearTimeout(t)); confirmations.clear();
    $("#attente-liste").innerHTML = lignes.map(x => carteAttente(x.o, x.a)).join("");
  }

  /** La carte d'une offre en attente : où en est l'attente, et que faire. */
  function carteAttente(o, a) {
    const fm = filialeMeta(o.filiale);
    const jours = a.jours == null ? "—" : a.jours === 0 ? "Aujourd'hui" : "J+" + a.jours;
    const depuis = { depot: "depuis le dépôt", limite: "depuis la date limite (dépôt non daté)", statut: "depuis le passage en « Soumise »" }[a.base] || "date de dépôt inconnue";
    const conseil = a.niveau === "longue"
      ? "Au-delà de 90 jours, la validité des offres est souvent échue : demandez le résultat ou une prorogation."
      : a.depouillementPasse ? "Le dépouillement est passé : le résultat devrait être connu, relancez l'autorité contractante."
      : a.aRelancer ? "Trois semaines sans nouvelles : une relance est conseillée."
      : "";
    const etapes = [
      { l: "Date limite", v: o.date_limite },
      { l: "Déposée", v: o.date_soumission, manque: a.base !== "depot" },
      { l: "Dépouillement", v: o.date_depouillement },
      { l: "Dernière relance", v: o.date_relance }
    ];
    const contact = String(o.contact || "").trim();
    const mail = (contact.match(/[\w.+-]+@[\w-]+\.[\w.]+/) || [])[0];
    return `
      <article class="attente-carte ${fm.cls} niveau-${a.niveau}${a.aRelancer ? " is-relance" : ""}${estRecente(o.id) ? " is-recent" : ""}" data-attente-id="${esc(o.id)}">
        <div class="ac-gauche">
          <div class="card-top">
            <span class="fbadge">${esc(fm.short)}</span>
            <span class="tag">${esc(o.type || "—")}</span>
            ${a.preselection ? '<span class="tag tag-presel">Présélectionnée</span>' : ""}
            ${puceDecision(o)}
          </div>
          <button type="button" class="ac-titre" data-open="${esc(o.id)}" title="Ouvrir la fiche">${esc(o.titre || "(sans titre)")}</button>
          <div class="emitter">${esc(o.emetteur || "Autorité contractante non renseignée")}${o.montant ? " · " + esc(o.montant) : ""}</div>
          <ol class="ac-etapes">
            ${etapes.map(e => e.manque
              ? `<li class="is-manque"><span>${esc(e.l)}</span><input type="date" class="ac-date" data-attente-depot="${esc(o.id)}" aria-label="Date de dépôt" title="Renseignez la date de dépôt : l'attente sera calculée à partir d'elle." max="${esc(jourIso(new Date()))}"></li>`
              : `<li class="${e.v ? "is-fait" : ""}"><span>${esc(e.l)}</span><b>${esc(fmtCourt(e.v) || "—")}</b></li>`).join("")}
          </ol>
          ${conseil ? `<p class="ac-conseil">${icon(a.aRelancer || a.niveau === "longue" ? "bell" : "clock")}${esc(conseil)}</p>` : ""}
          ${o.commentaire_suivi ? `<p class="ac-commentaire" title="Commentaire de suivi">${esc(o.commentaire_suivi)}</p>` : ""}
        </div>
        <div class="ac-droite">
          <div class="ac-jours niveau-${a.niveau}" title="${esc(depuis)}"><b>${esc(jours)}</b><span>${esc(a.jours == null ? "attente inconnue" : "d'attente")}</span></div>
          <div class="ac-qui">
            ${o.assigne ? `<span class="avatar sm" title="Suivie par ${esc(o.assigne)}">${esc(initials(o.assigne))}</span><span>${esc(o.assigne)}</span>` : '<span class="muted">Personne n\'est assigné</span>'}
          </div>
          <div class="ac-actions">
            <button type="button" class="btn small ac-relance" data-attente-relance="${esc(o.id)}" title="Note la relance d'aujourd'hui dans la fiche">${icon("bell")}Relance faite</button>
            <button type="button" class="btn small" data-attente-mail="${esc(o.id)}" title="${esc(mail ? "Écrire à " + mail : "Rédiger une demande de résultat à l'autorité contractante")}">${icon("mail")}Relancer par e-mail</button>
          </div>
          <div class="ac-resultat" role="group" aria-label="Enregistrer le résultat">
            <span class="ac-resultat-l">Résultat :</span>
            <button type="button" class="ac-res res-gagne" data-attente-resultat="Gagné" data-id="${esc(o.id)}">${icon("trophy")}Gagnée</button>
            <button type="button" class="ac-res res-perdu" data-attente-resultat="Perdu" data-id="${esc(o.id)}">${icon("thumb-down")}Perdue</button>
            <button type="button" class="ac-res res-annule" data-attente-resultat="Retrait / marché annulé" data-id="${esc(o.id)}">${icon("x")}Annulé / retrait</button>
            ${a.preselection ? "" : `<button type="button" class="ac-res res-presel" data-attente-resultat="Retenu (présélection)" data-id="${esc(o.id)}" title="Retenue sur la liste restreinte : l'offre reste en attente de la décision finale">${icon("check")}Présélectionnée</button>`}
          </div>
        </div>
      </article>`;
  }

  /** Les champs que pose un résultat. Une présélection laisse l'offre en attente. */
  function patchResultat(resultat) {
    if (/gagn/i.test(resultat)) return { resultat, statut_traitement: "Gagnée" };
    if (/perdu|retrait|annul/i.test(resultat)) return { resultat, statut_traitement: "Perdue" };
    return { resultat, statut_traitement: "Soumise" };
  }

  $("#view-attente").addEventListener("click", async (e) => {
    const kpi = e.target.closest("#kpis-attente [data-kpi]");
    if (kpi) {
      const id = kpi.dataset.kpi;
      attenteFiltre.vue = id === "tout" || attenteFiltre.vue === id ? "" : id;
      renderAttente();
      return;
    }
    const fil = e.target.closest("[data-attente-filiale]");
    if (fil) { const v = fil.dataset.attenteFiliale; attenteFiltre.filiale = attenteFiltre.filiale === v ? "" : v; renderAttente(); return; }
    const vueBtn = e.target.closest("[data-attente-vue]");
    if (vueBtn) { attenteFiltre.vue = vueBtn.dataset.attenteVue; renderAttente(); return; }

    const res = e.target.closest("[data-attente-resultat]");
    if (res) {
      const id = res.dataset.id, resultat = res.dataset.attenteResultat;
      // Deux temps : un résultat se saisit sur un clic délibéré, pas par mégarde.
      if (!confirmations.has(res)) {
        $$("#attente-liste .ac-res.is-arme").forEach(b => { b.classList.remove("is-arme"); b.lastChild.textContent = b.dataset.libelle; });
        confirmations.forEach(t => clearTimeout(t)); confirmations.clear();
        res.dataset.libelle = res.lastChild.textContent;
        res.classList.add("is-arme");
        res.lastChild.textContent = "Confirmer ?";
        confirmations.set(res, setTimeout(() => {
          res.classList.remove("is-arme"); res.lastChild.textContent = res.dataset.libelle; confirmations.delete(res);
        }, 4000));
        return;
      }
      clearTimeout(confirmations.get(res)); confirmations.delete(res);
      res.disabled = true;
      const o = OFFERS.find(x => x.id === id);
      const patch = patchResultat(resultat);
      if (o && !o.date_soumission && /gagn|perdu|retrait|annul/i.test(resultat)) {
        // On garde trace du dépôt même s'il n'avait pas été daté.
        const a = AA.metier.attente(o);
        if (a.base === "limite") patch.date_soumission = o.date_limite;
      }
      const ok = await saveField(id, patch);
      if (ok && /retenu/i.test(resultat)) toast("Présélection enregistrée : l'offre reste en attente de la décision finale.", "success");
      renderAttente();
      return;
    }

    const rel = e.target.closest("[data-attente-relance]");
    if (rel) {
      const o = OFFERS.find(x => x.id === rel.dataset.attenteRelance);
      if (!o) return;
      const auj = jourIso(new Date());
      if (o.date_relance === auj) { toast("La relance d'aujourd'hui est déjà notée.", "info"); return; }
      const ligne = "Relance le " + fmtCourt(auj) + (whoami ? " (" + initials(whoami) + ")" : "");
      rel.disabled = true;
      const ok = await saveField(o.id, {
        date_relance: auj,
        commentaire_suivi: (o.commentaire_suivi ? o.commentaire_suivi.trim() + "\n" : "") + ligne
      });
      if (ok) toast("Relance notée dans la fiche.", "success");
      renderAttente();
      return;
    }

    const mail = e.target.closest("[data-attente-mail]");
    if (mail) { ouvreRelance(mail.dataset.attenteMail); return; }
  });

  // Relance par e-mail : même circuit que les demandes d'arbitrage (envoi
  // direct si la messagerie est réglée, brouillon sinon), puis la relance
  // est consignée dans la fiche.
  const relanceDlg = $("#relance-dialog");
  let relanceId = null;
  async function ouvreRelance(id) {
    const o = OFFERS.find(x => x.id === id);
    if (!o) return;
    relanceId = id;
    const adresses = String(o.contact || "").match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [];
    $("#relance-a").value = adresses.join(", ");
    $("#relance-objet").value = "Demande d'information sur les résultats — " + (o.titre || "").slice(0, 110);
    $("#relance-corps").value = "Madame, Monsieur,\n\n"
      + "Nous avons déposé notre offre pour « " + (o.titre || "") + " »"
      + (o.date_soumission ? " le " + fmtCourt(o.date_soumission) : o.date_limite ? " à la date limite du " + fmtCourt(o.date_limite) : "") + ".\n\n"
      + "Pourriez-vous nous indiquer l'état d'avancement de l'évaluation et, le cas échéant, la date prévisionnelle de publication des résultats ?\n\n"
      + "Nous restons à votre disposition pour tout complément d'information.\n\n"
      + "Veuillez agréer, Madame, Monsieur, l'expression de nos salutations distinguées.\n\n"
      + (whoami ? whoami + "\n" : "") + "A&A Group";
    let configure = false;
    try { configure = !!(window.aa.courriel && (await window.aa.courriel.statut()).configure); } catch (_) {}
    $("#relance-mode").textContent = configure
      ? "Le message part directement depuis votre messagerie A&A."
      : "Messagerie non configurée : un brouillon s'ouvrira, à vous de l'envoyer.";
    relanceDlg.showModal();
    (adresses.length ? $("#relance-corps") : $("#relance-a")).focus();
  }

  $("#relance-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const o = OFFERS.find(x => x.id === relanceId);
    if (!o) return;
    const dest = $("#relance-a").value.split(/[,;\s]+/).map(x => x.trim()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
    if (!dest.length) { toast("Indiquez l'adresse de l'autorité contractante.", "info"); $("#relance-a").focus(); return; }
    const objet = $("#relance-objet").value, corps = $("#relance-corps").value;
    const bouton = $("#relance-envoyer");
    bouton.disabled = true; bouton.classList.add("is-busy");
    let envoi = null;
    try { envoi = await window.aa.courriel.envoyer({ destinataires: dest, objet, corps }); } catch (err) { envoi = { ok: false, message: err.message }; }
    bouton.disabled = false; bouton.classList.remove("is-busy");
    if (envoi && envoi.nonConfigure) {
      const lien = "mailto:" + dest.map(encodeURIComponent).join(",") + "?subject=" + encodeURIComponent(objet) + "&body=" + encodeURIComponent(corps);
      window.aa.openExternal(lien);
      toast("Messagerie non configurée : un brouillon a été ouvert, à vous de l'envoyer.", "info", 8000);
    } else if (!envoi || !envoi.ok) {
      toast("Envoi impossible : " + ((envoi && envoi.message) || "cause inconnue"), "error", 9000);
      return;   // la fenêtre reste ouverte : le message n'est pas perdu
    } else {
      toast("Relance envoyée à " + dest.join(", ") + ".", "success", 6000);
    }
    const auj = jourIso(new Date());
    const ligne = "Relance par e-mail le " + fmtCourt(auj) + " à " + dest.join(", ") + (whoami ? " (" + initials(whoami) + ")" : "");
    await saveField(o.id, { date_relance: auj, commentaire_suivi: (o.commentaire_suivi ? o.commentaire_suivi.trim() + "\n" : "") + ligne });
    try { await sb.from("offer_mails").insert({ offer_id: o.id, objet, destinataires: dest.join(", "), envoye_par: whoami || "Anonyme" }); } catch (_) {}
    relanceDlg.close();
    renderAttente();
  });

  $("#view-attente").addEventListener("change", async (e) => {
    const d = e.target.closest("[data-attente-depot]");
    if (d && d.value) {
      if (d.value > jourIso(new Date())) { toast("La date de dépôt ne peut pas être dans le futur.", "error"); d.value = ""; return; }
      await saveField(d.dataset.attenteDepot, { date_soumission: d.value });
      toast("Date de dépôt enregistrée.", "success");
      renderAttente();
    }
  });

  $("#attente-tri").addEventListener("change", (e) => { attenteFiltre.tri = e.target.value; renderAttente(); });
  let attenteTimer = null;
  $("#attente-recherche").addEventListener("input", (e) => {
    clearTimeout(attenteTimer);
    attenteTimer = setTimeout(() => { attenteFiltre.q = e.target.value.trim(); renderAttente(); }, 140);
  });
  $("#attente-add-btn").addEventListener("click", () => $("#soumission-add-btn").click());

  $("#export-attente-btn").addEventListener("click", async () => {
    if (!await ensureLib("xlsx")) { toast("Module Excel introuvable : relancez « construire-exe.cmd » ou vérifiez la connexion.", "error"); return; }
    const rows = offresEnAttente().map(o => ({ o, a: AA.metier.attente(o) }))
      .sort((p, q) => (q.a.jours || 0) - (p.a.jours || 0))
      .map((x, i) => ({
        "#": i + 1,
        "Intitulé / objet du marché": x.o.titre || "",
        "Autorité contractante": x.o.emetteur || "",
        "Filiale A&A": x.o.filiale || "À qualifier",
        "Type d'avis": x.o.type || "",
        "Date limite": x.o.date_limite || "",
        "Date de dépôt": x.o.date_soumission || "",
        "Jours d'attente": x.a.jours == null ? "" : x.a.jours,
        "Attente calculée depuis": { depot: "le dépôt", limite: "la date limite", statut: "le passage en Soumise" }[x.a.base] || "",
        "Dépouillement": x.o.date_depouillement || "",
        "Dernière relance": x.o.date_relance || "",
        "À relancer": x.a.aRelancer ? "Oui" : "",
        "Résultat": x.o.resultat || "En attente",
        "Suivie par": x.o.assigne || "",
        "Commentaire": x.o.commentaire_suivi || ""
      }));
    if (!rows.length) { toast("Aucune offre en attente à exporter.", "info"); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map(k => ({ wch: k === "Intitulé / objet du marché" ? 60 : Math.min(30, Math.max(10, k.length + 3)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "En attente de décision");
    const b64 = arrayBufferToBase64(XLSX.write(wb, { bookType: "xlsx", type: "array" }));
    const r = await window.aa.saveXlsx("aa-group-offres-en-attente-" + new Date().toISOString().slice(0, 10) + ".xlsx", b64);
    if (r && r.saved) toast("Liste exportée : " + r.filePath, "success", 6000);
  });

  // ======================================================================
  // Suivi des soumissions
  // ======================================================================
  const suiviFilter = { resultat: "", annee: "", filiale: "" };

  /** Une offre entre au suivi dès qu'elle est déposée ou qu'un résultat est connu. */
  // Une seule règle pour toute l'application : voir metier.js.
  function soumissions() { return AA.metier.soumissions(OFFERS); }

  function resultatCls(r) {
    if (!r) return "ws-nouvelle";
    if (/gagn/i.test(r)) return "ws-gagnee";
    if (/retenu/i.test(r)) return "ws-encours";
    if (/perdu/i.test(r)) return "ws-perdue";
    if (/retrait|annul/i.test(r)) return "ws-perdue";
    return "ws-qualifier";
  }

  function renderSuivi() {
    const tout = soumissions();
    renderSuiviFiliales(tout);
    const all = tout.filter(o => {
      if (!suiviFilter.filiale) return true;
      return (o.filiale || "") === (suiviFilter.filiale === "__none__" ? "" : suiviFilter.filiale);
    });
    const annees = [...new Set(all.map(o => String(o.date_limite || o.created_at || "").slice(0, 4)).filter(Boolean))].sort().reverse();
    const sel = $("#suivi-annee");
    sel.innerHTML = '<option value="">Toutes</option>' + annees.map(a => `<option${suiviFilter.annee === a ? " selected" : ""}>${a}</option>`).join("");

    const rows = all.filter(o => {
      if (suiviFilter.annee && String(o.date_limite || o.created_at || "").slice(0, 4) !== suiviFilter.annee) return false;
      if (suiviFilter.resultat === "__encours") return !o.resultat || /attente|retenu/i.test(o.resultat);
      if (suiviFilter.resultat && (o.resultat || "") !== suiviFilter.resultat) return false;
      return true;
    });

    const gagnees = all.filter(o => /gagn/i.test(o.resultat || "") || o.statut_traitement === "Gagnée").length;
    const perdues = all.filter(o => /perdu/i.test(o.resultat || "") || o.statut_traitement === "Perdue").length;
    const attente = all.filter(o => !o.resultat || /attente|retenu/i.test(o.resultat)).length;
    const tranchees = gagnees + perdues;
    const taux = tranchees ? Math.round((gagnees / tranchees) * 100) : 0;

    $("#kpis-suivi").innerHTML = [
      { key: "s-all", label: "Offres déposées", value: all.length, hint: "Historique complet", ic: "flag", teinte: "dark", spark: serieTemporelle(all, "date_soumission", 6, 30) },
      { key: "s-win", label: "Gagnées", value: gagnees, hint: tranchees ? taux + " % des dossiers tranchés" : "Aucun résultat connu", ic: "trophy", teinte: "teal" },
      { key: "s-lost", label: "Perdues", value: perdues, hint: "Retours négatifs ou annulations", ic: "thumb-down", teinte: "crit" },
      { key: "s-wait", label: "En attente de résultat", value: attente, hint: "Dépouillement ou présélection", ic: "clock", teinte: "sky" }
    ].map(kpiTile).join("");
    animerCompteurs($("#kpis-suivi"));

    const chips = [{ k: "", l: "Toutes" }, { k: "__encours", l: "En cours d'évaluation" }].concat(RESULTATS.map(r => ({ k: r, l: r })));
    $("#suivi-filters").innerHTML = chips.map(c =>
      `<button type="button" class="chip${suiviFilter.resultat === c.k ? " is-active" : ""}" data-res="${esc(c.k)}">${esc(c.l)}</button>`).join("");

    $("#suivi-count").textContent = plural(rows.length, "soumission", "soumissions");
    $("#suivi-empty").hidden = rows.length > 0;
    $("#suivi-body").innerHTML = rows.map((o, i) => `
      <tr data-open="${esc(o.id)}">
        <td class="muted">${i + 1}</td>
        <td class="t-main"><div class="t-title" title="${esc(o.titre || "")}">${esc(o.titre || "")}</div>
          <div class="t-sub">${esc(o.secteur || "")}${o.source_id ? " · " + esc(sourceLabel(o.source_id)) : ""}</div></td>
        <td class="muted">${esc(o.emetteur || "—")}</td>
        <td class="muted">${esc(o.type || "—")}</td>
        <td class="muted nowrap">${esc(fmtDate(o.date_limite, { day: "2-digit", month: "2-digit", year: "numeric" }))}</td>
        <td class="muted nowrap">${esc(fmtDate(o.date_depouillement, { day: "2-digit", month: "2-digit", year: "numeric" }))}</td>
        <td class="muted nowrap">${esc(fmtDate(o.date_relance, { day: "2-digit", month: "2-digit", year: "numeric" }))}</td>
        <td class="t-comment" title="${esc(o.commentaire_suivi || "")}">${esc(o.commentaire_suivi || "")}</td>
        <td><span class="wstatus ${resultatCls(o.resultat)}">${esc(o.resultat || o.statut_traitement || "—")}</span></td>
      </tr>`).join("");
  }

  $("#suivi-filters").addEventListener("click", (e) => {
    const b = e.target.closest("[data-res]");
    if (!b) return;
    suiviFilter.resultat = b.dataset.res;
    renderSuivi();
  });
  $("#suivi-annee").addEventListener("change", (e) => { suiviFilter.annee = e.target.value; renderSuivi(); });

  // Saisie d'une offre déposée hors du logiciel (dossier reçu par mail, presse…)
  const soumissionDlg = $("#soumission-dialog");
  $("#soumission-add-btn").addEventListener("click", () => {
    if (!sb) { toast("Connectez d'abord le registre.", "error"); return; }
    $("#soumission-form").reset();
    soumissionDlg.showModal();
    $("#soumission-form").titre.focus();
  });

  $("#soumission-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!sb) { toast("Non connecté au registre.", "error"); return; }
    const v = Object.fromEntries(new FormData(e.target).entries());
    const resultat = v.resultat || "En attente";
    const statut = /gagn/i.test(resultat) ? "Gagnée" : /perdu|retrait|annul/i.test(resultat) ? "Perdue" : "Soumise";
    const row = {
      titre: v.titre.trim(), emetteur: v.emetteur.trim(), origine: v.origine, filiale: v.filiale || "",
      type: v.type, secteur: v.secteur || null, region: v.region || "National", zone: v.zone,
      montant: v.montant || null, date_publication: v.datePublication || null, date_limite: v.dateLimite || null,
      lien_source: v.lienSource || null,
      date_soumission: v.dateSoumission || null, date_depouillement: v.dateDepouillement || null,
      date_relance: v.dateRelance || null, resultat, commentaire_suivi: v.commentaireSuivi || null,
      statut_traitement: statut, assigne: v.assigne || "", source_id: "hors-logiciel",
      decision: "GO", decision_par: whoami || "Anonyme", decision_le: new Date().toISOString(),
      description: v.sourceLibre ? "Source : " + v.sourceLibre : null,
      created_by: whoami || "Anonyme"
    };
    const submit = e.target.querySelector('[type="submit"]');
    submit.disabled = true;
    const { error } = await sb.from("offers").insert(row);
    submit.disabled = false;
    if (error) { toast("Enregistrement impossible : " + error.message, "error"); return; }
    toast("Soumission ajoutée au suivi.", "success");
    soumissionDlg.close();
    loadOffers();
  });

  $("#export-suivi-btn").addEventListener("click", async () => {
    if (!await ensureLib("xlsx")) { toast("Module Excel introuvable : relancez « construire-exe.cmd » ou vérifiez la connexion.", "error"); return; }
    const rows = soumissions().map((o, i) => ({
      "#": i + 1,
      "Intitulé / Objet du marché": o.titre || "",
      "Autorité contractante": o.emetteur || "",
      "Type d'avis": o.type || "",
      "Secteur": o.secteur || "",
      "Source": sourceLabel(o.source_id),
      "Date de publication": o.date_publication || "",
      "Date limite de dépôt": o.date_limite || "",
      "Date de dépôt": o.date_soumission || "",
      "Date de dépouillement provisoire": o.date_depouillement || "",
      "Date de relance": o.date_relance || "",
      "Commentaire": o.commentaire_suivi || "",
      "Statut": o.resultat || o.statut_traitement || "",
      "Décision interne": o.decision || "",
      "Filiale A&A": o.filiale || "À qualifier",
      "Assigné à": o.assigne || ""
    }));
    if (!rows.length) { toast("Aucune soumission à exporter.", "info"); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map(k => ({ wch: k === "Intitulé / Objet du marché" ? 60 : Math.min(30, Math.max(12, k.length + 4)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Suivi des offres");
    const b64 = arrayBufferToBase64(XLSX.write(wb, { bookType: "xlsx", type: "array" }));
    const res = await window.aa.saveXlsx("aa-group-suivi-des-offres-" + new Date().toISOString().slice(0, 10) + ".xlsx", b64);
    if (res && res.saved) toast("Tableau de suivi exporté : " + res.filePath, "success", 6000);
  });

  // ======================================================================
  // Prospection (opportunités)
  // ======================================================================
  function scoreOf(o) {
    let total = 0, poids = 0;
    Object.entries(POIDS).forEach(([k, w]) => {
      const v = Number(o[k]);
      if (v >= 1 && v <= 5) { total += v * w; poids += w; }
    });
    return poids ? Math.round((total / poids) * 100) / 100 : null;
  }

  async function loadOpportunites() {
    if (!sb) return;
    const { data, error } = await sb.from("opportunites").select("*");
    if (error) return;
    OPPS = data || [];
    rafraichit("prospection");
    renderTabCounts();
  }

  function renderOpps() {
    const sort = $("#opp-sort").value || "score";
    const rows = OPPS.slice().sort((a, b) => {
      if (sort === "structure") return String(a.structure).localeCompare(String(b.structure), "fr");
      if (sort === "priorite") return String(a.priorite).localeCompare(String(b.priorite)) || (b.score || 0) - (a.score || 0);
      return (b.score || 0) - (a.score || 0);
    });
    const p1 = OPPS.filter(o => o.priorite === "P1").length;
    const actives = OPPS.filter(o => !["Abandonné", "Converti en offre"].includes(o.statut)).length;
    const moyenne = OPPS.length ? (OPPS.reduce((s, o) => s + (Number(o.score) || 0), 0) / OPPS.length).toFixed(2).replace(".", ",") : "—";

    $("#kpis-opp").innerHTML = [
      { key: "o-all", label: "Opportunités suivies", value: OPPS.length, hint: actives + " encore actives", ic: "target", teinte: "dark" },
      { key: "o-p1", label: "Priorité 1", value: p1, hint: "À attaquer en premier", ic: "flag", teinte: "crit" },
      { key: "o-score", label: "Score moyen", value: moyenne, hint: "Sur 5, pondéré", ic: "check", teinte: "teal" },
      { key: "o-conv", label: "Converties en offre", value: OPPS.filter(o => o.statut === "Converti en offre").length, hint: "Passées au registre", ic: "trophy", teinte: "blue" }
    ].map(kpiTile).join("");
    animerCompteurs($("#kpis-opp"));

    $("#opp-count").textContent = plural(rows.length, "opportunité", "opportunités");
    $("#opp-empty").hidden = rows.length > 0;
    $("#opp-grid").innerHTML = rows.map(oppCardHtml).join("");
  }

  // ----------------------------------------------------------------------
  // La carte d'opportunité, calquée sur la carte d'offre
  //
  // Même gabarit, mêmes classes, donc le même habillage : choisir « Ardoise »
  // dans les Paramètres teinte désormais les deux onglets, et non plus le seul
  // registre. Une opportunité n'ayant pas de filiale, c'est la priorité qui
  // alimente la couleur d'accent.
  // ----------------------------------------------------------------------
  const PRIO_MOT = { P1: "à attaquer", P2: "à suivre", P3: "à surveiller" };
  const STATUT_OPP_CLS = {
    "À contacter": "ws-nouvelle",
    "Relation établie": "ws-qualifier",
    "Note envoyée": "ws-encours",
    "Rendez-vous obtenu": "ws-soumise",
    "Converti en offre": "ws-gagnee",
    "Abandonné": "ws-perdue"
  };

  /** La source de l'opportunité, dans la même puce que la provenance d'une offre. */
  function sourceOppChip(o) {
    const texte = (o.source || "").trim();
    return `<span class="prov is-manuel" title="${esc(texte ? "Source : " + texte : "Aucune source renseignée pour cette opportunité")}">
      ${icon("file")}<span>${esc(texte || "Source non renseignée")}</span></span>`;
  }

  /**
   * Le score occupe la place de l'échéance : même pastille, en bas à droite.
   * Le chiffre est écrit, donc la couleur ne fait que doubler l'information.
   */
  function scorePill(o) {
    const s = Number(o.score);
    if (!Number.isFinite(s)) return `<span class="due note-vide">${icon("target")}Non noté</span>`;
    const niveau = s >= 4 ? "note-haute" : s >= 3 ? "note-moyenne" : "note-basse";
    return `<span class="due ${niveau}" title="Score pondéré : ${String(s).replace(".", ",")} sur 5">
      ${icon("target")}${esc(String(s).replace(".", ","))} / 5</span>`;
  }

  function oppCardHtml(o) {
    const pr = String(o.priorite || "P2").toUpperCase();
    const statut = o.statut || "À contacter";
    return `
      <button type="button" class="card opp-card prio-${esc(pr.toLowerCase())}" data-opp="${esc(o.id)}">
        <div class="card-top">
          <span class="fbadge">${esc(pr)}${PRIO_MOT[pr] ? " · " + PRIO_MOT[pr] : ""}</span>
          ${o.livrable ? `<span class="tag">${esc(o.livrable)}</span>` : ""}
        </div>
        <h3>${esc(o.structure || "(structure sans nom)")}</h3>
        <div class="emitter">${esc(o.besoin || "Besoin non renseigné")}</div>
        <div class="card-prov">${sourceOppChip(o)}</div>
        <div class="card-meta">
          <span>${icon("target")}${esc(o.offre_aa || "Offre A&A à formuler")}</span>
          ${o.angle ? `<span>${icon("route")}${esc(o.angle)}</span>` : ""}
        </div>
        <div class="card-foot">
          <div class="card-foot-left">
            <span class="wstatus ${STATUT_OPP_CLS[statut] || "ws-qualifier"}">${esc(statut)}</span>
            ${o.responsable ? `<span class="avatar sm" title="Suivie par ${esc(o.responsable)}">${esc(initials(o.responsable))}</span>` : ""}
          </div>
          ${scorePill(o)}
        </div>
      </button>`;
  }

  $("#opp-sort").addEventListener("change", renderOpps);

  const oppDlg = $("#opp-dialog");
  const oppForm = $("#opp-form");

  function oppLiveScore() {
    const v = Object.fromEntries(new FormData(oppForm).entries());
    const sc = scoreOf(v);
    $("#opp-score").textContent = sc != null ? String(sc).replace(".", ",") + " / 5" : "—";
  }
  oppForm.addEventListener("input", () => { oppLiveScore(); renderSuggestion(null); });
  oppForm.addEventListener("change", () => renderSuggestion(null));

  function openOpp(o) {
    oppForm.reset();
    $("#opp-dialog-title").textContent = o ? o.structure : "Nouvelle opportunité";
    $("#opp-delete").hidden = !o;
    if (o) {
      ["id", "structure", "priorite", "besoin", "offre_aa", "angle", "livrable", "statut", "responsable", "note", "fit", "relation", "financement", "urgence", "concurrence"].forEach(k => {
        if (oppForm[k]) oppForm[k].value = o[k] == null ? "" : o[k];
      });
    }
    oppLiveScore();
    renderSuggestion(o);
    oppDlg.showModal();
  }

  $("#opp-add-btn").addEventListener("click", () => openOpp(null));
  $("#opp-grid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-opp]");
    if (b) openOpp(OPPS.find(o => o.id === b.dataset.opp));
  });

  oppForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!sb) { toast("Non connecté au registre.", "error"); return; }
    const v = Object.fromEntries(new FormData(oppForm).entries());
    const num = (x) => (x === "" || x == null ? null : Number(x));
    const row = {
      structure: v.structure.trim(), priorite: v.priorite, besoin: v.besoin || null,
      offre_aa: v.offre_aa || null, angle: v.angle || null, livrable: v.livrable || null,
      statut: v.statut, responsable: v.responsable || null, note: v.note || null,
      fit: num(v.fit), relation: num(v.relation), financement: num(v.financement),
      urgence: num(v.urgence), concurrence: num(v.concurrence)
    };
    row.score = scoreOf(row);
    // On garde la suggestion à côté de la note retenue : l'écart est
    // l'information la plus utile six mois plus tard.
    if (suggestionCourante) {
      CRITERES.forEach(c => { row[c.key + "_suggere"] = suggestionCourante[c.key].note; });
      row.score_suggere = suggestionCourante.score;
      row.suggestion_motifs = CRITERES.map(c => c.label + " : " + suggestionCourante[c.key].motif).join("\n");
      if (row.score != null && row.score_suggere != null && Math.abs(row.score - row.score_suggere) >= 0.01) {
        row.arbitre_par = whoami || "Anonyme";
        row.arbitre_le = new Date().toISOString();
      }
    }
    row.motif_arbitrage = (v.motif_arbitrage || "").trim() || null;
    const submit = oppForm.querySelector('[type="submit"]');
    submit.disabled = true;
    const { error } = v.id
      ? await sb.from("opportunites").update(row).eq("id", v.id)
      : await sb.from("opportunites").insert(Object.assign(row, { created_by: whoami || "Anonyme" }));
    submit.disabled = false;
    if (error) { toast(/duplicate|unique/i.test(error.message) ? "Cette structure est déjà suivie." : "Enregistrement impossible : " + error.message, "error"); return; }
    toast(v.id ? "Opportunité mise à jour." : "Opportunité ajoutée.", "success");
    oppDlg.close();
    loadOpportunites();
  });

  $("#opp-delete").addEventListener("click", async (e) => {
    const id = oppForm.id.value;
    if (!id) return;
    const btn = e.currentTarget;
    if (!btn.dataset.confirm) {
      btn.dataset.confirm = "1";
      btn.classList.add("is-danger");
      toast("Cliquez à nouveau pour supprimer cette opportunité.", "info", 3500);
      setTimeout(() => { delete btn.dataset.confirm; btn.classList.remove("is-danger"); }, 4000);
      return;
    }
    const { error } = await sb.from("opportunites").delete().eq("id", id);
    if (error) { toast("Suppression impossible : " + error.message, "error"); return; }
    toast("Opportunité supprimée.", "success");
    oppDlg.close();
    loadOpportunites();
  });

  $("#export-opp-btn").addEventListener("click", async () => {
    if (!await ensureLib("xlsx")) { toast("Module Excel introuvable : relancez « construire-exe.cmd » ou vérifiez la connexion.", "error"); return; }
    const rows = OPPS.slice().sort((a, b) => (b.score || 0) - (a.score || 0)).map(o => ({
      "Priorité": o.priorite || "", "Structure": o.structure, "Besoin identifié": o.besoin || "",
      "Offre A&A correspondante": o.offre_aa || "", "Angle d'approche": o.angle || "",
      "Livrable type": o.livrable || "", "Fit": o.fit || "", "Relation": o.relation || "",
      "Financement": o.financement || "", "Urgence": o.urgence || "", "Concurrence": o.concurrence || "",
      "Score pondéré /5": o.score || "", "Statut": o.statut || "", "Responsable": o.responsable || "", "Note": o.note || ""
    }));
    if (!rows.length) { toast("Aucune opportunité à exporter.", "info"); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map(k => ({ wch: /Besoin|Offre|Angle|Livrable/.test(k) ? 45 : 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Opportunités");
    const b64 = arrayBufferToBase64(XLSX.write(wb, { bookType: "xlsx", type: "array" }));
    const res = await window.aa.saveXlsx("aa-group-opportunites-" + new Date().toISOString().slice(0, 10) + ".xlsx", b64);
    if (res && res.saved) toast("Opportunités exportées : " + res.filePath, "success", 6000);
  });

  // ======================================================================
  // Carnet de contacts
  // ======================================================================
  const contactsDlg = $("#contacts-dialog");

  async function loadContacts() {
    if (!sb) return;
    const { data, error } = await sb.from("contacts").select("*").order("nom", { ascending: true });
    if (error) return;
    CONTACTS = data || [];
    renderContacts();
  }

  function renderContacts() {
    const box = $("#contacts-list");
    if (!box) return;
    box.innerHTML = CONTACTS.length ? CONTACTS.map(c => `
      <div class="contact-row${c.actif ? "" : " is-off"}">
        <span class="avatar sm">${esc(initials(c.nom))}</span>
        <div class="src-main">
          <div class="src-name">${esc(c.nom)}${c.par_defaut ? '<span class="tag">par défaut</span>' : ""}</div>
          <div class="src-url">${esc(c.email)}${c.fonction ? " · " + esc(c.fonction) : ""}</div>
        </div>
        <label class="src-toggle"><input type="checkbox" data-contact-toggle="${esc(c.id)}"${c.actif ? " checked" : ""}><span>${c.actif ? "Actif" : "Inactif"}</span></label>
        <button class="icon-btn" type="button" data-admin-only data-contact-delete="${esc(c.id)}" title="Supprimer">${icon("trash")}</button>
      </div>`).join("")
      : '<div class="sources-empty">' + icon("users") + '<p class="state-title">Carnet vide</p><p class="muted-line">Ajoutez les personnes à consulter pour les décisions GO / NO GO.</p></div>';
  }

  $("#contacts-btn").addEventListener("click", async () => {
    if (!sb) { toast("Connectez d'abord le registre.", "error"); return; }
    contactsDlg.showModal();
    await loadContacts();
  });

  $("#contact-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target).entries());
    const { error } = await sb.from("contacts").insert({
      nom: v.nom.trim(), email: v.email.trim().toLowerCase(), fonction: v.fonction || null,
      filiale: v.filiale || null, par_defaut: !!v.parDefaut, actif: true, created_by: whoami || "Anonyme"
    });
    if (error) { toast(/duplicate|unique/i.test(error.message) ? "Cette adresse est déjà au carnet." : "Ajout impossible : " + error.message, "error"); return; }
    toast("Contact ajouté.", "success");
    e.target.reset();
    loadContacts();
  });

  $("#contacts-list").addEventListener("change", async (e) => {
    const cb = e.target.closest("[data-contact-toggle]");
    if (!cb) return;
    const { error } = await sb.from("contacts").update({ actif: cb.checked }).eq("id", cb.dataset.contactToggle);
    if (error) { toast("Modification impossible : " + error.message, "error"); cb.checked = !cb.checked; return; }
    loadContacts();
  });

  $("#contacts-list").addEventListener("click", async (e) => {
    const del = e.target.closest("[data-contact-delete]");
    if (!del) return;
    if (!del.dataset.confirm) {
      del.dataset.confirm = "1";
      del.classList.add("is-danger");
      setTimeout(() => { delete del.dataset.confirm; del.classList.remove("is-danger"); }, 4000);
      toast("Cliquez une seconde fois pour supprimer ce contact.", "info", 3500);
      return;
    }
    const { error } = await sb.from("contacts").delete().eq("id", del.dataset.contactDelete);
    if (error) { toast("Suppression impossible : " + error.message, "error"); return; }
    loadContacts();
  });

  // ======================================================================
  // Arbitrage GO / NO GO
  // ======================================================================
  const askDlg = $("#ask-dialog");

  async function loadVotes(offerId) {
    if (!sb) return;
    const { data, error } = await sb.from("offer_votes").select("*").eq("offer_id", offerId).order("created_at", { ascending: false });
    if (currentDetailId !== offerId) return;
    VOTES = error ? [] : (data || []);
    renderVotes();
  }

  function renderVotes() {
    const box = $("#dlg-votes");
    if (!VOTES.length) { box.innerHTML = '<p class="muted-line">Aucun avis enregistré pour le moment.</p>'; return; }
    box.innerHTML = VOTES.map(v => `
      <div class="vote v-${v.avis === "GO" ? "go" : v.avis === "NO GO" ? "nogo" : "neutre"}">
        <span class="vote-avis">${esc(v.avis)}</span>
        <div class="vote-main"><span class="avatar sm">${esc(initials(v.nom))}</span> <b>${esc(v.nom)}</b>${v.motif ? " — " + esc(v.motif) : ""}</div>
        <span class="vote-date">${esc(fmtDate(v.created_at, { day: "numeric", month: "short" }))}</span>
      </div>`).join("");
  }

  $("#vote-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentDetailId) { toast("Ouvrez d'abord la fiche d'une offre.", "error"); return; }
    if (!sb) { toast("Registre non connecté : l'avis ne peut pas être enregistré.", "error"); return; }
    const v = Object.fromEntries(new FormData(e.target).entries());
    if (!String(v.nom || "").trim()) { toast("Indiquez le nom de l'auteur de l'avis.", "info"); return; }
    const { error } = await sb.from("offer_votes").insert({
      offer_id: currentDetailId, nom: v.nom.trim(), avis: v.avis, motif: v.motif || null
    });
    if (error) { toast("Avis non enregistré : " + error.message, "error"); return; }
    e.target.reset();
    loadVotes(currentDetailId);
    toast("Avis enregistré.", "success", 2500);
  });

  async function trancher(decision) {
    if (!currentDetailId) return;
    const o = OFFERS.find(x => x.id === currentDetailId);
    const patch = {
      decision,
      decision_par: whoami || "Anonyme",
      decision_le: new Date().toISOString()
    };
    if (decision === "NO GO" && o && !["Gagnée", "Perdue"].includes(o.statut_traitement)) patch.statut_traitement = "Perdue";
    if (decision === "GO" && o && o.statut_traitement === "Nouvelle") patch.statut_traitement = "En cours";
    if (await saveField(currentDetailId, patch)) toast("Décision enregistrée : " + decision + ".", "success");
  }
  $("#dlg-go").addEventListener("click", () => trancher("GO"));
  $("#dlg-nogo").addEventListener("click", () => trancher("NO GO"));

  function mailBody(o) {
    const u = urgency(o.date_limite);
    const lignes = [
      "Bonjour,",
      "",
      "Merci de vous prononcer GO / NO GO sur l'offre suivante :",
      "",
      "Intitulé : " + (o.titre || ""),
      "Autorité contractante : " + (o.emetteur || "—") + (o.origine ? " (" + o.origine + ")" : ""),
      "Type d'avis : " + (o.type || "—"),
      "Secteur : " + (o.secteur || "—") + " · Région : " + (o.region || "—"),
      "Montant indicatif : " + (o.montant || "non précisé"),
      "Date limite de dépôt : " + fmtDate(o.date_limite, { day: "numeric", month: "long", year: "numeric" }) + " (" + u.label + ")",
      "Filiale pressentie : " + (o.filiale || "à qualifier"),
      ""
    ];
    if (o.criteres) lignes.push("Critères d'éligibilité : " + o.criteres, "");
    if (o.description) lignes.push("Objet : " + String(o.description).slice(0, 600), "");
    if (o.lien_source) lignes.push("Source : " + o.lien_source, "");
    lignes.push(
      "Merci de répondre par GO ou NO GO, en précisant le motif (capacité, références, rentabilité, délai).",
      "",
      "Cordialement,",
      whoami || "",
      "A&A Group — Registre des Offres"
    );
    return lignes.join("\n");
  }

  $("#dlg-ask").addEventListener("click", () => {
    const o = OFFERS.find(x => x.id === currentDetailId);
    if (!o) return;
    const actifs = CONTACTS.filter(c => c.actif);
    if (!actifs.length) {
      toast("Ajoutez d'abord des contacts dans le carnet.", "info");
      contactsDlg.showModal();
      loadContacts();
      return;
    }
    $("#ask-recipients").innerHTML = actifs.map(c => `
      <label class="recipient"><input type="checkbox" value="${esc(c.email)}" data-nom="${esc(c.nom)}"${c.par_defaut ? " checked" : ""}>
        <span><b>${esc(c.nom)}</b><em>${esc(c.email)}</em></span></label>`).join("");
    $("#ask-objet").value = "[GO / NO GO] " + (o.titre || "").slice(0, 90) + " — échéance " + fmtDate(o.date_limite, { day: "2-digit", month: "2-digit", year: "numeric" });
    $("#ask-corps").value = mailBody(o);
    askDlg.showModal();
  });

  $("#ask-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const o = OFFERS.find(x => x.id === currentDetailId);
    if (!o) return;
    const dest = $$("#ask-recipients input:checked").map(i => i.value);
    if (!dest.length) { toast("Sélectionnez au moins un destinataire.", "info"); return; }
    const objet = $("#ask-objet").value;
    const corps = $("#ask-corps").value;
    const bouton = $("#ask-envoyer");
    bouton.disabled = true; bouton.classList.add("is-busy");
    const envoi = await window.aa.courriel.envoyer({ destinataires: dest, objet: objet, corps: corps });
    bouton.disabled = false; bouton.classList.remove("is-busy");

    if (envoi && envoi.nonConfigure) {
      // Faute de réglages, on retombe sur le brouillon — mais sans prétendre
      // que le message est parti. Les destinataires se séparent par une
      // virgule : le point-virgule encodé n'était compris par personne.
      const lien = "mailto:" + dest.map(encodeURIComponent).join(",") +
        "?subject=" + encodeURIComponent(objet) + "&body=" + encodeURIComponent(corps);
      if (lien.length > 30000) { toast("Message trop long : raccourcissez-le.", "error"); return; }
      if (window.aa.openExternal) window.aa.openExternal(lien); else window.open(lien);
      toast("Messagerie non configurée : un brouillon a été ouvert, à vous de l'envoyer. Réglez l'envoi direct dans les Paramètres.", "info", 9000);
    } else if (!envoi || !envoi.ok) {
      toast("Envoi impossible : " + ((envoi && envoi.message) || "cause inconnue"), "error", 9000);
      return;   // la fenêtre reste ouverte : le message n'est pas perdu
    } else {
      toast(envoi.message + " — " + plural(dest.length, "destinataire servi", "destinataires servis") + ".", "success", 6000);
    }

    await sb.from("offer_mails").insert({ offer_id: o.id, objet, destinataires: dest.join(", "), envoye_par: whoami || "Anonyme" });
    if (o.decision === "Non arbitrée" || !o.decision) await saveField(o.id, { decision: "En arbitrage" });
    askDlg.close();
  });

  // ======================================================================
  // Sources de veille (table `sources`)
  // ======================================================================
  const sourcesDlg = $("#sources-dialog");

  async function loadSources() {
    if (!sb) return;
    const { data, error } = await sb.from("sources").select("*").order("nom", { ascending: true });
    if (error) { $("#sources-list").innerHTML = `<p class="muted-line">Sources indisponibles (${esc(error.message)}).</p>`; return; }
    SOURCES = data || [];
    renderSources();
    renderVeilleSourcesLink();
  }

  function renderVeilleSourcesLink() {
    const actives = SOURCES.filter(s => s.actif).length;
    $("#veille-sources-link").textContent = actives
      ? "Gérer les sources (" + actives + ")"
      : "Ajouter une source";
  }

  // ======================================================================
  // Catalogue de sources — Sénégal, sous-région et bailleurs
  // ======================================================================
  // Adresses vérifiées le 12/09/2026. Chaque entrée est un préréglage : elle
  // devient une ligne ordinaire de la table `sources`, modifiable ou
  // supprimable ensuite comme n'importe quelle source ajoutée à la main.
  const CATALOGUE = [
    {
      nom: "BAD — Avis à manifestation d'intérêt",
      url: "https://www.afdb.org/fr/documents/project-related-procurement/procurement-notices/request-for-expression-of-interest",
      type: "page",
      mots_cles: "Sénégal, Senegal, Multinational, UEMOA, CEDEAO, Afrique de l'Ouest, West Africa",
      type_offre: "Étude / Conseil stratégique",
      note: "Le principal gisement d'AMI de la sous-région. Le pays figure dans le titre de chaque avis, d'où le filtre par mots-clés.",
      recommandee: true
    },
    {
      nom: "BAD — Marchés institutionnels",
      url: "https://www.afdb.org/fr/about-us/corporate-procurement/procurement-notices/prospective-solicitations",
      type: "page",
      mots_cles: "consultant, cabinet, étude, assistance technique, formation, audit, évaluation, stratégie",
      type_offre: "Assistance technique",
      note: "Achats propres de la Banque (hors projets), souvent des missions de conseil."
    },
    {
      nom: "BCEAO — Appels d'offres et consultations",
      url: "https://www.bceao.int/fr/appels-offres/appels-offres-marches-publics-achats",
      type: "page",
      mots_cles: "consultant, cabinet, bureau d'étude, étude, audit, formation, stratégie, manifestation d'intérêt, évaluation",
      note: "Beaucoup de travaux et fournitures : le filtre ne garde que les missions intellectuelles.",
      recommandee: true
    },
    {
      nom: "UEMOA — Manifestations d'intérêt",
      url: "https://www.uemoa.int/manifestation_d_interet",
      type: "js",
      type_offre: "Étude / Conseil stratégique",
      note: "Rubrique « Manifestation d'intérêt » du site de la Commission.",
      recommandee: true
    },
    {
      nom: "CEDEAO — Passation de marchés",
      url: "https://www.ecowas.int/procurement/?lang=fr",
      type: "page",
      note: "Publication irrégulière : quelques avis par trimestre."
    },
    {
      nom: "BOAD — Appels d'offres et AMI",
      url: "https://www.boad.org/fr/opportunites/appels-doffre/",
      type: "js",
      type_offre: "Financement / PPP",
      note: "Cartes « Voir plus » : l'objet de l'avis est lu dans la carte."
    },
    {
      nom: "Banque mondiale — avis Sénégal",
      url: "https://projects.worldbank.org/en/projects-operations/procurement?srce=both&project_ctry_name_exact=Senegal",
      type: "js",
      note: "Liste filtrée sur les projets au Sénégal ; les avis d'attribution sont écartés par le mapping.",
      recommandee: true
    },
    {
      nom: "PNUD — Avis de passation de marchés",
      url: "https://procurement-notices.undp.org/",
      type: "page",
      mots_cles: "Senegal, Mali, Mauritania, Mauritanie, Gambia, Gambie, Guinea, Guinée, Côte d'Ivoire, Cote d'Ivoire, Burkina, Niger, Togo, Benin, Bénin, Cabo Verde",
      origine: "État",
      note: "Table mondiale : le filtre ne retient que les avis des bureaux du Sénégal et de la sous-région.",
      recommandee: true
    },
    {
      nom: "Marchés publics du Sénégal — avis généraux",
      url: "http://www.marchespublics.sn/index.php?option=com_avisgeneral&task=listertype&idtype=5&Itemid=111",
      type: "page",
      note: "Portail officiel (DCMP). Les avis généraux annoncent les marchés à venir.",
      recommandee: true
    },
    {
      nom: "Marchés du Sénégal",
      url: "https://marchesdusenegal.com/tenders",
      type: "page",
      mots_cles: "manifestation d'intérêt, consultant, cabinet, étude, assistance technique, formation, stratégie, audit, évaluation",
      note: "Agrégateur national mis à jour en continu.",
      recommandee: true
    }
  ];

  // Sites que l'application ne lit pas elle-même : collecte automatique
  // interdite par leurs conditions d'utilisation, barrière anti-robots, ou
  // liste sans fiche par avis. Ils s'ouvrent en un clic dans le navigateur du
  // poste — depuis la Veille (« À consulter dans votre navigateur ») comme
  // depuis l'écran des sources. `court` est l'étiquette du bouton de la Veille.
  const SOURCES_MANUELLES = [
    {
      nom: "Development AID — appels d'offres au Sénégal",
      court: "Development AID · Sénégal",
      site: "developmentaid",
      url: "https://www.developmentaid.org/tenders/search?hiddenAdvancedFilters=0&locations=54",
      raison: "Passez la vérification du site et connectez-vous (une fois), puis Registre → Importer cette page (Ctrl+I). Les TDR que vous téléchargez depuis la fiche d'une offre y sont joints automatiquement."
    },
    {
      nom: "UNGM — 32 agences des Nations unies",
      court: "UNGM",
      site: "ungm",
      url: "https://www.ungm.org/Public/Notice",
      raison: "Filtrez sur « Senegal » puis Ctrl+I : une liste n'importe que les avis d'Afrique ; la fiche d'un avis s'importe quel que soit le pays. Connectez-vous à votre compte UNGM pour les documents."
    },
    {
      nom: "Banque mondiale — avis Sénégal",
      court: "Banque mondiale · Sénégal",
      site: "banquemondiale",
      url: "https://projects.worldbank.org/en/projects-operations/procurement?srce=both&project_ctry_name_exact=Senegal",
      raison: "Ouvrez la fiche d'un avis puis Ctrl+I : elle donne l'échéance, que la liste n'affiche pas. Les avis d'attribution (Contract Award) ne sont jamais importés."
    },
    {
      nom: "Côte d'Ivoire — DGMP, avis d'appels d'offres",
      court: "DGMP Côte d'Ivoire",
      site: "dgmpci",
      url: "https://www.marchespublics.ci/appel_offre",
      raison: "Ctrl+I lit tout le tableau (pas seulement les 10 lignes affichées) et ne garde que les avis encore ouverts, dans les métiers du groupe. Pas de fiche par avis : le dossier se retire auprès de l'autorité contractante."
    },
    {
      nom: "LinkedIn — publications « manifestation d'intérêt » Sénégal",
      court: "LinkedIn · AMI Sénégal",
      site: "linkedin",
      url: "https://www.linkedin.com/search/results/content/?keywords=%22manifestation%20d%27int%C3%A9r%C3%AAt%22%20S%C3%A9n%C3%A9gal&sortBy=%22date_posted%22",
      raison: "Une publication à la fois : ouvrez-la seule (cliquez sur sa date) ou surlignez son texte, puis Ctrl+I. LinkedIn interdit les outils qui copient son contenu : jamais le fil ni une page de résultats entière."
    },
    {
      nom: "LinkedIn — missions de consultant au Sénégal",
      court: "LinkedIn · missions",
      site: "linkedin",
      url: "https://www.linkedin.com/jobs/search/?keywords=consultant%20strat%C3%A9gie&location=S%C3%A9n%C3%A9gal&f_TPR=r604800",
      raison: "Cliquez sur une offre de la liste pour l'afficher, puis Ctrl+I : seule l'offre affichée est importée."
    }
  ];

  function urlsSuivies() {
    return new Set(SOURCES.map(s => String(s.url || "").replace(/\/+$/, "").toLowerCase()));
  }

  function renderCatalogue() {
    const suivies = urlsSuivies();
    const restantes = CATALOGUE.filter(c => !suivies.has(c.url.replace(/\/+$/, "").toLowerCase()));
    $("#catalogue-n").textContent = restantes.length ? restantes.length + " à ajouter" : "toutes ajoutées";
    $("#catalogue-n").classList.toggle("is-done", restantes.length === 0);

    $("#catalogue-list").innerHTML = CATALOGUE.map((c, i) => {
      const deja = suivies.has(c.url.replace(/\/+$/, "").toLowerCase());
      return `<label class="cat-row${deja ? " is-done" : ""}">
        <input type="checkbox" data-cat="${i}"${deja ? " disabled" : c.recommandee ? " checked" : ""}>
        <span class="cat-main">
          <span class="cat-name">${esc(c.nom)}${c.recommandee && !deja ? '<span class="tag">conseillée</span>' : ""}</span>
          <span class="cat-note">${esc(c.note || "")}</span>
        </span>
        <span class="cat-state">${deja ? "déjà suivie" : ""}</span>
      </label>`;
    }).join("");

    $("#manuel-list").innerHTML = SOURCES_MANUELLES.map((m, i) => `
      <div class="manuel-row">
        <div class="manuel-main">
          <div class="cat-name">${esc(m.nom)}</div>
          <div class="cat-note">${esc(m.raison)}</div>
        </div>
        ${m.site
          ? `<button class="btn small" type="button" data-consulter="${i}">${icon("external")}Ouvrir et importer</button>`
          : `<button class="btn small" type="button" data-manuel="${esc(m.url)}">${icon("external")}Ouvrir</button>`}
      </div>`).join("");
  }

  // ----------------------------------------------- Fenêtres de consultation
  // Development AID, UNGM, Banque mondiale, DGMP Côte d'Ivoire, LinkedIn :
  // chaque site s'ouvre dans une fenêtre du logiciel. Vous naviguez (et vous
  // connectez s'il le faut) ; « Registre → Importer cette page » (Ctrl+I)
  // enregistre ce que vous voyez, après le même barrage que la veille. Les
  // TDR téléchargés depuis la fiche d'un avis y sont joints.
  // Development AID garde en plus la relève de ses alertes e-mail (Paramètres).
  const apiConsultation = () => window.aa.consultation || null;

  async function ouvreConsultation(m) {
    const api = apiConsultation();
    if (!api && m.site === "developmentaid" && window.aa.devaid) { await window.aa.devaid.ouvrir(whoami || ""); return; }
    if (!api) { toast("Fonction disponible dans l'application installée.", "info"); return; }
    const r = await api.ouvrir(m.site, whoami || "", m.url);
    if (r && r.ok === false) { toast(r.message || "Ouverture impossible.", "error"); return; }
    if (r && r.ok && !r.dejaOuverte) {
      const consigne = m.site !== "linkedin" ? "Naviguez, puis"
        : /\/jobs\//.test(m.url) ? "Connectez-vous, cliquez sur une offre pour l'afficher, puis"
        : "Connectez-vous, ouvrez une publication seule (cliquez sur sa date), puis";
      toast(m.court + " s'ouvre dans une fenêtre du logiciel. " + consigne + " Registre → Importer cette page (Ctrl+I).", "info", 8000);
    }
  }

  async function importePageEnregistree() {
    const api = apiConsultation() || window.aa.devaid;
    if (!api) { toast("Fonction disponible dans l'application installée.", "info"); return; }
    const r = await api.importerFichier(whoami || "");
    if (!r || r.annule) return;
    if (!r.ok) { toast(r.message || "Import impossible.", "error", 7000); return; }
    toast("Page " + (r.site || "") + " importée : " + (r.phrase || (r.nouvelles + " nouvelle(s) offre(s)")), r.nouvelles ? "success" : "info", 8000);
  }

  const apiInfos = apiConsultation() || window.aa.devaid;
  if (apiInfos && apiInfos.surInfo) {
    apiInfos.surInfo((d) => { if (d && d.texte) toast(d.texte, d.nature || "info", 7000); });
  }

  function clicManuel(e) {
    const c = e.target.closest("[data-consulter]");
    if (c) { ouvreConsultation(SOURCES_MANUELLES[Number(c.dataset.consulter)]); return; }
    if (e.target.closest("[data-page-enregistree]")) { importePageEnregistree(); return; }
    const b = e.target.closest("[data-manuel]");
    if (b) window.aa.openExternal(b.dataset.manuel);
  }
  $("#manuel-list").addEventListener("click", clicManuel);

  // Les mêmes, en boutons dans la Veille, sans passer par l'écran des sources.
  function renderVeilleManuels() {
    const box = $("#veille-manuels");
    if (!box) return;
    box.innerHTML = `<span class="vm-label">Consulter et importer :</span>` +
      SOURCES_MANUELLES.map((m, i) => m.site
        ? `<button class="vm-chip vm-import" type="button" data-consulter="${i}" title="${esc(m.raison)}">${icon("external")}${esc(m.court || m.nom)}<span class="vm-tag">importer</span></button>`
        : `<button class="vm-chip" type="button" data-manuel="${esc(m.url)}" title="${esc(m.raison)}">${icon("external")}${esc(m.court || m.nom)}</button>`).join("") +
      `<button class="vm-chip vm-discret" type="button" data-page-enregistree title="Importer une page enregistrée depuis votre navigateur (Ctrl+S) : Development AID, UNGM, Banque mondiale ou DGMP Côte d'Ivoire.">${icon("download")}Page enregistrée…</button>`;
  }
  renderVeilleManuels();
  $("#veille-manuels").addEventListener("click", clicManuel);

  $("#catalogue-add").addEventListener("click", async (e) => {
    if (!sb) { toast("Non connecté au registre.", "error"); return; }
    const choisies = $$("#catalogue-list [data-cat]:checked:not(:disabled)").map(i => CATALOGUE[Number(i.dataset.cat)]);
    if (!choisies.length) { toast("Cochez au moins une source.", "info"); return; }
    const rows = choisies.map(c => ({
      nom: c.nom,
      url: c.url,
      type: c.type,
      mots_cles: c.mots_cles || null,
      type_offre: c.type_offre || null,
      secteur: c.secteur || null,
      region: c.region || "National",
      origine: c.origine || "État",
      note: c.note || null,
      actif: true,
      created_by: whoami || "Anonyme"
    }));
    e.target.disabled = true;
    const { error } = await sb.from("sources").insert(rows);
    e.target.disabled = false;
    if (error) {
      toast(/duplicate|unique/i.test(error.message) ? "Ces adresses sont déjà suivies." : "Ajout impossible : " + error.message, "error");
      return;
    }
    toast(plural(rows.length, "source ajoutée", "sources ajoutées") + ". Elles seront lues à la prochaine veille.", "success");
    loadSources();
  });

  function renderSources() {
    const box = $("#sources-list");
    if (!SOURCES.length) {
      box.innerHTML = `<div class="sources-empty">
        ${icon("radar")}
        <p class="state-title">Aucune source ajoutée</p>
        <p class="muted-line">L'application consulte déjà l'APS et SenOffre. Ajoutez ci-dessous les portails que vous suivez à la main.</p>
      </div>`;
      renderCatalogue();
      return;
    }
    renderCatalogue();
    box.innerHTML = SOURCES.map(src => {
      const statut = src.dernier_statut === "error" ? "error" : src.dernier_statut === "ok" ? "ok" : "";
      const last = src.derniere_collecte
        ? "Dernière lecture " + fmtTime(src.derniere_collecte) + (src.dernier_message ? " · " + src.dernier_message : "")
        : "Jamais consultée — sera lue à la prochaine veille.";
      return `<div class="source-row${src.actif ? "" : " is-off"}" data-src="${esc(src.id)}">
        <span class="src-type ${src.type === "js" ? "is-js" : src.type === "page" ? "is-page" : "rss"}">${src.type === "js" ? "JS" : src.type === "page" ? "PAGE" : "RSS"}</span>
        <div class="src-main">
          <div class="src-name">${esc(src.nom)}${src.mots_cles ? `<span class="tag">${esc(src.mots_cles)}</span>` : ""}</div>
          <div class="src-url" title="${esc(src.url)}">${esc(src.url)}</div>
          <div class="src-last ${statut}">${esc(last)}</div>
        </div>
        ${src.type === "js" ? `<button class="btn small src-session" type="button" data-src-session="${esc(src.id)}" title="Ouvrir le site pour vous y connecter">${icon("user")}<span>Se connecter</span></button>` : ""}
        <label class="src-toggle" title="${src.actif ? "Source active" : "Source en pause"}">
          <input type="checkbox" data-src-toggle="${esc(src.id)}"${src.actif ? " checked" : ""}${estAdmin() ? "" : " disabled"}>
          <span>${src.actif ? "Active" : "En pause"}</span>
        </label>
        <button class="icon-btn" type="button" data-admin-only data-src-delete="${esc(src.id)}" title="Supprimer">${icon("trash")}</button>
      </div>`;
    }).join("");
    majEtatSessions();
  }

  /**
   * Sources réservées aux abonnés : l'application ouvre le site dans une
   * fenêtre à elle, l'équipe s'y connecte, et la session reste sur le poste.
   * Le mot de passe est tapé dans le site, jamais dans le logiciel.
   */
  async function majEtatSessions() {
    if (!window.aa.veille) return;
    for (const src of SOURCES.filter(s => s.type === "js")) {
      let ouverte = false;
      try { ouverte = await window.aa.veille.session(src.id, src.url); } catch (_) {}
      const b = $(`[data-src-session="${src.id}"]`);
      if (!b) continue;
      b.classList.toggle("is-ouverte", !!ouverte);
      $("span", b).textContent = ouverte ? "Session ouverte" : "Se connecter";
      b.title = ouverte
        ? "La veille lit cette source comme un abonné. Cliquez pour rouvrir la page."
        : "Ouvrir le site pour vous y connecter : la veille verra ensuite ce que voit votre abonnement.";
    }
  }

  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-src-session]");
    if (!b || !window.aa.veille) return;
    const src = SOURCES.find(x => x.id === b.dataset.srcSession);
    if (!src) return;
    b.disabled = true;
    toast("Connectez-vous dans la fenêtre qui s'ouvre, puis refermez-la.", "info", 6000);
    try {
      const r = await window.aa.veille.connexion(src.id, src.url);
      if (r && r.connecte) toast("Session enregistrée : la veille lira cette source comme un abonné.", "success", 5000);
      else toast("Aucune session détectée — la source sera lue en visiteur.", "info", 5000);
    } catch (err) {
      toast("Connexion impossible : " + (err && err.message ? err.message : err), "error");
    } finally {
      b.disabled = false;
      majEtatSessions();
    }
  });

  async function openSources() {
    if (!sb) { toast("Connectez d'abord le registre.", "error"); return; }
    $("#sources-list").innerHTML = '<p class="muted-line">Chargement…</p>';
    sourcesDlg.showModal();
    await loadSources();
  }

  $("#sources-btn").addEventListener("click", openSources);
  $("#veille-sources-link").addEventListener("click", openSources);

  // Le mode « Flux RSS » proposé par défaut avait fait enregistrer une page
  // web comme flux : la lecture échouait sur le premier « & » du HTML. Tant
  // que la personne n'a pas choisi le mode elle-même, on le déduit de
  // l'adresse : seule une adresse qui ressemble à un flux reste en RSS.
  const formSource = $("#source-form");
  const ressembleAUnFlux = (u) => /(\/feed\b|\/rss\b|rss\.|\.rss\b|\.xml\b|atom|format=feed|type=rss)/i.test(u);
  formSource.elements.namedItem("type").addEventListener("change", () => { formSource.dataset.modeChoisi = "1"; });
  formSource.elements.namedItem("url").addEventListener("input", (e) => {
    if (formSource.dataset.modeChoisi) return;
    const u = e.target.value.trim();
    if (!u) return;
    formSource.elements.namedItem("type").value = ressembleAUnFlux(u) ? "rss" : "page";
  });

  $("#source-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!sb) { toast("Non connecté au registre.", "error"); return; }
    const v = Object.fromEntries(new FormData(e.target).entries());
    const row = {
      nom: v.nom.trim(),
      url: v.url.trim(),
      type: v.type,
      mots_cles: (v.motsCles || "").trim() || null,
      type_offre: v.typeOffre || null,
      secteur: v.secteur || null,
      region: v.region || null,
      origine: v.origine,
      note: (v.note || "").trim() || null,
      actif: true,
      created_by: whoami || "Anonyme"
    };
    const submit = e.target.querySelector('[type="submit"]');
    submit.disabled = true;
    const { error } = await sb.from("sources").insert(row);
    submit.disabled = false;
    if (error) {
      toast(/duplicate|unique/i.test(error.message) ? "Cette adresse est déjà suivie." : "Ajout impossible : " + error.message, "error");
      return;
    }
    toast("Source ajoutée. Elle sera lue à la prochaine veille.", "success");
    e.target.reset();
    delete e.target.dataset.modeChoisi;
    loadSources();
  });

  $("#sources-list").addEventListener("change", async (e) => {
    const cb = e.target.closest("[data-src-toggle]");
    if (!cb) return;
    const { error } = await sb.from("sources").update({ actif: cb.checked }).eq("id", cb.dataset.srcToggle);
    if (error) { toast("Modification impossible : " + error.message, "error"); cb.checked = !cb.checked; return; }
    toast(cb.checked ? "Source réactivée." : "Source mise en pause.", "success", 2500);
    loadSources();
  });

  $("#sources-list").addEventListener("click", async (e) => {
    const del = e.target.closest("[data-src-delete]");
    if (!del) return;
    if (!del.dataset.confirm) {
      del.dataset.confirm = "1";
      del.classList.add("is-danger");
      setTimeout(() => { delete del.dataset.confirm; del.classList.remove("is-danger"); }, 4000);
      toast("Cliquez une seconde fois pour supprimer cette source.", "info", 3500);
      return;
    }
    const { error } = await sb.from("sources").delete().eq("id", del.dataset.srcDelete);
    if (error) { toast("Suppression impossible : " + error.message, "error"); return; }
    toast("Source supprimée. Les offres déjà collectées restent au registre.", "success");
    loadSources();
  });

  $("#sources-run").addEventListener("click", () => {
    sourcesDlg.close();
    $("#refresh-btn").click();
  });

  // ======================================================================
  // Veille automatique
  // ======================================================================
  const veille = $("#veille");
  const refreshBtn = $("#refresh-btn");

  function setCollectorRunning(running) {
    ui.collectorRunning = running;
    refreshBtn.disabled = running;
    refreshBtn.classList.toggle("is-busy", running);
    $(".btn-label", refreshBtn).textContent = running ? "Veille en cours…" : "Actualiser la veille";
  }

  const railVeille = $("#rail-veille");

  /** Le rail reprend l'état de la veille : visible quel que soit l'onglet ouvert. */
  function syncRailVeille(when) {
    railVeille.dataset.state = veille.dataset.state || "idle";
    if (when !== undefined) $("#rail-veille-when").textContent = when;
    $("#rail-veille-text").textContent = $("#veille-text").textContent;
  }

  railVeille.addEventListener("click", () => {
    if (ui.collectorRunning) { setTab("veille"); return; }
    refreshBtn.click();
  });

  function upsertSourceChip(evt) {
    const box = $("#veille-sources");
    let chip = box.querySelector('[data-src="' + CSS.escape(evt.source) + '"]');
    if (!chip) { chip = document.createElement("span"); chip.dataset.src = evt.source; box.appendChild(chip); }
    chip.className = "src-chip " + evt.status;
    const label = esc(evt.label || evt.source);
    chip.innerHTML = evt.status === "running" ? `${label} · recherche…`
      : evt.status === "ok" ? `${label} · <b>${evt.itemsNew || 0}</b> nouvelle${evt.itemsNew > 1 ? "s" : ""} / ${evt.itemsFound || 0} lue${evt.itemsFound > 1 ? "s" : ""}`
      : `${label} · erreur`;
    chip.title = evt.error || "";
  }

  function renderCollectorResult(res) {
    if (!res) {
      veille.dataset.state = "idle";
      $("#veille-when").textContent = "";
      $("#veille-text").textContent = "La veille n'a pas encore été lancée sur ce poste. Cliquez sur « Actualiser la veille » pour chercher de nouvelles offres (APS, SenOffre).";
      $("#veille-error").hidden = true;
      syncRailVeille("Veille non lancée");
      return;
    }
    $("#veille-when").textContent = res.finishedAt ? "· dernière exécution " + fmtTime(res.finishedAt) : "";
    // L'assistant doit pouvoir répondre « où en est la veille ? ».
    {
      const nouvelles = (res.summary || []).reduce((t, r) => t + (r.itemsNew || 0), 0);
      derniereVeille = {
        quand: res.finishedAt ? fmtTime(res.finishedAt) : null,
        resume: res.ok === false ? "échec : " + (res.error || "cause inconnue")
              : nouvelles > 0 ? plural(nouvelles, "nouvelle offre", "nouvelles offres")
              : "aucune nouveauté"
      };
    }
    const errBox = $("#veille-error");
    $("#veille-sources").innerHTML = "";
    (res.summary || []).forEach(upsertSourceChip);

    if (!res.ok) {
      veille.dataset.state = "error";
      $("#veille-text").textContent = "La veille n'a pas pu s'exécuter.";
      errBox.textContent = res.error || "Erreur inconnue.";
      errBox.hidden = false;
      syncRailVeille("Veille en échec");
      return;
    }
    const totalNew = (res.summary || []).reduce((s, r) => s + (r.itemsNew || 0), 0);
    const failed = (res.summary || []).filter(r => r.status === "error");
    veille.dataset.state = failed.length && failed.length === (res.summary || []).length ? "error" : "ok";
    $("#veille-text").textContent = totalNew > 0
      ? plural(totalNew, "nouvelle offre ajoutée", "nouvelles offres ajoutées") + " au registre."
      : "Aucune nouvelle offre depuis la dernière collecte.";
    if (failed.length) {
      errBox.textContent = failed.map(r => (r.label || r.source) + " : " + r.error).join("\n");
      errBox.hidden = false;
    } else {
      errBox.hidden = true;
    }
    syncRailVeille(res.finishedAt ? "Veille " + fmtTime(res.finishedAt) : "Veille terminée");
  }

  window.aa.onCollectorStart(() => {
    setCollectorRunning(true);
    veille.dataset.state = "running";
    $("#veille-text").textContent = "Recherche de nouvelles offres en cours…";
    $("#veille-sources").innerHTML = "";
    $("#veille-error").hidden = true;
    syncRailVeille("Veille en cours");
  });
  window.aa.onCollectorProgress(upsertSourceChip);
  window.aa.onCollectorDone((res) => {
    setCollectorRunning(false);
    renderCollectorResult(res);
    if (!res.ok) {
      toast("La veille a échoué : " + res.error, "error");
    } else {
      const totalNew = (res.summary || []).reduce((s, r) => s + (r.itemsNew || 0), 0);
      toast(totalNew > 0 ? "Veille terminée : " + plural(totalNew, "nouvelle offre", "nouvelles offres") + "." : "Veille terminée : aucune nouveauté.", totalNew > 0 ? "success" : "info");
    }
    loadOffers(); // sans attendre le temps réel
  });

  refreshBtn.addEventListener("click", async () => {
    const cfg = await window.aa.getSettings();
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      toast("Configurez d'abord la connexion au registre.", "info");
      openSettings(false);
      return;
    }
    setCollectorRunning(true);
    try {
      await window.aa.runCollectorNow();
    } catch (e) {
      setCollectorRunning(false);
      renderCollectorResult({ ok: false, error: e && e.message ? e.message : String(e), finishedAt: new Date().toISOString() });
      toast("La veille a échoué : " + (e && e.message ? e.message : e), "error");
    }
  });

  // ======================================================================
  // Mise à jour automatique
  //
  // Le téléchargement est silencieux ; on n'interrompt personne. Le bandeau
  // n'apparaît qu'une fois la version prête, et l'installation attend que
  // l'utilisateur décide de redémarrer.
  // ======================================================================
  if (window.aa.onMajPrete) {
    window.aa.onMajPrete((info) => {
      const b = $("#rail-maj");
      if (!b) return;
      $("#rail-maj-text").textContent = "Version " + ((info && info.version) || "plus récente") + " — redémarrer";
      b.hidden = false;
    });
  }
  const majBtn = $("#rail-maj");
  if (majBtn) majBtn.addEventListener("click", () => window.aa.installerMaj && window.aa.installerMaj());

  // ----------------------------------------------- Paramètres → Mise à jour du logiciel
  // Plus d'exécutable à réinstaller à chaque version : on vérifie ici, la
  // nouvelle version se télécharge en arrière-plan, et un clic l'installe.
  let MAJ = null;
  function renderMaj(e) {
    if (e) MAJ = e;
    const carte = $("#maj-carte");
    if (!carte) return;
    const etat = MAJ || { etat: "indisponible", raison: "navigateur", version: "—",
      message: "La mise à jour se fait depuis l'application installée sur le poste." };
    carte.dataset.etat = etat.etat;
    $("#maj-version").textContent = etat.version || "—";
    $("#maj-message").textContent = etat.message || "Aucune vérification depuis l'ouverture.";
    const barre = $("#maj-barre");
    barre.hidden = etat.etat !== "telechargement";
    $("#maj-barre-plein").style.width = (etat.progression || 0) + "%";
    const verif = $("#maj-verifier");
    verif.hidden = etat.etat === "indisponible" || etat.etat === "prete";
    verif.disabled = etat.etat === "recherche" || etat.etat === "telechargement";
    $("span", verif).textContent = etat.etat === "recherche" ? "Recherche en cours…"
      : etat.etat === "telechargement" ? "Téléchargement " + (etat.progression || 0) + " %" : "Rechercher une mise à jour";
    $("#maj-installer").hidden = etat.etat !== "prete";
    $("#maj-derniere").textContent = etat.derniereVerification
      ? "Dernière vérification : " + fmtTime(etat.derniereVerification) + "." : "";
  }

  const apiMaj = window.aa.maj || null;
  if (apiMaj) {
    apiMaj.etat().then(renderMaj).catch(() => renderMaj());
    let annonce = null;
    apiMaj.surEtat((e) => {
      renderMaj(e);
      // Une seule annonce par version trouvée, pas une à chaque pourcentage.
      if (e && e.etat === "telechargement" && e.disponible && annonce !== e.disponible) {
        annonce = e.disponible;
        toast("Nouvelle version " + e.disponible + " trouvée : téléchargement en arrière-plan.", "info", 6000);
      }
      if (e && e.etat === "prete") toast("Version " + e.disponible + " prête — Paramètres → « Redémarrer et installer », ou à la prochaine fermeture.", "success", 8000);
    });
  } else {
    renderMaj();
  }

  $("#maj-verifier").addEventListener("click", async () => {
    if (!apiMaj) return;
    renderMaj(Object.assign({}, MAJ || {}, { etat: "recherche", message: "Recherche d'une nouvelle version…" }));
    const e = await apiMaj.verifier().catch(err => Object.assign({}, MAJ || {}, { etat: "erreur", message: String(err && err.message || err) }));
    renderMaj(e);
    if (e && e.etat === "a-jour") toast("Le logiciel est à jour (version " + e.version + ").", "success", 4000);
    else if (e && e.etat === "erreur") toast(e.message, "error", 8000);
  });
  $("#maj-installer").addEventListener("click", async () => {
    if (!apiMaj) return;
    const r = await apiMaj.installer();
    if (r && r.ok) toast("Installation de la nouvelle version : le logiciel va redémarrer.", "info", 6000);
    else toast((r && r.message) || "Installation impossible.", "error");
  });

  // ======================================================================
  // Export Excel
  // ======================================================================
  function arrayBufferToBase64(buf) {
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }

  $("#export-btn").addEventListener("click", async () => {
    if (!await ensureLib("xlsx")) { toast("Module Excel introuvable : relancez « construire-exe.cmd » ou vérifiez la connexion.", "error"); return; }
    const rows = currentResults().map(o => {
      const u = urgency(o.date_limite);
      return {
        "Filiale A&A": o.filiale || "À qualifier", "Titre": o.titre || "", "Émetteur": o.emetteur || "",
        "Origine": o.origine || "", "Type": o.type || "", "Secteur": o.secteur || "", "Région": o.region || "",
        "Montant indicatif": o.montant || "", "Date de publication": o.date_publication || "",
        "Date limite": o.date_limite || "", "Jours restants": isFinite(u.days) ? u.days : "",
        "Statut échéance": u.label, "Statut de suivi": o.statut_traitement || "Nouvelle",
        "Assigné à": o.assigne || "", "Source de la donnée": sourceLabel(o.source_id),
        "Documents joints": FILE_COUNTS[o.id] || 0, "Lien source": o.lien_source || "", "Contact": o.contact || ""
      };
    });
    if (!rows.length) { toast("Aucune offre à exporter avec ces filtres.", "info"); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map(k => ({ wch: Math.min(40, Math.max(12, k.length + 4)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Suivi des offres");
    const b64 = arrayBufferToBase64(XLSX.write(wb, { bookType: "xlsx", type: "array" }));
    const res = await window.aa.saveXlsx("aa-group-suivi-offres-" + new Date().toISOString().slice(0, 10) + ".xlsx", b64);
    if (res && res.saved) toast(plural(rows.length, "offre exportée", "offres exportées") + " : " + res.filePath, "success", 6000);
  });

  // ======================================================================
  // Assistant du registre
  //
  // Deux moteurs, un seul fil de discussion :
  //
  //   • l'IA (src/ia.js + electron/ia.js) quand une clé OpenAI est enregistrée
  //     sur ce poste. Elle ne reçoit pas le registre en bloc : elle dispose
  //     d'outils — définis plus bas — et va chercher elle-même ce dont elle a
  //     besoin. C'est ce qui lui donne la main sur le logiciel.
  //
  //   • le moteur local (src/assistant.js) sinon, ou dès que l'IA est
  //     injoignable. Il ne sait pas tout faire, mais il ne tombe jamais en
  //     panne : ni clé, ni réseau, ni facture.
  //
  // Rien ne s'écrit dans le registre sans un clic de l'utilisateur, quel que
  // soit le moteur. La suppression et l'arbitrage GO / NO GO ne sont exposés
  // à l'IA sous aucune forme.
  // ======================================================================
  const chatBubble = $("#chat-bubble");
  const chatPanel  = $("#chat-panel");
  const chatLog    = $("#chat-log");
  const chatTips   = $("#chat-tips");
  const chatInput  = $("#chat-input");
  const chatSous   = $("#chat-sous");
  let chatOuvert = false;
  let chatAccueilli = false;
  let chatDernierCote = null;     // pour regrouper les messages successifs
  let chatDernierJour = null;     // pour le séparateur de date
  let derniereVeille = null;      // { quand, resume } — alimenté par la veille
  let sessionIA = null;
  let iaEtat = { cleEnregistree: false, modele: "" };
  let piecesJointes = [];        // documents joints, en attente d'envoi

  // ------------------------------------------------------------ contextes

  function contexteAssistant() {
    return {
      offres: OFFERS,
      opportunites: OPPS,
      sources: SOURCES,
      profil: profil,
      whoami: whoami,
      veille: derniereVeille,
      aujourdhui: new Date()
    };
  }


  /** Valeurs distinctes réellement présentes au registre. */
  function valeursDe(champ) {
    const col = { statut: "statut_traitement" }[champ] || champ;
    const vues = new Map();
    OFFERS.forEach(o => {
      const v = col === "statut_traitement" ? (o[col] || "Nouvelle") : o[col];
      if (v) vues.set(v, (vues.get(v) || 0) + 1);
    });
    return Array.from(vues.entries()).sort((a, b) => b[1] - a[1]).map(([valeur, nombre]) => ({ valeur, nombre }));
  }

  /** Filtrage commun à tous les outils de lecture. */
  function filtreOffres(a) {
    a = a || {};
    const aujourd = jourDecale(0);
    const plafond = (typeof a.echeance_max_jours === "number") ? jourDecale(a.echeance_max_jours) : null;
    const texte = a.texte ? sansAccent(a.texte).split(/\s+/).filter(Boolean) : null;
    const emetteur = a.emetteur ? sansAccent(a.emetteur) : null;

    return OFFERS.filter(o => {
      if (a.statut && (o.statut_traitement || "Nouvelle") !== a.statut) return false;
      if (a.resultat && (o.resultat || "") !== a.resultat) return false;
      if (a.type && o.type !== a.type) return false;
      if (a.secteur && o.secteur !== a.secteur) return false;
      if (a.region && o.region !== a.region) return false;
      if (a.filiale && o.filiale !== a.filiale) return false;
      if (a.origine && o.origine !== a.origine) return false;
      if (emetteur && !sansAccent(o.emetteur).includes(emetteur)) return false;
      if (a.sans_echeance && o.date_limite) return false;
      if (a.en_retard) {
        if (!o.date_limite || o.date_limite >= aujourd) return false;
        if (["Gagnée", "Perdue"].includes(o.statut_traitement)) return false;
      }
      if (plafond) {
        if (!o.date_limite) return false;
        if (o.date_limite < aujourd || o.date_limite > plafond) return false;
      }
      if (texte) {
        const foin = sansAccent([o.titre, o.emetteur, o.description, o.secteur, o.type].join(" "));
        if (!texte.every(m => foin.includes(m))) return false;
      }
      return true;
    });
  }

  function parEcheance(rows) {
    return rows.slice().sort(compareEcheance);
  }

  /** Forme compacte envoyée à l'IA : tout ce qui sert, rien de plus. */
  function offreCompacte(o) {
    const u = urgency(o.date_limite);
    return {
      id: o.id, titre: o.titre, emetteur: o.emetteur, type: o.type, secteur: o.secteur,
      region: o.region, filiale: o.filiale || null, origine: o.origine,
      date_limite: o.date_limite || null,
      jours_restants: o.date_limite ? u.days : null,
      statut: o.statut_traitement || "Nouvelle",
      resultat: o.resultat || null,
      montant: o.montant || null,
      responsable: o.assigne || null
    };
  }

  function resumeRegistre() {
    const court = (liste) => liste.slice(0, 12).map(x => x.valeur).join(" · ");
    const statuts = valeursDe("statut").map(x => x.valeur + " " + x.nombre).join(", ");
    return {
      total: OFFERS.length,
      echeanceSemaine: filtreOffres({ echeance_max_jours: 7 }).length,
      enRetard: filtreOffres({ en_retard: true }).length,
      statuts: statuts,
      types: court(valeursDe("type")),
      secteurs: court(valeursDe("secteur")),
      regions: court(valeursDe("region")),
      filiales: court(valeursDe("filiale")),
      opportunites: OPPS.length,
      sources: SOURCES.length
    };
  }

  // L'assistant répondait avec une troisième règle, qui ignorait le résultat :
  // il pouvait donc annoncer un nombre différent de celui affiché à l'écran.
  function bilanSoumissions() { return AA.metier.bilanSoumissions(OFFERS); }

  // ------------------------------------------------- exécution des outils

  async function executeOutil(nom, a) {
    a = a || {};

    switch (nom) {

      // ---------------------------------------------------------- lecture
      case "chercher_offres": {
        const rows = parEcheance(filtreOffres(a));
        const limite = Math.min(50, Math.max(1, a.limite || 15));
        return {
          total: rows.length,
          offres: rows.slice(0, limite).map(offreCompacte),
          __fiches: rows.slice(0, 6)
        };
      }

      case "compter_offres":
        return { total: filtreOffres(a).length, total_registre: OFFERS.length };

      case "statistiques": {
        const rows = filtreOffres(a);
        const col = { statut: "statut_traitement" }[a.dimension] || a.dimension;
        const par = new Map();
        rows.forEach(o => {
          const v = (o[col] == null || o[col] === "") ? "Non renseigné" : o[col];
          par.set(v, (par.get(v) || 0) + 1);
        });
        return {
          total: rows.length,
          repartition: Array.from(par.entries()).sort((x, y) => y[1] - x[1])
            .map(([valeur, nombre]) => ({ valeur, nombre, part_pourcent: Math.round(nombre * 100 / (rows.length || 1)) }))
        };
      }

      case "detail_offre": {
        const o = OFFERS.find(x => x.id === a.offre_id);
        if (!o) return { erreur: true, message: "Aucune offre ne porte cet identifiant." };
        const fiche = Object.assign({}, o);
        fiche.documents = FILE_COUNTS[o.id] || 0;
        if (sb) {
          const [n, v] = await Promise.all([
            sb.from("offer_notes").select("author,text,created_at").eq("offer_id", o.id).order("created_at", { ascending: true }),
            sb.from("offer_votes").select("nom,avis,motif").eq("offer_id", o.id)
          ]);
          fiche.notes = (n.data || []).slice(-12);
          fiche.avis = v.data || [];
        }
        return fiche;
      }

      case "liste_valeurs":
        return { champ: a.champ, valeurs: valeursDe(a.champ) };

      case "bilan_soumissions":
        return bilanSoumissions();

      case "liste_opportunites":
        return {
          total: OPPS.length,
          opportunites: OPPS.slice().sort((x, y) => (y.score || 0) - (x.score || 0))
            .slice(0, Math.min(50, a.limite || 15))
            .map(x => ({ id: x.id, structure: x.structure, besoin: x.besoin, offre_aa: x.offre_aa, score: x.score, statut: x.statut, responsable: x.responsable }))
        };

      case "liste_sources":
        return {
          total: SOURCES.length,
          sources: SOURCES.map(s => ({ nom: s.nom, url: s.url, active: !!s.actif, dernier_statut: s.dernier_statut || null, derniere_collecte: s.derniere_collecte || null, items_total: s.items_total || 0 }))
        };

      case "etat_veille":
        return derniereVeille || { message: "Aucune collecte enregistrée depuis l'ouverture de l'application." };

      case "liste_contacts":
        return { total: CONTACTS.length, contacts: CONTACTS.map(c => ({ nom: c.nom, email: c.email, role: c.role, actif: c.actif })) };

      // ------------------------------------------------------ navigation
      case "ouvrir_offre": {
        const o = OFFERS.find(x => x.id === a.offre_id);
        if (!o) return { erreur: true, message: "Identifiant inconnu." };
        chatFerme();
        openDetail(a.offre_id);
        return { ok: true, ouverte: o.titre };
      }

      case "changer_onglet":
        setTab(a.onglet);
        return { ok: true, onglet: a.onglet };

      case "appliquer_filtres": {
        // Les offres déposées sans résultat ne sont plus dans le registre de
        // travail : la demande « les soumises » mène à leur onglet.
        if (a.statut === "Soumise") {
          attenteFiltre.filiale = a.filiale || ""; attenteFiltre.vue = ""; attenteFiltre.q = a.recherche || a.texte || "";
          setTab("attente"); renderAttente();
          return { ok: true, onglet: "attente", affichees: offresEnAttente().length };
        }
        FILTER_GROUPS.forEach(g => active[g.key].clear());
        filialeTab = a.filiale || "";
        if (a.statut) active.statut_traitement.add(a.statut);
        if (a.type) active.type.add(a.type);
        if (a.secteur) active.secteur.add(a.secteur);
        if (a.region) active.region.add(a.region);
        if (a.origine) active.origine.add(a.origine);
        if (a.en_retard) active.echeance.add("Clôturées");
        else if (a.sans_echeance) active.echeance.add("Sans échéance");
        else if (typeof a.echeance_max_jours === "number" && a.echeance_max_jours <= 7) active.echeance.add("Sous 7 jours");
        $("#search").value = a.recherche || a.texte || "";
        setTab("veille");
        render();
        return { ok: true, affichees: currentResults().length };
      }

      case "effacer_filtres":
        clearFilters();
        return { ok: true, affichees: currentResults().length };

      // -------------------------------------------------------- écriture
      case "creer_offre": {
        if (!sb) return { erreur: true, message: "Registre non connecté." };
        const row = {
          titre: a.titre, emetteur: a.emetteur, origine: a.origine || "État",
          filiale: a.filiale || "", type: a.type || "Appel d'offres", secteur: a.secteur || null,
          region: a.region || "National", zone: "Sénégal", montant: a.montant || null,
          date_publication: a.date_publication || null, date_limite: a.date_limite || null,
          lien_source: a.lien_source || null, description: a.description || null,
          statut_traitement: "Nouvelle", assigne: "", source_id: "assistant",
          created_by: whoami || "Assistant"
        };
        const { error } = await sb.from("offers").insert(row);
        if (error) return { erreur: true, message: error.message };
        await loadOffers();
        return { ok: true, message: "Offre enregistrée." };
      }

      case "enregistrer_soumission": {
        if (!sb) return { erreur: true, message: "Registre non connecté." };
        const resultat = a.resultat || "En attente";
        const statut = /gagn/i.test(resultat) ? "Gagnée" : /perdu|retrait|annul/i.test(resultat) ? "Perdue" : "Soumise";
        const row = {
          titre: a.titre, emetteur: a.emetteur, origine: a.origine || "État",
          filiale: a.filiale || "", type: a.type || "Appel d'offres", secteur: a.secteur || null,
          region: a.region || "National", zone: "Sénégal", montant: a.montant || null,
          date_limite: a.date_limite || null, date_soumission: a.date_soumission || null,
          date_depouillement: a.date_depouillement || null, resultat: resultat,
          commentaire_suivi: a.commentaire_suivi || null, statut_traitement: statut,
          assigne: whoami || "", source_id: "hors-logiciel",
          decision: "GO", decision_par: whoami || "Assistant", decision_le: new Date().toISOString(),
          created_by: whoami || "Assistant"
        };
        const { error } = await sb.from("offers").insert(row);
        if (error) return { erreur: true, message: error.message };
        await loadOffers();
        return { ok: true, message: "Soumission enregistrée au suivi." };
      }

      case "ajouter_note": {
        if (!sb) return { erreur: true, message: "Registre non connecté." };
        const { error } = await sb.from("offer_notes").insert({ offer_id: a.offre_id, author: whoami || "Assistant", text: a.texte });
        if (error) return { erreur: true, message: error.message };
        if (currentDetailId === a.offre_id) loadNotes(a.offre_id);
        return { ok: true, message: "Note ajoutée." };
      }

      case "changer_statut": {
        const ok = await saveField(a.offre_id, { statut_traitement: a.statut });
        return ok ? { ok: true, message: "Statut mis à jour." } : { erreur: true, message: "Enregistrement refusé." };
      }

      case "mettre_a_jour_suivi": {
        const patch = {};
        ["date_soumission", "date_depouillement", "date_relance", "resultat", "commentaire_suivi"].forEach(k => {
          if (a[k] !== undefined) patch[k] = a[k] || null;
        });
        if (!Object.keys(patch).length) return { erreur: true, message: "Rien à mettre à jour." };
        if (patch.resultat) {
          if (/gagn/i.test(patch.resultat)) patch.statut_traitement = "Gagnée";
          else if (/perdu|retrait|annul/i.test(patch.resultat)) patch.statut_traitement = "Perdue";
          else patch.statut_traitement = "Soumise";
        }
        const ok = await saveField(a.offre_id, patch);
        return ok ? { ok: true, message: "Suivi mis à jour." } : { erreur: true, message: "Enregistrement refusé." };
      }

      case "assigner_offre": {
        const ok = await saveField(a.offre_id, { assigne: a.responsable });
        return ok ? { ok: true } : { erreur: true, message: "Enregistrement refusé." };
      }

      case "creer_opportunite": {
        if (!sb) return { erreur: true, message: "Registre non connecté." };
        const row = {
          structure: a.structure, besoin: a.besoin || null, offre_aa: a.offre_aa || null,
          angle: a.angle || null, statut: a.statut || "À contacter", responsable: a.responsable || whoami || null,
          note: a.note || null,
          fit: a.fit || null, relation: a.relation || null, financement: a.financement || null,
          urgence: a.urgence || null, concurrence: a.concurrence || null,
          created_by: whoami || "Assistant"
        };
        const { error } = await sb.from("opportunites").insert(row);
        if (error) return { erreur: true, message: error.message };
        await loadOpportunites();
        return { ok: true, message: "Opportunité ajoutée." };
      }

      case "lancer_veille":
        if (ui.collectorRunning) return { ok: true, message: "Une collecte est déjà en cours." };
        refreshBtn.click();
        return { ok: true, message: "Collecte lancée ; le résultat arrivera dans quelques instants." };

      case "exporter_excel":
        (a.quoi === "prospection" ? $("#export-opp-btn") : $("#export-suivi-btn")).click();
        return { ok: true, message: "Export lancé." };

      case "joindre_document_a_offre": {
        if (!sb) return { erreur: true, message: "Registre non connecté." };
        const piece = piecesEnvoyees.find(p => p.nom === a.fichier) || piecesEnvoyees[piecesEnvoyees.length - 1];
        if (!piece) return { erreur: true, message: "Aucun document joint à la discussion." };
        const offre = OFFERS.find(x => x.id === a.offre_id);
        if (!offre) return { erreur: true, message: "Offre inconnue." };

        const lu = await window.aa.fichiers.octets(piece.chemin);
        if (!lu || lu.erreur) return { erreur: true, message: (lu && lu.erreur) || "Fichier illisible." };

        const octets = Uint8Array.from(atob(lu.base64), c => c.charCodeAt(0));
        const propre = piece.nom.replace(/[^\w.\-]+/g, "_").slice(-100);
        const chemin = offre.id + "/" + Date.now() + "-" + propre;
        const envoi = await sb.storage.from(BUCKET).upload(chemin, octets, {
          contentType: piece.mime || "application/octet-stream", upsert: false
        });
        if (envoi.error) return { erreur: true, message: envoi.error.message };
        const { error } = await sb.from("offer_files").insert({
          offer_id: offre.id, nom: piece.nom, chemin: chemin, taille: lu.octets,
          type_mime: piece.mime || null, source: "assistant", author: whoami || "Assistant"
        });
        if (error) return { erreur: true, message: error.message };
        await loadFileCounts();
        if (currentDetailId === offre.id) loadFiles(offre.id);
        render();
        return { ok: true, message: "Document classé dans l'offre." };
      }

      default:
        return { erreur: true, message: "Outil inconnu : " + nom };
    }
  }

  // ------------------------------------------------------ confirmations

  /** Phrase qui décrit, sans jargon, ce que l'IA s'apprête à faire. */
  function resumeAction(nom, a) {
    const titre = (id) => { const o = OFFERS.find(x => x.id === id); return o ? (o.titre || "sans intitulé") : "une offre"; };
    switch (nom) {
      case "creer_offre": return "Enregistrer une nouvelle offre : « " + esc(a.titre || "") + " » — " + esc(a.emetteur || "émetteur non précisé") +
        (a.date_limite ? ", échéance " + esc(fmtDate(a.date_limite)) : "") + ".";
      case "enregistrer_soumission": return "Enregistrer au suivi une offre déjà soumise : « " + esc(a.titre || "") + " » — " + esc(a.emetteur || "") + ".";
      case "ajouter_note": return "Ajouter une note à « " + esc(titre(a.offre_id)) + " » :<br><i>" + esc(a.texte || "") + "</i>";
      case "changer_statut": return "Passer « " + esc(titre(a.offre_id)) + " » au statut <b>" + esc(a.statut) + "</b>.";
      case "mettre_a_jour_suivi": return "Mettre à jour le suivi de « " + esc(titre(a.offre_id)) + " » : " +
        esc(Object.keys(a).filter(k => k !== "offre_id" && a[k]).map(k => k.replace(/_/g, " ") + " = " + a[k]).join(", ")) + ".";
      case "assigner_offre": return "Confier « " + esc(titre(a.offre_id)) + " » à <b>" + esc(a.responsable) + "</b>.";
      case "creer_opportunite": return "Ajouter l'opportunité <b>" + esc(a.structure || "") + "</b> au tableau de prospection.";
      case "lancer_veille": return "Lancer une collecte sur les sources actives.";
      case "exporter_excel": return "Produire le classeur Excel " + (a.quoi === "prospection" ? "de la prospection" : "du suivi des offres") + ".";
      case "joindre_document_a_offre": return "Classer « " + esc(a.fichier || "") + " » dans les documents de l'offre « " + esc(titre(a.offre_id)) + " ».";
      default: return "Exécuter l'action « " + esc(nom) + " ».";
    }
  }

  function confirmeAction(nom, a) {
    return new Promise(resolve => {
      const carte = document.createElement("div");
      carte.className = "wa-confirm";
      carte.innerHTML = '<p class="t">' + resumeAction(nom, a) + '</p>';

      const barre = document.createElement("div");
      barre.className = "wa-confirm-actions";
      const oui = document.createElement("button");
      oui.type = "button"; oui.className = "btn primary"; oui.textContent = "Confirmer";
      const non = document.createElement("button");
      non.type = "button"; non.className = "btn"; non.textContent = "Annuler";
      barre.appendChild(oui); barre.appendChild(non);
      carte.appendChild(barre);

      const fini = (accord) => {
        barre.remove();
        const verdict = document.createElement("p");
        verdict.className = "wa-confirm-verdict " + (accord ? "oui" : "non");
        verdict.textContent = accord ? "Confirmé" : "Annulé";
        carte.appendChild(verdict);
        resolve(accord);
      };
      oui.addEventListener("click", () => fini(true));
      non.addEventListener("click", () => fini(false));

      chatLog.appendChild(carte);
      chatFinDeFil();
    });
  }

  // -------------------------------------------------- rendu du fil façon
  // -------------------------------------------------- messagerie mobile

  function chatFinDeFil() {
    requestAnimationFrame(() => { chatLog.scrollTop = chatLog.scrollHeight; });
  }

  const heureCourte = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  function separateurJour() {
    const aujourd = jourIso(new Date());
    if (chatDernierJour === aujourd) return;
    chatDernierJour = aujourd;
    const el = document.createElement("div");
    el.className = "wa-jour";
    el.innerHTML = "<span>Aujourd'hui</span>";
    chatLog.appendChild(el);
  }

  function chatDit(cote, html, options) {
    separateurJour();
    const o = options || {};
    const el = document.createElement("div");
    el.className = "wa-msg " + cote + (chatDernierCote === cote ? " suite" : "");
    chatDernierCote = cote;
    el.innerHTML = '<div class="wa-corps">' + html + '</div>' +
      '<span class="wa-meta">' + heureCourte() +
      (cote === "moi" ? '<svg class="wa-coches" viewBox="0 0 18 12"><path d="M1 6.5 4 9.5 10 2.5"/><path d="M7 6.5 10 9.5 16 2.5"/></svg>' : '') +
      '</span>';
    chatLog.appendChild(el);
    chatFinDeFil();
    return el;
  }

  function chatAjouteHtml(html) {
    const hote = document.createElement("div");
    hote.innerHTML = html;
    const noeud = hote.firstElementChild;
    if (noeud) { chatLog.appendChild(noeud); chatFinDeFil(); }
    chatDernierCote = null;
    return noeud;
  }

  function chatFiches(offres, reste) {
    if (!offres || !offres.length) return;
    const html = '<div class="chat-offres">' + offres.map(o => {
      const u = urgency(o.date_limite);
      const cls = (u.key === "cloture" || u.key === "critique") ? "crit" : (u.key === "proche" ? "warn" : "");
      const d = o.date_limite ? (u.key === "cloture" ? "Clôturée" : u.label) : "Sans échéance";
      return '<button type="button" class="chat-offre" data-chat-open="' + esc(o.id) + '">' +
             '<span class="t">' + esc(o.titre || "Sans intitulé") + '</span>' +
             '<span class="m"><span>' + esc(o.emetteur || "Émetteur non renseigné") + '</span>' +
             '<span class="d ' + cls + '">' + esc(d) + '</span></span></button>';
    }).join("") + '</div>';
    chatAjouteHtml(html);
    if (reste > 0) chatAjouteHtml('<p class="chat-reste">' + plural(reste, "autre offre correspond", "autres offres correspondent") + ".</p>");
  }

  function chatTableau(t) {
    if (!t || !t.lignes || !t.lignes.length) return;
    let max = 0;
    t.lignes.forEach(l => { const v = Number(l[1]) || 0; if (v > max) max = v; });
    if (!max) max = 1;
    const html = '<div class="chat-tab">' + t.lignes.map(l => {
      const part = Math.round((Number(l[1]) || 0) * 100 / max);
      return '<div class="l"><span class="bar" style="width:' + part + '%"></span>' +
             '<span class="n">' + esc(l[0]) + '</span>' +
             '<span class="v">' + esc(l[1]) + '</span>' +
             (l[2] == null ? "" : '<span class="p">' + l[2] + ' %</span>') + '</div>';
    }).join("") + '</div>';
    chatAjouteHtml(html);
  }

  // ---------------------------------------------------------- pièces jointes

  const PICTO = { image: "i-doc-image", tableur: "i-doc-tableur" };
  const pictoDe = (p) => PICTO[p.genre] || "i-doc-texte";

  /** Ce qu'on dit d'une pièce sous son nom : pages, caractères lus, ou l'ennui. */
  function sousTitrePiece(p) {
    if (p.erreur) return p.erreur;
    if (p.genre === "image") return p.taille + " · image";
    const bouts = [p.taille];
    if (p.pages) bouts.push(p.pages + " pages");
    if (p.texte) bouts.push(Math.round((p.caracteres || p.texte.length) / 100) / 10 + " k caractères lus");
    else if (p.avertissement) bouts.push("sans texte extractible");
    return bouts.join(" · ");
  }

  function rendPiecesEnAttente() {
    const boite = $("#chat-pieces");
    boite.innerHTML = "";
    boite.hidden = !piecesJointes.length;
    piecesJointes.forEach((p, i) => {
      const el = document.createElement("div");
      el.className = "piece" + (p.erreur ? " ko" : "");
      el.innerHTML = '<svg class="ico"><use href="#' + pictoDe(p) + '"/></svg>' +
        '<span class="t"><span class="n">' + esc(p.nom) + '</span></span>' +
        '<span class="d">' + esc(p.erreur ? "illisible" : (p.taille || "")) + '</span>';
      const x = document.createElement("button");
      x.type = "button"; x.className = "x"; x.textContent = "×";
      x.title = "Retirer";
      x.addEventListener("click", () => { piecesJointes.splice(i, 1); rendPiecesEnAttente(); });
      el.appendChild(x);
      boite.appendChild(el);
    });
  }

  function chatBullesDocuments(pieces) {
    pieces.forEach(p => {
      chatDit("moi",
        '<div class="wa-doc"><svg class="ico"><use href="#' + pictoDe(p) + '"/></svg>' +
        '<span class="t"><span class="n">' + esc(p.nom) + '</span>' +
        '<span class="d">' + esc(sousTitrePiece(p)) + '</span></span></div>');
    });
  }

  async function ajoutePieces(nouvelles) {
    (nouvelles || []).forEach(p => {
      if (piecesJointes.length >= 8) return;
      if (piecesJointes.some(q => q.chemin === p.chemin)) return;
      piecesJointes.push(p);
    });
    rendPiecesEnAttente();
    const refusees = (nouvelles || []).filter(p => p.erreur);
    if (refusees.length) toast(refusees[0].nom + " : " + refusees[0].erreur, "error", 6000);
    if (!chatOuvert) chatOuvre();
    chatInput.focus();
  }

  function chatSuggestions(liste) {
    chatTips.innerHTML = "";
    (liste || []).forEach(s => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "chat-tip"; b.textContent = s;
      b.addEventListener("click", () => { chatInput.value = s; chatEnvoie(); });
      chatTips.appendChild(b);
    });
  }

  function chatEtat(libelle) {
    chatSous.textContent = libelle || (iaEtat.cleEnregistree
      ? "IA connectée — " + (iaEtat.modele || "")
      : "Hors ligne — vos données ne quittent pas le poste");
    chatSous.classList.toggle("occupe", !!libelle);
  }

  let bulleFrappe = null;
  function frappeDebut() {
    if (bulleFrappe) return;
    separateurJour();
    bulleFrappe = document.createElement("div");
    bulleFrappe.className = "wa-msg lui frappe";
    bulleFrappe.innerHTML = '<div class="wa-corps"><i></i><i></i><i></i></div>';
    chatLog.appendChild(bulleFrappe);
    chatDernierCote = null;
    chatFinDeFil();
  }
  function frappeFin() {
    if (bulleFrappe) { bulleFrappe.remove(); bulleFrappe = null; }
  }

  // ---------------------------------------------------- les deux moteurs

  function chatAfficheLocal(rep) {
    if (rep.texte) chatDit("lui", rep.texte);
    chatFiches(rep.offres, rep.reste);
    if (rep.tableau) chatTableau(rep.tableau);
    if (rep.action) {
      confirmeAction(rep.action.id === "lancer-veille" ? "lancer_veille" : rep.action.id, rep.action.params || {})
        .then(ok => { if (ok) chatExecuteLocal(rep.action); });
    }
    chatSuggestions(rep.suggestions);
    chatFinDeFil();
  }

  async function chatExecuteLocal(act) {
    switch (act.id) {
      case "lancer-veille": await executeOutil("lancer_veille", {}); chatDit("lui", "C'est parti — la recherche tourne en arrière-plan."); return;
      case "ouvrir-offre": chatFerme(); $("#add-btn").click(); return;
      case "ouvrir-soumission": chatFerme(); setTab("soumissions"); $("#soumission-add-btn").click(); return;
      case "ajouter-note":
        if (act.params && act.params.offreId) { chatFerme(); openDetail(act.params.offreId); setTimeout(() => { const z = $("#dlg-note-text"); if (z) z.focus(); }, 250); }
        return;
      case "changer-statut":
        if (act.params) {
          const r = await executeOutil("changer_statut", { offre_id: act.params.offreId, statut: act.params.statut });
          chatDit("lui", r.ok ? "C'est enregistré." : "L'enregistrement a échoué.");
        }
        return;
      default: return;
    }
  }

  function creerSessionIA() {
    if (!window.AAIA || !window.aa.ia) return null;
    return window.AAIA.creerSession({
      contexte: () => ({
        whoami: whoami,
        profil: profil,
        aujourdhui: new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
        resume: resumeRegistre()
      }),
      executer: executeOutil,
      confirmer: confirmeAction,
      surEtat: chatEtat
    });
  }

  /** Message court expliquant pourquoi on retombe sur le moteur local. */
  function motifRepli(categorie) {
    return {
      "cle-absente": null,
      "cle-refusee": "Clé OpenAI refusée — je réponds avec le moteur local.",
      "quota": "Crédit OpenAI épuisé — je réponds avec le moteur local.",
      "reseau": "OpenAI injoignable — je réponds avec le moteur local.",
      "delai": "L'IA a mis trop de temps — je réponds avec le moteur local.",
      "panne-fournisseur": "OpenAI est indisponible — je réponds avec le moteur local.",
      "modele": "Ce modèle n'est pas accessible — je réponds avec le moteur local."
    }[categorie] || "Bascule sur le moteur local.";
  }

  let chatOccupe = false;
  let piecesEnvoyees = [];   // dernières pièces transmises, pour le classement

  async function chatEnvoie() {
    const q = chatInput.value.trim();
    const pieces = piecesJointes.slice();
    if ((!q && !pieces.length) || chatOccupe) return;
    chatOccupe = true;
    chatInput.value = "";
    piecesJointes = [];
    rendPiecesEnAttente();

    chatBullesDocuments(pieces);
    const lisibles = pieces.filter(p => !p.erreur);
    if (lisibles.length) piecesEnvoyees = lisibles;
    const question = q || (pieces.length === 1
      ? "Que contient ce document, et en quoi concerne-t-il le registre ?"
      : "Que contiennent ces documents, et en quoi concernent-ils le registre ?");
    if (q) chatDit("moi", esc(q));
    chatSuggestions([]);
    frappeDebut();

    try {
      if (iaEtat.cleEnregistree) {
        if (!sessionIA) sessionIA = creerSessionIA();
        if (sessionIA) {
          const rep = await sessionIA.envoie(question, lisibles);
          frappeFin();
          chatEtat(null);
          if (!rep.erreur) {
            // Les intitulés d'offres viennent de sites que nous ne maîtrisons
            // pas ; ils remontent à l'assistant, qui peut les répéter. Ce qui
            // revient du modèle est donc du texte, jamais du balisage.
            chatDit("lui", texteEnHtml(rep.texte || "…"));
            chatFiches(rep.offres, 0);
            chatSuggestions(window.AAAssistant ? window.AAAssistant.suggestions(contexteAssistant()) : []);
            chatFinDeFil();
            return;
          }
          const motif = motifRepli(rep.categorie);
          if (motif) chatAjouteHtml('<p class="wa-avis">' + esc(motif) + "</p>");
        }
      }
      frappeFin();
      await new Promise(r => setTimeout(r, 120));
      if (lisibles.length) {
        // Le moteur local sait extraire un document, pas le comprendre. Autant
        // le dire, et rendre compte de ce qui a été lu.
        const bilan = lisibles.map(p => "<b>" + esc(p.nom) + "</b> — " + esc(sousTitrePiece(p))).join("<br>");
        chatDit("lui", bilan + "<br><br>J'ai lu ces documents, mais les analyser demande l'IA : " +
          "ajoutez une clé OpenAI dans Paramètres. Sans elle, vous pouvez les classer dans une offre " +
          "depuis sa fiche, section Documents.");
        chatSuggestions(window.AAAssistant.suggestions(contexteAssistant()));
        return;
      }
      chatAfficheLocal(window.AAAssistant.repond(question, contexteAssistant()));
    } catch (err) {
      frappeFin();
      chatDit("lui", "Quelque chose a coincé de mon côté. Reformulez, ou dites « aide » pour voir ce que je sais faire.");
    } finally {
      frappeFin();
      chatEtat(null);
      chatOccupe = false;
      if (chatOuvert) chatInput.focus();
    }
  }

  // ------------------------------------------------------ ouvrir, fermer

  function chatOuvre() {
    chatPanel.hidden = false;
    chatOuvert = true;
    chatBubble.setAttribute("aria-expanded", "true");
    chatBubble.classList.remove("is-new");
    setPref("chat-vu", "1");
    if (!chatAccueilli) {
      chatAccueilli = true;
      chatAfficheLocal(window.AAAssistant.accueil(contexteAssistant()));
    }
    chatEtat(null);
    setTimeout(() => chatInput.focus(), 60);
  }

  function chatFerme() {
    chatPanel.hidden = true;
    chatOuvert = false;
    chatBubble.setAttribute("aria-expanded", "false");
  }

  async function rafraichisEtatIA() {
    if (!window.aa.ia) return;
    try {
      iaEtat = await window.aa.ia.statut();
      chatBubble.classList.toggle("ia", !!iaEtat.cleEnregistree);
      if (chatOuvert) chatEtat(null);
    } catch (_) { /* sans importance */ }
  }

  function initAssistant() {
    if (!window.AAAssistant || !chatBubble) return;
    if (pref("chat-vu", "") !== "1") chatBubble.classList.add("is-new");

    chatBubble.addEventListener("click", () => { chatOuvert ? chatFerme() : chatOuvre(); });
    $("#chat-close").addEventListener("click", chatFerme);
    $("#chat-form").addEventListener("submit", (e) => { e.preventDefault(); chatEnvoie(); });

    // Le « + » ouvre le sélecteur de Windows : c'est un logiciel de bureau,
    // pas une page web.
    $("#chat-joindre").addEventListener("click", async () => {
      const bouton = $("#chat-joindre");
      bouton.disabled = true;
      try { await ajoutePieces(await window.aa.fichiers.choisir()); }
      catch (_) { toast("Impossible d'ouvrir le sélecteur de fichiers.", "error"); }
      bouton.disabled = false;
    });

    // Glisser-déposer sur le panneau. Electron donne le chemin du fichier :
    // on le fait lire au processus principal plutôt que de charger les octets
    // dans la page.
    ["dragenter", "dragover"].forEach(ev => chatPanel.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation(); chatPanel.classList.add("depot");
    }));
    ["dragleave", "drop"].forEach(ev => chatPanel.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      if (ev === "dragleave" && chatPanel.contains(e.relatedTarget)) return;
      chatPanel.classList.remove("depot");
    }));
    chatPanel.addEventListener("drop", async (e) => {
      const chemins = Array.from((e.dataTransfer && e.dataTransfer.files) || [])
        .map(f => f.path).filter(Boolean);
      if (!chemins.length) return;
      try { await ajoutePieces(await window.aa.fichiers.lire(chemins)); }
      catch (_) { toast("Dépôt impossible.", "error"); }
    });
    $("#chat-reset").addEventListener("click", () => {
      if (sessionIA) sessionIA.reinitialise();
      chatLog.innerHTML = "";
      chatDernierCote = null; chatDernierJour = null;
      piecesJointes = []; piecesEnvoyees = []; rendPiecesEnAttente();
      chatAfficheLocal(window.AAAssistant.accueil(contexteAssistant()));
    });

    chatLog.addEventListener("click", (e) => {
      const b = e.target.closest("[data-chat-open]");
      if (!b) return;
      chatFerme();
      openDetail(b.dataset.chatOpen);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && chatOuvert && !document.querySelector("dialog[open]")) chatFerme();
    });

    rafraichisEtatIA();
  }

  // ======================================================================
  // Réglage de la clé OpenAI
  // ======================================================================
  // ======================================================================
  // Réglages de la messagerie sortante
  // ======================================================================
  // ======================================================================
  // Apparence des cartes
  //
  // Un simple attribut sur <body> : tout le reste est affaire de CSS. Changer
  // de style ne recharge rien et ne touche à aucune donnée.
  // ======================================================================
  const STYLES_CARTES = ["ardoise", "ligne", "verre"];

  function appliqueStyleCartes(nom) {
    const choisi = STYLES_CARTES.indexOf(nom) >= 0 ? nom : "ardoise";
    document.body.dataset.cartes = choisi;
    setPref("cartes", choisi);
    $$("#styles-cartes .style-choix").forEach(b =>
      b.classList.toggle("is-active", b.dataset.style === choisi));
    return choisi;
  }

  function initStyleCartes() {
    const boite = $("#styles-cartes");
    appliqueStyleCartes(pref("cartes", "ardoise"));
    if (!boite) return;
    boite.addEventListener("click", (e) => {
      const b = e.target.closest(".style-choix");
      if (!b) return;
      appliqueStyleCartes(b.dataset.style);
      toast("Style « " + b.querySelector(".nom").textContent + " » appliqué.", "success", 2200);
    });
  }

  function initReglagesCourriel() {
    const champs = {
      serveur: $("#smtp-serveur"), port: $("#smtp-port"), securite: $("#smtp-securite"),
      utilisateur: $("#smtp-utilisateur"), nomExpediteur: $("#smtp-nom")
    };
    const mdp = $("#smtp-mdp"), tester = $("#smtp-tester"), effacer = $("#smtp-effacer"), etat = $("#smtp-etat");
    if (!tester) return;

    function affiche(s) {
      if (!s) return;
      Object.keys(champs).forEach(k => { if (champs[k] && s[k] !== undefined && s[k] !== null) champs[k].value = s[k]; });
      mdp.value = "";
      mdp.placeholder = s.motDePasseEnregistre ? "Enregistré — saisissez-en un autre pour le remplacer" : "•••••••••••";
      effacer.hidden = !s.serveur && !s.motDePasseEnregistre;
      etat.className = "ia-etat " + (s.configure ? "ok" : "");
      etat.textContent = s.configure
        ? "Envoi direct actif depuis " + (s.expediteur || s.utilisateur)
        : "Non configuré : les demandes d'arbitrage ouvriront un brouillon, qu'il faudra envoyer à la main.";
      const mode = $("#ask-mode");
      if (mode) mode.textContent = s.configure
        ? "Le message part directement depuis votre messagerie, à votre nom."
        : "Messagerie non configurée : un brouillon s'ouvrira, à vous de l'envoyer.";
    }

    tester.addEventListener("click", async () => {
      const r = {
        serveur: champs.serveur.value.trim(),
        port: Number(champs.port.value) || (champs.securite.value === "ssl" ? 465 : 587),
        securite: champs.securite.value,
        utilisateur: champs.utilisateur.value.trim(),
        expediteur: champs.utilisateur.value.trim(),
        nomExpediteur: champs.nomExpediteur.value.trim()
      };
      if (!r.serveur || !r.utilisateur) { toast("Serveur et identifiant sont nécessaires.", "error"); return; }
      if (mdp.value) r.motDePasse = mdp.value;

      tester.disabled = true; tester.classList.add("is-busy");
      etat.className = "ia-etat"; etat.textContent = "Connexion au serveur de messagerie…";
      const essai = await window.aa.courriel.tester(r);
      if (!essai.ok) {
        tester.disabled = false; tester.classList.remove("is-busy");
        etat.className = "ia-etat ko"; etat.textContent = essai.message;
        return;
      }
      const enr = await window.aa.courriel.enregistrer(r);
      tester.disabled = false; tester.classList.remove("is-busy");
      if (!enr.ok) { etat.className = "ia-etat ko"; etat.textContent = enr.erreur || "Enregistrement impossible."; return; }
      affiche(enr);
      toast("Messagerie vérifiée : les demandes d'arbitrage partiront directement.", "success", 5000);
    });

    effacer.addEventListener("click", async () => {
      affiche(await window.aa.courriel.effacer());
      toast("Réglages de messagerie effacés de ce poste.", "info");
    });

    window.aa.courriel.statut().then(affiche).catch(() => {});
  }

  // Relève des alertes e-mail Development AID. Le mot de passe d'application
  // ne remonte jamais ici : la page l'envoie, elle ne peut pas le relire.
  function initReglagesAlertes() {
    const champs = {
      serveur: $("#alertes-serveur"), port: $("#alertes-port"), utilisateur: $("#alertes-utilisateur"),
      expediteur: $("#alertes-expediteur"), jours: $("#alertes-jours"), dossier: $("#alertes-dossier")
    };
    const mdp = $("#alertes-mdp"), actif = $("#alertes-actif"), tester = $("#alertes-tester"),
      relever = $("#alertes-relever"), effacer = $("#alertes-effacer"), etat = $("#alertes-etat"), derniere = $("#alertes-derniere");
    if (!tester || !window.aa.alertes) return;

    function affiche(s) {
      if (!s) return;
      Object.keys(champs).forEach(k => { if (champs[k] && s[k] !== undefined && s[k] !== null) champs[k].value = s[k]; });
      actif.checked = s.actif !== false;
      mdp.value = "";
      mdp.placeholder = s.motDePasseEnregistre ? "Enregistré — saisissez-en un autre pour le remplacer"
        : s.memeMotDePasseQueLEnvoi ? "Celui de l'envoi (même compte) — rien à saisir" : "•••••••••••";
      effacer.hidden = !s.configure && !s.motDePasseEnregistre;
      relever.hidden = !s.configure;
      etat.className = "ia-etat " + (s.configure ? "ok" : "");
      etat.textContent = s.configure
        ? (s.actif !== false ? "Relève active : les alertes de « " + s.expediteur + " » sont lues à chaque veille, depuis " + s.utilisateur + "."
                             : "Configurée, mais suspendue : cochez « Relever pendant la veille » pour la réactiver.")
        : "Non configurée : les alertes Development AID ne sont pas relevées sur ce poste.";
      const d = s.derniere;
      derniere.textContent = !d ? "" : d.erreur
        ? "Dernière relève (" + fmtTime(d.quand) + ") : échec — " + d.erreur
        : "Dernière relève (" + fmtTime(d.quand) + ") : " + plural(d.messages || 0, "alerte lue", "alertes lues") + ", "
          + (d.lues || 0) + " offre(s) trouvée(s), " + (d.retenues || 0) + " retenue(s) par le mapping, "
          + plural(d.nouvelles || 0, "nouvelle", "nouvelles") + " au registre."
          + (d.motifs ? " Écartées : " + d.motifs + "." : "");
    }

    const lis = () => ({
      serveur: champs.serveur.value.trim(),
      port: Number(champs.port.value) || 993,
      utilisateur: champs.utilisateur.value.trim(),
      expediteur: champs.expediteur.value.trim() || "developmentaid",
      jours: Math.min(60, Math.max(1, Number(champs.jours.value) || 10)),
      dossier: champs.dossier.value.trim() || "INBOX",
      actif: actif.checked
    });

    tester.addEventListener("click", async () => {
      const r = lis();
      if (!r.serveur || !r.utilisateur) { toast("Serveur de réception et identifiant sont nécessaires.", "error"); return; }
      if (mdp.value) r.motDePasse = mdp.value;
      tester.disabled = true; tester.classList.add("is-busy");
      etat.className = "ia-etat"; etat.textContent = "Connexion à la boîte de réception…";
      const essai = await window.aa.alertes.tester(r);
      if (!essai.ok) {
        tester.disabled = false; tester.classList.remove("is-busy");
        etat.className = "ia-etat ko"; etat.textContent = essai.message;
        return;
      }
      const enr = await window.aa.alertes.enregistrer(r);
      tester.disabled = false; tester.classList.remove("is-busy");
      if (!enr.ok) { etat.className = "ia-etat ko"; etat.textContent = enr.erreur || "Enregistrement impossible."; return; }
      affiche(enr);
      toast(essai.message, "success", 7000);
    });

    actif.addEventListener("change", async () => affiche(await window.aa.alertes.enregistrer({ actif: actif.checked })));

    relever.addEventListener("click", async () => {
      relever.disabled = true; relever.classList.add("is-busy");
      etat.className = "ia-etat"; etat.textContent = "Relève des alertes en cours…";
      const r = await window.aa.alertes.relever();
      relever.disabled = false; relever.classList.remove("is-busy");
      affiche(r);
      if (!r.ok && r.message) { etat.className = "ia-etat ko"; etat.textContent = r.message; toast(r.message, "error", 6000); return; }
      const d = r.derniere || {};
      toast("Alertes Development AID : " + plural(d.nouvelles || 0, "nouvelle offre", "nouvelles offres") + " au registre.", d.nouvelles ? "success" : "info", 6000);
    });

    effacer.addEventListener("click", async () => {
      affiche(await window.aa.alertes.effacer());
      toast("Relève des alertes effacée de ce poste.", "info");
    });

    window.aa.alertes.statut().then(affiche).catch(() => {});
  }

  function initReglagesIA() {
    const champ = $("#ia-cle");
    const bouton = $("#ia-tester");
    const efface = $("#ia-effacer");
    const choixModele = $("#ia-modele");
    const etat = $("#ia-etat");
    if (!champ || !bouton) return;

    function affiche(s) {
      iaEtat = s || iaEtat;
      etat.className = "ia-etat " + (iaEtat.cleEnregistree ? "ok" : "");
      etat.textContent = iaEtat.cleEnregistree
        ? "Clé enregistrée sur ce poste — modèle " + (iaEtat.modele || "par défaut")
        : "Aucune clé : l'assistant fonctionne avec son moteur local.";
      efface.hidden = !iaEtat.cleEnregistree;
      choixModele.hidden = !iaEtat.cleEnregistree;
      // Au démarrage, on ne connaît pas encore les modèles ouverts au compte :
      // on affiche au moins celui qui sert, plutôt qu'une liste vide.
      if (iaEtat.cleEnregistree && !choixModele.options.length && iaEtat.modele) {
        choixModele.innerHTML = '<option value="' + esc(iaEtat.modele) + '">' + esc(iaEtat.modele) + "</option>";
      }
      champ.value = "";
      champ.placeholder = iaEtat.cleEnregistree ? "Clé enregistrée — saisissez-en une autre pour la remplacer" : "sk-…";
      chatBubble.classList.toggle("ia", !!iaEtat.cleEnregistree);
      sessionIA = null;   // la prochaine question repart sur la bonne base
    }

    bouton.addEventListener("click", async () => {
      const cle = champ.value.trim();
      if (!cle) { toast("Collez d'abord la clé OpenAI.", "error"); return; }
      bouton.disabled = true; bouton.classList.add("is-busy");
      etat.className = "ia-etat"; etat.textContent = "Vérification de la clé auprès d'OpenAI…";
      const r = await window.aa.ia.tester(cle);
      bouton.disabled = false; bouton.classList.remove("is-busy");
      if (!r || !r.ok) {
        etat.className = "ia-etat ko";
        etat.textContent = (r && r.message) || "Clé refusée.";
        return;
      }
      const s = await window.aa.ia.enregistrerCle(cle);
      if (!s.ok) { etat.className = "ia-etat ko"; etat.textContent = s.erreur || "Impossible de conserver la clé."; return; }
      choixModele.innerHTML = r.modeles.map(m => '<option value="' + esc(m) + '">' + esc(m) + "</option>").join("");
      choixModele.value = s.modele || iaEtat.modeleDefaut || r.modeles[0];
      if (choixModele.value !== s.modele) await window.aa.ia.choisirModele(choixModele.value);
      affiche(await window.aa.ia.statut());
      toast("Clé vérifiée et enregistrée : l'assistant passe à l'IA.", "success", 4000);
    });

    choixModele.addEventListener("change", async () => {
      affiche(await window.aa.ia.choisirModele(choixModele.value));
      toast("Modèle : " + choixModele.value, "success", 2200);
    });

    efface.addEventListener("click", async () => {
      affiche(await window.aa.ia.effacerCle());
      toast("Clé effacée de ce poste.", "info");
    });

    window.aa.ia.statut().then(affiche).catch(() => {});
  }

  // ======================================================================
  // Temporalité : cycle de vie d'une offre
  // ----------------------------------------------------------------------
  // Une offre n'a pas un seul âge mais une trajectoire : elle est publiée,
  // elle court, elle se clôture, puis elle devient obsolète. Le registre
  // affiche cette trajectoire au lieu de laisser l'ancien s'empiler.
  // ======================================================================
  const JOURS_OBSOLESCENCE = 30;

  const CYCLES = {
    active:   { label: "En cours", cls: "cy-active",  aide: "Échéance à venir" },
    close:    { label: "Clôturée", cls: "cy-close",   aide: "Date limite passée, dossier encore vivant" },
    obsolete: { label: "Obsolète", cls: "cy-obsolete", aide: "Dépassée de plus de " + JOURS_OBSOLESCENCE + " jours" },
    sans:     { label: "Sans échéance", cls: "cy-sans", aide: "Aucune date limite connue" },
    reglee:   { label: "Réglée", cls: "cy-reglee",    aide: "Gagnée, perdue ou déposée" }
  };

  /** Une offre protégée ne part jamais d'elle-même à la corbeille. */
  function estProtegee(o) {
    return o.decision === "GO"
      || !!o.date_soumission
      || ["Soumise", "Gagnée", "Perdue"].includes(o.statut_traitement);
  }

  function cycleVie(o) {
    if (["Gagnée", "Perdue"].includes(o.statut_traitement)) return CYCLES.reglee;
    const u = urgency(o.date_limite);
    if (u.key === "none") return CYCLES.sans;
    if (u.days >= 0) return CYCLES.active;
    if (u.days < -JOURS_OBSOLESCENCE && !estProtegee(o)) return CYCLES.obsolete;
    return CYCLES.close;
  }

  /**
   * Bascule en corbeille les offres périmées depuis plus de trente jours.
   * Les offres tranchées GO, déposées ou déjà conclues sont épargnées : ce
   * sont des dossiers, pas des annonces expirées. L'opération est écrite en
   * une seule requête, et se répète sans dommage si deux postes la lancent.
   */
  let archivageFait = false;
  async function archiveObsoletes() {
    if (!sb || archivageFait) return 0;
    archivageFait = true;
    const candidats = OFFERS.filter(o => cycleVie(o) === CYCLES.obsolete);
    if (!candidats.length) return 0;
    const { error } = await sb.from("offers").update(signe({
      supprime_le: new Date().toISOString(),
      supprime_par: "Archivage automatique",
      motif_suppression: "Date limite dépassée de plus de " + JOURS_OBSOLESCENCE + " jours"
    }, "Archivage automatique")).in("id", candidats.map(o => o.id));
    if (error) { archivageFait = false; return 0; }
    toast(plural(candidats.length, "offre obsolète déplacée", "offres obsolètes déplacées") + " en corbeille.", "info", 6000);
    await loadOffers();
    return candidats.length;
  }

  // ======================================================================
  // Corbeille
  // ======================================================================
  const corbeilleFiltre = { motif: "", lot: "", texte: "" };
  const corbeilleSel = new Set();      // offres cochées (identifiants)

  /** Famille d'une mise en corbeille : archivage, nettoyage/audit, ou geste d'une personne. */
  function familleCorbeille(o) {
    const par = String(o.supprime_par || "");
    if (/archivage automatique/i.test(par)) return "auto";
    if (/audit|mapping|nettoyage|d[ée]doublonnage|veille|import/i.test(par)) return "nettoyage";
    return "manuel";
  }

  async function mettreALaCorbeille(id, motif) {
    if (!sb) { toast("Registre non connecté.", "error"); return false; }
    const { error } = await sb.from("offers").update(signe({
      supprime_le: new Date().toISOString(),
      supprime_par: whoami || "Anonyme",
      motif_suppression: motif || "Suppression manuelle"
    })).eq("id", id);
    if (error) { toast("Suppression impossible : " + error.message, "error"); return false; }
    toast("Offre déplacée en corbeille — restaurable à tout moment.", "success", 4500);
    await loadOffers();
    return true;
  }

  /** Remet au registre une ou plusieurs offres de la corbeille. */
  async function restaureOffres(ids) {
    if (!sb) { toast("Registre non connecté.", "error"); return false; }
    const liste = [].concat(ids).filter(Boolean);
    if (!liste.length) return false;
    for (let i = 0; i < liste.length; i += 100) {
      const { error } = await sb.from("offers")
        .update(signe({ supprime_le: null, supprime_par: null, motif_suppression: null }))
        .in("id", liste.slice(i, i + 100));
      if (error) { toast("Restauration impossible : " + error.message, "error"); await loadOffers(); return false; }
    }
    liste.forEach(id => corbeilleSel.delete(id));
    toast(liste.length > 1 ? plural(liste.length, "offre remise", "offres remises") + " au registre." : "Offre remise au registre.", "success");
    await loadOffers();
    return true;
  }

  /**
   * Effacement définitif, par lots de 50. Pour chaque lot : on relève les
   * documents joints, on garde trace de l'avis (la veille ne le réenregistrera
   * pas), on efface les offres — notes, avis, tâches et historique partent avec
   * elles — puis on retire leurs documents du stockage.
   * Seules des offres DÉJÀ en corbeille peuvent partir, et les dossiers engagés
   * (GO, déposés, conclus) seulement si on l'a demandé expressément.
   * La base refuse l'effacement à qui n'est pas administrateur ; on le
   * vérifie au retour plutôt que d'annoncer un succès qui n'a pas eu lieu.
   */
  async function effaceDefinitivement(ids, inclureEngagees) {
    if (!sb) { toast("Registre non connecté.", "error"); return 0; }
    if (!estAdmin()) { toast("Seul un administrateur peut supprimer définitivement une offre.", "error"); return 0; }
    const voulues = new Set([].concat(ids));
    const cibles = CORBEILLE.filter(o => voulues.has(o.id) && (inclureEngagees || !estProtegee(o)));
    let effacees = 0, documents = 0, documentsRestes = 0, refus = "";
    const toutesParties = new Set();
    for (let i = 0; i < cibles.length; i += 50) {
      const lot = cibles.slice(i, i + 50);
      const lotIds = lot.map(o => o.id);
      const pieces = await sb.from("offer_files").select("offer_id,chemin").in("offer_id", lotIds);
      await sb.from("offres_effacees").upsert(lot.map(o => ({
        hash_dedup: o.hash_dedup || o.id, titre: o.titre || null, emetteur: o.emetteur || null,
        lien_source: o.lien_source || null, motif: o.motif_suppression || null,
        efface_par: whoami || "Administrateur", efface_le: new Date().toISOString()
      })), { onConflict: "hash_dedup" }).then(r => { if (r && r.error) console.warn("Trace des offres effacées indisponible :", r.error.message); }, () => {});
      const del = await sb.from("offers").delete().in("id", lotIds).not("supprime_le", "is", null).select("id");
      if (del.error) { refus = del.error.message; break; }
      const parties = new Set((del.data || []).map(r => r.id));
      if (!parties.size) { refus = "la base n'a rien effacé : ce compte n'a pas le rôle administrateur dans le registre"; break; }
      effacees += parties.size;
      parties.forEach(id => { corbeilleSel.delete(id); toutesParties.add(id); });
      const chemins = ((pieces && pieces.data) || []).filter(p => parties.has(p.offer_id) && p.chemin).map(p => p.chemin);
      if (chemins.length) {
        const rm = await sb.storage.from(BUCKET).remove(chemins).catch(e => ({ error: e }));
        if (rm && rm.error) documentsRestes += chemins.length; else documents += chemins.length;
      }
    }
    // La fiche d'une offre qui vient d'être effacée n'a plus rien à montrer.
    if (detailDlg.open && currentDetailId && toutesParties.has(currentDetailId)) detailDlg.close();
    await loadOffers();
    if (refus && !effacees) { toast("Suppression définitive impossible : " + refus + ".", "error", 9000); return 0; }
    const msg = plural(effacees, "offre effacée", "offres effacées") + " définitivement"
      + (documents ? " avec " + plural(documents, "document", "documents") : "") + "."
      + (refus ? " Arrêt en cours de route : " + refus + "." : "")
      + (documentsRestes ? " " + plural(documentsRestes, "document n'a", "documents n'ont") + " pas pu être retiré(s) du stockage." : "");
    toast(msg, refus ? "error" : "success", 7000);
    return effacees;
  }

  // ------------------------------------------------ fenêtre de confirmation
  const purgeDlg = $("#purge-dialog");
  let purgeIds = [];

  function ouvrePurge(ids) {
    if (!estAdmin()) { toast("Seul un administrateur peut supprimer définitivement une offre.", "error"); return; }
    const offres = CORBEILLE.filter(o => ids.includes(o.id));
    if (!offres.length) return;
    purgeIds = offres.map(o => o.id);
    const engagees = offres.filter(estProtegee);
    const simples = offres.length - engagees.length;
    $("#purge-titre").textContent = offres.length > 1 ? "Supprimer définitivement " + offres.length + " offres ?" : "Supprimer définitivement cette offre ?";
    const montre = offres.slice(0, 8);
    $("#purge-liste").innerHTML = montre.map(o => `<li class="${estProtegee(o) ? "is-engagee" : ""}"><b>${esc(o.titre || "(sans titre)")}</b>
        <span>${esc([o.emetteur, o.motif_suppression].filter(Boolean).join(" · "))}</span></li>`).join("")
      + (offres.length > montre.length ? `<li class="purge-plus">… et ${offres.length - montre.length} autre${offres.length - montre.length > 1 ? "s" : ""}</li>` : "");
    const eng = $("#purge-engagees");
    eng.hidden = !engagees.length;
    eng.innerHTML = engagees.length ? `<p><b>${plural(engagees.length, "dossier engagé", "dossiers engagés")}</b> (tranché GO, déposé ou conclu) dans la sélection :
        ${engagees.length > 1 ? "ils sont épargnés" : "il est épargné"}, sauf si vous cochez ci-dessous.</p>
      <label class="check"><input type="checkbox" id="purge-inclure"> Effacer aussi ${engagees.length > 1 ? "ces dossiers" : "ce dossier"} — leur historique de soumission sera perdu</label>` : "";
    const maj = () => {
      const avec = !!($("#purge-inclure") && $("#purge-inclure").checked);
      const n = simples + (avec ? engagees.length : 0);
      $("#purge-resume").innerHTML = n
        ? `<b>${plural(n, "offre", "offres")}</b> ${n > 1 ? "seront effacées" : "sera effacée"} de la base, pour toute l'équipe. Elles ne pourront plus être restaurées.`
        : "Rien à effacer tant que les dossiers engagés sont épargnés.";
      const b = $("#purge-confirmer");
      b.disabled = !n;
      $("span", b).textContent = n ? "Supprimer définitivement (" + n + ")" : "Supprimer définitivement";
    };
    eng.onchange = maj;
    maj();
    const b = $("#purge-confirmer"); b.classList.remove("is-busy");
    purgeDlg.showModal();
  }

  $("#purge-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = $("#purge-confirmer");
    if (b.disabled) return;
    const inclure = !!($("#purge-inclure") && $("#purge-inclure").checked);
    b.disabled = true; b.classList.add("is-busy");
    $("span", b).textContent = "Suppression en cours…";
    try { await effaceDefinitivement(purgeIds, inclure); }
    finally { b.disabled = false; b.classList.remove("is-busy"); purgeDlg.close(); }
  });

  // ------------------------------------------------ fiche d'une offre en corbeille
  /** Bandeau en tête de fiche : la fiche se lit, mais on ne travaille pas une offre en corbeille. */
  function renderBandeauCorbeille(o) {
    const bandeau = $("#dlg-corb");
    const enCorbeille = !!o.supprime_le;
    detailDlg.classList.toggle("en-corbeille", enCorbeille);
    if (!bandeau) return;
    bandeau.hidden = !enCorbeille;
    if (!enCorbeille) { bandeau.innerHTML = ""; return; }
    bandeau.innerHTML = `${icon("trash")}
      <div class="corb-bandeau-txt"><b>Offre en corbeille</b> depuis le ${esc(fmtDate(o.supprime_le))}${o.supprime_par ? " — " + esc(o.supprime_par) : ""}
        <span>${esc(o.motif_suppression || "Sans motif indiqué")}</span></div>
      <div class="corb-bandeau-act">
        <button class="btn small" type="button" data-corb-restore="${esc(o.id)}">${icon("refresh")}Restaurer</button>
        <button class="btn small danger" type="button" data-admin-only data-corb-purge="${esc(o.id)}">${icon("trash")}Supprimer définitivement</button>
      </div>`;
  }

  // ------------------------------------------------ l'onglet
  function lignesCorbeille() {
    const q = aplatiRecherche(corbeilleFiltre.texte).trim();
    return CORBEILLE.slice()
      .sort((a, b) => String(b.supprime_le || "").localeCompare(String(a.supprime_le || "")))
      .filter(o => !corbeilleFiltre.motif || familleCorbeille(o) === corbeilleFiltre.motif)
      .filter(o => !corbeilleFiltre.lot || (o.supprime_par || "—") === corbeilleFiltre.lot)
      .filter(o => !q || aplatiRecherche([o.titre, o.emetteur, o.motif_suppression, o.supprime_par, o.type].join(" ")).includes(q));
  }

  function renderCorbeille() {
    const box = $("#corbeille-body");
    if (!box) return;
    // La sélection ne garde que des offres encore en corbeille.
    const presentes = new Set(CORBEILLE.map(o => o.id));
    [...corbeilleSel].forEach(id => { if (!presentes.has(id)) corbeilleSel.delete(id); });

    const rows = lignesCorbeille();
    const compte = { auto: 0, nettoyage: 0, manuel: 0 };
    CORBEILLE.forEach(o => compte[familleCorbeille(o)]++);
    $("#kpis-corbeille").innerHTML = [
      { key: "c-all", label: "Offres en corbeille", value: CORBEILLE.length, hint: "Restaurables tant qu'elles n'ont pas été effacées", ic: "trash", teinte: "dark" },
      { key: "c-auto", label: "Archivées automatiquement", value: compte.auto, hint: "Périmées depuis plus de " + JOURS_OBSOLESCENCE + " jours", ic: "clock", teinte: "sky" },
      { key: "c-net", label: "Nettoyages et audits", value: compte.nettoyage, hint: "Hors sujet, closes, doublons écartés en lot", ic: "radar", teinte: "teal" },
      { key: "c-man", label: "Supprimées à la main", value: compte.manuel, hint: "Depuis la fiche d'une offre", ic: "user", teinte: "blue" }
    ].map(kpiTile).join("");
    animerCompteurs($("#kpis-corbeille"));

    // Lots de suppression (qui / quel nettoyage), du plus fourni au moins fourni.
    const lots = new Map();
    CORBEILLE.forEach(o => { const k = o.supprime_par || "—"; lots.set(k, (lots.get(k) || 0) + 1); });
    if (corbeilleFiltre.lot && !lots.has(corbeilleFiltre.lot)) corbeilleFiltre.lot = "";
    $("#corbeille-lot").innerHTML = '<option value="">Tous les lots</option>'
      + [...lots.entries()].sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `<option value="${esc(k)}"${k === corbeilleFiltre.lot ? " selected" : ""}>${esc(k)} (${n})</option>`).join("");

    $("#corbeille-count").textContent = plural(rows.length, "offre", "offres");
    const vide = !rows.length;
    $("#corbeille-empty").hidden = !vide;
    $("#corbeille-empty-titre").textContent = CORBEILLE.length ? "Aucune offre ne correspond" : "La corbeille est vide";
    $("#corbeille-empty-texte").textContent = CORBEILLE.length ? "Changez de filtre ou de recherche." : "Aucune offre supprimée ni archivée pour le moment.";
    $(".corb-table").hidden = vide;
    $$("#corbeille-filters .chip").forEach(b => b.classList.toggle("is-active", b.dataset.corb === corbeilleFiltre.motif));

    box.innerHTML = rows.map(o => {
      const fm = filialeMeta(o.filiale);
      const coche = corbeilleSel.has(o.id);
      const engagee = estProtegee(o);
      return `<tr data-open="${esc(o.id)}" class="${coche ? "is-sel" : ""}" title="Ouvrir la fiche de cette offre">
        <td class="corb-chk"><input type="checkbox" data-corb-sel="${esc(o.id)}"${coche ? " checked" : ""} title="Cocher cette offre"></td>
        <td class="t-main">
          <div class="t-title" title="${esc(o.titre || "")}">${esc(o.titre || "(sans titre)")}</div>
          <div class="t-sub">${engagee ? '<span class="corb-engagee" title="Tranchée GO, déposée ou conclue : jamais effacée dans un lot">Dossier engagé</span> ' : ""}${esc([o.emetteur, o.type, sourceLabel(o.source_id)].filter(Boolean).join(" · "))}</div>
        </td>
        <td class="${fm.cls}"><span class="fbadge">${esc(fm.short)}</span></td>
        <td class="muted nowrap">${esc(fmtDate(o.date_limite, { day: "2-digit", month: "2-digit", year: "numeric" }))}</td>
        <td class="muted corb-motif" title="${esc(o.motif_suppression || "")}">${esc(o.motif_suppression || "—")}</td>
        <td class="muted corb-par"><span title="${esc(o.supprime_par || "")}">${esc(o.supprime_par || "—")}</span><span class="t-sub">${esc(fmtDate(o.supprime_le))}</span></td>
        <td><div class="corb-actions">
          <button class="btn small" type="button" data-corb-restore="${esc(o.id)}" title="Remettre cette offre au registre">${icon("refresh")}Restaurer</button>
          <button class="icon-btn corb-effacer" type="button" data-admin-only data-corb-purge="${esc(o.id)}" title="Supprimer définitivement">${icon("trash")}</button>
        </div></td>
      </tr>`;
    }).join("");
    majSelectionCorbeille(rows);
  }

  /** Barre de sélection et case « tout cocher » (sur les offres affichées). */
  function majSelectionCorbeille(rows) {
    const affichees = rows || lignesCorbeille();
    const n = corbeilleSel.size;
    $("#corbeille-selbar").hidden = !n;
    $("#corbeille-selnb").innerHTML = "<b>" + plural(n, "offre cochée", "offres cochées") + "</b>";
    const cochees = affichees.filter(o => corbeilleSel.has(o.id)).length;
    const tout = $("#corbeille-tout");
    tout.checked = !!affichees.length && cochees === affichees.length;
    tout.indeterminate = cochees > 0 && cochees < affichees.length;
    $$("#corbeille-body tr").forEach(tr => tr.classList.toggle("is-sel", corbeilleSel.has(tr.dataset.open)));
  }

  $("#corbeille-tout").addEventListener("change", (e) => {
    const affichees = lignesCorbeille();
    affichees.forEach(o => e.target.checked ? corbeilleSel.add(o.id) : corbeilleSel.delete(o.id));
    $$("#corbeille-body [data-corb-sel]").forEach(c => { c.checked = corbeilleSel.has(c.dataset.corbSel); });
    majSelectionCorbeille(affichees);
  });
  $("#corbeille-body").addEventListener("change", (e) => {
    const c = e.target.closest("[data-corb-sel]");
    if (!c) return;
    c.checked ? corbeilleSel.add(c.dataset.corbSel) : corbeilleSel.delete(c.dataset.corbSel);
    majSelectionCorbeille();
  });
  $("#corbeille-lot").addEventListener("change", (e) => { corbeilleFiltre.lot = e.target.value; renderCorbeille(); });
  let corbRechercheMinuteur = null;
  $("#corbeille-recherche").addEventListener("input", (e) => {
    clearTimeout(corbRechercheMinuteur);
    corbRechercheMinuteur = setTimeout(() => { corbeilleFiltre.texte = e.target.value; renderCorbeille(); }, 140);
  });
  $("#corbeille-sel-vider").addEventListener("click", () => { corbeilleSel.clear(); renderCorbeille(); });
  $("#corbeille-sel-restaurer").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try { await restaureOffres([...corbeilleSel]); } finally { b.disabled = false; }
  });
  $("#corbeille-sel-effacer").addEventListener("click", () => ouvrePurge([...corbeilleSel]));

  document.addEventListener("click", (e) => {
    const chip = e.target.closest("#corbeille-filters [data-corb]");
    if (chip) { corbeilleFiltre.motif = chip.dataset.corb; renderCorbeille(); return; }

    const res = e.target.closest("[data-corb-restore]");
    if (res) {
      res.disabled = true;
      restaureOffres([res.dataset.corbRestore]).finally(() => { res.disabled = false; });
      return;
    }
    const pur = e.target.closest("[data-corb-purge]");
    if (pur) ouvrePurge([pur.dataset.corbPurge]);
  });

  // Suppression depuis la fiche d'une offre
  document.addEventListener("click", (e) => {
    const b = e.target.closest("#dlg-supprimer");
    if (!b || !currentDetailId) return;
    const o = OFFERS.find(x => x.id === currentDetailId);
    if (!o) return;
    if (!b.dataset.confirm) {
      b.dataset.confirm = "1";
      b.classList.add("is-danger");
      toast("Cliquez à nouveau pour envoyer cette offre en corbeille.", "info", 3800);
      setTimeout(() => { delete b.dataset.confirm; b.classList.remove("is-danger"); }, 4200);
      return;
    }
    mettreALaCorbeille(currentDetailId, "Supprimée depuis la fiche").then(ok => { if (ok) $("#detail").close(); });
  });

  // ======================================================================
  // Provenance de l'information
  // ----------------------------------------------------------------------
  // D'où vient cette ligne ? La question se pose à chaque offre : le
  // logiciel doit y répondre sans qu'on ouvre la fiche.
  // ======================================================================
  function provenance(o) {
    const id = o.source_id || "manuel";
    const auto = !["manuel", "seed", "hors-logiciel", "import-excel", "assistant"].includes(id);
    const src = String(id).startsWith("src:") ? SOURCES.find(x => x.id === String(id).slice(4)) : null;
    return {
      auto,
      libelle: sourceLabel(id),
      court: sourceLabel(id).replace(/^(Veille|Import) · /, ""),
      importee: !!IMPORTS[id],
      url: o.lien_source || (src ? src.url : ""),
      site: (() => { try { return new URL(o.lien_source || (src ? src.url : "")).hostname.replace(/^www\./, ""); } catch (_) { return ""; } })(),
      par: o.created_by && o.created_by !== "seed" ? o.created_by : "",
      quand: o.created_at || ""
    };
  }

  function provenanceChip(o) {
    const p = provenance(o);
    const titre = p.libelle + (p.site ? " — " + p.site : "") + (p.quand ? " · au registre le " + fmtDate(p.quand) : "");
    return `<span class="prov ${p.auto ? "is-auto" : "is-manuel"}" title="${esc(titre)}">
      ${icon(p.auto ? "radar" : "user")}<span>${esc(p.court)}</span>${p.site ? `<em>${esc(p.site)}</em>` : ""}</span>`;
  }

  // ======================================================================
  // Offres tranchées GO : suivi, prochaines étapes et plan de travail
  // ----------------------------------------------------------------------
  // Un GO n'est pas une fin, c'est le début d'un chantier. Cet onglet montre
  // ce qu'il reste à faire, qui le fait, et pour quand — le plan est calculé
  // à rebours depuis la date limite, puis retouché à la main.
  // ======================================================================
  const MODELE_PLAN = [
    { libelle: "Cadrage de l'équipe et du partenaire", detail: "Chef de file, experts pressentis, accord de groupement si besoin.", jours: 21 },
    { libelle: "Dossier administratif", detail: "Attestations fiscales et sociales, agréments, quitus, pièces d'identité de l'entreprise.", jours: 18 },
    { libelle: "Références et attestations de bonne fin", detail: "Missions comparables, contacts vérifiables, attestations signées.", jours: 14 },
    { libelle: "CV des experts et lettres d'engagement", detail: "CV au format demandé, diplômes, lettres d'exclusivité signées.", jours: 11 },
    { libelle: "Note méthodologique et plan de travail", detail: "Compréhension des TDR, démarche, calendrier, organisation de l'équipe.", jours: 8 },
    { libelle: "Offre financière et budget", detail: "Chiffrage, honoraires, frais remboursables, contrôle de cohérence avec la méthodo.", jours: 5 },
    { libelle: "Relecture, conformité, assemblage", detail: "Relecture croisée, vérification pièce à pièce de la liste des TDR, pagination, signatures.", jours: 3 },
    { libelle: "Dépôt / transmission", detail: "Dépôt physique ou plateforme, accusé de réception conservé au dossier.", jours: 1 }
  ];

  let TACHES = [];                 // toutes les tâches, toutes offres confondues
  let planOffreId = null;          // offre dont le plan est ouvert
  const goFiltre = { phase: "prepa", filiale: "" };


  /** Les offres tranchées GO, hors dossiers déjà perdus. */
  function offresGo() {
    return OFFERS.filter(o => o.decision === "GO" && o.statut_traitement !== "Perdue");
  }

  function phaseGo(o) {
    if (["Gagnée", "Perdue"].includes(o.statut_traitement) || /gagn|perdu|retrait|annul/i.test(o.resultat || "")) return "conclue";
    if (o.date_soumission || o.statut_traitement === "Soumise") return "deposee";
    return "prepa";
  }

  // Rangées une fois par chargement, au lieu d'un balayage et d'un tri de
  // toute la table à chaque appel — il y en avait une centaine par rendu de
  // l'onglet GO, lui-même rejoué à chaque frappe de recherche.
  let TACHES_PAR_OFFRE = new Map();

  function rangeTaches() {
    TACHES_PAR_OFFRE = new Map();
    TACHES.forEach(t => {
      const l = TACHES_PAR_OFFRE.get(t.offer_id);
      if (l) l.push(t); else TACHES_PAR_OFFRE.set(t.offer_id, [t]);
    });
    TACHES_PAR_OFFRE.forEach(l => l.sort((a, b) =>
      (a.ordre - b.ordre) || String(a.echeance || "").localeCompare(String(b.echeance || ""))));
  }

  function tachesDe(id) {
    return TACHES_PAR_OFFRE.get(id) || [];
  }

  /**
   * Met à jour la seule étiquette d'un curseur de pondération, sans toucher
   * au curseur lui-même. Voir le gestionnaire « input » plus bas.
   */
  function majEtiquettePoids(curseur) {
    const cle = curseur.dataset.poids;
    const pct = Math.round((POIDS[cle] || 0) * 100) + " %";
    const ligne = curseur.closest(".poids-ligne") || curseur.parentElement;
    const val = ligne && ligne.querySelector("b");
    if (val) val.textContent = pct;
    $$("[data-poids-label='" + cle + "']").forEach(e => { e.textContent = pct; });
  }

  /**
   * Transforme un texte en HTML sûr : tout est échappé, seuls les retours à
   * la ligne deviennent des sauts. C'est le seul chemin par lequel du texte
   * venu de l'extérieur entre dans le fil de discussion.
   */
  function texteEnHtml(texte) {
    return esc(String(texte == null ? "" : texte)).replace(/\n/g, "<br>");
  }

  function avancement(id) {
    const l = tachesDe(id);
    const faits = l.filter(t => t.fait).length;
    const aujourdhui = jourIsoDe(new Date());
    const retard = l.filter(t => !t.fait && t.echeance && t.echeance < aujourdhui).length;
    const suivante = l.find(t => !t.fait) || null;
    return { total: l.length, faits, retard, suivante, pct: l.length ? Math.round((faits / l.length) * 100) : 0 };
  }

  async function loadTaches() {
    if (!sb) return;
    const { data, error } = await sb.from("offer_taches").select("*");
    if (error) return;
    TACHES = data || [];
    rangeTaches();
    rafraichit("go", "bord");
    if (planOffreId && $("#plan-dialog").open) renderPlan();
  }

  /** Répartit les huit étapes à rebours de la date limite, sans date dans le passé. */
  function datesPlan(o) {
    const base = o.date_limite ? new Date(o.date_limite + "T00:00:00") : null;
    const aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0);
    return MODELE_PLAN.map((e, i) => {
      if (!base) return null;
      const d = new Date(base.getTime() - e.jours * 86400000);
      // Un plan qui commence hier ne sert à personne : on tasse les étapes
      // en retard sur les jours qui restent.
      if (d < aujourdhui) {
        const reste = Math.max(0, Math.round((base - aujourdhui) / 86400000));
        const pas = reste / (MODELE_PLAN.length + 1);
        return jourIsoDe(new Date(aujourdhui.getTime() + Math.round(pas * (i + 1)) * 86400000));
      }
      return jourIsoDe(d);
    });
  }

  async function genererPlan(id) {
    const o = OFFERS.find(x => x.id === id);
    if (!o || !sb) return;
    if (tachesDe(id).length) { toast("Cette offre a déjà un plan de travail.", "info"); return; }
    const dates = datesPlan(o);
    const lignes = MODELE_PLAN.map((e, i) => ({
      offer_id: id, ordre: i + 1, libelle: e.libelle, detail: e.detail,
      responsable: i === MODELE_PLAN.length - 1 ? (o.assigne || "") : (o.assigne || ""),
      echeance: dates[i], created_by: whoami || "Anonyme"
    }));
    const { error } = await sb.from("offer_taches").insert(lignes);
    if (error) { toast("Plan non créé : " + error.message, "error"); return; }
    toast("Plan de travail en " + MODELE_PLAN.length + " étapes créé.", "success");
    await loadTaches();
  }

  function renderGo() {
    const grille = $("#go-grid");
    if (!grille) return;
    const toutes = offresGo();
    const rows = toutes
      .filter(o => (!goFiltre.phase || phaseGo(o) === goFiltre.phase))
      .filter(o => (!goFiltre.filiale || (o.filiale || "") === goFiltre.filiale))
      .sort((a, b) => String(a.date_limite || "9999").localeCompare(String(b.date_limite || "9999")));

    const prepa = toutes.filter(o => phaseGo(o) === "prepa");
    const enRetard = prepa.filter(o => avancement(o.id).retard > 0).length;
    const sansPlan = prepa.filter(o => !tachesDe(o.id).length).length;

    $("#kpis-go").innerHTML = [
      { key: "g-all", label: "Offres tranchées GO", value: toutes.length, hint: prepa.length + " en préparation", ic: "thumb-up", teinte: "dark" },
      { key: "g-late", label: "Étapes en retard", value: enRetard, hint: enRetard ? "Dossiers à relancer aujourd'hui" : "Aucun retard", ic: "alert", teinte: "crit" },
      { key: "g-plan", label: "Sans plan de travail", value: sansPlan, hint: "Un clic suffit à le générer", ic: "list", teinte: "sky" },
      { key: "g-dep", label: "Déposées", value: toutes.filter(o => phaseGo(o) === "deposee").length, hint: "En attente de dépouillement", ic: "flag", teinte: "teal" }
    ].map(kpiTile).join("");
    animerCompteurs($("#kpis-go"));

    const phases = [{ k: "prepa", l: "En préparation" }, { k: "deposee", l: "Déposées" }, { k: "conclue", l: "Conclues" }, { k: "", l: "Toutes" }];
    $("#go-filters").innerHTML = phases.map(p =>
      `<button type="button" class="chip${goFiltre.phase === p.k ? " is-active" : ""}" data-go-phase="${esc(p.k)}">${esc(p.l)}<span class="n">${toutes.filter(o => !p.k || phaseGo(o) === p.k).length}</span></button>`).join("");

    const parFiliale = {};
    toutes.forEach(o => { parFiliale[o.filiale || ""] = (parFiliale[o.filiale || ""] || 0) + 1; });
    $("#go-filiales").innerHTML = [{ value: "", short: "Toutes filiales", cls: "" }]
      .concat(FILIALES.filter(f => parFiliale[f.value]))
      .map(f => `<button type="button" class="ftab ${f.cls}${goFiltre.filiale === f.value ? " is-active" : ""}" data-go-filiale="${esc(f.value)}">
        ${f.cls ? '<span class="fdot"></span>' : ""}${esc(f.short)}<span class="n">${f.value ? parFiliale[f.value] : toutes.length}</span></button>`).join("");

    $("#go-count").textContent = plural(rows.length, "offre", "offres");
    $("#go-empty").hidden = rows.length > 0;

    grille.innerHTML = rows.map(o => {
      const a = avancement(o.id);
      const fm = filialeMeta(o.filiale);
      const u = urgency(o.date_limite);
      const etat = a.total === 0 ? "sans-plan" : a.retard ? "retard" : a.pct === 100 ? "fini" : "ok";
      const suiv = a.suivante;
      return `<article class="go-card ${fm.cls} is-${etat}">
        <div class="go-top">
          <span class="fbadge">${esc(fm.short)}</span>
          ${duePill(o, true)}
        </div>
        <h3 data-open="${esc(o.id)}" role="button" tabindex="0">${esc(o.titre || "(sans titre)")}</h3>
        <div class="go-emit">${esc(o.emetteur || "Émetteur non renseigné")}</div>
        <div class="go-bar" title="${a.faits} étape(s) sur ${a.total}">
          <span style="width:${a.pct}%"></span>
        </div>
        <div class="go-bar-legend"><b>${a.pct}&nbsp;%</b><span>${a.total ? a.faits + " / " + a.total + " étapes" : "aucun plan"}</span>
          ${a.retard ? `<span class="go-late">${icon("alert")}${plural(a.retard, "étape en retard", "étapes en retard")}</span>` : ""}</div>
        <div class="go-next">
          <span class="go-next-label">Prochaine étape</span>
          ${suiv
            ? `<b>${esc(suiv.libelle)}</b><span class="go-next-meta">${suiv.echeance ? "pour le " + esc(fmtDate(suiv.echeance, { day: "numeric", month: "short" })) : "sans date"}${suiv.responsable ? " · " + esc(suiv.responsable) : ""}</span>`
            : a.total ? "<b>Toutes les étapes sont faites.</b>" : "<b>Plan de travail à générer.</b>"}
        </div>
        <div class="go-actions">
          ${a.total
            ? `<button class="btn small primary" type="button" data-plan="${esc(o.id)}">${icon("list")}Ouvrir le plan</button>`
            : `<button class="btn small primary" type="button" data-plan-gen="${esc(o.id)}">${icon("plus")}Générer le plan</button>`}
          <button class="btn small" type="button" data-open="${esc(o.id)}">${icon("file")}Fiche</button>
          ${phaseGo(o) === "prepa" ? `<button class="btn small go-tenderai" type="button" data-tenderai="${esc(o.id)}" title="Ouvre Tender AI Agent : fiche et TDR repris, proposition technique rédigée puis déposée dans les documents de l'offre">${icon("edit")}Rédiger avec Tender AI</button>` : ""}
        </div>
        ${u.key === "cloture" && phaseGo(o) === "prepa" ? `<p class="go-warn">${icon("alert")}Date limite dépassée et dossier non déposé.</p>` : ""}
      </article>`;
    }).join("");
  }

  document.addEventListener("click", (e) => {
    const ph = e.target.closest("[data-go-phase]");
    if (ph) { goFiltre.phase = ph.dataset.goPhase; renderGo(); return; }
    const fi = e.target.closest("[data-go-filiale]");
    if (fi) { goFiltre.filiale = goFiltre.filiale === fi.dataset.goFiliale ? "" : fi.dataset.goFiliale; renderGo(); return; }
    const gen = e.target.closest("[data-plan-gen]");
    if (gen) { genererPlan(gen.dataset.planGen); return; }
    const ouv = e.target.closest("[data-plan]");
    if (ouv) { ouvrePlan(ouv.dataset.plan); return; }
    const tai = e.target.closest("[data-tenderai]");
    if (tai) {
      if (!window.aa || !window.aa.tenderai) { toast("Cette fonction demande l'application installée.", "info"); return; }
      tai.disabled = true;
      window.aa.tenderai.ouvrir(tai.dataset.tenderai).then((r) => {
        tai.disabled = false;
        if (r && r.ok) toast("Tender AI s'ouvre sur cette offre : la proposition sera déposée dans ses documents.", "success");
        else toast((r && r.raison) || "Tender AI n'a pas pu être lancé.", "error");
      });
      return;
    }
  });

  // ----------------------------------------------------------- le plan lui-même
  function ouvrePlan(id) {
    planOffreId = id;
    renderPlan();
    const dlg = $("#plan-dialog");
    if (!dlg.open) dlg.showModal();
  }

  function renderPlan() {
    const o = OFFERS.find(x => x.id === planOffreId);
    if (!o) return;
    const l = tachesDe(planOffreId);
    const a = avancement(planOffreId);
    const aujourdhui = jourIsoDe(new Date());
    $("#plan-titre").textContent = o.titre || "(sans titre)";
    $("#plan-sous").innerHTML = `${esc(o.emetteur || "")} · dépôt le <b>${esc(fmtDate(o.date_limite))}</b> · ${a.faits} / ${a.total} étapes`;
    $("#plan-bar").innerHTML = `<span style="width:${a.pct}%"></span>`;
    $("#plan-liste").innerHTML = l.map(t => {
      const retard = !t.fait && t.echeance && t.echeance < aujourdhui;
      return `<div class="tache${t.fait ? " is-done" : ""}${retard ? " is-late" : ""}" data-tache="${esc(t.id)}">
        <button class="tache-check" type="button" data-tache-toggle="${esc(t.id)}" title="${t.fait ? "Rouvrir cette étape" : "Marquer comme faite"}">${icon("check")}</button>
        <div class="tache-main">
          <div class="tache-titre">${esc(t.libelle)}</div>
          ${t.detail ? `<div class="tache-detail">${esc(t.detail)}</div>` : ""}
          ${t.fait && t.fait_par ? `<div class="tache-detail">Fait par ${esc(t.fait_par)}${t.fait_le ? " le " + esc(fmtDate(t.fait_le)) : ""}</div>` : ""}
        </div>
        <input class="tache-resp" type="text" placeholder="Responsable" value="${esc(t.responsable || "")}" data-tache-resp="${esc(t.id)}">
        <input class="tache-date" type="date" value="${esc(t.echeance || "")}" data-tache-date="${esc(t.id)}">
        <button class="icon-btn" type="button" data-tache-del="${esc(t.id)}" title="Retirer cette étape">${icon("trash")}</button>
      </div>`;
    }).join("") || '<p class="muted-line">Aucune étape. Générez le plan type ou ajoutez la première étape.</p>';
    $("#plan-vide").hidden = l.length > 0;
  }

  async function majTache(id, patch) {
    if (!sb) return;
    const { error } = await sb.from("offer_taches").update(patch).eq("id", id);
    if (error) { toast("Modification non enregistrée : " + error.message, "error"); return; }
    await loadTaches();
  }

  $("#plan-liste").addEventListener("click", async (e) => {
    const t = e.target.closest("[data-tache-toggle]");
    if (t) {
      const tache = TACHES.find(x => x.id === t.dataset.tacheToggle);
      if (!tache) return;
      await majTache(tache.id, tache.fait
        ? { fait: false, fait_le: null, fait_par: null }
        : { fait: true, fait_le: new Date().toISOString(), fait_par: whoami || "Anonyme" });
      return;
    }
    const d = e.target.closest("[data-tache-del]");
    if (d) {
      if (!d.dataset.confirm) {
        d.dataset.confirm = "1"; d.classList.add("is-danger");
        toast("Cliquez à nouveau pour retirer cette étape.", "info", 3200);
        setTimeout(() => { delete d.dataset.confirm; d.classList.remove("is-danger"); }, 3600);
        return;
      }
      const { error } = await sb.from("offer_taches").delete().eq("id", d.dataset.tacheDel);
      if (error) { toast("Suppression impossible : " + error.message, "error"); return; }
      await loadTaches();
    }
  });

  $("#plan-liste").addEventListener("change", (e) => {
    const r = e.target.closest("[data-tache-resp]");
    if (r) { majTache(r.dataset.tacheResp, { responsable: r.value.trim() || null }); return; }
    const d = e.target.closest("[data-tache-date]");
    if (d) { majTache(d.dataset.tacheDate, { echeance: d.value || null }); return; }
  });

  $("#plan-ajout").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!planOffreId || !sb) return;
    const f = e.target;
    const libelle = f.libelle.value.trim();
    if (!libelle) return;
    const ordre = (tachesDe(planOffreId).reduce((m, t) => Math.max(m, t.ordre), 0) || 0) + 1;
    const { error } = await sb.from("offer_taches").insert({
      offer_id: planOffreId, ordre, libelle,
      responsable: f.responsable.value.trim() || null,
      echeance: f.echeance.value || null,
      created_by: whoami || "Anonyme"
    });
    if (error) { toast("Étape non ajoutée : " + error.message, "error"); return; }
    f.reset();
    await loadTaches();
  });

  $("#plan-generer").addEventListener("click", () => { if (planOffreId) genererPlan(planOffreId); });
  $("#plan-fiche").addEventListener("click", () => { if (planOffreId) { $("#plan-dialog").close(); openDetail(planOffreId); } });

  // ======================================================================
  // Tableau de bord global — état des lieux par filiale
  // ----------------------------------------------------------------------
  // Une ligne par filiale, les mêmes colonnes pour toutes, et l'année
  // entière lisible d'un coup d'œil : c'est ce qu'on ouvre en décembre.
  // ======================================================================
  const bordFiltre = { annee: String(new Date().getFullYear()) };



  /** Toutes les offres de l'année, corbeille comprise : un bilan annuel ne
   *  peut pas oublier ce qu'on a écarté — c'est justement ce qu'on veut voir. */
  function baseBilan() {
    const toutes = OFFERS.concat(CORBEILLE);
    return bordFiltre.annee ? toutes.filter(o => anneeDe(o) === bordFiltre.annee) : toutes;
  }


  // ======================================================================
  // Tableau de bord — l'entonnoir et le damier
  //
  // L'écran précédent était un bilan de fin d'année : détectées, GO, NO GO,
  // déposées, gagnées, perdues, attente, taux, délai. Sur un registre où
  // presque rien n'a encore été arbitré, il n'affichait que des zéros et des
  // tirets, et son histogramme alignait trente-six barres pour trois mois
  // renseignés. On répond désormais à la question que les données peuvent
  // trancher — « où les offres se perdent-elles ? » — et les colonnes de
  // résultats réapparaissent d'elles-mêmes dès qu'elles portent un chiffre.
  // ======================================================================
  const MOIS_COURTS = ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];
  const TOUTES_FILIALES = () => FILIALES.concat([{ value: "", short: "À qualifier", cls: "f-none" }]);

  function moisDe(o) {
    const m = Number(String(o.date_limite || o.date_publication || o.created_at || "").slice(5, 7));
    return m >= 1 && m <= 12 ? m - 1 : -1;
  }

  /** Les cinq marches, de ce que la veille ramène à ce que le groupe gagne. */
  function marchesEntonnoir(rows) {
    const vivantes = rows.filter(o => !o.supprime_le);
    return [
      { cle: "collectees", lab: "Collectées",   sous: "tout ce que la veille a ramené",  n: rows.length,                                      teinte: "#96CCC5" },
      { cle: "retenues",   lab: "Retenues",     sous: "après le filtre et la corbeille", n: vivantes.length,                                  teinte: "#5FB1A7" },
      { cle: "go",         lab: "Engagées",     sous: "GO tranché, ou dossier déjà parti", n: vivantes.filter(estEngagee).length,             teinte: "#34998C" },
      { cle: "deposees",   lab: "Déposées",     sous: "dossier remis dans les délais",   n: vivantes.filter(estSoumise).length,               teinte: "#1D7B70" },
      { cle: "gagnees",    lab: "Gagnées",      sous: "marché attribué",                 n: vivantes.filter(estGagnee).length,                 teinte: "#115C67" }
    ];
  }

  // Ce qui reste en arrière entre deux marches, nommé pour ce que c'est.
  const PERTE = {
    collectees: { cle: "ecartees",     un: "écartée par le filtre",  plusieurs: "écartées par le filtre" },
    retenues:   { cle: "aarbitrer",    un: "restée sans suite",       plusieurs: "restées sans suite" },
    go:         { cle: "gonondepose",  un: "engagée sans dépôt",      plusieurs: "engagées sans dépôt" },
    deposees:   { cle: "sansresultat", un: "sans résultat connu",     plusieurs: "sans résultat connu" }
  };

  function renderEntonnoir(rows) {
    const hote = $("#bord-entonnoir");
    if (!hote) return;
    const m = marchesEntonnoir(rows);
    const max = Math.max(1, m[0].n);
    hote.innerHTML = m.map((e, i) => {
      const largeur = Math.max(4, (e.n / max) * 100).toFixed(1);
      const marche = `<button type="button" class="ent-marche" data-bord-etape="${e.cle}"
          title="Ouvrir la liste correspondante">
        <span class="ent-lab"><b>${e.lab}</b><span>${e.sous}</span></span>
        <span class="ent-barre" style="width:${largeur}%;background:${e.teinte}">${e.n}</span></button>`;
      if (i === m.length - 1) return marche;
      const suiv = m[i + 1].n;
      const taux = e.n ? Math.round((suiv / e.n) * 100) : 0;
      const perdu = e.n - suiv;
      const p = PERTE[e.cle];
      return marche + `<div class="ent-saut"><div></div><div class="ent-taux">
        <span>↓ <b>${taux} %</b> passent l'étape</span>
        ${perdu > 0 ? `<button type="button" class="ent-perte" data-bord-etape="${p.cle}">· ${perdu} ${perdu > 1 ? p.plusieurs : p.un}</button>` : ""}
      </div></div>`;
    }).join("");
  }

  /**
   * Damier : une case par filiale et par mois, une seule teinte, plus foncée
   * quand il y a plus. L'œil compare des intensités et des positions — jamais
   * des couleurs qu'il faudrait retenir. Le chiffre reste écrit dans la case :
   * la couleur ne porte donc jamais l'information seule.
   */
  function damierMensuel(rows) {
    const vivantes = rows.filter(o => !o.supprime_le);
    const lignes = TOUTES_FILIALES().map(f => {
      const mois = new Array(12).fill(0);
      vivantes.filter(o => (o.filiale || "") === f.value)
        .forEach(o => { const m = moisDe(o); if (m >= 0) mois[m]++; });
      return { f, mois };
    });
    const max = Math.max(1, ...lignes.reduce((t, l) => t.concat(l.mois), []));
    const pas = v => v ? "d" + Math.min(7, 1 + Math.round((v / max) * 5)) : "d0";
    const encre = v => !v ? "transparent" : (v / max > 0.45 ? "#fff" : "var(--aa-dark)");
    return "<thead><tr><th class=\"g\"></th>" + MOIS_COURTS.map(m => `<th>${m}</th>`).join("") + "</tr></thead><tbody>"
      + lignes.map(l => `<tr><td class="g">${esc(l.f.short)}</td>` + l.mois.map((v, i) =>
          `<td class="${pas(v)}" style="color:${encre(v)}" data-bord-filiale="${esc(l.f.value)}"
             title="${esc(l.f.short)} · ${MOIS_COURTS[i]} : ${plural(v, "offre", "offres")}">${v || ""}</td>`).join("")
        + "</tr>").join("") + "</tbody>";
  }

  /** Le même entonnoir, en réduction, filiale par filiale et à la même échelle. */
  function renderMinis(rows) {
    const hote = $("#bord-minis");
    if (!hote) return;
    const vivantes = rows.filter(o => !o.supprime_le);
    const lignes = TOUTES_FILIALES().map(f => {
      const miennes = vivantes.filter(o => (o.filiale || "") === f.value);
      return { f, n: miennes.length, go: miennes.filter(estEngagee).length };
    });
    const max = Math.max(1, ...lignes.map(l => l.n));
    hote.innerHTML = lignes.map(l => `<button type="button" class="mini" data-bord-filiale="${esc(l.f.value)}"
        title="Ouvrir le registre filtré sur ${esc(l.f.short)}">
      <span class="mini-tete"><span class="mini-nom">${esc(l.f.short)}</span>
        ${l.n ? `<span>${plural(l.n, "offre", "offres")} · ${l.go} engagée${l.go > 1 ? "s" : ""}</span>`
              : '<span class="mini-vide">aucune offre au registre</span>'}</span>
      ${l.n ? `<span class="mini-piste"><i style="width:${(l.n / max * 100).toFixed(1)}%"></i>${
          l.go ? `<i style="width:${(l.go / max * 100).toFixed(1)}%"></i>` : ""}</span>` : ""}
    </button>`).join("");
  }

  // Les colonnes marquées « toujours » restent même à zéro : leur zéro est une
  // information. Les autres disparaissent tant qu'elles ne portent rien — un
  // tableau de tirets ne dit pas « rien à signaler », il dit « écran cassé ».
  const COLONNES_BORD = [
    { th: "Collectées",  val: b => b.collectees,   toujours: true },
    { th: "Retenues",    val: b => b.retenues,     toujours: true },
    { th: "Ouvertes",    val: b => b.ouvertes,     toujours: true },
    { th: "Engagées",    val: b => b.engagees,     toujours: true },
    { th: "À arbitrer",  val: b => b.nonArbitrees, toujours: true },
    { th: "Écartées",    val: b => b.corbeille,    toujours: true },
    { th: "NO&nbsp;GO",  val: b => b.nogo },
    { th: "Déposées",    val: b => b.soumises },
    { th: "Gagnées",     val: b => b.gagnees },
    { th: "Perdues",     val: b => b.perdues },
    { th: "Attente",     val: b => b.attente },
    { th: "Réussite",    val: b => b.reussite, fmt: v => v == null ? "—" : v + " %" },
    { th: "Délai",       val: b => b.delai,    fmt: v => v == null ? "—" : v + " j" }
  ];

  function renderBord() {
    const hote = $("#bord-table");
    if (!hote) return;

    const annees = [...new Set(OFFERS.concat(CORBEILLE).map(anneeDe).filter(a => /^\d{4}$/.test(a)))].sort().reverse();
    // « Toutes les années » vaut la chaîne vide : c'est un choix valable, pas
    // une valeur absente. L'écraser remettait le menu sur l'année courante
    // dans la milliseconde, rendant le bilan pluriannuel inatteignable.
    if (annees.length && bordFiltre.annee !== "" && annees.indexOf(bordFiltre.annee) < 0) {
      bordFiltre.annee = annees[0];
    }
    $("#bord-annee").innerHTML = annees.map(a => `<option${a === bordFiltre.annee ? " selected" : ""}>${a}</option>`).join("")
      + '<option value=""' + (bordFiltre.annee ? "" : " selected") + ">Toutes les années</option>";

    const rows = baseBilan();
    const global = bilanFiliale(rows);

    $("#bord-sous").textContent = bordFiltre.annee
      ? "Année " + bordFiltre.annee + " · " + plural(rows.length, "offre passée par le registre", "offres passées par le registre")
      : "Toutes années confondues · " + plural(rows.length, "offre", "offres");
    const frais = $("#bord-frais");
    if (frais) frais.textContent = "à jour · " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

    renderEntonnoir(rows);
    const damier = $("#bord-damier");
    if (damier) damier.innerHTML = damierMensuel(rows);
    renderMinis(rows);

    // ---------------------------------------------------------- le bilan
    const lignes = TOUTES_FILIALES().map(f => ({ f, b: bilanFiliale(rows.filter(o => (o.filiale || "") === f.value)) }));
    const colonnes = COLONNES_BORD.filter(c =>
      c.toujours || Number(c.val(global)) > 0 || lignes.some(x => Number(c.val(x.b)) > 0));

    $("#bord-thead").innerHTML = "<tr><th>Filiale</th>"
      + colonnes.map(c => `<th class="num">${c.th}</th>`).join("") + "</tr>";

    const cellule = (c, b) => { const v = c.val(b); return `<td class="num">${c.fmt ? c.fmt(v) : v}</td>`; };
    hote.innerHTML = lignes.map(({ f, b }) => `<tr data-bord-filiale="${esc(f.value)}">
        <td class="${f.cls}"><span class="fbadge">${esc(f.short)}</span></td>
        ${colonnes.map(c => cellule(c, b)).join("")}</tr>`).join("")
      + `<tr class="total"><td><b>Toutes filiales</b></td>${colonnes.map(c => cellule(c, global)).join("")}</tr>`;

    const masquees = COLONNES_BORD.length - colonnes.length;
    $("#bord-pied").textContent = masquees
      ? masquees + (masquees > 1 ? " colonnes de résultats sont masquées" : " colonne de résultats est masquée")
        + " tant qu'elles restent vides ; elles reviennent d'elles-mêmes au premier dossier déposé."
      : "";

    // ------------------------------------------------- la lecture en clair
    const vivantes = rows.filter(o => !o.supprime_le);
    const sansFiliale = vivantes.filter(o => !o.filiale).length;
    const phrases = [];
    if (rows.length) {
      const partEcart = Math.round((global.corbeille / rows.length) * 100);
      phrases.push(`<b>${rows.length}</b> offres collectées, <b>${global.corbeille}</b> écartées`
        + (partEcart >= 40 ? ` : le filtre anti-bruit retient ${partEcart} % de la collecte.`
                           : ` : la collecte est propre, ${100 - partEcart} % des lignes tiennent la route.`));
    }
    if (vivantes.length && global.nonArbitrees) {
      const part = Math.round((global.nonArbitrees / vivantes.length) * 100);
      phrases.push(`<b>${global.nonArbitrees} offres sur ${vivantes.length}</b> (${part} %) n'ont jamais été tranchées GO ou NO GO : c'est là que le flux s'arrête.`);
    }
    if (sansFiliale) phrases.push(`<b>${sansFiliale}</b> offres n'ont pas de filiale : personne n'en est responsable.`);
    const deposeSansGo = vivantes.filter(o => estSoumise(o) && o.decision !== "GO").length;
    if (deposeSansGo) phrases.push(`<b>${deposeSansGo}</b> dossiers sont partis sans décision GO enregistrée : la trace de l'arbitrage manque.`);
    if (global.soumises <= 1) {
      phrases.push(global.soumises
        ? "Un seul dossier déposé sur la période — <b>le taux de réussite n'a pas encore de sens</b>, et le tableau préfère le taire plutôt qu'afficher 0 %."
        : "Aucun dossier déposé sur la période : <b>les colonnes de résultats attendent leur première soumission</b>.");
    } else if (global.reussite != null) {
      const tranches = global.gagnees + global.perdues;
      // Un taux calculé sur un ou deux dossiers ne mesure rien : autant donner
      // les effectifs bruts plutôt qu'un pourcentage qui se lit comme un verdict.
      const notees = lignes.filter(x => x.b.reussite != null).sort((a, b) => b.b.reussite - a.b.reussite);
      if (tranches < 3) {
        phrases.push(`<b>${plural(tranches, "dossier tranché", "dossiers tranchés")}</b> à ce jour (${global.gagnees} gagné, ${global.perdues} perdu) : trop peu pour un taux de réussite.`);
      } else {
      phrases.push(`Réussite globale : <b>${global.reussite} %</b> des dossiers tranchés.`);
      // Une « meilleure filiale » n'a de sens que s'il y en a plusieurs à comparer.
      if (notees.length > 1 && notees[0].b.reussite > global.reussite)
        phrases.push(`Le meilleur taux revient à <b>${esc(notees[0].f.short)}</b> : ${notees[0].b.reussite} %.`);
      }
    }
    if (global.attente > 0) phrases.push(`<b>${global.attente}</b> dossiers déposés attendent encore leur résultat.`);
    $("#bord-lecture").innerHTML = phrases.length
      ? "<li>" + phrases.join("</li><li>") + "</li>"
      : "<li>Pas encore assez de données pour commenter cette période.</li>";
  }

  /**
   * Liaison avec le registre : chaque chiffre du tableau de bord ouvre la
   * liste qui le compose. On réutilise les onglets et les filtres existants
   * plutôt que d'inventer un second jeu de règles — ce qui s'affiche est
   * exactement ce que le registre sait montrer.
   */
  const BORD_VERS = {
    collectees: "veille", retenues: "veille", aarbitrer: "veille",
    ecartees: "corbeille",
    go: "go", gonondepose: "go",
    deposees: "soumissions", gagnees: "soumissions", sansresultat: "attente"
  };

  /**
   * Chaque marche de l'entonnoir pose le filtre qui isole vraiment ses lignes.
   * Auparavant on changeait d'onglet sans rien filtrer : cliquer « 42 restées
   * sans suite » déposait l'utilisateur sur la totalité du registre, à lui de
   * deviner quel filtre appliquer. Un chiffre qui ne mène pas à ses lignes
   * n'est pas un lien, c'est une impasse.
   */
  function ouvreDepuisBord(etape, filiale) {
    FILTER_GROUPS.forEach(g => active[g.key].clear());
    $("#search").value = "";
    filialeTab = filiale || "";

    if (etape === "aarbitrer") {
      // Ni GO ni NO GO : les offres encore au stade « Nouvelle » ou « À qualifier ».
      active.statut_traitement.add("Nouvelle");
      active.statut_traitement.add("À qualifier");
    } else if (etape === "gonondepose") {
      goFiltre.phase = "prepa";
      goFiltre.filiale = filiale || "";
    } else if (etape === "sansresultat") {
      attenteFiltre.vue = "";
      attenteFiltre.filiale = filiale || "";
    } else if (etape === "gagnees") {
      suiviFilter.resultat = "Gagné";
      suiviFilter.filiale = filiale || "";
    } else if (etape === "deposees") {
      suiviFilter.resultat = "";
      suiviFilter.filiale = filiale || "";
    }

    setTab(BORD_VERS[etape] || "veille");
    render();
    if (currentTab === "go") renderGo();
    if (currentTab === "soumissions") renderSuivi();
    if (currentTab === "attente") renderAttente();
  }

  // Le bouton « Ouvrir la page d'origine » de la fiche : il était affiché et
  // cliquable depuis le début, sans aucun gestionnaire derrière.
  // Le relâchement rend la main : on reconstruit alors le bandeau, les notes
  // suggérées et, si elle est ouverte, la fiche d'opportunité.
  ["change", "pointerup"].forEach(ev =>
    document.addEventListener(ev, (e) => {
      if (!poidsEnCours) return;
      if (ev === "change" && !(e.target.closest && e.target.closest("[data-poids]"))) return;
      poidsEnCours = false;
      renderArbitrage();
      if ($("#opp-dialog").open) { oppLiveScore(); renderSuggestion(null); }
    }, true));

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-prov-ouvrir]");
    if (!b) return;
    const url = b.dataset.provOuvrir;
    if (url && window.aa && window.aa.openExternal) window.aa.openExternal(url);
    else if (url) window.open(url, "_blank", "noopener");
  });

  document.addEventListener("click", (e) => {
    const etape = e.target.closest("[data-bord-etape]");
    if (etape) { ouvreDepuisBord(etape.dataset.bordEtape, ""); return; }
    const fil = e.target.closest("[data-bord-filiale]");
    if (fil && currentTab === "bord") ouvreDepuisBord("retenues", fil.dataset.bordFiliale);
  });

  $("#bord-annee").addEventListener("change", (e) => { bordFiltre.annee = e.target.value; renderBord(); });

  $("#bord-export").addEventListener("click", async () => {
    if (!await ensureLib("xlsx")) { toast("Module Excel introuvable : relancez « construire-exe.cmd ».", "error"); return; }
    const rows = baseBilan();
    const entete = (f, b) => ({
      "Filiale": f.short,
      "Offres collectées": b.collectees,
      "Retenues au registre": b.retenues,
      "Tranchées GO": b.go,
      "Tranchées NO GO": b.nogo,
      "Non arbitrées": b.nonArbitrees,
      "Dossiers déposés": b.soumises,
      "Gagnées": b.gagnees,
      "Perdues": b.perdues,
      "En attente de résultat": b.attente,
      "Taux de réussite (%)": b.reussite == null ? "" : b.reussite,
      "Taux de dépôt (%)": b.transformation,
      "Délai moyen détection → dépôt (j)": b.delai == null ? "" : b.delai,
      "Écartées / obsolètes": b.corbeille
    });
    const synthese = FILIALES.map(f => entete(f, bilanFiliale(rows.filter(o => o.filiale === f.value))))
      .concat([entete({ short: "À qualifier" }, bilanFiliale(rows.filter(o => !o.filiale)))])
      .concat([entete({ short: "TOTAL" }, bilanFiliale(rows))]);

    const detail = rows.map(o => ({
      "Filiale": o.filiale || "À qualifier",
      "Intitulé": o.titre || "",
      "Autorité contractante": o.emetteur || "",
      "Type": o.type || "",
      "Secteur": o.secteur || "",
      "Source de l'information": sourceLabel(o.source_id),
      "Lien source": o.lien_source || "",
      "Publiée le": o.date_publication || "",
      "Date limite": o.date_limite || "",
      "Décision": o.decision || "",
      "Décidée par": o.decision_par || "",
      "Date de dépôt": o.date_soumission || "",
      "Résultat": o.resultat || o.statut_traitement || "",
      "Cycle de vie": cycleVie(o).label,
      "En corbeille": o.supprime_le ? "oui" : "",
      "Motif": o.motif_suppression || ""
    }));

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(synthese);
    ws1["!cols"] = Object.keys(synthese[0] || {}).map(k => ({ wch: k === "Filiale" ? 34 : Math.max(12, Math.min(34, k.length + 2)) }));
    XLSX.utils.book_append_sheet(wb, ws1, "État des lieux");
    if (detail.length) {
      const ws2 = XLSX.utils.json_to_sheet(detail);
      ws2["!cols"] = Object.keys(detail[0]).map(k => ({ wch: /Intitulé|Lien|contractante/.test(k) ? 55 : 18 }));
      XLSX.utils.book_append_sheet(wb, ws2, "Détail des offres");
    }
    const b64 = arrayBufferToBase64(XLSX.write(wb, { bookType: "xlsx", type: "array" }));
    const res = await window.aa.saveXlsx("aa-group-etat-des-lieux-" + (bordFiltre.annee || "toutes-annees") + ".xlsx", b64);
    if (res && res.saved) toast("État des lieux exporté : " + res.filePath, "success", 6000);
  });

  // ======================================================================
  // Prospection : suggestion de notes, puis arbitrage
  // ----------------------------------------------------------------------
  // Le logiciel ne décide pas à la place de l'équipe. Il propose une note
  // par critère, dit pourquoi en une ligne, et garde la trace de l'écart
  // entre ce qu'il proposait et ce que l'équipe a retenu.
  // ======================================================================
  const CRITERES = [
    { key: "fit",         label: "Adéquation à l'offre A&A", aide: "Le besoin correspond-il à ce que nous savons faire ?" },
    { key: "relation",    label: "Relation",                 aide: "Connaissons-nous déjà la structure et ses décideurs ?" },
    { key: "financement", label: "Financement",              aide: "Le budget existe-t-il et d'où vient-il ?" },
    { key: "urgence",     label: "Urgence",                  aide: "Le besoin est-il d'actualité ou lointain ?" },
    { key: "concurrence", label: "Position concurrentielle", aide: "Sommes-nous seuls ou face à tout le marché ?" }
  ];


  const MOTS_METIER = /strateg|plan strategique|psd|diagnostic|organisation|gouvernance|restructur|business plan|etude de faisabilite|ppp|partenariat public|financement|levee de fonds|investissement|evaluation|audit|suivi[- ]evaluation|formation|renforcement de capacites|maitrise d.?oeuvre|assistance technique|schema directeur/;
  const BAILLEURS = /\b(bad|banque africaine|banque mondiale|\bbm\b|afd|usaid|union europeenne|\bue\b|bid\b|boad|pnud|unicef|fao|giz|jica|kfw|ptf|bailleur|don\b|subvention|budget national|bci\b|fonds)\b/;
  const URGENT = /urgent|imminent|cette annee|ce trimestre|budget vote|deja inscrit|lance|en preparation|avant la fin|prochainement|appel prevu|termes de reference/;
  const LOINTAIN = /a moyen terme|a long terme|hypothetique|pas encore|eventuel|a confirmer|exploratoire/;
  const NICHE = /specialis|niche|rare|expertise pointue|peu d.?acteurs|sur mesure|unique|innovant|pionnier/;
  const BANAL = /classique|courant|standard|generaliste|tres concurrentiel|beaucoup de cabinets|appel d.?offres ouvert/;

  /** Cinq notes proposées, chacune avec sa raison en une ligne. */
  function suggereNotes(o) {
    const texte = aplati([o.besoin, o.offre_aa, o.angle, o.livrable, o.note, o.experience].join(" "));
    const structure = aplati(o.structure);
    const out = {};

    // Adéquation : le besoin tombe-t-il dans nos métiers, et l'offre A&A est-elle nommée ?
    const metier = MOTS_METIER.test(texte);
    const offreNommee = String(o.offre_aa || "").trim().length > 3;
    const livrable = String(o.livrable || "").trim().length > 3;
    out.fit = metier && offreNommee && livrable ? { note: 5, motif: "Besoin dans nos métiers, offre A&A et livrable déjà identifiés." }
      : metier && offreNommee ? { note: 4, motif: "Besoin dans nos métiers et offre A&A nommée ; le livrable reste à préciser." }
      : metier ? { note: 3, motif: "Le besoin relève de nos métiers, mais l'offre A&A correspondante n'est pas formulée." }
      : offreNommee ? { note: 3, motif: "Une offre A&A est citée, sans vocabulaire métier reconnu dans le besoin." }
      : { note: 2, motif: "Ni métier reconnu ni offre A&A identifiée : à qualifier avant d'investir." };

    // Relation : la structure apparaît-elle déjà dans le registre, et où en est le contact ?
    const dejaVue = OFFERS.concat(CORBEILLE).filter(x => structure && aplati(x.emetteur).includes(structure)).length;
    const statut = String(o.statut || "");
    out.relation = /converti/i.test(statut) ? { note: 5, motif: "Relation déjà transformée en offre." }
      : /discussion|rendez|relanc/i.test(statut) ? { note: 4, motif: "Échanges en cours avec la structure." }
      : dejaVue >= 3 ? { note: 4, motif: dejaVue + " offres de cette structure au registre : elle nous est familière." }
      : dejaVue >= 1 ? { note: 3, motif: "Structure déjà croisée " + plural(dejaVue, "fois", "fois") + " dans le registre." }
      : o.responsable ? { note: 3, motif: "Un responsable est désigné, mais aucun historique au registre." }
      : { note: 2, motif: "Aucun historique ni contact identifié à ce jour." };

    // Financement : quelqu'un paie-t-il, et est-ce dit ?
    const bail = texte.match(BAILLEURS);
    out.financement = bail ? { note: 4, motif: "Financement évoqué (" + bail[0].toUpperCase() + ") : le budget a une source identifiée." }
      : /budget|credit|enveloppe|dotation|finance/.test(texte) ? { note: 3, motif: "Un budget est mentionné sans bailleur précis." }
      : { note: 2, motif: "Aucune source de financement mentionnée : risque de besoin non financé." };

    // Urgence : maintenant, ou un jour ?
    out.urgence = URGENT.test(texte) ? { note: 5, motif: "Signaux d'échéance proche dans la description." }
      : LOINTAIN.test(texte) ? { note: 2, motif: "Besoin décrit comme lointain ou hypothétique." }
      : /discussion|relanc/i.test(statut) ? { note: 4, motif: "Discussions engagées : la fenêtre est ouverte." }
      : { note: 3, motif: "Aucune indication de calendrier : urgence moyenne par défaut." };

    // Concurrence : note haute = position favorable.
    out.concurrence = NICHE.test(texte) ? { note: 5, motif: "Expertise spécialisée : peu de concurrents crédibles." }
      : BANAL.test(texte) ? { note: 2, motif: "Prestation courante : marché très disputé." }
      : String(o.angle || "").trim().length > 10 ? { note: 4, motif: "Un angle d'approche propre est formulé : avantage sur un concurrent froid." }
      : { note: 3, motif: "Position ordinaire, sans angle différenciant identifié." };

    out.score = scoreOf({ fit: out.fit.note, relation: out.relation.note, financement: out.financement.note, urgence: out.urgence.note, concurrence: out.concurrence.note });
    return out;
  }

  let suggestionCourante = null;

  function renderSuggestion(o) {
    const box = $("#opp-suggest");
    if (!box) return;
    suggestionCourante = suggereNotes(o || Object.fromEntries(new FormData(oppForm).entries()));
    const s = suggestionCourante;
    box.innerHTML = CRITERES.map(c => {
      const retenue = Number(oppForm[c.key] && oppForm[c.key].value) || null;
      const ecart = retenue ? retenue - s[c.key].note : null;
      return `<div class="sug">
        <div class="sug-haut">
          <span class="sug-lab">${esc(c.label)}</span>
          <span class="sug-note">${s[c.key].note}<small>/5</small></span>
          <button type="button" class="btn small" data-retenir="${c.key}">Retenir</button>
        </div>
        <p class="sug-motif">${esc(s[c.key].motif)}</p>
        ${ecart ? `<p class="sug-ecart ${ecart > 0 ? "plus" : "moins"}">Vous retenez ${retenue} — ${ecart > 0 ? "+" : ""}${ecart} par rapport à la suggestion.</p>` : ""}
      </div>`;
    }).join("");
    $("#opp-suggest-score").textContent = s.score != null ? String(s.score).replace(".", ",") + " / 5" : "—";
    majEcartGlobal();
  }

  function majEcartGlobal() {
    if (!suggestionCourante) return;
    const v = Object.fromEntries(new FormData(oppForm).entries());
    const retenu = scoreOf(v);
    const zone = $("#opp-ecart");
    if (retenu == null || suggestionCourante.score == null) { zone.hidden = true; return; }
    const d = Math.round((retenu - suggestionCourante.score) * 100) / 100;
    zone.hidden = Math.abs(d) < 0.01;
    zone.className = "opp-ecart " + (d > 0 ? "plus" : "moins");
    zone.innerHTML = `${icon("alert")}L'équipe retient <b>${String(retenu).replace(".", ",")}</b> là où le logiciel proposait <b>${String(suggestionCourante.score).replace(".", ",")}</b> — écart de ${d > 0 ? "+" : ""}${String(d).replace(".", ",")}. Dites pourquoi : c'est cette phrase qu'on relira dans six mois.`;
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-retenir]");
    if (b && suggestionCourante) {
      const k = b.dataset.retenir;
      if (oppForm[k]) oppForm[k].value = suggestionCourante[k].note;
      oppLiveScore();
      renderSuggestion(null);
      return;
    }
    if (e.target.closest("#opp-retenir-tout") && suggestionCourante) {
      CRITERES.forEach(c => { if (oppForm[c.key]) oppForm[c.key].value = suggestionCourante[c.key].note; });
      oppLiveScore();
      renderSuggestion(null);
      toast("Notes suggérées reprises telles quelles.", "success", 2600);
    }
  });

  // ------------------------------------------------------ pondérations réglables
  function chargePoids() {
    try {
      const enr = JSON.parse(pref("poids", "") || "null");
      if (enr && typeof enr === "object") Object.keys(POIDS).forEach(k => { if (Number.isFinite(enr[k])) POIDS[k] = enr[k]; });
    } catch (_) { /* réglage illisible : on garde les valeurs d'usine */ }
  }

  // Vrai tant qu'un curseur de pondération est manipulé. Pendant ce temps, le
  // bandeau d'arbitrage ne se reconstruit pas — ni sur action locale, ni sur un
  // changement venu d'un autre poste par le temps réel.
  let poidsEnCours = false;

  function renderPoids() {
    const box = $("#opp-poids");
    if (!box) return;
    const total = Object.values(POIDS).reduce((s, v) => s + v, 0) || 1;
    box.innerHTML = CRITERES.map(c => `
      <label class="poids-ligne">
        <span>${esc(c.label)}</span>
        <input type="range" min="0" max="50" step="5" value="${Math.round(POIDS[c.key] * 100)}" data-poids="${c.key}">
        <b>${Math.round((POIDS[c.key] / total) * 100)} %</b>
      </label>`).join("");
    // Les pourcentages affichés dans la fiche d'opportunité suivent le réglage.
    CRITERES.forEach(c => {
      const em = document.querySelector('[data-poids-label="' + c.key + '"]');
      if (em) em.textContent = Math.round((POIDS[c.key] / total) * 100) + " %";
    });
  }

  document.addEventListener("input", (e) => {
    const r = e.target.closest("[data-poids]");
    if (!r) return;
    POIDS[r.dataset.poids] = Number(r.value) / 100;
    setPref("poids", JSON.stringify(POIDS));
    // Ni #opp-poids ni le bandeau qui le contient ne sont reconstruits ici :
    // remplacer le curseur en cours de glissement ferait perdre au navigateur
    // la capture du pointeur, et le panneau « Pondérations » se refermerait.
    // On met à jour le seul chiffre qui change ; le reste attend le relâchement.
    poidsEnCours = true;
    majEtiquettePoids(r);
    renderOpps();
    if ($("#opp-dialog").open) { oppLiveScore(); renderSuggestion(null); }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#opp-poids-reset")) return;
    Object.assign(POIDS, { fit: 0.25, relation: 0.25, financement: 0.20, urgence: 0.15, concurrence: 0.15 });
    setPref("poids", JSON.stringify(POIDS));
    renderPoids(); renderOpps(); renderArbitrage();
    toast("Pondérations remises aux valeurs d'origine.", "info", 2600);
  });

  /** Les opportunités dont la note retenue s'écarte de la suggestion. */
  function aArbitrer() {
    return OPPS.filter(o => {
      if (o.score == null) return true;
      if (o.score_suggere == null) return true;
      return Math.abs(Number(o.score) - Number(o.score_suggere)) >= 0.5;
    });
  }

  // ======================================================================
  // Fiche d'offre exportable — PDF et Word
  // ----------------------------------------------------------------------
  // Le même contenu part vers deux formats : un PDF mis en page par le
  // moteur de rendu déjà embarqué, un .docx écrit octet par octet. Aucune
  // bibliothèque supplémentaire, donc rien de nouveau à maintenir.
  // ======================================================================
  const EST_TDR = /\b(tdr|dao|termes?\s*de\s*r|cahier\s*des\s*charges|dossier\s*d.?appel|rfp|dp\b)/i;

  function champsFiche(o) {
    const p = provenance(o);
    return [
      ["Intitulé", o.titre || ""],
      ["Autorité contractante", (o.emetteur || "—") + (o.origine ? " (" + o.origine + ")" : "")],
      ["Filiale A&A", o.filiale || "À qualifier"],
      ["Type d'avis", o.type || "—"],
      ["Secteur", o.secteur || "—"],
      ["Région / zone", [o.region, o.zone].filter(Boolean).join(" · ") || "—"],
      ["Montant indicatif", o.montant || "—"],
      ["Date de publication", fmtDate(o.date_publication)],
      ["Date limite de dépôt", fmtDate(o.date_limite) + " (" + urgency(o.date_limite).label + ")"],
      ["Cycle de vie", cycleVie(o).label],
      ["Statut de suivi", o.statut_traitement || "Nouvelle"],
      ["Décision interne", (o.decision || "Non arbitrée") + (o.decision_par ? " — " + o.decision_par : "") + (o.decision_le ? " le " + fmtDate(o.decision_le) : "")],
      ["Responsable", o.assigne || "—"],
      ["Source de l'information", p.libelle + (p.site ? " — " + p.site : "")],
      ["Lien d'origine", o.lien_source || "—"],
      ["Entrée au registre", (p.quand ? fmtDate(p.quand) : "—") + (p.par ? " par " + p.par : "")],
      ["Contact", o.contact || "—"]
    ];
  }

  function ficheDoc(o) {
    const blocs = [{ type: "champs", lignes: champsFiche(o) }];
    if (o.description) blocs.push({ type: "titre", texte: "Description" }, { type: "para", texte: o.description });
    if (o.criteres) blocs.push({ type: "titre", texte: "Critères d'éligibilité" }, { type: "para", texte: o.criteres });
    if (o.commentaire_suivi) blocs.push({ type: "titre", texte: "Suivi" }, { type: "para", texte: o.commentaire_suivi });

    const docs = FILES.filter(f => f.offer_id === o.id || currentDetailId === o.id);
    if (docs.length) {
      blocs.push({ type: "titre", texte: "Pièces du dossier (" + docs.length + ")" });
      blocs.push({ type: "liste", items: docs.map(f => f.nom + (EST_TDR.test(f.nom) ? "  [TDR]" : "") + (f.taille ? " — " + fmtSize(f.taille) : "")) });
    }
    const taches = tachesDe(o.id);
    if (taches.length) {
      blocs.push({ type: "titre", texte: "Plan de travail jusqu'au dépôt" });
      blocs.push({ type: "liste", items: taches.map(t => (t.fait ? "[fait] " : "[  ] ") + t.libelle + (t.echeance ? " — " + fmtDate(t.echeance) : "") + (t.responsable ? " — " + t.responsable : "")) });
    }
    if (VOTES.length && currentDetailId === o.id) {
      blocs.push({ type: "titre", texte: "Avis recueillis" });
      blocs.push({ type: "liste", items: VOTES.map(v => v.avis + " — " + v.nom + (v.motif ? " : " + v.motif : "")) });
    }
    return {
      titre: o.titre || "Fiche d'offre",
      sousTitre: (o.emetteur || "") + " · dépôt le " + fmtDate(o.date_limite),
      blocs
    };
  }

  function ficheHtml(o) {
    const d = ficheDoc(o);
    const bloc = (b) => {
      if (b.type === "titre") return `<h2>${esc(b.texte)}</h2>`;
      if (b.type === "champs") return `<table>${b.lignes.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>`;
      if (b.type === "liste") return `<ul>${b.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>`;
      return `<p>${esc(b.texte).replace(/\n/g, "<br>")}</p>`;
    };
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(d.titre)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: Calibri, "Segoe UI", Arial, sans-serif; color: #17262A; font-size: 11pt; line-height: 1.45; margin: 0; }
  .marque { color: #24988A; font-weight: 700; letter-spacing: .08em; font-size: 8.5pt; text-transform: uppercase; }
  h1 { font-size: 19pt; color: #115C67; margin: 4px 0 6px; border-bottom: 2px solid #24988A; padding-bottom: 8px; }
  .sous { color: #5A6B70; font-size: 10pt; margin: 0 0 16px; }
  h2 { font-size: 12.5pt; color: #115C67; margin: 18px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 4px; }
  th, td { border: 1px solid #DCE6E8; padding: 5px 8px; text-align: left; vertical-align: top; font-size: 10pt; }
  th { background: #F2F6F7; color: #115C67; width: 33%; font-weight: 600; }
  ul { margin: 6px 0 0 18px; padding: 0; } li { margin: 2px 0; font-size: 10pt; }
  p { margin: 4px 0; }
  .pied { margin-top: 22px; color: #8A9BA0; font-size: 8.5pt; border-top: 1px solid #E4EBEC; padding-top: 6px; }
</style></head><body>
  <div class="marque">A&amp;A Group — Strategy | Finance | Delivery</div>
  <h1>${esc(d.titre)}</h1>
  <p class="sous">${esc(d.sousTitre)}</p>
  ${d.blocs.map(bloc).join("")}
  <p class="pied">Fiche éditée depuis A&amp;A Registre des Offres le ${esc(new Date().toLocaleString("fr-FR"))}.</p>
</body></html>`;
  }

  async function exporteFiche(format) {
    const o = OFFERS.find(x => x.id === currentDetailId) || CORBEILLE.find(x => x.id === currentDetailId);
    if (!o) { toast("Ouvrez d'abord la fiche d'une offre.", "info"); return; }
    if (!window.aa.doc || !window.aa.doc.fiche) { toast("Export indisponible : relancez « construire-exe.cmd » pour mettre l'application à jour.", "error"); return; }
    try {
      const res = await window.aa.doc.fiche({
        format,
        nom: "fiche-" + (o.titre || "offre"),
        html: format === "pdf" ? ficheHtml(o) : "",
        doc: format === "pdf" ? null : ficheDoc(o)
      });
      if (res && res.saved) toast("Fiche enregistrée : " + res.filePath, "success", 6500);
    } catch (e) {
      toast("Export impossible : " + (e && e.message ? e.message : e), "error");
    }
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("#dlg-pdf")) exporteFiche("pdf");
    else if (e.target.closest("#dlg-word")) exporteFiche("docx");
  });

  /** Ouvre un document du dossier dans l'application par défaut du poste. */
  async function ouvreDoc(f) {
    if (!sb) return;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(f.chemin, 3600);
    if (error || !data || !data.signedUrl) { toast("Ouverture impossible : " + (error ? error.message : "lien indisponible"), "error"); return; }
    if (window.aa.openFile) {
      const r = await window.aa.openFile(data.signedUrl, f.nom);
      if (r && r.error) toast(r.error, "error");
    } else {
      window.aa.openExternal(data.signedUrl);
    }
  }

  $("#dlg-docs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-doc-open]");
    if (!b) return;
    const f = FILES.find(x => x.id === b.dataset.docOpen);
    if (f) ouvreDoc(f);
  });

  // ======================================================================
  // Soumissions : une page par filiale
  // ======================================================================
  function renderSuiviFiliales(tout) {
    const hote = $("#suivi-filiales");
    if (!hote) return;
    const counts = {};
    tout.forEach(o => { counts[o.filiale || ""] = (counts[o.filiale || ""] || 0) + 1; });
    const onglets = [{ value: "", short: "Toutes les filiales", cls: "", n: tout.length }]
      .concat(FILIALES.map(f => ({ value: f.value, short: f.short, cls: f.cls, n: counts[f.value] || 0 })));
    if (counts[""]) onglets.push({ value: "__none__", short: "À qualifier", cls: "f-none", n: counts[""] });
    hote.innerHTML = onglets.map(t => {
      const actif = suiviFilter.filiale === t.value;
      return `<button type="button" class="ftab ${t.cls}${actif ? " is-active" : ""}" data-suivi-filiale="${esc(t.value)}">
        ${t.cls ? '<span class="fdot"></span>' : ""}${esc(t.short)}<span class="n">${t.n}</span></button>`;
    }).join("");
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-suivi-filiale]");
    if (!b) return;
    const v = b.dataset.suiviFiliale;
    suiviFilter.filiale = suiviFilter.filiale === v ? "" : v;
    renderSuivi();
  });

  // ======================================================================
  // Prospection : bandeau d'arbitrage
  // ======================================================================
  function renderArbitrage() {
    // Voir poidsEnCours : on ne remplace pas un curseur sous le doigt.
    if (poidsEnCours) return;
    const hote = $("#opp-arbitrage");
    if (!hote) return;
    const liste = aArbitrer();
    hote.hidden = !OPPS.length;
    if (!OPPS.length) return;
    const jamais = OPPS.filter(o => o.score_suggere == null).length;
    hote.innerHTML = `
      <div class="arb-haut">
        <div>
          <b>${plural(liste.length, "opportunité à arbitrer", "opportunités à arbitrer")}</b>
          <p>Le logiciel propose une note par critère et dit pourquoi. Ouvrez une fiche : vous retenez, vous corrigez, vous notez l'écart.
            ${jamais ? jamais + " n'ont encore jamais été confrontées à une suggestion." : ""}</p>
        </div>
        <details class="arb-poids">
          <summary>${icon("settings")}Pondérations</summary>
          <div class="poids" id="opp-poids"></div>
          <button type="button" class="link-btn" id="opp-poids-reset">Revenir aux pondérations d'origine</button>
        </details>
      </div>
      <div class="arb-liste">${liste.slice(0, 6).map(o => {
        const ecart = (o.score != null && o.score_suggere != null) ? Math.round((Number(o.score) - Number(o.score_suggere)) * 100) / 100 : null;
        return `<button type="button" class="arb-item" data-opp="${esc(o.id)}">
          <span class="arb-struct">${esc(o.structure)}</span>
          <span class="arb-notes">${o.score == null ? "non noté" : String(o.score).replace(".", ",")}
            ${o.score_suggere != null ? `<em>suggéré ${String(o.score_suggere).replace(".", ",")}</em>` : "<em>sans suggestion</em>"}</span>
          ${ecart ? `<span class="arb-ecart ${ecart > 0 ? "plus" : "moins"}">${ecart > 0 ? "+" : ""}${String(ecart).replace(".", ",")}</span>` : ""}
        </button>`;
      }).join("")}</div>`;
    renderPoids();
  }

  // ======================================================================
  // Audit du sourcing — les offres reprises une par une
  // ----------------------------------------------------------------------
  // Le registre ne vaut que ce que valent ses sources. Cet écran reprend
  // chaque offre, demande au site d'origine s'il connaît encore la page, et
  // dit ce qui ne va pas — sans rien changer avant qu'on le lui demande.
  // ======================================================================
  const VERDICTS_AUDIT = [
    { cle: "pas-une-offre",  libelle: "Ce ne sont pas des offres",        aide: "Menus, mentions légales, boutons de compte, liens de téléchargement.", ton: "grave",  nettoyable: true },
    { cle: "lien-mort",      libelle: "Liens morts",                      aide: "La page a disparu du site d'origine (HTTP 404 ou 410).",              ton: "grave",  nettoyable: true },
    { cle: "hors-site",      libelle: "Liens hors du site de la source",  aide: "L'adresse ne correspond pas au site déclaré pour cette source.",      ton: "grave",  nettoyable: true },
    { cle: "titre-duplique", libelle: "Intitulés répétés à l'identique",   aide: "Plusieurs lignes portent le même intitulé : la lecture de la page a raté l'annonce.", ton: "grave", nettoyable: true },
    { cle: "sans-lien",      libelle: "Sans lien d'origine",              aide: "Impossible de remonter à l'annonce : à compléter à la main.",         ton: "alerte", nettoyable: false },
    { cle: "lien-instable",  libelle: "Sites injoignables aujourd'hui",   aide: "Lenteur ou panne passagère : à revérifier plus tard, rien à jeter.",  ton: "alerte", nettoyable: false },
    { cle: "sans-date",      libelle: "Sans date limite",                 aide: "Le lien est bon, mais l'offre n'a pas d'échéance : elle ne vieillit jamais.", ton: "info", nettoyable: false },
    { cle: "ok",             libelle: "Vérifiées",                        aide: "Lien valide et cohérent avec la source.",                             ton: "bon",    nettoyable: false }
  ];

  let auditResultats = [];
  let auditEnCours = false;

  /** L'adresse du site déclaré pour la source d'une offre, quand on la connaît. */
  function urlDeLaSource(o) {
    const id = String(o.source_id || "");
    if (id.startsWith("src:")) {
      const s = SOURCES.find(x => x.id === id.slice(4));
      return s ? s.url : "";
    }
    if (id === "senoffre") return "https://senoffre.com/";
    if (id === "lesoleil") return "https://lesoleil.sn/consultation/appel-doffres/";
    if (id === "aps") return "https://aps.sn/";
    return ""; // saisie manuelle, import Excel : aucun site de référence à opposer
  }

  async function lanceAudit() {
    if (auditEnCours) return;
    if (!window.aa.audit || !window.aa.audit.offres) {
      toast("Audit indisponible : relancez « construire-exe.cmd » pour mettre l'application à jour.", "error");
      return;
    }
    auditEnCours = true;
    const bouton = $("#audit-lancer");
    bouton.disabled = true; bouton.classList.add("is-busy");
    $("#audit-barre").hidden = false;
    $("#audit-resume").hidden = true;
    $("#audit-liste").innerHTML = "";
    $("#audit-nettoyer").hidden = true;

    const liste = OFFERS.map(o => ({
      id: o.id, titre: o.titre, lien_source: o.lien_source,
      date_limite: o.date_limite, source_url: urlDeLaSource(o)
    }));
    $("#audit-etat").textContent = "Vérification de " + plural(liste.length, "offre", "offres") + "…";

    try {
      const res = await window.aa.audit.offres(liste);
      auditResultats = (res && res.resultats) || [];
      renderAudit();
    } catch (e) {
      $("#audit-etat").textContent = "Audit interrompu : " + (e && e.message ? e.message : e);
    } finally {
      auditEnCours = false;
      bouton.disabled = false; bouton.classList.remove("is-busy");
      $("#audit-barre").hidden = true;
    }
  }

  function renderAudit() {
    const parStatut = {};
    auditResultats.forEach(r => { (parStatut[r.statut] = parStatut[r.statut] || []).push(r); });

    $("#audit-resume").hidden = false;
    $("#audit-resume").innerHTML = VERDICTS_AUDIT
      .filter(v => (parStatut[v.cle] || []).length)
      .map(v => `<span class="audit-pastille t-${v.ton}">${(parStatut[v.cle] || []).length}<em>${esc(v.libelle)}</em></span>`)
      .join("");

    $("#audit-liste").innerHTML = VERDICTS_AUDIT.map(v => {
      const lignes = parStatut[v.cle] || [];
      if (!lignes.length) return "";
      if (v.cle === "ok") {
        return `<details class="audit-groupe t-${v.ton}">
          <summary><b>${lignes.length}</b> ${esc(v.libelle.toLowerCase())} — ${esc(v.aide)}</summary></details>`;
      }
      return `<details class="audit-groupe t-${v.ton}"${v.ton === "grave" ? " open" : ""}>
        <summary><b>${lignes.length}</b> ${esc(v.libelle.toLowerCase())} — ${esc(v.aide)}</summary>
        <div class="audit-lignes">${lignes.slice(0, 40).map(r => `
          <div class="audit-ligne">
            <button type="button" class="audit-titre" data-audit-open="${esc(r.id)}" title="Ouvrir la fiche">${esc(r.titre || "(sans titre)")}</button>
            <span class="audit-motif">${esc(r.detail || "")}</span>
          </div>`).join("")}
          ${lignes.length > 40 ? `<p class="muted-line">… et ${lignes.length - 40} autres.</p>` : ""}
        </div></details>`;
    }).join("");

    const aNettoyer = auditResultats.filter(r => VERDICTS_AUDIT.some(v => v.nettoyable && v.cle === r.statut));
    const btn = $("#audit-nettoyer");
    btn.hidden = !aNettoyer.length;
    btn.innerHTML = `${icon("trash")}Envoyer ${plural(aNettoyer.length, "ligne", "lignes")} à la corbeille`;
    delete btn.dataset.confirm;
    btn.classList.remove("is-danger");
  }

  async function nettoieAudit() {
    const aNettoyer = auditResultats.filter(r => VERDICTS_AUDIT.some(v => v.nettoyable && v.cle === r.statut));
    if (!aNettoyer.length || !sb) return;
    const btn = $("#audit-nettoyer");
    btn.disabled = true; btn.classList.add("is-busy");

    // Un motif par verdict : dans la corbeille, on doit savoir pourquoi.
    const motifs = {
      "pas-une-offre": "Audit du sourcing : ce n'est pas une offre",
      "lien-mort": "Audit du sourcing : lien mort chez la source",
      "hors-site": "Audit du sourcing : lien hors du site de la source",
      "titre-duplique": "Audit du sourcing : intitulé répété, lecture de page ratée"
    };
    let faits = 0, echecs = 0;
    for (const v of Object.keys(motifs)) {
      const ids = aNettoyer.filter(r => r.statut === v).map(r => r.id);
      if (!ids.length) continue;
      const { error } = await sb.from("offers").update(signe({
        supprime_le: new Date().toISOString(),
        supprime_par: "Audit du sourcing",
        motif_suppression: motifs[v]
      }, "Audit du sourcing (" + (whoami || "Anonyme") + ")")).in("id", ids);
      if (error) echecs += ids.length; else faits += ids.length;
    }
    btn.disabled = false; btn.classList.remove("is-busy");
    if (echecs) toast(echecs + " ligne(s) n'ont pas pu être déplacées.", "error");
    if (faits) toast(plural(faits, "ligne déplacée", "lignes déplacées") + " en corbeille — restaurables à tout moment.", "success", 6000);
    auditResultats = auditResultats.filter(r => !aNettoyer.includes(r));
    renderAudit();
    await loadOffers();
  }

  document.addEventListener("click", (e) => {
    const fiche = e.target.closest("[data-audit-open]");
    if (fiche) { $("#audit-dialog").close(); openDetail(fiche.dataset.auditOpen); return; }
    if (e.target.closest("#audit-btn")) {
      $("#audit-dialog").showModal();
      if (!auditResultats.length) lanceAudit();
      return;
    }
    if (e.target.closest("#audit-lancer")) { lanceAudit(); return; }
    const net = e.target.closest("#audit-nettoyer");
    if (net) {
      if (!net.dataset.confirm) {
        net.dataset.confirm = "1";
        net.classList.add("is-danger");
        toast("Cliquez à nouveau pour confirmer la mise en corbeille.", "info", 4000);
        setTimeout(() => { delete net.dataset.confirm; net.classList.remove("is-danger"); }, 4500);
        return;
      }
      nettoieAudit();
    }
  });

  if (window.aa.audit && window.aa.audit.surAvancement) {
    window.aa.audit.surAvancement((p) => {
      if (!p || !p.total) return;
      const pct = Math.round((p.faits / p.total) * 100);
      const barre = $("#audit-progres");
      if (barre) barre.style.width = pct + "%";
      const etat = $("#audit-etat");
      if (etat) etat.textContent = p.faits + " / " + p.total + " offres vérifiées — " + String(p.dernier || "").slice(0, 60);
    });
  }

  // ======================================================================
  // Démarrage
  // ======================================================================
  (async function start() {
    renderToday();
    setTab(pref("tab", "veille"));
    initAssistant();
    initReglagesIA();
    initReglagesCourriel();
    initReglagesAlertes();
    initStyleCartes();
    chargePoids();
    const cfg = await window.aa.getSettings();
    whoami = cfg.whoami || "";
    renderUser();

    if (window.aa.getCollectorStatus) {
      const st = await window.aa.getCollectorStatus();
      if (st && st.running) { setCollectorRunning(true); veille.dataset.state = "running"; $("#veille-text").textContent = "Recherche de nouvelles offres en cours…"; syncRailVeille("Veille en cours"); }
      else renderCollectorResult(st ? st.last : null);
    } else {
      renderCollectorResult(null);
    }

    COMPTES = cfg.comptes || {};
    profil = cfg.profil || "contributeur";
    appliqueProfil();

    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      setConn("offline", "Non configuré");
      showState("error", "Adresse du registre absente. Ouvrez les Paramètres — réglages avancés — ou réinstallez l'application.");
      openSettings(false);
    } else {
      showState("loading", "Connexion au registre…");
      initSupabase(cfg.supabaseUrl, cfg.supabaseAnonKey);
    }
  })();
})();
