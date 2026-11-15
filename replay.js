/* TRUGO : replays (dernier combat), clips de story (15 s + légende) et spectateur en direct */
(function () {
  "use strict";
  if (window.TrugoReplay) return;
  var PAL = ["#ff4d5e", "#4aa8ff", "#35e0a0", "#ffb648", "#b56bff", "#ff6ad5", "#3dd9ff", "#7dff6a", "#ffe14d", "#ff7a2b", "#8a96a8", "#ffffff"];
  var MODE = { frappe: "Frappe Dolling", couronne: "Couronne Hunter", maxitrone: "Maxitrone" };
  var API = null, LAST = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function fmt(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60); }
  function toast(t) { var n = el("div", "rp-toast", esc(t)); document.body.appendChild(n); setTimeout(function () { n.classList.add("out"); setTimeout(function () { n.remove(); }, 300); }, 2400); }

  /* ---------- API ---------- */
  function detectApi() {
    if (API) return Promise.resolve(API);
    var c = ["/api/groups", "/api/profile/groups"], i = 0;
    function next() {
      if (i >= c.length) return Promise.reject(new Error("api"));
      var base = c[i++];
      return fetch(base + "/fight/live", { credentials: "same-origin" }).then(function (r) { if (!r.ok) return next(); API = base; return API; }).catch(next);
    }
    return next();
  }
  function call(path, body) {
    return detectApi().then(function (b) {
      return fetch(b + path, { method: body ? "POST" : "GET", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
        .then(function (r) { return r.json().then(function (j) { return r.ok ? j : Promise.reject(new Error(j && j.error || String(r.status))); }); });
    });
  }

  /* ---------- enregistrement du combat ---------- */
  var REC = null, recTimer = 0, liveSent = 0, liveBlocked = false, liveBusy = false;
  function metaOf(fl) { return fl.map(function (f, i) { return { n: f.name || "Joueur", c: f.col || PAL[i % PAL.length], s: f.scol || "#d9dde3", mx: Math.round(f.maxHp || 750) }; }); }
  function sample() {
    var M = window.TrugoMatch; if (!REC || !M) return;
    var fl = M.fighters(), now = performance.now();
    if (fl.length !== REC.meta.length) return;
    var fr = [Math.round((now - REC.t0) / 100)];
    for (var i = 0; i < fl.length; i++) {
      var f = fl[i], on = f.alive !== false && !(f.mesh && f.mesh.visible === false);
      fr.push(Math.round(f.pos.x * 20), Math.round(f.pos.z * 20), Math.round((f.rotY || 0) * 20), on ? Math.max(0, Math.round(f.hp)) : -1, (now - (f.attackAnimAt || -1e9)) < 220 ? 1 : 0);
    }
    REC.frames.push(fr);
  }
  function pushLive() {
    if (!REC || liveBlocked || liveBusy) return;
    var n = REC.frames.length; if (n <= liveSent) return;
    var body = { frames: REC.frames.slice(liveSent, liveSent + 30) };
    if (liveSent === 0) { body.meta = REC.meta; body.mode = REC.mode; }
    var upto = liveSent + body.frames.length; liveBusy = true;
    call("/fight/live", body).then(function (r) { if (!r.ok) liveBlocked = true; else liveSent = upto; }).catch(function () { liveBlocked = true; }).then(function () { liveBusy = false; });
  }
  document.addEventListener("trugo:match-start", function (e) {
    var M = window.TrugoMatch; if (!M) return;
    clearInterval(recTimer);
    var fl = M.fighters();
    REC = { t0: performance.now(), meta: metaOf(fl), frames: [], mode: (e.detail && e.detail.mode) || "frappe", ranked: !!(e.detail && e.detail.ranked), at: Date.now() };
    liveSent = 0; liveBlocked = false; liveBusy = false;
    sample(); recTimer = setInterval(function () { if (!M.running()) return; sample(); }, 200);
    REC.liveT = setInterval(pushLive, 1000);
  });
  document.addEventListener("trugo:match-end", function () {
    var M = window.TrugoMatch; if (!REC) return;
    clearInterval(recTimer); clearInterval(REC.liveT);
    sample();
    var fl = (M && M.fighters()) || [], sorted = fl.slice().sort(function (a, b) { return (b.kills || 0) - (a.kills || 0); });
    var me = fl.filter(function (f) { return f.isPlayer; })[0];
    LAST = { meta: REC.meta, frames: REC.frames, mode: REC.mode, ranked: REC.ranked, at: REC.at, dur: REC.frames.length ? REC.frames[REC.frames.length - 1][0] / 10 : 0, kills: me ? me.kills || 0 : 0, rank: me ? sorted.indexOf(me) + 1 : 0 };
    if (!liveBlocked) call("/fight/live", { end: true }).catch(function () {});
    REC = null; saveLast();
  });
  function saveLast() {
    try { localStorage.setItem("trugo_replay", JSON.stringify(LAST)); }
    catch (e) { try { var l = JSON.parse(JSON.stringify(LAST)); l.frames = l.frames.filter(function (_, i) { return i % 2 === 0; }); localStorage.setItem("trugo_replay", JSON.stringify(l)); } catch (e2) {} }
  }
  try { LAST = JSON.parse(localStorage.getItem("trugo_replay") || "null"); if (LAST && (!LAST.frames || !LAST.frames.length)) LAST = null; } catch (e) { LAST = null; }

  /* ---------- lecteur ---------- */
  var P = null;
  function frameAt(fr, ds, hint) {
    var n = fr.length, i = Math.max(0, Math.min(hint || 0, n - 1));
    while (i > 0 && fr[i][0] > ds) i--;
    while (i < n - 1 && fr[i + 1][0] <= ds) i++;
    return i;
  }
  function stateOf(i, ds, out) {
    var fr = P.frames, a = fr[i], b = fr[Math.min(i + 1, fr.length - 1)], k = b[0] > a[0] ? Math.max(0, Math.min(1, (ds - a[0]) / (b[0] - a[0]))) : 0;
    var n = P.meta.length;
    for (var j = 0; j < n; j++) {
      var o = 1 + 5 * j, ax = a[o] / 20, az = a[o + 1] / 20, ar = a[o + 2] / 20, hp = a[o + 3], x = ax, z = az, r = ar;
      if (hp >= 0 && b[o + 3] >= 0 && Math.hypot(b[o] / 20 - ax, b[o + 1] / 20 - az) < 4) {
        x = ax + (b[o] / 20 - ax) * k; z = az + (b[o + 1] / 20 - az) * k;
        var d = b[o + 2] / 20 - ar; d = Math.atan2(Math.sin(d), Math.cos(d)); r = ar + d * k;
      }
      out[j] = { x: x, z: z, r: r, hp: hp, atk: a[o + 4] };
    }
    return out;
  }
  function stopPlayer() {
    if (!P) return;
    cancelAnimationFrame(P.raf); clearInterval(P.poll);
    var M = window.TrugoMatch; if (M && M.view) M.view.end();
    P.ov.remove(); document.body.classList.remove("rp-on");
    document.querySelectorAll(".screen.active").forEach(function (s) { s.classList.remove("active"); });
    if (P.prev) P.prev.classList.add("active");
    var cb = P.onClose; P = null;
    if (cb) try { cb(); } catch (e) {}
  }
  function openPlayer(o) {
    var M = window.TrugoMatch; if (!M || !M.view) { toast("Lance d'abord un combat pour activer les replays."); return false; }
    if (P) stopPlayer();
    var prev = document.querySelector(".screen.active"), scr = document.getElementById("screen-match");
    if (!scr) return false;
    document.querySelectorAll(".screen.active").forEach(function (s) { s.classList.remove("active"); });
    scr.classList.add("active"); document.body.classList.add("rp-on");
    try { window.dispatchEvent(new Event("resize")); } catch (e) {}
    if (!M.view.ensure()) { document.body.classList.remove("rp-on"); scr.classList.remove("active"); if (prev) prev.classList.add("active"); toast("Le rendu 3D n'est pas disponible."); return false; }
    var ov = el("div", "rp-ov");
    ov.innerHTML = '<div class="rp-top"><button class="rp-b" data-a="x" aria-label="Fermer">✕</button><div class="rp-title">' + esc(o.title || "Replay") + '</div>' + (o.live ? '<span class="rp-live">● LIVE</span>' : "") + "</div>" +
      '<div class="rp-cap" id="rp-cap"></div><div class="rp-msg" id="rp-msg"></div>' +
      '<div class="rp-bot"><div class="rp-line"><button class="rp-b" data-a="play" id="rp-play">⏸</button>' + (o.live ? '<div class="rp-grow"></div>' : '<input type="range" id="rp-seek" min="0" max="1000" value="0" class="rp-seek">') + '<span class="rp-time" id="rp-time">0:00</span></div>' +
      '<div class="rp-row">' + (o.live ? "" : '<div class="rp-speeds" id="rp-speeds">' + [0.5, 1, 2, 4].map(function (v) { return '<button data-sp="' + v + '"' + (v === 1 ? ' class="on"' : "") + ">" + v + "×</button>"; }).join("") + "</div>") +
      '<button class="rp-b wide" data-a="cam" id="rp-cam">👁 …</button>' + (o.clip ? '<button class="rp-b wide gold" data-a="clip">🎬 Clip 15 s</button>' : "") + "</div></div>";
    document.body.appendChild(ov);
    P = { ov: ov, prev: prev, meta: o.meta || [], frames: o.frames || [], mode: o.mode, live: !!o.live, t: 0, speed: 1, playing: true, cam: 0, last: performance.now(), idx: 0, out: [], caption: o.caption || "", loop: !!o.loop, onClose: o.onClose, canClip: !!o.clip, uid: o.uid, lastDs: -1, ended: false };
    if (P.caption) ov.querySelector("#rp-cap").textContent = P.caption;
    if (P.meta.length) M.view.begin(P.meta);
    if (P.live) { P.t = 0; P.started = false; ov.querySelector("#rp-msg").textContent = "Connexion au combat…"; pollLive(); P.poll = setInterval(pollLive, 1000); }
    ov.addEventListener("click", onClick);
    var sk = ov.querySelector("#rp-seek"); if (sk) sk.addEventListener("input", function () { P.t = (sk.value / 1000) * dur(); P.playing = false; ov.querySelector("#rp-play").textContent = "▶"; });
    P.raf = requestAnimationFrame(loop);
    updateCamBtn();
    return true;
  }
  function dur() { return P.frames.length ? P.frames[P.frames.length - 1][0] / 10 : 0; }
  function updateCamBtn() {
    var b = P && P.ov.querySelector("#rp-cam"); if (!b) return;
    b.textContent = P.cam < 0 ? "🗺️ Vue arène" : "👁 " + ((P.meta[P.cam] || {}).n || "?");
  }
  function pollLive() {
    if (!P || !P.live || P.ended) return;
    var q = P.lastDs >= 0 ? "?since=" + P.lastDs : "";
    call("/fight/live/" + encodeURIComponent(P.uid) + q).then(function (d) {
      if (!P || !P.live) return;
      if (d.ended) { P.ended = true; P.liveEnd = true; return; }
      if (d.meta && !P.meta.length) { P.meta = d.meta; var M = window.TrugoMatch; M.view.begin(P.meta); updateCamBtn(); }
      (d.frames || []).forEach(function (f) { if (f[0] > P.lastDs && f.length === 1 + 5 * P.meta.length) { P.frames.push(f); P.lastDs = f[0]; } });
      if (P.frames.length && !P.started) { P.started = true; P.t = Math.max(P.frames[0][0] / 10, P.lastDs / 10 - 1.6); var m = P.ov.querySelector("#rp-msg"); if (m) m.textContent = ""; }
    }).catch(function () {});
  }
  function onClick(e) {
    var t = e.target.closest("button"); if (!t || !P) return;
    if (t.dataset.sp) { P.speed = +t.dataset.sp; P.ov.querySelectorAll("#rp-speeds button").forEach(function (b) { b.classList.toggle("on", b === t); }); return; }
    var a = t.dataset.a;
    if (a === "x") return stopPlayer();
    if (a === "play") { if (!P.playing && !P.live && P.t >= dur() - 0.05) P.t = 0; P.playing = !P.playing; t.textContent = P.playing ? "⏸" : "▶"; }
    else if (a === "cam") { P.cam++; if (P.cam >= P.meta.length) P.cam = -1; updateCamBtn(); }
    else if (a === "clip") clipDialog();
  }
  function loop(now) {
    if (!P) return;
    P.raf = requestAnimationFrame(loop);
    var M = window.TrugoMatch, dt = Math.min(0.1, (now - P.last) / 1000); P.last = now;
    if (!P.frames.length) { M.render(now); return; }
    var end = dur();
    if (P.playing) P.t += dt * (P.live ? 1 : P.speed);
    if (P.live) {
      var lead = P.lastDs / 10;
      if (P.t > lead - 0.25) P.t = Math.max(P.frames[0][0] / 10, lead - 0.25);
      if (lead - P.t > 5) P.t = lead - 1.6;
      if (P.liveEnd && P.t >= lead - 0.3) { var m = P.ov.querySelector("#rp-msg"); if (m) m.textContent = "Le combat est terminé."; }
    } else if (P.t >= end) {
      if (P.loop) P.t = 0; else { P.t = end; if (P.playing) { P.playing = false; var pb = P.ov.querySelector("#rp-play"); if (pb) pb.textContent = "▶"; } }
    }
    var ds = P.t * 10; P.idx = frameAt(P.frames, ds, P.idx);
    var st = stateOf(P.idx, ds, P.out), vd = dt * (P.live ? 1 : P.speed);
    for (var i = 0; i < st.length; i++) {
      var s = st[i]; M.view.pose(i, s.x, s.z, s.r, s.hp, s.atk, vd, now);
      if (s.hp >= 0) { var pp = P.pose || (P.pose = []); pp[i] = { x: s.x, z: s.z, r: s.r }; }
    }
    if (P.cam >= 0 && P.pose && P.pose[P.cam]) {
      var c = P.pose[P.cam], bx = -Math.sin(c.r), bz = -Math.cos(c.r);
      M.setCamera(c.x + bx * 4.2, 2.6, c.z + bz * 4.2, c.x, 1.3, c.z);
    } else {
      var R = (M.radius || 15), a = now / 7000;
      M.setCamera(Math.cos(a) * R * 1.15, R * 0.7, Math.sin(a) * R * 1.15, 0, 1.2, 0);
    }
    M.render(now);
    var tm = P.ov.querySelector("#rp-time"); if (tm) tm.textContent = P.live ? "" : fmt(P.t) + " / " + fmt(end);
    var sk = P.ov.querySelector("#rp-seek"); if (sk && document.activeElement !== sk && end > 0) sk.value = Math.round(P.t / end * 1000);
  }

  /* ---------- clip 15 s + légende ---------- */
  function clipDialog() {
    if (!P || !P.canClip) return;
    var wasPlaying = P.playing; P.playing = false;
    var end = dur(), start = P.t; if (end - start < 3) start = Math.max(0, end - 15);
    var len = Math.min(15, end - start);
    var mo = el("div", "rp-modal");
    mo.innerHTML = '<div class="rp-box"><h3>Poster en story</h3><p>Extrait de <b>' + fmt(start) + "</b> à <b>" + fmt(start + len) + "</b> (" + Math.round(len) + ' s, 15 s maximum). Déplace la barre du replay avant de cliquer pour choisir le début.</p>' +
      '<input class="rp-in" id="rp-cap-in" maxlength="80" placeholder="Légende (facultatif)"><div class="rp-err" id="rp-err"></div><div class="rp-act"><button class="rp-b wide" data-m="no">Annuler</button><button class="rp-b wide gold" data-m="ok">Publier</button></div></div>';
    P.ov.appendChild(mo);
    mo.addEventListener("click", function (e) {
      var b = e.target.closest("[data-m]"); if (!b) return;
      if (b.dataset.m === "no") { mo.remove(); P.playing = wasPlaying; return; }
      var fr = P.frames.filter(function (f) { return f[0] >= start * 10 - 2 && f[0] <= (start + len) * 10; });
      if (fr.length < 2) { mo.querySelector("#rp-err").textContent = "Extrait trop court."; return; }
      b.disabled = true;
      call("/stories", { caption: mo.querySelector("#rp-cap-in").value, clip: { meta: P.meta, frames: fr, mode: P.mode } }).then(function () {
        mo.remove(); P.playing = wasPlaying; toast("Clip publié en story pour 24 h !");
      }).catch(function (er) { b.disabled = false; mo.querySelector("#rp-err").textContent = "Publication impossible : " + (er.message || ""); });
    });
  }

  /* ---------- API publique ---------- */
  window.TrugoReplay = {
    last: function () { return LAST ? { mode: LAST.mode, ranked: LAST.ranked, at: LAST.at, dur: LAST.dur, kills: LAST.kills, rank: LAST.rank, modeName: MODE[LAST.mode] || "Combat" } : null; },
    playLast: function (onClose) {
      if (!LAST) return toast("Aucun combat enregistré pour l'instant.");
      openPlayer({ title: "Replay · " + (MODE[LAST.mode] || "Combat"), meta: LAST.meta, frames: LAST.frames, mode: LAST.mode, clip: true, onClose: onClose });
    },
    playClip: function (sid, name, caption, onClose) {
      call("/stories/" + sid + "/clip").then(function (d) {
        openPlayer({ title: "Clip de " + name, meta: d.clip.meta, frames: d.clip.frames, mode: d.clip.mode, caption: caption, loop: true, onClose: onClose });
      }).catch(function () { toast("Clip introuvable."); if (onClose) onClose(); });
    },
    live: function () { return call("/fight/live").then(function (d) { return d.live || []; }); },
    watch: function (uid, name, onClose) {
      openPlayer({ title: "Combat de " + name, live: true, uid: uid, meta: [], frames: [], onClose: onClose });
    }
  };
})();
