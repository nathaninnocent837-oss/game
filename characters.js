/* =========================================================
   TRUGO — Personnages : Sergio (épée, 3e personne) & Barbara (fusil, 1re personne)
   - fenêtre « Changer de personnage » (glisser gauche/droite)
   - personnalisation (couleurs) + amélioration (100 000 pièces / niveau)
   - modèle 3D de Barbara, fusil, joystick de visée, viseur
   Expose window.TrugoChars et window.TrugoAim.
   ========================================================= */
(function(){
  'use strict';

  var UPGRADE_COST = 100000, MAX_LEVEL = 10, BONUS_PER_LEVEL = 0.08, BARBARA_SHOT_K = 0.3;
  var KINDS = ['sergio', 'barbara'];
  var INFO = {
    sergio: {
      name: 'Sergio', tag: 'Personnage principal', style: 'Épée · Vue 3e personne', tc: '#4aa8ff', rgb: '74,168,255', icon: '⚔️',
      desc: 'Le héros de TRUGO. Guerrier à l’épée, il fonce au corps à corps et gagne en puissance à chaque chapitre.',
      dmgLabel: 'Dégâts par coup'
    },
    barbara: {
      name: 'Barbara', tag: 'Tireuse d’élite', style: 'Fusil · Vue 1re personne', tc: '#ff6fa8', rgb: '255,111,168', icon: '🔫',
      desc: 'Vue à la première personne, fusil d’assaut et joystick de visée. Touche tes ennemis à distance, les équipements restent utilisables.',
      dmgLabel: 'Dégâts par balle'
    }
  };
  var BARBARA_OUTFITS = ['#ff6fa8', '#b46bff', '#3fa7ff', '#45d6c4', '#ffb648', '#ff5c68'];
  var BARBARA_ACCENTS = ['#ffd166', '#d9dde3', '#45d6c4', '#ff5c68', '#3fa7ff'];
  var BARBARA_DEFAULT = { o: BARBARA_OUTFITS[0], a: BARBARA_ACCENTS[0] };

  /* ---------- stockage ---------- */
  function user(){ try{ return (typeof APP !== 'undefined' && APP.username) || ''; }catch(e){ return ''; } }
  function key(){ return 'trugo_chars_' + user(); }
  function load(){
    var s = {};
    try{ s = JSON.parse(localStorage.getItem(key()) || '{}') || {}; }catch(e){}
    if (KINDS.indexOf(s.sel) < 0) s.sel = 'sergio';
    s.lv = s.lv || {}; s.col = s.col || {};
    return s;
  }
  function save(s){ try{ localStorage.setItem(key(), JSON.stringify(s)); }catch(e){} }
  function level(k){ return Math.max(0, Math.min(MAX_LEVEL, +load().lv[k] || 0)); }
  function kind(){ return load().sel; }
  function colorsOf(k){
    if (k === 'barbara'){ var c = load().col.barbara || {}; return { o: c.o || BARBARA_DEFAULT.o, a: c.a || BARBARA_DEFAULT.a }; }
    return { o: APP.outfitColor, a: APP.swordColor };
  }
  function multOf(k){ var l = level(k); return { hp: 1 + BONUS_PER_LEVEL * l, dmg: 1 + BONUS_PER_LEVEL * l }; }
  function mult(){ return multOf(kind()); }

  /* ---------- pièces (portefeuille) ----------
     Le solde affiché par le centre (#center-coins) fait foi ; les dépenses de cette
     fenêtre sont tenues dans un registre local et déduites de l'affichage. */
  var Coins = (function(){
    var raw = 0, lastWritten = null, obs = null;
    function spentKey(){ return 'trugo_chars_spent_' + user(); }
    function spent(){ try{ return Math.max(0, parseInt(localStorage.getItem(spentKey()) || '0', 10) || 0); }catch(e){ return 0; } }
    function parse(t){ return parseInt(String(t || '').replace(/[^\d]/g, ''), 10) || 0; }
    function fmt(n){ return Math.max(0, n).toLocaleString('fr-FR'); }
    function nodes(){ return [].slice.call(document.querySelectorAll('#center-coins, .wallet-coins')); }
    function paint(){
      var txt = fmt(raw - spent());
      lastWritten = txt;
      nodes().forEach(function(n){ if (n.textContent !== txt) n.textContent = txt; });
      var cw = document.querySelector('#chars-win .cw-coins b'); if (cw) cw.textContent = txt;
    }
    function onMut(muts){
      var changed = false;
      muts.forEach(function(m){
        var n = m.target.nodeType === 3 ? m.target.parentNode : m.target;
        if (!n || !n.matches || !n.matches('#center-coins, .wallet-coins')) return;
        if (n.textContent === lastWritten) return;
        raw = parse(n.textContent); changed = true;
      });
      if (changed) paint();
    }
    function start(){
      var first = nodes()[0]; if (first) raw = parse(first.textContent);
      if (!obs){
        obs = new MutationObserver(onMut);
        obs.observe(document.body, { childList:true, characterData:true, subtree:true });
      }
      paint();
    }
    function balance(){
      var first = nodes()[0];
      if (first && first.textContent !== lastWritten) raw = parse(first.textContent);
      return Math.max(0, raw - spent());
    }
    function spend(n){
      if (balance() < n) return false;
      try{ localStorage.setItem(spentKey(), String(spent() + n)); }catch(e){ return false; }
      try{ document.dispatchEvent(new CustomEvent('trugo:coins-spent', { detail:{ amount:n, reason:'character-upgrade' } })); }catch(e){}
      paint();
      return true;
    }
    return { start: start, balance: balance, spend: spend, fmt: fmt, paint: paint };
  })();

  /* ---------- modèle 3D de Barbara ---------- */
  function buildGun(mats, accent){
    var g = new THREE.Group();
    var dark = new THREE.MeshStandardMaterial({ color:'#23272e', roughness:.5, metalness:.7 });
    var wood = new THREE.MeshStandardMaterial({ color:'#5a3a22', roughness:.8, metalness:.05 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.11, 0.62), dark); g.add(body);
    var hand = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.08, 0.3), wood); hand.position.set(0, -0.005, 0.4); g.add(hand);
    var barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 8), dark);
    barrel.rotation.x = Math.PI/2; barrel.position.set(0, 0.02, 0.78); g.add(barrel);
    var stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.3), wood); stock.position.set(0, -0.02, -0.44); stock.rotation.x = -0.12; g.add(stock);
    var mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.09), dark); mag.position.set(0, -0.15, 0.1); mag.rotation.x = 0.2; g.add(mag);
    var grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.06), dark); grip.position.set(0, -0.11, -0.16); grip.rotation.x = -0.25; g.add(grip);
    var scope = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.22, 10), accent());
    scope.rotation.x = Math.PI/2; scope.position.set(0, 0.105, 0.05); g.add(scope);
    var lens = new THREE.Mesh(new THREE.CircleGeometry(0.026, 10), new THREE.MeshBasicMaterial({ color:'#9fe8ff' }));
    lens.position.set(0, 0.105, 0.162); g.add(lens);
    var stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.5), accent()); stripe.position.set(0, 0.06, 0.1); g.add(stripe);
    var flash = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 8), new THREE.MeshBasicMaterial({ color:'#ffd27a', transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false }));
    flash.rotation.x = Math.PI/2; flash.position.set(0, 0.02, 1.1); g.add(flash);
    g.userData.flash = flash;
    return g;
  }

  function buildBarbara(outfitColor, accentColor){
    var outfitMats = [], darkMats = [], accentMats = [];
    var outfitC = new THREE.Color(outfitColor);
    function mk(list, color, extra){ var m = new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness:.55, metalness:.12 }, extra || {})); list.push(m); return m; }
    var outfitMat = function(e){ return mk(outfitMats, outfitColor, e); };
    var darkMat = function(e){ return mk(darkMats, outfitC.clone().multiplyScalar(.55), Object.assign({ roughness:.85, metalness:.05 }, e || {})); };
    var accentMat = function(e){ return mk(accentMats, accentColor, Object.assign({ metalness:.55, roughness:.3, emissive:new THREE.Color(accentColor).multiplyScalar(.18) }, e || {})); };
    var plain = function(c, e){ return new THREE.MeshStandardMaterial(Object.assign({ color:c, roughness:.6, metalness:.08 }, e || {})); };
    var skin = '#f6cba8', hairC = '#3b1f14';

    var group = new THREE.Group(), body = new THREE.Group(); group.add(body);

    // buste plus fin : épaules étroites, taille marquée
    var prof = [[0.001,0],[0.23,0],[0.27,0.1],[0.22,0.3],[0.26,0.52],[0.3,0.74],[0.25,0.88],[0.001,0.9]].map(function(p){ return new THREE.Vector2(p[0], p[1]); });
    var torso = new THREE.Mesh(new THREE.LatheGeometry(prof, 14), outfitMat({ side:THREE.DoubleSide }));
    torso.position.y = .64; torso.scale.z = .74; body.add(torso);
    var vest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.4, 0.1), darkMat());
    vest.position.set(0, 1.08, 0.2); body.add(vest);
    var belt = new THREE.Mesh(new THREE.TorusGeometry(0.265, 0.045, 8, 20), plain('#2a1a10', { metalness:.3 }));
    belt.rotation.x = Math.PI/2; belt.scale.y = .74; belt.position.y = .78; body.add(belt);
    var star = new THREE.Mesh(new THREE.OctahedronGeometry(0.085), accentMat());
    star.scale.set(1, 1.2, .45); star.position.set(0, 1.22, 0.25); body.add(star);

    var neck = new THREE.Mesh(new THREE.CylinderGeometry(.075, .085, .12, 8), plain(skin));
    neck.position.y = 1.56; body.add(neck);

    var head = new THREE.Group(); head.position.y = 1.6; body.add(head);
    var skull = new THREE.Mesh(new THREE.SphereGeometry(.28, 16, 16), plain(skin)); skull.position.y = .13; head.add(skull);
    var eyeM = plain('#1a1410', { roughness:.4 }), eyeG = new THREE.SphereGeometry(.036, 8, 8);
    var eL = new THREE.Mesh(eyeG, eyeM); eL.position.set(-.09, .15, .245); head.add(eL);
    var eR = new THREE.Mesh(eyeG, eyeM.clone()); eR.position.set(.09, .15, .245); head.add(eR);
    var lashG = new THREE.BoxGeometry(.085, .014, .02);
    [-1, 1].forEach(function(s){ var l = new THREE.Mesh(lashG, eyeM); l.position.set(s*.09, .19, .262); l.rotation.z = -s*.25; head.add(l); });
    var lips = new THREE.Mesh(new THREE.BoxGeometry(.08, .022, .02), plain('#d9526f')); lips.position.set(0, .03, .262); head.add(lips);
    var hair = new THREE.Mesh(new THREE.SphereGeometry(.31, 16, 12, 0, Math.PI*2, 0, Math.PI*.62), plain(hairC, { roughness:.7, side:THREE.DoubleSide }));
    hair.position.set(0, .15, -.03); head.add(hair);
    var fringe = new THREE.Mesh(new THREE.BoxGeometry(.5, .08, .1), plain(hairC, { roughness:.7 })); fringe.position.set(0, .31, .2); fringe.rotation.x = -.35; head.add(fringe);
    var band = new THREE.Mesh(new THREE.TorusGeometry(.295, .022, 8, 24), accentMat()); band.rotation.x = Math.PI/2; band.position.set(0, .3, 0); head.add(band);

    // queue de cheval (animée comme une cape)
    var tail = new THREE.Group(); tail.position.set(0, 1.74, -.26); tail.rotation.x = .1;
    var tailM = new THREE.Mesh(new THREE.CylinderGeometry(.11, .025, .72, 8), plain(hairC, { roughness:.7 })); tailM.position.y = -.36; tail.add(tailM);
    var tie = new THREE.Mesh(new THREE.SphereGeometry(.06, 8, 8), accentMat()); tie.position.y = -.02; tail.add(tie);
    body.add(tail);

    function arm(side){
      var p = new THREE.Group(); p.position.set(side*.37, 1.44, 0);
      var pad = new THREE.Mesh(new THREE.SphereGeometry(.15, 12, 12), outfitMat({ metalness:.4 })); pad.scale.y = .8; p.add(pad);
      var up = new THREE.Mesh(new THREE.CylinderGeometry(.07, .06, .44, 8), outfitMat()); up.position.y = -.25; p.add(up);
      var gl = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .12, 8), darkMat()); gl.position.y = -.4; p.add(gl);
      var hd = new THREE.Mesh(new THREE.SphereGeometry(.075, 10, 10), plain(skin)); hd.position.y = -.53; p.add(hd);
      p.rotation.z = side*.1; body.add(p); return p;
    }
    var armL = arm(-1), armR = arm(1);

    var gun = buildGun(null, accentMat);
    gun.position.set(.08, 1.27, .5); body.add(gun);

    function leg(side){
      var p = new THREE.Group(); p.position.set(side*.13, .67, 0);
      var th = new THREE.Mesh(new THREE.CylinderGeometry(.09, .075, .36, 8), darkMat()); th.position.y = -.18; p.add(th);
      var bt = new THREE.Mesh(new THREE.CylinderGeometry(.085, .11, .3, 8), plain('#2a1a10')); bt.position.y = -.5; p.add(bt);
      var ft = new THREE.Mesh(new THREE.BoxGeometry(.16, .09, .28), plain('#2a1a10')); ft.position.set(0, -.62, .05); p.add(ft);
      group.add(p); return p;
    }
    var legL = leg(-1), legR = leg(1);

    var slashMat = new THREE.MeshBasicMaterial({ color:accentColor, transparent:true, opacity:0, depthWrite:false });
    var slash = new THREE.Mesh(new THREE.PlaneGeometry(.01, .01), slashMat); slash.visible = false; group.add(slash);

    return { kind:'gun', group:group, body:body, head:head, armL:armL, armR:armR, legL:legL, legR:legR, cape:tail, sword:gun, gun:gun, muzzle:gun.userData.flash,
             slash:slash, slashMat:slashMat, outfitMats:outfitMats, darkMats:darkMats, accentMats:accentMats };
  }

  // pose de tir (appelée à la fin d'animateFighterModel)
  function pose(rig, st, now, m){
    var ap = (now - (st.attackAnimAt || -1e9)) / 160, k = (ap >= 0 && ap < 1) ? 1 - ap : 0;
    var br = Math.sin(now/1000*2.1 + (st.animSeed || 0)) * .015;
    rig.body.rotation.y = 0;
    rig.slash.visible = false; rig.slashMat.opacity = 0;
    rig.armR.rotation.x = -1.38 - k*.07 + br; rig.armR.rotation.z = -.42;
    rig.armL.rotation.x = -1.26 + br;        rig.armL.rotation.z = .5;
    rig.gun.position.z = .5 - k*.08; rig.gun.rotation.x = -k*.06;
    rig.body.rotation.x -= k*.05;
    if (rig.muzzle) rig.muzzle.material.opacity = k > .55 ? .95 : 0;
  }

  // fusil vu depuis la caméra (1re personne)
  function buildViewGun(){
    var root = new THREE.Group();
    var c = colorsOf('barbara');
    var g = buildGun(null, function(){ return new THREE.MeshStandardMaterial({ color:c.a, roughness:.3, metalness:.55, emissive:new THREE.Color(c.a).multiplyScalar(.15) }); });
    g.rotation.y = Math.PI; g.scale.setScalar(.85); g.position.set(0, 0, -.1);
    root.add(g);
    var skin = new THREE.MeshStandardMaterial({ color:'#f6cba8', roughness:.6 });
    var sleeve = new THREE.MeshStandardMaterial({ color:c.o, roughness:.55, metalness:.12 });
    var f1 = new THREE.Mesh(new THREE.CylinderGeometry(.04, .05, .5, 8), sleeve); f1.rotation.set(1.25, 0, .25); f1.position.set(.06, -.16, .12); root.add(f1);
    var h1 = new THREE.Mesh(new THREE.SphereGeometry(.05, 8, 8), skin); h1.position.set(.02, -.05, -.05); root.add(h1);
    var f2 = new THREE.Mesh(new THREE.CylinderGeometry(.036, .045, .55, 8), sleeve); f2.rotation.set(1.3, 0, -.5); f2.position.set(-.2, -.12, -.02); root.add(f2);
    var h2 = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 8), skin); h2.position.set(-.09, -.04, -.3); root.add(h2);
    root.userData.flash = g.userData.flash;
    root.traverse(function(o){ o.frustumCulled = false; });
    return root;
  }

  /* ---------- son du fusil ---------- */
  var ac = null;
  function sfx(){
    try{
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      var len = Math.floor(ac.sampleRate * .14), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random()*2 - 1) * Math.pow(1 - i/len, 3);
      var src = ac.createBufferSource(); src.buffer = buf;
      var f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
      var g = ac.createGain(); g.gain.value = .2;
      src.connect(f); f.connect(g); g.connect(ac.destination); src.start();
      var o = ac.createOscillator(), og = ac.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(150, ac.currentTime); o.frequency.exponentialRampToValueAtTime(45, ac.currentTime + .1);
      og.gain.setValueAtTime(.25, ac.currentTime); og.gain.exponentialRampToValueAtTime(.001, ac.currentTime + .12);
      o.connect(og); og.connect(ac.destination); o.start(); o.stop(ac.currentTime + .13);
    }catch(e){}
  }

  /* ---------- joystick de visée + viseur ---------- */
  var Aim = window.TrugoAim = { x:0, y:0, fire:false };
  var ATK_SVG_ORIG = null;
  function setupAim(){
    var jz = document.getElementById('joystick-zone'); if (!jz || document.getElementById('aim-zone')) return;
    var host = jz.parentNode;
    var zone = document.createElement('div'); zone.id = 'aim-zone'; zone.className = 'aim-zone';
    zone.innerHTML = '<div class="aim-base"><div class="aim-ring"></div><div class="aim-knob" id="aim-knob"></div></div><span class="aim-lbl">VISER</span>';
    host.appendChild(zone);
    var cross = document.createElement('div'); cross.id = 'aim-cross'; cross.className = 'aim-cross';
    cross.innerHTML = '<i></i><i></i><i></i><i></i><b></b>';
    host.appendChild(cross);
    var knob = zone.querySelector('#aim-knob'), maxD = 36, pid = null;
    function move(cx, cy){
      var r = zone.querySelector('.aim-base').getBoundingClientRect();
      var dx = cx - (r.left + r.width/2), dy = cy - (r.top + r.height/2), d = Math.hypot(dx, dy);
      if (d > maxD){ dx = dx/d*maxD; dy = dy/d*maxD; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      Aim.x = dx/maxD; Aim.y = dy/maxD;
    }
    function reset(){ knob.style.transform = 'translate(0,0)'; Aim.x = 0; Aim.y = 0; pid = null; }
    zone.addEventListener('pointerdown', function(e){ pid = e.pointerId; try{ zone.setPointerCapture(pid); }catch(_){} move(e.clientX, e.clientY); e.preventDefault(); });
    zone.addEventListener('pointermove', function(e){ if (e.pointerId === pid) move(e.clientX, e.clientY); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function(t){ zone.addEventListener(t, function(e){ if (e.pointerId === pid) reset(); }); });
    zone.addEventListener('touchstart', function(e){ e.preventDefault(); }, { passive:false });

    var atk = document.getElementById('btn-attack');
    if (atk){
      atk.addEventListener('pointerdown', function(){ if (document.body.classList.contains('barbara-on')) Aim.fire = true; });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function(t){ atk.addEventListener(t, function(){ Aim.fire = false; }); });
    }
  }
  var GUN_ICON = '<svg viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="5" fill="none" stroke="#2a0508" stroke-width="2"/><circle cx="12" cy="12" r="1.6"/></svg>';
  function matchOn(){
    Aim.x = Aim.y = 0; Aim.fire = false;
    if (kind() !== 'barbara') return;
    setupAim();
    document.body.classList.add('barbara-on');
    var atk = document.getElementById('btn-attack');
    if (atk){ if (ATK_SVG_ORIG === null) ATK_SVG_ORIG = atk.innerHTML; atk.innerHTML = GUN_ICON; atk.classList.add('gun'); }
  }
  function matchOff(){
    Aim.x = Aim.y = 0; Aim.fire = false;
    document.body.classList.remove('barbara-on');
    var atk = document.getElementById('btn-attack');
    if (atk && ATK_SVG_ORIG !== null){ atk.innerHTML = ATK_SVG_ORIG; atk.classList.remove('gun'); }
  }
  document.addEventListener('trugo:match-start', matchOn);
  document.addEventListener('trugo:match-end', matchOff);

  /* ---------- fenêtre « Changer de personnage » ---------- */
  var win = null, deck = null, viewed = 0, scrollT = 0, busy = false;

  function baseStats(){
    var hp = 750, dmg = 80;
    try{ var T = HERO_TIERS[getHeroTier()]; hp = T.hp; dmg = T.dmg; }catch(e){}
    return { hp: hp, dmg: dmg };
  }
  function statVals(k, lv){
    var b = baseStats(), m = 1 + BONUS_PER_LEVEL * lv;
    return { hp: Math.round(b.hp * m), dmg: Math.round(b.dmg * (k === 'barbara' ? BARBARA_SHOT_K : 1) * m) };
  }
  function swatchHtml(list, cur, role){
    return list.map(function(c){
      return '<button class="cw-sw' + (c.toLowerCase() === String(cur).toLowerCase() ? ' on' : '') + '" data-role="' + role + '" data-c="' + c + '" style="--c:' + c + '" aria-label="' + c + '"></button>';
    }).join('');
  }
  function cardHtml(k){
    var I = INFO[k], S = load(), lv = level(k), cur = S.sel === k, cc = colorsOf(k);
    var now = statVals(k, lv), nxt = statVals(k, Math.min(MAX_LEVEL, lv + 1));
    var maxHp = baseStats().hp * (1 + BONUS_PER_LEVEL * MAX_LEVEL);
    var maxDm = baseStats().dmg * (k === 'barbara' ? BARBARA_SHOT_K : 1) * (1 + BONUS_PER_LEVEL * MAX_LEVEL);
    var pips = ''; for (var i = 0; i < MAX_LEVEL; i++) pips += '<i class="' + (i < lv ? 'on' : '') + '"></i>';
    var bal = Coins.balance(), can = lv < MAX_LEVEL && bal >= UPGRADE_COST;
    var upLabel = lv >= MAX_LEVEL ? 'NIVEAU MAX' : '⬆ AMÉLIORER · ' + Coins.fmt(UPGRADE_COST) + ' 🪙';
    var miss = lv < MAX_LEVEL && bal < UPGRADE_COST ? '<div class="cw-miss">Il te manque <b>' + Coins.fmt(UPGRADE_COST - bal) + '</b> 🪙</div>' : '';
    var outs = k === 'barbara' ? BARBARA_OUTFITS : OUTFIT_COLORS, acc = k === 'barbara' ? BARBARA_ACCENTS : SWORD_COLORS;
    var delta = lv < MAX_LEVEL ? function(a, b){ return '<em>+' + (b - a) + '</em>'; } : function(){ return ''; };
    return '<section class="cw-card" data-kind="' + k + '" style="--tc:' + I.tc + ';--rgb:' + I.rgb + '">' +
      '<div class="cw-tags"><span class="cw-tag main">' + I.tag + '</span><span class="cw-tag">' + I.style + '</span></div>' +
      '<h2 class="cw-cname">' + I.icon + ' ' + I.name.toUpperCase() + '</h2>' +
      '<p class="cw-desc">' + I.desc + '</p>' +
      '<div class="cw-lvl"><span>Niveau <b>' + lv + '</b> / ' + MAX_LEVEL + '</span><div class="cw-pips">' + pips + '</div></div>' +
      '<div class="cw-stat"><div class="cw-sl"><span>❤ Points de vie</span><span><b>' + now.hp + '</b>' + delta(now.hp, nxt.hp) + '</span></div><div class="cw-bar hp"><span style="width:' + Math.min(100, now.hp / maxHp * 100) + '%"></span></div></div>' +
      '<div class="cw-stat"><div class="cw-sl"><span>' + (k === 'barbara' ? '🎯' : '⚔') + ' ' + I.dmgLabel + '</span><span><b>' + now.dmg + '</b>' + delta(now.dmg, nxt.dmg) + '</span></div><div class="cw-bar dm"><span style="width:' + Math.min(100, now.dmg / maxDm * 100) + '%"></span></div></div>' +
      '<button class="cw-up" data-act="up"' + (can ? '' : ' disabled') + '>' + upLabel + '</button>' + miss +
      '<h3>Couleur de tenue</h3><div class="cw-sws">' + swatchHtml(outs, cc.o, 'o') + '</div>' +
      '<h3>' + (k === 'barbara' ? 'Couleur d’accents' : 'Couleur d’épée') + '</h3><div class="cw-sws">' + swatchHtml(acc, cc.a, 'a') + '</div>' +
      '<button class="cw-pick' + (cur ? ' on' : '') + '" data-act="pick"' + (cur ? ' disabled' : '') + '>' + (cur ? '✔ ÉQUIPÉ' : 'CHOISIR ' + I.name.toUpperCase()) + '</button>' +
      '</section>';
  }
  function buildWin(){
    if (win) return;
    win = document.createElement('div'); win.id = 'chars-win';
    win.innerHTML =
      '<div class="cw-top"><button class="cw-x" aria-label="Fermer">&times;</button>' +
      '<div class="cw-ttl"><small>TRUGO</small><b>Personnages</b></div>' +
      '<div class="cw-coins"><span>🪙</span><b>0</b></div></div>' +
      '<div class="cw-stage"><button class="cw-arr l" aria-label="Précédent">‹</button><div class="cw-name"><small></small><h2></h2></div><button class="cw-arr r" aria-label="Suivant">›</button>' +
      '<div class="cw-hint">‹ glisse pour changer de personnage ›</div><div class="cw-dots"></div></div>' +
      '<div class="cw-flash"></div><div class="cw-deck"></div>';
    document.body.appendChild(win);
    deck = win.querySelector('.cw-deck');
    win.querySelector('.cw-x').addEventListener('click', closeWin);
    win.querySelector('.cw-arr.l').addEventListener('click', function(){ go(viewed - 1); });
    win.querySelector('.cw-arr.r').addEventListener('click', function(){ go(viewed + 1); });
    deck.addEventListener('scroll', function(){
      clearTimeout(scrollT);
      scrollT = setTimeout(function(){
        var i = Math.round(deck.scrollLeft / Math.max(1, deck.clientWidth));
        if (i !== viewed) show(i);
      }, 60);
    }, { passive:true });
    deck.addEventListener('click', onDeckClick);
  }
  function go(i){
    i = Math.max(0, Math.min(KINDS.length - 1, i));
    deck.scrollTo({ left: i * deck.clientWidth, behavior:'smooth' });
  }
  function show(i){
    viewed = i;
    var k = KINDS[i], I = INFO[k];
    win.style.setProperty('--tc', I.tc); win.style.setProperty('--rgb', I.rgb);
    win.querySelector('.cw-name small').textContent = I.style.toUpperCase();
    win.querySelector('.cw-name h2').textContent = I.name.toUpperCase();
    win.querySelectorAll('.cw-dots i').forEach(function(d, n){ d.classList.toggle('on', n === i); });
    win.querySelector('.cw-arr.l').style.visibility = i === 0 ? 'hidden' : '';
    win.querySelector('.cw-arr.r').style.visibility = i === KINDS.length - 1 ? 'hidden' : '';
    try{ Lobby.setKind(k); }catch(e){}
    try{ navigator.vibrate && navigator.vibrate(12); }catch(e){}
  }
  function render(){
    var x = deck.scrollLeft;
    deck.innerHTML = KINDS.map(cardHtml).join('');
    deck.scrollLeft = x;
    win.querySelector('.cw-dots').innerHTML = KINDS.map(function(){ return '<i></i>'; }).join('');
    win.querySelectorAll('.cw-dots i').forEach(function(d, n){ d.classList.toggle('on', n === viewed); });
    Coins.paint();
  }
  function onDeckClick(e){
    var b = e.target.closest('button'); if (!b) return;
    var card = b.closest('.cw-card'); if (!card) return;
    var k = card.getAttribute('data-kind'), S = load();
    if (b.classList.contains('cw-sw')){
      var role = b.getAttribute('data-role'), c = b.getAttribute('data-c');
      if (k === 'barbara'){
        var cur = colorsOf('barbara'); cur[role] = c; S.col.barbara = { o: cur.o, a: cur.a }; save(S);
      } else if (role === 'o'){ APP.outfitColor = c; Store.save('trugo_outfit', c); }
      else { APP.swordColor = c; Store.save('trugo_sword', c); }
      try{ Lobby.applyCharacterColors(); }catch(_){}
      render();
    } else if (b.getAttribute('data-act') === 'pick'){
      S.sel = k; save(S);
      try{ Lobby.burst(); }catch(_){}
      flash(); render(); refreshOpenBtn();
    } else if (b.getAttribute('data-act') === 'up'){
      if (busy || level(k) >= MAX_LEVEL) return;
      if (!Coins.spend(UPGRADE_COST)) { render(); return; }
      busy = true;
      S = load(); S.lv[k] = Math.min(MAX_LEVEL, (+S.lv[k] || 0) + 1); save(S);
      try{ Lobby.burst(); }catch(_){}
      try{ navigator.vibrate && navigator.vibrate([60, 40, 120]); }catch(_){}
      flash();
      var ban = document.createElement('div'); ban.className = 'cw-banner'; ban.style.setProperty('--tc', INFO[k].tc);
      ban.innerHTML = '<small>' + INFO[k].name.toUpperCase() + ' AMÉLIORÉ</small><strong>NIVEAU ' + S.lv[k] + '</strong>';
      win.appendChild(ban);
      setTimeout(function(){ ban.remove(); busy = false; }, 1900);
      render();
    }
  }
  function flash(){ var f = win.querySelector('.cw-flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }

  function openWin(){
    buildWin(); Coins.start();
    viewed = Math.max(0, KINDS.indexOf(kind()));
    win.classList.add('open');
    render();
    deck.scrollLeft = viewed * deck.clientWidth;
    show(viewed);
  }
  function closeWin(){
    if (!win) return;
    win.classList.remove('open');
    try{ Lobby.setKind(null); }catch(e){}
    refreshOpenBtn();
  }

  /* ---------- bouton en bas du panneau Personnage ---------- */
  function refreshOpenBtn(){
    var b = document.getElementById('chars-open-btn'); if (!b) return;
    var I = INFO[kind()];
    b.style.setProperty('--tc', I.tc); b.style.setProperty('--rgb', I.rgb);
    b.querySelector('small').textContent = 'Personnage actuel : ' + I.name;
    var h = document.querySelector('#hero-sheet .hh small');
    if (h){ h.innerHTML = h.innerHTML.replace(/^[^·<]*·/, I.name + ' ·'); }
  }
  function inject(){
    var sh = document.getElementById('hero-sheet');
    if (!sh) return false;
    if (!document.getElementById('chars-open-btn')){
      var b = document.createElement('button'); b.id = 'chars-open-btn'; b.type = 'button';
      b.innerHTML = '<span class="co-ic">🧑‍🤝‍🧑</span><span class="co-tx"><b>Changer de personnage</b><small></small></span><span class="co-ar">›</span>';
      b.addEventListener('click', openWin);
      sh.appendChild(b);
    }
    refreshOpenBtn();
    return true;
  }
  function watch(){
    if (inject()) return;
    var mo = new MutationObserver(function(){ if (inject()) mo.disconnect(); });
    mo.observe(document.body, { childList:true });
  }
  document.addEventListener('click', function(e){
    if (e.target.closest && e.target.closest('#btn-character')) setTimeout(function(){ inject(); }, 0);
  }, true);

  window.TrugoChars = {
    kind: kind, colorsOf: colorsOf, mult: mult, level: level, info: INFO,
    isGun: function(){ return kind() === 'barbara'; },
    buildBarbara: buildBarbara, buildViewGun: buildViewGun, pose: pose, sfx: sfx,
    open: openWin, close: closeWin, coins: Coins, upgradeCost: UPGRADE_COST
  };

  function boot(){ Coins.start(); watch(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
