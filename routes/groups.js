/* ============================================================
   TRUGO — Groupes (chat général, groupes privés, vocaux, images,
   sondages, réactions, invitations, appels vocaux, signalements,
   rôles, timeouts, bans, présence).

   NOUVEAU FICHIER — aucun fichier existant n'est modifié.
   Montage (1 ligne dans ton serveur, ex. server.js) :
       app.use("/api/groups", require("./routes/groups"));
   Les tables (préfixe grp_) sont créées automatiquement au 1er appel.
   ============================================================ */
const express = require("express");
let pool;
try { pool = require("../db"); } catch (e) { pool = require("./db"); } // fonctionne aussi si le fichier n'est pas dans routes/

const router = express.Router();

const ADMIN_USERNAME = "trusy";
const GLOBAL_CODE = "00000000";
const MAX_GROUPS_PER_USER = 15;
const MAX_MEMBERS = 50;
const MAX_TEXT = 800;
const MAX_VOICE_BYTES = 700 * 1024;
const MAX_VOICE_MS = 60 * 1000;
const MAX_IMAGE_BYTES = 600 * 1024;
const KEEP_MESSAGES = 400;
const WINDOW = 80; // nombre de messages dont on renvoie réactions / sondages
const ONLINE_SECONDS = 90;
const MAX_CALL_PEERS = 8;
const MAX_AVATAR_BYTES = 150 * 1024;
const MAX_TEAM = 6;
const ALLOWED_AUDIO = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a", "audio/aac"];
const ALLOWED_IMAGE = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "👏", "🎉"];
const REPORT_REASONS = {
  spam: "Spam",
  insults: "Insultes",
  harassment: "Harcèlement",
  inappropriate: "Contenu inapproprié",
  cheating: "Triche",
  other: "Autre"
};

/* ---------------- utilitaires ---------------- */
function wrap(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error("Erreur groupes :", error.message);
      if (!res.headersSent) res.status(500).json({ error: "Erreur serveur." });
    }
  };
}
function cleanText(value, max) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
}
function siteRole(row) {
  if (String(row.username).toLowerCase() === ADMIN_USERNAME) return "admin";
  return row.role === "moderator" ? "moderator" : "member";
}
function isId(v) { return /^\d{1,12}$/.test(String(v)); }

const sendTimes = new Map();
function tooFast(userId) {
  const now = Date.now();
  const key = String(userId);
  const list = (sendTimes.get(key) || []).filter((t) => now - t < 30000);
  if (list.length >= 18) { sendTimes.set(key, list); return true; }
  list.push(now);
  sendTimes.set(key, list);
  return false;
}

async function randomCode() {
  for (let i = 0; i < 20; i++) {
    let code = "";
    for (let k = 0; k < 8; k++) code += Math.floor(Math.random() * 10);
    if (code === GLOBAL_CODE) continue;
    const taken = await pool.query(`SELECT 1 FROM grp_groups WHERE code = $1`, [code]);
    if (taken.rowCount === 0) return code;
  }
  throw new Error("Impossible de générer un code.");
}

