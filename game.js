'use strict';

// ── Canvas ─────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
const livesEl = document.getElementById('lives');
const scoreEl = document.getElementById('score');
const powerEl = document.getElementById('power-indicator');

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize);
resize();

// ── Assets ─────────────────────────────────────────────────────────
const simImg = new Image();
simImg.src = 'assets/simmy.jpeg';
const spriteImg = new Image();
spriteImg.src = 'assets/sprite.png';
const menuBg = new Image();
menuBg.src = 'assets/menu_bg.png';
let music = null;
try { music = new Audio('assets/music.mp3'); music.loop = true; music.volume = 0.4; } catch(e) {}

// ── Tile types ─────────────────────────────────────────────────────
const T = {
  GRASS:0, ROAD:1, SIDEWALK:2, BUILDING:3,
  WATER:4, BRIDGE:5, PLAZA:6,
  FOREST:7, POOLSIDE:8, POOL:9,
  HOUSING:10, DIVADLO:11, ZAMEK:12,
  KAUFLAND:13, MOJKA:14, POLAND:15, RAILWAY:16,
  JETE:17,  // Jete potraviny (Mirerry) — shop checkpoint
};
const SOLID = new Set([T.BUILDING,T.WATER,T.POOL,T.HOUSING,T.DIVADLO,T.ZAMEK,T.KAUFLAND,T.MOJKA,T.POLAND,T.RAILWAY,T.JETE]);

const TCOLOR = {
  [T.GRASS]:    '#4a8a32',
  [T.ROAD]:     '#3a3a3a',
  [T.SIDEWALK]: '#9a8060',
  [T.BUILDING]: null,
  [T.WATER]:    '#1a70a0',
  [T.BRIDGE]:   '#8a7040',
  [T.PLAZA]:    '#d0b870',
  [T.FOREST]:   '#1c5c0a',
  [T.POOLSIDE]: '#70c0d8',
  [T.POOL]:     '#0070b8',
  [T.HOUSING]:  '#60606a',
  [T.DIVADLO]:  '#6a1878',
  [T.ZAMEK]:    '#7a5a28',
  [T.KAUFLAND]: '#c82020',
  [T.MOJKA]:    '#5a2808',
  [T.POLAND]:   '#9a7050',
  [T.RAILWAY]:  '#484848',
  [T.JETE]:     '#22aa44',   // zelené Jete potraviny
};

const POI_NAMES = {
  [T.DIVADLO]:  '🎭 Těšínské divadlo',
  [T.ZAMEK]:    '🏰 Těšínský zámek',
  [T.KAUFLAND]: '🛒 Kaufland',
  [T.MOJKA]:    '🍺 Hospoda Mojka',
  [T.POOLSIDE]: '🏊 Koupaliště Hrabina',
  [T.FOREST]:   '🌲 Les Hrabina',
  [T.PLAZA]:    '🏛️ Náměstí Míru',
  [T.POLAND]:   '🇵🇱 Cieszyn — vítejte v Polsku!',
  [T.JETE]:     '🍺 Jete potraviny (Mirerry) — kup si lahváč!',
};

// ── World ───────────────────────────────────────────────────────────
const TILE  = 64;
const WW    = 32;
const WH    = 32;
const WPX   = WW * TILE;  // 2048
const WPY   = WH * TILE;

// Horizontal roads at rows, Vertical at cols
const HROADS = [7, 13, 20, 26];
const VROADS = [6, 13, 21, 26];

// Fountain center (world px, center of náměstí)
const FOUNTAIN_WX = 16.5 * TILE;
const FOUNTAIN_WY = 13.0 * TILE;

// ── Map generation ─────────────────────────────────────────────────
function mulberry(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

let MAP;
function buildMap() {
  const m = [];
  for (let y = 0; y < WH; y++) m[y] = new Array(WW).fill(T.BUILDING);

  const fill = (x1,y1,x2,y2,t) => {
    for (let y=y1;y<=y2;y++) for (let x=x1;x<=x2;x++)
      if (y>=0&&y<WH&&x>=0&&x<WW) m[y][x]=t;
  };
  const fillSafe = (x1,y1,x2,y2,t) => {   // won't overwrite roads/water
    for (let y=y1;y<=y2;y++) for (let x=x1;x<=x2;x++) {
      if (y<0||y>=WH||x<0||x>=WW) continue;
      const cur = m[y][x];
      if (cur===T.ROAD||cur===T.SIDEWALK||cur===T.WATER) continue;
      m[y][x]=t;
    }
  };

  // ── Příroda ──
  fill(0,0,22,6,  T.FOREST);      // Les Hrabina
  fill(23,0,28,6, T.POOLSIDE);    // Koupaliště areál
  fill(23,1,27,5, T.POOL);        // Bazén (voda)
  fill(28,0,29,31,T.WATER);       // Olza
  fill(30,0,31,31,T.POLAND);      // Cieszyn

  // ── Silnice (pokládáme jako první) ──
  for (const r of HROADS) {
    for (let x=0;x<29;x++) {
      if (m[r][x]!==T.WATER && m[r][x]!==T.POOL) m[r][x]=T.ROAD;
      if (r>0  && m[r-1][x]!==T.WATER&&m[r-1][x]!==T.POOL&&m[r-1][x]!==T.FOREST&&m[r-1][x]!==T.POOLSIDE) m[r-1][x]=T.SIDEWALK;
      if (r<WH-1&&m[r+1][x]!==T.WATER&&m[r+1][x]!==T.POOL&&m[r+1][x]!==T.FOREST&&m[r+1][x]!==T.POOLSIDE) m[r+1][x]=T.SIDEWALK;
    }
  }
  for (const c of VROADS) {
    for (let y=0;y<WH;y++) {
      if (m[y][c]!==T.WATER&&m[y][c]!==T.POOL&&m[y][c]!==T.POOLSIDE&&m[y][c]!==T.FOREST) m[y][c]=T.ROAD;
      if (c>0  &&m[y][c-1]!==T.WATER&&m[y][c-1]!==T.POOL&&m[y][c-1]!==T.FOREST&&m[y][c-1]!==T.POOLSIDE) m[y][c-1]=T.SIDEWALK;
      if (c<WW-1&&m[y][c+1]!==T.WATER&&m[y][c+1]!==T.POOL&&m[y][c+1]!==T.FOREST&&m[y][c+1]!==T.POOLSIDE) m[y][c+1]=T.SIDEWALK;
    }
  }

  // ── Sídliště (bloky paneláků) ──
  fillSafe(0,9,3,11,  T.HOUSING);
  fillSafe(4,9,5,11,  T.HOUSING);
  fillSafe(0,15,3,18, T.HOUSING);
  fillSafe(4,15,5,18, T.HOUSING);

  // ── Kaufland (jih, velká plocha) ──
  fillSafe(0,21,5,25,T.KAUFLAND);
  fill(0,20,7,20,T.GRASS);        // Kaufland parkoviště

  // ── POI budovy ──
  fillSafe(7,9,10,12,  T.DIVADLO);
  fillSafe(14,17,18,19,T.ZAMEK);
  fillSafe(7,14,9,15,  T.MOJKA);

  // ── Nádraží ──
  for (let x=0;x<29;x++) if(m[27][x]!==T.ROAD) m[27][x]=T.RAILWAY;

  // ── Jete potraviny — AŽ PO Housing, aby ho nepřepsal ──
  // Tile (2,10) je uprostřed housing bloku — force-overwrite
  fill(2,10,2,10, T.JETE);

  // ── Náměstí Míru ──
  fill(14,11,19,15, T.PLAZA);

  // ── Most přes Olzu (u náměstí, řada 13) ──
  fill(28,12,31,14, T.BRIDGE);

  // ── Travní plošky ve městě ──
  const rng = mulberry(42);
  for (let y=8;y<27;y++) for (let x=0;x<28;x++)
    if (m[y][x]===T.BUILDING && rng()<0.07) m[y][x]=T.GRASS;

  MAP = m;
}
buildMap();

// Building colors (deterministic per tile)
const BLDCOL = Array.from({length:WH},(_,y)=>Array.from({length:WW},(_,x)=>{
  const h=((Math.floor(x/4)*17+Math.floor(y/4)*31)%360+360)%360;
  return `hsl(${h},18%,${22+((x^y)%4)*4}%)`;
}));

// ── Camera ─────────────────────────────────────────────────────────
const cam = {x:0,y:0};

function wts(wx,wy) {
  let dx=wx-cam.x, dy=wy-cam.y;
  if(dx> WPX/2)dx-=WPX; if(dx<-WPX/2)dx+=WPX;
  if(dy> WPY/2)dy-=WPY; if(dy<-WPY/2)dy+=WPY;
  return [canvas.width/2+dx, canvas.height/2+dy];
}
function wrap(v,max){return((v%max)+max)%max;}
function tileAt(wx,wy){
  const tx=Math.floor(wrap(wx,WPX)/TILE), ty=Math.floor(wrap(wy,WPY)/TILE);
  return MAP[ty]?.[tx]??T.BUILDING;
}
function blocked(wx,wy){return SOLID.has(tileAt(wx,wy));}
function wdist(ax,ay,bx,by){
  let dx=bx-ax,dy=by-ay;
  if(dx> WPX/2)dx-=WPX; if(dx<-WPX/2)dx+=WPX;
  if(dy> WPY/2)dy-=WPY; if(dy<-WPY/2)dy+=WPY;
  return Math.hypot(dx,dy);
}
function wangle(ax,ay,bx,by){
  let dx=bx-ax,dy=by-ay;
  if(dx> WPX/2)dx-=WPX; if(dx<-WPX/2)dx+=WPX;
  if(dy> WPY/2)dy-=WPY; if(dy<-WPY/2)dy+=WPY;
  return Math.atan2(dy,dx);
}
function playerNearTile(t,r=2){
  const tx=Math.floor(wrap(player.wx,WPX)/TILE), ty=Math.floor(wrap(player.wy,WPY)/TILE);
  for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++)
    if(MAP[(ty+dy+WH)%WH][(tx+dx+WW)%WW]===t) return true;
  return false;
}

