// Bouton « 3D » (carte inclinée, relief, immeubles) et menu « Options » pendant le guidage.
import { openLive, GPS, START, drive, flags, bedLog } from './live.mjs';
import { idle, open } from './lib.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const check = (l, ok, d) => { res.push(!!ok); console.log((ok ? 'ok   ' : 'FAIL ') + l + (d ? '  ' + d : '')); };
const NOISE = /GPU stall|GL Driver|ERR_BLOCKED|Failed to load|sprite|Expected value|could not be loaded|fetching the script|AJAXError|tomtom/i;
await flags({ demDown: false });
const t = await openLive({ init: GPS, dpr: 2 }); const { page } = t;
await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(1500);
const shots = []; const snap = async n => { await idle(page, 6000); await sleep(800); shots.push([n, (await page.screenshot()).toString('base64')]); };
const st = () => page.evaluate(() => { const m = J.app.map, tr = m.getTerrain(); return { v3d: J.app.db.set.v3d, pitch: Math.round(m.getPitch()), terrain: tr ? tr.source : null, hills: !!m.getLayer('hills'), view: J.app.S.view, route: !!m.getLayer('route'), sat: m.getLayer('sat') ? m.getLayoutProperty('sat', 'visibility') : null, traffic: !!m.getLayer('traffic'), follow: J.app.S.follow }; });

// 1. le bouton 3D, hors guidage
check('un bouton « 3D » est sur la carte, éteint au départ', await page.evaluate(() => { const b = document.querySelector('#v3d'); return b && b.offsetParent && b.getAttribute('aria-pressed') === 'false' && /3D/.test(b.textContent); }));
await bedLog();
await page.click('#v3d'); await sleep(1500); await idle(page, 6000);
let s = await st();
const dem = (await bedLog()).filter(l => /s3\.amazonaws\.com\/elevation-tiles-prod\/terrarium/.test(l)).length;
check('touché : la carte s’incline et prend du relief', s.v3d && s.pitch >= 58 && s.terrain === 'relief' && s.hills, JSON.stringify(s));
check('les tuiles d’altitude sont demandées', dem > 0, dem + ' tuiles');
check('le bouton est allumé et la source du relief est citée', await page.evaluate(() => document.querySelector('#v3d').getAttribute('aria-pressed') === 'true' && /Terrain Tiles/.test(document.querySelector('#attrib').textContent)));
check('la boussole reste cachée tant que la carte est juste inclinée', await page.evaluate(() => document.querySelector('#north').hidden));
await page.evaluate(() => J.app.map.easeTo({ zoom: 16.4, bearing: -30, duration: 0 })); await snap('Bouton 3D');
await page.click('[data-act="locate"]'); await sleep(900);
check('« Ma position » garde la vue 3D', (await st()).pitch >= 58);

// 2. guidage en 3D, et le menu Options
const plan = async () => { await page.evaluate(() => J.app.go('home')); await sleep(200); await page.click('#q'); await page.fill('#q', '52.0853, 5.1760'); await page.waitForSelector('#results .row'); await page.click('#results .row >> nth=0'); await page.waitForFunction(() => J.app.S.view === 'place'); await page.click('[data-act="route"]'); await page.waitForFunction(() => J.app.S.routes.length > 0 && J.app.S.view === 'route', null, { timeout: 25000 }); await sleep(1200); };
await plan();
await page.click('[data-act="start"]'); await page.waitForFunction(() => !!J.app.S.nav);
await drive(page, { from: 0, to: 500, step: 12, ms: 70, v: 11 }); await sleep(800);
s = await st();
check('en guidage, la vue 3D est plus inclinée (60°) avec le relief', s.pitch >= 57 && s.terrain === 'relief', 'inclinaison ' + s.pitch);
const bar = await page.evaluate(() => { const sh = document.querySelector('#sheet').getBoundingClientRect(), bs = [...document.querySelectorAll('.navbar button:not([hidden])')].map(b => b.getBoundingClientRect()); return { n: bs.length, inside: bs.every(r => r.right <= sh.right - 4 && r.left >= sh.left), gear: !!document.querySelector('.navbar [data-act="navmenu"]'), w: Math.round(sh.width) }; });
check('la barre du guidage a un bouton « Options » et tout tient dans la largeur', bar.gear && bar.inside, bar.n + ' boutons, panneau ' + bar.w + ' px');
await page.click('[data-act="navmenu"]'); await sleep(500);
const tiles = await page.evaluate(() => [...document.querySelectorAll('.navgrid .navt')].map(b => b.dataset.act + (b.hasAttribute('aria-pressed') ? ':' + b.getAttribute('aria-pressed') : '')));
check('le menu Options s’ouvre pendant le guidage', (await st()).view === 'navmenu' && tiles.length === (await page.evaluate(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition)) ? 9 : 8), tiles.join(' '));
const s0 = await page.evaluate(() => J.app.S.nav.s);
await drive(page, { from: 520, to: 800, step: 12, ms: 70, v: 11 }); await sleep(500);
const s1 = await page.evaluate(() => J.app.S.nav && J.app.S.nav.s);
check('le guidage continue derrière le menu', s1 > s0 + 150, Math.round(s0) + ' → ' + Math.round(s1) + ' m');
await snap('Options pendant le guidage');

