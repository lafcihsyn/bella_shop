# Bella Home Webshop — Deploy-Anleitung

> Online-Konfigurator mit **Online-Zahlung via Stripe** (Karte, EPS, Apple/Google Pay),
> automatischer Rechnungsstellung (PDF) und Email-Versand via Resend.

---

## 🔗 URLs (Stand 2026-05-28)

| Zweck | URL |
|---|---|
| **Live (Kunden)** ⭐ | `https://fliegengitterwien.at` |
| Live (Firebase-Default, gleicher Inhalt) | `https://bestellung-fliegengitterwien.web.app` |
| Test-Channel (Stripe-Sandbox) | `https://bestellung-fliegengitterwien--test-<hash>.web.app` (Latest URL via `firebase hosting:channel:list --site bestellung-fliegengitterwien`) |
| Stripe-Webhook-Function | `https://stripewebhook-5k4mdne2mq-ew.a.run.app` |
| API-Health-Check | `https://fliegengitterwien.at/api/health` |

> Custom-Domain `fliegengitterwien.at` und Firebase-Default `bestellung-fliegengitterwien.web.app` zeigen denselben Inhalt — ein Deploy aktualisiert beide gleichzeitig.

---

## 🎯 Aktueller Stand (Stand: 2026-07-11)

**Shop ist LIVE — echte Stripe-Zahlungen aktiv.** Kunden bestellen + bezahlen real auf `fliegengitterwien.at`.

> 📌 **Laufender Projekt-Stand, App-Version + Änderungshistorie:** siehe **[CLAUDE.md](CLAUDE.md)** (Changelog + Offene TODOs) — das ist die lebende Quelle. Diese README ist der Deploy-/Setup-Referenz-Guide (Ersteinrichtung, Stripe/Resend, Debugging).

| Bereich | Status |
|---|---|
| Frontend (Konfigurator + Tracking) | ✅ Live auf `fliegengitterwien.at` |
| Cloud Functions deployed | ✅ `api`, `stripeWebhook`, `onOrderCreated`, `onOrderStatusChange`, `onPaymentReceived`, `scheduledBackup` |
| Stripe-Checkout-Session-Erstellung | ✅ |
| Webhook mit Signatur-Verifikation + Idempotenz | ✅ |
| Webhook-Events behandelt | ✅ `completed`, `expired`, `async_payment_failed`, `charge.refunded`, `charge.dispute.created` |
| PDF-Rechnungen (Anzahlung + Schluss) | ✅ |
| Email-Versand (Resend) | ✅ |
| Refund-Verarbeitung | ✅ Order wird auf `refunded`/`partial_refund` gesetzt, Admin-Email |
| Chargeback-Notification | ✅ Dringende Admin-Email mit Dashboard-Link |
| Stripe Live-Mode | ✅ **Aktiv** (echte Zahlungen) |

> Die „Go-Live-Checkliste" unten ist **erledigt** und bleibt nur als Referenz stehen (z.B. falls Keys mal rotiert werden müssen).

### Nice-to-have / offen

- Smoke-Test um Stripe-Checkout-Flow erweitern (`scripts/smoke-test.sh`)
- Cleanup-Job für `stripeEvents`-Collection (Events > 90 Tage löschen)
- Email an Kunden bei Refund (aktuell nur Admin)
- **Sicherheits-Härtung nach Urlaub** (siehe CLAUDE.md TODOs: App Check schrittweise, Security-Header, Firestore-Rules, stale Hosting-Target `app`)

---

## 🚦 Go-Live-Checkliste

Wenn du von Test- auf Live-Mode umschaltest:

