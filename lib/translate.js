// /opt/herbolive/HerboLive_node/lib/translate.js
const fetch = require('node-fetch');

const DEFAULT_PROVIDER = process.env.TRANSLATE_PROVIDER || 'libretranslate';
const DEFAULT_URL = process.env.TRANSLATE_API_URL || 'https://libretranslate.de/translate';
const DEFAULT_TARGET = process.env.TRANSLATE_TARGET || 'es';
const ENABLE_TRANSLATE = (process.env.TRANSLATE_PROVIDER || 'none').toLowerCase() !== 'none';

// simple in-memory LRU-like cache (Map keeps insertion order)
const MAX_CACHE = 20000;
const cache = new Map();

function cacheGet(key) {
  const v = cache.get(key);
  if (v === undefined) return null;
  // refresh order
  cache.delete(key);
  cache.set(key, v);
  return v;
}
function cacheSet(key, value) {
  if (cache.size >= MAX_CACHE) {
    // drop oldest
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, value);
}

// safe JSON parse helper
async function safeJson(resp) {
  const ct = resp.headers.get('content-type') || '';
  const text = await resp.text();
  if (!ct.includes('application/json') && !ct.includes('text/json')) {
    // no JSON content-type — return null so caller can handle
    return { ok: false, bodyText: text };
  }
  try {
    return { ok: true, json: JSON.parse(text) };
  } catch (e) {
    return { ok: false, bodyText: text };
  }
}

// translate single text
async function translateText(text, opts = {}) {
  if (!text || String(text).trim() === '') return text;
  if (!ENABLE_TRANSLATE) return text;

  const source = opts.source || 'auto';
  const target = opts.target || DEFAULT_TARGET;
  const provider = (opts.provider || DEFAULT_PROVIDER).toLowerCase();
  const url = opts.url || DEFAULT_URL;

  const key = `${provider}|${source}|${target}|${String(text).slice(0,400)}`; // truncated text key
  const cached = cacheGet(key);
  if (cached) return cached;

  // build payload for LibreTranslate-like endpoints
  const payload = { q: String(text), source, target, format: 'text' };
  if (process.env.TRANSLATE_API_KEY) payload.api_key = process.env.TRANSLATE_API_KEY;

  // some basic retry/backoff
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
        timeout: 15000
      });

      // if not 2xx, try again maybe (but first inspect body)
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        // likely HTML or rate-limit; wait and retry a bit
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 500 * attempt));
          continue;
        } else {
          console.warn('translateText: non-OK response', resp.status, txt.slice(0,200));
          return text; // fallback
        }
      }

      // try parse JSON safely
      const parsed = await safeJson(resp);
      if (!parsed.ok) {
        // server returned HTML or invalid JSON
        console.warn('translateText: invalid json response body at', url, 'body starts:', (parsed.bodyText||'').slice(0,200));
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 500 * attempt));
          continue;
        }
        return text;
      }

      const json = parsed.json;
      // LibreTranslate returns { translatedText: "..." } usually
      const translated = json.translatedText || json.translated || json.result || json.output || (typeof json === 'string' ? json : null);
      const out = translated || text;
      cacheSet(key, out);
      return out;
    } catch (err) {
      console.warn('translateText error:', err && err.message ? err.message : err);
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 300 * attempt));
        continue;
      }
      return text;
    }
  }

  return text;
}

// translate fields of an object (strings & arrays)
async function translateObject(obj, fields = [], opts = {}) {
  if (!obj || typeof obj !== 'object') return obj;
  const cloned = Object.assign({}, obj);
  const tasks = [];

  for (const f of fields) {
    if (!Object.prototype.hasOwnProperty.call(cloned, f)) continue;
    const val = cloned[f];
    if (Array.isArray(val)) {
      // translate each element serially (small arrays)
      const promises = val.map(v => translateText(String(v), opts));
      tasks.push((async () => { cloned[f] = await Promise.all(promises); })());
    } else if (typeof val === 'string') {
      tasks.push((async () => { cloned[f] = await translateText(val, opts); })());
    } else {
      // leave as-is (boolean/number/null)
    }
  }

  await Promise.all(tasks);
  return cloned;
}

module.exports = {
  translateText,
  translateObject,
  ENABLE_TRANSLATE,
  DEFAULT_PROVIDER,
  DEFAULT_URL
};
