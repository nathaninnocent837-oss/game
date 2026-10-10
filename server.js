
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const pool = require("./db");

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error("La variable SESSION_SECRET doit être définie en production.");
}


app.set("trust proxy", 1);

app.use(express.json({ limit: "20kb" }));

app.use(
  session({
    name: "game.sid",
    store: new PgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET || "trugo-dev-only-change-this-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

app.use("/api/auth", require("./routes/auth"));
app.use("/api/friends", require("./routes/friends"));

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
