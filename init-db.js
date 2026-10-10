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
    `);
    console.log("Base TRUGO initialisée.");
  } catch (error) {
    console.error("Échec de l'initialisation PostgreSQL :", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

init();
