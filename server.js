// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors()); // en producción restringir origin
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const config = {
  port: process.env.PORT || 3000,
  useDbFirst: String(process.env.USE_DB_FIRST || 'true') === 'true',
  trefleToken: process.env.TREFLE_TOKEN || '',
  perenualKey: process.env.PERENUAL_KEY || '',
  localCsvPath: process.env.LOCAL_CSV_PATH || path.join(__dirname, '../www/data/plant_data.csv'),
  csvMaxRead: parseInt(process.env.CSV_MAX_READ || '52', 10)
};

// DB pool and models
const db = require('./lib/db');
const PlantsModel = require('./lib/models/plants')(db);

// External helpers
const External = require('./lib/external')(config);

// Routes
const plantsRouter = require('./routes/plants')(config, PlantsModel, External);
app.use('/api/plants', plantsRouter);

app.get('/health', (req, res) => {
  res.json({ ok: true, mode: config.useDbFirst ? 'db-first' : 'api-first' });
});

app.listen(config.port, () => {
  console.log(`HerboLive backend listening on port ${config.port} (DB-first=${config.useDbFirst})`);
});
