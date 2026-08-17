// ╔══════════════════════════════════════════════════════════════╗
// ║  PDF-Rechnung — Voll-Rechnung für Online-Bestellungen         ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Seit 2026-05-28 zahlen Online-Kunden den vollen Betrag bei der
// Bestellung. Es wird daher nur noch EINE Rechnung pro Bestellung
// ausgestellt (Typ 'final'). Der `deposit`-Typ wurde entfernt.
//
// Legacy: Bestehende Anzahlungs-PDFs in Storage bleiben unverändert.

const PDFDocument = require('pdfkit');
const admin = require('firebase-admin');
const company = require('../lib/company');

const BRAND = '#1F8794';
const BRAND_DARK = '#155F69';
const TEXT = '#1a1a2e';
const MUTED = '#6B7280';
const BORDER = '#E5E7EB';

// Wandelt einen Base64-Data-URL-String (data:image/png;base64,…) in einen
// PDFKit-fähigen Buffer um. Gibt null zurück wenn das Format nicht passt.
function dataUrlToBuffer(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  if (!m) return null;
  try { return Buffer.from(m[2], 'base64'); } catch (e) { return null; }
}

// Holt das Firmenlogo (Base64) aus settings/company. Wird vor dem PDF-Draw
// einmal geladen — Fehler werden geschluckt, damit Rechnungen auch ohne Logo
// generierbar bleiben.
async function loadCompanyLogoBuffer() {
  try {
    const doc = await admin.firestore().collection('settings').doc('company').get();
    if (!doc.exists) return null;
    const buf = dataUrlToBuffer(doc.data().logoBase64);
    return buf;
  } catch (e) {
    console.warn('[pdf] Logo konnte nicht geladen werden:', e.message);
    return null;
  }
}

function eur(n) {
  return new Intl.NumberFormat('de-AT', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2
  }).format(n);
}

