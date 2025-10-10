require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const db = require('./lib/db');
const PlantsModel = require('./lib/models/plants')(db);

async function main() {
  try {
    const csvPath = path.resolve(__dirname, process.env.LOCAL_CSV_PATH || '../www/data/plant_data.csv');
    console.log(`Leyendo CSV desde ${csvPath}`);

    const csvData = fs.readFileSync(csvPath, 'utf-8');

    const records = parse(csvData, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      trim: true
    });

    console.log(`Filas parseadas: ${records.length}`);

    // Normalizar nombres de campos para coincidir con la tabla
    const plants = records.map(r => ({
      Family: r.Family || null,
      Genus: r.Genus || null,
      Species: r.Species || null,
      CommonName: r.CommonName || null,
      GrowthRate: r.GrowthRate || null,
      HardinessZones: r.HardinessZones || null,
      Height: r.Height || null,
      Width: r.Width || null,
      Type: r.Type || null,
      Foliage: r.Foliage || null,
      Pollinators: r.Pollinators ? r.Pollinators.replace(/\[|\]|'/g, '').split(',').map(s => s.trim()) : [],
      Leaf: r.Leaf || null,
      Flower: r.Flower || null,
      Ripen: r.Ripen || null,
      Reproduction: r.Reproduction || null,
      Soils: r.Soils || null,
      pH: r.pH || null,
      pH_split: r.pH_split || null,
      Preferences: r.Preferences || null,
      Tolerances: r.Tolerances || null,
      Habitat: r.Habitat || null,
      HabitatRange: r.HabitatRange || null,
      Edibility: r.Edibility || null,
      Medicinal: r.Medicinal || null,
      OtherUses: r.OtherUses || null,
      PFAF: r.PFAF || null,
      ImageURL: r['Image URL'] || null
    }));

    console.log('Insertando/actualizando plantas en DB...');
    await PlantsModel.upsertMany(plants);

    console.log('✅ Importación completada');
    process.exit(0);

  } catch (err) {
    console.error('Import error', err);
    process.exit(1);
  }
}

main();
