/* ---------- Lunavia : outils géographiques, format des nombres, textes de guidage ---------- */
window.J = window.J || {};
J.geo = (function () {
  const R = 6371008.8, rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;

  // distance en mètres entre deux points [lon, lat]
  function hav(a, b) {
    const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  // cap de a vers b, 0 = nord, 90 = est
  function bearing(a, b) {
    const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
    const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
    return (deg(Math.atan2(y, x)) + 360) % 360;
  }
  // écart signé b - a, entre -180 et 180
  const angDiff = (a, b) => ((b - a + 540) % 360) - 180;
  function smoothAngle(from, to, k) { return (from + angDiff(from, to) * k + 360) % 360; }

  function dest(p, brg, d) {
    const a = rad(brg), dr = d / R, la = rad(p[1]), lo = rad(p[0]);
    const la2 = Math.asin(Math.sin(la) * Math.cos(dr) + Math.cos(la) * Math.sin(dr) * Math.cos(a));
    const lo2 = lo + Math.atan2(Math.sin(a) * Math.sin(dr) * Math.cos(la), Math.cos(dr) - Math.sin(la) * Math.sin(la2));
    return [deg(lo2), deg(la2)];
  }
  function circle(c, r, n) {
    const ring = [];
    for (let i = 0; i <= (n || 40); i++) ring.push(dest(c, i * 360 / (n || 40), r));
    return ring;
  }
  function cum(geom) {
    const c = new Float64Array(geom.length);
    for (let i = 1; i < geom.length; i++) c[i] = c[i - 1] + hav(geom[i - 1], geom[i]);
    return c;
  }
  // polyline encodée (Valhalla : précision 6, OSRM : 5) -> [[lon, lat], ...]
  function decode(str, precision) {
    const f = Math.pow(10, precision || 6), out = [];
    let i = 0, lat = 0, lon = 0;
    while (i < str.length) {
      let b, shift = 0, res = 0;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 31) << shift; shift += 5; } while (b >= 32);
      lat += (res & 1) ? ~(res >> 1) : (res >> 1);
      shift = 0; res = 0;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 31) << shift; shift += 5; } while (b >= 32);
      lon += (res & 1) ? ~(res >> 1) : (res >> 1);
      out.push([lon / f, lat / f]);
    }
    return out;
  }
  function encode(coords, precision) {
    const f = Math.pow(10, precision || 6);
    let out = '', plat = 0, plon = 0;
    const enc = v => { v = v < 0 ? ~(v << 1) : v << 1; let o = ''; while (v >= 32) { o += String.fromCharCode((32 | (v & 31)) + 63); v >>>= 5; } return o + String.fromCharCode(v + 63); };
    for (const c of coords) {
      const lat = Math.round(c[1] * f), lon = Math.round(c[0] * f);
      // les écarts dépassent 2^31 seulement au-delà de 2000 km d'un point au suivant : jamais sur une route
      out += enc(lat - plat) + enc(lon - plon); plat = lat; plon = lon;
    }
    return out;
  }
  // point de la ligne le plus proche de p, en cherchant sur les segments [from, to]
  function nearest(geom, c, p, from, to) {
    const kx = Math.cos(rad(p[1])) * 111320, ky = 110574;
    let best = { d: Infinity, i: 0, t: 0, s: 0, pt: geom[0] };
    from = Math.max(0, from | 0); to = Math.min(geom.length - 2, to == null ? geom.length - 2 : to | 0);
    for (let i = from; i <= to; i++) {
      const a = geom[i], b = geom[i + 1];
      const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky, bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      let t = l2 ? -(ax * dx + ay * dy) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(ax + dx * t, ay + dy * t);
      if (d < best.d) best = { d, i, t, s: c[i] + (c[i + 1] - c[i]) * t, pt: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] };
    }
    return best;
  }
  // position à s mètres du début de la ligne
  function at(geom, c, s) {
    const n = geom.length;
    if (n < 2) return { pt: geom[0], i: 0, brg: 0 };
    s = Math.max(0, Math.min(c[n - 1], s));
    let lo = 0, hi = n - 2;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c[m] <= s) lo = m; else hi = m - 1; }
    let i = lo;
    while (i < n - 2 && c[i + 1] - c[i] === 0) i++;
    const seg = c[i + 1] - c[i], t = seg ? (s - c[i]) / seg : 0, a = geom[i], b = geom[i + 1];
    return { pt: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], i, brg: bearing(a, b) };
  }
  function bounds(geom) {
    let w = 180, s = 90, e = -180, n = -90;
    for (const p of geom) { if (p[0] < w) w = p[0]; if (p[0] > e) e = p[0]; if (p[1] < s) s = p[1]; if (p[1] > n) n = p[1]; }
    return [[w, s], [e, n]];
  }
  return { hav, bearing, angDiff, smoothAngle, dest, circle, cum, decode, encode, nearest, at, bounds, rad, deg };
})();

