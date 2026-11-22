/* STRAM Suivi — nomenclature des articles et numérotation des bons
   Articles : FAMILLE-NNN (ex. LIA-001 ciment, ELE-004 câble).
   Bons     : TYPE-AAAA-NNNN (BS sortie, BE entrée, BR retour, BC commande). */
'use strict';
const NOM = (() => {
  const FAMILLES = [
    ['LIA', 'Liants et enduits', /liant|ciment|enduit|mortier|colle|platre|plâtre/],
    ['GOE', 'Gros œuvre', /gros|gravier|sable|fer |fer$|acier|agglo|beton|béton|parpaing|coffrage/],
    ['PLB', 'Plomberie et sanitaires', /plomb|sanit|pvc|tuyau|robinet|nourrice|bati|bâti/],
    ['ELE', 'Électricité', /electri|électri|cable|câble|boitier|boîtier|fourreau|disjonct|gaine/],
    ['CFA', 'Courants faibles', /courant faible|courants faibles|rj45|reseau|réseau|camera|caméra|interph/],
    ['FPL', 'Faux plafonds', /faux plafond|ba13|placo|rail|corniere|cornière|bande a joint|bande à joint/],
    ['CLI', 'Climatisation', /clim|frigo/],
    ['MEN', 'Menuiseries (bois, alu, métal)', /menuis|bois|alu|pergola|pergolat|serrur/],
    ['CAR', 'Carrelage et faïence', /carrel|carreau|faience|faïence|plinthe/],
    ['PEI', 'Peinture', /peint|impression|vernis/],
    ['ETA', 'Étanchéité', /etanch|étanch|bitume|membrane/],
    ['MCH', 'Monte-charge et ascenseur', /monte|ascenseur|kone/],
    ['QUI', 'Quincaillerie et consommables', /quincail|vis|cheville|clou|boulon|visse/],
    ['OUT', 'Outillage et matériel', /outil|materiel|matériel|echafaud|échafaud|betonniere|bétonnière/],
    ['EPI', 'Sécurité et EPI', /securite|sécurité|epi|casque|gant|harnais|extinct/],
    ['DIV', 'Divers', /.^/],
  ].map(([code, nom, re]) => ({ code, nom, re }));
  const fam = code => FAMILLES.find(f => f.code === code) || FAMILLES[FAMILLES.length - 1];
  const N = s => U.norm(s || '');

  /** Famille d'un article : déjà fixée, sinon déduite de la catégorie puis de la désignation */
  function familleDe(a) {
    if (a.famille && FAMILLES.some(f => f.code === a.famille)) return a.famille;
    const c = N(a.categorie), d = N(a.designation);
    const byCat = FAMILLES.find(f => c && (N(f.nom).startsWith(c) || f.re.test(c)));
    if (byCat && byCat.code !== 'DIV') return byCat.code;
    const byDes = FAMILLES.find(f => f.re.test(d));
    return byDes ? byDes.code : 'DIV';
  }
  /** Prochain code libre d'une famille : LIA-007 */
  function prochainCode(f, exclude) {
    const re = new RegExp('^' + f + '-(\\d+)$');
    const max = S.list('articles').filter(a => a.id !== exclude).reduce((m, a) => { const x = re.exec(a.code || ''); return x ? Math.max(m, +x[1]) : m; }, 0);
    return `${f}-${String(max + 1).padStart(3, '0')}`;
  }
  /** Prochain numéro de bon : BS-2026-0001 */
  function prochainBon(type, col = 'mouvements', field = 'numBon', date = U.today()) {
    const an = String(date).slice(0, 4), re = new RegExp(`^${type}-${an}-(\\d+)$`);
    const max = S.data[col].reduce((m, r) => { const x = re.exec(r[field] || ''); return x ? Math.max(m, +x[1]) : m; }, 0);
    return `${type}-${an}-${String(max + 1).padStart(4, '0')}`;
  }
  /** Retrouve un article à partir d'un code saisi (« lia1 », « LIA-001 », « LIA 1 ») ou de sa désignation exacte */
  function trouver(saisie) {
    const s = String(saisie || '').trim();
    if (!s) return null;
    const arts = S.list('articles');
    const code = s.split(/\s+—\s+/)[0].toUpperCase().replace(/\s+/g, '');
    const m = /^([A-Z]{3})-?0*(\d+)$/.exec(code);
    if (m) { const c = `${m[1]}-${m[2].padStart(3, '0')}`; const a = arts.find(x => (x.code || '').toUpperCase() === c); if (a) return a; }
    return arts.find(x => (x.code || '').toUpperCase() === code) || arts.find(x => (x.ancienCode || '').toUpperCase() === code) || arts.find(x => N(x.designation) === N(s)) || null;
  }
  /** Passage des anciens codes ART-xxx à la nomenclature par famille (une seule fois, même résultat sur chaque appareil) */
  function migrer() {
    const old = S.data.articles.filter(a => !a._del && /^ART-\d+$/i.test(a.code || '')).sort((x, y) => x.code.localeCompare(y.code));
    if (!old.length) return 0;
    old.forEach(a => {
      const f = familleDe(a);
      a.ancienCode = a.code; a.famille = f; a.code = prochainCode(f, a.id); a.categorie = fam(f).nom;
      S.touch('articles', a);
    });
    S.log(`Nomenclature : ${old.length} article(s) recodé(s) par famille (ex. ${old[0].ancienCode} → ${old[0].code})`);
    S.persist(true);
    return old.length;
  }
  const datalist = () => `<datalist id="dlArt">${S.list('articles').sort(U.by('code')).map(a => `<option value="${U.esc(a.code)}">${U.esc(a.designation)} (${U.esc(a.unite)})</option>`).join('')}</datalist>`;
  const libelle = a => `${a.code} — ${a.designation}`;

  return { FAMILLES, fam, familleDe, prochainCode, prochainBon, trouver, migrer, datalist, libelle };
})();