/* ---------------- schéma ---------------- */
let schemaPromise = null;
async function ensureSchema() {
  const typeResult = await pool.query(
    `SELECT data_type FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = 'id' LIMIT 1`
  );
  const dataType = typeResult.rows[0] ? typeResult.rows[0].data_type : "integer";
  const idType = { integer: "INTEGER", bigint: "BIGINT", smallint: "SMALLINT", uuid: "UUID" }[dataType] || "TEXT";

  await pool.query(
    `CREATE TABLE IF NOT EXISTS grp_groups (
       id SERIAL PRIMARY KEY,
       name TEXT NOT NULL,
       code TEXT NOT NULL UNIQUE,
       owner_id ${idType} REFERENCES users(id) ON DELETE SET NULL,
       chief_id ${idType} REFERENCES users(id) ON DELETE SET NULL,
       deputy_id ${idType} REFERENCES users(id) ON DELETE SET NULL,
       is_global BOOLEAN NOT NULL DEFAULT FALSE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS grp_members (
       group_id INTEGER NOT NULL REFERENCES grp_groups(id) ON DELETE CASCADE,
       user_id ${idType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       timeout_until TIMESTAMPTZ,
       last_read BIGINT NOT NULL DEFAULT 0,
       PRIMARY KEY (group_id, user_id)
     )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS grp_bans (
       group_id INTEGER NOT NULL REFERENCES grp_groups(id) ON DELETE CASCADE,
       user_id ${idType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       PRIMARY KEY (group_id, user_id)
     )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS grp_messages (
       id SERIAL PRIMARY KEY,
       group_id INTEGER NOT NULL REFERENCES grp_groups(id) ON DELETE CASCADE,
       user_id ${idType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       kind TEXT NOT NULL DEFAULT 'text',
       body TEXT NOT NULL DEFAULT '',
       meta JSONB,
       media BYTEA,
       mime TEXT,
       duration_ms INTEGER NOT NULL DEFAULT 0,
       reply_to INTEGER,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS grp_messages_idx ON grp_messages (group_id, id)`);
  await pool.query(
    `CREATE TABLE IF NOT EXISTS grp_reactions (
       message_id INTEGER NOT NULL REFERENCES grp_messages(id) ON DELETE CASCADE,
       user_id ${idType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       emoji TEXT NOT NULL,
       PRIMARY KEY (message_id, user_id, emoji)
     )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS grp_votes (
       message_id INTEGER NOT NULL REFERENCES grp_messages(id) ON DELETE CASCADE,
       user_id ${idType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       opt INTEGER NOT NULL,
       PRIMARY KEY (message_id, user_id, opt)
     )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS grp_reports (
       id SERIAL PRIMARY KEY,
       reporter_id ${idType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       target_id ${idType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       group_id INTEGER REFERENCES grp_groups(id) ON DELETE SET NULL,
       message_id INTEGER,
       reason TEXT NOT NULL,
       details TEXT NOT NULL DEFAULT '',
       snapshot TEXT NOT NULL DEFAULT '',
       handled BOOLEAN NOT NULL DEFAULT FALSE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS grp_avatars (
       user_id ${idType} PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
       mime TEXT NOT NULL,
       data BYTEA NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS grp_profile (
       user_id ${idType} PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
       bio TEXT NOT NULL DEFAULT '',
       note TEXT NOT NULL DEFAULT '',
       live BOOLEAN NOT NULL DEFAULT FALSE,
       act TEXT,
       music BOOLEAN NOT NULL DEFAULT FALSE,
       live_at TIMESTAMPTZ,
       still_since TIMESTAMPTZ,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS grp_ranked (
       user_id ${idType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       season INTEGER NOT NULL,
       elims INTEGER NOT NULL DEFAULT 0,
       matches INTEGER NOT NULL DEFAULT 0,
       last_mid TEXT,
       last_report TIMESTAMPTZ,
       PRIMARY KEY (user_id, season)
     )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS grp_supreme (
       user_id ${idType} PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
       level INTEGER NOT NULL DEFAULT 0,
       cycle_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       cycle_kills INTEGER NOT NULL DEFAULT 0,
       level_kills INTEGER NOT NULL DEFAULT 0,
       result TEXT
     )`
  );
  for (const col of [
    "times INTEGER NOT NULL DEFAULT 1", "last_season INTEGER", "max_level INTEGER NOT NULL DEFAULT 0", "max_kills INTEGER NOT NULL DEFAULT 0",
    "total_kills INTEGER NOT NULL DEFAULT 0", "matches INTEGER NOT NULL DEFAULT 0", "active_s INTEGER NOT NULL DEFAULT 0", "last_rep TIMESTAMPTZ",
  ]) await pool.query(`ALTER TABLE grp_supreme ADD COLUMN IF NOT EXISTS ${col}`);
  await pool.query(
    `CREATE TABLE IF NOT EXISTS grp_progress (
       user_id ${idType} PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
       fights INTEGER NOT NULL DEFAULT 0,
       max_level INTEGER NOT NULL DEFAULT 1,
       last_fight TIMESTAMPTZ
     )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS grp_game_teams (
       id SERIAL PRIMARY KEY,
       code TEXT NOT NULL UNIQUE,
       leader_id ${idType} REFERENCES users(id) ON DELETE SET NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS grp_game_team_members (
       team_id INTEGER NOT NULL REFERENCES grp_game_teams(id) ON DELETE CASCADE,
       user_id ${idType} PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
       joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  await pool.query(
    `INSERT INTO grp_groups (name, code, owner_id, is_global) VALUES ('Chat général', $1, NULL, TRUE)
     ON CONFLICT (code) DO NOTHING`,
    [GLOBAL_CODE]
  );
}
function ensure(req, res, next) {
  if (!schemaPromise) {
    schemaPromise = ensureSchema().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  schemaPromise.then(() => next()).catch((error) => {
    console.error("Erreur schéma groupes :", error.message);
    res.status(500).json({ error: "Base de données des groupes indisponible." });
  });
}

/* ---------------- authentification ---------------- */
async function loadMe(req, res, next) {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: "Tu dois être connecté." });
  try {
    const r = await pool.query(`SELECT id, username, role FROM users WHERE id = $1`, [req.session.userId]);
    if (r.rowCount === 0) return res.status(401).json({ error: "Session invalide." });
    req.me = { id: r.rows[0].id, username: r.rows[0].username, role: siteRole(r.rows[0]) };
    next();
  } catch (error) {
    console.error("Erreur groupes :", error.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
}
router.use(loadMe);
router.use(ensure);

/* ---------------- rôles dans un groupe ---------------- */
// rang : 4 créateur / admin du site (chat général) ; 3 chef / modérateur ; 2 sous-chef ; 1 membre
function rankOf(group, userId, roleSite) {
  if (group.is_global) {
    if (roleSite === "admin") return 4;
    if (roleSite === "moderator") return 3;
    return 1;
  }
  const id = String(userId);
  if (group.owner_id != null && String(group.owner_id) === id) return 4;
  if (group.chief_id != null && String(group.chief_id) === id) return 3;
  if (group.deputy_id != null && String(group.deputy_id) === id) return 2;
  return 1;
}
function badgeOf(group, userId, roleSite) {
  const r = rankOf(group, userId, roleSite);
  if (group.is_global) return r === 4 ? "admin" : r === 3 ? "staff" : "member";
  return r === 4 ? "owner" : r === 3 ? "chief" : r === 2 ? "deputy" : "member";
}
function isOwner(group, userId) {
  return !group.is_global && group.owner_id != null && String(group.owner_id) === String(userId);
}

// charge le groupe + vérifie l'appartenance (le chat général est ouvert à tous)
async function loadGroup(req, res, next) {
  const id = String(req.params.id || "");
  try {
    let g;
    if (id === "global") {
      g = await pool.query(`SELECT * FROM grp_groups WHERE code = $1`, [GLOBAL_CODE]);
    } else {
      if (!/^\d{1,9}$/.test(id)) return res.status(400).json({ error: "Groupe invalide." });
      g = await pool.query(`SELECT * FROM grp_groups WHERE id = $1`, [id]);
    }
    if (g.rowCount === 0) return res.status(404).json({ error: "Groupe introuvable." });
    const group = g.rows[0];
    let m = await pool.query(
      `SELECT timeout_until, last_read FROM grp_members WHERE group_id = $1 AND user_id = $2`,
      [group.id, req.me.id]
    );
    if (m.rowCount === 0) {
      if (!group.is_global) return res.status(404).json({ error: "Groupe introuvable." });
      await pool.query(
        `INSERT INTO grp_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [group.id, req.me.id]
      );
      m = await pool.query(
        `SELECT timeout_until, last_read FROM grp_members WHERE group_id = $1 AND user_id = $2`,
        [group.id, req.me.id]
      );
    }
    req.group = group;
    req.membership = m.rows[0] || {};
    req.myRank = rankOf(group, req.me.id, req.me.role);
    next();
  } catch (error) {
    console.error("Erreur groupes :", error.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
}

async function touchPresence(userId) {
  // fait apparaître le joueur « maintenant » tant qu'il utilise le chat
  await pool.query(`UPDATE player_stats SET last_seen = NOW() WHERE user_id = $1`, [userId]).catch(() => {});
}

function muteInfo(req) {
  const t = req.membership && req.membership.timeout_until;
  if (t && new Date(t).getTime() > Date.now()) return t;
  return null;
}
function denyIfMuted(req, res) {
  const t = muteInfo(req);
  if (t) {
    res.status(403).json({ error: "Tu es en timeout dans ce groupe.", timeoutUntil: t });
    return true;
  }
  return false;
}

async function trimMessages(groupId) {
  await pool.query(
    `DELETE FROM grp_messages
     WHERE group_id = $1
       AND id < COALESCE((SELECT id FROM grp_messages WHERE group_id = $1 ORDER BY id DESC OFFSET $2 LIMIT 1), 0)`,
    [groupId, KEEP_MESSAGES]
  );
}

async function replyTarget(groupId, replyTo) {
  if (!isId(replyTo)) return null;
  const r = await pool.query(`SELECT id FROM grp_messages WHERE id = $1 AND group_id = $2`, [replyTo, groupId]);
  return r.rowCount ? Number(replyTo) : null;
}

async function insertMessage(req, kind, body, opts) {
  opts = opts || {};
  const r = await pool.query(
    `INSERT INTO grp_messages (group_id, user_id, kind, body, meta, media, mime, duration_ms, reply_to)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      req.group.id, req.me.id, kind, body,
      opts.meta ? JSON.stringify(opts.meta) : null,
      opts.media || null, opts.mime || null, opts.duration || 0, opts.replyTo || null
    ]
  );
  trimMessages(req.group.id).catch(() => {});
  return Number(r.rows[0].id);
}

/* ---------------- appels vocaux (signalisation WebRTC en mémoire) ---------------- */
const calls = new Map(); // groupId -> { peers: Map(userId -> { name, ts }), box: Map(userId -> [signals]), seq }
const PEER_TTL = 15000;
function callOf(groupId, create) {
  const key = String(groupId);
  let c = calls.get(key);
  if (c) {
    const now = Date.now();
    for (const [uid, p] of c.peers) {
      if (now - p.ts > PEER_TTL) { c.peers.delete(uid); c.box.delete(uid); }
    }
    if (c.peers.size === 0) { calls.delete(key); c = null; }
  }
  if (!c && create) {
    c = { peers: new Map(), box: new Map(), seq: 0 };
    calls.set(key, c);
  }
  return c || null;
}
function callSummary(groupId, meId) {
  const c = callOf(groupId, false);
  if (!c) return { active: false, count: 0, names: [], inCall: false };
  return {
    active: true,
    count: c.peers.size,
    names: Array.from(c.peers.values()).map((p) => p.name).slice(0, 6),
    inCall: c.peers.has(String(meId))
  };
}
function iceServers() {
  const list = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  if (process.env.TURN_URL) {
    list.push({ urls: process.env.TURN_URL.split(","), username: process.env.TURN_USER || "", credential: process.env.TURN_PASS || "" });
  }
  return list;
}


/* ---------------- photos de profil ---------------- */
router.post(
  "/avatar",
  express.raw({ type: () => true, limit: MAX_AVATAR_BYTES + "b" }),
  wrap(async (req, res) => {
    const mime = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE.includes(mime)) return res.status(400).json({ error: "Format d'image non supporté." });
    const img = req.body;
    if (!Buffer.isBuffer(img) || img.length < 100) return res.status(400).json({ error: "Image vide." });
    if (img.length > MAX_AVATAR_BYTES) return res.status(413).json({ error: "Image trop lourde." });
    await pool.query(
      `INSERT INTO grp_avatars (user_id, mime, data, updated_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data, updated_at = NOW()`,
      [req.me.id, mime, img]
    );
    res.json({ av: await avatarVersion(req.me.id) });
  })
);
/* ---------------- classé : ligues selon le total d'éliminations de la saison (30 jours) ---------------- */
const SEASON_LENGTH_MS = 30 * 24 * 3600 * 1000;
const SEASON_START = Date.parse(process.env.RANKED_SEASON_START || "2026-11-13T00:00:00+01:00");
// Bronze, Argent, Or, Diamant, Platine, Maître, Champion, Élite, Légende, Ultime, Suprême
const LEAGUE_MIN = [0, 12, 40, 80, 120, 200, 300, 450, 600, 800, 1000];
function seasonInfo(now) {
  const t = now || Date.now();
  const n = Math.max(0, Math.floor((t - SEASON_START) / SEASON_LENGTH_MS));
  return { id: n + 1, start: SEASON_START + n * SEASON_LENGTH_MS, end: SEASON_START + (n + 1) * SEASON_LENGTH_MS };
}
function leagueOf(elims) {
  let i = 0;
  for (let k = 0; k < LEAGUE_MIN.length; k++) if (elims >= LEAGUE_MIN[k]) i = k;
  return i;
}

/* ---------------- ligues apres Supreme : arene de 2 h contre 9 bots, puis 1000 kills par palier ---------------- */
const SUP_NAMES = ["Suprême", "Suprême 1", "Suprême 2", "Suprême 3", "Suprême 4", "Suprême 5", "Grand Suprême", "Maître Suprême", "Champion Suprême", "Titan Suprême", "Suprématie"];
const SUP_CYCLE_MS = 2 * 3600 * 1000; // reset de l'arene : 2 h
const SUP_BOT_BASE_PER_MIN = Number(process.env.SUPREME_BOT_KILLS_PER_MIN) || 9; // kills/min du meilleur bot au premier palier ; double a chaque palier
const SUP_GRIND_KILLS = 1000; // a partir de Supreme 5 : 1000 kills par ligue
const SUP_BOT_NAMES = ["Nyx", "Vortex", "Blaze", "Kraken", "Specter", "Rogue", "Titanus", "Zephyr", "Havoc", "Onyx"];
const supHash = (a, b) => { let h = 2166136261; const t = String(a) + ":" + b; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; };
// Bots de l'arene (determines par joueur + cycle) : le bot 0 fait le plein debit, les autres 70 a 100 %.
function supBots(uid, cycleStartMs, level, atMs) {
  const rate = SUP_BOT_BASE_PER_MIN * Math.pow(2, level); // level = palier actuel, on vise level+1
  const mins = Math.max(0, Math.min(atMs, cycleStartMs + SUP_CYCLE_MS) - cycleStartMs) / 60000;
  const names = SUP_BOT_NAMES.map((n, i) => ({ n, o: supHash(uid + "n", cycleStartMs + i) })).sort((a, b) => a.o - b.o).map((x) => x.n);
  const out = [];
  for (let i = 0; i < 9; i++) {
    const mult = i === 0 ? 1 : 0.7 + 0.3 * supHash(uid, cycleStartMs + ":" + i);
    out.push({ name: names[i], kills: Math.floor(rate * mult * mins), rate: Math.round(rate * mult * 10) / 10 });
  }
  return out;
}
async function supEnsure(uid, seasonElims, seasonId) {
  if (seasonElims < LEAGUE_MIN[LEAGUE_MIN.length - 1]) return;
  await pool.query(`INSERT INTO grp_supreme (user_id, last_season) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`, [uid, seasonId]);
  await pool.query(`UPDATE grp_supreme SET last_season = $2 WHERE user_id = $1 AND last_season IS NULL`, [uid, seasonId]);
  await pool.query(`UPDATE grp_supreme SET times = times + 1, last_season = $2 WHERE user_id = $1 AND last_season < $2`, [uid, seasonId]); // nouvelle saison : Supreme atteint une fois de plus
}
// Cloture le cycle de 2 h s'il est termine : 1er = on monte, sinon on descend d'un palier (jamais sous Supreme).
async function supResolve(uid) {
  const r = await pool.query(`SELECT level, cycle_start, cycle_kills, level_kills, result FROM grp_supreme WHERE user_id = $1`, [uid]);
  let row = r.rows[0]; if (!row) return null;
  const lvl = Number(row.level), cs = new Date(row.cycle_start).getTime();
  if (lvl < 5 && Date.now() >= cs + SUP_CYCLE_MS) {
    const kills = Number(row.cycle_kills);
    const best = Math.max.apply(null, supBots(uid, cs, lvl, cs + SUP_CYCLE_MS).map((b) => b.kills));
    const won = kills > best;
    const to = won ? lvl + 1 : Math.max(0, lvl - 1);
    const result = JSON.stringify({ won, from: lvl, to, kills, best, at: cs + SUP_CYCLE_MS });
    const u = await pool.query(
      `UPDATE grp_supreme SET level = $2, max_level = GREATEST(max_level, $2), cycle_start = NOW(), cycle_kills = 0, level_kills = 0, result = $3 WHERE user_id = $1 AND cycle_start = $4`,
      [uid, to, result, row.cycle_start]
    );
    const r2 = await pool.query(`SELECT level, cycle_start, cycle_kills, level_kills, result FROM grp_supreme WHERE user_id = $1`, [uid]);
    row = r2.rows[0];
  }
  return row;
}
async function supAddKills(uid, kills) {
  if (!kills) return;
  const row = await supResolve(uid); if (!row) return;
  let lvl = Number(row.level), cyc = Number(row.cycle_kills), lk = Number(row.level_kills), result = row.result;
  if (lvl < 5) cyc += kills;
  else {
    lk += kills; const from = lvl;
    while (lvl < 10 && lk >= SUP_GRIND_KILLS) { lk -= SUP_GRIND_KILLS; lvl++; }
    if (lvl >= 10) lk = 0;
    if (lvl > from) result = JSON.stringify({ won: true, from, to: lvl, kills: SUP_GRIND_KILLS, best: 0, grind: true, at: Date.now() });
  }
  const gap = row.last_rep ? Math.min(600, Math.max(0, (Date.now() - new Date(row.last_rep).getTime()) / 1000)) : 150; // temps de jeu estime
  await pool.query(
    `UPDATE grp_supreme SET level = $2, cycle_kills = $3, level_kills = $4, result = $5, max_level = GREATEST(max_level, $2),
       max_kills = GREATEST(max_kills, $6), total_kills = total_kills + $7, matches = matches + 1, active_s = active_s + $8, last_rep = NOW()
     WHERE user_id = $1`,
    [uid, lvl, cyc, lk, result, lvl < 5 ? cyc : lk, kills, Math.round(gap < 20 ? 150 : gap)]
  );
}

/* ---------------- progression (niveau / combats) et profil de jeu : ligue supreme + badges ---------------- */
router.post(
  "/progress",
  wrap(async (req, res) => {
    const level = Math.max(1, Math.min(999, Math.floor(Number(req.body && req.body.level) || 1)));
    const fight = !!(req.body && req.body.fight);
    await pool.query(
      `INSERT INTO grp_progress (user_id, fights, max_level, last_fight) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET max_level = GREATEST(grp_progress.max_level, EXCLUDED.max_level),
         fights = grp_progress.fights + CASE WHEN $5 AND (grp_progress.last_fight IS NULL OR NOW() - grp_progress.last_fight > interval '20 seconds') THEN 1 ELSE 0 END,
         last_fight = CASE WHEN $5 AND (grp_progress.last_fight IS NULL OR NOW() - grp_progress.last_fight > interval '20 seconds') THEN NOW() ELSE grp_progress.last_fight END`,
      [req.me.id, fight ? 1 : 0, level, fight ? new Date() : null, fight]
    );
    const r = await pool.query(`SELECT fights, max_level FROM grp_progress WHERE user_id = $1`, [req.me.id]);
    res.json({ fights: Number(r.rows[0].fights), level: Number(r.rows[0].max_level) });
  })
);
router.get(
  "/gameprofile/:uid",
  wrap(async (req, res) => {
    const uid = req.params.uid === "me" ? req.me.id : req.params.uid;
    const u = await pool.query(`SELECT id FROM users WHERE id::text = $1`, [String(uid)]);
    if (!u.rowCount) return res.status(404).json({ error: "Joueur introuvable." });
    const id = u.rows[0].id;
    const sup = (await pool.query(`SELECT * FROM grp_supreme WHERE user_id = $1`, [id])).rows[0];
    const pr = (await pool.query(`SELECT fights, max_level FROM grp_progress WHERE user_id = $1`, [id])).rows[0] || { fights: 0, max_level: 1 };
    const fights = Number(pr.fights), plevel = Number(pr.max_level);
    let supOut = { reached: false };
    if (sup) {
      const lvl = Number(sup.level), maxL = Math.max(Number(sup.max_level), lvl);
      const hours = Number(sup.active_s) / 3600, tk = Number(sup.total_kills), mt = Number(sup.matches);
      supOut = {
        reached: true, times: Number(sup.times), level: lvl, name: SUP_NAMES[lvl], maxLevel: maxL, maxName: SUP_NAMES[maxL],
        maxKills: Math.max(Number(sup.max_kills), lvl < 5 ? Number(sup.cycle_kills) : Number(sup.level_kills)),
        curKills: lvl < 5 ? Number(sup.cycle_kills) : lvl < 10 ? Number(sup.level_kills) : 0, curLabel: lvl < 5 ? "cycle de 2 h" : "ligue en cours",
        totalKills: tk, matches: mt,
        perHour: hours >= 0.05 ? Math.round(tk / hours * 10) / 10 : null, perMatch: mt ? Math.round(tk / mt * 10) / 10 : null,
      };
    }
    const maxSup = supOut.reached ? supOut.maxLevel : -1;
    const badges = [
      { id: "supra-fort", name: "Supra-fort", icon: "💎", desc: "Atteindre la ligue Suprême", earned: maxSup >= 0 },
      { id: "respect-roi", name: "Respect roi", icon: "👑", desc: "Atteindre la Suprématie", earned: maxSup >= 10 },
      { id: "level-up", name: "Level up", icon: "⬆️", desc: "Passer niveau 5", earned: plevel >= 5 },
      { id: "hundred", name: "Hundred", icon: "💯", desc: "Faire 100 combats", earned: fights >= 100 },
    ];
    res.json({ sup: supOut, badges, fights, level: plevel });
  })
);
router.get(
  "/ranked/supreme",
  wrap(async (req, res) => {
    const se = seasonInfo();
    const e = await pool.query(`SELECT elims FROM grp_ranked WHERE user_id = $1 AND season = $2`, [req.me.id, se.id]);
    await supEnsure(req.me.id, e.rows[0] ? Number(e.rows[0].elims) : 0, se.id);
    const row = await supResolve(req.me.id);
    const base = { now: Date.now(), names: SUP_NAMES, cycleMs: SUP_CYCLE_MS, grindKills: SUP_GRIND_KILLS };
    if (!row) return res.json(Object.assign(base, { unlocked: false }));
    const lvl = Number(row.level), cs = new Date(row.cycle_start).getTime();
    const out = Object.assign(base, { unlocked: true, level: lvl, name: SUP_NAMES[lvl], next: lvl < 10 ? SUP_NAMES[lvl + 1] : null, result: row.result ? JSON.parse(row.result) : null });
    if (lvl < 5) {
      const kills = Number(row.cycle_kills);
      const bots = supBots(req.me.id, cs, lvl, Date.now());
      const board = bots.map((b) => ({ name: b.name, kills: b.kills, bot: true })).concat([{ name: req.me.username || "Toi", kills, me: true }]);
      board.sort((a, b) => b.kills - a.kills || (a.me ? 1 : -1)); // a egalite, le bot passe devant
      board.forEach((b, i) => (b.rank = i + 1));
      const best = Math.max.apply(null, bots.map((b) => b.kills));
      Object.assign(out, { phase: "arena", cycle: { start: cs, end: cs + SUP_CYCLE_MS }, kills, board, rank: board.findIndex((b) => b.me) + 1, best, lead: kills > best, missing: Math.max(0, best + 1 - kills), botRate: bots[0].rate });
    } else if (lvl < 10) {
      Object.assign(out, { phase: "grind", levelKills: Number(row.level_kills), goal: SUP_GRIND_KILLS });
    } else out.phase = "max";
    res.json(out);
  })
);
router.get(
  "/ranked/me",
  wrap(async (req, res) => {
    const se = seasonInfo();
    const r = await pool.query(`SELECT elims, matches FROM grp_ranked WHERE user_id = $1 AND season = $2`, [req.me.id, se.id]);
    const elims = r.rows[0] ? Number(r.rows[0].elims) : 0;
    const pos = await pool.query(`SELECT COUNT(*) AS n FROM grp_ranked WHERE season = $1 AND elims > $2`, [se.id, elims]);
    res.json({ season: se, now: Date.now(), elims, matches: r.rows[0] ? Number(r.rows[0].matches) : 0, league: leagueOf(elims), rank: Number(pos.rows[0].n) + 1, thresholds: LEAGUE_MIN, sup: (await supResolve(req.me.id).catch(() => null)) ? Number((await pool.query(`SELECT level FROM grp_supreme WHERE user_id = $1`, [req.me.id])).rows[0].level) : null });
  })
);
router.post(
  "/ranked/report",
  wrap(async (req, res) => {
    const se = seasonInfo();
    const kills = Math.max(0, Math.min(60, Math.floor(Number(req.body && req.body.kills) || 0)));
    const mid = cleanText(req.body && req.body.mid, 40) || null;
    const cur = await pool.query(`SELECT elims, last_mid, last_report FROM grp_ranked WHERE user_id = $1 AND season = $2`, [req.me.id, se.id]);
    const row = cur.rows[0];
    let added = 0;
    if (!row) {
      await pool.query(`INSERT INTO grp_ranked (user_id, season, elims, matches, last_mid, last_report) VALUES ($1, $2, $3, 1, $4, NOW())`, [req.me.id, se.id, kills, mid]);
      added = kills;
    } else if ((mid && row.last_mid === mid) || (row.last_report && Date.now() - new Date(row.last_report).getTime() < 20000)) {
      added = 0; // doublon (nouvel envoi) ou rapport trop rapproché
    } else {
      await pool.query(`UPDATE grp_ranked SET elims = elims + $3, matches = matches + 1, last_mid = $4, last_report = NOW() WHERE user_id = $1 AND season = $2`, [req.me.id, se.id, kills, mid]);
      added = kills;
    }
    const r = await pool.query(`SELECT elims FROM grp_ranked WHERE user_id = $1 AND season = $2`, [req.me.id, se.id]);
    const elims = Number(r.rows[0].elims);
    let sup = null;
    try {
      const had = await pool.query(`SELECT 1 FROM grp_supreme WHERE user_id = $1`, [req.me.id]);
      if (had.rows.length) await supEnsure(req.me.id, elims, se.id);
      if (had.rows.length && added) await supAddKills(req.me.id, added);
      else if (!had.rows.length) await supEnsure(req.me.id, elims, se.id);
      const sr = await pool.query(`SELECT level FROM grp_supreme WHERE user_id = $1`, [req.me.id]);
      sup = sr.rows[0] ? Number(sr.rows[0].level) : null;
    } catch (e) { console.error("supreme", e.message); }
    res.json({ season: se, elims, added, league: leagueOf(elims), sup });
  })
);
router.get(
  "/ranked/top",
  wrap(async (req, res) => {
    const se = seasonInfo();
    const r = await pool.query(
      `SELECT u.id, u.username, k.elims, EXTRACT(EPOCH FROM av.updated_at)::bigint AS av,
              EXTRACT(EPOCH FROM (NOW() - ps.last_seen)) AS ago
       FROM grp_ranked k JOIN users u ON u.id = k.user_id
       LEFT JOIN grp_avatars av ON av.user_id = u.id
       LEFT JOIN player_stats ps ON ps.user_id = u.id
       WHERE k.season = $1 AND k.elims > 0
       ORDER BY k.elims DESC, u.username ASC LIMIT 2000`,
      [se.id]
    );
    const counts = LEAGUE_MIN.map(() => 0);
    const players = [];
    r.rows.forEach((x, i) => {
      const elims = Number(x.elims), lg = leagueOf(elims);
      counts[lg]++;
      if (i < 300) players.push({ id: String(x.id), username: x.username, elims, league: lg, av: Number(x.av) || 0, online: x.ago != null && Number(x.ago) <= ONLINE_SECONDS, me: String(x.id) === String(req.me.id), rank: i + 1 });
    });
    res.json({ season: se, now: Date.now(), players, counts, total: r.rows.length, thresholds: LEAGUE_MIN });
  })
);

/* ---------------- profil : biographie, note et activité en direct (opt-in) ---------------- */
const profileCols = () => `rk.elims AS p_elims, pr.bio AS p_bio, pr.note AS p_note, pr.live AS p_live, pr.act AS p_act, pr.music AS p_music,
  EXTRACT(EPOCH FROM (NOW() - pr.live_at)) AS p_live_age, EXTRACT(EPOCH FROM (NOW() - pr.still_since)) AS p_still_age`;
const HOME_AFTER_SECONDS = 12 * 3600;
const LIVE_FRESH_SECONDS = 180;
// Ne renvoie QUE l'activité déduite (jamais de coordonnées) et seulement si la personne a activé le partage.
function liveStatus(r) {
  if (!r || !r.p_live) return null;
  const fresh = r.p_live_age != null && Number(r.p_live_age) <= LIVE_FRESH_SECONDS;
  const st = { home: false, move: null, music: false };
  if (fresh && (r.p_act === "walk" || r.p_act === "travel")) st.move = r.p_act;
  else if (r.p_still_age != null && Number(r.p_still_age) >= HOME_AFTER_SECONDS) st.home = true;
  if (fresh && r.p_music) st.music = true;
  return st.home || st.move || st.music ? st : null;
}
function profileFields(r) {
  const elims = Number(r.p_elims) || 0;
  return { bio: r.p_bio || "", note: r.p_note || "", status: liveStatus(r), elims, league: leagueOf(elims) };
}
router.get(
  "/profile/me",
  wrap(async (req, res) => {
    const r = await pool.query(`SELECT bio, note, live FROM grp_profile WHERE user_id = $1`, [req.me.id]);
    const x = r.rows[0] || {};
    res.json({ bio: x.bio || "", note: x.note || "", live: !!x.live });
  })
);
router.post(
  "/profile/me",
  wrap(async (req, res) => {
    const b = req.body || {};
    const cur = (await pool.query(`SELECT bio, note, live FROM grp_profile WHERE user_id = $1`, [req.me.id])).rows[0] || { bio: "", note: "", live: false };
    const bio = typeof b.bio === "string" ? cleanText(b.bio, 300) : cur.bio;
    const note = typeof b.note === "string" ? cleanText(b.note, 60) : cur.note;
    const live = typeof b.live === "boolean" ? b.live : !!cur.live;
    await pool.query(
      `INSERT INTO grp_profile (user_id, bio, note, live, still_since, live_at, updated_at)
       VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN NOW() ELSE NULL END, NULL, NOW())
       ON CONFLICT (user_id) DO UPDATE SET bio = EXCLUDED.bio, note = EXCLUDED.note, live = EXCLUDED.live, updated_at = NOW(),
         still_since = CASE WHEN EXCLUDED.live AND NOT grp_profile.live THEN NOW() WHEN NOT EXCLUDED.live THEN NULL ELSE grp_profile.still_since END,
         act = CASE WHEN EXCLUDED.live THEN grp_profile.act ELSE NULL END,
         music = CASE WHEN EXCLUDED.live THEN grp_profile.music ELSE FALSE END,
         live_at = CASE WHEN EXCLUDED.live THEN grp_profile.live_at ELSE NULL END`,
      [req.me.id, bio, note, live]
    );
    res.json({ bio, note, live });
  })
);
// Le navigateur envoie uniquement l'activité déduite : 'still' | 'walk' | 'travel' | null, et si de la musique joue.
router.post(
  "/live",
  wrap(async (req, res) => {
    const b = req.body || {};
    const act = ["still", "walk", "travel"].includes(b.act) ? b.act : null;
    const r = await pool.query(
      `UPDATE grp_profile SET act = $2, music = $3, live_at = NOW(),
              still_since = CASE WHEN $2 = 'still' THEN COALESCE(still_since, NOW()) ELSE NOW() END
       WHERE user_id = $1 AND live = TRUE`,
      [req.me.id, act, !!b.music]
    );
    touchPresence(req.me.id);
    res.json({ ok: true, live: r.rowCount > 0 });
  })
);
router.get(
  "/profile/:uid",
  wrap(async (req, res) => {
    const r = await pool.query(
      `SELECT u.id, u.username, ${profileCols()}, EXTRACT(EPOCH FROM (NOW() - ps.last_seen)) AS ago
       FROM users u LEFT JOIN grp_profile pr ON pr.user_id = u.id LEFT JOIN grp_ranked rk ON rk.user_id = u.id AND rk.season = ${seasonInfo().id} LEFT JOIN player_stats ps ON ps.user_id = u.id
       WHERE u.id::text = $1`,
      [String(req.params.uid)]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Joueur introuvable." });
    res.json(Object.assign({ id: String(r.rows[0].id), username: r.rows[0].username }, profileFields(r.rows[0])));
  })
);

router.delete(
  "/avatar",
  wrap(async (req, res) => {
    await pool.query(`DELETE FROM grp_avatars WHERE user_id = $1`, [req.me.id]);
    res.json({ av: 0 });
  })
);
router.get(
  "/avatar/:uid",
  wrap(async (req, res) => {
    const uid = String(req.params.uid || "");
    if (!/^[0-9a-fA-F-]{1,40}$/.test(uid)) return res.status(400).end();
    const r = await pool.query(`SELECT data, mime FROM grp_avatars WHERE user_id::text = $1`, [uid]);
    if (r.rowCount === 0) return res.status(404).end();
    res.set("Content-Type", r.rows[0].mime);
    res.set("Cache-Control", "private, max-age=604800");
    res.set("X-Content-Type-Options", "nosniff");
    res.send(r.rows[0].data);
  })
);
async function avatarVersion(userId) {
  const r = await pool.query(`SELECT EXTRACT(EPOCH FROM updated_at)::bigint AS v FROM grp_avatars WHERE user_id = $1`, [userId]);
  return r.rowCount ? Number(r.rows[0].v) : 0;
}

/* ---------------- équipes de jeu (code d'équipe synchronisé avec le serveur) ---------------- */
async function randomTeamCode() {
  for (let i = 0; i < 30; i++) {
    let code = "";
    for (let k = 0; k < 8; k++) code += Math.floor(Math.random() * 10);
    const taken = await pool.query(`SELECT 1 FROM grp_game_teams WHERE code = $1`, [code]);
    if (taken.rowCount === 0) return code;
  }
  throw new Error("Impossible de générer un code d'équipe.");
}
async function myTeam(userId) {
  const r = await pool.query(
    `SELECT t.id, t.code, t.leader_id FROM grp_game_team_members m
     JOIN grp_game_teams t ON t.id = m.team_id WHERE m.user_id = $1`,
    [userId]
  );
  return r.rows[0] || null;
}
async function createTeamFor(userId) {
  const code = await randomTeamCode();
  const t = await pool.query(`INSERT INTO grp_game_teams (code, leader_id) VALUES ($1, $2) RETURNING id, code, leader_id`, [code, userId]);
  await pool.query(`INSERT INTO grp_game_team_members (team_id, user_id) VALUES ($1, $2)`, [t.rows[0].id, userId]);
  return t.rows[0];
}
async function ensureTeam(userId) {
  return (await myTeam(userId)) || (await createTeamFor(userId));
}
// quitte l'équipe actuelle (le chef passe au plus ancien membre, une équipe vide est supprimée)
async function leaveTeam(team, userId) {
  await pool.query(`DELETE FROM grp_game_team_members WHERE user_id = $1`, [userId]);
  const rest = await pool.query(`SELECT user_id FROM grp_game_team_members WHERE team_id = $1 ORDER BY joined_at ASC`, [team.id]);
  if (rest.rowCount === 0) {
    await pool.query(`DELETE FROM grp_game_teams WHERE id = $1`, [team.id]);
  } else if (String(team.leader_id) === String(userId)) {
    await pool.query(`UPDATE grp_game_teams SET leader_id = $2 WHERE id = $1`, [team.id, rest.rows[0].user_id]);
  }
}
const teamLaunches = new Map(); // teamId -> { id, by, byName, mode, ranked, startAt }
let launchSeq = 0;
async function teamPayload(team, me) {
  const r = await pool.query(
    `SELECT u.id, u.username, m.joined_at, EXTRACT(EPOCH FROM (NOW() - ps.last_seen)) AS ago,
            EXTRACT(EPOCH FROM av.updated_at)::bigint AS av, ${profileCols()}
     FROM grp_game_team_members m
     JOIN users u ON u.id = m.user_id
     LEFT JOIN player_stats ps ON ps.user_id = u.id
     LEFT JOIN grp_avatars av ON av.user_id = u.id
     LEFT JOIN grp_profile pr ON pr.user_id = u.id LEFT JOIN grp_ranked rk ON rk.user_id = u.id AND rk.season = ${seasonInfo().id}
     WHERE m.team_id = $1 ORDER BY m.joined_at ASC`,
    [team.id]
  );
  const iAmLeader = String(team.leader_id) === String(me.id);
  const L = teamLaunches.get(String(team.id));
  const launch = L && Date.now() - L.startAt < 60000
    ? { id: L.id, by: L.byName, mode: L.mode, ranked: L.ranked, inMs: L.startAt - Date.now() }
    : null;
  return {
    team: {
      code: team.code,
      leader: iAmLeader,
      launch,
      lid: L ? L.id : 0,
      max: MAX_TEAM,
      members: r.rows.map((x) => {
        const ago = x.ago == null ? null : Math.max(0, Math.floor(Number(x.ago)));
        return {
          id: String(x.id),
          username: x.username,
          leader: String(x.id) === String(team.leader_id),
          me: String(x.id) === String(me.id),
          online: ago != null && ago <= ONLINE_SECONDS,
          ago,
          av: Number(x.av) || 0,
          ...profileFields(x)
        };
      })
    }
  };
}
router.get(
  "/team",
  wrap(async (req, res) => {
    touchPresence(req.me.id);
    res.json(await teamPayload(await ensureTeam(req.me.id), req.me));
  })
);
router.post(
  "/team/generate",
  wrap(async (req, res) => {
    const t = await ensureTeam(req.me.id);
    if (String(t.leader_id) === String(req.me.id)) {
      const code = await randomTeamCode();
      await pool.query(`UPDATE grp_game_teams SET code = $2 WHERE id = $1`, [t.id, code]);
      t.code = code;
      return res.json(await teamPayload(t, req.me));
    }
    await leaveTeam(t, req.me.id);
    res.json(await teamPayload(await createTeamFor(req.me.id), req.me));
  })
);
router.post(
  "/team/join",
  wrap(async (req, res) => {
    const code = cleanText(req.body && req.body.code, 8);
    if (!/^\d{8}$/.test(code)) return res.status(400).json({ error: "Le code doit contenir 8 chiffres." });
    const found = await pool.query(`SELECT id, code, leader_id FROM grp_game_teams WHERE code = $1`, [code]);
    if (found.rowCount === 0) return res.status(404).json({ error: "Aucune équipe avec ce code." });
    const target = found.rows[0];
    const mine = await ensureTeam(req.me.id);
    if (String(mine.id) === String(target.id)) return res.status(409).json({ error: "Tu fais déjà partie de cette équipe." });
    const n = await pool.query(`SELECT COUNT(*) AS n FROM grp_game_team_members WHERE team_id = $1`, [target.id]);
    if (Number(n.rows[0].n) >= MAX_TEAM) return res.status(400).json({ error: "Cette équipe est pleine (" + MAX_TEAM + " joueurs)." });
    await leaveTeam(mine, req.me.id);
    await pool.query(`INSERT INTO grp_game_team_members (team_id, user_id) VALUES ($1, $2)`, [target.id, req.me.id]);
    res.json(Object.assign(await teamPayload(target, req.me), { joined: true }));
  })
);
router.post(
  "/team/leave",
  wrap(async (req, res) => {
    const t = await ensureTeam(req.me.id);
    await leaveTeam(t, req.me.id);
    res.json(await teamPayload(await createTeamFor(req.me.id), req.me));
  })
);
router.post(
  "/team/launch",
  wrap(async (req, res) => {
    const t = await ensureTeam(req.me.id);
    if (String(t.leader_id) !== String(req.me.id)) return res.status(403).json({ error: "Seul le chef d'équipe lance la partie." });
    const mode = ["couronne", "maxitrone", "frappe"].includes(req.body && req.body.mode) ? req.body.mode : null;
    teamLaunches.set(String(t.id), {
      id: ++launchSeq,
      by: String(req.me.id),
      byName: req.me.username,
      mode,
      ranked: !!(req.body && req.body.ranked),
      startAt: Date.now() + 4000
    });
    res.json(await teamPayload(t, req.me));
  })
);
const syncRooms = new Map(); // "teamId:launchId" -> { at, players: Map, bots, hits: Map }
const syncTeamCache = new Map(); // userId -> { team, at }
router.post(
  "/team/sync",
  wrap(async (req, res) => {
    const uid = String(req.me.id);
    let c = syncTeamCache.get(uid);
    if (!c || Date.now() - c.at > 8000) {
      c = { team: await ensureTeam(req.me.id), at: Date.now() };
      syncTeamCache.set(uid, c);
    }
    const isHost = String(c.team.leader_id) === uid;
    const key = String(c.team.id) + ":" + String((req.body && req.body.lid) || 0);
    let room = syncRooms.get(key);
    if (!room) { room = { at: Date.now(), players: new Map(), bots: null, botsAt: 0, hostId: null, hits: new Map() }; syncRooms.set(key, room); }
    room.at = Date.now();
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const col = (v) => (typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : null);
    const body = req.body || {};
    const st = body.s;
    if (st && typeof st === "object") {
      room.players.set(uid, {
        name: req.me.username, at: Date.now(), host: isHost,
        s: { x: num(st.x), z: num(st.z), r: num(st.r), hp: num(st.hp), mhp: num(st.mhp) || 750, al: st.al ? 1 : 0, a: Math.floor(num(st.a)), t: Math.floor(num(st.t)), c: col(st.c), s: col(st.s) }
      });
    } else {
      room.players.delete(uid);
    }
    if (isHost) {
      room.hostId = uid;
      if (Array.isArray(body.b)) {
        room.bots = body.b.slice(0, 16).map((b) => ({
          i: String(b.i || "").slice(0, 16), n: String(b.n || "").slice(0, 24),
          x: num(b.x), z: num(b.z), r: num(b.r), hp: num(b.hp), mhp: num(b.mhp) || 750, al: b.al ? 1 : 0, a: Math.floor(num(b.a))
        }));
        room.botsAt = Date.now();
      }
    }
    if (Array.isArray(body.hits)) {
      for (const h of body.hits.slice(0, 40)) {
        const dmg = Math.max(1, Math.min(1500, num(h.dmg)));
        let to = null, item = null;
        if (h.bot) { to = room.hostId; item = { from: uid, bot: String(h.bot).slice(0, 16), dmg }; }
        else if (h.to && room.players.has(String(h.to))) { to = String(h.to); item = { from: uid, by: String(h.by || "").slice(0, 16), dmg }; }
        if (!to || !item || to === uid) continue;
        const q = room.hits.get(to) || [];
        if (q.length < 80) q.push(item);
        room.hits.set(to, q);
      }
    }
    for (const [k, r] of syncRooms) if (Date.now() - r.at > 600000) syncRooms.delete(k);
    const players = [];
    for (const [id, p] of room.players) {
      if (id === uid) continue;
      if (Date.now() - p.at > 4000) { room.players.delete(id); continue; }
      players.push({ id, name: p.name, host: p.host, s: p.s });
    }
    const hits = room.hits.get(uid) || [];
    room.hits.delete(uid);
    res.json({ players, host: isHost, bots: !isHost && room.bots && Date.now() - room.botsAt < 4000 ? room.bots : null, hits });
  })
);
router.post(
  "/team/kick",
  wrap(async (req, res) => {
    const t = await ensureTeam(req.me.id);
    if (String(t.leader_id) !== String(req.me.id)) return res.status(403).json({ error: "Seul le chef d'équipe peut exclure." });
    const uid = String((req.body && req.body.userId) || "");
    if (!uid || uid === String(req.me.id)) return res.status(400).json({ error: "Membre invalide." });
    await pool.query(`DELETE FROM grp_game_team_members WHERE team_id = $1 AND user_id::text = $2`, [t.id, uid]);
    res.json(await teamPayload(t, req.me));
  })
);

/* ---------------- liste de mes groupes ---------------- */
router.get(
  "/",
  wrap(async (req, res) => {
    // le chat général est toujours présent
    const g = await pool.query(`SELECT id FROM grp_groups WHERE code = $1`, [GLOBAL_CODE]);
    if (g.rowCount) {
      await pool.query(`INSERT INTO grp_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [g.rows[0].id, req.me.id]);
    }
    touchPresence(req.me.id);
    const result = await pool.query(
      `SELECT t.id, t.name, t.code, t.owner_id, t.is_global,
              (SELECT COUNT(*) FROM grp_members x WHERE x.group_id = t.id) AS members,
              (SELECT MAX(created_at) FROM grp_messages g WHERE g.group_id = t.id) AS last_at,
              (SELECT CASE g.kind
                        WHEN 'voice' THEN '🎤 Message vocal'
                        WHEN 'image' THEN '🖼️ Photo'
                        WHEN 'poll' THEN '📊 Sondage'
                        WHEN 'invite' THEN '🔗 Invitation'
                        ELSE LEFT(g.body, 60) END
                 FROM grp_messages g WHERE g.group_id = t.id ORDER BY g.id DESC LIMIT 1) AS last_preview,
              (SELECT COUNT(*) FROM grp_messages g WHERE g.group_id = t.id AND g.id > m.last_read AND g.user_id <> $1) AS unread
       FROM grp_groups t
       JOIN grp_members m ON m.group_id = t.id AND m.user_id = $1
       ORDER BY t.is_global DESC,
                COALESCE((SELECT MAX(created_at) FROM grp_messages g WHERE g.group_id = t.id), t.created_at) DESC`,
      [req.me.id]
    );
    res.json({
      me: { id: String(req.me.id), username: req.me.username, role: req.me.role, av: await avatarVersion(req.me.id) },
      reactions: REACTIONS,
      groups: result.rows.map((r) => ({
        id: r.is_global ? "global" : Number(r.id),
        name: r.name,
        code: r.is_global ? "" : r.code,
        global: !!r.is_global,
        owner: !r.is_global && String(r.owner_id) === String(req.me.id),
        members: Number(r.members),
        lastAt: r.last_at,
        lastPreview: r.last_preview || "",
        unread: Math.min(99, Number(r.unread) || 0),
        call: callSummary(r.id, req.me.id).active
      }))
    });
  })
);

