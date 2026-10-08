/* =========================================================
   TRUGO — logique du site / jeu
   Démo front-end : le matchmaking et les amis/équipes sont
   simulés localement (aucun serveur pour l'instant).
   ========================================================= */

const OUTFIT_COLORS = ['#3fa7ff', '#ff5c68', '#45d6c4', '#ffb648', '#b46bff'];
const SWORD_COLORS  = ['#d9dde3', '#ffb648', '#45d6c4', '#ff5c68', '#9b9b9b'];
const BOT_NAMES = ['Raven','Nyx','Kato','Vex','Juno','Milo','Zed','Ash','Ika','Bram','Orin','Suki'];

/* ---------------------------------------------------------
   MEDAILLES / POINTS DE CLASSEMENT
--------------------------------------------------------- */
const RANK_POINTS = [12, 9, 6, 4, 1, -3, -6, -8, -10, -12]; // top1 -> top10
function pointsForRank(rank){
  return (rank >= 1 && rank <= RANK_POINTS.length) ? RANK_POINTS[rank - 1] : 0;
}
function medalForRank(rank){
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
}

/* ---------------------------------------------------------
   ETAT PERSISTANT (localStorage)
--------------------------------------------------------- */
const Store = {
  load(key, fallback){
    try{
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    }catch(e){ return fallback; }
  },
  save(key, val){
    try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){}
  }
};

const APP = {
  username: Store.load('trugo_username', null),
  outfitColor: Store.load('trugo_outfit', OUTFIT_COLORS[0]),
  swordColor: Store.load('trugo_sword', SWORD_COLORS[0]),
  friends: Store.load('trugo_friends', []),
  teamCode: Store.load('trugo_teamcode', null),
  equipment: Store.load('trugo_equipment', ['ice', 'fog', 'heal']),
  points: Store.load('trugo_points', 0),
  league: Store.load('trugo_league', null), // index dans LEAGUES de la dernière partie classée
};

/* ---------------------------------------------------------
   LIGUES (mode classé) : selon le nombre d'éliminations de la partie
--------------------------------------------------------- */
const LEAGUES = [
  { name:'Bronze',   color:'#cd7f32' },
  { name:'Argent',   color:'#c9d2dc' },
  { name:'Or',       color:'#ffc83d' },
  { name:'Platine',  color:'#5fe3d2' },
  { name:'Diamant',  color:'#5cc8ff' },
  { name:'Master',   color:'#b36bff' },
  { name:'Champion', color:'#ff5c68' },
  { name:'Colossal', color:'#ff8a3d' },
  { name:'Légende',  color:'#ff4fd8' },
  { name:'Ultime',   color:'#7dff6a' },
  { name:'Suprême',  color:'#ffffff' }
];
// 0-2 bronze, 3-5 argent, ... 27-29 ultime, 30+ suprême
function leagueIndexForKills(kills){
  return Math.min(LEAGUES.length - 1, Math.max(0, Math.floor(kills / 3)));
}
let pendingLeagueReveal = null; // {index, kills} annoncé au retour au lobby

function updateLeagueUI(){
  const el = document.getElementById('lobby-league');
  if (!el) return;
  const lg = APP.league != null ? LEAGUES[APP.league] : null;
  if (!lg){ el.classList.remove('show'); return; }
  el.textContent = lg.name;
  el.style.setProperty('--league-color', lg.color);
  el.classList.add('show');
}

// Animation de révélation : lasers qui jaillissent, puis le nom de la ligue
function showLeagueReveal(index, kills){
  const lg = LEAGUES[index];
  const overlay = document.getElementById('league-reveal');
  const field = document.getElementById('laser-field');
  if (!lg || !overlay || !field){ APP.league = index; updateLeagueUI(); return; }
  field.innerHTML = '';
  const count = 16;
  for (let i = 0; i < count; i++){
    const laser = document.createElement('div');
    laser.className = 'laser';
    laser.style.setProperty('--a', `${(360 / count) * i}deg`);
    laser.style.setProperty('--d', `${(i % 4) * 0.12}s`);
    laser.style.setProperty('--c', i % 2 ? lg.color : '#ffffff');
    field.appendChild(laser);
  }
  overlay.style.setProperty('--league-color', lg.color);
  document.getElementById('league-reveal-name').textContent = lg.name;
  document.getElementById('league-reveal-kills').textContent = `${kills} élimination${kills > 1 ? 's' : ''}`;
  overlay.classList.remove('hide');
  overlay.classList.add('show');
  AudioEngine.playChurchBell();
  setTimeout(()=>{
    overlay.classList.add('hide');
    setTimeout(()=>{
      overlay.classList.remove('show', 'hide');
      APP.league = index;
      updateLeagueUI(); // le badge apparaît à côté du profil
    }, 500);
  }, 4200);
}

const EQUIPMENT_NAMES = {
  ice: 'Glace',
  fog: 'Brouillard',
  heal: 'Soin',
};

/* ---------------------------------------------------------
   SAISON DES MEDAILLES
   Reset automatique tous les 1ers mercredis du mois à 8h.
--------------------------------------------------------- */
function firstWednesdayOfMonth(year, month){
  const d = new Date(year, month, 1, 8, 0, 0, 0);
  const day = d.getDay(); // 0=dimanche ... 3=mercredi
  const offset = (3 - day + 7) % 7;
  d.setDate(1 + offset);
  return d;
}
function getSeasonWindow(now){
  const boundaryThisMonth = firstWednesdayOfMonth(now.getFullYear(), now.getMonth());
  if (now < boundaryThisMonth){
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
    const start = firstWednesdayOfMonth(prevMonthDate.getFullYear(), prevMonthDate.getMonth());
    return { start, end: boundaryThisMonth };
  }
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth()+1, 1);
  const end = firstWednesdayOfMonth(nextMonthDate.getFullYear(), nextMonthDate.getMonth());
  return { start: boundaryThisMonth, end };
}
// Vérifie si une nouvelle saison a commencé depuis la dernière visite ; si oui,
// remet les médailles du joueur à 0 et régénère le classement simulé.
function checkSeasonReset(){
  const now = new Date();
  const { start, end } = getSeasonWindow(now);
  const storedStart = Store.load('trugo_season_start', null);
  if (storedStart !== start.toISOString()){
    APP.points = 0;
    Store.save('trugo_points', 0);
    Store.save('trugo_season_start', start.toISOString());
    Store.save('trugo_season_board', null);
  }
  return { start, end };
}
checkSeasonReset();

const SEASON_BOT_COUNT = 12;
function ensureSeasonLeaderboard(){
  let board = Store.load('trugo_season_board', null);
  if (board && board.length) return board;
  const used = new Set();
  const names = [];
  while (names.length < SEASON_BOT_COUNT){
    const n = BOT_NAMES[Math.floor(Math.random()*BOT_NAMES.length)] + (Math.floor(Math.random()*90)+10);
    if (!used.has(n)){ used.add(n); names.push(n); }
  }
  board = names.map(name => ({ name, medals: Math.floor(Math.random()*180) + 5 }));
  Store.save('trugo_season_board', board);
  return board;
}

let seasonEndDate = null;
let seasonCountdownInterval = null;
function formatSeasonCountdown(ms){
  if (ms <= 0) return 'Nouvelle saison !';
  const totalSec = Math.floor(ms/1000);
  const days = Math.floor(totalSec/86400);
  const hours = Math.floor((totalSec%86400)/3600);
  const minutes = Math.floor((totalSec%3600)/60);
  return `${days}j ${hours}h ${minutes}m`;
}
function renderSeasonLeaderboard(){
  const { end } = checkSeasonReset();
  seasonEndDate = end;
  const timerEl = document.getElementById('season-timer');
  function tickTimer(){
    if (!timerEl) return;
    timerEl.textContent = formatSeasonCountdown(seasonEndDate - new Date());
  }
  tickTimer();
  clearInterval(seasonCountdownInterval);
  seasonCountdownInterval = setInterval(tickTimer, 1000*30);

  const bots = ensureSeasonLeaderboard();
  const entries = bots.map(b => ({ name: b.name, medals: b.medals, isPlayer:false }));
  entries.push({ name: APP.username || 'Toi', medals: APP.points, isPlayer:true });
  entries.sort((a,b)=>b.medals-a.medals);

  const list = document.getElementById('season-leaderboard');
  list.innerHTML = '';
  entries.forEach((e,i)=>{
    const li = document.createElement('li');
    if (e.isPlayer) li.className = 'me';
    const medal = medalForRank(i+1);
    li.innerHTML = `<span><span class="rank">#${i+1}</span>${medal ? medal+' ' : ''}${escapeHtml(e.name)}</span><span>${e.medals} 🏅</span>`;
    list.appendChild(li);
  });
}
document.getElementById('lobby-points').addEventListener('click', ()=>{
  renderSeasonLeaderboard();
  openPanel('panel-season');
});

