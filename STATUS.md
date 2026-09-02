# Liquid Watch — STATUS

_Last update: 2026-09-01 (traces on glass: dried residue smears, sim + firmware)_

## Toolchain (decided)
- **PlatformIO 6.1.19** (installed via `pipx`, binary `~/.local/bin/pio`) + **pioarduino platform 55.03.311**
  = Arduino core 3.3.11 on ESP-IDF 5.5.5. Stock `espressif32` platform is stuck on Arduino 2.x and can't
  build Waveshare's `esp_lcd`-based display driver; the wiki requires core ≥3.3.0.
- Board: `esp32-s3-devkitc-1` with overrides for the N16R8 module (16 MB QIO flash, 8 MB OPI PSRAM,
  `default_16MB.csv`, USB CDC on boot). No ready-made board JSON exists for this Waveshare board.
- Serial/flash port: `/dev/ttyACM0` (native USB-JTAG/serial, VID:PID 303A:1001). User is in `dialout`.
- Commands (from `firmware/`): `pio run` · `pio run -t upload` · `pio device monitor`
- Display path: Waveshare's `esp_lcd_sh8601` driver (copied verbatim into `firmware/lib/esp_lcd_sh8601/`),
  init sequence verbatim from their `03_LVGL_V8_Test.ino`. Drawing via Adafruit GFX into a 536×240 RGB565
  framebuffer in PSRAM, staged through two 72-row internal DMA strip buffers (owned by display.cpp).
  Note: the driver does NOT support `esp_lcd_panel_swap_xy` (aborts) — orientation comes from MADCTL (0x36).
  `-DUSB_LEFT=1` (default) uses MADCTL 0x30 = USB-C on the left; 0 gives Waveshare's 0xF0 (USB right).
  Panel wants big-endian RGB565: `PsramCanvas` stores pixels pre-byte-swapped so the push is a plain memcpy
  (swapping at push time cost ~20 % fps). Before the fix the green bars rendered blue.
- Serial monitor: `pio device monitor` is silent until you send a command (firmware only prints on request);
  `echo h > /dev/ttyACM0` also works.

## Pinout (verified from Waveshare demo code AND arduino-esp32 variant `waveshare_esp32_s3_touch_amoled_191`)
| Function | GPIO |
|---|---|
| AMOLED QSPI CS / PCLK | 6 / 47 |
| AMOLED QSPI D0 D1 D2 D3 | 18 7 48 5 |
| AMOLED RST | 17 |
| AMOLED TE / PWR_EN / backlight | none (-1) — brightness via cmd 0x51 |
| I2C SDA / SCL (QMI8658, also touch on touch SKU) | 40 / 39 |
| QMI8658 address | 0x6A or 0x6B (firmware probes both; WHO_AM_I = 0x05) |
| QMI8658 INT1 / INT2 | 45 / 46 (variant header) |
| Battery ADC | GPIO1 = ADC1_CH0, 12 dB atten, voltage ×2 divider |
| TF card (SDMMC 1-bit) | D0=8, CMD=42, CLK=9 |
| UART0 | TX 43, RX 44 |
| Panel QSPI clock | 40 MHz (demo default) |
RTC: the demos contain no external RTC driver — assume ESP32-S3 internal RTC only (verify on schematic in `vendor/waveshare/` if needed).

## What is flashed on the board right now
`firmware/` @ this commit. Boots into the **liquid face** (`l`) = 1:1 port of the sim renderer + physics
with `presets/1.json` baked in, driven by the live IMU at 50 Hz; **~40 fps**. Serial commands @115200
(newline-terminated): `l` liquid, `c` calibration face, `h` hello, `f` fps bench, `s` status line,
`i` IMU CSV stream, `t HH:MM[:SS]` set clock (no RTC battery — defaults to 10:09:30 at boot),
`d<N>` demo speed (×N, `d0` freeze, `d1` real), `p<name>=<value>` set ANY param live by its sim name
(`pliquid=#39ff14`, `pfizz=0`, `pmeniscusDepth=-10`), `p?` dump params as JSON (sim-importable), `p!` reset
to the preset, `b<0-255>` panel dimmer, `r` reboot, `?` help. Same protocol over **BLE** (Nordic UART Service,
advertised as `liquid-watch`; NimBLE-Arduino, RX queued into `loop()`, replies notified in MTU-3 chunks).
`TUBE_HEIGHT_MAX` = 80: the two internal-DMA strips (2 × 536 × 80 × 2 B) must leave room for the BT controller,
else `display_init` fails at boot before `ble_init`.

