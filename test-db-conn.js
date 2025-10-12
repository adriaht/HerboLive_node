// test-db-conn.js
const db = require('./lib/db');

async function test() {
  try {
    console.log('Probando conexión a MySQL...');
    // usa db.query que definimos en lib/db.js
    const rows = await db.query('SELECT 1 AS ok');
    console.log('Resultado:', rows);
    // también mostrar conteo de tabla plants si existe
    try {
      const c = await db.query('SELECT COUNT(*) as cnt FROM plants');
      console.log('plants count:', c[0] ? c[0].cnt : c);
    } catch (e) {
      console.warn('No se pudo consultar tabla plants (¿existe?):', e.message);
    }
    process.exit(0);
  } catch (err) {
    console.error('Error de conexión DB:', err.message || err);
    process.exit(1);
  }
}

test();
