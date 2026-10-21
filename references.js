"use strict";
/**
 * Références de missions d'A&A Strategy et pertinence d'une offre.
 *
 * Source : « AAStrategy — Références v3 » (10/04/2026), 65 missions menées à
 * terme entre 2019 et 2026. Ce fichier en est la transcription : client,
 * intitulé, année, pays. Rien n'y est inventé ; une mission ajoutée au
 * document de références s'ajoute ici, à la main, dans la liste MISSIONS.
 *
 * À quoi il sert :
 *   • mesurer la PERTINENCE d'un avis pour le groupe — dans quels domaines
 *     d'intervention il tombe, sur quels secteurs, pour quel type de client,
 *     où — et le classer Forte / Moyenne / Faible ;
 *   • retrouver les MISSIONS COMPARABLES déjà réalisées, celles qu'on citera
 *     dans l'offre technique ;
 *   • écarter à la collecte un avis qui ne touche AUCUN domaine du groupe
 *     (règle appliquée par collector/mapping.js).
 *
 * Fichier unique pour l'interface (window.AA.references) et pour la veille
 * (require), pour que l'écran et la collecte jugent exactement de la même
 * façon.
 */
(function (racine) {
  // --------------------------------------------------------------- outils
  const aplati = (t) => String(t == null ? "" : t)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[‘’ʼ´`]/g, "'")
    .replace(/[‐-―]/g, "-")
    .replace(/œ/gi, "oe").replace(/æ/gi, "ae")
    .replace(/\s+/g, " ").toLowerCase().trim();

  /** Le mot ou l'expression figure-t-il dans le texte, à frontière de mot ? */
  const RE_CACHE = new Map();
  function trouve(texte, mot) {
    let re = RE_CACHE.get(mot);
    if (!re) {
      const m = aplati(mot).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      re = new RegExp("(?:^|[^a-z0-9])" + m + "(?:$|[^a-z0-9])");
      RE_CACHE.set(mot, re);
    }
    return re.test(texte);
  }

  // ------------------------------------------------- domaines d'intervention
  // Chaque domaine est tiré des missions réalisées (voir `exemples`), sauf les
  // trois derniers, qui portent les métiers des autres filiales du groupe.
  const DOMAINES = [
    { cle: "strategie", libelle: "Stratégie et planification", poids: 30, exemples: "Plans stratégiques SAR, INPG, 3FPT, Fondation Senelec, DAGE/MEN, stratégie Air Sénégal",
      mots: ["plan strategique", "strategie", "strategique", "feuille de route", "plan de developpement", "plan directeur", "schema directeur", "vision", "orientations strategiques", "positionnement strategique", "priorisation", "selection et priorisation", "strategic plan", "strategy", "roadmap", "master plan"] },
    { cle: "politique", libelle: "Politiques publiques et stratégies sectorielles", poids: 30, exemples: "Politique industrielle 2050 (MINCOM), SNDAq aquaculture (ANA), stratégie phosphate–engrais, cadre réglementaire VE (MITTA)",
      mots: ["politique nationale", "politique industrielle", "politique sectorielle", "politique publique", "strategie nationale", "strategie sectorielle", "document de politique", "lettre de politique", "cadre reglementaire", "reglementation", "policy", "national strategy", "sector strategy", "etats generaux"] },
    { cle: "faisabilite", libelle: "Études de faisabilité, de marché et plans d'affaires", poids: 30, exemples: "Faisabilité Parc des Technologies Numériques, datacenter Tier IV, filière avicole (SEAGRI), plans d'affaires CASL, Manobi, CCVA",
      mots: ["etude de faisabilite", "faisabilite", "prefaisabilite", "etude de marche", "etudes de marche", "plan d'affaires", "business plan", "modele economique", "modelisation financiere", "analyse de marche", "etude d'opportunite", "feasibility", "market study", "market assessment", "market analysis", "business model"] },
    { cle: "finance", libelle: "Structuration financière, fonds et mobilisation de ressources", poids: 30, exemples: "Fonds WE! Fund, IMIF et fonds de dette (UNCDF), fonds Covid CHT/CTA, produits d'épargne diaspora (CDC), mobilisation de ressources (IFAD, Fondation Senelec)",
      mots: ["structuration financiere", "montage financier", "fonds d'investissement", "fonds de garantie", "fonds de dette", "levee de fonds", "mobilisation de ressources", "mobilisation des ressources", "mecanisme de financement", "mecanismes de financement", "mecanisme financier", "instruments financiers", "financement innovant", "finance innovante", "produits d'epargne", "epargne", "due diligence", "due-diligence", "restructuration de dette", "investissement", "investissements", "levee de financements", "valorisation", "evaluation financiere", "valuation", "innovative finance", "blended finance", "investment", "fund", "financing mechanism", "resource mobilization"] },
    { cle: "ppp", libelle: "PPP, concessions et négociation de contrats", poids: 28, exemples: "Concession du Port de Ndayane (PAD), contrat d'exploitation SETER/SNCF (SENTER)",
      mots: ["ppp", "partenariat public-prive", "partenariat public prive", "concession", "contrat d'exploitation", "affermage", "negociation", "conseiller transactionnel", "transaction advisory", "public-private partnership"] },
    { cle: "pilotage", libelle: "PMO, Delivery Unit et assistance technique", poids: 28, exemples: "PMO SAR et GCO, Delivery Unit du MINCOM, dispositif de pilotage de l'Agenda Sénégal 2050",
      mots: ["pmo", "project management office", "delivery unit", "unite de pilotage", "pilotage", "assistance technique", "appui technique", "assistance a maitrise d'ouvrage", "maitrise d'ouvrage deleguee", "gestion de projet", "suivi de la mise en oeuvre", "pipeline de projets", "observatoire", "dispositif de suivi", "tableau de bord", "technical assistance", "project management"] },
    { cle: "evaluation", libelle: "Évaluation de programmes et revue de performance", poids: 28, exemples: "Évaluation du nano-crédit et des conventions PAVIE (DER/FJ), revue du dispositif PME de la BCEAO (GIZ), revue de performance DER/FJ",
      mots: ["evaluation", "evaluation a mi-parcours", "evaluation finale", "evaluation d'impact", "evaluation strategique", "evaluation institutionnelle", "revue de performance", "revue des performances", "revue a mi-parcours", "suivi-evaluation", "suivi et evaluation", "suivi evaluation", "situation de reference", "etude de reference", "capitalisation", "monitoring and evaluation", "impact assessment", "baseline", "mid-term review", "final evaluation"] },
    { cle: "institutionnel", libelle: "Réforme institutionnelle, gouvernance et organisation", poids: 26, exemples: "Mutation institutionnelle INPG et APROSI, modèle de gestion des infrastructures de stockage (DER/FJ)",
      mots: ["mutation institutionnelle", "reforme institutionnelle", "reforme", "gouvernance", "diagnostic organisationnel", "diagnostic institutionnel", "audit organisationnel", "audit institutionnel", "organisationnel", "institutionnel", "statut juridique", "manuel de procedures", "modele de gestion", "restructuration", "governance", "institutional"] },
    { cle: "entreprise", libelle: "Entrepreneuriat, PME et inclusion financière", poids: 26, exemples: "Référentiel d'accompagnement non financier (DER/FJ), appui au secteur privé dans la Vallée du Fleuve (Banque mondiale), financement des PME (BCEAO)",
      mots: ["entrepreneuriat", "entrepreneurs", "entrepreneuriale", "pme", "pmi", "tpe", "secteur prive", "developpement des affaires", "accompagnement non financier", "accompagnement des entreprises", "incubation", "incubateur", "inclusion financiere", "microfinance", "nano-credit", "credit", "femmes et jeunes", "jeunes", "emploi des jeunes", "employabilite", "creation d'emplois", "msme", "sme", "smes", "entrepreneurship", "private sector", "business development"] },
    { cle: "diagnostic", libelle: "Diagnostics sectoriels et chaînes de valeur", poids: 24, exemples: "Diagnostic du secteur industriel (États généraux), chaîne de valeur phosphate–engrais, filière avicole",
      mots: ["diagnostic", "chaine de valeur", "chaines de valeur", "filiere", "filieres", "etude sectorielle", "cartographie", "etude diagnostique", "value chain", "sector diagnostic", "sector study"] },
    // Métiers des autres filiales — hors du document de références d'A&A Strategy.
    { cle: "formation", libelle: "Formation et renforcement de capacités (A&A Knowledge Institute)", poids: 18, filiale: true, exemples: "Métier d'A&A Knowledge Institute",
      mots: ["formation", "renforcement de capacites", "renforcement des capacites", "capacity building", "training", "mentorat", "coaching", "capacitacao", "formacao", "treinamento", "capacitacion"] },
    { cle: "infrastructure", libelle: "Infrastructures : études, maîtrise d'œuvre, travaux (A&A Project Delivery)", poids: 30, filiale: true, exemples: "Métier d'A&A Project Delivery",
      mots: ["maitrise d'oeuvre", "supervision des travaux", "controle des travaux", "controle et surveillance", "etudes techniques", "avant-projet", "aps", "apd", "dossier d'appel d'offres", "etude d'impact environnemental", "eies", "travaux", "construction", "rehabilitation", "amenagement", "genie civil", "detailed engineering", "engineering design", "works", "supervision", "supervisao", "obras", "construcao", "reabilitacao"] },
    { cle: "conseil", libelle: "Conseil et études générales", poids: 14, filiale: true, exemples: "Métier commun du groupe",
      mots: ["etude", "etudes", "conseil", "consultance", "accompagnement", "appui", "elaboration", "enquete", "enquetes", "sondage", "consultancy", "consulting", "advisory", "study", "studies", "assessment", "survey", "surveys", "support to",
             // Avis lusophones et hispanophones (Guinée-Bissau, Cabo Verde, bailleurs) :
             "consultoria", "estudo", "estudos", "avaliacao", "assistencia tecnica", "elaboracao", "estudio", "evaluacion", "asistencia tecnica"] }
  ];

  // ------------------------------------------------------------- secteurs
  const SECTEURS = [
    { cle: "energie", libelle: "Énergie, pétrole, gaz et mines", mots: ["energie", "energetique", "petrole", "petrolier", "gaz", "gazier", "hydrocarbures", "raffinage", "electricite", "electrique", "senelec", "mines", "minier", "miniere", "mine d'or", "phosphate", "engrais", "gold", "renouvelable", "solaire", "energy", "oil", "mining", "power"] },
    { cle: "transport", libelle: "Transport, aérien, portuaire et logistique", mots: ["transport", "transports", "aerien", "aeroport", "aviation", "port", "portuaire", "ferroviaire", "train", "logistique", "logistics", "mobilite", "vehicules electriques", "airport", "railway"] },
    { cle: "agriculture", libelle: "Agriculture, agro-industrie, élevage et pêche", mots: ["agriculture", "agricole", "agro-industriel", "agro-industrie", "agroalimentaire", "agribusiness", "elevage", "avicole", "aviculture", "aquaculture", "peche", "halieutique", "mecanisation", "stockage", "rural", "semences", "irrigation", "alimentation animale", "food", "agricultural", "livestock", "fisheries"] },
    { cle: "industrie", libelle: "Industrie, commerce et zones économiques", mots: ["industrie", "industriel", "industrielle", "industrialisation", "commerce", "zone economique", "zones economiques", "sites industriels", "parc industriel", "manufacturier", "pharmaceutique", "emballage", "industry", "trade", "manufacturing"] },
    { cle: "finance", libelle: "Finance, banque et microfinance", mots: ["banque", "bancaire", "financier", "financiere", "microfinance", "epargne", "diaspora", "assurance", "fonds", "bceao", "fonsis", "caisse des depots", "credit", "finance", "banking"] },
    { cle: "numerique", libelle: "Numérique et technologies", mots: ["numerique", "digital", "digitale", "datacenter", "data center", "technologies", "technologique", "tic", "telecommunications", "parc technologique", "innovation", "digitalisation", "ict"] },
    { cle: "sante", libelle: "Santé et pharmacie", mots: ["sante", "clinique", "hopital", "hospitalier", "pharmaceutique", "medicaments", "sanitaire", "health"] },
    { cle: "education", libelle: "Éducation et formation professionnelle", mots: ["education", "educatif", "enseignement", "formation professionnelle", "formation technique", "ecole", "universite", "3fpt", "education nationale"] },
    { cle: "urbain", libelle: "Habitat, urbanisme et collectivités", mots: ["logement", "logements", "habitat", "urbanisme", "urbain", "municipal", "municipales", "collectivites", "communes", "ville", "villes", "amenagement du territoire", "territorial", "decentralisation"] },
    { cle: "tourisme", libelle: "Tourisme et hôtellerie", mots: ["tourisme", "touristique", "hotelier", "hotellerie", "sapco"] },
    { cle: "emploi", libelle: "Emploi, jeunesse et inclusion", mots: ["emploi", "emplois", "jeunes", "jeunesse", "femmes", "genre", "inclusion", "employment", "youth", "women"] },
    { cle: "public", libelle: "Pilotage de l'action publique", mots: ["investissements publics", "investissement public", "finances publiques", "politiques publiques", "action publique", "agenda 2050", "public investment", "public financial management"] }
  ];

  // ----------------------------------------------------- clients de référence
  const CLIENTS = [
    ["DER/FJ", ["der/fj", "derfj", "der fj", "entrepreneuriat rapide"]],
    ["MINCOM", ["mincom", "ministere de l'industrie et du commerce", "ministere du commerce", "ministere de l'industrie"]],
    ["SAR", ["societe africaine de raffinage", "sar"]],
    ["INPG", ["inpg", "institut national du petrole et du gaz"]],
    ["SENELEC", ["senelec"]],
    ["3FPT", ["3fpt", "fonds de financement de la formation professionnelle"]],
    ["APROSI", ["aprosi"]],
    ["Air Sénégal", ["air senegal"]],
    ["Port Autonome de Dakar", ["port autonome de dakar"]],
    ["SENTER", ["senter", "seter"]],
    ["CDC", ["caisse des depots et consignations", "caisse des depots"]],
    ["ANA", ["agence nationale de l'aquaculture"]],
    ["MEN", ["ministere de l'education nationale"]],
    ["MITTA", ["mitta", "ministere des infrastructures, des transports terrestres"]],
    ["LNR-BTP", ["lnr-btp", "laboratoire national de reference"]],
    ["Parc des Technologies Numériques", ["parc des technologies numeriques", "ptn"]],
    ["UNCDF", ["uncdf", "fenu", "fonds d'equipement des nations unies"]],
    ["PAM", ["programme alimentaire mondial", "world food programme", "wfp"]],
    ["FIDA", ["fida", "ifad"]],
    ["Banque mondiale", ["banque mondiale", "world bank", "groupe de la banque mondiale"]],
    ["GIZ", ["giz"]],
    ["UK Aid / Manufacturing Africa", ["manufacturing africa", "uk aid", "fcdo"]],
    ["BCEAO", ["bceao"]],
    ["FONSIS", ["fonsis"]],
    ["SAPCO", ["sapco"]],
    ["Ministère du Tourisme", ["ministere du tourisme"]],
    ["Ministère de l'Urbanisme", ["ministere de l'urbanisme"]],
    ["Ministère de l'Économie", ["ministere de l'economie"]],
    ["Agenda Sénégal 2050", ["agenda senegal 2050", "senegal 2050", "vision senegal 2050"]]
  ];

  // ---------------------------------------------------------- géographie
  const GEO = [
    { niveau: "senegal", points: 15, libelle: "Sénégal", mots: ["senegal", "dakar", "thies", "saint-louis", "kaolack", "ziguinchor", "louga", "diourbel", "tambacounda", "kolda", "matam", "fatick", "kaffrine", "kedougou", "sedhiou", "diamniadio", "touba", "mbour"] },
    { niveau: "sous-region", points: 10, libelle: "Afrique de l'Ouest (UEMOA, CEDEAO)", mots: ["uemoa", "cedeao", "ecowas", "waemu", "afrique de l'ouest", "west africa", "mali", "mauritanie", "mauritania", "cote d'ivoire", "ivory coast", "burkina", "niger", "guinee", "guinea", "gambie", "gambia", "togo", "benin", "cabo verde", "cap-vert", "guinee-bissau", "bissau", "omvs", "multinational", "bceao", "boad", "bidc", "ebid"] },
    { niveau: "afrique", points: 4, libelle: "Autre pays africain", mots: ["afrique", "africa", "cameroun", "gabon", "congo", "rdc", "tchad", "rca", "maroc", "tunisie", "kenya", "rwanda", "ethiopie", "ethiopia", "nigeria", "ghana", "burundi", "madagascar", "south sudan", "soudan", "ouganda", "uganda", "tanzanie", "tanzania", "mozambique", "zambie", "zambia", "somalia", "somalie", "eritrea", "liberia", "sierra leone"] }
  ];

  // ------------------------------------------------- missions de référence
  // [année, client, intitulé, pays] — transcription du document de références.
  const MISSIONS = [
    [2019, "Nations Unies – Programme alimentaire mondial (PAM)", "Conseil stratégique et financier pour la structuration de programmes pour la création d'un million d'emplois en Afrique et l'accélération de la participation du secteur rural productif africain", "Sénégal"],
    [2019, "État du Sénégal – Port Autonome de Dakar", "Négociations du contrat de concession du Port de Ndayane", "Sénégal"],
    [2020, "État du Sénégal – Air Sénégal", "Stratégie, business plan Air Sénégal 2020-2024 et suivi opérationnel", "Sénégal"],
    [2020, "Secteur privé – CASL", "Étude de faisabilité d'un programme d'implémentation et de développement agro-industriel", "Sénégal"],
    [2020, "État du Sénégal – Ministère de l'Urbanisme, du Logement et de l'Hygiène publique", "Feuille de route de déploiement du projet « 100 000 logements »", "Sénégal"],
    [2020, "État du Sénégal – Ministère du Tourisme et des Transports aériens", "Structuration et déploiement des fonds Covid-19 du Crédit Hôtelier et Touristique (CHT)", "Sénégal"],
    [2020, "Secteur privé – Ellipse Projects", "Conseil stratégique et financier pour la structuration de projets avec l'État et le secteur privé (santé, infrastructures publiques, technologies)", "Sénégal"],
    [2020, "Nations Unies – UNCDF", "Structuration et déploiement du WE! Fund, fonds d'investissement en capital avec le FONSIS", "Sénégal"],
    [2020, "Nations Unies – UNCDF", "Structuration et déploiement d'un fonds de dette avec la BDM", "Mali"],
    [2020, "Nations Unies – UNCDF", "Déploiement du fonds IMIF (300 M€) destiné au financement d'infrastructures municipales", "Sénégal"],
    [2020, "État du Sénégal – Air Sénégal", "Stratégie, business plan Air Sénégal 2021-2025 et suivi opérationnel", "Sénégal"],
    [2021, "État du Sénégal – Société Africaine de Raffinage (SAR)", "Plan stratégique de développement « sar2025 » : diagnostic stratégique, axes, feuille de route et dispositif de pilotage", "Sénégal"],
    [2021, "État du Sénégal – Société Africaine de Raffinage (SAR)", "Assistance PMO – implémentation du plan stratégique « sar2025 »", "Sénégal"],
    [2021, "Secteur privé – WATIC", "Plan d'affaires pour la cession d'actions dans une mine d'or", "Sénégal"],
    [2021, "Secteur privé – IMPACK (Groupe GFM)", "Plan d'affaires et restructuration de dette", "Sénégal"],
    [2021, "État du Sénégal – Air Sénégal", "Stratégie, business plan Air Sénégal 2021-2026 et suivi opérationnel", "Sénégal"],
    [2021, "Secteur privé – La Colombe Groupe / CCDOC", "Études de faisabilité et plan d'affaires d'un projet de datacenter Tier IV", "Sénégal"],
    [2021, "Secteur privé – ONIX DC / La Colombe Groupe", "Études de marché des datacenters (Sénégal et UEMOA)", "Sénégal"],
    [2021, "État du Sénégal – Fonds de Financement de la Formation Professionnelle et Technique (3FPT)", "Plan stratégique de développement : diagnostic, analyse de l'offre et de la demande de formation professionnelle, plan d'action", "Sénégal"],
    [2021, "État du Sénégal – SENTER", "Négociation du contrat d'exploitation SETER/SNCF", "Sénégal"],
    [2021, "Secteur privé – CASL", "Revue de business plan et analyse d'opportunités d'investissement", "Sénégal"],
    [2021, "État du Sénégal – Ministère du Tourisme et des Transports aériens", "Mise en place et déploiement des fonds Covid-19 du Crédit du Transport Aérien (CTA)", "Sénégal"],
    [2021, "Secteur privé – Senegal Supply Base (SSB)", "Business plan pour l'exploitation de la base logistique portuaire", "Sénégal"],
    [2022, "Secteur privé – Grande Côte Opérations (GCO)", "PMO – organisation et suivi de projet", "Sénégal"],
    [2022, "Secteur privé – Holding AON", "Mémorandum d'investissement et levée de fonds pour la construction d'une polyclinique à Nouakchott", "Mauritanie"],
    [2022, "Secteur privé – Parenterus", "Plan d'affaires et restructuration (industrie pharmaceutique)", "Sénégal"],
    [2022, "État du Sénégal – DER/FJ", "Revue des performances et feuille de route stratégique", "Sénégal"],
    [2022, "BDO / Manufacturing Africa (UK Aid)", "Due diligence stratégique préalable à un investissement de l'État du Sénégal (marché de l'emballage)", "Sénégal"],
    [2022, "Secteur privé – CASL", "Due diligence stratégique préalable à un investissement de l'État du Sénégal", "Sénégal"],
    [2022, "Secteur privé – Duopharm", "Stratégie de commercialisation et identification de fournisseurs de molécules et d'usines clé en main (médicaments)", "Sénégal"],
    [2022, "État du Sénégal – Fondation SENELEC", "Plan stratégique de développement de la Fondation Senelec", "Sénégal"],
    [2022, "Nations Unies – FIDA (IFAD)", "Appui au Ministère de l'Économie dans la structuration de la participation de l'État au programme AATI et mobilisation de 10 M$", "Sénégal"],
    [2023, "État du Sénégal – DER/FJ", "Modèle de gestion et gouvernance des infrastructures de stockage agricole", "Sénégal"],
    [2023, "Secteur privé – La Colombe Groupe", "Plan d'affaires d'un projet de transport de fonds", "Côte d'Ivoire"],
    [2023, "Secteur privé – CCVA", "Plan d'affaires et levée de fonds pour la construction d'une clinique cardiovasculaire à Abidjan", "Côte d'Ivoire"],
    [2023, "Secteur privé – Manobi Africa", "Plan d'affaires et modélisation financière d'un projet de services de mécanisation agricole", "Sénégal"],
    [2023, "État du Sénégal – LNR-BTP", "Estimation des ressources financières et processus de recouvrement", "Sénégal"],
    [2023, "Secteur privé – Grande Côte Opérations (GCO)", "Project Management Office – construction d'une oasis touristique et transfert à la SAPCO", "Sénégal"],
    [2023, "GIZ", "Revue de performance du dispositif de soutien au financement des PME/PMI de la BCEAO", "Sénégal"],
    [2023, "Grande Côte Opérations (groupe ERAMET)", "BUILD 2024-2027 – programme de développement territorial de Louga", "Sénégal"],
    [2023, "État du Sénégal – Institut national du pétrole et du gaz (INPG)", "Plan stratégique de développement 2024-2028", "Sénégal"],
    [2023, "Secteur privé – Technip Energies Sénégal", "Stratégie de développement régional et modélisation financière", "Sénégal"],
    [2023, "État du Sénégal – DER/FJ", "Évaluation stratégique du nano-crédit 2020-2023 (critères OCDE, enquêtes auprès de 1 060 bénéficiaires)", "Sénégal"],
    [2023, "Manufacturing Africa – NeoFarm", "Assistance à une levée de fonds en subventions pour un projet agro-industriel (mouche soldat noire)", "Sénégal"],
    [2023, "État du Sénégal – Agence Nationale de l'Aquaculture (ANA)", "Stratégie nationale de développement durable de l'aquaculture (SNDAq 2023-2032)", "Sénégal"],
    [2023, "État du Sénégal – Fondation SENELEC", "Appui à la mobilisation de ressources pour le financement des projets", "Sénégal"],
    [2024, "État du Sénégal – INPG", "Accompagnement dans la mutation institutionnelle (EPA vers EPIC)", "Sénégal"],
    [2024, "État du Sénégal – Parc des Technologies Numériques", "Étude de faisabilité de la phase 2 du Parc des Technologies Numériques", "Sénégal"],
    [2024, "État du Sénégal – MITTA", "Mise en place d'un cadre réglementaire sur les véhicules électriques", "Sénégal"],
    [2024, "Manufacturing Africa – NeoFarm", "Étude de marché et positionnement des prix en Europe", "Sénégal"],
    [2024, "Caisse des Dépôts et Consignations du Sénégal", "Étude pour structurer des produits d'épargne à destination de la diaspora sénégalaise", "Sénégal"],
    [2024, "État du Sénégal – Ministère de l'Industrie et du Commerce (MINCOM)", "Diagnostic du secteur industriel – États généraux de l'industrie, du commerce et des PME/PMI", "Sénégal"],
    [2024, "État du Sénégal – DER/FJ", "Évaluation des conventions financières du PAVIE (critères OCDE, portefeuille, impact)", "Sénégal"],
    [2025, "État du Sénégal – MINCOM", "Appui à l'élaboration de la politique industrielle Sénégal 2050 et de la stratégie d'industrialisation 2025-2029", "Sénégal"],
    [2025, "État du Sénégal – Ministère de l'Éducation nationale (MEN)", "Plan stratégique de développement de la DAGE du MEN", "Sénégal"],
    [2025, "État du Sénégal – APROSI", "Mutation institutionnelle de l'Agence d'Aménagement et de Promotion des Sites Industriels", "Sénégal"],
    [2025, "Groupe de la Banque mondiale", "Étude sur les dispositifs d'appui au secteur privé dans la Vallée du Fleuve Sénégal", "Sénégal"],
    [2025, "État du Sénégal – DER/FJ", "Étude sur les mécanismes de financement – assistance technique préparatoire au PAVIE II", "Sénégal"],
    [2025, "État du Sénégal – Ministère chargé du suivi de l'Agenda Sénégal 2050", "Mise en place du dispositif de suivi, pilotage et évaluation de l'Agenda Sénégal 2050", "Sénégal"],
    [2025, "SEAP – SEAGRI", "Étude de marché et structuration de la filière avicole et de l'alimentation animale", "Sénégal"],
    [2025, "État du Sénégal – DER/FJ", "Référentiel d'accompagnement et structuration d'un parcours d'accompagnement non financier des entrepreneurs", "Sénégal"],
    [2025, "État du Sénégal – MINCOM", "Structuration du pipeline de projets et outils de gestion des investissements publics (Delivery Unit)", "Sénégal"],
    [2025, "État du Sénégal – MINCOM", "Assistance technique à la Delivery Unit : structuration, pilotage de projets prioritaires et conseil en investissement", "Sénégal"],
    [2026, "Secteur privé – Technip Energies Sénégal", "Analyse stratégique du marché énergétique et positionnement au Sénégal et en Afrique de l'Ouest", "Sénégal"],
    [2026, "Gouvernement du Sénégal / UK Aid – Manufacturing Africa", "Stratégie du secteur phosphate – diagnostic de la chaîne de valeur et orientations stratégiques du secteur engrais", "Sénégal"]
  ].map(([annee, client, intitule, pays], i) => ({ id: i + 1, annee, client, intitule, pays }));

  // ------------------------------------------------------------ analyse
  function domainesDe(t) {
    return DOMAINES.filter(d => d.mots.some(m => trouve(t, m))).map(d => d.cle);
  }
  function secteursDe(t) {
    return SECTEURS.filter(s => s.mots.some(m => trouve(t, m))).map(s => s.cle);
  }
  function clientsDe(t) {
    return CLIENTS.filter(([, mots]) => mots.some(m => trouve(t, m))).map(([nom]) => nom);
  }

  // Chaque mission est analysée une fois, avec les mêmes tables que les avis :
  // la comparaison se fait donc terme à terme.
  MISSIONS.forEach(m => {
    const t = aplati(m.client + " " + m.intitule);
    m.domaines = domainesDe(t).filter(d => d !== "conseil");
    m.secteurs = secteursDe(t);
    m.clients = clientsDe(t);
  });

  const DOM = Object.fromEntries(DOMAINES.map(d => [d.cle, d]));
  const SECT = Object.fromEntries(SECTEURS.map(s => [s.cle, s]));

  /**
   * Pertinence d'un avis pour le groupe.
   *
   * @param {object} o  { titre, description, emetteur, region, zone }
   * @returns {{ score:number, niveau:"forte"|"moyenne"|"faible"|"hors",
   *             domaines:object[], secteurs:object[], clients:string[],
   *             geo:object|null, references:object[], raisons:string[] }}
   *
   * Barème sur 100 :
   *   domaine d'intervention le plus proche (jusqu'à 30) + un second domaine (10)
   *   + secteur déjà pratiqué (15) + client de référence (15)
   *   + géographie (Sénégal 15, sous-région 10, Afrique 4)
   *   + mission comparable déjà réalisée (jusqu'à 15).
 *   Forte à partir de 55, moyenne à partir de 35.
   */
  function pertinence(o) {
    const titre = aplati(o && o.titre);
    const tout = aplati([o && o.titre, o && o.description, o && o.emetteur, o && o.region, o && o.zone].join(" "));
    // Les domaines se lisent dans l'intitulé d'abord : c'est l'objet du marché.
    // La description ne les complète que si l'intitulé n'en dit rien.
    let doms = domainesDe(titre);
    if (!doms.filter(d => d !== "conseil").length) doms = Array.from(new Set(doms.concat(domainesDe(tout))));
    const forts = doms.filter(d => !DOM[d].filiale).sort((x, y) => DOM[y].poids - DOM[x].poids);
    const autres = doms.filter(d => DOM[d].filiale).sort((x, y) => DOM[y].poids - DOM[x].poids);
    const ordre = forts.concat(autres);
    const secteurs = secteursDe(tout);
    const clients = clientsDe(tout);
    const geo = GEO.find(g => g.mots.some(m => trouve(tout, m))) || null;

    let score = 0;
    const raisons = [];
    if (ordre[0]) { score += DOM[ordre[0]].poids; raisons.push(DOM[ordre[0]].libelle); }
    if (ordre[1] && ordre[1] !== "conseil") score += 10;
    if (secteurs.length) { score += 15; }
    if (clients.length) { score += 15; raisons.push("Client de référence : " + clients.join(", ")); }
    if (geo) score += geo.points;

    // Missions comparables : domaines et secteurs partagés, client commun.
    const refs = MISSIONS.map(m => {
      const dCommuns = m.domaines.filter(d => forts.includes(d));
      const sCommuns = m.secteurs.filter(s => secteurs.includes(s));
      const cCommuns = m.clients.filter(c => clients.includes(c));
      const proximite = dCommuns.length * 3 + sCommuns.length * 2 + cCommuns.length * 4 + (m.annee >= 2023 ? 0.5 : 0);
      return { mission: m, proximite, dCommuns, sCommuns, cCommuns };
    }).filter(r => r.proximite >= 3 && (r.dCommuns.length || r.cCommuns.length))
      .sort((x, y) => y.proximite - x.proximite || y.mission.annee - x.mission.annee);
    const meilleure = refs[0];
    if (meilleure) score += Math.min(15, Math.round(meilleure.proximite * 3));

    score = Math.min(100, score);
    const aucunDomaine = !ordre.length;
    const niveau = aucunDomaine ? "hors" : score >= 55 ? "forte" : score >= 35 ? "moyenne" : "faible";
    return {
      score, niveau,
      domaines: ordre.filter(d => d !== "conseil" || ordre.length === 1).map(d => ({ cle: d, libelle: DOM[d].libelle, filiale: !!DOM[d].filiale })),
      secteurs: secteurs.map(s => ({ cle: s, libelle: SECT[s].libelle })),
      clients,
      geo: geo ? { niveau: geo.niveau, libelle: geo.libelle } : null,
      references: refs.slice(0, 3).map(r => ({
        id: r.mission.id, annee: r.mission.annee, client: r.mission.client, intitule: r.mission.intitule, pays: r.mission.pays,
        pourquoi: [].concat(
          r.cCommuns.length ? ["même client"] : [],
          r.dCommuns.map(d => DOM[d].libelle.split(/[,(]/)[0].trim().toLowerCase()),
          r.sCommuns.map(s => SECT[s].libelle.split(/[,(]/)[0].trim().toLowerCase())
        ).slice(0, 3)
      })),
      raisons
    };
  }

  const NIVEAUX = {
    forte: { libelle: "Pertinence forte", court: "Forte" },
    moyenne: { libelle: "Pertinence moyenne", court: "Moyenne" },
    faible: { libelle: "Pertinence faible", court: "Faible" },
    hors: { libelle: "Hors domaines du groupe", court: "Hors domaines" }
  };

  const api = { MISSIONS, DOMAINES, SECTEURS, CLIENTS, NIVEAUX, pertinence, aplati, domainesDe };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (racine && racine.window) { racine.window.AA = racine.window.AA || {}; racine.window.AA.references = api; }
  else if (typeof window !== "undefined") { window.AA = window.AA || {}; window.AA.references = api; }
})(typeof globalThis !== "undefined" ? globalThis : this);
