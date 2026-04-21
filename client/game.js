// ==============================================================
// NEURAL SURVIVAL: FRACTURE REALM — Colyseus multiplayer build
// Vanilla canvas. Multiplayer powered by ws://localhost:2567
// ==============================================================

// ---- Colyseus client ----
const client = new Colyseus.Client("wss://my-game-server-production-aef3.up.railway.app");
let activeRoom = null;

// ---- Friendly error alerts (kept lightweight) ----
window.onerror = (msg, url, line) => console.error("GAME ERROR:", msg, url+":"+line);
window.onunhandledrejection = (event) => console.error("ASYNC ERROR:", event.reason);

// ---------- Hero defs ----------
const HEROES = {
  james: { name:"James", role:"Sword Tank",   img:"heroes/james.png",  hp:180, speed:200, dmg:34, atkCd:0.45, range:62,  abi:"Whirlwind",   abiCd:7,  color:"#22e8ff", desc:"High HP melee bruiser. Strong cleaving sword and a 360° whirlwind that staggers and damages." },
  jake:  { name:"Jake",  role:"Wand Mage",    img:"heroes/jake.png",   hp:95,  speed:215, dmg:22, atkCd:0.85, range:520, abi:"Arcane Nova", abiCd:8,  color:"#ff2bd6", desc:"Slow, powerful magic missiles. Q unleashes a violet nova that detonates outward in a ring." },
  joross:{ name:"Joross",role:"Plasma Gunner",img:"heroes/joross.png", hp:120, speed:225, dmg:9,  atkCd:0.10, range:480, abi:"Suppress",    abiCd:6,  color:"#ff8a3d", desc:"Continuous plasma fire. Q triples fire-rate for 3s and pierces lightly armored foes." },
  jeb:   { name:"Jeb",   role:"Cross Healer", img:"heroes/jeb.png",    hp:110, speed:215, dmg:14, atkCd:0.55, range:380, abi:"Sanctum",     abiCd:9,  color:"#3dffb0", desc:"Holy bolts and a healing zone." },
  jeff:  { name:"Jeff",  role:"Assassin",     img:"heroes/jeff.png",   hp:70,  speed:285, dmg:48, atkCd:0.35, range:48,  abi:"Phase Slash", abiCd:5,  color:"#ff3d6a", desc:"Glass cannon. Tiny HP, blinding speed, lethal twin daggers." },
};
const HERO_IDS = Object.keys(HEROES);

// ---------- Upgrades ----------
const UPGRADES = [
  { id:"speed", name:"Neon Sprint", desc:"+15% movement speed.", apply:p=>p.mods.speed*=1.15 },
  { id:"cdr",   name:"Overclock",   desc:"-20% all cooldowns.",  apply:p=>{p.mods.cdr*=0.8} },
  { id:"shield",name:"Phase Shield",desc:"Gain a 40 HP shield that regenerates out of combat.", apply:p=>{p.mods.shieldMax+=40; p.shield=p.mods.shieldMax} },
  { id:"aura",  name:"Damage Aura", desc:"Burn nearby enemies for 12 dps.", apply:p=>{p.mods.aura+=12} },
  { id:"slow",  name:"Time Dilation", desc:"Enemies near you slow by 25%.", apply:p=>{p.mods.slow=Math.min(0.6, p.mods.slow+0.25)} },
  { id:"regen", name:"Bio-Weave",  desc:"Regenerate 4 HP/s.", apply:p=>{p.mods.regen+=4} },
  { id:"weapon",name:"Weapon Tuning", desc:"+25% damage, +10% range.", apply:p=>{p.mods.dmg*=1.25; p.mods.range*=1.10} },
  { id:"firerate", name:"Trigger Discipline", desc:"+25% attack speed.", apply:p=>{p.mods.atkSpd*=1.25} },
  { id:"vamp", name:"Vampiric Edge", desc:"Heal 8% of damage dealt.", apply:p=>{p.mods.lifesteal+=0.08} },
];

