// Grand écran (ordinateur) sur la vraie carte : itinéraire puis guidage.
import { sleep, idle, closeAll } from './lib.mjs';
import { openLive, GPS, START, drive } from './live.mjs';
const t = await openLive({ init: GPS, w: 1280, h: 800 });
const { page, shot } = t;
await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(2000); await idle(page);
await shot('W01-accueil');
await page.click('#q'); await page.fill('#q', '52.0853, 5.1760'); await page.waitForSelector('#results .row'); await page.click('#results .row >> nth=0');
await page.waitForFunction(() => J.app.S.view === 'place'); await page.click('[data-act="route"]');
await page.waitForFunction(() => J.app.S.routes.length > 0); await idle(page); await sleep(1500);
await shot('W02-itineraire');
await page.click('[data-act="start"]'); await page.waitForFunction(() => !!J.app.S.nav);
await drive(page, { from: 0, to: 3750, step: 25, ms: 40, v: 16 }); await sleep(900); await idle(page);
await shot('W03-guidage');
console.log(t.logs.filter(l => !/GPU stall|GL Driver|Failed to load|fetching the script|Expected value|could not be loaded/.test(l)).join('\n') || 'aucune erreur');
await closeAll();
