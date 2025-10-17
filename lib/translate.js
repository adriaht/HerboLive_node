// lib/translate.js
// Factory: const Translator = require('./lib/translate')(config);
// Config via env OR pasando config object { provider, apiUrl, apiKey, target, timeout }

const fetch = require('node-fetch');

module.exports = function(cfg = {}) {
  const provider = (cfg.TRANSLATE_PROVIDER || cfg.translateProvider || process.env.TRANSLATE_PROVIDER || 'none').toLowerCase();
  const apiUrl = cfg.TRANSLATE_API_URL || process.env.TRANSLATE_API_URL || '';
  const apiKey = cfg.TRANSLATE_API_KEY || process.env.TRANSLATE_API_KEY || '';
  const defaultTarget = cfg.TRANSLATE_TARGET || process.env.TRANSLATE_TARGET || 'es';
  const timeout = parseInt(cfg.TRANSLATE_TIMEOUT || process.env.TRANSLATE_TIMEOUT || '8000', 10);

  function safeLog(...args) {
    if (process && process.env && process.env.NODE_ENV === 'test') return;
    console.log('[translate]', ...args);
  }

  async function postJson(url, body, headers = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json', 'Accept': 'application/json' }, headers),
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(id);
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      const text = await res.text();
      // si viene HTML, devolvemos error
      if (!ct.includes('application/json')) {
        // a veces libretranslate devuelve una página con redirect -> HTML
        throw new Error(`invalid json response body at ${url} (content-type=${ct})`);
      }
      return JSON.parse(text);
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  }

  async function getJson(url) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal });
      clearTimeout(id);
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      const text = await res.text();
      if (!ct.includes('application/json')) {
        throw new Error(`invalid json response body at ${url} (content-type=${ct})`);
      }
      return JSON.parse(text);
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  }

  // Provider implementations
  async function translateWithLibre(text, target = defaultTarget) {
    const url = apiUrl || 'https://libretranslate.de/translate';
    const body = { q: text, source: 'auto', target: target, format: 'text' };
    // some instances require an API key in X-API-Key or body.api_key
    if (apiKey) body.api_key = apiKey;
    const headers = {};
    if (apiKey && apiKey.length <= 256) headers['X-API-Key'] = apiKey;
    const json = await postJson(url, body, headers);
    // libretranslate: { translatedText: "..." }
    if (json && (json.translatedText || json.translated_text)) return json.translatedText || json.translated_text;
    // some instances respond slightly different
    if (typeof json === 'string') return json;
    throw new Error('Unexpected response from LibreTranslate');
  }

  // MyMemory fallback (returns JSON). Example URL:
  // https://api.mymemory.translated.net/get?q=Hello%20world!&langpair=en|es
  async function translateWithMyMemory(text, target = defaultTarget) {
    // use 'auto' as source if possible; MyMemory accepts 'langpair=en|es' best-effort
    const encoded = encodeURIComponent(text);
    const langpair = `auto|${target}`;
    const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=${langpair}`;
    const json = await getJson(url);
    // structure: { responseData: { translatedText: "..." }, matches: [...] }
    if (json && json.responseData && json.responseData.translatedText) {
      return json.responseData.translatedText;
    }
    throw new Error('Unexpected response from MyMemory');
  }

  // Top-level translation function with fallbacks and safety
  async function translateText(text, target = defaultTarget) {
    if (!text && text !== 0) return text;
    // do not attempt to translate booleans or objects
    if (typeof text !== 'string') {
      if (Array.isArray(text)) return text; // leave arrays to be processed elsewhere
      return String(text);
    }
    // trim
    const trimmed = text.trim();
    if (trimmed.length === 0) return text;

    // avoid translating extremely long blocks (optional safeguard)
    const MAX_LENGTH = 5000;
    const toTranslate = trimmed.length > MAX_LENGTH ? trimmed.slice(0, MAX_LENGTH) : trimmed;

    const order = (provider === 'auto' || !provider) ? ['libretranslate', 'mymemory'] : [provider];

    let lastErr = null;
    for (const p of order) {
      try {
        if (p === 'none') return text;
        if (p === 'libretranslate') {
          const t = await translateWithLibre(toTranslate, target);
          return trimmed.length > MAX_LENGTH ? t + '...' : t;
        } else if (p === 'mymemory') {
          const t = await translateWithMyMemory(toTranslate, target);
          return trimmed.length > MAX_LENGTH ? t + '...' : t;
        } else {
          // unknown provider: attempt libretranslate then mymemory
          try {
            const t = await translateWithLibre(toTranslate, target);
            return trimmed.length > MAX_LENGTH ? t + '...' : t;
          } catch (e) {
            lastErr = e;
            const t2 = await translateWithMyMemory(toTranslate, target);
            return trimmed.length > MAX_LENGTH ? t2 + '...' : t2;
          }
        }
      } catch (e) {
        lastErr = e;
        safeLog(`translateText: provider=${p} failed:`, e && e.message ? e.message : e);
        // try next
      }
    }
    // all failed -> throw last error (caller should handle)
    throw lastErr || new Error('No translate provider available');
  }

  // Translate an object's textual fields in place (returns new object)
  // fields: optional array of keys to translate; if omitted uses sensible defaults
  async function translateObjectFields(obj, fields = null, target = defaultTarget) {
    if (!obj || typeof obj !== 'object') return obj;
    const defaultFields = ['common_name','family','type','foliage','leaf','flower','ripen','reproduction','habitat','habitat_range','preferences','tolerances','other_uses','description'];
    const keys = Array.isArray(fields) ? fields : defaultFields;

    const out = Object.assign({}, obj);
    for (const k of keys) {
      if (!Object.prototype.hasOwnProperty.call(out, k)) continue;
      const v = out[k];
      if (v == null) continue;
      // arrays of strings: translate each element
      if (Array.isArray(v)) {
        try {
          const arr = [];
          for (const el of v) {
            if (typeof el === 'string' && el.trim().length > 0) {
              try {
                const t = await translateText(el, target);
                arr.push(t);
              } catch (e) {
                arr.push(el);
              }
            } else {
              arr.push(el);
            }
          }
          out[k] = arr;
        } catch (e) {
          out[k] = v;
        }
      } else if (typeof v === 'string' && v.trim().length > 0) {
        try {
          out[k] = await translateText(v, target);
        } catch (e) {
          out[k] = v;
        }
      }
    }
    return out;
  }

  return {
    provider,
    apiUrl,
    apiKey,
    target: defaultTarget,
    translateText,
    translateObjectFields
  };
};
