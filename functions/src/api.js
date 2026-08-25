// ╔══════════════════════════════════════════════════════════════╗
// ║  Webshop-API - HTTP-Endpunkte für das Frontend               ║
// ╚══════════════════════════════════════════════════════════════╝

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const { generateOrderNumber } = require('./lib/counters');
const { calcOrderTotal } = require('./lib/pricing');
const { RESEND_API_KEY } = require('./email/sender');
const { loadStatsOrders, computeStats, getProposedFristRange, computeQueuePosition, getFristSettings } = require('./lib/prodstats');
const { createCheckoutSession, STRIPE_SECRET_KEY } = require('./payments/stripe');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '500kb' }));

// Firebase Hosting leitet /api/** mit vollem Prefix zur Function weiter.
// Express-Routes sind ohne /api-Prefix registriert (z.B. '/health'),
// daher das /api hier strippen, damit beides funktioniert:
//   /api/health  (über Hosting-Rewrite)  →  /health
//   /health      (direkter Function-URL)  →  /health
app.use((req, res, next) => {
  if (req.url === '/api') { req.url = '/'; }
  else if (req.url.startsWith('/api/')) { req.url = req.url.slice(4); }
  next();
});

const db = () => admin.firestore();

// ── GET /api/health ────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), version: '1.0.0' });
});

// ── GET /api/models ────────────────────────────────────────────
// Alle Modelle mit webshopActive=true (öffentlich abrufbar)
app.get('/models', async (req, res) => {
  try {
    const snap = await db().collection('models').where('webshopActive', '==', true).get();
    const models = snap.docs.map(d => {
      const m = d.data();
      // Bilder sortiert nach sortOrder; nur url + sortOrder werden öffentlich zurückgegeben
      const images = Array.isArray(m.images) ? m.images : [];
      const sortedImages = [...images]
        .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
        .map(img => ({ url: img.url, sortOrder: img.sortOrder ?? 0 }));
      return {
        id: d.id,
        name: m.name,
        shortDescription: m.webshopShortDescription || '',
        longDescription: m.webshopLongDescription || '',
        advantages: m.webshopAdvantages || [],
        sqmPrice: m.pricing?.defaultSqmPriceEinzeltuer || 0,
        sqmPriceDoppel: m.pricing?.defaultSqmPriceDoppeltuer || null,
        // v1.38: Preis-Matrix nach Türart × Netz/Plissee (überschreibt obere Defaults wenn gesetzt)
        priceMatrix: m.pricing?.matrix || null,
        minSqmPrice: m.pricing?.minSqmPriceEinzeltuer || 0,
        measureLimits: {
          minBreite: m.webshopMinBreite || m.measureLimits?.minBreite || 30,
          maxBreite: m.webshopMaxBreite || m.measureLimits?.maxBreite || 250,
          minHoehe: m.webshopMinHoehe || m.measureLimits?.minHoehe || 50,
          maxHoehe: m.webshopMaxHoehe || m.measureLimits?.maxHoehe || 280
        },
        defaultColor: m.defaultColor || 'Antrazit',
        availableColors: m.colors || [],
        availableNetzColors: m.netzColors || [],
        variantIds: m.variantIds || [],
        forcedDoppeltuer: !!m.forcedDoppeltuer,
        images: sortedImages
      };
    });
    res.json({ models });
  } catch (err) {
    console.error('[api/models]', err);
    res.status(500).json({ error: 'Modelle konnten nicht geladen werden' });
  }
});

// ── GET /api/hero ──────────────────────────────────────────────
// Hero-Banner-Bilder für die Webshop-Startseite (Slider).
// Wenn `settings/webshopHero` nicht existiert → leeres Array → Webshop nutzt Fallback-Design.
app.get('/hero', async (req, res) => {
  try {
    const doc = await db().collection('settings').doc('webshopHero').get();
    const data = doc.exists ? doc.data() : {};
    const images = Array.isArray(data.images) ? data.images : [];
    const sortedImages = [...images]
      .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
      .map(img => ({ url: img.url, sortOrder: img.sortOrder ?? 0 }));
    res.set('Cache-Control', 'public, max-age=60'); // 1 Min Cache (kurz, damit Hero-Updates schnell ankommen)
    res.json({ images: sortedImages });
  } catch (err) {
    console.error('[api/hero]', err);
    res.status(500).json({ error: 'Hero-Bilder konnten nicht geladen werden' });
  }
});

