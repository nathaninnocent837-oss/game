
BEGIN;

-- 1. Comptes des joueurs
CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username VARCHAR(30) NOT NULL,
    email VARCHAR(254) NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT users_username_length
        CHECK (CHAR_LENGTH(username) BETWEEN 3 AND 30),

    CONSTRAINT users_email_not_empty
        CHECK (LENGTH(TRIM(email)) > 0)
);

-- Un nom d'utilisateur et un email uniques,
-- sans distinction entre majuscules et minuscules.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uq
    ON users (LOWER(username));

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq
    ON users (LOWER(email));


-- 2. Historique des parties terminées
CREATE TABLE IF NOT EXISTS game_sessions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,

    game_mode VARCHAR(30) NOT NULL DEFAULT 'classic',

    score BIGINT NOT NULL DEFAULT 0
        CHECK (score >= 0),

    duration_seconds INTEGER
        CHECK (duration_seconds IS NULL OR duration_seconds >= 0),

    played_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Historique d'un joueur
CREATE INDEX IF NOT EXISTS game_sessions_user_date_idx
    ON game_sessions (user_id, played_at DESC);

-- Recherche des meilleurs scores par mode de jeu
CREATE INDEX IF NOT EXISTS game_sessions_leaderboard_idx
    ON game_sessions (game_mode, score DESC, user_id);


-- 3. Classement calculé automatiquement
CREATE OR REPLACE VIEW leaderboard AS
SELECT
    user_id,
    username,
    game_mode,
    best_score,
    RANK() OVER (
        PARTITION BY game_mode
        ORDER BY best_score DESC
    ) AS rank
FROM (
    SELECT
        u.id AS user_id,
        u.username,
        gs.game_mode,
        MAX(gs.score) AS best_score
    FROM users u
    JOIN game_sessions gs ON gs.user_id = u.id
    GROUP BY u.id, u.username, gs.game_mode
) AS player_scores;


-- 4. Statistiques calculées à partir des parties
CREATE OR REPLACE VIEW player_stats AS
SELECT
    u.id AS user_id,
    u.username,
    COUNT(gs.id) AS games_played,
    COALESCE(SUM(gs.score), 0) AS total_score,
    COALESCE(MAX(gs.score), 0) AS best_score,
    COALESCE(ROUND(AVG(gs.score), 2), 0) AS average_score
FROM users u
LEFT JOIN game_sessions gs ON gs.user_id = u.id
GROUP BY u.id, u.username;

COMMIT;
