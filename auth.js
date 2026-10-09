
const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");

const router = express.Router();

// Inscription
router.post("/register", async (req, res) => {
  try {
    const username =
      typeof req.body.username === "string"
        ? req.body.username.trim()
        : "";

    const password =
      typeof req.body.password === "string"
        ? req.body.password
        : "";

    if (!/^[a-zA-Z0-9_-]{3,30}$/.test(username)) {
      return res.status(400).json({
        error:
          "Le pseudo doit contenir 3 à 30 caractères : lettres, chiffres, _ ou -."
      });
    }

    if (
      password.length < 10 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return res.status(400).json({
        error: "Le mot de passe doit contenir au moins 10 caractères et au maximum 72 octets."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, created_at`,
      [
        username,
        `${username.toLowerCase()}@users.invalid`,
        passwordHash
      ]
    );

    req.session.userId = result.rows[0].id;

    return res.status(201).json({
      message: "Compte créé avec succès.",
      user: result.rows[0]
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: "Ce pseudo est déjà utilisé."
      });
    }

    console.error("Erreur inscription :", error.message);

    return res.status(500).json({
      error: "Impossible de créer le compte."
    });
  }
});

// Connexion
router.post("/login", async (req, res) => {
  try {
    const username =
      typeof req.body.username === "string"
        ? req.body.username.trim()
        : "";

    const password =
      typeof req.body.password === "string"
        ? req.body.password
        : "";

    if (!username || !password) {
      return res.status(400).json({
        error: "Pseudo et mot de passe obligatoires."
      });
    }

    const result = await pool.query(
      `SELECT id, username, password_hash
       FROM users
       WHERE LOWER(username) = LOWER($1)
       LIMIT 1`,
      [username]
    );

    const user = result.rows[0];

    if (
      !user ||
      !(await bcrypt.compare(password, user.password_hash))
    ) {
      return res.status(401).json({
        error: "Pseudo ou mot de passe incorrect."
      });
    }

    // Renouvelle l'identifiant de session après connexion.
    req.session.regenerate((err) => {
      if (err) {
        console.error("Erreur session :", err.message);
        return res.status(500).json({
          error: "Impossible d'ouvrir la session."
        });
      }

      req.session.userId = user.id;

      req.session.save((saveError) => {
        if (saveError) {
          console.error("Erreur sauvegarde session :", saveError.message);
          return res.status(500).json({
            error: "Impossible de sauvegarder la session."
          });
        }

        return res.json({
          message: "Connexion réussie.",
          user: {
            id: user.id,
            username: user.username
          }
        });
      });
    });
  } catch (error) {
    console.error("Erreur connexion :", error.message);

    return res.status(500).json({
      error: "Impossible de se connecter."
    });
  }
});

// Informations du joueur connecté
router.get("/me", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({
      error: "Tu n'es pas connecté."
    });
  }

  try {
    const result = await pool.query(
      `SELECT id, username, created_at
       FROM users
       WHERE id = $1`,
      [req.session.userId]
    );

    if (result.rowCount === 0) {
      return req.session.destroy(() => {
        res.status(401).json({
          error: "Session invalide."
        });
      });
    }

    return res.json({ user: result.rows[0] });
  } catch (error) {
    console.error("Erreur profil :", error.message);

    return res.status(500).json({
      error: "Impossible de récupérer le profil."
    });
  }
});

// Déconnexion
router.post("/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error("Erreur déconnexion :", error.message);

      return res.status(500).json({
        error: "Impossible de fermer la session."
      });
    }

    res.clearCookie("game.sid", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/"
    });

    return res.json({
      message: "Déconnexion réussie."
    });
  });
});

module.exports = router;
