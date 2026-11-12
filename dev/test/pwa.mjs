// Le site installable : mise en mémoire de l'appli et de la carte, puis ouverture sans réseau.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
const BED = 'http://127.0.0.1:8003/';
const HOSTS = ['tiles.openfreemap.org', 'photon.komoot.io', 'overpass-api.de', 'data.economie.gouv.fr', 'data.geopf.fr', 'valhalla1.openstreetmap.de', 'routing.openstreetmap.de', 'api.open-meteo.com'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, locale: 'fr-FR', serviceWorkers: 'allow' });
let offline = false, served = { bed: 0, local: 0, blocked: 0 };
await ctx.route('**/*', async route => {
  const req = route.request(), x = new URL(req.url());
  try {
    if (offline) { served.blocked++; return route.abort('internetdisconnected'); }
    if (x.hostname === 'localhost') { served.local++; return route.continue(); }
    if (HOSTS.includes(x.host)) {
      served.bed++;
      const body = req.postData();
      const r = await fetch(BED + x.host + x.pathname + x.search, { method: req.method(), body: body || undefined });
      return route.fulfill({ status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/octet-stream', 'access-control-allow-origin': '*' }, body: Buffer.from(await r.arrayBuffer()) });
    }
    if (x.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', headers: { 'access-control-allow-origin': '*' }, body: '/* polices */' });
    return route.abort('blockedbyclient');
  } catch (e) { try { await route.abort(); } catch (z) { /* déjà traité */ } }
});
const page = await ctx.newPage();
const logs = [];
page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
await page.addInitScript(() => {
  const g = navigator.geolocation; window.__watch = null;
  g.watchPosition = ok => { window.__watch = ok; setTimeout(() => ok({ coords: { latitude: 52.0894, longitude: 5.11, accuracy: 8, speed: 0, heading: null }, timestamp: Date.now() }), 300); return 1; };
  g.getCurrentPosition = ok => ok({ coords: { latitude: 52.0894, longitude: 5.11, accuracy: 8, speed: 0, heading: null }, timestamp: Date.now() });
  g.clearWatch = () => {};
});
const boot = async label => {
  await page.waitForFunction(() => (window.J && J.app && J.app.S.mode !== 'boot') || document.querySelector('#map .fail'), null, { timeout: 25000 });
  await sleep(3500);
  const st = await page.evaluate(async () => ({
    mode: window.J && J.app ? J.app.S.mode : '?', fail: !!document.querySelector('#map .fail'),
    sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
    caches: await Promise.all((await caches.keys()).map(async k => k + ':' + (await (await caches.open(k)).keys()).length)),
    tiles: window.J && J.app && J.app.map ? Object.values(J.app.map.style.sourceCaches.openmaptiles._tiles).filter(t => t.state === 'loaded').length : 0,
    manifest: document.querySelector('link[rel=manifest]').href
  }));
  console.log(label.padEnd(34), JSON.stringify(st));
  return st;
};
await page.goto('http://localhost:8090/');
await boot('1re ouverture');
await page.reload(); const s2 = await boot('2e ouverture (appli en mémoire)');
// on se promène un peu pour garder des morceaux de carte
await page.evaluate(async () => { const m = J.app.map; for (const z of [14, 13, 15.5]) { m.jumpTo({ zoom: z }); await new Promise(r => m.once('idle', r)); } });
await sleep(1200);
const man = await page.evaluate(async () => { const r = await fetch('manifest.webmanifest'); const j = await r.json(); const ic = await Promise.all(j.icons.map(async i => (await fetch(i.src)).status)); return { name: j.name, display: j.display, start: j.start_url, icons: ic }; });
console.log('manifeste'.padEnd(34), JSON.stringify(man));
offline = true;
await page.reload(); const s3 = await boot('sans réseau');
await page.screenshot({ path: '/home/claude/jalon/test/out/P01-hors-ligne.png' });
// sans réseau, une recherche doit échouer proprement
await page.click('#q'); await page.fill('#q', 'oudegracht'); await sleep(2500);
console.log('recherche sans réseau'.padEnd(34), JSON.stringify((await page.evaluate(() => document.querySelector('#results').innerText)).replace(/\n+/g, ' | ').slice(0, 160)));
offline = false;
console.log('requêtes'.padEnd(34), JSON.stringify(served));
console.log('erreurs'.padEnd(34), logs.filter(l => !/Failed to load resource|GPU stall|net::ERR/.test(l)).join(' ; ') || 'aucune');
const okAll = s2.sw && s3.mode === 'live' && !s3.fail && s3.tiles > 0;
console.log(okAll ? 'ok   site installable : appli et carte disponibles sans réseau' : 'FAIL site installable');
await b.close();
