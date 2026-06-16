'use strict';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const livesEl = document.getElementById('lives');
const scoreEl = document.getElementById('score');
const powerEl = document.getElementById('power-indicator');

// ── Responsive canvas ──────────────────────────────────────────────
function resize() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width  = W;
  canvas.height = H;
}
window.addEventListener('resize', resize);
resize();

// ── Assets ─────────────────────────────────────────────────────────
const simImg = new Image();
simImg.src = 'assets/simmy.jpeg';

let music = null;
function tryLoadMusic() {
  try {
    music = new Audio('assets/music.mp3');
    music.loop = true;
    music.volume = 0.4;
  } catch(e) {}
}
tryLoadMusic();

// ── Game constants ──────────────────────────────────────────────────
const MAX_LIVES    = 3;
const SHOOT_RATE   = 35;   // frames between shots (normal)
const SHOOT_FAST   = 10;   // frames (powered up)
const POWER_FRAMES = 600;  // 10s at 60fps
const FRIES_SPEED  = 8;
const ENEMY_BASE_SPEED = 1.2;
const SPAWN_INTERVAL = 80; // frames

// ── State ───────────────────────────────────────────────────────────
let state = 'MENU'; // MENU | PLAYING | DEAD
let score = 0;
let lives = MAX_LIVES;
let frame = 0;
let hiScore = +(localStorage.getItem('smazak_hi') || 0);

const player = {
  x: 0, y: 0,
  vx: 0, vy: 0,
  speed: 3,
  shootTimer: 0,
  powered: false,
  powerTimer: 0,
  angle: 0,
};

let fries   = [];
let enemies = [];
let bags    = [];  // pytlíčky
let particles = [];

// ── Joystick ────────────────────────────────────────────────────────
const joy = {
  active: false,
  id: null,
  ox: 0, oy: 0,
  dx: 0, dy: 0,
};

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (state === 'MENU' || state === 'DEAD') { startGame(); return; }
    if (!joy.active) {
      joy.active = true;
      joy.id = t.identifier;
      joy.ox = t.clientX;
      joy.oy = t.clientY;
      joy.dx = 0;
      joy.dy = 0;
    }
  }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) {
      joy.dx = t.clientX - joy.ox;
      joy.dy = t.clientY - joy.oy;
      const len = Math.hypot(joy.dx, joy.dy);
      const max = 60;
      if (len > max) {
        joy.dx = (joy.dx / len) * max;
        joy.dy = (joy.dy / len) * max;
      }
    }
  }
}, { passive: false });

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) {
      joy.active = false;
      joy.dx = 0;
      joy.dy = 0;
    }
  }
}, { passive: false });

// Mouse fallback for desktop testing
canvas.addEventListener('mousedown', e => {
  if (state !== 'PLAYING') { startGame(); return; }
  joy.active = true;
  joy.ox = e.clientX;
  joy.oy = e.clientY;
  joy.dx = 0; joy.dy = 0;
});
canvas.addEventListener('mousemove', e => {
  if (!joy.active) return;
  joy.dx = e.clientX - joy.ox;
  joy.dy = e.clientY - joy.oy;
  const len = Math.hypot(joy.dx, joy.dy);
  if (len > 60) { joy.dx = joy.dx/len*60; joy.dy = joy.dy/len*60; }
});
canvas.addEventListener('mouseup', () => { joy.active = false; joy.dx = 0; joy.dy = 0; });

// ── Helpers ─────────────────────────────────────────────────────────
function rand(min, max) { return min + Math.random() * (max - min); }
function dist(a, b)     { return Math.hypot(a.x - b.x, a.y - b.y); }

function spawnParticle(x, y, color) {
  for (let i = 0; i < 8; i++) {
    const a = rand(0, Math.PI * 2);
    particles.push({
      x, y,
      vx: Math.cos(a) * rand(1, 4),
      vy: Math.sin(a) * rand(1, 4),
      life: 30,
      color,
      r: rand(3, 7),
    });
  }
}