## Firmware e2e testing (from `firmware/`)
- `tools/device.py [CMD ...]` — serial transport, auto-detects the board: `/dev/ttyACM*` when usbipd-attached
  to WSL, otherwise the Espressif COMx on Windows through a `python.exe` bridge (`$LW_PORT` overrides).
  Opens with DTR=RTS=1 — pyserial's default open sequence *resets the ESP32-S3* (DTR0/RTS1) on both OSes.
- `tools/bench.py [--stages] [--stage name=v]` — fps in a pinned scene (`t 10:09:30`, `d0`, `inputGain=0`),
  median of N 2-s windows; `--stages` toggles digits/ticks/fizz/glow/… off one at a time and prints each
  stage's cost in ms. Touched params are restored from a `p?` snapshot (not `p!`, which would clobber NVS).
- `tools/compare-device.py` — pixel parity of both strips vs the sim renderer (`x` dump); bar: mismatches
  must not grow, none > 12/255.
- `tools/flash.sh` — `pio upload` over `/dev/ttyACM*` or `flash-win.sh` when the board is on Windows.
- `tools/e2e.sh [--stages] [--no-ble] [--no-flash] [--label X]` — build → flash → bench → parity, appends to
  `firmware/.compare/e2e.log`. `--no-ble` builds with `-DNO_BLE` (stubs in ble.cpp).
- Boot banner now ends with `reset <reason>` (`esp_reset_reason`: poweron/sw/panic/task-wdt/brownout/usb/…);
  `device.py` prints `BOARD REBOOTED (<reason>)` whenever a banner shows up in a reply.
- BLE disconnect does **not** reboot the board: 6 connect→subscribe→disconnect cycles from Windows
  (`tools/ble-session.py`, bleak under `python.exe`; also does full command/notify round trips), serial shows `ble: connect` … `ble: disconnect 531`, no banner, clock intact.
- Serial-open resets: explicitly clearing DTR/RTS at open reset the board 5/5 in one session and 0/2 later
  (timing-dependent); DTR=RTS=1 never did. Keep device.py's open sequence.
- Scene matters: fps varies 19–25 with fill level / tilt, so only compare pinned-scene numbers.

## Perf baseline (2026-08-27, f0a3de7, `-Os`, BLE on, preset from NVS, sprite font 7 @ 3.5×3.25)

- **20.6 fps, render 44.4 ms, push-wait 0.02 ms** — entirely render-bound; ~4 ms/frame of non-render loop
  (physics, IMU, serial). No-BLE build: 20.0 fps / 46.1 ms → BLE costs nothing at render time.
- Stage costs (render ms saved when off): **digits 20.7**, edgeGlow 4.0, ticksH 3.9, fizz 2.7, ticksM 2.3,
  lens 0.8; digitShadow, meniscus, wetFilm, glass*, transparency ≤ 0.2 each.
  → the sprite-digit compositing is half the frame: hand-off 3 (layer cache) is the big lever, not the math.
- Parity: 163–221 of 77184 px differ by ≤ 1 LSB (digit glyph rounding), 0 px > 12/255.

## Perf hand-off 1 (2026-08-27, docs/perf-handoff-1-math.md) — 20.6 → 38.6 fps, bit-exact
| step | fps | render ms |
|---|---|---|
| baseline `-Os` | 20.6 | 44.4 |
| `-O2` (`build_unflags = -Os`) | 25.1 | 35.9 |
| + params generation counter, param-only caches, integer mark path, glyphs on internal heap (lazy) | 42.0 | 20.0 |
| same, but deterministic memory: glyph pool in PSRAM (boot-time), glow tables static | 36.0–38.6 | 22.0–23.9 |
- Stage costs after (ms, final run): digits 9.8 (was 20.7), edgeGlow 3.4, ticksH 2.1, fizz 1.4, ticksM 1.3, lens 0.4.
- `paramsGen` (main.cpp) is bumped on every `p` write, `p!`, NVS restore and passed to `renderTube`;
  every param-only table in render.cpp is keyed on (gen, H): tick/lens row warps, lens row map, fizz
  magnification, corner mask, meniscus row terms, label layout (+ its two motion-derived ints), palette
  (+ exact `light`), edge-glow 565 tables (+ exact `lightK`). Exact float keys instead of the ½° quantisation
  the hand-off suggested: hits at rest, bit-exact in motion.
