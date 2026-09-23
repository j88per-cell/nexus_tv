const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');

fs.mkdirSync(path.dirname(config.sqlitePath), { recursive: true });

const db = new Database(config.sqlitePath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// Postgres-style $1, $2, ... placeholders map directly onto SQLite's ?1, ?2, ... indexed
// parameters, so query text written for pg mostly Just Works once this substitution runs.
function toSqliteSql(text) {
  return text.replace(/\$(\d+)/g, '?$1');
}

// better-sqlite3 only accepts numbers/bigints/strings/buffers/null as bind values — notably,
// unlike node-postgres, it throws on `undefined` (routes routinely pass that for an omitted
// PATCH field, relying on it binding like NULL).
function toSqliteParams(params) {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p instanceof Date) return p.toISOString();
    return p;
  });
}

function run(text, params = []) {
  const stmt = db.prepare(toSqliteSql(text));
  const bound = toSqliteParams(params);
  if (stmt.reader) {
    const rows = stmt.all(...bound);
    return { rows, rowCount: rows.length };
  }
  const info = stmt.run(...bound);
  return { rows: [], rowCount: info.changes };
}

module.exports = {
  raw: db,
  query: (text, params) => Promise.resolve(run(text, params)),
  // Synchronous query helper for use inside transaction() callbacks, which must not await.
  querySync: run,
  // Runs fn (synchronous, using querySync) atomically; rolls back automatically on throw.
  transaction: (fn) => db.transaction(fn)(),
};
