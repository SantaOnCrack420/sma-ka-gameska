/* =========================================================
   GTA 7: TĚŠÍN CITY — Smažák s Hranolkama DLC
   Čistý přepis v2 — funkční základ: menu, pohyb, střílení, postava
   ========================================================= */
'use strict';

// ---------- Canvas ----------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
// VW/VH = logické rozměry (CSS px). Backing store škálujeme podle DPR = ostrá retina grafika.
let VW = window.innerWidth, VH = window.innerHeight;
function resize() {
  // strop DPR 2: na retina (DPR 3) by se kreslilo ~2× víc pixelů zbytečně = sekání
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  VW = window.innerWidth;
  VH = window.innerHeight;
  canvas.style.width = VW + 'px';
  canvas.style.height = VH + 'px';
  canvas.width = Math.round(VW * dpr);
  canvas.height = Math.round(VH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);   // kreslíme v logických px, GPU dorenderuje ostře
  ctx.imageSmoothingQuality = 'high';
}
window.addEventListener('resize', resize);
resize();

// ---------- Assets ----------
const charImg = new Image(); charImg.src = 'assets/simmy_char.png';
const menuBg  = new Image(); menuBg.src  = 'assets/menu_bg.png';
let charReady = false; charImg.onload = () => charReady = true;
let menuReady = false; menuBg.onload  = () => menuReady = true;

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
      if (settingsEl && settingsEl.style.display === 'flex') renderLbList();
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
const musicOnCb     = document.getElementById('musicOnCb');
const sfxOnCb       = document.getElementById('sfxOnCb');
const musicVolSl    = document.getElementById('musicVolSl');
const sfxVolSl      = document.getElementById('sfxVolSl');
const lbListEl      = document.getElementById('lbList');
const settingsClose = document.getElementById('settingsClose');
let settingsBtn = null, lbBtn = null;   // karty v menu (canvas)
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function renderLbList() {
  const lb = loadLB().slice(0, 10);
  lbListEl.innerHTML = lb.length
    ? lb.map(e => `<li>${escapeHtml(e.name)} — ${e.score}</li>`).join('')
    : '<li class="empty">Zatím nikdo. Buď první! 🍟</li>';
}
function openSettings() {
  musicOnCb.checked = musicOn; sfxOnCb.checked = sfxOn;
  musicVolSl.value = Math.round(musicVol * 100);
  sfxVolSl.value = Math.round(sfxVol * 100);
  renderLbList(); refreshLB();
  settingsEl.style.display = 'flex';
}
function closeSettings() { settingsEl.style.display = 'none'; }
musicOnCb.addEventListener('change', () => { musicOn = musicOnCb.checked; if (musicOn) startMusic(); setMusicVol(); saveAudioPrefs(); });
sfxOnCb.addEventListener('change',   () => { sfxOn = sfxOnCb.checked; saveAudioPrefs(); if (sfxOn) sfx('click'); });
musicVolSl.addEventListener('input', () => { musicVol = musicVolSl.value / 100; setMusicVol(); saveAudioPrefs(); });
sfxVolSl.addEventListener('input',   () => { sfxVol = sfxVolSl.value / 100; saveAudioPrefs(); });
sfxVolSl.addEventListener('change',  () => sfx('click'));
settingsClose.addEventListener('click', closeSettings);

// ---------- HUD ----------
const ui = document.getElementById('ui');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
function showHud(on) { if (ui) ui.style.display = on ? 'flex' : 'none'; }

// ---------- Svět (Náměstí ČSA, Český Těšín) ----------
const TILE = 64;
const COLS = 28, ROWS = 38;
const WPX = COLS * TILE;
const WPY = ROWS * TILE;

const T = { GRASS:0, ROAD:1, SIDEWALK:2, BUILDING:3, PLAZA:4, WATER:5, BRIDGE:6, POLAND:7 };
const SOLID = new Set([T.BUILDING, T.WATER]);

// startovní bod = na dlažbě jižně od kašny
const SPAWN_WX = 9 * TILE + 32;
const SPAWN_WY = 26 * TILE + 32;

let map = new Int8Array(COLS * ROWS);
const at = (c, r) => map[r * COLS + c];
function fill(c0, r0, c1, r1, t) {
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++)
      if (c >= 0 && c < COLS && r >= 0 && r < ROWS) map[r * COLS + c] = t;
}