/* ---------- nombres et durées à la française ---------- */
J.fmt = (function () {
  const dec = (n, d) => n.toFixed(d).replace('.', ',');
  function dist(m) {
    if (!isFinite(m)) return '';
    if (m < 30) return Math.max(5, Math.round(m / 5) * 5) + ' m';
    if (m < 300) return Math.round(m / 10) * 10 + ' m';
    if (m < 950) return Math.round(m / 50) * 50 + ' m';
    if (m < 9950) return dec(m / 1000, 1) + ' km';
    return Math.round(m / 1000) + ' km';
  }
  function dur(s) {
    const min = Math.max(1, Math.round(s / 60));
    if (min < 60) return min + ' min';
    const h = Math.floor(min / 60), r = min % 60;
    return h + ' h ' + (r < 10 ? '0' : '') + r;
  }
  function clock(d) { return d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(); }
  function ago(t) {
    const m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 1) return 'à l’instant';
    if (m < 60) return 'il y a ' + m + ' min';
    const h = Math.round(m / 60);
    return h < 24 ? 'il y a ' + h + ' h' : 'il y a ' + Math.round(h / 24) + ' j';
  }
  const euro = (v, d) => dec(v, d == null ? 2 : d) + ' €';
  // distance dite à voix haute
  function say(m) {
    if (m < 950) { const v = m < 300 ? Math.max(10, Math.round(m / 10) * 10) : Math.round(m / 50) * 50; return v + ' mètres'; }
    const km = Math.round(m / 100) / 10;
    if (km === 1) return 'un kilomètre';
    return (km < 10 ? dec(km, km % 1 ? 1 : 0) : Math.round(km)) + (km < 2 ? ' kilomètre' : ' kilomètres');
  }
  return { dec, dist, dur, clock, ago, euro, say };
})();

