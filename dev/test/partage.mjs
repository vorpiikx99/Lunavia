// Signalements partagés : ceux des autres arrivent sur la carte, les miens partent dans la base commune, les votes comptent.
import { openLive, GPS, START, flags } from './live.mjs';
const BED = 'http://127.0.0.1:8003/ygofvzisazupdbstksqp.supabase.co/_rows';
const rows = async o => (await fetch(BED, Object.assign({ headers: { apikey: 'sb_publishable_test' } }, o ? { method: 'POST', body: JSON.stringify(o) } : {}))).json();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const check = (l, ok, d) => { res.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + l + (d ? '  ' + d : '')); };
await rows({ reset: true });
await rows({ add: { type: 'works', lon: START[0] + 0.004, lat: START[1] + 0.002, note: 'voie de gauche neutralisée' } });
await rows({ add: { type: 'jam', lon: START[0] + 3, lat: START[1], note: 'trop loin' } });
const t = await openLive({ init: GPS }); const { page } = t;
await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(2500);
const mine = () => page.evaluate(() => J.app.db.reports.map(r => ({ type: r.type, sh: !!r.sh, sid: r.sid || null, note: r.note || '' })));
let l = await mine();
check('le signalement d’un autre utilisateur arrive, avec son commentaire', l.length === 1 && l[0].sh && l[0].type === 'works' && l[0].note === 'voie de gauche neutralisée', JSON.stringify(l));
check('il est dessiné sur la carte', await page.evaluate(() => document.querySelectorAll('.repm').length === 1));
// je signale à mon tour
await page.click('#reportbtn'); await page.waitForSelector('#rep-note'); await page.fill('#rep-note', 'bouchon au feu'); await page.click('[data-act="rep"][data-k="jam"]'); await sleep(1200);
const srv = await rows(); l = await mine();
check('mon signalement part dans la base commune, avec le commentaire', srv.length === 3 && srv[2].type === 'jam' && srv[2].note === 'bouchon au feu' && Math.abs(srv[2].lon - START[0]) < 0.001, JSON.stringify(srv[2]));
check('et il n’est pas dédoublé chez moi à la synchronisation suivante', await page.evaluate(async () => { J.app.S.pos.ll = J.app.S.pos.ll.slice(); return true; }) && l.filter(r => r.type === 'jam').length === 1 && l.find(r => r.type === 'jam').sid === srv[2].id, JSON.stringify(l.find(r => r.type === 'jam')));
// « plus là » sur celui d'un autre : le vote part, il disparaît chez moi et ne revient pas
await page.click('.repm >> nth=0'); await page.waitForFunction(() => J.app.S.view === 'rep');
const who = await page.evaluate(() => document.querySelector('#sheet').textContent);
const foreign = /autre utilisateur/.test(who);
await page.click('[data-act="rep-no"]'); await sleep(900);
const after = await rows();
check('« plus là » : le vote est compté dans la base', after.some(r => r.no === 1), JSON.stringify(after.map(r => [r.type, r.yes, r.no])));
await page.evaluate(s => { window.__fix(s[1] + 0.0001, s[0], 0, null, 8); }, START); await sleep(400);
await page.click('#sb-set'); await page.waitForSelector('#set-share'); await page.click('label[for="set-share"]'); await sleep(300); await page.click('label[for="set-share"]'); await sleep(1500);
l = await mine();
check('le signalement retiré ne revient pas à la synchronisation', foreign ? !l.some(r => r.sh) : l.filter(r => r.type === 'jam').length === 0, JSON.stringify(l));
// base injoignable : le signalement reste sur l'appareil
await flags({ sbDown: 1 });
await page.evaluate(() => J.app.go('home')); await sleep(200);
await page.click('#reportbtn'); await page.waitForSelector('#rep-note'); await page.click('[data-act="rep"][data-k="danger"]'); await sleep(1200);
l = await mine();
check('base injoignable : le signalement est gardé sur l’appareil', l.some(r => r.type === 'danger' && !r.sid));
await flags({ sbDown: 0 });
console.log('erreurs', t.logs.filter(l => !/GPU stall|GL Driver|ERR_BLOCKED|Failed to load|sprite|Expected value|could not be loaded|fetching the script|tomtom|AJAXError|503/i.test(l)).slice(0, 4).join(' ; ') || 'aucune');
console.log(res.every(Boolean) ? 'ok   signalements partagés' : 'FAIL'); process.exit(res.every(Boolean) ? 0 : 1);
