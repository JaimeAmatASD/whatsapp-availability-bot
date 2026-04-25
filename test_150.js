/**
 * test_150.js — Simulates 150 scheduling requests
 * node test_150.js
 */

const fs = require("fs");
const cfg = JSON.parse(fs.readFileSync("./config.json", "utf8"));

// ── Logic copied from bot.js ───────────────────────────────────

function timeToMins(str) {
  const [h, m = "0"] = str.split(":");
  return parseInt(h) * 60 + parseInt(m);
}
function isAvailable(fecha, cfg, timeMinutes) {
  const dd = String(fecha.date.getDate()).padStart(2,"0");
  const mm = String(fecha.date.getMonth()+1).padStart(2,"0");
  const key = `${dd}/${mm}`;
  const ov  = (cfg.overrides||{})[key];
  if (ov) {
    if (ov.bloqueado || ov.inactivo) return false;
    if (ov.desde && ov.hasta) {
      if (timeMinutes !== null)
        if (timeMinutes < timeToMins(ov.desde) || timeMinutes > timeToMins(ov.hasta)) return false;
      return true;
    }
  }
  const schedule = cfg.disponible[String(fecha.diaSemana)];
  if (!schedule) return false;
  if (timeMinutes !== null)
    if (timeMinutes < timeToMins(schedule.desde) || timeMinutes > timeToMins(schedule.hasta)) return false;
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
function detectService(text) {
  const lower = text.toLowerCase();
  for (const [n, ks] of Object.entries(SERVICIOS_KEYWORDS))
    if (ks.some(k => WB.has(k) ? new RegExp("\\b"+k+"\\b").test(lower) : lower.includes(k))) return n;
  return null;
}
function extractTime(text) {
  const m = text.match(/[🕓⏱][️]?\s*~?\s*(\d{1,2})(?:[:\.](\d{2}))?h?\b/);
  if (!m) return null;
  const h = parseInt(m[1]), min = parseInt(m[2]||"0");
  if (h > 23 || min > 59) return null;
  return h*60+min;
}
const WEEKDAYS={monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6,sunday:0,lunes:1,martes:2,miercoles:3,jueves:4,viernes:5,sabado:6,domingo:0};
const MESES={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12,january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
const MONTH_NAMES=["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_SHORT=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
function stripAccents(s){return s.normalize("NFD").replace(/[̀-ͯ]/g,"");}
function extractDate(text) {
  const sinHora = text.replace(/[🕓⏱][️]?.*$/gm," ").replace(/#\S+/g," ");
  const lower   = stripAccents(sinHora.toLowerCase());
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
function makeResult(date){return{date,diaSemana:date.getDay(),readable:`${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`};}

let _slots = {};
function slotDateKey(date){return String(date.getDate()).padStart(2,"0")+"/"+String(date.getMonth()+1).padStart(2,"0")+"/"+date.getFullYear();}
function slotFree(key,h,gap){if(h===null)return true;return(_slots[key]||[]).every(t=>Math.abs(t-h)>=gap);}
function claimSlot(key,h){if(!_slots[key])_slots[key]=[];_slots[key].push(h!==null?h:-1);}

function hStr(h){if(h===null)return"flex";return`${Math.floor(h/60)}:${String(h%60).padStart(2,"0")}`;}

function simulate(text) {
  if (!/petici[oó]n|request/i.test(text))
    return { responds:false, reason:"not a request" };
  const service  = detectService(text);
  const allowed  = cfg.serviciosPermitidos||[];
  if (allowed.length>0 && (!service||!allowed.includes(service)))
    return { responds:false, reason:`service not allowed (${service||"?"})` };
  const fecha = extractDate(text);
  if (!fecha) return { responds:false, reason:"no date" };
  const hora = extractTime(text);
  if (!isAvailable(fecha,cfg,hora)){
    const dd=String(fecha.date.getDate()).padStart(2,"0");
    const mm=String(fecha.date.getMonth()+1).padStart(2,"0");
    const ov=(cfg.overrides||{})[`${dd}/${mm}`];
    if(ov&&(ov.bloqueado||ov.inactivo)) return{responds:false,reason:`blocked`,fecha,hora};
    return{responds:false,reason:`outside hours/day`,fecha,hora};
  }
  const dateKey = slotDateKey(fecha.date);
  const gap = cfg.minGapMins||90;
  if (!slotFree(dateKey,hora,gap))
    return{responds:false,reason:`slot taken`,fecha,hora,service};
  claimSlot(dateKey,hora);
  return{responds:true,reason:"Available",fecha,hora,service};
}

// ── 150 requests ──────────────────────────────────────────────

const requests = [
  `*request*\nSunday🕓19:00\n90' Holistic\n#EXT Sarah Mitchell`,
  `*request*\nSaturday April 27🕓11:45\n30' Holistic\n#EXT Emma Johansson`,
  `*request*\nSunday April 7 🕓11:30\nDeep 90'\n#2 Priya Sharma`,
  `*request*\nSunday April 7 🕓13:15\nDeep 90'\n#2 Nadia Chen`,
  `*request*\nSunday April 7th 🕓15:00\n60' Holistic\n#9 Olivia`,
  `*request*\nSunday March 3 🕓11:30\nFacial\n#7 Yuki`,
  `*request*\nTuesday, Feb 20 🕓12:00\nAromatherapy\n#7 Fatima`,
  `*request*\nLunes 19 🕓11:00\nHolistic 60'\n#8 Ingrid`,
  `*request*\nSunday Feb 25 🕓11:00\nBody Bliss\n#1 Mei`,
  `*request*\nToday🕓flexible until 15:30\nDeep 60'\n#9 Clara`,
  `*request*\nToday🕓13:00\nDeep 60'\n#9 Clara`,
  `*request*\nHolistic 60' Hoy 🕓11:30\n#1 Aisha`,
  `*request*\nMonday 19 🕓11:00\n60' Deep\n#12 Lena`,
  `*request*\nWednesday 21 🕓12:30\nReiki\n#12 Lena`,
  `*request*\nFriday 23🕓11:00\nFacial\n#12 Lena`,
  `*request*\nFriday 23 🕓12:15\nHolistic 60'\n#ext Mila 1`,
  `*request*\nFriday 23 🕓12:15\nHolistic 60'\n#ext Mila 2`,
  `*request*\nTuesday🕓12:00\nCalifornian 90'\n#TH Zara`,
  `*request*\nMonday, March 1 🕓12:00\nTHAI\n#TH Zara`,
  `*request*\nTuesday 27 🕓11:00\n90' Californian\n#1 Astrid`,
  `*request*\nMonday 26 🕓18:00\n60' Deep\n#1 Astrid`,
  `*request*\nToday! 🕓12:15\nDeep 60'\n#12 Rania`,
  `*request*\nJueves🕓11:00\nHolistic 60'\n#6 Chloe`,
  `*request*\nMonday, Feb 26 🕓11:00\nDeep 60'\n#7 Leila`,
  `*request*\nMonday, Feb 26 🕓12:15\nDeep 60'\n#7 Nina`,
  `*request*\nSunday, March 17🕓11:00\nHolistic 60'\n#Camille`,
  `*request*\nTuesday 27 🕓13:45\nBody Bliss\n#1 Ines`,
  `*request*\nThursday 22 🕓12:15\nAromatherapy\n#8 Petra`,
  `*request*\nFriday 23 🕓13:45\nDeep 60'\n#TH Zara`,
  `*request*\nHoy🕓flexible\n30' shoulders\n#1 Amara`,
  `*request*\nMonday 26 🕓11:00\nHolistic 60'\n#Diana`,
  `*request*\nMonday 26 🕓12:15\nHolistic 60'\n#Diana 2`,
  `*request*\nMonday 26 ⏱️14h\n60' Deep Tissue\n#14 Maren`,
  `*request*\nSaturday 24 ⏱️10h\nHolistic 90'\n#2 Hana`,
  `*request*\nSaturday 24 ⏱️11.45h\nHolistic 90'\n#2 Hana mother`,
  `*request*\nTuesday 27 ⏱️15.30h\n90' Holistic\n#Valentina`,
  `*request*\nMañana 23 ⏱️16h\nFacial clay mask\n#10 Marco`,
  `*request*\nMañana 23 ⏱️17.15h\nBody Bliss\n#10 Lucia`,
  `*request*\nTomorrow🕓12:45\n60' Holistic\n#11 Nora`,
  `*request*\nTomorrow🕓12:45\n60' Holistic\n#11 Elena`,
  `*request*\nMonday 26 🕓13:30\nDeep 90'\n#12 Rania`,
  `*request*\nFriday, April 26th 🕓11:00\n30' Holistic\n#Sienna`,
  `*request*\nFriday, April 26th 🕓11:45\n30' Holistic\n#Sienna`,
  `*request*\nFriday, April 26th 🕓12:30\n30' Holistic\n#Sienna`,
  `*request*\nThursday 29th🕓12:00\n30' Shoulders\n#Tessa`,
  `*request*\nToday🕓16:30\nDeep 60'\n#Laura`,
  `*request*\nTomorrow🕓11:00\nHolistic 60'\n#Anna`,
  `*request*\nFriday🕓14:15\nFacial\n#Yuki`,
  `*request*\nMonday🕓10:30\nReiki\n#Mia`,
  `*request*\nTuesday🕓13:00\nBody Bliss\n#Elena`,
  `*request*\nToday🕓17:00\nDeep 90'\n#Diego`,
  `*request*\nTomorrow🕓09:45\nHolistic 60'\n#Lars`,
  `*request*\nWednesday🕓12:00\nFacial\n#Nora`,
  `*request*\nThursday🕓15:30\nAromatherapy\n#Amara`,
  `*request*\nFriday🕓16:45\nDeep 60'\n#Marco`,
  `*request*\nSaturday🕓11:15\nReiki\n#Sara`,
  `*request*\nSunday🕓13:30\nBody Bliss\n#Leo`,
  `*request*\nToday🕓18:00\nHolistic 90'\n#Carla`,
  `*request*\nTomorrow🕓14:30\nFacial\n#Keiko`,
  `*request*\nMonday🕓12:45\nDeep 60'\n#Matteo`,
  `*request*\nTuesday🕓11:00\nHolistic 60'\n#Eva`,
  `*request*\nWednesday🕓13:15\nAromatherapy\n#Hana`,
  `*request*\nThursday🕓10:00\nReiki\n#Clara`,
  `*request*\nFriday🕓15:00\nBody Bliss\n#Hugo`,
  `*request*\nSaturday🕓12:30\nDeep 90'\n#Felix`,
  `*request*\nSunday🕓11:45\nHolistic 60'\n#Priya`,
  `*request*\nToday🕓14:00\nFacial\n#Daniel`,
  `*request*\nTomorrow🕓16:15\nDeep 60'\n#Paula`,
  `*request*\nMonday🕓17:30\nHolistic 90'\n#Bruno`,
  `*request*\nTuesday🕓09:30\nReiki\n#Lucia`,
  `*request*\nWednesday🕓18:00\nAromatherapy\n#Rania`,
  `*request*\nThursday🕓13:45\nDeep 60'\n#Carlos`,
  `*request*\nFriday🕓11:30\nHolistic 60'\n#Ana`,
  `*request*\nSaturday🕓16:00\nBody Bliss\n#Emma`,
  `*request*\nSunday🕓12:15\nFacial\n#David`,
  `*request*\nToday🕓10:30\nDeep 60'\n#Raul`,
  `*request*\nTomorrow🕓15:00\nHolistic 60'\n#Beatrice`,
  `*request*\nMonday🕓14:15\nAromatherapy\n#Maya`,
  `*request*\nTuesday🕓11:45\nReiki\n#Santiago`,
  `*request*\nWednesday🕓16:30\nBody Bliss\n#Nia`,
  `*request*\nThursday🕓12:00\nDeep 90'\n#Liam`,
  `*request*\nFriday🕓13:15\nHolistic 60'\n#Lucia`,
  `*request*\nSaturday🕓17:45\nFacial\n#Sienna`,
  `*request*\nSunday🕓10:00\nAromatherapy\n#Chen`,
  `*request*\nToday🕓11:15\nReiki\n#Zoe`,
  `*request*\nTomorrow🕓18:00\nBody Bliss\n#Noah`,
  `*request*\nMonday🕓15:30\nDeep 60'\n#Valentina`,
  `*request*\nTuesday🕓10:45\nHolistic 60'\n#Marco`,
  `*request*\nWednesday🕓14:00\nFacial\n#Ingrid`,
  `*request*\nThursday🕓16:30\nAromatherapy\n#Hugo`,
  `*request*\nFriday🕓09:30\nDeep 60'\n#Fatima`,
  `*request*\nSaturday🕓13:45\nHolistic 90'\n#Leo`,
  `*request*\nSunday🕓15:00\nBody Bliss\n#Julia`,
  `*request*\nToday🕓12:30\nFacial\n#Ana`,
  `*request*\nTomorrow🕓17:15\nDeep 60'\n#Carlos`,
  `*request*\nMonday🕓11:00\nHolistic 60'\n#Astrid`,
  `*request*\nTuesday🕓13:30\nReiki\n#Mei`,
  `*request*\nWednesday🕓15:45\nBody Bliss\n#Lars`,
  `*request*\nThursday🕓10:15\nDeep 60'\n#Mia`,
  `*request*\nFriday🕓12:00\nHolistic 60'\n#Pablo`,
  `*request*\nSaturday🕓14:30\nFacial\n#Eva`,
  `*request*\nSunday🕓16:45\nAromatherapy\n#Kwame`,
  `*request*\nToday🕓13:15\nReiki\n#Rin`,
  `*request*\nTomorrow🕓11:30\nBody Bliss\n#Clara`,
  `*request*\nMonday🕓15:00\nDeep 60'\n#Matteo`,
  `*request*\nTuesday🕓12:15\nHolistic 60'\n#Kai`,
  `*request*\nWednesday🕓17:30\nFacial\n#Nadia`,
  `*request*\nThursday🕓14:45\nAromatherapy\n#Leila`,
  `*request*\nFriday🕓10:00\nDeep 60'\n#Daniel`,
  `*request*\nSaturday🕓16:15\nHolistic 90'\n#Irina`,
  `*request*\nSunday🕓13:30\nBody Bliss\n#Camille`,
  `*request*\nToday🕓18:15\nFacial\n#Sienna`,
  `*request*\nTomorrow🕓09:30\nReiki\n#Kwame`,
  `*request*\nMonday🕓14:00\nDeep 60'\n#Daniel`,
  `*request*\nTuesday🕓11:15\nHolistic 60'\n#Beatrice`,
  `*request*\nWednesday🕓16:00\nAromatherapy\n#Yui`,
  `*request*\nThursday🕓13:00\nDeep 90'\n#Mia`,
  `*request*\nFriday🕓15:15\nHolistic 60'\n#Lars`,
  `*request*\nSaturday🕓12:45\nFacial\n#Pablo`,
  `*request*\nSunday🕓17:00\nBody Bliss\n#Eva`,
  `*request*\nToday🕓10:00\nDeep 60'\n#Felix`,
  `*request*\nTomorrow🕓13:45\nHolistic 60'\n#Irina`,
  `*request*\nMonday🕓16:30\nReiki\n#Astrid`,
  `*request*\nTuesday🕓12:00\nBody Bliss\n#Zoe`,
  `*request*\nWednesday🕓14:15\nDeep 60'\n#Matteo`,
  `*request*\nThursday🕓11:30\nHolistic 60'\n#Kai`,
  `*request*\nFriday🕓17:45\nFacial\n#Chen`,
  `*request*\nSaturday🕓13:00\nAromatherapy\n#Irina`,
  `*request*\nSunday🕓15:30\nReiki\n#Petra`,
  `*request*\nToday🕓11:45\nBody Bliss\n#Leila`,
  `*request*\nTomorrow🕓16:00\nDeep 60'\n#Hugo`,
  `*request*\nMonday🕓10:15\nHolistic 60'\n#Daniel`,
  `*request*\nTuesday🕓13:30\nFacial\n#Beatrice`,
  `*request*\nWednesday🕓15:00\nAromatherapy\n#Mei`,
  `*request*\nThursday🕓12:45\nDeep 60'\n#Mia`,
  `*request*\nFriday🕓14:00\nHolistic 60'\n#Lars`,
  `*request*\nSaturday🕓16:30\nBody Bliss\n#Eva`,
  `*request*\nSunday🕓11:15\nFacial\n#Felix`,
  `*request*\nToday🕓13:45\nReiki\n#Irina`,
  `*request*\nTomorrow🕓17:00\nDeep 60'\n#Nadia`,
  `*request*\nMonday🕓12:30\nHolistic 60'\n#Kwame`,
  `*request*\nTuesday🕓15:15\nFacial\n#Camille`,
  `*request*\nWednesday🕓11:00\nAromatherapy\n#Sienna`,
  `*request*\nThursday🕓16:45\nDeep 60'\n#Daniel`,
  `*request*\nFriday🕓10:30\nHolistic 60'\n#Astrid`,
  `*request*\nSaturday🕓13:15\nBody Bliss\n#Santiago`,
  `*request*\nSunday🕓14:30\nFacial\n#Eva`,
  `*request*\nToday🕓12:00\nDeep 60'\n#Chen`,
  `*request*\nTomorrow🕓15:45\nHolistic 60'\n#Irina`,
  `*request*\nMonday🕓17:15\nAromatherapy\n#Kwame`,
];

// ── Run ───────────────────────────────────────────────────────

const RESET="\x1b[0m", GREEN="\x1b[32m", RED="\x1b[31m", GRAY="\x1b[90m", YELLOW="\x1b[33m", BOLD="\x1b[1m";

let available=0, silent=0;
const reasons = {};

console.log(`\n${BOLD}Today: ${new Date().toLocaleDateString("en-US",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}${RESET}\n`);
console.log("─".repeat(72));

for (let i=0; i<requests.length; i++) {
  const r = simulate(requests[i]);
  const n = String(i+1).padStart(3," ");
  const clientM = requests[i].match(/#(.+)$/m);
  const client  = clientM ? clientM[1].trim().slice(0,20) : "?";

  if (r.responds) {
    available++;
    const fecha = `${r.fecha.readable} (${DAYS_SHORT[r.fecha.diaSemana]}) ${hStr(r.hora)}`;
    console.log(`${GREEN}${n}. ✅ AVAILABLE  ${RESET}${fecha.padEnd(36)} ${r.service||""} — ${client}`);
    reasons["Available"] = (reasons["Available"]||0)+1;
  } else {
    silent++;
    reasons[r.reason] = (reasons[r.reason]||0)+1;
    const fechaInfo = r.fecha ? `${r.fecha.readable} (${DAYS_SHORT[r.fecha.diaSemana]}) ${hStr(r.hora)}` : "no date";
    let color = GRAY;
    if (r.reason==="slot taken") color=YELLOW;
    console.log(`${color}${n}. —— silent  ${r.reason.padEnd(24)} ${fechaInfo}  — ${client}${RESET}`);
  }
}

console.log("─".repeat(72));
console.log(`\n${BOLD}SUMMARY${RESET}`);
console.log(`  ${GREEN}✅ Available: ${available}${RESET}`);
console.log(`  ${GRAY}—— Silent:    ${silent}${RESET}`);
console.log(`\n  By reason:`);
for (const [k,v] of Object.entries(reasons).sort((a,b)=>b[1]-a[1]))
  console.log(`    ${k.padEnd(26)} ${v}`);
console.log();