/* ---------------- créer / rejoindre ---------------- */
router.post(
  "/",
  wrap(async (req, res) => {
    const name = cleanText(req.body && req.body.name, 28);
    if (name.length < 2) return res.status(400).json({ error: "Le nom doit faire au moins 2 caractères." });
    const count = await pool.query(
      `SELECT COUNT(*) AS n FROM grp_members m JOIN grp_groups g ON g.id = m.group_id WHERE m.user_id = $1 AND NOT g.is_global`,
      [req.me.id]
    );
    if (Number(count.rows[0].n) >= MAX_GROUPS_PER_USER) {
      return res.status(400).json({ error: "Limite de " + MAX_GROUPS_PER_USER + " groupes atteinte." });
    }
    const code = await randomCode();
    const created = await pool.query(
      `INSERT INTO grp_groups (name, code, owner_id) VALUES ($1, $2, $3) RETURNING id`,
      [name, code, req.me.id]
    );
    await pool.query(`INSERT INTO grp_members (group_id, user_id) VALUES ($1, $2)`, [created.rows[0].id, req.me.id]);
    res.json({ id: Number(created.rows[0].id), name, code });
  })
);

router.post(
  "/join",
  wrap(async (req, res) => {
    const code = cleanText(req.body && req.body.code, 8);
    if (!/^\d{8}$/.test(code) || code === GLOBAL_CODE) return res.status(400).json({ error: "Le code doit contenir 8 chiffres." });
    const found = await pool.query(`SELECT id, name FROM grp_groups WHERE code = $1 AND NOT is_global`, [code]);
    if (found.rowCount === 0) return res.status(404).json({ error: "Aucun groupe avec ce code." });
    const g = found.rows[0];
    const banned = await pool.query(`SELECT 1 FROM grp_bans WHERE group_id = $1 AND user_id = $2`, [g.id, req.me.id]);
    if (banned.rowCount) return res.status(403).json({ error: "Tu as été banni de ce groupe." });
    const already = await pool.query(`SELECT 1 FROM grp_members WHERE group_id = $1 AND user_id = $2`, [g.id, req.me.id]);
    if (already.rowCount) return res.json({ id: Number(g.id), name: g.name, already: true });
    const n = await pool.query(`SELECT COUNT(*) AS n FROM grp_members WHERE group_id = $1`, [g.id]);
    if (Number(n.rows[0].n) >= MAX_MEMBERS) return res.status(400).json({ error: "Ce groupe est plein." });
    const mine = await pool.query(
      `SELECT COUNT(*) AS n FROM grp_members m JOIN grp_groups x ON x.id = m.group_id WHERE m.user_id = $1 AND NOT x.is_global`,
      [req.me.id]
    );
    if (Number(mine.rows[0].n) >= MAX_GROUPS_PER_USER) {
      return res.status(400).json({ error: "Limite de " + MAX_GROUPS_PER_USER + " groupes atteinte." });
    }
    await pool.query(`INSERT INTO grp_members (group_id, user_id) VALUES ($1, $2)`, [g.id, req.me.id]);
    await pool.query(
      `INSERT INTO grp_messages (group_id, user_id, kind, body) VALUES ($1, $2, 'system', $3)`,
      [g.id, req.me.id, req.me.username + " a rejoint le groupe"]
    );
    res.json({ id: Number(g.id), name: g.name });
  })
);

