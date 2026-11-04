/* ==========================================================================
   A&A Group — Registre des Offres
   Chef d'orchestre de la conversation avec l'IA

   Ce fichier ne parle jamais à OpenAI directement : il passe par
   `window.aa.ia`, c'est-à-dire par le processus principal, qui seul détient
   la clé. Il ne touche pas non plus au registre : il décrit les outils
   disponibles et demande à app.js de les exécuter.

   Le principe est celui d'un collaborateur à qui l'on confie le clavier :
   l'IA ne reçoit pas le registre en bloc — ce serait cher et vite périmé —
   elle reçoit un résumé et une boîte à outils, et va chercher elle-même ce
   dont elle a besoin, autant de fois qu'il le faut.

   Deux garde-fous, tenus ici et pas seulement dans la consigne :
     • tout outil qui écrit passe par une confirmation de l'utilisateur ;
     • la suppression et l'arbitrage GO / NO GO ne sont pas exposés du tout.
       Une IA ne peut pas se tromper sur un outil qu'elle n'a pas.

   Interface publique :
     AAIA.creerSession({ contexte, executer, confirmer, surEtat }) -> session
     session.envoie(question) -> { texte, erreur, categorie, outils }
     session.reinitialise()
   ========================================================================== */

(function () {
  "use strict";

  const VERSION = "2.0.0";
  const TOURS_MAX = 12;         // appels d'outils enchaînés avant de rendre la main
  const MEMOIRE_MAX = 30;       // messages conservés : au-delà, la facture grimpe
  const RESULTAT_MAX = 12000;   // caractères d'un résultat d'outil

  // ======================================================================
  // Les filtres, décrits une fois et réutilisés par plusieurs outils
  // ======================================================================

  const FILTRES = {
    statut: { type: "string", enum: ["Nouvelle", "À qualifier", "En cours", "Soumise", "Gagnée", "Perdue"], description: "Statut de suivi interne." },
    type: { type: "string", description: "Type d'offre, exactement tel qu'il figure au registre (voir liste_valeurs)." },
    secteur: { type: "string", description: "Secteur, exactement tel qu'il figure au registre." },
    region: { type: "string", description: "Région du Sénégal, ou « National »." },
    filiale: { type: "string", description: "Filiale A&A rattachée." },
    origine: { type: "string", enum: ["État", "Privé"], description: "Nature de l'émetteur." },
    emetteur: { type: "string", description: "Autorité contractante, recherche partielle acceptée." },
    resultat: { type: "string", description: "Résultat de la soumission." },
    texte: { type: "string", description: "Mots à chercher dans l'intitulé, l'émetteur et la description." },
    echeance_max_jours: { type: "integer", description: "Ne garder que les offres dont la date limite tombe dans ce nombre de jours." },
    en_retard: { type: "boolean", description: "Ne garder que les offres dont l'échéance est dépassée et qui ne sont ni gagnées ni perdues." },
    sans_echeance: { type: "boolean", description: "Ne garder que les offres sans date limite renseignée." },
    decision: { type: "string", enum: ["GO", "NO GO", "Non arbitrée"], description: "Arbitrage GO / NO GO de l'offre." },
    pertinence: { type: "string", enum: ["forte", "moyenne", "faible"], description: "Pertinence pour A&A, calculée d'après les 65 missions de référence du groupe." },
    cloturees: { type: "boolean", description: "Ne garder que les offres dont la date limite est passée sans dépôt noté (en pratique, des offres GO à régulariser : sans dépôt noté 7 jours après la date limite, elles partent en corbeille)." },
    nouvelles_depuis_jours: { type: "integer", description: "Ne garder que les offres entrées au registre depuis ce nombre de jours." }
  };

  function avecFiltres(extra, requis) {
    return {
      type: "object",
      properties: Object.assign({}, FILTRES, extra || {}),
      required: requis || []
    };
  }

  // ======================================================================
  // La boîte à outils
  //
  // Chaque description est écrite pour l'IA, pas pour un développeur : c'est
  // elle qui décide quand s'en servir, et elle ne dispose que de ce texte.
  // ======================================================================

  const LECTURE = [
    ["chercher_offres", "Cherche des offres dans le registre et renvoie leur liste. À utiliser dès qu'il faut citer, compter ou examiner des offres précises.",
      avecFiltres({ limite: { type: "integer", description: "Nombre maximum d'offres renvoyées (défaut 15, maximum 50)." } })],

    ["compter_offres", "Compte les offres correspondant à des critères, sans renvoyer la liste. Moins coûteux que chercher_offres quand seul le nombre importe.",
      avecFiltres()],

    ["statistiques", "Répartition chiffrée des offres selon une dimension : combien par secteur, par type, par statut, etc.",
      avecFiltres({ dimension: { type: "string", enum: ["secteur", "type", "statut", "filiale", "region", "emetteur", "origine", "resultat"], description: "Dimension d'analyse." } }, ["dimension"])],

    ["detail_offre", "Fiche complète d'une offre : tous ses champs, ses notes, ses avis GO/NO GO et ses documents.",
      { type: "object", properties: { offre_id: { type: "string", description: "Identifiant de l'offre." } }, required: ["offre_id"] }],

    ["liste_valeurs", "Valeurs réellement présentes au registre pour un champ. À utiliser avant de filtrer, pour employer le libellé exact plutôt qu'une approximation.",
      { type: "object", properties: { champ: { type: "string", enum: ["type", "secteur", "region", "filiale", "emetteur", "statut", "resultat", "origine"] } }, required: ["champ"] }],

    ["bilan_soumissions", "Bilan du suivi des soumissions : combien déposées, gagnées, perdues, en attente, et le taux de réussite.",
      { type: "object", properties: {} }],

    ["liste_opportunites", "Opportunités de prospection, classées par score décroissant.",
      { type: "object", properties: { limite: { type: "integer", description: "Défaut 15." } } }],

    ["liste_sources", "Sources de veille enregistrées, avec leur état à la dernière collecte.",
      { type: "object", properties: {} }],

    ["etat_veille", "Résultat de la dernière collecte automatique.",
      { type: "object", properties: {} }],

    ["liste_contacts", "Carnet de contacts utilisé pour les demandes d'arbitrage.",
      { type: "object", properties: {} }],

    ["analyser_offre", "Dossier d'analyse complet d'une offre, pour qualifier un GO / NO GO ou préparer la réponse : pertinence pour A&A et missions comparables déjà réalisées, verdict d'éligibilité (exigences du DAO jugées contre le profil d'A&A), échéance, documents (TDR…), plan de travail, avis et notes de l'équipe.",
      { type: "object", properties: { offre_id: { type: "string" } }, required: ["offre_id"] }],

    ["briefing", "Point de situation du registre : nouvelles offres pertinentes, échéances proches, offres GO sans plan de travail, offres GO échues sans dépôt noté, tâches en retard, relances dues, offres en attente de résultat, offres pertinentes non arbitrées, dernière veille. À utiliser pour « où en est-on », « quoi faire aujourd'hui », « briefing ».",
      { type: "object", properties: { depuis_jours: { type: "integer", description: "Fenêtre des « nouvelles » offres, en jours (défaut 3)." } } }],

    ["chercher_references", "Cherche dans les 65 missions de référence d'A&A (client, intitulé, année, pays) celles à citer dans une offre technique.",
      { type: "object", properties: { texte: { type: "string", description: "Mots-clés (secteur, client, type de mission)." }, limite: { type: "integer", description: "Défaut 10." } }, required: ["texte"] }],

    ["profil_entreprise", "Profil d'A&A tel qu'enregistré (chiffre d'affaires, ancienneté, nombre de références, certifications, agréments, filiales) : ce qui sert à juger l'éligibilité.",
      { type: "object", properties: {} }],

    ["liste_corbeille", "Offres mises en corbeille (archivées), avec le motif et l'auteur.",
      { type: "object", properties: { texte: { type: "string" }, limite: { type: "integer", description: "Défaut 20." } } }]
  ];

  const NAVIGATION = [
    ["ouvrir_offre", "Ouvre la fiche d'une offre à l'écran, devant l'utilisateur.",
      { type: "object", properties: { offre_id: { type: "string" } }, required: ["offre_id"] }],

    ["changer_onglet", "Bascule l'écran sur un autre onglet. « attente » = offres déposées en attente de décision (elles ne sont plus dans « veille »).",
      { type: "object", properties: { onglet: { type: "string", enum: ["veille", "go", "attente", "soumissions", "prospection", "bord", "corbeille"] } }, required: ["onglet"] }],

    ["appliquer_filtres", "Applique de vrais filtres à l'écran, pour que l'utilisateur voie la sélection dans le registre et puisse l'exporter.",
      avecFiltres({ recherche: { type: "string", description: "Texte à mettre dans la barre de recherche." } })],

    ["effacer_filtres", "Retire tous les filtres actifs à l'écran.",
      { type: "object", properties: {} }]
  ];

  // Outils qui modifient le registre. Chacun passe par une confirmation
  // explicite de l'utilisateur avant de partir.
  const ECRITURE = [
    ["creer_offre", "Enregistre une nouvelle offre au registre. N'inventez jamais de valeur : demandez ce qui manque.",
      { type: "object", properties: {
        titre: { type: "string", description: "Intitulé ou objet du marché." },
        emetteur: { type: "string", description: "Autorité contractante." },
        origine: { type: "string", enum: ["État", "Privé"] },
        type: { type: "string" }, secteur: { type: "string" }, region: { type: "string" }, filiale: { type: "string" },
        date_limite: { type: "string", description: "Date limite au format AAAA-MM-JJ." },
        date_publication: { type: "string", description: "Format AAAA-MM-JJ." },
        montant: { type: "string" }, lien_source: { type: "string" }, description: { type: "string" }
      }, required: ["titre", "emetteur"] }],

    ["enregistrer_soumission", "Enregistre une offre déjà soumise en dehors du logiciel, avec son suivi.",
      { type: "object", properties: {
        titre: { type: "string" }, emetteur: { type: "string" }, origine: { type: "string", enum: ["État", "Privé"] },
        type: { type: "string" }, secteur: { type: "string" }, region: { type: "string" }, filiale: { type: "string" },
        date_limite: { type: "string" }, date_soumission: { type: "string" }, date_depouillement: { type: "string" },
        resultat: { type: "string" }, commentaire_suivi: { type: "string" }, montant: { type: "string" }
      }, required: ["titre", "emetteur"] }],

    ["ajouter_note", "Ajoute une note datée et signée à une offre.",
      { type: "object", properties: { offre_id: { type: "string" }, texte: { type: "string" } }, required: ["offre_id", "texte"] }],

    ["changer_statut", "Change le statut de suivi d'une offre.",
      { type: "object", properties: { offre_id: { type: "string" }, statut: FILTRES.statut }, required: ["offre_id", "statut"] }],

    ["mettre_a_jour_suivi", "Renseigne les dates et le résultat du suivi d'une soumission.",
      { type: "object", properties: {
        offre_id: { type: "string" },
        date_soumission: { type: "string" }, date_depouillement: { type: "string" }, date_relance: { type: "string" },
        resultat: { type: "string" }, commentaire_suivi: { type: "string" }
      }, required: ["offre_id"] }],

    ["assigner_offre", "Désigne le collaborateur en charge d'une offre.",
      { type: "object", properties: { offre_id: { type: "string" }, responsable: { type: "string" } }, required: ["offre_id", "responsable"] }],

    ["creer_opportunite", "Ajoute une opportunité au tableau de prospection.",
      { type: "object", properties: {
        structure: { type: "string" }, besoin: { type: "string" }, offre_aa: { type: "string" },
        angle: { type: "string" }, statut: { type: "string" }, responsable: { type: "string" }, note: { type: "string" },
        fit: { type: "integer" }, relation: { type: "integer" }, financement: { type: "integer" },
        urgence: { type: "integer" }, concurrence: { type: "integer" }
      }, required: ["structure"] }],

    ["lancer_veille", "Lance une collecte sur les sources actives.",
      { type: "object", properties: {} }],

    ["exporter_excel", "Produit un classeur Excel de la sélection affichée.",
      { type: "object", properties: { quoi: { type: "string", enum: ["suivi", "prospection"] } }, required: ["quoi"] }],

    ["joindre_document_a_offre", "Classe une pièce jointe de la discussion dans les documents d'une offre du registre, où toute l'équipe la retrouvera.",
      { type: "object", properties: {
        fichier: { type: "string", description: "Nom exact du fichier joint à la discussion." },
        offre_id: { type: "string", description: "Identifiant de l'offre de destination." }
      }, required: ["fichier", "offre_id"] }],

    ["modifier_offre", "Corrige ou complète les champs d'une offre (intitulé, autorité, dates, montant, filiale, type, secteur, région, lien, description, critères, contact). Seuls les champs fournis changent.",
      { type: "object", properties: {
        offre_id: { type: "string" },
        titre: { type: "string" }, emetteur: { type: "string" }, origine: { type: "string", enum: ["État", "Privé"] },
        type: { type: "string" }, secteur: { type: "string" }, region: { type: "string" }, filiale: { type: "string" },
        date_limite: { type: "string", description: "AAAA-MM-JJ" }, date_publication: { type: "string", description: "AAAA-MM-JJ" },
        montant: { type: "string" }, lien_source: { type: "string" }, description: { type: "string" },
        criteres: { type: "string" }, contact: { type: "string" }
      }, required: ["offre_id"] }],

    ["mettre_en_corbeille", "Archive des offres : elles quittent le registre pour la corbeille, d'où l'on peut les restaurer à tout moment. Pour les offres clôturées, hors sujet, en doublon ou traitées.",
      { type: "object", properties: {
        offre_ids: { type: "array", items: { type: "string" }, description: "Identifiants des offres (100 au plus)." },
        motif: { type: "string", description: "Motif court, visible dans la corbeille (ex. « Clôturée, non traitée »)." }
      }, required: ["offre_ids", "motif"] }],

    ["restaurer_offres", "Remet au registre des offres de la corbeille.",
      { type: "object", properties: { offre_ids: { type: "array", items: { type: "string" } } }, required: ["offre_ids"] }],

    ["planifier_reponse", "Crée le plan de travail (rétroplanning) d'une offre jusqu'au dépôt : étapes datées, avec un responsable. Il apparaît dans la fiche de l'offre et dans « Offres GO ».",
      { type: "object", properties: {
        offre_id: { type: "string" },
        etapes: { type: "array", items: { type: "object", properties: {
          libelle: { type: "string" }, echeance: { type: "string", description: "AAAA-MM-JJ" }, responsable: { type: "string" }
        }, required: ["libelle"] } },
        remplacer: { type: "boolean", description: "Vrai pour remplacer le plan existant au lieu de le compléter." }
      }, required: ["offre_id", "etapes"] }],

    ["envoyer_courriel", "Envoie un courriel depuis la messagerie du cabinet (relance d'une autorité contractante, demande de résultat, demande d'arbitrage, message à l'équipe). Si la messagerie n'est pas réglée, un brouillon s'ouvre. Rédigez un texte complet et professionnel, signé.",
      { type: "object", properties: {
        destinataires: { type: "array", items: { type: "string" }, description: "Adresses e-mail." },
        objet: { type: "string" }, corps: { type: "string", description: "Texte brut, avec formule d'appel et signature." },
        offre_id: { type: "string", description: "Offre concernée : le courriel y est noté dans l'historique." },
        relance: { type: "boolean", description: "Vrai s'il s'agit d'une relance : la date de relance de l'offre est mise à jour." }
      }, required: ["destinataires", "objet", "corps"] }],

    ["produire_document", "Produit un vrai document Word (.docx) : note de qualification GO / NO GO, note de compréhension des TDR, liste des pièces à fournir, contrôle de conformité, courrier, briefing, synthèse… L'utilisateur l'enregistre d'un clic ; avec offre_id, il est aussi classé dans les documents de l'offre pour toute l'équipe.",
      { type: "object", properties: {
        titre: { type: "string" }, sous_titre: { type: "string" },
        nom_fichier: { type: "string", description: "Sans extension." },
        sections: { type: "array", items: { type: "object", properties: {
          titre: { type: "string" },
          paragraphes: { type: "array", items: { type: "string" } },
          puces: { type: "array", items: { type: "string" } },
          tableau: { type: "object", properties: {
            entetes: { type: "array", items: { type: "string" } },
            lignes: { type: "array", items: { type: "array", items: { type: "string" } } }
          } }
        } } },
        offre_id: { type: "string", description: "Facultatif : classer le document dans cette offre." }
      }, required: ["titre", "sections"] }],

    ["produire_tableau", "Produit un vrai classeur Excel (.xlsx) : rétroplanning, liste de pièces, liste d'offres, tableau de relances, matrice d'analyse… L'utilisateur l'enregistre d'un clic ; avec offre_id, il est aussi classé dans l'offre.",
      { type: "object", properties: {
        nom_fichier: { type: "string", description: "Sans extension." },
        feuilles: { type: "array", items: { type: "object", properties: {
          nom: { type: "string" },
          entetes: { type: "array", items: { type: "string" } },
          lignes: { type: "array", items: { type: "array", items: { type: "string" } } }
        }, required: ["entetes", "lignes"] } },
        offre_id: { type: "string" }
      }, required: ["nom_fichier", "feuilles"] }]
  ];

  // Réservé aux administrateurs : la base le refuse de toute façon aux contributeurs.
  const ADMIN = [
    ["trancher_offre", "Enregistre la décision GO / NO GO d'une offre. Ne l'employez que sur demande expresse de l'administrateur, jamais de votre propre initiative.",
      { type: "object", properties: {
        offre_id: { type: "string" }, decision: { type: "string", enum: ["GO", "NO GO"] },
        motif: { type: "string", description: "Motif court de la décision." }
      }, required: ["offre_id", "decision"] }]
  ];

  const NOMS_ECRITURE = new Set(ECRITURE.concat(ADMIN).map(o => o[0]));
  // Produire un document n'écrit au registre que s'il faut le classer dans une offre.
  const ECRITURE_SI_OFFRE = new Set(["produire_document", "produire_tableau"]);
  function estEcriture(nom, args) {
    if (ECRITURE_SI_OFFRE.has(nom)) return !!(args && args.offre_id);
    return NOMS_ECRITURE.has(nom);
  }

  function enSchema(liste) {
    return liste.map(([name, description, parameters]) => ({
      type: "function",
      function: { name, description, parameters }
    }));
  }

  const OUTILS = enSchema(LECTURE).concat(enSchema(NAVIGATION), enSchema(ECRITURE));
  const OUTILS_ADMIN = OUTILS.concat(enSchema(ADMIN));
  const outilsPour = (profil) => (profil === "administrateur" ? OUTILS_ADMIN : OUTILS);

  // ======================================================================
  // La consigne
  // ======================================================================

  function consigne(ctx) {
    const c = ctx || {};
    const r = c.resume || {};
    const admin = c.profil === "administrateur";
    const lignes = [];

    lignes.push("Vous êtes le collaborateur IA de l'équipe « appels d'offres » du Groupe A&A Strategy & Investment Advisory, à Dakar, et vous travaillez dans le logiciel « A&A Registre des Offres ». Le groupe compte quatre filiales : A&A Strategy (études, stratégie, conseil institutionnel), A&A Finance and Investment Advisory (structuration financière, investissement, PPP), A&A Project Delivery (maîtrise d'œuvre, suivi de travaux, infrastructures) et A&A Knowledge Institute (formation, renforcement de capacités). Votre travail n'est pas de réciter le registre : c'est de faire gagner des marchés au cabinet et du temps à l'équipe.");
    lignes.push("");
    lignes.push("VOS QUATRE RÔLES");
    lignes.push("1. VEILLEUR — Vous signalez ce qui compte : nouvelles offres pertinentes, échéances proches, dossiers GO sans plan, tâches en retard, relances dues. Outil : briefing. Terminez toujours par les 2 ou 3 actions à faire en priorité.");
    lignes.push("2. ANALYSTE GO / NO GO — Pour qualifier une offre, appelez analyser_offre, puis rendez une recommandation nette (GO, GO en groupement, NO GO) argumentée sur : adéquation avec les domaines et missions de référence d'A&A, éligibilité (chiffre d'affaires, ancienneté, références similaires, agréments, personnel clé), délai restant face au travail à fournir, concurrence et risques. Citez les missions comparables à mettre en avant. Si les exigences du DAO ne sont pas connues, dites-le et proposez de lire le DAO (fiche de l'offre, « Lire le DAO avec l'IA »). La décision appartient à l'équipe" + (admin ? "; vous ne tranchez (trancher_offre) que sur demande expresse." : "."));
    lignes.push("3. PRÉPARATEUR DE RÉPONSE — Pour une offre GO : note de compréhension des TDR, liste des pièces administratives et techniques à fournir, contrôle de conformité avant dépôt, missions de référence et profils d'experts à mobiliser, rétroplanning jusqu'à la date limite (planifier_reponse, en remontant depuis la date de dépôt : lecture du dossier, questions d'éclaircissement, pièces administratives, offre technique, offre financière, relecture, signature, dépôt).");
    lignes.push("4. CHARGÉ DE SUIVI ET RELANCES — Relances des autorités contractantes, demandes de résultats, demandes d'arbitrage, suites de la prospection. Rédigez des courriels complets, polis et précis (référence de l'avis, date de dépôt, objet), signés au nom de " + (c.whoami || "l'utilisateur") + ", A&A Group, et envoyez-les avec envoyer_courriel.");
    lignes.push("");
    lignes.push("PRODUISEZ DES LIVRABLES");
    lignes.push("- Dès qu'une demande appelle une note, une analyse, une liste, un plan, un courrier ou un tableau, produisez le fichier : produire_document pour un Word, produire_tableau pour un Excel. Ne vous contentez jamais d'une longue réponse dans la discussion.");
    lignes.push("- Un document est structuré en sections titrées, avec des paragraphes, des puces et au besoin un tableau. Il est complet et directement utilisable par un consultant, sans mention de vous-même.");
    lignes.push("- Quand le livrable concerne une offre, renseignez offre_id : il sera classé dans ses documents pour toute l'équipe.");
    lignes.push("- Dans la discussion, résumez ensuite en deux ou trois lignes ce que contient le livrable et ce qu'il reste à faire.");
    lignes.push("");
    lignes.push("VOUS AGISSEZ DANS LE LOGICIEL COMME UN MEMBRE DE L'ÉQUIPE");
    lignes.push("- Vous pouvez créer et corriger des offres (modifier_offre), changer leur statut, les assigner, noter, planifier, renseigner le suivi, classer des documents, envoyer des courriels.");
    lignes.push("- Rangement automatique : le registre ne montre que les offres où l'on peut encore agir. Une offre clôturée sans dépôt part en corbeille dès le lendemain de sa date limite, un NO GO aussitôt, un GO sans dépôt noté 7 jours après la date limite ; les offres déposées vont dans « En attente » puis « Soumissions » ; la corbeille s'efface d'elle-même après 90 jours (sauf dossier déposé).");
    lignes.push("- Vous pouvez en plus archiver en corbeille (mettre_en_corbeille) des offres hors sujet ou en doublon, et restaurer (restaurer_offres) une offre partie à tort — par exemple un GO qui a bien été déposé : restaurez-la puis notez le dépôt (mettre_a_jour_suivi). Annoncez combien et lesquelles avant d'archiver, avec un motif clair. N'archivez jamais une offre déposée sans demande explicite.");
    lignes.push("- Chaque action qui modifie le registre est montrée à l'utilisateur, qui confirme ou annule : proposez franchement, il garde la main. S'il refuse, n'insistez pas.");
    lignes.push("");
    lignes.push("VOTRE INTERLOCUTEUR");
    lignes.push("- " + (c.whoami || "un collaborateur") + ", " + (admin ? "administrateur du registre" : "contributeur (ne peut pas trancher un GO / NO GO)") + ".");
    lignes.push("- Date du jour : " + (c.aujourdhui || ""));
    lignes.push("");
    lignes.push("ÉTAT DU REGISTRE (instantané, à vérifier par les outils avant toute affirmation chiffrée)");
    lignes.push("- " + (r.total || 0) + " offres, dont " + (r.echeanceSemaine || 0) + " à échéance sous 7 jours et " + (r.enRetard || 0) + " en retard.");
    if (r.statuts) lignes.push("- Statuts : " + r.statuts);
    if (r.types) lignes.push("- Types présents : " + r.types);
    if (r.secteurs) lignes.push("- Secteurs présents : " + r.secteurs);
    if (r.filiales) lignes.push("- Filiales : " + r.filiales);
    lignes.push("- " + (r.opportunites || 0) + " opportunités de prospection, " + (r.sources || 0) + " sources de veille.");
    lignes.push("");
    lignes.push("RÈGLES");
    lignes.push("- Aucun chiffre, intitulé, date ou exigence de mémoire : vérifiez par un outil. N'inventez jamais une donnée d'A&A (chiffre d'affaires, références, certifications) : prenez-la dans profil_entreprise ou chercher_references, sinon signalez qu'elle manque.");
    lignes.push("- Filtres : employez les libellés exacts (liste_valeurs).");
    lignes.push("- Enchaînez les outils autant qu'il le faut (chercher, analyser, produire, classer) avant de répondre.");
    lignes.push("- Document joint à la discussion : son texte vous est fourni ; servez-vous-en (résumé, exigences, comparaison au registre). S'il décrit un avis absent du registre, proposez de l'enregistrer.");
    lignes.push("- Demande ambiguë : une question courte plutôt qu'une supposition.");
    lignes.push("");
    lignes.push("TON");
    lignes.push("Français professionnel, direct, orienté décision, sans flatterie. Dans la discussion : court (trois à six lignes), chiffres en gras avec <b>…</b>, listes avec <ul><li>…</li></ul>, pas de Markdown ni d'émojis. Les fiches des offres citées s'affichent sous votre réponse : inutile de recopier leurs intitulés en entier.");

    return lignes.join("\n");
  }

  // ======================================================================
  // La session
  // ======================================================================

  function tronque(texte) {
    const t = String(texte == null ? "" : texte);
    return t.length > RESULTAT_MAX ? t.slice(0, RESULTAT_MAX) + "\n…(résultat tronqué)" : t;
  }

  /**
   * @param {object} o
   * @param {function} o.contexte  () => { whoami, profil, aujourdhui, resume }
   * @param {function} o.executer  (nom, args) => Promise<any>
   * @param {function} o.confirmer (nom, args) => Promise<boolean>
   * @param {function} o.surEtat   (libelle|null) => void
   */
  function creerSession(o) {
    let historique = [];
    let dernieresOffres = [];   // fiches à afficher sous la réponse

    function reinitialise() { historique = []; }

    function memoire() {
      // On garde les derniers échanges seulement. Un historique qui enfle est
      // une facture qui enfle, pour un gain de pertinence à peu près nul.
      if (historique.length <= MEMOIRE_MAX) return historique.slice();
      const debut = historique.length - MEMOIRE_MAX;
      // Ne jamais commencer la fenêtre par un résultat d'outil orphelin :
      // l'API refuse un message « tool » sans l'appel qui l'a provoqué.
      let i = debut;
      while (i < historique.length && historique[i].role === "tool") i++;
      return historique.slice(i);
    }

    /**
     * Construit le message envoyé au modèle. Un document lisible part sous
     * forme de texte — c'est net et bon marché ; une image part en vision ;
     * un PDF dont on n'a pas su extraire le texte (un document numérisé)
     * part tel quel, le modèle sachant le lire.
     */
    function composeMessage(question, pieces) {
      if (!pieces || !pieces.length) return { role: "user", content: String(question || "") };

      const parties = [];
      let entete = String(question || "");
      pieces.forEach(p => {
        if (p.texte) {
          entete += "\n\n===== Document joint : " + p.nom + " (" + (p.taille || "") +
            (p.pages ? ", " + p.pages + " pages" : "") + ") =====\n" + p.texte +
            (p.tronque ? "\n[…document tronqué : seul le début vous est transmis]" : "");
        } else if (p.erreur || p.avertissement) {
          entete += "\n\n[Document joint : " + p.nom + " — " + (p.erreur || p.avertissement) + "]";
        }
      });
      parties.push({ type: "text", text: entete });

      pieces.forEach(p => {
        if (p.genre === "image" && p.dataUri) {
          parties.push({ type: "image_url", image_url: { url: p.dataUri, detail: "high" } });
        } else if (p.genre === "pdf" && !p.texte && p.base64) {
          parties.push({ type: "file", file: { filename: p.nom, file_data: "data:application/pdf;base64," + p.base64 } });
        }
      });
      return { role: "user", content: parties };
    }

    /** Version allégée conservée dans l'historique : une image relue à chaque
     *  tour se paie à chaque tour. */
    function composeResume(question, pieces) {
      if (!pieces || !pieces.length) return String(question || "");
      return String(question || "") + "\n[Pièces jointes à ce message : " +
        pieces.map(p => p.nom).join(", ") + "]";
    }

    async function envoie(question, pieces) {
      const indexQuestion = historique.length;
      historique.push(composeMessage(question, pieces));
      const allege = () => { historique[indexQuestion] = { role: "user", content: composeResume(question, pieces) }; };
      dernieresOffres = [];
      const outilsUtilises = [];

      for (let tour = 0; tour < TOURS_MAX; tour++) {
        const messages = [{ role: "system", content: consigne(o.contexte()) }].concat(memoire());

        if (o.surEtat) o.surEtat(tour === 0 ? null : "Consultation du registre…");
        const rep = await window.aa.ia.conversation({ messages, tools: outilsPour((o.contexte() || {}).profil) });

        if (!rep || !rep.ok) {
          // On retire la question : elle sera reposée au moteur local, et la
          // laisser ici polluerait la suite de la conversation.
          historique.splice(indexQuestion);
          return { erreur: true, categorie: (rep && rep.categorie) || "erreur", message: (rep && rep.message) || "L'IA n'a pas répondu." };
        }

        const msg = rep.message || {};
        const appels = msg.tool_calls || [];

        if (!appels.length) {
          allege();
          historique.push({ role: "assistant", content: msg.content || "" });
          return { texte: msg.content || "", offres: dernieresOffres, outils: outilsUtilises, usage: rep.usage, modele: rep.modele,
                   secours: !!rep.secours, fournisseur: rep.fournisseur || "openai" };
        }

        // L'appel doit figurer dans l'historique avant son résultat.
        historique.push({ role: "assistant", content: msg.content || null, tool_calls: appels });

        for (const appel of appels) {
          const nom = appel.function && appel.function.name;
          let args = {};
          try { args = JSON.parse((appel.function && appel.function.arguments) || "{}"); } catch (_) { args = {}; }
          outilsUtilises.push(nom);

          let resultat;
          if (estEcriture(nom, args)) {
            if (o.surEtat) o.surEtat(null);
            const accord = await o.confirmer(nom, args);
            if (!accord) {
              resultat = { refuse: true, message: "L'utilisateur a refusé cette action. Ne la retentez pas ; proposez autre chose ou demandez ce qu'il souhaite." };
            } else {
              if (o.surEtat) o.surEtat(/^produire_/.test(nom) ? "Rédaction du document…" : nom === "envoyer_courriel" ? "Envoi…" : "Enregistrement…");
              try { resultat = await o.executer(nom, args); }
              catch (e) { resultat = { erreur: true, message: (e && e.message) || String(e) }; }
            }
          } else {
            if (o.surEtat) o.surEtat(/^produire_/.test(nom) ? "Rédaction du document…"
              : nom === "analyser_offre" ? "Analyse de l'offre…"
              : nom === "chercher_offres" ? "Recherche dans le registre…" : "Consultation du registre…");
            try { resultat = await o.executer(nom, args); }
            catch (e) { resultat = { erreur: true, message: (e && e.message) || String(e) }; }
          }

          // Les fiches à montrer sous la réponse viennent des recherches.
          if (resultat && Array.isArray(resultat.__fiches)) {
            dernieresOffres = resultat.__fiches;
            delete resultat.__fiches;
          }

          historique.push({
            role: "tool",
            tool_call_id: appel.id,
            content: tronque(JSON.stringify(resultat === undefined ? { ok: true } : resultat))
          });
        }
      }

      allege();
      return {
        texte: "J'ai enchaîné plusieurs recherches sans parvenir à une conclusion. Reformulez en une question plus précise.",
        offres: dernieresOffres, outils: outilsUtilises
      };
    }

    return { envoie, reinitialise, get historique() { return historique.slice(); } };
  }

  window.AAIA = { creerSession, OUTILS, OUTILS_ADMIN, NOMS_ECRITURE, estEcriture, VERSION };
})();
