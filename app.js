/* ============================================================
   Kronos: la pantalla (PC y celu)
   Pide el plan a la PC, lo muestra y manda los cambios. Si la PC no responde (fuera de casa),
   muestra la última copia guardada en el aparato, solo para ver.
   Diseño basado en las pantallas que armó ChatGPT (docs/diseño).
   ============================================================ */
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DIAS_CORTOS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const ETAPAS = { tarea: "Tarea", lectura: "Estudio", repaso: "Repaso", practica: "Práctica" };
// cada etapa tiene su ícono y su color (los mismos en Hoy, el calendario, la lista y la isla)
const ICONO_ETAPA = { tarea: "lista", lectura: "libro", repaso: "repetir", practica: "lapiz" };
const COLOR_ETAPA = { tarea: "var(--e-tarea)", lectura: "var(--e-lectura)", repaso: "var(--e-repaso)", practica: "var(--e-practica)" };
const mezcla = (color, pct) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
const TIPOS = { final: "Final", parcial: "Parcial", tp: "Trabajo práctico", presentacion: "Presentación", objetivo: "Objetivo" };
const CLASES = { cursada: "Cursada", rotacion: "Rotación", gimnasio: "Gimnasio", trabajo: "Trabajo", no_disponible: "No disponible", otro: "Otro" };
const ICONO_CLASE = { cursada: "birrete", rotacion: "personas", gimnasio: "pesa", trabajo: "maletin", no_disponible: "candado", otro: "pin" };
const PALETA = ["#A78BFA", "#FB923C", "#34D399", "#38BDF8", "#F472B6", "#FACC15", "#F87171", "#2DD4BF"];
const ICONO_MATERIA = { tk2: "libro", farmaco: "frasco", map: "capas", fisio: "pesa" };
const SECCIONES = [
  { id: "hoy", nombre: "Hoy", icono: "casa" },
  { id: "calendario", nombre: "Calendario", icono: "calendario" },
  { id: "finales", nombre: "Objetivos", icono: "birrete" },
  { id: "temas", nombre: "Temas", icono: "lista" },
  { id: "horarios", nombre: "Horarios", icono: "reloj" },
  { id: "comisiones", nombre: "Comisiones", icono: "birrete" },
  { id: "celu", nombre: "Conectar celu", icono: "celu", soloLocal: true },
];

// en la página de GitHub (la copia con contraseña) la pantalla solo muestra, no habla con la PC
const VISOR = !!window.KRONOS_VISOR;
let estado = null;
let vista = "hoy";
let soloLectura = false;
let mesVisto = null;        // "2026-11"
let diaElegido = null;      // "2026-11-06"
let diaHorario = 0;         // día de la semana que se está editando en Horarios
let finalAbierto = null;    // tarjeta de final desplegada
let opciones = null;        // resultado de "Comparar fechas"
let redibujarModal = null;  // si la ventana abierta muestra datos, cómo volver a dibujarla cuando cambian
// tildes que Lean marcó pero todavía no guardó (se guardan con "Actualizar rutina")
const cambios = new Map();  // "materia|tarea" -> { materia, tarea, valor, texto }
let guardadosEnCurso = 0;
let formularioPendiente = false;

const $ = (sel) => document.querySelector(sel);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const iso = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const hoyISO = () => iso(new Date());
const ahoraHHMM = () => new Date().toTimeString().slice(0, 5);
const fechaCorta = (f) => { const [, m, d] = f.split("-"); return `${d}/${m}`; };
const fechaLarga = (f) => { const [, m, d] = f.split("-"); return `${diaSemana(f)} ${+d} de ${MESES[+m - 1]}`; };
const diaSemana = (f) => DIAS[(new Date(f + "T12:00").getDay() + 6) % 7];
const diasHasta = (f) => Math.round((new Date(f + "T12:00") - new Date(hoyISO() + "T12:00")) / 86400000);
// duración en horas y minutos ("45 min", "2 h", "2 h 15 min"), redondeada a 5 minutos
const horas = (min) => {
  const t = Math.round((min || 0) / 5) * 5, h = Math.floor(t / 60), m = t % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
};
const aMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const materia = (id) => estado.materias.find((m) => m.id === id) || { id, nombre: id, corto: id, color: "#888", tareas: [] };
const diaDelPlan = (f) => estado.plan.dias.find((d) => d.fecha === f);
const bloqueado = () => (soloLectura ? "disabled" : "");
// fechas escritas a mano: "17/2", "17/02/2027" → "2027-02-17" (sin año: la próxima que viene). Vacío → ""
function leerFecha(texto) {
  const n = String(texto || "").match(/\d+/g) || [];
  if (!n.length) return "";
  if (n.length < 2) return null;
  let anio = n[2] ? (+n[2] < 100 ? 2000 + +n[2] : +n[2]) : new Date().getFullYear();
  const armar = (a) => `${a}-${String(+n[1]).padStart(2, "0")}-${String(+n[0]).padStart(2, "0")}`;
  if (+n[1] < 1 || +n[1] > 12 || +n[0] < 1 || +n[0] > 31) return null;
  if (!n[2] && armar(anio) < hoyISO()) anio += 1;
  return armar(anio);
}
const verFecha = (f) => (f ? f.split("-").reverse().join("/") : "");
const cuandoFalta = (n) => (n === 0 ? "¡hoy!" : n === 1 ? "mañana" : `${n} días`);

// ============================================================
// Íconos (dibujos simples de línea)
// ============================================================
const TRAZOS = {
  casa: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  calendario: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  birrete: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M22 9v6"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  celu: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18h2"/>',
  pc: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M1.5 20h21"/>',
  libro: '<path d="M2 5.5c2-1 5-1 10 1v13c-5-2-8-2-10-1zM22 5.5c-2-1-5-1-10 1v13c5-2 8-2 10-1z"/>',
  frasco: '<path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7.5 15h9"/>',
  capas: '<path d="M12 3 2 8l10 5 10-5z"/><path d="m2 12.5 10 5 10-5M2 17l10 5 10-5"/>',
  pesa: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  cubiertos: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1-3 4-3 8h3"/>',
  personas: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.7c2 .7 3.3 2.5 3.5 5.3"/>',
  rayo: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  buscar: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  deshacer: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  tilde: '<path d="M4 12.5l5 5L20 6.5"/>',
  cruz: '<path d="M6 6l12 12M18 6 6 18"/>',
  basura: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 11v6M14 11v6"/>',
  candado: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  estrella: '<path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.5 6.5 20.4l1-6.3L3 9.7l6.2-.9z"/>',
  alerta: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>',
  izq: '<path d="m15 18-6-6 6-6"/>',
  der: '<path d="m9 18 6-6-6-6"/>',
  atras: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  adelante: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  pin: '<path d="m14.5 3.5 6 6-4.5 1.5-4 4 .5 4.5-8-8 4.5.5 4-4zM4 20l5-5"/>',
  cafe: '<path d="M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3"/>',
  objetivo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  mover: '<path d="M4 8h15l-3.5-3.5M20 16H5l3.5 3.5"/>',
  sinNube: '<path d="M3 3l18 18M8.5 7.5A5 5 0 0 1 17 10a4 4 0 0 1 2.5 7M17 19H7a4.5 4.5 0 0 1-1.5-8.7"/>',
  apagar: '<path d="M12 3v8M6.4 6.4a8 8 0 1 0 11.2 0"/>',
  lista: '<path d="M10 6h11M10 12h11M10 18h11M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>',
  campana: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20.5a2 2 0 0 0 4 0"/>',
  enlace: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  medio: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  maletin: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 12.5h18"/>',
  guardar: '<path d="M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M8 3v5h7M8 21v-7h8v7"/>',
  repetir: '<path d="M17 2.5 20.5 6 17 9.5"/><path d="M3.5 11.5V10a4 4 0 0 1 4-4h13M7 21.5 3.5 18 7 14.5"/><path d="M20.5 12.5V14a4 4 0 0 1-4 4h-13"/>',
  lapiz: '<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/><path d="M14.5 5.5l3 3"/>',
  afuera: '<path d="M14 4h6v6M20 4l-8 8"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  arriba: '<path d="m6 15 6-6 6 6"/>',
  abajo: '<path d="m6 9 6 6 6-6"/>',
  isla: '<rect x="3" y="5" width="18" height="14" rx="3"/><rect x="11.5" y="8.5" width="6.5" height="7" rx="1.5" fill="currentColor" stroke="none"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  pausa: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  saltear: '<path d="M5 5v14l9-7zM18 5v14"/>',
  lupa: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  carpeta: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l2 2.5h8.8A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
  bandera: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  luna: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  mas: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
  cronometro: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5M12 2.5V6"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
};
const ic = (nombre) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${TRAZOS[nombre] || ""}</svg>`;
const iconoEtapa = (e) => `<span class="eic" style="--ec:${COLOR_ETAPA[e] || "#fff"}" title="${ETAPAS[e] || ""}">${ic(ICONO_ETAPA[e] || "pin")}</span>`;
const pastillaEtapa = (e) => `<span class="pastilla etapa-${e}">${ic(ICONO_ETAPA[e])}${ETAPAS[e]}</span>`;
const iconoMateria = (m) => ic(m.icono || ICONO_MATERIA[m.id] || "libro");
function iconoBloque(b) {
  if (b.tipo === "final") return ic("birrete");
  if (b.tipo === "prepa") return ic("cubiertos");
  if (b.tipo === "imprevisto") return ic("alerta");
  if (b.clase && ICONO_CLASE[b.clase]) return ic(ICONO_CLASE[b.clase]);
  if (b.tipo === "compromiso") return ic("personas");
  if (/gim/i.test(b.texto)) return ic("pesa");
  return ic("pin");
}

// ============================================================
// Hablar con la PC
// ============================================================
function cabeceras() {
  const h = { "Content-Type": "application/json" };
  const llave = localStorage.getItem("kronos-llave");
  if (llave) h["X-Kronos-Llave"] = llave;
  return h;
}

async function cargar() {
  if (VISOR) return cargarVisor();
  try {
    const r = await fetch("/api/estado", { headers: cabeceras() });
    if (r.status === 503) {
      const fallo = await r.json();
      $('#vista').innerHTML = `<div class="tarjeta alerta"><b>No pude recuperar tus datos</b><p>${esc(fallo.error)}</p><p>El archivo roto quedó apartado. No se creó un plan nuevo.</p></div>`;
      soloLectura = true;
      return;
    }
    if (r.status === 401) return pantallaVincular();
    if (!r.ok) throw new Error(r.status);
    usarEstado(await r.json());
  } catch (e) {
    const copia = localStorage.getItem("kronos-copia");
    if (!copia) {
      $("#vista").innerHTML = `<div class="tarjeta alerta" style="margin-top:20px">${ic("sinNube")}<span>No me pude conectar con Kronos en la PC. Fijate que esté prendida, con Kronos abierto, y que estés en el mismo Wi-Fi.</span></div>`;
      return;
    }
    estado = JSON.parse(copia);
    soloLectura = true;
    mostrarConexion();
    dibujar();
  }
}

// enlaces directos: ?vista=calendario, ?abrir=lista:farmaco o ?abrir=asistente (también sirve para sacar capturas)
let enlaceUsado = false;
function aplicarEnlace() {
  if (enlaceUsado) return;
  enlaceUsado = true;
  const q = new URLSearchParams(location.search);
  if (q.get("vista")) { vista = q.get("vista"); dibujar(); }
  const abrir = q.get("abrir") || "";
  if (abrir.startsWith("lista:")) abrirLista(abrir.slice(6));
  if (abrir === "asistente") abrirAsistente();
}

function usarEstado(nuevo) {
  estado = nuevo;
  soloLectura = false;
  document.body.classList.toggle("remoto", !estado.conexion);
  const copia = { ...estado };
  delete copia.conexion; // el código y la lista de aparatos no se guardan en el navegador
  localStorage.setItem("kronos-copia", JSON.stringify(copia));
  mostrarConexion();
  dibujar();
  if ((estado.recuperacion || []).length) {
    const ids = esc(JSON.stringify(estado.recuperacion.map(x => x.id)));
    $('#vista').insertAdjacentHTML('afterbegin', `<div class="tarjeta alerta">${estado.recuperacion.map(x => `<p>Se recuperó tu ${x.archivo === 'historial' ? 'historial' : 'plan'} del respaldo del ${fechaCorta(x.fecha_respaldo)} (se perdió lo que hiciste después).</p>`).join('')}<button class="boton" data-ids="${ids}" onclick="enviar({tipo:'cerrar_recuperacion',ids:JSON.parse(this.dataset.ids)},'Aviso cerrado')" ${bloqueado()}>Cerrar aviso</button></div>`);
  }
  if (redibujarModal && !$("#modal").classList.contains("oculto")) redibujarModal();
  aplicarEnlace();
}

async function enviar(pedido, mensaje) {
  guardadosEnCurso++;
  try {
    const resultado=await enviarAlServidor(pedido,mensaje);
    if (resultado) formularioPendiente=false;
    return resultado;
  } finally { guardadosEnCurso--; }
}

async function enviarAlServidor(pedido, mensaje) {
  if (soloLectura) return avisar("Estás viendo una copia: los cambios se hacen en casa.");
  pedido.version = estado.version;
  let r, cuerpo;
  try {
    r = await fetch("/api/accion", { method: "POST", headers: cabeceras(), body: JSON.stringify(pedido) });
    cuerpo = await r.json();
  } catch (e) {
    return avisar("No hay conexión con la PC.");
  }
  if (r.status === 409) {
    usarEstado(cuerpo.estado);
    return avisar("Se cambió algo desde el otro aparato. Ya está actualizado: probá de nuevo.");
  }
  if (r.status === 401) return pantallaVincular();
  if (!r.ok) return avisar("No se pudo: " + (cuerpo.error || r.status));
  usarEstado(cuerpo);
  if (mensaje) avisar(mensaje);
  return true;
}

// cada 5 segundos se fija si cambió algo (por ejemplo, desde el celu)
setInterval(async () => {
  if (VISOR || document.hidden || !estado) return;
  try {
    const r = await fetch("/api/version", { headers: cabeceras() });
    if (r.status === 401) return pantallaVincular();
    if (!r.ok) throw new Error();
    const { version } = await r.json();
    if (soloLectura || version !== estado.version) cargar();
  } catch (e) {
    if (!soloLectura) { soloLectura = true; mostrarConexion(); dibujar(); }
  }
}, 5000);

function mostrarConexion() {
  $("#estado-conexion").textContent = soloLectura ? "" : `Al día · ${estado.generado}`;
  $("#estado-lateral").textContent = soloLectura ? "" : `Al día · ${estado.generado}`;
  document.body.classList.toggle("en-visor", VISOR);
  const banda = $("#sin-conexion");
  banda.classList.toggle("oculto", !soloLectura);
  banda.innerHTML = VISOR
    ? `${ic("candado")}<span><b>Copia para ver</b> · del ${esc(estado.generado)} · los cambios se hacen en casa</span>
       <button class="enlace" onclick="olvidarVisor()">Cerrar en este aparato</button>`
    : `${ic("sinNube")}<span class="conexion-chip">Sin conexión · última copia del ${esc(estado.generado)} · solo para ver</span>`;
}

function avisar(texto) {
  const el = $("#aviso");
  el.innerHTML = `${ic("tilde")}<span>${esc(texto)}</span>`;
  el.classList.remove("oculto");
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => el.classList.add("oculto"), 3200);
}

