/**
 * bot.js — Bot WhatsApp Wellness
 * - Responde "Puedo" según días/horarios en config.json
 * - Dashboard en http://localhost:3000
 */

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode  = require("qrcode-terminal");
const express = require("express");
const fs      = require("fs");
const path    = require("path");

// ─── CONFIG ───────────────────────────────────────────────────
const CONFIG_PATH = "./config.json";
let _cfg = null;

function readConfig() {
  if (!_cfg) _cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  return _cfg;
}
function writeConfig(c) {
  _cfg = c;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(c, null, 2));
}
fs.watchFile(CONFIG_PATH, { interval: 1000 }, () => { _cfg = null; });

// ─── HISTORIAL ────────────────────────────────────────────────
const HISTORY_PATH = "./history.json";

function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8")); } catch { return []; }
}
function saveHistory(h) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(h, null, 2));
}
function registrarHistorial(dateKey, horaMinutos, servicio) {
  const h = loadHistory();
  h.push({
    id:       Date.now(),
    fecha:    dateKey,
    mins:     horaMinutos,
    servicio: servicio || "Desconocido",
    realizado: false,
  });
  saveHistory(h);
}

// ─── SLOTS ────────────────────────────────────────────────────
const SLOTS_PATH = "./slots.json";
let _slots = null;

function loadSlots() {
  if (_slots) return _slots;
  try { _slots = JSON.parse(fs.readFileSync(SLOTS_PATH, "utf8")); } catch { _slots = {}; }
  // Limpiar fechas pasadas
  const hoy = slotDateKey(new Date());
  Object.keys(_slots).forEach(k => { if (k < hoy) delete _slots[k]; });
  saveSlots();
  return _slots;
}
function saveSlots() {
  fs.writeFileSync(SLOTS_PATH, JSON.stringify(_slots, null, 2));
}
function slotDateKey(date) {
  return String(date.getDate()).padStart(2,"0") + "/" +
         String(date.getMonth()+1).padStart(2,"0") + "/" + date.getFullYear();
}
function slotLibre(dateKey, horaMinutos, minGap) {
  if (horaMinutos === null) return true; // flexible: no bloqueamos
  const ocupados = (loadSlots()[dateKey] || []);
  return ocupados.every(t => Math.abs(t - horaMinutos) >= minGap);
}
function reclamarSlot(dateKey, horaMinutos) {
  const slots = loadSlots();
  if (!slots[dateKey]) slots[dateKey] = [];
  slots[dateKey].push(horaMinutos !== null ? horaMinutos : -1);
  saveSlots();
}

// ─── CONSTANTES ───────────────────────────────────────────────
const GROUP_NAME    = "CR Wellness 2026";
const GROUP_TESTING = "Testing";
const DIAS       = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

// ─── DASHBOARD ────────────────────────────────────────────────
const app = express();
app.use(express.json());

app.get("/",            (_req, res) => res.sendFile(path.join(__dirname, "dashboard.html")));
app.get("/api/config",  (_req, res) => res.json(readConfig()));
app.post("/api/config", (req, res)  => { writeConfig(req.body); res.json({ ok: true }); });

app.get("/api/slots", (_req, res) => res.json(loadSlots()));
app.delete("/api/slots/:key", (req, res) => {
  const slots = loadSlots();
  const key   = decodeURIComponent(req.params.key);
  const mins  = req.query.mins !== undefined ? parseInt(req.query.mins) : undefined;
  if (mins !== undefined && slots[key]) {
    slots[key] = slots[key].filter(t => t !== mins);
    if (slots[key].length === 0) delete slots[key];
  } else {
    delete slots[key];
  }
  _slots = slots;
  saveSlots();
  res.json({ ok: true });
});
app.delete("/api/slots", (_req, res) => {
  _slots = {};
  saveSlots();
  res.json({ ok: true });
});

app.get("/api/history", (_req, res) => res.json(loadHistory()));
app.patch("/api/history/:id", (req, res) => {
  const h  = loadHistory();
  const id = parseInt(req.params.id);
  const entry = h.find(e => e.id === id);
  if (!entry) return res.status(404).json({ error: "not found" });
  entry.realizado = req.body.realizado;
  saveHistory(h);
  res.json({ ok: true });
});
app.delete("/api/history/:id", (req, res) => {
  let h = loadHistory();
  h = h.filter(e => e.id !== parseInt(req.params.id));
  saveHistory(h);
  res.json({ ok: true });
});

app.listen(3000, "127.0.0.1", () =>
  console.log("📊 Dashboard: http://localhost:3000")
);

// ─── CLIENTE WHATSAPP ─────────────────────────────────────────
const BOT_START_TIME = Math.floor(Date.now() / 1000); // timestamp en segundos

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
});

