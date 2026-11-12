// Fabrique les icônes de l'appli (PNG) à partir d'un dessin vectoriel.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const pole = '<path d="M-27 236h54v60h-54z" fill="#fff"/><path d="M-27 296h54v60h-54z" fill="#C1121C"/><path d="M-27 356h54l-27 72z" fill="#fff"/><path d="M-27 236h54v120l-27 72-27-72z" fill="none" stroke="#151A21" stroke-width="10" stroke-linejoin="round"/><circle cx="0" cy="168" r="86" fill="#C1121C" stroke="#fff" stroke-width="24"/><circle cx="0" cy="168" r="30" fill="#fff"/>';
const svg = (maskable, round) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
  '<rect width="512" height="512" rx="' + (round ? 112 : 0) + '" fill="#0F4C8A"/>' +
  (maskable ? '' : '<rect x="30" y="30" width="452" height="452" rx="' + (round ? 86 : 40) + '" fill="none" stroke="#fff" stroke-width="12"/>') +
  '<g transform="translate(256 ' + (maskable ? 262 : 256) + ') scale(' + (maskable ? 0.74 : 0.92) + ') translate(0 -300)">' + pole + '</g></svg>';
const out = '/home/claude/jalon/site/icons/';
fs.writeFileSync(out + 'icon.svg', svg(false, true));
const b = await chromium.launch();
for (const [name, size, mask, round, alpha] of [['icon-192.png', 192, false, true, true], ['icon-512.png', 512, false, true, true], ['maskable-512.png', 512, true, false, false], ['apple-touch-icon.png', 180, false, false, false]]) {
  const p = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await p.setContent('<style>html,body{margin:0;background:transparent}svg{display:block;width:' + size + 'px;height:' + size + 'px}</style>' + svg(mask, round));
  await p.screenshot({ path: out + name, omitBackground: alpha, clip: { x: 0, y: 0, width: size, height: size } });
  await p.close();
}
await b.close();
console.log(fs.readdirSync(out).map(f => f + ' ' + fs.statSync(out + f).size).join(' · '));
