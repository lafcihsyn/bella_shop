// ╔══════════════════════════════════════════════════════════════╗
// ║  Bella Home Webshop - Cloud Functions                        ║
// ║  Version: 1.0.0                                              ║
// ║  Region: europe-west1 (Belgien - nächste zu Wien)            ║
// ╚══════════════════════════════════════════════════════════════╝

const admin = require('firebase-admin');
const { setGlobalOptions } = require('firebase-functions/v2');

admin.initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

// ── API (HTTP-Endpunkt für Bestellungen) ───────────────────────
exports.api = require('./src/api').api;

// ── Stripe Webhook (separat, raw body) ─────────────────────────
exports.stripeWebhook = require('./src/payments/webhook').stripeWebhook;

// ── Firestore-Trigger ──────────────────────────────────────────
exports.onOrderCreated = require('./src/triggers/onOrderCreated').onOrderCreated;
exports.onOrderStatusChange = require('./src/triggers/onOrderStatusChange').onOrderStatusChange;
exports.onPaymentReceived = require('./src/triggers/onPaymentReceived').onPaymentReceived;

// ── Geplantes Auto-Backup (jeden Abend 19:00 Wien → Cloud Storage) ─
exports.scheduledBackup = require('./src/triggers/scheduledBackup').scheduledBackup;

// ── Push bei neuer Filial-/App-Bestellung (FCM) ────────────────
exports.onOrderPlaced = require('./src/triggers/onOrderPlaced').onOrderPlaced;
