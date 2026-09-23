const fs = require('fs/promises');
const path = require('path');
const db = require('../db');
const config = require('../config');
const { parseMediaPath } = require('./parse');
const { getDurationSeconds } = require('./ffprobe');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.m4v', '.mov', '.wmv', '.ts', '.webm']);

// The generated-proxy tree lives under a media root by convention (see backend/src/proxy),
// so it must be skipped here — otherwise the scanner would re-ingest proxy files as if
// they were new source media, duplicating every proxied title under a second entry.
function isExcluded(dir) {
  return dir === config.proxyRoot;
}

async function* walk(dir) {
  if (isExcluded(dir)) return;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      yield full;
    }
  }
}

async function findOrCreateGroupId(showName, season, episode) {
  const name = `${showName} S${String(season ?? 0).padStart(2, '0')}E${String(episode ?? 0).padStart(2, '0')}`;
  const existing = await db.query('SELECT id FROM episode_groups WHERE name = $1', [name]);
  if (existing.rows[0]) return existing.rows[0].id;
  const inserted = await db.query('INSERT INTO episode_groups (name) VALUES ($1) RETURNING id', [name]);
  return inserted.rows[0].id;
}

async function upsertFile(root, absolutePath) {
  const relative = path.relative(root, absolutePath);
  const segments = relative.split(path.sep);
  const parsed = parseMediaPath(segments);

  let duration = null;
  try {
    duration = await getDurationSeconds(absolutePath);
  } catch (err) {
    console.warn(`ffprobe failed for ${absolutePath}: ${err.message}`);
  }

  let fileSize = null;
  try {
    fileSize = (await fs.stat(absolutePath)).size;
  } catch (err) {
    // ignore
  }

  let groupId = null;
  if (parsed.kind === 'episode' && parsed.part_number != null && parsed.show_name) {
    groupId = await findOrCreateGroupId(parsed.show_name, parsed.season, parsed.episode);
  }

  await db.query(
    `INSERT INTO media_files
       (absolute_path, kind, title, show_name, season, episode, duration_seconds, file_size, group_id, part_number, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT (absolute_path) DO UPDATE SET
       kind = EXCLUDED.kind,
       title = EXCLUDED.title,
       show_name = EXCLUDED.show_name,
       season = EXCLUDED.season,
       episode = EXCLUDED.episode,
       duration_seconds = COALESCE(EXCLUDED.duration_seconds, media_files.duration_seconds),
       file_size = EXCLUDED.file_size,
       group_id = EXCLUDED.group_id,
       part_number = EXCLUDED.part_number,
       last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    [
      absolutePath,
      parsed.kind,
      parsed.title,
      parsed.show_name,
      parsed.season,
      parsed.episode,
      duration,
      fileSize,
      groupId,
      parsed.part_number,
    ]
  );
}

async function scan(roots = config.mediaRoots) {
  let count = 0;
  const scanStart = new Date();
  for (const root of roots) {
    for await (const filePath of walk(root)) {
      await upsertFile(root, filePath);
      count += 1;
    }
    // Anything under this root not touched by the walk just now (moved/deleted since the
    // last scan) is immediately marked stale, rather than waiting up to STALE_AFTER (2
    // days, see rules.js) to naturally age out — otherwise a moved file's old row keeps
    // getting selected for scheduling/proxying long after the path stopped existing.
    await db.query(
      `UPDATE media_files SET last_seen_at = '1970-01-01T00:00:00.000Z'
       WHERE absolute_path LIKE $1 || '%' AND last_seen_at < $2`,
      [root, scanStart]
    );
  }
  return count;
}

module.exports = { scan };
