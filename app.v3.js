// Utilidades
const fmt = v => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(v||0);
const num = v => {const s=String(v??'').replace(/\./g,'').replace(',','.');const n=Number(s);return isFinite(n)?n:0;};
const ym = (y,m)=> `${y}-${String(m).padStart(2,'0')}`;
const labelYM = (y,m)=> new Date(y,m-1,1).toLocaleDateString('es-CO',{month:'long',year:'numeric'});

class App{
  constructor(){
    this.storageKey='organizadorFinanciero';
    this.iniYM='2025-08'; // Agosto 2025
    this.mesActual=this.iniYM;
    this.datos=this.load();
    this.setupMonths();
    this.bind();
    if(!location.hash) location.hash='#dashboard';
    this.render();
    this.updateActiveTab();
    addEventListener('hashchange',()=>this.updateActiveTab());
    if('serviceWorker' in navigator){ try{navigator.serviceWorker.register('./sw.js');}catch(e){} }
  }

  setupMonths(){
    const sel=document.getElementById('mesSelector'); sel.innerHTML='';
    const [sy,sm]=this.iniYM.split('-').map(Number);
    let d=new Date(sy, sm-1, 1);
    for(let i=0;i<=36;i++){
      const y=d.getFullYear(), m=d.getMonth()+1;
      const opt=document.createElement('option');
      opt.value=ym(y,m); opt.textContent=labelYM(y,m);
      if(opt.value===this.mesActual) opt.selected=true;
      sel.appendChild(opt);
      d.setMonth(d.getMonth()+1);
    }
    this.ensureClone(this.mesActual);
  }

  ensureClone(keyYM){
    if(this.datos[keyYM]) return;
    const [y,m]=keyYM.split('-').map(Number);
    let py=y, pm=m-1; if(pm<=0){pm=12;py--;}
    const prev=ym(py,pm);
    if(this.datos[prev]){
      const clone=JSON.parse(JSON.stringify(this.datos[prev]));
      Object.keys(clone).forEach(k=>{
        (clone[k]||[]).forEach(it=>{ it.id=Date.now()+Math.floor(Math.random()*10000); it.fecha=`${keyYM}-01`; });
      });
      this.datos[keyYM]=clone;
    }else{
      this.datos[keyYM]={ingresos:[],gastosFijos:[],tarjetas:[],creditos:[],gastosCompras:[],ahorros:[]};
    }
    this.save();
  }

  load(){
    try{ const s=localStorage.getItem(this.storageKey); if(s) return JSON.parse(s); }catch(e){}
    const seed={};
    seed[this.iniYM]={
      ingresos:[{id:1,nombre:'Salario',monto:3500000,categoria:'Trabajo',fecha:`${this.iniYM}-01`}],
      gastosFijos:[{id:2,nombre:'Arriendo',monto:1200000,categoria:'Vivienda',fecha:`${this.iniYM}-01`}],
      tarjetas:[],
      creditos:[{id:3,nombre:'Crédito Vehículo',montoTotal:24200000,numeroCuotas:60,cuotasPagadas:0,tasaMensual:0.01842,cuotaMensual:this.cuota(24200000,0.01842,60),fecha:`${this.iniYM}-01`}],
      gastosCompras:[],
      ahorros:[{id:4,nombre:'Emergencias',meta:5000000,actual:1200000,fecha:`${this.iniYM}-01`}]
    };
    return seed;
  }
  save(){ localStorage.setItem(this.storageKey, JSON.stringify(this.datos)); }

  bind(){
    document.getElementById('mesSelector').addEventListener('change',(e)=>{
      this.mesActual=e.target.value; this.ensureClone(this.mesActual); this.render(); this.toast('Mes cambiado');
    });
    document.getElementById('addIngreso').onclick=()=>this.addIngreso();
    document.getElementById('addFijo').onclick=()=>this.addFijo();
    document.getElementById('addCompra').onclick=()=>this.addCompra();
    document.getElementById('addAhorro').onclick=()=>this.addAhorro();
    document.getElementById('addTarjeta').onclick=()=>this.addTarjeta();
    document.getElementById('addCredito').onclick=()=>this.addCredito();
    document.getElementById('exportBtn').onclick=()=>this.export();
    document.getElementById('resetBtn').onclick=()=>this.reset();
  }

