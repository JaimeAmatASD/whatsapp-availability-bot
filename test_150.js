/**
 * test_150.js — Simula los 150 requests reales
 * node test_150.js
 */

const fs = require("fs");
const cfg = JSON.parse(fs.readFileSync("./config.json", "utf8"));

// ── Lógica copiada de bot.js ───────────────────────────────────

function timeToMins(str) {
  const [h, m = "0"] = str.split(":");
  return parseInt(h) * 60 + parseInt(m);
}
function estaDisponible(fecha, cfg, horaMinutos) {
  const dd = String(fecha.date.getDate()).padStart(2,"0");
  const mm = String(fecha.date.getMonth()+1).padStart(2,"0");
  const key = `${dd}/${mm}`;
  const ov  = (cfg.overrides||{})[key];
  if (ov) {
    if (ov.bloqueado || ov.inactivo) return false;
    if (ov.desde && ov.hasta) {
      if (horaMinutos !== null)
        if (horaMinutos < timeToMins(ov.desde) || horaMinutos > timeToMins(ov.hasta)) return false;
      return true;
    }
  }
  const horario = cfg.disponible[String(fecha.diaSemana)];
  if (!horario) return false;
  if (horaMinutos !== null)
    if (horaMinutos < timeToMins(horario.desde) || horaMinutos > timeToMins(horario.hasta)) return false;
  return true;
}
const SERVICIOS_KEYWORDS = {
  "Holistic":["holistic","hol"],"Deep Tissue":["deep tissue","deep"],
  "Aromatherapy":["aromatherapy","aroma"],"Facial":["facial"],"Body Bliss":["body bliss"],
  "Reiki":["reiki"],"Californian":["californian","cali"],"Thai":["thai"],
  "Craniosacral":["craniosacral","cranio"],"Reflexology":["reflexology","reflex"],
  "Shamanic":["shamanic"],"Shoulders":["shoulders","shoulder"],
  "Sound Healing":["sound healing"],"Ayurvedic":["ayurvedic","ayur"],
};
const WB = new Set(["hol","deep","cali","aroma","cranio","reflex","ayur","thai"]);
function detectarServicio(text) {
  const lower = text.toLowerCase();
  for (const [n, ks] of Object.entries(SERVICIOS_KEYWORDS))
    if (ks.some(k => WB.has(k) ? new RegExp("\\b"+k+"\\b").test(lower) : lower.includes(k))) return n;
  return null;
}
function extraerHora(text) {
  const m = text.match(/[🕓⏱][\uFE0F]?\s*~?\s*(\d{1,2})(?:[:\.](\d{2}))?h?\b/);
  if (!m) return null;
  const h = parseInt(m[1]), min = parseInt(m[2]||"0");
  if (h > 23 || min > 59) return null;
  return h*60+min;
}
const WEEKDAYS={monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6,sunday:0,lunes:1,martes:2,miercoles:3,jueves:4,viernes:5,sabado:6,domingo:0};
const MESES={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12,january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
const MESES_ES=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DIAS=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
function quitarAcentos(s){return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"");}
function extraerFecha(text) {
  const sinHora = text.replace(/[🕓⏱][\uFE0F]?.*$/gm," ").replace(/#\S+/g," ");
  const lower   = quitarAcentos(sinHora.toLowerCase());
  const now = new Date(); now.setHours(0,0,0,0);
  if (/\b(today|hoy)\b/.test(lower)) return makeResult(new Date(now));
  if (/\b(tomorrow|manana)\b/.test(lower)){const d=new Date(now);d.setDate(d.getDate()+1);return makeResult(d);}
  const wdM  = lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);
  const monM = lower.match(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/);
  const dnM  = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (monM && dnM){const date=new Date(now.getFullYear(),MESES[monM[1]]-1,parseInt(dnM[1]));if(date<now)date.setFullYear(now.getFullYear()+1);return makeResult(date);}
  if (dnM){const date=new Date(now.getFullYear(),now.getMonth(),parseInt(dnM[1]));if(date<now)date.setMonth(date.getMonth()+1);return makeResult(date);}
  if (wdM){const dow=WEEKDAYS[wdM[1]];if(dow===undefined)return null;const date=new Date(now);date.setDate(date.getDate()+(((dow-now.getDay()+7)%7)||7));return makeResult(date);}
  return null;
}
function makeResult(date){return{date,diaSemana:date.getDay(),readable:`${date.getDate()} de ${MESES_ES[date.getMonth()]} ${date.getFullYear()}`};}

