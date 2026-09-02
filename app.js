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

/* ============================================================
   IMMAGINI (PNG) — caricamento automatico con fallback emoji
   ------------------------------------------------------------
   Nemici, boss e classi possono avere un'immagine PNG al posto
   dell'emoji. I file attesi (definiti in MONSTER_TABLE, BOSS_TABLE
   e CLASSES tramite la proprietà "img") vivono in:
     images/enemies/  images/bosses/  images/classes/
   Non serve alcun elenco/registro da aggiornare: all'avvio il
   gioco prova a caricare ciascun file atteso; se il file esiste
   viene ricordato come "disponibile" e usato da quel momento in
   poi, altrimenti resta l'emoji come oggi. Basta quindi caricare
   il png con il nome giusto nella cartella giusta perché il gioco
   lo riconosca in automatico al prossimo caricamento/refresh.
   ============================================================ */
const IMG_BASE = 'images/';
// Nome file atteso in images/items/ per la Cassa del Tesoro (espansione
// "M'Guf-yn Returns"). Stesso meccanismo di fallback delle altre immagini.
const CHEST_IMG = 'chest.png';
const imgStatus = {};      // "cartella/file.png" -> true (disponibile) | false (assente)
let imgRerenderQueued = false;

function preloadImg(relPath){
  if(!relPath || (relPath in imgStatus)) return;
  const im = new Image();
  im.onload = ()=>{ imgStatus[relPath] = true; queueImgRerender(); };
  im.onerror = ()=>{ imgStatus[relPath] = false; };
  im.src = IMG_BASE + relPath;
}

// Un'immagine può finire di caricare (async) dopo il primo render: quando
// succede, ri-disegniamo la schermata attualmente visibile così l'emoji
// viene sostituita dal png senza bisogno di un refresh manuale.
function queueImgRerender(){
  if(imgRerenderQueued) return;
  imgRerenderQueued = true;
  requestAnimationFrame(()=>{
    imgRerenderQueued = false;
    const gameScreen = document.getElementById('gameScreen');
    const splashScreen = document.getElementById('splashScreen');
    const modalBg = document.getElementById('modalBg');
    if(gameScreen && !gameScreen.classList.contains('hidden')) render();
    if(splashScreen && !splashScreen.classList.contains('hidden')) renderSplash();
    if(modalBg && !modalBg.classList.contains('hidden') && document.getElementById('cardsList')) showItemCards();
  });
}

// Markup per un token (nemico, boss, eroe in home): usa il png se disponibile,
// altrimenti l'emoji, esattamente come oggi.
function tokenMarkup(emoji, relPath, extraClass){
  const cls = extraClass ? ' '+extraClass : '';
  if(relPath && imgStatus[relPath]){
    return `<img class="token-img${cls}" src="${IMG_BASE}${relPath}" alt="">`;
  }
  return `<span class="token${cls}">${emoji}</span>`;
}

function preloadAllGameImages(){
  Object.values(MONSTER_TABLE).forEach(m=>{ if(m.img) preloadImg(`enemies/${m.img}`); });
  Object.values(BOSS_TABLE).forEach(b=>{ if(b.img) preloadImg(`bosses/${b.img}`); });
  Object.values(CLASSES).forEach(c=>{ if(c.img) preloadImg(`classes/${c.img}`); });
  Object.values(ITEM_CARDS).forEach(c=>{ if(c.img) preloadImg(`cards/${c.img}`); });
  preloadImg(`items/${CHEST_IMG}`);
}

// Icona quadrata per una riga del pannello "Le tue Carte": usa il png se
// disponibile (images/cards/...), altrimenti l'emoji, centrata nel riquadro.
function cardIconMarkup(emoji, relPath){
  if(relPath && imgStatus[relPath]){
    return `<img src="${IMG_BASE}${relPath}" alt="">`;
  }
  return emoji;
}

// Level 1 è confermato dalla carta ufficiale: 2 Ragni, Salute 2, Gittata 3, Difesa 4, Attacco 4, Velocità 5.
// Livelli 2-12 forniti dall'utente dal regolamento ufficiale.
// "img" = nome file atteso in images/enemies/ (usato al posto di "icon"
// quando il file è disponibile — vedi sezione IMMAGINI più sotto).
const MONSTER_TABLE = {
  1:  { name:"Ragno",     icon:"🕷️", img:"enemy_spider.png", hp:2, speed:5, atk:4, def:4, range:3, count:2 },
  2:  { name:"Scheletro", icon:"💀", img:"enemy_undead.png", hp:3, speed:4, atk:5, def:4, range:4, count:2 },
  3:  { name:"Orco",      icon:"👹", img:"enemy_orc.png",    hp:5, speed:3, atk:7, def:7, range:2, count:1 },
  4:  { name:"Demone",    icon:"😈", img:"enemy_demon.png",  hp:5, speed:5, atk:5, def:5, range:5, count:1 },
  5:  { name:"Ragno",     icon:"🕷️", img:"enemy_spider.png", hp:2, speed:5, atk:4, def:4, range:3, count:3 },
  6:  { name:"Scheletro", icon:"💀", img:"enemy_undead.png", hp:3, speed:4, atk:5, def:4, range:4, count:3 },
  7:  { name:"Orco",      icon:"👹", img:"enemy_orc.png",    hp:5, speed:3, atk:7, def:7, range:2, count:2 },
  8:  { name:"Demone",    icon:"😈", img:"enemy_demon.png",  hp:5, speed:5, atk:5, def:5, range:5, count:2 },
  9:  { name:"Ragno",     icon:"🕷️", img:"enemy_spider.png", hp:2, speed:5, atk:4, def:4, range:3, count:4 },
  10: { name:"Scheletro", icon:"💀", img:"enemy_undead.png", hp:3, speed:4, atk:5, def:4, range:4, count:4 },
  11: { name:"Orco",      icon:"👹", img:"enemy_orc.png",    hp:5, speed:3, atk:7, def:7, range:2, count:3 },
  12: { name:"Demone",    icon:"😈", img:"enemy_demon.png",  hp:5, speed:5, atk:5, def:5, range:5, count:3 },
};

// Character classes from the official "Game Variant" section of the rulebook.
// Le classi con "expansion" sono disponibili solo quando quella espansione è attiva.
// "img" = nome file atteso in images/classes/ (usato al posto di "icon"
// quando il file è disponibile — vedi sezione IMMAGINI più sotto).
const CLASSES = {
  none:      { name:"Classico",  icon:"🗡️", img:"class_classic.png",    desc:"Nessuna abilità speciale — il gioco base, senza varianti." },
  paladin:   { name:"Paladino",  icon:"🛡️", img:"class_paladin.png",    desc:"Una volta per Livello, puoi mantenere il valore di un dado Energia dal turno precedente invece di rilanciarlo." },
  barbarian: { name:"Barbaro",   icon:"🪓", img:"class_barbarian.png",  desc:"Quando sei a 1 Salute, puoi rilanciare tutti i dadi Energia (una volta per turno, senza limite di livello)." },
  ranger:    { name:"Ranger",    icon:"🏹", img:"class_ranger.png",     desc:"Una volta per Livello, puoi assegnare un dado alla Gittata invece che alla Velocità." },
  wizard:    { name:"Mago",      icon:"🔮", img:"class_wizard.png",     desc:"Una volta per Livello, puoi rilanciare tutti e tre i dadi Energia." },
  necromancer: { name:"Negromante", icon:"🧛", img:"class_necromancer.png", expansion:"mguf_yn_returns",
    desc:"Una volta per Livello, durante l'Azione, puoi perdere 1 Salute per infliggere 1 danno (ignora la Difesa) a un nemico in Gittata e Linea di Vista." },
  cleric: { name:"Chierico", icon:"✨", img:"class_cleric.png", expansion:"mguf_yn_returns",
    desc:"Ogni volta che i tre dadi Energia mostrano lo stesso valore, puoi aumentarli tutti di 2 (fino a un massimo di 6)." },
  knight: { name:"Cavaliere", icon:"🐴", img:"class_knight.png", expansion:"mguf_yn_returns",
    desc:"Una volta per Livello, puoi assegnare due dei tre dadi Energia alla stessa caratteristica (sommandoli); il terzo dado va su un'altra caratteristica." },
  thief: { name:"Ladro", icon:"🗝️", img:"class_thief.png", expansion:"mguf_yn_returns",
    desc:"Una volta per Livello, puoi aumentare di 1 il valore di tutti e tre i dadi Energia lanciati (nessun tetto massimo)." },
};

// Espansioni disponibili — attivabili/disattivabili dal bottone "Espansioni"
// in home, e combinabili liberamente tra loro.
const EXPANSIONS = {
  mguf_yn_returns: {
    name: "M'Guf-yn Returns",
    icon: "👑",
    desc: "4 Boss dopo i livelli 3-6-9-12, la Cassa del Tesoro e 4 nuove classi (Negromante, Chierico, Cavaliere, Ladro).",
  },
  item_cards: {
    name: "Carte Oggetto",
    icon: "🃏",
    desc: "A inizio partita ricevi 3 carte Oggetto casuali, usabili una sola volta ciascuna nei momenti giusti della partita. Compatibile con il gioco base e con le altre espansioni.",
  },
};