// ---------- Globals ----------
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
let W=0,H=0,DPR=Math.min(2, window.devicePixelRatio||1);
let ZOOM = 1; // <1 zooms out so the player sees more of the world
function computeZoom(){
  const minSide = Math.min(W,H);
  if(minSide < 500) ZOOM = 0.6;
  else if(minSide < 800) ZOOM = 0.78;
  else ZOOM = 1;
}
function resize(){
  const vv = window.visualViewport;
  W = Math.round(vv ? vv.width  : window.innerWidth);
  H = Math.round(vv ? vv.height : window.innerHeight);
  DPR = Math.min(2, window.devicePixelRatio||1);
  cvs.width=Math.round(W*DPR); cvs.height=Math.round(H*DPR);
  cvs.style.width=W+'px'; cvs.style.height=H+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
  computeZoom();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', ()=>setTimeout(resize,150));
if(window.visualViewport){
  window.visualViewport.addEventListener('resize', resize);
  window.visualViewport.addEventListener('scroll', resize);
}
resize();

// ---------- Wave config ----------
const WAVE_PREP = 10;          // seconds of preparation/banner before enemies appear
const WAVE_ENEMIES = (n)=> 8 + n*4;          // total enemies in wave n (1-based)
const WAVE_SPAWN_INTERVAL = (n)=> Math.max(0.35, 1.2 - n*0.06);

// ---------- SFX engine ----------
const SFX = (() => {
  const BASE = 'sounds/';
  const VOL = { sfx: 0.7, music: 0.35 };
  const pools = {};
  const POOL_SIZE = 4;
  function makePool(src){ const arr=[]; for(let i=0;i<POOL_SIZE;i++){ const a=new Audio(src); a.preload='auto'; a.volume=VOL.sfx; arr.push(a); } return {arr,i:0}; }
  function getPool(key, src){ if(!pools[key]) pools[key]=makePool(src); return pools[key]; }
  function play(key, src){ try{ const p=getPool(key,src); const a=p.arr[p.i]; p.i=(p.i+1)%p.arr.length; a.currentTime=0; a.volume=VOL.sfx; const pr=a.play(); if(pr&&pr.catch) pr.catch(()=>{});}catch(e){} }
  function fire(h='james'){play('fire_'+h, `${BASE}fire_${h}.mp3`);}
  function ability(h='james'){play('q_'+h, `${BASE}q_${h}.mp3`);}
  function dash(){play('dash', `${BASE}dash.mp3`);}
  function hit(){play('hit', `${BASE}hit.mp3`);}
  function hurt(){play('hurt', `${BASE}hurt.mp3`);}
  let music=null, currentTrack=null;
  function playMusic(track){
    if(currentTrack===track && music && !music.paused) return;
    stopMusic();
    try{ music=new Audio(`${BASE}${track}.mp3`); music.loop=true; music.volume=VOL.music; currentTrack=track; const pr=music.play(); if(pr&&pr.catch) pr.catch(()=>{});}catch(e){}
  }
  function stopMusic(){ if(music){try{music.pause();}catch(e){} music=null;} currentTrack=null; }
  function unlock(){ if(music && music.paused) music.play().catch(()=>{}); }
  ['pointerdown','touchstart','keydown','click'].forEach(ev=>window.addEventListener(ev, unlock, {passive:true}));
  return { fire, ability, dash, hit, hurt, unlock, playMusic, stopMusic };
})();

const state = {
  scene: 'menu',
  mode: 'single',
  username: localStorage.getItem('ns_user') || '',
  hero: localStorage.getItem('ns_hero') || 'james',
  heroPortraits: {},
  player: null,
  others: new Map(),
  enemies: [], bullets: [], fx: [], pickups: [],
  arena: { w:2200, h:1500 },
  cam: {x:0,y:0,shake:0},
  time: 0, score: 0, kills: 0, fracture: 0,
  // Wave system
  wave: 0,
  wavePhase: 'prep',          // 'prep' | 'active' | 'upgrade'
  waveTimer: WAVE_PREP,       // counts down during prep
  waveSpawnTimer: 0,
  waveToSpawn: 0,             // remaining enemies to spawn in current wave
  waveEnemiesAlive: 0,        // tracks enemies that belong to this wave still alive
  paused: false, running: false, startedAt: 0,
  // MP
  roomCode: null,
  isHost: false,
  mySessionId: null,
  lobby: { players: new Map(), countdown: 0, phase:'waiting' },
};

async function loadHeroImages(){
  await Promise.all(HERO_IDS.map(id=>new Promise((res)=>{
    const img = new Image(); img.onload=()=>res(); img.onerror=()=>res();
    img.src = HEROES[id].img;
    state.heroPortraits[id] = img;
  })));
}

// ---------- UI helpers ----------
const $ = sel => document.querySelector(sel);
const show = (id, on=true) => { const el=document.getElementById(id); if(!el)return; el.classList[on?'remove':'add']('hidden'); };
function setScene(s){
  state.scene = s;
  ['menu','heroSelect','mpMenu','lobby','leaderScreen','endScreen'].forEach(id=>show(id, id===s));
  show('hud', s==='game');
  const tui = document.getElementById('touchUI');
  if(tui){ tui.classList.toggle('on', IS_TOUCH && s==='game'); }
  if(s==='game') SFX.playMusic('bgm_game'); else SFX.playMusic('bgm_menu');
}
function toast(msg, ms=1600){
  const t=$('#toast'); t.textContent=msg; t.style.display='block';
  clearTimeout(toast._t); toast._t=setTimeout(()=>t.style.display='none', ms);
}

function renderHeroGrid(){
  const grid = $('#heroGrid'); grid.innerHTML='';
  HERO_IDS.forEach(id=>{
    const h = HEROES[id];
    const card = document.createElement('div');
    card.className = 'hero-card' + (state.hero===id ? ' selected':'');
    card.innerHTML = `
      <img src="${h.img}" alt="${h.name}" loading="lazy" width="512" height="512" />
      <div class="meta">
        <div class="role">${h.role}</div>
        <h3>${h.name}</h3>
        <div class="stats">
          <div>HP <div class="stat-bar"><i style="width:${Math.min(100, h.hp/2)}%"></i></div></div>
          <div>SPD <div class="stat-bar"><i style="width:${(h.speed-180)/1.2}%"></i></div></div>
          <div>DMG <div class="stat-bar"><i style="width:${Math.min(100, h.dmg*1.6)}%"></i></div></div>
          <div>ABI <div class="stat-bar"><i style="width:${100 - h.abiCd*8}%"></i></div></div>
        </div>
      </div>`;
    card.onclick = ()=>{ state.hero=id; localStorage.setItem('ns_hero', id); renderHeroGrid(); $('#heroDesc').innerHTML = `<b style="color:${h.color}">${h.name} · ${h.role}</b> — ${h.desc}<br/><span style="opacity:.7">Q Ability: <b>${h.abi}</b> (${h.abiCd}s)</span>`; };
    grid.appendChild(card);
  });
  const h = HEROES[state.hero];
  $('#heroDesc').innerHTML = `<b style="color:${h.color}">${h.name} · ${h.role}</b> — ${h.desc}<br/><span style="opacity:.7">Q Ability: <b>${h.abi}</b> (${h.abiCd}s)</span>`;
}

// ---------- Input ----------
const keys = {};
const mouse = { x:0, y:0, down:false, moved:false };
const touch = { active:false, mx:0, my:0, stickId:-1, stickCx:0, stickCy:0, attack:false, dash:false, ability:false, dashEdge:false, abiEdge:false };
const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints>0) || window.matchMedia('(hover:none) and (pointer:coarse)').matches;

window.addEventListener('keydown', e=>{ keys[e.key.toLowerCase()] = true; if(e.key===' ') e.preventDefault(); });
window.addEventListener('keyup',   e=>{ keys[e.key.toLowerCase()] = false; });
cvs.addEventListener('mousemove', e=>{ const r=cvs.getBoundingClientRect(); mouse.x=e.clientX-r.left; mouse.y=e.clientY-r.top; mouse.moved=true; });
cvs.addEventListener('mousedown', ()=>{ mouse.down=true; });
cvs.addEventListener('mouseup',   ()=>{ mouse.down=false; });
cvs.addEventListener('contextmenu', e=>e.preventDefault());