let _slots = {};
function slotDateKey(date){return String(date.getDate()).padStart(2,"0")+"/"+String(date.getMonth()+1).padStart(2,"0")+"/"+date.getFullYear();}
function slotLibre(key,h,gap){if(h===null)return true;return(_slots[key]||[]).every(t=>Math.abs(t-h)>=gap);}
function reclamarSlot(key,h){if(!_slots[key])_slots[key]=[];_slots[key].push(h!==null?h:-1);}

function hStr(h){if(h===null)return"flex";return`${Math.floor(h/60)}:${String(h%60).padStart(2,"0")}`;}

function simular(texto) {
  if (!/petici[oó]n|request/i.test(texto))
    return { responde:false, razon:"no es petición" };
  const servicio = detectarServicio(texto);
  const permitidos = cfg.serviciosPermitidos||[];
  if (permitidos.length>0 && (!servicio||!permitidos.includes(servicio)))
    return { responde:false, razon:`servicio no permitido (${servicio||"?"})` };
  const fecha = extraerFecha(texto);
  if (!fecha) return { responde:false, razon:"sin fecha" };
  const hora = extraerHora(texto);
  if (!estaDisponible(fecha,cfg,hora)){
    const dd=String(fecha.date.getDate()).padStart(2,"0");
    const mm=String(fecha.date.getMonth()+1).padStart(2,"0");
    const ov=(cfg.overrides||{})[`${dd}/${mm}`];
    if(ov&&(ov.bloqueado||ov.inactivo)) return{responde:false,razon:`bloqueado`,fecha,hora};
    return{responde:false,razon:`fuera horario/día`,fecha,hora};
  }
  const dateKey = slotDateKey(fecha.date);
  const gap = cfg.minGapMins||90;
  if (!slotLibre(dateKey,hora,gap))
    return{responde:false,razon:`slot ocupado`,fecha,hora,servicio};
  reclamarSlot(dateKey,hora);
  return{responde:true,razon:"Puedo",fecha,hora,servicio};
}

// ── 150 requests ──────────────────────────────────────────────