client.on("qr", (qr) => {
  console.log("\n📱 Escaneá este QR con tu WhatsApp:\n");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  const cfg = readConfig();
  if (cfg.botActivo === undefined) { cfg.botActivo = false; writeConfig(cfg); }
  console.log(`\n🤖 Bot listo — ${cfg.botActivo ? "ACTIVO" : "INACTIVO (usar !bot on para activar)"}`);
  console.log(`📅 Disponible: ${resumenHorario(cfg)}\n`);
});

client.on("disconnected", () => {
  console.log("⚠️ Desconectado. Reconectando en 5s...");
  setTimeout(() => client.initialize(), 5000);
});

// ─── MENSAJES ─────────────────────────────────────────────────
client.on("message_create", async (msg) => {
  try {
    const text = msg.body?.trim() || "";

    // Ignorar mensajes anteriores al inicio del bot (evita replay al reconectar)
    if (msg.timestamp && msg.timestamp < BOT_START_TIME) return;

    // Solo grupos
    const chatId = msg.from.endsWith("@g.us") ? msg.from : (msg.to || "");
    if (!chatId.endsWith("@g.us")) return;
    const chat = await msg.getChat();

    // Comandos de control — solo en grupo Testing
    if (chat.name === GROUP_TESTING) {
      const cmd = text.toLowerCase();
      const cfg = readConfig();
      if (cmd === "hola1") {
        await msg.reply(cfg.botActivo ? "hola2 ✅" : "hola2 ❌");
        return;
      }
      if (cmd === "!bot on") {
        cfg.botActivo = true; writeConfig(cfg); await msg.reply("Bot activado");
        return;
      }
      if (!cfg.botActivo) {
        // Modo test: procesa peticiones pero responde con ❌ en vez de "Puedo"
        if (/petici[oó]n|request/i.test(text)) {
          await procesarPeticion(msg, text, cfg, /* modoTest */ true);
        }
        return;
      }
      if (cmd === "!bot off")    { cfg.botActivo = false; writeConfig(cfg); await msg.reply("Bot desactivado"); return; }
      if (cmd === "!bot estado") { await msg.reply(`Bot: Activo\n${resumenHorario(cfg)}`); return; }
    }

    const cfg = readConfig();
    if (!cfg.botActivo) return;
    if (chat.name !== GROUP_NAME && chat.name !== GROUP_TESTING) return;

    // Detectar petición
    if (!/petici[oó]n|request/i.test(text)) return;

    await procesarPeticion(msg, text, cfg, /* modoTest */ false);

  } catch (err) {
    console.error("Error:", err.message);
  }
});

// ─── PROCESAR PETICIÓN ────────────────────────────────────────
async function procesarPeticion(msg, text, cfg, modoTest) {
  // Ignorar si menciona a otro terapeuta con @
  if (msg.mentionedIds && msg.mentionedIds.length > 0) {
    console.log("👤 Petición con @mención — dirigida a otro terapeuta, ignorando");
    return;
  }

  // Ignorar si pide terapeuta femenina
  if (/\bfemale\b|\bmujer\b/i.test(text)) {
    console.log("🚫 Pide terapeuta femenina — ignorando");
    return;
  }

  console.log(`🔔 ${modoTest ? "[TEST] " : ""}Petición: "${text.slice(0, 80)}"`);

  // Verificar servicio
  const servicio = detectarServicio(text);
  const permitidos = cfg.serviciosPermitidos || [];
  console.log(`🛠️ Servicio detectado: ${servicio || "desconocido"}`);
  if (permitidos.length > 0) {
    if (!servicio || !permitidos.includes(servicio)) {
      console.log(`🚫 Servicio no permitido — sin respuesta`);
      if (modoTest) await msg.reply("❌ Servicio no permitido");
      return;
    }
  }

  // Extraer fecha y hora
  const fecha = extraerFecha(text);
  if (!fecha) {
    console.log("⚠️ Sin fecha reconocible — ignorando");
    if (modoTest) await msg.reply("❌ Sin fecha reconocible");
    return;
  }
  const hora = extraerHora(text);
  console.log(`📅 Fecha: ${fecha.readable} (${DIAS[fecha.diaSemana]}) | Hora: ${hora !== null ? Math.floor(hora/60)+":"+(hora%60).toString().padStart(2,"0") : "flexible"}`);

  // Verificar disponibilidad
  if (!estaDisponible(fecha, cfg, hora)) {
    console.log("❌ No disponible — sin respuesta");
    if (modoTest) await msg.reply("❌ No disponible ese día/horario");
    return;
  }

  // Verificar slot libre
  const dateKey = slotDateKey(fecha.date);
  const minGap  = cfg.minGapMins || 90;
  if (!slotLibre(dateKey, hora, minGap)) {
    console.log(`⛔ Slot ocupado (gap mínimo ${minGap}min) — sin respuesta`);
    if (modoTest) await msg.reply("❌ Slot ocupado");
    return;
  }

  if (modoTest) {
    console.log(`🧪 Test OK — respondería "Puedo" (bot inactivo, no se reserva slot)`);
    await msg.reply(`✅ Test OK — respondería "Puedo"\n📅 ${fecha.readable} | 🛠️ ${servicio}`);
    return;
  }

  // Reclamar slot ANTES del delay para evitar doble respuesta
  reclamarSlot(dateKey, hora);
  registrarHistorial(dateKey, hora, servicio);

  // Responder con delay aleatorio
  const dMin  = cfg.delayMin ?? 2;
  const dMax  = cfg.delayMax ?? 6;
  const delay = (Math.floor(Math.random() * (dMax - dMin + 1)) + dMin) * 1000;
  console.log(`✅ Slot reclamado — respondiendo en ${delay / 1000}s...`);
  setTimeout(async () => {
    await msg.reply("Puedo");
    console.log(`📤 "Puedo" enviado`);
  }, delay);
}

