/* TRUGO - equipment-wheel.js : choix des 3 equipements avec 3 roulettes de casino.
   Charge APRES game.js. Utilise APP.equipment / Store de game.js (aucune autre modification). */
(function () {
  "use strict";
  var ITEMS = [
    { id: "ice", name: "Glace", icon: "❄️", color: "#6fd3ff", desc: "Gèle le combattant le plus proche pendant 3 secondes." },
    { id: "fog", name: "Brouillard", icon: "🌫️", color: "#c4ccd8", desc: "Aveugle les adversaires pendant 7 secondes." },
    { id: "heal", name: "Soin", icon: "💚", color: "#3de08a", desc: "Restaure tous les points de vie immédiatement." },
    { id: "cow", name: "Vache enragée", icon: "🐄", color: "#ff9b54", desc: "Une vache broute 9 secondes, puis fonce sur un membre au hasard : 10 000 dégâts." },
    { id: "bolt", name: "Éclair", icon: "⚡", color: "#ffe14d", desc: "La foudre s'abat sur le combattant le plus proche." },
    { id: "mortar", name: "Mortier de lion", icon: "🦁", color: "#ffb648", desc: "1 321 PV. Tire toutes les 5 s sur un membre au hasard (456 dégâts)." },
    { id: "dancing", name: "Dancing", icon: "💗", color: "#ff6fb5", desc: "Rond lumineux qui change de joueur pendant 19 secondes." },
    { id: "nightark", name: "Nightark", icon: "🌙", color: "#9d8cff", desc: "12 squelettes chassent les joueurs pendant 20 secondes." },
    { id: "bluwer", name: "Bluwer", icon: "🔵", color: "#4d8dff", desc: "10 001 PV, 1 000 dégâts et vitesse ×2 pendant 31 secondes." },
    { id: "animo", name: "Animo", icon: "🐆", color: "#ff7a2b", desc: "Dash éclair sur 5 joueurs : ils sont tués instantanément." }
  ];
  var N = ITEMS.length, DEFAULT_SEL = ["ice", "fog", "heal"];
  var STEP = 0.62; // angle (rad) entre deux equipements sur le tambour
  var sel = DEFAULT_SEL.slice(), wheels = [], root = null, sound = true, actx = null, spinning = 0;

  function mod(a, n) { return ((a % n) + n) % n; }
  function idxOf(id) { for (var i = 0; i < N; i++) if (ITEMS[i].id === id) return i; return 0; }
  function nearestIdx(p, id) { var ti = idxOf(id); return ti + N * Math.round((p - ti) / N); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  try { sound = localStorage.getItem("trugo_ew_sound") !== "0"; } catch (e) {}

  /* ----- son & vibration ----- */
  function tick(strong) {
    try { if (navigator.vibrate) navigator.vibrate(strong ? 14 : 6); } catch (e) {}
    if (!sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      var o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
      o.type = "square"; o.frequency.setValueAtTime(strong ? 700 : 1250, t);
      g.gain.setValueAtTime(strong ? 0.06 : 0.035, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.06);
    } catch (e) {}
  }

  /* ----- etat <-> jeu ----- */
  function readGame() {
    var list = [];
    try { if (typeof APP !== "undefined" && Array.isArray(APP.equipment)) list = APP.equipment.slice(); } catch (e) {}
    var out = [];
    list.forEach(function (t) { if (ITEMS.some(function (i) { return i.id === t; }) && out.indexOf(t) < 0) out.push(t); });
    ITEMS.forEach(function (i) { if (out.length < 3 && out.indexOf(i.id) < 0) out.push(i.id); });
    return out.slice(0, 3);
  }
  function save() {
    try {
      APP.equipment = sel.slice();
      Store.save("trugo_equipment", APP.equipment);
      if (typeof refreshEquipmentCards === "function") refreshEquipmentCards();
    } catch (e) {}
    refreshAll();
  }
  function takenBy(id, slot) { for (var j = 0; j < 3; j++) if (j !== slot && sel[j] === id) return j; return -1; }

  /* ----- une roulette ----- */
  function Wheel(slot) {
    var self = this, big = slot === 0;
    this.slot = slot; this.p = idxOf(sel[slot]); this.anim = null; this.last = Math.round(this.p);
    this.H = big ? 58 : 50;
    this.node = el("div", "ew-wheel " + (big ? "big" : "small"));
    this.node.style.setProperty("--ew-row", this.H + "px");
    if (big) this.node.style.setProperty("--ew-h", "240px");
    this.node.innerHTML =
      '<div class="ew-plaque">Équipement ' + (slot + 1) + "</div>" +
      '<div class="ew-frame"><div class="ew-win" tabindex="0" role="listbox" aria-label="Équipement ' + (slot + 1) + '">' +
      '<div class="ew-band"></div><i class="ew-ptr l"></i><i class="ew-ptr r"></i><div class="ew-shade t"></div><div class="ew-shade b"></div><div class="ew-gloss"></div>' +
      '<button class="ew-nav up" aria-label="Précédent">▲</button><button class="ew-nav dn" aria-label="Suivant">▼</button>' +
      '<div class="ew-drum"></div></div></div><div class="ew-info"><b></b><small></small></div>';
    this.win = this.node.querySelector(".ew-win");
    this.drum = this.node.querySelector(".ew-drum");
    this.pool = [];
    for (var k = -3; k <= 3; k++) { var it = el("div", "ew-it"); it.dataset.k = k; this.drum.appendChild(it); this.pool.push(it); }
    this.bind();
    this.render();
  }
  Wheel.prototype.render = function () {
    var c = Math.round(this.p), R = this.H / STEP;
    for (var n = 0; n < this.pool.length; n++) {
      var it = this.pool[n], k = +it.dataset.k, idx = c + k, d = this.p - idx, th = d * STEP;
      var cos = Math.cos(th), item = ITEMS[mod(idx, N)];
      if (it._id !== item.id) {
        it._id = item.id; it.style.setProperty("--c", item.color);
        it.innerHTML = '<span class="ic">' + item.icon + '</span><span class="nm">' + esc(item.name) + '</span><span class="tk"></span>';
      }
      var tk = takenBy(item.id, this.slot);
      it.classList.toggle("taken", tk >= 0);
      if (tk >= 0) it.querySelector(".tk").textContent = "N°" + (tk + 1);
      var vis = Math.abs(th) < 1.45;
      it.style.opacity = vis ? Math.max(0, Math.pow(Math.max(0, cos), 1.6)) : 0;
      it.style.transform = "translate(-50%,-50%) translateY(" + (R * Math.sin(th)).toFixed(1) + "px) scale(" + (0.72 + 0.28 * Math.max(0, cos)).toFixed(3) + "," + Math.max(0.05, cos).toFixed(3) + ")";
      it.classList.toggle("center", Math.abs(d) < 0.5);
      it.style.zIndex = Math.abs(d) < 0.5 ? 2 : 0;
    }
  };
  Wheel.prototype.info = function () {
    var it = ITEMS[idxOf(sel[this.slot])];
    var b = this.node.querySelector(".ew-info b"), s = this.node.querySelector(".ew-info small");
    b.textContent = it.icon + " " + it.name; s.textContent = it.desc;
  };
  Wheel.prototype.setP = function (p) {
    this.p = p; var r = Math.round(p);
    if (r !== this.last) { this.last = r; tick(false); }
    this.render();
  };
  Wheel.prototype.stop = function () { if (this.anim) { cancelAnimationFrame(this.anim.raf); this.anim = null; this.node.classList.remove("spin"); } };
  Wheel.prototype.animateTo = function (target, dur, ease, done) {
    var self = this; this.stop();
    var from = this.p, t0 = performance.now(), delta = target - from;
    if (Math.abs(delta) < 1e-4) { this.setP(target); if (done) done(); return; }
    this.node.classList.add("spin");
    var a = this.anim = { raf: 0 };
    (function frame(now) {
      if (self.anim !== a) return;
      var t = Math.min(1, (now - t0) / dur);
      self.setP(from + delta * ease(t));
      if (t < 1) a.raf = requestAnimationFrame(frame);
      else { self.anim = null; self.node.classList.remove("spin"); self.setP(target); if (done) done(); }
    })(t0);
  };
  Wheel.prototype.go = function (target, dur) {
    var self = this;
    target = Math.round(target);
    var steps = Math.abs(target - this.p);
    this.animateTo(target, dur || Math.min(900, 260 + steps * 90), function (t) { return 1 - Math.pow(1 - t, 3); }, function () { settle(self); tick(true); land(self); });
  };
  Wheel.prototype.bind = function () {
    var self = this, win = this.win, drag = null, wheelAcc = 0, wheelT = 0;
    win.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".ew-nav") || spinning) return;
      self.stop(); win.focus({ preventScroll: true });
      try { win.setPointerCapture(e.pointerId); } catch (x) {}
      drag = { y0: e.clientY, p0: self.p, t: performance.now(), y: e.clientY, v: 0, moved: false, id: e.pointerId };
      tick(false);
    });
    win.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dy = e.clientY - drag.y0; if (Math.abs(dy) > 4) drag.moved = true;
      var now = performance.now(), dt = Math.max(1, now - drag.t);
      var inst = ((e.clientY - drag.y) / self.H) / (dt / 1000);
      drag.v = drag.v * 0.6 + inst * 0.4; drag.t = now; drag.y = e.clientY;
      self.setP(drag.p0 + dy / self.H);          // glisser vers le bas = equipement suivant
    });
    function end(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      var d = drag; drag = null;
      if (!d.moved) {                              // simple appui : on va vers l'equipement touche
        var r = win.getBoundingClientRect(), off = Math.round((e.clientY - (r.top + r.height / 2)) / self.H);
        return self.go(Math.round(self.p) - off);
      }
      var v = Math.max(-14, Math.min(14, d.v));
      self.go(Math.round(self.p + v * 0.14));
    }
    win.addEventListener("pointerup", end); win.addEventListener("pointercancel", end);
    win.addEventListener("wheel", function (e) {
      e.preventDefault(); if (spinning) return;
      var now = performance.now(); if (now - wheelT < 110) return; wheelT = now;
      self.go(Math.round(self.p) + (e.deltaY > 0 ? 1 : -1), 260);
    }, { passive: false });
    win.addEventListener("keydown", function (e) {
      if (spinning) return;
      if (e.key === "ArrowDown") { e.preventDefault(); self.go(Math.round(self.p) + 1, 260); }
      else if (e.key === "ArrowUp") { e.preventDefault(); self.go(Math.round(self.p) - 1, 260); }
    });
    this.node.querySelector(".ew-nav.up").addEventListener("click", function () { if (!spinning) self.go(Math.round(self.p) - 1, 260); });
    this.node.querySelector(".ew-nav.dn").addEventListener("click", function () { if (!spinning) self.go(Math.round(self.p) + 1, 260); });
  };

  /* ----- validation d'un choix (jamais deux fois le meme equipement) ----- */
  function settle(w) {
    var type = ITEMS[mod(Math.round(w.p), N)].id, slot = w.slot, old = sel[slot];
    if (old === type) { refreshAll(); return; }
    var j = takenBy(type, slot);
    sel[slot] = type;
    if (j >= 0) {                                   // echange : l'autre roulette prend l'ancien equipement
      sel[j] = old;
      wheels[j].go(nearestIdx(wheels[j].p, old), 650);
    }
    save();
  }
  function refreshAll() {
    wheels.forEach(function (w) { w.info(); w.render(); });
    var chips = root && root.querySelector(".ew-chips");
    if (chips) chips.innerHTML = sel.map(function (id) { var it = ITEMS[idxOf(id)]; return '<span class="ew-chip">' + it.icon + " " + esc(it.name) + "</span>"; }).join("");
  }

  /* ----- tirage au sort (machine a sous) ----- */
  function draw() {
    if (spinning) return;
    var pool = ITEMS.map(function (i) { return i.id; });
    for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    sel = pool.slice(0, 3); spinning = 3;
    var btn = root.querySelector(".ew-draw"); btn.disabled = true;
    wheels.forEach(function (w, n) {
      var target = nearestIdx(w.p, sel[n]) + N * (2 + n);           // plusieurs tours complets
      var dur = 1800 + n * 650;
      w.animateTo(target, dur, function (t) { return 1 - Math.pow(1 - t, 4); }, function () {
        tick(true); land(w); spinning--;
        if (spinning === 0) { btn.disabled = false; save(); confetti(); }
      });
    });
  }

  /* ----- construction ----- */
  function build() {
    var panel = document.getElementById("panel-equipment");
    var inner = panel && panel.querySelector(".equipment-panel");
    if (!inner || inner.querySelector(".ew-root")) return !!(inner && inner.querySelector(".ew-root"));
    panel.classList.add("ew-on");
    sel = readGame();
    root = el("div", "ew-root");
    root.innerHTML = '<p class="ew-hint"><b>Glisse une roue vers le bas</b> pour passer à l\'équipement suivant.</p><div class="ew-grid"></div>' +
      '<div class="ew-chips"></div><div class="ew-actions"><button class="ew-draw">🎰 Tirage au sort</button><button class="ew-snd" title="Son"></button></div>';
    var grid = root.querySelector(".ew-grid");
    for (var s = 0; s < 3; s++) { var w = new Wheel(s); wheels.push(w); grid.appendChild(w.node); }
    var anchor = inner.querySelector(".equipment-list");
    if (anchor) anchor.parentNode.insertBefore(root, anchor); else inner.appendChild(root);
    root.querySelector(".ew-draw").addEventListener("click", draw);
    var snd = root.querySelector(".ew-snd");
    function paintSnd() { snd.textContent = sound ? "🔊" : "🔇"; }
    snd.addEventListener("click", function () { sound = !sound; try { localStorage.setItem("trugo_ew_sound", sound ? "1" : "0"); } catch (e) {} paintSnd(); tick(false); });
    paintSnd(); refreshAll();
    // remet les roues sur le choix enregistre a chaque ouverture du panneau
    new MutationObserver(function () { if (panel.classList.contains("open")) resync(); }).observe(panel, { attributes: true, attributeFilter: ["class"] });
    return true;
  }
  function resync() {
    if (spinning) return;
    sel = readGame();
    wheels.forEach(function (w, n) { w.stop(); w.setP(nearestIdx(w.p, sel[n])); });
    refreshAll();
  }

  /* ----- animations ----- */
  function colorOf(id) { return ITEMS[idxOf(id)].color; }
  function land(w) {
    w.node.style.setProperty("--land", colorOf(sel[w.slot]));
    w.node.classList.remove("ew-land"); void w.node.offsetWidth; w.node.classList.add("ew-land");
    setTimeout(function () { w.node.classList.remove("ew-land"); }, 700);
  }
  function confetti() {
    if (!root) return;
    var box = el("div", "ew-conf"); root.appendChild(box);
    var cols = sel.map(colorOf).concat(["#fff", "#ffd34d"]);
    for (var i = 0; i < 46; i++) {
      var p = el("i"), a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 150;
      p.style.cssText = "--x:" + (Math.cos(a) * d).toFixed(0) + "px;--y:" + (Math.sin(a) * d - 40).toFixed(0) + "px;--r:" + Math.floor(Math.random() * 720 - 360) + "deg;background:" + cols[i % cols.length] + ";animation-delay:" + (Math.random() * 120).toFixed(0) + "ms";
      box.appendChild(p);
    }
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 1400);
  }
  /* en partie : explosion coloree a chaque utilisation d'un equipement + boutons qui brillent */
  function gameFx() {
    var bar = document.getElementById("equipment-actions");
    if (!bar) return false;
    function paintBtns() {
      Array.prototype.forEach.call(bar.querySelectorAll(".ability-btn"), function (b) {
        var id = b.id.replace("ability-", ""), it = ITEMS[idxOf(id)];
        if (it && it.id === id) b.style.setProperty("--efx", it.color);
      });
    }
    function burst(btn) {
      var id = btn.id.replace("ability-", ""), it = ITEMS[idxOf(id)]; if (!it || it.id !== id) return;
      var r = btn.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var fx = el("div", "ew-fx"); fx.style.setProperty("--c", it.color);
      var html = '<div class="ew-fx-vig"></div><div class="ew-fx-big"><span>' + it.icon + "</span><b>" + esc(it.name) + "</b></div>" +
        '<div class="ew-fx-ring" style="left:' + cx + "px;top:" + cy + 'px"></div><div class="ew-fx-ring r2" style="left:' + cx + "px;top:" + cy + 'px"></div>';
      for (var i = 0; i < 18; i++) {
        var a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 110;
        html += '<i class="ew-fx-p" style="left:' + cx + "px;top:" + cy + "px;--x:" + (Math.cos(a) * d).toFixed(0) + "px;--y:" + (Math.sin(a) * d).toFixed(0) + 'px"></i>';
      }
      fx.innerHTML = html; document.body.appendChild(fx);
      try { if (navigator.vibrate) navigator.vibrate(id === "animo" ? [30, 20, 30, 20, 60] : 25); } catch (e) {}
      setTimeout(function () { if (fx.parentNode) fx.parentNode.removeChild(fx); }, 1300);
    }
    var seen = new WeakMap();
    new MutationObserver(function (muts) {
      paintBtns();
      muts.forEach(function (m) {
        if (m.type !== "attributes") return;
        var b = m.target; if (!b.classList || !b.classList.contains("ability-btn")) return;
        var u = b.classList.contains("used");
        if (u && !seen.get(b)) burst(b);
        seen.set(b, u);
      });
    }).observe(bar, { attributes: true, attributeFilter: ["class"], subtree: true, childList: true });
    paintBtns();
    return true;
  }
  if (!gameFx()) { document.addEventListener("DOMContentLoaded", gameFx); setTimeout(gameFx, 1200); }

  if (!build()) {
    document.addEventListener("DOMContentLoaded", build);
    setTimeout(build, 800);
  }
})();
