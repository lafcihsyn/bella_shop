// ╔══════════════════════════════════════════════════════════════╗
// ║  Stripe-Client + Checkout-Session-Helper                     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Wird sowohl von POST /api/orders (Session-Erstellung) als auch
// vom Webhook-Handler (Signatur-Verifikation) verwendet. Secret-Key
// wird via Firebase Secrets Manager geladen — niemals im Code.

const Stripe = require('stripe');
const { defineSecret } = require('firebase-functions/params');

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');

// Lazy-Initialisierung: Stripe-Client erst beim ersten Aufruf bauen,
// damit `require()` selbst keinen Zugriff auf das Secret braucht.
let _stripe;
function client() {
  if (!_stripe) {
    _stripe = Stripe(STRIPE_SECRET_KEY.value(), { apiVersion: '2024-06-20' });
  }
  return _stripe;
}

/**
 * Erstellt eine Stripe Checkout Session für den vollen Bestellbetrag.
 * (Online-Bestellungen werden komplett vorausbezahlt — keine Anzahlung.)
 *
 * @param {Object} params
 * @param {string} params.orderId — Firestore Doc-ID (pre-generated, noch nicht geschrieben)
 * @param {Object} params.order — Order-Daten inkl. measures, email, trackingToken
 * @param {number} params.amountGross — Brutto-Betrag in EUR (z.B. 195.80) — voller Bestellbetrag
 * @returns {Promise<Stripe.Checkout.Session>}
 */
async function createCheckoutSession({ orderId, order, amountGross }) {
  const cents = Math.round(amountGross * 100);
  const measuresDesc = order.measures
    .map(m => `${m.modelName} ${m.breite}×${m.hoehe}cm`)
    .join(', ')
    .slice(0, 200); // Stripe-Limit für description

  return client().checkout.sessions.create({
    mode: 'payment',
    locale: 'de',
    // payment_method_types weglassen → Stripe nutzt die im Dashboard aktivierten
    // Zahlungsmethoden (Card, EPS, Apple/Google Pay etc.). So managen wir das Set
    // im Dashboard, nicht im Code.
    customer_email: order.email,
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: {
          name: 'Fliegengitter — Online-Bestellung',
          description: measuresDesc
        },
        unit_amount: cents,
        tax_behavior: 'inclusive'
      },
      quantity: 1
    }],
    success_url: `https://fliegengitterwien.at/#/bestellung/${order.trackingToken}?paid=1`,
    cancel_url: `https://fliegengitterwien.at/#/cancel?token=${order.trackingToken}`,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    metadata: { orderId, trackingToken: order.trackingToken },
    payment_intent_data: {
      metadata: { orderId, trackingToken: order.trackingToken }
    }
  }, {
    // Idempotency: gleicher orderId ergibt nie zwei Sessions, falls POST /orders retried
    idempotencyKey: `order-${orderId}`
  });
}

module.exports = {
  client,
  createCheckoutSession,
  STRIPE_SECRET_KEY
};
