"use strict";
/**
 * Éligibilité — faut-il répondre à cette offre, et à quelles conditions ?
 *
 * Le principe, et il ne se négocie pas : les critères ÉLIMINATOIRES sont des
 * portes. Chacun est jugé à part — conforme, non conforme, ou à vérifier — et
 * un seul échec suffit à fermer la porte. Le score technique ne vient qu'après,
 * et seulement si les portes sont franchissables.
 *
 * Pourquoi y tenir : la première analyse que l'équipe a reçue annonçait « 85 %
 * de compatibilité — POSTULER » alors qu'une exigence éliminatoire (ISO 27001)
 * n'était pas remplie. Fondre un critère éliminatoire dans une note moyenne
 * cache une disqualification derrière un bon chiffre : l'offre aurait été
 * écartée à l'ouverture des plis, et le travail de montage perdu.
 *
 * Le moteur ne devine rien. Quand le profil d'A&A ne dit pas ce qu'il faut pour
 * juger (chiffre d'affaires non renseigné, certifications non listées), il
 * répond « à vérifier » plutôt que de supposer. Un « conforme » inventé est
 * plus dangereux qu'un « je ne sais pas ».
 *
 * Fichier classique (pas de module ES), exposé en window.AA.eligibilite, comme
 * metier.js. Il ne touche ni à la base ni à l'écran : on lui passe des critères
 * et un profil, il rend un verdict.
 */
