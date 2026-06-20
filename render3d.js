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

  // ── Billboard Šimmy ─────────────────────────────────────
  function buildSimmySprite() {
    const loader = new THREE.TextureLoader();
    const tex = loader.load('assets/simmy_char.png',
      () => {},
      undefined,
      (err) => { console.warn('[R3D] simmy_char.png načítání selhalo:', err); }
    );
    // SpriteMaterial vždy čelí kameře — billboard zdarma
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,   // sprite nevyrezává z budov
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.8, 3.2, 1);  // cca 1.8 × 3.2 m (lidská postava)
    return sprite;
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

    // Budovy
    const cityMesh = buildCityMesh();
    if (cityMesh) scene.add(cityMesh);

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
  function renderFrame() {
    if (!initialized || !renderer) return;

    const player = typeof window.player !== 'undefined' ? window.player : null;

    // Aktualizuj pozici Šimmyho
    if (simmySprite && player) {
      simmySprite.position.set(
        wx2m(player.wx),
        1.6,
        wy2m(player.wy)
      );
    }

    // Aktualizuj kameru
    _updateCamera();

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
  window.R3D = { init, renderFrame, resize };

})();
