// Outils de test : ouvre Jalon dans Chrome sans tête, avec le réseau entièrement simulé.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = p => fs.readFileSync(path.join(ROOT, p));
const ARGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

// squelette identique à celui que la publication ajoute autour de la page
const SKEL = content => '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>' + content + '</body></html>';

const FONT_FILES = {
  'barlow-500': '@fontsource/barlow/files/barlow-latin-500-normal.woff2',
  'barlow-600': '@fontsource/barlow/files/barlow-latin-600-normal.woff2',
  'barlow-700': '@fontsource/barlow/files/barlow-latin-700-normal.woff2',
  'barlowc-600': '@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2',
  'barlowc-700': '@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2'
};
const FONT_CSS = Object.keys(FONT_FILES).map(k => {
  const [fam, w] = k.split('-');
  return "@font-face{font-family:'" + (fam === 'barlow' ? 'Barlow' : 'Barlow Condensed') + "';font-style:normal;font-weight:" + w + ";font-display:swap;src:url(https://fonts.gstatic.com/t/" + k + ".woff2) format('woff2')}";
}).join('\n');

const CSP = "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://cdn.tailwindcss.com https://code.jquery.com blob:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' data: blob:; worker-src blob:; child-src blob:";
let browser = null;
export async function launch() {
  if (!browser) browser = await chromium.launch(process.env.PWDEFAULT ? {} : { executablePath: '/usr/bin/google-chrome', headless: true, args: process.env.GLARGS ? process.env.GLARGS.split(' ') : ARGS });
  return browser;
}
export async function closeAll() { if (browser) { await browser.close(); browser = null; } }

/* opts : { w, h, dpr, dark, mobile, kind: 'artifact' | 'site', hash, handlers: [(url, route, req) => bool], geo: {latitude, longitude}, storage } */
export async function open(opts = {}) {
  const b = await launch();
  const ctx = await b.newContext({
    viewport: { width: opts.w || 390, height: opts.h || 780 },
    deviceScaleFactor: opts.dpr || 1,
    isMobile: opts.mobile !== false && (opts.w || 390) < 700,
    hasTouch: opts.mobile !== false && (opts.w || 390) < 700,
    colorScheme: opts.dark ? 'dark' : 'light',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    geolocation: opts.geo || undefined,
    permissions: opts.geo ? ['geolocation'] : []
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + t); });
  page.on('pageerror', e => logs.push('PAGEERROR ' + (e.stack || e.message)));
  const blocked = [];
  const kind = opts.kind || 'artifact';
  const base = 'https://app.test/';
  await page.route('**/*', async route => {
    const req = route.request(), u = req.url();
    try {
      if (u === base || u.startsWith(base + '#') || u.startsWith(base + '?')) {
        const html = kind === 'artifact' ? SKEL(rd('dist/jalon.html').toString('utf8')) : rd('dist/site/index.html').toString('utf8');
        // l'aperçu dans Claude n'autorise que quelques hôtes de scripts et de polices : on reproduit ce cadre au plus près
        const headers = kind === 'artifact' && !opts.noCsp ? { 'content-security-policy': CSP } : {};
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html, headers });
      }
      if (u.startsWith(base)) {
        const f = path.join(ROOT, 'dist/site', decodeURIComponent(u.slice(base.length).split(/[?#]/)[0]));
        if (kind === 'site' && fs.existsSync(f) && fs.statSync(f).isFile()) {
          const ext = path.extname(f), ct = { '.js': 'application/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.html': 'text/html' }[ext] || 'application/octet-stream';
          return route.fulfill({ contentType: ct, body: fs.readFileSync(f) });
        }
        return route.fulfill({ status: 404, body: 'not found' });
      }
      if (u.includes('cdn.jsdelivr.net/npm/maplibre-gl@')) return route.fulfill({ contentType: 'application/javascript', body: rd('node_modules/maplibre-gl/dist/maplibre-gl.js') });
      if (u.startsWith('https://fonts.googleapis.com/')) return route.fulfill({ contentType: 'text/css', body: FONT_CSS });
      if (u.startsWith('https://fonts.gstatic.com/t/')) { const k = u.split('/t/')[1].replace('.woff2', ''); return route.fulfill({ contentType: 'font/woff2', body: rd('node_modules/' + FONT_FILES[k]) }); }
      for (const h of opts.handlers || []) { if (await h(u, route, req)) return; }
      if (!/^(data|blob):/.test(u)) blocked.push(u);
      return route.abort('blockedbyclient');
    } catch (e) { logs.push('ROUTE ' + u + ' ' + e.message); try { await route.abort(); } catch (x) { /* déjà traité */ } }
  });
  if (opts.storage) await page.addInitScript(s => { try { localStorage.setItem('jalon.v1', s); } catch (e) { /* rien */ } }, JSON.stringify(opts.storage));
  if (opts.init) await page.addInitScript(opts.init);
  // la synthèse vocale n'existe pas ici : on note ce qui aurait été dit
  await page.addInitScript(() => {
    window.__said = [];
    try {
      const fake = { speak(u) { window.__said.push(u.text); }, cancel() {}, getVoices() { return []; }, addEventListener() {} };
      Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
      window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    } catch (e) { /* rien */ }
  });
  await page.goto(base + (opts.hash || ''));
  await page.waitForFunction(() => window.J && J.app && J.app.map && J.app.S.mode !== 'boot', null, { timeout: 20000 }).catch(() => logs.push('TIMEOUT boot'));
  await idle(page);
  return { page, ctx, logs, blocked, shot: (name, o) => page.screenshot(Object.assign({ path: path.join(ROOT, 'test/out', name + '.png') }, o || {})) };
}
export async function idle(page, ms) {
  await page.evaluate(t => new Promise(res => {
    const m = J.app.map; let done = false;
    const fin = () => { if (!done) { done = true; res(); } };
    if (!m) return fin();
    const chk = () => { if (m.loaded() && !m.isMoving()) setTimeout(fin, 120); else m.once('idle', () => setTimeout(fin, 120)); };
    setTimeout(chk, 60); setTimeout(fin, t);
  }), ms || 6000).catch(() => {});
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const state = page => page.evaluate(() => { const S = J.app.S; return { mode: S.mode, view: S.view, nav: !!S.nav, sim: !!S.sim, routes: S.routes.length, sel: S.sel, follow: S.follow, pos: S.pos && S.pos.ll, poi: S.poi && { cat: S.poi.cat, n: S.poi.items && S.poi.items.length }, said: window.__said.slice(-6) }; });
fs.mkdirSync(path.join(ROOT, 'test/out'), { recursive: true });