- Mark path is integer: transparency/contrast hoisted into `Mark`, sprite alpha via a 256-entry LUT built
  from the float formula, tick emboss via per-channel LUTs, tick warped ranges once per (wet/dry, minor/major).
- Memory: internal heap after BLE init is **37 KB** free (59 KB static). Glyph pools (2 × 18 KB) therefore live in
  PSRAM, allocated once in `render_init()`; putting them in internal RAM is worth ~2 ms but the BT controller
  then fails to start (build with 100 KB static hung in `ble_init`). Rule: no lazy allocation (CLAUDE.md).
- Parity unchanged: preset 1 / mercury / glow 0 px > 12/255; cryo (132 px) and free (1 px) deviate identically
  on the pre-change firmware — pre-existing, see KAIZEN.

## Perf hand-off 2 (2026-08-27, docs/perf-handoff-2-dualcore.md) — 38.6 → 45.5 fps, bit-exact
| build | fps | render ms (wall) | cores h / m ms |
|---|---|---|---|
| hand-off 1 final (sequential) | 38.6 | 22.0 | — |
| one tube per core (worker stack 8 KB) | 45.5 (spread 43.5–46.0) | 13.9 | 14.7 / 10.6 |
| final: worker stack 4 KB (~1.5 KB used) | 44.1 (spread 42.1–44.6) | 14.6 | 14.7 / 10.6 |
- `render.cpp`: all per-frame mutable state (strip pointer/geometry, row cache, edge and bound arrays, palette,
  labels, glow tables, glyph pool, fizz) lives in a static per-tube `Tube` context (`tubes[2]`, ~9 KB each,
  fixed footprint); `Mark` carries a reference to its tube; LUTs are built once in `render_init()`. Only the
  read-only LUTs and `tubes[2]` remain file-static, so `renderTube(0)` and `renderTube(1)` may run concurrently.
- `main.cpp`: pinned core-0 task `render0` (prio 1, 4 KB stack, ~1.5 KB used) draws hours into `strip[0]` while
  `loop()` (core 1) draws minutes into `strip[1]`; task-notification hand-shake both ways. Outside `renderBoth()`
  the worker is blocked, so serial/BLE commands, param writes, physics and `x` need no snapshot. Both strips are
  pushed after the join; `display_wait_pending(display_bands(H))` frees the hours strip as soon as its own DMA
  bands finish while minutes' are still in flight (push-wait stays 0.01 ms).
- `f` prints `cores h / m` (per-core render ms); `s` prints `worker-stack-free` (bytes).
- Stage costs (ms of the wall time): digits 7.1, edgeGlow 2.2, ticksH 2.0, fizz 1.2, ticksM 0.5.
- Soak: `d60` for 60 s — no watchdog / reboot, heap and worker stack unchanged; worst frame 36 fps with both
  tubes filling (cores 19.1 / 17.8). BLE central connected: 41.0 fps vs 41.2 unconnected, NimBLE left on core 0.
- Parity: 191–209 px (bench) / 140 px (after soak) ≤ 1 LSB, 0 > 12/255. The 45.5 vs 44.1 gap is within the
  medians' spread (see KAIZEN from hand-off 1: always compare medians of ≥5).

## Push "crash" (2026-09-01, fixed) — DualOut blocked on a full CDC ring
- Symptom: pushing a preset (BLE push, or any push while the CDC host was gone with DTR still
  asserted) froze the board: replies stopped after ~7 `ok`s, fps collapsed to ~1.2 (render 13 ms —
  loop() itself crawled at ~10 bytes/s), minutes-long self-recovery; user-visible as a dead/black
  screen. Traces themselves were exonerated: traces=1 + d3600 sweep + full serial blood push were all clean.
