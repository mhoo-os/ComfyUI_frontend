-- Baseline of the tables that already exist in mhoo-film, created before this repo kept
-- migrations. IF NOT EXISTS makes this a no-op on the live database and builds a fresh local one.
CREATE TABLE IF NOT EXISTS films (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  film_id TEXT NOT NULL REFERENCES films(id),
  kind TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (film_id, kind, version)
);

CREATE TABLE IF NOT EXISTS scenes (
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  film_id TEXT NOT NULL REFERENCES films(id),
  episode INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  spec TEXT NOT NULL CHECK (json_valid(spec)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (id, version)
);
