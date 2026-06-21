/* =========================================================
   GTA 7: TĚŠÍN CITY — Smažák s Hranolkama DLC
   Čistý přepis v2 — funkční základ: menu, pohyb, střílení, postava
   ========================================================= */
'use strict';

// ---------- Canvas ----------
// gameCanvas = WebGL 3D renderer (spodní)
// menuCanvas = 2D overlay pro menu/gameover (horní, pointer-events:none)
const canvas = document.getElementById('gameCanvas');
const menuCanvas = document.getElementById('menuCanvas');
const ctx = menuCanvas.getContext('2d');   // 2D kontext JEN na overlay — žádný konflikt s WebGL
// VW/VH = logické rozměry (CSS px). Backing store škálujeme podle DPR = ostrá retina grafika.
let VW = window.innerWidth, VH = window.innerHeight;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);   // strop DPR 2 = méně sekání
  // čteme SKUTEČNOU velikost canvasu (CSS 100%) — spolehlivé i po otočení na iOS
  VW = canvas.clientWidth  || window.innerWidth;
  VH = canvas.clientHeight || window.innerHeight;
  // gameCanvas: Three.js nastaví canvas.width/height sám přes setSize — nenastavuj ručně!
  // Menu overlay (menuCanvas) — DPR škálování pro ostré 2D text/grafiku
  menuCanvas.width  = Math.round(VW * dpr);
  menuCanvas.height = Math.round(VH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  // Informuj R3D o novém rozměru (pokud je inicializováno)
  if (typeof R3D !== 'undefined' && R3D.resize) R3D.resize();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => { resize(); setTimeout(resize, 250); setTimeout(resize, 600); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

// ---------- Assets ----------
const charImg = new Image(); charImg.src = 'assets/simmy_char.png';
const menuBg  = new Image(); menuBg.src  = 'assets/menu_bg.png';
let charReady = false; charImg.onload = () => charReady = true;
let menuReady = false; menuBg.onload  = () => menuReady = true;
// mapa se kreslí vektorově (mapvec.js) — žádný velký obrázek

// ---------- Nastavení zvuku (perzistované) ----------
let musicOn  = localStorage.getItem('smazak_musicOn') !== '0';
let sfxOn    = localStorage.getItem('smazak_sfxOn')   !== '0';
let musicVol = (+(localStorage.getItem('smazak_musicVol') ?? 100)) / 100;
let sfxVol   = (+(localStorage.getItem('smazak_sfxVol')   ?? 80))  / 100;
let muted    = false;   // rychlý master mute (tlačítko 🔊)
function saveAudioPrefs() {
  localStorage.setItem('smazak_musicOn', musicOn ? '1' : '0');
  localStorage.setItem('smazak_sfxOn',   sfxOn   ? '1' : '0');
  localStorage.setItem('smazak_musicVol', Math.round(musicVol * 100));
  localStorage.setItem('smazak_sfxVol',   Math.round(sfxVol * 100));
}

// ---------- Hudba (HTMLAudio element) ----------
const music = new Audio('assets/music.mp3');
music.loop = true;
let musicStarted = false;
function startMusic() {
  if (musicStarted || muted || !musicOn) return;
  music.play().then(() => { musicStarted = true; setMusicVol(); }).catch(() => {});
}
function setMusicVol() {
  const base = (state === 'PLAYING') ? 0.5 : 1.0;   // ve hře ztlumeno pod SFX
  const v = (muted || !musicOn) ? 0 : base * musicVol;
  if (musicGain) musicGain.gain.value = v;   // iOS: hlasitost přes GainNode
  else music.volume = v;                     // fallback (desktop)
}

// ---------- SFX + hudba přes Web Audio API (iOS umí hlasitost jen takhle) ----------
let actx = null, musicGain = null;
const SFXBUF = {};
const SFX_NAMES = ['click','shoot','hit','kill','pickup','hurt','boom','boss','wave','gameover'];
function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); startMusic(); return; }
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return; }
  // hudbu pusť přes GainNode → reálné ovládání hlasitosti i na iPhonu
  try {
    const srcNode = actx.createMediaElementSource(music);
    musicGain = actx.createGain();
    srcNode.connect(musicGain); musicGain.connect(actx.destination);
  } catch (_) {}
  SFX_NAMES.forEach(n =>
    fetch('assets/sfx/' + n + '.wav')
      .then(r => r.arrayBuffer())
      .then(b => actx.decodeAudioData(b))
      .then(buf => { SFXBUF[n] = buf; })
      .catch(() => {}));
  startMusic();
  setMusicVol();
}
function sfx(name, vol = 1) {
  if (muted || !sfxOn || !actx) return;
  const buf = SFXBUF[name]; if (!buf) return;
  const src = actx.createBufferSource(); src.buffer = buf;
  src.playbackRate.value = 0.92 + Math.random() * 0.16;   // náhodný pitch ±8 %
  const g = actx.createGain(); g.gain.value = vol * sfxVol;
  src.connect(g); g.connect(actx.destination);
  src.start();
}
// odemkni audio při prvním dotyku/kliku/klávese (autoplay policy)
['touchstart', 'mousedown', 'keydown'].forEach(ev =>
  window.addEventListener(ev, initAudio));

// ---------- Nick + leaderboard ----------
let nick = localStorage.getItem('smazak_nick') || '';
let nickMenuBtn = null;
const nickEl    = document.getElementById('nick');
const nickInput = document.getElementById('nickInput');
const nickBtn   = document.getElementById('nickBtn');
const nickErr   = document.getElementById('nickErr');
function showNick() { nickInput.value = nick; nickErr.textContent = ''; nickEl.style.display = 'flex'; setTimeout(() => nickInput.focus(), 50); }
function hideNick() { nickEl.style.display = 'none'; }
function submitNick() {
  const v = nickInput.value.trim().replace(/\s+/g, '_').slice(0, 12);
  if (v.length < 4) { nickErr.textContent = 'Aspoň 4 znaky, bracho.'; return; }
  nick = v; localStorage.setItem('smazak_nick', v); hideNick(); startMusic();
}
nickBtn.addEventListener('click', submitNick);
nickInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitNick(); });

// Globální leaderboard přes Firebase Realtime Database (REST).
const DB_URL = 'https://smazkaxdddd-default-rtdb.europe-west1.firebasedatabase.app';
function loadLocalLB() { try { return JSON.parse(localStorage.getItem('smazak_lb') || '[]'); } catch (_) { return []; } }
let lbCache = loadLocalLB();           // co se kreslí (sync cache)
function loadLB() { return lbCache; }
function refreshLB() {                  // stáhni globální žebříček do cache
  fetch(DB_URL + '/scores.json')
    .then(r => r.json())
    .then(data => {
      const arr = data
        ? Object.values(data).filter(e => e && typeof e.score === 'number')
            .map(e => ({ name: String(e.name || '?').slice(0, 12), score: e.score }))
        : [];
      arr.sort((a, b) => b.score - a.score);
      lbCache = arr.slice(0, 50);
      localStorage.setItem('smazak_lb', JSON.stringify(lbCache.slice(0, 20)));  // offline záloha
      if (leaderboardEl && leaderboardEl.style.display === 'flex') renderLbList();
    })
    .catch(() => {});
}
function submitScore(name, sc) {
  // lokálně hned (vidíš i offline)
  const local = loadLocalLB();
  local.push({ name, score: sc });
  local.sort((a, b) => b.score - a.score);
  localStorage.setItem('smazak_lb', JSON.stringify(local.slice(0, 20)));
  lbCache = local.slice(0, 50);
  // do cloudu
  fetch(DB_URL + '/scores.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, score: sc, ts: Date.now() }),
  }).then(() => setTimeout(refreshLB, 600)).catch(() => {});
}

// ---------- Nastavení (overlay) ----------
const settingsEl    = document.getElementById('settings');
const leaderboardEl = document.getElementById('leaderboard');
const musicOnCb     = document.getElementById('musicOnCb');
const sfxOnCb       = document.getElementById('sfxOnCb');
const musicVolSl    = document.getElementById('musicVolSl');
const sfxVolSl      = document.getElementById('sfxVolSl');
const lbListEl      = document.getElementById('lbList');
const settingsClose = document.getElementById('settingsClose');
const lbClose       = document.getElementById('lbClose');
let settingsBtn = null, lbBtn = null;   // karty v menu (canvas)
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function renderLbList() {
  const lb = loadLB().slice(0, 10);
  lbListEl.innerHTML = lb.length
    ? lb.map(e => `<li>${escapeHtml(e.name)} — ${e.score}</li>`).join('')
    : '<li class="empty">Zatím nikdo. Buď první! 🍟</li>';
}
function openSettings() {            // jen zvuky
  musicOnCb.checked = musicOn; sfxOnCb.checked = sfxOn;
  musicVolSl.value = Math.round(musicVol * 100);
  sfxVolSl.value = Math.round(sfxVol * 100);
  settingsEl.style.display = 'flex';
}
function openLeaderboard() {         // jen skóre
  renderLbList(); refreshLB();
  leaderboardEl.style.display = 'flex';
}
musicOnCb.addEventListener('change', () => { musicOn = musicOnCb.checked; if (musicOn) startMusic(); setMusicVol(); saveAudioPrefs(); });
sfxOnCb.addEventListener('change',   () => { sfxOn = sfxOnCb.checked; saveAudioPrefs(); if (sfxOn) sfx('click'); });
musicVolSl.addEventListener('input', () => { musicVol = musicVolSl.value / 100; setMusicVol(); saveAudioPrefs(); });
sfxVolSl.addEventListener('input',   () => { sfxVol = sfxVolSl.value / 100; saveAudioPrefs(); });
sfxVolSl.addEventListener('change',  () => sfx('click'));
settingsClose.addEventListener('click', () => { settingsEl.style.display = 'none'; });
lbClose.addEventListener('click', () => { leaderboardEl.style.display = 'none'; });