// ── State ───────────────────────────────────────────────────────────
let state='MENU', score=0, lives=3, frame=0;
let hiScore=+(localStorage.getItem('smazak_hi')||0);

// Sídliště spawn — row 8 je sidewalk (pod road 7), bezpečné
const SPAWN_WX = 3*TILE+32;   // col 3, mimo housing bloky
const SPAWN_WY = 8*TILE+32;   // row 8 = sidewalk

const player = {wx:SPAWN_WX,wy:SPAWN_WY,vx:0,vy:0,speed:3.2,angle:0,shootTimer:0,powered:false,powerTimer:0};

let fries=[],pigeons=[],cogani=[],cars=[],npcs=[],bags=[],particles=[];
let achUnlocked={}, achPopups=[];
let pigKills=0,bagsGot=0,carsGot=0,coganKills=0;
let visitedPOIs=new Set();
let coganRespawn=0;
let currentLocationLabel='';
let nearShop=false, shopCooldown=0;

// ── Achievements ────────────────────────────────────────────────────
const ACHS=[
  {id:'krev',   icon:'🕊️',name:'První krev',        chk:()=>pigKills>=1},
  {id:'d10',    icon:'🍟',name:'Hranolkář',          chk:()=>pigKills>=10},
  {id:'d50',    icon:'🏆',name:'Holubí apokalypsa',  chk:()=>pigKills>=50},
  {id:'bags',   icon:'💊',name:'Závisláček',         chk:()=>bagsGot>=5},
  {id:'car',    icon:'🚗',name:'GTA mode',           chk:()=>carsGot>=1},
  {id:'cogan',  icon:'😤',name:'Náměstí čisté!',     chk:()=>coganKills>=5},
  {id:'namesti',icon:'🏛️',name:'Těšínský rodák',     chk:()=>visitedPOIs.has(T.PLAZA)},
  {id:'polska', icon:'🇵🇱',name:'Polský turista',    chk:()=>visitedPOIs.has(T.POLAND)},
  {id:'les',    icon:'🌲',name:'Lesní duch',          chk:()=>visitedPOIs.has(T.FOREST)},
  {id:'koupal', icon:'🏊',name:'Koupaliště master',   chk:()=>visitedPOIs.has(T.POOLSIDE)},
  {id:'div',    icon:'🎭',name:'Těšínský umělec',     chk:()=>visitedPOIs.has(T.DIVADLO)},
  {id:'zamek',  icon:'🏰',name:'Těšínský šlechtic',   chk:()=>visitedPOIs.has(T.ZAMEK)},
  {id:'kauf',   icon:'🛒',name:'Kauflandák',          chk:()=>visitedPOIs.has(T.KAUFLAND)},
  {id:'mojka',  icon:'🍺',name:'Stamgast u Mojky',    chk:()=>visitedPOIs.has(T.MOJKA)},
  {id:'l500',   icon:'👑',name:'Šimmy Legenda',       chk:()=>score>=500},
  {id:'l1k',    icon:'🔥',name:'Prznič Pro',          chk:()=>score>=1000},
];
function checkAchs(){
  for(const a of ACHS)
    if(!achUnlocked[a.id]&&a.chk()){
      achUnlocked[a.id]=true;
      achPopups.push({text:`${a.icon} ${a.name}`,timer:220});
    }
}

// ── Particles ────────────────────────────────────────────────────────
function boom(wx,wy,color,n=8){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2;
    particles.push({wx,wy,vx:Math.cos(a)*(1.5+Math.random()*4),vy:Math.sin(a)*(1.5+Math.random()*4),life:25+Math.floor(Math.random()*20),color,r:2+Math.random()*5});
  }
}

// ── Keyboard ────────────────────────────────────────────────────────
const keys={};
window.addEventListener('keydown',e=>{
  keys[e.key]=true;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  if((e.key==='Enter'||e.key===' ')&&state!=='PLAYING') startGame();
});
window.addEventListener('keyup',e=>{ keys[e.key]=false; });

// ── Touch Joystick ───────────────────────────────────────────────────
const joy={active:false,id:null,ox:0,oy:0,dx:0,dy:0};
canvas.addEventListener('touchstart',e=>{
  e.preventDefault();
  for(const t of e.changedTouches){
    if(state!=='PLAYING'){startGame();return;}
    if(nearShop&&shopCooldown===0){buyBeer();return;}
    if(!joy.active){joy.active=true;joy.id=t.identifier;joy.ox=t.clientX;joy.oy=t.clientY;joy.dx=0;joy.dy=0;}
  }
},{passive:false});
canvas.addEventListener('touchmove',e=>{
  e.preventDefault();
  for(const t of e.changedTouches) if(t.identifier===joy.id){
    joy.dx=t.clientX-joy.ox;joy.dy=t.clientY-joy.oy;
    const l=Math.hypot(joy.dx,joy.dy);if(l>65){joy.dx=joy.dx/l*65;joy.dy=joy.dy/l*65;}
  }
},{passive:false});
canvas.addEventListener('touchend',e=>{
  e.preventDefault();
  for(const t of e.changedTouches) if(t.identifier===joy.id){joy.active=false;joy.dx=0;joy.dy=0;}
},{passive:false});
canvas.addEventListener('mousedown',e=>{
  if(state!=='PLAYING'){startGame();return;}
  if(nearShop&&shopCooldown===0){buyBeer();return;}
  joy.active=true;joy.ox=e.clientX;joy.oy=e.clientY;joy.dx=0;joy.dy=0;
});
canvas.addEventListener('mousemove',e=>{if(!joy.active)return;joy.dx=e.clientX-joy.ox;joy.dy=e.clientY-joy.oy;const l=Math.hypot(joy.dx,joy.dy);if(l>65){joy.dx=joy.dx/l*65;joy.dy=joy.dy/l*65;}});
canvas.addEventListener('mouseup',()=>{joy.active=false;joy.dx=0;joy.dy=0;});

// ── Game start ───────────────────────────────────────────────────────
function startGame(){
  score=0;lives=3;frame=0;
  fries=[];pigeons=[];cogani=[];bags=[];particles=[];achPopups=[];
  pigKills=0;bagsGot=0;carsGot=0;coganKills=0;coganRespawn=0;
  visitedPOIs=new Set();
  player.wx=SPAWN_WX;player.wy=SPAWN_WY;
  player.vx=0;player.vy=0;player.powered=false;player.powerTimer=0;player.shootTimer=0;
  spawnCars();spawnNPCs();spawnCogani();
  livesEl.textContent='❤️'.repeat(lives);
  scoreEl.textContent='SKÓRE: 0';
  state='PLAYING';
  if(music){music.currentTime=0;music.play().catch(()=>{});}
}

// ── Spawning ─────────────────────────────────────────────────────────
const CAR_COLS=['#e8241c','#1c60e8','#e8b41c','#1ce84a','#e81cc4','#ffffff','#aaaaaa'];

function makeCar(wx,wy,vx,vy){
  return{wx,wy,vx:vx*(1.3+Math.random()*0.7),vy:vy*(1.3+Math.random()*0.7),
    color:CAR_COLS[Math.floor(Math.random()*CAR_COLS.length)],
    hp:3,angle:Math.atan2(vy,vx),exploding:0};
}
function spawnCars(){
  cars=[];
  for(const r of HROADS) for(let i=0;i<2;i++){
    const wy=(r+0.5)*TILE+(i?-8:8);
    cars.push(makeCar(Math.random()*WPX,wy,i?1:-1,0));
  }
  for(const c of VROADS) for(let i=0;i<2;i++){
    const wx=(c+0.5)*TILE+(i?-8:8);
    cars.push(makeCar(wx,Math.random()*WPY,0,i?1:-1));
  }
}

const NPC_COLS=['#4488ff','#ff8844','#44ff88','#ff44cc','#ffff44','#ff8888'];
function spawnNPCs(){
  npcs=[];
  const sw=[];
  for(let y=0;y<WH;y++) for(let x=0;x<WW;x++)
    if(MAP[y][x]===T.SIDEWALK) sw.push([(x+0.5)*TILE,(y+0.5)*TILE]);
  for(let i=0;i<24;i++){
    const [wx,wy]=sw[Math.floor(Math.random()*sw.length)];
    npcs.push({wx,wy,angle:Math.random()*Math.PI*2,speed:0.4+Math.random()*0.3,
      scared:0,dirTimer:0,color:NPC_COLS[Math.floor(Math.random()*NPC_COLS.length)]});
  }
}

function spawnCogani(){
  for(let i=0;i<5;i++){
    const a=(i/5)*Math.PI*2, r=50+Math.random()*40;
    cogani.push({
      wx:wrap(FOUNTAIN_WX+Math.cos(a)*r,WPX),
      wy:wrap(FOUNTAIN_WY+Math.sin(a)*r,WPY),
      speed:1.9,hp:2,angle:a,mode:'wander',
      scaredTimer:0,wobble:Math.random()*Math.PI*2,
      color:['#333344','#2a2a44','#3a2a22','#222233','#4a3a22'][i],
    });
  }
}