function initTouchUI(){
  if(!IS_TOUCH) return;
  document.querySelectorAll('.mobile-hint').forEach(el=>el.style.display='inline');
  document.addEventListener('gesturestart', e=>e.preventDefault());
  const stick=$('#tStick'), base=$('#tBase'), knob=$('#tKnob'); const STICK_R=60;
  function updateStickPosition(){ const r=base.getBoundingClientRect(); touch.stickCx=r.left+r.width/2; touch.stickCy=r.top+r.height/2; }
  updateStickPosition(); window.addEventListener('resize', updateStickPosition);
  function moveKnob(cx,cy){ let dx=cx-touch.stickCx, dy=cy-touch.stickCy; const d=Math.hypot(dx,dy); if(d>STICK_R){dx=(dx/d)*STICK_R; dy=(dy/d)*STICK_R;} knob.style.transform=`translate(${dx}px,${dy}px)`; if(Math.hypot(dx,dy)<8){touch.mx=0;touch.my=0;} else {touch.mx=dx/STICK_R; touch.my=dy/STICK_R;} }
  stick.addEventListener('touchstart', e=>{ e.preventDefault(); updateStickPosition(); const t=e.changedTouches[0]; touch.stickId=t.identifier; touch.active=true; moveKnob(t.clientX,t.clientY); }, {passive:false});
  stick.addEventListener('touchmove',  e=>{ e.preventDefault(); for(const t of e.changedTouches){ if(t.identifier===touch.stickId) moveKnob(t.clientX,t.clientY); } }, {passive:false});
  function endStick(e){ for(const t of e.changedTouches){ if(t.identifier===touch.stickId){ touch.stickId=-1; touch.active=false; touch.mx=0; touch.my=0; knob.style.transform='translate(0,0)'; } } }
  stick.addEventListener('touchend', endStick); stick.addEventListener('touchcancel', endStick);
  function bindBtn(id,key){ const el=document.getElementById(id); el.addEventListener('touchstart', e=>{ e.preventDefault(); el.classList.add('pressed'); touch[key]=true; if(key==='dash') touch.dashEdge=true; if(key==='ability') touch.abiEdge=true; }, {passive:false}); const up=e=>{ e.preventDefault(); el.classList.remove('pressed'); touch[key]=false; }; el.addEventListener('touchend',up); el.addEventListener('touchcancel',up); }
  bindBtn('tAttack','attack'); bindBtn('tDash','dash'); bindBtn('tAbility','ability');
  cvs.addEventListener('touchmove', e=>e.preventDefault(), {passive:false});
}
initTouchUI();

function updateTouchCooldownUI(p){
  if(!IS_TOUCH || !p) return;
  const set = (id,cd,max)=>{ const el=document.getElementById(id); if(!el) return; const pct=max>0?Math.max(0,Math.min(100,(cd/max)*100)):0; el.style.setProperty('--cd', pct+'%'); el.classList.toggle('ready', cd<=0); };
  const h = HEROES[p.heroId];
  set('tAttack', p.atkCd, h.atkCd); set('tDash', p.dashCd, 2); set('tAbility', p.abiCd, h.abiCd);
}

function makePlayer(heroId, x, y, isLocal=true, id=null){
  const h = HEROES[heroId];
  return {
    id: id || ('p'+Math.random().toString(36).slice(2,8)),
    name: state.username || 'Operator',
    heroId, isLocal, x, y, vx:0, vy:0,
    hp: h.hp, hpMax: h.hp, shield:0, angle:0,
    dashCd:0, atkCd:0, abiCd:0, dashing:0,
    score:0, kills:0, alive:true,
    mods: { speed:1, cdr:1, dmg:1, range:1, atkSpd:1, shieldMax:0, aura:0, slow:0, regen:0, lifesteal:0 },
    abiState: 0,
  };
}

// ---------- Enemies / bullets / fx ----------
function spawnEnemy(){
  const a=state.arena, side=Math.floor(Math.random()*4); let x,y;
  if(side===0){x=Math.random()*a.w;y=-20;} else if(side===1){x=a.w+20;y=Math.random()*a.h;}
  else if(side===2){x=Math.random()*a.w;y=a.h+20;} else {x=-20;y=Math.random()*a.h;}
  const tier=Math.min(6, state.wave);
  const type = state.wave>=4 && Math.random()<0.25 ? 'phantom' : (Math.random()<0.25 ? 'brute' : 'drone');
  const base = type==='brute' ? {hp:90,sp:70,r:18,dmg:18,col:'#ff3d6a'} : type==='phantom'?{hp:55,sp:130,r:13,dmg:14,col:'#9d5cff'} : {hp:35,sp:100,r:11,dmg:10,col:'#22e8ff'};
  state.enemies.push({type,x,y,hp:base.hp*(1+tier*0.22),hpMax:base.hp*(1+tier*0.22),sp:base.sp*(1+tier*0.07),r:base.r,dmg:base.dmg*(1+tier*0.13),col:base.col,cd:0,jitter:Math.random()*Math.PI*2,fromWave:state.wave});
  state.waveEnemiesAlive++;
}
function spawnBullet(o){ state.bullets.push(Object.assign({life:1.2,radius:5,piercing:0,trail:[]}, o)); }
function particles(x,y,color,count=12,spd=180,life=0.5,radius=2){
  for(let i=0;i<count;i++){ const a=Math.random()*Math.PI*2, s=spd*(0.4+Math.random()*0.8); state.fx.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life,life0:life,color,r:radius*(0.6+Math.random()*0.8)}); }
}
function shake(amt){ state.cam.shake = Math.min(20, state.cam.shake + amt); }

// ---------- Game lifecycle ----------
function startGame(mode='single'){
  state.mode = mode;
  state.enemies.length=0; state.bullets.length=0; state.fx.length=0; state.pickups.length=0;
  state.others.clear();
  state.time=0; state.score=0; state.kills=0; state.fracture=0;
  state.wave=0; state.wavePhase='prep'; state.waveTimer=WAVE_PREP;
  state.waveSpawnTimer=0; state.waveToSpawn=0; state.waveEnemiesAlive=0;
  state.paused=false; state.running=true;
  state.cam.shake=0;
  const a = state.arena;
  state.player = makePlayer(state.hero, a.w/2, a.h/2, true);
  state.player.name = state.username || 'Operator';
  state.startedAt = performance.now();
  setScene('game');
  hideUpgrade();
  $('#hpName').textContent = HEROES[state.hero].name.toUpperCase();
  $('#pillRoom').textContent = state.mode==='multi' ? `ROOM ${state.roomCode}` : 'SOLO RUN';
  $('#pillAlive').textContent = '';
  // Announce first wave
  startWavePrep(1);
}

function endGame(victory=false){
  state.running=false; setScene('end');
  $('#endTitle').textContent = victory ? 'Victory' : 'You Died';
  $('#endScore').textContent = state.score|0;
  const t=state.time|0;
  $('#endStats').innerHTML = `Survived ${Math.floor(t/60)}m ${t%60}s · ${state.kills} kills · Wave ${state.wave}`;
}

