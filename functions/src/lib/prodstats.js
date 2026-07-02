// ╔══════════════════════════════════════════════════════════════╗
// ║  Production Statistics — Fristberechnung (Server-Side)       ║
// ║  Portiert aus FG App public/js/09-prodstats.js               ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Berechnet voraussichtlichen Fertigstellungszeitraum für eine neue
// Bestellung (Step 3) oder für eine laufende Bestellung (Tracking).
//
// Quelle der Wahrheit ist und bleibt die FG App. Hier wird die
// gleiche Logik serverseitig nachgebaut, damit der Shop einen
// dedizierten Endpoint anbieten kann ohne die Kunden Firestore
// direkt lesen zu lassen.

const admin = require('firebase-admin');

const PRODSTATS_DAYS = 60;
const PRODSTATS_PUFFER_DAYS = 2;
const PRODSTATS_SPAN_DAYS = 2;   // v1.20.4: ± KALENDERtage (= 5-Tage-Fenster), vorher 3 Werktage

// Österreichische Feiertage. Bei Änderungen unbedingt mit FG App 09-prodstats.js synchron halten.
const PRODSTATS_FEIERTAGE_AT = [
  '2026-01-01','2026-01-06','2026-04-06','2026-05-01','2026-05-14','2026-05-25',
  '2026-06-04','2026-08-15','2026-10-26','2026-11-01','2026-12-08','2026-12-25','2026-12-26',
  '2027-01-01','2027-01-06','2027-03-29','2027-05-01','2027-05-06','2027-05-17',
  '2027-05-27','2027-08-15','2027-10-26','2027-11-01','2027-12-08','2027-12-25','2027-12-26'
];

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isWerktag(d) {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  if (PRODSTATS_FEIERTAGE_AT.includes(dateKey(d))) return false;
  return true;
}

function addWerktage(date, n) {
  const d = new Date(date);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    if (isWerktag(d)) added++;
  }
  return d;
}

function orderStk(o) {
  if (!o || !Array.isArray(o.measures)) return 0;
  return o.measures.reduce((s, m) => s + (parseInt(m.stueck) || 1), 0);
}

function logDate(l) {
  if (!l || !l.time) return null;
  if (typeof l.time.toDate === 'function') return l.time.toDate();
  if (typeof l.time.seconds === 'number') return new Date(l.time.seconds * 1000);
  if (typeof l.time === 'string') return new Date(l.time);
  if (l.time instanceof Date) return l.time;
  return null;
}

// Liest die für die Statistik nötigen Bestellungen aus Firestore.
// Hinweis: Wir lesen ALLE Bestellungen die in den letzten 60 Tagen
// nach "Abholbereit" verschoben wurden oder gerade offen sind.
// Für simplere Abfragbarkeit holen wir einfach createdAt >= cutoff
// plus alle offenen — minimaler Filter, Restlogik macht JS.
async function loadStatsOrders() {
  const db = admin.firestore();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PRODSTATS_DAYS);
  cutoff.setHours(0, 0, 0, 0);

  // Bestellungen die in den letzten 60 Tagen produziert wurden ODER aktuell offen sind.
  // Wir nehmen alle aus den relevanten Spalten (offene) und alle mit createdAt > cutoff.
  // Doppelte werden im Set über doc.id deduped.
  const openCols = ['Bestellung', 'In Produktion', 'Transport', 'Reparatur', 'Abholbereit', 'Warteliste'];
  const [openSnap, recentSnap] = await Promise.all([
    db.collection('orders').where('column', 'in', openCols).get(),
    db.collection('orders').where('createdAt', '>=', cutoff).get()
  ]);

  const byId = new Map();
  openSnap.docs.forEach(d => byId.set(d.id, { id: d.id, ...d.data() }));
  recentSnap.docs.forEach(d => { if (!byId.has(d.id)) byId.set(d.id, { id: d.id, ...d.data() }); });
  // Pending/Expired Online-Bestellungen aus Stats raushalten — sonst verfälschen
  // sie Queue-Position und Frist-Berechnung.
  return Array.from(byId.values()).filter(o => {
    const ps = o.paymentStatus;
    return ps !== 'pending' && ps !== 'expired';
  });
}

// Kernberechnung — identische Logik wie in FG App, nur auf einem
// vorbeladenen Order-Array.
function computeStats(orders) {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - PRODSTATS_DAYS);
  cutoff.setHours(0, 0, 0, 0);

  const stkPerDay = {};
  orders.forEach(o => {
    if (!Array.isArray(o.log)) return;
    // Produktions-Abschluss = erstes "nach Transport verschoben" (Inegöl) ODER "nach Abholbereit verschoben" (Wien).
    // .find liefert den chronologisch ersten Treffer → jede Bestellung genau EINMAL gezählt
    // (kein Doppel bei Transport→Abholbereit; Inegöl zählt am Produktionstag, nicht erst bei Ankunft → Frist unverzerrt).
    const abhEntry = o.log.find(l => l && typeof l.text === 'string' && (l.text.includes('nach Transport verschoben') || l.text.includes('nach Abholbereit verschoben')));
    if (!abhEntry) return;
    const d = logDate(abhEntry);
    if (!d || d < cutoff) return;
    const stk = orderStk(o);
    if (stk === 0) return;
    const key = dateKey(d);
    stkPerDay[key] = (stkPerDay[key] || 0) + stk;
  });

  let totalProduced = 0;
  let activeDays = 0;
  Object.values(stkPerDay).forEach(stk => {
    if (stk > 0) { totalProduced += stk; activeDays++; }
  });
  const avgPerDay = activeDays > 0 ? totalProduced / activeDays : 0;

  const warteSpalten = ['Bestellung', 'In Produktion', 'Reparatur'];
  let openStk = 0;
  let openOrders = 0;
  orders.forEach(o => {
    if (!warteSpalten.includes(o.column)) return;
    openStk += orderStk(o);
    openOrders++;
  });

  return { avgPerDay, openStk, openOrders, totalProduced, activeDays };
}

