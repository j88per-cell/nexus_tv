const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const config = require('./config');

fs.mkdirSync(path.dirname(config.sqlitePath), { recursive: true });

const db = new sqlite3.Database(config.sqlitePath);
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA synchronous = NORMAL');
db.run('PRAGMA foreign_keys = ON');

// Postgres-style $1, $2, ... placeholders map directly onto SQLite's ?1, ?2, ... indexed
// parameters, so query text written for pg mostly Just Works once this substitution runs.
function toSqliteSql(text) {
  return text.replace(/\$(\d+)/g, '?$1');
}

// node-sqlite3 only accepts numbers/strings/buffers/null as bind values — notably, unlike
// node-postgres, it throws on `undefined` (routes routinely pass that for an omitted PATCH
// field, relying on it binding like NULL).
function toSqliteParams(params) {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p instanceof Date) return p.toISOString();
    return p;
  });
}

// db.run()'s callback only reports changes/lastID, not result rows — anything that can
// produce a row set (SELECT, or an INSERT/UPDATE/DELETE with RETURNING) has to go through
// db.all() instead.
function producesRows(sql) {
  return /^\s*(select|with|pragma)\b/i.test(sql) || /\breturning\b/i.test(sql);
}

function query(text, params = []) {
  const sql = toSqliteSql(text);
  const bound = toSqliteParams(params);
  return new Promise((resolve, reject) => {
    if (producesRows(sql)) {
      db.all(sql, bound, (err, rows) => {
        if (err) return reject(err);
        resolve({ rows, rowCount: rows.length });
      });
    } else {
      db.run(sql, bound, function runCallback(err) {
        if (err) return reject(err);
        resolve({ rows: [], rowCount: this.changes });
      });
    }
  });
}

// sqlite3's single connection means only one writer can be mid-transaction at a time, but
// nothing stops two concurrent async request handlers from interleaving their own BEGIN/COMMIT
// calls against it. This queue serializes transaction() calls (not plain query() calls) so
// each one's BEGIN...COMMIT/ROLLBACK runs to completion before the next one starts, playing
// the same role Postgres's row locks did for the code paths that need atomicity (e.g. popping
// a schedule row exactly once).
let queue = Promise.resolve();

function transaction(fn) {
  const task = queue.then(() => runTransaction(fn), () => runTransaction(fn));
  queue = task.catch(() => {});
  return task;
}

function runTransaction(fn) {
  return new Promise((resolve, reject) => {
    db.run('BEGIN', async (beginErr) => {
      if (beginErr) return reject(beginErr);
      let result;
      try {
        result = await fn();
      } catch (err) {
        return db.run('ROLLBACK', () => reject(err));
      }
      db.run('COMMIT', (commitErr) => {
        if (commitErr) return reject(commitErr);
        resolve(result);
      });
    });
  });
}

module.exports = {
  raw: db,
  query,
  transaction,
};
