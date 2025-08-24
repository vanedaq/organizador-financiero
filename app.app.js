// ===== Utils
const fmt = v => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(v||0);
const num = v => { const s=String(v??'').replace(/\./g,'').replace(',','.'); const n=Number(s); return isFinite(n)?n:0; };

// ===== App
class Finanzas{
  constructor(){
    this.key='organizadorFinanciero';
    this.iniYM='2025-08';     // Mes inicial
    this.mes=this.iniYM;
    this.data=this.load();

    // --- Migración de datos viejos (normaliza tasas y cuotas)
    this.migrateData();

    this._saving=false;       // evita doble guardado
    this._bound=false;        // evita eventos duplicados

    this.cacheEls();
    this.bindUI();
    this.renderAll();

    if('serviceWorker' in navigator){ try{navigator.serviceWorker.register('./sw.js');}catch{} }
  }

  // === Migración: corrige tasas guardadas como % (ej. 184 en vez de 1.84)
  migrateData(){
    let changed = false;
    Object.keys(this.data || {}).forEach(mes=>{
      const d = this.data[mes] || {};
      ['tarjetas','creditos'].forEach(k=>{
        (d[k] || []).forEach(t=>{
          if (typeof t.tasaMensual === 'number' && t.tasaMensual >= 0.2) {
            // 0.2 = 20% mensual (improbable) => estaba en %.
            t.tasaMensual = t.tasaMensual / 100; // 184 -> 1.84 -> 0.0184
            t.cuotaMensual = this.cuota(t.montoTotal, t.tasaMensual, t.numeroCuotas);
            changed = true;
          }
        });
      });
    });
    if (changed) this.save();
  }

  // === Helper de tasa: acepta 1.84 / 1,84 / 1.842 / 184 / 184.2
  // Devuelve fracción mensual (0.0184)
  rateFromInput(pctStr){
    let p = num(pctStr);      // 1.84 | 1,84 | 184 | 184.2
    if (p > 15) p = p / 100;  // si viene "184" => 1.84
    if (p === 0) return 0;
    return p / 100;           // % -> fracción
  }

  // --- cache de elementos
  cacheEls(){
    this.tabs=[...document.querySelectorAll('.tab')];
    this.panels=[...document.querySelectorAll('.panel')];
    this.toastEl=document.getElementById('toast');
    this.sel=document.getElementById('mesSelector');
  }

  // --- eventos
  bindUI(){
    if(this._bound) return; this._bound=true;

    this.tabs.forEach(t=>t.addEventListener('click',()=>this.showTab(t.dataset.tab)));
    ['addIngreso','addFijo','addTarjeta','addCredito','addCompra','addAhorro'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.addEventListener('click',()=>this.openForm(id));
    });
    const exportBtn=document.getElementById('exportBtn');
    if(exportBtn) exportBtn.onclick=()=>this.export();
    const resetBtn=document.getElementById('resetBtn');
    if(resetBtn) resetBtn.onclick=()=>this.reset();
    const closeModalBtn=document.getElementById('closeModal');
    if(closeModalBtn) closeModalBtn.onclick=()=>this.closeModal();

    if(this.sel){
      this.sel.addEventListener('change',e=>{
        this.mes=e.target.value; this.ensureMonth(this.mes); this.renderAll(); this.toast('Mes cambiado');
      });
    }

    // acciones de listas por delegación (edit / del / addsave)
    document.body.addEventListener('click',(ev)=>{
      const a = ev.target.closest('a[data-action]');
      if(!a) return;
      ev.preventDefault();
      const act=a.dataset.action, key=a.dataset.key, id=parseInt(a.dataset.id);
      if(act==='edit') this.edit(key,id);
      if(act==='del') this.del(key,id);
      if(act==='addsave') this.addAhorroMonto(id);
    });

