// Écran d'ouverture : recherche de mise à jour à chaque lancement (site servi sur le port 8090, banc sur 8003).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
const SITE = 'http://localhost:8090/', BED = 'http://127.0.0.1:8003/';
const HOSTS = ['tiles.openfreemap.org', 'photon.komoot.io', 'overpass-api.de', 'data.economie.gouv.fr', 'data.geopf.fr', 'valhalla1.openstreetmap.de', 'routing.openstreetmap.de', 'api.open-meteo.com'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, locale: 'fr-FR', serviceWorkers: 'allow', deviceScaleFactor: 2 });
let offline = false, fake = null, vreq = 0, navs = 0;
await ctx.route('**/*', async route => {
  const req = route.request(), x = new URL(req.url());
  try {
    if (offline) return route.abort('internetdisconnected');
    if (x.hostname === 'localhost') {
      if (x.pathname === '/version.json') { vreq++; if (fake) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ build: fake }) }); }
      if (req.isNavigationRequest()) navs++;
      return route.continue();
    }
    if (HOSTS.includes(x.host)) { const r = await fetch(BED + x.host + x.pathname + x.search, { method: req.method(), body: req.postData() || undefined }); return route.fulfill({ status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/octet-stream', 'access-control-allow-origin': '*' }, body: Buffer.from(await r.arrayBuffer()) }); }
    if (x.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', headers: { 'access-control-allow-origin': '*' }, body: '/* polices */' });
    return route.abort('blockedbyclient');
  } catch (e) { try { await route.abort(); } catch (z) { /* déjà traité */ } }
});
const page = await ctx.newPage();
const res = []; const check = (l, ok, d) => { res.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + l + (d ? '  ' + d : '')); };
const splash = () => page.evaluate(() => { const s = document.querySelector('#splash'); return { vu: !!s && !s.hidden && !s.classList.contains('out'), msg: document.querySelector('#sp-msg').textContent }; });
const settled = async () => { await page.waitForFunction(() => window.J && J.app && J.app.S.mode !== 'boot' && document.querySelector('#splash').hidden, null, { timeout: 30000 }); return page.evaluate(() => J.app.S.mode); };

await page.goto(SITE, { waitUntil: 'domcontentloaded' }); await sleep(250);
const s1 = await splash(); await page.screenshot({ path: 'test/out/maj-1-ouverture.png' });
const m1 = await settled();
check('ouverture : écran de chargement, puis la carte', s1.vu && m1 === 'live', JSON.stringify(s1));
check('la version a été demandée au réseau', vreq >= 1, 'demandes=' + vreq);
check('après le chargement, les boutons répondent', await page.evaluate(() => { const e = document.querySelector('#sb-set'), r = e.getBoundingClientRect(), x = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!x && (x === e || e.contains(x)); }));
await sleep(1500);
// une version plus récente existe : un seul rechargement, pas de boucle
fake = 'version-plus-recente'; navs = 0; const seen = [];
page.on('framenavigated', f => { if (f === page.mainFrame()) navs++; });
await page.goto(SITE, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 14; i++) { try { seen.push((await splash()).msg); } catch (e) { /* page en cours de rechargement */ } await sleep(150); }
const m2 = await settled(); await sleep(2500);
check('nouvelle version : message, un seul rechargement, puis la carte', seen.includes('Mise à jour en cours…') && navs === 2 && m2 === 'live', 'chargements=' + navs + ' ' + [...new Set(seen)].join(' | '));
fake = null;
// sans réseau : on démarre quand même
offline = true; await page.goto(SITE, { waitUntil: 'domcontentloaded' }); const m3 = await settled(); offline = false;
check('sans réseau : l’appli démarre quand même', m3 === 'live');
await b.close(); console.log(res.every(Boolean) ? 'ok   mise à jour à l’ouverture' : 'FAIL'); process.exit(res.every(Boolean) ? 0 : 1);
