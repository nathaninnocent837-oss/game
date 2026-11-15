/* TRUGO : présentation de match (5 s), cartes de combat, emotes en partie, tableau de fin à 2 colonnes */
(function () {
  "use strict";
  if (window.TrugoBattle) return;

  var DEF_EMOTES = ["😂", "😎", "🔥", "👏"];
  var POOL = ["😂", "😎", "🔥", "👏", "😡", "💀", "🤡", "👀", "😭", "🥶", "😈", "🤝", "💪", "🎉", "😴", "🤯", "❤️", "👑", "⚔️", "🛡️", "💥", "⚡", "🍀", "🦆", "🐺", "🐆", "👻", "🤖", "🙏", "👎", "👍", "😤", "🥵", "🤔", "😱", "🫡", "🎯", "💎", "🚀", "🍿"];
  var COLORS = ["#ffb648", "#ff4d5e", "#ff6ad5", "#b56bff", "#6a8bff", "#3dd9ff", "#35e0a0", "#7dff6a", "#ffe14d", "#ffffff", "#ff7a2b", "#8a96a8"];
  var BOT_BLUE = "#2f8cff";
  var API = null, state = { card: { mode: "color", color: "#ffb648", photo: "" }, emotes: DEF_EMOTES.slice() };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  /* ---------- API ---------- */
  function detectApi() {
    if (API) return Promise.resolve(API);
    var c = ["/api/groups", "/api/profile/groups"], i = 0;
    function next() {
      if (i >= c.length) return Promise.reject(new Error("api"));
      var base = c[i++];
      return fetch(base + "/battle/me", { credentials: "same-origin" }).then(function (r) { if (!r.ok) return next(); API = base; return API; }).catch(next);
    }
    return next();
  }
  function call(path, body) {
    return detectApi().then(function (b) {
      return fetch(b + path, { method: body ? "POST" : "GET", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(String(r.status))); });
    });
  }
  function apply(d) {
    if (!d) return;
    if (d.card) state.card = d.card;
    if (d.emotes && d.emotes.length === 4) state.emotes = d.emotes;
    try { localStorage.setItem("trugo_battle", JSON.stringify(state)); } catch (e) {}
    paintEmoteMenu();
  }
  try { apply(JSON.parse(localStorage.getItem("trugo_battle") || "null")); } catch (e) {}
  function refresh() { return call("/battle/me").then(apply).catch(function () {}); }
  setTimeout(refresh, 1500);

  /* ---------- carte de combat ---------- */
  function portrait(card, name, size) {
    var c = (card && card.color) || "#ffb648", init = esc(String(name || "?").charAt(0).toUpperCase());
    if (card && card.mode === "photo" && card.photo) return '<span class="bt-pt" style="width:' + size + "px;height:" + size + "px;background-image:url(" + card.photo + ')"></span>';
    return '<span class="bt-pt" style="width:' + size + "px;height:" + size + "px;background:linear-gradient(135deg," + c + ",color-mix(in srgb," + c + ' 35%,#05070c))"><b>' + init + "</b></span>";
  }
  function cardHtml(e, i) {
    var kind = e.kind, c = kind === "bot" ? BOT_BLUE : (e.card && e.card.color) || "#ffb648";
    var tag = kind === "me" ? "TOI" : kind === "ally" ? "ALLIÉ" : "BOT";
    return '<div class="bt-card ' + kind + '" style="--c:' + c + ";--d:" + (i * 0.11).toFixed(2) + 's">' + portrait(kind === "bot" ? { mode: "color", color: BOT_BLUE } : e.card, e.name, 46) +
      '<div class="bt-ci"><b>' + esc(e.name) + "</b><small>" + esc(e.sub || tag) + '</small></div><span class="bt-tag">' + tag + "</span></div>";
  }
  var cardCache = {}; // id -> carte (alliés)

  function fmt(s) { var m = Math.floor(s / 60), x = Math.max(0, Math.floor(s % 60)); return m + ":" + (x < 10 ? "0" : "") + x; }
  var MODES = {
    frappe: ["⚔️", "Frappe Dolling", "Un maximum d'éliminations avant la fin du chrono"],
    couronne: ["👑", "Couronne Hunter", "Garde la couronne 10 secondes pour gagner"],
    maxitrone: ["♜", "Maxitrone", "Pose ton trône et défends-le : le dernier survivant gagne"]
  };
  function ease(t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); }
  function lerp(a, b, k) { return a + (b - a) * k; }

  /* ---------- présentation 5 s ---------- */
  var intro = null;
  var TrugoIntro = {
    run: function (opts, go) {
      var M = window.TrugoMatch; if (!M || intro) return go();
      var DUR = 5000, dur = opts.duration || 240, md = MODES[opts.mode] || MODES.frappe, R = M.radius || 15;
      var timerEl = document.getElementById("match-timer");
      var ov = el("div", "bt-intro");
      ov.innerHTML = '<i class="bt-bar t"></i><i class="bt-bar b"></i>' +
        '<div class="bt-top"><div class="bt-clock" id="bt-clock">' + fmt(dur + 5) + '</div><div class="bt-mode"><span class="bt-mi">' + md[0] + '</span><h2>' + esc(md[1]) + "</h2><p>" + esc(md[2]) + '</p>' +
        '<div class="bt-chips"><span>🗺️ ARÈNE DE TRUGO</span>' + (opts.ranked ? '<span class="rk">🏆 CLASSÉ</span>' : "") + "</div></div></div>" +
        '<div class="bt-cards" id="bt-cards"></div><div class="bt-prog"><i></i></div>';
      document.body.appendChild(ov);
      var t0 = performance.now(), done = false, raf = 0, cardsBuilt = false;
      intro = ov;
      var shown = -1;
      function clock(sec) {
        var left = dur + 5 - sec; if (left === shown) return; shown = left;
        var t = fmt(left), c = document.getElementById("bt-clock"); if (c) c.textContent = t;
        if (timerEl) timerEl.textContent = t;
      }
      if (timerEl) timerEl.textContent = fmt(dur + 5);

      // composition de la partie : moi, alliés (équipe), bots
      var fighters = M.fighters() || [], roster = [], me = M.player && M.player();
      var team = null;
      function buildRoster() {
        var base = [];
        fighters.forEach(function (f) { if (f.isPlayer) base.push({ kind: "me", name: f.name, card: state.card, sub: "NIV. " + (M.level ? M.level() : 1) }); });
        var allies = [];
        if (team) team.forEach(function (m) { if (!m.me) allies.push({ kind: "ally", name: m.username, card: cardCache[m.id] || null, sub: "Allié" }); });
        var bots = fighters.filter(function (f) { return f.isBot; }).map(function (f) { return { kind: "bot", name: f.name, sub: "Robot" }; });
        var total = fighters.length || 12;
        roster = base.concat(allies).concat(bots).slice(0, total);
        return roster;
      }
      function showCards() {
        if (cardsBuilt) return; cardsBuilt = true;
        buildRoster();
        var h = roster.map(cardHtml).join("");
        var box = document.getElementById("bt-cards"); if (box) { box.innerHTML = h; box.classList.add("on"); }
        ov.classList.add("cards");
      }
      // équipe : récupère les cartes des alliés (facultatif)
      call("/team").then(function (d) {
        team = (d && d.team && d.team.members) || null;
        if (!team || team.length < 2) return;
        var ids = team.filter(function (m) { return !m.me; }).map(function (m) { return m.id; });
        return call("/battle/cards", { ids: ids }).then(function (r) { Object.keys(r.cards || {}).forEach(function (k) { cardCache[k] = r.cards[k]; }); });
      }).catch(function () {});

      function frame(now) {
        if (done) return;
        raf = requestAnimationFrame(frame);
        var t = (now - t0) / 1000, ang, r, y, lx = 0, ly = 1.5, lz = 0, px, py, pz;
        function pos(a, rr, yy) { return [Math.cos(a) * rr, yy, Math.sin(a) * rr]; }
        if (t < 1.7) {
          var p = pos(0.2 + t * 0.55, R * 1.15, R * 0.6); px = p[0]; py = p[1]; pz = p[2];
        } else if (t < 3.5) {
          var u = (t - 1.7) / 1.8, q = pos(2.4 + u * 1.2, R * (0.8 - u * 0.12), 5.5 - u * 1.2);
          px = q[0]; py = q[1]; pz = q[2]; ly = 2.2;
          if (t < 2.0) { var q0 = pos(0.2 + 1.7 * 0.55, R * 1.15, R * 0.6), k0 = ease((t - 1.7) / 0.3); px = lerp(q0[0], px, k0); py = lerp(q0[1], py, k0); pz = lerp(q0[2], pz, k0); }
        } else {
          var u2 = (t - 3.5) / 1.5, e = ease(u2), q2 = pos(2.4 + 1.2, R * 0.68, 4.3), f = M.followCamera();
          if (f) { px = lerp(q2[0], f.x, e); py = lerp(q2[1], f.y, e); pz = lerp(q2[2], f.z, e); lx = lerp(0, f.lx, e); ly = lerp(2.2, f.ly, e); lz = lerp(0, f.lz, e); }
          else { px = q2[0]; py = q2[1]; pz = q2[2]; }
        }
        M.setCamera(px, py, pz, lx, ly, lz); M.render(now);
        clock(Math.min(5, Math.floor(t)));
        var pg = ov.querySelector(".bt-prog i"); if (pg) pg.style.width = Math.min(100, t / 5 * 100) + "%";
        if (t >= 1.7) showCards();
      }
      raf = requestAnimationFrame(frame);
      function finish() {
        if (done) return; done = true; cancelAnimationFrame(raf);
        if (timerEl) timerEl.textContent = fmt(dur);
        ov.classList.add("out"); setTimeout(function () { ov.remove(); }, 400);
        intro = null; go();
      }
      setTimeout(finish, DUR);
    }
  };
  window.TrugoIntro = TrugoIntro;

  /* ---------- emotes ---------- */
  var layer = null, bubbles = [], bubRaf = 0, emoCd = 0;
  function ensureEmoteUi() {
    var scr = document.getElementById("screen-match"); if (!scr || document.getElementById("bt-emote")) return;
    var b = el("div", "bt-emote", '<button type="button" class="bt-eb" id="bt-eb" aria-label="Emotes">😀</button><div class="bt-em" id="bt-em"></div>');
    scr.appendChild(b); paintEmoteMenu();
    b.querySelector("#bt-eb").addEventListener("click", function () { b.classList.toggle("open"); });
    b.querySelector("#bt-em").addEventListener("click", function (e) {
      var x = e.target.closest("[data-e]"); if (!x) return;
      b.classList.remove("open");
      if (performance.now() < emoCd) return;
      emoCd = performance.now() + 2500; b.classList.add("cd"); setTimeout(function () { b.classList.remove("cd"); }, 2500);
      var M = window.TrugoMatch, p = M && M.player(); if (p && p.alive !== false) emote(p, x.dataset.e);
    });
  }
  function paintEmoteMenu() {
    var m = document.getElementById("bt-em"); if (!m) return;
    m.innerHTML = state.emotes.map(function (e, i) { return '<button type="button" data-e="' + esc(e) + '" style="--i:' + i + '">' + esc(e) + "</button>"; }).join("");
  }
  function emote(f, emoji) {
    var M = window.TrugoMatch; if (!M) return;
    if (!layer) { layer = el("div", "bt-bubbles"); document.body.appendChild(layer); }
    var n = el("div", "bt-bub" + (f.isPlayer ? " me" : f.isBot ? " bot" : ""), "<span>" + esc(emoji) + "</span>");
    layer.appendChild(n);
    bubbles.push({ f: f, n: n, until: performance.now() + 2800 });
    if (!bubRaf) bubRaf = requestAnimationFrame(bubLoop);
  }
  function bubLoop() {
    var M = window.TrugoMatch, now = performance.now();
    bubbles = bubbles.filter(function (b) {
      if (now > b.until || !M) { b.n.remove(); return false; }
      var p = M.project(b.f.pos.x, 3.1, b.f.pos.z);
      if (!p || !p.visible) b.n.style.opacity = 0;
      else { b.n.style.opacity = ""; b.n.style.transform = "translate(" + p.x.toFixed(0) + "px," + (p.y - (1 - Math.max(0, (b.until - now) / 2800)) * 26).toFixed(0) + "px) translate(-50%,-100%)"; }
      return true;
    });
    bubRaf = bubbles.length ? requestAnimationFrame(bubLoop) : 0;
  }
  document.addEventListener("trugo:match-start", function () { ensureEmoteUi(); var b = document.querySelector(".bt-emote"); if (b) b.classList.remove("open"); });
  // les robots réagissent de temps en temps
  setInterval(function () {
    var M = window.TrugoMatch; if (!M || !M.running()) return;
    if (Math.random() > 0.35) return;
    var bots = (M.fighters() || []).filter(function (f) { return f.isBot && f.alive; }); if (!bots.length) return;
    emote(bots[Math.floor(Math.random() * bots.length)], POOL[Math.floor(Math.random() * 12)]);
  }, 4000);

  /* ---------- tableau de fin : 2 colonnes ---------- */
  function restyleEnd() {
    var list = document.getElementById("end-leaderboard"); if (!list || list.dataset.bt === "1") return;
    var lis = Array.prototype.slice.call(list.children); if (!lis.length || lis[0].classList.contains("bt-er")) return;
    var M = window.TrugoMatch, fl = (M && M.fighters && M.fighters()) || [];
    list.dataset.bt = "1";
    var rows = lis.map(function (li, i) {
      var sp = li.querySelectorAll("span"), a = (sp[0] ? sp[0].textContent : li.textContent).trim(), b = sp[1] ? sp[1].textContent.trim() : "";
      var m = /^#?(\d+)\s+(.*)$/.exec(a), rank = m ? m[1] : String(i + 1), name = m ? m[2] : a;
      var f = fl.filter(function (x) { return x.name === name; })[0];
      var me = li.classList.contains("me") || (f && f.isPlayer), bot = f ? f.isBot : false, card = me ? state.card : null;
      if (f && f.isRemote) { var id = String(f.id || "").replace("remote_", ""); card = cardCache[id] || null; }
      var c = bot ? BOT_BLUE : (card && card.color) || (me ? "#ffb648" : "#8a96a8");
      var medal = rank === "1" ? "🥇" : rank === "2" ? "🥈" : rank === "3" ? "🥉" : "#" + rank;
      var cls = "bt-er" + (me ? " me" : "") + (bot ? " bot" : "") + (rank <= 3 ? " top" + rank : "");
      return '<li class="' + cls + '" style="--c:' + c + ";--d:" + (i * 0.06).toFixed(2) + 's"><span class="bt-rk">' + medal + "</span>" + portrait(bot ? { mode: "color", color: BOT_BLUE } : card || { mode: "color", color: c }, name, 34) +
        '<div class="bt-en"><b>' + esc(name) + (me ? ' <em>TOI</em>' : bot ? " <em>BOT</em>" : "") + "</b><small>" + esc(b) + "</small></div></li>";
    });
    list.innerHTML = rows.join("");
    list.classList.add("bt-grid");
    list.style.gridTemplateRows = "repeat(" + Math.ceil(rows.length / 2) + ", auto)";
    var card = document.querySelector("#screen-endmatch .end-card"); if (card) card.classList.add("bt-wide");
  }
  var endList = document.getElementById("end-leaderboard");
  if (endList) {
    new MutationObserver(function () {
      if (endList.dataset.bt === "1" && endList.children.length && !endList.children[0].classList.contains("bt-er")) endList.dataset.bt = "";
      if (endList.dataset.bt !== "1") setTimeout(restyleEnd, 0);
    }).observe(endList, { childList: true });
  }

  /* ---------- éditeur (profil) ---------- */
  function shrinkPhoto(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onerror = rej;
      fr.onload = function () {
        var img = new Image();
        img.onerror = rej;
        img.onload = function () {
          var out = null;
          [[192, 0.8], [160, 0.7], [128, 0.6], [96, 0.55]].some(function (s) {
            var c = document.createElement("canvas"); c.width = c.height = s[0];
            var g = c.getContext("2d"), m = Math.min(img.width, img.height), sx = (img.width - m) / 2, sy = (img.height - m) / 2;
            g.drawImage(img, sx, sy, m, m, 0, 0, s[0], s[0]);
            var d = c.toDataURL("image/jpeg", s[1]); if (d.length <= 46000) { out = d; return true; } return false;
          });
          out ? res(out) : rej(new Error("trop lourde"));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  function openEditor() {
    var old = document.getElementById("bt-editor"); if (old) old.remove();
    var card = JSON.parse(JSON.stringify(state.card)), emo = state.emotes.slice(), slot = 0;
    var ov = el("div", "bt-editor", ""); ov.id = "bt-editor";
    function paint() {
      var name = (document.querySelector(".gp-scard-n") || {}).textContent || (window.APP && window.APP.username) || "Toi";
      ov.innerHTML = '<div class="bt-ed"><h3>Carte de combat & emotes</h3>' +
        '<div class="bt-prev">' + cardHtml({ kind: "me", name: name, card: card, sub: "Aperçu de ta carte" }, 0).replace("--d:0.00s", "--d:0s") + "</div>" +
        '<div class="bt-seg"><button data-m="color" class="' + (card.mode !== "photo" ? "on" : "") + '">Couleur</button><button data-m="photo" class="' + (card.mode === "photo" ? "on" : "") + '">Photo</button></div>' +
        (card.mode === "photo"
          ? '<div class="bt-photo"><label class="bt-file">📷 Choisir une photo<input type="file" accept="image/*" id="bt-file" hidden></label><small>Recadrée en carré et réduite automatiquement.</small></div>'
          : '<div class="bt-sw">' + COLORS.map(function (c) { return '<button data-c="' + c + '" class="' + (card.color.toLowerCase() === c ? "on" : "") + '" style="--c:' + c + '"></button>'; }).join("") + '<label class="bt-cust" title="Couleur perso"><input type="color" id="bt-cc" value="' + card.color + '">+</label></div>') +
        '<h4>Mes 4 emotes</h4><div class="bt-slots">' + emo.map(function (e, i) { return '<button data-s="' + i + '" class="' + (i === slot ? "on" : "") + '">' + esc(e) + "</button>"; }).join("") + "</div>" +
        '<div class="bt-pal">' + POOL.map(function (e) { return '<button data-p="' + esc(e) + '">' + e + "</button>"; }).join("") + "</div>" +
        '<div class="bt-err" id="bt-err"></div><div class="bt-act"><button class="bt-b" data-a="no">Annuler</button><button class="bt-b gold" data-a="ok">Enregistrer</button></div></div>';
    }
    paint(); document.body.appendChild(ov);
    ov.addEventListener("click", function (e) {
      var t = e.target.closest("button"); if (!t) { if (e.target === ov) ov.remove(); return; }
      if (t.dataset.m) { card.mode = t.dataset.m; if (card.mode === "photo" && !card.photo) { /* attend le choix */ } paint(); }
      else if (t.dataset.c) { card.color = t.dataset.c; card.mode = "color"; paint(); }
      else if (t.dataset.s != null) { slot = +t.dataset.s; paint(); }
      else if (t.dataset.p) { emo[slot] = t.dataset.p; slot = (slot + 1) % 4; paint(); }
      else if (t.dataset.a === "no") ov.remove();
      else if (t.dataset.a === "ok") {
        if (card.mode === "photo" && !card.photo) { ov.querySelector("#bt-err").textContent = "Choisis d'abord une photo."; return; }
        t.disabled = true;
        call("/battle/me", { card: card, emotes: emo }).then(function (d) { apply(d); ov.remove(); toast("Carte de combat et emotes enregistrées !"); }).catch(function () { t.disabled = false; ov.querySelector("#bt-err").textContent = "Enregistrement impossible. Réessaie."; });
      }
    });
    ov.addEventListener("change", function (e) {
      if (e.target.id === "bt-file" && e.target.files[0]) {
        shrinkPhoto(e.target.files[0]).then(function (d) { card.photo = d; card.mode = "photo"; paint(); }).catch(function () { ov.querySelector("#bt-err").textContent = "Photo illisible ou trop lourde."; });
      }
      if (e.target.id === "bt-cc") { card.color = e.target.value; card.mode = "color"; var pv = ov.querySelector(".bt-prev"); paint(); }
    });
  }
  function toast(t) { var n = el("div", "bt-toast", esc(t)); document.body.appendChild(n); setTimeout(function () { n.classList.add("out"); setTimeout(function () { n.remove(); }, 300); }, 2200); }

  window.TrugoBattle = { openEditor: openEditor, state: function () { return state; }, emote: emote };
})();
