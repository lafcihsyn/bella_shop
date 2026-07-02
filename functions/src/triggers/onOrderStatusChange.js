// ╔══════════════════════════════════════════════════════════════╗
// ║  Trigger: Status-Wechsel einer Bestellung                    ║
// ║  → Email-Benachrichtigung an Kunde bei wichtigen Statuses    ║
// ╚══════════════════════════════════════════════════════════════╝

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

const { sendEmail, RESEND_API_KEY } = require('../email/sender');
const templates = require('../email/templates');

// Statuses, bei denen der Kunde benachrichtigt wird
const NOTIFY_STATUSES = ['In Produktion', 'Abholbereit', 'Abgeholt'];

exports.onOrderStatusChange = onDocumentUpdated(
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
    if (after.source !== 'online') return; // nur Online-Bestellungen
    if (!after.email) return;

    const oldStatus = before.column;
    const newStatus = after.column;

    if (oldStatus === newStatus) return;
    if (!NOTIFY_STATUSES.includes(newStatus)) return;

    // Mitarbeiter kann das Senden in der FG App pro Move bewusst unterdrücken
    // (Checkbox im Verschieben-Dialog für Online-Bestellungen).
    if (after.skipNotifyEmail === true) {
      console.log(`[onOrderStatusChange] ${after.orderNumber}: ${oldStatus} → ${newStatus} — Email-Versand unterdrückt (skipNotifyEmail=true)`);
      await admin.firestore().collection('orders').doc(orderId).update({
        log: admin.firestore.FieldValue.arrayUnion({
          time: admin.firestore.Timestamp.now(),
          text: `Status-Email "${newStatus}" wurde NICHT gesendet (manuell unterdrückt)`
        })
      });
      return;
    }

    console.log(`[onOrderStatusChange] ${after.orderNumber}: ${oldStatus} → ${newStatus}`);

    try {
      await sendEmail({
        to: after.email,
        subject: `${after.orderNumber}: ${newStatus} — Bella Home`,
        html: templates.statusUpdate(after, newStatus)
      });

      await admin.firestore().collection('orders').doc(orderId).update({
        log: admin.firestore.FieldValue.arrayUnion({
          time: admin.firestore.Timestamp.now(),
          text: `Status-Email "${newStatus}" an ${after.email} versendet`
        })
      });

    } catch (err) {
      console.error('[onOrderStatusChange] Email-Fehler:', err);
      try {
        await admin.firestore().collection('orders').doc(orderId).update({
          log: admin.firestore.FieldValue.arrayUnion({
            time: admin.firestore.Timestamp.now(),
            text: `⚠ Status-Email fehlgeschlagen: ${err.message}`
          })
        });
      } catch (e) { /* ignore */ }
    }
  }
);
