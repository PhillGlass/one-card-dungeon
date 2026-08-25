/* ============================================================
   GEOMETRY: weighted pathfinding + corner-to-corner Line of Sight
   ============================================================ */
const key = (x,y)=>x+','+y;

function neighborsWithCost(x,y,size,blocked){
  const dirs = [[1,0,2],[-1,0,2],[0,1,2],[0,-1,2],[1,1,3],[1,-1,3],[-1,1,3],[-1,-1,3]];
  const out=[];
  for(const [dx,dy,cost] of dirs){
    const nx=x+dx, ny=y+dy;
    if(nx<0||ny<0||nx>=size||ny>=size) continue;
    if(blocked.has(key(nx,ny))) continue;
    // Il regolamento non vieta di "tagliare l'angolo": una casella in diagonale
    // resta raggiungibile anche se le due caselle ortogonali adiacenti (muro o
    // mostro) sono entrambe bloccate, purché la diagonale stessa sia libera.
    out.push([nx,ny,cost]);
  }
  return out;
}

// Dijkstra over the weighted grid. Returns {dist, prev} maps keyed by "x,y".
function dijkstra(sx,sy,size,blocked){
  const dist={}, prev={};
  dist[key(sx,sy)]=0;
  const visited=new Set();
  const pq=[[0,sx,sy]];
  while(pq.length){
    pq.sort((a,b)=>a[0]-b[0]);
    const [d,x,y]=pq.shift();
    const k=key(x,y);
    if(visited.has(k)) continue;
    visited.add(k);
    for(const [nx,ny,cost] of neighborsWithCost(x,y,size,blocked)){
      const nk=key(nx,ny), nd=d+cost;
      if(dist[nk]===undefined || nd<dist[nk]){
        dist[nk]=nd; prev[nk]=k;
        pq.push([nd,nx,ny]);
      }
    }
  }
  return {dist, prev};
}

function reconstructPath(prev, sx,sy, tx,ty){
  const path=[[tx,ty]];
  let k=key(tx,ty);
  while(k!==key(sx,sy)){
    k=prev[k];
    if(!k) return null;
    const [x,y]=k.split(',').map(Number);
    path.unshift([x,y]);
  }
  return path;
}

function segRectIntersect(p1,p2,rx,ry){
  const xmin=rx, xmax=rx+1, ymin=ry, ymax=ry+1;
  let t0=0, t1=1;
  const dx=p2[0]-p1[0], dy=p2[1]-p1[1];
  const clip=(p,q)=>{
    if(p===0){ if(q<0) return false; return true; }
    const r=q/p;
    if(p<0){ if(r>t1) return false; if(r>t0) t0=r; }
    else{ if(r<t0) return false; if(r<t1) t1=r; }
    return true;
  };
  if(!clip(-dx, p1[0]-xmin)) return false;
  if(!clip(dx, xmax-p1[0])) return false;
  if(!clip(-dy, p1[1]-ymin)) return false;
  if(!clip(dy, ymax-p1[1])) return false;
  return t0<t1;
}

// Line of Sight: true if ANY corner-to-corner segment between tile A and tile B
// avoids the interior of every blocking tile (walls + other occupied tiles).
function hasLoS(ax,ay,bx,by,blockingTiles){
  const cornersA=[[ax,ay],[ax+1,ay],[ax,ay+1],[ax+1,ay+1]];
  const cornersB=[[bx,by],[bx+1,by],[bx,by+1],[bx+1,by+1]];
  for(const ca of cornersA){
    for(const cb of cornersB){
      let blocked=false;
      for(const [wx,wy] of blockingTiles){
        if((wx===ax&&wy===ay)||(wx===bx&&wy===by)) continue;
        if(segRectIntersect(ca,cb,wx,wy)){ blocked=true; break; }
      }
      if(!blocked) return true;
    }
  }
  return false;
}

/* ============================================================
   GAME CONFIG
   ============================================================ */
const GRID = 5;
const MAX_LEVEL = 12;

// Level 1 è confermato dalla carta ufficiale: 2 Ragni, Salute 2, Gittata 3, Difesa 4, Attacco 4, Velocità 5.
// Livelli 2-12 forniti dall'utente dal regolamento ufficiale.
const MONSTER_TABLE = {
  1:  { name:"Ragno",     icon:"🕷️", hp:2, speed:5, atk:4, def:4, range:3, count:2 },
  2:  { name:"Scheletro", icon:"💀", hp:3, speed:4, atk:5, def:4, range:4, count:2 },
  3:  { name:"Orco",      icon:"👹", hp:5, speed:3, atk:7, def:7, range:2, count:1 },
  4:  { name:"Demone",    icon:"😈", hp:5, speed:5, atk:5, def:5, range:5, count:1 },
  5:  { name:"Ragno",     icon:"🕷️", hp:2, speed:5, atk:4, def:4, range:3, count:3 },
  6:  { name:"Scheletro", icon:"💀", hp:3, speed:4, atk:5, def:4, range:4, count:3 },
  7:  { name:"Orco",      icon:"👹", hp:5, speed:3, atk:7, def:7, range:2, count:2 },
  8:  { name:"Demone",    icon:"😈", hp:5, speed:5, atk:5, def:5, range:5, count:2 },
  9:  { name:"Ragno",     icon:"🕷️", hp:2, speed:5, atk:4, def:4, range:3, count:4 },
  10: { name:"Scheletro", icon:"💀", hp:3, speed:4, atk:5, def:4, range:4, count:4 },
  11: { name:"Orco",      icon:"👹", hp:5, speed:3, atk:7, def:7, range:2, count:3 },
  12: { name:"Demone",    icon:"😈", hp:5, speed:5, atk:5, def:5, range:5, count:3 },
};

