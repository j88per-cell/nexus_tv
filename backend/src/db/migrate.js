const fs = require('fs');
const path = require('path');
const db = require('../db');
const config = require('../config');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.raw.exec(schema, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Schema applied to ${config.sqlitePath}`);
  process.exit(0);
});
