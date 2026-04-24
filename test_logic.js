/**
 * test_logic.js — Prueba slots, disponibilidad y servicios
 * node test_logic.js
 */

// ── Copiar lógica de bot.js ────────────────────────────────────

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

function makeFecha(dateObj) {
  return { date: dateObj, diaSemana: dateObj.getDay() };
}

// Slots
let _slots = {};
function slotLibre(dateKey, horaMinutos, minGap) {
  if (horaMinutos === null) return true;
  return (_slots[dateKey] || []).every(t => Math.abs(t - horaMinutos) >= minGap);
}
function reclamarSlot(dateKey, horaMinutos) {
  if (!_slots[dateKey]) _slots[dateKey] = [];
  _slots[dateKey].push(horaMinutos !== null ? horaMinutos : -1);
}
function resetSlots() { _slots = {}; }

// Servicios
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

function extraerFechaSimple(text) {
  const sinHora = text.replace(/[🕓⏱][\uFE0F]?.*$/gm, " ")
                      .replace(/#.*$/gm, " ")
                      .replace(/\d+\s*[''`´]/g, " ")
                      .replace(/\d+\s*min\b/gi, " ");
  return sinHora;
}

function extraerHora(text) {
  const m = text.match(/[🕓⏱][\uFE0F]?\s*~?\s*(\d{1,2})(?:[:\.](\d{2}))?h?\b/);
  if (m) {
    const h = parseInt(m[1]), min = parseInt(m[2] || "0");
    if (h <= 23 && min <= 59) return h * 60 + min;
  }
  if (!/[🕓⏱]/.test(text)) {
    const t = text.match(/\b(\d{1,2}):(\d{2})\b/) ||
              text.match(/\b(\d{1,2})\s*hs?\b/i);
    if (t) {
      const h = parseInt(t[1]), min = parseInt(t[2] || "0");
      if (h <= 23 && min <= 59) return h * 60 + min;
    }
  }
  return null;
}

// ── Helpers ───────────────────────────────────────────────────
let ok = 0, fail = 0;
function assert(desc, got, expected) {
  const pass = JSON.stringify(got) === JSON.stringify(expected);
  console.log(`${pass ? "✅" : "❌"} ${desc}`);
  if (!pass) console.log(`   esperado: ${JSON.stringify(expected)} | obtenido: ${JSON.stringify(got)}`);
  if (pass) ok++; else fail++;
}

// ── CONFIG base ────────────────────────────────────────────────
const cfg = {
  botActivo: true,
  disponible: {
    "0": { desde: "09:00", hasta: "18:00" }, // Dom
    "2": { desde: "08:00", hasta: "13:00" }, // Mar
    "3": { desde: "08:00", hasta: "13:00" }, // Mié
    "4": { desde: "08:00", hasta: "18:00" }, // Jue
    "5": { desde: "08:00", hasta: "13:00" }, // Vie
    "6": { desde: "08:00", hasta: "13:00" }, // Sáb
  },
  overrides: {
    "27/03": { bloqueado: true },
    "28/03": { bloqueado: true },
    "29/03": { bloqueado: true },
    "15/04": { desde: "10:00", hasta: "16:00" }, // horario personalizado
  },
  serviciosPermitidos: ["Holistic", "Facial", "Body Bliss"],
  minGapMins: 90,
};

console.log("\n── DISPONIBILIDAD ──────────────────────────────────────");

// Día disponible en template (Jueves = 4)
assert("Jue 26/03 a las 10:00 → disponible",
  estaDisponible(makeFecha(new Date(2026,2,26)), cfg, 10*60), true);

// Fuera de horario
assert("Jue 26/03 a las 07:00 → no disponible (antes de 08:00)",
  estaDisponible(makeFecha(new Date(2026,2,26)), cfg, 7*60), false);

assert("Mar 24/03 a las 14:00 → no disponible (después de 13:00)",
  estaDisponible(makeFecha(new Date(2026,3,14)), cfg, 14*60), false);

// Día no en template (Lunes = 1)
assert("Lun 30/03 → no disponible (Lunes no está en template)",
  estaDisponible(makeFecha(new Date(2026,2,30)), cfg, 10*60), false);

// Override bloqueado
assert("27/03 → bloqueado por override",
  estaDisponible(makeFecha(new Date(2026,2,27)), cfg, 10*60), false);

assert("28/03 → bloqueado por override",
  estaDisponible(makeFecha(new Date(2026,2,28)), cfg, 10*60), false);

// Override con horario personalizado
assert("15/04 a las 11:00 → disponible (horario custom 10-16)",
  estaDisponible(makeFecha(new Date(2026,3,15)), cfg, 11*60), true);

assert("15/04 a las 09:00 → no disponible (antes del custom 10:00)",
  estaDisponible(makeFecha(new Date(2026,3,15)), cfg, 9*60), false);

assert("15/04 a las 17:00 → no disponible (después del custom 16:00)",
  estaDisponible(makeFecha(new Date(2026,3,15)), cfg, 17*60), false);

// Hora flexible (null)
assert("Hora flexible → siempre disponible si el día está activo",
  estaDisponible(makeFecha(new Date(2026,2,26)), cfg, null), true);

console.log("\n── SLOTS / DOBLE RESERVA ───────────────────────────────");

const GAP = 90;
const KEY = "26/03/2026";

resetSlots();
assert("Slot vacío → libre", slotLibre(KEY, 10*60, GAP), true);

reclamarSlot(KEY, 10*60); // reserva 10:00
assert("Misma hora 10:00 → bloqueado", slotLibre(KEY, 10*60, GAP), false);
assert("10:00 + 89 min (11:29) → bloqueado (< gap 90)",
  slotLibre(KEY, 10*60+89, GAP), false);
assert("10:00 + 90 min (11:30) → libre (= gap exacto)",
  slotLibre(KEY, 10*60+90, GAP), true);
assert("10:00 + 91 min (11:31) → libre",
  slotLibre(KEY, 10*60+91, GAP), true);
assert("10:00 - 90 min (08:30) → libre (gap exacto hacia atrás)",
  slotLibre(KEY, 10*60-90, GAP), true);
assert("10:00 - 89 min → bloqueado",
  slotLibre(KEY, 10*60-89, GAP), false);

// Dos slots en el mismo día
reclamarSlot(KEY, 14*60); // reserva 14:00
assert("Hora 13:30 → bloqueada (30 min antes de 14:00, dentro del gap)",
  slotLibre(KEY, 13*60+30, GAP), false);
assert("Hora 16:00 → libre (90 min después de 14:00)",
  slotLibre(KEY, 16*60, GAP), true);
assert("Hora 08:30 → libre (90 min antes de 10:00)",
  slotLibre(KEY, 8*60+30, GAP), true);

// Masaje de pareja — dos peticiones al mismo horario
resetSlots();
const KEY2 = "01/04/2026";
assert("Primera petición 11:00 → slot libre", slotLibre(KEY2, 11*60, GAP), true);
reclamarSlot(KEY2, 11*60);
assert("Segunda petición 11:00 mismo día → BLOQUEADO (masaje pareja)",
  slotLibre(KEY2, 11*60, GAP), false);

// Flexible
resetSlots();
assert("Hora null (flexible) → siempre libre", slotLibre(KEY, null, GAP), true);

console.log("\n── SERVICIOS ───────────────────────────────────────────");

assert("'Holistic 60' → Holistic", detectarServicio("Holistic 60'"), "Holistic");
assert("'hol 90'' (abrev) → Holistic", detectarServicio("*request*\nhol 90'\n#2 Julia"), "Holistic");
assert("'deep tissue' → Deep Tissue", detectarServicio("deep tissue 60'"), "Deep Tissue");
assert("'deep' (abrev) → Deep Tissue", detectarServicio("60' Deep\n#12 Lisa"), "Deep Tissue");
assert("'cali' → Californian", detectarServicio("Californian 90' cali"), "Californian");
assert("'reflex' → Reflexology", detectarServicio("reflex 30'"), "Reflexology");
assert("'cranio' → Craniosacral", detectarServicio("cranio 60'"), "Craniosacral");
assert("'ayur' → Ayurvedic", detectarServicio("ayur 90'"), "Ayurvedic");
assert("'sound healing' → Sound Healing", detectarServicio("Sound Healing 45'"), "Sound Healing");
assert("'facial clay mask' → Facial", detectarServicio("Facial clay mask"), "Facial");
assert("'Body Bliss' → Body Bliss", detectarServicio("Body Bliss 90'"), "Body Bliss");
assert("'THAI' mayúsculas → Thai", detectarServicio("THAI 60'"), "Thai");
assert("'hotel' NO es Holistic", detectarServicio("hotel holistic"), "Holistic"); // "holistic" substring sí
assert("'holiday' NO es Holistic", detectarServicio("holiday this week"), null);
assert("'reiki' → Reiki", detectarServicio("reiki 30'"), "Reiki");
assert("Sin servicio → null", detectarServicio("masaje relajante"), null);

// Word boundary: no falsos positivos
assert("'holiday' NO es Holistic (word boundary)", detectarServicio("holiday trip"), null);
assert("'hol\\n' al final de línea → Holistic", detectarServicio("60' hol\n#2 Julia"), "Holistic");
assert("'hol'' antes de comilla → Holistic", detectarServicio("90' hol'"), "Holistic");
assert("'holistic' sigue matcheando", detectarServicio("Holistic 60'"), "Holistic");
assert("'alcohol' NO es Holistic", detectarServicio("alcohol massage"), null);
assert("'Aromatherapia' (español) → Aromatherapy", detectarServicio("Aromatherapia 60'"), "Aromatherapy");
assert("'aromaterapia' (español sin h) → Aromatherapy", detectarServicio("aromaterapia"), "Aromatherapy");
assert("'aroma' abrev → Aromatherapy", detectarServicio("aroma 60'"), "Aromatherapy");

console.log("\n── FILTRO SERVICIOS PERMITIDOS ─────────────────────────");

function puedeResponder(text, permitidos) {
  const s = detectarServicio(text);
  if (permitidos.length === 0) return true;
  return s !== null && permitidos.includes(s);
}

const perm = ["Holistic", "Facial", "Body Bliss"];
assert("Holistic → permitido", puedeResponder("Holistic 60'", perm), true);
assert("Deep Tissue → NO permitido", puedeResponder("deep tissue 60'", perm), false);
assert("Body Bliss → permitido", puedeResponder("Body Bliss 90'", perm), true);
assert("Sin servicio reconocible → NO responde", puedeResponder("masaje 60'", perm), false);
assert("Lista vacía → responde a todo", puedeResponder("Reiki 30'", []), true);

console.log("\n── STRIP #TAGS EN FECHA ────────────────────────────────");

// Verificar que #9 no se confunde con día del mes
var stripped = extraerFechaSimple("*request*\nToday🕓13:00\nDeep 60'\n#9 Suzanne");
assert("#9 eliminado del texto", stripped.includes("#9"), false);
var stripped2 = extraerFechaSimple("*request*\nSunday April 7🕓11:30\nHolistic 60'\n#2 Barbara");
assert("#2 eliminado del texto", stripped2.includes("#2"), false);
var stripped3 = extraerFechaSimple("*request*\nTuesday🕓12\nCalifornian 90'\n#TH Lila");
assert("#TH eliminado del texto", stripped3.includes("#TH"), false);
// Duraciones eliminadas antes de buscar fecha
var stripped4 = extraerFechaSimple("Peticion\nAromatherapia 60`\nElke # 6\nViernes 27 Marzo\n11:00");
assert("'60`' eliminado (no confundir con día)", stripped4.includes("60"), false);
var stripped5 = extraerFechaSimple("*request*\nSunday April 7 🕓11:30\nDeep 90'\n#2 Barbara");
assert("'90'' eliminado", stripped5.includes("90"), false);

console.log("\n── EXTRAER HORA ────────────────────────────────────────");

assert("🕓11:00 → 660", extraerHora("*request*\nSunday🕓11:00"), 660);
assert("🕓 12:00 (espacio) → 720", extraerHora("Sunday March 17🕓 12:00"), 720);
assert("⏱️ 14h → 840", extraerHora("Monday 26 ⏱️ 14h"), 840);
assert("⏱️11.45h → 705", extraerHora("Saturday 24 ⏱️11.45h"), 705);
assert("⏱️ 10.15h → 615", extraerHora("Tuesday 27 ⏱️ 10.15h"), 615);
assert("⏱️ ~17h (tilde) → 1020", extraerHora("Mañana 23 ⏱️ ~17h"), 1020);
assert("🕓flexible until 15 → null (no número directo)", extraerHora("Today🕓flexible until 15:30"), null);
assert("Sin emoji → null", extraerHora("Sunday April 7"), null);
// Sin emoji de reloj — fallback HH:MM
assert("11:00 sin emoji → 660", extraerHora("Peticion\nAromatherapia 60'\nElke #6\nViernes 27 Marzo\n11:00"), 660);
assert("9:30 sin emoji → 570",  extraerHora("request\nHolistic 60'\nMonday\n9:30"), 570);
assert("Sin emoji y sin hora → null", extraerHora("request\nHolistic 60'\nMonday"), null);
// Si hay emoji pero dice "flexible", no usa fallback
assert("🕓flexible until 15:30 → null (no extrae 15:30)", extraerHora("Today🕓flexible until 15:30\nDeep 60'"), null);
assert("'16 hs' sin emoji → 960",  extraerHora("Peticion\nAromatherapia 60`\nViernes 27 Mayo\n16 hs"), 960);
assert("'9h' sin emoji → 540",     extraerHora("Peticion\nHolistic 60'\nMonday\n9h"), 540);
assert("'16h' sin emoji → 960",    extraerHora("request\nDeep 90'\nTuesday\n16h"), 960);

console.log(`\n📊 ${ok}/${ok+fail} ok, ${fail} fallidos\n`);