// ============================================================
// Tema claro / oscuro: "auto" sigue al de Windows o el celu (de día claro, de noche oscuro)
// ============================================================
const TEMAS = { auto: "Automático", claro: "Claro", oscuro: "Oscuro" };
let tema = new URLSearchParams(location.search).get("tema") || localStorage.getItem("kronos-tema") || "auto";
function aplicarTema() {
  const oscuro = tema === "oscuro" || (tema === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.tema = oscuro ? "oscuro" : "claro";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = oscuro ? "#0A1020" : "#F3F6FB";
  document.querySelectorAll(".tema-lugar").forEach((el) => (el.innerHTML = menuTema(oscuro)));
}

// el tema se elige de un menú con las tres opciones (Lean: "quiero elegir, no ir pasando")
function menuTema(oscuro, enIsla = false) {
  const opcion = (t, icono, ayuda) => `<button class="${tema === t ? "elegida" : ""}" ${enIsla ? `data-acc="elegirTema" data-r="${t}"` : `onclick="elegirTema('${t}')"`}>
      ${ic(icono)}<span>${TEMAS[t]}<small>${ayuda}</small></span>${tema === t ? ic("tilde") : ""}</button>`;
  return `<details class="menu-mas menu-tema"><summary title="Tema: ${TEMAS[tema]}">${ic(oscuro ? "luna" : "sol")}<span>Tema: ${TEMAS[tema]}</span></summary><div>
    ${opcion("auto", "pc", "como tu PC o celu")}${opcion("claro", "sol", "siempre claro")}${opcion("oscuro", "luna", "siempre oscuro")}</div></details>`;
}

function elegirTema(t) {
  tema = t;
  localStorage.setItem("kronos-tema", tema);
  aplicarTema();
  if (MODO_ISLA) dibujarIsla();
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => tema === "auto" && aplicarTema());

// secciones que se pliegan y despliegan: se recuerda cuáles dejó abiertas Lean
const abiertos = new Set(JSON.parse(localStorage.getItem("kronos-abiertos") || "[]"));
const abierto = (k, porDefecto = false) => ((abiertos.has(k) || (porDefecto && !abiertos.has("-" + k))) ? "open" : "");
function recordarAbierto(el) {
  const k = el.dataset.k;
  abiertos.delete(k);
  abiertos.delete("-" + k);
  abiertos.add(el.open ? k : "-" + k);
  localStorage.setItem("kronos-abiertos", JSON.stringify([...abiertos]));
}
const plegable = (k, cabeza, adentro, porDefecto = false, clase = "plegable") =>
  `<details class="${clase}" data-k="${k}" ontoggle="recordarAbierto(this)" ${abierto(k, porDefecto)}><summary>${cabeza}${ic("abajo").replace('class="ic"', 'class="ic flecha"')}</summary><div class="adentro">${adentro}</div></details>`;

// ============================================================
// Armado general: menús, recuadro de la derecha y la vista elegida
// ============================================================
function dibujar() {
  if (MODO_ISLA) return dibujarIsla(); // la ventanita de la isla muestra solo la isla
  const secciones = SECCIONES.filter((s) => !s.soloLocal || estado.conexion);
  const boton = (s) => `<button class="${vista === s.id || (vista === "comparar" && s.id === "finales") ? "activa" : ""}" onclick="irA('${s.id}')">${ic(s.icono)}<span>${s.nombre}</span></button>`;
  $("#menu-lateral").innerHTML = secciones.map(boton).join("");
  $("#menu-abajo").innerHTML = secciones.filter((s) => s.id !== "celu").map(boton).join("");
  const vistas = { hoy: vistaHoy, calendario: vistaCalendario, finales: vistaFinales, temas: vistaTemas, comparar: vistaComparar, horarios: vistaHorarios, comisiones: vistaComisiones, celu: vistaCelu };
  document.body.dataset.vista = vista;
  $("#vista").innerHTML = avisoMedicion() + (vistas[vista] || vistaHoy)();
  $("#derecha").innerHTML = panelDerecho();
  const islaPrendida = estado.conexion ? estado.conexion.isla : isla.abierta;
  $("#menu-lateral").innerHTML += `<button class="${islaPrendida ? "activa" : ""}" onclick="alternarIsla()">${ic("isla")}<span>Isla flotante</span></button>`;
  const ex = $("#lateral-examenes");
  if (ex) ex.innerHTML = vista === "calendario" ? `<div class="lateral-titulo">${ic("bandera")} Exámenes objetivo</div>` + proximosFinales().map((m) =>
    `<div class="examen" style="--mc:${m.color}" onclick="elegirDia('${m.fecha}')"><b>${esc(m.corto)}</b><small>${fechaCorta(m.fecha)} · ${esc(m.hora)}</small></div>`).join("") : "";
  barraCambios();
  aplicarTema();
  dibujarIsla();
}

function irA(id, conservar = false) {
  if (id === "finales" && !conservar) finalAbierto = ""; // Objetivos siempre arranca todo plegado
  vista = id;
  dibujar();
  window.scrollTo(0, 0);
}

function encabezado(numero, nombre, titulo, subtitulo, derecha = "") {
  return `<div class="encabezado"><div class="ceja"><span>${numero} · ${nombre}</span><span class="derecha-ceja">${derecha}</span></div>
    <div class="titulo">${titulo}</div>${subtitulo ? `<p class="subtitulo">${subtitulo}</p>` : ""}</div>`;
}

// ---------- recuadro de la derecha (PC): próximos finales y, en Calendario, el día elegido ----------
function proximosFinales() {
  const hoy = hoyISO();
  return estado.materias.filter((m) => m.fecha && m.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// cuánto está hecha una tarea, contando los tildes todavía sin guardar
function valorTarea(mid, t) {
  const c = cambios.get(`${mid}|${t.id}`);
  return c ? c.valor : t.hecho;
}

function avanceMateria(m) {
  const total = m.tareas.reduce((s, t) => s + t.minutos, 0) || 1;
  const hecho = m.tareas.reduce((s, t) => s + t.minutos * valorTarea(m.id, t), 0);
  const etapas = {};
  for (const e of Object.keys(ETAPAS)) {
    const de = m.tareas.filter((t) => t.etapa === e);
    etapas[e] = { hechas: de.filter((t) => valorTarea(m.id, t) >= 0.99).length, total: de.length,
      min: de.reduce((s, t) => s + t.minutos, 0), hechoMin: de.reduce((s, t) => s + t.minutos * valorTarea(m.id, t), 0) };
  }
  const pct = Math.round((100 * hecho) / total);
  // qué tan preparado está según el plan (no es una nota del examen: es cuánto del plan ya hizo)
  const como = pct >= 90 ? "Listo para rendir" : pct >= 60 ? "Bien encaminado" : pct >= 25 ? "En camino" : "Arrancando";
  return { pct, faltaMin: total - hecho, hechoMin: hecho, totalMin: total, etapas, como };
}

// cuánto tiempo es de estudio, de repaso y de práctica (cada uno con su color)
function repartoEtapas(m) {
  const a = avanceMateria(m);
  const etapas = Object.keys(ETAPAS).filter((e) => a.etapas[e].min > 0);
  if (!etapas.length) return "";
  const total = etapas.reduce((s, e) => s + a.etapas[e].min, 0);
  const barra = etapas.map((e) => `<div style="flex:${a.etapas[e].min};background:${mezcla(COLOR_ETAPA[e], 22)}">
      <div style="width:${Math.round((100 * a.etapas[e].hechoMin) / a.etapas[e].min)}%;background:${COLOR_ETAPA[e]}"></div></div>`).join("");
  // promedio diario: lo que el plan pone de esa etapa, dividido los días en que aparece
  const prom = {};
  for (const d of estado.plan.dias) for (const b of d.bloques) {
    if (b.tipo !== "estudio" || b.materia !== m.id || b.salteado) continue;
    const p = (prom[b.etapa] = prom[b.etapa] || { min: 0, dias: new Set() });
    p.min += b.minutos;
    p.dias.add(d.fecha);
  }
  const promedio = (e) => prom[e] ? `<span class="promedio" title="Lo que tiene el plan de ${ETAPAS[e].toLowerCase()}, en ${prom[e].dias.size} ${prom[e].dias.size === 1 ? "día" : "días"}">≈ ${horas(prom[e].min / prom[e].dias.size)} por día <small>· ${prom[e].dias.size} ${prom[e].dias.size === 1 ? "día" : "días"}</small></span>` : `<span></span>`;
  const filas = etapas.map((e) => `<div class="reparto-fila">${iconoEtapa(e)}<b style="color:${COLOR_ETAPA[e]}">${ETAPAS[e]}</b>
      <span><b>${horas(a.etapas[e].min)}</b> <small>(${Math.round((100 * a.etapas[e].min) / total)} %)</small></span>${promedio(e)}
      <span class="suave">${a.etapas[e].hechoMin > 0 ? `hiciste ${horas(a.etapas[e].hechoMin)}` : "sin empezar"}</span></div>`).join("");
  const extra = m.tareas.filter((t) => t.extra).reduce((s, t) => s + t.minutos, 0);
  return `<div class="reparto"><div class="reparto-barra">${barra}</div>${filas}
    ${extra ? `<p class="suave chico">Incluye ${horas(extra)} de «si sobra tiempo».</p>` : ""}</div>`;
}

// semáforo: qué tan jugado está un objetivo con el tiempo que queda (verde → amarillo → naranja → rojo)
function semaforo(m) {
  const r = (estado.plan.resumen[m.id] || {}).riesgo;
  if (r === undefined) return null;
  const nivel = r >= 1 ? 5 : r >= 0.9 ? 4 : r >= 0.75 ? 3 : r >= 0.55 ? 2 : r >= 0.35 ? 1 : 0;
  const texto = ["Tranquilo", "Bien", "Ajustado", "Jugado", "Complicado", "No llega"][nivel];
  return { color: `var(--sem-${nivel})`, texto, r, nivel, porDia: (estado.plan.resumen[m.id] || {}).horas_por_dia };
}

// objetivo que todavía no arrancó: cuándo empieza
function chipArranque(m) {
  return `<span class="chip-arranque" title="Antes de esa fecha no aparece en tu plan">${ic("calendario")} Arranca el ${fechaCorta(m.inicio)}</span>`;
}

function chipSemaforo(m, largo) {
  const s = semaforo(m);
  if (!s) return "";
  const porDia = horas((s.porDia || 0) * 60);
  const titulo = `Necesitás ~${porDia} por día · usa el ${Math.round(Math.min(s.r, 9) * 100)} % de tu tiempo libre hasta la fecha`;
  return `<span class="semaforo" style="--sc:${s.color}" title="${titulo}"><span class="luz"></span>${s.texto}${largo ? ` · ~${porDia}/día` : ""}</span>`;
}

function panelDerecho() {
  if (vista === "calendario" && diaElegido) return `<div class="detalle-dia" style="margin-top:0">${detalleDia(diaElegido, true)}</div>`;
  let html = `<h3>${ic("objetivo")} Tus objetivos</h3>`;
  const larga = (f) => { const [, mm, dd] = f.split("-"); return `${+dd} de ${MESES[+mm - 1]}`; };
  html += proximosFinales().map((m) => {
    const a = avanceMateria(m);
    const n = diasHasta(m.fecha);
    return `<div class="prox" style="border-left-color:${m.color}" onclick="abrirLista('${m.id}')" title="Ver tu lista para este objetivo">
      <div class="arriba"><div><b>${esc(m.nombre)}</b><div class="fecha">${larga(m.fecha)} · ${esc(m.hora)} · ${TIPOS[m.tipo || "final"]}</div></div>
        ${m.inicio && m.inicio > hoyISO() ? chipArranque(m) : chipSemaforo(m)}</div>
      <div class="medio"><span class="dias">${n <= 1 ? cuandoFalta(n) : `${n} <small>días</small>`}</span>
        <span class="pct">${a.pct} %</span><div class="barra-progreso"><div style="width:${a.pct}%;background:${m.color}"></div></div>
        <span class="falta">${horas(a.faltaMin)}</span></div>
    </div>`;
  }).join("") || `<p class="suave">No hay objetivos por delante.</p>`;
  if (vista === "calendario" && diaElegido) html += `<div class="detalle-dia">${detalleDia(diaElegido, true)}</div>`;
  else html += manana(true);
  return html;
}

// ============================================================
// Hoy
// ============================================================
function tarjetasExamen(corta = false) {
  return estado.materias.filter(m => ['final','parcial'].includes(m.tipo || 'final') && [0,1].includes(diasHasta(m.fecha))).map(m => {
    const dias = diasHasta(m.fecha), examen = new Date(`${m.fecha}T${m.hora || '09:00'}`);
    if (!dias && Date.now() > examen.getTime()) return '';
    const salida = new Date(examen.getTime() - ((m.viaje_min ?? 60) + 30) * 60000);
    const hora = String(salida.getHours()).padStart(2,'0') + ':' + String(salida.getMinutes()).padStart(2,'0');
    const hechos = m.llevar_fecha === m.fecha ? (m.llevar_tildado || []) : [];
    const lista = m.llevar || ['Libreta universitaria','DNI','Lapicera','Agua'];
    if (corta && lista.every(texto => hechos.includes(texto))) return '';
    return `<div class="tarjeta"><h3>${dias ? 'Mañana rendís' : 'Hoy rendís'} ${esc(m.corto || m.nombre)}${dias ? ': preparar' : ''}</h3>
      ${!dias ? `<p>Salí el ${fechaCorta(salida.getFullYear() + '-' + String(salida.getMonth()+1).padStart(2,'0') + '-' + String(salida.getDate()).padStart(2,'0'))} a las <b>${hora}</b> (incluye 30 min de margen).</p>` : ''}
      ${lista.map((texto, indice) => corta && hechos.includes(texto) ? '' : `<button class="boton chico ${hechos.includes(texto) ? 'claro' : ''}" aria-pressed="${hechos.includes(texto)}" ${bloqueado()} ${corta ? `data-acc="tildarLlevar" data-mid="${m.id}" data-indice="${indice}"` : `onclick="tildarLlevar('${m.id}',${indice},${!hechos.includes(texto)})"`}>${hechos.includes(texto) ? '✓ ' : ''}${esc(texto)}</button>`).join('')}</div>`;
  }).join('');
}

// Inercia Cero: módulo local, separado de las acciones y del cálculo del calendario.
function leerInercia() {
  try { const p=JSON.parse(localStorage.getItem('kronos-inercia') || '{}');return p && typeof p==='object' && !Array.isArray(p) ? p : {}; } catch(e) { return {}; }
}

function guardarInercia(cambios) {
  localStorage.setItem('kronos-inercia',JSON.stringify({...leerInercia(),...cambios}));
}

function abrirInercia() {
  if (!window.InerciaKronos) return avisar('Recargá Kronos para abrir esta ayuda.');
  modal(`<div class="titulo-modal"><b>Inercia Cero</b></div><p>Elegí qué necesitás ahora. Esta ayuda no cambia tu rutina.</p>
    <div class="acciones"><button class="boton" onclick="abrirSalida()">Antes de salir</button><button class="boton" onclick="abrirDestrabador()">Destrabar 2 minutos</button></div>`);
}

function filaPasoSalida(nombre = '', minutos = 5) {
  return `<div class="fila paso-salida"><input data-salida-nombre value="${esc(nombre)}" placeholder="Qué tenés que hacer"><input data-salida-min data-num inputmode="numeric" value="${minutos}" aria-label="Minutos del paso"><button class="boton chico" onclick="this.parentElement.remove()" aria-label="Quitar paso">×</button></div>`;
}

function abrirSalida() {
  const local = leerInercia(), salida = local.salida && new Date(local.salida);
  const pasos = Array.isArray(local.pasos) && local.pasos.length ? local.pasos : [{nombre:'Preparar lo que llevás',minutos:10},{nombre:'Cambiarte',minutos:10},{nombre:'Revisar llaves y salir',minutos:5}];
  modal(`<div class="titulo-modal"><b>Antes de salir</b></div><p class="suave">Cambiá los pasos y sus tiempos según lo que necesitás. Si te demorás, se ofrece una versión exprés.</p>
    <div class="fila"><div><label>Día</label><input id="salida-dia" class="campo-fecha" inputmode="numeric" value="${verFecha(salida && Number.isFinite(salida.getTime()) ? iso(salida) : hoyISO())}"></div>
    <div><label>Hora de salida</label><input id="salida-hora" class="campo-hora" inputmode="numeric" oninput="formatoHora(this)" value="${salida && Number.isFinite(salida.getTime()) ? salida.toTimeString().slice(0,5) : ''}"></div></div>
    <div id="pasos-salida">${pasos.map(p => filaPasoSalida(p.nombre,p.minutos)).join('')}</div>
    <div class="acciones"><button class="boton chico" onclick="$('#pasos-salida').insertAdjacentHTML('beforeend',filaPasoSalida())">Agregar paso</button>
    <button class="boton principal" onclick="armarSalida()">Armar hacia atrás</button><button class="boton" onclick="abrirInercia()">Volver</button></div><div id="horario-salida"></div>`);
  actualizarSalida();
}

function armarSalida() {
  const dia = leerFecha($('#salida-dia').value), hora = $('#salida-hora').value;
  if (!dia || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return avisar('Poné el día y la hora de salida.');
  const salida = new Date(`${dia}T${hora}`).getTime();
  if (!Number.isFinite(salida) || salida <= Date.now()) return avisar('La hora de salida ya pasó. Elegí una hora futura.');
  const pasos = [...document.querySelectorAll('#pasos-salida .paso-salida')].map(f => ({nombre:f.querySelector('[data-salida-nombre]').value.trim(),minutos:+f.querySelector('[data-salida-min]').value,hecho:false}));
  if (!pasos.length || pasos.length>20 || pasos.some(p => !p.nombre || p.minutos<1 || p.minutos>180 || !Number.isFinite(p.minutos))) return avisar('Usá entre 1 y 20 pasos, con nombre y de 1 a 180 minutos cada uno.');
  guardarInercia({salida,pasos}); formularioPendiente=false; actualizarSalida();
}

function actualizarSalida() {
  const el = $('#horario-salida'), local = leerInercia();
  if (!el || !local.salida || !Array.isArray(local.pasos)) return;
  const p = window.InerciaKronos.pasosSalida(local.pasos,+local.salida,Date.now());
  const hora = ms => new Date(ms).toTimeString().slice(0,5);
  const pendientes = local.pasos.map((x,i)=>({...x,indice:i})).filter(x=>!x.hecho);
  const clave=JSON.stringify([p,pendientes.map(x=>x.indice)]);
  if (el.dataset.horario === clave) return;
  el.dataset.horario=clave;
  el.innerHTML = `<h3>${p.expres ? 'Versión exprés' : 'Tus pasos antes de salir'}</h3>${!pendientes.length ? '<p>Todo listo para salir.</p>' : !p.alcanza ? '<p>Quedan menos minutos que pasos. Elegí qué podés omitir o cambiá la hora; no hace falta correr.</p>' : p.pasos.map((x,i) => `<div class="item"><span>${hora(x.inicio)}–${hora(x.fin)} · ${esc(x.nombre)} · ${x.minutos} min</span><button class="boton chico" onclick="terminarPasoSalida(${pendientes[i].indice})">Listo</button></div>`).join('')}`;
}

function terminarPasoSalida(indice) {
  const local = leerInercia();
  if (!Array.isArray(local.pasos) || !local.pasos[indice]) return;
  local.pasos[indice].hecho=true; guardarInercia(local); actualizarSalida();
}

function abrirDestrabador() {
  modal(`<div class="titulo-modal"><b>Destrabar 2 minutos</b></div><p>Elegí lo que te pasa ahora.</p><div class="acciones">${Object.entries(window.InerciaKronos.acciones).map(([k,[titulo]])=>`<button class="boton" onclick="empezarReto('${k}')">${titulo}</button>`).join('')}</div><div id="inercia-reto"></div>`);
  actualizarReto();
}

function empezarReto(tipo) {
  if (!window.InerciaKronos.acciones[tipo]) return;
  guardarInercia({reto:{tipo,hasta:Date.now()+2*60000}}); actualizarReto();
}

function actualizarReto() {
  const el=$('#inercia-reto'), reto=leerInercia().reto;
  if (!el || !reto || !window.InerciaKronos.acciones[reto.tipo]) return;
  const restante=Math.max(0,Math.ceil((reto.hasta-Date.now())/1000));
  const clave=`${reto.tipo}|${reto.hasta}|${restante}`;
  if (el.dataset.reto === clave) return;
  el.dataset.reto=clave;
  el.innerHTML=`<div class="tarjeta"><p>${window.InerciaKronos.acciones[reto.tipo][1]}</p><b>${Math.floor(restante/60)}:${String(restante%60).padStart(2,'0')}</b>${!restante ? `<div class="acciones"><button class="boton principal" onclick="empezarDesdeInercia()">Empezar bloque</button><button class="boton" onclick="guardarInercia({reto:{tipo:'${reto.tipo}',hasta:Date.now()+5*60000}});actualizarReto()">5 min más</button></div>` : ''}</div>`;
}

function empezarDesdeInercia() {
  if (soloLectura) return avisar('La copia es solo para ver. Empezá el bloque desde Kronos en casa.');
  if (midiendo) return avisar('Ya estás midiendo un bloque; podés seguir con ese.');
  const bloques=(diaDelPlan(hoyISO())?.bloques || []).filter(b=>b.tipo==='estudio' && !b.salteado && !bloqueHecho(b));
  const b=bloqueEnFoco(bloques);
  if (!b) return avisar('No queda un bloque pendiente hoy.');
  cerrarModal(); empezarBloque({dataset:{bloque:JSON.stringify({...b,clave:claveBloque(b)})}});
}

setInterval(() => { if (window.InerciaKronos) { actualizarReto(); actualizarSalida(); } },1000);

function tildarLlevar(mid, indice, hecho) {
  enviar({tipo:'tildar_llevar',materia:mid,indice,hecho},'Lista actualizada');
}

function vistaHoy() {
  const hoy = hoyISO();
  const dia = diaDelPlan(hoy);
  const hechoHoy = estado.registro.filter((r) => r.fecha.startsWith(hoy)).reduce((s, r) => s + (r.minutos || 0), 0);
  const falta = dia ? dia.estudio_min : 0;
  const total = hechoHoy + falta;
  const hayEstudio = dia && dia.bloques.some((b) => b.tipo === "estudio");
  const listo = !falta && hechoHoy > 0;
  // arriba: cuánto falta hoy (lo primero que se tiene que ver)
  let html = `<div class="resumen-hoy hero ${listo ? "listo" : ""} ${festejarDia ? "festejo" : ""}">
    <div class="fecha-hoy">${fechaLarga(hoy)}</div>
    <div class="lema">Un bloque a la vez.</div>
    <div class="quedan">${falta ? `Te quedan <b>${horas(falta)}</b> hoy` : listo ? `<b>Por hoy, listo.</b> Descansá` : hayEstudio ? "No queda nada pendiente hoy" : "Hoy no hay estudio planificado"}</div>
    ${total ? `<div class="fila-progreso"><div class="barra-progreso"><div style="width:${Math.round((100 * hechoHoy) / total)}%;${listo ? "background:var(--ok)" : ""}"></div></div><span>${horas(hechoHoy)} / ${horas(total)}</span></div>` : ""}</div>`;
  festejarDia = false;
  html += `<button class="boton chico" aria-label="Abrir Inercia Cero" onclick="abrirInercia()">${ic("rayo")} Inercia Cero</button>`;
  html += tarjetasExamen();

  // celu: los objetivos en una sola fila que se despliega
  const objs = proximosFinales();
  if (objs.length) html += `<div class="solo-celu">${plegable("hoy-objetivos",
    `<span class="puntos-obj">${objs.map((m) => `<span class="punto" style="background:${m.color}"></span>`).join("")}</span>
     <span><b>${objs.length} ${objs.length === 1 ? "objetivo" : "objetivos"}</b> <span class="suave">· el próximo ${diasHasta(objs[0].fecha) <= 1 ? cuandoFalta(diasHasta(objs[0].fecha)) : `en ${diasHasta(objs[0].fecha)} días`}</span></span>`,
    `<div class="cuentas">${objs.map((m) => {
      const a = avanceMateria(m);
      return `<div class="cuenta" style="border-left-color:${m.color}" onclick="abrirLista('${m.id}')"><b>${esc(m.corto)}</b>
        <span>${cuandoFalta(diasHasta(m.fecha))}</span><div class="mini-barra"><div style="width:${a.pct}%;background:${m.color}"></div></div>
        <div class="luz-chica">${m.inicio && m.inicio > hoy ? chipArranque(m) : chipSemaforo(m)}</div></div>`;
    }).join("")}</div>`)}</div>`;

  html += estado.plan.avisos.map((a) => `<div class="tarjeta alerta">${ic("alerta")}<span>${esc(a)}</span></div>`).join("");
  html += estado.materias.filter(m => necesitaIntensivo(m)).map(m => `<button class="boton" onclick="verIntensivo('${m.id}')" ${bloqueado()}>Ver plan intensivo · ${esc(m.corto)}</button>`).join("");
  html += soloLectura ? "" : sugerenciasRitmo();
  if (dia && dia.dia_unico) html += diaUnico(dia.dia_unico, "Hoy");
  if (dia && dia.baja_energia) html += `<div class="tarjeta baja-energia">${ic("cafe")}<div><b>Modo baja energía.</b>
    Pasé lo pesado de hoy a otros días; ${dia.estudio_min ? `te queda solo el repaso (${horas(dia.estudio_min)}).` : "hoy no te queda nada. Descansá."}
    ${soloLectura ? "" : `<div><button class="enlace" onclick="bajaEnergia(false)">${ic("deshacer")} Ya estoy mejor, volver a ponerlo</button></div>`}</div></div>`;

  // en pantalla ancha, Hoy va en dos columnas: lo de hacer (izquierda) y lo de seguimiento (derecha)
  html += `<div class="hoy-grilla"><div class="hoy-a">`;
  // el bloque que toca ahora (o el próximo), abierto; el resto, en filas que se despliegan
  const bloques = dia ? dia.bloques : [];
  const foco = bloqueEnFoco(bloques);
  if (foco) html += bloqueFoco(foco);
  const resto = bloques.filter((b) => b !== foco);
  if (resto.length) html += `<div class="agenda"><h3>${foco ? "Después" : "Hoy"}</h3>${resto.map((b) => filaBloque(b, true)).join("")}</div>`;
  if (!bloques.length) html += `<p class="suave">No hay nada planificado para hoy. Adelantá algo desde la lista de un objetivo, o descansá.</p>`;

  html += `<div class="imprevisto"><button class="boton claro" onclick="abrirImprevisto('${hoy}')" ${bloqueado()}>${ic("rayo")} Tuve un imprevisto</button>
    ${dia && !dia.baja_energia && hayEstudio && !soloLectura ? `<button class="boton claro" onclick="bajaEnergia(true)" title="Pasa lo pesado de hoy a otros días y te deja solo repaso">${ic("cafe")} Hoy estoy liquidado</button>` : ""}
    ${soloLectura ? "" : `<button class="enlace" onclick="rearmarHoy()" title="El horario de hoy no se mueve solo. Esto vuelve a repartir lo que queda (lo que ya pasó o salteaste no se toca).">${ic("repetir")} Rearmar lo que queda</button>`}
    ${estado.registro.length && !soloLectura ? `<button class="enlace" onclick="enviar({tipo:'deshacer'}, 'Listo, deshice lo último que guardaste.')">${ic("deshacer")} Deshacer lo último</button>` : ""}</div>`;

  html += `</div><div class="hoy-b">`;
  html += `<div class="solo-celu">${plegable("hoy-manana", `${ic("sol")}<span><b>Mañana</b> <span class="suave">· ${(diaDelPlan(iso(new Date(Date.now() + 86400000))) || {}).estudio_min ? horas(diaDelPlan(iso(new Date(Date.now() + 86400000))).estudio_min) : "libre"}</span></span>`, manana(false, true))}</div>`;
  const semana = datosSemana();
  html += plegable("hoy-semana", `${ic("calendario")}<span><b>Tu semana</b> <span class="suave">· ${semana.racha} ${semana.racha === 1 ? "día" : "días"} cumpliendo</span></span>`, resumenSemana(semana), true);
  const hechos = estado.registro.filter((r) => r.fecha.startsWith(hoy));
  html += plegable("hoy-hecho", `${ic("tilde")}<span><b>Hecho hoy</b> <span class="suave">· ${hechos.length ? horas(hechoHoy) : "nada todavía"}</span></span>`,
    registroDelDia(hoy) || `<p class="suave">Cuando guardes lo que hiciste, aparece acá.</p>`);
  return html + `</div></div>`;
}

let festejarDia = false; // después de guardar el último bloque del día, el resumen festeja una vez

// el bloque que toca: el que está en curso, si no el próximo pendiente, si no el último que quedó sin hacer
function bloqueEnFoco(bloques) {
  const ahora = ahoraHHMM();
  // se mira lo guardado (no los tildes sin guardar): así el bloque no se va mientras Lean lo está tildando
  const guardado = (b) => b.tareas.every((id) => tareaGuardada(b.materia, id).hecho >= 0.99);
  const pendientes = bloques.filter((b) => b.tipo === "estudio" && !b.salteado && !guardado(b));
  return pendientes.find((b) => b.inicio <= ahora && b.fin > ahora) || pendientes.find((b) => b.inicio > ahora) || null;
}

// los últimos 7 días: cuánto estudiaste contra lo que tenías planeado, y la racha de días cumpliendo
function datosSemana() {
  const dias = [6, 5, 4, 3, 2, 1, 0].map((i) => iso(new Date(Date.now() - i * 86400000)));
  const hecho = (f) => estado.registro.filter((r) => r.fecha.startsWith(f)).reduce((s, r) => s + (r.minutos || 0), 0);
  const plan = (f) => (estado.historial || {})[f];
  const cumplio = (f) => plan(f) > 0 && hecho(f) >= 0.8 * plan(f);
  // racha: días seguidos cumpliendo (al menos el 80 % de lo planeado). Los días sin nada planeado no la cortan;
  // hoy tampoco, mientras no termine.
  let racha = 0;
  for (let i = 0; i < 90; i++) {
    const f = iso(new Date(Date.now() - i * 86400000));
    if (plan(f) === undefined) break;
    if (!plan(f)) continue;
    if (cumplio(f)) racha++;
    else if (i > 0) break;
  }
  return { dias, hecho, plan, cumplio, racha };
}

function resumenSemana(sem = datosSemana()) {
  const { dias, hecho, plan, cumplio, racha } = sem;
  const circulos = dias.map((f) => {
    const h = hecho(f), p = plan(f);
    const clase = cumplio(f) ? "ok" : h > 0 ? "parcial" : f < hoyISO() && p > 0 ? "fallo" : "";
    return `<div class="sem-c ${f === hoyISO() ? "hoy" : ""}"><small>${DIAS_CORTOS[(new Date(f + "T12:00").getDay() + 6) % 7]}</small><b>${+f.slice(8)}</b>
      <span class="circ ${clase}" title="${p ? `Planeado ${horas(p)}` : "Sin plan"}">${clase === "ok" ? ic("tilde") : ""}</span><span class="hh">${h ? horas(h) : "–"}</span></div>`;
  }).join("");
  const total = dias.reduce((s, f) => s + hecho(f), 0);
  return `<div class="semana"><div class="sem-arriba"><span>Estudiaste <b>${horas(total)}</b> en los últimos 7 días</span>
      <span class="racha ${racha ? "con" : ""}"><b>${racha}</b> ${racha === 1 ? "día" : "días"} seguidos cumpliendo</span></div>
    <div class="sem-circulos">${circulos}</div>
    <p class="suave chico">Verde: llegaste al 80 % de lo planeado. Medio: estudiaste algo. Vacío: nada.</p></div>`;
}

// ---------- medir cuánto tarda de verdad un bloque (sin alarma: cada bloque dura lo que tenga que durar) ----------
let midiendo = JSON.parse(localStorage.getItem("kronos-midiendo") || "null"); // { clave, materia, tareas, texto, desde }
let medido = +(localStorage.getItem("kronos-medido") || 0); // minutos medidos que todavía no se guardaron
let revisionMedicion = null;
let ultimoChequeoMedicion = Date.now();

function duracionMedicion() {
  if (!midiendo) return 90;
  const estimado = midiendo.minutos || (estado?.materias.find(m => m.id === midiendo.materia)?.tareas || [])
    .filter(t => midiendo.tareas.includes(t.id)).reduce((s,t) => s + t.minutos, 0);
  return Math.max(1, estimado || 90);
}

function controlarMedicion(motivo = '') {
  const ahora = Date.now(), salto = ahora - ultimoChequeoMedicion;
  ultimoChequeoMedicion = ahora;
  if (!midiendo || revisionMedicion || document.hidden) return;
  const transcurrido = (ahora - midiendo.desde) / 60000, planeado = duracionMedicion();
  const pasado = transcurrido > Math.max(planeado * 1.5, planeado + 30);
  if (motivo === 'vuelta' || salto > 5 * 60000 || (pasado && ahora - (midiendo.confirmado || midiendo.desde) >= 30 * 60000)) {
    revisionMedicion = {motivo: motivo || (salto > 5 * 60000 ? 'salto' : 'largo'), minutos: Math.round(transcurrido)};
    refrescar();
  }
}

function avisoMedicion(enIsla = false) {
  if (!midiendo || !revisionMedicion || soloLectura) return '';
  const boton = (accion, texto) => `<button class="boton chico" ${enIsla ? `data-acc="${accion}"` : `onclick="${accion}()"`}>${texto}</button>`;
  return `<div class="tarjeta alerta" role="alert"><p>${revisionMedicion.motivo === 'terminar' ? `¿Fueron realmente ${horas(revisionMedicion.minutos)}?` : `¿Seguís estudiando? Llevás ${horas(revisionMedicion.minutos)} en este bloque.`}</p>
    <div class="acciones">${boton('seguirMidiendo','Sí, sigo')}${boton('pedirHoraMedicion','Terminé hace un rato')}${boton('descartarMedicion','Descartar medición')}${revisionMedicion.motivo === 'terminar' ? boton('confirmarTiempoMedido','Sí, fue ese tiempo: terminar') : ''}</div></div>`;
}

function seguirMidiendo() {
  if (!midiendo) return;
  midiendo.confirmado = Date.now(); revisionMedicion = null;
  guardarMedicion(); refrescar();
}

function pedirHoraMedicion() {
  if (!midiendo) return;
  modal(`<div class="titulo-modal"><b>¿A qué hora terminaste?</b></div>
    <label>Día (día/mes/año)</label><input id="medicion-dia" class="campo-fecha" inputmode="numeric" value="${verFecha(hoyISO())}">
    <label>Hora</label><input id="medicion-hasta" class="campo-hora" inputmode="numeric" oninput="formatoHora(this)" value="${ahoraHHMM()}">
    <button class="boton principal" onclick="guardarFinMedicion()">Usar este horario</button>`);
}

function guardarFinMedicion() {
  if (!midiendo) return;
  const dia = leerFecha($('#medicion-dia').value), hora = $('#medicion-hasta').value;
  if (!dia || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return avisar('Revisá el día y la hora de fin.');
  const fin = new Date(`${dia}T${hora}`).getTime();
  if (!Number.isFinite(fin) || fin < midiendo.desde || fin > Date.now()) return avisar('El fin debe estar entre el inicio y ahora.');
  cerrarModal(); cerrarMedicion(Math.max(1, Math.round((fin - midiendo.desde) / 60000)));
}

function confirmarTiempoMedido() {
  if (!midiendo || revisionMedicion?.motivo !== 'terminar') return;
  cerrarMedicion(Math.max(1, Math.round((Date.now() - midiendo.desde) / 60000)));
}

function descartarMedicion() {
  if (revisionMedicion?.motivo === 'terminar') cerrarMedicion(0);
  else cancelarMedicion();
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) controlarMedicion('vuelta'); });
const guardarMedicion = () => {
  localStorage.setItem("kronos-midiendo", JSON.stringify(midiendo));
  localStorage.setItem("kronos-medido", String(medido));
};
const relojDe = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60);
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(t % 60).padStart(2, "0"); };

// en la isla los botones van con data-acc (su propio escuchador); en la página, con onclick
function botonesMedir(b, enIsla = false) {
  const accion = (nombre, llamada) => (enIsla ? `data-acc="${nombre}"` : `onclick="${llamada}"`);
  const clave = claveBloque(b);
  if (midiendo && midiendo.clave === clave) {
    return `<span class="midiendo">${ic("reloj")} <b class="cron-bloque" data-desde="${midiendo.desde}">${relojDe(Date.now() - midiendo.desde)}</b></span>
      <button class="boton principal" ${accion("terminarBloque", "terminarBloque()")}>${ic("tilde")} Terminé</button>
      <button class="boton claro" ${accion("cancelarMedicion", "cancelarMedicion()")}>${ic("cruz")} Cancelar</button>`;
  }
  const datos = esc(JSON.stringify({ clave, materia: b.materia, tareas: b.tareas, texto: b.texto, minutos: b.minutos }));
  return `<button class="boton principal" ${accion("empezarBloque", "empezarBloque(this)")} data-bloque="${datos}" title="Mide cuánto tardás de verdad (sin alarma)">${ic("play")} Empezar</button>`;
}

function empezarBloque(boton) {
  const b = JSON.parse(boton.dataset.bloque);
  if (midiendo && !confirm("Ya estás midiendo otro bloque. ¿Lo dejo y empiezo este?")) return;
  midiendo = { ...b, desde: Date.now() };
  revisionMedicion = null;
  ultimoChequeoMedicion = Date.now();
  guardarMedicion();
  refrescar();
}

function terminarBloque() {
  if (!midiendo) return;
  const minutos = Math.max(1, Math.round((Date.now() - midiendo.desde) / 60000));
  if ((Date.now() - midiendo.desde) / 60000 > 2 * duracionMedicion()) {
    revisionMedicion = {motivo:'terminar', minutos};
    guardarMedicion(); refrescar(); return;
  }
  cerrarMedicion(minutos);
}

function cerrarMedicion(minutos) {
  if (!midiendo) return;
  midiendo.tareas.forEach((id, i) => ponerValor(midiendo.materia, id, 1, midiendo.texto.split(" · ")[i] || ""));
  medido += minutos;
  midiendo = null;
  revisionMedicion = null;
  guardarMedicion();
  refrescar();
  avisar(minutos ? `Tardaste ${horas(minutos)}. Tocá «Actualizar rutina» para guardarlo.` : 'Bloque tildado sin medición. Tocá «Actualizar rutina» para guardarlo.');
}

function cancelarMedicion() {
  midiendo = null;
  revisionMedicion = null;
  guardarMedicion();
  refrescar();
}
setInterval(() => {
  document.querySelectorAll(".cron-bloque").forEach((e) => (e.textContent = relojDe(Date.now() - +e.dataset.desde)));
  controlarMedicion();
}, 1000);

// ---------- Kronos aprendió tu ritmo: propone ajustar las horas ----------
function sugerenciasRitmo(mid = null) {
  const no = JSON.parse(localStorage.getItem("kronos-sug-no") || "{}");
  return (estado.sugerencias || []).filter((s) => (!mid || s.materia === mid) && !(no[`${s.materia}|${s.etapa}`] >= s.bloques)).map((s) => {
    const m = materia(s.materia);
    const menos = s.relacion < 1;
    return `<div class="tarjeta sugerencia">${ic("rayo")}<div><b>Kronos aprendió tu ritmo</b>
      <p>En <b style="color:${m.color}">${esc(m.corto)}</b> · ${ETAPAS[s.etapa]} venís tardando ${menos ? "menos" : "más"} de lo calculado:
      ${horas(s.real)} en vez de ${horas(s.estimado)} (${s.bloques} bloques, ${Math.round(s.relacion * 100)} %). ¿Ajusto las horas que quedan?</p>
      <div class="acciones"><button class="boton chico principal" onclick="enviar({tipo:'ajustar_ritmo',materia:'${s.materia}',etapa:'${s.etapa}'}, 'Listo: ajusté las horas a tu ritmo real.')" ${bloqueado()}>Ajustar</button>
      <button class="boton chico claro" onclick="noSugerir('${s.materia}|${s.etapa}', ${s.bloques})">Ahora no</button></div></div></div>`;
  }).join("");
}

function noSugerir(clave, bloques) {
  const no = JSON.parse(localStorage.getItem("kronos-sug-no") || "{}");
  no[clave] = bloques + 2; // vuelve a preguntar después de 3 bloques más
  localStorage.setItem("kronos-sug-no", JSON.stringify(no));
  dibujar();
}

function marcarExtra(mid, tarea, valor) {
  enviar({ tipo: "marcar_extra", materia: mid, tarea, valor }, valor ? "Pasó a «si sobra tiempo»." : "Volvió a ser clave.");
}

function bajaEnergia(valor) {
  enviar({ tipo: "baja_energia", valor }, valor ? "Listo: lo pesado de hoy pasó a otros días." : "Listo, volvió todo al plan de hoy.");
}

// ---------- ¿cómo te costó? (al terminar de leer un bloque): cambia cuánto repaso lleva cada tema ----------
const dificultades = new Map(); // "materia|L0.3" -> { materia, tema, valor }
const temaDe = (id) => id.split(".").slice(0, 2).join("."); // "L0.3.1" -> "L0.3"

function preguntaCosto(b) {
  if (b.etapa !== "lectura" || soloLectura) return "";
  const recien = b.tareas.every((id) => valorTarea(b.materia, tareaGuardada(b.materia, id)) >= 0.99)
    && b.tareas.some((id) => cambios.has(`${b.materia}|${id}`));
  if (!recien) return "";
  const clave = `${b.materia}|${temaDe(b.tareas[0])}`;
  const elegido = dificultades.get(clave)?.valor || "";
  const op = (v, t) => `<button class="${elegido === v ? "elegida" : ""}" onclick="elegirCosto('${b.materia}', '${esc(JSON.stringify(b.tareas))}', '${v}')">${t}</button>`;
  return `<div class="costo"><span>¿Cómo te costó?</span><span class="pildoras">${op("facil", "Fácil")}${op("normal", "Normal")}${op("dificil", "Difícil")}</span></div>`;
}

function elegirCosto(mid, tareasJson, valor) {
  const temas = [...new Set(JSON.parse(tareasJson.replace(/&quot;/g, '"')).map(temaDe))];
  for (const tema of temas) dificultades.set(`${mid}|${tema}`, { materia: mid, tema, valor });
  refrescar();
}

function saltearBloque(inicio, mid, valor) {
  enviar({ tipo: "saltear", inicio, materia: mid, valor }, valor ? "Salteado por hoy: Kronos lo pasa a otro día." : "Listo, volvió al plan de hoy.");
}

function rearmarHoy() {
  if (confirm("¿Rearmo lo que queda de hoy? Lo que ya pasó o salteaste no se toca; lo demás se vuelve a repartir desde ahora."))
    enviar({ tipo: "rearmar_hoy" }, "Listo, rearmé lo que queda de hoy.");
}

function diaUnico(mid, cuando) {
  const m = materia(mid);
  return `<div class="tarjeta dia-unico" style="--mc:${m.color}">${iconoMateria(m)}<span><b>${cuando}, foco en ${esc(m.corto)}.</b>
    Un día entero para profundizar, sin mezclar.</span></div>`;
}

// resumen de lo que toca mañana: se puede tildar desde acá (si lo hacés hoy, se adelanta)
function manana(enPanel, sinTitulo = false) {
  const f = iso(new Date(Date.now() + 86400000));
  const dia = diaDelPlan(f);
  const bloques = dia ? dia.bloques.filter((b) => b.tipo === "estudio" || b.tipo === "final") : [];
  if (enPanel && bloques.length) {
    const primero = bloques.find((b) => b.tipo === "estudio");
    const vista1 = primero ? `${esc(materia(primero.materia).corto)} · ${esc(primero.temas[0] || "")}` : esc(bloques[0].texto);
    const larga = `${diaSemana(f)} ${+f.slice(8)} de ${MESES[+f.slice(5, 7) - 1]}`;
    return `<div class="manana en-panel"><h3>${ic("sol")} Mañana</h3><details class="plegable manana-card" data-k="panel-manana" ontoggle="recordarAbierto(this)" ${abierto("panel-manana")}>
      <summary><div class="mc-arriba">${ic("calendario")}<b>${larga}</b><span class="suave">${dia && dia.estudio_min ? horas(dia.estudio_min) : ""}</span>${ic("abajo").replace('class="ic"', 'class="ic flecha"')}</div>
        <div class="mc-prev"><span class="suave">${vista1}</span><span class="boton chico ver-temas">Ver temas</span></div></summary>
      <div class="adentro">${manana(false, true)}</div></details></div>`;
  }
  let html = `<div class="manana ${enPanel ? "en-panel" : ""}">` + (sinTitulo ? "" : `<h3>${ic("sol")} Mañana · ${diaSemana(f)} ${fechaCorta(f)}${dia && dia.estudio_min ? ` · ${horas(dia.estudio_min)}` : ""}</h3>`)
    + (dia && dia.dia_unico ? `<p class="suave chico">Foco en ${esc(materia(dia.dia_unico).corto)}: un día para profundizar.</p>` : "");
  if (!bloques.length) return html + `<p class="suave">Mañana no hay estudio planificado.</p></div>`;
  html += `<div class="tarjeta">` + bloques.map((b) => {
    const m = materia(b.materia);
    if (b.tipo === "final") return `<div class="m-renglon"><b>${b.inicio}</b><span class="punto" style="background:${m.color}"></span><b style="color:var(--acento-texto)">${esc(b.texto)}</b></div>`;
    return `<div class="m-renglon"><b>${b.inicio}</b><span class="punto" style="background:${m.color}"></span><span>${iconoEtapa(b.etapa)} <b>${esc(m.corto)}</b> · ${ETAPAS[b.etapa]}</span></div>
      <ul class="temas">${b.tareas.map((id, i) => {
        const v = valorTarea(m.id, tareaGuardada(m.id, id));
        return `<li class="${v >= 0.99 ? "hecho" : ""}">${tilde(m.id, id, b.temas[i])}<span>${esc(b.temas[i])}</span></li>`;
      }).join("")}</ul>`;
  }).join("") + `<p class="suave chico" style="margin:8px 0 0">Tildá lo que adelantes. Se descuenta al actualizar.</p></div></div>`;
  return html;
}

function registroDelDia(fecha, titulo = "") {
  const hechos = estado.registro.filter((r) => r.fecha.startsWith(fecha));
  if (!hechos.length) return "";
  return (titulo ? `<h2>${ic("tilde")} ${titulo}</h2>` : "") + `<div class="lista">` + hechos.map((r) =>
    `<div class="item"><span class="punto" style="background:${materia(r.materia).color};margin-top:8px"></span>
      <span><b>${esc(materia(r.materia).corto)}</b> · ${esc(r.texto)}</span><small>${r.hora || r.fecha.slice(11)}</small></div>`).join("") + `</div>`;
}

// un bloque del día, con su hora a la izquierda y la tira de color
function lineaBloque(b, conBotones, esHoy = false) {
  const ahora = ahoraHHMM();
  const paso = esHoy && b.fin <= ahora;
  const m = b.materia ? materia(b.materia) : null;
  const dur = aMin(b.fin) - aMin(b.inicio);
  const color = m ? m.color : b.tipo === "imprevisto" ? "var(--alerta)" : b.tipo === "compromiso" ? "var(--ok)" : "var(--apagado)";
  const clase = b.tipo === "estudio" ? "" : b.tipo === "final" ? "final" : "gris";
  const apagada = (paso && (b.tipo !== "estudio" || bloqueHecho(b))) || b.salteado;
  return `<div class="linea ${apagada ? "pasada" : ""}"><div class="hora">${b.inicio}<br>${b.fin}<small>${horas(dur)}</small></div>
    <div class="tira" style="background:${color}"></div><div class="bloque ${clase}">${cuerpoBloque(b, conBotones, esHoy)}</div></div>`;
}

// lo de adentro de un bloque: título, etapa, aviso, temas para tildar y acciones (Empezar · Hecho · ⋯)
function temasPlegables(b, contenido, abrir = false) {
  const n = b.tareas.length;
  if (n <= 2) return `<ul class="temas">${contenido}</ul>`;
  const hechos = b.tareas.filter(id => valorTarea(b.materia, tareaGuardada(b.materia, id)) >= .99).length;
  const resumenes = new Set(b.tareas.map(id => /^[LR](\d+)\./.exec(id)?.[1]).filter(x => x !== undefined));
  const paginas = b.temas.flatMap(t => { const r = /págs?\.\s*(\d+)(?:[–-](\d+))?/.exec(t); return r ? [+r[1], +(r[2] || r[1])] : []; });
  const rango = resumenes.size === 1 && paginas.length ? ` (págs. ${Math.min(...paginas)}–${Math.max(...paginas)})` : '';
  return plegable('temas:' + hoyISO() + ':' + claveBloque(b), `${n} temas${rango} · ${horas(b.minutos)} [${hechos}/${n}]`, `<ul class="temas">${contenido}</ul>`, abrir);
}

function notasDeTarea(mid, id, editar = true) {
  const refs = tareaGuardada(mid, id).referencias || [];
  const notas=refs.filter(r=>r.nota_lean).map(r=>`<span class="nota-lean"><b>Tu nota · ${esc(r.nombre)}</b><span>${esc(r.nota_lean)}</span></span>`).join('');
  return notas + (editar && !soloLectura && refs.length ? `<button class="enlace" onclick="${refs.length===1 ? `editarNota('${mid}','${refs[0].id}')` : `elegirNotaDeTarea('${mid}','${id}')`}">${refs.length>1 ? 'Notas de estos temas' : refs[0].nota_lean ? 'Editar nota' : 'Agregar nota'}</button>` : '');
}

function elegirNotaDeTarea(mid,id) {
  if (soloLectura) return;
  modal(`<div class="titulo-modal"><b>Elegí el tema de tu nota</b></div>${(tareaGuardada(mid,id).referencias || []).map(r=>`<button class="boton resultado-busqueda" onclick="editarNota('${mid}','${r.id}')">${esc(r.nombre)}${r.nota_lean ? ' · tiene nota' : ''}</button>`).join('')}`);
}

function editarNota(mid, referencia) {
  const ref = materia(mid).tareas.flatMap(t => t.referencias || []).find(r => r.id === referencia);
  if (!ref || soloLectura) return;
  registrarToque(mid, referencia);
  modal(`<div class="titulo-modal"><b>Tu nota · ${esc(ref.nombre)}</b></div><p class="suave">Esta es tu indicación sobre el tema; pesa más que el archivo de la cátedra. No se envía a ninguna IA.</p>
    <textarea id="nota-lean" maxlength="2000" rows="5">${esc(ref.nota_lean)}</textarea>
    <div class="acciones"><button class="boton principal" onclick="guardarNota('${mid}','${referencia}')">Guardar nota</button><button class="boton" onclick="cerrarModal()">Cancelar</button></div>`);
}

async function guardarNota(mid, referencia) {
  if (await enviar({tipo:'nota_tema',materia:mid,tema:referencia,nota:$('#nota-lean').value},'Nota guardada')) cerrarModal();
}

function registrarToque(mid, referencia = '') {
  try {
    const guardados = JSON.parse(localStorage.getItem('kronos-recientes') || '[]');
    const previos=Array.isArray(guardados) ? guardados : [];
    const nuevos = [{materia:mid,referencia},...previos.filter(x => x.materia !== mid || x.referencia !== referencia)].slice(0,12);
    localStorage.setItem('kronos-recientes',JSON.stringify(nuevos)); // solo IDs, nunca el texto de una nota
  } catch (e) { /* historial opcional del navegador */ }
}

function cuerpoBloque(b, conBotones, esHoy, grande = false) {
  if (b.tipo !== "estudio") {
    const borrar = b.id && ["compromiso", "imprevisto", "evento"].includes(b.tipo) && !soloLectura
      ? `<button class="boton chico peligro" title="Borrar" onclick="borrarEvento('${b.id}')">${ic("basura")}</button>` : "";
    const fm = b.tipo === "final" ? materia(b.materia) : null;
    return `<div class="cabeza"><div class="nombre">${iconoBloque(b)}<span>${esc(b.texto)}</span></div>
      ${fm ? `<span class="etiqueta-materia" style="background:${fm.color}">${esc(fm.corto)}</span>` : borrar}</div>`;
  }
  const m = materia(b.materia), ahora = ahoraHHMM();
  const todo = bloqueHecho(b);
  const paso = esHoy && b.fin <= ahora;
  const aviso = todo ? "" : b.salteado ? `<div class="aviso-bloque">${ic("saltear")}<span><b>Salteado por hoy.</b> Kronos lo pasa a otro día.</span></div>`
    : paso ? `<div class="aviso-bloque paso">${ic("reloj")}<span><b>Pasó el horario previsto.</b> Si lo hiciste, tildalo; si no, va a otro día.</span></div>` : "";
  const temas = b.tareas.map((id, i) => {
    const v = valorTarea(m.id, tareaGuardada(m.id, id));
    return `<li class="${v >= 0.99 ? "hecho" : ""}">${tilde(m.id, id, b.temas[i])}<span>${esc(b.temas[i])}${notasDeTarea(m.id,id)}</span></li>`;
  }).join("");
  const datos = esc(JSON.stringify({ materia: b.materia, tareas: b.tareas, minutos: b.minutos, texto: b.texto }));
  const extra = [];
  if (!todo && !b.salteado) extra.push(`<button data-bloque="${datos}" onclick="marcar(this, 0.5)">${ic("medio")} Hice la mitad</button>`);
  if (esHoy && !todo && b.tareas.length) extra.push(`<button onclick="saltearBloque('${b.inicio}','${b.materia}',${!b.salteado})">${ic(b.salteado ? "deshacer" : "saltear")} ${b.salteado ? "Volver a ponerlo" : "Saltear por hoy"}</button>`);
  extra.push(`<button onclick="abrirLista('${m.id}')">${ic("lista")} Ver la lista de ${esc(m.corto)}</button>`);
  const acciones = conBotones && !soloLectura ? `<div class="acciones">
      ${esHoy && !todo && !b.salteado ? botonesMedir(b) : ""}
      <button class="boton ${todo ? "" : esHoy ? "claro" : "principal"}" data-bloque="${datos}" onclick="marcar(this, 1)">${todo ? ic("deshacer") + " Desmarcar" : ic("tilde") + " Hecho"}</button>
      <details class="menu-mas"><summary title="Más opciones">${ic("mas")}</summary><div>${extra.join("")}</div></details></div>` : "";
  const cabeza = grande ? "" : `<div class="cabeza"><div class="nombre">${iconoMateria(m)}<span>${esc(m.nombre)}</span></div></div>`;
  return `${cabeza}${pastillaEtapa(b.etapa)}${b.extra ? ` <span class="pastilla si-sobra">Si sobra tiempo</span>` : ""}${aviso}
    ${esHoy ? temasPlegables(b, temas, b.inicio <= ahora && b.fin > ahora) : `<ul class="temas">${temas}</ul>`}${esHoy || conBotones ? preguntaCosto(b) : ""}${acciones}`;
}

// el bloque que toca, grande y abierto
function bloqueFoco(b) {
  const m = materia(b.materia), ahora = ahoraHHMM();
  const enCurso = b.inicio <= ahora && b.fin > ahora;
  const primero = ((diaDelPlan(hoyISO()) || {}).bloques || []).find((x) => x.tipo === "estudio") === b;
  const cuando = enCurso ? `<span class="estado-chip ahora">${ic("reloj")} Ahora · hasta las ${b.fin}</span>`
    : `<span class="estado-chip">${ic("reloj")} Empieza en ${horas(aMin(b.inicio) - aMin(ahora))}</span>`;
  return `<div class="bloque-foco ${bloqueListo === claveBloque(b) ? "hecho-ya" : ""}" style="--mc:${m.color}">
    <div class="arriba"><div class="icono-materia">${iconoMateria(m)}</div><div style="flex:1;min-width:0">
      <div class="etiqueta-bloque">${enCurso ? "Ahora" : primero ? "Primer bloque" : "Siguiente"}</div>
      <div class="cuando"><b>${b.inicio} – ${b.fin}</b> · ${horas(b.minutos)}</div>
      <div class="nombre">${esc(m.nombre)}</div></div>${cuando}</div>
    ${cuerpoBloque(b, true, true, true)}</div>`;
}
let bloqueListo = null; // el bloque que se acaba de completar (brilla una vez)

// una fila compacta del día; tocarla la despliega
function filaBloque(b, esHoy) {
  const ahora = ahoraHHMM();
  const m = b.materia ? materia(b.materia) : null;
  const paso = esHoy && b.fin <= ahora;
  const hecho = b.tipo === "estudio" && bloqueHecho(b);
  const chipEstado = b.tipo !== "estudio" ? "" : hecho ? `<span class="estado-chip hecho">${ic("tilde")} Hecho</span>`
    : b.salteado ? `<span class="estado-chip">Salteado</span>` : paso ? `<span class="estado-chip paso">Pasó el horario</span>`
    : b.inicio <= ahora && b.fin > ahora ? `<span class="estado-chip ahora">Ahora</span>` : "";
  const que = b.tipo === "estudio" ? `${iconoEtapa(b.etapa)}<span><b>${esc(m.corto)}</b> · ${ETAPAS[b.etapa]} · ${horas(b.minutos)}</span>`
    : `${iconoBloque(b)}<span>${esc(b.texto)}</span>`;
  const color = m ? m.color : b.tipo === "imprevisto" ? "var(--alerta)" : "var(--apagado)";
  const clases = ["fila-bloque", (paso && (b.tipo !== "estudio" || hecho)) || b.salteado ? "pasada" : "", b.salteado ? "salteada" : ""].join(" ");
  const resumen = `<span class="tira" style="--mc:${color}"></span><span class="hora">${b.inicio} – ${b.fin}</span><span class="que">${que}</span>${chipEstado}`;
  if (b.tipo !== "estudio") return `<details class="${clases}" data-k="fila-${claveBloque(b)}" ontoggle="recordarAbierto(this)" ${abierto("fila-" + claveBloque(b))}><summary>${resumen}${ic("abajo").replace('class="ic"', 'class="ic flecha"')}</summary><div class="adentro">${cuerpoBloque(b, true, esHoy)}</div></details>`;
  return `<details class="${clases}" data-k="fila-${claveBloque(b)}" ontoggle="recordarAbierto(this)" ${abierto("fila-" + claveBloque(b))}><summary>${resumen}${ic("abajo").replace('class="ic"', 'class="ic flecha"')}</summary>
    <div class="adentro">${cuerpoBloque(b, true, esHoy, true)}</div></details>`;
}

function tareaGuardada(mid, id) {
  return materia(mid).tareas.find((t) => t.id === id) || { id, hecho: 0, texto: "" };
}

function tilde(mid, tarea, texto) {
  const v = valorTarea(mid, tareaGuardada(mid, tarea));
  const pendiente = cambios.has(`${mid}|${tarea}`);
  const clase = (v >= 0.99 ? "si" : v > 0 ? "medio" : "") + (pendiente ? " pendiente" : "");
  return `<button class="tilde ${clase}" ${bloqueado()} title="${v >= 0.99 ? "Destildar" : "Marcar como hecho"}"
    onclick="tildar('${mid}','${tarea}',this.dataset.t)" data-t="${esc(texto)}">${v >= 0.99 ? ic("tilde") : ""}</button>`;
}

// tildar o destildar: queda anotado acá hasta que se toca "Actualizar rutina"
function ponerValor(mid, tarea, valor, texto) {
  registrarToque(mid,tarea);
  const guardado = tareaGuardada(mid, tarea).hecho;
  const clave = `${mid}|${tarea}`;
  if (Math.abs(valor - guardado) < 0.01) cambios.delete(clave);
  else cambios.set(clave, { materia: mid, tarea, valor, texto });
}

function tildar(mid, tarea, texto) {
  const v = valorTarea(mid, tareaGuardada(mid, tarea));
  ponerValor(mid, tarea, v >= 0.99 ? 0 : 1, texto);
  refrescar();
}

function marcar(boton, parte) {
  const b = JSON.parse(boton.dataset.bloque);
  const ya = b.tareas.every((id) => Math.abs(valorTarea(b.materia, tareaGuardada(b.materia, id)) - parte) < 0.01);
  b.tareas.forEach((id, i) => {
    const valor = ya ? tareaGuardada(b.materia, id).hecho : parte;
    ponerValor(b.materia, id, valor, b.texto.split(" · ")[i] || "");
  });
  refrescar();
}

function refrescar() {
  dibujar();
  if (redibujarModal && !$("#modal").classList.contains("oculto")) redibujarModal();
}

// si Lean lo hizo en otro horario (o ayer), lo anota al guardar: { dia: "hoy" | "ayer", desde, hasta }
let otraHora = null;

function barraCambios() {
  const el = $("#cambios");
  const cantidad=cambios.size+dificultades.size;
  const hay = cantidad && !soloLectura;
  el.classList.toggle("oculto", !hay);
  document.body.classList.toggle("con-cambios", !!hay);
  if (el.contains(document.activeElement) && document.activeElement.matches("input")) return; // está escribiendo
  el.innerHTML = `<div class="cambios-fila"><span>${ic("guardar")} ${cantidad} ${cantidad === 1 ? "cambio sin guardar" : "cambios sin guardar"}</span>
    <button class="boton chico" onclick="alternarOtraHora()">${ic("reloj")} ${otraHora ? "Lo hice recién" : "Lo hice en otro horario"}</button>
    <button class="boton chico" onclick="descartarCambios()">Descartar</button>
    <button class="boton chico principal" onclick="guardarCambios()">${ic("repetir")} Actualizar rutina</button></div>
    ${otraHora ? `<div class="cambios-fila otra-hora"><span class="pildoras">
        <button class="${otraHora.dia === "hoy" ? "activa" : ""}" onclick="otraHora.dia='hoy';barraCambios()">Hoy</button>
        <button class="${otraHora.dia === "ayer" ? "activa" : ""}" onclick="otraHora.dia='ayer';barraCambios()">Ayer</button></span>
      <label>de <input class="campo-hora" inputmode="numeric" placeholder="16:00" value="${otraHora.desde}" oninput="horaEscrita(this,'desde')"></label>
      <label>a <input class="campo-hora" inputmode="numeric" placeholder="17:30" value="${otraHora.hasta}" oninput="horaEscrita(this,'hasta')"></label></div>` : ""}`;
}

function alternarOtraHora() {
  otraHora = otraHora ? null : { dia: "hoy", desde: "", hasta: "" };
  barraCambios();
}

// la hora se escribe con números solos: "1630" queda "16:30"
function horaEscrita(el, campo) {
  const n = el.value.replace(/\D/g, "").slice(0, 4);
  el.value = n.length > 2 ? n.slice(0, 2) + ":" + n.slice(2) : n;
  otraHora[campo] = el.value;
}

function descartarCambios() {
  cambios.clear();
  dificultades.clear();
  medido = 0;
  guardarMedicion();
  refrescar();
  avisar("Listo, no se guardó nada.");
}

async function guardarCambios() {
  const pedido = { tipo: "marcar_varias", cambios: [...cambios.values()] };
  if (medido > 0) pedido.real_min = medido; // si además dijo "de tal hora a tal hora", manda eso
  if (dificultades.size) pedido.dificultad = [...dificultades.values()];
  if (otraHora) {
    const bien = (h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
    if (!bien(otraHora.hasta) || (otraHora.desde && !bien(otraHora.desde))) return avisar("Poné las horas así: 16:30 (o tocá «Lo hice recién»).");
    if (otraHora.desde && otraHora.desde >= otraHora.hasta) return avisar("La hora de inicio tiene que ser antes que la de fin.");
    pedido.cuando = { dia: otraHora.dia === "ayer" ? iso(new Date(Date.now() - 86400000)) : hoyISO(), desde: otraHora.desde, hasta: otraHora.hasta };
  }
  // qué bloques de hoy quedan completos con este guardado (para festejar recién después de guardar bien)
  const dia = diaDelPlan(hoyISO());
  const completos = dia ? dia.bloques.filter((b) => b.tipo === "estudio" && bloqueHecho(b) && b.tareas.some((id) => cambios.has(`${b.materia}|${id}`))) : [];
  const respaldo = new Map(cambios), respaldoHora = otraHora, respaldoMedido = medido, respaldoCosto = new Map(dificultades);
  cambios.clear();
  dificultades.clear();
  otraHora = null;
  medido = 0;
  guardarMedicion();
  const ok = await enviar(pedido, null);
  if (!ok) { // no se pierde nada: vuelve todo como estaba
    respaldo.forEach((v, k) => cambios.set(k, v));
    respaldoCosto.forEach((v, k) => dificultades.set(k, v));
    otraHora = respaldoHora;
    medido = respaldoMedido;
    guardarMedicion();
    refrescar();
    return avisar("No se pudo guardar. Reintentá.");
  }
  const diaNuevo = diaDelPlan(hoyISO());
  if (diaNuevo && !diaNuevo.estudio_min && diaNuevo.bloques.some((b) => b.tipo === "estudio")) {
    festejarDia = true;
    dibujar();
    avisar("Por hoy, listo. Descansá.");
  } else if (completos.length) {
    bloqueListo = claveBloque(completos[0]);
    avisar(completos.length === 1 ? "Bloque listo." : `${completos.length} bloques listos.`);
    setTimeout(() => (bloqueListo = null), 1500);
  } else avisar("Rutina actualizada.");
}
function hayPendientesAlCerrar() {
  return Boolean(cambios.size || dificultades.size || guardadosEnCurso || formularioPendiente || midiendo || reloj.corriendo);
}
window.addEventListener("beforeunload", (e) => { if (hayPendientesAlCerrar()) { e.preventDefault(); e.returnValue = ""; } });
document.addEventListener('input', e => {
  if (e.target.matches('#modal input, #modal textarea, [id^="tg-"]') && e.target.id !== 'busqueda-kronos') formularioPendiente=true;
});

// ============================================================
// Calendario (por mes, como Google Calendar)
// ============================================================
function vistaCalendario() {
  const hoy = hoyISO();
  if (!mesVisto) mesVisto = hoy.slice(0, 7);
  if (!diaElegido) diaElegido = hoy;
  const [anio, mes] = mesVisto.split("-").map(Number);
  const primero = new Date(anio, mes - 1, 1, 12);
  const corrimiento = (primero.getDay() + 6) % 7; // la semana empieza el lunes
  const semanas = Math.ceil((corrimiento + new Date(anio, mes, 0).getDate()) / 7);

  let celdas = DIAS_CORTOS.map((d) => `<div class="dn">${d}</div>`).join("");
  for (let i = 0; i < semanas * 7; i++) {
    const fecha = new Date(anio, mes - 1, 1 - corrimiento + i, 12);
    const f = iso(fecha);
    const afuera = f.slice(0, 7) !== mesVisto;
    const dia = diaDelPlan(f);
    const finales = estado.materias.filter((m) => m.fecha === f);
    const estudio = dia ? dia.bloques.filter((b) => b.tipo === "estudio") : [];
    const ocupado = dia ? dia.bloques.filter((b) => ["compromiso", "imprevisto", "evento"].includes(b.tipo)
      || (b.tipo === "fijo" && ["cursada", "rotacion", "trabajo"].includes(b.clase))) : [];
    const colores = [...new Set(estudio.map((b) => materia(b.materia).color))];
    let dentro = "";
    if (!afuera) {
      dentro += finales.map((m) => `<span class="final-chip" style="background:${m.color};--mc:${m.color}" title="Final ${esc(m.corto)}">${ic("bandera")}<span class="fc-txt">FINAL ${esc(m.corto)}</span></span>`).join("");
      dentro += `<span class="puntos">${colores.map((c) => `<span class="punto" style="background:${c}"></span>`).join("")}</span>`;
      dentro += ocupado.map((b) => `<span class="ev gris">${b.inicio} ${esc(b.texto)}</span>`).join("");
      dentro += estudio.map((b) => `<span class="ev ${b.salteado ? "salteado" : ""}" style="--mc:${materia(b.materia).color}">${iconoEtapa(b.etapa)}${b.inicio} ${esc(materia(b.materia).corto)}</span>`).join("");
    }
    const clases = [afuera && "afuera", f === hoy && "es-hoy", f < hoy && "pasado", f === diaElegido && !afuera && "elegida"].filter(Boolean).join(" ");
    celdas += `<button class="celda ${clases}" onclick="elegirDia('${f}')"><span class="num">${fecha.getDate()}</span>${dentro}</button>`;
  }

  const meses = [...new Set([hoy.slice(0, 7), ...estado.plan.dias.map((d) => d.fecha.slice(0, 7)), ...estado.materias.map((m) => (m.fecha || "").slice(0, 7)).filter(Boolean)])].sort();
  const i = meses.indexOf(mesVisto);
  let html = `<div class="encabezado"><div class="titulo">Calendario</div></div>
    <div class="mes-nav"><button onclick="cambiarMes(-1)" ${i <= 0 ? "disabled" : ""} title="Mes anterior">${ic("izq")}</button>
      <h3>${MESES[mes - 1]} ${anio}</h3>
      <button onclick="cambiarMes(1)" ${i >= meses.length - 1 ? "disabled" : ""} title="Mes siguiente">${ic("der")}</button>
      <button class="hoy-btn" onclick="mesVisto=null;diaElegido=null;dibujar()">Hoy</button></div>
    <div class="mes">${celdas}</div>
    <div class="leyendas">${plegable("cal-leyenda", `${ic("capas")}<span><b>Materias y etapas</b></span>`,
      `<div class="leyenda">${estado.materias.map((m) => `<span><span class="punto" style="background:${m.color}"></span>${esc(m.corto)}</span>`).join("")}</div>
       <div class="leyenda">${Object.keys(ETAPAS).map((e) => `<span>${iconoEtapa(e)}${ETAPAS[e]}</span>`).join("")}</div>`)}
      ${(() => {
        const rot = estado.eventos.filter((e) => e.clase === "rotacion" && e.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
        if (!rot.length) return "";
        const dias = [...new Set(rot.map((e) => +e.fecha.slice(8)))];
        return plegable("cal-rot", `${ic("repetir")}<b>Rotaciones (${dias.join(dias.length > 2 ? ", " : " y ")})</b>`,
          rot.map((e) => `<div class="renglon" style="--mc:var(--apagado)"><b>${fechaCorta(e.fecha)}</b><span>${e.inicio}–${e.fin} · ${esc(e.nombre)}</span></div>`).join(""));
      })()}</div>`;

  // en el celu, el día elegido se ve abajo de la grilla (en la PC va en el recuadro de la derecha)
  if (diaElegido) {
    const dia = diaDelPlan(diaElegido);
    const renglones = dia ? dia.bloques.filter((b) => ["estudio", "final", "compromiso", "imprevisto"].includes(b.tipo)) : [];
    html += `<div class="tarjeta dia-elegido solo-celu" style="margin-top:14px">
      <h3 style="display:flex;gap:10px;align-items:center;font-size:20px">${ic("calendario")} ${diaSemana(diaElegido)} ${+diaElegido.slice(8)}${(diaDelPlan(diaElegido) || {}).estudio_min ? ` <span class="suave" style="font-size:15px;font-weight:500">· ${horas(diaDelPlan(diaElegido).estudio_min)}</span>` : ""}</h3>
      ${renglones.map((b) => {
        const m = b.materia ? materia(b.materia) : null;
        const texto = b.tipo === "estudio" ? `${iconoEtapa(b.etapa)} ${esc(m.corto)} · ${ETAPAS[b.etapa]}` : esc(b.texto);
        return `<div class="renglon" style="--mc:${m ? m.color : "var(--apagado)"}"><b>${b.inicio}</b><span>${texto}</span></div>`;
      }).join("") || `<p class="suave">Nada planificado.</p>`}
      <button class="boton principal grande" onclick="abrirDia('${diaElegido}')">Ver el día ${ic("adelante")}</button></div>`;
  }
  html += `<p class="suave chico" style="margin-top:12px">Tocá un día para ver su plan o avisar que estás ocupado.</p>`;
  return html;
}

function cambiarMes(paso) {
  const [a, m] = mesVisto.split("-").map(Number);
  const d = new Date(a, m - 1 + paso, 1);
  mesVisto = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  dibujar();
}

function elegirDia(f) {
  diaElegido = f;
  if (f.slice(0, 7) !== mesVisto) mesVisto = f.slice(0, 7);
  dibujar();
}

function detalleDia(f, enPanel) {
  const dia = diaDelPlan(f);
  const esHoy = f === hoyISO();
  const resumen = dia && dia.estudio_min ? `${horas(dia.estudio_min)} de estudio` : "Sin estudio planificado";
  let html = enPanel
    ? `<h3>${fechaLarga(f)}</h3><p style="display:flex;gap:8px;align-items:center;color:var(--acento-texto);font-size:15px;margin:0 0 12px">${ic("reloj")} ${resumen}</p>`
    : `<div class="titulo-modal">${ic("calendario")}<div><b>${fechaLarga(f)}</b><small>${resumen}</small></div></div><br>`;
  if (dia && dia.dia_unico) html += diaUnico(dia.dia_unico, esHoy ? "Hoy" : "Ese día");
  if (dia && dia.bloques.length) html += dia.bloques.map((b) => lineaBloque(b, esHoy, esHoy)).join("");
  else html += `<p class="suave">${f < hoyISO() ? "Día pasado." : "Día libre: no hay nada planificado."}</p>`;
  html += registroDelDia(f, "Lo que hiciste ese día");
  if (f >= hoyISO()) html += `<div class="acciones" style="margin-top:10px"><button class="boton grande" onclick="editarFijo(-1)" ${bloqueado()}>+ Agregar compromiso</button>
    <button class="enlace" onclick="abrirImprevisto('${f}')" ${bloqueado()}>${ic("rayo")} Estoy ocupado ese día</button></div>`;
  return html;
}

function abrirDia(f) { modal(detalleDia(f, false), () => abrirDia(f)); }

// ---------- imprevisto (puede durar varios días) ----------
function abrirImprevisto(fecha) {
  const esHoy = fecha === hoyISO();
  const desde = esHoy ? ahoraHHMM() : "09:00";
  const preparacion = [0, 15, 30, 45, 60, 90, 120].map((v) => `<option value="${v}">${v ? horas(v) : "Nada"}</option>`).join("");
  modal(`<div class="titulo-modal">${ic("calendario")}<div><b>Tuve un imprevisto</b><small>Lo reacomodamos con el tiempo que queda.</small></div></div>
    <label>Desde</label><div class="fila"><input id="i-fd" class="campo-fecha" inputmode="numeric" value="${verFecha(fecha)}" oninput="contarMovidos()"><input id="i-hd" class="campo-hora" inputmode="numeric" oninput="formatoHora(this)" value="${desde}" oninput="contarMovidos()"></div>
    <label>Hasta</label><div class="fila"><input id="i-fh" class="campo-fecha" inputmode="numeric" value="${verFecha(fecha)}" oninput="contarMovidos()"><input id="i-hh" class="campo-hora" inputmode="numeric" oninput="formatoHora(this)" value="${esHoy ? "21:00" : "11:00"}" oninput="contarMovidos()"></div>
    <label>Motivo <small>(opcional)</small></label><input id="i-nombre" placeholder="¿Qué surgió?">
    <label>Tiempo para prepararme antes</label><select id="i-antes">${preparacion}</select>
    <label class="check"><input id="i-anula" type="checkbox"> Ese día no voy al gimnasio</label>
    <div class="aviso-mover">${ic("mover")}<span id="i-movidos"></span></div>
    <button class="boton principal grande" onclick="guardarImprevisto()">Reacomodar</button>`);
  contarMovidos();
}

function rangoImprevisto() {
  const fd = leerFecha($("#i-fd").value), fh = leerFecha($("#i-fh").value), hd = $("#i-hd").value, hh = $("#i-hh").value;
  if (!fd || !fh || !hd || !hh || fh + hh <= fd + hd) return null;
  const eventos = [];
  for (let d = new Date(fd + "T12:00"); iso(d) <= fh; d.setDate(d.getDate() + 1)) {
    const f = iso(d);
    eventos.push({ fecha: f, inicio: f === fd ? hd : "00:00", fin: f === fh ? hh : "23:59" });
  }
  return eventos;
}

function contarMovidos() {
  const eventos = rangoImprevisto();
  if (!eventos) { $("#i-movidos").textContent = "Revisá las fechas y horas."; return; }
  let n = 0;
  for (const e of eventos) {
    const dia = diaDelPlan(e.fecha);
    if (dia) n += dia.bloques.filter((b) => b.tipo === "estudio" && b.inicio < e.fin && b.fin > e.inicio).length;
  }
  $("#i-movidos").textContent = n ? `Se ${n === 1 ? "moverá 1 bloque" : `moverán ${n} bloques`}` : "No se mueve ningún bloque";
}

function guardarImprevisto() {
  const eventos = rangoImprevisto();
  if (!eventos) return avisar("Revisá las fechas: el «hasta» tiene que ser después del «desde».");
  const nombre = $("#i-nombre").value.trim() || "Ocupado";
  const antes = +$("#i-antes").value || 0;
  const anula = $("#i-anula").checked;
  eventos.forEach((e, i) => Object.assign(e, { nombre, antes: i === 0 ? antes : 0, despues: 0, anula_fijos: anula, tipo: "imprevisto" }));
  cerrarModal();
  enviar({ tipo: "eventos", eventos }, "Listo, el plan se reacomodó.");
}

function borrarEvento(id) {
  if (!confirm("¿Lo borro? El plan se vuelve a armar.")) return;
  cerrarModal();
  enviar({ tipo: "borrar_evento", id }, "Borrado.");
}

// ============================================================
// Finales: tarjetas, lista para tildar y qué tan preparado estás
// ============================================================
function objetivoTerminado(m) {
  return m.tareas.length > 0 && m.tareas.every(t=>valorTarea(m.id,t)>=.99);
}

function vistaFinales() {
  const hoy = hoyISO();
  const lista = [...estado.materias].sort((a, b) => (a.fecha || "9").localeCompare(b.fecha || "9"));
  let html = encabezado("04", "Objetivos", "Tus objetivos", "Finales, parciales, TPs y lo que te propongas.");
  html += `<div class="acciones" style="margin:0 0 16px">
    <button class="boton principal" onclick="abrirAsistente()" ${bloqueado()}>${ic("estrella")} Nuevo con Gemini</button>
    <button class="boton" onclick="editarObjetivo(null)" ${bloqueado()}>+ Nuevo a mano</button>
    ${estado.materias.some((m) => (m.opciones || []).length > 1) ? `<button class="boton" onclick="irA('comparar')">${ic("calendario")} Comparar fechas</button>` : ""}</div>`;
  const tarjeta = (m) => {
    const a = avanceMateria(m);
    const futuro = m.fecha && m.fecha >= hoy;
    const lejos = m.inicio && m.inicio > hoy;
    if (m.id !== finalAbierto) {
      return `<div class="obj-compacto" style="--mc:${m.color}" onclick="abrirFinal('${m.id}')"><span class="tira"></span>
        <span><b>${esc(m.nombre)}</b> <small>· ${TIPOS[m.tipo || "final"]}${m.intensivo ? ` · ${m.intensivo.nivel === 'heroica' ? 'Noche heroica' : 'Intensivo'}` : ''}</small></span>
        <small class="solo-ancho">${ic("reloj")} ${horas(a.totalMin)}</small>
        <span class="solo-ancho"><div class="barra-progreso"><div style="width:${a.pct}%;background:${m.color}"></div></div></span>
        <small class="solo-ancho">${m.fecha ? `${fechaCorta(m.fecha)} · ${esc(m.hora)}` : "—"}</small>
        ${lejos ? chipArranque(m) : futuro ? chipSemaforo(m) : `<span class="pct">${a.pct} %</span>`}
        ${estado.plan.resumen[m.id]?.tapering_roto ? `<small class="suave">No pude dejar las últimas 48 h sin lectura nueva</small>` : ""}</div>`;
    }
    const fechas = (m.opciones || []).length > 1 ? `<div class="fechas"><span>Fechas posibles</span>${(m.opciones || []).map((f) =>
      `<button class="${f === m.fecha ? "elegida" : ""}" ${soloLectura || f < hoy ? "disabled" : ""} onclick="elegirFecha('${m.id}','${f}')">${f === m.fecha ? ic("tilde") + " " : ""}${fechaCorta(f)}</button>`).join("")}</div>` : "";
    const temas = (m.material || []).reduce((n, r) => n + (r.temas || []).length, 0);
    const sem = semaforo(m);
    return `<div class="tarjeta obj-abierto" style="--mc:${m.color}">
      <div class="cabeza" onclick="abrirFinal('${m.id}')"><div><h3>${esc(m.nombre)} <span class="pastilla">${TIPOS[m.tipo || "final"]}</span></h3>
        <div class="meta">${futuro ? `<span>${ic("objetivo")} ${cuandoFalta(diasHasta(m.fecha))}</span>` : ""}
          ${m.fecha ? `<span>${ic("calendario")} ${diaSemana(m.fecha)} ${fechaCorta(m.fecha)}</span><span>${ic("reloj")} ${esc(m.hora)}</span>` : ""}
          ${m.fecha_fija ? `<span class="pastilla">${ic("candado")} Fecha fija</span>` : ""}${lejos ? chipArranque(m) : futuro ? chipSemaforo(m) : ""}</div></div>${ic("arriba")}</div>
      ${m.nota ? `<div class="obj-nota"><b>Sobre el examen</b>${esc(m.nota)}</div>` : ""}
      ${fechas}
      <div class="obj-avance"><div class="anillo" style="--p:${a.pct}"><div>${a.pct} %</div></div>
        <div class="t"><b>${horas(a.faltaMin)} pendientes</b><span class="suave">${horas(a.hechoMin)} hechas de ~${horas(a.totalMin)} · ${a.como}</span>
          ${futuro && sem ? `<div class="llegas">${chipSemaforo(m, true)}</div>` : ""}</div></div>
      ${etapasObjetivo(m)}
      ${m.intensivo ? `<p class="suave">${m.intensivo.nivel === "heroica" ? "Noche heroica" : "Intensivo"} <button class="enlace" onclick="enviar({tipo:'quitar_intensivo',materia:'${m.id}'},'Modo quitado')" ${bloqueado()}>Quitar</button></p>` : ""}
      ${necesitaIntensivo(m) ? `<button class="boton" onclick="verIntensivo('${m.id}')" ${bloqueado()}>Ver plan intensivo</button>` : ""}
      ${estado.plan.resumen[m.id]?.tapering_roto ? `<p class="suave chico">No pude dejar las últimas 48 h sin lectura nueva</p>` : ""}
      ${(m.material || []).length ? `<p class="suave chico" style="display:flex;gap:8px;align-items:center;margin-top:10px">${ic("lista")} ${(m.material || []).length} resumen${(m.material || []).length === 1 ? "" : "es"} · ${temas} temas · ${(m.practica || []).length} para practicar</p>` : ""}
      <div class="acciones">
        <button class="boton principal" onclick="abrirLista('${m.id}')">${ic("lista")} Mi lista para tildar</button>
        ${(m.material || []).length ? `<button class="boton" onclick="editarMateria('${m.id}')" ${bloqueado()}>${ic("libro")} Qué hay que estudiar</button>` : ""}
        <button class="enlace" onclick="editarObjetivo('${m.id}')" ${bloqueado()}>${ic("lapiz")} Editar</button>
      </div></div>`;
  };
  const hechos=lista.filter(objetivoTerminado);
  html += lista.filter(m=>!objetivoTerminado(m)).map(tarjeta).join('');
  if (hechos.length) html += plegable('objetivos-terminados',`Terminados (${hechos.length})`,hechos.map(tarjeta).join(''));
  return html;
}

// las etapas de un objetivo en cajitas: total, % hecho, promedio por día y en cuántos días
function etapasObjetivo(m) {
  const a = avanceMateria(m);
  const etapas = Object.keys(ETAPAS).filter((e) => a.etapas[e].min > 0);
  if (!etapas.length) return "";
  const prom = {};
  for (const d of estado.plan.dias) for (const b of d.bloques) {
    if (b.tipo !== "estudio" || b.materia !== m.id || b.salteado) continue;
    const p = (prom[b.etapa] = prom[b.etapa] || { min: 0, dias: new Set() });
    p.min += b.minutos;
    p.dias.add(d.fecha);
  }
  const extra = m.tareas.filter((t) => t.extra).reduce((s, t) => s + t.minutos, 0);
  return `<div class="etapas-grilla">${etapas.map((e) => {
    const x = a.etapas[e], pct = Math.round((100 * x.hechoMin) / x.min), p = prom[e];
    return `<div class="etapa-caja" style="--ec:${COLOR_ETAPA[e]}"><div class="arriba"><span>${ic(ICONO_ETAPA[e])} ${ETAPAS[e]}</span><span>${horas(x.min)}</span></div>
      <small>${pct} %${p ? ` · ~${horas(p.min / p.dias.size)}/día · ${p.dias.size} ${p.dias.size === 1 ? "día" : "días"}` : ""}</small>
      <div class="barra-progreso"><div style="width:${pct}%"></div></div></div>`;
  }).join("")}</div>${extra ? `<p class="suave chico extra-nota">Incluye ${horas(extra)} de «si sobra tiempo».</p>` : ""}`;
}

// ============================================================
// Asistente "Objetivo nuevo" con Gemini: Lean cuenta qué quiere hacer y elige la carpeta; Gemini propone qué
// estudiar (resúmenes divididos en temas, práctica, horas) y Lean lo revisa antes de crearlo (asistente.py).
// ============================================================
let asis = { texto: "", carpeta: "", carpetas: null, gemini: true, buscando: false, propuesta: null, cambios: "" };

async function abrirAsistente() {
  if (!asis.carpetas) {
    try {
      const r = await (await fetch("/api/carpetas", { headers: cabeceras() })).json();
      asis.carpetas = r.carpetas;
      asis.conteo = r.conteo || {};
      asis.gemini = r.gemini;
    } catch (e) { return avisar("No pude leer las carpetas de la PC."); }
  }
  asis.propuesta ? pantallaPropuesta() : pantallaPedido();
}

function pantallaPedido() {
  modal(`<div class="titulo-modal">${ic("estrella")}<div><b>Nuevo objetivo con Gemini</b><small>Gemini te propone un objetivo a partir de tu pedido y tus apuntes.</small></div></div>
    ${asis.gemini ? "" : `<div class="tarjeta alerta">${ic("alerta")}<span>No encontré la clave de Gemini de IKELOS Protocol.</span></div>`}
    <div class="paso"><span class="num">1</span><b>Contá tu objetivo</b></div>
    <textarea id="as-texto" rows="4" placeholder="Ej.: Quiero rendir el final de Semiología el 10/12 a las 14 h. Voy a usar el resumen de Fulano. Entra hasta la unidad 4 y es multiple choice." oninput="asis.texto=this.value">${esc(asis.texto)}</textarea>
    <div class="paso"><span class="num">2</span><b>Elegí la carpeta</b></div>
    <div class="buscar">${ic("lupa")}<input id="as-carpeta" value="${esc(asis.carpeta)}" placeholder="Buscar carpeta: farmaco, semio, tercero…" oninput="asis.carpeta=this.value;sugerirCarpetas()" autocomplete="off"></div>
    <div class="migas">${ic("carpeta")} UBA <span>›</span> Kinesio</div>
    <div id="as-sugerencias" class="carpetas"></div>
    <p class="aviso-ia">${ic("candado")}<span><b>Se envía a Gemini lo que escribís y los nombres y páginas de los archivos de esta carpeta.</b> No se mandan los apuntes enteros. Con la clave gratis, Google puede usar esos datos para mejorar sus productos. Nunca se mandan historias clínicas, datos de pacientes ni documentos personales.</span></p>
    <div class="acciones pie-modal"><span class="suave chico">${ic("estrella")} Revisás la propuesta antes de crear el objetivo.</span>
      <button class="boton" onclick="cerrarModal()">Cancelar</button>
      <button class="boton principal" id="as-boton" onclick="pedirPropuesta()" ${asis.buscando ? "disabled" : ""}>${asis.buscando ? "Pensando a fondo… (puede tardar 2 o 3 minutos)" : "Armar la propuesta"}</button></div>`);
  sugerirCarpetas();
}

function sugerirCarpetas() {
  const caja = $("#as-sugerencias");
  if (!caja) return;
  const limpio = (t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const q = limpio(asis.carpeta || "");
  const exacta = asis.carpetas.includes(asis.carpeta);
  let lista = exacta ? [asis.carpeta] : q ? asis.carpetas.filter((c) => limpio(c).includes(q)).slice(0, 8)
    : asis.carpetas.filter((c) => c.split("\\").length === 2).slice(0, 6);
  caja.innerHTML = lista.map((c) => {
    const partes = c.split("\\"), n = (asis.conteo || {})[c];
    return `<button type="button" class="carpeta-fila ${exacta ? "elegida" : ""}" onclick="elegirCarpeta(this.dataset.c)" data-c="${esc(c)}">${ic("carpeta")}
      <span><b>${esc(partes[partes.length - 1])}</b>${partes.length > 1 ? `<small>${esc(partes.slice(0, -1).join(" › "))}</small>` : ""}</span>
      <span class="suave">${n === undefined ? "" : `${n} ${n === 1 ? "archivo" : "archivos"}`}</span>${exacta ? ic("tilde") : ""}</button>`;
  }).join("") || `<p class="suave chico" style="padding:8px">No encontré carpetas con eso.</p>`;
}

function elegirCarpeta(c) {
  asis.carpeta = c;
  $("#as-carpeta").value = c;
  sugerirCarpetas();
}

async function pedirPropuesta(extra = "") {
  if (!asis.carpetas.includes(asis.carpeta)) return avisar("Elegí la carpeta de la lista.");
  asis.buscando = true;
  extra ? pantallaPropuesta() : pantallaPedido();
  try {
    const texto = asis.texto + (extra ? `\n\nCorrecciones de Lean a la propuesta anterior: ${extra}` : "");
    const r = await fetch("/api/asistente", { method: "POST", headers: cabeceras(), body: JSON.stringify({ texto, carpeta: asis.carpeta }) });
    const cuerpo = await r.json();
    if (!r.ok) throw new Error(cuerpo.error || r.status);
    if (extra) asis.texto = texto;
    asis.propuesta = cuerpo;
    asis.cambios = "";
  } catch (e) {
    avisar("No se pudo: " + e.message);
  }
  asis.buscando = false;
  asis.propuesta ? pantallaPropuesta() : pantallaPedido();
}

// cuánto lleva cada parte, con lo que Lean vaya cambiando (ritmo, horas, qué incluye)
function horasPropuesta(m) {
  const paginas = (r) => r.temas.reduce((s, t) => s + t.hasta - t.desde + 1, 0) || r.paginas; // solo lo que entra
  const lectura = m.material.filter((r) => !r.fuera).reduce((s, r) => s + (paginas(r) / Math.max(1, r.ritmo)) * 60, 0);
  const practica = m.practica.filter((p) => !p.fuera).reduce((s, p) => s + p.horas * 60, 0);
  const tareas = m.actividades.reduce((s, a) => s + a.horas * 60, 0);
  return { lectura, repaso: lectura * m.repaso_factor, practica, tarea: tareas };
}

function pantallaPropuesta() {
  const p = asis.propuesta, m = p.materia, h = horasPropuesta(m);
  const total = Object.values(h).reduce((s, x) => s + x, 0);
  const fecha = m.fecha ? m.fecha.split("-").reverse().join("/") : "";
  const resumenes = m.material.map((r, j) => `<div class="tarjeta prop-item ${r.fuera ? "fuera" : ""}">
      <div class="prop-fila"><button class="tilde ${r.fuera ? "" : "si"}" onclick="asis.propuesta.materia.material[${j}].fuera=!asis.propuesta.materia.material[${j}].fuera;pantallaPropuesta()">${r.fuera ? "" : ic("tilde")}</button>
        <b>${esc(r.nombre)}</b><span class="suave">· ${r.paginas} págs. · ${r.temas.length} temas</span></div>
      ${r.por_que ? `<p class="suave chico">${esc(r.por_que)}</p>` : ""}
      <div class="prop-fila"><label>Páginas por hora</label><input data-num inputmode="decimal" value="${r.ritmo}" onchange="asis.propuesta.materia.material[${j}].ritmo=Math.max(1,+this.value||1);pantallaPropuesta()"></div>
      <details><summary>Ver los temas</summary><ol class="prop-temas">${r.temas.map((t) => `<li>${esc(t.nombre)} <span class="suave">(págs. ${t.desde}–${t.hasta})</span>${t.secundario ? ` <span class="chip-extra si">Si sobra tiempo</span>` : ""}</li>`).join("")}</ol></details></div>`).join("");
  const practica = m.practica.map((x, j) => `<div class="prop-fila prop-practica ${x.fuera ? "fuera" : ""}">
      <button class="tilde ${x.fuera ? "" : "si"}" onclick="asis.propuesta.materia.practica[${j}].fuera=!asis.propuesta.materia.practica[${j}].fuera;pantallaPropuesta()">${x.fuera ? "" : ic("tilde")}</button>
      <span>${esc(x.nombre)}</span><input data-num inputmode="decimal" value="${x.horas}" onchange="asis.propuesta.materia.practica[${j}].horas=Math.max(0.25,+this.value||1);pantallaPropuesta()"><small>h</small></div>`).join("");
  const tareas = m.actividades.map((a) => `<div class="prop-fila"><span>${esc(a.nombre)}</span><small>${horas(a.horas * 60)}</small></div>`).join("");
  modal(`<div class="titulo-modal">${ic("estrella")}<div><b>La propuesta de Gemini</b><small>Revisala y cambiá lo que quieras antes de crearla.</small></div></div>
    <div class="tarjeta prop-explicacion">${esc(p.explicacion)}</div>
    ${p.dudas.length ? `<div class="tarjeta alerta">${ic("alerta")}<span><b>Le falta saber:</b> ${p.dudas.map(esc).join(" · ")}</span></div>` : ""}
    <div class="fila"><div><label>Tipo</label><select onchange="asis.propuesta.materia.tipo=this.value">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${k === m.tipo ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div style="flex:2"><label>Nombre</label><input value="${esc(m.nombre)}" oninput="asis.propuesta.materia.nombre=this.value"></div>
      <div><label>Corto</label><input maxlength="10" value="${esc(m.corto)}" oninput="asis.propuesta.materia.corto=this.value"></div></div>
    <div class="fila"><div><label>Fecha <small>(día/mes/año)</small></label><input class="campo-fecha" inputmode="numeric" placeholder="10/12/2026" value="${fecha}" onchange="fechaPropuesta(this)"></div>
      <div><label>Hora</label><input class="campo-hora" inputmode="numeric" placeholder="17:30" value="${esc(m.hora)}" oninput="horaPropuesta(this)"></div>
      <div><label>Empezar desde</label><input class="campo-fecha" inputmode="numeric" placeholder="vacío = ya" value="${verFecha(m.inicio)}" onchange="inicioPropuesta(this)"></div></div>
    ${m.arranque_sugerido ? `<p class="suave chico">Kronos sugiere arrancar el <b>${verFecha(m.arranque_sugerido)}</b>${m.inicio ? " (ya está puesto: antes no te molesta)" : ""}. Si lo dejás vacío, arranca ya.</p>` : ""}
    <div class="reparto-prop">${Object.entries(h).filter(([, v]) => v > 0).map(([e, v]) => `<span>${iconoEtapa(e)}<b style="color:${COLOR_ETAPA[e]}">${ETAPAS[e]}</b> ${horas(v)}</span>`).join("")}<span class="total">Total <b>${horas(total)}</b></span></div>
    <h2>${ic("libro")} Para leer</h2>${resumenes || `<p class="suave">No propuso resúmenes.</p>`}
    <h2>${ic("lapiz")} Para practicar</h2><div class="tarjeta">${practica || `<p class="suave">Nada para practicar.</p>`}</div>
    ${tareas ? `<h2>${ic("lista")} Tareas</h2><div class="tarjeta">${tareas}</div>` : ""}
    <label>¿Querés que cambie algo? <small>(opcional)</small></label>
    <textarea rows="2" placeholder="Ej.: usá también el resumen de la cátedra, son 2 parciales y no 3 simulacros…" oninput="asis.cambios=this.value">${esc(asis.cambios)}</textarea>
    <div class="acciones"><button class="boton principal" onclick="crearPropuesta()" ${asis.buscando ? "disabled" : ""}>${ic("tilde")} Crear objetivo</button>
      <button class="boton" onclick="asis.cambios.trim()?pedirPropuesta(asis.cambios.trim()):avisar('Escribí qué querés que cambie.')" ${asis.buscando ? "disabled" : ""}>${asis.buscando ? "Pensando a fondo… (2 o 3 minutos)" : ic("repetir") + " Pedir cambios"}</button>
      <button class="boton" onclick="asis.propuesta=null;pantallaPedido()">Empezar de nuevo</button></div>
    <p class="suave chico">Respondió ${esc(p.modelo)}${p.excluidos ? ` · se saltearon ${p.excluidos} archivos privados (no se mandaron)` : ""}.</p>`);
}

function fechaPropuesta(el) {
  const n = el.value.match(/\d+/g) || [];
  const hoy = new Date();
  if (n.length < 2) return avisar("Poné la fecha así: 10/12/2026.");
  let anio = n[2] ? (+n[2] < 100 ? 2000 + +n[2] : +n[2]) : hoy.getFullYear();
  // sin año: el próximo que viene
  if (!n[2] && `${anio}-${String(+n[1]).padStart(2, "0")}-${String(+n[0]).padStart(2, "0")}` < hoyISO()) anio += 1;
  asis.propuesta.materia.fecha = `${anio}-${String(+n[1]).padStart(2, "0")}-${String(+n[0]).padStart(2, "0")}`;
  el.value = asis.propuesta.materia.fecha.split("-").reverse().join("/");
}

function formatoHora(el) {
  const n = el.value.replace(/\D/g, "").slice(0, 4);
  el.value = n.length > 2 ? n.slice(0, 2) + ":" + n.slice(2) : n;
}

function horaPropuesta(el) {
  const n = el.value.replace(/\D/g, "").slice(0, 4);
  el.value = n.length > 2 ? n.slice(0, 2) + ":" + n.slice(2) : n;
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(el.value)) asis.propuesta.materia.hora = el.value;
}

function inicioPropuesta(el) {
  const f = leerFecha(el.value);
  if (f === null) return avisar("Poné la fecha así: 15/01/2027 (o dejala vacía).");
  asis.propuesta.materia.inicio = f || undefined;
  el.value = verFecha(f);
}

async function crearPropuesta() {
  const m = JSON.parse(JSON.stringify(asis.propuesta.materia));
  if (!m.fecha) return avisar("Falta la fecha.");
  m.material = m.material.filter((r) => !r.fuera);
  m.practica = m.practica.filter((p) => !p.fuera);
  if (!m.material.length && !m.practica.length && !m.actividades.length) return avisar("No quedó nada para estudiar.");
  const antes = new Set(estado.materias.map((x) => x.id));
  await enviar({ tipo: "crear_objetivo", materia: m }, `Listo: «${m.nombre}» ya está en tu plan.`);
  const nuevo = estado.materias.find((x) => !antes.has(x.id));
  if (nuevo) {
    asis = { ...asis, texto: "", carpeta: "", propuesta: null, cambios: "" };
    cerrarModal();
    finalAbierto = nuevo.id;
    irA("finales", true);
  }
}

function abrirFinal(id) { registrarToque(id); finalAbierto = finalAbierto === id ? "" : id; dibujar(); }

// crear o editar un objetivo (final, parcial, TP, presentación o propio) con sus tareas
function editarObjetivo(mid) {
  if (mid) registrarToque(mid);
  const m = mid ? materia(mid) : { tipo: "parcial", nombre: "", corto: "", fecha: "", hora: "09:00", color: PALETA[(estado.materias.length) % PALETA.length], preparacion_min: 60, nota: "", actividades: [] };
  const filas = (m.actividades || []).map((t) => filaActividad(t.nombre, t.horas)).join("");
  modal(`<div class="titulo-modal">${ic("objetivo")}<div><b>${mid ? "Editar objetivo" : "Nuevo objetivo"}</b><small>Kronos reparte sus tareas hasta la fecha.</small></div></div>
    <div class="fila"><div><label>Tipo</label><select id="o-tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${k === (m.tipo || "final") ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div style="flex:2"><label>Nombre</label><input id="o-nombre" value="${esc(m.nombre)}" placeholder="Ej.: Parcial de Semio, TP de MAP"></div></div>
    <div class="fila"><div><label>Nombre corto</label><input id="o-corto" maxlength="10" value="${esc(m.corto || "")}" placeholder="Ej.: Semio"></div>
      <div><label>Fecha <small>(día/mes/año)</small></label><input id="o-fecha" class="campo-fecha" inputmode="numeric" placeholder="17/02/2027" value="${verFecha(m.fecha)}"></div>
      <div><label>Hora</label><input id="o-hora" class="campo-hora" inputmode="numeric" placeholder="09:00" value="${esc(m.hora || "09:00")}" oninput="formatoHora(this)"></div></div>
    <div class="fila"><div><label>Empezar a estudiar desde <small>(opcional)</small></label>
        <input id="o-inicio" class="campo-fecha" inputmode="numeric" placeholder="vacío = ya" value="${verFecha(m.inicio)}"></div>
      <div style="flex:2" class="suave chico arranque-ayuda">${m.arranque_sugerido ? `Kronos sugiere arrancar el <b>${verFecha(m.arranque_sugerido)}</b>.
        <button type="button" class="enlace" onclick="document.getElementById('o-inicio').value='${verFecha(m.arranque_sugerido)}'">Usar esa</button>` : "Si lo dejás vacío, arranca ya."}
        Antes de esa fecha no aparece en tu plan.</div></div>
    <div class="fila"><div><label>Preparación antes (min)</label><input id="o-prepa" data-num inputmode="decimal" value="${m.preparacion_min || 0}"></div>
      <div style="flex:2"><label>Color</label><div class="paleta">${PALETA.map((c) => `<button type="button" class="${c === m.color ? "activa" : ""}" style="background:${c}" data-color="${c}" onclick="document.querySelectorAll('.paleta button').forEach(b=>b.classList.remove('activa'));this.classList.add('activa')"></button>`).join("")}</div></div></div>
    <label>Nota <small>(opcional)</small></label><input id="o-nota" value="${esc(m.nota || "")}" placeholder="Ej.: entra hasta la unidad 4, es oral">
    <label>Qué llevar al examen <small>(una cosa por renglón; solo finales/parciales)</small></label><textarea id="o-llevar">${esc((m.llevar || ['Libreta universitaria','DNI','Lapicera','Agua']).join('\n'))}</textarea>
    <label>Viaje al examen (min)</label><input id="o-viaje" data-num inputmode="numeric" value="${m.viaje_min ?? 60}">
    <div style="margin-top:14px"><label id="o-esfuerzo-label">Tipo de esfuerzo <small>(opcional)</small></label>
      <input type="hidden" id="o-esfuerzo" value="${esc(m.esfuerzo || "")}">
      <div class="acciones" role="group" aria-labelledby="o-esfuerzo-label" id="o-esfuerzos">
        ${[["", "Sin preferencia"], ["memoria", "Memoria"], ["comprension", "Comprensión"], ["practica", "Práctica"]].map(([valor, texto]) => `<button type="button" class="boton chico ${(m.esfuerzo || "") === valor ? "principal" : ""}" data-esfuerzo="${valor}" aria-pressed="${(m.esfuerzo || "") === valor}" onclick="elegirEsfuerzo(this)">${texto}</button>`).join("")}
      </div><p class="suave chico">Si puede, Kronos alterna esfuerzos dentro del día para que no se te haga pesado.</p></div>
    <h2>${ic("lista")} Tareas para llegar</h2>
    <p class="suave">${(m.material || []).length ? "Los resúmenes y la práctica de este objetivo ya están cargados; acá podés sumar tareas extra." : "Escribí qué hay que hacer y cuántas horas calculás para cada cosa. Kronos las reparte en tus días."}</p>
    <div id="o-tareas">${filas}</div>
    <button class="boton chico" onclick="document.getElementById('o-tareas').insertAdjacentHTML('beforeend', filaActividad('', 1))">+ Agregar tarea</button>
    <div class="acciones" style="margin-top:14px"><button class="boton principal" onclick="guardarObjetivo(${mid ? `'${mid}'` : "null"})">Guardar</button>
      ${mid ? `<button class="boton peligro" onclick="borrarObjetivo('${mid}')">${ic("basura")} Borrar objetivo</button>` : ""}</div>`);
  if (!mid && !filas) document.getElementById("o-tareas").insertAdjacentHTML("beforeend", filaActividad("", 1));
}

function filaActividad(nombre, horas) {
  return `<div class="fila actividad"><div style="flex:3"><input data-a="nombre" value="${esc(nombre)}" placeholder="Ej.: Leer la unidad 1, armar las diapositivas"></div>
    <div style="flex:0 0 90px"><input data-a="horas" data-num inputmode="decimal" value="${horas}" title="Horas"></div>
    <button class="boton chico peligro" style="flex:0 0 auto;border:0" onclick="this.parentElement.remove()">${ic("cruz")}</button></div>`;
}

function elegirEsfuerzo(boton) {
  $("#o-esfuerzo").value = boton.dataset.esfuerzo;
  document.querySelectorAll("#o-esfuerzos button").forEach((b) => {
    const elegido = b === boton;
    b.classList.toggle("principal", elegido);
    b.setAttribute("aria-pressed", String(elegido));
  });
}

function guardarObjetivo(mid) {
  const materias = JSON.parse(JSON.stringify(estado.materias));
  let m = mid ? materias.find((x) => x.id === mid) : null;
  if (!m) {
    m = { id: "o" + Math.random().toString(16).slice(2, 8), material: [], practica: [], extras: [], progreso: {}, repaso_factor: 0.33, opciones: [] };
    materias.push(m);
  }
  const nombre = $("#o-nombre").value.trim();
  const fecha = leerFecha($("#o-fecha").value);
  const inicio = leerFecha($("#o-inicio").value);
  if (!nombre || !fecha) return avisar("Poné por lo menos el nombre y la fecha (así: 17/02/2027).");
  if (inicio === null) return avisar("La fecha para empezar va así: 15/01/2027 (o dejala vacía).");
  if (inicio && inicio >= fecha) return avisar("La fecha para empezar tiene que ser antes que la del objetivo.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test($("#o-hora").value)) return avisar("La hora va así: 09:00.");
  const color = (document.querySelector(".paleta button.activa") || {}).dataset;
  Object.assign(m, {
    llevar: ($('#o-llevar')?.value || '').split('\n').map(x => x.trim()).filter(Boolean),
    viaje_min: Math.max(0, Math.min(1440, +$('#o-viaje')?.value || 0)),
    esfuerzo: $("#o-esfuerzo").value,
    tipo: $("#o-tipo").value, nombre, corto: $("#o-corto").value.trim() || nombre.split(" ").slice(-1)[0].slice(0, 10),
    fecha, inicio: inicio || undefined, hora: $("#o-hora").value || "09:00", preparacion_min: +$("#o-prepa").value || 0,
    color: color ? color.color : m.color || PALETA[0], nota: $("#o-nota").value.trim(),
    actividades: [...document.querySelectorAll("#o-tareas .actividad")].map((f) => ({
      nombre: f.querySelector('[data-a="nombre"]').value.trim(), horas: +f.querySelector('[data-a="horas"]').value || 0,
    })).filter((t) => t.nombre && t.horas > 0),
  });
  if ((m.opciones || []).length && !m.opciones.includes(fecha)) m.opciones = [...m.opciones, fecha].sort();
  cerrarModal();
  enviar({ tipo: "guardar", datos: { materias } }, mid ? "Objetivo guardado. El plan se rehízo." : "Objetivo nuevo: ya está en el plan.");
}

function borrarObjetivo(mid) {
  if (!confirm(`¿Borro «${materia(mid).nombre}» y todo lo que tenía marcado?`)) return;
  const materias = JSON.parse(JSON.stringify(estado.materias)).filter((x) => x.id !== mid);
  cerrarModal();
  enviar({ tipo: "guardar", datos: { materias } }, "Objetivo borrado.");
}

function elegirFecha(mid, fecha) {
  enviar({ tipo: "fecha_final", materia: mid, fecha }, `${materia(mid).nombre}: ${diaSemana(fecha)} ${fechaCorta(fecha)}. El plan se rearmó.`);
}

// la lista de todo lo que hay que hacer para un final, para ir tildando
function abrirLista(mid) {
  registrarToque(mid);
  const m = materia(mid);
  const a = avanceMateria(m);
  const futuro = m.fecha && m.fecha >= hoyISO();
  let html = `<div class="lista-cabeza"><div class="titulo-modal">${iconoMateria(m)}<div><b>${esc(m.nombre)}</b>
    <small>${m.fecha ? `${TIPOS[m.tipo || "final"]}: ${diaSemana(m.fecha)} ${fechaCorta(m.fecha)} · ${esc(m.hora)}${futuro ? " · " + cuandoFalta(diasHasta(m.fecha)) : " · ya pasó"}` : ""}</small></div></div>
    <div class="chips"><span>${ic("objetivo")} ${a.pct} % hecho</span><span>${ic("reloj")} ${horas(a.faltaMin)} pendientes</span>${futuro ? chipSemaforo(m, true) : ""}</div></div>
    ${etapasObjetivo(m)}${soloLectura ? "" : sugerenciasRitmo(m.id)}
    <p class="suave chico" style="margin:12px 0">Tildá lo que hiciste o adelantaste; se guarda con «Actualizar rutina». «Si sobra tiempo» va al final y no afecta el semáforo si no llegás.</p>`;
  const fila = (t) => {
    const marcable = /^[LAP]/.test(t.id) && !soloLectura;
    const chip = marcable ? `<button class="chip-extra ${t.extra ? "si" : ""}" title="${t.extra ? "Pasar a clave" : "Pasar a «si sobra tiempo»"}" onclick="marcarExtra('${m.id}','${t.id}',${!t.extra})">${t.extra ? "Si sobra tiempo" : "Clave"}</button>`
      : t.extra ? `<span class="chip-extra si">Si sobra tiempo</span>` : "";
    const costo = t.etapa === "lectura" ? (m.dificultad || {})[temaDe(t.id)] : null;
    const chipCosto = costo ? `<span class="chip-costo ${costo}" title="Así te costó">${costo === "dificil" ? "Te costó" : costo === "normal" ? "Normal" : "Fácil"}</span>` : "";
    const pg = (t.texto.match(/\(págs?\.\s*([^)]+)\)/) || [])[1];
    const nombre = pg ? t.texto.replace(/\s*\(págs?\.[^)]*\)/, "") : t.texto;
    return `<div class="item ${valorTarea(m.id, t) >= 0.99 ? "hecho" : ""} ${t.extra ? "es-extra" : ""}">${tilde(m.id, t.id, t.texto)}<span class="tema">${esc(nombre)}${notasDeTarea(m.id,t.id)}</span>${pg ? `<span class="pags">págs. ${esc(pg)}</span>` : ""}${chipCosto}${chip}<small>${horas(t.minutos)}</small></div>`;
  };
  for (const [etapa, nombre] of Object.entries(ETAPAS)) {
    const de = m.tareas.filter((t) => t.etapa === etapa);
    if (!de.length) continue;
    let adentro = "", resumen = null;
    for (const t of de.filter((t) => !t.extra)) {
      if (etapa !== "practica" && t.resumen && t.resumen !== resumen) { resumen = t.resumen; adentro += `<div class="lista-resumen">${esc(resumen)}</div>`; }
      adentro += fila(t);
    }
    const sobra = de.filter((t) => t.extra);
    if (sobra.length) adentro += `<div class="lista-sobra">${ic("estrella")} Si sobra tiempo <small>va al final y no afecta el semáforo</small></div>` + sobra.map(fila).join("");
    html += plegable(`lista-${m.id}-${etapa}`, `<span class="eic" style="--ec:${COLOR_ETAPA[etapa]}">${ic(ICONO_ETAPA[etapa])}</span>${nombre} <span class="suave">(${a.etapas[etapa].hechas} / ${de.length})</span>`,
      `<div class="lista">${adentro}</div>`, etapa === Object.keys(ETAPAS).find((e) => m.tareas.some((t) => t.etapa === e && valorTarea(m.id, t) < 0.99)), "etapa-plegable");
  }
  modal(html, () => abrirLista(mid));
}

let filtrosTemas = {materia:'',etapa:'',clave:'',costo:''};

function costoTema(m, t) {
  const refs = t.referencias?.length ? t.referencias.map(r => r.id) : t.etapa === 'lectura' ? [temaDe(t.id)] : [];
  const valores = refs.map(id => dificultades.get(`${m.id}|${id}`)?.valor || m.dificultad?.[id] || '');
  const distintos = [...new Set(valores)];
  return distintos.length > 1 ? 'mixta' : distintos[0] || '';
}

function indiceTemas() {
  const fechas = new Map();
  for (const dia of estado.plan.dias) for (const b of dia.bloques) if (b.tipo === 'estudio' && !b.salteado) {
    for (const id of b.tareas) {
      const clave = `${b.materia}|${id}`;
      if (!fechas.has(clave) || fechas.get(clave) > dia.fecha) fechas.set(clave,dia.fecha);
    }
  }
  return estado.materias.flatMap(m => m.tareas.map(t => ({m,t,fecha:fechas.get(`${m.id}|${t.id}`) || '',
    valor:valorTarea(m.id,t),costo:costoTema(m,t),notas:(t.referencias || []).map(r => r.nota_lean || '').join(' ')})));
}

function filtrarTemas(filas, filtros = filtrosTemas, terminados = false) {
  return filas.filter(({m,t,valor,costo}) => (terminados ? valor >= .99 : valor < .99) && (!filtros.materia || m.id === filtros.materia)
    && (!filtros.etapa || t.etapa === filtros.etapa) && (!filtros.clave || (filtros.clave === 'extra' ? t.extra : !t.extra))
    && (!filtros.costo || (filtros.costo === 'sin' ? !costo : costo === filtros.costo)));
}

function cambiarFiltroTemas(clave, valor) {
  filtrosTemas[clave] = filtrosTemas[clave] === valor ? '' : valor;
  dibujar();
}

function filaTemaGeneral({m,t,fecha,valor,costo}) {
  return `<div class="item tema-general">${tilde(m.id,t.id,t.texto)}<span class="tema"><button class="enlace" onclick="abrirLista('${m.id}')">${esc(m.corto || m.nombre)} · ${ETAPAS[t.etapa]}</button><b>${esc(t.texto)}</b>
    <small class="suave">${fecha ? fechaCorta(fecha) : 'Sin fecha asignada'} · ${t.extra ? 'Si sobra tiempo' : 'Clave'}${costo ? ' · ' + ({facil:'Fácil',normal:'Normal',dificil:'Difícil',mixta:'Dificultad mixta'}[costo] || '') : ''}</small>${notasDeTarea(m.id,t.id)}</span><small>${horas(t.minutos * (1-valor))}</small></div>`;
}

function grupoFechaTema(fecha, hoy = hoyISO()) {
  if (!fecha) return 'Sin fecha asignada';
  const dias=Math.round((Date.parse(fecha+'T00:00:00Z')-Date.parse(hoy+'T00:00:00Z'))/86400000);
  return dias<0 ? 'De días anteriores' : dias===0 ? 'Hoy' : dias===1 ? 'Mañana' : dias<=7 ? 'Próximos 7 días' : 'Más adelante';
}

function totalesTemas(filas) {
  const sinCosto=new Set();
  for (const {m,t} of filas) {
    const refs=t.referencias?.length ? t.referencias.map(r=>r.id) : t.etapa==='lectura' ? [temaDe(t.id)] : [];
    for (const id of refs) if (id.startsWith('L') && !dificultades.get(`${m.id}|${id}`)?.valor && !m.dificultad?.[id]) sinCosto.add(`${m.id}|${id}`);
  }
  return {minutos:filas.reduce((s,{t,valor})=>s+t.minutos*(1-valor),0),sinCosto:sinCosto.size};
}

function vistaTemas() {
  const indice = indiceTemas(), filas = filtrarTemas(indice);
  const grupo = (clave,titulo,opciones) => `<div class="filtros-temas" role="group" aria-label="${titulo}"><b>${titulo}</b>${opciones.map(([v,n]) => `<button class="boton chico ${filtrosTemas[clave] === v ? 'principal' : ''}" aria-pressed="${filtrosTemas[clave] === v}" onclick="cambiarFiltroTemas('${clave}','${v}')">${esc(n)}</button>`).join('')}</div>`;
  let html = encabezado('05','Temas','Todo lo que falta','Todas tus materias, con las notas e indicaciones que escribiste.');
  html += `<button class="boton" onclick="abrirBuscador()">${ic('buscar')} Buscar temas, materias y notas</button>`;
  html += `<div class="tarjeta">${grupo('materia','Materia',estado.materias.map(m => [m.id,m.corto || m.nombre]))}
    ${grupo('etapa','Etapa',Object.entries(ETAPAS))}${grupo('clave','Importancia',[['si','Clave'],['extra','Si sobra tiempo']])}
    ${grupo('costo','Cómo te costó',[['facil','Fácil'],['normal','Normal'],['dificil','Difícil'],['mixta','Mixta'],['sin','Sin responder']])}
    <button class="enlace" onclick="filtrosTemas={materia:'',etapa:'',clave:'',costo:''};dibujar()">Quitar filtros</button></div>`;
  const etiquetas={materia:id=>estado.materias.find(m=>m.id===id)?.corto || id,etapa:id=>ETAPAS[id],clave:id=>id==='extra'?'Si sobra tiempo':'Clave',costo:id=>({facil:'Fácil',normal:'Normal',dificil:'Difícil',mixta:'Mixta',sin:'Sin responder'}[id])};
  html += `<div class="acciones">${Object.entries(filtrosTemas).filter(([,v])=>v).map(([k,v])=>`<button class="boton chico" aria-label="Quitar filtro ${esc(etiquetas[k](v))}" onclick="cambiarFiltroTemas('${k}','${v}')">${esc(etiquetas[k](v))} ×</button>`).join('')}</div>`;
  if (!filas.length) html += `<div class="tarjeta"><p>No hay temas pendientes con estos filtros. Probá quitar alguno.</p></div>`;
  for (const grupo of ['De días anteriores','Hoy','Mañana','Próximos 7 días','Más adelante','Sin fecha asignada']) {
    const de=filas.filter(x=>grupoFechaTema(x.fecha)===grupo);
    if (de.length) html += `<h3>${grupo} (${de.length})</h3><div class="tarjeta lista">${de.map(filaTemaGeneral).join('')}</div>`;
  }
  const total=totalesTemas(filas);
  html += `<div class="tarjeta totales-temas">${horas(total.minutos)} pendientes en total · ${total.sinCosto} temas sin «¿Cómo te costó?»</div>`;
  const hechos=filtrarTemas(indice,filtrosTemas,true);
  if (hechos.length) html += plegable('temas-terminados',`Terminados (${hechos.length})`,`<div class="tarjeta lista">${hechos.map(filaTemaGeneral).join('')}</div>`);
  return html;
}

function normalizarBusqueda(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}

function resultadosBusqueda(indice, texto) {
  const partes = normalizarBusqueda(texto).split(/\s+/).filter(Boolean);
  if (!partes.length) return [];
  return indice.filter(({m,t,notas}) => {
    const contenido = normalizarBusqueda([m.nombre,m.corto,t.texto,...(t.referencias || []).map(r => r.nombre),notas].join(' '));
    return partes.every(p => contenido.includes(p));
  });
}

function abrirBuscador() {
  modal(`<div class="titulo-modal"><b>Buscar en Kronos</b></div><label>Temas, materias y tus notas</label>
    <div class="fila"><input id="busqueda-kronos" autocomplete="off" placeholder="Ej.: hombro, Farmaco, lo toma seguro" oninput="buscarTemas(this.value)"><button class="boton chico" onclick="$('#busqueda-kronos').value='';buscarTemas('')">Limpiar</button></div>
    <div id="resultados-busqueda" class="busqueda-resultados"></div>`);
  buscarTemas(''); $('#busqueda-kronos').focus();
}

function buscarTemas(texto) {
  const indice = indiceTemas(), q = normalizarBusqueda(texto);
  const fila = ({m,t}) => `<button class="boton resultado-busqueda" onclick="abrirTemaResultado('${m.id}','${t.id}')"><span><b>${esc(t.texto)}</b><small>${esc(m.corto || m.nombre)} · ${ETAPAS[t.etapa]}${valorTarea(m.id,t) >= .99 ? ' · terminado' : ''}</small></span></button>`;
  let html;
  if (!q) {
    let recientes = [];
    try { recientes = JSON.parse(localStorage.getItem('kronos-recientes') || '[]');if (!Array.isArray(recientes)) recientes=[]; } catch(e) { /* opcional */ }
    html = '<h3>Lo último que tocaste</h3>' + recientes.map(r => {
      const m = estado.materias.find(m => m.id === r.materia);
      if (!m) return '';
      const encontrado = r.referencia && indice.find(x => x.m.id === m.id && (x.t.id === r.referencia || x.t.referencias?.some(ref => ref.id === r.referencia)));
      return encontrado ? fila(encontrado) : `<button class="boton resultado-busqueda" onclick="abrirLista('${m.id}')">${esc(m.nombre)}</button>`;
    }).join('');
    if (!recientes.length) html += '<p class="suave">Todavía no hay recientes. Escribí un tema, una materia o una palabra de tus notas.</p>';
  } else {
    const encontrados = resultadosBusqueda(indice,texto);
    const materias = estado.materias.filter(m => normalizarBusqueda(m.nombre + ' ' + m.corto).includes(q));
    html = `<p class="suave">${materias.length + encontrados.length} resultados${encontrados.length > 80 ? ' · primeros 80 temas' : ''}</p>`
      + materias.map(m => `<button class="boton resultado-busqueda" onclick="abrirLista('${m.id}')">${esc(m.nombre)} · objetivo</button>`).join('') + encontrados.slice(0,80).map(fila).join('');
    if (!encontrados.length && !materias.length) html += '<p>No encontré resultados. Probá una palabra más corta o el nombre de la materia; también busco dentro de tus notas.</p>';
  }
  $('#resultados-busqueda').innerHTML = html;
}

function abrirTemaResultado(mid, id) {
  const fila = indiceTemas().find(x => x.m.id === mid && x.t.id === id);
  if (!fila) return avisar('Ese tema ya no está en el objetivo.');
  registrarToque(mid,id);
  modal(`<div class="titulo-modal"><b>${esc(fila.m.nombre)}</b></div>${filaTemaGeneral(fila)}<button class="boton" onclick="abrirLista('${mid}')">Ver la lista de la materia</button>`,()=>abrirTemaResultado(mid,id));
}

function editarMateria(mid) {
  const m = materia(mid);
  const resumenes = (m.material || []).map((r, j) => `<div class="tarjeta" style="padding:12px">
      <b>${esc(r.nombre)}</b> <span class="suave">· ${r.paginas} págs. · ${(r.temas || []).length} temas</span>
      <label>Páginas por hora leyendo (tu ritmo)</label><input data-mat="${j}" data-num inputmode="decimal" value="${r.ritmo}"></div>`).join("");
  const practica = (m.practica || []).map((p, j) => `<div class="fila">
      <div style="flex:3"><label>Practicar</label><input data-prac="${j}" data-campo="nombre" value="${esc(p.nombre)}"></div>
      <div><label>Horas</label><input data-prac="${j}" data-campo="horas" data-num inputmode="decimal" value="${p.horas}"></div></div>`).join("");
  modal(`<div class="titulo-modal" style="color:${m.color}">${iconoMateria(m)}<div style="color:var(--texto)"><b>Qué hay que estudiar</b><small>${esc(m.nombre)}</small></div></div>
    <p class="suave">Primero se lee cada resumen una vez, tema por tema. Después se repasa y al final se practica.
    Si ves que leés más rápido o más lento, cambiá tu ritmo y el plan se rehace.</p>
    ${resumenes}
    <h2>${ic("objetivo")} Práctica</h2>
    ${practica || `<p class="suave">No hay parciales, finales ni simulacros cargados.</p>`}
    <p class="suave">Los simulacros son finales de práctica que le pedís a Google AI Studio con tu prompt y la bibliografía.
    ${m.prompt ? `Tu prompt está en <code>${esc(m.prompt.split("\\").slice(-2).join(" › "))}</code>.` : "Para esta materia todavía no hay un prompt guardado en la carpeta."}</p>
    <div class="fila">
      <div><label>Repaso (% del tiempo de lectura)</label><input id="e-repaso" data-num inputmode="decimal" value="${Math.round((m.repaso_factor || 0.33) * 100)}"></div>
      <div><label>Hora del final</label><input id="e-hora" class="campo-hora" inputmode="numeric" oninput="formatoHora(this)" value="${m.hora}"></div>
      <div><label>Preparación antes del final (min)</label><input id="e-prepa" data-num inputmode="decimal" value="${m.preparacion_min || 0}"></div>
    </div>
    <div class="acciones"><button class="boton principal" onclick="guardarMateria('${mid}')">Guardar</button><button class="boton" onclick="cerrarModal()">Cancelar</button></div>`);
}

function guardarMateria(mid) {
  const materias = JSON.parse(JSON.stringify(estado.materias));
  const m = materias.find((x) => x.id === mid);
  document.querySelectorAll("#modal [data-mat]").forEach((el) => { m.material[+el.dataset.mat].ritmo = +el.value || 1; });
  document.querySelectorAll("#modal [data-prac]").forEach((el) => {
    m.practica[+el.dataset.prac][el.dataset.campo] = el.dataset.campo === "nombre" ? el.value : +el.value;
  });
  m.repaso_factor = (+$("#e-repaso").value || 0) / 100;
  m.hora = $("#e-hora").value || m.hora;
  m.preparacion_min = +$("#e-prepa").value || 0;
  cerrarModal();
  enviar({ tipo: "guardar", datos: { materias } }, "Guardado. El plan se rehízo.");
}

// ============================================================
// Comparar fechas
// ============================================================
// cada criterio: cómo se muestra su valor y si más es mejor o peor (para decir qué opción gana en qué)
const CRIT = {
  llegas: { valor: (o) => (o.falta_min ? `te faltan ${horas(o.falta_min)}` : "llegás a todo"), num: (o) => -o.falta_min,
    bien: () => "Llegás a estudiar todo con tu tiempo libre.", mal: (o) => `No llegás: te faltarían ${horas(o.falta_min)} de estudio.` },
  carga: { valor: (o) => `~${horas(o.carga_min_dia)} por día`, num: (o) => -o.carga_min_dia,
    bien: (o) => `Carga liviana: en el tramo más pesado (hasta ${o.carga_materia}) son ~${horas(o.carga_min_dia)} por día, el ${o.carga_pct} % de tu tiempo libre.`,
    mal: (o) => `Tramo pesado hasta ${o.carga_materia}: ~${horas(o.carga_min_dia)} por día, el ${o.carga_pct} % de tu tiempo libre.` },
  margen: { valor: (o) => (o.falta_lento_min ? `faltan ${horas(o.falta_lento_min)}` : "llegás igual"), num: (o) => -o.falta_lento_min,
    bien: () => "Aunque tardes 50 % más de lo calculado, igual llegás.", mal: (o) => `Si tardás 50 % más de lo calculado, te faltarían ${horas(o.falta_lento_min)}.` },
  espacio: { valor: (o) => `${o.dias_minimos_entre_finales} ${o.dias_minimos_entre_finales === 1 ? "día" : "días"}`, num: (o) => o.dias_minimos_entre_finales,
    bien: (o) => `Buen aire entre finales: lo más justo son ${o.dias_minimos_entre_finales} días (${o.par.join(" → ")}).`,
    mal: (o) => `Poco aire: solo ${o.dias_minimos_entre_finales} ${o.dias_minimos_entre_finales === 1 ? "día" : "días"} entre ${o.par.join(" y ")}.` },
  reserva: { valor: (o) => `${o.reservas} de ${o.con_reserva_posible}`, num: (o) => o.reservas,
    bien: (o) => `${o.reservas} de ${o.con_reserva_posible} finales tienen otra fecha más tarde, por si no salen.`,
    mal: (o) => `Pocas reservas: solo ${o.reservas} de ${o.con_reserva_posible} finales tienen otra fecha después, por si no salen.` },
  choques: { valor: (o) => (o.choque ? "se pisa" : "ninguno"), num: (o) => (o.choque ? 0 : 1),
    bien: () => "No se pisa con rotaciones ni compromisos.", mal: (o) => `Choque: ${o.choque}.` },
  descanso: { valor: (o) => ((o.cansancio || []).length ? `${o.cansancio.length} tras un día pesado` : "descansado"), num: (o) => -(o.cansancio || []).length,
    bien: () => "Ningún final cae justo después de un día pesado (rotación, trabajo).", mal: (o) => `Cansancio: ${(o.cansancio || [])[0] || ""}.` },
};
const colorNota = (n) => `hsl(${Math.round(Math.max(0, Math.min(100, n - 20)) * 1.4)} 80% 55%)`;
let elegidas = new Set(); // opciones tildadas para el comparador
// Fechas que Lean fijó SOLO para comparar (no cambian sus objetivos): { id de objetivo: "AAAA-MM-DD" }
let fijasComp = JSON.parse(localStorage.getItem("kronos-fijas-comparar") || "{}");
function alternarFija(mid, fecha) {
  if (fijasComp[mid] === fecha) delete fijasComp[mid];
  else fijasComp[mid] = fecha;
  localStorage.setItem("kronos-fijas-comparar", JSON.stringify(fijasComp));
  opciones = null;
  elegidas.clear();
  dibujar();
}
function quitarFijas() {
  fijasComp = {};
  localStorage.removeItem("kronos-fijas-comparar");
  opciones = null;
  elegidas.clear();
  dibujar();
}
function panelFijas() {
  const mats = estado.materias.filter((m) => (m.opciones || []).length > 1 && m.fecha >= hoyISO() && !m.fecha_fija);
  if (!mats.length) return "";
  const hayFijas = Object.keys(fijasComp).length;
  return plegable("comp-fijas", `${ic("candado")}<b>Fijar fechas para comparar</b><span class="suave chico">${hayFijas ? `${hayFijas} fijada${hayFijas === 1 ? "" : "s"}` : "Tocá una fecha para dejarla fija"}</span>`,
    `<p class="suave chico">Solo para esta comparación: no cambia tus objetivos. Fijá las fechas que ya sabés (por ejemplo, con quién practicás) y Kronos prueba las demás.</p>
     ${mats.map((m) => `<div class="fila-fijas"><span class="fijas-nombre" style="--mc:${m.color}"><b>${esc(m.corto)}</b></span>${m.opciones.filter((f) => f >= hoyISO()).sort().map((f) => `<button type="button" class="chip-fecha ${fijasComp[m.id] === f ? "fija" : ""}" aria-pressed="${fijasComp[m.id] === f}" onclick="alternarFija('${m.id}','${f}')">${fijasComp[m.id] === f ? ic("candado") : ""} ${fechaCorta(f)}</button>`).join("")}</div>`).join("")}
     ${hayFijas ? `<button class="enlace" onclick="quitarFijas()">Quitar todas las fijas</button>` : ""}`, !!hayFijas);
}
// Criterios que Lean destildó (no le importan): se ven tachados y no cuentan en la nota. Se recuerdan en este aparato.
let criteriosOff = new Set(JSON.parse(localStorage.getItem("kronos-crit-off") || "[]"));
const critActivo = (id) => !criteriosOff.has(id);
function alternarCriterio(id) {
  if (critActivo(id) && opciones.criterios.filter((c) => critActivo(c.id)).length <= 1) return; // tiene que quedar al menos uno
  criteriosOff.has(id) ? criteriosOff.delete(id) : criteriosOff.add(id);
  localStorage.setItem("kronos-crit-off", JSON.stringify([...criteriosOff]));
  dibujar();
}
// El peso real de cada criterio cuando algunos están apagados (los que quedan se reparten el 100 %).
function pesoReal(c) {
  const suma = opciones.criterios.filter((x) => critActivo(x.id)).reduce((t, x) => t + x.peso, 0) || 1;
  return critActivo(c.id) ? Math.round((c.peso * 100) / suma) : 0;
}
// La nota con los criterios activos. Con todos tildados da lo mismo que calcula el servidor (incluidos los topes por choque y por "no llegás").
function notaActiva(o) {
  if (!criteriosOff.size) return o.total; // todos tildados: la nota exacta del servidor
  const act = opciones.criterios.filter((c) => critActivo(c.id));
  const suma = act.reduce((t, c) => t + c.peso, 0) || 1;
  let t = act.reduce((acc, c) => acc + o.puntos[c.id] * c.peso, 0) / suma;
  if (o.choque && critActivo("choques")) t = Math.min(t, 25);
  if (o.falta_min >= 30 && critActivo("llegas")) t = Math.min(t, 45);
  return Math.round(t);
}
const mejorOpcion = () => { const n = opciones.opciones.map(notaActiva); return n.indexOf(Math.max(...n)); };
const tildeCrit = (c) => `<button type="button" class="tilde-crit ${critActivo(c.id) ? "si" : ""}" role="checkbox" aria-checked="${critActivo(c.id)}" title="${critActivo(c.id) ? "Cuenta en la nota: tocá para dejar de contarlo" : "No cuenta en la nota: tocá para volver a contarlo"}" onclick="alternarCriterio('${c.id}')">${critActivo(c.id) ? ic("tilde") : ""}</button>`;

function vistaComparar() {
  let html = `<button class="volver" onclick="irA('finales')">${ic("atras")} Objetivos</button>`;
  html += encabezado("05", "Comparar fechas", "Qué fechas te convienen", `Comparamos tus combinaciones de fechas con ${opciones ? opciones.criterios.length : 7} criterios para que elijas la que mejor se adapte a vos.`);
  if (!opciones) {
    if (!soloLectura) cargarOpciones();
    return html + `<p class="suave">${soloLectura ? "Para comparar fechas tenés que estar conectado a la PC." : "Calculando todas las combinaciones…"}</p>`;
  }
  const { criterios } = opciones;
  html += panelFijas();
  html += `<div class="comparar-barra"><span class="chip-sel">${ic("capas")} ${elegidas.size} ${elegidas.size === 1 ? "seleccionada" : "seleccionadas"}</span>
    <button class="boton" ${elegidas.size < 2 ? 'disabled title="Tildá 2 o más opciones para compararlas"' : ""} onclick="document.getElementById('comparador').scrollIntoView({ behavior: 'smooth' })">${ic("lista")} Comparador</button></div>`;
  html += `<div class="opciones-grilla">${opciones.opciones.map((o, i) => tarjetaOpcion(o, i)).join("")}</div>`;
  html += plegable("comp-calculo", `${ic("lista")}<b>Cómo se calcula</b><span class="suave chico">Ponderación de criterios</span>`,
    `<div class="pesos">${criterios.map((c) => `<span class="${critActivo(c.id) ? "" : "off"}">${esc(c.nombre)} <b>${pesoReal(c)} %</b></span>`).join("")}</div>
     <p class="suave chico">Tildá o destildá cada criterio en las tarjetas o en el comparador: si destildás uno, queda tachado, se sigue viendo, y los demás se reparten el 100 %.</p>
     <p class="suave chico">Si una combinación se pisa con un compromiso, la nota no pasa de 25; si no llegás a estudiar todo, no pasa de 45. Se probaron ${opciones.total_combinaciones} combinaciones.</p>`);
  if (elegidas.size >= 2) html += comparadorHTML();
  html += `<p class="suave chico" style="text-align:center;margin-top:14px">Es una sugerencia: vos sabés cosas que la cuenta no (cuál te cuesta más, qué dice la gente de cada mesa).</p>`;
  return html;
}

function nombreOpcion(o, i) {
  return o.actual ? "La que tenés ahora" : i === 0 ? "Recomendada" : `Opción ${i + 1}`;
}

function tarjetaOpcion(o, i) {
  const mats = estado.materias.filter((m) => o.fechas[m.id]);
  const ventajas = opciones.criterios.filter((c) => critActivo(c.id) && o.puntos[c.id] >= 75).map((c) => CRIT[c.id].bien(o));
  const desventajas = opciones.criterios.filter((c) => critActivo(c.id) && o.puntos[c.id] < 50).map((c) => CRIT[c.id].mal(o));
  const titulo = o.actual ? "Tus fechas actuales" : i === mejorOpcion() ? "Recomendada" : `Opción ${i + 1}`;
  const caja = (clase, icono, t, lista, vacio) => `<div class="caja-vr ${clase}"><b>${ic(icono)} ${t}</b><p>${lista.length ? esc(lista[0]) : vacio}</p></div>`;
  const resto = Math.max(0, ventajas.length - 1) + Math.max(0, desventajas.length - 1);
  return `<div class="tarjeta opcion ${o.actual ? "es-actual" : ""} ${elegidas.has(i) ? "tildada" : ""}">
    <div class="cabeza">
      <button class="tilde ${elegidas.has(i) ? "si" : ""}" title="Tildar para comparar" onclick="elegidas.has(${i})?elegidas.delete(${i}):elegidas.add(${i});dibujar()">${elegidas.has(i) ? ic("tilde") : ""}</button>
      <div class="opc-titulo"><b>${titulo}</b>${o.actual ? `<span class="pastilla actual-p">Seleccionada</span>` : i === mejorOpcion() ? `<span class="pastilla recomendada">${ic("estrella")} Mejor nota</span>` : ""}</div>
      <span class="nota" style="--nc:${colorNota(notaActiva(o))}"><b>${notaActiva(o)}</b><small>/ 100</small></span></div>
    <div class="fechas-chips">${mats.map((m) => `<span class="fchip" style="--mc:${m.color}">${iconoMateria(m)}<b>${esc(m.corto)}</b> ${fechaCorta(o.fechas[m.id])}</span>`).join("")}</div>
    <div class="crit-titulo"><b>Criterios (${opciones.criterios.filter((c) => critActivo(c.id)).length} de ${opciones.criterios.length})</b><span class="suave">Puntaje</span></div>
    <div class="crit-lista">${opciones.criterios.map((c) => `<div class="crit ${critActivo(c.id) ? "" : "off"}" title="${esc(CRIT[c.id].valor(o))}"><span class="crit-nombre">${tildeCrit(c)}<span>${esc(c.nombre)}</span></span>
      <div class="crit-barra"><div style="width:${o.puntos[c.id]}%;background:${colorNota(o.puntos[c.id])}"></div></div><b>${o.puntos[c.id]} <small>/ 100</small></b></div>`).join("")}</div>
    <div class="pros-contras">${caja("ventaja", "tilde", "Ventaja", ventajas, "Sin ventajas destacadas.")}${caja("riesgo", "alerta", "Riesgo", desventajas, "Sin riesgos importantes.")}</div>
    ${resto ? plegable(`comp-vr-${i}`, `<span class="suave">Ver todas las ventajas y riesgos (${ventajas.length + desventajas.length})</span>`,
      `${ventajas.length ? `<ul class="pros">${ventajas.map((t) => `<li>${ic("tilde")}<span>${esc(t)}</span></li>`).join("")}</ul>` : ""}
       ${desventajas.length ? `<ul class="contras">${desventajas.map((t) => `<li>${ic("cruz")}<span>${esc(t)}</span></li>`).join("")}</ul>` : ""}`, false, "plegable plano") : ""}
    ${o.actual ? "" : `<button class="boton ${i === mejorOpcion() ? "principal" : ""}" style="margin-top:12px" onclick="usarFechas(${i})" ${bloqueado()}>${ic("calendario")} Usar estas fechas</button>`}
  </div>`;
}

// el comparador: las opciones tildadas, criterio por criterio, y en qué gana o pierde cada una contra las otras
function comparadorHTML() {
  const lista = [...elegidas].sort((a, b) => a - b).map((i) => ({ o: opciones.opciones[i], i }));
  const crits = opciones.criterios;
  const dos = lista.length === 2;
  const quien = (x) => nombreOpcion(x.o, x.i);
  // la segunda opción contra la primera (como en el mockup: "Mejor: Opción 2 (+17)")
  const veredicto = (a, b) => {
    const d = b - a;
    if (!d) return `<span class="igual">= Igual (ambas: ${a})</span>`;
    return `<span class="${d > 0 ? "mejor" : "peor"}">${d > 0 ? "↑ Mejor" : "↓ Peor"}: ${esc(quien(lista[1]))} (${d > 0 ? "+" : "−"}${Math.abs(d)})</span>`;
  };
  const filas = crits.map((c) => {
    const nums = lista.map(({ o }) => o.puntos[c.id]);
    const mejor = Math.max(...nums), peor = Math.min(...nums);
    const off = !critActivo(c.id);
    return `<tr class="${off ? "off" : ""}"><th><span class="crit-nombre">${tildeCrit(c)}<span>${esc(c.nombre)}</span></span> <small>${pesoReal(c)} %</small></th>${lista.map(({ o }, k) => {
      const clase = off || mejor === peor ? "" : nums[k] === mejor ? "gana" : nums[k] === peor ? "pierde" : "";
      return `<td class="${clase}"><b>${o.puntos[c.id]} / 100</b><small>${esc(CRIT[c.id].valor(o))}</small></td>`;
    }).join("")}${dos ? `<td class="veredicto">${off ? '<span class="igual">No cuenta</span>' : veredicto(nums[0], nums[1])}</td>` : ""}</tr>`;
  }).join("");
  const totales = lista.map(({ o }) => notaActiva(o));
  const resumenes = lista.map(({ o, i }, k) => {
    const otras = lista.filter((_, j) => j !== k);
    const gana = [], pierde = [];
    for (const c of crits) {
      if (!critActivo(c.id)) continue;
      const mio = CRIT[c.id].num(o), ellas = otras.map((x) => CRIT[c.id].num(x.o));
      const contra = otras.map((x) => `${nombreOpcion(x.o, x.i).toLowerCase()}: ${CRIT[c.id].valor(x.o)}`).join(" · ");
      if (ellas.every((v) => mio > v)) gana.push(`<b>${esc(c.nombre)}</b>: ${esc(CRIT[c.id].valor(o))} <span class="suave">(${esc(contra)})</span>`);
      else if (ellas.every((v) => mio < v)) pierde.push(`<b>${esc(c.nombre)}</b>: ${esc(CRIT[c.id].valor(o))} <span class="suave">(${esc(contra)})</span>`);
    }
    return `<div class="tarjeta comp-resumen"><div class="cabeza"><b>${esc(nombreOpcion(o, i))}</b><span class="nota" style="--nc:${colorNota(notaActiva(o))}"><b>${notaActiva(o)}</b><small>/ 100</small></span></div>
      <p class="suave chico">${Object.entries(o.fechas).map(([mid, f]) => `${esc(materia(mid).corto)} ${fechaCorta(f)}`).join(" · ")}</p>
      ${gana.length ? `<ul class="pros">${gana.map((t) => `<li>${ic("tilde")}<span>Mejor en ${t}</span></li>`).join("")}</ul>` : ""}
      ${pierde.length ? `<ul class="contras">${pierde.map((t) => `<li>${ic("cruz")}<span>Peor en ${t}</span></li>`).join("")}</ul>` : ""}
      ${!gana.length && !pierde.length ? `<p class="suave chico">No gana ni pierde sola en ningún criterio: queda en el medio.</p>` : ""}
      ${o.actual ? "" : `<button class="boton chico" onclick="usarFechas(${i})" ${bloqueado()}>Usar estas fechas</button>`}</div>`;
  }).join("");
  return `<div id="comparador"><h2>${ic("lista")} Comparador</h2><p class="suave chico" style="margin-top:-6px">Detalle de los criterios, puntajes y cuál opción es mejor en cada uno. Destildá los que no te importen: quedan tachados y no cuentan.</p>
    <div class="tabla-scroll"><table class="comparador"><thead><tr><th>Criterio</th>${lista.map(({ o, i }) => `<th>${esc(nombreOpcion(o, i))}<br><span class="suave" style="font-weight:500">${Object.entries(o.fechas).map(([mid, f]) => `${esc(materia(mid).corto)} ${fechaCorta(f)}`).join(" · ")}</span></th>`).join("")}${dos ? `<th>¿Cuál es mejor?</th>` : ""}</tr></thead>
      <tbody>${filas}<tr class="total"><th>Puntaje total <small>${opciones.criterios.some((c) => !critActivo(c.id)) ? "con los criterios tildados" : "100 %"}</small></th>${lista.map(({ o }, k) => `<td class="${totales[k] === Math.max(...totales) && Math.min(...totales) !== Math.max(...totales) ? "gana" : ""}"><b>${totales[k]} / 100</b></td>`).join("")}${dos ? `<td class="veredicto">${veredicto(totales[0], totales[1])}</td>` : ""}</tr></tbody></table></div>
    <h3 style="margin-top:16px">Ventajas y desventajas de cada una</h3><div class="opciones-grilla">${resumenes}</div></div>`;
}

async function cargarOpciones() {
  try {
    const q = Object.entries(fijasComp).map(([k, v]) => `${k}:${v}`).join(",");
    const r = await fetch("/api/comparar" + (q ? "?fijas=" + encodeURIComponent(q) : ""), { headers: cabeceras() });
    opciones = await r.json();
  } catch (e) {
    opciones = [];
  }
  if (vista === "comparar") dibujar();
}

function usarFechas(i) {
  const fechas = opciones.opciones[i].fechas;
  opciones = null;
  elegidas.clear();
  enviar({ tipo: "usar_fechas", fechas }, "Listo, fechas cambiadas y plan rearmado.");
}

// ============================================================
// Horarios
// ============================================================
function necesitaIntensivo(m) {
  return estado.plan.avisos.some(a => a.startsWith(`No llega ${m.nombre}:`));
}

async function elegirFuera(mid, tarea) {
  if (await enviar({tipo:'marcar_extra',materia:mid,tarea,valor:true},'Tema pasado a si sobra tiempo')) verIntensivo(mid);
}

async function verIntensivo(mid) {
  try {
    const r = await fetch('/api/intensivo', {method:'POST',headers:cabeceras(),body:JSON.stringify({materia:mid})});
    const p = await r.json();
    if (!r.ok) return avisar(p.error || 'No pude calcular la propuesta');
    modal(`<div class="titulo-modal"><b>Plan intensivo · ${esc(materia(mid).corto)}</b></div>
      <p>${!p.necesario ? 'Con el plan actual llegás.' : p.llega ? 'Esta propuesta permite llegar a lo imprescindible.' : `Todavía faltan ${horas(Math.round(p.faltan_horas * 60))}${p.otros_empeoran ? '; afectaría otros objetivos' : ''}.`}</p>
      <ul>${p.cambios.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p class="suave">${esc(p.nota || '')}</p>
      ${(p.carga || []).map(d => `<div class="item">${fechaCorta(d.fecha)}: ${horas(d.minutos)}${d.extra_min ? ` · ${horas(d.extra_min)} más que el plan actual` : ''}</div>`).join('')}
      <button class="boton" aria-expanded="false" onclick="alternarFuera(this)">No entran (${p.fuera.length})</button><div id="intensivo-fuera" hidden><ul>${p.fuera.map(t => `<li>${esc(t.texto)} · ${horas(t.minutos)}${t.extra ? ' · si alcanza' : /^[LAP]/.test(t.id) ? ` <button class="enlace" onclick="elegirFuera('${mid}','${t.id}')">Dejar para si alcanza</button>` : ''}</li>`).join('') || '<li>Nada</li>'}</ul></div>
      <div class="acciones">${p.necesario && p.llega ? `<button class="boton principal" onclick="cerrarModal();enviar({tipo:'aplicar_intensivo',materia:'${mid}'},'Propuesta aplicada')">Aplicar</button>` : ''}<button class="boton" onclick="cerrarModal()">Descartar</button></div>`);
  } catch (e) { avisar('No pude calcular el intensivo. Revisá la conexión.'); }
}

function guardarLevantarse(campo) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(campo.value)) return avisar('La hora va así: 08:00');
  enviar({tipo:'guardar',datos:{ajustes:{...estado.ajustes,levantarse:campo.value}}},'Hora guardada');
}