  updateActiveTab(){
    document.querySelectorAll('.tab').forEach(a=>a.classList.remove('active'));
    const id=(location.hash||'#dashboard').slice(1);
    const el=document.getElementById('tab-'+id);
    if(el) el.classList.add('active');
  }

  arr(key){ this.ensureClone(this.mesActual); return this.datos[this.mesActual][key]||[]; }
  sum(arr, field){ return (arr||[]).reduce((s,x)=>s+(num(x[field])||0),0); }

  render(){
    const ingresos=this.arr('ingresos');
    document.getElementById('listaIngresos').innerHTML = ingresos.map(i=>this.rowIngreso(i)).join('') || '<p class="small">No hay ingresos.</p>';

    const fijos=this.arr('gastosFijos');
    document.getElementById('listaFijos').innerHTML = fijos.map(i=>this.rowFijo(i)).join('') || '<p class="small">No hay fijos.</p>';

    const compras=this.arr('gastosCompras');
    document.getElementById('listaCompras').innerHTML = compras.map(i=>this.rowCompra(i)).join('') || '<p class="small">No hay compras.</p>';

    const ahorros=this.arr('ahorros');
    document.getElementById('listaAhorros').innerHTML = ahorros.map(i=>this.rowAhorro(i)).join('') || '<p class="small">No hay metas.</p>';

    const creditos=this.arr('creditos');
    document.getElementById('listaCreditos').innerHTML = creditos.map(i=>this.rowCredito(i)).join('') || '<p class="small">No hay créditos.</p>';

    const tarjetas=this.arr('tarjetas');
    document.getElementById('listaTarjetas').innerHTML = tarjetas.map(i=>this.rowTarjeta(i)).join('') || '<p class="small">No hay tarjetas.</p>';

    const d=this.datos[this.mesActual];
    const tIng=this.sum(d.ingresos,'monto');
    const tFix=this.sum(d.gastosFijos,'monto');
    const tTar=this.sum(d.tarjetas,'cuotaMensual');
    const tCre=this.sum(d.creditos,'cuotaMensual');
    const tCom=this.sum(d.gastosCompras,'monto');
    const tGas=tFix+tTar+tCre+tCom;
    const libre=tIng-tGas;
    document.getElementById('sumIngresos').textContent=fmt(tIng);
    document.getElementById('sumFijos').textContent=fmt(tFix);
    document.getElementById('sumTarjetas').textContent=fmt(tTar);
    document.getElementById('sumCreditos').textContent=fmt(tCre);
    document.getElementById('sumCompras').textContent=fmt(tCom);
    document.getElementById('sumGastos').textContent=fmt(tGas);
    document.getElementById('sumLibre').textContent=fmt(libre);

    document.getElementById('analisis').innerHTML = `<div class="item"><b>Balance:</b> ${fmt(libre)} — Ahorro ${tIng?((libre/tIng)*100).toFixed(1):0}%</div>`;
    document.getElementById('historial').innerHTML = Object.keys(this.datos).sort().map(m=>{
      const x=this.datos[m], I=this.sum(x.ingresos,'monto'), G=this.sum(x.gastosFijos,'monto')+this.sum(x.tarjetas,'cuotaMensual')+this.sum(x.creditos,'cuotaMensual')+this.sum(x.gastosCompras,'monto');
      return `<div class="item">📅 ${m}: Ingresos ${fmt(I)} · Gastos ${fmt(G)} · Balance ${fmt(I-G)}</div>`;
    }).join('');
  }