/* ---------------- lecture des messages + état (réactions, sondages, appel) ---------------- */
function serializeMessage(row, group, me) {
  const role = siteRole(row);
  const meta = row.meta || null;
  const m = {
    id: Number(row.id),
    kind: row.kind,
    text: row.kind === "text" || row.kind === "system" || row.kind === "image" ? row.body : "",
    duration: row.duration_ms || 0,
    userId: String(row.user_id),
    username: row.username,
    badge: badgeOf(group, row.user_id, role),
    mine: String(row.user_id) === String(me.id),
    at: row.created_at,
    av: Number(row.av_v) || 0,
    meta: row.kind === "poll" || row.kind === "invite" ? meta : null,
    reply: row.reply_id
      ? { id: Number(row.reply_id), username: row.reply_username || "", preview: row.reply_preview || "" }
      : null
  };
  return m;
}

router.get(
  "/:id/messages",
  loadGroup,
  wrap(async (req, res) => {
    const gid = req.group.id;
    const after = isId(req.query.after) ? Number(req.query.after) : 0;
    const base =
      `SELECT g.id, g.kind, g.body, g.meta, g.duration_ms, g.created_at, g.user_id, u.username, u.role,
              r.id AS reply_id, ru.username AS reply_username,
              EXTRACT(EPOCH FROM av.updated_at)::bigint AS av_v,
              CASE r.kind WHEN 'voice' THEN '🎤 Message vocal' WHEN 'image' THEN '🖼️ Photo'
                          WHEN 'poll' THEN '📊 Sondage' WHEN 'invite' THEN '🔗 Invitation'
                          ELSE LEFT(r.body, 80) END AS reply_preview
       FROM grp_messages g
       JOIN users u ON u.id = g.user_id
       LEFT JOIN grp_messages r ON r.id = g.reply_to
       LEFT JOIN users ru ON ru.id = r.user_id
       LEFT JOIN grp_avatars av ON av.user_id = g.user_id
       WHERE g.group_id = $1`;
    const result = after
      ? await pool.query(base + ` AND g.id > $2 ORDER BY g.id ASC LIMIT 100`, [gid, after])
      : await pool.query(`SELECT * FROM (` + base + ` ORDER BY g.id DESC LIMIT 60) x ORDER BY id ASC`, [gid]);

    const messages = result.rows.map((r) => {
      const m = serializeMessage(r, req.group, req.me);
      const rk = rankOf(req.group, r.user_id, siteRole(r));
      m.canDelete = m.mine || (req.myRank >= 2 && req.myRank > rk);
      return m;
    });

    // fenêtre d'état : ids existants + réactions + sondages sur les derniers messages
    const win = await pool.query(
      `SELECT id, kind, meta FROM grp_messages WHERE group_id = $1 ORDER BY id DESC LIMIT $2`,
      [gid, WINDOW]
    );
    const ids = win.rows.map((r) => Number(r.id));
    const reactions = {};
    const polls = {};
    if (ids.length) {
      const rx = await pool.query(
        `SELECT x.message_id, x.emoji, x.user_id, u.username
         FROM grp_reactions x JOIN users u ON u.id = x.user_id
         WHERE x.message_id = ANY($1::int[]) ORDER BY x.message_id, x.emoji`,
        [ids]
      );
      for (const r of rx.rows) {
        const k = String(r.message_id);
        const list = reactions[k] || (reactions[k] = []);
        let item = list.find((i) => i.e === r.emoji);
        if (!item) { item = { e: r.emoji, n: 0, me: false, users: [] }; list.push(item); }
        item.n++;
        if (String(r.user_id) === String(req.me.id)) item.me = true;
        if (item.users.length < 8) item.users.push(r.username);
      }
      const pollIds = win.rows.filter((r) => r.kind === "poll").map((r) => Number(r.id));
      if (pollIds.length) {
        const vt = await pool.query(
          `SELECT message_id, opt, user_id FROM grp_votes WHERE message_id = ANY($1::int[])`,
          [pollIds]
        );
        for (const r of win.rows.filter((x) => x.kind === "poll")) {
          const opts = (r.meta && r.meta.options) || [];
          polls[String(r.id)] = { counts: opts.map(() => 0), voters: 0, mine: [], closed: !!(r.meta && r.meta.closed) };
        }
        const seen = {};
        for (const v of vt.rows) {
          const p = polls[String(v.message_id)];
          if (!p || v.opt < 0 || v.opt >= p.counts.length) continue;
          p.counts[v.opt]++;
          const sk = v.message_id + ":" + v.user_id;
          if (!seen[sk]) { seen[sk] = 1; p.voters++; }
          if (String(v.user_id) === String(req.me.id)) p.mine.push(v.opt);
        }
      }
    }

    // lu
    const lastId = ids.length ? ids[0] : 0;
    if (lastId > Number(req.membership.last_read || 0)) {
      pool.query(`UPDATE grp_members SET last_read = $3 WHERE group_id = $1 AND user_id = $2`, [gid, req.me.id, lastId]).catch(() => {});
    }
    touchPresence(req.me.id);

    const cnt = await pool.query(
      `SELECT COUNT(*) AS n,
              COUNT(*) FILTER (WHERE ps.last_seen > NOW() - make_interval(secs => $2)) AS online
       FROM grp_members m LEFT JOIN player_stats ps ON ps.user_id = m.user_id
       WHERE m.group_id = $1`,
      [gid, ONLINE_SECONDS]
    );

    res.json({
      messages,
      window: { ids, reactions, polls },
      state: {
        members: Number(cnt.rows[0].n),
        online: Number(cnt.rows[0].online),
        timeoutUntil: muteInfo(req),
        rank: req.myRank,
        call: callSummary(gid, req.me.id),
        name: req.group.name
      }
    });
  })
);