1. **Stripe-Dashboard oben rechts: Test-Modus AUS**
2. **Live-API-Schlüssel kopieren** (Entwickler → API-Schlüssel → „Live-Modus" → Geheimer Schlüssel)
3. **In Firebase überschreiben:**
   ```bash
   firebase functions:secrets:set STRIPE_SECRET_KEY
   ```
   → Live-Key (`sk_live_...`) einfügen
4. **Live-Webhook anlegen** (im Live-Modus des Stripe-Dashboards):
   - Endpunkt-URL: `https://stripewebhook-5k4mdne2mq-ew.a.run.app`
   - Events: dieselben 5 wie im Test-Modus (siehe Schritt 2b)
   - Signing-Secret kopieren und in Firebase überschreiben:
     ```bash
     firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
     ```
5. **Functions redeployen** (damit sie die neuen Secrets laden):
   ```bash
   firebase deploy --only functions:api,functions:stripeWebhook
   ```
6. **Test-Bestellung mit eigener Karte** (~ €5–10) → Webhook prüfen → sofort im Stripe-Dashboard refunden
7. Wenn alles grün: für Kunden öffnen.

---

## ✅ Was ist gebaut?

- **Webshop-Frontend** auf Hosting-Site `bestellung-fliegengitterwien` (Custom-Domain `fliegengitterwien.at`)
- **API** (Cloud Functions) für Bestellungen, Modelle, Farben, Tracking
- **Online-Bezahlung** via [Stripe](https://stripe.com) Checkout
  - Karte, EPS, Apple Pay, Google Pay (Set wird im Stripe-Dashboard verwaltet)
  - Anzahlung wird **vor** Bestell-Anlage kassiert (Saga-Pattern: keine verwaisten Bestellungen)
  - Bestellnummer wird **erst nach Zahlung** vergeben (keine Lücken durch Abbrüche)
  - Webhook mit Signatur-Verifikation + 2-Layer-Idempotenz
- **Email-Benachrichtigungen** via [Resend](https://resend.com)
  - Bestellbestätigung an Kunde (erst nach erfolgreicher Zahlung)
  - Status-Updates (In Produktion → Abholbereit → Abgeholt)
  - Admin-Benachrichtigung an `bestellung@fliegengitterwien.at`
  - Warnung bei fehlgeschlagener Zahlung
- **PDF-Rechnungen** (Anzahlungsrechnung + Schlussrechnung)
- **Tracking-Seite** für Kunden ohne Login (zeigt Zahl-Status, Queue-Position, Frist)
- **Race-Condition-sichere** Bestell- und Rechnungsnummern

## 📋 Voraussetzungen

- [Node.js 20+](https://nodejs.org/) installiert
- Firebase CLI installiert: `npm install -g firebase-tools`
- Eingeloggt: `firebase login`
- **Blaze-Plan aktiv** (für Cloud Functions) ✓
- **Hosting-Site `fliegengitter-bestellung`** existiert ✓

---

## 🚀 Deploy-Schritte

### Schritt 1: Dependencies installieren

```bash
cd <ENTPACKTER-ORDNER>/functions
npm install
cd ..
```

### Schritt 2: Resend-API-Key einrichten

1. Auf [resend.com](https://resend.com) registrieren (gratis bis 3.000 Mails/Monat)
2. Im Resend-Dashboard auf **API Keys** → **Create API Key**
3. Schlüssel kopieren (beginnt mit `re_…`)
4. Als Firebase-Secret speichern:

```bash
firebase functions:secrets:set RESEND_API_KEY
```

→ Schlüssel einfügen, Enter drücken.

**Test-Modus:** Solange Sie keinen API-Key setzen, läuft der Shop trotzdem — es werden nur keine Emails versendet (Console-Log).

### Schritt 2b: Stripe einrichten

1. Auf [stripe.com](https://stripe.com) registrieren und Firmen-Onboarding abschließen
2. In **Stripe-Dashboard → Entwickler → API-Schlüssel**:
   - Für **Tests**: Test-Modus-Toggle aktivieren, „Geheimer Schlüssel" (`sk_test_…`) kopieren
   - Für **Live**: Test-Modus deaktivieren, Live-Schlüssel (`sk_live_…`) kopieren
3. Schlüssel als Firebase-Secret speichern:

```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
```

4. In **Stripe-Dashboard → Entwickler → Webhooks → Endpunkt hinzufügen**:
   - **URL:** Die `stripeWebhook`-Function-URL (zu finden via `firebase functions:list` oder in der Firebase-Konsole; aktuell: `https://stripewebhook-5k4mdne2mq-ew.a.run.app`)
   - **Events:** Diese fünf Events auswählen:
     - `checkout.session.completed`
     - `checkout.session.expired`
     - `checkout.session.async_payment_failed`
     - `charge.refunded`
     - `charge.dispute.created`
   - **Signing-Secret** (`whsec_…`) kopieren und speichern:

```bash
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
```

> ⚠ **Test- und Live-Modus haben getrennte Webhooks und Secrets!** Vor Go-Live im Stripe-Dashboard von Test- auf Live-Modus umschalten und einen neuen Live-Webhook anlegen. Dann `STRIPE_SECRET_KEY` und `STRIPE_WEBHOOK_SECRET` mit den Live-Werten überschreiben.

### Schritt 3: Counter manuell anlegen

**Wichtig vor dem ersten Deploy.** Sonst geht beim ersten Online-Auftrag die App-Nummer-Logik durcheinander.

In der **Firebase Console → Firestore** zwei Dokumente anlegen:

#### `settings/orderCounter`
```
year:        2026   (Number)
lastNumber:  ???    (Number)
```

> **`lastNumber`-Wert:** In Ihrer App **das aktuell höchste Bestellnummern-Suffix** in 2026 nachschauen.
> Beispiel: Wenn Ihre letzte App-Bestellung `#2026-00149` ist, dann `lastNumber: 149`.
>
> Die nächste Bestellung (egal ob App oder Shop) bekommt dann automatisch `#2026-00150`.

#### `settings/invoiceCounter`
```
year:        2026   (Number)
lastNumber:  0      (Number)
```

> Die erste Rechnung wird `FGO2026-00001`. Wenn Sie schon andere Online-Rechnungen vergeben haben, setzen Sie `lastNumber` entsprechend.

### Schritt 4: Modell "Klassik" für Webshop aktivieren

In Ihrer **App (Stammdaten → Modelle)** das Modell "Klassik" öffnen und:

- ✅ **"Im Webshop anzeigen"** anhaken
- **Kurzbeschreibung** ausfüllen (1 Satz, erscheint im Shop)
- **Lange Beschreibung** ausfüllen (optional, für Details)
- **Webshop-Maßgrenzen** prüfen — Empfehlung: enger als die internen Grenzen, damit Online-Kunden nichts Verrücktes bestellen können

> Andere Modelle bleiben offline, bis Sie sie freischalten — genau wie besprochen.

### Schritt 5: Deploy

```bash
firebase deploy --only firestore:rules,storage:rules,functions,hosting:shop
```

Beim **ersten Deploy** dauert das 3–5 Minuten (Functions-Container muss gebaut werden). Bei Updates später nur ~1 Minute.

> ⚠ Beim allerersten Deploy kann der Cloud-Functions-Stack 1-2 Minuten brauchen, bis die `/api/*`-URL erreichbar ist. Falls 503 Fehler → ein paar Minuten warten.

### Schritt 6: Test-Bestellung (Stripe-Sandbox)

1. Öffnen Sie `https://fliegengitterwien.at`
2. Modell "Klassik" auswählen → Maße eingeben → Kontakt → Anzahlung
3. **Test-Email:** Eigene Email-Adresse verwenden
4. Bestellung absenden → wird zur Stripe-Checkout-Seite weitergeleitet
5. Im **Test-Modus** mit Stripe-Testkarte bezahlen:
   - **Erfolg:** `4242 4242 4242 4242` · beliebiges zukünftiges Datum · beliebige CVC · PLZ `1230`
   - **Ablehnung:** `4000 0000 0000 0002`
   - **3DS-Authentifizierung erforderlich:** `4000 0025 0000 3155`
   - Weitere: [stripe.com/docs/testing](https://stripe.com/docs/testing)

**Was sollte passieren (bei erfolgreicher Zahlung):**

- ✓ Stripe leitet zurück zur Tracking-Seite mit `?paid=1`
- ✓ Webhook feuert `checkout.session.completed` → Order wird `paid`, Bestellnummer (`#2026-00150`) wird vergeben
- ✓ Kunde bekommt Bestätigungs-Email
- ✓ Anzahlungsrechnung (`FGO2026-00001`) wird automatisch als PDF erzeugt + per Email versendet
- ✓ `bestellung@fliegengitterwien.at` bekommt die Admin-Benachrichtigung
- ✓ In der App erscheint die Bestellung in Spalte **Bestellung** mit 📦 Online-Badge

**Was sollte passieren (bei abgelehnter Karte / EPS-Abbruch):**

- ✓ Order erhält `paymentStatus: failed` (bei asynchronen Methoden via Webhook)
- ✓ Bei synchroner Karten-Ablehnung kann der Kunde sofort eine andere Karte probieren — Session bleibt 30 Min aktiv
- ✓ Bei Abbruch nach 30 Min → `paymentStatus: expired`

### Schritt 7: Produktion starten

Wenn die Anzahlung erfolgreich verbucht wurde, läuft alles automatisch. Status manuell wechseln auf **In Produktion**.

**Was sollte passieren:**

- ✓ Status-Update-Email "In Produktion" geht an Kunde

### Schritt 8: Abholung

Wenn Kunde abholt:

1. In der App Bestellung auf **Abholbereit** setzen → Kunde bekommt Email
2. Bei Abholung: Restbetrag erfassen + Status auf **Abgeholt** + **paid: true**

**Was sollte passieren:**

- ✓ Schlussrechnung (`FGO2026-00002`) wird automatisch erzeugt
- ✓ PDF wird per Email an Kunde gesendet, mit Verweis auf die Anzahlungsrechnung
- ✓ Letzte Status-Email "Abgeholt" geht an Kunde

---

## 📁 Datei-Struktur

```
bella_shop/
├── firebase.json            ← Multi-Site Hosting + Functions Config
├── .firebaserc              ← Targets: app + shop
├── firestore.rules          ← Sicherheitsregeln
├── storage.rules            ← Storage-Regeln (PDF-Rechnungen)
├── public/                  ← Webshop-Frontend
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js
│   ├── icons/
│   ├── css/style.css
│   └── js/
│       ├── config.js
│       ├── api.js
│       ├── state.js
│       ├── views.js
│       └── app.js
└── functions/               ← Cloud Functions
    ├── package.json
    ├── index.js
    └── src/
        ├── api.js            ← REST-API (POST /orders, GET /models, ...)
        ├── lib/
        │   ├── counters.js   ← Bestell- + Rechnungsnummern
        │   ├── company.js    ← Firmenstammdaten (UID, FN, IBAN, ...)
        │   ├── pricing.js    ← Preisberechnung (= App-Logik)
        │   ├── prodstats.js  ← Queue-Position + Frist-Berechnung
        │   └── pdf.js        ← PDF-Rechnungs-Generator
        ├── payments/
        │   ├── stripe.js     ← Checkout-Session-Helper
        │   └── webhook.js    ← Stripe-Webhook-Handler (completed/expired/failed)
        ├── email/
        │   ├── sender.js     ← Resend-Wrapper
        │   └── templates.js  ← HTML-Email-Templates
        └── triggers/
            ├── onOrderCreated.js       ← Bestätigungs- + Admin-Email (nach Zahlung)
            ├── onOrderStatusChange.js  ← Status-Update-Email
            └── onPaymentReceived.js    ← PDF-Rechnung + Email
```

---

## ⚙ Wichtige Konfigurations-Punkte

### Firmenstammdaten ändern

Datei: `functions/src/lib/company.js`

Diese Werte erscheinen auf jeder PDF-Rechnung und in jeder Email.

### Email-Absender ändern

In `functions/src/lib/company.js`:

```js
emailFrom: 'Bella Home Bestellung <onboarding@resend.dev>',
```

→ Solange Sie keine eigene Domain bei Resend verifiziert haben, **muss** `onboarding@resend.dev` der Absender sein. Antworten auf Emails gehen aber an `info@bellahome.at` (Reply-To).

**Eigene Domain verifizieren:** Im Resend-Dashboard unter **Domains** Ihre Domain `bellahome.at` hinzufügen, DNS-Einträge (SPF/DKIM) bei Ihrem Domain-Provider eintragen. Dann können Sie z.B. `bestellung@bellahome.at` als Absender verwenden.

### Anzahlungs-Default ändern

Datei: `public/js/config.js` → `deposit.default`

Standard: 50 % (= Mindestbetrag). Slider geht von 50 % bis 100 %.

---

## 🐛 Debugging

### Logs anschauen

```bash
firebase functions:log
```

oder in der Firebase Console: **Functions → Logs**.

### API-Health-Check

```
https://fliegengitterwien.at/api/health
```

→ Sollte `{"ok":true,"time":"...","version":"1.0.0"}` zurückgeben.

### Stripe-Webhook prüfen

Im **Stripe-Dashboard → Entwickler → Webhooks → [Endpoint] → Versuche**:
- Status sollte `200` sein
- Bei `400` „Signature verification failed" → `STRIPE_WEBHOOK_SECRET` stimmt nicht
- Bei `500` → in `firebase functions:log --only stripeWebhook` schauen

### Emails kommen nicht an

1. Resend-Dashboard öffnen → **Logs** → letzte Mails prüfen
2. Spam-Ordner prüfen (insbesondere bei Gmail/Outlook)
3. `firebase functions:log` → Fehlermeldungen suchen

### Modell erscheint nicht im Shop

- ✓ Hat das Modell `webshopActive: true`?
- ✓ Hat es einen `name` und `pricing.defaultSqmPriceEinzeltuer` > 0?
- ✓ Firestore-Regeln deployed?

---

## ⚠ Hinweise

### Logo

Aktuell sind die Icons (`/icons/icon-192.png`, `icon-512.png`) **Platzhalter** aus der App.
Sobald Sie ein echtes Bella-Home-Logo haben:
1. PNG mit 192×192 und 512×512 Pixel exportieren
2. Im Ordner `public/icons/` ersetzen
3. Re-Deploy

### Bestellnummer-Counter in der App

Aktuell vergibt **nur der Shop** Nummern via Firestore-Counter.
Die **App** verwendet noch die alte Logik (höchste Nummer suchen).

**Risiko:** Wenn Sie gleichzeitig in der App und im Shop bestellen, könnten doppelte Nummern entstehen.

**Lösung in Phase 2** (kommt später):
App-Update einspielen, das ebenfalls den `settings/orderCounter` verwendet.

### Was der Shop aktuell NICHT kann

- ❌ Versand (nur Filialabholung)
- ❌ Mehrsprachigkeit (nur Deutsch)
- ❌ Automatische E-Mail an Kunden bei Refund (nur Admin wird benachrichtigt; Tracking-Seite zeigt aber Refund-Status an)
- ❌ Smoke-Test deckt Stripe-Checkout-Flow nicht ab (nur Health/Lookup)

---

## 📞 Bei Problemen

Wenn nach dem Deploy etwas nicht funktioniert, schicken Sie:

1. **URL** der Site
2. **Was Sie gemacht haben** (Schritt-für-Schritt)
3. **Fehlermeldung** (Screenshot)
4. **Browser-Konsole** (F12 → Console-Tab, Screenshot)
5. **Function-Logs:** `firebase functions:log --only api` (letzte 20 Zeilen)

Dann kann ich gezielt helfen.

---

**Viel Erfolg beim Launch!** 🚀