// Berechnet from/mid/to als JS-Date-Objekte. additionalStk = neue Stk
// die zur Wartschlange addiert werden (Step 3 vor Bestellabschluss).
function getProposedFristRange(stats, additionalStk = 0, fristSettings = null) {
  // v1.20.8: Manueller Modus — feste Wochen-Spanne (z.B. Urlaub), überschreibt die Auto-Berechnung.
  if (fristSettings && fristSettings.mode === 'manual') {
    const a = Math.max(0, Number(fristSettings.fromWeeks) || 0);
    const b = Math.max(a, Number(fristSettings.toWeeks) || 0);
    const today0 = new Date(); today0.setHours(0, 0, 0, 0);
    const mk = w => { const d = new Date(today0); d.setDate(d.getDate() + Math.round(w * 7)); return d; };
    let from = mk(a); const to = mk(b); const mid = mk((a + b) / 2);
    const minFrom = new Date(today0); minFrom.setDate(minFrom.getDate() + 1);
    if (from < minFrom) from = minFrom;
    return { from, mid, to, days: Math.round(((a + b) / 2) * 7), valid: true, manual: true };
  }
  if (!stats || stats.avgPerDay <= 0) {
    return { from: null, mid: null, to: null, days: 0, valid: false };
  }
  const totalNeeded = stats.openStk + (additionalStk || 0);
  const productionDays = Math.ceil(totalNeeded / stats.avgPerDay);
  const totalDays = productionDays + PRODSTATS_PUFFER_DAYS;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mid = addWerktage(today, totalDays);
  // v1.20.4: Spanne in KALENDERtagen (±2 = 5-Tage-Fenster). Werktage hätten durchs
  // Wochenende ~9 Kalendertage Spanne ergeben. Mitte (mid) bleibt unverändert.
  let from = new Date(mid); from.setDate(from.getDate() - PRODSTATS_SPAN_DAYS);
  const to = new Date(mid); to.setDate(to.getDate() + PRODSTATS_SPAN_DAYS);
  const minFrom = new Date(today); minFrom.setDate(minFrom.getDate() + 1);
  if (from < minFrom) from = minFrom;
  return { from, mid, to, days: totalDays, valid: true };
}

// v1.20.8: Frist-Modus-Einstellungen aus settings/global lesen (Auto/Manuell + Wochen-Spanne).
async function getFristSettings() {
  try {
    const doc = await admin.firestore().collection('settings').doc('global').get();
    const d = doc.exists ? (doc.data() || {}) : {};
    return {
      mode: d.fristMode === 'manual' ? 'manual' : 'auto',
      fromWeeks: d.fristFromWeeks != null ? d.fristFromWeeks : 2,
      toWeeks: d.fristToWeeks != null ? d.fristToWeeks : 4
    };
  } catch (e) {
    console.error('[getFristSettings]', e);
    return { mode: 'auto', fromWeeks: 2, toWeeks: 4 };
  }
}

// Convenience: lädt Orders + Frist-Settings + rechnet Frist in einem Call.
async function getFristForAdditionalStk(additionalStk = 0) {
  const [orders, fristSettings] = await Promise.all([loadStatsOrders(), getFristSettings()]);
  const stats = computeStats(orders);
  const frist = getProposedFristRange(stats, additionalStk, fristSettings);
  return { frist, stats };
}

// Queue-Position einer bestimmten Bestellung (= ihre Reihenfolge in der
// "Bestellung"-Spalte, älteste zuerst). Returns { position, total } oder null
// wenn die Bestellung gar nicht (mehr) in der Bestellung-Spalte ist.
function computeQueuePosition(orders, targetOrderId) {
  const queue = orders
    .filter(o => o.column === 'Bestellung')
    .sort((a, b) => {
      const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
      return ta - tb;
    });
  const idx = queue.findIndex(o => o.id === targetOrderId);
  if (idx === -1) return null;
  return { position: idx + 1, total: queue.length };
}

module.exports = {
  loadStatsOrders,
  computeStats,
  getProposedFristRange,
  getFristForAdditionalStk,
  getFristSettings,
  computeQueuePosition,
  // Konstanten exportieren falls UI sie anzeigen will
  PRODSTATS_PUFFER_DAYS,
  PRODSTATS_SPAN_DAYS
};
