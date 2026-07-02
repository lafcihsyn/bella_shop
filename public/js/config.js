// ═══════════════════════════════════════════════════════════════
// CONFIG - Frontend-Konfiguration
// ═══════════════════════════════════════════════════════════════

window.SHOP_CONFIG = {
  // API-Basis-URL
  // Lokal (Firebase Emulator):  http://localhost:5001/fliegengitter-3486c/europe-west1/api
  // Produktion (Hosting-Rewrite): /api  (siehe firebase.json)
  apiBase: '/api',

  // Firma (für Anzeige im Frontend)
  company: {
    name: 'Bella Home',
    address: 'Oberlaaerstraße 285, 1230 Wien',
    phone: '+43 660 200 06 44',
    whatsapp: 'https://wa.me/436602000644',
    email: 'info@bellahome.at',
    hours: 'Mo–Fr 09:00–19:00, Sa 09:00–18:00'
  },

  // Validierung
  validation: {
    minOrderEur: 0,  // kein Mindestbestellwert
    maxStueckPerMass: 20
  }
};
