require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 2,
      connectTimeout: 5000
    });

    const conn = await pool.getConnection();
    const [rows] = await conn.query('SELECT NOW() as now; SELECT DATABASE() as dbname;');
    console.log('Connected OK. Now:', rows[0] ? rows[0].now : rows);
    conn.release();
    await pool.end();
    process.exit(0);
  } catch (e) {
    console.error('DB connect error:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
