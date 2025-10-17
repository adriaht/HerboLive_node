// routes/api.js
// Router /api que obtiene datos desde DB, los enriquece con External APIs y traduce al español.
//
// Uso: module.exports = (config, PlantsModel, External, db) => router
// - config: objeto de configuración (usa config.useDbFirst para alternar comportamiento)
// - PlantsModel: el modelo que implementa findById, listAll, findByQuery (optional)
// - External: módulo con funciones fetchFromPerenual(name) y fetchFromTrefle(name) (optional)
// - db: conexión/pool directo (optional)

const express = require('express');
const fetch = require('node-fetch');

module.exports = function(config = {}, PlantsModel = null, External = null, db = null) {
  const router = express.Router();

  // --- Config de traducción (por environment variables) ---
  const TRANSLATE_PROVIDER = (process.env.TRANSLATE_PROVIDER || 'none').toLowerCase(); // none | libretranslate | deepl | google
  const TRANSLATE_API_KEY = process.env.TRANSLATE_API_KEY || '';
  const TRANSLATE_API_URL = process.env.TRANSLATE_API_URL || 'https://libretranslate.de/translate'; // si libretranslate personalizada
  const TRANSLATE_TARGET = 'es';

  // cache de traducciones en memoria
  const translateCache = new Map();

  async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let i = 0;
    const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
      while (i < items.length) {
        const idx = i++;
        try {
          results[idx] = await fn(items[idx], idx);
        } catch (e) {
          results[idx] = { __error: String(e && e.message ? e.message : e) };
        }
      }
    });
    await Promise.all(workers);
    return results;
  }

  async function translateText(text) {
    if (!text && text !== 0) return text;
    const s = String(text);
    if (!s.trim()) return s;

    const cacheKey = `${TRANSLATE_PROVIDER}::${s}`;
    if (translateCache.has(cacheKey)) return translateCache.get(cacheKey);

    if (TRANSLATE_PROVIDER === 'none' || TRANSLATE_PROVIDER === '') {
      translateCache.set(cacheKey, s);
      return s;
    }

    try {
      let translated = s;

      if (TRANSLATE_PROVIDER === 'libretranslate') {
        const res = await fetch(TRANSLATE_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: s, source: 'auto', target: TRANSLATE_TARGET, format: 'text' })
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`LibreTranslate error ${res.status}: ${txt}`);
        }
        const j = await res.json();
        translated = j.translatedText || s;
      } else if (TRANSLATE_PROVIDER === 'deepl') {
        const url = process.env.DEEPL_API_URL || 'https://api-free.deepl.com/v2/translate';
        const params = new URLSearchParams();
        params.append('auth_key', TRANSLATE_API_KEY);
        params.append('text', s);
        params.append('target_lang', TRANSLATE_TARGET.toUpperCase().slice(0,2));
        const res = await fetch(url, { method: 'POST', body: params });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`DeepL error ${res.status}: ${txt}`);
        }
        const j = await res.json();
        translated = (j.translations && j.translations[0] && j.translations[0].text) || s;
      } else if (TRANSLATE_PROVIDER === 'google') {
        const url = process.env.GOOGLE_TRANSLATE_URL || `https://translation.googleapis.com/language/translate/v2?key=${TRANSLATE_API_KEY}`;
        const body = JSON.stringify({ q: s, target: TRANSLATE_TARGET });
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`Google Translate error ${res.status}: ${txt}`);
        }
        const j = await res.json();
        translated = (j.data && j.data.translations && j.data.translations[0] && j.data.translations[0].translatedText) || s;
      }

      translateCache.set(cacheKey, translated);
      return translated;
    } catch (e) {
      console.warn('translateText error:', e && e.message ? e.message : e);
      translateCache.set(cacheKey, s);
      return s;
    }
  }

  async function translateObjectDeep(obj) {
    if (obj == null) return obj;
    if (typeof obj === 'string') {
      return translateText(obj);
    }
    if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
    if (Array.isArray(obj)) {
      const mapped = await Promise.all(obj.map(item => translateObjectDeep(item)));
      return mapped;
    }
    if (typeof obj === 'object') {
      const entries = Object.entries(obj);
      const out = {};
      for (const [k, v] of entries) {
        out[k] = await translateObjectDeep(v);
      }
      return out;
    }
    return obj;
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

  function normalizeRowRaw(row) {
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
      family: getFromRow(row, 'Family', 'family') || '',
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

  async function enrichPlantData(normalized) {
    const out = Object.assign({}, normalized);

    let lookupName = out.scientific_name || `${out.genus} ${out.species}`.trim();
    if (!lookupName) return out;

    const calls = [];
    if (External && typeof External.fetchFromPerenual === 'function') {
      calls.push(External.fetchFromPerenual(lookupName).catch(e => { console.warn('Perenual fetch error', e && e.message ? e.message : e); return null; }));
    } else {
      calls.push(Promise.resolve(null));
    }
    if (External && typeof External.fetchFromTrefle === 'function') {
      calls.push(External.fetchFromTrefle(lookupName).catch(e => { console.warn('Trefle fetch error', e && e.message ? e.message : e); return null; }));
    } else {
      calls.push(Promise.resolve(null));
    }

    const [perenualData, trefleData] = await Promise.all(calls);

    function mergeField(field, preferDb = true) {
      if (preferDb && out[field]) return;
      if (perenualData && (perenualData[field] || perenualData[field] === 0)) out[field] = perenualData[field];
      if ((!out[field] || out[field] === '') && trefleData && (trefleData[field] || trefleData[field] === 0)) out[field] = trefleData[field];
    }

    mergeField('common_name', true);
    mergeField('image_url', true);
    if (perenualData && perenualData.images && Array.isArray(perenualData.images) && perenualData.images.length) {
      out.images = Array.from(new Set([...(out.images || []), ...perenualData.images]));
    }
    if (trefleData && trefleData.images && Array.isArray(trefleData.images) && trefleData.images.length) {
      out.images = Array.from(new Set([...(out.images || []), ...trefleData.images]));
    }

    if ((!out.description || out.description === '') && perenualData && perenualData.description) out.description = perenualData.description;
    if ((!out.description || out.description === '') && trefleData && trefleData.description) out.description = out.description || trefleData.description;

    try {
      out.pollinators = Array.from(new Set([...(out.pollinators || []), ...(perenualData && perenualData.pollinators || []), ...(trefleData && trefleData.pollinators || [])].filter(Boolean)));
    } catch (e) { /* ignore */ }

    return out;
  }

  // Rutas

  router.get('/plants', async (req, res) => {
    try {
      const dbFirst = !!(config && config.useDbFirst);

      let rows = [];
      if (dbFirst) {
        if (PlantsModel && typeof PlantsModel.listAll === 'function') {
          const page = req.query.page ? parseInt(req.query.page, 10) : 1;
          const perPage = req.query.perPage ? parseInt(req.query.perPage, 10) : (req.query.limit ? parseInt(req.query.limit, 10) : 50);
          const data = await PlantsModel.listAll(page, perPage);
          rows = data.rows || [];
        } else if (PlantsModel && typeof PlantsModel.findByQuery === 'function' && req.query.q) {
          const q = req.query.q;
          const page = req.query.page ? parseInt(req.query.page, 10) : 1;
          const perPage = req.query.perPage ? parseInt(req.query.perPage, 10) : 50;
          const data = await PlantsModel.findByQuery(q, page, perPage);
          rows = data.rows || [];
        } else if (db) {
          const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
          rows = await db.query(`SELECT * FROM plants LIMIT ?`, [limit]).then(r => Array.isArray(r) && Array.isArray(r[0]) ? r[0] : r);
        } else {
          return res.status(500).json({ error: 'No DB/model disponible para modo DB-first' });
        }

        const normalized = rows.map(normalizeRowRaw);
        const enriched = await mapLimit(normalized, 6, async (nr) => {
          const enr = await enrichPlantData(nr);
          return enr;
        });

        const translated = [];
        for (const p of enriched) {
          translated.push(await translateObjectDeep(p));
        }

        return res.json(translated);
      } else {
        if (PlantsModel && typeof PlantsModel.listAll === 'function') {
          const data = await PlantsModel.listAll(1, req.query.limit ? parseInt(req.query.limit, 10) : 50);
          rows = data.rows || [];
        } else if (db) {
          rows = await db.query(`SELECT * FROM plants LIMIT ?`, [req.query.limit ? parseInt(req.query.limit, 10) : 50]).then(r => Array.isArray(r) && Array.isArray(r[0]) ? r[0] : r);
        } else {
          return res.status(500).json({ error: 'No DB/model disponible' });
        }
        const normalized = rows.map(normalizeRowRaw);
        const translated = [];
        for (const p of normalized) {
          translated.push(await translateObjectDeep(p));
        }
        return res.json(translated);
      }
    } catch (err) {
      console.error('Error en /api/plants ->', err && err.stack ? err.stack : err);
      res.status(500).json({ error: 'Error interno', detail: String(err && err.message ? err.message : err) });
    }
  });

  router.get('/plants/:id', async (req, res) => {
    const id = req.params.id;
    try {
      if (!(config && config.useDbFirst)) {
        return res.status(400).json({ error: 'Buscar por ID en DB solo disponible en modo DB-first' });
      }

      let row = null;
      if (PlantsModel && typeof PlantsModel.findById === 'function') {
        row = await PlantsModel.findById(id);
      } else if (db) {
        const rows = await db.query('SELECT * FROM plants WHERE id = ? LIMIT 1', [id]).then(r => Array.isArray(r) && Array.isArray(r[0]) ? r[0] : r);
        row = Array.isArray(rows) ? rows[0] : rows;
      } else {
        return res.status(500).json({ error: 'No DB/model disponible' });
      }

      if (!row) return res.status(404).json({ error: 'No encontrada' });

      const normalized = normalizeRowRaw(row);
      const enriched = await enrichPlantData(normalized);
      const translated = await translateObjectDeep(enriched);
      return res.json(translated);
    } catch (err) {
      console.error('Error en /api/plants/:id ->', err && err.stack ? err.stack : err);
      res.status(500).json({ error: 'Error interno', detail: String(err && err.message ? err.message : err) });
    }
  });

  return router;
};