    this.buildMonths();
  }

  showTab(name){
    this.tabs.forEach(t=>t.classList.toggle('active', t.dataset.tab===name));
    this.panels.forEach(p=>p.classList.toggle('hidden', p.id!==name));
  }

  // --- meses
  buildMonths(){
    if(!this.sel) return;
    this.sel.innerHTML='';
    const [y,m]=this.iniYM.split('-').map(Number);
    let d=new Date(y,m-1,1);
    for(let i=0;i<=36;i++){
      const val= d.toISOString().slice(0,7);
      const txt= d.toLocaleDateString('es-CO',{month:'long',year:'numeric'});
      const opt=document.createElement('option'); opt.value=val; opt.textContent=txt;
      if(val===this.mes) opt.selected=true;
      this.sel.appendChild(opt);
      d.setMonth(d.getMonth()+1);
    }
    this.ensureMonth(this.mes);
  }

  ensureMonth(key){
    if(this.data[key]) return;
    const [y,m]=key.split('-').map(Number);
    let py=y, pm=m-1; if(pm<=0){pm=12;py--;}
    const prev=`${py}-${String(pm).padStart(2,'0')}`;
    if(this.data[prev]){
      const copy=JSON.parse(JSON.stringify(this.data[prev]));
      Object.values(copy).forEach(arr=>Array.isArray(arr)&&arr.forEach(it=>{it.id=this.uid(); it.fecha=`${key}-01`;}));
      this.data[key]=copy;
    }else{
      this.data[key]={ingresos:[],gastosFijos:[],tarjetas:[],creditos:[],gastosCompras:[],ahorros:[]};
    }
    this.save();
  }

  // --- base de datos local
  uid(){ return Date.now()+Math.floor(Math.random()*1e6); }
  load(){
    try{const s=localStorage.getItem(this.key); if(s) return JSON.parse(s);}catch{}
    const seed={};
    seed[this.iniYM]={
      ingresos:[{id:this.uid(),nombre:'Salario',monto:3500000,categoria:'Trabajo',fecha:`${this.iniYM}-01`}],
      gastosFijos:[{id:this.uid(),nombre:'Arriendo',monto:1200000,categoria:'Vivienda',fecha:`${this.iniYM}-01`}],
      tarjetas:[],
      creditos:[{id:this.uid(),nombre:'Crédito Vehículo',montoTotal:24200000,numeroCuotas:60,cuotasPagadas:0,tasaMensual:0.01842,cuotaMensual:this.cuota(24200000,0.01842,60),fecha:`${this.iniYM}-01`}],
      gastosCompras:[{id:this.uid(),nombre:'Supermercado',monto:400000,categoria:'Alimentación',fecha:`${this.iniYM}-10`}],
      ahorros:[{id:this.uid(),nombre:'Emergencias',meta:5000000,actual:1200000,fecha:`${this.iniYM}-01`}]
    };
    return seed;
  }
  save(){ try{localStorage.setItem(this.key, JSON.stringify(this.data));}catch{} }

  // --- render
  get mesData(){ this.ensureMonth(this.mes); return this.data[this.mes]; }
  renderAll(){
    const d=this.mesData;

    this.renderList('listaIngresos', d.ingresos, i=>this.rowIngreso(i,'ingresos'));
    this.renderList('listaFijos', d.gastosFijos, i=>this.rowFijo(i,'gastosFijos'));
    this.renderList('listaTarjetas', d.tarjetas, i=>this.rowTarjeta(i,'tarjetas'));
    this.renderList('listaCreditos', d.creditos, i=>this.rowCredito(i,'creditos'));
    this.renderList('listaCompras', d.gastosCompras, i=>this.rowCompra(i,'gastosCompras'));
    this.renderList('listaAhorros', d.ahorros, i=>this.rowAhorro(i,'ahorros'));

    const totalIng = d.ingresos.reduce((s,x)=>s+(x.monto||0),0);
    const totalFix = d.gastosFijos.reduce((s,x)=>s+(x.monto||0),0);
    const totalTar = d.tarjetas.reduce((s,x)=>s+(x.cuotaMensual||0),0);
    const totalCre = d.creditos.reduce((s,x)=>s+(x.cuotaMensual||0),0);
    const totalCom = d.gastosCompras.reduce((s,x)=>s+(x.monto||0),0);
    const totalAho = d.ahorros.reduce((s,x)=>s+(x.actual||0),0);
    const totalGastos = totalFix + totalTar + totalCre + totalCom;
    const libre = totalIng - totalGastos;

    const set = (id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=val; };
    set('sumIngresos',fmt(totalIng));
    set('sumFijos',fmt(totalFix));
    set('sumTarjetas',fmt(totalTar));
    set('sumCreditos',fmt(totalCre));
    set('sumCompras',fmt(totalCom));
    set('sumAhorros',fmt(totalAho));
    set('sumGastos',fmt(totalGastos));
    set('sumLibre',fmt(libre));

    this.renderDashboard(totalIng,totalGastos,libre);
    this.renderMetas(d.ahorros);
    this.renderHistorial();
    this.renderConsejos(totalIng,totalGastos);
  }
  renderList(id, arr, row){ const el=document.getElementById(id); if(!el) return; el.innerHTML= (arr.length?arr.map(row).join(''):'<p class="meta">Sin registros.</p>'); }
  rowIngreso(i,key){ return this.rowGeneric('💵', i, key, i.monto); }
  rowFijo(i,key){ return this.rowGeneric('🏠', i, key, i.monto); }
  rowCompra(i,key){ return this.rowGeneric('🛒', i, key, i.monto); }
  rowAhorro(i,key){
    const p=i.meta?((i.actual/i.meta)*100).toFixed(1):0;
    return `<div class="item"><div class="row"><div>💎 <b>${i.nombre}</b><div class="meta">Meta ${fmt(i.meta)} · ${i.fecha}</div></div><div><b>${fmt(i.actual)}</b></div></div><div class="actions"><a data-action="addsave" data-id="${i.id}" href="#">💰 Añadir</a> · <a data-action="edit" data-key="${key}" data-id="${i.id}" href="#">✏️ Editar</a> · <a data-action="del" data-key="${key}" data-id="${i.id}" href="#">🗑️ Eliminar</a></div></div>`;
  }
  rowTarjeta(i,key){
    return `<div class="item"><div class="row"><div>💳 <b>${i.nombre}</b><div class="meta">Cuota ${fmt(i.cuotaMensual)} · ${i.cuotasPagadas||0}/${i.numeroCuotas} · tasa ${(i.tasaMensual*100).toFixed(2)}%</div></div><div><b>Total ${fmt(i.montoTotal)}</b></div></div><div class="actions"><a data-action="edit" data-key="${key}" data-id="${i.id}" href="#">✏️ Editar</a> · <a data-action="del" data-key="${key}" data-id="${i.id}" href="#">🗑️ Eliminar</a></div></div>`;
  }
  rowCredito(i,key){
    return `<div class="item"><div class="row"><div>🏦 <b>${i.nombre}</b><div class="meta">Cuota ${fmt(i.cuotaMensual)} · ${i.cuotasPagadas||0}/${i.numeroCuotas} · tasa ${(i.tasaMensual*100).toFixed(2)}%</div></div><div><b>Total ${fmt(i.montoTotal)}</b></div></div><div class="actions"><a data-action="edit" data-key="${key}" data-id="${i.id}" href="#">✏️ Editar</a> · <a data-action="del" data-key="${key}" data-id="${i.id}" href="#">🗑️ Eliminar</a></div></div>`;
  }
  rowGeneric(icon,i,key,monto){
    return `<div class="item"><div class="row"><div>${icon} <b>${i.nombre}</b><div class="meta">${i.categoria||'General'} · ${i.fecha}</div></div><div><b>${fmt(monto)}</b></div></div><div class="actions"><a data-action="edit" data-key="${key}" data-id="${i.id}" href="#">✏️ Editar</a> · <a data-action="del" data-key="${key}" data-id="${i.id}" href="#">🗑️ Eliminar</a></div></div>`;
  }

  renderDashboard(ing,gastos,libre){
    const tasa = ing?((libre/ing)*100).toFixed(1):0;
    const color = libre>=0?'#00b894':'#ff6b6b';
    const el=document.getElementById('analisisMensual');
    if(el) el.innerHTML = `<div class="item"><b style="color:${color}">${fmt(libre)}</b> de balance — Ahorro ${tasa}%</div>`;
  }
  renderMetas(ahorros){
    const el=document.getElementById('metasAhorro'); if(!el) return;
    if(!ahorros.length){ el.innerHTML='<p class="meta">Crea una meta para empezar.</p>'; return; }
    el.innerHTML = ahorros.map(a=>{
      const p=a.meta?Math.min(100,(a.actual/a.meta)*100):0;
      return `<div class="item"><b>${a.nombre}</b><div class="meta">${fmt(a.actual)} / ${fmt(a.meta)}</div><div style="background:#eef0f6;height:8px;border-radius:6px;margin-top:6px"><div style="width:${p.toFixed(1)}%;height:100%;background:#6c5ce7;border-radius:6px"></div></div></div>`;
    }).join('');
  }
  renderHistorial(){
    const el=document.getElementById('tablaHistorial'); if(!el) return;
    const meses=Object.keys(this.data).sort();
    const rows=meses.map(m=>{
      const d=this.data[m];
      const ing=d.ingresos.reduce((s,x)=>s+(x.monto||0),0);
      const gas=d.gastosFijos.reduce((s,x)=>s+(x.monto||0),0)+d.tarjetas.reduce((s,x)=>s+(x.cuotaMensual||0),0)+d.creditos.reduce((s,x)=>s+(x.cuotaMensual||0),0)+d.gastosCompras.reduce((s,x)=>s+(x.monto||0),0);
      const bal=ing-gas; const p=ing?((bal/ing)*100).toFixed(1):0;
      return `<tr><td>${m}</td><td>${fmt(ing)}</td><td>${fmt(gas)}</td><td style="color:${bal>=0?'#00b894':'#ff6b6b'}">${fmt(bal)}</td><td>${p}%</td></tr>`;
    }).join('');
    el.innerHTML = `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th><th>Balance</th><th>% Ahorro</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  renderConsejos(ing,gas){
    const el=document.getElementById('recomendaciones'); if(!el) return;
    const libre=ing-gas; const p=ing?((libre/ing)*100):0;
    const list=[];
    if(libre<0) list.push({t:'🚨 Gastos Excesivos',d:'Tus gastos superan ingresos. Revisa gastos no esenciales.'});
    if(p<10) list.push({t:'⚠️ Mejora tu ahorro',d:`Estás ahorrando ${p.toFixed(1)}%. Intenta llegar al 20%.`});
    list.push({t:'📊 50/30/20',d:'50% necesidades, 30% gustos, 20% ahorro/inversión.'});
    list.push({t:'💳 Tarjetas',d:'Paga el total mensual para evitar intereses.'});
    el.innerHTML = list.map(c=>`<div class="item"><b>${c.t}</b><div class="meta">${c.d}</div></div>`).join('');
  }

  // ===== CRUD con modal (cierre inmediato y seguro)
  openForm(action){
    const map={
      addIngreso:{title:'Nuevo Ingreso',fields:[['nombre','text','Nombre'],['monto','number','Monto'],['categoria','text','Categoría','Trabajo'],['fecha','date','Fecha',`${this.mes}-01`]]},
      addFijo:{title:'Nuevo Gasto Fijo',fields:[['nombre','text','Nombre'],['monto','number','Monto'],['categoria','text','Categoría','Vivienda'],['fecha','date','Fecha',`${this.mes}-01`]]},
      addCompra:{title:'Nueva Compra',fields:[['nombre','text','Descripción'],['monto','number','Monto'],['categoria','text','Categoría','Alimentación'],['fecha','date','Fecha',`${this.mes}-01`]]},
      addAhorro:{title:'Nueva Meta de Ahorro',fields:[['nombre','text','Nombre'],['meta','number','Meta'],['actual','number','Actual','0'],['fecha','date','Fecha',`${this.mes}-01`]]},
      addTarjeta:{title:'Nueva Tarjeta',fields:[['nombre','text','Nombre'],['montoTotal','number','Monto total'],['numeroCuotas','number','Cuotas'],['cuotasPagadas','number','Pagadas','0'],['tasa','text','