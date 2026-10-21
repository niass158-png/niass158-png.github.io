/* ==========================================================================
   A&A Group — Registre des Offres
   Pont « version web » : ce que fait le processus principal d'Electron sur
   PC, refait pour un navigateur de téléphone (iPhone, Android).

   La page (src/app.js et ses voisins) ne sait parler qu'à `window.aa`. Sur PC
   cet objet est fourni par electron/preload.js ; ici, par ce fichier, chargé
   avant tous les autres. La page reste donc la même sur les deux supports :
   une correction faite pour le PC profite au téléphone, et inversement.

   Ce qui change par rapport au PC, et pourquoi :

   · Le code d'équipe n'est JAMAIS conservé par le navigateur. Après la
     première connexion, c'est la session du registre (Supabase) qui tient,
     jusqu'à « Se déconnecter ». Le code ne quitte pas le formulaire.

   · La clé OpenAI, si quelqu'un choisit d'en mettre une sur son téléphone,
     est chiffrée par une clé que le navigateur génère et refuse d'exporter
     (WebCrypto, non extractible). Ce n'est pas le coffre de Windows : la
     page peut s'en servir. Les Paramètres le disent.

   · Ce qui suppose un poste de travail n'existe pas ici : la veille
     automatique, les fenêtres de consultation, la relève IMAP, l'envoi SMTP
     (un brouillon s'ouvre dans la messagerie du téléphone), l'audit des
     sources, Tender AI, la mise à jour par installateur (la version web se
     met à jour toute seule).
   ========================================================================== */
