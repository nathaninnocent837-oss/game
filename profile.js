/* ============================================================
   TRUGO — profils, rôles, panneau staff, spectateur
   Ce fichier se branche sur l'interface existante (index.html / game.js)
   sans les modifier : il observe l'écran et parle à /api/profile.
   ============================================================ */
(function () {
  "use strict";

  var LEAGUES = ["Aucune", "Bronze", "Argent", "Or", "Platine", "Diamant", "Master", "Champion", "Colossal", "Légende", "Ultime", "Suprême"];
  var LEAGUE_COLORS = ["#93a3b5", "#cd7f32", "#c0c7d1", "#ffc83d", "#7be3ff", "#5ab0ff", "#c06bff", "#ff6bd6", "#ff8a3d", "#ff5c68", "#a78bfa", "#ffffff"];
  var ROLE_LABEL = { admin: "Administrateur", moderator: "Modérateur", member: "Membre" };
  var EQUIP_LABEL = { ice: "❄ Glace", fog: "◌ Brouillard", heal: "+ Soin" };

  var me = null;          // { username, role }
  var banState = null;    // sanction active du joueur connecté
  var staffMap = {};      // pseudo en minuscules -> rôle
  var inMatch = false;
  var rankedFlag = false;
  var reported = false;
  var counts = { ice: 0, fog: 0, heal: 0 };
  var prevUsed = { ice: false, fog: false, heal: false };
  var liveTimer = null;
  var spectateTimer = null;
  var verifiedUntil = 0;
  var shownWarnings = {};

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function api(path, opts) {
    opts = opts || {};
    var init = {
      method: opts.method || "GET",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" }
    };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    return fetch("/api/profile" + path, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || "Erreur");
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  function openPanel(id) { var el = document.getElementById(id); if (el) el.classList.add("open"); }
  function closePanel(id) { var el = document.getElementById(id); if (el) el.classList.remove("open"); }

  function fmtDate(value) {
    try {
      return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
    } catch (e) { return ""; }
  }

  function roleOfName(name) {
    var key = String(name || "").toLowerCase();
    if (me && me.username.toLowerCase() === key) return me.role;
    return staffMap[key] || "member";
  }

  function toast(message, kind) {
    var el = document.createElement("div");
    el.className = "pf-toast " + (kind || "ok");
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(function () { el.classList.add("out"); }, 2600);
    setTimeout(function () { el.remove(); }, 3100);
  }

  function modal(opts) {
    return new Promise(function (resolve) {
      var wrap = document.createElement("div");
      wrap.className = "pf-modal";
      wrap.innerHTML =
        '<div class="pf-modal-card tone-' + (opts.tone || "info") + '">' +
        '<div class="pf-modal-icon">' + (opts.icon || "ℹ") + "</div>" +
        "<h3>" + esc(opts.title) + "</h3>" +
        "<p>" + opts.body + "</p>" +
        '<button class="pf-btn primary" type="button">OK</button></div>';
      document.body.appendChild(wrap);
      wrap.querySelector("button").addEventListener("click", function () {
        wrap.remove();
        resolve();
      });
    });
  }

  /* ---------- Couleurs de pseudo : bleu / vert / jaune ---------- */

  var NAME_LISTS = ["#friends-results li", "#friends-mine li", "#ranking-list li", "#season-leaderboard li", "#leaderboard-list li", "#end-leaderboard li"];

  function wrapStaffNames(root) {
    var names = Object.keys(staffMap);
    if (me) names.push(me.username.toLowerCase());
    if (!names.length) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    var n;
    while ((n = walker.nextNode())) {
      if (n.parentNode && n.parentNode.classList && n.parentNode.classList.contains("pf-name")) continue;
      nodes.push(n);
    }
    nodes.forEach(function (node) {
      var text = node.nodeValue;
      if (!text || !text.trim()) return;
      for (var i = 0; i < names.length; i++) {
        var name = names[i];
        var role = roleOfName(name);
        if (role === "member") continue;
        var re = new RegExp("(^|[^A-Za-z0-9_-])(" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")(?![A-Za-z0-9_-])", "i");
        var m = re.exec(text);
        if (!m) continue;
        var start = m.index + m[1].length;
        var end = start + m[2].length;
        var span = document.createElement("span");
        span.className = "pf-name role-" + role;
        span.textContent = text.slice(start, end);
        var after = document.createTextNode(text.slice(end));
        node.nodeValue = text.slice(0, start);
        node.parentNode.insertBefore(span, node.nextSibling);
        span.parentNode.insertBefore(after, span.nextSibling);
        return;
      }
    });
  }

  function colorNames() {
    var tag = $("#lobby-username");
    if (tag && me) {
      var wanted = "role-" + me.role;
      if (!tag.classList.contains(wanted)) {
        tag.classList.remove("role-member", "role-moderator", "role-admin");
        tag.classList.add("pf-tag", wanted);
      }
    }
    NAME_LISTS.forEach(function (sel) {
      $all(sel).forEach(function (li) { wrapStaffNames(li); });
    });
  }

  /* ---------- Avatar du personnage ---------- */

  function avatarSVG(outfit, sword) {
    outfit = outfit || "#45d6c4";
    sword = sword || "#ffd58a";
    return (
      '<svg class="pf-avatar-svg" viewBox="0 0 120 150" aria-hidden="true">' +
      '<ellipse cx="60" cy="140" rx="34" ry="7" fill="rgba(0,0,0,.45)"/>' +
      '<rect x="44" y="96" width="13" height="38" rx="5" fill="#1c2430"/>' +
      '<rect x="63" y="96" width="13" height="38" rx="5" fill="#1c2430"/>' +
      '<rect x="38" y="52" width="44" height="52" rx="14" fill="' + outfit + '"/>' +
      '<rect x="38" y="52" width="44" height="52" rx="14" fill="url(#pfShade)" opacity=".35"/>' +
      '<rect x="26" y="56" width="13" height="38" rx="6" fill="' + outfit + '"/>' +
      '<rect x="81" y="56" width="13" height="38" rx="6" fill="' + outfit + '"/>' +
      '<circle cx="60" cy="34" r="19" fill="#f1c9a0"/>' +
      '<path d="M41 32a19 19 0 0 1 38 0v3H41z" fill="' + outfit + '" opacity=".9"/>' +
      '<circle cx="53" cy="38" r="2.2" fill="#1b1f27"/><circle cx="67" cy="38" r="2.2" fill="#1b1f27"/>' +
      '<g transform="rotate(28 96 88)"><rect x="93" y="22" width="6" height="64" rx="2" fill="' + sword + '"/>' +
      '<rect x="85" y="84" width="22" height="6" rx="3" fill="#6b7686"/><rect x="93" y="90" width="6" height="14" rx="2" fill="#3a2a1a"/></g>' +
      '<defs><linearGradient id="pfShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient></defs>' +
      "</svg>"
    );
  }

  /* ---------- Profil d'un joueur ---------- */

  function statCard(icon, label, value, extraClass) {
    return (
      '<div class="pf-stat ' + (extraClass || "") + '"><span class="pf-stat-icon">' + icon + "</span>" +
      '<span class="pf-stat-value">' + value + "</span>" +
      '<span class="pf-stat-label">' + label + "</span></div>"
    );
  }

  function renderProfile(p) {
    var body = $("#profile-body");
    if (!body) return;

    var curColor = LEAGUE_COLORS[p.leagueIdx] || LEAGUE_COLORS[0];
    var maxColor = LEAGUE_COLORS[p.maxLeagueIdx] || LEAGUE_COLORS[0];
    var fav = p.equipment.favorite ? EQUIP_LABEL[p.equipment.favorite] + " <small>(" + p.equipment[p.equipment.favorite] + ")</small>" : "—";
    var staffActor = me && (me.role === "admin" || me.role === "moderator");

    var actions = "";
    if (p.inMatch) {
      actions += '<button class="pf-btn live" type="button" data-act="spectate">● Voir le combat</button>';
    } else {
      actions += '<button class="pf-btn" type="button" disabled>Pas en combat</button>';
    }
    if (staffActor && !p.isMe) {
      actions += '<button class="pf-btn gold" type="button" data-act="moderate">👑 Modérer</button>';
    }

    body.innerHTML =
      '<div class="pf-hero role-bg-' + p.role + '">' +
      '<div class="pf-avatar">' + avatarSVG(p.outfit, p.sword) + "</div>" +
      '<div class="pf-hero-info">' +
      '<h3 class="pf-username role-' + p.role + '">' + esc(p.username) + "</h3>" +
      '<span class="pf-role-chip role-chip-' + p.role + '">' + ROLE_LABEL[p.role] + "</span>" +
      '<span class="pf-league-chip" style="--lc:' + curColor + '">' + LEAGUES[p.leagueIdx] + "</span>" +
      (p.inMatch ? '<span class="pf-live-dot">EN COMBAT</span>' : "") +
      "</div></div>" +
      '<div class="pf-grid">' +
      statCard("🎮", "Parties lancées", p.gamesPlayed) +
      statCard("🏆", "Parties gagnées", p.gamesWon) +
      statCard("🥇", "Top 1", p.top1) +
      statCard("🏅", "Médailles", p.medals) +
      statCard("🛡", "Équipements utilisés", p.equipment.total) +
      statCard("⭐", "Équipement favori", fav) +
      '<div class="pf-stat wide" style="--lc:' + maxColor + '"><span class="pf-stat-icon">👑</span><span class="pf-stat-value" style="color:' + maxColor + '">' + LEAGUES[p.maxLeagueIdx] + '</span><span class="pf-stat-label">Meilleure ligue</span></div>' +
      '<div class="pf-stat wide" style="--lc:' + curColor + '"><span class="pf-stat-icon">🔥</span><span class="pf-stat-value" style="color:' + curColor + '">' + LEAGUES[p.leagueIdx] + '</span><span class="pf-stat-label">Ligue actuelle</span></div>' +
      "</div>" +
      '<div class="pf-actions">' + actions + "</div>";

    body.dataset.username = p.username;
  }

  function openProfile(username) {
    if (!username) return;
    var body = $("#profile-body");
    if (body) body.innerHTML = '<p class="pf-loading">Chargement…</p>';
    openPanel("panel-profile");
    api("/user/" + encodeURIComponent(username)).then(function (data) {
      renderProfile(data.profile);
    }).catch(function (err) {
      if (body) body.innerHTML = '<p class="pf-loading">' + esc(err.message) + "</p>";
    });
  }

  /* ---------- Spectateur ---------- */

  function stopSpectate() {
    if (spectateTimer) { clearInterval(spectateTimer); spectateTimer = null; }
  }

  function renderSpectate(d) {
    var body = $("#spectate-body");
    if (!body) return;
    if (!d.active) {
      body.innerHTML =
        '<div class="sp-empty"><div class="sp-empty-icon">⚔</div><p><b class="pf-name role-' + roleOfName(d.username) + '">' + esc(d.username) + "</b> n'est pas (ou plus) en combat.</p>" +
        '<p class="panel-note">Cette fenêtre se met à jour toute seule dès qu\'un combat commence.</p></div>';
      return;
    }
    var pct = d.hpMax ? Math.max(0, Math.min(100, Math.round((d.hp / d.hpMax) * 100))) : 0;
    var rows = d.board.map(function (e, i) {
      return '<li class="' + (e[2] ? "watched" : "") + '"><span class="sp-pos">' + (i + 1) + '</span><span class="sp-name">' + esc(e[0]) + '</span><span class="sp-score">' + esc(e[1]) + "</span></li>";
    }).join("");
    body.innerHTML =
      '<div class="sp-head"><span class="sp-live">● DIRECT</span>' +
      '<b class="pf-name role-' + roleOfName(d.username) + '">' + esc(d.username) + "</b>" +
      '<span class="sp-mode">' + esc(d.mode) + "</span></div>" +
      '<div class="sp-timer">' + esc(d.timer || "--:--") + "</div>" +
      '<div class="sp-hp"><div class="sp-hp-fill" style="width:' + pct + '%"></div><span>' + d.hp + " / " + d.hpMax + "</span></div>" +
      '<div class="sp-rank">Classement actuel : <b>' + esc(d.rank || "#-") + "</b></div>" +
      '<ol class="sp-board">' + (rows || '<li class="sp-none">Classement indisponible</li>') + "</ol>";
  }

  function openSpectate(username) {
    stopSpectate();
    var body = $("#spectate-body");
    if (body) body.innerHTML = '<p class="pf-loading">Connexion au combat…</p>';
    openPanel("panel-spectate");
    function tick() {
      var panel = document.getElementById("panel-spectate");
      if (!panel || !panel.classList.contains("open")) { stopSpectate(); return; }
      api("/live/" + encodeURIComponent(username)).then(renderSpectate).catch(function () {});
    }
    tick();
    spectateTimer = setInterval(tick, 2000);
  }

  /* ---------- Clic sur un pseudo ---------- */

  function candidatesFromText(text) {
    var out = [];
    (String(text).match(/[A-Za-z0-9_-]{3,30}/g) || []).forEach(function (t) {
      if (out.indexOf(t) === -1) out.push(t);
    });
    return out.slice(0, 12);
  }

  document.addEventListener("click", function (e) {
    var target = e.target;
    if (!target || !target.closest) return;

    // Son propre pseudo, en haut au milieu
    if (target.closest("#lobby-username")) {
      var tag = $("#lobby-username");
      var own = me ? me.username : (tag ? tag.textContent.trim() : "");
      if (own) openProfile(own);
      return;
    }

    if (target.closest("button, a, input")) return;

    var li = target.closest("#friends-results li, #friends-mine li, #ranking-list li, #season-leaderboard li, #end-leaderboard li");
    if (!li || li.classList.contains("empty")) return;

    var nameEl = target.closest(".pf-name");
    var direct = nameEl ? nameEl.textContent.trim() : "";
    var candidates = direct ? [direct] : candidatesFromText(li.textContent);
    if (!candidates.length) return;

    api("/resolve", { method: "POST", body: { candidates: candidates } }).then(function (data) {
      if (data.username) openProfile(data.username);
    }).catch(function () {});
  });

  document.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest("#profile-body [data-act]") : null;
    if (!btn) return;
    var username = $("#profile-body").dataset.username;
    if (btn.dataset.act === "spectate") openSpectate(username);
    if (btn.dataset.act === "moderate") {
      closePanel("panel-profile");
      openStaff(username);
    }
  });

  $all("[data-close='panel-profile'],[data-close='panel-spectate'],[data-close='panel-staff']").forEach(function (b) {
    b.addEventListener("click", function () {
      closePanel(b.getAttribute("data-close"));
      if (b.getAttribute("data-close") === "panel-spectate") stopSpectate();
    });
  });

  /* ---------- Statut, bans, avertissements, annonces ---------- */

  function banMessage(ban) {
    var until = ban.permanent ? "définitivement" : "jusqu'au " + fmtDate(ban.until);
    return "Tu ne peux plus lancer de combat " + until + "." + (ban.reason ? "<br><i>Raison : " + esc(ban.reason) + "</i>" : "");
  }

  function showBanModal(ban) {
    return modal({ tone: "danger", icon: "⛔", title: "Tu es banni des combats", body: banMessage(ban) });
  }

  function refreshStaffList() {
    return api("/staff-list").then(function (data) {
      var map = {};
      data.staff.forEach(function (s) { map[s.username.toLowerCase()] = s.role; });
      staffMap = map;
    }).catch(function () {});
  }

  function showAnnouncement(a) {
    var el = $("#pf-announce");
    if (!a) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement("div");
      el.id = "pf-announce";
      el.className = "pf-announce";
      document.body.appendChild(el);
    }
    el.innerHTML = "<span>📢</span><p>" + esc(a.message) + "</p><small>— " + esc(a.by_name) + "</small>";
  }

  function refreshStatus() {
    return api("/status").then(function (s) {
      me = s.me;
      banState = s.ban;
      var btn = $("#btn-staff");
      if (btn) btn.hidden = !(me.role === "admin" || me.role === "moderator");
      showAnnouncement(s.announcement);

      var fresh = (s.warnings || []).filter(function (w) { return !shownWarnings[w.id]; });
      if (fresh.length) {
        fresh.forEach(function (w) { shownWarnings[w.id] = true; });
        var chain = Promise.resolve();
        fresh.forEach(function (w) {
          chain = chain.then(function () {
            return modal({ tone: "warn", icon: "⚠", title: "Avertissement du staff", body: esc(w.message) + "<br><small>— " + esc(w.by_name) + "</small>" });
          });
        });
        chain.then(function () { api("/warnings/seen", { method: "POST", body: {} }).catch(function () {}); });
      }
      colorNames();
    }).catch(function (err) {
      if (err.status === 401) { me = null; banState = null; var btn = $("#btn-staff"); if (btn) btn.hidden = true; }
    });
  }

  /* ---------- Blocage du lancement d'un combat ---------- */

  document.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest("#btn-play, #btn-ranked") : null;
    if (!btn) return;

    if (btn.id === "btn-ranked") rankedFlag = true;
    if (btn.id === "btn-play") rankedFlag = false;

    if (Date.now() < verifiedUntil) { verifiedUntil = 0; return; }

    e.stopImmediatePropagation();
    e.preventDefault();

    api("/status").then(function (s) {
      banState = s.ban;
      if (s.ban) { showBanModal(s.ban); return; }
      verifiedUntil = Date.now() + 1500;
      btn.click();
    }).catch(function () {
      verifiedUntil = Date.now() + 1500;
      btn.click();
    });
  }, true);

  /* ---------- Suivi des combats (parties, rang, équipements, direct) ---------- */

  function currentMode() {
    var hud = $("#crown-hud");
    return hud && getComputedStyle(hud).display !== "none" ? "Couronne Hunter" : "Frappe Dolling";
  }

  function pushLive() {
    var hpText = ($("#hp-label") || {}).textContent || "";
    var hpParts = hpText.match(/(\d+)\s*\/\s*(\d+)/);
    var board = $all("#leaderboard-list li").slice(0, 10).map(function (li) {
      var kids = li.children;
      var name = kids.length ? kids[0].textContent : li.textContent;
      var score = kids.length > 1 ? kids[1].textContent : "";
      return [name.trim(), score.trim(), li.classList.contains("me") ? 1 : 0];
    });
    api("/live", {
      method: "POST",
      body: {
        active: true,
        mode: currentMode(),
        timer: ($("#match-timer") || {}).textContent || "",
        hp: hpParts ? Number(hpParts[1]) : 0,
        hpMax: hpParts ? Number(hpParts[2]) : 1,
        rank: ($("#yourank-value") || {}).textContent || "",
        board: board
      }
    }).catch(function () {});
  }

  function onMatchStart() {
    inMatch = true;
    reported = false;
    counts = { ice: 0, fog: 0, heal: 0 };
    ["ice", "fog", "heal"].forEach(function (k) {
      var b = document.getElementById("ability-" + k);
      prevUsed[k] = !!(b && b.classList.contains("used"));
    });

    api("/match-start", { method: "POST", body: {} }).catch(function (err) {
      if (err.status === 403 && err.data && err.data.ban) {
        showBanModal(err.data.ban).then(function () { location.reload(); });
      }
    });

    if (liveTimer) clearInterval(liveTimer);
    pushLive();
    liveTimer = setInterval(pushLive, 2000);
  }

  function onMatchStop() {
    inMatch = false;
    if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
    api("/live", { method: "POST", body: { active: false } }).catch(function () {});
  }

  function onMatchEnd() {
    if (reported) return;
    reported = true;
    var items = $all("#end-leaderboard li");
    var rank = 0;
    items.forEach(function (li, i) { if (!rank && li.classList.contains("me")) rank = i + 1; });
    api("/match-end", {
      method: "POST",
      body: { rank: rank, ranked: rankedFlag, equipment: counts }
    }).catch(function () {});
  }

  function watchClass(el, cb) {
    if (!el) return;
    var last = el.classList.contains("active");
    new MutationObserver(function () {
      var now = el.classList.contains("active");
      if (now !== last) { last = now; cb(now); }
    }).observe(el, { attributes: true, attributeFilter: ["class"] });
    return last;
  }

  /* ---------- Personnage et ligue (synchronisation) ---------- */

  function rgbToHex(rgb) {
    var m = String(rgb).match(/\d+/g);
    if (!m || m.length < 3) return null;
    return "#" + m.slice(0, 3).map(function (v) { return ("0" + Number(v).toString(16)).slice(-2); }).join("");
  }

  function selectedColor(rowSel) {
    var el = $(rowSel + " .swatch.selected");
    return el ? rgbToHex(getComputedStyle(el).backgroundColor) : null;
  }

  function syncCharacter() {
    var outfit = selectedColor("#swatch-outfit");
    var sword = selectedColor("#swatch-sword");
    if (!outfit && !sword) return;
    api("/character", { method: "POST", body: { outfit: outfit, sword: sword } }).catch(function () {});
  }

  function normalize(text) {
    return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  function leagueIndexFromDom() {
    var el = $("#lobby-league");
    if (!el || !el.classList.contains("show")) return -1;
    var text = normalize(el.textContent);
    for (var i = LEAGUES.length - 1; i >= 1; i--) {
      if (new RegExp("\\b" + normalize(LEAGUES[i]) + "\\b").test(text)) return i;
    }
    return -1;
  }

  var lastLeagueSent = -1;
  function syncLeague() {
    var idx = leagueIndexFromDom();
    if (idx < 1 || idx === lastLeagueSent) return;
    lastLeagueSent = idx;
    api("/league", { method: "POST", body: { idx: idx } }).catch(function () { lastLeagueSent = -1; });
  }

  /* ---------- Panneau Staff ---------- */

  var staff = { tab: "members", q: "", sheet: null, searchTimer: null };

  var DURATIONS = [
    ["10", "10 minutes"], ["60", "1 heure"], ["360", "6 heures"], ["1440", "24 heures"],
    ["4320", "3 jours"], ["10080", "7 jours"], ["43200", "30 jours"], ["custom", "Durée personnalisée…"]
  ];

  function staffTabs() {
    var tabs = [["members", "👥 Membres"], ["bans", "⛔ Bannis"], ["log", "📜 Journal"]];
    if (me && me.role === "admin") tabs.push(["announce", "📢 Annonce"]);
    $("#staff-tabs").innerHTML = tabs.map(function (t) {
      return '<button type="button" class="staff-tab' + (staff.tab === t[0] ? " active" : "") + '" data-tab="' + t[0] + '">' + t[1] + "</button>";
    }).join("");
  }

  function openStaff(search) {
    if (!me || (me.role !== "admin" && me.role !== "moderator")) return;
    staff.tab = "members";
    staff.sheet = null;
    staff.q = search || "";
    $("#staff-sub").innerHTML = 'Connecté en tant que <b class="pf-name role-' + me.role + '">' + esc(me.username) + "</b> · " + ROLE_LABEL[me.role];
    openPanel("panel-staff");
    renderStaff();
  }

  function renderStaff() {
    staffTabs();
    var body = $("#staff-body");
    if (staff.tab === "members") return renderMembers(body);
    if (staff.tab === "bans") return renderBans(body);
    if (staff.tab === "log") return renderLog(body);
    if (staff.tab === "announce") return renderAnnounce(body);
  }

  function memberRow(m) {
    var status = "";
    if (m.banned) {
      status = '<span class="st-badge ban">⛔ ' + (m.permanent ? "Banni définitivement" : "Banni jusqu'au " + fmtDate(m.until)) + "</span>";
    }
    var buttons = '<button class="st-btn" data-act="profile" data-user="' + esc(m.username) + '">Profil</button>';
    if (m.canModerate) {
      if (m.banned) {
        buttons += '<button class="st-btn good" data-act="unban" data-user="' + esc(m.username) + '">Débannir</button>';
      } else {
        buttons += '<button class="st-btn danger" data-act="ban" data-user="' + esc(m.username) + '">Bannir</button>';
      }
      buttons += '<button class="st-btn warn" data-act="warn" data-user="' + esc(m.username) + '">Avertir</button>';
    }
    if (me.role === "admin" && m.role !== "admin") {
      buttons += m.role === "moderator"
        ? '<button class="st-btn" data-act="demote" data-user="' + esc(m.username) + '">Retirer modo</button>'
        : '<button class="st-btn good" data-act="promote" data-user="' + esc(m.username) + '">Nommer modo</button>';
    }
    return (
      '<li class="st-member role-bg-' + m.role + '">' +
      '<div class="st-member-top"><span class="st-avatar role-ring-' + m.role + '">' + esc(m.username.charAt(0).toUpperCase()) + "</span>" +
      '<div class="st-member-info"><b class="pf-name role-' + m.role + '">' + esc(m.username) + '</b>' +
      '<small>' + ROLE_LABEL[m.role] + " · 🏅 " + m.medals + "</small></div>" + status + "</div>" +
      '<div class="st-member-actions">' + buttons + "</div></li>"
    );
  }

  function renderMembers(body) {
    if (staff.sheet) return renderSheet(body);
    body.innerHTML =
      '<div class="st-search"><input id="staff-search" type="text" placeholder="Rechercher un membre…" value="' + esc(staff.q) + '" autocomplete="off"></div>' +
      '<ul class="st-list" id="staff-members"><li class="st-empty">Chargement…</li></ul>';
    loadMembers();
  }

  function loadMembers() {
    api("/staff/members?q=" + encodeURIComponent(staff.q)).then(function (data) {
      var ul = $("#staff-members");
      if (!ul) return;
      ul.innerHTML = data.members.length ? data.members.map(memberRow).join("") : '<li class="st-empty">Aucun membre trouvé.</li>';
    }).catch(function (err) {
      var ul = $("#staff-members");
      if (ul) ul.innerHTML = '<li class="st-empty">' + esc(err.message) + "</li>";
    });
  }

  function renderSheet(body) {
    var s = staff.sheet;
    if (s.type === "ban") {
      var perm = me.role === "admin" ? '<option value="perm">Permanent</option>' : "";
      body.innerHTML =
        '<div class="st-sheet danger"><h3>⛔ Bannir ' + esc(s.username) + "</h3>" +
        "<p>Il ne pourra plus lancer de combat pendant la durée choisie.</p>" +
        '<label>Durée</label><select id="sheet-duration">' +
        DURATIONS.map(function (d) { return '<option value="' + d[0] + '">' + d[1] + "</option>"; }).join("") + perm + "</select>" +
        '<input id="sheet-custom" type="number" min="1" max="525600" placeholder="Minutes (1 à 525600)" style="display:none">' +
        '<label>Raison</label><textarea id="sheet-reason" maxlength="200" placeholder="Raison de la sanction (visible par le joueur)"></textarea>' +
        '<div class="st-sheet-actions"><button class="st-btn" data-act="sheet-cancel">Annuler</button><button class="st-btn danger" data-act="sheet-ban">Confirmer le ban</button></div></div>';
      $("#sheet-duration").addEventListener("change", function (e) {
        $("#sheet-custom").style.display = e.target.value === "custom" ? "block" : "none";
      });
    } else {
      body.innerHTML =
        '<div class="st-sheet warn"><h3>⚠ Avertir ' + esc(s.username) + "</h3>" +
        "<p>Le message s'affichera à l'écran du joueur.</p>" +
        '<textarea id="sheet-message" maxlength="300" placeholder="Ton avertissement…"></textarea>' +
        '<div class="st-sheet-actions"><button class="st-btn" data-act="sheet-cancel">Annuler</button><button class="st-btn warn" data-act="sheet-warn">Envoyer</button></div></div>';
    }
  }

  function renderBans(body) {
    body.innerHTML = '<ul class="st-list" id="staff-bans"><li class="st-empty">Chargement…</li></ul>';
    api("/staff/bans").then(function (data) {
      var ul = $("#staff-bans");
      ul.innerHTML = data.bans.length ? data.bans.map(function (b) {
        return '<li class="st-member"><div class="st-member-top"><span class="st-avatar role-ring-' + b.role + '">' + esc(b.username.charAt(0).toUpperCase()) + "</span>" +
          '<div class="st-member-info"><b class="pf-name role-' + b.role + '">' + esc(b.username) + "</b><small>" +
          (b.permanent ? "Définitif" : "Jusqu'au " + fmtDate(b.until)) + " · par " + esc(b.by) + "</small>" +
          (b.reason ? "<small>« " + esc(b.reason) + " »</small>" : "") + "</div></div>" +
          '<div class="st-member-actions"><button class="st-btn good" data-act="unban" data-user="' + esc(b.username) + '">Débannir</button></div></li>';
      }).join("") : '<li class="st-empty">Aucun joueur banni. 🎉</li>';
    }).catch(function (err) { $("#staff-bans").innerHTML = '<li class="st-empty">' + esc(err.message) + "</li>"; });
  }

  var ACTION_LABEL = {
    ban: "a banni", unban: "a débanni", warn: "a averti", promote: "a nommé modérateur",
    demote: "a retiré des modérateurs", announce: "a publié une annonce", "announce-clear": "a retiré l'annonce"
  };

  function renderLog(body) {
    body.innerHTML = '<ul class="st-list" id="staff-log"><li class="st-empty">Chargement…</li></ul>';
    api("/staff/log").then(function (data) {
      var ul = $("#staff-log");
      ul.innerHTML = data.log.length ? data.log.map(function (l) {
        return '<li class="st-log"><span class="st-log-time">' + fmtDate(l.created_at) + "</span>" +
          '<span><b class="pf-name role-' + roleOfName(l.actor) + '">' + esc(l.actor) + "</b> " + (ACTION_LABEL[l.action] || esc(l.action)) +
          (l.target ? ' <b class="pf-name role-' + roleOfName(l.target) + '">' + esc(l.target) + "</b>" : "") +
          (l.details ? "<small>" + esc(l.details) + "</small>" : "") + "</span></li>";
      }).join("") : '<li class="st-empty">Journal vide.</li>';
    }).catch(function (err) { $("#staff-log").innerHTML = '<li class="st-empty">' + esc(err.message) + "</li>"; });
  }

  function renderAnnounce(body) {
    body.innerHTML =
      '<div class="st-sheet gold"><h3>📢 Annonce pour tous les joueurs</h3>' +
      "<p>Une bannière s'affiche en haut de l'écran de chaque joueur connecté.</p>" +
      '<textarea id="announce-text" maxlength="200" placeholder="Ton annonce…"></textarea>' +
      '<label>Durée d\'affichage</label><select id="announce-minutes"><option value="30">30 minutes</option><option value="120">2 heures</option><option value="1440">24 heures</option></select>' +
      '<div class="st-sheet-actions"><button class="st-btn" data-act="announce-clear">Retirer l\'annonce</button><button class="st-btn gold" data-act="announce-send">Publier</button></div></div>';
  }

  function staffDo(path, method, body, successRefresh) {
    return api(path, { method: method, body: body }).then(function (data) {
      toast(data.message || "Fait.", "ok");
      if (successRefresh) successRefresh();
      return data;
    }).catch(function (err) {
      toast(err.message, "err");
    });
  }

  document.addEventListener("click", function (e) {
    var panel = e.target && e.target.closest ? e.target.closest("#panel-staff") : null;
    if (!panel) return;

    var tab = e.target.closest("[data-tab]");
    if (tab) { staff.tab = tab.dataset.tab; staff.sheet = null; renderStaff(); return; }

    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var act = btn.dataset.act;
    var user = btn.dataset.user;
    var refresh = function () { renderStaff(); refreshStaffList(); };

    if (act === "profile") { closePanel("panel-staff"); openProfile(user); }
    else if (act === "ban") { staff.sheet = { type: "ban", username: user }; renderStaff(); }
    else if (act === "warn") { staff.sheet = { type: "warn", username: user }; renderStaff(); }
    else if (act === "sheet-cancel") { staff.sheet = null; renderStaff(); }
    else if (act === "sheet-ban") {
      var choice = $("#sheet-duration").value;
      var minutes = choice === "perm" ? null : choice === "custom" ? Number($("#sheet-custom").value) : Number(choice);
      staffDo("/staff/ban", "POST", { username: staff.sheet.username, minutes: minutes, reason: $("#sheet-reason").value }, function () { staff.sheet = null; refresh(); });
    }
    else if (act === "sheet-warn") {
      staffDo("/staff/warn", "POST", { username: staff.sheet.username, message: $("#sheet-message").value }, function () { staff.sheet = null; refresh(); });
    }
    else if (act === "unban") staffDo("/staff/unban", "POST", { username: user }, refresh);
    else if (act === "promote") staffDo("/staff/role", "POST", { username: user, role: "moderator" }, refresh);
    else if (act === "demote") staffDo("/staff/role", "POST", { username: user, role: "member" }, refresh);
    else if (act === "announce-send") {
      staffDo("/staff/announce", "POST", { message: $("#announce-text").value, minutes: Number($("#announce-minutes").value) }, function () { refreshStatus(); });
    }
    else if (act === "announce-clear") staffDo("/staff/announce", "DELETE", undefined, function () { refreshStatus(); });
  });

  document.addEventListener("input", function (e) {
    if (e.target && e.target.id === "staff-search") {
      staff.q = e.target.value;
      clearTimeout(staff.searchTimer);
      staff.searchTimer = setTimeout(loadMembers, 250);
    }
  });

  var staffBtn = $("#btn-staff");
  if (staffBtn) staffBtn.addEventListener("click", function () { openStaff(""); });

  /* ---------- Démarrage ---------- */

  function onLobbyActive() {
    refreshStatus().then(function () {
      refreshStaffList().then(colorNames);
      syncCharacter();
      syncLeague();
    });
  }

  var lobby = $("#screen-lobby");
  if (lobby) {
    if (watchClass(lobby, function (active) { if (active) onLobbyActive(); })) onLobbyActive();
  }

  var matchScreen = $("#screen-match");
  if (matchScreen) {
    if (watchClass(matchScreen, function (active) { if (active) onMatchStart(); else onMatchStop(); })) onMatchStart();
  }

  var endScreen = $("#screen-endmatch");
  if (endScreen) watchClass(endScreen, function (active) { if (active) setTimeout(onMatchEnd, 400); });

  ["ice", "fog", "heal"].forEach(function (key) {
    var b = document.getElementById("ability-" + key);
    if (!b) return;
    new MutationObserver(function () {
      var used = b.classList.contains("used");
      if (used && !prevUsed[key] && inMatch) counts[key] += 1;
      prevUsed[key] = used;
    }).observe(b, { attributes: true, attributeFilter: ["class"] });
  });

  ["#swatch-outfit", "#swatch-sword"].forEach(function (sel) {
    var row = $(sel);
    if (row) row.addEventListener("click", function () { setTimeout(syncCharacter, 250); });
  });

  var leagueEl = $("#lobby-league");
  if (leagueEl) new MutationObserver(syncLeague).observe(leagueEl, { attributes: true, childList: true, characterData: true, subtree: true });

  setInterval(function () { if (me) colorNames(); }, 800);
  setInterval(function () { if (me && !inMatch) refreshStatus(); }, 20000);
})();