function spawnEnemy() {
  const W = canvas.width, H = canvas.height;
  let x, y;
  const side = Math.floor(rand(0, 4));
  if (side === 0) { x = rand(0, W); y = -30; }
  else if (side === 1) { x = W + 30; y = rand(0, H); }
  else if (side === 2) { x = rand(0, W); y = H + 30; }
  else { x = -30; y = rand(0, H); }

  const speed = ENEMY_BASE_SPEED + score / 800;
  enemies.push({ x, y, speed, hp: 1, wobble: rand(0, Math.PI * 2) });
}

function spawnBag() {
  const W = canvas.width, H = canvas.height;
  bags.push({
    x: rand(60, W - 60),
    y: rand(60, H - 60),
    bob: rand(0, Math.PI * 2),
  });
}

// ── Game init ────────────────────────────────────────────────────────
function startGame() {
  score = 0;
  lives = MAX_LIVES;
  frame = 0;
  fries   = [];
  enemies = [];
  bags    = [];
  particles = [];
  player.x = canvas.width  / 2;
  player.y = canvas.height / 2;
  player.vx = 0; player.vy = 0;
  player.powered = false;
  player.powerTimer = 0;
  player.shootTimer = 0;
  player.angle = 0;
  state = 'PLAYING';
  if (music) { music.currentTime = 0; music.play().catch(() => {}); }
}

