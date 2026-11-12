// Jalon logé dans un dossier du site d'un jeu installé (comme sur GitHub : …/Bestiolins/jalon/).
// La carte doit s'ouvrir, et ni le jeu ni la carte ne doivent dérégler l'autre, avec ou sans réseau.
// Il faut : le banc d'essai (port 8003) et un serveur qui sert le site complet, jeu à /Bestiolins/ et carte à /Bestiolins/jalon/.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
const WEB = process.env.JALON_WEB || 'http://localhost:8091', GAME = WEB + '/Bestiolins/', MAP = GAME + 'jalon/';
const BED = 'http://127.0.0.1:8003/';
const HOSTS = ['tiles.openfreemap.org', 'photon.komoot.io', 'overpass-api.de', 'data.economie.gouv.fr', 'data.geopf.fr', 'valhalla1.openstreetmap.de', 'routing.openstreetmap.de', 'api.open-meteo.com'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, locale: 'fr-FR', serviceWorkers: 'allow' });
let offline = false, slowSw = 0;
await ctx.route('**/*', async route => {
  const req = route.request(), x = new URL(req.url());
  try {
    if (offline) return route.abort('internetdisconnected');
    if (x.hostname === 'localhost') {
      if (slowSw && x.pathname.endsWith('/jalon/sw.js')) { const d = slowSw; slowSw = 0; await sleep(d); }
      return route.continue();
    }
    if (HOSTS.includes(x.host)) {
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
  const g = navigator.geolocation;
  g.watchPosition = ok => { setTimeout(() => ok({ coords: { latitude: 52.0894, longitude: 5.11, accuracy: 8, speed: 0, heading: null }, timestamp: Date.now() }), 300); return 1; };
  g.getCurrentPosition = ok => ok({ coords: { latitude: 52.0894, longitude: 5.11, accuracy: 8, speed: 0, heading: null }, timestamp: Date.now() });
  g.clearWatch = () => {};
});

// ce que chacun garde en réserve : la page du jeu est-elle bien celle du jeu ? des fichiers de la carte traînent-ils chez lui ?
const etat = async ([game, mapUrl]) => {
  const out = { index: 'absente', racine: 'absente', chezLeJeu: 0, reserves: [] };
  for (const n of await caches.keys()) {
    const c = await caches.open(n), ks = await c.keys();
    out.reserves.push(n.replace(/\d{6,}/, '…') + ':' + ks.length);
    if (n.startsWith('jalon-')) continue;
    for (const k of ks) {
      if (k.url.startsWith(mapUrl)) out.chezLeJeu++;
      if (k.url === game + 'index.html' || k.url === game) {
        const t = await (await c.match(k)).text();
        out[k.url === game ? 'racine' : 'index'] = t.includes('jalon:carte') ? 'CARTE' : t.includes('<title>Bestiolins</title>') ? 'jeu' : 'autre';
      }
    }
  }
  out.aides = (await navigator.serviceWorker.getRegistrations()).map(r => new URL(r.scope).pathname).sort();
  const c = navigator.serviceWorker.controller;
  out.pilote = c ? new URL(c.scriptURL).pathname : null;
  return out;
};
const E = () => page.evaluate(etat, [GAME, MAP]);
const show = (label, v) => console.log(label.padEnd(44), typeof v === 'string' ? v : JSON.stringify(v));
const results = [];
const check = (label, ok, detail) => { results.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? '  ' + detail : '')); };
const openGame = async () => {
  await page.goto(GAME, { waitUntil: 'load' });
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 30000 });
  await sleep(700);
  return page.evaluate(() => ({ titre: document.title, jeu: typeof window.CB_VER === 'string', taille: document.documentElement.outerHTML.length }));
};
const openMap = async (wait = 3500) => {
  await page.goto(MAP, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window.J && J.app && J.app.S.mode !== 'boot') || document.querySelector('#map .fail'), null, { timeout: 30000 });
  await sleep(wait);
  return page.evaluate(() => ({
    titre: document.title, mode: window.J && J.app ? J.app.S.mode : '?', echec: !!document.querySelector('#map .fail'),
    tuiles: window.J && J.app && J.app.map && J.app.map.style && J.app.map.style.sourceCaches.openmaptiles ? Object.values(J.app.map.style.sourceCaches.openmaptiles._tiles).filter(t => t.state === 'loaded').length : 0
  }));
};
const mine = () => page.waitForFunction(() => { const c = navigator.serviceWorker.controller; return !!c && c.scriptURL.endsWith('/jalon/sw.js'); }, null, { timeout: 30000 });

/* 1. le jeu est déjà installé sur l'appareil */
const g1 = await openGame();
show('1. jeu ouvert', g1); show('   réserves', await E());
check('le jeu s’ouvre et installe son aide-mémoire', g1.titre === 'Bestiolins' && g1.jeu);