/* ---------------------------------------------------------
   AUDIO — cloche d'élimination + musique du mode adrénaline
   (tout est synthétisé via Web Audio, aucun fichier son requis)
--------------------------------------------------------- */
const AudioEngine = (()=>{
  let ctx = null;
  let adrenalineTimer = null;
  let adrenalineMaster = null;
  let combatTimer = null;
  let combatMaster = null;
  let combatPlaying = false;

  function ensureCtx(){
    if (!ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function unlock(){ ensureCtx(); }

  function playBell(){
    const c = ensureCtx();
    if (!c) return;
    const now = c.currentTime;
    const partials = [1, 2.01, 3.2, 4.35]; // ratios inharmoniques typiques d'une cloche
    const base = 520;
    const master = c.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.5, now + 0.008);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
    master.connect(c.destination);
    partials.forEach((ratio, i)=>{
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = base * ratio;
      const g = c.createGain();
      g.gain.value = 1 / (i + 1.4);
      osc.connect(g);
      g.connect(master);
      osc.start(now);
      osc.stop(now + 1.9);
    });
  }

  function playChurchBell(){
    const c = ensureCtx();
    if (!c) return;
    const tollCount = 3;
    const partials = [1, 2.0, 2.4, 3.0, 4.1]; // timbre plus grave et plus riche qu'une cloche simple
    const base = 220;
    for (let i=0;i<tollCount;i++){
      const start = c.currentTime + i*0.95;
      const master = c.createGain();
      master.gain.setValueAtTime(0.0001, start);
      master.gain.exponentialRampToValueAtTime(0.6, start + 0.015);
      master.gain.exponentialRampToValueAtTime(0.0001, start + 3.2);
      master.connect(c.destination);
      partials.forEach((ratio, idx)=>{
        const osc = c.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = base * ratio;
        const g = c.createGain();
        g.gain.value = 1 / (idx + 1.6);
        osc.connect(g);
        g.connect(master);
        osc.start(start);
        osc.stop(start + 3.3);
      });
    }
  }


  // Sélectionne une voix de synthèse plus naturelle ("IA") quand le navigateur en propose une,
  // au lieu de la voix robotique par défaut.
  let cachedVoices = [];
  function refreshVoices(){
    if (!('speechSynthesis' in window)) return;
    try{ cachedVoices = window.speechSynthesis.getVoices() || []; }catch(e){}
  }
  if ('speechSynthesis' in window){
    refreshVoices();
    window.speechSynthesis.onvoiceschanged = refreshVoices;
  }
  function pickVoice(lang){
    if (!cachedVoices.length) refreshVoices();
    const prefix = (lang || 'en-US').slice(0, 2).toLowerCase();
    const candidates = cachedVoices.filter(v => v.lang && v.lang.toLowerCase().startsWith(prefix));
    const preferredHints = ['Natural', 'Neural', 'Online', 'Google', 'Premium', 'Wavenet'];
    const best = candidates.find(v => preferredHints.some(h => v.name.includes(h)));
    return best || candidates[0] || cachedVoices[0] || null;
  }

  function speak(text, opts = {}){
    if (!('speechSynthesis' in window)) return;
    try{
      if (opts.priority) window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = opts.lang || 'en-US';
      const voice = pickVoice(utter.lang);
      if (voice) utter.voice = voice;
      utter.rate = opts.rate || 1;
      utter.pitch = opts.pitch || 1;
      utter.volume = opts.volume != null ? opts.volume : 1;
      window.speechSynthesis.speak(utter);
    }catch(e){}
  }

  function startCombatMusic(){
    const c = ensureCtx();
    if (!c) return;
    stopCombatMusic();
    combatPlaying = true;
    const master = c.createGain();
    master.gain.value = 0.16;
    master.connect(c.destination);
    combatMaster = master;

    const bassNotes = [55, 55, 61.74, 49]; // motif grave discret en boucle
    const leadNotes = [220, 261.63, 246.94, 196.0, 220, 174.61, 196.0, 220];
    let step = 0;

    function scheduleStep(){
      if (!combatPlaying) return;
      const t = c.currentTime;

      const bass = c.createOscillator();
      bass.type = 'triangle';
      bass.frequency.value = bassNotes[step % bassNotes.length];
      const bg = c.createGain();
      bg.gain.setValueAtTime(0.0001, t);
      bg.gain.exponentialRampToValueAtTime(0.35, t + 0.03);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      bass.connect(bg); bg.connect(master);
      bass.start(t); bass.stop(t + 0.45);

      if (step % 2 === 0){
        const lead = c.createOscillator();
        lead.type = 'sine';
        lead.frequency.value = leadNotes[(step/2) % leadNotes.length];
        const lg = c.createGain();
        lg.gain.setValueAtTime(0.0001, t);
        lg.gain.exponentialRampToValueAtTime(0.1, t + 0.05);
        lg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        lead.connect(lg); lg.connect(master);
        lead.start(t); lead.stop(t + 0.55);
      }

      step++;
      combatTimer = setTimeout(scheduleStep, 420);
    }
    scheduleStep();
  }

  function stopCombatMusic(){
    combatPlaying = false;
    clearTimeout(combatTimer);
    combatTimer = null;
    if (combatMaster){ try{ combatMaster.disconnect(); }catch(e){} }
    combatMaster = null;
  }

  function startAdrenalineMusic(durationSec){
    const c = ensureCtx();
    if (!c) return;
    stopAdrenalineMusic();
    const master = c.createGain();
    master.gain.value = 0.3;
    master.connect(c.destination);
    adrenalineMaster = master;

    let beat = 0;
    const totalBeats = Math.floor(durationSec * 2.4);
    function scheduleBeat(){
      if (beat >= totalBeats || !adrenalineMaster) return;
      const progress = beat / totalBeats;
      const t = c.currentTime;

      // pulsation grave façon battement de coeur, de plus en plus rapide
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(58 + progress * 42, t);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.55, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(g); g.connect(master);
      osc.start(t); osc.stop(t + 0.2);

      // sirène montante en fond, une pulsation sur quatre
      if (beat % 4 === 0){
        const siren = c.createOscillator();
        siren.type = 'sawtooth';
        siren.frequency.setValueAtTime(170 + progress * 260, t);
        siren.frequency.linearRampToValueAtTime(130 + progress * 260, t + 0.35);
        const sg = c.createGain();
        sg.gain.setValueAtTime(0.0001, t);
        sg.gain.exponentialRampToValueAtTime(0.07, t + 0.05);
        sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        siren.connect(sg); sg.connect(master);
        siren.start(t); siren.stop(t + 0.45);
      }

      beat++;
      const interval = Math.max(90, 260 - progress * 170); // le tempo accélère avec le temps
      adrenalineTimer = setTimeout(scheduleBeat, interval);
    }
    scheduleBeat();
  }

  function stopAdrenalineMusic(){
    clearTimeout(adrenalineTimer);
    adrenalineTimer = null;
    if (adrenalineMaster){ try{ adrenalineMaster.disconnect(); }catch(e){} }
    adrenalineMaster = null;
  }

  return {
    unlock, playBell, playChurchBell, speak,
    startCombatMusic, stopCombatMusic,
    startAdrenalineMusic, stopAdrenalineMusic
  };
})();

/* ---------------------------------------------------------
   NAVIGATION ENTRE ECRANS
--------------------------------------------------------- */
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function openPanel(id){ document.getElementById(id).classList.add('open'); }
function closePanel(id){ document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('[data-close]').forEach(btn=>{
  btn.addEventListener('click', () => closePanel(btn.dataset.close));
});

/* ---------------------------------------------------------
   ECRAN DE CHARGEMENT
--------------------------------------------------------- */
function runLoadingSequence(){
  const fill = document.getElementById('loading-fill');
  const label = document.getElementById('loading-label');
  const steps = ['Préparation de l\'arène…','Chargement des textures…','Affûtage des épées…','Presque prêt…'];
  let pct = 0;
  const timer = setInterval(()=>{
    pct += 4 + Math.random()*6;
    if (pct >= 100){
      pct = 100;
      fill.style.width = '100%';
      clearInterval(timer);
      setTimeout(()=>{
        if (APP.username){
          enterLobby();
        } else {
          showScreen('screen-login');
        }
      }, 250);
      return;
    }
    fill.style.width = pct + '%';
    label.textContent = steps[Math.min(steps.length-1, Math.floor(pct/26))];
  }, 140);
}

/* ---------------------------------------------------------
   CONNEXION
--------------------------------------------------------- */
document.getElementById('login-form').addEventListener('submit', (e)=>{
  e.preventDefault();
  AudioEngine.unlock();
  const name = document.getElementById('login-name').value.trim();
  const pass = document.getElementById('login-pass').value;
  if (!name || !pass) return;
  APP.username = name;
  Store.save('trugo_username', name);
  // Le mot de passe n'est pas transmis à un serveur : il n'y en a pas encore.
  enterLobby();
});

function enterLobby(){
  document.getElementById('lobby-username').textContent = APP.username;
  updateLeagueUI();
  showScreen('screen-lobby');
  Lobby.start();
}

function updateLobbyPointsUI(){
  const el = document.getElementById('lobby-points');
  if (el) el.textContent = `🏅 ${APP.points} médailles`;
}

/* ---------------------------------------------------------
   PANNEAU PERSONNAGE
--------------------------------------------------------- */
function buildSwatches(containerId, colors, current, onPick){
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  colors.forEach(c=>{
    const s = document.createElement('div');
    s.className = 'swatch' + (c === current ? ' selected' : '');
    s.style.background = c;
    s.addEventListener('click', ()=>{
      el.querySelectorAll('.swatch').forEach(n=>n.classList.remove('selected'));
      s.classList.add('selected');
      onPick(c);
    });
    el.appendChild(s);
  });
}
document.getElementById('btn-character').addEventListener('click', ()=>{
  buildSwatches('swatch-outfit', OUTFIT_COLORS, APP.outfitColor, (c)=>{
    APP.outfitColor = c; Store.save('trugo_outfit', c); Lobby.applyCharacterColors();
  });
  buildSwatches('swatch-sword', SWORD_COLORS, APP.swordColor, (c)=>{
    APP.swordColor = c; Store.save('trugo_sword', c); Lobby.applyCharacterColors();
  });
  openPanel('panel-character');
});

document.getElementById('btn-shop').addEventListener('click', ()=>{
  // Bouton volontairement inactif pour l'instant.
});

document.getElementById('btn-equipment').addEventListener('click', ()=>{
  document.querySelectorAll('.equipment-card').forEach(card=>{
    card.classList.toggle('selected', APP.equipment.includes(card.dataset.equipment));
  });
  openPanel('panel-equipment');
});
document.querySelectorAll('.equipment-card').forEach(card=>{
  card.addEventListener('click', ()=>{
    const equipment = card.dataset.equipment;
    if (APP.equipment.includes(equipment)){
      APP.equipment = APP.equipment.filter(item=>item !== equipment);
    } else if (APP.equipment.length < 3){
      APP.equipment.push(equipment);
    }
    card.classList.toggle('selected', APP.equipment.includes(equipment));
    Store.save('trugo_equipment', APP.equipment);
  });
});

/* ---------------------------------------------------------
   PANNEAU AMIS (simulation locale)
--------------------------------------------------------- */
const SUGGESTED_PLAYERS = ['Raven92','NyxBlade','KatoStorm','VexOni','JunoFang','MiloSprint','ZedArrow','AshVane'];

function renderFriendsMine(){
  const ul = document.getElementById('friends-mine');
  ul.innerHTML = '';
  if (APP.friends.length === 0){
    ul.innerHTML = '<li class="empty">Aucun ami pour l\'instant</li>';
    return;
  }
  APP.friends.forEach(name=>{
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(name)}</span>`;
    ul.appendChild(li);
  });
}
function renderFriendsResults(query){
  const ul = document.getElementById('friends-results');
  ul.innerHTML = '';
  const q = query.trim().toLowerCase();
  if (!q){ return; }
  const matches = SUGGESTED_PLAYERS.filter(n => n.toLowerCase().includes(q) && n !== APP.username);
  if (matches.length === 0){
    ul.innerHTML = '<li class="empty">Aucun joueur trouvé</li>';
    return;
  }
  matches.forEach(name=>{
    const li = document.createElement('li');
    const already = APP.friends.includes(name);
    li.innerHTML = `<span>${escapeHtml(name)}</span>`;
    const btn = document.createElement('button');
    btn.textContent = already ? 'Ajouté' : 'Ajouter';
    btn.disabled = already;
    btn.addEventListener('click', ()=>{
      if (!APP.friends.includes(name)){
        APP.friends.push(name);
        Store.save('trugo_friends', APP.friends);
        renderFriendsMine();
        renderFriendsResults(document.getElementById('friends-search').value);
      }
    });
    li.appendChild(btn);
    ul.appendChild(li);
  });
}
document.getElementById('btn-friends').addEventListener('click', ()=>{
  document.getElementById('friends-search').value = '';
  document.getElementById('friends-results').innerHTML = '';
  renderFriendsMine();
  openPanel('panel-friends');
});
document.getElementById('friends-search').addEventListener('input', (e)=>{
  renderFriendsResults(e.target.value);
});

function escapeHtml(s){
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* ---------------------------------------------------------
   PANNEAU EQUIPE (simulation locale)
--------------------------------------------------------- */
function randomCode(){
  let c = '';
  for (let i=0;i<8;i++) c += Math.floor(Math.random()*10);
  return c;
}
function refreshTeamCodeDisplay(){
  document.getElementById('team-code-display').textContent = APP.teamCode || '--------';
}
document.getElementById('btn-team').addEventListener('click', ()=>{
  refreshTeamCodeDisplay();
  document.getElementById('join-code-feedback').textContent = '';
  document.getElementById('join-code-input').value = '';
  openPanel('panel-team');
});
document.getElementById('btn-generate-code').addEventListener('click', ()=>{
  APP.teamCode = randomCode();
  Store.save('trugo_teamcode', APP.teamCode);
  refreshTeamCodeDisplay();
});
document.getElementById('btn-join-code').addEventListener('click', ()=>{
  const input = document.getElementById('join-code-input');
  const val = input.value.trim();
  const feedback = document.getElementById('join-code-feedback');
  if (!/^\d{8}$/.test(val)){
    feedback.textContent = 'Le code doit contenir 8 chiffres.';
    return;
  }
  feedback.textContent = `Équipe ${val} rejointe (simulation locale).`;
});

/* ---------------------------------------------------------
   LOBBY — scène 3D avec personnage animé
--------------------------------------------------------- */
const Lobby = (()=>{
  let renderer, scene, camera, character, clock;
  let running = false;
  let bodyMesh, swordMesh, capeMesh, shoulderLMesh, shoulderRMesh, visorMesh, armLMesh, armRMesh;

  function buildCharacter(){
    const group = new THREE.Group();

    const bodyGeo = THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.45, 0.9, 4, 8) : new THREE.CylinderGeometry(0.45,0.45,1.3,10);
    bodyMesh = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: APP.outfitColor, roughness:0.55, metalness:0.15 }));
    bodyMesh.position.y = 1.0;
    group.add(bodyMesh);

    const headMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 16, 16),
      new THREE.MeshStandardMaterial({ color: '#f1c39a', roughness:0.6 })
    );
    headMesh.position.y = 1.85;
    group.add(headMesh);

    // yeux
    const eyeMat = new THREE.MeshStandardMaterial({ color:'#1a1410', roughness:0.4 });
    const eyeGeo = new THREE.SphereGeometry(0.045, 8, 8);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.12, 1.88, 0.28); group.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat.clone()); eyeR.position.set(0.12, 1.88, 0.28); group.add(eyeR);

    // visière colorée (identité visuelle du combattant, assortie à la couleur d'épée)
    visorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.09, 0.34),
      new THREE.MeshStandardMaterial({ color: APP.swordColor, metalness:0.6, roughness:0.25, emissive: new THREE.Color(APP.swordColor), emissiveIntensity:0.18 })
    );
    visorMesh.position.set(0, 1.88, 0.02);
    group.add(visorMesh);

    // épaulières
    const shoulderGeo = new THREE.SphereGeometry(0.22, 12, 12);
    shoulderLMesh = new THREE.Mesh(shoulderGeo, new THREE.MeshStandardMaterial({ color: APP.outfitColor, metalness:0.5, roughness:0.35 }));
    shoulderLMesh.position.set(-0.5, 1.55, 0); group.add(shoulderLMesh);
    shoulderRMesh = new THREE.Mesh(shoulderGeo, new THREE.MeshStandardMaterial({ color: APP.outfitColor, metalness:0.5, roughness:0.35 }));
    shoulderRMesh.position.set(0.5, 1.55, 0); group.add(shoulderRMesh);

    // bras
    const armGeo = THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.1, 0.55, 4, 6) : new THREE.CylinderGeometry(0.1,0.1,0.75,8);
    const armMat = new THREE.MeshStandardMaterial({ color: APP.outfitColor, roughness:0.55, metalness:0.15 });
    armLMesh = new THREE.Mesh(armGeo, armMat);
    armLMesh.position.set(-0.52, 1.1, 0); armLMesh.rotation.z = 0.14; group.add(armLMesh);
    armRMesh = new THREE.Mesh(armGeo, armMat.clone());
    armRMesh.position.set(0.52, 1.1, 0); armRMesh.rotation.z = -0.14; group.add(armRMesh);

    // bottes
    const bootGeo = new THREE.CylinderGeometry(0.17, 0.2, 0.32, 8);
    const bootMat = new THREE.MeshStandardMaterial({ color:'#241705', roughness:0.6, metalness:0.1 });
    const bootL = new THREE.Mesh(bootGeo, bootMat); bootL.position.set(-0.17, 0.16, 0.03); group.add(bootL);
    const bootR = new THREE.Mesh(bootGeo, bootMat.clone()); bootR.position.set(0.17, 0.16, 0.03); group.add(bootR);

    // ceinture
    const beltMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.46, 0.05, 8, 20),
      new THREE.MeshStandardMaterial({ color:'#241705', metalness:0.3, roughness:0.6 })
    );
    beltMesh.rotation.x = Math.PI/2;
    beltMesh.position.y = 0.62;
    group.add(beltMesh);

    // cape
    capeMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.75, 1.15, 1, 4),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(APP.outfitColor).multiplyScalar(0.55), roughness:1, metalness:0, side: THREE.DoubleSide })
    );
    capeMesh.position.set(0, 1.05, -0.32);
    capeMesh.rotation.x = 0.12;
    group.add(capeMesh);

    swordMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 1.1, 0.06),
      new THREE.MeshStandardMaterial({ color: APP.swordColor, metalness:0.6, roughness:0.2 })
    );
    swordMesh.position.set(0.55, 1.05, 0.1);
    swordMesh.rotation.z = -0.5;
    group.add(swordMesh);

    const hiltMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.18,0.14,0.1),
      new THREE.MeshStandardMaterial({ color:'#3a2a1a' })
    );
    hiltMesh.position.set(0.55, 0.5, 0.1);
    hiltMesh.rotation.z = -0.5;
    group.add(hiltMesh);

    return group;
  }

  function applyCharacterColors(){
    if (bodyMesh) bodyMesh.material.color.set(APP.outfitColor);
    if (swordMesh) swordMesh.material.color.set(APP.swordColor);
    if (shoulderLMesh) shoulderLMesh.material.color.set(APP.outfitColor);
    if (shoulderRMesh) shoulderRMesh.material.color.set(APP.outfitColor);
    if (armLMesh) armLMesh.material.color.set(APP.outfitColor);
    if (armRMesh) armRMesh.material.color.set(APP.outfitColor);
    if (capeMesh) capeMesh.material.color.set(new THREE.Color(APP.outfitColor).multiplyScalar(0.55));
    if (visorMesh){
      visorMesh.material.color.set(APP.swordColor);
      visorMesh.material.emissive.set(APP.swordColor);
    }
  }

  function init(){
    const canvas = document.getElementById('lobby-canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);

    scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a0e14');
    scene.fog = new THREE.Fog('#0a0e14', 6, 16);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.6, 4.2);
    camera.lookAt(0, 1.2, 0);

    const hemi = new THREE.HemisphereLight('#8fb8ff', '#1a1410', 0.6);
    scene.add(hemi);
    const key = new THREE.DirectionalLight('#ffd8a0', 1.1);
    key.position.set(3, 5, 4);
    scene.add(key);
    const rim = new THREE.PointLight('#45d6c4', 1.2, 10);
    rim.position.set(-2, 2, -2);
    scene.add(rim);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(6, 32),
      new THREE.MeshStandardMaterial({ color:'#141c26' })
    );
    ground.rotation.x = -Math.PI/2;
    scene.add(ground);

    character = buildCharacter();
    scene.add(character);

    clock = new THREE.Clock();
    window.addEventListener('resize', onResize);
    onResize();
  }

  function onResize(){
    if (!renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w/h;
    camera.updateProjectionMatrix();
  }

  function animate(){
    if (!running) return;
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    character.rotation.y = Math.sin(t * 0.5) * 0.35;
    character.position.y = Math.sin(t * 2) * 0.03;
    if (swordMesh) swordMesh.rotation.z = -0.5 + Math.sin(t*2)*0.08;
    if (capeMesh) capeMesh.rotation.x = 0.12 + Math.sin(t*2.2)*0.05;
    renderer.render(scene, camera);
  }

  function start(){
    if (!renderer) init();
    applyCharacterColors();
    updateLobbyPointsUI();
    running = true;
    animate();
  }
  function stop(){ running = false; }

  return { start, stop, applyCharacterColors };
})();

/* ---------------------------------------------------------
   BOUTON JOUER -> MATCHMAKING
--------------------------------------------------------- */
document.getElementById('btn-play').addEventListener('click', ()=>{
  AudioEngine.unlock();
  Lobby.stop();
  startMatchmaking(false);
});
document.getElementById('btn-ranked').addEventListener('click', ()=>{
  AudioEngine.unlock();
  Lobby.stop();
  startMatchmaking(true); // partie classée
});
document.getElementById('btn-cancel-mm').addEventListener('click', ()=>{
  Matchmaking.cancel();
});

const Matchmaking = (()=>{
  let interval = null;
  let secondsLeft = 10;
  let ranked = false;

  function start(isRanked){
    ranked = !!isRanked;
    secondsLeft = 10;
    document.getElementById('mm-status').textContent = 'Recherche de joueurs…';
    document.getElementById('mm-timer').textContent = secondsLeft;
    showScreen('screen-matchmaking');
    interval = setInterval(()=>{
      secondsLeft--;
      document.getElementById('mm-timer').textContent = Math.max(0, secondsLeft);
      if (secondsLeft <= 0){
        clearInterval(interval);
        document.getElementById('mm-status').textContent = 'Complétion avec des robots…';
        setTimeout(()=>{
          if (ranked) Match.start('frappe', true); // classé : pas de roulette, règles Frappe Dolling
          else playModeRoulette();
        }, 700);
      }
    }, 1000);
  }
  function cancel(){
    clearInterval(interval);
    showScreen('screen-lobby');
    Lobby.start();
  }
  return { start, cancel };
})();
function startMatchmaking(isRanked){ Matchmaking.start(isRanked); }

/* ---------------------------------------------------------
   ROULETTE DE MODE — choisit aléatoirement Frappe Dolling ou
   Couronne Hunter une fois les joueurs trouvés
--------------------------------------------------------- */
function playModeRoulette(){
  showScreen('screen-roulette');
  const wheel = document.getElementById('roulette-wheel');
  const resultEl = document.getElementById('roulette-result');
  if (!wheel || !resultEl){
    // sécurité : si l'écran roulette n'existe pas, on lance directement une partie
    Match.start(Math.random() < 0.5 ? 'frappe' : 'couronne');
    return;
  }
  resultEl.textContent = '';

  const chosenMode = Math.random() < 0.5 ? 'frappe' : 'couronne';

  // réinitialise la roue sans transition avant de la relancer
  wheel.style.transition = 'none';
  wheel.style.transform = 'rotate(0deg)';
  void wheel.offsetWidth; // force le recalcul de style avant de réactiver la transition
  wheel.style.transition = '';

  const spins = 4;
  // milieu du demi-cercle correspondant au mode choisi (évite d'atterrir sur la frontière)
  const targetTopAngle = chosenMode === 'frappe'
    ? 40 + Math.random()*100    // demi-cercle "Frappe Dolling" (0°-180°)
    : 220 + Math.random()*100;  // demi-cercle "Couronne Hunter" (180°-360°)
  const finalRotation = spins*360 + ((360 - targetTopAngle) % 360);

  requestAnimationFrame(()=>{
    wheel.style.transform = `rotate(${finalRotation}deg)`;
  });

  setTimeout(()=>{
    resultEl.textContent = chosenMode === 'frappe' ? 'Mode : Frappe Dolling' : 'Mode : Couronne Hunter';
    setTimeout(()=>{
      Match.start(chosenMode);
    }, 900);
  }, 3100);
}

/* ---------------------------------------------------------
   PARTIE — carte 3D, personnage 3e personne, combat, robots
--------------------------------------------------------- */
const FRAPPE_DURATION = 4*60; // secondes (mode Frappe Dolling)
const COURONNE_DURATION = 2*60; // secondes (mode Couronne Hunter)
let MATCH_DURATION = FRAPPE_DURATION; // ajusté selon le mode choisi au lancement de la partie
const ARENA_RADIUS = 15; // carte de 30x30 unités (diamètre = 30)
const MAX_HP = 750;
const DAMAGE = 80;
const CROWN_MAX_HP = 10000;
const CROWN_DAMAGE = 500;
const CROWN_HOLD_SECONDS = 10;
const CROWN_ATTACK_RANGE = 2.2;
const RESPAWN_DELAY = 15;
const ATTACK_RANGE = 1.6;
const ATTACK_COOLDOWN = 0.6;
const TOTAL_SLOTS = 8;
const BASE_SPEED = 4; // vitesse de base d'un personnage : 4 unités par seconde (doublée deux fois)
const MAX_TURN_RATE = Math.PI * 2.6; // rotation max (rad/s) : empêche le stick de faire "tourner" le perso sur lui-même au lieu de le déplacer

function stepTowardAngle(current, target, maxStep){
  let diff = target - current;
  diff = ((diff + Math.PI) % (Math.PI*2) + Math.PI*2) % (Math.PI*2) - Math.PI; // normalise entre -PI et PI
  if (diff > maxStep) diff = maxStep;
  else if (diff < -maxStep) diff = -maxStep;
  return current + diff;
}
const ADRENALINE_DURATION = 30; // secondes
const ADRENALINE_MIN_DELAY = 30; // secondes avant que le mode puisse s'activer
const ADRENALINE_END_MARGIN = 15; // secondes de marge avant la fin de la partie

const Match = (()=>{
  let renderer, scene, camera, clock;
  let running = false;
  let timeLeft = MATCH_DURATION;
  let matchTimerInterval = null;
  let fighters = []; // {id,name,isPlayer,hp,kills,alive,mesh,swordMesh,pos:{x,z},rotY,vel:{x,z},state,attackCooldown,respawnAt,aiTarget}
  let joystickVec = { x:0, y:0 };
  let joystickActive = false;
  let joystickTouchId = null;
  let attackRequested = false;
  let obstacles = []; // {x,z,radius} buildings/trees for simple collision
  let dustPoints = null;
  let currentGameMode = 'frappe'; // 'frappe' (Frappe Dolling) | 'couronne' (Couronne Hunter)
  let currentRanked = false; // partie classée (ligue selon les éliminations)
  let crown = null; // {mesh, pedestal, hp, state:'vault'|'held', holder, holdStartedAt}
  let fogUntil = 0;
  let equipmentUsed = new Set();
  let effects = [];

  // ---- mode adrénaline ----
  let hemiLight, sunLight;
  let speedMultiplier = 1;
  let adrenalineActive = false;
  let adrenalineTimeout = null;
  let adrenalineEndTimeout = null;
  let originalHemiIntensity = 1, originalSunIntensity = 1;
  let originalFog = null, originalBackgroundHex = 0x0d1a14;
  let lastMinuteTriggered = false;

  function makeHealthBar(){
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 20;
    const context = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent:true, depthTest:false }));
    sprite.scale.set(1.2, 0.19, 1);
    sprite.position.y = 2.35;
    sprite.userData.canvas = canvas;
    sprite.userData.context = context;
    sprite.userData.texture = texture;
    return sprite;
  }

  function updateHealthBar(f){
    if (!f.healthBar) return;
    const context = f.healthBar.userData.context;
    const canvas = f.healthBar.userData.canvas;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(5, 9, 14, .82)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = f.hp > MAX_HP * .45 ? '#45d6c4' : f.hp > MAX_HP * .2 ? '#ffb648' : '#ff5c68';
    context.fillRect(3, 3, (canvas.width - 6) * Math.max(0, f.hp / MAX_HP), canvas.height - 6);
    f.healthBar.userData.texture.needsUpdate = true;
  }

  function addEffect(position, color, duration = 700){
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(.35, .045, 8, 24),
      new THREE.MeshBasicMaterial({ color, transparent:true, opacity:.95 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(position.x, .08, position.z);
    scene.add(ring);
    effects.push({ mesh:ring, started:performance.now(), duration });
  }

  function updateEffects(){
    const now = performance.now();
    effects = effects.filter(effect=>{
      const progress = (now - effect.started) / effect.duration;
      effect.mesh.scale.setScalar(1 + progress * 2.5);
      effect.mesh.material.opacity = Math.max(0, 1 - progress);
      if (progress >= 1){
        scene.remove(effect.mesh);
        effect.mesh.geometry.dispose();
        effect.mesh.material.dispose();
        return false;
      }
      return true;
    });
  }

  function setMatchStatus(message, duration = 1800){
    const status = document.getElementById('match-status');
    status.textContent = message;
    clearTimeout(setMatchStatus.timer);
    setMatchStatus.timer = setTimeout(()=>{ status.textContent = ''; }, duration);
  }

  function createGroundTexture(){
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#222a1c';
    ctx.fillRect(0, 0, size, size);
    // mouchetures pour casser la couleur plate (terre / herbe piétinée)
    for (let i=0;i<500;i++){
      const x = Math.random()*size, y = Math.random()*size;
      const r = 3 + Math.random()*9;
      const shade = Math.random()*26 - 13;
      ctx.fillStyle = `rgba(${34+shade},${42+shade},${26+shade},0.4)`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
    }
    // fines traînées d'herbe
    ctx.strokeStyle = 'rgba(90,120,70,0.15)';
    ctx.lineWidth = 1;
    for (let i=0;i<250;i++){
      const x = Math.random()*size, y = Math.random()*size;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (Math.random()*6-3), y - 6 - Math.random()*6); ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(7, 7);
    return texture;
  }

  function addAtmosphericDust(){
    const count = 140;
    const positions = new Float32Array(count*3);
    for (let i=0;i<count;i++){
      const angle = Math.random()*Math.PI*2;
      const dist = Math.random()*ARENA_RADIUS;
      positions[i*3] = Math.cos(angle)*dist;
      positions[i*3+1] = 0.2 + Math.random()*3.2;
      positions[i*3+2] = Math.sin(angle)*dist;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color:'#ffdca0', size:0.05, transparent:true, opacity:0.4, depthWrite:false });
    dustPoints = new THREE.Points(geo, mat);
    scene.add(dustPoints);
  }

  // ---- Couronne (mode Couronne Hunter) ----
  function buildCrownMesh(){
    const group = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({ color:'#ffd76a', metalness:0.85, roughness:0.25, emissive:'#7a4a00', emissiveIntensity:0.35 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.22, 16, 1, true), gold);
    group.add(band);
    const spikeCount = 6;
    for (let i=0; i<spikeCount; i++){
      const a = (i/spikeCount)*Math.PI*2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 6), gold);
      spike.position.set(Math.cos(a)*0.42, 0.22, Math.sin(a)*0.42);
      group.add(spike);
      const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshStandardMaterial({ color:'#ff5c68', emissive:'#ff5c68', emissiveIntensity:0.6 }));
      jewel.position.set(Math.cos(a)*0.42, 0.34, Math.sin(a)*0.42);
      group.add(jewel);
    }
    return group;
  }

  function spawnCrown(){
    crown = {
      mesh: buildCrownMesh(),
      pedestal: new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.5, 16), new THREE.MeshStandardMaterial({ color:'#2a2015', roughness:0.8 })),
      hp: CROWN_MAX_HP,
      state: 'vault',
      holder: null,
      holdStartedAt: 0
    };
    crown.pedestal.position.set(0, 0.25, 0);
    scene.add(crown.pedestal);
    crown.mesh.position.set(0, 0.62, 0);
    scene.add(crown.mesh);
    updateCrownHpUI();
  }

  function removeCrownObjects(){
    if (!crown) return;
    if (crown.mesh) scene.remove(crown.mesh);
    if (crown.pedestal) scene.remove(crown.pedestal);
    crown = null;
  }

  function updateCrownHpUI(){
    const fill = document.getElementById('crown-hp-fill');
    if (!fill || !crown) return;
    fill.style.width = `${Math.max(0, (crown.hp/CROWN_MAX_HP)*100)}%`;
  }

  function updateCrownHoldOwnerLabel(){
    const el = document.getElementById('crown-hold-owner');
    if (!el || !crown || !crown.holder) return;
    el.textContent = crown.holder.isPlayer ? 'Tu portes la couronne' : `${crown.holder.name} porte la couronne`;
  }

  function damageCrown(attacker, dmg){
    if (!crown || crown.state !== 'vault') return;
    crown.hp = Math.max(0, crown.hp - dmg);
    updateCrownHpUI();
    addEffect(crown.mesh.position, '#ffd76a', 450);
    if (crown.hp <= 0){
      claimCrown(attacker);
    }
  }

  function claimCrown(fighter){
    if (!crown) return;
    crown.state = 'held';
    crown.holder = fighter;
    crown.holdStartedAt = performance.now();
    if (crown.pedestal){ scene.remove(crown.pedestal); crown.pedestal = null; }
    const hpWrap = document.getElementById('crown-hp-wrap');
    const holdWrap = document.getElementById('crown-hold-wrap');
    if (hpWrap) hpWrap.style.display = 'none';
    if (holdWrap) holdWrap.style.display = 'block';
    updateCrownHoldOwnerLabel();
    AudioEngine.speak('Crown seized');
    setMatchStatus(fighter.isPlayer ? 'Tu as pris la couronne !' : `${fighter.name} a pris la couronne !`, 3000);
  }

  function updateCrownState(dt){
    if (!crown) return;
    if (crown.state === 'vault'){
      crown.mesh.rotation.y += dt*0.6;
      return;
    }
    if (crown.state === 'held' && crown.holder && crown.holder.alive){
      crown.mesh.position.set(crown.holder.pos.x, 2.5, crown.holder.pos.z);
      crown.mesh.rotation.y += dt*1.4;
      const heldSeconds = (performance.now() - crown.holdStartedAt)/1000;
      const remaining = Math.max(0, CROWN_HOLD_SECONDS - heldSeconds);
      const timerEl = document.getElementById('crown-hold-timer');
      if (timerEl) timerEl.textContent = Math.ceil(remaining);
      if (remaining <= 0){
        winCouronne(crown.holder);
      }
    }
  }

  function winCouronne(winner){
    endMatch({ winner });
  }

  function updateModeHud(){
    const crownHud = document.getElementById('crown-hud');
    const hpWrap = document.getElementById('crown-hp-wrap');
    const holdWrap = document.getElementById('crown-hold-wrap');
    const yourRank = document.getElementById('leaderboard-yourank');
    if (currentGameMode === 'couronne'){
      if (crownHud) crownHud.style.display = 'block';
      if (hpWrap) hpWrap.style.display = 'block';
      if (holdWrap) holdWrap.style.display = 'none';
      if (yourRank) yourRank.style.display = 'none';
    } else {
      if (crownHud) crownHud.style.display = 'none';
      if (yourRank) yourRank.style.display = 'flex';
    }
  }

  function buildArena(){
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA_RADIUS*2.4, ARENA_RADIUS*2.4, 1, 1),
      new THREE.MeshStandardMaterial({ map: createGroundTexture(), roughness:0.95, metalness:0 })
    );
    ground.rotation.x = -Math.PI/2;
    scene.add(ground);

    obstacles = [];
    const scale = ARENA_RADIUS / 22; // ajuste proportionnellement le décor à la taille de la carte (30x30)

    // anciens bâtiments (ruines), avec variation de teinte, toit et petites fenêtres éclairées
    const buildingColors = ['#4a4640', '#5a5348', '#403c35', '#544f45'];
    const buildingCount = 5;
    for (let i=0;i<buildingCount;i++){
      const angle = (i / buildingCount) * Math.PI * 2 + Math.random()*0.4;
      const dist = ARENA_RADIUS*0.35 + Math.random()*ARENA_RADIUS*0.45;
      const x = Math.cos(angle)*dist, z = Math.sin(angle)*dist;
      const w = (2 + Math.random()*2.5)*scale, d = (2 + Math.random()*2.5)*scale, h = (2.5 + Math.random()*4)*scale;
      const buildingMat = new THREE.MeshStandardMaterial({ color: buildingColors[i % buildingColors.length], roughness:0.85, metalness:0.08 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), buildingMat);
      b.position.set(x, h/2, z);
      b.rotation.y = Math.random()*Math.PI;
      scene.add(b);

      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w*1.05, 0.12*scale, d*1.05),
        new THREE.MeshStandardMaterial({ color:'#241f1a', roughness:0.7 })
      );
      roof.position.set(x, h + 0.06*scale, z);
      roof.rotation.y = b.rotation.y;
      scene.add(roof);

      // petites fenêtres légèrement lumineuses pour donner vie aux ruines
      const windowMat = new THREE.MeshStandardMaterial({ color:'#ffb648', emissive:'#ffb648', emissiveIntensity:0.5, roughness:0.4 });
      for (let wi=0; wi<2; wi++){
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.35*scale, 0.35*scale), windowMat);
        const localX = (wi === 0 ? -0.25 : 0.25) * w;
        win.position.set(
          x + localX*Math.cos(b.rotation.y) - (d/2+0.01)*Math.sin(b.rotation.y),
          h*0.55,
          z + localX*Math.sin(b.rotation.y) + (d/2+0.01)*Math.cos(b.rotation.y)
        );
        win.rotation.y = b.rotation.y;
        scene.add(win);
      }
      obstacles.push({ x, z, radius: Math.max(w,d)/2 + 0.4 });
    }

    // arbres à double étage de feuillage, teinte légèrement variée
    const trunkMat = new THREE.MeshStandardMaterial({ color:'#3b2a1c' });
    const treeCount = 8;
    for (let i=0;i<treeCount;i++){
      const angle = Math.random()*Math.PI*2;
      const dist = 2 + Math.random()*(ARENA_RADIUS-2);
      const x = Math.cos(angle)*dist, z = Math.sin(angle)*dist;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15*scale,0.2*scale,1.4*scale,6), trunkMat);
      trunk.position.set(x, 0.7*scale, z);
      scene.add(trunk);

      const leafColor = new THREE.Color('#2f5c33').offsetHSL((Math.random()-0.5)*0.05, 0, (Math.random()-0.5)*0.08);
      const leafMat = new THREE.MeshStandardMaterial({ color: leafColor, roughness:0.9 });
      const leavesLow = new THREE.Mesh(new THREE.ConeGeometry(1.1*scale,1.7*scale,7), leafMat);
      leavesLow.position.set(x, 2.0*scale, z);
      scene.add(leavesLow);
      const leavesTop = new THREE.Mesh(new THREE.ConeGeometry(0.75*scale,1.4*scale,7), leafMat.clone());
      leavesTop.position.set(x, 2.9*scale, z);
      scene.add(leavesTop);
      obstacles.push({ x, z, radius: 0.5*scale });
    }

    // limite d'arène : mur avec une fine ligne lumineuse façon barrière d'énergie
    const wall = new THREE.Mesh(
      new THREE.TorusGeometry(ARENA_RADIUS, 0.15, 8, 48),
      new THREE.MeshStandardMaterial({ color:'#5a4030', emissive:'#ffb648', emissiveIntensity:0.12, roughness:0.6 })
    );
    wall.rotation.x = Math.PI/2;
    wall.position.y = 0.1;
    scene.add(wall);

    addAtmosphericDust();
  }

  function buildFighterMesh(outfitColor, swordColor){
    const group = new THREE.Group();
    const accent = new THREE.Color(swordColor);

    const bodyGeo = THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.4, 0.85, 4, 8) : new THREE.CylinderGeometry(0.4,0.4,1.2,10);
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: outfitColor, roughness:0.5, metalness:0.2 }));
    body.position.y = 0.95;
    group.add(body);

    // ceinture
    const belt = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.045, 8, 20),
      new THREE.MeshStandardMaterial({ color:'#241705', metalness:0.35, roughness:0.55 })
    );
    belt.rotation.x = Math.PI/2;
    belt.position.y = 0.62;
    group.add(belt);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3,16,16), new THREE.MeshStandardMaterial({ color:'#f1c39a', roughness:0.6 }));
    head.position.y = 1.75;
    group.add(head);

    // visière colorée (identité visuelle du combattant, assortie à la couleur d'épée)
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.09, 0.32),
      new THREE.MeshStandardMaterial({ color: swordColor, metalness:0.6, roughness:0.25, emissive: accent, emissiveIntensity:0.18 })
    );
    visor.position.set(0, 1.82, 0.02);
    group.add(visor);

    // yeux
    const eyeMat = new THREE.MeshStandardMaterial({ color:'#1a1410', roughness:0.4 });
    const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.1, 1.78, 0.26); group.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat.clone()); eyeR.position.set(0.1, 1.78, 0.26); group.add(eyeR);

    // épaulières
    const shoulderGeo = new THREE.SphereGeometry(0.21, 12, 12);
    const shoulderMat = new THREE.MeshStandardMaterial({ color: outfitColor, metalness:0.55, roughness:0.3 });
    const shoulderL = new THREE.Mesh(shoulderGeo, shoulderMat);
    shoulderL.position.set(-0.45, 1.45, 0); group.add(shoulderL);
    const shoulderR = new THREE.Mesh(shoulderGeo, shoulderMat.clone());
    shoulderR.position.set(0.45, 1.45, 0); group.add(shoulderR);

    // bras
    const armGeo = THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.09, 0.5, 4, 6) : new THREE.CylinderGeometry(0.09,0.09,0.7,8);
    const armMat = new THREE.MeshStandardMaterial({ color: outfitColor, roughness:0.55, metalness:0.15 });
    const armL = new THREE.Mesh(armGeo, armMat);
    armL.position.set(-0.47, 1.05, 0); armL.rotation.z = 0.14; group.add(armL);
    const armR = new THREE.Mesh(armGeo, armMat.clone());
    armR.position.set(0.47, 1.05, 0); armR.rotation.z = -0.14; group.add(armR);

    // bottes
    const bootGeo = new THREE.CylinderGeometry(0.16, 0.19, 0.3, 8);
    const bootMat = new THREE.MeshStandardMaterial({ color:'#241705', roughness:0.6, metalness:0.1 });
    const bootL = new THREE.Mesh(bootGeo, bootMat); bootL.position.set(-0.16, 0.15, 0.03); group.add(bootL);
    const bootR = new THREE.Mesh(bootGeo, bootMat.clone()); bootR.position.set(0.16, 0.15, 0.03); group.add(bootR);

    // cape
    const cape = new THREE.Mesh(
      new THREE.PlaneGeometry(0.68, 1.05, 1, 4),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(outfitColor).multiplyScalar(0.55), roughness:1, metalness:0, side: THREE.DoubleSide })
    );
    cape.position.set(0, 0.95, -0.3);
    cape.rotation.x = 0.1;
    group.add(cape);

    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.09,1.0,0.05), new THREE.MeshStandardMaterial({ color: swordColor, metalness:0.65, roughness:0.2, emissive: accent, emissiveIntensity:0.1 }));
    sword.position.set(0.5, 1.0, 0.1);
    sword.rotation.z = -0.4;
    group.add(sword);
    const healthBar = makeHealthBar();
    group.add(healthBar);
    return { group, sword, healthBar, cape };
  }

  function randomSpawnPos(){
    let pos;
    let dist;
    let tries = 0;
    do {
      const angle = Math.random()*Math.PI*2;
      dist = Math.random()*(ARENA_RADIUS-2);
      pos = { x: Math.cos(angle)*dist, z: Math.sin(angle)*dist };
      tries++;
    } while (tries < 15 && obstacles.some(o => dist2(pos.x,pos.z,o.x,o.z) < (o.radius+1)*(o.radius+1)));
    return pos;
  }
  function dist2(x1,z1,x2,z2){ const dx=x1-x2, dz=z1-z2; return dx*dx+dz*dz; }

  function initFighters(){
    // retire les combattants de la partie précédente (évite l'accumulation de modèles fantômes)
    for (const old of fighters){
      if (old.mesh){
        scene.remove(old.mesh);
        old.mesh.traverse(obj=>{
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material){
            if (Array.isArray(obj.material)) obj.material.forEach(m=>m.dispose());
            else obj.material.dispose();
          }
        });
      }
    }
    fighters = [];
    const outfits = OUTFIT_COLORS;
    const usedNames = new Set([APP.username]);

    // joueur
    const playerPos = randomSpawnPos();
    const playerMeshData = buildFighterMesh(APP.outfitColor, APP.swordColor);
    playerMeshData.group.position.set(playerPos.x, 0, playerPos.z);
    scene.add(playerMeshData.group);
    fighters.push({
      id:'player', name: APP.username, isPlayer:true, isBot:false,
      hp: MAX_HP, kills:0, alive:true,
      pos: playerPos, rotY:0, mesh: playerMeshData.group, sword: playerMeshData.sword, healthBar: playerMeshData.healthBar,
      cape: playerMeshData.cape, capePhase: Math.random()*10,
      attackCooldown:0, respawnAt:0
    });
    updateHealthBar(fighters[0]);

    // robots pour compléter les emplacements
    for (let i=0; i<TOTAL_SLOTS-1; i++){
      let name;
      do { name = BOT_NAMES[Math.floor(Math.random()*BOT_NAMES.length)] + (Math.floor(Math.random()*90)+10); }
      while (usedNames.has(name));
      usedNames.add(name);
      const pos = randomSpawnPos();
      const color = outfits[Math.floor(Math.random()*outfits.length)];
      const meshData = buildFighterMesh(color, '#d9dde3');
      meshData.group.position.set(pos.x, 0, pos.z);
      scene.add(meshData.group);
      fighters.push({
        id:'bot'+i, name, isPlayer:false, isBot:true,
        hp: MAX_HP, kills:0, alive:true,
        pos, rotY: Math.random()*Math.PI*2, mesh: meshData.group, sword: meshData.sword, healthBar: meshData.healthBar,
        cape: meshData.cape, capePhase: Math.random()*10,
        attackCooldown: Math.random()*ATTACK_COOLDOWN, respawnAt:0,
        wanderAngle: Math.random()*Math.PI*2, wanderTimer: Math.random()*3
      });
      updateHealthBar(fighters[fighters.length - 1]);
    }
  }

  function init(){
    const canvas = document.getElementById('match-canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#0d1a14');
    scene.fog = new THREE.Fog('#0d1a14', 14, 36);

    camera = new THREE.PerspectiveCamera(55, window.innerWidth/window.innerHeight, 0.1, 200);

    hemiLight = new THREE.HemisphereLight('#bcd4ff', '#182010', 0.7);
    scene.add(hemiLight);
    sunLight = new THREE.DirectionalLight('#ffe6bd', 1.0);
    sunLight.position.set(10, 16, 6);
    scene.add(sunLight);
    originalHemiIntensity = hemiLight.intensity;
    originalSunIntensity = sunLight.intensity;

    buildArena();
    clock = new THREE.Clock();
    window.addEventListener('resize', onResize);
    onResize();
  }

  function onResize(){
    if (!renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w,h);
    camera.aspect = w/h;
    camera.updateProjectionMatrix();
  }

  /* ---------- Joystick tactile / souris ---------- */
  function setupJoystick(){
    const zone = document.getElementById('joystick-zone');
    const knob = document.getElementById('joystick-knob');
    const maxDist = 40;

    function handleMove(clientX, clientY){
      const rect = zone.getBoundingClientRect();
      const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
      let dx = clientX - cx, dy = clientY - cy;
      const d = Math.hypot(dx,dy);
      if (d > maxDist){ dx = dx/d*maxDist; dy = dy/d*maxDist; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      joystickVec.x = dx / maxDist;
      joystickVec.y = dy / maxDist;
    }
    function resetKnob(){
      knob.style.transform = 'translate(0,0)';
      joystickVec.x = 0; joystickVec.y = 0;
      joystickActive = false; joystickTouchId = null;
    }

    zone.addEventListener('touchstart', (e)=>{
      const t = e.changedTouches[0];
      joystickTouchId = t.identifier;
      joystickActive = true;
      handleMove(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive:false });
    zone.addEventListener('touchmove', (e)=>{
      for (const t of e.changedTouches){
        if (t.identifier === joystickTouchId){ handleMove(t.clientX, t.clientY); }
      }
      e.preventDefault();
    }, { passive:false });
    zone.addEventListener('touchend', (e)=>{
      for (const t of e.changedTouches){
        if (t.identifier === joystickTouchId) resetKnob();
      }
    });

    // souris (pour tester sur ordinateur)
    let mouseDown = false;
    zone.addEventListener('mousedown', (e)=>{ mouseDown = true; joystickActive = true; handleMove(e.clientX, e.clientY); });
    window.addEventListener('mousemove', (e)=>{ if (mouseDown) handleMove(e.clientX, e.clientY); });
    window.addEventListener('mouseup', ()=>{ if (mouseDown){ mouseDown=false; resetKnob(); } });
  }

  document.getElementById('btn-attack').addEventListener('click', ()=>{ attackRequested = true; });

  function useEquipment(type){
    if (!running || !APP.equipment.includes(type) || equipmentUsed.has(type)) return;
    const player = getPlayer();
    if (!player || !player.alive) return;
    equipmentUsed.add(type);
    const button = document.getElementById(`ability-${type}`);
    button.classList.add('used');
    if (type === 'heal'){
      player.hp = MAX_HP;
      updateHpUI(player.hp);
      updateHealthBar(player);
      addEffect(player.pos, '#45d6c4', 900);
      setMatchStatus('Soin instantané activé');
      return;
    }
    if (type === 'fog'){
      fogUntil = performance.now() + 7000;
      setMatchStatus('Brouillard activé pendant 7 secondes', 7000);
      return;
    }
    const target = fighters
      .filter(f=>f !== player && f.alive)
      .sort((a,b)=>dist2(player.pos.x, player.pos.z, a.pos.x, a.pos.z) - dist2(player.pos.x, player.pos.z, b.pos.x, b.pos.z))[0];
    if (!target || Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z) > 6){
      equipmentUsed.delete(type);
      button.classList.remove('used');
      setMatchStatus('Aucun adversaire assez proche');
      return;
    }
    target.frozenUntil = performance.now() + 3000;
    addEffect(target.pos, '#8ed8ff', 1000);
    setMatchStatus(`${target.name} est gelé pendant 3 secondes`);
  }

  document.getElementById('ability-ice').addEventListener('click', ()=>useEquipment('ice'));
  document.getElementById('ability-fog').addEventListener('click', ()=>useEquipment('fog'));
  document.getElementById('ability-heal').addEventListener('click', ()=>useEquipment('heal'));

  // bouton "Équipement" au-dessus de l'attaque : affiche/masque les capacités utilisables
  document.getElementById('btn-match-equipment').addEventListener('click', ()=>{
    document.getElementById('equipment-actions').classList.toggle('open');
  });

  /* ---------- Boucle de jeu ---------- */
  function getPlayer(){ return fighters.find(f=>f.isPlayer); }

  function updateFighter(f, dt){
    if (!f.alive) return;
    if (f.frozenUntil && performance.now() < f.frozenUntil){
      f.mesh.rotation.y += dt * 1.5;
      return;
    }
    if (f.attackCooldown > 0) f.attackCooldown -= dt;

    if (f.isPlayer){
      const moveX = joystickVec.x, moveZ = joystickVec.y;
      const mag = Math.hypot(moveX, moveZ);
      if (mag > 0.12){
        // "haut" (moveZ négatif) = tout droit devant le personnage (direction de la caméra),
        // "droite" (moveX positif) = strafe vers la droite du personnage.
        const moveForward = -moveZ;
        const moveRight = moveX;
        const worldX = camDirX*moveForward + camDirZ*moveRight;
        const worldZ = camDirZ*moveForward - camDirX*moveRight;
        const speed = BASE_SPEED * speedMultiplier;
        tryMove(f, worldX*speed*dt, worldZ*speed*dt);
        // on tourne progressivement vers la direction du déplacement (vitesse limitée)
        // au lieu de faire pivoter le personnage instantanément : ça évite l'effet
        // de "rotation sur place" et fait bien avancer le joueur dans la carte.
        const targetRot = Math.atan2(worldX, worldZ);
        f.rotY = stepTowardAngle(f.rotY, targetRot, MAX_TURN_RATE*dt);
      }
      if (attackRequested && f.attackCooldown <= 0){
        performAttack(f);
        f.attackCooldown = ATTACK_COOLDOWN;
      }
    } else if (f.isBot){
      updateBotAI(f, dt);
    }

    f.mesh.position.set(f.pos.x, 0, f.pos.z);
    f.mesh.rotation.y = f.rotY;
    if (f.cape) f.cape.rotation.x = 0.1 + Math.sin(performance.now()*0.004 + (f.capePhase||0)) * 0.05;
  }

  function tryMove(f, dx, dz){
    let nx = f.pos.x + dx, nz = f.pos.z + dz;
    const distFromCenter = Math.hypot(nx, nz);
    if (distFromCenter > ARENA_RADIUS - 0.5){
      const k = (ARENA_RADIUS-0.5)/distFromCenter;
      nx *= k; nz *= k;
    }
    for (const o of obstacles){
      if (dist2(nx,nz,o.x,o.z) < o.radius*o.radius){
        return; // bloqué par un obstacle
      }
    }
    f.pos.x = nx; f.pos.z = nz;
  }

  function updateBotAI(f, dt){
    const wanderSpeed = BASE_SPEED * speedMultiplier;
    if (performance.now() < fogUntil){
      f.wanderTimer -= dt;
      if (f.wanderTimer <= 0){ f.wanderAngle = Math.random()*Math.PI*2; f.wanderTimer = 1+Math.random()*2; }
      tryMove(f, Math.sin(f.wanderAngle)*wanderSpeed*dt, Math.cos(f.wanderAngle)*wanderSpeed*dt);
      f.rotY = f.wanderAngle;
      return;
    }

    // ---- Couronne Hunter : comportement dédié ----
    if (currentGameMode === 'couronne' && crown){
      const speed = BASE_SPEED * speedMultiplier;
      if (crown.state === 'vault'){
        // fonce sur la couronne pour la détruire
        const dx = crown.mesh.position.x - f.pos.x, dz = crown.mesh.position.z - f.pos.z;
        const d = Math.hypot(dx,dz) || 1;
        if (d > CROWN_ATTACK_RANGE*0.85){
          tryMove(f, dx/d*speed*dt, dz/d*speed*dt);
        } else if (f.attackCooldown <= 0){
          performAttack(f);
          f.attackCooldown = ATTACK_COOLDOWN + Math.random()*0.3;
        }
        f.rotY = Math.atan2(dx, dz);
        return;
      }
      if (crown.state === 'held' && crown.holder && crown.holder !== f){
        // pourchasse le porteur de la couronne
        const target = crown.holder;
        const dx = target.pos.x - f.pos.x, dz = target.pos.z - f.pos.z;
        const d = Math.hypot(dx,dz) || 1;
        if (d > ATTACK_RANGE*0.85){
          tryMove(f, dx/d*speed*dt, dz/d*speed*dt);
        } else if (f.attackCooldown <= 0){
          performAttack(f);
          f.attackCooldown = ATTACK_COOLDOWN + Math.random()*0.4;
        }
        f.rotY = Math.atan2(dx, dz);
        return;
      }
      if (crown.state === 'held' && crown.holder === f){
        // le porteur fuit le combattant vivant le plus proche pour tenir 10 secondes
        let nearest = null, best = Infinity;
        for (const other of fighters){
          if (other === f || !other.alive) continue;
          const dd = dist2(f.pos.x,f.pos.z, other.pos.x, other.pos.z);
          if (dd < best){ best = dd; nearest = other; }
        }
        if (nearest){
          const dx = f.pos.x - nearest.pos.x, dz = f.pos.z - nearest.pos.z;
          const d = Math.hypot(dx,dz) || 1;
          tryMove(f, dx/d*speed*dt, dz/d*speed*dt);
          f.rotY = Math.atan2(dx, dz);
        }
        return;
      }
    }

    // ---- Frappe Dolling : cherche la cible vivante la plus proche ----
    let target = null, best = Infinity;
    for (const other of fighters){
      if (other === f || !other.alive) continue;
      const d = dist2(f.pos.x,f.pos.z, other.pos.x, other.pos.z);
      if (d < best){ best = d; target = other; }
    }
    const speed = BASE_SPEED * speedMultiplier;
    if (target && best < 14*14){
      const dx = target.pos.x - f.pos.x, dz = target.pos.z - f.pos.z;
      const d = Math.hypot(dx,dz) || 1;
      if (d > ATTACK_RANGE*0.85){
        tryMove(f, dx/d*speed*dt, dz/d*speed*dt);
      } else if (f.attackCooldown <= 0){
        performAttack(f);
        f.attackCooldown = ATTACK_COOLDOWN + Math.random()*0.4;
      }
      f.rotY = Math.atan2(dx, dz);
    } else {
      f.wanderTimer -= dt;
      if (f.wanderTimer <= 0){ f.wanderAngle = Math.random()*Math.PI*2; f.wanderTimer = 2+Math.random()*3; }
      tryMove(f, Math.sin(f.wanderAngle)*speed*0.4*dt, Math.cos(f.wanderAngle)*speed*0.4*dt);
      f.rotY = f.wanderAngle;
    }
  }

  function performAttack(attacker){
    if (attacker.sword){
      attacker.sword.rotation.z = -1.6;
      setTimeout(()=>{ if (attacker.sword) attacker.sword.rotation.z = -0.4; }, 150);
    }
    for (const target of fighters){
      if (target === attacker || !target.alive) continue;
      const d = Math.hypot(target.pos.x-attacker.pos.x, target.pos.z-attacker.pos.z);
      if (d <= ATTACK_RANGE){
        // doit être globalement face à la cible
        const angleToTarget = Math.atan2(target.pos.x-attacker.pos.x, target.pos.z-attacker.pos.z);
        let diff = Math.abs(angleToTarget - attacker.rotY);
        diff = Math.min(diff, Math.PI*2-diff);
        if (diff < 1.3){
          applyDamage(attacker, target, DAMAGE);
        }
      }
    }
    // Couronne Hunter : la couronne posée au centre peut aussi être frappée tant qu'elle n'est pas prise
    if (currentGameMode === 'couronne' && crown && crown.state === 'vault'){
      const cd = Math.hypot(crown.mesh.position.x - attacker.pos.x, crown.mesh.position.z - attacker.pos.z);
      if (cd <= CROWN_ATTACK_RANGE){
        damageCrown(attacker, CROWN_DAMAGE);
      }
    }
  }

  function applyDamage(attacker, target, dmg){
    target.hp -= dmg;
    updateHealthBar(target);
    addEffect(target.pos, '#ff5c68', 450);
    target.damageFlashUntil = performance.now() + 180;
    if (target.isPlayer) updateHpUI(target.hp);
    if (target.hp <= 0){
      eliminate(attacker, target);
    }
  }

  function eliminate(attacker, target){
    target.alive = false;
    target.hp = 0;
    target.mesh.visible = false;
    attacker.kills += 1;
    pushElimFeed(attacker.name, target.name);
    updateLeaderboard();
    // cloche d'élimination, puis l'annonce vocale à CHAQUE élimination (sans son de foule,
    // et sans annuler une annonce précédente : chaque appel est indépendant et se met en
    // file d'attente au lieu de couper la précédente)
    AudioEngine.playBell();
    setTimeout(()=>{ AudioEngine.speak('Eliminated member'); }, 400);

    // Couronne Hunter : si la victime portait la couronne, elle passe à son tueur
    if (currentGameMode === 'couronne' && crown && crown.state === 'held' && crown.holder === target){
      claimCrown(attacker);
    }

    if (target.isPlayer){
      showRespawnOverlay();
    }
    target.respawnAt = timeLeft - RESPAWN_DELAY; // sera respawn quand timeLeft <= ceci
    scheduleRespawn(target);
  }

  function scheduleRespawn(f){
    setTimeout(()=>{
      if (!running) return;
      const pos = randomSpawnPos();
      f.pos = pos;
      f.hp = adrenalineActive ? 1 : MAX_HP;
      f.alive = true;
      f.mesh.visible = true;
      updateHealthBar(f);
      setAdrenalineTint(f, adrenalineActive);
      if (f.isPlayer){
        updateHpUI(f.hp);
        hideRespawnOverlay();
      }
    }, RESPAWN_DELAY*1000);
  }

  function setAdrenalineTint(f, on){
    if (!f.mesh) return;
    f.mesh.traverse(obj=>{
      if (obj.isMesh && obj.material && obj.material.emissive){
        if (on){
          obj.userData._prevEmissive = obj.material.emissive.getHex();
          obj.material.emissive.setHex(0x4a0000);
          obj.material.emissiveIntensity = 0.7;
        } else {
          obj.material.emissive.setHex(obj.userData._prevEmissive || 0x000000);
          obj.material.emissiveIntensity = 1;
        }
      }
    });
  }

  function scheduleAdrenaline(){
    clearTimeout(adrenalineTimeout);
    const remaining = MATCH_DURATION - ADRENALINE_MIN_DELAY - ADRENALINE_DURATION - ADRENALINE_END_MARGIN;
    if (remaining <= 0) return;
    const delay = ADRENALINE_MIN_DELAY + Math.random()*remaining;
    adrenalineTimeout = setTimeout(triggerAdrenaline, delay*1000);
  }

  function triggerAdrenaline(){
    if (!running || adrenalineActive) return;
    adrenalineActive = true;
    speedMultiplier = 2;

    hemiLight.intensity = 0.15;
    sunLight.intensity = 0.2;
    originalFog = { color: scene.fog.color.getHex(), near: scene.fog.near, far: scene.fog.far };
    scene.fog.color.setHex(0x1a0304);
    scene.fog.near = 4;
    scene.fog.far = 16;
    scene.background.setHex(0x120305);

    for (const f of fighters){
      if (!f.alive) continue;
      f.hp = 1;
      updateHealthBar(f);
      if (f.isPlayer) updateHpUI(1);
      setAdrenalineTint(f, true);
    }

    document.getElementById('adrenaline-overlay').classList.add('show');
    document.getElementById('adrenaline-banner').classList.add('show');
    setMatchStatus('MODE ADRÉNALINE — 1 PV, vitesse doublée !', ADRENALINE_DURATION*1000);
    AudioEngine.stopCombatMusic();
    AudioEngine.speak('Adrenaline mode', { priority:true, pitch:1.1 });
    AudioEngine.startAdrenalineMusic(ADRENALINE_DURATION);

    adrenalineEndTimeout = setTimeout(endAdrenaline, ADRENALINE_DURATION*1000);
  }

  function endAdrenaline(){
    if (!adrenalineActive) return;
    adrenalineActive = false;
    speedMultiplier = 1;

    hemiLight.intensity = originalHemiIntensity;
    sunLight.intensity = originalSunIntensity;
    if (originalFog){
      scene.fog.color.setHex(originalFog.color);
      scene.fog.near = originalFog.near;
      scene.fog.far = originalFog.far;
    }
    scene.background.setHex(originalBackgroundHex);

    for (const f of fighters){
      if (!f.alive) continue;
      f.hp = MAX_HP;
      updateHealthBar(f);
      if (f.isPlayer) updateHpUI(f.hp);
      setAdrenalineTint(f, false);
    }

    document.getElementById('adrenaline-overlay').classList.remove('show');
    document.getElementById('adrenaline-banner').classList.remove('show');
    AudioEngine.stopAdrenalineMusic();
    if (running) AudioEngine.startCombatMusic();
  }

  function updateHpUI(hp){
    const pct = Math.max(0, hp/MAX_HP*100);
    document.getElementById('hp-fill').style.width = pct + '%';
    document.getElementById('hp-label').textContent = `${Math.max(0,hp)} / ${MAX_HP}`;
  }

  let respawnCountdownInterval = null;
  function showRespawnOverlay(){
    const overlay = document.getElementById('respawn-overlay');
    overlay.classList.add('show');
    let s = RESPAWN_DELAY;
    document.getElementById('respawn-timer').textContent = s;
    clearInterval(respawnCountdownInterval);
    respawnCountdownInterval = setInterval(()=>{
      s--;
      document.getElementById('respawn-timer').textContent = Math.max(0,s);
      if (s <= 0) clearInterval(respawnCountdownInterval);
    }, 1000);
  }
  function hideRespawnOverlay(){
    document.getElementById('respawn-overlay').classList.remove('show');
    clearInterval(respawnCountdownInterval);
  }

  function pushElimFeed(killer, victim){
    const feed = document.getElementById('elim-feed');
    const item = document.createElement('div');
    item.className = 'elim-item';
    item.innerHTML = `<b>${escapeHtml(killer)}</b> a éliminé ${escapeHtml(victim)}`;
    feed.appendChild(item);
    setTimeout(()=>{ item.remove(); }, 4500);
  }

  function updateLeaderboard(){
    const sorted = [...fighters].sort((a,b)=>b.kills-a.kills);
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';
    sorted.slice(0,6).forEach(f=>{
      const li = document.createElement('li');
      if (f.isPlayer) li.className = 'me';
      li.innerHTML = `<span>${escapeHtml(f.name)}</span><span>${f.kills}</span>`;
      list.appendChild(li);
    });
    if (currentGameMode === 'frappe'){
      const yourRankEl = document.getElementById('yourank-value');
      if (yourRankEl){
        const rank = sorted.findIndex(f => f.isPlayer) + 1;
        yourRankEl.textContent = rank > 0 ? `#${rank}` : '#-';
      }
    }
  }

  let camDirX = 0, camDirZ = 1;
  function updateCamera(){
    const p = getPlayer();
    if (!p) return;
    const behindX = -Math.sin(p.rotY), behindZ = -Math.cos(p.rotY);
    camDirX = -behindX; camDirZ = -behindZ;
    const camX = p.pos.x + behindX*4.2;
    const camZ = p.pos.z + behindZ*4.2;
    camera.position.set(camX, 2.6, camZ);
    camera.lookAt(p.pos.x, 1.3, p.pos.z);
  }

  function tick(){
    if (!running) return;
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    for (const f of fighters) updateFighter(f, dt);
    updateEffects();
    if (currentGameMode === 'couronne' && crown) updateCrownState(dt);
    if (dustPoints) dustPoints.rotation.y += dt * 0.03;
    attackRequested = false;
    updateCamera();
    renderer.render(scene, camera);
  }

  function formatTime(s){
    const m = Math.floor(s/60);
    const sec = Math.max(0, Math.floor(s%60));
    return `${m}:${sec.toString().padStart(2,'0')}`;
  }

  function startTimer(){
    timeLeft = MATCH_DURATION;
    lastMinuteTriggered = false;
    document.getElementById('match-timer').textContent = formatTime(timeLeft);
    matchTimerInterval = setInterval(()=>{
      timeLeft -= 1;
      document.getElementById('match-timer').textContent = formatTime(timeLeft);
      if (!lastMinuteTriggered && timeLeft === 60){
        lastMinuteTriggered = true;
        AudioEngine.playChurchBell();
        AudioEngine.speak('Last minute', { priority:true, rate:0.9, pitch:0.85 });
        setMatchStatus('Dernière minute !', 4000);
      }
      if (timeLeft <= 0){
        clearInterval(matchTimerInterval);
        endMatch();
      }
    }, 1000);
  }

  function start(mode, ranked){
    currentGameMode = mode === 'couronne' ? 'couronne' : 'frappe';
    currentRanked = !!ranked && currentGameMode === 'frappe';
    MATCH_DURATION = currentGameMode === 'couronne' ? COURONNE_DURATION : FRAPPE_DURATION;

    showScreen('screen-match');
    if (!renderer) init();
    initFighters();
    removeCrownObjects();
    if (currentGameMode === 'couronne') spawnCrown();
    updateModeHud();
    updateHpUI(MAX_HP);
    updateLeaderboard();
    document.getElementById('elim-feed').innerHTML = '';
    hideRespawnOverlay();
    setupJoystickOnce();
    AudioEngine.unlock();

    // réinitialise l'état du mode adrénaline pour cette nouvelle partie
    clearTimeout(adrenalineTimeout);
    clearTimeout(adrenalineEndTimeout);
    adrenalineActive = false;
    speedMultiplier = 1;
    document.getElementById('adrenaline-overlay').classList.remove('show');
    document.getElementById('adrenaline-banner').classList.remove('show');
    if (currentGameMode === 'frappe') scheduleAdrenaline(); // pas de mode adrénaline en Couronne Hunter
    AudioEngine.startCombatMusic();

    running = true;
    clock.start();
    startTimer();
    tick();
  }

  let joystickSetup = false;
  function setupJoystickOnce(){
    if (joystickSetup) return;
    joystickSetup = true;
    setupJoystick();
  }

  function endMatch(opts = {}){
    running = false;
    clearInterval(matchTimerInterval);
    clearTimeout(adrenalineTimeout);
    clearTimeout(adrenalineEndTimeout);
    if (adrenalineActive) endAdrenaline();
    hideRespawnOverlay();
    AudioEngine.stopCombatMusic();

    const list = document.getElementById('end-leaderboard');
    list.innerHTML = '';
    const titleEl = document.querySelector('#screen-endmatch h2');
    const note = document.querySelector('#screen-endmatch .end-note');

    if (currentGameMode === 'couronne'){
      // Couronne Hunter : victoire par possession de 10 secondes, sinon match nul.
      // Aucune médaille n'est distribuée dans ce mode.
      const winner = opts.winner || null;
      if (titleEl) titleEl.textContent = winner ? 'Couronne remportée !' : 'Match nul';
      const li = document.createElement('li');
      if (winner){
        li.innerHTML = winner.isPlayer
          ? `<span class="me">👑 Tu as gardé la couronne 10 secondes !</span>`
          : `<span>👑 ${escapeHtml(winner.name)} a gardé la couronne 10 secondes.</span>`;
      } else {
        li.innerHTML = `<span>Personne n'a réussi à garder la couronne 10 secondes. Match nul.</span>`;
      }
      list.appendChild(li);
      if (note) note.textContent = 'Aucune médaille en Couronne Hunter. Retour au lobby…';
    } else if (currentRanked){
      // Partie classée : la ligue dépend des éliminations du joueur, annoncée au retour au lobby
      if (titleEl) titleEl.textContent = 'Partie classée terminée';
      const sorted = [...fighters].sort((a,b)=>b.kills-a.kills);
      let playerKills = 0;
      sorted.forEach((f,i)=>{
        if (f.isPlayer) playerKills = f.kills;
        const li = document.createElement('li');
        if (f.isPlayer) li.className = 'me';
        li.innerHTML = `<span>#${i+1} ${escapeHtml(f.name)}</span><span>${f.kills} élim.</span>`;
        list.appendChild(li);
      });
      pendingLeagueReveal = { index: leagueIndexForKills(playerKills), kills: playerKills };
      Store.save('trugo_league', pendingLeagueReveal.index);
      if (note) note.textContent = 'Ta ligue sera annoncée au retour au lobby…';
    } else {
      if (titleEl) titleEl.textContent = 'Partie terminée';
      const sorted = [...fighters].sort((a,b)=>b.kills-a.kills);
      let playerDelta = 0;
      sorted.forEach((f,i)=>{
        const rank = i + 1;
        const delta = pointsForRank(rank);
        if (f.isPlayer) playerDelta = delta;
        const li = document.createElement('li');
        if (f.isPlayer) li.className = 'me';
        const medal = medalForRank(rank);
        const medalPrefix = medal ? medal + ' ' : '';
        const deltaLabel = delta > 0 ? `+${delta}` : `${delta}`;
        li.innerHTML = `<span>#${rank} ${medalPrefix}${escapeHtml(f.name)}</span><span>${f.kills} élim. · ${deltaLabel} médailles</span>`;
        list.appendChild(li);
      });

      APP.points = Math.max(0, APP.points + playerDelta);
      Store.save('trugo_points', APP.points);
      if (note){
        const deltaLabel = playerDelta > 0 ? `+${playerDelta}` : `${playerDelta}`;
        note.textContent = `${deltaLabel} médailles — total : ${APP.points} médailles. Retour au lobby…`;
      }
    }

    showScreen('screen-endmatch');
    setTimeout(()=>{
      showScreen('screen-lobby');
      Lobby.start();
      if (pendingLeagueReveal){
        const r = pendingLeagueReveal;
        pendingLeagueReveal = null;
        showLeagueReveal(r.index, r.kills);
      }
    }, 3500);
  }

  return { start };
})();

/* ---------------------------------------------------------
   DEMARRAGE
--------------------------------------------------------- */
window.addEventListener('load', runLoadingSequence);
