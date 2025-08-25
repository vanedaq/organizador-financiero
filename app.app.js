/* ========================= Utils ========================= */

/** Formatea dinero en COP */
const fmt = (v) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(v || 0);

/** Convierte "1,84" o "1,842" (porcentaje) a fracción mensual: 0.0184 / 0.01842.
 *  Solo acepta coma como separador decimal.
 *  Patrones válidos:  "d", "dd", "d,dd", "d,ddd"
 */
function parsePctComma(str) {
  const s = String(str || "").trim();
  if (!/^\d+(,\d{1,3})?$/.test(s)) return NaN;
  const [ent, dec = ""] = s.split(",");
  const n = Number(ent) + (dec ? Number(dec) / Math.pow(10, dec.length) : 0);
  return n / 100; // porcentaje -> fracción
}

/** Muestra fracción mensual como porcentaje con coma (2 decimales) */
function formatPctComma(frac, decimals = 2) {
  const p = (Number(frac || 0) * 100).toFixed(decimals);
  return p.replace(".", ",");
}

/* ========================= App ========================= */

class Finanzas {
  constructor() {
    this.key = "organizadorFinanciero";
    this.iniYM = "2025-08";
    this.mes = this.iniYM;
    this.data = this.load();

    this.cacheEls();
    this.bindUI();
    this.renderAll();

    if ("serviceWorker" in navigator) {
      try {
        navigator.serviceWorker.register("./sw.js");
      } catch {}
    }
  }

  /* ---------- Helpers de tasa ---------- */
  // Devuelve fracción mensual (0.0184) a partir de un % con coma ("1,84")
  rateFromInput(pctStr) {
    const r = parsePctComma(pctStr);
    return isNaN(r) ? 0 : r;
  }

  /* ---------- Cache/Binding ---------- */
  cacheEls() {
    this.tabs = [...document.querySelectorAll(".tab")];
    this.panels = [...document.querySelectorAll(".panel")];
    this.toastEl = document.getElementById("toast");
    this.sel = document.getElementById("mesSelector");
  }

  bindUI() {
    this.tabs.forEach((t) =>
      t.addEventListener("click", () => this.showTab(t.dataset.tab))
    );

    ["addIngreso", "addFijo", "addTarjeta", "addCredito", "addCompra", "addAhorro"].forEach(
      (id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("click", () => this.openForm(id));
      }
    );

    const exportBtn = document.getElementById("exportBtn");
    if (exportBtn) exportBtn.onclick = () => this.export();

    const resetBtn = document.getElementById("resetBtn");
    if (resetBtn) resetBtn.onclick = () => this.reset();

    const closeModalBtn = document.getElementById("closeModal");
    if (closeModalBtn) closeModalBtn.onclick = () => this.closeModal();

    if (this.sel) {
      this.buildMonths();
      this.sel.addEventListener("change", (e) => {
        this.mes = e.target.value;
        this.ensureMonth(this.mes);
        this.renderAll();
        this.toast("Mes cambiado");
      });
    }

    // acciones delegadas (editar/eliminar/agregar ahorro)
    document.body.addEventListener("click", (ev) => {
      const a = ev.target.closest("a[data-action]");
      if (!a) return;
      ev.preventDefault();
      const act = a.dataset.action,
        key = a.dataset.key,
        id = parseInt(a.dataset.id);
      if (act === "edit") this.edit(key, id);
      if (act === "del") this.del(key, id);
      if (act === "addsave") this.addAhorroMonto(id);
    });
  }

  showTab(name) {
    this.tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    this.panels.forEach((p) => p.classList.toggle("hidden", p.id !== name));
  }

  /* ---------- Meses ---------- */
  buildMonths() {
    this.sel.innerHTML = "";
    const [y, m] = this.iniYM.split("-").map(Number);
    let d = new Date(y, m - 1, 1);
    for (let i = 0; i <= 36; i++) {
      const val = d.toISOString().slice(0, 7);
      const txt = d.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = txt;
      if (val === this.mes) opt.selected = true;
      this.sel.appendChild(opt);
      d.setMonth(d.getMonth() + 1);
    }
    this.ensureMonth(this.mes);
  }