// Character classes from the official "Game Variant" section of the rulebook.
const CLASSES = {
  none:      { name:"Classico",  icon:"🗡️", desc:"Nessuna abilità speciale — il gioco base, senza varianti." },
  paladin:   { name:"Paladino",  icon:"🛡️", desc:"Una volta per Livello, puoi mantenere il valore di un dado Energia dal turno precedente invece di rilanciarlo." },
  barbarian: { name:"Barbaro",   icon:"🪓", desc:"Quando sei a 1 Salute, puoi rilanciare tutti i dadi Energia (una volta per turno, senza limite di livello)." },
  ranger:    { name:"Ranger",    icon:"🏹", desc:"Una volta per Livello, puoi assegnare un dado alla Gittata invece che alla Velocità." },
  wizard:    { name:"Mago",      icon:"🔮", desc:"Una volta per Livello, puoi rilanciare tutti e tre i dadi Energia." },
};

/* ============================================================
   STATE
   ============================================================ */
let state = null;

/* ------------------------------------------------------------
   CLOUD SAVE (Supabase) — sostituisce il vecchio localStorage.
   Teniamo una cache in memoria (popolata al login da cloud.js)
   così tutte le funzioni sotto restano SINCRONE come prima;
   ogni scrittura viene poi spedita a Supabase in background.
   ------------------------------------------------------------ */
window.__ocdCache = window.__ocdCache || { save: null, record: 0 };

function loadSave(){
  return window.__ocdCache.save;
}
function writeSave(){
  window.__ocdCache.save = state;
  window.OCDCloud && window.OCDCloud.persist();
}
function clearSave(){
  window.__ocdCache.save = null;
  window.OCDCloud && window.OCDCloud.persist();
}
function loadRecord(){
  return window.__ocdCache.record || 0;
}
function updateRecordIfHigher(level){
  if(level > (window.__ocdCache.record||0)){
    window.__ocdCache.record = level;
    window.OCDCloud && window.OCDCloud.persist();
  }
}
// Una "partita completata" è una run finita (morte o vittoria): a quel punto
// si aggiorna il record col livello raggiunto e si azzera la partita salvata.
function finishRun(reachedLevel){
  updateRecordIfHigher(reachedLevel);
  clearSave();
}

function newGame(){
  showClassSelect();
}

function startRun(cls){
  state = {
    level: 1,
    class: cls,
    skills: { speed:1, atk:1, def:1, range:2 },
    hp: 6, maxHp: 6,
    dice: [], points:{speed:0,atk:0,def:0,range:0}, spent:{speed:0,atk:0},
    phase: 'roll',
    player: {x:0,y:0},
    walls: [],
    entryStair: {x:0,y:0}, exitStair: {x:GRID-1,y:GRID-1},
    monsters: [],
    selectedDie: null, selectedMonster: null,
    prevDice: [],
    abilityUsed: { paladin:false, ranger:false, wizard:false },
    barbarianUsedThisTurn: false,
    animating: false, animAttacker: null,
  };
  spawnLevel(1);
}

function totalRange(){ return state.skills.range + (state.points.range||0); }

function chebyshev(ax,ay,bx,by){ return Math.max(Math.abs(ax-bx), Math.abs(ay-by)); }

// Procedural wall placement (invented — the real card art isn't available to me).
// Walls avoid the player start, both stair tiles, and always leave the board connected.
function makeWalls(level, forbiddenExtra){
  // Le regole ufficiali prevedono sempre 3 celle Muro per scheda, a prescindere dal livello.
  const wallCount = 3;
  const forbidden = new Set([key(0,0), key(GRID-1,GRID-1), ...(forbiddenExtra||[])]);
  for(let attempt=0; attempt<40; attempt++){
    const candidates = [];
    for(let y=0;y<GRID;y++) for(let x=0;x<GRID;x++){
      if(!forbidden.has(key(x,y))) candidates.push([x,y]);
    }
    candidates.sort(()=>Math.random()-0.5);
    const chosen = [];
    for(const [x,y] of candidates){
      if(chosen.length>=wallCount) break;
      const testBlocked = new Set([...chosen,[x,y]].map(([a,b])=>key(a,b)));
      const {dist} = dijkstra(0,0,GRID,testBlocked);
      // keep board fully connected
      let ok=true;
      for(let yy=0;yy<GRID;yy++) for(let xx=0;xx<GRID;xx++){
        if(testBlocked.has(key(xx,yy))) continue;
        if(dist[key(xx,yy)]===undefined){ ok=false; }
      }
      if(ok) chosen.push([x,y]);
    }
    if(chosen.length===wallCount) return chosen;
  }
  return []; // fallback estremamente improbabile
}

// Random placement with hard constraints: nothing overlaps (walls / monsters / stairs),
// and no monster may spawn adjacent (orthogonally or diagonally) to the Adventurer's start tile.
function spawnLevel(lvl){
  const t = MONSTER_TABLE[lvl];
  state.player = {x:0,y:0};
  state.entryStair = {x:0,y:0};
  state.exitStair = {x:GRID-1,y:GRID-1};

  state.walls = makeWalls(lvl, [state.exitStair.x+','+state.exitStair.y]);
  const wallSet = new Set(state.walls.map(([x,y])=>key(x,y)));

  const used = new Set([key(0,0), key(state.exitStair.x, state.exitStair.y)]);
  const monsters=[];
  for(let i=0;i<t.count;i++){
    let x,y,k,tries=0;
    do{
      x=Math.floor(Math.random()*GRID); y=Math.floor(Math.random()*GRID);
      k=key(x,y); tries++;
    } while((used.has(k) || wallSet.has(k) || chebyshev(x,y,state.player.x,state.player.y)<2) && tries<200);
    used.add(k);
    monsters.push({x,y,hp:t.hp,maxHp:t.hp,range:t.range,def:t.def,atk:t.atk,speed:t.speed,icon:t.icon,name:t.name,alive:true});
  }
  state.monsters = monsters;
  state.dice=[]; state.points={speed:0,atk:0,def:0,range:0}; state.spent={speed:0,atk:0};
  state.phase='roll'; state.selectedDie=null; state.selectedMonster=null;
  state.prevDice = []; state.abilityUsed = { paladin:false, ranger:false, wizard:false };
  state.barbarianUsedThisTurn = false;
  render();
}

