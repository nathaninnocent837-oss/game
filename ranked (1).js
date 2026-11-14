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
  var SUP = [ {n:"Suprême",c:"#ffffff",rb:1},{n:"Suprême 1",c:"#ff6ad5"},{n:"Suprême 2",c:"#ff4d8d"},{n:"Suprême 3",c:"#ff3b3b"},{n:"Suprême 4",c:"#ff9a1f"},{n:"Suprême 5",c:"#ffe14d"},{n:"Grand Suprême",c:"#7dffb2"},{n:"Maître Suprême",c:"#3dd9ff"},{n:"Champion Suprême",c:"#7d8bff"},{n:"Titan Suprême",c:"#c46bff"},{n:"Suprématie",c:"#ffd34d",rb:1} ];
  window.TRUGO_SUPREME = SUP;
  var supD = null, mode = "season", supSeen = 0;
  var st = { sup: null, season: 1, endsAt: 0, offset: 0, elims: 0, pending: [], rank: null };
  var top = { players: [], counts: [], total: 0 }, cur = 0, tab = "league", panel = null, cdTimer = null, topTimer = null;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function leagueIdx(e) { var i = 0; for (var k = 0; k < LEAGUES.length; k++) if (e >= LEAGUES[k].min) i = k; return i; }
  function now() { return Date.now() + st.offset; }
  function load() { try { var o = JSON.parse(localStorage.getItem(LS) || "null"); if (o) { st.sup = o.sup == null ? null : o.sup; supSeen = o.supSeen || 0; st.season = o.season || 1; st.endsAt = o.endsAt || 0; st.elims = o.elims || 0; st.pending = o.pending || []; } } catch (e) {} }
  function save() { try { localStorage.setItem(LS, JSON.stringify({ sup: st.sup, supSeen: supSeen, season: st.season, endsAt: st.endsAt, elims: st.elims, pending: st.pending })); } catch (e) {} }

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
    if (d.sup !== undefined) { var was = st.sup; st.sup = d.sup; if (was == null && d.sup != null && panel) paintMode(); }
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
  function emblem(i, c, size, rb) {
    var u = "rk" + (++uidN), r = rb !== undefined ? rb : LEAGUES[i].rainbow;
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


  /* ----- ligues apres Supreme : arene 2 h vs 9 bots, puis 1000 kills / palier ----- */
  function fetchSup() {
    return call("/ranked/supreme").then(function (d) {
      supD = d; d.at = Date.now() - 0; d.off = d.now - Date.now();
      if (d.unlocked) { st.sup = d.level; save(); paintHud(); }
      if (panel) { paintMode(); if (mode === "sup") paintSup(); }
      if (d.phase === "arena" && d.cycle && d.cycle.end + d.off - Date.now() < 0) setTimeout(fetchSup, 2500);
    }).catch(function () {});
  }
  function supNow() { return Date.now() + (supD ? supD.off : 0); }
  function paintMode() {
    var bar = panel.querySelector("#rk-mode"); if (!bar) return;
    var un = st.sup != null || (supD && supD.unlocked);
    bar.hidden = !un;
    if (!un && mode === "sup") setMode("season");
    if (un) { var b = bar.querySelector('[data-m="sup"]'); b.style.setProperty("--c", SUP[Math.max(0, st.sup || 0)].c); }
  }
  function setMode(m) {
    mode = m; if (!panel) return;
    panel.classList.toggle("sup-mode", m === "sup");
    Array.prototype.forEach.call(panel.querySelectorAll(".rk-m"), function (b) { b.classList.toggle("on", b.dataset.m === m); });
    if (m === "sup") { paintSup(); fetchSup(); } else { paintTimer(); requestAnimationFrame(function () { scrollTo(cur, false); }); }
    paintTimer();
  }
  function supLadder(lv) {
    return '<div class="sp-ladder">' + SUP.map(function (L, i) {
      return '<span class="sp-step' + (i < lv ? " done" : i === lv ? " cur" : "") + (L.rb ? " rb" : "") + '" style="--c:' + L.c + '"><i><b>' + (i === 0 ? "S" : i <= 5 ? "S" + i : L.n.split(" ")[0].charAt(0) + (i === 10 ? "★" : "")) + "</b></i><small>" + esc(L.n) + "</small></span>";
    }).join("") + "</div>";
  }
  function paintSup() {
    var box = panel.querySelector("#rk-sup"); if (!box) return;
    var d = supD;
    if (!d || !d.unlocked) { box.innerHTML = '<p class="sp-empty">Chargement de ta ligue suprême…</p>'; return; }
    var lv = d.level, L = SUP[lv], h = "";
    box.style.setProperty("--c", L.c);
    h += '<div class="sp-hero' + (L.rb ? " rb" : "") + ' lv' + lv + '">' + '<div class="sp-emb">' + emblem(10, L.c, 118, !!L.rb) + '</div><div class="sp-hi"><small>Ma ligue suprême</small><b class="rk-neon">' + esc(L.n) + "</b>" +
      '<span>' + (d.next ? "Prochaine ligue : <strong>" + esc(d.next) + "</strong>" : "Sommet atteint : tu es la <strong>Suprématie</strong> !") + "</span></div></div>";
    if (d.result && d.result.at > supSeen) {
      var R = d.result, to = SUP[R.to] || L;
      h += '<div class="sp-res ' + (R.won ? "win" : "lose") + '" style="--c:' + to.c + '"><b>' + (R.won ? "PROMOTION → " + esc(to.n) : (R.to < R.from ? "DESCENTE → " + esc(to.n) : "Tu restes en " + esc(to.n))) + "</b><small>" +
        (R.grind ? "1000 kills atteints !" : (R.won ? "Tu as fini 1er de l'arène avec " + R.kills + " kills (meilleur bot : " + R.best + ")." : "Tu n'as pas fini 1er (" + R.kills + " kills contre " + R.best + " pour le meilleur bot).")) + '</small><button class="sp-ok">OK</button></div>';
    }
    h += supLadder(lv);
    if (d.phase === "arena") {
      var left = d.cycle.end + d.off - Date.now();
      h += '<section class="sp-arena"><div class="sp-ah"><div><small>Arène vers</small><b>' + esc(d.next) + '</b></div><div class="sp-cd"><small>Fin de l\'arène</small><b id="sp-cd">' + fmtHms(left) + "</b></div></div>" +
        '<p class="sp-rule">Finis <strong>1er sur 10</strong> (toi + 9 bots) à la fin des 2 h pour monter. Sinon tu perds une ligue. Les bots font jusqu\'à <strong>' + d.botRate + " kills/min</strong>.</p>" +
        '<div class="sp-status ' + (d.lead ? "ok" : "no") + '">' + (d.lead ? "👑 Tu es 1er ! Garde l'avance." : "Il te manque <b>" + d.missing + "</b> kill" + (d.missing > 1 ? "s" : "") + " pour passer 1er") + "</div>" +
        '<ol class="sp-board">' + d.board.map(function (b) {
          var pct = d.board[0].kills ? Math.max(3, b.kills / Math.max(1, d.board[0].kills) * 100) : 3;
          return '<li class="' + (b.me ? "me" : "") + (b.rank === 1 ? " first" : "") + '"><span class="sp-r">' + (b.rank === 1 ? "👑" : b.rank) + '</span><span class="sp-n">' + (b.bot ? "🤖 " : "") + esc(b.name) + (b.me ? " (toi)" : "") + '</span><span class="sp-bar"><i style="width:' + pct + '%"></i></span><span class="sp-k">' + b.kills + "</span></li>";
        }).join("") + "</ol></section>";
    } else if (d.phase === "grind") {
      var p = Math.min(100, d.levelKills / d.goal * 100);
      h += '<section class="sp-arena"><div class="sp-ah"><div><small>Objectif</small><b>' + esc(d.next) + '</b></div><div class="sp-cd"><small>Kills</small><b>' + d.levelKills + " / " + d.goal + "</b></div></div>" +
        '<p class="sp-rule">À partir de Suprême 5, il faut <strong>1000 kills</strong> pour grimper à chaque ligue.</p><div class="rk-bar sp-gbar"><i style="width:' + p + '%"></i></div><span class="rk-next">Encore <b>' + (d.goal - d.levelKills) + "</b> kills pour " + esc(d.next) + "</span></section>";
    } else {
      h += '<section class="sp-arena"><p class="sp-rule sp-max">🏆 Tu as atteint la ligue maximale. Respect, Suprématie !</p></section>';
    }
    box.innerHTML = h;
    var ok = box.querySelector(".sp-ok"); if (ok) ok.addEventListener("click", function () { supSeen = d.result.at; save(); paintSup(); });
    var pl = panel.querySelector(".rk-play"); if (pl) pl.style.setProperty("--c", L.c);
  }
  function fmtHms(ms) { if (ms < 0) ms = 0; var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + "h " : "") + String(m).padStart(2, "0") + "m " + String(x).padStart(2, "0") + "s"; }
  function tickSup() {
    if (mode !== "sup" || !supD || !panel) return;
    var e = panel.querySelector("#sp-cd"), cd = panel.querySelector("#rk-cd");
    if (supD.phase === "arena") { var left = supD.cycle.end + supD.off - Date.now(); if (e) e.textContent = fmtHms(left); if (cd) cd.textContent = fmtHms(left); if (left <= 0 && !supD._rf) { supD._rf = 1; setTimeout(fetchSup, 1500); } }
  }

  /* ----- panneau ----- */
  function fmtCd(ms) {
    if (ms <= 0) return "Nouvelle saison !";
    var s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return d + "j " + String(h).padStart(2, "0") + "h " + String(m).padStart(2, "0") + "m " + String(x).padStart(2, "0") + "s";
  }
  function paintTimer() {
    var lb = panel.querySelector(".rk-timer small");
    if (mode === "sup") { if (lb) lb.textContent = supD && supD.phase === "arena" ? "Fin de l'arène" : "Ligue suprême"; if (supD && supD.phase !== "arena") { var c2 = panel.querySelector("#rk-cd"); if (c2) c2.textContent = supD.phase === "max" ? "MAX" : "1000 kills"; } tickSup(); return; }
    if (lb) lb.textContent = "Reset dans";
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
      '<nav id="rk-mode" class="rk-modes" hidden><button class="rk-m on" data-m="season">Saison</button><button class="rk-m" data-m="sup">★ Ma ligue suprême</button></nav><section id="rk-sup" class="rk-sup"></section>' +
      '<section id="rk-me" class="rk-me"></section>' +
      '<section class="rk-car"><div class="rk-cap"><b id="rk-lgname" class="rk-neon"></b><small>Fais défiler de droite à gauche</small></div>' +
      '<button class="rk-arr l" aria-label="Ligue précédente">‹</button><div class="rk-track" tabindex="0"></div><button class="rk-arr r" aria-label="Ligue suivante">›</button><div class="rk-dots"></div></section>' +
      '<button class="rk-play"><span>JOUER</span><small>Partie classée · Frappe Dolling</small></button>' +
      '<section class="rk-pl"><div class="rk-pl-h"><div class="rk-tabs"><button class="rk-tab on" data-t="league">Cette ligue</button><button class="rk-tab" data-t="all">Tous</button></div><small id="rk-lgcount"></small></div><div id="rk-list" class="rk-list"></div></section></div>';
    document.body.appendChild(panel);
    panel.querySelectorAll(".rk-m").forEach(function (b) { b.addEventListener("click", function () { setMode(b.dataset.m); }); });
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
    mode = "season"; panel.classList.remove("sup-mode"); Array.prototype.forEach.call(panel.querySelectorAll(".rk-m"), function (b) { b.classList.toggle("on", b.dataset.m === "season"); }); paintMode();
    fetchMe(); fetchTop(); fetchSup();
    clearInterval(cdTimer); cdTimer = setInterval(paintTimer, 1000);
    clearInterval(topTimer); topTimer = setInterval(function () { fetchTop(); fetchMe(); if (mode === "sup" || st.sup != null) fetchSup(); }, st.sup != null ? 15000 : 30000);
  }
  function closePanel() { if (!panel) return; panel.classList.remove("open"); document.body.classList.remove("rk-lock"); clearInterval(cdTimer); clearInterval(topTimer); }

  /* ----- bouton CLASSE du lobby ----- */
  function paintHud() {
    var b = document.getElementById("btn-ranked"); if (!b) return;
    var i = leagueIdx(st.elims), L = LEAGUES[i], sp = st.sup != null ? SUP[st.sup] : null; if (sp) { L = { n: sp.n, c: sp.c }; i = 10; }
    b.classList.add("rk-hud"); b.style.setProperty("--c", L.c); b.style.setProperty("--lv", i);
    var sig = i + ":" + st.elims + ":" + st.sup; if (b._sig === sig) return; b._sig = sig;
    b.innerHTML = '<span class="rk-hud-ic">🏆</span><span class="rk-hud-t"><b>CLASSÉ</b><small>' + esc(L.n) + " · " + st.elims + " élim.</small></span>";
  }
  // Un vrai clic (ou celui du Center) ouvre le panneau ; seul le bouton JOUER du panneau et le lancement d'equipe lancent la partie.
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest("#btn-ranked"); if (!b) return;
    if (window.__rkGo || window.__trugoTeamLaunch) return;
    e.preventDefault(); e.stopImmediatePropagation(); openPanel();
  }, true);

  /* progression (niveau max / nombre de combats) pour le profil et les badges */
  function sendProgress(fight) {
    var lv = 1; try { lv = typeof getPlayerLevel === "function" ? getPlayerLevel() : 1; } catch (e) {}
    call("/progress", { level: lv, fight: !!fight }).catch(function () {});
  }
  document.addEventListener("trugo:match-end", function () { setTimeout(function () { sendProgress(true); }, 2500); });
  load();
  function init() { setTimeout(function () { sendProgress(false); }, 2000); paintHud(); syncGame(true); setTimeout(function () { fetchMe().then(function () { flush(); }); }, 1200); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
