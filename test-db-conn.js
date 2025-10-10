const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });
        
        console.log('✅ Conexión exitosa a MySQL');
        
        const [rows] = await connection.query('SELECT DATABASE() AS dbname;');
        console.log('Base de datos actual:', rows[0].dbname);
        
        await connection.end();
    } catch (err) {
        console.error('DB connect error:', err.message);
    }
})();
