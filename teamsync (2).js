/* TRUGO - teamsync.js : partie partagee avec l'equipe (joueurs reels + robots du chef).
   Charge APRES game.js et groups.js. Parle au serveur via /api/groups/team/sync. */
(function () {
  "use strict";
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
  function stop() {
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
      if (d.hits && d.hits.length) Match.team.hit(d.hits);
    }).catch(function () {
      if (hits && hits.length) { try { /* coups perdus : on ne les rejoue pas */ } catch (e) {} }
    }).then(function () { busy = false; });
  }
  document.addEventListener("trugo:match-start", function () {
    stop();
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
