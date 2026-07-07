# CLAUDE.md — Bella Home Projekt-Kontext

> Diese Datei wird bei jedem neuen Chat automatisch geladen. Sie hält den Kontext fest,
> damit nichts neu erklärt werden muss. **Identische Kopie liegt in beiden Projekt-Ordnern**
> (`bella_shop/` und `fliegengitter-web/`) — bei Änderungen BEIDE aktualisieren.

---

## ⛔ WICHTIGE REGELN (immer einhalten)

1. **Deploy-Reihenfolge: IMMER zuerst Test-Channel, dann erst Live.**
   Live-Deploy NUR nach explizitem „OK, jetzt live" / „live bitte" vom User. Niemals ungefragt live.

2. **Keine Geheimnisse im Chat. Niemals. Auch nicht teilweise.**
   Keine API-Keys, Tokens, Stripe-Secrets, Passwörter, Counter-Werte etc. im Chat ausgeben.

3. **Sprache: Deutsch, Du-Form.** Der User ist kein Profi-Programmierer.
   - Visuelle Mockups / Erklärungen vor größeren Änderungen anbieten.
   - Bulk-Tools / Massen-Operationen vermeiden bzw. mit großer Vorsicht — der User hat Angst,
     dass solche Tools mehr kaputt machen. Lieber kleine, nachvollziehbare Schritte.

4. **Bei jedem Deploy: Version hochzählen** (siehe Versionierung).

---

## Wer ist der User

- Betreibt **Bella Home** — Fliegengitter-Geschäft in Wien (Maßanfertigung).
- Filialen u.a. **Bella Home (Hauptbetrieb)** + **Inegöl**.
- Email: craft@bellahome.at
- Kein Profi-Entwickler → klare, einfache Erklärungen, keine unnötigen Optionen-Listen.

---

## Die zwei Projekte (teilen sich EINE Firestore-DB)

| Projekt | Ordner | Hosting-URL | Inhalt |
|---|---|---|---|
| **BestellApp** | `/Users/craft/Documents/fliegengitter-web/` | https://fliegengitter-3486c.web.app | Interne PWA für Mitarbeiter: Bestellungen, Produktion, Stammdaten, Etiketten-Druck |
| **Webshop** | `/Users/craft/Documents/bella_shop/` | bestellung-fliegengitterwien (Hosting-Target `shop`) + Cloud Functions | Öffentlicher Shop, Stripe-Zahlung, Email/Rechnung, alle Cloud Functions |

- Firebase-Projekt (beide): **`fliegengitter-3486c`**
- Cloud Functions Region: **europe-west1**
- Beide nutzen dieselbe Firestore-DB → Bestellungen aus App + Shop landen gemeinsam in `orders`.

---

## 🔗 Adressen-Spickzettel (Live + Test-Channel)

**BestellApp (fliegengitter-web) — intern für Mitarbeiter:**
- 🟢 **Live:** https://fliegengitter-3486c.web.app
- 🧪 **Test:** https://fliegengitter-3486c--test-zeevrfnf.web.app *(aktueller Channel; die genaue Adresse zeigt der Deploy-Befehl an — Hash kann sich ändern, wenn der Channel neu erstellt wird)*

**Webshop (bella_shop) — öffentlicher Shop:**
- 🟢 **Live:** https://fliegengitterwien.at (= https://www.fliegengitterwien.at) · Firebase-Adresse: https://bestellung-fliegengitterwien.web.app
- 🧪 **Test:** https://bestellung-fliegengitterwien--test-sy9w75ds.web.app *(aktueller Channel; Deploy-Befehl zeigt die genaue Adresse)*

**Deploy-Befehle** — Test IMMER zuerst, Live nur nach „live bitte":

| Was | Test-Channel | Live |
|---|---|---|
| **BestellApp** | im Ordner `fliegengitter-web`: `firebase hosting:channel:deploy test --expires 7d` | `firebase deploy --only hosting` |
| **Webshop** | im Ordner `bella_shop`: `firebase hosting:channel:deploy test --only shop --expires 7d` | `firebase deploy --only hosting:shop` |
| **Functions** | *(kein Test-Channel möglich)* | `firebase deploy --only functions:<name>` (z.B. `api`, `stripeWebhook`) |

- **Firebase-Console:** https://console.firebase.google.com/project/fliegengitter-3486c
- **Windows-Hinweis:** Ordner-Pfade sind dort anders (z.B. `C:\Users\…\bella_shop`) — die Befehle im jeweiligen Projekt-Terminal ausführen. Einmalig `firebase login` (Google-Konto) nötig, dann laufen die Deploys identisch.

---

## Deploy-Workflow

