const express = require("express");
const pool = require("../db");

const router = express.Router();

const ADMIN_USERNAME = "trusy";
const PASS_COINS_PER_TOP1 = 2000;
const NAME_RE = /^[a-zA-Z0-9_-]{3,30}$/;
const LIVE_TTL_MS = 7000;

// Combats en cours (mémoire du serveur) : userId -> { ts, data }
const liveMatches = new Map();

function effectiveRole(row) {
  if (String(row.username).toLowerCase() === ADMIN_USERNAME) return "admin";
  return row.role === "moderator" ? "moderator" : "member";
}

function wrap(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error("Erreur profil :", error.message);
      res.status(500).json({ error: "Erreur serveur." });
    }
  };
}

function clampInt(value, min, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function cleanText(value, max) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

async function loadMe(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Tu dois être connecté." });
  }
  try {
    const result = await pool.query(
      `SELECT id, username, role FROM users WHERE id = $1`,
      [req.session.userId]
    );
    if (result.rowCount === 0) {
      return res.status(401).json({ error: "Session invalide." });
    }
    const row = result.rows[0];
    req.me = { id: row.id, username: row.username, role: effectiveRole(row) };
    next();
  } catch (error) {
    console.error("Erreur profil :", error.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
}

function requireStaff(req, res, next) {
  if (req.me.role !== "admin" && req.me.role !== "moderator") {
    return res.status(403).json({ error: "Réservé au staff." });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.me.role !== "admin") {
    return res.status(403).json({ error: "Réservé à l'administrateur." });
  }
  next();
}

async function activeBan(userId) {
  const result = await pool.query(
    `SELECT id, until_at, reason, by_name
     FROM bans
     WHERE user_id = $1
       AND active
       AND (until_at IS NULL OR until_at > NOW())
     ORDER BY id DESC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

function banPayload(row) {
  if (!row) return null;
  return {
    until: row.until_at,
    permanent: !row.until_at,
    reason: row.reason || "",
    by: row.by_name || ""
  };
}

async function findTarget(username) {
  const name = String(username || "").trim();
  if (!NAME_RE.test(name)) return null;
  const result = await pool.query(
    `SELECT id, username, role FROM users WHERE LOWER(username) = LOWER($1)`,
    [name]
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  return { id: row.id, username: row.username, role: effectiveRole(row) };
}

// Un admin sanctionne tout le monde sauf les admins ; un modérateur uniquement les membres.
function canModerate(actor, target) {
  if (String(actor.id) === String(target.id)) return false;
  if (actor.role === "admin") return target.role !== "admin";
  if (actor.role === "moderator") return target.role === "member";
  return false;
}

async function logAction(actor, target, action, details) {
  await pool.query(
    `INSERT INTO staff_log (actor, target, action, details) VALUES ($1, $2, $3, $4)`,
    [actor, target || null, action, details || ""]
  );
}

router.use(loadMe);

/* ===================== SOCIAL : TEAMS + CENTER (tout dans ce fichier) =====================
   Les routes des teams (chat, vocaux) et du Center (pièces, magasin, messages admin) sont
   intégrées ici : un seul fichier serveur à déployer. Les tables sont créées au premier appel
   si elles n'existent pas encore. */
let socialSchemaPromise = null;
async function ensureSocialSchema() {
  const typeResult = await pool.query(
    `SELECT data_type FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = 'id' LIMIT 1`
  );
  const dataType = typeResult.rows[0] ? typeResult.rows[0].data_type : "integer";
  const idType = { integer: "INTEGER", bigint: "BIGINT", smallint: "SMALLINT", uuid: "UUID" }[dataType] || "TEXT";

  await pool.query(
    `CREATE TABLE IF NOT EXISTS teams (
       id SERIAL PRIMARY KEY,
       name TEXT NOT NULL,
       code TEXT NOT NULL UNIQUE,
       owner_id ${idType} REFERENCES users(id) ON DELETE SET NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  await pool.query(`ALTER TABLE teams ALTER COLUMN owner_id DROP NOT NULL`);
  await pool.query(
    `CREATE TABLE IF NOT EXISTS team_members (
       team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
       user_id ${idType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       PRIMARY KEY (team_id, user_id)
     )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS team_messages (
       id SERIAL PRIMARY KEY,
       team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
       user_id ${idType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       kind TEXT NOT NULL DEFAULT 'text',
       body TEXT NOT NULL DEFAULT '',
       audio BYTEA,
       mime TEXT,
       duration_ms INTEGER NOT NULL DEFAULT 0,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS team_messages_team_idx ON team_messages (team_id, id)`);
  await pool.query(
    `INSERT INTO teams (name, code, owner_id) VALUES ('Général', '00000000', NULL)
     ON CONFLICT (code) DO NOTHING`
  );

  await pool.query(`ALTER TABLE player_profile ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE player_profile ADD COLUMN IF NOT EXISTS pass_wins INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE player_profile ADD COLUMN IF NOT EXISTS pass_last_at TIMESTAMPTZ`);
  await pool.query(
    `CREATE TABLE IF NOT EXISTS user_items (
       user_id ${idType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       item_id TEXT NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       PRIMARY KEY (user_id, item_id)
     )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS admin_messages (
       id SERIAL PRIMARY KEY,
       user_id ${idType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       username TEXT NOT NULL,
       message TEXT NOT NULL,
       handled BOOLEAN NOT NULL DEFAULT FALSE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
}
function ensureSocial(req, res, next) {
  if (!socialSchemaPromise) {
    socialSchemaPromise = ensureSocialSchema().catch((error) => {
      socialSchemaPromise = null;
      throw error;
    });
  }
  socialSchemaPromise.then(() => next()).catch((error) => {
    console.error("Erreur schéma social :", error.message);
    res.status(500).json({ error: "Base de données du chat indisponible." });
  });
}

const teamsRouter = (() => {

// Teams : groupes de joueurs avec chat texte et messages vocaux.
// Monté par routes/profile.js sur /api/profile/teams (req.me est déjà chargé).
const router = express.Router();

const MAX_TEAMS_PER_USER = 10;
const MAX_MEMBERS = 30;
const MAX_TEXT = 500;
const MAX_VOICE_BYTES = 700 * 1024;
const MAX_VOICE_MS = 60 * 1000;
const KEEP_MESSAGES = 300;
const ALLOWED_AUDIO = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a", "audio/aac"];

const GLOBAL_CODE = "00000000"; // salon « Team » ouvert à tous
const sendTimes = new Map(); // userId -> [timestamps] (anti-spam)

function wrap(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error("Erreur teams :", error.message);
      res.status(500).json({ error: "Erreur serveur." });
    }
  };
}

function cleanText(value, max) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
}

function tooFast(userId) {
  const now = Date.now();
  const list = (sendTimes.get(String(userId)) || []).filter((t) => now - t < 30000);
  if (list.length >= 15) {
    sendTimes.set(String(userId), list);
    return true;
  }
  list.push(now);
  sendTimes.set(String(userId), list);
  return false;
}

function roleOf(row) {
  if (String(row.username).toLowerCase() === "trusy") return "admin";
  return row.role === "moderator" ? "moderator" : "member";
}

async function randomCode() {
  for (let i = 0; i < 20; i++) {
    let code = "";
    for (let k = 0; k < 8; k++) code += Math.floor(Math.random() * 10);
    const taken = await pool.query(`SELECT 1 FROM teams WHERE code = $1`, [code]);
    if (taken.rowCount === 0) return code;
  }
  throw new Error("Impossible de générer un code.");
}

// vérifie que :id est un nombre et que l'utilisateur est membre
async function loadTeam(req, res, next) {
  const id = String(req.params.id || "");
  if (id === "global") {
    try {
      const g = await pool.query(`SELECT id, name, code, owner_id FROM teams WHERE code = $1`, [GLOBAL_CODE]);
      if (g.rowCount === 0) return res.status(404).json({ error: "Salon introuvable." });
      req.team = Object.assign({}, g.rows[0], { global: true });
      return next();
    } catch (error) {
      console.error("Erreur teams :", error.message);
      return res.status(500).json({ error: "Erreur serveur." });
    }
  }
  if (!/^\d{1,9}$/.test(id)) return res.status(400).json({ error: "Team invalide." });
  try {
    const result = await pool.query(
      `SELECT t.id, t.name, t.code, t.owner_id
       FROM teams t
       JOIN team_members m ON m.team_id = t.id AND m.user_id = $2
       WHERE t.id = $1`,
      [id, req.me.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Team introuvable." });
    req.team = result.rows[0];
    next();
  } catch (error) {
    console.error("Erreur teams :", error.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
}

function messageRow(row) {
  return {
    id: Number(row.id),
    kind: row.kind,
    text: row.kind === "text" ? row.body : "",
    duration: row.duration_ms || 0,
    username: row.username,
    role: roleOf(row),
    mine: false,
    at: row.created_at
  };
}

// ----- Mes teams -----
router.get(
  "/",
  wrap(async (req, res) => {
    const result = await pool.query(
      `SELECT t.id, t.name, t.code, t.owner_id,
              (SELECT COUNT(*) FROM team_members x WHERE x.team_id = t.id) AS members,
              (SELECT MAX(created_at) FROM team_messages g WHERE g.team_id = t.id) AS last_at,
              (SELECT CASE WHEN g.kind = 'voice' THEN '🎤 Message vocal' ELSE LEFT(g.body, 60) END
                 FROM team_messages g WHERE g.team_id = t.id ORDER BY g.id DESC LIMIT 1) AS last_preview
       FROM teams t
       JOIN team_members m ON m.team_id = t.id AND m.user_id = $1
       WHERE t.code <> '00000000'
       ORDER BY COALESCE((SELECT MAX(created_at) FROM team_messages g WHERE g.team_id = t.id), t.created_at) DESC`,
      [req.me.id]
    );
    res.json({
      teams: result.rows.map((r) => ({
        id: Number(r.id),
        name: r.name,
        code: r.code,
        owner: String(r.owner_id) === String(req.me.id),
        members: Number(r.members),
        lastAt: r.last_at,
        lastPreview: r.last_preview || ""
      }))
    });
  })
);

// ----- Créer une team -----
router.post(
  "/",
  wrap(async (req, res) => {
    const name = cleanText(req.body && req.body.name, 24);
    if (name.length < 2) return res.status(400).json({ error: "Le nom doit faire au moins 2 caractères." });

    const count = await pool.query(`SELECT COUNT(*) AS n FROM team_members WHERE user_id = $1`, [req.me.id]);
    if (Number(count.rows[0].n) >= MAX_TEAMS_PER_USER) {
      return res.status(400).json({ error: "Tu as atteint la limite de " + MAX_TEAMS_PER_USER + " teams." });
    }

    const code = await randomCode();
    const created = await pool.query(
      `INSERT INTO teams (name, code, owner_id) VALUES ($1, $2, $3) RETURNING id`,
      [name, code, req.me.id]
    );
    const teamId = created.rows[0].id;
    await pool.query(`INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)`, [teamId, req.me.id]);
    res.json({ id: Number(teamId), name, code });
  })
);

// ----- Rejoindre avec un code -----
router.post(
  "/join",
  wrap(async (req, res) => {
    const code = cleanText(req.body && req.body.code, 8);
    if (!/^\d{8}$/.test(code)) return res.status(400).json({ error: "Le code doit contenir 8 chiffres." });

    if (code === GLOBAL_CODE) return res.status(400).json({ error: "Code invalide." });
    const found = await pool.query(`SELECT id, name FROM teams WHERE code = $1`, [code]);
    if (found.rowCount === 0) return res.status(404).json({ error: "Aucune team avec ce code." });
    const team = found.rows[0];

    const already = await pool.query(`SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2`, [team.id, req.me.id]);
    if (already.rowCount > 0) return res.status(409).json({ error: "Tu fais déjà partie de cette team." });

    const count = await pool.query(`SELECT COUNT(*) AS n FROM team_members WHERE team_id = $1`, [team.id]);
    if (Number(count.rows[0].n) >= MAX_MEMBERS) return res.status(400).json({ error: "Cette team est pleine." });

    const mine = await pool.query(`SELECT COUNT(*) AS n FROM team_members WHERE user_id = $1`, [req.me.id]);
    if (Number(mine.rows[0].n) >= MAX_TEAMS_PER_USER) {
      return res.status(400).json({ error: "Tu as atteint la limite de " + MAX_TEAMS_PER_USER + " teams." });
    }

    await pool.query(`INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)`, [team.id, req.me.id]);
    res.json({ id: Number(team.id), name: team.name });
  })
);

// ----- Membres -----
router.get(
  "/:id/members",
  loadTeam,
  wrap(async (req, res) => {
    if (req.team.global) {
      const online = await pool.query(
        `SELECT u.id, u.username, u.role
         FROM player_stats ps JOIN users u ON u.id = ps.user_id
         WHERE ps.last_seen > NOW() - INTERVAL '90 seconds'
         ORDER BY LOWER(u.username) LIMIT 80`
      );
      return res.json({
        team: { id: "global", name: req.team.name, code: "", owner: false, global: true },
        members: online.rows.map((r) => ({
          id: String(r.id), username: r.username, role: roleOf(r), online: true, owner: false,
          me: String(r.id) === String(req.me.id)
        }))
      });
    }
    const result = await pool.query(
      `SELECT u.id, u.username, u.role,
              COALESCE(ps.last_seen > NOW() - INTERVAL '90 seconds', FALSE) AS online
       FROM team_members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN player_stats ps ON ps.user_id = u.id
       WHERE m.team_id = $1
       ORDER BY m.joined_at ASC`,
      [req.team.id]
    );
    const isOwner = String(req.team.owner_id) === String(req.me.id);
    res.json({
      team: { id: Number(req.team.id), name: req.team.name, code: req.team.code, owner: isOwner },
      members: result.rows.map((r) => ({
        id: String(r.id),
        username: r.username,
        role: roleOf(r),
        online: !!r.online,
        owner: String(r.id) === String(req.team.owner_id),
        me: String(r.id) === String(req.me.id)
      }))
    });
  })
);

// ----- Quitter (ou supprimer si on est le dernier) -----
router.post(
  "/:id/leave",
  loadTeam,
  wrap(async (req, res) => {
    if (req.team.global) return res.status(400).json({ error: "Tu ne peux pas quitter le salon général." });
    await pool.query(`DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`, [req.team.id, req.me.id]);
    const rest = await pool.query(
      `SELECT user_id FROM team_members WHERE team_id = $1 ORDER BY joined_at ASC LIMIT 1`,
      [req.team.id]
    );
    if (rest.rowCount === 0) {
      await pool.query(`DELETE FROM teams WHERE id = $1`, [req.team.id]);
    } else if (String(req.team.owner_id) === String(req.me.id)) {
      await pool.query(`UPDATE teams SET owner_id = $1 WHERE id = $2`, [rest.rows[0].user_id, req.team.id]);
    }
    res.json({ ok: true });
  })
);

// ----- Exclure un membre (chef de la team) -----
router.post(
  "/:id/kick",
  loadTeam,
  wrap(async (req, res) => {
    if (req.team.global || String(req.team.owner_id) !== String(req.me.id)) {
      return res.status(403).json({ error: "Seul le chef de la team peut exclure." });
    }
    const target = String((req.body && req.body.userId) || "");
    if (!target || target === String(req.me.id)) return res.status(400).json({ error: "Membre invalide." });
    await pool.query(`DELETE FROM team_members WHERE team_id = $1 AND user_id::text = $2`, [req.team.id, target]);
    res.json({ ok: true });
  })
);

// ----- Lire les messages (après un certain id, sinon les derniers) -----
router.get(
  "/:id/messages",
  loadTeam,
  wrap(async (req, res) => {
    const after = /^\d{1,12}$/.test(String(req.query.after || "")) ? Number(req.query.after) : 0;
    const base =
      `SELECT g.id, g.kind, g.body, g.duration_ms, g.created_at, g.user_id, u.username, u.role
       FROM team_messages g
       JOIN users u ON u.id = g.user_id
       WHERE g.team_id = $1`;
    const result = after
      ? await pool.query(base + ` AND g.id > $2 ORDER BY g.id ASC LIMIT 100`, [req.team.id, after])
      : await pool.query(
          `SELECT * FROM (` + base + ` ORDER BY g.id DESC LIMIT 60) x ORDER BY id ASC`,
          [req.team.id]
        );
    res.json({
      messages: result.rows.map((r) => {
        const m = messageRow(r);
        m.mine = String(r.user_id) === String(req.me.id);
        m.canDelete = m.mine || req.me.role === "admin" || req.me.role === "moderator";
        return m;
      })
    });
  })
);

async function trimMessages(teamId) {
  await pool.query(
    `DELETE FROM team_messages
     WHERE team_id = $1
       AND id < COALESCE((SELECT id FROM team_messages WHERE team_id = $1 ORDER BY id DESC OFFSET $2 LIMIT 1), 0)`,
    [teamId, KEEP_MESSAGES]
  );
}

// ----- Supprimer un message (auteur ou staff) -----
router.delete(
  "/:id/messages/:msgId",
  loadTeam,
  wrap(async (req, res) => {
    if (!/^\d{1,12}$/.test(String(req.params.msgId))) return res.status(400).json({ error: "Message invalide." });
    const staff = req.me.role === "admin" || req.me.role === "moderator";
    const result = staff
      ? await pool.query(`DELETE FROM team_messages WHERE id = $1 AND team_id = $2`, [req.params.msgId, req.team.id])
      : await pool.query(`DELETE FROM team_messages WHERE id = $1 AND team_id = $2 AND user_id = $3`, [req.params.msgId, req.team.id, req.me.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Message introuvable." });
    res.json({ ok: true });
  })
);

// ----- Envoyer un message texte -----
router.post(
  "/:id/messages",
  loadTeam,
  wrap(async (req, res) => {
    const text = cleanText(req.body && req.body.text, MAX_TEXT);
    if (!text) return res.status(400).json({ error: "Message vide." });
    if (tooFast(req.me.id)) return res.status(429).json({ error: "Doucement, tu écris trop vite." });
    const result = await pool.query(
      `INSERT INTO team_messages (team_id, user_id, kind, body) VALUES ($1, $2, 'text', $3) RETURNING id`,
      [req.team.id, req.me.id, text]
    );
    trimMessages(req.team.id).catch(() => {});
    res.json({ id: Number(result.rows[0].id) });
  })
);

// ----- Envoyer un message vocal (corps = audio brut) -----
router.post(
  "/:id/voice",
  loadTeam,
  express.raw({ type: () => true, limit: MAX_VOICE_BYTES + "b" }),
  wrap(async (req, res) => {
    const mime = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_AUDIO.includes(mime)) return res.status(400).json({ error: "Format audio non supporté." });
    const audio = req.body;
    if (!Buffer.isBuffer(audio) || audio.length < 200) return res.status(400).json({ error: "Message vocal vide." });
    if (audio.length > MAX_VOICE_BYTES) return res.status(413).json({ error: "Message vocal trop long." });
    if (tooFast(req.me.id)) return res.status(429).json({ error: "Doucement, tu envoies trop vite." });
    const duration = Math.min(MAX_VOICE_MS, Math.max(0, Math.floor(Number(req.query.duration) || 0)));
    const result = await pool.query(
      `INSERT INTO team_messages (team_id, user_id, kind, body, audio, mime, duration_ms)
       VALUES ($1, $2, 'voice', '', $3, $4, $5) RETURNING id`,
      [req.team.id, req.me.id, audio, mime, duration]
    );
    trimMessages(req.team.id).catch(() => {});
    res.json({ id: Number(result.rows[0].id) });
  })
);

// ----- Écouter un message vocal -----
router.get(
  "/:id/voice/:msgId",
  loadTeam,
  wrap(async (req, res) => {
    if (!/^\d{1,12}$/.test(String(req.params.msgId))) return res.status(400).end();
    const result = await pool.query(
      `SELECT audio, mime FROM team_messages WHERE id = $1 AND team_id = $2 AND kind = 'voice'`,
      [req.params.msgId, req.team.id]
    );
    if (result.rowCount === 0 || !result.rows[0].audio) return res.status(404).end();
    res.set("Content-Type", result.rows[0].mime || "audio/webm");
    res.set("Cache-Control", "private, max-age=86400");
    res.send(result.rows[0].audio);
  })
);

return router;

})();

const centerRouter = (() => {

// Center : pièces, Pass (top 1), magasin, message aux administrateurs.
// Monté par routes/profile.js sur /api/profile/center (req.me déjà chargé).
const router = express.Router();

const PASS_COINS_PER_TOP1 = 2000;

// Offres du magasin (prix en pièces) — le serveur reste maître des prix.
const CATALOG = [
  { id: "outfit-neon",     kind: "outfit", name: "Tenue Rose Néon",   color: "#ff4fd8", price: 2500 },
  { id: "outfit-emerald",  kind: "outfit", name: "Tenue Émeraude",    color: "#2ee66b", price: 3000 },
  { id: "outfit-night",    kind: "outfit", name: "Tenue Nuit Violette", color: "#6a3fb5", price: 3500 },
  { id: "outfit-royal",    kind: "outfit", name: "Tenue Or Royal",    color: "#ffd23f", price: 5000 },
  { id: "sword-fire",      kind: "sword",  name: "Épée de Feu",       color: "#ff7a18", price: 2500 },
  { id: "sword-ghost",     kind: "sword",  name: "Épée Spectrale",    color: "#7cf5ff", price: 3500 },
  { id: "sword-ruby",      kind: "sword",  name: "Épée Rubis",        color: "#e0115f", price: 4000 },
  { id: "sword-royal",     kind: "sword",  name: "Épée Royale",       color: "#ffe36b", price: 6000 }
];

const contactTimes = new Map();

function wrap(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error("Erreur center :", error.message);
      res.status(500).json({ error: "Erreur serveur." });
    }
  };
}

function isStaff(req) {
  return req.me.role === "admin" || req.me.role === "moderator";
}

async function ownedItems(userId) {
  const r = await pool.query(`SELECT item_id FROM user_items WHERE user_id = $1`, [userId]);
  return r.rows.map((x) => x.item_id);
}

// ----- Portefeuille + objets possédés + catalogue -----
router.get(
  "/wallet",
  wrap(async (req, res) => {
    const p = await pool.query(`SELECT coins, pass_wins FROM player_profile WHERE user_id = $1`, [req.me.id]);
    const row = p.rows[0] || { coins: 0, pass_wins: 0 };
    res.json({
      coins: Number(row.coins) || 0,
      passWins: Number(row.pass_wins) || 0,
      passCoins: PASS_COINS_PER_TOP1,
      owned: await ownedItems(req.me.id),
      catalog: CATALOG
    });
  })
);

// ----- Achat d'une offre -----
router.post(
  "/buy",
  wrap(async (req, res) => {
    const item = CATALOG.find((i) => i.id === String((req.body && req.body.id) || ""));
    if (!item) return res.status(404).json({ error: "Offre introuvable." });

    const owned = await ownedItems(req.me.id);
    if (owned.includes(item.id)) return res.status(409).json({ error: "Tu possèdes déjà cette offre." });

    // débit atomique : ne passe que si le solde suffit
    const paid = await pool.query(
      `UPDATE player_profile SET coins = coins - $2, updated_at = NOW()
       WHERE user_id = $1 AND coins >= $2
       RETURNING coins`,
      [req.me.id, item.price]
    );
    if (paid.rowCount === 0) return res.status(400).json({ error: "Pas assez de pièces." });

    try {
      await pool.query(`INSERT INTO user_items (user_id, item_id) VALUES ($1, $2)`, [req.me.id, item.id]);
    } catch (error) {
      // achat simultané : on rembourse
      await pool.query(`UPDATE player_profile SET coins = coins + $2 WHERE user_id = $1`, [req.me.id, item.price]);
      return res.status(409).json({ error: "Tu possèdes déjà cette offre." });
    }
    res.json({ coins: Number(paid.rows[0].coins), owned: await ownedItems(req.me.id) });
  })
);

// ----- Message aux administrateurs -----
router.post(
  "/contact",
  wrap(async (req, res) => {
    const text = String((req.body && req.body.message) || "")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 500);
    if (text.length < 3) return res.status(400).json({ error: "Écris un message un peu plus long." });

    const key = String(req.me.id);
    const last = contactTimes.get(key) || 0;
    if (Date.now() - last < 30000) return res.status(429).json({ error: "Patiente quelques secondes avant d'envoyer un autre message." });
    contactTimes.set(key, Date.now());

    await pool.query(
      `INSERT INTO admin_messages (user_id, username, message) VALUES ($1, $2, $3)`,
      [req.me.id, req.me.username, text]
    );
    res.json({ message: "Message envoyé aux administrateurs. Merci !" });
  })
);

// ----- Boîte de réception du staff -----
router.get(
  "/inbox",
  wrap(async (req, res) => {
    if (!isStaff(req)) return res.status(403).json({ error: "Réservé au staff." });
    const r = await pool.query(
      `SELECT id, username, message, handled, created_at
       FROM admin_messages ORDER BY handled ASC, id DESC LIMIT 60`
    );
    res.json({ messages: r.rows });
  })
);

router.post(
  "/inbox/:id/handled",
  wrap(async (req, res) => {
    if (!isStaff(req)) return res.status(403).json({ error: "Réservé au staff." });
    if (!/^\d{1,12}$/.test(String(req.params.id))) return res.status(400).json({ error: "Message invalide." });
    await pool.query(`UPDATE admin_messages SET handled = TRUE WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  })
);

return router;

})();