// ── Draw: Šimmy Prznič (South Park styl) ─────────────────────────────
function drawPlayer() {
  const { x, y, angle, powered } = player;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  const sc = powered ? 1 + 0.05 * Math.sin(frame * 0.3) : 1;
  ctx.scale(sc, sc);

  // Shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 10;

  // Nohičky
  ctx.fillStyle = '#1a1a3a';
  ctx.beginPath(); ctx.ellipse(-10, 30, 7, 10, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(10,  30, 7, 10, 0, 0, Math.PI*2); ctx.fill();

  // Trup (South Park vajíčko)
  ctx.fillStyle = '#3a3a8a';
  ctx.beginPath(); ctx.ellipse(0, 12, 18, 22, 0, 0, Math.PI*2); ctx.fill();

  // Proužek na mikině
  ctx.strokeStyle = '#5555cc';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-18, 8); ctx.lineTo(18, 8); ctx.stroke();

  // Levá ruka - FLAŠKA PIVA
  ctx.save();
  ctx.translate(-24, 8);
  ctx.rotate(-0.3);
  // ruka
  ctx.fillStyle = '#f5c5a0';
  ctx.beginPath(); ctx.ellipse(0, 0, 5, 12, 0, 0, Math.PI*2); ctx.fill();
  // flaška
  ctx.fillStyle = '#c8a012';
  ctx.fillRect(-4, 8, 8, 18);
  ctx.fillStyle = '#d4b020';
  ctx.beginPath(); ctx.ellipse(0, 8, 4, 3, 0, 0, Math.PI*2); ctx.fill();
  // pěna
  ctx.fillStyle = '#fffde7';
  ctx.beginPath(); ctx.ellipse(0, 5, 4, 5, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  // Pravá ruka
  ctx.save();
  ctx.translate(24, 8);
  ctx.rotate(0.3);
  ctx.fillStyle = '#f5c5a0';
  ctx.beginPath(); ctx.ellipse(0, 0, 5, 12, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  ctx.restore(); // end shadow

  // Hlava - kulatý clip z fotky Šimmyho
  const HEAD_R = 24;
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, -18, HEAD_R, 0, Math.PI * 2);
  ctx.clip();
  if (simImg.complete && simImg.naturalWidth > 0) {
    // Crop na obličej - horní 60% fotky
    const iw = simImg.naturalWidth;
    const ih = simImg.naturalHeight;
    ctx.drawImage(simImg, iw*0.1, 0, iw*0.8, ih*0.65, -HEAD_R, -18-HEAD_R, HEAD_R*2, HEAD_R*2);
  } else {
    ctx.fillStyle = '#f5c5a0';
    ctx.fillRect(-HEAD_R, -18-HEAD_R, HEAD_R*2, HEAD_R*2);
  }
  ctx.restore();

  // Outline hlavy
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -18, HEAD_R, 0, Math.PI * 2);
  ctx.stroke();

  // Cigareta v puse
  ctx.save();
  ctx.translate(14, -12);
  ctx.rotate(0.2);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 16, 3);
  ctx.fillStyle = '#ff4400';
  ctx.beginPath(); ctx.arc(17, 1.5, 3, 0, Math.PI*2); ctx.fill();
  // Dým
  if (frame % 20 < 10) {
    ctx.fillStyle = 'rgba(200,200,200,0.5)';
    ctx.beginPath(); ctx.arc(20, -4, 5, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();

  // Power-up aura
  if (powered) {
    ctx.strokeStyle = `hsl(${frame*10 % 360}, 100%, 60%)`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 36, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

// ── Draw: Holub (nepřítel) ─────────────────────────────────────────
function drawEnemy(e) {
  const wobble = Math.sin(frame * 0.15 + e.wobble) * 3;
  ctx.save();
  ctx.translate(e.x, e.y + wobble);

  // Tělo holuba
  ctx.fillStyle = '#888';
  ctx.beginPath(); ctx.ellipse(0, 0, 13, 10, 0, 0, Math.PI*2); ctx.fill();

  // Hlava
  ctx.fillStyle = '#aaa';
  ctx.beginPath(); ctx.arc(-10, -6, 7, 0, Math.PI*2); ctx.fill();

  // Zobák
  ctx.fillStyle = '#e8a040';
  ctx.beginPath();
  ctx.moveTo(-16, -6);
  ctx.lineTo(-20, -4);
  ctx.lineTo(-16, -2);
  ctx.closePath(); ctx.fill();

  // Oči (červené - jsou to zlí holubi)
  ctx.fillStyle = '#ff2020';
  ctx.beginPath(); ctx.arc(-11, -8, 2, 0, Math.PI*2); ctx.fill();

  // Křídla
  ctx.fillStyle = '#666';
  ctx.beginPath();
  ctx.ellipse(3, -8, 10, 5, -0.4, 0, Math.PI*2); ctx.fill();
  ctx.beginPath();
  ctx.ellipse(3,  8, 10, 5,  0.4, 0, Math.PI*2); ctx.fill();

  ctx.restore();
}

// ── Draw: Hranolka ──────────────────────────────────────────────────
function drawFry(f) {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.angle);
  ctx.fillStyle = '#ffd700';
  ctx.strokeStyle = '#b8860b';
  ctx.lineWidth = 1;
  ctx.fillRect(-3, -10, 6, 20);
  ctx.strokeRect(-3, -10, 6, 20);
  ctx.restore();
}

// ── Draw: Pytlíček ─────────────────────────────────────────────────
function drawBag(b) {
  const bob = Math.sin(frame * 0.05 + b.bob) * 4;
  ctx.save();
  ctx.translate(b.x, b.y + bob);

  // pytlíček
  ctx.fillStyle = '#f0f0f0';
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-10, -8);
  ctx.lineTo(-12, 10);
  ctx.lineTo(12, 10);
  ctx.lineTo(10, -8);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // zavázání
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-10, -8);
  ctx.quadraticCurveTo(0, -16, 10, -8);
  ctx.stroke();

  // otazník (pochybný obsah)
  ctx.fillStyle = '#999';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 0, 2);

  ctx.restore();
}

// ── Draw: Mapa (dlažba Těšína) ─────────────────────────────────────
function drawMap() {
  const W = canvas.width, H = canvas.height;

  // Asfalt
  ctx.fillStyle = '#2d4a1e';
  ctx.fillRect(0, 0, W, H);

  // Grid (dlažební kostky)
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  const gs = 48;
  for (let x = 0; x < W; x += gs) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += gs) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Název v rohu
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('TĚŠÍN CITY', 12, H - 12);
}

