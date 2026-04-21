// ==============================================================
// NEURAL SURVIVAL: FRACTURE REALM — Colyseus multiplayer build (PATCHED)
// Fixes:
//  - 30s upgrade-modal freeze (modal was being kept .hidden)
//  - Multiplayer: other players' fire / dash / ability / bullets now visible
//  - Multiplayer: hurt feedback (red vignette + screen shake + sound) so you
//    notice damage before dying
//  - Replaced bland time-based upgrades with addictive XP / Level system,
//    kill-combo multiplier, mini-boss waves, score multiplier
// ==============================================================

// ---- Colyseus client ----
const client = new Colyseus.Client("wss://my-game-server-production-aef3.up.railway.app");
let activeRoom = null;

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
  { id:"hpmax", name:"Reinforced Frame", desc:"+30 max HP and full heal.", apply:p=>{p.hpMax+=30; p.hp=p.hpMax} },
  { id:"crit",  name:"Critical Driver", desc:"+15% crit chance for 2x damage.", apply:p=>{p.mods.crit=(p.mods.crit||0)+0.15} },
  { id:"multishot", name:"Split Shot", desc:"Ranged attacks fire +1 extra projectile.", apply:p=>{p.mods.multishot=(p.mods.multishot||0)+1} },
];

// ---------- Globals ----------
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
let W=0,H=0,DPR=Math.min(2, window.devicePixelRatio||1);
function resize(){
  const vv = window.visualViewport;
  W = Math.round(vv ? vv.width  : window.innerWidth);
  H = Math.round(vv ? vv.height : window.innerHeight);
  DPR = Math.min(2, window.devicePixelRatio||1);
  cvs.width=Math.round(W*DPR); cvs.height=Math.round(H*DPR);
  cvs.style.width=W+'px'; cvs.style.height=H+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', ()=>setTimeout(resize,150));
if(window.visualViewport){
  window.visualViewport.addEventListener('resize', resize);
  window.visualViewport.addEventListener('scroll', resize);
}
resize();

// ---------- SFX ----------
const SFX = (() => {
  const BASE = 'sounds/';
  const VOL = { sfx: 0.7, music: 0.35 };
  const pools = {};
  const POOL_SIZE = 4;
  function makePool(src){ const arr=[]; for(let i=0;i<POOL_SIZE;i++){ const a=new Audio(src); a.preload='auto'; a.volume=VOL.sfx; arr.push(a); } return {arr,i:0}; }
  function getPool(key, src){ if(!pools[key]) pools[key]=makePool(src); return pools[key]; }
  function play(key, src, vol){ try{ const p=getPool(key,src); const a=p.arr[p.i]; p.i=(p.i+1)%p.arr.length; a.currentTime=0; a.volume=(vol??VOL.sfx); const pr=a.play(); if(pr&&pr.catch) pr.catch(()=>{});}catch(e){} }
  function fire(h='james', vol){play('fire_'+h, `${BASE}fire_${h}.mp3`, vol);}
  function ability(h='james', vol){play('q_'+h, `${BASE}q_${h}.mp3`, vol);}
  function dash(vol){play('dash', `${BASE}dash.mp3`, vol);}
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
  remoteBullets: [], // bullets fired by remote players (visual-only on this client)
  arena: { w:2200, h:1500 },
  cam: {x:0,y:0,shake:0},
  time: 0, score: 0, kills: 0, fracture: 0,
  spawnTimer: 0,
  paused: false, running: false, startedAt: 0,
  // XP / progression
  xp: 0, level: 1, xpToNext: 6,
  pendingUpgrades: 0,
  // combo
  combo: 0, comboTimer: 0, comboMul: 1,
  // boss
  bossTimer: 60,
  // damage feedback
  hurtFlash: 0,
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
function showWaveBanner(text){
  const el = document.getElementById('waveBanner'); if(!el) return;
  el.textContent = text; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
}
function flashDamage(){
  state.hurtFlash = 0.45;
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
    mods: { speed:1, cdr:1, dmg:1, range:1, atkSpd:1, shieldMax:0, aura:0, slow:0, regen:0, lifesteal:0, crit:0, multishot:0 },
    abiState: 0,
    // visual flags for remote players
    fxFlash: 0, abiFlash: 0,
  };
}

// ---------- Enemies / bullets / fx ----------
function spawnEnemy(){
  const a=state.arena, side=Math.floor(Math.random()*4); let x,y;
  if(side===0){x=Math.random()*a.w;y=-20;} else if(side===1){x=a.w+20;y=Math.random()*a.h;}
  else if(side===2){x=Math.random()*a.w;y=a.h+20;} else {x=-20;y=Math.random()*a.h;}
  const tier=Math.min(5,1+Math.floor(state.time/45));
  const type = state.fracture>=2 && Math.random()<0.25 ? 'phantom' : (Math.random()<0.25 ? 'brute' : 'drone');
  const base = type==='brute' ? {hp:90,sp:70,r:18,dmg:18,col:'#ff3d6a'} : type==='phantom'?{hp:55,sp:130,r:13,dmg:14,col:'#9d5cff'} : {hp:35,sp:100,r:11,dmg:10,col:'#22e8ff'};
  state.enemies.push({type,x,y,hp:base.hp*(1+tier*0.25),hpMax:base.hp*(1+tier*0.25),sp:base.sp*(1+tier*0.08),r:base.r,dmg:base.dmg*(1+tier*0.15),col:base.col,cd:0,jitter:Math.random()*Math.PI*2,xp:type==='brute'?3:type==='phantom'?2:1});
}
function spawnBoss(){
  const a=state.arena;
  const x = a.w/2, y = -40;
  const tier = Math.min(5,1+Math.floor(state.time/45));
  state.enemies.push({type:'boss',x,y,hp:600*(1+tier*0.4),hpMax:600*(1+tier*0.4),sp:60+tier*4,r:34,dmg:30+tier*4,col:'#ff2bd6',cd:0,jitter:0,xp:25,boss:true});
  showWaveBanner(`⚠ MINI-BOSS INCOMING ⚠`);
  shake(14);
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
  state.remoteBullets.length=0;
  if(mode!=='multi') state.others.clear();
  state.time=0; state.score=0; state.kills=0; state.fracture=0;
  state.spawnTimer=0; state.paused=false; state.running=true;
  state.xp=0; state.level=1; state.xpToNext=6; state.pendingUpgrades=0;
  state.combo=0; state.comboTimer=0; state.comboMul=1;
  state.bossTimer=60; state.hurtFlash=0;
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
  showWaveBanner('SURVIVE');
}

function endGame(victory=false){
  state.running=false; setScene('endScreen');
  $('#endTitle').textContent = victory ? 'Victory' : 'You Died';
  $('#endScore').textContent = state.score|0;
  const t=state.time|0;
  $('#endStats').innerHTML = `Survived ${Math.floor(t/60)}m ${t%60}s · ${state.kills} kills · LV ${state.level} · Fracture ${state.fracture}`;
}

let lastT = performance.now();
function loop(now){
  const dt = Math.min(0.05, (now-lastT)/1000); lastT=now;
  if(state.scene==='game' && state.running && !state.paused) update(dt);
  // Remote bullets/fx tick even when local paused so MP visuals stay smooth
  if(state.scene==='game') tickRemote(dt);
  // Hurt flash decay
  if(state.hurtFlash>0){
    state.hurtFlash = Math.max(0, state.hurtFlash - dt*2);
    const df = document.getElementById('damageFlash');
    if(df) df.classList.toggle('on', state.hurtFlash>0.05);
  }
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function update(dt){
  state.time += dt;
  const stage = Math.floor(state.time/30);
  if(stage>state.fracture){ state.fracture=stage; toast(`FRACTURE STAGE ${stage} — REALITY DESTABILIZING`, 2200); shake(8); showWaveBanner(`FRACTURE ${stage}`); }
  state.spawnTimer -= dt;
  const targetSpawn = Math.max(0.25, 1.4 - state.time*0.012 - state.fracture*0.08);
  if(state.spawnTimer<=0){ state.spawnTimer=targetSpawn; const n=1+Math.floor(state.time/40); for(let i=0;i<n;i++) spawnEnemy(); }

  // Boss timer (every 60s)
  state.bossTimer -= dt;
  if(state.bossTimer<=0){ state.bossTimer=60; spawnBoss(); }

  // Combo decay
  if(state.combo>0){
    state.comboTimer -= dt;
    if(state.comboTimer<=0){ state.combo=0; state.comboMul=1; updateComboUI(); }
  }

  // Pending level-up upgrades — show modal one at a time
  if(state.pendingUpgrades>0 && !state.paused && document.getElementById('upgrade').style.display !== 'flex'){
    showUpgradePicker();
  }

  updatePlayer(state.player, dt, true);
  updateEnemies(dt); updateBullets(dt); updateFx(dt);

  const tx=state.player.x-W/2, ty=state.player.y-H/2;
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
  $('#pillFract').textContent = `FRACTURE ${state.fracture}`;
  $('#lvlVal').textContent = `LV ${state.level}`;
  $('#xpBar').style.width = Math.min(100, (state.xp/state.xpToNext)*100)+'%';
  $('#cdDash').className='k'+(p.dashCd<=0?' ready':''); $('#cdDash').textContent = p.dashCd<=0?'DASH':'DASH '+p.dashCd.toFixed(1);
  $('#cdAtk').className ='k'+(p.atkCd<=0?' ready':'');  $('#cdAtk').textContent  = p.atkCd<=0?'LMB':'LMB '+p.atkCd.toFixed(1);
  $('#cdAbi').className ='k'+(p.abiCd<=0?' ready':'');  $('#cdAbi').textContent  = p.abiCd<=0?'Q':'Q '+p.abiCd.toFixed(1);
  updateTouchCooldownUI(p);

  if(state.mode==='multi'){
    $('#pillAlive').textContent = `ALIVE ${[...state.lobby.players.values()].length}`;
    broadcastTick(dt);
  }

  if(p.hp<=0 && p.alive){
    p.alive=false;
    particles(p.x,p.y,'#ff3d6a',40,260,0.9,3); shake(14);
    if(activeRoom){ try{ activeRoom.send('death', {x:p.x,y:p.y}); }catch(e){} }
    setTimeout(()=>endGame(false), 400);
  }
}

function tickRemote(dt){
  // advance remote bullets visually
  for(const b of state.remoteBullets){
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
    b.trail = b.trail || []; b.trail.push({x:b.x,y:b.y}); if(b.trail.length>8) b.trail.shift();
  }
  state.remoteBullets = state.remoteBullets.filter(b=>b.life>0);
  for(const o of state.others.values()){
    if(o.dashing>0) o.dashing = Math.max(0, o.dashing - dt);
    if(o.fxFlash>0) o.fxFlash = Math.max(0, o.fxFlash - dt);
    if(o.abiFlash>0) o.abiFlash = Math.max(0, o.abiFlash - dt);
  }
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
    if(!aimed){ const wx=mouse.x+state.cam.x, wy=mouse.y+state.cam.y; p.angle=Math.atan2(wy-p.y,wx-p.x); }
  }
  p.dashCd=Math.max(0,p.dashCd-dt); p.atkCd=Math.max(0,p.atkCd-dt); p.abiCd=Math.max(0,p.abiCd-dt); p.dashing=Math.max(0,p.dashing-dt);
  if(isLocal && (keys[' ']||touch.dashEdge) && p.dashCd<=0){
    p.dashCd=2*p.mods.cdr; p.dashing=0.18; SFX.dash();
    particles(p.x,p.y,h.color,16,220,0.4,2);
    if(activeRoom){ try{ activeRoom.send('dash', {x:p.x,y:p.y,angle:+p.angle.toFixed(2)}); }catch(e){} }
  }
  touch.dashEdge=false;
  if(isLocal && (mouse.down||touch.attack) && p.atkCd<=0) doAttack(p);
  if(isLocal && (keys['q']||touch.abiEdge) && p.abiCd<=0) doAbility(p);
  touch.abiEdge=false;
  if(p.mods.regen>0) p.hp=Math.min(p.hpMax, p.hp+p.mods.regen*dt);
  if(p.mods.shieldMax>0) p.shield=Math.min(p.mods.shieldMax, p.shield+6*dt);
  if(p.mods.aura>0){ for(const e of state.enemies){ const dx=e.x-p.x,dy=e.y-p.y,d2=dx*dx+dy*dy; if(d2<130*130){ e.hp-=p.mods.aura*dt; if(Math.random()<0.2) particles(e.x,e.y,'#ff8a3d',1,40,0.3,2); } } }
}

function rollCrit(p, dmg){
  if(p && p.mods && p.mods.crit && Math.random() < p.mods.crit) return dmg*2;
  return dmg;
}

function doAttack(p){
  const h=HEROES[p.heroId]; p.atkCd=h.atkCd/p.mods.atkSpd; SFX.fire(p.heroId);
  const dmg=h.dmg*p.mods.dmg, range=h.range*p.mods.range, ang=p.angle;
  // Send attack event to remote clients (they'll render the visual)
  if(activeRoom){ try{ activeRoom.send('attack', {hero:p.heroId, x:p.x|0, y:p.y|0, angle:+ang.toFixed(2), range, dmg}); }catch(e){} }
  if(p.heroId==='james'){
    let hit=0; for(const e of state.enemies){ const dx=e.x-p.x,dy=e.y-p.y,d=Math.hypot(dx,dy); if(d<range){ const a=Math.atan2(dy,dx); let da=Math.atan2(Math.sin(a-ang),Math.cos(a-ang)); if(Math.abs(da)<1.0){ damageEnemy(e,rollCrit(p,dmg),p); hit++; } } }
    for(let i=0;i<10;i++){ const t=i/10, a=ang-1+t*2; state.fx.push({x:p.x+Math.cos(a)*range*0.7,y:p.y+Math.sin(a)*range*0.7,vx:0,vy:0,life:0.18,life0:0.18,color:h.color,r:4}); }
    if(hit>0) shake(3);
  } else if(p.heroId==='jeff'){
    let hit=0; for(const e of state.enemies){ const dx=e.x-p.x,dy=e.y-p.y,d=Math.hypot(dx,dy); if(d<range){ const a=Math.atan2(dy,dx); let da=Math.atan2(Math.sin(a-ang),Math.cos(a-ang)); if(Math.abs(da)<0.7){ damageEnemy(e,rollCrit(p,dmg),p); hit++; } } }
    for(let i=0;i<6;i++) state.fx.push({x:p.x+Math.cos(ang)*i*8,y:p.y+Math.sin(ang)*i*8,vx:0,vy:0,life:0.15,life0:0.15,color:h.color,r:3});
    if(hit>0) shake(2);
  } else {
    const speed = p.heroId==='joross'?720:(p.heroId==='jake'?520:600);
    const radius = p.heroId==='jake'?9:(p.heroId==='jeb'?7:5);
    const ms = (p.mods.multishot||0);
    for(let s=-ms; s<=ms; s++){
      const a = ang + s*0.12;
      spawnBullet({x:p.x+Math.cos(a)*18,y:p.y+Math.sin(a)*18,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,dmg:rollCrit(p,dmg),owner:p.id,color:h.color,radius,life:range/speed*1.05,piercing:p.heroId==='jake'?1:0,heal:p.heroId==='jeb'?dmg*0.4:0});
    }
    // Broadcast bullet spawn so remote clients render the projectile
    if(activeRoom){ try{ activeRoom.send('bullet', {hero:p.heroId, x:p.x, y:p.y, angle:+ang.toFixed(2), speed, radius, life:range/speed*1.05, color:h.color, ms}); }catch(e){} }
  }
}

function doAbility(p){
  const h=HEROES[p.heroId]; p.abiCd=h.abiCd*p.mods.cdr; SFX.ability(p.heroId);
  if(activeRoom){ try{ activeRoom.send('ability', {hero:p.heroId, x:p.x|0, y:p.y|0, angle:+p.angle.toFixed(2)}); }catch(e){} }
  if(p.heroId==='james'){ for(const e of state.enemies){ if(Math.hypot(e.x-p.x,e.y-p.y)<140) damageEnemy(e,h.dmg*1.4*p.mods.dmg,p); } particles(p.x,p.y,h.color,40,300,0.6,3); shake(8); }
  else if(p.heroId==='jake'){ const ring=24; for(let i=0;i<ring;i++){ const a=(i/ring)*Math.PI*2; spawnBullet({x:p.x,y:p.y,vx:Math.cos(a)*420,vy:Math.sin(a)*420,dmg:h.dmg*1.2*p.mods.dmg,owner:p.id,color:h.color,radius:8,life:0.9,piercing:2}); } particles(p.x,p.y,h.color,40,260,0.7,3); shake(6); }
  else if(p.heroId==='joross'){ const orig=p.mods.atkSpd; p.mods.atkSpd*=3; toast('SUPPRESS!'); setTimeout(()=>{p.mods.atkSpd=orig;},3000); }
  else if(p.heroId==='jeb'){ p.hp=Math.min(p.hpMax,p.hp+h.hp*0.35); particles(p.x,p.y,'#3dffb0',60,220,0.9,3); state.fx.push({x:p.x,y:p.y,vx:0,vy:0,life:4,life0:4,color:'#3dffb0',r:160,ring:true,heal:true,owner:p.id}); }
  else if(p.heroId==='jeff'){ const dx=Math.cos(p.angle)*180, dy=Math.sin(p.angle)*180; for(const e of state.enemies){ const ax=e.x-p.x,ay=e.y-p.y; const t=Math.max(0,Math.min(1,(ax*dx+ay*dy)/(dx*dx+dy*dy))); const px=p.x+dx*t, py=p.y+dy*t; if(Math.hypot(e.x-px,e.y-py)<40) damageEnemy(e,h.dmg*1.8*p.mods.dmg,p); } particles(p.x,p.y,h.color,18,260,0.4,3); p.x+=dx; p.y+=dy; p.x=Math.max(20,Math.min(state.arena.w-20,p.x)); p.y=Math.max(20,Math.min(state.arena.h-20,p.y)); particles(p.x,p.y,h.color,18,260,0.4,3); shake(8); }
}

// Render the same visuals locally when a remote player attacks (no real damage)
function playRemoteAttack(o, msg){
  const h = HEROES[msg.hero] || HEROES.james;
  const ang = msg.angle||0; const range = msg.range||h.range;
  if(msg.hero==='james'){
    for(let i=0;i<10;i++){ const t=i/10, a=ang-1+t*2; state.fx.push({x:o.x+Math.cos(a)*range*0.7,y:o.y+Math.sin(a)*range*0.7,vx:0,vy:0,life:0.18,life0:0.18,color:h.color,r:4}); }
  } else if(msg.hero==='jeff'){
    for(let i=0;i<6;i++) state.fx.push({x:o.x+Math.cos(ang)*i*8,y:o.y+Math.sin(ang)*i*8,vx:0,vy:0,life:0.15,life0:0.15,color:h.color,r:3});
  }
  o.fxFlash = 0.12;
  SFX.fire(msg.hero, 0.35);
}
function playRemoteAbility(o, msg){
  const h = HEROES[msg.hero] || HEROES.james;
  particles(o.x, o.y, h.color, 30, 260, 0.6, 3);
  o.abiFlash = 0.4;
  SFX.ability(msg.hero, 0.45);
}
function playRemoteDash(o, msg){
  const h = HEROES[o.heroId] || HEROES.james;
  o.dashing = 0.18;
  particles(msg.x||o.x, msg.y||o.y, h.color, 12, 200, 0.4, 2);
  SFX.dash(0.4);
}
function spawnRemoteBullet(o, msg){
  const ang = msg.angle||0;
  const ms = msg.ms||0;
  for(let s=-ms; s<=ms; s++){
    const a = ang + s*0.12;
    state.remoteBullets.push({
      x: msg.x, y: msg.y,
      vx: Math.cos(a)*(msg.speed||500), vy: Math.sin(a)*(msg.speed||500),
      life: msg.life||1, color: msg.color||'#fff', radius: msg.radius||5, trail: [],
    });
  }
}

function damageEnemy(e,dmg,p){
  if(e.hp<=0) return;
  e.hp-=dmg;
  if(p&&p.heroId) SFX.hit();
  if(p&&p.mods&&p.mods.lifesteal>0) p.hp=Math.min(p.hpMax,p.hp+dmg*p.mods.lifesteal);
  particles(e.x,e.y,e.col,4,140,0.3,2);
  if(e.hp<=0){
    state.kills++; if(p) p.kills++;
    particles(e.x,e.y,e.col,18,240,0.7,3); shake(2); e.dead=true;
    // XP + combo
    const xpGain = e.xp||1;
    addXP(xpGain);
    bumpCombo();
    if(e.boss) showWaveBanner('BOSS DOWN');
    if(activeRoom){ try{ activeRoom.send('kill', {x:e.x|0,y:e.y|0,col:e.col}); }catch(e){} }
  }
}

function addXP(n){
  state.xp += n * state.comboMul;
  while(state.xp >= state.xpToNext){
    state.xp -= state.xpToNext;
    state.level++;
    state.xpToNext = Math.floor(state.xpToNext * 1.35 + 2);
    state.pendingUpgrades++;
    showWaveBanner(`LEVEL ${state.level}`);
    shake(4);
  }
}

function bumpCombo(){
  state.combo++;
  state.comboTimer = 4; // 4s window
  state.comboMul = state.combo>=30?4 : state.combo>=15?3 : state.combo>=6?2 : 1;
  updateComboUI();
}
function updateComboUI(){
  const el = document.getElementById('combo'); if(!el) return;
  if(state.combo<3){ el.classList.remove('on'); return; }
  el.classList.add('on');
  document.getElementById('comboX').textContent = `x${state.comboMul}`;
  document.getElementById('comboTxt').textContent = `${state.combo} COMBO`;
}

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
    // Damage applied to LOCAL player only when collision
    const dpx = p.x-e.x, dpy = p.y-e.y, dp = Math.hypot(dpx,dpy);
    if(dp<e.r+18 && e.cd<=0){
      const dmgIn=e.dmg; let rem=dmgIn;
      if(p.shield>0){ const a=Math.min(p.shield,rem); p.shield-=a; rem-=a; }
      p.hp-=rem; SFX.hurt(); e.cd=0.6; shake(6);
      particles(p.x,p.y,'#ff3d6a',10,200,0.45,2);
      flashDamage();
      // Reset combo on heavy hit
      if(rem>15){ state.combo=0; state.comboMul=1; updateComboUI(); }
    }
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
  ctx.translate(-state.cam.x+sx, -state.cam.y+sy);
  ctx.strokeStyle='rgba(157,92,255,.6)'; ctx.lineWidth=2; ctx.shadowColor='#9d5cff'; ctx.shadowBlur=18;
  ctx.strokeRect(0,0,state.arena.w,state.arena.h); ctx.shadowBlur=0;
  for(const f of state.fx){ const a=Math.max(0,f.life/f.life0); if(f.ring){ ctx.beginPath(); ctx.arc(f.x,f.y,f.r,0,Math.PI*2); ctx.strokeStyle=withAlpha(f.color,0.3*a); ctx.lineWidth=4; ctx.shadowColor=f.color; ctx.shadowBlur=30; ctx.stroke(); ctx.shadowBlur=0; } else { ctx.fillStyle=withAlpha(f.color,a); ctx.beginPath(); ctx.arc(f.x,f.y,f.r,0,Math.PI*2); ctx.fill(); } }
  for(const e of state.enemies){
    ctx.save(); ctx.translate(e.x,e.y); ctx.shadowColor=e.col; ctx.shadowBlur=e.boss?28:16; ctx.fillStyle=e.col;
    if(e.type==='brute') ctx.fillRect(-e.r,-e.r,e.r*2,e.r*2);
    else if(e.type==='phantom'){ ctx.beginPath(); ctx.moveTo(0,-e.r); ctx.lineTo(e.r,0); ctx.lineTo(0,e.r); ctx.lineTo(-e.r,0); ctx.closePath(); ctx.fill(); }
    else if(e.type==='boss'){ ctx.beginPath(); for(let i=0;i<6;i++){ const a=i/6*Math.PI*2; ctx.lineTo(Math.cos(a)*e.r, Math.sin(a)*e.r); } ctx.closePath(); ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(0,0,e.r,0,Math.PI*2); ctx.fill(); }
    ctx.restore();
    if(e.hp<e.hpMax){ const w = e.boss?80:e.r*2; ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(e.x-w/2,e.y-e.r-8,w,e.boss?5:3); ctx.fillStyle=e.col; ctx.fillRect(e.x-w/2,e.y-e.r-8,w*Math.max(0,e.hp/e.hpMax),e.boss?5:3); }
  }
  // Local bullets
  for(const b of state.bullets){
    for(let i=0;i<b.trail.length;i++){ const t=i/b.trail.length; ctx.fillStyle=withAlpha(b.color,0.15+0.5*t); ctx.beginPath(); ctx.arc(b.trail[i].x,b.trail[i].y,b.radius*(0.5+t*0.6),0,Math.PI*2); ctx.fill(); }
    ctx.shadowColor=b.color; ctx.shadowBlur=18; ctx.fillStyle=b.color; ctx.beginPath(); ctx.arc(b.x,b.y,b.radius,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
  }
  // Remote bullets (visual only)
  for(const b of state.remoteBullets){
    for(let i=0;i<(b.trail||[]).length;i++){ const t=i/b.trail.length; ctx.fillStyle=withAlpha(b.color,0.15+0.5*t); ctx.beginPath(); ctx.arc(b.trail[i].x,b.trail[i].y,b.radius*(0.5+t*0.6),0,Math.PI*2); ctx.fill(); }
    ctx.shadowColor=b.color; ctx.shadowBlur=14; ctx.fillStyle=b.color; ctx.beginPath(); ctx.arc(b.x,b.y,b.radius,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
  }
  if(state.mode==='multi'){ for(const o of state.others.values()) drawPlayer(o,false); }
  drawPlayer(state.player, true);
  ctx.restore();
}

function drawPlayer(p, local){
  if(!p) return;
  const h = HEROES[p.heroId]; if(!h) return;
  if(p.dashing>0){ for(let i=0;i<6;i++){ ctx.fillStyle=withAlpha(h.color,0.06+i*0.02); ctx.beginPath(); ctx.arc(p.x-Math.cos(p.angle||0)*i*4,p.y-Math.sin(p.angle||0)*i*4,16,0,Math.PI*2); ctx.fill(); } }
  if(p.abiFlash>0){
    ctx.beginPath(); ctx.arc(p.x,p.y,30+ (1-p.abiFlash/0.4)*60, 0, Math.PI*2);
    ctx.strokeStyle = withAlpha(h.color, p.abiFlash); ctx.lineWidth = 3; ctx.shadowColor=h.color; ctx.shadowBlur=24; ctx.stroke(); ctx.shadowBlur=0;
  }
  ctx.save(); ctx.translate(p.x,p.y); ctx.shadowColor=h.color; ctx.shadowBlur= p.fxFlash>0 ? 32 : 22;
  ctx.fillStyle = local ? h.color : '#ffffff';
  ctx.beginPath(); ctx.arc(0,0,16,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
  ctx.rotate(p.angle||0); ctx.strokeStyle=h.color; ctx.lineWidth=3; ctx.shadowColor=h.color; ctx.shadowBlur=14;
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(28 + (p.fxFlash>0?8:0),0); ctx.stroke(); ctx.shadowBlur=0;
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
function hideUpgrade(){
  const u = document.getElementById('upgrade');
  u.classList.remove('show');
  u.classList.add('hidden') && false; // no-op safety
  u.classList.remove('hidden');
  u.style.display = 'none';
}
function showUpgradePicker(){
  state.paused=true;
  const choices = pickN(UPGRADES, 3);
  const wrap = $('#ucards'); wrap.innerHTML='';
  const titleEl = document.getElementById('upgradeTitle');
  if(titleEl) titleEl.textContent = `LEVEL ${state.level} — Choose an Upgrade`;
  choices.forEach(u=>{
    const el=document.createElement('div'); el.className='ucard';
    el.innerHTML=`<h4>${u.name}</h4><p>${u.desc}</p>`;
    el.onclick=()=>{
      u.apply(state.player);
      state.pendingUpgrades = Math.max(0, state.pendingUpgrades - 1);
      hideUpgrade();
      toast(`Acquired: ${u.name}`);
      // If more pending, immediately re-open
      if(state.pendingUpgrades>0){ setTimeout(showUpgradePicker, 250); }
      else { state.paused=false; }
    };
    wrap.appendChild(el);
  });
  const u = document.getElementById('upgrade');
  u.classList.remove('hidden');
  u.classList.add('show');
  u.style.display='flex';
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

function bindCommonRoomHandlers(){
  if(!activeRoom) return;
  activeRoom.onMessage('playerState', (msg) => {
    if(!msg || !msg.id || msg.id === state.mySessionId) return;
    const existing = state.others.get(msg.id) || { fxFlash:0, abiFlash:0, dashing:0 };
    state.others.set(msg.id, { ...existing, ...msg });
  });
  activeRoom.onMessage('attack', (msg)=>{
    if(!msg || msg.id === state.mySessionId) return;
    const o = state.others.get(msg.id); if(!o) return;
    playRemoteAttack(o, msg);
  });
  activeRoom.onMessage('ability', (msg)=>{
    if(!msg || msg.id === state.mySessionId) return;
    const o = state.others.get(msg.id); if(!o) return;
    playRemoteAbility(o, msg);
  });
  activeRoom.onMessage('dash', (msg)=>{
    if(!msg || msg.id === state.mySessionId) return;
    const o = state.others.get(msg.id); if(!o) return;
    playRemoteDash(o, msg);
  });
  activeRoom.onMessage('bullet', (msg)=>{
    if(!msg || msg.id === state.mySessionId) return;
    const o = state.others.get(msg.id); if(!o) return;
    spawnRemoteBullet(o, msg);
  });
  activeRoom.onMessage('kill', (msg)=>{
    if(!msg || msg.id === state.mySessionId) return;
    particles(msg.x, msg.y, msg.col||'#fff', 12, 220, 0.5, 2);
  });
  activeRoom.onMessage('death', (msg)=>{
    if(!msg || msg.id === state.mySessionId) return;
    const o = state.others.get(msg.id);
    if(o){ o.alive=false; particles(o.x, o.y, '#ff3d6a', 30, 240, 0.8, 3); toast(`${o.name||'Player'} died`); }
  });
}

async function joinRoom(roomName, options = {}){
  try{
    const opts = { name: state.username || 'Operator', heroId: state.hero, ...options };
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

    activeRoom.onMessage('countdown', (msg) => {
      state.lobby.countdown = msg.n || 0;
      if(msg.cancelled || !msg.n){ setCountdownText(''); renderLobby(); }
      else { setCountdownText(msg.n > 0 ? msg.n : 'GO'); }
    });
    activeRoom.onMessage('startGame', (msg) => {
      setCountdownText('');
      try{ startGame('multi'); }
      catch(e){ console.error('startGame failed:', e); alert('startGame error: '+e.message); }
    });
    bindCommonRoomHandlers();

    activeRoom.onLeave(() => { console.log('[net] left room'); });
    activeRoom.onError((code, message) => { console.error('[net] room error', code, message); alert('Room error: '+message); });

  } catch(e){
    console.error('Connection error:', e);
    alert("Can't connect to the game server. It may be waking up — try again in a few seconds.\n\nDetails: "+e.message);
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
      dashing: p.dashing>0 ? 1 : 0,
    });
  }catch(e){}
}

async function leaveLobby(targetScene='menu'){
  if(activeRoom){ try{ await activeRoom.leave(); }catch(e){} activeRoom=null; }
  state.roomCode=null; state.isHost=false; state.mySessionId=null;
  state.lobby.players.clear(); state.lobby.phase='waiting'; state.lobby.countdown=0;
  state.others.clear();
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
    try{
      if(activeRoom){ try{ await activeRoom.leave(); }catch(e){} activeRoom=null; }
      activeRoom = await client.joinById(code, { name: state.username || 'Operator', heroId: state.hero });
      state.roomCode = activeRoom.id; state.mySessionId = activeRoom.sessionId;
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
  bindCommonRoomHandlers();
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