// ---------- HUD ----------
const ui = document.getElementById('ui');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
function showHud(on) { if (ui) ui.style.display = on ? 'flex' : 'none'; }

// ---------- Svět (reálný Český Těšín — obrázek + kolize z OSM) ----------
const WPX = MAP_IMG_W, WPY = MAP_IMG_H;   // svět = pixely mapy
const ZOOM = 2.1;                          // přiblížení (mapa je teď ve velkém měřítku 3,6 px/m)
const COMBAT = false;                      // M1 = klidná procházka 3D Těšínem (boj se vrátí v kroku 2 s 3D nepřáteli)
const SPAWN_WX = SPAWN_PX[0];
const SPAWN_WY = SPAWN_PX[1];

let PROPS = [];               // dekorace přijdou později
let COL = null;               // kolizní mřížka (1 = zeď)

// dekóduj kolize z RLE (Z = zeď, O = pochozí, + počet)
function buildMap() {
  COL = new Uint8Array(COL_W * COL_H);
  let i = 0, idx = 0; const s = COL_RLE, n = s.length;
  while (i < n) {
    const v = s.charCodeAt(i) === 90 ? 1 : 0; i++;   // 'Z'=90
    let num = 0;
    while (i < n && s.charCodeAt(i) >= 48 && s.charCodeAt(i) <= 57) { num = num*10 + (s.charCodeAt(i)-48); i++; }
    for (let k = 0; k < num && idx < COL.length; k++) COL[idx++] = v;
  }
}

// ---------- Hráč ----------
const player = {
  wx: SPAWN_WX,
  wy: SPAWN_WY,
  vx: 0, vy: 0,
  speed: 1.05,
  angle: 0,
};
// Vystav hráče 3D enginu (render3d.js čte window.player). `const` se sám na window
// nenapojí, takže explicitně — bez toho kamera/sprite hráče nesledují.
window.player = player;

const cam = { x: player.wx, y: player.wy };
let facing = 1;   // 1 = doprava, -1 = doleva

const clamp = (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v);
// kamera se drží v hranicích mapy (na kraji se zastaví), ale když je
// obrazovka větší než svět, vystředí se.
function updateCam() {
  const hw = VW/(2*ZOOM), hh = VH/(2*ZOOM);   // půl-výřezu ve světových px (kvůli zoomu)
  cam.x = WPX > 2*hw ? clamp(player.wx, hw, WPX - hw) : WPX/2;
  cam.y = WPY > 2*hh ? clamp(player.wy, hh, WPY - hh) : WPY/2;
}
// svět → obrazovka (se zoomem)
function wts(wx, wy) { return [VW/2 + (wx - cam.x)*ZOOM, VH/2 + (wy - cam.y)*ZOOM]; }
function wdist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
// kolize z mřížky; mimo mapu = zeď
function isSolidAt(wx, wy) {
  const gx = Math.floor(wx / COL_CELL), gy = Math.floor(wy / COL_CELL);
  if (gx < 0 || gx >= COL_W || gy < 0 || gy >= COL_H) return true;
  return COL[gy * COL_W + gx] === 1;
}

// ---------- Vstup ----------
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  if ((e.key === 'Enter' || e.key === ' ') && state !== 'PLAYING') startOrClick();
  if ((e.key === 'f' || e.key === 'F' || e.key === 'e' || e.key === 'E') && state === 'PLAYING') throwSmazak();
  if (e.key === 'm' || e.key === 'M') toggleMute();
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

const inRect = (x, y, r) => r && x >= r.x && x <= r.x+r.w && y >= r.y && y <= r.y+r.h;
// pohyb = levý joystick; střelba = tlačítko HOĎ (drž, auto-aim); smažák = tlačítko
const moveJoy = { active: false, id: -1, bx: 0, by: 0, dx: 0, dy: 0 };
window.moveJoy = moveJoy;   // pro autotest simulaci pohybu (headless)
let aimAngle = 0;

function menuButtonsHit(x, y) {
  if (nickMenuBtn && inRect(x, y, nickMenuBtn)) { showNick(); return true; }
  if (lbBtn && inRect(x, y, lbBtn)) { openLeaderboard(); return true; }
  if (settingsBtn && inRect(x, y, settingsBtn)) { openSettings(); return true; }
  return false;
}
function touchStart(x, y, id) {
  if (muteBtn && Math.hypot(x - muteBtn.x, y - muteBtn.y) < muteBtn.r + 8) { toggleMute(); return; }
  if (state === 'MENU') { if (!menuButtonsHit(x, y)) startOrClick(); return; }
  if (state !== 'PLAYING') { startOrClick(); return; }
  if (smazakBtn && Math.hypot(x - smazakBtn.x, y - smazakBtn.y) < smazakBtn.r + 8) { throwSmazak(); return; }
  if (fryBtn && Math.hypot(x - fryBtn.x, y - fryBtn.y) < fryBtn.r + 10) { firing = true; fireTouch = id; shootCd = 0; return; }
  if (!moveJoy.active) { moveJoy.active = true; moveJoy.id = id; moveJoy.bx = x; moveJoy.by = y; moveJoy.dx = 0; moveJoy.dy = 0; }
}
function touchMove(x, y, id) {
  if (moveJoy.active && moveJoy.id === id) {
    let dx = x - moveJoy.bx, dy = y - moveJoy.by; const max = 55, l = Math.hypot(dx, dy);
    if (l > max) { dx = dx/l*max; dy = dy/l*max; }
    moveJoy.dx = dx; moveJoy.dy = dy;
  }
}
function touchEnd(id) {
  if (moveJoy.id === id) { moveJoy.active = false; moveJoy.id = -1; moveJoy.dx = 0; moveJoy.dy = 0; }
  if (fireTouch === id) { firing = false; fireTouch = -1; }
}
// Přepočet client (viewport) → logické souřadnice plátna (VW/VH).
// Řeší iOS 100vh ≠ viditelná plocha, notch, škálování — dotyk pak sedí na kreslení.
function toLocal(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const sx = r.width  ? VW / r.width  : 1;
  const sy = r.height ? VH / r.height : 1;
  return [ (clientX - r.left) * sx, (clientY - r.top) * sy ];
}
canvas.addEventListener('touchstart', e => { e.preventDefault(); for (const t of e.changedTouches) { const [x,y]=toLocal(t.clientX,t.clientY); touchStart(x, y, t.identifier); } }, {passive:false});
canvas.addEventListener('touchmove',  e => { e.preventDefault(); for (const t of e.changedTouches) { const [x,y]=toLocal(t.clientX,t.clientY); touchMove(x, y, t.identifier); } }, {passive:false});
canvas.addEventListener('touchend',   e => { e.preventDefault(); for (const t of e.changedTouches) touchEnd(t.identifier); }, {passive:false});
canvas.addEventListener('mousedown', e => {
  const [x, y] = toLocal(e.clientX, e.clientY);
  if (muteBtn && Math.hypot(x - muteBtn.x, y - muteBtn.y) < muteBtn.r + 8) { toggleMute(); return; }
  if (state === 'MENU') { if (!menuButtonsHit(x, y)) startOrClick(); return; }
  if (state !== 'PLAYING') { startOrClick(); return; }
  if (smazakBtn && Math.hypot(x - smazakBtn.x, y - smazakBtn.y) < smazakBtn.r + 8) { throwSmazak(); return; }
  firing = true;   // PC: drž myš = střílej (auto-aim)
});
window.addEventListener('mouseup', () => { firing = false; });

// ---------- Herní stav ----------

let state = 'MENU';
let menuBtn = null;
let score = 0, lives = 3;
let best = +(localStorage.getItem('smazak_best') || 0);
function saveBest() { if (score > best) { best = score; localStorage.setItem('smazak_best', best); } }
let fries = [], pigeons = [], particles = [], npcs = [], cogani = [], bags = [], smazaks = [];
window.npcs = npcs;   // render3d.js čte window.npcs pro pozice NPC spritů
let shootCd = 0, pigKills = 0, coganKills = 0, bagsGot = 0;
let hurtCd = 0;          // nezranitelnost po zásahu
let popups = [];         // krátké hlášky na obrazovce

// vlny + boss
let wave = 0, waveState = 'BREAK', breakT = 0;
let boss = null, dog = null;
let bannerText = '', bannerT = 0;
let perkTriple = false, perkRapid = false;
let smazakCd = 0;
let smazakBtn = null;
let fryBtn = null;
let firing = false, fireTouch = -1;
let muteBtn = null;
function toggleMute() { muted = !muted; if (!muted) startMusic(); setMusicVol(); }

