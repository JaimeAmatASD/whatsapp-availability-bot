/**
 * bot.js — WhatsApp Availability Bot
 * - Replies "Available" based on days/hours in config.json
 * - Dashboard at http://localhost:3000
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

// ─── HISTORY ──────────────────────────────────────────────────
const HISTORY_PATH = "./history.json";

function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8")); } catch { return []; }
}
function saveHistory(h) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(h, null, 2));
}
function logHistory(dateKey, timeMinutes, service) {
  const h = loadHistory();
  h.push({
    id:       Date.now(),
    fecha:    dateKey,
    mins:     timeMinutes,
    servicio: service || "Unknown",
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
  // Clean up past dates
  const today = slotDateKey(new Date());
  Object.keys(_slots).forEach(k => { if (k < today) delete _slots[k]; });
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
function slotFree(dateKey, timeMinutes, minGap) {
  if (timeMinutes === null) return true; // flexible: no block
  const booked = (loadSlots()[dateKey] || []);
  return booked.every(t => Math.abs(t - timeMinutes) >= minGap);
}
function claimSlot(dateKey, timeMinutes) {
  const slots = loadSlots();
  if (!slots[dateKey]) slots[dateKey] = [];
  slots[dateKey].push(timeMinutes !== null ? timeMinutes : -1);
  saveSlots();
}

// ─── CONSTANTS ────────────────────────────────────────────────
const GROUP_NAME    = "Scheduling Group";
const GROUP_TESTING = "Testing";
const DAYS_SHORT    = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

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

// ─── WHATSAPP CLIENT ──────────────────────────────────────────
const BOT_START_TIME = Math.floor(Date.now() / 1000); // unix timestamp in seconds

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
});

client.on("qr", (qr) => {
  console.log("\n📱 Scan this QR with your WhatsApp:\n");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  const cfg = readConfig();
  if (cfg.botActivo === undefined) { cfg.botActivo = false; writeConfig(cfg); }
  console.log(`\n🤖 Bot ready — ${cfg.botActivo ? "ACTIVE" : "INACTIVE (use !bot on to enable)"}`);
  console.log(`📅 Schedule: ${scheduleSummary(cfg)}\n`);
});

client.on("disconnected", () => {
  console.log("⚠️ Disconnected. Reconnecting in 5s...");
  setTimeout(() => client.initialize(), 5000);
});

// ─── MESSAGES ─────────────────────────────────────────────────
client.on("message_create", async (msg) => {
  try {
    const text = msg.body?.trim() || "";

    // Ignore messages sent before bot started (prevents replay on reconnect)
    if (msg.timestamp && msg.timestamp < BOT_START_TIME) return;

    // Groups only
    const chatId = msg.from.endsWith("@g.us") ? msg.from : (msg.to || "");
    if (!chatId.endsWith("@g.us")) return;
    const chat = await msg.getChat();

    // Control commands — Testing group only
    if (chat.name === GROUP_TESTING) {
      const cmd = text.toLowerCase();
      const cfg = readConfig();
      if (cmd === "ping") {
        await msg.reply(cfg.botActivo ? "pong ✅" : "pong ❌");
        return;
      }
      if (cmd === "!bot on") {
        cfg.botActivo = true; writeConfig(cfg); await msg.reply("Bot enabled");
        return;
      }
      if (!cfg.botActivo) {
        // Test mode: process requests but reply with ❌ instead of "Available"
        if (/petici[oó]n|request/i.test(text)) {
          await processRequest(msg, text, cfg, /* testMode */ true);
        }
        return;
      }
      if (cmd === "!bot off")    { cfg.botActivo = false; writeConfig(cfg); await msg.reply("Bot disabled"); return; }
      if (cmd === "!bot status") { await msg.reply(`Bot: Active\n${scheduleSummary(cfg)}`); return; }
    }

    const cfg = readConfig();
    if (!cfg.botActivo) return;
    if (chat.name !== GROUP_NAME && chat.name !== GROUP_TESTING) return;

    // Detect scheduling request
    if (!/petici[oó]n|request/i.test(text)) return;

    await processRequest(msg, text, cfg, /* testMode */ false);

  } catch (err) {
    console.error("Error:", err.message);
  }
});

