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
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
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

// ---------- HUD ----------
const ui = document.getElementById('ui');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
function showHud(on) { if (ui) ui.style.display = on ? 'flex' : 'none'; }

// ---------- Svět ----------
const TILE = 64;
const COLS = 32, ROWS = 32;
const WPX = COLS * TILE;
const WPY = ROWS * TILE;

const T = { GRASS:0, ROAD:1, SIDEWALK:2, BUILDING:3, PLAZA:4, WATER:5 };
const SOLID = new Set([T.BUILDING, T.WATER]);

let map = new Int8Array(COLS * ROWS);
const at = (c, r) => map[r * COLS + c];
function fill(c0, r0, c1, r1, t) {
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++)
      if (c >= 0 && c < COLS && r >= 0 && r < ROWS) map[r * COLS + c] = t;
}

function buildMap() {
  map.fill(T.GRASS);

  const HROADS = [6, 15, 24];
  const VROADS = [6, 15, 24];
  for (const r of HROADS) { fill(0, r-1, COLS-1, r-1, T.SIDEWALK); fill(0, r+1, COLS-1, r+1, T.SIDEWALK); }
  for (const c of VROADS) { fill(c-1, 0, c-1, ROWS-1, T.SIDEWALK); fill(c+1, 0, c+1, ROWS-1, T.SIDEWALK); }
  for (const r of HROADS) fill(0, r, COLS-1, r, T.ROAD);
  for (const c of VROADS) fill(c, 0, c, ROWS-1, T.ROAD);

  // bloky budov mezi silnicemi
  blockBuildings(8, 8, 13, 13);
  blockBuildings(17, 8, 22, 13);
  blockBuildings(8, 17, 13, 22);
  blockBuildings(8, 26, 13, 30);
  blockBuildings(26, 8, 30, 13);
  blockBuildings(26, 17, 30, 22);

  // Náměstí Míru
  fill(17, 17, 22, 22, T.PLAZA);

  // Řeka Olza na východě
  fill(29, 0, 31, ROWS-1, T.WATER);
}
function blockBuildings(c0, r0, c1, r1) {
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++)
      if (at(c, r) === T.GRASS) map[r * COLS + c] = T.BUILDING;
}

// ---------- Hráč ----------
const player = {
  wx: 7 * TILE + 32,
  wy: 8 * TILE + 32,
  vx: 0, vy: 0,
  speed: 3.4,
  angle: 0,
};

const cam = { x: player.wx, y: player.wy };
let facing = 1;   // 1 = doprava, -1 = doleva

function wts(wx, wy) {
  let dx = wx - cam.x, dy = wy - cam.y;
  if (dx >  WPX/2) dx -= WPX;
  if (dx < -WPX/2) dx += WPX;
  if (dy >  WPY/2) dy -= WPY;
  if (dy < -WPY/2) dy += WPY;
  return [VW/2 + dx, VH/2 + dy];
}
function wdist(ax, ay, bx, by) {
  let dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
  if (dx > WPX/2) dx = WPX - dx;
  if (dy > WPY/2) dy = WPY - dy;
  return Math.hypot(dx, dy);
}
function isSolidAt(wx, wy) {
  const c = ((Math.floor(wx/TILE) % COLS) + COLS) % COLS;
  const r = ((Math.floor(wy/TILE) % ROWS) + ROWS) % ROWS;
  return SOLID.has(at(c, r));
}

// ---------- Vstup ----------
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  if ((e.key === 'Enter' || e.key === ' ') && state !== 'PLAYING') startGame();
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

const joy = { active: false, id: -1, baseX: 0, baseY: 0, dx: 0, dy: 0 };
function touchStart(x, y, id) {
  if (state !== 'PLAYING') { startGame(); return; }
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
}
canvas.addEventListener('touchstart', e => { e.preventDefault(); for (const t of e.changedTouches) touchStart(t.clientX, t.clientY, t.identifier); }, {passive:false});
canvas.addEventListener('touchmove',  e => { e.preventDefault(); for (const t of e.changedTouches) touchMove(t.clientX, t.clientY, t.identifier); }, {passive:false});
canvas.addEventListener('touchend',   e => { e.preventDefault(); for (const t of e.changedTouches) touchEnd(t.identifier); }, {passive:false});
canvas.addEventListener('mousedown', () => { if (state !== 'PLAYING') startGame(); });

// ---------- Herní stav ----------
const PLAZA_WX = 19.5 * TILE;   // střed Náměstí Míru (cogani)
const PLAZA_WY = 19.5 * TILE;

