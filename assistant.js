/* ==========================================================================
   A&A Group — Registre des Offres
   Assistant conversationnel local

   Pourquoi « local » ? Parce que le registre contient les offres, les
   arbitrages et les montants du cabinet. Envoyer ces lignes à un service
   d'intelligence artificielle extérieur pour obtenir une phrase du type
   « 4 offres expirent cette semaine » serait payer — et exposer — beaucoup
   pour très peu. Ce moteur comprend le français tel qu'on le parle au
   bureau, calcule la réponse sur les données déjà chargées dans la page, et
   ne fait sortir aucun octet du poste.

   Il n'apprend rien et n'invente rien : chaque chiffre qu'il annonce est
   compté sur place, et chaque offre qu'il cite existe dans le registre.

   Interface publique :
     AAAssistant.repond(question, contexte) -> Reponse
     AAAssistant.accueil(contexte)          -> Reponse
     AAAssistant.suggestions(contexte)      -> [string]

   Le contexte est fourni par app.js :
     { offres, opportunites, sources, profil, whoami, veille }

   La Reponse est volontairement pauvre en HTML : elle décrit ce qu'il faut
   dire, pas comment le peindre. C'est app.js qui met en forme, avec les
   mêmes composants que le reste de l'application.
     {
       texte       : string  — le corps de la réponse (HTML restreint)
       offres      : []      — offres à présenter en fiches cliquables
       reste       : number  — offres trouvées mais non affichées
       tableau     : {titre, lignes:[[libelle, valeur, part]]} | null
       action      : {id, libelle, params, question} | null
       suggestions : [string]
     }
   ========================================================================== */

