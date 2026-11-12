// Durées avec le trafic : les trajets proposés sont rechronométrés, le plus rapide passe devant, l'arrivée se recale en route.
import { openLive, GPS, START, drive, flags } from './live.mjs';
import { idle } from './lib.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const check = (l, ok, d) => { res.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + l + (d ? '  ' + d : '')); };
const t = await openLive({ init: GPS, dpr: 2 }); const { page } = t;
await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(1500);
const plan = async (q = '52.0853, 5.1760') => { await page.evaluate(() => J.app.go('home')); await sleep(200); await page.click('#q'); await page.fill('#q', q); await page.waitForSelector('#results .row'); await page.click('#results .row >> nth=0'); await page.waitForFunction(() => J.app.S.view === 'place'); await page.click('[data-act="route"]'); await page.waitForFunction(() => J.app.S.routes.length > 0 && J.app.S.view === 'route', null, { timeout: 25000 }); await sleep(2200); await idle(page); };
const R = () => page.evaluate(() => ({ sel: J.app.S.sel, r: J.app.S.routes.map(r => ({ d: Math.round(r.dist), t: Math.round(r.time), traf: !!r.traf, delay: r.delay || 0, tag: r.tag })), txt: [...document.querySelectorAll('.alt')].map(a => a.textContent.replace(/\s+/g, ' ')) }));
// 1. trafic fluide
await flags({ ttDelay: 0, ttJamLen: 0, ttWrong: 0, ttDown: 0 });
await plan(); let a = await R();
check('trafic fluide : durées recalées et mention « Trafic fluide »', a.r.every(r => r.traf && Math.abs(r.t - r.d / 13.9) < 3) && a.txt.every(x => /Trafic fluide/.test(x)), JSON.stringify(a.r.map(r => [r.d, r.t])));
const first = a.r[0].d, n = a.r.length;
// 2. gros bouchon sur le trajet proposé en premier : un autre passe devant
await flags({ ttDelay: 900, ttJamLen: first });
await plan(); a = await R();
const jam = a.r.findIndex(r => r.delay === 900);
check('bouchon de 15 min sur un trajet : il est annoncé', jam >= 0 && /\+ 15 min de bouchons/.test(a.txt[jam]), a.txt[jam]);
check('un autre trajet, plus rapide, est choisi d’office', n < 2 || (a.sel !== jam && a.r[a.sel].tag === 'Le plus rapide'), 'choisi ' + a.sel + ' · ' + a.r.map(r => r.t).join(' / '));
await page.screenshot({ path: 'test/out/trafic-trajets.png' });
// 2 bis. destination avec trois trajets possibles : le bouchon tombe sur le premier, un autre doit passer devant
await flags({ ttDelay: 0, ttJamLen: 0 });
await plan('52.0700, 5.0600'); let b = await R();
await flags({ ttDelay: 900, ttJamLen: b.r[0].d });
await plan('52.0700, 5.0600'); b = await R();
const jb = b.r.findIndex(r => r.delay === 900);
check('trois trajets, bouchon sur le premier : un autre est choisi d’office', b.r.length === 3 && jb === 2 && b.sel === 0 && b.r[0].t === Math.min(...b.r.map(r => r.t)) && b.r[0].tag === 'Le plus rapide', 'choisi ' + b.sel + ' · durées ' + b.r.map(r => r.t).join(' / ') + ' · bouchon sur ' + jb);
await page.screenshot({ path: 'test/out/trafic-trajets.png' });
// 3. tracé reconstitué trop différent : on n'en tient pas compte
await flags({ ttDelay: 0, ttJamLen: 0, ttWrong: 1 });
await plan(); a = await R();
check('réponse incohérente : ignorée, durées d’origine gardées', a.r.every(r => !r.traf) && !a.txt.some(x => /Trafic|bouchons/.test(x)));
// 4. service en panne : les trajets restent proposés
await flags({ ttWrong: 0, ttDown: 1 });
await plan(); a = await R();
check('service de trafic en panne : trajets proposés quand même', a.r.length >= 1 && a.r.every(r => !r.traf));
// 5. pendant le guidage : un bouchon apparaît, l'heure d'arrivée recule
await flags({ ttDown: 0 });
await plan();
await page.click('[data-act="start"]'); await page.waitForFunction(() => !!J.app.S.nav);
await drive(page, { from: 0, to: 300, step: 12, ms: 80, v: 11 }); await sleep(1500);
const t0 = await page.evaluate(() => J.app.S.nav.tRem);
await flags({ ttDelay: 1200 });
await page.evaluate(() => { J.app.S.nav.trafT = 0; });
await drive(page, { from: 300, to: 420, step: 12, ms: 80, v: 11 }); await sleep(1800);
await drive(page, { from: 420, to: 460, step: 12, ms: 80, v: 11 }); await sleep(600);
const t1 = await page.evaluate(() => ({ rem: J.app.S.nav.tRem, tk: J.app.S.nav.tk, eta: document.querySelector('#nb-eta').textContent, dur: document.querySelector('#nb-rem').textContent }));
check('en route : un bouchon de 20 min apparaît, le temps restant augmente d’autant', t1.rem - t0 > 1000 && t1.rem - t0 < 1400, Math.round(t0) + ' s → ' + Math.round(t1.rem) + ' s · arrivée ' + t1.eta);
await flags({ ttDelay: 0 });
console.log('erreurs', t.logs.filter(l => !/GPU stall|GL Driver|ERR_BLOCKED|Failed to load|sprite|Expected value|could not be loaded|fetching the script|AJAXError|503/i.test(l)).slice(0, 4).join(' ; ') || 'aucune');
console.log(res.every(Boolean) ? 'ok   trafic dans les durées' : 'FAIL'); process.exit(res.every(Boolean) ? 0 : 1);
