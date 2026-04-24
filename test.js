/**
 * test.js — Prueba el parser de fechas y detección de peticiones
 * sin necesitar WhatsApp. Correr con: node test.js
 */

// ── Copiar las funciones de bot.js ────────────────────────────

const WEEKDAYS = {
  monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6, sunday:0,
  lunes:1, martes:2, miercoles:3, jueves:4, viernes:5, sabado:6, domingo:0
};

const MESES = {
  enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6,
  julio:7, agosto:8, septiembre:9, octubre:10, noviembre:11, diciembre:12,
  january:1, february:2, march:3, april:4, may:5, june:6,
  july:7, august:8, september:9, october:10, november:11, december:12,
  jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12
};

const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio',
                  'julio','agosto','septiembre','octubre','noviembre','diciembre'];

const DIAS = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

function quitarAcentos(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function extraerFecha(text) {
  const sinHora = text.replace(/[🕓⏱][\uFE0F]?.*$/gm, ' ');
  const lower = quitarAcentos(sinHora.toLowerCase());

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (/\b(today|hoy)\b/.test(lower)) return makeResult(new Date(now));

  if (/\b(tomorrow|manana)\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return makeResult(d);
  }

  const weekdayMatch = lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);
  const monthMatch   = lower.match(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/);
  const dayNumMatch  = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);

  if (monthMatch && dayNumMatch) {
    const mes = MESES[monthMatch[1]];
    const dia = parseInt(dayNumMatch[1]);
    const date = new Date(now.getFullYear(), mes - 1, dia);
    if (date < now) date.setFullYear(now.getFullYear() + 1);
    return makeResult(date);
  }

  if (dayNumMatch) {
    const dia = parseInt(dayNumMatch[1]);
    const date = new Date(now.getFullYear(), now.getMonth(), dia);
    if (date < now) date.setMonth(date.getMonth() + 1);
    return makeResult(date);
  }

  if (weekdayMatch) {
    const targetDow = WEEKDAYS[weekdayMatch[1]];
    if (targetDow === undefined) return null;
    const date = new Date(now);
    const diff = ((targetDow - now.getDay() + 7) % 7) || 7;
    date.setDate(date.getDate() + diff);
    return makeResult(date);
  }

  return null;
}

function makeResult(date) {
  return {
    date,
    diaSemana: date.getDay(),
    readable: `${date.getDate()} de ${MESES_ES[date.getMonth()]} ${date.getFullYear()}`
  };
}

// ── Casos de prueba ───────────────────────────────────────────

const casos = [
  { n:1,  texto: "*request*\nSunday🕓19:00\n90' Holistic\n#EXT Marzena" },
  { n:2,  texto: "*request*\nSaturday April 27\n30' Holistic\n#EXT Kerstin" },
  { n:3,  texto: "*request*\nSaturday April 27🕓11:45👈🏽\n30' Holistic\n#EXT Kerstin" },
  { n:4,  texto: "*request*\nSunday April 7 🕓11:30\nDeep 90'\n#2 Barbara" },
  { n:7,  texto: "*request*\nSunday April 7th 🕓15:00\n60' Holistic\n#9 Chantelle" },
  { n:8,  texto: "*request*\nSunday March 3 🕓 11:30\nFacial\n#7 Jana" },
  { n:9,  texto: "*request*\nTuesday, Feb 20 🕓12:00\nAromatherapy\n#7 Daniela" },
  { n:10, texto: "*Request*\nLunes 19 🕓11:00\nHolistic 60'\n#8 Vende" },
  { n:13, texto: "*request*\nToday🕓flexible until 15:30\nDeep 60'\n#9 Suzanne" },
  { n:14, texto: "*request*\nToday🕓13:00👀\nDeep 60'\n#9 Suzanne" },
  { n:15, texto: "*request*\nHolistic 60' Hoy 🕓11:30!!\n#1 Tekla" },
  { n:16, texto: "*request*\nMonday 19 🕓flexible de 11-15h\n60' Deep\n#12 Lisa" },
  { n:22, texto: "*request*\nTuesday🕓12👀\nCalifornian 90'\n#TH Lila" },
  { n:23, texto: "*request*\nMonday, March 1 🕓 12:00👀\nTHAI\n#TH Lila" },
  { n:27, texto: "*request*\nJueves🕓11:00\nHolistic 60'\n#6 Irene" },
  { n:30, texto: "*request*\nSunday, March 17🕓11:00\nHolistic 60'\n#Nicola" },
  { n:38, texto: "*Request*\nMonday 26 ⏱️ 14h\n60' Deep Tissue\n#14 Kirsten" },
  { n:39, texto: "*Request*\nSaturday 24 ⏱️10h\nHolistic 90'\n#2 Julia" },
  { n:40, texto: "*Request*\nSaturday 24 ⏱️11.45h\nHolistic 90'\n#2 Julias mother" },
  { n:41, texto: "*Petición*\nTuesday 27 ⏱️ 10.15h\n90' Holistic\n#Carmen Ext" },
  { n:42, texto: "*Petición*\nMañana 23 ⏱️16h\nFacial clay mask\n#10 Ryan" },
  { n:43, texto: "*Peticion*\nMañana 23 ⏱️ ~17h\nBody Bliss\n#10 Sofie" },
  { n:44, texto: "*request*\nTomorrow🕓flexible until 15\n60' Holistic\n#11 Katinka" },
  { n:47, texto: "*request*\nFriday, April 26th 🕓 11:00\n30' Holistic\n#day pass Marie" },
  { n:50, texto: "*request*\nThursday 29th🕓 12:00\n30' Shoulders\n#gift voucher Carolin" },
];

// ── Correr tests ──────────────────────────────────────────────

let ok = 0, fail = 0;

for (const caso of casos) {
  const esPeticion = /petici[oó]n|request/i.test(caso.texto);
  const fecha = extraerFecha(caso.texto);
  const diaNombre = fecha ? DIAS[fecha.diaSemana] : "?";
  const status = (esPeticion && fecha) ? "✅" : "❌";

  if (esPeticion && fecha) ok++; else fail++;

  console.log(`${status} #${String(caso.n).padStart(2)} | peticion:${esPeticion ? "✓" : "✗"} | fecha: ${fecha ? `${fecha.readable} (${diaNombre})` : "NO DETECTADA"}`);
}

console.log(`\n📊 ${ok}/${casos.length} ok, ${fail} fallidos`);
