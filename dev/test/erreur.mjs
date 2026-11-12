// Mauvaise route : l'appli doit recalculer vite, depuis l'endroit de l'erreur, dans le sens où l'on roule.
import { openLive, GPS, START, drive, flags } from './live.mjs';
import { idle } from './lib.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const check = (l, ok, d) => { res.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + l + (d ? '  ' + d : '')); };
const t = await openLive({ init: GPS }); const { page } = t;
await flags({ ttDelay: 0, ttJamLen: 0, ttWrong: 0, ttDown: 0 });
await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(1500);
const go = async () => { await page.evaluate(() => J.app.go('home')); await sleep(200); await page.click('#q'); await page.fill('#q', '52.0700, 5.0600'); await page.waitForSelector('#results .row'); await page.click('#results .row >> nth=0'); await page.waitForFunction(() => J.app.S.view === 'place'); await page.click('[data-act="route"]'); await page.waitForFunction(() => J.app.S.routes.length > 0 && J.app.S.view === 'route', null, { timeout: 25000 }); await sleep(1500); await page.click('[data-act="start"]'); await page.waitForFunction(() => !!J.app.S.nav); await page.evaluate(() => { window.__said = []; }); };
// une position par seconde, comme un vrai GPS ; renvoie le nombre de secondes avant le nouvel itinéraire
const stray = fn => page.evaluate(async src => {
  const G = J.geo, n0 = J.app.S.nav, r0 = n0.route, f = new Function('G', 'r', 'i', 'return (' + src + ')(G, r, i)');
  for (let i = 0; i < 8; i++) { const a = G.at(r0.geom, r0.cum, 60 + i * 12); window.__fix(a.pt[1], a.pt[0], 12, a.brg, 8); await new Promise(z => setTimeout(z, 250)); }
  const t0 = performance.now(); let sec = -1, last = null;
  for (let i = 1; i <= 14; i++) {
    const p = f(G, r0, i); last = p; window.__fix(p.ll[1], p.ll[0], 12, p.brg, 8);
    await new Promise(z => setTimeout(z, 1000));
    if (J.app.S.nav.route !== r0) { sec = Math.round((performance.now() - t0) / 1000); break; }
  }
  const r1 = J.app.S.nav.route, m = G.nearest(r1.geom, r1.cum, last.ll, 0, r1.geom.length - 2), start = G.at(r1.geom, r1.cum, 8).brg;
  return { sec, depuisIci: Math.round(m.d), sens: Math.round(Math.abs(G.angDiff(last.brg, start))), dit: (window.__said || []).join(' | ') };
}, fn.toString());
// 1. on quitte le trajet par une rue perpendiculaire
await go();
const a = await stray((G, r, i) => { const b = G.at(r.geom, r.cum, 60 + 7 * 12), brg = (b.brg + 90) % 360; return { ll: G.dest(b.pt, brg, i * 12), brg }; });
check('rue manquée : nouvel itinéraire en quelques secondes', a.sec > 0 && a.sec <= 6, a.sec + ' s');
check('il repart de l’endroit où l’on est', a.depuisIci < 40, a.depuisIci + ' m');
check('la voix l’annonce', /Nouvel itinéraire/.test(a.dit));
await page.click('[data-act="stop"]'); await sleep(500);
// 2. demi-tour : on repart en sens inverse sur la même route
await go();
const b = await stray((G, r, i) => { const s = Math.max(2, 60 + 7 * 12 - i * 12), p = G.at(r.geom, r.cum, s); return { ll: p.pt, brg: (p.brg + 180) % 360 }; });
check('demi-tour sur la même route : nouvel itinéraire aussi', b.sec > 0 && b.sec <= 7, b.sec + ' s');
await page.click('[data-act="stop"]'); await sleep(500);
// 3. petit écart du GPS sans changer de direction : pas de recalcul intempestif
await go();
const c = await stray((G, r, i) => { const p = G.at(r.geom, r.cum, 60 + 7 * 12 + i * 12); return { ll: G.dest(p.pt, (p.brg + 90) % 360, i % 2 ? 14 : -12), brg: p.brg + (i % 2 ? 9 : -8) }; });
check('GPS imprécis mais bonne direction : aucun recalcul', c.sec === -1, String(c.sec));
console.log(res.every(Boolean) ? 'ok   mauvaise route' : 'FAIL'); process.exit(res.every(Boolean) ? 0 : 1);
