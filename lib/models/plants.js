// lib/models/plants.js
// Versión más robusta: soporta pool.query o pool.promise().query, y evita error si el COUNT(*) no viene en el formato esperado.

module.exports = function(pool) {

  // helper: ejecutar query y siempre devolver rows (array)
  async function execQuery(sql, params = []) {
    // si pool tiene promise(), úsalo (mysql2)
    if (pool && typeof pool.promise === 'function') {
      const [rows] = await pool.promise().query(sql, params);
      return rows;
    }
    // algunos pools devuelven [rows, fields] al usar pool.query con callback convertido a Promise
    const res = await pool.query(sql, params);
    // si res es un array y su primer elemento es rows, devuélvelo
    if (Array.isArray(res) && Array.isArray(res[0])) return res[0];
    // si res mismo es rows (por alguna razón), devuélvelo
    return Array.isArray(res) ? res : (res && typeof res === 'object' ? [res] : []);
  }

  return {
    async findById(id) {
      const rows = await execQuery('SELECT * FROM plants WHERE id = ? LIMIT 1', [id]);
      return (Array.isArray(rows) && rows[0]) ? rows[0] : null;
    },

    async findByQuery(q, page = 1, perPage = 12) {
      const offset = (page - 1) * perPage;
      const like = `%${q}%`;
      const sqlRows = `SELECT * FROM plants WHERE CommonName LIKE ? OR CONCAT(Genus, ' ', Species) LIKE ? OR Family LIKE ? LIMIT ? OFFSET ?`;
      const sqlCount = `SELECT COUNT(*) as total FROM plants WHERE CommonName LIKE ? OR CONCAT(Genus, ' ', Species) LIKE ? OR Family LIKE ?`;

      const rows = await execQuery(sqlRows, [like, like, like, perPage, offset]);

      // intenta obtener el total de forma robusta
      let countRows;
      try {
        countRows = await execQuery(sqlCount, [like, like, like]);
      } catch (e) {
        countRows = null;
      }

      let total;
      if (Array.isArray(countRows) && countRows[0] && typeof countRows[0].total !== 'undefined') {
        total = Number(countRows[0].total) || 0;
      } else {
        // fallback: no pudimos obtener total (por ejemplo driver distinto) -> estimar
        total = Array.isArray(rows) ? rows.length : 0;
      }

      return { rows: Array.isArray(rows) ? rows : [], total };
    },

    async listAll(page = 1, perPage = 12) {
      const offset = (page - 1) * perPage;
      const rows = await execQuery('SELECT * FROM plants ORDER BY CommonName LIMIT ? OFFSET ?', [perPage, offset]);

      let countRows;
      try {
        countRows = await execQuery('SELECT COUNT(*) as total FROM plants');
      } catch (e) {
        countRows = null;
      }

      let total;
      if (Array.isArray(countRows) && countRows[0] && typeof countRows[0].total !== 'undefined') {
        total = Number(countRows[0].total) || 0;
      } else {
        total = Array.isArray(rows) ? rows.length : 0;
      }

      return { rows: Array.isArray(rows) ? rows : [], total };
    },

    // upsertMany: intenta UPDATE por Genus+Species o CommonName; si no existe, INSERT
    async upsertMany(plantsArray = []) {
      // aqui seguimos usando la API del pool/connection tal y como estaba
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
              Habitat=?, HabitatRange=?, Edibility=?, Medicinal=?, OtherUses=?, PFAF=?, ImageURL=?
            WHERE (Genus IS NOT NULL AND Species IS NOT NULL AND Genus=? AND Species=?)
               OR (CommonName IS NOT NULL AND CommonName=?)
          `;

          const updateParams = [
            p.Family, p.Genus, p.Species, p.CommonName, p.GrowthRate, p.HardinessZones, p.Height, p.Width, p.Type, p.Foliage,
            Array.isArray(p.Pollinators) ? p.Pollinators.join(', ') : (p.Pollinators || null),
            p.Leaf, p.Flower, p.Ripen, p.Reproduction, p.Soils, p.pH, p.pH_split, p.Preferences, p.Tolerances,
            p.Habitat, p.HabitatRange, p.Edibility, p.Medicinal, p.OtherUses, p.PFAF, imageUrl,
            genus, species, common
          ];

          const [res] = await conn.query(updateSql, updateParams);

          if (res.affectedRows === 0) {
            // INSERT si no existía
            const insertSql = `
              INSERT INTO plants (
                Family, Genus, Species, CommonName, GrowthRate, HardinessZones, Height, Width, Type, Foliage,
                Pollinators, Leaf, Flower, Ripen, Reproduction, Soils, pH, pH_split, Preferences, Tolerances,
                Habitat, HabitatRange, Edibility, Medicinal, OtherUses, PFAF, ImageURL
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const insertParams = [
              p.Family, p.Genus, p.Species, p.CommonName, p.GrowthRate, p.HardinessZones, p.Height, p.Width, p.Type, p.Foliage,
              Array.isArray(p.Pollinators) ? p.Pollinators.join(', ') : (p.Pollinators || null),
              p.Leaf, p.Flower, p.Ripen, p.Reproduction, p.Soils, p.pH, p.pH_split, p.Preferences, p.Tolerances,
              p.Habitat, p.HabitatRange, p.Edibility, p.Medicinal, p.OtherUses, p.PFAF, imageUrl
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
        try { conn.release(); } catch(_) {}
      }
    }
  };
};