// ─── PROCESS REQUEST ──────────────────────────────────────────
async function processRequest(msg, text, cfg, testMode) {
  // Ignore if @-mentioning another therapist
  if (msg.mentionedIds && msg.mentionedIds.length > 0) {
    console.log("👤 Request with @mention — directed to another therapist, skipping");
    return;
  }

  // Ignore if requesting a female therapist
  if (/\bfemale\b|\bmujer\b/i.test(text)) {
    console.log("🚫 Requests female therapist — skipping");
    return;
  }

  console.log(`🔔 ${testMode ? "[TEST] " : ""}Request: "${text.slice(0, 80)}"`);

  // Check service
  const service  = detectService(text);
  const allowed  = cfg.serviciosPermitidos || [];
  console.log(`🛠️ Service detected: ${service || "unknown"}`);
  if (allowed.length > 0) {
    if (!service || !allowed.includes(service)) {
      console.log(`🚫 Service not allowed — no reply`);
      if (testMode) await msg.reply("❌ Service not allowed");
      return;
    }
  }

  // Extract date and time
  const fecha = extractDate(text);
  if (!fecha) {
    console.log("⚠️ No recognizable date — skipping");
    if (testMode) await msg.reply("❌ No recognizable date");
    return;
  }
  const hora = extractTime(text);
  console.log(`📅 Date: ${fecha.readable} (${DAYS_SHORT[fecha.diaSemana]}) | Time: ${hora !== null ? Math.floor(hora/60)+":"+(hora%60).toString().padStart(2,"0") : "flexible"}`);

  // Check availability
  if (!isAvailable(fecha, cfg, hora)) {
    console.log("❌ Not available — no reply");
    if (testMode) await msg.reply("❌ Not available that day/time");
    return;
  }

  // Check slot is free
  const dateKey = slotDateKey(fecha.date);
  const minGap  = cfg.minGapMins || 90;
  if (!slotFree(dateKey, hora, minGap)) {
    console.log(`⛔ Slot taken (min gap ${minGap}min) — no reply`);
    if (testMode) await msg.reply("❌ Slot taken");
    return;
  }

  if (testMode) {
    console.log(`🧪 Test OK — would reply "Available" (bot inactive, slot not claimed)`);
    await msg.reply(`✅ Test OK — would reply "Available"\n📅 ${fecha.readable} | 🛠️ ${service}`);
    return;
  }

  // Claim slot BEFORE delay to prevent race conditions
  claimSlot(dateKey, hora);
  logHistory(dateKey, hora, service);

  // Reply after a random delay to appear natural
  const dMin  = cfg.delayMin ?? 2;
  const dMax  = cfg.delayMax ?? 6;
  const delay = (Math.floor(Math.random() * (dMax - dMin + 1)) + dMin) * 1000;
  console.log(`✅ Slot claimed — replying in ${delay / 1000}s...`);
  setTimeout(async () => {
    await msg.reply("Available");
    console.log(`📤 "Available" sent`);
  }, delay);
}

// ─── AVAILABILITY ─────────────────────────────────────────────
function timeToMins(str) {
  const [h, m = "0"] = str.split(":");
  return parseInt(h) * 60 + parseInt(m);
}

function isAvailable(fecha, cfg, timeMinutes) {
  const dd  = String(fecha.date.getDate()).padStart(2, "0");
  const mm  = String(fecha.date.getMonth() + 1).padStart(2, "0");
  const key = `${dd}/${mm}`;

  // 1. Date-specific override
  const ov = (cfg.overrides || {})[key];
  if (ov) {
    if (ov.bloqueado || ov.inactivo) {
      console.log(`🚫 Date blocked/inactive: ${key}`);
      return false;
    }
    if (ov.desde && ov.hasta) {
      if (timeMinutes !== null) {
        if (timeMinutes < timeToMins(ov.desde) || timeMinutes > timeToMins(ov.hasta)) {
          console.log(`⏰ Time outside custom range (${ov.desde}–${ov.hasta})`);
          return false;
        }
      }
      return true;
    }
  }

  // 2. Weekly template (fallback)
  const schedule = cfg.disponible[String(fecha.diaSemana)];
  if (!schedule) return false;
  if (timeMinutes !== null) {
    if (timeMinutes < timeToMins(schedule.desde) || timeMinutes > timeToMins(schedule.hasta)) {
      console.log(`⏰ Time outside range (${schedule.desde}–${schedule.hasta})`);
      return false;
    }
  }
  return true;
}

// ─── DETECT SERVICE ───────────────────────────────────────────
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

function detectService(text) {
  const lower = text.toLowerCase();
  for (const [name, keywords] of Object.entries(SERVICIOS_KEYWORDS)) {
    if (keywords.some(k => WB_KEYWORDS.has(k) ? WB_COMPILED[k].test(lower) : lower.includes(k))) return name;
  }
  return null;
}

// ─── EXTRACT TIME ─────────────────────────────────────────────
function extractTime(text) {
  // 1. With clock emoji: 🕓11:00, ⏱️ 14h, ⏱️11.45h, 🕓12, ⏱️ ~17h
  const m = text.match(/[🕓⏱][️]?\s*~?\s*(\d{1,2})(?:[:\.](\d{2}))?h?\b/);
  if (m) {
    const h = parseInt(m[1]), min = parseInt(m[2] || "0");
    if (h <= 23 && min <= 59) return h * 60 + min;
  }
  // 2. No emoji: match HH:MM or NNh or NN hs
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

// ─── EXTRACT DATE ─────────────────────────────────────────────
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

const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];

function stripAccents(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, ""); }

function extractDate(text) {
  const sinHora = text.replace(/[🕓⏱][️]?.*$/gm, " ")
                      .replace(/#.*$/gm, " ")
                      .replace(/\d+\s*[''`´]/g, " ")
                      .replace(/\d+\s*min\b/gi, " ");
  const lower   = stripAccents(sinHora.toLowerCase());
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
    readable: `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}` };
}

// ─── SCHEDULE SUMMARY ─────────────────────────────────────────
function scheduleSummary(cfg) {
  return Object.entries(cfg.disponible)
    .map(([d, h]) => `${DAYS_SHORT[d]} ${h.desde}–${h.hasta}`)
    .join(", ");
}

// ─── START ────────────────────────────────────────────────────
client.initialize();
