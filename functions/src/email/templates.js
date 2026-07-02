// ╔══════════════════════════════════════════════════════════════╗
// ║  Email-Templates - Bestätigung, Status-Updates, Admin-Mail   ║
// ╚══════════════════════════════════════════════════════════════╝

const company = require('../lib/company');

const BRAND = '#8B82E0';
const BRAND_DARK = '#534AB7';
const BRAND_LIGHT = '#F7F6FF';
const TEXT = '#1a1a2e';
const MUTED = '#6B7280';
const BORDER = '#E5E7EB';

function eur(n) {
  return new Intl.NumberFormat('de-AT', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2
  }).format(n);
}

// ── Varianten-Labels (für sprechende Anzeige in Mails) ────────
// Server hat keinen Zugriff auf cachedVariants/cachedColors → hartkodiert.
// Unbekannte Keys/Values werden als Roh-String ausgegeben (besser als nichts).
const VARIANT_LABELS = {
  tuerart:      { label: 'Türart',       values: { einzel: 'Einzeltür', doppel: 'Doppeltür' } },
  schwellenlos: { label: 'Schwelle',     values: { einzeltuer: 'Standard', doppeltuer: 'Doppeltür', schwellenlos: 'Schwellenlos' } },
  bodenprofil:  { label: 'Bodenprofil',  values: { ja: 'Ja', nein: 'Nein' } },
  netz_plissee: { label: 'Netz/Plissee', values: { netz: 'Nur Netz', plisee: 'Nur Plissee', plissee: 'Nur Plissee', kombi: 'Kombi (Netz + Plissee)' } },
  plisseeFarbe: { label: 'Plissee-Farbe' },
  netzFarbe:    { label: 'Netz-Farbe' }
};

// v1.19.59: bekommt das ganze measure-Objekt (m), damit Netz-/Plissee-Farbe mit
// echtem NAMEN (m.netzFarbeName/m.plisseeFarbeName) gezeigt werden statt roher ID.
// Fehlt der Name (Altbestellung), wird die Farb-Zeile weggelassen statt "grau" zu zeigen.
function formatVariants(m) {
  const variants = (m && m.variants && typeof m.variants === 'object') ? m.variants : null;
  if (!variants) return [];
  const rows = [];
  for (const [k, v] of Object.entries(variants)) {
    if (!v) continue;
    if (k === 'netzFarbe') {
      if (m.netzFarbeName) rows.push(`Netz-Farbe: ${m.netzFarbeName}`);
      continue; // ohne Namen lieber weglassen als rohe ID
    }
    if (k === 'plisseeFarbe') {
      if (m.plisseeFarbeName) rows.push(`Plissee-Farbe: ${m.plisseeFarbeName}`);
      continue;
    }
    const cfg = VARIANT_LABELS[k];
    const label = cfg?.label || k;
    const valStr = (cfg?.values && cfg.values[v]) ? cfg.values[v] : String(v);
    rows.push(`${label}: ${valStr}`);
  }
  return rows;
}

function shellHtml(title, contentHtml) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${TEXT};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7;padding:40px 20px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;border:0.5px solid ${BORDER};">
  <tr>
    <td style="padding:32px 32px 24px;background:#fff;border-bottom:0.5px solid #F3F4F6;">
      <div style="font-size:20px;font-weight:600;color:${TEXT};letter-spacing:0.3px;">Bella Home</div>
      <div style="font-size:12px;color:${MUTED};margin-top:2px;">Fliegengitter online bestellen</div>
    </td>
  </tr>
  <tr>
    <td style="padding:32px;background:#fff;">
      ${contentHtml}
    </td>
  </tr>
  <tr>
    <td style="padding:24px 32px;background:${BRAND_LIGHT};border-top:0.5px solid #F3F4F6;font-size:11px;color:${MUTED};line-height:1.6;">
      <strong style="color:${TEXT};">${company.name}</strong><br>
      ${company.street}, ${company.zip} ${company.city}<br>
      Tel: ${company.phone} · ${company.email} · ${company.web}<br>
      UID: ${company.uid} · ${company.fn} · ${company.court}
    </td>
  </tr>