router.use("/teams", ensureSocial, teamsRouter);
router.use("/center", ensureSocial, centerRouter);

/* ===================== STATUT DU JOUEUR CONNECTE ===================== */

router.get(
  "/status",
  wrap(async (req, res) => {
    const ban = await activeBan(req.me.id);

    const warnings = await pool.query(
      `SELECT id, message, by_name, created_at
       FROM warnings
       WHERE user_id = $1 AND NOT seen
       ORDER BY id
       LIMIT 5`,
      [req.me.id]
    );

    const announcement = await pool.query(
      `SELECT message, by_name
       FROM announcements
       WHERE active AND expires_at > NOW()
       ORDER BY id DESC
       LIMIT 1`
    );

    res.json({
      me: { username: req.me.username, role: req.me.role },
      ban: banPayload(ban),
      warnings: warnings.rows,
      announcement: announcement.rows[0] || null
    });
  })
);

router.post(
  "/warnings/seen",
  wrap(async (req, res) => {
    await pool.query(`UPDATE warnings SET seen = TRUE WHERE user_id = $1`, [
      req.me.id
    ]);
    res.json({ ok: true });
  })
);

// Liste du staff (pour colorer les pseudos en vert / jaune)
router.get(
  "/staff-list",
  wrap(async (req, res) => {
    const result = await pool.query(
      `SELECT username, role
       FROM users
       WHERE role = 'moderator' OR LOWER(username) = $1`,
      [ADMIN_USERNAME]
    );
    res.json({
      staff: result.rows.map(row => ({
        username: row.username,
        role: effectiveRole(row)
      }))
    });
  })
);

