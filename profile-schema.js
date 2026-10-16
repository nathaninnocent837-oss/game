const pool = require("./db");

// Crée / met à jour les tables nécessaires aux profils, rôles et sanctions.
// Exécuté au démarrage du serveur (sans toucher à init-db.js).
async function ensureProfileSchema() {
  const typeResult = await pool.query(
    `SELECT data_type
     FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = 'id'
     LIMIT 1`
  );

  const dataType = typeResult.rows[0] ? typeResult.rows[0].data_type : "integer";
  const idType =
    {
      integer: "INTEGER",
      bigint: "BIGINT",
      smallint: "SMALLINT",
      uuid: "UUID"
    }[dataType] || "TEXT";

  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'`
  );

  await pool.query(
    `ALTER TABLE IF EXISTS player_stats
     ADD COLUMN IF NOT EXISTS max_league INTEGER NOT NULL DEFAULT 0`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS player_profile (
       user_id ${idType} PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
       games_played INTEGER NOT NULL DEFAULT 0,
       games_won INTEGER NOT NULL DEFAULT 0,
       top1 INTEGER NOT NULL DEFAULT 0,
       ice_used INTEGER NOT NULL DEFAULT 0,
       fog_used INTEGER NOT NULL DEFAULT 0,
       heal_used INTEGER NOT NULL DEFAULT 0,
       league_idx INTEGER NOT NULL DEFAULT 0,
       max_league_idx INTEGER NOT NULL DEFAULT 0,
       outfit_color TEXT,
       sword_color TEXT,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS bans (
       id SERIAL PRIMARY KEY,
       user_id ${idType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       until_at TIMESTAMPTZ,
       reason TEXT NOT NULL DEFAULT '',
       by_name TEXT NOT NULL DEFAULT '',
       active BOOLEAN NOT NULL DEFAULT TRUE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS bans_user_active_idx ON bans (user_id, active)`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS warnings (
       id SERIAL PRIMARY KEY,
       user_id ${idType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       message TEXT NOT NULL,
       by_name TEXT NOT NULL DEFAULT '',
       seen BOOLEAN NOT NULL DEFAULT FALSE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS staff_log (
       id SERIAL PRIMARY KEY,
       actor TEXT NOT NULL,
       target TEXT,
       action TEXT NOT NULL,
       details TEXT NOT NULL DEFAULT '',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS announcements (
       id SERIAL PRIMARY KEY,
       message TEXT NOT NULL,
       by_name TEXT NOT NULL DEFAULT '',
       active BOOLEAN NOT NULL DEFAULT TRUE,
       expires_at TIMESTAMPTZ NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );

  // Le compte « trusy » est l'administrateur du jeu.
  await pool.query(
    `UPDATE users SET role = 'admin' WHERE LOWER(username) = 'trusy'`
  );
}

module.exports = { ensureProfileSchema };
