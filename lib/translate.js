// lib/translate.js
const fetch = require('node-fetch');

module.exports = function(cfg = {}) {
  const provider = (cfg.TRANSLATE_PROVIDER || cfg.translateProvider || process.env.TRANSLATE_PROVIDER || 'mymemory').toLowerCase();
  const apiUrl = cfg.TRANSLATE_API_URL || process.env.TRANSLATE_API_URL || '';
  const apiKey = cfg.TRANSLATE_API_KEY || process.env.TRANSLATE_API_KEY || '';
  const defaultTarget = cfg.TRANSLATE_TARGET || process.env.TRANSLATE_TARGET || 'es';
  const timeout = parseInt(cfg.TRANSLATE_TIMEOUT || process.env.TRANSLATE_TIMEOUT || '8000', 10);

  function safeLog(...args) {
    if (process.env.NODE_ENV === 'test') return;
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
        signal: controller.signal,
        redirect: 'follow'
      });
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

  // LibreTranslate attempt (tries both common endpoints if apiUrl not exact)
  async function translateWithLibre(text, target = defaultTarget) {
    const candidates = [];
    if (apiUrl) candidates.push(apiUrl);
    candidates.push('https://de.libretranslate.com/translate');
    candidates.push('https://libretranslate.de/translate');

    for (const url of candidates) {
      try {
        const body = { q: text, source: 'auto', target, format: 'text' };
        if (apiKey) body.api_key = apiKey;
        const headers = {};
        if (apiKey) headers['X-API-Key'] = apiKey;
        const json = await postJson(url, body, headers);
        if (json && (json.translatedText || json.translated_text)) return json.translatedText || json.translated_text;
        if (typeof json === 'string') return json;
        // else keep trying other candidate
      } catch (e) {
        safeLog('libretranslate fail for', url, e && e.message ? e.message : e);
        // try next
      }
    }
    throw new Error('LibreTranslate not available');
  }

  // MyMemory fallback (uses EN as source by default; MyMemory rejects 'auto')
  async function translateWithMyMemory(text, target = defaultTarget) {
    // detect source language naively: assume English for short Latin text (common case)
    // MyMemory requires a source language (not "auto"), so default to 'en'
    const source = 'en';
    const encoded = encodeURIComponent(text);
    const langpair = `${source}|${target}`;
    const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=${langpair}`;
    const json = await getJson(url);
    if (json && json.responseData && json.responseData.translatedText) {
      return json.responseData.translatedText;
    }
    throw new Error('MyMemory unexpected response');
  }

  async function translateText(text, target = defaultTarget) {
    if (text == null) return text;
    if (typeof text !== 'string') return String(text);
    const trimmed = text.trim();
    if (!trimmed) return text;
    const order = (provider === 'auto' || !provider) ? ['mymemory','libretranslate'] : [provider];

    let lastErr = null;
    for (const p of order) {
      try {
        if (p === 'none') return text;
        if (p === 'libretranslate') {
          return await translateWithLibre(trimmed, target);
        } else if (p === 'mymemory') {
          return await translateWithMyMemory(trimmed, target);
        } else {
          // unknown provider: try mymemory then libre
          try { return await translateWithMyMemory(trimmed, target); } catch (e) { lastErr = e; }
          return await translateWithLibre(trimmed, target);
        }
      } catch (e) {
        lastErr = e;
        safeLog(`translateText provider=${p} failed:`, e && e.message ? e.message : e);
      }
    }
    throw lastErr || new Error('No translate provider available');
  }

  // translate object fields
  async function translateObjectFields(obj, fields = null, target = defaultTarget) {
    if (!obj || typeof obj !== 'object') return obj;
    const defaultFields = ['common_name','family','type','foliage','leaf','flower','ripen','reproduction','habitat','habitat_range','preferences','tolerances','other_uses','description'];
    const keys = Array.isArray(fields) ? fields : defaultFields;
    const out = Object.assign({}, obj);

    for (const k of keys) {
      if (!Object.prototype.hasOwnProperty.call(out, k)) continue;
      const v = out[k];
      if (v == null) continue;
      if (Array.isArray(v)) {
        const arr = [];
        for (const el of v) {
          if (typeof el === 'string' && el.trim()) {
            try { arr.push(await translateText(el, target)); } catch (e) { arr.push(el); }
          } else { arr.push(el); }
        }
        out[k] = arr;
      } else if (typeof v === 'string' && v.trim()) {
        try { out[k] = await translateText(v, target); } catch (e) { /* keep original */ }
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
