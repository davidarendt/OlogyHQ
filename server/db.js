const { Pool, types } = require('pg');
require('dotenv').config();

// Return DATE columns as plain 'YYYY-MM-DD' strings instead of JS Date objects.
// Without this, pg serializes DATE → JS Date → JSON ISO timestamp (e.g. '2026-04-01T00:00:00.000Z'),
// which breaks any client code that appends 'T12:00:00' for date math.
types.setTypeParser(1082, val => val);

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      }
);

module.exports = pool;
