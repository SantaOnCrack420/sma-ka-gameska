# GTA 7: Těšín City — kontext pro Claude Code
> Čti celý před tím než cokoliv navrhneš nebo měníš.

## Co je hra
Top-down 3D GTA parodie zasazená do Těšína. Hráč je Šimmy (Simon), chodí po Těšíně,
naráží na NPC chodce i nepřátele, sbírá předměty. Čistě browserová hra — žádný backend.
**Live URL:** https://santaoncrack420.github.io/sma-ka-gameska/
**Repo:** github.com/SantaOnCrack420/sma-ka-gameska (branch: master, push přímo)

## Architektura — DVĚ VRSTVY

```
index.html
├── game.js      — 2D canvas herní logika (pohyb, kolize, physics, NPC AI, UI)
└── render3d.js  — Three.js r128 WebGL vrstva (3D vizuál přes canvas)
```

**Komunikace přes window globals:**
- `window.player` — game.js → render3d.js (pozice hráče)
- `window.npcs`   — game.js → render3d.js (pole NPC objektů)
- `window.R3D`    — render3d.js exportuje `{ init, renderFrame, resize }`

render3d.js `renderFrame()` se volá každý snímek z game.js game loop.

## Souřadnicový systém
- Mapa: pixelová mapa (worldmap), `wx`/`wy` = world pixel koordináty
- Three.js: metry, převod `wx2m(wx) = wx / PXM` kde `PXM = 3.6`
- Kamera: šikmá GTA perspektiva (PerspectiveCamera, fov=50, kouká dolů pod úhlem)

## Stack
- **Three.js r128 UMD** — globální `THREE`, načteno ze `assets/three.min.js`
- Žádný bundler, žádný npm — čisté vanilla JS soubory
- PWA: manifest + service worker pro offline

## Šimmy (hráč)
- Sprite: `assets/simmy_walk.png` (4 framy walk cyklus)
- Three.js Sprite billboard (vždy čelí kameře)
- `window.player = { wx, wy, vx, vy, ... }`
- `depthTest: true, alphaTest: 0.05, renderOrder: 100`

## NPC systém (KLÍČOVÉ — zde bylo nejvíc bugů)

### NPC_DEFS v render3d.js (index = typeIdx)
```javascript
const NPC_SH = 3.3;  // výška všech NPC v metrech (stejná jako Šimmy)
const NPC_DEFS = [
  // Civilians (indices 0–10)
  { src: 'assets/npc/man_phone.png',   frames: 1 },
  { src: 'assets/npc/tourist.png',     frames: 1 },
  { src: 'assets/npc/cop.png',         frames: 1 },
  { src: 'assets/npc/babka.png',       frames: 1 },
  { src: 'assets/npc/teenager.png',    frames: 1 },
  { src: 'assets/npc/mama.png',        frames: 1 },
  { src: 'assets/npc/delnik.png',      frames: 1 },
  { src: 'assets/npc/vendor.png',      frames: 1 },
  { src: 'assets/npc/dedek.png',       frames: 1 },
  { src: 'assets/npc/businessman.png', frames: 1 },
  { src: 'assets/npc/jogger_f.png',    frames: 1 },
  // Enemies (indices 11–14)
  { src: 'assets/enemy/opilec.png',    frames: 3 },
  { src: 'assets/enemy/vandal.png',    frames: 8 },
  { src: 'assets/enemy/somrak.png',    frames: 2 },
  { src: 'assets/enemy/gauner.png',    frames: 4 },
];
```

### game.js spawnNpc()
```javascript
const NPC_CIVILIAN_COUNT = 11;  // typeIdx 0-10
const NPC_ENEMY_COUNT    = 4;   // typeIdx 11-14
const ENEMY_NPC_CHANCE   = 0.25;
// NPC objekt: { wx, wy, vx, vy, dir, t, role, agro, hp, typeIdx, col }
```
Max 28 NPC aktivních najednou (`while (npcs.length < 28) spawnNpc()`).

### Sprite pool (render3d.js buildNpcPool)
- `MAX_NPC = 35` spritů předalokovaných
- `defIdx = i % NPC_DEFS.length` — každý sprite má pevný typ
- Per-sprite SpriteMaterial s **klonovanou texturou** pro nezávislou animaci
- Scale se přepočítá z aspect ratio po načtení textury (`updateSpriteScale`)

