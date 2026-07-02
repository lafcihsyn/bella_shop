#!/usr/bin/env node
// ╔══════════════════════════════════════════════════════════════╗
// ║  Cleanup-Script: Rechnungs-Daten zurücksetzen                ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Was es macht:
//   1. Listet alle Rechnungen (settings/invoices)
//   2. Fragt nach Bestätigung
//   3. Löscht alle Rechnungs-Datensätze (Firestore)
//   4. Löscht alle Rechnungs-PDFs (Cloud Storage)
//   5. Entfernt finalInvoiceNumber/-Date aus Orders die das referenzieren
//   6. Setzt invoiceCounter.lastNumber auf 0
//
// NICHT angefasst:
//   - orderCounter (Bestellnummern bleiben wie sie sind)
//   - orders (Bestellungen bleiben in der DB, nur Rechnungs-Referenz wird entfernt)
//
// Voraussetzung:
//   Eine der beiden Auth-Methoden:
//   A) Service-Account-JSON: /Users/craft/Documents/bella_shop/scripts/service-account.json
//      → Download via Firebase Console → Project Settings → Service Accounts → „Generate new private key"
//   B) Application Default Credentials:
//      → gcloud installiert + `gcloud auth application-default login` einmal ausgeführt
//
// Aufruf:
//   cd /Users/craft/Documents/bella_shop/functions
//   node ../scripts/reset-invoices.js

const path = require('path');
const fs = require('fs');
const readline = require('readline');

let admin;
try {
  admin = require('firebase-admin');
} catch (e) {
  console.error('❌ firebase-admin nicht installiert. Bitte vom functions/-Ordner aus aufrufen.');
  console.error('   cd /Users/craft/Documents/bella_shop/functions');
  console.error('   node ../scripts/reset-invoices.js');
  process.exit(1);
}

// ── Auth: Service-Account-JSON ODER ADC ────────────────────────
const serviceAccountPath = path.join(__dirname, 'service-account.json');
if (fs.existsSync(serviceAccountPath)) {
  console.log('🔑 Auth: Service-Account-JSON');
  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath)),
    projectId: 'fliegengitter-3486c',
    storageBucket: 'fliegengitter-3486c.firebasestorage.app'
  });
} else {
  console.log('🔑 Auth: Application Default Credentials (ADC)');
  console.log('   (Falls Fehler: entweder gcloud + `gcloud auth application-default login`,');
  console.log('    ODER Service-Account-JSON unter scripts/service-account.json ablegen)');
  admin.initializeApp({
    projectId: 'fliegengitter-3486c',
    storageBucket: 'fliegengitter-3486c.firebasestorage.app'
  });
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

async function main() {
  console.log('\n═══ Schritt 1: Bestandsaufnahme ═══\n');

  // Rechnungen scannen
  const invSnap = await db.collection('invoices').get();
  const invoices = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`📋 ${invoices.length} Rechnung(en) in Firestore gefunden:`);
  invoices.forEach(inv => {
    const amount = inv.amountGross != null ? `€ ${inv.amountGross.toFixed(2)}` : '?';
    console.log(`   • ${inv.invoiceNumber}  (Order ${inv.orderNumber || '?'}, ${amount})`);
  });

  // Orders mit finalInvoiceNumber finden
  const ordersWithInvSnap = await db.collection('orders').get();
  const ordersWithInv = ordersWithInvSnap.docs.filter(d => d.data().finalInvoiceNumber);
  console.log(`\n📦 ${ordersWithInv.length} Order(s) referenzieren eine Rechnung (finalInvoiceNumber-Feld)`);

  // PDFs in Storage scannen
  const [files] = await bucket.getFiles({ prefix: 'invoices/' });
  console.log(`📄 ${files.length} PDF(s) im Storage unter invoices/`);

  // Counter-Status
  const counterDoc = await db.collection('settings').doc('invoiceCounter').get();
  const counter = counterDoc.exists ? counterDoc.data() : null;
  console.log(`\n🔢 invoiceCounter: ${counter ? `year=${counter.year}, lastNumber=${counter.lastNumber}` : 'EXISTIERT NICHT'}`);

  const orderCounterDoc = await db.collection('settings').doc('orderCounter').get();
  const orderCounter = orderCounterDoc.exists ? orderCounterDoc.data() : null;
  console.log(`🔢 orderCounter (wird NICHT angefasst): ${orderCounter ? `year=${orderCounter.year}, lastNumber=${orderCounter.lastNumber}` : 'EXISTIERT NICHT'}`);

  console.log('\n═══ Schritt 2: Was passieren wird ═══\n');
  console.log('🗑  Alle Rechnungs-Datensätze in Firestore löschen');
  console.log('🗑  Alle PDFs in Storage unter invoices/ löschen');
  console.log('🧹  finalInvoiceNumber + finalInvoiceDate aus betroffenen Orders entfernen');
  console.log('🔄  invoiceCounter.lastNumber → 0 setzen');
  console.log('\n✋  orders Collection bleibt unverändert (nur die Rechnungs-Refs werden entfernt)');
  console.log('✋  orderCounter bleibt unverändert (Bestellnummern laufen normal weiter)');

  const confirm = await ask('\nWirklich durchführen? Tippe "ja" zur Bestätigung: ');
  if (confirm.trim().toLowerCase() !== 'ja') {
    console.log('\n⛔ Abgebrochen, nichts gemacht.');
    process.exit(0);
  }

  console.log('\n═══ Schritt 3: Ausführung ═══\n');

  // 1. Firestore: invoices collection
  let invDeleted = 0;
  for (const inv of invoices) {
    await db.collection('invoices').doc(inv.id).delete();
    invDeleted++;
  }
  console.log(`✅ ${invDeleted} Rechnungs-Datensätze aus Firestore gelöscht`);

  // 2. Storage: invoices/*.pdf
  let pdfDeleted = 0;
  for (const file of files) {
    try {
      await file.delete();
      pdfDeleted++;
    } catch (e) {
      console.log(`   ⚠ PDF ${file.name} konnte nicht gelöscht werden: ${e.message}`);
    }
  }
  console.log(`✅ ${pdfDeleted} PDFs aus Storage gelöscht`);

  // 3. Orders: clear invoice references
  let orderCleared = 0;
  for (const doc of ordersWithInv) {
    await doc.ref.update({
      finalInvoiceNumber: admin.firestore.FieldValue.delete(),
      finalInvoiceDate: admin.firestore.FieldValue.delete()
    });
    orderCleared++;
  }
  console.log(`✅ ${orderCleared} Order-Referenzen auf Rechnung bereinigt`);

  // 4. Reset counter
  await db.collection('settings').doc('invoiceCounter').set({
    year: new Date().getFullYear(),
    lastNumber: 0
  }, { merge: true });
  console.log('✅ invoiceCounter.lastNumber zurückgesetzt auf 0');

  console.log('\n🎉 Fertig! Nächste echte Bestellung erstellt Rechnung FGO2026-00001.');
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error('\n❌ Fehler:', e.message);
    if (e.code === 16 || /UNAUTHENTICATED|credential/i.test(e.message)) {
      console.error('\n→ Auth fehlgeschlagen. Optionen:');
      console.error('  A) Service-Account-JSON: Firebase Console → Project Settings → Service Accounts');
      console.error('     → „Generate new private key" → die JSON-Datei unter');
      console.error('     /Users/craft/Documents/bella_shop/scripts/service-account.json ablegen');
      console.error('  B) gcloud SDK installieren + `gcloud auth application-default login`');
    }
    process.exit(1);
  });
