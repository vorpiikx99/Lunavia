// Recherche par type de lieu (« tabac ») : les plus proches d'abord, même sans « tabac » dans le nom ; « tabac st marcel » cherche
// autour de la commune ; les mentions se replient ; la page passe sous la barre d'état.
import { openLive, GPS, START } from './live.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const check = (l, ok, d) => { res.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + l + (d ? '  ' + d : '')); };
const t = await openLive({ init: GPS, dpr: 2 }); const { page } = t;
await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(800);
// mentions : visibles à l'ouverture, repliées ensuite
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.J && J.app && J.app.S.mode === 'live' && document.querySelector('#attrib .ai'), null, { timeout: 30000 });
const at0 = await page.evaluate(() => document.querySelector('#attrib').classList.contains('open'));
await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START);
await sleep(5600);
const at1 = await page.evaluate(() => ({ open: document.querySelector('#attrib').classList.contains('open'), txt: getComputedStyle(document.querySelector('#attrib .at')).display }));
check('mentions affichées à l’ouverture puis repliées après 5 s', at0 && !at1.open && at1.txt === 'none');
await page.click('#attrib .ai'); await sleep(300);
check('le bouton « i » les réaffiche', await page.evaluate(() => getComputedStyle(document.querySelector('#attrib .at')).display !== 'none'));
await page.screenshot({ path: 'test/out/autour-i.png' });
check('la page est en plein écran sur iPhone (barre d’état transparente)', await page.evaluate(() => document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').content === 'black-translucent'));
// découpage des recherches
const g = await page.evaluate(() => ['tabac', 'tabacs', 'Tabac le plus proche', 'bureau de tabac près de moi', 'tabac st marcel', 'boulangeries', 'garage renault', 'pharmacie de garde', 'cedeo', 'rue du tabac'].map(q => { const r = J.live._t.generic(q); return q + ' → ' + (r ? r.g.label + (r.rest ? ' / ' + r.rest : '') : '—'); }));
console.log('       ' + g.join('\n       '));
check('les mots génériques sont reconnus, les noms propres non', /tabac → Tabac$/m.test(g.join('\n')) && g[2].endsWith('Tabac') && g[3].endsWith('Tabac') && g[7].endsWith('Pharmacie') && g[4].endsWith('Tabac / st marcel') && g[5].endsWith('Boulangerie') && g[8].endsWith('—') && g[9].endsWith('—'));
// tabac autour de moi
const search = async q => {
  await page.click('#q'); await page.fill('#q', ''); await page.type('#q', q, { delay: 50 });
  await page.waitForFunction(() => document.querySelectorAll('#results .row').length > 0 && !document.querySelector('#results .more'), null, { timeout: 20000 });
  await sleep(300);
  return page.evaluate(() => [...document.querySelectorAll('#results .row')].map(r => r.textContent.replace(/\s+/g, ' ').trim()));
};
let rows = await search('tabac');
console.log('       ' + rows.join('\n       '));
check('le plus proche en premier (un tabac de l’annuaire sans enseigne, à 360 m)', /^Tabac/.test(rows[0]) && /Oudegracht/i.test(rows[0]), rows[0]);
check('un tabac dont le nom ne contient pas « tabac » est trouvé', rows.some(r => /Le Balto/.test(r)));
check('le même commerce vu par deux sources n’apparaît qu’une fois', rows.filter(r => /Balto/i.test(r)).length === 1);
check('les commerces fermés ne sont pas proposés', !rows.some(r => /ferm/i.test(r)));
check('le tabac célèbre mais lointain vient après les proches', rows.findIndex(r => /Amsterdam/.test(r)) > rows.findIndex(r => /Bunnik/.test(r)) && rows.findIndex(r => /Bunnik/.test(r)) > 0, rows.map(r => r.slice(0, 18)).join(' | '));
await page.screenshot({ path: 'test/out/autour-tabac.png' });
// tabac dans une autre commune
rows = await search('tabac st marcel');
check('« tabac st marcel » : le tabac de cette commune en premier', /Saint-Marcel/.test(rows[0]), rows[0]);
// un nom propre suit toujours le chemin habituel
rows = await search('oudegracht');
check('une recherche de nom ne passe pas par la recherche par type', rows.length > 0 && !rows.some(r => /^Tabac/.test(r)));
console.log('erreurs', t.logs.filter(l => !/GPU stall|GL Driver|ERR_BLOCKED|Failed to load|sprite|Expected value|could not be loaded|fetching the script|AJAXError|tomtom/i.test(l)).slice(0, 4).join(' ; ') || 'aucune');
console.log(res.every(Boolean) ? 'ok   recherche autour de moi' : 'FAIL'); process.exit(res.every(Boolean) ? 0 : 1);
