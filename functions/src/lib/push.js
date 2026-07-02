// ╔══════════════════════════════════════════════════════════════╗
// ║  Push bei neuer Bestellung (FCM) — v1.20.0                    ║
// ║                                                                ║
// ║  Schickt an alle Mitarbeiter-Geräte mit gespeichertem         ║
// ║  fcmTokens. Tote Tokens werden automatisch bereinigt.         ║
// ║  FCM-Versand ist kostenlos.                                   ║
// ╚══════════════════════════════════════════════════════════════╝

const admin = require('firebase-admin');

const db = () => admin.firestore();

// Codes, bei denen ein Token endgültig ungültig ist → aus dem Member-Doc entfernen.
const DEAD_TOKEN_CODES = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument'
];

/**
 * Sendet ein Push „Neue Bestellung" an alle Mitarbeiter-Geräte.
 * @param {object} order  Bestell-Daten (vorname, nachname, measures, source, filialeName, orderNumber)
 * @param {string} orderId  Firestore-Doc-ID (für Deep-Link / data)
 */
async function sendNewOrderPush(order, orderId) {
  try {
    // Alle Tokens einsammeln (uid mitführen für gezieltes Cleanup)
    const snap = await db().collection('members').get();
    const tokenOwners = [];
    snap.docs.forEach((d) => {
      const toks = d.data() && d.data().fcmTokens;
      if (Array.isArray(toks)) {
        toks.forEach((t) => { if (t && typeof t === 'string') tokenOwners.push({ uid: d.id, token: t }); });
      }
    });
    if (!tokenOwners.length) {
      console.log('[push] keine fcmTokens — kein Empfänger');
      return;
    }

    const name = ((order.vorname || '') + ' ' + (order.nachname || '')).trim() || 'Kunde';
    const anzahl = (order.measures || []).length;
    const quelle = order.source === 'online' ? 'Online' : (order.filialeName || 'Filiale');
    const title = '🆕 Neue Bestellung' + (order.orderNumber ? ' ' + order.orderNumber : '');
    const body = `${name} · ${anzahl} ${anzahl === 1 ? 'Artikel' : 'Artikel'} · ${quelle}`;

    const tokens = tokenOwners.map((t) => t.token);
    const message = {
      notification: { title, body },
      data: { type: 'new_order', orderId: orderId || '', orderNumber: order.orderNumber || '' },
      webpush: {
        notification: { icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' },
        fcmOptions: { link: 'https://fliegengitter-3486c.web.app/' }
      },
      tokens
    };

    const resp = await admin.messaging().sendEachForMulticast(message);

    // Tote Tokens bereinigen
    const toRemove = {}; // uid → [token,...]
    resp.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error && r.error.code;
        if (DEAD_TOKEN_CODES.includes(code)) {
          const { uid, token } = tokenOwners[i];
          (toRemove[uid] = toRemove[uid] || []).push(token);
        }
      }
    });
    await Promise.all(Object.entries(toRemove).map(([uid, toks]) =>
      db().collection('members').doc(uid)
        .update({ fcmTokens: admin.firestore.FieldValue.arrayRemove(...toks) })
        .catch((e) => console.warn('[push] Cleanup', uid, e.message))
    ));

    console.log(`[push] ${order.orderNumber || orderId}: ${resp.successCount}/${tokens.length} ok, ${resp.failureCount} Fehler, ${Object.values(toRemove).flat().length} tote Tokens entfernt`);
  } catch (e) {
    // Push ist „best effort" — ein Fehler darf den Bestell-/Mail-Flow nie blockieren.
    console.error('[push] sendNewOrderPush Fehler:', e);
  }
}

module.exports = { sendNewOrderPush };
