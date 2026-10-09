const fs = require("node:fs");
const path = require("node:path");
const pool = require("./db");

async function initializeDatabase() {
  try {
    const schemaPath = path.join(
      __dirname,
      "sql",
      "schema.sql"
    );

    const schema = fs.readFileSync(schemaPath, "utf8");

    await pool.query(schema);

    console.log("Schema PostgreSQL initialise avec succes.");
  } finally {
    await pool.end();
  }
}

initializeDatabase().catch((error) => {
  console.error("Echec de l'initialisation PostgreSQL.");
  console.error(error.message);
  process.exitCode = 1;
});
