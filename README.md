# 🤖 WhatsApp Availability Bot

> A WhatsApp bot that monitors group scheduling requests, parses dates and times from natural language, and auto-replies **"Available"** when the requested slot fits the user's schedule — with built-in double-booking prevention and a real-time web dashboard.

---

## 🎯 The Problem

In service-based industries (spas, clinics, freelance therapists), professionals often receive dozens of booking requests per day in WhatsApp groups. Manually tracking availability, checking schedules, and replying in time is slow and error-prone — especially when multiple requests arrive simultaneously for overlapping slots.

This bot automates the entire availability-check and reply flow.

---

## ✨ Features

- **Natural language parsing** — understands dates and times in English and Spanish across multiple formats:
  `"Sunday April 5 🕓11:00"`, `"Monday ⏱️10h"`, `"Martes 27 marzo 11:00"`, `"tomorrow"`, `"hoy"`
- **Service-type filtering** — only responds to allowed service types (configurable)
- **Atomic slot claiming** — claims a slot *before* the reply delay, so two simultaneous requests never get the same slot
- **Configurable gap enforcement** — minimum minutes between bookings (default: 90 min)
- **Human-like reply delay** — random delay (2–6 seconds) before responding, so the bot is indistinguishable from a human reply
- **Web dashboard** — real-time UI at `localhost:3000` to manage schedule, view booked slots, and review history
- **Hot config reload** — change availability without restarting the bot
- **Test mode** — safe sandbox group where you can verify bot behavior before going live
- **Remote on/off** — enable or disable the bot via group commands without touching the server
- **Date-specific overrides** — block holidays or set custom hours for specific dates

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| WhatsApp | `whatsapp-web.js` (Puppeteer-based) |
| Web server | Express.js |
| Storage | JSON files — no database required |
| Frontend | Vanilla HTML / CSS / JS |

---

## 🚀 Getting Started

### 1. Install

```bash
npm install
```

### 2. Configure availability

Edit `config.json`:

```json
{
  "botActivo": false,
  "disponible": {
    "4": { "desde": "09:00", "hasta": "14:00" },
    "5": { "desde": "09:00", "hasta": "14:00" }
  },
  "overrides": {
    "25/12": { "bloqueado": true },
    "10/06": { "desde": "09:00", "hasta": "18:00" }
  },
  "serviciosPermitidos": ["Holistic", "Facial", "Body Bliss"],
  "minGapMins": 90,
  "delayMin": 2,
  "delayMax": 6
}
```

Days: `0`=Sun `1`=Mon `2`=Tue `3`=Wed `4`=Thu `5`=Fri `6`=Sat

### 3. Run

```bash
npm start
```

Scan the QR code with WhatsApp on first run. Session persists in `.wwebjs_auth/` — no QR needed after that.

### 4. Open the dashboard

Visit [http://localhost:3000](http://localhost:3000) to manage availability visually.

### 5. Test before going live

Send messages in the **Testing** group to verify behavior:

| Command | Action |
|---------|--------|
| `ping` | Health check (replies `pong ✅` if active) |
| `!bot on` | Enable bot |
| `!bot off` | Disable bot |
| `!bot status` | Show current schedule |

---

## 🖥️ Dashboard

The bot ships with a full web dashboard for managing availability:

- **Calendar view** — shows available, blocked, and custom-hours days at a glance
- **Slot manager** — view and delete individual booked slots
- **Booking history** — log of all accepted requests with service type and time
- **Schedule editor** — configure weekly availability without editing JSON

---

## 🧪 Testing

The project includes a full test suite — no test runner required, just plain Node:

```bash
node test.js          # Date and request-detection parser
node test_logic.js    # 50+ unit tests: availability, slots, services, time parsing
node test_sim.js      # Simulation: should-reply vs should-ignore cases
node test_150.js      # 150 real-world-style requests for end-to-end coverage
node test_random.js   # Stress test with N randomly generated requests
node test_fix27.js    # Regression test: duration strings (60') not confused with dates
```

### Example output (`test_logic.js`)

```
── AVAILABILITY ──────────────────────────────────────────────
✅ Thu 26/03 at 10:00 → available
✅ Thu 26/03 at 07:00 → unavailable (before 08:00)
✅ Override blocked 27/03 → blocked
✅ Custom hours 15/04 at 11:00 → available (10–16)

── SLOTS / DOUBLE BOOKING ────────────────────────────────────
✅ Empty slot → free
✅ Same time 10:00 → blocked
✅ 10:00 + 89 min → blocked (< 90 min gap)
✅ 10:00 + 90 min → free (exactly at gap)

── SERVICE DETECTION ─────────────────────────────────────────
✅ 'Holistic 60' → Holistic
✅ 'deep tissue' → Deep Tissue
✅ 'holiday' → null (no false positive)
✅ 'alcohol' → null (word-boundary check)
```

---

## 📁 Project Structure

```
.
├── bot.js              # Core bot logic + Express server
├── dashboard.html      # Web UI
├── config.json         # Availability, services, timing config
├── slots.json          # Booked slots (auto-managed, gitignored)
├── history.json        # Booking history (auto-managed, gitignored)
├── test.js             # Date / request parser tests
├── test_logic.js       # Unit tests
├── test_sim.js         # Simulation tests
├── test_150.js         # Real-world request coverage
├── test_random.js      # Stress / fuzz testing
└── test_fix27.js       # Regression test
```

---

## 📡 Dashboard API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/config` | Read current config |
| `POST` | `/api/config` | Update config (hot reload) |
| `GET` | `/api/slots` | View all booked slots |
| `DELETE` | `/api/slots/:key` | Remove a day's slots (`?mins=NNN` for a single slot) |
| `DELETE` | `/api/slots` | Clear all slots |
| `GET` | `/api/history` | View booking history |
| `PATCH` | `/api/history/:id` | Mark booking as completed |
| `DELETE` | `/api/history/:id` | Remove a history entry |

---

## ⚙️ How It Works

```
WhatsApp group message
        │
        ▼
  Contains "request"?  ──No──▶ ignore
        │ Yes
        ▼
  Has @mention?  ──Yes──▶ ignore (directed at someone else)
        │ No
        ▼
  Service recognized & allowed?  ──No──▶ ignore
        │ Yes
        ▼
  Date parseable?  ──No──▶ ignore
        │ Yes
        ▼
  Day & time within schedule?  ──No──▶ ignore
        │ Yes
        ▼
  Slot free (gap check)?  ──No──▶ ignore
        │ Yes
        ▼
  Claim slot (atomic, before delay)
        │
        ▼
  Wait 2–6 seconds (random)
        │
        ▼
  Reply: "Available"
```

---

## 📝 Notes

- The bot starts **inactive** by default (`botActivo: false`). This is intentional — always test in the Testing group first with `!bot on` before enabling it for real.
- Internal config keys are kept in Spanish (`disponible`, `overrides`, `bloqueado`, etc.) for backwards compatibility with existing user configurations.

---

## 📄 License

MIT
