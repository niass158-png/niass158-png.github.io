"use strict";
/**
 * Métier — le cycle de vie d'une offre, défini une seule fois.
 *
 * Pourquoi ce fichier existe : « offre déposée » avait trois définitions
 * différentes dans l'application.
 *
 *   · l'onglet Suivi        : une date de soumission, OU un résultat, OU un statut
 *   · le tableau de bord    : une date, OU un statut, OU certains résultats seulement
 *   · la réponse de l'assistant : une date OU un statut — le résultat ignoré
 *
 * Trois écrans pouvaient donc donner trois nombres pour la même question, sans
 * que rien ne le signale. Pire, la définition du tableau de bord oubliait
 * « Retrait / marché annulé » parmi les dépôts tout en le comptant parmi les
 * perdues : le nombre d'offres « en attente de résultat » pouvait devenir
 * négatif.
 *
 * Il n'y a plus qu'une règle, et elle est ici. Elle ne dépend d'aucun état :
 * on lui passe les offres, elle rend des nombres.
 */
(function () {
  const AA = (window.AA = window.AA || {});
  const { jourIso } = AA.noyau;

  /** Les statuts de suivi qui impliquent qu'un dossier est parti. */
  const STATUTS_DEPOSES = ["Soumise", "Gagnée", "Perdue"];

  /**
   * Un dossier est déposé dès qu'un des trois signaux est là. Un résultat,
   * quel qu'il soit, en est un : on ne reçoit pas de résultat sans avoir
   * déposé. C'est ce point que les trois anciennes définitions traitaient
   * chacune à leur façon.
   */
  function estSoumise(o) {
    if (o.date_soumission || (o.resultat && String(o.resultat).trim())) return true;
    // Un NO GO passait autrefois l'offre en « Perdue » : ce n'est pas un dépôt.
    if (o.decision === "NO GO" && o.statut_traitement === "Perdue") return false;
    return STATUTS_DEPOSES.includes(o.statut_traitement);
  }

  function estGagnee(o) {
    return o.statut_traitement === "Gagnée" || /gagn/i.test(o.resultat || "");
  }

  /** Un retrait et un marché annulé sont rangés avec les perdues : dans les
   *  deux cas l'affaire est close sans contrat. */
  function estPerdue(o) {
    return o.statut_traitement === "Perdue" || /perdu|retrait|annul/i.test(o.resultat || "");
  }

  /**
   * Une offre est « engagée » dès qu'on a décidé d'y aller. Le plus souvent
   * c'est un GO enregistré ; parfois le dossier part sans que personne ait
   * coché la case. Compter les deux évite un entonnoir qui s'élargit — une
   * marche plus large que la précédente est un non-sens visuel.
   */
  function estEngagee(o) {
    return o.decision === "GO" || estSoumise(o) || estGagnee(o);
  }

  function estArbitree(o) {
    return !!o.decision && o.decision !== "Non arbitrée";
  }

  /** Les offres déposées, les plus récentes d'abord. */
  function soumissions(offres) {
    return (offres || []).filter(estSoumise)
      .sort((a, b) => String(b.date_limite || "").localeCompare(String(a.date_limite || "")));
  }

  /** Le bilan court, celui que l'assistant récite. */
  function bilanSoumissions(offres) {
    const soumises = (offres || []).filter(estSoumise);
    const gagnees = soumises.filter(estGagnee).length;
    const perdues = soumises.filter(estPerdue).length;
    const tranchees = gagnees + perdues;
    return {
      soumises: soumises.length, gagnees, perdues,
      en_attente: soumises.length - tranchees,
      taux_reussite_pourcent: tranchees ? Math.round(gagnees * 100 / tranchees) : null
    };
  }

  /**
   * Le bilan d'un lot d'offres, sur deux populations distinctes.
   *
   * Les lignes parties en corbeille comptent dans la collecte — c'est la mesure
   * de ce que la veille ramène — mais jamais dans les décisions ni les
   * résultats : une offre écartée n'est pas « non arbitrée », elle est sortie
   * du circuit. Les confondre affichait « 198 offres sur 55 », soit 360 %.
   */
  function bilanFiliale(rows) {
    const toutes = rows || [];
    const vivantes = toutes.filter(o => !o.supprime_le);
    const go = vivantes.filter(o => o.decision === "GO").length;
    const nogo = vivantes.filter(o => o.decision === "NO GO").length;
    const soumises = vivantes.filter(estSoumise);
    const gagnees = soumises.filter(estGagnee).length;
    const perdues = soumises.filter(estPerdue).length;
    const tranchees = gagnees + perdues;
    const auj = jourIso(new Date());
    const delais = soumises.map(o => {
      const a = Date.parse(o.created_at || "");
      const b = Date.parse((o.date_soumission || "") + "T00:00:00");
      return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86400000) : null;
    }).filter(v => v != null && v >= 0);

    return {
      collectees: toutes.length,
      detectees: toutes.length,        // nom conservé : l'export Excel s'y réfère
      retenues: vivantes.length,
      ouvertes: vivantes.filter(o => o.date_limite && o.date_limite >= auj).length,
      engagees: vivantes.filter(estEngagee).length,
      go, nogo,
      nonArbitrees: vivantes.filter(o => !estArbitree(o)).length,
      soumises: soumises.length,
      gagnees, perdues,
      attente: soumises.length - tranchees,
      reussite: tranchees ? Math.round((gagnees / tranchees) * 100) : null,
      transformation: vivantes.length ? Math.round((soumises.length / vivantes.length) * 100) : 0,
      delai: delais.length ? Math.round(delais.reduce((s, v) => s + v, 0) / delais.length) : null,
      corbeille: toutes.filter(o => o.supprime_le).length
    };
  }

  // ------------------------------------------------ en attente de décision
  /**
   * Une offre déposée dont le résultat n'est pas encore connu. Elle quitte
   * « Veille & registre » — il n'y a plus rien à y décider ni à préparer — et
   * vit dans l'onglet « En attente de décision » jusqu'au résultat. Une
   * présélection (« Retenu (présélection) ») n'est pas un résultat : l'offre
   * reste en attente de la décision finale.
   */
  function estEnAttente(o) {
    return !!o && !o.supprime_le && estSoumise(o) && !estGagnee(o) && !estPerdue(o);
  }

  const JOUR = 86400000;
  const jourDe = (iso) => { const t = Date.parse(String(iso || "").slice(0, 10) + "T00:00:00"); return Number.isFinite(t) ? t : null; };

  /**
   * Depuis combien de jours l'offre attend, et depuis quoi. La date de dépôt
   * fait foi ; à défaut, la date limite (le dossier est parti au plus tard ce
   * jour-là), puis le jour où le statut « Soumise » a été posé. `base` dit
   * laquelle a servi : l'écran signale une date estimée.
   */
  function attente(o, aujourdhui) {
    const auj = jourDe(aujourdhui ? jourIso(aujourdhui) : jourIso(new Date()));
    let base = null, t = null;
    if (jourDe(o.date_soumission) != null) { base = "depot"; t = jourDe(o.date_soumission); }
    else if (jourDe(o.date_limite) != null && jourDe(o.date_limite) <= auj) { base = "limite"; t = jourDe(o.date_limite); }
    else if (o.statut_le && Number.isFinite(Date.parse(o.statut_le))) { base = "statut"; t = jourDe(o.statut_le); }
    const jours = t == null ? null : Math.max(0, Math.round((auj - t) / JOUR));
    const depuisRelance = jourDe(o.date_relance) != null ? Math.max(0, Math.round((auj - jourDe(o.date_relance)) / JOUR)) : null;
    const depouillementPasse = jourDe(o.date_depouillement) != null && jourDe(o.date_depouillement) < auj;
    // À relancer : trois semaines sans nouvelles, et pas de relance dans les
    // deux dernières ; ou un dépouillement passé sans résultat.
    const aRelancer = (jours != null && jours >= 21 && (depuisRelance == null || depuisRelance >= 14))
      || (depouillementPasse && (depuisRelance == null || depuisRelance >= 7));
    // Les offres sont le plus souvent valables 90 jours : au-delà, la validité
    // est sans doute échue — il faut une prorogation ou le résultat.
    const niveau = jours == null ? "inconnu" : jours >= 90 ? "longue" : jours >= 30 ? "moyenne" : "recente";
    return { jours, base, depuisRelance, depouillementPasse, aRelancer, niveau,
             preselection: /retenu|pr[ée]s[ée]lection/i.test(o.resultat || "") };
  }

  /** Les offres en attente, la plus ancienne attente d'abord. */
  function enAttente(offres, aujourdhui) {
    return (offres || []).filter(estEnAttente)
      .sort((a, b) => (attente(b, aujourdhui).jours || 0) - (attente(a, aujourdhui).jours || 0));
  }

  // ------------------------------------------------ rangement automatique
  /**
   * Le registre ne garde que ce sur quoi on peut encore agir. Une offre
   * vivante en sort :
   *   · déposée (avec ou sans résultat) → onglets « En attente » et « Soumissions » ;
   *   · ou bien rangée en corbeille, avec un motif, le lendemain de sa date
   *     limite si personne n'y est allé, dès qu'elle est tranchée NO GO, ou
   *     JOURS_GRACE_GO jours après la date limite si elle était GO sans que
   *     le dépôt ait été noté (le temps de le noter).
   * Renvoie le motif de mise en corbeille, ou null si l'offre reste.
   */
  const JOURS_GRACE_GO = 7;
  const JOURS_CORBEILLE = 90;

  function motifArchivage(o, aujourdhui) {
    if (!o || o.supprime_le || estSoumise(o)) return null;
    if (o.decision === "NO GO") return "NO GO" + (o.decision_motif ? " — " + String(o.decision_motif).slice(0, 150) : "");
    const auj = jourIso(aujourdhui || new Date());
    const limite = String(o.date_limite || "").slice(0, 10);
    if (!limite || limite >= auj) return null;
    if (o.decision === "GO") {
      const retard = Math.round((Date.parse(auj + "T00:00:00") - Date.parse(limite + "T00:00:00")) / JOUR);
      return retard > JOURS_GRACE_GO ? "GO non déposé — date limite dépassée de plus de " + JOURS_GRACE_GO + " jours" : null;
    }
    return "Clôturée sans suite";
  }

  /** Offre qui reste au registre : ni déposée, ni à ranger en corbeille. */
  function estAuRegistre(o, aujourdhui) {
    return !!o && !o.supprime_le && !estSoumise(o) && !motifArchivage(o, aujourdhui);
  }

  /**
   * Effacement automatique : en corbeille depuis plus de JOURS_CORBEILLE
   * jours. Les dossiers réellement déposés ne partent jamais d'eux-mêmes.
   */
  function aPurger(o, maintenant) {
    if (!o || !o.supprime_le || estSoumise(o)) return false;
    const t = Date.parse(o.supprime_le);
    return Number.isFinite(t) && t < (maintenant || Date.now()) - JOURS_CORBEILLE * JOUR;
  }

  AA.metier = {
    JOURS_GRACE_GO, JOURS_CORBEILLE, motifArchivage, estAuRegistre, aPurger,
    STATUTS_DEPOSES,
    estSoumise, estGagnee, estPerdue, estEngagee, estArbitree,
    soumissions, bilanSoumissions, bilanFiliale,
    estEnAttente, attente, enAttente
  };
})();