// Carte Oggetto: ogni carta indica quando è "usable" nello stato attuale del
// gioco (per abilitare/disabilitare il bottone nel pannello) e cosa fa "use()"
// quando viene giocata. La rimozione dalla mano (scarto) è gestita a parte in
// discardCard(), tranne per Fiamma del Fato che richiede una selezione prima
// di scartarsi davvero (vedi confirmFlameFate()).
// "img" = nome file atteso in images/cards/ (usato al posto dell'emoji
// quando il file è disponibile — vedi sezione IMMAGINI più sotto).
const ITEM_CARDS = {
  wyrm_speed: {
    name: "Estratto di Wyrm Spinato", icon: "🐉", img:"card_wyrm-speed.png", expansion:'item_cards',
    desc: "Aggiungi +4 al tuo movimento.",
    usable: ()=> state.phase==='act' && !state.animating,
    use(){
      state.itemBonus.speed += 4;
      log('🐉 Estratto di Wyrm Spinato: +4 Velocità per questo turno.');
      discardCard('wyrm_speed'); render();
    }
  },
  halve_damage: {
    name: "Dimezza i Danni Subiti", icon: "🩹", img:"card_halve-damage.png", expansion:'item_cards',
    desc: "Attivala prima di finire il turno: tutto il danno che subirai dai mostri questo turno viene dimezzato (arrotondato per eccesso).",
    usable: ()=> state.phase==='act' && !state.animating,
    use(){
      state.halveDamageThisTurn = true;
      log('🩹 Il danno subito questo turno sarà dimezzato.');
      discardCard('halve_damage'); render();
    }
  },
  flame_of_fate: {
    name: "Fiamma del Fato", icon: "🔥", img:"card_flame-of-fate.png", expansion:'item_cards',
    desc: "Rilancia uno o più dadi Energia non ancora assegnati e tieni il nuovo risultato.",
    usable: ()=> state.phase==='assign' && !state.animating && state.dice.some(d=>!d.target),
    use(){
      // Non si scarta subito: prima si scelgono i dadi da rilanciare (vedi
      // toggleFlameFateDie()/confirmFlameFate()/cancelFlameFate() nel tray).
      state.flameFateMode = true; state.flameFateSelected = [];
      render();
    }
  },
  rope_pick: {
    name: "Corda e Piccozza", icon: "⛏️", img:"card_rope-pick.png", expansion:'item_cards',
    desc: "Durante i tuoi attacchi standard di questo turno: +2 Attacco e +2 Gittata.",
    usable: ()=> state.phase==='act' && !state.animating,
    use(){
      state.itemBonus.atk += 2; state.itemBonus.range += 2;
      log('⛏️ Corda e Piccozza: +2 Attacco, +2 Gittata per i tuoi attacchi standard.');
      discardCard('rope_pick'); render();
    }
  },
  gorgon_head: {
    name: "Testa della Gorgona", icon: "🐍", img:"card_gorgon-head.png", expansion:'item_cards',
    desc: "Per questo turno, tutti i mostri hanno Velocità 0 (restano fermi, ma attaccano normalmente se già in Gittata).",
    usable: ()=> state.phase==='act' && !state.animating,
    use(){
      state.monsterSpeedOverride = 0;
      log('🐍 Testa della Gorgona: i mostri restano fermi questo turno.');
      discardCard('gorgon_head'); render();
    }
  },
  hourglass: {
    name: "Clessidra", icon: "⏳", img:"card_hourglass.png", expansion:'item_cards',
    desc: "Salta completamente la Fase Mostri: tocca subito di nuovo a te con una nuova Fase Energia.",
    usable: ()=> state.phase==='act' && !state.animating,
    use(){
      state.skipMonstersThisTurn = true;
      log('⏳ Clessidra: la Fase Mostri viene saltata, tocca di nuovo a te.');
      discardCard('hourglass'); render();
    }
  },
  black_powder: {
    name: "Polvere Nera", icon: "💥", img:"card_black-powder.png", expansion:'item_cards',
    desc: "Il prossimo danno che infliggi con un attacco standard colpisce anche tutti gli altri mostri, anche se fuori Gittata o Linea di Vista.",
    usable: ()=> state.phase==='act' && !state.animating,
    use(){
      state.blackPowderArmed = true;
      log('💥 Polvere Nera armata: il prossimo colpo si propagherà a tutti i mostri.');
      discardCard('black_powder'); render();
    }
  },
  dragon_eye: {
    name: "Occhio di Drago", icon: "👁️", img:"card_dragon-eye.png", expansion:'item_cards',
    desc: "Nel prossimo lancio, uno dei tre dadi Energia sarà un d12 invece di un d6.",
    usable: ()=> state.phase==='roll' && !state.animating,
    use(){
      state.dragonEyeArmed = true;
      log('👁️ Occhio di Drago: il prossimo lancio userà un d12.');
      discardCard('dragon_eye'); render();
    }
  },
};
function discardCard(id){
  const i = state.itemCards.indexOf(id);
  if(i>=0) state.itemCards.splice(i,1);
}
function itemAtkBonus(){ return (state.itemBonus && state.itemBonus.atk) || 0; }
function itemRangeBonus(){ return (state.itemBonus && state.itemBonus.range) || 0; }
function itemSpeedBonus(){ return (state.itemBonus && state.itemBonus.speed) || 0; }

// Boss dell'espansione "M'Guf-yn Returns": compaiono subito dopo aver
// sgominato i mostri del livello indicato (3, 6, 9, 12), prima di procedere
// al livello successivo. "walls" = quante delle 8 celle adiacenti al centro
// diventano Muro (posizione scelta a caso ad ogni run).
// "img" = nome file atteso in images/bosses/ (usato al posto di "icon"
// quando il file è disponibile — vedi sezione IMMAGINI più sotto).
const BOSS_TABLE = {
  3:  { name:"Minotauro", icon:"🐂", img:"boss_minotaur.png",   hp:7,  speed:3, atk:7, def:4, range:3, walls:2 },
  6:  { name:"Lich",      icon:"💀", img:"boss_lich.png",       hp:8,  speed:3, atk:6, def:5, range:5, walls:3 },
  9:  { name:"Insettoide",icon:"🦂", img:"boss_insectoid.png",  hp:10, speed:6, atk:7, def:6, range:3, walls:2 },
  12: { name:"M'Guf-yn",  icon:"🧞", img:"boss_mguf-yn.png",    hp:12, speed:6, atk:8, def:7, range:6, walls:3 },
};
const BOSS_LEVELS = new Set([3,6,9,12]);

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
window.__ocdCache = window.__ocdCache || { save: null, records: {}, settings: { expansions: {} } };

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

// Il record vale solo per "M'Guf-yn Returns attivo sì/no": le Carte Oggetto
// (e in futuro Eternal Peak/Harbour Clash) non creano record separati.
function modeKeyFor(expansions){ return (expansions && expansions.includes('mguf_yn_returns')) ? 'mguf_yn_returns' : 'vanilla'; }

// "rank" codifica in un solo numero sia il livello sia la fase (normale/boss),
// così i record restano facilmente confrontabili: livello 3 normale = 30,
// livello 3 boss = 35, livello 4 normale = 40, ecc.
function levelRank(level, phase){ return level*10 + (phase==='boss' ? 5 : 0); }
function rankToLabel(rank){
  const level = Math.floor(rank/10);
  const isBoss = (rank%10)===5;
  return isBoss ? `${level} · Boss` : `${level}`;
}

function loadRecord(expansionKey){
  const key = expansionKey || 'vanilla';
  return (window.__ocdCache.records && window.__ocdCache.records[key]) || 0;
}
function updateRecordIfHigher(rank, expansionKey){
  const key = expansionKey || 'vanilla';
  if(!window.__ocdCache.records) window.__ocdCache.records = {};
  if(rank > (window.__ocdCache.records[key]||0)){
    window.__ocdCache.records[key] = rank;
    window.OCDCloud && window.OCDCloud.persist();
  }
}
// Una "partita completata" è una run finita (morte o vittoria): a quel punto
// si aggiorna il record (della modalità giocata) col livello/fase raggiunti,
// e si azzera la partita salvata. Le Carte Oggetto NON registrano alcun
// record (né vanilla né M'Guf-yn Returns): una run con questo modulo attivo
// non è direttamente comparabile alle altre, quindi si salta l'aggiornamento.
function finishRun(){
  const rank = levelRank(state.level, state.levelPhase);
  const usesItemCards = state.expansions && state.expansions.includes('item_cards');
  if(!usesItemCards){
    updateRecordIfHigher(rank, modeKeyFor(state.expansions));
  }
  clearSave();
}

// Impostazioni persistite (quali espansioni sono attive dal bottone "Espansioni").
// Sono combinabili tra loro (es. M'Guf-yn Returns + Carte Oggetto insieme).
function loadActiveExpansions(){
  return (window.__ocdCache.settings && window.__ocdCache.settings.expansions) || {};
}
function setExpansionActive(id, active){
  if(!window.__ocdCache.settings) window.__ocdCache.settings = { expansions:{} };
  if(!window.__ocdCache.settings.expansions) window.__ocdCache.settings.expansions = {};
  window.__ocdCache.settings.expansions[id] = active;
  window.OCDCloud && window.OCDCloud.persist();
}

function newGame(){
  showClassSelect();
}

// Pesca 3 carte Oggetto casuali (senza ripetizioni) tra quelle disponibili
// per le espansioni attive in questa run.
function dealItemCards(expansions){
  const pool = Object.entries(ITEM_CARDS)
    .filter(([id,c])=> expansions.includes(c.expansion))
    .map(([id])=>id);
  const shuffled = pool.slice().sort(()=>Math.random()-0.5);
  return shuffled.slice(0,3);
}