// ── GET /api/logo ──────────────────────────────────────────────
// Firmenlogo (Base64-Data-URL) aus den Einstellungen.
// Wird vom Webshop-Header verwendet um den "Bella Home"-Text zu ersetzen.
app.get('/logo', async (req, res) => {
  try {
    const doc = await db().collection('settings').doc('company').get();
    const data = doc.exists ? doc.data() : {};
    res.set('Cache-Control', 'public, max-age=300'); // 5 Min Cache
    res.json({ logoBase64: data.logoBase64 || '' });
  } catch (err) {
    console.error('[api/logo]', err);
    res.status(500).json({ error: 'Logo konnte nicht geladen werden' });
  }
});

// ── GET /api/legal ─────────────────────────────────────────────
// Liefert AGB, Datenschutzerklärung und Impressum (vom Mitarbeiter editierbar).
// Wenn das `settings/legal` Doc nicht existiert oder leer ist, gibt der Endpoint
// nur Empty-Strings zurück — das Frontend zeigt dann seine hardcoded Fallback-Texte.
app.get('/legal', async (req, res) => {
  try {
    const doc = await db().collection('settings').doc('legal').get();
    const data = doc.exists ? doc.data() : {};
    res.set('Cache-Control', 'public, max-age=300'); // 5 Min Cache
    res.json({
      agb: data.agb || '',
      datenschutz: data.datenschutz || '',
      impressum: data.impressum || '',
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : null
    });
  } catch (err) {
    console.error('[api/legal]', err);
    res.status(500).json({ error: 'Rechtliche Texte konnten nicht geladen werden' });
  }
});

// ── GET /api/colors ────────────────────────────────────────────
// Alle Farben aus dem Farb-Katalog
app.get('/colors', async (req, res) => {
  try {
    const snap = await db().collection('colors').get();
    const colors = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => c.active !== false); // inaktive Farben nicht an den Webshop ausliefern
    res.json({ colors });
  } catch (err) {
    console.error('[api/colors]', err);
    res.status(500).json({ error: 'Farben konnten nicht geladen werden' });
  }
});

// ── GET /api/plissee-colors ────────────────────────────────────
app.get('/plissee-colors', async (req, res) => {
  try {
    const snap = await db().collection('plissee_colors').get();
    const colors = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => c.active !== false); // inaktive Farben nicht an den Webshop ausliefern
    res.json({ colors });
  } catch (err) {
    console.error('[api/plissee-colors]', err);
    res.status(500).json({ error: 'Sonnenschutz-Stofffarben konnten nicht geladen werden' });
  }
});

// ── GET /api/netz-colors ───────────────────────────────────────
app.get('/netz-colors', async (req, res) => {
  try {
    const snap = await db().collection('netz_colors').get();
    const colors = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => c.active !== false); // inaktive Farben nicht an den Webshop ausliefern
    res.json({ colors });
  } catch (err) {
    console.error('[api/netz-colors]', err);
    res.status(500).json({ error: 'Fliegengitter-Netzfarben konnten nicht geladen werden' });
  }
});

// ── GET /api/variants ──────────────────────────────────────────
// Alle Varianten (für Konfigurator-Optionen)
app.get('/variants', async (req, res) => {
  try {
    const snap = await db().collection('variants').get();
    const variants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ variants });
  } catch (err) {
    console.error('[api/variants]', err);
    res.status(500).json({ error: 'Varianten konnten nicht geladen werden' });
  }
});