### BestellApp (fliegengitter-web)
```bash
cd /Users/craft/Documents/fliegengitter-web
# 1. ZUERST Test-Channel:
firebase hosting:channel:deploy test --expires 7d
# 2. Nach User-OK ("live bitte") → Live:
firebase deploy --only hosting
```
Test-URL-Muster: `https://fliegengitter-3486c--test-<hash>.web.app`

### Webshop (bella_shop)
```bash
cd /Users/craft/Documents/bella_shop
firebase deploy --only hosting:shop          # Webshop-Frontend
firebase deploy --only functions:<name>      # einzelne Function
```
Wichtige Functions: `api`, `stripeWebhook`, `onOrderCreated`, `onOrderStatusChange`, `onPaymentReceived`, `scheduledBackup`

---

## Versionierung (bei JEDEM BestellApp-Deploy beide hochzählen)

1. `APP_VERSION` in [fliegengitter-web/public/index.html](fliegengitter-web/public/index.html) (Konstante, ~Zeile 1275)
2. `CACHE_NAME` in [fliegengitter-web/public/sw.js](fliegengitter-web/public/sw.js) (Zeile 1) — Format: `'fliegengitter-vX.Y.Z-kurz-beschreibung'`

Beides muss gebumpt werden, sonst sehen Mitarbeiter die alte gecachte Version (Service Worker ist hartnäckig).
**Aktueller Stand: v1.20.12** (Stand: 2026-07-07)

---

## BestellApp Datei-Struktur (`fliegengitter-web/public/js/`)

| Datei | Inhalt |
|---|---|
| `01-helpers.js` | Helper: escHtml, Farb-Lookups, `getColorOptionsHtml()`, Name-Sanitizer (`sanitizeName`) |
| `02-i18n.js` | Übersetzung DE↔TR (`t()`, `TRANSLATIONS_TR`, `currentLanguage`) |
| `03-auth.js` | Login / Auth |
| `04-stock.js` | Lager / B-Ware |
| `05-output.js` | **Etiketten-Druck** (TSPL → Print-Server), PDF, Share/Download |
| `06-stammdaten.js` | Stammdaten-Editor: Modelle, Varianten, Farben, Filialen, Mitarbeiter |
| `07-board.js` | Kanban-Board, Karten-Anzeige, Farb-Badges |
| `08-order.js` | **Bestell-Formular** (neu + edit), Maße, Varianten, WhatsApp |
| `09-prodstats.js` | Produktionsstatistik, Drill-Downs (Mitarbeiter/Filiale) |
| `10-search.js` | Such-Overlay |
| `11-buchhaltung.js` | Buchhaltung |
| `12-mat-forecast.js` | Materialbedarf-Prognose |

