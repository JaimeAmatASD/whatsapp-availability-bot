const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('./config.json','utf8'));
const MESES={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12};
const MESES_ES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DIAS=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
function quitarAcentos(s){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function timeToMins(str){const[h,m='0']=str.split(':');return parseInt(h)*60+parseInt(m);}
function estaDisponible(fecha,cfg,h){
  const dd=String(fecha.date.getDate()).padStart(2,'0');
  const mm=String(fecha.date.getMonth()+1).padStart(2,'0');
  const ov=(cfg.overrides||{})[dd+'/'+mm];
  if(ov){if(ov.bloqueado||ov.inactivo)return false;if(ov.desde&&ov.hasta){if(h!==null&&(h<timeToMins(ov.desde)||h>timeToMins(ov.hasta)))return false;return true;}}
  const horario=cfg.disponible[String(fecha.diaSemana)];
  if(!horario)return false;
  if(h!==null&&(h<timeToMins(horario.desde)||h>timeToMins(horario.hasta)))return false;
  return true;
}
function parsear(text, stripDuracion) {
  let sinHora = text.replace(/[🕓⏱][\uFE0F]?.*$/gm,' ').replace(/#.*$/gm,' ');
  if (stripDuracion) {
    sinHora = sinHora.replace(/\d+\s*[''`´]/g, ' ').replace(/\d+\s*min\b/gi, ' ');
  }
  const lower = quitarAcentos(sinHora.toLowerCase());
  const now = new Date(); now.setHours(0,0,0,0);
  const monM = lower.match(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/);
  const dnM  = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (monM && dnM) {
    const date = new Date(now.getFullYear(), MESES[monM[1]]-1, parseInt(dnM[1]));
    if (date < now) date.setFullYear(now.getFullYear()+1);
    return { date, diaSemana: date.getDay(), readable: date.getDate()+' de '+MESES_ES[date.getMonth()]+' '+date.getFullYear() };
  }
  return null;
}

const msg = "Peticion\nAromatherapia 60`\nElke # 6\nViernes 27 Marzo\n11:00";

const antes   = parsear(msg, false);
const despues = parsear(msg, true);

console.log("\n── ANTES del fix ──────────────────────────────────────");
if (antes) {
  const disp = estaDisponible(antes, cfg, 660);
  console.log("  Fecha parseada : " + antes.readable + " (" + DIAS[antes.diaSemana] + ")");
  console.log("  Disponible     : " + disp + " → bot responde: " + disp);
} else { console.log("  null"); }

console.log("\n── DESPUÉS del fix ────────────────────────────────────");
if (despues) {
  const disp = estaDisponible(despues, cfg, 660);
  console.log("  Fecha parseada : " + despues.readable + " (" + DIAS[despues.diaSemana] + ")");
  console.log("  Bloqueado      : " + !disp + " → bot responde: " + disp);
} else { console.log("  null"); }
console.log();