// Retrouve un vrai pseudo à partir de morceaux de texte d'une ligne de liste
router.post(
  "/resolve",
  wrap(async (req, res) => {
    const list = Array.isArray(req.body.candidates) ? req.body.candidates : [];
    const candidates = [];
    for (const item of list.slice(0, 12)) {
      const name = String(item || "").trim();
      if (NAME_RE.test(name)) candidates.push(name.toLowerCase());
    }
    if (candidates.length === 0) return res.json({ username: null });

    const result = await pool.query(
      `SELECT username FROM users WHERE LOWER(username) = ANY($1::text[])`,
      [candidates]
    );
    const found = new Map(
      result.rows.map(row => [row.username.toLowerCase(), row.username])
    );
    for (const name of candidates) {
      if (found.has(name)) return res.json({ username: found.get(name) });
    }
    res.json({ username: null });
  })
);

/* ===================== PROFIL D'UN JOUEUR ===================== */

router.get(
  "/user/:username",
  wrap(async (req, res) => {
    const name = String(req.params.username || "").trim();
    if (!NAME_RE.test(name)) {
      return res.status(400).json({ error: "Pseudo invalide." });
    }

    const result = await pool.query(
      `SELECT
         u.id, u.username, u.role, u.created_at,
         ps.points, ps.league, ps.max_league,
         pp.games_played, pp.games_won, pp.top1,
         pp.ice_used, pp.fog_used, pp.heal_used,
         pp.cow_used, pp.bolt_used, pp.mortar_used,
         pp.league_idx, pp.max_league_idx,
         pp.outfit_color, pp.sword_color
       FROM users u
       LEFT JOIN player_stats ps ON ps.user_id = u.id
       LEFT JOIN player_profile pp ON pp.user_id = u.id
       WHERE LOWER(u.username) = LOWER($1)`,
      [name]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Joueur introuvable." });
    }

    const row = result.rows[0];
    const ice = Number(row.ice_used) || 0;
    const fog = Number(row.fog_used) || 0;
    const heal = Number(row.heal_used) || 0;
    const cow = Number(row.cow_used) || 0;
    const bolt = Number(row.bolt_used) || 0;
    const mortar = Number(row.mortar_used) || 0;
    const usage = { ice, fog, heal, cow, bolt, mortar };
    const totalEquipment = ice + fog + heal + cow + bolt + mortar;

    let favorite = null;
    if (totalEquipment > 0) {
      const best = Math.max(ice, fog, heal, cow, bolt, mortar);
      favorite = Object.keys(usage).find(key => usage[key] === best);
    }

    const live = liveMatches.get(String(row.id));
    const inMatch = !!(live && Date.now() - live.ts < LIVE_TTL_MS);

    const leagueIdx = Number(row.league_idx) || 0;
    const maxLeagueIdx = Math.max(Number(row.max_league_idx) || 0, leagueIdx);

    res.json({
      profile: {
        username: row.username,
        role: effectiveRole(row),
        isMe: String(row.id) === String(req.me.id),
        createdAt: row.created_at,
        medals: Number(row.points) || 0,
        leagueIdx,
        maxLeagueIdx,
        gamesPlayed: Number(row.games_played) || 0,
        gamesWon: Number(row.games_won) || 0,
        top1: Number(row.top1) || 0,
        equipment: { ice, fog, heal, cow, bolt, mortar, total: totalEquipment, favorite },
        outfit: row.outfit_color || null,
        sword: row.sword_color || null,
        inMatch
      }
    });
  })
);

