// ═══════════════════════════════════════════════════════════════
// VIEWS - Render-Funktionen für alle Bildschirme
// ═══════════════════════════════════════════════════════════════

window.views = (function() {

  const cache = {
    models: null,
    colors: null,
    variants: null
  };

  // Erklärungs-Texte pro Variant-ID, falls in Firestore noch keine `description`
  // hinterlegt ist. HTML erlaubt (z.B. <br>, <strong>, <img>).
  const VARIANT_HINTS = {
    schwellenlos: `Der Standard-Fliegengitterrahmen ist <strong>3,9 cm hoch und 2,6 cm breit</strong>. Wird er auf einen ebenen Boden montiert, entsteht eine <strong>3,9 cm hohe Schwelle</strong> — Stolperrisiko und nicht barrierefrei.<br><br><strong>Mit "Ja"</strong> wird das untere Profil durch ein flaches <strong>1 cm-Profil</strong> ersetzt: nahezu schwellenlos, barrierefrei begehbar.<br><br><img src="/img/bodenprofil-vergleich.jpg" alt="Vergleich Standardprofil oben (3,9 cm Schwelle) vs. Bodenprofil unten (1 cm flach)" class="variant-hint-image" onclick="window.views.openLightbox(this.src, this.alt)" loading="lazy">`
  };

  // Erweiterte Beschriftung für Dropdown-Optionen, damit der Kunde im
  // geschlossenen Select schon sieht was er wählt (z.B. nicht nur „Ja",
  // sondern „Ja — Flaches Bodenprofil (1 cm)").
  const VARIANT_OPTION_LABEL_OVERRIDES = {
    schwellenlos: {
      ja:   'Ja — Flaches Bodenprofil (1 cm Höhe), nahezu schwellenlos',
      nein: 'Nein — Standard-Fliegengitterprofil (3,9 cm Höhe)'
    }
  };

  // Einfache Lightbox für Hint-Bilder: vergrößert ein Bild beim Klick.
  function openLightbox(src, alt) {
    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    overlay.innerHTML = `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt || '')}"><button class="lightbox-close" aria-label="Schließen">×</button>`;
    overlay.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
  }

  // Info-Modal: titulierte Erklär-Box (HTML erlaubt im Body). Wird über
  // den „Was ist das?"-Link neben Varianten geöffnet, damit ausführliche
  // Erklärungs-Bilder/-Texte nicht permanent die Konfigurationsseite zumüllen.
  function openInfoModal(title, htmlContent) {
    const overlay = document.createElement('div');
    overlay.className = 'info-modal-overlay';
    overlay.innerHTML = `
      <div class="info-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || 'Info')}">
        <button class="info-modal-close" type="button" aria-label="Schließen">×</button>
        ${title ? `<h3 class="info-modal-title">${escapeHtml(title)}</h3>` : ''}
        <div class="info-modal-body">${htmlContent || ''}</div>
      </div>
    `;
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
      // Klick außerhalb der Box ODER auf X → schließen
      if (e.target === overlay || e.target.classList.contains('info-modal-close')) close();
    });
    // ESC schließt
    const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  }

  // Öffnet das Variant-Info-Modal anhand der vid (sucht Hint aus Firestore
  // oder Fallback in VARIANT_HINTS). Wird vom „Was ist das?"-Link aufgerufen.
  function openVariantInfo(vid, displayName) {
    const variant = (cache.variants || []).find(v => v.id === vid);
    const fromDb = variant && variant.description
      ? escapeHtml(variant.description).replace(/\n/g, '<br>') : '';
    const fromCode = VARIANT_HINTS[vid] || '';
    const html = fromDb || fromCode || '<em>Keine Erklärung verfügbar.</em>';
    openInfoModal(displayName || vid, html);
  }

  // ── Hilfsfunktionen ──────────────────────────────────────────
  function eur(n) {
    return new Intl.NumberFormat('de-AT', {
      style: 'currency', currency: 'EUR', minimumFractionDigits: 2
    }).format(n || 0);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  // Format-Helper für cm-Maße: zeigt Ganzzahlen ohne Dezimal („120"),
  // Dezimalzahlen mit deutschem Komma („100,3"). So entsteht keine
  // Verwirrung durch JS-Default-Punkte.
  function fmtCm(n) {
    const v = Number(n) || 0;
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(1).replace('.', ',');
  }

  // Datums-Spanne kompakt formatieren, z.B. "10. – 15. Juni 2026"
  // oder "30. Mai – 5. Juni 2026" wenn die Spanne über zwei Monate geht.
  function formatFristRange(fromIso, toIso) {
    const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
    const from = new Date(fromIso), to = new Date(toIso);
    if (isNaN(from) || isNaN(to)) return '';
    const fm = months[from.getMonth()], tm = months[to.getMonth()];
    if (from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()) {
      return `${from.getDate()}. – ${to.getDate()}. ${fm} ${from.getFullYear()}`;
    }
    if (from.getFullYear() === to.getFullYear()) {
      return `${from.getDate()}. ${fm} – ${to.getDate()}. ${tm} ${to.getFullYear()}`;
    }
    return `${from.getDate()}. ${fm} ${from.getFullYear()} – ${to.getDate()}. ${tm} ${to.getFullYear()}`;
  }

  // Einzel-Datum für die Tracking-Seite (gespeicherte Frist). Akzeptiert "YYYY-MM-DD",
  // ISO-String oder ein Alt-Objekt {mid/from} (Übergangs-/Cache-sicher) → "8. Juli 2026".
  function formatFristDate(val) {
    if (!val) return '';
    const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
    let s = (typeof val === 'object') ? (val.mid || val.from || '') : val;
    s = String(s);
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return `${parseInt(m[3],10)}. ${months[parseInt(m[2],10)-1]} ${m[1]}`;
    const d = new Date(s);
    if (!isNaN(d)) return `${d.getDate()}. ${months[d.getMonth()]} ${d.getFullYear()}`;
    return '';
  }

  // Preisberechnung pro Position (Frontend-Live-Preis).
  // Server berechnet bei Bestellung neu — der Live-Wert ist nur Anzeige.
  // v1.38: Preis-Matrix Türart × Netz/Plissee bevorzugt vor Default-Vorschlägen.
  function pickSqmPrice(modelData, measure) {
    const isDt = !!measure.doppeltuer;
    const np = measure.variants?.netz_plissee;
    // Matrix-Lookup wenn vorhanden + Netz/Plissee-Variant gewählt
    if (modelData.priceMatrix && np) {
      const tk = isDt ? 'doppel' : 'einzel';
      // 'kombi' nutzt den Plissee-Preis (Mischung mit Plissee, oberer Preis)
      const npKey = (np === 'kombi') ? 'plisee' : np;
      const v = modelData.priceMatrix[tk]?.[npKey];
      if (typeof v === 'number' && v > 0) return v;
    }
    // Fallback: alter Default-Vorschlag
    return (isDt && modelData.sqmPriceDoppel) ? modelData.sqmPriceDoppel : modelData.sqmPrice;
  }
  function calcMeasurePrice(measure, modelData) {
    if (!modelData || !measure) return null;
    const sqmPrice = pickSqmPrice(modelData, measure);
    const sqm = (measure.breite / 100) * (measure.hoehe / 100) * measure.stueck;
    const billSqm = Math.max(sqm, 1 * measure.stueck);
    return {
      sqm,
      billSqm,
      sqmPrice,
      gross: Math.round(billSqm * sqmPrice * 100) / 100
    };
  }

  // Gesamtpreis über alle Positionen (Brutto + Netto/USt-Aufteilung).
  function calcOrderTotal(state) {
    if (!state.modelData) return null;
    const measures = state.measures || [];
    let gross = 0, billSqm = 0;
    for (const m of measures) {
      const p = calcMeasurePrice(m, state.modelData);
      if (p) { gross += p.gross; billSqm += p.billSqm; }
    }
    gross = Math.round(gross * 100) / 100;
    const net = Math.round((gross / 1.2) * 100) / 100;
    const vat = Math.round((gross - net) * 100) / 100;
    return { gross, net, vat, billSqm };
  }

  // Kompat-Wrapper: alte Aufrufe `calcPrice(state)` geben jetzt die Gesamt-
  // summe über alle Positionen zurück (gross/net/vat/billSqm).
  function calcPrice(state) {
    return calcOrderTotal(state);
  }

  // ── Lade Daten (Modelle, Farben, Varianten) ──────────────────
  async function loadShopData() {
    if (cache.models) return cache;
    try {
      const [m, c, v, pc, nc] = await Promise.all([
        api.getModels(),
        api.getColors(),
        api.getVariants(),
        api.getPlisseeColors().catch(() => ({ colors: [] })),
        api.getNetzColors().catch(() => ({ colors: [] }))
      ]);
      cache.models = m.models || [];
      cache.colors = c.colors || [];
      cache.variants = v.variants || [];
      cache.plisseeColors = pc.colors || [];
      cache.netzColors = nc.colors || [];
    } catch (err) {
      console.error('[loadShopData]', err);
      cache.models = [];
      cache.colors = [];
      cache.variants = [];
      cache.plisseeColors = [];
      cache.netzColors = [];
    }
    return cache;
  }

  // ─── Konfigurator-Vorschau (v1.1 — Plissee/Netz-Bild + Drag-Trenner) ───
  // Skaliert Rahmen konstant 4cm × 4cm (Slide Pro Profil), Stoff dehnbar.
  // Bei Doppeltür/Kombi kann der mittlere Trenner per Drag verschoben werden:
  // ganz links → nur rechter Stoff sichtbar, ganz rechts → nur linker Stoff.
  function renderProductPreview(mm, splitRatio) {
    const w = mm.breite || 100;
    const h = mm.hoehe || 200;
    const PROFIL_CM = 4, FLUEGEL_CM = 4, ECKE_W_CM = 2;

    // Container max 220 × 180 px (passt in preview-box)
    const ratio = w / h;
    let pxW = 220, pxH = pxW / ratio;
    if (pxH > 180) { pxH = 180; pxW = pxH * ratio; }
    pxW = Math.max(100, pxW); pxH = Math.max(100, pxH);
    const pxPerCm = pxW / w;
    const frame = Math.max(4, Math.round(PROFIL_CM * pxPerCm));
    const fluegel = Math.max(4, Math.round(FLUEGEL_CM * pxPerCm));
    const eckeW = Math.max(3, Math.round(ECKE_W_CM * pxPerCm));

    // Profil-Farbe
    const colorObj = (cache.colors || []).find(c => c.name === mm.farbe);
    const profilColor = colorObj?.bg || '#3a3a3a';
    const profilShadow = _shade(profilColor, -30);
    const profilHighlight = _shade(profilColor, 10);
    const profilGradV = `linear-gradient(90deg, ${profilHighlight} 0%, ${profilColor} 30%, ${profilColor} 70%, ${profilShadow} 100%)`;
    const profilGradH = `linear-gradient(180deg, ${profilHighlight} 0%, ${profilColor} 30%, ${profilColor} 70%, ${profilShadow} 100%)`;
    // Eckverbindung-Farbe: weiß bei weißem Rahmen, sonst schwarz
    const isWhiteFrame = /^#?(?:fff|fefefe|f5|e0e0e0|e8e8e8)/i.test(profilColor);
    const ecke = isWhiteFrame
      ? { base:'#f0f0f0', hole:'#b0b0b0' }
      : { base:'#1a1a1a', hole:'#000' };

    // Variant-Auswahl
    const vars = mm.variants || {};
    const tuerart = mm.doppeltuer ? 'doppel' : 'einzel';
    const np = vars.netz_plissee || 'netz';
    const isKombi = np === 'kombi' && tuerart === 'doppel';
    // Stoff-Farben
    const plisseeColor = (cache.plisseeColors || []).find(c => c.id === vars.plisseeFarbe)?.bg || '#3a3a3a';
    const netzColor = (cache.netzColors || []).find(c => c.id === vars.netzFarbe)?.bg || '#1a1a1a';

    function stoffDiv(typ, color) {
      const dark = _shade(color, -30);
      // v1.37: Netz ist leicht durchscheinend (Hintergrund sichtbar), Plissee bleibt blickdicht
      const netzBg = _hexToRgba(color, 0.55);
      const bg = typ === 'plissee'
        ? `repeating-linear-gradient(90deg, ${dark}88 0px, ${dark}88 1px, transparent 1px, transparent 3px), ${color}`
        : `radial-gradient(circle, rgba(60,60,60,0.55) 0.5px, transparent 0.7px), ${netzBg}`;
      const sz = typ === 'netz' ? 'background-size:2.5px 2.5px,auto;' : '';
      return `<div style="flex:1;background:${bg};${sz}box-shadow:inset 0 0 4px rgba(0,0,0,0.4)"></div>`;
    }

    // Drag-State je nach Türart
    const so = splitRatio || {};
    const leftOpen   = Math.max(0, Math.min(1, so.leftOpen   ?? 0));
    const rightOpen  = Math.max(0, Math.min(1, so.rightOpen  ?? 0));
    const openness   = Math.max(0, Math.min(1, so.openness   ?? 0));
    const kombiRatio = Math.max(0, Math.min(1, so.kombiRatio ?? 0.5));

    const fluegelSingle = `<div style="width:${fluegel}px;background:${profilGradV};flex-shrink:0"></div>`;

    let doors, canDrag = false;
    if (tuerart === 'einzel') {
      // Layout: [Stoff (1-openness)] [Flügel] [Empty (openness)]
      const stoffTyp = np === 'plisee' ? 'plissee' : 'netz';
      const stoffCol = stoffTyp === 'plissee' ? plisseeColor : netzColor;
      doors = `<div data-stoff-left style="flex:${1 - openness};display:flex">${stoffDiv(stoffTyp, stoffCol)}</div>
               ${fluegelSingle}
               <div data-empty-right style="flex:${openness}"></div>`;
      canDrag = true;
    } else if (isKombi) {
      // Doppeltür Kombi: 2 Flügel auf einer Schiene, nicht überlappbar mit Rahmen oder einander.
      // leftPos = Position der rechten Kante des linken Flügels (0..1, im Bereich der Türen).
      // rightPos = Position der linken Kante des rechten Flügels (0..1).
      // Doors-Breite (in px) = pxW - 2*frame. Flügel-Anteil = fluegel/doorsW.
      const doorsPx = Math.max(1, pxW - 2 * frame);
      const fluegelRatio = fluegel / doorsPx;
      const minPos = fluegelRatio;             // linker Flügel kann nicht weiter links
      const maxPos = 1 - fluegelRatio;         // rechter Flügel kann nicht weiter rechts
      const leftPos  = Math.max(minPos, Math.min(maxPos, so.leftPos  ?? 0.5));
      const rightPos = Math.max(minPos, Math.min(maxPos, so.rightPos ?? 0.5));
      doors = `<div style="flex:1;position:relative" data-kombi="1" data-fluegel-ratio="${fluegelRatio}">
        <div data-stoff-left style="position:absolute;left:0;top:0;bottom:0;width:${leftPos*100}%;display:flex;box-shadow:inset 2px 0 4px rgba(0,0,0,0.15)">${stoffDiv('netz', netzColor)}</div>
        <div data-stoff-right style="position:absolute;right:0;top:0;bottom:0;width:${(1-rightPos)*100}%;display:flex;box-shadow:inset -2px 0 4px rgba(0,0,0,0.15)">${stoffDiv('plissee', plisseeColor)}</div>
        <div data-left-wing style="position:absolute;top:0;bottom:0;left:calc(${leftPos*100}% - ${fluegel}px);width:${fluegel}px;background:${profilGradV};z-index:4;box-shadow:1px 0 2px rgba(0,0,0,0.3)"></div>
        <div data-right-wing style="position:absolute;top:0;bottom:0;left:${rightPos*100}%;width:${fluegel}px;background:${profilGradV};z-index:4;box-shadow:-1px 0 2px rgba(0,0,0,0.3)"></div>
      </div>`;
      canDrag = true;
    } else {
      // Doppeltür normal: beide Seiten gleiches Material, Flügel öffnen nach außen
      const stoffTyp = np === 'plisee' ? 'plissee' : 'netz';
      const stoffCol = stoffTyp === 'plissee' ? plisseeColor : netzColor;
      const fL = (1 - leftOpen) / 2;
      const fR = (1 - rightOpen) / 2;
      const fMid = (leftOpen + rightOpen) / 2;
      doors = `<div data-stoff-left style="flex:${fL};display:flex">${stoffDiv(stoffTyp, stoffCol)}</div>
               ${fluegelSingle}
               <div data-empty-mid style="flex:${fMid}"></div>
               ${fluegelSingle}
               <div data-stoff-right style="flex:${fR};display:flex">${stoffDiv(stoffTyp, stoffCol)}</div>`;
      canDrag = true;
    }

    function eckeDiv(pos) {
      const isTop = pos.startsWith('t'), isLeft = pos.endsWith('l');
      const radius = isTop ? (isLeft ? '0 0 4px 0' : '0 0 0 4px') : (isLeft ? '0 4px 0 0' : '4px 0 0 0');
      const holeTop = isTop ? '30%' : '70%';
      return `<div style="position:absolute;${isTop?'top':'bottom'}:0;${isLeft?'left':'right'}:0;width:${eckeW}px;height:${frame}px;background:${ecke.base};border-radius:${radius};z-index:5">
        <div style="position:absolute;top:${holeTop};left:50%;width:50%;height:25%;border-radius:50%;background:${ecke.hole};transform:translate(-50%,-50%);opacity:0.7"></div>
      </div>`;
    }

    const dragHint = canDrag
      ? `<div style="position:absolute;left:50%;bottom:6px;transform:translateX(-50%);font-size:10px;color:rgba(255,255,255,0.7);background:rgba(0,0,0,0.4);padding:2px 8px;border-radius:6px;pointer-events:none;letter-spacing:0.04em;z-index:6">↔ Flügel verschieben</div>`
      : '';
    // v1.37: Fenster-Hintergrund — Himmel mit leichten Wolken + Wiese.
    // Wolken sind sanfte radiale Gradients über dem Himmel-Bereich.
    const windowBg = `
        radial-gradient(ellipse 60% 18% at 25% 15%, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0) 70%),
        radial-gradient(ellipse 45% 12% at 75% 25%, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0) 70%),
        radial-gradient(ellipse 35% 10% at 55% 8%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 70%),
        radial-gradient(ellipse 30% 9% at 12% 32%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 70%),
        linear-gradient(180deg,
          #b8dcf5 0%,
          #d9eaf6 35%,
          #a8c97a 55%,
          #7fb050 70%,
          #5a8f3a 100%
        )`;
    return `<div class="config-product${canDrag?' config-draggable':''}" data-can-drag="${canDrag?'1':'0'}" style="position:relative;width:${pxW}px;height:${pxH}px;margin:0 auto;filter:drop-shadow(0 4px 10px rgba(0,0,0,0.15));${canDrag?'cursor:ew-resize;user-select:none;touch-action:none':''}">
      <div style="position:absolute;inset:0;display:flex;flex-direction:column">
        <div style="height:${frame}px;background:${profilGradH}"></div>
        <div style="flex:1;display:flex">
          <div style="width:${frame}px;background:${profilGradV}"></div>
          <div style="flex:1;display:flex;background:${windowBg};position:relative;overflow:hidden" data-doors="1">${doors}</div>
          <div style="width:${frame}px;background:${profilGradV}"></div>
        </div>
        <div style="height:${frame}px;background:${profilGradH}"></div>
      </div>
      ${eckeDiv('tl')}${eckeDiv('tr')}${eckeDiv('bl')}${eckeDiv('br')}
      ${dragHint}
    </div>`;
  }

  // Drag-Handler für Flügel-Position (Event-Delegation am Document)
  // Doppeltür: linke Hälfte des Drags = linker Flügel öffnen/schließen, rechts = rechter Flügel
  // Einzeltür: 1 Flügel, gleitet von rechts (geschlossen) nach links (offen)
  (function setupConfigDrag(){
    if (window._configDragInit) return;
    window._configDragInit = true;
    let dragging = false, mode = '';
    let activeWrap = null, doorsRect = null;
    document.addEventListener('pointerdown', function(e) {
      const product = e.target.closest && e.target.closest('.config-draggable');
      if (!product) return;
      activeWrap = product.closest('[data-config-preview]');
      const doors = product.querySelector('[data-doors]');
      if (!doors) return;
      doorsRect = doors.getBoundingClientRect();
      const x01 = (e.clientX - doorsRect.left) / doorsRect.width;
      // Türart über DOM erkennen
      const hasKombi = !!product.querySelector('[data-kombi]');
      const hasMid = !!product.querySelector('[data-empty-mid]');
      if (hasKombi) {
        // Kombi: linke Hälfte = leftPos drag, rechte Hälfte = rightPos drag
        mode = x01 < 0.5 ? 'kombi-left' : 'kombi-right';
      } else if (hasMid) {
        mode = x01 < 0.5 ? 'left' : 'right';
      } else {
        mode = 'einzel';
      }
      dragging = true;
      e.preventDefault();
      updateDrag(e.clientX);
    });
    document.addEventListener('pointermove', function(e) {
      if (!dragging) return;
      updateDrag(e.clientX);
    });
    function updateDrag(clientX) {
      if (!activeWrap || !doorsRect) return;
      const product = activeWrap.querySelector('.config-draggable');
      if (!product) return;
      const x01 = Math.max(0, Math.min(1, (clientX - doorsRect.left) / doorsRect.width));
      activeWrap._splitState = activeWrap._splitState || {};
      const st = activeWrap._splitState;
      if (mode === 'einzel') {
        st.openness = Math.max(0, Math.min(1, 1 - x01));
      } else if (mode === 'kombi-left' || mode === 'kombi-right') {
        // Clamp an Rahmen-Grenzen: Flügel dürfen nicht über den Rahmen ragen
        const kombi = product.querySelector('[data-kombi]');
        const fluegelRatio = parseFloat(kombi?.dataset.fluegelRatio || '0.05');
        const minPos = fluegelRatio;
        const maxPos = 1 - fluegelRatio;
        const newPos = Math.max(minPos, Math.min(maxPos, x01));
        if (mode === 'kombi-left') {
          st.leftPos = newPos;
          if (newPos > (st.rightPos ?? 0.5)) st.rightPos = newPos; // schiebt rechten mit
        } else {
          st.rightPos = newPos;
          if (newPos < (st.leftPos ?? 0.5)) st.leftPos = newPos; // schiebt linken mit
        }
      } else if (mode === 'left') {
        st.leftOpen = Math.max(0, Math.min(1, (0.5 - x01) * 2));
      } else if (mode === 'right') {
        st.rightOpen = Math.max(0, Math.min(1, (x01 - 0.5) * 2));
      }
      applyState(product, st);
    }
    function applyState(product, st) {
      const left = product.querySelector('[data-stoff-left]');
      const right = product.querySelector('[data-stoff-right]');
      const mid = product.querySelector('[data-empty-mid]');
      const emptyR = product.querySelector('[data-empty-right]');
      const kombi = product.querySelector('[data-kombi]');
      if (kombi) {
        const lp = st.leftPos  ?? 0.5;
        const rp = st.rightPos ?? 0.5;
        const lw = product.querySelector('[data-left-wing]');
        const rw = product.querySelector('[data-right-wing]');
        const fluegelW = lw ? parseFloat(lw.style.width) : 0;
        if (left)  left.style.width  = `${lp * 100}%`;
        if (right) right.style.width = `${(1 - rp) * 100}%`;
        if (lw) lw.style.left = `calc(${lp * 100}% - ${fluegelW}px)`;
        if (rw) rw.style.left = `${rp * 100}%`;
      } else if (mid) {
        const lo = st.leftOpen ?? 0;
        const ro = st.rightOpen ?? 0;
        if (left) left.style.flex = String((1 - lo) / 2);
        if (right) right.style.flex = String((1 - ro) / 2);
        mid.style.flex = String((lo + ro) / 2);
      } else if (emptyR) {
        const op = st.openness ?? 0;
        if (left) left.style.flex = String(1 - op);
        emptyR.style.flex = String(op);
      }
    }
    function endDrag() { dragging = false; activeWrap = null; }
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
  })();
  // Webshop-Kurzbeschreibung formatieren: * am Anfang jeder Zeile → Bullet,
  // \n und * werden zu Listen-Items. Inline-* (mitten im Satz) bleibt unverändert.
  function formatShortDescription(raw) {
    if (!raw) return '';
    // Erst nach echten Zeilenumbrüchen splitten, dann nach " * " (Inline-Bullets)
    const lines = raw.split(/\n+/).flatMap(l => l.split(/\s\*\s+/));
    const items = lines.map(s => s.replace(/^\s*\*\s*/, '').trim()).filter(Boolean);
    if (items.length <= 1) return escapeHtml(raw).replace(/\n/g, '<br>');
    return '<ul class="model-desc-list">' + items.map(i => `<li>${escapeHtml(i)}</li>`).join('') + '</ul>';
  }

  // Color-Picker für Followup-Farben (Plissee/Netz)
  function renderColorFollowup(measureIdx, fieldKey, label, colors, currentId) {
    const active = (colors || []).filter(c => c.active !== false);
    if (!active.length) return '';
    const chipsHtml = active.map(c => {
      const bg = c.bg || c.hex || '#888';
      const sel = currentId === c.id;
      const isLight = /^#?(?:fff|fefefe|f5|e0e0e0|e8e8e8)/i.test(bg);
      return `
        <div style="text-align:center">
          <button class="color-swatch ${sel ? 'selected' : ''} ${isLight ? 'has-light-bg' : ''}"
                  type="button"
                  style="background:${escapeHtml(bg)};"
                  onclick="app.measureSetVariant(${measureIdx}, '${escapeHtml(fieldKey)}', '${escapeHtml(c.id)}')"
                  aria-label="${escapeHtml(c.name)}"></button>
          <span class="color-swatch-label">${escapeHtml(c.name)}</span>
        </div>`;
    }).join('');
    return `<div class="field" style="background:var(--brand-light);padding:10px 12px;border-radius:8px;margin-top:8px">
      <label class="field-label" style="color:var(--brand);font-size:12px;text-transform:uppercase;letter-spacing:0.04em">↳ ${escapeHtml(label)}</label>
      <div class="color-row">${chipsHtml}</div>
    </div>`;
  }

  function _hexToRgba(hex, alpha) {
    if (typeof hex !== 'string' || !hex.startsWith('#') || hex.length !== 7) return `rgba(60,60,60,${alpha})`;
    const r = parseInt(hex.substr(1,2),16);
    const g = parseInt(hex.substr(3,2),16);
    const b = parseInt(hex.substr(5,2),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  function _shade(hex, percent) {
    if (typeof hex !== 'string' || !hex.startsWith('#') || hex.length !== 7) return hex;
    let r = parseInt(hex.substr(1,2),16);
    let g = parseInt(hex.substr(3,2),16);
    let b = parseInt(hex.substr(5,2),16);
    r = Math.max(0, Math.min(255, r + 255*percent/100));
    g = Math.max(0, Math.min(255, g + 255*percent/100));
    b = Math.max(0, Math.min(255, b + 255*percent/100));
    return '#' + Math.round(r).toString(16).padStart(2,'0') + Math.round(g).toString(16).padStart(2,'0') + Math.round(b).toString(16).padStart(2,'0');
  }

  // ═════════════════════════════════════════════════════════════
  // STARTSEITE
  // ═════════════════════════════════════════════════════════════
  function renderHome() {
    // Hero-Bilder asynchron nachladen — bis dahin zeigt der Slider den Fallback (Pattern + Text).
    setTimeout(loadHeroSlider, 50);
    return `
      <div class="hero fade-in">
        <div class="hero-text">
          <h1 class="hero-title">Fliegengitter <em>nach Maß</em>.<br>Bestellt in 4 Minuten.</h1>
          <p class="hero-sub">
            Konfigurieren Sie Ihr Fliegengitter online — exakt nach Ihren Maßen und Wünschen.
            Abholung in der Filiale.
          </p>

          <div class="hero-features">
            <div class="feature-row">
              <div class="feature-icon"><i class="ti ti-ruler" aria-hidden="true"></i></div>
              <div>Maßanfertigung nach Ihren Wünschen</div>
            </div>
            <div class="feature-row">
              <div class="feature-icon"><i class="ti ti-credit-card" aria-hidden="true"></i></div>
              <div>Sichere Online-Bezahlung — alles vorab erledigt</div>
            </div>
            <div class="feature-row">
              <div class="feature-icon"><i class="ti ti-building-store" aria-hidden="true"></i></div>
              <div>Abholung in unserer Wiener Filiale</div>
            </div>
            <div class="feature-row">
              <div class="feature-icon"><i class="ti ti-mail" aria-hidden="true"></i></div>
              <div>Status-Updates per Email — Sie bleiben informiert</div>
            </div>
          </div>

          <button class="btn btn-primary btn-lg" onclick="app.startConfig()">
            Jetzt konfigurieren <i class="ti ti-arrow-right" aria-hidden="true"></i>
          </button>
        </div>

        <!-- Hero-Slider: leer → Fallback-Pattern, mit Bildern → Auto-Rotation alle 5s -->
        <div class="hero-art" id="heroSlider">
          <div class="hero-fallback">
            <i class="ti ti-grid-pattern" aria-hidden="true"></i>
            <span>Maßanfertigung</span>
          </div>
        </div>
      </div>
    `;
  }

  // Hero-Slider asynchron befüllen — wird beim Render der Startseite getriggert.
  async function loadHeroSlider() {
    const container = document.getElementById('heroSlider');
    if (!container) return;
    try {
      const data = await window.api.getHero();
      const images = (data && data.images) || [];
      if (!images.length) return; // Fallback bleibt
      // Slides aufbauen
      const slidesHtml = images.map((img, i) => `
        <div class="hero-slide${i === 0 ? ' active' : ''}">
          <div class="hero-image" style="background-image:url('${escapeHtml(img.url)}')"></div>
        </div>
      `).join('');
      const dotsHtml = images.length > 1
        ? `<div class="hero-dots">${images.map((_, i) => `<button class="hero-dot${i === 0 ? ' active' : ''}" type="button" aria-label="Bild ${i + 1}" onclick="app.heroGoTo(${i})"></button>`).join('')}</div>`
        : '';
      container.innerHTML = slidesHtml + dotsHtml;
      // Wenn mehr als 1 Bild → Auto-Rotation starten
      if (images.length > 1) {
        window._heroSlideCount = images.length;
        window._heroSlideIndex = 0;
        clearInterval(window._heroSlideTimer);
        window._heroSlideTimer = setInterval(() => {
          const next = (window._heroSlideIndex + 1) % window._heroSlideCount;
          if (typeof app !== 'undefined' && app.heroGoTo) app.heroGoTo(next);
        }, 5000);
      }
    } catch (e) {
      // Bei Fehler: Fallback bleibt sichtbar
      console.warn('[heroSlider]', e);
    }
  }

  // ═════════════════════════════════════════════════════════════
  // STEPPER (gemeinsam für alle Konfigurator-Schritte)
  // ═════════════════════════════════════════════════════════════
  function renderStepper(step) {
    const steps = [
      { n: 1, label: 'Modell' },
      { n: 2, label: 'Maße & Farbe' },
      { n: 3, label: 'Kontakt' },
      { n: 4, label: 'Bezahlung' }
    ];

    const desktop = steps.map((s, i) => {
      const cls = s.n < step ? 'done' : (s.n === step ? 'active' : '');
      const num = s.n < step ? '' : `<span>${s.n}</span>`;
      return `
        <div class="step ${cls}">
          <div class="step-num">${num}</div>
          <span>${s.label}</span>
        </div>
        ${i < steps.length - 1 ? '<div class="step-divider"></div>' : ''}
      `;
    }).join('');

    const mobileDots = steps.map(s =>
      `<div class="progress-dot ${s.n <= step ? 'active' : ''}"></div>`
    ).join('');

    return `
      <div class="stepper">${desktop}</div>
      <div class="progress-bar" style="display:none">${mobileDots}</div>
    `;
  }

  // ═════════════════════════════════════════════════════════════
  // SCHRITT 1: MODELL WÄHLEN
  // ═════════════════════════════════════════════════════════════
  async function renderStep1() {
    const data = await loadShopData();
    const state = window.state.get();

    if (data.models.length === 0) {
      return `
        ${renderStepper(1)}
        <div class="card">
          <div class="banner banner-warn">
            <i class="ti ti-alert-triangle" aria-hidden="true"></i>
            <div>
              <strong>Aktuell sind keine Modelle online verfügbar.</strong><br>
              Bitte besuchen Sie uns in der Filiale oder rufen Sie uns an: ${window.SHOP_CONFIG.company.phone}
            </div>
          </div>
        </div>
      `;
    }

    const iconMap = {
      'klassik': 'ti-frame',
      'spannrahmen': 'ti-frame',
      'drehtuer': 'ti-door',
      'schiebetuer': 'ti-arrows-horizontal',
      'rollo': 'ti-arrows-vertical',
      'plissee': 'ti-stack-2'
    };

    const modelsHtml = data.models.map(m => {
      const iconKey = m.id.toLowerCase();
      const icon = Object.keys(iconMap).find(k => iconKey.includes(k));
      const iconName = icon ? iconMap[icon] : 'ti-frame';
      const selected = state.modelId === m.id;
      const firstImage = (m.images && m.images.length > 0) ? m.images[0].url : null;
      // Wenn ein Bild vorhanden ist, zeigen wir es statt des Icons.
      const visualHtml = firstImage
        ? `<div class="model-thumb" style="background:url('${escapeHtml(firstImage)}') center/cover no-repeat"></div>`
        : `<div class="model-icon"><i class="ti ${iconName}" aria-hidden="true"></i></div>`;
      return `
        <button class="model-card ${selected ? 'selected' : ''}" type="button" onclick="app.selectModel('${escapeHtml(m.id)}')">
          ${visualHtml}
          <div class="model-info">
            <div class="model-name">${escapeHtml(m.name)}</div>
            <div class="model-price">ab ${eur(m.sqmPrice)}/m²</div>
            ${m.shortDescription ? `<div class="model-desc">${formatShortDescription(m.shortDescription)}</div>` : ''}
          </div>
        </button>
      `;
    }).join('');

    return `
      ${renderStepper(1)}
      <div class="card fade-in">
        <h2 class="card-title">Welches Modell möchten Sie?</h2>
        <p style="font-size:13px;color:var(--text-muted);margin:0 0 18px">
          Wählen Sie das passende Fliegengitter für Ihr Fenster oder Ihre Tür.
          Aktuell online verfügbar: ${data.models.length} Modell${data.models.length === 1 ? '' : 'e'}.
        </p>
        <div class="model-grid">${modelsHtml}</div>
        <button class="btn btn-primary" onclick="app.next()" ${!state.modelId ? 'disabled' : ''}>
          Weiter <i class="ti ti-arrow-right" aria-hidden="true"></i>
        </button>
      </div>
    `;
  }

  // ═════════════════════════════════════════════════════════════
  // SCHRITT 2: MASSE & FARBE  (Multi-Positions)
  // ═════════════════════════════════════════════════════════════

  // Rechte Spalte: alle Positionen in Listenform + Gesamtsumme.
  function renderStep2SummaryCard(state, m, hasTuerart, total) {
    const measures = state.measures || [];
    const rows = measures.map((mm, i) => {
      const p = calcMeasurePrice(mm, m);
      const detail = `${fmtCm(mm.breite)}×${fmtCm(mm.hoehe)} cm${mm.stueck > 1 ? ' · ' + mm.stueck + ' Stk' : ''}${mm.farbe ? ' · ' + escapeHtml(mm.farbe) : ''}${mm.doppeltuer ? ' · Doppel' : ''}`;
      return `
        <div class="summary-row" style="align-items:flex-start;gap:8px">
          <span style="flex:1">
            <strong style="color:var(--text)">Position ${i + 1}</strong><br>
            <span style="font-size:12px;color:var(--text-muted)">${detail}</span>
          </span>
          <span style="white-space:nowrap;font-weight:600">${p ? eur(p.gross) : '—'}</span>
        </div>`;
    }).join('');

    return `
      <div class="card">
        <h3 class="card-title" style="font-size:15px;margin-bottom:14px">Ihre Konfiguration</h3>
        <div class="summary-row muted"><span>Modell</span><span>${escapeHtml(m.name)}</span></div>
        ${rows}
        ${total ? `
          <div class="price-box">
            <div class="price-label">Live-Preis (inkl. 20% MwSt)</div>
            <div class="price-value">${eur(total.gross)}</div>
            <div class="price-detail">${(total.billSqm).toFixed(2)} m² gesamt</div>
            <div class="price-detail" style="font-size:12px;opacity:0.75;margin-top:2px">Mindestberechnung 1 m² pro Stück</div>
          </div>
        ` : ''}
        <button class="btn btn-primary" onclick="app.next()">
          Weiter zu Kontaktdaten <i class="ti ti-arrow-right" aria-hidden="true"></i>
        </button>
        <button class="btn btn-text" onclick="app.prev()">← Modell ändern</button>
      </div>
    `;
  }

  // Live-Update der rechten Summary OHNE die Inputs neu zu rendern (Fokus-
  // Schutz beim Tippen in Breite/Höhe/Bemerkung). Aktualisiert auch die
  // mini-Skizze + Maß-Labels der jeweiligen Position inline.
  function updateStep2Summary(measureIdx) {
    const state = window.state.get();
    const m = state.modelData;
    if (!m) return;

    // Rechte Summary-Spalte neu zeichnen.
    const container = document.getElementById('step2-summary');
    if (container) {
      const hasTuerart = (m.variantIds || []).includes('tuerart');
      const total = calcOrderTotal(state);
      container.innerHTML = renderStep2SummaryCard(state, m, hasTuerart, total);
    }

    // Konfigurator-Vorschau + Maß-Labels der bearbeiteten Position aktualisieren.
    if (typeof measureIdx === 'number') {
      const mm = state.measures[measureIdx];
      if (!mm) return;
      const wrap = document.querySelector(`[data-config-preview="${measureIdx}"]`);
      if (wrap) {
        // Behalte aktuelle Split-Position beim Re-Render
        const st = wrap._splitState;
        wrap.innerHTML = renderProductPreview(mm, st);
      }
      const dimH = document.querySelector(`[data-measure="${measureIdx}"] .preview-dim-height strong`);
      if (dimH) dimH.textContent = `${fmtCm(mm.hoehe)} cm`;
      const dimW = document.querySelector(`[data-measure="${measureIdx}"] .preview-dim-width strong`);
      if (dimW) dimW.textContent = `${fmtCm(mm.breite)} cm`;
    }
  }

  // Rendert eine einzelne Position (Maße/Farbe/Türart/Varianten/Bemerkung).
  function renderMeasureCard(idx, mm, m, colorsForModel, otherVariants, variantsFromCache, isOnlyOne) {
    const lim = m.measureLimits;
    const hasTuerart = (m.variantIds || []).includes('tuerart');

    const selectedColor = (cache.colors || []).find(c => c.name === mm.farbe);
    const frameBg = selectedColor && (selectedColor.bg || selectedColor.hex);
    const frameStyle =
      `width:${Math.min(200, mm.breite * 1.2)}px;` +
      `height:${Math.min(140, mm.hoehe * 0.9)}px;` +
      (frameBg ? `--frame-color:${frameBg};` : '');

    const colorsHtml = colorsForModel.map(c => {
      const bg = c.bg || c.hex;
      const isLight = bg && /^#?(?:fff|fefefe|f5f5f5|eee|e0e0e0)/i.test(bg);
      const selected = mm.farbe === c.name;
      return `
        <div style="text-align:center">
          <button class="color-swatch ${selected ? 'selected' : ''} ${isLight ? 'has-light-bg' : ''}"
                  type="button"
                  style="background:${escapeHtml(bg || '#888')};"
                  onclick="app.measureSetField(${idx}, 'farbe', '${escapeHtml(c.name)}')"
                  aria-label="${escapeHtml(c.name)}"></button>
          <span class="color-swatch-label">${escapeHtml(c.name)}</span>
        </div>
      `;
    }).join('');

    // v1.39: Wenn aktuell gewählte Netz/Plissee-Option nurDoppeltuer hat (z.B. Kombi),
    // Türart-Auswahl auf Doppeltür sperren — Einzeltür für dieses Maß nicht möglich.
    const npVariantObj = variantsFromCache.find(v => v.id === 'netz_plissee');
    const currentNpOpt = npVariantObj?.options?.find(o => o.id === (mm.variants||{}).netz_plissee);
    const lockToDoppel = !!currentNpOpt?.nurDoppeltuer;
    const tuerartHtml = hasTuerart ? `
      <div class="field">
        <label class="field-label">Türart${lockToDoppel ? ' <span style="font-size:11px;color:var(--text-muted);text-transform:none;letter-spacing:normal;font-weight:400">(automatisch Doppeltür wegen Kombi)</span>' : ''}</label>
        <div class="deposit-row">
          <button class="deposit-chip ${!mm.doppeltuer && !lockToDoppel ? 'selected' : ''}" type="button" ${lockToDoppel ? 'disabled style="opacity:0.4;cursor:not-allowed"' : `onclick="app.measureSetField(${idx}, 'doppeltuer', false)"`}>Einzeltür</button>
          <button class="deposit-chip ${(mm.doppeltuer || lockToDoppel) ? 'selected' : ''}" type="button" onclick="app.measureSetField(${idx}, 'doppeltuer', true)">Doppeltür</button>
        </div>
      </div>
    ` : '';

    const variantsHtml = otherVariants.map(vid => {
      const variant = variantsFromCache.find(v => v.id === vid);
      if (!variant || !Array.isArray(variant.options)) return '';
      const displayName = variant.displayName || variant.name || vid;
      const overrides = VARIANT_OPTION_LABEL_OVERRIDES[vid] || {};
      const optionsHtml = variant.options.map(opt => {
        // Lookup über ID ODER Label (case-insensitive). Firestore-IDs sind
        // historisch gewachsen (z.B. „einzeltuer" für „Nein"), das Label
        // ist die zuverlässigere Brücke zum Override.
        const idKey = String(opt.id || '').toLowerCase();
        const labelKey = String(opt.label || '').toLowerCase();
        const label = overrides[idKey] || overrides[labelKey] || opt.label;
        return `<option value="${escapeHtml(opt.id)}" ${(mm.variants || {})[vid] === opt.id ? 'selected' : ''}>${escapeHtml(label)}</option>`;
      }).join('');
      // Hint-Inhalt wird ins Info-Modal verschoben — der Inline-Block raubt
      // sonst auf jeder Position viel Platz. Stattdessen ein kleiner Link
      // „Was ist das?" neben dem Feld-Label.
      const fromDb = variant.description;
      const fromCode = VARIANT_HINTS[vid];
      const hasHint = !!(fromDb || fromCode);
      // Followup-Farben: wenn aktuelle Option plisseeFollowup oder netzFollowup hat
      const currentOpt = (variant.options || []).find(o => o.id === (mm.variants || {})[vid]);
      let followupHtml = '';
      if (currentOpt) {
        if (currentOpt.plisseeFollowup) {
          followupHtml += renderColorFollowup(idx, 'plisseeFarbe', 'Plissee-Stoff-Farbe', cache.plisseeColors || [], mm.variants?.plisseeFarbe);
        }
        if (currentOpt.netzFollowup) {
          followupHtml += renderColorFollowup(idx, 'netzFarbe', 'Netz-Farbe', cache.netzColors || [], mm.variants?.netzFarbe);
        }
      }
      return `
        <div class="field">
          <label class="field-label">
            ${escapeHtml(displayName)}
            ${hasHint ? `<button type="button" class="field-info-link" onclick="window.views.openVariantInfo('${escapeHtml(vid)}', '${escapeHtml(displayName)}')">Was ist das?</button>` : ''}
          </label>
          <select class="field-select" onchange="app.measureSetVariant(${idx}, '${escapeHtml(vid)}', this.value)">
            <option value="">Bitte wählen…</option>
            ${optionsHtml}
          </select>
        </div>
        ${followupHtml}
      `;
    }).join('');

    return `
      <div class="measure-card" data-measure="${idx}">
        <div class="measure-header">
          <span class="measure-num">Position ${idx + 1}</span>
          ${!isOnlyOne ? `<button class="measure-remove" type="button" onclick="app.removeMeasure(${idx})" aria-label="Position entfernen">× entfernen</button>` : ''}
        </div>

        <div class="preview-box" style="margin-bottom:18px">
          <div class="preview-stage">
            <div class="config-preview-wrap" data-config-preview="${idx}">
              ${renderProductPreview(mm)}
            </div>
            <div class="preview-dim preview-dim-height">Höhe<br><strong>${fmtCm(mm.hoehe)} cm</strong></div>
          </div>
          <div class="preview-dim preview-dim-width">Breite: <strong>${fmtCm(mm.breite)} cm</strong></div>
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field-label">Breite</label>
            <div class="input-suffix-wrap">
              <input class="field-input" type="number" min="${lim.minBreite}" max="${lim.maxBreite}"
                     step="0.1" inputmode="decimal"
                     value="${mm.breite}"
                     onwheel="this.blur()"
                     oninput="app.measureSetField(${idx}, 'breite', parseFloat(String(this.value).replace(',', '.'))||0)">
              <span class="input-suffix">cm</span>
            </div>
            <div class="field-hint"><i class="ti ti-info-circle" aria-hidden="true"></i>${lim.minBreite}–${lim.maxBreite} cm (Dezimalstellen erlaubt, z.B. 100,3)</div>
          </div>
          <div class="field">
            <label class="field-label">Höhe</label>
            <div class="input-suffix-wrap">
              <input class="field-input" type="number" min="${lim.minHoehe}" max="${lim.maxHoehe}"
                     step="0.1" inputmode="decimal"
                     value="${mm.hoehe}"
                     onwheel="this.blur()"
                     oninput="app.measureSetField(${idx}, 'hoehe', parseFloat(String(this.value).replace(',', '.'))||0)">
              <span class="input-suffix">cm</span>
            </div>
            <div class="field-hint"><i class="ti ti-info-circle" aria-hidden="true"></i>${lim.minHoehe}–${lim.maxHoehe} cm (Dezimalstellen erlaubt, z.B. 100,3)</div>
          </div>
        </div>

        <div class="field">
          <label class="field-label">Stückzahl</label>
          <div class="qty-row">
            <button class="qty-btn" type="button" onclick="app.measureSetField(${idx}, 'stueck', Math.max(1, state.get().measures[${idx}].stueck - 1))">−</button>
            <div class="qty-val">${mm.stueck}</div>
            <button class="qty-btn" type="button" onclick="app.measureSetField(${idx}, 'stueck', Math.min(${window.SHOP_CONFIG.validation.maxStueckPerMass}, state.get().measures[${idx}].stueck + 1))">+</button>
          </div>
        </div>

        ${tuerartHtml}

        <div class="field">
          <label class="field-label">Farbe</label>
          <div class="color-row">${colorsHtml || '<div style="font-size:13px;color:var(--text-muted)">Standard: ' + escapeHtml(m.defaultColor) + '</div>'}</div>
        </div>

        ${variantsHtml}

        <div class="field">
          <label class="field-label">Anmerkungen (optional)</label>
          <textarea class="field-textarea" rows="2"
                    placeholder="z.B. besondere Wünsche, spezielles Einbau-Detail…"
                    oninput="app.measureSetField(${idx}, 'bemerkung', this.value)">${escapeHtml(mm.bemerkung || '')}</textarea>
        </div>
      </div>
    `;
  }

  async function renderStep2() {
    const data = await loadShopData();
    const state = window.state.get();

    if (!state.modelData) {
      app.goToStep(1);
      return '<div class="loader"><div class="loader-spinner"></div>Lade...</div>';
    }

    const m = state.modelData;

    // Farben (nur die im Modell aktivierten)
    const availableColorIds = m.availableColors || [];
    const colorsForModel = data.colors.filter(c =>
      c.active !== false &&  // inaktive Farben (z.B. Test-Farbe) nie anzeigen
      (availableColorIds.length === 0 || availableColorIds.includes(c.id))
    );

    const hasTuerart = (m.variantIds || []).includes('tuerart');
    const otherVariants = (m.variantIds || []).filter(vid => vid !== 'tuerart');

    // Galerie wie gehabt (Modell-Bilder).
    const images = m.images || [];
    const galleryHtml = images.length > 0 ? `
      <div class="card model-gallery" id="modelGallery">
        <div class="gallery-main" onclick="app.openLightbox()" title="Vergrößern">
          <img id="galleryMain" src="${escapeHtml(images[0].url)}" alt="${escapeHtml(m.name)}">
        </div>
        ${images.length > 1 ? `
          <div class="gallery-thumbs">
            ${images.map((img, i) => `
              <button type="button" class="gallery-thumb ${i === 0 ? 'active' : ''}" onclick="app.selectGalleryImage(${i})" aria-label="Bild ${i + 1}">
                <img src="${escapeHtml(img.url)}" alt="">
              </button>
            `).join('')}
          </div>` : ''}
      </div>
    ` : '';
    window._galleryImages = images;

    const measures = state.measures || [];
    const onlyOne = measures.length <= 1;
    const measuresHtml = measures.map((mm, i) =>
      renderMeasureCard(i, mm, m, colorsForModel, otherVariants, data.variants, onlyOne)
    ).join('');

    const total = calcOrderTotal(state);

    return `
      ${renderStepper(2)}
      <div class="config-grid fade-in">
        <div class="card">
          ${galleryHtml}
          <h2 class="card-title">${escapeHtml(m.name)} — Maße & Farbe</h2>

          ${measuresHtml}

          <button class="btn btn-secondary measure-add" type="button" onclick="app.addMeasure()">
            <i class="ti ti-plus" aria-hidden="true"></i> Weitere Position hinzufügen
          </button>
        </div>

        <div class="config-summary" id="step2-summary">
          ${renderStep2SummaryCard(state, m, hasTuerart, total)}
        </div>
      </div>
    `;
  }

  // ═════════════════════════════════════════════════════════════
  // SCHRITT 3: KONTAKT
  // ═════════════════════════════════════════════════════════════
  async function renderStep3() {
    const state = window.state.get();
    const m = state.modelData;
    const price = calcPrice(state);

    return `
      ${renderStepper(3)}
      <div class="config-grid fade-in">
        <div class="card">
          <h2 class="card-title">Ihre Kontaktdaten</h2>
          <p style="font-size:13px;color:var(--text-muted);margin:0 0 18px">
            Wir benötigen Ihre Daten für die Bestellbestätigung und Status-Updates per Email.
          </p>

          <div class="field-row">
            <div class="field">
              <label class="field-label">Vorname *</label>
              <input class="field-input" type="text" value="${escapeHtml(state.vorname)}"
                     oninput="app.setNameField(this, 'vorname')" autocomplete="given-name" required>
            </div>
            <div class="field">
              <label class="field-label">Nachname *</label>
              <input class="field-input" type="text" value="${escapeHtml(state.nachname)}"
                     oninput="app.setNameField(this, 'nachname')" autocomplete="family-name" required>
            </div>
          </div>

          <div class="field">
            <label class="field-label">Telefon *</label>
            <div class="phone-row">
              <select class="phone-vorwahl" id="phoneVorwahl" onchange="app.setPhoneVorwahl(this.value)">
                ${['+43','+49','+41','+90','+421','+420','+387','+385','+381','+48','+44','+40','+39','+36'].map(vw =>
                  `<option value="${vw}" ${state.telefonVorwahl === vw ? 'selected' : ''}>${vw}</option>`
                ).join('')}
              </select>
              <input class="field-input phone-nummer" type="tel" id="phoneNummer"
                     value="${escapeHtml(state.telefonNummer)}"
                     placeholder="660 1234567"
                     oninput="app.setPhoneNummer(this.value)"
                     inputmode="tel" required>
            </div>
            <div class="field-hint"><i class="ti ti-brand-whatsapp" aria-hidden="true"></i>Wir kontaktieren Sie nur bei Rückfragen zur Bestellung</div>
          </div>

          <div class="field">
            <label class="field-label">Email *</label>
            <input class="field-input" type="email" value="${escapeHtml(state.email)}"
                   placeholder="ihre@email.at"
                   oninput="app.setField('email', this.value)" required>
            <div class="field-hint"><i class="ti ti-mail" aria-hidden="true"></i>Hier bekommen Sie Bestätigung, Rechnung und Status-Updates</div>
          </div>

          <div class="banner banner-info" style="margin-top:18px">
            <i class="ti ti-shield-check" aria-hidden="true"></i>
            <div>Ihre Daten werden nur für die Bestellabwicklung verwendet. Keine Newsletter, keine Weitergabe.</div>
          </div>
        </div>

        <div class="config-summary">
          <div class="card">
            <h3 class="card-title" style="font-size:15px">Bestellübersicht</h3>
            <div class="summary-row muted"><span>${escapeHtml(m.name)}</span><span></span></div>
            ${(state.measures || []).map((mm, i) => {
              const pp = calcMeasurePrice(mm, m);
              return `
                <div class="summary-row" style="align-items:flex-start;gap:8px">
                  <span style="flex:1">
                    <strong style="color:var(--text)">Position ${i + 1}</strong><br>
                    <span style="font-size:12px;color:var(--text-muted)">${fmtCm(mm.breite)}×${fmtCm(mm.hoehe)} cm${mm.stueck > 1 ? ' · ' + mm.stueck + ' Stk' : ''}${mm.farbe ? ' · ' + escapeHtml(mm.farbe) : ''}${mm.doppeltuer ? ' · Doppel' : ''}</span>
                  </span>
                  <span style="white-space:nowrap;font-weight:600">${pp ? eur(pp.gross) : '—'}</span>
                </div>`;
            }).join('')}
            ${price ? `
              <div class="price-box">
                <div class="price-label">Gesamtpreis</div>
                <div class="price-value">${eur(price.gross)}</div>
                <div class="price-detail">inkl. 20% MwSt</div>
              </div>
            ` : ''}
            <button class="btn btn-primary" onclick="app.next()">
              Weiter zur Bezahlung <i class="ti ti-arrow-right" aria-hidden="true"></i>
            </button>
            <button class="btn btn-text" onclick="app.prev()">← Zurück</button>
          </div>
        </div>
      </div>
    `;
  }

  // ═════════════════════════════════════════════════════════════
  // SCHRITT 4: BEZAHLUNG (immer voller Betrag — keine Anzahlung mehr)
  // ═════════════════════════════════════════════════════════════
  async function renderStep4() {
    const state = window.state.get();
    const m = state.modelData;
    const price = calcPrice(state);
    if (!price) {
      app.goToStep(1);
      return '';
    }

    // Voraussichtliche Fertigstellung holen — wenn Backend keine Daten hat
    // oder Fehler wirft, blenden wir den Block einfach aus.
    let fristHtml = '';
    try {
      const totalStueck = (state.measures || []).reduce((s, mm) => s + (mm.stueck || 1), 0);
      const ec = await window.api.getEstimatedCompletion(totalStueck || 1);
      if (ec && ec.valid) {
        fristHtml = `
          <div class="banner banner-info" style="margin-top:14px;padding:12px 14px;font-size:13px">
            <i class="ti ti-calendar-event" aria-hidden="true"></i>
            <div>
              <strong>Voraussichtliche Fertigstellung</strong><br>
              ${escapeHtml(formatFristRange(ec.from, ec.to))}
              <div style="font-size:12px;color:var(--text-muted);margin-top:6px">
                Sie werden per WhatsApp und Email benachrichtigt, sobald Ihre Bestellung fertig ist.
              </div>
            </div>
          </div>`;
      }
    } catch (e) {
      // bewusst still — UX nicht durch Frist-Fehler kaputtmachen
      console.warn('[estimated-completion]', e);
    }

    return `
      ${renderStepper(4)}
      <div class="config-grid fade-in">
        <div class="card">
          <h2 class="card-title">Bestellung prüfen & bezahlen</h2>

          <!-- Pflicht-Übersicht laut § 8 KSchG (FAGG): Hauptmerkmale + Gesamtpreis + Liefer-/Zahlungsmodalitäten -->
          <div style="background:var(--bg-secondary,#f9fafb);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:18px">
            <div style="font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:10px">Ihre Bestellung</div>

            <div style="font-size:14px;color:var(--text);margin-bottom:10px">
              <strong>${escapeHtml(m.name)}</strong> — Maßanfertigung
            </div>

            ${(state.measures || []).map((mm, i) => {
              const pp = calcMeasurePrice(mm, m);
              return `
                <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;margin-bottom:6px;padding:6px 0;border-bottom:1px solid var(--border-light)">
                  <div style="font-size:13px;color:var(--text)">
                    <strong>Position ${i + 1}</strong>
                    <span style="display:block;font-size:12px;color:var(--text-muted);margin-top:2px">
                      ${fmtCm(mm.breite)} × ${fmtCm(mm.hoehe)} cm · ${mm.stueck} Stk · Farbe: ${escapeHtml(mm.farbe || '—')}${mm.doppeltuer ? ' · Doppeltür' : ''}
                    </span>
                  </div>
                  <div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap">${pp ? eur(pp.gross) : '—'}</div>
                </div>`;
            }).join('')}

            <div style="margin-top:12px;padding-top:10px;font-size:13px;color:var(--text)">
              <div style="display:flex;justify-content:space-between"><span>Zwischensumme (netto)</span><span>${eur(price.net)}</span></div>
              <div style="display:flex;justify-content:space-between;color:var(--text-muted)"><span>+ 20% USt</span><span>${eur(price.vat)}</span></div>
              <div style="display:flex;justify-content:space-between;color:var(--text-muted)"><span>Versandkosten</span><span>€ 0,00 (Selbstabholung)</span></div>
              <div style="display:flex;justify-content:space-between;margin-top:6px;padding-top:6px;border-top:1px solid var(--border);font-weight:700;font-size:15px"><span>Gesamtbetrag</span><span>${eur(price.gross)}</span></div>
            </div>
          </div>

          <div style="font-size:13px;color:var(--text);line-height:1.7;margin-bottom:18px">
            <div style="display:flex;gap:10px;margin-bottom:6px">
              <i class="ti ti-shield-check" aria-hidden="true" style="color:var(--brand);flex-shrink:0;margin-top:2px"></i>
              <div><strong>Zahlung:</strong> Sie bezahlen den Gesamtbetrag jetzt sicher online über Stripe (Karte, EPS, Apple Pay, Google Pay) — 256-bit verschlüsselt.</div>
            </div>
            <div style="display:flex;gap:10px;margin-bottom:6px">
              <i class="ti ti-building-store" aria-hidden="true" style="color:var(--brand);flex-shrink:0;margin-top:2px"></i>
              <div><strong>Abholung:</strong> Bella Home GmbH, Oberlaaerstraße 285, 1230 Wien (kostenlos). Sie werden per Email und WhatsApp benachrichtigt, sobald Ihre Bestellung abholbereit ist.</div>
            </div>
            <div style="display:flex;gap:10px;margin-bottom:6px">
              <i class="ti ti-ruler-2" aria-hidden="true" style="color:var(--brand);flex-shrink:0;margin-top:2px"></i>
              <div><strong>Lieferzeit:</strong> Je nach aktueller Auftragslage unterschiedlich — Ihren voraussichtlichen Termin sehen Sie rechts unter „Voraussichtliche Fertigstellung" (schon vor dem Bezahlen).</div>
            </div>
            <div style="display:flex;gap:10px">
              <i class="ti ti-database" aria-hidden="true" style="color:var(--brand);flex-shrink:0;margin-top:2px"></i>
              <div><strong>Speicherung der Bestelldaten:</strong> Ihre Bestellung wird bei uns gespeichert und ist über den Tracking-Link in der Bestätigungs-Email einsehbar. Details siehe <a href="#/datenschutz">Datenschutzerklärung</a>.</div>
            </div>
          </div>

          <div style="margin-top:18px">
            <label class="legal-row">
              <input type="checkbox" ${state.agbAccepted ? 'checked' : ''} onchange="app.setField('agbAccepted', this.checked)">
              <span class="checkbox"></span>
              <span>Ich habe die <a href="#/agb">AGB</a> und die <a href="#/datenschutz">Datenschutzerklärung</a> gelesen und akzeptiere sie.</span>
            </label>
            <label class="legal-row">
              <input type="checkbox" ${state.widerrufAccepted ? 'checked' : ''} onchange="app.setField('widerrufAccepted', this.checked)">
              <span class="checkbox"></span>
              <span><strong>Verzicht auf Rücktrittsrecht (Maßanfertigung):</strong> Ich nehme zur Kenntnis, dass bei dieser Maßanfertigung nach § 18 Abs. 1 Z 3 FAGG <strong>kein 14-tägiges Rücktrittsrecht</strong> besteht und stimme der sofortigen Produktion zu.</span>
            </label>
          </div>
        </div>

        <div class="config-summary">
          <div class="card">
            <div class="price-box">
              <div class="price-label">Zu zahlender Betrag</div>
              <div class="price-value">${eur(price.gross)}</div>
              <div class="price-detail">inkl. 20% MwSt · Selbstabholung</div>
            </div>

            ${fristHtml}

            <button class="btn btn-primary" id="submitBtn" onclick="app.submitOrder()">
              <i class="ti ti-lock" aria-hidden="true"></i> Zahlungspflichtig bestellen
            </button>
            <div class="payment-methods-row" aria-label="Akzeptierte Zahlungsmethoden">
              <span class="pm-pill">Visa</span>
              <span class="pm-pill">Mastercard</span>
              <span class="pm-pill">EPS</span>
              <span class="pm-pill">Apple Pay</span>
              <span class="pm-pill">G Pay</span>
            </div>
            <button class="btn btn-text" onclick="app.prev()">← Zurück</button>
          </div>
        </div>
      </div>
    `;
  }

  // ═════════════════════════════════════════════════════════════
  // ERFOLG nach Bestellung
  // ═════════════════════════════════════════════════════════════
  function renderSuccess(orderResult) {
    // Hinweis: Wird nur noch als Fallback erreicht, wenn die Stripe-Weiterleitung
    // fehlschlägt. Bei erfolgreichem Stripe-Flow geht der Kunde stattdessen
    // direkt auf die Tracking-Seite (siehe success_url in stripe.js).
    return `
      <div class="success-screen fade-in">
        <div class="success-icon"><i class="ti ti-check" aria-hidden="true"></i></div>
        <h1>Bestellung erfolgreich!</h1>
        <p>Vielen Dank für Ihre Bestellung. Sie erhalten in den nächsten Minuten eine Bestätigungs-Email mit der Rechnung.</p>
        ${orderResult.orderNumber ? `<div class="success-order-num">${orderResult.orderNumber}</div>` : ''}

        <div class="banner banner-info" style="margin:24px auto;max-width:480px;text-align:left">
          <i class="ti ti-info-circle" aria-hidden="true"></i>
          <div>
            <strong>So geht es weiter:</strong>
            <ol style="margin:6px 0 0 18px;padding:0;font-size:13px;line-height:1.7">
              <li>Wir bestätigen Ihre Zahlung und beginnen mit der Anfertigung</li>
              <li>Sobald abholbereit, erhalten Sie eine Email</li>
              <li>Abholung in unserer Filiale Wien — keine weiteren Zahlungen nötig</li>
            </ol>
          </div>
        </div>

        <div class="success-actions">
          <a class="btn btn-secondary" href="#/bestellung/${orderResult.trackingToken}">
            <i class="ti ti-package-search" aria-hidden="true"></i> Bestellung verfolgen
          </a>
          <a class="btn btn-text" href="#/">Zur Startseite</a>
        </div>
      </div>
    `;
  }

  // ═════════════════════════════════════════════════════════════
  // BESTELLUNG VERFOLGEN
  // ═════════════════════════════════════════════════════════════
  function renderTrackingLookup() {
    return `
      <div class="card fade-in" style="max-width:520px;margin:32px auto">
        <h2 class="card-title">Bestellung verfolgen</h2>
        <p style="font-size:13px;color:var(--text-muted);margin:0 0 16px">
          Geben Sie Ihre Bestellnummer und die Email-Adresse ein, die Sie bei der Bestellung angegeben haben. Die Bestellnummer finden Sie in der Bestätigungs-Email.
        </p>
        <div class="field">
          <label class="field-label">Bestellnummer</label>
          <input class="field-input" type="text" id="trackOrderNumber" placeholder="z.B. #2026-00150" autocomplete="off">
        </div>
        <div class="field">
          <label class="field-label">Email-Adresse</label>
          <input class="field-input" type="email" id="trackEmail" placeholder="ihre@email.at" autocomplete="email">
        </div>
        <button class="btn btn-primary" onclick="app.lookupTracking()">
          <i class="ti ti-search" aria-hidden="true"></i> Status anzeigen
        </button>
      </div>
    `;
  }

  // Cancel-Seite: wird angezeigt, wenn Kunde Stripe Checkout abbricht
  function renderCancel() {
    return `
      <div class="card fade-in" style="max-width:520px;margin:32px auto;text-align:center">
        <div style="font-size:48px;margin-bottom:12px">↩️</div>
        <h2 class="card-title">Bezahlvorgang abgebrochen</h2>
        <p style="color:var(--text-muted);margin:8px 0 24px;line-height:1.6">
          Sie haben den Zahlvorgang abgebrochen — Ihre Bestellung wurde nicht abgeschlossen.<br>
          Möchten Sie es erneut versuchen?
        </p>
        <div style="display:flex;flex-direction:column;gap:8px">
          <a class="btn btn-primary" href="#/konfigurator">Neu konfigurieren</a>
          <a class="btn btn-text" href="#/">Zur Startseite</a>
        </div>
        <p style="font-size:12px;color:var(--text-muted);margin-top:18px">
          Fragen? <a href="tel:+436602000644">+43 660 200 06 44</a>
        </p>
      </div>
    `;
  }

  function renderTrackingResult(order, trackingToken) {
    const statusOrder = ['Bestellung', 'In Produktion', 'Transport', 'Abholbereit', 'Abgeholt'];
    const currentIdx = statusOrder.indexOf(order.status);

    const stepsHtml = statusOrder.map((s, i) => {
      const cls = i < currentIdx ? 'done' : (i === currentIdx ? 'active' : '');
      const icon = i < currentIdx ? '✓' : (i === currentIdx ? '●' : (i + 1));
      const labelMap = {
        'Bestellung': 'Bestellung eingegangen',
        'In Produktion': 'In Produktion',
        'Transport': 'In Vorbereitung zur Abholung',
        'Abholbereit': 'Abholbereit',
        'Abgeholt': 'Abgeholt'
      };
      // Beruhigungs-Text nur im aktiven Transport-Schritt (Ware fertig, aber noch nicht vor Ort).
      const subtext = (s === 'Transport' && i === currentIdx)
        ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px;line-height:1.45">Deine Bestellung ist fertiggestellt und wird für die Abholung in unserer Filiale bereitgestellt. Bitte warte auf unsere „Abholbereit"-Benachrichtigung, bevor du vorbeikommst — wir melden uns, sobald sie bereitliegt.</div>`
        : '';
      return `
        <div class="tracking-step ${cls}">
          <div class="tracking-dot">${icon}</div>
          <div class="tracking-info">
            <div class="tracking-label">${labelMap[s] || s}</div>
            ${subtext}
          </div>
        </div>
      `;
    }).join('');

    const measuresHtml = (order.measures || []).map(m => `
      <div class="order-item">
        <div class="order-item-icon"><i class="ti ti-frame" aria-hidden="true"></i></div>
        <div class="order-item-info">
          <div class="order-item-name">${escapeHtml(m.modelName || 'Fliegengitter')}</div>
          <div class="order-item-meta">${m.breite}×${m.hoehe} cm · ${escapeHtml(m.farbe || '')} · ${m.stueck || 1} Stk</div>
        </div>
      </div>
    `).join('');

    // Zahlungs-Status hat Vorrang vor allem anderen — wenn Zahlung noch offen,
    // zeigen wir prominent einen Hinweis statt Queue/Frist.
    let paymentBannerHtml = '';
    if (order.paymentStatus === 'pending') {
      const resumeBtn = order.checkoutUrl
        ? `<a class="btn btn-primary" href="${escapeHtml(order.checkoutUrl)}" style="margin-top:10px">Jetzt bezahlen</a>`
        : '';
      paymentBannerHtml = `
        <div class="banner banner-warn" style="margin:18px 0;padding:14px 16px;font-size:13px">
          <i class="ti ti-clock-hour-4" aria-hidden="true"></i>
          <div>
            <strong>Zahlung steht aus</strong><br>
            Wir haben Ihre Bestellung empfangen, aber noch keine Zahlung erhalten. Sobald Ihre Online-Zahlung verbucht ist, beginnen wir mit der Produktion.
            ${resumeBtn}
          </div>
        </div>`;
    } else if (order.paymentStatus === 'expired') {
      paymentBannerHtml = `
        <div class="banner banner-error" style="margin:18px 0;padding:14px 16px;font-size:13px">
          <i class="ti ti-x-circle" aria-hidden="true"></i>
          <div>
            <strong>Zahlung abgelaufen</strong><br>
            Der Bezahl-Vorgang ist abgelaufen. Bitte geben Sie die Bestellung erneut auf oder kontaktieren Sie uns: <a href="tel:+436602000644">+43 660 200 06 44</a>.
          </div>
        </div>`;
    } else if (order.paymentStatus === 'failed') {
      paymentBannerHtml = `
        <div class="banner banner-error" style="margin:18px 0;padding:14px 16px;font-size:13px">
          <i class="ti ti-credit-card-off" aria-hidden="true"></i>
          <div>
            <strong>Zahlung fehlgeschlagen</strong><br>
            Die Bezahlung war nicht erfolgreich (z.B. Karte abgelehnt oder Vorgang abgebrochen). Bitte geben Sie die Bestellung erneut auf oder kontaktieren Sie uns: <a href="tel:+436602000644">+43 660 200 06 44</a>.
          </div>
        </div>`;
    } else if (order.paymentStatus === 'refunded' || order.paymentStatus === 'partial_refund') {
      const fully = order.paymentStatus === 'refunded';
      paymentBannerHtml = `
        <div class="banner banner-info" style="margin:18px 0;padding:14px 16px;font-size:13px">
          <i class="ti ti-receipt-refund" aria-hidden="true"></i>
          <div>
            <strong>${fully ? 'Zahlung erstattet' : 'Teilweise erstattet'}</strong><br>
            ${fully
              ? 'Sie haben Ihre Zahlung vollständig zurückerstattet bekommen. Die Bestellung wurde storniert.'
              : 'Ein Teil Ihrer Zahlung wurde zurückerstattet. Bei Fragen melden Sie sich bitte: <a href="tel:+436602000644">+43 660 200 06 44</a>.'}
          </div>
        </div>`;
    }

    // Zusatzinfo-Banner: Position in der Warteschlange + voraussichtliche Fertigstellung.
    // Position wird nur gezeigt, wenn die Bestellung noch in der "Bestellung"-Spalte ist
    // UND bereits bezahlt (sonst zählt sie eh nicht in der Queue).
    const infoLines = [];
    const isPaid = order.paymentStatus === 'paid' || !order.paymentStatus;
    if (isPaid && order.status === 'Bestellung' && order.queue && order.queue.position) {
      infoLines.push(
        `<div><i class="ti ti-list-numbers" aria-hidden="true"></i> Sie sind auf <strong>Position ${order.queue.position} von ${order.queue.total}</strong> in der Warteschlange.</div>`
      );
    }
    if (isPaid && order.frist && order.status !== 'Abgeholt') {
      infoLines.push(
        `<div><i class="ti ti-calendar-event" aria-hidden="true"></i> Voraussichtliche Fertigstellung: <strong>${escapeHtml(formatFristDate(order.frist))}</strong></div>`
      );
    }
    if (isPaid && order.status !== 'Abgeholt') {
      infoLines.push(
        `<div style="font-size:12px;color:var(--text-muted)">Sie werden per WhatsApp und Email benachrichtigt, sobald Ihre Bestellung fertig ist.</div>`
      );
    }
    const infoHtml = infoLines.length
      ? `<div class="banner banner-info" style="margin:18px 0;padding:14px 16px;display:flex;flex-direction:column;gap:8px;font-size:13px">${infoLines.join('')}</div>`
      : '';

    return `
      <div class="card fade-in" style="max-width:720px;margin:32px auto">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:18px">
          <div>
            <h2 class="card-title" style="margin-bottom:4px">${order.orderNumber ? 'Bestellung ' + escapeHtml(order.orderNumber) : 'Bestellung (Zahlung ausstehend)'}</h2>
            <div style="font-size:13px;color:var(--text-muted)">${escapeHtml(order.vorname || '')} ${escapeHtml(order.nachname || '')}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">Gesamtbetrag</div>
            <div style="font-family:var(--font-display);font-size:22px;font-weight:500;color:var(--brand-dark)">${eur(order.totalGross)}</div>
            ${order.paid ? '<div style="font-size:11px;color:var(--success-text)">vollständig bezahlt</div>' :
              (order.anzahlung > 0 ? `<div style="font-size:11px;color:var(--brand)">Teilzahlung erhalten: ${eur(order.anzahlung)}</div>` : '<div style="font-size:11px;color:var(--text-muted)">Zahlung ausstehend</div>')}
          </div>
        </div>

        ${paymentBannerHtml}

        <div class="tracking-status">${stepsHtml}</div>

        ${infoHtml}

        <h3 style="font-family:var(--font-display);font-size:15px;margin:24px 0 8px">Ihre Bestellung</h3>
        <div class="order-items">${measuresHtml}</div>

        ${order.hasInvoice && trackingToken ? `
          <a class="btn btn-secondary" href="/api/orders/track/${encodeURIComponent(trackingToken)}/invoice" target="_blank" style="margin-top:10px">
            <i class="ti ti-file-download" aria-hidden="true"></i> Rechnung ${escapeHtml(order.invoiceNumber || '')} herunterladen
          </a>` : ''}

        <a class="btn btn-secondary" href="https://wa.me/436602000644?text=${encodeURIComponent('Hallo, ich habe eine Frage zur Bestellung ' + (order.orderNumber || ''))}" target="_blank" style="margin-top:10px">
          <i class="ti ti-brand-whatsapp" aria-hidden="true"></i> Frage zur Bestellung per WhatsApp
        </a>
      </div>
    `;
  }

  // ═════════════════════════════════════════════════════════════
  // STATISCHE SEITEN (Hilfe / Kontakt / Recht)
  // ═════════════════════════════════════════════════════════════
  function renderKontakt() {
    return `
      <div class="card fade-in" style="max-width:600px;margin:24px auto">
        <h2 class="card-title">Kontakt</h2>
        <div style="font-size:14px;line-height:1.8;color:var(--text)">
          <p><strong>Bella Home GmbH</strong><br>
          Oberlaaerstraße 285<br>
          1230 Wien, Österreich</p>

          <p><strong>Telefon / WhatsApp:</strong> <a href="tel:+436602000644">+43 660 200 06 44</a><br>
          <strong>Email:</strong> <a href="mailto:info@bellahome.at">info@bellahome.at</a><br>
          <strong>Web:</strong> www.bellahome.at</p>

          <p><strong>Öffnungszeiten:</strong><br>
          Montag bis Freitag: 09:00–19:00<br>
          Samstag: 09:00–18:00<br>
          Sonn- und Feiertage geschlossen</p>
        </div>
        <a class="btn btn-primary" href="https://wa.me/436602000644" target="_blank">
          <i class="ti ti-brand-whatsapp" aria-hidden="true"></i> WhatsApp öffnen
        </a>
      </div>
    `;
  }

  function renderHilfe() {
    return `
      <div class="card fade-in" style="max-width:720px;margin:24px auto">
        <h2 class="card-title">Häufige Fragen</h2>

        <h3 style="font-family:var(--font-display);font-size:15px;margin:20px 0 6px">Wie messe ich richtig?</h3>
        <p style="font-size:14px;color:var(--text-muted)">Messen Sie immer <strong>innen am Rahmen</strong>, ohne Dichtung. Bei Tippfehlern (z.B. 3775 statt 375 cm) bekommen Sie eine Warnung.</p>

        <h3 style="font-family:var(--font-display);font-size:15px;margin:20px 0 6px">Wie bezahle ich?</h3>
        <p style="font-size:14px;color:var(--text-muted)">Online-Bestellungen werden bei der Bestellung voll bezahlt — sicher über Stripe per Karte, EPS, Apple Pay oder Google Pay. Bei Abholung in der Filiale müssen Sie nichts mehr zahlen.</p>

        <h3 style="font-family:var(--font-display);font-size:15px;margin:20px 0 6px">Wann bekomme ich meine Bestellung?</h3>
        <p style="font-size:14px;color:var(--text-muted)">Sobald Ihre Zahlung eingegangen ist, beginnen wir mit der Anfertigung. Die Fertigstellungszeit ist je nach aktueller Auftragslage unterschiedlich — Ihren voraussichtlichen Termin sehen Sie bei der Bestellung schon vor dem Bezahlen. Sie bekommen eine Email, sobald die Bestellung abholbereit ist.</p>

        <h3 style="font-family:var(--font-display);font-size:15px;margin:20px 0 6px">Kann ich die Bestellung stornieren?</h3>
        <p style="font-size:14px;color:var(--text-muted)">Da es sich um eine Maßanfertigung handelt, ist eine Stornierung nach Produktionsbeginn nicht möglich. Solange wir noch nicht produziert haben (üblich: bis 24 Std nach Zahlungseingang), können Sie die Bestellung telefonisch stornieren — eine Rückerstattung erfolgt direkt auf Ihre Zahlungsmethode.</p>

        <h3 style="font-family:var(--font-display);font-size:15px;margin:20px 0 6px">Wo kann ich abholen?</h3>
        <p style="font-size:14px;color:var(--text-muted)">Aktuell nur in unserer Wiener Filiale: Oberlaaerstraße 285, 1230 Wien. Versand ist derzeit nicht möglich.</p>

        <h3 style="font-family:var(--font-display);font-size:15px;margin:20px 0 6px">Welche Bezahlmethoden gibt es?</h3>
        <p style="font-size:14px;color:var(--text-muted)">Online über Stripe: Visa, Mastercard, EPS, Apple Pay, Google Pay. Alle Zahlungen sind 256-bit-verschlüsselt.</p>
      </div>
    `;
  }

  // Hardcoded AGB-Fallback (wird angezeigt wenn API leer oder fehlschlägt)
  const AGB_FALLBACK = `## 1. Geltungsbereich
Diese AGB gelten für alle Online-Bestellungen bei Bella Home GmbH (FN 516088 d, Handelsgericht Wien).

## 2. Vertragsabschluss
Mit Absenden der Bestellung gibt der Kunde ein verbindliches Angebot ab. Der Vertrag kommt mit Versand der Bestätigungs-Email zustande.

## 3. Preise & Zahlung
Alle Preise verstehen sich inkl. 20% USt. Online-Bestellungen werden bei der Bestellung voll bezahlt über unseren Zahlungsdienstleister Stripe (Karte, EPS, Apple Pay, Google Pay).

**Mindestberechnung:** Die Verrechnung erfolgt pro Stück mit mindestens 1 m². Maße unter 1 m² werden als 1 m² berechnet. Der im Konfigurator angezeigte Preis enthält diese Mindestberechnung bereits.

## 4. Maßanfertigung — kein Widerrufsrecht
Gemäß § 18 Abs. 1 Z 3 FAGG besteht bei Maßanfertigung kein 14-Tage-Rücktrittsrecht.

## 5. Gewährleistung
Gesetzliche Gewährleistung von 2 Jahren ab Übernahme. Mängel sind unverzüglich nach Entdeckung zu melden.

## 6. Gerichtsstand
Es gilt österreichisches Recht. Gerichtsstand für Streitigkeiten ist Wien.`;

  function renderAgb() {
    return renderLegalPage('Allgemeine Geschäftsbedingungen', 'agb', AGB_FALLBACK);
  }

  // Universeller Loader für legal pages — lädt aus API, fällt auf hardcoded Text zurück.
  function renderLegalPage(title, key, fallback) {
    // Sofort Loader anzeigen, dann async nachladen
    setTimeout(async () => {
      const container = document.getElementById('legalContent-' + key);
      if (!container) return;
      try {
        const data = await window.api.getLegal();
        const text = (data && data[key]) || fallback;
        container.innerHTML = parseLegalMarkdown(text);
      } catch (e) {
        container.innerHTML = parseLegalMarkdown(fallback);
      }
    }, 10);
    return `
      <div class="card fade-in" style="max-width:720px;margin:24px auto">
        <h2 class="card-title">${escapeHtml(title)}</h2>
        <div id="legalContent-${key}" class="legal-content">
          <div style="padding:30px;text-align:center;color:var(--text-muted)">Lade…</div>
        </div>
      </div>
    `;
  }

  // Mini-Markdown-Parser für rechtliche Texte:
  //   ## Überschrift   →  <h3>Überschrift</h3>
  //   leere Zeile      →  Absatztrenner
  //   **fett**         →  <strong>fett</strong>
  //   einfacher Link   →  https://… wird zu Link
  // Rohe HTML-Tags werden escaped — kein XSS möglich.
  function parseLegalMarkdown(text) {
    if (!text) return '';
    const safe = escapeHtml(text);
    // Zeilenweise gehen: Heading vs Paragraph
    const blocks = safe.split(/\n\s*\n/); // Block = von Leerzeile zu Leerzeile
    const html = blocks.map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('## ')) {
        const content = applyInlineFormatting(trimmed.slice(3));
        return `<h3 style="font-family:var(--font-display);font-size:15px;margin:20px 0 6px">${content}</h3>`;
      }
      // Mehrzeiliger Absatz → <br> innerhalb
      const content = applyInlineFormatting(trimmed.replace(/\n/g, '<br>'));
      return `<p style="font-size:13px;color:var(--text);line-height:1.7;margin:0 0 10px">${content}</p>`;
    }).join('\n');
    return html;
  }
  function applyInlineFormatting(s) {
    // **bold** → <strong>
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // URLs zu Links machen (vor angehängten Satzzeichen schützen)
    s = s.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    return s;
  }

  const DATENSCHUTZ_FALLBACK = `## Verantwortlicher
Bella Home GmbH, Oberlaaerstraße 285, 1230 Wien, Tel: +43 660 200 06 44, Email: info@bellahome.at

## Welche Daten wir erheben
Für die Bestellabwicklung: Name, Email, Telefon, Bestelldaten (Maße, Modell, Farbe). Für die Email-Zustellung wird zusätzlich der Versandstatus durch unseren Versanddienst (Resend) protokolliert.

## Wofür wir die Daten verwenden
Ausschließlich zur Abwicklung Ihrer Bestellung (Bestätigung, Status-Updates, Rechnung). Keine Werbung, keine Newsletter, keine Weitergabe an Dritte zu Marketingzwecken.

## Zahlungsabwicklung (Stripe)
Für die Online-Bezahlung nutzen wir **Stripe Payments Europe Ltd.**, 1 Grand Canal Street Lower, Grand Canal Dock, Dublin, Irland. Bei einer Online-Zahlung (Kreditkarte, EPS, Apple Pay, Google Pay) werden Ihre Zahlungsdaten direkt an Stripe übermittelt und nicht bei uns gespeichert. Wir erhalten von Stripe lediglich eine Bestätigung des Zahlungseingangs sowie Metadaten zur Zahlung (Betrag, Zahlungsmethode, Transaktions-ID). Datenschutzerklärung von Stripe: https://stripe.com/at/privacy

## Aufbewahrung
Rechnungen werden gemäß BAO 7 Jahre aufbewahrt. Sonstige Daten löschen wir auf Anfrage.

## Ihre Rechte
Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit — bitte per Email an info@bellahome.at. Beschwerde bei der österreichischen Datenschutzbehörde (dsb.gv.at).`;

  const IMPRESSUM_FALLBACK = `**Bella Home GmbH**
Oberlaaerstraße 285
1230 Wien, Österreich

**Telefon:** +43 660 200 06 44
**Email:** info@bellahome.at
**Web:** www.bellahome.at

**Firmenbuch:** FN 516088 d
**Firmenbuchgericht:** Handelsgericht Wien
**UID-Nummer:** ATU74825834
**Geschäftsführer:** Yildiray Dagdelen

**Unternehmensgegenstand:** Handel und Anfertigung von Fliegengittern

Online-Streitbeilegung: https://ec.europa.eu/consumers/odr`;

  function renderDatenschutz() {
    return renderLegalPage('Datenschutzerklärung', 'datenschutz', DATENSCHUTZ_FALLBACK);
  }

  function renderImpressum() {
    return renderLegalPage('Impressum', 'impressum', IMPRESSUM_FALLBACK);
  }

  function renderNotFound() {
    return `
      <div class="card fade-in" style="max-width:480px;margin:64px auto;text-align:center">
        <div style="font-size:64px;margin-bottom:12px">🤔</div>
        <h2 class="card-title">Seite nicht gefunden</h2>
        <p style="color:var(--text-muted);margin-bottom:24px">Die aufgerufene Seite existiert nicht.</p>
        <a class="btn btn-primary" href="#/">Zur Startseite</a>
      </div>
    `;
  }

  function renderLoader() {
    return `
      <div class="loader">
        <div class="loader-spinner"></div>
        Lade…
      </div>
    `;
  }

  return {
    renderHome,
    renderStep1,
    renderStep2,
    updateStep2Summary,
    renderStep3,
    renderStep4,
    renderSuccess,
    renderCancel,
    renderTrackingLookup,
    renderTrackingResult,
    renderKontakt,
    renderHilfe,
    renderAgb,
    renderDatenschutz,
    renderImpressum,
    renderNotFound,
    renderLoader,
    cache,
    loadShopData,
    eur,
    escapeHtml,
    calcPrice,
    openLightbox,
    openInfoModal,
    openVariantInfo
  };
})();