// ── POST /api/orders ───────────────────────────────────────────
// Neue Bestellung anlegen
app.post('/orders', async (req, res) => {
  try {
    const body = req.body || {};
    const { vorname, nachname, telefon, email, measures, bemerkung, agbAccepted, widerrufAccepted } = body;

    // ── Validierung ───────────────────────────────────────────
    if (!vorname || !nachname || !telefon || !email) {
      return res.status(400).json({ error: 'Pflichtfelder fehlen (Name, Telefon, Email)' });
    }
    if (!Array.isArray(measures) || measures.length === 0) {
      return res.status(400).json({ error: 'Keine Maße angegeben' });
    }
    if (!agbAccepted || !widerrufAccepted) {
      return res.status(400).json({ error: 'AGB und Widerrufsverzicht müssen akzeptiert werden' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Email-Adresse ungültig' });
    }

    // ── Modell- und Farb-Validierung (Server-seitig!) ─────────
    // Verhindert manipulierte Preise vom Client
    const validatedMeasures = [];
    for (const m of measures) {
      if (!m.modelId) {
        return res.status(400).json({ error: 'Modell-ID fehlt bei Maß' });
      }
      const modelDoc = await db().collection('models').doc(m.modelId).get();
      if (!modelDoc.exists || !modelDoc.data().webshopActive) {
        return res.status(400).json({ error: `Modell "${m.modelId}" ist nicht im Webshop verfügbar` });
      }
      const model = modelDoc.data();
      const b = parseFloat(m.breite), h = parseFloat(m.hoehe);

      // Maße im erlaubten Bereich?
      const minB = model.webshopMinBreite || model.measureLimits?.minBreite || 30;
      const maxB = model.webshopMaxBreite || model.measureLimits?.maxBreite || 250;
      const minH = model.webshopMinHoehe || model.measureLimits?.minHoehe || 50;
      const maxH = model.webshopMaxHoehe || model.measureLimits?.maxHoehe || 280;

      if (b < minB || b > maxB || h < minH || h > maxH) {
        return res.status(400).json({ error: `Maße ${b}×${h} cm außerhalb des erlaubten Bereichs (${minB}-${maxB} × ${minH}-${maxH})` });
      }

      // Preis IMMER vom Server bestimmen, nie vom Client
      // v1.38: Preis-Matrix Türart × Netz/Plissee bevorzugt
      const isDt = !!m.doppeltuer;
      const np = m.variants?.netz_plissee;
      let sqmPrice = 0;
      if (model.pricing?.matrix && np) {
        const tk = isDt ? 'doppel' : 'einzel';
        const npKey = (np === 'kombi') ? 'plisee' : np;
        const v = model.pricing.matrix[tk]?.[npKey];
        if (typeof v === 'number' && v > 0) sqmPrice = v;
      }
      if (sqmPrice <= 0) {
        sqmPrice = (isDt && model.pricing?.defaultSqmPriceDoppeltuer)
          ? model.pricing.defaultSqmPriceDoppeltuer
          : model.pricing?.defaultSqmPriceEinzeltuer || 0;
      }
      if (sqmPrice <= 0) {
        return res.status(500).json({ error: 'Preis für Modell nicht konfiguriert' });
      }

      const vm = {
        modelId: m.modelId,
        modelName: model.name,
        breite: b,
        hoehe: h,
        stueck: Math.max(1, parseInt(m.stueck) || 1),
        farbe: m.farbe || model.defaultColor || 'Antrazit',
        sqmPrice,
        doppeltuer: !!m.doppeltuer,
        variants: m.variants && typeof m.variants === 'object' ? m.variants : {},
        bemerkung: (m.bemerkung || '').slice(0, 500),
        materialColors: {}
      };
      // v1.19.59: Anzeige-Namen für Netz-/Plissee-Farbe (vom Client gesendet, display-only)
      // → Email/PDF zeigen echte Namen statt roher IDs, robust gegen Hard-Delete.
      if (typeof m.netzFarbeName === 'string' && m.netzFarbeName) vm.netzFarbeName = m.netzFarbeName.slice(0, 60);
      if (typeof m.plisseeFarbeName === 'string' && m.plisseeFarbeName) vm.plisseeFarbeName = m.plisseeFarbeName.slice(0, 60);
      validatedMeasures.push(vm);
    }

    // ── Preisberechnung (Server-Truth) ────────────────────────
    // Online-Bestellungen: Kunde zahlt IMMER den vollen Betrag (keine Anzahlung).
    // Buchhalterisch sauber: nur eine Rechnung pro Bestellung statt Anzahlungs- + Schlussrechnung.
    const calc = calcOrderTotal(validatedMeasures);

    // ── Saga-Pattern: orderId vorab generieren, Stripe-Session zuerst ─
    // Reihenfolge: Doc-ID erzeugen (kein Write), Stripe-Session erstellen.
    // Erst wenn Stripe OK → schreiben wir den Firestore-Doc. So bleibt
    // bei Stripe-Outage keine verwaiste Order zurück. orderNumber wird
    // LAZY vom Webhook vergeben — verhindert Nummern-Lücken durch Cancels.
    const orderRef = db().collection('orders').doc();
    const orderId = orderRef.id;
    const trackingToken = crypto.randomBytes(16).toString('hex');

    // Order-Daten zusammenbauen (noch nicht geschrieben).
    const orderData = {
      vorname: vorname.trim(),
      nachname: nachname.trim(),
      telefon: telefon.trim(),
      email: email.trim().toLowerCase(),
      farbe: validatedMeasures[0].farbe,
      // orderNumber: NICHT hier — wird lazy vom Webhook vergeben
      trackingToken,
      measures: calc.items,
      totalSqm: calc.totalSqm,
      totalPrice: calc.totalGross,
      totalGross: calc.totalGross,
      totalNet: calc.totalNet,
      totalVat: calc.totalVat,
      anzahlung: 0,
      payments: [],
      paid: false,
      paymentStatus: 'pending', // 'pending' → 'paid' (via Webhook) | 'expired'
      bestelldatum: null,
      frist: null,
      bemerkung: (bemerkung || '').slice(0, 500),
      column: 'Bestellung',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: 'webshop',
      filialeId: '',
      filialeName: 'Online',
      source: 'online',
      sourceMeta: {
        userAgent: (req.headers['user-agent'] || '').slice(0, 200),
        ip: req.headers['x-forwarded-for'] || req.ip,
        agbAccepted: true,
        widerrufAccepted: true
      },
      log: [{
        time: admin.firestore.Timestamp.now(),
        text: 'Online-Bestellung über Webshop eingegangen (Zahlung ausstehend)'
      }]
    };

    // ── Stripe Checkout Session erstellen ─────────────────────
    // Online-Kunden zahlen IMMER den vollen Betrag (totalGross).
    let session;
    try {
      session = await createCheckoutSession({
        orderId,
        order: orderData,
        amountGross: calc.totalGross
      });
    } catch (stripeErr) {
      console.error('[api/orders] Stripe checkout session failed:', stripeErr);
      return res.status(502).json({
        error: 'Bezahl-Service vorübergehend nicht erreichbar. Bitte später erneut versuchen oder telefonisch bestellen unter +43 660 200 06 44.',
        stripeError: true
      });
    }

    // ── JETZT Firestore-Doc schreiben (mit Session-Info) ──────
    orderData.checkoutSessionId = session.id;
    orderData.checkoutSessionExpiresAt = admin.firestore.Timestamp.fromMillis(session.expires_at * 1000);
    orderData.checkoutUrl = session.url;
    orderData.livemode = !!session.livemode;

    try {
      await orderRef.set(orderData);
    } catch (fsErr) {
      // Stripe-Session existiert ohne Order — Worst-Case. Stripe-Session läuft
      // nach 30 Min sowieso aus. Wir geben einen 500-Fehler zurück.
      console.error('[api/orders] Firestore write failed AFTER Stripe session created:', fsErr, 'sessionId:', session.id);
      return res.status(500).json({ error: 'Bestellung konnte nicht gespeichert werden. Bitte erneut versuchen.' });
    }

    // ── Response: Tracking-Token + Stripe-URL ─────────────────
    res.status(201).json({
      ok: true,
      orderId,
      trackingToken,
      checkoutUrl: session.url,
      totalGross: calc.totalGross
    });

  } catch (err) {
    console.error('[api/orders] POST error:', err);
    res.status(500).json({ error: 'Bestellung konnte nicht angelegt werden. Bitte später erneut versuchen oder telefonisch bestellen.' });
  }
});

// ── POST /api/orders/lookup ────────────────────────────────────
// Kunden-Lookup über Bestellnummer + Email.
// Beide müssen zur selben Bestellung gehören (sonst 404).
// Gibt den Tracking-Token zurück, mit dem das Frontend dann
// auf /bestellung/<token> weiterleitet.
app.post('/orders/lookup', async (req, res) => {
  try {
    const { orderNumber, email } = req.body || {};
    if (!orderNumber || !email) {
      return res.status(400).json({ error: 'Bitte Bestellnummer und Email angeben.' });
    }
    // Normalisieren: Bestellnummer akzeptiert "#2026-00150", "2026-00150", "2026 00150" etc.
    let normNumber = String(orderNumber).trim().replace(/\s+/g, '');
    if (!normNumber.startsWith('#')) normNumber = '#' + normNumber;
    const normEmail = String(email).trim().toLowerCase();

    const snap = await db().collection('orders')
      .where('orderNumber', '==', normNumber)
      .limit(1).get();

    if (snap.empty) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden. Bitte Bestellnummer und Email prüfen.' });
    }
    const o = snap.docs[0].data();
    if ((o.email || '').toLowerCase() !== normEmail) {
      // Bewusst dieselbe Fehlermeldung wie bei "nicht gefunden",
      // damit niemand durch Bestellnummern-Raten herausfinden kann, welche existieren.
      return res.status(404).json({ error: 'Bestellung nicht gefunden. Bitte Bestellnummer und Email prüfen.' });
    }
    res.json({ trackingToken: o.trackingToken });
  } catch (err) {
    console.error('[api/orders/lookup]', err);
    res.status(500).json({ error: 'Bestellung konnte nicht abgerufen werden.' });
  }
});

// ── GET /api/orders/track/:token ───────────────────────────────
// Tracking-Status abrufen (kein Login nötig).
// Liefert zusätzlich Queue-Position (wenn noch in "Bestellung"-Spalte)
// und voraussichtliche Fertigstellung.
app.get('/orders/track/:token', async (req, res) => {
  try {
    const token = req.params.token;
    if (!token || token.length < 16) {
      return res.status(400).json({ error: 'Ungültiger Tracking-Code' });
    }
    const snap = await db().collection('orders').where('trackingToken', '==', token).limit(1).get();
    if (snap.empty) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }
    const orderDoc = snap.docs[0];
    const o = orderDoc.data();

    // Queue-Position + Frist berechnen.
    // Bei Fehler in der Berechnung trotzdem die Bestellung zurückgeben,
    // damit Tracking-Seite minimal funktioniert.
    let queue = null;
    try {
      const statsOrders = await loadStatsOrders();
      queue = computeQueuePosition(statsOrders, orderDoc.id);
    } catch (e) {
      console.warn('[api/orders/track] prodstats failed:', e.message);
    }

    // Rechnungs-Info: Schluss- oder Anzahlungs-Rechnung (für „Rechnung herunterladen"-Button)
    const invoiceNumber = o.finalInvoiceNumber || o.depositInvoiceNumber || null;

    res.json({
      orderNumber: o.orderNumber || null, // kann null sein wenn Zahlung noch ausstehend
      status: o.column,
      source: o.source,
      paymentStatus: o.paymentStatus || 'paid', // Legacy-Orders (vor Stripe-Integration) haben kein paymentStatus → als paid behandeln
      checkoutUrl: o.paymentStatus === 'pending' ? o.checkoutUrl : null,
      vorname: o.vorname,
      nachname: o.nachname,
      totalGross: o.totalGross || o.totalPrice,
      anzahlung: o.anzahlung || 0,
      paid: !!o.paid,
      hasInvoice: !!invoiceNumber,
      invoiceNumber,
      measures: (o.measures || []).map(m => ({
        modelName: m.modelName,
        breite: m.breite, hoehe: m.hoehe, stueck: m.stueck, farbe: m.farbe
      })),
      log: (o.log || []).map(l => ({
        text: l.text,
        time: l.time?.toDate ? l.time.toDate().toISOString() : l.time
      })),
      // Position in der Warteschlange (nur wenn Bestellung noch nicht in Produktion)
      queue: queue,
      // Voraussichtliche Fertigstellung = die GESPEICHERTE Frist der Bestellung (wie in der App).
      // NICHT live neu berechnen — sonst springt sie bei alten Bestellungen mit, wenn sich
      // Warteschlange/Frist-Modus ändern (z.B. Urlaubs-Manuell-Modus). o.frist = 'YYYY-MM-DD'.
      frist: o.frist || null
    });
  } catch (err) {
    console.error('[api/orders/track]', err);
    res.status(500).json({ error: 'Status konnte nicht geladen werden' });
  }
});

