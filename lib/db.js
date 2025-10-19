// lib/db.js
'use strict';
require('dotenv').config();
const mysql = require('mysql2');

const host = process.env.DB_HOST || 'localhost';
const port = parseInt(process.env.DB_PORT || '3306', 10);
const user = process.env.DB_USER || process.env.DB_USERNAME || '';
const password = process.env.DB_PASSWORD || process.env.DB_PASS || '';
const database = process.env.DB_NAME || process.env.DB_DATABASE || '';

if (!user || !database) {
  console.warn('DB WARNING: faltan credenciales DB en el entorno (DB_USER, DB_PASSWORD, DB_NAME). Revisa .env');
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
    queueLimit: 0,
    // opcional: ajusta según tu servidor
    timezone: '+00:00',
    connectTimeout: 10000
  });

  const promisePool = pool.promise();

  // Exports compatibles con el resto del código:
  // - db.query(...) devuelve la promesa de [rows, fields]
  // - db.promise() devuelve el promisePool (compatibilidad)
  // - db.getConnection() para transacciones
  module.exports = {
    rawPool: pool,
    promise: () => promisePool,
    query: (...args) => promisePool.query(...args),
    getConnection: () => promisePool.getConnection()
  };

} catch (err) {
  console.error('Error creando pool MySQL:', err && err.message ? err.message : err);
  throw err;
}
