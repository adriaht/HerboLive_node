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
      return { rows, total: countRow[0].total };
    },

    async listAll(page = 1, perPage = 12) {
      const offset = (page - 1) * perPage;
      const [rows] = await pool.query('SELECT * FROM plants ORDER BY CommonName LIMIT ? OFFSET ?', [perPage, offset]);
      const [countRow] = await pool.query('SELECT COUNT(*) as total FROM plants');
      return { rows, total: countRow[0].total };
    },

    // upsertMany: intenta UPDATE por Genus+Species o CommonName; si no existe, INSERT
    async upsertMany(plantsArray = []) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        for (const p of plantsArray) {
          const genus = p.Genus || null;
          const species = p.Species || null;
          const common = p.CommonName || null;
          const imageUrl = p.ImageURL || null;

          const updateSql = `
            UPDATE plants SET
              Family=?, Genus=?, Species=?, CommonName=?, GrowthRate=?, HardinessZones=?, Height=?, Width=?, Type=?, Foliage=?,
              Pollinators=?, Leaf=?, Flower=?, Ripen=?, Reproduction=?, Soils=?, pH=?, pH_split=?, Preferences=?, Tolerances=?,
              Habitat=?, HabitatRange=?, Edibility=?, Medicinal=?, OtherUses=?, PFAF=?, description=?, ImageURL=?
            WHERE (Genus IS NOT NULL AND Species IS NOT NULL AND Genus=? AND Species=?)
               OR (CommonName IS NOT NULL AND CommonName=?)
          `;

          const updateParams = [
            p.Family, p.Genus, p.Species, p.CommonName, p.GrowthRate, p.HardinessZones, p.Height, p.Width, p.Type, p.Foliage,
            Array.isArray(p.Pollinators) ? p.Pollinators.join(', ') : (p.Pollinators || null),
            p.Leaf, p.Flower, p.Ripen, p.Reproduction, p.Soils, p.pH, p.pH_split, p.Preferences, p.Tolerances,
            p.Habitat, p.HabitatRange, p.Edibility, p.Medicinal, p.OtherUses, p.PFAF, p.description || null, imageUrl,
            genus, species, common
          ];

          const [res] = await conn.query(updateSql, updateParams);

          if (res.affectedRows === 0) {
            // INSERT si no existía
            const insertSql = `
              INSERT INTO plants (
                Family, Genus, Species, CommonName, GrowthRate, HardinessZones, Height, Width, Type, Foliage,
                Pollinators, Leaf, Flower, Ripen, Reproduction, Soils, pH, pH_split, Preferences, Tolerances,
                Habitat, HabitatRange, Edibility, Medicinal, OtherUses, PFAF, description, ImageURL
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const insertParams = [
              p.Family, p.Genus, p.Species, p.CommonName, p.GrowthRate, p.HardinessZones, p.Height, p.Width, p.Type, p.Foliage,
              Array.isArray(p.Pollinators) ? p.Pollinators.join(', ') : (p.Pollinators || null),
              p.Leaf, p.Flower, p.Ripen, p.Reproduction, p.Soils, p.pH, p.pH_split, p.Preferences, p.Tolerances,
              p.Habitat, p.HabitatRange, p.Edibility, p.Medicinal, p.OtherUses, p.PFAF, p.description || null, imageUrl
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