/* ---------------- envoi ---------------- */
router.post(
  "/:id/messages",
  loadGroup,
  wrap(async (req, res) => {
    if (denyIfMuted(req, res)) return;
    const text = cleanText(req.body && req.body.text, MAX_TEXT);
    if (!text) return res.status(400).json({ error: "Message vide." });
    if (tooFast(req.me.id)) return res.status(429).json({ error: "Doucement, tu écris trop vite." });
    const replyTo = await replyTarget(req.group.id, req.body && req.body.replyTo);
    const id = await insertMessage(req, "text", text, { replyTo });
    res.json({ id });
  })
);

router.post(
  "/:id/voice",
  loadGroup,
  express.raw({ type: () => true, limit: MAX_VOICE_BYTES + "b" }),
  wrap(async (req, res) => {
    if (denyIfMuted(req, res)) return;
    const mime = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_AUDIO.includes(mime)) return res.status(400).json({ error: "Format audio non supporté." });
    const audio = req.body;
    if (!Buffer.isBuffer(audio) || audio.length < 200) return res.status(400).json({ error: "Message vocal vide." });
    if (audio.length > MAX_VOICE_BYTES) return res.status(413).json({ error: "Message vocal trop long." });
    if (tooFast(req.me.id)) return res.status(429).json({ error: "Doucement, tu envoies trop vite." });
    const duration = Math.min(MAX_VOICE_MS, Math.max(0, Math.floor(Number(req.query.duration) || 0)));
    const replyTo = await replyTarget(req.group.id, req.query.replyTo);
    const id = await insertMessage(req, "voice", "", { media: audio, mime, duration, replyTo });
    res.json({ id });
  })
);