/* ===================== COMBATS EN DIRECT ===================== */

router.post(
  "/live",
  wrap(async (req, res) => {
    const key = String(req.me.id);

    if (!req.body.active) {
      liveMatches.delete(key);
      return res.json({ ok: true });
    }

    const rawBoard = Array.isArray(req.body.board) ? req.body.board : [];
    const board = rawBoard.slice(0, 12).map(entry => [
      cleanText(entry && entry[0], 40),
      cleanText(entry && entry[1], 20),
      entry && entry[2] ? 1 : 0
    ]);

    liveMatches.set(key, {
      ts: Date.now(),
      data: {
        mode: cleanText(req.body.mode, 30),
        timer: cleanText(req.body.timer, 10),
        hp: clampInt(req.body.hp, 0, 100000),
        hpMax: clampInt(req.body.hpMax, 1, 100000),
        rank: cleanText(req.body.rank, 8),
        board
      }
    });

    res.json({ ok: true });
  })
);

router.get(
  "/live/:username",
  wrap(async (req, res) => {
    const target = await findTarget(req.params.username);
    if (!target) return res.status(404).json({ error: "Joueur introuvable." });

    const live = liveMatches.get(String(target.id));
    if (!live || Date.now() - live.ts >= LIVE_TTL_MS) {
      return res.json({ active: false, username: target.username });
    }
    res.json({ active: true, username: target.username, ...live.data });
  })
);