function startRun(cls){
  const active = loadActiveExpansions();
  const expansions = Object.keys(active).filter(id=>active[id]);

  state = {
    level: 1,
    expansions,
    levelPhase: 'normal',
    class: cls,
    skills: { speed:1, atk:1, def:1, range:2 },
    hp: 6, maxHp: 6,
    dice: [], points:{speed:0,atk:0,def:0,range:0}, spent:{speed:0,atk:0},
    phase: 'roll',
    player: {x:0,y:0},
    walls: [],
    entryStair: {x:0,y:0}, exitStair: {x:GRID-1,y:GRID-1},
    monsters: [],
    chest: null, loot: 0, lootUsedStat: null, lootDieActive: false,
    clericBoostUsed: false,
    selectedDie: null, selectedMonster: null, selectedChest: null,
    prevDice: [],
    abilityUsed: { paladin:false, ranger:false, wizard:false, necromancer:false, knight:false, thief:false },
    barbarianUsedThisTurn: false,
    animating: false, animAttacker: null,
    // Carte Oggetto (modulo "item_cards", combinabile con qualsiasi altra espansione)
    itemCards: expansions.includes('item_cards') ? dealItemCards(expansions) : [],
    itemBonus: {speed:0, atk:0, def:0, range:0},
    halveDamageThisTurn: false,
    monsterSpeedOverride: null,
    skipMonstersThisTurn: false,
    blackPowderArmed: false,
    dragonEyeArmed: false,
    flameFateMode: false, flameFateSelected: [],
  };
  spawnLevel(1);
}

function totalRange(){ return state.skills.range + (state.points.range||0); }

function chebyshev(ax,ay,bx,by){ return Math.max(Math.abs(ax-bx), Math.abs(ay-by)); }

// Sceglie "count" celle da "candidatePool" (evitando quelle in "forbidden"),
// mantenendo la scacchiera completamente collegata a partire da (0,0).
// Usata sia per i Muri dei livelli normali sia per quelli delle stanze Boss.
function pickConnectedCells(candidatePool, count, forbidden){
  for(let attempt=0; attempt<40; attempt++){
    const candidates = candidatePool.filter(([x,y])=>!forbidden.has(key(x,y)));
    candidates.sort(()=>Math.random()-0.5);
    const chosen = [];
    for(const [x,y] of candidates){
      if(chosen.length>=count) break;
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
    if(chosen.length===count) return chosen;
  }
  return candidatePool.slice(0,count); // fallback estremamente improbabile
}

// Procedural wall placement (invented — the real card art isn't available to me).
// Walls avoid the player start, both stair tiles, and always leave the board connected.
function makeWalls(level, forbiddenExtra){
  // Le regole ufficiali prevedono sempre 3 celle Muro per scheda, a prescindere dal livello.
  const wallCount = 3;
  const forbidden = new Set([key(0,0), key(GRID-1,GRID-1), ...(forbiddenExtra||[])]);
  const allCells = [];
  for(let y=0;y<GRID;y++) for(let x=0;x<GRID;x++) allCells.push([x,y]);
  return pickConnectedCells(allCells, wallCount, forbidden);
}

function spawnNormalLevel(lvl){
  const t = MONSTER_TABLE[lvl];
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
    monsters.push({x,y,hp:t.hp,maxHp:t.hp,range:t.range,def:t.def,atk:t.atk,speed:t.speed,icon:t.icon,img:t.img?`enemies/${t.img}`:null,name:t.name,alive:true});
  }
  state.monsters = monsters;

  // Espansione "M'Guf-yn Returns" — Cassa del Tesoro: un tiro di 1d6 a inizio
  // livello, posizionata sulla scala opposta a quella d'ingresso. Fino a
  // quando non viene aperta conta come una casella Muro a tutti gli effetti.
  if(state.expansions.includes('mguf_yn_returns')){
    const roll = 1+Math.floor(Math.random()*6);
    state.chest = { x: state.exitStair.x, y: state.exitStair.y, roll, opened:false, img:`items/${CHEST_IMG}` };
  }
}

// Stanza del Boss: il boss occupa sempre la casella centrale; 2 o 3 delle 8
// caselle adiacenti (a seconda del boss) diventano Muro, scelte a caso a
// ogni run ma mantenendo la scacchiera collegata. Nessun altro mostro, nessuna
// Cassa del Tesoro. Ingresso e uscita restano le stesse di sempre.
function spawnBossLevel(lvl){
  const b = BOSS_TABLE[lvl];
  const cx = Math.floor(GRID/2), cy = Math.floor(GRID/2); // (2,2) su griglia 5x5
  const adjacentToCenter = [];
  for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
    if(dx===0 && dy===0) continue;
    adjacentToCenter.push([cx+dx, cy+dy]);
  }
  const forbidden = new Set([key(0,0), key(state.exitStair.x,state.exitStair.y), key(cx,cy)]);
  state.walls = pickConnectedCells(adjacentToCenter, b.walls, forbidden);

  state.monsters = [{
    x:cx, y:cy, hp:b.hp, maxHp:b.hp, range:b.range, def:b.def, atk:b.atk, speed:b.speed,
    icon:b.icon, img:b.img?`bosses/${b.img}`:null, name:b.name, alive:true, isBoss:true,
  }];
  // Nessuna cassa nei livelli boss.
}

// Random placement with hard constraints: nothing overlaps (walls / monsters / stairs),
// and no monster may spawn adjacent (orthogonally or diagonally) to the Adventurer's start tile.
function spawnLevel(lvl){
  state.player = {x:0,y:0};
  state.entryStair = {x:0,y:0};
  state.exitStair = {x:GRID-1,y:GRID-1};
  state.walls = []; state.monsters = []; state.chest = null;

  if(state.expansions.includes('mguf_yn_returns') && state.levelPhase==='boss'){
    spawnBossLevel(lvl);
  } else {
    spawnNormalLevel(lvl);
  }

  state.dice=[]; state.points={speed:0,atk:0,def:0,range:0}; state.spent={speed:0,atk:0};
  state.phase='roll'; state.selectedDie=null; state.selectedMonster=null; state.selectedChest=null;
  state.prevDice = [];
  state.abilityUsed = { paladin:false, ranger:false, wizard:false, necromancer:false, knight:false, thief:false };
  state.barbarianUsedThisTurn = false;
  state.lootUsedStat = null; state.lootDieActive = false; state.clericBoostUsed = false;
  // Carte Oggetto: bonus/flag "per turno" azzerati anche a inizio livello.
  state.itemBonus = {speed:0, atk:0, def:0, range:0};
  state.halveDamageThisTurn = false; state.monsterSpeedOverride = null;
  state.skipMonstersThisTurn = false; state.blackPowderArmed = false; state.dragonEyeArmed = false;
  state.flameFateMode = false; state.flameFateSelected = [];
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
  if(state.chest && !state.chest.opened && state.chest.x===x && state.chest.y===y) return 'chest';
  return null;
}
// Include anche la Cassa del Tesoro finché non è aperta: "è da considerarsi
// come un muro" per movimento e pathfinding di personaggio e mostri.
function wallSetOf(){
  const s = new Set(state.walls.map(([x,y])=>key(x,y)));
  if(state.chest && !state.chest.opened) s.add(key(state.chest.x, state.chest.y));
  return s;
}

function totalStat(k){ return state.skills[k] + state.points[k]; }

// Player's movement graph: blocked = walls + alive monsters (can't move onto or through them)
function playerBlocked(){
  const b = wallSetOf();
  for(const m of state.monsters) if(m.alive) b.add(key(m.x,m.y));
  return b;
}

function playerRangeTo(mx,my){
  const blocked = new Set(wallSetOf());
  // Se il bersaglio è proprio la cella occupata da un mostro o dalla Cassa del
  // Tesoro (non ancora aperta), la sua stessa cella non va considerata un
  // ostacolo per calcolarne la distanza — altrimenti sarebbe irraggiungibile.
  if(state.chest && !state.chest.opened && state.chest.x===mx && state.chest.y===my){
    blocked.delete(key(mx,my));
  }
  for(const m of state.monsters){ if(m.alive && !(m.x===mx&&m.y===my)) blocked.add(key(m.x,m.y)); }
  const {dist} = dijkstra(state.player.x, state.player.y, GRID, blocked);
  return dist[key(mx,my)];
}

function playerLoSTo(mx,my){
  const blocking = [...state.walls];
  if(state.chest && !state.chest.opened && !(state.chest.x===mx && state.chest.y===my)){
    blocking.push([state.chest.x, state.chest.y]);
  }
  for(const m of state.monsters){ if(m.alive && !(m.x===mx&&m.y===my)) blocking.push([m.x,m.y]); }
  return hasLoS(state.player.x, state.player.y, mx, my, blocking);
}