function alternarFuera(boton) {
  const el=$('#intensivo-fuera');
  if (!el) return;
  el.hidden=!el.hidden;boton.setAttribute('aria-expanded',String(!el.hidden));
}

function vistaHorarios() {
  const aj = estado.ajustes;
  const franja = (estado.plantilla[diaHorario] || [])[0] || ["", ""];
  let html = encabezado("07", "Horarios", "Tu semana, a tu ritmo", "Kronos solo pone estudio en tus horarios libres.");
  html += `<div class="dias-pastillas">${DIAS_CORTOS.map((d, i) => `<button class="${i === diaHorario ? "activa" : ""}" onclick="diaHorario=${i};dibujar()">${d}</button>`).join("")}</div>
    <div class="horario-grilla"><div class="tarjeta">
      <h3 style="display:flex;gap:10px;align-items:center;font-size:18px">${ic("reloj")} ${DIAS[diaHorario]}</h3>
      <div class="fila"><div><label>Desde</label><input class="campo-hora" inputmode="numeric" oninput="formatoHora(this)" id="h-desde" value="${franja[0]}" ${bloqueado()}></div>
        <div><label>Hasta</label><input class="campo-hora" inputmode="numeric" oninput="formatoHora(this)" id="h-hasta" value="${franja[1]}" ${bloqueado()}></div></div>
      <div class="acciones"><button class="boton principal" onclick="guardarFranja(false)" ${bloqueado()}>Guardar para el ${DIAS[diaHorario].toLowerCase()}</button>
        <button class="boton claro" onclick="guardarFranja(true)" ${bloqueado()}>${ic("capas")} Copiar a todos los días</button></div>
      <div style="margin-top:16px">
        ${contador("Máximo por día", "reloj", "max_horas_dia", aj.max_horas_dia, " h", 0.5, 1, 14)}
        <div class="ajuste"><span class="q">${ic("tilde")} <span>Tapering antes de los finales<small class="suave" style="display:block;font-weight:400">${aj.tapering !== false ? "Activado: sin lectura nueva en las últimas 48 h y corte a las 18:00 el día anterior." : "Desactivado: el plan usa todos los días hasta el final."}</small></span></span>
          <button class="boton ${aj.tapering !== false ? "" : "principal"}" onclick="enviar({tipo:'guardar',datos:{ajustes:{...estado.ajustes,tapering:estado.ajustes.tapering === false}}}, 'Cambios guardados')" ${bloqueado()}>${aj.tapering !== false ? "Desactivar" : "Activar"}</button></div>
        ${contador("Cada bloque", "capas", "bloque_min", aj.bloque_min, " min", 15, 30, 180)}
        ${contador("Pausa", "cafe", "pausa_min", aj.pausa_min, " min", 5, 0, 60)}
        ${contador("Máximo intensivo", "reloj", "intensivo_max_horas", aj.intensivo_max_horas ?? 8, " h", .5, 1, 8)}
        ${contador("Piso de sueño", "reloj", "sueno_min_horas", aj.sueno_min_horas ?? 6, " h", .5, 1, 12)}
        <label>Hora de levantarte</label><input class="campo-hora" inputmode="numeric" value="${esc(aj.levantarse || '08:00')}" oninput="formatoHora(this)" onchange="guardarLevantarse(this)" ${bloqueado()}>
      </div></div>${esquemaDia(diaHorario)}</div>`;

  html += `<h2>${ic("pin")} Compromisos habituales</h2>
    <p class="suave chico">Cursadas, rotaciones, gimnasio, trabajo u horarios en los que no podés.</p>`;
  html += estado.fijos.map((f, j) => `<div class="tarjeta"><div class="fijo" onclick="editarFijo(${j})">
      <div class="icono-caja">${ic(ICONO_CLASE[f.clase] || (/gim/i.test(f.nombre) ? "pesa" : "pin"))}</div>
      <div><b>${esc(f.nombre)}</b><span class="suave">${CLASES[f.clase] || "Fijo"} · ${f.inicio}–${f.fin}${f.hasta ? ` · hasta el ${fechaCorta(f.hasta)}` : ""}</span></div>
      <div class="chips-dias">${DIAS_CORTOS.map((d, i) => `<span class="${f.dias.includes(i) ? "si" : ""}">${f.dias.includes(i) ? "✓" : ""}${d}</span>`).join("")}</div></div>
      <div class="nota-fijo">${ic("campana")} ${horas(f.antes || 0)} para salir · ${horas(f.despues || 0)} después</div></div>`).join("");
  html += `<button class="boton principal" onclick="editarFijo(-1)" ${bloqueado()}>+ Agregar compromiso</button>`;

  const compromisos = estado.eventos.filter((e) => e.fecha >= hoyISO()).sort((a, b) => (a.fecha + a.inicio).localeCompare(b.fecha + b.inicio));
  html += `<h2>${ic("calendario")} Compromisos puntuales</h2>`;
  html += compromisos.map((e) => `<div class="tarjeta" style="display:flex;gap:14px;align-items:center">
      <span class="pastilla" style="${e.tipo === "imprevisto" ? "background:var(--hover);color:var(--alerta)" : "background:var(--hover);color:var(--ok)"};font-size:11.5px;padding:4px 10px">${e.tipo === "imprevisto" ? "Imprevisto" : CLASES[e.clase] || "Compromiso"}</span>
      <div style="flex:1"><b style="font-size:17px">${esc(e.nombre)}</b><div class="suave">${diaSemana(e.fecha).slice(0, 3)} ${fechaCorta(e.fecha)} · ${e.inicio}–${e.fin}${e.antes ? ` · +${horas(e.antes)} antes` : ""}</div></div>
      <button class="boton chico peligro" style="border:0" onclick="borrarEvento('${e.id}')" ${bloqueado()}>${ic("cruz")}</button></div>`).join("")
    || `<p class="suave">No hay. Para agregar uno, tocá un día en el Calendario.</p>`;
  if (estado.conexion) html += `<button class="boton claro grande solo-celu" style="margin-top:12px" onclick="irA('celu')">${ic("celu")} Conectar celu y apagar Kronos</button>`;
  return html;
}

