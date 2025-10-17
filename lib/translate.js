// lib/translate.js
const fetch = require('node-fetch');

module.exports = function (config = {}) {
  const provider = (process.env.TRANSLATE_PROVIDER || config.TRANSLATE_PROVIDER || 'none').toLowerCase();
  const targetDefault = process.env.TRANSLATE_TARGET || config.TRANSLATE_TARGET || 'es';
  const timeout = parseInt(process.env.TRANSLATE_TIMEOUT || config.TRANSLATE_TIMEOUT || '8000', 10);

  async function fetchWithTimeout(url, opts = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    opts.signal = controller.signal;
    try {
      const res = await fetch(url, opts);
      clearTimeout(id);
      return res;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  }

  async function translateLibre(text, target = targetDefault) {
    const apiUrl = process.env.TRANSLATE_API_URL || config.TRANSLATE_API_URL || 'https://libretranslate.de/translate';
    // Some LibreTranslate instances redirect to a base path; use the returned location if we get 301/302.
    try {
      const res = await fetchWithTimeout(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text, source: 'auto', target, format: 'text' })
      });
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      // if HTML returned (bad instance), throw to fallback
      if (!res.ok) throw new Error(`LibreTranslate responded ${res.status}`);
      if (contentType.includes('application/json')) {
        const json = await res.json();
        return json.translatedText || json.result || json;
      } else {
        // Unexpected HTML or text -> indicate error
        const body = await res.text();
        throw new Error('LibreTranslate returned non-JSON: ' + (body && body.slice ? body.slice(0,200) : String(body)));
      }
    } catch (e) {
      throw e;
    }
  }

  async function translateMyMemory(text, target = targetDefault) {
    // MyMemory expects langpair=EN|ES (we use auto|target)
    const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) + '&langpair=auto|' + encodeURIComponent(target);
    try {
      const res = await fetchWithTimeout(url, { method: 'GET' });
      if (!res.ok) throw new Error('MyMemory responded ' + res.status);
      const json = await res.json();
      if (json && json.responseData && json.responseData.translatedText) return json.responseData.translatedText;
      throw new Error('MyMemory returned unexpected payload');
    } catch (e) {
      throw e;
    }
  }

  async function translateText(text, target = targetDefault) {
    if (!text) return text;
    if (provider === 'none') return text;
    try {
      if (provider === 'libretranslate') {
        return await translateLibre(text, target);
      }
      if (provider === 'mymemory') {
        return await translateMyMemory(text, target);
      }
      // try libre then mymemory fallback
      try { return await translateLibre(text, target); } catch (_) { return await translateMyMemory(text, target); }
    } catch (e) {
      // bubble up but caller should catch
      throw e;
    }
  }

  return {
    provider,
    translateText,
    translate: translateText
  };
};