(function () {
  const AA = (window.AA = window.AA || {});
  const { aplati } = AA.noyau;

  // Les ligatures ne se décomposent pas : « œuvre » doit rencontrer « oeuvre ».
  const plat = (t) => aplati(t).replace(/œ/g, "oe").replace(/æ/g, "ae");

  // ---------------------------------------------------------------- vocabulaire
  const TYPES = {
    chiffre_affaires: { libelle: "Chiffre d'affaires", unite: "FCFA" },
    experience:       { libelle: "Ancienneté de l'entreprise", unite: "ans" },
    references:       { libelle: "Références similaires", unite: "références" },
    certification:    { libelle: "Certification", unite: null },
    agrement:         { libelle: "Agrément", unite: null },
    personnel:        { libelle: "Personnel clé", unite: null },
    autre:            { libelle: "Autre exigence", unite: null }
  };

  const STATUT = { CONFORME: "CONFORME", NON_CONFORME: "NON_CONFORME", A_VERIFIER: "A_VERIFIER" };

  const VERDICT = {
    POSTULER: "POSTULER",
    POSTULER_EN_GROUPEMENT: "POSTULER_EN_GROUPEMENT",
    NE_PAS_POSTULER: "NE_PAS_POSTULER",
    A_COMPLETER: "A_COMPLETER"
  };

  const LIBELLE_VERDICT = {
    POSTULER: "Postuler",
    POSTULER_EN_GROUPEMENT: "Postuler en groupement",
    NE_PAS_POSTULER: "Ne pas postuler",
    A_COMPLETER: "À compléter"
  };

  /**
   * Domaines des filiales proposés par défaut, repris des règles de répartition
   * du collecteur (collector/normalize.js) et du mapping. C'est un point de
   * départ, modifiable dans le profil — pas une vérité.
   */
  const FILIALES_PAR_DEFAUT = [
    { nom: "A&A Strategy", domaines: ["stratégie", "étude", "diagnostic", "politique publique",
      "schéma directeur", "plan stratégique", "gouvernance", "évaluation", "réforme",
      "institutionnel", "organisationnel", "enquête"] },
    { nom: "A&A Finance and Investment Advisory", domaines: ["financement", "investissement",
      "PPP", "partenariat public-privé", "structuration financière", "levée de fonds",
      "évaluation financière", "audit", "gestion financière", "budget"] },
    { nom: "A&A Project Delivery", domaines: ["maîtrise d'œuvre", "supervision",
      "contrôle des travaux", "infrastructure", "travaux", "génie civil",
      "assistance à maîtrise d'ouvrage", "suivi-évaluation", "construction", "forage",
      "route", "assainissement"] },
    { nom: "A&A Knowledge Institute", domaines: ["formation", "renforcement de capacités",
      "renforcement des capacités", "coaching", "mentorat", "incubation", "capitalisation"] }
  ];

  // ------------------------------------------------------- lecture des montants
  /**
   * Lit un montant tel qu'il est écrit dans un DAO : « 100 000 000 FCFA »,
   * « 100 M FCFA », « 1,5 milliard », « 250 millions de francs CFA ».
   * Rend null quand il n'y a rien de lisible — jamais une valeur supposée.
   */
  function lisMontant(texte) {
    const t = plat(texte).replace(/ | /g, " ");
    const m = t.match(/(\d[\d\s.,]*)\s*(milliards?|mds?|millions?|m\b|mio)?/);
    if (!m) return null;
    let brut = m[1].trim().replace(/\s/g, "");
    const multi = m[2] ? (/^m(illiard|d)/.test(m[2]) ? 1e9 : 1e6) : 1;
    // « 1,5 milliard » : la virgule est décimale ; « 100.000.000 » : séparateur.
    if (multi > 1) brut = brut.replace(",", ".");
    else brut = brut.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", ".");
    const n = parseFloat(brut);
    return isFinite(n) ? Math.round(n * multi) : null;
  }

  /** « 5 ans », « cinq (5) années », « au moins 3 références » → 5, 5, 3. */
  function lisNombre(texte) {
    const m = plat(texte).match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  /**
   * Devine le type et la valeur d'une exigence recopiée du DAO. C'est une aide
   * à la saisie : l'équipe voit le résultat et le corrige avant d'enregistrer.
   */
  function devineCritere(texte) {
    const t = plat(texte);
    const c = { intitule: String(texte || "").trim(), exigence: String(texte || "").trim(),
                type: "autre", valeur: null, code: null, bloquant: true, groupable: null };
    if (/chiffre d'?affaires|\bca\b|turnover/.test(t)) {
      c.type = "chiffre_affaires"; c.valeur = lisMontant(t);
    } else if (/\biso\b|certifi/.test(t)) {
      c.type = "certification";
      const iso = t.match(/iso(?:\s*\/?\s*iec)?\s*(\d{4,5})/);
      c.code = iso ? "ISO " + iso[1] : null;
    } else if (/agrement|agree|habilitation/.test(t)) {
      c.type = "agrement";
    } else if (/reference|marches? similaires|missions? similaires|projets? similaires/.test(t)) {
      c.type = "references"; c.valeur = lisNombre(t);
    } else if (/\bans?\b|annees?|anciennete|experience/.test(t) && /\d/.test(t)) {
      c.type = "experience"; c.valeur = lisNombre(t);
    } else if (/chef de mission|expert|ingenieur|personnel|consultant/.test(t)) {
      c.type = "personnel";
    }
    return c;
  }

  // ------------------------------------------------------- un critère, jugé seul
  /** Deux certifications sont la même si elles portent le même numéro de norme. */
  function memeCertification(a, b) {
    const pa = plat(a), pb = plat(b);
    const na = (pa.match(/(\d{4,5})/) || [])[1], nb = (pb.match(/(\d{4,5})/) || [])[1];
    if (na && nb) return na === nb;
    return pa && pb && (pa.includes(pb) || pb.includes(pa));
  }

  /**
   * Juge un critère contre le profil.
   * @returns {{ statut: string, motif: string }}
   */
  function jugeCritere(critere, profil, aujourdhui) {
    const c = critere || {};
    const p = profil || {};
    const nom = c.intitule || (TYPES[c.type] || TYPES.autre).libelle;

    // L'équipe a tranché à la main : son jugement prime sur tout calcul.
    if (c.statut_manuel === STATUT.CONFORME || c.statut_manuel === STATUT.NON_CONFORME) {
      return { statut: c.statut_manuel, motif: "Établi par l'équipe" };
    }

    switch (c.type) {
      case "chiffre_affaires": {
        if (c.valeur == null) return { statut: STATUT.A_VERIFIER, motif: "Montant exigé illisible : précisez-le" };
        if (p.chiffre_affaires_fcfa == null) return { statut: STATUT.A_VERIFIER, motif: "Chiffre d'affaires d'A&A non renseigné dans le profil" };
        return p.chiffre_affaires_fcfa >= c.valeur
          ? { statut: STATUT.CONFORME, motif: "Chiffre d'affaires suffisant" }
          : { statut: STATUT.NON_CONFORME, motif: "Chiffre d'affaires inférieur au seuil exigé" };
      }
      case "experience": {
        if (c.valeur == null) return { statut: STATUT.A_VERIFIER, motif: "Durée exigée illisible : précisez-la" };
        if (p.annee_creation == null) return { statut: STATUT.A_VERIFIER, motif: "Année de création d'A&A non renseignée dans le profil" };
        const annee = (aujourdhui || new Date()).getFullYear();
        const anciennete = annee - p.annee_creation;
        return anciennete >= c.valeur
          ? { statut: STATUT.CONFORME, motif: anciennete + " ans d'existence" }
          : { statut: STATUT.NON_CONFORME, motif: anciennete + " ans d'existence pour " + c.valeur + " exigés" };
      }
      case "references": {
        if (c.valeur == null) return { statut: STATUT.A_VERIFIER, motif: "Nombre de références exigé illisible" };
        if (p.references_nombre == null) return { statut: STATUT.A_VERIFIER, motif: "Nombre de références d'A&A non renseigné dans le profil" };
        return p.references_nombre >= c.valeur
          ? { statut: STATUT.CONFORME, motif: p.references_nombre + " références" }
          : { statut: STATUT.NON_CONFORME, motif: p.references_nombre + " références pour " + c.valeur + " exigées" };
      }
      case "certification":
      case "agrement": {
        const liste = c.type === "certification" ? p.certifications : p.agrements;
        const cible = c.code || c.exigence || c.intitule;
        if (!cible) return { statut: STATUT.A_VERIFIER, motif: "Exigence non précisée" };
        // null : le profil ne dit rien ; [] : le profil dit « aucune ». Ce n'est
        // pas la même chose, et seul le second permet de conclure.
        if (!Array.isArray(liste)) {
          return { statut: STATUT.A_VERIFIER, motif: (c.type === "certification" ? "Certifications" : "Agréments") + " d'A&A non renseignés dans le profil" };
        }
        return liste.some(x => memeCertification(x, cible))
          ? { statut: STATUT.CONFORME, motif: "Détenu par A&A" }
          : { statut: STATUT.NON_CONFORME, motif: "Non détenu par A&A" };
      }
      default:
        return { statut: STATUT.A_VERIFIER, motif: "À examiner par l'équipe : " + nom };
    }
  }

  // ------------------------------------------------------------ le score technique
  /** La filiale dont les domaines rencontrent le plus l'objet de l'offre. */
  function filialePilote(offre, profil) {
    const texte = plat([offre && offre.titre, offre && offre.description, offre && offre.secteur].join(" "));
    const filiales = (profil && Array.isArray(profil.filiales) && profil.filiales.length)
      ? profil.filiales : FILIALES_PAR_DEFAUT;
    let meilleure = null, max = 0;
    filiales.forEach(f => {
      const n = (f.domaines || []).filter(d => d && texte.includes(plat(d))).length;
      if (n > max) { max = n; meilleure = f.nom; }
    });
    return { nom: meilleure, correspondances: max };
  }

  /**
   * Le score technique, détaillé composante par composante. Une composante
   * dont on ne sait rien n'est pas comptée — ni à zéro, ni au maximum — et le
   * total se rapporte à ce qui a pu être jugé.
   */
  function scoreTechnique(offre, profil, juges) {
    const composantes = [];

    const pilote = filialePilote(offre, profil);
    composantes.push({
      nom: "Adéquation aux métiers",
      points: pilote.correspondances >= 2 ? 50 : pilote.correspondances === 1 ? 30 : 0,
      max: 50,
      detail: pilote.nom
        ? pilote.nom + " — " + pilote.correspondances + (pilote.correspondances > 1 ? " domaines en commun" : " domaine en commun")
        : "Aucune filiale ne correspond à l'objet"
    });

    const autres = juges.filter(c => !c.bloquant && c.statut !== STATUT.A_VERIFIER);
    if (autres.length) {
      const ok = autres.filter(c => c.statut === STATUT.CONFORME).length;
      composantes.push({ nom: "Critères non éliminatoires", points: Math.round(30 * ok / autres.length), max: 30,
                         detail: ok + " sur " + autres.length + " remplis" });
    }

    const lieux = (profil && Array.isArray(profil.localisations)) ? profil.localisations : [];
    if (lieux.length) {
      const texte = plat([offre && offre.titre, offre && offre.description, offre && offre.region, offre && offre.emetteur].join(" "));
      const vu = lieux.find(l => l && texte.includes(plat(l)));
      composantes.push({ nom: "Localisation", points: vu ? 20 : 0, max: 20,
                         detail: vu ? "Zone couverte : " + vu : "Hors des zones déclarées" });
    }

    const points = composantes.reduce((s, c) => s + c.points, 0);
    const max = composantes.reduce((s, c) => s + c.max, 0);
    return { total: max ? Math.round(100 * points / max) : null, composantes, filiale_pilote: pilote.nom, adequation: pilote.correspondances };
  }

  // ------------------------------------------------------------------ le verdict
  /**
   * Rend la fiche d'éligibilité d'une offre.
   *
   * @param {object}   offre     l'offre (titre, description, secteur, region…)
   * @param {object[]} criteres  les exigences relevées dans le DAO
   * @param {object}   profil    le profil d'A&A
   * @param {object}   [options] { aujourdhui: Date }
   */
  function evalue(offre, criteres, profil, options) {
    const o = options || {};
    const liste = Array.isArray(criteres) ? criteres : [];

    if (!liste.length) {
      return {
        verdict: VERDICT.A_COMPLETER, libelle: LIBELLE_VERDICT.A_COMPLETER,
        criteres: [], conditions: ["Relever dans le DAO les critères éliminatoires et les saisir"],
        raisons: ["Aucun critère saisi : sans eux, rien ne permet de juger l'éligibilité"],
        score: null, role_aa: null
      };
    }

    const juges = liste.map(c => Object.assign({}, c, jugeCritere(c, profil, o.aujourdhui),
                                               { bloquant: c.bloquant !== false }));
    const bloquants = juges.filter(c => c.bloquant);
    const echecs = bloquants.filter(c => c.statut === STATUT.NON_CONFORME);
    const inconnus = bloquants.filter(c => c.statut === STATUT.A_VERIFIER);
    const nom = (c) => c.intitule || c.exigence || (TYPES[c.type] || TYPES.autre).libelle;

    let verdict, conditions = [], raisons = [];

    const sansIssue = echecs.filter(c => c.groupable === false);
    if (sansIssue.length) {
      verdict = VERDICT.NE_PAS_POSTULER;
      sansIssue.forEach(c => raisons.push("« " + nom(c) + " » n'est pas rempli et ne peut pas être apporté par un partenaire"));
    } else if (echecs.length) {
      verdict = VERDICT.POSTULER_EN_GROUPEMENT;
      echecs.forEach(c => {
        raisons.push("« " + nom(c) + " » — " + c.motif);
        conditions.push("Trouver un partenaire qui apporte : " + nom(c));
        if (c.groupable == null) {
          conditions.push("Vérifier dans le DAO que « " + nom(c) + " » peut être apporté par un membre du groupement — certains dossiers l'exigent du mandataire, voire de chaque membre");
        }
      });
      inconnus.forEach(c => conditions.push("Compléter : " + nom(c) + " — " + c.motif));
    } else if (inconnus.length) {
      verdict = VERDICT.A_COMPLETER;
      inconnus.forEach(c => {
        raisons.push("« " + nom(c) + " » ne peut pas encore être jugé");
        conditions.push("Compléter : " + nom(c) + " — " + c.motif);
      });
    } else {
      verdict = VERDICT.POSTULER;
      raisons.push(bloquants.length
        ? "Les " + bloquants.length + " critère(s) éliminatoire(s) sont remplis"
        : "Aucun critère éliminatoire relevé");
    }

    // Le score n'a de sens qu'une fois les portes franchissables. Pour une offre
    // qu'on ne peut pas jouer, ou qu'on ne sait pas encore juger, un chiffre
    // ferait croire à une analyse qui n'a pas eu lieu.
    let score = null, role = null;
    if (verdict === VERDICT.POSTULER || verdict === VERDICT.POSTULER_EN_GROUPEMENT) {
      score = scoreTechnique(offre, profil, juges);
      if (verdict === VERDICT.POSTULER) role = "Soumissionnaire seul";
      else role = score.adequation >= 2 ? "Mandataire du groupement" : "Membre du groupement";
    }

    return { verdict, libelle: LIBELLE_VERDICT[verdict], criteres: juges, conditions, raisons, score, role_aa: role };
  }

  AA.eligibilite = {
    TYPES, STATUT, VERDICT, LIBELLE_VERDICT, FILIALES_PAR_DEFAUT,
    lisMontant, lisNombre, devineCritere, jugeCritere, filialePilote, scoreTechnique, evalue
  };
})();
