// Recherche : la première source qui répond s'affiche tout de suite, même si l'autre traîne.
import { openLive, GPS, START, flags } from './live.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const check = (l, ok, d) => { res.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + l + (d ? '  ' + d : '')); };
const t = await openLive({ init: GPS }); const { page } = t;
await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(1500);
const rows = () => page.evaluate(() => [...document.querySelectorAll('#results .row b')].map(b => b.textContent));
const timeTo = async (fn, max) => { const t0 = Date.now(); while (Date.now() - t0 < max) { if (await fn()) return Date.now() - t0; await sleep(60); } return -1; };
// 1. cas normal
await page.click('#q'); await page.type('#q', 'biltstr', { delay: 70 });
const t1 = await timeTo(async () => (await rows()).length > 0, 6000);
check('cas normal : des résultats en moins d’une seconde après la dernière lettre', t1 >= 0 && t1 < 1000, t1 + ' ms · ' + (await rows()).slice(0, 2).join(', '));
// 2. la recherche de lieux traîne (5 s) : les adresses arrivent quand même tout de suite
await flags({ photonSlow: 5000 });
await page.fill('#q', ''); await page.type('#q', '12 oudegracht', { delay: 70 });
const t2 = await timeTo(async () => (await rows()).length > 0, 9000), r2 = await rows();
const more = await page.evaluate(() => !!document.querySelector('#results .more'));
check('source lente : les premières réponses s’affichent sans l’attendre', t2 >= 0 && t2 < 1500 && more, t2 + ' ms · ' + r2.slice(0, 2).join(', '));
const t2b = await timeTo(async () => !(await page.evaluate(() => !!document.querySelector('#results .more'))), 9000);
check('puis la liste se complète quand la source lente répond', t2b > 2000 && (await rows()).length >= r2.length, t2b + ' ms · ' + (await rows()).length + ' lignes');
// 3. on efface une lettre puis on la retape : réponse immédiate (déjà vue)
await page.keyboard.press('Backspace'); await sleep(250); await page.type('#q', 't');
const t3 = await timeTo(async () => (await rows()).length > 0 && !(await page.evaluate(() => !!document.querySelector('#results .more'))), 4000);
check('recherche déjà faite : réponse immédiate', t3 >= 0 && t3 < 700, t3 + ' ms');
await flags({ photonSlow: 0 });
// 4. un lieu déjà choisi revient tout de suite, avant même le réseau
await page.fill('#q', 'biltstraat'); await page.waitForSelector('#results .row'); await page.click('#results .row >> nth=0'); await page.waitForFunction(() => J.app.S.view === 'place'); const picked = await page.evaluate(() => J.app.S.place.name);
await page.evaluate(() => J.app.go('home')); await sleep(300);
await flags({ slow: 3000 });
await page.click('#q'); await page.fill('#q', ''); await page.type('#q', picked.slice(0, 5), { delay: 60 });
const t4 = await timeTo(async () => (await rows()).includes(picked), 2500);
check('lieu récent : proposé tout de suite, sans attendre le réseau', t4 >= 0 && t4 < 800, t4 + ' ms · ' + picked);
await flags({ slow: 0 });
console.log(res.every(Boolean) ? 'ok   recherche rapide' : 'FAIL'); process.exit(res.every(Boolean) ? 0 : 1);
