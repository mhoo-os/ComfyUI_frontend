-- Render attempts for a shot and their automated reviews. An attempt is quoted
-- first (no spend), rendered only after the owner approves the quote, and never
-- resubmitted automatically. Caps are enforced by the Worker when a quote is approved.
CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  film_id TEXT NOT NULL,
  episode INTEGER NOT NULL,
  scene_id TEXT NOT NULL,
  scene_version INTEGER NOT NULL,
  shot_id TEXT NOT NULL,
  target TEXT NOT NULL,
  -- 1-based position among this shot's attempts that count toward the attempt cap
  number INTEGER NOT NULL CHECK (number >= 1),
  parent_id TEXT REFERENCES attempts(id),
  -- the compiled node: {"class_type": ..., "inputs": {...}}
  request TEXT NOT NULL CHECK (json_valid(request)),
  -- repair plan for a follow-up attempt: {"note": ..., "fixes": [...]}
  repair TEXT CHECK (repair IS NULL OR json_valid(repair)),
  quote_usd REAL CHECK (quote_usd IS NULL OR quote_usd >= 0),
  quote_credits TEXT,
  quote_note TEXT,
  status TEXT NOT NULL CHECK (status IN (
    'quoted', 'approved', 'submitting', 'rendering', 'rendered', 'reviewed',
    'accepted', 'rejected', 'failed', 'cancelled'
  )),
  job_id TEXT,
  output TEXT,
  -- null while unknown; the quote counts toward caps until then
  spend_usd REAL CHECK (spend_usd IS NULL OR spend_usd >= 0),
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT,
  finished_at TEXT,
  decided_at TEXT
);
CREATE INDEX attempts_by_shot ON attempts(scene_id, shot_id, created_at);
CREATE INDEX attempts_by_episode ON attempts(film_id, episode);

CREATE TABLE reviews (
  attempt_id TEXT PRIMARY KEY REFERENCES attempts(id),
  status TEXT NOT NULL CHECK (status IN ('flagged', 'no_flags', 'error')),
  flags INTEGER NOT NULL DEFAULT 0 CHECK (flags >= 0),
  report TEXT NOT NULL CHECK (json_valid(report)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Episode cuts: accepted takes, in shot order, rendered by the finishing
-- pipeline (Cloudflare compute, not provider credits).
CREATE TABLE cuts (
  id TEXT PRIMARY KEY,
  film_id TEXT NOT NULL,
  episode INTEGER NOT NULL,
  scene_id TEXT NOT NULL,
  scene_version INTEGER NOT NULL,
  -- [{"shot": ..., "attempt": ..., "output": ...}]
  takes TEXT NOT NULL CHECK (json_valid(takes)),
  status TEXT NOT NULL CHECK (status IN ('rendering', 'done', 'failed')),
  job_id TEXT,
  export_node TEXT NOT NULL,
  output TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE INDEX cuts_by_scene ON cuts(scene_id, created_at);
