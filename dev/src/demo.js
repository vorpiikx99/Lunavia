/* ---------- Lunavia : ville de démonstration (Val-Lunavia), générée sur place, sans aucune donnée réseau ----------
   Sert quand la carte en ligne est inaccessible (aperçu dans Claude) : même interface, mêmes fonctions,
   mais sur une petite ville fictive avec son réseau de rues, son calcul d'itinéraire et ses lieux. */
J.demo = (function () {
  const G = J.geo;
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

  function build() {
    const LAT0 = 46.1612, LON0 = 2.7045, MY = 110574, MX = 111320 * Math.cos(G.rad(LAT0));
    const ll = (x, y) => [+(LON0 + x / MX).toFixed(6), +(LAT0 + y / MY).toFixed(6)];
    const warp = (x, y) => [x + 38 * Math.sin(y / 520 + 0.6) + 22 * Math.sin((x + y) / 410), y + 34 * Math.sin(x / 470 + 1.1) + 18 * Math.sin((x - y) / 380)];
    const W = (x, y) => { const w = warp(x, y); return ll(w[0], w[1]); };
    let seed = 20261110;
    const rnd = () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

    const nodes = [], edges = [], keys = new Map(), feats = [];
    const F = (k, type, coords, props) => feats.push({ type: 'Feature', properties: Object.assign({ k }, props || {}), geometry: { type, coordinates: coords } });
    function node(x, y, key) {
      if (key && keys.has(key)) return keys.get(key);
      const id = nodes.length; nodes.push({ id, x, y, ll: ll(x, y), adj: [] });
      if (key) keys.set(key, id);
      return id;
    }
    function edge(a, b, p) {
      const A = nodes[a], B = nodes[b];
      const e = Object.assign({ a, b, len: Math.hypot(A.x - B.x, A.y - B.y), name: '', cls: 'residential', speed: 50, toll: false }, p);
      edges.push(e); A.adj.push(edges.length - 1); B.adj.push(edges.length - 1);
      return e;
    }
    // quadrillage de rues légèrement ondulé ; chaque tronçon entre deux carrefours est coupé en 4
    function grid(tag, cx, cy, nx, ny, sp, prop, skipV) {
      const SUB = 4, x0 = cx - (nx - 1) * sp / 2, y0 = cy - (ny - 1) * sp / 2;
      const at = (gx, gy) => { const w = warp(x0 + gx * sp / SUB, y0 + gy * sp / SUB); return node(w[0], w[1], tag + ':' + gx + ',' + gy); };
      for (let j = 0; j < ny; j++) for (let g = 0; g < (nx - 1) * SUB; g++) edge(at(g, j * SUB), at(g + 1, j * SUB), prop('h', j, Math.floor(g / SUB)));
      for (let i = 0; i < nx; i++) for (let g = 0; g < (ny - 1) * SUB; g++) {
        const j = Math.floor(g / SUB);
        if (skipV && skipV(i, j)) continue;
        edge(at(i * SUB, g), at(i * SUB, g + 1), prop('v', i, j));
      }
      return { tag, x0, y0, sp, nx, ny, at, P: (i, j, dx, dy) => W(x0 + i * sp + (dx || 0), y0 + j * sp + (dy || 0)) };
    }
    function ring(x0, y0, x1, y1, step) {
      const r = [];
      for (let x = x0; x < x1; x += step) r.push(W(x, y0));
      for (let y = y0; y < y1; y += step) r.push(W(x1, y));
      for (let x = x1; x > x0; x -= step) r.push(W(x, y1));
      for (let y = y1; y > y0; y -= step) r.push(W(x0, y));
      r.push(r[0]);
      return r;
    }
    function blob(cx, cy, r, n) {
      const pts = [], ph = rnd() * 6.28;
      for (let i = 0; i <= n; i++) {
        const a = i % n * 6.2832 / n, rr = r * (0.78 + 0.2 * Math.sin(a * 3 + ph) + 0.12 * Math.sin(a * 5 + ph * 2));
        pts.push(ll(cx + rr * Math.cos(a), cy + rr * Math.sin(a) * 0.8));
      }
      return pts;
    }

    /* --- Val-Lunavia --- */
    const AH = ['Rocade Sud', 'Rue des Lilas', 'Rue Pasteur', 'Boulevard Victor-Hugo', 'Rue du Moulin', 'Rue des Écoles', 'Rue de la Fontaine', 'Rocade Nord'];
    const AV = ['Rocade Ouest', 'Rue du Stade', 'Rue Voltaire', 'Rue des Tilleuls', 'Avenue de la République', 'Rue du Marché', 'Rue Molière', 'Rue Émile-Zola', 'Rocade Est'];
    const A = grid('A', 0, 0, 9, 8, 280, (dir, idx, seg) => {
      if (dir === 'h') {
        if (idx === 0 || idx === 7) return { name: AH[idx], cls: 'trunk', speed: 70 };
        if (idx === 3) return { name: AH[3], cls: 'primary', speed: 50 };
        return { name: AH[idx], speed: idx >= 2 && idx <= 5 && seg >= 2 && seg <= 5 ? 30 : 50 };
      }
      if (idx === 0 || idx === 8) return { name: AV[idx], cls: 'trunk', speed: 70 };
      if (idx === 4) return { name: AV[4], cls: 'primary', speed: 50 };
      return { name: AV[idx], speed: idx >= 2 && idx <= 6 && seg >= 2 && seg <= 4 ? 30 : 50 };
    }, (i, j) => i === 6 && j === 4);
    for (let k = 0; k < 3; k++) edge(A.at(16, -k), A.at(16, -k - 1), { name: 'Avenue de la Gare', speed: 30 });

    /* --- Saint-Aubin-les-Bornes --- */
    const BH = ['Rue du Lavoir', 'Grande Rue', 'Rue des Vignes'], BV = ['Chemin des Bornes', 'Rue de la Mairie', 'Rue de l’Église', 'Chemin du Moulin'];
    const B = grid('B', 4300, 500, 4, 3, 230, (dir, idx) => (dir === 'h' ? (idx === 1 ? { name: BH[1], cls: 'secondary', speed: 50 } : { name: BH[idx], speed: 30 }) : { name: BV[idx], speed: 30 }));

    /* --- D 12 : la départementale sinueuse entre les deux --- */
    function curve(a, b, n, off, props) {
      const A0 = nodes[a], B0 = nodes[b], made = [];
      let prev = a;
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        let cur = b;
        if (k < n) { const o = off(t); cur = node(A0.x + (B0.x - A0.x) * t + o[0], A0.y + (B0.y - A0.y) * t + o[1]); }
        made.push(edge(prev, cur, props)); prev = cur;
      }
      return made;
    }
    const d12 = curve(A.at(32, 12), B.at(0, 4), 22, t => [0, 250 * Math.sin(6.2832 * t) - 140 * Math.sin(3.1416 * t)], { name: 'D 12', cls: 'secondary', speed: 70 });

    /* --- A 99 : l'autoroute à péage, plus au nord --- */
    const yM = x => 1500 + 90 * Math.sin(x / 1500);
    const M1 = node(1560, yM(1560)), M2 = node(3880, yM(3880));
    let prev = M1; const mw = [];
    for (let k = 1; k <= 8; k++) {
      const x = 1560 + (3880 - 1560) * k / 8, cur = k === 8 ? M2 : node(x, yM(x));
      mw.push(edge(prev, cur, { name: 'A 99', cls: 'motorway', speed: 130, toll: true })); prev = cur;
    }
    function bez(a, c, b, n, props) {
      const A0 = nodes[a], B0 = nodes[b];
      let p = a;
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t;
        const cur = k === n ? b : node(u * u * A0.x + 2 * u * t * c[0] + t * t * B0.x, u * u * A0.y + 2 * u * t * c[1] + t * t * B0.y);
        edge(p, cur, props); p = cur;
      }
    }
    bez(A.at(32, 28), [1430, 1040], M1, 6, { cls: 'link', speed: 50, town: 'Val-Lunavia' });
    bez(M2, [4030, 1300], B.at(0, 8), 6, { cls: 'link', speed: 50, town: 'Saint-Aubin-les-Bornes' });
    const ext = (xa, xb) => { const c = []; for (let x = xa; x <= xb; x += 220) c.push(ll(x, yM(x))); c.push(ll(xb, yM(xb))); return c; };
    F('road', 'LineString', ext(-3600, 1560), { cls: 'motorway', r: 6 });
    F('road', 'LineString', ext(3880, 7400), { cls: 'motorway', r: 6 });

    /* --- le décor : champs, forêts, rivière, parc, voie ferrée, bâtiments --- */
    for (let n = 0; n < 16; n++) {
      const cx = -3000 + rnd() * 9600, cy = -2500 + rnd() * 5200;
      if ((Math.abs(cx) < 1450 && Math.abs(cy) < 1300) || (Math.abs(cx - 4300) < 560 && Math.abs(cy - 500) < 440)) continue;
      const w = 220 + rnd() * 330, h = 160 + rnd() * 260, a = rnd() * 3.14, ca = Math.cos(a), sa = Math.sin(a);
      const q = (u, v) => ll(cx + u * ca - v * sa, cy + u * sa + v * ca);
      F('field', 'Polygon', [[q(-w, -h), q(w, -h), q(w, h), q(-w, h), q(-w, -h)]], { t: 1 + Math.floor(rnd() * 3) });
    }
    [[1820, 760, 400], [2950, -760, 520], [1700, -1650, 380], [3300, 2150, 430], [-2050, 700, 520], [5500, -400, 480]].forEach(f => F('wood', 'Polygon', [blob(f[0], f[1], f[2], 22)]));
    F('urban', 'Polygon', [ring(A.x0 - 70, A.y0 - 70, A.x0 + 8 * 280 + 70, A.y0 + 7 * 280 + 70, 140)]);
    F('urban', 'Polygon', [ring(B.x0 - 60, B.y0 - 60, B.x0 + 3 * 230 + 60, B.y0 + 2 * 230 + 60, 115)]);
    const xR = y => 2380 + 170 * Math.sin(y / 650);
    const bankL = [], bankR = [];
    for (let y = -3200; y <= 3400; y += 150) { bankL.push(ll(xR(y) - 40, y)); bankR.push(ll(xR(y) + 40, y)); }
    F('water', 'Polygon', [bankL.concat(bankR.reverse(), [bankL[0]])]);
    const px0 = A.x0 + 5 * 280 + 22, px1 = A.x0 + 7 * 280 - 22, py0 = A.y0 + 4 * 280 + 22, py1 = A.y0 + 5 * 280 - 22;
    F('park', 'Polygon', [ring(px0, py0, px1, py1, 70)]);
    const pond = []; for (let i = 0; i <= 24; i++) pond.push(W(A.x0 + 6.4 * 280 + 72 * Math.cos(i * 0.2618), A.y0 + 4.5 * 280 + 44 * Math.sin(i * 0.2618)));
    F('water', 'Polygon', [pond]);
    F('path', 'LineString', [W(px0, py0 + 30), W(px0 + 150, py0 + 120), W(px0 + 300, py0 + 80), W(px1 - 60, py1 - 20)]);
    F('path', 'LineString', [W(px0 + 40, py1), W(px0 + 150, py0 + 120), W(px0 + 200, py0)]);
    const rail = []; for (let x = -3600; x <= 7400; x += 200) rail.push(ll(x, -1300 + 70 * Math.sin(x / 900)));
    F('rail', 'LineString', rail);
    const stn = warp(A.x0 + 4 * 280, A.y0 - 250);
    F('b', 'Polygon', [[ll(stn[0] - 62, stn[1] - 30), ll(stn[0] + 62, stn[1] - 30), ll(stn[0] + 62, stn[1] - 6), ll(stn[0] - 62, stn[1] - 6), ll(stn[0] - 62, stn[1] - 30)]], { h: 9 });

    function buildings(g, hmin, hmax, skip, boosted) {
      const m = 17 / g.sp, gp = 0.014;
      for (let i = 0; i < g.nx - 1; i++) for (let j = 0; j < g.ny - 1; j++) {
        if (skip && skip(i, j)) continue;
        const nxl = rnd() < 0.5 ? 2 : 3, nyl = rnd() < 0.55 ? 2 : 3;
        const cxm = g.x0 + (i + 0.5) * g.sp, cym = g.y0 + (j + 0.5) * g.sp;
        const boost = boosted ? 1 + 1.2 * Math.exp(-(cxm * cxm + cym * cym) / 490000) : 1;
        for (let a = 0; a < nxl; a++) for (let b = 0; b < nyl; b++) {
          if (rnd() < 0.13) continue;
          let u0 = m + (1 - 2 * m) * a / nxl + gp, u1 = m + (1 - 2 * m) * (a + 1) / nxl - gp, v0 = m + (1 - 2 * m) * b / nyl + gp, v1 = m + (1 - 2 * m) * (b + 1) / nyl - gp;
          if (a > 0) u0 += rnd() * 0.035; if (a < nxl - 1) u1 -= rnd() * 0.035;
          if (b > 0) v0 += rnd() * 0.035; if (b < nyl - 1) v1 -= rnd() * 0.035;
          const q = (u, v) => W(g.x0 + (i + u) * g.sp, g.y0 + (j + v) * g.sp);
          F('b', 'Polygon', [[q(u0, v0), q(u1, v0), q(u1, v1), q(u0, v1), q(u0, v0)]], { h: Math.round((hmin + rnd() * (hmax - hmin)) * boost) });
        }
      }
    }
    buildings(A, 6, 14, (i, j) => (i === 5 || i === 6) && j === 4, true);
    buildings(B, 5, 9);

    const RANK = { motorway: 6, trunk: 5, primary: 4, secondary: 3, link: 2, residential: 1 };
    edges.forEach(e => F('road', 'LineString', [nodes[e.a].ll, nodes[e.b].ll], { cls: e.cls, r: RANK[e.cls] || 1 }));

    /* --- lieux --- */
    const pois = [];
    const poi = (name, cat, type, p, extra) => pois.push({ id: 'd' + pois.length, name, cat, kind: cat, sub: type + ' · ' + (p[0] > LON0 + 3000 / MX ? 'Saint-Aubin-les-Bornes' : 'Val-Lunavia'), ll: p, extra: extra || {} });
    poi('Mairie de Val-Lunavia', 'other', 'Mairie', A.P(4, 3, 26, 30));
    poi('Café de la Mairie', 'food', 'Café', A.P(4, 3, -28, 34), { hours: '7 h – 20 h' });
    poi('Le Bistrot des Bornes', 'food', 'Restaurant', A.P(5, 3, 40, -26), { hours: '12 h – 14 h 30 et 19 h – 22 h' });
    poi('Crêperie La Bolée', 'food', 'Crêperie', A.P(3, 4, -30, 60), { hours: '11 h 30 – 22 h' });
    poi('Pizzeria Chez Gino', 'food', 'Pizzeria', A.P(6, 2, 34, 90), { hours: '18 h 30 – 23 h' });
    poi('Boulangerie Au Bon Lunavia', 'shop', 'Boulangerie', A.P(4, 4, 28, 70), { hours: '6 h 30 – 19 h 30' });
    poi('Super Lunavia Marché', 'shop', 'Supermarché', A.P(7, 5, 60, 40), { hours: '8 h 30 – 20 h' });
    poi('Épicerie des Tilleuls', 'shop', 'Épicerie', A.P(2, 2, 30, 50), { hours: '8 h – 21 h' });
    poi('Pharmacie du Parc', 'pharma', 'Pharmacie', A.P(5, 5, 40, 28), { hours: '9 h – 19 h 30' });
    poi('Pharmacie de la Gare', 'pharma', 'Pharmacie', A.P(4, 0, 30, -80), { hours: '8 h 30 – 19 h' });
    poi('Station Rocade Est', 'fuel', 'Station-service', A.P(8, 5, 34, 40), { prices: { gazole: 1.689, e10: 1.739, sp98: 1.829, e85: 0.799 } });
    poi('Station du Stade', 'fuel', 'Station-service 24 h/24', A.P(1, 1, 40, -30), { prices: { gazole: 1.649, e10: 1.709, sp98: 1.799 } });
    poi('Recharge Parking République', 'charge', '4 bornes de 22 kW', A.P(4, 2, -34, 60));
    poi('Recharge rapide Rocade Nord', 'charge', '2 bornes de 150 kW', A.P(6, 7, 60, 30));
    poi('Parking République', 'parking', '180 places, payant', A.P(4, 2, -34, 95));
    poi('Parking de la Gare', 'parking', '90 places, gratuit', A.P(4, 0, -36, -170));
    poi('Parking du Parc', 'parking', '60 places, gratuit', A.P(5, 4, -30, -40));
    poi('Gare de Val-Lunavia', 'other', 'Gare', ll(stn[0], stn[1] - 18));
    poi('Parc des Jalons', 'other', 'Parc', A.P(6, 4, -40, 130));
    poi('Musée de la Borne', 'other', 'Musée', A.P(3, 3, -40, 40), { hours: '10 h – 18 h, fermé le lundi' });
    poi('Hôpital de Val-Lunavia', 'other', 'Hôpital', A.P(1, 5, 60, 60));
    poi('Lycée Marie-Curie', 'other', 'Lycée', A.P(6, 1, 50, 50));
    poi('Cinéma Le Phare', 'other', 'Cinéma', A.P(3, 2, 36, -30));
    poi('Stade municipal', 'other', 'Stade', A.P(1, 2, 80, 120));
    poi('Mairie de Saint-Aubin-les-Bornes', 'other', 'Mairie', B.P(1, 1, 24, 26));
    poi('Auberge des Bornes', 'food', 'Restaurant', B.P(3, 2, -30, -28), { hours: '12 h – 14 h et 19 h – 21 h 30' });
    poi('Église Saint-Aubin', 'other', 'Église', B.P(2, 1, 30, 34));
    poi('Recharge Place de l’Église', 'charge', '2 bornes de 22 kW', B.P(2, 1, -26, 36));
    poi('Station de la Grande Rue', 'fuel', 'Station-service', B.P(0, 1, 40, -30), { prices: { gazole: 1.629, e10: 1.699, sp98: 1.789 } });
    poi('Boulangerie du Lavoir', 'shop', 'Boulangerie', B.P(1, 0, 30, 28), { hours: '7 h – 19 h' });
    poi('Parking de la Mairie', 'parking', '40 places, gratuit', B.P(1, 1, -30, 30));
    const byName = n => pois.find(p => p.name === n);

    /* --- rues (pour la recherche et les étiquettes) --- */
    const streets = new Map();
    edges.forEach(e => { if (!e.name) return; if (!streets.has(e.name)) streets.set(e.name, []); streets.get(e.name).push(e); });
    const mid = e => [(nodes[e.a].ll[0] + nodes[e.b].ll[0]) / 2, (nodes[e.a].ll[1] + nodes[e.b].ll[1]) / 2];
    const townOf = p => (p[0] > LON0 + 3000 / MX ? 'Saint-Aubin-les-Bornes' : 'Val-Lunavia');

    const labels = [
      { ll: A.P(4, 3, 150, 150), text: 'Val-Lunavia', cls: 'town' },
      { ll: B.P(1, 1, 120, 120), text: 'Saint-Aubin-les-Bornes', cls: 'village' },
      { ll: A.P(6, 4, -60, 190), text: 'Parc des Jalons', cls: 'green' },
      { ll: ll(xR(-1100) + 4, -1100), text: 'La Jalonne', cls: 'water', rot: 82 },
      { ll: mid(mw[3]), text: 'A 99', cls: 'shield a' },
      { ll: mid(mw[6]), text: 'Péage', cls: 'shield toll' },
      { ll: mid(d12[9]), text: 'D 12', cls: 'shield d' }
    ];
    const lab = (a, b, text) => {
      const p = nodes[a].ll, q = nodes[b].ll;
      let rot = G.bearing(p, q) - 90; while (rot > 90) rot -= 180; while (rot < -90) rot += 180;
      labels.push({ ll: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], text, cls: 'street', rot });
    };
    AH.forEach((n, j) => { const gx = 4 * ((j * 3 + 1) % 7) + 2; lab(A.at(gx - 1, j * 4), A.at(gx + 1, j * 4), n); });
    AV.forEach((n, i) => { const gy = 4 * ((i * 2 + 1) % 6) + 2; if (i === 6 && gy >= 16 && gy <= 20) return; lab(A.at(i * 4, gy - 1), A.at(i * 4, gy + 1), n); });
    lab(B.at(5, 4), B.at(7, 4), 'Grande Rue');

    /* --- calcul d'itinéraire (A*) --- */
    const allowed = (e, mode) => mode === 'car' || (e.cls !== 'motorway' && e.cls !== 'link');
    const speedOf = (e, mode) => (mode === 'bike' ? 4.6 : mode === 'foot' ? 1.33 : e.speed * (e.cls === 'residential' ? 0.78 : e.cls === 'primary' ? 0.86 : 0.94) / 3.6);
    function nearNode(p, mode) {
      let best = -1, bd = Infinity;
      for (const n of nodes) {
        if (!n.adj.some(i => allowed(edges[i], mode))) continue;
        const d = G.hav(n.ll, p);
        if (d < bd) { bd = d; best = n.id; }
      }
      return { id: best, d: bd };
    }
    function astar(src, dst, mode, opts, pen) {
      const N = nodes.length, g = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), fe = new Int32Array(N).fill(-1), done = new Uint8Array(N);
      const vmax = mode === 'car' ? 36.2 : mode === 'bike' ? 4.6 : 1.33, T = nodes[dst];
      const h = i => Math.hypot(nodes[i].x - T.x, nodes[i].y - T.y) / vmax;
      const open = [src]; g[src] = 0;
      while (open.length) {
        let bi = 0, bf = Infinity;
        for (let k = 0; k < open.length; k++) { const f = g[open[k]] + h(open[k]); if (f < bf) { bf = f; bi = k; } }
        const u = open.splice(bi, 1)[0];
        if (u === dst) break;
        if (done[u]) continue;
        done[u] = 1;
        for (const ei of nodes[u].adj) {
          const e = edges[ei], v = e.a === u ? e.b : e.a;
          if (done[v] || !allowed(e, mode)) continue;
          if (mode === 'car' && ((opts.avoidTolls && e.toll) || (opts.avoidHighways && e.cls === 'motorway'))) continue;
          if (opts.blocked && opts.blocked.has(ei)) continue; // route signalée fermée
          let c = e.len / speedOf(e, mode);
          if (pen && pen.has(ei)) c *= 1.9;
          if (g[u] + c < g[v]) { g[v] = g[u] + c; from[v] = u; fe[v] = ei; open.push(v); }
        }
      }
      if (!isFinite(g[dst])) return null;
      const path = [], pe = [];
      for (let v = dst; v !== src; v = from[v]) { path.push(v); pe.push(fe[v]); }
      path.push(src); path.reverse(); pe.reverse();
      return { path, pe, time: pe.reduce((s, i) => s + edges[i].len / speedOf(edges[i], mode), 0), len: pe.reduce((s, i) => s + edges[i].len, 0) };
    }
    const turn = (d, name) => {
      const a = Math.abs(d), mod = a > 150 ? 'uturn' : a > 115 ? (d < 0 ? 'sharp-left' : 'sharp-right') : a > 52 ? (d < 0 ? 'left' : 'right') : (d < 0 ? 'slight-left' : 'slight-right');
      return { type: 'turn', mod, name };
    };
    function toRoute(res, fromLL, toLL, mode) {
      const geom = [], steps = [], E = res.pe.map(i => edges[i]), P = res.path;
      if (G.hav(fromLL, nodes[P[0]].ll) > 8) geom.push(fromLL);
      const base = geom.length;
      P.forEach(id => geom.push(nodes[id].ll));
      if (G.hav(toLL, nodes[P[P.length - 1]].ll) > 8) geom.push(toLL);
      let cur = { type: 'depart', mod: 'straight', name: E.length ? E[0].name : '', idx: 0, time: 0 };
      steps.push(cur);
      for (let i = 0; i < E.length; i++) {
        if (i > 0) {
          const pn = nodes[P[i - 1]], n = nodes[P[i]], nn = nodes[P[i + 1]], a = E[i - 1], b = E[i];
          const d = G.angDiff(G.bearing(pn.ll, n.ll), G.bearing(n.ll, nn.ll));
          let st = null;
          if (a.cls !== 'link' && b.cls === 'link') {
            if (a.cls === 'motorway') st = { type: 'exit', mod: 'right', dest: b.town, name: '' };
            else { const nx = E.slice(i).find(x => x.cls === 'motorway'); st = { type: 'ramp', mod: d > 25 ? 'right' : d < -25 ? 'left' : 'straight', dest: nx ? nx.name : '', name: '' }; }
          } else if (a.cls === 'link' && b.cls !== 'link') {
            st = b.cls === 'motorway' ? { type: 'merge', mod: 'straight', name: b.name } : Math.abs(d) > 38 ? turn(d, b.name) : { type: 'continue', mod: 'straight', name: b.name };
          } else if (Math.abs(d) > 38 && n.adj.length >= 3) st = turn(d, b.name);
          else if (a.name !== b.name && b.name) st = { type: 'continue', mod: 'straight', name: b.name };
          if (st) { st.idx = base + i; st.time = 0; steps.push(st); cur = st; }
        }
        cur.time += E[i].len / speedOf(E[i], mode);
      }
      steps.push({ type: 'arrive', mod: '', name: '', idx: geom.length - 1, time: 0 });
      return J.mkRoute({ geom, steps, time: res.time, toll: E.some(e => e.toll), highway: E.some(e => e.cls === 'motorway'), src: 'demo' });
    }
    const wait = (v, ms) => new Promise(r => setTimeout(() => r(v), ms));
    function route(from, to, mode, opts) {
      opts = Object.assign({}, opts || {});
      const a = nearNode(from, mode), b = nearNode(to, mode);
      if (a.d > 1500 || b.d > 1500) return Promise.reject(new Error('far'));
      if (opts.avoid && opts.avoid.length) {
        opts.blocked = new Set();
        opts.avoid.forEach(p => { const ne = nearEdge(p); if (ne.e && ne.d < 30) opts.blocked.add(edges.indexOf(ne.e)); });
      }
      let r1 = astar(a.id, b.id, mode, opts);
      if (!r1 && opts.blocked) { opts.blocked = null; r1 = astar(a.id, b.id, mode, opts); } // aucun détour possible : on passe quand même
      if (!r1) return Promise.reject(new Error('noroute'));
      const out = [r1], same = (x, y) => x.pe.length === y.pe.length && x.pe.every((v, i) => v === y.pe[i]);
      if (mode === 'car' && !opts.avoidTolls && r1.pe.some(i => edges[i].toll)) {
        const r2 = astar(a.id, b.id, mode, Object.assign({}, opts, { avoidTolls: true }));
        if (r2 && !same(r2, r1)) out.push(r2);
      }
      const r3 = astar(a.id, b.id, mode, opts, new Set(r1.pe));
      if (r3 && r3.time < r1.time * 1.6 && out.every(o => {
        const set = new Set(o.pe); let sh = 0; r3.pe.forEach(i => { if (set.has(i)) sh += edges[i].len; });
        return sh / (r3.len || 1) < 0.72;
      })) out.push(r3);
      return wait(out.slice(0, 3).map(r => toRoute(r, from, to, mode)), 160);
    }

    /* --- recherche, adresse inverse, catégories, limitation --- */
    const index = pois.map(p => ({ p, n: norm(p.name + ' ' + p.sub) }));
    streets.forEach((es, name) => { const e = es[Math.floor(es.length / 2)], p = mid(e); index.push({ p: { id: 's' + name, name, sub: 'Rue · ' + townOf(p), ll: p, kind: 'street', cat: 'street', extra: {} }, n: norm(name), st: es }); });
    index.push({ p: { id: 't1', name: 'Val-Lunavia', sub: 'Ville de démonstration', ll: A.P(4, 3), kind: 'town', cat: 'town', extra: {} }, n: 'val jalon ville' });
    index.push({ p: { id: 't2', name: 'Saint-Aubin-les-Bornes', sub: 'Village de démonstration', ll: B.P(1, 1), kind: 'town', cat: 'town', extra: {} }, n: 'saint aubin les bornes village st' });
    function search(q, near) {
      const m = String(q).match(/^\s*(\d{1,3})\s*(?:bis|ter)?[ ,]+(.+)$/i), num = m ? +m[1] : 0, toks = norm(m ? m[2] : q).split(' ').filter(Boolean);
      if (!toks.length) return wait([], 60);
      const res = [];
      for (const it of index) {
        const words = it.n.split(' ');
        let score = 0, ok = true;
        for (const t of toks) { const w = words.findIndex(x => x.indexOf(t) === 0); if (w < 0) { ok = false; break; } score += w === 0 ? 3 : 1; }
        if (!ok) continue;
        let p = it.p;
        if (num && it.st) {
          const e = it.st[Math.min(it.st.length - 1, Math.floor((num % 60) / 60 * it.st.length))], pt = mid(e);
          p = { id: p.id + '#' + num, name: num + ' ' + p.name, sub: 'Adresse · ' + townOf(pt), ll: pt, kind: 'pin', cat: 'address', extra: {} };
          score += 4;
        }
        if (near) score -= Math.min(2, G.hav(near, p.ll) / 3000);
        res.push({ p, score });
      }
      res.sort((x, y) => y.score - x.score);
      return wait(res.slice(0, 8).map(r => r.p), 90);
    }
    function nearEdge(p) {
      let best = null, bd = Infinity;
      for (const e of edges) { const d = G.nearest([nodes[e.a].ll, nodes[e.b].ll], [0, e.len], p, 0, 0).d; if (d < bd) { bd = d; best = e; } }
      return { e: best, d: bd };
    }
    function reverse(p) {
      let bp = null, bd = 45;
      for (const x of pois) { const d = G.hav(x.ll, p); if (d < bd) { bd = d; bp = x; } }
      if (bp) return wait(bp, 70);
      const ne = nearEdge(p);
      if (ne.e && ne.d < 120 && ne.e.name) return wait({ id: 'r' + p.join(','), name: ne.e.name, sub: 'Rue · ' + townOf(p), ll: p, kind: 'pin', cat: 'address', extra: {} }, 70);
      return wait(null, 70);
    }
    const poiList = (cat, center) => wait(pois.filter(p => p.cat === cat).sort((a, b) => G.hav(center, a.ll) - G.hav(center, b.ll)), 180);
    const speedLimit = p => { const ne = nearEdge(p); return Promise.resolve(ne.e && ne.d < 30 ? ne.e.speed : null); };

    /* --- habillage de la carte --- */
    const LIGHT = { bg: '#E3E8D5', f1: '#DDE4CB', f2: '#E9E6CC', f3: '#D6E0C6', urban: '#EEECE4', wood: '#BFD9AF', park: '#CBE5BB', water: '#A6CDE7', path: '#B9A988', rail: '#8B9097', rail2: '#EEECE4', case: '#C3C6BF', road: '#FFFFFF', sec: '#FFF3B8', prim: '#FCDE86', trunk: '#F8C36A', mw: '#E9785A', link: '#F2A58F', bldg: '#D8D0C3' };
    const DARK = { bg: '#141A1E', f1: '#161D20', f2: '#181E1F', f3: '#131A1C', urban: '#1B2128', wood: '#16261B', park: '#1A2D20', water: '#0E2A3F', path: '#4A4536', rail: '#59606B', rail2: '#1B2128', case: '#0D1114', road: '#3B4451', sec: '#5A5333', prim: '#7A6630', trunk: '#8B672C', mw: '#A04B37', link: '#7C4334', bldg: '#2A313B' };
    function style(dark) {
      const c = dark ? DARK : LIGHT;
      const base = ['match', ['get', 'cls'], 'motorway', 5.2, 'trunk', 4.2, 'primary', 4, 'secondary', 3.3, 'link', 2.7, 2.3];
      const width = extra => ['interpolate', ['exponential', 1.6], ['zoom'], 10, ['+', ['*', base, 0.22], extra * 0.3], 13.5, ['+', ['*', base, 0.9], extra], 16, ['+', ['*', base, 2.6], extra], 19, ['+', ['*', base, 9], extra]];
      const is = k => ['==', ['get', 'k'], k];
      return {
        version: 8, name: 'val-jalon',
        sources: { town: { type: 'geojson', data: { type: 'FeatureCollection', features: feats }, tolerance: 0.25 } },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': c.bg } },
          { id: 'field', type: 'fill', source: 'town', filter: is('field'), paint: { 'fill-color': ['match', ['get', 't'], 1, c.f1, 2, c.f2, c.f3] } },
          { id: 'wood', type: 'fill', source: 'town', filter: is('wood'), paint: { 'fill-color': c.wood } },
          { id: 'urban', type: 'fill', source: 'town', filter: is('urban'), paint: { 'fill-color': c.urban } },
          { id: 'park', type: 'fill', source: 'town', filter: is('park'), paint: { 'fill-color': c.park } },
          { id: 'water', type: 'fill', source: 'town', filter: is('water'), paint: { 'fill-color': c.water } },
          { id: 'path', type: 'line', source: 'town', filter: is('path'), minzoom: 14, paint: { 'line-color': c.path, 'line-width': 1.6, 'line-dasharray': [2, 1.5] } },
          { id: 'rail', type: 'line', source: 'town', filter: is('rail'), paint: { 'line-color': c.rail, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.2, 16, 4] } },
          { id: 'rail-d', type: 'line', source: 'town', filter: is('rail'), minzoom: 13, paint: { 'line-color': c.rail2, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.8, 16, 2.2], 'line-dasharray': [3, 3] } },
          { id: 'road-case', type: 'line', source: 'town', filter: is('road'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.case, 'line-width': width(2.4) } },
          { id: 'road', type: 'line', source: 'town', filter: is('road'), layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'r'] }, paint: { 'line-color': ['match', ['get', 'cls'], 'motorway', c.mw, 'link', c.link, 'trunk', c.trunk, 'primary', c.prim, 'secondary', c.sec, c.road], 'line-width': width(0) } },
          { id: 'bldg', type: 'fill-extrusion', source: 'town', filter: is('b'), minzoom: 13.2, paint: { 'fill-extrusion-color': c.bldg, 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.9 } }
        ]
      };
    }

    const startNode = nodes[A.at(8, 22)];
    return {
      provider: { search, reverse, route, pois: poiList, speedLimit },
      style, labels,
      center: A.P(4, 3, 40, 60), zoom: 14.2,
      start: { ll: startNode.ll, heading: 180 },
      home: { id: 'ex-home', name: '14 Rue Molière', sub: 'Adresse · Val-Lunavia', ll: nodes[A.at(24, 6)].ll, kind: 'home', cat: 'address', extra: {} },
      work: Object.assign({}, byName('Mairie de Saint-Aubin-les-Bornes')),
      trip: byName('Auberge des Bornes'),
      recents: [byName('Boulangerie Au Bon Lunavia'), byName('Gare de Val-Lunavia')],
      reports: [
        { id: 'x1', type: 'works', ll: nodes[A.at(22, 12)].ll, t: Date.now() - 52 * 60000, ex: true },
        { id: 'x2', type: 'jam', ll: nodes[A.at(16, 17)].ll, t: Date.now() - 6 * 60000, ex: true },
        { id: 'x3', type: 'danger', ll: mid(mw[4]), t: Date.now() - 11 * 60000, ex: true },
        { id: 'x4', type: 'control', ll: nodes[A.at(32, 19)].ll, t: Date.now() - 19 * 60000, ex: true }
      ],
      _dbg: { nodes, edges }
    };
  }
  return { build, norm };
})();
