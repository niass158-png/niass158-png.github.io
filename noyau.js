"use strict";
/**
 * Noyau — les outils que tous les écrans emploient, et qui ne dépendent de rien.
 *
 * Pourquoi un fichier à part : ces fonctions ne connaissent ni le registre, ni
 * la base, ni l'écran affiché. Elles prennent une valeur et en rendent une
 * autre. Les isoler permet de les éprouver seules, et surtout de n'en avoir
 * qu'une définition : trois d'entre elles existaient en double dans app.js,
 * avec des corps différents pour le même résultat — le genre d'écart qui finit
 * par produire deux réponses à la même question.
 *
 * Chargement : fichier classique, pas module ES. L'application est servie
 * depuis le disque (file://), où le navigateur refuse les imports entre
 * fichiers. On expose donc un objet unique, window.AA.noyau, que chaque écran
 * range dans ses propres noms à l'ouverture.
 */
(function () {
  const AA = (window.AA = window.AA || {});

  // ------------------------------------------------------------ le document
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /** Échappe tout ce qui part dans du HTML. Seule porte d'entrée du texte. */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const icon = (name) => `<svg class="ico"><use href="#i-${name}"/></svg>`;

  const initials = (name) => String(name || "").trim().split(/\s+/).filter(Boolean)
    .slice(0, 2).map(p => p[0].toUpperCase()).join("") || "?";

  const plural = (n, one, many) => n + " " + (n > 1 ? many : one);

  // ---------------------------------------------------------------- le texte
  /**
   * Met un texte à plat pour toute comparaison : sans accents, apostrophes
   * unifiées, espaces insécables réduits, minuscules.
   *
   * La même règle sert au collecteur (collector/sources.js) : ce qui est saisi
   * doit trouver ce qui est écrit. Un site institutionnel écrit « manifestation
   * d'intérêt » avec un accent et une apostrophe courbe ; une recherche tapée
   * au clavier n'a souvent ni l'un ni l'autre. Sans mise à plat, elle ne
   * trouve rien, et la source paraît muette alors qu'elle publie.
   */
  const aplati = (texte) => String(texte == null ? "" : texte)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[‘’ʼ´`]/g, "'")
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .toLowerCase().trim();

  // ---------------------------------------------------------------- les dates
  const z2 = (n) => String(n).padStart(2, "0");

  /** La date d'un objet Date, au fuseau local, en AAAA-MM-JJ. */
  const jourIso = (d) => d.getFullYear() + "-" + z2(d.getMonth() + 1) + "-" + z2(d.getDate());

  /** Le jour d'aujourd'hui décalé de n jours, en AAAA-MM-JJ. */
  function jourDecale(n) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n);
    return jourIso(d);
  }

  const anneeDe = (o) => String(o.date_limite || o.created_at || "").slice(0, 4);

  function fmtDate(iso, opts) {
    if (!iso) return "—";
    const d = new Date(String(iso).length === 10 ? iso + "T00:00:00" : iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("fr-FR", opts || { day: "numeric", month: "short", year: "numeric" });
  }

  function fmtTime(iso) {
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const hm = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return sameDay ? "aujourd'hui à " + hm
      : "le " + d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) + " à " + hm;
  }

  // ------------------------------------------------------------- l'échéance
  /**
   * Où en est une offre par rapport à sa date limite. Quatre états seulement,
   * parce qu'au-delà l'œil ne distingue plus rien d'utile.
   */
  function urgency(dateLimite) {
    if (!dateLimite) return { key: "none", label: "Sans échéance", days: Infinity };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(dateLimite + "T00:00:00");
    const days = Math.round((d - today) / 86400000);
    if (days < 0) return { key: "cloture", label: "Clôturée", days };
    if (days === 0) return { key: "critique", label: "Aujourd'hui", days };
    if (days === 1) return { key: "critique", label: "Demain", days };
    if (days <= 3) return { key: "critique", label: "J-" + days, days };
    if (days <= 7) return { key: "proche", label: "J-" + days, days };
    return { key: "ouvert", label: "J-" + days, days };
  }

  function echeanceBucket(o) {
    const u = urgency(o.date_limite);
    if (u.key === "none") return "Sans échéance";
    if (u.key === "cloture") return "Clôturées";
    return u.days <= 7 ? "Sous 7 jours" : "Plus de 7 jours";
  }

  /** La pastille d'échéance, identique partout où elle apparaît. */
  function duePill(o, withDate) {
    const u = urgency(o.date_limite);
    const date = o.date_limite ? fmtDate(o.date_limite, { day: "numeric", month: "short" }) : "";
    const text = withDate && date && u.key !== "none"
      ? (u.key === "cloture" ? "Clôturée · " + date : u.label + " · " + date)
      : u.label;
    return `<span class="due ${u.key}" title="Date limite : ${esc(fmtDate(o.date_limite))}">${icon("clock")}${esc(text)}</span>`;
  }

  /**
   * Comparateur d'échéances, à utiliser partout. Il rend bien 0 pour deux
   * dates égales : un comparateur qui n'y parvient pas donne un ordre
   * contradictoire, et la même liste se classe différemment d'un appel à
   * l'autre. Les offres sans date passent en dernier.
   */
  const compareEcheance = (a, b) =>
    String(a.date_limite || "9999").localeCompare(String(b.date_limite || "9999"));

  AA.noyau = {
    $, $$, esc, icon, initials, plural,
    aplati, sansAccent: aplati,
    z2, jourIso, jourIsoDe: jourIso, jourDecale, anneeDe,
    fmtDate, fmtTime,
    urgency, echeanceBucket, duePill, compareEcheance
  };
})();
