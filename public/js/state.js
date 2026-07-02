// ═══════════════════════════════════════════════════════════════
// STATE - Konfigurations-State + LocalStorage
// ═══════════════════════════════════════════════════════════════
//
// Aktuelle Konfiguration wird im localStorage gehalten, damit der
// Kunde bei versehentlichem Schließen nichts verliert.
//
// v2: Mehrere Positionen (measures[]) statt einem einzelnen Maß.
//     Pro Position kann Breite/Höhe/Stk/Farbe/Türart/Varianten/Bemerkung
//     unabhängig gesetzt werden. Modell bleibt für die ganze Bestellung gleich.

window.state = (function() {
  const STORAGE_KEY = 'bella_shop_config';
  const VERSION = 2;

  function blankMeasure() {
    return {
      breite: 120,
      hoehe: 150,
      stueck: 1,
      farbe: '',
      doppeltuer: false,
      variants: {},
      bemerkung: ''
    };
  }

  function blank() {
    return {
      version: VERSION,
      step: 1,
      modelId: null,
      modelData: null,
      measures: [blankMeasure()],
      vorname: '',
      nachname: '',
      telefon: '',           // finalisierte Nummer im Format „+43660…"
      telefonVorwahl: '+43', // Länder-Vorwahl, vom Kunden im Dropdown gewählt
      telefonNummer: '',     // Nummer ohne Vorwahl, wie der Kunde sie tippt
      email: '',
      agbAccepted: false,
      widerrufAccepted: false
    };
  }

  // Migration von v1 (flache breite/hoehe/...-Felder) → v2 (measures[]).
  // Damit Kunden mit einer aktiven Konfiguration im LocalStorage nicht
  // verloren-laufen wenn das neue Schema deployed wird.
  function migrateV1(old) {
    const measure = {
      breite: old.breite || 120,
      hoehe: old.hoehe || 150,
      stueck: old.stueck || 1,
      farbe: old.farbe || '',
      doppeltuer: !!old.doppeltuer,
      variants: old.variants || {},
      bemerkung: old.bemerkung || ''
    };
    return {
      version: VERSION,
      step: old.step || 1,
      modelId: old.modelId || null,
      modelData: old.modelData || null,
      measures: [measure],
      vorname: old.vorname || '',
      nachname: old.nachname || '',
      telefon: old.telefon || '',
      telefonVorwahl: old.telefonVorwahl || '+43',
      telefonNummer: old.telefonNummer || (old.telefon || '').replace(/^\+43/, ''),
      email: old.email || '',
      agbAccepted: !!old.agbAccepted,
      widerrufAccepted: !!old.widerrufAccepted
    };
  }

  let data = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return blank();
      const parsed = JSON.parse(raw);
      if (parsed.version === 1) return migrateV1(parsed);
      if (parsed.version !== VERSION) return blank();
      // Sicherheits-Net: measures muss Array mit ≥1 Position sein.
      const merged = { ...blank(), ...parsed };
      if (!Array.isArray(merged.measures) || merged.measures.length === 0) {
        merged.measures = [blankMeasure()];
      }
      return merged;
    } catch (e) {
      return blank();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* Quota / privater Modus — ignorieren */ }
  }

  function reset() {
    data = blank();
    save();
  }

  // ── Helpers für measures ──────────────────────────────────────
  function addMeasure() {
    // Defaults aus letzter Position übernehmen (außer Bemerkung) — meist
    // bestellt der Kunde mehrere Fenster im selben Raum, gleiche Farbe.
    const last = data.measures[data.measures.length - 1] || blankMeasure();
    data.measures.push({
      breite: last.breite,
      hoehe: last.hoehe,
      stueck: 1,
      farbe: last.farbe,
      doppeltuer: last.doppeltuer,
      variants: { ...(last.variants || {}) },
      bemerkung: ''
    });
    save();
  }

  function removeMeasure(idx) {
    if (data.measures.length <= 1) return;
    data.measures.splice(idx, 1);
    save();
  }

  function updateMeasure(idx, patch) {
    if (!data.measures[idx]) return;
    data.measures[idx] = { ...data.measures[idx], ...patch };
    save();
  }

  function setMeasureVariant(idx, vid, value) {
    if (!data.measures[idx]) return;
    const variants = { ...(data.measures[idx].variants || {}) };
    variants[vid] = value;
    data.measures[idx].variants = variants;
    save();
  }

  return {
    get: () => data,
    set: (patch) => { data = { ...data, ...patch }; save(); },
    reset,
    save,
    blankMeasure,
    addMeasure,
    removeMeasure,
    updateMeasure,
    setMeasureVariant
  };
})();