// Linea di Vista è una proprietà geometrica simmetrica: i muri, la Cassa del
// Tesoro chiusa, E le caselle occupate da ALTRI mostri bloccano la visuale in
// entrambe le direzioni. Questo helper calcola i bloccanti dal punto di vista
// di un mostro specifico (escludendo se stesso, ovviamente).
function monsterLosBlockers(excludeMonster){
  const blocking = [...state.walls];
  if(state.chest && !state.chest.opened) blocking.push([state.chest.x, state.chest.y]);
  for(const o of state.monsters){
    if(o!==excludeMonster && o.alive) blocking.push([o.x,o.y]);
  }
  return blocking;
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
// shown immediately at their final value (e.g. Paladino's kept die). Accetta i
// die object completi (non solo il valore) per sapere quali sono d12 (Occhio
// di Drago) e ciclare nel range corretto durante l'animazione.
function animateDiceRoll(diceObjs, lockedIndices){
  lockedIndices = lockedIndices||[];
  return new Promise(resolve=>{
    const row=document.getElementById('diceRow');
    const assignRow=document.getElementById('assignRow');
    if(assignRow) assignRow.innerHTML='';
    row.innerHTML='';
    const randFor = (d)=> 1+Math.floor(Math.random()*(d.isD12?12:6));
    const els = diceObjs.map((d,i)=>{
      const el=document.createElement('div');
      const locked = lockedIndices.includes(i);
      el.className='die'+(locked?' settled':' rolling')+(d.isD12?' d12':'');
      el.textContent = locked ? d.value : randFor(d);
      row.appendChild(el);
      return el;
    });
    let ticks=0;
    const iv=setInterval(()=>{
      els.forEach((el,i)=>{ if(!lockedIndices.includes(i)) el.textContent = randFor(diceObjs[i]); });
      ticks++;
      if(ticks>=7){
        clearInterval(iv);
        els.forEach((el,i)=>{ el.textContent=diceObjs[i].value; el.classList.remove('rolling'); el.classList.add('settled'); });
        setTimeout(resolve,180);
      }
    },70);
  });
}

/* ============================================================
   ENERGY PHASE (+ class abilities)
   ============================================================ */
// Occhio di Drago (Carte Oggetto): se armata, il PROSSIMO lancio dei dadi
// standard usa un d12 al posto di un d6 per uno dei tre dadi (l'ultimo, per
// non entrare mai in conflitto con il dado "mantenuto" del Paladino, che
// occupa sempre l'indice 0). La carta si consuma da sola qui, dato che può
// essere armata solo in Fase 'roll', cioè solo per il prossimo tiro.
function rollFreshDice(){
  const dice = [0,0,0].map(()=>({value:1+Math.floor(Math.random()*6), target:null, isD12:false}));
  if(state.dragonEyeArmed){
    dice[2].isD12 = true;
    dice[2].value = 1+Math.floor(Math.random()*12);
    state.dragonEyeArmed = false;
  }
  return dice;
}

async function rollDice(){
  if(state.phase!=='roll' || state.animating) return;
  state.animating = true;
  render();
  const fresh = rollFreshDice();
  await animateDiceRoll(fresh);
  state.dice = fresh;
  state.phase='assign';
  state.barbarianUsedThisTurn = false;
  state.clericBoostUsed = false;
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
  fresh[0] = {value:kept, target:null, isD12:false};
  await animateDiceRoll(fresh, [0]);
  state.dice = fresh;
  state.abilityUsed.paladin = true;
  state.phase='assign';
  state.barbarianUsedThisTurn = false;
  state.clericBoostUsed = false;
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
  await animateDiceRoll(fresh);
  state.dice = fresh;
  state.abilityUsed.wizard = true;
  state.clericBoostUsed = false;
  state.animating = false;
  log(`🔮 Abilità Mago: rilanci tutti i dadi. Nuovo tiro: ${state.dice.map(d=>d.value).join(', ')}`);
  render();
}

// Barbaro: while at 1 Health, reroll all dice (usable every turn, once per turn, before spending any).
async function barbarianReroll(){
  if(state.class!=='barbarian' || state.hp!==1) return;
  if(state.phase!=='assign' || state.barbarianUsedThisTurn || state.animating) return;
  if(state.dice.some(d=>d.target)) return;
  state.animating = true;
  render();
  state.points = {speed:0,atk:0,def:0,range:0};
  const fresh = rollFreshDice();
  await animateDiceRoll(fresh);
  state.dice = fresh;
  state.barbarianUsedThisTurn = true;
  state.clericBoostUsed = false;
  state.animating = false;
  log(`🪓 Abilità Barbaro (1 Salute): rilanci tutti i dadi. Nuovo tiro: ${state.dice.map(d=>d.value).join(', ')}`);
  render();
}

// Chierico: se i tre dadi Energia mostrano lo stesso valore, li aumenta tutti
// di 2 (tetto a 6). Utilizzabile ogni volta che la condizione si verifica
// (non è "una volta per livello"), ma una sola volta per singolo tiro.
function clericBoost(){
  if(state.class!=='cleric' || state.clericBoostUsed) return;
  if(state.phase!=='assign' || state.dice.some(d=>d.target) || state.animating) return;
  if(state.dice.length!==3) return;
  const [a,b,c] = state.dice.map(d=>d.value);
  if(!(a===b && b===c)) return;
  state.dice.forEach(d=>{ d.value = Math.min(6, d.value+2); });
  state.clericBoostUsed = true;
  log(`✨ Abilità Chierico: dadi in tris, aumentati di 2 (max 6). Nuovo tiro: ${state.dice.map(d=>d.value).join(', ')}`);
  render();
}

// Ladro: una volta per Livello, +1 al valore di tutti e tre i dadi Energia
// lanciati, SENZA alcun tetto massimo (un 6 diventa un 7).
function thiefBoost(){
  if(state.class!=='thief' || state.abilityUsed.thief) return;
  if(state.phase!=='assign' || state.dice.some(d=>d.target) || state.animating) return;
  state.dice.forEach(d=>{ d.value += 1; });
  state.abilityUsed.thief = true;
  log(`🗝️ Abilità Ladro: tutti i dadi +1. Nuovo tiro: ${state.dice.map(d=>d.value).join(', ')}`);
  render();
}

function selectDie(i){
  if(state.phase!=='assign' || state.animating) return;
  if(state.dice[i].target) return;
  state.lootDieActive = false; // selezionare un dado normale esce dalla modalità Dado Tesoro
  state.selectedDie = (state.selectedDie===i)?null:i;
  render();
}

// Fiamma del Fato (Carte Oggetto): seleziona uno o più dadi non ancora
// assegnati, poi conferma per rilanciarli tutti insieme (si tiene il nuovo
// risultato). Annullare non consuma la carta.
function toggleFlameFateDie(i){
  if(state.animating || !state.flameFateMode) return;
  if(state.dice[i].target) return;
  const idx = state.flameFateSelected.indexOf(i);
  if(idx>=0) state.flameFateSelected.splice(idx,1);
  else state.flameFateSelected.push(i);
  render();
}
function cancelFlameFate(){
  state.flameFateMode = false; state.flameFateSelected = [];
  render();
}
async function confirmFlameFate(){
  if(state.animating || !state.flameFateSelected.length) return;
  state.animating = true;
  render();
  const selected = state.flameFateSelected.slice();
  // Calcoliamo già ora i nuovi valori finali, così l'animazione mostra il
  // vero "tiro" (i dadi non selezionati restano fermi al valore attuale).
  const diceForAnim = state.dice.map((d,i)=>({
    value: selected.includes(i) ? (d.isD12 ? 1+Math.floor(Math.random()*12) : 1+Math.floor(Math.random()*6)) : d.value,
    isD12: d.isD12,
  }));
  const lockedIndices = state.dice.map((d,i)=>i).filter(i=>!selected.includes(i));
  await animateDiceRoll(diceForAnim, lockedIndices);
  selected.forEach(i=>{ state.dice[i].value = diceForAnim[i].value; });
  log(`🔥 Fiamma del Fato: rilanci ${selected.length} dado/i. Nuovo tiro: ${state.dice.map(d=>d.value).join(', ')}`);
  state.flameFateMode = false; state.flameFateSelected = [];
  state.clericBoostUsed = false; // nuovi valori: il Chierico può ricontrollare il tris
  discardCard('flame_of_fate');
  state.animating = false;
  render();
}

// Dado Tesoro (Cassa del Tesoro, espansione "M'Guf-yn Returns"): si comporta
// come un 4° dado giallo. Un click lo attiva/disattiva; mentre è attivo, ogni
// click su UNA caratteristica aggiunge 1 punto e toglie 1 al suo valore —
// niente limite ai click, si può "pompare" la stessa caratteristica finché il
// dado non si esaurisce. Selezionare un dado normale lo disattiva.
function toggleLootDie(){
  if(state.animating) return;
  if(!(state.phase==='roll' || state.phase==='assign')) return;
  if(!state.loot || state.loot<=0) return;
  state.lootDieActive = !state.lootDieActive;
  if(state.lootDieActive) state.selectedDie = null; // esce dalla selezione di un dado normale
  render();
}

function incrementLoot(stat){
  if(state.animating) return;
  if(!(state.phase==='roll' || state.phase==='assign')) return;
  if(!state.lootDieActive || !state.loot || state.loot<=0) return;
  if(state.lootUsedStat && state.lootUsedStat!==stat) return; // un solo valore per turno
  state.points[stat] = (state.points[stat]||0) + 1;
  state.loot -= 1;
  state.lootUsedStat = stat;
  log(`💰 Dado Tesoro: +1 a ${stat} (restano ${state.loot} punti Bottino).`);
  if(state.loot<=0) state.lootDieActive = false; // esaurito: esce da solo dalla modalità
  maybeAdvanceToAct(false);
  render();
}

// Regola ufficiale: un solo dado per caratteristica (niente somma di più dadi
// sulla stessa voce), e la Gittata del Ranger sostituisce la Velocità per il
// turno — non si possono usare entrambe nello stesso turno. Eccezione: il
// Cavaliere, una volta per Livello, può raddoppiare una caratteristica —
// l'abilità è sempre "pronta" (nessun bottone da attivare prima): basta
// toccare con un dado selezionato una caratteristica già occupata, finché
// non è già stata usata in questo livello.
function assignTo(stat){
  if(state.animating) return;
  if(state.selectedDie===null) return;
  const d = state.dice[state.selectedDie];
  if(d.target) return;

  const speedTaken = state.dice.some(x=>x.target==='speed');
  const atkTaken   = state.dice.some(x=>x.target==='atk');
  const defTaken   = state.dice.some(x=>x.target==='def');
  const rangeTaken = state.dice.some(x=>x.target==='range');

  // L'abilità Cavaliere si applica solo a velocità/attacco/difesa (mai a
  // gittata, che comunque solo il Ranger può mai bersagliare con un dado).
  const knightDouble = state.class==='knight' && !state.abilityUsed.knight &&
    ((stat==='speed'&&speedTaken) || (stat==='atk'&&atkTaken) || (stat==='def'&&defTaken));

  if(stat==='speed' && (speedTaken || rangeTaken) && !knightDouble) return;
  if(stat==='atk' && atkTaken && !knightDouble) return;
  if(stat==='def' && defTaken && !knightDouble) return;
  if(stat==='range'){
    if(state.class!=='ranger' || state.abilityUsed.ranger) return;
    if(rangeTaken || speedTaken) return;
    state.abilityUsed.ranger = true;
    log(`🏹 Abilità Ranger: assegni un dado (${d.value}) alla Gittata invece che alla Velocità.`);
  }

  d.target = stat;
  state.points[stat] += d.value;
  state.selectedDie = null;
  if(knightDouble){
    state.abilityUsed.knight = true;
    log(`🐴 Abilità Cavaliere: secondo dado (${d.value}) sommato sulla stessa caratteristica.`);
  }
  maybeAdvanceToAct(false);
  render();
}

// Passa alla Fase Azione SOLO se tutti e tre i dadi standard sono assegnati.
// Se resta ancora Bottino spendibile (Dado Tesoro > 0), l'avanzamento
// automatico si blocca: serve una conferma esplicita del giocatore (il
// bottone verde in basso diventa "Continua →" invece di "Fine Turno →"),
// perché potrebbe voler pompare ancora un'ultima volta una caratteristica
// prima di agire. force=true bypassa questa attesa (usato dal bottone stesso).
function maybeAdvanceToAct(force){
  if(!state.dice.length || !state.dice.every(d=>d.target)) return;
  if(!force && state.loot>0) return;
  if(state.phase==='act') return;
  state.phase='act';
  state.prevDice = state.dice.map(d=>d.value);
  log(`Energia assegnata — Velocità ${totalStat('speed')}, Attacco ${totalStat('atk')}, Difesa ${totalStat('def')}${state.points.range?`, Gittata +${state.points.range}`:''}`);
}
function confirmEnergyDone(){
  if(state.animating) return;
  maybeAdvanceToAct(true);
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
    const inRange = dist!==undefined && dist<=totalStat('range')+itemRangeBonus(); // fixed, unless boosted by the Ranger ability or item cards
    const los = playerLoSTo(x,y);
    const remAtk = totalStat('atk') + itemAtkBonus() - state.spent.atk;
    const canHit = inRange && los && remAtk>=m.def;
    return {type:'monster', monster:m, canHit, dist, los};
  }
  if(occ==='chest'){
    const dist = playerRangeTo(x,y);
    const inRange = dist!==undefined && dist<=totalStat('range')+itemRangeBonus();
    const los = playerLoSTo(x,y);
    const remAtk = totalStat('atk') + itemAtkBonus() - state.spent.atk;
    const canHit = inRange && los && remAtk>=state.chest.roll;
    return {type:'chest', canHit, dist, los};
  }
  if(occ==='player') return {type:null};
  const dist = playerRangeTo(x,y);
  const remSpeed = totalStat('speed') + itemSpeedBonus() - state.spent.speed;
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
    state.selectedChest = false;
    render();
  } else if(info.type==='chest'){
    state.selectedChest = true;
    state.selectedMonster = null;
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
  // Polvere Nera (Carte Oggetto): il danno di QUESTO attacco standard si
  // propaga a tutti gli altri mostri vivi, anche fuori Gittata/Linea di Vista.
  if(state.blackPowderArmed){
    state.blackPowderArmed = false;
    let hitCount = 0;
    state.monsters.forEach(other=>{
      if(other===m || !other.alive) return;
      other.hp -= 1;
      hitCount++;
      spawnFloatText(other.x, other.y, '-1', 'dmg');
      if(other.hp<=0) other.alive = false;
    });
    if(hitCount) log(`💥 Polvere Nera: il colpo si propaga ad altri ${hitCount} mostri.`);
  }
  render();
}

