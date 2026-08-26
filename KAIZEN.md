# Kaizen — continuous-improvement backlog

## Visual / layout
- Even if hour has passed, edge might be before it, example is 06:01
- Empty space at the top and bottom of the real screen? Move tubes further away from one another?
- Fill edge with `edgeSoft` > 0 leaves a 1 px tube-back gap before the glow: the AA loop writes
  `t = 0` at its last pixel and `edgeGlow` starts at `ceil(ex + round(edgeSoft))`, one px further.
  Invisible at low `glowStrength`, a black outline on emissive looks (xenon, molten — both set
  `edgeSoft` 0/1 to dodge it). Fix in `render.ts` step 3b + `render.cpp` together, they must stay 1:1.
- Sprite fonts have no emboss shadow (`digitShadow` is bitmap-only), so light sprite numerals over a
  light liquid rely on `markContrast` alone.

## Rendering: incrementality / optimisation — primarily for POWER (memory wins too)
_Added 2026-08-20 after Phase 3 (liquid face live, 38–40 fps)._

**Why:** the face currently redraws both full 72×536 strips every frame and streams them over QSPI at
~40 fps even when nothing visible changes. At rest the minutes edge moves ~0.15 px/s and the hours edge
~0.012 px/s; the only continuously animated thing is the fizz. So >95 % of the CPU (≈18 ms/frame at
240 MHz) and the panel DMA traffic is spent repainting identical pixels. On a wrist-worn battery device that
is the dominant controllable power cost after the AMOLED itself. It also dictates the memory layout
(two 77 KB internal DMA strips kept resident just so render and DMA can overlap).

**Levers, in the order we would take them:**
1. **Frame skipping at rest** — render only when something changed: any edge moved ≥ 1 px (compare the
   per-row `edges[]` against the last pushed set, or just `xe`, `angle`, `edgeLight`, `light`
   quantised), a param changed, or fizz is on. Idle → CPU sleeps between IMU samples. Cheapest, biggest win.
2. **Dirty-rect push** — when only the edge region moved, push only the columns
   `[min(oldEdge, newEdge) − frontBright, max(...) + edgeGlow]` (panel supports arbitrary column windows
   via 0x2A/0x2B). Cuts DMA time from ~7 ms to < 1 ms per frame and removes the need for full-width strips.
3. **Static-layer cache** — ticks + digits + glass never change between param edits; keep them in a
   pre-composited per-tube background (PSRAM is fine) and only paint the column + edge effects over it
   each frame. Removes the ~8 ms of mark compositing (`throughLiquid` per glyph pixel) from the hot path.
4. **LUT-ify the edge effects** — front-bright / glow blends are functions of (row, k, lightK): a
   72×(21+15) 565 table rebuilt only when `lightK` changes by > 1/64. Turns ~6 k blends/frame into
   table lookups.
5. **Fizz as a power setting** — it forces continuous repaint; make it off-by-default on battery, or
   animate it at 10 Hz in a small dirty rect.
6. **Memory follow-through** — with 1–3 in place the second internal strip (77 KB) and possibly the whole
   PSRAM canvas go away; that is the headroom Wi-Fi SoftAP needs (see docs/companion-handoff.md).
7. **Measure, don't guess** — add a `s`-style power line: frames rendered / pushed per second, ms per
   frame, and once battery hardware exists the ADC on GPIO1. Optimisations get accepted on those numbers.

**Not doing yet:** any of it before the look is signed off and the companion's param path works —
incrementality makes every render bug harder to see, so it comes after the visuals are stable.

## Other
- Light model (`lightPhys`): physical mode ignores the light's along-axis component (it only dims, does not move the highlight) and the face-down case (`n` clamped ≥ 0).
- `edgeLight -> lightK` is a proxy: pressure into the end fills the cap (modelled via `meniscusTiltGain`);
  the brightness change stands in for the stronger caustic of a fuller cap.
- Gyro about the screen normal (IMU z) is dropped in both mains; it is the rate that physically kicks the
  in-plane front skew (`angle`). Plumb it as `gyroNormal` in `TiltInput` and add an impulse term.
- Serial command parser lives in `main.cpp`; extract to `command.cpp` with an output sink before it grows
  a second transport (BLE/HTTP) — planned in docs/companion-handoff.md.
- Param writes are unvalidated on device; clamp with the sim's `PARAM_META` min/max before exposing to
  the companion.

## Companion / transport
_Added 2026-08-21 with Transport 0 (Web Serial)._
- Serial writes are one per render frame (~26 ms): "push all" = 87 × 26 ms ≈ 2.3 s. Add a batch command
  (`p {json}` or `p a=1,b=2`) on the firmware, or parse several lines per `loop()`.
- Reply matching relies on the echoed command line being intact; an IMU CSV line could in theory split
  the echo (firmware echoes per char between `imu_poll` calls). Fix firmware-side: drop echo when a
  stream is on, or prefix replies (`> ok`).
- `s` reports ~23 fps with BLE built in (STATUS says ~40). Not measured without BLE on the same build; check whether the
  BT controller task or the smaller strips cost it.
- BLE: `x` hex dump and echo-per-char are wasteful over NUS; BLE-side flow control absent (notify drops if the
  central is slow). BLE always on — measure its idle draw before the power-management work.
- `t HH:MM:SS` loses the date; `T <epoch> <tz>` + `settimeofday` per companion-handoff.md.
- FW power management: light sleep when still (QMI8658 wake-on-motion on INT1/INT2 = GPIO45/46; not RTC pins → light sleep only, not deep), AMOLED SLPIN while asleep, partial window updates for the two bar strips only, tick rate 1–2 Hz once liquid settled. Target avg <15 mA → 500 mAh cell lasts days.
  Two-stage wake: (1) QMI8658 WoM threshold/debounce tuned so walking/typing don't trip it, accel-only low-power mode; (2) on wake, gyro burst 100 Hz, classify wrist-raise (forearm-axis rotation 60–90° in 300–600 ms ending glass-up + 200 ms still) before panel on; no match → back to sleep. Tilt-away blanks early. Tune thresholds from `i` CSV recordings.

## Power / clock
- Low battery → AMOLED off + deep sleep: RTC domain (~10 µA) keeps the time until the cell is flat, not until the display can no longer run.

## Vial optic
- `lensSmooth` / `gloss` are simulator-only. Port smoothing only if nearest-row bands are visible through the acrylic rod.
- codex exec in parallel background jobs needs `</dev/null`, else stdin race (EAGAIN) kills ~half the jobs.
- Image lanes (see pigeon_drop skills): cursor `agent -p -f --model cursor-grok-4.5-high-fast "<prompt + output path>"`; cursor `agent -p` hangs headlessly (even text-only). agy: `agy --mode accept-edits --print="Use your generate_image tool… Do not run shell commands. Reply with the full saved path."`; file lands in ~/.gemini/antigravity-cli/brain/<id>/, copy it out. Gemini image quota exhausts after ~10 parallel renders.
