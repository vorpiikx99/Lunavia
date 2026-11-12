// Assemble Lunavia : une page pour l'aperçu dans Claude (dist/jalon.html) et un site installable (dist/site/).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const R = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const W = (p, s) => { const f = path.join(ROOT, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); return f; };

const PKG = JSON.parse(R('package.json'));
const VERSION = PKG.version;
const HOME = PKG.homepage || ''; // l'adresse publique de la vraie carte, affichée dans la démo
const SITE = process.env.JALON_SITE || 'dist/site'; // dans le dépôt : JALON_SITE=.. node build.mjs
const ML = JSON.parse(R('node_modules/maplibre-gl/package.json')).version;
const FONTS = 'https://fonts.googleapis.com/css2?family=Barlow:wght@500;600;700&family=Barlow+Condensed:wght@600;700&display=swap';

const mlcss = R('node_modules/maplibre-gl/dist/maplibre-gl.css').replace(/\/\*#\s*sourceMappingURL=.*?\*\//g, '');
const css = R('src/styles.css');
const body = R('src/body.html').trim();
const parts = ['geo', 'icons', 'demo', 'live', 'app'].map(n => R('src/' + n + '.js'));
const js = parts.join('\n').replace(/__VERSION__/g, VERSION).replace(/__HOME__/g, HOME);
if (/<\/script/i.test(js)) throw new Error('le script contient une balise fermante');
if (/<\/style/i.test(css + mlcss)) throw new Error('la feuille de style contient une balise fermante');

/* ---------- 1. page pour l'aperçu dans Claude (artifact) ---------- */
const artifact = [
  '<title>Lunavia</title>',
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<link rel="stylesheet" href="' + FONTS + '">',
  '<style>\n' + mlcss + '\n' + css + '</style>',
  body,
  '<script src="https://cdn.jsdelivr.net/npm/maplibre-gl@' + ML + '/dist/maplibre-gl.js"></script>',
  '<script>\n' + js + '</script>',
  ''
].join('\n');
W('dist/jalon.html', artifact);

/* ---------- 2. site installable (GitHub Pages) ---------- */
const head = [
  '<!doctype html>',
  '<html lang="fr">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
  '<title>Lunavia</title>',
  '<meta name="generator" content="jalon:carte">', // signature de la page, lue par sw.js (« bon voisinage »)
  '<meta name="description" content="Lunavia, la carte qui réunit le meilleur des applis de navigation : recherche, itinéraires, guidage vocal, signalements, prix des carburants.">',
  '<meta name="theme-color" content="#0F4C8A">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="Lunavia">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="icon" href="icons/icon.svg" type="image/svg+xml">',
  '<link rel="icon" href="icons/icon-192.png" sizes="192x192" type="image/png">',
  '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link rel="stylesheet" href="' + FONTS + '" crossorigin="anonymous">',
  '<style>\n' + mlcss + '\n' + css + '</style>',
  '</head>',
  '<body>'
].join('\n');
// L'aide-mémoire hors ligne (sw.js). Si la page a été servie par celui d'un autre site (Lunavia logé dans un dossier
// de ce site), on redemande au nôtre un coup de ménage quelques secondes après son installation : voir sw.js.
const swBoot = [
  '<script>',
  'if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) addEventListener("load", function () {',
  '  var sw = navigator.serviceWorker, was = sw.controller, mine = new URL("sw.js", location.href).href;',
  '  sw.register("sw.js").catch(function () {});',
  '  if (was && was.scriptURL !== mine) setTimeout(function () {',
  '    sw.getRegistration().then(function (r) { if (r && r.active && r.active.scriptURL === mine) r.active.postMessage("voisinage"); }).catch(function () {});',
  '  }, 6000);',
  '});',
  '</script>'
].join('\n');
const site = head + '\n' + body + '\n<script src="vendor/maplibre-gl.js?v=' + ML + '"></script>\n<script>\n' + js + '</script>\n' + swBoot + '\n</body>\n</html>\n';
W(SITE + '/index.html', site);
const STAMP = Date.now().toString(36);
fs.mkdirSync(path.join(ROOT, SITE, 'vendor'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'node_modules/maplibre-gl/dist/maplibre-gl.js'), path.join(ROOT, SITE, 'vendor/maplibre-gl.js'));
for (const f of fs.existsSync(path.join(ROOT, 'site')) ? fs.readdirSync(path.join(ROOT, 'site'), { recursive: true }) : []) {
  const src = path.join(ROOT, 'site', f);
  if (fs.statSync(src).isDirectory()) continue;
  const dst = path.join(ROOT, SITE, f);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (/\.(js|webmanifest|json|html|md|txt)$/.test(f)) fs.writeFileSync(dst, fs.readFileSync(src, 'utf8').replace(/__VERSION__/g, VERSION + '-' + STAMP).replace(/__ML__/g, ML).replace(/__HOME__/g, HOME));
  else fs.copyFileSync(src, dst);
}
console.log('jalon.html', (artifact.length / 1024).toFixed(0) + ' Ko · site/index.html', (site.length / 1024).toFixed(0) + ' Ko · MapLibre ' + ML);
