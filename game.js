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
  league: Store.load('trugo_league', 0), // ligue actuelle (Bronze par défaut)
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
  const lg = LEAGUES[Number.isInteger(APP.league) ? APP.league : 0] || LEAGUES[0];
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
  cow: 'Vache enragée',
  bolt: 'Éclair',
  mortar: 'Mortier de lion',
  dancing: 'Dancing',
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
  openRankings('medals');
});

/* ---------------------------------------------------------
   CLASSEMENTS LIGUES / MEDAILLES
   Les autres joueurs restent des exemples locaux tant qu'un
   backend et une base de données ne sont pas connectés.
--------------------------------------------------------- */

let activeRankingTab = 'leagues';
let serverLeaderboard = null;
let leaderboardLoading = false;

function openRankings(tab='leagues'){
  activeRankingTab = tab;
  renderRankings();
  openPanel('panel-rankings');
}
function renderRankings(){
  if (!serverLeaderboard && !leaderboardLoading) {
    leaderboardLoading = true;
    fetch('/api/friends/leaderboard',{credentials:'same-origin'})
      .then(r=>r.ok?r.json():Promise.reject(new Error('Classement indisponible')))
      .then(data=>{serverLeaderboard=data.players||[];renderRankings();})
      .catch(()=>{})
      .finally(()=>{leaderboardLoading=false;});
  }
  const list = document.getElementById('ranking-list');
  const title = document.getElementById('ranking-panel-title');
  const description = document.getElementById('ranking-panel-description');
  if (!list || !title || !description) return;
  const player = { name: APP.username || 'Toi', league: Math.max(0, Math.min(LEAGUES.length-1, Number(APP.league) || 0)), medals: Number(APP.points) || 0, isPlayer:true };
  let entries = serverLeaderboard && serverLeaderboard.length
    ? serverLeaderboard.map(p=>({name:p.username,league:Number(p.league)||0,medals:Number(p.points)||0,isPlayer:String(p.username).toLowerCase()===String(APP.username||'').toLowerCase()}))
    : [player];
  if (activeRankingTab === 'medals') {
    entries.sort((a,b) => b.medals-a.medals || b.league-a.league);
    title.textContent = 'Classement des médailles';
    description.textContent = 'Classement réel des comptes enregistrés, selon leurs points de saison.';
  } else {
    entries.sort((a,b) => b.league-a.league || b.medals-a.medals);
    title.textContent = 'Classement des ligues';
    description.textContent = 'Classement des comptes enregistrés par ligue, puis par points.';
  }
  list.replaceChildren();
  entries.forEach((entry,index)=>{
    const li = document.createElement('li');
    if (entry.isPlayer) li.classList.add('me');
    const name = document.createElement('span');
    name.className = 'ranking-player-name';
    name.textContent = `${index+1 <= 3 ? medalForRank(index+1) + ' ' : ''}#${index+1} ${entry.name}`;
    const stats = document.createElement('span');
    stats.className = 'ranking-player-stats';
    const league = LEAGUES[entry.league] || LEAGUES[0];
    stats.textContent = activeRankingTab === 'medals' ? `🏅 ${entry.medals}` : `${league.name} · 🏅 ${entry.medals}`;
    stats.style.setProperty('--rank-league-color', league.color);
    li.append(name,stats);
    list.appendChild(li);
  });
  document.getElementById('btn-ranking-leagues')?.classList.toggle('active', activeRankingTab === 'leagues');
  document.getElementById('btn-ranking-medals')?.classList.toggle('active', activeRankingTab === 'medals');
}

