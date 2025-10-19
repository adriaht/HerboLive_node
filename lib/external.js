// lib/external.js
'use strict';

const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

// intenta cargar el wiki helper (si existe)
let wikiHelper = null;
try {
  const wikiMod = require('./external_wikipedia');
  wikiHelper = wikiMod(process.env || {});
  console.log('external_wikipedia helper cargado');
} catch (e) {
  wikiHelper = null;
  console.warn('external_wikipedia not available:', e && e.message ? e.message : e);
}

// Intentar require de csv-parse/sync de forma segura
let parseSync = null;
try {
  const csvParseMod = require('csv-parse/sync');
  parseSync = csvParseMod && (csvParseMod.parse || csvParseMod);
} catch (e) {
  parseSync = null;
}

// -------------------------------------------------------
// Helpers CSV (mantengo la implementación robusta que tenías)
// -------------------------------------------------------
function parseCsvLine(line, sep) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
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
  return fields.map(f => (f === undefined || f === null) ? '' : String(f).trim());
}

function robustParseCsv(csvText, maxRows = Infinity) {
  let text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\uFEFF/, '');
  const lines = text.split('\n');
  if (lines.length === 0) return [];
  const headerLine = lines.shift();
  const sepCandidates = [',', ';', '\t'];
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
    if (cols.length > header.length) {
      const merged = [];
      for (let k = 0; k < header.length - 1; k++) merged.push(cols[k]);
      const tail = cols.slice(header.length - 1).join(sep);
      merged.push(tail);
      while (merged.length < header.length) merged.push('');
      mapRowToObjectAndPush(header, merged, out);
    } else {
      while (cols.length < header.length) cols.push('');
      mapRowToObjectAndPush(header, cols, out);
    }
  }
  return out;
}

function mapRowToObjectAndPush(header, cols, outputArr) {
  const obj = {};
  for (let i = 0; i < header.length; i++) {
    const key = (header[i] !== undefined && header[i] !== null) ? header[i].toString().trim() : `col${i}`;
    obj[key] = cols[i] !== undefined ? cols[i] : '';
  }
  outputArr.push(obj);
}

