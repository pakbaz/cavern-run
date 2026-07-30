CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (
    length(name) BETWEEN 1 AND 3
    AND name NOT GLOB '*[^A-Z0-9 ]*'
  ),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 99999999),
  cave_reached INTEGER NOT NULL CHECK (cave_reached BETWEEN 1 AND 20),
  cave_letter TEXT NOT NULL CHECK (length(cave_letter) = 1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX IF NOT EXISTS scores_ranking
ON scores (score DESC, cave_reached DESC, created_at ASC);