// cómo queda un día: el horario de estudio y lo que lo ocupa (gimnasio, salida, recuperación)
function esquemaDia(d) {
  const franja = (estado.plantilla[d] || [])[0];
  if (!franja) return `<div class="tarjeta"><h3>Esquema del día (disponibilidad)</h3><p class="suave">Ese día no estudiás.</p></div>`;
  const [ini, fin] = franja.map(aMin);
  const tramos = [];
  for (const f of estado.fijos) {
    if (!f.dias.includes(d)) continue;
    const gim = f.clase === "gimnasio" || /gim/i.test(f.nombre);
    if (f.antes) tramos.push({ a: aMin(f.inicio) - f.antes, b: aMin(f.inicio), t: "Salida", c: "ocupado" });
    tramos.push({ a: aMin(f.inicio), b: aMin(f.fin), t: f.nombre, c: gim ? "gimnasio" : "ocupado" });
    if (f.despues) tramos.push({ a: aMin(f.fin), b: aMin(f.fin) + f.despues, t: `Después (${horas(f.despues)})`, c: "recupera" });
  }
  tramos.sort((x, y) => x.a - y.a);
  const partes = [];
  let cursor = ini;
  for (const t of tramos) {
    const a = Math.max(ini, t.a, cursor), b = Math.min(fin, t.b);
    if (b <= a) continue;
    if (a > cursor) partes.push({ a: cursor, b: a, t: "Estudio", c: "libre" });
    partes.push({ ...t, a, b });
    cursor = b;
  }
  if (cursor < fin) partes.push({ a: cursor, b: fin, t: "Estudio", c: "libre" });
  const hm = (x) => `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
  const total = fin - ini;
  // línea de horas: el inicio, el fin y cada borde (si no quedan pegados)
  let ticks = [ini, ...partes.map((x) => x.b)].filter((x, i, a) => a.indexOf(x) === i), ult = -99;
  ticks = ticks.filter((t, i) => { const ok = (100 * (t - ini)) / total - ult >= 7 || i === ticks.length - 1; if (ok) ult = (100 * (t - ini)) / total; return ok; });
  const libres = partes.filter((x) => x.c === "libre"), libre = libres.reduce((n, x) => n + x.b - x.a, 0);
  const leyenda = [
    ["libre", `Disponibilidad de estudio: ${libres.map((x) => `${hm(x.a)} – ${hm(x.b)}`).join(" y ") || "ninguna"}`],
    ...partes.filter((x) => x.c !== "libre").map((x) => [x.c, `${x.t}: ${hm(x.a)} – ${hm(x.b)}`]),
  ];
  return `<div class="tarjeta"><h3>Esquema del día (disponibilidad)</h3>
    <div class="esquema">${partes.map((x) => `<div class="${x.c}" style="flex:${x.b - x.a}" title="${esc(x.t)} ${hm(x.a)}–${hm(x.b)}">${(x.b - x.a) / total >= 0.1 ? `${esc(x.t)}<small>${hm(x.a)} – ${hm(x.b)}</small>` : ""}</div>`).join("")}</div>
    <div class="esquema-eje">${ticks.map((t, i) => `<span class="${i === 0 ? "ini" : i === ticks.length - 1 ? "fin" : ""}" style="left:${(100 * (t - ini)) / total}%">${hm(t)}</span>`).join("")}</div>
    <div class="esquema-leyenda">${leyenda.map(([c, t]) => `<div><i class="${c}"></i>${esc(t)}</div>`).join("")}</div>
    <p class="suave chico">Libre para estudiar: <b>${horas(libre)}</b> (con un máximo de ${horas(estado.ajustes.max_horas_dia * 60)} por día). Es una vista de tu disponibilidad, no una asignación de estudio.</p></div>`;
}

function contador(texto, icono, clave, valor, unidad, paso, min, max) {
  return `<div class="ajuste"><span class="q">${ic(icono)} ${texto}</span><span class="contador">
    <button onclick="ajustar('${clave}', ${-paso}, ${min}, ${max})" ${bloqueado()}>−</button><span>${unidad === " h" ? horas(valor * 60) : unidad === " min" ? horas(valor) : String(valor).replace(".", ",") + unidad}</span>
    <button onclick="ajustar('${clave}', ${paso}, ${min}, ${max})" ${bloqueado()}>+</button></span></div>`;
}

function ajustar(clave, paso, min, max) {
  const ajustes = { ...estado.ajustes };
  ajustes[clave] = Math.min(max, Math.max(min, Math.round((ajustes[clave] + paso) * 10) / 10));
  enviar({ tipo: "guardar", datos: { ajustes } }, "Cambios guardados");
}

function guardarFranja(todos) {
  const desde = $("#h-desde").value, hasta = $("#h-hasta").value;
  const franja = desde && hasta && hasta > desde ? [[desde, hasta]] : [];
  const plantilla = { ...estado.plantilla };
  for (let d = 0; d < 7; d++) if (todos || d === diaHorario) plantilla[d] = franja;
  enviar({ tipo: "guardar", datos: { plantilla } }, franja.length ? "Cambios guardados" : "Ese día queda sin estudio.");
}

function editarFijo(j) {
  const nuevo = j < 0;
  const f = nuevo ? { nombre: "", clase: "cursada", dias: [0, 1, 2, 3, 4], inicio: "08:00", fin: "12:00", antes: 30, despues: 30 } : estado.fijos[j];
  const hoy = hoyISO();
  modal(`<div class="titulo-modal">${ic("pin")}<div><b>${nuevo ? "Agregar" : "Editar"} compromiso</b><small>Kronos no pone estudio en esos horarios.</small></div></div>
    <div class="fila"><div><label>Qué es</label><select id="f-clase">${Object.entries(CLASES).map(([k, v]) => `<option value="${k}" ${k === (f.clase || "otro") ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div style="flex:2"><label>Nombre</label><input id="f-nombre" value="${esc(f.nombre)}" placeholder="Ej.: Cursada de Semio, Rotación Hospital Clínicas"></div></div>
    ${nuevo ? `<label class="check"><input id="f-semanal" type="checkbox" checked onchange="document.getElementById('f-solo-semanal').classList.toggle('oculto',!this.checked);document.getElementById('f-solo-puntual').classList.toggle('oculto',this.checked)"> Se repite todas las semanas</label>` : ""}
    <div id="f-solo-puntual" class="oculto">
      <div class="fila"><div><label>Desde el día</label><input id="f-fd" class="campo-fecha" inputmode="numeric" value="${verFecha(hoy)}"></div><div><label>Hasta el día</label><input id="f-fh" class="campo-fecha" inputmode="numeric" value="${verFecha(hoy)}"></div></div>
    </div>
    <div class="fila"><div><label>Desde</label><input id="f-ini" class="campo-hora" inputmode="numeric" oninput="formatoHora(this)" value="${f.inicio}"></div><div><label>Hasta</label><input id="f-fin" class="campo-hora" inputmode="numeric" oninput="formatoHora(this)" value="${f.fin}"></div></div>
    <div class="fila"><div><label>Para salir antes (min)</label><input id="f-antes" data-num inputmode="decimal" value="${f.antes || 0}"></div>
      <div><label>Después: almuerzo, ducha… (min)</label><input id="f-despues" data-num inputmode="decimal" value="${f.despues || 0}"></div></div>
    <div id="f-solo-semanal">
      <label>Días</label><div class="dias-pastillas">${DIAS_CORTOS.map((d, i) => `<button type="button" class="${f.dias.includes(i) ? "activa" : ""}" onclick="this.classList.toggle('activa')" data-dia="${i}">${d}</button>`).join("")}</div>
      <div class="fila"><div><label>Empieza <small>(opcional)</small></label><input id="f-desde" class="campo-fecha" inputmode="numeric" placeholder="dd/mm/aaaa" value="${verFecha(f.desde || "")}"></div>
        <div><label>Termina <small>(opcional)</small></label><input id="f-hasta" class="campo-fecha" inputmode="numeric" placeholder="dd/mm/aaaa" value="${verFecha(f.hasta || "")}"></div></div>
    </div>
    <div class="acciones"><button class="boton principal" onclick="guardarFijo(${j})" ${bloqueado()}>Guardar</button>
      ${j >= 0 ? `<button class="boton peligro" onclick="borrarFijo(${j})" ${bloqueado()}>${ic("basura")} Borrar</button>` : ""}</div>`);
}

function guardarFijo(j) {
  const clase = $("#f-clase").value;
  const nombre = $("#f-nombre").value.trim() || CLASES[clase];
  const inicio = $("#f-ini").value, fin = $("#f-fin").value;
  const antes = +$("#f-antes").value || 0, despues = +$("#f-despues").value || 0;
  if (!inicio || !fin || fin <= inicio) return avisar("Revisá los horarios.");
  const semanal = $("#f-semanal");
  if (semanal && !semanal.checked) {
    // compromiso de días puntuales (por ejemplo, una rotación de dos semanas o un turno médico)
    const fd = leerFecha($("#f-fd").value), fh = leerFecha($("#f-fh").value);
    if (!fd || !fh || fh < fd) return avisar("Revisá las fechas.");
    const eventos = [];
    for (let d = new Date(fd + "T12:00"); iso(d) <= fh; d.setDate(d.getDate() + 1)) {
      eventos.push({ fecha: iso(d), nombre, clase, inicio, fin, antes, despues, anula_fijos: false, tipo: "compromiso" });
    }
    cerrarModal();
    return enviar({ tipo: "eventos", eventos }, "Compromiso agregado. El plan se reacomodó.");
  }
  const fijos = JSON.parse(JSON.stringify(estado.fijos));
  const f = j >= 0 ? fijos[j] : { id: Math.random().toString(16).slice(2, 10) };
  Object.assign(f, {
    nombre, clase, inicio, fin, antes, despues, desde: leerFecha($("#f-desde").value) || "", hasta: leerFecha($("#f-hasta").value) || "",
    dias: [...document.querySelectorAll("#modal [data-dia].activa")].map((b) => +b.dataset.dia),
  });
  if (j < 0) fijos.push(f);
  cerrarModal();
  enviar({ tipo: "guardar", datos: { fijos } }, "Cambios guardados");
}

function borrarFijo(j) {
  if (!confirm("¿Lo borro?")) return;
  const fijos = JSON.parse(JSON.stringify(estado.fijos));
  fijos.splice(j, 1);
  cerrarModal();
  enviar({ tipo: "guardar", datos: { fijos } }, "Borrado.");
}

// ============================================================
// Conectar celu (solo en la PC)
// ============================================================
function vistaCelu() {
  if (!estado.conexion) return `<p class="suave">Esto se ve solo desde la PC.</p>`;
  const c = estado.conexion;
  const aparatos = c.aparatos.map((a) => `<div class="item">${ic("celu")}<span><b>${esc(a.nombre)}</b> <span class="suave">· desde ${esc(a.creado)}</span></span>
      <button class="boton chico peligro" style="margin-left:auto" onclick="quitarAparato('${a.id}')">Quitar</button></div>`).join("");
  return encabezado("08", "Conectar celu", "Tu celu, conectado", "Solo tus aparatos pueden entrar.") + `
  <div class="tarjeta conectar">
    <p class="suave chico">Último respaldo: ${esc(c.ultimo_respaldo || "Todavía no hay respaldos")}</p>
    <div class="dibujo">${ic("pc")} ${ic("enlace")} ${ic("celu")}</div>
    <p>En el celu (mismo Wi-Fi), abrí Chrome y escribí</p><p><code style="font-size:18px">${esc(c.direccion)}</code></p>
    <p>Te va a pedir este código:</p>
    <div class="digitos">${c.codigo.split("").map((d) => `<span>${d}</span>`).join("")}</div>
    <div class="candado">${ic("candado")} El código se usa una sola vez; después cambia solo.</div>
    <p class="suave">Después, en Chrome: ⋮ → <b>Agregar a la pantalla principal</b> y te queda como una app.</p>
  </div>
  <h2>${ic("celu")} Aparatos que pueden entrar</h2>
  <div class="tarjeta lista">${aparatos || `<p class="suave">Ninguno todavía. Solo esta PC.</p>`}
    <p class="suave">Si perdés el celu o ves uno que no es tuyo, tocá «Quitar»: deja de poder entrar al instante.</p>
    <button class="boton chico" onclick="enviar({tipo:'nuevo_codigo'}, 'Código nuevo.')">Cambiar el código</button></div>
  <h2>${ic("sinNube")} Para verlo desde cualquier lado</h2>
  ${seccionVisor(c)}
  ${seccionTelegram(c.telegram)}
  <h2>${ic("apagar")} Apagar Kronos</h2>
  <div class="tarjeta"><p class="suave">Kronos anda en segundo plano, sin ventana. Mientras esté prendido, el celu ve el plan al día. Para prenderlo de nuevo, abrí el ícono de Kronos del escritorio.
    Si el celu no entra, fijate que Windows lo deje usar la red <b>solo en redes privadas</b>.</p>
    <button class="boton peligro" onclick="apagar()">${ic("apagar")} Apagar Kronos</button></div>`;
}

function seccionTelegram(t = {}) {
  const interruptor = (clave, titulo, defecto) => {
    const activo = t[clave] ?? defecto;
    return `<div class="ajuste"><span class="q"><span>${titulo}<small class="suave estado-tg" style="display:block;font-weight:400">${activo ? 'Activado' : 'Desactivado'}</small></span></span><button class="boton ${activo ? '' : 'principal'}" role="switch" aria-checked="${activo}" data-tg="${clave}" onclick="alternarTelegram(this)">${activo ? 'Desactivar' : 'Activar'}</button></div>`;
  };
  const hora = (clave, titulo, defecto) => `<label>${titulo}</label><input id="tg-${clave}" class="campo-hora" inputmode="numeric" value="${esc(t[clave] || defecto)}" oninput="formatoHora(this)">`;
  return `<h2>Telegram</h2><div class="tarjeta"><p>${t.activo ? 'Activado para tu chat personal.' : 'Apagado. Sin token y chat_id no se conecta ni manda mensajes.'}</p>
    ${interruptor('habilitado','Bot de Telegram',false)}
    ${interruptor('texto_libre','Entender texto libre con Gemini',false)}
    <p class="suave chico">Apagado por defecto. Con este interruptor solo se manda la frase y la fecha/hora, salvo que actives también compartir el resumen de abajo. Nunca tus notas ni archivos. Con la clave gratis, Google puede usar lo que se manda para mejorar sus productos. No envíes datos de pacientes. Nada cambia sin tu «sí».</p>
    ${interruptor('compartir_plan','Compartir resumen del plan con Gemini',false)}
    <p class="suave chico">Para contestarte, Gemini recibe un resumen de tu plan (objetivos, fechas, avance, lo de hoy y los próximos 7 días, tus horarios). Nunca tus notas, apuntes, nombres de archivos ni datos de pacientes (sí los nombres de los temas). Con la clave gratis, Google puede usarlo para mejorar sus productos. Solo funciona con «Entender texto libre con Gemini» también prendido. La charla recuerda hasta 6 mensajes durante 10 minutos, solo en memoria; se olvida al reiniciar. Cada cambio requiere tu «sí».</p>
    <label>Token del bot</label><input id="tg-token" type="password" autocomplete="new-password" placeholder="${t.tiene_token ? 'Ya guardado; dejá vacío para conservarlo' : 'Pegalo acá; queda oculto'}" value="">
    <label>Tu chat_id personal</label><input id="tg-chat" inputmode="numeric" value="${esc(t.chat_id || '')}" placeholder="Solo responde a este chat">
    <p class="suave chico">Creá el bot con BotFather y pegá sus datos acá. No lo agregues a grupos. Funciona mientras esta PC esté prendida. Máximo 3 avisos automáticos por día; las respuestas a tus comandos van aparte.</p>
    ${interruptor('manana','Resumen de la mañana',true)}${hora('hora_manana','Hora del resumen','08:00')}
    ${interruptor('examen','Exámenes a 2 y 1 días, con qué llevar',true)}${hora('hora_examen','Hora del recordatorio','10:00')}
    ${interruptor('noche','Lo que faltó hacer a la noche',true)}${hora('hora_noche','Hora del cierre','21:00')}
    <p class="suave chico">Comandos: hoy · mañana · finales/exámenes · semana · ayuda · imprevisto 3h · ocupado jueves 15 a 18. Todo cambio requiere que respondas «sí».</p>
    <p class="suave chico">${esc(t.conexion || 'Sin conectar')}</p>
    <div class="acciones"><button class="boton principal" onclick="guardarTelegram()">Guardar Telegram</button>${t.tiene_token ? `<button class="boton peligro" onclick="guardarTelegram(true)">Borrar token y apagar</button>` : ''}</div></div>`;
}

function alternarTelegram(boton) {
  const activo = boton.getAttribute('aria-checked') !== 'true';
  boton.setAttribute('aria-checked', String(activo));
  boton.classList.toggle('principal', !activo);
  boton.textContent = activo ? 'Desactivar' : 'Activar';
  const estado = boton.parentElement?.querySelector?.('.estado-tg');
  if (estado) estado.textContent = activo ? 'Activado' : 'Desactivado';
}

function guardarTelegram(borrar = false) {
  const config = {chat_id: $('#tg-chat').value.trim(), borrar_token: borrar};
  document.querySelectorAll('[data-tg]').forEach(b => config[b.dataset.tg] = b.getAttribute('aria-checked') === 'true');
  for (const clave of ['hora_manana','hora_examen','hora_noche']) {
    config[clave] = $('#tg-' + clave).value;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(config[clave])) return avisar('Revisá los horarios: por ejemplo, 08:00.');
  }
  if (!borrar && $('#tg-token').value.trim()) config.token = $('#tg-token').value.trim();
  if (borrar) config.habilitado = false;
  $('#tg-token').value = '';
  enviar({tipo:'telegram_configurar',config},'Configuración de Telegram guardada');
}