// Cassa del Tesoro: si apre come un mostro (Gittata + Linea di Vista),
// spendendo Attacco pari al valore del dado tesoro. Il bottino ottenuto si
// aggiunge a quello disponibile per il resto del livello (si spende poi
// tramite il Dado Tesoro, vedi toggleLootDie()/incrementLoot()).
function openChest(){
  if(state.animating) return;
  if(!state.chest || state.chest.opened) return;
  const info = cellInfo(state.chest.x, state.chest.y);
  if(info.type!=='chest' || !info.canHit) return;
  state.spent.atk += state.chest.roll;
  state.chest.opened = true;
  state.loot += state.chest.roll;
  spawnFloatText(state.chest.x, state.chest.y, `+${state.chest.roll}💰`, 'loot');
  log(`🎁 Apri la Cassa del Tesoro (−${state.chest.roll}⚡ Attacco): ottieni ${state.chest.roll} punti Bottino.`);
  state.selectedChest = false;
  render();
}

// Negromante: una volta per Livello, durante l'Azione, perde 1 Salute per
// infliggere 1 danno (ignora la Difesa) a un nemico in Gittata e Linea di
// Vista. Non consuma Attacco/energia. Non disponibile a 1 Salute.
// NOTA: non è "un attacco standard" — non beneficia dei bonus di Gittata delle
// Carte Oggetto (es. Corda e Piccozza) né viene esteso da Polvere Nera.
function necromancerTarget(){
  const m = state.selectedMonster;
  if(!m || !m.alive) return null;
  const dist = playerRangeTo(m.x,m.y);
  const inRange = dist!==undefined && dist<=totalStat('range');
  const los = playerLoSTo(m.x,m.y);
  return (inRange && los) ? m : null;
}
function necromancerStrike(){
  if(state.class!=='necromancer' || state.abilityUsed.necromancer) return;
  if(state.phase!=='act' || state.animating) return;
  if(state.hp<=1) return;
  const target = necromancerTarget();
  if(!target) return;
  state.hp -= 1;
  target.hp -= 1;
  spawnFloatText(target.x, target.y, '-1', 'dmg');
  state.abilityUsed.necromancer = true;
  if(target.hp<=0){
    target.alive = false;
    log(`🧛 Abilità Negromante: −1 Salute, abbatti ${target.name} ${target.icon} ignorandone la Difesa!`);
  } else {
    log(`🧛 Abilità Negromante: −1 Salute per infliggere 1 danno a ${target.name} ${target.icon} (ignora la Difesa).`);
  }
  render();
  if(state.hp<=0){ showGameOver(); }
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
    // Testa della Gorgona (Carte Oggetto): per questo turno tutti i mostri
    // hanno Velocità 0 (restano fermi, ma possono comunque attaccare dopo se
    // sono già in Gittata — la Fase Attacco non viene toccata da questa carta).
    const effSpeed = (state.monsterSpeedOverride!=null) ? state.monsterSpeedOverride : m.speed;

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

    // Bloccanti per la Linea di Vista di QUESTO mostro: muri + posizione
    // attuale degli altri mostri vivi (chi si è già mosso conta con la nuova
    // posizione, chi deve ancora muoversi con quella vecchia).
    const losBlockers = monsterLosBlockers(m);

    const candidates=[];
    for(let y=0;y<GRID;y++) for(let x=0;x<GRID;x++){
      const k=key(x,y);
      if(stopBlocked.has(k)) continue;
      if(mReach.dist[k]===undefined) continue;
      const rangeFromAdv = advReach.dist[k];
      if(rangeFromAdv===undefined) continue;
      const los = hasLoS(x,y,state.player.x,state.player.y, losBlockers);
      const moveCost = mReach.dist[k];
      // "reachable" = il mostro ha abbastanza Velocità per arrivarci in QUESTO
      // turno (non solo teoricamente raggiungibile ignorando il budget).
      candidates.push({x,y,rangeFromAdv,los,moveCost,reachable: moveCost<=effSpeed});
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
        let budget = effSpeed;
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
    const los = hasLoS(m.x,m.y,state.player.x,state.player.y, monsterLosBlockers(m));
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
  let dmg = totalDef>0 ? Math.floor(totalAtk/totalDef) : totalAtk;
  // Dimezza i Danni Subiti (Carte Oggetto): dimezza il danno finale di questo
  // turno, arrotondando per eccesso (es. 3 → 2).
  let halved = false;
  if(state.halveDamageThisTurn && dmg>0){
    dmg = Math.ceil(dmg/2);
    halved = true;
  }
  if(attackers.length===0){
    log(`Nessun mostro è in Gittata e Linea di Vista: nessun attacco subito.`);
  } else if(dmg<=0){
    log(`I mostri attaccano (Attacco tot. ${totalAtk} vs Difesa ${totalDef}): il tuo scudo regge, 0 danni.`);
    spawnFloatText(state.player.x, state.player.y, 'Miss', 'miss');
  } else {
    state.hp = Math.max(0, state.hp-dmg);
    log(`I mostri attaccano (${totalAtk} Attacco vs ${totalDef} Difesa): subisci ${dmg} danni${halved?' (dimezzati)':''}. Salute: ${state.hp}/${state.maxHp}`);
    spawnFloatText(state.player.x, state.player.y, '-'+dmg, 'dmg');
  }
  render();
}

async function endTurn(){
  if(state.phase!=='act' || state.animating) return;
  state.animating = true;
  render();

  // Clessidra (Carte Oggetto): salta COMPLETAMENTE la Fase Mostri (movimento
  // e attacco), tocca di nuovo a te con una Fase Energia tutta nuova.
  if(state.skipMonstersThisTurn){
    log(`⏳ La Fase Mostri viene saltata: tocca di nuovo a te.`);
  } else {
    await monsterMovementPhase();
    await monsterAttackPhase();
  }

  state.animating = false;
  state.dice=[]; state.points={speed:0,atk:0,def:0,range:0}; state.spent={speed:0,atk:0};
  state.selectedMonster=null; state.selectedChest=null; state.phase='roll';
  state.lootUsedStat = null; state.lootDieActive = false;
  // Reset dei bonus/flag "per turno" delle Carte Oggetto — comprese quelle
  // eventualmente non consumate (es. Testa della Gorgona resa inutile da
  // Clessidra nello stesso turno: la carta è comunque già stata scartata).
  state.itemBonus = {speed:0, atk:0, def:0, range:0};
  state.halveDamageThisTurn = false;
  state.monsterSpeedOverride = null;
  state.skipMonstersThisTurn = false;
  state.blackPowderArmed = false;
  state.flameFateMode = false; state.flameFateSelected = [];

  if(state.hp<=0){ render(); showGameOver(); return; }
  if(state.monsters.every(m=>!m.alive)){ render(); onLevelClear(); return; }
  render();
}

// Livello concluso. Con l'espansione "M'Guf-yn Returns" attiva, i livelli
// 3-6-9-12 si "espandono" in una seconda fase (il Boss) PRIMA della normale
// schermata "potenzia/cura", che viene quindi posticipata a dopo il Boss.
function onLevelClear(){
  if(state.expansions.includes('mguf_yn_returns') && state.levelPhase==='normal' && BOSS_LEVELS.has(state.level)){
    state.levelPhase = 'boss';
    spawnLevel(state.level);
    return;
  }
  // Il bottino non riportato a un Boss (livelli normali che non lo precedono,
  // o qualunque livello Boss appena concluso) va perso qui.
  state.loot = 0;
  if(state.levelPhase==='boss'){
    if(state.level>=MAX_LEVEL){ showVictory(); return; }
    showLevelUp();
    return;
  }
  if(state.level>=MAX_LEVEL){ showVictory(); return; }
  showLevelUp();
}

/* ============================================================
   MODALS
   ============================================================ */
function showClassSelect(){
  const bg=document.getElementById('modalBg'), m=document.getElementById('modalContent');
  const active = loadActiveExpansions();
  const visibleClasses = Object.entries(CLASSES).filter(([id,c])=> !c.expansion || active[c.expansion]);
  m.innerHTML = `
    <button class="modal-close" id="classCloseBtn" aria-label="Chiudi">✕</button>
    <h2>⚔ Scegli il tuo Eroe</h2>
    <div id="classList" style="display:flex; flex-direction:column; gap:8px; margin-top:10px;"></div>
  `;
  const list = m.querySelector('#classList');
  visibleClasses.forEach(([id,c])=>{
    const b=document.createElement('button');
    b.className='btn secondary';
    b.style.textAlign='left';
    b.innerHTML = `<div style="font-family:'Cinzel',serif;">${c.icon} ${c.name}</div><div style="font-family:'IM Fell English',serif; font-size:.72rem; text-transform:none; letter-spacing:normal; opacity:.85; margin-top:2px;">${c.desc}</div>`;
    b.onclick = ()=>{ bg.classList.add('hidden'); startRun(id); showGame(); };
    list.appendChild(b);
  });
  m.querySelector('#classCloseBtn').onclick = ()=>{ bg.classList.add('hidden'); };
  bg.classList.remove('hidden');
}

// Pannello Carte Oggetto: mostra le carte ancora in mano, con un bottone
// "Usa" attivo solo per quelle davvero giocabili nel momento attuale (fase
// di gioco corretta, condizioni soddisfatte). Le carte consumate spariscono
// dall'elenco (vedi discardCard()).
function showItemCards(){
  if(!state.itemCards.length) return;
  const bg=document.getElementById('modalBg'), m=document.getElementById('modalContent');
  m.innerHTML = `
    <button class="modal-close" id="cardsCloseBtn" aria-label="Chiudi">✕</button>
    <h2>🃏 Le tue Carte</h2>
    <div id="cardsList" style="display:flex; flex-direction:column; gap:8px; margin-top:10px;"></div>
  `;
  const list = m.querySelector('#cardsList');
  state.itemCards.forEach(id=>{
    const c = ITEM_CARDS[id];
    const usable = c.usable();
    const relPath = c.img ? `cards/${c.img}` : null;
    const b=document.createElement('button');
    b.className='cardpanel-row';
    b.disabled = !usable;
    b.innerHTML = `
      <div class="cardpanel-icon">${cardIconMarkup(c.icon, relPath)}</div>
      <div class="cardpanel-body">
        <div class="cardpanel-title">${c.name}</div>
        <div class="cardpanel-desc">${c.desc}</div>
      </div>`;
    if(usable) b.onclick = ()=>{ bg.classList.add('hidden'); c.use(); };
    list.appendChild(b);
  });
  m.querySelector('#cardsCloseBtn').onclick = ()=>{ bg.classList.add('hidden'); };
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
    <button class="heal-btn" id="healBtn">${healLabel}</button>
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
    state.levelPhase = 'normal';
    bg.classList.add('hidden');
    spawnLevel(state.level);
  };
}