// Il box di log testuale è stato rimosso dall'interfaccia; la funzione resta
// come no-op per non dover toccare tutti i punti del codice che la richiamano.
function log(msg){}

/* ============================================================
   DERIVED HELPERS
   ============================================================ */
function occupiedBy(x,y, excludeMonster){
  if(state.player.x===x && state.player.y===y) return 'player';
  for(const m of state.monsters){
    if(m===excludeMonster || !m.alive) continue;
    if(m.x===x && m.y===y) return 'monster';
  }
  return null;
}
function wallSetOf(){ return new Set(state.walls.map(([x,y])=>key(x,y))); }

function totalStat(k){ return state.skills[k] + state.points[k]; }

// Player's movement graph: blocked = walls + alive monsters (can't move onto or through them)
function playerBlocked(){
  const b = wallSetOf();
  for(const m of state.monsters) if(m.alive) b.add(key(m.x,m.y));
  return b;
}

function playerRangeTo(mx,my){
  const blocked = new Set(wallSetOf());
  for(const m of state.monsters){ if(m.alive && !(m.x===mx&&m.y===my)) blocked.add(key(m.x,m.y)); }
  const {dist} = dijkstra(state.player.x, state.player.y, GRID, blocked);
  return dist[key(mx,my)];
}

function playerLoSTo(mx,my){
  const blocking = [...state.walls];
  for(const m of state.monsters){ if(m.alive && !(m.x===mx&&m.y===my)) blocking.push([m.x,m.y]); }
  return hasLoS(state.player.x, state.player.y, mx, my, blocking);
}

/* ============================================================
   ANIMATION HELPERS
   ============================================================ */
function sleep(ms){ return new Promise(res=>setTimeout(res,ms)); }

// Floating combat text (damage / miss) anchored over a grid cell. Lives in its
// own overlay layer so it survives the frequent full re-renders of the grid.
function spawnFloatText(x,y,text,cls){
  const layer=document.getElementById('fxLayer');
  if(!layer) return;
  const el=document.createElement('div');
  el.className='floattext '+(cls||'');
  el.textContent=text;
  el.style.left = ((x+0.5)/GRID*100)+'%';
  el.style.top = ((y+0.5)/GRID*100)+'%';
  layer.appendChild(el);
  setTimeout(()=>el.remove(), 950);
}

// Animates dice "composing" their value (rapid random cycling that settles on
// the real roll) before the real state update happens. lockedIndices are dice
// shown immediately at their final value (e.g. Paladino's kept die).
function animateDiceRoll(finalValues, lockedIndices){
  lockedIndices = lockedIndices||[];
  return new Promise(resolve=>{
    const row=document.getElementById('diceRow');
    const assignRow=document.getElementById('assignRow');
    if(assignRow) assignRow.innerHTML='';
    row.innerHTML='';
    const els = finalValues.map((v,i)=>{
      const el=document.createElement('div');
      const locked = lockedIndices.includes(i);
      el.className='die'+(locked?' settled':' rolling');
      el.textContent = locked ? v : 1+Math.floor(Math.random()*6);
      row.appendChild(el);
      return el;
    });
    let ticks=0;
    const iv=setInterval(()=>{
      els.forEach((el,i)=>{ if(!lockedIndices.includes(i)) el.textContent = 1+Math.floor(Math.random()*6); });
      ticks++;
      if(ticks>=7){
        clearInterval(iv);
        els.forEach((el,i)=>{ el.textContent=finalValues[i]; el.classList.remove('rolling'); el.classList.add('settled'); });
        setTimeout(resolve,180);
      }
    },70);
  });
}

/* ============================================================
   ENERGY PHASE (+ class abilities)
   ============================================================ */
function rollFreshDice(){
  return [0,0,0].map(()=>({value:1+Math.floor(Math.random()*6), target:null}));
}

async function rollDice(){
  if(state.phase!=='roll' || state.animating) return;
  state.animating = true;
  render();
  const fresh = rollFreshDice();
  await animateDiceRoll(fresh.map(d=>d.value));
  state.dice = fresh;
  state.phase='assign';
  state.barbarianUsedThisTurn = false;
  state.animating = false;
  log(`Lanci i dadi Energia: ${state.dice.map(d=>d.value).join(', ')}`);
  render();
}

// Paladino: keep one die's value from last turn instead of rolling it fresh.
async function rollKeepingDie(kept){
  if(state.phase!=='roll' || state.animating) return;
  state.animating = true;
  render();
  const fresh = rollFreshDice();
  fresh[0] = {value:kept, target:null};
  await animateDiceRoll(fresh.map(d=>d.value), [0]);
  state.dice = fresh;
  state.abilityUsed.paladin = true;
  state.phase='assign';
  state.barbarianUsedThisTurn = false;
  state.animating = false;
  log(`🛡️ Abilità Paladino: mantieni un dado da ${kept}. Nuovi dadi: ${state.dice.map(d=>d.value).join(', ')}`);
  render();
}