  rowIngreso(i){return `<div class="item"><div class="row"><div>💵 <b>${i.nombre}</b><div class="small">${i.categoria||'General'} · ${i.fecha}</div></div><div><b>${fmt(i.monto)}</b></div></div><div class="small"><a href="#" onclick="app.edit('ingresos',${i.id});return false;">✏️ Editar</a> · <a href="#" onclick="app.del('ingresos',${i.id});return false;">🗑️ Eliminar</a></div></div>`;}
  rowFijo(i){return `<div class="item"><div class="row"><div>🏠 <b>${i.nombre}</b><div class="small">${i.categoria||'General'} · ${i.fecha}</div></div><div><b>${fmt(i.monto)}</b></div></div><div class="small"><a href="#" onclick="app.edit('gastosFijos',${i.id});return false;">✏️ Editar</a> · <a href="#" onclick="app.del('gastosFijos',${i.id});return false;">🗑️ Eliminar</a></div></div>`;}
  rowCompra(i){return `<div class="item"><div class="row"><div>🛒 <b>${i.nombre}</b><div class="small">${i.categoria||'General'} · ${i.fecha}</div></div><div><b>${fmt(i.monto)}</b></div></div><div class="small"><a href="#" onclick="app.edit('gastosCompras',${i.id});return false;">✏️ Editar</a> · <a href="#" onclick="app.del('gastosCompras',${i.id});return false;">🗑️ Eliminar</a></div></div>`;}
  rowAhorro(i){const p=i.meta?((i.actual/i.meta)*100).toFixed(1):0;return `<div class="item"><div class="row"><div>💎 <b>${i.nombre}</b><div class="small">Meta ${fmt(i.meta)}</div></div><div><b>${fmt(i.actual)}</b></div></div><div class="small">Progreso ${p}% · <a href="#" onclick="app.sumAhorro(${i.id});return false;">💰 Añadir</a> · <a href="#" onclick="app.edit('ahorros',${i.id});return false;">✏️ Editar</a> · <a href="#" onclick="app.del('ahorros',${i.id});return false;">🗑️ Eliminar</a></div></div>`;}
  rowCredito(i){return `<div class="item"><div class="row"><div>🏦 <b>${i.nombre}</b><div class="small">Cuota ${fmt(i.cuotaMensual)} · ${i.cuotasPagadas||0}/${i.numeroCuotas} · tasa ${(i.tasaMensual*100).toFixed(3)}%</div></div><div><b>Total ${fmt(i.montoTotal)}</b></div></div><div class="small"><a href="#" onclick="app.edit('creditos',${i.id});return false;">✏️ Editar</a> · <a href="#" onclick="app.del('creditos',${i.id});return false;">🗑️ Eliminar</a></div></div>`;}
  rowTarjeta(i){return `<div class="item"><div class="row"><div>💳 <b>${i.nombre}</b><div class="small">Cuota ${fmt(i.cuotaMensual)} · ${i.cuotasPagadas||0}/${i.numeroCuotas} · tasa ${(i.tasaMensual*100).toFixed(3)}%</div></div><div><b>Total ${fmt(i.montoTotal)}</b></div></div><div class="small"><a href="#" onclick="app.edit('tarjetas',${i.id});return false;">✏️ Editar</a> · <a href="#" onclick="app.del('tarjetas',${i.id});return false;">🗑️ Eliminar</a></div></div>`;}

