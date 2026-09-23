-- Squashed schema (the pg-migrate history this replaced was Postgres-only). Idempotent:
-- safe to run against an existing database, since every statement is IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS episode_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS media_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  absolute_path TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('movie', 'episode')),
  title TEXT NOT NULL,
  show_name TEXT,
  season INTEGER,
  episode INTEGER,
  duration_seconds REAL,
  file_size INTEGER,
  group_id INTEGER REFERENCES episode_groups (id) ON DELETE SET NULL,
  part_number INTEGER,
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  proxy_path TEXT,
  proxied_at TEXT,
  proxy_failed_at TEXT,
  proxy_last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_media_files_show_name ON media_files (show_name);
CREATE INDEX IF NOT EXISTS idx_media_files_group_id ON media_files (group_id);

CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  stop_after_current INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- MVP: exactly one active rule per channel, enforced at the application layer (or, for
-- block-programming channels, an ordered set of rule "slots" via block_order/block_count).
CREATE TABLE IF NOT EXISTS channel_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL REFERENCES channels (id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('folder', 'show')),
  rule_value TEXT NOT NULL,
  shuffle INTEGER NOT NULL DEFAULT 0,
  -- Position in the channel's rotation cycle (0-based). A plain single-rule channel just has
  -- one row at block_order 0.
  block_order INTEGER NOT NULL DEFAULT 0,
  -- How many units to pull from this rule per cycle before moving to the next slot.
  block_count INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_channel_rules_channel_id ON channel_rules (channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_rules_channel_block ON channel_rules (channel_id, block_order);

CREATE TABLE IF NOT EXISTS channel_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL REFERENCES channels (id) ON DELETE CASCADE,
  media_file_id INTEGER REFERENCES media_files (id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES episode_groups (id) ON DELETE CASCADE,
  override_type TEXT NOT NULL CHECK (override_type IN ('pin', 'exclude')),
  pin_position INTEGER,
  CHECK ((media_file_id IS NOT NULL) <> (group_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_channel_overrides_channel_id ON channel_overrides (channel_id);

CREATE TABLE IF NOT EXISTS channel_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL REFERENCES channels (id) ON DELETE CASCADE,
  media_file_id INTEGER NOT NULL REFERENCES media_files (id) ON DELETE CASCADE,
  scheduled_start TEXT NOT NULL,
  scheduled_end TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  served INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_channel_schedule_channel_sort ON channel_schedule (channel_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_channel_schedule_channel_served ON channel_schedule (channel_id, served);