function fmtDate(d) {
  if (!d) d = new Date();
  if (d.toDate) d = d.toDate();
  return d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Generiert PDF und gibt Buffer zurück.
 *
 * @param {Object} options
 *   - type: 'final' (immer — der frühere 'deposit'-Modus existiert nicht mehr)
 *   - invoiceNumber: 'FGO2026-00001'
 *   - invoiceDate: Date
 *   - order: Bestellungs-Objekt aus Firestore
 *
 * @returns {Promise<Buffer>}
 */
async function generateInvoicePDF(options) {
  // Logo VOR der Promise laden, damit drawPdf synchron arbeiten kann.
  const logoBuffer = await loadCompanyLogoBuffer();
  return new Promise((resolve, reject) => {
    try {
      const buffers = [];
      const doc = new PDFDocument({
        size: 'A4',
        bufferPages: true, // Mehrseiten-Fix 2026-08-17: erlaubt Fußzeile auf jeder Seite
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        info: {
          Title: 'Rechnung ' + options.invoiceNumber,
          Author: company.name,
          Subject: 'Rechnung für Bestellung ' + options.order.orderNumber
        }
      });

      doc.on('data', b => buffers.push(b));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      drawPdf(doc, { ...options, logoBuffer });
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function drawPdf(doc, opts) {
  const title = 'Rechnung';
  const order = opts.order;

  // ═══ KOPF: Logo/Firma links, Rechnungsmeta rechts ════════════
  const startY = 50;

  // Logo (falls vorhanden) — sonst Firmenname als Text-Fallback.
  // Logo wird oben links mit max-Höhe 50px gezeichnet, danach folgen
  // Adresse/Kontakt-Zeilen darunter.
  let addressY = startY;
  if (opts.logoBuffer) {
    try {
      doc.image(opts.logoBuffer, 50, startY, { fit: [140, 50], align: 'left', valign: 'top' });
      addressY = startY + 58;
    } catch (e) {
      // Falls das Bild nicht decodiert werden kann → Text-Fallback
      doc.fontSize(15).fillColor(TEXT).font('Helvetica-Bold').text(company.name, 50, startY);
      addressY = startY + 22;
    }
  } else {
    doc.fontSize(15).fillColor(TEXT).font('Helvetica-Bold').text(company.name, 50, startY);
    addressY = startY + 22;
  }

  // Adresse + Kontakt (unter Logo oder Firmenname)
  doc.fontSize(9).fillColor(MUTED).font('Helvetica')
    .text(company.street, 50, addressY)
    .text(`${company.zip} ${company.city}, ${company.country}`, 50, addressY + 12)
    .text(`Tel: ${company.phone}`, 50, addressY + 24)
    .text(company.email, 50, addressY + 36)
    .text(company.web, 50, addressY + 48);

  // Rechnungsmeta (rechts) - breiter Bereich für Titel
  const metaX = 320;
  const metaW = 225;
  doc.fontSize(22).fillColor(BRAND_DARK).font('Helvetica-Bold')
    .text(title, metaX, startY, { width: metaW, align: 'right' });

  doc.fontSize(9).fillColor(TEXT).font('Helvetica');
  let metaY = startY + 38;
  const metaLabel = (label, value, color) => {
    doc.fillColor(MUTED).font('Helvetica')
       .text(label, metaX, metaY, { width: 130, align: 'right' });
    doc.fillColor(color || TEXT).font('Helvetica-Bold')
       .text(value, metaX + 135, metaY, { width: 90, align: 'right' });
    doc.font('Helvetica');
    metaY += 14;
  };
  metaLabel('Rechnungsnummer', opts.invoiceNumber, BRAND_DARK);
  metaLabel('Rechnungsdatum', fmtDate(opts.invoiceDate));
  metaLabel('Bestellnummer', order.orderNumber);

  // ═══ KUNDENADRESSE (Anschriftsfeld) ══════════════════════════
  const adrY = 195;
  doc.fontSize(8).fillColor(MUTED).font('Helvetica')
    .text(`${company.name} · ${company.street} · ${company.zip} ${company.city}`, 50, adrY);
  doc.fontSize(11).fillColor(TEXT).font('Helvetica')
    .text(`${order.vorname || ''} ${order.nachname || ''}`.trim(), 50, adrY + 18)
    .text(order.email || '', 50, adrY + 34)
    .text(order.telefon || '', 50, adrY + 50);

  // ═══ EINLEITUNGSTEXT ═════════════════════════════════════════
  const introY = 290;
  doc.fontSize(10).fillColor(TEXT).font('Helvetica');
  doc.text(`Sehr geehrte/r ${order.vorname || ''} ${order.nachname || ''},`, 50, introY);
  doc.text('vielen Dank für Ihre Bestellung. Wir stellen Ihnen den Rechnungsbetrag wie folgt in Rechnung:', 50, introY + 18, { width: 495 });

  // ═══ POSITIONS-TABELLE ═══════════════════════════════════════
  const cols = { pos: 50, desc: 80, qty: 350, unit: 410, total: 480 };

  // Seiten-Geometrie für mehrseitige Rechnungen (Mehrseiten-Fix 2026-08-17)
  const PAGE_BOTTOM = doc.page.height - doc.page.margins.bottom; // ~792
  const CONTENT_TOP = doc.page.margins.top;                      // 50
  const FOOTER_RESERVE = 70;   // Platz für die Pflicht-Fußzeile unten
  const ITEM_ROW_H = 36;

  // Zeichnet den Tabellenkopf bei y und liefert die y-Position der ersten Datenzeile.
  const drawTableHeader = (y) => {
    doc.rect(50, y - 4, 495, 22).fill('#F7F6FF');
    doc.fontSize(9).fillColor(BRAND_DARK).font('Helvetica-Bold');
    doc.text('Pos.', cols.pos, y + 3);
    doc.text('Bezeichnung', cols.desc, y + 3);
    doc.text('Stück', cols.qty, y + 3, { width: 50, align: 'right' });
    doc.text('Einzelpreis', cols.unit, y + 3, { width: 60, align: 'right' });
    doc.text('Gesamt', cols.total, y + 3, { width: 65, align: 'right' });
    doc.font('Helvetica').fillColor(TEXT).fontSize(10);
    return y + 26;
  };

  let tableY = drawTableHeader(350);

  // v1.19.59: sprechende Varianten-Note mit Namen (statt roher key:value-IDs)
  const NP_LABELS = { netz: 'Nur Netz', plisee: 'Nur Plissee', plissee: 'Nur Plissee', kombi: 'Kombi (Netz + Plissee)' };
  const buildVariantNote = (m) => {
    const v = m.variants || {};
    const parts = [];
    if (v.tuerart === 'doppel') parts.push('Doppeltür');
    if (v.netz_plissee) parts.push(NP_LABELS[v.netz_plissee] || v.netz_plissee);
    if (m.netzFarbeName) parts.push('Netz: ' + m.netzFarbeName);
    if (m.plisseeFarbeName) parts.push('Plissee: ' + m.plisseeFarbeName);
    if (v.schwellenlos === 'schwellenlos') parts.push('Schwellenlos');
    if (v.bodenprofil === 'ja') parts.push('Bodenprofil');
    return parts.join(' · ');
  };

  (order.measures || []).forEach((m, i) => {
    // Seitenumbruch: passt die (2-zeilige) Position nicht mehr auf die Seite,
    // neue Seite beginnen und den Tabellenkopf wiederholen.
    // (Mehrseiten-Fix 2026-08-17 — behebt das Zerfallen mehrseitiger Rechnungen,
    //  bei dem jede Zelle auf einer eigenen Seite landete.)
    if (tableY + ITEM_ROW_H > PAGE_BOTTOM - FOOTER_RESERVE) {
      doc.addPage();
      tableY = drawTableHeader(CONTENT_TOP + 10);
    }

    const variantNote = buildVariantNote(m);
    const lines = [
      `${m.modelName || 'Fliegengitter'} ${m.breite}×${m.hoehe} cm`,
      `Farbe: ${m.farbe}` + (variantNote ? ' · ' + variantNote : '')
    ].filter(Boolean);

    doc.fillColor(TEXT).font('Helvetica');
    doc.text(String(i + 1), cols.pos, tableY);
    doc.text(lines[0], cols.desc, tableY, { width: 260 });
    doc.fontSize(8).fillColor(MUTED).text(lines[1], cols.desc, tableY + 14, { width: 260 });
    doc.fontSize(10).fillColor(TEXT);
    doc.text(String(m.stueck || 1), cols.qty, tableY, { width: 50, align: 'right' });
    doc.text(eur(m.sqmPrice) + '/m²', cols.unit, tableY, { width: 60, align: 'right' });
    doc.text(eur(m.gross), cols.total, tableY, { width: 65, align: 'right' });

    tableY += 36;
  });

  // Summen-Block + Bankverbindung + Hinweis brauchen ~230pt am Stück —
  // passt das nicht mehr, zuerst auf eine neue Seite wechseln. (Mehrseiten-Fix 2026-08-17)
  if (tableY + 230 > PAGE_BOTTOM - FOOTER_RESERVE) {
    doc.addPage();
    tableY = CONTENT_TOP + 10;
  }

  // Trennlinie nach Positionen
  doc.moveTo(50, tableY).lineTo(545, tableY).strokeColor(BORDER).lineWidth(0.5).stroke();
  tableY += 14;

  // ═══ SUMMEN-BLOCK ═══════════════════════════════════════════
  const sumX = 320;
  const sumW = 225;
  const sumRow = (label, value, opts2 = {}) => {
    doc.fontSize(opts2.size || 10)
       .fillColor(opts2.color || MUTED)
       .font(opts2.bold ? 'Helvetica-Bold' : 'Helvetica')
       .text(label, sumX, tableY, { width: 140, align: 'right' });
    doc.fillColor(opts2.color || TEXT)
       .font(opts2.bold ? 'Helvetica-Bold' : 'Helvetica')
       .text(value, sumX + 145, tableY, { width: 80, align: 'right' });
    tableY += opts2.size >= 12 ? 22 : 16;
  };

  // Online-Bestellung: voller Betrag wird mit der Bestellung bezahlt.
  sumRow('Netto', eur(order.totalNet || 0));
  sumRow('+ 20% USt', eur(order.totalVat || 0));
  tableY += 4;
  doc.moveTo(sumX, tableY - 6).lineTo(545, tableY - 6).strokeColor(BORDER).lineWidth(0.5).stroke();
  tableY += 4;
  sumRow('Gesamtbetrag brutto', eur(order.totalGross), { size: 11, bold: true });
  tableY += 8;
  doc.rect(sumX, tableY - 6, sumW, 30).fill('#F7F6FF');
  sumRow('Rechnungsbetrag', eur(order.totalGross || 0), { size: 12, bold: true, color: BRAND_DARK });

  tableY += 24;

  // ═══ ZAHLUNGSHINWEIS ═════════════════════════════════════════
  doc.rect(50, tableY, 495, 70).fillAndStroke('#FDFCFA', BORDER);
  doc.fontSize(9).fillColor(BRAND_DARK).font('Helvetica-Bold').text('Bankverbindung', 60, tableY + 8);
  doc.fontSize(8).fillColor(TEXT).font('Helvetica');
  doc.text(`Empfänger: ${company.accountHolder}`, 60, tableY + 22);
  doc.text(`IBAN: ${company.iban}`, 60, tableY + 34);
  doc.text(`BIC: ${company.bic}  ·  Bank: ${company.bankName}`, 60, tableY + 46);
  doc.fillColor(BRAND_DARK).font('Helvetica-Bold');
  doc.text(`Verwendungszweck: ${opts.invoiceNumber}`, 60, tableY + 58);

  tableY += 84;

  doc.fontSize(9).fillColor(MUTED).font('Helvetica-Oblique')
     .text('Bereits vollständig bezahlt — vielen Dank für Ihren Einkauf.', 50, tableY, { width: 495, align: 'center' });
  tableY += 16;

  // ═══ FUSSZEILE (Pflichtangaben Österreich) — auf JEDER Seite ═══
  // Mehrseiten-Fix 2026-08-17: über die gepufferten Seiten iterieren und die
  // Fußzeile auf jeder Seite an fester Position zeichnen (dank bufferPages).
  const footerY = 730;
  const footerCol1 = `${company.name}\n${company.street}, ${company.zip} ${company.city}\nTel: ${company.phone}\n${company.email}`;
  const footerCol2 = `UID: ${company.uid}\n${company.fn}\n${company.court}\nGeschäftsführer: ${company.gf}`;
  const footerCol3 = `Bank: ${company.bankName}\nIBAN: ${company.iban}\nBIC: ${company.bic}\nMaßanfertigung: kein Widerrufsrecht`;

  const range = doc.bufferedPageRange();
  for (let p = 0; p < range.count; p++) {
    doc.switchToPage(range.start + p);
    doc.moveTo(50, footerY - 8).lineTo(545, footerY - 8).strokeColor(BORDER).lineWidth(0.5).stroke();
    doc.fontSize(7).fillColor(MUTED).font('Helvetica');
    // Alle 3 Spalten mit fester Position - lineBreak verhindert Spaltenverschiebung
    doc.text(footerCol1, 50,  footerY, { width: 165, lineBreak: true });
    doc.text(footerCol2, 220, footerY, { width: 165, lineBreak: true });
    doc.text(footerCol3, 390, footerY, { width: 165, lineBreak: true });
  }
}

module.exports = { generateInvoicePDF };
