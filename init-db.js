const pool = require("./db");

async function init() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        username VARCHAR(30) NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique
        ON users (LOWER(username));

      CREATE TABLE IF NOT EXISTS friend_requests (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        receiver_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT different_users
          CHECK (sender_id <> receiver_id),

        CONSTRAINT unique_friend_request
          UNIQUE (sender_id, receiver_id)
      );

      DROP VIEW IF EXISTS player_stats CASCADE;

      CREATE TABLE player_stats (
        user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        points INTEGER NOT NULL DEFAULT 0,
        league INTEGER NOT NULL DEFAULT 0,
        last_seen TIMESTAMPTZ,
        online BOOLEAN NOT NULL DEFAULT FALSE,
        in_combat BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    console.log("Base TRUGO initialisée.");
  } catch (error) {
    console.error(
      "Échec de l'initialisation PostgreSQL :",
      error.message
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

init();
