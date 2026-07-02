// ═══════════════════════════════════════════════════════════════
// APP - Hash-Router + Event-Handler
// ═══════════════════════════════════════════════════════════════

window.app = (function() {
  const view = () => document.getElementById('view');

  // ── Render-Wrapper ───────────────────────────────────────────
  // options.keepScroll: true → kein Auto-Scroll nach oben (z.B. wenn der
  // Kunde mitten in Schritt 2 eine Farbe wählt und nicht ans Seitenende
  // gerissen werden soll).
  async function render(promiseOrString, options = {}) {
    const el = view();
    if (!el) return;
    if (promiseOrString instanceof Promise) {
      el.innerHTML = window.views.renderLoader();
      try {
        const html = await promiseOrString;
        el.innerHTML = html;
      } catch (err) {
        console.error('[render]', err);
        el.innerHTML = `<div class="banner banner-error" style="margin:32px auto;max-width:480px">
          <i class="ti ti-alert-triangle"></i>
          <div><strong>Etwas ist schiefgegangen.</strong><br>${escapeHtml(err.message)}<br><a href="#/">Zur Startseite</a></div>
        </div>`;
      }
    } else {
      el.innerHTML = promiseOrString;
    }
    if (!options.keepScroll) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  // ── Per-Route SEO-Meta ───────────────────────────────────────
  // Hash-Routen ändern den <title> + <meta description> + OG-Tags
  // dynamisch, sonst sähe jede Seite für Google + Social-Shares gleich aus.
  const ROUTE_META = {
    '/':             { title: 'Fliegengitter nach Maß in Wien — Bella Home',                desc: 'Fliegengitter online konfigurieren, in 4 Minuten bestellen und in Wien abholen. Maßanfertigung von Bella Home GmbH, 1230 Wien.' },
    '/konfigurator': { title: 'Fliegengitter konfigurieren — Bella Home Wien',               desc: 'Maße eingeben, Modell und Farbe wählen, online sicher bezahlen. Maßanfertigung von Bella Home in Wien.' },
    '/bestellung':   { title: 'Bestellung verfolgen — Bella Home Wien',                       desc: 'Status Ihrer Fliegengitter-Bestellung verfolgen.' },
    '/kontakt':      { title: 'Kontakt — Bella Home Wien | Fliegengitter Filiale 1230',      desc: 'Bella Home GmbH, Oberlaaerstraße 285, 1230 Wien. Telefon +43 660 200 06 44.' },
    '/hilfe':        { title: 'Hilfe & FAQ — Fliegengitter Bella Home Wien',                  desc: 'Häufige Fragen zu Fliegengitter-Bestellung, Maßanfertigung, Abholung in Wien.' },
    '/agb':          { title: 'AGB — Bella Home Wien',                                        desc: 'Allgemeine Geschäftsbedingungen Bella Home GmbH.' },
    '/datenschutz':  { title: 'Datenschutz — Bella Home Wien',                                desc: 'Datenschutzerklärung Bella Home GmbH.' },
    '/impressum':    { title: 'Impressum — Bella Home Wien',                                  desc: 'Impressum Bella Home GmbH, Oberlaaerstraße 285, 1230 Wien.' }
  };

  function updateMeta(path) {
    // Pfad auf die Root-Route normalisieren (`/bestellung/abc123` → `/bestellung`),
    // damit Tracking-Result-Seiten den Listen-Titel erben.
    const rootPath = '/' + (path.split('/').filter(Boolean)[0] || '');
    const meta = ROUTE_META[rootPath] || ROUTE_META['/'];
    document.title = meta.title;
    const set = (sel, attr, val) => { const el = document.querySelector(sel); if (el) el.setAttribute(attr, val); };
    set('meta[name="description"]', 'content', meta.desc);
    set('meta[property="og:title"]', 'content', meta.title);
    set('meta[property="og:description"]', 'content', meta.desc);
    set('meta[name="twitter:title"]', 'content', meta.title);
    set('meta[name="twitter:description"]', 'content', meta.desc);
    const canonHref = 'https://fliegengitterwien.at' + (rootPath === '/' ? '/' : '/#' + rootPath);
    set('link[rel="canonical"]', 'href', canonHref);
    set('meta[property="og:url"]', 'content', canonHref);
  }

  // ── Hash-Router ──────────────────────────────────────────────
  function route() {
    const hash = location.hash || '#/';
    const path = hash.replace(/^#\//, '/').split('?')[0];
    const parts = path.split('/').filter(Boolean);

    // Erstes was passiert: SEO-Meta für diese Route setzen.
    updateMeta(path);

    // /                       → Home
    // /konfigurator           → State.step
    // /bestellung             → Tracking-Lookup
    // /bestellung/:token      → Tracking-Result
    // /kontakt, /hilfe, /agb, /datenschutz, /impressum
    if (parts.length === 0) return render(window.views.renderHome());

    const root = parts[0];
    switch (root) {
      case 'konfigurator': {
        const step = window.state.get().step || 1;
        return renderStep(step);
      }
      case 'bestellung':
        if (parts[1]) return renderTrackingByToken(parts[1]);
        return render(window.views.renderTrackingLookup());
      case 'cancel':      return render(window.views.renderCancel());
      case 'kontakt':     return render(window.views.renderKontakt());
      case 'hilfe':       return render(window.views.renderHilfe());
      case 'agb':         return render(window.views.renderAgb());
      case 'datenschutz': return render(window.views.renderDatenschutz());
      case 'impressum':   return render(window.views.renderImpressum());
      default:            return render(window.views.renderNotFound());
    }
  }

  function renderStep(step, options = {}) {
    const map = {
      1: window.views.renderStep1,
      2: window.views.renderStep2,
      3: window.views.renderStep3,
      4: window.views.renderStep4
    };
    const fn = map[step] || window.views.renderStep1;
    return render(fn(), options);
  }

  async function renderTrackingByToken(token) {
    render(window.views.renderLoader());
    try {
      const order = await window.api.trackOrder(token);
      render(window.views.renderTrackingResult(order, token));
    } catch (err) {
      view().innerHTML = `<div class="card" style="max-width:480px;margin:32px auto;text-align:center">
        <div style="font-size:48px;margin-bottom:12px">🔍</div>
        <h2 class="card-title">Bestellung nicht gefunden</h2>
        <p style="color:var(--text-muted)">Der Tracking-Code ist nicht korrekt oder die Bestellung existiert nicht mehr.</p>
        <a class="btn btn-secondary" href="#/bestellung">Anderen Code eingeben</a>
      </div>`;
    }
  }

  // ── Navigation ───────────────────────────────────────────────
  function startConfig() {
    // Frischer Start: gespeicherte Werte einer vorigen Sitzung verwerfen.
    // Refresh INNERHALB des Konfigurators bleibt davon unberührt — der
    // State überlebt nur, wenn der Kunde nicht erneut "Jetzt konfigurieren" klickt.
    window.state.reset();
    location.hash = '#/konfigurator';
  }

  function goToStep(n) {
    window.state.set({ step: n });
    renderStep(n);
  }

  function next() {
    const s = window.state.get();
    const validation = validateStep(s.step);
    if (validation.error) {
      toast(validation.error, 'error');
      return;
    }
    goToStep(Math.min(4, s.step + 1));
  }

  function prev() {
    const s = window.state.get();
    goToStep(Math.max(1, s.step - 1));
  }

  function validateStep(step) {
    const s = window.state.get();
    if (step === 1) {
      if (!s.modelId) return { error: 'Bitte ein Modell auswählen.' };
    }
    if (step === 2) {
      if (!s.modelData) return { error: 'Modell nicht geladen.' };
      const lim = s.modelData.measureLimits;
      const measures = s.measures || [];
      if (!measures.length) return { error: 'Mindestens eine Position erforderlich.' };
      for (let i = 0; i < measures.length; i++) {
        const mm = measures[i];
        const prefix = measures.length > 1 ? `Position ${i + 1}: ` : '';
        if (!mm.breite || mm.breite < lim.minBreite || mm.breite > lim.maxBreite) {
          return { error: `${prefix}Breite muss zwischen ${lim.minBreite} und ${lim.maxBreite} cm liegen.` };
        }
        if (!mm.hoehe || mm.hoehe < lim.minHoehe || mm.hoehe > lim.maxHoehe) {
          return { error: `${prefix}Höhe muss zwischen ${lim.minHoehe} und ${lim.maxHoehe} cm liegen.` };
        }
        if (!mm.stueck || mm.stueck < 1) {
          return { error: `${prefix}Stückzahl muss mindestens 1 sein.` };
        }
        if (!mm.farbe) {
          return { error: `${prefix}Bitte eine Farbe wählen.` };
        }
      }
    }
    if (step === 3) {
      if (!s.vorname?.trim()) return { error: 'Bitte Vorname angeben.' };
      if (!s.nachname?.trim()) return { error: 'Bitte Nachname angeben.' };
      if (!s.telefon?.trim() || !s.telefonNummer?.trim()) return { error: 'Bitte Telefonnummer angeben.' };
      if (s.telefonNummer.replace(/\D/g, '').length < 4) return { error: 'Telefonnummer ist zu kurz.' };
      if (!s.email?.trim()) return { error: 'Bitte Email angeben.' };
      if (!isValidEmail(s.email)) return { error: 'Email-Adresse ungültig.' };
    }
    return {};
  }

  function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
  }

  // ── Setter ───────────────────────────────────────────────────
  function selectModel(id) {
    const data = window.views.cache.models?.find(m => m.id === id);
    if (!data) {
      toast('Modell nicht gefunden', 'error');
      return;
    }
    // Modell wechselt → alle Positionen an neue Limits anpassen + ggf. Farbe leeren
    // wenn alte Farbe nicht mehr verfügbar ist. Position-Anzahl bleibt erhalten.
    const s = window.state.get();
    const availableColorIds = data.availableColors || [];
    const colorOk = (colorName) => {
      if (!colorName) return false;
      if (availableColorIds.length === 0) return true;
      const colorById = (window.views.cache.colors || []).find(c => c.name === colorName);
      return colorById && availableColorIds.includes(colorById.id);
    };
    const adjustedMeasures = (s.measures || [window.state.blankMeasure()]).map(mm => ({
      ...mm,
      breite: clamp(mm.breite, data.measureLimits.minBreite, data.measureLimits.maxBreite),
      hoehe: clamp(mm.hoehe, data.measureLimits.minHoehe, data.measureLimits.maxHoehe),
      farbe: colorOk(mm.farbe) ? mm.farbe : (data.defaultColor || ''),
      doppeltuer: data.forcedDoppeltuer === true ? true
                : data.forcedDoppeltuer === false ? false
                : !!mm.doppeltuer
    }));
    window.state.set({
      modelId: id,
      modelData: data,
      measures: adjustedMeasures
    });
    renderStep(1, { keepScroll: true }); // re-render damit selected sichtbar wird — ohne Sprung nach oben (v1.40)
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n || min));
  }

  // ── Name-Sanitizer ───────────────────────────────────────────
  // Lässt nur lateinisches Alphabet + deutsche Umlaute zu. Bekannte
  // türkische / andere lateinähnliche Zeichen werden auf Standard-Latin
  // transliteriert (ş→s, ç→c, ğ→g, ı→i). Sonstige Schriften (kyrillisch,
  // arabisch, asiatisch …) werden entfernt. Whitespace/Bindestrich/Apostroph
  // bleiben für gängige Namen erhalten.
  const NAME_TRANSLITERATE = {
    'ş':'s','Ş':'S','ç':'c','Ç':'C','ğ':'g','Ğ':'G','ı':'i','İ':'I',
    'â':'a','Â':'A','î':'i','Î':'I','û':'u','Û':'U','ô':'o','Ô':'O',
    'á':'a','Á':'A','à':'a','À':'A','é':'e','É':'E','è':'e','È':'E',
    'í':'i','Í':'I','ì':'i','Ì':'I','ó':'o','Ó':'O','ò':'o','Ò':'O',
    'ú':'u','Ú':'U','ù':'u','Ù':'U','ñ':'n','Ñ':'N','ý':'y','Ý':'Y',
    'ć':'c','Ć':'C','č':'c','Č':'C','ď':'d','Ď':'D','ě':'e','Ě':'E',
    'ł':'l','Ł':'L','ń':'n','Ń':'N','ř':'r','Ř':'R','ś':'s','Ś':'S',
    'š':'s','Š':'S','ť':'t','Ť':'T','ů':'u','Ů':'U','ź':'z','Ź':'Z',
    'ż':'z','Ż':'Z','ž':'z','Ž':'Z'
  };
  function sanitizeName(raw) {
    let s = String(raw || '');
    s = s.replace(/[şŞçÇğĞıİâÂîÎûÛôÔáÁàÀéÉèÈíÍìÌóÓòÒúÚùÙñÑýÝćĆčČďĎěĚłŁńŃřŘśŚšŠťŤůŮźŹżŻžŽ]/g, c => NAME_TRANSLITERATE[c] || c);
    s = s.replace(/[^a-zA-ZäöüÄÖÜß\s\-'.]/g, '');
    return s;
  }

  // ── Felder auf Order-Ebene (Kontakt, AGB) ────────────────────
  function setField(key, value) {
    window.state.set({ [key]: value });
  }

  // Variante speziell für Namen: sanitisiert in-place das Eingabefeld (Element
  // direkt erhalten, robuster als document.activeElement) und speichert dann
  // den gereinigten Wert im State.
  function setNameField(el, key) {
    if (!el) return;
    const raw = el.value;
    const clean = sanitizeName(raw);
    if (clean !== raw) {
      const pos = (typeof el.selectionStart === 'number') ? el.selectionStart : null;
      el.value = clean;
      if (pos !== null) {
        const newPos = Math.min(pos, clean.length);
        try { el.setSelectionRange(newPos, newPos); } catch(_) {}
      }
    }
    window.state.set({ [key]: clean });
  }

  // ── Telefon: Vorwahl + Nummer kombiniert, Autoformat wie BestellApp ──
  const VORWAHL_LIST = ['+421','+420','+387','+385','+381','+90','+49','+48','+44','+43','+41','+40','+39','+36'];

  function setPhoneVorwahl(vw) {
    window.state.set({ telefonVorwahl: vw, telefon: combinePhone(vw, window.state.get().telefonNummer) });
  }

  // Räumt eine getippte Nummer auf:
  //   – Whitespace / Bindestriche / Klammern raus
  //   – „0043…" → „43…" (Vorwahl wird zusätzlich gesetzt)
  //   – „+43…" → Vorwahl gesetzt + Präfix entfernt
  //   – führende „0" weg (typisch Ö: 0660 → 660)
  function setPhoneNummer(raw) {
    let val = String(raw || '').replace(/[\s\-()]/g, '');
    let vorwahl = window.state.get().telefonVorwahl || '+43';

    if (val.startsWith('0043')) {
      // Internationale „00"-Schreibweise: in +43 umwandeln und Vorwahl festziehen
      vorwahl = '+43';
      val = val.slice(4).replace(/^0+/, '');
    } else if (val.startsWith('+')) {
      // Nutzer hat „+xx" im Feld → passendste Vorwahl finden und Präfix entfernen
      const matched = VORWAHL_LIST.find(vw => val.startsWith(vw));
      if (matched) {
        vorwahl = matched;
        val = val.slice(matched.length).replace(/^0+/, '');
      }
    } else if (val.startsWith('0') && val.length > 1) {
      // Inländische Schreibweise „0660…" → führende 0 weg, Vorwahl bleibt
      val = val.slice(1);
    }

    // DOM nachziehen, damit der gesäuberte Wert sichtbar wird (Cursor bleibt am Ende)
    const numEl = document.getElementById('phoneNummer');
    if (numEl && numEl.value !== val) numEl.value = val;
    const vwEl = document.getElementById('phoneVorwahl');
    if (vwEl && vwEl.value !== vorwahl) vwEl.value = vorwahl;

    window.state.set({
      telefonVorwahl: vorwahl,
      telefonNummer: val,
      telefon: combinePhone(vorwahl, val)
    });
  }

  function combinePhone(vorwahl, nummer) {
    const n = String(nummer || '').replace(/[\s\-()]/g, '');
    if (!n) return '';
    if (n.startsWith('+')) return n;
    return (vorwahl || '+43') + n;
  }

  // ── Felder pro Position (Maße, Farbe, Türart, Bemerkung) ─────
  function measureSetField(idx, key, value) {
    window.state.updateMeasure(idx, { [key]: value });
    const s = window.state.get();
    if (s.step !== 2) return;
    if (key === 'breite' || key === 'hoehe' || key === 'bemerkung') {
      // Tippen in Text/Number-Inputs: nur Summary + Skizze inline updaten,
      // damit der Cursor nicht aus dem Feld springt.
      window.views.updateStep2Summary(idx);
    } else {
      // Button-Klicks (stueck, farbe, doppeltuer): voller Re-Render, ohne
      // Auto-Scroll, damit der Kunde an seiner Position bleibt.
      renderStep(2, { keepScroll: true });
    }
  }

  function measureSetVariant(idx, vid, value) {
    window.state.setMeasureVariant(idx, vid, value);
    // v1.39: nurDoppeltuer-Option (z.B. Kombi) → automatisch Doppeltür setzen
    if (vid === 'netz_plissee') {
      try {
        const cache = (window.views && window.views.cache) || {};
        const variant = (cache.variants || []).find(v => v.id === 'netz_plissee');
        const opt = variant?.options?.find(o => o.id === value);
        if (opt && opt.nurDoppeltuer) {
          window.state.updateMeasure(idx, { doppeltuer: true });
        }
      } catch (e) { /* ignore */ }
    }
    const s = window.state.get();
    if (s.step === 2) {
      renderStep(2, { keepScroll: true });
    }
  }

  function addMeasure() {
    window.state.addMeasure();
    renderStep(2, { keepScroll: true });
  }

  function removeMeasure(idx) {
    window.state.removeMeasure(idx);
    renderStep(2, { keepScroll: true });
  }

  // ── Bestellung absenden ──────────────────────────────────────
  async function submitOrder() {
    const s = window.state.get();

    // Letzte Validierung
    if (!s.modelId || !s.modelData) { toast('Modell fehlt', 'error'); return goToStep(1); }
    if (!s.vorname || !s.nachname || !s.telefon || !s.email) { toast('Kontaktdaten unvollständig', 'error'); return goToStep(3); }
    if (!s.agbAccepted) { toast('Bitte AGB akzeptieren', 'error'); return; }
    if (!s.widerrufAccepted) { toast('Bitte Widerruf-Hinweis bestätigen', 'error'); return; }

    const btn = document.getElementById('submitBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<div class="loader-spinner" style="width:16px;height:16px;border-width:2px;margin:0"></div> Wird gesendet…';
    }

    // Alle Positionen ans Backend durchreichen. modelId für die ganze Bestellung
    // ist gleich (User wählt 1 Modell in Schritt 1), wird aber pro Position
    // gesetzt damit das Backend-Format unverändert bleibt.
    // v1.19.59: Anzeige-Namen für Netz-/Plissee-Farbe mitsenden (für Email/PDF/App,
    // robust gegen späteres Löschen der Farbe). Aufgelöst aus dem Stammdaten-Cache.
    const _cache = (window.views && window.views.cache) || {};
    const _netzName = (id) => (_cache.netzColors || []).find(c => c.id === id)?.name || '';
    const _plisseeName = (id) => (_cache.plisseeColors || []).find(c => c.id === id)?.name || '';
    const measures = (s.measures || []).map(mm => {
      const vars = { ...(mm.variants || {}), tuerart: mm.doppeltuer ? 'doppel' : 'einzel' };
      const out = {
        modelId: s.modelId,
        breite: mm.breite,
        hoehe: mm.hoehe,
        stueck: mm.stueck,
        farbe: mm.farbe,
        doppeltuer: !!mm.doppeltuer,
        variants: vars,
        bemerkung: mm.bemerkung || ''
      };
      if (vars.netzFarbe) out.netzFarbeName = _netzName(vars.netzFarbe);
      if (vars.plisseeFarbe) out.plisseeFarbeName = _plisseeName(vars.plisseeFarbe);
      return out;
    });

    try {
      const result = await window.api.submitOrder({
        vorname: s.vorname,
        nachname: s.nachname,
        telefon: s.telefon,
        email: s.email,
        measures,
        agbAccepted: s.agbAccepted,
        widerrufAccepted: s.widerrufAccepted
      });

      // Stripe-Flow: Backend gibt eine checkoutUrl zurück → Customer dorthin weiterleiten.
      // State leeren BEVOR Redirect, sonst sieht Customer beim Zurück-Button alte Daten.
      if (result && result.checkoutUrl) {
        const cache = window.views.cache;
        window.state.reset();
        window.views.cache = cache;
        window.location.href = result.checkoutUrl;
        return;
      }

      // Fallback: kein checkoutUrl → alte Render-Success-Page (für legacy/admin-Pfade)
      render(window.views.renderSuccess(result));
      const cache = window.views.cache;
      window.state.reset();
      window.views.cache = cache;
    } catch (err) {
      console.error('[submitOrder]', err);
      // Stripe-Outage (502): klarere Fehlermeldung mit Fallback-Telefon
      const isStripeOutage = err.status === 502 || (err.body && err.body.stripeError);
      const msg = isStripeOutage
        ? 'Online-Bezahlung gerade nicht erreichbar. Bitte später erneut versuchen oder telefonisch bestellen: +43 660 200 06 44'
        : (err.message || 'Bestellung konnte nicht gesendet werden');
      toast(msg, 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="ti ti-lock"></i> Zahlungspflichtig bestellen';
      }
    }
  }

  // ── Tracking ─────────────────────────────────────────────────
  async function lookupTracking() {
    const orderNumber = (document.getElementById('trackOrderNumber')?.value || '').trim();
    const email = (document.getElementById('trackEmail')?.value || '').trim();
    if (!orderNumber || !email) {
      toast('Bitte Bestellnummer und Email eingeben', 'error');
      return;
    }
    if (!isValidEmail(email)) {
      toast('Email-Adresse ungültig', 'error');
      return;
    }
    try {
      const { trackingToken } = await window.api.lookupOrder({ orderNumber, email });
      if (!trackingToken) {
        toast('Bestellung nicht gefunden', 'error');
        return;
      }
      location.hash = '#/bestellung/' + encodeURIComponent(trackingToken);
    } catch (err) {
      toast(err.message || 'Bestellung nicht gefunden', 'error');
    }
  }

  // ── Toast ────────────────────────────────────────────────────
  function toast(msg, type) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show ' + (type || '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.className = 'toast'; }, 3500);
  }

  // ── Init ─────────────────────────────────────────────────────
  // Number-/Numeric-Inputs: bestehenden Wert beim Fokus markieren,
  // damit die nächste Eingabe ihn ersetzt (sonst entsteht z.B. "200150").
  // setTimeout, damit das native Caret-Setzen die Selektion nicht überschreibt.
  document.addEventListener('focusin', e => {
    const el = e.target;
    if (el && el.tagName === 'INPUT' && (el.type === 'number' || el.inputMode === 'decimal' || el.inputMode === 'numeric')) {
      setTimeout(() => { try { el.select(); } catch(_) {} }, 10);
    }
  });

  window.addEventListener('hashchange', route);
  window.addEventListener('DOMContentLoaded', async () => {
    // Logo aus Firmen-Einstellungen laden (best-effort, blockt nichts)
    loadBrandLogo();
    // Modelle vorab laden
    await window.views.loadShopData();
    route();
  });

  // Tauscht den "Bella Home"-Text im Header gegen das hochgeladene Logo aus.
  // Quelle: settings/company.logoBase64 in Firestore, gepflegt aus der BestellApp.
  async function loadBrandLogo() {
    try {
      const data = await window.api.getLogo();
      if (!data || !data.logoBase64) return;
      const img = document.getElementById('brandLogo');
      const text = document.getElementById('brandText');
      if (!img || !text) return;
      img.onload = () => {
        text.style.display = 'none';
        img.style.display = 'block';
      };
      img.src = data.logoBase64;
    } catch (e) {
      // Fällt still zurück auf Text — kein Block für die Hauptseite.
    }
  }

  return {
    startConfig, next, prev, goToStep,
    selectModel, setField, setNameField, setPhoneVorwahl, setPhoneNummer,
    measureSetField, measureSetVariant, addMeasure, removeMeasure,
    submitOrder, lookupTracking, toast,
    selectGalleryImage, openLightbox, heroGoTo,
    get: () => window.state.get()
  };

  // ── Hero-Slider: zu Slide N wechseln (Auto-Rotation oder Dot-Klick) ──
  function heroGoTo(index) {
    const slides = document.querySelectorAll('.hero-slide');
    const dots = document.querySelectorAll('.hero-dot');
    if (!slides.length) return;
    const n = Math.max(0, Math.min(index, slides.length - 1));
    slides.forEach((s, i) => s.classList.toggle('active', i === n));
    dots.forEach((d, i) => d.classList.toggle('active', i === n));
    window._heroSlideIndex = n;
  }

  // ── Galerie-Bild austauschen (Klick auf Thumbnail in Step 2) ──
  function selectGalleryImage(index) {
    const imgs = window._galleryImages || [];
    const img = imgs[index];
    if (!img) return;
    const mainEl = document.getElementById('galleryMain');
    if (mainEl) mainEl.src = img.url;
    // Aktiv-Marker am Thumbnail setzen
    document.querySelectorAll('.gallery-thumb').forEach((t, i) => {
      t.classList.toggle('active', i === index);
    });
  }

  // ── Lightbox öffnen (Klick auf Hauptbild) ──
  function openLightbox() {
    const mainEl = document.getElementById('galleryMain');
    if (!mainEl || !mainEl.src) return;
    const lb = document.createElement('div');
    lb.className = 'gallery-lightbox';
    lb.innerHTML = `
      <button class="lb-close" type="button" aria-label="Schließen">×</button>
      <img src="${mainEl.src}" alt="">
    `;
    const close = () => lb.remove();
    lb.addEventListener('click', close);
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
    });
    document.body.appendChild(lb);
  }
})();