</table>
</td></tr>
</table>
</body></html>`;
}

// ── Bestellbestätigung an Kunde ────────────────────────────────
function orderConfirmation(order) {
  const measuresList = order.measures.map((m, i) => {
    const variantRows = formatVariants(m);
    const variantHtml = variantRows.length
      ? `<div style="font-size:11px;color:${MUTED};margin-top:3px;line-height:1.5;">${variantRows.join(' · ')}</div>`
      : '';
    const bemHtml = m.bemerkung
      ? `<div style="font-size:11px;color:${MUTED};margin-top:2px;font-style:italic;">"${m.bemerkung}"</div>`
      : '';
    return `
    <tr>
      <td style="padding:8px 0;color:${MUTED};font-size:13px;vertical-align:top;">
        ${i + 1}. ${m.modelName || 'Fliegengitter'} · ${m.breite}×${m.hoehe} cm · ${m.farbe}${m.stueck > 1 ? ' · ' + m.stueck + ' Stk' : ''}
        ${variantHtml}
        ${bemHtml}
      </td>
      <td style="padding:8px 0;text-align:right;font-size:13px;color:${TEXT};vertical-align:top;">${eur(m.gross)}</td>
    </tr>`;
  }).join('');

  const trackingUrl = `${company.trackingUrlBase}${order.trackingToken}`;
  const paidGross = order.anzahlung || order.totalGross || 0;

  // Bezahlmethode aus dem ersten Stripe-Payment auslesen (falls vorhanden)
  const lastPayment = (order.payments && order.payments[0]) || null;
  const paymentMethodLabel = (() => {
    if (!lastPayment) return 'online';
    switch (lastPayment.paymentMethod) {
      case 'card': return 'Karte';
      case 'eps': return 'EPS';
      case 'apple_pay': return 'Apple Pay';
      case 'google_pay': return 'Google Pay';
      default: return 'online';
    }
  })();

  const content = `
    <h1 style="font-size:22px;font-weight:600;margin:0 0 8px;color:${TEXT};">Vielen Dank für Ihre Bestellung!</h1>
    <p style="font-size:14px;color:${MUTED};margin:0 0 24px;line-height:1.6;">
      Bestellnummer <strong style="color:${TEXT};">${order.orderNumber}</strong> ·
      ${new Date().toLocaleDateString('de-AT')}
    </p>

    <div style="background:${BRAND_LIGHT};border-radius:10px;padding:20px;margin-bottom:24px;">
      <div style="font-size:11px;color:${BRAND};font-weight:600;letter-spacing:0.3px;text-transform:uppercase;">Zahlung erhalten ✓</div>
      <div style="font-size:28px;font-weight:600;color:${BRAND_DARK};margin:6px 0;">${eur(paidGross)}</div>
      <div style="font-size:12px;color:${MUTED};line-height:1.6;">
        Ihre Zahlung wurde erfolgreich per ${paymentMethodLabel} verarbeitet. Wir beginnen mit der Produktion.${order.invoiceNumber ? ` Die <strong style="color:${TEXT};">Rechnung ${order.invoiceNumber}</strong> finden Sie im Anhang dieser Email.` : ''}
      </div>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
      <tr><td colspan="2" style="font-size:12px;color:${MUTED};font-weight:500;padding-bottom:6px;text-transform:uppercase;letter-spacing:0.3px;">Bestellung</td></tr>
      ${measuresList}
      <tr><td colspan="2" style="border-top:0.5px solid ${BORDER};padding-top:10px;"></td></tr>
      <tr>
        <td style="padding:4px 0;font-size:13px;color:${MUTED};">Gesamtbetrag (inkl. 20% MwSt)</td>
        <td style="padding:4px 0;text-align:right;font-size:15px;font-weight:600;color:${TEXT};">${eur(order.totalGross)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:13px;color:${BRAND};">davon bezahlt</td>
        <td style="padding:4px 0;text-align:right;font-size:13px;color:${BRAND};">${eur(paidGross)}</td>
      </tr>
    </table>

    <div style="text-align:center;margin:24px 0;">
      <a href="${trackingUrl}" target="_blank" rel="noopener" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:500;">
        Bestellung verfolgen →
      </a>
      <div style="font-size:11px;color:${MUTED};margin-top:8px;">Sie erhalten bei jedem Statuswechsel eine Email.</div>
    </div>

    <div style="background:${BRAND_LIGHT};border-left:3px solid ${BRAND};border-radius:8px;padding:14px 16px;margin:16px 0 24px;font-size:13px;color:${TEXT};line-height:1.55;">
      <strong style="color:${BRAND_DARK};">Sobald Ihre Bestellung abholbereit ist, werden Sie automatisch per Email und WhatsApp benachrichtigt.</strong>
    </div>

    <div style="font-size:12px;color:${MUTED};line-height:1.6;border-top:0.5px solid ${BORDER};padding-top:16px;">
      <strong style="color:${TEXT};">Abholung:</strong> ${company.street}, ${company.zip} ${company.city}<br>
      <strong style="color:${TEXT};">Öffnungszeiten:</strong> Mo–Fr 09:00–19:00, Sa 09:00–18:00<br>
      <strong style="color:${TEXT};">WhatsApp:</strong> ${company.phone}<br><br>
      <em>Hinweis Maßanfertigung: Es besteht kein 14-Tage-Widerrufsrecht.</em>
    </div>
  `;

  return shellHtml('Bestellbestätigung ' + order.orderNumber, content);
}

// ── Status-Update an Kunde ─────────────────────────────────────
function statusUpdate(order, newStatus) {
  const statusTexts = {
    'In Produktion': {
      title: 'Ihre Bestellung ist in Produktion',
      icon: '🛠️',
      msg: 'Wir haben Ihre Zahlung erhalten und mit der Anfertigung Ihres Fliegengitters begonnen. Wir melden uns sobald die Bestellung abholbereit ist.'
    },
    'Abholbereit': {
      title: 'Ihre Bestellung ist abholbereit!',
      icon: '✓',
      msg: `Ihre Bestellung kann jederzeit innerhalb der Öffnungszeiten abgeholt werden. Es sind keine weiteren Zahlungen nötig — Ihre Bestellung ist bereits vollständig bezahlt.`
    },
    'Abgeholt': {
      title: 'Vielen Dank für Ihren Einkauf!',
      icon: '🎉',
      msg: 'Wir hoffen, Sie sind mit Ihrem neuen Fliegengitter zufrieden. Bei Fragen oder Reparaturen sind wir gerne für Sie da.'
    }
  };

  const s = statusTexts[newStatus] || {
    title: 'Status-Update zu Ihrer Bestellung',
    icon: 'ℹ',
    msg: `Der Status Ihrer Bestellung wurde geändert: ${newStatus}`
  };

  const trackingUrl = `${company.trackingUrlBase}${order.trackingToken || ''}`;

  const content = `
    <div style="font-size:48px;line-height:1;margin-bottom:12px;">${s.icon}</div>
    <h1 style="font-size:22px;font-weight:600;margin:0 0 8px;color:${TEXT};">${s.title}</h1>
    <p style="font-size:14px;color:${MUTED};margin:0 0 8px;">
      Bestellnummer <strong style="color:${TEXT};">${order.orderNumber}</strong>
    </p>
    <p style="font-size:15px;color:${TEXT};line-height:1.6;margin:20px 0;">${s.msg}</p>

    ${newStatus === 'Abholbereit' ? `
      <div style="background:${BRAND_LIGHT};border-radius:10px;padding:16px;margin:20px 0;font-size:13px;color:${TEXT};">
        <strong>Abholung:</strong> ${company.street}, ${company.zip} ${company.city}<br>
        <strong>Öffnungszeiten:</strong> Mo–Fr 09:00–19:00, Sa 09:00–18:00<br>
        <strong>Telefon:</strong> ${company.phone}
      </div>` : ''}

    <div style="text-align:center;margin:24px 0;">
      <a href="${trackingUrl}" target="_blank" rel="noopener" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:11px 24px;border-radius:8px;font-size:14px;font-weight:500;">
        Bestellung ansehen →
      </a>
    </div>
  `;

  return shellHtml('Status-Update ' + order.orderNumber, content);
}

// ── Admin-Benachrichtigung bei neuer Online-Bestellung ─────────
function adminNewOrder(order) {
  const measuresList = order.measures.map((m, i) => {
    const variantRows = formatVariants(m);
    const variantHtml = variantRows.length
      ? `<div style="font-size:11px;color:${MUTED};margin-top:3px;line-height:1.5;">${variantRows.join(' · ')}</div>`
      : '';
    const bemHtml = m.bemerkung
      ? `<div style="font-size:11px;color:${MUTED};margin-top:2px;font-style:italic;">Bemerkung: "${m.bemerkung}"</div>`
      : '';
    return `
    <li style="margin-bottom:10px;">
      <strong style="color:${TEXT};">${m.modelName || 'Modell'}</strong> ${m.breite}×${m.hoehe} cm · ${m.farbe}${m.stueck > 1 ? ' · ' + m.stueck + ' Stk' : ''} → ${eur(m.gross)}
      ${variantHtml}
      ${bemHtml}
    </li>`;
  }).join('');

  const content = `
    <h1 style="font-size:20px;font-weight:600;margin:0 0 8px;color:${TEXT};">📦 Neue Online-Bestellung</h1>
    <p style="font-size:14px;color:${MUTED};margin:0 0 16px;">
      <strong style="color:${TEXT};">${order.orderNumber}</strong> · ${new Date().toLocaleString('de-AT')}
    </p>

    <table width="100%" cellpadding="6" style="border-collapse:collapse;font-size:13px;background:${BRAND_LIGHT};border-radius:8px;margin-bottom:16px;">
      <tr><td style="color:${MUTED};width:120px;">Kunde</td><td style="color:${TEXT};font-weight:500;">${order.vorname} ${order.nachname}</td></tr>
      <tr><td style="color:${MUTED};">Telefon</td><td style="color:${TEXT};">${order.telefon}</td></tr>
      <tr><td style="color:${MUTED};">Email</td><td style="color:${TEXT};">${order.email}</td></tr>
      <tr><td style="color:${MUTED};">Bezahlt</td><td style="color:${TEXT};">${eur(order.anzahlung || order.totalGross || 0)} (online)</td></tr>
    </table>

    <div style="font-size:12px;color:${MUTED};font-weight:500;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:8px;">Bestellung</div>
    <ul style="font-size:13px;color:${TEXT};margin:0 0 16px;padding-left:20px;line-height:1.6;">${measuresList}</ul>

    <table width="100%" style="font-size:14px;">
      <tr><td style="padding:4px 0;color:${MUTED};">Gesamtbetrag (inkl. 20% MwSt)</td><td style="text-align:right;font-weight:600;color:${TEXT};">${eur(order.totalGross)}</td></tr>
      <tr><td style="padding:4px 0;color:${BRAND};">Bereits bezahlt</td><td style="text-align:right;font-weight:600;color:${BRAND_DARK};">${eur(order.anzahlung || order.totalGross || 0)}</td></tr>
    </table>

    ${order.bemerkung ? `<div style="background:#FFF8E7;border-left:3px solid #F2C94C;padding:10px 14px;margin-top:16px;font-size:13px;color:#6B5612;border-radius:0 8px 8px 0;"><strong>Bemerkung Kunde:</strong> ${order.bemerkung}</div>` : ''}

    <div style="font-size:12px;color:${MUTED};margin-top:24px;border-top:0.5px solid ${BORDER};padding-top:16px;">
      Die Bestellung ist in der App im Status <strong>Bestellung</strong> sichtbar — bereits vollständig bezahlt.<br>
      Auf <strong>In Produktion</strong> setzen, sobald mit der Anfertigung begonnen wird.
    </div>
  `;

  return shellHtml('Neue Online-Bestellung ' + order.orderNumber, content);
}

module.exports = {
  orderConfirmation,
  statusUpdate,
  adminNewOrder
};
