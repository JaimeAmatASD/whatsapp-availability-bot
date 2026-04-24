# WhatsApp Calendar Bot

Automated WhatsApp bot for managing appointment requests at a wellness spa ("CR Wellness 2026"). Listens to WhatsApp group messages, checks availability, and responds "Puedo" when a time slot is free.

## Tech Stack

- **Runtime**: Node.js
- **WhatsApp**: `whatsapp-web.js` (Puppeteer-based WhatsApp Web automation)
- **Web server**: Express.js
- **Storage**: JSON files (`config.json`, `slots.json`) — no database
- **Frontend**: Vanilla HTML/CSS/JS dashboard at `http://localhost:3000`

## Setup & Run

```bash
npm install
npm start        # node bot.js
```

On first run, a QR code appears in the terminal — scan with WhatsApp mobile to authenticate. Session persists in `.wwebjs_auth/`.

## Tests

No test runner — run individual test files with Node:

```bash
node test.js          # date/service parsing
node test_logic.js    # availability & slot logic
node test_sim.js      # full simulation
node test_150.js      # extended coverage
node test_fix27.js    # specific regression
```

## Key Files

| File | Purpose |
|------|---------|
| `bot.js` | Main bot logic (~385 lines) |
| `config.json` | Availability template, service types, delays |
| `slots.json` | Booked appointment slots |
| `dashboard.html` | Web UI for managing availability |

## Configuration (`config.json`)

- `botActivo`: enable/disable the bot
- `disponible`: weekly availability by day (`0`=Sunday … `6`=Saturday), each day has `desde`/`hasta` (HH:MM)
- `overrides`: date-specific overrides (DD/MM) — can block a day or set custom hours
- `serviciosPermitidos`: allowed service types (Holistic, Deep Tissue, Aromatherapy, etc.)
- `minGapMins`: minimum minutes between bookings (default 90)
- `delayMin`/`delayMax`: random reply delay in seconds (default 2–6)

Config is hot-reloaded every second — no restart needed for changes.

## Bot Behavior

- Monitors groups: **"CR Wellness 2026"** and **"Testing"**
- Only processes messages containing `"petición"` or `"request"`
- Ignores messages with `@` mentions or mentioning `"female"`/`"mujer"`
- Parses date (Spanish/English: today, tomorrow, weekday names, day numbers)
- Parses time (emoji-based, HH:MM, "Xh"/"Xhs")
- Reserves slot immediately (before delay) to prevent race conditions
- Replies after a random delay to appear natural

## Startup behavior

The bot starts **inactive** (`botActivo: false` in `config.json`). This is intentional — test in the Testing group first with `!bot on` before enabling it for real.

## Bot Commands (in Testing group)

- `hola1` — health ping (bot replies `hola2 ✅` if active, `hola2 ❌` if off)
- `!bot on` — enable bot
- `!bot off` — disable bot
- `!bot estado` — show current status and schedule

## Dashboard API

- `GET /api/config` — read config
- `POST /api/config` — update config
- `GET /api/slots` — read booked slots
- `DELETE /api/slots/:key` — delete a day's slots (add `?mins=NNN` to remove a single slot)
- `DELETE /api/slots` — clear all slots


----------------------------------------------