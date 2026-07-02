// ╔══════════════════════════════════════════════════════════════╗
// ║  Trigger: Zahlung empfangen                                  ║
// ║  → Rechnung (PDF) bei voller Bezahlung                       ║
// ║  → EINE Kunden-Email: Bestätigung + Rechnung mit PDF-Anhang   ║
// ║                                                              ║
// ║  Wird ausgelöst wenn 'paid: false → true' wechselt.          ║
// ╚══════════════════════════════════════════════════════════════╝

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

const { sendEmail, RESEND_API_KEY } = require('../email/sender');
const { generateInvoiceNumber } = require('../lib/counters');
const { generateInvoicePDF } = require('../lib/pdf');
const templates = require('../email/templates');
const company = require('../lib/company');

exports.onPaymentReceived = onDocumentUpdated(
  {
    document: 'orders/{orderId}',
    region: 'europe-west1',
    memory: '512MiB',
    timeoutSeconds: 60,
    secrets: [RESEND_API_KEY]
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const orderId = event.params.orderId;

    if (!before || !after) return;
    if (after.source !== 'online') return;

    const oldPaid = !!before.paid;
    const newPaid = !!after.paid;

    // Online-Bestellungen werden zu 100 % vorausbezahlt. Sobald die Stripe-Zahlung
    // durch ist (paid: false → true), wird genau einmal die Rechnung ausgestellt.
    if (!oldPaid && newPaid && !after.finalInvoiceNumber) {
      console.log(`[onPaymentReceived] Online-Zahlung erhalten, Rechnung für ${after.orderNumber}`);
      await issueInvoice(orderId, after);
    }
  }
);

async function issueInvoice(orderId, order) {
  const db = admin.firestore();
  const bucket = admin.storage().bucket();

  try {
    // Rechnungsnummer ziehen (FGO2026-00001)
    const invoiceNumber = await generateInvoiceNumber();
    const invoiceDate = new Date();

    const pdfBuffer = await generateInvoicePDF({
      type: 'final',
      invoiceNumber,
      invoiceDate,
      order
    });

    // PDF in Cloud Storage hochladen (für Archivierung)
    const filename = `invoices/${invoiceNumber}.pdf`;
    const file = bucket.file(filename);
    await file.save(pdfBuffer, {
      contentType: 'application/pdf',
      metadata: {
        metadata: {
          orderNumber: order.orderNumber,
          orderId
        }
      }
    });

    console.log(`[issueInvoice] PDF gespeichert: ${filename}`);

    // Invoice-Dokument anlegen
    await db.collection('invoices').doc(invoiceNumber).set({
      invoiceNumber,
      type: 'final',
      orderId,
      orderNumber: order.orderNumber,
      vorname: order.vorname,
      nachname: order.nachname,
      email: order.email,
      amountGross: order.totalGross,
      amountNet: order.totalNet,
      amountVat: order.totalVat,
      pdfPath: filename,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Bestellung mit Rechnungsnummer aktualisieren
    await db.collection('orders').doc(orderId).update({
      finalInvoiceNumber: invoiceNumber,
      finalInvoiceDate: admin.firestore.Timestamp.fromDate(invoiceDate),
      log: admin.firestore.FieldValue.arrayUnion({
        time: admin.firestore.Timestamp.now(),
        text: `Rechnung ${invoiceNumber} erstellt`
      })
    });

    // Kombinierte Bestellbestätigung + Rechnung an Kunde — eine Email,
    // mit der PDF-Rechnung im Anhang. Admin bekommt seine eigene Notification
    // separat aus onOrderCreated.js (mit anderem Layout für interne Sicht).
    if (order.email) {
      // Wir reichern das order-Objekt mit invoiceNumber an, damit das Template
      // den Rechnungsbezug optional anzeigen kann.
      const orderWithInvoice = { ...order, invoiceNumber };
      await sendEmail({
        to: order.email,
        subject: `Bestellbestätigung & Rechnung ${order.orderNumber} — Bella Home`,
        html: templates.orderConfirmation(orderWithInvoice),
        attachments: [{
          filename: `${invoiceNumber}.pdf`,
          content: pdfBuffer.toString('base64')
        }]
      });
      // Log-Eintrag damit Mitarbeiter im Aktivitäts-Log sehen dass die Email rausging
      await db.collection('orders').doc(orderId).update({
        log: admin.firestore.FieldValue.arrayUnion({
          time: admin.firestore.Timestamp.now(),
          text: `Bestätigung & Rechnung an ${order.email} versendet`
        })
      });
    }

    console.log(`[issueInvoice] Erfolgreich: ${invoiceNumber}`);
  } catch (err) {
    console.error('[issueInvoice] Fehler:', err);
    try {
      await db.collection('orders').doc(orderId).update({
        log: admin.firestore.FieldValue.arrayUnion({
          time: admin.firestore.Timestamp.now(),
          text: `⚠ Rechnungs-Erstellung fehlgeschlagen: ${err.message}`
        })
      });
    } catch (e) { /* ignore */ }
  }
}
