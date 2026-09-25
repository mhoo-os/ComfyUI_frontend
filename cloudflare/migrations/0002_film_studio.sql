-- Studio V1: the episode list and the cast. Rows are private film data and are seeded
-- outside this repository.
CREATE TABLE episodes (
  film_id TEXT NOT NULL REFERENCES films(id),
  number INTEGER NOT NULL CHECK (number >= 1),
  title TEXT NOT NULL,
  PRIMARY KEY (film_id, number)
);

CREATE TABLE cast_members (
  id TEXT PRIMARY KEY,
  film_id TEXT NOT NULL REFERENCES films(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('anchor', 'era_look', 'supporting')),
  era TEXT,
  -- JSON array of episode numbers this member appears in
  episodes TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(episodes)),
  -- mhoo-media:outputs/<job>/<node>/<i> or mhoo-asset:<uuid>:<n>
  source_ref TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'revoked')),
  approved_at TEXT,
  note TEXT,
  CHECK (kind != 'era_look' OR status != 'approved' OR source_ref IS NOT NULL)
);
CREATE INDEX cast_members_by_film ON cast_members(film_id, kind);