// Mago: reroll all three energy dice once per level, before spending any.
async function wizardReroll(){
  if(state.class!=='wizard' || state.abilityUsed.wizard) return;
  if(state.phase!=='assign' || state.dice.some(d=>d.target) || state.animating) return;
  state.animating = true;
  render();
  const fresh = rollFreshDice();
  await animateDiceRoll(fresh.map(d=>d.value));
  state.dice = fresh;
  state.abilityUsed.wizard = true;
  state.animating = false;
  log(`🔮 Abilità Mago: rilanci tutti i dadi. Nuovo tiro: ${state.dice.map(d=>d.value).join(', ')}`);
  render();
}

// Barbaro: while at 1 Health, reroll all dice (usable every turn, once per turn).
async function barbarianReroll(){
  if(state.class!=='barbarian' || state.hp!==1) return;
  if(state.phase!=='assign' || state.barbarianUsedThisTurn || state.animating) return;
  state.animating = true;
  render();
  state.points = {speed:0,atk:0,def:0,range:0};
  const fresh = rollFreshDice();
  await animateDiceRoll(fresh.map(d=>d.value));
  state.dice = fresh;
  state.barbarianUsedThisTurn = true;
  state.animating = false;
  log(`🪓 Abilità Barbaro (1 Salute): rilanci tutti i dadi. Nuovo tiro: ${state.dice.map(d=>d.value).join(', ')}`);
  render();
}

function selectDie(i){
  if(state.phase!=='assign' || state.animating) return;
  if(state.dice[i].target) return;
  state.selectedDie = (state.selectedDie===i)?null:i;
  render();
}

// Regola ufficiale: un solo dado per caratteristica (niente somma di più dadi
// sulla stessa voce), e la Gittata del Ranger sostituisce la Velocità per il
// turno — non si possono usare entrambe nello stesso turno.
function assignTo(stat){
  if(state.animating) return;
  if(state.selectedDie===null) return;
  const d = state.dice[state.selectedDie];
  if(d.target) return;

  const speedTaken = state.dice.some(x=>x.target==='speed');
  const atkTaken   = state.dice.some(x=>x.target==='atk');
  const defTaken   = state.dice.some(x=>x.target==='def');
  const rangeTaken = state.dice.some(x=>x.target==='range');

  if(stat==='speed' && (speedTaken || rangeTaken)) return;
  if(stat==='atk' && atkTaken) return;
  if(stat==='def' && defTaken) return;
  if(stat==='range'){
    if(state.class!=='ranger' || state.abilityUsed.ranger) return;
    if(rangeTaken || speedTaken) return;
    state.abilityUsed.ranger = true;
    log(`🏹 Abilità Ranger: assegni un dado (${d.value}) alla Gittata invece che alla Velocità.`);
  }

  d.target = stat;
  state.points[stat] += d.value;
  state.selectedDie = null;
  if(state.dice.every(d=>d.target)){
    state.phase='act';
    state.prevDice = state.dice.map(d=>d.value);
    log(`Energia assegnata — Velocità ${totalStat('speed')}, Attacco ${totalStat('atk')}, Difesa ${totalStat('def')}${state.points.range?`, Gittata +${state.points.range}`:''}`);
  }
  render();
}

/* ============================================================
   ADVENTURER PHASE (move / attack)
   ============================================================ */
function cellInfo(x,y){
  if(state.phase!=='act') return {type:null};
  const occ = occupiedBy(x,y);
  if(occ==='monster'){
    const m = state.monsters.find(m=>m.alive && m.x===x && m.y===y);
    const dist = playerRangeTo(x,y);
    const inRange = dist!==undefined && dist<=totalStat('range'); // fixed, unless boosted by the Ranger ability
    const los = playerLoSTo(x,y);
    const remAtk = totalStat('atk') - state.spent.atk;
    const canHit = inRange && los && remAtk>=m.def;
    return {type:'monster', monster:m, canHit, dist, los};
  }
  if(occ==='player') return {type:null};
  const dist = playerRangeTo(x,y);
  const remSpeed = totalStat('speed') - state.spent.speed;
  if(dist!==undefined && dist<=remSpeed && dist>0) return {type:'move', dist};
  return {type:null};
}

function handleCellClick(x,y){
  if(state.animating) return;
  const info = cellInfo(x,y);
  if(info.type==='move'){
    state.spent.speed += info.dist;
    state.player = {x,y};
    log(`Ti muovi (−${info.dist}⚡ Velocità).`);
    render();
  } else if(info.type==='monster'){
    state.selectedMonster = info.monster;
    render();
  }
}

function attackSelected(){
  if(state.animating) return;
  const m = state.selectedMonster;
  if(!m || !m.alive) return;
  const info = cellInfo(m.x, m.y);
  if(info.type!=='monster' || !info.canHit) return;
  state.spent.atk += m.def;
  m.hp -= 1;
  spawnFloatText(m.x, m.y, '-1', 'dmg');
  if(m.hp<=0){
    m.alive=false;
    log(`Il tuo colpo abbatte ${m.name} ${m.icon}!`);
  } else {
    log(`Colpisci ${m.name} ${m.icon} (−${m.def}⚡ Attacco): resta ${m.hp}/${m.maxHp} Salute.`);
  }
  render();
}

/* ============================================================
   MONSTER PHASES
   ============================================================ */
