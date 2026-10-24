/* ============================================================
   TRUGO — Social : Teams (groupes, chat, messages vocaux)
   Aucune dépendance : s'appuie sur /api/profile/teams
   ============================================================ */
(function () {
  "use strict";

  var API = "/api/profile/teams";
  var ROLE_LABEL = { member: "Membre", moderator: "Modérateur", admin: "Admin" };
  var MAX_REC_MS = 60000;
  var MIN_REC_MS = 700;

  var body = document.getElementById("teams-body");
  var panel = document.getElementById("panel-teams");
  var title = document.getElementById("teams-title");
  var openBtn = document.getElementById("btn-open-teams");
  if (!body || !panel || !openBtn) return;

  var GLOBAL_TEAM = { id: "global", name: "Chat général", code: "", owner: false, global: true };
  var team = null;          // team ouverte { id, name, code, owner, global }
  var lastId = 0;
  var pollTimer = null;
  var polling = false;
  var rec = null;           // enregistrement en cours
  var audioCache = {};      // msgId -> objectURL
  var player = null;        // { id, audio, btn }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }
  function $(sel, root) { return (root || body).querySelector(sel); }

  function request(path, opts) {
    opts = opts || {};
    opts.credentials = "same-origin";
    return fetch(API + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || "Erreur (" + r.status + ")");
        return d;
      });
    });
  }
  function postJson(path, data) {
    return request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data || {}) });
  }

  function fmtTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  function fmtAgo(iso) {
    if (!iso) return "";
    var d = new Date(iso), diff = (Date.now() - d.getTime()) / 1000;
    if (isNaN(diff)) return "";
    if (diff < 60) return "à l'instant";
    if (diff < 3600) return Math.floor(diff / 60) + " min";
    if (diff < 86400) return Math.floor(diff / 3600) + " h";
    return Math.floor(diff / 86400) + " j";
  }
  function fmtDur(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function nameHtml(name, role) {
    return '<span class="pf-name role-' + esc(role || "member") + '">' + esc(name) + "</span>";
  }

  /* ---------------- Liste des teams ---------------- */
  function showList(message) {
    stopPolling();
    cancelRecording(true);
    stopPlayer();
    team = null;
    title.textContent = "Teams";
    body.className = "tm-body tm-view-list";
    body.innerHTML =
      '<div class="tm-actions">' +
        '<form class="tm-form" id="tm-create-form" autocomplete="off">' +
          '<input type="text" id="tm-new-name" maxlength="24" placeholder="Nom de ta nouvelle team">' +
          '<button type="submit" class="tm-btn tm-btn-gold">Créer</button>' +
        "</form>" +
        '<form class="tm-form" id="tm-join-form" autocomplete="off">' +
          '<input type="text" id="tm-join-code" maxlength="8" inputmode="numeric" placeholder="Code à 8 chiffres">' +
          '<button type="submit" class="tm-btn">Rejoindre</button>' +
        "</form>" +
      "</div>" +
      '<p class="tm-feedback" id="tm-feedback"></p>' +
      '<ul class="tm-list" id="tm-list">' +
        '<li><button type="button" class="tm-team tm-global" id="tm-open-global"><span class="tm-avatar">🌍</span>' +
        '<span class="tm-team-info"><b>Chat général</b><small>Discute avec tout le monde</small></span>' +
        '<span class="tm-team-meta"><em>Public</em></span></button></li>' +
        '<li class="tm-empty tm-loading">Chargement…</li></ul>';
    if (message) feedback(message, false);

    $("#tm-create-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var name = $("#tm-new-name").value.trim();
      if (name.length < 2) return feedback("Le nom doit faire au moins 2 caractères.", true);
      postJson("", { name: name }).then(function (d) {
        openTeam({ id: d.id, name: d.name, code: d.code, owner: true });
      }).catch(function (err) { feedback(err.message, true); });
    });
    $("#tm-join-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var code = $("#tm-join-code").value.trim();
      if (!/^\d{8}$/.test(code)) return feedback("Le code doit contenir 8 chiffres.", true);
      postJson("/join", { code: code }).then(function (d) {
        openTeam({ id: d.id, name: d.name, code: code, owner: false });
      }).catch(function (err) { feedback(err.message, true); });
    });

    $("#tm-open-global").addEventListener("click", function () { openTeam(GLOBAL_TEAM); });

    request("").then(function (d) {
      var ul = $("#tm-list");
      if (!ul) return;
      var loading = ul.querySelector(".tm-loading");
      if (loading) loading.remove();
      if (!d.teams.length) {
        ul.insertAdjacentHTML("beforeend", '<li class="tm-empty"><span>💬</span>Aucune team privée pour l\'instant.<br>Crée la tienne ou rejoins-en une avec un code.</li>');
        return;
      }
      ul.insertAdjacentHTML("beforeend", d.teams.map(function (t, i) {
        return '<li><button type="button" class="tm-team" data-i="' + i + '">' +
          '<span class="tm-avatar">' + esc(t.name.charAt(0).toUpperCase()) + "</span>" +
          '<span class="tm-team-info"><b>' + esc(t.name) + (t.owner ? ' <i title="Chef">👑</i>' : "") + "</b>" +
          "<small>" + (t.lastPreview ? esc(t.lastPreview) : "Aucun message") + "</small></span>" +
          '<span class="tm-team-meta"><em>👥 ' + t.members + "</em><small>" + fmtAgo(t.lastAt) + "</small></span>" +
          "</button></li>";
      }).join(""));
      ul.onclick = function (e) {
        var b = e.target.closest(".tm-team[data-i]");
        if (!b) return;
        openTeam(d.teams[Number(b.dataset.i)]);
      };
    }).catch(function (err) {
      var ul = $("#tm-list");
      if (!ul) return;
      var loading = ul.querySelector(".tm-loading");
      if (loading) loading.remove();
      ul.insertAdjacentHTML("beforeend", '<li class="tm-empty">' + esc(err.message) + "</li>");
    });
  }
  function feedback(text, isError) {
    var el = $("#tm-feedback");
    if (!el) return;
    el.textContent = text || "";
    el.className = "tm-feedback" + (text ? (isError ? " err" : " ok") : "");
  }

  /* ---------------- Salon de discussion ---------------- */
  function openTeam(t) {
    team = { id: t.id, name: t.name, code: t.code, owner: !!t.owner, global: !!t.global };
    lastId = 0;
    title.textContent = team.global ? "Team" : "Team privée";
    body.className = "tm-body tm-view-chat";
    body.innerHTML =
      '<div class="tm-chat-head">' +
        '<button type="button" class="tm-icon" id="tm-back" aria-label="Retour">‹</button>' +
        '<div class="tm-chat-title"><b>' + (team.global ? "🌍 " : "") + esc(team.name) + '</b><small id="tm-sub">' + (team.global ? "Tout le monde peut écrire ici" : "Code " + esc(team.code)) + "</small></div>" +
        '<button type="button" class="tm-icon" id="tm-members-btn" aria-label="Membres">👥</button>' +
      "</div>" +
      '<div class="tm-messages" id="tm-messages"><div class="tm-empty">Chargement…</div></div>' +
      '<div class="tm-members" id="tm-members" hidden></div>' +
      '<form class="tm-composer" id="tm-composer" autocomplete="off">' +
        '<input type="text" id="tm-input" maxlength="500" placeholder="Écrire un message…">' +
        '<button type="button" class="tm-icon tm-mic" id="tm-mic" aria-label="Message vocal">🎤</button>' +
        '<button type="submit" class="tm-icon tm-send" id="tm-send" aria-label="Envoyer">➤</button>' +
      "</form>" +
      '<div class="tm-recbar" id="tm-recbar" hidden>' +
        '<span class="tm-recdot"></span><b id="tm-rectime">0:00</b><span class="tm-recwave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>' +
        '<button type="button" class="tm-btn" id="tm-rec-cancel">Annuler</button>' +
        '<button type="button" class="tm-btn tm-btn-gold" id="tm-rec-send">Envoyer</button>' +
      "</div>";

    $("#tm-back").addEventListener("click", function () { showList(); });
    $("#tm-members-btn").addEventListener("click", toggleMembers);
    $("#tm-composer").addEventListener("submit", function (e) { e.preventDefault(); sendText(); });
    $("#tm-mic").addEventListener("click", startRecording);
    $("#tm-rec-cancel").addEventListener("click", function () { cancelRecording(false); });
    $("#tm-rec-send").addEventListener("click", function () { finishRecording(); });
    $("#tm-messages").addEventListener("click", onMessageClick);
    $("#tm-messages").addEventListener("click", onDeleteClick);

    loadMessages(true);
    startPolling();
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(function () {
      if (document.hidden || !panel.classList.contains("open")) return;
      loadMessages(false);
    }, 2500);
  }
  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function loadMessages(first) {
    if (!team || polling) return;
    polling = true;
    var id = team.id;
    request("/" + id + "/messages" + (lastId ? "?after=" + lastId : "")).then(function (d) {
      if (!team || team.id !== id) return;
      var box = $("#tm-messages");
      if (!box) return;
      if (first) box.innerHTML = "";
      if (first && !d.messages.length) {
        box.innerHTML = '<div class="tm-empty"><span>👋</span>Dis bonjour à ta team !<br>Écris un message ou envoie un vocal.</div>';
        return;
      }
      if (!d.messages.length) return;
      var empty = box.querySelector(".tm-empty");
      if (empty) empty.remove();
      var nearBottom = first || box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      d.messages.forEach(function (m) {
        if (m.id <= lastId) return;
        lastId = m.id;
        box.appendChild(renderMessage(m));
      });
      if (nearBottom) box.scrollTop = box.scrollHeight;
    }).catch(function (err) {
      if (first) {
        var box = $("#tm-messages");
        if (box) box.innerHTML = '<div class="tm-empty">' + esc(err.message) + "</div>";
      }
    }).then(function () { polling = false; });
  }

  function renderMessage(m) {
    var el = document.createElement("div");
    el.className = "tm-msg" + (m.mine ? " mine" : "");
    el.dataset.id = m.id;
    var content;
    if (m.kind === "voice") {
      var bars = "";
      for (var i = 0; i < 22; i++) bars += '<i style="height:' + (22 + ((i * 37 + m.id * 11) % 70)) + '%"></i>';
      content = '<div class="tm-voice" data-id="' + m.id + '" data-dur="' + m.duration + '">' +
        '<button type="button" class="tm-play" aria-label="Écouter">▶</button>' +
        '<span class="tm-wave">' + bars + '<span class="tm-wave-fill"></span></span>' +
        '<small class="tm-dur">' + fmtDur(m.duration) + "</small></div>";
    } else {
      content = '<div class="tm-text">' + esc(m.text) + "</div>";
    }
    el.innerHTML =
      '<div class="tm-bubble">' +
        (m.mine ? "" : '<div class="tm-author">' + nameHtml(m.username, m.role) + "</div>") +
        content +
        '<small class="tm-time">' + fmtTime(m.at) + "</small>" +
        (m.canDelete ? '<button type="button" class="tm-del" title="Supprimer" data-del="' + m.id + '">✕</button>' : "") +
      "</div>";
    return el;
  }

  function onDeleteClick(e) {
    var b = e.target.closest(".tm-del");
    if (!b || !team) return;
    var id = b.dataset.del;
    request("/" + team.id + "/messages/" + id, { method: "DELETE" }).then(function () {
      var row = b.closest(".tm-msg");
      if (row) row.remove();
    }).catch(function (err) { toast(err.message); });
  }

  function sendText() {
    var input = $("#tm-input");
    if (!team || !input) return;
    var text = input.value.trim();
    if (!text) return;
    input.value = "";
    postJson("/" + team.id + "/messages", { text: text }).then(function () {
      loadMessages(false);
    }).catch(function (err) {
      input.value = text;
      toast(err.message);
    });
  }

  function toast(text) {
    var box = $("#tm-messages");
    if (!box) return;
    var el = document.createElement("div");
    el.className = "tm-toast";
    el.textContent = text;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
    setTimeout(function () { el.remove(); }, 3500);
  }

  /* ---------------- Membres ---------------- */
  function toggleMembers() {
    var box = $("#tm-members");
    if (!box || !team) return;
    if (!box.hidden) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<div class="tm-empty">Chargement…</div>';
    request("/" + team.id + "/members").then(function (d) {
      team.owner = d.team.owner;
      var sub = $("#tm-sub");
      if (d.team.global) {
        if (sub) sub.textContent = d.members.length + " joueur" + (d.members.length > 1 ? "s" : "") + " en ligne";
        box.innerHTML = '<div class="tm-code-row"><span>En ligne maintenant</span></div><ul class="tm-member-list">' +
          d.members.map(function (m) {
            return '<li><span class="tm-dot on"></span>' + nameHtml(m.username, m.role) + "<small>" + ROLE_LABEL[m.role] + (m.me ? " · toi" : "") + "</small></li>";
          }).join("") + "</ul>";
        return;
      }
      if (sub) sub.textContent = d.members.length + " membre" + (d.members.length > 1 ? "s" : "") + " · code " + d.team.code;
      box.innerHTML =
        '<div class="tm-code-row"><span>Code d\'invitation</span><b>' + esc(d.team.code) + '</b><button type="button" class="tm-btn" id="tm-copy">Copier</button></div>' +
        '<ul class="tm-member-list">' + d.members.map(function (m) {
          return '<li><span class="tm-dot' + (m.online ? " on" : "") + '"></span>' +
            nameHtml(m.username, m.role) +
            (m.owner ? ' <i title="Chef">👑</i>' : "") +
            "<small>" + ROLE_LABEL[m.role] + (m.me ? " · toi" : "") + "</small>" +
            (d.team.owner && !m.me ? '<button type="button" class="tm-kick" data-id="' + esc(m.id) + '" title="Exclure">✕</button>' : "") +
            "</li>";
        }).join("") + "</ul>" +
        '<button type="button" class="tm-btn tm-btn-danger" id="tm-leave">Quitter la team</button>';
      $("#tm-copy").addEventListener("click", function () {
        var done = function () { $("#tm-copy").textContent = "Copié ✓"; };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(d.team.code).then(done, done);
        else done();
      });
      $("#tm-leave").addEventListener("click", function () {
        if (!confirm("Quitter la team « " + team.name + " » ?")) return;
        postJson("/" + team.id + "/leave").then(function () { showList("Tu as quitté la team."); })
          .catch(function (err) { toast(err.message); });
      });
      box.onclick = function (e) {
        var k = e.target.closest(".tm-kick");
        if (!k) return;
        postJson("/" + team.id + "/kick", { userId: k.dataset.id }).then(function () {
          box.hidden = true; toggleMembers();
        }).catch(function (err) { toast(err.message); });
      };
    }).catch(function (err) { box.innerHTML = '<div class="tm-empty">' + esc(err.message) + "</div>"; });
  }

  /* ---------------- Messages vocaux : enregistrement ---------------- */
  function pickMime() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
    var list = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    for (var i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])) return list[i];
    return "";
  }

  function startRecording() {
    if (rec || !team) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      return toast("Ton navigateur ne permet pas d'enregistrer un vocal.");
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      if (!team) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
      var mime = pickMime();
      var recorder;
      try { recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
      catch (e) { stream.getTracks().forEach(function (t) { t.stop(); }); return toast("Enregistrement impossible."); }
      rec = { recorder: recorder, stream: stream, chunks: [], startedAt: Date.now(), cancelled: false, teamId: team.id, timer: null };
      recorder.ondataavailable = function (e) { if (e.data && e.data.size) rec && rec.chunks.push(e.data); };
      var local = rec;
      recorder.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        clearInterval(local.timer);
        if (rec === local) rec = null;
        showRecBar(false);
        if (local.cancelled) return;
        var duration = Date.now() - local.startedAt;
        if (duration < MIN_REC_MS) return toast("Vocal trop court.");
        var type = (recorder.mimeType || mime || "audio/webm").split(";")[0];
        if (type.indexOf("audio/") !== 0) type = "audio/webm";
        uploadVoice(local.teamId, new Blob(local.chunks, { type: type }), duration, type);
      };
      recorder.start();
      showRecBar(true);
      local.timer = setInterval(function () {
        var ms = Date.now() - local.startedAt;
        var t = $("#tm-rectime");
        if (t) t.textContent = fmtDur(ms);
        if (ms >= MAX_REC_MS) finishRecording();
      }, 200);
    }).catch(function () {
      toast("Micro refusé : autorise-le dans ton navigateur pour envoyer des vocaux.");
    });
  }

  function showRecBar(on) {
    var bar = $("#tm-recbar"), comp = $("#tm-composer");
    if (bar) bar.hidden = !on;
    if (comp) comp.hidden = on;
    var t = $("#tm-rectime");
    if (on && t) t.textContent = "0:00";
  }
  function finishRecording() {
    if (!rec || rec.recorder.state === "inactive") return;
    rec.recorder.stop();
  }
  function cancelRecording(silent) {
    if (!rec) return;
    rec.cancelled = true;
    try { if (rec.recorder.state !== "inactive") rec.recorder.stop(); } catch (e) {}
    try { rec.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    clearInterval(rec.timer);
    rec = null;
    if (!silent) showRecBar(false);
  }

  function uploadVoice(teamId, blob, duration, type) {
    fetch(API + "/" + teamId + "/voice?duration=" + Math.min(duration, MAX_REC_MS), {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": type }, body: blob
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || "Envoi impossible.");
        if (team && team.id === teamId) loadMessages(false);
      });
    }).catch(function (err) { toast(err.message); });
  }

  /* ---------------- Messages vocaux : lecture ---------------- */
  function stopPlayer() {
    if (!player) return;
    try { player.audio.pause(); } catch (e) {}
    setPlayState(player, false);
    player = null;
  }
  function setPlayState(p, playing) {
    var btn = p.btn;
    if (!btn) return;
    btn.textContent = playing ? "❚❚" : "▶";
    btn.classList.toggle("playing", playing);
    if (!playing) {
      var fill = btn.parentNode.querySelector(".tm-wave-fill");
      if (fill) fill.style.width = "0%";
    }
  }
  function onMessageClick(e) {
    var btn = e.target.closest(".tm-play");
    if (!btn || !team) return;
    var wrap = btn.closest(".tm-voice");
    var id = wrap.dataset.id;
    if (player && player.id === id) { stopPlayer(); return; }
    stopPlayer();
    btn.textContent = "…";
    getAudioUrl(team.id, id).then(function (url) {
      var audio = new Audio(url);
      var p = { id: id, audio: audio, btn: btn };
      player = p;
      var fill = wrap.querySelector(".tm-wave-fill");
      audio.addEventListener("timeupdate", function () {
        var dur = audio.duration && isFinite(audio.duration) ? audio.duration : Number(wrap.dataset.dur) / 1000;
        if (fill && dur) fill.style.width = Math.min(100, audio.currentTime / dur * 100) + "%";
      });
      audio.addEventListener("ended", function () { setPlayState(p, false); if (player === p) player = null; });
      audio.addEventListener("error", function () { setPlayState(p, false); if (player === p) player = null; toast("Lecture impossible sur cet appareil."); });
      setPlayState(p, true);
      return audio.play();
    }).catch(function () {
      btn.textContent = "▶";
      toast("Lecture impossible sur cet appareil.");
    });
  }
  function getAudioUrl(teamId, msgId) {
    var key = teamId + ":" + msgId;
    if (audioCache[key]) return Promise.resolve(audioCache[key]);
    return fetch(API + "/" + teamId + "/voice/" + msgId, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("audio");
      return r.blob();
    }).then(function (blob) {
      audioCache[key] = URL.createObjectURL(blob);
      return audioCache[key];
    });
  }

  /* ---------------- Ouverture / fermeture du panneau ---------------- */
  openBtn.addEventListener("click", function () {
    openPanel("panel-teams");
    openTeam(GLOBAL_TEAM);
  });

  var wasOpen = false;
  new MutationObserver(function () {
    var open = panel.classList.contains("open");
    if (wasOpen && !open) {
      stopPolling();
      cancelRecording(true);
      stopPlayer();
      team = null;
    }
    wasOpen = open;
  }).observe(panel, { attributes: true, attributeFilter: ["class"] });
})();
