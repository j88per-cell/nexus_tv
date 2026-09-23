const db = require('../db');

async function listFailures() {
  const { rows } = await db.query(
    `SELECT id, absolute_path, proxy_failed_at, proxy_last_error
     FROM media_files WHERE proxy_failed_at IS NOT NULL ORDER BY proxy_failed_at DESC`
  );
  return rows;
}

// Clears proxy_failed_at so the file is picked up by the normal nightly batch again.
// Use after fixing the underlying issue (e.g. hand-encoding it, or freeing disk space).
async function retryFailure(id) {
  const { rowCount } = await db.query(
    'UPDATE media_files SET proxy_failed_at = NULL, proxy_last_error = NULL WHERE id = $1',
    [id]
  );
  return rowCount > 0;
}

async function retryAllFailures() {
  const { rowCount } = await db.query(
    'UPDATE media_files SET proxy_failed_at = NULL, proxy_last_error = NULL WHERE proxy_failed_at IS NOT NULL'
  );
  return rowCount;
}

module.exports = { listFailures, retryFailure, retryAllFailures };
