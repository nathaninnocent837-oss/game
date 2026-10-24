/* ============================================================
   TRUGO — Center : hub, pièces, Pass, magasin, paramètres
   ============================================================ */
(function () {
  "use strict";

  var API = "/api/profile/center";
  var wallet = { coins: 0, passWins: 0, passCoins: 2000, owned: [], catalog: [] };
  var coinsBeforeMatch = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }
  function fmt(n) { return Number(n || 0).toLocaleString("fr-FR").replace(/ | /g, " "); }

  function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || "GET", credentials: "same-origin", headers: { "Content-Type": "application/json" } };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    return fetch(API + path, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error(d.error || "Erreur"); e.status = r.status; throw e; }
        return d;
      });
    });
  }

  /* ---------------- Portefeuille ---------------- */
  function applyOwned() {
    var outfits = [], swords = [];
    wallet.catalog.forEach(function (it) {
      if (wallet.owned.indexOf(it.id) === -1) return;
      (it.kind === "outfit" ? outfits : swords).push(it.color);
    });
    if (typeof APP !== "undefined") { APP.ownedOutfits = outfits; APP.ownedSwords = swords; }
  }
  function renderCoins() {
    var c = $("center-coins");
    if (c) c.textContent = fmt(wallet.coins);
    document.querySelectorAll(".wallet-coins").forEach(function (el) { el.textContent = fmt(wallet.coins); });
  }
  function loadWallet() {
    return api("/wallet").then(function (d) {
      wallet = d;
      applyOwned();
      renderCoins();
      return d;
    }).catch(function () { return null; });
  }

  /* ---------------- Ouverture du Center ---------------- */
  function openCenter() {
    var n = $("center-name");
    if (n && typeof APP !== "undefined") n.textContent = APP.username || "Joueur";
    openPanel("panel-center");
    loadWallet();
  }
  $("btn-center").addEventListener("click", openCenter);

  // Boutons de mode : lancent une partie (la vérification de bannissement reste celle de JOUER / CLASSÉ)
  document.querySelectorAll("#panel-center .cc[data-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      var mode = b.dataset.mode;
      closePanel("panel-center");
      if (mode === "ranked") { $("btn-ranked").click(); return; }
      APP.forcedMode = { mode: mode, at: Date.now() };
      $("btn-play").click();
    });
  });

  $("btn-open-myprofile").addEventListener("click", function () { $("lobby-username").click(); });
  $("btn-open-shop").addEventListener("click", function () { openPanel("panel-shop"); renderShop(); loadWallet().then(renderShop); });
  $("btn-open-pass").addEventListener("click", function () { openPanel("panel-pass"); renderPass(); loadWallet().then(renderPass); });
  $("btn-open-settings").addEventListener("click", function () { openPanel("panel-settings"); renderSettings(); });

  /* ---------------- Magasin ---------------- */
  var shopMsg = "";
  var shopMsgErr = false;
  function renderShop() {
    var body = $("shop-body");
    if (!body) return;
    var groups = [["outfit", "🛡 Tenues exclusives"], ["sword", "⚔ Épées exclusives"]];
    var html = '<p class="shop-intro">Dépense tes pièces pour débloquer des couleurs exclusives. Gagne-en en finissant <b>1er</b> d\'une partie (voir le Pass).</p>';
    html += '<p class="shop-msg' + (shopMsg ? (shopMsgErr ? " err" : " ok") : "") + '">' + esc(shopMsg) + "</p>";
    if (!wallet.catalog.length) html += '<p class="shop-empty">Chargement des offres…</p>';
    groups.forEach(function (g) {
      var items = wallet.catalog.filter(function (i) { return i.kind === g[0]; });
      if (!items.length) return;
      html += '<h3 class="shop-h">' + g[1] + '</h3><div class="shop-grid">';
      items.forEach(function (it) {
        var own = wallet.owned.indexOf(it.id) !== -1;
        var afford = wallet.coins >= it.price;
        html += '<div class="offer' + (own ? " owned" : "") + (!own && !afford ? " poor" : "") + '" style="--oc:' + esc(it.color) + '">' +
          '<span class="offer-shine"></span>' +
          '<div class="offer-orb"><i></i><span>' + (it.kind === "outfit" ? "🛡" : "⚔") + "</span></div>" +
          "<b>" + esc(it.name) + "</b>" +
          (own ? '<button type="button" class="offer-buy done" disabled>Possédé ✓</button>'
               : '<button type="button" class="offer-buy" data-buy="' + esc(it.id) + '"' + (afford ? "" : " disabled") + '><span class="coin">🪙</span> ' + fmt(it.price) + "</button>") +
          "</div>";
      });
      html += "</div>";
    });
    body.innerHTML = html;
  }
  $("shop-body").addEventListener("click", function (e) {
    var b = e.target.closest("[data-buy]");
    if (!b) return;
    b.disabled = true;
    api("/buy", { method: "POST", body: { id: b.dataset.buy } }).then(function (d) {
      wallet.coins = d.coins;
      wallet.owned = d.owned;
      applyOwned();
      renderCoins();
      var item = wallet.catalog.filter(function (i) { return i.id === b.dataset.buy; })[0];
      shopMsg = "✨ " + (item ? item.name : "Offre") + " débloqué ! Équipe-le dans « Personnage ».";
      shopMsgErr = false;
      renderShop();
    }).catch(function (err) {
      shopMsg = err.message; shopMsgErr = true; renderShop();
    });
  });

  /* ---------------- Pass ---------------- */
  function renderPass() {
    var body = $("pass-body");
    if (!body) return;
    var wins = wallet.passWins || 0, per = wallet.passCoins || 2000;
    var steps = "";
    var start = Math.max(1, wins - 1);
    for (var n = start; n < start + 9; n++) {
      var state = n <= wins ? "done" : (n === wins + 1 ? "next" : "");
      steps += '<div class="pass-step ' + state + '"><span class="pass-n">#' + n + '</span><span class="pass-ico">' + (n <= wins ? "✓" : "🏆") + "</span>" +
        '<b><span class="coin">🪙</span> +' + fmt(per) + "</b><small>Top 1</small></div>";
    }
    body.innerHTML =
      '<div class="pass-hero"><span class="pass-hero-shine"></span>' +
        '<div class="pass-ticket">🎟</div>' +
        '<div class="pass-hero-text"><span>PASS TOP 1</span><b><span class="coin">🪙</span> ' + fmt(per) + '</b><small>à chaque fois que tu termines 1er d\'une partie</small></div>' +
      "</div>" +
      '<div class="pass-stats">' +
        '<div><small>Top 1 obtenus</small><b>' + fmt(wins) + "</b></div>" +
        '<div><small>Gagné avec le Pass</small><b><span class="coin">🪙</span> ' + fmt(wins * per) + "</b></div>" +
        '<div><small>Ton solde</small><b><span class="coin">🪙</span> ' + fmt(wallet.coins) + "</b></div>" +
      "</div>" +
      '<h3 class="shop-h">Tes prochaines récompenses</h3>' +
      '<div class="pass-track">' + steps + "</div>" +
      '<p class="panel-note">Les pièces arrivent automatiquement à la fin de la partie. Dépense-les dans le Magasin.</p>';
  }

  /* ---------------- Paramètres ---------------- */
  function knownAccounts() {
    try { return JSON.parse(localStorage.getItem("trugo_accounts") || "[]").filter(Boolean); } catch (e) { return []; }
  }
  function rememberAccount() {
    if (typeof APP === "undefined" || !APP.username) return;
    var list = knownAccounts().filter(function (n) { return n.toLowerCase() !== APP.username.toLowerCase(); });
    list.unshift(APP.username);
    try { localStorage.setItem("trugo_accounts", JSON.stringify(list.slice(0, 6))); } catch (e) {}
  }
  function logout(prefill) {
    try { if (prefill) sessionStorage.setItem("trugo_prefill", prefill); else sessionStorage.removeItem("trugo_prefill"); } catch (e) {}
    fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" })
      .catch(function () {})
      .then(function () { location.reload(); });
  }
  function renderSettings() {
    var body = $("settings-body");
    var me = typeof APP !== "undefined" ? APP.username : "";
    var others = knownAccounts().filter(function (n) { return n.toLowerCase() !== String(me).toLowerCase(); });
    body.innerHTML =
      '<div class="set-grid">' +
        '<div class="set-card">' +
          '<h3>👤 Compte</h3>' +
          '<div class="set-me"><span class="set-avatar">' + esc(String(me).charAt(0).toUpperCase()) + "</span><div><b>" + esc(me) + "</b><small>Connecté</small></div></div>" +
          '<button type="button" class="set-btn" id="set-switch">🔄 Changer de compte</button>' +
          '<div class="set-accounts" id="set-accounts" hidden>' +
            others.map(function (n) { return '<button type="button" class="set-chip" data-acc="' + esc(n) + '">' + esc(n) + "</button>"; }).join("") +
            '<button type="button" class="set-chip other" data-acc="">＋ Autre compte</button>' +
          "</div>" +
          '<button type="button" class="set-btn danger" id="set-logout">⏻ Se déconnecter</button>' +
        "</div>" +
        '<div class="set-card">' +
          '<h3>✉ Message aux administrateurs</h3>' +
          '<textarea id="set-message" maxlength="500" placeholder="Un souci, une idée, un joueur à signaler ? Écris-nous…"></textarea>' +
          '<div class="set-row"><small id="set-count">0 / 500</small><button type="button" class="set-btn gold" id="set-send">Envoyer</button></div>' +
          '<p class="set-feedback" id="set-feedback"></p>' +
        "</div>" +
      "</div>";
    $("set-switch").addEventListener("click", function () { $("set-accounts").hidden = !$("set-accounts").hidden; });
    $("set-accounts").addEventListener("click", function (e) {
      var b = e.target.closest("[data-acc]");
      if (b) logout(b.dataset.acc);
    });
    $("set-logout").addEventListener("click", function () { logout(""); });
    var ta = $("set-message");
    ta.addEventListener("input", function () { $("set-count").textContent = ta.value.length + " / 500"; });
    $("set-send").addEventListener("click", function () {
      var fb = $("set-feedback"), btn = $("set-send");
      var text = ta.value.trim();
      if (text.length < 3) { fb.textContent = "Écris un message un peu plus long."; fb.className = "set-feedback err"; return; }
      btn.disabled = true;
      api("/contact", { method: "POST", body: { message: text } }).then(function (d) {
        fb.textContent = d.message || "Message envoyé."; fb.className = "set-feedback ok";
        ta.value = ""; $("set-count").textContent = "0 / 500";
      }).catch(function (err) {
        fb.textContent = err.message; fb.className = "set-feedback err";
      }).then(function () { btn.disabled = false; });
    });
  }

  /* ---------------- Connexion : pré-remplissage après « changer de compte » ---------------- */
  try {
    var pre = sessionStorage.getItem("trugo_prefill");
    if (pre) {
      var nameInput = $("login-name");
      if (nameInput) nameInput.value = pre;
      var loginScreen = $("screen-login");
      if (loginScreen) {
        new MutationObserver(function () {
          if (loginScreen.classList.contains("active")) {
            var p = $("login-pass"); if (p) p.focus();
            sessionStorage.removeItem("trugo_prefill");
          }
        }).observe(loginScreen, { attributes: true, attributeFilter: ["class"] });
      }
    }
  } catch (e) {}

  /* ---------------- Lobby / fin de partie : synchronisation des pièces ---------------- */
  function coinBanner(amount) {
    var el = document.createElement("div");
    el.className = "coin-banner";
    el.innerHTML = '<span class="cb-trophy">🏆</span><div><b>TOP 1 !</b><span>+ ' + fmt(amount) + ' <span class="coin">🪙</span></span></div>';
    document.body.appendChild(el);
    setTimeout(function () { el.classList.add("out"); }, 3200);
    setTimeout(function () { el.remove(); }, 3800);
  }

  var lobby = $("screen-lobby");
  if (lobby) {
    var lastLobby = lobby.classList.contains("active");
    var onLobby = function () { rememberAccount(); loadWallet(); };
    new MutationObserver(function () {
      var now = lobby.classList.contains("active");
      if (now && !lastLobby) onLobby();
      lastLobby = now;
    }).observe(lobby, { attributes: true, attributeFilter: ["class"] });
    if (lastLobby) onLobby();
  }

  var match = $("screen-match");
  if (match) {
    new MutationObserver(function () {
      if (match.classList.contains("active")) coinsBeforeMatch = wallet.coins;
    }).observe(match, { attributes: true, attributeFilter: ["class"] });
  }
  var end = $("screen-endmatch");
  if (end) {
    new MutationObserver(function () {
      if (!end.classList.contains("active")) return;
      var before = coinsBeforeMatch;
      setTimeout(function () {
        loadWallet().then(function (d) {
          if (d && before !== null && d.coins > before) coinBanner(d.coins - before);
        });
      }, 1600);
    }).observe(end, { attributes: true, attributeFilter: ["class"] });
  }
})();