// thème sombre depuis le menu : la carte se recharge, le trajet et le relief reviennent
await page.click('.navt[data-act="theme"]'); await sleep(2500); await idle(page, 8000);
s = await st();
check('« Carte sombre » marche en plein guidage (trajet et relief redessinés)', s.route && s.terrain === 'relief' && s.hills && await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark' && document.querySelector('.navt[data-act="theme"]').getAttribute('aria-pressed') === 'true'), JSON.stringify(s));
const trBefore = s.traffic;
await page.click('.navt[data-act="traffic"]'); await sleep(2500); await idle(page, 8000);
s = await st();
check('« Trafic » s’allume ou s’éteint depuis le menu', s.traffic === !trBefore && s.route && await page.evaluate(b => document.querySelector('.navt[data-act="traffic"]').getAttribute('aria-pressed') === String(b), !trBefore), trBefore + ' → ' + s.traffic);
await page.click('.navt[data-act="traffic"]'); await sleep(2500); await idle(page, 8000);
await page.click('.navt[data-act="layers"]'); await sleep(800);
check('« Photos aériennes » depuis le menu', (await st()).sat === 'visible' && await page.evaluate(() => document.querySelector('.navt[data-act="layers"]').getAttribute('aria-pressed') === 'true'));
await page.click('.navt[data-act="layers"]'); await sleep(500);
await page.click('.navt[data-act="voice"]'); await sleep(300);
check('« Voix » depuis le menu', await page.evaluate(() => J.app.db.set.voice === false && document.querySelector('.navt[data-act="voice"]').getAttribute('aria-pressed') === 'false'));
await page.click('.navt[data-act="voice"]'); await sleep(300);
// vue 3D coupée depuis le menu : retour à l'inclinaison habituelle du guidage
await page.click('.navt[data-act="v3d"]'); await sleep(400);
await drive(page, { from: 820, to: 1000, step: 12, ms: 70, v: 11 }); await sleep(600);
s = await st();
check('« Vue 3D » coupée depuis le menu : plus de relief, inclinaison normale du guidage', !s.v3d && !s.terrain && !s.hills && Math.abs(s.pitch - 50) <= 3, 'inclinaison ' + s.pitch);
await page.click('.navt[data-act="v3d"]'); await sleep(600);
check('… et rallumée', (await st()).terrain === 'relief');
// tout le trajet, puis reprise du guidage
await page.click('.navt[data-act="overview"]'); await sleep(1600);
s = await st();
const z = await page.evaluate(() => J.app.map.getZoom());
check('« Voir tout le trajet » : vue d’ensemble à plat, le guidage ne suit plus', s.view === 'nav' && !s.follow && s.pitch <= 1 && z < 15, 'zoom ' + z.toFixed(1));
await snap('Voir tout le trajet');
await page.click('#locate'); await sleep(400);
await drive(page, { from: 1010, to: 1200, step: 12, ms: 70, v: 11 }); await sleep(800);
s = await st();
check('le bouton de position reprend le guidage', s.follow && s.pitch >= 55, 'inclinaison ' + s.pitch);
// les réglages et les signalements depuis le menu, puis retour au guidage
await page.click('[data-act="navmenu"]'); await sleep(300);
await page.click('.navt[data-act="settings"]'); await sleep(400);
check('« Tous les réglages » s’ouvre pendant le guidage, avec la vue 3D dedans', (await st()).view === 'settings' && await page.evaluate(() => document.querySelector('#set-v3d').checked));
await page.click('#sheet [data-act="close"]'); await sleep(400);
check('fermer les réglages ramène au guidage', (await st()).view === 'nav' && await page.evaluate(() => !!document.querySelector('#nb-eta')));
await page.click('[data-act="navmenu"]'); await sleep(300);
await page.click('.navt[data-act="report"]'); await sleep(400);
check('« Signaler » depuis le menu', (await st()).view === 'report');
await page.click('#sheet [data-act="close"]'); await sleep(300);
await page.click('[data-act="navmenu"]'); await sleep(300);
await page.click('#sheet [data-act="close"]'); await sleep(300);
check('la croix du menu ramène au guidage', (await st()).view === 'nav');
await page.click('[data-act="stop"]'); await sleep(900);
s = await st();
check('après l’arrêt, la carte reste en 3D', s.v3d && s.terrain === 'relief');
check('le choix 3D est gardé pour la prochaine ouverture', await page.evaluate(() => JSON.parse(localStorage.getItem('jalon.v1')).set.v3d === true));
// tuiles d'altitude en panne : la carte reste utilisable
await flags({ demDown: true });
await page.evaluate(() => J.app.map.jumpTo({ center: [5.30, 52.20], zoom: 14 })); await sleep(2500);
check('si le relief ne répond pas, la carte continue (pas d’erreur bloquante)', !t.logs.some(l => /PAGEERROR/.test(l)) && await page.evaluate(() => !!J.app.map.getLayer('route') || true));
await flags({ demDown: false });
console.log('erreurs', t.logs.filter(l => !NOISE.test(l)).slice(0, 4).join(' ; ') || 'aucune');

// 3. démo (aperçu dans Claude) : le bouton incline la carte, sans relief
const d = await open({ kind: 'artifact', dpr: 1 }); await sleep(2500);
await d.page.click('#v3d'); await sleep(1200);
const ds = await d.page.evaluate(() => ({ p: Math.round(J.app.map.getPitch()), t: J.app.map.getTerrain() }));
check('dans la démo, « 3D » incline la ville et ses immeubles', ds.p >= 58 && !ds.t, JSON.stringify(ds));
check('démo sans erreur', !d.logs.some(l => /PAGEERROR/.test(l)), d.logs.filter(l => /PAGEERROR/.test(l)).join(' ; '));
// 4. téléphone couché : les boutons de droite tiennent sans se chevaucher
const l = await openLive({ init: GPS, w: 844, h: 390 }); await l.page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(1500);
const fabs = await l.page.evaluate(() => [...document.querySelectorAll('#side .fab')].filter(b => !b.hidden && b.offsetParent).map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; }));
check('téléphone couché : les boutons de droite tiennent dans l’écran', fabs.every(([a, b]) => a >= 0 && b <= 390) && fabs.every((f, i) => !i || f[0] >= fabs[i - 1][1]), JSON.stringify(fabs));

const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p2 = await b.newPage({ viewport: { width: 380 * shots.length + 24 * (shots.length - 1) + 56, height: 760 + 108 } });
await p2.setContent('<body style="margin:0;background:#16181C;font-family:Arial,sans-serif"><div style="display:flex;gap:24px;padding:28px">' + shots.map(([n, s]) => '<figure style="margin:0"><img src="data:image/png;base64,' + s + '" style="width:380px;border-radius:26px;display:block;box-shadow:0 0 0 1px #3A3E47"><figcaption style="color:#fff;font-size:21px;font-weight:700;text-align:center;padding-top:12px">' + n + '</figcaption></figure>').join('') + '</div></body>');
await p2.screenshot({ path: '/home/claude/jalon/dist/lunavia-3d.png' }); await b.close();
console.log(res.every(Boolean) ? 'ok   vue 3D et options du guidage' : 'FAIL'); process.exit(res.every(Boolean) ? 0 : 1);
