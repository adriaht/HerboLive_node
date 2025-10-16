// import-csv.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./lib/db');
const PlantsModel = require('./lib/models/plants')(db);

// Intentar cargar un parser sync compatible (v5 -> 'csv-parse/sync', v4 -> 'csv-parse/lib/sync')
let parseSync = null;
try {
  // v5 style
  ({ parse: parseSync } = require('csv-parse/sync'));
} catch (e1) {
  try {
    // v4 style
    parseSync = require('csv-parse/lib/sync');
  } catch (e2) {
    parseSync = null;
  }
}

function robustParseCsv(csvText, maxRows = Infinity) {
  // simple but robust line-by-line parser with quote handling (works for many malformed CSVs)
  let text = String(csvText).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\uFEFF/, '');
  const lines = text.split('\n').filter(l => l.trim() !== '');
  if (lines.length === 0) return [];

  // detect separator by header heuristics
  const headerLine = lines.shift();
  const sepCandidates = [',',';','\t'];
  let sep = ',';
  let maxCount = -1;
  for (const c of sepCandidates) {
    const count = (headerLine.split(c).length);
    if (count > maxCount) { maxCount = count; sep = c; }
  }

  const header = parseCsvLine(headerLine, sep).map(h => h.trim());
  const out = [];
  for (let i = 0; i < lines.length && out.length < maxRows; i++) {
    const line = lines[i];
    if (!line || line.trim() === '') continue;
    const cols = parseCsvLine(line, sep);
    // merge extra columns into last if more fields than header
    let rowCols = cols;
    if (cols.length > header.length) {
      const merged = [];
      for (let k = 0; k < header.length - 1; k++) merged.push(cols[k]);
      merged.push(cols.slice(header.length - 1).join(sep));
      rowCols = merged;
    } else {
      while (rowCols.length < header.length) rowCols.push('');
    }
    const obj = {};
    for (let j = 0; j < header.length; j++) {
      const key = header[j] ? header[j].toString().trim() : `col${j}`;
      obj[key] = rowCols[j] !== undefined ? rowCols[j] : '';
    }
    out.push(obj);
  }
  return out;
}

// parseCsvLine con soporte de comillas dobles y escapes ""
function parseCsvLine(line, sep) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i+1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === sep) {
        fields.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  fields.push(cur);
  return fields.map(f => f.trim());
}

function parseCsvWithFallback(csvText, opts = {}) {
  const maxRows = opts.maxRows || Infinity;
  if (parseSync) {
    try {
      // usar csv-parse si está disponible
      const records = parseSync(csvText, Object.assign({
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        relax_quotes: true,
        trim: true
      }, opts));
      return Array.isArray(records) ? records.slice(0, maxRows) : [];
    } catch (e) {
      console.warn('csv-parse falló, usando fallback robusto:', e && e.message ? e.message : e);
      return robustParseCsv(csvText, maxRows);
    }
  } else {
    // fallback propio
    return robustParseCsv(csvText, maxRows);
  }
}

// Normalizar registros al esquema que espera tu app (snake_case / campos del CSV)
function mapRecordToPlant(r) {
  const get = (o, keys) => {
    for (const k of keys) {
      if (o[k] !== undefined) return o[k];
      const lower = k.toLowerCase();
      // also try lowercase keys
      for (const ok of Object.keys(o)) {
        if (ok.toLowerCase() === lower) return o[ok];
      }
    }
    return '';
  };

  const poll = (v) => {
    if (!v && v !== 0) return [];
    const s = String(v).trim();
    if (!s) return [];
    if (s.startsWith('[') && s.endsWith(']')) {
      try { return JSON.parse(s.replace(/'/g, '"')); } catch(e) {
        const inner = s.slice(1,-1); return inner.split(',').map(x => x.replace(/^["']|["']$/g,'').trim()).filter(Boolean);
      }
    }
    if (s.includes(',')) return s.split(',').map(x => x.trim()).filter(Boolean);
    if (s.includes(';')) return s.split(';').map(x => x.trim()).filter(Boolean);
    return [s];
  };

  const mapped = {
    Family: get(r, ['Family','family']),
    Genus: get(r, ['Genus','genus']),
    Species: get(r, ['Species','species']),
    CommonName: get(r, ['CommonName','Common Name','common_name','commonname','Common']),
    GrowthRate: get(r, ['GrowthRate','growth_rate','growthrate']),
    HardinessZones: get(r, ['HardinessZones','hardiness_zones']),
    Height: get(r, ['Height','height']),
    Width: get(r, ['Width','width']),
    Type: get(r, ['Type','type']),
    Foliage: get(r, ['Foliage','foliage']),
    Pollinators: poll(get(r, ['Pollinators','pollinators'])),
    Leaf: get(r, ['Leaf','leaf']),
    Flower: get(r, ['Flower','flower']),
    Ripen: get(r, ['Ripen','ripen']),
    Reproduction: get(r, ['Reproduction','reproduction']),
    Soils: get(r, ['Soils','soils']),
    pH: get(r, ['pH','Ph','p_h']),
    pH_split: get(r, ['pH_split','p_h_split']),
    Preferences: get(r, ['Preferences','preferences']),
    Tolerances: get(r, ['Tolerances','tolerances']),
    Habitat: get(r, ['Habitat','habitat']),
    HabitatRange: get(r, ['HabitatRange','habitat_range','habitatrange']),
    Edibility: get(r, ['Edibility','edibility']),
    Medicinal: get(r, ['Medicinal','medicinal','Medicinal_Uses','Medicinal Uses']),
    OtherUses: get(r, ['OtherUses','other_uses','Other Uses']),
    PFAF: get(r, ['PFAF','pfaf']),
    ImageURL: get(r, ['Image URL','Image','image_url','image'])
  };

  return mapped;
}

// MAIN
(async function main(){
  try {
    const csvPath = path.resolve(process.env.LOCAL_CSV_PATH || path.join(__dirname, '../www/data/plant_data.csv'));
    console.log(`Leyendo CSV desde ${csvPath}`);
    const csvData = fs.readFileSync(csvPath, 'utf8');

    const maxRows = parseInt(process.env.CSV_MAX_READ || '99999', 10);
    const records = parseCsvWithFallback(csvData, { maxRows });

    console.log(`Filas parseadas: ${records.length}`);

    const plants = records.map(r => mapRecordToPlant(r));

    console.log('Insertando/actualizando plantas en DB...');
    await PlantsModel.upsertMany(plants);

    console.log('✅ Importación completada');
    process.exit(0);
  } catch (err) {
    console.error('Import error', err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
