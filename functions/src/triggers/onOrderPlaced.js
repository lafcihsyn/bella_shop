// ╔══════════════════════════════════════════════════════════════╗
// ║  Trigger: Neue Bestellung angelegt → Push an Mitarbeiter      ║
// ║  v1.20.0                                                       ║
// ║                                                                ║
// ║  Nur FILIAL-/App-Bestellungen (direkt mit column='Bestellung'  ║
// ║  angelegt). Online-Bestellungen sind beim Anlegen 'pending' —  ║
// ║  deren Push kommt erst bei Zahlungseingang (onOrderCreated).   ║
// ╚══════════════════════════════════════════════════════════════╝

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { sendNewOrderPush } = require('../lib/push');

exports.onOrderPlaced = onDocumentCreated(
  { document: 'orders/{orderId}', region: 'europe-west1' },
  async (event) => {
    const order = event.data && event.data.data();
    if (!order) return;
    // Online → Push erst bei Zahlung (onOrderCreated), nicht beim pending-Anlegen.
    if (order.source === 'online') return;
    // Nur echte neue Bestellungen (keine Entwürfe/Reparatur/B-Ware).
    if (order.column !== 'Bestellung') return;
    await sendNewOrderPush(order, event.params.orderId);
  }
);
