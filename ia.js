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

  const VERSION = "1.0.0";
  const TOURS_MAX = 6;          // appels d'outils enchaînés avant de rendre la main
  const MEMOIRE_MAX = 24;       // messages conservés : au-delà, la facture grimpe
  const RESULTAT_MAX = 6000;    // caractères d'un résultat d'outil

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
    sans_echeance: { type: "boolean", description: "Ne garder que les offres sans date limite renseignée." }
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
      { type: "object", properties: {} }]
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
      }, required: ["fichier", "offre_id"] }]
  ];

  const NOMS_ECRITURE = new Set(ECRITURE.map(o => o[0]));

  function enSchema(liste) {
    return liste.map(([name, description, parameters]) => ({
      type: "function",
      function: { name, description, parameters }
    }));
  }

  const OUTILS = enSchema(LECTURE).concat(enSchema(NAVIGATION), enSchema(ECRITURE));

  // ======================================================================
  // La consigne
  // ======================================================================

  function consigne(ctx) {
    const c = ctx || {};
    const r = c.resume || {};
    const lignes = [];

    lignes.push("Vous êtes l'assistant du logiciel « A&A Registre des Offres », utilisé par le cabinet Groupe A&A Strategy & Investment Advisory, à Dakar. Le logiciel sert à repérer, arbitrer et suivre les appels d'offres, manifestations d'intérêt et marchés publics au Sénégal.");
    lignes.push("");
    lignes.push("VOTRE INTERLOCUTEUR");
    lignes.push("- Nom : " + (c.whoami || "un collaborateur"));
    lignes.push("- Profil : " + (c.profil === "administrateur" ? "administrateur (peut tout faire, y compris trancher un GO / NO GO et supprimer)" : "contributeur (ne peut ni supprimer ni trancher un GO / NO GO)"));
    lignes.push("- Date du jour : " + (c.aujourdhui || ""));
    lignes.push("");
    lignes.push("ÉTAT DU REGISTRE (instantané, à vérifier par les outils avant toute affirmation chiffrée)");
    lignes.push("- " + (r.total || 0) + " offres au total, dont " + (r.echeanceSemaine || 0) + " à échéance sous 7 jours et " + (r.enRetard || 0) + " en retard.");
    if (r.statuts) lignes.push("- Statuts : " + r.statuts);
    if (r.types) lignes.push("- Types présents : " + r.types);
    if (r.secteurs) lignes.push("- Secteurs présents : " + r.secteurs);
    if (r.regions) lignes.push("- Régions présentes : " + r.regions);
    if (r.filiales) lignes.push("- Filiales : " + r.filiales);
    lignes.push("- " + (r.opportunites || 0) + " opportunités de prospection, " + (r.sources || 0) + " sources de veille.");
    lignes.push("");
    lignes.push("COMMENT TRAVAILLER");
    lignes.push("1. Ne donnez jamais un chiffre ni le titre d'une offre de mémoire : appelez un outil. L'instantané ci-dessus sert à vous orienter, pas à répondre.");
    lignes.push("2. Avant de filtrer sur un type, un secteur ou une région, employez le libellé exact — liste_valeurs vous le donne. « BTP » et « bâtiment » ne sont pas la même chaîne en base.");
    lignes.push("3. Enchaînez les outils autant qu'il le faut : chercher, puis ouvrir le détail, puis conclure. Vous avez droit à plusieurs tours.");
    lignes.push("4. Quand l'utilisateur veut voir une sélection dans le registre plutôt que dans la discussion, appliquez de vrais filtres à l'écran (appliquer_filtres) : il pourra les affiner et les exporter.");
    lignes.push("5. Si une demande est ambiguë, posez une question courte plutôt que de deviner.");
    lignes.push("6. Quand un document est joint à la discussion, son texte vous est fourni avec la question. Servez-vous-en : résumez, comparez au registre, repérez l'autorité contractante, l'objet et la date limite. Si le document décrit un appel d'offres absent du registre, proposez de l'enregistrer — sans jamais inventer les champs manquants. Pour ranger la pièce dans les documents d'une offre, employez joindre_document_a_offre avec le nom exact du fichier.");
    lignes.push("");
    lignes.push("CE QUE VOUS NE FAITES PAS");
    lignes.push("- Vous ne supprimez rien : aucun outil ne le permet, et c'est voulu.");
    lignes.push("- Vous ne tranchez aucun GO / NO GO : cette décision engage le cabinet, elle se prend dans la fiche de l'offre, et la base la refuse aux contributeurs.");
    lignes.push("- Vous n'inventez aucune donnée pour remplir un formulaire. Si l'intitulé ou l'autorité contractante manque, demandez-les.");
    lignes.push("- Toute écriture est soumise à la confirmation de l'utilisateur. S'il refuse, n'insistez pas et proposez autre chose.");
    lignes.push("");
    lignes.push("TON");
    lignes.push("Français professionnel, direct, sans flatterie ni formules creuses. Des réponses courtes : trois à cinq lignes en général. Les chiffres en gras avec <b>…</b>, les listes avec <ul><li>…</li></ul>. Pas de Markdown, pas de tableaux, pas d'émojis. Vous parlez à un consultant pressé, pas à un lecteur de manuel.");
    lignes.push("Quand vous citez des offres, ne recopiez pas leurs intitulés en longueur : l'application les affiche déjà en fiches cliquables sous votre réponse. Dites ce qui compte — combien, lesquelles méritent attention, pourquoi.");

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
        const rep = await window.aa.ia.conversation({ messages, tools: OUTILS });

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
          return { texte: msg.content || "", offres: dernieresOffres, outils: outilsUtilises, usage: rep.usage, modele: rep.modele };
        }

        // L'appel doit figurer dans l'historique avant son résultat.
        historique.push({ role: "assistant", content: msg.content || null, tool_calls: appels });

        for (const appel of appels) {
          const nom = appel.function && appel.function.name;
          let args = {};
          try { args = JSON.parse((appel.function && appel.function.arguments) || "{}"); } catch (_) { args = {}; }
          outilsUtilises.push(nom);

          let resultat;
          if (NOMS_ECRITURE.has(nom)) {
            if (o.surEtat) o.surEtat(null);
            const accord = await o.confirmer(nom, args);
            if (!accord) {
              resultat = { refuse: true, message: "L'utilisateur a refusé cette action. Ne la retentez pas ; proposez autre chose ou demandez ce qu'il souhaite." };
            } else {
              if (o.surEtat) o.surEtat("Enregistrement…");
              try { resultat = await o.executer(nom, args); }
              catch (e) { resultat = { erreur: true, message: (e && e.message) || String(e) }; }
            }
          } else {
            if (o.surEtat) o.surEtat(nom === "chercher_offres" ? "Recherche dans le registre…" : "Consultation du registre…");
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

  window.AAIA = { creerSession, OUTILS, NOMS_ECRITURE, VERSION };
})();
