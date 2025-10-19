// lib/external_wikipedia.js
const https = require('https');

module.exports = function(config) {
  return {
    // Busca la página resumen en Wikipedia para un título (scientific name suele funcionar)
    async fetchFromWikipedia(title) {
      if (!title) return null;
      const encoded = encodeURIComponent(String(title).replace(/\s+/g, '_'));
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
      return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'HerboLive/1.0 (https://your.site)' } }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              if (res.statusCode === 200) {
                const json = JSON.parse(data);
                const out = {};
                if (json.extract) out.description = json.extract;
                if (json.thumbnail && json.thumbnail.source) out.image_url = json.thumbnail.source;
                // wikipedia summary often contains short habitat-like info inside extract; we return minimal
                resolve(out);
              } else {
                resolve(null);
              }
            } catch (e) { resolve(null); }
          });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(10000, () => { req.abort(); resolve(null); });
      });
    }
  };
};