// -------------------------------------------------------
// Mapping CSV -> plant record (mantengo tu mapCsvRecordToPlant)
// -------------------------------------------------------
function parseMaybeList(value) {
  if (value === undefined || value === null || value === '') return [];
  const s = String(value).trim();
  if (s.startsWith('[') && s.endsWith(']')) {
    try { return JSON.parse(s.replace(/'/g, '"')); } catch (e) {
      const inner = s.slice(1, -1);
      return inner.split(',').map(x => x.replace(/^["']|["']$/g, '').trim()).filter(Boolean);
    }
  }
  if (s.includes(',')) return s.split(',').map(x => x.trim()).filter(Boolean);
  if (s.includes(';')) return s.split(';').map(x => x.trim()).filter(Boolean);
  if (s.includes('|')) return s.split('|').map(x => x.trim()).filter(Boolean);
  return s ? [s] : [];
}

function mapCsvRecordToPlant(r) {
  const get = (o, keys) => {
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined && o[k] !== null) return o[k];
    }
    return '';
  };

  const mapped = {
    family: get(r, ['Family','family','family ']) || '',
    genus: get(r, ['Genus','genus']) || '',
    species: get(r, ['Species','species']) || '',
    scientific_name: get(r, ['ScientificName','Scientific Name','scientificname','scientific_name']) || (((get(r,['Genus'])||'') + ' ' + (get(r,['Species'])||'')).trim()),
    common_name: get(r, ['CommonName','Common Name','commonname','common_name','Common']) || '',
    growth_rate: get(r, ['GrowthRate','growthrate','Growth Rate','growth_rate']) || '',
    hardiness_zones: get(r, ['HardinessZones','hardiness_zones','Hardiness Zones']) || '',
    height: get(r, ['Height','height']) || '',
    width: get(r, ['Width','width']) || '',
    type: get(r, ['Type','type']) || '',
    foliage: get(r, ['Foliage','foliage']) || '',
    pollinators: parseMaybeList(get(r, ['Pollinators','pollinators'])),
    leaf: get(r, ['Leaf','leaf']) || '',
    flower: get(r, ['Flower','flower']) || '',
    ripen: get(r, ['Ripen','ripen']) || '',
    reproduction: get(r, ['Reproduction','reproduction']) || '',
    soils: parseMaybeList(get(r, ['Soils','soils'])),
    pH: get(r, ['pH','Ph','p_h','PH']) || '',
    pH_split: parseMaybeList(get(r, ['pH_split','p_h_split','pH_split'])),
    preferences: parseMaybeList(get(r, ['Preferences','preferences'])),
    tolerances: parseMaybeList(get(r, ['Tolerances','tolerances'])),
    habitat: get(r, ['Habitat','habitat']) || '',
    habitat_range: get(r, ['HabitatRange','habitatrange','habitat_range']) || '',
    edibility: get(r, ['Edibility','edibility']) || '',
    medicinal: get(r, ['Medicinal','medicinal','Medicinal_Uses','Medicinal Uses','MedicinalUses']) || '',
    other_uses: get(r, ['OtherUses','other_uses','Other_Uses','Other Uses']) || '',
    pfaf: get(r, ['PFAF','pfaf']) || '',
    image_url: get(r, ['Image URL','Image','image_url','image','ImageURL']) || ''
  };
  mapped.images = mapped.image_url ? [mapped.image_url] : [];
  mapped.source = 'csv';
  return mapped;
}

// -------------------------------------------------------
// External API fetchers (Perenual, Trefle, Wikipedia)
// -------------------------------------------------------
module.exports = function(config = {}) {
  const API = {};

  const perenualKey = (config.PERENUAL_KEY || config.API_KEY_PERENUAL || process.env.PERENUAL_KEY || process.env.API_KEY_PERENUAL || '');
  const perenualBase = (config.API_BASE_URL || process.env.API_BASE_URL || 'https://perenual.com/api/species-list');

  const trefleToken = (config.TREFLE_TOKEN || process.env.TREFLE_TOKEN || '');
  const trefleBase = (config.TREFLE_BASE || process.env.TREFLE_BASE || 'https://trefle.io');

  // normalize external item to shape routes expects (both uppercase-like CSV keys and camel keys)
  function normalizeExt(raw = {}, sourceName = '') {
    const out = {};

    // description
    out.description = raw.description || raw.summary || raw.extract || raw.desc || raw.note || raw.notes || '';

    // images
    out.ImageURL = raw.image_url || raw.ImageURL || raw.image || raw.thumbnail || (raw.thumbnail && raw.thumbnail.source) || '';
    if (!out.ImageURL && raw.images && Array.isArray(raw.images) && raw.images.length) out.ImageURL = raw.images[0];

    // names
    out.Genus = raw.genus || raw.Genus || '';
    out.Species = raw.species || raw.Species || '';
    out.CommonName = raw.common_name || raw.CommonName || raw.common || raw.name || '';

    // soils/pollinators
    out.Soils = raw.soils || raw.Soils || raw.Soil || raw.soil || '';
    out.Pollinators = raw.pollinators || raw.Pollinators || '';

    // habitat
    out.Habitat = raw.habitat || raw.Habitat || raw.distribution || raw.distribution_text || '';
    out.HabitatRange = raw.habitat_range || raw.HabitatRange || raw.range || '';

    // PFAF / other uses
    out.PFAF = raw.pfaf || raw.PFAF || '';
    out.OtherUses = raw.other_uses || raw.OtherUses || raw.otherUses || '';

    // add source metadata
    out._source = sourceName || '';

    // also keep camelCase keys for convenience
    out.image_url = out.ImageURL;
    out.habitat = out.Habitat;
    out.habitat_range = out.HabitatRange;
    out.other_uses = out.OtherUses;

    return out;
  }

  // Perenual: buscar por keyword (mejor con 'keyword' param)
  API.fetchFromPerenual = async function(q) {
    if (!q || !perenualKey) return null;
    try {
      const url = `${perenualBase}?key=${encodeURIComponent(perenualKey)}&keyword=${encodeURIComponent(q)}&page=1&per_page=5`;
      const res = await fetch(url, { timeout: 10000 });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) console.warn('Perenual auth issue:', res.status);
        else console.warn('Perenual fetch non-ok:', res.status);
        return null;
      }
      const json = await res.json();
      const item = (json && json.data && json.data.length && json.data[0]) ? json.data[0] : null;
      if (!item) return null;
      const out = {
        description: item.description || item.summary || item.desc || '',
        image_url: item.image_url || (item.images && item.images[0]) || '',
        genus: item.genus || '',
        species: item.species || '',
        common_name: item.common_name || item.common || '',
        soils: item.soils || item.Soils || '',
        pollinators: item.pollinators || item.Pollinators || '',
        habitat: item.habitat || item.habitat_range || item.distribution || '',
        pfaf: item.pfaf || '',
        _raw: item
      };
      return normalizeExt(out, 'perenual');
    } catch (e) {
      console.warn('Perenual fetch error:', e && e.message ? e.message : e);
      return null;
    }
  };

  // Trefle: intentar búsqueda por q
  API.fetchFromTrefle = async function(q) {
    if (!q || !trefleToken || !trefleBase) return null;
    try {
      const url = `${trefleBase.replace(/\/+$/,'')}/api/v1/species?token=${encodeURIComponent(trefleToken)}&q=${encodeURIComponent(q)}&page=1&limit=5`;
      const res = await fetch(url, { timeout: 10000 });
      if (!res.ok) {
        console.warn('Trefle fetch non-ok:', res.status);
        return null;
      }
      const json = await res.json();
      const item = (json && json.data && json.data.length && json.data[0]) ? json.data[0] : null;
      if (!item) return null;
      const out = {
        description: item.description || item.synopsis || item.observation || '',
        image_url: (item.image_url || (item.image && item.image.url) || (item.images && item.images[0] && (item.images[0].url || item.images[0].image_url))) || '',
        genus: item.genus || '',
        species: item.species || '',
        common_name: item.common_name || (item.common_names && item.common_names[0]) || '',
        habitat: item.distribution || item.distribution_text || '',
        pfaf: '',
        _raw: item
      };
      return normalizeExt(out, 'trefle');
    } catch (e) {
      console.warn('Trefle fetch error:', e && e.message ? e.message : e);
      return null;
    }
  };

  // Wikipedia: usa helper si está disponible
  API.fetchFromWikipedia = async function(title) {
    if (!wikiHelper || !title) {
      if (!wikiHelper) console.log('Wikipedia helper no disponible, saltando Wikipedia');
      return null;
    }
    try {
      console.log('Wikipedia: buscando título ->', title);
      const w = await wikiHelper.fetchFromWikipedia(title);
      if (!w) {
        console.log('Wikipedia: no encontró resumen para', title);
        return null;
      }
      console.log('Wikipedia: encontrado resumen/imágen para', title, 'hasDescription:', !!w.description, 'hasImage:', !!w.image_url);
      return normalizeExt({ description: w.description || '', image_url: w.image_url || '' }, 'wikipedia');
    } catch (e) {
      console.warn('Wikipedia fetch error:', e && e.message ? e.message : e);
      return null;
    }
  };

  // High-level: intenta por nombre científico (exacto), Perenual -> Trefle -> Wikipedia (última)
  API.fetchByScientificName = async function(name) {
    if (!name) return null;
    try {
      console.log('fetchByScientificName: empezando búsqueda para ->', name);
      const p = await API.fetchFromPerenual(name);
      if (p) { console.log('fetchByScientificName: encontrado en Perenual'); return p; }
      const t = await API.fetchFromTrefle(name);
      if (t) { console.log('fetchByScientificName: encontrado en Trefle'); return t; }
      const w = await API.fetchFromWikipedia(name);
      if (w) { console.log('fetchByScientificName: encontrado en Wikipedia'); return w; }
      console.log('fetchByScientificName: no encontrado en Perenual/Trefle/Wikipedia para ->', name);
      return null;
    } catch (e) {
      console.warn('fetchByScientificName error:', e && e.message ? e.message : e);
      return null;
    }
  };

  API.findByGenusSpecies = async function(genus, species) {
    if (!genus || !species) return null;
    const q = `${genus} ${species}`;
    try {
      console.log('findByGenusSpecies: buscand0 ->', q);
      const p = await API.fetchFromPerenual(q);
      if (p) { console.log('findByGenusSpecies: encontrado en Perenual'); return p; }
      const t = await API.fetchFromTrefle(q);
      if (t) { console.log('findByGenusSpecies: encontrado en Trefle'); return t; }
      const w = await API.fetchFromWikipedia(q);
      if (w) { console.log('findByGenusSpecies: encontrado en Wikipedia'); return w; }
      return null;
    } catch (e) {
      console.warn('findByGenusSpecies error:', e && e.message ? e.message : e);
      return null;
    }
  };

  API.search = async function(q) {
    if (!q) return null;
    try {
      console.log('API.search: buscando ->', q);
      const bySci = await API.fetchByScientificName(q);
      if (bySci) return bySci;
      const p = await API.fetchFromPerenual(q);
      if (p) return p;
      const t = await API.fetchFromTrefle(q);
      if (t) return t;
      const w = await API.fetchFromWikipedia(q);
      if (w) return w;
      return null;
    } catch (e) {
      console.warn('search error:', e && e.message ? e.message : e);
      return null;
    }
  };

  // readCsvLocal: mantiene tu API existente para compatibilidad (no se elimina)
  API.readCsvLocal = async function(maxRows) {
    const maxDefault = (config && (config.csvMaxRead || config.CSV_MAX_READ)) || 52;
    const limit = typeof maxRows === 'number' ? maxRows : maxDefault;
    try {
      const localCsvPath = config.localCsvPath || config.LOCAL_CSV_PATH || './www/data/plant_data.csv';
      const filePath = path.isAbsolute(localCsvPath) ? localCsvPath : path.join(process.cwd(), localCsvPath);
      const raw = await fs.readFile(filePath, 'utf8');
      if (parseSync) {
        try {
          const records = parseSync(raw, {
            columns: true,
            skip_empty_lines: true,
            relax_column_count: true,
            relax_quotes: true,
            trim: true
          });
          const limited = Array.isArray(records) ? records.slice(0, limit) : [];
          return limited.map(rec => mapCsvRecordToPlant(rec));
        } catch (errParse) {
          if (config.DEBUG_SHOW_RAW) console.warn('csv-parse (sync) falló, usando fallback robusto:', errParse && errParse.message ? errParse.message : errParse);
        }
      }
      const robust = robustParseCsv(raw, limit);
      return robust.map(rec => mapCsvRecordToPlant(rec));
    } catch (err) {
      console.warn('readCsvLocal error:', err && err.message ? err.message : err);
      return [];
    }
  };

  // expose helpers (por compatibilidad con el código existente)
  API._internal = {
    normalizeExt,
    robustParseCsv,
    parseCsvLine,
    mapCsvRecordToPlant,
  };

  return API;
};
