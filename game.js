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
  const dpr = Math.min(window.devicePixelRatio || 1, 2);   // strop DPR 2 = méně sekání
  // čteme SKUTEČNOU velikost canvasu (CSS 100%) — spolehlivé i po otočení na iOS
  VW = canvas.clientWidth  || window.innerWidth;
  VH = canvas.clientHeight || window.innerHeight;
  canvas.width  = Math.round(VW * dpr);
  canvas.height = Math.round(VH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingQuality = 'high';
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => { resize(); setTimeout(resize, 250); setTimeout(resize, 600); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

// ---------- Assets ----------
const charImg = new Image(); charImg.src = 'assets/simmy_char.png';
const menuBg  = new Image(); menuBg.src  = 'assets/menu_bg.png';
const mapImg  = new Image(); mapImg.src  = 'assets/map.png';
let charReady = false; charImg.onload = () => charReady = true;
let menuReady = false; menuBg.onload  = () => menuReady = true;
let mapReady  = false, mapFailed = false;
mapImg.onload  = () => mapReady = true;
mapImg.onerror = () => mapFailed = true;
// pojistka: kdyby se mapa nenačetla do 8 s (slabý mobil), hraj na zelené zemi místo zaseknutí
setTimeout(() => { if (!mapReady) mapFailed = true; }, 8000);

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

// ---------- Svět (reálný Český Těšín — obrázek + kolize z OSM) ----------
const WPX = MAP_IMG_W, WPY = MAP_IMG_H;   // svět = pixely mapy
const ZOOM = 2.1;                          // přiblížení (mapa je teď ve velkém měřítku 3,6 px/m)
const COMBAT = true;                       // Fáze B = boj zapnut
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
let aimAngle = 0;

function menuButtonsHit(x, y) {
  if (nickMenuBtn && inRect(x, y, nickMenuBtn)) { showNick(); return true; }
  if (lbBtn && inRect(x, y, lbBtn)) { openSettings(); return true; }
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
canvas.addEventListener('touchstart', e => { e.preventDefault(); for (const t of e.changedTouches) touchStart(t.clientX, t.clientY, t.identifier); }, {passive:false});
canvas.addEventListener('touchmove',  e => { e.preventDefault(); for (const t of e.changedTouches) touchMove(t.clientX, t.clientY, t.identifier); }, {passive:false});
canvas.addEventListener('touchend',   e => { e.preventDefault(); for (const t of e.changedTouches) touchEnd(t.identifier); }, {passive:false});
canvas.addEventListener('mousedown', e => {
  const x = e.clientX, y = e.clientY;
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
  wave = 0; waveState = 'BREAK'; breakT = 90; boss = null; dog = null;
  bannerText = ''; bannerT = 0; perkTriple = false; perkRapid = false; smazakCd = 0;
  firing = false; fireTouch = -1;
  player.wx = SPAWN_WX; player.wy = SPAWN_WY;
  player.vx = 0; player.vy = 0; player.boostT = 0;
  updateCam();
  if (COMBAT) { for (let i = 0; i < 5; i++) spawnBag(); }   // párno po městě; cigáni přijdou ve vlnách
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
function spawnNpc() {
  const p = randWalkable(120);
  if (p) npcs.push({ wx: p.wx, wy: p.wy, t: Math.random()*100, col: NPC_COLORS[(Math.random()*NPC_COLORS.length)|0], dir: Math.random()*Math.PI*2 });
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
  if (moveJoy.active && (moveJoy.dx || moveJoy.dy)) { mdx = moveJoy.dx; mdy = moveJoy.dy; }
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
    if (mdx > 0.15) facing = 1; else if (mdx < -0.15) facing = -1;
  } else { player.vx *= 0.7; player.vy *= 0.7; }

  let nx = player.wx + player.vx;
  if (!isSolidAt(nx, player.wy)) player.wx = nx;
  let ny = player.wy + player.vy;
  if (!isSolidAt(player.wx, ny)) player.wy = ny;

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
// vykresli JEN viditelné dlaždice (zvládne libovolně velkou mapu)
function drawMap() {
  if (mapFailed) { ctx.fillStyle = '#5f7d4a'; ctx.fillRect(0, 0, VW, VH); return; }  // pojistka: zelená zem
  ctx.fillStyle = '#10101c'; ctx.fillRect(0, 0, VW, VH);   // mimo mapu = tma
  if (!mapReady) {
    ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 22px Oswald, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Načítám Těšín…', VW/2, VH/2);
    return;
  }
  // viditelný výřez (zoom). Obrázek může být menší než logický svět → přepočet zdroje.
  const ssx = mapImg.width / WPX, ssy = mapImg.height / WPY;
  const srcW = VW/ZOOM, srcH = VH/ZOOM;
  const sx = clamp(cam.x - srcW/2, 0, Math.max(0, WPX - srcW));
  const sy = clamp(cam.y - srcH/2, 0, Math.max(0, WPY - srcH));
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(mapImg, sx*ssx, sy*ssy, srcW*ssx, srcH*ssy, 0, 0, VW, VH);
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