/* ===================== STATISTIQUES DE PARTIE ===================== */

router.post(
  "/match-start",
  wrap(async (req, res) => {
    const ban = await activeBan(req.me.id);
    if (ban) {
      liveMatches.delete(String(req.me.id));
      return res.status(403).json({
        error: "Tu es banni des combats.",
        ban: banPayload(ban)
      });
    }

    await pool.query(
      `INSERT INTO player_profile (user_id, games_played)
       VALUES ($1, 1)
       ON CONFLICT (user_id) DO UPDATE SET
         games_played = player_profile.games_played + 1,
         updated_at = NOW()`,
      [req.me.id]
    );

    res.json({ ok: true });
  })
);

router.post(
  "/match-end",
  wrap(async (req, res) => {
    const rank = clampInt(req.body.rank, 0, 100);
    const ranked = !!req.body.ranked;
    const eq = req.body.equipment || {};

    const won = rank === 1 ? 1 : 0;
    const top1 = rank === 1 && ranked ? 1 : 0;
    const ice = clampInt(eq.ice, 0, 20);
    const fog = clampInt(eq.fog, 0, 20);
    const heal = clampInt(eq.heal, 0, 20);
    const cow = clampInt(eq.cow, 0, 20);
    const bolt = clampInt(eq.bolt, 0, 20);
    const mortar = clampInt(eq.mortar, 0, 20);

    await pool.query(
      `INSERT INTO player_profile
         (user_id, games_won, top1, ice_used, fog_used, heal_used, cow_used, bolt_used, mortar_used)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id) DO UPDATE SET
         games_won = player_profile.games_won + EXCLUDED.games_won,
         top1 = player_profile.top1 + EXCLUDED.top1,
         ice_used = player_profile.ice_used + EXCLUDED.ice_used,
         fog_used = player_profile.fog_used + EXCLUDED.fog_used,
         heal_used = player_profile.heal_used + EXCLUDED.heal_used,
         cow_used = player_profile.cow_used + EXCLUDED.cow_used,
         bolt_used = player_profile.bolt_used + EXCLUDED.bolt_used,
         mortar_used = player_profile.mortar_used + EXCLUDED.mortar_used,
         updated_at = NOW()`,
      [req.me.id, won, top1, ice, fog, heal, cow, bolt, mortar]
    );

    // Pass : chaque top 1 rapporte des pièces (au plus une fois toutes les 30 s)
    let coinsWon = 0;
    if (rank === 1) {
      const award = await pool.query(
        `UPDATE player_profile
         SET coins = coins + $2, pass_wins = pass_wins + 1, pass_last_at = NOW()
         WHERE user_id = $1 AND (pass_last_at IS NULL OR pass_last_at < NOW() - INTERVAL '30 seconds')
         RETURNING coins`,
        [req.me.id, PASS_COINS_PER_TOP1]
      );
      if (award.rowCount > 0) coinsWon = PASS_COINS_PER_TOP1;
    }

    liveMatches.delete(String(req.me.id));
    res.json({ ok: true, coinsWon });
  })
);