  ensureMonth(key) {
    if (this.data[key]) return;
    const [y, m] = key.split("-").map(Number);
    let py = y,
      pm = m - 1;
    if (pm <= 0) {
      pm = 12;
      py--;
    }
    const prev = `${py}-${String(pm).padStart(2, "0")}`;
    if (this.data[prev]) {
      const copy = JSON.parse(JSON.stringify(this.data[prev]));
      Object.values(copy).forEach(
        (arr) =>
          Array.isArray(arr) &&
          arr.forEach((it) => {
            it.id = this.uid();
            it.fecha = `${key}-01`;
          })
      );
      this.data[key] = copy;
    } else {
      this.data[key] = {
        ingresos: [],
        gastosFijos: [],
        tarjetas: [],
        creditos: [],
        gastosCompras: [],
        ahorros: [],
      };
    }
    this.save();
  }

  /* ---------- Storage ---------- */
  uid() {
    return Date.now() + Math.floor(Math.random() * 1e6);
  }

  load() {
    try {
      const s = localStorage.getItem(this.key);
      if (s) return JSON.parse(s);
    } catch {}
    const seed = {};
    seed[this.iniYM] = {
      ingresos: [
        {
          id: this.uid(),
          nombre: "Salario",
          monto: 3500000,
          categoria: "Trabajo",
          fecha: `${this.iniYM}-01`,
        },
      ],
      gastosFijos: [
        {
          id: this.uid(),
          nombre: "Arriendo",
          monto: 1200000,
          categoria: "Vivienda",
          fecha: `${this.iniYM}-01`,
        },
      ],
      tarjetas: [],
      creditos: [
        {
          id: this.uid(),
          nombre: "Crédito Vehículo",
          montoTotal: 24200000,
          numeroCuotas: 60,
          cuotasPagadas: 0,
          tasaMensual: 0.01842,
          cuotaMensual: this.cuota(24200000, 0.01842, 60),
          fecha: `${this.iniYM}-01`,
        },
      ],
      gastosCompras: [
        {
          id: this.uid(),
          nombre: "Supermercado",
          monto: 400000,
          categoria: "Alimentación",
          fecha: `${this.iniYM}-10`,
        },
      ],
      ahorros: [
        {
          id: this.uid(),
          nombre: "Emergencias",
          meta: 5000000,
          actual: 1200000,
          fecha: `${this.iniYM}-01`,
        },
      ],
    };
    return seed;
  }

