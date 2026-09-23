const db = require('../db');
const config = require('../config');
const { resolveChannelUnits } = require('./rules');
const liquidsoap = require('../liquidsoap/processManager');

const DEFAULT_DURATION_SECONDS = 1800; // used when ffprobe couldn't read a file's duration
const COOLDOWN_MS = 24 * 3600 * 1000; // don't repeat a title on the same channel within 24h

async function getScheduleTail(channelId) {
  const { rows } = await db.query(
    'SELECT scheduled_end, sort_order FROM channel_schedule WHERE channel_id = $1 ORDER BY sort_order DESC LIMIT 1',
    [channelId]
  );
  return rows[0] || null;
}

// Seeds the cooldown tracker from whatever's already scheduled on this channel in the 24h
// leading up to `cursorStart` — catches repeats across separate generation runs (e.g. this
// morning's extend vs. last night's), not just within one run.
async function getRecentlyScheduled(channelId, cursorStart) {
  const { rows } = await db.query(
    `SELECT mf.id AS file_id, mf.group_id, cs.scheduled_end
     FROM channel_schedule cs JOIN media_files mf ON mf.id = cs.media_file_id
     WHERE cs.channel_id = $1 AND cs.scheduled_end > $2 AND cs.scheduled_start < $3`,
    [channelId, new Date(cursorStart.getTime() - COOLDOWN_MS), cursorStart]
  );
  return rows.map((r) => ({ fileId: r.file_id, groupId: r.group_id, end: new Date(r.scheduled_end) }));
}

/** Extends one channel's schedule forward until it covers `horizonHours` from now.
 *  Truncates any not-yet-served future rows first when `regenerateFromNow` is set
 *  (used after a rule/override edit) so the new rules take effect immediately. */
async function extendChannelSchedule(channel, { horizonHours = config.scheduleHorizonHours, regenerateFromNow = false } = {}) {
  if (regenerateFromNow) {
    await db.query(
      "DELETE FROM channel_schedule WHERE channel_id = $1 AND served = 0 AND scheduled_start > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
      [channel.id]
    );
  }

  const tail = await getScheduleTail(channel.id);
  let cursor = tail ? new Date(tail.scheduled_end) : new Date();
  if (cursor < new Date()) cursor = new Date();
  let sortOrder = tail ? Number(tail.sort_order) + 1 : 1;
  const horizonEnd = new Date(Date.now() + horizonHours * 3600 * 1000);

  // Sliding 24h cooldown window: a title scheduled here stays excluded from being picked
  // again until `cursor` moves 24h past when it aired. resolveChannelUnits has its own
  // fallback to ignore cooldown rather than starve a small library.
  let recent = await getRecentlyScheduled(channel.id, cursor);

  const rowsToInsert = [];
  let guard = 0;
  while (cursor < horizonEnd) {
    guard += 1;
    if (guard > 500) break; // safety valve against runaway/empty-rule loops

    recent = recent.filter((r) => r.end.getTime() > cursor.getTime() - COOLDOWN_MS);
    const cooldown = {
      fileIds: new Set(recent.map((r) => r.fileId)),
      groupIds: new Set(recent.filter((r) => r.groupId).map((r) => r.groupId)),
    };

    const units = await resolveChannelUnits(channel, cooldown);
    if (units.length === 0) break; // no rule or no matching content — nothing to schedule

    for (const unit of units) {
      for (const file of unit.files) {
        const duration = Number(file.duration_seconds) > 0 ? Number(file.duration_seconds) : DEFAULT_DURATION_SECONDS;
        const start = cursor;
        const end = new Date(cursor.getTime() + duration * 1000);
        rowsToInsert.push({ mediaFileId: file.id, start, end, sortOrder });
        cursor = end;
        sortOrder += 1;
      }
      recent.push({ fileId: unit.files[0].id, groupId: unit.groupId, end: cursor });
      if (cursor >= horizonEnd) break;
    }
  }

  if (rowsToInsert.length === 0) return 0;

  db.transaction(() => {
    for (const row of rowsToInsert) {
      db.querySync(
        `INSERT INTO channel_schedule (media_file_id, scheduled_start, scheduled_end, sort_order, channel_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.mediaFileId, row.start, row.end, row.sortOrder, channel.id]
      );
    }
  });

  return rowsToInsert.length;
}

// Only tops up channels that are actually running — a channel stopped for the night
// (manually or via the nightly-off schedule) should stay with an empty queue until
// something explicitly starts it again, not get silently refilled by this periodic tick.
async function extendAllActiveChannels(options) {
  const { rows: channels } = await db.query('SELECT * FROM channels WHERE is_active = true');
  const results = {};
  for (const channel of channels) {
    if (!liquidsoap.status(channel).running) continue;
    results[channel.id] = await extendChannelSchedule(channel, options);
  }
  return results;
}

module.exports = { extendChannelSchedule, extendAllActiveChannels };