// menu tlačítko: klikací efekt
let menuPress = 0, pendingStart = false;
function tryFullscreen() {
  // jen schová lištu na Androidu/PC; orientaci NEvynucujeme (hraje na výšku i na šířku)
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch (_) {}
}
function startOrClick() {
  if (!nick) { showNick(); return; }
  tryFullscreen();   // Android/PC celá obrazovka; iOS to ignoruje (tam PWA)
  if (state === 'MENU') { if (!pendingStart) { menuPress = 10; pendingStart = true; sfx('click'); } }
  else startGame();
}

// juice: screen shake (trauma) + hitstop
let trauma = 0, hitstop = 0;
function addShake(a) { trauma = Math.min(1, trauma + a); }
function freeze(f) { hitstop = Math.max(hitstop, f); }

// barvy triček chodců
const NPC_COLORS = ['#c0392b','#2980b9','#27ae60','#8e44ad','#d35400','#16a085'];

function startGame() {
  state = 'PLAYING';
  score = 0; lives = 3; pigKills = 0; coganKills = 0; bagsGot = 0; hurtCd = 0;
  fries = []; pigeons = []; particles = []; npcs = []; cogani = []; bags = []; smazaks = []; popups = [];
  window.npcs = npcs;   // nový array po resetu — aktualizuj window referenci
  wave = 0; waveState = 'BREAK'; breakT = 90; boss = null; dog = null;
  bannerText = ''; bannerT = 0; perkTriple = false; perkRapid = false; smazakCd = 0;
  firing = false; fireTouch = -1;
  player.wx = SPAWN_WX; player.wy = SPAWN_WY;
  player.vx = 0; player.vy = 0; player.boostT = 0;
  updateCam();
  if (COMBAT) { for (let i = 0; i < 5; i++) spawnBag(); }
  for (let i = 0; i < 20; i++) spawnNpc();   // chodci po ulicích
  showHud(true);
  updateHud();
  setMusicVol();   // ztlum hudbu na 50 %
}
function banner(text, t) { bannerText = text; bannerT = t; }
const DEATH_MSGS = [
  'Zabili tě cigáni, okradli tě o všechno párno a tvou mrtvolu hodili do Olzy.',
  'Prodali tě Vietnamcům jako maso na kung-pao za pár gramů trávy. Aspoň k něčemu jsi byl dobrej.',
  'Peco tě sejmul mačetou a jeho pes tě snědl. Konec smažáka.',
  'Pobodali tě. Teď ležíš pochcanej v kaluži krve a párno je fuč.',
  'Pohozeného v křoví tě našli ožralí a nadržení bezdomovci… poslední chvíle sis „užil".',
];
const rnd = a => a[(Math.random()*a.length)|0];
const HIT_TAUNTS  = ['Rozmrdám ti xicht debile!', 'Neutíkej ty sračko!', 'Ukradnu ti všechno parno!', 'Postava jak rotoped more!'];
const PARNO_LINES = ['Hurá, našel jsem futro!', 'Tyvole free fuňko jen tak!', 'Mňam, to si zas zacpu rypák!'];
const WAVE_LINES  = ['Bacha, agresivní Morgoši na obzoru!', 'Ara, čmoudi útočí!', 'Temnota se blíží…', 'Schovejte všechno železo!'];
let deathMsg = '';
function gameOver() {
  state = 'OVER'; showHud(false);
  deathMsg = DEATH_MSGS[(Math.random()*DEATH_MSGS.length)|0];
  saveBest();
  submitScore(nick || '?', score);
  sfx('gameover', 0.7);
  setMusicVol();   // zpět na 100 %
}
function updateHud() {
  scoreEl.textContent = `SKÓRE: ${score}`;
  livesEl.textContent = '❤️'.repeat(Math.max(0, lives));
}
function popup(text) { popups.push({ text, t: 150 }); }

// ---------- Spawnery ----------
function randWalkable(minDistFromPlayer) {
  for (let tries = 0; tries < 30; tries++) {
    const wx = Math.random()*WPX, wy = Math.random()*WPY;
    if (isSolidAt(wx, wy)) continue;
    if (minDistFromPlayer && wdist(wx, wy, player.wx, player.wy) < minDistFromPlayer) continue;
    return { wx, wy };
  }
  return null;
}
function spawnPigeon() {
  const p = randWalkable(160); if (p) pigeons.push({ wx: p.wx, wy: p.wy, t: Math.random()*100, hp: 1 });
}
const ENEMY_NPC_CHANCE = 0.25;
const NPC_CIVILIAN_COUNT = 11;   // indexy 0-10 v render3d NPC_DEFS (civils)
const NPC_ENEMY_COUNT    = 4;    // indexy 11-14 v render3d NPC_DEFS (enemy walk)
function spawnNpc() {
  const p = randWalkable(120);
  if (!p) return;
  const isEnemy = Math.random() < ENEMY_NPC_CHANCE;
  const typeIdx = isEnemy
    ? NPC_CIVILIAN_COUNT + Math.floor(Math.random() * NPC_ENEMY_COUNT)
    : Math.floor(Math.random() * NPC_CIVILIAN_COUNT);
  npcs.push({
    wx: p.wx, wy: p.wy, t: Math.random()*100,
    col: NPC_COLORS[(Math.random()*NPC_COLORS.length)|0],
    dir: Math.random()*Math.PI*2,
    vx: 0, vy: 0,
    role: isEnemy ? 'enemy' : 'npc',
    agro: false,
    hp: isEnemy ? 2 : 0,
    typeIdx,
  });
}
function spawnCoganRing(hp = 2) {
  // spawn v prstenci kolem hráče (na pochozím místě)
  for (let tries = 0; tries < 12; tries++) {
    const ang = Math.random()*Math.PI*2;
    const dist = 220 + Math.random()*120;
    const wx = player.wx + Math.cos(ang)*dist;
    const wy = player.wy + Math.sin(ang)*dist;
    if (isSolidAt(wx, wy)) continue;
    cogani.push({ wx, wy, t: Math.random()*100, hp, hit: 0 });
    return;
  }
  // nouzově blízko hráče
  cogani.push({ wx: player.wx + 200, wy: player.wy, t: 0, hp, hit: 0 });
}

// ---------- Vlny ----------
function startNextWave() {
  wave++;
  if (wave % 3 === 0) {
    spawnBossWave();
  } else {
    const n = 3 + wave*2;
    for (let i = 0; i < n; i++) spawnCoganRing();
    banner(rnd(WAVE_LINES) + '  (vlna ' + wave + ')', 120); sfx('wave', 0.6);
  }
  waveState = 'FIGHT';
}
function spawnBossWave() {
  const ang = Math.random()*Math.PI*2, dist = 560;
  boss = {
    wx: player.wx + Math.cos(ang)*dist,
    wy: player.wy + Math.sin(ang)*dist,
    t: 0, hp: 28 + wave*4, maxhp: 28 + wave*4, hit: 0,
  };
  dog = { wx: boss.wx + 50, wy: boss.wy, t: 0, hp: 3, hit: 0 };
  for (let i = 0; i < 3; i++) spawnCoganRing();
  banner('☠ PECO ÚTOČÍ S MAČETOU — BACHA, BOSS FIGHT! xd', 200); sfx('boss', 0.8);
}
function onWaveCleared() {
  waveState = 'BREAK'; breakT = 200;
  let bonus;
  if (!perkTriple)      { perkTriple = true; bonus = '🍟 TROJITÁ STŘELBA HRANOLEK!'; }
  else if (!perkRapid)  { perkRapid = true;  bonus = '⚡ RYCHLOPALBA!'; }
  else                  { lives = Math.min(6, lives+1); updateHud(); bonus = '+1 ❤️'; }
  popup('✅ VLNA ' + wave + ' HOTOVA!'); sfx('pickup', 0.5);
  popup(bonus);
}
function spawnBag() {
  const p = randWalkable(120); if (p) bags.push({ wx: p.wx, wy: p.wy, t: Math.random()*100 });
}

// ---------- Hranolky ----------
function shoot() {
  if (shootCd > 0) return;
  // auto-aim na nejbližšího nepřítele (cigán/boss/pes), jinak holub, jinak kam koukáš
  let best = null, bd = 1e9;
  const enemies = cogani.slice();
  if (boss) enemies.push(boss);
  if (dog) enemies.push(dog);
  for (const c of enemies) {
    const d = wdist(player.wx, player.wy, c.wx, c.wy);
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) for (const p of pigeons) {
    const d = wdist(player.wx, player.wy, p.wx, p.wy);
    if (d < bd) { bd = d; best = p; }
  }
  let ang = facing > 0 ? 0 : Math.PI;
  if (best) ang = Math.atan2(best.wy - player.wy, best.wx - player.wx);
  const sp = 6;
  const angles = perkTriple ? [ang - 0.22, ang, ang + 0.22] : [ang];
  for (const a of angles)
    fries.push({ wx: player.wx, wy: player.wy, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp, life: 80 });
  shootCd = perkRapid ? 9 : 16;
  sfx('shoot', 0.22);
}

