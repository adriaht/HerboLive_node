// lib/db.js
require('dotenv').config();
const mysql = require('mysql2');

// Lee credenciales desde .env
const host = process.env.DB_HOST || 'localhost';
const port = parseInt(process.env.DB_PORT || '3306', 10);
const user = process.env.DB_USER || process.env.DB_USERNAME || '';
const password = process.env.DB_PASSWORD || process.env.DB_PASS || '';
const database = process.env.DB_NAME || process.env.DB_DATABASE || 'herbolive';

if (!user || !database) {
  console.warn('Warning: DB user or DB name not set in environment variables');
}

let pool;
try {
  pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  const promisePool = pool.promise();

  module.exports = {
    rawPool: pool,
    promise: () => promisePool,
    query: async function (sql, params) {
      try {
        const [rows] = await promisePool.query(sql, params);
        return rows;
      } catch (err) {
        throw err;
      }
    },
    getConnection: async () => await promisePool.getConnection()
  };

} catch (err) {
  console.error('Error creando pool MySQL:', err);
  throw err;
}