- Root cause: `DualOut::write` wrote every reply byte to `Serial` unconditionally; with the CDC host
  absent (or a stale asserted DTR with no reader) the 256-byte HWCDC ring filled and each further
  byte cost `tx_timeout_ms` (default 100 ms) in `xRingbufferSend` — 5 KB of echo+replies per preset
  push = minutes of grind inside `loop()` (NimBLE host on core 0 compounded the render starvation).
- Fix: `Serial.setTxTimeoutMs(10)`, DualOut stages per line and flushes in one bulk
  `Serial.write(sBuf, n)` gated on `Serial.isConnected()`. (First attempt used timeout 0: a momentary
  host read-gap then dropped bytes mid-line — the `p?` JSON arrived truncated; per-byte writes are
  either wedge-prone or lossy, per-line bulk is neither.) Verified: serial push 150 params in 15 s @
  47 fps. BLE-push re-verification pending (Windows radio was off).

## Traces on glass (2026-09-01, sim + firmware, bit-exact pipeline)
- A receding edge leaves a **residue** on the glass where the liquid has been (blood smear, syrup
  coating, legs); the wet part **drains back after the liquid**, the stain dries: `traces` (bool),
  `traceAmount` 0..2 (>1 boosts through the attenuation, clamped per pixel), `traceDry` 0.1–2 s
  when flat — tilting along the tube dries up to 5× faster (`TRACE_TILT_DRY`), `traceThin` 0–3
  (edge speed thins the deposit; at 1, 100 px/s halves it — `TRACE_THIN_REF_PX_S`),
  `traceFollow` 1/s (drain-back rate at 25 px from the liquid),
  `traceStain` 0..1 (fraction of a fresh deposit the drain-back leaves behind; on-screen stain
  opacity ≈ traceStain × traceAmount).
  Params v15 unchanged (additive keys; NVS CRC changes → stored params fall back to the preset).