// ---------- Smažák (plošný speciál) ----------
function throwSmazak() {
  if (smazakCd > 0 || state !== 'PLAYING') return;
  // letí směrem k nejbližšímu nepříteli, nebo kam kouká
  let tx = null, ty = null, bd = 1e9;
  const cand = boss ? cogani.concat([boss]) : cogani;
  for (const c of cand) {
    const d = wdist(player.wx, player.wy, c.wx, c.wy);
    if (d < bd) { bd = d; tx = c.wx; ty = c.wy; }
  }
  let ang = player.angle - Math.PI/2;
  if (tx !== null) {
    let dx = tx - player.wx, dy = ty - player.wy;
    ang = Math.atan2(dy, dx);
  }
  smazaks.push({ wx: player.wx, wy: player.wy, vx: Math.cos(ang)*6, vy: Math.sin(ang)*6, life: 55, t: 0 });
  smazakCd = 300;   // ~5 s
}
function smazakBoom(wx, wy) {
  addShake(0.55); freeze(4); sfx('boom', 0.7);
  boom(wx, wy, '#e8a020', 26);
  boom(wx, wy, '#f4c430', 18);
  const R = 42;
  for (const c of cogani) if (c.hp > 0 && wdist(wx, wy, c.wx, c.wy) < R) { c.hp = 0; score += 25; coganKills++; }
  if (boss && wdist(wx, wy, boss.wx, boss.wy) < R) { boss.hp -= 8; boss.hit = 10; }
  if (dog && wdist(wx, wy, dog.wx, dog.wy) < R) { dog.hp -= 3; dog.hit = 10; }
  updateHud();
}
function boom(wx, wy, col, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random()*Math.PI*2, s = 1 + Math.random()*3;
    particles.push({ wx, wy, vx: Math.cos(a)*s, vy: Math.sin(a)*s, life: 24, col });
  }
}

// ---------- Update ----------
function update() {
  if (trauma > 0) trauma *= 0.90;   // doznívání otřesu
  if (state !== 'PLAYING') return;

  // --- pohyb (levý joystick / WASD) ---
  let mdx = 0, mdy = 0;
  const JOY_MAX = 55;   // maximální výchylka joysticku (px)
  if (moveJoy.active && (moveJoy.dx || moveJoy.dy)) {
    // ANALOG: rychlost úměrná výchylce palce (ne vždy plný plyn)
    const jl = Math.hypot(moveJoy.dx, moveJoy.dy);
    const analog = Math.min(jl / JOY_MAX, 1.0);  // 0–1 dle výchylky
    mdx = (moveJoy.dx / (jl || 1)) * analog;
    mdy = (moveJoy.dy / (jl || 1)) * analog;
  } else {
    if (keys['ArrowLeft']  || keys['a'] || keys['A']) mdx -= 1;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) mdx += 1;
    if (keys['ArrowUp']    || keys['w'] || keys['W']) mdy -= 1;
    if (keys['ArrowDown']  || keys['s'] || keys['S']) mdy += 1;
    const kl = Math.hypot(mdx, mdy) || 1;
    if (mdx || mdy) { mdx /= kl; mdy /= kl; }  // normalizace klávesnice
  }
  if (player.boostT > 0) player.boostT--;
  const spd = player.speed * (player.boostT > 0 ? 2 : 1);   // párno = 200 %
  if (mdx || mdy) {
    player.vx = mdx * spd;
    player.vy = mdy * spd;
    if (mdx > 0.05) facing = 1; else if (mdx < -0.05) facing = -1;
  } else {
    // TVRDÉ zastavení — žádný drift (*0.7 bylo klouzání)
    player.vx = 0;
    player.vy = 0;
  }

  // Kolize s poloměrem hráče (ne bodová) — testuj 4 body kolem hráče
  const PR = 10;   // poloměr hráče v svět-px
  let nx = player.wx + player.vx;
  // Test předního boku (kolmo na pohyb)
  const solidX =
    isSolidAt(nx + PR, player.wy) ||
    isSolidAt(nx - PR, player.wy) ||
    isSolidAt(nx, player.wy + PR) ||
    isSolidAt(nx, player.wy - PR);
  if (!solidX) player.wx = nx;

  let ny = player.wy + player.vy;
  const solidY =
    isSolidAt(player.wx + PR, ny) ||
    isSolidAt(player.wx - PR, ny) ||
    isSolidAt(player.wx, ny + PR) ||
    isSolidAt(player.wx, ny - PR);
  if (!solidY) player.wy = ny;

  updateCam();

  // --- střelba: drž HOĎ tlačítko / myš / mezerník (auto-aim) ---
  if (shootCd > 0) shootCd--;
  if ((firing || keys[' ']) && shootCd === 0) shoot();

  for (const f of fries) {
    f.wx += f.vx; f.wy += f.vy; f.life--;
    if (isSolidAt(f.wx, f.wy)) f.life = 0;
    for (const p of pigeons) {
      if (p.hp > 0 && wdist(f.wx, f.wy, p.wx, p.wy) < 22) {
        p.hp = 0; f.life = 0;
        boom(p.wx, p.wy, '#bbbbbb', 10);
        score += 10; pigKills++;
        updateHud();
      }
    }
  }
  fries = fries.filter(f => f.life > 0);

  for (const p of pigeons) {
    p.t += 0.04;
    const vx = Math.cos(p.t*1.3)*0.8, vy = Math.sin(p.t)*0.8;
    let npx = p.wx + vx;
    let npy = p.wy + vy;
    if (!isSolidAt(npx, p.wy)) p.wx = npx;
    if (!isSolidAt(p.wx, npy)) p.wy = npy;
  }
  pigeons = pigeons.filter(p => p.hp > 0);
  while (pigeons.length < 8) spawnPigeon();

  // --- NPC chodci + street enemies ---
  const AGRO_DIST = 130, AGRO_SPD = 0.85, WALK_SPD = 0.5;
  for (const n of npcs) {
    n.t += 0.02;
    if (n.role === 'enemy') {
      const d = wdist(n.wx, n.wy, player.wx, player.wy);
      n.agro = d < AGRO_DIST;
      if (n.agro) {
        // Chase hráče
        const dx = player.wx - n.wx, dy = player.wy - n.wy, l = Math.hypot(dx, dy) || 1;
        n.vx = dx/l * AGRO_SPD; n.vy = dy/l * AGRO_SPD;
        const enx = n.wx + n.vx, eny = n.wy + n.vy;
        if (!isSolidAt(enx, n.wy)) n.wx = enx; else n.vx = 0;
        if (!isSolidAt(n.wx, eny)) n.wy = eny; else n.vy = 0;
        // Zásah hráče
        if (d < 16 && hurtCd === 0 && n.hp > 0) {
          lives--; hurtCd = 90; updateHud(); addShake(0.35);
          sfx('hurt', 0.5); boom(player.wx, player.wy, '#ff3b3b', 8);
          popup('👊 Dostal ses!');
          if (lives <= 0) { gameOver(); return; }
        }
      } else {
        // Wandering
        if (Math.random() < 0.012) n.dir += (Math.random()-0.5)*0.9;
        n.vx = Math.cos(n.dir)*WALK_SPD; n.vy = Math.sin(n.dir)*WALK_SPD;
        const enx = n.wx + n.vx, eny = n.wy + n.vy;
        if (!isSolidAt(enx, n.wy)) n.wx = enx; else { n.dir += Math.PI*0.35; n.vx = 0; }
        if (!isSolidAt(n.wx, eny)) n.wy = eny; else { n.dir += Math.PI*0.35; n.vy = 0; }
      }
    } else {
      // Normální chodec — wandering
      if (Math.random() < 0.01) n.dir += (Math.random()-0.5)*0.7;
      n.vx = Math.cos(n.dir)*WALK_SPD*0.7; n.vy = Math.sin(n.dir)*WALK_SPD*0.7;
      const nnx = n.wx + n.vx, nny = n.wy + n.vy;
      if (!isSolidAt(nnx, n.wy)) n.wx = nnx; else { n.dir += Math.PI*0.4; n.vx = 0; }
      if (!isSolidAt(n.wx, nny)) n.wy = nny; else { n.dir += Math.PI*0.4; n.vy = 0; }
    }
  }
  while (npcs.length < 28) spawnNpc();

  // --- cogani (vlny — vždy honí hráče) ---
  if (hurtCd > 0) hurtCd--;
  if (smazakCd > 0) smazakCd--;
  if (bannerT > 0) bannerT--;
  const chase = (e, spd) => {           // pohyb entity směrem k hráči
    let dx = player.wx - e.wx, dy = player.wy - e.wy;
    const l = Math.hypot(dx, dy) || 1;
    const exp = e.wx + dx/l*spd, eyp = e.wy + dy/l*spd;
    if (!isSolidAt(exp, e.wy)) e.wx = exp;
    if (!isSolidAt(e.wx, eyp)) e.wy = eyp;
    return Math.hypot(dx, dy);
  };
  for (const c of cogani) {
    c.t += 0.05;
    if (c.hit > 0) c.hit--;
    const d = chase(c, 0.8);
    if (d < 12 && hurtCd === 0) {
      lives--; hurtCd = 90; updateHud(); addShake(0.45); sfx('hurt', 0.6);
      boom(player.wx, player.wy, '#ff3b3b', 12);
      popup('🤬 ' + rnd(HIT_TAUNTS));
      if (lives <= 0) { gameOver(); return; }
    }
  }
  // hranolky vs cogani
  for (const f of fries) {
    if (f.life <= 0) continue;
    for (const c of cogani) {
      if (c.hp > 0 && wdist(f.wx, f.wy, c.wx, c.wy) < 12) {
        c.hp--; c.hit = 10; f.life = 0;
        boom(c.wx, c.wy, '#e8a020', 8); sfx('hit', 0.4);
        if (c.hp <= 0) { score += 25; coganKills++; updateHud(); boom(c.wx, c.wy, '#ff3b3b', 14); addShake(0.22); sfx('kill', 0.5); }
      }
    }
  }
  cogani = cogani.filter(c => c.hp > 0);

  // --- BOSS Peco + pes ---
  if (boss) {
    boss.t += 0.05; if (boss.hit > 0) boss.hit--;
    const d = chase(boss, 0.7);
    if (d < 20 && hurtCd === 0) {
      lives--; hurtCd = 90; updateHud(); addShake(0.45); sfx('hurt', 0.6);
      boom(player.wx, player.wy, '#ff3b3b', 16);
      popup('🔪 Peco tě seknul mačetou!');
      if (lives <= 0) { gameOver(); return; }
    }
    for (const f of fries) {
      if (f.life > 0 && wdist(f.wx, f.wy, boss.wx, boss.wy) < 20) {
        boss.hp--; boss.hit = 8; f.life = 0; boom(boss.wx, boss.wy, '#e8a020', 6); addShake(0.1);
      }
    }
    if (boss.hp <= 0) {
      boom(boss.wx, boss.wy, '#ff3b3b', 40); score += 200; updateHud(); addShake(0.85); freeze(6); sfx('kill', 0.7);
      popup('🏆 PECO PADL! +200'); boss = null; dog = null;
    }
  }
  if (dog) {
    dog.t += 0.05; if (dog.hit > 0) dog.hit--;
    const d = chase(dog, 1.3);
    if (d < 10 && hurtCd === 0) {
      lives--; hurtCd = 90; updateHud(); addShake(0.45); sfx('hurt', 0.6);
      boom(player.wx, player.wy, '#ff3b3b', 10);
      popup('🐕 Pečův pes tě kousnul!');
      if (lives <= 0) { gameOver(); return; }
    }
    for (const f of fries) {
      if (f.life > 0 && wdist(f.wx, f.wy, dog.wx, dog.wy) < 10) {
        dog.hp--; dog.hit = 8; f.life = 0; boom(dog.wx, dog.wy, '#e8a020', 5);
      }
    }
    if (dog.hp <= 0) { boom(dog.wx, dog.wy, '#aaaaaa', 12); score += 40; updateHud(); dog = null; }
  }

  // --- smažák speciál ---
  for (const s of smazaks) {
    s.t += 0.3;
    s.wx += s.vx; s.wy += s.vy;
    s.life--;
    // vybuchne při zásahu nepřítele (ne až na konci dráhy)
    const hitEnemy =
      cogani.some(c => c.hp > 0 && wdist(s.wx, s.wy, c.wx, c.wy) < 18) ||
      (boss && wdist(s.wx, s.wy, boss.wx, boss.wy) < 24) ||
      (dog  && wdist(s.wx, s.wy, dog.wx, dog.wy)  < 14);
    if (hitEnemy || s.life <= 0) { smazakBoom(s.wx, s.wy); s.dead = true; }
  }
  smazaks = smazaks.filter(s => !s.dead);

  // --- řízení vln (Fáze A vypnuto — boj přijde ve Fázi B) ---
  if (COMBAT) {
    if (waveState === 'FIGHT') {
      if (cogani.length === 0 && !boss) onWaveCleared();
    } else {
      breakT--;
      if (breakT <= 0) startNextWave();
    }
  }

  // --- pytlíky párno (sběr) ---
  for (const b of bags) { b.t += 0.05; }
  for (const b of bags) {
    if (wdist(b.wx, b.wy, player.wx, player.wy) < 14) {
      b.got = true; bagsGot++; score += 15;
      player.boostT = 300;   // ~5 s na 60 fps
      sfx('pickup', 0.6);
      boom(player.wx, player.wy, '#ffffff', 14);
      popup('💊 ' + rnd(PARNO_LINES));
      updateHud();
    }
  }
  bags = bags.filter(b => !b.got);
  while (bags.length < 4) spawnBag();

  // --- popupy ---
  for (const p of popups) p.t--;
  popups = popups.filter(p => p.t > 0);

  for (const pt of particles) { pt.wx += pt.vx; pt.wy += pt.vy; pt.life--; }
  particles = particles.filter(pt => pt.life > 0);
}

