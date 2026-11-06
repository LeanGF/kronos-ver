// Oferta editable y comparación local. Solo el botón Importar llama a Gemini.
const comUI = {oferta:null, huella:null, revisada:false, revision:0, opciones:[], pesos:{libres:65,huecos:10,tranquilos:10,entreno:10,viaje:5}, elegidas:new Set(), desde:'',hasta:'', cargando:false};
const comNombres = {libres:'Días libres',huecos:'Huecos cortos',tranquilos:'Días tranquilos',entreno:'Entrenamiento',viaje:'Todo junto y menos viaje'};

async function comPeticion(pedido) {
  if (soloLectura) throw Error('Conectate a la PC para trabajar con la oferta.');
  const r=await fetch('/api/comisiones',{method:pedido?'POST':'GET',headers:cabeceras(),...(pedido?{body:JSON.stringify(pedido)}:{})});
  const d=await r.json();
  if(!r.ok) throw Error(d.error||'No pude abrir la oferta.');
  return d;
}
async function comCargar() {
  comUI.cargando=true;
  try {comUI.oferta=(await comPeticion()).oferta;} catch(e) {avisar(e.message);}
  finally {comUI.cargando=false;if(vista==='comisiones')dibujar();}
}
function comInvalidar() {comUI.revision++;comUI.huella=null;comUI.revisada=false;comUI.opciones=[];comUI.elegidas.clear();formularioPendiente=true;}
function comCampo(i,k,v) {comUI.oferta.filas[i][k]=v;comInvalidar();comEstadoRevision();}
function comEstadoRevision() {const e=$('#com-revision');if(e)e.textContent='Tabla modificada: revisala y guardala antes de calcular.';const b=$('#com-calcular');if(b)b.disabled=true;const r=$('#com-resultados');if(r)r.innerHTML='';}
function comDia(i,d) {const f=comUI.oferta.filas[i];f.dias=f.dias.includes(d)?f.dias.filter(x=>x!==d):[...f.dias,d];comInvalidar();dibujar();}
function comAgregar() {comUI.oferta.filas.push({materia:'',comision:'',parte:'integrada',dias:[],desde:'',hasta:'',sede:''});comInvalidar();dibujar();}
function comQuitar(i) {comUI.oferta.filas.splice(i,1);comInvalidar();dibujar();}
function comPeriodo(k,v) {comUI[k]=v;comUI.opciones=[];comUI.elegidas.clear();const r=$('#com-resultados');if(r)r.innerHTML='';} // cambiar las fechas no toca la tabla: no hace falta volver a revisarla, solo recalcular
function comVistaFila(f,i) {
  const campo=(k,t,extra='')=>`<label>${t}<input value="${esc(f[k])}" ${extra} onchange="comCampo(${i},'${k}',this.value)" ${bloqueado()}></label>`;
  return `<article class="tarjeta com-fila"><b>Fila ${i+1}</b><div class="com-campos">${campo('materia','Materia')}${campo('comision','Comisión')}${campo('parte','Parte (teórico / práctico / integrada)')}${campo('sede','Sede u hospital')}${campo('desde','Desde','inputmode="numeric" oninput="formatoHora(this)"')}${campo('hasta','Hasta','inputmode="numeric" oninput="formatoHora(this)"')}</div><div class="acciones">${DIAS_CORTOS.map((d,j)=>`<button class="boton chico ${f.dias.includes(j)?'principal':''}" aria-pressed="${f.dias.includes(j)}" onclick="comDia(${i},${j})" ${bloqueado()}>${d}</button>`).join('')}<button class="boton chico peligro" onclick="comQuitar(${i})" ${bloqueado()}>Quitar fila</button></div></article>`;
}
function vistaComisiones() {
  let html=encabezado('08','Comisiones','Elegí cómo cursar','Cargá la oferta, revisá las filas y compará. El cálculo no usa IA.');
  if(soloLectura)return html+'<div class="tarjeta">La oferta se edita y calcula con conexión a tu PC.</div>';
  if(!comUI.oferta) {if(!comUI.cargando)comCargar();return html+'<p>Cargando oferta…</p>';}
  html+=`<details class="tarjeta"><summary>Importar oferta pública con Gemini</summary><p class="suave">Solo se manda el texto o archivo que elijas acá. Con la clave gratis, Google puede usarlo para mejorar sus productos. No incluyas datos de pacientes. La lectura puede omitir filas: revisá todo con el original.</p><label>Texto de la oferta<textarea id="com-texto" maxlength="30000"></textarea></label><label class="boton claro">Elegir foto o PDF (hasta 1 MB)<input id="com-archivo" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" hidden onchange="$('#com-archivo-nombre').textContent=this.files[0]?.name||''"></label><span id="com-archivo-nombre" class="suave"></span><button class="boton" id="com-importar" onclick="comImportar()">Importar como tabla nueva</button></details>`;
  html+=`<p class="suave">Misma materia + parte + comisión agrupan sus franjas. Usá «integrada» si teórico y práctico se eligen juntos; partes separadas se combinan libremente.</p>${comUI.oferta.filas.map(comVistaFila).join('')}<button class="boton" onclick="comAgregar()">+ Agregar fila a mano</button>`;
  html+=`<div class="tarjeta"><h3>Viajes y entrenamiento</h3><p class="suave">Minutos que buscaste en Maps. Una línea por viaje: casa | Hospital A = 40, o Hospital A | Hospital B = 25. Se toma igual en ambos sentidos. Sin dato: 0 y aviso.</p><textarea id="com-viajes" onchange="comViajes(this.value)">${esc(Object.entries(comUI.oferta.viajes).map(([k,v])=>k+' = '+v).join('\n'))}</textarea><label>Minutos para entrenar entre las 7 y las 22<input data-num inputmode="numeric" value="${comUI.oferta.entreno_min}" onchange="comEntreno(this.value)"></label><p class="suave">El gimnasio es movible; trabajo, cursadas y demás fijos bloquean. Los días sin hueco para entrenar restan puntos.</p><div class="fila"><label>Inicio del cuatrimestre<input placeholder="día/mes/año" value="${esc(comUI.desde)}" onchange="comPeriodo('desde',this.value)"></label><label>Fin del cuatrimestre<input placeholder="día/mes/año" value="${esc(comUI.hasta)}" onchange="comPeriodo('hasta',this.value)"></label></div><div class="acciones"><button class="boton" onclick="comRevisar()">Revisé la tabla: guardar oferta</button><button class="boton principal" id="com-calcular" onclick="comCalcular()" ${comUI.revisada?'':'disabled'}>Calcular sin IA</button></div><p class="suave" id="com-revision">${comUI.revisada?'Tabla revisada y guardada.':'Revisá las filas antes de calcular.'}</p></div>`;
  html+='<div id="com-resultados">'+comResultados()+'</div>';
  const grupos=[...new Set(estado.fijos.map(f=>f.grupo_comisiones).filter(Boolean))];
  html+=grupos.map(g=>`<p><button class="boton peligro" onclick="comDeshacer('${esc(g)}')">Deshacer combinación aplicada</button></p>`).join('');
  return html;
}
function comEntreno(v) {comUI.oferta.entreno_min=Number(v);comInvalidar();comEstadoRevision();}
function comViajes(v) {
  const viajes={};
  for(const linea of v.split('\n').filter(x=>x.trim())) {
    const m=linea.match(/^\s*([^|=]+)\|([^|=]+)=\s*(\d+)\s*$/);
    if(!m) {comInvalidar();comEstadoRevision();return avisar('Viajes: casa | Hospital = 40. Corregí la línea antes de guardar.');}
    viajes[m[1].trim()+'|'+m[2].trim()]=Number(m[3]);
  }
  comUI.oferta.viajes=viajes;comInvalidar();comEstadoRevision();
}
async function comImportar() {
  const b=$('#com-importar');b.disabled=true;guardadosEnCurso++;
  try {
    const pedido={operacion:'importar',texto:$('#com-texto').value};const f=$('#com-archivo').files[0];
    if(f) {if(f.size>1000000)throw Error('Elegí un archivo de hasta 1 MB.');pedido.adjunto={mime:f.type,data:await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.onerror=()=>no(Error('No pude leer el archivo.'));r.readAsDataURL(f);})};}
    const d=await comPeticion(pedido);comUI.oferta=d.oferta;comInvalidar();dibujar();avisar('Tabla nueva sin guardar: revisá que no falten filas.');
  } catch(e) {avisar(e.message);} finally {b.disabled=false;guardadosEnCurso--;}
}
async function comRevisar() {
  guardadosEnCurso++;
  try {
    // Leer viajes en este momento evita guardar una corrección inválida todavía visible.
    const lineas=$('#com-viajes').value;
    if(lineas.split('\n').filter(x=>x.trim()).some(x=>!/^\s*([^|=]+)\|([^|=]+)=\s*(\d+)\s*$/.test(x)))throw Error('Corregí los viajes antes de guardar.');
    comViajes(lineas);
    const revision=comUI.revision;
    const d=await comPeticion({operacion:'guardar',oferta:comUI.oferta});
    if(revision!==comUI.revision)throw Error('La tabla cambió mientras se guardaba. Revisá y guardá otra vez.');
    comUI.oferta=d.oferta;comUI.huella=d.huella;comUI.revisada=true;formularioPendiente=false;dibujar();
  } catch(e) {avisar(e.message);} finally {guardadosEnCurso--;}
}
async function comCalcular() {
  if(!comUI.revisada)return avisar('Revisá y guardá la tabla.');
  const desde=leerFecha(comUI.desde),hasta=leerFecha(comUI.hasta);
  if(!desde||!hasta)return avisar('Completá las fechas del cuatrimestre.');
  guardadosEnCurso++;
  const revision=comUI.revision;
  try {const d=await comPeticion({operacion:'calcular',huella:comUI.huella,revisada:true,desde,hasta});if(revision!==comUI.revision)throw Error('La oferta cambió: volvé a revisar y calcular.');comUI.opciones=d.opciones;comUI.version=d.version;comUI.periodo={desde,hasta};comUI.elegidas.clear();dibujar();if(!d.opciones.length)avisar('No hay combinaciones sin choques con estos fijos.');}
  catch(e) {avisar(e.message);} finally {guardadosEnCurso--;}
}
function comNota(m,p=comUI.pesos) {
  const v={libres:m.libres/7,huecos:1/(1+m.huecos/60),tranquilos:1/(1+2*m.tranquilos),entreno:1-m.entreno/7,viaje:1/(1+m.viaje/120+Math.max(0,m.salidas-(7-m.libres)))};
  return Math.round(1000*Object.keys(v).reduce((n,k)=>n+v[k]*p[k],0)/Math.max(1,Object.values(p).reduce((a,b)=>a+b,0)))/10;
}
function comOrdenadas() {return comUI.opciones.map((o,i)=>({...o,indice:i,nota:comNota(o.metricas)})).sort((a,b)=>b.nota-a.nota||a.indice-b.indice);}
function comPeso(k,v) {const n=Number(v);if(!Number.isFinite(n)||n<0||n>100)return avisar('Pesos: de 0 a 100.');comUI.pesos[k]=n;$('#com-resultados').innerHTML=comResultados();}
function comEnfoque(k) {comUI.pesos=k==='libres'?{libres:60,huecos:10,tranquilos:10,entreno:10,viaje:10}:k==='tranquilos'?{libres:15,huecos:10,tranquilos:55,entreno:15,viaje:5}:{libres:10,huecos:35,tranquilos:5,entreno:10,viaje:40};$('#com-resultados').innerHTML=comResultados();}
function comComparar(i) {comUI.elegidas.has(i)?comUI.elegidas.delete(i):comUI.elegidas.add(i);$('#com-resultados').innerHTML=comResultados();}
function comGrilla(o) {const filas=comUI.oferta.filas.filter(f=>o.ids.includes(f.id));return `<div class="com-semana">${DIAS_CORTOS.map((d,j)=>`<div class="com-dia"><b>${d}</b>${filas.filter(f=>f.dias.includes(j)).sort((a,b)=>a.desde.localeCompare(b.desde)).map(f=>`<div class="com-clase"><b>${esc(f.desde)}–${esc(f.hasta)}</b><span>${esc(f.materia)}</span><small>${esc(f.comision)} · ${esc(f.parte)} · ${esc(f.sede)}</small></div>`).join('')||'<span class="suave">Libre</span>'}</div>`).join('')}</div>`;}
function comResultados() {
  if(!comUI.opciones.length)return '';
  const orden=comOrdenadas(), top=orden.slice(0,3), seleccion=orden.filter(o=>comUI.elegidas.has(o.indice));
  const frase=o=>{const m=o.metricas;return `${m.libres} días libres · ${m.tranquilos?'Días con 3 o más materias':'Días más tranquilos'} · ${m.salidas<=7-m.libres?'Salís una sola vez por día':m.salidas+' salidas semanales'} · ${m.viaje} min de viaje · ${m.entreno} días sin hueco para entrenar`;};
  return `<h2>Las mejores opciones (${orden.length} sin choques)</h2><div class="acciones"><button class="boton" onclick="comEnfoque('libres')">Más días libres</button><button class="boton" onclick="comEnfoque('tranquilos')">Días más tranquilos</button><button class="boton" onclick="comEnfoque('junto')">Todo junto</button></div><details class="tarjeta"><summary>Pesos de la nota (0–100)</summary><div class="com-campos">${Object.keys(comNombres).map(k=>`<label>${comNombres[k]}<input data-num inputmode="numeric" value="${comUI.pesos[k]}" onchange="comPeso('${k}',this.value)"></label>`).join('')}</div></details><div class="com-opciones">${top.map(o=>`<article class="tarjeta"><h3>Opción ${o.indice+1} · ${o.nota}/100</h3><p>${frase(o)}</p>${o.metricas.sin_viaje.length?`<p class="suave">Sin tiempo de viaje: ${esc(o.metricas.sin_viaje.join(', '))}. Se tomó 0 min.</p>`:''}${comGrilla(o)}<div class="acciones"><button class="boton" onclick="comComparar(${o.indice})">${comUI.elegidas.has(o.indice)?'Quitar del comparador':'Comparar'}</button><button class="boton principal" onclick="comUsar(${o.indice})">Usar esta combinación</button></div></article>`).join('')}</div>${seleccion.length>=2?`<h3>Comparación</h3><div class="com-tabla"><table><thead><tr><th>Criterio</th>${seleccion.map(o=>`<th>Opción ${o.indice+1}</th>`).join('')}</tr></thead><tbody>${['libres','huecos','tranquilos','entreno','viaje','salidas'].map(k=>`<tr><th>${comNombres[k]||'Salidas'}${k==='huecos'?' (min extra > 1 h)':''}</th>${seleccion.map(o=>`<td>${o.metricas[k]}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:''}`;
}
async function comUsar(i) {
  if(soloLectura||!comUI.revisada||!comUI.periodo)return;
  if(estado.version!==comUI.version)return avisar('Cambió el plan: volvé a calcular antes de aplicar.');
  const ok=await enviar({tipo:'usar_comisiones',ids:comUI.opciones[i].ids,huella:comUI.huella,revisada:true,...comUI.periodo},'Combinación agregada a Horarios. Podés deshacerla acá.');
  if(ok){comUI.opciones=[];dibujar();}
}
async function comDeshacer(grupo) {if(await enviar({tipo:'deshacer_comisiones',grupo},'Combinación quitada; se conservaron los otros compromisos.')){comUI.opciones=[];dibujar();}}