- Physics (sim `stepTube` / fw `stepTube`, identical): per-tube residue `Uint16Array(536)` (8.8
  fixed point, high byte renders) in **panel-frame columns**; an edge that receded saturates
  (`TRACE_FULL` 0xff00) the columns it uncovered — mid-row edges only (`xt = slugPos + fillPos`
  mirrored / `xh + len + fillPos`, home edge for a free slug), deposit capped at 32 px/tick
  (`TRACE_DEPOSIT_MAX_PX`) and **thinned by the edge's speed** (÷(1 + traceThin·v/100 px/s)): a
  fast sweep stretches the film, so a slosh smear comes out faint at its far end and dense toward
  where the edge slowed — toward the liquid. Decay, per column ×tick (linearised, floor-rounded),
  **two-phase** so traceStain visibly matters at second-scale drying: the wet excess above the
  **stain floor** (traceStain·full × hash 0.7–1) settles ONTO the floor at
  `traceFollow · dist/25px + 1/traceDry` per second — dist from the current liquid span, so the far
  tail of a smear collapses first and the band visibly follows a receded edge — and only residue
  at/below the floor dries toward zero ×(1 − u·(1 + 4·|along|)·dt/traceDry), making the stain the
  plateau the fade pauses at; a second hash channel `u` 0.75–1.25 scatters the rates (`traceUneven`, same
  integer hash both sides, salted differently from the render's `traceStreak`). < 2·256 → 0; off →
  buffer zeroed on transition. **Why 16-bit + floor**: the v1 `Uint8` round-to-nearest stalled — at
  50 Hz any traceDry > ~10 s decrements < 0.5 LSB and 255 rounds back to 255, so blood never dried;
  floor is monotone (worst case 1 LSB/tick) and the faintest stain always clears. Buffers: sim
  `newTube()`, fw static `g_trace[2][536]` (uint16) assigned to `TubeState.trace` in `setup`.
- Render (sim step 3d / fw "3d", drawn after the glow + wet film, mirrored index for `remaining`):
  per column: residue → ±4 px triangular blur (tapers the smear's outer end — the dense turnaround
  deposit next to bare glass — into a tide mark instead of a 1-px cliff) → ^0.65 (`TRACE_GAMMA`
  value→alpha lift — a dried stain at ~0.2–0.5 of full
  would otherwise drown in the opacity stack) × `traceStreak(x + idx·6151)` (same integer hash both
  sides — static vertical texture, 0.82–1: subtle, not stripes) × wall weight `0.4 + 0.6·d²`, colour = liquid row
  × 0.85 (dried). Drawn late
  because the glow/wet-film passes paint the dry side with plain overwrite — drawn earlier they
  wiped the smear off the band next to the edge (`edgeGlow` px gap); pixels under the column are
  skipped so an edge that advanced back over residue covers it again. Cost bound: per-column alpha
  precomputed, rows skip a=0; fw uses the integer `pxaT` path; the gamma is a lerped 256-entry LUT
  (fw `LUT_traceGamma` built in `buildLuts`, sim mirrors) — no powf per column.
- Perf: `TubeState.traceLo/traceHi` track the occupied column range (deposits widen it, the decay
  pass re-tightens it every tick; lo ≥ hi = empty). The physics decay iterates only that range and
  the whole render layer is skipped when it's empty — copy/blur/alpha/draw loops run over the range
  ±4 px (blur reach) instead of all 536×H pixels, so no residue ⇒ ~zero cost (was ~3 ms/frame flat).
  On-device (interleaved A/B bench): traces-on-empty = traces-off to ±0.02 ms (was +3.02 ms); heavy
  residue (~585 columns) costs ~14 ms of pure `pxaT` blending — same as before, see KAIZEN. Parity
  with residue: all trace-attributable deltas are exactly 1 RGB565 LSB (the gamma-LUT lerp).
  `render-ref.ts` recovers the bounds by scanning the dumped buffer. NOTE: anything poking
  `trace[x]` directly (test scripts) must also widen `traceLo/traceHi` or the residue is ignored.
- Presets (amount / dry s / follow / stain / thin): blood (1.1 / 1.5 / 0.25 / 0.35 / 0.8), honey
  (0.7 / 2 / 0.08 / 0.45 / 0.3 — syrup barely crawls, coats thickly whatever the speed), ink (0.5 /
  1.2 / 0.5 / 0.4 / 1.5 — thin, snaps back to a stain), malt (0.45 / 0.6 / 0.35 / 0.2 / 1.2).
  `check:presets` rule: non-wetting/plasma must be off; on ⇒ amount 0.2–2, dry 0.1–2 s, follow 0–1
  (viscous ≤ 0.15, watery ≥ 0.2), stain 0.05–0.7, thin 0–3.
  Presets re-dumped, `params_gen.h` regenerated, `presets/1.json` patched (traces off).
- Parity: the `x` dump gained a `TRACE ` line (space-separated, **4 hex chars per column** — keep
  the separator, compare-device counts the tokens); `compare-device.py` passes it to
  `render-ref.ts` (decoded into `TubeState.trace`). Bench: `--stages` measures `traces` off.
  Parity with v1 residue live: 54 px mismatched, 0 > 12/255 (better than the pre-trace ~200 px
  baseline); re-verify after the 16-bit drain-back rework. Drain-back verified in sim (blood,
  seeded 160-px smear: far tail collapsed to its uneven stain floors in ~5 s while the band at the
  edge stayed wet, then slow fade; buffer values sampled at 0/6/18 s).

## Measurements
- CPU 240 MHz, PSRAM 8192 KB, free heap 332 KB at boot.
- **fps (full frame 536×240×16bpp):** 32.3 fps render+push, **41.7 fps push-only**, **71.4 fps pushing only
  the two 72-px tube strips**. Target ≥30 met; dirty-strip path gives plenty of headroom.
- IMU: QMI8658 at 500 Hz ODR, ±8 g / ±1024 dps, streamed at 50 Hz. Board flat on desk, screen up:
  a ≈ (-0.19, -0.06, +0.92) g, gyro bias ≈ (-1.4, 0, 0.4) dps. |a| ≈ 0.94 g (slight scale/offset, fine).

## Open problems / to verify with the user (need eyes on the panel)
- [x] Calibration face visible, centred lines OK (user confirmed 2026-08-20). Colour was blue → byte-order fixed.
- [x] Orientation confirmed (USB-C left) and R/G/B swatch order correct (user, 2026-08-20).
- [ ] USB-C side in the cuff: defaulting to LEFT (no cuff yet; flip with `-DUSB_LEFT=0` if that changes).
- [x] IMU axis mapping measured (see `spec/layout.h`): **Y along the tube** (USB end up → ay −0.64 g),
      **X across** (far edge up → ax −0.72 g), Z out of screen. |a| ≈ 0.94 g at rest → normalize, or
      calibrate scale later.
- [~] #5DCAA5 reads as mint/turquoise on the AMOLED — channel order verified correct, so this is the spec colour
      itself. Final shade tuning deferred to Phase 2/3 (serial palette-nudge mode).

## Next step
**Phase 1 complete** (calibration face confirmed visually by user, IMU streamed + axes mapped, fps recorded).
→ Phase 2: browser-based liquid simulation (Vite + TS + Canvas), `spec/layout.ts` mirroring `spec/layout.h`.

## Phase 2 — browser simulator (`sim/`)
- Vite + TS, no framework. `cd sim && npm install && npm run dev` → http://localhost:5173
- Renders into a real RGB565 `Uint16Array` framebuffer (exact 565 quantisation) using only row spans /
  pixels / a per-row colour LUT, so the routine ports 1:1 (`sim/src/render.ts` is the spec; `firmware/src/render.cpp` mirrors it).
- Fixed-step 50 Hz physics (`sim/src/physics.ts`), decoupled from rAF rendering. IMU axes mapped via `spec/layout.ts`.
- Inputs: sliders / drag on the panel, phone DeviceOrientation, **Web Serial or Web Bluetooth to the board's `i` stream** (Chrome; link picker in the Device box).
- Time: real / demo (×N) / set HH:MM. Leather-cuff overlay with slot inset, acrylic-vial lens remap and gloss
  (presentation only, not ported). Layout-grid toggle shows the bridge zone.
- All tunables in `sim/src/params.ts` (`DEFAULT_PARAMS`), live panel, export/import JSON.
  Current defaults: `sim/params.json`.
- **Presets** (`PRESETS` in `sim/src/params.ts`, picker in the panel bar, `?preset=<id>`): each is a whole
  look — liquid optics, glass, scale, labels and the physics of that liquid's density and viscosity — and is
  applied over `DEFAULT_PARAMS` (`presetParams`), so a preset is reproducible whatever the session held.
  All liquids share `MODERN_BASE` (from `examples/nice_meniscus.json`: thin tubes at the panel edges, lens −0.5,
  physical light, rear sprite digits every hour / 5 min, free slug); opaque ones and lab glass use `FRONT_PRINT`.
  Each preset declares a *material* (`mat`: viscosity class, opacity, emissive, wetting, gas) and
  `npm run check:presets` (`sim/tools/check-presets.ts`) enforces the ranges that material implies — spring
  ζ, slosh, meniscus stiffness/lag/film, transparency vs rear-vs-top marks, glow only when emissive, fizz
  only with gas… (rules and the full list: `presets/PRESETS.md`). 2026-08-27 set: `frizzante` (colourless
  sparkling water) · `urine` · `blood` · `milk` · `mercury` (etched scale on top: nothing shows through
  metal) · `honey` (overdamped, clings) · `cola` · `malt` · `champagne` · `cryo` · `ink` · `glow` (glow
  stick, emissive) · `xenon` (plasma, no inertia) · `molten` · `free` (user-tuned slug, exempt from the
  checker); each also as `<id>-big` for the wider rod (`bigLens()`, 72 px tubes, lens −0.05). Legacy `user1` / `mint` / `neon` / `concept` and `sparkling` are gone. Panel shots:
  `images/presets/<id>.png` / `<id>-big.png` (+ `contact-sheet.png`, `contact-sheet-big.png`).
  `npm run dump:presets` writes each as a full params JSON into `presets/<id>.json` — the input format of
  `firmware/tools/gen_params.py`.
- Brightness is layered: `brightness` = panel dimmer (0x51), plus per-layer trims `liquidBright` /
  `tickBright` / `digitBright` in the Colour group. Dimming the digits sits them in the shadow at the bottom
  wall of the tube; the trim also scales that layer's `markContrast` floor, so the shadow survives over the
  liquid. `tubeBack` follows the panel dimmer only.
- Tube backs use the same fast row LUT as the liquid: `tubeBack` / `tubeBack2` can render solid,
  top-to-bottom, centre-band, or edge-band gradients across the short axis. The procedural rear-wall decal
  layer was removed (2026-08-27): per-pixel blending of a dense texture cost ~10 ms/frame on the device and
  even the baked/cached variant hurt frame rate; see KAIZEN.
- Digits include five bitmap fonts and seven generated image fonts: steel, brass steampunk, copper gauge,
  forged iron, ivory enamel, carved slate, and amber resin. Image fonts remain behind the liquid/glass layers
  and support brightness, tint, and black-to-white tone controls in the simulator and firmware.
- **Autosave** (`sim/src/persist.ts`): every edit — params, including lens calibration, and view state (zoom, cuff/gloss, layout grid,
  pause, time mode, tilt) — is written to `localStorage['liquid-watch-session-v1']`, debounced 250 ms, flushed on
  pagehide. One delegated `input` listener on `#app` covers every control. Nothing is lost on reload, so
  **Export JSON is only for checkpointing a finished look into `sim/params.json`**, and it still exports params
  only — view state never pollutes the firmware contract. `reset view` button restores the view defaults.
  Caveat: a stored value always beats a changed `DEFAULT_PARAMS`, so after editing defaults in code open
  **`?fresh=1`** to see them (it ignores the store without clearing it). Input source (device / serial) is not
  persisted — those need a user gesture.
- Scale minor and major widths are independently configurable (`tickMinorWidth*`, `tickMajorWidth*`); majors are placed every N **units**
  (`tickMajorEvery*` counts hours/minutes, migrated from the old "every N-th minor" via `params.v`).
  `ticksOnTop` selects the rear/bottom or front/top surface. Both use the cylinder `tickLens` and follow the whole-tube lens. Tilt-driven
  `tickParallax` projects them through the circular rear-half depth, producing a bow while keeping the outer endpoint attached to the tube silhouette. `tickEmboss` adds glass-cut highlight/shadow edges.
  `tickPosH/M` independently select the top, bottom, or both edges.
  Marks inside the liquid keep a minimum luma distance from it (`markContrast`). Contract: `throughLiquid` in `sim/src/render.ts`.
- Layer order is rear ticks → rear digits → bubbles/fizz → front ticks → tube lens remap → front digits. Ticks are never dropped for label bounds; later marks overwrite only intersecting pixels. `lens` and `lensCurve` use the same nearest-row remap in the simulator and firmware; `lensSmooth` is a simulator view option. Top ticks follow the curved tube. Top digits stay outside the tube lens; signed `topLens` independently pre-distorts them to compensate physical glass.
- URL params, applied on top of the restored session: `?fresh=1&preset=frizzante&t=10:09&along=0.3&across=0&settle=1&cuff=0&lens=0.6&lenscurve=1&lenssmooth=1&leather=black&grid=1&scale=3&demo=120&p.<key>=<v>`.
- Parts sourcing research: `docs/parts-sourcing.md` (board is 57.5 × 24.5 mm; 8×4 mm acrylic half-round rod recommended).
- **Pinned-liquid model + IMU hardening (2026-08-20, session 3)** — real accelerometer input no longer sends
  the visuals crazy, and the liquid can never appear/disappear with motion: `serial.ts` normalises by a slow
  gravity EMA (`GravityNorm`) instead of per-sample `|a|` (which amplified jerks 3-5×); `ImuFilter` clips tilt
  at ±1.2 g and low-passes accel with two cascaded poles; `stepTube` hard-caps slosh at ±14 px and surface
  angle at ±12° (`FILL_SLOSH_MAX_PX` / `ANGLE_HARD_MAX_DEG`, structural — params only tighten). Tilt now mostly
  changes the *light*: `edgeLightGain` scales frontBright + edge glow via `TubeState.edgeLight`. Params **v3**:
  migration drops stored physics/IMU tunings so the new soft defaults (fillSloshGain 6, angleTiltGain 5,
  angleMax 8, accelLpHz 1.5 …) take effect even with autosave. Regression: `npm run check:imu`
  (`sim/tools/replay-check.ts`) replays rest / wrist-wave / 3 g flicks / free-fall / ±90° / shake; worst edge
  deviation 18.3 px (budget 31.2) at sustained ±90°. Follow-up same day: ALL input sources (manual
  sliders/drag, flick, shake — injected as raw pre-filter values) now run through `ImuFilter`, so the
  IMU-filter sliders are feelable in the browser without the board (drag = accel LP lag, flick/shake = gyro
  HP/deadzone/clamp); per-frame readouts (`#imuraw`, slider outputs, fps, serial status) got fixed boxes +
  fixed-format text so the control menus no longer twitch from reflow (root cause of the recurring Tilt-input twitch: fieldset's default `min-inline-size: min-content` let the variable-length raw-CSV line widen the box past `width: 340px` — now `min-inline-size: 0` + fixed-length raw text). A live **IMU scope** (canvas in the
  Tilt-input fieldset, ~6 s window) plots raw vs filtered accel (grey/mint, ±1 g) and gyro (dim/bright blue,
  ±gyroMax) — the liquid's response is deliberately tiny, so filter tuning is judged on the scope, not the
  tube. Flick button = decaying ~150 ms raw gyro pulse (a single-sample kick died in the deadzone). Drop-end realism: `meniscusTiltGain` (tilt into the end bulges the meniscus, away flattens) and `meniscusAsym` (bottom-cling: mild at rest, gone when end-down — cap fills round, max when end-up — draining tail clings to the bottom wall), both driven by the smoothed `edgeLight` tilt, formula in `edgeX` (`sim/src/render.ts`).
- Open: user sign-off on the look; final palette; leather texture asset (`sim/public/assets/leather-tile.jpg`,
  CSS falls back to procedural noise if missing).

## Phase 3 — firmware liquid face (2026-08-20, session 4)
- `firmware/src/render.cpp` / `physics.cpp` are line-for-line ports of `sim/src/render.ts` / `physics.ts`
  (incl. JS `Math.round` semantics, all 5 bitmap fonts, sprite digits box-filtered **on device** from the
  seven RGBA sheets embedded in flash — `gen/sprites_gen.h`, 712 KB raw — so `digitFont`/scale/tint stay live params).
  Only deliberate deviation: per-pixel blends (`blend565`, `throughLiquid`) are integer fixed-point
  (t in 1/256, luma in 1/1000) → ±1 LSB on gradient pixels, verified 0 pixels off by >12/255.
- `Params` is a runtime struct generated from the sim preset: `python3 firmware/tools/gen_params.py presets/1.json`
  → `src/gen/params_gen.h` (struct + `PARAM_FIELDS` name/type/offset table + `PRESET_1`; first file given
  becomes `PRESET_DEFAULT`). The same run embeds digit sprites in `sprites_gen.h`. Re-run after exporting a
  new preset, changing a digit asset, or adding a key to `params.ts`
  (also add it to `FIELDS` in the generator). The field table is what the later Wi-Fi / GATT / JSON control will use.
- Pipeline per frame: IMU → `GravityNorm` → `ImuFilter` → `stepTube` ×2 (50 Hz fixed step, catch-up ≤5) →
  `renderTube` into a 72-row strip in **internal DMA RAM** → `display_push_strip_async` (panel DMA reads
  the strip directly, no bounce copy) while the other tube renders. The two strips (2 × 77 KB, internal DMA
  RAM) are owned by `display.cpp` (`display_strip(i)`) and also stage the old full-frame pushes, so the
  Phase 1 bounce buffers are gone: **free internal heap after boot ≈ 175 KB**. Wi-Fi may still want one
  strip back (see KAIZEN.md / docs/companion-handoff.md).
- Timing: render 18 ms for both tubes (digits ≈ 6 ms, front-bright ≈ 4, glow ≈ 3, fills ≈ 5), DMA
  overlapped → 40 fps. Stage costs measured with `p…=0` toggles over serial, no rebuild needed.
- **Pixel check vs the sim**: `python3 firmware/tools/compare-device.py` (board connected) → sends `x`
  (dumps TubeState + both strips), renders the same state headless through the real `render.ts`
  (`sim/tools/render-ref.ts`, fizz off), writes `firmware/.compare/{device,ref,diff}.png` + mismatch count.
  Last run: 293 / 77184 px differ, all ≤ 1 LSB (0 above 12/255).
- Not ported: cuff/gloss and lens smoothing. Fizz uses `esp_random()`. Clock is software-only (set with `t`).
- Next: Wi-Fi SoftAP / BLE GATT param control + preset select using `PARAM_FIELDS`; NVS-persist params
  and clock; real RTC/NTP. Plan: `docs/companion-handoff.md`. Long-term backlog (power/incremental
  rendering): `KAIZEN.md`.
