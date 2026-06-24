# GTA 7: Těšín City — kontext pro Claude Code
> Čti celý před tím než cokoliv navrhneš nebo měníš.

## Co je hra
Top-down 3D GTA parodie zasazená do Těšína. Hráč je Šimmy (Simon), chodí po Těšíně,
naráží na NPC chodce i nepřátele, sbírá předměty. Čistě browserová hra — žádný backend.
**Live URL:** https://santaoncrack420.github.io/sma-ka-gameska/
**Repo:** github.com/SantaOnCrack420/sma-ka-gameska (branch: master, push přímo)

---
## 📌 AKTUÁLNÍ STAV & SMĚR (handoff, naposled 2026-06-22)

**Dvě paralelní větve projektu — POZOR, nepleť si je:**

### A) Stávající hra (custom Three.js) — verze v73, FUNKČNÍ
`index.html` + `game.js` + `render3d.js`. Co je hotové po dnešní session:
- **Assety pročištěné**: většina původních PNG byl rozbitý slepenec (víc postav+psi na jednom obrázku, chyba cut_assets.py). Používají se JEN ověřené čisté (viz sekce Assety níž). Nové čisté props z Gemini v `assets/props/gen/` (tráva, keř, kytky, lampa, koš, popelnice, zastávka), originály v `source_props/`. Enemy ořezané na 1. snímek v `assets/enemy/gen/` (somrak, gauner; opilec+vandal vyřazené).
- **Budovy**: okna (fasádní canvas textura + UV), barvy z hashe (pestré).
- **Zem (BAKED_GROUND=true)**: tráva/zeleň/voda + POVRCH cest (asfalt+chodník) zapečené do 4096² canvas textury (kulaté spoje = dokonalé křižovatky, žádné blikání). Bílé čáry = tenká geometrie navrch (`buildRoadMarkings`). Props maska (`isOnRoad`/`isOnAsphalt`) drží props mimo cestu. iOS Safari limit canvasu = 4096².
- **NPC**: spawn kolem hráče + recyklace (ne přes celou mapu), čisté single-frame sprity, Šimmy silueta přes baráky.
- **Stíny**: directional + texel-snap (neskáčou), za přepínačem ENABLE_SHADOWS.
- COMBAT=false (klidná procházka).

### B) ✅ HLAVNÍ SMĚR: MapLibre (game-mode) — TEĎ HRATELNÝ SANDBOX (2026-06-24)
David ROZHODL: nový MapLibre engine (reálné rozložení Těšína: ulice/baráky) je základ, do něj se přenáší barvy + vychytávky/gameplay ze starého enginu. **NE oživovat starý custom engine.**
- **`index.html` = TEĎ MapLibre hratelná hra** (na hlavní live URL i v PWA). Odznak verze "MapLibre v74".
- **`index_classic.html` = starý custom Three.js engine** (game.js + render3d.js, v73, COMBAT=false) — zazálohovaný fallback, nedotčený.
- `test_maplibre_game.html` = původní zdroj nové hry (= kopie index.html; může drift­ovat, edituj `index.html`).
- `test_maplibre.html` = čisté demo enginu (náklon/otáčení).

Co je v MapLibre hře (`index.html`) hotové:
  - Ovladatelný Šimmy (joystick vlevo dole / WASD), honící kamera (`jumpTo` každý frame), pohyb relativní ke kameře, **👁 oko = drž a táhni = otoč pohled**.
  - **Gameplay**: 🍟 tlačítko (drž = pal hranolky, auto-aim na nejbližší NPC do 80 m) + 🧀 smažák speciál (5 s CD, AoE 14 m). Skóre + 3 životy. Civil hp 1 (schytá hranolku → panikaří/utíká), enemy hp 3 (honí hráče, ubírá život). NPC se po srážce recyklují.
  - **FX overlay** (`#fx` canvas): NPC sprity, hranolky/smažák (emoji), splat particly — vše umístěné přes `map.project([lng,lat])`. Měřítko spritu dle vzdálenosti (`spriteScale`). Vše ve světě v lng/lat, převody přes `MLAT`/`mlng`/`moveGeo`/`distM`.
  - **Stylizace**: teplé 3D budovy (gradient dle výšky), obloha, pestřejší zem/zeleň/voda (projde vrstvy stylu a přebarví dle ID).
  - Sprity NPC: civilové `assets/npc/{man_phone,tourist,babka,teenager,mama,vendor}.png`, enemy `assets/enemy/gen/{somrak,gauner}.png`. Šimmy 38px, zoom 18.7, pitch 62.
  - **TODO dál**: menu/hudba/žebříček/nick (přenést ze starého enginu), okna na barácích, POI cedule obchodů, sběr párna/perky, lepší sprity projektilů místo emoji.
- **Snadné na MapLibre**: barevné domy, obloha, props/cedule na reálné POI pozice, popisky zdarma, otáčení kamery.
- **Těžké na MapLibre (později)**: okna na domech (chce vlastní shader/Three vrstvu), stíny budov (GL JS neumí nativně).

### CO DÁL (až bude čas)
1. **Billboard vrstva** v MapLibre (Three.js jako Threebox) — Šimmy/NPC/props jako sprity ve 3D, ne placaté markery.
2. **Umístit cedule obchodů na reálné POI** + mobiliář scatter podél cest.
3. **Port gameplaye** z game.js (házení smažáků/hranolků, NPC, skóre, kolize) na zeměpisné souřadnice.
4. **David generuje props** (recept: 512×512, purpurové #FF00FF pozadí, jeden objekt, kreslený styl): kašna, Alza Box, auta, hydrant, semafor, kebab, Kaufland/Lidl/Tesco/Shell cedule… (REÁLNÉ názvy — David je chce, ne parodie). Workflow: David pošle PNG → vyklíčovat purpurovou (největší komponenta, odmaž ✦ vodoznak) → ořez → `assets/props/gen/`.

**Headless ověření** (funguje na geometrii + canvas textury, NE na velké sprite PNG ani MapLibre dlaždice): Windows Chrome přes `file:///C:/temp/...` (viz commity). MapLibre/sprity testuje David na telefonu.
---

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