const requests = [
  `*request*\nSunday🕓19:00\n90' Holistic\n#EXT Marzena Pryzmont`,
  `*request*\nSaturday April 27🕓11:45\n30' Holistic\n#EXT Kerstin Franke`,
  `*request*\nSunday April 7 🕓11:30\nDeep 90'\n#2 Barbara Köhler`,
  `*request*\nSunday April 7 🕓13:15\nDeep 90'\n#2 Leonor Häner`,
  `*request*\nSunday April 7th 🕓15:00\n60' Holistic\n#9 Chantelle`,
  `*request*\nSunday March 3 🕓11:30\nFacial\n#7 Jana`,
  `*request*\nTuesday, Feb 20 🕓12:00\nAromatherapy\n#7 Daniela`,
  `*request*\nLunes 19 🕓11:00\nHolistic 60'\n#8 Vende`,
  `*request*\nSunday Feb 25 🕓11:00\nBody Bliss\n#1 Sophie`,
  `*request*\nToday🕓flexible until 15:30\nDeep 60'\n#9 Suzanne`,
  `*request*\nToday🕓13:00\nDeep 60'\n#9 Suzanne`,
  `*request*\nHolistic 60' Hoy 🕓11:30\n#1 Tekla`,
  `*request*\nMonday 19 🕓11:00\n60' Deep\n#12 Lisa`,
  `*request*\nWednesday 21 🕓12:30\nReiki\n#12 Lisa`,
  `*request*\nFriday 23🕓11:00\nFacial\n#12 Lisa`,
  `*request*\nFriday 23 🕓12:15\nHolistic 60'\n#ext Dragana 1`,
  `*request*\nFriday 23 🕓12:15\nHolistic 60'\n#ext Dragana 2`,
  `*request*\nTuesday🕓12:00\nCalifornian 90'\n#TH Lila`,
  `*request*\nMonday, March 1 🕓12:00\nTHAI\n#TH Lila`,
  `*request*\nTuesday 27 🕓11:00\n90' Californian\n#1 Elsa`,
  `*request*\nMonday 26 🕓18:00\n60' Deep\n#1 Elsa`,
  `*request*\nToday! 🕓12:15\nDeep 60'\n#12 Hanne`,
  `*request*\nJueves🕓11:00\nHolistic 60'\n#6 Irene`,
  `*request*\nMonday, Feb 26 🕓11:00\nDeep 60'\n#7 Britta`,
  `*request*\nMonday, Feb 26 🕓12:15\nDeep 60'\n#7 Anna`,
  `*request*\nSunday, March 17🕓11:00\nHolistic 60'\n#Nicola`,
  `*request*\nTuesday 27 🕓13:45\nBody Bliss\n#1 Sophie`,
  `*request*\nThursday 22 🕓12:15\nAromatherapy\n#8 Bente`,
  `*request*\nFriday 23 🕓13:45\nDeep 60'\n#TH Lila`,
  `*request*\nHoy🕓flexible\n30' shoulders\n#1 Eylem`,
  `*request*\nMonday 26 🕓11:00\nHolistic 60'\n#Christine`,
  `*request*\nMonday 26 🕓12:15\nHolistic 60'\n#Christine 2`,
  `*request*\nMonday 26 ⏱️14h\n60' Deep Tissue\n#14 Kirsten`,
  `*request*\nSaturday 24 ⏱️10h\nHolistic 90'\n#2 Julia`,
  `*request*\nSaturday 24 ⏱️11.45h\nHolistic 90'\n#2 Julia mother`,
  `*request*\nTuesday 27 ⏱️15.30h\n90' Holistic\n#Carmen`,
  `*request*\nMañana 23 ⏱️16h\nFacial clay mask\n#10 Ryan`,
  `*request*\nMañana 23 ⏱️17.15h\nBody Bliss\n#10 Sofie`,
  `*request*\nTomorrow🕓12:45\n60' Holistic\n#11 Katinka`,
  `*request*\nTomorrow🕓12:45\n60' Holistic\n#11 Anne`,
  `*request*\nMonday 26 🕓13:30\nDeep 90'\n#12 Hanne`,
  `*request*\nFriday, April 26th 🕓11:00\n30' Holistic\n#Marie`,
  `*request*\nFriday, April 26th 🕓11:45\n30' Holistic\n#Marie`,
  `*request*\nFriday, April 26th 🕓12:30\n30' Holistic\n#Marie`,
  `*request*\nThursday 29th🕓12:00\n30' Shoulders\n#Carolin`,
  `*request*\nToday🕓16:30\nDeep 60'\n#Client Laura`,
  `*request*\nTomorrow🕓11:00\nHolistic 60'\n#Client Anna`,
  `*request*\nFriday🕓14:15\nFacial\n#Client Sofia`,
  `*request*\nMonday🕓10:30\nReiki\n#Client Marta`,
  `*request*\nTuesday🕓13:00\nBody Bliss\n#Client Elena`,
  `*request*\nToday🕓17:00\nDeep 90'\n#Client Pablo`,
  `*request*\nTomorrow🕓09:45\nHolistic 60'\n#Client Luis`,
  `*request*\nWednesday🕓12:00\nFacial\n#Client Nora`,
  `*request*\nThursday🕓15:30\nAromatherapy\n#Client Alba`,
  `*request*\nFriday🕓16:45\nDeep 60'\n#Client Marco`,
  `*request*\nSaturday🕓11:15\nReiki\n#Client Sara`,
  `*request*\nSunday🕓13:30\nBody Bliss\n#Client Leo`,
  `*request*\nToday🕓18:00\nHolistic 90'\n#Client Carla`,
  `*request*\nTomorrow🕓14:30\nFacial\n#Client Irene`,
  `*request*\nMonday🕓12:45\nDeep 60'\n#Client Tomas`,
  `*request*\nTuesday🕓11:00\nHolistic 60'\n#Client Eva`,
  `*request*\nWednesday🕓13:15\nAromatherapy\n#Client Julia`,
  `*request*\nThursday🕓10:00\nReiki\n#Client Clara`,
  `*request*\nFriday🕓15:00\nBody Bliss\n#Client Hugo`,
  `*request*\nSaturday🕓12:30\nDeep 90'\n#Client Alex`,
  `*request*\nSunday🕓11:45\nHolistic 60'\n#Client Sofia`,
  `*request*\nToday🕓14:00\nFacial\n#Client Daniel`,
  `*request*\nTomorrow🕓16:15\nDeep 60'\n#Client Paula`,
  `*request*\nMonday🕓17:30\nHolistic 90'\n#Client Bruno`,
  `*request*\nTuesday🕓09:30\nReiki\n#Client Lucia`,
  `*request*\nWednesday🕓18:00\nAromatherapy\n#Client Marta`,
  `*request*\nThursday🕓13:45\nDeep 60'\n#Client Carlos`,
  `*request*\nFriday🕓11:30\nHolistic 60'\n#Client Ana`,
  `*request*\nSaturday🕓16:00\nBody Bliss\n#Client Emma`,
  `*request*\nSunday🕓12:15\nFacial\n#Client David`,
  `*request*\nToday🕓10:30\nDeep 60'\n#Client Raul`,
  `*request*\nTomorrow🕓15:00\nHolistic 60'\n#Client Laura`,
  `*request*\nMonday🕓14:15\nAromatherapy\n#Client Sofia`,
  `*request*\nTuesday🕓11:45\nReiki\n#Client Pablo`,
  `*request*\nWednesday🕓16:30\nBody Bliss\n#Client Marta`,
  `*request*\nThursday🕓12:00\nDeep 90'\n#Client Alex`,
  `*request*\nFriday🕓13:15\nHolistic 60'\n#Client Lucia`,
  `*request*\nSaturday🕓17:45\nFacial\n#Client Eva`,
  `*request*\nSunday🕓10:00\nAromatherapy\n#Client Daniel`,
  `*request*\nToday🕓11:15\nReiki\n#Client Carla`,
  `*request*\nTomorrow🕓18:00\nBody Bliss\n#Client Luis`,
  `*request*\nMonday🕓15:30\nDeep 60'\n#Client Sofia`,
  `*request*\nTuesday🕓10:45\nHolistic 60'\n#Client Marco`,
  `*request*\nWednesday🕓14:00\nFacial\n#Client Clara`,
  `*request*\nThursday🕓16:30\nAromatherapy\n#Client Bruno`,
  `*request*\nFriday🕓09:30\nDeep 60'\n#Client Marta`,
  `*request*\nSaturday🕓13:45\nHolistic 90'\n#Client Leo`,
  `*request*\nSunday🕓15:00\nBody Bliss\n#Client Julia`,
  `*request*\nToday🕓12:30\nFacial\n#Client Ana`,
  `*request*\nTomorrow🕓17:15\nDeep 60'\n#Client Carlos`,
  `*request*\nMonday🕓11:00\nHolistic 60'\n#Client Laura`,
  `*request*\nTuesday🕓13:30\nReiki\n#Client Sofia`,
  `*request*\nWednesday🕓15:45\nBody Bliss\n#Client Daniel`,
  `*request*\nThursday🕓10:15\nDeep 60'\n#Client Marta`,
  `*request*\nFriday🕓12:00\nHolistic 60'\n#Client Pablo`,
  `*request*\nSaturday🕓14:30\nFacial\n#Client Eva`,
  `*request*\nSunday🕓16:45\nAromatherapy\n#Client Alex`,
  `*request*\nToday🕓13:15\nReiki\n#Client Sofia`,
  `*request*\nTomorrow🕓11:30\nBody Bliss\n#Client Clara`,
  `*request*\nMonday🕓15:00\nDeep 60'\n#Client Hugo`,
  `*request*\nTuesday🕓12:15\nHolistic 60'\n#Client Marta`,
  `*request*\nWednesday🕓17:30\nFacial\n#Client Luis`,
  `*request*\nThursday🕓14:45\nAromatherapy\n#Client Ana`,
  `*request*\nFriday🕓10:00\nDeep 60'\n#Client Daniel`,
  `*request*\nSaturday🕓16:15\nHolistic 90'\n#Client Sofia`,
  `*request*\nSunday🕓13:30\nBody Bliss\n#Client Marco`,
  `*request*\nToday🕓18:15\nFacial\n#Client Carla`,
  `*request*\nTomorrow🕓09:30\nReiki\n#Client Eva`,
  `*request*\nMonday🕓14:00\nDeep 60'\n#Client Pablo`,
  `*request*\nTuesday🕓11:15\nHolistic 60'\n#Client Laura`,
  `*request*\nWednesday🕓16:00\nAromatherapy\n#Client Sofia`,
  `*request*\nThursday🕓13:00\nDeep 90'\n#Client Alex`,
  `*request*\nFriday🕓15:15\nHolistic 60'\n#Client Marta`,
  `*request*\nSaturday🕓12:45\nFacial\n#Client Clara`,
  `*request*\nSunday🕓17:00\nBody Bliss\n#Client Hugo`,
  `*request*\nToday🕓10:00\nDeep 60'\n#Client Luis`,
  `*request*\nTomorrow🕓13:45\nHolistic 60'\n#Client Sofia`,
  `*request*\nMonday🕓16:30\nReiki\n#Client Marta`,
  `*request*\nTuesday🕓12:00\nBody Bliss\n#Client Daniel`,
  `*request*\nWednesday🕓14:15\nDeep 60'\n#Client Pablo`,
  `*request*\nThursday🕓11:30\nHolistic 60'\n#Client Eva`,
  `*request*\nFriday🕓17:45\nFacial\n#Client Alex`,
  `*request*\nSaturday🕓13:00\nAromatherapy\n#Client Sofia`,
  `*request*\nSunday🕓15:30\nReiki\n#Client Marta`,
  `*request*\nToday🕓11:45\nBody Bliss\n#Client Clara`,
  `*request*\nTomorrow🕓16:00\nDeep 60'\n#Client Hugo`,
  `*request*\nMonday🕓10:15\nHolistic 60'\n#Client Daniel`,
  `*request*\nTuesday🕓13:30\nFacial\n#Client Laura`,
  `*request*\nWednesday🕓15:00\nAromatherapy\n#Client Sofia`,
  `*request*\nThursday🕓12:45\nDeep 60'\n#Client Pablo`,
  `*request*\nFriday🕓14:00\nHolistic 60'\n#Client Marta`,
  `*request*\nSaturday🕓16:30\nBody Bliss\n#Client Eva`,
  `*request*\nSunday🕓11:15\nFacial\n#Client Alex`,
  `*request*\nToday🕓13:45\nReiki\n#Client Sofia`,
  `*request*\nTomorrow🕓17:00\nDeep 60'\n#Client Clara`,
  `*request*\nMonday🕓12:30\nHolistic 60'\n#Client Hugo`,
  `*request*\nTuesday🕓15:15\nFacial\n#Client Daniel`,
  `*request*\nWednesday🕓11:00\nAromatherapy\n#Client Laura`,
  `*request*\nThursday🕓16:45\nDeep 60'\n#Client Sofia`,
  `*request*\nFriday🕓10:30\nHolistic 60'\n#Client Marta`,
  `*request*\nSaturday🕓13:15\nBody Bliss\n#Client Pablo`,
  `*request*\nSunday🕓14:30\nFacial\n#Client Eva`,
  `*request*\nToday🕓12:00\nDeep 60'\n#Client Alex`,
  `*request*\nTomorrow🕓15:45\nHolistic 60'\n#Client Sofia`,
  `*request*\nMonday🕓17:15\nAromatherapy\n#Client Marta`,
];