function showGameOver(){
  finishRun();
  const bg=document.getElementById('modalBg'), m=document.getElementById('modalContent');
  const levelLabel = state.levelPhase==='boss' ? `${state.level} · Boss` : `${state.level}`;
  m.innerHTML = `<h2 style="color:var(--blood-bright)">💀 Sei Caduto</h2>
    <p>Il tuo Avventuriero soccombe al Livello ${levelLabel}. Il dungeon reclama un'altra anima...</p>
    <button class="btn gold" id="retryBtn">Torna al Menu</button>`;
  bg.classList.remove('hidden');
  m.querySelector('#retryBtn').onclick=()=>{ bg.classList.add('hidden'); showSplash(); };
}

function showVictory(){
  finishRun();
  const bg=document.getElementById('modalBg'), m=document.getElementById('modalContent');
  const bossVictory = state.expansions.includes('mguf_yn_returns') && state.levelPhase==='boss';
  m.innerHTML = `<h2 style="color:var(--gold-bright)">👑 Vittoria!</h2>
    <p>${bossVictory
      ? `Hai sconfitto <b>M'Guf-yn</b> in persona e riconquistato lo <b>Scettro</b>. Il tuo villaggio è salvo!`
      : `Hai abbattuto tutti i mostri del Livello 12 e conquistato lo <b>Scettro di M'Guf-yn</b>. Il tuo villaggio è salvo!`}</p>
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
  // Cavaliere: l'abilità è sempre "pronta" (nessun bottone da attivare prima)
  // finché non è già stata usata in questo livello.
  const knightAvail = state.class==='knight' && !state.abilityUsed.knight;
  // Dado Tesoro attivo: ogni caratteristica non ancora "bloccata" su un'altra
  // (regola: un solo valore per turno) diventa bersagliabile, SENZA i vincoli
  // del Ranger — il Bottino può andare su una qualsiasi delle quattro.
  const lootActive = !!state.lootDieActive && (state.phase==='roll'||state.phase==='assign') && !state.animating && state.loot>0;
  const lootFree = (s)=> !state.lootUsedStat || state.lootUsedStat===s;

  // Evidenziazione "normale" (bordo ember): prima assegnazione di un dado a
  // una caratteristica libera, o Bottino tramite il Dado Tesoro.
  const targetable = {
    speed: (canAssign && !speedTaken && !rangeTaken) || (lootActive && lootFree('speed')),
    atk:   (canAssign && !atkTaken) || (lootActive && lootFree('atk')),
    def:   (canAssign && !defTaken) || (lootActive && lootFree('def')),
    range: (lootActive && lootFree('range')),
  };
  // Evidenziazione "abilità" (bordo blu): Gittata del Ranger, e caratteristica
  // GIÀ occupata che il Cavaliere può raddoppiare.
  const targetableAbility = {
    speed: canAssign && knightAvail && speedTaken,
    atk:   canAssign && knightAvail && atkTaken,
    def:   canAssign && knightAvail && defTaken,
    range: canAssign && rangerAvail && !rangeTaken && !speedTaken,
  };

  function statBox(id,label,val,diceBonus,cardBonus){
    const cls = targetableAbility[id] ? ' target-active-ability' : (targetable[id] ? ' target-active' : '');
    const totalBonus = (diceBonus||0) + (cardBonus||0);
    const shown = val + totalBonus;
    return `<div class="stat${cls}" data-stat="${id}">
      <div class="lbl">${label}</div><div class="val${totalBonus?' boosted':''}">${shown}</div>
    </div>`;
  }

  row.innerHTML =
    `<div class="stat hp"><div class="lbl">Salute</div><div class="val">${state.hp}/${state.maxHp}</div></div>` +
    statBox('speed','Velocità', state.skills.speed, state.points.speed, itemSpeedBonus()) +
    statBox('atk','Attacco', state.skills.atk, state.points.atk, itemAtkBonus()) +
    statBox('def','Difesa', state.skills.def, state.points.def, 0) +
    statBox('range','Gittata', state.skills.range, state.points.range, itemRangeBonus());

  // Carte Oggetto: colonna verde, presente SOLO finché resta almeno una
  // carta in mano — scompare del tutto quando il contatore arriva a 0.
  // La fascia passa da 5 a 6 colonne (classe "has-cards") così la colonna
  // Carte resta sulla STESSA riga delle altre, invece di andare a capo.
  const showCards = state.expansions && state.expansions.includes('item_cards') && state.itemCards.length>0;
  row.classList.toggle('has-cards', showCards);
  if(showCards){
    const cardsBox = document.createElement('div');
    const anyUsable = state.itemCards.some(id => ITEM_CARDS[id].usable());
    cardsBox.className = 'stat cards-stat' + (anyUsable ? '' : ' cards-stat-dim');
    cardsBox.innerHTML = `<div class="lbl">Carte</div><div class="val">${state.itemCards.length}</div>`;
    cardsBox.onclick = showItemCards;
    row.appendChild(cardsBox);
  }

  row.querySelectorAll('.stat[data-stat]').forEach(el=>{
    const st = el.dataset.stat;
    if(targetable[st] || targetableAbility[st]) el.onclick = ()=> (state.lootDieActive ? incrementLoot(st) : assignTo(st));
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
    label.textContent = state.flameFateMode
      ? 'Fiamma del Fato: tocca i dadi non assegnati da rilanciare'
      : (state.selectedDie===null && !state.lootDieActive
        ? 'Tocca un dado, poi la caratteristica evidenziata'
        : 'Ora tocca la caratteristica a cui assegnarlo');
    state.dice.forEach((d,i)=>{
      const el=document.createElement('div');
      const flameSelectable = state.flameFateMode && !d.target;
      const flameSelected = flameSelectable && state.flameFateSelected.includes(i);
      el.className='die'+(d.target?' used':'')+(state.selectedDie===i?' selected':'')+(flameSelected?' flame-selected':'')+(d.isD12?' d12':'');
      el.textContent=d.value;
      el.onclick = flameSelectable ? ()=>toggleFlameFateDie(i) : ()=>selectDie(i);
      row.appendChild(el);
    });
    // Fiamma del Fato (Carte Oggetto): modalità di selezione dadi da rilanciare
    if(state.flameFateMode){
      const confirmBtn=document.createElement('button');
      confirmBtn.className='assign-btn'+(state.flameFateSelected.length?'':' disabled');
      confirmBtn.textContent=`🔥 Rilancia (${state.flameFateSelected.length})`;
      if(state.flameFateSelected.length) confirmBtn.onclick=confirmFlameFate;
      assignRow.appendChild(confirmBtn);
      const cancelBtn=document.createElement('button');
      cancelBtn.className='assign-btn'; cancelBtn.textContent='Annulla';
      cancelBtn.onclick=cancelFlameFate;
      assignRow.appendChild(cancelBtn);
    }
    // Mago: reroll-all, only before any die is assigned
    if(state.class==='wizard' && !state.abilityUsed.wizard && !state.dice.some(d=>d.target)){
      const b=document.createElement('button');
      b.className='assign-btn'; b.textContent='🔮 Rilancia tutti (Mago)';
      b.onclick=wizardReroll;
      assignRow.appendChild(b);
    }
    // Barbaro: reroll-all while at 1 Health, once per turn, only before any die is assigned
    if(state.class==='barbarian' && state.hp===1 && !state.barbarianUsedThisTurn && !state.dice.some(d=>d.target)){
      const b=document.createElement('button');
      b.className='assign-btn'; b.textContent='🪓 Rilancia tutti (Barbaro)';
      b.onclick=barbarianReroll;
      assignRow.appendChild(b);
    }
    // Chierico: tris di dadi uguali → +2 a tutti (max 6), prima di assegnare
    if(state.class==='cleric' && !state.clericBoostUsed && !state.dice.some(d=>d.target)){
      const [a,b2,c] = state.dice.map(d=>d.value);
      if(a===b2 && b2===c){
        const b=document.createElement('button');
        b.className='assign-btn'; b.textContent='✨ Tris! Aumenta tutti di 2 (Chierico)';
        b.onclick=clericBoost;
        assignRow.appendChild(b);
      }
    }
    // Ladro: una volta per Livello, tutti i dadi +1 (nessun tetto)
    if(state.class==='thief' && !state.abilityUsed.thief && !state.dice.some(d=>d.target)){
      const b=document.createElement('button');
      b.className='assign-btn'; b.textContent='🗝️ Tutti i dadi +1 (Ladro)';
      b.onclick=thiefBoost;
      assignRow.appendChild(b);
    }
    // Cavaliere: nessun bottone — l'abilità è sempre "pronta" (vedi bordo blu
    // sulle caratteristiche già occupate in renderStats()) finché non usata.
    // La conferma per proseguire con il Bottino ancora disponibile si fa ora
    // dal bottone verde in basso ("Continua →"), non più da qui.
  } else if(state.phase==='act'){
    label.textContent = `Velocità disp. ${totalStat('speed')+itemSpeedBonus()-state.spent.speed} · Attacco disp. ${totalStat('atk')+itemAtkBonus()-state.spent.atk}`;
    // Negromante: una volta per Livello, −1 Salute per 1 danno che ignora la
    // Difesa a un nemico in Gittata + Linea di Vista (non a 1 Salute).
    if(state.class==='necromancer' && !state.abilityUsed.necromancer && state.hp>1){
      const target = necromancerTarget();
      const b=document.createElement('button');
      b.className='assign-btn'+(!target?' disabled':'');
      b.textContent='🧛 Colpo Negromante (−1 Salute, ignora Difesa)';
      if(target) b.onclick=necromancerStrike;
      assignRow.appendChild(b);
    }
  }
  // Il Dado Tesoro compare SOLO quando i tre dadi standard sono già visibili
  // nel tray (Fase "assign"), mai prima del lancio e mai in Fase Azione.
  // Il suo funzionamento resta invariato: si può usare prima, durante o dopo
  // l'assegnazione degli altri tre dadi.
  if(state.phase==='assign') renderLootDie(row);
}

