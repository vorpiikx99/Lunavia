// Parcours complet de la ville de démonstration (ce que l'on voit dans l'aperçu Claude).
import { open, idle, sleep, state, closeAll } from './lib.mjs';

const dark = process.argv.includes('--dark'), wide = process.argv.includes('--wide');
const tag = (wide ? 'w-' : 'p-') + (dark ? 'd-' : 'l-');
const t = await open({ dark, w: wide ? 1280 : 390, h: wide ? 800 : 780, dpr: 1 });
const { page, logs, shot } = t;
const step = async (name, fn) => { try { await fn(); console.log('ok   ' + name, JSON.stringify(await state(page))); } catch (e) { console.log('FAIL ' + name + ' :: ' + e.message.split('\n')[0]); } };

await step('accueil', async () => { await shot(tag + '01-accueil'); });
await step('trajet d’essai', async () => {
  await page.click('[data-act="demo-trip"]');
  await page.waitForFunction(() => J.app.S.routes.length > 0, null, { timeout: 8000 });
  await idle(page); await sleep(1100); await shot(tag + '02-itineraire');
});
await step('feuille de route', async () => {
  await page.click('.steps summary'); await sleep(200); await shot(tag + '03-feuille');
  await page.click('.steps summary');
});
await step('autre trajet', async () => {
  const n = await page.locator('.alt').count();
  if (n > 1) { await page.click('.alt >> nth=1'); await sleep(300); await shot(tag + '04-alternative'); await page.click('.alt >> nth=0'); }
});
await step('démarrer', async () => {
  await page.click('[data-act="sim"]');
  await sleep(2600); await shot(tag + '05-guidage');
});
await step('guidage, plus loin', async () => {
  await page.click('[data-act="sim-speed"]'); // ×4
  await sleep(6000); await shot(tag + '06-guidage-2');
});
await step('signaler pendant le guidage', async () => {
  await page.click('#reportbtn'); await sleep(250); await shot(tag + '07-signaler');
  await page.click('[data-act="rep"][data-k="danger"]'); await sleep(300);
});
await step('arrivée', async () => {
  await page.evaluate(() => { J.app.S.sim.mult = 40; });
  await page.waitForFunction(() => J.app.S.view === 'arrived', null, { timeout: 60000 });
  await sleep(900); await shot(tag + '08-arrivee');
  await page.click('[data-act="park"]').catch(() => {});
  await sleep(300);
});
await step('recherche', async () => {
  await page.click('#q'); await sleep(200); await shot(tag + '09-recherche-vide');
  await page.fill('#q', 'boulang'); await sleep(700); await shot(tag + '10-recherche');
  await page.click('#results .row >> nth=0'); await idle(page); await sleep(900); await shot(tag + '11-fiche');
});
await step('enregistrer', async () => { await page.click('[data-act="save"]'); await sleep(150); await shot(tag + '12-enregistrer'); await page.click('[data-act="save-as"][data-k="fav"]'); await sleep(150); });
await step('itinéraire à pied', async () => {
  await page.click('[data-act="route"]'); await page.waitForFunction(() => J.app.S.routes.length > 0, null, { timeout: 8000 });
  await page.click('[data-act="mode"][data-k="foot"]'); await sleep(900); await idle(page); await shot(tag + '13-a-pied');
  await page.click('[data-act="mode"][data-k="bike"]'); await sleep(900); await idle(page);
  await page.click('[data-act="close"]'); await sleep(200); await page.click('[data-act="close"]'); await sleep(200);
});
await step('essence', async () => {
  await page.click('[data-act="cat"][data-k="fuel"]'); await page.waitForFunction(() => J.app.S.poi && J.app.S.poi.items, null, { timeout: 8000 });
  await idle(page); await sleep(1000); await shot(tag + '14-essence');
  await page.click('#sheet .row >> nth=0'); await idle(page); await sleep(700); await shot(tag + '15-station');
  await page.click('[data-act="close"]'); await sleep(200); await page.click('[data-act="close"]'); await sleep(300);
});
await step('toucher la carte', async () => {
  const vp = page.viewportSize();
  await page.mouse.click(vp.width * 0.6, vp.height * 0.38); await sleep(900); await shot(tag + '16-point');
  await page.click('[data-act="close"]'); await sleep(200);
});
await step('réglages', async () => { await page.click('#sb-set'); await sleep(250); await shot(tag + '17-reglages'); await page.evaluate(() => { document.querySelector('#sheet-in').scrollTop = 600; }); await sleep(150); await shot(tag + '18-reglages-2'); await page.click('[data-act="close"]'); });
await step('à propos de la démo', async () => { await page.click('#demoflag'); await sleep(250); await shot(tag + '19-demo'); await page.click('[data-act="close"]'); });

console.log('--- journal ---\n' + (logs.join('\n') || '(aucune erreur)'));
console.log('bloqués :', [...new Set(t.blocked)].join(' | ') || '(rien)');
await closeAll();
