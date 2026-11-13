// Colonne de boutons de droite : elle ne doit jamais monter sous la barre du haut (ou le panneau de direction),
// même quand le panneau du bas est haut (choix du trajet, menu Options) ou sur un petit téléphone.
import { openLive, GPS, START } from './live.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const check = (l, ok, d) => { res.push(!!ok); console.log((ok ? 'ok   ' : 'FAIL ') + l + (d ? '  ' + d : '')); };
const gap = page => page.evaluate(() => {
  const side = document.querySelector('#side').getBoundingClientRect(), topEl = J.app.S.nav ? document.querySelector('#navsign') : document.querySelector('#top'), t = topEl.getBoundingClientRect();
  const shown = [...document.querySelectorAll('#side .fab')].filter(b => b.offsetParent).map(b => b.id);
  return { gap: Math.round(side.top - t.bottom), shown };
});
for (const [w, h] of [[390, 780], [375, 667]]) {
  const t = await openLive({ init: GPS, w, h }); const { page } = t;
  await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(1200);
  let g = await gap(page);
  check(w + '×' + h + ' accueil : tous les boutons sont là', g.gap >= 8 && g.shown.includes('v3d') && g.shown.includes('theme') && g.shown.includes('layers'), JSON.stringify(g));
  await page.click('#q'); await page.fill('#q', '52.0853, 5.1760'); await page.waitForSelector('#results .row'); await page.click('#results .row >> nth=0');
  await page.waitForFunction(() => J.app.S.view === 'place'); await page.click('[data-act="route"]');
  await page.waitForFunction(() => J.app.S.routes.length > 0 && J.app.S.view === 'route', null, { timeout: 25000 }); await sleep(1000);
  g = await gap(page);
  check(w + '×' + h + ' choix du trajet : la colonne reste sous la barre du haut', g.gap >= 8 && g.shown.includes('reportbtn') && g.shown.includes('locate'), JSON.stringify(g));
  await page.click('#sb-set', { timeout: 4000 }).then(() => check(w + '×' + h + ' le bouton Réglages du haut reste touchable', true), () => check(w + '×' + h + ' le bouton Réglages du haut reste touchable', false));
  await page.click('#sheet [data-act="close"]'); await sleep(400);
  await page.click('[data-act="start"]'); await page.waitForFunction(() => !!J.app.S.nav); await sleep(800);
  await page.click('[data-act="navmenu"]'); await sleep(500);
  g = await gap(page);
  check(w + '×' + h + ' menu Options : la colonne reste sous le panneau de direction', g.gap >= 8 && g.shown.includes('locate'), JSON.stringify(g));
  await page.click('#sheet [data-act="close"]'); await sleep(400);
  g = await gap(page);
  check(w + '×' + h + ' guidage : le bouton 3D revient', g.shown.includes('v3d'), JSON.stringify(g));
}
console.log(res.every(Boolean) ? 'ok   colonne de droite' : 'FAIL'); process.exit(res.every(Boolean) ? 0 : 1);
