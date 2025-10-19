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

  // small helpers (mantengo los tuyos)
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
      preferences: parseLista(getFromRow(row, 'Preferences', 'preferences') || ''),
      tolerances: parseLista(getFromRow(row, 'Tolerances', 'tolerances') || ''),
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

  // small utility: try translate text (best-effort)
  async function tryTranslate(text) {
    if (!TRANSLATE_ENABLED || !text) return text;
    try {
      if (typeof Translator.translateText === 'function') {
        const tgt = config.TRANSLATE_TARGET || process.env.TRANSLATE_TARGET || 'es';
        return await Translator.translateText(text, tgt);
      }
      if (typeof Translator.translate === 'function') {
        const tgt = config.TRANSLATE_TARGET || process.env.TRANSLATE_TARGET || 'es';
        return await Translator.translate(text, tgt);
      }
      return text;
    } catch (e) {
      console.warn('translateText error:', e && e.message ? e.message : e);
      return text;
    }
  }

  // merge external info into normalized plant (only fill if missing)
  function mergeExternalIntoPlant(normal, ext) {
    if (!ext || typeof ext !== 'object') return 0;
    let enriched = 0;

    // helpers: read many variants
    const read = (o, ...keys) => {
      for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(o, k) && o[k] != null && String(o[k]).trim() !== '') return o[k];
      }
      return null;
    };

    const maybeSet = (field, value, transform) => {
      if (!value) return;
      const cur = normal[field];
      if ((cur === undefined || cur === null || String(cur).trim() === '') ) {
        normal[field] = transform ? transform(value) : value;
        enriched++;
      }
    };

    // description
    maybeSet('description', read(ext, 'description', 'Description', 'extract', 'summary', 'desc'));

    // habitat
    maybeSet('habitat', read(ext, 'Habitat', 'habitat', 'distribution', 'distribution_text'));
    maybeSet('habitat_range', read(ext, 'HabitatRange', 'habitat_range', 'range'));

    // other uses / pfaf
    maybeSet('other_uses', read(ext, 'OtherUses', 'other_uses'));
    maybeSet('pfaf', read(ext, 'PFAF', 'pfaf'));

    // image
    const imageCandidate = read(ext, 'ImageURL', 'image_url', 'image', 'thumbnail');
    if (imageCandidate) {
      if (!normal.image_url || normal.image_url === '') {
        normal.image_url = imageCandidate;
        normal.images = normal.images && normal.images.length ? normal.images : [imageCandidate];
        enriched++;
      } else if ((!normal.images || normal.images.length === 0) && imageCandidate) {
        normal.images = [imageCandidate];
        enriched++;
      }
    }

    // soils / pollinators: try parse arrays or comma strings
    const soilsCandidate = read(ext, 'Soils', 'soils');
    if (soilsCandidate && (!normal.soils || normal.soils.length === 0)) {
      normal.soils = Array.isArray(soilsCandidate) ? soilsCandidate : String(soilsCandidate).split(',').map(x=>x.trim()).filter(Boolean);
      enriched++;
    }

    const pollCandidate = read(ext, 'Pollinators', 'pollinators');
    if (pollCandidate && (!normal.pollinators || normal.pollinators.length === 0)) {
      normal.pollinators = Array.isArray(pollCandidate) ? pollCandidate : String(pollCandidate).split(',').map(x=>x.trim()).filter(Boolean);
      enriched++;
    }

    // names
    const cn = read(ext, 'CommonName', 'common_name', 'common');
    if (cn && (!normal.common_name || normal.common_name === '')) {
      normal.common_name = cn;
      enriched++;
    }

    return enriched;
  }

  // GET / -> lista normalizada. Soporta ?limit=NUMBER (por defecto 150)
  router.get('/', async (req, res) => {
    try {
      // limit por query o por defecto
      const limit = Math.min(150, Math.max(1, parseInt(req.query.limit || '150', 10))); // cap 150
      console.log(`[trace] GET /api/plants -> limit=${limit} useDbFirst=${config.useDbFirst}`);

      // 1) obtener desde DB (hasta limit)
      let rows = [];
      if (PlantsModel && typeof PlantsModel.listAll === 'function') {
        // listAll(page=1, perPage)
        const r = await PlantsModel.listAll(1, limit);
        if (r && Array.isArray(r.rows)) rows = r.rows;
      } else if (PlantsModel && typeof PlantsModel.getAll === 'function') {
        rows = await PlantsModel.getAll({ limit });
      } else {
        rows = await runQuery('SELECT * FROM plants ORDER BY CommonName LIMIT ?', [limit]);
      }

      if (!Array.isArray(rows)) rows = [];
      let plants = rows.map(normalizeRow);
      console.log(`[debug] DB: devuelto ${plants.length} items`);

      // 2) si useDbFirst: pedir más ejemplares a Perenual (lista) para ampliar catálogo
      const newFromPerenual = [];
      if (config.useDbFirst && External && typeof External.fetchListFromPerenual === 'function') {
        try {
          console.log('API debug — Iniciando búsqueda en: Perenual (lista)');
          // pedir una página con per_page = limit (si el external lo permite)
          const perenRes = await External.fetchListFromPerenual({ page: 1, per_page: limit });
          if (Array.isArray(perenRes) && perenRes.length) {
            // perenRes esperable: array de items raw -> normalizamos con External._internal.normalizeExt si existe
            const normFn = External._internal && External._internal.normalizeExt ? External._internal.normalizeExt : (x)=>({
              scientific_name: x.scientific_name || x.scientific || '',
              genus: x.genus || '',
              species: x.species || '',
              common_name: x.common_name || x.common || '',
              description: x.description || '',
              image_url: x.image_url || (x.images && x.images[0]) || '',
              source: 'perenual'
            });
            for (const it of perenRes) {
              const candidate = normFn(it, 'perenual');
              // build normalized shape like normalizeRow outputs
              const obj = {
                id: null,
                family: candidate.family || '',
                genus: candidate.genus || candidate.Genus || '',
                species: candidate.species || candidate.Species || '',
                scientific_name: candidate.scientific_name || `${candidate.genus || ''} ${candidate.species || ''}`.trim(),
                common_name: candidate.common_name || '',
                description: candidate.description || '',
                image_url: candidate.image_url || '',
                images: candidate.image_url ? [candidate.image_url] : [],
                source: 'perenual'
              };
              // add if not already in plants by scientific_name or genus+species
              const exists = plants.find(p => {
                const a = (p.scientific_name || '').toLowerCase();
                const b = (obj.scientific_name || '').toLowerCase();
                if (a && b && a === b) return true;
                if (p.genus && p.species && obj.genus && obj.species && p.genus.toLowerCase() === obj.genus.toLowerCase() && p.species.toLowerCase() === obj.species.toLowerCase()) return true;
                return false;
              });
              if (!exists) {
                newFromPerenual.push(obj);
                plants.push(obj);
              }
            }
            console.log(`API debug — Perenual: devuelto ${perenRes.length} items; añadidos nuevos: ${newFromPerenual.length}`);
          } else {
            console.log('API debug — Perenual: no devolvió items');
          }
        } catch (e) {
          console.warn('API debug — Perenual failed:', e && e.message ? e.message : e);
        }
      } else {
        // si External no tiene fetchListFromPerenual podemos intentar fallback (no implementado aquí)
        if (config.useDbFirst) console.log('API debug — External.fetchListFromPerenual no disponible, salto Perenual lista.');
      }

      // 3) Ahora enriquecemos TODOS los plants (DB + nuevos perenual) consultando Trefle y Wikipedia en ese orden,
      //    y no paramos al primer resultado: si la primera API sólo da parte de los campos, las otras seguirán buscando.
      console.log('API debug — Iniciando enriquecimiento con Trefle y Wikipedia (por cada planta)');
      let totalEnriched = 0;
      let totalFoundByTrefle = 0;
      let totalFoundByWiki = 0;

      // iterate sequentially to avoid demasiadas llamadas paralelas (puedes paralelizar si quieres)
      for (const p of plants) {
        // determine unique key(s)
        const sci = (p.scientific_name || '').trim();
        const genus = (p.genus || '').trim();
        const species = (p.species || '').trim();

        // track fields before
        const beforeDesc = p.description && String(p.description).trim() !== '';
        const beforeImage = p.image_url && String(p.image_url).trim() !== '';

        // Try Trefle first (if available)
        if (External && typeof External.fetchFromTrefle === 'function') {
          try {
            console.log(`API debug — Trefle: buscando "${sci || `${genus} ${species}`.trim()}"`);
            const tref = await External.fetchFromTrefle(sci || `${genus} ${species}`.trim());
            if (tref) {
              const enriched = mergeExternalIntoPlant(p, tref);
              if (enriched > 0) totalEnriched += enriched;
              totalFoundByTrefle += 1;
            }
          } catch (e) {
            console.warn('Trefle fetch error (route):', e && e.message ? e.message : e);
          }
        }

        // Then Wikipedia (if available)
        if (External && typeof External.fetchFromWikipedia === 'function') {
          try {
            console.log(`API debug — Wikipedia: buscando "${sci || `${genus} ${species}`.trim()}"`);
            const wiki = await External.fetchFromWikipedia(sci || `${genus} ${species}`.trim());
            if (wiki) {
              const enriched = mergeExternalIntoPlant(p, wiki);
              if (enriched > 0) totalEnriched += enriched;
              totalFoundByWiki += 1;
            }
          } catch (e) {
            console.warn('Wikipedia fetch error (route):', e && e.message ? e.message : e);
          }
        }

        // If still missing and External.search exists, try a general search (last resort)
        if ((!p.description || p.description === '') && External && typeof External.search === 'function') {
          try {
            const q = sci || `${genus} ${species}`.trim() || p.common_name || '';
            if (q) {
              const sres = await External.search(q);
              if (sres) {
                const enriched = mergeExternalIntoPlant(p, sres);
                if (enriched > 0) totalEnriched += enriched;
              }
            }
          } catch (e) {
            console.warn('External.search error (route):', e && e.message ? e.message : e);
          }
        }

        // optional translation step (non destructive)
        if (TRANSLATE_ENABLED) {
          try {
            if (p.description && p.description !== '') {
              const translated = await tryTranslate(p.description);
              if (translated && translated !== p.description) p.description = translated;
            }
            if (p.habitat && p.habitat !== '') {
              const translated = await tryTranslate(p.habitat);
              if (translated && translated !== p.habitat) p.habitat = translated;
            }
          } catch (e) {
            console.warn('Translation in list enrichment failed:', e && e.message ? e.message : e);
          }
        }

        // finished for this plant
      } // end loop

      console.log(`API debug — Enriquecido total: ${totalEnriched} (Trefle encontrados: ${totalFoundByTrefle}, Wiki encontrados: ${totalFoundByWiki})`);

      // 4) RESPONDER AL CLIENTE con la lista (truncamos al límite solicitado)
      const outList = plants.slice(0, limit);
      res.json(outList);

      // 5) EN SEGUNDO PLANO: upsert de nuevos y actualización de campos vacíos en DB
      (async () => {
        try {
          if (!PlantsModel || typeof PlantsModel.upsertMany !== 'function') {
            console.log('API debug — PlantsModel.upsertMany no disponible, no se harán upserts en background.');
            return;
          }

          // preparar arrays:
          const toInsert = []; // objects con claves tipo CSV (Family,Genus,Species,...)
          const toUpdate = []; // also via upsertMany

          // We will upsert:
          // - newFromPerenual items (no id) -> insert
          // - existing DB rows that gained new fields -> update

          // Helper to map normalized plant -> CSV-like object expected by upsertMany
          const mapToCsvLike = (pl) => {
            return {
              Family: pl.family || '',
              Genus: pl.genus || '',
              Species: pl.species || '',
              CommonName: pl.common_name || '',
              GrowthRate: pl.growth_rate || '',
              HardinessZones: pl.hardiness_zones || '',
              Height: pl.height || '',
              Width: pl.width || '',
              Type: pl.type || '',
              Foliage: pl.foliage || '',
              Pollinators: Array.isArray(pl.pollinators) ? pl.pollinators : (pl.pollinators ? String(pl.pollinators) : ''),
              Leaf: pl.leaf || '',
              Flower: pl.flower || '',
              Ripen: pl.ripen || '',
              Reproduction: pl.reproduction || '',
              Soils: Array.isArray(pl.soils) ? pl.soils : (pl.soils ? String(pl.soils) : ''),
              pH: pl.ph || '',
              pH_split: Array.isArray(pl.ph_split) ? pl.ph_split : (pl.ph_split ? String(pl.ph_split) : ''),
              Preferences: Array.isArray(pl.preferences) ? pl.preferences : (pl.preferences ? String(pl.preferences) : ''),
              Tolerances: Array.isArray(pl.tolerances) ? pl.tolerances : (pl.tolerances ? String(pl.tolerances) : ''),
              Habitat: pl.habitat || '',
              HabitatRange: pl.habitat_range || '',
              Edibility: (pl.edibility === true ? '1' : (pl.edibility === false ? '0' : null)),
              Medicinal: (pl.medicinal === true ? '1' : (pl.medicinal === false ? '0' : null)),
              OtherUses: pl.other_uses || '',
              PFAF: pl.pfaf || '',
              ImageURL: (Array.isArray(pl.images) && pl.images[0]) ? pl.images[0] : (pl.image_url || ''),
              description: pl.description || ''
            };
          };

          // a) nuevos desde Perenual
          for (const np of newFromPerenual) {
            toInsert.push(mapToCsvLike(np));
          }

          // b) actualizaciones: plants that came from DB but now have new fields
          // We'll fetch DB canonical row for each plant that has id (if present) and compare briefly.
          const updatesAccumulator = [];
          for (const pl of plants) {
            if (pl.source === 'db' && pl.id) {
              try {
                // reload canonical row
                let currentRow = null;
                if (PlantsModel && typeof PlantsModel.findById === 'function') {
                  currentRow = await PlantsModel.findById(pl.id);
                } else {
                  const rows = await runQuery('SELECT * FROM plants WHERE id = ? LIMIT 1', [pl.id]);
                  if (Array.isArray(rows) && rows.length) currentRow = rows[0];
                }
                if (!currentRow) continue;
                // quick checks: if DB description null/empty and pl.description has value -> queue update
                const dbDesc = currentRow.description || '';
                const dbImg = currentRow.ImageURL || currentRow.image_url || '';
                const needUpdate = {};
                if ((!dbDesc || String(dbDesc).trim() === '') && pl.description && String(pl.description).trim() !== '') {
                  needUpdate.description = pl.description;
                }
                if ((!dbImg || String(dbImg).trim() === '') && pl.image_url && String(pl.image_url).trim() !== '') {
                  needUpdate.ImageURL = pl.image_url;
                }
                // check habitat/other_uses/pfaf
                if ((!currentRow.Habitat || String(currentRow.Habitat).trim() === '') && pl.habitat && String(pl.habitat).trim() !== '') {
                  needUpdate.Habitat = pl.habitat;
                }
                if ((!currentRow.HabitatRange || String(currentRow.HabitatRange).trim() === '') && pl.habitat_range && String(pl.habitat_range).trim() !== '') {
                  needUpdate.HabitatRange = pl.habitat_range;
                }
                if ((!currentRow.OtherUses || String(currentRow.OtherUses).trim() === '') && pl.other_uses && String(pl.other_uses).trim() !== '') {
                  needUpdate.OtherUses = pl.other_uses;
                }
                if ((!currentRow.PFAF || String(currentRow.PFAF).trim() === '') && pl.pfaf && String(pl.pfaf).trim() !== '') {
                  needUpdate.PFAF = pl.pfaf;
                }

                // add Id-identifiers so upsertMany can detect row
                if (Object.keys(needUpdate).length) {
                  // include identifying fields
                  const upObj = Object.assign({
                    Genus: pl.genus || '',
                    Species: pl.species || '',
                    CommonName: pl.common_name || ''
                  }, needUpdate);
                  updatesAccumulator.push(upObj);
                }
              } catch (e) {
                console.warn('Background update check error for id', pl.id, e && e.message ? e.message : e);
              }
            }
          }

          // combine inserts and updates
          const allToUpsert = [];
          if (toInsert.length) allToUpsert.push(...toInsert);
          if (updatesAccumulator.length) allToUpsert.push(...updatesAccumulator);

          if (allToUpsert.length) {
            try {
              console.log(`API debug — Background upsert: intentando añadir/actualizar ${allToUpsert.length} registros en DB`);
              await PlantsModel.upsertMany(allToUpsert);
              console.log('API debug — Background upsert completado');
            } catch (e) {
              console.warn('API debug — upsertMany background failed:', e && e.message ? e.message : e);
            }
          } else {
            console.log('API debug — Background upsert: nada que hacer');
          }
        } catch (e) {
          console.warn('API debug — background task failed:', e && e.message ? e.message : e);
        }
      })();

      // FIN handler
      return;
    } catch (err) {
      console.error('Error en GET /api/plants ->', err);
      res.status(500).json({ error: 'Error interno leyendo plants', detail: String(err && err.message ? err.message : err) });
    }
  });

  // GET /:id (mantener como tienes, ya hace enriquecimiento puntual)
  router.get('/:id', async (req, res) => {
    const id = req.params.id;
    try {
      let row = null;
      if (PlantsModel && typeof PlantsModel.findById === 'function') {
        row = await PlantsModel.findById(id);
      } else {
        const rows = await runQuery('SELECT * FROM plants WHERE id = ? LIMIT 1', [id]);
        row = (Array.isArray(rows) && rows[0]) ? rows[0] : rows;
      }
      if (!row) return res.status(404).json({ error: 'No encontrada' });

      const normal = normalizeRow(row);
      // (si quieres mantener enriquecimiento por planta, reutiliza código similar al del listado)
      return res.json(normal);
    } catch (err) {
      console.error('Error en GET /api/plants/:id ->', err);
      res.status(500).json({ error: 'Error interno', detail: String(err && err.message ? err.message : err) });
    }
  });

  return router;
};