document.getElementById('btn-league-ranking')?.addEventListener('click', ()=>openRankings('leagues'));
document.getElementById('btn-ranking-leagues')?.addEventListener('click', ()=>{ activeRankingTab='leagues'; renderRankings(); });
document.getElementById('btn-ranking-medals')?.addEventListener('click', ()=>{ activeRankingTab='medals'; renderRankings(); });


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

  function unlock(){
    const c = ensureCtx();
    if (c) loadEliminationSound();
  }

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

  // Son personnalisé joué à chaque élimination.
  // Le MP3 est intégré directement dans game.js : aucun lecteur audio
  // n'est créé, donc le téléphone ne peut pas afficher pause/lecture pour ce son.
  const eliminationSoundSrc = 'data:audio/mpeg;base64,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VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';
  const dancingSoundSrc = 'data:audio/mpeg;base64,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';
  let dancingAudioBuffer = null;
  let dancingAudioLoading = null;
  let dancingAudioSource = null;

  async function loadDancingSound(){
    if (dancingAudioBuffer) return dancingAudioBuffer;
    if (dancingAudioLoading) return dancingAudioLoading;
    const c = ensureCtx();
    if (!c) return null;
    dancingAudioLoading = (async()=>{
      try{
        const response = await fetch(dancingSoundSrc);
        const data = await response.arrayBuffer();
        dancingAudioBuffer = await c.decodeAudioData(data);
        return dancingAudioBuffer;
      }catch(error){
        console.warn('Impossible de charger la musique Dancing', error);
        return null;
      }finally{
        dancingAudioLoading = null;
      }
    })();
    return dancingAudioLoading;
  }

  function stopDancingMusic(){
    if (dancingAudioSource){
      try{ dancingAudioSource.stop(); }catch(e){}
      try{ dancingAudioSource.disconnect(); }catch(e){}
      dancingAudioSource = null;
    }
  }

  async function playDancingMusic(){
    const c = ensureCtx();
    if (!c) return;
    if (c.state === 'suspended') await c.resume().catch(()=>{});
    const buffer = await loadDancingSound();
    if (!buffer) return;
    try{
      stopDancingMusic();
      const source = c.createBufferSource();
      const gain = c.createGain();
      source.buffer = buffer;
      gain.gain.value = 1;
      source.connect(gain);
      gain.connect(c.destination);
      source.start(0);
      dancingAudioSource = source;
      source.onended = ()=>{ if (dancingAudioSource === source) dancingAudioSource = null; };
    }catch(error){
      console.warn('Lecture de la musique Dancing impossible', error);
    }
  }

  let eliminationAudioBuffer = null;
  let eliminationAudioLoading = null;

  async function loadEliminationSound(){
    if (eliminationAudioBuffer) return eliminationAudioBuffer;
    if (eliminationAudioLoading) return eliminationAudioLoading;
    const c = ensureCtx();
    if (!c) return null;
    eliminationAudioLoading = (async()=>{
      try{
        const response = await fetch(eliminationSoundSrc);
        const data = await response.arrayBuffer();
        eliminationAudioBuffer = await c.decodeAudioData(data);
        return eliminationAudioBuffer;
      }catch(error){
        console.warn('Impossible de charger le son d\'élimination', error);
        return null;
      }finally{
        eliminationAudioLoading = null;
      }
    })();
    return eliminationAudioLoading;
  }

  function playEliminationSound(){
    const c = ensureCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(()=>{});
    loadEliminationSound().then(buffer=>{
      if (!buffer) return;
      try{
        const source = c.createBufferSource();
        const gain = c.createGain();
        source.buffer = buffer;
        gain.gain.value = 1;
        source.connect(gain);
        gain.connect(c.destination);
        source.start(0);
      }catch(error){
        console.warn('Lecture du son d\'élimination impossible', error);
      }
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

  // ---- son des vidéos d'annonce : décodé en avance puis joué via l'AudioContext,
  // exactement comme le son d'élimination (aucune autorisation « son » demandée) ----
  const clipBuffers = new Map();   // url -> AudioBuffer
  const clipLoading = new Map();   // url -> Promise<AudioBuffer|null>
  let clipSource = null;

  function preloadClip(url){
    if (clipBuffers.has(url)) return Promise.resolve(clipBuffers.get(url));
    if (clipLoading.has(url)) return clipLoading.get(url);
    const c = ensureCtx();
    if (!c) return Promise.resolve(null);
    const job = (async()=>{
      try{
        const response = await fetch(url);
        const data = await response.arrayBuffer();
        const buffer = await c.decodeAudioData(data);
        clipBuffers.set(url, buffer);
        return buffer;
      }catch(error){
        console.warn('Son de la vidéo indisponible', error);
        return null;
      }finally{
        clipLoading.delete(url);
      }
    })();
    clipLoading.set(url, job);
    return job;
  }

  function stopClip(){
    if (clipSource){
      try{ clipSource.stop(); }catch(e){}
      try{ clipSource.disconnect(); }catch(e){}
      clipSource = null;
    }
  }

  // joue le son de la vidéo à partir de `offset` secondes ; renvoie true si le son a pu démarrer
  async function playClip(url, offset = 0){
    const c = ensureCtx();
    if (!c) return false;
    const buffer = await preloadClip(url);
    if (!buffer) return false;
    try{
      if (c.state === 'suspended') await c.resume();
      stopClip();
      const source = c.createBufferSource();
      const gain = c.createGain();
      source.buffer = buffer;
      gain.gain.value = 1;
      source.connect(gain);
      gain.connect(c.destination);
      source.start(0, Math.max(0, Math.min(offset, buffer.duration - 0.01)));
      clipSource = source;
      return true;
    }catch(error){
      console.warn('Lecture du son de la vidéo impossible', error);
      return false;
    }
  }

  return {
    unlock, playBell, playEliminationSound, playChurchBell, speak,
    startCombatMusic, stopCombatMusic,
    startAdrenalineMusic, stopAdrenalineMusic,
    preloadClip, playClip, stopClip, playDancingMusic, stopDancingMusic
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
      setTimeout(async ()=>{
        // Le nom en localStorage ne suffit pas : on vérifie la session serveur.
        try {
          const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
          if (!response.ok) throw new Error('Session absente');
          const data = await response.json();
          APP.username = data.user.username;
          APP.userId = data.user.id;
          Store.save('trugo_username', APP.username);
          enterLobby();
        } catch (_) {
          APP.username = null;
          APP.userId = null;
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
let authMode = 'login';
const loginForm = document.getElementById('login-form');
const authSubmit = loginForm.querySelector('button[type="submit"],button');
const authToggle = document.createElement('button');
authToggle.type = 'button';
authToggle.className = 'btn-secondary';
authToggle.style.marginTop = '.65rem';
authToggle.style.width = '100%';
authToggle.textContent = 'Créer un compte';
loginForm.appendChild(authToggle);
authToggle.addEventListener('click', () => {
  authMode = authMode === 'login' ? 'register' : 'login';
  authSubmit.textContent = authMode === 'register' ? 'Créer mon compte' : 'Se connecter';
  authToggle.textContent = authMode === 'register' ? 'J’ai déjà un compte' : 'Créer un compte';
  const note = loginForm.querySelector('.field-note');
  if (note) note.textContent = authMode === 'register'
    ? 'Choisis un pseudo de 3 à 30 caractères et un mot de passe de 10 caractères minimum.'
    : 'Connecte-toi à ton compte TRUGO pour retrouver tes amis et tes statistiques.';
});

loginForm.addEventListener('submit', async (e)=>{
  e.preventDefault(); AudioEngine.unlock();
  const name=document.getElementById('login-name').value.trim();
  const pass=document.getElementById('login-pass').value;
  if(!name||!pass)return;
  if(authSubmit)authSubmit.disabled=true;
  try{
    const endpoint = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
    const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:name,password:pass})});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error|| (authMode === 'register' ? 'Création du compte impossible.' : 'Connexion impossible.'));
    APP.username=data.user.username; APP.userId=data.user.id;
    Store.save('trugo_username',APP.username);
    const errorNote=document.getElementById('auth-error'); if(errorNote)errorNote.remove();
    enterLobby();
  }catch(err){
    let note=document.getElementById('auth-error');
    if(!note){note=document.createElement('p');note.id='auth-error';note.className='social-message error';loginForm.appendChild(note);}
    note.textContent=err.message||'Serveur inaccessible.';
  }finally{if(authSubmit)authSubmit.disabled=false;}
});
function enterLobby(){
  document.getElementById('lobby-username').textContent = APP.username;
  setTimeout(socialHeartbeat, 500);
  updateLeagueUI();
  showScreen('screen-lobby');
  Lobby.start();
}

function updateLobbyPointsUI(){
  const el = document.getElementById('lobby-medal-count');
  if (el) el.textContent = String(APP.points);
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

// Sécurité : uniquement des équipements connus, 3 au maximum (anciennes sauvegardes comprises)
APP.equipment = (Array.isArray(APP.equipment) ? APP.equipment : [])
  .filter((t, i, a)=>['ice', 'fog', 'heal', 'cow', 'bolt', 'mortar', 'dancing'].includes(t) && a.indexOf(t) === i)
  .slice(0, 3);
if (!APP.equipment.length) APP.equipment = ['ice', 'fog', 'heal'];

// Ajout du 7e équipement sans modifier les autres cartes existantes.
(function ensureDancingEquipmentCard(){
  const existing = document.querySelector('.equipment-card[data-equipment="dancing"]');
  if (existing) return;
  const reference = document.querySelector('.equipment-card');
  if (!reference || !reference.parentElement) return;
  const card = reference.cloneNode(true);
  card.dataset.equipment = 'dancing';
  const title = card.querySelector('.equipment-card-title, h3, h4, strong, b');
  if (title) title.textContent = 'Dancing';
  const desc = card.querySelector('.equipment-card-description, p, small');
  if (desc) desc.textContent = 'Ciel rose, musique et rond qui désigne un joueur.';
  card.classList.remove('selected', 'locked');
  reference.parentElement.appendChild(card);
  card.addEventListener('click', ()=>{
    const equipment = card.dataset.equipment;
    if (APP.equipment.includes(equipment)){
      APP.equipment = APP.equipment.filter(item=>item !== equipment);
    } else if (APP.equipment.length < 3){
      APP.equipment.push(equipment);
    } else {
      const counter = document.getElementById('equipment-count');
      if (counter){
        counter.classList.remove('shake');
        void counter.offsetWidth;
        counter.classList.add('shake');
        setTimeout(()=>counter.classList.remove('shake'), 450);
      }
      return;
    }
    Store.save('trugo_equipment', APP.equipment);
    refreshEquipmentCards();
  });
})();

function refreshEquipmentCards(){
  const full = APP.equipment.length >= 3;
  document.querySelectorAll('.equipment-card').forEach(card=>{
    const on = APP.equipment.includes(card.dataset.equipment);
    card.classList.toggle('selected', on);
    card.classList.toggle('locked', full && !on);
  });
  const counter = document.getElementById('equipment-count');
  if (counter){
    counter.textContent = `${APP.equipment.length} / 3 équipements choisis`;
    counter.classList.toggle('full', full);
  }
}

document.getElementById('btn-equipment').addEventListener('click', ()=>{
  refreshEquipmentCards();
  openPanel('panel-equipment');
});
document.querySelectorAll('.equipment-card').forEach(card=>{
  card.addEventListener('click', ()=>{
    const equipment = card.dataset.equipment;
    if (APP.equipment.includes(equipment)){
      APP.equipment = APP.equipment.filter(item=>item !== equipment);
    } else if (APP.equipment.length < 3){
      APP.equipment.push(equipment);
    } else {
      // déjà 3 équipements : le compteur tremble pour dire « retire-en un d'abord »
      const counter = document.getElementById('equipment-count');
      if (counter){
        counter.classList.remove('shake');
        void counter.offsetWidth;
        counter.classList.add('shake');
        setTimeout(()=>counter.classList.remove('shake'), 450);
      }
      return;
    }
    Store.save('trugo_equipment', APP.equipment);
    refreshEquipmentCards();
  });
});

/* ---------------------------------------------------------
   PANNEAU AMIS — comptes réels, demandes et présence PostgreSQL
--------------------------------------------------------- */
async function socialRequest(url,options={}){
 const r=await fetch(url,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(d.error||'Action impossible.'); return d;
}
function socialMessage(message,error=false){
 let el=document.getElementById('friends-message');
 if(!el){el=document.createElement('p');el.id='friends-message';el.className='social-message';document.querySelector('#panel-friends .panel-inner')?.prepend(el);}
 el.textContent=message;el.classList.toggle('error',error);
}
function renderFriendRows(target,rows,mode){
 target.replaceChildren();
 if(!rows.length){const li=document.createElement('li');li.className='empty';li.textContent=mode==='mine'?'Aucun ami pour le moment — recherche un joueur ci-dessus.':'Aucun compte correspondant.';target.appendChild(li);return;}
 rows.forEach(user=>{
  const li=document.createElement('li');li.className='friend-card';
  const info=document.createElement('span');info.className='friend-info';
  const name=document.createElement('strong');name.textContent=user.username;
  const status=document.createElement('small');status.className='friend-status '+(user.online?'online':'offline');status.textContent=user.online?'● En ligne':'○ Hors ligne';
  info.append(name,status);li.appendChild(info);
  const btn=document.createElement('button');
  if(mode==='mine'&&user.status==='pending'&&String(user.requester_id)!==String(APP.userId)){
   btn.textContent='Accepter';btn.onclick=async()=>{try{await socialRequest('/api/friends/accept/'+user.id,{method:'POST',body:'{}'});await loadFriends();}catch(e){socialMessage(e.message,true);}};
  }else if(mode==='mine'){
   btn.textContent=user.status==='pending'?'Annuler':'Retirer';btn.className='friend-remove';
   btn.onclick=async()=>{try{await socialRequest('/api/friends/'+user.id,{method:'DELETE'});await loadFriends();}catch(e){socialMessage(e.message,true);}};
  }else{
   btn.textContent=user.relationship==='friend'?'Déjà ami':user.relationship==='sent'?'Demande envoyée':user.relationship==='received'?'Accepter':'Ajouter';
   btn.disabled=['friend','sent'].includes(user.relationship);
   btn.onclick=async()=>{try{await socialRequest('/api/friends/request',{method:'POST',body:JSON.stringify({username:user.username})});socialMessage('Demande envoyée à '+user.username+' ✨');await searchFriends(document.getElementById('friends-search').value);await loadFriends();}catch(e){socialMessage(e.message,true);}};
  }
  li.appendChild(btn);target.appendChild(li);
 });
}
async function loadFriends(){try{const d=await socialRequest('/api/friends');renderFriendRows(document.getElementById('friends-mine'),d.friends.map(f=>({...f,id:f.friendship_id})),'mine');}catch(e){socialMessage(e.message,true);}}
async function searchFriends(query){
 const ul=document.getElementById('friends-results'),q=String(query||'').trim();
 if(!q){ul.replaceChildren();return;}
 try{const d=await socialRequest('/api/friends/users?q='+encodeURIComponent(q));renderFriendRows(ul,d.users,'search');}catch(e){socialMessage(e.message,true);}
}
document.getElementById('btn-friends').addEventListener('click',()=>{document.getElementById('friends-search').value='';document.getElementById('friends-results').replaceChildren();loadFriends();openPanel('panel-friends');});
document.getElementById('friends-search').addEventListener('input',e=>searchFriends(e.target.value));
async function socialHeartbeat(){
 if(!APP.username)return;
 try{await socialRequest('/api/friends/presence',{method:'POST',body:'{}'});await socialRequest('/api/friends/stats',{method:'POST',body:JSON.stringify({points:APP.points||0,league:APP.league||0})});if(document.getElementById('panel-friends')?.classList.contains('open'))await loadFriends();}catch(_){}
}
setInterval(socialHeartbeat,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)socialHeartbeat();});

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

const MODE_ANNOUNCEMENT_VIDEOS = {
  // Vidéo 1 : Couronne Hunter
  couronne: 'video-couronne-hunter.mp4',
  // Vidéo 2 : Maxitrone
  maxitrone: 'video-maxitrone.mp4',
  // Vidéo 3 : Frappe Dolling
  frappe: 'video-frappe-dolling.mp4'
};

let selectedMatchMode = null;

/* ---------------------------------------------------------
   MATCHMAKING
   Le mode normal est tiré au sort dès que le joueur clique
   sur JOUER, puis reste verrouillé pendant toute la recherche.
--------------------------------------------------------- */
const Matchmaking = (()=>{
  let interval = null;
  let secondsLeft = 10;
  let ranked = false;

  function start(isRanked){
    ranked = !!isRanked;

    // Le choix du mode est fait immédiatement au lancement du matchmaking.
    // Le mode classé conserve les règles Frappe Dolling existantes.
    selectedMatchMode = ranked
      ? 'frappe'
      : ['couronne','maxitrone','frappe'][Math.floor(Math.random() * 3)];

    prepareModeAnnouncement(selectedMatchMode);

    secondsLeft = 10;
    document.getElementById('mm-status').textContent = 'Recherche de joueurs…';
    document.getElementById('mm-timer').textContent = secondsLeft;
    showScreen('screen-matchmaking');

    clearInterval(interval);
    interval = setInterval(()=>{
      secondsLeft--;
      document.getElementById('mm-timer').textContent = Math.max(0, secondsLeft);

      if (secondsLeft <= 0){
        clearInterval(interval);
        document.getElementById('mm-status').textContent = 'Complétion avec des robots…';

        setTimeout(()=>{
          playModeAnnouncement(selectedMatchMode, ranked);
        }, 700);
      }
    }, 1000);
  }

  function cancel(){
    clearInterval(interval);
    cancelModeAnnouncementPreparation();
    selectedMatchMode = null;
    showScreen('screen-lobby');
    Lobby.start();
  }

  return { start, cancel };
})();

function startMatchmaking(isRanked){ Matchmaking.start(isRanked); }

/* ---------------------------------------------------------
   VIDÉO D'ANNONCE : préparée au clic sur JOUER / CLASSÉ
   Comme l'AudioContext pour le son d'élimination, la vidéo est
   « débloquée » pendant le geste du joueur et préchargée pendant la
   recherche : elle démarre ensuite toute seule, avec le son.
--------------------------------------------------------- */
let modeAnnouncementStarted = false;

function ensureModeAnnouncementVideo(){
  const screen = document.getElementById('screen-roulette');
  if (!screen) return null;
  let video = document.getElementById('mode-announcement-video');
  if (!video){
    video = document.createElement('video');
    video.id = 'mode-announcement-video';
    video.playsInline = true;
    video.setAttribute('webkit-playsinline', '');
    video.preload = 'auto';
    video.controls = false;
    video.style.cssText = [
      'display:block',
      'width:min(92vw, 910px)',
      'height:auto',
      'max-height:82vh',
      'object-fit:contain',
      'margin:auto',
      'border-radius:20px',
      'box-shadow:0 18px 60px rgba(0,0,0,.55)',
      'background:#000'
    ].join(';');
    screen.appendChild(video);
  }
  return video;
}

function prepareModeAnnouncement(mode){
  const src = MODE_ANNOUNCEMENT_VIDEOS[mode];
  const video = ensureModeAnnouncementVideo();
  if (!src || !video) return;
  modeAnnouncementStarted = false;
  // L'image est lue en muet (toujours autorisé par les navigateurs) ;
  // le son est préchargé dans l'AudioContext, comme le son d'élimination.
  video.muted = true;
  video.src = src;
  video.preload = 'auto';
  AudioEngine.preloadClip(src);
}

function cancelModeAnnouncementPreparation(){
  const video = document.getElementById('mode-announcement-video');
  if (video){ try{ video.pause(); }catch(_){ } }
  AudioEngine.stopClip();
}

/* ---------------------------------------------------------
   ANNONCE DU MODE
   Remplace la roue par la vidéo correspondant au mode déjà choisi.
   À la fin de la vidéo, la partie démarre automatiquement.
--------------------------------------------------------- */
function playModeAnnouncement(mode, ranked = false){
  const videoSrc = MODE_ANNOUNCEMENT_VIDEOS[mode];

  // Sécurité : si le mode ou la vidéo n'existe pas, on lance directement.
  if (!videoSrc){
    Match.start(mode || 'frappe', ranked);
    return;
  }

  showScreen('screen-roulette');

  const screen = document.getElementById('screen-roulette');
  if (!screen){
    Match.start(mode || 'frappe', ranked);
    return;
  }

  // On cache l'ancienne roue : cet écran sert maintenant uniquement
  // à afficher l'annonce vidéo du mode sélectionné.
  Array.from(screen.children).forEach(child => {
    child.style.display = 'none';
  });

  modeAnnouncementStarted = true;
  const video = ensureModeAnnouncementVideo();
  video.style.display = 'block'; // la boucle ci-dessus cache les enfants de l'écran

  let finished = false;
  let safetyTimer = null;

  const finish = ()=>{
    if (finished) return;
    finished = true;
    if (safetyTimer) clearTimeout(safetyTimer);
    video.pause();
    video.onended = null;
    video.onerror = null;
    video.onplaying = null;
    AudioEngine.stopClip();
    selectedMatchMode = null;
    Match.start(mode, ranked);
  };

  if (!video.src || !video.src.endsWith(videoSrc)) video.src = videoSrc;  // déjà chargée pendant la recherche
  video.currentTime = 0;
  video.muted = true;          // l'image démarre toujours toute seule
  video.volume = 1;
  video.onended = finish;
  video.onerror = finish;

  // Le son est joué par l'AudioContext (comme le son d'élimination), calé sur l'image.
  let audioStarted = false;
  video.onplaying = ()=>{
    if (audioStarted || finished) return;
    audioStarted = true;
    AudioEngine.playClip(videoSrc, video.currentTime).then(ok=>{
      if (ok || finished) return;
      // Son non décodable : dernier recours, on tente le son natif de la vidéo sans afficher de bouton.
      try{ video.muted = false; if (video.paused) video.play().catch(()=>{ video.muted = true; video.play().catch(()=>{}); }); }catch(_){ }
    });
  };

  const playPromise = video.play();
  if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(()=>{});

  // Les vidéos fournies durent environ 5,9 s. Ce filet de sécurité
  // évite qu'une erreur de lecture bloque la partie indéfiniment.
  safetyTimer = setTimeout(finish, 10000);
}

/* ---------------------------------------------------------
   PARTIE — carte 3D, personnage 3e personne, combat, robots
--------------------------------------------------------- */
const FRAPPE_DURATION = 4*60; // secondes (mode Frappe Dolling)
const COURONNE_DURATION = 2*60; // secondes (mode Couronne Hunter)
const MAXITRONE_DURATION = 4*60; // secondes (mode Maxitrone)
const MAXITRONE_SETUP_DURATION = 60; // première minute sans combat
const MAXITRONE_THRONE_HP = 1200;
let MATCH_DURATION = FRAPPE_DURATION; // ajusté selon le mode choisi au lancement de la partie
const ARENA_RADIUS = 15; // carte de 30x30 unités (diamètre = 30)
const MAX_HP = 750;
const DAMAGE = 80; // dégâts normaux : valeur conservée, aucun nerf du coup
const CROWN_MAX_HP = 10000;
const CROWN_DAMAGE = 500;
const CROWN_HOLD_SECONDS = 10;
const CROWN_ATTACK_RANGE = 2.2;
const RESPAWN_DELAY = 15;
const ATTACK_RANGE = 1.6;
const ATTACK_COOLDOWN = 0.6;
const TOTAL_SLOTS = 12;
const BASE_SPEED = 4;
const MAX_TURN_RATE = Math.PI * 2.6;

function stepTowardAngle(current, target, maxStep){
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI*2;
  while (diff < -Math.PI) diff += Math.PI*2;
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}
const EQUIPMENT_COOLDOWN = 20; // chaque équipement revient après 20 secondes

// ---- nouveaux équipements ----
const COW_GRAZE_SECONDS = 9;       // la vache broute 9 s avant de charger
const COW_DAMAGE = 10000;
const COW_SPEED = 9;
const COW_CHARGE_TIMEOUT = 20;     // sécurité : la vache disparaît si elle n'atteint personne
const BOLT_DAMAGE = 350;           // dégâts de l'éclair (non précisés : à ajuster ici)
const MORTAR_HP = 1321;
const MORTAR_DAMAGE = 456;
const MORTAR_FIRE_INTERVAL = 5;    // secondes entre deux tirs
const MORTAR_FLIGHT_TIME = 5;      // secondes avant que le rocher atterrisse
const BOT_EQUIPMENT_COOLDOWN = 25; // recharge des équipements des robots
const ALL_EQUIPMENT = ['ice', 'fog', 'heal', 'cow', 'bolt', 'mortar', 'dancing'];
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
  let currentGameMode = 'frappe'; // 'frappe' | 'couronne' | 'maxitrone'
  let currentRanked = false; // partie classée (ligue selon les éliminations)
  let crown = null; // {mesh, pedestal, hp, state:'vault'|'held', holder, holdStartedAt}
  let maxitroneCombatStarted = false;
  let maxitroneUiReady = false;
  let fogUntil = 0;
  let equipmentUsed = new Set();
  let equipmentCooldownUntil = new Map();
  let equipmentCooldownTimer = null;
  let fogVisual = null;
  let iceVisuals = [];
  let effects = [];

  // ---- nouveaux équipements (vache, éclair, mortier) + décor animé ----
  let cows = [], mortars = [], rocks = [], bolts = [];
  let playerBlindUntil = 0;
  let fxFlash = null, fxBlind = null, fxWarning = null, warningTimer = null;
  let ambientFlames = [], runeRings = [];

  // ---- mode adrénaline ----
  let hemiLight, sunLight;
  let speedMultiplier = 1;
  let adrenalineActive = false;
  let adrenalineTimeout = null;
  let adrenalineEndTimeout = null;
  let originalHemiIntensity = 1, originalSunIntensity = 1;
  let originalFog = null, originalBackgroundHex = 0x0d1a14;
  let lastMinuteTriggered = false;

  // ---- équipement Dancing ----
  let dancingUntil = 0;
  let dancingTarget = null;
  let dancingRing = null;
  let dancingInterval = null;
  let dancingTimeout = null;
  let dancingOriginalBackground = null;

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

  function ensureMaxitroneUI(){
    if (maxitroneUiReady) return;
    maxitroneUiReady = true;
    const matchScreen = document.getElementById('screen-match');
    if (!matchScreen) return;

    const counter = document.createElement('div');
    counter.id = 'maxitrone-counter';
    counter.style.cssText = 'position:absolute;right:14px;top:78px;z-index:30;background:rgba(7,12,18,.86);border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:8px 12px;color:#fff;font-weight:900;text-align:center;display:none;min-width:118px;box-shadow:0 8px 24px rgba(0,0,0,.28);';
    counter.innerHTML = '<div style="font-size:11px;opacity:.72;text-transform:uppercase;letter-spacing:.08em;">Joueurs restants</div><div id="maxitrone-counter-value" style="font-size:24px;line-height:1.05;margin-top:2px;">12 / 12</div>';
    matchScreen.appendChild(counter);

    const button = document.createElement('button');
    button.id = 'btn-maxitrone-throne';
    button.type = 'button';
    button.textContent = '♜ Poser mon trône';
    button.style.cssText = 'position:absolute;right:14px;bottom:118px;z-index:31;display:none;border:0;border-radius:14px;padding:12px 15px;background:linear-gradient(135deg,#ffc83d,#ff8a3d);color:#16120a;font-weight:900;box-shadow:0 8px 22px rgba(0,0,0,.3);';
    matchScreen.appendChild(button);
    button.addEventListener('click', ()=>placeMaxitroneThrone(getPlayer(), true));
  }

  function maxitroneIsCombatPhase(){
    return currentGameMode === 'maxitrone' && maxitroneCombatStarted;
  }

  function updateMaxitroneCounter(){
    const el = document.getElementById('maxitrone-counter-value');
    if (!el || currentGameMode !== 'maxitrone') return;
    const remaining = fighters.filter(f=>!f.permanentlyEliminated).length;
    el.textContent = `${remaining} / ${fighters.length}`;
  }

  function makeMaxitroneThrone(owner){
    const group = new THREE.Group();
    const color = owner.isPlayer ? '#ffc83d' : (owner.mesh?.children?.[0]?.material?.color?.getStyle?.() || '#7c8cff');
    const mat = new THREE.MeshStandardMaterial({color, metalness:.35, roughness:.35});
    const dark = new THREE.MeshStandardMaterial({color:'#241b0b', metalness:.25, roughness:.5});
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.0,.25,.9), mat); seat.position.y=.7; group.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.0,1.5,.22), mat); back.position.set(0,1.35,-.34); group.add(back);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(.18,.55,1.0), dark); armL.position.set(-.55,.95,0); group.add(armL);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(.18,.55,1.0), dark); armR.position.set(.55,.95,0); group.add(armR);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.62,.75,.22,8), dark); base.position.y=.12; group.add(base);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(.24,.42,5), new THREE.MeshStandardMaterial({color:'#ffe27a',emissive:'#7a4d00',emissiveIntensity:.25})); crown.position.set(0,2.12,-.34); group.add(crown);
    group.userData.ownerName = owner.name;
    return group;
  }

  function placeMaxitroneThrone(owner, manual=false){
    if (!owner || owner.throne || currentGameMode !== 'maxitrone' || maxitroneCombatStarted) return false;
    const pos = manual ? {x:owner.pos.x,z:owner.pos.z} : randomSpawnPos();
    const mesh = makeMaxitroneThrone(owner);
    mesh.position.set(pos.x,0,pos.z);
    scene.add(mesh);
    owner.throne = {mesh, hp:MAXITRONE_THRONE_HP, destroyed:false, placed:true};
    if (manual){
      const button=document.getElementById('btn-maxitrone-throne');
      if(button){button.disabled=true;button.textContent='♜ Trône posé';button.style.opacity='.6';}
      setMatchStatus('Ton trône est posé. Protège-le !', 3500);
    }
    return true;
  }

  function notifyMaxitroneThroneDestroyed(owner){
    const message = owner.isPlayer ? '⚠️ TON TRÔNE A ÉTÉ DÉTRUIT ! Tu ne reviendras plus après ta prochaine élimination.' : `♜ Le trône de ${owner.name} a été détruit !`;
    setMatchStatus(message, 5000);
    const feed=document.getElementById('elim-feed');
    if(feed){
      const item=document.createElement('div'); item.className='elim-item'; item.innerHTML=`<b>♜ Trône détruit</b> — ${escapeHtml(owner.name)}`; feed.appendChild(item); setTimeout(()=>item.remove(),5000);
    }
    if (owner.isPlayer){
      try{ if(navigator.vibrate) navigator.vibrate([140,80,220,80,320]); }catch(_){}
      try{ if('Notification' in window && Notification.permission === 'granted') new Notification('TRUGO — Maxitrone', {body:'Ton trône a été détruit !'}); }catch(_){}
    }
  }

  function damageMaxitroneThrone(attacker, owner, dmg){
    const throne=owner?.throne;
    if(!throne || throne.destroyed || !maxitroneIsCombatPhase()) return false;
    throne.hp=Math.max(0, throne.hp-dmg);
    addEffect(throne.mesh.position,'#ffc83d',450);
    if(throne.hp<=0){
      throne.destroyed=true;
      scene.remove(throne.mesh);
      throne.mesh.traverse(obj=>{if(obj.geometry)obj.geometry.dispose();if(obj.material){if(Array.isArray(obj.material))obj.material.forEach(m=>m.dispose());else obj.material.dispose();}});
      notifyMaxitroneThroneDestroyed(owner);
    }
    return true;
  }

  function leaveMaxitroneAfterPermanentElimination(){
    running=false;
    clearInterval(matchTimerInterval);
    clearTimeout(adrenalineTimeout);
    clearTimeout(adrenalineEndTimeout);
    hideRespawnOverlay();
    AudioEngine.stopCombatMusic();
    setMatchStatus('Éliminé définitivement — retour au lobby',2500);
    setTimeout(()=>{showScreen('screen-lobby');Lobby.start();},900);
  }

  function updateModeHud(){
    const crownHud = document.getElementById('crown-hud');
    const hpWrap = document.getElementById('crown-hp-wrap');
    const holdWrap = document.getElementById('crown-hold-wrap');
    const yourRank = document.getElementById('leaderboard-yourank');
    const maxCounter = document.getElementById('maxitrone-counter');
    const throneButton = document.getElementById('btn-maxitrone-throne');
    if (currentGameMode === 'couronne'){
      if (crownHud) crownHud.style.display = 'block';
      if (hpWrap) hpWrap.style.display = 'block';
      if (holdWrap) holdWrap.style.display = 'none';
      if (yourRank) yourRank.style.display = 'none';
      if (maxCounter) maxCounter.style.display = 'none';
      if (throneButton) throneButton.style.display = 'none';
    } else if (currentGameMode === 'maxitrone'){
      if (crownHud) crownHud.style.display = 'none';
      if (yourRank) yourRank.style.display = 'none';
      if (maxCounter) maxCounter.style.display = 'block';
      if (throneButton) throneButton.style.display = maxitroneCombatStarted ? 'none' : 'block';
      updateMaxitroneCounter();
    } else {
      if (crownHud) crownHud.style.display = 'none';
      if (yourRank) yourRank.style.display = 'flex';
      if (maxCounter) maxCounter.style.display = 'none';
      if (throneButton) throneButton.style.display = 'none';
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
      if (old.throne?.mesh){
        try{ scene.remove(old.throne.mesh); old.throne.mesh.traverse(obj=>{ if(obj.geometry)obj.geometry.dispose(); if(obj.material){ if(Array.isArray(obj.material))obj.material.forEach(m=>m.dispose()); else obj.material.dispose(); } }); }catch(_){}
      }
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
      attackCooldown:0, respawnAt:0, throne:null, permanentlyEliminated:false
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
        attackCooldown: Math.random()*ATTACK_COOLDOWN, respawnAt:0, throne:null, permanentlyEliminated:false,
        wanderAngle: Math.random()*Math.PI*2, wanderTimer: Math.random()*3
      });
      updateHealthBar(fighters[fighters.length - 1]);
    }
    if (currentGameMode === 'maxitrone'){
      for (const bot of fighters){
        if (bot.isBot) placeMaxitroneThrone(bot, false);
      }
      updateMaxitroneCounter();
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
    if (!zone || !knob) return;
    // Joystick légèrement descendu pour libérer davantage la zone d'action.
    zone.style.setProperty('bottom', '18px', 'important');
    const maxDist = 40;

    function handleMove(clientX, clientY){
      const rect = zone.getBoundingClientRect();
      const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
      let dx = clientX - cx, dy = clientY - cy;
      const d = Math.hypot(dx,dy);
      if (d > maxDist){ dx = dx/d*maxDist; dy = dy/d*maxDist; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const sensitivity = 0.65;
      joystickVec.x = (dx / maxDist) * sensitivity;
      joystickVec.y = (dy / maxDist) * sensitivity;
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

  function clearEquipmentVisuals(){
    if (fogVisual){
      try{ scene.remove(fogVisual); fogVisual.geometry.dispose(); fogVisual.material.dispose(); }catch(_){ }
      fogVisual = null;
    }
    iceVisuals.forEach(v=>{ try{ scene.remove(v); v.geometry.dispose(); v.material.dispose(); }catch(_){ } });
    iceVisuals = [];
    cows.forEach(c=>disposeObject(c.mesh)); cows = [];
    mortars.forEach(m=>disposeObject(m.mesh)); mortars = [];
    rocks.forEach(r=>{ disposeObject(r.rock); disposeObject(r.marker); }); rocks = [];
    bolts.forEach(b=>disposeObject(b.group)); bolts = [];
    cancelDancing();
    playerBlindUntil = 0;
    hideEquipmentFx();
  }

  function startEquipmentCooldown(type){
    const until = performance.now() + EQUIPMENT_COOLDOWN * 1000;
    equipmentCooldownUntil.set(type, until);
    equipmentUsed.add(type);
    const button = document.getElementById(`ability-${type}`);
    if (button) button.classList.add('used');
    setMatchStatus(`${EQUIPMENT_NAMES[type] || type} revient dans ${EQUIPMENT_COOLDOWN}s`, 2200);
  }

  function updateEquipmentCooldowns(){
    const now = performance.now();
    for (const [type, until] of equipmentCooldownUntil){
      const button = document.getElementById(`ability-${type}`);
      const left = Math.ceil((until-now)/1000);
      if (left <= 0){
        equipmentCooldownUntil.delete(type);
        equipmentUsed.delete(type);
        if (button){ button.classList.remove('used'); button.removeAttribute('data-cooldown'); }
      } else if (button){
        button.setAttribute('data-cooldown', `${left}s`);
      }
    }
  }

  function createFogVisual(player){
    if (fogVisual) return;
    const geo = new THREE.SphereGeometry(3.8, 24, 16);
    const mat = new THREE.MeshBasicMaterial({ color:'#b8c9d4', transparent:true, opacity:0.14, depthWrite:false, side:THREE.DoubleSide });
    fogVisual = new THREE.Mesh(geo, mat);
    fogVisual.position.set(player.pos.x, 1.5, player.pos.z);
    scene.add(fogVisual);
  }

  function createIceVisual(target){
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color:'#8ed8ff', emissive:'#3c9ed0', emissiveIntensity:0.35, transparent:true, opacity:0.82, roughness:0.2, metalness:0.05 });
    for(let i=0;i<7;i++){
      const h = 0.7 + Math.random()*0.7;
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.14, h, 6), mat.clone());
      const a = (Math.PI*2/7)*i;
      mesh.position.set(Math.cos(a)*0.65, h/2, Math.sin(a)*0.65);
      mesh.rotation.z = (Math.random()-0.5)*0.35;
      group.add(mesh);
    }
    group.position.set(target.pos.x, 0, target.pos.z);
    scene.add(group);
    iceVisuals.push(group);
    setTimeout(()=>{
      const idx=iceVisuals.indexOf(group); if(idx>=0) iceVisuals.splice(idx,1);
      try{ scene.remove(group); group.traverse(o=>{ if(o.geometry)o.geometry.dispose(); if(o.material)o.material.dispose(); }); }catch(_){ }
    },3000);
  }

  /* ====================================================================
     NOUVEAUX ÉQUIPEMENTS : vache enragée, éclair, mortier de lion
     (utilisables par le joueur ET par les robots)
  ==================================================================== */
  function disposeObject(obj){
    if (!obj) return;
    try{ scene.remove(obj); }catch(_){ }
    obj.traverse(o=>{
      if (o.geometry) o.geometry.dispose();
      if (o.material){
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m=>{ if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
  }

  function equipTargets(owner){
    return fighters.filter(f=>f !== owner && f.alive && !f.permanentlyEliminated);
  }
  function equipAttacksBlocked(){
    return currentGameMode === 'maxitrone' && !maxitroneCombatStarted;
  }
  function nearestTarget(owner){
    let best = null, bd = Infinity;
    for (const f of equipTargets(owner)){
      const d = dist2(owner.pos.x, owner.pos.z, f.pos.x, f.pos.z);
      if (d < bd){ bd = d; best = f; }
    }
    return best ? { fighter: best, dist: Math.sqrt(bd) } : null;
  }

  // ---- calques d'écran : éclair blanc, brouillard, alerte ----
  function ensureEquipmentFx(){
    const screen = document.getElementById('screen-match');
    if (!screen) return;
    if (!fxFlash){ fxFlash = document.createElement('div'); fxFlash.className = 'eq-flash'; screen.appendChild(fxFlash); }
    if (!fxBlind){ fxBlind = document.createElement('div'); fxBlind.className = 'eq-blind'; screen.appendChild(fxBlind); }
    if (!fxWarning){ fxWarning = document.createElement('div'); fxWarning.className = 'eq-warning'; screen.appendChild(fxWarning); }
  }
  function flashScreen(intensity){
    ensureEquipmentFx();
    if (!fxFlash) return;
    fxFlash.style.setProperty('--eq-flash', String(intensity));
    fxFlash.classList.remove('show');
    void fxFlash.offsetWidth;
    fxFlash.classList.add('show');
  }
  function showWarning(text, ms){
    ensureEquipmentFx();
    if (!fxWarning) return;
    fxWarning.textContent = text;
    fxWarning.classList.add('show');
    clearTimeout(warningTimer);
    warningTimer = setTimeout(()=>{ if (fxWarning) fxWarning.classList.remove('show'); }, ms);
  }
  function hideEquipmentFx(){
    clearTimeout(warningTimer);
    if (fxFlash) fxFlash.classList.remove('show');
    if (fxBlind) fxBlind.classList.remove('show');
    if (fxWarning) fxWarning.classList.remove('show');
  }

  // ---- petite étiquette 3D (compte à rebours de la vache) ----
  function makeLabelSprite(){
    const canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 56;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map:texture, transparent:true, depthTest:false }));
    sprite.scale.set(1.5, 0.52, 1);
    sprite.userData = { canvas, ctx, texture, key:'' };
    return sprite;
  }
  function setLabel(sprite, text, color){
    const u = sprite.userData;
    const key = text + '|' + color;
    if (u.key === key) return;
    u.key = key;
    u.ctx.clearRect(0, 0, u.canvas.width, u.canvas.height);
    u.ctx.fillStyle = 'rgba(8,12,18,.8)';
    u.ctx.fillRect(4, 4, u.canvas.width-8, u.canvas.height-8);
    u.ctx.strokeStyle = color; u.ctx.lineWidth = 3;
    u.ctx.strokeRect(4, 4, u.canvas.width-8, u.canvas.height-8);
    u.ctx.font = '700 30px Rajdhani, sans-serif';
    u.ctx.textAlign = 'center'; u.ctx.textBaseline = 'middle';
    u.ctx.fillStyle = color;
    u.ctx.fillText(text, u.canvas.width/2, u.canvas.height/2 + 2);
    u.texture.needsUpdate = true;
  }

  function drawBar(sprite, ratio, color){
    const u = sprite.userData;
    u.context.clearRect(0, 0, u.canvas.width, u.canvas.height);
    u.context.fillStyle = 'rgba(5,9,14,.85)';
    u.context.fillRect(0, 0, u.canvas.width, u.canvas.height);
    u.context.fillStyle = color;
    u.context.fillRect(3, 3, (u.canvas.width-6)*Math.max(0, Math.min(1, ratio)), u.canvas.height-6);
    u.texture.needsUpdate = true;
  }

  /* ---------------------------- VACHE ENRAGÉE ---------------------------- */
  function buildCowMesh(){
    const g = new THREE.Group();
    const std = (c, r)=>new THREE.MeshStandardMaterial({ color:c, roughness:(r === undefined ? 0.85 : r), metalness:0 });
    const white = std('#f5f2ea'), black = std('#1c1a19'), pink = std('#eaa4ab', 0.7), hornMat = std('#efe2bd', 0.5);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 1.6), white);
    body.position.y = 1.05; g.add(body);
    [[-0.46, 1.15, 0.25, 0.05, 0.5, 0.55], [0.46, 1.0, -0.3, 0.05, 0.5, 0.6], [0, 1.46, -0.1, 0.55, 0.05, 0.6], [-0.46, 0.85, -0.45, 0.05, 0.35, 0.4]].forEach(s=>{
      const spot = new THREE.Mesh(new THREE.BoxGeometry(s[3], s[4], s[5]), black);
      spot.position.set(s[0], s[1], s[2]); g.add(spot);
    });
    const udder = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), pink);
    udder.position.set(0, 0.6, -0.35); udder.scale.set(1, 0.7, 1); g.add(udder);

    const legs = [];
    [[-0.3, 0.55], [0.3, 0.55], [-0.3, -0.55], [0.3, -0.55]].forEach(p=>{
      const pivot = new THREE.Group(); pivot.position.set(p[0], 0.68, p[1]);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.68, 0.2), white); leg.position.y = -0.34; pivot.add(leg);
      const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.24), black); hoof.position.y = -0.68; pivot.add(hoof);
      g.add(pivot); legs.push(pivot);
    });

    const head = new THREE.Group(); head.position.set(0, 1.3, 0.85);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.5, 0.5), white); skull.position.set(0, 0, 0.12); head.add(skull);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.24, 0.22), pink); snout.position.set(0, -0.12, 0.4); head.add(snout);
    [-1, 1].forEach(s=>{
      const nostril = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.04), black); nostril.position.set(s*0.1, -0.1, 0.52); head.add(nostril);
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 6), hornMat); horn.position.set(s*0.22, 0.34, 0.1); horn.rotation.z = -s*0.5; head.add(horn);
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.12), white); ear.position.set(s*0.36, 0.18, 0.05); ear.rotation.z = s*0.3; head.add(ear);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.045, 0.06), black); brow.position.set(s*0.18, 0.2, 0.38); brow.rotation.z = -s*0.45; head.add(brow);
    });
    const eyeMat = new THREE.MeshStandardMaterial({ color:'#ff2a2a', emissive:'#ff0000', emissiveIntensity:1.2, roughness:0.4 });
    [-1, 1].forEach(s=>{
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat);
      eye.position.set(s*0.2, 0.08, 0.37); head.add(eye);
    });
    g.add(head);

    const tail = new THREE.Group(); tail.position.set(0, 1.35, -0.8);
    const tailMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), black); tailMesh.position.y = -0.3; tail.add(tailMesh);
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), black); tuft.position.y = -0.62; tail.add(tuft);
    g.add(tail);

    g.scale.setScalar(1.15);
    return { group:g, head, legs, tail, eyeMat };
  }

  function spawnCow(owner){
    const parts = buildCowMesh();
    let x = owner.pos.x + Math.sin(owner.rotY)*2.4, z = owner.pos.z + Math.cos(owner.rotY)*2.4;
    const r = Math.hypot(x, z);
    if (r > ARENA_RADIUS-1){ x *= (ARENA_RADIUS-1)/r; z *= (ARENA_RADIUS-1)/r; }
    const rot = Math.random()*Math.PI*2;
    parts.group.position.set(x, 0, z);
    parts.group.rotation.y = rot;
    const label = makeLabelSprite();
    label.position.y = 2.9;
    parts.group.add(label);
    scene.add(parts.group);
    addEffect({ x, z }, '#f5f2ea', 800);
    addEffect({ x, z }, '#ffb648', 1000);
    cows.push({
      owner, mesh:parts.group, head:parts.head, legs:parts.legs, tail:parts.tail, eyeMat:parts.eyeMat, label,
      x, z, rot, born:performance.now(), state:'graze', target:null, chargeStart:0, dustAt:0, hitCooldown:0, dead:false
    });
  }

  function removeCow(c){
    c.dead = true;
    addEffect({ x:c.x, z:c.z }, '#f5f2ea', 700);
    disposeObject(c.mesh);
  }
  function pickCowTarget(c){
    const list = equipTargets(c.owner);
    return list.length ? list[Math.floor(Math.random()*list.length)] : null;
  }
  function announceCowTarget(c){
    if (!c.target) return;
    if (c.target.isPlayer) showWarning('🐄 LA VACHE FONCE SUR TOI !', 3500);
    else if (c.owner.isPlayer) setMatchStatus(`🐄 La vache fonce sur ${c.target.name} !`, 2200);
    else setMatchStatus(`🐄 La vache de ${c.owner.name} charge ${c.target.name} !`, 2200);
  }

  function updateCows(dt, now){
    for (const c of cows){
      if (c.dead) continue;
      if (c.state === 'graze'){
        const left = COW_GRAZE_SECONDS - (now - c.born)/1000;
        c.head.rotation.x = 0.75 + Math.sin(now*0.007)*0.12;   // tête baissée : elle broute
        c.head.position.y = 1.05 + Math.sin(now*0.007)*0.02;
        c.tail.rotation.z = Math.sin(now*0.008)*0.5;
        if (left < 2){                                         // elle s'énerve : patte qui gratte, yeux rouges
          c.legs[0].rotation.x = Math.sin(now*0.03)*0.6;
          c.eyeMat.emissiveIntensity = 2.2;
        }
        setLabel(c.label, '🐄 ' + Math.ceil(Math.max(left, 0)), left < 3 ? '#ff6b6b' : '#f5f2ea');
        if (left <= 0){
          c.target = pickCowTarget(c);
          if (!c.target){ removeCow(c); continue; }
          c.state = 'charge';
          c.chargeStart = now;
          c.label.visible = false;
          c.head.rotation.x = 0.25; c.head.position.y = 1.3;
          announceCowTarget(c);
        }
      } else {
        if (!c.target || !c.target.alive || c.target.permanentlyEliminated){
          c.target = pickCowTarget(c);
          if (!c.target){ removeCow(c); continue; }
          announceCowTarget(c);
        }
        if ((now - c.chargeStart)/1000 > COW_CHARGE_TIMEOUT){ removeCow(c); continue; }
        const dx = c.target.pos.x - c.x, dz = c.target.pos.z - c.z;
        const d = Math.hypot(dx, dz) || 1;
        const step = Math.min(d, COW_SPEED*dt);
        c.x += dx/d*step; c.z += dz/d*step;
        c.rot = stepTowardAngle(c.rot, Math.atan2(dx, dz), Math.PI*5*dt);
        const ph = now*0.02;
        c.legs[0].rotation.x = Math.sin(ph)*0.9;  c.legs[3].rotation.x = Math.sin(ph)*0.9;
        c.legs[1].rotation.x = -Math.sin(ph)*0.9; c.legs[2].rotation.x = -Math.sin(ph)*0.9;
        c.head.rotation.x = 0.3 + Math.sin(ph*0.5)*0.08;
        c.mesh.position.y = Math.abs(Math.sin(ph))*0.12;
        if (now > c.dustAt){ addEffect({ x:c.x, z:c.z }, '#d9b98a', 450); c.dustAt = now + 140; }
        if (d < 1.0 && now >= c.hitCooldown){
          const victim = c.target;
          c.hitCooldown = now + 500;
          addEffect(victim.pos, '#ff3b3b', 700);
          addEffect(victim.pos, '#ffffff', 500);
          if (victim.isPlayer) flashScreen(0.45);
          applyDamage(c.owner, victim, COW_DAMAGE);
          if (!victim.alive){ removeCow(c); continue; }   // elle disparaît après son élimination
        }
      }
      c.mesh.position.x = c.x; c.mesh.position.z = c.z; c.mesh.rotation.y = c.rot;
    }
    cows = cows.filter(c=>!c.dead);
  }

  /* -------------------------------- ÉCLAIR -------------------------------- */
  function boltSegment(a, b, radius, material){
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 5), material);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return m;
  }

  // frappe le combattant le plus proche ; renvoie la victime (ou null)
  function strikeBolt(owner){
    const near = nearestTarget(owner);
    if (!near) return null;
    const target = near.fighter;
    const tx = target.pos.x, tz = target.pos.z;
    const now = performance.now();

    const group = new THREE.Group();
    const coreMat = new THREE.MeshBasicMaterial({ color:'#ffffff' });
    const glowMat = new THREE.MeshBasicMaterial({ color:'#7fc4ff', transparent:true, opacity:0.55, depthWrite:false });
    const pts = [];
    const segs = 9;
    for (let i=0;i<=segs;i++){
      const jitter = i === segs ? 0 : (Math.random()-0.5)*1.8;
      pts.push(new THREE.Vector3(tx + jitter, 16*(1 - i/segs), tz + (i === segs ? 0 : (Math.random()-0.5)*1.8)));
    }
    for (let i=0;i<segs;i++){
      group.add(boltSegment(pts[i], pts[i+1], 0.06, coreMat));
      group.add(boltSegment(pts[i], pts[i+1], 0.2, glowMat));
    }
    for (let b=0;b<2;b++){
      const k = 2 + Math.floor(Math.random()*4);
      const p0 = pts[k];
      const p1 = new THREE.Vector3(p0.x + (Math.random()-0.5)*3.5, p0.y - 2.2, p0.z + (Math.random()-0.5)*3.5);
      const p2 = new THREE.Vector3(p1.x + (Math.random()-0.5)*2.5, p1.y - 2.2, p1.z + (Math.random()-0.5)*2.5);
      group.add(boltSegment(p0, p1, 0.04, coreMat));
      group.add(boltSegment(p1, p2, 0.035, coreMat));
    }
    const flashMat = new THREE.MeshBasicMaterial({ color:'#bfe3ff', transparent:true, opacity:0.85, depthWrite:false, blending:THREE.AdditiveBlending });
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10), flashMat);
    flash.position.set(tx, 0.5, tz);
    group.add(flash);
    const scorchMat = new THREE.MeshBasicMaterial({ color:0x000000, transparent:true, opacity:0.55, depthWrite:false });
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(0.95, 20), scorchMat);
    scorch.rotation.x = -Math.PI/2; scorch.position.set(tx, 0.03, tz);
    group.add(scorch);
    scene.add(group);
    bolts.push({ group, bolt:null, flash, flashMat, scorchMat, born:now });

    addEffect(target.pos, '#8fd3ff', 700);
    addEffect(target.pos, '#ffffff', 500);
    const player = getPlayer();
    const nearPlayer = player && Math.hypot(player.pos.x - tx, player.pos.z - tz) < 8;
    if (target.isPlayer) flashScreen(0.6); else if (nearPlayer) flashScreen(0.22);
    if (!owner.isPlayer && target.isPlayer) setMatchStatus(`⚡ ${owner.name} t'a foudroyé !`, 2200);
    applyDamage(owner, target, BOLT_DAMAGE);
    return target;
  }

  function updateBolts(dt, now){
    for (const b of bolts){
      const t = (now - b.born)/1000;
      b.group.children.forEach(ch=>{
        if (ch === b.flash || ch.geometry.type === 'CircleGeometry') return;
        ch.visible = t < 0.34 && (t < 0.1 || Math.floor(t*40)%2 === 0);   // scintillement
      });
      b.flash.scale.setScalar(1 + t*5);
      b.flashMat.opacity = Math.max(0, 0.85 - t*2);
      b.scorchMat.opacity = Math.max(0, 0.55 - t*0.22);
      if (t > 2.5){ b.done = true; disposeObject(b.group); }
    }
    bolts = bolts.filter(b=>!b.done);
  }

  /* ---------------------------- MORTIER DE LION ---------------------------- */
  function buildMortarMesh(){
    const g = new THREE.Group();
    const std = (c, r, m, extra)=>new THREE.MeshStandardMaterial(Object.assign({ color:c, roughness:r, metalness:m }, extra || {}));
    const stone = std('#6d665a', 0.9, 0.05), iron = std('#2b2f36', 0.5, 0.7);
    const gold = std('#e0a93a', 0.35, 0.85, { emissive:'#6b4300', emissiveIntensity:0.35 });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.1, 0.3, 12), stone); base.position.y = 0.15; g.add(base);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.12, 12), iron); plate.position.y = 0.36; g.add(plate);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.05, 6, 20), gold); ring.rotation.x = Math.PI/2; ring.position.y = 0.43; g.add(ring);

    const pivot = new THREE.Group(); pivot.position.set(0, 0.62, 0);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.35, 14), iron);
    barrel.rotation.x = 0.95; barrel.position.set(0, 0.39, 0.55); pivot.add(barrel);
    [-0.3, 0.3].forEach(y=>{
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.39 - y*0.1, 0.05, 6, 16), gold);
      band.rotation.x = Math.PI/2; band.position.y = y; barrel.add(band);
    });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.06, 6, 16), gold);
    rim.rotation.x = Math.PI/2; rim.position.y = 0.675; barrel.add(rim);

    // tête de lion dorée sous la gueule du canon
    const mane = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.1, 8, 18), std('#c9822b', 0.6, 0.4)); mane.position.set(0, 0.18, 0.95); pivot.add(mane);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 10), std('#e8b64a', 0.5, 0.5)); face.scale.set(1, 1, 0.8); face.position.set(0, 0.18, 0.95); pivot.add(face);
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), std('#f3d58a', 0.5, 0.3)); snout.position.set(0, 0.1, 1.2); pivot.add(snout);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), std('#2a1a10', 0.6, 0)); nose.position.set(0, 0.15, 1.31); pivot.add(nose);
    [-1, 1].forEach(s=>{
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), std('#1a1008', 0.4, 0)); eye.position.set(s*0.1, 0.26, 1.14); pivot.add(eye);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), std('#e8b64a', 0.5, 0.5)); ear.position.set(s*0.22, 0.42, 0.9); pivot.add(ear);
    });

    // flash de tir à la bouche du canon
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshBasicMaterial({ color:'#ffb347', transparent:true, opacity:0.9, depthWrite:false, blending:THREE.AdditiveBlending }));
    flash.position.set(0, 0.78, 1.09); flash.visible = false; pivot.add(flash);
    g.add(pivot);

    const bar = makeHealthBar();
    bar.scale.set(1.6, 0.24, 1);
    bar.position.y = 2.35;
    g.add(bar);
    return { group:g, pivot, bar, flash };
  }

  function placeMortar(owner){
    const parts = buildMortarMesh();
    let x = owner.pos.x + Math.sin(owner.rotY)*1.7, z = owner.pos.z + Math.cos(owner.rotY)*1.7;
    const r = Math.hypot(x, z);
    if (r > ARENA_RADIUS-1.2){ x *= (ARENA_RADIUS-1.2)/r; z *= (ARENA_RADIUS-1.2)/r; }
    if (obstacles.some(o=>dist2(x, z, o.x, o.z) < (o.radius+0.9)*(o.radius+0.9))){ x = owner.pos.x; z = owner.pos.z; }
    parts.group.position.set(x, 0, z);
    parts.pivot.rotation.y = owner.rotY;
    scene.add(parts.group);
    addEffect({ x, z }, '#ffb648', 900);
    addEffect({ x, z }, '#d9b98a', 700);
    const m = {
      owner, mesh:parts.group, pivot:parts.pivot, bar:parts.bar, flash:parts.flash,
      x, z, hp:MORTAR_HP, maxHp:MORTAR_HP, aim:owner.rotY, recoil:0, flashUntil:0, hitUntil:0,
      nextFire: performance.now() + MORTAR_FIRE_INTERVAL*1000, dead:false
    };
    drawBar(m.bar, 1, '#ffb648');
    mortars.push(m);
    return m;
  }

  function destroyMortar(m, attacker){
    m.dead = true;
    addEffect({ x:m.x, z:m.z }, '#ff9d3d', 800);
    addEffect({ x:m.x, z:m.z }, '#ff3b3b', 600);
    addEffect({ x:m.x, z:m.z }, '#ffffff', 450);
    disposeObject(m.mesh);
    pushElimFeed(attacker.name, 'le mortier de ' + m.owner.name);
    if (attacker.isPlayer) setMatchStatus('🦁 Mortier détruit !', 1800);
    else if (m.owner.isPlayer) setMatchStatus(`🦁 ${attacker.name} a détruit ton mortier !`, 2200);
  }

  function damageMortar(attacker, m, dmg){
    if (m.dead) return;
    m.hp -= dmg;
    drawBar(m.bar, m.hp / m.maxHp, m.hp > m.maxHp*0.4 ? '#ffb648' : '#ff5c68');
    addEffect({ x:m.x, z:m.z }, '#ffb648', 450);
    m.hitUntil = performance.now() + 120;
    if (m.hp <= 0) destroyMortar(m, attacker);
  }

  // un coup d'épée touche les mortiers ennemis devant le combattant
  function hitMortars(attacker){
    for (const m of mortars){
      if (m.dead || m.owner === attacker) continue;
      const dx = m.x - attacker.pos.x, dz = m.z - attacker.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > ATTACK_RANGE + 0.7) continue;
      let diff = Math.abs(Math.atan2(dx, dz) - attacker.rotY);
      diff = Math.min(diff, Math.PI*2 - diff);
      if (diff < 1.3 || d < 1.0) damageMortar(attacker, m, DAMAGE);
    }
  }

  function nearestHostileMortar(f, maxDist){
    let best = null, bd = maxDist*maxDist;
    for (const m of mortars){
      if (m.dead || m.owner === f) continue;
      const d = dist2(f.pos.x, f.pos.z, m.x, m.z);
      if (d < bd){ bd = d; best = m; }
    }
    return best;
  }

  function fireMortar(m, now){
    const list = equipTargets(m.owner);
    if (!list.length) return;
    const target = list[Math.floor(Math.random()*list.length)];
    m.aim = Math.atan2(target.pos.x - m.x, target.pos.z - m.z);
    m.pivot.rotation.y = m.aim;
    m.recoil = 1;
    m.flashUntil = now + 180;
    const start = new THREE.Vector3(m.x + Math.sin(m.aim)*1.09, 1.4, m.z + Math.cos(m.aim)*1.09);

    // rocher
    const rock = new THREE.Group();
    const stoneMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.45, 0),
      new THREE.MeshStandardMaterial({ color:'#4a443c', roughness:0.95, metalness:0, emissive:'#ff5a14', emissiveIntensity:0.55, flatShading:true })
    );
    rock.add(stoneMesh);
    rock.add(new THREE.Mesh(new THREE.SphereGeometry(0.66, 10, 8), new THREE.MeshBasicMaterial({ color:'#ff8a3a', transparent:true, opacity:0.3, depthWrite:false, blending:THREE.AdditiveBlending })));
    rock.position.copy(start);
    scene.add(rock);

    // le joueur visé est « entouré » : anneau, cage translucide et anneau qui se resserre
    const marker = new THREE.Group();
    const inner = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 8, 32), new THREE.MeshBasicMaterial({ color:'#ff3b3b', transparent:true, opacity:0.95, depthWrite:false }));
    inner.rotation.x = Math.PI/2;
    const outer = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.045, 8, 32), new THREE.MeshBasicMaterial({ color:'#ffb648', transparent:true, opacity:0.85, depthWrite:false }));
    outer.rotation.x = Math.PI/2;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.95, 28), new THREE.MeshBasicMaterial({ color:'#ff3b3b', transparent:true, opacity:0.16, depthWrite:false, side:THREE.DoubleSide }));
    disc.rotation.x = -Math.PI/2; disc.position.y = -0.09;
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 2.2, 24, 1, true), new THREE.MeshBasicMaterial({ color:'#ff3b3b', transparent:true, opacity:0.14, depthWrite:false, side:THREE.DoubleSide }));
    cage.position.y = 1.0;
    marker.add(inner, outer, disc, cage);
    marker.position.set(target.pos.x, 0.12, target.pos.z);
    scene.add(marker);

    rocks.push({ mortar:m, target, rock, marker, inner, outer, start, born:now, dur:MORTAR_FLIGHT_TIME*1000, lastX:target.pos.x, lastZ:target.pos.z, done:false });
    addEffect({ x:start.x, z:start.z }, '#ffb347', 500);
    if (target.isPlayer){
      showWarning('⚠ MORTIER SUR TOI !', 4200);
      setMatchStatus(`🦁 Le mortier de ${m.owner.name} te vise : il va atterrir dans ${MORTAR_FLIGHT_TIME} secondes !`, 3500);
    } else if (m.owner.isPlayer){
      setMatchStatus(`🦁 Ton mortier vise ${target.name}`, 2000);
    }
  }

  function updateMortars(dt, now){
    for (const m of mortars){
      if (m.dead) continue;
      if (now >= m.nextFire){ fireMortar(m, now); m.nextFire = now + MORTAR_FIRE_INTERVAL*1000; }
      m.recoil = Math.max(0, m.recoil - dt*3);
      m.pivot.scale.y = 1 - m.recoil*0.08;
      m.flash.visible = now < m.flashUntil;
      m.mesh.scale.setScalar(now < m.hitUntil ? 1.05 : 1);
    }
    mortars = mortars.filter(m=>!m.dead);
  }

  function explodeRock(r){
    const x = r.lastX, z = r.lastZ;
    addEffect({ x, z }, '#ff3b3b', 800);
    addEffect({ x, z }, '#ff9d3d', 650);
    addEffect({ x, z }, '#ffffff', 450);
    const player = getPlayer();
    if (player && Math.hypot(player.pos.x - x, player.pos.z - z) < 6) flashScreen(r.target.isPlayer ? 0.4 : 0.15);
    if (r.target.alive && !r.target.permanentlyEliminated) applyDamage(r.mortar.owner, r.target, MORTAR_DAMAGE);
    r.done = true;
    disposeObject(r.rock);
    disposeObject(r.marker);
  }

  function updateRocks(dt, now){
    for (const r of rocks){
      if (r.done) continue;
      const t = Math.min(1, (now - r.born)/r.dur);
      const alive = r.target.alive && !r.target.permanentlyEliminated;
      if (alive){ r.lastX = r.target.pos.x; r.lastZ = r.target.pos.z; }
      r.marker.visible = alive;
      r.marker.position.set(r.lastX, 0.12, r.lastZ);
      r.outer.scale.setScalar(2.6 - 1.6*t);                 // l'anneau extérieur se resserre jusqu'à l'impact
      r.inner.material.opacity = 0.6 + 0.4*Math.sin(now*0.02);
      r.rock.position.set(
        r.start.x + (r.lastX - r.start.x)*t,
        r.start.y + (0.6 - r.start.y)*t + Math.sin(Math.PI*t)*12,
        r.start.z + (r.lastZ - r.start.z)*t
      );
      r.rock.rotation.x += dt*5;
      r.rock.rotation.z += dt*3;
      if (t >= 1) explodeRock(r);
    }
    rocks = rocks.filter(r=>!r.done);
  }

  function dancingIsLocked(now = performance.now()){
    return dancingUntil > now;
  }

  function chooseDancingTarget(){
    const alive = fighters.filter(f=>f.alive && !f.permanentlyEliminated);
    if (!alive.length) return null;
    return alive[Math.floor(Math.random()*alive.length)];
  }

  function updateDancingRing(){
    if (!dancingRing || !dancingTarget || !dancingTarget.alive) return;
    dancingRing.position.set(dancingTarget.pos.x, 0.08, dancingTarget.pos.z);
  }

  function cancelDancing(){
    clearInterval(dancingInterval); dancingInterval=null;
    clearTimeout(dancingTimeout); dancingTimeout=null;
    dancingUntil = 0;
    dancingTarget = null;
    if (dancingRing){ try{ scene.remove(dancingRing); dancingRing.geometry.dispose(); dancingRing.material.dispose(); }catch(_){ } dancingRing=null; }
    if (dancingOriginalBackground !== null && scene){ scene.background = new THREE.Color(dancingOriginalBackground); dancingOriginalBackground=null; }
    AudioEngine.stopDancingMusic();
  }

  function finishDancing(owner){
    if (dancingUntil === 0) return;
    const target = dancingTarget;
    cancelDancing();
    if (target && target.alive && !target.permanentlyEliminated){
      eliminate(owner, target);
    }
  }

  function startDancing(owner){
    const now = performance.now();
    if (dancingIsLocked(now)) return false;
    const firstTarget = chooseDancingTarget();
    if (!firstTarget) return false;
    dancingUntil = now + 19000;
    dancingTarget = firstTarget;
    dancingOriginalBackground = scene.background ? scene.background.getHex() : 0x0d1a14;
    scene.background = new THREE.Color('#ff69b4');
    dancingRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.75, 0.09, 10, 32),
      new THREE.MeshBasicMaterial({color:'#ffb6e6', transparent:true, opacity:0.95})
    );
    dancingRing.rotation.x = Math.PI / 2;
    scene.add(dancingRing);
    updateDancingRing();
    AudioEngine.playDancingMusic();
    clearInterval(dancingInterval);
    dancingInterval = setInterval(()=>{
      if (!dancingIsLocked()) return;
      const next = chooseDancingTarget();
      if (next) dancingTarget = next;
      updateDancingRing();
    }, 500);
    clearTimeout(dancingTimeout);
    dancingTimeout = setTimeout(()=>finishDancing(owner), 19000);
    setMatchStatus(`💗 Dancing : le rond change de joueur toutes les 0,5 s`, 3000);
    return true;
  }

  /* --------------------- ROBOTS : ils utilisent les équipements --------------------- */
  function botUseEquipment(f){
    if (equipAttacksBlocked()) return;
    const now = performance.now();
    if (!f.botEquip){
      f.botEquip = [...ALL_EQUIPMENT].sort(()=>Math.random()-0.5).slice(0, 3);
      f.botCd = {};
      f.botNextThink = now + 4000 + Math.random()*5000;
    }
    if (now < f.botNextThink) return;
    f.botNextThink = now + 900 + Math.random()*1300;
    const near = nearestTarget(f);
    if (!near) return;
    const order = [...f.botEquip].sort(()=>Math.random()-0.5);
    for (const type of order){
      if ((f.botCd[type] || 0) > now) continue;
      let used = false;
      if (type === 'dancing'){
        if (!dancingIsLocked(now) && Math.random() < 0.25){ used = startDancing(f); }
      } else if (type === 'heal'){
        if (f.hp < MAX_HP*0.4){
          f.hp = MAX_HP; updateHealthBar(f); addEffect(f.pos, '#45d6c4', 900); used = true;
        }
      } else if (type === 'ice'){
        if (near.dist < 4.5 && Math.random() < 0.75){
          near.fighter.frozenUntil = now + 3000;
          createIceVisual(near.fighter);
          addEffect(near.fighter.pos, '#8ed8ff', 1000);
          if (near.fighter.isPlayer) setMatchStatus(`❄ ${f.name} t'a gelé 3 secondes !`, 2500);
          used = true;
        }
      } else if (type === 'fog'){
        const p = getPlayer();
        if (p && p.alive && Math.hypot(p.pos.x - f.pos.x, p.pos.z - f.pos.z) < 7 && Math.random() < 0.4){
          playerBlindUntil = now + 7000;
          setMatchStatus(`◌ ${f.name} t'aveugle avec du brouillard !`, 2500);
          used = true;
        }
      } else if (type === 'cow'){
        if (Math.random() < 0.35){ spawnCow(f); used = true; }
      } else if (type === 'bolt'){
        if (near.dist < 9 && Math.random() < 0.5){ strikeBolt(f); used = true; }
      } else if (type === 'mortar'){
        if (!mortars.some(m=>!m.dead && m.owner === f) && near.dist < 12 && Math.random() < 0.45){ placeMortar(f); used = true; }
      }
      if (used){
        f.botCd[type] = now + (BOT_EQUIPMENT_COOLDOWN + Math.random()*10)*1000;
        break;
      }
    }
  }

  function useEquipment(type){
    if (!running || !APP.equipment.includes(type) || equipmentUsed.has(type)) return;
    if (type === 'dancing' && dancingIsLocked()){
      setMatchStatus('💗 Dancing est déjà utilisé par un autre joueur', 2200);
      return;
    }
    const player = getPlayer();
    if (!player || !player.alive) return;
    const button = document.getElementById(`ability-${type}`);
    if (type === 'dancing'){
      if (!startDancing(player)) return;
      startEquipmentCooldown(type);
      return;
    }
    if (type === 'heal'){
      player.hp = MAX_HP;
      updateHpUI(player.hp);
      updateHealthBar(player);
      addEffect(player.pos, '#45d6c4', 900);
      startEquipmentCooldown(type);
      setMatchStatus('Soin instantané activé');
      return;
    }
    if (type === 'fog'){
      fogUntil = performance.now() + 7000;
      createFogVisual(player);
      startEquipmentCooldown(type);
      setMatchStatus('Brouillard activé pendant 7 secondes', 7000);
      setTimeout(()=>{ if(performance.now() >= fogUntil && fogVisual){ try{scene.remove(fogVisual); fogVisual.geometry.dispose(); fogVisual.material.dispose();}catch(_){ } fogVisual=null; } },7200);
      return;
    }
    if (type === 'cow' || type === 'bolt' || type === 'mortar'){
      if (equipAttacksBlocked()){ setMatchStatus('Pas de combat pendant la première minute !', 1500); return; }
      if (type === 'cow'){
        spawnCow(player);
        startEquipmentCooldown(type);
        setMatchStatus(`🐄 La vache enragée broute… elle chargera dans ${COW_GRAZE_SECONDS} secondes`, 3000);
        return;
      }
      if (type === 'bolt'){
        const hit = strikeBolt(player);
        if (!hit){ setMatchStatus('Aucun adversaire à foudroyer'); return; }
        startEquipmentCooldown(type);
        setMatchStatus(`⚡ ${hit.name} est foudroyé !`, 2000);
        return;
      }
      if (mortars.some(m=>!m.dead && m.owner === player)){ setMatchStatus('Ton mortier est déjà en place'); return; }
      placeMortar(player);
      startEquipmentCooldown(type);
      setMatchStatus('🦁 Mortier de lion posé ! Il tire toutes les 5 secondes', 2800);
      return;
    }
    const target = fighters
      .filter(f=>f !== player && f.alive)
      .sort((a,b)=>dist2(player.pos.x, player.pos.z, a.pos.x, a.pos.z) - dist2(player.pos.x, player.pos.z, b.pos.x, b.pos.z))[0];
    if (!target || Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z) > 6){
      setMatchStatus('Aucun adversaire assez proche');
      return;
    }
    target.frozenUntil = performance.now() + 3000;
    createIceVisual(target);
    addEffect(target.pos, '#8ed8ff', 1000);
    startEquipmentCooldown(type);
    setMatchStatus(`${target.name} est gelé pendant 3 secondes`);
  }

  (function ensureDancingMatchButton(){
    const actions = document.getElementById('equipment-actions');
    if (!actions || document.getElementById('ability-dancing')) return;
    const button = document.createElement('button');
    button.id = 'ability-dancing';
    button.type = 'button';
    button.className = 'ability-btn';
    button.textContent = '💗 Dancing';
    actions.appendChild(button);
    button.addEventListener('click', ()=>useEquipment('dancing'));
  })();

  document.getElementById('ability-ice').addEventListener('click', ()=>useEquipment('ice'));
  document.getElementById('ability-fog').addEventListener('click', ()=>useEquipment('fog'));
  document.getElementById('ability-heal').addEventListener('click', ()=>useEquipment('heal'));
  ['cow', 'bolt', 'mortar'].forEach(type=>{
    const button = document.getElementById(`ability-${type}`);
    if (button) button.addEventListener('click', ()=>useEquipment(type));
  });

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
        // Le joystick est relatif à la caméra : haut = avancer vers l'avant de la caméra,
        // bas = reculer, droite/gauche = déplacement latéral. La caméra reste derrière le joueur.
        const moveForward = -moveZ;
        const moveRight = moveX;
        const worldX = camDirX*moveForward + camDirZ*moveRight;
        const worldZ = camDirZ*moveForward - camDirX*moveRight;
        const speed = BASE_SPEED * speedMultiplier;
        tryMove(f, worldX*speed*dt, worldZ*speed*dt);
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

    botUseEquipment(f);

    // ---- Maxitrone : aucune attaque pendant la première minute ----
    if (currentGameMode === 'maxitrone'){
      const speed = BASE_SPEED * speedMultiplier;
      if (!maxitroneCombatStarted){
        f.wanderTimer -= dt;
        if (f.wanderTimer <= 0){ f.wanderAngle=Math.random()*Math.PI*2; f.wanderTimer=1+Math.random()*2; }
        tryMove(f,Math.sin(f.wanderAngle)*speed*0.35*dt,Math.cos(f.wanderAngle)*speed*0.35*dt);
        f.rotY=f.wanderAngle;
        return;
      }
      let target=null,best=Infinity;
      for(const other of fighters){
        if(other===f || !other.alive || other.permanentlyEliminated) continue;
        const d=dist2(f.pos.x,f.pos.z,other.pos.x,other.pos.z); if(d<best){best=d;target=other;}
      }
      let throneOwner=null,throneBest=Infinity;
      for(const other of fighters){
        if(other===f || other.permanentlyEliminated || !other.throne || other.throne.destroyed) continue;
        const d=dist2(f.pos.x,f.pos.z,other.throne.mesh.position.x,other.throne.mesh.position.z); if(d<throneBest){throneBest=d;throneOwner=other;}
      }
      const targetIsThrone = throneOwner && (!target || throneBest < best);
      const tx = targetIsThrone ? throneOwner.throne.mesh.position.x : target?.pos.x;
      const tz = targetIsThrone ? throneOwner.throne.mesh.position.z : target?.pos.z;
      if(tx != null){
        const dx=tx-f.pos.x,dz=tz-f.pos.z,d=Math.hypot(dx,dz)||1;
        if(d>ATTACK_RANGE*0.85) tryMove(f,dx/d*speed*dt,dz/d*speed*dt);
        else if(f.attackCooldown<=0){ performAttack(f); f.attackCooldown=ATTACK_COOLDOWN+Math.random()*0.4; }
        f.rotY=Math.atan2(dx,dz);
      }
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
    // les robots s'en prennent aux mortiers ennemis proches si aucun adversaire n'est au contact
    const hostileMortar = nearestHostileMortar(f, 6.5);
    if (hostileMortar && (!target || best > 3*3)){
      const mdx = hostileMortar.x - f.pos.x, mdz = hostileMortar.z - f.pos.z;
      const md = Math.hypot(mdx, mdz) || 1;
      if (md > 1.9){
        tryMove(f, mdx/md*speed*dt, mdz/md*speed*dt);
      } else if (f.attackCooldown <= 0){
        performAttack(f);
        f.attackCooldown = ATTACK_COOLDOWN + Math.random()*0.4;
      }
      f.rotY = Math.atan2(mdx, mdz);
      return;
    }
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
    if (attacker.isPlayer && currentGameMode === 'maxitrone' && !maxitroneCombatStarted){
      setMatchStatus('Pas de combat pendant la première minute !', 1300);
      return;
    }
    if (attacker.sword){
      attacker.sword.rotation.z = -1.6;
      setTimeout(()=>{ if (attacker.sword) attacker.sword.rotation.z = -0.4; }, 150);
    }
    hitMortars(attacker);

    if (currentGameMode === 'maxitrone' && maxitroneIsCombatPhase()) {
      let target = null, best = ATTACK_RANGE + 0.001;
      for (const candidate of fighters){
        if (candidate === attacker || !candidate.alive || candidate.permanentlyEliminated) continue;
        const d=Math.hypot(candidate.pos.x-attacker.pos.x,candidate.pos.z-attacker.pos.z);
        if(d<best){best=d;target=candidate;}
      }
      if(target){
        const angleToTarget=Math.atan2(target.pos.x-attacker.pos.x,target.pos.z-attacker.pos.z);
        let diff=Math.abs(angleToTarget-attacker.rotY); diff=Math.min(diff,Math.PI*2-diff);
        if(diff<1.3){ applyDamage(attacker,target,DAMAGE); return; }
      }
      let throneOwner=null; best=ATTACK_RANGE+0.001;
      for(const candidate of fighters){
        if(candidate===attacker || candidate.permanentlyEliminated || !candidate.throne || candidate.throne.destroyed) continue;
        const d=Math.hypot(candidate.throne.mesh.position.x-attacker.pos.x,candidate.throne.mesh.position.z-attacker.pos.z);
        if(d<best){best=d;throneOwner=candidate;}
      }
      if(throneOwner){
        const angle=Math.atan2(throneOwner.throne.mesh.position.x-attacker.pos.x,throneOwner.throne.mesh.position.z-attacker.pos.z);
        let diff=Math.abs(angle-attacker.rotY); diff=Math.min(diff,Math.PI*2-diff);
        if(diff<1.3) damageMaxitroneThrone(attacker,throneOwner,DAMAGE);
      }
      return;
    }

    for (const target of fighters){
      if (target === attacker || !target.alive) continue;
      const d = Math.hypot(target.pos.x-attacker.pos.x, target.pos.z-attacker.pos.z);
      if (d <= ATTACK_RANGE){
        const angleToTarget = Math.atan2(target.pos.x-attacker.pos.x, target.pos.z-attacker.pos.z);
        let diff = Math.abs(angleToTarget - attacker.rotY);
        diff = Math.min(diff, Math.PI*2-diff);
        if (diff < 1.3) applyDamage(attacker, target, DAMAGE);
      }
    }
    if (currentGameMode === 'couronne' && crown && crown.state === 'vault'){
      const cd = Math.hypot(crown.mesh.position.x - attacker.pos.x, crown.mesh.position.z - attacker.pos.z);
      if (cd <= CROWN_ATTACK_RANGE) damageCrown(attacker, CROWN_DAMAGE);
    }
  }

  function applyDamage(attacker, target, dmg){
    if (currentGameMode === 'maxitrone' && !maxitroneCombatStarted) return;
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
    if (!target.alive || target.permanentlyEliminated) return;
    target.alive = false;
    target.hp = 0;
    target.mesh.visible = false;
    attacker.kills += 1;
    pushElimFeed(attacker.name, target.name);
    updateLeaderboard();

    // Son d'élimination à chaque élimination, y compris en Maxitrone définitif.
    AudioEngine.playEliminationSound();
    setTimeout(()=>{ AudioEngine.speak('Eliminated member'); }, 400);

    if (currentGameMode === 'maxitrone' && target.throne?.destroyed){
      target.permanentlyEliminated = true;
      target.respawnAt = 0;
      updateMaxitroneCounter();
      if (target.isPlayer){
        hideRespawnOverlay();
        leaveMaxitroneAfterPermanentElimination();
      }
      return;
    }
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
      if (f.permanentlyEliminated || (currentGameMode === 'maxitrone' && f.throne?.destroyed)){
        f.permanentlyEliminated = true;
        if (f.isPlayer) leaveMaxitroneAfterPermanentElimination();
        updateMaxitroneCounter();
        return;
      }
      const pos = randomSpawnPos();
      f.pos = pos;
      f.hp = adrenalineActive ? 1 : MAX_HP;
      f.alive = true;
      f.mesh.visible = true;
      f.permanentlyEliminated = false;
      if (currentGameMode === 'maxitrone') updateMaxitroneCounter();
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
    if (currentGameMode === 'maxitrone') updateMaxitroneCounter();
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
    updateEquipmentCooldowns();
    const nowT = performance.now();
    updateCows(dt, nowT);
    updateMortars(dt, nowT);
    updateRocks(dt, nowT);
    updateBolts(dt, nowT);
    if (dancingIsLocked(nowT)) updateDancingRing();
    if (fxBlind) fxBlind.classList.toggle('show', nowT < playerBlindUntil);
    if (fogVisual){ const p=getPlayer(); if(p){ fogVisual.position.set(p.pos.x,1.5,p.pos.z); fogVisual.rotation.y += dt*0.15; } }
    if (currentGameMode === 'couronne' && crown) updateCrownState(dt);
    if (currentGameMode === 'maxitrone'){
      for (const f of fighters){ if(f.throne && !f.throne.destroyed) f.throne.mesh.rotation.y += dt*0.15; }
      updateMaxitroneCounter();
    }
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
      if (currentGameMode === 'maxitrone' && !maxitroneCombatStarted && timeLeft <= MATCH_DURATION - MAXITRONE_SETUP_DURATION){
        maxitroneCombatStarted = true;
        AudioEngine.playChurchBell();
        setMatchStatus('⚔️ COMBAT ! Les trônes peuvent maintenant être attaqués.', 6000);
        const button=document.getElementById('btn-maxitrone-throne');
        if(button) button.style.display='none';
        updateModeHud();
      }
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
    currentGameMode = mode === 'couronne' ? 'couronne' : mode === 'maxitrone' ? 'maxitrone' : 'frappe';
    currentRanked = !!ranked && currentGameMode === 'frappe';
    MATCH_DURATION = currentGameMode === 'couronne' ? COURONNE_DURATION : currentGameMode === 'maxitrone' ? MAXITRONE_DURATION : FRAPPE_DURATION;
    maxitroneCombatStarted = false;
    ensureMaxitroneUI();

    showScreen('screen-match');
    if (!renderer) init();
    initFighters();
    removeCrownObjects();
    const maxBtn=document.getElementById('btn-maxitrone-throne');
    if(maxBtn){maxBtn.disabled=false;maxBtn.textContent='♜ Poser mon trône';maxBtn.style.opacity='1';}

    if (currentGameMode === 'couronne') spawnCrown();
    updateModeHud();
    updateHpUI(MAX_HP);
    updateLeaderboard();
    document.getElementById('elim-feed').innerHTML = '';
    hideRespawnOverlay();
    setupJoystickOnce();
    equipmentUsed.clear();
    equipmentCooldownUntil.clear();
    clearEquipmentVisuals();
    document.querySelectorAll('#equipment-actions button').forEach(b=>{b.classList.remove('used');b.removeAttribute('data-cooldown');});
    // seuls les 3 équipements choisis dans le lobby apparaissent en partie
    document.querySelectorAll('#equipment-actions .ability-btn').forEach(b=>{
      b.style.display = APP.equipment.includes(b.id.replace('ability-', '')) ? '' : 'none';
    });
    ensureEquipmentFx();
    hideEquipmentFx();
    AudioEngine.unlock();

    // réinitialise l'état du mode adrénaline pour cette nouvelle partie
    clearTimeout(adrenalineTimeout);
    clearTimeout(adrenalineEndTimeout);
    adrenalineActive = false;
    speedMultiplier = 1;
    document.getElementById('adrenaline-overlay').classList.remove('show');
    document.getElementById('adrenaline-banner').classList.remove('show');
    if (currentGameMode === 'frappe') scheduleAdrenaline(); // pas de mode adrénaline en Couronne Hunter / Maxitrone
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
    cancelDancing();
    hideEquipmentFx();
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

    if (currentGameMode === 'maxitrone'){
      if (titleEl) titleEl.textContent = 'Maxitrone terminé';
      const survivors = fighters.filter(f=>!f.permanentlyEliminated).sort((a,b)=>b.kills-a.kills);
      survivors.forEach((f,i)=>{
        const li=document.createElement('li'); if(f.isPlayer) li.className='me';
        li.innerHTML=`<span>#${i+1} ${escapeHtml(f.name)}</span><span>${f.kills} élim. · ${f.alive?'vivant':'en attente'}</span>`;
        list.appendChild(li);
      });
      if(note) note.textContent = survivors.length === 1 ? `🏆 ${survivors[0].name} remporte le Maxitrone ! Retour au lobby…` : 'Fin des 4 minutes. Retour au lobby…';
    } else if (currentGameMode === 'couronne'){
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
      APP.league = pendingLeagueReveal.index;
      socialHeartbeat();
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
      socialHeartbeat();
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
