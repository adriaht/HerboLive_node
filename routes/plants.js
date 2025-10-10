// routes/plants.js
const express = require('express');

module.exports = function(config, PlantsModel, External) {
  const router = express.Router();

  // GET list (paginated)
  router.get('/', async (req, res) => {
    try {
      const page = parseInt(req.query.page || '1', 10);
      const per = parseInt(req.query.per_page || '12', 10);

      if (config.useDbFirst) {
        const { rows, total } = await PlantsModel.listAll(page, per);
        return res.json({ source: 'db', data: rows, total, page, per });
      }

      // API-first fallback: try DB, else CSV
      const { rows, total } = await PlantsModel.listAll(page, per);
      if (rows && rows.length) return res.json({ source: 'db', data: rows, total, page, per });

      const csvData = await External.readCsvLocal(page * per);
      if (csvData && csvData.length) {
        await PlantsModel.upsertMany(csvData);
        const { rows: newRows, total: newTotal } = await PlantsModel.listAll(page, per);
        return res.json({ source: 'csv', data: newRows, total: newTotal, page, per });
      }

      return res.json({ source: 'none', data: [], total: 0, page, per });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // SEARCH
  router.get('/search', async (req, res) => {
    try {
      const qRaw = (req.query.q || '').trim();
      const q = qRaw.toLowerCase();
      const page = parseInt(req.query.page || '1', 10);
      const per = parseInt(req.query.per_page || '12', 10);
      if (!q) return res.json({ total: 0, data: [] });

      if (config.useDbFirst) {
        const result = await PlantsModel.findByQuery(q, page, per);
        if (result.total > 0) return res.json({ source: 'db', ...result, page, per });

        // not found in db -> try APIs
        const peren = await External.fetchFromPerenual(q);
        const tref = await External.fetchFromTrefle(q);
        const toSave = [peren, tref].filter(Boolean);
        if (toSave.length) {
          await PlantsModel.upsertMany(toSave);
          const result2 = await PlantsModel.findByQuery(q, page, per);
          return res.json({ source: 'external', ...result2, page, per });
        }

        // fallback CSV
        const csv = await External.readCsvLocal(1000);
        const filtered = csv.filter(p =>
          (p.common_name && p.common_name.toLowerCase().includes(q)) ||
          (p.scientific_name && p.scientific_name.toLowerCase().includes(q))
        );
        if (filtered.length) {
          await PlantsModel.upsertMany(filtered);
          return res.json({ source: 'csv', data: filtered.slice((page-1)*per, page*per), total: filtered.length, page, per });
        }

        return res.json({ source: 'none', data: [], total: 0, page, per });
      } else {
        // API-first
        const peren = await External.fetchFromPerenual(q);
        const tref = await External.fetchFromTrefle(q);
        const sourceData = peren || tref;
        if (sourceData) {
          await PlantsModel.upsertMany([sourceData]);
          const result = await PlantsModel.findByQuery(q, page, per);
          return res.json({ source: peren ? 'perenual' : 'trefle', ...result, page, per });
        }

        // fallback DB
        const result = await PlantsModel.findByQuery(q, page, per);
        if (result.total > 0) return res.json({ source: 'db', ...result, page, per });

        // fallback CSV
        const csv = await External.readCsvLocal(1000);
        const filtered = csv.filter(p =>
          (p.common_name && p.common_name.toLowerCase().includes(q)) ||
          (p.scientific_name && p.scientific_name.toLowerCase().includes(q))
        );
        if (filtered.length) {
          await PlantsModel.upsertMany(filtered);
          return res.json({ source: 'csv', data: filtered.slice((page-1)*per, page*per), total: filtered.length, page, per });
        }

        return res.json({ source: 'none', data: [], total: 0, page, per });
      }
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // Manual CSV import (POST)
  router.post('/import-csv', async (req, res) => {
    try {
      const max = parseInt(req.body.max || String(config.csvMaxRead || 52), 10);
      const csvData = await External.readCsvLocal(max);
      if (!csvData || csvData.length === 0) return res.status(400).json({ error: 'CSV vacío o no encontrado' });
      await PlantsModel.upsertMany(csvData);
      return res.json({ imported: csvData.length });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Import failed' });
    }
  });

  // GET detail by id
  router.get('/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
      const row = await PlantsModel.findById(id);
      if (!row) return res.status(404).json({ error: 'Not found' });
      return res.json({ data: row });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
};