  addIngreso(){
    const nombre=prompt('Nombre del ingreso:','Salario'); if(!nombre) return;
    const monto=num(prompt('Monto (COP):','0')); if(monto<=0) return alert('Monto inválido');
    const categoria=prompt('Categoría:','Trabajo')||'General';
    const fecha=`${this.mesActual}-01`;
    this.arr('ingresos').push({id:Date.now(),nombre,monto,categoria,fecha}); this.save(); this.render();
  }
  addFijo(){
    const nombre=prompt('Nombre del gasto fijo:','Arriendo'); if(!nombre) return;
    const monto=num(prompt('Monto (COP):','0')); if(monto<=0) return alert('Monto inválido');
    const categoria=prompt('Categoría:','Vivienda')||'General'; const fecha=`${this.mesActual}-01`;
    this.arr('gastosFijos').push({id:Date.now(),nombre,monto,categoria,fecha}); this.save(); this.render();
  }
  addCompra(){
    const nombre=prompt('Descripción compra:','Supermercado'); if(!nombre) return;
    const monto=num(prompt('Monto (COP):','0')); if(monto<=0) return alert('Monto inválido');
    const categoria=prompt('Categoría:','Alimentación')||'General'; const fecha=`${this.mesActual}-01`;
    this.arr('gastosCompras').push({id:Date.now(),nombre,monto,categoria,fecha}); this.save(); this.render();
  }
  addAhorro(){
    const nombre=prompt('Nombre de la meta:','Vacaciones'); if(!nombre) return;
    const meta=num(prompt('Meta (COP):','0')); if(meta<=0) return alert('Meta inválida');
    const actual=num(prompt('Monto actual (COP):','0'))||0; if(actual>meta) return alert('Actual > meta');
    const fecha=`${this.mesActual}-01`;
    this.arr('ahorros').push({id:Date.now(),nombre,meta,actual,fecha}); this.save(); this.render();
  }
  addTarjeta(){ this._addDeuda('tarjetas'); }
  addCredito(){ this._addDeuda('creditos'); }
  _addDeuda(tipo){
    const nombre=prompt(`Nombre de ${tipo==='tarjetas'?'la tarjeta':'crédito'}:`,'Principal'); if(!nombre) return;
    const montoTotal=num(prompt('Monto total (COP):','0')); if(montoTotal<=0) return alert('Monto inválido');
    const n=parseInt(prompt('Número de cuotas:','12')); if(!n||n<=0) return alert('Cuotas inválidas');
    const pag=parseInt(prompt('Cuotas pagadas:','0'))||0; if(pag>=n) return alert('Pagadas >= total');
    const tasaM = num(prompt('Tasa mensual % (usa punto o coma, ej. 1.842):','1.842'))/100;
    const cuota=this.cuota(montoTotal,tasaM,n);
    const fecha=`${this.mesActual}-01`;
    this.arr(tipo).push({id:Date.now(),nombre,montoTotal,numeroCuotas:n,cuotasPagadas:pag,tasaMensual:tasaM,cuotaMensual:cuota,fecha});
    this.save(); this.render();
  }
  edit(key,id){
    const list=this.arr(key); const item=list.find(x=>x.id===id); if(!item) return;
    if(key==='ingresos'||key==='gastosFijos'||key==='gastosCompras'){
      const nombre=prompt('Nombre:', item.nombre)||item.nombre;
      const monto=num(prompt('Monto (COP):', item.monto)); if(monto<=0) return alert('Monto inválido');
      item.nombre=nombre; item.monto=monto;
    }else if(key==='ahorros'){
      const nombre=prompt('Meta:', item.nombre)||item.nombre;
      const meta=num(prompt('Objetivo (COP):', item.meta)); if(meta<=0) return alert('Meta inválida');
      const actual=num(prompt('Actual (COP):', item.actual))||0; if(actual>meta) return alert('Actual > meta');
      item.nombre=nombre; item.meta=meta; item.actual=actual;
    }else{
      const nombre=prompt('Nombre:', item.nombre)||item.nombre;
      const montoTotal=num(prompt('Monto total (COP):', item.montoTotal)); if(montoTotal<=0) return alert('Monto inválido');
      const n=parseInt(prompt('N° cuotas:', item.numeroCuotas)); if(!n||n<=0) return alert('Cuotas inválidas');
      const pag=parseInt(prompt('Cuotas pagadas:', item.cuotasPagadas||0))||0; if(pag>=n) return alert('Pagadas >= total');
      const tasaM=num(prompt('Tasa mensual %:', (item.tasaMensual*100).toFixed(3)))/100;
      const cuota=this.cuota(montoTotal,tasaM,n);
      Object.assign(item,{nombre,montoTotal,numeroCuotas:n,cuotasPagadas:pag,tasaMensual:tasaM,cuotaMensual:cuota});
    }
    this.save(); this.render();
  }
  del(key,id){ if(confirm('¿Eliminar?')){ this.datos[this.mesActual][key]=this.arr(key).filter(x=>x.id!==id); this.save(); this.render(); } }
  sumAhorro(id){ const a=this.arr('ahorros').find(x=>x.id===id); if(!a) return; const m=num(prompt('¿Cuánto añadir?','0')); if(m>0){ a.actual+=m; this.save(); this.render(); } }

  cuota(monto, i, n){
    if(i===0) return Math.round(monto/n);
    const f=Math.pow(1+i,n);
    return Math.round((monto*i*f)/(f-1));
  }

  export(){
    const data={exportado:new Date().toISOString(),datos:this.datos};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download='organizador-financiero.json'; a.click(); URL.revokeObjectURL(url);
  }
  reset(){ if(confirm('¿Borrar datos locales?')){ localStorage.removeItem(this.storageKey); this.datos=this.load(); this.mesActual=this.iniYM; this.setupMonths(); this.render(); } }

  toast(m){ const t=document.getElementById('toast'); t.textContent=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1800); }
}

window.app = new App();
