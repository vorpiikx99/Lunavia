/* Jalon : garde l'appli et les morceaux de carte déjà vus, pour qu'elle s'ouvre même sans réseau.
   Version __VERSION__ */
const SHELL = 'jalon-appli-__VERSION__', TILES = 'jalon-tuiles-v1', MISC = 'jalon-fond-v1';
const CORE = ['./', 'vendor/maplibre-gl.js?v=__ML__', 'manifest.webmanifest', 'icons/icon-192.png'];
const MAX_TILES = 600;
const HERE = self.registration.scope; // le dossier de Jalon, par exemple https://exemple.fr/jeu/jalon/
const MARK = 'jalon:carte';           // signature présente dans la page de Jalon (voir build.mjs)

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.indexOf('jalon-appli-') === 0 && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
    .then(voisinage).catch(() => {}));
});
self.addEventListener('message', e => { if (e.data === 'voisinage') e.waitUntil(voisinage().catch(() => {})); });

/* Bon voisinage. Jalon peut loger dans un dossier d'un autre site installé (un jeu, par exemple). À la toute première
   visite, Jalon n'a pas encore son propre aide-mémoire : c'est celui du site voisin qui répond. Il peut alors ranger la
   page de Jalon à la place de la sienne, et garder chez lui des fichiers de Jalon. On remet de l'ordre : nos fichiers
   sortent de ses réserves, et une page à lui qui contient en réalité Jalon est remplacée par la bonne.
   Rien d'autre n'est touché dans les réserves des voisins. */
async function voisinage() {
  for (const name of await caches.keys()) {
    if (name.indexOf('jalon-') === 0) continue;
    const c = await caches.open(name);
    for (const rq of await c.keys()) {
      const url = rq.url.split('#')[0], bare = url.split('?')[0];
      if (url.indexOf(HERE) === 0) { await c.delete(rq); continue; }             // un fichier de Jalon rangé chez le voisin
      const dir = bare.slice(0, bare.lastIndexOf('/') + 1);
      if (HERE.indexOf(dir) !== 0 || !/(\/|\.html?)$/.test(bare)) continue;      // on ne regarde que les pages des dossiers parents
      const hit = await c.match(rq);
      if (!hit || (await hit.text()).indexOf(MARK) < 0) continue;                // c'est bien sa page : on n'y touche pas
      await c.delete(rq);
      try {
        const good = await fetch(bare, { cache: 'no-store' });
        if (good.ok && (await good.clone().text()).indexOf(MARK) < 0) await c.put(rq, good);
      } catch (x) { /* sans réseau : le site voisin reprendra sa page tout seul à sa prochaine ouverture */ }
    }
  }
}

const ok = r => r && r.ok;
// le réseau d'abord (les mises à jour arrivent tout de suite), la copie gardée en secours
async function netFirst(req, name) {
  const c = await caches.open(name);
  try { const r = await fetch(req); if (ok(r)) c.put(req, r.clone()); return r; }
  catch (e) { const hit = await c.match(req, { ignoreSearch: true }); if (hit) return hit; throw e; }
}
// la copie gardée d'abord, le réseau sinon
let puts = 0;
async function cacheFirst(req, name, max) {
  const c = await caches.open(name), hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (ok(r)) {
    c.put(req, r.clone());
    if (max && ++puts % 40 === 0) c.keys().then(ks => { for (let i = 0; i < ks.length - max; i++) c.delete(ks[i]); });
  }
  return r;
}
// la copie gardée tout de suite, rafraîchie en arrière-plan
async function fresh(req, name) {
  const c = await caches.open(name), hit = await c.match(req);
  const net = fetch(req).then(r => { if (ok(r)) c.put(req, r.clone()); return r; });
  if (hit) { net.catch(() => {}); return hit; }
  return net;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let u;
  try { u = new URL(req.url); } catch (x) { return; }
  if (u.origin === self.location.origin) {
    if (u.href.indexOf(HERE) !== 0) return; // les autres dossiers du site ne nous regardent pas
    if (u.pathname.endsWith('/sw.js')) return;
    if (req.mode === 'navigate' || u.pathname.endsWith('/') || u.pathname.endsWith('/index.html')) { e.respondWith(netFirst(req, SHELL)); return; }
    e.respondWith(cacheFirst(req, SHELL));
    return;
  }
  if (u.hostname === 'tiles.openfreemap.org') {
    if (u.pathname.indexOf('/styles/') === 0 || u.pathname === '/planet') e.respondWith(fresh(req, MISC));
    else if (u.pathname.indexOf('/planet/') === 0) e.respondWith(cacheFirst(req, TILES, MAX_TILES));
    else e.respondWith(cacheFirst(req, MISC));
    return;
  }
  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') { e.respondWith(fresh(req, MISC)); return; }
  // recherche, itinéraires, prix, météo : toujours demandés au réseau
});
