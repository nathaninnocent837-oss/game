const express = require("express");
const pool = require("../db");

const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Tu dois être connecté." });
  }
  next();
}

// Liste des amis
router.get("/", requireLogin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        fr.id AS friendship_id,
        u.id,
        u.username,
        fr.sender_id AS requester_id,
        fr.status,
        ps.points,
        ps.league,
        ps.last_seen,
        ps.games_played,
        ps.wins,
        ps.eliminations,
        ps.max_league,
        ps.outfit_color,
        ps.sword_color
       FROM friend_requests fr
       JOIN users u
         ON u.id = CASE
           WHEN fr.sender_id = $1 THEN fr.receiver_id
           ELSE fr.sender_id
         END
       LEFT JOIN player_stats ps ON ps.user_id = u.id
       WHERE (fr.sender_id = $1 OR fr.receiver_id = $1)
         AND fr.status = 'accepted'
       ORDER BY LOWER(u.username)`,
      [req.session.userId]
    );

    res.json({
      friends: result.rows.map(row => ({
        ...row,
        online: row.last_seen ? (Date.now() - new Date(row.last_seen).getTime() < 90000) : false
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Impossible de récupérer les amis." });
  }
});

// Recherche de joueurs
router.get("/users", requireLogin, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();

    if (q.length < 2) {
      return res.json({ users: [] });
    }

    const result = await pool.query(
      `SELECT
        u.id,
        u.username,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM friend_requests fr
            WHERE fr.status = 'accepted'
              AND (
                (fr.sender_id = $1 AND fr.receiver_id = u.id)
                OR
                (fr.sender_id = u.id AND fr.receiver_id = $1)
              )
          ) THEN 'friend'

          WHEN EXISTS (
            SELECT 1
            FROM friend_requests fr
            WHERE fr.status = 'pending'
              AND fr.sender_id = $1
              AND fr.receiver_id = u.id
          ) THEN 'sent'

          WHEN EXISTS (
            SELECT 1
            FROM friend_requests fr
            WHERE fr.status = 'pending'
              AND fr.sender_id = u.id
              AND fr.receiver_id = $1
          ) THEN 'received'

          ELSE 'none'
        END AS relationship
       FROM users u
       WHERE u.id <> $1
         AND LOWER(u.username) LIKE LOWER($2)
       ORDER BY LOWER(u.username)
       LIMIT 20`,
      [req.session.userId, `%${q}%`]
    );

    res.json({
      users: result.rows.map(row => ({
        ...row,
        online: false
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Impossible de rechercher les joueurs." });
  }
});

// Envoyer une demande d'ami
router.post("/request", requireLogin, async (req, res) => {
  try {
    const senderId = req.session.userId;
    const username = String(req.body.username || "").trim();

    if (!username) {
      return res.status(400).json({ error: "Nom d'utilisateur manquant." });
    }

    const userResult = await pool.query(
      `SELECT id, username
       FROM users
       WHERE LOWER(username) = LOWER($1)`,
      [username]
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: "Joueur introuvable." });
    }

    const receiverId = userResult.rows[0].id;

    if (String(senderId) === String(receiverId)) {
      return res.status(400).json({
        error: "Tu ne peux pas t'ajouter toi-même."
      });
    }

    const existing = await pool.query(
      `SELECT id, status, sender_id, receiver_id
       FROM friend_requests
       WHERE
         (sender_id = $1 AND receiver_id = $2)
         OR
         (sender_id = $2 AND receiver_id = $1)
       LIMIT 1`,
      [senderId, receiverId]
    );

    if (existing.rowCount > 0) {
      const r = existing.rows[0];

      if (r.status === "accepted") {
        return res.status(409).json({
          error: "Vous êtes déjà amis."
        });
      }

      if (
        String(r.sender_id) === String(receiverId) &&
        r.status === "pending"
      ) {
        return res.status(409).json({
          error: "Ce joueur t'a déjà envoyé une demande."
        });
      }

      return res.status(409).json({
        error: "Demande déjà envoyée."
      });
    }

    await pool.query(
      `INSERT INTO friend_requests
       (sender_id, receiver_id, status)
       VALUES ($1, $2, 'pending')`,
      [senderId, receiverId]
    );

    res.json({
      message: "Demande d'ami envoyée."
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Impossible d'envoyer la demande."
    });
  }
});

// Accepter une demande
router.post("/accept/:id", requireLogin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE friend_requests
       SET status = 'accepted'
       WHERE id = $1
         AND receiver_id = $2
         AND status = 'pending'
       RETURNING id`,
      [req.params.id, req.session.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Demande introuvable."
      });
    }

    res.json({ message: "Demande acceptée." });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Impossible d'accepter la demande."
    });
  }
});