router.post(
  "/character",
  wrap(async (req, res) => {
    const hex = /^#[0-9a-f]{6}$/i;
    const outfit = hex.test(String(req.body.outfit || ""))
      ? String(req.body.outfit).toLowerCase()
      : null;
    const sword = hex.test(String(req.body.sword || ""))
      ? String(req.body.sword).toLowerCase()
      : null;

    await pool.query(
      `INSERT INTO player_profile (user_id, outfit_color, sword_color)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         outfit_color = COALESCE(EXCLUDED.outfit_color, player_profile.outfit_color),
         sword_color = COALESCE(EXCLUDED.sword_color, player_profile.sword_color),
         updated_at = NOW()`,
      [req.me.id, outfit, sword]
    );
    res.json({ ok: true });
  })
);

// Ligue actuelle (1 = Bronze ... 11 = Suprême) ; la meilleure ligue ne baisse jamais.
router.post(
  "/league",
  wrap(async (req, res) => {
    const idx = clampInt(req.body.idx, 0, 11);

    await pool.query(
      `INSERT INTO player_profile (user_id, league_idx, max_league_idx)
       VALUES ($1, $2, $2)
       ON CONFLICT (user_id) DO UPDATE SET
         league_idx = EXCLUDED.league_idx,
         max_league_idx = GREATEST(player_profile.max_league_idx, EXCLUDED.league_idx),
         updated_at = NOW()`,
      [req.me.id, idx]
    );
    res.json({ ok: true });
  })
);

