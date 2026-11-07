/* TRUGO - teamsync.js : synchronise les coequipiers dans la meme partie.
   Charge APRES game.js et groups.js. Parle au serveur via /api/groups/team/sync. */
(function () {
  "use strict";
  var API = null, timer = null, busy = false, lid = 0, active = false;
  function api(path, body) {
    return fetch(API + path, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(String(r.status))); });
  }
  function getTeam() {
    return fetch(API + "/team", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(String(r.status))); });
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
    if (API && lid) api("/team/sync", { lid: lid, s: null }).catch(function () {});
    try { Match.team.reset(); } catch (e) {}
  }
  function tick() {
    if (!active || busy) return;
    var st; try { st = Match.team.getState(); } catch (e) { return; }
    if (!st) return;
    busy = true;
    api("/team/sync", { lid: lid, s: st }).then(function (d) { if (active) Match.team.apply(d.players || []); })
      .catch(function () {}).then(function () { busy = false; });
  }
  document.addEventListener("trugo:match-start", function () {
    stop();
    detectApi().then(getTeam).then(function (d) {
      var t = d && d.team;
      if (!t || t.members.length < 2) return;           // solo : rien a synchroniser
      lid = t.lid || 0;
      active = true; busy = false;
      timer = setInterval(tick, 125);
    }).catch(function () {});
  });
  document.addEventListener("trugo:match-end", stop);
})();