let state = 'MENU';
let menuBtn = null;
let score = 0, lives = 3;
let fries = [], pigeons = [], particles = [], npcs = [], cogani = [], bags = [];
let shootCd = 0, pigKills = 0, coganKills = 0, bagsGot = 0;
let hurtCd = 0;          // nezranitelnost po zásahu
let popups = [];         // krátké hlášky na obrazovce

// barvy triček chodců
const NPC_COLORS = ['#c0392b','#2980b9','#27ae60','#8e44ad','#d35400','#16a085'];

function startGame() {
  state = 'PLAYING';
  score = 0; lives = 3; pigKills = 0; coganKills = 0; bagsGot = 0; hurtCd = 0;
  fries = []; pigeons = []; particles = []; npcs = []; cogani = []; bags = []; popups = [];
  player.wx = 7*TILE+32; player.wy = 8*TILE+32;
  player.vx = 0; player.vy = 0; player.boostT = 0;
  cam.x = player.wx; cam.y = player.wy;
  for (let i = 0; i < 8; i++) spawnPigeon();
  for (let i = 0; i < 7; i++) spawnNpc();
  for (let i = 0; i < 5; i++) spawnCogan();
  for (let i = 0; i < 4; i++) spawnBag();
  showHud(true);
  updateHud();
}
function gameOver() { state = 'OVER'; showHud(false); }
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
function spawnCogan() {
  // spawn poblíž náměstí
  for (let tries = 0; tries < 30; tries++) {
    const wx = PLAZA_WX + (Math.random()-0.5)*6*TILE;
    const wy = PLAZA_WY + (Math.random()-0.5)*6*TILE;
    if (isSolidAt(wx, wy)) continue;
    cogani.push({ wx: (wx+WPX)%WPX, wy: (wy+WPY)%WPY, t: Math.random()*100, hp: 2, hit: 0 });
    return;
  }
}
function spawnBag() {
  const p = randWalkable(200); if (p) bags.push({ wx: p.wx, wy: p.wy, t: Math.random()*100 });
}

// ---------- Hranolky ----------
function shoot() {
  if (shootCd > 0) return;
  let best = null, bd = 1e9;
  for (const p of pigeons) {
    const d = wdist(player.wx, player.wy, p.wx, p.wy);
    if (d < bd) { bd = d; best = p; }
  }
  for (const c of cogani) {            // auto-aim míří i na cogany (do 320 px)
    const d = wdist(player.wx, player.wy, c.wx, c.wy);
    if (d < bd && d < 320) { bd = d; best = c; }
  }
  let ang = player.angle - Math.PI/2;
  if (best) {
    let dx = best.wx - player.wx, dy = best.wy - player.wy;
    if (dx >  WPX/2) dx -= WPX; if (dx < -WPX/2) dx += WPX;
    if (dy >  WPY/2) dy -= WPY; if (dy < -WPY/2) dy += WPY;
    ang = Math.atan2(dy, dx);
  }
  const sp = 8;
  fries.push({ wx: player.wx, wy: player.wy, vx: Math.cos(ang)*sp, vy: Math.sin(ang)*sp, life: 70 });
  shootCd = 18;
}
function boom(wx, wy, col, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random()*Math.PI*2, s = 1 + Math.random()*3;
    particles.push({ wx, wy, vx: Math.cos(a)*s, vy: Math.sin(a)*s, life: 24, col });
  }
}

