// import-csv.js
require('dotenv').config();
const path = require('path');
const ExternalFactory = require('./lib/external');
const db = require('./lib/db');
const PlantsModelFactory = require('./lib/models/plants');

(async function main() {
  try {
    const config = {
      localCsvPath: process.env.LOCAL_CSV_PATH || path.join(__dirname, '../www/data/plant_data.csv'),
      csvMaxRead: parseInt(process.env.CSV_MAX_READ || '52', 10)
    };

    const External = ExternalFactory(config);
    const PlantsModel = PlantsModelFactory(db);

    console.log('Leyendo CSV desde', config.localCsvPath);
    const csvData = await External.readCsvLocal(config.csvMaxRead);
    console.log(`Filas parseadas: ${csvData.length}`);

    if (!csvData || csvData.length === 0) {
      console.log('No hay filas válidas para importar.');
      process.exit(0);
    }

    console.log('Insertando/actualizando registros en la DB...');
    await PlantsModel.upsertMany(csvData);
    console.log('Importación completada:', csvData.length, 'registros.');
    process.exit(0);
  } catch (e) {
    console.error('Import error', e);
    process.exit(1);
  }
})();

