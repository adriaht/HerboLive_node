// lib/models/plants.js
module.exports = function(pool) {
  return {
    async findById(id) {
      const [rows] = await pool.query('SELECT * FROM plants WHERE id = ?', [id]);
      return rows[0] || null;
    },

    async findByQuery(q, page = 1, perPage = 12) {
      const offset = (page - 1) * perPage;
      const like = `%${q}%`;
      const [rows] = await pool.query(
        `SELECT * FROM plants WHERE CommonName LIKE ? OR CONCAT(Genus, ' ', Species) LIKE ? OR Family LIKE ? LIMIT ? OFFSET ?`,
        [like, like, like, perPage, offset]
      );
      const [countRow] = await pool.query(
        `SELECT COUNT(*) as total FROM plants WHERE CommonName LIKE ? OR CONCAT(Genus, ' ', Species) LIKE ? OR Family LIKE ?`,
        [like, like, like]
      );
      return { rows, total: (countRow && countRow[0] && countRow[0].total) || 0 };
    },

    async listAll(page = 1, perPage = 12) {
      const offset = (page - 1) * perPage;
      const [rows] = await pool.query('SELECT * FROM plants ORDER BY CommonName LIMIT ? OFFSET ?', [perPage, offset]);
      const [countRow] = await pool.query('SELECT COUNT(*) as total FROM plants');
      return { rows, total: countRow[0].total };
    },

    // updateById: actualiza columnas concretas por id (solo las keys presentes en updates)
    async updateById(id, updates = {}) {
      if (!id) throw new Error('id requerido para updateById');
      const keys = Object.keys(updates).filter(k => updates[k] !== undefined);
      if (keys.length === 0) return false;

      const columns = keys.map(k => `\`${k}\` = ?`).join(', ');
      const params = keys.map(k => {
        // si es array para columnas JSON-like, stringify
        if (Array.isArray(updates[k])) return JSON.stringify(updates[k]);
        return updates[k];
      });
      params.push(id);
      const sql = `UPDATE plants SET ${columns}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      const [res] = await pool.query(sql, params);
      return res.affectedRows > 0;
    },

    // upsertMany: intenta UPDATE por Genus+Species o CommonName; si no existe, INSERT
    async upsertMany(plantsArray = []) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        for (const p of plantsArray) {
          const genus = p.Genus || p.genus || null;
          const species = p.Species || p.species || null;
          const common = p.CommonName || p.commonName || p.common || null;
          const imageUrl = p.ImageURL || p.image_url || p.image || null;

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
            p.Genus || p.genus || null,
            p.Species || p.species || null,
            p.CommonName || p.commonName || p.common || null,
            p.GrowthRate || p.growth_rate || null,
            p.HardinessZones || p.hardiness_zones || null,
            p.Height || p.height || null,
            p.Width || p.width || null,
            p.Type || p.type || null,
            p.Foliage || p.foliage || null,
            Array.isArray(p.Pollinators) ? JSON.stringify(p.Pollinators) : (p.Pollinators || p.pollinators || null),
            p.Leaf || p.leaf || null,
            p.Flower || p.flower || null,
            p.Ripen || p.ripen || null,
            p.Reproduction || p.reproduction || null,
            p.Soils || p.soils || null,
            p.pH || p.ph || p.PH || null,
            p.pH_split || p.ph_split || null,
            p.Preferences || p.preferences || null,
            p.Tolerances || p.tolerances || null,
            p.Habitat || p.habitat || null,
            p.HabitatRange || p.habitat_range || null,
            p.Edibility != null ? p.Edibility : (p.edibility != null ? p.edibility : null),
            p.Medicinal != null ? p.Medicinal : (p.medicinal != null ? p.medicinal : null),
            p.OtherUses || p.other_uses || null,
            p.PFAF || p.pfaf || null,
            imageUrl,
            p.description || p.Description || p.description_text || null,
            genus, species, common
          ];

          const [res] = await conn.query(updateSql, updateParams);

          if (res.affectedRows === 0) {
            // INSERT si no existía
            const insertSql = `
              INSERT INTO plants (
                Family, Genus, Species, CommonName, GrowthRate, HardinessZones, Height, Width, Type, Foliage,
                Pollinators, Leaf, Flower, Ripen, Reproduction, Soils, pH, pH_split, Preferences, Tolerances,
                Habitat, HabitatRange, Edibility, Medicinal, OtherUses, PFAF, ImageURL, description
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const insertParams = [
              p.Family || p.family || null,
              p.Genus || p.genus || null,
              p.Species || p.species || null,
              p.CommonName || p.commonName || p.common || null,
              p.GrowthRate || p.growth_rate || null,
              p.HardinessZones || p.hardiness_zones || null,
              p.Height || p.height || null,
              p.Width || p.width || null,
              p.Type || p.type || null,
              p.Foliage || p.foliage || null,
              Array.isArray(p.Pollinators) ? JSON.stringify(p.Pollinators) : (p.Pollinators || p.pollinators || null),
              p.Leaf || p.leaf || null,
              p.Flower || p.flower || null,
              p.Ripen || p.ripen || null,
              p.Reproduction || p.reproduction || null,
              p.Soils || p.soils || null,
              p.pH || p.ph || p.PH || null,
              p.pH_split || p.ph_split || null,
              p.Preferences || p.preferences || null,
              p.Tolerances || p.tolerances || null,
              p.Habitat || p.habitat || null,
              p.HabitatRange || p.habitat_range || null,
              p.Edibility != null ? p.Edibility : (p.edibility != null ? p.edibility : null),
              p.Medicinal != null ? p.Medicinal : (p.medicinal != null ? p.medicinal : null),
              p.OtherUses || p.other_uses || null,
              p.PFAF || p.pfaf || null,
              imageUrl,
              p.description || p.Description || p.description_text || null
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
        conn.release();
      }
    }
  };
};
