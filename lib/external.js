// Reemplaza la función readCsvLocal en herbolive-backend/lib/external.js por esta versión.

const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');
const parse = require('csv-parse/sync').parse;

module.exports = function(config) {
  const API = {};

  // ... (otros métodos: fetchFromPerenual, fetchFromTrefle) ...

  API.readCsvLocal = async function(maxRows = config.csvMaxRead || 52) {
    try {
      const filePath = path.isAbsolute(config.localCsvPath) ? config.localCsvPath : path.join(process.cwd(), config.localCsvPath);
      const raw = await fs.readFile(filePath, 'utf8');

      // Primer intento: csv-parse tolerante (intentar primero, rápido)
      try {
        const records = parse(raw, {
          columns: true,
          skip_empty_lines: true,
          relax_column_count: true,
          relax_quotes: true,
          trim: true
        });
        // records es un array de objetos cuando columns:true
        const limited = records.slice(0, maxRows);
        return limited.map(rec => mapCsvRecordToPlant(rec));
      } catch (e) {
        // si csv-parse falla por inconsistencias, caer al fallback robusto
        console.warn('csv-parse falló, usando parser robusto fallback:', e && e.message ? e.message : e);
        const robust = robustParseCsv(raw, maxRows);
        return robust.map(rec => mapCsvRecordToPlant(rec));
      }
    } catch (err) {
      console.error('readCsvLocal error', err);
      return [];
    }
  };

  // -------------------------------------------------------
  // Helpers internos
  // -------------------------------------------------------
  function mapCsvRecordToPlant(r) {
    // r puede venir con claves con espacios o distintas capitalizaciones
    const get = (o, keys) => {
      for (const k of keys) {
        if (o[k] !== undefined) return o[k];
      }
      return '';
    };

    const mapped = {
      family: get(r, ['Family','family']),
      genus: get(r, ['Genus','genus']),
      species: get(r, ['Species','species']),
      scientific_name: get(r, ['ScientificName','Scientific Name','scientificname','scientific_name']) || ((get(r,['Genus'])||'') + ' ' + (get(r,['Species'])||'')).trim(),
      common_name: get(r, ['CommonName','Common Name','commonname','common_name','Common']),
      growth_rate: get(r, ['GrowthRate','growthrate','Growth Rate','growth_rate']),
      hardiness_zones: get(r, ['HardinessZones','hardiness_zones']),
      height: get(r, ['Height','height']),
      width: get(r, ['Width','width']),
      type: get(r, ['Type','type']),
      foliage: get(r, ['Foliage','foliage']),
      pollinators: parseMaybeList(get(r, ['Pollinators','pollinators'])),
      leaf: get(r, ['Leaf','leaf']),
      flower: get(r, ['Flower','flower']),
      ripen: get(r, ['Ripen','ripen']),
      reproduction: get(r, ['Reproduction','reproduction']),
      soils: get(r, ['Soils','soils']),
      pH: get(r, ['pH','Ph','p_h']),
      pH_split: get(r, ['pH_split','p_h_split']),
      preferences: get(r, ['Preferences','preferences']),
      tolerances: get(r, ['Tolerances','tolerances']),
      habitat: get(r, ['Habitat','habitat']),
      habitat_range: get(r, ['HabitatRange','habitatrange','habitat_range']),
      edibility: get(r, ['Edibility','edibility']),
      medicinal: get(r, ['Medicinal','medicinal','Medicinal_Uses','Medicinal Uses','MedicinalUses','Medicinal']),
      other_uses: get(r, ['OtherUses','other_uses','Other_Uses','Other Uses']),
      pfaf: get(r, ['PFAF','pfaf']),
      image_url: get(r, ['Image URL','Image','image_url','image'])
    };
    mapped.images = mapped.image_url ? [mapped.image_url] : [];
    mapped.source = 'csv';
    return mapped;
  }

  function parseMaybeList(value) {
    if (!value && value !== 0) return [];
    const s = String(value).trim();
    // si ya parece un array en forma de string: ['A','B']
    if (s.startsWith('[') && s.endsWith(']')) {
      try {
        return JSON.parse(s.replace(/'/g, '"'));
      } catch (e) {
        const inner = s.slice(1,-1);
        return inner.split(',').map(x => x.replace(/^["']|["']$/g,'').trim()).filter(Boolean);
      }
    }
    // separadores comunes
    if (s.includes(',')) return s.split(',').map(x => x.trim()).filter(Boolean);
    if (s.includes(';')) return s.split(';').map(x => x.trim()).filter(Boolean);
    return s ? [s] : [];
  }

  // robustParseCsv: parser línea a línea con manejo de comillas
  function robustParseCsv(csvText, maxRows = Infinity) {
    // normalize endings
    let text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\uFEFF/, '');
    const lines = text.split('\n');

    if (lines.length === 0) return [];

    // detect separator by looking at header
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
      // if row has more fields than header, merge extra into the last field
      if (cols.length > header.length) {
        const merged = [];
        for (let k = 0; k < header.length - 1; k++) merged.push(cols[k]);
        const tail = cols.slice(header.length - 1).join(sep);
        merged.push(tail);
        // pad if shorter
        while (merged.length < header.length) merged.push('');
        mapRowToObjectAndPush(header, merged, out);
      } else {
        // if fewer fields, pad with empty strings
        while (cols.length < header.length) cols.push('');
        mapRowToObjectAndPush(header, cols, out);
      }
    }

    return out;
  }

  function mapRowToObjectAndPush(header, cols, outputArr) {
    const obj = {};
    for (let i = 0; i < header.length; i++) {
      const key = header[i] ? header[i].toString().trim() : `col${i}`;
      obj[key] = cols[i] !== undefined ? cols[i] : '';
    }
    outputArr.push(obj);
  }

  // parseCsvLine: parsea una línea con soporte para comillas dobles "..." y comillas escapadas ""
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

  // -------------------------------------------------------
  // Fin módulo
  // -------------------------------------------------------
  // (otros métodos: normalizePerenual, normalizeTrefle...)
  // Asegúrate de conservar el resto del objeto API (fetchFromPerenual, fetchFromTrefle)
  return API;
};