function spawnPigeon(){
  const zone=getZone();
  const r=300+Math.random()*200;
  const a=Math.random()*Math.PI*2;
  pigeons.push({
    wx:wrap(player.wx+Math.cos(a)*r,WPX),
    wy:wrap(player.wy+Math.sin(a)*r,WPY),
    speed:(zone==='NAMESTI'?1.8:zone==='CENTER'?1.4:1.1)+score/500,
    wobble:Math.random()*Math.PI*2,
  });
}

function spawnBag(){
  for(let i=0;i<20;i++){
    const a=Math.random()*Math.PI*2,r=80+Math.random()*250;
    const wx=wrap(player.wx+Math.cos(a)*r,WPX);
    const wy=wrap(player.wy+Math.sin(a)*r,WPY);
    const t=tileAt(wx,wy);
    if(t===T.SIDEWALK||t===T.ROAD||t===T.PLAZA||t===T.GRASS){
      bags.push({wx,wy,bob:Math.random()*Math.PI*2}); return;
    }
  }
}

function getZone(){
  const tx=Math.floor(wrap(player.wx,WPX)/TILE);
  const ty=Math.floor(wrap(player.wy,WPY)/TILE);
  if(tx>=13&&tx<=20&&ty>=10&&ty<=16) return'NAMESTI';
  if(tx>=6&&tx<=26&&ty>=7&&ty<=26)   return'CENTER';
  return'SIDLISTE';
}

// ── Update ───────────────────────────────────────────────────────────
const SHOOT_NORM=38, SHOOT_FAST=10, FRIES_SPD=9, POWER_TIME=600;

function takeDamage(){
  boom(player.wx,player.wy,'#ff0000',8);
  lives--;livesEl.textContent='❤️'.repeat(Math.max(0,lives));
  if(lives<=0){state='DEAD';if(score>hiScore){hiScore=score;localStorage.setItem('smazak_hi',hiScore);}if(music)music.pause();}
}

function update(){
  frame++;

  // Player movement — joystick + keyboard
  let mdx=0, mdy=0;
  if(joy.active&&(joy.dx||joy.dy)){ mdx=joy.dx/65; mdy=joy.dy/65; }
  else {
    if(keys['ArrowLeft']||keys['a']||keys['A']) mdx-=1;
    if(keys['ArrowRight']||keys['d']||keys['D']) mdx+=1;
    if(keys['ArrowUp']||keys['w']||keys['W']) mdy-=1;
    if(keys['ArrowDown']||keys['s']||keys['S']) mdy+=1;
  }
  if(mdx||mdy){
    const l=Math.hypot(mdx,mdy)||1;
    player.vx=(mdx/l)*player.speed; player.vy=(mdy/l)*player.speed;
    player.angle=Math.atan2(mdy,mdx)+Math.PI/2;
  } else {player.vx*=0.75;player.vy*=0.75;}

  const nx=player.wx+player.vx, ny=player.wy+player.vy;
  if(!blocked(nx,player.wy)) player.wx=wrap(nx,WPX);
  if(!blocked(player.wx,ny)) player.wy=wrap(ny,WPY);
  cam.x=player.wx; cam.y=player.wy;

  // Power timer
  if(player.powered){player.powerTimer--;if(player.powerTimer<=0){player.powered=false;powerEl.classList.add('hidden');}}

  // Location tracking
  const pTile=tileAt(player.wx,player.wy);
  for(const t of [T.PLAZA,T.FOREST,T.POOLSIDE,T.POLAND])
    if(playerNearTile(t,1)) visitedPOIs.add(t);
  for(const t of [T.DIVADLO,T.ZAMEK,T.KAUFLAND,T.MOJKA])
    if(playerNearTile(t,1)) visitedPOIs.add(t);
  currentLocationLabel = POI_NAMES[pTile] || (playerNearTile(T.DIVADLO,1)?POI_NAMES[T.DIVADLO]:playerNearTile(T.ZAMEK,1)?POI_NAMES[T.ZAMEK]:playerNearTile(T.KAUFLAND,1)?POI_NAMES[T.KAUFLAND]:playerNearTile(T.MOJKA,1)?POI_NAMES[T.MOJKA]:'');

  // Auto-aim + shoot (all enemies: pigeons + cogani)
  const rate=player.powered?SHOOT_FAST:SHOOT_NORM;
  player.shootTimer++;
  if(player.shootTimer>=rate){
    const allEnemies=[...pigeons,...cogani.filter(c=>c.mode!=='scared')];
    if(allEnemies.length>0){
      player.shootTimer=0;
      let tgt=null,minD=9999;
      for(const e of allEnemies){const d=wdist(player.wx,player.wy,e.wx,e.wy);if(d<minD&&d<700){minD=d;tgt=e;}}
      if(tgt){
        const a=wangle(player.wx,player.wy,tgt.wx,tgt.wy);
        fries.push({wx:player.wx,wy:player.wy,vx:Math.cos(a)*FRIES_SPD,vy:Math.sin(a)*FRIES_SPD,angle:a});
        player.angle=a+Math.PI/2;
      }
    }
  }

  // Move fries
  for(const f of fries){f.wx=wrap(f.wx+f.vx,WPX);f.wy=wrap(f.wy+f.vy,WPY);}
  if(fries.length>60)fries.splice(0,fries.length-60);

  // Spawn enemies
  const zone=getZone();
  const spawnBase=zone==='NAMESTI'?35:zone==='CENTER'?60:95;
  if(frame%Math.max(20,spawnBase-Math.floor(score/60))===0){
    spawnPigeon();
    if(zone==='NAMESTI'&&Math.random()<0.5) spawnPigeon();
  }
  if(bags.length<3&&frame%280===0) spawnBag();

  // Cogani respawn
  coganRespawn--;
  if(coganRespawn<=0&&cogani.length<5){spawnCogani();coganRespawn=1800;}

  // Move pigeons
  for(const p of pigeons){
    const a=wangle(p.wx,p.wy,player.wx,player.wy);
    p.wx=wrap(p.wx+Math.cos(a)*p.speed,WPX);
    p.wy=wrap(p.wy+Math.sin(a)*p.speed,WPY);
    p.wobble=(p.wobble||0)+0.12;
  }

  // Move cogani
  for(const c of cogani){
    if(c.scaredTimer>0){
      c.scaredTimer--;c.mode='scared';
      const a=wangle(player.wx,player.wy,c.wx,c.wy);
      c.wx=wrap(c.wx+Math.cos(a)*c.speed*2,WPX);
      c.wy=wrap(c.wy+Math.sin(a)*c.speed*2,WPY);
    } else {
      const d=wdist(c.wx,c.wy,player.wx,player.wy);
      if(d<240){
        c.mode='chase';
        const a=wangle(c.wx,c.wy,player.wx,player.wy);
        c.wx=wrap(c.wx+Math.cos(a)*c.speed,WPX);
        c.wy=wrap(c.wy+Math.sin(a)*c.speed,WPY);
      } else {
        c.mode='wander';
        c.wobble+=0.025;
        const fd=wdist(c.wx,c.wy,FOUNTAIN_WX,FOUNTAIN_WY);
        if(fd>160){const a=wangle(c.wx,c.wy,FOUNTAIN_WX,FOUNTAIN_WY);c.wx=wrap(c.wx+Math.cos(a)*0.7,WPX);c.wy=wrap(c.wy+Math.sin(a)*0.7,WPY);}
        else{c.wx=wrap(c.wx+Math.cos(c.wobble)*0.5,WPX);c.wy=wrap(c.wy+Math.sin(c.wobble)*0.5,WPY);}
      }
    }
  }

  // Move cars
  for(const c of cars){
    if(c.exploding>0){c.exploding--;continue;}
    c.wx=wrap(c.wx+c.vx,WPX);c.wy=wrap(c.wy+c.vy,WPY);
  }
  cars=cars.filter(c=>!(c.hp<=0&&c.exploding===0));

  // Move NPCs
  for(const n of npcs){
    n.dirTimer--;
    if(n.dirTimer<=0){n.angle+=(Math.random()-0.5)*Math.PI*0.8;n.dirTimer=60+Math.floor(Math.random()*100);}
    const spd=n.scared>0?n.speed*3:n.speed;
    const na=n.wx+Math.cos(n.angle)*spd, nb=n.wy+Math.sin(n.angle)*spd;
    if(!blocked(na,nb)){n.wx=wrap(na,WPX);n.wy=wrap(nb,WPY);}
    else n.angle+=Math.PI+(Math.random()-0.5)*0.5;
    if(n.scared>0)n.scared--;
  }

  // Move particles
  particles=particles.filter(p=>{p.wx+=p.vx;p.wy+=p.vy;p.vx*=0.90;p.vy*=0.90;return --p.life>0;});

  // ── Kolize ──────────────────────────────────────────────────────
  // Fry vs pigeon
  outer1:for(let i=fries.length-1;i>=0;i--){
    for(let j=pigeons.length-1;j>=0;j--){
      if(wdist(fries[i].wx,fries[i].wy,pigeons[j].wx,pigeons[j].wy)<18){
        boom(pigeons[j].wx,pigeons[j].wy,'#888',6);
        pigeons.splice(j,1);fries.splice(i,1);
        score+=10;pigKills++;scoreEl.textContent=`SKÓRE: ${score}`;
        continue outer1;
      }
    }
  }

  // Fry vs cogani
  outer2:for(let i=fries.length-1;i>=0;i--){
    for(let j=cogani.length-1;j>=0;j--){
      if(wdist(fries[i].wx,fries[i].wy,cogani[j].wx,cogani[j].wy)<20){
        cogani[j].hp--;boom(cogani[j].wx,cogani[j].wy,'#ff6600',5);
        fries.splice(i,1);
        if(cogani[j].hp<=0){
          boom(cogani[j].wx,cogani[j].wy,'#aa4400',8);cogani.splice(j,1);
          score+=25;coganKills++;scoreEl.textContent=`SKÓRE: ${score}`;
        } else cogani[j].scaredTimer=200;
        continue outer2;
      }
    }
  }

  // Fry vs car
  outer3:for(let i=fries.length-1;i>=0;i--){
    for(const c of cars){
      if(c.exploding>0||c.hp<=0)continue;
      if(wdist(fries[i].wx,fries[i].wy,c.wx,c.wy)<28){
        c.hp--;boom(c.wx,c.wy,'#ff6600',5);fries.splice(i,1);
        if(c.hp<=0){boom(c.wx,c.wy,'#ffaa00',16);boom(c.wx,c.wy,'#ff2200',10);c.exploding=60;score+=50;carsGot++;scoreEl.textContent=`SKÓRE: ${score}`;}
        continue outer3;
      }
    }
  }

  // Fry vs NPC (scares them)
  outer4:for(let i=fries.length-1;i>=0;i--){
    for(const n of npcs){
      if(wdist(fries[i].wx,fries[i].wy,n.wx,n.wy)<14){
        n.scared=150;n.angle=wangle(fries[i].wx,fries[i].wy,n.wx,n.wy);
        boom(n.wx,n.wy,'#ffcc44',4);fries.splice(i,1);score+=2;scoreEl.textContent=`SKÓRE: ${score}`;
        continue outer4;
      }
    }
  }

  // Pigeon vs player
  for(let j=pigeons.length-1;j>=0;j--)
    if(wdist(pigeons[j].wx,pigeons[j].wy,player.wx,player.wy)<26){pigeons.splice(j,1);takeDamage();if(state==='DEAD')return;}

  // Cogani vs player
  for(let j=cogani.length-1;j>=0;j--)
    if(cogani[j].mode==='chase'&&wdist(cogani[j].wx,cogani[j].wy,player.wx,player.wy)<22){
      cogani[j].scaredTimer=300;takeDamage();if(state==='DEAD')return;
    }

  // Car vs player
  for(const c of cars)
    if(c.exploding===0&&wdist(c.wx,c.wy,player.wx,player.wy)<30){
      c.hp=0;c.exploding=60;boom(c.wx,c.wy,'#ffaa00',12);takeDamage();if(state==='DEAD')return;
    }

  // Bag pickup
  for(let k=bags.length-1;k>=0;k--)
    if(wdist(bags[k].wx,bags[k].wy,player.wx,player.wy)<28){
      bags.splice(k,1);player.powered=true;player.powerTimer=POWER_TIME;bagsGot++;
      boom(player.wx,player.wy,'#ffffff',12);powerEl.classList.remove('hidden');
    }

  // Restock cars
  while(cars.length<20){
    const r=HROADS[Math.floor(Math.random()*HROADS.length)];
    const wy=(r+0.5)*TILE+(Math.random()<0.5?-8:8);
    const dir=Math.random()<0.5?1:-1;
    cars.push(makeCar(Math.random()*WPX,wy,dir,0));
  }

  // Shop (Jete potraviny)
  nearShop = playerNearTile(T.JETE, 1);
  if(shopCooldown>0) shopCooldown--;

  achPopups=achPopups.filter(p=>--p.timer>0);
  checkAchs();
}