// Profil d'un ami
router.get("/:id/profile", requireLogin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        u.id, u.username,
        ps.points, ps.league, ps.last_seen, ps.games_played, ps.wins,
        ps.eliminations, ps.max_league, ps.outfit_color, ps.sword_color
       FROM users u
       JOIN friend_requests fr
         ON fr.status = 'accepted'
        AND ((fr.sender_id = $1 AND fr.receiver_id = u.id) OR (fr.sender_id = u.id AND fr.receiver_id = $1))
       LEFT JOIN player_stats ps ON ps.user_id = u.id
       WHERE u.id = $2
       LIMIT 1`,
      [req.session.userId, req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Ami introuvable." });
    const p = result.rows[0];
    res.json({
      profile: {
        id: p.id, username: p.username, points: Number(p.points)||0, league: Number(p.league)||0,
        last_seen: p.last_seen, online: p.last_seen ? (Date.now()-new Date(p.last_seen).getTime()<90000) : false,
        games_played: Number(p.games_played)||0, wins: Number(p.wins)||0, eliminations: Number(p.eliminations)||0,
        max_league: Number(p.max_league)||0, outfit_color: p.outfit_color || '#3fa7ff', sword_color: p.sword_color || '#d9dde3'
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Impossible de récupérer le profil." });
  }
});

// Supprimer un ami
router.delete("/:id", requireLogin, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM friend_requests
       WHERE id = $1
         AND status = 'accepted'
         AND (sender_id = $2 OR receiver_id = $2)
       RETURNING id`,
      [req.params.id, req.session.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Ami introuvable."
      });
    }

    res.json({ message: "Ami supprimé." });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Impossible de supprimer cet ami."
    });
  }
});

// Ces deux routes sont appelées par game.js.
// Pour l'instant elles répondent simplement sans modifier la base.
router.post("/presence", requireLogin, async (req, res) => {
  res.json({ ok: true });
});

router.post("/stats", requireLogin, async (req, res) => {
  try {
    const points = Math.max(0, Number(req.body.points) || 0);
    const league = Math.max(0, Number(req.body.league) || 0);
    const gamesPlayed = Math.max(0, Number(req.body.gamesPlayed) || 0);
    const wins = Math.max(0, Number(req.body.wins) || 0);
    const eliminations = Math.max(0, Number(req.body.eliminations) || 0);
    const maxLeague = Math.max(0, Number(req.body.maxLeague) || league);
    const outfitColor = String(req.body.outfitColor || '').slice(0, 20) || null;
    const swordColor = String(req.body.swordColor || '').slice(0, 20) || null;

    await pool.query(
      `INSERT INTO player_stats
        (user_id, points, league, last_seen, online, updated_at, games_played, wins, eliminations, max_league, outfit_color, sword_color)
       VALUES ($1, $2, $3, NOW(), TRUE, NOW(), $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id)
       DO UPDATE SET
         points = EXCLUDED.points, league = EXCLUDED.league, last_seen = NOW(), online = TRUE, updated_at = NOW(),
         games_played = EXCLUDED.games_played, wins = EXCLUDED.wins, eliminations = EXCLUDED.eliminations,
         max_league = GREATEST(player_stats.max_league, EXCLUDED.max_league),
         outfit_color = EXCLUDED.outfit_color, sword_color = EXCLUDED.sword_color`,
      [req.session.userId, points, league, gamesPlayed, wins, eliminations, maxLeague, outfitColor, swordColor]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Impossible d'enregistrer les statistiques." });
  }
});
// Classement des joueurs
router.get("/leaderboard", requireLogin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        u.id,
        u.username,
        ps.points,
        ps.league
       FROM users u
       LEFT JOIN player_stats ps
         ON ps.user_id = u.id
       ORDER BY
         COALESCE(ps.points, 0) DESC,
         LOWER(u.username)
       LIMIT 100`
    );

    res.json({
      players: result.rows.map(player => ({
        id: player.id,
        username: player.username,
        points: Number(player.points) || 0,
        league: Number(player.league) || 0
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Impossible de récupérer le classement."
    });
  }
});
module.exports = router;
