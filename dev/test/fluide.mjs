// Conduite réaliste : une position par seconde, bruitée (±6 m, parfois un sursaut), à 50 km/h.
// On mesure, image par image, les mouvements du repère : il ne doit ni sauter ni reculer.
import { openLive, GPS, START } from './live.mjs';
import { idle } from './lib.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const check = (l, ok, d) => { res.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + l + (d ? '  ' + d : '')); };
const t = await openLive({ init: GPS }); const { page } = t;
await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(1500);
await page.click('#q'); await page.fill('#q', '52.0853, 5.1760'); await page.waitForSelector('#results .row'); await page.click('#results .row >> nth=0');
await page.waitForFunction(() => J.app.S.view === 'place'); await page.click('[data-act="route"]');
await page.waitForFunction(() => J.app.S.routes.length > 0, null, { timeout: 25000 }); await idle(page);
await page.click('[data-act="start"]'); await page.waitForFunction(() => !!J.app.S.nav);
const out = await page.evaluate(async () => {
  const G = J.geo, r = J.app.S.nav.route, v = 13.9, puck = () => { const p = document.querySelector('.puck'); const m = J.app.map; const mk = J.app.M ? J.app.M.puck : null; return mk ? mk.getLngLat().toArray() : null; };
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  const samples = []; let run = true, last = null, prevS = null;
  const loop = () => { if (!run) return; const p = puck(); if (p) { const m = G.nearest(r.geom, r.cum, p, 0, r.geom.length - 2); samples.push({ t: performance.now(), s: m.s, d: m.d, brg: J.app.map.getBearing() }); } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  for (let i = 0; i < 26; i++) {
    const s = 30 + i * v, a = G.at(r.geom, r.cum, s), big = i === 9 || i === 17; // deux sursauts du GPS
    const noisy = G.dest(G.dest(a.pt, a.brg + 90, rnd() * (big ? 70 : 12)), a.brg, rnd() * 10);
    window.__fix(noisy[1], noisy[0], v + rnd() * 1.5, a.brg + rnd() * 14, big ? 120 : 9);
    await new Promise(z => setTimeout(z, 1000));
  }
  run = false;
  let back = 0, jump = 0, maxOff = 0, turn = 0; const steps = [];
  for (let i = 1; i < samples.length; i++) { const ds = samples[i].s - samples[i - 1].s, dt = (samples[i].t - samples[i - 1].t) / 1000; steps.push(ds); if (ds < -0.3) back++; if (ds > 11) jump++; maxOff = Math.max(maxOff, samples[i].d); let db = Math.abs(samples[i].brg - samples[i - 1].brg); if (db > 180) db = 360 - db; if (i > 20) turn = Math.max(turn, db / Math.max(0.016, dt)); }
  return { images: samples.length, reculs: back, sauts: jump, ecartRoute: +maxOff.toFixed(1), pasMax: +Math.max(...steps).toFixed(2), rotationMaxParImage: +turn.toFixed(2), parcouru: Math.round(samples[samples.length - 1].s - samples[0].s) };
});
console.log(JSON.stringify(out));
check('le repère avance en continu, image par image', out.images > 100 && out.parcouru > 300, out.images + ' images, ' + out.parcouru + ' m');
check('aucun recul', out.reculs === 0, String(out.reculs));
check('aucun saut', out.sauts === 0, 'pas max ' + out.pasMax + ' m par image');
check('le repère reste collé à la route malgré le bruit', out.ecartRoute < 1.5, out.ecartRoute + ' m');
check('la carte tourne sans à-coup', out.rotationMaxParImage < 130, out.rotationMaxParImage + '° par seconde au plus');
console.log(res.every(Boolean) ? 'ok   conduite fluide' : 'FAIL'); process.exit(res.every(Boolean) ? 0 : 1);
