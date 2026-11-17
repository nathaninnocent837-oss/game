/* TRUGO : modération — joueurs restreints, rôles jaune / rouge, onglets Accès + Clé admin (/panel), panneau admin */
(function () {
  "use strict";
  if (window.TrugoMod) return;

  var API = null, ST = { staff: false, role: "member", restricted: false, color: null, settings: {}, dates: [], loaded: false, unlocked: false, message: "", panelConfigured: true };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function toast(t, bad) { var n = el("div", "md-toast" + (bad ? " bad" : ""), esc(t)); document.body.appendChild(n); setTimeout(function () { n.classList.add("out"); setTimeout(function () { n.remove(); }, 300); }, 2600); }
  function fdate(d) { try { return new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }
  function ago(d) { var s = (Date.now() - new Date(d).getTime()) / 1000; return s < 90 ? "à l'instant" : s < 3600 ? Math.round(s / 60) + " min" : s < 86400 ? Math.round(s / 3600) + " h" : Math.round(s / 86400) + " j"; }

  /* ---------- API ---------- */
  function detectApi() {
    if (API) return Promise.resolve(API);
    var c = ["/api/groups", "/api/profile/groups"], i = 0;
    function next() {
      if (i >= c.length) return Promise.reject(new Error("api"));
      var base = c[i++];
      return fetch(base + "/mod/me", { credentials: "same-origin" }).then(function (r) { if (!r.ok) return next(); API = base; return API; }).catch(next);
    }
    return next();
  }
  function call(path, body) {
    return detectApi().then(function (b) {
      return fetch(b + path, { method: body ? "POST" : "GET", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || String(r.status)); e.data = j; return Promise.reject(e); } return j; }); });
    });
  }

  /* ---------- état du joueur ---------- */
  var shownDates = {};
  function refresh() {
    return call("/mod/me").then(function (d) {
      var was = ST.restricted;
      ST = Object.assign(ST, d, { loaded: true });
      window.TrugoMod.settings = d.settings || {};
      paintBanners();
      if (ST.restricted && !was && !document.querySelector(".md-restrict")) {/* on n'interrompt pas : l'écran s'affiche au clic sur Jouer */}
      (d.dates || []).forEach(function (x) {
        if (shownDates[x.id]) return; shownDates[x.id] = 1;
        toast("📞 Rendez-vous avec le support le " + fdate(x.at) + " (groupe « Support »)");
      });
    }).catch(function () {});
  }
  setTimeout(refresh, 2500);
  setInterval(function () { if (!document.hidden) refresh(); }, 20000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });
  document.addEventListener("trugo:match-end", function () { setTimeout(refresh, 800); });

  function paintBanners() {
    var b = document.getElementById("md-bar");
    var msg = "", cls = "";
    if (ST.restricted && !ST.staff) { msg = "🚫 Compte restreint : en attente du support"; cls = "bad"; }
    else if (ST.settings && ST.settings.announcement) { msg = "📣 " + ST.settings.announcement; cls = "info"; }
    else if (ST.settings && ST.settings.maintenance) { msg = "🛠️ Maintenance en cours" + (ST.staff ? " (le staff peut jouer)" : ""); cls = "warn"; }
    if (!msg) { if (b) b.remove(); return; }
    if (!b) { b = el("div", "md-bar"); b.id = "md-bar"; document.body.appendChild(b); }
    b.className = "md-bar " + cls; b.textContent = msg;
  }

  /* ---------- écrans « restreint » / maintenance ---------- */
  function overlay(inner, cls) {
    var ov = el("div", "md-ov " + (cls || ""), inner);
    document.body.appendChild(ov);
    ov.addEventListener("click", function (e) { if (e.target === ov || e.target.closest("[data-md-close]")) ov.remove(); });
    return ov;
  }
  function showRestricted() {
    if (document.querySelector(".md-restrict")) return;
    var until = ST.banned && ST.bannedUntil ? '<p class="md-sub">Sanction jusqu\'au <b>' + fdate(ST.bannedUntil) + "</b>.</p>" : "";
    var dt = (ST.dates || []).filter(function (d) { return new Date(d.at).getTime() > Date.now() - 3 * 3600000; })[0];
    var dh = dt ? '<div class="md-date">📞 <b>Rendez-vous avec le support</b><br>' + fdate(dt.at) + (dt.note ? " — " + esc(dt.note) : "") + '<br><small>Ouvre le groupe « Support » dans Groupes pour rejoindre l\'appel.</small></div>' : "";
    var ov = overlay('<div class="md-card md-restrict"><div class="md-ico">🚫</div><h2>Accès restreint</h2><p class="md-msg">' + esc(ST.message || "Par faute de signalement, vous avez été restreint. Attendez que le support vous remette l'accès.") + "</p>" + until + dh +
      '<div class="md-actions"><button class="md-btn" data-md-close>Compris</button></div></div>', "md-center");
    return ov;
  }
  function showMaintenance() {
    if (document.querySelector(".md-maint")) return;
    overlay('<div class="md-card md-maint"><div class="md-ico">🛠️</div><h2>Maintenance</h2><p class="md-msg">' + esc((ST.settings && ST.settings.maintenanceMsg) || "Le jeu est en maintenance.") + '</p><div class="md-actions"><button class="md-btn" data-md-close>OK</button></div></div>', "md-center");
  }
  function guard() {
    if (ST.restricted && !ST.staff) { showRestricted(); return true; }
    if (ST.settings && ST.settings.maintenance && !ST.staff) { showMaintenance(); return true; }
    return false;
  }

  /* ---------- panneau staff : onglets Accès / Clé admin ---------- */
  function pill(color) { return color ? '<span class="md-pill ' + color + '">' + (color === "red" ? "Rôle rouge" : "Rôle jaune") + "</span>" : ""; }
  function playerCard(p, canRed, adminMode) {
    var rep = (p.list || []).map(function (r) {
      return '<div class="md-rep ' + (r.status === "dismissed" ? "off" : "") + '"><div><b>' + esc(r.by) + "</b> · " + esc(r.reason) + " <small>" + ago(r.at) + (r.status !== "open" ? " · " + (r.status === "dismissed" ? "rejeté" : r.status === "accepted" ? "validé" : "ancien") : "") + "</small></div>" + (r.details ? "<p>« " + esc(r.details) + " »</p>" : "") + (r.snapshot ? "<p class=\"md-snap\">Message : " + esc(r.snapshot) + "</p>" : "") + "</div>";
    }).join("");
    var lockRed = p.red && !(ST.role === "admin" && ST.unlocked);
    var h = '<div class="md-pl' + (p.restricted ? " restricted" : "") + '" data-uid="' + esc(p.id) + '"><div class="md-pl-h"><div class="md-av">' + esc(p.username.charAt(0).toUpperCase()) + '</div><div class="md-pl-n"><b>' + esc(p.username) + "</b><small>" + p.reports + " signalement" + (p.reports > 1 ? "s" : "") + (p.restricted ? " · 🚫 restreint" : " · accès libre") + (p.banned ? " · banni jusqu'au " + fdate(p.bannedUntil) : "") + "</small></div>" + pill(p.color) + "</div>" +
      (rep ? '<div class="md-reps">' + rep + "</div>" : "");
    if (adminMode) {
      h += '<div class="md-acts"><button data-act="lift">✅ Lever</button><button data-act="reset">♻️ Réinitialiser</button><button data-act="ban">⛔ Bannir<select class="md-h"><option value="1">1 h</option><option value="24" selected>24 h</option><option value="72">3 j</option><option value="168">7 j</option><option value="720">30 j</option></select></button>' +
        (p.red ? '<button data-act="unred">⚪ Retirer le rouge</button>' : '<button data-act="red" class="danger">🔴 Passer en rouge</button>') + "</div>";
    } else if (lockRed) {
      h += '<div class="md-lockred">🔴 Rôle rouge : seul l\'admin peut gérer cette sanction (onglet « Clé admin »).</div>';
    } else if (p.restricted || (p.list || []).some(function (r) { return r.status === "open"; })) {
      h += '<div class="md-acts"><button data-act="accept">✅ Remettre l\'accès</button><button data-act="dismiss">🗑️ Rejeter (infondé)</button>' + (canRed ? '<button data-act="red" class="danger">🔴 Rôle rouge</button>' : "") + "</div>";
    }
    return h + "</div>";
  }
  function renderAccess(host) {
    host.innerHTML = '<div class="md-head"><h3>🔓 Accès des joueurs</h3><p>Les joueurs signalés sont restreints (ni jeu, ni chat, ni appels) tant que le staff ne leur a pas remis l\'accès.</p><input class="md-in" id="md-q" placeholder="Rechercher un joueur…"></div><div id="md-list" class="md-listbox"><p class="md-empty">Chargement…</p></div>';
    var list = host.querySelector("#md-list"), q = host.querySelector("#md-q"), tm = 0;
    function load() {
      call("/mod/staff/list?q=" + encodeURIComponent(q.value.trim())).then(function (d) {
        list.innerHTML = d.players.length ? d.players.map(function (p) { return playerCard(p, true, false); }).join("") : '<p class="md-empty">✨ Aucun joueur restreint pour le moment.</p>';
      }).catch(function (e) { list.innerHTML = '<p class="md-empty">' + esc(e.message) + "</p>"; });
    }
    q.addEventListener("input", function () { clearTimeout(tm); tm = setTimeout(load, 300); });
    list.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]"); if (!b) return; var uid = b.closest("[data-uid]").dataset.uid, act = b.dataset.act;
      b.disabled = true;
      var p = act === "red" ? call("/mod/staff/red", { userId: uid }) : call("/mod/staff/release", { userId: uid, verdict: act === "dismiss" ? "dismiss" : "accept" });
      p.then(function () { toast(act === "red" ? "Rôle rouge attribué." : act === "dismiss" ? "Signalement rejeté, accès remis." : "Accès remis."); load(); }).catch(function (er) { toast(er.message, true); b.disabled = false; });
    });
    load();
  }

  /* ---- Clé admin : console + /panel ---- */
  function renderKey(host) {
    host.innerHTML = '<div class="md-head"><h3>🔑 Clé admin</h3><p>Console de commandes. Tape <code>/help</code> pour la liste.</p></div><div class="md-con" id="md-con"></div><form class="md-cmd" id="md-cmd"><span>›</span><input id="md-ci" autocomplete="off" spellcheck="false" placeholder="/panel"><button type="submit">Envoyer</button></form>';
    var con = host.querySelector("#md-con"), inp = host.querySelector("#md-ci");
    function log(t, cls) { var l = el("div", "md-ln " + (cls || ""), t); con.appendChild(l); con.scrollTop = con.scrollHeight; }
    log("Console admin prête. Commandes disponibles : <b>/panel</b>, <b>/lock</b>, <b>/help</b>, <b>/clear</b>.", "sys");
    host.querySelector("#md-cmd").addEventListener("submit", function (e) {
      e.preventDefault(); var t = inp.value.trim(); if (!t) return; inp.value = ""; log("› " + esc(t), "me");
      var c = t.split(/\s+/)[0].toLowerCase();
      if (c === "/help") log("/panel — ouvre le panneau admin (code requis)<br>/lock — verrouille le panneau<br>/clear — efface la console", "sys");
      else if (c === "/clear") con.innerHTML = "";
      else if (c === "/lock") call("/mod/panel/logout", {}).then(function () { ST.unlocked = false; log("🔒 Panneau verrouillé.", "ok"); }).catch(function () { log("Erreur.", "err"); });
      else if (c === "/panel") {
        if (ST.role !== "admin") return log("⛔ Réservé à l'admin.", "err");
        if (ST.unlocked) { log("✅ Déjà déverrouillé : ouverture du panneau…", "ok"); return openAdmin(); }
        codeDialog(function () { log("✅ Code accepté : ouverture du panneau…", "ok"); openAdmin(); }, function (m) { log("❌ " + esc(m), "err"); });
      } else log("Commande inconnue. Tape /help.", "err");
    });
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 100);
  }
  function codeDialog(ok, fail) {
    var ov = overlay('<div class="md-card"><div class="md-ico">🔐</div><h2>Panneau admin</h2><p class="md-msg">Saisis le code administrateur.</p><input class="md-in md-code" id="md-code" type="password" autocomplete="off" placeholder="••••••••"><div class="md-err" id="md-cerr"></div><div class="md-actions"><button class="md-btn ghost" data-md-close>Annuler</button><button class="md-btn gold" id="md-cok">Déverrouiller</button></div></div>', "md-center");
    var inp = ov.querySelector("#md-code"), err = ov.querySelector("#md-cerr");
    function go() {
      call("/mod/panel/login", { code: inp.value }).then(function () { ST.unlocked = true; ov.remove(); ok(); }).catch(function (e) { err.textContent = e.message + (e.data && e.data.left != null ? " (" + e.data.left + " essai(s) restant(s))" : ""); if (fail) fail(e.message); inp.value = ""; inp.focus(); });
    }
    ov.querySelector("#md-cok").addEventListener("click", go);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    setTimeout(function () { inp.focus(); }, 80);
  }

  /* ---------- panneau admin ---------- */
  var PARAMS = [
    { title: "🎮 Jeu", items: [
      ["maintenance", "Mode maintenance (bloque « Jouer » hors staff)", "bool"], ["maintenanceMsg", "Message de maintenance", "text"], ["announcement", "Annonce affichée à tous (vide = aucune)", "text"] ] },
    { title: "⏱️ Durée des parties (secondes)", items: [
      ["durFrappe", "Frappe Dolling", "int", 60, 900], ["durCouronne", "Couronne Hunter", "int", 60, 900], ["durMaxitrone", "Maxitrone", "int", 90, 900] ] },
    { title: "🏅 Médailles", items: [
      ["medalGain", "Multiplicateur des gains", "num", 0, 5, 0.25], ["medalLoss", "Multiplicateur des pertes", "num", 0, 5, 0.25] ] },
    { title: "🚩 Signalements", items: [
      ["reportRestrict", "Restreindre automatiquement un joueur signalé", "bool"], ["yellowAt", "Rôle jaune à partir de (signaleurs différents)", "int", 2, 20], ["redAt", "Rôle rouge à partir de", "int", 3, 50],
      ["minJustify", "Justification minimale (caractères)", "int", 5, 200], ["maxOpenReports", "Signalements en attente max. par joueur", "int", 1, 20] ] },
    { title: "💬 Communication", items: [
      ["chatEnabled", "Chat activé", "bool"], ["callsEnabled", "Appels vocaux activés", "bool"] ] }
  ];
  var adminEl = null;
  function openAdmin() {
    if (adminEl) adminEl.remove();
    var ov = el("div", "md-adm");
    ov.innerHTML = '<div class="md-adm-in"><div class="md-adm-top"><div class="md-adm-t"><span>👑</span><div><b>Panneau admin</b><small>Accès verrouillé automatiquement après 45 min</small></div></div><button class="md-x" data-a="close" aria-label="Fermer">✕</button></div>' +
      '<div class="md-tabs"><button data-t="over" class="on">📊 Aperçu</button><button data-t="pun">⛔ Sanctions</button><button data-t="rep">🚩 Signalements & appels</button><button data-t="set">⚙️ Paramètres</button><button data-a="lock">🔒 Verrouiller</button></div><div class="md-adm-body" id="md-ab"></div></div>';
    document.body.appendChild(ov); adminEl = ov;
    var body = ov.querySelector("#md-ab"), cur = "over";
    ov.addEventListener("click", function (e) {
      var t = e.target.closest("[data-t]"), a = e.target.closest("[data-a]");
      if (t) { cur = t.dataset.t; ov.querySelectorAll(".md-tabs [data-t]").forEach(function (b) { b.classList.toggle("on", b === t); }); show(); }
      else if (a && a.dataset.a === "close") { ov.remove(); adminEl = null; }
      else if (a && a.dataset.a === "lock") call("/mod/panel/logout", {}).then(function () { ST.unlocked = false; ov.remove(); adminEl = null; toast("🔒 Panneau verrouillé."); });
    });
    function fail(e) { if (e.data && e.data.locked) { ST.unlocked = false; ov.remove(); adminEl = null; toast("Panneau verrouillé : tape /panel.", true); } else toast(e.message, true); }
    function show() { body.innerHTML = '<p class="md-empty">Chargement…</p>'; ({ over: tOver, pun: tPun, rep: tRep, set: tSet })[cur](); }
    function tOver() {
      call("/mod/admin/overview").then(function (d) {
        var S = d.settings || {};
        body.innerHTML = '<div class="md-kpis"><div><b>' + d.open + "</b><small>signalements en attente</small></div><div><b>" + d.restricted + "</b><small>joueurs restreints</small></div><div class=\"red\"><b>" + d.red + "</b><small>rôles rouges</small></div><div><b>" + d.dates + "</b><small>appels planifiés</small></div></div>" +
          '<div class="md-card2"><h4>État du jeu</h4><p>' + (S.maintenance ? "🛠️ <b>Maintenance activée</b>" : "🟢 Jeu en ligne") + " · Chat " + (S.chatEnabled ? "✅" : "⛔") + " · Appels " + (S.callsEnabled ? "✅" : "⛔") + "</p><p>Parties : Frappe " + S.durFrappe + " s · Couronne " + S.durCouronne + " s · Maxitrone " + S.durMaxitrone + " s</p><p>Médailles : gains ×" + S.medalGain + " · pertes ×" + S.medalLoss + "</p></div>" +
          '<div class="md-card2"><h4>Règles de signalement</h4><p>🟡 Rôle jaune dès <b>' + S.yellowAt + "</b> signaleurs · 🔴 Rôle rouge dès <b>" + S.redAt + "</b> · Justification ≥ <b>" + S.minJustify + "</b> caractères.</p></div>";
      }).catch(fail);
    }
    function tPun() {
      body.innerHTML = '<input class="md-in" id="md-pq" placeholder="Rechercher un joueur (vide = joueurs sanctionnés)…"><div id="md-pl" class="md-listbox"></div>';
      var q = body.querySelector("#md-pq"), box = body.querySelector("#md-pl"), tm = 0;
      function load() { call("/mod/admin/players?q=" + encodeURIComponent(q.value.trim())).then(function (d) { box.innerHTML = d.players.length ? d.players.map(function (p) { return playerCard(p, true, true); }).join("") : '<p class="md-empty">Aucun joueur.</p>'; }).catch(fail); }
      q.addEventListener("input", function () { clearTimeout(tm); tm = setTimeout(load, 300); });
      box.addEventListener("click", function (e) {
        var b = e.target.closest("[data-act]"); if (!b || e.target.closest("select")) return; var card = b.closest("[data-uid]");
        var hrs = card.querySelector(".md-h"); b.disabled = true;
        call("/mod/admin/punish", { userId: card.dataset.uid, action: b.dataset.act, hours: hrs ? Number(hrs.value) : undefined }).then(function () { toast("Action appliquée."); load(); }).catch(function (er) { b.disabled = false; fail(er); });
      });
      load();
    }
    function tRep() {
      Promise.all([call("/mod/admin/reports"), call("/mod/admin/dates")]).then(function (r) {
        var reps = r[0].reports, dates = r[1].dates;
        body.innerHTML = '<h4 class="md-h4">📞 Appels planifiés</h4><div id="md-dl">' + (dates.length ? dates.map(function (d) { return '<div class="md-dt ' + d.status + '"><div><b>' + esc(d.reporter) + "</b> ⇄ <b>" + esc(d.target) + "</b><small>" + fdate(d.at) + (d.note ? " · " + esc(d.note) : "") + "</small></div><span class=\"md-st\">" + (d.status === "planned" ? "planifié" : "annulé") + "</span>" + (d.status === "planned" ? '<button data-cancel="' + d.id + '">Annuler</button>' : "") + "</div>"; }).join("") : '<p class="md-empty">Aucun appel planifié.</p>') + '</div><h4 class="md-h4">🚩 Signalements récents</h4><div id="md-rl">' +
          (reps.length ? reps.map(function (x) { return '<div class="md-rp"><div class="md-rp-h"><b>' + esc(x.reporter) + "</b> ➜ <b>" + esc(x.target) + "</b><small>" + esc(x.reason) + " · " + ago(x.at) + ' · ' + (x.status === "open" ? "🟠 en attente" : x.status === "accepted" ? "✅ validé" : "🗑️ rejeté") + '</small></div><p>« ' + esc(x.details) + " »</p>" + (x.snapshot ? '<p class="md-snap">Message : ' + esc(x.snapshot) + "</p>" : "") + '<button class="md-call" data-rid="' + x.id + '" data-n="' + esc(x.reporter + " ⇄ " + x.target) + '">📞 Créer une date d\'appel</button></div>'; }).join("") : '<p class="md-empty">Aucun signalement.</p>') + "</div>";
      }).catch(fail);
      body.onclick = function (e) {
        var c = e.target.closest("[data-cancel]"); if (c) return call("/mod/admin/date/" + c.dataset.cancel + "/cancel", {}).then(function () { toast("Appel annulé."); tRep(); }).catch(fail);
        var b = e.target.closest("[data-rid]"); if (!b) return;
        var d0 = new Date(Date.now() + 86400000); d0.setMinutes(0, 0, 0); var pad = function (n) { return (n < 10 ? "0" : "") + n; };
        var def = d0.getFullYear() + "-" + pad(d0.getMonth() + 1) + "-" + pad(d0.getDate()) + "T18:00";
        var mo = overlay('<div class="md-card"><div class="md-ico">📞</div><h2>Date d\'appel</h2><p class="md-msg">' + esc(b.dataset.n) + '<br><small>Le signaleur et le signalé reçoivent le rendez-vous et un groupe « Support » dédié (accessible même s\'ils sont restreints).</small></p><input class="md-in" type="datetime-local" id="md-dtv" value="' + def + '"><input class="md-in" id="md-dtn" maxlength="200" placeholder="Note (facultatif)" style="margin-top:.5rem"><div class="md-err" id="md-dte"></div><div class="md-actions"><button class="md-btn ghost" data-md-close>Annuler</button><button class="md-btn gold" id="md-dtok">Créer</button></div></div>', "md-center md-top");
        mo.querySelector("#md-dtok").addEventListener("click", function () {
          var v = mo.querySelector("#md-dtv").value; if (!v) return;
          call("/mod/admin/date", { reportId: Number(b.dataset.rid), at: new Date(v).toISOString(), note: mo.querySelector("#md-dtn").value }).then(function () { mo.remove(); toast("📞 Date d'appel créée."); tRep(); }).catch(function (er) { mo.querySelector("#md-dte").textContent = er.message; });
        });
      };
    }
    function tSet() {
      call("/mod/admin/settings").then(function (d) {
        var S = d.settings, h = "";
        PARAMS.forEach(function (g) {
          h += '<div class="md-card2"><h4>' + g.title + "</h4>";
          g.items.forEach(function (it) {
            var k = it[0], v = S[k];
            h += '<label class="md-row"><span>' + it[1] + "</span>" + (it[2] === "bool" ? '<span class="md-sw"><input type="checkbox" data-k="' + k + '"' + (v ? " checked" : "") + "><i></i></span>" : it[2] === "text" ? '<input class="md-in" data-k="' + k + '" value="' + esc(v) + '" maxlength="200">' : '<input class="md-in md-num" type="number" data-k="' + k + '" value="' + v + '" min="' + it[3] + '" max="' + it[4] + '" step="' + (it[5] || 1) + '">') + "</label>";
          });
          h += "</div>";
        });
        body.innerHTML = h + '<div class="md-save"><button class="md-btn gold" id="md-sv">💾 Enregistrer les paramètres</button></div>';
        body.querySelector("#md-sv").addEventListener("click", function () {
          var o = {}; body.querySelectorAll("[data-k]").forEach(function (i) { o[i.dataset.k] = i.type === "checkbox" ? i.checked : i.type === "number" ? Number(i.value) : i.value; });
          call("/mod/admin/settings", { settings: o }).then(function (r) { window.TrugoMod.settings = r.settings; ST.settings = r.settings; paintBanners(); toast("Paramètres enregistrés (" + r.changed + ")."); }).catch(fail);
        });
      }).catch(fail);
    }
    show();
  }

  /* ---------- intégration au bouton Staff ---------- */
  var TABS = [{ re: /acc[eè]s/i, key: "access", label: "🔓 Accès", render: renderAccess }, { re: /cl[eé]\s*admin/i, key: "key", label: "🔑 Clé admin", render: renderKey }];
  function activeTab(tabs) {
    var b = Array.prototype.filter.call(tabs.children, function (x) { return /(^|\s)(active|on|selected|current)(\s|$)/.test(x.className) || x.getAttribute("aria-selected") === "true"; });
    return b[0] || null;
  }
  function putHost(tab, force) {
    var body = document.getElementById("staff-body"); if (!body) return;
    var t = TABS.filter(function (x) { return x.key === tab; })[0]; if (!t) return;
    var h = body.querySelector('.md-host[data-k="' + tab + '"]');
    if (h && !force) return;
    if (h) h.remove();
    h = el("div", "md-host"); h.dataset.k = tab;
    var own = body.querySelector(".md-host"); if (own) own.remove();
    body.appendChild(h); t.render(h);
  }
  var guardSync = false;
  function sync() {
    if (guardSync) return; guardSync = true;
    try {
      var tabs = document.getElementById("staff-tabs"), body = document.getElementById("staff-body");
      if (!tabs || !body || !tabs.children.length) return;
      // onglets existants ou à créer
      TABS.forEach(function (t) {
        var ex = Array.prototype.filter.call(tabs.children, function (x) { return !x.dataset.md && t.re.test(x.textContent); })[0];
        if (ex) { ex.dataset.mdk = t.key; return; }
        if (tabs.querySelector('[data-md="' + t.key + '"]')) return;
        var b = el("button", tabs.children[0] ? tabs.children[0].className.replace(/(^|\s)(active|on|selected|current)(?=\s|$)/g, "") : "staff-tab", t.label);
        b.type = "button"; b.dataset.md = t.key; b.dataset.mdk = t.key; tabs.appendChild(b);
      });
      var a = activeTab(tabs);
      if (a && a.dataset.mdk && !body.querySelector('.md-host[data-k="' + a.dataset.mdk + '"]')) putHost(a.dataset.mdk);
    } finally { setTimeout(function () { guardSync = false; }, 0); }
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("#staff-tabs > *"); if (!b) return;
    var k = b.dataset.mdk;
    if (b.dataset.md) { // onglet créé par ce module
      Array.prototype.forEach.call(b.parentNode.children, function (x) { x.classList.remove("active", "on", "selected", "current"); x.setAttribute && x.setAttribute("aria-selected", "false"); });
      b.classList.add("active"); b.setAttribute("aria-selected", "true");
      var body = document.getElementById("staff-body"); if (body) { Array.prototype.slice.call(body.children).forEach(function (c) { if (!c.classList.contains("md-host")) c.style.display = "none"; }); }
      putHost(k, true); return;
    }
    var body2 = document.getElementById("staff-body"); if (body2) Array.prototype.forEach.call(body2.children, function (c) { c.style.display = ""; });
    if (k) setTimeout(function () { putHost(k, true); }, 60);
    else { var h = document.querySelector("#staff-body .md-host"); if (h) setTimeout(function () { var x = document.querySelector("#staff-body .md-host"); if (x && x.parentNode && !activeTabIsMine()) x.remove(); }, 60); }
  }, true);
  function activeTabIsMine() { var t = document.getElementById("staff-tabs"), a = t && activeTab(t); return !!(a && a.dataset.mdk); }
  new MutationObserver(function () { sync(); }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", sync);

  window.TrugoMod = { settings: {}, state: function () { return ST; }, guard: guard, refresh: refresh, openAdmin: function () { if (ST.unlocked) openAdmin(); else codeDialog(openAdmin); }, restricted: function () { return !!ST.restricted && !ST.staff; } };
})();
