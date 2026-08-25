/* ============================================================
   OCD CLOUD — login/registrazione + salvataggio partita su Supabase
   Sostituisce il vecchio salvataggio in localStorage: la partita e il
   record vengono letti/scritti nella tabella "one_card_dungeon_game_saves", una riga
   per utente, protetta da Row Level Security (solo il proprietario
   può leggerla o scriverla).
   ============================================================ */

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let persistTimer = null;

/* ---------- helpers UI ---------- */
function $(id){ return document.getElementById(id); }
function showScreen(id){
  ['authScreen','loadingScreen','splashScreen','gameScreen'].forEach(s=>{
    $(s).classList.toggle('hidden', s!==id);
  });
  $('modalBg').classList.add('hidden');
}
function setAuthMode(mode){
  $('authTitle').textContent = mode==='login' ? 'Accedi' : 'Registrati';
  $('authSubmitBtn').textContent = mode==='login' ? 'Accedi' : 'Crea account';
  $('authSwitchText').innerHTML = mode==='login'
    ? `Non hai un account? <a id="authSwitchLink">Registrati</a>`
    : `Hai già un account? <a id="authSwitchLink">Accedi</a>`;
  $('authSwitchLink').onclick = ()=> setAuthMode(mode==='login' ? 'register' : 'login');
  $('authForm').dataset.mode = mode;
  $('authError').classList.add('hidden');
  $('authInfo').classList.add('hidden');
}

/* ---------- caricamento dati partita da Supabase ---------- */
async function loadGameData(userId){
  const { data, error } = await sb
    .from('one_card_dungeon_game_saves')
    .select('save, record')
    .eq('user_id', userId)
    .maybeSingle();
  if(error){ console.error('Errore caricamento partita:', error); }
  window.__ocdCache.save = data ? data.save : null;
  window.__ocdCache.record = data ? (data.record||0) : 0;
}

/* ---------- scrittura (debounced) su Supabase ---------- */
window.OCDCloud = {
  persist(){
    if(!currentUser) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(async ()=>{
      const { error } = await sb.from('one_card_dungeon_game_saves').upsert({
        user_id: currentUser.id,
        save: window.__ocdCache.save,
        record: window.__ocdCache.record,
        updated_at: new Date().toISOString()
      });
      if(error) console.error('Errore salvataggio su Supabase:', error);
    }, 500);
  }
};

/* ---------- avvio dopo login ---------- */
async function enterApp(user){
  currentUser = user;
  showScreen('loadingScreen');
  await loadGameData(user.id);
  $('userEmailLine').textContent = user.email || '';
  showScreen('splashScreen');
  window.OCDGame.showSplash();
}

function backToAuth(){
  currentUser = null;
  window.__ocdCache = { save: null, record: 0 };
  setAuthMode('login');
  showScreen('authScreen');
}

/* ---------- form login/registrazione ---------- */
$('authForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const mode = $('authForm').dataset.mode;
  const email = $('authEmail').value.trim();
  const password = $('authPassword').value;
  $('authError').classList.add('hidden');
  $('authInfo').classList.add('hidden');
  $('authSubmitBtn').disabled = true;
  try{
    if(mode==='register'){
      const { data, error } = await sb.auth.signUp({ email, password });
      if(error) throw error;
      if(data.session){
        await enterApp(data.user);
      } else {
        $('authInfo').textContent = 'Account creato. Controlla la tua email per confermare, poi accedi.';
        $('authInfo').classList.remove('hidden');
        setAuthMode('login');
      }
    } else {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if(error) throw error;
      await enterApp(data.user);
    }
  } catch(err){
    $('authError').textContent = err.message || 'Errore. Riprova.';
    $('authError').classList.remove('hidden');
  } finally {
    $('authSubmitBtn').disabled = false;
  }
});

/* ---------- logout (bottone nella schermata iniziale) ---------- */
document.addEventListener('DOMContentLoaded', ()=>{
  const logoutBtn = $('logoutBtn');
  if(logoutBtn){
    logoutBtn.onclick = async ()=>{
      await sb.auth.signOut();
      backToAuth();
    };
  }
});

/* ---------- avvio: c'è già una sessione valida? ---------- */
(async function init(){
  setAuthMode('login');
  const { data:{ session } } = await sb.auth.getSession();
  if(session && session.user){
    await enterApp(session.user);
  } else {
    showScreen('authScreen');
  }
})();
