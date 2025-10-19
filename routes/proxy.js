// routes/proxy.js
const express = require('express');
const fetch = require('node-fetch');

module.exports = function(config = {}) {
  const router = express.Router();

  // Proxy para Trefle (simple GET list)
  router.get('/trefle', async (req, res) => {
    try {
      if (!config.TREFLE_BASE || !config.TREFLE_TOKEN) return res.status(400).json({ error: 'trefle no configurado' });
      const url = `${config.TREFLE_BASE}/api/v1/species?token=${config.TREFLE_TOKEN}&page=${req.query.page||1}&limit=${req.query.limit||100}`;
      const r = await fetch(url);
      const json = await r.json();
      res.json(json);
    } catch (e) {
      res.status(502).json({ error: 'proxy trefle failed', detail: String(e && e.message) });
    }
  });

  // Proxy para Perenual (list endpoint)
  router.get('/perenual', async (req, res) => {
    try {
      if (!config.API_BASE_URL || !config.API_KEY_PERENUAL) return res.status(400).json({ error: 'perenual no configurado' });
      const url = `${config.API_BASE_URL}?key=${encodeURIComponent(config.API_KEY_PERENUAL)}&page=${req.query.page||1}&per_page=${req.query.per_page||100}`;
      const r = await fetch(url);
      const json = await r.json();
      res.json(json);
    } catch (e) {
      res.status(502).json({ error: 'proxy perenual failed', detail: String(e && e.message) });
    }
  });

  // Wiki summary proxy (usa title)
  router.get('/wiki', async (req, res) => {
    try {
      const title = (req.query.title || '').trim();
      if (!title) return res.status(400).json({ error: 'missing title' });
      const safe = encodeURIComponent(title.replace(/\s+/g, '_'));
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${safe}`;
      const r = await fetch(url, { headers: { 'User-Agent': 'HerboLive/1.0 (+https://your.site)' } });
      const json = await r.json();
      res.json(json);
    } catch (e) {
      res.status(502).json({ error: 'proxy wiki failed', detail: String(e && e.message) });
    }
  });

  return router;
};