// ---------- Vykreslení ----------
// ---------- Vektorová mapa (ostré 2.5D, kreslené naživo z dat) ----------
let vGreen = [], vWaterP = [], vWaterL = [], vRoads = [], vRail = [], vBld = [];
function aabb(a, s) { let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for (let i=s;i<a.length;i+=2){const x=a[i],y=a[i+1]; if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;} return [x0,y0,x1,y1]; }
function prepVectors() {
  if (typeof VEC_BLD === 'undefined') return;
  vGreen  = VEC_GREEN.map(a => ({ a, bb: aabb(a,1) }));
  vWaterP = VEC_WATERP.map(a => ({ a, bb: aabb(a,0) }));
  vWaterL = VEC_WATERL.map(a => ({ a, bb: aabb(a,0) }));
  vRoads  = VEC_ROADS.map(a => ({ a, bb: aabb(a,1) }));
  vRail   = VEC_RAIL.map(a => ({ a, bb: aabb(a,0) }));
  vBld    = VEC_BLD.map((a,i) => ({ a, bb: aabb(a,1), ci: i % 6 })).sort((p,q) => p.bb[3]-q.bb[3]);
}
const ROOFS = ['#c75b46','#b5503f','#cf6a4a','#9a8a6a','#a05040','#8a8a92'];
const WALLS = ['#9a7f6a','#8f7560','#a08a72','#7d7060','#977f66','#6f6258'];
const GCOL  = ['#5f7350','#79a85a','#4f7d3e'];   // hřbitov, tráva, les

function drawMap() {
  const S = ZOOM, ox = VW/2 - cam.x*S, oy = VH/2 - cam.y*S;
  const X = wx => wx*S + ox, Y = wy => wy*S + oy;
  const hw = VW/(2*S)+40, hh = VH/(2*S)+40;
  const vx0=cam.x-hw, vx1=cam.x+hw, vy0=cam.y-hh, vy1=cam.y+hh;
  const vis = bb => bb[0]<=vx1 && bb[2]>=vx0 && bb[1]<=vy1 && bb[3]>=vy0;
  const path = (a, s) => { ctx.beginPath(); ctx.moveTo(X(a[s]),Y(a[s+1])); for (let i=s+2;i<a.length;i+=2) ctx.lineTo(X(a[i]),Y(a[i+1])); };

  ctx.fillStyle = '#6f9b54'; ctx.fillRect(0, 0, VW, VH);   // tráva (podklad)
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const o of vGreen)  { if (!vis(o.bb)) continue; path(o.a,1); ctx.closePath(); ctx.fillStyle=GCOL[o.a[0]]||'#79a85a'; ctx.fill(); }
  ctx.fillStyle = '#4a90c4';
  for (const o of vWaterP) { if (!vis(o.bb)) continue; path(o.a,0); ctx.closePath(); ctx.fill(); }
  ctx.strokeStyle = '#4a90c4'; ctx.lineWidth = Math.max(2, 9*S);
  for (const o of vWaterL) { if (!vis(o.bb)) continue; path(o.a,0); ctx.stroke(); }
  // cesty: chodník (světlý široký) → asfalt (tmavý) → středová čára. Šířky v metrech × měřítko.
  const PM = MAP_PXM, ms = PM * S;
  const RD = { '2':[11,3], '1':[7,2.2], '0':[4.5,1.3], '-1':[2.4,0] };
  const rm = c => RD[c] || RD['1'];
  for (const o of vRoads) { if (!vis(o.bb)) continue; const m=rm(o.a[0]); if (m[1]<=0) continue;   // chodník
    ctx.strokeStyle='#b9b3a6'; ctx.lineWidth=(m[0]+2*m[1])*ms; path(o.a,1); ctx.stroke(); }
  for (const o of vRoads) { if (!vis(o.bb)) continue; const c=o.a[0], m=rm(c);                        // asfalt
    ctx.strokeStyle=c<0?'#9a9286':'#454552'; ctx.lineWidth=Math.max(1.5,m[0]*ms); path(o.a,1); ctx.stroke(); }
  ctx.setLineDash([10*S, 13*S]);                                                                      // středová čára (2 proudy)
  for (const o of vRoads) { if (!vis(o.bb)||o.a[0]<1) continue;
    ctx.strokeStyle='rgba(255,212,90,0.55)'; ctx.lineWidth=Math.max(1,0.5*ms); path(o.a,1); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.strokeStyle = '#7a7a7a'; ctx.lineWidth = Math.max(2, 4*S);
  for (const o of vRail)   { if (!vis(o.bb)) continue; path(o.a,0); ctx.stroke(); }
  // budovy 2.5D (odzadu dopředu) — ostré hrany + výška
  ctx.lineWidth = 1.2; ctx.strokeStyle = '#3a2c22';
  for (const o of vBld) {
    if (!vis(o.bb)) continue;
    const a = o.a, h = a[0]*10.8*S;
    ctx.beginPath(); ctx.moveTo(X(a[1])+3, Y(a[2])+5); for (let i=3;i<a.length;i+=2) ctx.lineTo(X(a[i])+3, Y(a[i+1])+5); ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fill();                       // stín
    path(a,1); ctx.closePath(); ctx.fillStyle = WALLS[o.ci]; ctx.fill();  // stěny
    ctx.beginPath(); ctx.moveTo(X(a[1]), Y(a[2])-h); for (let i=3;i<a.length;i+=2) ctx.lineTo(X(a[i]), Y(a[i+1])-h); ctx.closePath();
    ctx.fillStyle = ROOFS[o.ci]; ctx.fill(); ctx.stroke();                // střecha + hrana
  }
}

