/* ---------- Lunavia : services en ligne (carte du monde réel) ----------
   Fond de carte : OpenFreeMap (données OpenStreetMap) · Photos aériennes : IGN Géoplateforme
   Recherche : Photon (komoot) et Base Adresse Nationale · Itinéraires, voies et limitations : Valhalla, secours OSRM (serveurs FOSSGIS)
   Lieux utiles : Overpass · Prix des carburants : données ouvertes du ministère de l'Économie · Météo : Open-Meteo */
J.live = (function () {
  const G = J.geo;
  const STYLES = 'https://tiles.openfreemap.org/styles/';
  const ORTHO = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
  const VALHALLA = 'https://valhalla1.openstreetmap.de';
  const cache = {};

  async function getJSON(url, init, ms) {
    const c = new AbortController(), id = setTimeout(() => c.abort(), ms || 12000);
    try {
      const r = await fetch(url, Object.assign({}, init, { signal: c.signal }));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(id); }
  }

  /* --- fond de carte : noms en français quand ils existent --- */
  function frLabels(st) {
    const sub = v => {
      if (!Array.isArray(v)) return v;
      if (v.length === 2 && v[0] === 'get' && v[1] === 'name_en') return ['coalesce', ['get', 'name:fr'], ['get', 'name']];
      return v.map(sub);
    };
    st.layers.forEach(l => { if (l.layout && l.layout['text-field']) l.layout['text-field'] = sub(l.layout['text-field']); });
  }
  async function style(name) {
    if (!cache[name]) {
      const st = await getJSON(STYLES + name, {}, 8000);
      if (!st || !Array.isArray(st.layers) || !st.sources) throw new Error('style');
      frLabels(st);
      cache[name] = JSON.stringify(st);
    }
    return JSON.parse(cache[name]);
  }

  /* --- recherche --- */
  const KIND = { fuel: 'fuel', charging_station: 'charge', parking: 'parking', restaurant: 'food', fast_food: 'food', cafe: 'food', bar: 'food', pub: 'food', pharmacy: 'pharma', supermarket: 'shop', convenience: 'shop', bakery: 'shop' };
  const TYPE = { restaurant: 'Restaurant', fast_food: 'Restauration rapide', cafe: 'Café', bar: 'Bar', pub: 'Pub', fuel: 'Station-service', charging_station: 'Borne de recharge', parking: 'Parking', pharmacy: 'Pharmacie', supermarket: 'Supermarché', convenience: 'Épicerie', bakery: 'Boulangerie', hotel: 'Hôtel', school: 'École', college: 'Collège', university: 'Université', hospital: 'Hôpital', clinic: 'Clinique', bank: 'Banque', atm: 'Distributeur', post_office: 'Bureau de poste', townhall: 'Mairie', station: 'Gare', halt: 'Gare', bus_stop: 'Arrêt de bus', tram_stop: 'Arrêt de tram', museum: 'Musée', cinema: 'Cinéma', theatre: 'Théâtre', park: 'Parc', stadium: 'Stade', place_of_worship: 'Lieu de culte', city: 'Ville', town: 'Ville', village: 'Village', hamlet: 'Hameau', suburb: 'Quartier', neighbourhood: 'Quartier', quarter: 'Quartier', county: 'Département', state: 'Région', country: 'Pays', aerodrome: 'Aéroport', attraction: 'Site touristique', viewpoint: 'Point de vue', library: 'Bibliothèque', doctors: 'Médecin', dentist: 'Dentiste', clothes: 'Vêtements', hairdresser: 'Coiffeur', car_repair: 'Garage', camp_site: 'Camping', beach: 'Plage', peak: 'Sommet', butcher: 'Boucherie', florist: 'Fleuriste', books: 'Librairie', doityourself: 'Bricolage', mall: 'Centre commercial' };

  const KEYLAB = { shop: 'Commerce', amenity: 'Lieu', tourism: 'Tourisme', leisure: 'Loisirs', office: 'Bureau', craft: 'Artisan', historic: 'Patrimoine', healthcare: 'Santé', railway: 'Gare', aeroway: 'Aéroport', natural: 'Nature' };
  function photonPlace(f) {
    const p = (f && f.properties) || {}, c = f && f.geometry && f.geometry.coordinates;
    if (!c || !isFinite(c[0]) || !isFinite(c[1])) return null;
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');
    const city = p.city || p.town || p.village || p.locality || '';
    const name = p.name || street || city || p.county || p.state || p.country;
    if (!name) return null;
    const bits = [];
    const type = TYPE[p.osm_value] || (p.name && KEYLAB[p.osm_key]) || (p.type === 'house' ? 'Adresse' : p.type === 'street' ? 'Rue' : '');
    if (type) bits.push(type);
    if (p.name && street && street !== p.name) bits.push(street);
    if (city && city !== name) bits.push([p.postcode, city].filter(Boolean).join(' '));
    else if (p.postcode) bits.push(p.postcode);
    if (!city && p.county && p.county !== name) bits.push(p.county);
    if ((p.type === 'city' || p.type === 'district' || p.type === 'county' || !city) && p.state && p.state !== name) bits.push(p.state);
    if (p.countrycode && p.countrycode !== 'FR' && p.country && p.country !== name) bits.push(p.country);
    const kind = KIND[p.osm_value] || (p.osm_key === 'place' ? 'town' : p.osm_key === 'highway' ? 'street' : 'pin');
    return { id: 'o' + (p.osm_type || '') + (p.osm_id || c.join(',')), name: String(name), sub: bits.join(' · '), ll: [+c[0], +c[1]], kind, cat: KIND[p.osm_value] || 'other', extra: {} };
  }
  function banPlace(f) {
    const p = (f && f.properties) || {}, c = f && f.geometry && f.geometry.coordinates;
    if (!c || !isFinite(c[0]) || !isFinite(c[1]) || p.type === 'municipality') return null;
    return { id: 'b' + (p.id || c.join(',')), name: String(p.name || p.label || 'Adresse'), sub: [p.type === 'street' ? 'Rue' : p.type === 'locality' ? 'Lieu-dit' : 'Adresse', [p.postcode, p.city].filter(Boolean).join(' ')].filter(Boolean).join(' · '), ll: [+c[0], +c[1]], kind: p.type === 'street' ? 'street' : 'pin', cat: 'address', extra: {}, score: +p.score || 0 };
  }
  const nrm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  async function photon(q, near) {
    const bias = near ? '&lat=' + near[1].toFixed(4) + '&lon=' + near[0].toFixed(4) + '&zoom=11&location_bias_scale=0.4' : '';
    const j = await getJSON('https://photon.komoot.io/api/?q=' + encodeURIComponent(q) + '&lang=fr&limit=8' + bias, {}, 7000);
    return (j.features || []).map(photonPlace).filter(Boolean);
  }
  async function ban(q, near) {
    const bias = near ? '&lat=' + near[1].toFixed(4) + '&lon=' + near[0].toFixed(4) : '';
    const j = await getJSON('https://data.geopf.fr/geocodage/search?q=' + encodeURIComponent(q.slice(0, 190)) + '&limit=5&autocomplete=1&index=address' + bias, {}, 5000);
    return (j.features || []).map(banPlace).filter(Boolean);
  }
  async function search(q, near) {
    const m = String(q).match(/^\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/);
    if (m) {
      const lat = parseFloat(m[1].replace(',', '.')), lon = parseFloat(m[2].replace(',', '.'));
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return [{ id: 'c' + lat + ',' + lon, name: 'Coordonnées', sub: lat.toFixed(5) + ', ' + lon.toFixed(5), ll: [lon, lat], kind: 'pin', cat: 'address', extra: {} }];
    }
    // une requête qui ressemble à une adresse (« 12 rue… ») met la base d'adresses officielle en tête ; sinon les lieux d'abord
    const addr = /^\s*\d{1,4}\s*(bis|ter|[a-d])?[ ,]/i.test(q) || /(^|\s)(rue|avenue|av\.?|bd|boulevard|chemin|impasse|all[ée]e|place|route|quai|cours|lotissement|r[ée]sidence|lieu-dit)\s/i.test(q);
    const res = await Promise.allSettled([photon(q, near), nrm(q).length >= 3 ? ban(q, near) : Promise.resolve([])]);
    if (res[0].status !== 'fulfilled' && res[1].status !== 'fulfilled') throw new Error('search');
    const places = res[0].status === 'fulfilled' ? res[0].value : [];
    const adr = (res[1].status === 'fulfilled' ? res[1].value : []).filter(p => p.score >= (addr ? 0.4 : 0.6));
    const list = addr ? adr.slice(0, 4).concat(places) : places.slice(0, 6).concat(adr.slice(0, 2), places.slice(6));
    const out = [];
    list.forEach(p => { if (!out.some(o => (nrm(o.name) === nrm(p.name) && G.hav(o.ll, p.ll) < 400) || G.hav(o.ll, p.ll) < 8)) out.push(p); });
    return out.slice(0, 8);
  }
  async function reverse(ll) {
    try {
      const j = await getJSON('https://photon.komoot.io/reverse?lon=' + ll[0].toFixed(6) + '&lat=' + ll[1].toFixed(6) + '&lang=fr&limit=1', {}, 6000);
      const p = photonPlace(j.features && j.features[0]);
      if (p) return p;
    } catch (e) { /* on essaie la base d'adresses */ }
    try {
      const j = await getJSON('https://data.geopf.fr/geocodage/reverse?lon=' + ll[0].toFixed(6) + '&lat=' + ll[1].toFixed(6) + '&limit=1&index=address', {}, 5000);
      return banPlace(j.features && j.features[0]);
    } catch (e) { return null; }
  }

  /* --- itinéraires --- */
  const VT = { 0: ['continue', 'straight'], 1: ['depart', 'straight'], 2: ['depart', 'right'], 3: ['depart', 'left'], 4: ['arrive', ''], 5: ['arrive', 'right'], 6: ['arrive', 'left'], 7: ['continue', 'straight'], 8: ['continue', 'straight'], 9: ['turn', 'slight-right'], 10: ['turn', 'right'], 11: ['turn', 'sharp-right'], 12: ['turn', 'uturn'], 13: ['turn', 'uturn'], 14: ['turn', 'sharp-left'], 15: ['turn', 'left'], 16: ['turn', 'slight-left'], 17: ['ramp', 'straight'], 18: ['ramp', 'right'], 19: ['ramp', 'left'], 20: ['exit', 'right'], 21: ['exit', 'left'], 22: ['fork', 'straight'], 23: ['fork', 'right'], 24: ['fork', 'left'], 25: ['merge', 'straight'], 26: ['roundabout', ''], 27: ['rexit', ''], 28: ['ferry', ''], 29: ['continue', 'straight'], 37: ['merge', 'right'], 38: ['merge', 'left'] };
  const trim = t => String(t || '').replace(/\s*\.\s*$/, '');
  // voies au sol : quelle flèche dessiner, et la voie est-elle la bonne (2), possible (1) ou à éviter (0)
  const LANE = [[8, 'left'], [64, 'right'], [16, 'slight-left'], [32, 'slight-right'], [4, 'sharp-left'], [128, 'sharp-right'], [256, 'uturn'], [2, 'straight'], [512, 'slight-left'], [1024, 'slight-right']];
  function lanes(L) {
    if (!Array.isArray(L) || L.length < 2 || L.length > 8) return null;
    const out = L.map(l => {
      const use = (l && (l.active || l.valid)) || 0, mask = use || (l && l.directions) || 0;
      const hit = (!use && (mask & 2)) ? [2, 'straight'] : LANE.find(x => mask & x[0]);
      return { d: hit ? hit[1] : 'straight', on: l && l.active ? 2 : l && l.valid ? 1 : 0 };
    });
    return out.some(l => l.on) && out.some(l => !l.on) ? out : null; // toutes bonnes ou aucune indiquée : rien à montrer
  }
  function vTrip(trip) {
    const legs = (trip && trip.legs) || [], geom = [], steps = [];
    legs.forEach((leg, li) => {
      if (!leg || !leg.shape) return;
      const pts = G.decode(leg.shape, 6), base = geom.length ? geom.length - 1 : 0, M = leg.maneuvers || [];
      pts.forEach((pt, k) => { if (k === 0 && geom.length) return; geom.push(pt); });
      M.forEach((m, i) => {
        const tm = VT[m.type], sg = m.sign || {}, els = k => (sg[k] || []).map(e => e && e.text).filter(Boolean);
        const st = { idx: base + (m.begin_shape_index | 0), time: +m.time || 0, name: (m.street_names && m.street_names[0]) || '' };
        if (!tm) { // escaliers, ascenseur, transports… : on garde la phrase du service
          st.type = 'note'; st.mod = 'straight'; st.text = trim(m.instruction); st.say = trim(m.verbal_pre_transition_instruction || m.instruction);
          if (!st.text) return;
        } else {
          st.type = tm[0]; st.mod = tm[1];
          const num = els('exit_number_elements')[0] || '', to = els('exit_toward_elements').slice(0, 2).join(', '), branch = els('exit_branch_elements')[0] || '';
          if (st.type === 'ramp' || st.type === 'exit' || st.type === 'fork') { st.dest = to || branch; st.num = num; if (st.type === 'fork' && num) st.type = 'exit'; }
          if (st.type === 'roundabout') { st.exit = m.roundabout_exit_count; const nx = M[i + 1]; if (nx && nx.type === 27 && nx.street_names && nx.street_names[0]) st.name = nx.street_names[0]; }
          if ((st.type === 'depart' && li > 0) || (st.type === 'arrive' && li < legs.length - 1)) return; // étapes intermédiaires : pas de faux départ ni de fausse arrivée
          const ln = lanes(m.lanes);
          if (ln) st.lanes = ln;
        }
        steps.push(st);
      });
    });
    if (geom.length < 2) return null;
    const sm = trip.summary || {};
    return J.mkRoute({ geom, steps, time: sm.time, toll: sm.has_toll, highway: sm.has_highway, ferry: sm.has_ferry, src: 'valhalla' });
  }
  async function valhalla(from, to, mode, opts) {
    const req = { locations: [{ lat: from[1], lon: from[0] }, { lat: to[1], lon: to[0] }], costing: mode === 'car' ? 'auto' : mode === 'bike' ? 'bicycle' : 'pedestrian', alternates: 2, units: 'kilometers', language: 'fr-FR', turn_lanes: true };
    if (typeof opts.heading === 'number') { req.locations[0].heading = Math.round(opts.heading); req.locations[0].heading_tolerance = 60; }
    if (mode === 'car' && (opts.avoidTolls || opts.avoidHighways)) {
      req.costing_options = { auto: {} };
      if (opts.avoidTolls) req.costing_options.auto.use_tolls = 0;
      if (opts.avoidHighways) req.costing_options.auto.use_highways = 0;
    }
    if (opts.avoid && opts.avoid.length) req.exclude_locations = opts.avoid.slice(0, 20).map(p => ({ lat: p[1], lon: p[0] })); // routes signalées fermées
    const j = await getJSON(VALHALLA + '/route?json=' + encodeURIComponent(JSON.stringify(req)), {}, 16000);
    const out = [j.trip].concat((j.alternates || []).map(a => a && a.trip)).map(vTrip).filter(Boolean);
    if (!out.length) throw new Error('noroute');
    return out;
  }
  // limitations de vitesse le long d'un morceau du trajet (entre deux distances depuis le départ), en une seule demande
  async function limits(route, from, to) {
    const g = route.geom, c = route.cum, n = g.length;
    let i0 = 0, i1 = n - 1;
    while (i0 + 1 < n && c[i0 + 1] <= from) i0++;
    while (i1 > i0 + 1 && c[i1 - 1] >= to) i1--;
    const pts = g.slice(i0, i1 + 1);
    if (pts.length < 2) return [];
    const body = JSON.stringify({ encoded_polyline: G.encode(pts, 6), costing: 'auto', shape_match: 'walk_or_snap', filters: { attributes: ['edge.speed_limit', 'edge.road_class', 'edge.use', 'edge.density', 'edge.begin_shape_index', 'edge.end_shape_index', 'shape'], action: 'include' } });
    const j = await getJSON(VALHALLA + '/trace_attributes', { method: 'POST', body }, 14000);
    if (!j || !Array.isArray(j.edges)) throw new Error('limits');
    const shp = j.shape ? G.decode(j.shape, 6) : pts, out = [];
    let hint = i0;
    j.edges.forEach(e => {
      const a = shp[e.begin_shape_index], b = shp[e.end_shape_index];
      if (!a || !b) return;
      const ma = G.nearest(g, c, a, hint - 3, i1 + 2), mb = G.nearest(g, c, b, ma.i, i1 + 2);
      hint = ma.i;
      let v = e.speed_limit > 0 && e.speed_limit < 200 ? Math.round(e.speed_limit) : null; // 255 = pas de limite
      if (v == null && inFrance(a)) { const d = frDefault(e.use === 'living_street' ? 'living_street' : e.use === 'ramp' || e.use === 'turn_channel' ? 'link' : e.road_class, e.density > 8); if (d) v = -d; } // négatif = estimée
      if (!(mb.s > ma.s)) return;
      const last = out[out.length - 1];
      if (last && last.v === v && ma.s - last.s1 < 40) last.s1 = mb.s; else out.push({ s0: ma.s, s1: mb.s, v });
    });
    return out;
  }
  // « A27: RING-Zuid, Breda, Arnhem » : on garde les deux premières directions du panneau
  const odest = d => String(d || '').split(':').pop().split(',').map(x => x.trim()).filter(Boolean).slice(0, 2).join(', ');
  function oRoute(r) {
    const leg = r && r.legs && r.legs[0];
    if (!leg) return null;
    const geom = [], steps = [], ST = leg.steps || [];
    let toll = false, hw = false, ferry = false;
    ST.forEach((s, i) => {
      const cs = (s.geometry && s.geometry.coordinates) || [], idx = geom.length ? geom.length - 1 : 0;
      cs.forEach((c, k) => { if (k === 0 && geom.length) return; geom.push(c); });
      (s.intersections || []).forEach(x => (x.classes || []).forEach(c => { if (c === 'toll') toll = true; else if (c === 'motorway') hw = true; else if (c === 'ferry') ferry = true; }));
      const m = s.maneuver || {}, mod = String(m.modifier || '').replace(' ', '-'), name = s.name || s.ref || '';
      let st;
      switch (m.type) {
        case 'depart': st = { type: 'depart', mod: 'straight', name }; break;
        case 'arrive': st = { type: 'arrive', mod: mod === 'left' || mod === 'right' ? mod : '', name: '' }; break;
        case 'roundabout': case 'rotary': {
          const nx = ST[i + 1], isExit = nx && /^exit/.test((nx.maneuver || {}).type || '');
          st = { type: 'roundabout', mod: '', exit: m.exit, name: isExit ? (nx.name || nx.ref || '') : name }; break;
        }
        case 'exit roundabout': case 'exit rotary': case 'notification': case 'use lane': st = null; break;
        case 'on ramp': st = { type: 'ramp', mod, name, dest: odest(s.destinations) }; break;
        case 'off ramp': st = { type: 'exit', mod, name, dest: odest(s.destinations), num: String(s.exits || '').split(';')[0] }; break;
        case 'merge': st = { type: 'merge', mod, name }; break;
        case 'fork': st = { type: 'fork', mod, name }; break;
        case 'end of road': st = { type: 'end', mod, name }; break;
        case 'new name': st = { type: 'continue', mod: 'straight', name }; break;
        case 'continue': st = !mod || mod === 'straight' ? { type: 'continue', mod: 'straight', name } : { type: 'turn', mod, name }; break;
        default: st = { type: 'turn', mod: mod || 'straight', name };
      }
      if (st) { st.idx = idx; st.time = s.duration || 0; steps.push(st); }
      else if (steps.length) steps[steps.length - 1].time += s.duration || 0;
    });
    if (geom.length < 2) return null;
    return J.mkRoute({ geom, steps, time: r.duration, toll, highway: hw, ferry, src: 'osrm' });
  }
  async function osrm(from, to, mode) {
    const prof = mode === 'car' ? 'routed-car' : mode === 'bike' ? 'routed-bike' : 'routed-foot';
    const j = await getJSON('https://routing.openstreetmap.de/' + prof + '/route/v1/driving/' + from[0].toFixed(6) + ',' + from[1].toFixed(6) + ';' + to[0].toFixed(6) + ',' + to[1].toFixed(6) + '?overview=false&steps=true&geometries=geojson&alternatives=true', {}, 16000);
    if (j.code !== 'Ok') throw new Error('noroute');
    const out = (j.routes || []).map(oRoute).filter(Boolean);
    if (!out.length) throw new Error('noroute');
    return out;
  }
  async function route(from, to, mode, opts) {
    opts = opts || {};
    try { return await valhalla(from, to, mode, opts); }
    catch (e) { return await osrm(from, to, mode); }
  }

  /* --- météo prévue à l'arrivée --- */
  const WMO = [[0, 'ciel dégagé'], [2, 'peu nuageux'], [3, 'couvert'], [48, 'brouillard'], [57, 'bruine'], [67, 'pluie'], [77, 'neige'], [82, 'averses'], [86, 'averses de neige'], [99, 'orage']];
  async function weather(ll, when) {
    const j = await getJSON('https://api.open-meteo.com/v1/forecast?latitude=' + ll[1].toFixed(3) + '&longitude=' + ll[0].toFixed(3) + '&hourly=temperature_2m,weather_code,precipitation_probability&forecast_days=3&timeformat=unixtime&timezone=auto', {}, 7000);
    const h = j && j.hourly, t = h && h.time;
    if (!t || !t.length) return null;
    const ts = when / 1000;
    let i = 0;
    while (i + 1 < t.length && t[i + 1] <= ts) i++;
    if (ts - t[i] > 5400 || !isFinite(h.temperature_2m[i])) return null; // au-delà des prévisions
    const code = h.weather_code[i], lab = (WMO.find(x => code <= x[0]) || WMO[2])[1], pop = h.precipitation_probability ? h.precipitation_probability[i] : null;
    return { temp: Math.round(h.temperature_2m[i]), label: lab, rain: pop != null && code >= 51 ? Math.round(pop) : null, care: code === 45 || code === 48 || (code >= 66 && code <= 77) || code >= 85 };
  }

  /* --- lieux utiles autour d'un point --- */
  const OVP = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
  async function overpass(q, ms) {
    let err;
    for (const u of OVP) {
      try { return await getJSON(u, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }, ms || 14000); }
      catch (e) { err = e; }
    }
    throw err;
  }
  const PQ = {
    fuel: 'nwr["amenity"="fuel"]', charge: 'nwr["amenity"="charging_station"]',
    parking: 'nwr["amenity"="parking"]["access"!~"^(private|no|customers|permit)$"]',
    food: 'nwr["amenity"~"^(restaurant|fast_food|cafe)$"]', shop: 'nwr["shop"~"^(supermarket|convenience|bakery)$"]', pharma: 'nwr["amenity"="pharmacy"]'
  };
  const PR = { fuel: 7000, charge: 7000, parking: 1500, food: 1200, shop: 2500, pharma: 4000 };
  const DEF = { fuel: 'Station-service', charge: 'Borne de recharge', parking: 'Parking', food: 'Restaurant', shop: 'Commerce', pharma: 'Pharmacie' };
  function poiPlace(e, cat) {
    const t = e.tags || {}, lat = e.lat != null ? e.lat : e.center && e.center.lat, lon = e.lon != null ? e.lon : e.center && e.center.lon;
    if (lat == null || lon == null) return null;
    const def = TYPE[t.amenity] || TYPE[t.shop] || DEF[cat], name = t.name || t.brand || t.operator || def;
    const addr = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
    const extra = { lines: [] };
    if (t.opening_hours) extra.hours = t.opening_hours === '24/7' ? 'Ouvert 24 h/24' : t.opening_hours;
    if (t.phone || t['contact:phone']) extra.phone = t.phone || t['contact:phone'];
    if (t.website || t['contact:website']) extra.web = t.website || t['contact:website'];
    if (cat === 'food' && t.cuisine) extra.lines.push('Cuisine : ' + t.cuisine.replace(/_/g, ' ').replace(/;/g, ', '));
    if (cat === 'parking') {
      if (t.capacity) extra.lines.push(t.capacity + ' places');
      if (t.fee === 'no') extra.lines.push('Gratuit'); else if (t.fee === 'yes') extra.lines.push('Payant');
      if (t.parking === 'underground') extra.lines.push('Souterrain');
    }
    if (cat === 'charge') {
      if (t.capacity) extra.lines.push(t.capacity + ' points de charge');
      const kw = t['charging_station:output'] || t['socket:type2_combo:output'] || t['socket:type2:output'];
      if (kw) extra.lines.push('Puissance : ' + kw);
      if (t.operator && t.operator !== name) extra.lines.push('Opérateur : ' + t.operator);
    }
    return { id: 'p' + String(e.type || 'n').charAt(0) + e.id, name: String(name), sub: [def !== name ? def : '', addr, t['addr:city'] || ''].filter(Boolean).join(' · '), ll: [+lon, +lat], kind: cat, cat, extra };
  }
  // prix à la pompe (France) : relevés officiels, mis à jour en continu
  async function fuelPrices(center, km) {
    const where = "within_distance(geom, geom'POINT(" + center[0].toFixed(5) + ' ' + center[1].toFixed(5) + ")', " + Math.max(1, Math.round(km)) + 'km)';
    const j = await getJSON('https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?limit=100&where=' + encodeURIComponent(where), {}, 10000);
    const F = [['gazole', 'gazole'], ['e10', 'e10'], ['sp95', 'sp95'], ['sp98', 'sp98'], ['e85', 'e85'], ['gpl', 'gplc']];
    return (j.results || []).map(r => {
      const g = r.geom || {};
      let lon = +g.lon, lat = +g.lat;
      if (!isFinite(lon) || !isFinite(lat)) { lon = parseFloat(r.longitude) / 100000; lat = parseFloat(r.latitude) / 100000; }
      const prices = {};
      let maj = '';
      F.forEach(f => { const v = parseFloat(r[f[1] + '_prix']); if (v > 0.2 && v < 9) { prices[f[0]] = v; const d = r[f[1] + '_maj']; if (d && String(d) > maj) maj = String(d); } });
      if (!Object.keys(prices).length && r.prix) { // ancienne forme du jeu de données : une liste « nom, valeur, date »
        try {
          let arr = typeof r.prix === 'string' ? JSON.parse(r.prix) : r.prix;
          if (arr && !Array.isArray(arr)) arr = [arr];
          const N = { gazole: 'gazole', e10: 'e10', sp95: 'sp95', sp98: 'sp98', e85: 'e85', gplc: 'gpl' };
          (arr || []).forEach(x => { const k = N[String(x['@nom'] || x.nom || '').toLowerCase()], v = parseFloat(x['@valeur'] || x.valeur); if (k && v > 0.2 && v < 9) { prices[k] = v; const d = x['@maj'] || x.maj; if (d && String(d) > maj) maj = String(d); } });
        } catch (e) { /* forme inconnue : station sans prix */ }
      }
      return { ll: [lon, lat], prices, maj, adresse: r.adresse || '', ville: r.ville || '', auto: r.horaires_automate_24_24 === 'Oui' };
    }).filter(s => isFinite(s.ll[0]) && isFinite(s.ll[1]) && Object.keys(s.prices).length);
  }
  function mergeFuel(list, stations) {
    const used = new Set();
    stations.forEach(s => {
      let best = null, bd = 130;
      list.forEach(p => { if (used.has(p)) return; const d = G.hav(p.ll, s.ll); if (d < bd) { bd = d; best = p; } });
      const when = s.maj ? (d => (isNaN(d) ? '' : 'le ' + d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })))(new Date(s.maj)) : '';
      if (best) { used.add(best); best.extra.prices = s.prices; best.extra.maj = when; if (s.auto && !best.extra.hours) best.extra.hours = 'Automate 24 h/24'; }
      else list.push({ id: 'f' + s.ll.join(','), name: 'Station-service', sub: [s.adresse, s.ville].filter(Boolean).join(' · '), ll: s.ll, kind: 'fuel', cat: 'fuel', extra: { prices: s.prices, maj: when, lines: [], hours: s.auto ? 'Automate 24 h/24' : '' } });
    });
    return list;
  }
  async function pois(cat, center) {
    const r = PR[cat] || 2000;
    const q = '[out:json][timeout:12];(' + PQ[cat] + '(around:' + r + ',' + center[1].toFixed(5) + ',' + center[0].toFixed(5) + '););out center tags 90;';
    const res = await Promise.allSettled([overpass(q), cat === 'fuel' ? fuelPrices(center, r / 1000) : Promise.resolve([])]);
    if (res[0].status !== 'fulfilled' && !(res[1].status === 'fulfilled' && res[1].value.length)) throw new Error('pois');
    let list = res[0].status === 'fulfilled' ? ((res[0].value && res[0].value.elements) || []).map(e => poiPlace(e, cat)).filter(Boolean) : [];
    if (res[1].status === 'fulfilled' && res[1].value.length) list = mergeFuel(list, res[1].value);
    list.sort((a, b) => G.hav(center, a.ll) - G.hav(center, b.ll));
    return list.slice(0, 60);
  }

  /* --- limitation de vitesse de la route où l'on se trouve --- */
  function parseMax(v) {
    if (!v) return null;
    v = String(v).trim();
    if (/^\d+$/.test(v)) return +v;
    const mph = v.match(/^(\d+)\s*mph$/i);
    if (mph) return Math.round(+mph[1] * 1.609);
    return ({ 'FR:urban': 50, 'FR:rural': 80, 'FR:motorway': 130, 'FR:zone30': 30, 'FR:zone20': 20 })[v] || null;
  }
  let busy = false;
  /* Quand la carte ne connaît pas le panneau, on applique la règle générale française selon le type de route.
     C'est une estimation (elle ignore les panneaux particuliers) : elle est renvoyée en négatif, et affichée en gris. */
  const inFrance = ll => ll[0] > -5.3 && ll[0] < 9.7 && ll[1] > 41.2 && ll[1] < 51.2;
  function frDefault(kind, urban) {
    if (kind === 'living_street') return 20;
    if (kind === 'motorway') return 130;
    if (kind === 'link' || kind === 'service' || kind === 'service_other' || kind === 'track' || !kind) return null;
    if (kind === 'trunk') return urban ? 50 : 110;
    if (kind === 'residential') return 50;
    return urban ? 50 : 80;
  }
  const ZONES = { 'FR:urban': 50, 'FR:rural': 80, 'FR:motorway': 130, 'FR:zone30': 30, 'FR:zone20': 20, 'FR:living_street': 20, 'FR:trunk': 110 };
  function guessWay(t) {
    const z = ZONES[t['maxspeed:type']] || ZONES[t['source:maxspeed']] || ZONES[t['zone:maxspeed']] || ZONES[t.maxspeed];
    if (z) return z;
    const h = String(t.highway || ''), kind = /_link$/.test(h) ? 'link' : h;
    const urban = t.lit === 'yes' || (t.sidewalk && t.sidewalk !== 'no') || !!t['sidewalk:both'] || !!t['sidewalk:left'] || !!t['sidewalk:right'];
    if (kind === 'trunk' && !urban) return t.oneway === 'yes' ? 110 : 80;
    if (!/^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street)$/.test(kind)) return null;
    return frDefault(kind, urban);
  }
  async function speedLimit(ll) {
    if (busy) return undefined;
    busy = true;
    try {
      const j = await getJSON(OVP[0], { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent('[out:json][timeout:6];way(around:25,' + ll[1].toFixed(6) + ',' + ll[0].toFixed(6) + ')["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street)(_link)?$"];out tags geom 12;') }, 7000);
      // la route la plus proche : son panneau s'il est connu, sinon (en France) la règle générale
      let best = null, bd = 40;
      (j.elements || []).forEach(w => {
        const g = (w.geometry || []).map(p => [p.lon, p.lat]), t = w.tags || {};
        if (g.length < 2) return;
        const d = G.nearest(g, G.cum(g), ll, 0, g.length - 2).d;
        if (d >= bd) return;
        const v = parseMax(t.maxspeed), e = v ? 0 : (inFrance(ll) ? guessWay(t) : null);
        if (v || e) { bd = d; best = v || -e; }
      });
      return best;
    } catch (e) { return undefined; }
    finally { busy = false; }
  }

  return { style, search, reverse, route, limits, weather, pois, speedLimit, ORTHO, _t: { frDefault, guessWay, inFrance, photonPlace, banPlace, vTrip, oRoute, poiPlace, parseMax, frLabels, lanes } };
})();
