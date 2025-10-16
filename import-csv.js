// import-csv.js (versión segura para import y saneamiento JSON)
// Sustituye el archivo actual por completo con este.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./lib/db');
const PlantsModel = require('./lib/models/plants')(db);

// Intentar cargar parser sync (v5 -> 'csv-parse/sync', v4 -> 'csv-parse/lib/sync')
let parseSync = null;
try {
  ({ parse: parseSync } = require('csv-parse/sync'));
} catch (e1) {
  try {
    parseSync = require('csv-parse/lib/sync');
  } catch (e2) {
    parseSync = null;
  }
}

// Fallback robusto (ya lo tenías)
function robustParseCsv(csvText, maxRows = Infinity) {
  let text = String(csvText).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\uFEFF/, '');
  const lines = text.split('\n').filter(l => l.trim() !== '');
  if (!lines.length) return [];

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
    return robustParseCsv(csvText, maxRows);
  }
}

// Mapper del CSV a objeto intermedio (con claves tal cual del CSV)
function mapRecordToPlant(r) {
  const get = (o, keys) => {
    for (const k of keys) {
      if (o[k] !== undefined && o[k] !== null) return o[k];
      // buscar key case-insensitive
      for (const ok of Object.keys(o)) {
        if (ok.toLowerCase() === String(k).toLowerCase() && o[ok] !== undefined) return o[ok];
      }
    }
    return '';
  };

  const parseMaybeList = (value) => {
    if (value === undefined || value === null) return [];
    const s = String(value).trim();
    if (!s) return [];
    if (s.startsWith('[') && s.endsWith(']')) {
      try { return JSON.parse(s.replace(/'/g, '"')); } catch (e) {/* fallthrough */ }
    }
    if (s.includes(',')) return s.split(',').map(x => x.trim()).filter(Boolean);
    if (s.includes(';')) return s.split(';').map(x => x.trim()).filter(Boolean);
    return [s];
  };

  return {
    Family: get(r, ['Family','family']),
    Genus: get(r, ['Genus','genus']),
    Species: get(r, ['Species','species']),
    ScientificName: (get(r, ['ScientificName','Scientific Name','scientific_name']) || ((get(r,['Genus'])||'') + ' ' + (get(r,['Species'])||'')).trim()),
    CommonName: get(r, ['CommonName','Common Name','common_name','commonname','Common']),
    GrowthRate: get(r, ['GrowthRate','growth_rate','growthrate']),
    HardinessZones: get(r, ['HardinessZones','hardiness_zones']),
    Height: get(r, ['Height','height']),
    Width: get(r, ['Width','width']),
    Type: get(r, ['Type','type']),
    Foliage: get(r, ['Foliage','foliage']),
    Pollinators: parseMaybeList(get(r, ['Pollinators','pollinators'])),
    Leaf: get(r, ['Leaf','leaf']),
    Flower: get(r, ['Flower','flower']),
    Ripen: get(r, ['Ripen','ripen']),
    Reproduction: get(r, ['Reproduction','reproduction']),
    Soils: parseMaybeList(get(r, ['Soils','soils'])),
    pH: get(r, ['pH','Ph','p_h']),
    pH_split: parseMaybeList(get(r, ['pH_split','p_h_split'])),
    Preferences: get(r, ['Preferences','preferences']),
    Tolerances: get(r, ['Tolerances','tolerances']),
    Habitat: get(r, ['Habitat','habitat']),
    HabitatRange: get(r, ['HabitatRange','habitatrange','habitat_range']),
    Edibility: get(r, ['Edibility','edibility']),
    Medicinal: get(r, ['Medicinal','medicinal','Medicinal_Uses','Medicinal Uses']),
    OtherUses: get(r, ['OtherUses','other_uses','Other Uses']),
    PFAF: get(r, ['PFAF','pfaf']),
    ImageURL: get(r, ['Image URL','Image','image_url','image'])
  };
}

// SANEAMIENTO: asegurar campos JSON válidos o NULL
function ensureJsonArrayField(obj, key) {
  const raw = obj[key];
  if (raw === undefined || raw === null) { obj[key] = null; return; }
  if (Array.isArray(raw)) {
    // eliminar elementos vacíos y valores inválidos
    const cleaned = raw.map(x => String(x).trim()).filter(x => x && x.toLowerCase() !== 'invalid value.' && x.toLowerCase() !== 'invalid');
    obj[key] = cleaned.length ? JSON.stringify(cleaned) : null;
    return;
  }
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s || s.toLowerCase() === 'invalid value.' || s.toLowerCase() === 'invalid') { obj[key] = null; return; }
    if (s.startsWith('[') || s.startsWith('{')) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) { obj[key] = JSON.stringify(parsed.filter(x=>x)); return; }
        // if object -> stringify as-is
        obj[key] = JSON.stringify(parsed);
        return;
      } catch (e) {
        // fallthrough
      }
    }
    // otherwise convert scalar to array
    obj[key] = JSON.stringify([s]);
    return;
  }
  // other types (number etc.)
  try {
    obj[key] = JSON.stringify([raw]);
  } catch (e) {
    obj[key] = null;
  }
}

