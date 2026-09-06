/* ============================================================
   OCD CLOUD — login/registrazione + salvataggio partita su Supabase
   Sostituisce il vecchio salvataggio in localStorage: la partita e il
   record vengono letti/scritti nella tabella "one_card_dungeon_game_saves", una riga
   per utente, protetta da Row Level Security (solo il proprietario
   può leggerla o scriverla).
   ============================================================ */

// flowType:'implicit' → il link di reset contiene direttamente il token
// nell'URL (dopo #), invece del flusso PKCE (che manda solo un "code" e
// richiede di essere aperto nello stesso browser/contesto che ha fatto la
// richiesta — motivo tipico per cui il link "funzionava" ma non attivava
// la schermata di reset password: l'exchange del code falliva in silenzio
// se l'email veniva aperta in un altro browser/app). Con l'implicito il
// link è autosufficiente e funziona ovunque venga aperto.
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { flowType: 'implicit' }
});

let currentUser = null;
let persistTimer = null;

/* ---------- helpers UI ---------- */
function $(id){ return document.getElementById(id); }
function showScreen(id){
  ['authScreen','loadingScreen','splashScreen','gameScreen','resetPasswordScreen'].forEach(s=>{
    $(s).classList.toggle('hidden', s!==id);
  });
  $('modalBg').classList.add('hidden');
}
function setAuthMode(mode){
  // mode: 'login' | 'register' | 'forgot'
  $('authPasswordWrap').classList.toggle('hidden', mode==='forgot');
  $('forgotPasswordLink').classList.toggle('hidden', mode!=='login');
  if(mode==='forgot'){
    $('authTitle').textContent = 'Recupera password';
    $('authSubmitBtn').textContent = 'Invia link di reset';
    $('authSwitchText').innerHTML = `Ricordi la password? <a id="authSwitchLink">Accedi</a>`;
  } else {
    $('authTitle').textContent = mode==='login' ? 'Accedi' : 'Registrati';
    $('authSubmitBtn').textContent = mode==='login' ? 'Accedi' : 'Crea account';
    $('authSwitchText').innerHTML = mode==='login'
      ? `Non hai un account? <a id="authSwitchLink">Registrati</a>`
      : `Hai già un account? <a id="authSwitchLink">Accedi</a>`;
  }
  $('authSwitchLink').onclick = ()=> setAuthMode(mode==='forgot' ? 'login' : (mode==='login' ? 'register' : 'login'));
  $('authForm').dataset.mode = mode;
  $('authError').classList.add('hidden');
  $('authInfo').classList.add('hidden');
}

/* ---------- caricamento dati partita da Supabase ---------- */
async function loadGameData(userId){
  const { data, error } = await sb
    .from('one_card_dungeon_game_saves')
    .select('save, records, settings')
    .eq('user_id', userId)
    .maybeSingle();
  if(error){ console.error('Errore caricamento partita:', error); }
  window.__ocdCache.save = data ? data.save : null;
  window.__ocdCache.records = (data && data.records) ? data.records : {};
  window.__ocdCache.settings = (data && data.settings) ? data.settings : { expansions:{} };
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
        records: window.__ocdCache.records,
        settings: window.__ocdCache.settings,
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

/* ---------- form login/registrazione/recupero password ---------- */
$('forgotPasswordLink').addEventListener('click', (e)=>{
  e.preventDefault();
  setAuthMode('forgot');
});

$('authForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const mode = $('authForm').dataset.mode;
  const email = $('authEmail').value.trim();
  const password = $('authPassword').value;
  $('authError').classList.add('hidden');
  $('authInfo').classList.add('hidden');
  $('authSubmitBtn').disabled = true;
  try{
    if(mode==='forgot'){
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL });
      if(error) throw error;
      $('authInfo').textContent = 'Ti abbiamo inviato un\'email con il link per impostare una nuova password.';
      $('authInfo').classList.remove('hidden');
    } else if(mode==='register'){
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

/* ---------- reset password: link cliccato dall'email ----------
   Supabase (con detectSessionInUrl, attivo di default) legge da solo il
   token presente nell'URL dopo il redirect e apre una sessione di
   "recovery", segnalata con questo evento — a quel punto mostriamo il
   form per la nuova password invece della Home. */

$('resetPasswordForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const pw1 = $('newPassword').value;
  const pw2 = $('newPasswordConfirm').value;
  $('resetError').classList.add('hidden');
  if(pw1 !== pw2){
    $('resetError').textContent = 'Le due password non coincidono.';
    $('resetError').classList.remove('hidden');
    return;
  }
  $('resetSubmitBtn').disabled = true;
  try{
    const { data, error } = await sb.auth.updateUser({ password: pw1 });
    if(error) throw error;
    await enterApp(data.user);
  } catch(err){
    $('resetError').textContent = err.message || 'Errore. Riprova.';
    $('resetError').classList.remove('hidden');
  } finally {
    $('resetSubmitBtn').disabled = false;
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

/* ---------- avvio: c'è già una sessione valida? ---------- oppure link di
   reset password appena cliccato dall'email?
   Tutto passa da qui (un solo listener, niente controlli doppi/in corsa
   con getSession()): "INITIAL_SESSION" è il primo evento emesso, sempre,
   con lo stato di sessione corrente (utente loggato o no); se invece la
   pagina si apre da un link di recovery, "PASSWORD_RECOVERY" arriva prima
   ed ha la precedenza, mostrando il form per la nuova password.
   In più, controlliamo anche direttamente l'URL ("type=recovery"): è la
   stessa verifica che raccomanda Supabase, come rete di sicurezza nel
   caso l'evento non arrivasse per qualche motivo (versione del client,
   timing) — a quel punto forziamo comunque la schermata di reset. */
function isPasswordRecoveryUrl(){
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  return hash.includes('type=recovery') || search.includes('type=recovery');
}
setAuthMode('login');
let handledInitialSession = false;
if(isPasswordRecoveryUrl()){
  handledInitialSession = true;
  showScreen('resetPasswordScreen');
}
sb.auth.onAuthStateChange((event, session)=>{
  if(event === 'PASSWORD_RECOVERY'){
    handledInitialSession = true;
    showScreen('resetPasswordScreen');
    return;
  }
  if(event === 'INITIAL_SESSION'){
    handledInitialSession = true;
    if(isPasswordRecoveryUrl()) return; // non sovrascrivere la schermata di reset
    if(session && session.user){ enterApp(session.user); }
    else { showScreen('authScreen'); }
  }
});
// Sicurezza: se per qualche motivo "INITIAL_SESSION" non arrivasse (client
// più vecchio), non restare bloccati sulla schermata vuota.
setTimeout(()=>{ if(!handledInitialSession) showScreen('authScreen'); }, 2500);