async function apagar() {
  if (!confirm("¿Apago Kronos? El celu no se va a poder actualizar hasta que lo vuelvas a abrir.")) return;
  await fetch("/api/accion", { method: "POST", headers: cabeceras(), body: JSON.stringify({ tipo: "apagar" }) }).catch(() => {});
  estado = null;
  $("#derecha").innerHTML = "";
  $("#vista").innerHTML = `<div class="tarjeta" style="margin-top:24px"><h3>Kronos está apagado</h3><p class="suave">Para prenderlo de nuevo, abrí el ícono de Kronos del escritorio.</p></div>`;
}

function quitarAparato(id) {
  if (confirm("¿Le saco el acceso a este aparato?")) enviar({ tipo: "quitar_aparato", id }, "Listo, ese aparato ya no puede entrar.");
}

// ============================================================
// Isla flotante: lo de hoy, los objetivos y el reloj de estudio, siempre a mano.
// En la PC es una ventanita propia de Kronos (isla.pyw: sin marco y arriba de todas las ventanas) que muestra
// esta misma pantalla en "modo isla" (dirección con ?isla=1). En el celu flota adentro de Kronos.
// Se mueve desde la parte de arriba, se agranda desde la esquina (con un tamaño mínimo) y se pliega.
// Sus botones usan data-acc (un solo "escuchador"), no onclick.
// ============================================================
const MODO_ISLA = new URLSearchParams(location.search).has("isla");
if (MODO_ISLA) document.body.classList.add("modo-isla");
const enVentana = () => MODO_ISLA && window.pywebview && window.pywebview.api;
const ISLA_MIN = { w: 260, h: 180 }; // más chica no entra nada
let isla = Object.assign({ abierta: false, plegada: false, x: null, y: 90, w: 340, h: 480 }, JSON.parse(localStorage.getItem("kronos-isla") || "{}"));
let islaFoco = null; // el bloque que se ve grande (si no se eligió otro: el de ahora o el próximo)
const guardarIsla = () => localStorage.setItem("kronos-isla", JSON.stringify(isla));
const bloqueHecho = (b) => b.tareas.every((id) => valorTarea(b.materia, tareaGuardada(b.materia, id)) >= 0.99);
const claveBloque = (b) => `${b.inicio}|${b.materia || b.tipo}`;

