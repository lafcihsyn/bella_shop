# Plan: Zwischen-Status „Transport" (Inegöl-Lieferung) — fertig spezifiziert

> Stand: 2026-06-26. Komplettes Design mit dem User abgestimmt. Bauen: **zuerst Test-Channel, live nach OK.**

## Context / Problem
Inegöl produziert, Ware wird **Freitag geladen, kommt Mi/Do** am Abhol-Ort an. Inegöl-Mitarbeiter schieben heute fertige Aufträge direkt auf **„Abholbereit"** → Online-Kunde sieht „abholbereit" + bekommt die Abholbereit-Mail, **bevor die Ware da ist** → kommt/ruft zu früh. „Abholbereit" bedeutet intern „produziert", für den Kunden aber „jetzt abholbar" — diese zwei Bedeutungen müssen getrennt werden.

## Lösung (abgestimmt)
Neue Status-Spalte **„Transport"** zwischen „In Produktion" und „Abholbereit".
- **Manuell** von Inegöl gesetzt (es gibt KEIN „Inegöl-produziert"-Feld — `filialeName` hat 0 Inegöl-Orders, Produktion wird per Person `produzentName` getrackt → Auto-Erkennung wäre fragil). Generischer „Transport"-Schritt, nicht hart auf Inegöl verdrahtet.
- **Wien**: zieht wie immer direkt In Produktion → Abholbereit (überspringt Transport, kein Mehraufwand).

## Kunden-Sicht (Tracking-Seite)
- Status-Label: **„In Vorbereitung zur Abholung"**
- Beruhigungs-Subtext (immer in diesem Status): _„Deine Bestellung ist fertiggestellt und wird für die Abholung in unserer Filiale bereitgestellt. Bitte warte auf unsere ‚Abholbereit'-Benachrichtigung, bevor du vorbeikommst — wir melden uns, sobald sie bereitliegt."_
- **KEIN Datum** (kein hartes Datum → kann nie „falsch" sein).
- Löst beides: kein zu-früh-Kommen + keine 12-Tage-Unruhe (z.B. Samstag-Produktion = ~12 Tage in diesem Status).

## Benachrichtigungen
- Im „Transport"-Status **KEINE** Abholbereit-Mail/Benachrichtigung. Die feuert **erst** beim Move auf „Abholbereit" (= echte Ankunft).
- Owner kann die manuelle WhatsApp behalten ODER durch die automatische Abholbereit-Mail ersetzen (feuert dann zum richtigen Zeitpunkt).

## Berechtigungen (bestehendes System nutzen!)
Die App hat bereits ein granulares Rechte-System: `role` (admin/mitarbeiter) + `permissions{}` pro Mitarbeiter (z.B. `move_to_abholbereit`, `customer_notify`, `view_all_filialen`), Editor in der Mitarbeiter-Verwaltung, Admins haben automatisch alle Rechte (03-auth.js `PERM_GROUPS`/`ALL_PERMISSIONS`, `hasPerm()`).
- **Neues Recht `move_to_transport`** — wer darf in „Transport" schieben. Default: nur **Inegöl + Admin**. (Analog zum bestehenden `move_to_abholbereit`-Check in 07-board.js quickMove ~Z.535 `neededPerm`.)
- **Neues Recht `transport_view`** — wer **sieht** die Spalte. Default: **Inegöl + Wien + Admin**, andere (z.B. Mega Home) nicht. Spalten-Sichtbarkeit gibt es heute noch nicht → kleine neue Logik in `renderBoardColumns` (03-auth.js ruft sie ~Z.190).
  - ⚠️ Wer die Spalte nicht sieht, sieht auch die dort liegenden Orders nicht (bis Abholbereit). Für Mega Home ok; **Wien MUSS sie sehen** (schiebt Transport → Abholbereit).
- Beide Rechte erscheinen automatisch im Rechte-Editor (kommen aus `PERM_GROUPS`).

## Integrationspunkte (vor/beim Bau prüfen)
1. **Spalten-Liste**: wo die Status-Spalten definiert/aufgezählt sind (Board, Filter, Such-Overlay 10-search.js, Statistik-Drilldowns). „Transport" überall ergänzen wo nötig.
2. **quickMove** (07-board.js ~535): `neededPerm`-Mapping → `Transport: 'move_to_transport'`.
3. **renderBoardColumns**: Sichtbarkeits-Gate via `hasPerm('transport_view') || isAdmin()`.
4. **Status-Mail-Trigger** (bella_shop `triggers/onOrderStatusChange.js`): „Transport" sendet NICHTS; nur Abholbereit/In Produktion/Abgeholt wie bisher.
5. **Tracking-Seite** (bella_shop views.js + api.js track-Endpoint): Status→Label-Mapping um „Transport"→„In Vorbereitung zur Abholung" + Subtext erweitern.
6. **⚠️ Frist/Prodstats prüfen** (bella_shop lib/prodstats.js `computeStats`): zählt Produktion über Log „nach Abholbereit verschoben". Bei Inegöl-Orders passiert das künftig erst bei Ankunft (Mi/Do, gebündelt) → könnte avgPerDay verzerren. PRÜFEN: ist `loadStatsOrders` filiale-gefiltert (dann evtl. irrelevant)? Falls global: ggf. auch „nach Transport verschoben" als Produktions-Zeitpunkt zählen. `openStk` (Spalten Bestellung/In Produktion/Reparatur) ist ok — „Transport" zählt korrekt NICHT als Warteschlange.

## Reihenfolge (klein & sicher, Test-Channel zuerst)
1. Rechte `move_to_transport` + `transport_view` in PERM_GROUPS (+ Admin auto).
2. Spalte „Transport" ins Board + quickMove-Permission + Sichtbarkeits-Gate.
3. Status-Mail-Gate (Transport sendet nicht).
4. Tracking-Label + Subtext (bella_shop).
5. Prodstats-Check/Fix.
6. Version+CACHE bump, Test-Channel, dann live (App-Hosting + ggf. Functions onOrderStatusChange/api).
