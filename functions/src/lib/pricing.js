// ╔══════════════════════════════════════════════════════════════╗
// ║  Preisberechnung - identisch zur App-Logik                   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Formel (aus 08-order.js Zeile 2290-2293):
//   sqm     = breite/100 × höhe/100 × stück
//   billSqm = max(sqm, 1 × stück)     ← Mindestpreis pro Stück = 1m²
//   preis   = billSqm × sqmPrice       ← Bruttopreis (inkl. 20% MwSt)
//
// Wichtig: alle Preise sind BRUTTO (inkl. MwSt) - Bella Home ist B2C-Geschäft.

const company = require('./company');

function calcMeasurePrice(measure) {
  const b = parseFloat(measure.breite);
  const h = parseFloat(measure.hoehe);
  const s = parseInt(measure.stueck) || 1;
  const sqmPrice = parseFloat(measure.sqmPrice);

  if (isNaN(b) || isNaN(h) || isNaN(sqmPrice)) {
    throw new Error('Ungültige Maße oder Preis');
  }

  const sqm = (b / 100) * (h / 100) * s;
  const billSqm = Math.max(sqm, 1 * s);
  const totalGross = billSqm * sqmPrice;

  return {
    sqm: round4(sqm),
    billSqm: round4(billSqm),
    sqmPrice: round2(sqmPrice),
    gross: round2(totalGross),
    net: round2(totalGross / (1 + company.vatRate)),
    vat: round2(totalGross - totalGross / (1 + company.vatRate))
  };
}

function calcOrderTotal(measures) {
  let totalSqm = 0, totalGross = 0;
  const items = measures.map(m => {
    const calc = calcMeasurePrice(m);
    totalSqm += calc.sqm;
    totalGross += calc.gross;
    return { ...m, ...calc };
  });

  const totalNet = round2(totalGross / (1 + company.vatRate));
  const totalVat = round2(totalGross - totalNet);

  return {
    items,
    totalSqm: round4(totalSqm),
    totalGross: round2(totalGross),
    totalNet,
    totalVat,
    vatRate: company.vatRate
  };
}

// Anzahlungsberechnung
// Eingabe: gesamtbetrag, anzahlungProzent (50-100)
// Ausgabe: { anzahlung, rest } - aufgeteilt nach MwSt
function calcDeposit(totalGross, depositPercent) {
  const pct = Math.max(50, Math.min(100, depositPercent || 50)) / 100;
  const anzahlungGross = round2(totalGross * pct);
  const restGross = round2(totalGross - anzahlungGross);

  const anzahlungNet = round2(anzahlungGross / (1 + company.vatRate));
  const anzahlungVat = round2(anzahlungGross - anzahlungNet);

  const restNet = round2(restGross / (1 + company.vatRate));
  const restVat = round2(restGross - restNet);

  return {
    percent: depositPercent,
    anzahlung: {
      gross: anzahlungGross, net: anzahlungNet, vat: anzahlungVat
    },
    rest: {
      gross: restGross, net: restNet, vat: restVat
    }
  };
}

function round2(n) { return Math.round(n * 100) / 100; }
function round4(n) { return Math.round(n * 10000) / 10000; }

module.exports = { calcMeasurePrice, calcOrderTotal, calcDeposit, round2, round4 };