// ---------- Wave logic ----------
function showWaveBanner(big, sub, ms=2200){
  const el = document.getElementById('waveBanner');
  if(!el) return;
  document.getElementById('waveBigText').textContent = big;
  document.getElementById('waveSubText').textContent = sub || '';
  document.getElementById('waveCount').textContent = '';
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(showWaveBanner._t);
  showWaveBanner._t = setTimeout(()=>el.classList.remove('show'), ms);
}
function updateWaveCountdown(n){
  const el = document.getElementById('waveBanner');
  if(!el) return;
  el.style.display='block';
  document.getElementById('waveBigText').textContent = `WAVE ${state.wave}`;
  document.getElementById('waveSubText').textContent = 'INCOMING IN';
  document.getElementById('waveCount').textContent = n>0 ? String(n) : 'GO!';
}
function hideWaveBanner(){
  const el = document.getElementById('waveBanner');
  if(el){ el.classList.remove('show'); el.style.display='none'; }
}
function startWavePrep(n){
  state.wave = n;
  state.wavePhase = 'prep';
  state.waveTimer = WAVE_PREP;
  state.waveToSpawn = WAVE_ENEMIES(n);
  state.waveEnemiesAlive = 0;
  state.waveSpawnTimer = 0;
  showWaveBanner(`WAVE ${n}`, 'PREPARE', 2200);
  toast(`Wave ${n} incoming in ${WAVE_PREP}s`, 1800);
}
function startWaveActive(){
  state.wavePhase = 'active';
  hideWaveBanner();
  showWaveBanner(`WAVE ${state.wave}`, 'FIGHT!', 1400);
  shake(6);
}
function endWave(){
  // Trigger upgrade picker; player can still take damage while choosing.
  state.wavePhase = 'upgrade';
  showWaveBanner(`WAVE ${state.wave} CLEARED`, 'CHOOSE UPGRADE', 1800);
  showUpgradePicker();
}

