const db = require('../db');

/** Pops the next not-yet-served schedule row for a channel and marks it served.
 *  Called by each channel's Liquidsoap process whenever it needs the next file.
 *  Runs inside db.transaction(), which serializes against any other transaction() call the
 *  same way Postgres's FOR UPDATE SKIP LOCKED did — SQLite has no per-row locking, but a
 *  whole-transaction lock is enough here since each row is only ever claimed once. */
async function popNext(channelId) {
  return db.transaction(async () => {
    const { rows } = await db.query(
      `SELECT cs.id, cs.media_file_id, COALESCE(mf.proxy_path, mf.absolute_path) AS play_path, mf.title
       FROM channel_schedule cs
       JOIN media_files mf ON mf.id = cs.media_file_id
       WHERE cs.channel_id = $1 AND cs.served = 0
       ORDER BY cs.sort_order ASC
       LIMIT 1`,
      [channelId]
    );
    const row = rows[0];
    if (!row) return null;
    await db.query('UPDATE channel_schedule SET served = 1 WHERE id = $1', [row.id]);
    return { path: row.play_path, title: row.title };
  });
}

module.exports = { popNext };
