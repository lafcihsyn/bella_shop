// ═══════════════════════════════════════════════════════════════
// API - HTTP-Wrapper
// ═══════════════════════════════════════════════════════════════

window.api = (function() {
  const base = window.SHOP_CONFIG.apiBase;

  async function request(path, options = {}) {
    const url = base + path;
    const opts = {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    };
    if (options.body && typeof options.body === 'object') {
      opts.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, opts);
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }

      if (!response.ok) {
        const err = new Error(data?.error || `HTTP ${response.status}`);
        err.status = response.status;
        err.body = data;
        throw err;
      }
      return data;
    } catch (err) {
      if (err.name === 'TypeError') {
        // Netzwerkfehler
        throw new Error('Verbindung zum Server fehlgeschlagen. Bitte Internetverbindung prüfen.');
      }
      throw err;
    }
  }

  return {
    health: () => request('/health'),
    getModels: () => request('/models'),
    getColors: () => request('/colors'),
    getPlisseeColors: () => request('/plissee-colors'),
    getNetzColors: () => request('/netz-colors'),
    getVariants: () => request('/variants'),
    getLegal: () => request('/legal'),
    getHero: () => request('/hero'),
    getLogo: () => request('/logo'),
    submitOrder: (orderData) => request('/orders', { method: 'POST', body: orderData }),
    trackOrder: (token) => request('/orders/track/' + encodeURIComponent(token)),
    lookupOrder: ({ orderNumber, email }) => request('/orders/lookup', { method: 'POST', body: { orderNumber, email } }),
    getEstimatedCompletion: (additionalStk) => request('/estimated-completion?additionalStk=' + (parseInt(additionalStk) || 0))
  };
})();
