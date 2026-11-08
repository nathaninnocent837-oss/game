/* TRUGO - teamsync.js : partie partagee avec l'equipe (joueurs reels + robots du chef).
   Charge APRES game.js et groups.js. Parle au serveur via /api/groups/team/sync. */
(function () {
  "use strict";
  if (window.__trugoTeamSync) return; window.__trugoTeamSync = true;
  var API = null, timer = null, busy = false, lid = 0, active = false, host = false;
  function call(path, body) {
    return fetch(API + path, { method: body ? "POST" : "GET", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(String(r.status))); });
  }
  function detectApi() {
    if (API) return Promise.resolve(API);
    var c = ["/api/groups", "/api/profile/groups"], i = 0;
    return (function next() {
      if (i >= c.length) return Promise.reject(new Error("api"));
      var base = c[i++];
      return fetch(base + "/team", { credentials: "same-origin" }).then(function (r) { if (r.ok) { API = base; return API; } return next(); }).catch(next);
    })();
  }
  function badge(text, warn) {
    var b = document.getElementById("ts-badge");
    if (!text) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement("div"); b.id = "ts-badge";
      b.style.cssText = "position:fixed;left:10px;bottom:10px;z-index:9000;padding:.35rem .7rem;border-radius:99px;font:600 12px system-ui,sans-serif;pointer-events:none;box-shadow:0 6px 18px rgba(0,0,0,.45)";
      document.body.appendChild(b);
    }
    b.style.background = warn ? "#7a2630" : "rgba(10,16,24,.92)"; b.style.color = "#fff";
    b.style.border = "1px solid " + (warn ? "#e5484d" : "#e8b04a");
    b.textContent = text;
  }
  function stop() {
    badge(null);
    active = false; clearInterval(timer); timer = null;
    if (API && lid) call("/team/sync", { lid: lid, s: null }).catch(function () {});
    try { Match.team.reset(); } catch (e) {}
  }
  function tick() {
    if (!active || busy) return;
    var st, bots, hits;
    try { st = Match.team.getState(); bots = Match.team.getBots(); hits = Match.team.takeHits(); } catch (e) { return; }
    if (!st) return;
    busy = true;
    var body = { lid: lid, s: st, hits: hits };
    if (host && bots) body.b = bots;
    call("/team/sync", body).then(function (d) {
      if (!active) return;
      Match.team.apply(d.players || [], d.bots || null);
      var n = (d.players || []).length + 1;
      badge(n > 1 ? "\uD83D\uDC65 Partie d'\u00e9quipe \u00b7 " + n + " joueurs connect\u00e9s" + (host ? " \u00b7 tu es l'h\u00f4te" : "") : "\uD83D\uDC65 En attente de ton \u00e9quipe\u2026");
      if (d.hits && d.hits.length) Match.team.hit(d.hits);
    }).catch(function () {
      if (hits && hits.length) { try { /* coups perdus : on ne les rejoue pas */ } catch (e) {} }
    }).then(function () { busy = false; });
  }
  document.addEventListener("trugo:match-start", function () {
    stop();
    if (typeof Match === "undefined" || !Match.team) { badge("game.js n'est pas \u00e0 jour : remplace-le pour jouer en \u00e9quipe", true); setTimeout(function () { badge(null); }, 8000); return; }
    detectApi().then(function () { return call("/team"); }).then(function (d) {
      var t = d && d.team;
      if (!t || t.members.length < 2) return;           // solo : rien a synchroniser
      lid = t.lid || 0; host = !!t.leader;
      Match.team.setRole(host);
      active = true; busy = false;
      timer = setInterval(tick, 125);
    }).catch(function () {});
  });
  document.addEventListener("trugo:match-end", stop);
})();