function renderLootDie(row){
  if(!state.loot || state.loot<=0) return;
  const el=document.createElement('div');
  el.className='die loot-die'+(state.lootDieActive?' selected':'');
  el.textContent=state.loot;
  el.title='Dado Tesoro';
  el.onclick=toggleLootDie;
  row.appendChild(el);
}

function renderGrid(){
  const grid=document.getElementById('grid');
  // minmax(0,1fr) e non 1fr: con 1fr il minimo della riga e' il contenuto
  // (l'emoji), e la griglia non potrebbe accorciarsi quando lo spazio in
  // verticale scarseggia. Vedi il blocco "ADATTAMENTO IN ALTEZZA" in style.css.
  grid.style.gridTemplateColumns = `repeat(${GRID},minmax(0,1fr))`;
  grid.style.gridTemplateRows = `repeat(${GRID},minmax(0,1fr))`;
  grid.innerHTML='';
  // Solo i Muri "veri" (non la Cassa) prendono lo stile grigio: la Cassa ha
  // una resa visiva propria pur bloccando il movimento come un Muro.
  const rawWallSet = new Set(state.walls.map(([wx,wy])=>key(wx,wy)));
  for(let y=0;y<GRID;y++){
    for(let x=0;x<GRID;x++){
      const cell=document.createElement('div');
      cell.className='cell';
      const k=key(x,y);
      const isWall = rawWallSet.has(k);
      // Le immagini PNG (a differenza delle emoji) sono ancorate al bordo
      // inferiore della cella e possono "sbordare" verso l'alto quando la
      // griglia si comprime in altezza. Perché la profondità risulti
      // corretta, le righe più in basso devono stare visivamente sopra
      // quelle più in alto (in primo piano rispetto a quelle dietro).
      // I Muri fanno eccezione: stanno sempre in primo piano (z-index 6,
      // impostato qui perché lo z-index inline avrebbe altrimenti la
      // precedenza sulla regola CSS ".cell.wall").
      cell.style.zIndex = isWall ? 6 : y+1;
      const isChestCell = state.chest && !state.chest.opened && state.chest.x===x && state.chest.y===y;
      const isEntry = x===state.entryStair.x && y===state.entryStair.y;
      const isExit = x===state.exitStair.x && y===state.exitStair.y;
      if(isWall) cell.classList.add('wall');
      if((isEntry||isExit) && !isWall && !isChestCell) cell.classList.add('stair');

      const isPlayer = state.player.x===x && state.player.y===y;
      const monster = state.monsters.find(m=>m.alive && m.x===x && m.y===y);

      if(state.phase==='act' && !isWall){
        const info = cellInfo(x,y);
        if(info.type==='move') cell.classList.add('reachable');
        if((info.type==='monster' || info.type==='chest') && info.canHit) cell.classList.add('attackable');
      }
      if(state.selectedMonster && monster===state.selectedMonster) cell.classList.add('selected-monster');
      if(state.selectedChest && isChestCell) cell.classList.add('selected-monster');
      if(state.animAttacker && monster===state.animAttacker) cell.classList.add('attacking');

      if(isPlayer){
        cell.classList.add('player');
        const clsInfo = CLASSES[state.class] || CLASSES.none;
        cell.innerHTML = `${tokenMarkup(clsInfo.icon, clsInfo.img ? `classes/${clsInfo.img}` : null, 'player-token')}<span class="hp-badge">${state.hp}</span>`;
      } else if(monster){
        cell.innerHTML = `${tokenMarkup(monster.icon, monster.img, monster.isBoss?'boss-token':'')}<span class="hp-badge">${monster.hp}</span>`;
      } else if(isChestCell){
        cell.classList.add('chest');
        cell.innerHTML = `${tokenMarkup('🎁', state.chest.img, 'chest-token')}<span class="chest-badge">${state.chest.roll}</span>`;
      }
      cell.onclick=()=>handleCellClick(x,y);
      grid.appendChild(cell);
    }
  }
}

