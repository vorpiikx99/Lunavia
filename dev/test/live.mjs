// Parcours de la vraie carte, contre le banc d'essai local (Utrecht) : recherche, itinéraire, guidage au GPS simulé,
// limitations, voies, recalcul, lieux utiles, prix des carburants, pannes des services.
import { open, idle, sleep, state, closeAll } from './lib.mjs';

const BED = 'http://127.0.0.1:8003/';
const HOSTS = ['tiles.openfreemap.org', 'photon.komoot.io', 'overpass-api.de', 'overpass.private.coffee', 'data.economie.gouv.fr', 'data.geopf.fr', 'valhalla1.openstreetmap.de', 'routing.openstreetmap.de', 'api.open-meteo.com'];
export const bed = async (u, route, req) => {
  const x = new URL(u);
  if (!HOSTS.includes(x.host)) return false;
  const body = req.postData();
  const r = await fetch(BED + x.host + x.pathname + x.search, { method: req.method(), body: body || undefined, headers: body ? { 'content-type': req.headers()['content-type'] || 'text/plain' } : {} });
  await route.fulfill({ status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/octet-stream', 'access-control-allow-origin': '*' }, body: Buffer.from(await r.arrayBuffer()) });
  return true;
};
export const flags = async o => { await fetch(BED + '_flags?' + new URLSearchParams(o)); };
export const bedLog = async () => (await fetch(BED + '_log')).json();

// faux GPS piloté par le test : chaque appel à __fix() livre une position à l'appli
export const GPS = () => {
  const g = navigator.geolocation;
  window.__watch = null; window.__last = null;
  g.watchPosition = ok => { window.__watch = ok; if (window.__last) setTimeout(() => ok(window.__last), 0); return 1; };
  g.getCurrentPosition = ok => { if (window.__last) ok(window.__last); };
  g.clearWatch = () => {};
  window.__fix = (lat, lon, speed, heading, acc) => {
    const p = { coords: { latitude: lat, longitude: lon, accuracy: acc || 6, speed: speed == null ? null : speed, heading: heading == null ? null : heading, altitude: null, altitudeAccuracy: null }, timestamp: Date.now() };
    window.__last = p; if (window.__watch) window.__watch(p);
  };
};
export const START = [5.1100, 52.0894];
export async function openLive(o = {}) {
  const t = await open(Object.assign({ kind: 'site', handlers: [bed], geo: { latitude: START[1], longitude: START[0] } }, o, { hash: o.hash || '' }));
  return t;
}
// avance le long du trajet courant : pas de `step` mètres toutes les `ms` millisecondes, vitesse annoncée `v` m/s
export async function drive(page, { from = 0, to = 1e9, step = 25, ms = 60, v = 13.9, until = null, off = 0 } = {}) {
  return page.evaluate(async a => {
    const G = J.geo, n = J.app.S.nav, r = n.route;
    let s = Math.max(a.from, 0), last = null;
    while (s <= Math.min(a.to, r.dist)) {
      const p = G.at(r.geom, r.cum, s);
      const ll = a.off ? G.dest(p.pt, p.brg + 90, a.off) : p.pt;
      window.__fix(ll[1], ll[0], a.v, p.brg, 6);
      await new Promise(res => setTimeout(res, a.ms));
      if (!J.app.S.nav || J.app.S.nav.route !== r) return { s, stopped: true, view: J.app.S.view };
      last = s; s += a.step;
    }
    if (a.to >= r.dist && J.app.S.nav) { const e = r.geom[r.geom.length - 1]; window.__fix(e[1], e[0], 0, null, 6); await new Promise(res => setTimeout(res, 120)); } // on s'arrête à l'arrivée
    return { s: last, view: J.app.S.view };
  }, { from, to, step, ms, v, off });
}
export const navState = page => page.evaluate(() => { const n = J.app.S.nav; if (!n) return null; const st = n.route.steps[n.k + 1]; return { s: Math.round(n.s), k: n.k, dn: Math.round(n.dn || 0), next: st && st.text, limit: J.app.S.limit, lim: n.lim ? n.lim.length : null, limTo: n.limTo, src: n.route.src, lanes: !document.querySelector('#lanes').hidden, sign: document.querySelector('#ns-act').textContent + ' / ' + document.querySelector('#ns-road').textContent + ' / ' + document.querySelector('#ns-dist').textContent, limitShown: document.querySelector('#limit').hidden ? null : document.querySelector('#limit').textContent, speed: document.querySelector('#speedo b').textContent }; });

const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
const want = name => !only.length || only.some(o => name.includes(o));
const results = [];
async function scenario(name, fn) {
  if (!want(name)) return;
  await flags({ valhallaDown: false, osrmDown: false, overpassDown: false, photonDown: false, fuelDown: false, slow: 0 });
  await bedLog();
  try { await fn(); results.push('ok   ' + name); console.log('ok   ' + name); }
  catch (e) { results.push('FAIL ' + name + ' :: ' + String(e.message).split('\n')[0]); console.log('FAIL ' + name + ' :: ' + String(e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
}
const expect = (c, msg) => { if (!c) throw new Error(msg); };
const errs = t => t.logs.filter(l => !/GPU stall|GL Driver|ERR_BLOCKED_BY_CLIENT|Failed to load resource|fetching the script|Expected value to be of type number|could not be loaded/.test(l));
async function gotoCoords(page, lat, lon) {
  await page.click('#q'); await page.fill('#q', lat + ', ' + lon);
  await page.waitForSelector('#results .row', { timeout: 6000 }); await page.click('#results .row >> nth=0');
  await page.waitForFunction(() => J.app.S.view === 'place', null, { timeout: 6000 });
}
async function planTo(page, lat, lon) {
  await gotoCoords(page, lat, lon);
  await page.click('[data-act="route"]');
  await page.waitForFunction(() => J.app.S.routes.length > 0 || document.querySelector('#sheet .err, #sheet [data-act="retry"]'), null, { timeout: 25000 });
  await idle(page); await sleep(700);
}

if (import.meta.url === 'file://' + process.argv[1]) {
  await scenario('01 démarrage, position, recherche', async () => {
    const t = await openLive({ init: GPS });
    const { page, shot } = t;
    expect((await state(page)).mode === 'live', 'mode ' + (await state(page)).mode);
    await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START);
    await sleep(1900); await idle(page); await sleep(600);
    await shot('L01-accueil');
    await page.click('#q'); await page.fill('#q', 'oudegracht');
    await page.waitForSelector('#results .row', { timeout: 6000 }); await sleep(500);
    const rows = await page.$$eval('#results .row', els => els.map(e => e.innerText.replace(/\n+/g, ' | ')));
    console.log('     résultats :', rows.slice(0, 6).join(' ;; '));
    expect(rows.some(r => /12 Oudegracht/.test(r)), 'adresse de la base nationale absente');
    expect(rows.some(r => /^Oudegracht/.test(r)), 'rue absente');
    await shot('L02-recherche');
    await page.click('#results .row >> nth=0'); await idle(page); await sleep(900);
    await shot('L03-fiche');
    console.log('     erreurs :', errs(t).join(' ; ') || 'aucune');
    expect(!errs(t).length, 'erreurs console');
    await t.ctx.close();
  });

  await scenario('02 itinéraire voiture, feuille de route, météo', async () => {
    const t = await openLive({ init: GPS });
    const { page, shot } = t;
    await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(1800);
    await planTo(page, 52.0853, 5.1760);
    const info = await page.evaluate(() => ({ n: J.app.S.routes.length, src: J.app.S.routes[0].src, dist: Math.round(J.app.S.routes[0].dist), time: Math.round(J.app.S.routes[0].time), steps: J.app.S.routes[0].steps.map(s => s.text), wx: document.querySelector('#wx') && !document.querySelector('#wx').hidden ? document.querySelector('#wx').innerText : null, sheet: document.querySelector('#sheet').innerText.replace(/\n+/g, ' | ').slice(0, 420) }));
    console.log('     ', JSON.stringify(info).slice(0, 1500));
    expect(info.src === 'valhalla', 'source ' + info.src);
    expect(info.wx && /°C/.test(info.wx), 'météo absente');
    await shot('L04-itineraire');
    await page.click('.steps summary'); await sleep(250); await shot('L05-feuille');
    for (const m of ['bike', 'foot']) {
      await page.click('[data-act="mode"][data-k="' + m + '"]');
      await page.waitForFunction(() => !J.app.S.loading && J.app.S.routes.length > 0, null, { timeout: 20000 }); await idle(page); await sleep(500);
      const r = await page.evaluate(() => ({ t: Math.round(J.app.S.routes[0].time / 60), d: Math.round(J.app.S.routes[0].dist), n: J.app.S.routes.length, first: J.app.S.routes[0].steps.slice(0, 4).map(s => s.text) }));
      console.log('      ' + m, JSON.stringify(r));
      await shot('L06-' + m);
    }
    console.log('     erreurs :', errs(t).join(' ; ') || 'aucune');
    expect(!errs(t).length, 'erreurs console');
    await t.ctx.close();
  });

  await scenario('03 guidage réel : annonces, limitations, voies, arrivée', async () => {
    const t = await openLive({ init: GPS });
    const { page, shot } = t;
    await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(1800);
    await planTo(page, 52.0853, 5.1760);
    await page.click('[data-act="start"]');
    await page.waitForFunction(() => !!J.app.S.nav, null, { timeout: 5000 });
    await drive(page, { from: 0, to: 400, step: 12, ms: 90, v: 11 });
    await sleep(700);
    console.log('      à 400 m', JSON.stringify(await navState(page)));
    await shot('L07-guidage');
    await drive(page, { from: 400, to: 3300, step: 22, ms: 45, v: 13.9 });
    console.log('      à 3300 m', JSON.stringify(await navState(page)));
    await drive(page, { from: 3300, to: 3760, step: 14, ms: 70, v: 19 });
    await sleep(500);
    const a = await navState(page);
    console.log('      avant les voies', JSON.stringify(a));
    await shot('L08-voies');
    await drive(page, { from: 3760, to: 4500, step: 22, ms: 45, v: 27 });
    await sleep(300);
    const b = await navState(page);
    console.log('      sur voie rapide', JSON.stringify(b));
    await shot('L09-rapide');
    await drive(page, { from: 4500, to: 1e9, step: 20, ms: 40, v: 16 });
    await page.waitForFunction(() => J.app.S.view === 'arrived', null, { timeout: 8000 });
    await sleep(1200); await idle(page); await sleep(900); await shot('L10-arrivee');
    const said = await page.evaluate(() => window.__said);
    console.log('      annonces :\n        ' + said.join('\n        '));
    const log = await bedLog();
    console.log('      appels :', log.filter(l => !/tiles\.openfreemap|fonts|sprites/.test(l)).map(l => l.slice(0, 90)).join(' ;; '));
    expect(a.lim > 0, 'pas de limitations le long du trajet');
    expect(said.some(s => /rond-point/.test(s)), 'rond-point non annoncé');
    expect(said.some(s => /Vous êtes arrivé/.test(s)), 'arrivée non annoncée');
    expect(!log.some(l => /overpass/.test(l) && /POST/.test(l)), 'Overpass sollicité alors que les limitations du trajet sont connues');
    console.log('     erreurs :', errs(t).join(' ; ') || 'aucune');
    expect(!errs(t).length, 'erreurs console');
    await t.ctx.close();
  });

  await scenario('04 sortie de route : nouvel itinéraire', async () => {
    const t = await openLive({ init: GPS });
    const { page, shot } = t;
    await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(1800);
    await planTo(page, 52.0853, 5.1760);
    await page.click('[data-act="start"]');
    await page.waitForFunction(() => !!J.app.S.nav, null, { timeout: 5000 });
    await drive(page, { from: 0, to: 900, step: 20, ms: 50, v: 12 });
    const before = await page.evaluate(() => ({ dist: Math.round(J.app.S.nav.route.dist), k: J.app.S.nav.k }));
    await page.evaluate(() => { J.app.S.nav.lastRe = Date.now() - 20000; });
    // on quitte le trajet : 4 positions à 160 m sur le côté, en roulant
    const r = await drive(page, { from: 900, to: 1100, step: 40, ms: 250, v: 11, off: 160 });
    await page.waitForFunction(d => J.app.S.nav && Math.round(J.app.S.nav.route.dist) !== d, before.dist, { timeout: 15000 });
    await sleep(600);
    const after = await page.evaluate(() => ({ dist: Math.round(J.app.S.nav.route.dist), src: J.app.S.nav.route.src, first: J.app.S.nav.route.steps.slice(0, 3).map(s => s.text), said: window.__said.slice(-2) }));
    console.log('      avant', JSON.stringify(before), '· après', JSON.stringify(after), '· conduite', JSON.stringify(r));
    const log = await bedLog();
    const re = log.filter(l => /valhalla.*route/.test(l));
    console.log('      demandes d’itinéraire :', re.length, re[re.length - 1].slice(0, 400));
    expect(after.said.some(x => /Nouvel itinéraire/.test(x)), 'recalcul non annoncé');
    expect(/heading/.test(decodeURIComponent(re[re.length - 1])), 'le cap n’est pas transmis au recalcul');
    await drive(page, { from: 0, to: 300, step: 15, ms: 60, v: 11 });
    await shot('L11-recalcul');
    expect(!errs(t).length, 'erreurs console : ' + errs(t).join(' ; '));
    await t.ctx.close();
  });

  await scenario('05 lieux utiles : essence et prix, recharge, parking ; limitation hors guidage', async () => {
    const t = await openLive({ init: GPS });
    const { page, shot } = t;
    await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(1800);
    await page.click('[data-act="cat"][data-k="fuel"]');
    await page.waitForFunction(() => J.app.S.poi && J.app.S.poi.items, null, { timeout: 15000 });
    await idle(page); await sleep(1200);
    const fuel = await page.evaluate(() => ({ n: J.app.S.poi.items.length, priced: J.app.S.poi.items.filter(p => p.extra && p.extra.prices).length, first: J.app.S.poi.items.slice(0, 3).map(p => ({ name: p.name, sub: p.sub, prices: p.extra && p.extra.prices })), rows: [...document.querySelectorAll('#sheet .row')].slice(0, 4).map(e => e.innerText.replace(/\n+/g, ' | ')) }));
    console.log('      essence', JSON.stringify(fuel).slice(0, 1100));
    expect(fuel.n > 0, 'aucune station'); expect(fuel.priced > 0, 'aucun prix rattaché');
    await shot('L12-essence');
    await page.click('#sheet .row >> nth=0'); await idle(page); await sleep(900); await shot('L13-station');
    await page.click('[data-act="close"]'); await sleep(300); await page.click('[data-act="close"]'); await sleep(300);
    for (const c of ['charge', 'parking', 'food', 'shop', 'pharma']) {
      const has = await page.$('[data-act="cat"][data-k="' + c + '"]');
      if (!has) { console.log('      (pas de puce ' + c + ')'); continue; }
      await page.evaluate(k => document.querySelector('[data-act="cat"][data-k="' + k + '"]').click(), c);
      await page.waitForFunction(() => J.app.S.poi && (J.app.S.poi.items || J.app.S.poi.err), null, { timeout: 15000 });
      const r = await page.evaluate(() => ({ n: J.app.S.poi.items ? J.app.S.poi.items.length : -1, first: J.app.S.poi.items && J.app.S.poi.items[0] && [J.app.S.poi.items[0].name, J.app.S.poi.items[0].sub] }));
      console.log('      ' + c, JSON.stringify(r));
      expect(r.n > 0, 'catégorie ' + c + ' vide');
      await page.click('[data-act="close"]'); await sleep(250);
    }
    // on roule sans guidage : la limitation de la route est demandée
    await bedLog();
    await page.evaluate(async () => { const pts = [[5.1247, 52.0789], [5.1252, 52.0787], [5.1258, 52.0785], [5.1264, 52.0783]]; for (const p of pts) { window.__fix(p[1], p[0], 12, 110, 6); await new Promise(r => setTimeout(r, 350)); } });
    await sleep(1500);
    const lim = await page.evaluate(() => ({ limit: J.app.S.limit, shown: !document.querySelector('#limit').hidden, speed: document.querySelector('#speedo b').textContent, box: !document.querySelector('#speed').hidden }));
    const log = await bedLog();
    console.log('      hors guidage', JSON.stringify(lim), '· appels', log.filter(l => /overpass/.test(l)).length);
    expect(log.some(l => /overpass/.test(l)), 'limitation non demandée hors guidage');
    await shot('L14-libre');
    expect(!errs(t).length, 'erreurs console : ' + errs(t).join(' ; '));
    await t.ctx.close();
  });

  await scenario('06 photos aériennes et thème sombre', async () => {
    const t = await openLive({ init: GPS, dark: true });
    const { page, shot } = t;
    await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(2200); await idle(page); await sleep(500);
    await shot('L15-sombre');
    await planTo(page, 52.0853, 5.1760); await shot('L16-sombre-itineraire');
    await page.click('[data-act="close"]'); await sleep(200); await page.click('[data-act="close"]').catch(() => {}); await sleep(300);
    await page.click('#layers'); await sleep(1500); await idle(page); await sleep(600);
    const sat = await page.evaluate(() => ({ vis: J.app.map.getLayer('sat') ? J.app.map.getLayoutProperty('sat', 'visibility') : 'absent', toast: document.querySelector('#toast').textContent }));
    console.log('      photos', JSON.stringify(sat));
    await shot('L17-photos');
    expect(sat.vis === 'visible', 'calque photo non affiché');
    await page.click('#layers'); await sleep(600);
    expect((await page.evaluate(() => J.app.map.getLayoutProperty('sat', 'visibility'))) === 'none', 'retour au plan impossible');
    expect(!errs(t).length, 'erreurs console : ' + errs(t).join(' ; '));
    await t.ctx.close();
  });

  await scenario('07 pannes : secours OSRM, puis plus aucun service', async () => {
    const t = await openLive({ init: GPS });
    const { page, shot } = t;
    await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(1800);
    await flags({ valhallaDown: true });
    await planTo(page, 52.0853, 5.1760);
    const info = await page.evaluate(() => ({ n: J.app.S.routes.length, src: J.app.S.routes[0] && J.app.S.routes[0].src, dist: J.app.S.routes[0] && Math.round(J.app.S.routes[0].dist), time: J.app.S.routes[0] && Math.round(J.app.S.routes[0].time), steps: J.app.S.routes[0] && J.app.S.routes[0].steps.map(s => s.text) }));
    console.log('      secours', JSON.stringify(info).slice(0, 1600));
    expect(info.src === 'osrm', 'le secours OSRM n’a pas pris le relais : ' + info.src);
    await shot('L18-osrm');
    await page.click('[data-act="start"]'); await page.waitForFunction(() => !!J.app.S.nav, null, { timeout: 5000 });
    await drive(page, { from: 0, to: 700, step: 20, ms: 60, v: 12 });
    const ns = await navState(page);
    console.log('      guidage OSRM', JSON.stringify(ns));
    await drive(page, { from: 700, to: 1e9, step: 25, ms: 30, v: 14 });
    await page.waitForFunction(() => J.app.S.view === 'arrived', null, { timeout: 8000 });
    console.log('      annonces OSRM :\n        ' + (await page.evaluate(() => window.__said)).join('\n        '));
    await page.click('[data-act="close"]').catch(() => {}); await sleep(300);
    // vélo et marche par le secours
    for (const m of ['bike', 'foot']) {
      await planTo(page, 52.0853, 5.1760).catch(() => {});
      await page.click('[data-act="mode"][data-k="' + m + '"]');
      await page.waitForFunction(() => !J.app.S.loading, null, { timeout: 20000 }); await sleep(300);
      const r = await page.evaluate(() => J.app.S.routes[0] ? { src: J.app.S.routes[0].src, t: Math.round(J.app.S.routes[0].time / 60), d: Math.round(J.app.S.routes[0].dist), first: J.app.S.routes[0].steps.slice(0, 3).map(s => s.text) } : { err: J.app.S.routeErr });
      console.log('      ' + m, JSON.stringify(r));
      expect(r.src === 'osrm', m + ' : pas de trajet de secours');
      await page.click('[data-act="mode"][data-k="car"]'); await page.waitForFunction(() => !J.app.S.loading, null, { timeout: 20000 });
      await page.click('[data-act="close"]'); await sleep(200); await page.click('[data-act="close"]').catch(() => {}); await sleep(200);
    }
    await flags({ valhallaDown: true, osrmDown: true });
    await gotoCoords(page, 52.0853, 5.1760); await page.click('[data-act="route"]');
    await page.waitForFunction(() => !J.app.S.loading, null, { timeout: 40000 }); await sleep(400);
    const err = await page.evaluate(() => ({ err: J.app.S.routeErr, text: document.querySelector('#sheet').innerText.replace(/\n+/g, ' | ').slice(0, 260) }));
    console.log('      tout en panne', JSON.stringify(err));
    await shot('L19-panne');
    expect(err.err, 'la panne n’est pas signalée');
    await flags({ valhallaDown: false, osrmDown: false });
    await page.click('[data-act="retry"]'); await page.waitForFunction(() => J.app.S.routes.length > 0, null, { timeout: 20000 });
    await page.click('[data-act="close"]'); await sleep(200); await page.click('[data-act="close"]').catch(() => {}); await sleep(200);
    // recherche : Photon en panne puis tout en panne
    await flags({ photonDown: true });
    await page.click('#q'); await page.fill('#q', 'oudegracht'); await sleep(2200);
    const r1 = await page.$$eval('#results .row', els => els.map(e => e.innerText.replace(/\n+/g, ' | ')));
    console.log('      recherche sans Photon :', r1.join(' ;; '));
    expect(r1.some(x => /12 Oudegracht/.test(x)), 'la base d’adresses n’a pas pris le relais');
    await page.fill('#q', 'zzqx introuvable'); await sleep(2200);
    console.log('      recherche vide :', (await page.evaluate(() => document.querySelector('#results').innerText)).replace(/\n+/g, ' | ').slice(0, 200));
    await page.keyboard.press('Escape'); await sleep(300);
    // lieux utiles : Overpass en panne, puis prix en panne
    await flags({ photonDown: false, overpassDown: true });
    await page.click('[data-act="cat"][data-k="fuel"]');
    await page.waitForFunction(() => J.app.S.poi && (J.app.S.poi.items || J.app.S.poi.err), null, { timeout: 30000 }); await sleep(400);
    const p1 = await page.evaluate(() => ({ n: J.app.S.poi.items ? J.app.S.poi.items.length : -1, err: J.app.S.poi.err, text: document.querySelector('#sheet').innerText.replace(/\n+/g, ' | ').slice(0, 240) }));
    console.log('      essence sans Overpass', JSON.stringify(p1));
    await page.click('[data-act="close"]'); await sleep(300);
    await flags({ overpassDown: false, fuelDown: true });
    await page.click('[data-act="cat"][data-k="fuel"]');
    await page.waitForFunction(() => J.app.S.poi && (J.app.S.poi.items || J.app.S.poi.err), null, { timeout: 30000 }); await sleep(400);
    const p2 = await page.evaluate(() => ({ n: J.app.S.poi.items ? J.app.S.poi.items.length : -1, priced: J.app.S.poi.items ? J.app.S.poi.items.filter(p => p.extra && p.extra.prices).length : 0 }));
    console.log('      essence sans les prix', JSON.stringify(p2));
    expect(p2.n > 0, 'sans les prix, les stations doivent rester affichées');
    console.log('     erreurs :', errs(t).join(' ; ') || 'aucune');
    await t.ctx.close();
  });

  await scenario('08 lien partagé, panne au démarrage, démo forcée', async () => {
    let t = await openLive({ init: GPS, hash: '?p=52.0907,5.1214,Oudegracht%2012' });
    let page = t.page;
    await sleep(1500); await idle(page);
    const st = await page.evaluate(() => ({ view: J.app.S.view, name: J.app.S.place && J.app.S.place.name, url: location.href }));
    console.log('      lien partagé', JSON.stringify(st));
    expect(st.view === 'place' && /Oudegracht 12/.test(st.name), 'le lieu partagé ne s’ouvre pas');
    await t.shot('L20-partage');
    await page.click('[data-act="share"]'); await sleep(400);
    console.log('      texte de partage :', await page.evaluate(() => J.app.S.shareText || (document.querySelector('.sharebox') && document.querySelector('.sharebox').innerText) || '(partage natif)'));
    await t.ctx.close();
    // la carte en ligne ne répond pas (lentement) : écran d'échec avec deux boutons
    await flags({ slow: 900 });
    t = await open({ kind: 'site', handlers: [async (u, route) => { if (/tiles\.openfreemap\.org\/styles/.test(u)) { await new Promise(r => setTimeout(r, 800)); await route.abort('connectionrefused'); return true; } return bed(u, route, route.request()); }] });
    page = t.page;
    await flags({ slow: 0 });
    await sleep(600);
    const f = await page.evaluate(() => ({ mode: J.app.S.mode, fail: !!document.querySelector('#map .fail'), text: document.querySelector('#map .fail') && document.querySelector('#map .fail').innerText.replace(/\n+/g, ' | ') }));
    console.log('      panne au démarrage', JSON.stringify(f));
    expect(f.fail && /Réessayer/.test(f.text) && /démo/i.test(f.text), 'écran d’échec incomplet');
    await t.shot('L21-echec');
    await page.click('[data-act="force-demo"]');
    await page.waitForFunction(() => window.J && J.app && J.app.S.mode === 'demo', null, { timeout: 15000 });
    await sleep(800);
    console.log('      démo forcée', JSON.stringify(await state(page)).slice(0, 120));
    await t.ctx.close();
  });

  await scenario('09 route signalée fermée : le trajet la contourne', async () => {
    const t = await openLive({ init: GPS });
    const { page, shot } = t;
    await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(1800);
    await planTo(page, 52.0853, 5.1760);
    const a = await page.evaluate(() => { const r = J.app.S.routes[0]; const p = J.geo.at(r.geom, r.cum, 2300).pt; return { dist: Math.round(r.dist), time: Math.round(r.time), p }; });
    await page.click('[data-act="close"]'); await sleep(200); await page.click('[data-act="close"]').catch(() => {}); await sleep(200);
    // on se place sur le trajet, à 2,3 km, et on signale la route fermée
    await page.evaluate(p => window.__fix(p[1], p[0], 0, null, 5), a.p); await sleep(500);
    await page.click('#reportbtn'); await sleep(300);
    await page.click('[data-act="rep"][data-k="closed"]'); await sleep(400);
    await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(500);
    await bedLog();
    await planTo(page, 52.0853, 5.1760);
    const b = await page.evaluate(p => { const r = J.app.S.routes[0]; const m = J.geo.nearest(r.geom, r.cum, p, 0, r.geom.length - 2); return { dist: Math.round(r.dist), time: Math.round(r.time), ecart: Math.round(m.d), reports: J.app.db.reports.length }; }, a.p);
    const log = await bedLog();
    console.log('      sans signalement', JSON.stringify(a), '· avec', JSON.stringify(b), '· exclusion transmise :', log.some(l => /exclude_locations/.test(decodeURIComponent(l))));
    expect(b.ecart > 40, 'le trajet repasse par la route fermée (écart ' + b.ecart + ' m)');
    await shot('L22-contournement');
    expect(!errs(t).length, 'erreurs console : ' + errs(t).join(' ; '));
    await t.ctx.close();
  });

  await scenario('10 guidage à vélo : pas de panneau de limitation', async () => {
    const t = await openLive({ init: GPS });
    const { page, shot } = t;
    await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(1800);
    await planTo(page, 52.0853, 5.1760);
    await page.click('[data-act="mode"][data-k="bike"]');
    await page.waitForFunction(() => !J.app.S.loading && J.app.S.routes.length > 0, null, { timeout: 20000 }); await sleep(400);
    await bedLog();
    await page.click('[data-act="start"]'); await page.waitForFunction(() => !!J.app.S.nav, null, { timeout: 5000 });
    await drive(page, { from: 0, to: 900, step: 10, ms: 60, v: 5 });
    const ns = await navState(page), log = await bedLog();
    console.log('      vélo', JSON.stringify(ns), '· appels', log.filter(l => /trace_attributes|overpass/.test(l)).length);
    await shot('L23-velo');
    expect(ns.limitShown == null, 'panneau de limitation affiché à vélo');
    expect(!log.some(l => /trace_attributes|overpass/.test(l)), 'limitations demandées à vélo');
    expect(!errs(t).length, 'erreurs console : ' + errs(t).join(' ; '));
    await t.ctx.close();
  });

  await scenario('11 vie courante : maison, favoris, mémoire, signalement sur le trajet, voiture garée', async () => {
    const t = await openLive({ init: GPS });
    const { page, shot } = t;
    await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(1800);
    // « Maison » pas encore définie : on la choisit par la recherche
    await page.click('[data-act="quick"][data-k="home"]'); await page.fill('#q', 'oudegracht');
    await page.waitForSelector('#results .row'); await sleep(400); await page.click('#results .row >> nth=0'); await sleep(700);
    let st = await page.evaluate(() => ({ view: J.app.S.view, home: J.app.db.home && J.app.db.home.name, sheet: document.querySelector('#sheet').innerText.replace(/\n+/g, ' | ').slice(0, 160) }));
    console.log('      maison', JSON.stringify(st));
    expect(st.home, 'la maison n’est pas enregistrée');
    // favori
    await page.click('#q'); await page.fill('#q', 'burger'); await page.waitForSelector('#results .row'); await sleep(400); await page.click('#results .row >> nth=0'); await sleep(600);
    await page.click('[data-act="save"]'); await sleep(150); await page.click('[data-act="save-as"][data-k="fav"]'); await sleep(200);
    await page.click('[data-act="close"]'); await sleep(300);
    // la mémoire survit au rechargement de la page
    await page.evaluate(() => new Promise(r => setTimeout(r, 4500))); // enregistrement différé de la dernière position
    await page.reload(); await page.waitForFunction(() => window.J && J.app && J.app.S.mode === 'live', null, { timeout: 20000 }); await sleep(1200);
    st = await page.evaluate(() => ({ home: J.app.db.home && J.app.db.home.name, favs: J.app.db.favs.length, recents: J.app.db.recents.length, last: J.app.db.last, homeTile: document.querySelector('[data-act="quick"][data-k="home"]').innerText.replace(/\n+/g, ' | ') }));
    console.log('      après rechargement', JSON.stringify(st));
    expect(st.home && st.favs === 1, 'mémoire perdue au rechargement');
    await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(900);
    await shot('L24-accueil-rempli');
    // un trajet vers un point, avec un signalement posé sur la route à 1,2 km
    await planTo(page, 52.0853, 5.1760);
    const p = await page.evaluate(() => { const r = J.app.S.routes[0]; return J.geo.at(r.geom, r.cum, 1200).pt; });
    await page.evaluate(p => { J.app.db.reports.push({ id: 'r' + Date.now(), type: 'works', ll: p, t: Date.now(), yes: 1, no: 0 }); }, p);
    await page.click('[data-act="start"]'); await page.waitForFunction(() => !!J.app.S.nav, null, { timeout: 5000 });
    await drive(page, { from: 0, to: 800, step: 16, ms: 60, v: 12 });
    await sleep(400);
    const al = await page.evaluate(() => ({ shown: !document.querySelector('#alert').hidden, title: document.querySelector('#al-title').textContent, sub: document.querySelector('#al-sub').textContent, said: window.__said.filter(x => /signalé/.test(x)) }));
    console.log('      alerte', JSON.stringify(al));
    expect(al.shown && /Travaux/.test(al.title) && al.said.length === 1, 'alerte de signalement absente');
    await shot('L25-alerte');
    await page.click('[data-act="al-no"]'); await sleep(300);
    const after = await page.evaluate(() => ({ shown: !document.querySelector('#alert').hidden, reports: J.app.db.reports.map(r => r.type + ':' + r.no) }));
    console.log('      après « Plus là »', JSON.stringify(after));
    expect(!after.shown, 'l’alerte reste affichée');
    await page.click('[data-act="stop"]'); await sleep(400);
    await page.click('[data-act="close"]'); await sleep(200); await page.click('[data-act="close"]').catch(() => {}); await sleep(200);
    // voiture garée : mémoriser, retrouver
    await page.click('#reportbtn').catch(() => {}); await sleep(200);
    const hasPark = await page.$('[data-act="park"]');
    if (hasPark) { await page.click('[data-act="park"]'); await sleep(300); } else { await page.click('[data-act="close"]').catch(() => {}); await page.evaluate(() => J.app.ACT.park()); await sleep(300); }
    const pk = await page.evaluate(() => ({ parked: !!J.app.db.parked, tile: !!document.querySelector('[data-act="parked"]') }));
    console.log('      voiture garée', JSON.stringify(pk));
    expect(pk.parked, 'place non mémorisée');
    // tout effacer
    await page.click('#sb-set'); await sleep(300);
    await page.evaluate(() => { document.querySelector('#sheet-in').scrollTop = 5000; }); await sleep(200);
    await page.click('[data-act="wipe"]'); await sleep(200); await page.click('[data-act="wipe-yes"]'); await sleep(400);
    const w = await page.evaluate(() => ({ home: J.app.db.home, favs: J.app.db.favs.length, parked: J.app.db.parked, stored: JSON.parse(localStorage.getItem('jalon.v1') || 'null') }));
    console.log('      après effacement', JSON.stringify(w).slice(0, 200));
    expect(!w.home && !w.favs && !w.parked, 'effacement incomplet');
    console.log('     erreurs :', errs(t).join(' ; ') || 'aucune');
    expect(!errs(t).length, 'erreurs console');
    await t.ctx.close();
  });

  await scenario('12 position refusée : message clair, l’appli reste utilisable', async () => {
    const deny = () => { const g = navigator.geolocation; g.watchPosition = (ok, err) => { setTimeout(() => err({ code: 1, message: 'denied' }), 50); return 1; }; g.getCurrentPosition = (ok, err) => err({ code: 1 }); g.clearWatch = () => {}; };
    const t = await openLive({ init: deny });
    const { page, shot } = t;
    await sleep(300);
    await page.click('#locate'); await sleep(400); // le message du démarrage a pu s'effacer : on redemande la position
    const a = await page.evaluate(() => ({ toast: document.querySelector('#toast').hidden ? '' : document.querySelector('#toast').textContent, pos: J.app.S.pos, denied: J.app.S.denied }));
    console.log('      refus', JSON.stringify(a));
    expect(/refusée/.test(a.toast) && !a.pos, 'refus non expliqué');
    await shot('L26-refus');
    await gotoCoords(page, 48.8584, 2.2945); await page.click('[data-act="route"]'); await sleep(800);
    const b = await page.evaluate(() => ({ err: J.app.S.routeErr, text: document.querySelector('#sheet').innerText.replace(/\n+/g, ' | ').slice(0, 260) }));
    console.log('      itinéraire sans position', JSON.stringify(b));
    expect(b.err === 'nopos', 'absence de position non gérée');
    await shot('L27-sans-position');
    expect(!errs(t).length, 'erreurs console : ' + errs(t).join(' ; '));
    await t.ctx.close();
  });
  console.log('\n' + results.join('\n'));
  await closeAll();
}
