// Banc d'essai : un seul petit serveur local qui joue le rôle de tous les services en ligne de Jalon.
// Les tests redirigent https://<service>/chemin vers http://127.0.0.1:8003/<service>/chemin
import http from 'http';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { createRequire } from 'module';
const require = createRequire('/home/claude/jalon/');
const geojsonvt = require('geojson-vt').default || require('geojson-vt');
const vtpbf = require('vt-pbf');

const BED = path.dirname(new URL(import.meta.url).pathname), DATA = path.join(BED, 'data');
const REF = '/home/claude/jalon/ref';
const PORT = 8003, VALHALLA = 'http://127.0.0.1:8002';
const flags = { valhallaDown: false, osrmDown: false, overpassDown: false, photonDown: false, fuelDown: false, slow: 0 };

/* ---------- carte : couches découpées à la demande ---------- */
const LAYERS = ['landcover', 'landuse', 'park', 'water', 'waterway', 'transportation', 'building', 'transportation_name', 'place', 'poi'];
const index = {};
console.time('index');
for (const l of LAYERS) {
  const f = path.join(DATA, 'layer-' + l + '.ndjson');
  const feats = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(s => JSON.parse(s)) : [];
  index[l] = geojsonvt({ type: 'FeatureCollection', features: feats }, { maxZoom: 14, indexMaxZoom: 4, indexMaxPoints: 200000, tolerance: 3, buffer: 64, extent: 4096 });
}
console.timeEnd('index');
const RANK = { motorway: 6, trunk: 7, primary: 8, secondary: 10, tertiary: 11, minor: 12, service: 13, track: 13, path: 13, busway: 13, rail: 8, transit: 11 };
function tile(z, x, y) {
  const out = {};
  for (const l of LAYERS) {
    if (l === 'building' && z < 13) continue;
    if (l === 'poi' && z < 14) continue;
    if (l === 'waterway' && z < 9) continue;
    const t = index[l].getTile(z, x, y);
    if (!t || !t.features.length) continue;
    let fs2 = t.features;
    if (l === 'transportation') fs2 = fs2.filter(f => z >= (RANK[f.tags.class] || 13));
    if (l === 'transportation_name') fs2 = fs2.filter(f => z >= Math.max(11, RANK[f.tags.class] || 13));
    if (!fs2.length) continue;
    out[l] = Object.assign({}, t, { features: fs2 });
  }
  return Buffer.from(vtpbf.fromGeojsonVt(out, { version: 2 }));
}