### renderFrame() NPC přiřazení
Klíčový pattern — NE pool-index mapping, ale **poolByType**:
```javascript
// Groupuj pool podle defIdx
const poolByType = {};
for (const sp of npcSpritePool) { ... }
// Schovej vše, pak přiřaď každý NPC ke spritu správného typeIdx
for (const n of npcs) {
  const candidates = poolByType[n.typeIdx];
  const sprite = candidates[typeUsedCount[n.typeIdx]++];
  sprite.position.set(wx2m(n.wx), NPC_SH / 2, wy2m(n.wy));
}
```

### Enemy agro systém (game.js)
```javascript
const AGRO_DIST = 130;   // px — vzdálenost aktivace
const AGRO_SPD  = 0.85;  // rychlost chasing
// enemy → chase hráče + zásah při d < 16px (lives--)
```

## Budovy + cesty (render3d.js)
- `buildCityMesh()` — ExtrudeGeometry z vektorů v `assets/mapvec.js`
  - Bug fix: `polygonOffset: true, polygonOffsetFactor: -2` (zelené artefakty rohů)
- `buildRoads()` — MeshGeometry ribbony + junction discy na křižovatkách
  - `buildDisc()` záplatuje mezery kde ribbony nesedí (intersection gaps)

## Transparentnost budov
- Šimmy má `depthTest: true` + `renderOrder: 100` — překreslí se přes budovy
- Buildings mají `polygonOffset` aby nesvítily přes cesty

## Světový obsah
- `assets/mapvec.js` — vektory budov + cest
- `assets/mappoi.js` — body zájmu (obchody, hospody...)
- `assets/mapdata.js` — bitmapa průchodnosti
- Props v `buildWorldProps()`: stromy, keře, lampy, lavičky ze `assets/props/`

## Soubory co NEMĚŇ bez důvodu
- `assets/mapvec.js` — generováno, změny = ruční práce
- `assets/mapdata.js` — bitmapa, měnit jen přes editor mapy

## Dostupné assety (assets/npc/, assets/enemy/, assets/props/)
⚠️ **POZOR: většina PNG je ROZBITÝ SLEPENEC** (cut_assets.py špatně nařezal source_sheets
→ víc postav/věcí + psi na jednom obrázku). NEpoužívej je bez vizuální kontroly!

**Ověřené ČISTÉ (jednotlivá postava) — používané v NPC_DEFS:**
- Civilové: man_phone, tourist, babka, teenager, mama, vendor (dělník v oranžové)
- Enemy (čisté vodorovné pásy fází, bereme 1. snímek): opilec (3f), somrak (4f), gauner (4f)
- Props: `strom_clean.png`, `ker_clean.png`, `lavicka_clean.png` (vyříznuté ze `strom.png`/`lampa.png`)

**ROZBITÉ — NEPOUŽÍVAT** (slepence): cop (=běžkyně+dítě), delnik (mrňavý blob),
dedek (svalovec+pes), businessman (uříznutá hlava), jogger_f (děti+trhovkyně),
vandal (hlava+plechovka+nohy+dědek), ker/lampa/lavicka/strom (víc věcí+psi).
TODO: pořádně přeřezat z source_sheets/ (sheet_*.png) opraveným cut_assets.py.

## Opakující se bugy — neřeš znova špatně
| Bug | Fix |
|---|---|
| NPC neviditelné | `window.npcs = npcs` po init + po reset v startGame() |
| NPC = "psi"/"davy"/řádky postaviček | ROZBITÉ PNG slepence — používej jen ověřené čisté assety (viz výše) |
| NPC se hýbe jako "tečky" daleko | spawn kolem hráče (`randWalkableNear`) + recyklace, ne přes celou mapu |
| NPC malinkaté | `NPC_SH / 2` jako Y pozice, scale z aspect ratio po načtení |
| `def.sh` neexistuje | Použij `NPC_SH` konstantu |
| `walkOffset` vs `walkPhase` | userData ukládá `walkPhase` |
| Zelené artefakty rohů | `polygonOffset: true, polygonOffsetFactor: -2` na building material |
| Mezery na křižovatkách | buildDisc() junction patches (implementováno) |
| jq + diakritika | Python pro JSON, ne jq |
| family.png / old_dog.png | Více figur na PNG = tiny sprite, nepoužívat v NPC_DEFS |

## Workflow
- Push přímo na master (David řekl "vyser se na feature branches")
- GitHub Pages auto-deploy z master větve
- Po každé změně: `git add game.js render3d.js && git commit && git push origin master`