function alternarIsla() {
  // en la PC se abre (o se cierra) la ventanita propia; en el celu, la isla adentro de la página
  if (estado && estado.conexion && !VISOR && !MODO_ISLA) return enviar({ tipo: "isla" });
  isla.abierta = !isla.abierta;
  guardarIsla();
  dibujar();
}
function cerrarIsla() {
  if (enVentana()) return window.pywebview.api.cerrar();
  isla.abierta = false;
  guardarIsla();
  dibujar();
}
function plegarIsla() {
  isla.plegada = !isla.plegada;
  guardarIsla();
  if (enVentana()) window.pywebview.api.plegar(isla.plegada);
  dibujarIsla();
}

function dibujarIsla() {
  const el = $("#isla");
  // en la PC la isla es la ventanita propia (isla.pyw): adentro de la página solo aparece en el celu
  const visible = !!estado && (MODO_ISLA || (isla.abierta && !(estado.conexion && !VISOR)));
  $("#isla-pagina").classList.toggle("oculto", !visible);
  if (!visible) return;
  el.classList.toggle("plegada", isla.plegada);
  const escrito = el.contains(document.activeElement) && document.activeElement.matches("input");
  if (escrito) return; // no se redibuja mientras Lean está escribiendo un número
  const scroll = el.querySelector(".isla-cuerpo")?.scrollTop || 0;
  el.innerHTML = htmlIsla();
  const cuerpo = el.querySelector(".isla-cuerpo");
  if (cuerpo) cuerpo.scrollTop = scroll;
  if (!MODO_ISLA) ubicarIsla();
}