/* 2. première visite de la carte : c'est encore l'aide-mémoire du jeu qui répond */
slowSw = 3000; // on retarde l'installation de celui de la carte, le temps d'observer
await page.goto(MAP, { waitUntil: 'domcontentloaded' });
const seen = new Set(); let pilot0 = null;
for (let i = 0; i < 10; i++) { const e = await E(); seen.add(e.index); pilot0 = pilot0 || e.pilote; await sleep(220); }
show('2. carte, 1re visite : pilotée par', pilot0 || 'personne');
show('   page gardée par le jeu, avant ménage', [...seen].join(' → '));
await page.waitForFunction(() => (window.J && J.app && J.app.S.mode !== 'boot') || document.querySelector('#map .fail'), null, { timeout: 30000 });
await mine();
const m2 = await page.evaluate(() => ({ titre: document.title, mode: J.app.S.mode, echec: !!document.querySelector('#map .fail') }));
await sleep(9000); // le second coup de ménage, demandé par la page, part 6 s après le chargement
const e2 = await E();
show('   carte', m2); show('   réserves après ménage', e2);
check('la carte s’ouvre en vraie carte dès la première visite', m2.titre === 'Lunavia' && m2.mode === 'live' && !m2.echec);
check('la page gardée par le jeu est bien celle du jeu', e2.index === 'jeu' && e2.racine === 'jeu', 'index=' + e2.index + ' racine=' + e2.racine);
check('aucun fichier de la carte ne reste chez le jeu', e2.chezLeJeu === 0, String(e2.chezLeJeu));
check('chacun a son aide-mémoire, la carte est pilotée par le sien', e2.aides.join() === '/Bestiolins/,/Bestiolins/jalon/' && e2.pilote === '/Bestiolins/jalon/sw.js', e2.aides.join(' ') + ' | ' + e2.pilote);

/* 3. visites suivantes */
const m3 = await openMap(); const e3 = await E();
show('3. carte, 2e visite', m3); show('   réserves', e3);
check('2e visite : carte pilotée par son aide-mémoire, rien chez le jeu', m3.mode === 'live' && e3.pilote === '/Bestiolins/jalon/sw.js' && e3.index === 'jeu' && e3.chezLeJeu === 0);
await page.evaluate(async () => { const m = J.app.map; for (const z of [14, 13, 15.5]) { m.jumpTo({ zoom: z }); await new Promise(r => m.once('idle', r)); } });
await sleep(1200);

/* 4. sans réseau : chacun s'ouvre chez soi */
offline = true;
const g4 = await openGame(); show('4. sans réseau, jeu', g4);
const m4 = await openMap(); show('   sans réseau, carte', m4);
offline = false;
check('sans réseau : le jeu s’ouvre (et c’est le jeu)', g4.titre === 'Bestiolins' && g4.jeu);
check('sans réseau : la carte s’ouvre (et c’est la carte)', m4.titre === 'Lunavia' && m4.mode === 'live' && !m4.echec && m4.tuiles > 0, 'tuiles=' + m4.tuiles);

/* 5. le jeu se met à jour (il retire alors tous les aide-mémoire du site, dont celui de la carte), puis on rouvre la carte */
await openGame();
const hasFu = await page.evaluate(() => typeof forceUpdate === 'function');
await Promise.all([
  page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }),
  page.evaluate(has => {
    if (has) { forceUpdate(); return; }
    (async () => {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
      for (const k of await caches.keys()) if (k.startsWith('bestiolins-') || k.startsWith('cryptobetes-')) await caches.delete(k);
      location.replace(location.pathname + '?u=' + Date.now());
    })();
  }, hasFu)
]);
await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 30000 });
await sleep(800);
const e5 = await E();
show('5. après mise à jour du jeu (' + (hasFu ? 'sa propre fonction' : 'reproduite') + ')', e5);
offline = true;
let m5off = null;
try { await page.goto(MAP, { waitUntil: 'domcontentloaded', timeout: 15000 }); await sleep(2500); m5off = await page.evaluate(() => ({ titre: document.title, carte: !!(window.J && J.app) })); } catch (x) { m5off = { erreur: String(x.message).split('\n')[0].slice(0, 90) }; }
offline = false;
show('   carte rouverte sans réseau juste après', m5off);
await page.goto(MAP, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => (window.J && J.app && J.app.S.mode !== 'boot') || document.querySelector('#map .fail'), null, { timeout: 30000 });
await mine();
const m5 = await page.evaluate(() => ({ titre: document.title, mode: J.app.S.mode }));
await sleep(9000);
const e5b = await E();
show('   carte rouverte avec réseau', m5); show('   réserves après ménage', e5b);
check('après une mise à jour du jeu : la carte se réinstalle et remet de l’ordre', m5.mode === 'live' && e5b.index === 'jeu' && e5b.racine === 'jeu' && e5b.chezLeJeu === 0 && e5b.aides.join() === '/Bestiolins/,/Bestiolins/jalon/', 'index=' + e5b.index + ' chezLeJeu=' + e5b.chezLeJeu);
offline = true;
const g6 = await openGame(); const m6 = await openMap();
offline = false;
show('6. sans réseau, jeu', g6); show('   sans réseau, carte', m6);
check('sans réseau, après tout cela : le jeu et la carte s’ouvrent chacun chez soi', g6.titre === 'Bestiolins' && g6.jeu && m6.titre === 'Lunavia' && m6.mode === 'live' && !m6.echec);

console.log('erreurs'.padEnd(44), logs.filter(l => !/Failed to load resource|GPU stall|net::ERR|WebSocket|sprite|Image "|could not be loaded/i.test(l)).slice(0, 6).join(' ; ') || 'aucune');
console.log(results.every(Boolean) ? 'ok   voisinage : le jeu et la carte cohabitent' : 'FAIL voisinage');
await b.close();
process.exit(results.every(Boolean) ? 0 : 1);
