/* =========================================================
   TRUGO — logique du site / jeu
   Démo front-end : le matchmaking et les amis/équipes sont
   simulés localement (aucun serveur pour l'instant).
   ========================================================= */

const OUTFIT_COLORS = ['#3fa7ff', '#ff5c68', '#45d6c4', '#ffb648', '#b46bff'];
const SWORD_COLORS  = ['#d9dde3', '#ffb648', '#45d6c4', '#ff5c68', '#9b9b9b'];
const BOT_NAMES = ['Raven','Nyx','Kato','Vex','Juno','Milo','Zed','Ash','Ika','Bram','Orin','Suki'];

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
};

const EQUIPMENT_NAMES = {
  ice: 'Glace',
  fog: 'Brouillard',
  heal: 'Soin',
};

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
  showScreen('screen-lobby');
  Lobby.start();
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
  let bodyMesh, swordMesh;

  function buildCharacter(){
    const group = new THREE.Group();

    const bodyGeo = THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.45, 0.9, 4, 8) : new THREE.CylinderGeometry(0.45,0.45,1.3,10);
    bodyMesh = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: APP.outfitColor }));
    bodyMesh.position.y = 1.0;
    group.add(bodyMesh);

    const headMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 16, 16),
      new THREE.MeshStandardMaterial({ color: '#f1c39a' })
    );
    headMesh.position.y = 1.85;
    group.add(headMesh);

    swordMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 1.1, 0.06),
      new THREE.MeshStandardMaterial({ color: APP.swordColor, metalness:0.4, roughness:0.3 })
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
    renderer.render(scene, camera);
  }

  function start(){
    if (!renderer) init();
    applyCharacterColors();
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
  Lobby.stop();
  startMatchmaking();
});
document.getElementById('btn-cancel-mm').addEventListener('click', ()=>{
  Matchmaking.cancel();
});

