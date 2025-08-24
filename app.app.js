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

    // --- Migración de datos viejos
    this.migrateData();

    this._saving=false;
    this._bound=false;

    this.cacheEls();
    this.bindUI();
    this.renderAll();

    if('serviceWorker' in navigator){ try{navigator.serviceWorker.register('./sw.js');}catch{} }
  }

  // === Migración: corrige tasas guardadas como % exageradas
  migrateData(){
    let changed = false;
    Object.keys(this.data || {}).forEach(mes=>{
      const d = this.data[mes] || {};
      ['tarjetas','creditos'].forEach(k=>{
        (d[k] || []).forEach(t=>{
          if (typeof t.tasaMensual === 'number' && t.tasaMensual > 0.2) {
            // si es mayor al 20% mensual es imposible => dividir
            t.tasaMensual = t.tasaMensual / 100;
            t.cuotaMensual = this.cuota(t.montoTotal, t.tasaMensual, t.numeroCuotas);
            changed = true;
          }
        });
      });
    });
    if (changed) this.save();
  }

  // === Helper de tasa
  rateFromInput(pctStr){
    let p = num(pctStr); // convierte "1,84", "1.84", "184", "1842"
    if (p > 1000) p = p / 100;   // 1842 -> 18.42
    if (p > 100) p = p / 10;     // 184 -> 18.4
    if (p > 20)  p = p / 10;     // 18.4 -> 1.84
    return p / 100;              // % -> fracción
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

    // acciones de listas por delegación
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
    return `<div class="item"><div class="row"><div>💎 <b>${i.nombre}</b></div><div><b>${fmt(i.actual)}</b></div></div></div>`;
  }
  rowTarjeta(i,key){
    return `<div class="item"><div class="row"><div>💳 <b>${i.nombre}</b><div class="meta">Cuota ${fmt(i.cuotaMensual)} · ${i.cuotasPagadas||0}/${i.numeroCuotas} · tasa ${(i.tasaMensual*100).toFixed(2)}%</div></div><div><b>Total ${fmt(i.montoTotal)}</b></div></div></div>`;
  }
  rowCredito(i,key){
    return `<div class="item"><div class="row"><div>🏦 <b>${i.nombre}</b><div class="meta">Cuota ${fmt(i.cuotaMensual)} · ${i.cuotasPagadas||0}/${i.numeroCuotas} · tasa ${(i.tasaMensual*100).toFixed(2)}%</div></div><div><b>Total ${fmt(i.montoTotal)}</b></div></div></div>`;
  }
  rowGeneric(icon,i,key,monto){
    return `<div class="item"><div class="row"><div>${icon} <b>${i.nombre}</b></div><div><b>${fmt(monto)}</b></div></div></div>`;
  }

  // CRUD con modal (abreviado para espacio)
  openForm(action){ /* igual que antes pero usa this.rateFromInput(v.tasa) */ }
  edit(key,id){ /* igual que antes pero en campos: (it.tasaMensual*100).toFixed(2) */ }

  del(key,id){ if(!confirm('¿Eliminar?')) return; this.data[this.mes][key]=this.mesData[key].filter(x=>x.id!==id); this.save(); this.renderAll(); }
  addAhorroMonto(id){ /* igual que antes */ }

  closeModal(){ const modal=document.getElementById('modal'); const form=document.getElementById('modalForm'); if(modal) modal.classList.add('hidden'); if(form) form.innerHTML=''; }

  cuota(M,i,n){ if(!n||n<=0) return 0; if(!i) return Math.round(M/n); const f=Math.pow(1+i,n); return Math.round(M*i*f/(f-1)); }

  export(){ const blob=new Blob([JSON.stringify(this.data,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='datos.json'; a.click(); }
  reset(){ localStorage.removeItem(this.key); location.reload(); }
  toast(m){ const t=this.toastEl; if(!t) return; t.textContent=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2000); }
}

window.app=new Finanzas();