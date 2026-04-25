// ==============================================================
// NEURAL SURVIVAL: FRACTURE REALM — Colyseus multiplayer build
// + GOD MODE: 10-phase cinematic boss gauntlet (offline + co-op)
// Vanilla canvas. Multiplayer powered by Colyseus.
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
  joross:{ name:"Joross",role:"Plasma Gunner",img:"heroes/joross.png", hp:70, speed:225, dmg:9,  atkCd:0.10, range:480, abi:"Suppress",    abiCd:6,  color:"#ff8a3d", desc:"Continuous plasma fire. Q triples fire-rate for 3s and pierces lightly armored foes." },
  jeb:   { name:"Jeb",   role:"Cross Healer", img:"heroes/jeb.png",    hp:110, speed:215, dmg:14, atkCd:0.55, range:380, abi:"Sanctum",     abiCd:9,  color:"#3dffb0", desc:"Holy bolts and a healing zone." },
  jeff:  { name:"Jeff",  role:"Assassin",     img:"heroes/jeff.png",   hp:70,  speed:285, dmg:48, atkCd:0.35, range:48,  abi:"Phase Slash", abiCd:5,  color:"#ff3d6a", desc:"Glass cannon. Tiny HP, blinding speed, lethal twin daggers." },
};
const HERO_IDS = Object.keys(HEROES);

// ---------- Upgrades (used by classic mode + god-mode pickups) ----------
// Each upgrade is also a possible floor drop in God Mode. To make drops feel
// more varied, an upgrade can declare an optional `color` used by the pickup
// sprite — falls back to the default amber if missing.
const UPGRADES = [
  { id:"speed", name:"Neon Sprint", desc:"+15% movement speed.", color:'#3dffb0', apply:p=>p.mods.speed*=1.15 },
  { id:"cdr",   name:"Overclock",   desc:"-20% all cooldowns.",  color:'#22e8ff', apply:p=>{p.mods.cdr*=0.8} },
  { id:"shield",name:"Phase Shield",desc:"+40 HP regenerating shield.", color:'#9d5cff', apply:p=>{p.mods.shieldMax+=40; p.shield=p.mods.shieldMax} },
  { id:"aura",  name:"Damage Aura", desc:"Burn nearby enemies for 12 dps.", color:'#ff8a3d', apply:p=>{p.mods.aura+=12} },
  { id:"slow",  name:"Time Dilation", desc:"Slow nearby enemies by 25%.", color:'#7ec8ff', apply:p=>{p.mods.slow=Math.min(0.6, p.mods.slow+0.25)} },
  { id:"regen", name:"Bio-Weave",  desc:"Regenerate 4 HP/s.", color:'#7dff7d', apply:p=>{p.mods.regen+=4} },
  { id:"weapon",name:"Weapon Tuning", desc:"+25% damage, +10% range.", color:'#ff5577', apply:p=>{p.mods.dmg*=1.25; p.mods.range*=1.10} },
  { id:"firerate", name:"Trigger Discipline", desc:"+25% attack speed.", color:'#ffd166', apply:p=>{p.mods.atkSpd*=1.25} },
  { id:"vamp", name:"Vampiric Edge", desc:"Heal 8% of damage dealt.", color:'#ff4060', apply:p=>{p.mods.lifesteal+=0.08} },
  { id:"heal", name:"Stim Shot", desc:"Restore 50% HP instantly.", color:'#ff9eb8', apply:p=>{ p.hp = Math.min(p.hpMax, p.hp + p.hpMax*0.5); } },
  { id:"berserk", name:"Berserker Pulse", desc:"+40% damage for the next phase.", color:'#ff2bd6', apply:p=>{ p.mods.dmg*=1.4; } },
  { id:"hpmax", name:"Neural Lattice", desc:"+30 max HP and full heal.", color:'#ffe07a', apply:p=>{ p.hpMax+=30; p.hp=p.hpMax; } },
  // ===== NEW DROP TYPES =====
  { id:"sniper",     name:"Sniper Coil",   desc:"+60% range, +10% damage.",          color:'#22ffe8', apply:p=>{ p.mods.range*=1.60; p.mods.dmg*=1.10; } },
  { id:"hyperedge",  name:"Hyper Edge",    desc:"+50% damage.",                       color:'#ff3b3b', apply:p=>{ p.mods.dmg*=1.50; } },
  { id:"ironwill",   name:"Iron Will",     desc:"+50 max HP.",                         color:'#ffce5c', apply:p=>{ p.hpMax+=50; p.hp=Math.min(p.hpMax, p.hp+50); } },
  { id:"phoenix",    name:"Phoenix Pact",  desc:"+20 max HP and full heal.",           color:'#ff7755', apply:p=>{ p.hpMax+=20; p.hp=p.hpMax; } },
  { id:"aegis",      name:"Aegis Pulse",   desc:"+60 instant shield (one-time).",      color:'#a3c9ff', apply:p=>{ p.shield=Math.min((p.mods.shieldMax||0)+60, (p.shield||0)+60); if(p.mods.shieldMax<60) p.mods.shieldMax=60; } },
  { id:"frostbite",  name:"Frostbite Aura",desc:"+15% slow on nearby enemies.",        color:'#9ee8ff', apply:p=>{ p.mods.slow=Math.min(0.6, p.mods.slow+0.15); } },
  { id:"plasmahalo", name:"Plasma Halo",   desc:"+18 dps damage aura.",                color:'#ffaa3d', apply:p=>{ p.mods.aura+=18; } },
  { id:"adrenaline", name:"Adrenaline",    desc:"+20% atk speed, -10% cooldowns.",     color:'#ffe066', apply:p=>{ p.mods.atkSpd*=1.20; p.mods.cdr*=0.90; } },
  { id:"swift",      name:"Burst Sprint",  desc:"+25% move speed.",                    color:'#5dffd0', apply:p=>{ p.mods.speed*=1.25; } },
  { id:"bloodpact",  name:"Blood Pact",    desc:"+12% lifesteal.",                     color:'#cc1140', apply:p=>{ p.mods.lifesteal+=0.12; } },
  { id:"glasscannon",name:"Glass Cannon",  desc:"+70% damage, -20% max HP.",           color:'#ff2bd6', apply:p=>{ p.mods.dmg*=1.70; p.hpMax=Math.max(20, Math.floor(p.hpMax*0.80)); p.hp=Math.min(p.hpMax, p.hp); } },
];

// ---------- Globals ----------
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
let W=0,H=0,DPR=Math.min(2, window.devicePixelRatio||1);
let ZOOM = 1;
function computeZoom(){
  const minSide = Math.min(W,H);
  // Base zoom by screen size
  if(minSide < 500) ZOOM = 0.6;
  else if(minSide < 800) ZOOM = 0.78;
  else ZOOM = 1;
  // GOD MODE: pull camera back further on mobile/tablet so players can see
  // telegraphs and bosses across the wider arena. Desktop unchanged.
  try {
    if (typeof isGodMode === 'function' && isGodMode()) {
      if (minSide < 500)      ZOOM *= 0.78; // ~0.47 — phones get a much wider view
      else if (minSide < 800) ZOOM *= 0.85; // ~0.66 — tablets
      // desktop untouched
    }
  } catch(_) {}
}
// Recompute zoom whenever scene/mode changes
function refreshZoom(){ try { computeZoom(); } catch(_) {} }
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

// ---------- Wave config (classic mode) ----------
const WAVE_PREP = 10;
const WAVE_ENEMIES = (n)=> 8 + n*4;
const WAVE_SPAWN_INTERVAL = (n)=> Math.max(0.35, 1.2 - n*0.06);

// ==============================================================
// GOD MODE CONFIG — 10 phases of cinematic boss combat
// ==============================================================
// Each boss gets:
//   - name, title (subtitle), color (themed glow), arenaTint (bg overlay)
//   - hpMul (scales with players), radius (grows each phase)
//   - skills: ordered list of skill IDs from BOSS_SKILLS that this boss casts
//   - introMs: how long the cinematic intro lasts before combat begins
// Skills are arrays so each phase ADDS skills on top of the previous (evolution).
const BOSS_SKILLS_LIST = [
  'telegraph_beam',          // dark fade-in glowing line, then beam fires
  'shockwave',               // expanding ring you must outrun
  'bullet_spiral',           // rotating spiral of projectiles
  'homing_orbs',             // slow seeking orbs
  'summon_minions',          // spawns adds
  'teleport_strike',         // disappears, reappears next to player, slashes
  'clone_split',             // spawns 2 fast decoys
  'void_zone',               // persistent ground hazards
  'meteor_rain',             // telegraphed AoE drops
  'laser_sweep',             // rotating beam sweep
  'ground_spikes',           // line of upward spikes
  'dash_strike',             // charges across arena
  'chain_lightning',         // arcing lightning bolts
  'black_hole',              // pulls player toward boss
  'reality_break',           // ultimate combo
  // ===== NEW SKILLS (5) — added in this patch =====
  'prismatic_burst',         // 3-color delayed AoE rings (boss_prismatic_burst.mp3)
  'gravity_well',            // anchored pull + crushing damage tick (boss_gravity_well.mp3)
  'shadow_clones_assault',   // 4 shadow clones each cast a beam at player (boss_shadow_clones_assault.mp3)
  'time_freeze_pulse',       // brief slow-field on player + ring of bullets (boss_time_freeze_pulse.mp3)
  'nova_implosion',          // implode-then-explode 360° projectile blast (boss_nova_implosion.mp3)
  'radial_collapse',         // light-weight nova replacement for phase 10  (boss_radial_collapse.mp3)
  // ===== NEW PHASE-11 NINJA SKILLS — supply matching .mp3 files =====
  'phantom_step',            // chain blink-slash around the player, untouchable mid-blink (boss_phantom_step.mp3)
  'shuriken_storm',          // expanding swirl of curving shuriken in waves         (boss_shuriken_storm.mp3)
  'umbral_dash',             // arena-crossing untouchable dash leaving a slash beam (boss_umbral_dash.mp3)
  'mirror_legion',           // ring of shadow doubles, each dashes the player      (boss_mirror_legion.mp3)
  'eclipse_finale',          // phase 11 ultimate combo (storm + nova + meteors)    (boss_eclipse_finale.mp3)
];

// Global boss damage multiplier — extra nerf so survival is more forgiving
// in both solo and co-op God Mode.
// Applied at every player-take-damage site that originates from a boss
// (contact, hostile bullets, beams, zones, shocks, in-skill direct hits).
const BOSS_DMG_MUL = 0.65;
// Extra nerf specifically for *physical contact* with a boss (boss touching
// the player). Stacks on top of BOSS_DMG_MUL — touch hits were unreasonably
// punishing, especially on phase 11's fast humanoid that closes in constantly.
const BOSS_CONTACT_MUL = 0.55;

// Phase HP buffed ~2.2x across the board — bosses were melting too fast.
// `signature` = the skill that drops on this boss's death as a low-version
// player ability the collector can fire with F (or the mobile SKILL button).
const BOSS_PHASES = [
  { name:"Void Herald",        title:"THE GATE OPENS",         color:"#9d5cff", arenaTint:"rgba(157,92,255,.10)",
    hpMul: 2.2,  radius: 64,  music:"boss1",  signature:'prismatic_burst',
    skills:['telegraph_beam','shockwave','prismatic_burst'] },
  { name:"Crimson Reaper",     title:"BLADE OF THE FIRST KILL",color:"#ff3d6a", arenaTint:"rgba(255,61,106,.10)",
    hpMul: 3.6,  radius: 82,  music:"boss2",  signature:'dash_strike',
    skills:['telegraph_beam','shockwave','dash_strike','prismatic_burst'] },
  { name:"Spectral Weaver",    title:"DREAMS OF GLASS",        color:"#22e8ff", arenaTint:"rgba(34,232,255,.10)",
    hpMul: 5.4,  radius: 100, music:"boss3",  signature:'time_freeze_pulse',
    skills:['telegraph_beam','shockwave','dash_strike','bullet_spiral','homing_orbs','time_freeze_pulse'] },
  { name:"Ironclad Behemoth",  title:"THE WALL THAT WALKS",    color:"#ff8a3d", arenaTint:"rgba(255,138,61,.10)",
    hpMul: 7.6,  radius: 122, music:"boss4",  signature:'nova_implosion',
    skills:['shockwave','bullet_spiral','homing_orbs','ground_spikes','summon_minions','nova_implosion'] },
  { name:"Phase Stalker",      title:"BLINK / KILL / BLINK",   color:"#3dffb0", arenaTint:"rgba(61,255,176,.10)",
    hpMul: 10.2, radius: 138, music:"boss5",  signature:'shadow_clones_assault',
    skills:['telegraph_beam','dash_strike','teleport_strike','homing_orbs','clone_split','shadow_clones_assault'] },
  { name:"Stormcaller Tyrant", title:"BIND THE LIGHTNING",     color:"#ffd166", arenaTint:"rgba(255,209,102,.12)",
    hpMul: 13.4, radius: 158, music:"boss6",  signature:'chain_lightning',
    skills:['shockwave','bullet_spiral','homing_orbs','laser_sweep','chain_lightning','summon_minions','time_freeze_pulse'] },
  { name:"Necrotide Empress",  title:"DROWN THE LIVING",       color:"#9d5cff", arenaTint:"rgba(157,92,255,.16)",
    hpMul: 17.0, radius: 178, music:"boss7",  signature:'void_zone',
    skills:['telegraph_beam','homing_orbs','void_zone','meteor_rain','clone_split','summon_minions','prismatic_burst','nova_implosion'] },
  { name:"Forge of Endings",   title:"WHERE WORLDS ARE UNMADE",color:"#ff8a3d", arenaTint:"rgba(255,138,61,.16)",
    hpMul: 21.0, radius: 204, music:"boss8",  signature:'gravity_well',
    skills:['shockwave','bullet_spiral','meteor_rain','laser_sweep','ground_spikes','gravity_well','nova_implosion','prismatic_burst'] },
  { name:"Archon of Silence",  title:"NO PRAYERS REACH HIM",   color:"#22e8ff", arenaTint:"rgba(34,232,255,.18)",
    hpMul: 27.0, radius: 230, music:"boss9",  signature:'meteor_rain',
    skills:['telegraph_beam','shockwave','dash_strike','teleport_strike','homing_orbs','laser_sweep','chain_lightning','gravity_well','meteor_rain','shadow_clones_assault','time_freeze_pulse'] },
  { name:"OMEGA — The Last God",title:"BURN OR BE REMEMBERED", color:"#ff2bd6", arenaTint:"rgba(255,43,214,.22)",
    hpMul: 36.0, radius: 270, music:"boss10", signature:'reality_break',
    skills:['telegraph_beam','shockwave','dash_strike','teleport_strike','clone_split','void_zone','meteor_rain','laser_sweep','chain_lightning','gravity_well','reality_break','summon_minions','bullet_spiral','homing_orbs','ground_spikes','prismatic_burst','shadow_clones_assault','time_freeze_pulse','radial_collapse'] },
  // ----- Phase 11: humanoid god-form (ninja/assassin) -----
  // After OMEGA falls, the divine essence reforges into a slim humanoid
  // avatar — high movement speed, micro-blinks, and brief untouchable
  // frames during attacks. Every prior skill is in the rotation (they
  // already scale with phase, so they hit harder here) plus the five
  // new ninja-flavored skills.
  { name:"OMEGA REBORN",       title:"INCARNATE GOD-FORM",     color:"#ffffff", arenaTint:"rgba(255,255,255,.12)",
    hpMul: 50.0, radius: 46,  music:"boss11", signature:'phantom_step',
    skills:[
      'phantom_step','shuriken_storm','umbral_dash','mirror_legion',
      'dash_strike','teleport_strike','telegraph_beam','clone_split',
      'shuriken_storm','homing_orbs','laser_sweep','phantom_step',
      'chain_lightning','umbral_dash','meteor_rain','prismatic_burst',
      'mirror_legion','time_freeze_pulse','nova_implosion','eclipse_finale',
    ] },
];

// Display info for each boss signature skill the player can collect.
const PLAYER_BOSS_SKILL_INFO = {
  prismatic_burst:       { name:'Prismatic Burst',  desc:'Three layered bullet rings explode from you.', cdMax: 7 },
  dash_strike:           { name:'Phase Dash',       desc:'Lunge forward and slash everything in front.', cdMax: 6 },
  time_freeze_pulse:     { name:'Chrono Pulse',     desc:'Outward ring that slows nearby enemies.',      cdMax: 7 },
  nova_implosion:        { name:'Nova Implosion',   desc:'Radial bullet nova around you.',               cdMax: 8 },
  shadow_clones_assault: { name:'Phantom Beams',    desc:'Three forward beams in a tight cone.',         cdMax: 6 },
  chain_lightning:       { name:'Chain Lightning',  desc:'Arcs to up to 3 nearest enemies.',             cdMax: 6 },
  void_zone:             { name:'Void Zone',        desc:'Drops a damaging zone where you aim.',         cdMax: 9 },
  gravity_well:          { name:'Singularity',      desc:'Two crush sites detonate where you aim.',      cdMax: 8 },
  meteor_rain:           { name:'Meteor Rain',      desc:'Three meteors slam down where you aim.',       cdMax: 9 },
  reality_break:         { name:'Reality Break',    desc:'Burst + 3 meteors. Omega in your hands.',      cdMax: 12 },
  phantom_step:          { name:'Phantom Step',     desc:'Blink to your aim, slashing nearby enemies.',  cdMax: 6 },
};

// ---------- Pickup table (God Mode) ----------
// Each pickup maps to one of the existing UPGRADES, gets a glyph color,
// and triggers the "collect.mp3" sfx + cinematic banner on pickup.
const PICKUP_RADIUS = 22;
// Drop cadence — slower than the previous patch so the floor isn't littered.
const PICKUP_SPAWN_INTERVAL = 14;    // was 5 — much less frequent
const PICKUP_SPAWN_JITTER   = 4;     // was 1.5 — wider random gap on top
const PICKUP_BASE_PER_CYCLE = 1;     // was 2 — back to one drop per cycle in solo

// ---------- Drop rarity tiers ----------
// Picked at spawn time by weighted random. `stacks` = how many times the
// upgrade's effect is applied on collect, so legendary drops feel huge.
// `ringWidth` and `ringColor` style the floor sprite, and `pillar` controls
// the column-of-light fx so rare+ drops are visible from far away.
const RARITY_TIERS = [
  // Heavily nerfed: epic and legendary are now true scores. ~85% common.
  { id:'common',    label:'Common',    weight:850, stacks:1, ringColor:'#ffffff', ringWidth:1.5, pillar:false, sparkles:false, banner:'',           color:'#ffffff' },
  { id:'rare',      label:'Rare',      weight:130, stacks:2, ringColor:'#5dafff', ringWidth:2.5, pillar:true,  sparkles:false, banner:'★★ RARE',     color:'#5dafff' },
  { id:'epic',      label:'Epic',      weight:18,  stacks:3, ringColor:'#c46bff', ringWidth:3.0, pillar:true,  sparkles:true,  banner:'★★★ EPIC',   color:'#c46bff' },
  { id:'legendary', label:'Legendary', weight:2,   stacks:4, ringColor:'#ffb347', ringWidth:3.5, pillar:true,  sparkles:true,  banner:'★★★★ LEGENDARY', color:'#ffb347' },
];
const RARITY_TOTAL_WEIGHT = RARITY_TIERS.reduce((s,r)=>s+r.weight, 0);
function rollRarity(){
  let n = Math.random() * RARITY_TOTAL_WEIGHT;
  for(const r of RARITY_TIERS){ n -= r.weight; if(n <= 0) return r; }
  return RARITY_TIERS[0];
}
function getRarity(id){ return RARITY_TIERS.find(r=>r.id===id) || RARITY_TIERS[0]; }
// Some upgrades are flat one-shots that would be silly to stack 4×. For
// these, rarity grants a flat bonus instead of running apply() N times.
const NO_STACK_UPGRADES = new Set(['heal','phoenix','glasscannon','aegis','ironwill','hpmax']);

// ---------- SFX engine ----------
const SFX = (() => {
  const BASE = 'sounds/';
  const VOL = { sfx: 0.7, music: 0.35 };
  const pools = {};
  const POOL_SIZE = 4;
  function makePool(src){ const arr=[]; for(let i=0;i<POOL_SIZE;i++){ const a=new Audio(src); a.preload='auto'; a.volume=VOL.sfx; arr.push(a); } return {arr,i:0}; }
  function getPool(key, src){ if(!pools[key]) pools[key]=makePool(src); return pools[key]; }
  function play(key, src, volMul=1){ try{ const p=getPool(key,src); const a=p.arr[p.i]; p.i=(p.i+1)%p.arr.length; a.currentTime=0; a.volume=VOL.sfx*volMul; const pr=a.play(); if(pr&&pr.catch) pr.catch(()=>{});}catch(e){} }
  function fire(h='james'){play('fire_'+h, `${BASE}fire_${h}.mp3`);}
  function ability(h='james'){play('q_'+h, `${BASE}q_${h}.mp3`);}
  function dash(){play('dash', `${BASE}dash.mp3`);}
  function hit(){play('hit', `${BASE}hit.mp3`);}
  function hurt(){play('hurt', `${BASE}hurt.mp3`);}
  // God Mode named sfx — file names match the docs you'll record:
  function collect(){play('collect', `${BASE}collect.mp3`);}
  function bossSkill(name, vol=1){ play('bs_'+name, `${BASE}boss_${name}.mp3`, vol); }
  function fireRemote(h='james'){play('fire_'+h, `${BASE}fire_${h}.mp3`, 0.45);}
  function abilityRemote(h='james'){play('q_'+h, `${BASE}q_${h}.mp3`, 0.5);}
  function dashRemote(){play('dash', `${BASE}dash.mp3`, 0.4);}
  let music=null, currentTrack=null, fadeRaf=null;
  function _clearFade(){ if(fadeRaf){ cancelAnimationFrame(fadeRaf); fadeRaf=null; } }
  function _fadeAudio(audio, from, to, ms, onDone){
    if(!audio){ if(onDone) onDone(); return; }
    const t0 = performance.now();
    function step(now){
      const t = Math.min(1, (now - t0) / ms);
      const v = from + (to - from) * t;
      try { audio.volume = Math.max(0, Math.min(1, v)); } catch(e){}
      if(t < 1) fadeRaf = requestAnimationFrame(step);
      else { fadeRaf = null; if(onDone) onDone(); }
    }
    fadeRaf = requestAnimationFrame(step);
  }
  // Crossfade music tracks. fadeMs default 1200ms (per-phase boss themes).
  function playMusic(track, fadeMs){
    fadeMs = (fadeMs == null) ? 1200 : fadeMs;
    if(currentTrack===track && music && !music.paused) return;
    const old = music;
    let next = null;
    try{
      next = new Audio(`${BASE}${track}.mp3`);
      next.loop = true;
      next.volume = 0;
      const pr = next.play(); if(pr && pr.catch) pr.catch(()=>{});
    }catch(e){ next = null; }
    music = next;
    currentTrack = track;
    _clearFade();
    // Fade old out, new in (in parallel-ish via two RAFs)
    if(old){
      const startVol = (typeof old.volume === 'number') ? old.volume : VOL.music;
      _fadeAudio(old, startVol, 0, fadeMs, ()=>{ try{ old.pause(); }catch(e){} });
    }
    if(next){
      // small delay-free fade-in alongside fade-out
      _fadeAudio(next, 0, VOL.music, fadeMs);
    }
  }
  function stopMusic(fadeMs){
    fadeMs = (fadeMs == null) ? 600 : fadeMs;
    const old = music; music = null; currentTrack = null;
    _clearFade();
    if(old){
      const startVol = (typeof old.volume === 'number') ? old.volume : VOL.music;
      _fadeAudio(old, startVol, 0, fadeMs, ()=>{ try{ old.pause(); }catch(e){} });
    }
  }
  function unlock(){ if(music && music.paused) music.play().catch(()=>{}); }
  ['pointerdown','touchstart','keydown','click'].forEach(ev=>window.addEventListener(ev, unlock, {passive:true}));
  function preload(key, src){
    return new Promise((resolve)=>{
      try{
        getPool(key, src);
        const a = new Audio(src); a.preload='auto';
        const done=()=>resolve();
        a.addEventListener('canplaythrough', done, {once:true});
        a.addEventListener('error', done, {once:true});
        setTimeout(done, 4500);
        a.load();
      }catch(e){ resolve(); }
    });
  }
  return { fire, ability, dash, hit, hurt, collect, bossSkill, unlock, playMusic, stopMusic, preload, fireRemote, abilityRemote, dashRemote };
})();