// ── GET /api/orders/track/:token/invoice ───────────────────────
// Streamt die Rechnungs-PDF zum Kunden. Authorisierung via Tracking-Token —
// nur wer den Token aus der Bestätigungs-Email hat, kommt an die PDF ran.
// Da die Storage-Rules nur authentifizierten Mitarbeitern Lesezugriff geben,
// holt der Server die Datei via Admin SDK (umgeht die Rules) und streamt sie weiter.
app.get('/orders/track/:token/invoice', async (req, res) => {
  try {
    const token = req.params.token;
    if (!token || token.length < 16) {
      return res.status(400).send('Ungültiger Tracking-Code');
    }
    const snap = await db().collection('orders').where('trackingToken', '==', token).limit(1).get();
    if (snap.empty) return res.status(404).send('Bestellung nicht gefunden');

    const o = snap.docs[0].data();
    // Bevorzugt Schluss-, fallback Anzahlungs-Rechnung
    const invoiceNumber = o.finalInvoiceNumber || o.depositInvoiceNumber;
    if (!invoiceNumber) return res.status(404).send('Rechnung wurde noch nicht erstellt');

    const filename = `invoices/${invoiceNumber}.pdf`;
    const file = admin.storage().bucket().file(filename);
    const [exists] = await file.exists();
    if (!exists) return res.status(404).send('Rechnungs-Datei nicht gefunden');

    const [buffer] = await file.download();
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename="${invoiceNumber}.pdf"`);
    res.set('Cache-Control', 'private, max-age=300'); // 5 Min Browser-Cache
    res.send(buffer);
  } catch (err) {
    console.error('[api/orders/track/:token/invoice]', err);
    res.status(500).send('Rechnung konnte nicht geladen werden');
  }
});

// ── GET /api/estimated-completion ──────────────────────────────
// Liefert voraussichtliche Fertigstellung für eine neue Bestellung,
// die noch nicht angelegt ist (Step 3 Zusammenfassung).
// Optional `additionalStk` Query-Param für Stk der geplanten Bestellung.
app.get('/estimated-completion', async (req, res) => {
  try {
    const addStk = Math.max(0, Math.min(100, parseInt(req.query.additionalStk) || 0));
    const statsOrders = await loadStatsOrders();
    const stats = computeStats(statsOrders);
    const fristSettings = await getFristSettings();
    const frist = getProposedFristRange(stats, addStk, fristSettings);
    if (!frist.valid) {
      return res.json({ valid: false });
    }
    res.json({
      valid: true,
      from: frist.from.toISOString(),
      to: frist.to.toISOString(),
      mid: frist.mid.toISOString()
    });
  } catch (err) {
    console.error('[api/estimated-completion]', err);
    res.status(500).json({ error: 'Frist konnte nicht berechnet werden', valid: false });
  }
});

function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

// ── Export ─────────────────────────────────────────────────────
exports.api = onRequest({
  cors: true,
  secrets: [RESEND_API_KEY, STRIPE_SECRET_KEY],
  region: 'europe-west1'
}, app);
