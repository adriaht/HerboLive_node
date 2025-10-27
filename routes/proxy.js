// routes/proxy.js
// Proxy ligero y robusto para Trefle / Perenual / Wikipedia
// - maneja varios nombres de config/env
// - timeout fetch (AbortController)
// - per_page/limit = 0 => mapear a MAX_NO_LIMIT (por seguridad)
// - mejores mensajes de error

const express = require('express');
const fetch = require('node-fetch');

module.exports = function(config = {}) {
  const router = express.Router();

  // --- obtener configuración (flexible: config || env) ---
  const TREFLE_BASE = config.TREFLE_BASE || config.trefleBase || process.env.TREFLE_BASE || 'https://trefle.io';
  const TREFLE_TOKEN = config.trefleToken || config.TREFLE_TOKEN || process.env.TREFLE_TOKEN || '';

  const PERENUAL_BASE = config.PERENUAL_BASE || config.apiBaseUrl || config.PERENUAL_API_URL || process.env.PERENUAL_BASE || process.env.API_BASE_URL || process.env.PERENUAL_API_URL || 'https://perenual.com/api/species-list';
  const PERENUAL_KEY = config.perenualKey || config.PERENUAL_KEY || config.API_KEY_PERENUAL || process.env.PERENUAL_KEY || '';

  const MAX_NO_LIMIT = parseInt(process.env.MAX_NO_LIMIT || config.MAX_NO_LIMIT || '2000', 10) || 2000;
  const FETCH_TIMEOUT_MS = parseInt(process.env.PROXY_FETCH_TIMEOUT_MS || '20000', 10) || 20000;

  console.info('[proxy] init - trefle_token?', !!TREFLE_TOKEN, 'perenual_key?', !!PERENUAL_KEY, 'MAX_NO_LIMIT=', MAX_NO_LIMIT);

  function parseIntQuery(req, names, fallback) {
    for (const n of names) {
      if (typeof req.query[n] !== 'undefined' && req.query[n] !== '') {
        const v = parseInt(req.query[n], 10);
        if (!Number.isNaN(v)) return v;
      }
    }
    return fallback;
  }

  async function fetchWithTimeout(url, opts = {}, timeout = FETCH_TIMEOUT_MS) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (controller) opts.signal = controller.signal;
    const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
    try {
      const resp = await fetch(url, opts);
      if (timer) clearTimeout(timer);
      return resp;
    } catch (err) {
      if (timer) clearTimeout(timer);
      throw err;
    }
  }

  // --- Trefle proxy ---
  router.get('/trefle', async (req, res) => {
    try {
      if (!TREFLE_TOKEN) return res.status(422).json({ error: 'trefle no configurado' });

      const page = parseIntQuery(req, ['page'], 1);
      let limit = parseIntQuery(req, ['limit','per_page','perPage'], 100);
      if (limit === 0) limit = MAX_NO_LIMIT;

      // Construir URL (API pública de Trefle v1)
      const url = `${TREFLE_BASE}/api/v1/species?page=${page}&limit=${limit}&token=${encodeURIComponent(TREFLE_TOKEN)}`;

      console.info(`[proxy][trefle] GET ${url}`);
      const resp = await fetchWithTimeout(url, { method: 'GET', headers: { Accept: 'application/json' } });

      if (!resp) return res.status(502).json({ error: 'no response from trefle' });

      if (resp.status === 429) {
        return res.status(429).json({ error: 'trefle rate-limited (429)' });
      }

      const body = await resp.json().catch(async (e) => {
        const txt = await resp.text().catch(()=>null);
        throw new Error('invalid json from trefle: ' + String(txt || e.message || e));
      });

      return res.status(200).json(body);
    } catch (err) {
      console.error('[proxy][trefle] error', err && err.stack ? err.stack : err);
      return res.status(500).json({ error: 'proxy trefle failed', detail: String(err && err.message ? err.message : err) });
    }
  });

  // --- Perenual proxy ---
  router.get('/perenual', async (req, res) => {
    try {
      if (!PERENUAL_KEY) return res.status(422).json({ error: 'perenual no configurado' });

      const page = parseIntQuery(req, ['page'], 1);
      let per_page = parseIntQuery(req, ['per_page','perPage','limit'], 100);
      if (per_page === 0) per_page = MAX_NO_LIMIT;

      // Perenual expects: ?page=..&per_page=..&key=..
      const sep = PERENUAL_BASE.includes('?') ? '&' : '?';
      const url = `${PERENUAL_BASE}${sep}page=${page}&per_page=${per_page}&key=${encodeURIComponent(PERENUAL_KEY)}`;

      console.info(`[proxy][perenual] GET ${url}`);
      const resp = await fetchWithTimeout(url, { method: 'GET', headers: { Accept: 'application/json' } });

      if (!resp) return res.status(502).json({ error: 'no response from perenual' });

      if (resp.status === 429) {
        return res.status(429).json({ error: 'perenual rate-limited (429)' });
      }

      const body = await resp.json().catch(async (e) => {
        const txt = await resp.text().catch(()=>null);
        throw new Error('invalid json from perenual: ' + String(txt || e.message || e));
      });

      return res.status(200).json(body);
    } catch (err) {
      console.error('[proxy][perenual] error', err && err.stack ? err.stack : err);
      return res.status(500).json({ error: 'proxy perenual failed', detail: String(err && err.message ? err.message : err) });
    }
  });

  // --- Wikipedia summary proxy (REST /page/summary/{title}) ---
  router.get('/wiki', async (req, res) => {
    try {
      const titleRaw = (req.query.title || '').toString().trim();
      if (!titleRaw) return res.status(400).json({ error: 'missing title' });

      const title = encodeURIComponent(titleRaw.replace(/\s+/g, '_'));
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`;

      console.info(`[proxy][wiki] GET ${url}`);
      const resp = await fetchWithTimeout(url, { method: 'GET', headers: { 'User-Agent': 'HerboLive/1.0 (+https://your.site)' } }, 10000);

      if (!resp) return res.status(502).json({ error: 'no response from wikipedia' });

      const body = await resp.json().catch(async (e) => {
        const txt = await resp.text().catch(()=>null);
        throw new Error('invalid json from wikipedia: ' + String(txt || e.message || e));
      });

      return res.status(200).json(body);
    } catch (err) {
      console.error('[proxy][wiki] error', err && err.stack ? err.stack : err);
      return res.status(500).json({ error: 'proxy wiki failed', detail: String(err && err.message ? err.message : err) });
    }
  });

  // health
  router.get('/_health', (req, res) => {
    res.json({
      ok: true,
      trefle: !!TREFLE_TOKEN,
      perenual: !!PERENUAL_KEY,
      max_no_limit: MAX_NO_LIMIT
    });
  });

  return router;
};