## Webshop Struktur (`bella_shop/`)
- `public/js/app.js`, `public/js/views.js` — Shop-Frontend
- `functions/src/api.js` — Bestell-API (Validierung, Preis-Server-Truth)
- `functions/src/email/templates.js` — Email-Templates (orderConfirmation, statusUpdate, adminNewOrder)
- `functions/src/email/sender.js` — Resend-Versand
- `functions/src/payments/` — Stripe (stripe.js, webhook.js)
- `functions/src/triggers/` — Firestore-Trigger
- `functions/src/lib/counters.js` — `generateOrderNumber` (#2026-00150, mit Catch-up gegen Doppel) + `generateInvoiceNumber` (FGO2026-00001)
- `functions/src/lib/` — pricing.js, pdf.js, company.js, prodstats.js

---

## Firestore Collections (shared)

`orders`, `models`, `variants`, `colors`, `plissee_colors`, `netz_colors`, `netz_breiten`,
`material_dimensions`, `materials`, `members`, `filialen`, `settings/orderCounter`,
`settings/invoiceCounter`, `migration_backups`

### Wichtige Daten-Konventionen
- **Bestellungen** haben `measures[]` (Maß-Array). Jedes Maß hat `breite`, `hoehe`, `stueck`, `farbe`, `modelId`, `variants{}`, `bemerkung`.
- **`o.farbe` (top-level) ist abgeschafft** (seit v1.19.50). Farbe lebt pro Maß in `m.farbe`.
  Reads mit Fallback: `m.farbe || (o.measures?.[0]?.farbe)`.
- `m.variants` enthält z.B. `tuerart`, `schwellenlos`, `bodenprofil`, `netz_plissee`, `plisseeFarbe`, `netzFarbe`.
- **Netz/Plissee**: `netz_plissee` = `netz` | `plisee` | `kombi`. Bei Plissee/Kombi → `plisseeFollowup` fragt `plisseeFarbe` ab.
- Bestellnummer-Format: `#2026-00150`. Rechnungsnummer: `FGO2026-00001`.
- Bestellquelle: `o.source` = `online` (Webshop) | sonst App.
- Status-Spalten: Bestellung, In Produktion, Abholbereit, Abgeholt, Reparatur, Warteliste, B-Ware, Gelöscht, Archiviert.

---

## Backup-System
- **Manuell**: BestellApp → Einstellungen → „Backup herunterladen" ([index.html:745](fliegengitter-web/public/index.html)) → JSON aller Collections auf den Mac (Offsite). `restoreBackup()` zum Einspielen. Format-Version `5.9`.
- **Automatisch (täglich 19:00 Wien)**: Cloud Function `scheduledBackup` ([bella_shop/functions/src/triggers/scheduledBackup.js](bella_shop/functions/src/triggers/scheduledBackup.js)) → schreibt dasselbe JSON nach Cloud Storage `gs://fliegengitter-3486c.firebasestorage.app/backups/`. Aufbewahrung 30 Tage (Auto-Löschen in der Function selbst). Kosten ~1 Cent/Monat. DB ist ~17 MB.
- **Auto nach Bestellung**: `autoBackupAfterOrder()` sichert in Firestore-Collection `backups` (letzte 5) — Legacy, lebt IN der DB.
- Download eines Auto-Backups: Firebase Console → Storage → `backups/`.
- **WICHTIG**: `BACKUP_COLLECTIONS`-Liste existiert 2× (App `index.html:1269` + Function) → bei Änderung beide angleichen.

## Etiketten-Druck (aktuell)
- BestellApp erzeugt **TSPL** (Textsprache) → URL-encoded → `window.open()` an Print-Server
  (Termux auf Tablet, `192.168.178.25:8150`) → ARTDEV AL-D460 Drucker.
- Etikett 100×50mm. Print-Server-URL in localStorage (`fg_print_server_url`), global.
- Geplant: Filiale Inegöl mit Zebra ZD220t (ZPL) — Plan separat.

---

## Wichtige gelöste Themen / Konventionen
- **Doppelte Bestellnummern**: counters.js hat Catch-up-Logik (`Math.max(counter, localMax)+1`). 29 alte Doppel bewusst belassen (keine Konflikte im selben aktiven Status).
- **Browser-Auto-Translate** deaktiviert (`translate="no"`, `<meta name="google" content="notranslate">`) — Kundennamen sollen nicht übersetzt werden.
- **Name-Sanitizer**: Eingabefelder lassen nur Latein+Umlaute zu, transliterieren TR-Zeichen (ş→s, ç→c, …). In App (`sanitizeNameInput`) + Webshop.
- **WhatsApp-Templates**: `{name}`, `{rest}`, `{bestellnummer}` (fett via `*…*`).

---

## Offene TODOs / geplante Arbeiten
- **Windows-Laptop für Urlaub** — ✅ **FERTIG & verifiziert** (2026-07-02): Beide Projekte auf GitHub (privat `lafcihsyn/bella_shop` + `lafcihsyn/fliegengitterApp_Shop`, aktuell, keine Secrets), auf Windows geklont, `firebase login` erledigt, **Test-Deploy beider Projekte von Windows erfolgreich**. Kontinuität über CLAUDE.md. **Arbeitsweise mit 2 Rechnern:** nach Änderungen committen+pushen (nicht nur deployen) → beim Rückkehr `git pull` auf Mac. Optional offen: `fliegengitterApp_Shop` auf Private stellen.
- **Sicherheit/Qualität (nach Urlaub, aus externer Code-Analyse 2026-07-02)** — nichts davon vor Urlaub deployen (Shop-Risiko):
  - **App Check** auf öffentlichem `POST /api/orders` (Spam-/Kostenschutz). ⚠️ **RISIKO:** falsch konfiguriert = Checkout lautlos blockiert. **Nur schrittweise** (erst Monitor-Modus, dann erzwingen), NIE kurz vor Abwesenheit. Entschärfung heute: unbezahlte Orders sind `paymentStatus:'pending'` → fliegen aus Queue/Frist (`loadStatsOrders`).
  - **Security-Header** am `shop`-Target in firebase.json: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`. (Full CSP separat/vorsichtig — kann Stripe/Inline brechen.) Risikoarm.
  - **Stale Hosting-Target** entfernen: bella_shop firebase.json `app` → `../fliegengitter-v1.13.0/public` existiert nicht (App wird aus fliegengitter-web deployt). Aufräumen.
  - **Firestore-Rules härten**: firestore.rules Z.66 Catch-all `allow read, write: if request.auth != null` → jeder eingeloggte (auch deaktivierte, ~1h Token) hat DB-Vollzugriff; Rechte-Prüfung nur clientseitig. Größeres Projekt.
  - **Tests/Lint** für Geld-/Nummern-Logik (pricing.js `calcOrderTotal`, counters.js `generateOrderNumber`, Frist). Erledigt: `.gitignore`. Email (info@/bestellung@/craft@) ist Absicht, kein Bug.
- **Transport-Status** — LIVE & einsatzbereit (v1.20.6/7). Beide Rechte default AN für alle; Owner kann optional in „Rollen verwalten" einzelne Mitarbeiter abhaken, die Transport nicht sehen/verschieben sollen. Kein Pflicht-Setup mehr.
- **Schnittliste-Engine v3** (zurückgestellt 2026-06-24, „für später"): eine reine `computeCuttingList`-Engine (`public/js/cutting-engine.js`) statt der heute **3 divergierenden** Rechenwege. Plan + Feasibility (gegen echtes Backup validiert, Self-Test stimmt) in [.claude/plans/schnittliste-engine-v3.md](.claude/plans/schnittliste-engine-v3.md). **Vor Start klären:** ~~Falten-Regel~~ (GEKLÄRT v1.20.9: nur Kombi = volle Falten, sonst Doppeltür halbiert/2-Flügel), Mengen kommen aus `materials`-Master (nicht Modell), alte Orders ohne `modelId`, Golden-Master-Semantik (pro-Stück vs. total).
- Zebra ZD220t Drucker für Filiale Inegöl (WebUSB, ZPL) — Plan bereit ([.claude/plans/perfekt-dan-machen-wir-mossy-feigenbaum.md](.claude/plans/perfekt-dan-machen-wir-mossy-feigenbaum.md)), **wartet auf neues Gerät**.
- In 4–8 Wochen: inaktive Kombi-Modelle (Pro/Slim Sonnenschutz) löschen.
- Phase 2: Plissee-Lager m²-Abzug.
- Webshop-Konfigurator (Variante B Mockup).
- [P1] GMB + Search Console · [P2] SEO-Landingpages · [P3] Bewertungen/WhatsApp.

---

## Changelog (Live-Deploys)
> Bei jedem **Live**-Deploy hier einen Eintrag ergänzen (neueste oben).

- **v1.20.12** (2026-07-07) — **Externe Reparatur (Gitter nicht bei uns bestellt)**: Bisher entstand eine Reparatur nur über „🔧 Reparatur erfassen" bei einer **abgeholten** Bestellung (Kunde/Maße/Modell vom Original kopiert). Neu: **„🔧 ＋ Externe Reparatur erfassen"**-Knopf in der Reparatur-Spalte ([07-board.js](fliegengitter-web/public/js/07-board.js) — Top-Knopf `repTopBtn` + Leer-Zustand, Recht `reparatur_handle`). `openReparaturForm`/`saveReparatur` ([08-order.js](fliegengitter-web/public/js/08-order.js)) haben jetzt einen **Extern-Modus** (`isExtern = !originalId`): Kunde (Name/Telefon) + Maße manuell, **Modell optional** (Dropdown aus cachedModels; leer = nur Maße). Flag `externalRepair:true`, keine `originalOrderId`, eigene Nummer **`#R-2026-001`** (fortlaufend via `_generateExternalReparaturNumber`, client-seitig aus `orders`). From-Order-Pfad unverändert (Gegenprobe). Live: nur App-Hosting.
- **v1.20.11** (2026-07-04) — **Materialbedarf: Auswahl + Export (CSV/Drucken-PDF/Teilen)**: In der Materialbedarf-Liste ([12-mat-forecast.js](fliegengitter-web/public/js/12-mat-forecast.js)) Checkbox **inline** vor jedem Hauptmaterial (nicht bei Farben; ganze Zeile als Label klickbar) + Toolbar „☑ Alle · 📄 CSV · 🖨️ Drucken/PDF · 📤 Teilen". Export nur der angehakten Materialien inkl. Farb-Aufschlüsselung. CSV = Blob-Download (`Material;Typ;Farbe;Menge`, Excel-BOM). Drucken/PDF = verstecktes **iframe** (kein neues Fenster → Nutzer bleibt in App, kein Pop-up-Blocker) → Druck-Dialog, dort „Als PDF speichern". Teilen = Web-Share (CSV-Datei/Text, nur wenn `navigator.share`). Export-Werte via `_fcVal` als **Klartext** (HTML aus `_formatStangenSuffix` gestript). `_forecastMats` merkt letzten Stand. Keine PDF-Lib nötig. Live: nur App-Hosting.
- **v1.20.10** (2026-07-03) — **Manueller Bestellpreis bleibt + eigenes Recht**: (1) **Bugfix:** Ein manuell gesetzter Gesamtpreis wurde bei jedem weiteren Speichern (Zahlung eintragen, Name ändern…) wieder aus den Maßen neu berechnet → sprang zurück (Salih musste 3× tippen). Ursache: `totalOverrideValue` war einmalig (nach Anwenden auf `null`), kein persistenter Merker. Fix: neuer Order-Flag **`priceManual`** in [08-order.js](fliegengitter-web/public/js/08-order.js) `doSaveOrderEdit` (~Z.869) — manueller Preis bleibt, bis er auf den Auto-Preis zurückgesetzt wird; behebt auch Reparatur-Preis (sprang auf 0). (2) **Neues Recht `order_price_edit`** („Bestellpreis ändern") — Gate von `isAdmin()` → `hasPerm('order_price_edit')` (Feld-Anzeige Z.646 + Speichern); Default AUS, Admin/Superadmin automatisch. In PERM_GROUPS-Gruppe **„Bestellungen"** (bei „Zahlungen eintragen"), zusammen mit `price_edit` (m²-Preis, dorthin verschoben). Live: nur App-Hosting.
- **v1.20.9** (2026-06-27) — **Kombi: volle Faltenanzahl bei Doppeltür**: Die Netz-/Plissee-Faltenanzahl wurde bei JEDER Doppeltür halbiert (2-Flügel-Annahme, `(Breite−Abzug)÷2÷2`, STK 2). Bei **Netz/Plissee-Kombi** bedecken Netz UND Plissee aber die VOLLE Breite (je eine Bahn) → darf nicht halbiert werden. Fix: neue Bedingung `splitDT = isDoppeltuer && netz_plissee !== 'kombi'` an beiden Rechen-Stellen — Schnittliste-Anzeige ([index.html](fliegengitter-web/public/index.html) renderTable ~Z.3254) + Material-Verbrauch ([07-board.js](fliegengitter-web/public/js/07-board.js) computeOrderMatVerbrauch ~Z.735). Kombi-Doppeltür → volle Falten `(Breite−Abzug)÷2`, STK 1; normale Netz-/Plissee-Doppeltür + Einzeltür unverändert. **Faltenanzahl ist reine Code-Logik, kein Cutliste-Feld.** Live: nur App-Hosting. (Verwandt: offene Schnittliste-Engine-v3 — Falten-Regel damit geklärt: nur Kombi voll.)
- **2026-06-27** — **Tracking zeigt gespeicherte Frist (Bugfix) + „3–7 Werktage"-Texte korrigiert**: (1) Die Kunden-Tracking-Seite rechnete die „Voraussichtliche Fertigstellung" bei JEDEM Aufruf live neu (`getProposedFristRange`) → bei alten Bestellungen sprang sie mit Stau/Manuell-Modus mit (z.B. App 08.07., Tracking 10.–24. Aug). Fix: Tracking-Endpoint ([api.js](bella_shop/functions/src/api.js) `/orders/track/:token`) gibt jetzt die **gespeicherte `o.frist`** zurück (wie die App), kein Live-Recompute; neuer `formatFristDate()` in [views.js](bella_shop/public/js/views.js) (versteht „YYYY-MM-DD"/ISO/Alt-Objekt → robust beim Deploy). Konfigurator-Anzeige für NEUE Bestellungen bleibt live (korrekt). (2) Feste „ca. 3–7 Werktage"-Angaben (Checkout-Box + Hilfe/FAQ in views.js) ersetzt durch „je nach Auftragslage unterschiedlich — Termin vor dem Bezahlen sichtbar". Live: `hosting:shop` + Function `api`.
- **v1.20.8** (2026-06-27) — **Frist-Modus: Automatisch / Manuell (Wochen-Spanne)**: Neuer Einstellungen-Bereich „⏱ Frist-Berechnung" — **Automatisch** (wie bisher, System-Durchschnitt) oder **Manuell** (feste Spanne „von X bis Y Wochen", z.B. bei Urlaub/Stau). Bei Manuell = `heute + X·7` … `heute + Y·7` Kalendertage, mid = Mitte; Vorschau im Settings-UI. Globals `fristMode/fristFromWeeks/fristToWeeks` in settings/global (shared). App: index.html (UI + save/load `applyFristModeUI`/`saveFristMode`) + 09-prodstats.js (Manuell-Zweig in getProposedFristRange). Server: prodstats.js (Manuell-Zweig + neuer `getFristSettings()` liest settings/global, +Export), 3 Caller laden+übergeben fristSettings (api.js track + /estimated-completion, webhook.js). Gilt überall automatisch (Shop-Konfigurator, Tracking, App-Banner/Vorschlag). **Default Automatisch.** Anlass: Urlaub Wien 15.07.–15.08.2026 (2 von 3 Produzenten weg → ~5→3 Kapazität) + großer Auftragsstau → Auto-Frist (60-Tage-Schnitt) würde zu früh versprechen. Live: App-Hosting + Functions api,stripeWebhook.
- **v1.20.7** (2026-06-26) — **Transport-Rechte Default AN**: Auf Wunsch beide Transport-Rechte (`transport_view` + `move_to_transport`) standardmäßig für ALLE Mitarbeiter aktiv — in `DEFAULT_ALLOW_PERMISSIONS` (index.html ~Z.3368, `!== false`-Logik wie `prices_view`) + `DEFAULT_PERMS.mitarbeiter` true (03-auth.js). Owner hakt in „Rollen verwalten" gezielt AB, wer es nicht haben soll (statt 24× einzeln anzuhaken). Live: nur App-Hosting.
- **v1.20.6** (2026-06-26) — **Transport-Status (Inegöl-Lieferung)**: Neue Board-Spalte „Transport" zwischen „In Produktion" & „Abholbereit" (cyan). Inegöl schiebt fertige Aufträge manuell hinein (Ware noch nicht vor Ort), bei Ankunft → Abholbereit. Kunde sieht auf der Tracking-Seite „In Vorbereitung zur Abholung" + Beruhigungs-Subtext (kein Datum), **keine** Abholbereit-Mail (onOrderStatusChange-Whitelist schützt automatisch). Zwei neue Rechte (Default AUS, Admin auto): `move_to_transport` (verschieben) + `transport_view` (Spalte sehen) — in PERM_GROUPS, erscheinen automatisch im Rechte-Editor. Spalte via In-Memory-Migration in loadSettings nachgerüstet (BEWUSST ohne saveColumns — kein Leak in `settings/global` vor Live). Frist/Prodstats unverzerrt: `computeStats` zählt Produktion beim **ersten** „nach Transport/Abholbereit verschoben" (App 09-prodstats.js + Server prodstats.js synchron); `openCols`+'Transport', `warteSpalten` unverändert (Transport ist keine Warteschlange). Geändert: index.html (boardColumns, renderColumnsEdit, loadSettings-Migration), 03-auth.js, 07-board.js (movePMap/movePerms/Sichtbarkeit/transportAt), 08-order.js (statusColors/statusPermMap/lockedColumns), 05-output.js, 10-search.js, 02-i18n.js („Sevkiyatta"), 09-prodstats.js + bella_shop views.js (Tracking-Steps+Label+Subtext), prodstats.js. Live: App-Hosting + hosting:shop + Functions api,stripeWebhook. **Setup-Aufgabe (Owner):** Rechte für Inegöl (beide) + Wien (transport_view) anhaken.
- **v1.20.5** (2026-06-26) — **Schnittliste Maß-Index-Fix (Off-by-One bei Stk≥2)**: In der Schnittliste-Ansicht (`renderTable`, index.html) wurde `currentSlide` direkt als Index in `o.measures` benutzt — `currentSlide` zählt aber **Slides** (jedes Stück eine eigene Slide, `summarySlides` via `expanded`), nicht **Maße**. Sobald eine Bestellung irgendwo ein Maß mit Stk≥2 hatte, waren ab da Slide- und Maß-Index verschoben → die Tabelle rechnete mit dem **falschen Maß** (Bodenprofil/Overrides/Abzüge vertauscht), während der Kopf/die Badges korrekt blieben. Fix: `_measureIndex` der Slide ins `summarySlides`-Objekt mitgegeben (index.html ~Z.2932) + `renderTable` nutzt `summarySlides[currentSlide]._measureIndex` statt `currentSlide` (Fallback Breite/Höhe-Match unverändert). Betraf ALLE Multi-Stück-Bestellungen — produktionskritisch (Schnittmaße waren falsch). Live: nur App-Hosting.
- **2026-06-26** — **Webshop: inaktive Farben ausgeblendet**: Der Webshop-Konfigurator zeigte deaktivierte Profil-Farben (z.B. „TEST FARBE") weiter an. Ursache: `/api/colors` (+ `/plissee-colors`, `/netz-colors`) lieferte ALLE Katalog-Farben ohne `active`-Filter, und [views.js](bella_shop/public/js/views.js) `colorsForModel` (~Z.917) filterte nur nach Modell-Zugehörigkeit. Fix in 2 Schichten (cache-robust): `active !== false` in allen 3 API-Endpoints ([api.js](bella_shop/functions/src/api.js)) + im Frontend-Filter. Live: `hosting:shop` + Function `api`. (Interner BestellApp war schon ok seit v1.19.62 — Webshop ist eigener Code.)
- **v1.20.4** (2026-06-23) — **Frist-Spanne 9→5 Tage**: Die dem Kunden gezeigte „Voraussichtliche Fertigstellung"-Spanne war ~9 Kalendertage breit, weil `PRODSTATS_SPAN_DAYS` (±3) in **Werktagen** gerechnet wurde → durchs Wochenende ~8–9 Kalendertage. Umgestellt auf **±2 KALENDERtage = 5-Tage-Fenster** in `getProposedFristRange` (beide Kopien synchron: [functions/src/lib/prodstats.js](bella_shop/functions/src/lib/prodstats.js) + [09-prodstats.js](fliegengitter-web/public/js/09-prodstats.js)), `mid` (Mitte) unverändert → gespeichertes `order.frist` (webhook speichert mid) gleich. Guard: from ≥ morgen. Label „(6 Werktage Fenster)" → „(5-Tage-Fenster)". Alle Anzeige-Stellen lesen nur from/to → automatisch übernommen. Live: App-Hosting + Functions `api`,`stripeWebhook`. (Daten-Hintergrund: tatsächliche Produktion ~11 Tage Median, p90 15 → 5-Tage-Fenster sicher.)
- **v1.20.3** (2026-06-23) — **„+ Neu"-Dialog 3 Knöpfe**: ersetzt die zwei alten „Verwerfen?"-Popups in `switchTab('neu')` durch einen Dialog mit `showChoice` (neuer Helper in 01-helpers.js, gestapelte Buttons, kein Klick-außerhalb): „Als Entwurf speichern" (saveAsDraft) / „Verwerfen & neu" (resetNewForm) / „Abbrechen — weiter bearbeiten" (zurück zur Eingabe statt ins Hauptmenü). Fixt: Tipp verwies auf Button außerhalb des Dialogs + Abbrechen sprang fälschlich ins Board.
- **v1.20.2** (2026-06-23) — **Bemerkung-Popup in Schnittliste**: Beim Öffnen einer Bestellung in der Schnittliste (`useOrderInRechner`) erscheint ein Pflicht-Popup mit allen Bemerkungen (Bestell-Ebene `o.bemerkung` + pro Maß `m.bemerkung`), muss mit „OK, gelesen" bestätigt werden (kein Klick-außerhalb). Neuer Helper `showAcknowledge(title, html, okText, onOk)` in 01-helpers.js (Ein-Button-Dialog, erzwingt Bestätigung). Verhindert übersehene Produktionshinweise.
- **v1.20.1** (2026-06-23) — **Entwurf-Aktivitäten-Log**: Entwürfe zeigen beim Öffnen eine „Aktivitäten"-Karte (`#draftActivityCard`/`#draftActivityLog` im Neu-Formular, via `updateNewFormHeader` nur im Entwurfs-Modus). Bearbeiten wird jetzt geloggt (saveAsDraft Update-Branch, „… hat Entwurf bearbeitet"); Erstellen war schon geloggt. + Email-Tracking-Buttons (`templates.js`) mit `target="_blank" rel="noopener"` (öffnet in neuem Tab — umgeht Sandbox-Vorschau mancher Mail-Clients; Tracking-Seite selbst war nie kaputt).
- **v1.20.0** (2026-06-23) — **Echtes Push (FCM)**: ersetzt die lokale `checkNewOrders`-Krücke durch Server-Push. Client: firebase-messaging-compat + [firebase-messaging-sw.js](fliegengitter-web/public/firebase-messaging-sw.js) + `getToken({vapidKey})` → `members/{uid}.fcmTokens` (arrayUnion, mehrere Geräte), Vordergrund via `onMessage`, Umschalter `togglePush`/`deactivatePush` (localStorage `fg_push_disabled`), Button-Status `updatePushButton`. VAPID-Public-Key in index.html (`FCM_VAPID_KEY`). Server: [lib/push.js](bella_shop/functions/src/lib/push.js) `sendNewOrderPush` (sendEachForMulticast + tote Token bereinigen) + [onOrderPlaced.js](bella_shop/functions/src/triggers/onOrderPlaced.js) (Filiale, onDocumentCreated, source≠online & column=Bestellung) + Push in onOrderCreated (Online paid). Push für ALLE neuen Bestellungen, jeder Mitarbeiter der aktiviert. iOS: nur als Safari-Home-Bildschirm-PWA (16.4+); Android: direkt in Chrome. Kosten 0 €.
- **v1.19.62** (2026-06-23) — **Fix inaktive Farbe im Modell**: Deaktivierte Profilfarben erschienen weiter zur Neu-Auswahl, wenn sie in der Farb-Liste eines Modells (`model.colors`) standen — der Modell-Zweig filterte `active` nicht. Jetzt in Neu- (`renderNewForm`) + Edit-Pfad ([08-order.js](fliegengitter-web/public/js/08-order.js)) nur aktive Modell-Farben; gespeicherte inaktive Farbe alter Bestellungen bleibt als „(inaktiv)".
- **v1.19.61** (2026-06-22) — **Mitarbeiter deaktivieren**: Neuer „Deaktivieren/Aktivieren"-Toggle in der Mitarbeiter-Verwaltung ([index.html](fliegengitter-web/public/index.html) `toggleMemberActive`, setzt `members/{uid}.active`). Login-Sperre in [03-auth.js](fliegengitter-web/public/js/03-auth.js) onAuthStateChanged: bei `active===false` → sofort signOut + Hinweis (Superadmin ausgenommen). Wichtig: App-„Löschen" reicht NICHT (Login bleibt + Doc wird bei Login per merge-set neu angelegt → Mitarbeiter kommt zurück). Historie bleibt (Produzent/Logs denormalisiert auf Order). Reines App-Flag, keine Functions. App-Level-Sperre; für absolute Sperre zusätzlich Auth-Login in Firebase Console deaktivieren.
- **v1.19.60** (2026-06-22) — **Bugfix Status-Mails**: Online-Status-Mails (In Produktion/Abholbereit/Abgeholt) wurden NIE gesendet. Ursache: `showConfirm` entfernt das Overlay vor dem onConfirm-Callback → der „Email senden"-Haken (`getElementById('sendStatusEmailCheckbox')`) war beim Auslesen schon `null` → als „nicht senden" gewertet → `skipNotifyEmail:true` immer. Fix in [07-board.js](fliegengitter-web/public/js/07-board.js) `quickMove`: Haken-Stand live via `onchange` in `window.__sendStatusEmail` mitführen, Default senden. Status-Mail-Trigger selbst ([onOrderStatusChange.js](bella_shop/functions/src/triggers/onOrderStatusChange.js)) war korrekt. Wirkt nur nach vorn (keine Rück-Sendung alter abholbereiter Bestellungen).
- **v1.19.59** (2026-06-22) — **Übersicht komplett + Namen mitspeichern (Phase B)**: Beim Anlegen werden `modelName`/`netzFarbeName`/`plisseeFarbeName` mitgespeichert (App: 4 Save-Pfade; Webshop: app.js+api.js) → Email/PDF/App zeigen echte Namen, robust gegen Hard-Delete. Email (`templates.js formatVariants(m)`) + PDF (`pdf.js`) zeigen Netz-/Plissee-Farbe mit Namen statt IDs. Gemeinsamer Helper `buildMeasureSummaryParts` (01-helpers.js) für calcEditPrice+calcNewPrice → Kombi-Bug behoben (beide Folgefarben), kein doppeltes „Netz" mehr. Schnittliste: rosa Kopf-Layout aufgeräumt (Pills in eigene Zeile) + Netz-/Plissee-Farb-Badge pro Material-Gruppe (produktionswichtig). Functions deployed: api, onOrderCreated, onPaymentReceived.
- **v1.19.58** (2026-06-22) — **Defensives Deaktivieren (Phase A)**: Deaktivieren/Löschen von Modell/Farbe/Netz-Farbe/Plissee-Farbe/Variante zerstört keine alten Bestellungen mehr. Render-Auto-Clears entfernt (Prinzip 3), Selection-UIs zeigen gespeicherte inaktive/gelöschte Werte als „(inaktiv)"/„(alt)" (Helper `withSavedItem` in 01-helpers.js), Pre-Deactivation-Warnung (`confirmDeactivation` + `countReferences`) in allen 5 Save-Funktionen (06-stammdaten.js), App-eigener Dialog statt nativem confirm. Offen: **Phase B** = Namen auf Bestellung mitspeichern (Schutz gegen Hard-Delete).
- **2026-06-20** — Cloud Function `scheduledBackup` live: tägliches Auto-Backup 19:00 Wien → Cloud Storage `backups/`, 30 Tage Retention. Email-Templates zeigen Varianten + Plissee/Netz-Farbe (Functions live).

- **v1.19.57** (offen, im Test) — Bemerkung-Placeholder entfernt; „(bitte wählen)" ans Label statt Pfeil; Email-Templates zeigen jetzt Varianten + Plissee/Netz-Farbe (Functions live).
- **v1.19.56** — Browser-Auto-Translate deaktiviert; Name-Sanitizer in App-Eingabefeldern.
- **v1.19.55** — Maß-Entfernen-Button (rotes ×) korrekt auf Karten-Ecke positioniert.
- **v1.19.54** — Migration-Cards-UI entfernt.
- **v1.19.53** — WhatsApp `{bestellnummer}`-Platzhalter (fett).
- **v1.19.50** — `o.farbe` (top-level) abgeschafft; Etikett-Farbe-Fix; Farb-Badges echte Farben.
