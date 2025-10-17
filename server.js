// server.js (reemplaza el existente por completo)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors()); // en producción restringir origin
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  useDbFirst: (function(){
    const v = process.env.USE_DB_FIRST || process.env.USEDBFIRST || process.env.USE_BACKEND;
    if (typeof v === 'undefined') return true;
    return String(v).toLowerCase() === 'true';
  })(),
  trefleToken: process.env.TREFLE_TOKEN || '',
  perenualKey: process.env.PERENUAL_KEY || '',
  localCsvPath: process.env.LOCAL_CSV_PATH || path.join(__dirname, '../www/data/plant_data.csv'),
  csvMaxRead: parseInt(process.env.CSV_MAX_READ || '52', 10)
};

// logs de arranque
console.log('Config cargada:', {
  port: config.port,
  host: config.host,
  useDbFirst: config.useDbFirst,
  localCsvPath: config.localCsvPath,
  csvMaxRead: config.csvMaxRead
});

// DB pool and models
const db = require('./lib/db');
const PlantsModel = require('./lib/models/plants')(db);

// External helpers
const External = require('./lib/external')(config);



const apiRouter = require('./routes/api')(config, PlantsModel, External, db);
app.use('/api', apiRouter);


// Routes
const plantsRouter = require('./routes/plants')(config, PlantsModel, External);
app.use('/api/plants', plantsRouter);


// Exponer endpoint de config (útil para frontend para saber preferencia)
app.get('/api/config', (req, res) => {
  res.json({
    ok: true,
    useDbFirst: config.useDbFirst
  });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, mode: config.useDbFirst ? 'db-first' : 'api-first' });
});

// error handler middleware para capturar problemas no manejados
app.use((err, req, res, next) => {
  console.error('Unhandled err:', err && err.stack ? err.stack : err);
  res.status(500).json({ error: 'Internal Server Error', detail: String(err) });
});

// arrancar
const server = app.listen(config.port, config.host, () => {
  console.log(`HerboLive backend listening on http://${config.host}:${config.port} (DB-first=${config.useDbFirst})`);
});

server.on('error', (err) => {
  console.error('Server error:', err && err.message ? err.message : err);
  process.exit(1);
});

// manejo de señales para apagar limpio
process.on('SIGINT', () => {
  console.log('SIGINT received — closing server');
  server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  console.log('SIGTERM received — closing server');
  server.close(() => process.exit(0));
});