async function monsterMovementPhase(){
  const order = state.monsters
    .filter(m=>m.alive)
    .map(m=>({m, d: playerRangeTo(m.x,m.y) ?? 999}))
    .sort((a,b)=>a.d-b.d)
    .map(o=>o.m);

  for(const m of order){
    // rangeFromAdv è solo una metrica di distanza (per capire quali celle sono
    // "in Gittata" rispetto al personaggio): non è un vero movimento, quindi
    // non va bloccata dagli altri mostri.
    const advReach = dijkstra(state.player.x, state.player.y, GRID, wallSetOf());

    // Regola ufficiale: SOLO i mostri possono attraversare la cella occupata
    // da un altro mostro, purché non vi si fermino sopra. Quindi il grafo di
    // movimento (travBlocked) ignora gli altri mostri come ostacolo al
    // passaggio; sono invece esclusi come possibili caselle di arrivo tramite
    // stopBlocked.
    const travBlocked = new Set(wallSetOf());
    travBlocked.add(key(state.player.x, state.player.y));
    const mReach = dijkstra(m.x, m.y, GRID, travBlocked);

    const stopBlocked = new Set(travBlocked);
    for(const o of state.monsters) if(o!==m && o.alive) stopBlocked.add(key(o.x,o.y));

    const candidates=[];
    for(let y=0;y<GRID;y++) for(let x=0;x<GRID;x++){
      const k=key(x,y);
      if(stopBlocked.has(k)) continue;
      if(mReach.dist[k]===undefined) continue;
      const rangeFromAdv = advReach.dist[k];
      if(rangeFromAdv===undefined) continue;
      const los = hasLoS(x,y,state.player.x,state.player.y, state.walls);
      const moveCost = mReach.dist[k];
      // "reachable" = il mostro ha abbastanza Velocità per arrivarci in QUESTO
      // turno (non solo teoricamente raggiungibile ignorando il budget).
      candidates.push({x,y,rangeFromAdv,los,moveCost,reachable: moveCost<=m.speed});
    }

    let target=null;
    // Priorità 1: tra le caselle raggiungibili in questo turno, quelle da cui
    // il mostro può ATTACCARE (Gittata + Linea di Vista). Priorità 2, solo
    // come criterio di scelta TRA queste: la più distante dal personaggio.
    // Così "stare lontano" non può più far rinunciare a un attacco possibile.
    const attackableNow = candidates.filter(c=>c.reachable && c.rangeFromAdv<=m.range && c.los);
    if(attackableNow.length){
      attackableNow.sort((a,b)=> b.rangeFromAdv-a.rangeFromAdv || a.moveCost-b.moveCost);
      target = attackableNow[0];
    } else {
      // Nessuna posizione d'attacco raggiungibile questo turno: si avvicina il
      // più possibile verso una buona posizione (prima Linea di Vista, poi
      // Gittata più bassa), preferendo sempre restare entro il proprio budget.
      const reachableCandidates = candidates.filter(c=>c.reachable);
      const pool = reachableCandidates.length ? reachableCandidates : candidates;
      const anyLos = pool.filter(c=>c.los);
      if(anyLos.length){
        anyLos.sort((a,b)=> a.rangeFromAdv-b.rangeFromAdv || a.moveCost-b.moveCost);
        target = anyLos[0];
      } else if(pool.length){
        pool.sort((a,b)=> a.rangeFromAdv-b.rangeFromAdv || a.moveCost-b.moveCost);
        target = pool[0];
      }
    }

    if(target && (target.x!==m.x || target.y!==m.y)){
      const path = reconstructPath(mReach.prev, m.x, m.y, target.x, target.y);
      if(path){
        let budget = m.speed;
        let cx=m.x, cy=m.y;
        // Il mostro può ATTRAVERSARE la cella di un compagno, ma non può mai
        // terminare il movimento lì: teniamo traccia dell'ultima casella
        // libera raggiunta e ci si ferma lì se il budget si esaurisce proprio
        // mentre si "passa sopra" a un altro mostro.
        let restX=cx, restY=cy;
        for(let i=1;i<path.length;i++){
          const [nx,ny] = path[i];
          const stepCost = (nx!==cx && ny!==cy) ? 3 : 2;
          if(stepCost>budget) break;
          budget-=stepCost; cx=nx; cy=ny;
          if(!stopBlocked.has(key(cx,cy))){ restX=cx; restY=cy; }
        }
        m.x=restX; m.y=restY;
      }
    }
    // Piccola pausa dopo ogni mostro, così si vede il movimento uno alla volta.
    render();
    await sleep(320);
  }
}

async function monsterAttackPhase(){
  let totalAtk=0;
  const attackers=[];
  for(const m of state.monsters){
    if(!m.alive) continue;
    const dist = playerRangeTo(m.x,m.y);
    const inRange = dist!==undefined && dist<=m.range;
    const los = hasLoS(m.x,m.y,state.player.x,state.player.y, state.walls);
    if(inRange && los){ totalAtk+=m.atk; attackers.push(m); }
  }

  // Evidenzia ogni mostro attaccante uno alla volta, prima di applicare il danno totale.
  for(const m of attackers){
    state.animAttacker = m;
    render();
    await sleep(380);
  }
  state.animAttacker = null;

  const totalDef = totalStat('def');
  const dmg = totalDef>0 ? Math.floor(totalAtk/totalDef) : totalAtk;
  if(attackers.length===0){
    log(`Nessun mostro è in Gittata e Linea di Vista: nessun attacco subito.`);
  } else if(dmg<=0){
    log(`I mostri attaccano (Attacco tot. ${totalAtk} vs Difesa ${totalDef}): il tuo scudo regge, 0 danni.`);
    spawnFloatText(state.player.x, state.player.y, 'Miss', 'miss');
  } else {
    state.hp = Math.max(0, state.hp-dmg);
    log(`I mostri attaccano (${totalAtk} Attacco vs ${totalDef} Difesa): subisci ${dmg} danni. Salute: ${state.hp}/${state.maxHp}`);
    spawnFloatText(state.player.x, state.player.y, '-'+dmg, 'dmg');
  }
  render();
}

