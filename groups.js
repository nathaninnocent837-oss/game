/* ============================================================
   TRUGO \u2014 Groupes (client). NOUVEAU FICHIER : n'alt\u00e8re ni game.js ni teams.js.
   Remplace le bouton \u00ab Magasin \u00bb du lobby par \u00ab Groupe \u00bb et ouvre son propre panneau.
   D\u00e9pend de : /api/groups (routes/groups.js) et groups.css.
   ============================================================ */
(function () {
  "use strict";
  var API_CANDIDATES = ["/api/groups", "/api/profile/groups"];
  var API = API_CANDIDATES[0];
  var apiChecked = false;
  var MAX_REC_MS = 60000, MIN_REC_MS = 700, POLL_MS = 2500;
  var BADGE = { owner: "Cr\u00e9ateur", chief: "Chef", deputy: "Sous-chef", admin: "Admin", staff: "Staff" };
  var ICONS = {
    send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>',
    micoff: '<line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    gear: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    back: '<polyline points="15 18 9 12 15 6"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
    reply: '<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    poll: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    ban: '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    userplus: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3" fill="currentColor"/>',
    pause: '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    chevdown: '<polyline points="6 9 12 15 18 9"/>',
    chevup: '<polyline points="18 15 12 9 6 15"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'
  };
  function ic(n, cls) { return '<svg class="ic ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || "") + "</svg>"; }

  /* ---------------- \u00e9tat ---------------- */
  var S = {
    me: null, groups: [], reactions: ["\ud83d\udc4d", "\u2764\ufe0f", "\ud83d\ude02", "\ud83d\ude2e", "\ud83d\ude22", "\ud83d\udd25", "\ud83d\udc4f", "\ud83c\udf89"],
    cur: null,            // { id, name, global, code, owner }
    lastId: 0, rank: 1, timeoutUntil: null, members: [], membersMap: {}, state: {},
    reply: null, filter: "", polling: false
  };
  var el = {};            // r\u00e9f\u00e9rences DOM
  var timers = { poll: null, list: null, members: null, mute: null };
  var rec = null, player = null, audioCache = {};
  var pref = loadPrefs();

  function loadPrefs() {
    var d = { sound: true, enterSend: true, size: "m", anim: true, broadcast: true, music: false };
    try { var v = JSON.parse(localStorage.getItem("trugo_groups_prefs") || "{}"); for (var k in v) d[k] = v[k]; } catch (e) {}
    return d;
  }
  function savePrefs() { try { localStorage.setItem("trugo_groups_prefs", JSON.stringify(pref)); } catch (e) {} }

  /* ---------------- helpers ---------------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }
  function q(sel, root) { return (root || el.root).querySelector(sel); }
  function hue(name) { var h = 0; for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360; return h; }
  function avatar(name, cls, online, isGlobal, uid, av) {
    var h = hue(name || "?");
    var inner = isGlobal ? ic("globe") : esc((name || "?").charAt(0).toUpperCase());
    if (!isGlobal && uid && Number(av) > 0) inner += '<img class="gp-av-img" alt="" loading="lazy" src="' + API + "/avatar/" + encodeURIComponent(uid) + "?v=" + Number(av) + '">';
    return '<span class="gp-av ' + (cls || "") + '" style="background:linear-gradient(135deg,hsl(' + h + ',62%,46%),hsl(' + ((h + 40) % 360) + ',62%,34%))">' + inner +
      (online === undefined ? "" : '<i class="dot' + (online ? " on" : "") + '"></i>') + "</span>";
  }
  document.addEventListener("error", function (e) { var t = e.target; if (t && t.classList && t.classList.contains("gp-av-img")) t.remove(); }, true);
  function fmtTime(iso) { var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); }
  function dayLabel(iso) {
    var d = new Date(iso), n = new Date();
    var a = new Date(d.getFullYear(), d.getMonth(), d.getDate()), b = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    var diff = Math.round((b - a) / 86400000);
    if (diff === 0) return "Aujourd'hui";
    if (diff === 1) return "Hier";
    return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  }
  function dayKey(iso) { var d = new Date(iso); return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); }
  function fmtShort(iso) {
    if (!iso) return "";
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return "maintenant";
    if (s < 3600) return Math.floor(s / 60) + " min";
    if (s < 86400) return fmtTime(iso);
    return Math.floor(s / 86400) + " j";
  }
  // Pr\u00e9sence : \u00ab maintenant \u00bb si en ligne, sinon \u00ab il y a x min / heure / jour \u00bb
  function presence(m) {
    if (m.online) return "maintenant";
    if (m.ago == null) return "hors ligne";
    var s = m.ago;
    if (s < 3600) return "il y a " + Math.max(1, Math.floor(s / 60)) + " min";
    if (s < 86400) { var h = Math.floor(s / 3600); return "il y a " + h + " heure" + (h > 1 ? "s" : ""); }
    var j = Math.floor(s / 86400); return "il y a " + j + " jour" + (j > 1 ? "s" : "");
  }
  function fmtDur(ms) { var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function fmtRemaining(iso) {
    var s = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));
    if (s >= 86400) return Math.ceil(s / 86400) + " j";
    if (s >= 3600) return Math.floor(s / 3600) + " h " + String(Math.floor((s % 3600) / 60)).padStart(2, "0") + " min";
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  /* ---------------- r\u00e9seau ---------------- */
  function rawRequest(base, path, opts) {
    var o = {}; for (var k in opts) o[k] = opts[k];
    o.credentials = "same-origin";
    return fetch(base + path, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 404 && !d.error) { var e = new Error("route-missing"); e.missing = true; throw e; }
        if (!r.ok) { var e2 = new Error(d.error || "Erreur (" + r.status + ")"); e2.data = d; e2.status = r.status; throw e2; }
        return d;
      });
    });
  }
  // Teste /api/groups puis /api/profile/groups (selon o\u00f9 la route est mont\u00e9e c\u00f4t\u00e9 serveur)
  function request(path, opts) {
    opts = opts || {};
    return rawRequest(API, path, opts).catch(function (err) {
      if (!err.missing) throw err;
      if (apiChecked) throw new Error("Les groupes ne sont pas encore install\u00e9s c\u00f4t\u00e9 serveur (route /api/groups introuvable).");
      var alt = API === API_CANDIDATES[0] ? API_CANDIDATES[1] : API_CANDIDATES[0];
      return rawRequest(alt, path, opts).then(function (d) { API = alt; apiChecked = true; return d; }, function (e2) {
        apiChecked = true;
        if (e2.missing) throw new Error("Les groupes ne sont pas encore install\u00e9s c\u00f4t\u00e9 serveur (route /api/groups introuvable).");
        throw e2;
      });
    }).then(function (d) { apiChecked = true; return d; });
  }
  function post(path, data) { return request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data || {}) }); }
  function del(path) { return request(path, { method: "DELETE" }); }
  function gid() { return S.cur ? S.cur.id : null; }

  /* ---------------- notifications visuelles ---------------- */
  function toast(text, isErr) {
    if (!el.root) return;
    var t = document.createElement("div");
    t.className = "gp-toast" + (isErr ? " err" : "");
    t.textContent = text;
    var box = el.gp.querySelector(".gp-toasts");
    if (!box) { box = document.createElement("div"); box.className = "gp-toasts"; el.gp.appendChild(box); }
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
  }
  var audioCtx = null;
  function ding() {
    if (!pref.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "sine"; o.frequency.value = 880; g.gain.value = 0.04;
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25); o.stop(audioCtx.currentTime + 0.26);
    } catch (e) {}
  }
  function modal(html, wide) {
    var m = document.createElement("div");
    m.className = "gp-modal";
    m.innerHTML = '<div class="gp-card' + (wide ? " wide" : "") + '">' + html + "</div>";
    m.addEventListener("mousedown", function (e) { if (e.target === m) m.remove(); });
    el.gp.appendChild(m);
    return m;
  }
  function confirmBox(title, text, okLabel, danger) {
    return new Promise(function (resolve) {
      var m = modal('<h3>' + esc(title) + '</h3><p class="sub">' + esc(text) + '</p><div class="gp-actions"><button class="gp-btn" data-r="0">Annuler</button><button class="gp-btn ' + (danger ? "red" : "gold") + '" data-r="1">' + esc(okLabel || "Confirmer") + "</button></div>");
      m.addEventListener("click", function (e) {
        var b = e.target.closest("[data-r]");
        if (!b) return;
        m.remove(); resolve(b.dataset.r === "1");
      });
    });
  }
  function closeMenus() { var a = el.gp && el.gp.querySelectorAll(".gp-menu"); if (a) a.forEach(function (x) { x.remove(); }); }
  function menuAt(anchor, html) {
    closeMenus();
    var m = document.createElement("div");
    m.className = "gp-menu";
    m.innerHTML = html;
    el.gp.appendChild(m);
    var r = anchor.getBoundingClientRect(), g = el.gp.getBoundingClientRect();
    var left = r.left - g.left - m.offsetWidth + r.width; if (left < 6) left = 6;
    if (left + m.offsetWidth > g.width - 6) left = g.width - m.offsetWidth - 6;
    var top = r.bottom - g.top + 4; if (top + m.offsetHeight > g.height - 6) top = r.top - g.top - m.offsetHeight - 4;
    m.style.left = left + "px"; m.style.top = Math.max(6, top) + "px";
    return m;
  }

  /* ---------------- panneau + bouton lobby ---------------- */
  function buildPanel() {
    var p = document.getElementById("panel-groups");
    if (p) { el.root = p; return; }
    p = document.createElement("div");
    p.id = "panel-groups";
    p.className = "panel";
    p.innerHTML =
      '<div class="gp">' +
        '<aside class="gp-side">' +
          '<div class="gp-side-head"><h2>Groupes</h2>' +
            '<button class="gp-ib" id="gp-join" title="Rejoindre avec un code">' + ic("userplus") + "</button>" +
            '<button class="gp-ib gold" id="gp-new" title="Cr\u00e9er un groupe">' + ic("plus") + "</button>" +
            '<button class="gp-ib" id="gp-prefs" title="Param\u00e8tres du chat">' + ic("gear") + "</button>" +
            '<button class="gp-close" id="gp-x" aria-label="Fermer">\u00d7</button></div>' +
          '<div class="gp-search">' + ic("search") + '<input id="gp-filter" placeholder="Rechercher un groupe" autocomplete="off"></div>' +
          '<ul class="gp-list" id="gp-list"></ul>' +
        "</aside>" +
        '<section class="gp-main" id="gp-main"></section>' +
      "</div>";
    document.body.appendChild(p);
    el.root = p;
  }

  function installButton() {
    var b = document.getElementById("btn-shop");
    if (!b) {
      var all = document.querySelectorAll("button");
      for (var i = 0; i < all.length; i++) if (/magasin|shop/i.test(all[i].textContent)) { b = all[i]; break; }
    }
    if (!b || b.dataset.groups) return !!(b && b.dataset.groups);
    var nb = b.cloneNode(false);               // clone sans les anciens \u00e9couteurs
    nb.id = b.id || "btn-shop";
    nb.dataset.groups = "1";
    nb.classList.remove("disabled");
    nb.removeAttribute("disabled");
    nb.title = "Groupes et chat";
    var label = b.querySelector("span");
    var labelTag = label ? label.tagName.toLowerCase() : "span";
    nb.innerHTML = '<span class="gp-ico">' + ic("users") + '<i class="gp-lobby-badge" id="gp-lobby-badge" hidden></i></span><' + labelTag + '>Groupe</' + labelTag + ">";
    b.parentNode.replaceChild(nb, b);
    nb.addEventListener("click", function () { openPanel(); });
    return true;
  }
  // l'ancien bouton \u00ab chat \u00bb du Center (s'il existe) ouvre aussi le nouveau chat
  document.addEventListener("click", function (e) {
    var old = e.target.closest && e.target.closest("#btn-open-teams");
    if (!old) return;
    e.preventDefault(); e.stopImmediatePropagation();
    openPanel("global");
  }, true);

  function setLobbyBadge() {
    var n = S.groups.reduce(function (a, g) { return a + (g.unread || 0); }, 0);
    var b = document.getElementById("gp-lobby-badge");
    if (b) { b.hidden = !n; b.textContent = n > 99 ? "99+" : n; }
  }

  function isOpen() { return el.root && el.root.classList.contains("open"); }
  function openPanel(startId) {
    buildPanel();
    el.gp = q(".gp"); el.list = q("#gp-list"); el.main = q("#gp-main");
    applyPrefs();
    el.root.classList.add("open");
    bindShell();
    renderMainEmpty();
    loadList().then(function () {
      var narrow = window.matchMedia("(max-width:720px)").matches;
      if (startId) openGroup(startId);
      else if (!narrow) openGroup("global");
    });
    clearInterval(timers.list);
    timers.list = setInterval(function () { if (isOpen() && !document.hidden) loadList(); }, 8000);
  }
  function closePanel() {
    stopAll();
    if (el.root) el.root.classList.remove("open");
    S.cur = null;
    clearInterval(timers.list);
    pollBadge();
    renderCallSurfaces();
  }
  var shellBound = false;
  function bindShell() {
    if (shellBound) return;
    shellBound = true;
    q("#gp-x").addEventListener("click", closePanel);
    el.root.addEventListener("mousedown", function (e) { if (e.target === el.root) closePanel(); });
    q("#gp-new").addEventListener("click", createGroupDialog);
    q("#gp-join").addEventListener("click", function () { joinDialog(); });
    q("#gp-prefs").addEventListener("click", prefsDialog);
    q("#gp-filter").addEventListener("input", function (e) { S.filter = e.target.value.trim().toLowerCase(); renderList(); });
    el.list.addEventListener("click", function (e) {
      var b = e.target.closest("[data-gid]");
      if (b) openGroup(b.dataset.gid);
    });
    document.addEventListener("click", function (e) { if (!e.target.closest(".gp-menu") && !e.target.closest("[data-menu]")) closeMenus(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && isOpen()) { if (el.gp.querySelector(".gp-modal,.gp-menu,.gp-lightbox")) { el.gp.querySelectorAll(".gp-modal,.gp-menu,.gp-lightbox").forEach(function (x) { x.remove(); }); } } });
  }
  function applyPrefs() {
    if (!el.gp) return;
    el.gp.classList.toggle("fs-l", pref.size === "l");
    el.gp.classList.toggle("fs-s", pref.size === "s");
    el.gp.classList.toggle("no-anim", !pref.anim);
  }
  function renderMainEmpty() {
    el.gp.classList.remove("in-chat");
    el.main.innerHTML = '<div class="gp-empty-main">' + ic("chat") + "<h3>Tes conversations</h3><p>Choisis un groupe ou ouvre le chat g\u00e9n\u00e9ral.</p></div>";
  }

  /* ---------------- liste des groupes ---------------- */
  function loadList() {
    return request("").then(function (d) {
      S.me = d.me; S.groups = d.groups; if (d.reactions) S.reactions = d.reactions;
      setLobbyBadge();
      if (isOpen()) renderList();
    }).catch(function (err) {
      if (el.list) el.list.innerHTML = '<li class="gp-skel">' + esc(err.message) + "</li>";
    });
  }
  function renderList() {
    if (!el.list) return;
    var f = S.filter;
    var rows = S.groups.filter(function (g) { return !f || g.name.toLowerCase().indexOf(f) >= 0; });
    if (!rows.length) { el.list.innerHTML = '<li class="gp-skel">Aucun groupe.</li>'; return; }
    var html = "", priv = false;
    rows.forEach(function (g, i) {
      if (!g.global && !priv) { priv = true; html += '<li class="gp-sec">Mes groupes</li>'; }
      if (g.global && i === 0) html += '<li class="gp-sec">Public</li>';
      html += '<li><button class="gp-item' + (S.cur && String(S.cur.id) === String(g.id) ? " active" : "") + '" data-gid="' + g.id + '">' +
        avatar(g.name, "", undefined, g.global) +
        '<span class="gp-item-info"><b>' + esc(g.name) + (g.owner ? ' <span class="gp-tag owner">Cr\u00e9ateur</span>' : "") + "</b><small>" +
          (g.lastPreview ? esc(g.lastPreview) : (g.global ? "Discute avec tout le monde" : "Aucun message")) + "</small></span>" +
        '<span class="gp-item-meta"><span>' + fmtShort(g.lastAt) + "</span>" +
          (g.unread && !(S.cur && String(S.cur.id) === String(g.id)) ? '<span class="gp-badge-n">' + g.unread + "</span>" : (g.call ? '<span class="gp-live">' + ic("phone") + "</span>" : "")) +
        "</span></button></li>";
    });
    el.list.innerHTML = html;
  }

  /* ---------------- ouvrir un groupe ---------------- */
  function openGroup(id) {
    var g = S.groups.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!g) g = { id: id, name: "Groupe", global: id === "global", code: "", owner: false };
    stopAll();
    S.cur = { id: g.id, name: g.name, global: !!g.global, code: g.code, owner: !!g.owner };
    S.lastId = 0; S.rank = 1; S.timeoutUntil = null; S.reply = null; S.members = []; S.membersMap = {}; S.state = {};
    g.unread = 0; setLobbyBadge(); renderList();
    el.gp.classList.add("in-chat");
    el.main.innerHTML =
      '<header class="gp-head">' +
        '<button class="gp-ib gp-back" id="gp-back" aria-label="Retour">' + ic("back") + "</button>" +
        avatar(S.cur.name, "sm", undefined, S.cur.global) +
        '<div class="gp-head-title" id="gp-title"><b>' + esc(S.cur.name) + '</b><small id="gp-sub">Chargement\u2026</small></div>' +
        '<button class="gp-ib" id="gp-call" title="Appel vocal">' + ic("phone") + "</button>" +
        '<button class="gp-ib" id="gp-mem" title="Membres">' + ic("users") + "</button>" +
        '<button class="gp-ib" id="gp-set" title="Infos et param\u00e8tres">' + ic("gear") + "</button>" +
        '<button class="gp-close" id="gp-x2" aria-label="Fermer">\u00d7</button>' +
      "</header>" +
      '<div id="gp-callbar" hidden></div>' +
      '<div class="gp-msgs" id="gp-msgs"><div class="gp-skel">Chargement\u2026</div></div>' +
      '<footer class="gp-comp-wrap" id="gp-footer"></footer>';
    q("#gp-back").addEventListener("click", function () { stopAll(); S.cur = null; renderMainEmpty(); renderList(); renderCallSurfaces(); });
    q("#gp-x2").addEventListener("click", closePanel);
    q("#gp-title").addEventListener("click", openInfo);
    q("#gp-set").addEventListener("click", openInfo);
    q("#gp-mem").addEventListener("click", openMembers);
    q("#gp-call").addEventListener("click", callClick);
    el.msgs = q("#gp-msgs");
    el.msgs.addEventListener("click", onMsgClick);
    buildComposer();
    loadMembers();
    poll(true);
    timers.poll = setInterval(function () { if (!document.hidden && isOpen()) poll(false); }, POLL_MS);
    timers.members = setInterval(function () { if (!document.hidden && isOpen()) loadMembers(); }, 15000);
    renderCallSurfaces();
  }
  function stopAll() {
    clearInterval(timers.poll); clearInterval(timers.members); clearInterval(timers.mute);
    timers.poll = timers.members = timers.mute = null;
    cancelRecording(true); stopPlayer();
  }

  /* ---------------- sondage de messages ---------------- */
  function poll(first) {
    if (!S.cur || S.polling) return;
    S.polling = true;
    var id = S.cur.id;
    request("/" + id + "/messages" + (S.lastId ? "?after=" + S.lastId : "")).then(function (d) {
      if (!S.cur || S.cur.id !== id) return;
      var box = el.msgs;
      if (first) box.innerHTML = "";
      S.state = d.state || {};
      S.rank = S.state.rank || 1;
      S.cur.name = S.state.name || S.cur.name;
      S.timeoutUntil = S.state.timeoutUntil || null;
      var near = first || box.scrollHeight - box.scrollTop - box.clientHeight < 90;
      var incoming = false;
      d.messages.forEach(function (m) {
        if (m.id <= S.lastId) return;
        S.lastId = m.id;
        if (!first && !m.mine && m.kind !== "system") incoming = true;
        appendMessage(m);
      });
      if (first && !d.messages.length) box.innerHTML = '<div class="gp-empty-main">' + ic("chat") + "<p>C'est calme ici\u2026<br>\u00c9cris le premier message !</p></div>";
      else { var em = box.querySelector(".gp-empty-main"); if (em && d.messages.length) em.remove(); }
      applyWindow(d.window);
      if (incoming) ding();
      if (near) box.scrollTop = box.scrollHeight;
      updateHeader();
      updateComposerLock();
      updateCallBar();
    }).catch(function (err) {
      if (!S.cur || S.cur.id !== id) return;
      if (first && el.msgs) el.msgs.innerHTML = '<div class="gp-skel">' + esc(err.message) + "</div>";
      else if (err.status === 404) {
        stopAll(); S.cur = null; renderMainEmpty(); loadList(); toast("Tu n'as plus acc\u00e8s \u00e0 ce groupe", true);
      }
    }).then(function () { S.polling = false; });
  }
  function pollBadge() { loadList(); }

  function updateHeader() {
    var sub = q("#gp-sub"), t = q("#gp-title b");
    if (t) t.textContent = S.cur.name;
    if (!sub) return;
    var s = S.state;
    if (S.cur.global) sub.textContent = (s.online || 0) + " en ligne \u00b7 " + (s.members || 0) + " joueurs";
    else sub.textContent = (s.members || 0) + " membre" + ((s.members || 0) > 1 ? "s" : "") + " \u00b7 " + (s.online || 0) + " en ligne";
  }

  /* ---------------- rendu d'un message ---------------- */
  var lastRender = { uid: null, day: null, at: 0 };
  function resetRender() { lastRender = { uid: null, day: null, at: 0 }; }
  function appendMessage(m) {
    var box = el.msgs;
    if (S.lastId === m.id && !box.querySelector(".gp-row,.gp-sys,.gp-day")) resetRender();
    var dk = dayKey(m.at);
    if (lastRender.day !== dk) {
      var d = document.createElement("div"); d.className = "gp-day"; d.textContent = dayLabel(m.at); box.appendChild(d);
      lastRender.day = dk; lastRender.uid = null;
    }
    if (m.kind === "system") {
      var s = document.createElement("div"); s.className = "gp-sys"; s.dataset.id = m.id; s.textContent = m.text; box.appendChild(s);
      lastRender.uid = null; return;
    }
    var cont = lastRender.uid === m.userId && (new Date(m.at).getTime() - lastRender.at) < 120000;
    lastRender.uid = m.userId; lastRender.at = new Date(m.at).getTime();
    var row = document.createElement("div");
    row.className = "gp-row" + (m.mine ? " mine" : "") + (cont ? " cont" : "");
    row.dataset.id = m.id; row.dataset.uid = m.userId; row.dataset.user = m.username;
    row._m = m;
    row.innerHTML = (m.mine ? "" : '<span data-user="' + esc(m.userId) + '" style="cursor:pointer">' + avatar(m.username, "sm", undefined, false, m.userId, m.av) + "</span>") +
      '<div class="gp-col">' +
        (m.mine || cont ? "" : '<div class="gp-who" data-user="' + esc(m.userId) + '"><b>' + esc(m.username) + "</b>" + (BADGE[m.badge] ? '<span class="gp-tag ' + m.badge + '">' + BADGE[m.badge] + "</span>" : "") + "</div>") +
        '<div class="gp-bubble">' + (m.reply ? '<div class="gp-reply" data-goto="' + m.reply.id + '"><b>' + esc(m.reply.username) + "</b><span>" + esc(m.reply.preview) + "</span></div>" : "") +
          bodyHtml(m) + '<span class="gp-time">' + fmtTime(m.at) + '</span><button class="gp-more" data-menu="1" aria-label="Options">' + ic("more") + "</button></div>" +
        '<div class="gp-rx" data-rx="' + m.id + '"></div>' +
      "</div>";
    box.appendChild(row);
  }
  function bodyHtml(m) {
    if (m.kind === "voice") {
      var bars = "";
      for (var i = 0; i < 26; i++) bars += '<i style="height:' + (22 + ((i * 37 + m.id * 11) % 70)) + '%"></i>';
      return '<div class="gp-voice" data-id="' + m.id + '" data-dur="' + m.duration + '"><button class="gp-play" aria-label="\u00c9couter">' + ic("play") + '</button><span class="gp-wave">' + bars + '</span><span class="gp-dur">' + fmtDur(m.duration) + "</span></div>";
    }
    if (m.kind === "image") {
      return '<img class="gp-img" data-img="' + m.id + '" alt="Image" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==">' + (m.text ? "<div>" + esc(m.text) + "</div>" : "");
    }
    if (m.kind === "poll") return '<div class="gp-poll" data-poll="' + m.id + '"></div>';
    if (m.kind === "invite") {
      var t = m.meta || {};
      return '<div class="gp-invite">' + avatar(t.name || "?", "sm", undefined, false) + "<div><small>" + (t.type === "team" ? "Invitation d'\u00e9quipe" : "Invitation de groupe") + "</small><b>" + esc(t.name || "") + '</b></div><button class="gp-btn gold" data-invite="' + esc(t.type) + ":" + esc(t.code) + '">' + (t.type === "team" ? "Rejoindre l'\u00e9quipe" : "Rejoindre") + "</button></div>";
    }
    return esc(m.text);
  }

  // met \u00e0 jour r\u00e9actions, sondages et supprime les messages disparus
  function applyWindow(w) {
    if (!w) return;
    var ids = {}; w.ids.forEach(function (i) { ids[i] = 1; });
    var min = w.ids.length ? w.ids[w.ids.length - 1] : 0;
    el.msgs.querySelectorAll(".gp-row,.gp-sys").forEach(function (r) {
      var id = Number(r.dataset.id);
      if (id >= min && !ids[id]) r.remove();
    });
    el.msgs.querySelectorAll("[data-rx]").forEach(function (box) {
      var list = w.reactions[box.dataset.rx] || [];
      var sig = JSON.stringify(list);
      if (box._sig === sig) return;
      box._sig = sig;
      box.innerHTML = list.map(function (r) {
        return '<button class="' + (r.me ? "me" : "") + '" data-react="' + esc(r.e) + '" title="' + esc(r.users.join(", ")) + '">' + r.e + " <small>" + r.n + "</small></button>";
      }).join("");
    });
    el.msgs.querySelectorAll("[data-poll]").forEach(function (box) {
      var row = box.closest(".gp-row"), m = row && row._m, p = w.polls[box.dataset.poll];
      if (!m || !p) return;
      var sig = JSON.stringify(p);
      if (box._sig === sig) return;
      box._sig = sig;
      var meta = m.meta || {}, total = Math.max(1, p.counts.reduce(function (a, b) { return a + b; }, 0));
      box.innerHTML = "<h4>" + esc(meta.question) + '</h4><div class="sub">' + (p.closed ? "Sondage termin\u00e9" : meta.multi ? "Choix multiples" : "Un seul choix") + " \u00b7 " + p.voters + " vote" + (p.voters > 1 ? "s" : "") + "</div>" +
        meta.options.map(function (o, i) {
          var pc = Math.round(p.counts[i] / total * 100);
          return '<button class="gp-opt' + (p.mine.indexOf(i) >= 0 ? " mine" : "") + '" data-vote="' + i + '"><i class="bar" style="width:' + pc + '%"></i><span><b>' + esc(o) + "</b><em>" + p.counts[i] + " \u00b7 " + pc + "%</em></span></button>";
        }).join("") + (!p.closed && (m.mine || S.rank >= 3) ? '<button class="gp-btn ghost block" data-closepoll="1" style="margin-top:.2rem;padding:.25rem">Terminer le sondage</button>' : "");
    });
    el.msgs.querySelectorAll("img[data-img]").forEach(function (img) {
      if (img._loaded) return; img._loaded = true;
      img.onerror = function () { img.alt = "Image indisponible"; };
      img.src = API + "/" + gid() + "/media/" + img.dataset.img;
    });
  }
  function getMedia(msgId) {
    var key = gid() + ":" + msgId;
    if (audioCache[key]) return Promise.resolve(audioCache[key]);
    return fetch(API + "/" + gid() + "/media/" + msgId, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("media"); return r.blob();
    }).then(function (b) { audioCache[key] = URL.createObjectURL(b); return audioCache[key]; });
  }

  /* ---------------- composer ---------------- */
  function buildComposer() {
    var f = q("#gp-footer");
    f._locked = null;
    f.innerHTML =
      '<div id="gp-replybar" hidden></div>' +
      '<div class="gp-comp" id="gp-comp">' +
        '<button class="gp-ib" id="gp-attach" title="Joindre" data-menu="1">' + ic("plus") + "</button>" +
        '<button class="gp-ib" id="gp-emoji" title="Emojis" data-menu="1">' + ic("smile") + "</button>" +
        '<textarea id="gp-input" rows="1" maxlength="800" placeholder="\u00c9crire un message\u2026"></textarea>' +
        '<button class="gp-ib" id="gp-mic" title="Message vocal">' + ic("mic") + "</button>" +
        '<button class="gp-ib gold" id="gp-send" title="Envoyer" hidden>' + ic("send") + "</button>" +
      "</div>" +
      '<div class="gp-rec" id="gp-rec" hidden><i class="dot"></i><b id="gp-rectime">0:00</b><span class="lv"><i id="gp-lv"></i></span>' +
        '<button class="gp-btn" id="gp-rec-x">Annuler</button><button class="gp-btn gold" id="gp-rec-ok">Envoyer</button></div>' +
      '<input type="file" id="gp-file" accept="image/*" hidden>';
    var inp = q("#gp-input");
    inp.addEventListener("input", function () {
      inp.style.height = "auto"; inp.style.height = Math.min(110, inp.scrollHeight) + "px";
      var has = !!inp.value.trim();
      q("#gp-send").hidden = !has; q("#gp-mic").hidden = has;
    });
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && pref.enterSend && !e.isComposing) { e.preventDefault(); sendText(); }
    });
    q("#gp-send").addEventListener("click", sendText);
    q("#gp-mic").addEventListener("click", startRecording);
    q("#gp-rec-x").addEventListener("click", function () { cancelRecording(false); });
    q("#gp-rec-ok").addEventListener("click", finishRecording);
    q("#gp-attach").addEventListener("click", function (e) {
      var m = menuAt(e.currentTarget, '<button data-a="image">' + ic("image") + 'Image</button><button data-a="poll">' + ic("poll") + 'Sondage</button><button data-a="invite">' + ic("link") + "Invitation</button>");
      m.style.left = "10px"; m.style.top = "auto"; m.style.bottom = (q("#gp-footer").offsetHeight + 4) + "px";
      m.addEventListener("click", function (ev) {
        var b = ev.target.closest("[data-a]"); if (!b) return; m.remove();
        if (b.dataset.a === "image") q("#gp-file").click();
        else if (b.dataset.a === "poll") pollDialog();
        else inviteDialog();
      });
    });
    q("#gp-emoji").addEventListener("click", function (e) {
      var set = ["\ud83d\ude00","\ud83d\ude02","\ud83d\ude0d","\ud83d\ude0e","\ud83e\udd14","\ud83d\ude2d","\ud83d\ude21","\ud83d\udc4d","\ud83d\udc4e","\ud83d\udc4f","\ud83d\ude4f","\ud83d\udd25","\ud83d\udcaf","\ud83c\udf89","\u2764\ufe0f","\ud83d\udc80","\u2694\ufe0f","\ud83d\udee1\ufe0f","\ud83d\udc51","\ud83c\udfc6","\ud83c\udfaf","\ud83d\ude34","\ud83e\udd1d","\ud83d\udc40"];
      var m = menuAt(e.currentTarget, '<div class="gp-emoji-row" style="flex-wrap:wrap;max-width:260px;border:none">' + set.map(function (x) { return '<button data-e="' + x + '">' + x + "</button>"; }).join("") + "</div>");
      m.style.left = "50px"; m.style.top = "auto"; m.style.bottom = (q("#gp-footer").offsetHeight + 4) + "px";
      m.addEventListener("click", function (ev) {
        var b = ev.target.closest("[data-e]"); if (!b) return;
        inp.value += b.dataset.e; inp.dispatchEvent(new Event("input")); inp.focus();
      });
    });
    q("#gp-file").addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0]; e.target.value = "";
      if (file) sendImage(file);
    });
  }
  function updateComposerLock() {
    var f = q("#gp-footer"); if (!f) return;
    var locked = S.timeoutUntil && new Date(S.timeoutUntil).getTime() > Date.now();
    if (!!locked === !!f._locked) return;
    f._locked = !!locked;
    if (locked) {
      cancelRecording(true);
      f.innerHTML = '<div class="gp-muted">' + ic("clock") + ' Tu es en timeout \u2014 fin dans <b id="gp-left"></b></div>';
      var tick = function () {
        var l = q("#gp-left");
        if (!S.timeoutUntil || new Date(S.timeoutUntil).getTime() <= Date.now()) { clearInterval(timers.mute); S.timeoutUntil = null; buildComposer(); return; }
        if (l) l.textContent = fmtRemaining(S.timeoutUntil);
      };
      tick(); clearInterval(timers.mute); timers.mute = setInterval(tick, 1000);
    }
  }
  function setReply(m) {
    S.reply = m ? { id: m.id, username: m.username, preview: m.kind === "text" ? m.text : "[" + m.kind + "]" } : null;
    var b = q("#gp-replybar"); if (!b) return;
    b.hidden = !S.reply;
    if (S.reply) {
      b.className = "gp-replybar";
      b.innerHTML = ic("reply") + "<span><b>" + esc(S.reply.username) + "</b> " + esc(S.reply.preview.slice(0, 80)) + '</span><button class="gp-ib" style="width:26px;height:26px" id="gp-reply-x">' + ic("x") + "</button>";
      q("#gp-reply-x").addEventListener("click", function () { setReply(null); });
      q("#gp-input").focus();
    }
  }
  function afterSend() { poll(false); setTimeout(function () { if (el.msgs) el.msgs.scrollTop = el.msgs.scrollHeight; }, 250); }
  function handleErr(err) {
    if (err.data && err.data.timeoutUntil) { S.timeoutUntil = err.data.timeoutUntil; updateComposerLock(); }
    toast(err.message, true);
  }
  function sendText() {
    var inp = q("#gp-input"); if (!inp || !S.cur) return;
    var text = inp.value.trim(); if (!text) return;
    var rep = S.reply && S.reply.id;
    inp.value = ""; inp.style.height = "auto"; q("#gp-send").hidden = true; q("#gp-mic").hidden = false; setReply(null);
    post("/" + gid() + "/messages", { text: text, replyTo: rep }).then(afterSend).catch(function (err) { inp.value = text; q("#gp-send").hidden = false; q("#gp-mic").hidden = true; handleErr(err); });
  }

  /* ---------------- images ---------------- */
  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) return reject(new Error("Ce fichier n'est pas une image."));
      if (file.type === "image/gif" && file.size < 550 * 1024) return resolve(file);
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 1280, w = img.width, h = img.height, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        var qy = 0.85;
        (function go() {
          c.toBlob(function (b) {
            if (!b) return reject(new Error("Image illisible."));
            if (b.size > 560 * 1024 && qy > 0.35) { qy -= 0.15; return go(); }
            if (b.size > 590 * 1024) return reject(new Error("Image trop lourde."));
            resolve(b);
          }, "image/jpeg", qy);
        })();
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Image illisible.")); };
      img.src = url;
    });
  }
  function sendImage(file) {
    if (!S.cur) return;
    toast("Envoi de l'image\u2026");
    var rep = S.reply && S.reply.id;
    compressImage(file).then(function (blob) {
      var qs = rep ? "?replyTo=" + rep : "";
      return fetch(API + "/" + gid() + "/image" + qs, { method: "POST", credentials: "same-origin", headers: { "Content-Type": blob.type || "image/jpeg" }, body: blob });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error(d.error || "Envoi impossible."); e.data = d; throw e; }
        setReply(null); afterSend();
      });
    }).catch(handleErr);
  }

  /* ---------------- vocaux : enregistrement ---------------- */
  function pickMime() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
    var l = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    for (var i = 0; i < l.length; i++) if (MediaRecorder.isTypeSupported(l[i])) return l[i];
    return "";
  }
  function showRec(on) {
    var r = q("#gp-rec"), c = q("#gp-comp"); if (r) r.hidden = !on; if (c) c.hidden = on;
  }
  function startRecording() {
    if (rec || !S.cur) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) return toast("Ton navigateur ne permet pas d'enregistrer un vocal.", true);
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      if (!S.cur) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
      var mime = pickMime(), recorder;
      try { recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
      catch (e) { stream.getTracks().forEach(function (t) { t.stop(); }); return toast("Enregistrement impossible.", true); }
      var local = rec = { recorder: recorder, stream: stream, chunks: [], t0: Date.now(), cancelled: false, gid: S.cur.id, replyTo: S.reply && S.reply.id, timer: null, ctx: null };
      try {
        local.ctx = new (window.AudioContext || window.webkitAudioContext)();
        var an = local.ctx.createAnalyser(); an.fftSize = 256;
        local.ctx.createMediaStreamSource(stream).connect(an); local.an = an; local.buf = new Uint8Array(an.frequencyBinCount);
      } catch (e) {}
      recorder.ondataavailable = function (e) { if (e.data && e.data.size) local.chunks.push(e.data); };
      recorder.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        clearInterval(local.timer); try { local.ctx && local.ctx.close(); } catch (e) {}
        if (rec === local) rec = null;
        showRec(false);
        if (local.cancelled) return;
        var dur = Date.now() - local.t0;
        if (dur < MIN_REC_MS) return toast("Vocal trop court.", true);
        var type = (recorder.mimeType || mime || "audio/webm").split(";")[0];
        if (type.indexOf("audio/") !== 0) type = "audio/webm";
        uploadVoice(local, new Blob(local.chunks, { type: type }), dur, type);
      };
      recorder.start(); showRec(true);
      local.timer = setInterval(function () {
        var ms = Date.now() - local.t0, t = q("#gp-rectime"); if (t) t.textContent = fmtDur(ms);
        if (local.an) { local.an.getByteTimeDomainData(local.buf); var mx = 0; for (var i = 0; i < local.buf.length; i++) mx = Math.max(mx, Math.abs(local.buf[i] - 128)); var lv = q("#gp-lv"); if (lv) lv.style.width = Math.min(100, 5 + mx * 1.4) + "%"; }
        if (ms >= MAX_REC_MS) finishRecording();
      }, 100);
    }).catch(function () { toast("Micro refus\u00e9 : autorise-le dans ton navigateur.", true); });
  }
  function finishRecording() { if (rec && rec.recorder.state !== "inactive") rec.recorder.stop(); }
  function cancelRecording(silent) {
    if (!rec) return;
    rec.cancelled = true;
    try { if (rec.recorder.state !== "inactive") rec.recorder.stop(); } catch (e) {}
    try { rec.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    clearInterval(rec.timer); try { rec.ctx && rec.ctx.close(); } catch (e) {}
    rec = null; if (!silent) showRec(false);
  }
  function uploadVoice(local, blob, dur, type) {
    var qs = "?duration=" + Math.min(dur, MAX_REC_MS) + (local.replyTo ? "&replyTo=" + local.replyTo : "");
    fetch(API + "/" + local.gid + "/voice" + qs, { method: "POST", credentials: "same-origin", headers: { "Content-Type": type }, body: blob })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) { var e = new Error(d.error || "Envoi impossible."); e.data = d; throw e; }
          setReply(null); if (S.cur && S.cur.id === local.gid) afterSend();
        });
      }).catch(handleErr);
  }

  /* ---------------- vocaux : lecture ---------------- */
  function stopPlayer() {
    if (!player) return;
    try { player.audio.pause(); } catch (e) {}
    setPlay(player, false); player = null;
  }
  function setPlay(p, on) {
    p.btn.innerHTML = ic(on ? "pause" : "play");
    if (!on) p.wave.querySelectorAll("i").forEach(function (i) { i.classList.remove("f"); });
  }
  function togglePlay(btn) {
    var wrap = btn.closest(".gp-voice"), id = wrap.dataset.id, wave = wrap.querySelector(".gp-wave");
    if (player && player.id === id) return stopPlayer();
    stopPlayer();
    getMedia(id).then(function (url) {
      var audio = new Audio(url), p = { id: id, audio: audio, btn: btn, wave: wave }, bars = wave.querySelectorAll("i");
      player = p;
      audio.addEventListener("timeupdate", function () {
        var d = audio.duration && isFinite(audio.duration) ? audio.duration : Number(wrap.dataset.dur) / 1000;
        var n = d ? Math.floor(audio.currentTime / d * bars.length) : 0;
        bars.forEach(function (b, i) { b.classList.toggle("f", i < n); });
      });
      audio.addEventListener("ended", function () { setPlay(p, false); if (player === p) player = null; });
      audio.addEventListener("error", function () { setPlay(p, false); if (player === p) player = null; toast("Lecture impossible.", true); });
      setPlay(p, true);
      return audio.play();
    }).catch(function () { toast("Lecture impossible sur cet appareil.", true); });
  }

  /* ---------------- clics dans les messages ---------------- */
  function rankOfBadge(b) { return b === "owner" || b === "admin" ? 4 : b === "chief" || b === "staff" ? 3 : b === "deputy" ? 2 : 1; }
  function onMsgClick(e) {
    var t = e.target, row = t.closest(".gp-row");
    var b;
    if ((b = t.closest(".gp-play"))) return togglePlay(b);
    if ((b = t.closest("[data-react]"))) return react(row.dataset.id, b.dataset.react);
    if ((b = t.closest("[data-vote]"))) return post("/" + gid() + "/messages/" + row.dataset.id + "/vote", { opt: Number(b.dataset.vote) }).then(function () { poll(false); }).catch(handleErr);
    if (t.closest("[data-closepoll]")) return post("/" + gid() + "/messages/" + row.dataset.id + "/close-poll").then(function () { poll(false); }).catch(handleErr);
    if ((b = t.closest("[data-invite]"))) return useInvite(b.dataset.invite);
    if ((b = t.closest("img[data-img]"))) return lightbox(b.src);
    if ((b = t.closest("[data-goto]"))) {
      var target = el.msgs.querySelector('.gp-row[data-id="' + b.dataset.goto + '"] .gp-bubble');
      if (target) { target.scrollIntoView({ block: "center" }); target.classList.add("sel"); setTimeout(function () { target.classList.remove("sel"); }, 1200); }
      return;
    }
    if ((b = t.closest("[data-user]")) && !t.closest("[data-menu]")) return userCard(b.dataset.user, row && row.dataset.user);
    if ((b = t.closest("[data-menu]")) && row) return messageMenu(b, row);
    if (row && t.closest(".gp-bubble")) { var bub = row.querySelector(".gp-bubble"); var was = bub.classList.contains("sel"); el.msgs.querySelectorAll(".gp-bubble.sel").forEach(function (x) { x.classList.remove("sel"); }); if (!was) bub.classList.add("sel"); }
  }
  function react(mid, emoji) {
    post("/" + gid() + "/messages/" + mid + "/react", { emoji: emoji }).then(function () { poll(false); }).catch(handleErr);
  }
  function lightbox(src) {
    var l = document.createElement("div"); l.className = "gp-lightbox"; l.innerHTML = '<img src="' + src + '" alt="">';
    l.addEventListener("click", function () { l.remove(); }); el.gp.appendChild(l);
  }
  function messageMenu(btn, row) {
    var m = row._m, rk = rankOfBadge(m.badge);
    var html = '<div class="gp-emoji-row">' + S.reactions.map(function (x) { return '<button data-r="' + x + '">' + x + "</button>"; }).join("") + "</div>" +
      '<button data-a="reply">' + ic("reply") + "R\u00e9pondre</button>" +
      (m.kind === "text" ? '<button data-a="copy">' + ic("copy") + "Copier</button>" : "") +
      (!m.mine ? '<button data-a="profile">' + ic("users") + "Voir le joueur</button>" : "") +
      (!m.mine && S.rank >= 2 && S.rank > rk ? '<button data-a="timeout">' + ic("clock") + "Timeout\u2026</button>" : "") +
      (!m.mine ? '<button class="danger" data-a="report">' + ic("flag") + "Signaler</button>" : "") +
      (m.canDelete ? '<button class="danger" data-a="delete">' + ic("trash") + "Supprimer</button>" : "");
    var menu = menuAt(btn, html);
    menu.addEventListener("click", function (e) {
      var r = e.target.closest("[data-r]"), a = e.target.closest("[data-a]");
      if (r) { menu.remove(); return react(m.id, r.dataset.r); }
      if (!a) return;
      menu.remove();
      switch (a.dataset.a) {
        case "reply": setReply(m); break;
        case "copy": try { navigator.clipboard.writeText(m.text); toast("Copi\u00e9"); } catch (x) {} break;
        case "profile": userCard(m.userId, m.username); break;
        case "timeout": timeoutDialog({ id: m.userId, username: m.username }); break;
        case "report": reportDialog({ id: m.userId, username: m.username }, m); break;
        case "delete": del("/" + gid() + "/messages/" + m.id).then(function () { row.remove(); }).catch(handleErr); break;
      }
    });
  }
  function useInvite(v) {
    var i = v.indexOf(":"), type = v.slice(0, i), code = v.slice(i + 1);
    if (type === "team") {
      return confirmBox("Rejoindre l'\u00e9quipe ?", "Tu quitteras ton \u00e9quipe actuelle pour rejoindre l'\u00e9quipe " + code + ".", "Rejoindre").then(function (ok) { if (ok) joinTeamByCode(code); });
    }
    joinDialog(code);
  }

  /* ---------------- membres / profil rapide ---------------- */
  function loadMembers() {
    if (!S.cur) return Promise.resolve();
    var id = S.cur.id;
    return request("/" + id + "/members").then(function (d) {
      if (!S.cur || S.cur.id !== id) return;
      S.members = d.members; S.membersMap = {};
      d.members.forEach(function (m) { S.membersMap[m.id] = m; });
      S.cur.code = d.group.code; S.cur.owner = d.group.owner; S.banned = d.banned || [];
      var dr = q("#gp-drawer-body[data-kind='members']"); if (dr) renderMembersBody(dr);
    }).catch(function () {});
  }
  function drawer(kind, title, html) {
    var old = q(".gp-drawer"); if (old) old.remove();
    var d = document.createElement("div");
    d.className = "gp-drawer";
    d.innerHTML = '<div class="gp-drawer-head"><h3>' + esc(title) + '</h3><button class="gp-ib" id="gp-dr-x">' + ic("x") + '</button></div><div class="gp-drawer-body" id="gp-drawer-body" data-kind="' + kind + '">' + html + "</div>";
    q("#gp-main").appendChild(d);
    d.querySelector("#gp-dr-x").addEventListener("click", function () { d.remove(); });
    return d;
  }
  function memberRow(m) {
    return '<div class="gp-mem" data-m="' + esc(m.id) + '">' + avatar(m.username, "sm", m.online, false, m.id, m.av) +
      '<div class="gp-mem-info"><b>' + esc(m.username) + (m.me ? " (toi)" : "") + (BADGE[m.badge] ? '<span class="gp-tag ' + m.badge + '">' + BADGE[m.badge] + "</span>" : "") + (m.timeoutUntil ? '<span class="gp-tag to">timeout</span>' : "") +
      '</b><small class="' + (m.online ? "on" : "") + '">' + presence(m) + "</small>" + leagueChip(m) + statusLines(m) + (m.note ? '<small class="gp-note">' + esc(m.note) + "</small>" : "") + "</div></div>";
  }
  function renderMembersBody(body) {
    var on = S.members.filter(function (m) { return m.online; }).length;
    body.innerHTML = (S.cur.global ? "" : codeBox()) +
      '<div class="gp-sec" style="padding-left:.2rem">' + S.members.length + " membre" + (S.members.length > 1 ? "s" : "") + " \u00b7 " + on + " en ligne</div>" +
      S.members.map(memberRow).join("");
    bindCodeBox(body);
    body.querySelectorAll("[data-m]").forEach(function (r) { r.addEventListener("click", function () { userCard(r.dataset.m); }); });
  }
  function openMembers() {
    var d = drawer("members", S.cur.global ? "Joueurs" : "Membres", '<div class="gp-skel">Chargement\u2026</div>');
    loadMembers().then(function () { var b = d.querySelector("#gp-drawer-body"); if (b && b.isConnected) renderMembersBody(b); });
  }
  function inviteLink() { return location.origin + "/?group=" + S.cur.code; }
  function codeBox() {
    return '<div class="gp-codebox"><div style="flex:1"><small style="color:var(--text-dim);font-size:.68rem">CODE D\'INVITATION</small><b>' + esc(S.cur.code) + '</b></div>' +
      '<button class="gp-ib" data-copy="code" title="Copier le code">' + ic("copy") + '</button><button class="gp-ib" data-copy="link" title="Copier le lien">' + ic("link") + "</button></div>";
  }
  function bindCodeBox(root) {
    root.querySelectorAll("[data-copy]").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.dataset.copy === "link" ? inviteLink() : S.cur.code;
        try { navigator.clipboard.writeText(v); toast(b.dataset.copy === "link" ? "Lien copi\u00e9" : "Code copi\u00e9"); } catch (e) { toast(v); }
      });
    });
  }

  function userCard(uid, nameFallback) {
    var m = S.membersMap[uid] || { id: uid, username: nameFallback || "Joueur", badge: "member", rank: 1, ago: null, online: false };
    var canMod = S.rank >= 2 && !m.me && S.rank > (m.rank || 1);
    var owner = S.cur.owner && !S.cur.global && !m.me;
    var mo = modal('<div style="text-align:center">' + avatar(m.username, "lg", m.online, false, m.id, m.av) +
      '<h3 style="margin-top:.6rem">' + esc(m.username) + "</h3>" +
      (BADGE[m.badge] ? '<span class="gp-tag ' + m.badge + '" style="margin:0">' + BADGE[m.badge] + "</span>" : "") +
      '<p class="sub" style="margin:.4rem 0 .8rem">' + (m.online ? '<span style="color:#35e08a">\u25cf </span>' : "") + presence(m) + (m.timeoutUntil ? " \u00b7 timeout " + fmtRemaining(m.timeoutUntil) : "") + "</p>" + (m.league != null ? '<div class="gp-acts">' + leagueChip(m) + "</div>" : "") + (m.status ? '<div class="gp-acts">' + statusLines(m) + "</div>" : "") + (m.note ? '<p class="gp-note" style="margin:.2rem 0">' + esc(m.note) + "</p>" : "") + (m.bio ? '<p class="gp-bio">' + esc(m.bio) + "</p>" : "") + "</div>" +
      '<div class="gp-grid">' +
        (!m.me ? '<button class="gp-tile" data-a="report">' + ic("flag") + "Signaler</button>" : "") +
        (canMod ? '<button class="gp-tile" data-a="timeout">' + ic("clock") + "Timeout</button>" : "") +
        (owner ? '<button class="gp-tile" data-a="chief">' + ic("star") + (m.badge === "chief" ? "Retirer chef" : "Nommer chef") + "</button>" +
                 '<button class="gp-tile" data-a="deputy">' + ic("shield") + (m.badge === "deputy" ? "Retirer sous-chef" : "Nommer sous-chef") + "</button>" +
                 '<button class="gp-tile" data-a="kick">' + ic("out") + "Exclure</button>" +
                 '<button class="gp-tile" data-a="ban">' + ic("ban") + "Bannir</button>" : "") +
      '</div><div class="gp-gp" data-uid="' + esc(String(m.id)) + '"></div><div class="gp-actions"><button class="gp-btn" data-a="close">Fermer</button></div>');
    loadGameProfile(mo.querySelector(".gp-gp"), m.me ? "me" : m.id);
    mo.addEventListener("click", function (e) {
      var a = e.target.closest("[data-a]"); if (!a) return;
      var act = a.dataset.a; mo.remove();
      if (act === "report") reportDialog(m);
      else if (act === "timeout") timeoutDialog(m);
      else if (act === "chief" || act === "deputy") modAction("/role", { userId: m.id, role: m.badge === act ? "member" : act }, "R\u00f4le mis \u00e0 jour");
      else if (act === "kick") confirmBox("Exclure " + m.username + " ?", "Il pourra revenir avec le code du groupe.", "Exclure", true).then(function (ok) { if (ok) modAction("/kick", { userId: m.id }, m.username + " exclu"); });
      else if (act === "ban") confirmBox("Bannir " + m.username + " ?", "Il ne pourra plus rejoindre ce groupe.", "Bannir", true).then(function (ok) { if (ok) modAction("/ban", { userId: m.id }, m.username + " banni"); });
    });
  }
  function modAction(path, data, okMsg) {
    return post("/" + gid() + path, data).then(function () { toast(okMsg); loadMembers(); poll(false); }).catch(handleErr);
  }
  function timeoutDialog(m) {
    var opts = [[1, "1 min"], [5, "5 min"], [10, "10 min"], [30, "30 min"], [60, "1 h"], [360, "6 h"], [1440, "1 jour"], [10080, "7 jours"]];
    var sel = 10;
    var mo = modal("<h3>Timeout \u00b7 " + esc(m.username) + '</h3><p class="sub">Il ne pourra plus \u00e9crire pendant la dur\u00e9e choisie.</p><div class="gp-chips" id="gp-to">' +
      opts.map(function (o) { return '<button class="gp-chip' + (o[0] === sel ? " on" : "") + '" data-m="' + o[0] + '">' + o[1] + "</button>"; }).join("") +
      '</div><div class="gp-actions"><button class="gp-btn" data-x="lift">Lever</button><button class="gp-btn" data-x="no">Annuler</button><button class="gp-btn red" data-x="ok">Appliquer</button></div>');
    mo.addEventListener("click", function (e) {
      var c = e.target.closest("[data-m]");
      if (c) { sel = Number(c.dataset.m); mo.querySelectorAll(".gp-chip").forEach(function (x) { x.classList.toggle("on", x === c); }); return; }
      var x = e.target.closest("[data-x]"); if (!x) return; mo.remove();
      if (x.dataset.x === "ok") modAction("/timeout", { userId: m.id, minutes: sel }, m.username + " est en timeout");
      if (x.dataset.x === "lift") modAction("/timeout", { userId: m.id, minutes: 0 }, "Timeout lev\u00e9");
    });
  }
  function reportDialog(m, msg) {
    var reasons = [["spam", "Spam"], ["insults", "Insultes"], ["harassment", "Harc\u00e8lement"], ["inappropriate", "Contenu inappropri\u00e9"], ["cheating", "Triche"], ["other", "Autre"]];
    var sel = "insults";
    var mo = modal("<h3>Signaler " + esc(m.username) + '</h3><p class="sub">Ton signalement est envoy\u00e9 \u00e0 l\'\u00e9quipe de mod\u00e9ration.</p><div class="gp-chips" id="gp-rs">' +
      reasons.map(function (r) { return '<button class="gp-chip' + (r[0] === sel ? " on" : "") + '" data-r="' + r[0] + '">' + r[1] + "</button>"; }).join("") +
      '</div><label class="gp-label">D\u00e9tails (facultatif)</label><textarea class="gp-field" id="gp-rd" rows="3" maxlength="300" placeholder="Explique ce qui s\'est pass\u00e9"></textarea><div class="gp-err" id="gp-re"></div>' +
      '<div class="gp-actions"><button class="gp-btn" data-x="no">Annuler</button><button class="gp-btn red" data-x="ok">Envoyer</button></div>');
    mo.addEventListener("click", function (e) {
      var c = e.target.closest("[data-r]");
      if (c) { sel = c.dataset.r; mo.querySelectorAll(".gp-chip").forEach(function (x) { x.classList.toggle("on", x === c); }); return; }
      var x = e.target.closest("[data-x]"); if (!x) return;
      if (x.dataset.x === "no") return mo.remove();
      post("/" + gid() + "/report", { userId: m.id, reason: sel, details: mo.querySelector("#gp-rd").value, messageId: msg && msg.id })
        .then(function (d) { mo.remove(); toast(d.message || "Signalement envoy\u00e9"); })
        .catch(function (err) { mo.querySelector("#gp-re").textContent = err.message; });
    });
  }

  /* ---------------- cr\u00e9er / rejoindre / sondage / invitation ---------------- */
  function createGroupDialog() {
    var mo = modal('<h3>Nouveau groupe</h3><p class="sub">Tu seras le cr\u00e9ateur : toi seul pourras nommer le chef, le sous-chef, exclure et bannir.</p>' +
      '<input class="gp-field" id="gp-n" maxlength="28" placeholder="Nom du groupe" autocomplete="off"><div class="gp-err" id="gp-e"></div>' +
      '<div class="gp-actions"><button class="gp-btn" data-x="no">Annuler</button><button class="gp-btn gold" data-x="ok">Cr\u00e9er</button></div>');
    var inp = mo.querySelector("#gp-n"); inp.focus();
    var go = function () {
      post("", { name: inp.value }).then(function (d) { mo.remove(); return loadList().then(function () { openGroup(d.id); }); })
        .catch(function (err) { mo.querySelector("#gp-e").textContent = err.message; });
    };
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    mo.addEventListener("click", function (e) { var x = e.target.closest("[data-x]"); if (!x) return; if (x.dataset.x === "no") mo.remove(); else go(); });
  }
  function joinDialog(code) {
    var mo = modal('<h3>Rejoindre un groupe</h3><p class="sub">Entre le code \u00e0 8 chiffres re\u00e7u d\'un ami.</p>' +
      '<input class="gp-field" id="gp-c" maxlength="8" inputmode="numeric" placeholder="00000000" autocomplete="off" style="letter-spacing:.3em;text-align:center;font-size:1.2rem"><div class="gp-err" id="gp-e"></div>' +
      '<div class="gp-actions"><button class="gp-btn" data-x="no">Annuler</button><button class="gp-btn gold" data-x="ok">Rejoindre</button></div>');
    var inp = mo.querySelector("#gp-c"); if (code) inp.value = code; inp.focus();
    var go = function () {
      post("/join", { code: inp.value.trim() }).then(function (d) { mo.remove(); toast(d.already ? "Tu es d\u00e9j\u00e0 dans ce groupe" : "Bienvenue dans " + d.name); return loadList().then(function () { openGroup(d.id); }); })
        .catch(function (err) { mo.querySelector("#gp-e").textContent = err.message; });
    };
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    mo.addEventListener("click", function (e) { var x = e.target.closest("[data-x]"); if (!x) return; if (x.dataset.x === "no") mo.remove(); else go(); });
  }
  function pollDialog() {
    var mo = modal('<h3>Cr\u00e9er un sondage</h3><p class="sub">Pose une question \u00e0 tout le groupe.</p><input class="gp-field" id="gp-q" maxlength="140" placeholder="Ta question" autocomplete="off">' +
      '<div id="gp-opts"></div><button class="gp-btn ghost block" id="gp-addopt">' + ic("plus") + 'Ajouter un choix</button>' +
      '<div class="gp-switch"><div>Choix multiples<small>Chacun peut voter pour plusieurs r\u00e9ponses</small></div><button class="gp-tg" id="gp-multi"></button></div><div class="gp-err" id="gp-e"></div>' +
      '<div class="gp-actions"><button class="gp-btn" data-x="no">Annuler</button><button class="gp-btn gold" data-x="ok">Publier</button></div>', true);
    var box = mo.querySelector("#gp-opts"), n = 0;
    var add = function () { if (n >= 6) return; n++; var i = document.createElement("input"); i.className = "gp-field"; i.maxLength = 60; i.placeholder = "Choix " + n; box.appendChild(i); };
    add(); add();
    mo.querySelector("#gp-addopt").addEventListener("click", add);
    mo.querySelector("#gp-multi").addEventListener("click", function (e) { e.currentTarget.classList.toggle("on"); });
    mo.addEventListener("click", function (e) {
      var x = e.target.closest("[data-x]"); if (!x) return;
      if (x.dataset.x === "no") return mo.remove();
      var opts = Array.prototype.map.call(box.querySelectorAll("input"), function (i) { return i.value; }).filter(function (v) { return v.trim(); });
      post("/" + gid() + "/poll", { question: mo.querySelector("#gp-q").value, options: opts, multi: mo.querySelector("#gp-multi").classList.contains("on") })
        .then(function () { mo.remove(); afterSend(); }).catch(function (err) { mo.querySelector("#gp-e").textContent = err.message; });
    });
  }
  function teamCode() { if (T.team && T.team.code) return T.team.code; try { var v = JSON.parse(localStorage.getItem("trugo_teamcode")); return /^\d{8}$/.test(v) ? v : null; } catch (e) { return null; } }
  function inviteDialog() {
    loadTeam();
    var mine = S.groups.filter(function (g) { return !g.global; }), tc = teamCode();
    var mo = modal('<h3>Envoyer une invitation</h3><p class="sub">Les membres pourront rejoindre en un clic.</p><div class="gp-grid" style="grid-template-columns:1fr">' +
      '<button class="gp-tile" data-t="team" ' + (tc ? "" : 'style="opacity:.5"') + ">" + ic("shield") + "Mon \u00e9quipe de jeu" + (tc ? "" : "<small>G\u00e9n\u00e8re d'abord un code dans \u00ab \u00c9quipe \u00bb</small>") + "</button>" +
      mine.map(function (g) { return '<button class="gp-tile" data-g="' + g.id + '">' + ic("users") + "Groupe \u00ab " + esc(g.name) + " \u00bb</button>"; }).join("") +
      '</div><div class="gp-actions"><button class="gp-btn" data-x="no">Annuler</button></div>');
    mo.addEventListener("click", function (e) {
      var t = e.target.closest("[data-t],[data-g],[data-x]"); if (!t) return;
      if (t.dataset.x) return mo.remove();
      var body = t.dataset.t ? { type: "team", code: tc } : { type: "group", groupId: t.dataset.g };
      if (t.dataset.t && !tc) return toast("Tu n'as pas encore de code d'\u00e9quipe.", true);
      post("/" + gid() + "/invite", body).then(function () { mo.remove(); afterSend(); }).catch(handleErr);
    });
  }

  /* ---------------- infos / param\u00e8tres ---------------- */
  function sw(key, label, hint) {
    return '<div class="gp-switch"><div>' + label + "<small>" + hint + '</small></div><button class="gp-tg' + (pref[key] ? " on" : "") + '" data-pref="' + key + '"></button></div>';
  }
  function prefsHtml() {
    return profileHtml() + myProfileHtml() + '<div class="gp-sec" style="padding-left:0">Pr\u00e9f\u00e9rences</div>' +
      sw("sound", "Son des messages", "Petit son quand quelqu'un \u00e9crit") +
      sw("enterSend", "Entr\u00e9e pour envoyer", "Maj + Entr\u00e9e pour aller \u00e0 la ligne") +
      sw("anim", "Animations", "D\u00e9sactive-les pour plus de fluidit\u00e9") +
      sw("broadcast", "Diffuser ma partie en appel", "Les membres de l'appel peuvent te regarder jouer") +
      '<div class="gp-switch"><div>Taille du texte</div><div class="gp-chips">' + [["s", "Petit"], ["m", "Normal"], ["l", "Grand"]].map(function (o) { return '<button class="gp-chip' + (pref.size === o[0] ? " on" : "") + '" data-size="' + o[0] + '">' + o[1] + "</button>"; }).join("") + "</div></div>";
  }
  function bindPrefs(root) {
    bindProfile(root);
    bindMyProfile(root);
    root.addEventListener("click", function (e) {
      var t = e.target.closest("[data-pref]"), s = e.target.closest("[data-size]");
      if (t) { pref[t.dataset.pref] = !pref[t.dataset.pref]; t.classList.toggle("on", pref[t.dataset.pref]); savePrefs(); applyPrefs(); syncLive(); if (t.dataset.pref === "music") Live.send(true); }
      if (s) { pref.size = s.dataset.size; root.querySelectorAll("[data-size]").forEach(function (x) { x.classList.toggle("on", x === s); }); savePrefs(); applyPrefs(); }
    });
  }
  function prefsDialog() {
    var mo = modal("<h3>Param\u00e8tres du chat</h3>" + prefsHtml() + '<div class="gp-actions"><button class="gp-btn gold" data-x="1">Termin\u00e9</button></div>');
    bindPrefs(mo); mo.addEventListener("click", function (e) { if (e.target.closest("[data-x]")) mo.remove(); });
  }
  function openInfo() {
    if (!S.cur) return;
    var g = S.cur, owner = g.owner && !g.global;
    var d = drawer("info", "Infos du groupe",
      '<div style="text-align:center;margin-bottom:.8rem">' + avatar(g.name, "lg", undefined, g.global) + '<h3 style="margin-top:.5rem;font-family:var(--font-display)">' + esc(g.name) + "</h3>" +
      '<small style="color:var(--text-dim)">' + (g.global ? "Public \u2014 ouvert \u00e0 tous les joueurs" : (S.state.members || 0) + " membres") + "</small></div>" +
      (g.global ? "" : codeBox()) +
      (owner ? '<button class="gp-btn block" id="gp-rename" style="margin-bottom:.4rem">' + ic("edit") + 'Renommer</button><button class="gp-btn block" id="gp-regen" style="margin-bottom:.4rem">' + ic("link") + "Nouveau code</button>" : "") +
      (S.banned && S.banned.length && owner ? '<div class="gp-sec" style="padding-left:0">Bannis</div>' + S.banned.map(function (b) { return '<div class="gp-mem" style="cursor:default">' + avatar(b.username, "sm") + '<div class="gp-mem-info"><b>' + esc(b.username) + '</b></div><button class="gp-btn" data-unban="' + esc(b.id) + '">D\u00e9bannir</button></div>'; }).join("") : "") +
      prefsHtml() +
      (g.global ? "" : '<button class="gp-btn block" id="gp-leave" style="margin-top:.8rem">' + ic("out") + "Quitter le groupe</button>") +
      (owner ? '<button class="gp-btn red block" id="gp-delete" style="margin-top:.4rem">' + ic("trash") + "Supprimer le groupe</button>" : ""));
    var body = d.querySelector("#gp-drawer-body");
    bindCodeBox(body); bindPrefs(body);
    var on = function (id, fn) { var b = body.querySelector(id); if (b) b.addEventListener("click", fn); };
    on("#gp-rename", function () {
      var mo = modal('<h3>Renommer</h3><input class="gp-field" id="gp-n" maxlength="28" value="' + esc(g.name) + '"><div class="gp-err" id="gp-e"></div><div class="gp-actions"><button class="gp-btn" data-x="no">Annuler</button><button class="gp-btn gold" data-x="ok">Enregistrer</button></div>');
      mo.addEventListener("click", function (e) { var x = e.target.closest("[data-x]"); if (!x) return; if (x.dataset.x === "no") return mo.remove();
        post("/" + gid() + "/rename", { name: mo.querySelector("#gp-n").value }).then(function () { mo.remove(); d.remove(); poll(false); loadList(); }).catch(function (err) { mo.querySelector("#gp-e").textContent = err.message; }); });
    });
    on("#gp-regen", function () { confirmBox("Nouveau code ?", "L'ancien code et les anciennes invitations ne fonctionneront plus.", "G\u00e9n\u00e9rer").then(function (ok) { if (ok) post("/" + gid() + "/regen-code").then(function (r) { S.cur.code = r.code; d.remove(); openInfo(); toast("Nouveau code g\u00e9n\u00e9r\u00e9"); }).catch(handleErr); }); });
    on("#gp-leave", function () { confirmBox("Quitter \u00ab " + g.name + " \u00bb ?", g.owner ? "Le r\u00f4le de cr\u00e9ateur sera transmis \u00e0 un autre membre." : "Tu pourras revenir avec le code.", "Quitter", true).then(function (ok) { if (ok) post("/" + gid() + "/leave").then(function () { stopAll(); S.cur = null; renderMainEmpty(); loadList(); toast("Groupe quitt\u00e9"); }).catch(handleErr); }); });
    on("#gp-delete", function () { confirmBox("Supprimer \u00ab " + g.name + " \u00bb ?", "Tous les messages seront perdus d\u00e9finitivement.", "Supprimer", true).then(function (ok) { if (ok) del("/" + gid()).then(function () { stopAll(); S.cur = null; renderMainEmpty(); loadList(); toast("Groupe supprim\u00e9"); }).catch(handleErr); }); });
    body.addEventListener("click", function (e) { var u = e.target.closest("[data-unban]"); if (u) post("/" + gid() + "/unban", { userId: u.dataset.unban }).then(function () { return loadMembers(); }).then(function () { d.remove(); openInfo(); }).catch(handleErr); });
    loadMembers().then(function () { if (d.isConnected && S.banned && S.banned.length && owner && !body.querySelector("[data-unban]")) { d.remove(); openInfo(); } });
  }

  /* ---------------- photo de profil ---------------- */
  function squareImage(file, size) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) return reject(new Error("Ce fichier n'est pas une image."));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var s = Math.min(img.width, img.height), c = document.createElement("canvas");
        c.width = c.height = size;
        c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        URL.revokeObjectURL(url);
        var qy = 0.88;
        (function go() {
          c.toBlob(function (b) {
            if (!b) return reject(new Error("Image illisible."));
            if (b.size > 140 * 1024 && qy > 0.3) { qy -= 0.15; return go(); }
            resolve(b);
          }, "image/jpeg", qy);
        })();
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Image illisible.")); };
      img.src = url;
    });
  }
  function profileHtml() {
    var me = S.me || {};
    return '<div class="gp-sec" style="padding-left:0">Mon profil</div><div class="gp-prof" id="gp-prof">' +
      '<span id="gp-prof-av">' + avatar(me.username || "?", "lg", undefined, false, me.id, me.av) + "</span>" +
      '<div><b>' + esc(me.username || "") + '</b><div style="display:flex;gap:.4rem;margin-top:.4rem;flex-wrap:wrap"><button class="gp-btn gold" id="gp-av-up">' + ic("camera") + 'Changer la photo</button>' +
      '<button class="gp-btn" id="gp-av-del"' + (me.av ? "" : " hidden") + ">Retirer</button></div></div>" +
      '<input type="file" id="gp-av-file" accept="image/*" hidden></div>';
  }
  function bindProfile(root) {
    var up = root.querySelector("#gp-av-up"), file = root.querySelector("#gp-av-file"), del1 = root.querySelector("#gp-av-del");
    if (!up) return;
    function refresh() {
      var me = S.me;
      root.querySelector("#gp-prof-av").innerHTML = avatar(me.username, "lg", undefined, false, me.id, me.av);
      del1.hidden = !me.av;
      S.membersMap = S.membersMap || {}; if (S.membersMap[me.id]) S.membersMap[me.id].av = me.av;
      if (S.members) S.members.forEach(function (m) { if (m.id === me.id) m.av = me.av; });
      if (S.cur) poll(false);
    }
    up.addEventListener("click", function () { file.click(); });
    file.addEventListener("change", function () {
      var f = file.files && file.files[0]; file.value = ""; if (!f) return;
      squareImage(f, 256).then(function (b) {
        return fetch(API + "/avatar", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "image/jpeg" }, body: b }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || "Envoi impossible."); return d; });
        });
      }).then(function (d) { S.me.av = d.av; refresh(); toast("Photo de profil mise \u00e0 jour"); }).catch(function (e) { toast(e.message, true); });
    });
    del1.addEventListener("click", function () {
      del("/avatar").then(function () { S.me.av = 0; refresh(); toast("Photo retir\u00e9e"); }).catch(handleErr);
    });
  }

  /* ---------------- biographie, note et activit\u00e9 en direct ---------------- */
  var LIVE_TXT = { home: "Le joueur est chez lui", walk: "Le joueur marche", travel: "Le joueur voyage", music: "Le joueur \u00e9coute de la musique" };
  function statusLines(m) {
    var st = m && m.status; if (!st) return "";
    var out = [];
    if (st.home) out.push(LIVE_TXT.home);
    if (st.move) out.push(LIVE_TXT[st.move]);
    if (st.music) out.push(LIVE_TXT.music);
    return out.map(function (t) { return '<small class="gp-act">' + esc(t) + "</small>"; }).join("");
  }

  /* ----- profil de jeu : ligue supreme + badges (tout en bas du profil) ----- */
  function gameProfileHtml(d) {
    var S0 = window.TRUGO_SUPREME || [], h = "", s = d.sup || {};
    h += '<div class="gp-sec" style="padding-left:0">Ligue supr\u00eame</div>';
    if (!s.reached) h += '<p class="gp-gp-none">Pas encore atteint la ligue supr\u00eame <small>(1000 \u00e9liminations sur une saison).</small></p>';
    else {
      var mc = (S0[s.maxLevel] || {}).c || "#fff", cc = (S0[s.level] || {}).c || "#fff";
      h += '<div class="gp-sup" style="--c:' + mc + '"><div class="gp-sup-top"><span class="gp-sup-ic">\u2605</span><div><b>' + esc(s.maxName) + "</b><small>ligue max atteinte</small></div><div class=\"gp-sup-t\"><b>" + s.times + "\u00d7</b><small>atteinte</small></div></div>" +
        '<div class="gp-stats"><div><b>' + s.maxKills + "</b><small>kills max</small></div><div><b>" + s.curKills + "</b><small>kills actuels<br>(" + esc(s.curLabel) + ")</small></div>" +
        "<div><b>" + (s.perHour == null ? "\u2014" : s.perHour) + "</b><small>kills / heure<br>(estimation)</small></div><div><b>" + (s.perMatch == null ? "\u2014" : s.perMatch) + "</b><small>kills / partie<br>(moyenne)</small></div></div>" +
        '<p class="gp-gp-now" style="--c:' + cc + '">Ligue actuelle : <b>' + esc(s.name) + "</b> \u00b7 " + s.totalKills + " kills sur " + s.matches + " partie" + (s.matches > 1 ? "s" : "") + "</p></div>";
    }
    h += '<div class="gp-sec" style="padding-left:0">Badges</div><div class="gp-badges">' + (d.badges || []).map(function (b) {
      return '<div class="gp-bd ' + (b.earned ? "on" : "off") + " bd-" + b.id + '"><span>' + b.icon + "</span><b>" + esc(b.name) + "</b><small>" + esc(b.desc) + "</small></div>";
    }).join("") + "</div>";
    if (d.fights != null) h += '<p class="gp-gp-now">Combats : <b>' + d.fights + "</b> \u00b7 niveau max : <b>" + d.level + "</b></p>";
    return h;
  }
  function loadGameProfile(box, uid) {
    if (!box) return;
    box.innerHTML = '<p class="gp-gp-none">Chargement\u2026</p>';
    request("/gameprofile/" + encodeURIComponent(uid)).then(function (d) { box.innerHTML = gameProfileHtml(d); }).catch(function () { box.innerHTML = ""; });
  }
  function leagueChip(m) {
    var L = window.TRUGO_LEAGUES; if (!L || m == null || m.league == null) return "";
    var l = L[m.league] || L[0];
    return '<small class="gp-lg" style="--c:' + l.c + '">' + esc(l.n) + (m.elims ? " \u00b7 " + m.elims + " \u00e9lim." : "") + "</small>";
  }
  var P = { bio: "", note: "", live: false, loaded: false };
  function loadProfile() {
    return request("/profile/me").then(function (d) { P.bio = d.bio || ""; P.note = d.note || ""; P.live = !!d.live; P.loaded = true; Live.sync(); return P; }).catch(function () { return P; });
  }
  function saveProfile(patch) {
    return post("/profile/me", patch).then(function (d) { P.bio = d.bio; P.note = d.note; P.live = d.live; Live.sync(); return d; });
  }
  var Live = (function () {
    var watchId = null, samples = [], act = null, timer = null, lastSent = 0;
    function dist(a, b) {
      var R = 6371000, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
      var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return 2 * R * Math.asin(Math.sqrt(x));
    }
    function onPos(p) {
      var c = p.coords; samples.push({ t: Date.now(), lat: c.latitude, lon: c.longitude, acc: c.accuracy || 50 });
      var cut = Date.now() - 120000; samples = samples.filter(function (s) { return s.t >= cut; });
    }
    // Classe l'activit\u00e9 sur au moins 30 s. Les coordonn\u00e9es ne quittent jamais l'appareil : seul \u00ab still / walk / travel \u00bb est envoy\u00e9.
    function classify() {
      if (samples.length < 2) return act;
      var last = samples[samples.length - 1], first = null;
      for (var i = 0; i < samples.length; i++) { if (last.t - samples[i].t >= 30000) first = samples[i]; }
      if (!first) return act;
      var d = dist(first, last), dt = (last.t - first.t) / 1000, noise = Math.max(20, first.acc, last.acc);
      if (d <= noise) return "still";
      var v = d / dt;
      if (v < 0.4) return "still";
      return v <= 2.8 ? "walk" : "travel";
    }
    function musicNow() {
      if (pref.music) return true;
      try { if (navigator.mediaSession && navigator.mediaSession.playbackState === "playing") return true; } catch (e) {}
      var a = document.querySelectorAll("audio");
      for (var i = 0; i < a.length; i++) { var x = a[i]; if (!x.paused && !x.muted && !x.srcObject && !/^blob:/.test(x.currentSrc || "")) return true; }
      return false;
    }
    function send(force) {
      if (!P.live) return;
      var now = Date.now(); if (!force && now - lastSent < 25000) return; lastSent = now;
      act = classify();
      post("/live", { act: act, music: musicNow() }).then(function (d) { if (d && d.live === false) stop(); }).catch(function () {});
    }
    function start() {
      if (watchId != null || !navigator.geolocation) { if (!timer) timer = setInterval(function () { send(false); }, 30000); send(true); return; }
      try { watchId = navigator.geolocation.watchPosition(onPos, function () {}, { enableHighAccuracy: false, maximumAge: 15000, timeout: 60000 }); } catch (e) {}
      if (!timer) timer = setInterval(function () { send(false); }, 30000);
      send(true);
    }
    function stop() {
      if (watchId != null) { try { navigator.geolocation.clearWatch(watchId); } catch (e) {} watchId = null; }
      clearInterval(timer); timer = null; samples = []; act = null;
    }
    function sync() { if (P.live) start(); else stop(); }
    document.addEventListener("visibilitychange", function () { if (!document.hidden) send(true); });
    // demande l'autorisation de position (n\u00e9cessaire pour savoir si la personne bouge)
    function askPermission() {
      return new Promise(function (resolve) {
        if (!navigator.geolocation) return resolve("unsupported");
        navigator.geolocation.getCurrentPosition(function () { resolve("granted"); }, function (e) { resolve(e && e.code === 1 ? "denied" : "error"); }, { timeout: 15000, maximumAge: 60000 });
      });
    }
    return { sync: sync, start: start, stop: stop, ask: askPermission, send: send };
  })();
  function myProfileHtml() {
    return '<div class="gp-sec" style="padding-left:0">\u00c0 propos de moi</div>' +
      '<label class="gp-lbl">Note <small>(courte, visible \u00e0 c\u00f4t\u00e9 de ton nom)</small></label><input class="gp-in" id="gp-note" maxlength="60" placeholder="Ex : en qu\u00eate de la couronne" value="' + esc(P.note) + '">' +
      '<label class="gp-lbl">Biographie</label><textarea class="gp-in" id="gp-bio" rows="3" maxlength="300" placeholder="Parle un peu de toi\u2026">' + esc(P.bio) + '</textarea>' +
      '<button class="gp-btn gold block" id="gp-bio-save" style="margin:.4rem 0 .8rem">Enregistrer</button>' +
      '<div class="gp-sec" style="padding-left:0">Activit\u00e9 en direct</div>' +
      '<div class="gp-switch"><div>Partager mon activit\u00e9<small>Affiche \u00ab chez lui \u00bb, \u00ab marche \u00bb, \u00ab voyage \u00bb ou \u00ab \u00e9coute de la musique \u00bb sous ta pr\u00e9sence. D\u00e9sactiv\u00e9 par d\u00e9faut.</small></div><button class="gp-tg' + (P.live ? " on" : "") + '" id="gp-live-tg"></button></div>' +
      '<p class="gp-privacy" id="gp-live-note">Ta position GPS n\'est jamais envoy\u00e9e ni enregistr\u00e9e : seule l\'activit\u00e9 d\u00e9duite l\'est. Ton navigateur te demandera l\'acc\u00e8s \u00e0 la localisation, et il ne la lit que lorsque le jeu est ouvert (un site web ne peut pas la suivre quand il est ferm\u00e9).</p>' +
      sw("music", "Je suis en train d'\u00e9couter de la musique", "Un site ne voit pas tes autres applis : active-le toi-m\u00eame (affich\u00e9 seulement si le partage est activ\u00e9)") +
      '<div class="gp-gp" id="gp-gp-me"></div>';
  }
  function bindMyProfile(root) {
    var save = root.querySelector("#gp-bio-save"); if (!save) return;
    loadGameProfile(root.querySelector("#gp-gp-me"), "me");
    loadProfile().then(function () {
      var n = root.querySelector("#gp-note"), b = root.querySelector("#gp-bio"), t = root.querySelector("#gp-live-tg");
      if (n && document.activeElement !== n) n.value = P.note; if (b && document.activeElement !== b) b.value = P.bio; if (t) t.classList.toggle("on", P.live);
    });
    save.addEventListener("click", function () {
      saveProfile({ note: root.querySelector("#gp-note").value, bio: root.querySelector("#gp-bio").value }).then(function () { toast("Profil enregistr\u00e9"); loadMembers(); }).catch(handleErr);
    });
    var tg = root.querySelector("#gp-live-tg"), note = root.querySelector("#gp-live-note");
    tg.addEventListener("click", function () {
      if (P.live) return saveProfile({ live: false }).then(function () { tg.classList.remove("on"); toast("Partage d'activit\u00e9 d\u00e9sactiv\u00e9"); }).catch(handleErr);
      note.textContent = "Autorise la localisation dans la fen\u00eatre de ton navigateur\u2026";
      Live.ask().then(function (r) {
        if (r === "denied") { note.textContent = "Localisation refus\u00e9e : autorise-la dans les r\u00e9glages du site pour activer le partage."; return toast("Localisation refus\u00e9e", true); }
        if (r === "unsupported") { note.textContent = "Ce navigateur ne g\u00e8re pas la localisation : seule la musique pourra \u00eatre partag\u00e9e."; }
        return saveProfile({ live: true }).then(function () { tg.classList.add("on"); toast("Partage d'activit\u00e9 activ\u00e9"); });
      }).catch(handleErr);
    });
  }

  /* ---------------- \u00e9quipes de jeu synchronis\u00e9es avec le serveur ---------------- */
  var T = { team: null, busy: false, lastLaunch: null, bypass: false, cd: null };
  var MODE_NAMES = { couronne: "Couronne Hunter", maxitrone: "Maxitrone", frappe: "Frappe Dolling" };
  function applyTeam(d) {
    if (!d || !d.team) return;
    T.team = d.team;
    handleLaunch(d.team.launch);
    try { localStorage.setItem("trugo_teamcode", JSON.stringify(d.team.code)); } catch (e) {}
    try { if (typeof APP !== "undefined") APP.teamCode = d.team.code; } catch (e) {}
    var disp = document.getElementById("team-code-display"); if (disp) disp.textContent = d.team.code;
    renderTeamBlock();
  }
  function loadTeam() { return request("/team").then(applyTeam).catch(function () {}); }
  function teamBox() {
    var panel = document.getElementById("panel-team"); if (!panel) return null;
    var box = document.getElementById("gp-team-box");
    if (!box) {
      box = document.createElement("div"); box.id = "gp-team-box"; box.className = "panel-section gp-teambox";
      var note = panel.querySelector(".panel-note");
      if (note) { note.textContent = "\u00c9quipe synchronis\u00e9e avec le serveur : tes co\u00e9quipiers te voient en direct."; note.parentNode.insertBefore(box, note); }
      else panel.querySelector(".panel-inner").appendChild(box);
      box.addEventListener("click", function (e) {
        var k = e.target.closest("[data-kick]"), l = e.target.closest("#gp-team-leave");
        if (e.target.closest("#gp-team-launch")) { var pp = document.getElementById("panel-team"); if (pp) pp.classList.remove("open"); return launchTeam(false); }
        if (k) post("/team/kick", { userId: k.dataset.kick }).then(applyTeam).catch(function (er) { tmsg(er.message, true); });
        if (l) post("/team/leave").then(function (d) { applyTeam(d); tmsg("Tu as quitt\u00e9 l'\u00e9quipe."); }).catch(function (er) { tmsg(er.message, true); });
      });
    }
    return box;
  }
  function tmsg(text, err) {
    var f = document.getElementById("join-code-feedback"); if (!f) return;
    f.textContent = text; f.style.color = err ? "#ff7b7b" : "#6fe39a";
  }
  function renderTeamBlock() {
    var box = teamBox(), t = T.team; if (!box || !t) return;
    var amLeader = t.members.some(function (m) { return m.me && m.leader; });
    box.innerHTML = '<h3>Membres de l\'\u00e9quipe (' + t.members.length + "/" + t.max + ")</h3>" +
      t.members.map(function (m) {
        return '<div class="gp-tm">' + avatar(m.username, "sm", m.online, false, m.id, m.av) + '<div class="gp-tm-i"><b>' + esc(m.username) + (m.me ? " (toi)" : "") + "</b><small>" + (m.online ? "En ligne \u00b7 maintenant" : esc(m.ago || "hors ligne")) + "</small>" + leagueChip(m) + statusLines(m) + (m.note ? '<small class="gp-note">' + esc(m.note) + "</small>" : "") + "</div>" +
          (m.leader ? '<span class="gp-tm-b">Chef</span>' : "") +
          (amLeader && !m.me ? '<button class="gp-btn red" data-kick="' + esc(m.id) + '" style="padding:.2rem .5rem;font-size:.72rem">Exclure</button>' : "") + "</div>";
      }).join("") +
      (t.members.length > 1 ? '<p class="gp-tm-hint">' + (amLeader ? "Tu es le chef : quand tu lances une partie, toute l'\u00e9quipe d\u00e9marre en m\u00eame temps, dans le m\u00eame mode." : "Le chef lance la partie : tu d\u00e9marres automatiquement avec lui.") + "</p>" + (amLeader ? '<button class="gp-btn gold block" id="gp-team-launch" style="margin-bottom:.4rem">Lancer la partie avec l\'\u00e9quipe</button>' : "") : "") +
      (t.members.length > 1 ? '<button class="gp-btn block" id="gp-team-leave" style="margin-top:.5rem">Quitter l\'\u00e9quipe</button>' : '<small style="color:var(--text-dim)">Partage ton code pour recruter des co\u00e9quipiers.</small>');
  }
  function panelTeamOpen() { var p = document.getElementById("panel-team"); return !!(p && p.classList.contains("open")); }
  function hookTeamPanel() {
    var gen = document.getElementById("btn-generate-code"), join = document.getElementById("btn-join-code"), open = document.getElementById("btn-team");
    if (!gen || !join || gen.dataset.gp) return !!(gen && gen.dataset.gp);
    gen.dataset.gp = "1";
    // phase de capture : remplace l'ancienne simulation locale
    gen.addEventListener("click", function (e) {
      e.preventDefault(); e.stopImmediatePropagation();
      post("/team/generate").then(function (d) { applyTeam(d); tmsg("Nouveau code g\u00e9n\u00e9r\u00e9."); }).catch(function (er) { tmsg(er.message, true); });
    }, true);
    join.addEventListener("click", function (e) {
      e.preventDefault(); e.stopImmediatePropagation();
      var inp = document.getElementById("join-code-input"), code = (inp.value || "").replace(/\D/g, "");
      if (code.length !== 8) return tmsg("Le code doit contenir 8 chiffres.", true);
      post("/team/join", { code: code }).then(function (d) { applyTeam(d); inp.value = ""; tmsg("Tu as rejoint l'\u00e9quipe !"); }).catch(function (er) { tmsg(er.message, true); });
    }, true);
    if (open) open.addEventListener("click", function () { renderTeamBlock(); loadTeam(); });
    setInterval(function () { if (panelTeamOpen() && !document.hidden) loadTeam(); }, 5000);
    return true;
  }
  function teamSize() { return T.team ? T.team.members.length : 1; }
  function launchTeam(ranked) {
    var mode = ranked ? "frappe" : ["couronne", "maxitrone", "frappe"][Math.floor(Math.random() * 3)];
    return post("/team/launch", { mode: mode, ranked: !!ranked }).then(applyTeam).catch(function (er) { gtoast(er.message); });
  }
  function lobbyActive() { var s = document.getElementById("screen-lobby"); return !!(s && s.classList.contains("active")); }
  function handleLaunch(L) {
    if (!L) return;
    if (T.lastLaunch === null) { T.lastLaunch = L.id; if (L.inMs < -1500) return; }   // premier chargement : ignore un vieux lancement
    else if (L.id <= T.lastLaunch) return;
    T.lastLaunch = L.id;
    runCountdown(L);
  }
  function runCountdown(L) {
    clearInterval(T.cd);
    var end = Date.now() + Math.max(0, L.inMs);
    var b = document.getElementById("gp-launch");
    if (!b) { b = document.createElement("div"); b.id = "gp-launch"; document.body.appendChild(b); }
    var label = (MODE_NAMES[L.mode] || "Partie") + (L.ranked ? " \u00b7 class\u00e9" : "");
    function paint() {
      var n = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      b.innerHTML = '<small>' + esc(L.by) + " lance la partie</small><b>" + esc(label) + "</b><div class=\"gp-launch-n\">" + n + "</div>";
    }
    paint();
    T.cd = setInterval(function () {
      paint();
      if (Date.now() < end) return;
      clearInterval(T.cd); b.remove();
      var busyScr = ["screen-match", "screen-matchmaking", "screen-roulette", "screen-endmatch"].some(function (id) { var e = document.getElementById(id); return e && e.classList.contains("active"); });
      if (busyScr) return gtoast("Ton \u00e9quipe a lanc\u00e9 une partie (tu \u00e9tais d\u00e9j\u00e0 en jeu)");
      var g = document.getElementById("panel-groups"); if (g && g.classList.contains("open")) closePanel();
      document.querySelectorAll(".panel.open").forEach(function (p) { p.classList.remove("open"); });
      try { if (typeof APP !== "undefined" && L.mode) APP.forcedMode = { mode: L.mode, at: Date.now() }; } catch (e) {}
      var btn = document.getElementById(L.ranked ? "btn-ranked" : "btn-play");
      if (btn) { T.bypass = true; window.__trugoTeamLaunch = true; try { btn.click(); } catch (e) {} finally { T.bypass = false; window.__trugoTeamLaunch = false; } }
      // s\u00e9curit\u00e9 : si le clic n'a rien d\u00e9clench\u00e9, on lance la recherche directement
      setTimeout(function () {
        var mm = document.getElementById("screen-matchmaking");
        if (mm && mm.classList.contains("active")) return;
        try {
          if (typeof APP !== "undefined" && L.mode) APP.forcedMode = { mode: L.mode, at: Date.now() };
          try { AudioEngine.unlock(); } catch (e) {}
          try { Lobby.stop(); } catch (e) {}
          startMatchmaking(!!L.ranked);
        } catch (e) { gtoast("Impossible de lancer la partie : " + e.message); }
      }, 500);
    }, 250);
  }
  function hookPlay() {
    var ids = ["btn-play", "btn-ranked"], ok = true;
    ids.forEach(function (id) {
      var b = document.getElementById(id); if (!b) { ok = false; return; }
      if (b.dataset.gpTeam) return; b.dataset.gpTeam = "1";
      b.addEventListener("click", function (e) {
        if (T.bypass || teamSize() < 2) return;       // en solo : comportement d'origine
        e.preventDefault(); e.stopImmediatePropagation();
        if (!T.team.leader) {
          var chief = T.team.members.filter(function (m) { return m.leader; })[0];
          return gtoast("Seul le chef" + (chief ? " (" + chief.username + ")" : "") + " peut lancer la partie. Tu d\u00e9marres avec lui.");
        }
        launchTeam(id === "btn-ranked");
      }, true);
    });
    return ok;
  }
  var teamTick = 0;
  function teamLoop() {
    teamTick++;
    if (document.hidden) return;
    if (teamSize() > 1 ? true : teamTick % 8 === 0) loadTeam();
  }
  function joinTeamByCode(code) {
    return post("/team/join", { code: code }).then(function (d) { applyTeam(d); toast("Tu as rejoint l'\u00e9quipe !"); }).catch(handleErr);
  }
  function openTeamPanel() {
    var p = document.getElementById("panel-team"); if (!p) return;
    p.classList.add("open"); renderTeamBlock(); loadTeam();
  }

  /* ---------------- appels vocaux (WebRTC) + diffusion de partie en direct ---------------- */
  var call = null;
  function inCallHere() { return !!(call && S.cur && String(S.cur.id) === String(call.gid)); }
  function peerName(id) { return (call && call.meta[id] && call.meta[id].name) || "Un joueur"; }
  function gtoast(text) {
    var box = document.getElementById("gp-gtoasts");
    if (!box) { box = document.createElement("div"); box.id = "gp-gtoasts"; document.body.appendChild(box); }
    var t = document.createElement("div"); t.className = "gp-gtoast"; t.textContent = text; box.appendChild(t);
    setTimeout(function () { t.remove(); }, 3800); ding();
  }

  function updateCallBar() {
    var bar = q("#gp-callbar"), btn = q("#gp-call"); if (!bar) return;
    var c = (S.state && S.state.call) || {};
    var show = c.active && !call;
    bar.hidden = !show;
    if (btn) { btn.classList.toggle("on", !!c.active || inCallHere()); btn.title = inCallHere() ? "Revenir \u00e0 l'appel" : "Appel vocal"; }
    if (show) {
      bar.className = "gp-callbar";
      bar.innerHTML = '<span class="gp-live">' + ic("phone") + "</span><span>Appel en cours \u00b7 " + c.count + " participant" + (c.count > 1 ? "s" : "") + (c.names && c.names.length ? " (" + esc(c.names.join(", ")) + ")" : "") + '</span><button class="gp-btn green" id="gp-joincall">Rejoindre</button>';
      q("#gp-joincall").addEventListener("click", startCall);
    }
  }
  function callClick() {
    if (!call) return startCall();
    if (inCallHere()) { call.min = false; renderCallSurfaces(); return; }
    toast("Tu es d\u00e9j\u00e0 en appel dans un autre groupe.", true);
    expandCall();
  }
  function startCall() {
    if (call) return callClick();
    if (!window.RTCPeerConnection || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return toast("Appels non support\u00e9s sur ce navigateur.", true);
    var id = S.cur.id, gname = S.cur.name;
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(function (stream) {
      return post("/" + id + "/call/join").then(function (d) {
        call = { gid: id, gname: gname, stream: stream, pcs: {}, meta: {}, ice: d.iceServers, muted: false, min: false, t0: Date.now(), timer: null, tick: null, queue: {}, miss: {}, live: null, viewers: {}, watching: null, peerList: d.peers };
        d.peers.forEach(function (p) { call.meta[p.id] = p; makePeer(p.id, true); });
        renderCallSurfaces();
        callPoll();
        call.timer = setInterval(callPoll, 1000);
        call.tick = setInterval(tickCall, 400);
        updateCallBar(); syncLive();
      }).catch(function (err) { stream.getTracks().forEach(function (t) { t.stop(); }); throw err; });
    }).catch(function (err) { toast(err.name === "NotAllowedError" ? "Micro refus\u00e9 : autorise-le pour appeler." : err.message, true); });
  }
  function sig(to, data) { return post("/" + call.gid + "/call/signal", { to: to, data: data }).catch(function () {}); }
  function makePeer(id, initiator) {
    if (call.pcs[id]) return call.pcs[id];
    var pc = new RTCPeerConnection({ iceServers: call.ice });
    var p = call.pcs[id] = { pc: pc, audio: null, an: null };
    call.stream.getTracks().forEach(function (t) { pc.addTrack(t, call.stream); });
    pc.onicecandidate = function (e) { if (e.candidate) sig(id, { t: "cand", c: e.candidate }); };
    pc.ontrack = function (e) {
      if (!p.audio) { p.audio = new Audio(); p.audio.autoplay = true; }
      p.audio.srcObject = e.streams[0]; p.audio.play().catch(function () {});
      try {
        var ctx = call.ctx || (call.ctx = new (window.AudioContext || window.webkitAudioContext)());
        var an = ctx.createAnalyser(); an.fftSize = 256; ctx.createMediaStreamSource(e.streams[0]).connect(an);
        p.an = an; p.buf = new Uint8Array(an.frequencyBinCount);
      } catch (x) {}
    };
    pc.onconnectionstatechange = function () { if (pc.connectionState === "failed") { toast(peerName(id) + " : connexion perdue", true); dropPeer(id); } };
    if (initiator) {
      pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).then(function () { sig(id, { t: "offer", sdp: pc.localDescription }); }).catch(function () {});
    }
    return p;
  }
  function dropPeer(id) {
    var p = call && call.pcs[id];
    if (p) { try { p.pc.close(); } catch (e) {} try { p.audio && (p.audio.srcObject = null); } catch (e) {} delete call.pcs[id]; delete call.queue[id]; }
    if (call) {
      dropViewer(id);
      if (call.watching && call.watching.id === id) stopWatching(peerName(id) + " a quitt\u00e9 l'appel", true);
    }
  }
  function handleSignal(s) {
    var id = s.from, d = s.data || {};
    if (!call.meta[id]) call.meta[id] = { id: id, username: s.name, name: s.name };
    if (d.ch === "v") return handleVideoSignal(s);
    if (d.t === "offer") {
      var p = makePeer(id, false);
      p.pc.setRemoteDescription(d.sdp).then(function () { flush(id); return p.pc.createAnswer(); })
        .then(function (a) { return p.pc.setLocalDescription(a); })
        .then(function () { sig(id, { t: "answer", sdp: p.pc.localDescription }); }).catch(function () {});
    } else if (d.t === "answer") {
      var q1 = call.pcs[id]; if (q1) q1.pc.setRemoteDescription(d.sdp).then(function () { flush(id); }).catch(function () {});
    } else if (d.t === "cand") {
      var pp = call.pcs[id]; if (!pp) return;
      if (pp.pc.remoteDescription) pp.pc.addIceCandidate(d.c).catch(function () {});
      else (call.queue[id] = call.queue[id] || []).push(d.c);
    }
  }
  function flush(id) {
    var p = call.pcs[id], l = call.queue[id] || []; call.queue[id] = [];
    l.forEach(function (c) { p.pc.addIceCandidate(c).catch(function () {}); });
  }
  function callPoll() {
    if (!call || call.busy) return;
    call.busy = true;
    var gidNow = call.gid;
    request("/" + gidNow + "/call").then(function (d) {
      if (!call || call.gid !== gidNow) return;
      if (!d.inCall) { gtoast("Appel termin\u00e9"); return leaveCall(true); }
      d.signals.forEach(handleSignal);
      var present = {};
      d.peers.forEach(function (p) { present[p.id] = 1; call.meta[p.id] = Object.assign({ name: p.username }, p); call.miss[p.id] = 0; });
      Object.keys(call.pcs).forEach(function (id) { if (!present[id]) { call.miss[id] = (call.miss[id] || 0) + 1; if (call.miss[id] >= 3) dropPeer(id); } });
      call.peerList = d.peers;
      var w = call.watching;
      if (w && present[w.id] && !call.meta[w.id].live) stopWatching("La partie de " + peerName(w.id) + " est termin\u00e9e", true);
      tickCall(); updatePillLive();
    }).catch(function () {}).then(function () { if (call) call.busy = false; });
  }

  /* ----- surfaces : \u00e9cran d'appel (dans le chat) ou pastille flottante (pour jouer en m\u00eame temps) ----- */
  function renderCallSurfaces() {
    var full = !!(call && !call.min && inCallHere() && isOpen());
    var ui = document.getElementById("gp-callui");
    if (full && !ui) buildCallUi(); else if (!full && ui) ui.remove();
    var pill = document.getElementById("gp-pill");
    if (call && !full) { if (!pill) buildPill(); updatePill(); } else if (pill) pill.remove();
    updateLiveBadge();
  }
  function minimizeCall() { if (!call) return; call.min = true; closePanel(); }
  function expandCall() {
    if (!call) return;
    call.min = false;
    if (!isOpen()) openPanel(call.gid);
    else if (!inCallHere()) openGroup(call.gid);
    else renderCallSurfaces();
  }
  function buildCallUi() {
    var u = document.createElement("div");
    u.className = "gp-call"; u.id = "gp-callui";
    u.innerHTML = '<div class="gp-call-top"><button class="gp-ib" id="gp-cmin" title="R\u00e9duire l\'appel et jouer" aria-label="R\u00e9duire l\'appel">' + ic("chevdown") + '</button><div style="flex:1;text-align:center"><h3>' + esc(call.gname || "Appel") + '</h3><div class="t" id="gp-ct">0:00</div></div><span style="width:34px"></span></div>' +
      '<div class="gp-peers" id="gp-peers"></div>' +
      '<p class="gp-call-hint">' + ic("chevdown") + ' Touche la fl\u00e8che pour jouer tout en restant en appel</p>' +
      '<div class="gp-call-bar"><button class="gp-ib' + (call.muted ? " on" : "") + '" id="gp-cmute" title="Micro">' + ic(call.muted ? "micoff" : "mic") + '</button><button class="gp-ib red" id="gp-chang" title="Raccrocher"><span style="display:inline-flex;transform:rotate(135deg)">' + ic("phone") + "</span></button></div>";
    el.gp.appendChild(u);
    u.querySelector("#gp-cmin").addEventListener("click", minimizeCall);
    u.querySelector("#gp-cmute").addEventListener("click", toggleMute);
    u.querySelector("#gp-chang").addEventListener("click", function () { leaveCall(false); });
    u.querySelector("#gp-peers").addEventListener("click", function (e) {
      var b = e.target.closest("[data-watch]"); if (b) toggleWatch(b.dataset.watch);
    });
    tickCall();
  }
  function toggleMute() {
    if (!call) return;
    call.muted = !call.muted;
    call.stream.getAudioTracks().forEach(function (t) { t.enabled = !call.muted; });
    var b = document.getElementById("gp-cmute"); if (b) { b.innerHTML = ic(call.muted ? "micoff" : "mic"); b.classList.toggle("on", call.muted); }
    updatePill();
  }
  function tickCall() { if (!call) return; updateCallUi(); updatePillTime(); }
  function updateCallUi() {
    var u = document.getElementById("gp-callui"); if (!u || !call) return;
    u.querySelector("#gp-ct").textContent = fmtDur(Date.now() - call.t0);
    var list = [{ id: "me", username: (S.me && S.me.username) || "Moi", me: true, av: S.me && S.me.av, live: !!call.live }].concat((call.peerList || []).map(function (p) { return { id: p.id, username: p.username, av: p.av, live: !!p.live }; }));
    var box = u.querySelector("#gp-peers");
    var sg = list.map(function (p) { return p.id + (p.live ? "L" : "") + (call.watching && call.watching.id === p.id ? "W" : "") + (p.av || 0); }).join();
    if (box._sg !== sg) {
      box._sg = sg;
      box.innerHTML = list.map(function (p) {
        var w = call.watching && call.watching.id === p.id;
        return '<div class="gp-peer" data-p="' + esc(p.id) + '">' + avatar(p.username, "lg", undefined, false, p.me ? S.me.id : p.id, p.av) + "<b>" + esc(p.username) + (p.me ? " (toi)" : "") + "</b><small>" + (p.me ? (p.live ? "Tu diffuses ta partie" : "") : "connexion\u2026") + "</small>" +
          (p.live ? '<span class="gp-onair">EN DIRECT</span>' : "") +
          (p.live && !p.me ? '<button class="gp-btn ' + (w ? "red" : "gold") + '" data-watch="' + esc(p.id) + '" style="margin-top:.35rem;padding:.25rem .6rem;font-size:.75rem">' + ic("eye") + (w ? "Arr\u00eater" : "Regarder") + "</button>" : "") + "</div>";
      }).join("");
    }
    list.forEach(function (p) {
      var node = box.querySelector('[data-p="' + p.id + '"]'); if (!node) return;
      var av = node.querySelector(".gp-av"), lvl = 0, st = node.querySelector("small");
      if (!p.me) {
        var pr = call.pcs[p.id];
        if (pr && pr.an) { pr.an.getByteTimeDomainData(pr.buf); var mx = 0; for (var i = 0; i < pr.buf.length; i++) mx = Math.max(mx, Math.abs(pr.buf[i] - 128)); lvl = mx; }
        st.textContent = pr && pr.pc.connectionState === "connected" ? "connect\u00e9" : "connexion\u2026";
      }
      av.classList.toggle("speak", lvl > 12);
    });
  }
  function buildPill() {
    var p = document.createElement("div");
    p.id = "gp-pill"; p.className = "gp-pill";
    p.innerHTML = '<button class="gp-pill-b" data-pa="expand" title="Ouvrir l\'appel">' + ic("chevup") + '</button><span class="gp-pill-t" id="gp-pill-t">0:00</span>' +
      '<div class="gp-pill-live" id="gp-pill-live"></div>' +
      '<button class="gp-pill-b" data-pa="mute" id="gp-pill-mute" title="Micro">' + ic("mic") + '</button>' +
      '<button class="gp-pill-b red" data-pa="hang" title="Raccrocher"><span style="display:inline-flex;transform:rotate(135deg)">' + ic("phone") + "</span></button>";
    p.addEventListener("click", function (e) {
      var b = e.target.closest("[data-pa]"); if (!b) return;
      if (b.dataset.pa === "expand") expandCall();
      else if (b.dataset.pa === "mute") toggleMute();
      else if (b.dataset.pa === "hang") leaveCall(false);
      else if (b.dataset.pa === "watch") toggleWatch(b.dataset.id);
    });
    document.body.appendChild(p);
  }
  function updatePill() {
    var m = document.getElementById("gp-pill-mute");
    if (m) { m.innerHTML = ic(call && call.muted ? "micoff" : "mic"); m.classList.toggle("on", !!(call && call.muted)); }
    updatePillTime(); updatePillLive();
  }
  function updatePillTime() { var t = document.getElementById("gp-pill-t"); if (t && call) t.textContent = fmtDur(Date.now() - call.t0); }
  function updatePillLive() {
    var box = document.getElementById("gp-pill-live"); if (!box || !call) return;
    var live = (call.peerList || []).filter(function (p) { return p.live; });
    var sg = live.map(function (p) { return p.id + (call.watching && call.watching.id === p.id ? "W" : ""); }).join();
    if (box._sg === sg) return; box._sg = sg;
    box.innerHTML = live.map(function (p) {
      var w = call.watching && call.watching.id === p.id;
      return '<button class="gp-pill-b livebtn' + (w ? " on" : "") + '" data-pa="watch" data-id="' + esc(p.id) + '" title="' + (w ? "Arr\u00eater de regarder " : "Regarder la partie de ") + esc(p.username) + '">' + avatar(p.username, "sm", undefined, false, p.id, p.av) + "</button>";
    }).join("");
  }

  /* ----- diffusion de ma partie (le joueur voit qui regarde) ----- */
  function matchActive() { var s = document.getElementById("screen-match"); return !!(s && s.classList.contains("active")); }
  function syncLive() {
    if (!call) return;
    var want = pref.broadcast && matchActive();
    if (want && !call.live) startLive(); else if (!want && call.live) stopLive();
  }
  function startLive() {
    var cv = document.getElementById("match-canvas");
    if (!cv || !cv.captureStream) return gtoast("Ton navigateur ne peut pas diffuser ta partie.");
    var stream; try { stream = cv.captureStream(15); } catch (e) { return gtoast("Diffusion impossible sur cet appareil."); }
    call.live = { stream: stream, cv: cv };
    post("/" + call.gid + "/call/live", { on: true }).catch(function () {});
    gtoast("Ta partie est diffus\u00e9e dans l'appel");
    updateLiveBadge(); updateCallUi();
  }
  function stopLive() {
    var L = call && call.live; if (!L) return;
    Object.keys(call.viewers).forEach(function (id) { sig(id, { ch: "v", t: "end" }); dropViewer(id, true); });
    try { L.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    call.live = null;
    post("/" + call.gid + "/call/live", { on: false }).catch(function () {});
    updateLiveBadge();
  }
  function updateLiveBadge() {
    var b = document.getElementById("gp-livebadge");
    if (!call || !call.live) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("div"); b.id = "gp-livebadge"; b.className = "gp-livebadge"; document.body.appendChild(b); }
    var names = Object.keys(call.viewers).map(peerName);
    b.classList.toggle("has", names.length > 0);
    b.innerHTML = '<span class="gp-live-dot"></span><b>EN DIRECT</b><span class="gp-lb-w">' + ic("eye") + (names.length ? names.length + " \u00b7 " + esc(names.join(", ")) : "Personne ne regarde") + "</span>";
  }
  function limitBitrate(pc, cv) {
    try {
      pc.getSenders().forEach(function (s) {
        if (!s.track || s.track.kind !== "video") return;
        var pr = s.getParameters(); pr.encodings = pr.encodings && pr.encodings.length ? pr.encodings : [{}];
        pr.encodings[0].maxBitrate = 700000;
        pr.encodings[0].scaleResolutionDownBy = Math.max(1, (cv.width || 640) / 640);
        s.setParameters(pr).catch(function () {});
      });
    } catch (e) {}
  }
  function addViewer(id) {
    if (!call.live) return sig(id, { ch: "v", t: "end" });
    if (call.viewers[id]) dropViewer(id, true);
    var pc = new RTCPeerConnection({ iceServers: call.ice });
    var v = call.viewers[id] = { pc: pc, queue: [] };
    call.live.stream.getTracks().forEach(function (t) { pc.addTrack(t, call.live.stream); });
    pc.onicecandidate = function (e) { if (e.candidate) sig(id, { ch: "v", t: "cand", c: e.candidate }); };
    pc.onconnectionstatechange = function () { if (pc.connectionState === "failed" || pc.connectionState === "closed") dropViewer(id); };
    pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).then(function () {
      sig(id, { ch: "v", t: "offer", sdp: pc.localDescription }); limitBitrate(pc, call.live.cv);
    }).catch(function () { dropViewer(id, true); });
    gtoast(peerName(id) + " regarde ta partie");
    updateLiveBadge();
  }
  function dropViewer(id, silent) {
    var v = call && call.viewers[id]; if (!v) return;
    try { v.pc.close(); } catch (e) {}
    delete call.viewers[id];
    if (!silent) gtoast(peerName(id) + " ne regarde plus ta partie");
    updateLiveBadge();
  }

  /* ----- regarder la partie d'un autre joueur ----- */
  function toggleWatch(id) {
    if (!call) return;
    if (call.watching && call.watching.id === id) return stopWatching();
    if (call.watching) stopWatching();
    startWatching(id);
  }
  function startWatching(id) {
    var w = call.watching = { id: id, pc: null, queue: [] };
    var win = document.createElement("div");
    win.id = "gp-watch"; win.className = "gp-watch";
    win.innerHTML = '<div class="gp-watch-h"><span class="gp-live-dot"></span><b>' + esc(peerName(id)) + '</b><small>EN DIRECT</small><button class="gp-pill-b" id="gp-watch-x" title="Fermer">' + ic("x") + '</button></div><div class="gp-watch-v"><video autoplay playsinline muted></video><div class="gp-watch-wait">Connexion\u2026</div></div>';
    document.body.appendChild(win);
    w.win = win; w.video = win.querySelector("video");
    w.video.addEventListener("playing", function () { var x = win.querySelector(".gp-watch-wait"); if (x) x.remove(); });
    win.querySelector("#gp-watch-x").addEventListener("click", function () { stopWatching(); });
    dragify(win, win.querySelector(".gp-watch-h"));
    sig(id, { ch: "v", t: "watch" });
    updatePillLive(); var u = document.getElementById("gp-callui"); if (u) { u.querySelector("#gp-peers")._sg = null; updateCallUi(); }
  }
  function stopWatching(msg, noSignal) {
    var w = call && call.watching; if (!w) return;
    if (!noSignal) sig(w.id, { ch: "v", t: "unwatch" });
    try { w.pc && w.pc.close(); } catch (e) {}
    if (w.win) w.win.remove();
    call.watching = null;
    if (msg) gtoast(msg);
    var box = document.getElementById("gp-pill-live"); if (box) box._sg = null;
    updatePillLive(); var u = document.getElementById("gp-callui"); if (u) { u.querySelector("#gp-peers")._sg = null; updateCallUi(); }
  }
  function handleVideoSignal(s) {
    var id = s.from, d = s.data;
    if (d.t === "watch") return addViewer(id);
    if (d.t === "unwatch") return dropViewer(id);
    if (d.t === "end") { if (call.watching && call.watching.id === id) stopWatching("La partie de " + peerName(id) + " est termin\u00e9e", true); return; }
    if (d.t === "offer") {
      var w = call.watching; if (!w || w.id !== id) return sig(id, { ch: "v", t: "unwatch" });
      try { w.pc && w.pc.close(); } catch (e) {}
      var pc = w.pc = new RTCPeerConnection({ iceServers: call.ice });
      pc.ontrack = function (e) { w.video.srcObject = e.streams[0]; w.video.play().catch(function () {}); };
      pc.onicecandidate = function (e) { if (e.candidate) sig(id, { ch: "v", t: "cand", c: e.candidate }); };
      pc.setRemoteDescription(d.sdp).then(function () {
        w.queue.splice(0).forEach(function (c) { pc.addIceCandidate(c).catch(function () {}); });
        return pc.createAnswer();
      }).then(function (a) { return pc.setLocalDescription(a); }).then(function () { sig(id, { ch: "v", t: "answer", sdp: pc.localDescription }); }).catch(function () {});
      return;
    }
    if (d.t === "answer") { var v = call.viewers[id]; if (v) v.pc.setRemoteDescription(d.sdp).then(function () { v.queue.splice(0).forEach(function (c) { v.pc.addIceCandidate(c).catch(function () {}); }); }).catch(function () {}); return; }
    if (d.t === "cand") {
      var tgt = call.viewers[id] || (call.watching && call.watching.id === id ? call.watching : null);
      if (!tgt) return;
      var pcx = tgt.pc;
      if (pcx && pcx.remoteDescription) pcx.addIceCandidate(d.c).catch(function () {}); else tgt.queue.push(d.c);
    }
  }
  function dragify(box, handle) {
    var sx, sy, ox, oy, on = false;
    handle.addEventListener("pointerdown", function (e) {
      if (e.target.closest("button")) return;
      on = true; sx = e.clientX; sy = e.clientY; var r = box.getBoundingClientRect(); ox = r.left; oy = r.top;
      box.style.right = "auto"; box.style.left = ox + "px"; box.style.top = oy + "px"; handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", function (e) {
      if (!on) return;
      box.style.left = Math.max(0, Math.min(innerWidth - 60, ox + e.clientX - sx)) + "px";
      box.style.top = Math.max(0, Math.min(innerHeight - 40, oy + e.clientY - sy)) + "px";
    });
    handle.addEventListener("pointerup", function () { on = false; });
  }

  function leaveCall(silent) {
    if (!call) return;
    stopWatching(null, false);
    stopLive();
    var c = call; call = null;
    clearInterval(c.timer); clearInterval(c.tick);
    Object.keys(c.pcs).forEach(function (id) { try { c.pcs[id].pc.close(); } catch (e) {} try { c.pcs[id].audio && (c.pcs[id].audio.srcObject = null); } catch (e) {} });
    c.stream.getTracks().forEach(function (t) { t.stop(); });
    try { c.ctx && c.ctx.close(); } catch (e) {}
    post("/" + c.gid + "/call/leave").catch(function () {});
    ["gp-callui", "gp-pill", "gp-livebadge", "gp-watch"].forEach(function (id) { var n = document.getElementById(id); if (n) n.remove(); });
    if (!silent) gtoast("Appel termin\u00e9");
    updateCallBar();
  }

  /* ---------------- d\u00e9marrage ---------------- */
  function pendingInvite() {
    var code; try { code = new URLSearchParams(location.search).get("group"); } catch (e) {}
    if (!/^\d{8}$/.test(code || "")) return;
    var tries = 0, t = setInterval(function () {
      if (++tries > 40) return clearInterval(t);
      request("").then(function () {
        clearInterval(t);
        try { history.replaceState(null, "", location.pathname); } catch (e) {}
        openPanel(); setTimeout(function () { joinDialog(code); }, 300);
      }).catch(function () {});
    }, 4000);
  }
  function init() {
    if (!installButton()) {
      var mo = new MutationObserver(function () { if (installButton()) mo.disconnect(); });
      mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { mo.disconnect(); }, 60000);
    }
    // pastille \u00ab non lus \u00bb sur le bouton du lobby
    setInterval(function () { if (!document.hidden && !isOpen() && document.getElementById("gp-lobby-badge")) loadList(); }, 30000);
    setTimeout(function () { if (document.getElementById("gp-lobby-badge")) loadList(); }, 3000);
    pendingInvite();
    if (!hookTeamPanel()) { var mo2 = new MutationObserver(function () { if (hookTeamPanel()) mo2.disconnect(); }); mo2.observe(document.body, { childList: true, subtree: true }); setTimeout(function () { mo2.disconnect(); }, 60000); }
    setTimeout(loadTeam, 1500);
    setTimeout(loadProfile, 2500);
    if (!window.__trugoTeamSync && !document.querySelector('script[src*="teamsync"]')) { var ts = document.createElement("script"); ts.src = "teamsync.js?v=2"; document.head.appendChild(ts); }
    setInterval(teamLoop, 2000);
    if (!hookPlay()) { var mo3 = new MutationObserver(function () { if (hookPlay()) mo3.disconnect(); }); mo3.observe(document.body, { childList: true, subtree: true }); setTimeout(function () { mo3.disconnect(); }, 60000); }
    setInterval(function () { if (call) syncLive(); }, 1000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.TrugoGroups = { open: openPanel, close: closePanel };
})();