// Nákup lahváče — voláno tapem/klikem při nearShop
function buyBeer(){
  if(!nearShop||shopCooldown>0)return;
  if(score<80){achPopups.push({text:'💸 Nemáš drobáky! (80 bodů)',timer:120});return;}
  if(lives>=5){achPopups.push({text:'🍺 Jsi namazanej dost!',timer:120});return;}
  score-=80; scoreEl.textContent=`SKÓRE: ${score}`;
  lives=Math.min(5,lives+1); livesEl.textContent='❤️'.repeat(lives);
  boom(player.wx,player.wy,'#22aa44',8);
  achPopups.push({text:'🍺 Lahváč doplněn! +1 ❤️',timer:160});
  shopCooldown=120;
}

// ── Draw: tile map ────────────────────────────────────────────────
function drawMap(){
  const hw=canvas.width/2, hh=canvas.height/2;
  const tlx=Math.floor((cam.x-hw)/TILE)-1, tly=Math.floor((cam.y-hh)/TILE)-1;
  const brx=Math.ceil((cam.x+hw)/TILE)+1,  bry=Math.ceil((cam.y+hh)/TILE)+1;

  for(let ty=tly;ty<=bry;ty++){
    for(let tx=tlx;tx<=brx;tx++){
      const wtx=((tx%WW)+WW)%WW, wty=((ty%WH)+WH)%WH;
      const tile=MAP[wty][wtx];
      const sx=tx*TILE-(cam.x-hw), sy=ty*TILE-(cam.y-hh);

      ctx.fillStyle = tile===T.BUILDING ? BLDCOL[wty][wtx] : (TCOLOR[tile]||'#555');
      ctx.fillRect(sx,sy,TILE,TILE);

      // ── Tile decorations ──────────────────────────────────────────
      if(tile===T.ROAD){
        // Okraje silnice (obrubníky)
        ctx.fillStyle='rgba(80,80,80,0.6)';
        ctx.fillRect(sx,sy,TILE,3); ctx.fillRect(sx,sy+TILE-3,TILE,3);
        // Střední čáry
        ctx.strokeStyle='rgba(255,220,0,0.5)';ctx.lineWidth=2;ctx.setLineDash([18,14]);
        ctx.beginPath();
        if(HROADS.includes(wty)){ctx.moveTo(sx,sy+TILE/2);ctx.lineTo(sx+TILE,sy+TILE/2);}
        else{ctx.moveTo(sx+TILE/2,sy);ctx.lineTo(sx+TILE/2,sy+TILE);}
        ctx.stroke();ctx.setLineDash([]);
        // Bílé krajové čáry
        ctx.strokeStyle='rgba(255,255,255,0.25)';ctx.lineWidth=1.5;ctx.setLineDash([]);
        ctx.beginPath();
        if(HROADS.includes(wty)){
          ctx.moveTo(sx,sy+8);ctx.lineTo(sx+TILE,sy+8);
          ctx.moveTo(sx,sy+TILE-8);ctx.lineTo(sx+TILE,sy+TILE-8);
        }else{
          ctx.moveTo(sx+8,sy);ctx.lineTo(sx+8,sy+TILE);
          ctx.moveTo(sx+TILE-8,sy);ctx.lineTo(sx+TILE-8,sy+TILE);
        }
        ctx.stroke();
      }
      if(tile===T.SIDEWALK){
        // Dlažební čtverce
        ctx.strokeStyle='rgba(0,0,0,0.12)';ctx.lineWidth=0.8;
        const gs=16;
        for(let gx=sx;gx<sx+TILE;gx+=gs) {ctx.beginPath();ctx.moveTo(gx,sy);ctx.lineTo(gx,sy+TILE);ctx.stroke();}
        for(let gy=sy;gy<sy+TILE;gy+=gs) {ctx.beginPath();ctx.moveTo(sx,gy);ctx.lineTo(sx+TILE,gy);ctx.stroke();}
      }
      if(tile===T.BUILDING){
        // Střecha s výškovým gradientem
        const roofGrad=ctx.createLinearGradient(sx,sy,sx+TILE,sy+TILE);
        roofGrad.addColorStop(0,'rgba(255,255,255,0.08)');
        roofGrad.addColorStop(1,'rgba(0,0,0,0.15)');
        ctx.fillStyle=roofGrad;ctx.fillRect(sx,sy,TILE,TILE);
        // Okna
        const winOn=(frame/30|0)%3===0&&Math.sin(wtx*7+wty*13)>0.3;
        for(let r=0;r<2;r++) for(let c=0;c<2;c++){
          const wx2=sx+10+c*24, wy2=sy+10+r*24;
          ctx.fillStyle=winOn?'rgba(255,230,100,0.5)':'rgba(150,180,255,0.2)';
          ctx.fillRect(wx2,wy2,12,10);
          ctx.strokeStyle='rgba(0,0,0,0.3)';ctx.lineWidth=0.5;ctx.strokeRect(wx2,wy2,12,10);
        }
        // Obrys budovy
        ctx.strokeStyle='rgba(0,0,0,0.2)';ctx.lineWidth=1;ctx.strokeRect(sx,sy,TILE,TILE);
      }
      if(tile===T.HOUSING){
        // Paneláky — horizontální pásy pater
        ctx.fillStyle='rgba(200,215,230,0.12)';ctx.fillRect(sx+2,sy+2,TILE-4,TILE-4);
        for(let r=0;r<5;r++){
          ctx.fillStyle=`rgba(150,170,190,${0.05+r*0.02})`;
          ctx.fillRect(sx+2,sy+4+r*11,TILE-4,9);
        }
        // Okna paneláku (mřížka)
        for(let r=0;r<4;r++) for(let c=0;c<3;c++){
          const lit=Math.sin(wtx*3+wty*7+r*5+c*11)>0.2;
          ctx.fillStyle=lit?'rgba(255,220,100,0.45)':'rgba(80,100,130,0.2)';
          ctx.fillRect(sx+8+c*18,sy+8+r*13,10,7);
        }
        ctx.strokeStyle='rgba(100,120,140,0.3)';ctx.lineWidth=0.8;ctx.strokeRect(sx+2,sy+2,TILE-4,TILE-4);
      }
      if(tile===T.FOREST){
        // Stromy — tmavší koruna, světlejší okraje
        const seed=(wtx*13+wty*7);
        const treeData=[[12,12],[36,8],[54,14],[20,36],[44,30],[8,50],[50,48],[28,52]];
        for(let i=0;i<treeData.length;i++){
          const [tx2,ty2]=treeData[i];
          const r=6+(seed+i)%4;
          const h=115+((seed+i*3)%20);
          ctx.fillStyle=`hsl(${h},55%,${18+(i%3)*5}%)`;
          ctx.beginPath();ctx.arc(sx+tx2,sy+ty2,r,0,Math.PI*2);ctx.fill();
          // Světelný odraz
          ctx.fillStyle='rgba(255,255,255,0.1)';
          ctx.beginPath();ctx.arc(sx+tx2-r*0.3,sy+ty2-r*0.3,r*0.4,0,Math.PI*2);ctx.fill();
        }
      }
      if(tile===T.POOL){
        // Vlnky bazénu
        const wave=frame*0.04;
        ctx.fillStyle=`rgba(80,180,255,${0.15+0.08*Math.sin(wave+tx+ty)})`;
        ctx.fillRect(sx,sy,TILE,TILE);
        for(let i=0;i<3;i++){
          ctx.strokeStyle=`rgba(200,240,255,${0.3+0.1*Math.sin(wave+i)})`;
          ctx.lineWidth=1.5;ctx.beginPath();
          ctx.moveTo(sx+4,sy+8+i*16+Math.sin(wave+i)*3);
          ctx.bezierCurveTo(sx+20,sy+5+i*16,sx+44,sy+11+i*16,sx+60,sy+8+i*16);
          ctx.stroke();
        }
        // Lane dělicí lajny
        for(let i=1;i<4;i++){ctx.strokeStyle='rgba(255,255,255,0.3)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(sx+i*16,sy);ctx.lineTo(sx+i*16,sy+TILE);ctx.stroke();}
      }
      if(tile===T.POOLSIDE){
        // Dřevěné lávky / beton areálu
        ctx.fillStyle='rgba(220,200,160,0.2)';ctx.fillRect(sx+2,sy+2,TILE-4,TILE-4);
        ctx.strokeStyle='rgba(180,160,120,0.3)';ctx.lineWidth=1;
        for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(sx,sy+i*16);ctx.lineTo(sx+TILE,sy+i*16);ctx.stroke();}
      }
      if(tile===T.RAILWAY){
        // Pražce + kolejnice
        ctx.fillStyle='#5c4c3c';
        for(let i=0;i<5;i++) ctx.fillRect(sx+i*14-2,sy+TILE/2-7,10,14);
        ctx.fillStyle='#888';ctx.fillRect(sx,sy+TILE/2-2,TILE,4);
        ctx.fillStyle='#777';ctx.fillRect(sx,sy+TILE/2+5,TILE,4);
        ctx.strokeStyle='rgba(200,200,200,0.15)';ctx.lineWidth=0.5;ctx.strokeRect(sx,sy,TILE,TILE);
      }
      if(tile===T.BRIDGE){
        // Most — dřevěné prkna
        const bGrad=ctx.createLinearGradient(sx,sy,sx,sy+TILE);
        bGrad.addColorStop(0,'rgba(255,230,180,0.2)');
        bGrad.addColorStop(1,'rgba(160,120,60,0.2)');
        ctx.fillStyle=bGrad;ctx.fillRect(sx,sy,TILE,TILE);
        // Zábradlí
        ctx.fillStyle='rgba(180,140,80,0.7)';
        ctx.fillRect(sx,sy,TILE,5);ctx.fillRect(sx,sy+TILE-5,TILE,5);
        // Prkenné linie
        ctx.strokeStyle='rgba(140,100,60,0.3)';ctx.lineWidth=1;
        for(let i=0;i<8;i++){ctx.beginPath();ctx.moveTo(sx+i*8,sy+5);ctx.lineTo(sx+i*8,sy+TILE-5);ctx.stroke();}
        ctx.strokeStyle='rgba(255,255,255,0.1)';ctx.lineWidth=2;ctx.setLineDash([10,8]);
        ctx.beginPath();ctx.moveTo(sx,sy+TILE/2);ctx.lineTo(sx+TILE,sy+TILE/2);ctx.stroke();ctx.setLineDash([]);
      }
      if(tile===T.PLAZA){
        // Dlažba náměstí — cihelný vzor
        ctx.strokeStyle='rgba(140,110,50,0.2)';ctx.lineWidth=0.8;
        for(let r=0;r<4;r++) for(let c=0;c<4;c++){
          const ox=(r%2)*8; // offset pro cihelný vzor
          ctx.strokeRect(sx+c*16+ox,sy+r*16,16,16);
        }
        // Ornamentní obdélník
        ctx.strokeStyle='rgba(160,120,40,0.3)';ctx.lineWidth=1.5;
        ctx.strokeRect(sx+4,sy+4,TILE-8,TILE-8);
      }
      if(tile===T.KAUFLAND){
        ctx.fillStyle='#ffffff';ctx.font='bold 9px sans-serif';ctx.textAlign='center';
        ctx.fillText('KAUFLAND',sx+TILE/2,sy+TILE/2+4);
      }
      if(tile===T.DIVADLO){
        ctx.fillStyle='rgba(255,150,255,0.2)';ctx.fillRect(sx,sy,TILE,TILE);
        ctx.fillStyle='#ffaaff';ctx.font='10px sans-serif';ctx.textAlign='center';
        ctx.fillText('🎭',sx+TILE/2,sy+TILE/2+5);
      }
      if(tile===T.ZAMEK){
        ctx.fillStyle='rgba(255,220,120,0.15)';ctx.fillRect(sx,sy,TILE,TILE);
        ctx.fillStyle='#ffe080';ctx.font='10px sans-serif';ctx.textAlign='center';
        ctx.fillText('🏰',sx+TILE/2,sy+TILE/2+5);
      }
      if(tile===T.MOJKA){
        ctx.fillStyle='rgba(255,180,80,0.15)';ctx.fillRect(sx,sy,TILE,TILE);
        ctx.fillStyle='#ffaa44';ctx.font='10px sans-serif';ctx.textAlign='center';
        ctx.fillText('🍺',sx+TILE/2,sy+TILE/2+5);
      }
      if(tile===T.JETE){
        ctx.fillStyle='rgba(50,220,80,0.2)';ctx.fillRect(sx,sy,TILE,TILE);
        ctx.fillStyle='#aaffaa';ctx.font='9px sans-serif';ctx.textAlign='center';
        ctx.fillText('JETE',sx+TILE/2,sy+TILE/2-4);
        ctx.fillText('🍺🛒',sx+TILE/2,sy+TILE/2+8);
      }
      if(tile===T.POLAND){
        ctx.fillStyle='rgba(255,255,255,0.08)';ctx.fillRect(sx,sy,TILE,TILE);
      }
      if(tile===T.WATER){
        ctx.strokeStyle=`rgba(100,200,255,${0.12+0.05*Math.sin(frame*0.03+tx*0.4)})`;
        ctx.lineWidth=1.5;ctx.beginPath();
        ctx.moveTo(sx+6,sy+TILE/2);ctx.bezierCurveTo(sx+20,sy+TILE/2-4,sx+44,sy+TILE/2+4,sx+58,sy+TILE/2);
        ctx.stroke();
      }

      ctx.strokeStyle='rgba(0,0,0,0.05)';ctx.lineWidth=0.5;ctx.strokeRect(sx,sy,TILE,TILE);
    }
  }

  // Fontána na náměstí
  const [fsx,fsy]=wts(FOUNTAIN_WX,FOUNTAIN_WY);
  if(Math.abs(fsx-canvas.width/2)<500&&Math.abs(fsy-canvas.height/2)<500){
    ctx.save();
    ctx.fillStyle=`hsl(200,80%,${40+8*Math.sin(frame*0.04)}%)`;
    ctx.beginPath();ctx.arc(fsx,fsy,22,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#aaddff';ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(fsx,fsy,22,0,Math.PI*2);ctx.stroke();
    // Stříkající voda
    for(let i=0;i<4;i++){
      const a=i/4*Math.PI*2+frame*0.02;
      const r=14+4*Math.sin(frame*0.08+i);
      ctx.fillStyle='rgba(150,220,255,0.7)';
      ctx.beginPath();ctx.arc(fsx+Math.cos(a)*r,fsy+Math.sin(a)*r,3,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }

  // Mapy labely
  const labels=[
    {wx:2*TILE,wy:6*TILE,text:'SÍDLIŠTĚ',color:'rgba(200,200,220,0.4)'},
    {wx:11*TILE,wy:2*TILE,text:'LES HRABINA',color:'rgba(80,180,40,0.5)'},
    {wx:25*TILE,wy:2*TILE,text:'KOUPALIŠTĚ',color:'rgba(100,200,240,0.6)'},
    {wx:16*TILE,wy:8*TILE,text:'CENTRUM',color:'rgba(255,220,100,0.3)'},
    {wx:30.5*TILE,wy:8*TILE,text:'🇵🇱 CIESZYN',color:'rgba(255,255,255,0.3)'},
    {wx:2*TILE,wy:23*TILE,text:'KAUFLAND',color:'rgba(255,100,100,0.4)'},
    {wx:13*TILE,wy:28*TILE,text:'NÁDRAŽÍ',color:'rgba(200,180,140,0.4)'},
  ];
  for(const lb of labels){
    const [lx,ly]=wts(lb.wx,lb.wy);
    if(!onScreen(lx,ly,100))continue;
    ctx.fillStyle=lb.color;ctx.font='bold 13px sans-serif';ctx.textAlign='center';
    ctx.fillText(lb.text,lx,ly);
  }
  // Olza label
  const [olx,oly]=wts(28.5*TILE,14*TILE);
  if(onScreen(olx,oly,100)){ctx.fillStyle='rgba(100,180,255,0.5)';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText('OLZA',olx,oly);}
}

// ── Draw entities ─────────────────────────────────────────────────
function onScreen(sx,sy,m=60){return sx>-m&&sx<canvas.width+m&&sy>-m&&sy<canvas.height+m;}

function drawCar(c){
  const [sx,sy]=wts(c.wx,c.wy); if(!onScreen(sx,sy,80))return;
  ctx.save();ctx.translate(sx,sy);ctx.rotate(c.angle);

  if(c.exploding>0){
    const t=c.exploding/60;
    ctx.globalAlpha=t;
    // Wreckage
    ctx.fillStyle='#333';ctx.beginPath();ctx.roundRect(-18,-11,36,22,4);ctx.fill();
    ctx.fillStyle=`rgba(255,${Math.floor(100*t)},0,${t})`;
    ctx.beginPath();ctx.ellipse(0,0,14,8,0,0,Math.PI*2);ctx.fill();
    if(frame%2===0)boom(c.wx,c.wy,'#ff8800',1);
    ctx.restore();return;
  }

  // Shadow
  ctx.fillStyle='rgba(0,0,0,0.2)';ctx.beginPath();ctx.ellipse(2,2,20,13,0,0,Math.PI*2);ctx.fill();

  // Car body
  ctx.fillStyle=c.color;
  ctx.beginPath();ctx.roundRect(-17,-12,34,24,5);ctx.fill();
  // Body sheen
  const shine=ctx.createLinearGradient(-17,-12,17,-12);
  shine.addColorStop(0,'rgba(255,255,255,0.3)');shine.addColorStop(0.5,'rgba(255,255,255,0)');
  ctx.fillStyle=shine;ctx.beginPath();ctx.roundRect(-17,-12,34,12,5);ctx.fill();

  // Windshield (front)
  ctx.fillStyle='rgba(150,220,255,0.7)';ctx.beginPath();ctx.roundRect(-9,-10,18,10,3);ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,0.3)';ctx.lineWidth=0.5;ctx.stroke();
  // Rear window
  ctx.fillStyle='rgba(120,180,220,0.5)';ctx.beginPath();ctx.roundRect(-8,2,16,8,2);ctx.fill();

  // Wheels (4 rohové)
  ctx.fillStyle='#222';
  [[-13,-10],[-13,9],[13,-10],[13,9]].forEach(([wx,wy])=>{
    ctx.beginPath();ctx.ellipse(wx,wy,4,3,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#555';ctx.beginPath();ctx.ellipse(wx,wy,2,1.5,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#222';
  });

  // Headlights
  ctx.fillStyle='#ffe';ctx.shadowColor='rgba(255,255,200,0.8)';ctx.shadowBlur=6;
  ctx.fillRect(13,-10,4,5);ctx.fillRect(13,5,4,5);
  ctx.shadowBlur=0;

  // Taillights
  ctx.fillStyle='#ff2200';ctx.fillRect(-17,-10,3,4);ctx.fillRect(-17,6,3,4);

  // HP bar
  if(c.hp<3){
    ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(-17,-17,34,4);
    ctx.fillStyle=c.hp===2?'#ff8800':'#ff2200';ctx.fillRect(-17,-17,(34/3)*c.hp,4);
  }
  ctx.restore();
}

function drawNPC(n){
  const [sx,sy]=wts(n.wx,n.wy); if(!onScreen(sx,sy,40))return;
  const walkCycle=Math.sin(frame*0.18)*6;
  ctx.save();ctx.translate(sx,sy);
  if(n.scared>0)ctx.rotate(Math.sin(frame*0.35)*0.25);

  // Shadow
  ctx.fillStyle='rgba(0,0,0,0.18)';ctx.beginPath();ctx.ellipse(0,14,7,3,0,0,Math.PI*2);ctx.fill();

  // Legs (walking animation)
  ctx.fillStyle=n.color==='#4488ff'?'#1133aa':n.color==='#ff8844'?'#883311':'#333';
  ctx.beginPath();ctx.ellipse(-3,10+walkCycle*0.3,3,5,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(3,10-walkCycle*0.3,3,5,0,0,Math.PI*2);ctx.fill();

  // Body
  ctx.fillStyle=n.color;
  ctx.beginPath();ctx.roundRect(-6,-2,12,14,3);ctx.fill();
  // Body sheen
  ctx.fillStyle='rgba(255,255,255,0.15)';ctx.beginPath();ctx.roundRect(-6,-2,12,6,3);ctx.fill();

  // Arms
  ctx.fillStyle=n.color;
  ctx.beginPath();ctx.ellipse(-8,2+walkCycle*0.2,2.5,5,0.2,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(8,2-walkCycle*0.2,2.5,5,-0.2,0,Math.PI*2);ctx.fill();

  // Head
  ctx.fillStyle='#f5c5a0';ctx.beginPath();ctx.arc(0,-8,7,0,Math.PI*2);ctx.fill();
  // Face shade
  ctx.fillStyle='rgba(0,0,0,0.08)';ctx.beginPath();ctx.arc(2,-7,4,0,Math.PI*2);ctx.fill();
  // Eyes
  ctx.fillStyle='#333';ctx.beginPath();ctx.arc(-2,-8,1.2,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(2,-8,1.2,0,Math.PI*2);ctx.fill();

  if(n.scared>100){
    ctx.fillStyle='rgba(255,50,50,0.9)';ctx.font='bold 16px sans-serif';ctx.textAlign='center';
    ctx.fillText('!!',0,-24);
  }
  ctx.restore();
}

function drawCogan(c){
  const [sx,sy]=wts(c.wx,c.wy); if(!onScreen(sx,sy,50))return;
  ctx.save();ctx.translate(sx,sy);
  if(c.mode==='chase')ctx.rotate(Math.sin(frame*0.25)*0.2);
  // Tělo
  ctx.fillStyle=c.color;ctx.beginPath();ctx.ellipse(0,5,9,13,0,0,Math.PI*2);ctx.fill();
  // Hlava
  ctx.fillStyle='#c09070';ctx.beginPath();ctx.arc(0,-10,8,0,Math.PI*2);ctx.fill();
  // Vlasy (mohawk agresivní)
  ctx.fillStyle='#111';ctx.fillRect(-8,-21,16,12);
  if(c.mode!=='scared'){ctx.fillStyle='#ff2200';for(let i=0;i<3;i++)ctx.fillRect(-3+i*4,-27,3,8);}
  // Oči
  ctx.fillStyle=c.mode==='scared'?'#88aaff':'#ff1010';
  ctx.fillRect(-5,-13,3,2);ctx.fillRect(2,-13,3,2);
  // HP bar
  if(c.hp<2){ctx.fillStyle='rgba(0,0,0,0.4)';ctx.fillRect(-10,-30,20,3);ctx.fillStyle='#ff4400';ctx.fillRect(-10,-30,10,3);}
  if(c.mode==='chase'){ctx.font='bold 16px sans-serif';ctx.textAlign='center';ctx.fillText('💀',0,-36);}
  if(c.mode==='scared'){ctx.font='14px sans-serif';ctx.textAlign='center';ctx.fillText('😱',0,-30);}
  // "koupou se v kašně" effect — pokud jsou blízko fontány
  if(wdist(c.wx,c.wy,FOUNTAIN_WX,FOUNTAIN_WY)<60){ctx.fillStyle='rgba(100,200,255,0.4)';ctx.beginPath();ctx.arc(0,12,14,0,Math.PI*2);ctx.fill();}
  ctx.restore();
}

function drawPigeon(p){
  const [sx,sy]=wts(p.wx,p.wy); if(!onScreen(sx,sy,40))return;
  const bob=Math.sin(p.wobble)*2.5;
  const wingFlap=Math.abs(Math.sin(p.wobble*2));
  ctx.save();ctx.translate(sx,sy+bob);

  // Shadow
  ctx.fillStyle='rgba(0,0,0,0.15)';ctx.beginPath();ctx.ellipse(0,10,8,3,0,0,Math.PI*2);ctx.fill();

  // Wings (animovaná mávnutí)
  ctx.fillStyle=`hsl(0,0%,${42+wingFlap*10}%)`;
  ctx.beginPath();ctx.ellipse(-8,-3,10+wingFlap*3,4+wingFlap*2,-0.3,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(8,-3,10+wingFlap*3,4+wingFlap*2,0.3,0,Math.PI*2);ctx.fill();
  // Wing feather detail
  ctx.strokeStyle='rgba(0,0,0,0.15)';ctx.lineWidth=0.8;
  for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(-5+i*4,-3);ctx.lineTo(-8+i*4,2);ctx.stroke();}
  for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(5-i*4,-3);ctx.lineTo(8-i*4,2);ctx.stroke();}

  // Tělo
  ctx.fillStyle='#909090';ctx.beginPath();ctx.ellipse(0,2,10,7,0,0,Math.PI*2);ctx.fill();
  // Breast (zelené/fialové zbarvení holubia)
  ctx.fillStyle='rgba(80,120,80,0.4)';ctx.beginPath();ctx.ellipse(-1,3,5,4,0,0,Math.PI*2);ctx.fill();

  // Hlava
  ctx.fillStyle='#b0b0b0';ctx.beginPath();ctx.arc(-8,-4,5,0,Math.PI*2);ctx.fill();
  // Evil red eye
  ctx.fillStyle='#dd0000';ctx.beginPath();ctx.arc(-9,-5,1.8,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#ff6060';ctx.beginPath();ctx.arc(-9.4,-5.4,0.7,0,Math.PI*2);ctx.fill();
  // Zobák
  ctx.fillStyle='#e8a840';
  ctx.beginPath();ctx.moveTo(-13,-4);ctx.lineTo(-17,-3.5);ctx.lineTo(-13,-2.5);ctx.closePath();ctx.fill();

  // Nožičky
  ctx.strokeStyle='#cc8820';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(-2,8);ctx.lineTo(-4,12);ctx.moveTo(-4,12);ctx.lineTo(-6,12);ctx.moveTo(-4,12);ctx.lineTo(-3,13);ctx.stroke();
  ctx.beginPath();ctx.moveTo(2,8);ctx.lineTo(4,12);ctx.moveTo(4,12);ctx.lineTo(6,12);ctx.moveTo(4,12);ctx.lineTo(3,13);ctx.stroke();

  ctx.restore();
}

function drawFry(f){
  const [sx,sy]=wts(f.wx,f.wy); if(!onScreen(sx,sy,20))return;
  ctx.save();ctx.translate(sx,sy);ctx.rotate(f.angle);
  ctx.fillStyle='#ffd700';ctx.strokeStyle='#b8860b';ctx.lineWidth=1;
  ctx.fillRect(-3,-9,6,18);ctx.strokeRect(-3,-9,6,18);
  ctx.restore();
}

function drawBag(b){
  const [sx,sy]=wts(b.wx,b.wy); if(!onScreen(sx,sy,30))return;
  const bob=Math.sin(frame*0.05+b.bob)*4;
  ctx.save();ctx.translate(sx,sy+bob);
  ctx.fillStyle='#f0f0f0';ctx.strokeStyle='#aaa';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(-9,-7);ctx.lineTo(-11,9);ctx.lineTo(11,9);ctx.lineTo(9,-7);ctx.closePath();
  ctx.fill();ctx.stroke();
  ctx.strokeStyle='#888';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(-9,-7);ctx.quadraticCurveTo(0,-15,9,-7);ctx.stroke();
  ctx.fillStyle='#999';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('?',0,2);
  ctx.restore();
}

function drawParticles(){
  for(const p of particles){
    const [sx,sy]=wts(p.wx,p.wy); if(!onScreen(sx,sy,20))continue;
    ctx.save();ctx.globalAlpha=p.life/40;ctx.fillStyle=p.color;
    ctx.beginPath();ctx.arc(sx,sy,p.r,0,Math.PI*2);ctx.fill();ctx.restore();
  }
}

// ── Draw Šimmy Prznič ─────────────────────────────────────────────
// Sprite sheet layout (IMG_2127): front idle je vlevo nahoře v pixel art sekci
// Fallback: procedurální pokud sprite není načtený
function drawPlayer(){
  const [sx,sy]=wts(player.wx,player.wy);
  const moving=Math.hypot(player.vx,player.vy)>0.3;
  const walkPhase=frame*0.18;

  ctx.save();ctx.translate(sx,sy);ctx.rotate(player.angle);

  // Shadow
  ctx.fillStyle='rgba(0,0,0,0.25)';ctx.beginPath();ctx.ellipse(0,32,18,6,0,0,Math.PI*2);ctx.fill();

  // Zkus použít sprite sheet — front sprite je přibližně v levé části sheetu
  // Sheet je ca 600x800px, front sprite ca na (20, 200) velikost 80x120
  const useSprite = spriteImg.complete && spriteImg.naturalWidth > 0;
  if(useSprite){
    const sw=spriteImg.naturalWidth, sh=spriteImg.naturalHeight;
    // Front view sprite je v dolní části sheetu (IN-GAME sekce)
    // Odhadované souřadnice — dolní řada, první frame
    const frameW=sw*0.18, frameH=sh*0.22;
    const fx=sw*0.02, fy=sh*0.72; // přibližná pozice front idle v sheetu
    const walkOff=moving?Math.floor(frame/8)%2:0;
    ctx.drawImage(spriteImg, fx+walkOff*frameW, fy, frameW, frameH, -28, -36, 56, 72);
  } else {
    // Procedurální fallback
    const legSwing=moving?Math.sin(walkPhase)*8:0;
    ctx.fillStyle='#1a1a3a';
    ctx.beginPath();ctx.ellipse(-8,28+legSwing*0.5,6,9,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(8,28-legSwing*0.5,6,9,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=player.powered?`hsl(${frame*8%360},80%,50%)`:'#3a3a9a';
    ctx.beginPath();ctx.ellipse(0,10,16,20,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.12)';ctx.beginPath();ctx.ellipse(0,2,14,8,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#5555cc';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-16,6);ctx.lineTo(16,6);ctx.stroke();
    // Ruce
    ctx.fillStyle='#f5c5a0';
    ctx.save();ctx.translate(-22,6+legSwing*0.3);ctx.rotate(-0.3+legSwing*0.02);
    ctx.beginPath();ctx.ellipse(0,0,4,11,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#c8a012';ctx.fillRect(-3,8,6,14);
    ctx.fillStyle='rgba(255,255,255,0.3)';ctx.fillRect(-3,8,6,5);ctx.restore();
    ctx.fillStyle='#f5c5a0';
    ctx.save();ctx.translate(22,6-legSwing*0.3);ctx.rotate(0.3-legSwing*0.02);
    ctx.beginPath();ctx.ellipse(0,0,4,11,0,0,Math.PI*2);ctx.fill();ctx.restore();
  }

  // Hlava — vždy z real fotky (na sprite sheetu taky je, ale crop z fotky vypadá lépe)
  const HR=useSprite?18:24;
  const headY=useSprite?-26:-18;
  ctx.save();ctx.beginPath();ctx.arc(0,headY,HR,0,Math.PI*2);ctx.clip();
  if(simImg.complete&&simImg.naturalWidth>0){
    const iw=simImg.naturalWidth,ih=simImg.naturalHeight;
    ctx.drawImage(simImg,iw*0.12,ih*0.02,iw*0.76,ih*0.58,-HR,headY-HR,HR*2,HR*2);
  } else {ctx.fillStyle='#f5c5a0';ctx.fillRect(-HR,headY-HR,HR*2,HR*2);}
  ctx.restore();
  ctx.strokeStyle='rgba(0,0,0,0.5)';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.arc(0,headY,HR,0,Math.PI*2);ctx.stroke();

  // Cigareta
  ctx.save();ctx.translate(HR*0.5,headY+HR*0.2);ctx.rotate(0.25);
  ctx.fillStyle='#f0f0f0';ctx.fillRect(0,0,14,2.5);
  ctx.fillStyle='#c8401a';ctx.beginPath();ctx.arc(15,1.2,2.5,0,Math.PI*2);ctx.fill();
  if(frame%22<10){ctx.fillStyle='rgba(200,200,200,0.35)';ctx.beginPath();ctx.arc(18,-4,4,0,Math.PI*2);ctx.fill();}
  ctx.restore();

  // Power-up aura
  if(player.powered){
    ctx.strokeStyle=`hsl(${frame*12%360},100%,60%)`;
    ctx.lineWidth=3;ctx.shadowColor=`hsl(${frame*12%360},100%,50%)`;ctx.shadowBlur=12;
    ctx.beginPath();ctx.arc(0,0,36,0,Math.PI*2);ctx.stroke();
    ctx.shadowBlur=0;
  }
  ctx.restore();
}

function drawJoystick(){
  if(!joy.active)return;
  ctx.save();ctx.globalAlpha=0.35;ctx.strokeStyle='#fff';ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(joy.ox,joy.oy,65,0,Math.PI*2);ctx.stroke();
  ctx.globalAlpha=0.6;ctx.fillStyle='#fff';
  ctx.beginPath();ctx.arc(joy.ox+joy.dx,joy.oy+joy.dy,22,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

// ── Minimap ───────────────────────────────────────────────────────
function drawMinimap(){
  const mx=canvas.width-90,my=50,mw=72,mh=72;
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(mx,my,mw,mh);
  for(let ty=0;ty<WH;ty++) for(let tx=0;tx<WW;tx++){
    const t=MAP[ty][tx];
    const col=t===T.BUILDING?'#333':t===T.ROAD?'#666':t===T.SIDEWALK?'#555':
      t===T.WATER||t===T.POOL?'#1a6090':t===T.BRIDGE?'#8a7040':t===T.PLAZA?'#d0b870':
      t===T.FOREST?'#1c5c0a':t===T.POOLSIDE?'#0070b8':t===T.HOUSING?'#555':
      t===T.KAUFLAND?'#c82020':t===T.POLAND?'#9a7050':t===T.RAILWAY?'#888':null;
    if(!col)continue;
    ctx.fillStyle=col;ctx.fillRect(mx+tx*(mw/WW),my+ty*(mh/WH),mw/WW+0.5,mh/WH+0.5);
  }
  // Player dot
  const px=mx+(player.wx/WPX)*mw, py=my+(player.wy/WPY)*mh;
  ctx.fillStyle='#ffd700';ctx.beginPath();ctx.arc(px,py,3,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.4)';ctx.lineWidth=1;ctx.strokeRect(mx,my,mw,mh);
  ctx.restore();
}

// ── Achievement popups ─────────────────────────────────────────────
function drawAchPopups(){
  let off=0;
  for(const p of achPopups){
    const al=Math.min(1,p.timer/30), y=canvas.height-120-off;
    ctx.save();ctx.globalAlpha=al;
    ctx.fillStyle='rgba(20,20,40,0.92)';ctx.beginPath();ctx.roundRect(canvas.width/2-120,y,240,44,10);ctx.fill();
    ctx.strokeStyle='#ffd700';ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(canvas.width/2-120,y,240,44,10);ctx.stroke();
    ctx.fillStyle='#ffd700';ctx.font='bold 15px sans-serif';ctx.textAlign='center';
    ctx.fillText(p.text,canvas.width/2,y+26);
    ctx.restore();off+=50;
  }
}

// ── Location label ─────────────────────────────────────────────────
function drawLocationLabel(){
  // Shop prompt
  if(nearShop&&state==='PLAYING'){
    ctx.save();
    const pulse=0.9+0.1*Math.sin(frame*0.12);
    ctx.globalAlpha=0.95;
    ctx.fillStyle='rgba(20,100,40,0.92)';ctx.beginPath();ctx.roundRect(canvas.width/2-130,canvas.height-90,260,56,10);ctx.fill();
    ctx.strokeStyle='#44ff88';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(canvas.width/2-130,canvas.height-90,260,56,10);ctx.stroke();
    ctx.fillStyle='#aaffaa';ctx.font='bold 14px sans-serif';ctx.textAlign='center';
    ctx.fillText('🍺 Jete potraviny (Mirerry)',canvas.width/2,canvas.height-68);
    ctx.fillStyle='#fff';ctx.font='13px sans-serif';
    const canBuy=score>=80&&lives<5&&shopCooldown===0;
    ctx.fillText(canBuy?`👆 TAP — kup lahváč (-80 bodů) +1 ❤️`:(lives>=5?'Jseš namazanej dost!':'Málo drobáků (80 bodů)'),canvas.width/2,canvas.height-48);
    ctx.restore();
    return;
  }
  if(!currentLocationLabel)return;
  ctx.save();ctx.globalAlpha=0.85;
  ctx.fillStyle='rgba(0,0,0,0.55)';ctx.beginPath();ctx.roundRect(canvas.width/2-110,canvas.height-52,220,32,8);ctx.fill();
  ctx.fillStyle='#ffd700';ctx.font='bold 14px sans-serif';ctx.textAlign='center';
  ctx.fillText(currentLocationLabel,canvas.width/2,canvas.height-31);
  ctx.restore();
}

// ── Zone indicator ─────────────────────────────────────────────────
function drawZoneHUD(){
  const zone=getZone();
  const ztext=zone==='NAMESTI'?'⚠️ NÁMĚSTÍ — HARD MODE':zone==='CENTER'?'🏙️ Centrum':null;
  if(!ztext)return;
  ctx.save();ctx.globalAlpha=0.7;
  ctx.fillStyle=zone==='NAMESTI'?'rgba(180,0,0,0.5)':'rgba(0,0,0,0.4)';
  ctx.beginPath();ctx.roundRect(canvas.width/2-100,8,200,28,8);ctx.fill();
  ctx.fillStyle='#fff';ctx.font='bold 13px sans-serif';ctx.textAlign='center';
  ctx.fillText(ztext,canvas.width/2,27);
  ctx.restore();
}

// ── GTA-style text helper ──────────────────────────────────────────
function gtaText(text, x, y, size, fillCol='#ffd700', strokeCol='#000', sw=6){
  const font = `bold ${size}px Oswald, Impact, "Arial Black", sans-serif`;
  ctx.font = font;
  ctx.letterSpacing = '2px';
  ctx.textAlign = 'center';
  ctx.lineWidth = sw;
  ctx.strokeStyle = strokeCol;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fillCol;
  ctx.fillText(text, x, y);
  ctx.letterSpacing = '0px';
}

// ── Menu ───────────────────────────────────────────────────────────
function drawMenu(){
  const W=canvas.width, H=canvas.height;
  ctx.save();

  // Pozadí — GTA splash
  if(menuBg.complete && menuBg.naturalWidth > 0){
    const bw=menuBg.naturalWidth, bh=menuBg.naturalHeight;
    const scale=Math.max(W/bw, H/bh);
    const dw=bw*scale, dh=bh*scale;
    ctx.drawImage(menuBg, (W-dw)/2, (H-dh)/2, dw, dh);
  } else {
    ctx.fillStyle='#111'; ctx.fillRect(0,0,W,H);
  }

  // Gradient overlay dole
  const grad=ctx.createLinearGradient(0, H*0.55, 0, H);
  grad.addColorStop(0,'rgba(0,0,0,0)');
  grad.addColorStop(0.4,'rgba(0,0,0,0.65)');
  grad.addColorStop(1,'rgba(0,0,0,0.92)');
  ctx.fillStyle=grad; ctx.fillRect(0,H*0.55,W,H*0.45);

  // Rekord + achievementy
  const done = Object.keys(achUnlocked).length;
  if(hiScore > 0 || done > 0){
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.roundRect(W/2-130, H*0.64, 260, done>0?52:30, 8); ctx.fill();
    if(hiScore > 0) gtaText(`REKORD: ${hiScore}`, W/2, H*0.64+20, 15, '#ffd700','#000',4);
    if(done > 0) gtaText(`★ ${done}/${ACHS.length} ACHIEVEMENTŮ`, W/2, H*0.64+42, 12,'#ffcc44','#000',3);
    ctx.restore();
  }

  // Hint
  ctx.fillStyle='rgba(255,255,255,0.45)';
  ctx.font='12px Oswald, sans-serif'; ctx.textAlign='center';
  ctx.fillText('📱 táhni = pohyb  |  🖥️ WASD / šipky', W/2, H*0.74);
  ctx.fillText('auto-míří na nepřátele  •  Jete potraviny = lahváč za body', W/2, H*0.78);

  // ── NOVÁ KRA button (GTA styl) ──
  const bp = 1 + 0.04*Math.sin(frame*0.08);
  ctx.save();
  ctx.translate(W/2, H*0.86);
  ctx.scale(bp, bp);
  // Stín
  ctx.fillStyle='rgba(0,0,0,0.5)';
  ctx.beginPath(); ctx.roundRect(-100, -26, 200, 50, 4); ctx.fill();
  // Tlačítko — tmavé s golden border (GTA UI styl)
  ctx.fillStyle='rgba(10,10,10,0.88)';
  ctx.beginPath(); ctx.roundRect(-98, -24, 196, 48, 4); ctx.fill();
  ctx.strokeStyle='#c8a800'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.roundRect(-98, -24, 196, 48, 4); ctx.stroke();
  // Text
  gtaText('▶  NOVÁ KRA', 0, 10, 22, '#ffd700', '#000', 5);
  ctx.restore();

  // Disclaimer
  ctx.fillStyle='rgba(255,255,255,0.3)';
  ctx.font='9px sans-serif'; ctx.textAlign='center';
  ctx.fillText('Všechny události, postavy a místa jsou fiktivní, shoda s reálnými lidmi je čistě náhodná xd', W/2, H-8);

  ctx.restore();
  frame++;
}

function drawGameOver(){
  const W=canvas.width, H=canvas.height;
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,0.84)'; ctx.fillRect(0,0,W,H);

  gtaText('ŠIMMY PADL', W/2, H/2-95, 42, '#ff2020','#000',8);
  gtaText(`SKÓRE: ${score}`, W/2, H/2-52, 28, '#ffd700','#000',5);

  ctx.fillStyle='#888'; ctx.font='15px Oswald,sans-serif'; ctx.textAlign='center';
  ctx.fillText(`Rekord: ${hiScore}`, W/2, H/2-22);
  ctx.fillStyle='#bbb'; ctx.font='13px sans-serif';
  ctx.fillText(`🕊️ ${pigKills} holubů  😤 ${coganKills} coganů  🚗 ${carsGot} aut  💊 ${bagsGot} pytlíčků`, W/2, H/2+4);

  const done=Object.keys(achUnlocked);
  if(done.length>0){
    ctx.fillStyle='#ffcc44'; ctx.font='12px Oswald,sans-serif';
    ctx.fillText(`★ ${done.length}/${ACHS.length} achievementů odemčeno`, W/2, H/2+28);
  }

  const bp=1+0.05*Math.sin(frame*0.08);
  ctx.save();
  ctx.translate(W/2, H/2+88); ctx.scale(bp,bp);
  ctx.fillStyle='rgba(10,10,10,0.88)';
  ctx.beginPath(); ctx.roundRect(-98,-24,196,48,4); ctx.fill();
  ctx.strokeStyle='#c8a800'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.roundRect(-98,-24,196,48,4); ctx.stroke();
  gtaText('🔄  ZNOVU', 0, 10, 22, '#ffd700','#000',5);
  ctx.restore();
  ctx.restore();
  frame++;
}

// ── Main loop ─────────────────────────────────────────────────────
function loop(){
  requestAnimationFrame(loop);
  if(state==='MENU'){drawMap();drawMenu();return;}
  if(state==='PLAYING')update();
  drawMap();
  for(const b of bags)drawBag(b);
  for(const f of fries)drawFry(f);
  for(const n of npcs)drawNPC(n);
  for(const c of cars)drawCar(c);
  for(const p of pigeons)drawPigeon(p);
  for(const c of cogani)drawCogan(c);
  drawParticles();
  drawPlayer();
  drawJoystick();
  drawMinimap();
  drawZoneHUD();
  drawLocationLabel();
  drawAchPopups();
  if(state==='DEAD')drawGameOver();
}

livesEl.textContent='❤️'.repeat(lives);
loop();
