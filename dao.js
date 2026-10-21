"use strict";
/**
 * Lecture d'un DAO par l'IA — côté page.
 *
 * Le processus principal a lu le document et obtenu de l'IA une liste brute
 * d'exigences (electron/dao.js). Ici on la rend utilisable par le moteur
 * d'éligibilité, et surtout on la CONTRÔLE :
 *
 *  - chaque exigence doit citer le dossier mot pour mot ; on vérifie que la
 *    citation s'y trouve vraiment. Introuvable → montrée, mais décochée, avec
 *    l'avertissement « citation introuvable dans le document » ;
 *  - un montant en euros est converti au taux fixe (1 € = 655,957 FCFA) ; en
 *    dollars ou autre devise, il n'y a pas de taux fixe : le seuil reste vide
 *    et le critère « à vérifier », plutôt qu'un chiffre approximatif ;
 *  - une exigence déjà présente dans la fiche est signalée et décochée.
 *
 * Rien n'est enregistré ici. Fichier classique exposé en window.AA.dao.
 */
(function () {
  const AA = (window.AA = window.AA || {});
  const E = () => AA.eligibilite;
  const { aplati } = AA.noyau;

  const TYPES_ADMIS = ["chiffre_affaires", "experience", "references", "certification", "agrement", "personnel", "autre"];
  const TAUX_EUR = 655.957;

  // Texte réduit à ses mots : sans accents, sans ponctuation, sans les espaces
  // multiples que la lecture d'un PDF sème partout.
  const mots = (t) => aplati(String(t || "")).replace(/œ/g, "oe").replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, " ").trim();

  /**
   * La citation se trouve-t-elle dans le document ? Exacte d'abord ; sinon on
   * tolère les coupures de ligne et de mise en page en comparant les suites de
   * trois mots : 80 % au moins doivent figurer dans le texte.
   */
  function citationRetrouvee(citation, source) {
    const c = mots(citation), s = mots(source);
    if (!c || c.length < 12) return false;
    if (s.includes(c)) return true;
    const mc = c.split(" "), ms = s.split(" ");
    if (mc.length < 4) return false;
    const triplets = new Set();
    for (let i = 0; i + 2 < ms.length; i++) triplets.add(ms[i] + " " + ms[i + 1] + " " + ms[i + 2]);
    let trouves = 0, total = 0;
    for (let i = 0; i + 2 < mc.length; i++) {
      total++;
      if (triplets.has(mc[i] + " " + mc[i + 1] + " " + mc[i + 2])) trouves++;
    }
    return total > 0 && trouves / total >= 0.8;
  }

  /** Un nombre écrit par l'IA : 100000000, "100 000 000", "100 M"… */
  function nombre(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return isFinite(v) ? v : null;
    const n = E().lisMontant(String(v));
    return n == null ? null : n;
  }

  /** Montant converti en FCFA, ou null avec la raison. */
  function enFcfa(montant, devise, citation) {
    let m = nombre(montant);
    const d = aplati(String(devise || "")).replace(/[^a-z€$]/g, "");
    // L'IA a parfois oublié le chiffre : on le relit dans la citation.
    // Le plus grand montant cité, pas le premier nombre venu (« 3 dernières
    // années » précède souvent le seuil).
    let relu = false;
    if (m == null && citation) {
      const morceaux = String(citation).match(/\d[\d\s.,\u00a0\u202f]*\s*(milliards?|mds?|millions?|m\b|mio)?/gi) || [];
      const vals = morceaux.map(x => E().lisMontant(x)).filter(v => v != null);
      if (vals.length) { m = Math.max.apply(null, vals); relu = true; }
    }
    if (m == null) return { valeur: null, note: "Montant exigé non lu : précisez-le." };
    const cit = aplati(String(citation || ""));
    const enEuro = /^(eur|euros?|€)$/.test(d) || (!d && /€|\beuros?\b/.test(cit));
    const enDollar = /^(usd|\$|dollars?|us)$/.test(d) || (!d && /\$|\busd\b|dollars?/.test(cit));
    if (enEuro) return { valeur: Math.round(m * TAUX_EUR), note: "Converti depuis " + m.toLocaleString("fr-FR") + " € au taux fixe de 655,957 FCFA." };
    if (enDollar || (d && !/^(fcfa|cfa|xof|fcfaxof|francscfa|francs?cfa|f)$/.test(d))) {
      return { valeur: null, note: "Montant en " + (devise || "devise étrangère") + " (" + m.toLocaleString("fr-FR") + ") : pas de taux fixe, à convertir avant de juger." };
    }
    return { valeur: m, note: relu ? "Seuil relu dans la citation : vérifiez-le." : null };
  }

  const GROUPEMENT = {
    cumulable: { groupable: true, note: null },
    chaque_membre: { groupable: false, note: "Exigé de chaque membre du groupement." },
    mandataire: { groupable: null, note: "Exigé du mandataire (chef de file) du groupement." },
    non_precise: { groupable: null, note: null }
  };

  const cle = (x) => [x.type, x.valeur == null ? "" : String(x.valeur),
    x.code ? mots(x.code).replace(/\s/g, "") : (x.valeur == null ? mots(x.intitule || x.exigence).slice(0, 40) : "")].join("|");

  /**
   * @param {object} brut       réponse de l'IA ({ exigences:[…], remarques })
   * @param {string} source     texte effectivement transmis à l'IA
   * @param {object[]} existantes exigences déjà dans la fiche
   * @param {object} [meta]     { document, ajoutePar }
   * @returns {{ propositions: object[], remarques: string, ecartees: number }}
   */
  function normalise(brut, source, existantes, meta) {
    const numerise = !!(meta && meta.numerise);
    const deja = new Set((existantes || []).map(cle));
    const vues = new Set();
    let ecartees = 0;
    const liste = (brut && Array.isArray(brut.exigences)) ? brut.exigences : [];
    const propositions = [];

    liste.forEach((x, rang) => {
      if (!x || typeof x !== "object") { ecartees++; return; }
      const citation = String(x.citation || "").replace(/\s+/g, " ").trim();
      const intitule = String(x.intitule || "").replace(/\s+/g, " ").trim() || citation.slice(0, 110);
      if (!intitule && !citation) { ecartees++; return; }

      const type = TYPES_ADMIS.includes(x.type) ? x.type : "autre";
      const notes = [];
      let valeur = null;
      if (type === "chiffre_affaires") {
        const r = enFcfa(x.montant, x.devise, citation);
        valeur = r.valeur;
        if (r.note) notes.push(r.note);
      } else if (type === "experience" || type === "references") {
        valeur = nombre(x.nombre);
        if (valeur == null && citation) {
          valeur = E().lisNombre(citation);
          if (valeur != null) notes.push("Seuil relu dans la citation : vérifiez-le.");
        }
        if (valeur == null) notes.push("Seuil non lu : précisez-le.");
      }
      const code = x.code ? String(x.code).trim().slice(0, 60) : null;
      const g = GROUPEMENT[x.groupement] || GROUPEMENT.non_precise;
      if (g.note) notes.push(g.note);

      const retrouvee = !numerise && citationRetrouvee(citation, source);
      if (numerise) notes.push("Document numérisé : la citation n'a pas pu être contrôlée par le poste — vérifiez-la dans le DAO avant de cocher.");
      else if (!retrouvee) notes.push(citation ? "Citation introuvable dans le document : vérifiez dans le DAO avant d'ajouter." : "Aucune citation du document : vérifiez dans le DAO avant d'ajouter.");

      const p = {
        rang,
        type,
        intitule: intitule.length > 110 ? intitule.slice(0, 107) + "…" : intitule,
        exigence: citation || intitule,
        valeur,
        code,
        bloquant: x.eliminatoire !== false,
        groupable: g.groupable,
        reference: x.reference ? String(x.reference).slice(0, 80) : null,
        citation_retrouvee: retrouvee,
        notes
      };
      const k = cle(p);
      p.doublon = deja.has(k);
      if (vues.has(k)) { ecartees++; return; }
      vues.add(k);
      if (p.doublon) notes.push("Déjà dans la fiche.");
      // Coché d'office seulement si l'appui sur le document est vérifié et
      // que la fiche ne l'a pas déjà.
      p.coche = retrouvee && !p.doublon;
      propositions.push(p);
    });

    return {
      propositions,
      remarques: brut && typeof brut.remarques === "string" ? brut.remarques.trim() : "",
      ecartees
    };
  }

  /** Une proposition retenue, au format des exigences de la fiche. */
  function versExigence(p, meta) {
    const m = meta || {};
    return {
      id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2),
      type: p.type,
      intitule: p.intitule,
      exigence: p.exigence,
      valeur: p.valeur,
      code: p.code,
      bloquant: p.bloquant,
      groupable: p.groupable,
      statut_manuel: null,
      source: "ia",
      document: m.document || null,
      reference: p.reference || null,
      ajoute_par: m.ajoutePar || null,
      ajoute_le: new Date().toISOString()
    };
  }

  AA.dao = { normalise, versExigence, citationRetrouvee, enFcfa, TAUX_EUR };
})();
