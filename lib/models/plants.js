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
        `SELECT * FROM plants WHERE common_name LIKE ? OR scientific_name LIKE ? OR family LIKE ? LIMIT ? OFFSET ?`,
        [like, like, like, perPage, offset]
      );
      const [countRow] = await pool.query(
        `SELECT COUNT(*) as total FROM plants WHERE common_name LIKE ? OR scientific_name LIKE ? OR family LIKE ?`,
        [like, like, like]
      );
      return { rows, total: countRow[0].total };
    },

    async listAll(page = 1, perPage = 12) {
      const offset = (page - 1) * perPage;
      const [rows] = await pool.query('SELECT * FROM plants ORDER BY common_name LIMIT ? OFFSET ?', [perPage, offset]);
      const [countRow] = await pool.query('SELECT COUNT(*) as total FROM plants');
      return { rows, total: countRow[0].total };
    },

    // upsertMany: para cada planta intenta UPDATE por scientific_name o common_name,
    // si no hay coincidencia, inserta.
    async upsertMany(plantsArray = []) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        for (const p of plantsArray) {
          // Normalizar campos
          const scientific = p.scientific_name || null;
          const common = p.common_name || null;
          const imagesJson = JSON.stringify(p.images || []);
          const fields = [
            scientific,
            common,
            p.family || null,
            p.genus || null,
            p.species || null,
            p.description || null,
            p.image_url || null,
            imagesJson,
            p.growth_rate || null,
            p.hardiness_zones || null,
            p.height || null,
            p.width || null,
            p.type || null,
            p.foliage || null,
            Array.isArray(p.pollinators) ? p.pollinators.join(', ') : (p.pollinators || null),
            p.leaf || null,
            p.flower || null,
            p.ripen || null,
            p.reproduction || null,
            p.soils || null,
            p.pH || null,
            p.preferences || null,
            p.tolerances || null,
            p.habitat || null,
            p.habitat_range || null,
            p.edibility || null,
            p.medicinal || p.medicinal_uses || null,
            p.other_uses || null,
            p.pfaf || null,
            p.source || null
          ];

          // Primero intentar UPDATE por scientific_name OR common_name
          let updateSql = `
            UPDATE plants SET
              family=?, genus=?, species=?, description=?, image_url=?, images=?, growth_rate=?, hardiness_zones=?,
              height=?, width=?, type=?, foliage=?, pollinators=?, leaf=?, flower=?, ripen=?, reproduction=?, soils=?,
              pH=?, preferences=?, tolerances=?, habitat=?, habitat_range=?, edibility=?, medicinal=?, other_uses=?, pfaf=?, source=?, last_updated=CURRENT_TIMESTAMP
            WHERE (scientific_name IS NOT NULL AND scientific_name = ?)
               OR (common_name IS NOT NULL AND common_name = ?)
          `;
          const updateParams = [
            fields[2],fields[3],fields[4],fields[5],fields[6],fields[7],fields[8],fields[9],
            fields[10],fields[11],fields[12],fields[13],fields[14],fields[15],fields[16],fields[17],fields[18],fields[19],
            fields[20],fields[21],fields[22],fields[23],fields[24],fields[25],fields[26],fields[27],fields[28],
            scientific, common
          ];
          const [updateRes] = await conn.query(updateSql, updateParams);

          if (updateRes.affectedRows === 0) {
            // no existía -> INSERT
            const insertSql = `
              INSERT INTO plants (
                scientific_name, common_name, family, genus, species, description, image_url, images,
                growth_rate, hardiness_zones, height, width, type, foliage, pollinators, leaf, flower, ripen,
                reproduction, soils, pH, preferences, tolerances, habitat, habitat_range, edibility, medicinal, other_uses, pfaf, source
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const insertParams = [
              scientific, common, fields[2],fields[3],fields[4],fields[5],fields[6],fields[7],
              fields[8],fields[9],fields[10],fields[11],fields[12],fields[13],fields[14],fields[15],fields[16],fields[17],
              fields[18],fields[19],fields[20],fields[21],fields[22],fields[23],fields[24],fields[25],fields[26],fields[27],fields[28],fields[29]
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
