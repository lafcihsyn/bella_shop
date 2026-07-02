# SOFORT-AUFGABE: Web-Adresse vereinheitlichen (company.js)

**Was:** In [bella_shop/functions/src/lib/company.js](file:///Users/craft/Documents/bella_shop/functions/src/lib/company.js) das Feld `web: 'www.bellahome.at'` → `web: 'www.fliegengitterwien.at'` ändern. Dadurch zeigt die Mail-Fußzeile (shellHtml in templates.js) die richtige Shop-Adresse, konsistent mit AGB/Impressum/Datenschutz.

**Deploy:** `firebase deploy --only functions:onPaymentReceived,functions:onOrderCreated,functions:onOrderStatusChange` (alle nutzen das Mail-Template mit company.web). Kein App-/Webshop-Hosting nötig.

**Verify:** Nächste Bestätigungs-/Status-Mail → Fußzeile zeigt `www.fliegengitterwien.at`.

---

# Plan: Zebra ZD220t in Inegöl per WebUSB drucken — v1.20.0

## Context

Filiale **Inegöl** druckt Etiketten von einem **Android-Tablet** auf einen **Zebra ZD220t** (nur **USB**, ZPL-Sprache). Kein Print-Server gewünscht, Einrichtung macht der User selbst.

Der bestehende Druck ([05-output.js `druckenDirekt`](file:///Users/craft/Documents/fliegengitter-web/public/js/05-output.js#L186)) erzeugt **TSPL** und schickt es per `window.open()` an den Termux-**Print-Server** (ARTDEV AL-D460). Das bleibt für Bella Home unverändert.

**Lösung für Inegöl:** **WebUSB** — Chrome auf dem Tablet spricht den Zebra **direkt über USB-OTG** an, ohne Server/Installation/Treiber. Die App erzeugt **ZPL** (Zebra-Sprache) und schickt es per WebUSB an den Drucker. Auswahl welcher Drucker = **pro Gerät** (localStorage), genau wie die Print-Server-URL heute schon pro Gerät ist.

**Voraussetzungen (Hardware):** USB-OTG-Kabel (Tablet USB-C/Micro → USB-A), Zebra am eigenen Netzteil. WebUSB läuft auf **Android-Chrome über HTTPS** (App ist HTTPS ✓). iOS wird NICHT unterstützt — ist hier egal (Android-Tablet).

---

## Implementation

### 1. Drucker-Typ pro Gerät (localStorage)
Neuer Helfer in [05-output.js](file:///Users/craft/Documents/fliegengitter-web/public/js/05-output.js) analog zu `getPrintServerUrl`:
- `PRINTER_TYPE_STORAGE_KEY = 'fg_printer_type'` → `'artdev_tspl'` (Default) | `'zebra_webusb'`
- `getPrinterType()` / Setzen über Einstellungen-Dropdown.
- **Default = `artdev_tspl`** → Bella-Home-Geräte unverändert.

### 2. ZPL-Erzeugung — `generateZPL()` (neu in 05-output.js)
1:1 dieselben Felder/Positionen wie der TSPL-Block (Z. 207–243), nur ZPL-Syntax. ZD220t = **203 dpi** → 100×50 mm = **800×400 dots**.

| TSPL | ZPL |
|---|---|
| `SIZE/GAP/CLS` | `^XA` … `^XZ`, `^PW800`, `^LL400`, `^CI28` (UTF-8 → Umlaute) |
| `TEXT x,y,"f",…,"txt"` | `^FOx,y^A0N,H,W^FD txt^FS` |
| `BAR x,y,w,h` | `^FOx,y^GBw,h,h^FS` |
| `PRINT 1,1` | (1 Label pro `^XA…^XZ`) |

Felder: Kundenname, Stk-Position (1/5), Tel (optional), Linie, „B×H cm", „Farbe / Stk: N", Datum/Frist, Bestellnr (optional), Filiale (optional). Schriftgrößen (Dot-Höhen) als Startwerte — **am echten Drucker fein justierbar**.
Helfer `cleanZPL()` (analog `cleanTSPL`): entfernt ZPL-Steuerzeichen `^` `~` `\`, transliteriert türkische Sonderzeichen; Umlaute bleiben (via `^CI28`).

### 3. WebUSB-Transport (neu, eigener Block in 05-output.js)
- `let zebraDevice=null, zebraIfaceEp=null;`
- `connectZebra()` (über Button = User-Geste): `navigator.usb.requestDevice({filters:[{vendorId:0x0A5F}]})` → `open()` → `selectConfiguration(1)` → Printer-Interface (USB-Klasse 7) `claimInterface` → **Bulk-OUT-Endpoint** merken. Permission bleibt für die Origin gespeichert.
- `ensureZebra()`: wenn nicht verbunden → `navigator.usb.getDevices()` → vorher erlaubtes Zebra automatisch wieder verbinden (kein erneuter Dialog).
- `printZPLviaUSB(zpl)`: `ensureZebra()` → `TextEncoder` → `device.transferOut(epNumber, bytes)`.
- Guard: `if (!navigator.usb)` → Toast „Dieses Gerät/Browser kann WebUSB nicht — bitte Chrome auf Android".

### 4. Routing in `druckenDirekt()`
Am Anfang verzweigen:
```js
if (getPrinterType() === 'zebra_webusb') {
    const zpl = generateZPL(/* gleiche Daten wie TSPL */);
    await printZPLviaUSB(zpl);
    showToast('Etikett gedruckt (Zebra)!', 'success');
    return;
}
// sonst: bestehender TSPL-/Print-Server-Pfad (unverändert)
```

### 5. Einstellungen-UI ([index.html](file:///Users/craft/Documents/fliegengitter-web/public/index.html), beim „Drucker-Server URL"-Feld ~Z. 487/495)
- **Dropdown „Drucker-Typ"**: „Print-Server (ARTDEV/TSPL)" | „Zebra USB (ZPL)".
- Bei „Zebra USB": Button **„Zebra verbinden"** (ruft `connectZebra()`) + Status („verbunden ✓" / „nicht verbunden") + Button **„Test-Etikett drucken"**.
- Bei „Print-Server": bestehendes URL-Feld (unverändert).

### 6. Version
`APP_VERSION` → `1.20.0`, `CACHE_NAME` → `'fliegengitter-v1.20.0-zebra-webusb'`.

---

## Critical Files
| Datei | Änderung |
|---|---|
| [public/js/05-output.js](file:///Users/craft/Documents/fliegengitter-web/public/js/05-output.js) | `getPrinterType()`, `generateZPL()`, `cleanZPL()`, WebUSB-Block (`connectZebra`/`ensureZebra`/`printZPLviaUSB`), Routing in `druckenDirekt` |
| [public/index.html](file:///Users/craft/Documents/fliegengitter-web/public/index.html) | Einstellungen: Drucker-Typ-Dropdown + „Zebra verbinden"/„Test-Etikett" + Version |
| [public/sw.js](file:///Users/craft/Documents/fliegengitter-web/public/sw.js) | CACHE_NAME bump |

Reuse: `druckenDirekt`-Datenbeschaffung (Slide/Kunde/Maße/Farbe/Stk/Datum), `cleanTSPL`-Muster für `cleanZPL`, localStorage-Muster von `getPrintServerUrl`. **Keine** Functions/Webshop-Änderung. Bella Home bleibt unangetastet (Default-Typ).

---

## Einrichtung durch den User (am Tablet, einmalig)
1. **USB-OTG-Kabel** besorgen (Tablet-Anschluss → USB-A) + Zebra-USB-Kabel.
2. Zebra an **Strom** (eigenes Netzteil) + per OTG ans Tablet.
3. **Medien kalibrieren** (einmal): Feed-Taste am Zebra gedrückt halten bis er die 100×50-Etiketten erkennt.
4. App im **Chrome** am Tablet öffnen → Einstellungen → Drucker-Typ **„Zebra USB"** → **„Zebra verbinden"** → im Dialog Drucker wählen → erlauben.
5. **„Test-Etikett drucken"** → prüfen.

---

## Verification
1. Test-Channel-Deploy → am **Inegöl-Tablet** (Android-Chrome) öffnen.
2. Einstellungen → „Zebra USB" → „Zebra verbinden" → Dialog zeigt den ZD220t → auswählen.
3. „Test-Etikett" → Zebra druckt das 100×50-Layout. Positionen/Schriftgrößen ggf. in `generateZPL` nachjustieren (iterativ am echten Drucker).
4. Echte Bestellung in die Schnittliste → „Drucken" → korrektes Etikett (Kunde, Maße, Farbe, Stk, Datum, Bestellnr, Filiale).
5. **Bella-Home-Gerät** (Default-Typ): druckt unverändert über Print-Server (TSPL) — Gegenprobe dass nichts kaputt ist.
6. App schließen/neu öffnen → „Zebra verbinden" nicht mehr nötig (Auto-Reconnect via `getDevices`).

Nach „OK live": nur App-Hosting deployen. Changelog in CLAUDE.md.

---

## Risiken / ehrlich
- **WebUSB-Endpoint-Findung**: Standard-Druckerklasse (Bulk-OUT) — funktioniert i.d.R., am echten Gerät verifizieren.
- **Tablet muss USB-OTG (Host-Modus)** können — die meisten ja.
- **Drucker muss im ZPL-Modus** sein (ZD220t Default; falls EPL → nichts druckt → in Zebra-Utility auf ZPL stellen).
- Ich kann **WebUSB nicht ohne Hardware testen** → Feinabstimmung passiert am echten Tablet+Drucker, iterativ.

---
---

# ZURÜCKGESTELLT (Folge-Feature): Echtes Push bei neuer Bestellung (FCM)
> Vollständiger Plan unverändert vorhanden. Kurz: lokale `checkNewOrders`-Krücke → echtes FCM-Server-Push (gratis). Client: firebase-messaging-compat + `firebase-messaging-sw.js` + `getToken({vapidKey})` → `members/{uid}.fcmTokens`. Server: `lib/push.js` `sendNewOrderPush` (sendEachForMulticast + Token-Cleanup) + `onOrderPlaced` (onDocumentCreated, Filiale) + Push in `onOrderCreated` (Online paid). Push für ALLE neuen Bestellungen, jeder eingeloggte Mitarbeiter, iPhone(PWA)+Android. VAPID-Key in Konsole generieren.

# OFFEN (separat)
- AGB §4(4)(5): „Anzahlung 50% per Banküberweisung, Produktion nach Eingang" passt nicht zum Online-Stripe-Ablauf (volle Sofortzahlung) → Text anpassen.
- Status-Mail (Abholbereit/In Produktion) mit nächster echter Online-Bestellung verifizieren (Fix v1.19.60 ist live).
