// lib/models/plants.js
// Modelo de plants: compatible con distintos clientes mysql/mysql2 y formas de retorno
module.exports = function(pool) {

  // normaliza la forma de respuesta de pool.query / pool.promise().query
  async function rawQuery(sql, params = []) {
    try {
      const res = await pool.query(sql, params);
      // mysql2 promise pool typically returns [rows, fields]
      if (Array.isArray(res) && Array.isArray(res[0])) return res[0];
      // some wrappers might return rows array directly
      if (Array.isArray(res)) return res;
      // fallback: res might be an object or other shape, return as-is in array form
      return res;
    } catch (err) {
      // fallback to .promise() if available (mysql package compatibility)
      if (pool && typeof pool.promise === 'function') {
        const [rows] = await pool.promise().query(sql, params);
        return rows;
      }
      throw err;
    }
  }

  return {
    // devuelve una fila (objeto) o null
    async findById(id) {
      const rows = await rawQuery('SELECT * FROM plants WHERE id = ? LIMIT 1', [id]);
      if (!rows) return null;
      // rows puede ser un array de filas o un único objeto (por seguridad)
      if (Array.isArray(rows)) return rows[0] || null;
      if (rows && typeof rows === 'object' && (rows.id || Object.keys(rows).length)) return rows;
      return null;
    },

    // búsqueda con paginación sencilla por q (busca en CommonName, Genus Species y Family)
    async findByQuery(q, page = 1, perPage = 12) {
      const offset = (page - 1) * perPage;
      const like = `%${q}%`;
      const rows = await rawQuery(
        `SELECT * FROM plants WHERE CommonName LIKE ? OR CONCAT(Genus, ' ', Species) LIKE ? OR Family LIKE ? LIMIT ? OFFSET ?`,
        [like, like, like, perPage, offset]
      );
      const countRows = await rawQuery(
        `SELECT COUNT(*) as total FROM plants WHERE CommonName LIKE ? OR CONCAT(Genus, ' ', Species) LIKE ? OR Family LIKE ?`,
        [like, like, like]
      );
      const total = (Array.isArray(countRows) && countRows[0] && (countRows[0].total !== undefined)) ? countRows[0].total
                    : (countRows && countRows.total !== undefined ? countRows.total : 0);
      return { rows: Array.isArray(rows) ? rows : (rows ? [rows] : []), total };
    },

    // listar todo paginado
    async listAll(page = 1, perPage = 12) {
      const offset = (page - 1) * perPage;
      const rows = await rawQuery('SELECT * FROM plants ORDER BY CommonName LIMIT ? OFFSET ?', [perPage, offset]);
      const countRows = await rawQuery('SELECT COUNT(*) as total FROM plants');
      const total = (Array.isArray(countRows) && countRows[0] && (countRows[0].total !== undefined)) ? countRows[0].total
                    : (countRows && countRows.total !== undefined ? countRows.total : 0);
      return { rows: Array.isArray(rows) ? rows : (rows ? [rows] : []), total };
    },

    // upsertMany: intenta UPDATE por Genus+Species o CommonName; si no existe, INSERT
    // Actualizado para incluir 'description' en UPDATE/INSERT si está presente en p.description
    async upsertMany(plantsArray = []) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        for (const p of plantsArray) {
          const genus = p.Genus || p.genus || null;
          const species = p.Species || p.species || null;
          const common = p.CommonName || p.commonName || p.common || null;
          const imageUrl = p.ImageURL || p.ImageUrl || p.image_url || p.image || null;
          const pollinatorsVal = Array.isArray(p.Pollinators) ? JSON.stringify(p.Pollinators) : (p.Pollinators || null);
          const soilsVal = Array.isArray(p.Soils) ? JSON.stringify(p.Soils) : (p.Soils || null);
          const preferencesVal = Array.isArray(p.Preferences) ? JSON.stringify(p.Preferences) : (p.Preferences || null);
          const tolerancesVal = Array.isArray(p.Tolerances) ? JSON.stringify(p.Tolerances) : (p.Tolerances || null);
          const phSplitVal = Array.isArray(p.pH_split) ? JSON.stringify(p.pH_split) : (p.pH_split || null);

          // UPDATE: incluye description
          const updateSql = `
            UPDATE plants SET
              Family=?, Genus=?, Species=?, CommonName=?, GrowthRate=?, HardinessZones=?, Height=?, Width=?, Type=?, Foliage=?,
              Pollinators=?, Leaf=?, Flower=?, Ripen=?, Reproduction=?, Soils=?, pH=?, pH_split=?, Preferences=?, Tolerances=?,
              Habitat=?, HabitatRange=?, Edibility=?, Medicinal=?, OtherUses=?, PFAF=?, ImageURL=?, description=?
            WHERE (Genus IS NOT NULL AND Species IS NOT NULL AND Genus=? AND Species=?)
               OR (CommonName IS NOT NULL AND CommonName=?)
          `;

          const updateParams = [
            p.Family || p.family || null,
            genus,
            species,
            p.CommonName || p.common_name || p.common || null,
            p.GrowthRate || p.growth_rate || null,
            p.HardinessZones || p.hardiness_zones || null,
            p.Height || p.height || null,
            p.Width || p.width || null,
            p.Type || p.type || null,
            p.Foliage || p.foliage || null,
            pollinatorsVal,
            p.Leaf || p.leaf || null,
            p.Flower || p.flower || null,
            p.Ripen || p.ripen || null,
            p.Reproduction || p.reproduction || null,
            soilsVal,
            p.pH || p.ph || null,
            phSplitVal,
            preferencesVal,
            tolerancesVal,
            p.Habitat || p.habitat || null,
            p.HabitatRange || p.habitat_range || null,
            (p.Edibility !== undefined ? p.Edibility : (p.edibility !== undefined ? p.edibility : null)),
            (p.Medicinal !== undefined ? p.Medicinal : (p.medicinal !== undefined ? p.medicinal : null)),
            p.OtherUses || p.other_uses || null,
            p.PFAF || p.pfaf || null,
            imageUrl,
            (p.description || p.Description || p.description_text || null),
            genus, species, common
          ];

          const [res] = await conn.query(updateSql, updateParams);

          if (res.affectedRows === 0) {
            // INSERT si no existía (incluye description)
            const insertSql = `
              INSERT INTO plants (
                Family, Genus, Species, CommonName, GrowthRate, HardinessZones, Height, Width, Type, Foliage,
                Pollinators, Leaf, Flower, Ripen, Reproduction, Soils, pH, pH_split, Preferences, Tolerances,
                Habitat, HabitatRange, Edibility, Medicinal, OtherUses, PFAF, ImageURL, description
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const insertParams = [
              p.Family || p.family || null,
              genus,
              species,
              p.CommonName || p.common_name || p.common || null,
              p.GrowthRate || p.growth_rate || null,
              p.HardinessZones || p.hardiness_zones || null,
              p.Height || p.height || null,
              p.Width || p.width || null,
              p.Type || p.type || null,
              p.Foliage || p.foliage || null,
              pollinatorsVal,
              p.Leaf || p.leaf || null,
              p.Flower || p.flower || null,
              p.Ripen || p.ripen || null,
              p.Reproduction || p.reproduction || null,
              soilsVal,
              p.pH || p.ph || null,
              phSplitVal,
              preferencesVal,
              tolerancesVal,
              p.Habitat || p.habitat || null,
              p.HabitatRange || p.habitat_range || null,
              (p.Edibility !== undefined ? p.Edibility : (p.edibility !== undefined ? p.edibility : null)),
              (p.Medicinal !== undefined ? p.Medicinal : (p.medicinal !== undefined ? p.medicinal : null)),
              p.OtherUses || p.other_uses || null,
              p.PFAF || p.pfaf || null,
              imageUrl,
              (p.description || p.Description || p.description_text || null)
            ];
            await conn.query(insertSql, insertParams);
          }
        }

        await conn.commit();
        return true;
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        try { conn.release(); } catch (er) {}
      }
    }
  };
};