async function endTurn(){
  if(state.phase!=='act' || state.animating) return;
  state.animating = true;
  render();

  await monsterMovementPhase();
  await monsterAttackPhase();

  state.animating = false;
  state.dice=[]; state.points={speed:0,atk:0,def:0,range:0}; state.spent={speed:0,atk:0};
  state.selectedMonster=null; state.phase='roll';

  if(state.hp<=0){ render(); showGameOver(); return; }
  if(state.monsters.every(m=>!m.alive)){ render(); onLevelClear(); return; }
  render();
}

function onLevelClear(){
  if(state.level>=MAX_LEVEL){ showVictory(); return; }
  showLevelUp();
}

/* ============================================================
   MODALS
   ============================================================ */
function showClassSelect(){
  const bg=document.getElementById('modalBg'), m=document.getElementById('modalContent');
  m.innerHTML = `
    <h2>⚔ Scegli il tuo Eroe</h2>
    <p style="font-size:.8rem;">Variante "Classi" del regolamento ufficiale — ogni classe parte con le statistiche base (Velocità 1, Attacco 1, Difesa 1, Gittata 2, Salute 6) più un'abilità unica.</p>
    <div id="classList" style="display:flex; flex-direction:column; gap:8px; margin-top:10px;"></div>
  `;
  const list = m.querySelector('#classList');
  Object.entries(CLASSES).forEach(([id,c])=>{
    const b=document.createElement('button');
    b.className='btn secondary';
    b.style.textAlign='left';
    b.innerHTML = `<div style="font-family:'Cinzel',serif;">${c.icon} ${c.name}</div><div style="font-family:'IM Fell English',serif; font-size:.72rem; text-transform:none; letter-spacing:normal; opacity:.85; margin-top:2px;">${c.desc}</div>`;
    b.onclick = ()=>{ bg.classList.add('hidden'); startRun(id); showGame(); };
    list.appendChild(b);
  });
  bg.classList.remove('hidden');
}

function showLevelUp(){
  const bg=document.getElementById('modalBg'), m=document.getElementById('modalContent');
  let picked=null, mode=null; // 'upgrade' or 'heal'
  const healLabel = `✚ Cura Completa (${state.hp}/${state.maxHp} → 6)`;
  const skillLabels = {
    speed: '🏃 Velocità',
    atk: '⚔ Attacco',
    def: '🛡 Difesa',
    range: '🎯 Gittata',
  };
  m.innerHTML = `
    <h2>🏆 Livello Superato!</h2>
    <p>Dopo ogni livello puoi <b>o</b> potenziare un'abilità <b>o</b> curarti completamente — non entrambi.</p>
    <div class="skill-choice">
      <button data-s="speed">${skillLabels.speed} (${state.skills.speed})</button>
      <button data-s="atk">${skillLabels.atk} (${state.skills.atk})</button>
      <button data-s="def">${skillLabels.def} (${state.skills.def})</button>
      <button data-s="range">${skillLabels.range} (${state.skills.range})</button>
    </div>
    <button class="btn gold" id="healBtn">${healLabel}</button>
    <button class="btn" id="continueBtn" style="margin-top:8px;" disabled>Scendi al Livello ${state.level+1}</button>
  `;
  bg.classList.remove('hidden');
  const buttons=m.querySelectorAll('.skill-choice button');
  const healBtn=m.querySelector('#healBtn');
  const continueBtn=m.querySelector('#continueBtn');

  function refreshSkillLabels(){
    buttons.forEach(b=>{
      const s = b.dataset.s;
      const boosted = (mode==='upgrade' && picked===s);
      b.textContent = `${skillLabels[s]} (${state.skills[s] + (boosted?1:0)})`;
    });
  }

  buttons.forEach(b=>b.onclick=()=>{
    mode='upgrade'; picked=b.dataset.s;
    buttons.forEach(x=>x.classList.remove('picked'));
    b.classList.add('picked');
    healBtn.classList.remove('picked');
    healBtn.textContent = healLabel;
    refreshSkillLabels();
    continueBtn.disabled=false;
  });
  healBtn.onclick=()=>{
    mode='heal'; picked=null;
    buttons.forEach(x=>x.classList.remove('picked'));
    healBtn.classList.add('picked');
    healBtn.textContent='✔ Curerai completamente';
    refreshSkillLabels();
    continueBtn.disabled=false;
  };
  continueBtn.onclick=()=>{
    if(mode==='upgrade') state.skills[picked]++;
    else if(mode==='heal') state.hp=state.maxHp;
    state.level++;
    bg.classList.add('hidden');
    spawnLevel(state.level);
  };
}

function showGameOver(){
  finishRun(state.level);
  const bg=document.getElementById('modalBg'), m=document.getElementById('modalContent');
  m.innerHTML = `<h2 style="color:var(--blood-bright)">💀 Sei Caduto</h2>
    <p>Il tuo Avventuriero soccombe al Livello ${state.level}. Il dungeon reclama un'altra anima...</p>
    <button class="btn gold" id="retryBtn">Torna al Menu</button>`;
  bg.classList.remove('hidden');
  m.querySelector('#retryBtn').onclick=()=>{ bg.classList.add('hidden'); showSplash(); };
}

function showVictory(){
  finishRun(MAX_LEVEL);
  const bg=document.getElementById('modalBg'), m=document.getElementById('modalContent');
  m.innerHTML = `<h2 style="color:var(--gold-bright)">👑 Vittoria!</h2>
    <p>Hai abbattuto tutti i mostri del Livello 12 e conquistato lo <b>Scettro di M'Guf-yn</b>. Il tuo villaggio è salvo!</p>
    <button class="btn gold" id="againBtn">Torna al Menu</button>`;
  bg.classList.remove('hidden');
  m.querySelector('#againBtn').onclick=()=>{ bg.classList.add('hidden'); showSplash(); };
}

/* ============================================================
   RENDER
   ============================================================ */