(function () {
  "use strict";

  // Remplacés par web/construire-web.js au moment d'assembler le site.
  const VERSION = "1.17.0";
  const CONFIG = {"supabaseUrl":"https://pdehcpcwjqihmvzrduon.supabase.co","supabaseAnonKey":"sb_publishable_P39rSCAXlyh2Y6m3aFF8HA_bAy5_QQP","comptes":{"contributeur":"equipe@aastrategy.co","administrateur":"admin@aastrategy.co"}};

  document.documentElement.dataset.plateforme = "web";

  // --------------------------------------------------------------- outils
  const CLE_REGLAGES = "aa.web.reglages";
  function lisReglages() {
    try { return JSON.parse(localStorage.getItem(CLE_REGLAGES) || "{}") || {}; } catch (_) { return {}; }
  }
  function ecrisReglages(r) {
    try { localStorage.setItem(CLE_REGLAGES, JSON.stringify(r)); } catch (_) { /* navigation privée */ }
  }

  const chargements = {};
  function chargeScript(src) {
    if (!chargements[src]) {
      chargements[src] = new Promise((resolve, reject) => {
        const el = document.createElement("script");
        el.src = src; el.onload = resolve;
        el.onerror = () => { delete chargements[src]; reject(new Error("Chargement impossible : " + src)); };
        document.head.appendChild(el);
      });
    }
    return chargements[src];
  }
  const LIBS = "vendor/";
  async function lecteurs() {
    if (!window.AALecteurs) await chargeScript("lecteurs.js");
    return window.AALecteurs;
  }
  async function moduleExcel() {
    if (!window.XLSX) await chargeScript(LIBS + "xlsx/dist/xlsx.full.min.js");
    return window.XLSX;
  }

  function enBase64(u8) {
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function deBase64(b64) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  function nomPropre(s) {
    return String(s || "document").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "document";
  }

  /** Petite annonce dans la zone des notifications de la page. */
  function annonce(message, nature, ms) {
    const box = document.getElementById("toasts");
    if (!box) return;
    const el = document.createElement("div");
    el.className = "toast " + (nature || "info");
    const t = document.createElement("div");
    t.className = "toast-msg"; t.textContent = message;
    el.appendChild(t);
    el.addEventListener("click", () => el.remove());
    box.appendChild(el);
    setTimeout(() => el.remove(), ms || 6000);
  }

  /**
   * Ouvre une adresse dans un nouvel onglet. Les téléphones bloquent les
   * ouvertures qui ne suivent pas directement un toucher : dans ce cas on
   * propose un bouton, et c'est le toucher suivant qui ouvre.
   */
  function ouvreLien(url, libelle) {
    let w = null;
    try { w = window.open(url, "_blank"); } catch (_) { w = null; }
    if (w) { try { w.opener = null; } catch (_) { /* autre origine */ } return; }
    if (window.AAWeb && window.AAWeb.proposeLien) window.AAWeb.proposeLien(url, libelle);
    else window.location.href = url;
  }

  /** Enregistre des octets sous un nom : le téléphone les range dans ses Téléchargements / Fichiers. */
  function telecharge(octets, nom, type) {
    const blob = octets instanceof Blob ? octets : new Blob([octets], { type: type || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    // Noms sans accents : certains navigateurs remplacent sinon le nom
    // entier par « download ».
    nom = String(nom || "document").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[’']/g, "-").replace(/[^\x20-\x7e]/g, "_");
    a.href = url; a.download = nom; a.rel = "noopener";
    a.style.display = "none";
    // Une fenêtre modale ouverte rend le reste de la page inerte : le lien
    // est placé dans la plus récente, sinon le nom du fichier se perd.
    const ouvertes = document.querySelectorAll("dialog[open]");
    (ouvertes.length ? ouvertes[ouvertes.length - 1] : document.body).appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 60000);
    return { saved: true, filePath: nom + " (Téléchargements)" };
  }

  /**
   * Sélecteur de fichiers du téléphone. À appeler SANS attente préalable : le
   * navigateur n'ouvre le sélecteur que dans la foulée d'un toucher.
   */
  function choisisFichiers({ multiple, accept }) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      if (multiple) input.multiple = true;
      if (accept) input.accept = accept;
      input.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      document.body.appendChild(input);
      let fini = false;
      const termine = (liste) => {
        if (fini) return;
        fini = true;
        window.removeEventListener("focus", auRetour);
        setTimeout(() => input.remove(), 0);
        resolve(liste);
      };
      // Retour sur la page sans choix : certains navigateurs n'émettent rien.
      const auRetour = () => setTimeout(() => { if (!input.files || !input.files.length) termine([]); }, 1500);
      input.addEventListener("change", () => termine(Array.from(input.files || [])));
      input.addEventListener("cancel", () => termine([]));
      window.addEventListener("focus", auRetour);
      input.click();
    });
  }

  const TABLEURS = /\.(xlsx|xls|xlsm|ods|csv)$/i;
  let compteurFichiers = 0;

  /** Dépose les fichiers choisis dans le stockage en mémoire, puis les lit comme sur PC. */
  async function lisFichiersChoisis(fichiers) {
    if (!fichiers.length) return [];
    const L = await lecteurs();
    if (fichiers.some(f => TABLEURS.test(f.name))) { try { await moduleExcel(); } catch (_) { /* lu en erreur */ } }
    const sortie = [];
    for (const f of fichiers.slice(0, 8)) {
      const chemin = "mem/" + (++compteurFichiers) + "/" + f.name;
      if (f.size > L.TAILLE_MAX) {
        sortie.push({ nom: f.name, chemin, octets: f.size, erreur: "Fichier trop volumineux. La limite est de 25 Mo." });
        continue;
      }
      L.depose(chemin, new Uint8Array(await f.arrayBuffer()));
      const lu = L.lisFichier(chemin);
      if (!lu.mime && f.type) lu.mime = f.type;
      sortie.push(lu);
    }
    return sortie;
  }

  // ====================================================== intelligence artificielle
  // Portage de electron/ia.js : mêmes messages, mêmes catégories d'erreur.
  const BASE_IA = "https://api.openai.com/v1";
  const MODELE_DEFAUT = "gpt-4o-mini";
  const EXCLUS = /(instruct|audio|realtime|search|transcribe|tts|whisper|embedding|moderation|image|dall|davinci|babbage)/i;
  const CLE_IA = "aa.web.ia.cle";
  const CLE_MODELE = "aa.web.ia.modele";

  const chiffrementDisponible = !!(window.crypto && crypto.subtle && window.indexedDB && window.isSecureContext);

  function base() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("aa-registre-web", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("cles");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function cleDuNavigateur(creer) {
    const db = await base();
    const lue = await new Promise((resolve, reject) => {
      const r = db.transaction("cles").objectStore("cles").get("ia");
      r.onsuccess = () => resolve(r.result || null); r.onerror = () => reject(r.error);
    });
    if (lue || !creer) return lue;
    // Non extractible : le navigateur s'en sert, mais personne ne peut la lire.
    const cle = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await new Promise((resolve, reject) => {
      const t = db.transaction("cles", "readwrite");
      t.objectStore("cles").put(cle, "ia");
      t.oncomplete = resolve; t.onerror = () => reject(t.error);
    });
    return cle;
  }

  async function memoriseCle(cle) {
    if (!cle) { try { localStorage.removeItem(CLE_IA); } catch (_) {} return { ok: true, memorise: false }; }
    if (!chiffrementDisponible) {
      return { ok: false, erreur: "Ce navigateur ne propose pas de chiffrement : la clé ne peut pas être conservée en sécurité." };
    }
    const k = await cleDuNavigateur(true);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(String(cle).trim())));
    localStorage.setItem(CLE_IA, JSON.stringify({ iv: enBase64(iv), c: enBase64(chiffre) }));
    return { ok: true, memorise: true };
  }

  async function relisCle() {
    let enr = null;
    try { enr = JSON.parse(localStorage.getItem(CLE_IA) || "null"); } catch (_) { enr = null; }
    if (!enr || !chiffrementDisponible) return null;
    try {
      const k = await cleDuNavigateur(false);
      if (!k) { localStorage.removeItem(CLE_IA); return null; }
      const clair = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deBase64(enr.iv) }, k, deBase64(enr.c));
      return new TextDecoder().decode(clair);
    } catch (_) {
      try { localStorage.removeItem(CLE_IA); } catch (__) {}
      return null;
    }
  }

  function modeleChoisi() { try { return localStorage.getItem(CLE_MODELE) || null; } catch (_) { return null; } }

  function statutIA() {
    let enregistree = false;
    try { enregistree = !!localStorage.getItem(CLE_IA); } catch (_) {}
    return { cleEnregistree: enregistree, chiffrementDisponible, modele: modeleChoisi() || MODELE_DEFAUT, modeleDefaut: MODELE_DEFAUT, web: true };
  }

  function diagnostique(statut, corps) {
    const msg = (corps && corps.error && corps.error.message) ? corps.error.message : "";
    if (statut === 401) return { categorie: "cle-refusee", message: "Clé OpenAI refusée. Vérifiez-la dans les paramètres." };
    if (statut === 403) return { categorie: "cle-refusee", message: "Cette clé n'a pas le droit d'utiliser ce modèle." };
    if (statut === 404) return { categorie: "modele", message: "Ce modèle n'existe pas ou n'est pas ouvert à votre compte." };
    if (statut === 429) return { categorie: "quota", message: /quota|billing|credit/i.test(msg)
      ? "Crédit OpenAI épuisé : rechargez le compte pour continuer."
      : "Trop de demandes d'un coup : patientez quelques secondes." };
    if (statut >= 500) return { categorie: "panne-fournisseur", message: "OpenAI est momentanément indisponible." };
    return { categorie: "erreur", message: msg || ("Erreur HTTP " + statut) };
  }

  async function appelIA(chemin, { methode = "GET", corps, cle, timeoutMs = 60000 } = {}) {
    const clef = cle || await relisCle();
    if (!clef) return { ok: false, categorie: "cle-absente", message: "Aucune clé OpenAI enregistrée sur ce téléphone." };
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), timeoutMs);
    try {
      const res = await fetch(BASE_IA + chemin, {
        method: methode,
        headers: Object.assign({ Authorization: "Bearer " + clef }, corps ? { "Content-Type": "application/json" } : {}),
        body: corps ? JSON.stringify(corps) : undefined,
        signal: controleur.signal
      });
      const texte = await res.text();
      let data = null;
      try { data = texte ? JSON.parse(texte) : null; } catch (_) { data = null; }
      if (!res.ok) { const d = diagnostique(res.status, data); return { ok: false, categorie: d.categorie, message: d.message }; }
      return { ok: true, data };
    } catch (e) {
      const abandon = e && e.name === "AbortError";
      return { ok: false, categorie: abandon ? "delai" : "reseau",
        message: abandon ? "L'IA n'a pas répondu dans le temps imparti." : "Impossible de joindre OpenAI — vérifiez la connexion Internet du téléphone." };
    } finally {
      clearTimeout(minuteur);
    }
  }

  async function testeCle(cleProposee) {
    const r = await appelIA("/models", { cle: cleProposee, timeoutMs: 20000 });
    if (!r.ok) return r;
    const ids = ((r.data && r.data.data) || []).map(m => m.id)
      .filter(id => /^(gpt|o[0-9])/i.test(id) && !EXCLUS.test(id)).sort();
    return { ok: true, modeles: ids };
  }

  async function conversation({ messages, tools, modele, temperature } = {}) {
    const corps = { model: modele || modeleChoisi() || MODELE_DEFAUT, messages: messages || [], parallel_tool_calls: false };
    if (tools && tools.length) { corps.tools = tools; corps.tool_choice = "auto"; }
    else delete corps.parallel_tool_calls;
    if (typeof temperature === "number") corps.temperature = temperature;
    const r = await appelIA("/chat/completions", { methode: "POST", corps });
    if (!r.ok) return r;
    const choix = r.data && r.data.choices && r.data.choices[0];
    if (!choix) return { ok: false, categorie: "erreur", message: "Réponse vide d'OpenAI." };
    return { ok: true, message: choix.message || {}, raison: choix.finish_reason || "", usage: r.data.usage || null, modele: r.data.model || corps.model };
  }

  async function extraisJson({ systeme, utilisateur, modele, timeoutMs }) {
    const choisi = modele || modeleChoisi() || MODELE_DEFAUT;
    const corps = {
      model: choisi,
      messages: [{ role: "system", content: systeme }, { role: "user", content: utilisateur }],
      response_format: { type: "json_object" }
    };
    if (!/^(o\d|gpt-5)/i.test(choisi)) corps.temperature = 0;
    let r = await appelIA("/chat/completions", { methode: "POST", corps, timeoutMs: timeoutMs || 120000 });
    if (!r.ok && r.categorie === "erreur" && /temperature|response_format/i.test(r.message || "")) {
      delete corps.temperature;
      if (/response_format/i.test(r.message)) delete corps.response_format;
      r = await appelIA("/chat/completions", { methode: "POST", corps, timeoutMs: timeoutMs || 120000 });
    }
    if (!r.ok) return r;
    const choix = r.data && r.data.choices && r.data.choices[0];
    if (!choix || !choix.message) return { ok: false, categorie: "erreur", message: "Réponse vide d'OpenAI." };
    if (choix.finish_reason === "length") {
      return { ok: false, categorie: "longueur", message: "La réponse de l'IA a été coupée avant la fin. Réessayez, ou choisissez un modèle plus récent dans les paramètres." };
    }
    return { ok: true, contenu: choix.message.content || "", usage: r.data.usage || null, modele: r.data.model || choisi };
  }

  // ====================================================== lecture d'un DAO
  // Portage du gestionnaire « dao:analyser » de electron/main.js.
  async function documentDepuisOctets(L, u8, nom) {
    let texte;
    try { texte = L.texteComplet(u8, nom); }
    catch (e) {
      if (e && e.code === "SCAN") return { nom, pdf: L.octets(u8), octets: u8.length };
      throw e;
    }
    if (texte != null) return { nom, texte, octets: u8.length };
    const chemin = "mem/" + (++compteurFichiers) + "/" + nom;
    L.depose(chemin, u8);
    const lu = L.lisFichier(chemin);
    L.retire(chemin);
    if (lu.erreur || !lu.texte) throw new Error(lu.erreur || "Aucun texte à extraire.");
    return { nom, texte: lu.texte, octets: u8.length };
  }

  function analyseDao(charge) {
    const c = charge || {};
    if (!statutIA().cleEnregistree) {
      return Promise.resolve({ ok: false, categorie: "cle-absente", message: "Aucune clé OpenAI sur ce téléphone : renseignez-la dans Paramètres → Assistant IA." });
    }
    // Le sélecteur doit s'ouvrir tout de suite, dans la foulée du toucher.
    const choix = c.choisir ? choisisFichiers({ multiple: false, accept: ".pdf,.docx,.txt,.odt,.rtf,.html,.htm,.md" }) : null;
    return (async () => {
      try {
        const L = await lecteurs();
        let u8, nom;
        if (choix) {
          const fichiers = await choix;
          if (!fichiers.length) return { ok: false, categorie: "annule" };
          if (fichiers[0].size > 25 * 1024 * 1024) throw new Error("Document trop volumineux (limite 25 Mo).");
          u8 = new Uint8Array(await fichiers[0].arrayBuffer());
          nom = fichiers[0].name;
        } else {
          // Seuls les liens du stockage de l'équipe sont acceptés.
          const baseUrl = String(reglages().supabaseUrl || "").replace(/\/+$/, "");
          const url = String(c.url || "");
          if (!baseUrl || !url.startsWith(baseUrl + "/storage/v1/")) return { ok: false, categorie: "erreur", message: "Lien de document refusé." };
          const res = await fetch(url);
          if (!res.ok) return { ok: false, categorie: "reseau", message: "Téléchargement du document impossible (HTTP " + res.status + ")." };
          u8 = new Uint8Array(await res.arrayBuffer());
          nom = c.nom || "document";
          if (u8.length > 25 * 1024 * 1024) throw new Error("Document trop volumineux (limite 25 Mo).");
        }
        const documentLu = await documentDepuisOctets(L, u8, nom);
        return await L.analyseDao({ demande: extraisJson, document: documentLu, offre: c.offre });
      } catch (e) {
        return { ok: false, categorie: "lecture", message: e && e.message ? e.message : String(e) };
      }
    })();
  }

  // ====================================================== fiche d'offre
  function imprime(html) {
    // Téléphone : une page à part, que l'on imprime — « Enregistrer en PDF »
    // dans la fenêtre d'impression. Ordinateur : un cadre invisible suffit.
    const tactile = window.matchMedia && matchMedia("(pointer:coarse)").matches;
    if (tactile) {
      const w = window.open("", "_blank");
      if (w) {
        w.document.open(); w.document.write(html); w.document.close();
        setTimeout(() => { try { w.focus(); w.print(); } catch (_) {} }, 500);
        return true;
      }
    }
    const cadre = document.createElement("iframe");
    cadre.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    cadre.srcdoc = html;
    cadre.onload = () => {
      try { cadre.contentWindow.focus(); cadre.contentWindow.print(); } catch (_) {}
      setTimeout(() => cadre.remove(), 60000);
    };
    document.body.appendChild(cadre);
    return true;
  }

  async function fiche({ format, nom, html, doc } = {}) {
    if (format === "pdf") {
      imprime(html || "");
      annonce("Dans la fenêtre d'impression, choisissez « Enregistrer en PDF ».", "info", 7000);
      return { saved: false };
    }
    const L = await lecteurs();
    return telecharge(L.creerDocx(doc || {}), nomPropre(nom) + ".docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  }

  // ====================================================== réglages
  function reglages() {
    const r = lisReglages();
    return Object.assign({
      whoami: "",
      profil: "contributeur",
      veilleAuDemarrage: false,
      supabaseUrl: CONFIG.supabaseUrl,
      supabaseAnonKey: CONFIG.supabaseAnonKey
    }, r, { comptes: CONFIG.comptes || {}, plateforme: "web", version: VERSION });
  }

  const rien = () => {};
  const indisponible = (quoi) => ({ ok: false, message: (quoi || "Cette fonction") + " reste réservée au logiciel installé sur PC." });

  window.aa = {
    plateforme: "web",
    version: VERSION,
    libs: LIBS,

    getSettings: async () => reglages(),
    setSettings: async (patch) => {
      const r = lisReglages();
      Object.keys(patch || {}).forEach(k => {
        if (k === "comptes" || k === "plateforme" || k === "version") return;
        r[k] = patch[k];
      });
      // Les réglages livrés avec l'application ne sont pas recopiés : une
      // mise à jour du site doit pouvoir les changer.
      if (r.supabaseUrl === CONFIG.supabaseUrl) delete r.supabaseUrl;
      if (r.supabaseAnonKey === CONFIG.supabaseAnonKey) delete r.supabaseAnonKey;
      ecrisReglages(r);
      return reglages();
    },

    // Le code d'équipe ne se conserve pas dans un navigateur : seul le
    // profil obtenu est retenu. La session du registre fait le reste.
    getTeamCode: async () => null,
    rememberTeamCode: async (_code, profil) => {
      const r = lisReglages();
      if (profil) r.profil = profil;
      ecrisReglages(r);
      return { ok: true };
    },
    forgetTeamCode: async () => {
      const r = lisReglages();
      delete r.profil;
      ecrisReglages(r);
      return { ok: true };
    },

    // Veille : le téléphone voit les offres collectées par les PC, il ne
    // collecte pas lui-même (les sites sources refusent les navigateurs tiers).
    runCollectorNow: async () => { throw new Error("La veille se lance depuis le logiciel installé sur PC."); },
    onCollectorStart: rien,
    onCollectorProgress: rien,
    onCollectorDone: rien,

    saveXlsx: async (filename, base64) =>
      telecharge(deBase64(base64), filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),

    downloadFile: async (url, filename) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Téléchargement impossible (HTTP " + res.status + ")");
      return telecharge(await res.blob(), nomPropre(filename));
    },

    fetchAttachments: async () => ({
      error: "La recherche des documents sur le site source se fait depuis le logiciel sur PC. Sur le téléphone, ouvrez la source et ajoutez le document à la main."
    }),

    openExternal: async (url) => {
      const u = String(url || "");
      if (/^mailto:/i.test(u)) { window.location.href = u; return; }
      if (/^https?:\/\//i.test(u)) ouvreLien(u);
    },
    openFile: async (url, filename) => { ouvreLien(url, "Ouvrir " + (filename || "le document")); return { ok: true }; },

    doc: { fiche },

    ia: {
      statut: async () => statutIA(),
      enregistrerCle: async (cle) => Object.assign(await memoriseCle(cle), statutIA()),
      effacerCle: async () => { await memoriseCle(null); return statutIA(); },
      tester: (cle) => testeCle(cle || null),
      choisirModele: async (modele) => {
        try { modele ? localStorage.setItem(CLE_MODELE, modele) : localStorage.removeItem(CLE_MODELE); } catch (_) {}
        return statutIA();
      },
      conversation: (charge) => conversation(charge || {})
    },

    dao: { analyser: analyseDao },

    fichiers: {
      choisir: () => {
        const choix = choisisFichiers({ multiple: true,
          accept: ".pdf,.docx,.odt,.xlsx,.xls,.xlsm,.ods,.csv,.pptx,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.json,.xml,.html,.rtf,image/*" });
        return choix.then(lisFichiersChoisis);
      },
      lire: async (chemins) => {
        const L = await lecteurs();
        return (chemins || []).slice(0, 8).map(ch => L.lisFichier(ch));
      },
      octets: async (chemin) => {
        try {
          const L = await lecteurs();
          const u8 = L.lisOctets(chemin);
          return { base64: enBase64(u8), octets: u8.length };
        } catch (e) {
          return { erreur: "Lecture impossible : " + (e && e.message ? e.message : e) };
        }
      },
      // Propre à la version web : la page peut transmettre des fichiers
      // déposés (glisser-déposer sur ordinateur).
      deposer: (fichiers) => lisFichiersChoisis(Array.from(fichiers || []))
    },

    // Pas d'envoi direct depuis un navigateur : la page ouvre alors un
    // brouillon dans la messagerie du téléphone.
    courriel: {
      statut: async () => ({ configure: false, web: true }),
      enregistrer: async () => indisponible("L'envoi direct"),
      effacer: async () => ({ configure: false }),
      tester: async () => indisponible("L'envoi direct"),
      envoyer: async () => ({ ok: false, nonConfigure: true })
    }
  };

  // Outils internes, pour la coquille mobile.
  window.AAWeb = { VERSION, annonce, ouvreLien, telecharge, chiffrementDisponible };
})();
