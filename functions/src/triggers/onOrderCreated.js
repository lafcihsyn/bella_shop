// ╔══════════════════════════════════════════════════════════════╗
// ║  Trigger: Bestellung erstmals als bezahlt markiert            ║
// ║  → Admin-Benachrichtigung                                     ║
// ║                                                                ║
// ║  Hinweis: Die Kunden-Email (Bestätigung + Rechnung kombiniert) ║
// ║  wird in onPaymentReceived.js verschickt — gemeinsam mit der   ║
// ║  PDF-Rechnung im Anhang. So bekommt der Kunde nur EINE Email.  ║
// ║  Der ursprüngliche Funktionsname bleibt aus Kompatibilität.    ║
// ╚══════════════════════════════════════════════════════════════╝

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

const { sendEmail, RESEND_API_KEY } = require('../email/sender');
const templates = require('../email/templates');
const company = require('../lib/company');
const { sendNewOrderPush } = require('../lib/push');

exports.onOrderCreated = onDocumentUpdated(
  {
    document: 'orders/{orderId}',
    region: 'europe-west1',
    secrets: [RESEND_API_KEY]
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const orderId = event.params.orderId;

    if (!before || !after) return;
    if (after.source !== 'online') return;
    if (!after.email) return;

    // Nur feuern wenn paymentStatus von !paid → paid wechselt.
    // Damit fließt die Bestätigung erst nach erfolgreicher Stripe-Zahlung raus.
    const wasPaid = before.paymentStatus === 'paid';
    const isPaid = after.paymentStatus === 'paid';
    if (wasPaid || !isPaid) return;

    console.log('[onOrderCreated] Bezahlung bestätigt:', after.orderNumber);

    // v1.20.0: Push an Mitarbeiter (Online-Bestellung jetzt bezahlt = echte neue Bestellung).
    // Best-effort, blockiert die Email nicht.
    await sendNewOrderPush(after, orderId);

    try {
      // Admin-Benachrichtigung. Die Kunden-Email kommt aus onPaymentReceived
      // (gemeinsam mit der PDF-Rechnung im Anhang).
      await sendEmail({
        to: company.adminEmail,
        subject: `📦 Neue Online-Bestellung ${after.orderNumber} (${after.vorname} ${after.nachname})`,
        html: templates.adminNewOrder(after)
      });

      await admin.firestore().collection('orders').doc(orderId).update({
        log: admin.firestore.FieldValue.arrayUnion({
          time: admin.firestore.Timestamp.now(),
          text: `Admin-Benachrichtigung versendet`
        })
      });

    } catch (err) {
      console.error('[onOrderCreated] Email-Fehler:', err);

      try {
        await admin.firestore().collection('orders').doc(orderId).update({
          log: admin.firestore.FieldValue.arrayUnion({
            time: admin.firestore.Timestamp.now(),
            text: `⚠ Admin-Email fehlgeschlagen: ${err.message}`
          })
        });
      } catch (e) { /* ignore */ }
    }
  }
);