/* ===================== OUTILS DU STAFF ===================== */

router.get(
  "/staff/members",
  requireStaff,
  wrap(async (req, res) => {
    const q = cleanText(req.query.q, 30).replace(/[%_\\]/g, "");

    const result = await pool.query(
      `SELECT
         u.id, u.username, u.role,
         ps.points,
         b.until_at, b.reason,
         (b.id IS NOT NULL) AS banned
       FROM users u
       LEFT JOIN player_stats ps ON ps.user_id = u.id
       LEFT JOIN LATERAL (
         SELECT id, until_at, reason
         FROM bans
         WHERE user_id = u.id
           AND active
           AND (until_at IS NULL OR until_at > NOW())
         ORDER BY id DESC
         LIMIT 1
       ) b ON TRUE
       WHERE ($1 = '' OR LOWER(u.username) LIKE LOWER($2))
       ORDER BY LOWER(u.username)
       LIMIT 50`,
      [q, `%${q}%`]
    );

    res.json({
      members: result.rows.map(row => {
        const role = effectiveRole(row);
        return {
          username: row.username,
          role,
          medals: Number(row.points) || 0,
          banned: !!row.banned,
          until: row.until_at,
          permanent: !!row.banned && !row.until_at,
          reason: row.reason || "",
          canModerate: canModerate(req.me, { id: row.id, role })
        };
      })
    });
  })
);