router.post(
  "/:id/image",
  loadGroup,
  express.raw({ type: () => true, limit: MAX_IMAGE_BYTES + "b" }),
  wrap(async (req, res) => {
    if (denyIfMuted(req, res)) return;
    const mime = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE.includes(mime)) return res.status(400).json({ error: "Format d'image non supporté." });
    const img = req.body;
    if (!Buffer.isBuffer(img) || img.length < 100) return res.status(400).json({ error: "Image vide." });
    if (img.length > MAX_IMAGE_BYTES) return res.status(413).json({ error: "Image trop lourde." });
    if (tooFast(req.me.id)) return res.status(429).json({ error: "Doucement, tu envoies trop vite." });
    const caption = cleanText(req.query.caption, 200);
    const replyTo = await replyTarget(req.group.id, req.query.replyTo);
    const id = await insertMessage(req, "image", caption, { media: img, mime, replyTo });
    res.json({ id });
  })
);

router.post(
  "/:id/poll",
  loadGroup,
  wrap(async (req, res) => {
    if (denyIfMuted(req, res)) return;
    const question = cleanText(req.body && req.body.question, 140);
    const raw = Array.isArray(req.body && req.body.options) ? req.body.options : [];
    const options = raw.map((o) => cleanText(o, 60)).filter(Boolean).slice(0, 6);
    if (question.length < 2) return res.status(400).json({ error: "Écris une question." });
    if (options.length < 2) return res.status(400).json({ error: "Ajoute au moins 2 choix." });
    if (tooFast(req.me.id)) return res.status(429).json({ error: "Doucement, tu envoies trop vite." });
    const id = await insertMessage(req, "poll", question, {
      meta: { question, options, multi: !!(req.body && req.body.multi), closed: false }
    });
    res.json({ id });
  })
);

router.post(
  "/:id/invite",
  loadGroup,
  wrap(async (req, res) => {
    if (denyIfMuted(req, res)) return;
    if (tooFast(req.me.id)) return res.status(429).json({ error: "Doucement, tu envoies trop vite." });
    const type = req.body && req.body.type === "team" ? "team" : "group";
    let meta;
    if (type === "team") {
      const code = cleanText(req.body.code, 8);
      if (!/^\d{8}$/.test(code)) return res.status(400).json({ error: "Tu n'as pas encore de code d'équipe." });
      meta = { type: "team", name: "Équipe de " + req.me.username, code };
    } else {
      const gid = req.body && req.body.groupId;
      if (!isId(gid)) return res.status(400).json({ error: "Groupe invalide." });
      const g = await pool.query(
        `SELECT g.id, g.name, g.code FROM grp_groups g
         JOIN grp_members m ON m.group_id = g.id AND m.user_id = $2
         WHERE g.id = $1 AND NOT g.is_global`,
        [gid, req.me.id]
      );
      if (g.rowCount === 0) return res.status(404).json({ error: "Groupe introuvable." });
      meta = { type: "group", name: g.rows[0].name, code: g.rows[0].code };
    }
    const id = await insertMessage(req, "invite", meta.name, { meta });
    res.json({ id });
  })
);

/* ---------------- réactions / sondages / suppression ---------------- */
async function loadMsg(req, res) {
  if (!isId(req.params.mid)) { res.status(400).json({ error: "Message invalide." }); return null; }
  const r = await pool.query(
    `SELECT g.id, g.kind, g.user_id, g.meta, g.body, u.username, u.role
     FROM grp_messages g JOIN users u ON u.id = g.user_id
     WHERE g.id = $1 AND g.group_id = $2`,
    [req.params.mid, req.group.id]
  );
  if (r.rowCount === 0) { res.status(404).json({ error: "Message introuvable." }); return null; }
  return r.rows[0];
}

