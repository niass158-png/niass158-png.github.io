/* ==========================================================================
   A&A Registre des Offres · service worker de la version web
   - garde l'application (pages, scripts, styles, bibliothèques) sur
     l'appareil : ouverture instantanée, même avec un réseau faible ;
   - ne garde JAMAIS les données du registre ni les échanges avec l'IA :
     tout ce qui n'est pas du même site passe directement au réseau ;
   - à chaque publication, la liste ci-dessous change, le navigateur
     télécharge la nouvelle version en arrière-plan et la page propose de
     l'appliquer.
   La liste et la version sont écrites par web/construire-web.js.
   ========================================================================== */
const VERSION = "1.17.0-0f73b9219e";
const FICHIERS = [
 "./",
 "app.js",
 "assets/logo-aa-group-blanc.svg",
 "assets/logo-aa-group.svg",
 "assistant.js",
 "coquille-mobile.js",
 "dao.js",
 "eligibilite.js",
 "ia.js",
 "icones/apple-touch-icon.png",
 "icones/favicon-64.png",
 "icones/icone-192.png",
 "icones/icone-512.png",
 "icones/icone-maskable-512.png",
 "index.html",
 "lecteurs.js",
 "manifest.webmanifest",
 "metier.js",
 "noyau.js",
 "pont-web.js",
 "references.js",
 "styles.css",
 "vendor/@supabase/supabase-js/dist/umd/supabase.js",
 "vendor/fuse.js/dist/fuse.min.js",
 "vendor/xlsx/dist/xlsx.full.min.js",
 "web.css"
];
const CACHE = "aa-registre-" + VERSION;

self.addEventListener("install", (e) => {
  // Une fois tout téléchargé, la nouvelle version prend la main sans attendre
  // que l'application soit fermée : sur iPhone, elle ne l'est presque jamais.
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(FICHIERS.map((f) => new Request(f, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(noms.filter((n) => n.startsWith("aa-registre-") && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (e) => { if (e.data === "activer") self.skipWaiting(); });

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // registre, IA, CDN : réseau direct
  if (url.pathname.endsWith("/sw.js")) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Les pages viennent de l'appareil, comme le reste : page et scripts
    // sont toujours de la même version. Le réseau ne sert qu'en secours.
    // Seule la page de l'application est servie ainsi ; les autres pages du
    // site (installer.html…) et les fichiers téléchargés passent au réseau.
    if (req.mode === "navigate") {
      const racine = new URL("./", self.registration.scope).pathname;
      if (url.pathname === racine || url.pathname === racine + "index.html") {
        const page = (await cache.match("./")) || (await cache.match("index.html"));
        if (page) return page;
      }
      return fetch(req);
    }
    const garde = await cache.match(req, { ignoreSearch: true });
    if (garde) return garde;
    const res = await fetch(req);
    if (res.ok && res.type === "basic") cache.put(req, res.clone());
    return res;
  })());
});
