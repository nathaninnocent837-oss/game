const express = require("express");
const pool = require("../db");

const router = express.Router();

const ADMIN_USERNAME = "trusy";
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

    liveMatches.delete(String(req.me.id));
    res.json({ ok: true });
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