router.post(
  "/:id/messages/:mid/react",
  loadGroup,
  wrap(async (req, res) => {
    if (denyIfMuted(req, res)) return;
    const emoji = String((req.body && req.body.emoji) || "");
    if (!REACTIONS.includes(emoji)) return res.status(400).json({ error: "Réaction invalide." });
    const msg = await loadMsg(req, res);
    if (!msg) return;
    const del = await pool.query(
      `DELETE FROM grp_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [msg.id, req.me.id, emoji]
    );
    if (del.rowCount === 0) {
      const n = await pool.query(`SELECT COUNT(DISTINCT emoji) AS n FROM grp_reactions WHERE message_id = $1`, [msg.id]);
      if (Number(n.rows[0].n) >= 8) return res.status(400).json({ error: "Trop de réactions différentes." });
      await pool.query(
        `INSERT INTO grp_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [msg.id, req.me.id, emoji]
      );
    }
    res.json({ ok: true });
  })
);

router.post(
  "/:id/messages/:mid/vote",
  loadGroup,
  wrap(async (req, res) => {
    if (denyIfMuted(req, res)) return;
    const msg = await loadMsg(req, res);
    if (!msg) return;
    if (msg.kind !== "poll" || !msg.meta) return res.status(400).json({ error: "Ce n'est pas un sondage." });
    if (msg.meta.closed) return res.status(400).json({ error: "Ce sondage est terminé." });
    const opt = Number(req.body && req.body.opt);
    if (!Number.isInteger(opt) || opt < 0 || opt >= msg.meta.options.length) return res.status(400).json({ error: "Choix invalide." });
    const has = await pool.query(
      `SELECT 1 FROM grp_votes WHERE message_id = $1 AND user_id = $2 AND opt = $3`,
      [msg.id, req.me.id, opt]
    );
    if (has.rowCount) {
      await pool.query(`DELETE FROM grp_votes WHERE message_id = $1 AND user_id = $2 AND opt = $3`, [msg.id, req.me.id, opt]);
    } else {
      if (!msg.meta.multi) await pool.query(`DELETE FROM grp_votes WHERE message_id = $1 AND user_id = $2`, [msg.id, req.me.id]);
      await pool.query(`INSERT INTO grp_votes (message_id, user_id, opt) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [msg.id, req.me.id, opt]);
    }
    res.json({ ok: true });
  })
);

router.post(
  "/:id/messages/:mid/close-poll",
  loadGroup,
  wrap(async (req, res) => {
    const msg = await loadMsg(req, res);
    if (!msg) return;
    if (msg.kind !== "poll") return res.status(400).json({ error: "Ce n'est pas un sondage." });
    const mine = String(msg.user_id) === String(req.me.id);
    if (!mine && req.myRank < 3) return res.status(403).json({ error: "Action non autorisée." });
    await pool.query(
      `UPDATE grp_messages SET meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{closed}', 'true'::jsonb) WHERE id = $1`,
      [msg.id]
    );
    res.json({ ok: true });
  })
);

router.delete(
  "/:id/messages/:mid",
  loadGroup,
  wrap(async (req, res) => {
    const msg = await loadMsg(req, res);
    if (!msg) return;
    const mine = String(msg.user_id) === String(req.me.id);
    const rk = rankOf(req.group, msg.user_id, siteRole(msg));
    if (!mine && !(req.myRank >= 2 && req.myRank > rk)) return res.status(403).json({ error: "Tu ne peux pas supprimer ce message." });
    await pool.query(`DELETE FROM grp_messages WHERE id = $1`, [msg.id]);
    res.json({ ok: true });
  })
);

/* ---------------- médias (vocaux, images) ---------------- */
router.get(
  "/:id/media/:mid",
  loadGroup,
  wrap(async (req, res) => {
    if (!isId(req.params.mid)) return res.status(400).end();
    const r = await pool.query(
      `SELECT media, mime FROM grp_messages WHERE id = $1 AND group_id = $2 AND kind IN ('voice', 'image')`,
      [req.params.mid, req.group.id]
    );
    if (r.rowCount === 0 || !r.rows[0].media) return res.status(404).end();
    res.set("Content-Type", r.rows[0].mime || "application/octet-stream");
    res.set("Cache-Control", "private, max-age=86400");
    res.set("X-Content-Type-Options", "nosniff");
    res.send(r.rows[0].media);
  })
);

/* ---------------- membres & présence ---------------- */
router.get(
  "/:id/members",
  loadGroup,
  wrap(async (req, res) => {
    const g = req.group;
    const result = await pool.query(
      `SELECT u.id, u.username, u.role, m.joined_at, m.timeout_until,
              ps.last_seen,
              EXTRACT(EPOCH FROM (NOW() - ps.last_seen)) AS ago,
              EXTRACT(EPOCH FROM av.updated_at)::bigint AS av, ${profileCols()}
       FROM grp_members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN player_stats ps ON ps.user_id = u.id
       LEFT JOIN grp_avatars av ON av.user_id = u.id
       LEFT JOIN grp_profile pr ON pr.user_id = u.id LEFT JOIN grp_ranked rk ON rk.user_id = u.id AND rk.season = ${seasonInfo().id}
       WHERE m.group_id = $1
       ORDER BY ps.last_seen DESC NULLS LAST
       LIMIT ${g.is_global ? 150 : MAX_MEMBERS}`,
      [g.id]
    );
    const now = Date.now();
    const members = result.rows.map((r) => {
      const ago = r.ago == null ? null : Math.max(0, Math.floor(Number(r.ago)));
      const rk = rankOf(g, r.id, siteRole(r));
      const to = r.timeout_until && new Date(r.timeout_until).getTime() > now ? r.timeout_until : null;
      return {
        id: String(r.id),
        username: r.username,
        badge: badgeOf(g, r.id, siteRole(r)),
        rank: rk,
        me: String(r.id) === String(req.me.id),
        online: ago != null && ago <= ONLINE_SECONDS,
        ago,
        av: Number(r.av) || 0,
        timeoutUntil: to,
        ...profileFields(r)
      };
    });
    members.sort((a, b) => (b.rank - a.rank) || (Number(b.online) - Number(a.online)) || ((a.ago == null ? 1e12 : a.ago) - (b.ago == null ? 1e12 : b.ago)));

    let banned = [];
    if (isOwner(g, req.me.id)) {
      const b = await pool.query(
        `SELECT u.id, u.username FROM grp_bans x JOIN users u ON u.id = x.user_id WHERE x.group_id = $1 ORDER BY x.created_at DESC`,
        [g.id]
      );
      banned = b.rows.map((r) => ({ id: String(r.id), username: r.username }));
    }
    res.json({
      group: {
        id: g.is_global ? "global" : Number(g.id),
        name: g.name,
        code: g.is_global ? "" : g.code,
        global: !!g.is_global,
        owner: isOwner(g, req.me.id),
        rank: req.myRank,
        max: MAX_MEMBERS
      },
      members,
      banned
    });
  })
);

function requireOwner(req, res) {
  if (!isOwner(req.group, req.me.id)) {
    res.status(403).json({ error: "Seul le créateur du groupe peut faire ça." });
    return false;
  }
  return true;
}
async function targetMember(req, res) {
  const uid = String((req.body && req.body.userId) || "");
  if (!uid) { res.status(400).json({ error: "Membre invalide." }); return null; }
  const r = await pool.query(
    `SELECT u.id, u.username, u.role FROM grp_members m JOIN users u ON u.id = m.user_id
     WHERE m.group_id = $1 AND m.user_id::text = $2`,
    [req.group.id, uid]
  );
  if (r.rowCount === 0) { res.status(404).json({ error: "Ce membre n'est plus dans le groupe." }); return null; }
  return r.rows[0];
}
async function sysMessage(req, text) {
  await pool.query(`INSERT INTO grp_messages (group_id, user_id, kind, body) VALUES ($1, $2, 'system', $3)`, [req.group.id, req.me.id, text]);
}

// Définir le chef / sous-chef (créateur uniquement ; un seul de chaque)
router.post(
  "/:id/role",
  loadGroup,
  wrap(async (req, res) => {
    if (!requireOwner(req, res)) return;
    const role = String((req.body && req.body.role) || "");
    if (!["chief", "deputy", "member"].includes(role)) return res.status(400).json({ error: "Rôle invalide." });
    const t = await targetMember(req, res);
    if (!t) return;
    if (String(t.id) === String(req.me.id)) return res.status(400).json({ error: "Tu es déjà le créateur." });
    const g = req.group;
    let chief = g.chief_id, deputy = g.deputy_id;
    const isChief = chief != null && String(chief) === String(t.id);
    const isDeputy = deputy != null && String(deputy) === String(t.id);
    if (isChief) chief = null;
    if (isDeputy) deputy = null;
    if (role === "chief") chief = t.id;
    if (role === "deputy") deputy = t.id;
    await pool.query(`UPDATE grp_groups SET chief_id = $2, deputy_id = $3 WHERE id = $1`, [g.id, chief, deputy]);
    await sysMessage(
      req,
      role === "chief" ? t.username + " est maintenant chef du groupe"
        : role === "deputy" ? t.username + " est maintenant sous-chef"
        : t.username + " n'a plus de rôle"
    );
    res.json({ ok: true });
  })
);

router.post(
  "/:id/kick",
  loadGroup,
  wrap(async (req, res) => {
    if (!requireOwner(req, res)) return;
    const t = await targetMember(req, res);
    if (!t) return;
    if (String(t.id) === String(req.me.id)) return res.status(400).json({ error: "Membre invalide." });
    await pool.query(`DELETE FROM grp_members WHERE group_id = $1 AND user_id = $2`, [req.group.id, t.id]);
    await pool.query(
      `UPDATE grp_groups SET chief_id = CASE WHEN chief_id = $2 THEN NULL ELSE chief_id END,
                             deputy_id = CASE WHEN deputy_id = $2 THEN NULL ELSE deputy_id END WHERE id = $1`,
      [req.group.id, t.id]
    );
    await sysMessage(req, t.username + " a été exclu du groupe");
    res.json({ ok: true });
  })
);

router.post(
  "/:id/ban",
  loadGroup,
  wrap(async (req, res) => {
    if (!requireOwner(req, res)) return;
    const t = await targetMember(req, res);
    if (!t) return;
    if (String(t.id) === String(req.me.id)) return res.status(400).json({ error: "Membre invalide." });
    await pool.query(`DELETE FROM grp_members WHERE group_id = $1 AND user_id = $2`, [req.group.id, t.id]);
    await pool.query(`INSERT INTO grp_bans (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [req.group.id, t.id]);
    await pool.query(
      `UPDATE grp_groups SET chief_id = CASE WHEN chief_id = $2 THEN NULL ELSE chief_id END,
                             deputy_id = CASE WHEN deputy_id = $2 THEN NULL ELSE deputy_id END WHERE id = $1`,
      [req.group.id, t.id]
    );
    await sysMessage(req, t.username + " a été banni du groupe");
    res.json({ ok: true });
  })
);

router.post(
  "/:id/unban",
  loadGroup,
  wrap(async (req, res) => {
    if (!requireOwner(req, res)) return;
    const uid = String((req.body && req.body.userId) || "");
    await pool.query(`DELETE FROM grp_bans WHERE group_id = $1 AND user_id::text = $2`, [req.group.id, uid]);
    res.json({ ok: true });
  })
);

// Timeout : créateur, chef, sous-chef (sur un rang inférieur) ; staff dans le chat général
router.post(
  "/:id/timeout",
  loadGroup,
  wrap(async (req, res) => {
    if (req.myRank < 2) return res.status(403).json({ error: "Tu n'as pas le droit de faire ça." });
    const t = await targetMember(req, res);
    if (!t) return;
    const targetRank = rankOf(req.group, t.id, siteRole(t));
    if (String(t.id) === String(req.me.id) || targetRank >= req.myRank) {
      return res.status(403).json({ error: "Tu ne peux pas sanctionner ce membre." });
    }
    const minutes = Math.floor(Number(req.body && req.body.minutes));
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 43200) return res.status(400).json({ error: "Durée invalide." });
    if (minutes === 0) {
      await pool.query(`UPDATE grp_members SET timeout_until = NULL WHERE group_id = $1 AND user_id = $2`, [req.group.id, t.id]);
      await sysMessage(req, t.username + " peut de nouveau écrire");
    } else {
      await pool.query(
        `UPDATE grp_members SET timeout_until = NOW() + make_interval(mins => $3::int) WHERE group_id = $1 AND user_id = $2`,
        [req.group.id, t.id, minutes]
      );
      await sysMessage(req, t.username + " est en timeout (" + fmtDuration(minutes) + ")");
    }
    res.json({ ok: true });
  })
);
function fmtDuration(min) {
  if (min < 60) return min + " min";
  if (min < 1440) return Math.round(min / 60) + " h";
  return Math.round(min / 1440) + " j";
}

router.post(
  "/:id/rename",
  loadGroup,
  wrap(async (req, res) => {
    if (!requireOwner(req, res)) return;
    const name = cleanText(req.body && req.body.name, 28);
    if (name.length < 2) return res.status(400).json({ error: "Le nom doit faire au moins 2 caractères." });
    await pool.query(`UPDATE grp_groups SET name = $2 WHERE id = $1`, [req.group.id, name]);
    res.json({ ok: true, name });
  })
);

router.post(
  "/:id/regen-code",
  loadGroup,
  wrap(async (req, res) => {
    if (!requireOwner(req, res)) return;
    const code = await randomCode();
    await pool.query(`UPDATE grp_groups SET code = $2 WHERE id = $1`, [req.group.id, code]);
    res.json({ ok: true, code });
  })
);

router.post(
  "/:id/leave",
  loadGroup,
  wrap(async (req, res) => {
    const g = req.group;
    if (g.is_global) return res.status(400).json({ error: "Tu ne peux pas quitter le chat général." });
    await pool.query(`DELETE FROM grp_members WHERE group_id = $1 AND user_id = $2`, [g.id, req.me.id]);
    const c = callOf(g.id, false);
    if (c) { c.peers.delete(String(req.me.id)); c.box.delete(String(req.me.id)); }
    const rest = await pool.query(`SELECT user_id FROM grp_members WHERE group_id = $1 ORDER BY joined_at ASC`, [g.id]);
    if (rest.rowCount === 0) {
      await pool.query(`DELETE FROM grp_groups WHERE id = $1`, [g.id]);
    } else {
      let owner = g.owner_id, chief = g.chief_id, deputy = g.deputy_id;
      const same = (a, b) => a != null && String(a) === String(b);
      if (same(owner, req.me.id)) {
        // transmission : chef > sous-chef > plus ancien membre
        const ids = rest.rows.map((r) => String(r.user_id));
        const pick = (chief != null && ids.includes(String(chief)) && chief) ||
                     (deputy != null && ids.includes(String(deputy)) && deputy) || rest.rows[0].user_id;
        owner = pick;
        if (same(chief, pick)) chief = null;
        if (same(deputy, pick)) deputy = null;
      }
      if (same(chief, req.me.id)) chief = null;
      if (same(deputy, req.me.id)) deputy = null;
      await pool.query(`UPDATE grp_groups SET owner_id = $2, chief_id = $3, deputy_id = $4 WHERE id = $1`, [g.id, owner, chief, deputy]);
    }
    res.json({ ok: true });
  })
);

router.delete(
  "/:id",
  loadGroup,
  wrap(async (req, res) => {
    if (!requireOwner(req, res)) return;
    await pool.query(`DELETE FROM grp_groups WHERE id = $1`, [req.group.id]);
    calls.delete(String(req.group.id));
    res.json({ ok: true });
  })
);

/* ---------------- signalement ---------------- */
router.post(
  "/:id/report",
  loadGroup,
  wrap(async (req, res) => {
    const uid = String((req.body && req.body.userId) || "");
    const reason = Object.prototype.hasOwnProperty.call(REPORT_REASONS, req.body && req.body.reason) ? req.body.reason : "other";
    const details = cleanText(req.body && req.body.details, 300);
    if (!uid || uid === String(req.me.id)) return res.status(400).json({ error: "Tu ne peux pas te signaler toi-même." });
    const t = await pool.query(`SELECT id, username FROM users WHERE id::text = $1`, [uid]);
    if (t.rowCount === 0) return res.status(404).json({ error: "Joueur introuvable." });
    const target = t.rows[0];

    const recent = await pool.query(
      `SELECT 1 FROM grp_reports WHERE reporter_id = $1 AND target_id = $2 AND created_at > NOW() - INTERVAL '5 minutes'`,
      [req.me.id, target.id]
    );
    if (recent.rowCount) return res.status(429).json({ error: "Tu as déjà signalé ce joueur à l'instant." });

    let snapshot = "";
    let messageId = null;
    if (isId(req.body && req.body.messageId)) {
      const m = await pool.query(
        `SELECT id, kind, body FROM grp_messages WHERE id = $1 AND group_id = $2 AND user_id::text = $3`,
        [req.body.messageId, req.group.id, uid]
      );
      if (m.rowCount) {
        messageId = Number(m.rows[0].id);
        snapshot = m.rows[0].kind === "text" || m.rows[0].kind === "image" || m.rows[0].kind === "poll"
          ? m.rows[0].body.slice(0, 200)
          : "[" + m.rows[0].kind + "]";
      }
    }
    await pool.query(
      `INSERT INTO grp_reports (reporter_id, target_id, group_id, message_id, reason, details, snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.me.id, target.id, req.group.id, messageId, reason, details, snapshot]
    );
    // visible aussi dans la boîte de réception du staff (table admin_messages du Center)
    try {
      const text = ("🚩 Signalement chat : " + req.me.username + " signale " + target.username +
        " (" + REPORT_REASONS[reason] + ") dans « " + req.group.name + " »" +
        (snapshot ? " — « " + snapshot + " »" : "") + (details ? " — " + details : "")).slice(0, 500);
      await pool.query(`INSERT INTO admin_messages (user_id, username, message) VALUES ($1, $2, $3)`, [req.me.id, req.me.username, text]);
    } catch (e) { /* table absente : le signalement reste enregistré dans grp_reports */ }
    res.json({ message: "Signalement envoyé à l'équipe. Merci !" });
  })
);

/* ---------------- appels vocaux de groupe ---------------- */
router.post(
  "/:id/call/join",
  loadGroup,
  wrap(async (req, res) => {
    const me = String(req.me.id);
    const wasActive = !!callOf(req.group.id, false);
    const c = callOf(req.group.id, true);
    if (!c.peers.has(me) && c.peers.size >= MAX_CALL_PEERS) return res.status(400).json({ error: "L'appel est complet." });
    const peerList = (c) => Array.from(c.peers.entries()).filter(([id]) => id !== me).map(([id, p]) => ({ id, username: p.name, av: p.av || 0, live: !!p.live }));
    const others = peerList(c);
    c.peers.set(me, { name: req.me.username, ts: Date.now(), av: await avatarVersion(req.me.id), live: false });
    c.box.set(me, []);
    if (!wasActive || others.length === 0) {
      await sysMessage(req, "📞 " + req.me.username + " a lancé un appel vocal");
    }
    res.json({ peers: others, iceServers: iceServers(), me });
  })
);

router.get(
  "/:id/call",
  loadGroup,
  wrap(async (req, res) => {
    const me = String(req.me.id);
    const c = callOf(req.group.id, false);
    if (!c || !c.peers.has(me)) return res.json({ active: !!c, inCall: false, peers: [], signals: [] });
    c.peers.get(me).ts = Date.now();
    const signals = c.box.get(me) || [];
    c.box.set(me, []);
    res.json({
      active: true,
      inCall: true,
      peers: Array.from(c.peers.entries()).filter(([id]) => id !== me).map(([id, p]) => ({ id, username: p.name, av: p.av || 0, live: !!p.live })),
      signals
    });
  })
);

router.post(
  "/:id/call/signal",
  loadGroup,
  wrap(async (req, res) => {
    const me = String(req.me.id);
    const c = callOf(req.group.id, false);
    if (!c || !c.peers.has(me)) return res.status(400).json({ error: "Tu n'es pas dans l'appel." });
    const to = String((req.body && req.body.to) || "");
    if (!c.peers.has(to)) return res.json({ ok: false });
    const data = req.body && req.body.data;
    if (!data || JSON.stringify(data).length > 12000) return res.status(400).json({ error: "Signal invalide." });
    const box = c.box.get(to) || [];
    box.push({ from: me, name: req.me.username, data });
    if (box.length > 200) box.splice(0, box.length - 200);
    c.box.set(to, box);
    res.json({ ok: true });
  })
);

// le joueur annonce qu'il diffuse (ou arrête de diffuser) sa partie dans l'appel
router.post(
  "/:id/call/live",
  loadGroup,
  wrap(async (req, res) => {
    const c = callOf(req.group.id, false);
    const p = c && c.peers.get(String(req.me.id));
    if (!p) return res.status(400).json({ error: "Tu n'es pas dans l'appel." });
    p.live = !!(req.body && req.body.on);
    res.json({ ok: true });
  })
);

router.post(
  "/:id/call/leave",
  loadGroup,
  wrap(async (req, res) => {
    const c = callOf(req.group.id, false);
    if (c) {
      c.peers.delete(String(req.me.id));
      c.box.delete(String(req.me.id));
      if (c.peers.size === 0) calls.delete(String(req.group.id));
    }
    res.json({ ok: true });
  })
);

module.exports = router;
