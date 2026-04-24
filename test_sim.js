/**
 * test_sim.js — Simulación realista: mensajes como los mandarían en el grupo
 * node test_sim.js
 */

const fs = require("fs");

// ── Copiar lógica de bot.js ────────────────────────────────────

const cfg = JSON.parse(fs.readFileSync("./config.json", "utf8"));

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
  "Aromatherapy":  ["aromatherapy", "aroma"],
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
const WB_KEYWORDS = new Set(["hol", "deep", "cali", "aroma", "cranio", "reflex", "ayur", "thai"]);
function detectarServicio(text) {
  const lower = text.toLowerCase();
  for (const [nombre, keywords] of Object.entries(SERVICIOS_KEYWORDS)) {
    if (keywords.some(k => WB_KEYWORDS.has(k)
      ? new RegExp("\\b" + k + "\\b").test(lower)
      : lower.includes(k))) return nombre;
  }
  return null;
}

function extraerHora(text) {
  const m = text.match(/[🕓⏱][\uFE0F]?\s*~?\s*(\d{1,2})(?:[:\.](\d{2}))?h?\b/);
  if (!m) return null;
  const h = parseInt(m[1]);
  const min = parseInt(m[2] || "0");
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const WEEKDAYS = {
  monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6,sunday:0,
  lunes:1,martes:2,miercoles:3,jueves:4,viernes:5,sabado:6,domingo:0
};
const MESES = {
  enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12,
  january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,
  jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12
};
const MESES_ES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DIAS     = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

function quitarAcentos(s) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

function extraerFecha(text) {
  const sinHora = text.replace(/[🕓⏱][\uFE0F]?.*$/gm, " ").replace(/#\S+/g, " ");
  const lower   = quitarAcentos(sinHora.toLowerCase());
  const now     = new Date(); now.setHours(0,0,0,0);
  if (/\b(today|hoy)\b/.test(lower)) return makeResult(new Date(now));
  if (/\b(tomorrow|manana)\b/.test(lower)) { const d=new Date(now); d.setDate(d.getDate()+1); return makeResult(d); }
  const wdM  = lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);
  const monM = lower.match(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/);
  const dnM  = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (monM && dnM) {
    const date = new Date(now.getFullYear(), MESES[monM[1]]-1, parseInt(dnM[1]));
    if (date < now) date.setFullYear(now.getFullYear()+1);
    return makeResult(date);
  }
  if (dnM) {
    const date = new Date(now.getFullYear(), now.getMonth(), parseInt(dnM[1]));
    if (date < now) date.setMonth(date.getMonth()+1);
    return makeResult(date);
  }
  if (wdM) {
    const dow = WEEKDAYS[wdM[1]]; if (dow===undefined) return null;
    const date = new Date(now);
    date.setDate(date.getDate() + (((dow-now.getDay()+7)%7)||7));
    return makeResult(date);
  }
  return null;
}
function makeResult(date) {
  return { date, diaSemana: date.getDay(),
    readable: `${date.getDate()} de ${MESES_ES[date.getMonth()]} ${date.getFullYear()}` };
}

// Slots en memoria para la simulación
let _slots = {};
function slotDateKey(date) {
  return String(date.getDate()).padStart(2,"0")+"/"+String(date.getMonth()+1).padStart(2,"0")+"/"+date.getFullYear();
}
function slotLibre(dateKey, horaMinutos, minGap) {
  if (horaMinutos===null) return true;
  return (_slots[dateKey]||[]).every(t => Math.abs(t-horaMinutos)>=minGap);
}
function reclamarSlot(dateKey, horaMinutos) {
  if (!_slots[dateKey]) _slots[dateKey]=[];
  _slots[dateKey].push(horaMinutos!==null ? horaMinutos : -1);
}

// ── Simulador ─────────────────────────────────────────────────

function simular(texto, mentionado = false) {
  const text = texto.trim();

  // ¿Es petición?
  if (!/petici[oó]n|request/i.test(text)) {
    return { responde: false, razon: "no es petición" };
  }
  // ¿Tiene @mención?
  if (mentionado) {
    return { responde: false, razon: "dirigida a otro terapeuta (@mención)" };
  }
  // ¿Servicio permitido?
  const servicio = detectarServicio(text);
  const permitidos = cfg.serviciosPermitidos || [];
  if (permitidos.length > 0 && (!servicio || !permitidos.includes(servicio))) {
    return { responde: false, razon: `servicio "${servicio||"desconocido"}" no permitido` };
  }
  // ¿Fecha reconocible?
  const fecha = extraerFecha(text);
  if (!fecha) {
    return { responde: false, razon: "no se pudo extraer fecha" };
  }
  // ¿Hora?
  const hora = extraerHora(text);
  // ¿Disponible ese día/horario?
  if (!estaDisponible(fecha, cfg, hora)) {
    const dd = String(fecha.date.getDate()).padStart(2,"0");
    const mm = String(fecha.date.getMonth()+1).padStart(2,"0");
    const ov = (cfg.overrides||{})[`${dd}/${mm}`];
    if (ov && (ov.bloqueado||ov.inactivo)) {
      return { responde: false, razon: `${fecha.readable} (${DIAS[fecha.diaSemana]}) está bloqueado`, fecha, hora };
    }
    const horStr = hora!==null ? `${Math.floor(hora/60)}:${String(hora%60).padStart(2,"0")}` : "flexible";
    return { responde: false, razon: `fuera de horario (${horStr}) o día inactivo`, fecha, hora };
  }
  // ¿Slot libre?
  const dateKey = slotDateKey(fecha.date);
  const minGap  = cfg.minGapMins || 90;
  if (!slotLibre(dateKey, hora, minGap)) {
    const horStr = hora!==null ? `${Math.floor(hora/60)}:${String(hora%60).padStart(2,"0")}` : "flexible";
    return { responde: false, razon: `slot ${horStr} ya ocupado (gap ${minGap}min)`, fecha, hora };
  }
  // Reclamar
  reclamarSlot(dateKey, hora);
  return { responde: true, razon: "✅ Puedo", fecha, hora, servicio };
}

function horStr(h) {
  if (h===null) return "flexible";
  return `${Math.floor(h/60)}:${String(h%60).padStart(2,"0")}`;
}

function correr(casos) {
  let ok=0, fail=0;
  for (const c of casos) {
    const r = simular(c.texto, c.mencion||false);
    const pass = r.responde === c.esperado;
    const icono = pass ? "✅" : "❌";
    const fechaInfo = r.fecha ? ` | ${r.fecha.readable} (${DIAS[r.fecha.diaSemana]}) ${horStr(r.hora)}` : "";
    const servicioInfo = r.servicio ? ` | ${r.servicio}` : "";
    console.log(`${icono} ${c.label}`);
    if (!pass || process.env.VERBOSE) {
      console.log(`   → ${r.razon}${fechaInfo}${servicioInfo}`);
    }
    if (pass) ok++; else fail++;
  }
  return { ok, fail };
}

// ── CASOS ─────────────────────────────────────────────────────

console.log("\n═══ DEBERÍA RESPONDER ══════════════════════════════════");
const { ok: ok1, fail: fail1 } = correr([
  { esperado: true,  label: "Holistic domingo típico",
    texto: "*request*\nSunday April 5 🕓11:00\n60' Holistic\n#3 Sarah" },

  { esperado: true,  label: "Deep Tissue lunes con abrev",
    texto: "*request*\nMonday April 6 ⏱️10h\n90' deep\n#7 Marta" },

  { esperado: true,  label: "Facial martes a las 9",
    texto: "*Petición*\nTuesday April 7 🕓9:00\nFacial\n#5 Jana" },

  { esperado: true,  label: "Body Bliss miércoles",
    texto: "*request*\nWednesday April 8 🕓12:00\nBody Bliss 60'\n#2 Sofia" },

  { esperado: true,  label: "Hora flexible domingo",
    texto: "*request*\nSunday April 5\nHolistic 90'\n#1 Lena" },

  { esperado: true,  label: "Californian con 'cali'",
    texto: "*request*\nMonday April 13 🕓10:30\n90' cali\n#EXT Marzena" },

  { esperado: true,  label: "Reflexology con 'reflex'",
    texto: "*request*\nTuesday April 14 🕓11:00\nreflex 60'\n#4 Birgit" },

  { esperado: true,  label: "Shoulders lunes diferente",
    texto: "*request*\nMonday April 20 ⏱️12h\n30' Shoulders\n#gift voucher Carolin" },

  { esperado: true,  label: "Miércoles con formato español",
    texto: "*Petición*\nMiercoles 8 🕓10:00\nHolistic 60'\n#6 Irene" },

  { esperado: true,  label: "Sábado 02/04 hasta 18h (override especial)",
    texto: "*request*\nSaturday April 2 🕓16:00\nHolistic 60'\n#9 Chantelle" },
]);

console.log("\n═══ NO DEBERÍA RESPONDER ═══════════════════════════════");
const { ok: ok2, fail: fail2 } = correr([
  { esperado: false, label: "Jueves → gris (no disponible)",
    texto: "*request*\nThursday April 9 🕓11:00\n60' Holistic\n#3 Sarah" },

  { esperado: false, label: "Viernes → gris",
    texto: "*request*\nFriday April 10 🕓10:00\nHolistic 60'\n#5 Jana" },

  { esperado: false, label: "Sábado → gris (sin override)",
    texto: "*request*\nSaturday June 6 🕓11:00\nHolistic 60'\n#2 Julia" },

  { esperado: false, label: "Fuera de horario (14:00 cuando cierra a 13:05)",
    texto: "*request*\nMonday April 6 🕓14:00\nFacial\n#7 Daniela" },

  { esperado: false, label: "Antes de horario (8:00)",
    texto: "*request*\nTuesday April 7 🕓8:00\nHolistic 60'\n#3 Anna" },

  { esperado: false, label: "Día bloqueado 03/04 (jueves bloqueado explícito)",
    texto: "*request*\nThursday April 3 🕓11:00\nHolistic 60'\n#8 Vende" },

  { esperado: false, label: "Servicio no permitido (Reiki)",
    texto: "*request*\nMonday April 6 🕓10:00\n60' Reiki\n#4 Birgit" },

  { esperado: false, label: "Servicio no permitido (Shamanic)",
    texto: "*request*\nSunday April 5 🕓11:00\nShamanic\n#TH Lila" },

  { esperado: false, label: "Sin servicio reconocible",
    texto: "*request*\nMonday April 6 🕓11:00\n60' massage\n#2 Lisa" },

  { esperado: false, label: "No es petición (mensaje normal)",
    texto: "Buenas, hay alguien libre el lunes?" },

  { esperado: false, label: "Con @mención a otro terapeuta",
    texto: "*request*\nMonday April 6 🕓11:00\nHolistic 60'\n#3 Sarah",
    mencion: true },
]);

console.log("\n═══ ANTI-DOBLE RESERVA ═════════════════════════════════");
_slots = {}; // reset
const casos3 = [
  { esperado: true,  label: "Primera petición domingo 11:00 → acepta",
    texto: "*request*\nSunday April 5 🕓11:00\nHolistic 60'\n#3 Sarah" },

  { esperado: false, label: "Segunda petición misma hora (masaje pareja) → rechaza",
    texto: "*request*\nSunday April 5 🕓11:00\nHolistic 60'\n#9 Chantelle" },

  { esperado: false, label: "Misma mañana, 89 min antes (9:31) → rechaza por gap",
    texto: "*request*\nSunday April 5 🕓9:31\nHolistic 60'\n#1 Lena" },

  { esperado: true,  label: "Misma mañana, 90 min antes (9:30) → acepta",
    texto: "*request*\nSunday April 5 🕓9:30\nBody Bliss 60'\n#5 Jana" },

  { esperado: true,  label: "Otro día diferente misma hora → acepta",
    texto: "*request*\nMonday April 6 🕓11:00\nHolistic 60'\n#7 Marta" },
];
const { ok: ok3, fail: fail3 } = correr(casos3);

// ── Resumen ────────────────────────────────────────────────────
const totalOk   = ok1 + ok2 + ok3;
const totalFail = fail1 + fail2 + fail3;
const total     = totalOk + totalFail;
console.log(`\n${"═".repeat(55)}`);
console.log(`📊 ${totalOk}/${total} ok, ${totalFail} fallidos`);
if (totalFail === 0) console.log("🟢 Todo correcto\n");
else console.log("🔴 Hay errores\n");