const state = {
  scene: 'menu',
  mode: 'single',           // 'single' | 'multi' | 'god' | 'godmulti'
  username: localStorage.getItem('ns_user') || '',
  hero: localStorage.getItem('ns_hero') || 'james',
  heroPortraits: {},
  player: null,
  others: new Map(),
  enemies: [], bullets: [], fx: [], pickups: [],
  arena: { w:3200, h:2200 },
  cam: {x:0,y:0,shake:0},
  time: 0, score: 0, kills: 0, fracture: 0,
  // Wave system (classic mode)
  wave: 0,
  wavePhase: 'prep',
  waveTimer: WAVE_PREP,
  waveSpawnTimer: 0,
  waveToSpawn: 0,
  waveEnemiesAlive: 0,
  paused: false, running: false, startedAt: 0,
  roomCode: null,
  isHost: false,
  upgradeOpenForWave: 0,
  upgradeChosenForWave: 0,
  reviveHoldTime: 0,
  reviveTarget: null,
  beingRevivedTime: 0,
  mySessionId: null,
  lobby: { players: new Map(), countdown: 0, phase:'waiting' },
  enemySeq: 1,
  // ---- GOD MODE ----
  god: null,   // populated in startGodMode()
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
  if(s==='game'){
    if(isGodMode()) SFX.playMusic('god');
    else SFX.playMusic('bgm_game');
  } else SFX.playMusic('bgm_menu');
  // Hide god-mode-only UI on non-game scenes
  if(s!=='game'){ hideBossBar(); hideGodIntro(); }
}
function toast(msg, ms=1600){
  const t=$('#toast'); t.textContent=msg; t.style.display='block';
  clearTimeout(toast._t); toast._t=setTimeout(()=>t.style.display='none', ms);
}
function isGodMode(){ return state.mode === 'god' || state.mode === 'godmulti'; }
function isMultiMode(){ return state.mode === 'multi' || state.mode === 'godmulti'; }

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
const touch = { active:false, mx:0, my:0, stickId:-1, stickCx:0, stickCy:0, attack:false, dash:false, ability:false, dashEdge:false, abiEdge:false, boss:false, bossEdge:false };
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
  function bindBtn(id,key){ const el=document.getElementById(id); if(!el) return; el.addEventListener('touchstart', e=>{ e.preventDefault(); el.classList.add('pressed'); touch[key]=true; if(key==='dash') touch.dashEdge=true; if(key==='ability') touch.abiEdge=true; if(key==='boss') touch.bossEdge=true; }, {passive:false}); const up=e=>{ e.preventDefault(); el.classList.remove('pressed'); touch[key]=false; }; el.addEventListener('touchend',up); el.addEventListener('touchcancel',up); }
  bindBtn('tAttack','attack'); bindBtn('tDash','dash'); bindBtn('tAbility','ability'); bindBtn('tBossSkill','boss');
  const reviveBtn = document.getElementById('tRevive');
  if(reviveBtn){
    const down = e=>{ e.preventDefault(); reviveBtn.classList.add('pressed'); keys['e'] = true; };
    const up   = e=>{ e.preventDefault(); reviveBtn.classList.remove('pressed'); keys['e'] = false; };
    reviveBtn.addEventListener('touchstart', down, {passive:false});
    reviveBtn.addEventListener('touchend',   up);
    reviveBtn.addEventListener('touchcancel',up);
  }
  cvs.addEventListener('touchmove', e=>e.preventDefault(), {passive:false});
}
initTouchUI();

function updateTouchCooldownUI(p){
  if(!IS_TOUCH || !p) return;
  const set = (id,cd,max)=>{ const el=document.getElementById(id); if(!el) return; const pct=max>0?Math.max(0,Math.min(100,(cd/max)*100)):0; el.style.setProperty('--cd', pct+'%'); el.classList.toggle('ready', cd<=0); };
  const h = HEROES[p.heroId];
  set('tAttack', p.atkCd, h.atkCd); set('tDash', p.dashCd, 2); set('tAbility', p.abiCd, h.abiCd);
  // Boss-skill button: only visible when the player has acquired one.
  const bsBtn = document.getElementById('tBossSkill');
  if(bsBtn){
    if(p.bossSkill){
      bsBtn.style.display = '';
      bsBtn.style.borderColor = p.bossSkill.color;
      bsBtn.style.boxShadow = `0 0 22px ${p.bossSkill.color}aa, inset 0 0 14px ${p.bossSkill.color}55`;
      const lbl = bsBtn.querySelector('.bsLabel');
      if(lbl) lbl.textContent = p.bossSkill.name.length > 10 ? 'SKILL' : p.bossSkill.name;
      set('tBossSkill', p.bossSkill.cd, p.bossSkill.cdMax);
    } else {
      bsBtn.style.display = 'none';
    }
  }
}

function makeDefaultMods(){
  return { speed:1, cdr:1, dmg:1, range:1, atkSpd:1, shieldMax:0, aura:0, slow:0, regen:0, lifesteal:0 };
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
    mods: makeDefaultMods(),
    abiState: 0,
    // Boss-skill drop slot. null when empty; otherwise:
    // {id, name, color, phase, cd, cdMax}
    bossSkill: null,
  };
}

function canAuthorEnemies(){
  return !isMultiMode() || state.isHost;
}

function makeEnemy(data){
  return {
    id: data.id || ('e'+(state.enemySeq++)),
    type: data.type,
    x: data.x,
    y: data.y,
    rx: data.x,
    ry: data.y,
    hp: data.hp,
    hpMax: data.hpMax,
    sp: data.sp,
    r: data.r,
    dmg: data.dmg,
    col: data.col,
    cd: data.cd || 0,
    jitter: data.jitter || 0,
    fromWave: data.fromWave || state.wave,
    isBoss: !!data.isBoss,
    isMinion: !!data.isMinion,
    bossPhase: data.bossPhase || 0,
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
  const enemy = makeEnemy({type,x,y,hp:base.hp*(1+tier*0.22),hpMax:base.hp*(1+tier*0.22),sp:base.sp*(1+tier*0.07),r:base.r,dmg:base.dmg*(1+tier*0.13),col:base.col,cd:0,jitter:Math.random()*Math.PI*2,fromWave:state.wave});
  state.enemies.push(enemy);
  state.waveEnemiesAlive++;
  return enemy;
}
function serializeEnemy(e){
  return { id:e.id, type:e.type, x:e.x|0, y:e.y|0, hp:+e.hp.toFixed(2), hpMax:e.hpMax, sp:e.sp, r:e.r, dmg:e.dmg, col:e.col, cd:+e.cd.toFixed(3), jitter:+e.jitter.toFixed(3), fromWave:e.fromWave, isBoss:!!e.isBoss, isMinion:!!e.isMinion, bossPhase:e.bossPhase||0 };
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
  state.upgradeChosenForWave = 0; state.upgradeOpenForWave = 0;
  state.reviveHoldTime = 0; state.reviveTarget = null; state.beingRevivedTime = 0;
  state.paused=false; state.running=true;
  state.cam.shake=0;
  state.enemySeq = 1;
  lastEnemyBroadcast = 0;
  state.god = null;
  const a = state.arena;
  state.player = makePlayer(state.hero, a.w/2, a.h/2, true);
  state.player.name = state.username || 'Operator';
  state.startedAt = performance.now();
  setScene('game');
  hideUpgrade();
  $('#hpName').textContent = HEROES[state.hero].name.toUpperCase();
  $('#pillRoom').textContent = isMultiMode() ? `ROOM ${state.roomCode}` : (isGodMode() ? '⚡ GOD MODE' : 'SOLO RUN');
  $('#pillAlive').textContent = '';
  if(isGodMode()){
    refreshZoom();   // wider FOV in God Mode (mobile)
    GOD.start();
  } else {
    refreshZoom();
    startWavePrep(1);
  }
}

function endGame(victory=false){
  state.running=false; setScene('end');
  $('#endTitle').textContent = victory ? (isGodMode() ? 'YOU SLEW THE LAST GOD' : 'Victory') : 'You Died';
  $('#endScore').textContent = state.score|0;
  const t=state.time|0;
  const phaseLabel = isGodMode() ? `Reached Phase ${state.god ? state.god.phase : 1}/10` : `Wave ${state.wave}`;
  $('#endStats').innerHTML = `Survived ${Math.floor(t/60)}m ${t%60}s · ${state.kills} kills · ${phaseLabel}`;
  hideBossBar();
}

// ---------- Wave logic (classic) ----------
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
  state.upgradeChosenForWave = 0;
  state.upgradeOpenForWave = 0;
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
  state.wavePhase = 'upgrade';
  showWaveBanner(`WAVE ${state.wave} CLEARED`, 'CHOOSE UPGRADE', 1800);
  showUpgradePicker();
}

