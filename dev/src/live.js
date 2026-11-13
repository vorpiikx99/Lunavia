/* ---------- Lunavia : services en ligne (carte du monde réel) ----------
   Fond de carte : OpenFreeMap (données OpenStreetMap) · Photos aériennes : IGN Géoplateforme
   Recherche : Photon (komoot) et Base Adresse Nationale · Itinéraires, voies et limitations : Valhalla, secours OSRM (serveurs FOSSGIS)
   Lieux utiles : Overpass · Prix des carburants : données ouvertes du ministère de l'Économie · Météo : Open-Meteo */
J.live = (function () {
  const G = J.geo;
  const STYLES = 'https://tiles.openfreemap.org/styles/';
  // altitudes du terrain pour la vue 3D (« Terrain Tiles », jeu de données ouvert hébergé par AWS, encodage terrarium)
  const DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
  const ORTHO = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
  const VALHALLA = 'https://valhalla1.openstreetmap.de';
  const cache = {};

  async function getJSON(url, init, ms) {
    const c = new AbortController(), id = setTimeout(() => c.abort(), ms || 12000);
    const outer = init && init.signal; // une demande devenue inutile (on a tapé autre chose) est coupée tout de suite
    if (outer) { if (outer.aborted) c.abort(); else outer.addEventListener('abort', () => c.abort(), { once: true }); }
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
  /* Le thème « noir doux » : le fond clair recoloré (anthracite, rues grises, grands axes clairs, autoroutes jaunes). */
  const NOIR = { bg: '#1B1D22', land: '#202329', green: '#22362B', water: '#1E3A57', build: '#2B2F37', ext: '#383C45', road: '#8E94A0', minor: '#6C727E', major: '#B5BAC4', motor: '#E9BE63', casing: '#15171B', rail: '#3A3E47', text: '#E6E8EC', text2: '#B9BEC8', wtext: '#7FB2E8', halo: '#17191D' };
  function noir(st) {
    const c = NOIR;
    st.layers.forEach(l => {
      const id = String(l.id).toLowerCase(), sl = l['source-layer'] || '', p = l.paint = l.paint || {};
      if (l.type === 'background') p['background-color'] = c.bg;
      else if (l.type === 'fill') {
        delete p['fill-pattern'];
        p['fill-color'] = sl === 'water' || /water/.test(id) ? c.water : sl === 'park' || sl === 'landcover' || /park|wood|grass|forest|green|cemetery|pitch|garden/.test(id) ? c.green : sl === 'building' ? c.build : sl === 'transportation' || sl === 'aeroway' ? c.minor : c.land;
        p['fill-outline-color'] = 'rgba(0,0,0,0)';
      } else if (l.type === 'fill-extrusion') { p['fill-extrusion-color'] = c.ext; p['fill-extrusion-opacity'] = 0.85; }
      else if (l.type === 'line') {
        p['line-color'] = sl === 'waterway' || sl === 'water' ? c.water : sl === 'boundary' ? c.major : /rail|transit/.test(id) ? c.rail : /casing|outline/.test(id) ? c.casing
          : /motorway/.test(id) ? c.motor : /trunk|primary|secondary|tertiary|major/.test(id) ? c.major : /path|track|service|pedestrian|steps|pier/.test(id) ? c.minor : sl === 'transportation' || sl === 'aeroway' ? c.road : c.minor;
      } else if (l.type === 'symbol') {
        p['text-color'] = sl === 'water_name' || sl === 'waterway' ? c.wtext : sl === 'place' || sl === 'transportation_name' ? c.text : c.text2;
        p['text-halo-color'] = c.halo; p['text-halo-width'] = 1.5;
      }
    });
    return st;
  }
  async function style(name) {
    if (!cache[name]) {
      const st = await getJSON(STYLES + (name === 'noir' ? 'liberty' : name), {}, 8000);
      if (!st || !Array.isArray(st.layers) || !st.sources) throw new Error('style');
      frLabels(st);
      if (name === 'noir') noir(st);
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
  async function photon(q, near, signal) {
    const bias = near ? '&lat=' + near[1].toFixed(4) + '&lon=' + near[0].toFixed(4) + '&zoom=12&location_bias_scale=0.2' : '';
    const j = await getJSON('https://photon.komoot.io/api/?q=' + encodeURIComponent(q) + '&lang=fr&limit=8' + bias, { signal }, 6000);
    return (j.features || []).map(photonPlace).filter(Boolean);
  }
  async function ban(q, near, signal) {
    const bias = near ? '&lat=' + near[1].toFixed(4) + '&lon=' + near[0].toFixed(4) : '';
    const j = await getJSON('https://data.geopf.fr/geocodage/search?q=' + encodeURIComponent(q.slice(0, 190)) + '&limit=5&autocomplete=1&index=address' + bias, { signal }, 4000);
    return (j.features || []).map(banPlace).filter(Boolean);
  }
  const inFrance = ll => ll[0] > -5.3 && ll[0] < 9.7 && ll[1] > 41.2 && ll[1] < 51.2;
  const SEEN = new Map();
  async function search(q, near, opts) {
    const m = String(q).match(/^\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/);
    if (m) {
      const lat = parseFloat(m[1].replace(',', '.')), lon = parseFloat(m[2].replace(',', '.'));
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return [{ id: 'c' + lat + ',' + lon, name: 'Coordonnées', sub: lat.toFixed(5) + ', ' + lon.toFixed(5), ll: [lon, lat], kind: 'pin', cat: 'address', extra: {} }];
    }
    // une requête qui ressemble à une adresse (« 12 rue… ») met la base d'adresses officielle en tête ; sinon les lieux d'abord
    const addr = /^\s*\d{1,4}\s*(bis|ter|[a-d])?[ ,]/i.test(q) || /(^|\s)(rue|avenue|av\.?|bd|boulevard|chemin|impasse|all[ée]e|place|route|quai|cours|lotissement|r[ée]sidence|lieu-dit)\s/i.test(q);
    // Les deux sources sont interrogées en même temps, et la première qui répond s'affiche tout de suite (onPartial) :
    // on n'attend plus la plus lente pour montrer quelque chose. Les réponses récentes sont gardées en mémoire.
    const key = nrm(q) + '|' + (near ? near[0].toFixed(2) + ',' + near[1].toFixed(2) : '');
    const hit = SEEN.get(key);
    if (hit && Date.now() - hit.t < 300000) return hit.list;
    // lieux d'abord ceux qui sont près de moi, puis les commerces de l'annuaire officiel proches, puis le reste
    const gq = !addr && near ? generic(q) : null;
    const merge = (places, adr, ent) => {
      adr = (adr || []).filter(p => p.score >= (addr ? 0.4 : 0.6)); places = places || []; ent = ent || [];
      if (gq) return mergeGen(places, adr, ent);
      const dist = p => (near ? G.hav(near, p.ll) : 0), close = p => dist(p) < 50000;
      const nearP = places.filter(close), farP = places.filter(p => !close(p)), nearE = ent.filter(close).slice(0, 4), farE = ent.filter(p => !close(p)).slice(0, 2);
      const list = addr ? adr.slice(0, 4).concat(places, ent.slice(0, 3)) : nearP.slice(0, 5).concat(nearE, adr.slice(0, 2), nearP.slice(5), farP, farE), out = [];
      list.forEach(p => { if (!out.some(o => (nrm(o.name) === nrm(p.name) && G.hav(o.ll, p.ll) < 400) || G.hav(o.ll, p.ll) < 8)) out.push(p); });
      return out.slice(0, 9);
    };
    const signal = opts && opts.signal, part = opts && opts.onPartial;
    let places = null, adr = null, ent = null, done = 0, gen = null, genOk = false, genAt = near;
    // recherche par type de lieu : les plus proches d'abord, puis ce que trouvent les autres sources
    const mergeGen = (pl, ad, en) => {
      const out = (gen || []).slice(0, 9), far = pl.concat(en).filter(p => !out.some(o => G.hav(o.ll, p.ll) < 120)).sort((a, b) => G.hav(genAt, a.ll) - G.hav(genAt, b.ll));
      return out.concat(far).slice(0, 12);
    };
    const tell = () => { if (part && done < 4) { const l = merge(places, adr, ent); if (l.length) part(l); } };
    const d = !gq ? Promise.resolve(false) : (async () => {
      let c = near;
      if (gq.rest) { const tc = await townCenter(gq.rest, near, signal).catch(() => null); if (!tc) return false; c = tc.ll; }
      genAt = c; gen = await nearbyOf(gq.g, c, signal); return true;
    })().then(v => { genOk = !!v; done++; tell(); return v; }, () => { done++; return false; });
    const a = photon(q, near, signal).then(v => { places = v; done++; tell(); return true; }, () => { done++; return false; });
    const b = (nrm(q).length >= 3 ? ban(q, near, signal) : Promise.resolve([])).then(v => { adr = v; done++; tell(); return true; }, () => { done++; return false; });
    const c = (!addr && !gq && nrm(q).length >= 3 && near && inFrance(near) ? firms(q, near, signal) : Promise.resolve([])).then(v => { ent = v; done++; tell(); return true; }, () => { done++; return false; });
    const ok = await Promise.all([a, b, c, d]);
    if (signal && signal.aborted) throw new Error('abandon');
    if (!ok[0] && !ok[1] && !(ok[2] && ent && ent.length) && !(genOk && gen && gen.length)) throw new Error('search');
    const out = merge(places, adr, ent);
    if (ok[0] || genOk) { SEEN.set(key, { t: Date.now(), list: out }); if (SEEN.size > 60) SEEN.delete(SEEN.keys().next().value); }
    return out;
  }
  /* Commerces et entreprises : l'annuaire officiel (API Recherche d'entreprises, données Sirene). Il connaît des enseignes
     absentes d'OpenStreetMap (un magasin de plomberie, un grossiste…). On cherche dans le département où l'on se trouve
     et dans toute la France, et on ne garde que les établissements ouverts qui ont une position. */
  const DEPT = { at: null, code: '' };
  async function dept(near, signal) {
    if (DEPT.at && G.hav(DEPT.at, near) < 6000) return DEPT.code;
    try {
      const j = await getJSON('https://data.geopf.fr/geocodage/reverse?lon=' + near[0].toFixed(5) + '&lat=' + near[1].toFixed(5) + '&limit=1&index=address', { signal }, 3500);
      const pr = j.features && j.features[0] && j.features[0].properties, cc = String((pr && (pr.citycode || pr.postcode)) || '');
      DEPT.at = near.slice(); DEPT.code = /^97/.test(cc) ? cc.slice(0, 3) : cc.slice(0, 2);
    } catch (e) { return ''; }
    return DEPT.code;
  }
  const nice = t => String(t || '').toLowerCase().replace(/(^|[\s\-'’(])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
  async function firms(q, near, signal) {
    const d = await dept(near, signal), base = 'https://recherche-entreprises.api.gouv.fr/search?q=' + encodeURIComponent(q.slice(0, 80)) + '&etat_administratif=A&per_page=6&limite_matching_etablissements=12';
    const res = await Promise.allSettled([d ? getJSON(base + '&departement=' + encodeURIComponent(d), { signal }, 4500) : Promise.resolve({ results: [] }), getJSON(base, { signal }, 4500)]);
    if (res.every(r => r.status === 'rejected')) throw new Error('annuaire');
    const out = [], qn = nrm(q);
    res.forEach(r => (r.status === 'fulfilled' && r.value && r.value.results || []).forEach(e => (e.matching_etablissements || []).forEach(m => {
      const lat = parseFloat(m.latitude), lon = parseFloat(m.longitude);
      if (m.etat_administratif !== 'A' || !isFinite(lat) || !isFinite(lon)) return;
      const signs = (m.liste_enseignes || []).filter(Boolean), sign = signs.find(x => nrm(x).indexOf(qn.split(' ')[0]) >= 0) || signs[0] || m.nom_commercial || e.nom_complet || '';
      if (!sign) return;
      const adr = nice(String(m.adresse || '').replace(/\s+/g, ' ').trim()).replace(/ (De|Des|Du|La|Le|Les|Et|En|Sur|Sous|Aux|Au) /g, x => x.toLowerCase()).replace(/\b(Zi|Zac|Za|Zae|Rn|Rd|Cc) /g, x => x.toUpperCase()).replace(/ (D|L)(['’])/g, (x, a, b) => ' ' + a.toLowerCase() + b);
      out.push({ id: 'e' + (m.siret || lat + ',' + lon), name: nice(sign), sub: adr, ll: [lon, lat], kind: 'poi', cat: 'shop', extra: { lines: adr ? [adr] : [] } });
    })));
    const seen = new Set();
    return out.filter(p => (seen.has(p.id) ? false : seen.add(p.id))).sort((x, y) => G.hav(near, x.ll) - G.hav(near, y.ll)).slice(0, 8);
  }

  /* Recherches « génériques » (tabac, boulangerie, pharmacie…). Le moteur de recherche de lieux ne trouve que les endroits
     dont le NOM contient le mot tapé : un bureau de tabac qui s'appelle « Le Balto » lui échappe, et il préfère les grandes
     villes. Pour ces mots-là on cherche donc par TYPE de commerce, autour de soi (ou autour de la ville tapée après le mot),
     dans OpenStreetMap et dans l'annuaire officiel des entreprises, et on classe du plus proche au plus loin. */
  const GEN = [
    [['tabac', 'bureau de tabac', 'buraliste', 'bar tabac', 'tabac presse'], 'Tabac', 'shop', ['nwr["shop"="tobacco"]', 'nwr["tobacco"="yes"]', 'nwr["name"~"tabac",i]["shop"]', 'nwr["name"~"tabac",i]["amenity"~"^(bar|cafe)$"]'], ['47.26Z']],
    [['boulangerie', 'boulanger', 'pain', 'boulangerie patisserie'], 'Boulangerie', 'shop', ['nwr["shop"="bakery"]'], ['10.71C']],
    [['patisserie'], 'Pâtisserie', 'shop', ['nwr["shop"~"^(pastry|bakery)$"]'], ['10.71D']],
    [['pharmacie', 'pharmacien'], 'Pharmacie', 'pharma', ['nwr["amenity"="pharmacy"]'], ['47.73Z']],
    [['medecin', 'docteur', 'generaliste', 'medecin generaliste', 'cabinet medical', 'maison de sante'], 'Médecin', 'pharma', ['nwr["amenity"="doctors"]', 'nwr["healthcare"="doctor"]', 'nwr["healthcare"="centre"]'], ['86.21Z']],
    [['dentiste'], 'Dentiste', 'pharma', ['nwr["amenity"="dentist"]', 'nwr["healthcare"="dentist"]'], ['86.23Z']],
    [['kine', 'kinesitherapeute', 'kinesitherapie'], 'Kinésithérapeute', 'pharma', ['nwr["healthcare"="physiotherapist"]'], ['86.90E']],
    [['infirmier', 'infirmiere', 'cabinet infirmier'], 'Infirmier', 'pharma', ['nwr["healthcare"="nurse"]'], ['86.90D']],
    [['veterinaire', 'veto'], 'Vétérinaire', 'pharma', ['nwr["amenity"="veterinary"]'], ['75.00Z']],
    [['hopital', 'urgences', 'clinique'], 'Hôpital', 'pharma', ['nwr["amenity"~"^(hospital|clinic)$"]'], []],
    [['banque'], 'Banque', 'shop', ['nwr["amenity"="bank"]'], []],
    [['distributeur', 'distributeur de billets', 'dab', 'retrait', 'retrait argent', 'atm'], 'Distributeur', 'shop', ['nwr["amenity"="atm"]', 'nwr["amenity"="bank"]["atm"="yes"]'], []],
    [['poste', 'la poste', 'bureau de poste', 'relais poste'], 'La Poste', 'shop', ['nwr["amenity"="post_office"]'], []],
    [['supermarche', 'hypermarche', 'courses', 'grande surface'], 'Supermarché', 'shop', ['nwr["shop"~"^(supermarket|hypermarket)$"]'], []],
    [['superette', 'epicerie', 'alimentation', 'petit commerce', 'proxi'], 'Épicerie', 'shop', ['nwr["shop"~"^(convenience|grocery)$"]'], ['47.11B']],
    [['boucherie', 'boucher', 'charcuterie'], 'Boucherie', 'shop', ['nwr["shop"~"^(butcher|deli)$"]'], ['47.22Z']],
    [['primeur', 'fruits et legumes'], 'Primeur', 'shop', ['nwr["shop"="greengrocer"]'], ['47.21Z']],
    [['poissonnerie', 'poissonnier'], 'Poissonnerie', 'shop', ['nwr["shop"="seafood"]'], ['47.23Z']],
    [['fromagerie', 'fromager'], 'Fromagerie', 'shop', ['nwr["shop"="cheese"]'], []],
    [['cave', 'caviste', 'cave a vin', 'vin', 'domaine viticole', 'cave cooperative'], 'Cave', 'shop', ['nwr["shop"~"^(wine|alcohol)$"]', 'nwr["craft"="winery"]'], ['47.25Z']],
    [['coiffeur', 'coiffure', 'barbier', 'coiffeuse'], 'Coiffeur', 'shop', ['nwr["shop"="hairdresser"]'], ['96.02A']],
    [['institut de beaute', 'esthetique', 'estheticienne', 'onglerie'], 'Institut de beauté', 'shop', ['nwr["shop"~"^(beauty|cosmetics)$"]'], ['96.02B']],
    [['fleuriste', 'fleurs'], 'Fleuriste', 'shop', ['nwr["shop"="florist"]'], ['47.76Z']],
    [['opticien', 'lunettes'], 'Opticien', 'shop', ['nwr["shop"="optician"]'], ['47.78A']],
    [['presse', 'journaux', 'maison de la presse', 'marchand de journaux'], 'Presse', 'shop', ['nwr["shop"="newsagent"]', 'nwr["shop"="tobacco"]'], ['47.62Z']],
    [['librairie'], 'Librairie', 'shop', ['nwr["shop"="books"]'], ['47.61Z']],
    [['garage', 'garagiste', 'mecanicien', 'reparation auto', 'reparation voiture'], 'Garage', 'shop', ['nwr["shop"="car_repair"]'], ['45.20A']],
    [['controle technique'], 'Contrôle technique', 'shop', ['nwr["amenity"="vehicle_inspection"]', 'nwr["name"~"contr[oô]le technique",i]'], ['71.20A']],
    [['lavage', 'lavage auto', 'station de lavage', 'lavage voiture'], 'Lavage auto', 'shop', ['nwr["amenity"="car_wash"]'], []],
    [['pneu', 'pneus', 'pneumatique'], 'Pneus', 'shop', ['nwr["shop"="tyres"]'], []],
    [['laverie', 'laverie automatique'], 'Laverie', 'shop', ['nwr["shop"="laundry"]'], ['96.01B']],
    [['pressing'], 'Pressing', 'shop', ['nwr["shop"="dry_cleaning"]'], ['96.01B']],
    [['bricolage', 'magasin de bricolage'], 'Bricolage', 'shop', ['nwr["shop"~"^(doityourself|hardware)$"]'], ['47.52B']],
    [['quincaillerie'], 'Quincaillerie', 'shop', ['nwr["shop"="hardware"]'], ['47.52A']],
    [['jardinerie', 'pepiniere'], 'Jardinerie', 'shop', ['nwr["shop"="garden_centre"]'], []],
    [['animalerie'], 'Animalerie', 'shop', ['nwr["shop"="pet"]'], []],
    [['vetements', 'magasin de vetements'], 'Vêtements', 'shop', ['nwr["shop"="clothes"]'], []],
    [['chaussures'], 'Chaussures', 'shop', ['nwr["shop"="shoes"]'], []],
    [['telephonie', 'telephone', 'operateur'], 'Téléphonie', 'shop', ['nwr["shop"~"^(mobile_phone|telecommunication)$"]'], []],
    [['restaurant', 'resto', 'restau', 'manger'], 'Restaurant', 'food', ['nwr["amenity"="restaurant"]'], []],
    [['pizza', 'pizzeria'], 'Pizzeria', 'food', ['nwr["amenity"~"^(restaurant|fast_food)$"]["cuisine"~"pizza"]', 'nwr["name"~"pizz",i]["amenity"~"^(restaurant|fast_food)$"]', 'nwr["vending"="pizza"]'], []],
    [['kebab'], 'Kebab', 'food', ['nwr["amenity"~"^(restaurant|fast_food)$"]["cuisine"~"kebab"]', 'nwr["name"~"kebab",i]'], []],
    [['burger', 'fast food', 'restauration rapide'], 'Restauration rapide', 'food', ['nwr["amenity"="fast_food"]'], []],
    [['cafe', 'bar', 'bistrot', 'brasserie', 'pub'], 'Café', 'food', ['nwr["amenity"~"^(cafe|bar|pub)$"]'], []],
    [['glacier', 'glace', 'glaces'], 'Glacier', 'food', ['nwr["amenity"="ice_cream"]', 'nwr["shop"="ice_cream"]'], []],
    [['traiteur'], 'Traiteur', 'food', ['nwr["shop"="deli"]', 'nwr["craft"="caterer"]'], []],
    [['hotel', 'hotels'], 'Hôtel', 'other', ['nwr["tourism"="hotel"]'], []],
    [['chambre d hote', 'chambres d hotes', 'gite'], 'Hébergement', 'other', ['nwr["tourism"~"^(guest_house|chalet)$"]'], []],
    [['camping'], 'Camping', 'other', ['nwr["tourism"="camp_site"]'], []],
    [['aire de camping car', 'camping car'], 'Aire de camping-car', 'other', ['nwr["tourism"="caravan_site"]'], []],
    [['station service', 'station essence', 'essence', 'carburant', 'gazole', 'diesel', 'station'], 'Station-service', 'fuel', ['nwr["amenity"="fuel"]'], []],
    [['borne de recharge', 'recharge', 'borne electrique', 'borne'], 'Borne de recharge', 'charge', ['nwr["amenity"="charging_station"]'], []],
    [['parking'], 'Parking', 'parking', ['nwr["amenity"="parking"]["access"!~"^(private|no|customers|permit)$"]'], []],
    [['toilettes', 'wc', 'toilette'], 'Toilettes', 'other', ['nwr["amenity"="toilets"]'], []],
    [['gendarmerie', 'police', 'commissariat'], 'Gendarmerie', 'other', ['nwr["amenity"="police"]'], []],
    [['mairie'], 'Mairie', 'other', ['nwr["amenity"="townhall"]'], []],
    [['ecole', 'college', 'lycee'], 'École', 'other', ['nwr["amenity"~"^(school|college)$"]'], []],
    [['creche'], 'Crèche', 'other', ['nwr["amenity"~"^(kindergarten|childcare)$"]'], []],
    [['eglise', 'chapelle'], 'Église', 'other', ['nwr["amenity"="place_of_worship"]["religion"="christian"]'], []],
    [['cinema'], 'Cinéma', 'other', ['nwr["amenity"="cinema"]'], []],
    [['piscine'], 'Piscine', 'other', ['nwr["leisure"~"^(swimming_pool|sports_centre|water_park)$"]["access"!~"^(private|no)$"]["sport"~"swimming"]', 'nwr["leisure"="water_park"]'], []],
    [['salle de sport', 'fitness', 'musculation'], 'Salle de sport', 'other', ['nwr["leisure"="fitness_centre"]'], ['93.13Z']],
    [['parc', 'jardin public'], 'Parc', 'other', ['nwr["leisure"="park"]'], []],
    [['aire de jeux', 'jeux enfants'], 'Aire de jeux', 'other', ['nwr["leisure"="playground"]'], []],
    [['plage'], 'Plage', 'other', ['nwr["natural"="beach"]'], []],
    [['gare', 'gare sncf', 'train'], 'Gare', 'other', ['nwr["railway"~"^(station|halt)$"]'], []],
    [['arret de bus', 'bus', 'abribus'], 'Arrêt de bus', 'other', ['node["highway"="bus_stop"]'], []],
    [['marche', 'marche couvert'], 'Marché', 'shop', ['nwr["amenity"="marketplace"]'], []],
    [['dechetterie', 'decheterie'], 'Déchetterie', 'other', ['nwr["amenity"="recycling"]["recycling_type"="centre"]'], []],
    [['notaire'], 'Notaire', 'other', ['nwr["office"="notary"]'], ['69.10Z']],
    [['agence immobiliere', 'immobilier'], 'Agence immobilière', 'other', ['nwr["office"="estate_agent"]'], ['68.31Z']]
  ].map(([words, label, cat, osm, naf]) => ({ words: words.map(w => nrm(w)), label, cat, osm, naf }));
  // le mot tapé correspond-il à un type de lieu ? (pluriel accepté, « le plus proche », « près de moi »… ignorés)
  const FILL = /\b(le|la|les|un|une|des|du|de|d|au|aux|a|pres|proche|plus|proches|moi|cote|autour|ici|ouvert|ouverte|ouverts|svp|cherche|trouve|trouver|ou|est|il|y|en|dans|sur|vers|garde|nuit|24h|24|maintenant|aujourd|hui|ce|soir|matin)\b/g;
  const sing = w => (w.length > 3 ? w.replace(/(s|x)$/, '') : w);
  function generic(q) {
    const raw = nrm(q).split(' ').filter(Boolean), words = raw.map(sing);
    if (!words.length || words.length > 7) return null;
    let best = null;
    GEN.forEach(g => g.words.forEach(k => {
      const kw = k.split(' ').map(sing);
      if (kw.length > words.length || (best && kw.length <= best.n)) return;
      for (let i = 0; i < kw.length; i++) if (words[i] !== kw[i]) return;
      best = { g, n: kw.length };
    }));
    if (!best) return null;
    const rest = raw.slice(best.n).join(' ').replace(FILL, ' ').replace(/\s+/g, ' ').trim();
    return { g: best.g, rest };
  }
  // la ville tapée après le mot (« tabac st marcel ») : on cherche autour d'elle
  async function townCenter(name, near, signal) {
    const bias = near ? '&lat=' + near[1].toFixed(4) + '&lon=' + near[0].toFixed(4) : '';
    const j = await getJSON('https://data.geopf.fr/geocodage/search?q=' + encodeURIComponent(name.replace(/\bst\b/g, 'saint').replace(/\bste\b/g, 'sainte').slice(0, 120)) + '&type=municipality&limit=3&index=address' + bias, { signal }, 4000);
    const w = nrm(name).replace(/\bst\b/g, 'saint').split(' ').filter(x => x.length >= 3 && x !== 'saint' && x !== 'sainte')[0] || nrm(name);
    const f = (j.features || []).find(x => x.properties && x.properties.score >= 0.5 && nrm(x.properties.city || x.properties.name).indexOf(w) >= 0);
    return f ? { ll: f.geometry.coordinates.slice(0, 2), name: f.properties.city || f.properties.name } : null;
  }
  async function genOsm(g, c, r, signal) {
    const at = '(around:' + r + ',' + c[1].toFixed(5) + ',' + c[0].toFixed(5) + ')';
    const j = await overpass('[out:json][timeout:10];(' + g.osm.map(f => f + at + ';').join('') + ');out center tags 150;', 11000, signal);
    return (j.elements || []).map(e => {
      const p = poiPlace(e, ['fuel', 'charge', 'parking', 'food', 'shop', 'pharma'].indexOf(g.cat) >= 0 ? g.cat : 'shop');
      if (!p) return null;
      const t = e.tags || {};
      if (!t.name && !t.brand) p.name = g.label === 'Tabac' && /^(bar|cafe|pub)$/.test(t.amenity || '') ? 'Bar-tabac' : g.label;
      const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
      p.sub = [p.name !== g.label ? g.label : '', street, t['addr:city'] || ''].filter(Boolean).join(' · ') || g.label;
      p.kind = ['fuel', 'charge', 'parking', 'food', 'shop', 'pharma'].indexOf(g.cat) >= 0 ? g.cat : 'other';
      return p;
    }).filter(Boolean);
  }
  async function genFirms(g, c, km, signal) {
    if (!g.naf.length) return [];
    const j = await getJSON('https://recherche-entreprises.api.gouv.fr/near_point?lat=' + c[1].toFixed(5) + '&long=' + c[0].toFixed(5) + '&radius=' + km + '&activite_principale=' + g.naf.join(',') + '&per_page=25&limite_matching_etablissements=10', { signal }, 6000);
    const out = [];
    (j.results || []).forEach(e => (e.matching_etablissements || []).forEach(m => {
      const lat = parseFloat(m.latitude), lon = parseFloat(m.longitude);
      if (m.etat_administratif !== 'A' || !isFinite(lat) || !isFinite(lon)) return;
      const sign = (m.liste_enseignes || []).filter(Boolean)[0] || m.nom_commercial || '';
      const adr = nice(String(m.adresse || '').replace(/\s+/g, ' ').trim()).replace(/ (De|Des|Du|La|Le|Les|Et|En|Sur|Sous|Aux|Au) /g, x => x.toLowerCase()).replace(/\b(Zi|Zac|Za|Zae|Rn|Rd|Cc) /g, x => x.toUpperCase());
      // sans enseigne, on affiche le type de commerce plutôt que le nom légal (souvent celui d'une personne)
      out.push({ id: 'e' + (m.siret || lat + ',' + lon), name: sign ? nice(sign) : g.label, sub: (sign ? g.label + ' · ' : '') + adr, ll: [lon, lat], kind: ['fuel', 'charge', 'parking', 'food', 'shop', 'pharma'].indexOf(g.cat) >= 0 ? g.cat : 'other', cat: g.cat, extra: { lines: adr ? [adr] : [] } });
    }));
    return out;
  }
  async function nearbyOf(g, c, signal) {
    const run = async (r) => {
      const res = await Promise.allSettled([genOsm(g, c, r, signal), genFirms(g, c, Math.round(r / 1000), signal)]);
      if (res.every(x => x.status === 'rejected')) throw new Error('autour');
      const osm = res[0].status === 'fulfilled' ? res[0].value : [], ent = res[1].status === 'fulfilled' ? res[1].value : [], out = osm.slice();
      ent.forEach(p => { if (!out.some(o => G.hav(o.ll, p.ll) < 120)) out.push(p); }); // le même commerce vu par les deux sources
      return out.sort((a, b) => G.hav(c, a.ll) - G.hav(c, b.ll));
    };
    let list = await run(6000);
    if (list.length < 4) list = await run(20000);
    if (list.length < 2) list = await run(45000);
    return list.slice(0, 12);
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
    // routes signalées fermées (les deux sens) et sens interdits (un seul sens : le cap donné)
    if (opts.avoid && opts.avoid.length) req.exclude_locations = opts.avoid.slice(0, 20).map(p => { const ll = p.ll || p, o = { lat: ll[1], lon: ll[0] }; if (p.hd != null) { o.heading = Math.round(p.hd) % 360; o.heading_tolerance = 40; } return o; });
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
  async function overpass(q, ms, signal) {
    let err;
    for (const u of OVP) {
      try { return await getJSON(u, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q), signal }, ms || 14000); }
      catch (e) { err = e; if (signal && signal.aborted) throw e; }
    }
    throw err;
  }
  /* Temps de parcours avec le trafic (TomTom). On lui donne le tracé de NOTRE itinéraire : il le reconstitue et renvoie la
     durée réelle du moment, bouchons compris. Si son tracé s'écarte trop du nôtre, on n'en tient pas compte. */
  async function trafficTime(geom, key, signal) {
    if (!geom || geom.length < 2 || !key) return null;
    const step = Math.max(1, Math.ceil(geom.length / 350)), pts = [];
    for (let i = 0; i < geom.length; i += step) pts.push(geom[i]);
    if (pts[pts.length - 1] !== geom[geom.length - 1]) pts.push(geom[geom.length - 1]);
    const a = geom[0], b = geom[geom.length - 1], len = G.cum(geom)[geom.length - 1];
    const url = 'https://api.tomtom.com/routing/1/calculateRoute/' + a[1].toFixed(6) + ',' + a[0].toFixed(6) + ':' + b[1].toFixed(6) + ',' + b[0].toFixed(6) + '/json?key=' + encodeURIComponent(key) + '&traffic=true&travelMode=car&routeType=fastest&computeTravelTimeFor=all&maxAlternatives=0';
    const j = await getJSON(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ supportingPoints: pts.map(p => ({ latitude: +p[1].toFixed(6), longitude: +p[0].toFixed(6) })) }), signal }, 9000);
    const sm = j && j.routes && j.routes[0] && j.routes[0].summary;
    if (!sm || !(sm.travelTimeInSeconds > 0)) return null;
    if (sm.lengthInMeters && Math.abs(sm.lengthInMeters - len) > Math.max(400, len * 0.12)) return null;
    return { time: sm.travelTimeInSeconds, delay: Math.max(0, sm.trafficDelayInSeconds || 0), free: sm.noTrafficTravelTimeInSeconds || null };
  }
  /* Signalements partagés entre tous les utilisateurs (base Supabase). La clé ci-dessous est la clé publique du projet,
     faite pour être dans une appli : la base n'autorise qu'à lire les signalements récents, en ajouter et voter. */
  const SB = 'https://ygofvzisazupdbstksqp.supabase.co/rest/v1/', SBK = 'sb_publishable_O9oJnwfQdNzZ624KKbvLVw_FXG3s98_';
  const sbH = extra => Object.assign({ apikey: SBK }, extra || {});
  const shared = {
    // signalements autour d'un point (rayon en km)
    async list(ll, km) {
      const dy = km / 111, dx = km / (111 * Math.max(0.2, Math.cos(ll[1] * Math.PI / 180)));
      const q = 'reports?select=id,type,lon,lat,note,created_at,yes,no&lon=gte.' + (ll[0] - dx).toFixed(4) + '&lon=lte.' + (ll[0] + dx).toFixed(4) + '&lat=gte.' + (ll[1] - dy).toFixed(4) + '&lat=lte.' + (ll[1] + dy).toFixed(4) + '&order=created_at.desc&limit=300';
      const rows = await getJSON(SB + q, { headers: sbH() }, 9000);
      return { box: [ll[0] - dx, ll[1] - dy, ll[0] + dx, ll[1] + dy], rows: (Array.isArray(rows) ? rows : []).filter(r => r && r.id && isFinite(r.lon) && isFinite(r.lat)).map(r => ({ sid: r.id, type: r.type, ll: [+r.lon, +r.lat], note: r.note ? String(r.note).slice(0, 80) : '', t: Date.parse(r.created_at) || Date.now(), yes: r.yes || 0, no: r.no || 0 })) };
    },
    async post(rp) {
      const rows = await getJSON(SB + 'reports', { method: 'POST', headers: sbH({ 'content-type': 'application/json', prefer: 'return=representation' }), body: JSON.stringify({ type: rp.type, lon: rp.ll[0], lat: rp.ll[1], note: rp.note || null }) }, 9000);
      return Array.isArray(rows) && rows[0] ? rows[0].id : null;
    },
    async vote(sid, still) {
      const r = await fetch(SB + 'rpc/vote', { method: 'POST', headers: sbH({ 'content-type': 'application/json' }), body: JSON.stringify({ rid: sid, still: !!still }) });
      return r.ok;
    }
  };
  // sens de la route la plus proche d'un point (pour un sens interdit) : son cap et son nom
  async function roadAt(ll) {
    const j = await getJSON(VALHALLA + '/locate?json=' + encodeURIComponent(JSON.stringify({ locations: [{ lat: ll[1], lon: ll[0] }], costing: 'auto', verbose: true })), {}, 6000);
    const e = ((j && j[0] && j[0].edges) || []).filter(x => typeof x.heading === 'number').sort((a, b) => (a.distance || 0) - (b.distance || 0))[0];
    if (!e || e.distance > 40) return null;
    const nm = e.edge_info && e.edge_info.names && e.edge_info.names[0];
    return { hd: e.heading, ll: [e.correlated_lon, e.correlated_lat], name: nm || '' };
  }
  // points de contrôle le long d'un trajet (OpenStreetMap), pour en déduire des zones de danger : jamais affichés tels quels
  async function cameras(geom) {
    const step = Math.max(1, Math.ceil(geom.length / 140)), pts = [];
    for (let i = 0; i < geom.length; i += step) pts.push(geom[i]);
    pts.push(geom[geom.length - 1]);
    const line = pts.map(p => p[1].toFixed(5) + ',' + p[0].toFixed(5)).join(',');
    const j = await overpass('[out:json][timeout:12];node(around:70,' + line + ')["highway"="speed_camera"];out 60;', 14000);
    return (j.elements || []).filter(e => isFinite(e.lat) && isFinite(e.lon)).map(e => ({ id: e.id, ll: [e.lon, e.lat] }));
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

  return { style, search, reverse, route, limits, weather, pois, cameras, shared, trafficTime, roadAt, speedLimit, ORTHO, DEM, _t: { frDefault, guessWay, inFrance, firms, generic, photonPlace, banPlace, vTrip, oRoute, poiPlace, parseMax, frLabels, lanes } };
})();
