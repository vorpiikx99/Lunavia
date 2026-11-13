// Pas de traînée derrière soi ; « Sens interdit » posé à un endroit visé de la carte, puis évité par tous les trajets ;
// panneau de limitation estimée en rouge.
import { openLive, GPS, START, drive } from './live.mjs';
import { idle } from './lib.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const check = (l, ok, d) => { res.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + l + (d ? '  ' + d : '')); };
const t = await openLive({ init: GPS, dpr: 2, dark: true }); const { page } = t;
await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(1500);
const shots = []; const snap = async n => { await idle(page); await sleep(700); shots.push([n, (await page.screenshot()).toString('base64')]); };
const plan = async () => { await page.evaluate(() => J.app.go('home')); await sleep(200); await page.click('#q'); await page.fill('#q', '52.0853, 5.1760'); await page.waitForSelector('#results .row'); await page.click('#results .row >> nth=0'); await page.waitForFunction(() => J.app.S.view === 'place'); await page.click('[data-act="route"]'); await page.waitForFunction(() => J.app.S.routes.length > 0 && J.app.S.view === 'route', null, { timeout: 25000 }); await sleep(1200); };
await plan();
const first = await page.evaluate(() => { const r = J.app.S.routes[J.app.S.sel]; return { dist: r.dist, mid: J.geo.at(r.geom, r.cum, r.dist * 0.55).pt, geom: r.geom }; });
await page.click('[data-act="start"]'); await page.waitForFunction(() => !!J.app.S.nav);
await drive(page, { from: 0, to: 700, step: 12, ms: 70, v: 11 }); await sleep(1200);
const g = await page.evaluate(() => ({ trait: JSON.stringify(J.app.map.getPaintProperty('route', 'line-gradient')), bord: JSON.stringify(J.app.map.getPaintProperty('route-case', 'line-gradient')) }));
check('derrière soi, ni trait ni bordure ne sont dessinés', /rgba\(0,0,0,0\)/.test(g.trait) && /rgba\(0,0,0,0\)/.test(g.bord) && JSON.parse(g.bord)[3] > 0.05, g.bord.slice(0, 80));
const lim = await page.evaluate(() => { const e = document.querySelector('#limit'); e.hidden = false; e.textContent = '80'; e.classList.add('est'); const c = getComputedStyle(e); return c.borderTopColor + ' ' + c.borderTopStyle; });
check('panneau de limitation estimée : bord rouge plein, comme un vrai panneau', /rgb\(193, 18, 28\) solid/.test(lim), lim);
await snap('Guidage : rien derrière');
await page.click('[data-act="stop"]'); await sleep(600);
// on vise un endroit du trajet en déplaçant la carte, puis on signale un sens interdit
await page.evaluate(() => J.app.go('home')); await sleep(300);
await page.evaluate(mid => { const m = J.app.map; J.app.S.follow = false; m.jumpTo({ center: mid, zoom: 16 }); }, first.mid); await sleep(600);
await page.evaluate(() => J.app.S.follow = false);
await page.click('#reportbtn'); await page.waitForSelector('[data-k="oneway"]'); await sleep(400);
check('par défaut, le signalement est posé à ma position', await page.evaluate(() => document.querySelector('#aim').hidden && /ta position/.test(document.querySelector('#sheet').textContent)));
await page.click('[data-act="aim"]'); await sleep(500);
// on fait glisser la carte pour mettre la croix exactement sur la route
await page.evaluate(mid => { const m = J.app.map, el = document.querySelector('#aim'), r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, pt = m.project(mid); m.panBy([pt.x - cx, pt.y - cy], { duration: 0 }); }, first.mid); await sleep(500);
const head = await page.evaluate(() => document.querySelector('#sheet').textContent);
check('« Viser un autre endroit » : une croix de visée apparaît', /croix/.test(head) && await page.evaluate(() => !document.querySelector('#aim').hidden));
await snap('Signaler un sens interdit');
await page.click('[data-k="oneway"]');
await page.waitForSelector('.dirbtn'); await sleep(900);
const dirs = await page.evaluate(() => [...document.querySelectorAll('.dirbtn')].map(b => b.dataset.hd));
check('« Sens interdit » demande dans quel sens : deux flèches le long de la route', dirs.length === 2 && dirs[0] !== '' && Math.abs(((+dirs[0] - +dirs[1]) + 360) % 360 - 180) < 1, dirs.join(' / '));
await snap('Dans quel sens ?');
// le sens du trajet à cet endroit : c'est lui qu'on interdit ; l'autre sens reste permis
const capTrajet = await page.evaluate(mid => { const r = J.app.S.routes.length ? null : null; return null; }, first.mid);
const want = await page.evaluate(([geom, mid]) => { const G = J.geo, c = G.cum(geom), m = G.nearest(geom, c, mid, 0, geom.length - 2); return G.at(geom, c, m.s).brg; }, [first.geom, first.mid]);
const pick = dirs.slice(0, 2).sort((a, b) => Math.abs(((+a - want + 540) % 360) - 180) - Math.abs(((+b - want + 540) % 360) - 180))[0]; // le sens du trajet
await page.click('.dirbtn[data-hd="' + pick + '"]'); await sleep(800);
const rp = await page.evaluate(() => J.app.db.reports.slice(-1)[0]);
check('le sens choisi est enregistré avec le signalement', rp.hd === +pick, 'cap ' + rp.hd + ' (trajet ' + Math.round(want) + ')');
const dAim = await page.evaluate(([a, b]) => J.geo.hav(a, b), [rp.ll, first.mid]);
check('le sens interdit est posé sous la croix, recalé sur la route', rp.type === 'oneway' && dAim < 12, Math.round(dAim) + ' m');
check('il est gardé sur l’appareil et n’est pas envoyé aux autres', !rp.sid);
check('la croix disparaît une fois le signalement posé', await page.evaluate(() => document.querySelector('#aim').hidden));
// le même trajet ne passe plus par là
await plan();
const second = await page.evaluate(mid => { const r = J.app.S.routes[J.app.S.sel], m = J.geo.nearest(r.geom, r.cum, mid, 0, r.geom.length - 2); return { dist: r.dist, d: m.d, all: J.app.S.routes.map(x => Math.round(J.geo.nearest(x.geom, x.cum, mid, 0, x.geom.length - 2).d)) }; }, first.mid);
check('les trajets ne passent plus sur ce bout de route (ils passent au plus près par une rue voisine)', second.all.every(d => d > 4), 'écart au point : ' + second.all.join(' / ') + ' m · ' + Math.round(first.dist) + ' → ' + Math.round(second.dist) + ' m');
await snap('Nouveau trajet : évite le sens interdit');
// pas d'alerte vocale en passant devant
check('pas d’alerte vocale pour un sens interdit', await page.evaluate(() => !J.app.S.nav || !J.app.S.nav.reps || !J.app.S.nav.reps.some(x => x.rp.type === 'oneway')));
const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p2 = await b.newPage({ viewport: { width: 380 * shots.length + 24 * (shots.length - 1) + 56, height: 760 + 108 } });
await p2.setContent('<body style="margin:0;background:#16181C;font-family:Arial,sans-serif"><div style="display:flex;gap:24px;padding:28px">' + shots.map(([n, s]) => '<figure style="margin:0"><img src="data:image/png;base64,' + s + '" style="width:380px;border-radius:26px;display:block;box-shadow:0 0 0 1px #3A3E47"><figcaption style="color:#fff;font-size:21px;font-weight:700;text-align:center;padding-top:12px">' + n + '</figcaption></figure>').join('') + '</div></body>');
await p2.screenshot({ path: '/home/claude/jalon/dist/lunavia-sens-interdit.png' }); await b.close();
// dans l'autre sens, la même route reste permise : on fait le trajet inverse
await page.evaluate(() => J.app.go('home')); await sleep(200);
const back = await page.evaluate(async ([geom, mid]) => {
  const G = J.geo, c = G.cum(geom), m = G.nearest(geom, c, mid, 0, geom.length - 2), a = G.at(geom, c, m.s + 120).pt, b = G.at(geom, c, Math.max(0, m.s - 120)).pt;
  const rs = await J.live.route(a, b, 'car', { avoid: J.app.db.reports.filter(r => r.type === 'oneway').map(r => ({ ll: r.ll, hd: r.hd })) });
  const plain = await J.live.route(a, b, 'car', {});
  const d = r => Math.round(G.nearest(r.geom, r.cum, mid, 0, r.geom.length - 2).d);
  return { avec: d(rs[0]), sans: d(plain[0]) };
}, [first.geom, first.mid]);
check('dans l’autre sens, le trajet est le même que sans signalement', back.avec === back.sans, 'écart au point : ' + back.avec + ' m (sans signalement : ' + back.sans + ' m)');
console.log('erreurs', t.logs.filter(l => !/GPU stall|GL Driver|ERR_BLOCKED|Failed to load|sprite|Expected value|could not be loaded|fetching the script|AJAXError|tomtom/i.test(l)).slice(0, 4).join(' ; ') || 'aucune');
console.log(res.every(Boolean) ? 'ok   sens interdit et traînée' : 'FAIL'); process.exit(res.every(Boolean) ? 0 : 1);
