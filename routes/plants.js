// routes/plants.js
const express = require('express');
const db = require('../lib/db');

module.exports = function (config = {}, PlantsModel = null, External = null) {
  const router = express.Router();

  // optional translator (best-effort)
  let Translator = null;
  try { Translator = require('../lib/translate')(config); } catch (e) { Translator = null; console.warn('Translator not available:', e && e.message ? e.message : e); }
  const TRANSLATE_ENABLED = (Translator && Translator.provider && Translator.provider !== 'none');

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

  // GET / -> lista normalizada
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
      let plants = rows.map(normalizeRow);

      if (TRANSLATE_ENABLED) {
        try {
          const translateFields = ['common_name','type','foliage'];
          const promises = plants.map(p => Translator.translateObjectFields(p, translateFields, Translator.target).catch(e => p));
          plants = await Promise.all(promises);
        } catch (e) {
          console.warn('Translation (list) failed:', e && e.message ? e.message : e);
        }
      }

      res.json(plants);
    } catch (err) {
      console.error('Error en GET /api/plants ->', err);
      res.status(500).json({ error: 'Error interno leyendo plants', detail: String(err && err.message ? err.message : err) });
    }
  });

  // GET /:id -> planta por id (ROBUST: intenta varias consultas y guarda trazas)
  router.get('/:id', async (req, res) => {
    const idParam = req.params.id;
    try {
      console.log(`[trace] GET /api/plants/${idParam} - comienzo`);

      // 1) Si PlantsModel dispone de findById, pruébalo primero
      let row = null;
      if (PlantsModel && typeof PlantsModel.findById === 'function') {
        try {
          row = await PlantsModel.findById(idParam);
          console.log(`[trace] PlantsModel.findById(${idParam}) -> ${!!row}`);
        } catch (e) {
          console.warn('[trace] PlantsModel.findById error:', e && e.message ? e.message : e);
          row = null;
        }
      }

      // 2) Si no hay fila, prueba consultas SQL explícitas (id numérico, genus+species, commonname)
      if (!row) {
        // try id numeric
        if (!Number.isNaN(Number(idParam))) {
          console.log('[trace] intentando SELECT por id numérico');
          const rows = await runQuery('SELECT * FROM plants WHERE id = ? LIMIT 1', [Number(idParam)]);
          if (Array.isArray(rows) && rows.length > 0) row = rows[0];
          else if (rows && rows.id) row = rows;
          console.log('[trace] resultado SELECT id ->', Array.isArray(rows) ? rows.length : (row ? 1 : 0));
        }

        // try scientific name / genus species fallback
        if (!row) {
          const guess = idParam.replace(/\+/g,' ').trim(); // allow "Genus+species"
          if (guess.includes(' ')) {
            const parts = guess.split(/\s+/);
            if (parts.length >= 2) {
              const g = parts[0];
              const s = parts.slice(1).join(' ');
              console.log('[trace] intentando SELECT por Genus+Species', g, s);
              const rows2 = await runQuery('SELECT * FROM plants WHERE Genus = ? AND Species = ? LIMIT 1', [g, s]);
              if (Array.isArray(rows2) && rows2.length > 0) row = rows2[0];
              console.log('[trace] resultado SELECT Genus+Species ->', Array.isArray(rows2) ? rows2.length : (row ? 1 : 0));
            }
          }
        }

        // try CommonName search
        if (!row) {
          console.log('[trace] intentando SELECT por CommonName LIKE');
          const like = `%${idParam}%`;
          const rows3 = await runQuery('SELECT * FROM plants WHERE CommonName LIKE ? LIMIT 1', [like]);
          if (Array.isArray(rows3) && rows3.length > 0) row = rows3[0];
          console.log('[trace] resultado SELECT CommonName ->', Array.isArray(rows3) ? rows3.length : (row ? 1 : 0));
        }
      }

      if (!row) {
        console.warn(`[trace] Planta idParam='${idParam}' no encontrada`);
        return res.status(404).json({ error: 'No encontrada' });
      }

      console.log('[trace] Planta encontrada en DB, normalizando...');
      let normalized = normalizeRow(row);

      // Enriquecimiento (si DB-first): intenta obtener info externa y persiste nuevos campos (si aplica)
      if (config.useDbFirst && External && typeof External === 'object') {
        try {
          const candidateName = normalized.scientific_name || `${normalized.genus} ${normalized.species}`.trim() || normalized.common_name || '';
          let extra = null;
          if (candidateName && typeof External.fetchByScientificName === 'function') extra = await External.fetchByScientificName(candidateName);
          if (!extra && typeof External.fetchFromTrefle === 'function') extra = await External.fetchFromTrefle(candidateName || normalized.common_name || '');
          if (!extra && typeof External.fetchFromPerenual === 'function') extra = await External.fetchFromPerenual(candidateName || normalized.common_name || '');
          if (!extra && typeof External.fetchGeneric === 'function') extra = await External.fetchGeneric(candidateName || normalized.common_name || '');
          if (extra && typeof extra === 'object') {
            // merge sin sobrescribir
            const fieldsToFill = ['family','genus','species','scientific_name','common_name','growth_rate','hardiness_zones','height','width','type','foliage','pollinators','leaf','flower','ripen','reproduction','soils','ph','ph_split','preferences','tolerances','habitat','habitat_range','edibility','medicinal','other_uses','pfaf','image_url','images','description'];
            const toSaveDb = {};
            const dbFieldMap = {
              family: 'Family', genus: 'Genus', species: 'Species', common_name: 'CommonName',
              growth_rate: 'GrowthRate', hardiness_zones: 'HardinessZones', height: 'Height', width: 'Width',
              type: 'Type', foliage: 'Foliage', pollinators: 'Pollinators', leaf: 'Leaf', flower: 'Flower',
              ripen: 'Ripen', reproduction: 'Reproduction', soils: 'Soils', ph: 'pH', ph_split: 'pH_split',
              preferences: 'Preferences', tolerances: 'Tolerances', habitat: 'Habitat', habitat_range: 'HabitatRange',
              edibility: 'Edibility', medicinal: 'Medicinal', other_uses: 'OtherUses', pfaf: 'PFAF',
              image_url: 'ImageURL', images: 'images', description: 'description'
            };
            for (const key of fieldsToFill) {
              const val = extra[key] || extra[key.charAt(0).toUpperCase() + key.slice(1)] || '';
              if ((normalized[key] === null || normalized[key] === '' || (Array.isArray(normalized[key]) && normalized[key].length === 0))) {
                if (val !== null && val !== '' && !(Array.isArray(val) && val.length === 0)) {
                  normalized[key] = val;
                  const dbCol = dbFieldMap[key];
                  if (dbCol) toSaveDb[dbCol] = Array.isArray(val) ? JSON.stringify(val) : val;
                }
              }
            }
            if (Object.keys(toSaveDb).length > 0) {
              try {
                if (PlantsModel && typeof PlantsModel.updateById === 'function') {
                  await PlantsModel.updateById(normalized.id, toSaveDb);
                } else {
                  const cols = Object.keys(toSaveDb).map(c => `\`${c}\` = ?`).join(', ');
                  const params = Object.keys(toSaveDb).map(k => toSaveDb[k]);
                  params.push(normalized.id);
                  const sql = `UPDATE plants SET ${cols}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
                  await runQuery(sql, params);
                }
                console.log('[trace] Enriquecimiento persistido en DB');
              } catch (e) {
                console.warn('No se pudo persistir enriquecimiento en DB (no crítico):', e && e.message ? e.message : e);
              }
            }
          }
        } catch (e) {
          console.warn('Enriquecimiento externo falló (no crítico):', e && e.message ? e.message : e);
        }
      }

      // Traducción (si activado)
      if (TRANSLATE_ENABLED && Translator) {
        try {
          const translateFields = ['common_name','type','foliage','leaf','flower','habitat','habitat_range','preferences','other_uses','description'];
          normalized = await Translator.translateObjectFields(normalized, translateFields, Translator.target);
        } catch (e) {
          console.warn('translateObjectFields failed:', e && e.message ? e.message : e);
        }
      }

      console.log('[trace] Respondiendo planta normalizada id=', normalized.id);
      res.json(normalized);
    } catch (err) {
      console.error('Error en GET /api/plants/:id ->', err && err.stack ? err.stack : err);
      res.status(500).json({ error: 'Error interno', detail: String(err && err.message ? err.message : err) });
    }
  });

  return router;
};
