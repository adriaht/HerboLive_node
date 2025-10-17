// routes/plants.js
// Factory: module.exports = (config, PlantsModel, External, db) => router;
const express = require('express');
const db = require('../lib/db');

module.exports = function (config = {}, PlantsModel = null, External = null) {
  const router = express.Router();

  // load translator factory (optional)
  let Translator = null;
  try {
    Translator = require('../lib/translate')(config);
  } catch (e) {
    Translator = null;
    console.warn('Translator not available:', e && e.message ? e.message : e);
  }

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

  // Helpers (idem a tu versión)
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
      let plants = rows.map(normalizeRow);

      // Translate list elements if enabled (careful: may slow down list endpoints)
      if (TRANSLATE_ENABLED) {
        try {
          // translate only selected fields for each plant - do not block entire request for too long
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

  // GET /:id -> planta por id (enriquecimiento + guardado de campos faltantes), y traducción opcional
  router.get('/:id', async (req, res) => {
    const id = req.params.id;
    try {
      let row = null;
      if (PlantsModel && typeof PlantsModel.findById === 'function') {
        row = await PlantsModel.findById(id);
      } else {
        const sql = 'SELECT * FROM plants WHERE id = ? LIMIT 1';
        const rows = await runQuery(sql, [id]);
        row = (Array.isArray(rows) && rows[0]) ? rows[0] : rows;
      }

      if (!row) return res.status(404).json({ error: 'No encontrada' });

      // normalizamos
      let normalized = normalizeRow(row);

      // Enriquecimiento (solo si config.useDbFirst y External está presente)
      if (config.useDbFirst && External && typeof External === 'object') {
        try {
          const candidateName = normalized.scientific_name || `${normalized.genus} ${normalized.species}`.trim() || normalized.common_name || '';
          let extra = null;

          if (candidateName && typeof External.fetchByScientificName === 'function') {
            extra = await External.fetchByScientificName(candidateName);
          }
          if (!extra && typeof External.fetchFromTrefle === 'function') {
            extra = await External.fetchFromTrefle(candidateName || normalized.common_name || '');
          }
          if (!extra && typeof External.fetchFromPerenual === 'function') {
            extra = await External.fetchFromPerenual(candidateName || normalized.common_name || '');
          }
          if (!extra && typeof External.fetchGeneric === 'function') {
            extra = await External.fetchGeneric(candidateName || normalized.common_name || '');
          }

          if (extra && typeof extra === 'object') {
            // normalize and merge but prefer DB values (only fill empties)
            const extraNorm = {
              family: extra.family || extra.Family || '',
              genus: extra.genus || extra.Genus || '',
              species: extra.species || extra.Species || '',
              scientific_name: extra.scientific_name || extra.scientificName || extra.ScientificName || '',
              common_name: extra.common_name || extra.CommonName || extra.CommonName || '',
              growth_rate: extra.growth_rate || extra.GrowthRate || '',
              hardiness_zones: extra.hardiness_zones || extra.HardinessZones || '',
              height: extra.height || extra.Height || '',
              width: extra.width || extra.Width || '',
              type: extra.type || extra.Type || '',
              foliage: extra.foliage || extra.Foliage || '',
              pollinators: Array.isArray(extra.pollinators) ? extra.pollinators : (extra.Pollinators || []),
              leaf: extra.leaf || extra.Leaf || '',
              flower: extra.flower || extra.Flower || '',
              ripen: extra.ripen || extra.Ripen || '',
              reproduction: extra.reproduction || extra.Reproduction || '',
              soils: Array.isArray(extra.soils) ? extra.soils : (extra.Soils || []),
              ph: extra.ph || extra.pH || '',
              ph_split: Array.isArray(extra.ph_split) ? extra.ph_split : (extra.pH_split || []),
              preferences: Array.isArray(extra.preferences) ? extra.preferences : (extra.Preferences || []),
              tolerances: Array.isArray(extra.tolerances) ? extra.tolerances : (extra.Tolerances || []),
              habitat: extra.habitat || extra.Habitat || '',
              habitat_range: extra.habitat_range || extra.HabitatRange || '',
              edibility: (typeof extra.edibility !== 'undefined') ? extra.edibility : extra.Edibility,
              medicinal: (typeof extra.medicinal !== 'undefined') ? extra.medicinal : extra.Medicinal,
              other_uses: extra.other_uses || extra.OtherUses || '',
              pfaf: extra.pfaf || extra.PFAF || '',
              image_url: extra.image_url || extra.ImageURL || extra.Image || '',
              images: extra.images && Array.isArray(extra.images) ? extra.images : (extra.Images && Array.isArray(extra.Images) ? extra.Images : []),
              description: extra.description || extra.Description || extra.description_text || ''
            };

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

            const merged = Object.assign({}, normalized);

            for (const key of Object.keys(extraNorm)) {
              const val = extraNorm[key];
              if ((merged[key] === null || merged[key] === '' || (Array.isArray(merged[key]) && merged[key].length === 0))) {
                if (val !== null && val !== '' && !(Array.isArray(val) && val.length === 0)) {
                  merged[key] = val;
                  const dbCol = dbFieldMap[key];
                  if (dbCol) {
                    toSaveDb[dbCol] = Array.isArray(val) ? JSON.stringify(val) : val;
                  }
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
              } catch (e) {
                console.warn('No se pudo persistir enriquecimiento en DB (no crítico):', e && e.message ? e.message : e);
              }
            }

            normalized = merged;
          }
        } catch (e) {
          console.warn('Enriquecimiento externo falló (no crítico):', e && e.message ? e.message : e);
        }
      }

      // Traducción opcional: traduce campos textuales antes de devolver si está habilitado
      if (TRANSLATE_ENABLED && Translator) {
        try {
          const translateFields = ['common_name','type','foliage','leaf','flower','habitat','habitat_range','preferences','other_uses','description'];
          normalized = await Translator.translateObjectFields(normalized, translateFields, Translator.target);
        } catch (e) {
          console.warn('translateObjectFields failed:', e && e.message ? e.message : e);
          // no rompemos la respuesta por fallo en traducción
        }
      }

      res.json(normalized);
    } catch (err) {
      console.error('Error en GET /api/plants/:id ->', err);
      res.status(500).json({ error: 'Error interno', detail: String(err && err.message ? err.message : err) });
    }
  });

  return router;
};
