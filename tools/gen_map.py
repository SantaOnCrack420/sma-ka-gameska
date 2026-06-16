#!/usr/bin/env python3
"""
Generátor herní mapy GTA Těšín z OpenStreetMap.
Vyrobí assets/map.png (2.5D render reálného Českého Těšína) + assets/mapdata.js
(kolizní mřížka + meta), vše na JEDNÉ projekci → kolize sedí na pixel.

Spuštění:  python3 tools/gen_map.py
Závislosti: pillow  (pip install pillow).  OSM stahuje přes Overpass (urllib).

Klíčové konstanty (uprav podle potřeby):
- NL, NO   = střed mapy = Náměstí ČSA (lat, lon)
- HALF_M   = poloměr výřezu v metrech (1100 m čtverec = centrum + okolí)
- PXM      = px na metr (sladěné měřítko; hra používá ZOOM v game.js)
Poznámka: Český Těšín je ZÁPADNĚ od Olzy; Polsko (Cieszyn) východně se ořezává
hranicí obce (point-in-polygon), proto se stahuje i boundary relation.
"""
import json, math, random, urllib.parse, urllib.request, os
from collections import deque
from PIL import Image, ImageDraw

# ---------- konfigurace ----------
NL, NO = 49.7462, 18.6255      # Náměstí ČSA
HALF_M = 560.0                 # poloměr výřezu (m) -> ~1120 m čtverec
PXM    = 3.6                   # px / metr (měřítko)
CELL   = 8                     # velikost kolizní buňky (px)
HERE   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(HERE, 'assets')
MIRRORS = [
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
]
# bbox pro stažení (o kus větší než výřez)
BB = '49.7260,18.5980,49.7680,18.6360'

def overpass(q, cache):
    p = os.path.join('/tmp', cache)
    if os.path.exists(p):
        return json.load(open(p))
    for ep in MIRRORS:
        try:
            data = urllib.parse.urlencode({'data': q}).encode()
            with urllib.request.urlopen(ep, data, timeout=180) as r:
                txt = r.read().decode()
            j = json.loads(txt); json.dump(j, open(p, 'w')); return j
        except Exception as e:
            print('  mirror selhal', ep, e)
    raise RuntimeError('Overpass nedostupný')

Q_BOUND = '[out:json][timeout:60];relation["name"="Český Těšín"]["admin_level"="8"]["boundary"="administrative"];out geom;'
Q_DATA = f'''[out:json][timeout:150];(
 way["building"]({BB});way["highway"]({BB});way["waterway"]({BB});
 way["natural"="water"]({BB});way["leisure"]({BB});
 way["landuse"~"forest|grass|cemetery|recreation_ground|meadow|residential"]({BB});
 way["railway"="rail"]({BB}););out geom;'''

def build_ring(bound):
    rel = [e for e in bound['elements'] if e['type'] == 'relation'][0]
    ways = [[(p['lon'], p['lat']) for p in m['geometry']]
            for m in rel['members'] if m['type'] == 'way' and m.get('geometry')]
    near = lambda a, c: abs(a[0]-c[0]) < 1e-7 and abs(a[1]-c[1]) < 1e-7
    ring = ways.pop(0)[:]; ch = True
    while ways and ch:
        ch = False
        for i, s in enumerate(ways):
            if   near(s[0], ring[-1]): ring += s[1:]; ways.pop(i); ch = True; break
            elif near(s[-1], ring[-1]): ring += s[-2::-1]; ways.pop(i); ch = True; break
            elif near(s[-1], ring[0]): ring = s[:-1]+ring; ways.pop(i); ch = True; break
            elif near(s[0], ring[0]): ring = s[1:][::-1]+ring; ways.pop(i); ch = True; break
    return ring

def pip(lon, lat, poly):
    ins = False; n = len(poly); j = n-1
    for i in range(n):
        xi, yi = poly[i]; xj, yj = poly[j]
        if ((yi > lat) != (yj > lat)) and (lon < (xj-xi)*(lat-yi)/(yj-yi)+xi): ins = not ins
        j = i
    return ins

