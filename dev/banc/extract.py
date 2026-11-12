# Banc d'essai : transforme l'extrait OpenStreetMap d'Utrecht en couches façon OpenMapTiles (pour la carte de test)
# et en petites bases pour simuler la recherche d'adresses, les lieux utiles et les limitations de vitesse.
import json, sys, osmium

BB = (5.00, 52.03, 5.23, 52.15)   # zone détaillée (bâtiments, lieux)
inbb = lambda lon, lat: BB[0] <= lon <= BB[2] and BB[1] <= lat <= BB[3]

HW = {'motorway': 'motorway', 'motorway_link': 'motorway', 'trunk': 'trunk', 'trunk_link': 'trunk', 'primary': 'primary', 'primary_link': 'primary',
      'secondary': 'secondary', 'secondary_link': 'secondary', 'tertiary': 'tertiary', 'tertiary_link': 'tertiary',
      'unclassified': 'minor', 'residential': 'minor', 'living_street': 'minor', 'road': 'minor', 'service': 'service', 'track': 'track',
      'pedestrian': 'path', 'path': 'path', 'footway': 'path', 'cycleway': 'path', 'steps': 'path', 'bridleway': 'path', 'busway': 'busway'}
POI_AMENITY = {'restaurant': 'restaurant', 'fast_food': 'fast_food', 'cafe': 'cafe', 'bar': 'bar', 'pub': 'beer', 'fuel': 'fuel', 'pharmacy': 'pharmacy', 'hospital': 'hospital',
               'school': 'school', 'university': 'college', 'bank': 'bank', 'post_office': 'post', 'library': 'library', 'cinema': 'cinema', 'theatre': 'theatre',
               'parking': 'parking', 'place_of_worship': 'place_of_worship', 'townhall': 'town_hall', 'police': 'police', 'charging_station': 'fuel'}
POI_SHOP = {'supermarket': 'grocery', 'convenience': 'grocery', 'bakery': 'bakery', 'clothes': 'clothing_store', 'books': 'library', 'hairdresser': 'hairdresser', 'bicycle': 'bicycle'}
SERVICE_AMENITY = {'fuel', 'charging_station', 'parking', 'restaurant', 'fast_food', 'cafe', 'pharmacy'}
SERVICE_SHOP = {'supermarket', 'convenience', 'bakery'}