// blok domů jen po obvodu, vnitřek = dvorek (pokud je dost velký)
function courtBlock(c0, r0, c1, r1) {
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      if (at(c, r) !== T.GRASS) continue;
      const edge = (c === c0 || c === c1 || r === r0 || r === r1);
      const bigEnough = (c1 - c0 >= 3 && r1 - r0 >= 3);
      if (edge || !bigEnough) map[r * COLS + c] = T.BUILDING;
    }
}

// props na náměstí (kreslené do mapy; kašna má kolizi přes WATER dlaždice)
let PROPS = [];

function buildMap() {
  map.fill(T.PLAZA);     // celé náměstí = dlažba

  // obvodové domy do výšky kolem celého náměstí (4 tlusté)
  fill(0, 0, COLS-1, 3, T.BUILDING);
  fill(0, ROWS-4, COLS-1, ROWS-1, T.BUILDING);
  fill(0, 0, 3, ROWS-1, T.BUILDING);
  fill(COLS-4, 0, COLS-1, ROWS-1, T.BUILDING);

  // chodník podél domů (uvnitř, kolem dokola)
  fill(4, 4, COLS-5, 4, T.SIDEWALK);
  fill(4, ROWS-5, COLS-5, ROWS-5, T.SIDEWALK);
  fill(4, 4, 4, ROWS-5, T.SIDEWALK);
  fill(COLS-5, 4, COLS-5, ROWS-5, T.SIDEWALK);

  // vjezdy / ulice (mezery v domech) — aby náměstí dýchalo
  fill(11, ROWS-4, 14, ROWS-1, T.ROAD);   // jižní vjezd
  fill(0, 8, 3, 10, T.ROAD);              // západní ulička
  fill(COLS-4, 22, COLS-1, 24, T.ROAD);   // východní ulička

  // kašna uprostřed (kolize = voda)
  fill(12, 17, 15, 20, T.WATER);

  // --- props (vizuál) ---
  PROPS = [];
  // kašna (kruh přes střed vodních dlaždic)
  PROPS.push({ type:'fountain', x:13.5, y:18.5, r:2.0 });
  // stromy ve dvou řadách podél náměstí
  for (let ry = 7; ry <= 30; ry += 4) {
    PROPS.push({ type:'tree', x:6.5,  y:ry });
    PROPS.push({ type:'tree', x:20.5, y:ry });
  }
  // lavičky kolem kašny
  PROPS.push({ type:'bench', x:13.5, y:15.0, h:0 });
  PROPS.push({ type:'bench', x:13.5, y:22.2, h:0 });
  PROPS.push({ type:'bench', x:10.3, y:18.5, h:1 });
  PROPS.push({ type:'bench', x:16.7, y:18.5, h:1 });
  // řada zaparkovaných aut (jako na náhledu)
  const carCols = ['#b13b3b','#3b6db1','#cfa92e','#4a4a4a','#2e8b57','#8a8a8a'];
  for (let i = 0; i < 6; i++) PROPS.push({ type:'car', x:8.0, y:8 + i*1.4, col:carCols[i%carCols.length] });
  // tržní stánky (bílé markýzy)
  PROPS.push({ type:'stall', x:18.5, y:8.5 });
  PROPS.push({ type:'stall', x:18.5, y:10.5 });
  PROPS.push({ type:'stall', x:18.5, y:12.5 });
  // lampy
  PROPS.push({ type:'lamp', x:9, y:18.5 });
  PROPS.push({ type:'lamp', x:18, y:18.5 });
}

// ---------- Hráč ----------
const player = {
  wx: SPAWN_WX,
  wy: SPAWN_WY,
  vx: 0, vy: 0,
  speed: 3.4,
  angle: 0,
};

const cam = { x: player.wx, y: player.wy };
let facing = 1;   // 1 = doprava, -1 = doleva