function renderInspect(){
  const box=document.getElementById('inspect');
  let html = '';

  if(state.monsters.length){
    // Ogni mostro del livello è una copia identica (tranne i Boss, sempre da
    // soli): un solo blocco di caratteristiche basta per tutti, sempre
    // visibile. La Salute mostrata è quella MASSIMA della singola creatura
    // (non la somma del gruppo), come sulla carta ufficiale.
    const rep = state.monsters[0];
    const allDead = state.monsters.every(m=>!m.alive);

    const sel = (state.selectedMonster && state.selectedMonster.alive) ? state.selectedMonster : null;
    const info = (sel && state.phase==='act') ? cellInfo(sel.x, sel.y) : {canHit:false};

    html += `
      <div class="title">${rep.isBoss?'👑 ':''}${rep.icon} ${rep.name}${allDead?' (sconfitto)':''}</div>
      <div class="mstats">
        <div><span>${rep.maxHp}</span><small>Salute</small></div>
        <div><span>${rep.speed}</span><small>Velocità</small></div>
        <div><span>${rep.atk}</span><small>Attacco</small></div>
        <div><span>${rep.def}</span><small>Difesa</small></div>
        <div><span>${rep.range}</span><small>Gittata</small></div>
      </div>
      ${info.canHit ? `<button class="btn small" id="attackBtn">⚔ Attacca (−${sel.def}⚡ Attacco)</button>` : ''}
    `;
  }

  if(state.chest && !state.chest.opened){
    const chestInfo = (state.selectedChest && state.phase==='act') ? cellInfo(state.chest.x, state.chest.y) : {canHit:false};
    if(chestInfo.canHit){
      html += `<button class="btn small gold" id="openChestBtn" style="margin-top:${state.monsters.length?'10px':'0'};">🎁 Apri (−${state.chest.roll}⚡ Attacco)</button>`;
    }
  }

  box.innerHTML = html;
  const attackBtn = box.querySelector('#attackBtn');
  if(attackBtn) attackBtn.onclick = attackSelected;
  const openBtn = box.querySelector('#openChestBtn');
  if(openBtn) openBtn.onclick = openChest;
}

function render(){
  if(!state) return;
  const clsInfo = CLASSES[state.class];
  const isBossPhase = state.levelPhase==='boss';
  const enemyName = isBossPhase ? BOSS_TABLE[state.level].name : MONSTER_TABLE[state.level].name;
  const levelText = isBossPhase ? `Livello ${state.level} · Boss` : `Livello ${state.level} di ${MAX_LEVEL}`;
  document.getElementById('levelBanner').textContent = `${levelText} — ${isBossPhase?'👑 ':''}${enemyName} · ${clsInfo.icon} ${clsInfo.name}`;
  renderStats();
  renderDice();
  renderGrid();
  renderInspect();
  const rollBtn = document.getElementById('rollBtn');
  const endTurnBtn = document.getElementById('endTurnBtn');
  // Bottino ancora da spendere dopo aver assegnato i tre dadi standard: il
  // bottone verde in basso resta lo stesso, ma con etichetta e azione diverse
  // ("Continua →" per confermare che si passa alla Fase Azione), invece di
  // un piccolo bottone separato nel tray.
  const awaitingLootConfirm = state.phase==='assign' && state.dice.length>0 && state.dice.every(d=>d.target) && state.loot>0;
  rollBtn.classList.toggle('hidden', state.phase!=='roll');
  endTurnBtn.classList.toggle('hidden', state.phase!=='act' && !awaitingLootConfirm);
  if(awaitingLootConfirm){
    endTurnBtn.textContent = 'Continua →';
    endTurnBtn.onclick = confirmEnergyDone;
  } else {
    endTurnBtn.textContent = 'Fine Turno →';
    endTurnBtn.onclick = endTurn;
  }
  rollBtn.disabled = state.animating;
  endTurnBtn.disabled = state.animating;
  writeSave();
}

document.getElementById('rollBtn').onclick = rollDice;

/* ============================================================
   SPLASH SCREEN (menu iniziale + salvataggio in localStorage)
   ============================================================ */
function renderSplash(){
  const save = loadSave();
  const continueBtn = document.getElementById('continueBtn2');
  if(save){
    const cls = CLASSES[save.class] || CLASSES.none;
    const savedLevelLabel = save.levelPhase==='boss' ? `${save.level} · Boss` : `${save.level}`;
    continueBtn.textContent = `▶ Continua — ${cls.icon} ${cls.name}, Livello ${savedLevelLabel}`;
    continueBtn.classList.remove('hidden');
  } else {
    continueBtn.classList.add('hidden');
  }

  // Icona dell'eroe in home: se c'è una partita salvata, l'immagine della
  // classe in uso (fallback emoji se manca); altrimenti l'eroe "Classico"
  // (fallback emoji se anche class_classic.png non è ancora disponibile).
  const heroBox = document.getElementById('splashHeroIcon');
  if(heroBox){
    const cls = save ? (CLASSES[save.class] || CLASSES.none) : CLASSES.none;
    heroBox.innerHTML = tokenMarkup(cls.icon, cls.img ? `classes/${cls.img}` : null, 'splash-hero-token');
  }

  // Un record indipendente per modalità: vanilla + una riga per ogni espansione.
  const recordBox = document.getElementById('recordBox');
  const lines = [];
  const vanillaRank = loadRecord(null);
  if(vanillaRank>0) lines.push(`🏆 Vanilla — Livello ${rankToLabel(vanillaRank)}`);
  Object.keys(EXPANSIONS).forEach(id=>{
    const rank = loadRecord(id);
    if(rank>0) lines.push(`🏆 ${EXPANSIONS[id].name} — Livello ${rankToLabel(rank)}`);
  });
  if(lines.length){
    document.getElementById('recordVal').innerHTML = lines.join('<br>');
    recordBox.classList.remove('hidden');
  } else {
    recordBox.classList.add('hidden');
  }
}

function showExpansionSelect(){
  const bg=document.getElementById('modalBg'), m=document.getElementById('modalContent');
  const render2 = ()=>{
    const active = loadActiveExpansions();
    m.innerHTML = `
      <button class="modal-close" id="expCloseBtn" aria-label="Chiudi">✕</button>
      <h2>👑 Espansioni</h2>
      <p style="font-size:.8rem;">Attiva le espansioni che vuoi usare nella tua prossima "Nuova Partita" (sono combinabili tra loro). Puoi cambiarle in qualsiasi momento da qui.</p>
      <div id="expList" style="display:flex; flex-direction:column; gap:8px; margin-top:10px;"></div>
    `;
    const list = m.querySelector('#expList');
    Object.entries(EXPANSIONS).forEach(([id,e])=>{
      const isActive = !!active[id];
      const b=document.createElement('button');
      b.className = 'btn secondary' + (isActive?' picked':'');
      b.style.textAlign='left';
      b.innerHTML = `<div style="font-family:'Cinzel',serif;">${e.icon} ${e.name} ${isActive?'✔':''}</div><div style="font-family:'IM Fell English',serif; font-size:.72rem; text-transform:none; letter-spacing:normal; opacity:.85; margin-top:2px;">${e.desc}</div>`;
      b.onclick = ()=>{ setExpansionActive(id, !isActive); render2(); };
      list.appendChild(b);
    });
    m.querySelector('#expCloseBtn').onclick = ()=>{ bg.classList.add('hidden'); };
  };
  render2();
  bg.classList.remove('hidden');
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
document.getElementById('expansionsBtn').onclick = ()=>{ showExpansionSelect(); };

document.getElementById('continueBtn2').onclick = ()=>{
  const save = loadSave();
  if(!save) return;
  state = save;
  // In caso di salvataggio avvenuto a metà di un'animazione, si riparte "sbloccati".
  state.animating = false;
  state.animAttacker = null;
  // Retrocompatibilità con salvataggi precedenti al refactor multi-espansione
  // (avevano un singolo "expansion" invece di un array "expansions") e/o
  // precedenti all'introduzione delle Carte Oggetto.
  if(!Array.isArray(state.expansions)){
    state.expansions = state.expansion ? [state.expansion] : [];
  }
  if(!Array.isArray(state.itemCards)) state.itemCards = [];
  if(!state.itemBonus) state.itemBonus = {speed:0, atk:0, def:0, range:0};
  if(state.halveDamageThisTurn===undefined) state.halveDamageThisTurn = false;
  if(state.monsterSpeedOverride===undefined) state.monsterSpeedOverride = null;
  if(state.skipMonstersThisTurn===undefined) state.skipMonstersThisTurn = false;
  if(state.blackPowderArmed===undefined) state.blackPowderArmed = false;
  if(state.dragonEyeArmed===undefined) state.dragonEyeArmed = false;
  if(!Array.isArray(state.flameFateSelected)) state.flameFateSelected = [];
  state.flameFateMode = false; // non si riprende mai a metà di una selezione
  showGame();
  render();
};

document.getElementById('resetBtn').onclick = ()=>{
  if(!confirm('Cancellare la partita in corso e tutti i record? L\'azione non è reversibile.')) return;
  window.__ocdCache.save = null;
  window.__ocdCache.records = {};
  window.OCDCloud && window.OCDCloud.persist();
  renderSplash();
};

document.getElementById('homeBtn').onclick = ()=>{ showSplash(); };

// Avvia subito il tentativo di caricamento di tutte le immagini PNG
// conosciute (nemici, boss, classi): non blocca nulla, semplicemente
// quando/se un file risulta disponibile il gioco lo userà da quel
// momento in poi al posto dell'emoji.
preloadAllGameImages();

// L'avvio della schermata iniziale è pilotato da cloud.js, DOPO che
// l'utente ha effettuato il login e i dati sono stati caricati da Supabase.
window.OCDGame = { showSplash };