class H(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.fab = osmium.geom.GeoJSONFactory()
        self.L = {k: [] for k in ['transportation', 'transportation_name', 'building', 'water', 'waterway', 'landcover', 'landuse', 'park', 'place', 'poi', 'water_name', 'aeroway', 'boundary']}
        self.places, self.pois, self.speed = [], [], []
        self.streets = {}
        self.nrank = 0

    def add(self, layer, geom, props):
        self.L[layer].append({'type': 'Feature', 'properties': props, 'geometry': geom})

    def named(self, t, lon, lat, kind, eid):
        name = t.get('name')
        key = next((k for k in ('amenity', 'shop', 'tourism', 'leisure', 'railway', 'place', 'office', 'historic') if k in t), None)
        if not name or not key: return
        p = {'name': name, 'osm_key': key, 'osm_value': t[key], 'osm_type': kind, 'osm_id': eid, 'lon': lon, 'lat': lat, 'countrycode': 'NL', 'country': 'Pays-Bas', 'state': 'Utrecht', 'city': t.get('addr:city', 'Utrecht'),
             'type': 'city' if key == 'place' and t[key] in ('city', 'town', 'village') else 'district' if key == 'place' else 'house'}
        for a, b in (('addr:street', 'street'), ('addr:housenumber', 'housenumber'), ('addr:postcode', 'postcode')):
            if a in t: p[b] = t[a]
        self.places.append(p)

    def service(self, t, kind, eid, lon, lat):
        if t.get('amenity') in SERVICE_AMENITY or t.get('shop') in SERVICE_SHOP:
            e = {'type': kind, 'id': eid, 'tags': dict(t)}
            if kind == 'node': e['lat'] = lat; e['lon'] = lon
            else: e['center'] = {'lat': lat, 'lon': lon}
            self.pois.append(e)

    def poi_feature(self, t, lon, lat):
        cls = POI_AMENITY.get(t.get('amenity')) or POI_SHOP.get(t.get('shop')) or ({'hotel': 'lodging', 'museum': 'museum', 'attraction': 'attraction'}.get(t.get('tourism'))) or ('railway' if t.get('railway') == 'station' else None)
        if not cls or not t.get('name') or not inbb(lon, lat): return
        self.nrank += 1
        self.add('poi', {'type': 'Point', 'coordinates': [lon, lat]}, {'name': t['name'], 'class': cls, 'subclass': t.get('amenity') or t.get('shop') or t.get('tourism') or 'station', 'rank': 1 + self.nrank % 30})

    def node(self, n):
        t = {x.k: x.v for x in n.tags}
        if not t or not n.location.valid(): return
        lon, lat = n.location.lon, n.location.lat
        if 'place' in t and t.get('name'):
            cls = t['place']
            if cls in ('city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood', 'quarter'):
                self.add('place', {'type': 'Point', 'coordinates': [lon, lat]}, {'name': t['name'], 'name:fr': t.get('name:fr', t['name']), 'name_en': t.get('name:en', t['name']), 'name:latin': t['name'], 'class': cls, 'rank': {'city': 6, 'town': 9, 'village': 11, 'suburb': 11, 'quarter': 12, 'neighbourhood': 13, 'hamlet': 13}[cls]})
        self.named(t, lon, lat, 'N', n.id)
        if inbb(lon, lat): self.service(t, 'node', n.id, lon, lat)
        self.poi_feature(t, lon, lat)

    def way(self, w):
        t = {x.k: x.v for x in w.tags}
        if not t: return
        hw, rw, ww = t.get('highway'), t.get('railway'), t.get('waterway')
        if not (hw in HW or rw in ('rail', 'tram', 'light_rail', 'subway') or ww in ('river', 'canal', 'stream', 'ditch', 'drain') or t.get('aeroway') in ('runway', 'taxiway')): return
        try: g = json.loads(self.fab.create_linestring(w))
        except Exception: return
        brunnel = 'bridge' if t.get('bridge') not in (None, 'no') else 'tunnel' if t.get('tunnel') not in (None, 'no') else None
        if hw in HW:
            p = {'class': HW[hw]}
            if HW[hw] == 'path' or hw in ('living_street', 'residential', 'unclassified'): p['subclass'] = hw
            if hw.endswith('_link'): p['ramp'] = 1
            if brunnel: p['brunnel'] = brunnel
            if t.get('oneway') in ('yes', '1', 'true'): p['oneway'] = 1
            if t.get('surface') in ('unpaved', 'gravel', 'dirt', 'ground', 'grass', 'sand', 'compacted'): p['surface'] = 'unpaved'
            self.add('transportation', g, p)
            name, ref = t.get('name'), t.get('ref')
            if name or ref:
                q = {'class': HW[hw]}
                if name: q['name'] = name; q['name:latin'] = name; q['name_en'] = name
                if ref: q['ref'] = ref.split(';')[0]; q['ref_length'] = len(q['ref']); q['network'] = 'road'
                self.add('transportation_name', g, q)
            if name and HW[hw] != 'path':
                c = g['coordinates'][len(g['coordinates']) // 2]
                self.streets.setdefault(name, []).append(c)
            if t.get('maxspeed') and HW[hw] not in ('path', 'track'):
                self.speed.append({'type': 'way', 'id': w.id, 'tags': {'highway': hw, 'maxspeed': t['maxspeed'], 'name': t.get('name', '')}, 'geometry': [{'lat': c[1], 'lon': c[0]} for c in g['coordinates']]})
        elif rw:
            p = {'class': 'rail' if rw == 'rail' else 'transit', 'subclass': rw}
            if brunnel: p['brunnel'] = brunnel
            if t.get('service'): p['service'] = t['service']
            self.add('transportation', g, p)
        elif ww:
            p = {'class': ww}
            if t.get('name'): p['name'] = t['name']; p['name:latin'] = t['name']; p['name_en'] = t['name']
            if brunnel: p['brunnel'] = brunnel
            self.add('waterway', g, p)
        else:
            self.add('aeroway', g, {'class': t['aeroway']})

    def area(self, a):
        t = {x.k: x.v for x in a.tags}
        if not t: return
        b, nat, lu, le, am = t.get('building'), t.get('natural'), t.get('landuse'), t.get('leisure'), t.get('amenity')
        want = (b and b != 'no') or nat in ('water', 'wood', 'wetland', 'scrub', 'heath', 'grassland', 'sand', 'beach') or lu or le in ('park', 'garden', 'pitch', 'golf_course', 'nature_reserve', 'stadium', 'playground') or am in ('school', 'university', 'college', 'hospital', 'parking', 'fuel', 'charging_station', 'restaurant', 'fast_food', 'cafe', 'pharmacy') or t.get('shop') in SERVICE_SHOP or t.get('waterway') == 'riverbank' or t.get('place') in ('square',)
        if not want: return
        try: g = json.loads(self.fab.create_multipolygon(a))
        except Exception: return
        c = g['coordinates'][0][0][0]
        lon, lat = c[0], c[1]
        if b and b != 'no':
            if inbb(lon, lat):
                try: h = float(str(t.get('height', '')).replace('m', '').strip())
                except ValueError:
                    try: h = float(t.get('building:levels', '')) * 3.2
                    except ValueError: h = 6
                self.add('building', g, {'render_height': round(max(3, min(h, 120)), 1), 'render_min_height': 0})
        elif nat == 'water' or t.get('waterway') == 'riverbank' or lu in ('reservoir', 'basin'):
            self.add('water', g, {'class': 'river' if t.get('water') in ('river', 'canal') or t.get('waterway') == 'riverbank' else 'lake'})
        elif nat in ('wood',) or lu == 'forest': self.add('landcover', g, {'class': 'wood', 'subclass': 'forest'})
        elif nat in ('wetland',): self.add('landcover', g, {'class': 'wetland', 'subclass': 'wetland'})
        elif nat in ('sand', 'beach'): self.add('landcover', g, {'class': 'sand', 'subclass': nat})
        elif le in ('park', 'garden', 'golf_course', 'playground') or lu in ('grass', 'meadow', 'village_green', 'recreation_ground') or nat in ('grassland', 'scrub', 'heath'):
            self.add('landcover', g, {'class': 'grass', 'subclass': 'park' if le in ('park', 'garden') else (lu or nat or le)})
            if le == 'park': self.add('park', g, {'class': 'public_park'})
        elif lu in ('farmland', 'farmyard', 'orchard', 'allotments'): self.add('landcover', g, {'class': 'farmland', 'subclass': lu})
        elif lu in ('residential', 'industrial', 'commercial', 'retail', 'cemetery', 'railway', 'military', 'quarry'): self.add('landuse', g, {'class': lu})
        elif le in ('pitch', 'stadium'): self.add('landuse', g, {'class': le})
        elif am in ('school', 'university', 'college', 'hospital'): self.add('landuse', g, {'class': am})
        if not a.from_way(): return
        # centre approximatif pour les lieux décrits par un contour
        ring = g['coordinates'][0][0]
        clon = sum(p[0] for p in ring) / len(ring); clat = sum(p[1] for p in ring) / len(ring)
        self.named(t, clon, clat, 'W', a.orig_id())
        if inbb(clon, clat): self.service(t, 'way', a.orig_id(), clon, clat)
        self.poi_feature(t, clon, clat)

h = H()
h.apply_file(sys.argv[1], locations=True)
for name, c in h.streets.items():
    m = c[len(c) // 2]
    h.places.append({'name': name, 'osm_key': 'highway', 'osm_value': 'residential', 'osm_type': 'W', 'osm_id': abs(hash(name)) % 10 ** 9, 'lon': m[0], 'lat': m[1], 'countrycode': 'NL', 'country': 'Pays-Bas', 'state': 'Utrecht', 'city': 'Utrecht', 'type': 'street'})
out = sys.argv[2]
for k, fs in h.L.items():
    with open('%s/layer-%s.ndjson' % (out, k), 'w') as f:
        for x in fs: f.write(json.dumps(x, separators=(',', ':')) + '\n')
    print(k, len(fs))
json.dump(h.places, open(out + '/places.json', 'w'))
json.dump(h.pois, open(out + '/pois.json', 'w'))
json.dump(h.speed, open(out + '/maxspeed.json', 'w'))
print('places', len(h.places), 'pois', len(h.pois), 'maxspeed ways', len(h.speed))
