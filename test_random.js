/**
 * test_random.js — Stress test con requests aleatorios
 * Uso: node test_random.js [cantidad]
 * Ej:  node test_random.js 500
 */

const fs = require("fs");

// ─── CONFIG ───────────────────────────────────────────────────
const CFG = JSON.parse(fs.readFileSync("./config.json", "utf8"));
const N   = parseInt(process.argv[2]) || 200;

// ─── FUNCIONES COPIADAS DE bot.js ─────────────────────────────
function timeToMins(str) {
  const [h, m = "0"] = str.split(":");
  return parseInt(h) * 60 + parseInt(m);
}

function estaDisponible(fecha, cfg, horaMinutos) {
  const dd  = String(fecha.date.getDate()).padStart(2, "0");
  const mm  = String(fecha.date.getMonth() + 1).padStart(2, "0");
  const key = `${dd}/${mm}`;
  const ov  = (cfg.overrides || {})[key];
  if (ov) {
    if (ov.bloqueado || ov.inactivo) return false;
    if (ov.desde && ov.hasta) {
      if (horaMinutos !== null) {
        if (horaMinutos < timeToMins(ov.desde) || horaMinutos > timeToMins(ov.hasta)) return false;
      }
      return true;
    }
  }
  const horario = cfg.disponible[String(fecha.diaSemana)];
  if (!horario) return false;
  if (horaMinutos !== null) {
    if (horaMinutos < timeToMins(horario.desde) || horaMinutos > timeToMins(horario.hasta)) return false;
  }
  return true;
}

const SERVICIOS_KEYWORDS = {
  "Holistic":      ["holistic", "hol"],
  "Deep Tissue":   ["deep tissue", "deep"],
  "Aromatherapy":  ["aromatherapy", "aromatherapia", "aromaterapia", "aroma"],
  "Facial":        ["facial"],
  "Body Bliss":    ["body bliss"],
  "Reiki":         ["reiki"],
  "Californian":   ["californian", "cali"],
  "Thai":          ["thai"],
  "Craniosacral":  ["craniosacral", "cranio"],
  "Reflexology":   ["reflexology", "reflex"],
  "Shamanic":      ["shamanic"],
  "Shoulders":     ["shoulders", "shoulder"],
  "Sound Healing": ["sound healing"],
  "Ayurvedic":     ["ayurvedic", "ayur"],
};
const WB_KEYWORDS = new Set(["hol","deep","cali","aroma","cranio","reflex","ayur","thai"]);
const WB_COMPILED = {};
for (const k of WB_KEYWORDS) WB_COMPILED[k] = new RegExp("\\b" + k + "\\b");

function detectarServicio(text) {
  const lower = text.toLowerCase();
  for (const [nombre, keywords] of Object.entries(SERVICIOS_KEYWORDS)) {
    if (keywords.some(k => WB_KEYWORDS.has(k) ? WB_COMPILED[k].test(lower) : lower.includes(k))) return nombre;
  }
  return null;
}

function extraerHora(text) {
  const m = text.match(/[🕓⏱][\uFE0F]?\s*~?\s*(\d{1,2})(?:[:\.](\d{2}))?h?\b/);
  if (m) {
    const h = parseInt(m[1]), min = parseInt(m[2] || "0");
    if (h <= 23 && min <= 59) return h * 60 + min;
  }
  if (!/[🕓⏱]/.test(text)) {
    const t = text.match(/\b(\d{1,2}):(\d{2})\b/) || text.match(/\b(\d{1,2})\s*hs?\b/i);
    if (t) {
      const h = parseInt(t[1]), min = parseInt(t[2] || "0");
      if (h <= 23 && min <= 59) return h * 60 + min;
    }
  }
  return null;
}

const WEEKDAYS = {
  monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6, sunday:0,
  lunes:1,  martes:2,  miercoles:3, jueves:4,   viernes:5, sabado:6,  domingo:0
};
const MESES = {
  enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6,
  julio:7, agosto:8, septiembre:9, octubre:10, noviembre:11, diciembre:12,
  january:1, february:2, march:3, april:4, may:5, june:6,
  july:7, august:8, september:9, october:10, november:11, december:12,
  jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12
};
const MESES_ES = ["enero","febrero","marzo","abril","mayo","junio",
                  "julio","agosto","septiembre","octubre","noviembre","diciembre"];

function quitarAcentos(s) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

