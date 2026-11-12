// Captures soignées de la vraie carte (banc d'essai), réunies en une image à montrer.
import { sleep, idle, closeAll, launch } from './lib.mjs';
import { openLive, GPS, START, drive } from './live.mjs';
import fs from 'fs';
const out = '/home/claude/jalon/test/out/';
const t = await openLive({ init: GPS, dpr: 2 });
const { page } = t;
await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(2200); await idle(page);
await page.click('#q'); await page.fill('#q', 'universiteit'); await page.waitForSelector('#results .row'); await sleep(500);
const names = await page.$$eval('#results .row', els => els.map(e => e.innerText.split('\n')[0]));
console.log('résultats', names.join(' | '));
await page.fill('#q', '52.0853, 5.1760'); await page.waitForSelector('#results .row'); await sleep(300); await page.click('#results .row >> nth=0');
await page.waitForFunction(() => J.app.S.view === 'place');
await page.evaluate(() => { J.app.S.place.name = 'Campus universitaire'; J.app.S.place.sub = 'Utrecht'; });
await page.click('[data-act="route"]');
await page.waitForFunction(() => J.app.S.routes.length > 0); await idle(page); await sleep(2500); await idle(page);
await page.screenshot({ path: out + 'V1.png' });
await page.click('[data-act="start"]'); await page.waitForFunction(() => !!J.app.S.nav);
await drive(page, { from: 0, to: 3760, step: 22, ms: 40, v: 18.6 }); await sleep(1500); await idle(page); await sleep(800);
await page.screenshot({ path: out + 'V2.png' });
await page.click('[data-act="stop"]'); await sleep(300); await page.click('[data-act="close"]'); await sleep(200); await page.click('[data-act="close"]').catch(() => {}); await sleep(300);
await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), [5.1247, 52.0789]); await sleep(600);
await page.click('#locate'); await sleep(900);
await page.click('[data-act="cat"][data-k="fuel"]'); await page.waitForFunction(() => J.app.S.poi && J.app.S.poi.items); await idle(page, 15000); await sleep(6000); await idle(page, 15000); await sleep(1500);
await page.screenshot({ path: out + 'V3.png' });
await t.ctx.close();
// planche : trois écrans côte à côte
const b = await launch();
const p = await b.newPage({ viewport: { width: 1330, height: 900 }, deviceScaleFactor: 2 });
const img = n => 'data:image/png;base64,' + fs.readFileSync(out + n).toString('base64');
await p.setContent(`<style>body{margin:0;background:#EDEFE9;font:600 17px system-ui,sans-serif;color:#151A21}
.w{display:flex;gap:34px;justify-content:center;padding:36px 30px 30px}.c{display:grid;gap:14px;justify-items:center}
.c img{width:390px;height:780px;border-radius:30px;box-shadow:0 14px 40px rgba(21,26,33,.25);border:5px solid #151A21;display:block}
.c span{font-size:17px}</style><div class="w">
<div class="c"><img src="${img('V1.png')}"><span>Choix du trajet</span></div>
<div class="c"><img src="${img('V2.png')}"><span>Guidage, voies et limitation</span></div>
<div class="c"><img src="${img('V3.png')}"><span>Prix des carburants</span></div></div>`);
await p.waitForTimeout(500);
await p.screenshot({ path: '/home/claude/jalon/dist/jalon-vraie-carte.png' });
await closeAll();
console.log('planche', fs.statSync('/home/claude/jalon/dist/jalon-vraie-carte.png').size);