  save() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.data));
    } catch {}
  }

  /* ---------- Render ---------- */
  get mesData() {
    this.ensureMonth(this.mes);
    return this.data[this.mes];
  }

  renderAll() {
    const d = this.mesData;

    this.renderList("listaIngresos", d.ingresos, (i) => this.rowIngreso(i, "ingresos"));
    this.renderList("listaFijos", d.gastosFijos, (i) => this.rowFijo(i, "gastosFijos"));
    this.renderList("listaTarjetas", d.tarjetas, (i) => this.rowTarjeta(i, "tarjetas"));
    this.renderList("listaCreditos", d.creditos, (i) => this.rowCredito(i, "creditos"));
    this.renderList("listaCompras", d.gastosCompras, (i) => this.rowCompra(i, "gastosCompras"));
    this.renderList("listaAhorros", d.ahorros, (i) => this.rowAhorro(i, "ahorros"));

    const totalIng = d.ingresos.reduce((s, x) => s + (x.monto || 0), 0);
    const totalFix = d.gastosFijos.reduce((s, x) => s + (x.monto || 0), 0);
    const totalTar = d.tarjetas.reduce((s, x) => s + (x.cuotaMensual || 0), 0);
    const totalCre = d.creditos.reduce((s, x) => s + (x.cuotaMensual || 0), 0);
    const totalCom = d.gastosCompras.reduce((s, x) => s + (x.monto || 0), 0);
    const totalAho = d.ahorros.reduce((s, x) => s + (x.actual || 0), 0);
    const totalGastos = totalFix + totalTar + totalCre + totalCom;
    const libre = totalIng - totalGastos;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    set("sumIngresos", fmt(totalIng));
    set("sumFijos", fmt(totalFix));
    set("sumTarjetas", fmt(totalTar));
    set("sumCreditos", fmt(totalCre));
    set("sumCompras", fmt(totalCom));
    set("sumAhorros", fmt(totalAho));
    set("sumGastos", fmt(totalGastos));
    set("sumLibre", fmt(libre));

    this.renderDashboard(totalIng, totalGastos, libre);
    this.renderMetas(d.ahorros);
    this.renderHistorial();
    this.renderConsejos(totalIng, totalGastos);
  }

  renderList(id, arr, row) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = arr.length ? arr.map(row).join("") : '<p class="meta">Sin registros.</p>';
  }

  rowIngreso(i, key) {
    return this.rowGeneric("💵", i, key, i.monto);
  }
  rowFijo(i, key) {
    return this.rowGeneric("🏠", i, key, i.monto);
  }
  rowCompra(i, key) {
    return this.rowGeneric("🛒", i, key, i.monto);
  }
  rowAhorro(i, key) {
    const p = i.meta ? ((i.actual / i.meta) * 100).toFixed(1) : 0;
    return `<div class="item">
      <div class="row">
        <div>💎 <b>${i.nombre}</b><div class="meta">Meta ${fmt(i.meta)} · ${i.fecha}</div></div>
        <div><b>${fmt(i.actual)}</b></div>
      </div>
      <div class="meta">${p}%</div>
      <div class="actions">
        <a data-action="addsave" data-id="${i.id}" href="#">💰 Añadir</a> ·
        <a data-action="edit" data-key="${key}" data-id="${i.id}" href="#">✏️ Editar</a> ·
        <a data-action="del" data-key="${key}" data-id="${i.id}" href="#">🗑️ Eliminar</a>
      </div>
    </div>`;
  }
  rowTarjeta(i, key) {
    return `<div class="item">
      <div class="row">
        <div>💳 <b>${i.nombre}</b>
          <div class="meta">Cuota ${fmt(i.cuotaMensual)} · ${i.cuotasPagadas || 0}/${i.numeroCuotas} · tasa ${formatPctComma(i.tasaMensual)}%</div>
        </div>
        <div><b>Total ${fmt(i.montoTotal)}</b></div>
      </div>
      <div class="actions">
        <a data-action="edit" data-key="${key}" data-id="${i.id}" href="#">✏️ Editar</a> ·
        <a data-action="del" data-key="${key}" data-id="${i.id}" href="#">🗑️ Eliminar</a>
      </div>
    </div>`;
  }
  rowCredito(i, key) {
    return `<div class="item">
      <div class="row">
        <div>🏦 <b>${i.nombre}</b>
          <div class="meta">Cuota ${fmt(i.cuotaMensual)} · ${i.cuotasPagadas || 0}/${i.numeroCuotas} · tasa ${formatPctComma(i.tasaMensual)}%</div>
        </div>
        <div><b>Total ${fmt(i.montoTotal)}</b></div>
      </div>
      <div class="actions">
        <a data-action="edit" data-key="${key}" data-id="${i.id}" href="#">✏️ Editar</a> ·
        <a data-action="del" data-key="${key}" data-id="${i.id}" href="#">🗑️ Eliminar</a>
      </div>
    </div>`;
  }
  rowGeneric(icon, i, key, monto) {
    return `<div class="item">
      <div class="row">
        <div>${icon} <b>${i.nombre}</b><div class="meta">${i.categoria || "General"} · ${i.fecha}</div></div>
        <div><b>${fmt(monto)}</b></div>
      </div>
      <div class="actions">
        <a data-action="edit" data-key="${key}" data-id="${i.id}" href="#">✏️ Editar</a> ·
        <a data-action="del" data-key="${key}" data-id="${i.id}" href="#">🗑️ Eliminar</a>
      </div>
    </div>`;
  }

  renderDashboard(ing, gastos, libre) {
    const tasa = ing ? ((libre / ing) * 100).toFixed(1) : 0;
    const color = libre >= 0 ? "#00b894" : "#ff6b6b";
    const el = document.getElementById("analisisMensual");
    if (el)
      el.innerHTML = `<div class="item"><b style="color:${color}">${fmt(
        libre
      )}</b> de balance — Ahorro ${tasa}%</div>`;
  }
  renderMetas(ahorros) {
    const el = document.getElementById("metasAhorro");
    if (!el) return;
    if (!ahorros.length) {
      el.innerHTML = '<p class="meta">Crea una meta para empezar.</p>';
      return;
    }
    el.innerHTML = ahorros
      .map((a) => {
        const p = a.meta ? Math.min(100, (a.actual / a.meta) * 100) : 0;
        return `<div class="item">
          <b>${a.nombre}</b>
          <div class="meta">${fmt(a.actual)} / ${fmt(a.meta)}</div>
          <div style="background:#eef0f6;height:8px;border-radius:6px;margin-top:6px">
            <div style="width:${p.toFixed(1)}%;height:100%;background:#6c5ce7;border-radius:6px"></div>
          </div>
        </div>`;
      })
      .join("");
  }
  renderHistorial() {
    const el = document.getElementById("tablaHistorial");
    if (!el) return;
    const meses = Object.keys(this.data).sort();
    const rows = meses
      .map((m) => {
        const d = this.data[m];
        const ing = d.ingresos.reduce((s, x) => s + (x.monto || 0), 0);
        const gas =
          d.gastosFijos.reduce((s, x) => s + (x.monto || 0), 0) +
          d.tarjetas.reduce((s, x) => s + (x.cuotaMensual || 0), 0) +
          d.creditos.reduce((s, x) => s + (x.cuotaMensual || 0), 0) +
          d.gastosCompras.reduce((s, x) => s + (x.monto || 0), 0);
        const bal = ing - gas;
        const p = ing ? ((bal / ing) * 100).toFixed(1) : 0;
        return `<tr><td>${m}</td><td>${fmt(Ing)}</td><td>${fmt(gas)}</td><td style="color:${
          bal >= 0 ? "#00b894" : "#ff6b6b"
        }">${fmt(bal)}</td><td>${p}%</td></tr>`.replace("Ing", "ing");
      })
      .join("");
    el.innerHTML = `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th><th>Balance</th><th>% Ahorro</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  renderConsejos(ing, gas) {
    const el = document.getElementById("recomendaciones");
    if (!el) return;
    const libre = ing - gas;
    const p = ing ? (libre / ing) * 100 : 0;
    const list = [];
    if (libre < 0)
      list.push({
        t: "🚨 Gastos Excesivos",
        d: "Tus gastos superan ingresos. Revisa gastos no esenciales.",
      });
    if (p < 10)
      list.push({
        t: "⚠️ Mejora tu ahorro",
        d: `Estás ahorrando ${p.toFixed(1)}%. Intenta llegar al 20%.`,
      });
    list.push({ t: "📊 50/30/20", d: "50% necesidades, 30% gustos, 20% ahorro/inversión." });
    list.push({ t: "💳 Tarjetas", d: "Paga el total mensual para evitar intereses." });
    el.innerHTML = list
      .map((c) => `<div class="item"><b>${c.t}</b><div class="meta">${c.d}</div></div>`)
      .join("");
  }

  /* ---------- CRUD + Modal ---------- */
  openForm(action) {
    const map = {
      addIngreso: {
        title: "Nuevo Ingreso",
        fields: [
          ["nombre", "text", "Nombre"],
          ["monto", "number", "Monto"],
          ["categoria", "text", "Categoría", "Trabajo"],
          ["fecha", "date", "Fecha", `${this.mes}-01`],
        ],
      },
      addFijo: {
        title: "Nuevo Gasto Fijo",
        fields: [
          ["nombre", "text", "Nombre"],
          ["monto", "number", "Monto"],
          ["categoria", "text", "Categoría", "Vivienda"],
          ["fecha", "date", "Fecha", `${this.mes}-01`],
        ],
      },
      addCompra: {
        title: "Nueva Compra",
        fields: [
          ["nombre", "text", "Descripción"],
          ["monto", "number", "Monto"],
          ["categoria", "text", "Categoría", "Alimentación"],
          ["fecha", "date", "Fecha", `${this.mes}-01`],
        ],
      },
      addAhorro: {
        title: "Nueva Meta de Ahorro",
        fields: [
          ["nombre", "text", "Nombre"],
          ["meta", "number", "Meta"],
          ["actual", "number", "Actual", "0"],
          ["fecha", "date", "Fecha", `${this.mes}-01`],
        ],
      },
      addTarjeta: {
        title: "Nueva Tarjeta",
        fields: [
          ["nombre", "text", "Nombre"],
          ["montoTotal", "number", "Monto total"],
          ["numeroCuotas", "number", "Cuotas"],
          ["cuotasPagadas", "number", "Pagadas", "0"],
          ["tasa", "text", "Tasa mensual % (usa coma: 1,84)", "1,84"],
        ],
      },
      addCredito: {
        title: "Nuevo Crédito",
        fields: [
          ["nombre", "text", "Nombre"],
          ["montoTotal", "number", "Monto total"],
          ["numeroCuotas", "number", "Cuotas"],
          ["cuotasPagadas", "number", "Pagadas", "0"],
          ["tasa", "text", "Tasa mensual % (usa coma: 1,84)", "1,84"],
        ],
      },
    };

    const cfg = map[action];
    if (!cfg) return;

    this.showModal(cfg.title, cfg.fields, (v) => {
      const d = this.mesData;

      const addDeuda = (arr) => {
        const tasa = this.rateFromInput(v.tasa);
        if (!(tasa > 0 && tasa <= 0.05)) {
          this.toast("Tasa inválida. Escribe con coma (ej: 1,84) y ≤ 5%");
          return;
        }
        const M = Number(v.montoTotal);
        const n = parseInt(v.numeroCuotas);
        const cuota = this.cuota(M, tasa, n);
        arr.push({
          id: this.uid(),
          nombre: v.nombre,
          montoTotal: M,
          numeroCuotas: n,
          cuotasPagadas: parseInt(v.cuotasPagadas || 0),
          tasaMensual: tasa,
          cuotaMensual: cuota,
          fecha: `${this.mes}-01`,
        });
      };

      if (action === "addIngreso")
        d.ingresos.push({
          id: this.uid(),
          nombre: v.nombre,
          monto: Number(v.monto),
          categoria: v.categoria,
          fecha: v.fecha,
        });
      if (action === "addFijo")
        d.gastosFijos.push({
          id: this.uid(),
          nombre: v.nombre,
          monto: Number(v.monto),
          categoria: v.categoria,
          fecha: v.fecha,
        });
      if (action === "addCompra")
        d.gastosCompras.push({
          id: this.uid(),
          nombre: v.nombre,
          monto: Number(v.monto),
          categoria: v.categoria,
          fecha: v.fecha,
        });
      if (action === "addAhorro")
        d.ahorros.push({
          id: this.uid(),
          nombre: v.nombre,
          meta: Number(v.meta),
          actual: Number(v.actual || 0),
          fecha: v.fecha,
        });
      if (action === "addTarjeta") addDeuda(d.tarjetas);
      if (action === "addCredito") addDeuda(d.creditos);

      this.save();
      this.renderAll();
      this.toast("Guardado");
    });
  }

  edit(key, id) {
    const list = this.mesData[key];
    const it = list.find((x) => x.id === id);
    if (!it) return;

    let fields = [],
      title = "Editar";

    if (key === "ingresos" || key === "gastosFijos" || key === "gastosCompras") {
      fields = [
        ["nombre", "text", "Nombre", it.nombre],
        ["monto", "number", "Monto", it.monto],
        ["categoria", "text", "Categoría", it.categoria],
        ["fecha", "date", "Fecha", it.fecha],
      ];
    } else if (key === "ahorros") {
      title = "Editar Meta";
      fields = [
        ["nombre", "text", "Nombre", it.nombre],
        ["meta", "number", "Meta", it.meta],
        ["actual", "number", "Actual", it.actual],
      ];
    } else {
      title = "Editar Deuda";
      fields = [
        ["nombre", "text", "Nombre", it.nombre],
        ["montoTotal", "number", "Monto total", it.montoTotal],
        ["numeroCuotas", "number", "Cuotas", it.numeroCuotas],
        ["cuotasPagadas", "number", "Pagadas", it.cuotasPagadas || 0],
        ["tasa", "text", "Tasa mensual % (usa coma)", formatPctComma(it.tasaMensual)],
      ];
    }

    this.showModal(title, fields, (v) => {
      if (key === "ingresos" || key === "gastosFijos" || key === "gastosCompras") {
        Object.assign(it, {
          nombre: v.nombre,
          monto: Number(v.monto),
          categoria: v.categoria,
          fecha: v.fecha,
        });
      } else if (key === "ahorros") {
        Object.assign(it, {
          nombre: v.nombre,
          meta: Number(v.meta),
          actual: Number(v.actual || 0),
        });
      } else {
        const tasa = this.rateFromInput(v.tasa);
        if (!(tasa > 0 && tasa <= 0.05)) {
          this.toast("Tasa inválida. Escribe con coma (ej: 1,84) y ≤ 5%");
          return;
        }
        const M = Number(v.montoTotal);
        const n = parseInt(v.numeroCuotas);
        const cuota = this.cuota(M, tasa, n);
        Object.assign(it, {
          nombre: v.nombre,
          montoTotal: M,
          numeroCuotas: n,
          cuotasPagadas: parseInt(v.cuotasPagadas || 0),
          tasaMensual: tasa,
          cuotaMensual: cuota,
        });
      }
      this.save();
      this.renderAll();
      this.toast("Actualizado");
    });
  }

  del(key, id) {
    if (!confirm("¿Eliminar registro?")) return;
    const list = this.mesData[key] || [];
    this.data[this.mes][key] = list.filter((x) => x.id !== id);
    this.save();
    this.renderAll();
    this.toast("Eliminado");
  }

  addAhorroMonto(id) {
    const a = this.mesData.ahorros.find((x) => x.id === id);
    if (!a) return;
    const m = prompt("¿Cuánto agregar?", "0");
    const n = Number(m);
    if (n > 0) {
      a.actual += n;
      this.save();
      this.renderAll();
      this.toast("Ahorro agregado");
    }
  }

  /* ---------- Modal ---------- */
  showModal(title, fields, onSubmit) {
    const modal = document.getElementById("modal");
    const form = document.getElementById("modalForm");
    const titleEl = document.getElementById("modalTitle");

    titleEl.textContent = title;

    form.innerHTML =
      fields
        .map(([name, type, label, value]) => {
          const val = value != null ? value : "";
          const extra =
            type === "number"
              ? ' step="0.01" inputmode="decimal"'
              : type === "text" && name === "tasa"
              ? ' inputmode="decimal" placeholder="Ej: 1,84"'
              : "";
          return `<div class="field"><label>${label}</label><input type="${type}" id="f_${name}" value="${val}"${extra}></div>`;
        })
        .join("") +
      `
      <div class="actions">
        <button type="submit" id="submitModal" class="primary">Guardar</button>
        <button type="button" class="cancel" id="cancelModal">Cancelar</button>
      </div>`;

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");

    const cancelBtn = document.getElementById("cancelModal");
    const onCancel = () => this.closeModal();
    cancelBtn.addEventListener("click", onCancel, { once: true });

    const clickOutside = (ev) => {
      if (ev.target.id === "modal") this.closeModal();
    };
    modal.addEventListener("click", clickOutside, { once: true });

    const escHandler = (ev) => {
      if (ev.key === "Escape") this.closeModal();
    };
    document.addEventListener("keydown", escHandler, { once: true });

    form.onsubmit = (e) => {
      e.preventDefault();
      const vals = {};
      fields.forEach(([n]) => (vals[n] = document.getElementById("f_" + n).value));
      this.closeModal();
      setTimeout(() => onSubmit(vals), 0);
      modal.removeEventListener("click", clickOutside, { once: true });
      document.removeEventListener("keydown", escHandler, { once: true });
    };
  }

  closeModal() {
    const modal = document.getElementById("modal");
    const form = document.getElementById("modalForm");
    if (modal) modal.classList.add("hidden");
    if (modal) modal.setAttribute("aria-hidden", "true");
    if (form) form.innerHTML = "";
  }

  /* ---------- Finanzas ---------- */
  /** Cuota sistema francés */
  cuota(M, i, n) {
    if (!n || n <= 0) return 0;
    if (!i) return Math.round(M / n);
    const f = Math.pow(1 + i, n);
    return Math.round((M * i * f) / (f - 1));
  }

  /* ---------- Otros ---------- */
  export() {
    const data = { exportado: new Date().toISOString(), mes: this.mes, datos: this.data };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "organizador-financiero.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  reset() {
    if (confirm("¿Borrar datos locales?")) {
      localStorage.removeItem(this.key);
      location.reload();
    }
  }

  toast(m) {
    const t = this.toastEl;
    if (!t) return;
    t.textContent = m;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 1800);
  }
}

window.app = new Finanzas();