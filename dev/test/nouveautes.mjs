// Version 1.5 : zones de danger, commande vocale, trafic (clé), écran allumé, repère violet.
import { openLive, GPS, START, drive, flags } from './live.mjs';
import { idle } from './lib.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const check = (l, ok, d) => { res.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + l + (d ? '  ' + d : '')); };
// fausse reconnaissance vocale : window.__dire('phrase') joue ce que le micro aurait entendu
const VOICE = () => { window.SpeechRecognition = function () { const me = this; window.__rec = me; me.start = () => { me.started = true; }; me.stop = () => { if (me.onend) me.onend(); }; }; window.__dire = t => { const r = window.__rec; r.onresult({ results: [[{ transcript: t }]] }); r.onend(); }; };
const t = await openLive({ init: '(' + GPS + ')();(' + VOICE + ')();', dpr: 2 }); const { page } = t;
await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(1500);
const shots = []; const snap = async n => { await idle(page); await sleep(800); shots.push([n, (await page.screenshot()).toString('base64')]); };
const dire = async ph => { await page.click('#sb-mic'); await sleep(200); await page.evaluate(p => window.__dire(p), ph); };

check('le micro est proposé dans la barre de recherche', await page.evaluate(() => !document.querySelector('#sb-mic').hidden));
// trafic : sans clé rien, avec clé la couche est posée
const tr = await page.evaluate(() => { const s = J.app.map.getSource('traffic'); return { couche: !!J.app.map.getLayer('traffic'), url: s ? s.tiles[0] : '', mention: document.querySelector('#attrib').textContent }; });
check('le trafic est affiché d’office, avec la mention TomTom', tr.couche && /orbis\/traffic\/flow\/raster\/tile\/\{z\}\/\{x\}\/\{y\}\?apiVersion=2&key=[A-Za-z0-9]{32}&style=light&tileSize=512/.test(tr.url) && /TomTom/.test(tr.mention));
await page.click('#sb-set'); await page.waitForSelector('#set-traffic'); await page.click('label[for="set-traffic"]'); await sleep(2500); await idle(page);
check('réglage coupé : la couche disparaît', await page.evaluate(() => !J.app.map.getLayer('traffic')));
await page.click('label[for="set-traffic"]'); await sleep(2500); await idle(page);
check('réglage rallumé : la couche revient', await page.evaluate(() => !!J.app.map.getLayer('traffic')));
await snap('Réglages : trafic');
await page.evaluate(() => J.app.go('home')); await sleep(300);
// commande vocale : destination
await dire('emmène-moi à Biltstraat');
await page.waitForFunction(() => J.app.S.view === 'route' && J.app.S.routes.length > 0, null, { timeout: 25000 });
check('« emmène-moi à … » : le trajet est préparé', await page.evaluate(() => /Biltstraat/i.test(J.app.S.dest.name)), await page.evaluate(() => J.app.S.dest.name));
await page.evaluate(() => J.app.ACT.clear ? null : null);
// zone de danger sur un trajet
await page.evaluate(() => J.app.go('home')); await sleep(300);
await page.click('#q'); await page.fill('#q', '52.0853, 5.1760'); await page.waitForSelector('#results .row'); await page.click('#results .row >> nth=0');
await page.waitForFunction(() => J.app.S.view === 'place'); await page.click('[data-act="route"]');
await page.waitForFunction(() => J.app.S.routes.length > 0 && J.app.S.view === 'route', null, { timeout: 25000 }); await idle(page);
const cam = await page.evaluate(() => { const r = J.app.S.routes[0]; return J.geo.at(r.geom, r.cum, 2600).pt; });
await flags({ camLat: cam[1], camLon: cam[0] });
await page.evaluate(() => { window.__said = []; });
await page.click('[data-act="start"]'); await page.waitForFunction(() => !!J.app.S.nav);
await page.waitForFunction(() => J.app.S.nav.zones, null, { timeout: 15000 });
const z = await page.evaluate(() => J.app.S.nav.zones);
check('une zone de danger est calculée autour du point, sans le centrer', z.length === 1 && z[0].s0 < 2600 && z[0].s1 > 2600 && Math.abs((z[0].s0 + z[0].s1) / 2 - 2600) > 50, JSON.stringify(z.map(x => [Math.round(x.s0), Math.round(x.s1)])));
check('aucun repère de radar sur la carte', await page.evaluate(() => !document.querySelector('.maplibregl-marker.cam') && !J.app.map.getLayer('cams')));
await drive(page, { from: 0, to: Math.round(z[0].s0) + 150, step: 14, ms: 70, v: 13 }); await sleep(900);
const zu = await page.evaluate(() => ({ vu: !document.querySelector('#zone').hidden, txt: document.querySelector('#zone').textContent, dit: (window.__said || []).join(' | ') }));
check('dans la zone : bandeau et annonce vocale', zu.vu && /Zone de danger/i.test(zu.txt) && /zone de danger/i.test(zu.dit), zu.txt.trim().replace(/\s+/g, ' '));
await snap('Zone de danger');
// commande vocale pendant le guidage
await page.click('.navbar [data-act="mic"]'); await sleep(200); await page.evaluate(() => window.__dire('signale un bouchon'));
await sleep(500);
check('« signale un bouchon » : le signalement est posé', await page.evaluate(() => J.app.db.reports.slice(-1)[0].type === 'jam'));
check('écran allumé demandé pendant le guidage', await page.evaluate(() => !!document.querySelector('video[aria-hidden]') || 'wakeLock' in navigator));
await page.click('.navbar [data-act="mic"]'); await sleep(200); await page.evaluate(() => window.__dire('arrête le guidage')); await sleep(600);
check('« arrête le guidage » : le guidage s’arrête', await page.evaluate(() => !J.app.S.nav));
check('le repère de destination est violet', await page.evaluate(() => { const p = document.querySelector('.jpin'); return !!p && p.innerHTML.includes('#7D5BFF') && !p.innerHTML.includes('#C1121C'); }));
await snap('Repère de destination');
await flags({ camLat: 0, camLon: 0 });
const html = '<body style="margin:0;background:#16181C;font-family:Arial,sans-serif"><div style="display:flex;gap:24px;padding:28px">' + shots.map(([n, b]) => '<figure style="margin:0"><img src="data:image/png;base64,' + b + '" style="width:380px;border-radius:26px;display:block;box-shadow:0 0 0 1px #3A3E47"><figcaption style="color:#fff;font-size:21px;font-weight:700;text-align:center;padding-top:12px">' + n + '</figcaption></figure>').join('') + '</div></body>';
const p2 = await page.context().newPage(); await p2.setViewportSize({ width: 380 * 3 + 24 * 2 + 56, height: 760 + 108 }); await p2.setContent(html); await sleep(500);
await p2.screenshot({ path: '/home/claude/jalon/dist/lunavia-1-5.png' });
console.log('erreurs', t.logs.filter(l => !/GPU stall|GL Driver|ERR_BLOCKED|Failed to load|sprite|Expected value|could not be loaded|fetching the script|tomtom|AJAXError/i.test(l)).slice(0, 4).join(' ; ') || 'aucune');
console.log(res.every(Boolean) ? 'ok   nouveautés 1.5' : 'FAIL'); process.exit(res.every(Boolean) ? 0 : 1);