/* ---------- textes de guidage en français ---------- */
J.fr = (function () {
  const ord = n => (n === 1 ? '1re' : n + 'e');
  const ordSay = n => ['', 'première', 'deuxième', 'troisième', 'quatrième', 'cinquième', 'sixième', 'septième', 'huitième'][n] || (n + 'e');
  const side = s => (s.mod && s.mod.indexOf('left') >= 0 ? 'gauche' : s.mod && s.mod.indexOf('right') >= 0 ? 'droite' : '');
  const LE = ['boulevard', 'chemin', 'quai', 'cours', 'passage', 'square', 'pont', 'sentier', 'faubourg', 'rond-point', 'carrefour', 'parvis', 'mail', 'viaduc', 'tunnel', 'périphérique', 'clos', 'lotissement', 'hameau', 'domaine', 'parc', 'port', 'giratoire', 'contournement'];
  const LA = ['rue', 'route', 'place', 'voie', 'rocade', 'ruelle', 'traverse', 'chaussée', 'montée', 'côte', 'promenade', 'villa', 'cité', 'résidence', 'bretelle', 'corniche', 'levée', 'venelle', 'descente', 'rampe', 'passerelle', 'digue', 'déviation', 'pénétrante'];
  const LAP = ['avenue', 'allée', 'impasse', 'esplanade', 'autoroute', 'ancienne', 'ancien'];
  // le nom d'une voie avec son article : « la rue Voltaire », « l’A 6 », « le boulevard Victor-Hugo ». Un nom inconnu reste tel quel.
  function road(name) {
    const n = String(name || '').trim();
    if (!n) return '';
    if (/^[AE]\s?\d/.test(n)) return 'l’' + n;
    if (/^(D|N|M|RD|RN|RM|C|VC|T)\s?\d/.test(n)) return 'la ' + n;
    const w = (n.match(/^(rond-point|[^\s’'-]+)/i) || [''])[0].toLowerCase(), low = n.charAt(0).toLowerCase() + n.slice(1);
    if (w === 'grande' || w === 'grand') return 'la ' + n;
    if (LE.indexOf(w) >= 0) return 'le ' + low;
    if (LA.indexOf(w) >= 0) return 'la ' + low;
    if (LAP.indexOf(w) >= 0) return 'l’' + low;
    return n;
  }
  const on = s => (s.name ? ' sur ' + road(s.name) : '');
  const toward = s => (s.dest ? ' vers ' + road(s.dest) : s.name ? ' vers ' + road(s.name) : '');
  const CARD = ['le nord', 'le nord-est', 'l’est', 'le sud-est', 'le sud', 'le sud-ouest', 'l’ouest', 'le nord-ouest'];
  const card = brg => CARD[Math.round((((brg % 360) + 360) % 360) / 45) % 8];

  // libellé court pour le panneau (sans le nom de la rue)
  function act(s) {
    const sd = side(s);
    switch (s.type) {
      case 'depart': return 'Partez';
      case 'arrive': return 'Arrivée';
      case 'roundabout': return s.exit ? 'Rond-point, ' + ord(s.exit) + ' sortie' : 'Prenez le rond-point';
      case 'rexit': return 'Sortez du rond-point';
      case 'ramp': return 'Prenez la bretelle' + (sd ? ' à ' + sd : '');
      case 'exit': return (s.num ? 'Sortie ' + s.num : 'Prenez la sortie') + (sd ? ' à ' + sd : '');
      case 'merge': return 'Rejoignez la voie';
      case 'fork': return sd ? 'Restez à ' + sd : 'Continuez tout droit';
      case 'end': return 'Au bout, tournez à ' + (sd || 'droite');
      case 'continue': return 'Continuez';
      case 'ferry': return 'Prenez le ferry';
      case 'note': return s.text || 'Continuez';
    }
    switch (s.mod) {
      case 'uturn': return 'Faites demi-tour';
      case 'sharp-left': return 'Tournez franchement à gauche';
      case 'sharp-right': return 'Tournez franchement à droite';
      case 'slight-left': return 'Serrez à gauche';
      case 'slight-right': return 'Serrez à droite';
      case 'left': return 'Tournez à gauche';
      case 'right': return 'Tournez à droite';
    }
    return 'Continuez tout droit';
  }
  // phrase complète (feuille de route et voix)
  function text(s, spoken) {
    const sd = side(s);
    switch (s.type) {
      case 'depart': return 'Partez' + (s.card ? ' vers ' + s.card : '') + on(s);
      case 'arrive': return 'Vous êtes arrivé' + (sd ? ', votre destination est à ' + sd : '');
      case 'roundabout': return s.exit ? 'Au rond-point, prenez la ' + (spoken ? ordSay(s.exit) : ord(s.exit)) + ' sortie' + on(s) : 'Engagez-vous dans le rond-point';
      case 'rexit': return 'Sortez du rond-point' + on(s);
      case 'ramp': return 'Prenez la bretelle' + (sd ? ' à ' + sd : '') + toward(s);
      case 'exit': return 'Prenez la sortie' + (s.num ? ' ' + s.num : '') + (sd ? ' à ' + sd : '') + toward(s);
      case 'merge': return s.name ? 'Rejoignez ' + road(s.name) : 'Insérez-vous dans la circulation';
      case 'fork': return (sd ? 'Restez à ' + sd : 'Continuez tout droit') + (s.dest ? ' vers ' + road(s.dest) : on(s));
      case 'end': return 'Au bout de la route, tournez à ' + (sd || 'droite') + on(s);
      case 'continue': return s.name ? 'Continuez sur ' + road(s.name) : 'Continuez tout droit';
      case 'ferry': return 'Prenez le ferry';
      case 'note': return s.text || 'Continuez';
    }
    return (s.mod === 'straight' || !s.mod) ? (s.name ? 'Continuez sur ' + road(s.name) : 'Continuez tout droit') : act(s) + on(s);
  }
  const lower = t => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);
  return { act, text, ord, lower, road, card };
})();

/* ---------- mise en forme commune d'un itinéraire (ville de démo, Valhalla ou OSRM) ---------- */
J.mkRoute = function (o) {
  const G = J.geo, c = G.cum(o.geom), n = o.geom.length, dist = c[n - 1];
  let steps = (o.steps || []).filter(s => s && isFinite(s.idx));
  steps.forEach(s => { s.idx = Math.max(0, Math.min(n - 1, s.idx | 0)); s.s0 = c[s.idx]; });
  steps.sort((a, b) => a.idx - b.idx);
  // cap suivi par le tracé entre deux distances depuis le départ
  const brg = (a, b) => { a = Math.max(0, Math.min(dist, a)); b = Math.max(0, Math.min(dist, b)); return b - a < 0.5 ? null : G.bearing(G.at(o.geom, c, a).pt, G.at(o.geom, c, b).pt); };
  // une route qui change de nom en ligne droite n'est pas une manœuvre : l'étape se fond dans la précédente
  const kept = [];
  steps.forEach(s => {
    const b0 = brg(s.s0 - 22, s.s0 - 2), b1 = brg(s.s0 + 2, s.s0 + 22), turn = b0 != null && b1 != null ? Math.abs(G.angDiff(b0, b1)) : 0;
    if (s.type === 'continue' && turn < 30 && kept.length) { kept[kept.length - 1].time = (kept[kept.length - 1].time || 0) + (s.time || 0); return; }
    kept.push(s);
  });
  steps = kept;
  if (!steps.length || steps[0].type !== 'depart') steps.unshift({ type: 'depart', mod: 'straight', name: '', idx: 0, s0: 0, time: 0 });
  if (steps[steps.length - 1].type !== 'arrive') steps.push({ type: 'arrive', mod: '', name: '', idx: n - 1, s0: dist, time: 0 });
  steps[steps.length - 1].idx = n - 1; steps[steps.length - 1].s0 = dist;
  const time = o.time > 0 ? o.time : dist / 12;
  let known = 0;
  steps.forEach((s, i) => { s.len = (i + 1 < steps.length ? steps[i + 1].s0 : dist) - s.s0; known += s.time > 0 ? s.time : 0; });
  if (known < time * 0.5) steps.forEach(s => { s.time = dist ? time * s.len / dist : 0; });
  steps.forEach((s, i) => {
    if (s.type === 'depart') { const b = brg(0, Math.min(dist, 40)); if (b != null) s.card = J.fr.card(b); return; }
    // angle du virage : pour un rond-point, entre la route d'arrivée et la route de sortie
    const out = s.type === 'roundabout' && steps[i + 1] && steps[i + 1].type === 'rexit' ? steps[i + 1].s0 : s.s0;
    const b0 = brg(s.s0 - 22, s.s0 - 2), b1 = brg(out + 2, out + 22);
    s.ang = b0 != null && b1 != null ? G.angDiff(b0, b1) : null;
  });
  let acc = 0;
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    s.time = s.time > 0 ? s.time : 0; s.tAfter = acc; acc += s.time;
    if (s.type !== 'note' || !s.text) { s.text = J.fr.text(s); s.say = J.fr.text(s, true); }
    else if (!s.say) s.say = s.text;
  }
  const k = acc > 0 ? time / acc : 1; // les temps d'étape sont recalés sur la durée totale
  steps.forEach(s => { s.time *= k; s.tAfter *= k; });
  return { geom: o.geom, cum: c, dist, time, steps, toll: !!o.toll, highway: !!o.highway, ferry: !!o.ferry, src: o.src || '', limits: o.limits || null };
};