/* ---------- données simulées ---------- */
const places = JSON.parse(fs.readFileSync(path.join(DATA, 'places.json'), 'utf8'));
const pois = JSON.parse(fs.readFileSync(path.join(DATA, 'pois.json'), 'utf8'));
const maxspeed = JSON.parse(fs.readFileSync(path.join(DATA, 'maxspeed.json'), 'utf8'));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const R = 6371008.8, rad = d => d * Math.PI / 180;
const hav = (a, b) => { const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]); const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(s))); };
const photonFeature = p => {
  const props = {}; for (const k of ['name', 'osm_key', 'osm_value', 'osm_type', 'osm_id', 'street', 'housenumber', 'postcode', 'city', 'state', 'country', 'countrycode', 'type']) if (p[k] != null) props[k] = p[k];
  return { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } };
};
function photonSearch(q) {
  const text = norm(q.get('q')), toks = text.split(/\s+/).filter(Boolean), lat = parseFloat(q.get('lat')), lon = parseFloat(q.get('lon'));
  const res = [];
  for (const p of places) {
    const n = norm(p.name + ' ' + (p.street || '') + ' ' + (p.city || ''));
    if (!toks.every(t => n.includes(t))) continue;
    let score = n.startsWith(toks[0]) ? 3 : 1;
    if (isFinite(lat)) score -= Math.min(2.5, hav([lon, lat], [p.lon, p.lat]) / 4000);
    if (p.osm_key === 'place') score += 2;
    res.push({ p, score });
  }
  res.sort((a, b) => b.score - a.score);
  return { type: 'FeatureCollection', features: res.slice(0, +(q.get('limit') || 15)).map(r => photonFeature(r.p)) };
}
function photonReverse(q) {
  const ll = [parseFloat(q.get('lon')), parseFloat(q.get('lat'))];
  let best = null, bd = 600;
  for (const p of places) { const d = hav(ll, [p.lon, p.lat]); if (d < bd) { bd = d; best = p; } }
  return { type: 'FeatureCollection', features: best ? [photonFeature(best)] : [] };
}
function distToWay(ll, g) {
  const kx = Math.cos(rad(ll[1])) * 111320, ky = 110574; let best = Infinity;
  for (let i = 0; i + 1 < g.length; i++) {
    const ax = (g[i].lon - ll[0]) * kx, ay = (g[i].lat - ll[1]) * ky, bx = (g[i + 1].lon - ll[0]) * kx, by = (g[i + 1].lat - ll[1]) * ky, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? -(ax * dx + ay * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(ax + dx * t, ay + dy * t));
  }
  return best;
}
function overpass(ql) {
  const ar = ql.match(/around:(\d+(?:\.\d+)?),(-?[\d.]+),(-?[\d.]+)/);
  if (!ar) return { version: 0.6, elements: [], remark: 'requête non reconnue par le banc d’essai' };
  const r = +ar[1], ll = [+ar[3], +ar[2]];
  if (/way\(around/.test(ql) && /maxspeed|"highway"~/.test(ql)) {
    const els = maxspeed.filter(w => { const g = w.geometry; return Math.abs(g[0].lat - ll[1]) < 0.02 && Math.abs(g[0].lon - ll[0]) < 0.03 && distToWay(ll, g) <= r; }).slice(0, 8);
    return { version: 0.6, generator: 'banc', elements: els };
  }
  const filters = [...ql.matchAll(/\["(\w+)"(=|~)"([^"]+)"\]/g)].map(m => ({ k: m[1], re: m[2] === '=' ? new RegExp('^' + m[3] + '$') : new RegExp(m[3]) }));
  const neg = [...ql.matchAll(/\["(\w+)"!~"([^"]+)"\]/g)].map(m => ({ k: m[1], re: new RegExp(m[2]) }));
  const lim = (ql.match(/out center tags (\d+)/) || [])[1] || 100;
  const els = pois.filter(e => {
    const c = e.type === 'node' ? [e.lon, e.lat] : [e.center.lon, e.center.lat];
    if (hav(ll, c) > r) return false;
    return filters.length && filters.every(f => e.tags[f.k] != null && f.re.test(e.tags[f.k])) && neg.every(f => !(e.tags[f.k] != null && f.re.test(e.tags[f.k])));
  }).slice(0, +lim);
  return { version: 0.6, generator: 'banc', elements: els };
}
// prix des carburants : même forme que le jeu de données officiel (certains prix en nombre, d'autres en texte, pour éprouver la lecture)
const stations = pois.filter(e => e.tags.amenity === 'fuel').map((e, i) => {
  const c = e.type === 'node' ? [e.lon, e.lat] : [e.center.lon, e.center.lat], base = 1.6 + (i * 37 % 19) / 100;
  const rec = { id: 59000000 + i, latitude: String(Math.round(c[1] * 100000)), longitude: String(Math.round(c[0] * 100000)), cp: '3500', pop: 'R', adresse: (e.tags['addr:street'] || 'Rijksweg') + ' ' + (e.tags['addr:housenumber'] || (i + 1)), ville: 'Utrecht',
    geom: { lon: c[0], lat: c[1] }, gazole_maj: '2026-11-10T07:12:00+00:00', gazole_prix: i % 3 === 0 ? String(base.toFixed(3)) : +base.toFixed(3),
    e10_maj: '2026-11-09T18:40:00+00:00', e10_prix: +(base + 0.07).toFixed(3), sp98_maj: '2026-11-09T18:40:00+00:00', sp98_prix: +(base + 0.17).toFixed(3),
    sp95_maj: null, sp95_prix: null, e85_maj: i % 2 ? '2026-11-08T10:00:00+00:00' : null, e85_prix: i % 2 ? 0.829 : null, gplc_maj: null, gplc_prix: null,
    carburants_disponibles: ['Gazole', 'E10', 'SP98'], carburants_indisponibles: ['SP95', 'GPLc'], horaires_automate_24_24: i % 2 ? 'Oui' : 'Non', services_service: ['Boutique alimentaire'], departement: 'Utrecht', code_departement: '00', region: 'Utrecht', code_region: '00' };
  return rec;
});
function fuel(q) {
  const m = String(q.get('where') || '').match(/POINT\((-?[\d.]+) (-?[\d.]+)\)'\s*,\s*([\d.]+)km/);
  if (!m) return { error_code: 'ODSQLError', message: 'where non reconnu' };
  const ll = [+m[1], +m[2]], km = +m[3], lim = +(q.get('limit') || 10), offset = +(q.get('offset') || 0);
  const all = stations.filter(s => hav(ll, [s.geom.lon, s.geom.lat]) <= km * 1000);
  return { total_count: all.length, results: all.slice(offset, offset + lim) };
}
// image unie pour les photos aériennes
function png(w, h, rgb) {
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = b => { let c = 0xFFFFFFFF; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3, k = ((x >> 4) + (y >> 4)) % 2 ? 0 : 10; raw[o] = rgb[0] + k; raw[o + 1] = rgb[1] + k; raw[o + 2] = rgb[2] + k; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const ORTHO = png(256, 256, [58, 84, 52]);

/* ---------- serveur ---------- */
const json = (res, obj, code) => { const b = Buffer.from(JSON.stringify(obj)); res.writeHead(code || 200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(b); };
const body = req => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c).toString('utf8'))); });
const log = [];
http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x'), seg = u.pathname.split('/').filter(Boolean), host = seg.shift() || '', p = '/' + seg.join('/'), q = u.searchParams;
    if (host === '_flags') { for (const [k, v] of q) flags[k] = v === 'true' ? true : v === 'false' ? false : +v; return json(res, flags); }
    if (host === '_log') { const out = log.splice(0); return json(res, out); }
    log.push(req.method + ' ' + host + p + (u.search.length > 160 ? u.search.slice(0, 160) + '…' : u.search));
    if (flags.slow) await new Promise(r => setTimeout(r, flags.slow));
    if (host === 'tiles.openfreemap.org') {
      if (seg[0] === 'styles') { const f = path.join(REF, seg[1] + '.json'); if (!fs.existsSync(f)) return json(res, { error: 'no style' }, 404); return json(res, JSON.parse(fs.readFileSync(f, 'utf8').replace(/__TILEJSON_DOMAIN__/g, 'tiles.openfreemap.org'))); }
      if (p === '/planet') return json(res, { tilejson: '3.0.0', name: 'banc', minzoom: 0, maxzoom: 14, bounds: [-180, -85.05, 180, 85.05], tiles: ['https://tiles.openfreemap.org/planet/t/{z}/{x}/{y}.pbf'], vector_layers: LAYERS.map(id => ({ id, fields: {} })), attribution: 'banc d’essai' });
      if (seg[0] === 'planet') { const [z, x, y] = [+seg[2], +seg[3], parseInt(seg[4])]; const b = tile(z, x, y); res.writeHead(200, { 'content-type': 'application/x-protobuf', 'access-control-allow-origin': '*' }); return res.end(b); }
      if (seg[0] === 'fonts') { const f = path.join(BED, 'fonts', decodeURIComponent(seg[1]).split(',')[0], seg[2]); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': 'application/x-protobuf' }); return res.end(fs.readFileSync(f)); }
      if (seg[0] === 'sprites') { const f = path.join(BED, 'ofm-styles/sprites/sprites', seg[1], seg[2]); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': f.endsWith('.json') ? 'application/json' : 'image/png' }); return res.end(fs.readFileSync(f)); }
      res.writeHead(404); return res.end();
    }
    if (host === 'photon.komoot.io') { if (flags.photonDown) { res.writeHead(503); return res.end(); } return json(res, p.startsWith('/reverse') ? photonReverse(q) : photonSearch(q)); }
    if (host === 'data.geopf.fr') {
      if (p.startsWith('/geocodage')) return json(res, { type: 'FeatureCollection', features: /oude|gracht/i.test(q.get('q') || '') ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [5.1214, 52.0907] }, properties: { label: '12 Oudegracht 3511 Utrecht', score: 0.9, housenumber: '12', id: '99_0001_00012', name: '12 Oudegracht', postcode: '3511', citycode: '99000', city: 'Utrecht', context: '99, Banc', type: 'housenumber', street: 'Oudegracht' } }] : [] });
      res.writeHead(200, { 'content-type': 'image/jpeg' }); return res.end(ORTHO);
    }
    if (host === 'overpass-api.de' || host === 'overpass.private.coffee') {
      if (flags.overpassDown) { res.writeHead(429); return res.end('rate limited'); }
      const b = await body(req), ql = decodeURIComponent((b.match(/data=([^&]*)/) || [])[1] || q.get('data') || '');
      return json(res, overpass(ql));
    }
    if (host === 'data.economie.gouv.fr') { if (flags.fuelDown) { res.writeHead(500); return res.end(); } return json(res, fuel(q)); }
    if (host === 'valhalla1.openstreetmap.de') {
      if (flags.valhallaDown) { res.writeHead(503); return res.end('down'); }
      const b = req.method === 'POST' ? await body(req) : null;
      const r = await fetch(VALHALLA + p + u.search, b ? { method: 'POST', body: b, headers: { 'content-type': 'application/json' } } : {});
      const t = Buffer.from(await r.arrayBuffer());
      res.writeHead(r.status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); return res.end(t);
    }
    if (host === 'routing.openstreetmap.de') {
      if (flags.osrmDown) { res.writeHead(503); return res.end('down'); }
      const port = { 'routed-car': 5001, 'routed-bike': 5002, 'routed-foot': 5003 }[seg[0]];
      if (!port) return json(res, { code: 'InvalidUrl' }, 400);
      const r = await fetch('http://127.0.0.1:' + port + '/' + seg.slice(1).join('/') + u.search);
      const t = Buffer.from(await r.arrayBuffer());
      res.writeHead(r.status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); return res.end(t);
    }
    if (host === 'api.open-meteo.com') {
      const now = new Date(); const hours = []; const temps = [], codes = [], pops = [];
      for (let i = 0; i < 48; i++) { const d = new Date(now.getTime() + i * 3600000); hours.push(d.toISOString().slice(0, 13) + ':00'); temps.push(9 + Math.round(4 * Math.sin(i / 4))); codes.push(i > 2 ? 61 : 3); pops.push(i > 2 ? 70 : 10); }
      return json(res, { latitude: +q.get('latitude'), longitude: +q.get('longitude'), utc_offset_seconds: 3600, timezone: 'Europe/Paris', current: { time: hours[0], interval: 900, temperature_2m: 9.4, weather_code: 3, is_day: 0 }, hourly: { time: hours, temperature_2m: temps, weather_code: codes, precipitation_probability: pops } });
    }
    res.writeHead(404); res.end('hôte inconnu du banc : ' + host);
  } catch (e) { console.error(e); try { res.writeHead(500); res.end(String(e)); } catch (x) { /* rien */ } }
}).listen(PORT, '127.0.0.1', () => console.log('banc prêt sur ' + PORT));