// ---------- Reálné podniky (POI z OSM) ----------
const pois = (typeof POI !== 'undefined') ? POI.map(p => ({ role: p[0], wx: p[1], wy: p[2], name: p[3] })) : [];
const POI_ICON = {
  VECERKA:'🏪', KAUFLAND:'🛒', ALKOHOL:'🍾', STANEK:'🍫', TRAFIKA:'🚬',
  FASTFOOD:'🌯', HOSPODA:'🍺', BAR:'🍸', ZASTAVARNA:'💰', LEKARNA:'💊',
  BANKA:'🏧', PEKARNA:'🥖', RESTAURACE:'🍽️', REZNIK:'🥩', TRZNICE:'🛍️', PUMPA:'⛽',
};
function drawPOI() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const p of pois) {
    const [sx, sy] = wts(p.wx, p.wy);
    if (sx < -30 || sx > VW+30 || sy < -30 || sy > VH+30) continue;
    const near = wdist(player.wx, player.wy, p.wx, p.wy) < 50;
    // podklad pod ikonu
    ctx.globalAlpha = near ? 1 : 0.85;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.arc(sx, sy - 14, 12, 0, Math.PI*2); ctx.fill();
    ctx.font = '16px serif';
    ctx.fillText(POI_ICON[p.role] || '📍', sx, sy - 14);
    ctx.globalAlpha = 1;
    if (near) {   // poblíž = ukaž jméno + výzva
      const lbl = (p.name || p.role);
      ctx.font = 'bold 13px Oswald, sans-serif';
      const w = ctx.measureText(lbl).width + 14;
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.fillRect(sx - w/2, sy - 44, w, 19);
      ctx.fillStyle = '#ffd23f'; ctx.fillText(lbl, sx, sy - 34);
    }
  }
}

function drawPlayer() {
  const cx = VW/2, cy = VH/2;
  ctx.save();
  ctx.translate(cx, cy);

  // stín pod nohama
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.beginPath(); ctx.ellipse(0, 15, 12, 4, 0, 0, Math.PI*2); ctx.fill();

  // aura párna (boost)
  if (player.boostT > 0) {
    const g = ctx.createRadialGradient(0, 0, 3, 0, 0, 26);
    g.addColorStop(0, 'rgba(120,220,255,0.35)'); g.addColorStop(1, 'rgba(120,220,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI*2); ctx.fill();
  }

  if (charReady) {
    const moving = Math.hypot(player.vx, player.vy) > 0.4;
    const bob = moving ? Math.sin(Date.now()/110) * 1.5 : 0;
    const H = 30, W = H * (charImg.width / charImg.height);   // lidská velikost vůči baráku
    ctx.scale(facing, 1);                       // překlopení vlevo/vpravo
    ctx.drawImage(charImg, -W/2, -H + 11 + bob, W, H);
  } else {
    // fallback než se sprite načte
    ctx.fillStyle = '#2d3340';
    ctx.beginPath(); ctx.roundRect(-14, -10, 28, 34, 8); ctx.fill();
  }

  ctx.restore();
}

function drawPigeons() {
  for (const p of pigeons) {
    const [x, y] = wts(p.wx, p.wy);
    if (x < -40 || x > VW+40 || y < -40 || y > VH+40) continue;
    const bob = Math.sin(p.t*3)*2;
    ctx.fillStyle = '#9aa0a8';
    ctx.beginPath(); ctx.ellipse(x, y+bob, 11, 8, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#aeb4bc';
    ctx.beginPath(); ctx.arc(x+8, y-4+bob, 5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#e8a020';
    ctx.beginPath(); ctx.moveTo(x+12, y-4+bob); ctx.lineTo(x+17, y-3+bob); ctx.lineTo(x+12, y-1+bob); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(x+9, y-5+bob, 1.3, 0, Math.PI*2); ctx.fill();
  }
}

// malá top-down postavička (hlava + tričko); skin = barva obličeje
function drawLittlePerson(x, y, shirt, bob, skin = '#e8c39a', scale = 1) {
  ctx.save(); ctx.translate(x, y+bob); ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(0, 12-bob, 11, 4, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = shirt;                                  // tělo
  ctx.beginPath(); ctx.roundRect(-9, -4, 18, 18, 6); ctx.fill();
  ctx.fillStyle = skin;                                   // hlava/obličej
  ctx.beginPath(); ctx.arc(0, -8, 7, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, -8, 7, 0, Math.PI*2); ctx.stroke();
  ctx.restore();
}

function drawNpcs() {
  for (const n of npcs) {
    const [x, y] = wts(n.wx, n.wy);
    if (x < -40 || x > VW+40 || y < -40 || y > VH+40) continue;
    drawLittlePerson(x, y, n.col, Math.sin(n.t*4)*1.5);
  }
}

function drawCogani() {
  for (const c of cogani) {
    const [x, y] = wts(c.wx, c.wy);
    if (x < -40 || x > VW+40 || y < -40 || y > VH+40) continue;
    const hit = c.hit > 0;
    const shirt = hit ? '#ffffff' : '#1a1a1a';            // černá mikina
    const skin  = hit ? '#ffffff' : '#5b3f28';            // tmavý obličej (odliší od chodců)
    drawLittlePerson(x, y, shirt, Math.sin(c.t*5)*2, skin);
    // kšiltovka
    ctx.fillStyle = hit ? '#ffffff' : '#0a0a0a';
    ctx.fillRect(x-7, y-15, 14, 4);
    // health pruh
    if (c.hp < 2) { ctx.fillStyle = '#e74c3c'; ctx.fillRect(x-9, y-21, 18*(c.hp/2), 3); }
  }
}

function drawBags() {
  for (const b of bags) {
    const [x, y] = wts(b.wx, b.wy);
    if (x < -40 || x > VW+40 || y < -40 || y > VH+40) continue;
    const pulse = 1 + Math.sin(b.t*3)*0.08;
    ctx.save(); ctx.translate(x, y); ctx.scale(pulse, pulse);
    // stín
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(0, 16, 13, 4, 0, 0, Math.PI*2); ctx.fill();
    // sáček (větší)
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath(); ctx.roundRect(-15, -13, 30, 28, 4); ctx.fill();
    ctx.strokeStyle = '#999'; ctx.lineWidth = 1.5; ctx.stroke();
    // zip nahoře
    ctx.fillStyle = '#cfcfcf'; ctx.fillRect(-15, -13, 30, 4);
    // bílý prášek uvnitř
    ctx.fillStyle = '#f4f4f4';
    ctx.beginPath(); ctx.moveTo(-12, 14); ctx.lineTo(12, 14); ctx.lineTo(7, 1); ctx.lineTo(-7, 1); ctx.fill();
    // nápis PÁRNO
    ctx.fillStyle = '#c0392b'; ctx.font = 'bold 8px Oswald, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('PÁRNO', 0, -5);
    ctx.restore();
  }
}

function drawBoss() {
  if (!boss) return;
  const [x, y] = wts(boss.wx, boss.wy);
  const hit = boss.hit > 0;
  // velký cogan 2×
  drawLittlePerson(x, y, hit ? '#fff' : '#111', Math.sin(boss.t*4)*2, hit ? '#fff' : '#5b3f28', 2);
  // kšiltovka
  ctx.fillStyle = hit ? '#fff' : '#000'; ctx.fillRect(x-14, y-30, 28, 7);
  // mačeta
  ctx.save(); ctx.translate(x+18, y-2); ctx.rotate(Math.sin(boss.t*6)*0.4 - 0.3);
  ctx.fillStyle = '#888'; ctx.fillRect(0, -3, 30, 6);
  ctx.fillStyle = '#5a3b22'; ctx.fillRect(-8, -3, 8, 6);
  ctx.restore();
  // jmenovka
  ctx.font = 'bold 11px Oswald, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText('PECO', x, y-40);
  ctx.fillStyle = '#ff4040'; ctx.fillText('PECO', x, y-40);
}

function drawDog() {
  if (!dog) return;
  const [x, y] = wts(dog.wx, dog.wy);
  const hit = dog.hit > 0;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(x, y+8, 12, 4, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = hit ? '#fff' : '#3a2a1a';
  ctx.beginPath(); ctx.ellipse(x, y, 12, 7, 0, 0, Math.PI*2); ctx.fill();     // tělo
  ctx.beginPath(); ctx.arc(x+11, y-3, 5, 0, Math.PI*2); ctx.fill();           // hlava
  ctx.fillStyle = '#000'; ctx.fillRect(x+15, y-5, 4, 2);                      // čumák
}

function drawSmazaks() {
  for (const s of smazaks) {
    const [x, y] = wts(s.wx, s.wy);
    ctx.save(); ctx.translate(x, y); ctx.rotate(s.t);
    ctx.fillStyle = '#caa53a'; ctx.beginPath(); ctx.roundRect(-13, -9, 26, 18, 4); ctx.fill();
    ctx.fillStyle = '#e8c45a'; ctx.beginPath(); ctx.roundRect(-10, -6, 20, 12, 3); ctx.fill();
    ctx.restore();
  }
}

function drawBossHpBar() {
  if (!boss) return;
  const w = Math.min(VW*0.7, 280), h = 16, x = (VW-w)/2, y = 70;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x-2, y-2, w+4, h+4);
  ctx.fillStyle = '#3a0000'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#e02020'; ctx.fillRect(x, y, w*Math.max(0,boss.hp/boss.maxhp), h);
  ctx.font = 'bold 12px Oswald, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff'; ctx.fillText('☠ PECO', VW/2, y+h/2);
}

function drawBanner() {
  if (bannerT <= 0) return;
  const a = Math.min(1, bannerT/40);
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(150,0,0,0.85)';
  ctx.fillRect(0, VH*0.16, VW, 44);
  ctx.font = 'bold 17px Oswald, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff'; ctx.fillText(bannerText, VW/2, VH*0.16 + 22);
  ctx.globalAlpha = 1;
}

function drawFryBtn() {
  const r = 42, x = VW - r - 24, y = VH - r - 24;   // pravý dolní roh
  fryBtn = { x, y, r };
  ctx.globalAlpha = firing ? 1 : 0.9;
  ctx.fillStyle = firing ? '#ffd23f' : '#c0392b';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.font = '30px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🍟', x, y-6);
  ctx.font = 'bold 11px Oswald, sans-serif'; ctx.fillStyle = firing ? '#000' : '#fff';
  ctx.fillText('HOĎ', x, y+18);
}

function drawSmazakBtn() {
  const r = 32, x = VW - r - 30, y = VH - 2*42 - r - 40;   // nad tlačítkem HOĎ
  smazakBtn = { x, y, r };
  const ready = smazakCd <= 0;
  ctx.globalAlpha = ready ? 0.9 : 0.4;
  ctx.fillStyle = ready ? '#caa53a' : '#555';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🍽️', x, y-4);
  ctx.font = 'bold 9px Oswald, sans-serif'; ctx.fillStyle = '#000';
  ctx.fillText('SMAŽÁK', x, y+13);
  if (!ready) {   // cooldown oblouk
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, r-2, -Math.PI/2, -Math.PI/2 + (smazakCd/300)*Math.PI*2); ctx.stroke();
  }
}

function drawFries() {
  ctx.fillStyle = '#f4c430';
  for (const f of fries) {
    const [x, y] = wts(f.wx, f.wy);
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(f.vy, f.vx));
    ctx.fillRect(-5, -1.5, 10, 3);
    ctx.restore();
  }
}

function drawMuteBtn() {
  const r = 16, x = VW - r - 14, y = 112;
  muteBtn = { x, y, r };
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.font = '16px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(muted ? '🔇' : '🔊', x, y+1);
}

function drawPopups() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let i = 0;
  for (const p of popups) {
    const a = Math.min(1, p.t/40);
    ctx.globalAlpha = a;
    ctx.font = `bold 18px Oswald, sans-serif`;
    ctx.lineWidth = 4; ctx.strokeStyle = '#000';
    const yy = VH*0.30 + i*26;
    ctx.strokeText(p.text, VW/2, yy);
    ctx.fillStyle = '#fff'; ctx.fillText(p.text, VW/2, yy);
    i++;
  }
  ctx.globalAlpha = 1;
}