// ── Correr ────────────────────────────────────────────────────

const RESET="\x1b[0m", GREEN="\x1b[32m", RED="\x1b[31m", GRAY="\x1b[90m", YELLOW="\x1b[33m", BOLD="\x1b[1m";

let puedo=0, silencio=0;
const razones = {};

console.log(`\n${BOLD}Fecha de hoy: ${new Date().toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}${RESET}\n`);
console.log("─".repeat(72));

for (let i=0; i<requests.length; i++) {
  const r = simular(requests[i]);
  const n = String(i+1).padStart(3," ");
  // Extraer nombre del cliente
  const clienteM = requests[i].match(/#(.+)$/m);
  const cliente  = clienteM ? clienteM[1].trim().slice(0,20) : "?";

  if (r.responde) {
    puedo++;
    const fecha = `${r.fecha.readable} (${DIAS[r.fecha.diaSemana]}) ${hStr(r.hora)}`;
    console.log(`${GREEN}${n}. ✅ PUEDO  ${RESET}${fecha.padEnd(36)} ${r.servicio||""} — ${cliente}`);
    razones["Puedo"] = (razones["Puedo"]||0)+1;
  } else {
    silencio++;
    razones[r.razon] = (razones[r.razon]||0)+1;
    const fechaInfo = r.fecha ? `${r.fecha.readable} (${DIAS[r.fecha.diaSemana]}) ${hStr(r.hora)}` : "sin fecha";
    let color = GRAY;
    if (r.razon==="slot ocupado") color=YELLOW;
    console.log(`${color}${n}. —— silencio  ${r.razon.padEnd(22)} ${fechaInfo}  — ${cliente}${RESET}`);
  }
}

console.log("─".repeat(72));
console.log(`\n${BOLD}RESUMEN${RESET}`);
console.log(`  ${GREEN}✅ Puedo:   ${puedo}${RESET}`);
console.log(`  ${GRAY}—— Silencio: ${silencio}${RESET}`);
console.log(`\n  Por razón:`);
for (const [k,v] of Object.entries(razones).sort((a,b)=>b[1]-a[1]))
  console.log(`    ${k.padEnd(26)} ${v}`);
console.log();
