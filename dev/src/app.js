/* ---------- Lunavia : l'application ---------- */
(function () {
  'use strict';
  const G = J.geo, F = J.fmt, fr = J.fr, ic = J.ic;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // écran large, ou téléphone couché : le panneau passe dans le coin bas gauche au lieu d'occuper tout le bas
  const WIDE = window.matchMedia('(min-width:760px), (orientation:landscape) and (max-height:520px) and (min-width:560px)');
  const app = $('#app'), sheet = $('#sheet'), sheetIn = $('#sheet-in'), mapEl = $('#map'), input = $('#q');

  const CATS = [
    { id: 'fuel', label: 'Essence', icon: 'fuel' }, { id: 'charge', label: 'Recharge', icon: 'bolt' }, { id: 'parking', label: 'Parking', icon: 'park' },
    { id: 'food', label: 'Restos', icon: 'food' }, { id: 'shop', label: 'Courses', icon: 'cart' }, { id: 'pharma', label: 'Pharmacie', icon: 'cross' }
  ];
  const KIND_IC = { fuel: 'fuel', charge: 'bolt', parking: 'park', food: 'food', shop: 'cart', pharma: 'cross', street: 'route', town: 'pin', home: 'home', work: 'work', pin: 'pin', other: 'pin', address: 'pin' };
  const REPORTS = {
    jam: { label: 'Bouchon', said: 'Bouchon signalé', ttl: 45 }, crash: { label: 'Accident', said: 'Accident signalé', ttl: 90 }, danger: { label: 'Danger', said: 'Danger signalé', ttl: 120 },
    works: { label: 'Travaux', said: 'Travaux signalés', ttl: 1440 }, control: { label: 'Zone de contrôle', said: 'Zone de contrôle signalée', ttl: 60 }, closed: { label: 'Route fermée', said: 'Route fermée signalée', ttl: 1440 }
  };
  const FUELS = { gazole: 'Gazole', e10: 'SP95-E10', sp95: 'SP95', sp98: 'SP98', e85: 'E85', gpl: 'GPL' };
  const MODES = { car: { label: 'Voiture', icon: 'car' }, bike: { label: 'Vélo', icon: 'bike' }, foot: { label: 'À pied', icon: 'walk' } };
  const EMPTY = { type: 'FeatureCollection', features: [] };

  const S = { mode: 'boot', view: 'home', prev: 'home', back: 'home', pos: null, real: null, follow: false, base: 'plan', travel: 'car', routes: [], sel: 0, dest: null, origin: null, place: null, nav: null, sim: null, pick: null, poi: null, q: '', results: null, busy: false, saveMenu: false, wipe: false, limit: null, alertRp: null, freeAlerted: {}, routeSeq: 0, poiSeq: 0, watch: null, arrived: null, rep: null, shareText: '' };
  let map = null, P = null, D = null, db = null;
  const M = { puck: null, dest: null, org: null, pois: [], reps: new Map(), parked: null };
  const SRC = { route: EMPTY, alts: EMPTY, acc: EMPTY };
  const REG = [];
  const reg = p => REG.push(p) - 1;

  // l'adresse publique de la vraie carte (reprise de package.json au montage), pour la proposer depuis la démo
  const HOME = /^https:\/\//.test('__HOME__') ? '__HOME__' : '', HOME_TXT = HOME.replace(/^https:\/\//, '').replace(/\/$/, '');

  /* ---------- mémoire de l'appareil ---------- */
  const KEY = 'jalon.v1';
  const DEFSET = { voice: true, beep: true, tolls: false, hw: false, conso: 6.5, prix: 1.75, fuel: 'gazole', zones: true, traffic: true, tkey: '', share: true };
  function load() {
    let d = {};
    try { d = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { d = {}; }
    return { gone: Array.isArray(d.gone) ? d.gone.slice(-200) : [], home: d.home || null, work: d.work || null, favs: Array.isArray(d.favs) ? d.favs : [], recents: Array.isArray(d.recents) ? d.recents : [], reports: Array.isArray(d.reports) ? d.reports.filter(r => r && REPORTS[r.type] && Array.isArray(r.ll)) : [], parked: d.parked || null, last: Array.isArray(d.last) ? d.last : null, set: Object.assign({}, DEFSET, d.set || {}) };
  }
  let saveT = 0;
  function save() { if (S.mode !== 'live') return; try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* stockage indisponible : l'appli continue sans mémoire */ } }
  function saveSoon() { clearTimeout(saveT); saveT = setTimeout(save, 4000); }
  const strip = (p, kind) => ({ id: p.id, name: p.name, sub: p.sub || '', ll: [+p.ll[0].toFixed(6), +p.ll[1].toFixed(6)], kind: kind || p.kind || 'pin', cat: p.cat || 'other', extra: {} });
  const same = (a, b) => a && b && (a.id === b.id || G.hav(a.ll, b.ll) < 12);
  const isFav = p => db.favs.some(f => same(f, p));
  function addRecent(p) { db.recents = [strip(p)].concat(db.recents.filter(r => !same(r, p))).slice(0, 6); save(); }

  /* ---------- petits outils d'interface ---------- */
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const isDark = () => { const t = document.documentElement.getAttribute('data-theme'); return t ? t === 'dark' : !!(mq && mq.matches); };
  let toastT = 0;
  function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms || 3600); }
  let voice = null;
  function pickVoice() { try { const vs = speechSynthesis.getVoices(); voice = vs.find(v => /^fr[-_]FR/i.test(v.lang) && v.localService) || vs.find(v => /^fr/i.test(v.lang)) || null; } catch (e) { voice = null; } }
  let sayT = 0, lastU = null;
  function say(text, urgent) {
    S.lastSaid = text;
    if (!db.set.voice || !text) return;
    try {
      if (!('speechSynthesis' in window)) return;
      const sp = speechSynthesis, u = new SpeechSynthesisUtterance(text);
      u.lang = 'fr-FR'; u.rate = 1.03;
      if (voice) u.voice = voice;
      lastU = u; // gardée en mémoire : certains navigateurs coupent une phrase dont l'objet a été libéré
      clearTimeout(sayT);
      if (urgent && (sp.speaking || sp.pending)) {
        sp.cancel();
        sayT = setTimeout(() => { try { sp.speak(u); } catch (e) { /* rien */ } }, 90); // Android avale la phrase si elle suit l'arrêt de trop près
      } else sp.speak(u);
    } catch (e) { /* pas de synthèse vocale ici : le texte reste affiché */ }
  }
  let actx = null;
  function beep() {
    try {
      if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; actx = new AC(); }
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(660, t + 0.16);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.36);
    } catch (e) { /* pas de son ici */ }
  }
  let wl = null;
  /* Écran allumé pendant le guidage. Le verrou du navigateur peut être refusé ou relâché (appli passée en arrière-plan,
     économie d'énergie) : on le redemande dès que l'appli revient à l'écran et on le surveille. S'il n'existe pas ou
     échoue, une minuscule vidéo muette qui tourne en boucle empêche la mise en veille. */
  let wantAwake = false, nsv = null;
  const NSV = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAANebW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAC7gAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAoh0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAC7gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAu4AAAAAAABAAAAAAIAbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAAeABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABq21pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAWtzdGJsAAAAt3N0c2QAAAAAAAAAAQAAAKdhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2MC4zMS4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAALWF2Y0MBQsAK/+EAFWdCwAraewEQAAADABAAAAMAoPEiagEABWjOA5yAAAAAEHBhc3AAAAABAAAAAQAAABRidHJ0AAAAAAAACAIAAAgCAAAAGHN0dHMAAAAAAAAAAQAAAA8AAAgAAAAAFHN0c3MAAAAAAAAAAQAAAAEAAAAcc3RzYwAAAAAAAAABAAAAAQAAAA8AAAABAAAAUHN0c3oAAAAAAAAAAAAAAA8AAAKDAAAACQAAAAkAAAAJAAAACQAAAAkAAAAJAAAACQAAAAkAAAAJAAAACQAAAAkAAAAJAAAACQAAAAkAAAAUc3RjbwAAAAAAAAABAAADjgAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNjAuMTYuMTAwAAAACGZyZWUAAAMJbWRhdAAAAm0GBf//adxF6b3m2Ui3lizYINkj7u94MjY0IC0gY29yZSAxNjQgcjMxMDggMzFlMTlmOSAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMjMgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0wIHJlZj0xIGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDE6MHgxIG1lPWhleCBzdWJtZT0yIHBzeT0xIHBzeV9yZD0xLjAwOjAuMDAgbWl4ZWRfcmVmPTAgbWVfcmFuZ2U9MTYgY2hyb21hX21lPTEgdHJlbGxpcz0wIDh4OGRjdD0wIGNxbT0wIGRlYWR6b25lPTIxLDExIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0PTAgdGhyZWFkcz0xIGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MCB3ZWlnaHRwPTAga2V5aW50PTI1MCBrZXlpbnRfbWluPTUgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD0xMCByYz1jcmYgbWJ0cmVlPTEgY3JmPTQwLjAgcWNvbXA9MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MToxLjAwAIAAAAAOZYiEBH///w9FAAEEP4AAAAAFQZogEfUAAAAFQZpAEfUAAAAFQZpgEfUAAAAFQZqAEfUAAAAFQZqgEfUAAAAFQZrAEfUAAAAFQZrgEfUAAAAFQZsAEfUAAAAFQZsgEfUAAAAFQZtAEfUAAAAFQZtgEfUAAAAFQZuAEfUAAAAFQZugEPUAAAAFQZvAP9Q=';
  function videoAwake(on) {
    try {
      if (on) {
        if (!nsv) { nsv = document.createElement('video'); nsv.muted = true; nsv.loop = true; nsv.setAttribute('playsinline', ''); nsv.setAttribute('muted', ''); nsv.setAttribute('aria-hidden', 'true'); nsv.src = NSV; nsv.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:.01;pointer-events:none;z-index:1'; document.body.appendChild(nsv); }
        const pr = nsv.play(); if (pr && pr.catch) pr.catch(() => {});
      } else if (nsv) { nsv.pause(); nsv.remove(); nsv = null; }
    } catch (e) { /* pas de vidéo possible ici */ }
  }
  async function wake(on) {
    wantAwake = !!on;
    if (!on) { videoAwake(false); if (wl) { const w = wl; wl = null; try { await w.release(); } catch (e) { /* déjà relâché */ } } return; }
    if (!('wakeLock' in navigator)) { videoAwake(true); return; }
    if (wl) return;
    try {
      const w = await navigator.wakeLock.request('screen');
      wl = w; videoAwake(false);
      w.addEventListener('release', () => { if (wl === w) wl = null; if (wantAwake && document.visibilityState === 'visible') setTimeout(() => wake(true), 300); });
      if (!wantAwake) wake(false);
    } catch (e) { wl = null; videoAwake(true); }
  }
  document.addEventListener('visibilitychange', () => { if (wantAwake && document.visibilityState === 'visible') wake(true); });
  setInterval(() => { if (wantAwake && !wl && document.visibilityState === 'visible') wake(true); }, 15000);
  function fail(msg, demo) {
    mapEl.innerHTML = '<div class="fail"><div>' + J.logo + '<p>' + esc(msg) + '</p><div class="actions"><button type="button" class="btn primary" data-act="reload">Réessayer</button>' + (demo ? '<button type="button" class="btn" data-act="force-demo">Voir la démo</button>' : '') + '</div></div></div>';
    sheet.hidden = true; $('#ui').hidden = true;
    hideSplash();
  }
  const center = () => { const c = map.getCenter(); return [c.lng, c.lat]; };
  function syncInsets() {
    const wide = WIDE.matches;
    app.style.setProperty('--sheet-h', (wide || sheet.hidden ? 0 : sheet.offsetHeight) + 'px');
    app.style.setProperty('--sheet-w', (sheet.hidden ? -16 : sheet.offsetWidth) + 'px');
  }
  function pad() {
    const wide = WIDE.matches, H = mapEl.clientHeight || 600, Wd = mapEl.clientWidth || 360;
    const topEl = S.nav ? $('#navsign') : $('#top');
    let top = (topEl && !topEl.hidden ? topEl.getBoundingClientRect().bottom : 0) + 18, bottom = (wide || sheet.hidden ? 0 : sheet.offsetHeight) + 26;
    let left = wide && !sheet.hidden ? Math.round(sheet.getBoundingClientRect().right) + 24 : 34, right = 80;
    if (top + bottom > H - 110) { const k = (H - 110) / (top + bottom); top *= k; bottom *= k; }
    if (left + right > Wd - 80) { left = 24; right = 24; }
    return { top: Math.max(0, top), bottom: Math.max(0, bottom), left, right };
  }
  // décalage à donner au centre pour qu'un point tombe au milieu de la partie visible de la carte
  // (la marge interne de la carte reste toujours à zéro : sinon elle s'additionne d'un cadrage à l'autre)
  function off() { const p = pad(); return [(p.left - p.right) / 2, (p.top - p.bottom) / 2]; }

  /* ---------- carte : fond, calques de l'itinéraire, repères ---------- */
  // une fois le guidage lancé, le trajet passe en violet lumineux (sans halo : rien ne dépasse de la route)
  const COL = () => { const d = isDark(), c = d ? { line: '#4C9AF7', casing: '#0B2748', done: '#56616F', alt: '#5F7EA6', altc: '#27384F' } : { line: '#1E6FD9', casing: '#0B3D78', done: '#93A1B3', alt: '#A9C2E3', altc: '#6F8FBA' }; if (S.nav) { c.line = d ? '#B7A0FF' : '#7D5BFF'; c.casing = d ? '#6E4CFF' : '#3F23C4'; } return c; };
  const CLEAR = 'rgba(255,255,255,0)';
  const coreGrad = f => ['step', ['line-progress'], CLEAR, Math.max(0, Math.min(0.9999, f || 0)), S.nav ? 'rgba(255,255,255,.85)' : CLEAR];
  function routeColors() {
    if (!map || !map.getLayer('route')) return;
    const f = S.nav ? S.nav.s / S.nav.route.dist : 0;
    try { map.setPaintProperty('route-case', 'line-color', COL().casing); map.setPaintProperty('route', 'line-gradient', grad(f)); if (map.getLayer('route-core')) map.setPaintProperty('route-core', 'line-gradient', coreGrad(f)); } catch (e) { /* style en cours de changement */ }
  }
  const LW = x => ['interpolate', ['linear'], ['zoom'], 6, 3 + x * 0.5, 12, 5 + x * 0.8, 16, 8 + x, 19, 15 + x];
  const grad = f => ['step', ['line-progress'], COL().done, Math.max(0, Math.min(0.9999, f || 0)), COL().line];
  const line = (geom, props) => ({ type: 'Feature', properties: props || {}, geometry: { type: 'LineString', coordinates: geom } });
  function setSrc(id, data) { SRC[id] = data; const s = map && map.getSource(id); if (s) s.setData(data); }
  let gradT = 0;
  function setGrad(f, now) {
    const t = Date.now();
    if (!now && t - gradT < 450) return;
    gradT = t;
    if (map.getLayer('route')) map.setPaintProperty('route', 'line-gradient', grad(f));
    if (map.getLayer('route-core')) map.setPaintProperty('route-core', 'line-gradient', coreGrad(f));
  }
  function anchor() {
    if (S.mode !== 'live') return undefined;
    const L = (map.getStyle() || {}).layers || [];
    let last = -1;
    L.forEach((l, i) => { if (l['source-layer'] === 'transportation' || l['source-layer'] === 'building' || l.type === 'fill-extrusion') last = i; });
    for (let i = last + 1; i < L.length; i++) if (L[i].type === 'symbol') return L[i].id;
    return undefined;
  }
  function overlays() {
    if (!map || !map.getStyle()) return;
    const c = COL(), before = anchor();
    const src = (id, def) => { if (!map.getSource(id)) map.addSource(id, def); };
    const lay = def => { if (!map.getLayer(def.id)) map.addLayer(def, before && map.getLayer(before) ? before : undefined); };
    const round = { 'line-cap': 'round', 'line-join': 'round' };
    if (S.mode === 'live') {
      // écrans très fins (téléphones) : on demande les photos un cran plus détaillées, sinon elles sont étirées et floues
      src('sat', { type: 'raster', tiles: [J.live.ORTHO], tileSize: (window.devicePixelRatio || 1) >= 1.5 ? 128 : 256, maxzoom: 19 });
      lay({ id: 'sat', type: 'raster', source: 'sat', layout: { visibility: S.base === 'sat' ? 'visible' : 'none' } });
    }
    if (S.mode === 'live' && trafficOn()) {
      src('traffic', { type: 'raster', tiles: ['https://api.tomtom.com/maps/orbis/traffic/flow/raster/tile/{z}/{x}/{y}?apiVersion=2&key=' + encodeURIComponent(tkey()) + '&style=' + (isDark() ? 'dark' : 'light') + '&tileSize=512'], tileSize: 512, minzoom: 6, maxzoom: 20, attribution: '© TomTom' });
      lay({ id: 'traffic', type: 'raster', source: 'traffic', paint: { 'raster-opacity': 0.85 } });
    }
    src('acc', { type: 'geojson', data: SRC.acc });
    lay({ id: 'acc', type: 'fill', source: 'acc', paint: { 'fill-color': c.line, 'fill-opacity': 0.14 } });
    src('alts', { type: 'geojson', data: SRC.alts });
    lay({ id: 'alts-case', type: 'line', source: 'alts', layout: round, paint: { 'line-color': c.altc, 'line-width': LW(3) } });
    lay({ id: 'alts', type: 'line', source: 'alts', layout: round, paint: { 'line-color': c.alt, 'line-width': LW(0) } });
    src('route', { type: 'geojson', data: SRC.route, lineMetrics: true });
    lay({ id: 'route-case', type: 'line', source: 'route', layout: round, paint: { 'line-color': c.casing, 'line-width': LW(3.4) } });
    lay({ id: 'route', type: 'line', source: 'route', layout: round, paint: { 'line-width': LW(0), 'line-gradient': grad(S.nav ? S.nav.s / S.nav.route.dist : 0) } });
    lay({ id: 'route-core', type: 'line', source: 'route', layout: round, paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.1, 17, 3], 'line-gradient': coreGrad(S.nav ? S.nav.s / S.nav.route.dist : 0) } });
  }
  async function setBase() {
    if (!map) return;
    let st = null;
    if (S.mode === 'demo') st = D.style(isDark());
    else {
      try { st = await J.live.style(isDark() ? 'noir' : 'liberty'); }
      catch (e) { try { st = await J.live.style('liberty'); } catch (e2) { return; } }
    }
    map.setStyle(st, { diff: false });
  }
  function attrib() {
    const el = $('#attrib');
    if (S.mode === 'demo') { el.textContent = 'Carte de démonstration'; return; }
    el.innerHTML = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>' + (S.base === 'sat' ? ' · Photos © IGN' : '') + (trafficOn() ? ' · Trafic © TomTom' : '');
  }
  function mk(html, cls, opts) {
    const el = document.createElement('div');
    el.className = cls; el.innerHTML = html;
    return new maplibregl.Marker(Object.assign({ element: el }, opts || {}));
  }
  function setDest(ll) {
    if (!ll) { if (M.dest) { M.dest.remove(); M.dest = null; } return; }
    if (!M.dest) M.dest = mk(J.pin, 'destm', { anchor: 'bottom', offset: [0, 2] }).setLngLat(ll).addTo(map);
    else M.dest.setLngLat(ll);
  }
  function setOrigin(p) {
    S.origin = p;
    if (M.org) { M.org.remove(); M.org = null; }
    if (p) M.org = mk('', 'orgdot').setLngLat(p.ll).addTo(map);
  }
  /* ---------- mouvement fluide ----------
     Le GPS ne donne qu'une position par seconde, avec du bruit. Plutôt que de faire sauter le repère d'un point au suivant,
     on le fait glisser en continu : sur un trajet, il avance le long de la route à la vitesse mesurée et se recale en douceur ;
     hors trajet, il rejoint chaque nouvelle position en glissant. La carte suit le repère image par image. */
  const AN = { raf: 0, last: 0, s: null, sFix: 0, tFix: 0, v: 0, route: null, p: null, pFix: null, hd: null, vv: 0, rot: null, touch: false, force: false };
  function anReset() { AN.s = null; AN.route = null; AN.p = null; AN.pFix = null; AN.rot = null; }
  function anKick() { if (!AN.raf) { AN.last = performance.now(); AN.raf = requestAnimationFrame(anFrame); } }
  function anRoute(n, f) {
    const now = performance.now();
    if (AN.s == null || AN.route !== n.route) { AN.s = n.s; AN.v = Math.max(0, f.speed || 0); AN.route = n.route; }
    else {
      const dt = (now - AN.tFix) / 1000;
      if (dt > 0.05) { const ve = (n.s - AN.sFix) / dt, gps = typeof f.speed === 'number' && f.speed >= 0 && !f.sim ? f.speed : ve; AN.v = Math.max(0, Math.min(70, AN.v * 0.45 + (0.5 * ve + 0.5 * gps) * 0.55)); }
    }
    AN.sFix = n.s; AN.tFix = now; AN.p = null; AN.pFix = null;
    anKick();
  }
  function anFree(f) {
    AN.s = null; AN.route = null;
    AN.pFix = (f.show || f.ll).slice(); AN.tFix = performance.now(); AN.vv = f.sim ? 0 : (f.speed || 0);
    if ((f.speed || 0) > 1.2 && typeof f.heading === 'number') AN.hd = f.heading; else if (AN.hd == null && typeof f.heading === 'number') AN.hd = f.heading;
    if (!AN.p) AN.p = AN.pFix.slice();
    anKick();
  }
  function anFrame(t) {
    AN.raf = 0;
    if (!map || !M.puck) return;
    const dt = Math.max(0.001, Math.min(0.25, (t - AN.last) / 1000)); AN.last = t;
    const n = S.nav;
    let at = null, brg = null, moving = false;
    if (n && AN.s != null && AN.route === n.route) {
      const r = n.route, age = Math.min(1.8, (t - AN.tFix) / 1000), pred = Math.min(r.dist, AN.sFix + AN.v * age), err = pred - AN.s;
      if (Math.abs(err) > 90) AN.s = pred;
      else { let step = AN.v * dt * (age < 1.8 ? 1 : 0) + err * Math.min(1, dt * 2.2); if (step < 0 && err > -14) step = 0; AN.s = Math.max(0, Math.min(r.dist, AN.s + step)); }
      moving = (AN.v > 0.25 && age < 1.8) || Math.abs(pred - AN.s) > 0.5;
      at = G.at(r.geom, r.cum, AN.s).pt; brg = G.at(r.geom, r.cum, Math.min(r.dist, AN.s + 6)).brg;
    } else if (AN.p && AN.pFix) {
      const age = Math.min(1.4, (t - AN.tFix) / 1000);
      const tgt = AN.vv > 1.5 && typeof AN.hd === 'number' ? G.dest(AN.pFix, AN.hd, AN.vv * age) : AN.pFix, d = G.hav(AN.p, tgt);
      if (d > 200) AN.p = tgt.slice(); else { const k = Math.min(1, dt * 3.5); AN.p = [AN.p[0] + (tgt[0] - AN.p[0]) * k, AN.p[1] + (tgt[1] - AN.p[1]) * k]; }
      moving = d > 0.35 || (AN.vv > 1.5 && age < 1.4);
      at = AN.p; brg = typeof AN.hd === 'number' ? AN.hd : null;
    }
    if (!at) return;
    M.puck.setLngLat(at);
    if (brg != null) { AN.rot = AN.rot == null ? brg : G.smoothAngle(AN.rot, brg, Math.min(1, dt * 7)); M.puck.setRotation(AN.rot); }
    if (S.follow && !AN.touch && (moving || AN.force)) {
      if (n) {
        const v = AN.v, zt = n.zLock || (v > 27 ? 14.9 : v > 16 ? 15.7 : v > 7 ? 16.4 : 17), k = AN.force ? 1 : 0;
        n.z = n.z == null ? (AN.force ? zt : map.getZoom()) : n.z + (zt - n.z) * Math.min(1, dt * 0.9);
        n.pitch = n.pitch == null ? map.getPitch() : n.pitch + (50 - n.pitch) * Math.min(1, dt * 2.5);
        const cb = brg != null ? brg : map.getBearing();
        n.cam = n.cam == null ? map.getBearing() : G.smoothAngle(n.cam, cb, Math.min(1, dt * (1.8 + k)));
        const H = mapEl.clientHeight || 600, top = Math.min(H * 0.4, 300), bottom = WIDE.matches ? 40 : Math.min(sheet.offsetHeight + 20, H * 0.42);
        map.easeTo({ center: at, bearing: n.cam, pitch: n.pitch, zoom: n.z, duration: 0, offset: [0, (top - bottom) / 2], essential: true });
      } else if (!map.isEasing()) map.easeTo({ center: at, duration: 0, offset: off(), essential: true });
      AN.force = false;
    }
    if (moving || n) AN.raf = requestAnimationFrame(anFrame);
  }
  function drawPuck() {
    const p = S.pos;
    if (!p) return;
    const at = p.show || p.ll;
    if (!M.puck) M.puck = mk('<i></i>' + ic('nav'), 'puck', { rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat(at).addTo(map);
    else if (AN.s == null && !AN.p) M.puck.setLngLat(at);
    const el = M.puck.getElement();
    el.classList.toggle('navi', !!S.nav);
    el.classList.toggle('hdg', typeof p.heading === 'number');
    if (typeof p.heading === 'number' && AN.rot == null) M.puck.setRotation(p.heading);
    const wantAcc = !S.nav && !p.sim && p.acc > 30;
    if (wantAcc) setSrc('acc', { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [G.circle(p.ll, Math.min(p.acc, 3000), 48)] } }] });
    else if (SRC.acc !== EMPTY) setSrc('acc', EMPTY);
  }
  function drawParked() {
    if (M.parked) { M.parked.remove(); M.parked = null; }
    if (!db.parked) return;
    M.parked = mk(ic('car'), 'poi parking').setLngLat(db.parked.ll).addTo(map);
    M.parked.getElement().addEventListener('click', () => ACT.parked());
  }
  function northUI() {
    const b = map.getBearing(), btn = $('#north');
    btn.hidden = (Math.abs(b) < 1 && map.getPitch() < 1) || (!!S.nav && S.follow);
    if (btn.firstElementChild) btn.firstElementChild.style.transform = 'rotate(' + (-b).toFixed(1) + 'deg)';
  }
  function zoomClasses() { const z = map.getZoom(); mapEl.classList.toggle('zmid', z < 14.4); mapEl.classList.toggle('zlo', z < 12.4); }
  function unfollow() { if (!S.follow) return; S.follow = false; $('#locate').classList.remove('on'); northUI(); }

  /* ---------- position : GPS réel ou trajet simulé ---------- */
  function onFix(f, quiet) {
    const prev = S.pos;
    if (prev && !f.sim && f.acc > 80 && prev.acc && prev.acc < 40 && f.t - prev.t < 6000) return; // sursaut du GPS : on garde la bonne position
    if (!f.sim && (f.speed || 0) < 1 && prev && typeof prev.heading === 'number') f.heading = prev.heading; // à l'arrêt, la direction du GPS ne veut rien dire
    if (typeof f.heading !== 'number' || isNaN(f.heading)) f.heading = prev && G.hav(prev.ll, f.ll) > 4 ? G.bearing(prev.ll, f.ll) : (prev && typeof prev.heading === 'number' ? prev.heading : null);
    if (typeof f.speed !== 'number' || isNaN(f.speed)) { const dt = prev ? (f.t - prev.t) / 1000 : 0; f.speed = dt > 0.3 ? Math.min(70, G.hav(prev.ll, f.ll) / dt) : 0; }
    S.pos = f;
    if (S.mode === 'live' && !f.sim) { db.last = [+f.ll[0].toFixed(5), +f.ll[1].toFixed(5)]; saveSoon(); }
    if (S.nav) navUpdate(f);
    else {
      drawPuck();
      if (!prev && !quiet && S.view === 'home') { S.follow = true; map.flyTo({ center: f.ll, zoom: Math.max(map.getZoom(), 15.3), offset: off(), duration: 1400, essential: true }); }
      if (prev) anFree(f);
      freeAlerts(f);
    }
    speedo(f);
    $('#locate').classList.toggle('on', S.follow);
    if (!f.sim) syncShared();
  }
  function startGPS(user) {
    if (S.mode !== 'live') return;
    if (!('geolocation' in navigator)) { if (user) toast('Cet appareil ne fournit pas la position.'); return; }
    if (S.watch != null) return;
    S.watch = navigator.geolocation.watchPosition(p => {
      const f = { ll: [p.coords.longitude, p.coords.latitude], acc: p.coords.accuracy || 0, speed: p.coords.speed, heading: p.coords.heading, t: p.timestamp || Date.now() };
      if (S.sim) { S.real = f; return; }
      onFix(f);
    }, e => {
      if (e && e.code === 1) {
        try { navigator.geolocation.clearWatch(S.watch); } catch (x) { /* rien */ }
        S.watch = null;
        if (user || !S.denied) toast('Position refusée. Autorise la localisation pour ce site dans les réglages du navigateur, puis touche le bouton de position.', 7000);
        S.denied = true;
      } else if (user && !S.pos) toast('Position introuvable pour le moment. Réessaie à l’extérieur.');
    }, { enableHighAccuracy: true, maximumAge: 1500, timeout: 20000 });
  }
  let limT = 0, limAt = null, speedT = 0;
  function speedo(f) {
    const moving = (f.speed || 0) > 2, box = $('#speed');
    box.hidden = !(S.nav || moving);
    clearTimeout(speedT);
    if (box.hidden) return;
    // sans nouvelle position pendant 8 s (GPS coupé, appli en arrière-plan), le compteur n'affiche pas une vitesse périmée
    speedT = setTimeout(() => { if (!S.nav) { box.hidden = true; if (S.pos) S.pos.speed = 0; } else { $('#speedo b').textContent = '–'; $('#speedo').classList.remove('over'); } }, 8000);
    const kmh = Math.round((f.speed || 0) * 3.6), now = Date.now(), n = S.nav;
    $('#speedo b').textContent = kmh;
    const whole = n && n.travel === 'car' && P.limits && (n.limFail || 0) < 2; // limitations demandées pour tout le trajet
    if (n && n.travel !== 'car') { if (S.limit) { S.limit = null; limitUI(); } } // à vélo ou à pied : pas de panneau
    else if (whole) { if (n.lim) { const v = limitAt(n); if (v !== S.limit) { S.limit = v; limitUI(); } } }
    else {
      // hors guidage (ou si le trajet n'a pas pu être renseigné) : on demande la limitation de la route où l'on roule
      const ask = S.mode === 'demo' ? now - limT > 900 : (now - limT > 12000 && (!limAt || G.hav(limAt, f.ll) > 120) && (f.speed || 0) > 2);
      if (ask) {
        limT = now; limAt = f.ll;
        P.speedLimit(f.show || f.ll).then(v => { if (v !== undefined && !(S.nav && S.nav.lim)) { S.limit = v; limitUI(); } }).catch(() => { /* limite inconnue */ });
      }
    }
    const over = S.limit > 0 && kmh > S.limit + 3; // une limitation estimée (négative) n'alerte pas
    $('#speedo').classList.toggle('over', over);
    if (over && !S.wasOver && db.set.beep && now - (S.beepT || 0) > 20000 && kmh > S.limit + 5) { S.beepT = now; beep(); }
    S.wasOver = over;
  }
  function limitAt(n) {
    const L = n.lim;
    let i = Math.min(n.li || 0, L.length - 1);
    if (i < 0) return null;
    while (i > 0 && L[i].s0 > n.s) i--;
    while (i + 1 < L.length && L[i].s1 <= n.s) i++;
    n.li = i;
    return L[i].s0 <= n.s + 15 && n.s < L[i].s1 + 15 ? L[i].v : null;
  }
  // demande les limitations par tranches de 40 km, un peu avant d'en avoir besoin
  function ensureLimits(n) {
    if (n.travel !== 'car' || !P.limits || n.limBusy || (n.limFail || 0) >= 2 || (n.limWait && Date.now() - n.limWait < 15000)) return;
    if (n.limTo != null && (n.s < n.limTo - 3000 || n.limTo >= n.route.dist - 1)) return;
    const from = n.limTo == null ? Math.max(0, n.s - 60) : n.limTo, to = Math.min(n.route.dist, Math.max(from, n.s) + 40000), route = n.route;
    if (to - from < 20) { n.limTo = to; return; }
    n.limBusy = true;
    P.limits(route, from, to).then(list => {
      if (S.nav !== n || n.route !== route) return;
      n.lim = (n.lim || []).concat(list); n.limTo = to; n.limFail = 0;
    }).catch(() => { n.limFail = (n.limFail || 0) + 1; n.limWait = Date.now(); }).finally(() => { n.limBusy = false; });
  }
  function limitUI() { const el = $('#limit'); el.hidden = !S.limit; if (S.limit) { el.textContent = Math.abs(S.limit); el.classList.toggle('est', S.limit < 0); el.title = S.limit < 0 ? 'Limitation estimée d’après le type de route' : 'Limitation de vitesse'; } }
  function startSim(route) {
    stopSim();
    if (S.mode === 'live') S.real = S.pos;
    S.sim = { route, s: 0, v: 0, mult: S.mode === 'demo' ? 2 : 1, paused: false, last: performance.now(), timer: setInterval(simTick, 200) };
  }
  function stopSim() {
    if (!S.sim) return;
    clearInterval(S.sim.timer); S.sim = null;
    if (S.mode === 'live') { S.pos = S.real || null; S.real = null; if (!S.pos && M.puck) { M.puck.remove(); M.puck = null; } }
  }
  function simTick() {
    const sim = S.sim;
    if (!sim) return;
    const now = performance.now();
    let dt = Math.min(0.6, (now - sim.last) / 1000);
    sim.last = now;
    if (sim.paused) return;
    dt *= sim.mult;
    const r = sim.route;
    let k = 0;
    while (k + 1 < r.steps.length && r.steps[k + 1].s0 <= sim.s) k++;
    const st = r.steps[k], nx = r.steps[k + 1];
    let target = st.len > 0 && st.time > 0 ? st.len / st.time : 8;
    target = Math.max(1.2, Math.min(38, target * 1.06));
    if (nx && nx.type !== 'continue' && nx.type !== 'merge') {
      const dn = nx.s0 - sim.s, vt = nx.type === 'arrive' ? 2 : Math.min(target, 5.5);
      if (dn < 70) target = vt + (target - vt) * Math.max(0, dn) / 70;
    }
    sim.v = Math.max(0.8, sim.v + Math.max(-4.5 * dt, Math.min(2.6 * dt, target - sim.v)));
    sim.s = Math.min(r.dist, sim.s + sim.v * dt);
    const p = G.at(r.geom, r.cum, sim.s);
    onFix({ ll: p.pt, acc: 5, speed: sim.v, heading: p.brg, t: Date.now(), sim: true });
  }

  /* ---------- signalements ---------- */
  const activeReports = () => db.reports.filter(r => r.ex || Date.now() - r.t < REPORTS[r.type].ttl * 60000);
  function drawReports() {
    const act = activeReports(), ids = new Set(act.map(r => r.id));
    M.reps.forEach((m, id) => { if (!ids.has(id)) { m.remove(); M.reps.delete(id); } });
    act.forEach(rp => {
      if (M.reps.has(rp.id)) return;
      const m = mk(J.signs[rp.type], 'repm').setLngLat(rp.ll).addTo(map), el = m.getElement();
      el.setAttribute('role', 'button'); el.setAttribute('aria-label', REPORTS[rp.type].label);
      el.addEventListener('click', () => { if (S.view === 'nav' || S.view === 'search') return; S.rep = rp; S.back = S.view === 'place' || S.view === 'pois' ? S.view : 'home'; go('rep'); });
      M.reps.set(rp.id, m);
    });
  }
  function dropReport(rp) {
    db.reports = db.reports.filter(r => r !== rp);
    if (rp.sid) { db.gone = (db.gone || []).concat(rp.sid).slice(-200); voteShared(rp, false); } // « plus là » : compte aussi pour les autres
    save(); drawReports(); if (S.nav) indexReports();
  }
  /* Signalements partagés : ceux des autres utilisateurs arrivent dans la même liste que les miens (marqués sh),
     les miens sont envoyés à la base commune. Sans réseau, tout continue de marcher avec ce que l'appareil connaît. */
  const sharing = () => S.mode === 'live' && db.set.share !== false && !!(P && P.shared);
  const SH = { t: 0, at: null, busy: false };
  async function syncShared(force) {
    if (!sharing() || SH.busy || !S.pos) return;
    const ll = S.pos.ll, now = Date.now();
    if (!force && now - SH.t < 150000 && SH.at && G.hav(SH.at, ll) < 8000) return;
    SH.busy = true;
    try {
      const res = await P.shared.list(ll, 60), b = res.box, mine = new Set(db.reports.filter(r => r.sid && !r.sh).map(r => r.sid)), gone = new Set(db.gone || []), seen = new Set(res.rows.map(r => r.sid));
      // ceux qui ont disparu de la base (retirés par les votes) quittent la carte
      db.reports = db.reports.filter(r => !(r.sh && r.ll[0] >= b[0] && r.ll[0] <= b[2] && r.ll[1] >= b[1] && r.ll[1] <= b[3] && !seen.has(r.sid)));
      const have = new Set(db.reports.filter(r => r.sh).map(r => r.sid));
      res.rows.forEach(r => { if (mine.has(r.sid) || gone.has(r.sid) || have.has(r.sid) || !REPORTS[r.type]) return; const rp = { id: 's' + r.sid, sid: r.sid, sh: true, type: r.type, ll: r.ll, t: r.t }; if (r.note) rp.note = r.note; db.reports.push(rp); });
      SH.t = now; SH.at = ll.slice();
      save(); drawReports(); if (S.nav) indexReports();
    } catch (e) { SH.t = now - 120000; /* nouvel essai dans une demi-minute */ }
    SH.busy = false;
  }
  function postShared(rp) {
    if (!sharing()) return;
    P.shared.post(rp).then(sid => { if (sid) { rp.sid = sid; save(); } }).catch(() => { toast('Signalement gardé sur cet appareil : le partage n’a pas pu se faire.'); });
  }
  function voteShared(rp, still) { if (rp && rp.sid && sharing()) P.shared.vote(rp.sid, still).catch(() => {}); }
  function setAlert(x) {
    const el = $('#alert');
    if (!x) { if (!el.hidden) el.hidden = true; S.alertRp = null; return; }
    if (S.alertRp !== x.rp) { S.alertRp = x.rp; $('#al-ic').innerHTML = J.signs[x.rp.type]; $('#al-title').textContent = REPORTS[x.rp.type].label; }
    $('#al-sub').textContent = (x.d > 15 ? 'à ' + F.dist(x.d) : 'ici') + ' · ' + F.ago(x.rp.t) + (x.rp.note ? ' · « ' + x.rp.note + ' »' : '');
    el.hidden = false;
  }
  /* Zones de danger. En France, une appli n'a pas le droit d'indiquer l'emplacement exact d'un radar : elle annonce une
     zone (4 km sur voie rapide, 2 km hors agglomération, 300 m en ville) dans laquelle il se trouve, sans dire où.
     Le point de contrôle est placé à un endroit variable de la zone, jamais affiché sur la carte. */
  async function loadZones(n) {
    if (!db.set.zones || n.travel !== 'car' || S.mode !== 'live' || !P.cameras) return;
    try {
      const cams = await P.cameras(n.route.geom);
      if (S.nav !== n) return;
      const r = n.route, zs = [];
      cams.forEach(c => {
        const m = G.nearest(r.geom, r.cum, c.ll, 0, r.geom.length - 2);
        if (m.d > 40) return;
        const le = (n.lim || []).find(x => m.s >= x.s0 && m.s <= x.s1), lim = le ? Math.abs(le.v || 0) : 0, len = lim >= 100 ? 4000 : lim > 0 && lim <= 50 ? 300 : 2000;
        let h = 0; String(c.id).split('').forEach(ch => { h = (h * 31 + ch.charCodeAt(0)) % 1000; });
        const f = 0.3 + (h / 1000) * 0.5, s0 = Math.max(0, m.s - len * f), s1 = Math.min(r.dist, s0 + len);
        zs.push({ s0, s1 });
      });
      zs.sort((a, b) => a.s0 - b.s0);
      n.zones = zs.reduce((acc, z) => { const l = acc[acc.length - 1]; if (l && z.s0 <= l.s1 + 150) l.s1 = Math.max(l.s1, z.s1); else acc.push(z); return acc; }, []);
    } catch (e) { /* service indisponible : pas de zones pour ce trajet */ }
  }
  function zoneUI(n) {
    const el = $('#zone');
    if (!el) return;
    const z = n && n.zones ? n.zones.find(x => n.s >= x.s0 - 400 && n.s <= x.s1) : null;
    if (!z) { if (!el.hidden) el.hidden = true; if (n) n.zoneIn = null; return; }
    const inside = n.s >= z.s0;
    $('#zone-t').textContent = inside ? 'Zone de danger' : 'Zone de danger dans ' + F.dist(z.s0 - n.s);
    $('#zone-s').textContent = inside ? 'encore ' + F.dist(z.s1 - n.s) : 'sur ' + F.dist(z.s1 - z.s0);
    el.classList.toggle('in', inside);
    el.hidden = false;
    if (n.zoneSaid !== z) { n.zoneSaid = z; say('Attention, zone de danger' + (inside ? '' : ' dans ' + F.say(z.s0 - n.s))); }
  }
  function indexReports() {
    const n = S.nav;
    if (!n) return;
    n.reps = activeReports().map(rp => { const m = G.nearest(n.route.geom, n.route.cum, rp.ll, 0, n.route.geom.length - 2); return m.d < 45 ? { rp, s: m.s } : null; }).filter(Boolean);
  }
  function navAlerts(s) {
    const n = S.nav;
    let show = null;
    for (const x of n.reps) {
      const d = x.s - s;
      if (d > 0 && d <= 600 && !n.alerted[x.rp.id]) { n.alerted[x.rp.id] = 1; say(REPORTS[x.rp.type].said + ' à ' + F.say(d) + (x.rp.note ? '. ' + x.rp.note : '')); }
      if (d > -40 && d <= 600 && n.alerted[x.rp.id] === 1 && (!show || d < show.d)) show = { rp: x.rp, d: Math.max(0, d) };
    }
    setAlert(show);
  }
  function freeAlerts(f) {
    if (!((f.speed || 0) > 2.5) || typeof f.heading !== 'number') { if (S.alertRp) setAlert(null); return; }
    let show = null;
    for (const rp of activeReports()) {
      const d = G.hav(f.ll, rp.ll);
      if (d > 450 || Math.abs(G.angDiff(f.heading, G.bearing(f.ll, rp.ll))) > 50) continue;
      if (!S.freeAlerted[rp.id]) { S.freeAlerted[rp.id] = 1; say(REPORTS[rp.type].said + ' à ' + F.say(d) + (rp.note ? '. ' + rp.note : '')); }
      if (S.freeAlerted[rp.id] === 1 && (!show || d < show.d)) show = { rp, d };
    }
    setAlert(show);
  }

  /* ---------- recherche ---------- */
  let searchT = 0, searchSeq = 0;
  function row(p, icon, label) {
    const d = S.pos ? F.dist(G.hav(S.pos.ll, p.ll)) : '';
    return '<button type="button" class="row" data-act="pick" data-i="' + reg(p) + '"><span class="ri">' + ic(icon || KIND_IC[p.kind] || 'pin') + '</span><span class="rt"><b>' + esc(label || p.name) + '</b><small>' + esc(label ? p.name : p.sub || '') + '</small></span>' + (d ? '<span class="rr">' + d + '</span>' : '') + '</button>';
  }
  function renderResults() {
    const q = S.q.trim();
    let h = '';
    if (S.pick) h += '<p class="hint">' + (S.pick === 'home' ? 'Adresse de la maison' : S.pick === 'work' ? 'Adresse du travail' : 'Point de départ') + '</p>';
    if (q.length < 2) {
      const rows = [];
      if (!S.pick && db.home) rows.push(row(db.home, 'home', 'Maison'));
      if (!S.pick && db.work) rows.push(row(db.work, 'work', 'Travail'));
      db.favs.forEach(p => rows.push(row(p, 'star')));
      db.recents.forEach(p => rows.push(row(p, 'clock')));
      h += rows.length ? rows.join('') : '';
      h += '<p class="empty">' + (S.mode === 'demo' ? 'Dans la démo, essaie « boulangerie », « gare » ou « 12 rue Voltaire ».' : 'Tape une adresse, un lieu ou un commerce.') + '</p>';
    } else if (S.results === null || (S.searching && !S.results.length)) h += '<p class="empty">Recherche…</p>';
    else if (!S.results.length) h += '<p class="empty">' + (S.searchErr ? 'La recherche ne répond pas. Vérifie ta connexion et réessaie.' : 'Aucun résultat pour « ' + esc(q) + ' ».' + (S.mode === 'demo' ? ' La démo ne connaît que Val-Lunavia et Saint-Aubin-les-Bornes.' : '')) + '</p>';
    else h += S.results.map(p => row(p)).join('') + (S.searching ? '<p class="empty more">Recherche d’autres résultats…</p>' : '');
    $('#results-in').innerHTML = h;
  }
  // ce que l'appareil connaît déjà (maison, travail, favoris, récents) répond tout de suite, sans réseau
  const plain = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  function localHits(q) {
    const words = plain(q).split(/\s+/).filter(Boolean), seen = [], out = [];
    const add = (p, tag) => { if (!p || seen.indexOf(p.id) >= 0) return; const hay = plain((tag || '') + ' ' + p.name + ' ' + (p.sub || '')); if (words.every(w => hay.indexOf(w) >= 0)) { seen.push(p.id); out.push(p); } };
    if (!S.pick) { add(db.home, 'maison'); add(db.work, 'travail'); }
    db.favs.forEach(p => add(p)); db.recents.forEach(p => add(p));
    return out.slice(0, 3);
  }
  /* Commande vocale : « emmène-moi à la maison », « va à la gare de Narbonne », « station essence »,
     « signale un bouchon », « arrête le guidage ». Disponible seulement si le navigateur sait reconnaître la parole. */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micUI = on => document.querySelectorAll('[data-act="mic"]').forEach(b => { b.hidden = !SR; b.classList.toggle('on', !!on); b.setAttribute('aria-pressed', !!on); });
  function listen() {
    if (!SR) { toast('La commande vocale n’est pas disponible sur ce navigateur.'); return; }
    if (S.rec) { try { S.rec.stop(); } catch (e) { /* déjà arrêté */ } return; }
    let r;
    try { r = new SR(); } catch (e) { toast('La commande vocale n’est pas disponible ici.'); return; }
    r.lang = 'fr-FR'; r.interimResults = false; r.maxAlternatives = 1;
    S.rec = r; micUI(true); toast('Je t’écoute…');
    try { speechSynthesis.cancel(); } catch (e) { /* pas de voix */ }
    r.onresult = e => { const t = e.results && e.results[0] && e.results[0][0] ? e.results[0][0].transcript : ''; if (t) command(t); };
    r.onerror = e => { toast(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Micro indisponible. Sur iPhone, la commande vocale marche dans Safari, pas depuis l’icône de l’écran d’accueil ; sinon, autorise le micro pour ce site.' : e.error === 'no-speech' ? 'Je n’ai rien entendu.' : 'Je n’ai pas compris. Réessaie.'); };
    r.onend = () => { S.rec = null; micUI(false); };
    try { r.start(); } catch (e) { S.rec = null; micUI(false); }
  }
  const VREP = [[/bouchon|embouteillage|ralentissement/, 'jam'], [/accident|accrochage/, 'crash'], [/travaux|chantier/, 'works'], [/controle|police|gendarme/, 'control'], [/route (fermee|barree|coupee)/, 'closed'], [/danger|obstacle|animal|objet/, 'danger']];
  const VCAT = [[/essence|carburant|station|gazole|diesel/, 'fuel'], [/recharge|borne/, 'charge'], [/parking|me garer|se garer/, 'parking'], [/restaurant|resto|manger/, 'food'], [/courses|supermarche|magasin/, 'shop'], [/pharmacie/, 'pharma']];
  async function command(text) {
    const t = plain(text).replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return;
    if (/^(stop|arrete|arreter|annule|annuler|termine|terminer)\b/.test(t)) { if (S.nav) { ACT.stop(); say('Guidage arrêté', true); } else toast('Aucun guidage en cours.'); return; }
    if (/signale|signaler|signalement|il y a/.test(t)) { const hit = VREP.find(x => x[0].test(t)); if (hit) { ACT.rep({ dataset: { k: hit[1] } }); say(REPORTS[hit[1]].said, true); return; } }
    const go2 = /^(emmene[ -]moi|amene[ -]moi|conduis[ -]moi|guide[ -]moi|va|aller|on va|je veux aller|je vais|navigue|itineraire|direction|route)\b/.test(t);
    if (/\b(maison|chez moi|domicile)\b/.test(t) && db.home) { S.place = null; say('En route vers la maison', true); plan(db.home); return; }
    if (/\b(travail|boulot|bureau)\b/.test(t) && db.work) { S.place = null; say('En route vers le travail', true); plan(db.work); return; }
    if (!S.nav) { const cat = VCAT.find(x => x[0].test(t)); if (cat && t.split(' ').length <= 4) { showPois(cat[1]); return; } }
    const q = text.replace(/^\s*(emm[eè]ne[ -]moi|am[eè]ne[ -]moi|conduis[ -]moi|guide[ -]moi|je veux aller|on va|je vais|va|aller|navigue|itin[ée]raire|direction|route)\s+(jusqu[’']?\s?|vers\s+|pour\s+)?(à la |à l[’']|au |aux |à |a |chez )?/i, '').trim();
    if (!q) return;
    if (S.nav) { toast('Arrête le guidage pour choisir une autre destination.'); return; }
    if (go2) {
      toast('Je cherche « ' + q + ' »…');
      try { const r = await P.search(q, S.pos ? S.pos.ll : center()); if (r && r[0]) { say('En route vers ' + r[0].name, true); S.place = null; plan(r[0]); return; } } catch (e) { /* on montre la recherche */ }
    }
    if (S.view !== 'search') { S.prev = S.view; go('search'); }
    input.value = q; S.q = q; $('#sb-clear').hidden = false; S.results = null; S.searching = true; renderResults(); runSearch(q);
  }
  let searchCtl = null;
  async function runSearch(q) {
    const seq = ++searchSeq;
    S.searchErr = false;
    if (searchCtl) searchCtl.abort(); // la demande précédente ne sert plus : on la coupe pour ne pas encombrer le réseau
    const ctl = searchCtl = typeof AbortController === 'function' ? new AbortController() : null;
    const local = localHits(q), show = (list, more) => {
      if (seq !== searchSeq) return;
      S.results = local.concat(list.filter(p => !local.some(o => o.id === p.id || G.hav(o.ll, p.ll) < 15))).slice(0, 9);
      S.searching = more;
      if (S.view === 'search') renderResults();
    };
    if (local.length) show([], true);
    try {
      const r = await P.search(q, S.pos ? S.pos.ll : center(), { signal: ctl ? ctl.signal : undefined, onPartial: l => show(l, true) });
      show(r, false);
    } catch (e) {
      if (seq !== searchSeq) return;
      S.searching = false;
      if (!S.results || !S.results.length) { S.results = local; S.searchErr = !local.length; }
      if (S.view === 'search') renderResults();
    }
  }
  function clearSearch() { S.q = ''; input.value = ''; S.results = null; S.searching = false; if (searchCtl) searchCtl.abort(); searchSeq++; clearTimeout(searchT); $('#sb-clear').hidden = true; }
  function exitSearch() { S.pick = null; clearSearch(); input.blur(); go(S.prev === 'search' || S.prev === 'nav' ? 'home' : S.prev); }
  function choose(p) {
    input.blur();
    if (S.pick === 'home' || S.pick === 'work') {
      const k = S.pick;
      db[k] = strip(p, k); save();
      S.pick = null; clearSearch(); go('home');
      toast(k === 'home' ? 'Maison enregistrée' : 'Travail enregistré');
      return;
    }
    if (S.pick === 'origin') {
      S.pick = null; clearSearch(); setOrigin(strip(p));
      if (S.dest) plan(S.dest); else { go('home'); toast('Départ défini. Choisis maintenant la destination.'); }
      return;
    }
    addRecent(p); clearSearch(); openPlace(p, true);
  }

  /* ---------- fiche d'un lieu ---------- */
  function openPlace(p, fly) {
    S.place = p; S.saveMenu = false; S.shareText = '';
    setDest(p.ll); markSel();
    unfollow();
    go('place');
    if (fly) map.easeTo({ center: p.ll, zoom: Math.max(map.getZoom(), 15.2), bearing: 0, pitch: 0, offset: off(), duration: 800, essential: true });
  }
  function onMapClick(e) {
    const t = e.originalEvent && e.originalEvent.target;
    if (t && t.closest && t.closest('.maplibregl-marker')) return;
    if (S.view === 'search') { exitSearch(); return; }
    if (S.view === 'route' && S.routes.length > 1 && map.getLayer('alts-case')) {
      const x = e.point.x, y = e.point.y, fs = map.queryRenderedFeatures([[x - 9, y - 9], [x + 9, y + 9]], { layers: ['alts-case'] });
      if (fs.length && fs[0].properties && fs[0].properties.i != null) { S.sel = +fs[0].properties.i; drawRoutes(false); render(); }
      return;
    }
    if (S.view !== 'home' && S.view !== 'place') return;
    const p = [e.lngLat.lng, e.lngLat.lat];
    const tmp = { id: 'tap' + Date.now(), name: 'Point sur la carte', sub: p[1].toFixed(5) + ', ' + p[0].toFixed(5), ll: p, kind: 'pin', cat: 'address', extra: {} };
    openPlace(tmp, false);
    P.reverse(p).then(r => {
      if (!r || S.place !== tmp) return;
      const close = G.hav(r.ll, p) < 45;
      S.place = Object.assign({}, r, close ? {} : { id: tmp.id, ll: p, name: 'Près de ' + r.name, extra: {} });
      setDest(S.place.ll);
      if (S.view === 'place') render();
    }).catch(() => { /* on garde les coordonnées */ });
  }
  const safeUrl = u => { u = String(u || '').trim(); if (/^https?:\/\//i.test(u)) return u; return /^[\w-]+(\.[\w-]+)+/.test(u) ? 'https://' + u : ''; };
  function head(title, sub, closable) {
    return '<div class="sh"><div class="sh-t"><h2>' + title + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (closable === false ? '' : '<button type="button" class="iconbtn" data-act="close" aria-label="Fermer">' + ic('close') + '</button>') + '</div>';
  }
  function pricesBox(pr, maj) {
    const keys = Object.keys(FUELS).filter(k => pr[k] > 0);
    if (!keys.length) return '';
    return '<div class="prices">' + keys.map(k => '<div class="pr' + (k === db.set.fuel ? ' me' : '') + '"><span>' + FUELS[k] + '</span><b>' + F.dec(pr[k], 3) + ' €</b></div>').join('') + '</div><p class="note">' + (S.mode === 'demo' ? 'Prix d’exemple pour la démo.' : 'Prix officiels à la pompe' + (maj ? ', relevés ' + esc(String(maj).replace(/\.$/, '')) : '') + '.') + '</p>';
  }
  function vPlace() {
    const p = S.place, x = p.extra || {}, d = S.pos ? F.dist(G.hav(S.pos.ll, p.ll)) : '';
    let h = head(esc(p.name), esc([p.sub, d ? 'à ' + d : ''].filter(Boolean).join(' · ')));
    if (x.prices) h += pricesBox(x.prices, x.maj);
    const facts = [];
    if (x.hours) facts.push(ic('clock') + '<span>' + esc(x.hours) + '</span>');
    (x.lines || []).forEach(l => facts.push(ic('info') + '<span>' + esc(l) + '</span>'));
    if (x.phone) facts.push(ic('phone') + '<span class="sel">' + esc(x.phone) + '</span>');
    const web = safeUrl(x.web);
    if (web) facts.push(ic('globe') + '<a href="' + esc(web) + '" target="_blank" rel="noopener noreferrer">' + esc(web.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')) + '</a>');
    if (facts.length) h += '<ul class="facts">' + facts.map(l => '<li>' + l + '</li>').join('') + '</ul>';
    h += '<div class="actions"><button type="button" class="btn primary big" data-act="route">' + ic('route') + 'Itinéraire</button>' +
      (p.parked ? '<button type="button" class="btn" data-act="unpark">' + ic('trash') + 'Oublier</button>' : '<button type="button" class="btn" data-act="save" aria-expanded="' + S.saveMenu + '">' + ic(isFav(p) ? 'starf' : 'star') + 'Enregistrer</button>') + '</div>';
    if (S.saveMenu) h += '<div class="savemenu"><button type="button" class="chip" data-act="save-as" data-k="home">' + ic('home') + 'Maison</button><button type="button" class="chip" data-act="save-as" data-k="work">' + ic('work') + 'Travail</button><button type="button" class="chip" data-act="save-as" data-k="fav">' + ic('star') + (isFav(p) ? 'Retirer des favoris' : 'Favori') + '</button></div>';
    h += '<div class="actions sub"><button type="button" class="link" data-act="from">' + ic('flag') + 'Partir d’ici</button>' + (S.mode === 'live' ? '<button type="button" class="link" data-act="share">' + ic('share') + 'Partager</button>' : '') + '</div>';
    if (S.shareText) h += '<p class="note sel">' + esc(S.shareText) + '</p>';
    return h;
  }

  /* ---------- itinéraires ---------- */
  // Durées avec le trafic du moment : chaque trajet proposé est rechronométré, et le plus rapide passe devant.
  function setTraffic(r, t) {
    const k = t.time / Math.max(1, r.time);
    if (!(k > 0.4 && k < 6)) return;
    r.time *= k; r.steps.forEach(st => { st.time *= k; st.tAfter *= k; });
    r.delay = t.delay; r.traf = true;
  }
  async function trafficRoutes(seq) {
    if (S.mode !== 'live' || S.travel !== 'car' || !trafficOn() || !P.trafficTime) return;
    const todo = S.routes.filter(r => !r.traf && !r.trafTried);
    if (!todo.length) return;
    todo.forEach(r => { r.trafTried = true; });
    const res = await Promise.allSettled(todo.map(r => P.trafficTime(r.geom, tkey())));
    if (seq !== S.routeSeq || S.nav) return;
    let any = false;
    res.forEach((x, i) => { if (x.status === 'fulfilled' && x.value) { setTraffic(todo[i], x.value); any = true; } });
    if (!any) return;
    // le plus rapide avec le trafic passe en tête de liste ; si un trajet a déjà été choisi à la main, il reste choisi
    const chosen = S.routes[S.sel];
    S.routes.sort((x, y) => x.time - y.time);
    S.sel = S.altPicked ? Math.max(0, S.routes.indexOf(chosen)) : 0;
    labelRoutes();
    if (S.view === 'route') { render(); wxUI(); drawRoutes(false); }
  }
  // pendant le guidage : l'heure d'arrivée est recalée sur le trafic toutes les quatre minutes
  async function trafficNav(n) {
    if (!n || n.travel !== 'car' || n.simulated || S.mode !== 'live' || !trafficOn() || !P.trafficTime) return;
    const now = Date.now();
    if (n.trafT && now - n.trafT < 240000) return;
    n.trafT = now;
    try {
      const r = n.route, rest = [G.at(r.geom, r.cum, n.s).pt].concat(r.geom.slice(n.seg + 1));
      if (rest.length < 2 || r.dist - n.s < 1500) return;
      const cur = r.steps[n.k], base = cur.tAfter + cur.time * (cur.len > 0 ? Math.max(0, 1 - (n.s - cur.s0) / cur.len) : 0);
      const t = await P.trafficTime(rest, tkey());
      if (S.nav !== n || !t || base < 60) return;
      const k = t.time / base;
      if (k > 0.4 && k < 6) { n.tk = k; n.delay = t.delay; }
    } catch (e) { /* pas de trafic cette fois : on garde la dernière estimation */ }
  }
  function labelRoutes() {
    const R = S.routes;
    if (!R.length) return;
    let fast = 0, short = 0;
    R.forEach((r, i) => { r.tag = ''; r.tagc = ''; if (r.time < R[fast].time) fast = i; if (r.dist < R[short].dist) short = i; });
    const anyToll = R.some(r => r.toll);
    R.forEach((r, i) => {
      if (i === fast) { r.tag = 'Le plus rapide'; r.tagc = 'fast'; }
      else if (anyToll && !r.toll) r.tag = 'Sans péage';
      else if (i === short && r.dist < R[fast].dist * 0.95) r.tag = 'Le plus court';
      else r.tag = 'Autre trajet';
    });
  }
  function drawRoutes(fit) {
    const sel = S.routes[S.sel];
    if (!sel) { setSrc('route', EMPTY); setSrc('alts', EMPTY); return; }
    setSrc('alts', { type: 'FeatureCollection', features: S.routes.map((r, i) => (i === S.sel ? null : line(r.geom, { i }))).filter(Boolean) });
    setSrc('route', { type: 'FeatureCollection', features: [line(sel.geom)] });
    setGrad(0, true);
    if (fit) {
      let b = null;
      const grow = x => { b = b ? [[Math.min(b[0][0], x[0][0]), Math.min(b[0][1], x[0][1])], [Math.max(b[1][0], x[1][0]), Math.max(b[1][1], x[1][1])]] : x; };
      S.routes.forEach(r => grow(G.bounds(r.geom)));
      // le repère d'arrivée et le point de départ peuvent être à l'écart de la route : ils restent dans le cadre
      if (S.dest) grow([S.dest.ll, S.dest.ll]);
      const o = S.origin ? S.origin.ll : S.pos && S.pos.ll;
      if (o) grow([o, o]);
      requestAnimationFrame(() => { try { map.fitBounds(b, { padding: pad(), duration: 900, bearing: 0, pitch: 0, maxZoom: 16.5, essential: true }); } catch (e) { /* écran trop petit pour le cadrage */ } });
    }
  }
  function clearRoute() { S.routes = []; S.sel = 0; setSrc('route', EMPTY); setSrc('alts', EMPTY); }
  async function plan(dest) {
    S.dest = dest; S.routes = []; S.sel = 0; S.routeErr = null;
    const from = S.origin ? S.origin.ll : S.pos && S.pos.ll, seq = ++S.routeSeq;
    setDest(dest.ll); unfollow();
    setSrc('route', EMPTY); setSrc('alts', EMPTY);
    if (!from) { S.loading = false; S.routeErr = 'nopos'; go('route'); if (S.mode === 'live') startGPS(true); return; }
    S.loading = true; go('route');
    const opts = routeOpts(), mode = S.travel;
    S.wx = null;
    try {
      const rs = await P.route(from, dest.ll, mode, opts);
      if (seq !== S.routeSeq) return;
      S.routes = rs.slice(0, 3); S.loading = false;
      labelRoutes(); render(); drawRoutes(true);
      S.altPicked = false; trafficRoutes(seq);
      if (P.weather) P.weather(dest.ll, Date.now() + rs[0].time * 1000).then(w => { if (seq === S.routeSeq) { S.wx = w; wxUI(); } }).catch(() => { /* pas de météo : rien d'affiché */ });
      if (S.mode === 'live' && mode === 'car' && !opts.avoidTolls && rs[0].toll && !S.routes.some(r => !r.toll)) {
        P.route(from, dest.ll, 'car', Object.assign({}, opts, { avoidTolls: true })).then(r2 => {
          if (seq !== S.routeSeq || S.view !== 'route' || !r2[0] || r2[0].toll) return;
          S.routes = S.routes.slice(0, 2).concat([r2[0]]);
          labelRoutes(); render(); wxUI(); drawRoutes(false);
          trafficRoutes(seq);
        }).catch(() => { /* pas de variante sans péage */ });
      }
    } catch (e) {
      if (seq !== S.routeSeq) return;
      S.loading = false; S.routeErr = e && e.message === 'far' ? 'far' : 'fail';
      render();
    }
  }
  // réglages du calcul : péages, autoroutes, et les routes que tu as signalées fermées
  function routeOpts(extra) {
    const closed = activeReports().filter(r => r.type === 'closed').map(r => r.ll);
    return Object.assign({ avoidTolls: db.set.tolls, avoidHighways: db.set.hw, avoid: closed }, extra || {});
  }
  function wxUI() {
    const el = $('#wx'), w = S.wx;
    if (!el) return;
    el.hidden = !w;
    if (w) el.innerHTML = ic('cloud') + '<span>À l’arrivée : <b>' + w.temp + ' °C</b>, ' + esc(w.label) + (w.rain != null ? ' (' + w.rain + ' % de risque)' : '') + (w.care ? ' · prudence sur la route' : '') + '</span>';
  }
  function altCard(r, i) {
    const tags = [];
    if (r.tag) tags.push('<span class="tag ' + (r.tagc || '') + '">' + r.tag + '</span>');
    if (r.toll) tags.push('<span class="tag toll">Péage</span>');
    if (r.highway && S.travel === 'car') tags.push('<span class="tag">Autoroute</span>');
    if (r.ferry) tags.push('<span class="tag">Ferry</span>');
    if (r.traf) tags.push(r.delay >= 120 ? '<span class="tag jam">+ ' + F.dur(r.delay) + ' de bouchons</span>' : '<span class="tag flow">Trafic fluide</span>');
    const eta = new Date(Date.now() + r.time * 1000);
    const extra = S.travel === 'car' ? '≈ ' + F.euro(r.dist / 1000 * db.set.conso / 100 * db.set.prix) + ' de carburant' + (r.toll ? ', péage en plus' : '') : '≈ ' + Math.max(5, Math.round(r.dist / 1000 * (S.travel === 'bike' ? 26 : 62) / 5) * 5) + ' kcal';
    return '<button type="button" class="alt" role="radio" aria-checked="' + (i === S.sel) + '" data-act="alt" data-i="' + i + '"><b>' + F.dur(r.time) + '</b><span class="am">' + F.dist(r.dist) + ' · arrivée ' + F.clock(eta) + '</span><span class="tags">' + tags.join('') + '</span><span class="ax">' + extra + '</span></button>';
  }
  function vRoute() {
    const d = S.dest;
    let h = head('Vers ' + esc(d.name), S.origin ? 'Départ : ' + esc(S.origin.name) + ' · <button type="button" class="link inl" data-act="origin-reset">repartir de ma position</button>' : (S.pos ? 'Départ : ma position' : ''));
    h += '<div class="seg" role="tablist" aria-label="Moyen de transport">' + Object.keys(MODES).map(k => '<button type="button" role="tab" aria-selected="' + (S.travel === k) + '" data-act="mode" data-k="' + k + '">' + ic(MODES[k].icon) + MODES[k].label + '</button>').join('') + '</div>';
    if (S.routeErr === 'nopos') return h + '<p class="empty">Je n’ai pas encore ta position. Touche le bouton de position en bas à droite, ou choisis un point de départ.</p><div class="actions"><button type="button" class="btn big" data-act="pick-origin">' + ic('flag') + 'Choisir un départ</button></div>';
    if (S.routeErr === 'far') return h + '<p class="empty">La démo calcule seulement les trajets dans Val-Lunavia et Saint-Aubin-les-Bornes.</p>';
    if (S.routeErr) return h + '<p class="empty">Aucun itinéraire trouvé. Vérifie ta connexion, ou essaie un autre moyen de transport.</p><div class="actions"><button type="button" class="btn big" data-act="retry">Réessayer</button></div>';
    if (S.loading || !S.routes.length) return h + '<p class="empty">Calcul de l’itinéraire…</p>';
    h += '<div class="alts" role="radiogroup" aria-label="Trajets proposés">' + S.routes.map(altCard).join('') + '</div>';
    if (S.travel === 'car') h += '<div class="opts"><button type="button" class="chip sm" aria-pressed="' + db.set.tolls + '" data-act="opt" data-k="tolls">Éviter les péages</button><button type="button" class="chip sm" aria-pressed="' + db.set.hw + '" data-act="opt" data-k="hw">Éviter les autoroutes</button></div>';
    h += '<p class="wx" id="wx" hidden></p>';
    const simOnly = S.mode === 'demo' || !!S.origin || !S.pos;
    h += '<div class="actions go">' + (simOnly ? '<button type="button" class="btn primary big" data-act="sim">' + ic('play') + (S.mode === 'demo' ? 'Démarrer' : 'Aperçu du trajet') + '</button>' : '<button type="button" class="btn primary big" data-act="start">' + ic('nav') + 'Démarrer</button><button type="button" class="btn" data-act="sim">' + ic('play') + 'Aperçu</button>') + '</div>';
    const r = S.routes[S.sel];
    h += '<details class="steps"><summary>' + ic('list') + 'Feuille de route · ' + (r.steps.length - 1) + ' étapes</summary><ol>' + r.steps.map(s => '<li><span class="sa">' + J.arrow(s) + '</span><span class="st">' + esc(s.text) + '</span><span class="sd">' + (s.len > 0 ? F.dist(s.len) : '') + '</span></li>').join('') + '</ol></details>';
    return h;
  }

  /* ---------- guidage ---------- */
  const sayText = s => s.say || s.text;
  function startNav(sim) {
    const r = S.routes[S.sel];
    if (!r) return;
    clearPois(); S.poi = null; chipsUI();
    S.nav = { route: r, s: 0, seg: 0, k: 0, off: 0, said: {}, t0: Date.now(), lastRe: 0, cam: null, z: null, zLock: null, reps: [], alerted: {}, simulated: !!sim, dest: S.dest, travel: S.travel, ui: -2 };
    indexReports();
    setSrc('alts', EMPTY);
    S.follow = true;
    if (sim) startSim(r); // avant l'affichage : la barre « Trajet simulé » en dépend
    go('nav');
    routeColors();
    loadZones(S.nav);
    syncShared(true);
    wake(true);
    const first = r.steps[0], nx = r.steps[1];
    say('C’est parti. ' + sayText(first) + (nx && nx.s0 > 60 && nx.type !== 'arrive' ? '. Puis, dans ' + F.say(nx.s0) + ', ' + fr.lower(sayText(nx)) : ''), true);
    if (nx) S.nav.said['f1'] = 1; // la première manœuvre vient d'être annoncée
    if (!sim && S.pos) navUpdate(S.pos);
  }
  function endNav() {
    stopSim(); wake(false);
    if (S.pos) S.pos.speed = 0;
    anReset();
    zoneUI(null);
    S.nav = null; S.limit = null; limitUI();
    routeColors();
    setAlert(null);
    $('#navsign').hidden = true; $('#ns-then').hidden = true; $('#lanes').hidden = true; $('#speed').hidden = true;
    drawPuck();
    map.easeTo({ pitch: 0, bearing: 0, duration: 600, essential: true });
  }
  /* Mauvaise route : on recalcule tout de suite depuis l'endroit où l'on est, dans le sens où l'on roule.
     Parmi les trajets possibles, on prend le plus rapide avec le trafic du moment. */
  async function reroute(f) {
    const n = S.nav;
    if (n.rerouting) return;
    n.rerouting = true; n.lastRe = Date.now(); n.off = 0; n.wrong = 0;
    toast('Nouvel itinéraire…');
    try {
      const rs = (await P.route(f.ll, n.dest.ll, n.travel, routeOpts({ heading: (f.speed || 0) > 3 && typeof f.heading === 'number' ? f.heading : undefined }))).slice(0, 3);
      if (S.nav !== n || !rs[0]) { n.rerouting = false; return; }
      let best = rs[0];
      if (rs.length > 1 && n.travel === 'car' && S.mode === 'live' && trafficOn() && P.trafficTime) {
        const tt = await Promise.race([Promise.allSettled(rs.map(r => P.trafficTime(r.geom, tkey()))), new Promise(z => setTimeout(() => z(null), 3500))]);
        if (S.nav !== n) return;
        if (tt) { tt.forEach((x, i) => { if (x.status === 'fulfilled' && x.value) setTraffic(rs[i], x.value); }); best = rs.reduce((a, r) => (r.time < a.time ? r : a), rs[0]); }
      }
      n.route = best; n.s = 0; n.seg = 0; n.k = 0; n.said = {}; n.ui = -2;
      n.lim = null; n.limTo = null; n.li = 0; n.limFail = 0;
      n.zones = null; n.zoneSaid = null; n.tk = 1; n.trafT = best.traf ? Date.now() : 0; n.delay = best.delay || 0;
      S.routes = [best]; S.sel = 0;
      indexReports();
      setSrc('route', { type: 'FeatureCollection', features: [line(best.geom)] });
      setGrad(0, true);
      anReset();
      loadZones(n);
      say('Nouvel itinéraire', true);
      n.lastRe = Date.now();
    } catch (e) { n.lastRe = Date.now() - 4000; /* nouvel essai dans quelques secondes, sans insister à l'écran */ if (!n.reFail) { n.reFail = true; toast('Recalcul impossible pour le moment, je réessaie.'); } }
    n.rerouting = false;
  }
  function navUpdate(f) {
    const n = S.nav, r = n.route, g = r.geom;
    let m = G.nearest(g, r.cum, f.ll, n.seg - 4, n.seg + 45);
    if (m.d > 60) { const m2 = G.nearest(g, r.cum, f.ll, 0, g.length - 2); if (m2.d < m.d - 15) m = m2; }
    let on = f.sim || m.d <= Math.max(32, Math.min(80, (f.acc || 0) * 1.3));
    // On roule nettement dans une autre direction que le trajet (rue manquée, demi-tour) : inutile d'attendre d'être loin.
    if (!f.sim) {
      const hd = (f.speed || 0) > 4 && typeof f.heading === 'number';
      const diff = hd ? Math.abs(G.angDiff(f.heading, G.at(g, r.cum, Math.min(r.dist, m.s + 3)).brg)) : 0;
      n.wrong = hd && diff > 60 && (m.d > 10 || diff > 120) ? (n.wrong || 0) + 1 : 0;
      if (on && n.wrong >= (m.d > 20 ? 2 : 3)) on = false;
      if (!on && n.wrong >= 1) n.off = Math.max(n.off, 1); // loin du trajet ET dans une autre direction : on recalcule sans attendre
    }
    // le bruit du GPS ne doit pas faire reculer le repère : un petit retour en arrière est ignoré
    if (on && !f.sim && m.s < n.s && n.s - m.s < 25) m = { i: n.seg, s: n.s, pt: G.at(g, r.cum, n.s).pt, d: m.d };
    if (on) { n.off = 0; n.seg = m.i; n.s = m.s; f.show = m.pt; f.heading = G.at(g, r.cum, Math.min(r.dist, n.s + 5)).brg; ensureLimits(n); }
    else { f.show = null; if (++n.off >= 2 && Date.now() - n.lastRe > 7000) reroute(f); }
    drawPuck();
    if (on) anRoute(n, f); else anFree(f);
    let k = n.k;
    while (k + 1 < r.steps.length && r.steps[k + 1].s0 <= n.s + 3) k++;
    const changed = k !== n.k;
    n.k = k;
    const cur = r.steps[k], nx = r.steps[k + 1], dn = nx ? Math.max(0, nx.s0 - n.s) : 0;
    n.rem = Math.max(0, r.dist - n.s);
    n.tRem = (cur.tAfter + cur.time * (cur.len > 0 ? Math.max(0, 1 - (n.s - cur.s0) / cur.len) : 0)) * (n.tk || 1);
    trafficNav(n);
    n.next = nx; n.dn = dn;
    if (!nx || n.rem < 18 || (n.rem < 40 && !f.sim && (f.speed || 0) < 1.2)) { arrive(); return; }
    const v = f.speed || 0, far = v < 8.5 ? 150 : v < 15 ? 300 : v < 25 ? 500 : 1000, near = Math.max(30, v * 4), key = k + 1;
    if (nx.type === 'arrive') { if (dn <= far && !n.said['f' + key]) { n.said['f' + key] = 1; if (dn > 60) say('Dans ' + F.say(dn) + ', vous arrivez à destination'); } }
    else if (dn <= near && !n.said['n' + key] && !(n.hold > Date.now() && dn > 12)) {
      n.said['n' + key] = n.said['f' + key] = 1;
      // dans un petit rond-point, « sortez » couperait l'annonce qu'on vient de faire : le panneau suffit
      if (!(nx.type === 'rexit' && cur.type === 'roundabout' && cur.len < 120)) {
        const then = r.steps[k + 2];
        let t = sayText(nx);
        // deux manœuvres qui se suivent de près sont annoncées d'un seul souffle
        if (then && nx.len < 110 && nx.type !== 'roundabout' && then.type !== 'continue' && then.type !== 'note' && then.type !== 'rexit') { t += ', puis ' + (then.type === 'arrive' ? 'vous arrivez à destination' : fr.lower(fr.act(then))); n.said['f' + (key + 1)] = 1; n.hold = Date.now() + 4200; }
        say(t, true);
      }
    }
    else if (dn <= far && dn > near * 1.7 && !n.said['f' + key]) { n.said['f' + key] = 1; say('Dans ' + F.say(dn) + ', ' + fr.lower(sayText(nx))); }
    else if (changed && cur.len > 1500 && dn > far * 1.5) say('Continuez pendant ' + F.say(dn));
    navUI(); zoneUI(n);
    navAlerts(n.s);
    setGrad(n.s / r.dist);
  }
  function navUI() {
    const n = S.nav, nx = n.next;
    if (!nx) return;
    if (n.ui !== n.k) {
      n.ui = n.k;
      $('#ns-arrow').innerHTML = J.arrow(nx);
      $('#ns-act').textContent = fr.act(nx);
      const sign = (nx.type === 'exit' || nx.type === 'ramp' || nx.type === 'fork') && nx.dest;
      const road = nx.type === 'arrive' ? n.dest.name : (sign ? nx.dest : nx.name || nx.dest || ''), re = $('#ns-road');
      re.textContent = road; re.hidden = !road;
      const then = n.route.steps[n.k + 2], te = $('#ns-then');
      if (then && nx.len < 260 && then.type !== 'rexit') { te.innerHTML = 'Puis ' + J.arrow(then) + '<span>' + esc(fr.lower(fr.act(then))) + '</span>'; te.hidden = false; } else te.hidden = true;
      $('#lanes').innerHTML = nx.lanes ? nx.lanes.map(J.lane).join('') : '';
    }
    $('#lanes').hidden = !(nx.lanes && n.dn <= 700);
    $('#ns-dist').textContent = F.dist(n.dn);
    const a = $('#nb-eta');
    if (a) { a.textContent = F.clock(new Date(Date.now() + n.tRem * 1000)); $('#nb-rem').textContent = F.dur(n.tRem); $('#nb-dist').textContent = F.dist(n.rem); }
  }
  function navCam(f, force) { if (force && S.nav) { S.nav.cam = null; S.nav.z = null; } AN.force = true; anKick(); }
  function arrive() {
    const n = S.nav;
    S.arrived = { dest: n.dest, dist: n.route.dist, time: n.simulated ? n.route.time : (Date.now() - n.t0) / 1000, travel: n.travel };
    const last = n.route.steps[n.route.steps.length - 1];
    say((last && last.type === 'arrive' && last.say) || 'Vous êtes arrivé', true);
    endNav(); clearRoute();
    go('arrived');
    const me = S.pos && S.pos.ll, far = me ? G.hav(me, n.dest.ll) : 0;
    if (me && far > 25 && far < 3000) { try { map.fitBounds(G.bounds([me, n.dest.ll]), { padding: pad(), maxZoom: 17, pitch: 0, bearing: 0, duration: 900, essential: true }); } catch (e) { /* écran trop petit */ } }
    else map.easeTo({ center: n.dest.ll, zoom: Math.max(16, Math.min(17, map.getZoom())), pitch: 0, bearing: 0, offset: off(), duration: 900, essential: true });
  }
  function vNav() {
    const on = db.set.voice;
    return '<div class="navbar"><div class="nb-main"><b id="nb-eta">–:––</b><span>arrivée</span></div><div><b id="nb-rem">–</b><span id="nb-dist">–</span></div><div class="nb-btns"><button type="button" class="iconbtn" data-act="mic" aria-label="Commande vocale"' + (SR ? '' : ' hidden') + '>' + ic('mic') + '</button><button type="button" class="iconbtn" data-act="voice" aria-pressed="' + on + '" aria-label="Voix du guidage">' + ic(on ? 'vol' : 'volx') + '</button><button type="button" class="btn danger" data-act="stop">Arrêter</button></div></div>' +
      (S.sim ? '<div class="simbar"><span>Trajet simulé</span><button type="button" class="chip sm" data-act="sim-pause" aria-pressed="' + S.sim.paused + '">' + ic(S.sim.paused ? 'play' : 'pause') + (S.sim.paused ? 'Reprendre' : 'Pause') + '</button><button type="button" class="chip sm" data-act="sim-speed">Vitesse ×' + S.sim.mult + '</button></div>' : '');
  }
  function vArrived() {
    const a = S.arrived;
    return head('Vous êtes arrivé', esc(a.dest.name)) + '<div class="stats"><div><b>' + F.dur(a.time) + '</b><span>de trajet</span></div><div><b>' + F.dist(a.dist) + '</b><span>parcourus</span></div></div><div class="actions">' + (a.travel === 'car' && S.pos ? '<button type="button" class="btn" data-act="park">' + ic('park') + 'Mémoriser ma place</button>' : '') + '<button type="button" class="btn primary big" data-act="close">Terminer</button></div>';
  }

  /* ---------- lieux utiles ---------- */
  function clearPois() { M.pois.forEach(m => m.remove()); M.pois = []; }
  function markSel() { const p = S.view === 'place' || S.view === 'route' ? S.place : null; M.pois.forEach(m => m.getElement().classList.toggle('sel', !!p && m._p === p)); }
  function chipsUI() { document.querySelectorAll('#chips .chip').forEach(c => c.setAttribute('aria-pressed', String(!!S.poi && S.poi.cat === c.dataset.k))); }
  const priceOf = p => (p.extra && p.extra.prices && p.extra.prices[db.set.fuel]) || 0;
  function sortPois() {
    const po = S.poi, ref = S.pos ? S.pos.ll : po.center;
    po.best = 0;
    if (po.cat === 'fuel') po.items.forEach(p => { const v = priceOf(p); if (v && (!po.best || v < po.best)) po.best = v; });
    po.items.sort((a, b) => ((priceOf(a) || 99) - (priceOf(b) || 99)) * (po.cat === 'fuel' ? 1 : 0) || G.hav(ref, a.ll) - G.hav(ref, b.ll));
  }
  function drawPois() {
    clearPois();
    const po = S.poi;
    (po.items || []).slice(0, 18).forEach(p => { // les 18 premiers de la liste : au-delà, les pastilles se recouvrent
      const v = po.cat === 'fuel' ? priceOf(p) : 0;
      const m = mk(ic(KIND_IC[po.cat] || 'pin') + (v ? '<b>' + F.dec(v, 3) + '</b>' : ''), 'poi ' + po.cat + (v && v === po.best ? ' best' : '')).setLngLat(p.ll).addTo(map), el = m.getElement();
      el.setAttribute('role', 'button'); el.setAttribute('aria-label', p.name);
      el.addEventListener('click', () => { if (S.view !== 'nav') openPlace(p, false); });
      m._p = p;
      M.pois.push(m);
    });
  }
  async function showPois(cat) {
    if (S.poi && S.poi.cat === cat) { closePois(); return; }
    const seq = ++S.poiSeq;
    if (S.view === 'route') { S.routeSeq++; S.loading = false; clearRoute(); }
    clearPois(); S.place = null; setDest(null);
    // autour de toi tant que ta position est à l'écran ; sinon autour de l'endroit que tu regardes
    let around = center(), mine = false;
    try { if (S.pos && map.getBounds().contains(S.pos.ll)) { around = S.pos.ll; mine = true; } } catch (e) { /* carte pas encore prête */ }
    S.poi = { cat, items: null, err: false, center: around, best: 0, mine };
    chipsUI(); go('pois');
    try {
      const items = await P.pois(cat, S.poi.center);
      if (seq !== S.poiSeq || !S.poi) return;
      S.poi.items = items; sortPois(); drawPois();
    } catch (e) {
      if (seq !== S.poiSeq || !S.poi) return;
      S.poi.items = []; S.poi.err = true;
    }
    if (S.view === 'pois') render();
    const near = (S.poi.items || []).slice(0, 10), b = near.length ? G.bounds(near.map(p => p.ll).concat([S.poi.center])) : null;
    if (b) requestAnimationFrame(() => {
      try { map.fitBounds(b, { padding: pad(), maxZoom: 15.6, duration: 800, bearing: 0, pitch: 0, essential: true }); } catch (e) { /* cadrage impossible */ }
    });
  }
  function closePois() { S.poiSeq++; clearPois(); S.poi = null; chipsUI(); go('home'); }
  function vPois() {
    const po = S.poi, c = CATS.find(x => x.id === po.cat);
    const where = po.mine ? 'autour de toi' : 'dans la zone affichée';
    let h = head(c.label, po.items && po.items.length ? po.items.length + (po.items.length > 1 ? ' lieux ' : ' lieu ') + where : '');
    if (!po.items) return h + '<p class="empty">Recherche ' + where + '…</p>';
    if (po.err) return h + '<p class="empty">Impossible de charger ces lieux. Vérifie ta connexion et réessaie.</p>';
    if (!po.items.length) return h + '<p class="empty">Rien trouvé dans cette zone. Déplace la carte puis touche à nouveau « ' + c.label + ' ».</p>';
    if (po.cat === 'fuel' && po.items.some(p => p.extra && p.extra.prices)) {
      const have = Object.keys(FUELS).filter(k => po.items.some(p => p.extra && p.extra.prices && p.extra.prices[k]));
      h += '<div class="opts">' + have.map(k => '<button type="button" class="chip sm" aria-pressed="' + (db.set.fuel === k) + '" data-act="fuel" data-k="' + k + '">' + FUELS[k] + '</button>').join('') + '</div>';
    }
    return h + '<div class="list">' + po.items.map(p => {
      const v = po.cat === 'fuel' ? priceOf(p) : 0, d = S.pos ? F.dist(G.hav(S.pos.ll, p.ll)) : '';
      return '<button type="button" class="row" data-act="pick-poi" data-i="' + reg(p) + '"><span class="ri">' + ic(KIND_IC[p.kind] || 'pin') + '</span><span class="rt"><b>' + esc(p.name) + '</b><small>' + esc([p.sub, v ? d : ''].filter(Boolean).join(' · ')) + '</small></span><span class="rr' + (v ? ' price' + (v === po.best ? ' best' : '') : '') + '">' + (v ? F.dec(v, 3) + ' €' : d) + '</span></button>';
    }).join('') + '</div>';
  }

  /* ---------- accueil, signalement, réglages, à propos ---------- */
  function vHome() {
    const qd = (k, label, p) => '<button type="button" class="qd" data-act="quick" data-k="' + k + '">' + ic(k) + '<span><b>' + label + '</b><small>' + (p ? esc(p.name) : 'Ajouter') + '</small></span></button>';
    let h = '<div class="quick">' + qd('home', 'Maison', db.home) + qd('work', 'Travail', db.work) + '</div>';
    if (S.mode === 'demo' && D.trip) h += '<button type="button" class="democard" data-act="demo-trip"><span class="dc-t">Trajet d’essai</span><b>' + esc(D.trip.name) + '</b><small>Saint-Aubin-les-Bornes, par l’A 99 ou la D 12</small>' + ic('chev') + '</button>';
    const rows = [];
    if (db.parked) rows.push('<button type="button" class="row" data-act="parked"><span class="ri">' + ic('car') + '</span><span class="rt"><b>Ma voiture</b><small>Garée ' + F.ago(db.parked.t) + '</small></span></button>');
    db.recents.slice(0, 2).forEach(p => rows.push(row(p, 'clock')));
    if (rows.length) h += '<div class="list">' + rows.join('') + '</div>';
    return h;
  }
  function vReport() {
    return head('Que se passe-t-il ?', S.pos ? 'Le signalement est posé à ta position.' : 'Le signalement est posé au centre de la carte.') + '<label class="repnote-f" for="rep-note">Commentaire (facultatif)<input id="rep-note" type="text" maxlength="80" enterkeyhint="done" autocomplete="off" placeholder="Ex. : voie de droite, gros trou…"></label><p class="note">Écris ton commentaire si tu veux, puis touche le type de signalement.</p><div class="repgrid">' + Object.keys(REPORTS).map(k => '<button type="button" class="rep" data-act="rep" data-k="' + k + '">' + J.signs[k] + '<span>' + REPORTS[k].label + '</span></button>').join('') + '</div>';
  }
  function vRep() {
    const rp = S.rep;
    return head(REPORTS[rp.type].label, 'Signalé ' + F.ago(rp.t) + (rp.ex ? ' · exemple de la démo' : rp.sh ? ' · signalé par un autre utilisateur' : rp.sid ? ' · partagé' : '')) + (rp.note ? '<p class="repnote">« ' + esc(rp.note) + ' »</p>' : '') + '<div class="actions"><button type="button" class="btn big" data-act="rep-yes">' + ic('check') + 'Toujours là</button><button type="button" class="btn big" data-act="rep-no">Ce n’est plus là</button></div>';
  }
  function vSettings() {
    const s = db.set, tog = (k, label) => '<label class="tog" for="set-' + k + '"><input type="checkbox" id="set-' + k + '" data-set="' + k + '"' + (s[k] ? ' checked' : '') + '>' + label + '</label>';
    let places = '';
    const pl = (label, p, k) => '<div class="row"><span class="ri">' + ic(k === 'home' ? 'home' : k === 'work' ? 'work' : k === 'parked' ? 'car' : 'star') + '</span><span class="rt"><b>' + esc(label) + '</b><small>' + esc(p.name || '') + '</small></span><button type="button" class="iconbtn" data-act="del-place" data-k="' + k + '" aria-label="Supprimer ' + esc(label) + '">' + ic('trash') + '</button></div>';
    if (db.home) places += pl('Maison', db.home, 'home');
    if (db.work) places += pl('Travail', db.work, 'work');
    db.favs.forEach((p, i) => { places += pl(p.name, { name: p.sub }, 'fav' + i); });
    if (db.parked) places += pl('Ma voiture', { name: 'Garée ' + F.ago(db.parked.t) }, 'parked');
    return head('Réglages', '') + '<div class="set">' + tog('voice', 'Voix du guidage') + tog('beep', 'Bip si je dépasse la limitation') + tog('tolls', 'Éviter les péages') + tog('hw', 'Éviter les autoroutes') + tog('zones', 'Annoncer les zones de danger') + tog('share', 'Partager mes signalements et voir ceux des autres') +
      '<h3>Trafic en direct</h3>' + tog('traffic', 'Afficher le trafic sur la carte') +
      '<p class="note">' + (S.mode !== 'live' ? 'Le trafic s’affiche sur la vraie carte, pas dans la démo.' : 'Vert : fluide. Orange : ralenti. Rouge : bouchon. Données TomTom.') + '</p>' +
      '<h3>Coût du trajet</h3>' +
      '<label class="field" for="set-conso">Consommation<span><input id="set-conso" type="number" inputmode="decimal" step="0.1" min="1" max="30" value="' + s.conso + '" data-set="conso">L/100 km</span></label>' +
      '<label class="field" for="set-prix">Prix du carburant<span><input id="set-prix" type="number" inputmode="decimal" step="0.01" min="0.3" max="5" value="' + s.prix + '" data-set="prix">€/L</span></label>' +
      '<label class="field" for="set-fuel">Mon carburant<select id="set-fuel" data-set="fuel">' + Object.keys(FUELS).map(k => '<option value="' + k + '"' + (s.fuel === k ? ' selected' : '') + '>' + FUELS[k] + '</option>').join('') + '</select></label>' +
      '<h3>Mes lieux</h3>' + (places ? '<div class="list">' + places + '</div>' : '<p class="note">Aucun lieu enregistré. Ouvre un lieu puis touche « Enregistrer ».</p>') +
      '<h3>À propos</h3><p class="note">' + (S.mode === 'live' ? 'Carte et lieux : © les contributeurs d’OpenStreetMap, fond OpenFreeMap. Adresses : Base Adresse Nationale. Commerces : annuaire des entreprises (Sirene). Photos aériennes : IGN. Prix des carburants : données ouvertes du ministère de l’Économie. Météo : Open-Meteo. Pour installer Lunavia sur ton téléphone, ouvre le menu du navigateur puis « Ajouter à l’écran d’accueil ». Version __VERSION__.' : 'Tu utilises la carte de démonstration. ' + (HOME ? 'La vraie carte, avec le monde entier, ta position et la recherche d’adresses, est en ligne à l’adresse <span class="sel addr">' + esc(HOME_TXT) + '</span>.' : 'Une fois Lunavia mis en ligne, la carte du monde, ta position et la recherche d’adresses s’activent toutes seules.')) + '</p>' +
      (S.mode === 'live' ? '<div class="actions">' + (S.wipe ? '<button type="button" class="btn danger" data-act="wipe-yes">Oui, tout effacer</button><button type="button" class="btn" data-act="wipe-no">Annuler</button>' : '<button type="button" class="btn danger" data-act="wipe">' + ic('trash') + 'Effacer mes données</button>') + '</div>' : '') + '</div>';
  }
  function vAbout() {
    // dans l'aperçu de Claude, la vraie carte ne peut pas s'afficher : on montre le chemin vers son adresse
    const out = S.demoWhy === 'policy' && HOME;
    return head('Mode démonstration', '') + '<div class="about"><p>La carte en ligne et le GPS ne sont pas accessibles ici. Lunavia affiche donc <b>Val-Lunavia</b>, une petite ville inventée, pour te laisser essayer toutes les fonctions : recherche, itinéraires, guidage, signalements, prix des carburants.</p>' +
      (out ? '<p>La vraie carte, avec le monde entier, ta position et les vraies adresses, s’ouvre à sa propre adresse :<br><b class="sel addr">' + esc(HOME_TXT) + '</b></p><div class="actions"><a class="btn primary big" href="' + esc(HOME) + '" target="_blank" rel="noopener">' + ic('globe') + 'Ouvrir la vraie carte</a></div><div class="actions"><button type="button" class="btn" data-act="demo-trip">' + ic('play') + 'Lancer le trajet d’essai ici</button></div></div>'
        : '<p class="note">Une fois l’appli mise en ligne à sa propre adresse, la carte du monde réel, ta position et les vraies adresses remplacent la démo, sans rien changer d’autre.</p><div class="actions"><button type="button" class="btn primary big" data-act="demo-trip">' + ic('play') + 'Lancer le trajet d’essai</button>' + (S.demoWhy === 'guess' || S.demoWhy === 'asked' ? '<button type="button" class="btn" data-act="reload">Ouvrir la vraie carte</button>' : '') + '</div></div>');
  }

  /* ---------- affichage ---------- */
  function render() {
    const v = S.view;
    sheet.hidden = v === 'search';
    $('#results').hidden = v !== 'search';
    $('#sb-lead').innerHTML = v === 'search' ? ic('back') : J.logo;
    $('#sb-lead').setAttribute('aria-label', v === 'search' ? 'Retour' : 'Lunavia');
    $('#sb-set').hidden = v === 'search';
    $('#sb-clear').hidden = !(v === 'search' && S.q);
    app.classList.toggle('navon', !!S.nav);
    $('#navsign').hidden = !S.nav;
    if (!S.nav) { $('#ns-then').hidden = true; $('#lanes').hidden = true; }
    $('#reportbtn').hidden = v === 'report' || v === 'settings' || v === 'about' || v === 'arrived';
    $('#demoflag').hidden = S.mode !== 'demo' || v === 'about';
    if (v === 'search') renderResults();
    else {
      sheetIn.innerHTML = v === 'place' ? vPlace() : v === 'route' ? vRoute() : v === 'nav' ? vNav() : v === 'pois' ? vPois() : v === 'report' ? vReport() : v === 'rep' ? vRep() : v === 'settings' ? vSettings() : v === 'about' ? vAbout() : v === 'arrived' ? vArrived() : vHome();
      sheetIn.scrollTop = 0;
    }
    syncInsets();
    if (map) northUI();
    if (S.nav && v === 'nav') { S.nav.ui = -2; if (S.nav.next) navUI(); }
  }
  function go(v) { if (v !== 'search' && S.view !== v) S.shareText = ''; S.view = v; app.dataset.view = v; render(); markSel(); }
  function close() {
    switch (S.view) {
      case 'place': S.place = null; setDest(null); go(S.poi ? 'pois' : 'home'); break;
      case 'route': S.routeSeq++; S.loading = false; clearRoute(); if (S.place) { setDest(S.place.ll); go('place'); } else { setDest(null); go('home'); } break;
      case 'pois': closePois(); break;
      case 'arrived': S.arrived = null; S.place = null; setDest(null); go('home'); break;
      case 'report': case 'rep': case 'settings': case 'about': S.wipe = false; go(S.nav ? 'nav' : S.back === 'place' && !S.place ? 'home' : S.back === 'pois' && !S.poi ? 'home' : S.back || 'home'); break;
      default: go('home');
    }
  }

  /* ---------- actions ---------- */
  const ACT = {
    reload() { try { if (/demo/i.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* adresse inchangée */ } location.reload(); },
    'force-demo'() { location.hash = 'demo'; location.reload(); },
    lead() { if (S.view === 'search') exitSearch(); else input.focus(); },
    clear() { clearSearch(); renderResults(); input.focus(); },
    settings() { S.back = S.view; S.wipe = false; go('settings'); },
    about() { S.back = S.view === 'place' || S.view === 'pois' ? S.view : 'home'; go('about'); },
    close,
    pick(el) { const p = REG[+el.dataset.i]; if (!p) return; if (S.view === 'search') choose(p); else { addRecent(p); openPlace(p, true); } },
    'pick-poi'(el) { const p = REG[+el.dataset.i]; if (p) openPlace(p, true); },
    cat(el) { showPois(el.dataset.k); },
    fuel(el) { db.set.fuel = el.dataset.k; save(); sortPois(); drawPois(); render(); },
    quick(el) { const k = el.dataset.k; if (db[k]) { S.place = null; plan(db[k]); } else { S.pick = k; S.prev = 'home'; go('search'); input.focus(); } },
    'demo-trip'() { if (!D) return; S.place = null; S.travel = 'car'; setOrigin(null); plan(D.trip); },
    parked() { if (!db.parked) return; S.travel = 'foot'; openPlace({ id: 'parked', name: 'Ma voiture', sub: 'Garée ' + F.ago(db.parked.t), ll: db.parked.ll, kind: 'parking', cat: 'other', extra: {}, parked: true }, true); },
    park() { if (!S.pos) return; db.parked = { ll: (S.pos.show || S.pos.ll).map(v => +v.toFixed(6)), t: Date.now() }; save(); drawParked(); toast('Place mémorisée'); close(); },
    unpark() { db.parked = null; save(); drawParked(); toast('Place oubliée'); close(); },
    route() { if (S.place) plan(S.place); },
    retry() { if (S.dest) plan(S.dest); },
    save() { S.saveMenu = !S.saveMenu; render(); },
    'save-as'(el) {
      const k = el.dataset.k, p = S.place;
      if (k === 'fav') { if (isFav(p)) { db.favs = db.favs.filter(f => !same(f, p)); toast('Retiré des favoris'); } else { db.favs = [strip(p)].concat(db.favs).slice(0, 30); toast('Ajouté aux favoris'); } }
      else { db[k] = strip(p, k); toast(k === 'home' ? 'Maison enregistrée' : 'Travail enregistré'); }
      save(); S.saveMenu = false; render();
    },
    from() { const p = strip(S.place); S.place = null; setDest(null); setOrigin(p); go(S.poi ? 'pois' : 'home'); toast('Départ défini. Choisis maintenant la destination.'); },
    'origin-reset'() { setOrigin(null); if (S.dest) plan(S.dest); },
    'pick-origin'() { S.pick = 'origin'; S.prev = 'route'; go('search'); input.focus(); },
    async share() {
      const p = S.place, lat = p.ll[1].toFixed(5), lon = p.ll[0].toFixed(5);
      const own = /^https?:$/.test(location.protocol) ? location.origin + location.pathname + '?p=' + lat + ',' + lon + ',' + encodeURIComponent(p.name.slice(0, 60)) : '';
      const url = own || 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lon + '#map=17/' + lat + '/' + lon, text = p.name + (p.sub ? ', ' + p.sub : '');
      try { if (navigator.share) { await navigator.share({ title: p.name, text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
      try { await navigator.clipboard.writeText(text + '\n' + url); toast('Lien copié'); }
      catch (e) { S.shareText = text + ' ' + url; render(); }
    },
    mode(el) { if (S.travel === el.dataset.k) return; S.travel = el.dataset.k; if (S.dest) plan(S.dest); },
    opt(el) { const k = el.dataset.k; db.set[k] = !db.set[k]; save(); if (S.dest) plan(S.dest); },
    alt(el) { S.sel = +el.dataset.i; S.altPicked = true; drawRoutes(false); render(); },
    start() { startNav(false); },
    sim() { startNav(true); },
    // bouton palette : carte claire ou noir doux ; le choix est gardé pour les prochaines ouvertures
    theme() { const next = isDark() ? 'light' : 'dark'; db.set.theme = next; save(); document.documentElement.setAttribute('data-theme', next); themeUI(); toast(next === 'dark' ? 'Carte en noir doux' : 'Carte claire'); },
    mic() { listen(); },
    stop() { if (!S.nav) return; endNav(); if (S.routes.length && S.dest) { go('route'); drawRoutes(true); } else { clearRoute(); setDest(null); go('home'); } },
    voice() { db.set.voice = !db.set.voice; save(); if (!db.set.voice) { try { speechSynthesis.cancel(); } catch (e) { /* rien */ } } else say('Voix activée'); render(); },
    'sim-pause'() { if (S.sim) { S.sim.paused = !S.sim.paused; render(); } },
    'sim-speed'() { if (S.sim) { S.sim.mult = S.sim.mult >= 4 ? 1 : S.sim.mult * 2; render(); } },
    report() { S.back = S.view === 'place' || S.view === 'pois' ? S.view : 'home'; go('report'); },
    rep(el) {
      const type = el.dataset.k, p = S.pos ? (S.pos.show || S.pos.ll) : center();
      const rp = { id: 'r' + Date.now().toString(36), type, ll: [+p[0].toFixed(6), +p[1].toFixed(6)], t: Date.now() };
      const noteEl = $('#rep-note'), note = noteEl ? noteEl.value.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
      if (note) rp.note = note;
      db.reports.push(rp); save(); drawReports();
      postShared(rp);
      S.freeAlerted[rp.id] = 2;
      if (S.nav) { S.nav.alerted[rp.id] = 2; indexReports(); }
      if (S.view === 'report') close(); // posé à la voix : on reste sur l'écran en cours
      if (type === 'closed' && S.nav && S.pos) reroute(S.pos);
      toast(REPORTS[type].said + ' ici' + (sharing() ? ', partagé avec les autres utilisateurs' : S.mode === 'live' ? ', gardé sur cet appareil' : '') + '.');
    },
    'rep-yes'() { if (S.rep) { S.rep.t = Date.now(); save(); voteShared(S.rep, true); toast('Merci, signalement confirmé.'); } close(); },
    'rep-no'() { if (S.rep) dropReport(S.rep); S.rep = null; toast('Signalement retiré.'); close(); },
    'al-yes'() { const rp = S.alertRp; if (!rp) return; rp.t = Date.now(); save(); voteShared(rp, true); if (S.nav) S.nav.alerted[rp.id] = 2; S.freeAlerted[rp.id] = 2; setAlert(null); },
    'al-no'() { const rp = S.alertRp; if (!rp) return; if (S.nav) S.nav.alerted[rp.id] = 2; S.freeAlerted[rp.id] = 2; setAlert(null); dropReport(rp); },
    layers() {
      if (S.mode !== 'live') { toast('Les photos aériennes arrivent avec la vraie carte.'); return; }
      S.base = S.base === 'sat' ? 'plan' : 'sat';
      if (map.getLayer('sat')) map.setLayoutProperty('sat', 'visibility', S.base === 'sat' ? 'visible' : 'none');
      $('#layers').classList.toggle('on', S.base === 'sat');
      attrib();
      toast(S.base === 'sat' ? 'Photos aériennes (France)' : 'Plan');
    },
    north() { unfollow(); map.easeTo({ bearing: 0, pitch: 0, duration: 500, essential: true }); },
    locate() {
      if (S.mode === 'live' && S.watch == null && !S.sim) startGPS(true);
      if (!S.pos) { if (S.mode === 'live' && !S.denied) toast('Je cherche ta position…'); return; }
      S.follow = true; $('#locate').classList.add('on');
      if (S.nav) { S.nav.zLock = null; navCam(S.pos, true); }
      else map.easeTo({ center: S.pos.ll, zoom: Math.max(map.getZoom(), 15), bearing: 0, pitch: 0, offset: off(), duration: 700, essential: true });
      northUI();
    },
    'del-place'(el) {
      const k = el.dataset.k;
      if (k === 'home' || k === 'work') db[k] = null;
      else if (k === 'parked') { db.parked = null; drawParked(); }
      else if (/^fav\d+$/.test(k)) db.favs.splice(+k.slice(3), 1);
      save(); render();
    },
    wipe() { S.wipe = true; render(); },
    'wipe-no'() { S.wipe = false; render(); },
    'wipe-yes'() {
      try { localStorage.removeItem(KEY); } catch (e) { /* rien à effacer */ }
      db = load(); S.wipe = false; setOrigin(null); drawReports(); drawParked(); render();
      toast('Données effacées de cet appareil.');
    }
  };

  /* ---------- démarrage ---------- */
  function bind() {
    document.addEventListener('click', e => {
      const el = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!el || el.disabled) return;
      const fn = ACT[el.dataset.act];
      if (fn) fn(el, e);
    });
    document.addEventListener('change', e => {
      const t = e.target, k = t && t.dataset ? t.dataset.set : null;
      if (!k) return;
      if (t.type === 'checkbox') db.set[k] = t.checked;
      else if (t.type === 'number') { const v = parseFloat(String(t.value).replace(',', '.')); if (v >= +t.min && v <= +t.max) db.set[k] = v; else t.value = db.set[k]; }
      else db.set[k] = t.value;
      save();
      if (k === 'share') { if (db.set.share) syncShared(true); else { db.reports = db.reports.filter(r => !r.sh); save(); drawReports(); } }
      if (k === 'traffic') { setBase(); attrib(); toast(db.set.traffic ? 'Trafic affiché' : 'Trafic masqué'); }
    });
    $('#searchbar').addEventListener('submit', e => e.preventDefault());
    input.addEventListener('focus', () => { if (S.view !== 'search') { S.prev = S.view; go('search'); } });
    input.addEventListener('input', () => {
      S.q = input.value;
      $('#sb-clear').hidden = !S.q;
      clearTimeout(searchT);
      const q = S.q.trim();
      searchSeq++;
      if (q.length < 2) { S.results = null; renderResults(); return; }
      // les résultats déjà affichés restent à l'écran pendant qu'on cherche la suite
      S.searching = true;
      if (!S.results || !S.results.length) { S.results = null; }
      renderResults();
      searchT = setTimeout(() => runSearch(q), 170);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); if (S.results && S.results[0]) choose(S.results[0]); }
      else if (e.key === 'Escape') exitSearch();
    });
    // Téléphone tourné : on recale tout (panneaux, carte). Sur iPhone, une appli installée peut garder l'ancienne
    // géométrie quelques instants après la rotation, et les boutons ne répondent plus là où on les voit : on recale donc
    // plusieurs fois de suite, et on remet la page tout en haut.
    const settle = () => { syncInsets(); try { window.scrollTo(0, 0); } catch (e) { /* rien */ } if (map) { try { map.resize(); } catch (e) { /* carte pas prête */ } } };
    const turned = () => { settle(); setTimeout(settle, 350); setTimeout(settle, 1000); };
    window.addEventListener('resize', turned);
    window.addEventListener('orientationchange', turned);
    if (WIDE.addEventListener) WIDE.addEventListener('change', turned);
    // « Arrêter » doit toujours répondre : si le toucher n'est pas suivi du clic habituel, on arrête quand même
    document.addEventListener('touchend', e => {
      const el = e.target && e.target.closest ? e.target.closest('[data-act="stop"]') : null;
      if (!el) return;
      const t = setTimeout(() => ACT.stop(), 450);
      document.addEventListener('click', () => clearTimeout(t), { once: true, capture: true });
    }, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(syncInsets).observe(sheet);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.nav) wake(true); });
    const themed = () => { setBase(); themeUI(); };
    themeUI();
    micUI(false);
    if (mq) { if (mq.addEventListener) mq.addEventListener('change', themed); else if (mq.addListener) mq.addListener(themed); }
    if (window.MutationObserver) new MutationObserver(themed).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    try { if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.addEventListener('voiceschanged', pickVoice); } } catch (e) { /* pas de voix */ }
  }
  function ready() {
    (S.upd || Promise.resolve()).then(hideSplash);
    attrib(); zoomClasses(); northUI();
    if (S.mode === 'demo') {
      D.labels.forEach(l => mk(esc(l.text), 'lbl ' + l.cls, l.rot != null ? { rotation: l.rot, rotationAlignment: 'map', pitchAlignment: 'map' } : {}).setLngLat(l.ll).addTo(map));
      onFix({ ll: D.start.ll, acc: 5, speed: 0, heading: D.start.heading, t: Date.now(), sim: true }, true);
      // premier cadrage : la position de départ et le centre-ville dans la partie visible
      map.easeTo({ center: [(D.start.ll[0] + D.center[0]) / 2, (D.start.ll[1] + D.center[1]) / 2], zoom: WIDE.matches ? 14.6 : 14.1, offset: off(), duration: 0 });
    } else {
      startGPS(false);
      openShared();
    }
    drawReports(); drawParked();
  }
  // lien partagé « ?p=latitude,longitude,nom » : le lieu s'ouvre directement
  function openShared() {
    let v = null;
    try { v = new URLSearchParams(location.search).get('p'); } catch (e) { return; }
    const m = v && v.match(/^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)(?:,(.*))?$/);
    if (!m) return;
    const lat = +m[1], lon = +m[2];
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return;
    const p = { id: 'x' + lat + ',' + lon, name: (m[3] || 'Lieu partagé').slice(0, 60), sub: lat.toFixed(5) + ', ' + lon.toFixed(5), ll: [lon, lat], kind: 'pin', cat: 'address', extra: {} };
    map.jumpTo({ center: p.ll, zoom: 15.5 });
    S.follow = false;
    openPlace(p, true);
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* adresse inchangée */ }
  }
  // l'aperçu dans Claude interdit tout accès au réseau : ce blocage se reconnaît à son signalement, ou à un refus immédiat
  let cspSeen = false;
  document.addEventListener('securitypolicyviolation', () => { cspSeen = true; });
  /* À chaque ouverture : un écran de chargement pendant que l'appli regarde s'il existe une version plus récente.
     Si oui, elle la charge avant de démarrer. Sans réseau, ou dans l'aperçu de Claude, elle démarre telle quelle. */
  const BUILD = '__BUILD__';
  async function checkUpdate() {
    const msg = $('#sp-msg'), t0 = Date.now(), hosted = !!document.querySelector('meta[content="jalon:carte"]');
    $('#sp-logo').innerHTML = hosted ? '<img src="icons/icon-192.png" alt="" width="112" height="112">' : J.logo;
    if (hosted && navigator.onLine !== false) {
      msg.textContent = 'Recherche d’une mise à jour…';
      try {
        const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 4000);
        const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store', signal: ctl.signal });
        clearTimeout(tm);
        const j = r.ok ? await r.json() : null;
        if (j && j.build && j.build !== BUILD) {
          let tried = null, canMark = true;
          try { tried = sessionStorage.getItem('jalon.maj'); sessionStorage.setItem('jalon.maj', j.build); } catch (e) { canMark = false; }
          if (canMark && tried !== j.build) { // une seule tentative par version, pour ne jamais tourner en boucle
            msg.textContent = 'Mise à jour en cours…';
            try { const reg = await navigator.serviceWorker.getRegistration(); if (reg) await reg.update(); } catch (e) { /* pas d'aide-mémoire */ }
            try { await fetch(location.pathname, { cache: 'reload' }); } catch (e) { /* le rechargement s'en chargera */ }
            location.reload();
            await new Promise(() => {});
          }
        } else if (j && j.build) msg.textContent = 'Lunavia est à jour';
      } catch (e) { msg.textContent = 'Démarrage…'; }
    } else if (hosted) msg.textContent = 'Pas de réseau : démarrage sans vérification';
    const left = 900 - (Date.now() - t0);
    if (left > 0) await new Promise(r => setTimeout(r, left));
  }
  function hideSplash() { const sp = $('#splash'); if (!sp || sp.hidden) return; sp.classList.add('out'); setTimeout(() => { sp.hidden = true; }, 320); }
  // Trafic TomTom : la clé de l'appli, valable pour tous les téléphones (verrouillée côté TomTom sur l'adresse du site).
  // Une clé collée dans les réglages d'un appareil, si elle existe encore, passe devant.
  const TKEY = 'rHBuepoZuWML68zrSZKED9Sh2fJWoecv';
  const tkey = () => { const k = String((db && db.set.tkey) || '').trim(); return /^[A-Za-z0-9]{20,60}$/.test(k) ? k : TKEY; };
  const trafficOn = () => !!(db && db.set.traffic && tkey());
  function themeUI() { const b = $('#theme'); if (b) { b.classList.toggle('on', isDark()); b.setAttribute('aria-pressed', isDark()); } }
  async function boot() {
    const upd = checkUpdate().catch(() => {});
    S.upd = upd;
    document.querySelectorAll('[data-ic]').forEach(el => { el.innerHTML = ic(el.dataset.ic); });
    $('#sb-lead').innerHTML = J.logo;
    $('#reportbtn').innerHTML = J.signs.danger;
    $('#chips').innerHTML = CATS.map(c => '<button type="button" class="chip" data-act="cat" data-k="' + c.id + '" aria-pressed="false">' + ic(c.icon) + c.label + '</button>').join('');
    db = load();
    if (db.set.theme === 'dark' || db.set.theme === 'light') document.documentElement.setAttribute('data-theme', db.set.theme);
    bind();
    if (!window.maplibregl) { fail('La carte n’a pas pu se charger. Vérifie ta connexion, puis réessaie.'); return; }
    let st = null;
    const forced = /demo/i.test(location.hash);
    if (!forced) {
      const t0 = Date.now();
      try { st = await J.live.style('liberty'); } catch (e) { st = null; }
      if (st && isDark()) { try { st = await J.live.style('noir'); } catch (e) { /* on garde le fond clair */ } }
      if (!st) {
        const quick = Date.now() - t0 < 600;
        await new Promise(r => setTimeout(r, 60)); // laisse le temps au signalement de blocage d'arriver
        const viewer = cspSeen || !!window.claude;
        if (!viewer && !(quick && navigator.onLine !== false)) { fail('Impossible de joindre la carte en ligne. Vérifie ta connexion, puis réessaie.', true); return; }
        S.demoWhy = viewer ? 'policy' : 'guess';
      }
    } else S.demoWhy = 'asked';
    S.mode = st ? 'live' : 'demo';
    app.dataset.mode = S.mode;
    if (S.mode === 'demo' && S.demoWhy === 'policy' && HOME) $('#demoflag span').textContent = 'Voir la vraie carte';
    let c0, z0;
    if (S.mode === 'demo') {
      D = J.demo.build(); P = D.provider;
      db = { home: D.home, work: D.work, favs: [], recents: D.recents.slice(), reports: D.reports.slice(), parked: null, last: null, set: Object.assign({}, DEFSET) };
      st = D.style(isDark()); c0 = D.center; z0 = D.zoom;
    } else {
      P = J.live;
      db.reports = activeReports();
      c0 = db.last || [2.45, 46.6]; z0 = db.last ? 13.5 : 5.2;
    }
    try {
      map = new maplibregl.Map({ container: 'map', style: st, center: c0, zoom: z0, attributionControl: false, maxPitch: 62, fadeDuration: 120 });
    } catch (e) { fail('Cet appareil ne peut pas afficher la carte.'); return; }
    let started = false;
    const first = () => { if (started) return; started = true; ready(); };
    map.on('style.load', () => { overlays(); first(); });
    map.once('load', first);
    map.on('rotate', northUI); map.on('pitch', northUI); map.on('zoom', zoomClasses);
    ['dragstart', 'rotatestart', 'pitchstart'].forEach(ev => map.on(ev, e => { if (e.originalEvent) unfollow(); }));
    // pendant qu'un doigt est sur la carte, elle ne bouge pas toute seule
    const cv = map.getCanvasContainer();
    ['touchstart', 'mousedown'].forEach(ev => cv.addEventListener(ev, () => { AN.touch = true; }, { passive: true }));
    ['touchend', 'touchcancel', 'mouseup', 'mouseleave'].forEach(ev => cv.addEventListener(ev, () => { AN.touch = false; }, { passive: true }));
    map.on('zoomend', e => { if (e.originalEvent && S.nav) S.nav.zLock = map.getZoom(); });
    map.on('click', onMapClick);
    map.on('error', () => { /* tuile ou police manquante : la carte continue */ });
    render();
  }
  J.app = { S, get map() { return map; }, get M() { return M; }, get db() { return db; }, get D() { return D; }, ACT, go };
  boot().catch(e => { try { console.error(e); } catch (x) { /* rien */ } if (!map) fail('Lunavia n’a pas pu démarrer. Recharge la page.'); });
})();
