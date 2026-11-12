// Limitation estimée (règle générale française) quand la carte ne connaît pas le panneau.
import { openLive, GPS, START } from './live.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const t = await openLive({ init: GPS }); const { page, shot } = t;
await page.evaluate(s => window.__fix(s[1], s[0], 0, null, 8), START); await sleep(1500);
const r = await page.evaluate(() => { const T = J.live._t, g = T.guessWay; return {
  autoroute: g({ highway: 'motorway' }), bretelle: g({ highway: 'motorway_link' }), voieRapide: g({ highway: 'trunk', oneway: 'yes' }), nationale: g({ highway: 'trunk' }),
  departementale: g({ highway: 'secondary' }), enVille: g({ highway: 'secondary', lit: 'yes' }), zone: g({ highway: 'tertiary', 'maxspeed:type': 'FR:urban' }), rue: g({ highway: 'residential' }),
  rencontre: g({ highway: 'living_street' }), chemin: g({ highway: 'track' }), france: [T.inFrance([2.87, 43.27]), T.inFrance([5.11, 52.09])],
  valhalla: [T.frDefault('motorway', false), T.frDefault('tertiary', true), T.frDefault('tertiary', false), T.frDefault('link', false)] }; });
console.log(JSON.stringify(r));
const want = { autoroute: 130, bretelle: null, voieRapide: 110, nationale: 80, departementale: 80, enVille: 50, zone: 50, rue: 50, rencontre: 20, chemin: null };
let ok = Object.keys(want).every(k => r[k] === want[k]) && r.france[0] === true && r.france[1] === false && r.valhalla.join() === '130,50,80,';
await page.evaluate(() => { const b = document.querySelector('#speed'), l = document.querySelector('#limit'); b.hidden = false; l.hidden = false; l.textContent = '80'; l.classList.add('est'); document.querySelector('#speedo b').textContent = '76'; });
await shot('limite-estimee');
console.log(ok ? 'ok   limites estimées' : 'FAIL limites estimées'); process.exit(ok ? 0 : 1);
