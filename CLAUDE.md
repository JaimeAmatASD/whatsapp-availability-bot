# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

```bash
# Start the bot
node bot.js

# Unit tests
node test_logic.js

# Simulation with 150 real-world requests
node test_150.js

# Stress test with random requests
node test_random.js 500

# Regression: duration tokens vs. date parsing
node test_fix27.js
```

There is no build step. No linter configured. Tests are plain Node scripts with no test runner — run them directly.

---

## Architecture

All logic lives in `bot.js`. The entry point is `client.initialize()` at the bottom, which starts the WhatsApp Puppeteer session. The Express dashboard runs on port 3000 in the same process.

**Message flow:**

```
message_create
  → group filter (GROUP_NAME or GROUP_TESTING)
  → keyword trigger (/petición|request/i)
  → processRequest()
      → @mention check (skip if directed at another therapist)
      → detectService()
      → extractDate()
      → extractTime()
      → isAvailable() — checks weekly schedule + date overrides
      → slotFree()    — checks minGapMins against claimed slots
      → claimSlot()   ← happens BEFORE the reply delay
      → setTimeout → msg.reply("Available")
```

**Concurrency invariant — critical:**  
`claimSlot()` is called *before* the random delay (`delayMin`–`delayMax` seconds). The delay is cosmetic. This ensures two simultaneous requests for the same slot both pass `slotFree()` only if the slot is actually free — the first to call `claimSlot()` wins. Never move the claim after the delay.

**Config hot-reload:**  
`fs.watchFile` sets `_cfg = null` when `config.json` changes. The next `readConfig()` call re-reads the file. This allows dashboard updates without restarting the bot.

**Slot storage (`slots.json`):**  
Keyed by `"DD/MM/YYYY"`. Values are arrays of times in minutes since midnight (`h*60+m`). Past dates are pruned on load. `minGapMins` is checked with `Math.abs(t - timeMinutes) >= minGap` — this blocks slots both before *and* after an existing booking.

**Date/time parsing (no external library):**  
- `extractDate()` strips duration tokens (`60'`, `NNmin`) and clock emoji tails before scanning for weekday names, month names, or bare day numbers. This prevents `60'` from being parsed as day 27.
- `extractTime()` prioritises clock emoji (`🕓`, `⏱️`) patterns, including `11.45h` (dot as decimal) and `~17h` (approximate). Falls back to `HH:MM` or `NNh/hs` only when no emoji is present.
- Service detection uses word-boundary regex for short keywords (`hol`, `deep`, `cali`, etc.) to avoid substring false positives like `alcohol` → `Holistic`.

**Availability resolution:**  
`isAvailable()` checks date-specific overrides (`config.overrides["DD/MM"]`) first, then falls back to the weekly template (`config.disponible["0"–"6"]` where 0=Sunday). An override with `bloqueado: true` or `inactivo: true` blocks the date entirely; one with `desde`/`hasta` replaces the weekly hours for that day.

**Testing group (`GROUP_TESTING`):**  
When `botActivo` is `false`, requests in the testing group are processed but replied with `❌` instead of `"Available"`, and slots are not claimed. Commands `!bot on`, `!bot off`, `!bot status`, and `ping` are handled in this group only.

---

## Config reference (`config.json`)

| Field | Description |
|---|---|
| `botActivo` | Master on/off switch |
| `disponible` | Weekly schedule: keys are JS `getDay()` values (0=Sun), values `{desde, hasta}` in `"HH:MM"` |
| `overrides` | Date-specific overrides keyed `"DD/MM"`, values `{bloqueado?, inactivo?, desde?, hasta?}` |
| `serviciosPermitidos` | Whitelist of service names; empty array = accept all |
| `minGapMins` | Minimum minutes between booked slots (default 90) |
| `delayMin` / `delayMax` | Reply delay range in seconds (cosmetic, does not affect slot logic) |

---

## Known edge cases (covered by tests)

- `60'` (service duration notation) must not be parsed as day 27 — `extractDate()` strips `\d+\s*[''` `` ` `` `´]` before scanning.
- `#9 Cliente` in message text must not be parsed as day 9 — `extractDate()` strips `#...` lines before scanning.
- Short keywords (`hol`, `cali`) use `\b` word-boundary regex to prevent substring matches.
- Messages with `@mentions` (`mentionedIds.length > 0`) are skipped — the request is directed at another therapist.
- Messages requesting a female therapist (`\bfemale\b|\bmujer\b`) are skipped.
- Messages older than `BOT_START_TIME` are ignored (prevents replay of buffered messages on reconnect).