function renderStats(){
  const row=document.getElementById('statsRow');

  // I tre riquadri Velocità/Attacco/Difesa (+ Gittata per il Ranger) diventano
  // i "bersagli" a cui assegnare il dado selezionato, invece di bottoni duplicati.
  const canAssign = state.phase==='assign' && !state.animating && state.selectedDie!==null;
  const speedTaken = state.dice.some(d=>d.target==='speed');
  const atkTaken   = state.dice.some(d=>d.target==='atk');
  const defTaken   = state.dice.some(d=>d.target==='def');
  const rangeTaken = state.dice.some(d=>d.target==='range');
  const rangerAvail = state.class==='ranger' && !state.abilityUsed.ranger;

  const targetable = {
    speed: canAssign && !speedTaken && !rangeTaken,
    atk:   canAssign && !atkTaken,
    def:   canAssign && !defTaken,
    range: canAssign && rangerAvail && !rangeTaken && !speedTaken,
  };

  function statBox(id,label,val,bonus){
    const active = targetable[id];
    const shown = val + (bonus||0);
    return `<div class="stat${active?' target-active':''}" data-stat="${id}">
      <div class="lbl">${label}</div><div class="val${bonus?' boosted':''}">${shown}</div>
    </div>`;
  }

  row.innerHTML =
    `<div class="stat hp"><div class="lbl">Salute</div><div class="val">${state.hp}/${state.maxHp}</div></div>` +
    statBox('speed','Velocità', state.skills.speed, state.points.speed) +
    statBox('atk','Attacco', state.skills.atk, state.points.atk) +
    statBox('def','Difesa', state.skills.def, state.points.def) +
    statBox('range','Gittata', state.skills.range, state.points.range);

  row.querySelectorAll('.stat[data-stat]').forEach(el=>{
    const st = el.dataset.stat;
    if(targetable[st]) el.onclick = ()=>assignTo(st);
  });
}

function renderDice(){
  const row=document.getElementById('diceRow'), assignRow=document.getElementById('assignRow'), label=document.getElementById('trayLabel');
  row.innerHTML=''; assignRow.innerHTML='';
  if(state.phase==='roll'){
    label.textContent='Fase Energia — Lancia i dadi';
    // Paladino: option to keep one die's value from last turn
    if(state.class==='paladin' && !state.abilityUsed.paladin && state.prevDice.length===3){
      const wrap=document.createElement('div');
      wrap.style.cssText='width:100%;text-align:center;margin-top:6px;';
      wrap.innerHTML = `<div style="font-family:'Cinzel',serif;font-size:.6rem;color:var(--parchment-dim);text-transform:uppercase;margin-bottom:4px;">🛡️ Paladino — mantieni un dado dal turno scorso?</div>`;
      const chips=document.createElement('div');
      chips.style.cssText='display:flex;justify-content:center;gap:6px;';
      state.prevDice.forEach(v=>{
        const c=document.createElement('button');
        c.className='assign-btn'; c.textContent=v;
        c.onclick=()=>rollKeepingDie(v);
        chips.appendChild(c);
      });
      wrap.appendChild(chips);
      assignRow.appendChild(wrap);
    }
  } else if(state.phase==='assign'){
    label.textContent = state.selectedDie===null
      ? 'Tocca un dado, poi la caratteristica evidenziata in alto'
      : 'Ora tocca la caratteristica in alto a cui assegnarlo';
    state.dice.forEach((d,i)=>{
      const el=document.createElement('div');
      el.className='die'+(d.target?' used':'')+(state.selectedDie===i?' selected':'');
      el.textContent=d.value;
      el.onclick=()=>selectDie(i);
      row.appendChild(el);
    });
    // Mago: reroll-all, only before any die is assigned
    if(state.class==='wizard' && !state.abilityUsed.wizard && !state.dice.some(d=>d.target)){
      const b=document.createElement('button');
      b.className='assign-btn'; b.textContent='🔮 Rilancia tutti (Mago)';
      b.onclick=wizardReroll;
      assignRow.appendChild(b);
    }
    // Barbaro: reroll-all while at 1 Health, once per turn
    if(state.class==='barbarian' && state.hp===1 && !state.barbarianUsedThisTurn){
      const b=document.createElement('button');
      b.className='assign-btn'; b.textContent='🪓 Rilancia tutti (Barbaro)';
      b.onclick=barbarianReroll;
      assignRow.appendChild(b);
    }
  } else if(state.phase==='act'){
    label.textContent = `Velocità disp. ${totalStat('speed')-state.spent.speed} · Attacco disp. ${totalStat('atk')-state.spent.atk}`;
  }
}

function renderGrid(){
  const grid=document.getElementById('grid');
  grid.style.gridTemplateColumns = `repeat(${GRID},1fr)`;
  grid.style.gridTemplateRows = `repeat(${GRID},1fr)`;
  grid.innerHTML='';
  const wallSet = wallSetOf();
  for(let y=0;y<GRID;y++){
    for(let x=0;x<GRID;x++){
      const cell=document.createElement('div');
      cell.className='cell';
      const k=key(x,y);
      const isWall = wallSet.has(k);
      const isEntry = x===state.entryStair.x && y===state.entryStair.y;
      const isExit = x===state.exitStair.x && y===state.exitStair.y;
      if(isWall) cell.classList.add('wall');
      if((isEntry||isExit) && !isWall) cell.classList.add('stair');

      const isPlayer = state.player.x===x && state.player.y===y;
      const monster = state.monsters.find(m=>m.alive && m.x===x && m.y===y);

      if(state.phase==='act' && !isWall){
        const info = cellInfo(x,y);
        if(info.type==='move') cell.classList.add('reachable');
        if(info.type==='monster' && info.canHit) cell.classList.add('attackable');
      }
      if(state.selectedMonster && monster===state.selectedMonster) cell.classList.add('selected-monster');
      if(state.animAttacker && monster===state.animAttacker) cell.classList.add('attacking');

      if(isPlayer){
        cell.classList.add('player');
        cell.innerHTML = `<span class="token">🧙</span><span class="hp-badge">${state.hp}</span>`;
      } else if(monster){
        cell.innerHTML = `<span class="token">${monster.icon}</span><span class="hp-badge">${monster.hp}</span>`;
      } else if(isEntry){
        cell.innerHTML = `<span class="token" style="opacity:.5">🔼</span>`;
      } else if(isExit){
        cell.innerHTML = `<span class="token" style="opacity:.5">🔽</span>`;
      }
      cell.onclick=()=>handleCellClick(x,y);
      grid.appendChild(cell);
    }
  }
}