const Matchmaking = (()=>{
  let interval = null;
  let secondsLeft = 10;

  function start(){
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
          Match.start();
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
function startMatchmaking(){ Matchmaking.start(); }

/* ---------------------------------------------------------
   PARTIE — carte 3D, personnage 3e personne, combat, robots
--------------------------------------------------------- */
const MATCH_DURATION = 4*60; // secondes
const ARENA_RADIUS = 22;
const MAX_HP = 750;
const DAMAGE = 80;
const RESPAWN_DELAY = 15;
const ATTACK_RANGE = 1.6;
const ATTACK_COOLDOWN = 0.6;
const TOTAL_SLOTS = 8;

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
  let fogUntil = 0;
  let equipmentUsed = new Set();
  let effects = [];

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

  function buildArena(){
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA_RADIUS*2.4, ARENA_RADIUS*2.4, 1, 1),
      new THREE.MeshStandardMaterial({ color:'#232a1d' })
    );
    ground.rotation.x = -Math.PI/2;
    scene.add(ground);

    obstacles = [];

    // anciens bâtiments (ruines)
    const buildingMat = new THREE.MeshStandardMaterial({ color:'#4a4640' });
    const buildingCount = 9;
    for (let i=0;i<buildingCount;i++){
      const angle = (i / buildingCount) * Math.PI * 2 + Math.random()*0.4;
      const dist = 8 + Math.random()*10;
      const x = Math.cos(angle)*dist, z = Math.sin(angle)*dist;
      const w = 2 + Math.random()*2.5, d = 2 + Math.random()*2.5, h = 2.5 + Math.random()*4;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), buildingMat);
      b.position.set(x, h/2, z);
      b.rotation.y = Math.random()*Math.PI;
      scene.add(b);
      obstacles.push({ x, z, radius: Math.max(w,d)/2 + 0.4 });
    }

    // arbres
    const trunkMat = new THREE.MeshStandardMaterial({ color:'#3b2a1c' });
    const leafMat = new THREE.MeshStandardMaterial({ color:'#2f5c33' });
    const treeCount = 16;
    for (let i=0;i<treeCount;i++){
      const angle = Math.random()*Math.PI*2;
      const dist = 2 + Math.random()*(ARENA_RADIUS-2);
      const x = Math.cos(angle)*dist, z = Math.sin(angle)*dist;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.2,1.4,6), trunkMat);
      trunk.position.set(x, 0.7, z);
      scene.add(trunk);
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.0,2.0,7), leafMat);
      leaves.position.set(x, 2.2, z);
      scene.add(leaves);
      obstacles.push({ x, z, radius: 0.5 });
    }

    // limite d'arène (mur bas visuel)
    const wall = new THREE.Mesh(
      new THREE.TorusGeometry(ARENA_RADIUS, 0.15, 8, 48),
      new THREE.MeshStandardMaterial({ color:'#5a4030' })
    );
    wall.rotation.x = Math.PI/2;
    wall.position.y = 0.1;
    scene.add(wall);
  }

  function buildFighterMesh(outfitColor, swordColor){
    const group = new THREE.Group();
    const bodyGeo = THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.4, 0.85, 4, 8) : new THREE.CylinderGeometry(0.4,0.4,1.2,10);
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: outfitColor }));
    body.position.y = 0.95;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3,14,14), new THREE.MeshStandardMaterial({ color:'#f1c39a' }));
    head.position.y = 1.75;
    group.add(head);
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.09,1.0,0.05), new THREE.MeshStandardMaterial({ color: swordColor, metalness:0.4, roughness:0.3 }));
    sword.position.set(0.5, 1.0, 0.1);
    sword.rotation.z = -0.4;
    group.add(sword);
    const healthBar = makeHealthBar();
    group.add(healthBar);
    return { group, sword, healthBar };
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

    const hemi = new THREE.HemisphereLight('#bcd4ff', '#182010', 0.7);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight('#ffe6bd', 1.0);
    sun.position.set(10, 16, 6);
    scene.add(sun);

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
        const camAngle = Math.atan2(camDirX, camDirZ);
        const worldX = moveX*Math.cos(camAngle) + moveZ*Math.sin(camAngle);
        const worldZ = -moveX*Math.sin(camAngle) + moveZ*Math.cos(camAngle);
        const speed = 4.2;
        tryMove(f, worldX*speed*dt, worldZ*speed*dt);
        f.rotY = Math.atan2(worldX, worldZ);
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
    if (performance.now() < fogUntil){
      f.wanderTimer -= dt;
      if (f.wanderTimer <= 0){ f.wanderAngle = Math.random()*Math.PI*2; f.wanderTimer = 1+Math.random()*2; }
      tryMove(f, Math.sin(f.wanderAngle)*1.2*dt, Math.cos(f.wanderAngle)*1.2*dt);
      f.rotY = f.wanderAngle;
      return;
    }
    // cherche la cible vivante la plus proche
    let target = null, best = Infinity;
    for (const other of fighters){
      if (other === f || !other.alive) continue;
      const d = dist2(f.pos.x,f.pos.z, other.pos.x, other.pos.z);
      if (d < best){ best = d; target = other; }
    }
    const speed = 3.2;
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
      f.hp = MAX_HP;
      f.alive = true;
      f.mesh.visible = true;
      updateHealthBar(f);
      if (f.isPlayer){
        updateHpUI(f.hp);
        hideRespawnOverlay();
      }
    }, RESPAWN_DELAY*1000);
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
    document.getElementById('match-timer').textContent = formatTime(timeLeft);
    matchTimerInterval = setInterval(()=>{
      timeLeft -= 1;
      document.getElementById('match-timer').textContent = formatTime(timeLeft);
      if (timeLeft <= 0){
        clearInterval(matchTimerInterval);
        endMatch();
      }
    }, 1000);
  }

  function start(){
    showScreen('screen-match');
    if (!renderer) init();
    initFighters();
    updateHpUI(MAX_HP);
    updateLeaderboard();
    document.getElementById('elim-feed').innerHTML = '';
    hideRespawnOverlay();
    setupJoystickOnce();
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

  function endMatch(){
    running = false;
    clearInterval(matchTimerInterval);
    hideRespawnOverlay();
    const sorted = [...fighters].sort((a,b)=>b.kills-a.kills);
    const list = document.getElementById('end-leaderboard');
    list.innerHTML = '';
    sorted.forEach((f,i)=>{
      const li = document.createElement('li');
      if (f.isPlayer) li.className = 'me';
      li.innerHTML = `<span>#${i+1} ${escapeHtml(f.name)}</span><span>${f.kills} élim.</span>`;
      list.appendChild(li);
    });
    showScreen('screen-endmatch');
    setTimeout(()=>{
      showScreen('screen-lobby');
      Lobby.start();
    }, 3500);
  }

  return { start };
})();

/* ---------------------------------------------------------
   DEMARRAGE
--------------------------------------------------------- */
window.addEventListener('load', runLoadingSequence);