function ubicarIsla() {
  const el = $("#isla-pagina");
  const w = Math.min(Math.max(isla.w, ISLA_MIN.w), innerWidth - 8);
  const h = Math.min(Math.max(isla.h, ISLA_MIN.h), innerHeight - 16);
  if (isla.x === null) isla.x = innerWidth - w - 16;
  const x = Math.min(Math.max(4, isla.x), innerWidth - w - 4);
  const y = Math.min(Math.max(4, isla.y), Math.max(4,innerHeight - (isla.plegada ? 70 : h) - 4));
  Object.assign(isla,{x,y,w,h});
  Object.assign(el.style, { left: x + "px", top: y + "px", width: w + "px", height: isla.plegada ? "" : h + "px" });
  guardarIsla();
}

function esquinaIsla(x, y, w, h, ancho, alto) {
  return {x:x+w/2 < ancho/2 ? 4 : Math.max(4,ancho-w-4),y:y+h/2 < alto/2 ? 4 : Math.max(4,alto-h-4)};
}

function estadoBloque(b) {
  const ahora = ahoraHHMM();
  if (b.tipo !== "estudio") return ["", ""];
  return bloqueHecho(b) ? ["hecho", "Hecho"] : b.salteado ? ["salteado", "Salteado"]
    : b.fin <= ahora ? ["paso", "Ya pasó la hora"] : b.inicio <= ahora ? ["ahora", "Ahora"] : ["", ""];
}