// ---------- Update ----------
function update() {
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
  if (!isSolidAt(nx, player.wy)) player.wx = (nx + WPX) % WPX;
  let ny = player.wy + player.vy;
  if (!isSolidAt(player.wx, ny)) player.wy = (ny + WPY) % WPY;

  cam.x = player.wx; cam.y = player.wy;

  if (shootCd > 0) shootCd--;
  if (pigeons.length && shootCd === 0) shoot();

  for (const f of fries) {
    f.wx = (f.wx + f.vx + WPX) % WPX;
    f.wy = (f.wy + f.vy + WPY) % WPY;
    f.life--;
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
    let npx = (p.wx + vx + WPX) % WPX;
    let npy = (p.wy + vy + WPY) % WPY;
    if (!isSolidAt(npx, p.wy)) p.wx = npx;
    if (!isSolidAt(p.wx, npy)) p.wy = npy;
  }
  pigeons = pigeons.filter(p => p.hp > 0);
  while (pigeons.length < 8) spawnPigeon();

  // --- chodci (ambient) ---
  for (const n of npcs) {
    n.t += 0.02;
    if (Math.random() < 0.01) n.dir = Math.random()*Math.PI*2;
    const vx = Math.cos(n.dir)*0.7, vy = Math.sin(n.dir)*0.7;
    let nxp = (n.wx + vx + WPX) % WPX, nyp = (n.wy + vy + WPY) % WPY;
    if (!isSolidAt(nxp, n.wy)) n.wx = nxp; else n.dir = Math.random()*Math.PI*2;
    if (!isSolidAt(n.wx, nyp)) n.wy = nyp;
  }

  // --- cogani (nepřátelé u náměstí) ---
  if (hurtCd > 0) hurtCd--;
  for (const c of cogani) {
    c.t += 0.05;
    if (c.hit > 0) c.hit--;
    const d = wdist(c.wx, c.wy, player.wx, player.wy);
    let vx, vy;
    if (d < 260) {
      // honí hráče
      let dx = player.wx - c.wx, dy = player.wy - c.wy;
      if (dx >  WPX/2) dx -= WPX; if (dx < -WPX/2) dx += WPX;
      if (dy >  WPY/2) dy -= WPY; if (dy < -WPY/2) dy += WPY;
      const l = Math.hypot(dx, dy) || 1;
      vx = dx/l*1.5; vy = dy/l*1.5;
    } else {
      // courá kolem náměstí
      vx = Math.cos(c.t)*0.6; vy = Math.sin(c.t*1.2)*0.6;
    }
    let cxp = (c.wx + vx + WPX) % WPX, cyp = (c.wy + vy + WPY) % WPY;
    if (!isSolidAt(cxp, c.wy)) c.wx = cxp;
    if (!isSolidAt(c.wx, cyp)) c.wy = cyp;
    // kontakt = ztráta života
    if (d < 28 && hurtCd === 0) {
      lives--; hurtCd = 90; updateHud();
      boom(player.wx, player.wy, '#ff3b3b', 12);
      popup('🤕 Cogan tě dostal!');
      if (lives <= 0) { gameOver(); return; }
    }
  }
  // hranolky vs cogani
  for (const f of fries) {
    if (f.life <= 0) continue;
    for (const c of cogani) {
      if (c.hp > 0 && wdist(f.wx, f.wy, c.wx, c.wy) < 24) {
        c.hp--; c.hit = 10; f.life = 0;
        boom(c.wx, c.wy, '#e8a020', 8);
        if (c.hp <= 0) { score += 25; coganKills++; updateHud(); boom(c.wx, c.wy, '#ff3b3b', 14); }
      }
    }
  }
  cogani = cogani.filter(c => c.hp > 0);
  while (cogani.length < 5) spawnCogan();

  // --- pytlíky párno (sběr) ---
  for (const b of bags) { b.t += 0.05; }
  for (const b of bags) {
    if (wdist(b.wx, b.wy, player.wx, player.wy) < 26) {
      b.got = true; bagsGot++; score += 15;
      player.boostT = 300;   // ~5 s na 60 fps
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
};

function drawMap() {
  const halfW = VW/2, halfH = VH/2;
  const startC = Math.floor((cam.x - halfW)/TILE) - 1;
  const endC   = Math.floor((cam.x + halfW)/TILE) + 1;
  const startR = Math.floor((cam.y - halfH)/TILE) - 1;
  const endR   = Math.floor((cam.y + halfH)/TILE) + 1;

  for (let r = startR; r <= endR; r++) {
    for (let c = startC; c <= endC; c++) {
      const cc = ((c % COLS) + COLS) % COLS;
      const rr = ((r % ROWS) + ROWS) % ROWS;
      const t = at(cc, rr);
      const [sx, sy] = wts(c*TILE + TILE/2, r*TILE + TILE/2);
      const x = sx - TILE/2, y = sy - TILE/2;
      ctx.fillStyle = TCOL[t];
      ctx.fillRect(x, y, TILE, TILE);

      if (t === T.ROAD) {
        ctx.fillStyle = 'rgba(255,210,80,0.5)';
        ctx.fillRect(x + TILE/2 - 2, y + 12, 4, 16);
        ctx.fillRect(x + TILE/2 - 2, y + 36, 4, 16);
      } else if (t === T.BUILDING) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(x, y, TILE, 6);
        ctx.fillStyle = 'rgba(255,220,150,0.5)';
        ctx.fillRect(x + 10, y + 16, 10, 12);
        ctx.fillRect(x + 36, y + 16, 10, 12);
        ctx.fillRect(x + 10, y + 38, 10, 12);
        ctx.fillRect(x + 36, y + 38, 10, 12);
      } else if (t === T.GRASS) {
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fillRect(x + 14, y + 20, 4, 4);
        ctx.fillRect(x + 40, y + 44, 4, 4);
      } else if (t === T.WATER) {
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(x + 8, y + 20, 20, 3);
        ctx.fillRect(x + 30, y + 40, 20, 3);
      }
    }
  }
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

// malá top-down postavička (hlava + tričko)
function drawLittlePerson(x, y, shirt, bob) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(x, y+12, 11, 4, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = shirt;                                  // tělo
  ctx.beginPath(); ctx.roundRect(x-9, y-4+bob, 18, 18, 6); ctx.fill();
  ctx.fillStyle = '#e8c39a';                              // hlava
  ctx.beginPath(); ctx.arc(x, y-8+bob, 7, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y-8+bob, 7, 0, Math.PI*2); ctx.stroke();
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
    const flash = c.hit > 0 ? '#ffffff' : '#222';         // tmavá mikina, blikne při zásahu
    drawLittlePerson(x, y, flash, Math.sin(c.t*5)*2);
    // kšiltovka
    ctx.fillStyle = c.hit > 0 ? '#ffffff' : '#111';
    ctx.fillRect(x-7, y-15, 14, 4);
    // health pruh
    if (c.hp < 2) { ctx.fillStyle = '#e74c3c'; ctx.fillRect(x-9, y-20, 18*(c.hp/2), 3); }
  }
}

function drawBags() {
  for (const b of bags) {
    const [x, y] = wts(b.wx, b.wy);
    if (x < -40 || x > VW+40 || y < -40 || y > VH+40) continue;
    const pulse = 1 + Math.sin(b.t*3)*0.08;
    ctx.save(); ctx.translate(x, y); ctx.scale(pulse, pulse);
    // sáček
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.roundRect(-9, -7, 18, 16, 3); ctx.fill();
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1; ctx.stroke();
    // bílý prášek uvnitř
    ctx.fillStyle = '#f2f2f2';
    ctx.beginPath(); ctx.moveTo(-7, 8); ctx.lineTo(7, 8); ctx.lineTo(4, 0); ctx.lineTo(-4, 0); ctx.fill();
    // nápis PÁRNO
    ctx.fillStyle = '#c0392b'; ctx.font = 'bold 5px Oswald, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('PÁRNO', 0, -3);
    ctx.restore();
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

  // --- Tlačítko NOVÁ KRA ---
  const bw = Math.min(VW*0.7, 300), bh = 64;
  const bx = (VW-bw)/2, by = VH*0.74;
  const pulse = 0.5 + 0.5*Math.sin(Date.now()/400);
  ctx.save();
  ctx.shadowColor = `rgba(255,210,63,${0.4+pulse*0.4})`;
  ctx.shadowBlur = 18 + pulse*14;
  ctx.fillStyle = '#1c1c12';
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 14); ctx.fill();
  ctx.restore();
  ctx.lineWidth = 3; ctx.strokeStyle = '#ffd23f';
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 14); ctx.stroke();
  gtaText('▶  NOVÁ HRA', VW/2, by + bh/2 + 1, 30, '#ffd23f', '#000', 5);
  menuBtn = { x: bx, y: by, w: bw, h: bh };

  // --- Disclaimer dole ---
  ctx.font = `600 ${Math.min(VW*0.032,13)}px Oswald, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText('Všechny události, postavy a místa jsou fiktivní.', VW/2, VH - 42);
  ctx.fillText('Jakákoliv podobnost se skutečnými osobami je čistě náhodná. xd', VW/2, VH - 24);
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, VW, VH);
  gtaText('KONEC HRY', VW/2, VH/2 - 40, 52, '#ff3b3b', '#000', 7);
  gtaText(`SKÓRE: ${score}`, VW/2, VH/2 + 20, 34, '#ffd700');
  gtaText('TAPNI PRO NOVOU HRU', VW/2, VH/2 + 80, 22, '#fff');
}

// ---------- Smyčka ----------
function loop() {
  update();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, VW, VH);

  if (state === 'MENU') {
    drawMenu();
  } else {
    drawMap();
    drawParticles();
    drawBags();
    drawNpcs();
    drawPigeons();
    drawCogani();
    drawFries();
    drawPlayer();
    drawPopups();
    drawJoystick();
    if (state === 'OVER') drawGameOver();
  }
  requestAnimationFrame(loop);
}

buildMap();
showHud(false);
loop();