function extraerFecha(text) {
  const sinHora = text.replace(/[🕓⏱][\uFE0F]?.*$/gm, " ")
                      .replace(/#.*$/gm, " ")
                      .replace(/\d+\s*[''`´]/g, " ")
                      .replace(/\d+\s*min\b/gi, " ");
  const lower = quitarAcentos(sinHora.toLowerCase());
  const now   = new Date(); now.setHours(0, 0, 0, 0);

  if (/\b(today|hoy)\b/.test(lower))       return makeResult(new Date(now));
  if (/\b(tomorrow|manana)\b/.test(lower)) { const d = new Date(now); d.setDate(d.getDate()+1); return makeResult(d); }

  const wdM  = lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);
  const monM = lower.match(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/);
  const dnM  = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);

  if (monM && dnM) {
    const date = new Date(now.getFullYear(), MESES[monM[1]] - 1, parseInt(dnM[1]));
    if (date < now) date.setFullYear(now.getFullYear() + 1);
    return makeResult(date);
  }
  if (dnM) {
    const date = new Date(now.getFullYear(), now.getMonth(), parseInt(dnM[1]));
    if (date < now) date.setMonth(date.getMonth() + 1);
    return makeResult(date);
  }
  if (wdM) {
    const dow = WEEKDAYS[wdM[1]]; if (dow === undefined) return null;
    const date = new Date(now);
    date.setDate(date.getDate() + (((dow - now.getDay() + 7) % 7) || 7));
    return makeResult(date);
  }
  return null;
}

function makeResult(date) {
  return { date, diaSemana: date.getDay(),
    readable: `${date.getDate()} de ${MESES_ES[date.getMonth()]} ${date.getFullYear()}` };
}

// ─── GENERADOR DE MENSAJES ALEATORIOS ─────────────────────────
const TODOS_SERVICIOS = Object.keys(SERVICIOS_KEYWORDS);
const TODOS_KEYWORDS  = Object.values(SERVICIOS_KEYWORDS).flat();

const FECHAS_TEMPLATES = [
  "today", "hoy", "tomorrow", "mañana",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo",
  // día numérico con mes
  () => { const d = rnd(1,28); const m = ["january","february","march","april","may","june","july","august","september","october","november","december"][rnd(0,11)]; return `${d} ${m}`; },
  () => { const d = rnd(1,28); const m = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"][rnd(0,11)]; return `${d} de ${m}`; },
  // solo número
  () => String(rnd(1, 28)),
];

const HORAS_TEMPLATES = [
  null, // sin hora (flexible)
  () => `${rnd(8,20)}:00`,
  () => `${rnd(8,20)}:${["00","15","30","45"][rnd(0,3)]}`,
  () => `${rnd(8,20)}h`,
  () => `${rnd(8,20)} hs`,
  () => `🕓${rnd(8,20)}:00`,
  () => `⏱️${rnd(8,20)}h`,
  () => `🕓~${rnd(8,20)}`,
];

const PREFIJOS = [
  "Petición", "petición", "peticion", "Request", "request",
  "Hola! Petición", "Buenos días, petición", "Hi request",
];

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr)     { return arr[rnd(0, arr.length - 1)]; }

function generarMensaje() {
  const prefijo   = pick(PREFIJOS);
  const servicio  = pick(TODOS_KEYWORDS);
  const fechaTpl  = pick(FECHAS_TEMPLATES);
  const fecha     = typeof fechaTpl === "function" ? fechaTpl() : fechaTpl;
  const horaTpl   = pick(HORAS_TEMPLATES);
  const hora      = typeof horaTpl === "function" ? horaTpl() : horaTpl;

  // Variantes de orden aleatorio
  const partes = hora
    ? [`${prefijo} ${servicio} ${fecha} ${hora}`,
       `${prefijo} ${fecha} ${servicio} ${hora}`,
       `${prefijo} ${hora} ${fecha} ${servicio}`]
    : [`${prefijo} ${servicio} ${fecha}`,
       `${prefijo} ${fecha} ${servicio}`];

  return pick(partes);
}

// ─── SLOTS SIMULADOS ──────────────────────────────────────────
const slotsTest = {};

function slotLibreTest(dateKey, horaMinutos, minGap) {
  if (horaMinutos === null) return true;
  return ((slotsTest[dateKey] || []).every(t => Math.abs(t - horaMinutos) >= minGap));
}

function reclamarSlotTest(dateKey, horaMinutos) {
  if (!slotsTest[dateKey]) slotsTest[dateKey] = [];
  slotsTest[dateKey].push(horaMinutos !== null ? horaMinutos : -1);
}

// ─── RUNNER ───────────────────────────────────────────────────
const stats = {
  total: 0, crashes: 0,
  sinFecha: 0, sinServicio: 0, servicioNoPermitido: 0,
  noDisponible: 0, slotOcupado: 0, responderia: 0,
  diasSemana: { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 },
  serviciosAceptados: {},
  errores: [],
};

const DIAS_NOMBRE = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

console.log(`\n🎲 Generando ${N} requests aleatorios...\n`);

for (let i = 0; i < N; i++) {
  stats.total++;
  const msg = generarMensaje();

  try {
    // 1. Servicio
    const servicio  = detectarServicio(msg);
    const permitidos = CFG.serviciosPermitidos || [];
    if (!servicio) { stats.sinServicio++; continue; }
    if (permitidos.length > 0 && !permitidos.includes(servicio)) { stats.servicioNoPermitido++; continue; }

    // 2. Fecha
    const fecha = extraerFecha(msg);
    if (!fecha) { stats.sinFecha++; continue; }

    // 3. Hora
    const hora = extraerHora(msg);

    // 4. Disponibilidad
    if (!estaDisponible(fecha, CFG, hora)) { stats.noDisponible++; continue; }

    // 5. Slot
    const dateKey = `${String(fecha.date.getDate()).padStart(2,"0")}/${String(fecha.date.getMonth()+1).padStart(2,"0")}/${fecha.date.getFullYear()}`;
    const minGap  = CFG.minGapMins || 90;
    if (!slotLibreTest(dateKey, hora, minGap)) { stats.slotOcupado++; continue; }

    reclamarSlotTest(dateKey, hora);
    stats.responderia++;
    stats.diasSemana[fecha.diaSemana]++;
    stats.serviciosAceptados[servicio] = (stats.serviciosAceptados[servicio] || 0) + 1;

  } catch (err) {
    stats.crashes++;
    if (stats.errores.length < 5) stats.errores.push({ msg, error: err.message });
  }
}

// ─── REPORTE ──────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n);
const pct = (n) => `${((n / stats.total) * 100).toFixed(1)}%`;

console.log("━".repeat(50));
console.log(`  RESULTADOS — ${stats.total} requests`);
console.log("━".repeat(50));
console.log(`  ✅ Respondería       ${pad(stats.responderia,6)} ${pct(stats.responderia)}`);
console.log(`  ❌ Sin fecha         ${pad(stats.sinFecha,6)} ${pct(stats.sinFecha)}`);
console.log(`  ❌ Sin servicio      ${pad(stats.sinServicio,6)} ${pct(stats.sinServicio)}`);
console.log(`  ❌ Serv. no perm.    ${pad(stats.servicioNoPermitido,6)} ${pct(stats.servicioNoPermitido)}`);
console.log(`  ❌ No disponible     ${pad(stats.noDisponible,6)} ${pct(stats.noDisponible)}`);
console.log(`  ❌ Slot ocupado      ${pad(stats.slotOcupado,6)} ${pct(stats.slotOcupado)}`);
console.log(`  💥 Crashes           ${pad(stats.crashes,6)}`);

console.log("\n  Respuestas por día de semana:");
for (let d = 0; d <= 6; d++) {
  if (stats.diasSemana[d] > 0)
    console.log(`    ${DIAS_NOMBRE[d]}: ${stats.diasSemana[d]}`);
}

if (Object.keys(stats.serviciosAceptados).length > 0) {
  console.log("\n  Servicios aceptados:");
  Object.entries(stats.serviciosAceptados)
    .sort((a,b) => b[1]-a[1])
    .forEach(([s,n]) => console.log(`    ${pad(s,16)} ${n}`));
}

if (stats.crashes > 0) {
  console.log("\n  💥 Ejemplos de crashes:");
  stats.errores.forEach(({msg, error}) => console.log(`    "${msg}"\n    → ${error}`));
}

console.log("━".repeat(50));

// Verificaciones críticas
// Dom/Lun pueden responder SOLO si tienen override con horario en config — eso es correcto
let ok = true;
if (stats.crashes > 0) { console.log("  🚨 FALLA: hubo crashes"); ok = false; }

// Verificar que dom/lun sin override no respondieron
const overrides = CFG.overrides || {};
if (stats.diasSemana[0] > 0 || stats.diasSemana[1] > 0) {
  // Revisar que cada respuesta dom/lun tenga override válido
  let sinOverride = false;
  for (const [dateKey, times] of Object.entries(slotsTest)) {
    const parts = dateKey.split("/");
    const d = new Date(parseInt(parts[2]), parseInt(parts[1])-1, parseInt(parts[0]));
    const dow = d.getDay();
    if (dow === 0 || dow === 1) {
      const ovKey = `${parts[0]}/${parts[1]}`;
      const ov = overrides[ovKey];
      if (!ov || !ov.desde) { sinOverride = true; console.log(`  🚨 FALLA: respondió en ${dow===0?"Dom":"Lun"} ${ovKey} sin override`); ok = false; }
    }
  }
  if (!sinOverride && (stats.diasSemana[0] > 0 || stats.diasSemana[1] > 0)) {
    console.log(`  ℹ️  Dom/Lun con override habilitado: Dom=${stats.diasSemana[0]} Lun=${stats.diasSemana[1]} (correcto)`);
  }
}
if (ok) console.log("  ✔  Todas las verificaciones críticas OK");
console.log("━".repeat(50) + "\n");
