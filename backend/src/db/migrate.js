const fs = require('fs');
const path = require('path');
const db = require('../db');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.raw.exec(schema);
console.log(`Schema applied to ${require('../config').sqlitePath}`);