router.post(
  "/staff/ban",
  requireStaff,
  wrap(async (req, res) => {
    const target = await findTarget(req.body.username);
    if (!target) return res.status(404).json({ error: "Joueur introuvable." });
    if (!canModerate(req.me, target)) {
      return res
        .status(403)
        .json({ error: "Tu ne peux pas sanctionner ce membre." });
    }

    const permanent =
      req.body.minutes === null || req.body.minutes === "permanent";
    let minutes = null;

    if (!permanent) {
      minutes = Math.floor(Number(req.body.minutes));
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 525600) {
        return res
          .status(400)
          .json({ error: "Durée invalide (1 minute à 1 an)." });
      }
    } else if (req.me.role !== "admin") {
      return res
        .status(403)
        .json({ error: "Seul l'administrateur peut bannir définitivement." });
    }

    const reason = cleanText(req.body.reason, 200);

    await pool.query(
      `UPDATE bans SET active = FALSE WHERE user_id = $1 AND active`,
      [target.id]
    );
    await pool.query(
      `INSERT INTO bans (user_id, until_at, reason, by_name)
       VALUES (
         $1,
         CASE WHEN $2::int IS NULL THEN NULL
              ELSE NOW() + make_interval(mins => $2::int) END,
         $3,
         $4
       )`,
      [target.id, minutes, reason, req.me.username]
    );

    liveMatches.delete(String(target.id));
    await logAction(
      req.me.username,
      target.username,
      "ban",
      (minutes === null ? "Permanent" : `${minutes} min`) +
        (reason ? ` — ${reason}` : "")
    );

    res.json({ message: `${target.username} est banni des combats.` });
  })
);

router.post(
  "/staff/unban",
  requireStaff,
  wrap(async (req, res) => {
    const target = await findTarget(req.body.username);
    if (!target) return res.status(404).json({ error: "Joueur introuvable." });
    if (!canModerate(req.me, target)) {
      return res.status(403).json({ error: "Action non autorisée." });
    }

    await pool.query(
      `UPDATE bans SET active = FALSE WHERE user_id = $1 AND active`,
      [target.id]
    );
    await logAction(req.me.username, target.username, "unban", "");

    res.json({ message: `${target.username} peut rejouer.` });
  })
);

router.post(
  "/staff/warn",
  requireStaff,
  wrap(async (req, res) => {
    const target = await findTarget(req.body.username);
    if (!target) return res.status(404).json({ error: "Joueur introuvable." });
    if (!canModerate(req.me, target)) {
      return res.status(403).json({ error: "Action non autorisée." });
    }

    const message = cleanText(req.body.message, 300);
    if (message.length < 3) {
      return res.status(400).json({ error: "Message trop court." });
    }

    await pool.query(
      `INSERT INTO warnings (user_id, message, by_name) VALUES ($1, $2, $3)`,
      [target.id, message, req.me.username]
    );
    await logAction(req.me.username, target.username, "warn", message);

    res.json({ message: `Avertissement envoyé à ${target.username}.` });
  })
);

router.post(
  "/staff/role",
  requireAdmin,
  wrap(async (req, res) => {
    const target = await findTarget(req.body.username);
    if (!target) return res.status(404).json({ error: "Joueur introuvable." });
    if (target.role === "admin" || String(target.id) === String(req.me.id)) {
      return res.status(403).json({ error: "Rôle non modifiable." });
    }

    const role = req.body.role === "moderator" ? "moderator" : "member";

    await pool.query(`UPDATE users SET role = $1 WHERE id = $2`, [
      role,
      target.id
    ]);
    await logAction(
      req.me.username,
      target.username,
      role === "moderator" ? "promote" : "demote",
      role === "moderator" ? "Nommé modérateur" : "Retiré des modérateurs"
    );

    res.json({
      message:
        role === "moderator"
          ? `${target.username} est maintenant modérateur.`
          : `${target.username} n'est plus modérateur.`
    });
  })
);

router.get(
  "/staff/bans",
  requireStaff,
  wrap(async (req, res) => {
    const result = await pool.query(
      `SELECT u.username, u.role, b.until_at, b.reason, b.by_name, b.created_at
       FROM bans b
       JOIN users u ON u.id = b.user_id
       WHERE b.active AND (b.until_at IS NULL OR b.until_at > NOW())
       ORDER BY b.id DESC
       LIMIT 100`
    );

    res.json({
      bans: result.rows.map(row => ({
        username: row.username,
        role: effectiveRole(row),
        until: row.until_at,
        permanent: !row.until_at,
        reason: row.reason || "",
        by: row.by_name,
        createdAt: row.created_at
      }))
    });
  })
);

router.get(
  "/staff/log",
  requireStaff,
  wrap(async (req, res) => {
    const result = await pool.query(
      `SELECT actor, target, action, details, created_at
       FROM staff_log
       ORDER BY id DESC
       LIMIT 60`
    );
    res.json({ log: result.rows });
  })
);

router.post(
  "/staff/announce",
  requireAdmin,
  wrap(async (req, res) => {
    const message = cleanText(req.body.message, 200);
    const minutes = clampInt(req.body.minutes, 1, 10080);

    if (message.length < 3) {
      return res.status(400).json({ error: "Annonce trop courte." });
    }

    await pool.query(`UPDATE announcements SET active = FALSE WHERE active`);
    await pool.query(
      `INSERT INTO announcements (message, by_name, expires_at)
       VALUES ($1, $2, NOW() + make_interval(mins => $3::int))`,
      [message, req.me.username, minutes]
    );
    await logAction(req.me.username, null, "announce", message);

    res.json({ message: "Annonce publiée." });
  })
);

router.delete(
  "/staff/announce",
  requireAdmin,
  wrap(async (req, res) => {
    await pool.query(`UPDATE announcements SET active = FALSE WHERE active`);
    await logAction(req.me.username, null, "announce-clear", "");
    res.json({ message: "Annonce retirée." });
  })
);

module.exports = router;
