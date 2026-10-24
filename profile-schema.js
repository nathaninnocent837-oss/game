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
       cow_used INTEGER NOT NULL DEFAULT 0,
       bolt_used INTEGER NOT NULL DEFAULT 0,
       mortar_used INTEGER NOT NULL DEFAULT 0,
       league_idx INTEGER NOT NULL DEFAULT 0,
       max_league_idx INTEGER NOT NULL DEFAULT 0,
       outfit_color TEXT,
       sword_color TEXT,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );

  // bases créées avant l'arrivée des nouveaux équipements
  await pool.query(`ALTER TABLE player_profile ADD COLUMN IF NOT EXISTS cow_used INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE player_profile ADD COLUMN IF NOT EXISTS bolt_used INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE player_profile ADD COLUMN IF NOT EXISTS mortar_used INTEGER NOT NULL DEFAULT 0`);

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

  // Teams : groupes avec chat texte et messages vocaux
  await pool.query(
    `CREATE TABLE IF NOT EXISTS teams (
       id SERIAL PRIMARY KEY,
       name TEXT NOT NULL,
       code TEXT NOT NULL UNIQUE,
       owner_id ${idType} REFERENCES users(id) ON DELETE SET NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
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
  await pool.query(
    `CREATE INDEX IF NOT EXISTS team_messages_team_idx ON team_messages (team_id, id)`
  );

  // Salon « Team » général : ouvert à tous les joueurs (code réservé 00000000)
  await pool.query(
    `INSERT INTO teams (name, code, owner_id) VALUES ('Général', '00000000', NULL)
     ON CONFLICT (code) DO NOTHING`
  );

  // Center : pièces, Pass (top 1), objets du magasin, messages aux admins
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

  // Le compte « trusy » est l'administrateur du jeu.
  await pool.query(
    `UPDATE users SET role = 'admin' WHERE LOWER(username) = 'trusy'`
  );
}

module.exports = { ensureProfileSchema };