// ── Update ─────────────────────────────────────────────────────────
function update() {
  frame++;

  // Hráč pohyb
  const jmax = 60;
  if (joy.active && (joy.dx !== 0 || joy.dy !== 0)) {
    const len = Math.hypot(joy.dx, joy.dy);
    player.vx = (joy.dx / jmax) * player.speed;
    player.vy = (joy.dy / jmax) * player.speed;
    player.angle = Math.atan2(joy.dy, joy.dx) + Math.PI / 2;
  } else {
    player.vx *= 0.8;
    player.vy *= 0.8;
  }

  player.x = Math.max(30, Math.min(canvas.width  - 30, player.x + player.vx));
  player.y = Math.max(30, Math.min(canvas.height - 30, player.y + player.vy));

  // Power-up timer
  if (player.powered) {
    player.powerTimer--;
    if (player.powerTimer <= 0) {
      player.powered = false;
      powerEl.classList.add('hidden');
    }
  }

  // Auto-aim + střelba
  const shootRate = player.powered ? SHOOT_FAST : SHOOT_RATE;
  player.shootTimer++;
  if (player.shootTimer >= shootRate && enemies.length > 0) {
    player.shootTimer = 0;
    // Najdi nejbližšího
    let target = null, minD = Infinity;
    for (const e of enemies) {
      const d = dist(player, e);
      if (d < minD) { minD = d; target = e; }
    }
    if (target) {
      const a = Math.atan2(target.y - player.y, target.x - player.x);
      fries.push({ x: player.x, y: player.y, vx: Math.cos(a)*FRIES_SPEED, vy: Math.sin(a)*FRIES_SPEED, angle: a });
      player.angle = a + Math.PI / 2;
    }
  }

  // Pohyb hranolek
  fries = fries.filter(f => {
    f.x += f.vx; f.y += f.vy;
    return f.x > -20 && f.x < canvas.width + 20 && f.y > -20 && f.y < canvas.height + 20;
  });

  // Spawn nepřátel
  if (frame % Math.max(20, SPAWN_INTERVAL - Math.floor(score/100)) === 0) {
    spawnEnemy();
    // Občas dvojitý spawn při vyšším score
    if (score > 300 && Math.random() < 0.4) spawnEnemy();
  }

  // Spawn pytlíčků
  if (bags.length < 2 && frame % 300 === 0) spawnBag();

  // Pohyb nepřátel
  for (const e of enemies) {
    const a = Math.atan2(player.y - e.y, player.x - e.x);
    e.x += Math.cos(a) * e.speed;
    e.y += Math.sin(a) * e.speed;
  }

  // Kolize: hranolka vs nepřítel
  for (let i = fries.length - 1; i >= 0; i--) {
    for (let j = enemies.length - 1; j >= 0; j--) {
      if (dist(fries[i], enemies[j]) < 18) {
        spawnParticle(enemies[j].x, enemies[j].y, '#ff6600');
        enemies.splice(j, 1);
        fries.splice(i, 1);
        score += 10;
        scoreEl.textContent = `SKÓRE: ${score}`;
        break;
      }
    }
  }

  // Kolize: nepřítel vs hráč
  for (let j = enemies.length - 1; j >= 0; j--) {
    if (dist(enemies[j], player) < 28) {
      spawnParticle(player.x, player.y, '#ff0000');
      enemies.splice(j, 1);
      lives--;
      livesEl.textContent = '❤️'.repeat(Math.max(0, lives));
      if (lives <= 0) {
        state = 'DEAD';
        if (score > hiScore) { hiScore = score; localStorage.setItem('smazak_hi', hiScore); }
        if (music) music.pause();
      }
    }
  }

  // Kolize: hráč vs pytlíček
  for (let k = bags.length - 1; k >= 0; k--) {
    if (dist(bags[k], player) < 30) {
      bags.splice(k, 1);
      player.powered = true;
      player.powerTimer = POWER_FRAMES;
      powerEl.classList.remove('hidden');
      spawnParticle(player.x, player.y, '#ffffff');
    }
  }

  // Particles
  particles = particles.filter(p => {
    p.x += p.vx; p.y += p.vy; p.life--;
    p.vx *= 0.92; p.vy *= 0.92;
    return p.life > 0;
  });
}