function renderInspect(){
  const box=document.getElementById('inspect');
  if(!state.monsters.length){ box.innerHTML=''; return; }

  // Ogni mostro del livello è una copia identica: un solo blocco di
  // caratteristiche basta per tutti, sempre visibile (nessun "tocca per
  // esaminare"). La Salute mostrata è quella MASSIMA della singola creatura
  // (non la somma del gruppo), come sulla carta ufficiale.
  const rep = state.monsters[0];
  const allDead = state.monsters.every(m=>!m.alive);

  const sel = (state.selectedMonster && state.selectedMonster.alive) ? state.selectedMonster : null;
  const info = (sel && state.phase==='act') ? cellInfo(sel.x, sel.y) : {canHit:false};

  box.innerHTML = `
    <div class="title">${rep.icon} ${rep.name}${allDead?' (sconfitti)':''}</div>
    <div class="mstats">
      <div><span>${rep.maxHp}</span><small>Salute</small></div>
      <div><span>${rep.speed}</span><small>Velocità</small></div>
      <div><span>${rep.atk}</span><small>Attacco</small></div>
      <div><span>${rep.def}</span><small>Difesa</small></div>
      <div><span>${rep.range}</span><small>Gittata</small></div>
    </div>
    <div class="hint" style="margin-top:6px;">${sel ? `Selezionato: ${sel.icon} ${sel.name} — ${sel.hp}/${sel.maxHp} Salute` : (allDead ? 'Gruppo sconfitto.' : 'Tocca un mostro sulla mappa per selezionarlo e attaccarlo.')}</div>
    ${info.canHit ? `<button class="btn small" id="attackBtn">⚔ Attacca (−${sel.def}⚡ Attacco)</button>` : ''}
  `;
  if(info.canHit){
    box.querySelector('#attackBtn').onclick = attackSelected;
  }
}

function render(){
  if(!state) return;
  const clsInfo = CLASSES[state.class];
  document.getElementById('levelBanner').textContent = `Livello ${state.level} di ${MAX_LEVEL} — ${MONSTER_TABLE[state.level].name} · ${clsInfo.icon} ${clsInfo.name}`;
  renderStats();
  renderDice();
  renderGrid();
  renderInspect();
  const rollBtn = document.getElementById('rollBtn');
  const endTurnBtn = document.getElementById('endTurnBtn');
  rollBtn.classList.toggle('hidden', state.phase!=='roll');
  endTurnBtn.classList.toggle('hidden', state.phase!=='act');
  rollBtn.disabled = state.animating;
  endTurnBtn.disabled = state.animating;
  writeSave();
}

document.getElementById('rollBtn').onclick = rollDice;
document.getElementById('endTurnBtn').onclick = endTurn;

/* ============================================================
   SPLASH SCREEN (menu iniziale + salvataggio in localStorage)
   ============================================================ */
function renderSplash(){
  const save = loadSave();
  const continueBtn = document.getElementById('continueBtn2');
  if(save){
    const cls = CLASSES[save.class] || CLASSES.none;
    continueBtn.textContent = `▶ Continua — ${cls.icon} ${cls.name}, Livello ${save.level}`;
    continueBtn.classList.remove('hidden');
  } else {
    continueBtn.classList.add('hidden');
  }
  const record = loadRecord();
  const recordBox = document.getElementById('recordBox');
  if(record>0){
    document.getElementById('recordVal').textContent = record;
    recordBox.classList.remove('hidden');
  } else {
    recordBox.classList.add('hidden');
  }
}

function showSplash(){
  document.getElementById('gameScreen').classList.add('hidden');
  document.getElementById('modalBg').classList.add('hidden');
  document.getElementById('splashScreen').classList.remove('hidden');
  renderSplash();
}

function showGame(){
  document.getElementById('splashScreen').classList.add('hidden');
  document.getElementById('gameScreen').classList.remove('hidden');
}

document.getElementById('newGameBtn').onclick = ()=>{ showClassSelect(); };

document.getElementById('continueBtn2').onclick = ()=>{
  const save = loadSave();
  if(!save) return;
  state = save;
  // In caso di salvataggio avvenuto a metà di un'animazione, si riparte "sbloccati".
  state.animating = false;
  state.animAttacker = null;
  showGame();
  render();
};

document.getElementById('resetBtn').onclick = ()=>{
  if(!confirm('Cancellare la partita in corso e il record? L\'azione non è reversibile.')) return;
  window.__ocdCache.save = null;
  window.__ocdCache.record = 0;
  window.OCDCloud && window.OCDCloud.persist();
  renderSplash();
};

document.getElementById('homeBtn').onclick = ()=>{ showSplash(); };

// L'avvio della schermata iniziale è pilotato da cloud.js, DOPO che
// l'utente ha effettuato il login e i dati sono stati caricati da Supabase.
window.OCDGame = { showSplash };