let lastT = performance.now();
function loop(now){
  const dt = Math.min(0.05, (now-lastT)/1000); lastT=now;
  // IMPORTANT: do NOT pause the simulation while the upgrade picker is open —
  // player can still take damage while choosing (no more "safe pause" cheating).
  if(state.scene==='game' && state.running && !state.paused) update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function update(dt){
  state.time += dt;
  // Fracture is now visual-only flair, tied to wave progress
  const stage = Math.min(5, Math.floor(state.wave/2));
  if(stage>state.fracture){ state.fracture=stage; toast(`FRACTURE STAGE ${stage}`, 1600); shake(6); }

  // ---- Wave state machine ----
  if(state.wavePhase === 'prep'){
    state.waveTimer -= dt;
    const remaining = Math.ceil(state.waveTimer);
    updateWaveCountdown(remaining);
    if(state.waveTimer <= 0){
      startWaveActive();
    }
  } else if(state.wavePhase === 'active'){
    // Spawn this wave's enemies over time
    if(state.waveToSpawn > 0){
      state.waveSpawnTimer -= dt;
      if(state.waveSpawnTimer <= 0){
        state.waveSpawnTimer = WAVE_SPAWN_INTERVAL(state.wave);
        spawnEnemy();
        state.waveToSpawn--;
      }
    } else if(state.waveEnemiesAlive <= 0){
      // All wave enemies cleared → upgrade phase
      endWave();
    }
  } else if(state.wavePhase === 'upgrade'){
    // Picker is open; sim continues, enemies still threaten the player.
    // No more enemies spawn, but stragglers (shouldn't be any) still chase.
    // Wait until UI signals next wave via onUpgradePicked() → startWavePrep(wave+1)
  }

  updatePlayer(state.player, dt, true);
  updateEnemies(dt); updateBullets(dt); updateFx(dt);

  // Camera target accounts for zoom — keep player centered on screen
  const tx=state.player.x-(W/2)/ZOOM, ty=state.player.y-(H/2)/ZOOM;
  state.cam.x += (tx-state.cam.x)*0.15; state.cam.y += (ty-state.cam.y)*0.15;
  state.cam.shake *= 0.85;

  state.score = Math.floor(state.time*10 + state.kills*25);

  const p = state.player;
  $('#hpVal').textContent = `${Math.max(0,Math.ceil(p.hp))}${p.shield>0?'+'+Math.ceil(p.shield):''}/${Math.ceil(p.hpMax)}`;
  $('#hpBar').style.width = (Math.max(0,p.hp)/p.hpMax*100)+'%';
  const mins=Math.floor(state.time/60), secs=Math.floor(state.time%60);
  $('#pillTime').textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  $('#pillScore').textContent = `SCORE ${state.score}`;
  $('#pillKills').textContent = `KILLS ${state.kills}`;
  $('#pillFract').textContent = `WAVE ${state.wave}`;
  $('#cdDash').className='k'+(p.dashCd<=0?' ready':''); $('#cdDash').textContent = p.dashCd<=0?'DASH':'DASH '+p.dashCd.toFixed(1);
  $('#cdAtk').className ='k'+(p.atkCd<=0?' ready':'');  $('#cdAtk').textContent  = p.atkCd<=0?'LMB':'LMB '+p.atkCd.toFixed(1);
  $('#cdAbi').className ='k'+(p.abiCd<=0?' ready':'');  $('#cdAbi').textContent  = p.abiCd<=0?'Q':'Q '+p.abiCd.toFixed(1);
  updateTouchCooldownUI(p);

  if(state.mode==='multi'){
    $('#pillAlive').textContent = `ALIVE ${[...state.lobby.players.values()].length}`;
    broadcastTick(dt);
  }

  if(p.hp<=0 && p.alive){ p.alive=false; particles(p.x,p.y,'#ff3d6a',40,260,0.9,3); shake(14); setTimeout(()=>endGame(false), 400); }
}

function updatePlayer(p, dt, isLocal){
  const h = HEROES[p.heroId];
  let mx = touch.active ? touch.mx : ((keys['d']?1:0)-(keys['a']?1:0));
  let my = touch.active ? touch.my : ((keys['s']?1:0)-(keys['w']?1:0));
  if(!isLocal){ mx=0; my=0; }
  const len=Math.hypot(mx,my)||1; mx/=len; my/=len;
  if(state.fracture>=3){ const phase=state.time*0.6; mx+=Math.cos(phase)*0.08*state.fracture; my+=Math.sin(phase*1.3)*0.08*state.fracture; }
  const speed = h.speed*p.mods.speed*(p.dashing>0?2.6:1)*(state.fracture>=4?(1+Math.sin(state.time*2)*0.15):1);
  p.vx=mx*speed; p.vy=my*speed;
  p.x+=p.vx*dt; p.y+=p.vy*dt;
  p.x=Math.max(20,Math.min(state.arena.w-20,p.x)); p.y=Math.max(20,Math.min(state.arena.h-20,p.y));
  if(isLocal){
    let aimed=false;
    if(IS_TOUCH || !mouse.moved){
      let best=null,bd=Infinity;
      for(const e of state.enemies){ const dx=e.x-p.x,dy=e.y-p.y,d=dx*dx+dy*dy; if(d<bd){bd=d;best=e;} }
      if(best){ p.angle=Math.atan2(best.y-p.y,best.x-p.x); aimed=true; }
      else if(touch.active && (touch.mx||touch.my)){ p.angle=Math.atan2(touch.my,touch.mx); aimed=true; }
    }
    if(!aimed){ const wx=mouse.x/ZOOM+state.cam.x, wy=mouse.y/ZOOM+state.cam.y; p.angle=Math.atan2(wy-p.y,wx-p.x); }
  }
  p.dashCd=Math.max(0,p.dashCd-dt); p.atkCd=Math.max(0,p.atkCd-dt); p.abiCd=Math.max(0,p.abiCd-dt); p.dashing=Math.max(0,p.dashing-dt);
  if(isLocal && (keys[' ']||touch.dashEdge) && p.dashCd<=0){ p.dashCd=2*p.mods.cdr; p.dashing=0.18; SFX.dash(); particles(p.x,p.y,h.color,16,220,0.4,2); }
  touch.dashEdge=false;
  if(isLocal && (mouse.down||touch.attack) && p.atkCd<=0) doAttack(p);
  if(isLocal && (keys['q']||touch.abiEdge) && p.abiCd<=0) doAbility(p);
  touch.abiEdge=false;
  if(p.mods.regen>0) p.hp=Math.min(p.hpMax, p.hp+p.mods.regen*dt);
  if(p.mods.shieldMax>0) p.shield=Math.min(p.mods.shieldMax, p.shield+6*dt);
  if(p.mods.aura>0){ for(const e of state.enemies){ const dx=e.x-p.x,dy=e.y-p.y,d2=dx*dx+dy*dy; if(d2<130*130){ e.hp-=p.mods.aura*dt; if(Math.random()<0.2) particles(e.x,e.y,'#ff8a3d',1,40,0.3,2); } } }
}

function doAttack(p){
  const h=HEROES[p.heroId]; p.atkCd=h.atkCd/p.mods.atkSpd; SFX.fire(p.heroId);
  const dmg=h.dmg*p.mods.dmg, range=h.range*p.mods.range, ang=p.angle;
  if(p.heroId==='james'){
    let hit=0; for(const e of state.enemies){ const dx=e.x-p.x,dy=e.y-p.y,d=Math.hypot(dx,dy); if(d<range){ const a=Math.atan2(dy,dx); let da=Math.atan2(Math.sin(a-ang),Math.cos(a-ang)); if(Math.abs(da)<1.0){ damageEnemy(e,dmg,p); hit++; } } }
    for(let i=0;i<10;i++){ const t=i/10, a=ang-1+t*2; state.fx.push({x:p.x+Math.cos(a)*range*0.7,y:p.y+Math.sin(a)*range*0.7,vx:0,vy:0,life:0.18,life0:0.18,color:h.color,r:4}); }
    if(hit>0) shake(3);
  } else if(p.heroId==='jeff'){
    let hit=0; for(const e of state.enemies){ const dx=e.x-p.x,dy=e.y-p.y,d=Math.hypot(dx,dy); if(d<range){ const a=Math.atan2(dy,dx); let da=Math.atan2(Math.sin(a-ang),Math.cos(a-ang)); if(Math.abs(da)<0.7){ damageEnemy(e,dmg,p); hit++; } } }
    for(let i=0;i<6;i++) state.fx.push({x:p.x+Math.cos(ang)*i*8,y:p.y+Math.sin(ang)*i*8,vx:0,vy:0,life:0.15,life0:0.15,color:h.color,r:3});
    if(hit>0) shake(2);
  } else {
    const speed = p.heroId==='joross'?720:(p.heroId==='jake'?520:600);
    const radius = p.heroId==='jake'?9:(p.heroId==='jeb'?7:5);
    spawnBullet({x:p.x+Math.cos(ang)*18,y:p.y+Math.sin(ang)*18,vx:Math.cos(ang)*speed,vy:Math.sin(ang)*speed,dmg,owner:p.id,color:h.color,radius,life:range/speed*1.05,piercing:p.heroId==='jake'?1:0,heal:p.heroId==='jeb'?dmg*0.4:0});
  }
}

function doAbility(p){
  const h=HEROES[p.heroId]; p.abiCd=h.abiCd*p.mods.cdr; SFX.ability(p.heroId);
  if(p.heroId==='james'){ for(const e of state.enemies){ if(Math.hypot(e.x-p.x,e.y-p.y)<140) damageEnemy(e,h.dmg*1.4*p.mods.dmg,p); } particles(p.x,p.y,h.color,40,300,0.6,3); shake(8); }
  else if(p.heroId==='jake'){ const ring=24; for(let i=0;i<ring;i++){ const a=(i/ring)*Math.PI*2; spawnBullet({x:p.x,y:p.y,vx:Math.cos(a)*420,vy:Math.sin(a)*420,dmg:h.dmg*1.2*p.mods.dmg,owner:p.id,color:h.color,radius:8,life:0.9,piercing:2}); } particles(p.x,p.y,h.color,40,260,0.7,3); shake(6); }
  else if(p.heroId==='joross'){ const orig=p.mods.atkSpd; p.mods.atkSpd*=3; toast('SUPPRESS!'); setTimeout(()=>{p.mods.atkSpd=orig;},3000); }
  else if(p.heroId==='jeb'){ p.hp=Math.min(p.hpMax,p.hp+h.hp*0.35); particles(p.x,p.y,'#3dffb0',60,220,0.9,3); state.fx.push({x:p.x,y:p.y,vx:0,vy:0,life:4,life0:4,color:'#3dffb0',r:160,ring:true,heal:true,owner:p.id}); }
  else if(p.heroId==='jeff'){ const dx=Math.cos(p.angle)*180, dy=Math.sin(p.angle)*180; for(const e of state.enemies){ const ax=e.x-p.x,ay=e.y-p.y; const t=Math.max(0,Math.min(1,(ax*dx+ay*dy)/(dx*dx+dy*dy))); const px=p.x+dx*t, py=p.y+dy*t; if(Math.hypot(e.x-px,e.y-py)<40) damageEnemy(e,h.dmg*1.8*p.mods.dmg,p); } particles(p.x,p.y,h.color,18,260,0.4,3); p.x+=dx; p.y+=dy; p.x=Math.max(20,Math.min(state.arena.w-20,p.x)); p.y=Math.max(20,Math.min(state.arena.h-20,p.y)); particles(p.x,p.y,h.color,18,260,0.4,3); shake(8); }
}

function damageEnemy(e,dmg,p){ if(e.hp<=0) return; e.hp-=dmg; if(p&&p.heroId) SFX.hit(); if(p&&p.mods.lifesteal>0) p.hp=Math.min(p.hpMax,p.hp+dmg*p.mods.lifesteal); particles(e.x,e.y,e.col,4,140,0.3,2); if(e.hp<=0){ state.kills++; if(p) p.kills++; particles(e.x,e.y,e.col,18,240,0.7,3); shake(2); e.dead=true; if(state.waveEnemiesAlive>0) state.waveEnemiesAlive--; } }

function updateEnemies(dt){
  const p=state.player;
  for(const e of state.enemies){
    let target=p;
    if(state.mode==='multi'){
      let best=p,bd=Infinity;
      for(const cand of [p, ...state.others.values()]){ if(!cand||cand.alive===false) continue; const d2=(cand.x-e.x)**2+(cand.y-e.y)**2; if(d2<bd){bd=d2;best=cand;} }
      target=best||p;
    }
    const dx=target.x-e.x, dy=target.y-e.y, d=Math.hypot(dx,dy)||1;
    let sp=e.sp*(state.fracture>=2?1+state.fracture*0.06:1);
    if(p.mods.slow>0 && Math.hypot(p.x-e.x,p.y-e.y)<160) sp*=(1-p.mods.slow);
    if(e.type==='phantom'){ e.jitter+=dt*4; const px=-dy/d, py=dx/d; e.x+=(dx/d*sp+px*Math.sin(e.jitter)*sp*0.6)*dt; e.y+=(dy/d*sp+py*Math.sin(e.jitter)*sp*0.6)*dt; }
    else { e.x+=dx/d*sp*dt; e.y+=dy/d*sp*dt; }
    e.cd=Math.max(0,e.cd-dt);
    if(d<e.r+18 && e.cd<=0){ const dmgIn=e.dmg; let rem=dmgIn; if(p.shield>0){ const a=Math.min(p.shield,rem); p.shield-=a; rem-=a; } p.hp-=rem; SFX.hurt(); e.cd=0.6; shake(4); particles(p.x,p.y,'#ff3d6a',8,180,0.4,2); }
  }
  state.enemies = state.enemies.filter(e=>!e.dead);
}

function updateBullets(dt){
  for(const b of state.bullets){
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
    b.trail.push({x:b.x,y:b.y}); if(b.trail.length>8) b.trail.shift();
    for(const e of state.enemies){ if(Math.hypot(e.x-b.x,e.y-b.y)<e.r+b.radius){ damageEnemy(e,b.dmg,state.player); if(b.heal && state.player) state.player.hp=Math.min(state.player.hpMax, state.player.hp+b.heal); if(b.piercing>0){ b.piercing--; } else { b.dead=true; break; } } }
  }
  state.bullets = state.bullets.filter(b=>!b.dead && b.life>0);
}

function updateFx(dt){
  for(const f of state.fx){
    f.life-=dt;
    if(!f.ring){ f.x+=f.vx*dt; f.y+=f.vy*dt; f.vx*=0.92; f.vy*=0.92; }
    if(f.heal && state.player){ const d=Math.hypot(state.player.x-f.x, state.player.y-f.y); if(d<f.r) state.player.hp=Math.min(state.player.hpMax, state.player.hp+18*dt); }
  }
  state.fx = state.fx.filter(f=>f.life>0);
}

// ---------- Render ----------
function render(){
  ctx.clearRect(0,0,W,H);
  drawBackground();
  if(state.scene!=='game') return;
  ctx.save();
  const sx=(Math.random()-0.5)*state.cam.shake, sy=(Math.random()-0.5)*state.cam.shake;
  ctx.scale(ZOOM, ZOOM);
  ctx.translate(-state.cam.x+sx, -state.cam.y+sy);
  ctx.strokeStyle='rgba(157,92,255,.6)'; ctx.lineWidth=2; ctx.shadowColor='#9d5cff'; ctx.shadowBlur=18;
  ctx.strokeRect(0,0,state.arena.w,state.arena.h); ctx.shadowBlur=0;
  for(const f of state.fx){ const a=Math.max(0,f.life/f.life0); if(f.ring){ ctx.beginPath(); ctx.arc(f.x,f.y,f.r,0,Math.PI*2); ctx.strokeStyle=withAlpha(f.color,0.3*a); ctx.lineWidth=4; ctx.shadowColor=f.color; ctx.shadowBlur=30; ctx.stroke(); ctx.shadowBlur=0; } else { ctx.fillStyle=withAlpha(f.color,a); ctx.beginPath(); ctx.arc(f.x,f.y,f.r,0,Math.PI*2); ctx.fill(); } }
  for(const e of state.enemies){
    ctx.save(); ctx.translate(e.x,e.y); ctx.shadowColor=e.col; ctx.shadowBlur=16; ctx.fillStyle=e.col;
    if(e.type==='brute') ctx.fillRect(-e.r,-e.r,e.r*2,e.r*2);
    else if(e.type==='phantom'){ ctx.beginPath(); ctx.moveTo(0,-e.r); ctx.lineTo(e.r,0); ctx.lineTo(0,e.r); ctx.lineTo(-e.r,0); ctx.closePath(); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(0,0,e.r,0,Math.PI*2); ctx.fill(); }
    ctx.restore();
    if(e.hp<e.hpMax){ ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(e.x-e.r,e.y-e.r-8,e.r*2,3); ctx.fillStyle=e.col; ctx.fillRect(e.x-e.r,e.y-e.r-8,(e.r*2)*Math.max(0,e.hp/e.hpMax),3); }
  }
  for(const b of state.bullets){
    for(let i=0;i<b.trail.length;i++){ const t=i/b.trail.length; ctx.fillStyle=withAlpha(b.color,0.15+0.5*t); ctx.beginPath(); ctx.arc(b.trail[i].x,b.trail[i].y,b.radius*(0.5+t*0.6),0,Math.PI*2); ctx.fill(); }
    ctx.shadowColor=b.color; ctx.shadowBlur=18; ctx.fillStyle=b.color; ctx.beginPath(); ctx.arc(b.x,b.y,b.radius,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
  }
  if(state.mode==='multi'){ for(const o of state.others.values()) drawPlayer(o,false); }
  drawPlayer(state.player, true);
  ctx.restore();
}

function drawPlayer(p, local){
  if(!p) return;
  const h = HEROES[p.heroId]; if(!h) return;
  if(p.dashing>0){ for(let i=0;i<6;i++){ ctx.fillStyle=withAlpha(h.color,0.06+i*0.02); ctx.beginPath(); ctx.arc(p.x-Math.cos(p.angle)*i*4,p.y-Math.sin(p.angle)*i*4,16,0,Math.PI*2); ctx.fill(); } }
  ctx.save(); ctx.translate(p.x,p.y); ctx.shadowColor=h.color; ctx.shadowBlur=22;
  ctx.fillStyle = local ? h.color : '#ffffff';
  ctx.beginPath(); ctx.arc(0,0,16,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
  ctx.rotate(p.angle); ctx.strokeStyle=h.color; ctx.lineWidth=3; ctx.shadowColor=h.color; ctx.shadowBlur=14;
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(28,0); ctx.stroke(); ctx.shadowBlur=0;
  ctx.restore();
  if(p.shield>0){ ctx.strokeStyle=withAlpha('#22e8ff',0.7); ctx.lineWidth=2; ctx.beginPath(); ctx.arc(p.x,p.y,20,0,Math.PI*2); ctx.stroke(); }
  ctx.fillStyle='#fff'; ctx.font='12px ui-monospace,monospace'; ctx.textAlign='center';
  ctx.fillText(p.name||'P', p.x, p.y-26);
  const w=36; ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(p.x-w/2,p.y+22,w,3);
  ctx.fillStyle = local ? '#3dffb0' : '#ff8a3d'; ctx.fillRect(p.x-w/2,p.y+22,w*Math.max(0,(p.hp||0)/(p.hpMax||1)),3);
}

function drawBackground(){
  const step=56; const offX=-((state.cam.x*0.6)%step); const offY=-((state.cam.y*0.6)%step);
  ctx.save(); ctx.globalAlpha=0.5; ctx.strokeStyle='rgba(157,92,255,.18)'; ctx.lineWidth=1;
  for(let x=offX; x<W; x+=step){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for(let y=offY; y<H; y+=step){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
  ctx.restore();
  if(state.fracture>=1){ const a=Math.min(0.18,0.04*state.fracture); ctx.fillStyle=`rgba(255,43,214,${a})`; ctx.fillRect(0,0,W,H); }
}

function withAlpha(hex,a){ if(!hex) return `rgba(255,255,255,${a})`; const m=hex.replace('#',''); const r=parseInt(m.slice(0,2),16),g=parseInt(m.slice(2,4),16),b=parseInt(m.slice(4,6),16); return `rgba(${r},${g},${b},${a})`; }

// ---------- Upgrade picker ----------
// IMPORTANT: does NOT pause the game. Player can still take damage while choosing.
function showUpgradePicker(){
  const modal = document.getElementById('upgrade');
  if(!modal) return;
  const choices = pickN(UPGRADES, 3);
  const wrap = $('#ucards'); wrap.innerHTML='';
  choices.forEach(u=>{
    const el=document.createElement('div');
    el.className='ucard';
    el.innerHTML=`<h4>${u.name}</h4><p>${u.desc}</p>`;
    el.onclick=()=>{
      u.apply(state.player);
      hideUpgrade();
      toast(`Acquired: ${u.name}`);
      // Advance to the next wave's prep
      startWavePrep(state.wave + 1);
    };
    wrap.appendChild(el);
  });
  modal.classList.remove('hidden');
  modal.classList.add('show');
  modal.style.display='flex';
}
function hideUpgrade(){
  const modal = document.getElementById('upgrade');
  if(!modal) return;
  modal.classList.remove('show');
  modal.classList.add('hidden');
  modal.style.display='none';
}
function pickN(arr,n){ const a=arr.slice(),out=[]; while(out.length<n && a.length){ out.push(a.splice(Math.floor(Math.random()*a.length),1)[0]); } return out; }

// ============================================================
// COLYSEUS MULTIPLAYER
// ============================================================
function setCountdownText(text){
  const el = document.getElementById('countdown');
  if(el) el.textContent = text;
  const status = document.getElementById('lobbyStatus');
  if(status && text) status.textContent = `STARTING IN ${text}…`;
}

function renderLobby(){
  const list = $('#lobbyList'); list.innerHTML='';
  const players = [...state.lobby.players.values()].sort((a,b)=> Number(!!b.isHost) - Number(!!a.isHost) || String(a.name||'').localeCompare(String(b.name||'')));
  for(const p of players){
    const row = document.createElement('div');
    row.className = 'player-row' + (p.ready ? ' ready' : '');
    row.innerHTML = `<div class="dot"></div><div class="name">${escapeHtml(p.name||'Player')}${p.isHost?' <span style="color:var(--cyan)">★</span>':''}</div><div class="hero">${(HEROES[p.heroId]||{}).name||'?'}</div>`;
    list.appendChild(row);
  }
  if(state.lobby.phase === 'starting'){
    $('#lobbyStatus').textContent = `STARTING IN ${state.lobby.countdown}…`;
  } else {
    $('#lobbyStatus').textContent = `WAITING (${players.length}/8)`;
  }
}

async function joinRoom(roomName, options = {}){
  try{
    const opts = {
      name: state.username || 'Operator',
      heroId: state.hero,
      ...options,
    };
    console.log('[net] joining', roomName, opts);
    if(activeRoom){ try{ await activeRoom.leave(); }catch(e){} activeRoom=null; }
    activeRoom = await client.joinOrCreate(roomName, opts);
    state.roomCode = activeRoom.id;
    state.mySessionId = activeRoom.sessionId;
    state.lobby.players.clear();
    state.lobby.phase = 'waiting';
    state.lobby.countdown = 0;
    setScene('lobby');
    $('#lobbyCode').textContent = '· ' + (roomName === 'battle_room' ? activeRoom.id : roomName);
    setCountdownText('');

    // Sync players from state
    const refresh = () => {
      const m = new Map();
      activeRoom.state.players.forEach((p, id) => {
        m.set(id, { id, name: p.name, heroId: p.heroId, ready: !!p.ready, isHost: !!p.isHost });
      });
      state.lobby.players = m;
      state.isHost = (activeRoom.state.hostId === state.mySessionId);
      state.lobby.phase = activeRoom.state.phase || 'waiting';
      state.lobby.countdown = activeRoom.state.countdown || 0;
      renderLobby();
    };

    activeRoom.onStateChange(refresh);
    refresh();

    activeRoom.onMessage('countdown', (msg) => {
      console.log('[net] countdown', msg);
      state.lobby.countdown = msg.n || 0;
      if(msg.cancelled || !msg.n){
        setCountdownText('');
        renderLobby();
      } else {
        setCountdownText(msg.n > 0 ? msg.n : 'GO');
      }
    });

    activeRoom.onMessage('startGame', (msg) => {
      console.log('[net] startGame received', msg);
      setCountdownText('');
      try{ startGame('multi'); }
      catch(e){ console.error('startGame failed:', e); alert('startGame error: '+e.message); }
    });

    activeRoom.onMessage('playerState', (msg) => {
      if(!msg || !msg.id || msg.id === state.mySessionId) return;
      const existing = state.others.get(msg.id) || {};
      state.others.set(msg.id, { ...existing, ...msg });
    });

    activeRoom.onLeave(() => {
      console.log('[net] left room');
    });

    activeRoom.onError((code, message) => {
      console.error('[net] room error', code, message);
      alert('Room error: '+message);
    });

  } catch(e){
    console.error('Connection error:', e);
    alert("Can\u0027t connect to the game server. It may be waking up — try again in a few seconds.\n\nDetails: "+e.message);
    setScene('mpMenu');
  }
}

async function quickJoinPublic(){
  await joinRoom('battle_room', {});
  if(activeRoom) toast('Joined public room ' + activeRoom.id, 2500);
}

// In-game broadcast (15Hz)
let lastBroadcast = 0;
function broadcastTick(dt){
  if(!activeRoom) return;
  lastBroadcast += dt;
  if(lastBroadcast < 0.066) return;
  lastBroadcast = 0;
  const p = state.player;
  try{
    activeRoom.send('playerState', {
      name: p.name, heroId: p.heroId,
      x: p.x|0, y: p.y|0, angle: +p.angle.toFixed(2),
      hp: Math.ceil(p.hp), hpMax: p.hpMax, alive: p.alive,
    });
  }catch(e){}
}

async function leaveLobby(targetScene='menu'){
  if(activeRoom){ try{ await activeRoom.leave(); }catch(e){} activeRoom=null; }
  state.roomCode=null; state.isHost=false; state.mySessionId=null;
  state.lobby.players.clear(); state.lobby.phase='waiting'; state.lobby.countdown=0;
  setCountdownText('');
  if(targetScene) setScene(targetScene);
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

// ============================================================
// UI WIRING
// ============================================================
$('#username').value = state.username;
$('#username').addEventListener('input', e=>{ state.username = e.target.value.slice(0,16); localStorage.setItem('ns_user', state.username); });

$('#btnSingle').onclick = ()=>{ if(!state.username){ toast('Enter a callsign first'); return; } state.mode='single'; setScene('heroSelect'); renderHeroGrid(); $('#heroConfirm').onclick = ()=> startGame('single'); };
$('#btnMulti').onclick  = ()=>{ if(!state.username){ toast('Enter a callsign first'); return; } state.mode='multi'; setScene('mpMenu'); };
$('#btnLeader').onclick = ()=>{ setScene('leaderScreen'); };

$('#heroBack').onclick = ()=> setScene(state.mode==='multi' ? 'mpMenu' : 'menu');

$('#mpBack').onclick = ()=> setScene('menu');

$('#btnQuick').onclick = ()=>{
  setScene('heroSelect'); renderHeroGrid();
  $('#heroConfirm').onclick = async ()=>{ await quickJoinPublic(); };
};
$('#btnCreate').onclick = ()=>{
  setScene('heroSelect'); renderHeroGrid();
  $('#heroConfirm').onclick = async ()=>{
    await joinRoom('battle_room', {});
    if(activeRoom) toast('Room created: '+activeRoom.id, 3000);
  };
};
$('#btnJoin').onclick = ()=>{
  const code = $('#roomCode').value.trim();
  if(!code){ toast('Enter a room code'); return; }
  setScene('heroSelect'); renderHeroGrid();
  $('#heroConfirm').onclick = async ()=>{
    // Try to join by id first; if it fails, joinOrCreate by name as fallback
    try{
      if(activeRoom){ try{ await activeRoom.leave(); }catch(e){} activeRoom=null; }
      activeRoom = await client.joinById(code, { name: state.username || 'Operator', heroId: state.hero });
      state.roomCode = activeRoom.id; state.mySessionId = activeRoom.sessionId;
      // Re-bind handlers via joinRoom logic by simulating:
      // (simplest: replace by calling joinRoom which leaves first — but we already joined.
      //  Instead manually wire the same handlers below.)
      bindRoomHandlers();
      setScene('lobby');
      $('#lobbyCode').textContent = '· '+activeRoom.id;
    } catch(e){
      console.warn('joinById failed, falling back:', e.message);
      await joinRoom('battle_room', {});
    }
  };
};

function bindRoomHandlers(){
  if(!activeRoom) return;
  state.lobby.players.clear();
  const refresh = () => {
    const m = new Map();
    activeRoom.state.players.forEach((p, id) => {
      m.set(id, { id, name: p.name, heroId: p.heroId, ready: !!p.ready, isHost: !!p.isHost });
    });
    state.lobby.players = m;
    state.isHost = (activeRoom.state.hostId === state.mySessionId);
    state.lobby.phase = activeRoom.state.phase || 'waiting';
    state.lobby.countdown = activeRoom.state.countdown || 0;
    renderLobby();
  };
  activeRoom.onStateChange(refresh); refresh();
  activeRoom.onMessage('countdown', (msg)=>{ state.lobby.countdown = msg.n||0; if(msg.cancelled||!msg.n){ setCountdownText(''); renderLobby(); } else setCountdownText(msg.n>0?msg.n:'GO'); });
  activeRoom.onMessage('startGame', ()=>{ setCountdownText(''); try{ startGame('multi'); }catch(e){ console.error(e); } });
  activeRoom.onMessage('playerState', (msg)=>{ if(!msg||!msg.id||msg.id===state.mySessionId) return; const ex=state.others.get(msg.id)||{}; state.others.set(msg.id,{...ex,...msg}); });
}

$('#lobbyLeave').onclick = ()=> leaveLobby('mpMenu');
$('#lobbyReady').onclick = ()=>{ if(activeRoom) activeRoom.send('toggleReady'); };

$('#leaderBack').onclick = ()=> setScene('menu');
$('#btnRestart').onclick = ()=>{ if(state.mode==='multi') setScene('lobby'); else startGame('single'); };
$('#btnHome').onclick = ()=> leaveLobby('menu');
$('#btnLeaveGame').onclick = ()=>{ state.running=false; leaveLobby('menu'); };

// Boot
loadHeroImages();
setScene('menu');

window.addEventListener('beforeunload', ()=>{ if(activeRoom){ try{ activeRoom.leave(); }catch(e){} } });