def main():
    random.seed(7)
    ring = build_ring(overpass(Q_BOUND, 'bound.json'))
    els = overpass(Q_DATA, 'cz.json')['elements']
    cen = lambda g: (sum(p['lon'] for p in g)/len(g), sum(p['lat'] for p in g)/len(g))
    mlon = 111320*math.cos(math.radians(NL)); mlat = 111320
    minlat, maxlat = NL-HALF_M/mlat, NL+HALF_M/mlat
    minlon, maxlon = NO-HALF_M/mlon, NO+HALF_M/mlon
    W = int((maxlon-minlon)*mlon*PXM); H = int((maxlat-minlat)*mlat*PXM)
    xy = lambda la, lo: ((lo-minlon)*mlon*PXM, (maxlat-la)*mlat*PXM)
    inframe = lambda e: any(minlon-0.002 <= p['lon'] <= maxlon+0.002 and
                            minlat-0.002 <= p['lat'] <= maxlat+0.002 for p in e['geometry'])
    K = [e for e in els if e.get('geometry') and pip(*cen(e['geometry']), ring) and inframe(e)]
    P = lambda e: [xy(p['lat'], p['lon']) for p in e['geometry']]
    print(f'rozměr {W}x{H} ({W*H/1e6:.1f} MP), budov {sum(1 for e in K if "building" in e.get("tags",{}))}')

    img = Image.new('RGB', (W, H), '#6f9b54'); dr = ImageDraw.Draw(img, 'RGBA')
    for _ in range(W*H//700):
        x = random.randint(0, W-1); y = random.randint(0, H-1)
        dr.rectangle([x, y, x+random.randint(2, 6), y+random.randint(2, 6)],
                     fill=random.choice([(0, 0, 0, 15), (255, 255, 255, 11)]))
    for e in K:
        t = e.get('tags', {})
        if t.get('landuse') == 'forest' or t.get('natural') == 'wood' or t.get('leisure') in ('park', 'garden'): dr.polygon(P(e), fill='#4f7d3e')
        elif t.get('landuse') in ('grass', 'meadow', 'recreation_ground'): dr.polygon(P(e), fill='#79a85a')
        elif t.get('landuse') == 'cemetery': dr.polygon(P(e), fill='#5f7350')
    for e in K:
        if e.get('tags', {}).get('natural') == 'water': dr.polygon(P(e), fill='#4a90c4')
    for e in els:
        t = e.get('tags', {}); g = e.get('geometry')
        if g and t.get('waterway') and cen(g)[0] < 18.6315 and inframe(e): dr.line(P(e), fill='#4a90c4', width=int(10*PXM), joint='curve')
    rw = lambda h: {'primary': 11, 'trunk': 11, 'secondary': 9, 'tertiary': 7, 'residential': 6,
                    'living_street': 5, 'unclassified': 5, 'service': 3.5}.get(h, 2 if h in ('footway', 'path', 'pedestrian', 'steps', 'cycleway') else 4)
    for e in K:
        if 'highway' in e.get('tags', {}):
            w = rw(e['tags']['highway'])
            if w >= 4: dr.line(P(e), fill='#2b2b33', width=int((w+4)*PXM), joint='curve')
    for e in K:
        if 'highway' in e.get('tags', {}):
            w = rw(e['tags']['highway']); dr.line(P(e), fill='#55555f' if w >= 4 else '#8a8276', width=max(1, int(w*PXM)), joint='curve')
    for e in K:
        if e.get('tags', {}).get('railway') == 'rail': dr.line(P(e), fill='#7a7a7a', width=int(4*PXM), joint='curve')
    # 2.5D budovy (odzadu dopředu)
    bld = [e for e in K if 'building' in e.get('tags', {})]
    def lv(t):
        for k in ('building:levels', 'levels'):
            if k in t:
                try: return max(1, min(8, float(t[k])))
                except Exception: pass
        return 3
    roofs = ['#c75b46', '#b5503f', '#cf6a4a', '#9a8a6a', '#a05040', '#8a8a92']
    walls = ['#9a7f6a', '#8f7560', '#a08a72', '#7d7060']
    sox, soy = int(3*PXM/1.15), int(5*PXM/1.15)
    for e in sorted(bld, key=lambda e: max(p[1] for p in P(e))):
        p = P(e)
        if len(p) < 3: continue
        h = lv(e.get('tags', {}))*3*PXM
        dr.polygon([(x+sox, y+soy) for x, y in p], fill=(0, 0, 0, 80))
        dr.polygon(p, fill=walls[hash(str(e.get('id', 0))) % len(walls)])
        dr.polygon([(x, y-h) for x, y in p], fill=roofs[hash(str(e.get('id', 1))) % len(roofs)], outline='#3a2c22')
    img.save(os.path.join(ASSETS, 'map.png'))

    # ---------- kolize ----------
    GW, GH = W//CELL+1, H//CELL+1; grid = bytearray(GW*GH)
    def fillpoly(pts):
        ys = [q[1] for q in pts]
        for gy in range(max(0, int(min(ys)//CELL)), min(GH-1, int(max(ys)//CELL))+1):
            yc = gy*CELL+CELL/2; xs = []
            for i in range(len(pts)):
                ax, ay = pts[i]; bx, by = pts[(i+1) % len(pts)]
                if (ay <= yc < by) or (by <= yc < ay): xs.append(ax+(yc-ay)*(bx-ax)/(by-ay))
            xs.sort()
            for k in range(0, len(xs)-1, 2):
                for gx in range(max(0, int(xs[k]//CELL)), min(GW-1, int(xs[k+1]//CELL))+1): grid[gy*GW+gx] = 1
    for e in K:
        t = e.get('tags', {})
        if 'building' in t or t.get('natural') == 'water': fillpoly(P(e))
    for e in els:
        t = e.get('tags', {}); g = e.get('geometry')
        if g and t.get('waterway') and cen(g)[0] < 18.6315 and inframe(e):
            pts = P(e)
            for i in range(len(pts)-1):
                x0, y0 = pts[i]; x1, y1 = pts[i+1]; n = int(max(abs(x1-x0), abs(y1-y0))//4)+1
                for s in range(n+1):
                    x = x0+(x1-x0)*s/n; y = y0+(y1-y0)*s/n
                    for ox in range(-10, 11, 4):
                        gx, gy = int((x+ox)//CELL), int(y//CELL)
                        if 0 <= gx < GW and 0 <= gy < GH: grid[gy*GW+gx] = 1
    # eroze 1 pass = širší průchozí ulice
    g2 = bytearray(grid)
    for y in range(GH):
        for x in range(GW):
            if grid[y*GW+x] == 1:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x+dx, y+dy
                    if 0 <= nx < GW and 0 <= ny < GH and grid[ny*GW+nx] == 0: g2[y*GW+x] = 0; break
    sx, sy = xy(NL, NO); scx, scy = int(sx//CELL), int(sy//CELL)
    if g2[scy*GW+scx] == 1:                       # spawn -> nejbližší pochozí
        seen = {(scx, scy)}; dq = deque([(scx, scy)])
        while dq:
            c, r = dq.popleft()
            for nc, nr in ((c+1, r), (c-1, r), (c, r+1), (c, r-1)):
                if 0 <= nc < GW and 0 <= nr < GH and (nc, nr) not in seen:
                    if g2[nr*GW+nc] == 0: scx, scy = nc, nr; dq.clear(); break
                    seen.add((nc, nr)); dq.append((nc, nr))
    def rle(b):
        out = []; i = 0; n = len(b)
        while i < n:
            v = b[i]; j = i
            while j < n and b[j] == v: j += 1
            out.append(('Z' if v else 'O')+str(j-i)); i = j
        return ''.join(out)
    enc = rle(g2)
    js = ('// AUTO z OSM (Český Těšín centrum, 2.5D). Generuje tools/gen_map.py. Needituj ručně.\n'
          f'const MAP_IMG_W={W}, MAP_IMG_H={H}, MAP_PXM={PXM};\n'
          f'const COL_CELL={CELL}, COL_W={GW}, COL_H={GH};\n'
          f'const SPAWN_PX=[{scx*CELL+CELL//2},{scy*CELL+CELL//2}];\n'
          'const COL_RLE="'+enc+'";\n')
    open(os.path.join(ASSETS, 'mapdata.js'), 'w').write(js)
    walk = sum(1 for v in g2 if v == 0)
    print(f'map.png + mapdata.js hotovo | grid {GW}x{GH}, pochozích {walk}, RLE {len(enc)}')

if __name__ == '__main__':
    main()
