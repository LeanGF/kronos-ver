// Inercia Cero: ayuda local y voluntaria. No consulta servidores ni modifica el plan.
window.InerciaKronos = (() => {
  const acciones = {
    bloqueo: ['Tengo la cabeza bloqueada','Abrí un tema y escribí una frase con lo que entendiste de un párrafo.'],
    modorra: ['Tengo modorra','Dejá lista la mesa y leé un párrafo en voz alta.'],
    celular: ['Me colgué con el celu','Dejá el celular fuera de alcance y abrí el primer tema de tu bloque.'],
  };
  function pasosSalida(pasos, salida, ahora) {
    const pendientes = pasos.filter(p => !p.hecho).map(p => ({nombre:String(p.nombre),minutos:Math.max(1,Math.min(180,Math.round(+p.minutos || 1)))}));
    const disponibles = Math.max(0,Math.floor((salida-ahora)/60000));
    if (disponibles < pendientes.length) return {alcanza:false,expres:true,pasos:[],faltan:pendientes.length-disponibles};
    const normal = pendientes.reduce((s,p) => s+p.minutos,0), expres = normal > disponibles;
    if (expres) {
      let presupuesto = disponibles - pendientes.length;
      const peso = normal - pendientes.length;
      const extras = pendientes.map(p => Math.floor(presupuesto*(p.minutos-1)/peso));
      let resto = presupuesto - extras.reduce((a,b) => a+b,0);
      pendientes.forEach((p,i) => {const extra=p.minutos>1 && resto>0 ? (resto--,1) : 0;p.minutos=1+extras[i]+extra;});
    }
    let cursor = salida;
    for (let i=pendientes.length-1;i>=0;i--) {
      pendientes[i].fin=cursor;cursor-=pendientes[i].minutos*60000;pendientes[i].inicio=cursor;
    }
    return {alcanza:true,expres,pasos:pendientes,faltan:0};
  }
  return {acciones,pasosSalida};
})();