(function () {
  "use strict";

  const VERSION = "1.0.0";
  const MAX_FICHES = 6;     // au-delà, on annonce le reste plutôt que de noyer
  const MAX_LIGNES = 8;     // lignes d'un tableau de répartition

  // ======================================================================
  // Outils de base
  // ======================================================================

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /** Réduit une phrase à sa forme comparable : sans accent, sans ponctuation. */
  function norm(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/œ/g, "oe").replace(/æ/g, "ae")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9%]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const MOTS_VIDES = new Set(("le la les un une des du de d au aux a et ou ou est sont il elle on nous vous ils " +
    "elles ce cet cette ces mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs que qui quoi dont " +
    "pour par sur dans avec sans sous chez vers entre depuis plus moins tres tout tous toute toutes meme aussi " +
    "alors donc mais car ne pas plus jamais deja encore bien peu beaucoup quel quelle quels quelles combien " +
    "comment pourquoi quand ou est ce que je tu me te se lui leur y en si oui non merci stp svp s il te plait " +
    "peux peut pouvez veux veut voulez fais fait faire dis dit dire montre montrer donne donner as ai avons " +
    "avez ont suis es sommes etes etre sera seront etait etaient offre offres registre").split(" "));

  function motsUtiles(n) {
    return n.split(" ").filter(w => w.length > 2 && !MOTS_VIDES.has(w));
  }

  const z2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) => d.getFullYear() + "-" + z2(d.getMonth() + 1) + "-" + z2(d.getDate());
  function plusJours(d, n) { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }

  const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  function dateLisible(iso) {
    if (!iso) return "sans échéance";
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return String(iso);
    return d.getDate() + " " + MOIS_FR[d.getMonth()] + " " + d.getFullYear();
  }

  const pluriel = (n, un, plusieurs) => n + " " + (n > 1 ? plusieurs : un);

  /** « 3 offres », « aucune offre », « 1 offre » — avec l'accord qui va bien. */
  function compte(n, un, plusieurs) {
    if (n === 0) return "aucune " + un;
    return pluriel(n, un, plusieurs);
  }

  function joursRestants(iso, aujourdhui) {
    if (!iso) return null;
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return null;
    const a = new Date(ymd(aujourdhui) + "T00:00:00");
    return Math.round((d - a) / 86400000);
  }

  // ======================================================================
  // Vocabulaire métier
  //
  // Chaque entrée associe des façons de dire à la valeur exacte stockée en
  // base. L'ordre compte : les expressions les plus précises d'abord, sans
  // quoi « appel d'offres ouvert » serait capté par « appel d'offres ».
  // ======================================================================

  const STATUTS = [
    [/\b(gagnee?s?|gagne|remportees?|remporte|succes|victoire)\b/, "Gagnée"],
    [/\b(perdues?|perdu|echecs?|echouees?)\b/, "Perdue"],
    [/\b(soumises?|soumis|deposees?|depose|envoyees?)\b/, "Soumise"],
    [/\b(a qualifier|qualifier|a arbitrer)\b/, "À qualifier"],
    [/\b(en cours|en traitement|en preparation|en montage)\b/, "En cours"],
    [/\b(nouvelles?|nouveau|non traitees?|jamais ouvertes?)\b/, "Nouvelle"]
  ];

  // Le résultat n'est lu que si la question emploie son vocabulaire propre.
  // « Gagnée » et « Perdue » relèvent du statut de suivi, pas du résultat :
  // les confondre revenait à exiger les deux et à perdre les offres dont le
  // résultat n'a pas encore été saisi.
  const PARLE_RESULTAT = /\b(resultats?|retenus?|retenues?|preselection|preselectionnees?|short ?list|retraits?|annulees?|annule|en attente)\b/;
  const RESULTATS = [
    [/\b(retenus?|retenues?|preselection|preselectionnees?|short ?list)\b/, "Retenu (présélection)"],
    [/\b(retraits?|annulees?|annule|marche annule)\b/, "Retrait / marché annulé"],
    [/\b(en attente|attente de resultat|sans resultat)\b/, "En attente"]
  ];

  const TYPES = [
    [/\b(appels? d offres? ouverts?|aao)\b/, "Appel d'offres ouvert (AAO)"],
    [/\b(manifestations? d interet|ami|amis)\b/, "Manifestation d'intérêt (AMI)"],
    [/\b(appels? d offres?|ao)\b/, "Appel d'offres"],
    [/\b(financements?|ppp|partenariat public prive)\b/, "Financement / PPP"],
    [/\b(executions?|maitrise d oeuvre|moe|travaux)\b/, "Exécution / Maîtrise d'œuvre"],
    [/\b(etudes?|conseils? strategiques?|conseil)\b/, "Étude / Conseil stratégique"],
    [/\b(assistances? techniques?)\b/, "Assistance technique"],
    [/\b(partenariats?|recherche scientifique)\b/, "Partenariat / Recherche"],
    [/\b(formations?)\b/, "Formation"]
  ];

  const SECTEURS = [
    [/\b(btp|batiment|batiments|construction|genie civil|travaux publics)\b/, "BTP"],
    [/\b(numeriques?|digital|digitale|informatiques?|tic|systemes? d information)\b/, "Numérique"],
    [/\b(santes?|pharma|pharmaceutiques?|medicales?|hopital|hopitaux)\b/, "Santé et Pharma"],
    [/\b(agro|agriculture|agricoles?|agro business|agroalimentaire|elevage)\b/, "Agro-business"],
    [/\b(mines?|miniers?|minieres?|metaux)\b/, "Mines et Métaux"],
    [/\b(petrole|petrolier|gaz|gaziers?|energies?|energetiques?|hydrocarbures)\b/, "Pétrole, Gaz et Transition Énergétique"],
    [/\b(infrastructures?|transports?|routes?|routiers?|ports?|aeroports?)\b/, "Infrastructures et Transport"],
    [/\b(prestations? intellectuelles?|intellectuelles?)\b/, "Prestations intellectuelles"],
    [/\b(industries?|industriels?|industrielles?)\b/, "Industrie"],
    [/\b(pme|pmi|petites? et moyennes?)\b/, "PME"]
  ];

  const FILIALES = [
    [/\b(knowledge|institute|institut)\b/, "A&A Knowledge Institute"],
    [/\b(project delivery|delivery|delivrance)\b/, "A&A Project Delivery"],
    [/\b(finance|financiere|investment|investissement|advisory)\b/, "A&A Finance and Investment Advisory"],
    [/\b(strategy|strategie|strategique)\b/, "A&A Strategy"]
  ];

  const ORIGINES = [
    [/\b(etat|public|publique|publics|publiques|gouvernement|ministere|ministeres|administration)\b/, "État"],
    [/\b(prive|privee|prives|privees|entreprises?)\b/, "Privé"]
  ];

  /** Première valeur dont le motif apparaît dans la phrase normalisée. */
  function premier(n, table) {
    for (const [re, valeur] of table) if (re.test(n)) return valeur;
    return null;
  }

  // ======================================================================
  // Périodes
  // ======================================================================

  /**
   * Interprète l'expression de temps de la question.
   * Renvoie { cle, libelle, min, max } où min/max sont des dates ISO
   * inclusives (null = borne ouverte), ou null si la question ne parle pas
   * de temps.
   */
  function periode(n, aujourdhui) {
    const j0 = ymd(aujourdhui);
    const dans = (nb) => ymd(plusJours(aujourdhui, nb));

    if (/\b(en retard|depassees?|expirees?|echues?|passees?|hors delai|trop tard)\b/.test(n))
      return { cle: "retard", libelle: "dont l'échéance est dépassée", max: ymd(plusJours(aujourdhui, -1)) };

    if (/\b(aujourd hui|ce jour|du jour)\b/.test(n))
      return { cle: "jour", libelle: "à échéance aujourd'hui", min: j0, max: j0 };

    if (/\b(demain)\b/.test(n))
      return { cle: "demain", libelle: "à échéance demain", min: dans(1), max: dans(1) };

    if (/\b(cette semaine|dans la semaine|sous (7|sept) jours?|dans (7|sept) jours?|une semaine|d ici la fin de semaine)\b/.test(n))
      return { cle: "semaine", libelle: "à échéance sous 7 jours", min: j0, max: dans(7) };

    if (/\b(quinzaine|15 jours?|quinze jours?)\b/.test(n))
      return { cle: "quinzaine", libelle: "à échéance sous 15 jours", min: j0, max: dans(15) };

    if (/\b(ce mois|dans le mois|30 jours?|trente jours?|un mois|le mois prochain)\b/.test(n))
      return { cle: "mois", libelle: "à échéance sous 30 jours", min: j0, max: dans(30) };

    if (/\b(ce trimestre|trois mois|3 mois|90 jours?)\b/.test(n))
      return { cle: "trimestre", libelle: "à échéance sous 3 mois", min: j0, max: dans(90) };

    const m = n.match(/\b(?:sous|dans|d ici|prochains?|prochaines?)\s+(\d{1,3})\s+jours?\b/) || n.match(/\b(\d{1,3})\s+jours?\b/);
    if (m) {
      const nb = Math.min(365, parseInt(m[1], 10));
      return { cle: "jours" + nb, libelle: "à échéance sous " + nb + " jour" + (nb > 1 ? "s" : ""), min: j0, max: dans(nb) };
    }

    if (/\b(sans echeance|sans date|pas de date|date inconnue)\b/.test(n))
      return { cle: "sans", libelle: "sans date limite renseignée", sans: true };

    return null;
  }

  // ======================================================================
  // Lecture de la question : de quoi parle-t-on ?
  // ======================================================================

  function criteres(n, ctx) {
    const c = {
      statut: premier(n, STATUTS),
      resultat: PARLE_RESULTAT.test(n) ? premier(n, RESULTATS) : null,
      type: premier(n, TYPES),
      secteur: premier(n, SECTEURS),
      filiale: premier(n, FILIALES),
      origine: premier(n, ORIGINES),
      region: null,
      periode: periode(n, ctx.aujourdhui),
      texte: null
    };

    // Les régions ne sont pas devinables : on les lit dans les données.
    const regions = new Set();
    ctx.offres.forEach(o => { if (o.region) regions.add(o.region); });
    for (const r of regions) {
      if (r === "National") continue;
      const nr = norm(r);
      if (nr && new RegExp("\\b" + nr.replace(/ /g, "[ -]") + "(?:e|es|s|aux)?\\b").test(n)) { c.region = r; break; }
    }
    if (!c.region && /\b(nationale?s?|nationaux|tout le pays|niveau national)\b/.test(n)) c.region = "National";

    // Un émetteur cité explicitement (« les offres de la SENELEC »).
    const emetteurs = new Set();
    ctx.offres.forEach(o => { if (o.emetteur) emetteurs.add(o.emetteur); });
    let meilleur = null, meilleurLong = 0;
    for (const e of emetteurs) {
      const ne = norm(e);
      if (ne.length < 4) continue;
      if (n.includes(ne) && ne.length > meilleurLong) { meilleur = e; meilleurLong = ne.length; }
      else {
        // Sigles : SENELEC, ONAS, APIX… souvent le premier mot de l'émetteur.
        const sigle = ne.split(" ").find(w => w.length >= 4 && w.length <= 10);
        if (sigle && new RegExp("\\b" + sigle + "\\b").test(n) && sigle.length > meilleurLong) { meilleur = e; meilleurLong = sigle.length; }
      }
    }
    c.emetteur = meilleur;

    return c;
  }

  /** Vrai si au moins un critère a été compris. */
  function aDesCriteres(c) {
    return !!(c.statut || c.resultat || c.type || c.secteur || c.filiale || c.origine || c.region || c.periode || c.emetteur);
  }

  /** Phrase décrivant les critères retenus, pour que l'utilisateur vérifie. */
  function libelleCriteres(c) {
    const bouts = [];
    if (c.type) bouts.push("de type « " + c.type + " »");
    if (c.secteur) bouts.push("dans le secteur « " + c.secteur + " »");
    if (c.filiale) bouts.push("rattachées à " + c.filiale);
    if (c.origine) bouts.push(c.origine === "État" ? "émises par le secteur public" : "émises par le privé");
    if (c.region) bouts.push(c.region === "National" ? "de portée nationale" : "en région de " + c.region);
    if (c.emetteur) bouts.push("de « " + c.emetteur + " »");
    if (c.statut) bouts.push("au statut « " + c.statut + " »");
    if (c.resultat) bouts.push("dont le résultat est « " + c.resultat + " »");
    if (c.periode) bouts.push(c.periode.libelle);
    return bouts.join(", ");
  }

  function filtre(offres, c, aujourdhui) {
    return offres.filter(o => {
      if (c.statut && (o.statut_traitement || "Nouvelle") !== c.statut) return false;
      if (c.resultat && (o.resultat || "") !== c.resultat) return false;
      if (c.type && o.type !== c.type) return false;
      if (c.secteur && o.secteur !== c.secteur) return false;
      if (c.filiale && o.filiale !== c.filiale) return false;
      if (c.origine && o.origine !== c.origine) return false;
      if (c.region && o.region !== c.region) return false;
      if (c.emetteur && o.emetteur !== c.emetteur) return false;
      if (c.periode) {
        const p = c.periode;
        if (p.sans) return !o.date_limite;
        if (!o.date_limite) return false;
        if (p.cle === "retard") {
          // Une offre tranchée n'est plus « en retard » : elle est close.
          if (["Gagnée", "Perdue"].includes(o.statut_traitement)) return false;
        }
        if (p.min && o.date_limite < p.min) return false;
        if (p.max && o.date_limite > p.max) return false;
      }
      if (c.texte) {
        const hay = norm([o.titre, o.emetteur, o.description, o.secteur, o.type, o.region].join(" "));
        if (!c.texte.every(mot => hay.includes(mot))) return false;
      }
      return true;
    });
  }

  /** Les plus urgentes d'abord, puis les plus récentes. */
  function parUrgence(rows) {
    return rows.slice().sort((a, b) => {
      const da = a.date_limite || "9999-12-31";
      const db = b.date_limite || "9999-12-31";
      if (da !== db) return da < db ? -1 : 1;
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
  }

  // ======================================================================
  // Recherche d'une offre précise (« ouvre l'offre de la SENELEC »)
  // ======================================================================

  function chercheOffre(n, ctx) {
    const mots = motsUtiles(n);
    if (!mots.length) return null;
    let meilleure = null, meilleurScore = 0;
    ctx.offres.forEach(o => {
      const hay = norm([o.titre, o.emetteur].join(" "));
      let score = 0;
      mots.forEach(m => { if (hay.includes(m)) score += m.length; });
      if (score > meilleurScore) { meilleurScore = score; meilleure = o; }
    });
    // Un seul mot court qui « matche » ne suffit pas à désigner une offre.
    return meilleurScore >= 8 ? meilleure : null;
  }

  // ======================================================================
  // Répartitions
  // ======================================================================

  const DIMENSIONS = [
    { re: /\b(secteurs?)\b/, champ: "secteur", titre: "Répartition par secteur", defaut: "Non renseigné" },
    { re: /\b(types?|natures?)\b/, champ: "type", titre: "Répartition par type d'offre", defaut: "Non renseigné" },
    { re: /\b(statuts?|avancement|etats?)\b/, champ: "statut_traitement", titre: "Répartition par statut de suivi", defaut: "Nouvelle" },
    { re: /\b(filiales?|entites?|structures? interne)\b/, champ: "filiale", titre: "Répartition par filiale", defaut: "Non attribuée" },
    { re: /\b(regions?|geographie|territoires?)\b/, champ: "region", titre: "Répartition par région", defaut: "Non renseignée" },
    { re: /\b(emetteurs?|autorites? contractantes?|clients?|bailleurs?)\b/, champ: "emetteur", titre: "Répartition par autorité contractante", defaut: "Non renseigné" },
    { re: /\b(origines?|sources?)\b/, champ: "source_id", titre: "Répartition par origine de la donnée", defaut: "Inconnue" }
  ];

  function repartition(rows, champ, defaut) {
    const par = new Map();
    rows.forEach(o => {
      const v = (o[champ] == null || o[champ] === "") ? defaut : o[champ];
      par.set(v, (par.get(v) || 0) + 1);
    });
    const total = rows.length || 1;
    return Array.from(par.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([libelle, n]) => [libelle, n, Math.round(n * 100 / total)]);
  }

  // ======================================================================
  // Base de connaissances : comment se sert-on du logiciel ?
  //
  // Ce sont les questions que pose une équipe qui découvre l'outil. Chaque
  // fiche est écrite pour être lue d'une traite, sans capture d'écran.
  // ======================================================================

  const SAVOIRS = [
    {
      cles: ["ajouter", "offre", "soumise", "hors", "logiciel", "externe", "manuellement", "saisir", "suivi", "soumission"],
      requis: ["hors", "soumise", "soumission"],
      titre: "Ajouter une offre soumise en dehors du logiciel",
      texte: "Onglet <b>Suivi des soumissions</b>, bouton <b>Ajouter une soumission</b>. " +
        "Le formulaire reprend tout le dossier : intitulé, autorité contractante, dates de soumission, " +
        "de dépouillement et de relance, résultat et commentaire. " +
        "L'offre entre dans le registre marquée « saisie hors logiciel », avec un GO déjà tranché à votre nom — " +
        "puisque vous l'avez effectivement soumise. Elle rejoint alors les statistiques et l'export Excel comme les autres."
    },
    {
      cles: ["ajouter", "creer", "nouvelle", "offre", "enregistrer", "manuelle"],
      titre: "Enregistrer une nouvelle offre",
      texte: "Bouton <b>Nouvelle offre</b>, en haut à droite de l'onglet Veille. " +
        "Seuls l'intitulé et l'autorité contractante sont obligatoires ; le reste se complète au fil de l'eau. " +
        "Renseignez la <b>date limite</b> dès que vous la connaissez : c'est elle qui pilote les alertes d'échéance et le tri par urgence."
    },
    {
      cles: ["veille", "lancer", "actualiser", "collecte", "rechercher", "automatique", "sources"],
      titre: "Lancer la veille",
      texte: "Bouton <b>Actualiser la veille</b>. Le logiciel interroge les sources actives, écarte les doublons " +
        "et n'ajoute que les offres nouvelles. Le compte rendu indique, source par source, ce qui a été lu et ce qui a échoué. " +
        "La liste des sources se règle dans <b>Sources de veille</b> — réservé à l'administrateur, " +
        "parce qu'une source mal réglée pollue le registre de toute l'équipe."
    },
    {
      cles: ["document", "documents", "tdr", "dao", "joindre", "deposer", "telecharger", "piece", "pieces", "annexe"],
      titre: "Joindre et récupérer les documents",
      texte: "Ouvrez la fiche de l'offre, section <b>Documents</b> : glissez vos fichiers ou cliquez pour les choisir. " +
        "Le bouton <b>Récupérer les documents</b> tente de télécharger automatiquement les pièces depuis le lien source. " +
        "Les documents sont stockés dans un espace privé : le lien de téléchargement est signé et ne vaut qu'une heure, " +
        "ce qui évite qu'une adresse partagée un jour reste ouverte pour toujours."
    },
    {
      cles: ["go", "nogo", "no go", "arbitrage", "trancher", "decision", "decider", "avis", "vote"],
      titre: "Arbitrer un GO / NO GO",
      texte: "Chaque membre de l'équipe dépose son <b>avis</b> et son motif dans la fiche de l'offre. " +
        "La <b>décision</b> finale, elle, n'appartient qu'à l'administrateur : c'est un engagement du cabinet, " +
        "et la base elle-même refuse la modification si le compte n'a pas ce rôle. " +
        "Une fois tranchée, la décision porte le nom de son auteur et sa date."
    },
    {
      cles: ["profil", "role", "roles", "administrateur", "contributeur", "droits", "permissions", "difference"],
      titre: "Les deux profils",
      texte: "Le <b>contributeur</b> lit tout, crée des offres, écrit des notes, dépose des avis et des documents, " +
        "lance la veille et met à jour le suivi des soumissions. " +
        "L'<b>administrateur</b> peut en plus : trancher les GO / NO GO, supprimer une offre ou un document, " +
        "régler les sources de veille et tenir le carnet de contacts. " +
        "Le profil dépend du code saisi à l'ouverture — un seul code par profil, partagé par l'équipe."
    },
    {
      cles: ["exporter", "export", "excel", "xlsx", "tableau", "extraire", "fichier"],
      titre: "Exporter vers Excel",
      texte: "Le bouton <b>Exporter</b> produit un classeur des lignes actuellement affichées — " +
        "filtres compris. Autrement dit : filtrez d'abord, exportez ensuite, et vous obtenez exactement le tableau attendu " +
        "plutôt qu'un export à retailler."
    },
    {
      cles: ["prospection", "opportunite", "opportunites", "score", "priorite", "pipeline"],
      titre: "L'onglet Prospection",
      texte: "Il sert aux affaires que personne n'a encore publiées : un besoin repéré chez une structure, un contact à relancer. " +
        "Chaque opportunité reçoit cinq notes — pertinence, relation, financement, urgence, concurrence — " +
        "dont le logiciel tire un score qui classe la liste. C'est un outil d'arbitrage, pas un carnet d'adresses."
    },
    {
      cles: ["mise", "jour", "version", "maj", "update", "nouvelle version"],
      titre: "Les mises à jour",
      texte: "L'application vérifie seule s'il existe une version plus récente et vous propose de l'installer ; " +
        "rien ne s'installe sans votre accord. Le bandeau de mise à jour apparaît en bas du rail de gauche."
    },
    {
      cles: ["connexion", "connecter", "code", "equipe", "mot de passe", "indisponible", "hors ligne", "reseau", "internet"],
      titre: "Problème de connexion",
      texte: "Le code d'équipe est demandé une seule fois puis conservé chiffré sur le poste par Windows. " +
        "Si le registre est annoncé indisponible, c'est presque toujours la résolution des noms de domaine qui a échoué : " +
        "l'application bascule alors d'elle-même sur un résolveur sécurisé et réessaie trois fois. " +
        "Si le message persiste, vérifiez la connexion Internet du poste."
    },
    {
      cles: ["filtre", "filtres", "filtrer", "recherche", "chercher", "trier", "tri"],
      titre: "Filtrer et trier",
      texte: "La colonne de gauche empile les filtres : échéance, suivi, type, secteur, région, émetteur, origine. " +
        "Ils se cumulent, et les vignettes du haut rappellent ceux qui sont actifs. " +
        "La recherche plein texte, elle, tolère les fautes de frappe et les mots incomplets."
    },
    {
      cles: ["assistant", "chatbot", "robot", "toi", "sais", "peux", "capacites"],
      titre: "Ce que je sais faire",
      texte: null // rempli par aide()
    }
  ];

  /** Radical grossier : « profils » et « profil » doivent se rejoindre. */
  function radical(w) {
    return w.length > 4 ? w.replace(/(eaux|aux|es|s|x)$/, "") : w;
  }

  function chercheSavoir(n) {
    const radicaux = new Set(motsUtiles(n).map(radical));
    // Les sigles du métier — GO, AMI, TDR, DAO — passent sous le filtre de
    // longueur de motsUtiles : on les rattrape ici.
    n.split(" ").forEach(w => { if (w.length >= 2 && w.length <= 3) radicaux.add(w); });

    let meilleur = null, meilleurScore = 0;
    SAVOIRS.forEach(s => {
      if (!s.texte) return;
      // Certaines fiches n'ont de sens que si un mot pivot est présent.
      if (s.requis && !s.requis.some(k => radicaux.has(radical(norm(k))))) return;
      let score = 0;
      s.cles.forEach(k => {
        const nk = norm(k);
        if (nk.indexOf(" ") >= 0) { if (n.indexOf(nk) >= 0) score += 3; return; }
        if (radicaux.has(radical(nk))) score += nk.length > 3 ? 2 : 1;
      });
      if (score > meilleurScore) { meilleurScore = score; meilleur = s; }
    });
    return meilleurScore >= 2 ? meilleur : null;
  }

  // ======================================================================
  // Réponses toutes faites
  // ======================================================================

  function reponse(texte, extra) {
    return Object.assign({ texte, offres: [], reste: 0, tableau: null, action: null, suggestions: [] }, extra || {});
  }

  function suggestions(ctx) {
    const base = [
      "Quelles offres expirent cette semaine ?",
      "Combien d'offres sont en cours ?",
      "Bilan des soumissions",
      "Répartition par secteur"
    ];
    if (ctx && ctx.offres && ctx.offres.some(o => {
      const j = joursRestants(o.date_limite, ctx.aujourdhui);
      return j !== null && j < 0 && !["Gagnée", "Perdue"].includes(o.statut_traitement);
    })) base.unshift("Quelles offres sont en retard ?");
    base.push("Comment ajouter une offre soumise hors logiciel ?");
    return base.slice(0, 4);
  }

  function accueil(ctx) {
    const n = ctx.offres.length;
    const urgentes = ctx.offres.filter(o => {
      const j = joursRestants(o.date_limite, ctx.aujourdhui);
      return j !== null && j >= 0 && j <= 7 && !["Gagnée", "Perdue"].includes(o.statut_traitement);
    });
    const prenom = String(ctx.whoami || "").trim().split(/\s+/)[0];
    let t = "Bonjour" + (prenom ? " " + esc(prenom) : "") + ". ";
    if (!n) {
      t += "Le registre est encore vide — lancez la veille ou enregistrez une première offre, et je pourrai répondre à vos questions dessus.";
    } else {
      t += "Le registre compte <b>" + n + "</b> offre" + (n > 1 ? "s" : "") + ". ";
      t += urgentes.length
        ? "<b>" + compte(urgentes.length, "échéance tombe", "échéances tombent") + "</b> dans les sept prochains jours."
        : "Aucune échéance dans les sept prochains jours.";
      t += "<br>Posez-moi vos questions en français, comme à un collègue.";
    }
    return reponse(t, { suggestions: suggestions(ctx) });
  }

  function aide(ctx) {
    const t = "Je travaille uniquement sur le registre, hors ligne, sans rien envoyer à l'extérieur. Je sais :" +
      "<ul>" +
      "<li><b>Compter et chercher</b> — « combien d'AMI en cours ? », « les offres BTP à Dakar », « offres de la SENELEC »</li>" +
      "<li><b>Surveiller les échéances</b> — « qu'est-ce qui expire cette semaine ? », « les offres en retard »</li>" +
      "<li><b>Faire des bilans</b> — « répartition par secteur », « bilan des soumissions », « taux de réussite »</li>" +
      "<li><b>Ouvrir une fiche</b> — « ouvre l'offre du ministère de la Santé »</li>" +
      "<li><b>Expliquer le logiciel</b> — « comment joindre un TDR ? », « qui peut trancher un GO ? »</li>" +
      "<li><b>Agir, après votre confirmation</b> — enregistrer une offre, ajouter une note, changer un statut, lancer la veille</li>" +
      "</ul>" +
      "Je ne tranche jamais un GO / NO GO et je ne supprime rien : ces deux gestes engagent le cabinet et restent dans la fiche de l'offre.";
    return reponse(t, { suggestions: suggestions(ctx) });
  }

  // ======================================================================
  // Intentions
  // ======================================================================

  function estSalutation(n) {
    return /^(bonjour|bonsoir|salut|coucou|hello|hi|yo|bjr|slt|ca va|comment ca va|nanga def)\b/.test(n);
  }
  function estRemerciement(n) {
    return /^(merci|super|parfait|nickel|top|excellent|bravo|ok merci|c est bon)\b/.test(n);
  }
  function veutCompter(n) {
    return /\b(combien|nombre|quantite|total|compte|comptabilise)\b/.test(n);
  }
  function veutLister(n) {
    return /\b(liste|lister|listes|montre|montrer|affiche|afficher|donne|quelles|quels|lesquelles|lesquels|cherche|trouve|recherche|voir|sortir)\b/.test(n);
  }
  function veutRepartition(n) {
    return /\b(repartition|reparti|ventilation|par secteur|par type|par statut|par filiale|par region|par emetteur|statistiques?|stats?|synthese|tableau de bord)\b/.test(n);
  }
  function veutBilan(n) {
    return /\b(bilan|resume|point|situation|ou en est|ou en sont|ou en sommes|taux|performance|reussite|succes)\b/.test(n);
  }
  /**
   * « Comment ajouter une offre soumise hors logiciel ? » n'est pas l'ordre
   * d'ouvrir le formulaire : c'est une demande d'explication. Ces tournures
   * font passer la base de connaissances avant tout le reste.
   */
  const USAGE = /^(comment|ou est|ou se trouve|ou puis je|ou dois je|peut on|puis je|qui peut|a quoi sert|c est quoi|quelle difference|quelles differences|explique|expliquer)\b/;
  function estQuestionUsage(n) {
    return USAGE.test(n) || /\bcomment (je|on|faire|ca marche|ca se passe)\b/.test(n) ||
           /\b(est ce qu on peut|est ce que je peux)\b/.test(n);
  }

  function veutOuvrir(n) {
    return /\b(ouvre|ouvrir|affiche la fiche|fiche de|detail|details|parle moi de|dis moi sur|consulte)\b/.test(n);
  }

  // ======================================================================
  // Constructions de réponses
  // ======================================================================

  function repondCompte(rows, c, ctx) {
    const n = rows.length;
    const quoi = libelleCriteres(c);
    let t;
    if (n === 0) {
      t = "Aucune offre " + (quoi ? quoi : "ne correspond") + ".";
      if (quoi) t += " Le registre en compte " + ctx.offres.length + " au total.";
    } else {
      t = "<b>" + n + "</b> offre" + (n > 1 ? "s" : "") + (quoi ? " " + esc(quoi) : " au registre") + ".";
      const part = Math.round(n * 100 / (ctx.offres.length || 1));
      if (quoi && ctx.offres.length) t += " Soit " + part + " % du registre.";
    }
    // Un décompte de tout le registre n'appelle pas six fiches : la question
    // portait sur le nombre, pas sur les dossiers.
    const montre = quoi ? parUrgence(rows).slice(0, MAX_FICHES) : [];
    return reponse(t, {
      offres: montre,
      reste: Math.max(0, n - montre.length),
      suggestions: n ? ["Répartition par secteur", "Lesquelles expirent cette semaine ?"] : suggestions(ctx)
    });
  }

  function repondListe(rows, c, ctx) {
    const n = rows.length;
    const quoi = libelleCriteres(c);
    if (!n) {
      return reponse("Je ne trouve aucune offre " + (quoi ? esc(quoi) : "correspondant à cette demande") +
        ". Essayez avec moins de critères, ou vérifiez l'orthographe de l'intitulé.",
        { suggestions: suggestions(ctx) });
    }
    const tri = parUrgence(rows);
    let t = "<b>" + n + "</b> offre" + (n > 1 ? "s" : "") + (quoi ? " " + esc(quoi) : "") +
      (n > MAX_FICHES ? ". Voici les " + MAX_FICHES + " plus urgentes :" : " :");
    return reponse(t, {
      offres: tri.slice(0, MAX_FICHES),
      reste: Math.max(0, n - MAX_FICHES),
      suggestions: ["Combien au total ?", "Répartition par type"]
    });
  }

  function repondEcheances(rows, c, ctx) {
    const n = rows.length;
    const p = c.periode;
    if (!n) {
      return reponse("Aucune offre " + esc(p.libelle) + ". " +
        (p.cle === "retard" ? "Aucune échéance n'a été laissée passer." : "Vous pouvez respirer."),
        { suggestions: suggestions(ctx) });
    }
    const tri = parUrgence(rows);
    let t = "<b>" + n + "</b> offre" + (n > 1 ? "s " : " ") + esc(p.libelle) + " :";
    const surUnSeulJour = ["jour", "demain", "retard", "sans"].indexOf(p.cle) >= 0;
    if (!surUnSeulJour) {
      const j = joursRestants(tri[0].date_limite, ctx.aujourdhui);
      if (j === 0) t += "<br>La plus proche tombe <b>aujourd'hui</b>.";
      else if (j === 1) t += "<br>La plus proche tombe <b>demain</b>.";
      else if (j > 1) t += "<br>La plus proche tombe dans <b>" + j + " jours</b>.";
      // (en deçà, la phrase ferait doublon avec la question elle-même)
    }
    return reponse(t, {
      offres: tri.slice(0, MAX_FICHES),
      reste: Math.max(0, n - MAX_FICHES),
      suggestions: ["Répartition par filiale", "Bilan des soumissions"]
    });
  }

  function repondRepartition(n, rows, c, ctx) {
    const dim = DIMENSIONS.find(d => d.re.test(n)) || DIMENSIONS[0];
    if (!rows.length) return reponse("Aucune offre à répartir avec ces critères.", { suggestions: suggestions(ctx) });
    let lignes = repartition(rows, dim.champ, dim.defaut);
    let reste = 0;
    if (lignes.length > MAX_LIGNES) {
      reste = lignes.slice(MAX_LIGNES).reduce((s, l) => s + l[1], 0);
      lignes = lignes.slice(0, MAX_LIGNES);
      lignes.push(["Autres", reste, Math.round(reste * 100 / rows.length)]);
    }
    const quoi = libelleCriteres(c);
    const t = dim.titre + (quoi ? " — offres " + esc(quoi) : "") +
      "<br>Sur <b>" + rows.length + "</b> offre" + (rows.length > 1 ? "s" : "") + " :";
    return reponse(t, {
      tableau: { titre: dim.titre, lignes },
      suggestions: ["Répartition par statut", "Quelles offres expirent cette semaine ?"]
    });
  }

  function repondBilan(ctx) {
    const o = ctx.offres;
    const soumises = o.filter(x => x.date_soumission || ["Soumise", "Gagnée", "Perdue"].includes(x.statut_traitement));
    const gagnees = o.filter(x => x.statut_traitement === "Gagnée" || /^gagn/i.test(x.resultat || ""));
    const perdues = o.filter(x => x.statut_traitement === "Perdue" || /^perdu/i.test(x.resultat || ""));
    const attente = soumises.filter(x => !gagnees.includes(x) && !perdues.includes(x));
    const tranchees = gagnees.length + perdues.length;
    const taux = tranchees ? Math.round(gagnees.length * 100 / tranchees) : null;

    const lignes = [
      ["Offres au registre", o.length, null],
      ["Soumises", soumises.length, null],
      ["Gagnées", gagnees.length, null],
      ["Perdues", perdues.length, null],
      ["En attente de résultat", attente.length, null]
    ];

    let t = "<b>Bilan des soumissions</b>";
    if (!soumises.length) {
      t += "<br>Aucune soumission enregistrée pour l'instant. Les offres déposées hors logiciel se saisissent " +
        "dans l'onglet Suivi des soumissions — je peux vous y emmener.";
    } else if (taux === null) {
      t += "<br>" + compte(soumises.length, "offre soumise", "offres soumises") + ", aucun résultat encore connu.";
    } else {
      t += "<br>Sur " + pluriel(tranchees, "dossier tranché", "dossiers tranchés") + ", " +
        "<b>" + taux + " %</b> ont été remportés" + (attente.length ? " — " + pluriel(attente.length, "dossier reste", "dossiers restent") + " en attente." : ".");
    }
    return reponse(t, { tableau: { titre: "Suivi des soumissions", lignes }, suggestions: ["Quelles offres sont soumises ?", "Répartition par secteur"] });
  }

  function repondProspection(ctx) {
    const opps = (ctx.opportunites || []).slice();
    if (!opps.length) return reponse("Aucune opportunité de prospection enregistrée pour l'instant.", { suggestions: suggestions(ctx) });
    opps.sort((a, b) => (b.score || 0) - (a.score || 0));
    const lignes = opps.slice(0, MAX_LIGNES).map(x => [x.structure || "Sans nom", (x.score == null ? "—" : Math.round(x.score * 100) / 100), null]);
    const t = "<b>" + opps.length + "</b> opportunité" + (opps.length > 1 ? "s" : "") + " en prospection, " +
      "classées par score. Le score pondère pertinence, relation, financement, urgence et concurrence.";
    return reponse(t, { tableau: { titre: "Prospection — meilleurs scores", lignes }, suggestions: ["Bilan des soumissions", "Répartition par secteur"] });
  }

  function repondVeille(ctx) {
    const srcs = ctx.sources || [];
    const actives = srcs.filter(s => s.actif);
    const v = ctx.veille || {};
    let t = "<b>Veille</b><br>";
    t += srcs.length
      ? compte(actives.length, "source active", "sources actives") + " sur " + srcs.length + " enregistrée" + (srcs.length > 1 ? "s" : "") + "."
      : "Aucune source personnalisée enregistrée — seules les sources livrées avec l'application sont lues.";
    if (v.quand) t += "<br>Dernière collecte : " + esc(v.quand) + (v.resume ? " — " + esc(v.resume) : "") + ".";
    else t += "<br>Aucune collecte enregistrée depuis l'ouverture.";
    const echecs = srcs.filter(s => s.dernier_statut && s.dernier_statut !== "ok");
    if (echecs.length) t += "<br><b>" + compte(echecs.length, "source a échoué", "sources ont échoué") + "</b> à la dernière lecture.";
    return reponse(t, {
      action: { id: "lancer-veille", libelle: "Actualiser la veille maintenant", question: "Je lance la recherche de nouvelles offres sur les sources actives ?" },
      suggestions: ["Quelles offres expirent cette semaine ?", "Répartition par origine"]
    });
  }

  // ======================================================================
  // Actions : toujours proposées, jamais exécutées d'office
  // ======================================================================

  function detecteAction(n, ctx) {
    // Lancer la veille
    if (/\b(lance|lancer|actualise|actualiser|rafraichis|rafraichir|relance|demarre|demarrer)\b/.test(n) &&
        /\b(veille|collecte|recherche|sources)\b/.test(n)) {
      return { id: "lancer-veille", libelle: "Actualiser la veille", question: "Je lance la recherche de nouvelles offres sur les sources actives ?" };
    }

    // Saisir une soumission faite hors logiciel
    if (/\b(ajoute|ajouter|enregistre|enregistrer|saisis|saisir|creer|cree|nouvelle|nouveau)\b/.test(n) &&
        /\b(soumission|soumise|hors logiciel|deja deposee|deja soumise)\b/.test(n)) {
      return { id: "ouvrir-soumission", libelle: "Ouvrir le formulaire de soumission", question: "J'ouvre le formulaire d'ajout d'une offre soumise hors logiciel ?" };
    }

    // Créer une offre
    if (/\b(ajoute|ajouter|enregistre|enregistrer|saisis|saisir|creer|cree|nouvelle|nouveau|rentre|rentrer)\b/.test(n) &&
        /\b(offre|appel|marche|dossier|ami)\b/.test(n)) {
      return { id: "ouvrir-offre", libelle: "Ouvrir le formulaire d'ajout", question: "J'ouvre le formulaire de création d'une offre ?" };
    }

    // Ajouter une note : « note sur X : ... » ou « ajoute une note à X disant ... »
    const mNote = n.match(/\bnote\b/) && /\b(ajoute|ajouter|mets|mettre|ecris|ecrire|note)\b/.test(n);
    if (mNote) {
      const cible = chercheOffre(n.replace(/\bnote\b/g, " "), ctx);
      return {
        id: "ajouter-note",
        libelle: cible ? "Ajouter une note à cette offre" : "Ajouter une note",
        params: { offreId: cible ? cible.id : null },
        question: cible
          ? "J'ouvre la fiche « " + (cible.titre || "").slice(0, 60) + " » pour que vous écriviez la note ?"
          : "Sur quelle offre ? Ouvrez sa fiche, la zone de note est en bas."
      };
    }

    // Changer le statut de suivi d'une offre
    const st = premier(n, STATUTS);
    if (st && /\b(marque|marquer|passe|passer|bascule|basculer|change|changer|mets|mettre)\b/.test(n)) {
      const cible = chercheOffre(n, ctx);
      if (cible) {
        return {
          id: "changer-statut",
          libelle: "Passer au statut « " + st + " »",
          params: { offreId: cible.id, statut: st },
          question: "Je passe « " + (cible.titre || "").slice(0, 60) + " » au statut « " + st + " » ?"
        };
      }
    }

    // Les gestes qui engagent le cabinet restent hors du fil de discussion.
    if (/\b(go|no go|nogo)\b/.test(n) && /\b(tranche|trancher|decide|decider|valide|valider|refuse|refuser)\b/.test(n)) {
      return { id: "refus-arbitrage" };
    }
    if (/\b(supprime|supprimer|efface|effacer|retire|retirer|detruis)\b/.test(n)) {
      return { id: "refus-suppression" };
    }

    return null;
  }

  // ======================================================================
  // Point d'entrée
  // ======================================================================

  function repond(question, contexte) {
    const ctx = Object.assign({ offres: [], opportunites: [], sources: [], profil: "contributeur", whoami: "", veille: null }, contexte || {});
    if (!ctx.aujourdhui) ctx.aujourdhui = new Date();

    const brut = String(question || "").trim();
    if (!brut) return accueil(ctx);
    const n = norm(brut);

    // -------------------------------------------------- politesses
    if (estSalutation(n) && n.split(" ").length <= 4) return accueil(ctx);
    if (estRemerciement(n) && n.split(" ").length <= 4) {
      return reponse("Avec plaisir. Autre chose ?", { suggestions: suggestions(ctx) });
    }
    if (/\b(aide|aider|que sais tu|que peux tu|capacites|comment ca marche|tu sers a quoi|fonctions)\b/.test(n) && !/\b(comment (je|on) )\b/.test(n)) {
      return aide(ctx);
    }

    // -------------------------------------------------- mode d'emploi d'abord
    // Une question en « comment » veut une explication ; l'exécuter serait
    // répondre à côté.
    if (estQuestionUsage(n)) {
      const fiche = chercheSavoir(n);
      if (fiche) return reponse("<b>" + esc(fiche.titre) + "</b><br>" + fiche.texte, { suggestions: suggestions(ctx) });
    }

    // -------------------------------------------------- actions demandées
    const act = estQuestionUsage(n) ? null : detecteAction(n, ctx);
    if (act && act.id === "refus-arbitrage") {
      return reponse("Le GO / NO GO ne se tranche pas depuis la discussion : c'est un engagement du cabinet, " +
        "et la base le refuse aux comptes qui ne sont pas administrateurs. " +
        "Ouvrez la fiche de l'offre — la décision et son motif s'y enregistrent avec votre nom et la date.",
        { suggestions: suggestions(ctx) });
    }
    if (act && act.id === "refus-suppression") {
      return reponse("Je ne supprime rien. Une offre effacée emporte ses notes, ses avis et ses documents, " +
        "et l'opération est irréversible — elle reste volontairement réservée à l'administrateur, depuis la fiche de l'offre.",
        { suggestions: suggestions(ctx) });
    }
    if (act) {
      const r = reponse(act.question || act.libelle, { action: act });
      // « Ajoute une note » sans offre identifiée : rien à exécuter, on explique.
      if (act.id === "ajouter-note" && !(act.params && act.params.offreId)) r.action = null;
      return r;
    }

    // -------------------------------------------------- veille et sources
    if (/\b(veille|collecte|sources)\b/.test(n) && !veutLister(n) && !veutCompter(n)) return repondVeille(ctx);

    // -------------------------------------------------- prospection
    if (/\b(prospection|opportunites?|pipeline)\b/.test(n)) return repondProspection(ctx);

    // -------------------------------------------------- bilan
    if (veutBilan(n) && /\b(soumission|soumissions|soumises?|resultat|resultats|taux|reussite|succes|bilan|point)\b/.test(n)) {
      return repondBilan(ctx);
    }

    // -------------------------------------------------- lecture des critères
    const c = criteres(n, ctx);

    // -------------------------------------------------- répartitions
    if (veutRepartition(n)) {
      const rows = filtre(ctx.offres, c, ctx.aujourdhui);
      return repondRepartition(n, rows, c, ctx);
    }

    // -------------------------------------------------- ouvrir une fiche
    if (veutOuvrir(n)) {
      const cible = chercheOffre(n, ctx);
      if (cible) {
        const j = joursRestants(cible.date_limite, ctx.aujourdhui);
        let t = "« " + esc(cible.titre || "Sans intitulé") + " »<br>" +
          esc(cible.emetteur || "Émetteur non renseigné") + " — " + esc(cible.type || "type non précisé") + ".<br>" +
          "Échéance : " + esc(dateLisible(cible.date_limite)) +
          (j !== null ? (j < 0 ? " (dépassée)" : j === 0 ? " (aujourd'hui)" : " (dans " + pluriel(j, "jour", "jours") + ")") : "") + ".<br>" +
          "Statut : " + esc(cible.statut_traitement || "Nouvelle") + ".";
        return reponse(t, { offres: [cible], suggestions: ["Offres du même émetteur", "Quelles offres expirent cette semaine ?"] });
      }
      return reponse("Je ne trouve pas cette offre. Donnez-moi un mot de son intitulé ou le nom de l'autorité contractante.",
        { suggestions: suggestions(ctx) });
    }

    // -------------------------------------------------- échéances
    if (c.periode && !veutRepartition(n)) {
      const rows = filtre(ctx.offres, c, ctx.aujourdhui);
      if (veutCompter(n)) return repondCompte(rows, c, ctx);
      return repondEcheances(rows, c, ctx);
    }

    // -------------------------------------------------- compter
    if (veutCompter(n)) {
      const rows = filtre(ctx.offres, c, ctx.aujourdhui);
      return repondCompte(rows, c, ctx);
    }

    // -------------------------------------------------- lister / filtrer
    // Dès qu'un critère a été compris, on répond — y compris « aucune ».
    // Laisser filer une demande comprise vers la recherche approximative
    // donnait des réponses à côté de la plaque.
    if (aDesCriteres(c)) {
      return repondListe(filtre(ctx.offres, c, ctx.aujourdhui), c, ctx);
    }
    if (veutLister(n)) {
      const mots = motsUtiles(n).filter(w => !/^(liste|lister|montre|montrer|affiche|afficher|donne|cherche|trouve|recherche|voir|quelles|quels)$/.test(w));
      if (mots.length) {
        c.texte = mots;
        const rows = filtre(ctx.offres, c, ctx.aujourdhui);
        if (rows.length) return repondListe(rows, c, ctx);
      }
    }

    // -------------------------------------------------- mode d'emploi
    const savoir = chercheSavoir(n);
    if (savoir) {
      return reponse("<b>" + esc(savoir.titre) + "</b><br>" + savoir.texte, { suggestions: suggestions(ctx) });
    }

    // -------------------------------------------------- dernier recours
    const mots = motsUtiles(n);
    if (mots.length) {
      const rows = filtre(ctx.offres, { texte: mots }, ctx.aujourdhui);
      if (rows.length) {
        const r = repondListe(rows, {}, ctx);
        r.texte = "Je ne suis pas certain d'avoir saisi la question, mais " + r.texte.charAt(0).toLowerCase() + r.texte.slice(1);
        return r;
      }
      // Une recherche plus tolérante : un seul mot suffit.
      const larges = ctx.offres.filter(o => {
        const hay = norm([o.titre, o.emetteur, o.description].join(" "));
        return mots.some(m => m.length > 3 && hay.includes(m));
      });
      if (larges.length) {
        const r = repondListe(parUrgence(larges), {}, ctx);
        r.texte = "Je n'ai pas bien compris, mais ces offres évoquent vos mots :";
        return r;
      }
    }

    return reponse("Je n'ai pas compris cette demande. Je sais compter et chercher des offres, surveiller les échéances, " +
      "faire des bilans et expliquer le logiciel. Dites-moi par exemple « les offres BTP qui expirent ce mois ».",
      { suggestions: suggestions(ctx) });
  }

  window.AAAssistant = { repond, accueil, suggestions, VERSION };
})();
