// ╔══════════════════════════════════════════════════════════════╗
// ║  Counter - Race-Condition-sichere Nummern-Generierung        ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Zwei separate Counter:
//   1. orderCounter   → Bestellnummer  (App + Shop gemeinsam, #2026-00150)
//   2. invoiceCounter → Rechnungsnummer (nur Shop, FGO2026-00001 lückenlos)
//
// Beide via Firestore-Transaktion → garantiert eindeutig auch bei gleichzeitigen Zugriffen.

const admin = require('firebase-admin');

const db = () => admin.firestore();

// ── Bestellnummer ──────────────────────────────────────────────
// Format: #2026-00150 (gemeinsam mit App)
// v2: Mit Catch-up gegen Counter-Drift (analog BestellApp). Vor der Transaktion
// wird der höchste tatsächlich vergebene Bestellnumber-Suffix dieses Jahres
// gelesen; die Transaktion nimmt dann max(counter, localMax)+1. Selbst wenn
// `settings/orderCounter` versehentlich zurückgesetzt wird, entsteht keine
// doppelte Nummer.
async function generateOrderNumber() {
  const counterRef = db().collection('settings').doc('orderCounter');
  const currentYear = new Date().getFullYear();

  // Catch-up: höchste existierende Bestellnummer dieses Jahres aus orders-Collection ermitteln.
  // Lex-Sortierung passt für gleich-lange Zahlen (alle padStart(5)) — wir lesen die Top-5
  // gegen Edge-Cases (alte ungepaddte Nummern) und parsen sicher.
  let localMax = 0;
  try {
    const yearPrefix = '#' + currentYear + '-';
    const ordSnap = await db().collection('orders')
      .where('orderNumber', '>=', yearPrefix)
      .where('orderNumber', '<', '#' + (currentYear + 1) + '-')
      .orderBy('orderNumber', 'desc')
      .limit(5)
      .get();
    ordSnap.docs.forEach(d => {
      const nr = (d.data() && d.data().orderNumber) || '';
      const m = nr.match(/^#(\d{4})-(\d+)$/);
      if (m && parseInt(m[1], 10) === currentYear) {
        const n = parseInt(m[2], 10);
        if (n > localMax) localMax = n;
      }
    });
  } catch (_e) {
    // Catch-up best-effort — falls die Query fehlschlägt (z.B. fehlender Index),
    // läuft die alte Counter-Only-Logik weiter.
  }

  return await db().runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    let nextNumber;

    if (!snap.exists) {
      // Erste Bestellung dieses Jahres - Counter neu anlegen
      nextNumber = Math.max(localMax, 0) + 1;
      tx.set(counterRef, {
        year: currentYear,
        lastNumber: nextNumber,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      const data = snap.data();
      const counterValue = (data.year === currentYear) ? (data.lastNumber || 0) : 0;
      // max(counter, localMax)+1 — verhindert Drift wenn Counter zurückgesetzt wurde
      nextNumber = Math.max(counterValue, localMax) + 1;
      tx.update(counterRef, {
        year: currentYear,
        lastNumber: nextNumber,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return '#' + currentYear + '-' + String(nextNumber).padStart(5, '0');
  });
}

// ── Rechnungsnummer ────────────────────────────────────────────
// Format: FGO2026-00001 (lückenlos, nur Shop, finanzamtskonform)
async function generateInvoiceNumber() {
  const counterRef = db().collection('settings').doc('invoiceCounter');

  return await db().runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const currentYear = new Date().getFullYear();
    let nextNumber;

    if (!snap.exists) {
      nextNumber = 1;
      tx.set(counterRef, {
        year: currentYear,
        lastNumber: nextNumber,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      const data = snap.data();
      if (data.year === currentYear) {
        nextNumber = (data.lastNumber || 0) + 1;
      } else {
        nextNumber = 1;
      }
      tx.update(counterRef, {
        year: currentYear,
        lastNumber: nextNumber,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return 'FGO' + currentYear + '-' + String(nextNumber).padStart(5, '0');
  });
}

module.exports = { generateOrderNumber, generateInvoiceNumber };
