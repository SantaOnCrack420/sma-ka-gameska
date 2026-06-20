/* =========================================================
   render3d.js — Three.js 3D engine pro GTA 7: Těšín City
   Krok 1: budovy + podlaha + kamera + Šimmy billboard
   Globální THREE z assets/three.min.js (UMD r128)
   ========================================================= */
'use strict';

(function () {
  // ── Konstanty ze světa ───────────────────────────────────
  const PXM = 3.6;          // px / metr (MAP_PXM z mapdata.js)
  const FLOOR_Y = 0;        // podlaha na y=0
  const FLOOR_W = 4031 / PXM;   // ~1119 m
  const FLOOR_H = 4032 / PXM;   // ~1120 m

  // Přepočet svět-px → Three.js metry
  function wx2m(wx) { return wx / PXM; }
  function wy2m(wy) { return wy / PXM; }

  // ── Stav renderer ───────────────────────────────────────
  let renderer, scene, camera, simmySprite;
  let initialized = false;

  // ── Palette pro budovy ──────────────────────────────────
  // Koherentní paleta — mírně variace podle pater a indexu budovy,
  // NE náhodný hash. Sedm základních tónů šedohnědé zástavby.
  const WALL_PALETTE = [
    0x9a8070, // patra 1 — světlá cihlová
    0x8a7060, // patra 2
    0x7a6458, // patra 3
    0x9c8c78, // patra 4 — béžová
    0x6e6050, // patra 5+
    0x88796a,
    0xa09080,
  ];
  const ROOF_PALETTE = [
    0xc07855,
    0xb06848,
    0xa05840,
    0xb89065,
    0x905040,
    0xa07860,
    0xc09870,
  ];

  function wallColor(floors, idx) {
    const fi = Math.min(floors, 5) - 1;
    // jemná variace dle indexu budovy — posun v paletě o 1-2 kroky
    return WALL_PALETTE[(fi + (idx % 3)) % WALL_PALETTE.length];
  }
  function roofColor(floors, idx) {
    const fi = Math.min(floors, 5) - 1;
    return ROOF_PALETTE[(fi + (idx % 3)) % ROOF_PALETTE.length];
  }

  // ── Budova → ExtrudeGeometry ────────────────────────────
  function buildingGeometry(a) {
    const floors = a[0];
    const height = Math.max(floors, 1) * 3;  // metry

    // Vytvoří THREE.Shape z souřadnic polygonu (svět-px → metry)
    const shape = new THREE.Shape();
    const x0 = wx2m(a[1]);
    const z0 = wy2m(a[2]);
    shape.moveTo(x0, z0);
    for (let i = 3; i < a.length; i += 2) {
      shape.lineTo(wx2m(a[i]), wy2m(a[i + 1]));
    }
    shape.closePath();

    // Extrude nahoru (v Three.js Y=nahoru, ale Shape je v XZ rovině)
    // extrudeSettings: depth = výška, extrudePath = nahoru
    const extrudeSettings = {
      depth: height,
      bevelEnabled: false,
      steps: 1,
    };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // ExtrudeGeometry: shape v XY (X=worldX, Y=worldZ), depth jde do +Z.
    // rotateX(+90°): (x,y,z)→(x,−z,y) → X=worldX, Z=worldZ (souhlasí s podlahou
    // a hráčem!), depth→−Y. Pak translate(+height) zvedne budovu na Y∈[0,height].
    // Tahle cesta zachová správné vinutí stěn (žádné prosvítání skrz).
    geo.rotateX(Math.PI / 2);
    geo.translate(0, height, 0);
    return geo;
  }

  // ── Merge geometrií (ručně — r128 UMD nemá BufferGeometryUtils v globálním THREE) ──
  function mergeGeometries(geoList) {
    // ExtrudeGeometry je BEZ indexu (triangle soup) → sloučíme bezindexově.
    // Pojistka: kdyby přišla indexovaná geo, převedeme ji na non-indexed.
    const parts = geoList.map(g => ({
      geo: g.geo.index ? g.geo.toNonIndexed() : g.geo,
      color: g.color,
      roofColor: g.roofColor,
    }));

    let totalVerts = 0;
    for (const { geo } of parts) totalVerts += geo.attributes.position.count;

    const positions = new Float32Array(totalVerts * 3);
    const colors    = new Float32Array(totalVerts * 3);
    let vOff = 0;
    const colorObj = new THREE.Color();

    for (const { geo, color, roofColor: rc } of parts) {
      const pos = geo.attributes.position.array;
      const cnt = geo.attributes.position.count;

      // Střecha vs. stěna podle Y: vrcholy u nejvyššího Y = střecha.
      let maxY = -Infinity;
      for (let i = 1; i < pos.length; i += 3) {
        if (pos[i] > maxY) maxY = pos[i];
      }

      colorObj.setHex(color);
      const wallR = colorObj.r, wallG = colorObj.g, wallB = colorObj.b;
      colorObj.setHex(rc);
      const roofR = colorObj.r, roofG = colorObj.g, roofB = colorObj.b;

      for (let i = 0; i < cnt; i++) {
        const vi = i * 3;
        positions[vOff * 3 + 0] = pos[vi + 0];
        positions[vOff * 3 + 1] = pos[vi + 1];
        positions[vOff * 3 + 2] = pos[vi + 2];
        if (Math.abs(pos[vi + 1] - maxY) < 0.05) {
          colors[vOff * 3 + 0] = roofR;
          colors[vOff * 3 + 1] = roofG;
          colors[vOff * 3 + 2] = roofB;
        } else {
          colors[vOff * 3 + 0] = wallR;
          colors[vOff * 3 + 1] = wallG;
          colors[vOff * 3 + 2] = wallB;
        }
        vOff++;
      }
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
    // normály dopočítá volající přes computeVertexNormals() (ploché stěny)
    return merged;
  }

  // ── Sestav budovy ────────────────────────────────────────
  function buildCityMesh() {
    if (typeof VEC_BLD === 'undefined' || VEC_BLD.length === 0) {
      console.warn('[R3D] VEC_BLD nedostupné');
      return null;
    }

    const geoList = [];
    let skipped = 0;

    for (let idx = 0; idx < VEC_BLD.length; idx++) {
      const a = VEC_BLD[idx];
      if (!a || a.length < 5) { skipped++; continue; }
      const floors = a[0] || 1;

      try {
        const geo = buildingGeometry(a);
        geoList.push({
          geo,
          color:     wallColor(floors, idx),
          roofColor: roofColor(floors, idx),
        });
      } catch (e) {
        skipped++;
      }
    }

    if (geoList.length === 0) {
      console.warn('[R3D] Žádné budovy nebyly sestaveny');
      return null;
    }

    console.log('[R3D] Budov sestaveno:', geoList.length, '| přeskočeno:', skipped);

    const merged = mergeGeometries(geoList);
    merged.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({
      vertexColors: true,
    });

    return new THREE.Mesh(merged, mat);
  }

  // ── Podlaha ──────────────────────────────────────────────
  function buildFloor() {
    const geo = new THREE.PlaneGeometry(FLOOR_W, FLOOR_H);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0x6f9b54 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(FLOOR_W / 2, FLOOR_Y, FLOOR_H / 2);
    return mesh;
  }

  // ── Helper: ribbon (stuha) ze segmentů linky ─────────────────────────────
  // Vrátí non-indexed BufferGeometry: obdélníky kolmé na trasu.
  function buildRibbon(coords, halfWidth) {
    // coords = [x0,z0, x1,z1, ...]  (již v metrech)
    const verts = [];
    const n = Math.floor(coords.length / 2);
    if (n < 2) return null;

    for (let i = 0; i < n - 1; i++) {
      const ax = coords[i * 2], az = coords[i * 2 + 1];
      const bx = coords[i * 2 + 2], bz = coords[i * 2 + 3];
      // směrový vektor segmentu
      const dx = bx - ax, dz = bz - az;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.001) continue;
      // normála kolmá (otočena o 90°)
      const nx = -dz / len * halfWidth;
      const nz = dx / len * halfWidth;

      // 4 rohy kvádříku (2 trojúhelníky)
      const l0x = ax - nx, l0z = az - nz;
      const r0x = ax + nx, r0z = az + nz;
      const l1x = bx - nx, l1z = bz - nz;
      const r1x = bx + nx, r1z = bz + nz;

      // tri 1: l0, r0, l1
      verts.push(l0x, 0, l0z, r0x, 0, r0z, l1x, 0, l1z);
      // tri 2: r0, r1, l1
      verts.push(r0x, 0, r0z, r1x, 0, r1z, l1x, 0, l1z);
    }
    if (verts.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    return geo;
  }

  // ── Helper: polygon → ShapeGeometry ploše ─────────────────────────────────
  // coords = [x0,z0, x1,z1, ...] v metrech.
  // Vrátí non-indexed BufferGeometry (hotovo přes toNonIndexed).
  function buildPolygon(coords) {
    const n = Math.floor(coords.length / 2);
    if (n < 3) return null;
    try {
      const shape = new THREE.Shape();
      shape.moveTo(coords[0], coords[1]);
      for (let i = 1; i < n; i++) {
        shape.lineTo(coords[i * 2], coords[i * 2 + 1]);
      }
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      // ShapeGeometry je v XY rovině — položíme naplocho do XZ:
      geo.rotateX(-Math.PI / 2);
      return geo.index ? geo.toNonIndexed() : geo;
    } catch (e) {
      return null;
    }
  }

  // ── Helper: sloučení geometrií jedné barvy ────────────────────────────────
  function mergeFlat(geoList) {
    // Všechny geo jsou non-indexed, mají jen 'position'.
    let total = 0;
    for (const g of geoList) total += g.attributes.position.count;
    if (total === 0) return null;
    const arr = new Float32Array(total * 3);
    let off = 0;
    for (const g of geoList) {
      const src = g.attributes.position.array;
      arr.set(src, off);
      off += src.length;
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return merged;
  }

  // ── Helper: přepočet pole svět-px na metry ────────────────────────────────
  // a = [optCode?, x0, y0, x1, y1, ...] — vrátí [xm, zm, xm, zm, ...] jen souřadnice
  function pxCoordsToM(a, hasCode) {
    const start = hasCode ? 1 : 0;
    const out = [];
    for (let i = start; i + 1 < a.length; i += 2) {
      out.push(wx2m(a[i]), wy2m(a[i + 1]));
    }
    return out;
  }

  // ── Zeleň ────────────────────────────────────────────────
  function buildGreen() {
    if (typeof VEC_GREEN === 'undefined' || VEC_GREEN.length === 0) return null;

    const colorMap = {
      0: 0x5f7350,   // hřbitov
      1: 0x79a85a,   // tráva
      2: 0x4f7d3e,   // les
    };
    const byColor = {};  // hex → [geo, ...]

    for (const a of VEC_GREEN) {
      if (!a || a.length < 7) continue;  // min 3 body + kód
      const code = a[0];
      const color = colorMap[code] !== undefined ? colorMap[code] : 0x79a85a;
      const coords = pxCoordsToM(a, true);
      const geo = buildPolygon(coords);
      if (!geo) continue;
      // Posuň Y nahoru (z-fighting: zeleň nejníž)
      const pos = geo.attributes.position.array;
      for (let i = 1; i < pos.length; i += 3) pos[i] = 0.02;
      geo.attributes.position.needsUpdate = true;
      if (!byColor[color]) byColor[color] = [];
      byColor[color].push(geo);
    }

    const group = new THREE.Group();
    for (const [colorHex, geoList] of Object.entries(byColor)) {
      const merged = mergeFlat(geoList);
      if (!merged) continue;
      merged.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({ color: parseInt(colorHex) });
      group.add(new THREE.Mesh(merged, mat));
    }
    console.log('[R3D] Zeleň OK, skupin barev:', Object.keys(byColor).length);
    return group;
  }

  // ── Voda (polygony + linie) ────────────────────────────────
  function buildWater() {
    const geoList = [];

    // Polygony vody (VEC_WATERP) — BEZ kódu na začátku
    if (typeof VEC_WATERP !== 'undefined' && VEC_WATERP.length > 0) {
      for (const a of VEC_WATERP) {
        if (!a || a.length < 6) continue;
        const coords = pxCoordsToM(a, false);
        const geo = buildPolygon(coords);
        if (!geo) continue;
        const pos = geo.attributes.position.array;
        for (let i = 1; i < pos.length; i += 3) pos[i] = 0.05;
        geo.attributes.position.needsUpdate = true;
        geoList.push(geo);
      }
      console.log('[R3D] VEC_WATERP:', VEC_WATERP.length, 'polygonů');
    }

    // Vodní linie (VEC_WATERL) — stuha ~9 m (halfWidth 4.5 m), BEZ kódu
    if (typeof VEC_WATERL !== 'undefined' && VEC_WATERL.length > 0) {
      for (const a of VEC_WATERL) {
        if (!a || a.length < 4) continue;
        const coords = pxCoordsToM(a, false);
        const geo = buildRibbon(coords, 4.5);
        if (!geo) continue;
        const pos = geo.attributes.position.array;
        for (let i = 1; i < pos.length; i += 3) pos[i] = 0.05;
        geo.attributes.position.needsUpdate = true;
        geoList.push(geo);
      }
      console.log('[R3D] VEC_WATERL:', VEC_WATERL.length, 'linií');
    }

    if (geoList.length === 0) {
      console.log('[R3D] Voda: žádná data');
      return null;
    }
    const merged = mergeFlat(geoList);
    if (!merged) return null;
    merged.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ color: 0x4a90c4 });
    console.log('[R3D] Voda OK');
    return new THREE.Mesh(merged, mat);
  }

  // ── Silnice ───────────────────────────────────────────────
  // Šířky [asfalt_m, chodník_m_každá_strana]:
  const ROAD_WIDTHS = {
    '2': [11, 3],
    '1': [7, 2.2],
    '0': [4.5, 1.3],
    '-1': [2.4, 0],
  };

  function buildRoads() {
    if (typeof VEC_ROADS === 'undefined' || VEC_ROADS.length === 0) return null;

    const sidewalkGeos = [];
    const asphaltGeos  = [];

    for (const a of VEC_ROADS) {
      if (!a || a.length < 5) continue;
      const code = String(a[0]);
      const widths = ROAD_WIDTHS[code] || ROAD_WIDTHS['0'];
      const asphaltHalf = widths[0] / 2;
      const sidewalkHalf = asphaltHalf + widths[1];

      const coords = pxCoordsToM(a, true);
      if (coords.length < 4) continue;

      // Chodník (širší) — jen pokud má chodník
      if (widths[1] > 0) {
        const geoSW = buildRibbon(coords, sidewalkHalf);
        if (geoSW) {
          const pos = geoSW.attributes.position.array;
          for (let i = 1; i < pos.length; i += 3) pos[i] = 0.07;
          geoSW.attributes.position.needsUpdate = true;
          sidewalkGeos.push(geoSW);
        }
      }

      // Asfalt (užší)
      const asphaltColor = (parseInt(code) < 0) ? 0x9a9286 : 0x454552;
      const geoAS = buildRibbon(coords, asphaltHalf);
      if (geoAS) {
        const pos = geoAS.attributes.position.array;
        for (let i = 1; i < pos.length; i += 3) pos[i] = 0.09;
        geoAS.attributes.position.needsUpdate = true;
        // Třídu <0 přidáme do oddělené skupiny pro jinou barvu
        if (parseInt(code) < 0) {
          // Malé cestičky — jiná barva asfalt
          geoAS._altColor = true;
        }
        asphaltGeos.push(geoAS);
      }
    }

    const group = new THREE.Group();

    // Chodníky
    if (sidewalkGeos.length > 0) {
      const merged = mergeFlat(sidewalkGeos);
      if (merged) {
        merged.computeVertexNormals();
        const mat = new THREE.MeshLambertMaterial({ color: 0xb9b3a6 });
        group.add(new THREE.Mesh(merged, mat));
      }
    }

    // Asfalt — hlavní silnice (kód >= 0)
    const mainGeos = asphaltGeos.filter(g => !g._altColor);
    const altGeos  = asphaltGeos.filter(g => g._altColor);

    if (mainGeos.length > 0) {
      const merged = mergeFlat(mainGeos);
      if (merged) {
        merged.computeVertexNormals();
        const mat = new THREE.MeshLambertMaterial({ color: 0x454552 });
        group.add(new THREE.Mesh(merged, mat));
      }
    }
    if (altGeos.length > 0) {
      const merged = mergeFlat(altGeos);
      if (merged) {
        merged.computeVertexNormals();
        const mat = new THREE.MeshLambertMaterial({ color: 0x9a9286 });
        group.add(new THREE.Mesh(merged, mat));
      }
    }

    console.log('[R3D] Silnice OK, segmentů:', VEC_ROADS.length,
      '| chodník geo:', sidewalkGeos.length, '| asfalt geo:', asphaltGeos.length);
    return group;
  }

  // ── Koleje ────────────────────────────────────────────────
  function buildRail() {
    if (typeof VEC_RAIL === 'undefined' || VEC_RAIL.length === 0) {
      console.log('[R3D] VEC_RAIL: prázdné');
      return null;
    }

    const geoList = [];
    for (const a of VEC_RAIL) {
      if (!a || a.length < 4) continue;
      const coords = pxCoordsToM(a, false);
      const geo = buildRibbon(coords, 2.0);  // ~4 m celková šířka
      if (!geo) continue;
      const pos = geo.attributes.position.array;
      for (let i = 1; i < pos.length; i += 3) pos[i] = 0.08;
      geo.attributes.position.needsUpdate = true;
      geoList.push(geo);
    }

    if (geoList.length === 0) return null;
    const merged = mergeFlat(geoList);
    if (!merged) return null;
    merged.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ color: 0x7a7a7a });
    console.log('[R3D] Koleje OK, linií:', VEC_RAIL.length);
    return new THREE.Mesh(merged, mat);
  }

  // ── Billboard Šimmy ─────────────────────────────────────
  // Walk-cycle sprite sheet: 8 snímků v jednom řádku (assets/simmy_walk.png)
  const WALK_N = 8;
  let walkTex = null, walkFrame = 0, walkAcc = 0;
  function buildSimmySprite() {
    const loader = new THREE.TextureLoader();
    const tex = loader.load('assets/simmy_walk.png',
      () => {},
      undefined,
      (err) => { console.warn('[R3D] simmy_walk.png načítání selhalo:', err); }
    );
    tex.minFilter = THREE.LinearFilter;   // non-PoT sheet → bez mipmap (jinak černá)
    tex.generateMipmaps = false;
    tex.repeat.set(1 / WALK_N, 1);        // ukaž jen jeden snímek
    tex.offset.set(0, 0);
    walkTex = tex;
    // SpriteMaterial vždy čelí kameře — billboard zdarma
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: false,    // hráč VŽDY navrch (v top-down ho nesmí zakrýt barák)
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.6, 3.3, 1);  // poměr snímku 204:421 ≈ lidská postava
    sprite.renderOrder = 999;       // kresli po budovách
    return sprite;
  }
  // Přepínání snímků chůze (volá renderFrame): jde → cyklus, stojí → klid. snímek
  function animateWalk(moving, dt) {
    if (!walkTex) return;
    if (moving) {
      walkAcc += dt;
      if (walkAcc > 0.07) { walkAcc = 0; walkFrame = (walkFrame + 1) % WALK_N; walkTex.offset.x = walkFrame / WALK_N; }
    } else if (walkFrame !== 0) {
      walkFrame = 0; walkAcc = 0; walkTex.offset.x = 0;
    }
  }

  // ── POI billboardy (obchody/podniky) ────────────────────
  const POI_ICON_3D = {
    VECERKA:'🏪', KAUFLAND:'🛒', ALKOHOL:'🍾', STANEK:'🍫', TRAFIKA:'🚬',
    FASTFOOD:'🌯', HOSPODA:'🍺', BAR:'🍸', ZASTAVARNA:'💰', LEKARNA:'💊',
    BANKA:'🏧', PEKARNA:'🥖', RESTAURACE:'🍽️', REZNIK:'🥩', TRZNICE:'🛍️', PUMPA:'⛽',
  };

  let poiSprites = [];   // pole { sprite, wx, wy, hasName }
  let poiGroup = null;

  function makePOITexture(icon, name) {
    const W = 256, H = name ? 128 : 80;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // průhledné pozadí
    ctx.clearRect(0, 0, W, H);

    // tmavý zaoblený rámeček (jen když je název)
    if (name) {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      const r = 14;
      ctx.beginPath();
      ctx.moveTo(r, 0); ctx.lineTo(W - r, 0);
      ctx.quadraticCurveTo(W, 0, W, r);
      ctx.lineTo(W, H - r); ctx.quadraticCurveTo(W, H, W - r, H);
      ctx.lineTo(r, H); ctx.quadraticCurveTo(0, H, 0, H - r);
      ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      // jen malý kruh za ikonou
      ctx.fillStyle = 'rgba(0,0,0,0.60)';
      const cx = W / 2, cy = H / 2;
      ctx.beginPath(); ctx.arc(cx, cy, 36, 0, Math.PI * 2); ctx.fill();
    }

    // Ikona (velká emoji)
    ctx.font = name ? '52px serif' : '48px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const iconY = name ? 46 : H / 2;
    ctx.fillText(icon, W / 2, iconY);

    // Název (bílý text s tmavým obrysem)
    if (name) {
      const txt = name.length > 20 ? name.slice(0, 19) + '…' : name;
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // obrys
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.lineWidth = 4;
      ctx.strokeText(txt, W / 2, 96);
      // text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(txt, W / 2, 96);
    }

    return new THREE.CanvasTexture(canvas);
  }

  function buildPOI() {
    if (typeof POI === 'undefined' || POI.length === 0) {
      console.warn('[R3D] POI data nedostupná');
      return null;
    }

    const group = new THREE.Group();
    poiSprites = [];
    let count = 0, skipped = 0;

    for (const entry of POI) {
      if (!Array.isArray(entry) || entry.length < 3) { skipped++; continue; }
      const [role, wx, wy, name] = entry;
      if (typeof wx !== 'number' || typeof wy !== 'number') { skipped++; continue; }

      const icon = POI_ICON_3D[role] || '📍';
      const displayName = (name && name.trim()) ? name.trim() : '';
      const hasName = displayName.length > 0;

      let tex;
      try {
        tex = makePOITexture(icon, displayName);
      } catch (e) {
        skipped++;
        continue;
      }

      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        depthTest: false,   // vždy viditelný (jako Šimmy) — barák nezakryje ikonu
        fog: false,         // ikona není zahmlena — vždy plně viditelná
      });

      const sprite = new THREE.Sprite(mat);

      // Rozměry: šířka 14 m (s názvem) / 8 m (jen ikona) — čitelné z ~150 m
      const sw = hasName ? 14 : 8;
      const sh = hasName ? 7 : 8;
      sprite.scale.set(sw, sh, 1);

      const x = wx2m(wx);
      const z = wy2m(wy);
      // Y=2 m — nízko nad zemí; strmá GTA kamera + HUD pruh nahoře → vyšší Y
      // promítá ikonu k hornímu okraji/pod HUD. 2 m drží ikonu v čitelné části.
      sprite.position.set(x, 2, z);

      sprite.renderOrder = 10;  // po budovách, pod Šimmym (999)
      group.add(sprite);
      poiSprites.push({ sprite, wx, wy, hasName });
      count++;
    }

    console.log('[R3D] POI billboardy:', count, '| přeskočeno:', skipped);
    return group;
  }

  // Aktualizuj viditelnost názvů podle vzdálenosti hráče
  const POI_NAME_DIST = 60 * 3.6;  // 60 m v px (60 * PXM)
  function updatePOIVisibility() {
    const player = typeof window.player !== 'undefined' ? window.player : null;
    if (!player || poiSprites.length === 0) return;
    const px = player.wx, py = player.wy;
    for (const p of poiSprites) {
      if (!p.hasName) continue;  // bez názvu vždy stejné
      const dx = px - p.wx, dy = py - p.wy;
      const dist2 = dx * dx + dy * dy;
      const visible = dist2 < POI_NAME_DIST * POI_NAME_DIST;
      // blízko: plný billboard s názvem; daleko: jen ikonová část (canvas je stejný, jen scale)
      if (visible) {
        p.sprite.scale.set(14, 7, 1);
      } else {
        p.sprite.scale.set(8, 8, 1);  // čtvercový — ukáže jen horní část (ikona)
      }
    }
  }

  // ── Světla ───────────────────────────────────────────────
  function setupLights(scene) {
    // Slunce pod úhlem (GTA denní světlo)
    const sun = new THREE.DirectionalLight(0xfff8e0, 0.9);
    sun.position.set(0.6, 1.0, 0.4);  // směr ze SZ dolů
    sun.castShadow = false;             // bez realtime stínů (perf)
    scene.add(sun);

    // Obloha + odrazné světlo ze země (hemisphere)
    const hemi = new THREE.HemisphereLight(0xb0d8f0, 0x6f9b54, 0.55);
    scene.add(hemi);
  }

  // ── Mlha (omezená dohlednost pro perf) ──────────────────
  function setupFog(scene) {
    // Lineární mlha: začne ve 300 m, hustá ve 700 m
    scene.fog = new THREE.Fog(0xb8d4e8, 300, 700);
  }

  // ── INIT ─────────────────────────────────────────────────
  function init() {
    if (initialized) return;
    initialized = true;

    const canvas = document.getElementById('gameCanvas');

    // Renderer na hlavní canvas (WebGL)
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: false,  // vypnuto pro výkon na mobilu
      alpha: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    renderer.setClearColor(0xb8d4e8, 1);  // obloha

    // Scéna
    scene = new THREE.Scene();
    setupFog(scene);
    setupLights(scene);

    // Podlaha
    scene.add(buildFloor());

    // Detail země (silnice, zeleň, voda, koleje) — pod budovami
    const greenMesh = buildGreen();
    if (greenMesh) scene.add(greenMesh);

    const waterMesh = buildWater();
    if (waterMesh) scene.add(waterMesh);

    const railMesh = buildRail();
    if (railMesh) scene.add(railMesh);

    const roadsMesh = buildRoads();
    if (roadsMesh) scene.add(roadsMesh);

    // Budovy
    const cityMesh = buildCityMesh();
    if (cityMesh) scene.add(cityMesh);

    // POI billboardy (obchody/podniky)
    poiGroup = buildPOI();
    if (poiGroup) scene.add(poiGroup);

    // Šimmy billboard
    simmySprite = buildSimmySprite();
    simmySprite.position.set(
      wx2m(typeof SPAWN_PX !== 'undefined' ? SPAWN_PX[0] : 2012),
      1.6,  // polovina výšky spritu
      wy2m(typeof SPAWN_PX !== 'undefined' ? SPAWN_PX[1] : 2020)
    );
    scene.add(simmySprite);

    // Kamera — šikmá GTA
    camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.5, 800);
    _updateCamera();

    console.log('[R3D] inicializace hotova');
  }

  // ── Kamera: sleduje hráče ────────────────────────────────
  const CAM_OFFSET_X = 0;
  const CAM_OFFSET_Y = 55;   // výška nad hráčem
  const CAM_OFFSET_Z = 38;   // odstup za hráčem

  function _updateCamera() {
    if (!camera) return;
    const player = typeof window.player !== 'undefined' ? window.player : null;
    const px = player ? wx2m(player.wx) : wx2m(SPAWN_PX ? SPAWN_PX[0] : 2012);
    const pz = player ? wy2m(player.wy) : wy2m(SPAWN_PX ? SPAWN_PX[1] : 2020);

    camera.position.set(
      px + CAM_OFFSET_X,
      CAM_OFFSET_Y,
      pz + CAM_OFFSET_Z
    );
    camera.lookAt(px, 1.0, pz);  // koukej na hráče (mírně nad zemí)
  }

  // ── Render frame ─────────────────────────────────────────
  let _lastNow = 0;
  function renderFrame() {
    if (!initialized || !renderer) return;

    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    const dt = _lastNow ? Math.min(now - _lastNow, 0.1) : 0;
    _lastNow = now;

    const player = typeof window.player !== 'undefined' ? window.player : null;

    // Aktualizuj pozici Šimmyho + animaci chůze
    if (simmySprite && player) {
      simmySprite.position.set(wx2m(player.wx), 1.65, wy2m(player.wy));
      const moving = (player.vx * player.vx + player.vy * player.vy) > 0.02;
      animateWalk(moving, dt);
    }

    // Aktualizuj kameru
    _updateCamera();

    // Aktualizuj viditelnost POI názvů
    updatePOIVisibility();

    renderer.render(scene, camera);
  }

  // ── Resize ───────────────────────────────────────────────
  function resize() {
    if (!renderer || !camera) return;
    const canvas = document.getElementById('gameCanvas');
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // ── Export ───────────────────────────────────────────────
  window.R3D = {
    init, renderFrame, resize,
    debug: () => ({
      sprite: simmySprite ? [Math.round(simmySprite.position.x), Math.round(simmySprite.position.y), Math.round(simmySprite.position.z)] : null,
      tex: simmySprite && simmySprite.material.map ? (simmySprite.material.map.image ? 'loaded' : 'pending') : 'none',
      cam: camera ? [Math.round(camera.position.x), Math.round(camera.position.y), Math.round(camera.position.z)] : null,
      sceneKids: scene ? scene.children.length : 0,
      poiSprites: poiSprites.length,
      poiNear: (() => {
        const player = window.player; if (!player || !camera || !poiSprites.length) return null;
        let best = null, bd = 1e18;
        for (const p of poiSprites) { const dx = player.wx - p.wx, dy = player.wy - p.wy, d = dx*dx+dy*dy; if (d < bd) { bd = d; best = p; } }
        if (!best) return null;
        const v = best.sprite.position.clone().project(camera);   // NDC: x,y ∈[-1,1] = ve frame; z<1 = před kamerou
        const img = best.sprite.material.map && best.sprite.material.map.image;
        return { distM: Math.round(Math.sqrt(bd)/PXM), ndc: [v.x.toFixed(2), v.y.toFixed(2), v.z.toFixed(2)], tex: img ? (img.width+'x'+img.height) : 'no-img' };
      })(),
    }),
  };

})();