function sanitizeRecordForDb(rec) {
  // campos que queremos almacenar como JSON (si existen)
  const jsonFields = ['Pollinators','Soils','pH_split','Images','OtherUses','Preferences','Tolerances'];
  const out = Object.assign({}, rec);
  // rename ImageURL -> image_url for compatibility (si tu modelo espera otro nombre ajusta)
  if (out.ImageURL && !out.image_url) out.image_url = out.ImageURL;
  // ensure JSON fields
  for (const k of jsonFields) {
    if (out[k] !== undefined) ensureJsonArrayField(out, k);
  }
  // ensure images key exists as JSON array if present as string
  if (out.image_url && !out.Images && !out.images) {
    out.images = [out.image_url];
  }
  if (out.images && Array.isArray(out.images)) {
    try { out.images = JSON.stringify(out.images.map(x=>String(x).trim()).filter(Boolean)); } catch(e) { out.images = null; }
  } else if (typeof out.images === 'string') {
    // try to parse or convert to single-element array
    const s = out.images.trim();
    if (s.startsWith('[')) {
      try { JSON.parse(s); out.images = s; } catch(e) { out.images = JSON.stringify([s]); }
    } else {
      out.images = JSON.stringify([s]);
    }
  } else {
    out.images = null;
  }
  return out;
}

// Inserción en DB por lotes con fallback por fila (para identificar filas problemáticas)
async function upsertInBatches(plants, batchSize = 500) {
  for (let i = 0; i < plants.length; i += batchSize) {
    const chunk = plants.slice(i, i + batchSize);
    try {
      await PlantsModel.upsertMany(chunk);
      console.log(`Lote ${i}-${i+chunk.length-1} insertado OK`);
    } catch (err) {
      console.error(`Error en lote ${i}-${i+chunk.length-1}:`, err && err.message ? err.message : err);
      // intentar uno a uno para localizar filas problemáticas
      for (let j = 0; j < chunk.length; j++) {
        const single = [chunk[j]];
        try {
          await PlantsModel.upsertMany(single);
        } catch (e) {
          console.error(`  -> Error en fila index global ${i+j} (registro problemático):`, e && e.message ? e.message : e);
          // dump a un archivo para inspección
          try {
            const dumpPath = path.join(process.cwd(), `failed_row_${i+j}.json`);
            fs.writeFileSync(dumpPath, JSON.stringify(chunk[j], null, 2), 'utf8');
            console.error(`     Registro guardado en ${dumpPath}`);
          } catch (werr) {
            console.error('     Error guardando registro problemático:', werr);
          }
        }
      }
    }
  }
}

(async function main(){
  try {
    const csvPath = path.resolve(process.env.LOCAL_CSV_PATH || path.join(__dirname, '../www/data/plant_data.csv'));
    console.log(`Leyendo CSV desde ${csvPath}`);
    const csvData = fs.readFileSync(csvPath, 'utf8');
    const maxRows = parseInt(process.env.CSV_MAX_READ || '99999', 10);

    const records = parseCsvWithFallback(csvData, { maxRows });
    console.log(`Filas parseadas: ${records.length}`);

    const mapped = records.map(r => mapRecordToPlant(r));
    // aplicar saneamiento y convertir campos a JSON válidos
    const sanitized = mapped.map(m => sanitizeRecordForDb(m));

    console.log('Insertando/actualizando plantas en DB (con saneamiento) ...');
    await upsertInBatches(sanitized, 500);

    console.log('✅ Importación finalizada');
    process.exit(0);
  } catch (err) {
    console.error('Import error', err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
