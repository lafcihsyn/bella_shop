// ╔══════════════════════════════════════════════════════════════╗
// ║  Geplantes Auto-Backup — jeden Abend 19:00 Wiener Zeit        ║
// ║                                                                ║
// ║  Erzeugt EXAKT dasselbe JSON wie der manuelle Backup-Knopf    ║
// ║  in der BestellApp (Format-Version 5.9) → ist über den         ║
// ║  „Backup wiederherstellen"-Knopf einspielbar.                  ║
// ║                                                                ║
// ║  Ziel: Cloud Storage  gs://<bucket>/backups/                   ║
// ║  Aufbewahrung: 30 Tage (ältere werden automatisch gelöscht).   ║
// ║  Kosten: ~1 Cent/Monat (DB ist ~17 MB).                        ║
// ╚══════════════════════════════════════════════════════════════╝

const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

// Identisch zur BACKUP_COLLECTIONS-Liste in der BestellApp
// (fliegengitter-web/public/index.html). Bei Änderung dort: hier mitziehen.
const BACKUP_COLLECTIONS = [
  'orders', 'members', 'settings', 'materials',
  'inventory_in', 'inventory_out', 'inventory_check',
  'filialen', 'colors', 'plissee_colors', 'netz_colors',
  'netz_breiten', 'material_dimensions', 'variants', 'models'
];

const BUCKET_NAME = 'fliegengitter-3486c.firebasestorage.app';
const RETENTION_DAYS = 30;

exports.scheduledBackup = onSchedule(
  {
    schedule: '0 19 * * *',         // jeden Tag 19:00
    timeZone: 'Europe/Vienna',
    region: 'europe-west1',
    memory: '512MiB',
    timeoutSeconds: 540
  },
  async () => {
    const db = admin.firestore();

    // ── 1. Backup-Objekt bauen (gleiches Format wie createBackupData) ──
    const backup = {
      version: '5.9',
      createdAt: new Date().toISOString(),
      source: 'auto-scheduled',
      collections: {}
    };

    let totalDocs = 0;
    for (const col of BACKUP_COLLECTIONS) {
      try {
        const snap = await db.collection(col).get();
        backup.collections[col] = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
        totalDocs += snap.size;
      } catch (e) {
        console.error(`[backup] Collection "${col}" fehlgeschlagen:`, e.message);
        backup.collections[col] = [];
      }
    }

    // ── 2. In Cloud Storage speichern (Dateiname mit Wiener Datum) ──
    // en-CA liefert YYYY-MM-DD
    const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' })
      .format(new Date());
    const fileName = `backups/fliegengitter_backup_${dateStr}.json`;

    const bucket = admin.storage().bucket(BUCKET_NAME);
    const file = bucket.file(fileName);
    await file.save(JSON.stringify(backup), {
      contentType: 'application/json',
      resumable: false,
      metadata: {
        metadata: {
          orderCount: String((backup.collections.orders || []).length),
          totalDocs: String(totalDocs),
          source: 'auto-scheduled'
        }
      }
    });
    console.log(`[backup] Gespeichert: ${fileName} (${totalDocs} Dokumente, ${(backup.collections.orders || []).length} Bestellungen)`);

    // ── 3. Aufräumen: Backups älter als RETENTION_DAYS löschen ──
    try {
      const [files] = await bucket.getFiles({ prefix: 'backups/' });
      const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
      let deleted = 0;
      for (const f of files) {
        const created = f.metadata && f.metadata.timeCreated
          ? new Date(f.metadata.timeCreated).getTime()
          : null;
        if (created !== null && created < cutoff) {
          await f.delete();
          deleted++;
        }
      }
      if (deleted) console.log(`[backup] ${deleted} alte Backups (>${RETENTION_DAYS} Tage) gelöscht.`);
    } catch (e) {
      // Aufräumen ist best-effort — Hauptsache das neue Backup ist sicher.
      console.error('[backup] Aufräumen fehlgeschlagen:', e.message);
    }

    return null;
  }
);