function drawParticles() {
  for (const pt of particles) {
    const [x, y] = wts(pt.wx, pt.wy);
    ctx.globalAlpha = pt.life/24;
    ctx.fillStyle = pt.col;
    ctx.fillRect(x-2, y-2, 4, 4);
  }
  ctx.globalAlpha = 1;
}

function drawStick(j, col) {
  if (!j.active) return;
  ctx.globalAlpha = 0.30;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(j.bx, j.by, 55, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(j.bx+j.dx, j.by+j.dy, 26, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;
}
function drawJoystick() {
  drawStick(moveJoy, '#ffffff');   // pohyb (levý palec)
}

function gtaText(text, x, y, size, fill = '#ffd700', stroke = '#000', sw = 6) {
  ctx.font = `bold ${size}px Oswald, Impact, "Arial Black", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = sw; ctx.strokeStyle = stroke; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}

// karta v menu; primary = zlatá hlavní; pressed = efekt zmáčknutí
function menuCard(x, y, w, h, label, primary, pressed) {
  const cx = x + w/2, cy = y + h/2;
  const breathe = primary ? 1 + Math.sin(Date.now()/450)*0.02 : 1;
  const press = pressed ? 1 - 0.07*(menuPress/10) : 1;
  const sc = breathe * press;
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
  if (primary) {
    const p = 0.5 + 0.5*Math.sin(Date.now()/400);
    ctx.save();
    ctx.shadowColor = `rgba(255,210,63,${0.5 + p*0.4})`;
    ctx.shadowBlur = 22 + p*16;
    ctx.fillStyle = pressed ? '#fff7d0' : '#ffd23f';
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 16); ctx.fill();
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(18,18,26,0.92)';
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 16); ctx.fill();
  }
  ctx.lineWidth = 3; ctx.strokeStyle = '#ffd23f';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 16); ctx.stroke();
  gtaText(label, cx, cy + 1, primary ? 30 : 23, primary ? '#1c1c12' : '#ffd23f', primary ? '#caa11f' : '#000', primary ? 2 : 4);
  ctx.restore();
  return { x, y, w, h };
}

function drawMenu() {
  ctx.fillStyle = '#10101c';
  ctx.fillRect(0, 0, VW, VH);
  const land = VW > VH;
  const ir = menuReady ? menuBg.width / menuBg.height : 0.557;

  let cx, cw;   // střed a šířka panelu s ovládáním
  if (land) {
    // poster vpravo (celá výška), ovládání vlevo
    const iw = VH * ir, ix = VW - iw;
    if (menuReady) ctx.drawImage(menuBg, ix, 0, iw, VH);
    const g = ctx.createLinearGradient(ix - 30, 0, ix + 90, 0);
    g.addColorStop(0, '#10101c'); g.addColorStop(1, 'rgba(16,16,28,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, ix + 90, VH);
    cx = Math.max(ix, 120) / 2;
    cw = Math.min(ix * 0.82, 320);
  } else {
    // portrait: poster přes celou plochu (cover)
    if (menuReady) {
      const cr = VW / VH; let w, h, x, y;
      if (cr > ir) { w = VW; h = w/ir; x = 0; y = (VH-h)/2; }
      else { h = VH; w = h*ir; x = (VW-w)/2; y = 0; }
      ctx.drawImage(menuBg, x, y, w, h);
    }
    let gTop = ctx.createLinearGradient(0, 0, 0, VH*0.32);
    gTop.addColorStop(0, 'rgba(0,0,0,0.78)'); gTop.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gTop; ctx.fillRect(0, 0, VW, VH*0.32);
    let gBot = ctx.createLinearGradient(0, VH*0.55, 0, VH);
    gBot.addColorStop(0, 'rgba(0,0,0,0)'); gBot.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = gBot; ctx.fillRect(0, VH*0.55, VW, VH*0.45);
    cx = VW/2; cw = Math.min(VW*0.84, 360);
  }

  // --- Název hry ---
  const titleSize = land ? Math.min(VH*0.11, cw*0.13, 32) : Math.min(VW*0.115, 56);
  const titleY = land ? VH*0.17 : VH*0.10;
  gtaText('GTA 7: TĚŠÍN CITY', cx, titleY, titleSize, '#ffd23f', '#000', land?5:8);
  gtaText('Smažák s Hranolkama DLC', cx, titleY + titleSize*0.95, titleSize*0.5, '#ffffff', '#000', 4);

  // --- 3 karty ---
  const ch = land ? 46 : 62, gap = land ? 12 : 16;
  const x0 = cx - cw/2;
  let cy = land ? VH*0.40 : VH*0.54;
  menuBtn  = menuCard(x0, cy,                cw, ch+6, '▶  NOVÁ HRA',  true,  pendingStart);
  lbBtn    = menuCard(x0, cy + ch+gap,       cw, ch,   '🏆 TOP SMAŽKY', false, false);
  settingsBtn = menuCard(x0, cy + 2*(ch+gap), cw, ch,  '⚙️ NASTAVENÍ', false, false);

  // --- Nick (změnit) vlevo nahoře ---
  ctx.font = `600 14px Oswald, sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = '#000';
  const ntxt = '👤 ' + (nick || '—') + '  (změnit)';
  ctx.strokeText(ntxt, 14, 26); ctx.fillStyle = '#fff'; ctx.fillText(ntxt, 14, 26);
  nickMenuBtn = { x: 10, y: 12, w: ctx.measureText(ntxt).width + 12, h: 28 };

  // --- Disclaimer dole (v panelu s ovládáním) ---
  ctx.font = `600 ${Math.min(cw*0.04, 12)}px Oswald, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('Postavy a místa jsou fiktivní, podobnost čistě náhodná. xd', cx, VH - 22);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText('Mapa © OpenStreetMap contributors', cx, VH - 9);
}

function wrapText(text, maxW, font) {
  ctx.font = font;
  const words = text.split(' ');
  const lines = []; let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function drawGameOver() {
  // tmavě rudý nádech jako GTA
  ctx.fillStyle = 'rgba(60,0,0,0.78)';
  ctx.fillRect(0, 0, VW, VH);

  // WASTED
  const wsz = Math.min(VW*0.17, 84);
  ctx.save();
  ctx.font = `bold ${wsz}px Oswald, Impact, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.letterSpacing = '3px';
  ctx.lineWidth = 8; ctx.strokeStyle = '#000'; ctx.strokeText('WASTED', VW/2, VH*0.32);
  ctx.fillStyle = '#d8d8d8'; ctx.fillText('WASTED', VW/2, VH*0.32);
  ctx.letterSpacing = '0px';
  ctx.restore();

  // hláška o smrti (zalomená)
  const font = `600 ${Math.min(VW*0.045,18)}px Oswald, sans-serif`;
  const lines = wrapText(deathMsg, VW*0.82, font);
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let yy = VH*0.46;
  for (const ln of lines) {
    ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(ln, VW/2, yy);
    ctx.fillStyle = '#ffd9d9'; ctx.fillText(ln, VW/2, yy);
    yy += Math.min(VW*0.06, 24);
  }

  gtaText(`SKÓRE: ${score}`, VW/2, yy + 28, 32, '#ffd700');

  // --- LEADERBOARD (TOP 5) ---
  const lb = loadLB().slice(0, 5);
  let ly = yy + 64;
  ctx.font = 'bold 16px Oswald, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = '#000';
  ctx.strokeText('🏆 TOP SMAŽKY', VW/2, ly); ctx.fillStyle = '#ffd23f'; ctx.fillText('🏆 TOP SMAŽKY', VW/2, ly);
  ly += 26;
  ctx.font = '600 15px Oswald, sans-serif';
  let shownMe = false;
  lb.forEach((e, i) => {
    const me = !shownMe && e.name === nick && e.score === score;
    if (me) shownMe = true;
    const t = `${i+1}.  ${e.name}  —  ${e.score}`;
    ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(t, VW/2, ly);
    ctx.fillStyle = me ? '#7CFC7C' : '#fff'; ctx.fillText(t, VW/2, ly);
    ly += 22;
  });

  const a = 0.5 + 0.5*Math.sin(Date.now()/300);
  ctx.globalAlpha = a;
  gtaText('TAPNI PRO NOVOU HRU', VW/2, VH - 50, 20, '#fff', '#000', 4);
  ctx.globalAlpha = 1;
}

// ---------- Smyčka ----------
let lbTick = 0;
// Lazy init R3D při prvním přechodu do PLAYING
let r3dReady = false;
function ensureR3D() {
  if (!r3dReady && typeof R3D !== 'undefined') {
    R3D.init();
    r3dReady = true;
  }
}

function loop() {
  // průběžně obnov globální žebříček (mimo hru, ~každých 6 s)
  if (state !== 'PLAYING' && (++lbTick % 360 === 0)) refreshLB();
  // klikací efekt menu → po doznění spusť hru
  if (pendingStart) { if (menuPress > 0) menuPress--; else { pendingStart = false; startGame(); } }
  if (hitstop > 0) hitstop--; else update();   // hitstop = mikro-zmrazení

  if (state === 'MENU' || state === 'OVER') {
    // ── 2D MENU / GAME OVER: kreslíme na menuCanvas overlay ──
    // menuCanvas je viditelný, gameCanvas je v pozadí (jen barva pozadí)
    ctx.clearRect(0, 0, VW, VH);
    if (state === 'MENU') {
      drawMenu();
      drawMuteBtn();
    } else {
      // OVER: nejdřív jednoduchý 3D frame v pozadí, pak 2D overlay
      if (r3dReady) R3D.renderFrame();
      drawGameOver();
      drawMuteBtn();
    }
  } else {
    // ── 3D PLAYING: WebGL na gameCanvas, 2D HUD na menuCanvas ──
    ensureR3D();
    // Vymaz 2D overlay (průhledný — HUD je DOM, jen joystick+bannery přes ctx)
    ctx.clearRect(0, 0, VW, VH);

    // WebGL 3D render
    R3D.renderFrame();

    // HUD prvky přes menuCanvas (joystick, bannery, tlačítka, popupy)
    // screen shake: posuň 2D HUD vrstvu (NE 3D scénu)
    const shakeAmt = trauma * trauma * 16;
    const shx = Math.round((Math.random()*2-1) * shakeAmt);
    const shy = Math.round((Math.random()*2-1) * shakeAmt);
    ctx.save();
    ctx.translate(shx, shy);
    // Particles a fries zatím bez 3D, přeskočíme v kroku 1
    // (logika běží dál, jen vizuál chybí — přijde v kroku 2)
    ctx.restore();

    // UI bez otřesu
    drawPopups();
    drawBanner();
    drawBossHpBar();
    drawFryBtn();
    drawSmazakBtn();
    drawMuteBtn();
    drawJoystick();
  }
  requestAnimationFrame(loop);
}

buildMap();
prepVectors();
showHud(false);
loop();
refreshLB();             // načti globální žebříček
if (!nick) showNick();   // poprvé: vyžádej nick

// pokus spustit hudbu hned při načtení (pokud prohlížeč povolí autoplay);
// jinak naskočí při prvním dotyku přes listenery výše
startMusic();

// ── AUTOTEST háček (jen s ?autotest v URL — pro headless screenshot z WSL) ──
// Sám zadá nick, spustí hru, volitelně simuluje pohyb, a sype diagnostiku do
// #__diag divu (čte se přes chrome --dump-dom). V ostré verzi NEAKTIVNÍ.
if (location.search.indexOf('autotest') !== -1) {
  const _log = [];
  const _diag = m => {
    _log.push(String(m));
    let el = document.getElementById('__diag');
    if (!el) { el = document.createElement('div'); el.id = '__diag';
      el.style.cssText = 'position:fixed;left:0;bottom:0;z-index:99999;background:#000;color:#0f0;font:10px monospace;padding:2px;max-width:100%';
      document.body.appendChild(el); }
    el.textContent = _log.join(' ║ ');
  };
  window.addEventListener('error', e => _diag('JSERR: ' + e.message + ' @' + (e.lineno||'?')));
  ['log','warn','error'].forEach(k => { const o = console[k];
    console[k] = (...a) => { _diag(k.toUpperCase() + ': ' + a.join(' ')); o.apply(console, a); }; });
  window.addEventListener('load', () => setTimeout(() => {
    try { localStorage.setItem('smazak_nick', 'TEST'); } catch (e) {}
    try { if (typeof hideNick === 'function') hideNick(); } catch (e) {}
    try { startGame(); _diag('startGame OK'); } catch (e) { _diag('startGame THROW: ' + e.message); }
    try { if (window.R3D) R3D.init(); } catch (e) { _diag('R3D.init THROW: ' + e.message); }   // hned, jako na mobilu
    // teleport pro testovací screenshot (?tx=..&ty=..)
    try {
      const q = new URLSearchParams(location.search);
      const tx = parseFloat(q.get('tx')), ty = parseFloat(q.get('ty'));
      if (!isNaN(tx) && !isNaN(ty)) { player.wx = tx; player.wy = ty; player.vx = player.vy = 0; _diag('teleport ' + tx + ',' + ty); }
    } catch (e) {}
    setTimeout(() => {
      _diag('VEC_BLD=' + (typeof VEC_BLD !== 'undefined' ? VEC_BLD.length : 'UNDEF'));
      // test pohybu: zapni joystick doprava a zavolej update() 120× přímo
      try {
        const x0 = player.wx, y0 = player.wy;
        moveJoy.active = true; moveJoy.id = 999; moveJoy.dx = 50; moveJoy.dy = 0;
        for (let i = 0; i < 120; i++) { if (typeof update === 'function') update(); }
        _diag('po 120x update=' + Math.round(player.wx) + ',' + Math.round(player.wy) + ' (z ' + Math.round(x0) + ',' + Math.round(y0) + ')');
      } catch (e) { _diag('MOVE TEST ERR: ' + e.message); }
      // test dotykového mapování (toLocal): simuluj touchstart na 80,600
      try {
        moveJoy.active = false; moveJoy.id = -1;
        const ev = new Event('touchstart', { bubbles: true, cancelable: true });
        ev.changedTouches = [{ clientX: 80, clientY: 600, identifier: 7 }];
        canvas.dispatchEvent(ev);
        _diag('touch@80,600 → active=' + moveJoy.active + ' bx=' + Math.round(moveJoy.bx) + ' by=' + Math.round(moveJoy.by));
      } catch (e) { _diag('TOUCH TEST ERR: ' + e.message); }
      // finální teleport (přepíše posun z testu pohybu) — pro screenshot na místě
      try {
        const q = new URLSearchParams(location.search);
        const tx = parseFloat(q.get('tx')), ty = parseFloat(q.get('ty'));
        if (!isNaN(tx) && !isNaN(ty)) { player.wx = tx; player.wy = ty; player.vx = player.vy = 0; }
      } catch (e) {}
      // sesynchronizuj 3D obraz na novou pozici hráče
      try { for (let i = 0; i < 3; i++) R3D.renderFrame(); } catch (e) {}
      if (window.R3D && R3D.debug) _diag('R3D ' + JSON.stringify(R3D.debug()));
    }, 1200);
  }, 600));
}