// ─── DISPONIBILIDAD ───────────────────────────────────────────
function timeToMins(str) {
  const [h, m = "0"] = str.split(":");
  return parseInt(h) * 60 + parseInt(m);
}

function estaDisponible(fecha, cfg, horaMinutos) {
  const dd  = String(fecha.date.getDate()).padStart(2, "0");
  const mm  = String(fecha.date.getMonth() + 1).padStart(2, "0");
  const key = `${dd}/${mm}`;

  // 1. Override específico para esta fecha
  const ov = (cfg.overrides || {})[key];
  if (ov) {
    if (ov.bloqueado || ov.inactivo) {
      console.log(`🚫 Fecha bloqueada/inactiva: ${key}`);
      return false;
    }
    if (ov.desde && ov.hasta) {
      // Tiene horario personalizado
      if (horaMinutos !== null) {
        if (horaMinutos < timeToMins(ov.desde) || horaMinutos > timeToMins(ov.hasta)) {
          console.log(`⏰ Hora fuera de rango personalizado (${ov.desde}–${ov.hasta})`);
          return false;
        }
      }
      return true;
    }
  }

  // 2. Template semanal (fallback)
  const horario = cfg.disponible[String(fecha.diaSemana)];
  if (!horario) return false;
  if (horaMinutos !== null) {
    if (horaMinutos < timeToMins(horario.desde) || horaMinutos > timeToMins(horario.hasta)) {
      console.log(`⏰ Hora fuera de rango (${horario.desde}–${horario.hasta})`);
      return false;
    }
  }
  return true;
}

// ─── DETECTAR SERVICIO ────────────────────────────────────────
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
const WB_COMPILED = {};
for (const k of WB_KEYWORDS) WB_COMPILED[k] = new RegExp("\\b" + k + "\\b");

function detectarServicio(text) {
  const lower = text.toLowerCase();
  for (const [nombre, keywords] of Object.entries(SERVICIOS_KEYWORDS)) {
    if (keywords.some(k => WB_KEYWORDS.has(k) ? WB_COMPILED[k].test(lower) : lower.includes(k))) return nombre;
  }
  return null;
}

// ─── EXTRAER HORA ─────────────────────────────────────────────
function extraerHora(text) {
  // 1. Con emoji: 🕓11:00, ⏱️ 14h, ⏱️11.45h, 🕓12, ⏱️ ~17h
  const m = text.match(/[🕓⏱][\uFE0F]?\s*~?\s*(\d{1,2})(?:[:\.](\d{2}))?h?\b/);
  if (m) {
    const h = parseInt(m[1]), min = parseInt(m[2] || "0");
    if (h <= 23 && min <= 59) return h * 60 + min;
  }
  // 2. Sin emoji: busca HH:MM o HH:MMh o NNh o NN hs
  //    (evita parsear "flexible until 15:30" como hora concreta)
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

// ─── EXTRAER FECHA ────────────────────────────────────────────
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
                      .replace(/#.*$/gm, " ")           // quitar #9, # 6, #TH Lila, etc.
                      .replace(/\d+\s*[''`´]/g, " ")      // quitar duraciones: 60', 90`, 60´
                      .replace(/\d+\s*min\b/gi, " ");    // quitar: 30min, 60 min
  const lower   = quitarAcentos(sinHora.toLowerCase());
  const now     = new Date(); now.setHours(0, 0, 0, 0);

  if (/\b(today|hoy)\b/.test(lower))       return makeResult(new Date(now));
  if (/\b(tomorrow|manana)\b/.test(lower)) { const d = new Date(now); d.setDate(d.getDate() + 1); return makeResult(d); }

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

// ─── RESUMEN HORARIO ──────────────────────────────────────────
function resumenHorario(cfg) {
  return Object.entries(cfg.disponible)
    .map(([d, h]) => `${DIAS[d]} ${h.desde}–${h.hasta}`)
    .join(", ");
}

// ─── INICIAR ──────────────────────────────────────────────────
client.initialize();
