// routes/plants.js
const express = require('express');
const db = require('../lib/db');

module.exports = function (config = {}, PlantsModel = null, External = null) {
  const router = express.Router();

  // optional translator (best-effort)
  let Translator = null;
  try { Translator = require('../lib/translate')(config); } catch (e) { Translator = null; console.warn('Translator not available:', e && e.message ? e.message : e); }
  const TRANSLATE_ENABLED = (Translator && Translator.provider && Translator.provider !== 'none');

  // runQuery: ejecuta una consulta soportando distintos clientes
  async function runQuery(sql, params = []) {
    if (!db) throw new Error('No DB connection available');
    try {
      const res = await db.query(sql, params);
      if (Array.isArray(res) && Array.isArray(res[0])) return res[0];
      return res;
    } catch (err) {
      if (db && typeof db.promise === 'function') {
        const [rows] = await db.promise().query(sql, params);
        return rows;
      }
      throw err;
    }
  }

  // small helpers
  function parseLista(val) {
    if (val == null) return [];
    if (Array.isArray(val)) return val.map(x => String(x).trim()).filter(Boolean);
    if (typeof val === 'string') {
      const s = val.trim();
      try {
        const attempt = s.replace(/'/g, '"');
        if ((attempt.startsWith('[') && attempt.endsWith(']')) || (attempt.startsWith('{') && attempt.endsWith('}'))) {
          const parsed = JSON.parse(attempt);
          if (Array.isArray(parsed)) return parsed.map(x => String(x).trim()).filter(Boolean);
          if (typeof parsed === 'object') return Object.values(parsed).map(x => String(x).trim()).filter(Boolean);
        }
      } catch (e) {}
      return s.replace(/^\[|\]$/g, '').replace(/'/g, '').split(',').map(x => x.trim()).filter(Boolean);
    }
    return String(val).replace(/^\[|\]$/g, '').replace(/'/g, '').split(',').map(x => x.trim()).filter(Boolean);
  }

  function parseFlag(val) {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val === 1;
    const s = String(val).trim().toLowerCase();
    if (s === '1' || s === 'true') return true;
    if (s === '0' || s === 'false') return false;
    return null;
  }

  function getFromRow(row, ...keys) {
    if (!row) return null;
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(row, k) && row[k] != null && row[k] !== '') return row[k];
      const lower = k.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(row, lower) && row[lower] != null && row[lower] !== '') return row[lower];
      const unders = k.replace(/\s+/g, '_');
      if (Object.prototype.hasOwnProperty.call(row, unders) && row[unders] != null && row[unders] !== '') return row[unders];
      const nospace = k.replace(/\s+/g, '');
      if (Object.prototype.hasOwnProperty.call(row, nospace) && row[nospace] != null && row[nospace] !== '') return row[nospace];
    }
    return null;
  }

  function normalizeRow(row) {
    const genus = getFromRow(row, 'Genus', 'genus');
    const species = getFromRow(row, 'Species', 'species');
    const scientific_guess = (getFromRow(row, 'scientific_name', 'scientificName', 'scientific')
      || (genus && species ? `${String(genus).trim()} ${String(species).trim()}` : '') || '');

    const image_url = getFromRow(row, 'Image URL', 'ImageURL', 'image_url', 'image', 'imageUrl', 'Image');
    const soilsRaw = getFromRow(row, 'Soils', 'soils') || '';
    const phSplitRaw = getFromRow(row, 'pH_split', 'ph_split') || '';
    const pollinatorsRaw = getFromRow(row, 'Pollinators', 'pollinators') || '';
    const preferencesRaw = getFromRow(row, 'Preferences', 'preferences') || '';
    const tolerancesRaw = getFromRow(row, 'Tolerances', 'tolerances') || '';

    return {
      id: getFromRow(row, 'id', 'ID') || null,
      family: (getFromRow(row, 'Family', 'family') || '') + '',
      genus: genus || '',
      species: species || '',
      scientific_name: scientific_guess || '',
      common_name: getFromRow(row, 'CommonName', 'Common_Name', 'common_name', 'commonName', 'Common') || '',
      growth_rate: getFromRow(row, 'GrowthRate', 'growth_rate', 'growthRate') || '',
      hardiness_zones: getFromRow(row, 'HardinessZones', 'hardiness_zones') || '',
      height: getFromRow(row, 'Height', 'height') || '',
      width: getFromRow(row, 'Width', 'width') || '',
      type: getFromRow(row, 'Type', 'type') || '',
      foliage: getFromRow(row, 'Foliage', 'foliage') || '',
      pollinators: parseLista(pollinatorsRaw),
      leaf: getFromRow(row, 'Leaf', 'leaf') || '',
      flower: getFromRow(row, 'Flower', 'flower') || '',
      ripen: getFromRow(row, 'Ripen', 'ripen') || '',
      reproduction: getFromRow(row, 'Reproduction', 'reproduction') || '',
      soils: parseLista(soilsRaw),
      ph: getFromRow(row, 'pH', 'ph', 'pH_value') || '',
      ph_split: parseLista(phSplitRaw),
      preferences: parseLista(preferencesRaw),
      tolerances: parseLista(tolerancesRaw),
      habitat: getFromRow(row, 'Habitat', 'habitat') || '',
      habitat_range: getFromRow(row, 'HabitatRange', 'habitat_range') || '',
      edibility: parseFlag(getFromRow(row, 'Edibility', 'edibility')),
      medicinal: parseFlag(getFromRow(row, 'Medicinal', 'medicinal')),
      other_uses: getFromRow(row, 'OtherUses', 'other_uses') || '',
      pfaf: getFromRow(row, 'PFAF', 'pfaf') || '',
      image_url: image_url || '',
      images: image_url ? [image_url] : [],
      description: getFromRow(row, 'description', 'Description', 'description_text') || '',
      source: 'db'
    };
  }

  // GET / -> lista normalizada. Soporta ?limit=NUMBER
  router.get('/', async (req, res) => {
    try {
      let rows = [];
      if (PlantsModel && typeof PlantsModel.findAll === 'function') {
        const opts = {};
        if (req.query.limit) opts.limit = parseInt(req.query.limit, 10);
        rows = await PlantsModel.findAll(opts);
      } else if (PlantsModel && typeof PlantsModel.getAll === 'function') {
        rows = await PlantsModel.getAll(req.query);
      } else {
        const limitPart = req.query.limit ? ` LIMIT ${parseInt(req.query.limit, 10)}` : '';
        const sql = `SELECT * FROM plants${limitPart}`;
        rows = await runQuery(sql);
      }

      if (!Array.isArray(rows)) rows = [];
      const plants = rows.map(normalizeRow);
      res.json(plants);
    } catch (err) {
      console.error('Error en GET /api/plants ->', err);
      res.status(500).json({ error: 'Error interno leyendo plants', detail: String(err && err.message ? err.message : err) });
    }
  });

  // GET /:id -> planta por id
  router.get('/:id', async (req, res) => {
    const id = req.params.id;
    console.log('[trace] GET /api/plants/:id id=', id, ' use PlantsModel?', !!PlantsModel, 'Translator?', !!Translator);

    try {
      let row = null;

      // 1) intenta usar PlantsModel si está disponible
      if (PlantsModel && typeof PlantsModel.findById === 'function') {
        try {
          console.log('[trace] -> calling PlantsModel.findById(', id, ')');
          row = await PlantsModel.findById(id);
          console.log('[trace] -> PlantsModel.findById returned:', !!row);
        } catch (e) {
          console.warn('[warn] PlantsModel.findById threw:', String(e && e.message ? e.message : e));
          row = null;
        }
      }

      // 2) Si no encontramos nada, intenta una consulta directa al pool (fallback)
      if (!row) {
        try {
          console.log('[trace] -> fallback: querying DB directly for id=', id);
          const rows = await runQuery('SELECT * FROM plants WHERE id = ? LIMIT 1', [id]);
          if (Array.isArray(rows) && rows.length) row = rows[0];
          else if (rows && rows.id) row = rows; // por si runQuery devolvió un objeto
          console.log('[trace] -> direct DB query returned:', !!row);
        } catch (e) {
          console.error('[error] direct DB query failed:', e && e.message ? e.message : e);
          row = null;
        }
      }

      if (!row) {
        console.log('[trace] -> not found id=', id);
        return res.status(404).json({ error: 'No encontrada' });
      }

      // Normaliza y responde
      const normal = normalizeRow(row);
      // NOTA: aquí podríamos enriquecer (External) y actualizar DB si quieres — lo dejamos para la siguiente iteración.
      console.log('[trace] -> responding id=', id, ' scientific_name=', normal.scientific_name || '(none)');
      return res.json(normal);
    } catch (err) {
      console.error('Error en GET /api/plants/:id ->', err);
      res.status(500).json({ error: 'Error interno', detail: String(err && err.message ? err.message : err) });
    }
  });

  return router;
};
