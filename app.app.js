// ===================== Utils =====================
/** Formatea dinero en COP */
const fmt = v =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })
    .format(v || 0);

/** Parser numérico locale-smart:
 *  Acepta "1.84", "1,84", "1.842", "1.842,50", "1,842.50", "184", "1 842,50"
 *  - Detecta el ÚLTIMO separador (.,) como decimal.
 *  - Quita los demás como miles.
 */
function num(str) {
  if (str == null) return 0;
  let s = String(str).trim();

  // solo dígitos y separadores
  s = s.replace(/[^\d.,\- ]+/g, '').replace(/\s+/g, '');

  const lastDot = s.lastIndexOf('.');
  const lastCom = s.lastIndexOf(',');
  let decIdx = Math.max(lastDot, lastCom); // -1 si no hay

  if (decIdx === -1) {
    // sin separador decimal -> quitar todas las comas/puntos y parsear
    s = s.replace(/[.,]/g, '');
    const n = Number(s);
    return isFinite(n) ? n : 0;
  }

  const decSep = s[decIdx];
  // El resto de separadores son miles -> quitarlos
  let cleaned = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '.' || ch === ',') {
      if (i === decIdx) cleaned += '.'; // decimal real
      // si no es el decimal real, se omite (era separador de miles)
    } else {
      cleaned += ch;
    }
  }
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
}

// ===================== App =====================
class Finanzas {
  constructor() {
    this.key = 'organizadorFinanciero';
    this.iniYM = '2025-08';
    this.mes = this.iniYM;
    this.data = this.load();

    // Migración para corregir tasas mal guardadas
    this.migrateData();

    this._saving = false;
    this._bound = false;

    this.cacheEls();
    this.bindUI();
    this.renderAll();

    if ('serviceWorker' in navigator) {
      try { navigator.serviceWorker.register('./sw.js'); } catch {}
    }
  }

  // ---------- Migraciones ----------
  migrateData() {
    let changed = false;
    Object.keys(this.data || {}).forEach(mes => {
      const d = this.data[mes] || {};
      ['tarjetas', 'creditos'].forEach(k => {
        (d[k] || []).forEach(t => {
          // Caso 1: guardado en % (ej. 1.84 en vez de 0.0184)
          if (typeof t.tasaMensual === 'number' && t.tasaMensual > 0.06) { // >6%/mes es ilógico
            t.tasaMensual = this.normalizeRatePercent(t.tasaMensual * 100); // a %
            t.tasaMensual = t.tasaMensual / 100;                            // a fracción
            t.cuotaMensual = this.cuota(t.montoTotal, t.tasaMensual, t.numeroCuotas);
            changed = true;
          }
          // Caso 2: tasa string
          if (typeof t.tasaMensual === 'string') {
            const r = this.rateFromInput(t.tasaMensual);
            if (r !== t.tasaMensual) {
              t.tasaMensual = r;
              t.cuotaMensual = this.cuota(t.montoTotal, r, t.numeroCuotas);
              changed = true;
            }
          }
        });
      });
    });
    if (changed) this.save();
  }

  /** Normaliza un número que representa PORCENTAJE (no fracción) al rango 0–5 */
  normalizeRatePercent(p) {
    // p es "porcentaje" (ej. 1.84 ó 184 ó 1842)
    let x = Number(p) || 0;
    if (x <= 0) return 0;
    // Si es demasiado grande, divide hasta ≤ 5
    while (x > 5) x = x / 10;
    return x; // porcentaje
  }

  /** Convierte entrada de usuario a fracción mensual (0.0184 para 1.84%) */
  rateFromInput(pctStr) {
    // 1) parsear a número (porcentaje)
    let p = num(pctStr); // soporta "1,84", "1.84", "184", "1842"
    // 2) normalizar al rango 0–5
    p = this.normalizeRatePercent(p);
    // 3) convertir a fracción
    return p / 100;
  }

  // ---------- Cache & UI ----------
  cacheEls() {
    this.tabs = [...document.querySelector