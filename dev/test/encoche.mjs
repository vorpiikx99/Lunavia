// iPhone avec encoche, appli en plein écran : rien d'important ne passe sous l'heure ou la barre du bas.
import { openLive, GPS, START, drive } from './live.mjs';
import { idle } from './lib.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const check = (l, ok, d) => { res.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + l + (d ? '  ' + d : '')); };
const shots = [];
for (const dark of [true, false]) {
  const t = await openLive({ init: GPS, dpr: 2, notch: true, w: 393, h: 852, dark }); const { page } = t;
  await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(6500); await idle(page);
  const top = await page.evaluate(() => Math.round(document.querySelector('#searchbar').getBoundingClientRect().top));
  check((dark ? 'sombre' : 'clair') + ' : la recherche commence sous l’heure (59 px)', top >= 62, top + ' px');
  check('la carte va jusqu’en haut de l’écran', await page.evaluate(() => document.querySelector('#map').getBoundingClientRect().top === 0));
  shots.push([dark ? 'Noir doux' : 'Carte claire', (await page.screenshot()).toString('base64')]);
  if (!dark) {
    await page.click('#q'); await page.fill('#q', '52.0853, 5.1760'); await page.waitForSelector('#results .row'); await page.click('#results .row >> nth=0');
    await page.waitForFunction(() => J.app.S.view === 'place'); await page.click('[data-act="route"]');
    await page.waitForFunction(() => J.app.S.routes.length > 0, null, { timeout: 25000 }); await sleep(1500);
    await page.click('[data-act="start"]'); await page.waitForFunction(() => !!J.app.S.nav);
    await drive(page, { from: 0, to: 300, step: 12, ms: 80, v: 11 }); await sleep(900);
    const ns = await page.evaluate(() => Math.round(document.querySelector('#navsign').getBoundingClientRect().top));
    check('guidage : le panneau commence sous l’heure', ns >= 62, ns + ' px');
    shots.push(['Guidage', (await page.screenshot()).toString('base64')]);
  }
  if (dark) { /* page suivante */ }
}
const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p2 = await b.newPage({ viewport: { width: 393 * 3 + 24 * 2 + 56, height: 852 + 110 } });
await p2.setContent('<body style="margin:0;background:#16181C;font-family:Arial,sans-serif"><div style="display:flex;gap:24px;padding:28px">' + shots.map(([n, s]) => '<figure style="margin:0"><img src="data:image/png;base64,' + s + '" style="width:393px;border-radius:40px;display:block;box-shadow:0 0 0 1px #3A3E47"><figcaption style="color:#fff;font-size:22px;font-weight:700;text-align:center;padding-top:12px">' + n + '</figcaption></figure>').join('') + '</div></body>');
await p2.screenshot({ path: '/home/claude/jalon/dist/lunavia-plein-ecran.png' }); await b.close();
console.log(res.every(Boolean) ? 'ok   plein écran' : 'FAIL'); process.exit(res.every(Boolean) ? 0 : 1);