const clamp = (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v);
// kamera se drží v hranicích mapy (na kraji se zastaví), ale když je
// obrazovka větší než svět, vystředí se.
function updateCam() {
  cam.x = WPX > VW ? clamp(player.wx, VW/2, WPX - VW/2) : WPX/2;
  cam.y = WPY > VH ? clamp(player.wy, VH/2, WPY - VH/2) : WPY/2;
}
// svět → obrazovka (ohraničený, bez wrapu)
function wts(wx, wy) { return [VW/2 + (wx - cam.x), VH/2 + (wy - cam.y)]; }
// vzdálenost (bez wrapu)
function wdist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
// mimo mapu = zeď
function isSolidAt(wx, wy) {
  const c = Math.floor(wx / TILE), r = Math.floor(wy / TILE);
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return true;
  return SOLID.has(at(c, r));
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

const joy = { active: false, id: -1, baseX: 0, baseY: 0, dx: 0, dy: 0 };
function touchStart(x, y, id) {
  if (muteBtn && Math.hypot(x - muteBtn.x, y - muteBtn.y) < muteBtn.r + 8) { toggleMute(); return; }
  if (state === 'MENU' && nickMenuBtn && x >= nickMenuBtn.x && x <= nickMenuBtn.x+nickMenuBtn.w && y >= nickMenuBtn.y && y <= nickMenuBtn.y+nickMenuBtn.h) { showNick(); return; }
  if (state === 'MENU' && lbBtn && x >= lbBtn.x && x <= lbBtn.x+lbBtn.w && y >= lbBtn.y && y <= lbBtn.y+lbBtn.h) { openSettings(); return; }
  if (state === 'MENU' && settingsBtn && x >= settingsBtn.x && x <= settingsBtn.x+settingsBtn.w && y >= settingsBtn.y && y <= settingsBtn.y+settingsBtn.h) { openSettings(); return; }
  if (state !== 'PLAYING') { startOrClick(); return; }
  if (smazakBtn && Math.hypot(x - smazakBtn.x, y - smazakBtn.y) < smazakBtn.r + 6) { throwSmazak(); return; }
  if (fryBtn && Math.hypot(x - fryBtn.x, y - fryBtn.y) < fryBtn.r + 8) { firing = true; fireTouch = id; shootCd = 0; return; }
  joy.active = true; joy.id = id; joy.baseX = x; joy.baseY = y; joy.dx = 0; joy.dy = 0;
}
function touchMove(x, y, id) {
  if (joy.active && joy.id === id) {
    let dx = x - joy.baseX, dy = y - joy.baseY;
    const max = 55, l = Math.hypot(dx, dy);
    if (l > max) { dx = dx/l*max; dy = dy/l*max; }
    joy.dx = dx; joy.dy = dy;
  }
}
function touchEnd(id) {
  if (joy.id === id) { joy.active = false; joy.id = -1; joy.dx = 0; joy.dy = 0; }
  if (fireTouch === id) { firing = false; fireTouch = -1; }
}
canvas.addEventListener('touchstart', e => { e.preventDefault(); for (const t of e.changedTouches) touchStart(t.clientX, t.clientY, t.identifier); }, {passive:false});
canvas.addEventListener('touchmove',  e => { e.preventDefault(); for (const t of e.changedTouches) touchMove(t.clientX, t.clientY, t.identifier); }, {passive:false});
canvas.addEventListener('touchend',   e => { e.preventDefault(); for (const t of e.changedTouches) touchEnd(t.identifier); }, {passive:false});
canvas.addEventListener('mousedown', e => {
  const x = e.clientX, y = e.clientY;
  if (muteBtn && Math.hypot(x - muteBtn.x, y - muteBtn.y) < muteBtn.r + 8) { toggleMute(); return; }
  if (state === 'MENU' && nickMenuBtn && x >= nickMenuBtn.x && x <= nickMenuBtn.x+nickMenuBtn.w && y >= nickMenuBtn.y && y <= nickMenuBtn.y+nickMenuBtn.h) { showNick(); return; }
  if (state === 'MENU' && lbBtn && x >= lbBtn.x && x <= lbBtn.x+lbBtn.w && y >= lbBtn.y && y <= lbBtn.y+lbBtn.h) { openSettings(); return; }
  if (state === 'MENU' && settingsBtn && x >= settingsBtn.x && x <= settingsBtn.x+settingsBtn.w && y >= settingsBtn.y && y <= settingsBtn.y+settingsBtn.h) { openSettings(); return; }
  if (state === 'PLAYING') {
    if (smazakBtn && Math.hypot(x - smazakBtn.x, y - smazakBtn.y) < smazakBtn.r + 6) { throwSmazak(); return; }
    if (fryBtn && Math.hypot(x - fryBtn.x, y - fryBtn.y) < fryBtn.r + 8) { firing = true; shootCd = 0; }
  } else startOrClick();
});
window.addEventListener('mouseup', () => { firing = false; });

// ---------- Herní stav ----------
const PLAZA_WX = 19.5 * TILE;   // střed Náměstí Míru (cogani)
const PLAZA_WY = 19.5 * TILE;

let state = 'MENU';
let menuBtn = null;
let score = 0, lives = 3;
let best = +(localStorage.getItem('smazak_best') || 0);
function saveBest() { if (score > best) { best = score; localStorage.setItem('smazak_best', best); } }
let fries = [], pigeons = [], particles = [], npcs = [], cogani = [], bags = [], smazaks = [];
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
function startOrClick() {
  if (!nick) { showNick(); return; }
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
  wave = 0; waveState = 'BREAK'; breakT = 90; boss = null; dog = null;
  bannerText = ''; bannerT = 0; perkTriple = false; perkRapid = false; smazakCd = 0;
  firing = false; fireTouch = -1;
  player.wx = SPAWN_WX; player.wy = SPAWN_WY;
  player.vx = 0; player.vy = 0; player.boostT = 0;
  updateCam();
  for (let i = 0; i < 8; i++) spawnPigeon();
  for (let i = 0; i < 4; i++) spawnBag();
  showHud(true);
  updateHud();
  setMusicVol();   // ztlum hudbu na 50 %
}
function banner(text, t) { bannerText = text; bannerT = t; }
const DEATH_MSGS = [
  'Zabili tě cigáni, okradli tě o všechno párno a tvou mrtvolu hodili do Olzy.',
  'Prodali tě Vietnamcům jako maso na kung-pao za pár gramů trávy. Aspoň k něčemu jsi byl dobrej.',
  'Peco tě sejmul mačetou a jeho pes tě dojedl. Konec smažáka.',
  'Pobodali tě na Náměstí Míru. Teď ležíš pochcanej v kaluži krve a párno je fuč.',
  'Skončil jsi v Olze tváří dolů. Holubi měli hody.',
];
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
  const p = randWalkable(280); if (p) pigeons.push({ wx: p.wx, wy: p.wy, t: Math.random()*100, hp: 1 });
}
function spawnNpc() {
  const p = randWalkable(120);
  if (p) npcs.push({ wx: p.wx, wy: p.wy, t: Math.random()*100, col: NPC_COLORS[(Math.random()*NPC_COLORS.length)|0], dir: Math.random()*Math.PI*2 });
}
function spawnCoganRing(hp = 2) {
  // spawn v prstenci kolem hráče (na pochozím místě)
  for (let tries = 0; tries < 12; tries++) {
    const ang = Math.random()*Math.PI*2;
    const dist = 420 + Math.random()*240;
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
    banner('VLNA ' + wave + ' — JDOU CIGÁNI! (' + n + ')', 120); sfx('wave', 0.6);
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
  const p = randWalkable(200); if (p) bags.push({ wx: p.wx, wy: p.wy, t: Math.random()*100 });
}

// ---------- Hranolky ----------
function shoot() {
  if (shootCd > 0) return;
  let best = null, bd = 1e9;
  // priorita: nepřátelé (cigáni + boss + pes) do 380 px
  const enemies = cogani.slice();
  if (boss) enemies.push(boss);
  if (dog) enemies.push(dog);
  for (const c of enemies) {
    const d = wdist(player.wx, player.wy, c.wx, c.wy);
    if (d < bd && d < 380) { bd = d; best = c; }
  }
  // až když není nepřítel v dosahu, miř na holuby
  if (!best) for (const p of pigeons) {
    const d = wdist(player.wx, player.wy, p.wx, p.wy);
    if (d < bd) { bd = d; best = p; }
  }
  let ang = player.angle - Math.PI/2;
  if (best) {
    let dx = best.wx - player.wx, dy = best.wy - player.wy;
    ang = Math.atan2(dy, dx);
  }
  const sp = 8;
  const angles = perkTriple ? [ang - 0.22, ang, ang + 0.22] : [ang];
  for (const a of angles)
    fries.push({ wx: player.wx, wy: player.wy, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp, life: 70 });
  shootCd = perkRapid ? 9 : 18;
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
  const R = 95;
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

  let mdx = 0, mdy = 0;
  if (joy.active && (joy.dx || joy.dy)) { mdx = joy.dx; mdy = joy.dy; }
  else {
    if (keys['ArrowLeft']  || keys['a'] || keys['A']) mdx -= 1;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) mdx += 1;
    if (keys['ArrowUp']    || keys['w'] || keys['W']) mdy -= 1;
    if (keys['ArrowDown']  || keys['s'] || keys['S']) mdy += 1;
  }
  if (player.boostT > 0) player.boostT--;
  const spd = player.speed * (player.boostT > 0 ? 2 : 1);   // párno = 200 %
  if (mdx || mdy) {
    const l = Math.hypot(mdx, mdy) || 1;
    player.vx = (mdx/l)*spd;
    player.vy = (mdy/l)*spd;
    player.angle = Math.atan2(mdy, mdx) + Math.PI/2;
    if (mdx > 0.15) facing = 1; else if (mdx < -0.15) facing = -1;
  } else { player.vx *= 0.7; player.vy *= 0.7; }

  let nx = player.wx + player.vx;
  if (!isSolidAt(nx, player.wy)) player.wx = nx;
  let ny = player.wy + player.vy;
  if (!isSolidAt(player.wx, ny)) player.wy = ny;

  updateCam();

  if (shootCd > 0) shootCd--;
  // manuální střelba: drž tlačítko hranolky / mezerník
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
    const d = chase(c, 1.5);
    if (d < 28 && hurtCd === 0) {
      lives--; hurtCd = 90; updateHud(); addShake(0.45); sfx('hurt', 0.6);
      boom(player.wx, player.wy, '#ff3b3b', 12);
      popup('🤕 Cigán tě dostal!');
      if (lives <= 0) { gameOver(); return; }
    }
  }
  // hranolky vs cogani
  for (const f of fries) {
    if (f.life <= 0) continue;
    for (const c of cogani) {
      if (c.hp > 0 && wdist(f.wx, f.wy, c.wx, c.wy) < 24) {
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
    const d = chase(boss, 1.1);
    if (d < 46 && hurtCd === 0) {
      lives--; hurtCd = 90; updateHud(); addShake(0.45); sfx('hurt', 0.6);
      boom(player.wx, player.wy, '#ff3b3b', 16);
      popup('🔪 Peco tě seknul mačetou!');
      if (lives <= 0) { gameOver(); return; }
    }
    for (const f of fries) {
      if (f.life > 0 && wdist(f.wx, f.wy, boss.wx, boss.wy) < 42) {
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
    const d = chase(dog, 2.2);
    if (d < 24 && hurtCd === 0) {
      lives--; hurtCd = 90; updateHud(); addShake(0.45); sfx('hurt', 0.6);
      boom(player.wx, player.wy, '#ff3b3b', 10);
      popup('🐕 Pečův pes tě kousnul!');
      if (lives <= 0) { gameOver(); return; }
    }
    for (const f of fries) {
      if (f.life > 0 && wdist(f.wx, f.wy, dog.wx, dog.wy) < 20) {
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
      cogani.some(c => c.hp > 0 && wdist(s.wx, s.wy, c.wx, c.wy) < 42) ||
      (boss && wdist(s.wx, s.wy, boss.wx, boss.wy) < 56) ||
      (dog  && wdist(s.wx, s.wy, dog.wx, dog.wy)  < 32);
    if (hitEnemy || s.life <= 0) { smazakBoom(s.wx, s.wy); s.dead = true; }
  }
  smazaks = smazaks.filter(s => !s.dead);

  // --- řízení vln ---
  if (waveState === 'FIGHT') {
    if (cogani.length === 0 && !boss) onWaveCleared();
  } else {
    breakT--;
    if (breakT <= 0) startNextWave();
  }

  // --- pytlíky párno (sběr) ---
  for (const b of bags) { b.t += 0.05; }
  for (const b of bags) {
    if (wdist(b.wx, b.wy, player.wx, player.wy) < 34) {
      b.got = true; bagsGot++; score += 15;
      player.boostT = 300;   // ~5 s na 60 fps
      sfx('pickup', 0.6);
      boom(player.wx, player.wy, '#ffffff', 14);
      popup('💊 Párno! 200% rychlost xd');
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
const TCOL = {
  [T.GRASS]:   '#4a7c3a',
  [T.ROAD]:    '#33333a',
  [T.SIDEWALK]:'#8d8d84',
  [T.BUILDING]:'#6b5d4f',
  [T.PLAZA]:   '#9a9086',
  [T.WATER]:   '#2f6a8f',
  [T.BRIDGE]:  '#8a7b5e',
  [T.POLAND]:  '#6f7c46',
};

// popisky míst (vypálené do mapy)
const MAP_LABELS = [
  { x: 14, y: 1.6, t: 'MĚSTSKÝ ÚŘAD', s: 15, col: '#ffe9a0' },
  { x: 13.5, y: 24, t: 'NÁMĚSTÍ ČSA', s: 13, col: '#ffffff' },
];

const isB = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS && at(c, r) === T.BUILDING;

// vykresli JEDNU dlaždici na screen pozici x,y (celá čísla)
function paintTile(g, c, r, x, y) {
  const t = at(c, r);
  const bUp = isB(c, r-1), bDown = isB(c, r+1), bLeft = isB(c-1, r), bRight = isB(c+1, r);

  g.fillStyle = TCOL[t];
  g.fillRect(x, y, TILE, TILE);

  if (t !== T.BUILDING && bUp) {
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, y, TILE, 9);
  }
  if (t === T.ROAD) {
    g.fillStyle = 'rgba(255,210,80,0.5)';
    g.fillRect(x + TILE/2 - 2, y + 12, 4, 16);
    g.fillRect(x + TILE/2 - 2, y + 36, 4, 16);
  } else if (t === T.BUILDING) {
    g.fillStyle = '#9c4f3f'; g.fillRect(x, y, TILE, TILE);     // červená střecha
    g.fillStyle = 'rgba(0,0,0,0.10)';
    for (let i = 8; i < TILE; i += 12) g.fillRect(x, y + i, TILE, 2);
    if (!bUp)   { g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x, y, TILE, 5); }
    if (!bRight){ g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + TILE-6, y, 6, TILE); }
    if (!bLeft) { g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x, y, 4, TILE); }
    if (!bDown) {
      g.fillStyle = '#d9c7a3'; g.fillRect(x, y + TILE-26, TILE, 26);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, y + TILE-26, TILE, 2);
      g.fillStyle = 'rgba(90,120,160,0.75)';
      for (const wx of [6, 24, 42]) {
        g.fillRect(x + wx, y + TILE-22, 9, 7);
        g.fillRect(x + wx, y + TILE-11, 9, 7);
      }
    } else {
      g.fillStyle = 'rgba(0,0,0,0.10)';
      g.fillRect(x + 10, y + 16, 12, 12);
      g.fillRect(x + 34, y + 16, 12, 12);
    }
  } else if (t === T.GRASS) {
    g.fillStyle = 'rgba(0,0,0,0.06)';
    g.fillRect(x + 14, y + 20, 4, 4);
    g.fillRect(x + 40, y + 44, 4, 4);
  } else if (t === T.WATER) {
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(x + 8, y + 20, 20, 3);
    g.fillRect(x + 30, y + 40, 20, 3);
  } else if (t === T.BRIDGE) {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < TILE; i += 10) g.fillRect(x, y + i, TILE, 2);
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x, y, 3, TILE); g.fillRect(x+TILE-3, y, 3, TILE);
  } else if (t === T.POLAND) {
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(x + 18, y + 26, 5, 5);
  }
}

function drawProp(p) {
  const [x, y] = wts(p.x*TILE, p.y*TILE);
  if (x < -60 || x > VW+60 || y < -60 || y > VH+60) return;
  const g = ctx; g.save(); g.translate(x, y);
  if (p.type === 'fountain') {
    const R = p.r * TILE;
    g.fillStyle = '#7d7468'; g.beginPath(); g.arc(0, 0, R, 0, Math.PI*2); g.fill();
    g.fillStyle = '#9a9086'; g.beginPath(); g.arc(0, 0, R-6, 0, Math.PI*2); g.fill();
    g.fillStyle = '#3f7fb0'; g.beginPath(); g.arc(0, 0, R-14, 0, Math.PI*2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(0, 0, 6, 0, Math.PI*2); g.fill();
  } else if (p.type === 'tree') {
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(0, 14, 16, 6, 0, 0, Math.PI*2); g.fill();
    g.fillStyle = '#2f6b2f'; g.beginPath(); g.arc(0, 0, 17, 0, Math.PI*2); g.fill();
    g.fillStyle = '#3c8a3c'; g.beginPath(); g.arc(-5, -5, 11, 0, Math.PI*2); g.fill();
  } else if (p.type === 'bench') {
    if (p.h) g.rotate(Math.PI/2);
    g.fillStyle = '#6b4a2c'; g.fillRect(-16, -5, 32, 10);
    g.fillStyle = '#5a3d24'; g.fillRect(-16, -7, 32, 3);
  } else if (p.type === 'car') {
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(-15, -9, 32, 22);
    g.fillStyle = p.col; g.fillRect(-15, -9, 30, 20);
    g.fillStyle = 'rgba(180,220,255,0.7)'; g.fillRect(-12, -5, 24, 6);
  } else if (p.type === 'stall') {
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(-20, -12, 42, 26);
    g.fillStyle = '#e8e8e8'; g.fillRect(-20, -12, 40, 24);
    g.fillStyle = '#cc3333'; for (let i=0;i<4;i++) g.fillRect(-20+i*10, -12, 5, 24);
  } else if (p.type === 'lamp') {
    g.fillStyle = '#333'; g.fillRect(-2, -2, 4, 16);
    g.fillStyle = '#ffe9a0'; g.beginPath(); g.arc(0, -4, 5, 0, Math.PI*2); g.fill();
  }
  g.restore();
}

function drawLabel(L) {
  const [x, y] = wts(L.x*TILE + TILE/2, L.y*TILE + TILE/2);
  if (x < -120 || x > VW+120 || y < -40 || y > VH+40) return;
  ctx.save(); ctx.translate(x, y); if (L.rot) ctx.rotate(L.rot);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${L.s}px Oswald, Impact, sans-serif`;
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(L.t, 0, 0);
  ctx.fillStyle = L.col || '#ffffff'; ctx.fillText(L.t, 0, 0);
  ctx.restore();
}

// vykresli JEN viditelné dlaždice (zvládne libovolně velkou mapu)
function drawMap() {
  ctx.fillStyle = '#10101c'; ctx.fillRect(0, 0, VW, VH);   // mimo mapu = tma
  const startC = Math.max(0, Math.floor((cam.x - VW/2) / TILE) - 1);
  const endC   = Math.min(COLS-1, Math.floor((cam.x + VW/2) / TILE) + 1);
  const startR = Math.max(0, Math.floor((cam.y - VH/2) / TILE) - 1);
  const endR   = Math.min(ROWS-1, Math.floor((cam.y + VH/2) / TILE) + 1);
  for (let r = startR; r <= endR; r++)
    for (let c = startC; c <= endC; c++) {
      const sx = Math.round(VW/2 + (c*TILE - cam.x));
      const sy = Math.round(VH/2 + (r*TILE - cam.y));
      paintTile(ctx, c, r, sx, sy);
    }
  for (const p of PROPS) drawProp(p);
  for (const L of MAP_LABELS) drawLabel(L);
}

function drawPlayer() {
  const cx = VW/2, cy = VH/2;
  ctx.save();
  ctx.translate(cx, cy);

  // stín pod nohama
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.beginPath(); ctx.ellipse(0, 26, 20, 7, 0, 0, Math.PI*2); ctx.fill();

  // aura párna (boost)
  if (player.boostT > 0) {
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 42);
    g.addColorStop(0, 'rgba(120,220,255,0.35)'); g.addColorStop(1, 'rgba(120,220,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 42, 0, Math.PI*2); ctx.fill();
  }

  if (charReady) {
    const moving = Math.hypot(player.vx, player.vy) > 0.4;
    const bob = moving ? Math.sin(Date.now()/110) * 2 : 0;
    const H = 72, W = H * (charImg.width / charImg.height);
    ctx.scale(facing, 1);                       // překlopení vlevo/vpravo
    ctx.drawImage(charImg, -W/2, -H + 28 + bob, W, H);
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
  const r = 46, x = VW - r - 20, y = VH - r - 120;
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
  const r = 34, x = VW - r - 36, y = VH - 290;
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

function drawJoystick() {
  if (!joy.active) return;
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(joy.baseX, joy.baseY, 55, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 0.65;
  ctx.beginPath(); ctx.arc(joy.baseX+joy.dx, joy.baseY+joy.dy, 26, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;
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

  // Pozadí: COVER (vyplní celou obrazovku, portrait obrázek sedne přesně)
  if (menuReady) {
    const ir = menuBg.width / menuBg.height;
    const cr = VW / VH;
    let w, h, x, y;
    if (cr > ir) { w = VW; h = w/ir; x = 0; y = (VH-h)/2; }
    else { h = VH; w = h*ir; x = (VW-w)/2; y = 0; }
    ctx.drawImage(menuBg, x, y, w, h);
  }

  // Tmavé přechody nahoře a dole pro čitelnost textu
  let gTop = ctx.createLinearGradient(0, 0, 0, VH*0.32);
  gTop.addColorStop(0, 'rgba(0,0,0,0.78)'); gTop.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gTop; ctx.fillRect(0, 0, VW, VH*0.32);
  let gBot = ctx.createLinearGradient(0, VH*0.55, 0, VH);
  gBot.addColorStop(0, 'rgba(0,0,0,0)'); gBot.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = gBot; ctx.fillRect(0, VH*0.55, VW, VH*0.45);

  // --- Název hry (GTA styl) ---
  const titleSize = Math.min(VW * 0.115, 56);
  gtaText('GTA 7: TĚŠÍN CITY', VW/2, VH*0.10, titleSize, '#ffd23f', '#000', 8);
  gtaText('Smažák s Hranolkama DLC', VW/2, VH*0.10 + titleSize*0.95, titleSize*0.5, '#ffffff', '#000', 5);

  // --- 3 velké karty: NOVÁ HRA / TOP SMAŽKY / NASTAVENÍ ---
  const cw = Math.min(VW*0.84, 360), ch = 64, gap = 16;
  const x0 = VW/2 - cw/2;
  let cy = VH*0.55;
  menuBtn  = menuCard(x0, cy,            cw, ch+8, '▶  NOVÁ HRA',  true,  pendingStart);
  lbBtn    = menuCard(x0, cy + ch+18,    cw, ch,   '🏆 TOP SMAŽKY', false, false);
  settingsBtn = menuCard(x0, cy + 2*(ch+18), cw, ch, '⚙️ NASTAVENÍ', false, false);

  // --- Nick (změnit) vlevo nahoře ---
  ctx.font = `600 14px Oswald, sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = '#000';
  const ntxt = '👤 ' + (nick || '—') + '  (změnit)';
  ctx.strokeText(ntxt, 14, 26); ctx.fillStyle = '#fff'; ctx.fillText(ntxt, 14, 26);
  nickMenuBtn = { x: 10, y: 12, w: ctx.measureText(ntxt).width + 12, h: 28 };

  // --- Disclaimer dole ---
  ctx.font = `600 ${Math.min(VW*0.032,13)}px Oswald, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText('Všechny události, postavy a místa jsou fiktivní.', VW/2, VH - 42);
  ctx.fillText('Jakákoliv podobnost se skutečnými osobami je čistě náhodná. xd', VW/2, VH - 24);
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
function loop() {
  // průběžně obnov globální žebříček (mimo hru, ~každých 6 s)
  if (state !== 'PLAYING' && (++lbTick % 360 === 0)) refreshLB();
  // klikací efekt menu → po doznění spusť hru
  if (pendingStart) { if (menuPress > 0) menuPress--; else { pendingStart = false; startGame(); } }
  if (hitstop > 0) hitstop--; else update();   // hitstop = mikro-zmrazení
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, VW, VH);

  if (state === 'MENU') {
    drawMenu();
    drawMuteBtn();
  } else {
    // screen shake: posuň svět (ne UI) podle trauma²
    const s = trauma * trauma * 16;
    const shx = Math.round((Math.random()*2-1) * s), shy = Math.round((Math.random()*2-1) * s);
    ctx.save();
    ctx.translate(shx, shy);
    drawMap();
    drawParticles();
    drawBags();
    drawPigeons();
    drawSmazaks();
    drawCogani();
    drawDog();
    drawBoss();
    drawFries();
    drawPlayer();
    ctx.restore();
    // UI bez otřesu
    drawPopups();
    drawBanner();
    drawBossHpBar();
    drawFryBtn();
    drawSmazakBtn();
    drawMuteBtn();
    drawJoystick();
    if (state === 'OVER') drawGameOver();
  }
  requestAnimationFrame(loop);
}

buildMap();
showHud(false);
loop();
refreshLB();             // načti globální žebříček
if (!nick) showNick();   // poprvé: vyžádej nick

// pokus spustit hudbu hned při načtení (pokud prohlížeč povolí autoplay);
// jinak naskočí při prvním dotyku přes listenery výše
startMusic();