let lastT = performance.now();
function loop(now){
  const dt = Math.min(0.05, (now-lastT)/1000); lastT=now;
  if(state.scene==='game' && state.running && !state.paused) update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function update(dt){
  state.time += dt;
  const stage = Math.min(5, Math.floor(state.wave/2));
  if(stage>state.fracture && !isGodMode()){ state.fracture=stage; toast(`FRACTURE STAGE ${stage}`, 1600); shake(6); }

  const waveAuthority = canAuthorEnemies();

  if(isGodMode()){
    GOD.update(dt, waveAuthority);
  } else if(waveAuthority){
    if(state.wavePhase === 'prep'){
      state.waveTimer -= dt;
      const remaining = Math.ceil(state.waveTimer);
      updateWaveCountdown(remaining);
      if(state.waveTimer <= 0) startWaveActive();
    } else if(state.wavePhase === 'active'){
      if(state.waveToSpawn > 0){
        state.waveSpawnTimer -= dt;
        if(state.waveSpawnTimer <= 0){
          state.waveSpawnTimer = WAVE_SPAWN_INTERVAL(state.wave);
          spawnEnemy();
          state.waveToSpawn--;
        }
      } else if(state.waveEnemiesAlive <= 0){
        endWave();
      }
    }
  } else if(state.wavePhase === 'prep'){
    updateWaveCountdown(Math.max(0, Math.ceil(state.waveTimer)));
  }

  updatePlayer(state.player, dt, true);
  if(waveAuthority){
    updateEnemies(dt);
  } else {
    interpolateEnemies(dt);
    updateEnemyContacts(dt);
  }
  updateBullets(dt); updateFx(dt);
  if(isGodMode()) updatePickups(dt);

  const viewW = W / ZOOM, viewH = H / ZOOM;
  const tx = Math.max(0, Math.min(state.arena.w - viewW, state.player.x - viewW / 2));
  const ty = Math.max(0, Math.min(state.arena.h - viewH, state.player.y - viewH / 2));
  state.cam.x += (tx-state.cam.x)*0.22; state.cam.y += (ty-state.cam.y)*0.22;
  state.cam.x = Math.max(0, Math.min(Math.max(0, state.arena.w - viewW), state.cam.x));
  state.cam.y = Math.max(0, Math.min(Math.max(0, state.arena.h - viewH), state.cam.y));
  state.cam.shake *= 0.85;

  state.score = Math.floor(state.time*10 + state.kills*25);

  const p = state.player;
  $('#hpVal').textContent = `${Math.max(0,Math.ceil(p.hp))}${p.shield>0?'+'+Math.ceil(p.shield):''}/${Math.ceil(p.hpMax)}`;
  $('#hpBar').style.width = (Math.max(0,p.hp)/p.hpMax*100)+'%';
  const mins=Math.floor(state.time/60), secs=Math.floor(state.time%60);
  $('#pillTime').textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  $('#pillScore').textContent = `SCORE ${state.score}`;
  $('#pillKills').textContent = `KILLS ${state.kills}`;
  if(isGodMode() && state.god){
    $('#pillFract').textContent = `PHASE ${state.god.phase}/10`;
  } else {
    $('#pillFract').textContent = `WAVE ${state.wave}`;
  }
  $('#cdDash').className='k'+(p.dashCd<=0?' ready':''); $('#cdDash').textContent = p.dashCd<=0?'DASH':'DASH '+p.dashCd.toFixed(1);
  $('#cdAtk').className ='k'+(p.atkCd<=0?' ready':'');  $('#cdAtk').textContent  = p.atkCd<=0?'LMB':'LMB '+p.atkCd.toFixed(1);
  $('#cdAbi').className ='k'+(p.abiCd<=0?' ready':'');  $('#cdAbi').textContent  = p.abiCd<=0?'Q':'Q '+p.abiCd.toFixed(1);
  updateTouchCooldownUI(p);

  if(isMultiMode()){
    interpolateOthers(dt);
    $('#pillAlive').textContent = `ALIVE ${1 + state.others.size}`;
    broadcastTick(dt);
    if(state.isHost) broadcastEnemyState(dt);
  }

  if(p.hp<=0 && p.alive){
    p.alive=false; particles(p.x,p.y,'#ff3d6a',40,260,0.9,3); shake(14);
    if(isMultiMode()){
      p.downed = true; p.hp = 0; p.vx = 0; p.vy = 0;
      toast('YOU ARE DOWN — wait for a teammate to revive (E)', 2400);
      try{ broadcastTick(1); }catch(e){}
      setTimeout(()=>{
        const anyAliveOther = [...state.others.values()].some(o => o && o.alive !== false && !o.downed);
        if(!anyAliveOther) endGame(false);
      }, 600);
    } else {
      setTimeout(()=>endGame(false), 400);
    }
  }
  if(isMultiMode()){ updateReviveInteraction(state.player, dt); }
}

function updatePlayer(p, dt, isLocal){
  const h = HEROES[p.heroId];
  if(p.downed){ p.vx = 0; p.vy = 0; return; }
  let mx = touch.active ? touch.mx : ((keys['d']?1:0)-(keys['a']?1:0));
  let my = touch.active ? touch.my : ((keys['s']?1:0)-(keys['w']?1:0));
  if(!isLocal){ mx=0; my=0; }
  const len=Math.hypot(mx,my)||1; mx/=len; my/=len;
  if(state.fracture>=3 && !isGodMode()){ const phase=state.time*0.6; mx+=Math.cos(phase)*0.08*state.fracture; my+=Math.sin(phase*1.3)*0.08*state.fracture; }
  // time_freeze_pulse skill applies a 50% slow until p.timeFreezeUntil expires.
  const tfSlow = (p.timeFreezeUntil && state.time < p.timeFreezeUntil) ? 0.5 : 1.0;
  const speed = h.speed*p.mods.speed*(p.dashing>0?2.6:1)*((state.fracture>=4 && !isGodMode())?(1+Math.sin(state.time*2)*0.15):1) * tfSlow;
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
  if(p.bossSkill){ p.bossSkill.cd = Math.max(0, p.bossSkill.cd - dt); }
  if(isLocal && (keys[' ']||touch.dashEdge) && p.dashCd<=0){ p.dashCd=2*p.mods.cdr; p.dashing=0.18; SFX.dash(); particles(p.x,p.y,h.color,16,220,0.4,2); queueAction({t:'dash'}); }
  touch.dashEdge=false;
  if(isLocal && (mouse.down||touch.attack) && p.atkCd<=0) doAttack(p);
  if(isLocal && (keys['q']||touch.abiEdge) && p.abiCd<=0) doAbility(p);
  touch.abiEdge=false;
  if(isLocal && (keys['f']||touch.bossEdge) && p.bossSkill && p.bossSkill.cd<=0) castPlayerBossSkill(p);
  touch.bossEdge=false;
  if(p.mods.regen>0) p.hp=Math.min(p.hpMax, p.hp+p.mods.regen*dt);
  if(p.mods.shieldMax>0) p.shield=Math.min(p.mods.shieldMax, p.shield+6*dt);
  if(p.mods.aura>0 && canAuthorEnemies()){ for(const e of state.enemies){ const dx=e.x-p.x,dy=e.y-p.y,d2=dx*dx+dy*dy; if(d2<130*130){ e.hp-=p.mods.aura*dt; if(Math.random()<0.2) particles(e.x,e.y,'#ff8a3d',1,40,0.3,2); } } }
}

function doAttack(p){
  const h=HEROES[p.heroId]; p.atkCd=h.atkCd/p.mods.atkSpd; SFX.fire(p.heroId);
  const dmg=h.dmg*p.mods.dmg, range=h.range*p.mods.range, ang=p.angle;
  const authoritative = canAuthorEnemies();
  queueAction({t:'atk', a:+ang.toFixed(2)});
  if(p.heroId==='james'){
    let hit=0;
    if(authoritative){ for(const e of state.enemies){ const dx=e.x-p.x,dy=e.y-p.y,d=Math.hypot(dx,dy); if(d<range+(e.r||0)){ const a=Math.atan2(dy,dx); let da=Math.atan2(Math.sin(a-ang),Math.cos(a-ang)); if(Math.abs(da)<1.0){ damageEnemy(e,dmg,p); hit++; } } } }
    for(let i=0;i<10;i++){ const t=i/10, a=ang-1+t*2; state.fx.push({x:p.x+Math.cos(a)*range*0.7,y:p.y+Math.sin(a)*range*0.7,vx:0,vy:0,life:0.18,life0:0.18,color:h.color,r:4}); }
    if(hit>0) shake(3);
  } else if(p.heroId==='jeff'){
    let hit=0;
    if(authoritative){ for(const e of state.enemies){ const dx=e.x-p.x,dy=e.y-p.y,d=Math.hypot(dx,dy); if(d<range+(e.r||0)){ const a=Math.atan2(dy,dx); let da=Math.atan2(Math.sin(a-ang),Math.cos(a-ang)); if(Math.abs(da)<0.7){ damageEnemy(e,dmg,p); hit++; } } } }
    for(let i=0;i<6;i++) state.fx.push({x:p.x+Math.cos(ang)*i*8,y:p.y+Math.sin(ang)*i*8,vx:0,vy:0,life:0.15,life0:0.15,color:h.color,r:3});
    if(hit>0) shake(2);
  } else {
    const speed = p.heroId==='joross'?720:(p.heroId==='jake'?520:600);
    const radius = p.heroId==='jake'?9:(p.heroId==='jeb'?7:5);
    spawnBullet({x:p.x+Math.cos(ang)*18,y:p.y+Math.sin(ang)*18,vx:Math.cos(ang)*speed,vy:Math.sin(ang)*speed,dmg:authoritative?dmg:0,owner:p.id,color:h.color,radius,life:range/speed*1.05,piercing:p.heroId==='jake'?1:0,heal:authoritative&&p.heroId==='jeb'?dmg*0.4:0,ghost:!authoritative});
  }
}

function doAbility(p){
  const h=HEROES[p.heroId]; p.abiCd=h.abiCd*p.mods.cdr; SFX.ability(p.heroId);
  const authoritative = canAuthorEnemies();
  queueAction({t:'abi', a:+p.angle.toFixed(2)});
  if(p.heroId==='james'){ if(authoritative){ for(const e of state.enemies){ if(Math.hypot(e.x-p.x,e.y-p.y)<140+(e.r||0)) damageEnemy(e,h.dmg*1.4*p.mods.dmg,p); } } particles(p.x,p.y,h.color,40,300,0.6,3); shake(8); }
  else if(p.heroId==='jake'){ const ring=24; for(let i=0;i<ring;i++){ const a=(i/ring)*Math.PI*2; spawnBullet({x:p.x,y:p.y,vx:Math.cos(a)*420,vy:Math.sin(a)*420,dmg:authoritative?h.dmg*1.2*p.mods.dmg:0,owner:p.id,color:h.color,radius:8,life:0.9,piercing:2,ghost:!authoritative}); } particles(p.x,p.y,h.color,40,260,0.7,3); shake(6); }
  else if(p.heroId==='joross'){ const orig=p.mods.atkSpd; p.mods.atkSpd*=3; toast('SUPPRESS!'); setTimeout(()=>{p.mods.atkSpd=orig;},3000); }
  else if(p.heroId==='jeb'){ p.hp=Math.min(p.hpMax,p.hp+h.hp*0.35); particles(p.x,p.y,'#3dffb0',60,220,0.9,3); state.fx.push({x:p.x,y:p.y,vx:0,vy:0,life:4,life0:4,color:'#3dffb0',r:160,ring:true,heal:true,owner:p.id}); }
  else if(p.heroId==='jeff'){ const dx=Math.cos(p.angle)*180, dy=Math.sin(p.angle)*180; if(authoritative){ for(const e of state.enemies){ const ax=e.x-p.x,ay=e.y-p.y; const t=Math.max(0,Math.min(1,(ax*dx+ay*dy)/(dx*dx+dy*dy))); const px=p.x+dx*t, py=p.y+dy*t; if(Math.hypot(e.x-px,e.y-py)<40+(e.r||0)) damageEnemy(e,h.dmg*1.8*p.mods.dmg,p); } } particles(p.x,p.y,h.color,18,260,0.4,3); p.x+=dx; p.y+=dy; p.x=Math.max(20,Math.min(state.arena.w-20,p.x)); p.y=Math.max(20,Math.min(state.arena.h-20,p.y)); particles(p.x,p.y,h.color,18,260,0.4,3); shake(8); }
}

// ---------- Player boss-skill cast (low-version of acquired boss skill) ----------
// Triggered by F (desktop) or the SKILL touch button (mobile) once the player
// has collected a boss-skill drop. All variants are deliberately weaker than
// the boss's own version: smaller AoE, fewer projectiles, no telegraphed
// double-fire, etc. Damage scales lightly with the player's existing dmg mod.
function castPlayerBossSkill(p){
  const bs = p.bossSkill; if(!bs || bs.cd > 0) return;
  const authoritative = canAuthorEnemies();
  const ang = p.angle;
  const col = bs.color || '#ffd166';
  const dm  = (p.mods && p.mods.dmg) ? p.mods.dmg : 1;
  const dealAt = (x,y,r,dmg) => {
    if(!authoritative) return;
    for(const e of state.enemies){
      if(e.dead || e.invincible) continue;
      if(Math.hypot(e.x-x, e.y-y) < r + (e.r||0)) damageEnemy(e, dmg, p);
    }
  };
  switch(bs.id){
    case 'prismatic_burst': {
      for(let layer=0; layer<3; layer++){
        setTimeout(()=>{
          for(let i=0;i<8;i++){
            const a=(i/8)*Math.PI*2 + layer*0.2;
            spawnBullet({x:p.x,y:p.y,vx:Math.cos(a)*340,vy:Math.sin(a)*340,dmg:authoritative?22*dm:0,owner:p.id,color:col,radius:6,life:0.7,piercing:1,ghost:!authoritative});
          }
        }, layer*120);
      }
      break;
    }
    case 'dash_strike': {
      const dx=Math.cos(ang)*180, dy=Math.sin(ang)*180;
      p.x+=dx; p.y+=dy;
      p.x=Math.max(20,Math.min(state.arena.w-20,p.x));
      p.y=Math.max(20,Math.min(state.arena.h-20,p.y));
      dealAt(p.x, p.y, 80, 60*dm);
      state.fx.push({ring:true,x:p.x,y:p.y,color:col,life:0.5,life0:0.5,r:0,_maxR:90});
      shake(8);
      break;
    }
    case 'time_freeze_pulse': {
      for(let i=0;i<12;i++){
        const a=(i/12)*Math.PI*2;
        spawnBullet({x:p.x,y:p.y,vx:Math.cos(a)*300,vy:Math.sin(a)*300,dmg:authoritative?16*dm:0,owner:p.id,color:col,radius:7,life:0.9,piercing:0,ghost:!authoritative});
      }
      if(authoritative){
        for(const e of state.enemies){ if(Math.hypot(e.x-p.x,e.y-p.y)<170){ e.sp = Math.max(20, e.sp*0.5); setTimeout(()=>{ if(e && !e.dead) e.sp = e.sp*2; }, 1500); } }
      }
      state.fx.push({ring:true,x:p.x,y:p.y,color:col,life:0.6,life0:0.6,r:0,_maxR:170});
      break;
    }
    case 'nova_implosion': {
      for(let i=0;i<10;i++){
        const a=(i/10)*Math.PI*2;
        spawnBullet({x:p.x,y:p.y,vx:Math.cos(a)*380,vy:Math.sin(a)*380,dmg:authoritative?20*dm:0,owner:p.id,color:col,radius:8,life:0.8,piercing:1,ghost:!authoritative});
      }
      state.fx.push({ring:true,x:p.x,y:p.y,color:col,life:0.5,life0:0.5,r:0,_maxR:200});
      shake(6);
      break;
    }
    case 'shadow_clones_assault': {
      for(let i=-1;i<=1;i++){
        const a=ang + i*0.25;
        spawnBullet({x:p.x,y:p.y,vx:Math.cos(a)*640,vy:Math.sin(a)*640,dmg:authoritative?34*dm:0,owner:p.id,color:col,radius:9,life:1.0,piercing:3,ghost:!authoritative});
      }
      break;
    }
    case 'chain_lightning': {
      let last = {x:p.x, y:p.y};
      const hit = new Set();
      let chains = 3;
      while(chains > 0){
        let best=null, bd=380;
        for(const e of state.enemies){
          if(hit.has(e) || e.dead || e.invincible) continue;
          const d=Math.hypot(e.x-last.x, e.y-last.y);
          if(d<bd){ bd=d; best=e; }
        }
        if(!best) break;
        if(authoritative) damageEnemy(best, 38*dm, p);
        hit.add(best);
        state.fx.push({warn:true, ax:last.x, ay:last.y, bx:best.x, by:best.y, color:col, life:0.3, life0:0.3, beamWidth:10});
        last = {x:best.x, y:best.y};
        chains--;
      }
      break;
    }
    case 'void_zone': {
      const zx = p.x + Math.cos(ang)*180, zy = p.y + Math.sin(ang)*180;
      const dur = 3.0;
      state.fx.push({ring:true,x:zx,y:zy,color:col,life:dur,life0:dur,r:120,_maxR:120});
      state.fx.push({_enemyZone:true, x:zx, y:zy, life:dur, life0:dur, color:col, r:120, dps: 36*dm});
      particles(zx, zy, col, 30, 220, 0.7, 3);
      break;
    }
    case 'gravity_well': {
      for(let i=0;i<2;i++){
        const sx = p.x + Math.cos(ang + (i?0.6:-0.6))*200;
        const sy = p.y + Math.sin(ang + (i?0.6:-0.6))*200;
        state.fx.push({ring:true,x:sx,y:sy,color:col,life:0.5,life0:0.5,r:80,_maxR:80});
        setTimeout(()=>{
          dealAt(sx, sy, 90, 50*dm);
          state.fx.push({ring:true,x:sx,y:sy,color:col,life:0.4,life0:0.4,r:0,_maxR:120});
          particles(sx,sy,col,30,260,0.6,3);
          shake(5);
        }, 500);
      }
      break;
    }
    case 'meteor_rain': {
      for(let i=0;i<3;i++){
        const tx = p.x + Math.cos(ang)*120 + (Math.random()*220-110);
        const ty = p.y + Math.sin(ang)*120 + (Math.random()*220-110);
        const delay = 350 + i*180;
        state.fx.push({ring:true,x:tx,y:ty,color:col,life:delay/1000,life0:delay/1000,r:60,_maxR:60});
        setTimeout(()=>{
          dealAt(tx, ty, 75, 55*dm);
          state.fx.push({ring:true,x:tx,y:ty,color:col,life:0.4,life0:0.4,r:0,_maxR:90});
          particles(tx,ty,col,30,260,0.6,3); shake(4);
        }, delay);
      }
      break;
    }
    case 'reality_break': {
      for(let i=0;i<12;i++){
        const a=(i/12)*Math.PI*2;
        spawnBullet({x:p.x,y:p.y,vx:Math.cos(a)*360,vy:Math.sin(a)*360,dmg:authoritative?20*dm:0,owner:p.id,color:col,radius:7,life:0.8,piercing:1,ghost:!authoritative});
      }
      for(let i=0;i<3;i++){
        const tx = p.x + (Math.random()*280-140);
        const ty = p.y + (Math.random()*280-140);
        const delay = 350 + i*180;
        state.fx.push({ring:true,x:tx,y:ty,color:col,life:delay/1000,life0:delay/1000,r:60,_maxR:60});
        setTimeout(()=>{
          dealAt(tx, ty, 75, 50*dm);
          state.fx.push({ring:true,x:tx,y:ty,color:col,life:0.4,life0:0.4,r:0,_maxR:90});
        }, delay);
      }
      shake(8);
      break;
    }
    default: {
      for(let i=0;i<10;i++){
        const a=(i/10)*Math.PI*2;
        spawnBullet({x:p.x,y:p.y,vx:Math.cos(a)*350,vy:Math.sin(a)*350,dmg:authoritative?20*dm:0,owner:p.id,color:col,radius:6,life:0.7,piercing:1,ghost:!authoritative});
      }
    }
  }
  bs.cd = bs.cdMax * (p.mods && p.mods.cdr ? p.mods.cdr : 1);
  try{ SFX.ability(p.heroId); }catch(e){}
  particles(p.x, p.y, col, 28, 260, 0.5, 3);
}

function damageEnemy(e,dmg,p){
  if(!canAuthorEnemies() || e.hp<=0) return;
  // Bosses become invincible during the evolution cinematic.
  if(e.invincible) { particles(e.x, e.y, '#ffffff', 2, 80, 0.2, 2); return; }
  e.hp-=dmg;
  if(p&&p.heroId) SFX.hit();
  if(p&&p.mods&&p.mods.lifesteal>0) p.hp=Math.min(p.hpMax,p.hp+dmg*p.mods.lifesteal);
  particles(e.x,e.y,e.col,4,140,0.3,2);
  if(e.hp<=0){
    // Boss "death" → enter cinematic evolving phase, do NOT kill yet.
    if(e.isBoss && isGodMode()){
      e.hp = 1;          // keep visible/non-dead
      e.invincible = true;
      GOD.onBossDefeated(e);
      return;
    }
    state.kills++;
    if(p) p.kills++;
    particles(e.x,e.y,e.col,e.isBoss?80:18,e.isBoss?420:240,e.isBoss?1.4:0.7,e.isBoss?5:3);
    shake(e.isBoss?16:2);
    e.dead=true;
    if(state.waveEnemiesAlive>0 && !e.isBoss) state.waveEnemiesAlive--;
    if(e.isBoss && isGodMode()){ GOD.onBossDefeated(e); }
  }
}

function updateEnemies(dt){
  const p=state.player;
  const players = [p, ...state.others.values()].filter(cand => cand && cand.alive !== false);
  for(const e of state.enemies){
    let target=p;
    if(isMultiMode()){
      let best=p,bd=Infinity;
      for(const cand of players){ const d2=(cand.x-e.x)**2+(cand.y-e.y)**2; if(d2<bd){bd=d2;best=cand;} }
      target=best||p;
    }
    const dx=target.x-e.x, dy=target.y-e.y, d=Math.hypot(dx,dy)||1;
    let sp=e.sp*((state.fracture>=2 && !isGodMode())?1+state.fracture*0.06:1);
    if(p.mods.slow>0 && Math.hypot(p.x-e.x,p.y-e.y)<160) sp*=(1-p.mods.slow);
    if(e.isBoss){
      // Stop moving + stop melee contact damage during evolution / dodge frames.
      if(e.evolving || e.invincible){
        // float gently in place
      } else if(e.bossPhase === 11){
        // Aggressive ninja chase: closes distance fast & weaves side-to-side
        // so it's hard to line up. Speed already very high in spawnBoss().
        const tt = (e._weaveT = (e._weaveT||0) + dt);
        const closeDist = 70;
        if(d > closeDist){
          e.x += dx/d * sp * 1.0 * dt;
          e.y += dy/d * sp * 1.0 * dt;
        }
        // Perpendicular weave so it doesn't sit still when in-range
        const px = -dy/d, py = dx/d;
        const wv = Math.sin(tt * 5);
        e.x += px * wv * sp * 0.45 * dt;
        e.y += py * wv * sp * 0.45 * dt;
      } else {
        if(d>200) { e.x+=dx/d*sp*0.4*dt; e.y+=dy/d*sp*0.4*dt; }
      }
      if(isGodMode()) GOD.bossAITick(e, dt, target);
    } else if(e.type==='phantom'){ e.jitter+=dt*4; const px=-dy/d, py=dx/d; e.x+=(dx/d*sp+px*Math.sin(e.jitter)*sp*0.6)*dt; e.y+=(dy/d*sp+py*Math.sin(e.jitter)*sp*0.6)*dt; }
    else { e.x+=dx/d*sp*dt; e.y+=dy/d*sp*dt; }
    e.cd=Math.max(0,e.cd-dt);
    const localDist = Math.hypot(p.x-e.x,p.y-e.y);
    const touchingAny = players.some(cand => Math.hypot(cand.x-e.x,cand.y-e.y) < e.r + 18);
    if(touchingAny && e.cd<=0 && !(e.isBoss && (e.evolving || e.invincible))){
      if(localDist<e.r+18 && p.alive && !p.downed){ const dmgIn = e.isBoss ? e.dmg * BOSS_CONTACT_MUL : e.dmg; let rem=dmgIn; if(p.shield>0){ const a=Math.min(p.shield,rem); p.shield-=a; rem-=a; } p.hp-=rem; SFX.hurt(); shake(4); particles(p.x,p.y,'#ff3d6a',8,180,0.4,2); }
      e.cd = e.isBoss ? 0.85 : 0.6;
    }
  }
  state.enemies = state.enemies.filter(e=>!e.dead);
}

function interpolateEnemies(dt){
  const k = 1 - Math.exp(-dt * 20);
  for(const e of state.enemies){
    if(e.rx === undefined){ e.rx = e.x; e.ry = e.y; }
    e.x += (e.rx - e.x) * k;
    e.y += (e.ry - e.y) * k;
  }
}

function updateEnemyContacts(dt){
  const p=state.player;
  for(const e of state.enemies){
    e.cd=Math.max(0,e.cd-dt);
    if(Math.hypot(p.x-e.x,p.y-e.y)<e.r+18 && e.cd<=0 && p.alive && !p.downed && !(e.isBoss && (e.evolving || e.invincible))){ const dmgIn = e.isBoss ? e.dmg * BOSS_CONTACT_MUL : e.dmg; let rem=dmgIn; if(p.shield>0){ const a=Math.min(p.shield,rem); p.shield-=a; rem-=a; } p.hp-=rem; SFX.hurt(); e.cd = e.isBoss ? 0.85 : 0.6; shake(4); particles(p.x,p.y,'#ff3d6a',8,180,0.4,2); }
  }
}

function updateBullets(dt){
  for(const b of state.bullets){
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
    b.trail.push({x:b.x,y:b.y}); if(b.trail.length>8) b.trail.shift();
    // Boss-owned bullets ALWAYS damage the local player (treated as hostile environment)
    if(b.hostile){
      const p = state.player;
      if(p && p.alive && !p.downed){
        if(Math.hypot(p.x-b.x,p.y-b.y) < (p.hp ? 16 : 0) + b.radius){
          const dmgIn = (b.dmg||0) * BOSS_DMG_MUL; let rem=dmgIn;
          if(p.shield>0){ const a=Math.min(p.shield,rem); p.shield-=a; rem-=a; }
          p.hp -= rem; SFX.hurt(); shake(4); particles(p.x,p.y,'#ff3d6a',8,180,0.4,2);
          if(!b.piercing){ b.dead=true; continue; } else b.piercing--;
        }
      }
      continue;
    }
    if(b.ghost || !canAuthorEnemies()) continue;
    for(const e of state.enemies){ if(Math.hypot(e.x-b.x,e.y-b.y)<e.r+b.radius){ damageEnemy(e,b.dmg,state.player); if(b.heal && state.player) state.player.hp=Math.min(state.player.hpMax, state.player.hp+b.heal); if(b.piercing>0){ b.piercing--; } else { b.dead=true; break; } } }
  }
  state.bullets = state.bullets.filter(b=>!b.dead && b.life>0);
}

function updateFx(dt){
  for(const f of state.fx){
    // If this fx is anchored to a boss that has died/disappeared, kill it now.
    // This stops void zones, gravity wells, _pull and rings from continuing
    // to damage / drag the player around an empty arena (the wave-8 bug).
    if(f._bossRef && (!f._bossRef.hp || f._bossRef.hp <= 0 || f._bossRef.dead)){
      f.life = 0;
      continue;
    }
    if(f._bossRef){
      f.x = f._bossRef.x;
      f.y = f._bossRef.y;
    }
    f.life-=dt;
    if(!f.ring && !f.beam && !f.warn && !f.zone){ f.x+=f.vx*dt; f.y+=f.vy*dt; f.vx*=0.92; f.vy*=0.92; }
    if(f.heal && state.player){ const d=Math.hypot(state.player.x-f.x, state.player.y-f.y); if(d<f.r) state.player.hp=Math.min(state.player.hpMax, state.player.hp+18*dt); }
    // Damaging zones (boss void zones, gravity-well core)
    if(f.zone && state.player){
      const p=state.player;
      if(p.alive && !p.downed && Math.hypot(p.x-f.x, p.y-f.y) < f.r){
        const dmgIn = (f.dps||0)*dt * BOSS_DMG_MUL;
        let rem = dmgIn;
        if(p.shield>0){ const a=Math.min(p.shield,rem); p.shield-=a; rem-=a; }
        p.hp -= rem;
      }
    }
    // Player-owned boss-skill zones (from collected drops) — damage enemies, not the player.
    if(f._enemyZone){
      for(const e of state.enemies){
        if(e.dead || e.invincible) continue;
        if(Math.hypot(e.x-f.x, e.y-f.y) < f.r){
          damageEnemy(e, (f.dps||0)*dt, state.player);
        }
      }
    }
    if(f._shock){
      const t = 1 - Math.max(0, f.life / f.life0);
      const r = f._maxR * t;
      const p = state.player;
      if(p && p.alive && !p.downed && !f._hit){
        const d = Math.hypot(p.x-f.x, p.y-f.y);
        if(d > r-30 && d < r+30){
          f._hit = true;
          const dmgIn = (f.dmg||20) * BOSS_DMG_MUL; let rem=dmgIn;
          if(p.shield>0){ const a2=Math.min(p.shield,rem); p.shield-=a2; rem-=a2; }
          p.hp -= rem; SFX.hurt(); shake(7);
        }
      }
    }
    if(f._pull && state.player){
      const p = state.player;
      if(p.alive && !p.downed){
        const dx = f.x-p.x, dy=f.y-p.y, d=Math.hypot(dx,dy)||1;
        if(d < f.r){
          const force = 220 * (1 - d/f.r);
          p.x += (dx/d)*force*dt;
          p.y += (dy/d)*force*dt;
          p.x = Math.max(20,Math.min(state.arena.w-20,p.x));
          p.y = Math.max(20,Math.min(state.arena.h-20,p.y));
        }
      }
    }
    // Beam strike: when warning ends and beam fires this frame, deal damage along the line
    if(f.beam && !f.beamFired && f.life <= f.beamFireAt){
      f.beamFired = true;
      const p = state.player;
      if(p && p.alive && !p.downed){
        const dx=f.bx-f.ax, dy=f.by-f.ay;
        const t = Math.max(0,Math.min(1, ((p.x-f.ax)*dx+(p.y-f.ay)*dy)/(dx*dx+dy*dy)));
        const px = f.ax+dx*t, py = f.ay+dy*t;
        if(Math.hypot(p.x-px, p.y-py) < (f.beamWidth||30)){
          const dmgIn = (f.dmg||30) * BOSS_DMG_MUL; let rem=dmgIn;
          if(p.shield>0){ const a=Math.min(p.shield,rem); p.shield-=a; rem-=a; }
          p.hp -= rem; SFX.hurt(); shake(8); particles(p.x,p.y,'#ff3d6a',16,260,0.6,3);
        }
      }
      shake(6);
    }
  }
  state.fx = state.fx.filter(f=>f.life>0);
}

// ---------- Pickups (God Mode) ----------
function updatePickups(dt){
  const p = state.player;
  if(!p) return;
  for(const pk of state.pickups){
    pk.t += dt;
    // Boss-skill drops have a bigger collection radius (more dramatic prize).
    const collectR = pk.bossSkill ? PICKUP_RADIUS + 10 : PICKUP_RADIUS;
    if(p.alive && !p.downed && Math.hypot(p.x-pk.x, p.y-pk.y) < collectR){
      // collect!
      pk.dead = true;
      if(pk.bossSkill){
        // Boss-skill drop: equip on the local player only. Other players
        // can't claim it because it's removed from state.pickups now.
        const info = PLAYER_BOSS_SKILL_INFO[pk.skillId] || {name:pk.skillName||'Boss Skill', desc:'A fragment of the fallen boss.', cdMax:8};
        p.bossSkill = {
          id: pk.skillId,
          name: info.name,
          color: pk.color || '#ffd166',
          phase: pk.phase || 0,
          cd: 0,
          cdMax: info.cdMax,
        };
        SFX.collect();
        showPickupBanner('★ ' + info.name + ' ACQUIRED', info.desc + ' [F / SKILL button]');
        particles(pk.x, pk.y, pk.color || '#ffd166', 70, 380, 1.1, 4);
        shake(10);
      } else {
        const upg = UPGRADES.find(u=>u.id===pk.id) || UPGRADES[0];
        const rarity = getRarity(pk.rarity);
        try {
          if(NO_STACK_UPGRADES.has(upg.id)){
            // Run apply once, then award a flat rarity bonus on top.
            upg.apply(p);
            const bonus = rarity.stacks - 1;
            if(bonus > 0){
              if(upg.id === 'heal' || upg.id === 'phoenix'){
                p.hpMax += 10 * bonus; p.hp = p.hpMax;
              } else if(upg.id === 'aegis'){
                p.shield = (p.shield||0) + 30 * bonus;
                if(p.mods.shieldMax < p.shield) p.mods.shieldMax = p.shield;
              } else if(upg.id === 'ironwill' || upg.id === 'hpmax'){
                p.hpMax += 25 * bonus; p.hp = Math.min(p.hpMax, p.hp + 25 * bonus);
              } else if(upg.id === 'glasscannon'){
                // legendary glass cannon: extra +30% dmg per tier, no extra HP loss
                p.mods.dmg *= (1 + 0.30 * bonus);
              }
            }
          } else {
            for(let s=0; s<rarity.stacks; s++) upg.apply(p);
          }
        } catch(e){}
        SFX.collect();
        const namePrefix = rarity.banner ? `${rarity.banner} — ` : '';
        showPickupBanner(namePrefix + upg.name, upg.desc);
        const pColor = rarity.id === 'common' ? (upg.color || '#ffd166') : rarity.color;
        const pN = rarity.id === 'common' ? 30 : (rarity.id === 'rare' ? 50 : (rarity.id === 'epic' ? 80 : 130));
        particles(pk.x, pk.y, pColor, pN, 320, 0.9, 3);
        if(rarity.id !== 'common'){
          state.fx.push({ring:true, x:pk.x, y:pk.y, color:rarity.color, life:0.5, life0:0.5, r:0, _maxR: rarity.id === 'legendary' ? 180 : 110});
          if(rarity.id === 'legendary') shake(8); else if(rarity.id === 'epic') shake(4);
        }
      }
    }
  }
  state.pickups = state.pickups.filter(pk=>!pk.dead);
}
function showPickupBanner(name, desc){
  const el = document.getElementById('pickupToast');
  if(!el) return;
  document.getElementById('pickupName').textContent = name;
  document.getElementById('pickupDesc').textContent = desc;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(showPickupBanner._t);
  showPickupBanner._t = setTimeout(()=>el.classList.remove('show'), 1400);
}

// ==============================================================
// GOD MODE — boss gauntlet controller
// ==============================================================
const GOD = (() => {
  // Track every setTimeout queued by skills so we can cancel them when the
  // boss dies / phase ends. Without this, lingering callbacks (dash_strike,
  // teleport_strike, meteor_rain, laser_sweep, ground_spikes) keep firing
  // after the boss is gone — that's the wave-8 bug: boss "centers" because
  // its position got nuked by `_pull`, then dies, but ground hazards & pull
  // fx keep ticking on a non-existent boss while the player has no anchor
  // and no contact damage to trigger.
  const _pendingTimeouts = new Set();
  function _schedule(fn, ms){
    const id = setTimeout(()=>{ _pendingTimeouts.delete(id); try{ fn(); }catch(e){} }, ms);
    _pendingTimeouts.add(id);
    return id;
  }
  function _clearAllScheduled(){
    for(const id of _pendingTimeouts) clearTimeout(id);
    _pendingTimeouts.clear();
  }
  function _purgeHostileFx(){
    // Remove every fx that can damage / move the player after a boss dies.
    state.fx = state.fx.filter(f => !(f.warn || f.beam || f.zone || f._shock || f._pull || f._flash));
    state.bullets = state.bullets.filter(b => !b.hostile);
  }

  function start(){
    state.god = {
      phase: 0,
      boss: null,
      mode: 'intro',             // 'intro' | 'fight' | 'transition' | 'evolving' | 'victory'
      timer: 0,
      pickupTimer: 4,
      skillCooldowns: {},
      skillIndex: 0,
      bossTelegraphCooldown: 0,
    };
    const a = state.arena;
    state.player.x = a.w/2; state.player.y = a.h/2;
    beginPhase(1);
  }

  function beginPhase(n){
    const phaseDef = BOSS_PHASES[n-1];
    if(!phaseDef){
      state.god.mode = 'victory';
      state.god.timer = 3;
      showGodIntro('VICTORY', 'THE LAST GOD HAS FALLEN', '★★★', '');
      SFX.stopMusic(1500);
      return;
    }
    // Always start a phase from a clean slate — kills the wave-8 lingering hazards.
    _clearAllScheduled();
    _purgeHostileFx();
    state.god.phase = n;
    state.god.mode = 'intro';
    state.god.timer = 4.2;
    state.god.skillCooldowns = {};
    state.god.skillIndex = 0;
    state.god.bossTelegraphCooldown = 1.5;
    state.god.pickupTimer = 4;
    state.god.boss = null;
    for(const e of state.enemies){ e.dead = true; }
    const totalPhases = BOSS_PHASES.length;
    const rank = n>=11 ? 'EX // OMEGA' : (n>=8 ? 'S++ BOSS' : (n>=5 ? 'S+ BOSS' : 'S BOSS'));
    showGodIntro(`PHASE ${n} / ${totalPhases}`, phaseDef.name, phaseDef.title, rank);
    SFX.bossSkill('intro_roar', 1);
    // Crossfade into this phase's theme (fade-in, previous track fades out)
    SFX.playMusic(phaseDef.music || 'god', 1500);
    shake(12);
  }

  function spawnBoss(){
    const phaseDef = BOSS_PHASES[state.god.phase-1];
    const a = state.arena;
    const playerCount = 1 + state.others.size;
    // Beefier bosses: previously 600 base × hpMul; now 700 base + extra solo handicap.
    // Combined with the doubled hpMul values above, bosses now last ~3-4× longer.
    const soloBuff = (playerCount === 1) ? 1.15 : 1.0;
    const baseHp = 700 * phaseDef.hpMul * (1 + (playerCount-1)*0.4) * soloBuff;
    // Phase 11 humanoid is much faster than the lumbering earlier phases.
    const isP11 = state.god.phase === 11;
    const sp = isP11 ? 270 : (50 + state.god.phase*4);
    const e = makeEnemy({
      type: 'boss',
      x: a.w/2, y: 120,
      hp: baseHp, hpMax: baseHp,
      sp,
      r: phaseDef.radius,
      dmg: Math.round((22 + state.god.phase*5) * BOSS_DMG_MUL),
      col: phaseDef.color,
      cd: 0,
      isBoss: true,
      bossPhase: state.god.phase,
    });
    state.enemies.push(e);
    state.god.boss = e;
    showBossBar(phaseDef.name);
    // Big slam landing fx
    particles(e.x, e.y, phaseDef.color, 80, 400, 1.0, 4);
    state.fx.push({x:e.x, y:e.y, vx:0, vy:0, life:0.9, life0:0.9, color:phaseDef.color, r: phaseDef.radius*2.5, ring:true});
    shake(18);
  }

  function update(dt, authority){
    const g = state.god; if(!g) return;
    if(g.mode === 'intro'){
      g.timer -= dt;
      if(g.timer <= 2.0 && !g.boss && authority){
        spawnBoss();
      }
      if(g.timer <= 0){
        g.mode = 'fight';
        hideGodIntro();
      }
      return;
    }
    if(g.mode === 'victory'){
      g.timer -= dt;
      if(g.timer <= 0){ endGame(true); }
      return;
    }
    if(g.mode === 'evolving'){
      // Boss is invincible & visible. Plays the "evolution" cinematic before
      // it explodes & we transition to the next phase. This is the death
      // animation the user asked for.
      g.timer -= dt;
      if(g.boss){
        // Slight upward float + heavy aura while evolving
        g.boss.evoT = (g.boss.evoT || 0) + dt;
        g.boss._evoFlash = (Math.sin(g.boss.evoT * 22) + 1) * 0.5;
        // Spawn evolving particles every ~80ms
        if(!g.boss._evoNext || performance.now() > g.boss._evoNext){
          g.boss._evoNext = performance.now() + 80;
          const pd = BOSS_PHASES[g.phase-1];
          particles(g.boss.x, g.boss.y, pd?pd.color:'#ffffff', 18, 320, 0.8, 3);
        }
        updateBossBarFill(g.boss.hp, g.boss.hpMax);
      }
      if(g.timer <= 0){
        // End of evolution: actually destroy the boss & enter transition
        if(g.boss){
          const b = g.boss;
          const pd = BOSS_PHASES[g.phase-1];
          particles(b.x, b.y, pd?pd.color:'#ffd166', 160, 560, 1.8, 6);
          shake(24);
          state.fx.push({x:b.x, y:b.y, vx:0, vy:0, life:1.2, life0:1.2, color:pd?pd.color:'#ffffff', r: b.r*4, ring:true, _maxR: b.r*4});
          b.dead = true; b.hp = 0;
        }
        _clearAllScheduled();
        _purgeHostileFx();
        hideBossBar();
        g.boss = null;
        g.mode = 'transition';
        g.timer = 2.4;
      }
      return;
    }
    if(g.mode === 'transition'){
      g.timer -= dt;
      if(g.timer <= 0){
        beginPhase(g.phase + 1);
      }
      return;
    }
    // FIGHT phase
    if(g.boss){
      updateBossBarFill(g.boss.hp, g.boss.hpMax);
    }
    if(authority){
      g.pickupTimer -= dt;
      if(g.pickupTimer <= 0){
        // Scale floor-pickup drops with player count: more players → more drops
        // per cycle AND a slightly faster cycle. Solo behavior is unchanged.
        const playerCount = 1 + state.others.size;
        const drops = PICKUP_BASE_PER_CYCLE + (playerCount - 1);
        for(let i=0;i<drops;i++) spawnPickup();
        const intervalMul = 1 / Math.max(1, Math.sqrt(playerCount));
        g.pickupTimer = PICKUP_SPAWN_INTERVAL * intervalMul + Math.random()*PICKUP_SPAWN_JITTER;
      }
    }
  }

  function bossAITick(boss, dt, target){
    if(!isGodMode() || !state.god || state.god.mode !== 'fight') return;
    if(!boss || boss.invincible || boss.evolving || boss.dead) return;
    const g = state.god;
    const phaseDef = BOSS_PHASES[g.phase-1];
    if(!phaseDef) return;
    // Tick down all skill cooldowns
    for(const k in g.skillCooldowns){ g.skillCooldowns[k] = Math.max(0, g.skillCooldowns[k]-dt); }
    g.bossTelegraphCooldown -= dt;
    if(g.bossTelegraphCooldown > 0) return;
    // Pick next skill (round-robin through this phase's skill list)
    const skillId = phaseDef.skills[g.skillIndex % phaseDef.skills.length];
    g.skillIndex++;
    castSkill(boss, skillId, target);
    // Bosses cast faster as phase progresses
    g.bossTelegraphCooldown = Math.max(1.4, 3.6 - g.phase*0.22);
  }

  function castSkill(boss, id, target){
    if(!boss || boss.hp <= 0) return;
    const phaseDef = BOSS_PHASES[state.god.phase-1];
    const col = phaseDef.color;
    SFX.bossSkill(id, 0.85);
    switch(id){
      case 'telegraph_beam': {
        // Multi-beam fan that scales aggressively with phase.
        // Phase 1: 1 wide beam.   Phase 2: 2 beams.    Phase 3: 3 beams.
        // Phase 4: 4 beams.       Phase 5: 5 beams.    Phase 6: 6 beams.
        // Phase 7: 7 beams.       Phase 8+: 8-9 beams + retarget salvo + ring of beams.
        const ph = state.god.phase;
        const beams = ph >= 10 ? 9 : ph >= 8 ? 8 : ph >= 7 ? 7 : ph >= 6 ? 6 : ph >= 5 ? 5 : ph >= 4 ? 4 : ph >= 3 ? 3 : ph >= 2 ? 2 : 1;
        const spread = beams === 1 ? 0 : (Math.PI/8) * (beams-1); // wider fan
        const baseAng = Math.atan2(target.y-boss.y, target.x-boss.x);
        const len = 1600;
        const warnLife = Math.max(0.32, 1.05 - ph*0.085);
        const beamWidth = 40 + Math.min(60, ph*6);
        const dmg = 32 + ph*6;
        for(let b=0; b<beams; b++){
          const t = beams===1 ? 0 : (b/(beams-1)) - 0.5;
          const ang = baseAng + t*spread;
          const ax = boss.x, ay = boss.y;
          const bx = boss.x + Math.cos(ang)*len, by = boss.y + Math.sin(ang)*len;
          state.fx.push({warn:true, ax,ay,bx,by, color:col, life:warnLife, life0:warnLife, beamWidth});
          const beamLife = warnLife + 0.40;
          state.fx.push({beam:true, ax,ay,bx,by, color:col, life:beamLife, life0:beamLife, beamFireAt: 0.32, beamWidth: beamWidth+8, dmg});
        }
        // Phase 7+: a second salvo that retargets the player after first volley.
        if(ph >= 7){
          _schedule(()=>{
            if(!boss || boss.dead) return;
            const p = state.player; if(!p) return;
            const ang2 = Math.atan2(p.y-boss.y, p.x-boss.x);
            const ax = boss.x, ay = boss.y;
            const bx = boss.x + Math.cos(ang2)*len, by = boss.y + Math.sin(ang2)*len;
            state.fx.push({warn:true, ax,ay,bx,by, color:col, life:0.38, life0:0.38, beamWidth: beamWidth+14});
            state.fx.push({beam:true, ax,ay,bx,by, color:col, life:0.7, life0:0.7, beamFireAt: 0.28, beamWidth: beamWidth+20, dmg: dmg+12});
          }, (warnLife+0.45)*1000);
        }
        // Phase 9+: full 360° ring of beams after the fan, almost no safe gap.
        if(ph >= 9){
          _schedule(()=>{
            if(!boss || boss.dead) return;
            const ringBeams = ph >= 10 ? 14 : 10;
            for(let i=0;i<ringBeams;i++){
              const ang = (i/ringBeams)*Math.PI*2 + Math.random()*0.05;
              const ax = boss.x, ay = boss.y;
              const bx = boss.x + Math.cos(ang)*len, by = boss.y + Math.sin(ang)*len;
              state.fx.push({warn:true, ax,ay,bx,by, color:col, life:0.45, life0:0.45, beamWidth: beamWidth-6});
              state.fx.push({beam:true, ax,ay,bx,by, color:col, life:0.8, life0:0.8, beamFireAt: 0.35, beamWidth: beamWidth, dmg: dmg-4});
            }
          }, (warnLife+1.1)*1000);
        }
        break;
      }
      case 'shockwave': {
        // Multi-pulse expanding rings; later phases add follow-up pulses you must keep dodging
        const ph = state.god.phase;
        const pulses = ph >= 9 ? 6 : ph >= 7 ? 5 : ph >= 5 ? 4 : ph >= 3 ? 3 : ph >= 2 ? 2 : 1;
        const baseR = 380 + ph*36;
        const life = Math.max(0.5, 0.9 - ph*0.04);
        const dmg = 24 + ph*5;
        const cadence = Math.max(220, 420 - ph*22);
        for(let k=0;k<pulses;k++){
          _schedule(()=>{
            if(!boss || boss.dead) return;
            const maxR = baseR + k*70;
            state.fx.push({ring:true, x:boss.x, y:boss.y, color:col, life, life0:life, r:0, _maxR:maxR});
            state.fx.push({_shock:true, x:boss.x, y:boss.y, life, life0:life, color:col, r:0, _maxR:maxR, dmg, vx:0,vy:0});
            shake(6);
          }, k*cadence);
        }
        break;
      }
      case 'bullet_spiral': {
        // More arms, faster bullets, longer barrage, and a counter-rotating second layer at higher phases
        const ph = state.god.phase;
        const arms = 4 + Math.min(10, ph*2);
        const waves = 6 + Math.min(10, ph);
        const speed = 320 + ph*22;
        const dmg = 12 + ph*3;
        const offset = Math.random()*Math.PI*2;
        const interval = Math.max(55, 120 - ph*7);
        for(let s=0; s<waves; s++){
          _schedule(()=>{
            if(!boss || boss.dead || boss.invincible) return;
            for(let a=0;a<arms;a++){
              const ang = offset + s*0.3 + (a/arms)*Math.PI*2;
              spawnHostileBullet(boss.x, boss.y, ang, speed, col, dmg);
            }
            // Counter-rotating layer for phase 5+
            if(ph >= 5){
              for(let a=0;a<arms;a++){
                const ang = -offset - s*0.35 + (a/arms)*Math.PI*2 + Math.PI/arms;
                spawnHostileBullet(boss.x, boss.y, ang, speed*0.85, col, dmg);
              }
            }
          }, s*interval);
        }
        break;
      }
      case 'homing_orbs': {
        // More orbs, bigger, faster, longer-lived seeking — relentless at high phases
        const ph = state.god.phase;
        const n = 3 + ph;
        const speed = 180 + ph*20;
        const radius = 10 + Math.min(8, Math.floor(ph/2));
        const dmg = 18 + ph*3;
        for(let i=0;i<n;i++){
          const ang = (i/n)*Math.PI*2 + Math.random()*0.4;
          state.bullets.push({
            x:boss.x, y:boss.y, vx:Math.cos(ang)*speed, vy:Math.sin(ang)*speed,
            color:col, radius, life: 6.0 + ph*0.3, hostile:true,
            dmg, trail:[], _homing:true,
          });
        }
        break;
      }
      case 'summon_minions': {
        // Bigger swarms of tougher, faster minions at high phases.
        const tier = state.god.phase;
        const n = 2 + tier;
        for(let i=0;i<n;i++){
          const ang = Math.random()*Math.PI*2, d=120;
          const x = boss.x+Math.cos(ang)*d, y = boss.y+Math.sin(ang)*d;
          const m = makeEnemy({ type:'phantom', x, y,
            hp:60*(1+tier*0.45), hpMax:60*(1+tier*0.45),
            sp:140 + tier*14, r:13 + Math.min(8, Math.floor(tier/2)),
            dmg:12+tier*3, col:col, isMinion:true });
          state.enemies.push(m);
          particles(x,y,col,16,180,0.6,3);
        }
        // Phase 7+: a second wave from the opposite ring.
        if(tier >= 7){
          _schedule(()=>{
            if(!boss || boss.dead) return;
            for(let i=0;i<n;i++){
              const ang = Math.random()*Math.PI*2, d=180;
              const x = boss.x+Math.cos(ang)*d, y = boss.y+Math.sin(ang)*d;
              const m = makeEnemy({ type:'phantom', x, y,
                hp:60*(1+tier*0.45), hpMax:60*(1+tier*0.45),
                sp:160 + tier*14, r:14, dmg:12+tier*3, col:col, isMinion:true });
              state.enemies.push(m);
              particles(x,y,col,14,180,0.5,3);
            }
          }, 700);
        }
        break;
      }
      case 'teleport_strike': {
        // Chain teleport-slash. High phases hop multiple times, faster each strike.
        const ph = state.god.phase;
        const hops = ph >= 9 ? 4 : ph >= 7 ? 3 : ph >= 5 ? 2 : 1;
        const warnLife = Math.max(0.32, 0.6 - ph*0.03);
        const dmg = 28 + ph*5;
        const radius = 100 + Math.min(40, ph*4);
        const doHop = (idx)=>{
          if(!boss || boss.dead) return;
          const p = state.player; if(!p) return;
          particles(boss.x, boss.y, col, 24, 240, 0.5, 3);
          const ang = Math.random()*Math.PI*2;
          const nx = p.x + Math.cos(ang)*60, ny = p.y + Math.sin(ang)*60;
          // Telegraph cross at landing spot
          state.fx.push({warn:true, ax:nx-50, ay:ny, bx:nx+50, by:ny, color:col, life:warnLife, life0:warnLife, beamWidth:radius});
          state.fx.push({warn:true, ax:nx, ay:ny-50, bx:nx, by:ny+50, color:col, life:warnLife, life0:warnLife, beamWidth:radius});
          _schedule(()=>{
            if(!boss || boss.dead) return;
            boss.x = nx; boss.y = ny;
            particles(nx, ny, col, 40, 280, 0.7, 3);
            state.fx.push({ring:true, x:nx, y:ny, color:col, life:0.5, life0:0.5, r:radius, _maxR:radius});
            const pp = state.player;
            if(pp && pp.alive && !pp.downed && Math.hypot(pp.x-nx, pp.y-ny) < radius){
              let rem = dmg * BOSS_DMG_MUL;
              if(pp.shield>0){ const a=Math.min(pp.shield,rem); pp.shield-=a; rem-=a; }
              pp.hp -= rem; SFX.hurt(); shake(10);
            }
            if(idx+1 < hops){ _schedule(()=>doHop(idx+1), 280); }
          }, warnLife*1000);
        };
        doHop(0);
        break;
      }
      case 'clone_split': {
        const tier = state.god.phase;
        const clones = tier >= 9 ? 5 : tier >= 6 ? 4 : tier >= 4 ? 3 : 2;
        for(let i=0;i<clones;i++){
          const ang = (i/clones)*Math.PI*2 + Math.random()*0.3;
          const x = boss.x + Math.cos(ang)*90, y = boss.y + Math.sin(ang)*90;
          const c = makeEnemy({type:'phantom', x, y,
            hp:120*(1+tier*0.35), hpMax:120*(1+tier*0.35),
            sp:200 + tier*16, r:18 + Math.min(8, Math.floor(tier/2)),
            dmg:18+tier*3, col:col, isMinion:true});
          state.enemies.push(c);
        }
        particles(boss.x, boss.y, col, 30, 260, 0.5, 3);
        break;
      }
      case 'void_zone': {
        // More zones, bigger, more damage at higher phases.
        const ph = state.god.phase;
        const n = 3 + Math.floor(ph/2);
        const radius = 90 + Math.min(60, ph*6);
        const dps = 22 + ph*5;
        for(let i=0;i<n;i++){
          const a = state.arena;
          const x = 100 + Math.random()*(a.w-200), y = 100 + Math.random()*(a.h-200);
          state.fx.push({zone:true, x, y, color:col, life:7, life0:7, r:radius, dps});
          state.fx.push({ring:true, x, y, color:col, life:0.6, life0:0.6, r:radius, _maxR:radius});
        }
        // Phase 8+: drop one zone directly under the player to force movement.
        if(ph >= 8){
          const p = state.player;
          if(p){
            state.fx.push({zone:true, x:p.x, y:p.y, color:col, life:7, life0:7, r:radius, dps:dps+6});
            state.fx.push({ring:true, x:p.x, y:p.y, color:col, life:0.6, life0:0.6, r:radius, _maxR:radius});
          }
        }
        break;
      }
      case 'meteor_rain': {
        // More meteors, faster cadence, faster impact, and player-tracked drops at high phases
        const ph = state.god.phase;
        const n = 4 + ph*2;
        const cadence = Math.max(70, 180 - ph*12);
        const impactDelay = Math.max(450, 900 - ph*55);
        const dmg = 25 + ph*4;
        const radius = 70 + Math.min(30, ph*3);
        for(let i=0;i<n;i++){
          _schedule(()=>{
            const a = state.arena;
            const p = state.player;
            let x, y;
            // Phase 5+: half the meteors target the player's predicted location
            if(ph >= 5 && p && (i % 2 === 0)){
              x = p.x + (Math.random()-0.5)*120;
              y = p.y + (Math.random()-0.5)*120;
              x = Math.max(80, Math.min(a.w-80, x));
              y = Math.max(80, Math.min(a.h-80, y));
            } else {
              x = 100 + Math.random()*(a.w-200);
              y = 100 + Math.random()*(a.h-200);
            }
            state.fx.push({ring:true, x, y, color:col, life:0.9, life0:0.9, r:radius-10, _maxR:radius-10});
            _schedule(()=>{
              const pp = state.player;
              if(pp && pp.alive && !pp.downed && Math.hypot(pp.x-x, pp.y-y) < radius){
                let rem=dmg * BOSS_DMG_MUL;
                if(pp.shield>0){ const a2=Math.min(pp.shield,rem); pp.shield-=a2; rem-=a2; }
                pp.hp -= rem; SFX.hurt(); shake(8);
              }
              particles(x, y, col, 40, 320, 0.7, 4);
              state.fx.push({ring:true, x, y, color:col, life:0.4, life0:0.4, r:radius+20, _maxR:radius+20});
            }, impactDelay);
          }, i*cadence);
        }
        break;
      }
      case 'laser_sweep': {
        // Faster sweep, wider arc, more ticks, and a 4-way cross at phase 7+
        const ph = state.god.phase;
        const startAng = Math.atan2(target.y-boss.y, target.x-boss.x);
        const sweepDur = Math.max(0.8, 1.6 - ph*0.08);
        const ticks = 12 + Math.min(18, ph*2);
        const arc = Math.PI*1.2 + Math.min(Math.PI*0.6, ph*0.08);
        const beamWidth = 24 + Math.min(20, ph*2);
        const dmg = 14 + ph*3;
        const beams = ph >= 7 ? 4 : ph >= 4 ? 2 : 1;
        for(let i=0;i<ticks;i++){
          _schedule(()=>{
            if(!boss || boss.dead) return;
            const t = (i/ticks)*arc - arc/2;
            for(let b=0;b<beams;b++){
              const ang = startAng + t + b*(Math.PI*2/beams);
              const ax=boss.x, ay=boss.y, bx=boss.x+Math.cos(ang)*1200, by=boss.y+Math.sin(ang)*1200;
              state.fx.push({beam:true, ax,ay,bx,by, color:col, life:0.18, life0:0.18, beamFireAt:0.16, beamWidth, dmg});
            }
          }, i*(sweepDur*1000/ticks));
        }
        break;
      }
      case 'ground_spikes': {
        // Single line at low phases grows into a fan of spike-lines at high phases
        const ph = state.god.phase;
        const baseAng = Math.atan2(target.y-boss.y, target.x-boss.x);
        const lines = ph >= 7 ? 5 : ph >= 5 ? 3 : ph >= 3 ? 2 : 1;
        const n = 8 + Math.min(6, ph);
        const spread = lines === 1 ? 0 : (Math.PI/6) * (lines-1);
        const dmg = 20 + ph*3;
        const radius = 50 + Math.min(20, ph*2);
        const delay = Math.max(400, 800 - ph*40);
        for(let l=0; l<lines; l++){
          const t = lines===1 ? 0 : (l/(lines-1)) - 0.5;
          const ang = baseAng + t*spread;
          for(let i=1;i<=n;i++){
            const x = boss.x + Math.cos(ang)*i*70, y = boss.y + Math.sin(ang)*i*70;
            state.fx.push({ring:true, x, y, color:col, life:0.8, life0:0.8, r:40, _maxR:40});
            _schedule(()=>{
              const p = state.player;
              if(p && p.alive && !p.downed && Math.hypot(p.x-x, p.y-y) < radius){
                let rem=dmg * BOSS_DMG_MUL;
                if(p.shield>0){ const a=Math.min(p.shield,rem); p.shield-=a; rem-=a; }
                p.hp -= rem; SFX.hurt(); shake(6);
              }
              particles(x,y,col,18,260,0.5,3);
            }, delay + i*30);
          }
        }
        break;
      }
      case 'dash_strike': {
        // Multi-dash chain that retargets the player each hop; tighter telegraph at high phases
        const ph = state.god.phase;
        const dashes = ph >= 10 ? 4 : ph >= 8 ? 3 : ph >= 5 ? 2 : 1;
        const warnLife = Math.max(0.32, 0.7 - ph*0.04);
        const dmg = 35 + ph*5;
        const dashStep = (dashIdx)=>{
          if(!boss || boss.dead) return;
          const p = state.player; if(!p) return;
          const ang = Math.atan2(p.y-boss.y, p.x-boss.x);
          const ax=boss.x, ay=boss.y, bx=boss.x+Math.cos(ang)*900, by=boss.y+Math.sin(ang)*900;
          state.fx.push({warn:true, ax,ay,bx,by, color:col, life:warnLife, life0:warnLife, beamWidth:80});
          _schedule(()=>{
            if(!boss || boss.dead) return;
            boss.x += Math.cos(ang)*600; boss.y += Math.sin(ang)*600;
            boss.x = Math.max(80, Math.min(state.arena.w-80, boss.x));
            boss.y = Math.max(80, Math.min(state.arena.h-80, boss.y));
            particles(boss.x, boss.y, col, 50, 360, 0.7, 4);
            shake(10);
            const pp = state.player;
            if(pp && pp.alive && !pp.downed && Math.hypot(pp.x-boss.x, pp.y-boss.y) < 110){
              let rem=dmg * BOSS_DMG_MUL;
              if(pp.shield>0){ const a=Math.min(pp.shield,rem); pp.shield-=a; rem-=a; }
              pp.hp -= rem; SFX.hurt();
            }
            if(dashIdx+1 < dashes){
              _schedule(()=>dashStep(dashIdx+1), 220);
            }
          }, warnLife*1000);
        };
        dashStep(0);
        break;
      }
      case 'chain_lightning': {
        // NERFED: fewer bolts, lower per-bolt damage, and the second arc only
        // appears at very high phases. Boss chain lightning was hitting too
        // hard — now it's a threat instead of a one-shot.
        const ph = state.god.phase;
        const p = state.player; if(!p) break;
        const bolts = 3 + Math.min(4, Math.floor(ph/2));   // was 5 + min(8, ph)
        const beamW = 12 + Math.min(12, ph);                // was 16 + min(20, ph*2)
        const dmg = 6 + ph*1.5;                             // was 12 + ph*3
        let prevX = boss.x, prevY = boss.y;
        for(let i=0;i<bolts;i++){
          const tx = p.x + (Math.random()-0.5)*240;
          const ty = p.y + (Math.random()-0.5)*240;
          state.fx.push({beam:true, ax:prevX, ay:prevY, bx:tx, by:ty, color:'#ffd166', life:0.5, life0:0.5, beamFireAt:0.45, beamWidth:beamW, dmg});
          prevX = tx; prevY = ty;
        }
        // Second arc only at phase 9+, and weaker than before.
        if(ph >= 9){
          _schedule(()=>{
            if(!boss || boss.dead) return;
            const pp = state.player; if(!pp) return;
            let px = boss.x, py = boss.y;
            for(let i=0;i<bolts;i++){
              const tx = pp.x + (Math.random()-0.5)*260;
              const ty = pp.y + (Math.random()-0.5)*260;
              state.fx.push({beam:true, ax:px, ay:py, bx:tx, by:ty, color:'#ffd166', life:0.45, life0:0.45, beamFireAt:0.40, beamWidth:beamW, dmg:dmg+1});
              px = tx; py = ty;
            }
          }, 700);
        }
        break;
      }
      case 'black_hole': {
        // Pulls player toward boss for 2s. Auto-cancels when boss dies.
        const life = 2.0;
        state.fx.push({_pull:true, x:boss.x, y:boss.y, life, life0:life, color:'#000', r:200, _bossRef:boss});
        state.fx.push({ring:true, x:boss.x, y:boss.y, color:col, life, life0:life, r:200, _maxR:200, _bossRef:boss});
        break;
      }
      case 'reality_break': {
        shake(20);
        state.fx.push({_flash:true, life:0.8, life0:0.8, color:'#fff'});
        for(let s=0;s<4;s++){
          _schedule(()=>{ if(!boss||boss.dead) return; castSkill(boss,'bullet_spiral',target); }, s*200);
        }
        _schedule(()=>{ if(!boss||boss.dead) return; castSkill(boss,'meteor_rain',target); }, 400);
        _schedule(()=>{ if(!boss||boss.dead) return; castSkill(boss,'shockwave',target); }, 800);
        break;
      }
      // ===================================================================
      // NEW SKILLS (this patch)
      // ===================================================================
      case 'prismatic_burst': {
        // Staggered rings, more layers + faster cadence at higher phases.
        const ph = state.god.phase;
        const colors = ['#22e8ff', '#ff2bd6', '#ffd166', '#9d5cff', '#3dffb0'];
        const layers = ph >= 9 ? 5 : ph >= 6 ? 4 : 3;
        const cadence = Math.max(140, 260 - ph*14);
        const dmg = 20 + ph*3;
        for(let i=0;i<layers;i++){
          _schedule(()=>{
            if(!boss || boss.dead) return;
            const c = colors[i % colors.length];
            const maxR = 240 + ph*26 + i*60;
            const life = 0.85;
            state.fx.push({ring:true, x:boss.x, y:boss.y, color:c, life, life0:life, r:0, _maxR:maxR});
            state.fx.push({_shock:true, x:boss.x, y:boss.y, life, life0:life, color:c, r:0, _maxR:maxR, dmg, vx:0, vy:0});
          }, i*cadence);
        }
        shake(8);
        break;
      }
      case 'gravity_well': {
        // REWORKED: previously this used a _pull effect anchored to the boss
        // via _bossRef which on phase 8 (the Forge of Endings, who never moves
        // from arena center) would yank the player into the stationary boss
        // body and lock them inside it — the camera/player could end up
        // visually frozen on top of the boss and the map appeared to vanish.
        //
        // New behavior: "Singularity Crush" — three telegraphed crush sites
        // erupt around the player. No player teleporting, no _pull, no
        // _bossRef — completely safe and even more punishing on dodging.
        const ph = state.god.phase;
        const sites = ph >= 9 ? 5 : ph >= 7 ? 4 : ph >= 5 ? 3 : 2;
        const radius = 110 + Math.min(50, ph*5);
        const dmg = 32 + ph*5;
        const warnLife = Math.max(0.55, 1.0 - ph*0.05);
        const p0 = state.player;
        const px0 = p0 ? p0.x : boss.x;
        const py0 = p0 ? p0.y : boss.y;
        for(let i=0;i<sites;i++){
          const ang = (i/sites)*Math.PI*2 + Math.random()*0.4;
          const dist = i === 0 ? 0 : 90 + Math.random()*120;
          const sx = px0 + Math.cos(ang)*dist;
          const sy = py0 + Math.sin(ang)*dist;
          // Telegraph: pulsing ring + warning crosshair
          state.fx.push({ring:true, x:sx, y:sy, color:col, life:warnLife, life0:warnLife, r:radius, _maxR:radius});
          state.fx.push({warn:true, ax:sx-radius, ay:sy, bx:sx+radius, by:sy, color:col, life:warnLife, life0:warnLife, beamWidth:radius*2});
          state.fx.push({warn:true, ax:sx, ay:sy-radius, bx:sx, by:sy+radius, color:col, life:warnLife, life0:warnLife, beamWidth:radius*2});
          // Detonation: shockwave + flash damage at center
          _schedule(()=>{
            shake(10);
            particles(sx, sy, col, 50, 360, 0.7, 4);
            state.fx.push({ring:true, x:sx, y:sy, color:col, life:0.55, life0:0.55, r:0, _maxR:radius+30});
            state.fx.push({_shock:true, x:sx, y:sy, life:0.55, life0:0.55, color:col, r:0, _maxR:radius+30, dmg:dmg-6, vx:0, vy:0});
            const pp = state.player;
            if(pp && pp.alive && !pp.downed && Math.hypot(pp.x-sx, pp.y-sy) < radius){
              let rem = dmg * BOSS_DMG_MUL;
              if(pp.shield>0){ const a=Math.min(pp.shield,rem); pp.shield-=a; rem-=a; }
              pp.hp -= rem; SFX.hurt();
            }
          }, warnLife*1000 + i*120);
        }
        shake(10);
        break;
      }
      case 'shadow_clones_assault': {
        // More clones, tighter ring, faster beams at high phases.
        const ph = state.god.phase;
        const cloneCount = ph >= 9 ? 8 : ph >= 6 ? 6 : 4;
        const cloneRad = 240;
        const warnLife = Math.max(0.45, 0.8 - ph*0.04);
        const dmg = 24 + ph*4;
        const beamW = 30 + Math.min(20, ph*2);
        for(let i=0;i<cloneCount;i++){
          const ang0 = (i/cloneCount)*Math.PI*2;
          const cx = boss.x + Math.cos(ang0)*cloneRad;
          const cy = boss.y + Math.sin(ang0)*cloneRad;
          state.fx.push({ring:true, x:cx, y:cy, color:'#9d5cff', life:0.6, life0:0.6, r:30, _maxR:30});
          particles(cx, cy, '#9d5cff', 24, 220, 0.6, 3);
          _schedule(()=>{
            const p = state.player; if(!p) return;
            const ang = Math.atan2(p.y-cy, p.x-cx);
            const len = 1100;
            const ax=cx, ay=cy, bx=cx+Math.cos(ang)*len, by=cy+Math.sin(ang)*len;
            state.fx.push({warn:true, ax,ay,bx,by, color:'#9d5cff', life:warnLife, life0:warnLife, beamWidth:26});
            _schedule(()=>{
              state.fx.push({beam:true, ax,ay,bx,by, color:'#9d5cff', life:0.35, life0:0.35, beamFireAt:0.20, beamWidth:beamW, dmg});
            }, warnLife*1000);
          }, 500 + i*60);
        }
        // Phase 8+: clones fire a second salvo retargeting the player.
        if(ph >= 8){
          _schedule(()=>{
            if(!boss || boss.dead) return;
            for(let i=0;i<cloneCount;i++){
              const ang0 = (i/cloneCount)*Math.PI*2;
              const cx = boss.x + Math.cos(ang0)*cloneRad;
              const cy = boss.y + Math.sin(ang0)*cloneRad;
              const p = state.player; if(!p) return;
              const ang = Math.atan2(p.y-cy, p.x-cx);
              const len = 1100;
              const ax=cx, ay=cy, bx=cx+Math.cos(ang)*len, by=cy+Math.sin(ang)*len;
              state.fx.push({warn:true, ax,ay,bx,by, color:'#9d5cff', life:0.4, life0:0.4, beamWidth:26});
              _schedule(()=>{
                state.fx.push({beam:true, ax,ay,bx,by, color:'#9d5cff', life:0.32, life0:0.32, beamFireAt:0.18, beamWidth:beamW, dmg:dmg+4});
              }, 400);
            }
          }, 1800);
        }
        break;
      }
      case 'time_freeze_pulse': {
        // Longer freeze, denser bullet ring, plus a follow-up wave at high phase.
        const ph = state.god.phase;
        const p = state.player;
        const freezeDur = 1.6 + ph*0.12;
        if(p){ p.timeFreezeUntil = state.time + freezeDur; }
        state.fx.push({ring:true, x:boss.x, y:boss.y, color:'#22e8ff', life:0.6, life0:0.6, r:0, _maxR:140 + ph*10});
        const arms = 18 + Math.min(18, ph*2);
        const dmg = 16 + ph*3;
        for(let a=0;a<arms;a++){
          const ang = (a/arms)*Math.PI*2;
          spawnHostileBullet(boss.x, boss.y, ang, 240 + ph*15, '#22e8ff', dmg);
        }
        // Phase 6+: counter-rotating second ring.
        if(ph >= 6){
          _schedule(()=>{
            if(!boss || boss.dead) return;
            for(let a=0;a<arms;a++){
              const ang = (a/arms)*Math.PI*2 + Math.PI/arms;
              spawnHostileBullet(boss.x, boss.y, ang, 200 + ph*12, '#22e8ff', dmg);
            }
          }, 350);
        }
        state.fx.push({_flash:true, life:0.35, life0:0.35, color:'#22e8ff'});
        break;
      }
      case 'radial_collapse': {
        // OPTIMIZED nova replacement (used on phase 10). Same implode→explode
        // *feeling* as nova_implosion but spawns ZERO bullets — just a few
        // ring fx + telegraphed beam spokes + 2 timed damage bands. Cheap.
        const ph = state.god.phase;
        const dmgIn  = (32 + ph*3) * BOSS_DMG_MUL;
        const dmgOut = (28 + ph*3) * BOSS_DMG_MUL;
        const ringR  = 360 + ph*8;
        const implodeMs = 850;
        // 1) Implosion telegraph: contracting ring + 6 warning spokes.
        state.fx.push({ring:true, x:boss.x, y:boss.y, color:col, life:implodeMs/1000, life0:implodeMs/1000, r:ringR, _maxR:ringR, _shrink:true, _bossRef:boss});
        const spokes = 6;
        for(let i=0;i<spokes;i++){
          const ang = (i/spokes)*Math.PI*2;
          const ax = boss.x, ay = boss.y;
          const bx = boss.x + Math.cos(ang)*ringR;
          const by = boss.y + Math.sin(ang)*ringR;
          state.fx.push({warn:true, ax,ay,bx,by, color:col, life:implodeMs/1000, life0:implodeMs/1000, beamWidth:14});
        }
        // 2) Implosion hit: damage anyone close to boss.
        _schedule(()=>{
          if(!boss || boss.dead) return;
          shake(10);
          state.fx.push({_flash:true, life:0.25, life0:0.25, color:col});
          state.fx.push({ring:true, x:boss.x, y:boss.y, color:col, life:0.35, life0:0.35, r:0, _maxR:120});
          const pp = state.player;
          if(pp && pp.alive && !pp.downed){
            const d = Math.hypot(pp.x-boss.x, pp.y-boss.y);
            if(d < 110){
              let rem = dmgIn;
              if(pp.shield>0){ const a=Math.min(pp.shield,rem); pp.shield-=a; rem-=a; }
              pp.hp -= rem; SFX.hurt();
            }
          }
        }, implodeMs);
        // 3) Outward shockwave: single big expanding ring + 2 timed damage
        // bands at known radii. No bullets — much lighter than nova.
        const explodeAt = implodeMs + 120;
        const finalR = 380 + ph*16;
        _schedule(()=>{
          if(!boss || boss.dead) return;
          shake(16);
          state.fx.push({_flash:true, life:0.40, life0:0.40, color:col});
          state.fx.push({ring:true, x:boss.x, y:boss.y, color:col, life:0.85, life0:0.85, r:0, _maxR:finalR});
          // Slim outer halo for extra readability without extra bullets.
          state.fx.push({ring:true, x:boss.x, y:boss.y, color:'#ffffff', life:0.65, life0:0.65, r:0, _maxR:finalR*0.92});
        }, explodeAt);
        // Two bands: inner band ~250ms after explosion, outer ~550ms.
        const checkBand = (delay, rMin, rMax)=>{
          _schedule(()=>{
            if(!boss || boss.dead) return;
            const pp = state.player;
            if(!pp || !pp.alive || pp.downed) return;
            const d = Math.hypot(pp.x-boss.x, pp.y-boss.y);
            if(d >= rMin && d <= rMax){
              let rem = dmgOut;
              if(pp.shield>0){ const a=Math.min(pp.shield,rem); pp.shield-=a; rem-=a; }
              pp.hp -= rem; SFX.hurt();
              particles(pp.x, pp.y, col, 18, 220, 0.5, 3);
            }
          }, delay);
        };
        checkBand(explodeAt + 240, 100, finalR*0.55);
        checkBand(explodeAt + 540, finalR*0.50, finalR);
        break;
      }
      case 'nova_implosion': {
        // Implode: inward ring of bullets, then a 360° outward blast.
        // Higher phases = more bullets, faster, plus a third "echo" wave.
        const ph = state.god.phase;
        const ringR = 360 + ph*10;
        const inN = 16 + Math.min(20, ph*2);
        const inSpeed = 260 + ph*18;
        const outArms = 24 + Math.min(24, ph*2);
        const outSpeed = 360 + ph*22;
        const inDmg = 18 + ph*3;
        const outDmg = 20 + ph*3;
        const implodeDelay = Math.max(900, 1500 - ph*60);
        for(let a=0;a<inN;a++){
          const ang = (a/inN)*Math.PI*2;
          const sx = boss.x + Math.cos(ang)*ringR;
          const sy = boss.y + Math.sin(ang)*ringR;
          spawnHostileBullet(sx, sy, ang + Math.PI, inSpeed, col, inDmg);
        }
        // Outward blast
        _schedule(()=>{
          if(!boss || boss.dead) return;
          shake(14);
          state.fx.push({_flash:true, life:0.4, life0:0.4, color:col});
          for(let a=0;a<outArms;a++){
            const ang = (a/outArms)*Math.PI*2;
            spawnHostileBullet(boss.x, boss.y, ang, outSpeed, col, outDmg);
          }
          state.fx.push({ring:true, x:boss.x, y:boss.y, color:col, life:0.7, life0:0.7, r:0, _maxR:300 + ph*15});
        }, implodeDelay);
        // Phase 7+: echo wave — rotated, slower, bigger AoE.
        if(ph >= 7){
          _schedule(()=>{
            if(!boss || boss.dead) return;
            for(let a=0;a<outArms;a++){
              const ang = (a/outArms)*Math.PI*2 + Math.PI/outArms;
              spawnHostileBullet(boss.x, boss.y, ang, outSpeed*0.8, col, outDmg-2);
            }
            state.fx.push({ring:true, x:boss.x, y:boss.y, color:col, life:0.7, life0:0.7, r:0, _maxR:360});
          }, implodeDelay + 450);
        }
        break;
      }
      // ===================================================================
      // PHASE-11 NINJA SKILLS (new in this patch). Boss flips brief invuln
      // frames during blinks/dashes for an "untouchable" feel.
      // ===================================================================
      case 'phantom_step': {
        // Chain blink-slash: boss teleports around the player up to 7 times,
        // each blink is a tight cross telegraph followed by a slash. Boss
        // is briefly untouchable for the whole sequence.
        const ph = state.god.phase;
        const hops = ph >= 11 ? 6 : Math.max(3, Math.floor(ph/2));
        const dmg = 28 + ph*5;
        const radius = 90;
        const warnLife = 0.20;
        boss.invincible = true;
        const doStep = (idx)=>{
          if(!boss || boss.dead){ if(boss) boss.invincible = false; return; }
          const p = state.player;
          if(!p){ boss.invincible = false; return; }
          const ang = Math.random()*Math.PI*2;
          const nx = Math.max(80, Math.min(state.arena.w-80, p.x + Math.cos(ang)*70));
          const ny = Math.max(80, Math.min(state.arena.h-80, p.y + Math.sin(ang)*70));
          // Telegraph cross at landing spot
          state.fx.push({warn:true, ax:nx-radius*0.7, ay:ny, bx:nx+radius*0.7, by:ny, color:'#ffffff', life:warnLife, life0:warnLife, beamWidth:radius});
          state.fx.push({warn:true, ax:nx, ay:ny-radius*0.7, bx:nx, by:ny+radius*0.7, color:'#ffffff', life:warnLife, life0:warnLife, beamWidth:radius});
          _schedule(()=>{
            if(!boss || boss.dead) return;
            particles(boss.x, boss.y, '#ffffff', 18, 220, 0.4, 3);
            boss.x = nx; boss.y = ny;
            particles(nx, ny, '#ffffff', 30, 280, 0.6, 3);
            state.fx.push({ring:true, x:nx, y:ny, color:'#ffffff', life:0.4, life0:0.4, r:0, _maxR:radius});
            const pp = state.player;
            if(pp && pp.alive && !pp.downed && Math.hypot(pp.x-nx, pp.y-ny) < radius){
              let rem = dmg * BOSS_DMG_MUL;
              if(pp.shield>0){ const a=Math.min(pp.shield,rem); pp.shield-=a; rem-=a; }
              pp.hp -= rem; SFX.hurt(); shake(8);
            }
            if(idx+1 < hops){
              _schedule(()=>doStep(idx+1), 160);
            } else {
              _schedule(()=>{ if(boss && !boss.dead) boss.invincible = false; }, 280);
            }
          }, warnLife*1000);
        };
        doStep(0);
        break;
      }
      case 'shuriken_storm': {
        // Multiple waves of curving shuriken sprayed in sweeping arcs.
        const ph = state.god.phase;
        const waves = 5 + Math.min(8, Math.floor(ph/2));
        const arms = 14 + Math.min(14, ph);
        const dmg = 14 + ph*3;
        const speed = 280 + ph*16;
        for(let s=0; s<waves; s++){
          _schedule(()=>{
            if(!boss || boss.dead) return;
            const sweep = (s%2===0) ? 1 : -1;
            for(let a=0; a<arms; a++){
              const ang = (a/arms)*Math.PI*2 + sweep*s*0.42;
              spawnHostileBullet(boss.x, boss.y, ang, speed, '#ffffff', dmg);
            }
          }, s*120);
        }
        // Phase 11 follow-up: a second, denser ring tracking the player.
        if(ph >= 11){
          _schedule(()=>{
            if(!boss || boss.dead) return;
            const p = state.player; if(!p) return;
            const baseAng = Math.atan2(p.y-boss.y, p.x-boss.x);
            const denseArms = arms + 6;
            for(let a=0; a<denseArms; a++){
              const ang = baseAng + (a/denseArms)*Math.PI*2;
              spawnHostileBullet(boss.x, boss.y, ang, speed*1.05, '#ffffff', dmg+2);
            }
          }, waves*120 + 200);
        }
        break;
      }
      case 'umbral_dash': {
        // Boss is briefly untouchable, dashes across the arena leaving a
        // damaging slash beam. Up to 3 chained dashes at high phases.
        const ph = state.god.phase;
        const dashes = ph >= 11 ? 3 : (ph >= 7 ? 2 : 1);
        const dmg = 36 + ph*5;
        const dashStep = (idx)=>{
          if(!boss || boss.dead){ if(boss) boss.invincible = false; return; }
          const p = state.player;
          if(!p){ boss.invincible = false; return; }
          const ang = Math.atan2(p.y-boss.y, p.x-boss.x) + (Math.random()-0.5)*0.35;
          const len = 720;
          const ax = boss.x, ay = boss.y;
          const bx = boss.x + Math.cos(ang)*len, by = boss.y + Math.sin(ang)*len;
          state.fx.push({warn:true, ax,ay,bx,by, color:'#ffffff', life:0.24, life0:0.24, beamWidth:60});
          boss.invincible = true;
          _schedule(()=>{
            if(!boss || boss.dead){ boss.invincible = false; return; }
            // Slash beam stays as the dash trail
            state.fx.push({beam:true, ax,ay,bx,by, color:'#ffffff', life:0.40, life0:0.40, beamFireAt:0.22, beamWidth:70, dmg});
            boss.x = Math.max(80, Math.min(state.arena.w-80, bx));
            boss.y = Math.max(80, Math.min(state.arena.h-80, by));
            particles(boss.x, boss.y, '#ffffff', 50, 360, 0.7, 4);
            shake(10);
            _schedule(()=>{ if(boss && !boss.dead) boss.invincible = false; }, 200);
            if(idx+1 < dashes){ _schedule(()=>dashStep(idx+1), 380); }
          }, 240);
        };
        dashStep(0);
        break;
      }
      case 'mirror_legion': {
        // Ring of telegraphed shadow doubles, each fires a dash-slash beam
        // at the player from a different angle. Hard to dodge in the open.
        const ph = state.god.phase;
        const clones = ph >= 11 ? 6 : (ph >= 7 ? 5 : 4);
        const dmg = 26 + ph*4;
        const ringR = 240;
        for(let i=0; i<clones; i++){
          _schedule(()=>{
            if(!boss || boss.dead) return;
            const ang0 = (i/clones)*Math.PI*2 + Math.random()*0.2;
            const cx = boss.x + Math.cos(ang0)*ringR;
            const cy = boss.y + Math.sin(ang0)*ringR;
            particles(cx, cy, '#ffffff', 24, 220, 0.6, 3);
            state.fx.push({ring:true, x:cx, y:cy, color:'#ffffff', life:0.45, life0:0.45, r:0, _maxR:38});
            const p = state.player; if(!p) return;
            const ang2 = Math.atan2(p.y-cy, p.x-cx);
            const len = 900;
            const ax=cx, ay=cy, bx=cx+Math.cos(ang2)*len, by=cy+Math.sin(ang2)*len;
            state.fx.push({warn:true, ax,ay,bx,by, color:'#ffffff', life:0.45, life0:0.45, beamWidth:36});
            _schedule(()=>{
              state.fx.push({beam:true, ax,ay,bx,by, color:'#ffffff', life:0.32, life0:0.32, beamFireAt:0.18, beamWidth:56, dmg});
            }, 450);
          }, i*150);
        }
        break;
      }
      case 'eclipse_finale': {
        // Phase 11 ultimate combo. Heavier than reality_break — interleaves
        // a shuriken storm, a prismatic burst, a nova, meteors and lightning.
        shake(24);
        state.fx.push({_flash:true, life:1.0, life0:1.0, color:'#ffffff'});
        _schedule(()=>{ if(!boss||boss.dead) return; castSkill(boss, 'shuriken_storm', target); }, 100);
        _schedule(()=>{ if(!boss||boss.dead) return; castSkill(boss, 'prismatic_burst',  target); }, 700);
        _schedule(()=>{ if(!boss||boss.dead) return; castSkill(boss, 'nova_implosion',   target); }, 1300);
        _schedule(()=>{ if(!boss||boss.dead) return; castSkill(boss, 'meteor_rain',      target); }, 2200);
        _schedule(()=>{ if(!boss||boss.dead) return; castSkill(boss, 'chain_lightning',  target); }, 2700);
        _schedule(()=>{ if(!boss||boss.dead) return; castSkill(boss, 'phantom_step',     target); }, 3300);
        break;
      }
      default: break;
    }
  }

  function spawnHostileBullet(x,y,ang,speed,color,dmg){
    state.bullets.push({
      x, y, vx:Math.cos(ang)*speed, vy:Math.sin(ang)*speed,
      color, radius:9, life:3.5, hostile:true, dmg, trail:[],
    });
  }

  function spawnPickup(){
    const a = state.arena;
    const x = 120 + Math.random()*(a.w-240);
    const y = 120 + Math.random()*(a.h-240);
    const upg = UPGRADES[Math.floor(Math.random()*UPGRADES.length)];
    const rarity = rollRarity();
    state.pickups.push({ id:upg.id, name:upg.name, rarity:rarity.id, x, y, t:0 });
    // Spawn fx scales with rarity — legendary is unmissable.
    const sparkColor = rarity.id === 'common' ? (upg.color || '#ffd166') : rarity.color;
    const sparkN = rarity.id === 'common' ? 12 : (rarity.id === 'rare' ? 24 : (rarity.id === 'epic' ? 40 : 70));
    const sparkSpd = rarity.id === 'common' ? 140 : 240;
    particles(x, y, sparkColor, sparkN, sparkSpd, 0.7, 2);
    if(rarity.id !== 'common'){
      // Drop-in shockwave ring so the player notices a special drop landing.
      const r0 = rarity.id === 'legendary' ? 110 : (rarity.id === 'epic' ? 80 : 55);
      state.fx.push({ring:true, x, y, color:rarity.color, life:0.55, life0:0.55, r:0, _maxR:r0});
    }
  }

  // Special drop: when a boss dies, drop a fragment of its signature skill.
  // Anyone can collect it — but only the first to walk over it claims it.
  function spawnBossSkillPickup(boss, phaseDef){
    if(!phaseDef || !phaseDef.signature) return;
    const info = PLAYER_BOSS_SKILL_INFO[phaseDef.signature];
    state.pickups.push({
      bossSkill: true,
      skillId: phaseDef.signature,
      skillName: info ? info.name : phaseDef.signature,
      color: phaseDef.color,
      phase: state.god ? state.god.phase : 0,
      x: boss.x, y: boss.y,
      t: 0,
    });
    // Big flashy spawn fx so players notice the special drop.
    particles(boss.x, boss.y, phaseDef.color, 60, 320, 0.9, 4);
    state.fx.push({ring:true, x:boss.x, y:boss.y, color:phaseDef.color, life:0.9, life0:0.9, r:0, _maxR:140});
  }

  function onBossDefeated(boss){
    const g = state.god; if(!g) return;
    // Already evolving? ignore re-trigger.
    if(g.mode === 'evolving' || g.mode === 'transition') return;
    const phaseDef = BOSS_PHASES[g.phase-1];
    // CINEMATIC EVOLUTION: boss is invincible, plays evolving animation,
    // crossfades to next phase music if there's a next phase.
    boss.invincible = true;
    boss.evolving = true;
    boss.evoT = 0;
    g.mode = 'evolving';
    g.timer = 2.6;                 // evolution length
    // Cancel any in-flight skill timeouts so the dying boss stops attacking.
    _clearAllScheduled();
    // Wipe damaging fx so the player isn't killed during the cinematic.
    _purgeHostileFx();
    // Heal player a bit + clear pickups stacking
    if(state.player){ state.player.hp = Math.min(state.player.hpMax, state.player.hp + state.player.hpMax*0.25); }
    spawnPickup();
    // Drop the boss's signature skill as a special pickup — first player to
    // walk over it acquires a low-version of that skill on the F button.
    spawnBossSkillPickup(boss, phaseDef);
    showWaveBanner(`PHASE ${g.phase} EVOLVING…`, (phaseDef ? phaseDef.name.toUpperCase() : 'BOSS') + ' BREAKING DOWN', 2400);
    // Crossfade to next phase music early so the audio carries the transition.
    const nextDef = BOSS_PHASES[g.phase];   // next phase or undefined
    if(nextDef && nextDef.music){
      SFX.playMusic(nextDef.music, 1800);
    } else {
      // Final boss → fade music out for the victory beat
      SFX.stopMusic(1500);
    }
    SFX.bossSkill('intro_roar', 0.7);
    shake(22);
    particles(boss.x, boss.y, phaseDef ? phaseDef.color : '#ffd166', 100, 380, 1.2, 4);
    state.fx.push({x:boss.x, y:boss.y, vx:0, vy:0, life:0.9, life0:0.9, color: phaseDef?phaseDef.color:'#ffffff', r: boss.r*2.5, ring:true, _maxR: boss.r*2.5});
  }

  return { start, beginPhase, update, bossAITick, onBossDefeated };
})();

// ---------- God Mode UI ----------
function showGodIntro(phaseTxt, name, title, rank){
  const el = document.getElementById('godIntro');
  if(!el) return;
  document.getElementById('gPhaseText').textContent = phaseTxt;
  document.getElementById('gNameText').textContent  = name;
  document.getElementById('gTitleText').textContent = title;
  document.getElementById('gRankText').textContent  = rank;
  // restart animations
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(showGodIntro._t);
  showGodIntro._t = setTimeout(()=>el.classList.remove('show'), 4000);
}
function hideGodIntro(){
  const el = document.getElementById('godIntro');
  if(el) el.classList.remove('show');
}
function showBossBar(name){
  const el = document.getElementById('bossBar'); if(!el) return;
  document.getElementById('bossBarName').textContent = name;
  document.getElementById('bossBarFill').style.width = '100%';
  el.classList.add('show');
}
function updateBossBarFill(hp, hpMax){
  const f = document.getElementById('bossBarFill'); if(!f) return;
  const pct = Math.max(0, Math.min(100, hp/hpMax*100));
  f.style.width = pct + '%';
}
function hideBossBar(){
  const el = document.getElementById('bossBar'); if(el) el.classList.remove('show');
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
  // Arena tint for current god-mode phase
  if(isGodMode() && state.god && state.god.phase>0){
    const pd = BOSS_PHASES[state.god.phase-1];
    if(pd){
      ctx.fillStyle = pd.arenaTint;
      ctx.fillRect(0,0,state.arena.w,state.arena.h);
    }
  }
  ctx.strokeStyle='rgba(157,92,255,.6)'; ctx.lineWidth=2; ctx.shadowColor='#9d5cff'; ctx.shadowBlur=18;
  ctx.strokeRect(0,0,state.arena.w,state.arena.h); ctx.shadowBlur=0;

  // Pickups
  for(const pk of state.pickups){
    const pulse = 1 + Math.sin(pk.t*5)*0.18;
    ctx.save();
    ctx.translate(pk.x, pk.y);
    if(pk.bossSkill){
      // Boss-skill drop: bigger, phase-colored, with a rotating star + ring.
      const c = pk.color || '#ffd166';
      const r = (PICKUP_RADIUS + 8) * pulse;
      ctx.shadowColor = c; ctx.shadowBlur = 36;
      ctx.fillStyle = withAlpha(c, 0.28);
      ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(0,0,12,0,Math.PI*2); ctx.fill();
      // 5-point star outline rotating slowly
      ctx.rotate(pk.t*1.6);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath();
      for(let i=0;i<5;i++){
        const a = (i/5)*Math.PI*2 - Math.PI/2;
        const rr = i%2===0 ? r*0.9 : r*0.45;
        const px = Math.cos(a)*rr, py = Math.sin(a)*rr;
        if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
        const a2 = ((i+0.5)/5)*Math.PI*2 - Math.PI/2;
        ctx.lineTo(Math.cos(a2)*r*0.45, Math.sin(a2)*r*0.45);
      }
      ctx.closePath(); ctx.stroke();
    } else {
      // Color-coded drop: each upgrade type has its own glow color so the
      // player can tell at a glance what's on the floor. The OUTER ring +
      // optional pillar of light are tinted by RARITY so rare+ drops pop.
      const upgDef = UPGRADES.find(u=>u.id===pk.id);
      const c = (upgDef && upgDef.color) ? upgDef.color : '#ffd166';
      const rarity = getRarity(pk.rarity);
      const isCommon = rarity.id === 'common';
      // Pillar of light for rare+ drops — vertical taper above the pickup.
      if(rarity.pillar){
        const pillarH = rarity.id === 'legendary' ? 220 : (rarity.id === 'epic' ? 160 : 110);
        const pillarW = rarity.id === 'legendary' ? 30 : (rarity.id === 'epic' ? 22 : 16);
        const grad = ctx.createLinearGradient(0, -pillarH, 0, 0);
        grad.addColorStop(0,    withAlpha(rarity.color, 0));
        grad.addColorStop(0.55, withAlpha(rarity.color, 0.22 + 0.10*Math.sin(pk.t*3)));
        grad.addColorStop(1,    withAlpha(rarity.color, 0.55));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-pillarW*0.25, -pillarH);
        ctx.lineTo( pillarW*0.25, -pillarH);
        ctx.lineTo( pillarW*0.5,    0);
        ctx.lineTo(-pillarW*0.5,    0);
        ctx.closePath();
        ctx.fill();
      }
      // Ambient sparkles for epic/legendary
      if(rarity.sparkles && Math.random() < (rarity.id === 'legendary' ? 0.5 : 0.25)){
        particles(pk.x, pk.y - 10 - Math.random()*30, rarity.color, 1, 50, 0.5, 2);
      }
      // Inner glow + core dot (upgrade color)
      ctx.shadowColor = c; ctx.shadowBlur = isCommon ? 24 : 32;
      ctx.fillStyle = withAlpha(c, 0.25);
      ctx.beginPath(); ctx.arc(0,0,PICKUP_RADIUS*pulse,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(0,0,8,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
      // Outer ring tinted by rarity, with extra rotating ring for epic+
      ctx.strokeStyle = rarity.ringColor; ctx.lineWidth = rarity.ringWidth;
      ctx.beginPath(); ctx.arc(0,0,PICKUP_RADIUS,0,Math.PI*2); ctx.stroke();
      if(!isCommon){
        ctx.save();
        ctx.rotate(pk.t * (rarity.id === 'legendary' ? 2.5 : 1.6));
        ctx.strokeStyle = withAlpha(rarity.color, 0.85);
        ctx.lineWidth = 1.8;
        const seg = rarity.id === 'legendary' ? 4 : (rarity.id === 'epic' ? 3 : 2);
        for(let i=0;i<seg;i++){
          const a0 = (i/seg)*Math.PI*2;
          const a1 = a0 + Math.PI*2/(seg*2);
          ctx.beginPath(); ctx.arc(0,0,PICKUP_RADIUS+5, a0, a1); ctx.stroke();
        }
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // FX (warnings, beams, rings, shockwaves, particles, zones)
  for(const f of state.fx){
    const a=Math.max(0,f.life/f.life0);
    if(f.warn){
      // Pulsing warning line
      const pulse = 0.5 + 0.5*Math.sin((1-a)*30);
      ctx.save();
      ctx.strokeStyle = withAlpha(f.color, 0.25 + 0.4*pulse);
      ctx.lineWidth = (f.beamWidth||30) * (0.5 + 0.5*pulse);
      ctx.shadowColor = f.color; ctx.shadowBlur = 25;
      ctx.beginPath(); ctx.moveTo(f.ax,f.ay); ctx.lineTo(f.bx,f.by); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    } else if(f.beam){
      // Solid beam fires near end of life
      ctx.save();
      const fired = f.beamFired;
      ctx.strokeStyle = fired ? withAlpha('#ffffff', a*0.95) : withAlpha(f.color, 0.6*a);
      ctx.lineWidth = (f.beamWidth||30) * (fired?1.1:0.7);
      ctx.shadowColor = f.color; ctx.shadowBlur = 35;
      ctx.beginPath(); ctx.moveTo(f.ax,f.ay); ctx.lineTo(f.bx,f.by); ctx.stroke();
      // outer glow
      ctx.strokeStyle = withAlpha(f.color, 0.35*a);
      ctx.lineWidth = (f.beamWidth||30)*1.8;
      ctx.beginPath(); ctx.moveTo(f.ax,f.ay); ctx.lineTo(f.bx,f.by); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    } else if(f.zone){
      ctx.save();
      ctx.fillStyle = withAlpha(f.color, 0.25*a);
      ctx.beginPath(); ctx.arc(f.x,f.y,f.r,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = withAlpha(f.color, 0.7*a); ctx.lineWidth = 3;
      ctx.shadowColor = f.color; ctx.shadowBlur = 30;
      ctx.beginPath(); ctx.arc(f.x,f.y,f.r,0,Math.PI*2); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    } else if(f.ring){
      // Expanding ring (shockwave-style)
      const t = 1 - a;
      if(f._maxR){ f.r = (f._maxR) * t; }
      ctx.beginPath(); ctx.arc(f.x,f.y,f.r,0,Math.PI*2);
      ctx.strokeStyle=withAlpha(f.color,0.6*a); ctx.lineWidth=6;
      ctx.shadowColor=f.color; ctx.shadowBlur=30; ctx.stroke();
      ctx.shadowBlur=0;
    } else if(f._shock || f._pull){
      // Gameplay for shock rings and black-hole pull runs in updateFx.
    } else if(f._flash){
      ctx.save(); ctx.setTransform(DPR,0,0,DPR,0,0);
      ctx.fillStyle = withAlpha(f.color, 0.7*a);
      ctx.fillRect(0,0,W,H);
      ctx.restore();
    } else {
      ctx.fillStyle=withAlpha(f.color,a);
      ctx.beginPath(); ctx.arc(f.x,f.y,f.r,0,Math.PI*2); ctx.fill();
    }
  }

  // Enemies (regular + bosses + minions)
  for(const e of state.enemies){
    if(e.isBoss){
      drawBoss(e);
    } else {
      ctx.save(); ctx.translate(e.x,e.y); ctx.shadowColor=e.col; ctx.shadowBlur=16; ctx.fillStyle=e.col;
      if(e.type==='brute') ctx.fillRect(-e.r,-e.r,e.r*2,e.r*2);
      else if(e.type==='phantom'){ ctx.beginPath(); ctx.moveTo(0,-e.r); ctx.lineTo(e.r,0); ctx.lineTo(0,e.r); ctx.lineTo(-e.r,0); ctx.closePath(); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(0,0,e.r,0,Math.PI*2); ctx.fill(); }
      ctx.restore();
      if(e.hp<e.hpMax){ ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(e.x-e.r,e.y-e.r-8,e.r*2,3); ctx.fillStyle=e.col; ctx.fillRect(e.x-e.r,e.y-e.r-8,(e.r*2)*Math.max(0,e.hp/e.hpMax),3); }
    }
  }

  // Bullets
  for(const b of state.bullets){
    // Homing logic for boss orbs
    if(b._homing && state.player){
      const dx = state.player.x-b.x, dy = state.player.y-b.y, d=Math.hypot(dx,dy)||1;
      const targetVx = (dx/d)*220, targetVy = (dy/d)*220;
      b.vx += (targetVx-b.vx)*0.04;
      b.vy += (targetVy-b.vy)*0.04;
    }
    for(let i=0;i<b.trail.length;i++){ const t=i/b.trail.length; ctx.fillStyle=withAlpha(b.color,0.15+0.5*t); ctx.beginPath(); ctx.arc(b.trail[i].x,b.trail[i].y,b.radius*(0.5+t*0.6),0,Math.PI*2); ctx.fill(); }
    ctx.shadowColor=b.color; ctx.shadowBlur=18; ctx.fillStyle=b.color; ctx.beginPath(); ctx.arc(b.x,b.y,b.radius,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
  }
  if(isMultiMode()){ for(const o of state.others.values()) drawPlayer(o,false); }
  drawPlayer(state.player, true);
  ctx.restore();
}

// ===========================================================================
// BOSS RENDERING — 10 unique themed silhouettes (one per phase).
// Each model has its own geometry, transforms and motion. Phase index drives
// which renderer is used. The `evolving` flag adds a glowing white halo &
// flicker so the player can see the cinematic transition.
// ===========================================================================
function drawBoss(e){
  const t = state.time;
  const r = e.r;
  const phase = e.bossPhase || 1;
  ctx.save();
  ctx.translate(e.x, e.y);

  // EVOLVING aura (drawn beneath the model)
  if(e.evolving){
    const flick = 0.7 + 0.3 * Math.sin((e.evoT||0) * 28);
    ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 90;
    ctx.fillStyle = withAlpha('#ffffff', 0.18 * flick);
    ctx.beginPath(); ctx.arc(0, 0, r * (2.4 + 0.3*Math.sin((e.evoT||0)*8)), 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = withAlpha(e.col, 0.30 * flick);
    ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
  }
  // UNTOUCHABLE flicker (mid-fight invuln frames during ninja blink/dash)
  if(e.invincible && !e.evolving){
    const flick = 0.45 + 0.55 * Math.sin(t * 38);
    ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 35;
    ctx.fillStyle = withAlpha('#ffffff', 0.22 * flick);
    ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.45 + 0.5 * flick;
  }

  // Outer halo shared by all phases
  const pulse = 1 + Math.sin(t*3)*0.06;
  ctx.shadowColor = e.col; ctx.shadowBlur = 50;
  ctx.fillStyle = withAlpha(e.col, 0.18);
  ctx.beginPath(); ctx.arc(0,0, r*1.55*pulse, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;

  // Dispatch to a phase-specific drawer
  switch(phase){
    case 1:  drawBoss_VoidHerald(e, t, r); break;
    case 2:  drawBoss_CrimsonReaper(e, t, r); break;
    case 3:  drawBoss_SpectralWeaver(e, t, r); break;
    case 4:  drawBoss_IroncladBehemoth(e, t, r); break;
    case 5:  drawBoss_PhaseStalker(e, t, r); break;
    case 6:  drawBoss_StormcallerTyrant(e, t, r); break;
    case 7:  drawBoss_NecrotideEmpress(e, t, r); break;
    case 8:  drawBoss_ForgeOfEndings(e, t, r); break;
    case 9:  drawBoss_ArchonOfSilence(e, t, r); break;
    case 10: drawBoss_OmegaLastGod(e, t, r); break;
    case 11: drawBoss_OmegaReborn(e, t, r); break;
    default: drawBoss_VoidHerald(e, t, r);
  }
  ctx.restore();
}

// ---- Phase 1: Void Herald — floating obelisk with rotating runic ring
function drawBoss_VoidHerald(e, t, r){
  ctx.rotate(t*0.5);
  // Outer rune ring
  for(let i=0;i<10;i++){
    const ang = (i/10)*Math.PI*2;
    const x = Math.cos(ang)*r*1.25, y = Math.sin(ang)*r*1.25;
    ctx.fillStyle = withAlpha(e.col, 0.85);
    ctx.shadowColor = e.col; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(x, y, r*0.10, 0, Math.PI*2); ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.rotate(-t*0.5);
  // Vertical obelisk diamond
  ctx.fillStyle = '#0a0414';
  ctx.strokeStyle = e.col; ctx.lineWidth = 4;
  ctx.shadowColor = e.col; ctx.shadowBlur = 30;
  ctx.beginPath();
  ctx.moveTo(0,-r*1.15); ctx.lineTo(r*0.55,0); ctx.lineTo(0,r*1.15); ctx.lineTo(-r*0.55,0);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Inner glyph
  ctx.shadowBlur = 0;
  ctx.fillStyle = withAlpha('#ffffff', 0.95);
  ctx.beginPath(); ctx.arc(0,0,r*0.15,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = e.col;
  ctx.beginPath(); ctx.arc(0,0,r*0.08,0,Math.PI*2); ctx.fill();
}

// ---- Phase 2: Crimson Reaper — armored skull body w/ orbiting blade
function drawBoss_CrimsonReaper(e, t, r){
  // Orbiting blade
  ctx.save();
  ctx.rotate(t*1.4);
  ctx.translate(r*1.35, 0);
  ctx.fillStyle = withAlpha(e.col, 0.95);
  ctx.shadowColor = e.col; ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.moveTo(-r*0.4, -r*0.06); ctx.lineTo(r*0.5, 0); ctx.lineTo(-r*0.4, r*0.06);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.shadowBlur = 0;
  // Skull body (wider hex)
  ctx.fillStyle = '#150208';
  ctx.strokeStyle = e.col; ctx.lineWidth = 4;
  ctx.shadowColor = e.col; ctx.shadowBlur = 28;
  ctx.beginPath();
  for(let i=0;i<6;i++){
    const a = (i/6)*Math.PI*2 + Math.PI/6;
    const x = Math.cos(a)*r, y = Math.sin(a)*r*0.85;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Two glowing eyes
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(-r*0.28, -r*0.12, r*0.10, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( r*0.28, -r*0.12, r*0.10, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = e.col;
  ctx.beginPath(); ctx.arc(-r*0.28, -r*0.12, r*0.05, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( r*0.28, -r*0.12, r*0.05, 0, Math.PI*2); ctx.fill();
  // Fanged jaw
  ctx.strokeStyle = withAlpha(e.col, 0.9); ctx.lineWidth = 3;
  ctx.beginPath();
  for(let i=0;i<5;i++){
    const x = -r*0.35 + (i*r*0.18);
    ctx.moveTo(x, r*0.1); ctx.lineTo(x + r*0.06, r*0.32);
  }
  ctx.stroke();
}

// ---- Phase 3: Spectral Weaver — crystalline shards orbiting a prism
function drawBoss_SpectralWeaver(e, t, r){
  // Orbiting shards
  ctx.save();
  ctx.rotate(t*0.7);
  for(let i=0;i<8;i++){
    ctx.save();
    ctx.rotate((i/8)*Math.PI*2);
    ctx.translate(r*1.25, 0);
    ctx.rotate(Math.sin(t*1.2 + i)*0.5);
    ctx.fillStyle = withAlpha(e.col, 0.8);
    ctx.shadowColor = e.col; ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(-r*0.18, 0); ctx.lineTo(0, -r*0.14); ctx.lineTo(r*0.32, 0); ctx.lineTo(0, r*0.14);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  ctx.shadowBlur = 0;
  // Prism core (octagon)
  ctx.fillStyle = '#020a14';
  ctx.strokeStyle = e.col; ctx.lineWidth = 4;
  ctx.shadowColor = e.col; ctx.shadowBlur = 30;
  ctx.beginPath();
  for(let i=0;i<8;i++){
    const a = (i/8)*Math.PI*2 + t*0.3;
    const rr = r * (i%2===0 ? 1.0 : 0.78);
    const x = Math.cos(a)*rr, y = Math.sin(a)*rr;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Inner refracting eye
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(0,0,r*0.22,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = e.col;
  ctx.beginPath(); ctx.arc(Math.cos(t*2)*r*0.08, Math.sin(t*2)*r*0.08, r*0.10, 0, Math.PI*2); ctx.fill();
}

// ---- Phase 4: Ironclad Behemoth — armored brute with shoulder pauldrons
function drawBoss_IroncladBehemoth(e, t, r){
  const sway = Math.sin(t*1.6)*0.06;
  ctx.rotate(sway);
  // Pauldrons
  ctx.fillStyle = withAlpha(e.col, 0.9);
  ctx.shadowColor = e.col; ctx.shadowBlur = 24;
  ctx.beginPath(); ctx.arc(-r*0.95, -r*0.55, r*0.45, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( r*0.95, -r*0.55, r*0.45, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;
  // Body — armored block
  ctx.fillStyle = '#1a0d04';
  ctx.strokeStyle = e.col; ctx.lineWidth = 5;
  ctx.shadowColor = e.col; ctx.shadowBlur = 20;
  roundRect(-r*0.85, -r*0.55, r*1.7, r*1.4, r*0.18);
  ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  // Plates / ridges
  for(let i=0;i<3;i++){
    ctx.fillStyle = withAlpha(e.col, 0.5);
    ctx.fillRect(-r*0.7, -r*0.30 + i*r*0.30, r*1.4, r*0.06);
  }
  // Visor (glowing slit)
  ctx.shadowColor = e.col; ctx.shadowBlur = 30;
  ctx.fillStyle = e.col;
  ctx.fillRect(-r*0.55, -r*0.46, r*1.1, r*0.10);
  ctx.shadowBlur = 0;
}

// ---- Phase 5: Phase Stalker — flickering ghost-shadow with twin daggers
function drawBoss_PhaseStalker(e, t, r){
  const phase = ((Math.sin(t*7) + 1) * 0.5);
  // Echo trails (3 copies fading)
  for(let i=3;i>=1;i--){
    const off = Math.sin(t*4 + i)* r*0.35;
    ctx.fillStyle = withAlpha(e.col, 0.10 * i);
    ctx.beginPath(); ctx.arc(off, 0, r*0.95, 0, Math.PI*2); ctx.fill();
  }
  // Body — stretched hex
  ctx.fillStyle = '#001f12';
  ctx.strokeStyle = e.col; ctx.lineWidth = 4;
  ctx.shadowColor = e.col; ctx.shadowBlur = 30 + phase*15;
  ctx.beginPath();
  for(let i=0;i<6;i++){
    const a = (i/6)*Math.PI*2;
    const x = Math.cos(a)*r*0.95, y = Math.sin(a)*r*1.1;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  // Twin glowing daggers crossed
  ctx.save();
  ctx.rotate(Math.PI/4 + Math.sin(t*2)*0.2);
  ctx.fillStyle = withAlpha(e.col, 0.95);
  ctx.fillRect(-r*0.04, -r*1.25, r*0.08, r*2.5);
  ctx.rotate(-Math.PI/2);
  ctx.fillRect(-r*0.04, -r*1.25, r*0.08, r*2.5);
  ctx.restore();
  // Hollow eye
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(0,0,r*0.16,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(0,0,r*0.07,0,Math.PI*2); ctx.fill();
}

// ---- Phase 6: Stormcaller Tyrant — crowned electric sun with arcs
function drawBoss_StormcallerTyrant(e, t, r){
  // Crown spikes
  ctx.save();
  ctx.rotate(t*0.4);
  for(let i=0;i<12;i++){
    ctx.save();
    ctx.rotate((i/12)*Math.PI*2);
    ctx.fillStyle = withAlpha(e.col, 0.9);
    ctx.shadowColor = e.col; ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.moveTo(0, -r*1.0);
    ctx.lineTo(r*0.10, -r*1.45);
    ctx.lineTo(-r*0.10, -r*1.45);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  ctx.shadowBlur = 0;
  // Body
  ctx.fillStyle = '#1a1100';
  ctx.strokeStyle = e.col; ctx.lineWidth = 4;
  ctx.shadowColor = e.col; ctx.shadowBlur = 30;
  ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  // Lightning arcs across body
  ctx.strokeStyle = withAlpha('#ffffff', 0.85);
  ctx.lineWidth = 2;
  for(let i=0;i<3;i++){
    ctx.beginPath();
    let x = -r*0.7, y = (Math.random()-0.5)*r*0.4;
    ctx.moveTo(x, y);
    for(let s=0;s<6;s++){ x += r*0.25; y += (Math.random()-0.5)*r*0.3; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // Bright core
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 30;
  ctx.beginPath(); ctx.arc(0,0,r*0.20,0,Math.PI*2); ctx.fill();
}

// ---- Phase 7: Necrotide Empress — tentacled core with floating veil
function drawBoss_NecrotideEmpress(e, t, r){
  // Tentacles (6 wavy arms)
  ctx.strokeStyle = withAlpha(e.col, 0.85);
  ctx.lineWidth = r*0.10;
  ctx.shadowColor = e.col; ctx.shadowBlur = 20;
  for(let i=0;i<6;i++){
    const baseAng = (i/6)*Math.PI*2 + t*0.3;
    ctx.beginPath();
    let prevX=0, prevY=0;
    ctx.moveTo(prevX, prevY);
    for(let s=1;s<=8;s++){
      const wave = Math.sin(t*3 + i + s*0.6);
      const ang = baseAng + wave*0.25;
      const dist = r*0.25 * s;
      prevX = Math.cos(ang)*dist; prevY = Math.sin(ang)*dist;
      ctx.lineTo(prevX, prevY);
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  // Core
  ctx.fillStyle = '#0c001f';
  ctx.strokeStyle = e.col; ctx.lineWidth = 4;
  ctx.shadowColor = e.col; ctx.shadowBlur = 30;
  ctx.beginPath(); ctx.arc(0,0,r*0.85,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  // Floating crown of dots
  for(let i=0;i<8;i++){
    const a = (i/8)*Math.PI*2 - t*0.6;
    ctx.fillStyle = withAlpha(e.col, 0.9);
    ctx.beginPath(); ctx.arc(Math.cos(a)*r*0.55, Math.sin(a)*r*0.55, r*0.06, 0, Math.PI*2); ctx.fill();
  }
  // Multi-eye cluster
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(0,0, r*0.18, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = e.col;
  for(let i=0;i<3;i++){
    const a = (i/3)*Math.PI*2 + t*1.2;
    ctx.beginPath(); ctx.arc(Math.cos(a)*r*0.07, Math.sin(a)*r*0.07, r*0.05, 0, Math.PI*2); ctx.fill();
  }
}

// ---- Phase 8: Forge of Endings — anvil colossus with rotating gears
function drawBoss_ForgeOfEndings(e, t, r){
  // Outer gear teeth ring
  ctx.save(); ctx.rotate(t*0.5);
  ctx.fillStyle = withAlpha(e.col, 0.85);
  ctx.shadowColor = e.col; ctx.shadowBlur = 22;
  const teeth = 18;
  for(let i=0;i<teeth;i++){
    ctx.save(); ctx.rotate((i/teeth)*Math.PI*2);
    ctx.fillRect(-r*0.06, -r*1.32, r*0.12, r*0.20);
    ctx.restore();
  }
  ctx.restore();
  ctx.shadowBlur = 0;
  // Anvil body (top trapezoid + base)
  ctx.fillStyle = '#1a0a00';
  ctx.strokeStyle = e.col; ctx.lineWidth = 4;
  ctx.shadowColor = e.col; ctx.shadowBlur = 25;
  ctx.beginPath();
  ctx.moveTo(-r*0.95, -r*0.55);
  ctx.lineTo( r*0.95, -r*0.55);
  ctx.lineTo( r*0.65,  r*0.10);
  ctx.lineTo( r*0.85,  r*0.85);
  ctx.lineTo(-r*0.85,  r*0.85);
  ctx.lineTo(-r*0.65,  r*0.10);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  // Forge mouth (glowing horizontal slot)
  ctx.fillStyle = '#ffd166';
  ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 30;
  roundRect(-r*0.55, -r*0.35, r*1.1, r*0.30, r*0.08);
  ctx.fill();
  // Inner inferno glints
  ctx.fillStyle = '#fff';
  for(let i=0;i<5;i++){
    const x = -r*0.5 + i*r*0.25 + Math.sin(t*4+i)*r*0.05;
    ctx.beginPath(); ctx.arc(x, -r*0.20, r*0.04, 0, Math.PI*2); ctx.fill();
  }
  ctx.shadowBlur = 0;
  // Two side hammer-spikes
  ctx.fillStyle = withAlpha(e.col, 0.9);
  ctx.beginPath();
  ctx.moveTo(-r*1.05, r*0.4); ctx.lineTo(-r*0.7, r*0.55); ctx.lineTo(-r*1.05, r*0.7);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo( r*1.05, r*0.4); ctx.lineTo( r*0.7, r*0.55); ctx.lineTo( r*1.05, r*0.7);
  ctx.closePath(); ctx.fill();
}

// ---- Phase 9: Archon of Silence — winged halo with star-of-spokes
function drawBoss_ArchonOfSilence(e, t, r){
  // Wings (two arcs)
  ctx.strokeStyle = withAlpha(e.col, 0.9);
  ctx.lineWidth = r*0.10;
  ctx.shadowColor = e.col; ctx.shadowBlur = 25;
  ctx.beginPath();
  ctx.arc(-r*0.6, 0, r*1.3, -Math.PI*0.45, Math.PI*0.45, true); ctx.stroke();
  ctx.beginPath();
  ctx.arc( r*0.6, 0, r*1.3, Math.PI - Math.PI*0.45, Math.PI + Math.PI*0.45); ctx.stroke();
  ctx.shadowBlur = 0;
  // Halo
  ctx.save(); ctx.rotate(t*0.35);
  ctx.strokeStyle = withAlpha('#ffffff', 0.85);
  ctx.lineWidth = 3;
  ctx.shadowColor = e.col; ctx.shadowBlur = 28;
  ctx.beginPath(); ctx.arc(0, -r*1.05, r*0.45, 0, Math.PI*2); ctx.stroke();
  ctx.restore();
  ctx.shadowBlur = 0;
  // Body — tall hex
  ctx.fillStyle = '#001a1f';
  ctx.strokeStyle = e.col; ctx.lineWidth = 4;
  ctx.shadowColor = e.col; ctx.shadowBlur = 32;
  ctx.beginPath();
  ctx.moveTo(0, -r); ctx.lineTo(r*0.8, -r*0.4); ctx.lineTo(r*0.7, r*0.85);
  ctx.lineTo(-r*0.7, r*0.85); ctx.lineTo(-r*0.8, -r*0.4); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  // Star of spokes inside
  ctx.save(); ctx.rotate(-t*0.6);
  for(let i=0;i<8;i++){
    ctx.save(); ctx.rotate((i/8)*Math.PI*2);
    ctx.strokeStyle = withAlpha(e.col, 0.7); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0, -r*0.55); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  // Sealed eye (vertical slit)
  ctx.fillStyle = e.col; ctx.shadowColor = e.col; ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.ellipse(0, 0, r*0.06, r*0.20, 0, 0, Math.PI*2); ctx.fill();
}

// ---- Phase 10: OMEGA — radiant 8-pointed star with rotating ring + counter-ring
function drawBoss_OmegaLastGod(e, t, r){
  // Two counter-rotating spike rings
  for(let layer=0; layer<2; layer++){
    ctx.save();
    ctx.rotate((layer===0 ? 1 : -1) * t * (0.5 + layer*0.4));
    const rings = 14;
    for(let i=0;i<rings;i++){
      ctx.save();
      ctx.rotate((i/rings)*Math.PI*2);
      ctx.fillStyle = withAlpha(e.col, layer===0 ? 0.85 : 0.6);
      ctx.shadowColor = e.col; ctx.shadowBlur = 26;
      ctx.beginPath();
      ctx.moveTo(r*1.05, 0);
      ctx.lineTo(r*(1.55+layer*0.2), -r*0.10);
      ctx.lineTo(r*(1.55+layer*0.2),  r*0.10);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
  ctx.shadowBlur = 0;
  // 8-pointed star body
  ctx.fillStyle = '#15001a';
  ctx.strokeStyle = e.col; ctx.lineWidth = 5;
  ctx.shadowColor = e.col; ctx.shadowBlur = 35;
  ctx.beginPath();
  const pts = 16;
  for(let i=0;i<pts;i++){
    const a = (i/pts)*Math.PI*2 + t*0.3;
    const rr = (i%2===0) ? r : r*0.55;
    const x = Math.cos(a)*rr, y = Math.sin(a)*rr;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  // Inner sigil
  ctx.save(); ctx.rotate(-t*1.2);
  for(let i=0;i<6;i++){
    ctx.rotate(Math.PI/3);
    ctx.strokeStyle = withAlpha('#ffffff', 0.85); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(r*0.55, 0); ctx.stroke();
  }
  ctx.restore();
  // Burning core (white→pink)
  ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 50;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(0,0,r*0.22,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = e.col;
  ctx.beginPath(); ctx.arc(0,0,r*0.13,0,Math.PI*2); ctx.fill();
}

// ---- Phase 11: OMEGA REBORN — humanoid god-form (ninja/assassin)
// Slightly larger than a hero (player r is ~16, this draws around r=46) but
// distinctly NOT a player look-alike: head + tapered torso, cape, pauldrons,
// glowing visor, halo crown, sword arm aimed at the player.
function drawBoss_OmegaReborn(e, t, r){
  const bob = Math.sin(t*3) * r * 0.06;
  ctx.translate(0, bob);

  // Soft inner aura
  const aFlick = 0.55 + 0.45 * Math.sin(t * 7);
  ctx.shadowColor = e.col; ctx.shadowBlur = 60;
  ctx.fillStyle = withAlpha(e.col, 0.18 * aFlick);
  ctx.beginPath(); ctx.arc(0, 0, r * 1.8, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;

  // Cape behind the body — bottom hem sways
  ctx.fillStyle = withAlpha('#10001a', 0.92);
  ctx.beginPath();
  ctx.moveTo(-r*0.55, -r*0.20);
  ctx.lineTo( r*0.55, -r*0.20);
  ctx.lineTo( r*0.85,  r*1.40 + Math.sin(t*4    ) * r*0.10);
  ctx.lineTo(-r*0.85,  r*1.40 + Math.sin(t*4 + 1) * r*0.10);
  ctx.closePath(); ctx.fill();

  // Legs
  ctx.fillStyle = withAlpha(e.col, 0.85);
  ctx.shadowColor = e.col; ctx.shadowBlur = 18;
  ctx.fillRect(-r*0.32, r*0.45, r*0.22, r*0.85);
  ctx.fillRect( r*0.10, r*0.45, r*0.22, r*0.85);
  ctx.shadowBlur = 0;

  // Torso (tapered trapezoid)
  ctx.fillStyle = '#0a0210';
  ctx.strokeStyle = e.col; ctx.lineWidth = 3;
  ctx.shadowColor = e.col; ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.moveTo(-r*0.45, -r*0.20);
  ctx.lineTo( r*0.45, -r*0.20);
  ctx.lineTo( r*0.36,  r*0.55);
  ctx.lineTo(-r*0.36,  r*0.55);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;

  // Sash / belt accent
  ctx.fillStyle = withAlpha(e.col, 0.85);
  ctx.fillRect(-r*0.40, r*0.30, r*0.80, r*0.07);

  // Shoulder pauldrons (small triangles)
  ctx.fillStyle = withAlpha(e.col, 0.95);
  ctx.shadowColor = e.col; ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(-r*0.55, -r*0.25); ctx.lineTo(-r*0.30, -r*0.25); ctx.lineTo(-r*0.42, -r*0.05);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo( r*0.55, -r*0.25); ctx.lineTo( r*0.30, -r*0.25); ctx.lineTo( r*0.42, -r*0.05);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;

  // Off-hand arm (simple line down)
  ctx.strokeStyle = withAlpha(e.col, 0.9);
  ctx.lineWidth = r * 0.12;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-r*0.40, -r*0.05); ctx.lineTo(-r*0.55, r*0.40); ctx.stroke();

  // Sword arm — angled toward the player so the blade tracks them
  let aimAng = 0;
  if(state.player){ aimAng = Math.atan2(state.player.y - e.y, state.player.x - e.x); }
  ctx.save();
  ctx.translate(r*0.40, -r*0.05);
  ctx.rotate(aimAng);
  // Arm
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r*0.65, 0); ctx.stroke();
  // Hilt + guard
  ctx.fillStyle = e.col;
  ctx.fillRect(r*0.55, -r*0.10, r*0.10, r*0.20);
  // Blade
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.moveTo(r*0.65, -r*0.06);
  ctx.lineTo(r*1.55, -r*0.025);
  ctx.lineTo(r*1.70,  0);
  ctx.lineTo(r*1.55,  r*0.025);
  ctx.lineTo(r*0.65,  r*0.06);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  // Head (small circle)
  ctx.fillStyle = '#08010c';
  ctx.strokeStyle = e.col; ctx.lineWidth = 2.5;
  ctx.shadowColor = e.col; ctx.shadowBlur = 24;
  ctx.beginPath(); ctx.arc(0, -r*0.45, r*0.30, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;

  // Glowing horizontal visor
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 22;
  ctx.fillRect(-r*0.20, -r*0.50, r*0.40, r*0.07);
  ctx.shadowBlur = 0;

  // Floating halo crown above the head
  ctx.save();
  ctx.translate(0, -r*0.95);
  ctx.rotate(t * 0.8);
  ctx.strokeStyle = withAlpha('#ffffff', 0.9);
  ctx.lineWidth = 2;
  ctx.shadowColor = e.col; ctx.shadowBlur = 22;
  ctx.beginPath(); ctx.arc(0, 0, r*0.34, 0, Math.PI*2); ctx.stroke();
  // Halo notches
  for(let i=0;i<4;i++){
    const a = (i/4)*Math.PI*2;
    const x = Math.cos(a)*r*0.34, y = Math.sin(a)*r*0.34;
    ctx.fillStyle = withAlpha('#ffffff', 0.95);
    ctx.beginPath(); ctx.arc(x, y, r*0.05, 0, Math.PI*2); ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.restore();

  // Trailing afterimage echoes (only when invincible / blinking)
  if(e.invincible){
    for(let i=1;i<=3;i++){
      const off = Math.sin(t*5 + i)*r*0.4;
      ctx.fillStyle = withAlpha('#ffffff', 0.06 * (4-i));
      ctx.beginPath(); ctx.arc(off, 0, r*0.55, 0, Math.PI*2); ctx.fill();
    }
  }
}

// Small helper used by some boss models
function roundRect(x, y, w, h, r){
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y,   x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x,   y+h, rr);
  ctx.arcTo(x,   y+h, x,   y,   rr);
  ctx.arcTo(x,   y,   x+w, y,   rr);
  ctx.closePath();
}

function drawPlayer(p, local){
  if(!p) return;
  const h = HEROES[p.heroId]; if(!h) return;
  if(p.downed){
    ctx.save();
    ctx.strokeStyle = withAlpha('#ff3d6a', 0.85);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = withAlpha('#ff3d6a', 0.18);
    ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font='bold 11px ui-monospace,monospace'; ctx.textAlign='center';
    ctx.fillText('DOWN', p.x, p.y+4);
    ctx.fillText(p.name||'P', p.x, p.y-26);
    if(!local && state.reviveTarget === p && state.reviveHoldTime > 0){
      const t = Math.min(1, state.reviveHoldTime / REVIVE_HOLD_SECONDS);
      ctx.strokeStyle = '#3dffb0'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(p.x, p.y, 24, -Math.PI/2, -Math.PI/2 + t*Math.PI*2); ctx.stroke();
      ctx.fillStyle = '#3dffb0'; ctx.font='10px ui-monospace,monospace';
      ctx.fillText('REVIVING…', p.x, p.y+34);
    } else if(local){
      ctx.fillStyle = '#ff8a3d'; ctx.font='10px ui-monospace,monospace';
      ctx.fillText('WAITING FOR REVIVE', p.x, p.y+34);
    } else {
      ctx.fillStyle = '#ffd166'; ctx.font='10px ui-monospace,monospace';
      ctx.fillText('HOLD E TO REVIVE', p.x, p.y+34);
    }
    ctx.restore();
    return;
  }
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
  if(!isGodMode() && state.fracture>=1){ const a=Math.min(0.18,0.04*state.fracture); ctx.fillStyle=`rgba(255,43,214,${a})`; ctx.fillRect(0,0,W,H); }
}

function withAlpha(hex,a){ if(!hex) return `rgba(255,255,255,${a})`; const m=hex.replace('#',''); const r=parseInt(m.slice(0,2),16),g=parseInt(m.slice(2,4),16),b=parseInt(m.slice(4,6),16); return `rgba(${r},${g},${b},${a})`; }

// ---------- Upgrade picker (classic mode only) ----------
function showUpgradePicker(){
  if(isGodMode()) return; // God Mode uses floor pickups instead
  const modal = document.getElementById('upgrade');
  if(!modal) return;
  if(state.upgradeChosenForWave === state.wave) return;
  if(state.upgradeOpenForWave === state.wave && modal.style.display === 'flex') return;
  state.upgradeOpenForWave = state.wave;
  const waveAtOpen = state.wave;
  const choices = pickN(UPGRADES, 3);
  const wrap = $('#ucards'); wrap.innerHTML='';
  choices.forEach(u=>{
    const el=document.createElement('div');
    el.className='ucard';
    el.innerHTML=`<h4>${u.name}</h4><p>${u.desc}</p>`;
    el.onclick=()=>{
      u.apply(state.player);
      state.upgradeChosenForWave = waveAtOpen;
      hideUpgrade();
      toast(`Acquired: ${u.name}`);
      if(canAuthorEnemies()) startWavePrep(state.wave + 1);
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
  state.upgradeOpenForWave = 0;
}

// ---------- Revive system (multiplayer) ----------
const REVIVE_HOLD_SECONDS = 2.5;
const REVIVE_RANGE = 38;

function findDownedTeammateNear(p){
  let best = null, bd = Infinity;
  for(const o of state.others.values()){
    if(!o || !o.downed) continue;
    const d = Math.hypot((o.x||0) - p.x, (o.y||0) - p.y);
    if(d < REVIVE_RANGE && d < bd){ best = o; bd = d; }
  }
  return best;
}

function updateReviveInteraction(p, dt){
  if(!p || !p.alive || p.downed){
    state.reviveTarget = null; state.reviveHoldTime = 0;
    const rb = document.getElementById('tRevive'); if(rb) rb.style.display = 'none';
    return;
  }
  const target = findDownedTeammateNear(p);
  const rb = document.getElementById('tRevive');
  if(rb && IS_TOUCH) rb.style.display = target ? 'flex' : 'none';
  if(!target){ state.reviveTarget = null; state.reviveHoldTime = 0; return; }
  if(keys['e']){
    if(state.reviveTarget !== target){ state.reviveTarget = target; state.reviveHoldTime = 0; }
    state.reviveHoldTime += dt;
    if(Math.random() < 0.5) particles(target.x, target.y, '#3dffb0', 1, 60, 0.4, 2);
    if(state.reviveHoldTime >= REVIVE_HOLD_SECONDS){
      try{ activeRoom && activeRoom.send('revive', { targetId: target.id }); }catch(e){}
      target.downed = false; target.alive = true;
      target.hp = Math.max(target.hp || 0, (target.hpMax||100) * 0.5);
      toast(`Revived ${target.name||'teammate'}`);
      state.reviveTarget = null; state.reviveHoldTime = 0;
    }
  } else { state.reviveHoldTime = 0; state.reviveTarget = target; }
}

function handleReviveMessage(msg){
  if(!msg || !msg.targetId) return;
  if(msg.targetId === state.mySessionId){
    const p = state.player;
    if(p){
      p.downed = false; p.alive = true;
      p.hp = Math.max(1, (p.hpMax||100) * 0.5);
      state.beingRevivedTime = 1.2;
      toast('You were revived!');
      try{ broadcastTick(1); }catch(e){}
    }
    return;
  }
  const o = state.others.get(msg.targetId);
  if(o){ o.downed = false; o.alive = true; o.hp = Math.max(o.hp||0, (o.hpMax||100) * 0.5); }
}
function pickN(arr,n){ const a=arr.slice(),out=[]; while(out.length<n && a.length){ out.push(a.splice(Math.floor(Math.random()*a.length),1)[0]); } return out; }

// ============================================================
// COLYSEUS MULTIPLAYER
// ============================================================
function applyRemoteCombat(other, act){
  if(!state.isHost || !other || !act) return;
  const h = HEROES[other.heroId] || HEROES.james;
  const mods = Object.assign(makeDefaultMods(), other.mods || {});
  const ang = (typeof act.a === 'number') ? act.a : (other.angle || 0);
  if(act.t === 'atk'){
    const dmg = h.dmg * mods.dmg;
    const range = h.range * mods.range;
    if(other.heroId==='james'){
      for(const e of state.enemies){ const dx=e.x-other.x,dy=e.y-other.y,d=Math.hypot(dx,dy); if(d<range+(e.r||0)){ const a=Math.atan2(dy,dx); let da=Math.atan2(Math.sin(a-ang),Math.cos(a-ang)); if(Math.abs(da)<1.0){ damageEnemy(e,dmg,other); } } }
    } else if(other.heroId==='jeff'){
      for(const e of state.enemies){ const dx=e.x-other.x,dy=e.y-other.y,d=Math.hypot(dx,dy); if(d<range+(e.r||0)){ const a=Math.atan2(dy,dx); let da=Math.atan2(Math.sin(a-ang),Math.cos(a-ang)); if(Math.abs(da)<0.7){ damageEnemy(e,dmg,other); } } }
    } else {
      const speed = other.heroId==='joross'?720:(other.heroId==='jake'?520:600);
      const radius = other.heroId==='jake'?9:(other.heroId==='jeb'?7:5);
      spawnBullet({x:other.x+Math.cos(ang)*18,y:other.y+Math.sin(ang)*18,vx:Math.cos(ang)*speed,vy:Math.sin(ang)*speed,dmg,owner:other.id,color:h.color,radius,life:range/speed*1.05,piercing:other.heroId==='jake'?1:0,heal:other.heroId==='jeb'?dmg*0.4:0});
    }
  } else if(act.t === 'abi'){
    if(other.heroId==='james'){
      for(const e of state.enemies){ if(Math.hypot(e.x-other.x,e.y-other.y)<140+(e.r||0)) damageEnemy(e,h.dmg*1.4*mods.dmg,other); }
    } else if(other.heroId==='jake'){
      const ring=24;
      for(let i=0;i<ring;i++){ const a=(i/ring)*Math.PI*2; spawnBullet({x:other.x,y:other.y,vx:Math.cos(a)*420,vy:Math.sin(a)*420,dmg:h.dmg*1.2*mods.dmg,owner:other.id,color:h.color,radius:8,life:0.9,piercing:2}); }
    } else if(other.heroId==='jeff'){
      const dx=Math.cos(ang)*180, dy=Math.sin(ang)*180;
      for(const e of state.enemies){ const ax=e.x-other.x,ay=e.y-other.y; const t=Math.max(0,Math.min(1,(ax*dx+ay*dy)/(dx*dx+dy*dy))); const px=other.x+dx*t, py=other.y+dy*t; if(Math.hypot(e.x-px,e.y-py)<40+(e.r||0)) damageEnemy(e,h.dmg*1.8*mods.dmg,other); }
    }
  }
}

let lastEnemyBroadcast = 0;
function broadcastEnemyState(dt){
  if(!activeRoom || !state.isHost) return;
  lastEnemyBroadcast += dt;
  if(lastEnemyBroadcast < 0.05) return;
  lastEnemyBroadcast = 0;
  try{
    activeRoom.send('enemyState', {
      wave: state.wave,
      wavePhase: state.wavePhase,
      waveTimer: +state.waveTimer.toFixed(2),
      waveToSpawn: state.waveToSpawn,
      waveEnemiesAlive: state.waveEnemiesAlive,
      fracture: state.fracture,
      enemies: state.enemies.map(serializeEnemy),
      // GOD MODE sync
      god: isGodMode() && state.god ? { phase: state.god.phase, mode: state.god.mode, timer: +state.god.timer.toFixed(2) } : null,
    });
  }catch(e){}
}

function applyEnemyState(msg){
  if(!msg || state.isHost) return;
  const prevPhase = state.wavePhase;
  const prevWave = state.wave;
  if(typeof msg.wave === 'number') state.wave = msg.wave;
  if(typeof msg.wavePhase === 'string') state.wavePhase = msg.wavePhase;
  if(typeof msg.waveTimer === 'number') state.waveTimer = msg.waveTimer;
  if(typeof msg.waveToSpawn === 'number') state.waveToSpawn = msg.waveToSpawn;
  if(typeof msg.waveEnemiesAlive === 'number') state.waveEnemiesAlive = msg.waveEnemiesAlive;
  if(typeof msg.fracture === 'number') state.fracture = msg.fracture;

  // God Mode sync (joiner side)
  if(msg.god && isGodMode()){
    if(!state.god){ state.god = { phase:1, boss:null, mode:'fight', timer:0, pickupTimer:99, skillCooldowns:{}, skillIndex:0, bossTelegraphCooldown:99 }; }
    const prevP = state.god.phase;
    state.god.phase = msg.god.phase;
    if(state.god.mode !== msg.god.mode){
      const newMode = msg.god.mode;
      if(newMode === 'intro' && msg.god.phase !== prevP){
        const pd = BOSS_PHASES[msg.god.phase-1];
        if(pd){ showGodIntro(`PHASE ${msg.god.phase} / 10`, pd.name, pd.title, msg.god.phase>=8?'S++ BOSS':(msg.god.phase>=5?'S+ BOSS':'S BOSS')); SFX.playMusic(pd.music||'god'); }
      }
      state.god.mode = newMode;
    }
    state.god.timer = msg.god.timer;
  }

  const existing = new Map(state.enemies.map(e => [e.id, e]));
  const next = [];
  const incoming = Array.isArray(msg.enemies) ? msg.enemies : [];
  for(const raw of incoming){
    let e = existing.get(raw.id);
    if(!e){
      e = makeEnemy(raw);
      e.x = raw.x; e.y = raw.y; e.rx = raw.x; e.ry = raw.y;
      if(e.isBoss && isGodMode()){
        const pd = BOSS_PHASES[(e.bossPhase||1)-1];
        if(pd) showBossBar(pd.name);
      }
    } else {
      e.type = raw.type || e.type;
      e.hp = raw.hp;
      e.hpMax = raw.hpMax;
      e.sp = raw.sp;
      e.r = raw.r;
      e.dmg = raw.dmg;
      e.col = raw.col;
      e.cd = raw.cd || 0;
      e.jitter = raw.jitter || 0;
      e.fromWave = raw.fromWave;
      e.isBoss = !!raw.isBoss;
      e.isMinion = !!raw.isMinion;
      e.bossPhase = raw.bossPhase || 0;
      const gap = Math.hypot((raw.x||0)-e.x, (raw.y||0)-e.y);
      if(gap > 180){ e.x = raw.x; e.y = raw.y; }
      e.rx = raw.x; e.ry = raw.y;
    }
    if(e.isBoss) updateBossBarFill(e.hp, e.hpMax);
    next.push(e);
  }
  // Detect boss disappearing -> hide bar
  const hadBoss = state.enemies.some(e=>e.isBoss);
  const hasBoss = next.some(e=>e.isBoss);
  if(hadBoss && !hasBoss) hideBossBar();
  state.enemies = next;

  if(state.scene !== 'game') return;
  if(state.wave > prevWave){
    if(state.upgradeChosenForWave && state.upgradeChosenForWave < state.wave){
      state.upgradeChosenForWave = 0;
    }
    state.upgradeOpenForWave = 0;
  }
  if(!isGodMode() && (prevPhase !== state.wavePhase || prevWave !== state.wave)){
    if(state.wavePhase === 'prep'){
      showWaveBanner(`WAVE ${state.wave}`, 'PREPARE', 1200);
    } else if(state.wavePhase === 'active'){
      hideWaveBanner();
      showWaveBanner(`WAVE ${state.wave}`, 'FIGHT!', 1200);
    } else if(state.wavePhase === 'upgrade'){
      showWaveBanner(`WAVE ${state.wave} CLEARED`, 'CHOOSE UPGRADE', 1500);
      if(state.upgradeChosenForWave !== state.wave){
        const modal = document.getElementById('upgrade');
        if(modal && modal.style.display !== 'flex') showUpgradePicker();
      }
    }
  }
}

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
    const opts = { name: state.username || 'Operator', heroId: state.hero, ...options };
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

    if(activeRoom.state.players && typeof activeRoom.state.players.onRemove === 'function'){
      activeRoom.state.players.onRemove((_p, id) => {
        if(state.others && state.others.has(id)){
          if(state.reviveTarget && state.reviveTarget.id === id){ state.reviveTarget = null; state.reviveHoldTime = 0; }
          state.others.delete(id);
        }
      });
    }

    activeRoom.onMessage('countdown', (msg) => {
      state.lobby.countdown = msg.n || 0;
      if(msg.cancelled || !msg.n){ setCountdownText(''); renderLobby(); }
      else { setCountdownText(msg.n > 0 ? msg.n : 'GO'); }
    });

    activeRoom.onMessage('startGame', (msg) => {
      console.log('[net] startGame received', msg);
      setCountdownText('');
      try{ startGame(state.mode === 'godmulti' ? 'godmulti' : 'multi'); }
      catch(e){ console.error('startGame failed:', e); alert('startGame error: '+e.message); }
    });

    activeRoom.onMessage('playerState', (msg) => applyRemoteState(msg));
    activeRoom.onMessage('enemyState', (msg) => applyEnemyState(msg));

    activeRoom.onMessage('hostMigrated', (msg) => {
      const wasHost = state.isHost;
      state.isHost = (msg && msg.hostId === state.mySessionId);
      if(state.isHost && !wasHost){
        state.bullets = state.bullets.filter(b => b.owner !== state.player.id);
        toast('You are now the host', 1800);
      }
    });
    activeRoom.onMessage('revive', (msg) => handleReviveMessage(msg));

    activeRoom.onLeave(() => { console.log('[net] left room'); });
    activeRoom.onError((code, message) => { console.error('[net] room error', code, message); alert('Room error: '+message); });

  } catch(e){
    console.error('Connection error:', e);
    alert("Can\u0027t connect to the game server. It may be waking up — try again in a few seconds.\n\nDetails: "+e.message);
    setScene('mpMenu');
  }
}

async function quickJoinPublic(){ await joinRoom('battle_room', {}); if(activeRoom) toast('Joined public room ' + activeRoom.id, 2500); }

const PENDING_ACTIONS = [];
function queueAction(a){
  if(!isMultiMode() || !activeRoom) return;
  PENDING_ACTIONS.push(a);
  if(PENDING_ACTIONS.length>32) PENDING_ACTIONS.splice(0, PENDING_ACTIONS.length-32);
}
let lastBroadcast = 0;
function broadcastTick(dt){
  if(!activeRoom) return;
  lastBroadcast += dt;
  if(lastBroadcast < 0.05 && PENDING_ACTIONS.length === 0) return;
  lastBroadcast = 0;
  const p = state.player;
  try{
    const payload = {
      name: p.name, heroId: p.heroId,
      x: p.x|0, y: p.y|0, angle: +p.angle.toFixed(2),
      hp: Math.ceil(p.hp), hpMax: p.hpMax, alive: p.alive, downed: !!p.downed,
      dashing: p.dashing>0 ? 1 : 0,
      mods: p.mods,
      ts: Date.now(),
    };
    if(PENDING_ACTIONS.length){ payload.actions = PENDING_ACTIONS.slice(); PENDING_ACTIONS.length = 0; }
    activeRoom.send('playerState', payload);
  }catch(e){}
}

function playRemoteAction(other, act, opts={}){
  if(!other || !act) return;
  const h = HEROES[other.heroId] || HEROES.james;
  const ang = (typeof act.a === 'number') ? act.a : (other.angle||0);
  const authoritativeProjectiles = !!opts.authoritativeProjectiles;
  if(act.t === 'dash'){
    SFX.dashRemote();
    particles(other.x, other.y, h.color, 14, 200, 0.4, 2);
  } else if(act.t === 'atk'){
    SFX.fireRemote(other.heroId);
    if(other.heroId==='james'){
      const range = h.range;
      for(let i=0;i<10;i++){ const t=i/10, a=ang-1+t*2; state.fx.push({x:other.x+Math.cos(a)*range*0.7,y:other.y+Math.sin(a)*range*0.7,vx:0,vy:0,life:0.18,life0:0.18,color:h.color,r:4}); }
    } else if(other.heroId==='jeff'){
      for(let i=0;i<6;i++) state.fx.push({x:other.x+Math.cos(ang)*i*8,y:other.y+Math.sin(ang)*i*8,vx:0,vy:0,life:0.15,life0:0.15,color:h.color,r:3});
    } else if(!authoritativeProjectiles) {
      const speed = other.heroId==='joross'?720:(other.heroId==='jake'?520:600);
      const radius = other.heroId==='jake'?9:(other.heroId==='jeb'?7:5);
      const range = h.range;
      state.bullets.push({x:other.x+Math.cos(ang)*18,y:other.y+Math.sin(ang)*18,vx:Math.cos(ang)*speed,vy:Math.sin(ang)*speed,dmg:0,owner:other.id,color:h.color,radius,life:range/speed*1.05,piercing:99,trail:[],ghost:true});
    }
  } else if(act.t === 'abi'){
    SFX.abilityRemote(other.heroId);
    if(other.heroId==='james'){ particles(other.x,other.y,h.color,40,300,0.6,3); }
    else if(other.heroId==='jake'){
      const ring=24;
      if(!authoritativeProjectiles){ for(let i=0;i<ring;i++){ const a=(i/ring)*Math.PI*2; state.bullets.push({x:other.x,y:other.y,vx:Math.cos(a)*420,vy:Math.sin(a)*420,dmg:0,owner:other.id,color:h.color,radius:8,life:0.9,piercing:99,trail:[],ghost:true}); } }
      particles(other.x,other.y,h.color,40,260,0.7,3);
    } else if(other.heroId==='jeb'){
      particles(other.x,other.y,'#3dffb0',60,220,0.9,3);
      state.fx.push({x:other.x,y:other.y,vx:0,vy:0,life:4,life0:4,color:'#3dffb0',r:160,ring:true,heal:true,owner:other.id});
    } else if(other.heroId==='jeff'){ particles(other.x,other.y,h.color,24,260,0.4,3); }
    else if(other.heroId==='joross'){ particles(other.x,other.y,h.color,20,200,0.4,2); }
  }
}

function applyRemoteState(msg){
  if(!msg || !msg.id || msg.id === state.mySessionId) return;
  const ex = state.others.get(msg.id) || { id: msg.id, x: msg.x||0, y: msg.y||0, rx: msg.x||0, ry: msg.y||0, alive: true, downed: false, mods: makeDefaultMods() };
  ex.heroId = msg.heroId || ex.heroId || 'james';
  ex.name = msg.name || ex.name || 'Player';
  ex.angle = (typeof msg.angle === 'number') ? msg.angle : (ex.angle||0);
  ex.hp = (typeof msg.hp === 'number') ? msg.hp : ex.hp;
  ex.hpMax = msg.hpMax || ex.hpMax || 100;
  ex.alive = msg.alive !== false;
  ex.downed = !!msg.downed;
  ex.dashing = msg.dashing ? 0.18 : (ex.dashing||0);
  ex.mods = Object.assign(makeDefaultMods(), ex.mods || {}, msg.mods || {});
  const dx = (msg.x||0) - (ex.rx||0), dy = (msg.y||0) - (ex.ry||0);
  if(Math.hypot(dx,dy) > 400){ ex.x = msg.x; ex.y = msg.y; }
  ex.rx = msg.x; ex.ry = msg.y;
  if(ex.x === undefined){ ex.x = msg.x; ex.y = msg.y; }
  state.others.set(msg.id, ex);
  if(Array.isArray(msg.actions)){
    if(state.isHost){ for(const a of msg.actions) applyRemoteCombat(ex, a); }
    for(const a of msg.actions) playRemoteAction(ex, a, { authoritativeProjectiles: state.isHost });
  }
}

function interpolateOthers(dt){
  const k = 1 - Math.exp(-dt * 18);
  for(const o of state.others.values()){
    if(o.rx === undefined) continue;
    o.x += (o.rx - o.x) * k;
    o.y += (o.ry - o.y) * k;
    if(o.dashing>0) o.dashing = Math.max(0, o.dashing - dt);
  }
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
// GOD MODE buttons:
$('#btnGodSolo').onclick = ()=>{
  if(!state.username){ toast('Enter a callsign first'); return; }
  state.mode='god';
  setScene('heroSelect'); renderHeroGrid();
  $('#heroConfirm').onclick = ()=> startGame('god');
};
$('#btnGodMulti').onclick = ()=>{
  if(!state.username){ toast('Enter a callsign first'); return; }
  state.mode='godmulti';
  setScene('mpMenu');
};
$('#btnLeader').onclick = ()=>{ setScene('leaderScreen'); };

$('#heroBack').onclick = ()=> setScene(isMultiMode() ? 'mpMenu' : 'menu');

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
  if(activeRoom.state.players && typeof activeRoom.state.players.onRemove === 'function'){
    activeRoom.state.players.onRemove((_p, id) => {
      if(state.others && state.others.has(id)){
        if(state.reviveTarget && state.reviveTarget.id === id){ state.reviveTarget = null; state.reviveHoldTime = 0; }
        state.others.delete(id);
      }
    });
  }
  activeRoom.onMessage('countdown', (msg)=>{ state.lobby.countdown = msg.n||0; if(msg.cancelled||!msg.n){ setCountdownText(''); renderLobby(); } else setCountdownText(msg.n>0?msg.n:'GO'); });
  activeRoom.onMessage('startGame', ()=>{ setCountdownText(''); try{ startGame(state.mode === 'godmulti' ? 'godmulti' : 'multi'); }catch(e){ console.error(e); } });
  activeRoom.onMessage('playerState', (msg)=> applyRemoteState(msg));
  activeRoom.onMessage('enemyState', (msg)=> applyEnemyState(msg));
  activeRoom.onMessage('hostMigrated', (msg)=>{
    const wasHost = state.isHost;
    state.isHost = (msg && msg.hostId === state.mySessionId);
    if(state.isHost && !wasHost){
      state.bullets = state.bullets.filter(b => b.owner !== state.player.id);
      toast('You are now the host', 1800);
    }
  });
  activeRoom.onMessage('revive', (msg)=> handleReviveMessage(msg));
}

$('#lobbyLeave').onclick = ()=> leaveLobby('mpMenu');
$('#lobbyReady').onclick = ()=>{ if(activeRoom) activeRoom.send('toggleReady'); };

$('#leaderBack').onclick = ()=> setScene('menu');
$('#btnRestart').onclick = ()=>{
  if(state.mode==='multi' || state.mode==='godmulti') setScene('lobby');
  else if(state.mode==='god') startGame('god');
  else startGame('single');
};
$('#btnHome').onclick = ()=> leaveLobby('menu');
$('#btnLeaveGame').onclick = ()=>{ state.running=false; leaveLobby('menu'); };

// ---------- Boot / Preloader ----------
async function bootPreload(){
  const loadEl = document.getElementById('loadingScreen');
  const barEl  = document.getElementById('loadBar');
  const pctEl  = document.getElementById('loadPct');
  const taskEl = document.getElementById('loadTask');
  const setProgress = (done, total, label) => {
    const pct = total>0 ? Math.floor((done/total)*100) : 0;
    if(barEl) barEl.style.width = pct+'%';
    if(pctEl) pctEl.textContent = pct+'%';
    if(taskEl && label) taskEl.textContent = label;
  };

  const tasks = [];
  for(const id of HERO_IDS){
    tasks.push({ label:`HERO ${HEROES[id].name.toUpperCase()}`, run: ()=> new Promise((res)=>{
      const img = new Image();
      img.onload = ()=>{ state.heroPortraits[id]=img; res(); };
      img.onerror = ()=>{ state.heroPortraits[id]=img; res(); };
      img.src = HEROES[id].img;
      setTimeout(res, 5000);
    })});
  }
  for(const id of HERO_IDS){
    tasks.push({ label:`SFX FIRE ${id.toUpperCase()}`, run: ()=> SFX.preload('fire_'+id, `sounds/fire_${id}.mp3`) });
    tasks.push({ label:`SFX Q ${id.toUpperCase()}`,    run: ()=> SFX.preload('q_'+id,    `sounds/q_${id}.mp3`) });
  }
  tasks.push({ label:'SFX DASH', run: ()=> SFX.preload('dash', 'sounds/dash.mp3') });
  tasks.push({ label:'SFX HIT',  run: ()=> SFX.preload('hit',  'sounds/hit.mp3') });
  tasks.push({ label:'SFX HURT', run: ()=> SFX.preload('hurt', 'sounds/hurt.mp3') });
  // ----- GOD MODE preloads -----
  tasks.push({ label:'SFX COLLECT', run: ()=> SFX.preload('collect', 'sounds/collect.mp3') });
  tasks.push({ label:'MUSIC GOD',   run: ()=> SFX.preload('music_god', 'sounds/god.mp3') });
  for(let i=1;i<=10;i++){
    tasks.push({ label:`MUSIC BOSS ${i}`, run: ()=> SFX.preload('music_boss'+i, `sounds/boss${i}.mp3`) });
  }
  // Boss skill SFX (one per skill name + 1 intro)
  ['intro_roar', ...BOSS_SKILLS_LIST].forEach(name=>{
    tasks.push({ label:`SFX BOSS ${name.toUpperCase()}`, run: ()=> SFX.preload('bs_'+name, `sounds/boss_${name}.mp3`) });
  });

  let done = 0;
  setProgress(0, tasks.length, 'LOADING ASSETS…');
  await Promise.all(tasks.map(t => t.run().then(()=>{ done++; setProgress(done, tasks.length, t.label); })));

  setProgress(tasks.length, tasks.length, 'READY');
  setScene('menu');
  if(loadEl){
    loadEl.classList.add('hide');
    setTimeout(()=>{ if(loadEl && loadEl.parentNode) loadEl.parentNode.removeChild(loadEl); }, 600);
  }
}
bootPreload();

window.addEventListener('beforeunload', ()=>{ if(activeRoom){ try{ activeRoom.leave(); }catch(e){} } });
