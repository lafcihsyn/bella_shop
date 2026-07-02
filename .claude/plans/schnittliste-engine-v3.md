# Schnittliste-Engine — Umbau-Plan v3 (zurückgestellt, für später)

> Stand: 2026-06-24. Vom User pausiert („Plan behalten für später"). Original-Doku:
> `Schnittliste-Gesamtuebersicht-v3.md` (vom User hochgeladen — bei Wiederaufnahme erneut beilegen).
> Diese Datei = **Feasibility-Ergebnis + offene Punkte**, damit nichts verloren geht.

## Ziel
Die gesamte Schnitt-Mathematik in **eine reine Funktion** `computeCuttingList({measure, model, materials, variants})`
in neuer Datei `public/js/cutting-engine.js` (BestellApp). Anzeige, Druck, Lagerabzug, Materialbedarf
rufen künftig nur diese eine Funktion. Heute gibt es **mehrere** divergierende Rechenwege.

## Feasibility-Urteil: ✅ umsetzbar, gut kalibriert (geprüft gegen Backup 2026-06-20)
Self-Test (Slide Pro, 100×200, Einzeltür, netz) **vollständig gegen echte Modell-Daten validiert**:
- Längen aus echten `cuts[]`: Rahmen Breite 96,0 ×2 · Rahmen Höhe 192,2 (abzug 7,8) ×2 · Flügel 191,5 (8,5) ·
  Netz 195,8 (4,2) · Plastikband 195,6 (4,4) · Plastik Kurz 191,2 (8,8) · Fitil 194,0 (6,0). **Alle ✓**
- Schnur 17,0 = `materials`-Master `perSqm=8,5` × 2 m² ✓ · Snurhalter 2 / Eckverbindung 4 / Bolzen 2 = master `perOrder` ✓
- **Einzig** Faltenanzahl 50 ist NICHT in den Daten → bewusst neue, synthetisierte Zeile (siehe offener Punkt 2).
- Code-Behauptungen (Datei-Zählungen `abzuege`/`tuel_adet`/`conditionalMaterials`/`rechnerFields`,
  Helfer `cutConditionMatches`/`getEffectiveCutValues`, gespeicherte Namen v1.19.59) **alle bestätigt**.

## Wichtig: es sind DREI divergierende Engines (Plan sagt zwei) — Konsolidierung also stärker gerechtfertigt
1. `renderTable` (index.html ~3044–3267) — Anzeige; multipliziert **NICHT** mit `measure.stueck`.
2. `computeOrderMatVerbrauch` (07-board.js ~664–906; genutzt von 12-mat-forecast.js) — Lager/Forecast; **multipliziert** mit stueck.
3. B-Ware/Etikett (index.html ~2650 + 05-output.js) — rechnet **manuell mit `abzuege[]`**.
→ Bei `stueck>1` zeigt die Schnittliste halbierte Falten/m².

## 4 offene Punkte — VOR dem Coden klären
1. **Zwei Datenquellen.** Mengen/Flags (`perSqm`, `perOrder`, `active`, `nurEinzeltuer/Doppel`, `showInRechner`)
   liegen im **`materials`-Master** (per `materialId`), NICHT im Modell-Eintrag (der ist schlank: `materialId`+`cuts[]`+`sortOrder`+`condition?`).
   Die „Material überspringen"-Regeln müssen aus dem Master lesen. (Signatur `materials`-Argument deckt das ab.)
2. **Falten-Regel fehlt** (einzige echte Design-Lücke). Damit Self-Test deterministisch „50" liefert, Regel festlegen:
   z.B. netz/kombi → Falten-Zeile am Netz-Material (abzug 0); plisee/kombi → am Plissee. Formel `ceil((breite−abzug)/2)`,
   DT: `ceil((breite−abzug)/4)` ×2 Flügel.
3. **Alte Bestellungen ohne `modelId`.** Engine ist modell-basiert. Golden-Master (Schritt 2) läuft über echte Orders inkl. alter.
   Verhalten definieren: überspringen oder Legacy-Fallback.
4. **Golden-Master-Semantik.** Schnittliste = „Länge pro Stück × N" (pro-Stück), Verbrauch = total. Vorher festlegen,
   sonst werden gewollte Korrekturen (renderTable-Bug bei stueck>1) als „Fehler" gewertet.

## Schritt 1 (risikoarm, sofort machbar wenn aufgenommen)
- Neue Datei `public/js/cutting-engine.js`, in index.html NACH `07-board.js`/`08-order.js` eingebunden.
- Pur: kein DOM, kein Firestore, keine globalen Writes. `window.CuttingEngine = { computeCuttingList }`.
- Self-Test `__testCuttingEngine()` mit `console.assert` gegen obige Werte.
- **Nicht** an renderTable/computeOrderMatVerbrauch hängen. Nur Test-Channel, Version+CACHE_NAME bumpen.

## Reihenfolge (gesamt)
1. Engine + Self-Test → 2. Golden-Master über echte Bestellungen → 3. Anzeige+Editor umstellen →
4. Netz-Faktor-Feld (Phase 2 Plissee-Lager) → 5. Verschnitt-Rechner → 6. Legacy entfernen (eigener Schritt).

## Helfer/Strukturen zum Wiederverwenden
- `cutConditionMatches(condition, variants)` + `getEffectiveCutValues(cut, variants)` — index.html ~1242–1270 (Overrides „letzter gewinnt", behandelt `optionId` UND `optionIds[]`).
- Gespeicherte Namen: `m.modelName/netzFarbeName/plisseeFarbeName` (zuerst nutzen, ID-Lookup nur Fallback).
- Modell: `sections[0].materials[]` → je Material `materialId`+`cuts[]`; Cut: `label,basis(breite|hoehe|tuel_adet),abzug,stueck,doppeltuerFaktor,condition?,overrides[]`.