// ── Draw HUD ────────────────────────────────────────────────────────
function drawJoystick() {
  if (!joy.active) return;
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(joy.ox, joy.oy, 60, 0, Math.PI*2);
  ctx.stroke();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(joy.ox + joy.dx, joy.oy + joy.dy, 22, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

function drawMenu() {
  const W = canvas.width, H = canvas.height;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';

  // Titul
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('GTA 7: TĚŠÍN CITY', W/2, H/2 - 120);

  ctx.fillStyle = '#ff6600';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('🍟 Smažák s Hranolkama DLC 🍟', W/2, H/2 - 90);

  // Šimmy preview (velký)
  if (simImg.complete) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(W/2, H/2 - 20, 55, 0, Math.PI*2);
    ctx.clip();
    const iw = simImg.naturalWidth, ih = simImg.naturalHeight;
    ctx.drawImage(simImg, iw*0.1, 0, iw*0.8, ih*0.65, W/2-55, H/2-75, 110, 110);
    ctx.restore();
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(W/2, H/2 - 20, 55, 0, Math.PI*2);
    ctx.stroke();
  }

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('ŠIMMY PRZNIČ', W/2, H/2 + 52);

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '14px sans-serif';
  ctx.fillText('táhni prst = pohyb | auto-míří + stříhá sám', W/2, H/2 + 80);
  ctx.fillText('sbírej ??pytlíčky?? = TURBO HRANOLKY', W/2, H/2 + 100);

  // Start button
  const btnPulse = 1 + 0.05 * Math.sin(frame * 0.08);
  ctx.save();
  ctx.translate(W/2, H/2 + 145);
  ctx.scale(btnPulse, btnPulse);
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.roundRect(-90, -22, 180, 44, 22);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('▶  HRÁT', 0, 7);
  ctx.restore();

  if (hiScore > 0) {
    ctx.fillStyle = '#aaa';
    ctx.font = '13px sans-serif';
    ctx.fillText(`Rekord: ${hiScore}`, W/2, H/2 + 200);
  }
  ctx.restore();
}

function drawGameOver() {
  const W = canvas.width, H = canvas.height;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff2020';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('ŠIMMY PADL', W/2, H/2 - 80);

  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(`Skóre: ${score}`, W/2, H/2 - 35);

  ctx.fillStyle = '#888';
  ctx.font = '16px sans-serif';
  ctx.fillText(`Rekord: ${hiScore}`, W/2, H/2);

  // Znovu tlačítko
  const btnPulse = 1 + 0.05 * Math.sin(frame * 0.08);
  ctx.save();
  ctx.translate(W/2, H/2 + 70);
  ctx.scale(btnPulse, btnPulse);
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.roundRect(-90, -22, 180, 44, 22);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('🔄  ZNOVU', 0, 7);
  ctx.restore();

  ctx.restore();
}

// ── Particles draw ──────────────────────────────────────────────────
function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = p.life / 30;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
}

// ── Main loop ────────────────────────────────────────────────────────
function loop() {
  requestAnimationFrame(loop);

  drawMap();

  if (state === 'MENU') {
    drawMenu();
    frame++;
    return;
  }

  if (state === 'PLAYING') {
    update();
  }

  // Entities
  for (const b of bags)    drawBag(b);
  for (const f of fries)   drawFry(f);
  for (const e of enemies) drawEnemy(e);
  drawParticles();
  drawPlayer();
  drawJoystick();

  if (state === 'DEAD') {
    drawGameOver();
    frame++;
  }
}

// ── Boot ─────────────────────────────────────────────────────────────
livesEl.textContent = '❤️'.repeat(MAX_LIVES);
loop();
