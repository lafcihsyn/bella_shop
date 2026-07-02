// ╔══════════════════════════════════════════════════════════════╗
// ║  Stripe Webhook Handler                                       ║
// ║  Eigene Cloud Function mit raw body parser, getrennt vom api  ║
// ║  Express-App damit Stripe-Signatur-Verifikation funktioniert. ║
// ╚══════════════════════════════════════════════════════════════╝

const Stripe = require('stripe');
const admin = require('firebase-admin');
const express = require('express');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const { STRIPE_SECRET_KEY, client: stripeClient } = require('./stripe');
const { generateOrderNumber } = require('../lib/counters');
const { sendEmail, RESEND_API_KEY } = require('../email/sender');
const { loadStatsOrders, computeStats, getProposedFristRange, getFristSettings } = require('../lib/prodstats');
const company = require('../lib/company');

const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

const app = express();

// Wichtig für Firebase Functions v2: Firebase parst den Body automatisch und
// speichert den Original-Buffer in `req.rawBody`. Wir nutzen DEN für Stripe-
// Signatur-Verifikation, nicht `req.body`.
app.post('/', async (req, res) => {
  let event;
  try {
    const stripe = Stripe(STRIPE_SECRET_KEY.value(), { apiVersion: '2024-06-20' });
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      req.headers['stripe-signature'],
      STRIPE_WEBHOOK_SECRET.value()
    );
  } catch (err) {
    console.error('[stripeWebhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }

  const db = admin.firestore();

  // ── Idempotency-Layer 1: Event-ID Deduplication via stripeEvents collection ──
  // Stripe sendet manchmal denselben Event mehrmals (at-least-once).
  // Eine Firestore-Transaction stellt sicher: Event-ID kann nur einmal verarbeitet werden.
  const evRef = db.collection('stripeEvents').doc(event.id);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(evRef);
      if (snap.exists) throw new Error('DUPLICATE');
      tx.set(evRef, {
        type: event.type,
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
        livemode: event.livemode,
        apiVersion: event.api_version || null
      });
    });
  } catch (err) {
    if (err.message === 'DUPLICATE') {
      console.log(`[stripeWebhook] Duplicate event ${event.id} (${event.type}) — skipping`);
      return res.json({ received: true, duplicate: true });
    }
    console.error('[stripeWebhook] Failed to register event:', err);
    return res.status(500).json({ error: 'Event registration failed' });
  }

  // ── Event handlen ──
  try {
    if (event.type === 'checkout.session.completed') {
      await handleCheckoutCompleted(event, db);
    } else if (event.type === 'checkout.session.expired') {
      await handleCheckoutExpired(event, db);
    } else if (event.type === 'checkout.session.async_payment_failed') {
      await handleCheckoutFailed(event, db);
    } else if (event.type === 'charge.refunded') {
      await handleChargeRefunded(event, db);
    } else if (event.type === 'charge.dispute.created') {
      await handleDisputeCreated(event, db);
    } else {
      console.log(`[stripeWebhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    // Event ist bereits in stripeEvents registriert. Hier scheitert nur die Side-Effect-Verarbeitung.
    // Wir loggen + senden 200 zurück damit Stripe nicht endlos retried bei z.B. Order-not-found.
    console.error(`[stripeWebhook] Error handling ${event.type} (${event.id}):`, err);
    await db.collection('stripeEvents').doc(event.id).update({
      processingError: err.message,
      erroredAt: admin.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
  }

  res.json({ received: true });
});

// Helper: Datum als 'YYYY-MM-DD' formatieren — passt zum App-Format für `bestelldatum` und `frist`.
// WICHTIG: Wien-Zeitzone, sonst rutscht eine Bestellung um 23:30 lokal auf den Folgetag,
// weil der Cloud-Function-Server in UTC läuft.
function toYMD(d) {
  if (!d) return null;
  const date = (d instanceof Date) ? d : new Date(d);
  if (isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('de-AT', {
    timeZone: 'Europe/Vienna',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const get = type => (parts.find(p => p.type === type) || {}).value || '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// Holt die echte Zahlungsmethode (inkl. Wallet-Erkennung) aus dem PaymentIntent.
// Werte können sein:
//   apple_pay / google_pay / samsung_pay      → Wallet via Karte
//   visa / mastercard / amex / diners / ...   → Plain-Karten (Brand)
//   eps / klarna / sepa_debit / ...           → andere Methoden
//   null                                       → konnte nicht ermittelt werden
async function derivePaymentMethod(session) {
  if (!session || !session.payment_intent) return null;
  try {
    const pi = await stripeClient().paymentIntents.retrieve(session.payment_intent, {
      expand: ['payment_method']
    });
    const pm = pi && pi.payment_method;
    if (!pm) return null;
    if (pm.type === 'card' && pm.card) {
      const wallet = pm.card.wallet && pm.card.wallet.type;
      if (wallet === 'apple_pay')   return 'apple_pay';
      if (wallet === 'google_pay')  return 'google_pay';
      if (wallet === 'samsung_pay') return 'samsung_pay';
      return pm.card.brand || 'card';
    }
    return pm.type || null;
  } catch (e) {
    console.warn('[derivePaymentMethod] failed:', e.message);
    return null;
  }
}

// ── Handler: checkout.session.completed ──
// Order wird auf bezahlt gesetzt. orderNumber wird lazy erst hier vergeben
// (damit Cancels keine Nummern-Lücken hinterlassen).
async function handleCheckoutCompleted(event, db) {
  const session = event.data.object;
  const orderId = session.metadata?.orderId;

  if (!orderId) {
    console.error('[stripeWebhook] checkout.session.completed without metadata.orderId:', session.id);
    return;
  }

  const orderRef = db.collection('orders').doc(orderId);

  // Frist berechnen VOR der Transaction (liest viele andere Orders, gehört nicht in
  // die Order-Transaction rein). Bei Fehler einfach ohne Frist weitermachen — die
  // Mitarbeiter können sie dann manuell setzen.
  let proposedFristStr = null;
  try {
    const statsOrders = await loadStatsOrders();
    const stats = computeStats(statsOrders);
    const fristSettings = await getFristSettings();
    const frist = getProposedFristRange(stats, 0, fristSettings); // 0 = diese Order ist nicht extra
    if (frist && frist.valid && frist.mid) {
      proposedFristStr = toYMD(frist.mid);
    }
  } catch (e) {
    console.warn('[stripeWebhook] Frist-Berechnung fehlgeschlagen:', e.message);
  }
  const todayStr = toYMD(new Date());

  // Echte Zahlungsmethode aus dem PaymentIntent ziehen (Wallet-Detection).
  // `session.payment_method_types[0]` gibt nur "card" zurück, egal ob Karte,
  // Apple Pay oder Google Pay. Erst die PaymentMethod auf der Charge verrät,
  // ob ein Wallet benutzt wurde. Fehler hier sind unkritisch — Fallback ist
  // der bisherige Wert.
  const derivedMethod = await derivePaymentMethod(session);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) throw new Error(`Order ${orderId} not found`);
    const order = snap.data();

    // Sicherheitscheck: die Session-ID muss zur Order gehören, sonst Manipulationsverdacht
    if (order.checkoutSessionId !== session.id) {
      throw new Error(`Session-ID mismatch for order ${orderId}: stored=${order.checkoutSessionId}, event=${session.id}`);
    }

    // Idempotency-Layer 2: schon paid? → nichts tun
    if (order.paymentStatus === 'paid') {
      console.log(`[stripeWebhook] Order ${orderId} bereits paid — skip`);
      return;
    }

    // Lazy: Bestellnummer erst jetzt vergeben (race-condition-sicher via counters.js)
    const orderNumber = order.orderNumber || await generateOrderNumber();

    const amountGross = (session.amount_total || 0) / 100;
    const newAnzahlung = (order.anzahlung || 0) + amountGross;
    // Online-Bestellungen werden zu 100 % vorausbezahlt → fullyPaid = true sobald
    // die Zahlung eingeht. Toleranz wegen Rundungsfehlern bei Cent-Beträgen.
    const fullyPaid = newAnzahlung >= (order.totalGross - 0.01);

    const updateFields = {
      orderNumber,
      anzahlung: newAnzahlung,
      paid: fullyPaid,
      paymentStatus: 'paid',
      lastPaymentAt: admin.firestore.FieldValue.serverTimestamp(),
      // Bestelldatum = Tag der Zahlung. Frist = vom System vorgeschlagener
      // Fertigstellungstag (Mitte der Spanne). Beides nur setzen wenn noch leer,
      // damit Staff-Anpassungen erhalten bleiben.
      bestelldatum: order.bestelldatum || todayStr,
      frist: order.frist || proposedFristStr,
      payments: admin.firestore.FieldValue.arrayUnion({
        // `amount` ist das Feld, das die BestellApp zum Aufsummieren liest.
        // `amountGross` bleibt für Kompatibilität mit der Buchhaltungs-Seite.
        amount: amountGross,
        amountGross,
        date: admin.firestore.Timestamp.now(),
        label: 'Online-Zahlung (Stripe)',
        source: 'stripe',
        eventId: event.id,
        eventType: event.type,
        sessionId: session.id,
        paymentIntentId: session.payment_intent || null,
        paymentMethod: derivedMethod || (session.payment_method_types && session.payment_method_types[0]) || null,
        currency: session.currency,
        receivedAt: new Date(),
        livemode: event.livemode
      }),
      log: admin.firestore.FieldValue.arrayUnion({
        time: admin.firestore.Timestamp.now(),
        text: `Online-Zahlung € ${amountGross.toFixed(2)} eingegangen (${derivedMethod || (session.payment_method_types && session.payment_method_types[0]) || 'card'})`
      })
    };
    tx.update(orderRef, updateFields);
  });

  console.log(`[stripeWebhook] Order ${orderId} marked paid via session ${session.id}`);
}

// ── Handler: checkout.session.expired ──
// Stripe-Default ist 24h, wir setzen 30 min. Order wird als expired markiert
// damit prodstats sie nicht in der Queue mitzählt.
async function handleCheckoutExpired(event, db) {
  const session = event.data.object;
  const orderId = session.metadata?.orderId;
  if (!orderId) return;

  const orderRef = db.collection('orders').doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) return;

  const order = snap.data();
  // Nicht überschreiben falls Order in der Zwischenzeit doch noch bezahlt wurde
  if (order.paymentStatus === 'paid') {
    console.log(`[stripeWebhook] expired event ignoriert — Order ${orderId} ist bereits paid`);
    return;
  }

  // Auto-Move in „Gelöscht"-Spalte, damit die Order nicht in der Werkstatt-Queue
  // mitläuft. Nur wenn Order noch in der Default-Spalte „Bestellung" ist —
  // falls Mitarbeiter sie schon manuell anderswo abgelegt haben, nicht überschreiben.
  const updateExpired = {
    paymentStatus: 'expired',
    log: admin.firestore.FieldValue.arrayUnion({
      time: admin.firestore.Timestamp.now(),
      text: 'Checkout-Session abgelaufen ohne Zahlung — Bestellung automatisch nach Gelöscht verschoben'
    })
  };
  if (order.column === 'Bestellung') updateExpired.column = 'Gelöscht';
  await orderRef.update(updateExpired);
  console.log(`[stripeWebhook] Order ${orderId} als expired markiert + nach Gelöscht verschoben`);
}

// ── Handler: checkout.session.async_payment_failed ──
// Feuert wenn eine asynchrone Zahlung scheitert — z.B. EPS-Kunde bricht im
// Bank-Redirect ab, oder eine Karte wird mit Verzögerung abgelehnt. Synchrone
// Karten-Ablehnungen passieren direkt in der Stripe-UI und feuern keinen Webhook.
async function handleCheckoutFailed(event, db) {
  const session = event.data.object;
  const orderId = session.metadata?.orderId;
  if (!orderId) return;

  const orderRef = db.collection('orders').doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) return;

  const order = snap.data();
  if (order.paymentStatus === 'paid') {
    console.log(`[stripeWebhook] failed event ignoriert — Order ${orderId} ist bereits paid`);
    return;
  }

  // Auto-Move in „Gelöscht"-Spalte (wenn noch in Default-Spalte), damit die
  // Order nicht als echte Bestellung in der Werkstatt-Queue mitläuft.
  const updateFailed = {
    paymentStatus: 'failed',
    log: admin.firestore.FieldValue.arrayUnion({
      time: admin.firestore.Timestamp.now(),
      text: `Zahlung fehlgeschlagen (${session.payment_method_types?.[0] || 'unbekannt'}) — Bestellung automatisch nach Gelöscht verschoben`
    })
  };
  if (order.column === 'Bestellung') updateFailed.column = 'Gelöscht';
  await orderRef.update(updateFailed);

  // Kunde + Admin per Email informieren — Fehler nicht crashen lassen, Webhook hat Vorrang
  try {
    if (order.email) {
      await sendEmail({
        to: order.email,
        subject: 'Ihre Zahlung war nicht erfolgreich — Bella Home',
        html: `<!DOCTYPE html><html><body style="font-family:sans-serif;color:#1a1a2e;padding:20px;">
          <h2 style="color:#534AB7;">Zahlung fehlgeschlagen</h2>
          <p>Sehr geehrte/r ${order.vorname} ${order.nachname},</p>
          <p>leider konnte Ihre Online-Zahlung nicht verarbeitet werden. Ihre Bestellung wurde <strong>nicht angelegt</strong> — Sie können einen neuen Versuch starten oder uns telefonisch erreichen.</p>
          <p><strong>Telefon:</strong> ${company.phone || '+43 660 200 06 44'}<br>
          <strong>Email:</strong> ${company.email}</p>
          <hr><p style="font-size:11px;color:#6B7280;">${company.name}</p>
        </body></html>`
      });
    }
    await sendEmail({
      to: company.adminEmail,
      subject: `⚠ Online-Zahlung fehlgeschlagen (${order.vorname} ${order.nachname})`,
      html: `<p>Die Zahlung für Order <code>${orderId}</code> ist fehlgeschlagen.<br>
        Email: ${order.email}<br>
        Telefon: ${order.telefon}<br>
        Betrag: € ${(session.amount_total || 0) / 100}</p>`
    });
  } catch (err) {
    console.error('[stripeWebhook] Email bei failed-Event fehlgeschlagen:', err.message);
  }

  console.log(`[stripeWebhook] Order ${orderId} als failed markiert`);
}

// ── Handler: charge.refunded ──
// Feuert wenn im Stripe-Dashboard ein Refund (auch teilweise) ausgelöst wird.
// Wir verlinken via charge.payment_intent → PaymentIntent.metadata.orderId.
async function handleChargeRefunded(event, db) {
  const charge = event.data.object;
  if (!charge.payment_intent) {
    console.warn('[stripeWebhook] charge.refunded ohne payment_intent:', charge.id);
    return;
  }

  const pi = await stripeClient().paymentIntents.retrieve(charge.payment_intent);
  const orderId = pi.metadata?.orderId;
  if (!orderId) {
    console.warn('[stripeWebhook] PaymentIntent ohne metadata.orderId:', pi.id);
    return;
  }

  const orderRef = db.collection('orders').doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) {
    console.warn('[stripeWebhook] Order nicht gefunden für refund:', orderId);
    return;
  }
  const order = snap.data();

  const refundedAmount = (charge.amount_refunded || 0) / 100;
  const isFullRefund = charge.refunded === true;

  // Bei VOLLEM Refund: Auto-Move nach „Gelöscht" (wie bei expired/failed), aber nur
  // wenn die Order noch in der Default-Spalte „Bestellung" ist — falls Mitarbeiter
  // sie schon manuell verschoben haben (z.B. „In Produktion"), nicht überschreiben.
  // Bei Teil-Refund: Spalte unverändert lassen, weil Order ggf. trotzdem produziert wird.
  const updateRefund = {
    refundedAmount,
    refunded: isFullRefund,
    paymentStatus: isFullRefund ? 'refunded' : 'partial_refund',
    paid: isFullRefund ? false : order.paid,
    lastRefundAt: admin.firestore.FieldValue.serverTimestamp(),
    log: admin.firestore.FieldValue.arrayUnion({
      time: admin.firestore.Timestamp.now(),
      text: `Rückerstattung € ${refundedAmount.toFixed(2)} via Stripe (${isFullRefund ? 'voll' : 'teil'})${isFullRefund && order.column === 'Bestellung' ? ' — Bestellung automatisch nach Gelöscht verschoben' : ''}`
    })
  };
  if (isFullRefund && order.column === 'Bestellung') {
    updateRefund.column = 'Gelöscht';
  }
  await orderRef.update(updateRefund);

  try {
    await sendEmail({
      to: company.adminEmail,
      subject: `💸 Rückerstattung Order ${order.orderNumber || orderId} — € ${refundedAmount.toFixed(2)}`,
      html: `<p>Stripe-Refund eingegangen.</p>
        <p><strong>Order:</strong> ${order.orderNumber || orderId}<br>
        <strong>Kunde:</strong> ${order.vorname} ${order.nachname} (${order.email})<br>
        <strong>Betrag:</strong> € ${refundedAmount.toFixed(2)}<br>
        <strong>Art:</strong> ${isFullRefund ? 'Volle Rückerstattung' : 'Teil-Rückerstattung'}</p>
        <p>Bitte ggf. interne Status-Änderung in der App (z.B. Bestellung → Gelöscht) prüfen.</p>`
    });
  } catch (err) {
    console.error('[stripeWebhook] Refund-Email fehlgeschlagen:', err.message);
  }

  console.log(`[stripeWebhook] Refund verarbeitet: ${orderId}, € ${refundedAmount}`);
}

// ── Handler: charge.dispute.created ──
// Chargeback: Kunde reklamiert Kartenzahlung bei seiner Bank. Wir haben eine
// begrenzte Frist um Beweise hochzuladen (Frist steht in evidence_details.due_by).
// Wichtigste Aktion: schnelle Admin-Email mit Direkt-Link ins Stripe-Dashboard.
async function handleDisputeCreated(event, db) {
  const dispute = event.data.object;
  if (!dispute.charge) return;

  const charge = await stripeClient().charges.retrieve(dispute.charge);
  if (!charge.payment_intent) return;
  const pi = await stripeClient().paymentIntents.retrieve(charge.payment_intent);
  const orderId = pi.metadata?.orderId;
  if (!orderId) return;

  const orderRef = db.collection('orders').doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) return;
  const order = snap.data();

  const amount = (dispute.amount || 0) / 100;
  const dueByTs = dispute.evidence_details?.due_by;

  await orderRef.update({
    dispute: {
      id: dispute.id,
      status: dispute.status,
      reason: dispute.reason,
      amount,
      createdAt: admin.firestore.Timestamp.now(),
      evidenceDueBy: dueByTs ? admin.firestore.Timestamp.fromMillis(dueByTs * 1000) : null
    },
    log: admin.firestore.FieldValue.arrayUnion({
      time: admin.firestore.Timestamp.now(),
      text: `⚠ Chargeback eröffnet: Grund "${dispute.reason}", € ${amount.toFixed(2)}`
    })
  });

  const dueByStr = dueByTs ? new Date(dueByTs * 1000).toLocaleDateString('de-AT') : 'unbekannt';

  try {
    await sendEmail({
      to: company.adminEmail,
      subject: `🚨 DRINGEND: Chargeback Order ${order.orderNumber || orderId} — € ${amount.toFixed(2)}`,
      html: `<p style="color:#d00;font-size:16px"><strong>Ein Kunde hat einen Chargeback (Rückbuchung) bei seiner Bank/Karte beantragt.</strong></p>
        <p><strong>Order:</strong> ${order.orderNumber || orderId}<br>
        <strong>Kunde:</strong> ${order.vorname} ${order.nachname} (${order.email})<br>
        <strong>Betrag:</strong> € ${amount.toFixed(2)}<br>
        <strong>Grund:</strong> ${dispute.reason}<br>
        <strong>Status:</strong> ${dispute.status}<br>
        <strong>Beweise einreichen bis:</strong> ${dueByStr}</p>
        <p><a href="https://dashboard.stripe.com/disputes/${dispute.id}">Im Stripe-Dashboard öffnen</a></p>
        <p>Reagiere rechtzeitig im Stripe-Dashboard mit Beweismaterial (Rechnung, Lieferschein, Email-Kontakt). Ohne Antwort verlierst du den Betrag automatisch.</p>`
    });
  } catch (err) {
    console.error('[stripeWebhook] Dispute-Email fehlgeschlagen:', err.message);
  }

  console.log(`[stripeWebhook] Dispute erstellt: ${orderId}, € ${amount}`);
}

exports.stripeWebhook = onRequest({
  region: 'europe-west1',
  secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY],
  memory: '256MiB',
  timeoutSeconds: 30
}, app);
