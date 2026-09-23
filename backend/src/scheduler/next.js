const db = require('../db');

/** Pops the next not-yet-served schedule row for a channel and marks it served.
 *  Called by each channel's Liquidsoap process whenever it needs the next file. */
async function popNext(channelId) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT cs.id, cs.media_file_id, COALESCE(mf.proxy_path, mf.absolute_path) AS play_path, mf.title
       FROM channel_schedule cs
       JOIN media_files mf ON mf.id = cs.media_file_id
       WHERE cs.channel_id = $1 AND cs.served = false
       ORDER BY cs.sort_order ASC
       LIMIT 1
       FOR UPDATE OF cs SKIP LOCKED`,
      [channelId]
    );
    const row = rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query('UPDATE channel_schedule SET served = true WHERE id = $1', [row.id]);
    await client.query('COMMIT');
    return { path: row.play_path, title: row.title };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { popNext };
