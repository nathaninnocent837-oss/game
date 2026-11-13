/* TRUGO - ranked.js : mode classe par saisons (30 jours) - ligues selon le total d'eliminations.
   Charge APRES game.js. Panneau neon, classement des joueurs, temps avant reset. */
(function () {
  "use strict";
  var LEAGUES = [
    { n: "Bronze", min: 0, c: "#d9893b" },
    { n: "Argent", min: 12, c: "#d4dde8" },
    { n: "Or", min: 40, c: "#ffc83d" },
    { n: "Diamant", min: 80, c: "#4cc9ff" },
    { n: "Platine", min: 120, c: "#4df0d8" },
    { n: "Maître", min: 200, c: "#b56bff" },
    { n: "Champion", min: 300, c: "#ff4d5e" },
    { n: "Élite", min: 450, c: "#ff8a2b" },
    { n: "Légende", min: 600, c: "#ff3fd0" },
    { n: "Ultime", min: 800, c: "#6dff6a" },
    { n: "Suprême", min: 1000, c: "#ffffff", rainbow: true }
  ];
  window.TRUGO_LEAGUES = LEAGUES;
  var API = null, LS = "trugo_rk";
  var st = { season: 1, endsAt: 0, offset: 0, elims: 0, pending: [], rank: null };
  var top = { players: [], counts: [], total: 0 }, cur = 0, tab = "league", panel = null, cdTimer = null, topTimer = null;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function leagueIdx(e) { var i = 0; for (var k = 0; k < LEAGUES.length; k++) if (e >= LEAGUES[k].min) i = k; return i; }
  function now() { return Date.now() + st.offset; }
  function load() { try { var o = JSON.parse(localStorage.getItem(LS) || "null"); if (o) { st.season = o.season || 1; st.endsAt = o.endsAt || 0; st.elims = o.elims || 0; st.pending = o.pending || []; } } catch (e) {} }
  function save() { try { localStorage.setItem(LS, JSON.stringify({ season: st.season, endsAt: st.endsAt, elims: st.elims, pending: st.pending })); } catch (e) {} }

  /* ----- API ----- */
  function detectApi() {
    if (API) return Promise.resolve(API);
    var c = ["/api/groups", "/api/profile/groups"], i = 0;
    return (function next() {
      if (i >= c.length) return Promise.reject(new Error("api"));
      var base = c[i++];
      return fetch(base + "/ranked/me", { credentials: "same-origin" }).then(function (r) { if (r.ok) { API = base; return API; } return next(); }).catch(next);
    })();
  }
  function call(path, body) {
    return detectApi().then(function () {
      return fetch(API + path, { method: body ? "POST" : "GET", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(String(r.status))); });
    });
  }
  function pendingSum() { return st.pending.reduce(function (a, p) { return a + p.kills; }, 0); }
  function applyServer(d) {
    if (!d) return;
    if (d.season) { st.season = d.season.id; st.endsAt = d.season.end; }
    if (d.now) st.offset = d.now - Date.now();
    st.elims = d.elims + pendingSum();
    if (d.rank) st.rank = d.rank;
    save(); syncGame(false); paintHud(); if (panel && panel.classList.contains("open")) paintMe();
  }
  function fetchMe() { return call("/ranked/me").then(applyServer).catch(function () {}); }
  var flushing = false;
  function flush() {
    if (flushing || !st.pending.length) return;
    flushing = true;
    var p = st.pending[0];
    call("/ranked/report", { kills: p.kills, mid: p.mid }).then(function (d) {
      st.pending.shift(); applyServer(d); flushing = false; if (st.pending.length) setTimeout(flush, 22000);
    }).catch(function () { flushing = false; setTimeout(flush, 30000); });
  }
  function fetchTop() {
    return call("/ranked/top").then(function (d) {
      top = d; if (d.season) { st.endsAt = d.season.end; st.offset = d.now - Date.now(); }
      if (panel && panel.classList.contains("open")) { paintCards(); paintPlayers(); paintTimer(); }
    }).catch(function () {});
  }

  /* ----- lien avec le jeu ----- */
  function syncGame(silent) {
    var idx = leagueIdx(st.elims);
    try {
      if (typeof APP !== "undefined" && APP.league !== idx) {
        APP.league = idx; Store.save("trugo_league", idx);
        if (typeof updateLeagueUI === "function") updateLeagueUI();
      }
    } catch (e) {}
  }
  // appele par game.js a la fin d'une partie classee
  function addMatch(kills) {
    kills = Math.max(0, Math.floor(Number(kills) || 0));
    if (st.endsAt && now() > st.endsAt) { st.elims = 0; st.pending = []; st.endsAt = 0; }   // nouvelle saison
    var prev = leagueIdx(st.elims);
    st.elims += kills;
    st.pending.push({ mid: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), kills: kills });
    save(); syncGame(true); paintHud(); flush();
    return { prev: prev, index: leagueIdx(st.elims), total: st.elims, gained: kills };
  }
  window.RankedSeason = { addMatch: addMatch, leagues: LEAGUES, leagueIndex: leagueIdx, state: st, refresh: fetchMe };

  /* ----- embleme SVG neon (de plus en plus riche) ----- */
  var uidN = 0;
  function emblem(i, c, size) {
    var u = "rk" + (++uidN), r = LEAGUES[i].rainbow;
    var g = '<defs><linearGradient id="' + u + 'a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c + '" stop-opacity=".95"/><stop offset="1" stop-color="#0a0c14"/></linearGradient>' +
      '<linearGradient id="' + u + 'b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="' + c + '"/><stop offset="1" stop-color="#fff" stop-opacity=".4"/></linearGradient></defs>';
    var s = "";
    if (i >= 8) { var rays = ""; for (var k = 0; k < 14; k++) rays += '<line x1="60" y1="70" x2="' + (60 + 66 * Math.cos(k * Math.PI / 7)).toFixed(1) + '" y2="' + (70 + 66 * Math.sin(k * Math.PI / 7)).toFixed(1) + '"/>'; s += '<g class="rk-rays" stroke="' + c + '" stroke-width="1.4" opacity=".55">' + rays + "</g>"; }
    if (i >= 6) s += '<circle class="rk-ring" cx="60" cy="70" r="57" fill="none" stroke="' + c + '" stroke-width="1.6" stroke-dasharray="3 5" opacity=".8"/>';
    if (i >= 2) s += '<g fill="' + c + '" opacity=".9"><path d="M20 52 Q-4 46 6 18 Q24 30 34 48Z"/><path d="M100 52 Q124 46 114 18 Q96 30 86 48Z"/></g>';
    if (i >= 5) s += '<g fill="' + c + '" opacity=".6"><path d="M18 74 Q-6 74 0 46 Q18 54 30 68Z"/><path d="M102 74 Q126 74 120 46 Q102 54 90 68Z"/></g>';
    s += '<path d="M60 8 L108 26 V70 C108 100 86 122 60 134 C34 122 12 100 12 70 V26 Z" fill="url(#' + u + 'a)" stroke="' + c + '" stroke-width="3.2" stroke-linejoin="round"/>';
    s += '<path d="M60 17 L99 31 V69 C99 94 80 113 60 124 C40 113 21 94 21 69 V31 Z" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.2"/>';
    s += '<path d="M60 38 L84 70 L60 106 L36 70Z" fill="url(#' + u + 'b)" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>';
    s += '<path d="M60 38 L60 106 M36 70 L84 70 M60 38 L48 70 L60 106 M60 38 L72 70 L60 106" stroke="rgba(10,12,20,.35)" stroke-width="1" fill="none"/>';
    if (i >= 4) s += '<path d="M40 14 L46 2 L53 11 L60 -2 L67 11 L74 2 L80 14Z" fill="' + c + '" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>';
    var n = Math.min(5, Math.floor(i / 2));
    for (var q = 0; q < n; q++) s += '<circle cx="' + (60 + (q - (n - 1) / 2) * 11).toFixed(1) + '" cy="116" r="3.2" fill="#fff"/>';
    return '<svg class="rk-emb' + (r ? " rainbow" : "") + '" viewBox="-8 -6 136 150" width="' + size + '" height="' + (size * 1.1) + '" aria-hidden="true">' + g + s + "</svg>";
  }

  /* ----- panneau ----- */
  function fmtCd(ms) {
    if (ms <= 0) return "Nouvelle saison !";
    var s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return d + "j " + String(h).padStart(2, "0") + "h " + String(m).padStart(2, "0") + "m " + String(x).padStart(2, "0") + "s";
  }
  function paintTimer() {
    var cd = panel.querySelector("#rk-cd"), se = panel.querySelector("#rk-season");
    if (cd) cd.textContent = st.endsAt ? fmtCd(st.endsAt - now()) : "—";
    if (se) se.textContent = "Saison " + st.season;
  }
  function paintMe() {
    var i = leagueIdx(st.elims), L = LEAGUES[i], nx = LEAGUES[i + 1];
    var box = panel.querySelector("#rk-me");
    box.style.setProperty("--c", L.c);
    var pct = nx ? Math.max(0, Math.min(100, (st.elims - L.min) / (nx.min - L.min) * 100)) : 100;
    var name = "";
    try { name = (typeof APP !== "undefined" && APP.username) || "Toi"; } catch (e) {}
    box.innerHTML = '<div class="rk-me-emb">' + emblem(i, L.c, 78) + '</div><div class="rk-me-i"><small>' + esc(name) + '</small><b class="rk-neon">' + esc(L.n) + "</b>" +
      '<span class="rk-me-n"><strong>' + st.elims + "</strong> élimination" + (st.elims > 1 ? "s" : "") + " cette saison" + (st.rank ? " · #" + st.rank : "") + "</span>" +
      '<div class="rk-bar"><i style="width:' + pct + '%"></i></div>' +
      '<span class="rk-next">' + (nx ? "Encore <b>" + (nx.min - st.elims) + "</b> pour " + esc(nx.n) : "Ligue maximale atteinte !") + "</span></div>";
    var play = panel.querySelector(".rk-play"); play.style.setProperty("--c", L.c);
  }
  function paintCards() {
    var track = panel.querySelector(".rk-track"), my = leagueIdx(st.elims);
    if (!track.children.length) {
      track.innerHTML = '<span class="rk-pad"></span>' + LEAGUES.map(function (L, i) {
        return '<div class="rk-card lv' + i + (L.rainbow ? " rainbow" : "") + '" data-i="' + i + '" style="--c:' + L.c + ';--lv:' + i + ';--g:' + (6 + i * 5) + 'px">' +
          '<div class="rk-card-in"><span class="rk-tag"></span>' + emblem(i, L.c, 128) + '<h3 class="rk-neon">' + esc(L.n) + '</h3><p class="rk-req"></p><p class="rk-cnt"></p></div>' +
          (i >= 8 ? '<i class="rk-sp s1"></i><i class="rk-sp s2"></i><i class="rk-sp s3"></i>' : "") + "</div>";
      }).join("") + '<span class="rk-pad"></span>';
    }
    Array.prototype.forEach.call(track.querySelectorAll(".rk-card"), function (el, i) {
      var L = LEAGUES[i], nx = LEAGUES[i + 1];
      el.classList.toggle("mine", i === my); el.classList.toggle("locked", i > my); el.classList.toggle("done", i < my);
      el.querySelector(".rk-tag").textContent = i === my ? "TA LIGUE" : (i < my ? "✓ ATTEINTE" : "🔒 VERROUILLÉE");
      el.querySelector(".rk-req").textContent = i === 0 ? "Départ de saison" : L.min + " éliminations";
      var c = top.counts && top.counts[i];
      el.querySelector(".rk-cnt").textContent = (i > my ? "Encore " + (L.min - st.elims) + " élim. · " : "") + (c == null ? "" : c + " joueur" + (c > 1 ? "s" : ""));
    });
    var dots = panel.querySelector(".rk-dots");
    if (!dots.children.length) dots.innerHTML = LEAGUES.map(function (L, i) { return '<i data-i="' + i + '" style="--c:' + L.c + '"></i>'; }).join("");
    onScroll();
  }
  function onScroll() {
    var track = panel.querySelector(".rk-track"), cards = track.querySelectorAll(".rk-card"); if (!cards.length) return;
    var mid = track.scrollLeft + track.clientWidth / 2, best = 0, bd = 1e9;
    Array.prototype.forEach.call(cards, function (el, i) {
      var cx = el.offsetLeft + el.offsetWidth / 2, d = Math.abs(cx - mid), k = Math.min(1, d / (el.offsetWidth * 1.25));
      el.style.transform = "scale(" + (1 - 0.2 * k).toFixed(3) + ")"; el.style.opacity = (1 - 0.5 * k).toFixed(3);
      if (d < bd) { bd = d; best = i; }
    });
    if (best !== cur) { cur = best; paintDots(); paintPlayers(); }
  }
  function paintDots() { Array.prototype.forEach.call(panel.querySelectorAll(".rk-dots i"), function (d, i) { d.classList.toggle("on", i === cur); }); var h = panel.querySelector("#rk-lgname"); if (h) { h.textContent = LEAGUES[cur].n; h.style.setProperty("--c", LEAGUES[cur].c); } }
  function scrollTo(i, smooth) {
    var track = panel.querySelector(".rk-track"), el = track.querySelectorAll(".rk-card")[Math.max(0, Math.min(LEAGUES.length - 1, i))]; if (!el) return;
    track.scrollTo({ left: el.offsetLeft + el.offsetWidth / 2 - track.clientWidth / 2, behavior: smooth ? "smooth" : "auto" });
  }
  function paintPlayers() {
    var box = panel.querySelector("#rk-list"), list = top.players || [];
    if (tab === "league") list = list.filter(function (p) { return p.league === cur; });
    panel.querySelector("#rk-lgcount").textContent = list.length + (tab === "league" ? " dans cette ligue" : " joueurs");
    Array.prototype.forEach.call(panel.querySelectorAll(".rk-tab"), function (t) { t.classList.toggle("on", t.dataset.t === tab); });
    if (!list.length) { box.innerHTML = '<p class="rk-empty">' + (tab === "league" ? "Personne dans cette ligue pour l'instant." : "Aucun joueur classé pour le moment.") + "</p>"; return; }
    box.innerHTML = list.slice(0, 100).map(function (p) {
      var L = LEAGUES[p.league] || LEAGUES[0];
      var av = '<span class="rk-av" style="--c:' + L.c + '">' + esc((p.username || "?").charAt(0).toUpperCase()) + (p.av ? '<img alt="" src="' + API + "/avatar/" + encodeURIComponent(p.id) + "?v=" + p.av + '" onerror="this.remove()">' : "") + (p.online ? '<i class="on"></i>' : "") + "</span>";
      return '<div class="rk-row' + (p.me ? " me" : "") + '" style="--c:' + L.c + '"><span class="rk-pos">#' + p.rank + "</span>" + av + '<span class="rk-nm">' + esc(p.username) + (p.me ? " (toi)" : "") + '</span><span class="rk-chip">' + esc(L.n) + '</span><span class="rk-el">' + p.elims + "</span></div>";
    }).join("");
  }
  function build() {
    panel = document.createElement("div"); panel.id = "rk-panel"; panel.className = "rk";
    panel.innerHTML = '<div class="rk-bg"></div><div class="rk-sheet" role="dialog" aria-label="Classé">' +
      '<header class="rk-head"><div><h2>CLASSÉ</h2><span id="rk-season" class="rk-season"></span></div><div class="rk-timer"><small>Reset dans</small><b id="rk-cd"></b></div><button class="rk-x" aria-label="Fermer">×</button></header>' +
      '<section id="rk-me" class="rk-me"></section>' +
      '<section class="rk-car"><div class="rk-cap"><b id="rk-lgname" class="rk-neon"></b><small>Fais défiler de droite à gauche</small></div>' +
      '<button class="rk-arr l" aria-label="Ligue précédente">‹</button><div class="rk-track" tabindex="0"></div><button class="rk-arr r" aria-label="Ligue suivante">›</button><div class="rk-dots"></div></section>' +
      '<button class="rk-play"><span>JOUER</span><small>Partie classée · Frappe Dolling</small></button>' +
      '<section class="rk-pl"><div class="rk-pl-h"><div class="rk-tabs"><button class="rk-tab on" data-t="league">Cette ligue</button><button class="rk-tab" data-t="all">Tous</button></div><small id="rk-lgcount"></small></div><div id="rk-list" class="rk-list"></div></section></div>';
    document.body.appendChild(panel);
    var track = panel.querySelector(".rk-track"), raf = 0;
    track.addEventListener("scroll", function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(onScroll); }, { passive: true });
    panel.querySelector(".rk-arr.l").addEventListener("click", function () { scrollTo(cur - 1, true); });
    panel.querySelector(".rk-arr.r").addEventListener("click", function () { scrollTo(cur + 1, true); });
    track.addEventListener("click", function (e) { var c = e.target.closest(".rk-card"); if (c && +c.dataset.i !== cur && !dragMoved) scrollTo(+c.dataset.i, true); });
    panel.querySelector(".rk-dots").addEventListener("click", function (e) { var d = e.target.closest("i"); if (d) scrollTo(+d.dataset.i, true); });
    track.addEventListener("keydown", function (e) { if (e.key === "ArrowRight") { e.preventDefault(); scrollTo(cur + 1, true); } else if (e.key === "ArrowLeft") { e.preventDefault(); scrollTo(cur - 1, true); } });
    // glisser a la souris (sur telephone, le defilement tactile natif s'en charge)
    var dragMoved = false, dr = null;
    track.addEventListener("pointerdown", function (e) { if (e.pointerType !== "mouse") return; dr = { x: e.clientX, l: track.scrollLeft }; dragMoved = false; track.classList.add("drag"); track.setPointerCapture(e.pointerId); });
    track.addEventListener("pointermove", function (e) { if (!dr) return; var dx = e.clientX - dr.x; if (Math.abs(dx) > 4) dragMoved = true; track.scrollLeft = dr.l - dx; });
    function endDrag() { if (!dr) return; dr = null; track.classList.remove("drag"); if (dragMoved) { var t = track; var m = t.scrollLeft + t.clientWidth / 2, b = 0, bd = 1e9; Array.prototype.forEach.call(t.querySelectorAll(".rk-card"), function (el, i) { var d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - m); if (d < bd) { bd = d; b = i; } }); scrollTo(b, true); setTimeout(function () { dragMoved = false; }, 50); } }
    track.addEventListener("pointerup", endDrag); track.addEventListener("pointercancel", endDrag);
    panel.querySelector(".rk-x").addEventListener("click", closePanel);
    panel.querySelector(".rk-bg").addEventListener("click", closePanel);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && panel.classList.contains("open")) closePanel(); });
    panel.querySelectorAll(".rk-tab").forEach(function (t) { t.addEventListener("click", function () { tab = t.dataset.t; paintPlayers(); }); });
    panel.querySelector(".rk-play").addEventListener("click", function () {
      var b = document.getElementById("btn-ranked"); if (!b) return;
      closePanel(); window.__rkGo = true;
      try { b.click(); } finally { window.__rkGo = false; }
    });
  }
  function openPanel() {
    if (!panel) build();
    paintMe(); paintCards(); paintTimer(); paintDots(); paintPlayers();
    panel.classList.add("open"); document.body.classList.add("rk-lock");
    cur = leagueIdx(st.elims); requestAnimationFrame(function () { scrollTo(cur, false); onScroll(); paintDots(); paintPlayers(); });
    fetchMe(); fetchTop();
    clearInterval(cdTimer); cdTimer = setInterval(paintTimer, 1000);
    clearInterval(topTimer); topTimer = setInterval(function () { fetchTop(); fetchMe(); }, 30000);
  }
  function closePanel() { if (!panel) return; panel.classList.remove("open"); document.body.classList.remove("rk-lock"); clearInterval(cdTimer); clearInterval(topTimer); }

  /* ----- bouton CLASSE du lobby ----- */
  function paintHud() {
    var b = document.getElementById("btn-ranked"); if (!b) return;
    var i = leagueIdx(st.elims), L = LEAGUES[i];
    b.classList.add("rk-hud"); b.style.setProperty("--c", L.c); b.style.setProperty("--lv", i);
    var sig = i + ":" + st.elims; if (b._sig === sig) return; b._sig = sig;
    b.innerHTML = '<span class="rk-hud-ic">🏆</span><span class="rk-hud-t"><b>CLASSÉ</b><small>' + esc(L.n) + " · " + st.elims + " élim.</small></span>";
  }
  // Un vrai clic (ou celui du Center) ouvre le panneau ; seul le bouton JOUER du panneau et le lancement d'equipe lancent la partie.
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest("#btn-ranked"); if (!b) return;
    if (window.__rkGo || window.__trugoTeamLaunch) return;
    e.preventDefault(); e.stopImmediatePropagation(); openPanel();
  }, true);

  load();
  function init() { paintHud(); syncGame(true); setTimeout(function () { fetchMe().then(function () { flush(); }); }, 1200); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
