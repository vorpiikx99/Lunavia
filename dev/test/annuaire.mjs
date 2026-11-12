// Recherche d'un commerce absent d'OpenStreetMap : l'annuaire officiel le trouve près de moi (cas réel : Cedeo à Narbonne).
import { openLive, GPS } from './live.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const check = (l, ok, d) => { res.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + l + (d ? '  ' + d : '')); };
const NARBONNE = [3.0031, 43.1843];
const t = await openLive({ init: GPS }); const { page } = t;
await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), NARBONNE); await sleep(1500);
await page.click('#q'); await page.type('#q', 'cedeo', { delay: 60 });
await page.waitForFunction(() => document.querySelectorAll('#results .row').length > 0 && !document.querySelector('#results .more'), null, { timeout: 12000 });
const rows = await page.evaluate(() => [...document.querySelectorAll('#results .row')].map(r => r.textContent.replace(/\s+/g, ' ').trim()));
console.log(rows.join('\n'));
check('le Cedeo de Narbonne est proposé en premier', /Cedeo/.test(rows[0]) && /Narbonne/i.test(rows[0]) && /Plaisance/i.test(rows[0]), rows[0]);
check('les magasins fermés ne sont pas proposés', !rows.some(r => /Mistral|Iena/i.test(r)));
check('celui de Paris vient après, pas avant', rows.findIndex(r => /Paris/i.test(r)) > 0);
await page.click('#results .row >> nth=0'); await page.waitForFunction(() => J.app.S.view === 'place');
const pl = await page.evaluate(() => ({ nom: J.app.S.place.name, ll: J.app.S.place.ll }));
check('la fiche s’ouvre au bon endroit', pl.nom === 'Cedeo' && Math.abs(pl.ll[0] - 2.98028) < 0.001 && Math.abs(pl.ll[1] - 43.17031) < 0.001, JSON.stringify(pl));
console.log(res.every(Boolean) ? 'ok   annuaire des commerces' : 'FAIL'); process.exit(res.every(Boolean) ? 0 : 1);
