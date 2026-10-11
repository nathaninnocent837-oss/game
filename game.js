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

  return {
    unlock, playBell, playEliminationSound, playChurchBell, speak,
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
    Match.start(['frappe','couronne','maxitrone'][Math.floor(Math.random()*3)]);
    return;
  }
  resultEl.textContent = '';

  // La roue classique devient une roue à 3 secteurs.
  wheel.style.background = 'conic-gradient(#ff5c68 0deg 120deg, #45d6c4 120deg 240deg, #ffc83d 240deg 360deg)';
  wheel.style.borderRadius = '50%';
  wheel.style.overflow = 'hidden';

  let labels = wheel.querySelector('.maxitrone-wheel-labels');
  if (!labels){
    labels = document.createElement('div');
    labels.className = 'maxitrone-wheel-labels';
    labels.style.cssText = 'position:absolute;inset:0;pointer-events:none;font-weight:900;font-size:11px;text-shadow:0 2px 5px #000;color:#fff;';
    labels.innerHTML = '<span style="position:absolute;top:17%;left:50%;transform:translateX(-50%);">FRAPPE</span>'
      + '<span style="position:absolute;bottom:17%;left:15%;">COURONNE</span>'
      + '<span style="position:absolute;bottom:17%;right:12%;">MAXITRONE</span>';
    wheel.style.position = 'relative';
    wheel.appendChild(labels);
  }

  const modes = ['frappe','couronne','maxitrone'];
  const chosenMode = modes[Math.floor(Math.random()*modes.length)];
  const sector = {frappe:60, couronne:180, maxitrone:300}[chosenMode] + (Math.random()*80-40);
  const spins = 5;
  const finalRotation = spins*360 + ((360 - ((sector+360)%360)) % 360);

  wheel.style.transition = 'none';
  wheel.style.transform = 'rotate(0deg)';
  void wheel.offsetWidth;
  wheel.style.transition = '';
  requestAnimationFrame(()=>{ wheel.style.transform = `rotate(${finalRotation}deg)`; });

  setTimeout(()=>{
    const names = {frappe:'Frappe Dolling',couronne:'Couronne Hunter',maxitrone:'Maxitrone'};
    resultEl.textContent = `Mode : ${names[chosenMode]}`;
    setTimeout(()=>{ Match.start(chosenMode); }, 900);
  }, 3100);
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

  function useEquipment(type){
    if (!running || !APP.equipment.includes(type) || equipmentUsed.has(type)) return;
    const player = getPlayer();
    if (!player || !player.alive) return;
    const button = document.getElementById(`ability-${type}`);
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