function htmlIsla() {
  const hoy = hoyISO(), ahora = ahoraHHMM();
  const dia = diaDelPlan(hoy);
  const bloques = dia ? dia.bloques : [];
  const pendientes = bloques.filter((b) => b.tipo === "estudio" && !b.salteado && !bloqueHecho(b));
  const actual = pendientes.find((b) => b.inicio <= ahora && b.fin > ahora) || pendientes.find((b) => b.inicio > ahora) || pendientes[pendientes.length - 1];
  const foco = bloques.find((b) => b.tipo === "estudio" && claveBloque(b) === islaFoco) || actual;
  const corriendo = reloj.corriendo || reloj.acumulado > 0;
  const cabeza = `<div class="isla-cabeza">
      <div class="isla-agarre pywebview-drag-region" data-arrastrar><img src="icono-192.png" alt=""><b>Kronos</b><span class="sep"></span>
        ${isla.plegada && foco && foco.materia ? `<span class="etiqueta-materia" style="background:${materia(foco.materia).color}">${esc(materia(foco.materia).corto)}</span><span class="isla-hora">${foco.inicio}</span><span class="sep"></span>` : ""}
        <span class="isla-hora ${corriendo ? "reloj-num" : ""}">${corriendo ? textoReloj() : ahora}</span></div>
      <div class="isla-botones">${menuTema(document.documentElement.dataset.tema === "oscuro", true)}
        <button data-acc="plegarIsla" title="${isla.plegada ? "Desplegar" : "Plegar"}">${ic(isla.plegada ? "abajo" : "arriba")}</button>
        <button data-acc="cerrarIsla" title="Cerrar la isla">${ic("cruz")}</button></div></div>`;
  if (isla.plegada) return cabeza;
  let html = cabeza + `<div class="isla-cuerpo"><button class="boton chico" data-acc="abrirInercia" aria-label="Abrir Inercia Cero">${ic("rayo")} Inercia Cero</button>${avisoMedicion(true)}${tarjetasExamen(true)}${tarjetaFoco(foco)}${htmlReloj()}`;
  if (bloques.length) {
    html += `<div class="isla-titulo-seccion">Hoy <span>${dia && dia.estudio_min ? `quedan ${horas(dia.estudio_min)}` : "nada pendiente"}</span></div>`;
    html += `<div class="isla-lista">${bloques.map((b) => lineaIsla(b, foco && claveBloque(b) === claveBloque(foco))).join("")}</div>`;
  }
  if ((cambios.size || dificultades.size) && !soloLectura) html += `<button class="boton chico principal ancho" data-acc="guardarCambios">${ic("tilde")} Actualizar rutina (${cambios.size+dificultades.size})</button>`;
  html += `<div class="isla-objs">` + proximosFinales().map((m) => {
    const sem = semaforo(m);
    return `<span class="isla-obj" title="${sem ? sem.texto : ""}"><span class="etiqueta-materia" style="background:${m.color}">${esc(m.corto)}</span><b>${diasHasta(m.fecha)} d</b>${sem ? sem.texto : ""}<span class="luz" style="background:${sem ? sem.color : "var(--apagado)"}"></span></span>`;
  }).join("") + `</div>`;
  return html + `</div><div class="isla-esquina" data-agrandar title="Arrastrá para cambiar el tamaño"></div>`;
}

// el bloque que se ve grande: con sus temas para tildar
function tarjetaFoco(b) {
  if (!b) return `<div class="isla-foco vacio">${ic("tilde")} No queda nada pendiente para hoy.</div>`;
  if (b.tipo === "final") return `<div class="isla-foco" style="--mc:var(--acento)"><div class="isla-foco-hora">${ic("birrete")} ${esc(b.texto)} · ${b.inicio}</div></div>`;
  const m = materia(b.materia), ahora = ahoraHHMM();
  const [clase, texto] = estadoBloque(b);
  const cuando = b.inicio > ahora ? `Empieza en ${horas(aMin(b.inicio) - aMin(ahora))}` : b.fin > ahora && !texto.startsWith("Hecho") ? `Termina en ${horas(aMin(b.fin) - aMin(ahora))}` : "";
  const temas = b.tareas.map((id, i) => {
    const v = valorTarea(m.id, tareaGuardada(m.id, id));
    return `<li class="${v >= 0.99 ? "hecho" : ""}"><button class="tilde ${v >= 0.99 ? "si" : v > 0 ? "medio" : ""} ${cambios.has(`${m.id}|${id}`) ? "pendiente" : ""}" ${bloqueado()}
      data-acc="tildar" data-m="${m.id}" data-t="${id}" data-x="${esc(b.temas[i])}">${v >= 0.99 ? ic("tilde") : ""}</button><span>${esc(b.temas[i])}</span></li>`;
  }).join("");
  return `<div class="isla-foco ${clase}" style="--mc:${m.color}">
    <div class="isla-foco-arriba"><span class="etiqueta-materia" style="background:${m.color}">${esc(m.corto)}</span>${pastillaEtapa(b.etapa)}
      <span class="isla-estado ${clase || (cuando ? "ahora" : "")}">${texto || cuando}</span></div>
    <div class="isla-foco-hora">${b.inicio} – ${b.fin} <small>· ${horas(b.minutos)}</small></div>
    <ul class="temas">${temas}</ul>
    ${!soloLectura && clase !== "hecho" && !b.salteado ? `<div class="isla-medir">${botonesMedir(b, true)}</div>` : ""}</div>`;
}

// un renglón chico por bloque; tocarlo lo muestra grande arriba
function lineaIsla(b, elegido) {
  if (b.tipo === "final") return `<div class="isla-linea final"><span class="hora">${b.inicio}</span>${ic("birrete")}<b>${esc(b.texto)}</b></div>`;
  if (b.tipo !== "estudio") return `<div class="isla-linea gris"><span class="hora">${b.inicio}</span>${iconoBloque(b)}<span>${esc(b.texto)}</span></div>`;
  const m = materia(b.materia);
  const [clase, texto] = estadoBloque(b);
  return `<button class="isla-linea ${clase} ${elegido ? "elegido" : ""}" data-acc="enfocar" data-k="${esc(claveBloque(b))}">
    <span class="hora">${b.inicio}</span><span class="etiqueta-materia" style="background:${m.color}">${esc(m.corto)}</span>${iconoEtapa(b.etapa)}
    ${texto ? `<span class="isla-estado ${clase}">${texto === "Ya pasó la hora" ? "Pasó" : texto}</span>` : ""}</button>`;
}

// la ventanita de la PC no le saca el foco al PDF (isla.pyw); para escribir un número sí lo toma un rato
if (MODO_ISLA) {
  document.addEventListener("focusin", (e) => { if (e.target.matches("input") && enVentana()) window.pywebview.api.teclado(true); });
  document.addEventListener("focusout", (e) => { if (e.target.matches("input") && enVentana()) window.pywebview.api.teclado(false); });
}

function escucharIsla(el) {
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-acc]");
    if (!b || b.disabled) return;
    const acciones = {
      plegarIsla, cerrarIsla, guardarCambios, elegirTema: () => { elegirTema(b.dataset.r); dibujarIsla(); },
      tildar: () => tildar(b.dataset.m, b.dataset.t, b.dataset.x),
      enfocar: () => { islaFoco = b.dataset.k; dibujarIsla(); },
      reloj: () => accionReloj(b.dataset.r),
      empezarBloque: () => empezarBloque(b),
      terminarBloque, cancelarMedicion,
      abrirInercia,
      seguirMidiendo, pedirHoraMedicion, descartarMedicion, confirmarTiempoMedido,
      tildarLlevar: () => tildarLlevar(b.dataset.mid, +b.dataset.indice, true),
      modoReloj: () => cambiarModoReloj(b.dataset.r),
    };
    if (acciones[b.dataset.acc]) acciones[b.dataset.acc]();
  });
  el.addEventListener("change", (e) => {
    const campo = e.target.dataset.campo;
    const n = Math.round(parseFloat(e.target.value));
    if (!campo || !(n >= 1)) return; // vacío: queda el número que había
    reloj[campo] = Math.min(600, n);
    guardarReloj();
    el.querySelectorAll(".reloj-num").forEach((x) => (x.textContent = textoReloj()));
  });
  el.addEventListener("pointerdown", arrastrarIsla);
}

function arrastrarIsla(e) {
  const agrandar = e.target.closest("[data-agrandar]");
  if (MODO_ISLA) {
    // en la ventanita de la PC: moverla lo hace Windows (parte de arriba); acá solo el tamaño, desde la esquina
    if (!agrandar || !enVentana()) return;
    e.preventDefault();
    const w0 = innerWidth, h0 = innerHeight, x0 = e.screenX, y0 = e.screenY;
    agrandar.setPointerCapture(e.pointerId);
    let ocupado = false;
    const mover = (ev) => {
      if (ocupado) return;
      ocupado = true;
      Promise.resolve(window.pywebview.api.tamano(w0 + ev.screenX - x0, h0 + ev.screenY - y0)).finally(() => (ocupado = false));
    };
    const soltar = () => { agrandar.removeEventListener("pointermove", mover); agrandar.removeEventListener("pointerup", soltar); };
    agrandar.addEventListener("pointermove", mover);
    agrandar.addEventListener("pointerup", soltar);
    return;
  }
  if (!agrandar && (!e.target.closest("[data-arrastrar]") || e.target.closest("button"))) return;
  e.preventDefault();
  const r = $("#isla-pagina").getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
  const mover = (ev) => {
    if (agrandar) {
      isla.w = Math.max(ISLA_MIN.w, r.width + ev.clientX - x0);
      isla.h = Math.max(ISLA_MIN.h, r.height + ev.clientY - y0);
    } else {
      isla.x = r.left + ev.clientX - x0;
      isla.y = r.top + ev.clientY - y0;
    }
    ubicarIsla();
  };
  const soltar = () => {
    removeEventListener("pointermove", mover); removeEventListener("pointerup", soltar);
    if (!agrandar) Object.assign(isla,esquinaIsla(isla.x,isla.y,isla.w,isla.plegada ? 70 : isla.h,innerWidth,innerHeight));
    ubicarIsla(); guardarIsla();
  };
  addEventListener("pointermove", mover);
  addEventListener("pointerup", soltar);
}
addEventListener("resize", () => { if (isla.abierta && !MODO_ISLA) ubicarIsla(); });

// ---------- reloj de estudio: cronómetro, temporizador y pomodoro ----------
let reloj = Object.assign({ modo: "cronometro", corriendo: false, desde: 0, acumulado: 0, minutos: 90, estudio: 45, descanso: 15, fase: "estudio", vuelta: 1 },
  JSON.parse(localStorage.getItem("kronos-reloj") || "{}"));
let sonido = null;
const guardarReloj = () => localStorage.setItem("kronos-reloj", JSON.stringify(reloj));
if (!reloj.corriendo && reloj.acumulado > 0 && !reloj.pausado_desde) { reloj.pausado_desde=Date.now(); guardarReloj(); }
const transcurrido = () => reloj.acumulado + (reloj.corriendo ? Date.now() - reloj.desde : 0);
const metaReloj = () => (reloj.modo === "temporizador" ? reloj.minutos : reloj.modo === "pomodoro" ? reloj[reloj.fase] : 0) * 60000;
function textoReloj() {
  const meta = metaReloj();
  const ms = meta ? Math.max(0, meta - transcurrido()) : transcurrido();
  const t = meta ? Math.ceil(ms / 1000) : Math.floor(ms / 1000);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sg = t % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(sg).padStart(2, "0");
}

function avisoPausaReloj() {
  if (reloj.corriendo || !reloj.acumulado || !reloj.pausado_desde || Date.now()-reloj.pausado_desde < 10*60000) return '';
  return `<div class="tarjeta" role="status"><p>¿Seguís? El reloj lleva un rato en pausa.</p><button class="boton chico" data-acc="reloj" data-r="empezar">Seguir</button><button class="boton chico" data-acc="reloj" data-r="revisar_pausa">Dejar en pausa</button></div>`;
}

function actualizarPausaReloj() {
  const el=$('#pausa-reloj');
  if (!el) return;
  const html=avisoPausaReloj();
  if (el.dataset.aviso !== html) { el.innerHTML=html; el.dataset.aviso=html; }
}

function htmlReloj() {
  const modos = { cronometro: "Cronómetro", temporizador: "Temporizador", pomodoro: "Pomodoro" };
  const pestanas = Object.entries(modos).map(([k, n]) => `<button class="${reloj.modo === k ? "activa" : ""}" data-acc="modoReloj" data-r="${k}">${n}</button>`).join("");
  const quieto = !reloj.corriendo && !reloj.acumulado;
  let detalle = "";
  if (reloj.modo === "cronometro") detalle = `<span class="suave">Tiempo de estudio</span>`;
  if (reloj.modo === "temporizador") detalle = quieto
    ? `<label>Avisame a los <input data-num data-campo="minutos" inputmode="numeric" value="${reloj.minutos}"> min</label>`
    : `<span class="suave">Te aviso a las ${horas(reloj.minutos)}, para que descanses.</span>`;
  if (reloj.modo === "pomodoro") detalle = quieto
    ? `<label>Estudio <input data-num data-campo="estudio" inputmode="numeric" value="${reloj.estudio}"> min</label> <label>Descanso <input data-num data-campo="descanso" inputmode="numeric" value="${reloj.descanso}"> min</label>`
    : `<span class="fase-${reloj.fase}">${reloj.fase === "estudio" ? `${ic("libro")} Estudio` : `${ic("cafe")} Descanso`} · vuelta ${reloj.vuelta}</span>`;
  const principal = reloj.corriendo
    ? `<button class="boton chico" data-acc="reloj" data-r="pausa">${ic("pausa")} Pausa</button>`
    : `<button class="boton chico principal" data-acc="reloj" data-r="empezar">${ic("play")} ${quieto ? "Empezar" : "Seguir"}</button>`;
  return `<div class="reloj-caja"><div id="pausa-reloj">${avisoPausaReloj()}</div><div class="reloj-modos">${pestanas}</div>
    <div class="reloj-num grande">${textoReloj()}</div><div class="reloj-detalle">${detalle}</div>
    <div class="reloj-botones">${principal}
      ${quieto ? "" : `<button class="boton chico claro" data-acc="reloj" data-r="reiniciar">${ic("deshacer")} Reiniciar</button>`}
      ${reloj.modo === "pomodoro" && !quieto ? `<button class="boton chico claro" data-acc="reloj" data-r="fase">${ic("saltear")} ${reloj.fase === "estudio" ? "Ir al descanso" : "Volver a estudiar"}</button>` : ""}</div></div>`;
}

function cambiarModoReloj(modo) {
  if (modo === reloj.modo) return;
  if ((reloj.corriendo || reloj.acumulado) && !confirm("¿Cambio de modo? El reloj que está andando se reinicia.")) return;
  Object.assign(reloj, { modo, corriendo: false, acumulado: 0, fase: "estudio", vuelta: 1 });
  guardarReloj();
  dibujarIsla();
}

function accionReloj(que) {
  if (que === "empezar") {
    reloj.pausado_desde=0;
    reloj.corriendo = true;
    reloj.desde = Date.now();
    prepararAvisos();
  } else if (que === "pausa") {
    reloj.pausado_desde=Date.now();
    reloj.acumulado = transcurrido();
    reloj.corriendo = false;
  } else if (que === "reiniciar") {
    reloj.pausado_desde=0;
    Object.assign(reloj, { corriendo: false, acumulado: 0, fase: "estudio", vuelta: 1 });
  } else if (que === "fase") {
    pasarFase();
  } else if (que === 'revisar_pausa') {
    reloj.pausado_desde=Date.now();
  }
  guardarReloj();
  dibujarIsla();
}

function pasarFase() {
  if (reloj.fase === "estudio") reloj.fase = "descanso";
  else { reloj.fase = "estudio"; reloj.vuelta += 1; }
  reloj.acumulado = 0;
  reloj.desde = Date.now();
}

// el sonido y los avisos del sistema necesitan un toque de Lean para activarse (se hace al tocar "Empezar")
function prepararAvisos() {
  try { sonido = sonido || new AudioContext(); sonido.resume(); } catch (e) { sonido = null; }
  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
}

function sonar(texto) {
  if (sonido) {
    [0, 0.35, 0.7].forEach((t) => {
      const o = sonido.createOscillator(), g = sonido.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, sonido.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, sonido.currentTime + t + 0.3);
      o.connect(g).connect(sonido.destination);
      o.start(sonido.currentTime + t);
      o.stop(sonido.currentTime + t + 0.3);
    });
  }
  if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
  if ("Notification" in window && Notification.permission === "granted") try { new Notification("Kronos", { body: texto, icon: "icono-192.png" }); } catch (e) { /* celu sin avisos */ }
  avisar(texto);
  const el = $("#isla");
  if (el) { el.classList.add("sonando"); setTimeout(() => el.classList.remove("sonando"), 6000); }
}

// cada segundo: mueve los números y avisa cuando se cumple el tiempo
setInterval(() => {
  actualizarPausaReloj();
  if (reloj.corriendo) {
    const meta = metaReloj();
    if (meta && transcurrido() >= meta) {
      if (reloj.modo === "temporizador") {
        reloj.acumulado = meta;
        reloj.corriendo = false;
        sonar(`Ya pasaron ${horas(reloj.minutos)}. Buen momento para cortar y descansar, así no te quemás la cabeza.`);
      } else {
        const termino = reloj.fase;
        pasarFase();
        sonar(termino === "estudio" ? `Terminó el estudio: ${horas(reloj.descanso)} de descanso.` : `Terminó el descanso: a estudiar ${horas(reloj.estudio)}.`);
      }
      guardarReloj();
      return dibujarIsla();
    }
  }
  if (reloj.corriendo) document.querySelectorAll("#isla .reloj-num").forEach((e) => (e.textContent = textoReloj()));
}, 1000);

// ============================================================
// Copia con contraseña para ver desde cualquier lado (página de GitHub)
// La PC la sube cerrada (visor.py); acá se abre con las herramientas del navegador.
// ============================================================
const deB64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
const aB64 = (b) => btoa(String.fromCharCode(...b));
const juntar = (a, b) => { const u = new Uint8Array(a.length + b.length); u.set(a); u.set(b, a.length); return u; };

async function cargarVisor() {
  let caja = null;
  try {
    const r = await fetch("copia.json", { cache: "no-cache" });
    if (r.ok) caja = await r.json();
  } catch (e) { /* sin internet: queda la última que se bajó */ }
  if (caja) localStorage.setItem("kronos-visor-caja", JSON.stringify(caja));
  else caja = JSON.parse(localStorage.getItem("kronos-visor-caja") || "null");
  if (!caja) {
    $("#vista").innerHTML = `<div class="tarjeta alerta" style="margin-top:20px">${ic("sinNube")}<span>Todavía no hay ninguna copia. Se activa desde Kronos en la PC, en «Conectar celu».</span></div>`;
    return;
  }
  const llave = JSON.parse(localStorage.getItem("kronos-visor-llave") || "null");
  if (!llave || llave.sal !== caja.sal) return pantallaClave();
  const texto = await abrirCaja(caja, llave);
  if (texto === null) {
    localStorage.removeItem("kronos-visor-llave");
    return pantallaClave("La contraseña cambió: poné la nueva.");
  }
  estado = JSON.parse(texto);
  soloLectura = true;
  document.body.classList.add("remoto");
  mostrarConexion();
  dibujar();
}

async function sacarLlave(clave, caja) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: deB64(caja.sal), iterations: caja.vueltas }, base, 512));
  return { sal: caja.sal, kc: aB64(bits.slice(0, 32)), km: aB64(bits.slice(32)) };
}

// devuelve el plan (texto) o null si la contraseña no es o la copia está tocada
async function abrirCaja(caja, llave) {
  const hmac = (k, uso) => crypto.subtle.importKey("raw", deB64(k), { name: "HMAC", hash: "SHA-256" }, false, [uso]);
  const nonce = deB64(caja.nonce), datos = deB64(caja.datos);
  if (!(await crypto.subtle.verify("HMAC", await hmac(llave.km, "verify"), deB64(caja.sello), juntar(nonce, datos)))) return null;
  const kc = await hmac(llave.kc, "sign");
  const bloques = await Promise.all(Array.from({ length: Math.ceil(datos.length / 32) }, (_, i) => {
    const n = new Uint8Array(4);
    new DataView(n.buffer).setUint32(0, i);
    return crypto.subtle.sign("HMAC", kc, juntar(nonce, n));
  }));
  const plano = new Uint8Array(datos.length);
  bloques.forEach((b, i) => {
    const chorro = new Uint8Array(b);
    for (let j = 0; j < 32 && i * 32 + j < datos.length; j++) plano[i * 32 + j] = datos[i * 32 + j] ^ chorro[j];
  });
  return new Response(new Blob([plano]).stream().pipeThrough(new DecompressionStream("deflate"))).text();
}

function pantallaClave(error = "") {
  $("#menu-abajo").innerHTML = "";
  $("#menu-lateral").innerHTML = "";
  $("#derecha").innerHTML = "";
  $("#vista").innerHTML = `<div class="tarjeta conectar" style="margin-top:24px">
    <div class="dibujo">${ic("candado")}</div>
    <div class="titulo" style="font-size:26px">Copia de Kronos</div>
    <p class="subtitulo">Poné la contraseña que elegiste en la PC.</p>
    <input id="v-clave" type="password" autocomplete="current-password" onkeydown="if(event.key==='Enter')abrirConClave()">
    <p id="v-error" class="suave" ${error ? 'style="color:var(--peligro)"' : ""}>${esc(error)}</p>
    <button class="boton principal grande" onclick="abrirConClave()">Abrir</button>
    <div class="candado">${ic("candado")} Sin la contraseña nadie puede leer la copia.</div></div>`;
  $("#v-clave").focus();
}

async function abrirConClave() {
  const caja = JSON.parse(localStorage.getItem("kronos-visor-caja") || "null");
  const aviso = $("#v-error");
  aviso.style.color = "";
  aviso.textContent = "Abriendo…";
  const llave = await sacarLlave($("#v-clave").value, caja);
  if ((await abrirCaja(caja, llave)) === null) {
    aviso.style.color = "var(--peligro)";
    return (aviso.textContent = "Esa no es la contraseña.");
  }
  localStorage.setItem("kronos-visor-llave", JSON.stringify(llave));
  cargarVisor();
}

function olvidarVisor() {
  if (!confirm("¿Cierro la copia en este aparato? Para volver a verla vas a tener que poner la contraseña.")) return;
  ["kronos-visor-llave", "kronos-visor-caja"].forEach((k) => localStorage.removeItem(k));
  location.reload();
}

function activarVisor() {
  const a = $("#vis-1").value, b = $("#vis-2").value;
  if (a.length < 8) return avisar("La contraseña tiene que tener al menos 8 letras o números.");
  if (a !== b) return avisar("Las dos contraseñas no coinciden.");
  enviar({ tipo: "visor_activar", clave: a }, "Listo. En un par de minutos la copia está en internet.");
}

function seccionVisor(c) {
  const v = c.visor || {};
  const pedirClave = (boton) => `<label>Contraseña (mínimo 8; anotala, no se puede recuperar)</label>
    <input id="vis-1" type="password" autocomplete="new-password"><label>Repetila</label><input id="vis-2" type="password" autocomplete="new-password">
    <button class="boton principal" style="margin-top:10px" onclick="activarVisor()">${boton}</button>`;
  if (!v.activo) return `<div class="tarjeta"><p class="suave">Elegí una contraseña y Kronos sube una copia de tu plan, cerrada con ella, a una página de internet.
    La podés abrir desde cualquier lado aunque la PC esté apagada (solo para mirar). Sin la contraseña nadie puede leerla.
    Se actualiza sola cada vez que guardás algo con Kronos prendido.</p>${pedirClave("Activar copia")}</div>`;
  return `<div class="tarjeta"><p>Abrí en el celu: <a href="${esc(v.direccion)}" target="_blank"><code style="font-size:16px">${esc(v.direccion)}</code></a></p>
    <p class="suave">Poné la contraseña y después, en Chrome: ⋮ → <b>Agregar a la pantalla principal</b> (o <b>Instalar app</b>).
    Funciona sin internet con la última copia que bajó.</p>
    <p class="suave">${v.ultima ? `Última subida: <b>${esc(v.ultima)}</b>` : "Subiendo la primera copia…"}</p>
    ${v.error ? `<p style="color:var(--peligro)">${esc(v.error)}</p>` : ""}
    <div class="acciones"><button class="boton chico" onclick="enviar({tipo:'visor_subir'}, 'Subiendo la copia…')">Subir ahora</button>
    <button class="boton chico" onclick="this.parentElement.nextElementSibling.classList.toggle('oculto')">Cambiar contraseña</button>
    <button class="boton chico peligro" onclick="if(confirm('¿Borro la copia de internet y dejo de subirla?'))enviar({tipo:'visor_apagar'}, 'Listo, la copia se borra de internet.')">Desactivar</button></div>
    <div class="oculto" style="margin-top:10px">${pedirClave("Guardar contraseña nueva")}</div></div>`;
}

// ============================================================
// Vincular un aparato nuevo
// ============================================================
function pantallaVincular() {
  $("#menu-abajo").innerHTML = "";
  $("#menu-lateral").innerHTML = "";
  $("#derecha").innerHTML = "";
  $("#vista").innerHTML = `<div class="tarjeta conectar" style="margin-top:24px">
    <div class="dibujo">${ic("pc")} ${ic("enlace")} ${ic("celu")}</div>
    <div class="titulo" style="font-size:30px">Conectar este aparato a Kronos</div>
    <p class="subtitulo">Ingresá el código que aparece en tu PC.</p>
    <div class="digitos">${[0, 1, 2, 3, 4, 5].map((i) => `<input inputmode="numeric" maxlength="1" data-d="${i}" oninput="siguienteDigito(this)" onkeydown="if(event.key==='Backspace'&&!this.value&&this.previousElementSibling)this.previousElementSibling.focus()">`).join("")}</div>
    <label style="text-align:left">Nombre del aparato</label><input id="v-nombre" value="Mi celular" maxlength="40">
    <button class="boton principal grande" style="margin-top:16px" onclick="vincular()">Conectar</button>
    <div class="candado">${ic("candado")} El código se usa una sola vez.</div></div>`;
  document.querySelector('[data-d="0"]').focus();
}

function siguienteDigito(el) {
  el.value = el.value.replace(/\D/g, "").slice(-1);
  if (el.value && el.nextElementSibling) el.nextElementSibling.focus();
}

async function vincular() {
  const codigo = [...document.querySelectorAll("[data-d]")].map((i) => i.value).join("");
  const r = await fetch("/api/vincular", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigo, nombre: $("#v-nombre").value }) });
  const cuerpo = await r.json();
  if (!r.ok) return avisar(cuerpo.error || "No se pudo conectar.");
  localStorage.setItem("kronos-llave", cuerpo.llave);
  cargar();
}

// ============================================================
// Campos de números (regla de Lean): sin flechitas ni selector del navegador. Al tocarlos se marca todo, se puede
// borrar del todo y escribir lo que uno quiera. Si se deja vacío, vuelve el número que estaba.
// ============================================================
document.addEventListener("focusin", (e) => {
  const c = e.target.closest && e.target.closest("[data-num]");
  if (c) { c.dataset.previo = c.value; setTimeout(() => c.select(), 0); }
});
document.addEventListener("input", (e) => {
  const c = e.target.closest && e.target.closest("[data-num]");
  if (c) c.value = c.value.replace(",", ".").replace(/[^\d.]/g, "");
});
document.addEventListener("focusout", (e) => {
  const c = e.target.closest && e.target.closest("[data-num]");
  if (c && c.value.trim() === "") c.value = c.dataset.previo || "";
});

// ============================================================
// Ventana emergente y arranque
// ============================================================
function modal(html, redibujar = null) {
  formularioPendiente=false;
  redibujarModal = redibujar;
  const caja = $("#modal-caja");
  const scroll = redibujar && !$("#modal").classList.contains("oculto") ? caja.scrollTop : 0;
  caja.innerHTML = `<div class="tirador"></div><button class="cerrar" onclick="cerrarModal()" title="Cerrar">${ic("cruz")}</button>${html}`;
  $("#modal").classList.remove("oculto");
  caja.scrollTop = scroll;
}
function cerrarModal() { $("#modal").classList.add("oculto"); redibujarModal = null; formularioPendiente=false; }
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") cerrarModal(); });
escucharIsla($("#isla"));
aplicarTema();
document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarModal(); });

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
cargar();
