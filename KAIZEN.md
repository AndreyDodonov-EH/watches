# Kaizen — continuous-improvement backlog

## Visual / layout
- Rear-mark compositors index row bounds before checking that the row is in range; clip `ry` first in sim and firmware.
- Even if hour has passed, edge might be before it, example is 06:01
- Empty space at the top and bottom of the real screen? Move tubes further away from one another?
- Now that edgeSoft is a real ramp (glow folded into its alpha), emissive presets (xenon, molten —
  both edgeSoft 0) could revisit edgeSoft 1–2 for a genuinely soft self-lit edge.
- `markContrast 0` does not hide marks (it only zeroes rear-mark throughLiquid blending); ticks/digits
  draw their own colours regardless. To suppress marks in a test harness, pass `ticksN = 0`.
- Firmware glow effectTable now serves only the edgeSoft 0 path; soft-edge glow is per-pixel float
  (same cost as the existing direct path — presets with edgeGlow > EFFECT_MAX already bypassed the table).
- Sprite fonts have no emboss shadow (`digitShadow` is bitmap-only), so light sprite numerals over a
  light liquid rely on `markContrast` alone.

## Tooling / firmware
- `f` reports render+wait only; the remaining ~4 ms/frame (physics, IMU I2C, serial poll) is unaccounted —
  add a loop-total figure to `f`.
- `p!` resets to the compiled preset and 2 s later overwrites the NVS-tuned params; a `p!` that does not
  persist (or a "revert to NVS") would be safer for scripts.
- Board keeps flipping between Windows COM6 and WSL `/dev/ttyACM0` (usbipd auto-attach?); re-enumeration
  looks like a reset from the firmware side. Decide one home for it.
- Clock is lost on every esptool flash (no RTC battery) — `flash.sh` could re-send `T <epoch>` afterwards.

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
- Sim screenshot validation: port 5190 was occupied but unreachable, and headless Chromium intermittently aborted during sandbox shutdown; used 5191 and retried. Check stale listeners/processes if either recurs.
- Sim `flick →` button is nearly invisible: 400 dps raw → ~60 dps after gyro HP 5 Hz + LP 12 Hz + deadzone, so
  `fillPos` moves 0.3 px. Either shape the button burst like a real flick (100+ ms) or show the raw kick on the scope.
- Reading gesture (`readTurn`) sums |gyroAlong|+|gyroAcross|; which IMU axis is the forearm roll on the wrist is
  unmeasured — record a real wrist-raise with `i` and pick the axis / threshold from it.
- `lens` is rendered by the firmware *and* the acrylic rod magnifies on top: with the rod fitted, device `lens`
  probably wants 0 (or negative) while the sim keeps 0.6 as a preview; `meniscusLens` / `topLens` are the
  per-layer compensations and should be calibrated together.
- Fizz respawn ignores the free slug's motion (bubbles are in the liquid frame, fine) but a bouncing slug should
  nucleate bubbles like `agitation` does — hook `slugAcc` into `ensureFizz`.
- `x` STATE now dumps 12 values per tube (acrossTilt, cap, films, slugPos, reading added); compare-device.py updated,
  anything else parsing STATE must follow.
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

## Presets / materials (2026-08-27)
- `liquidTransparency` conflates tint and clarity: it mixes the body toward the tube back, so a coloured
  *clear* liquid (urine, champagne) turns khaki above ~0.6. A separate tint/absorption term (multiply the
  back by the body colour, then add the lit body) would let tinted liquids stay clear.
- Rear sprite digits at `digitScaleY` 5 / `digitBottom` 16 clip at the tube's top row (the "3" loses its
  top) in honey/malt/cola; either cap the scale from the tube height or clamp the baseline.
- `check:presets` ranges (tools/check-presets.ts) are hand-set from the 14 looks; if a new mechanic lands,
  add its coherence rule there rather than tuning presets ad hoc.
- Milk: opaque white with marks printed on the glass — no single mark colour reads well on both the white
  column and the black dry side (mid-blue chosen). A per-side mark colour (wet/dry) would fix it.
- Free slug + rear digits: at `readFaceUp` 1 the time is only true while the slug is home; presets inherit
  the user's read settings (turn 125 dps, hold 11 s) — revisit once the wrist-turn detector is tuned on the board.

## Rear-wall decals removed (2026-08-27)
- Procedural texture = free to generate, not free to composite: one `blend565` per textured pixel (~26k/frame
  for a dense grain) is ~10 ms on the S3. A sparse-list + baked-dry-strip cache (PSRAM) was tried and FPS
  was still poor even with decals off — suspect the extra PSRAM traffic / `memcpy` per row or heap pressure
  rather than the blend count; not diagnosed. If revisited: measure with `f` first, keep the bake in internal
  RAM at real H, and re-check that step 1 is still a plain `hspan` when no decal is active.
- Baseline frame rate with decals removed is a steady ~18 fps on the device (`f`). Stable, so it does not
  read as stutter, but it caps how much per-pixel work any future back texture can add. First split
  `render` vs `push-wait` from `f`: if push-wait dominates, the strip DMA/SPI clock is the limit, not
  rendering; if render dominates, profile per stage (palette, liquid spans, marks/digits, fizz, lens).

## Perf hand-off 1 (2026-08-27)
- Internal RAM is the wall: 37 KB free after BLE init. TUBE_HEIGHT_MAX 80→72 would return 17 KB (strips are
  2 × 536 × 80 × 2 B); with that, the sprite glyph pools (2 × 18 KB) could move from PSRAM to internal (~2 ms/frame).
- Unexplained ~2 ms between two builds with identical hot loops (static internal glyph pool 38.3 fps vs heap
  internal 42.0 fps). Suspect flash icache layout of render.cpp; try `IRAM_ATTR` on `drawSpriteGlyph` /
  `Mark::operator()` / `throughLiquid` and measure — or accept the swing and always compare medians of ≥5.
- Parity pre-existing (not from hand-off 1): `cryo` preset 132 px > 12/255 on the minutes sprite labels,
  `free` 1 px, `free`+`remaining` 36–72 px (slug-state dependent). Diff pngs: run
  `compare-device.py` after applying the preset; investigate sim `render.ts` vs `render.cpp` sprite rows for
  digitFont 5 at that scale.
- `compare-device.py` doesn't pin the scene (`inputGain`, `t`) so the mismatch count drifts 160–230 with the
  live IMU; give it the same pin as bench.py so "must not grow" is a real bar.
- Front-bright has no cached table (frontBright 21–23 in presets > EFFECT_MAX 16, memory-bound); if a preset
  turns it on, the direct per-pixel path costs ~4 ms — a per-k `T` hoist (row-independent part) is cheap.
- `free` preset edgeGlow = 40 > EFFECT_MAX 16 → direct path; either raise the table (10 KB internal per +16
  columns) or cap the param.
- Dual-core render is core-0-bound: hours 14.7 ms vs minutes 10.6 ms (sum 25 > 22 sequential). Two levers:
  (a) balance work, e.g. give core 1 the hours labels or split by rows instead of tubes; (b) find why core 0
  is slower per tube — try a `-DNO_BLE` build and IRAM_ATTR on the hot mark path (BT controller interrupts
  and shared flash cache are the suspects).
- Hand-off 2 "not now" items still open: triple buffering, physics on core 0, a separate fizz task.
- ~~Trace decay scans all 536 columns per tube every tick even with an empty buffer~~ — done:
  `TubeState.traceLo/traceHi` occupied range, physics + render both skip/range-restrict (2026-09-01).
- Heavy residue (~585 live columns) still costs ~14 ms/frame: pure per-pixel `pxaT` blend (~42 k px).
  If that matters, next wins: skip rows where `traceA·rowW` rounds to 0, or blend row-batched spans.
- `digitFont 5` + `tubeHeight 72` has a traces-unrelated parity gap: ~1715 px mismatched, 169 px
  >12/255, all in the digit rows (25–70 / 204–239). Sprite-font/mark path, worth a separate look.
- `bench.py` median-of-5 has ~±0.5 ms noise on-device — enough to fake a cost for a free stage;
  an interleaved A/B min-of-samples mode would make small deltas trustworthy.

## Verification pass on the traces uint16 rework (2026-09-01)
- **Render task hangs (task-wdt reset) when `tubeHeight` shrinks while `fizz` is on.** Reproduced on the
  board: `ptubeHeight=72` → `ptubeHeight=55` with `pfizz=1` resets ~2/6 tries (fizz=0: 0/6); it also fires
  ~3/5 times when a preset push crosses the same transition (any green→blood style switch). Verbatim:
  `task_wdt: - IDLE0 (CPU 0) … CPU 0: render0` , backtrace `0x42025ee9` →
  `Tube::drawTube … render.cpp:984`, i.e. the fizz particle loop
  `for (int iy = floorf(f.y - ry - 1); iy <= ceilf(f.y + ry); iy++)` with `ry = r / fizzMag(...)`.
  Fizz positions still carry the *old* H when the layout changes, so `m` can go ~0/negative and `ry`
  explodes → the loop runs to INT_MAX. Not caused by the traces work (`p.traces` is false at the crash
  instant). Fix: clamp `ry` (and `m`) and/or reseed `fizz[]` on a geometry change.
- Trace render layer is ~3.0 ms/frame (46.9 → 40.9 fps on the pinned scene); the physics decay loop is
  ~0.07 ms, i.e. free. If traces need to be cheaper, the win is in `drawTube` step 3d (full L×H scan with
  a `pxaT` per non-liquid pixel), not in the decay loop.
- Trace layer is the dominant source of ≤1-LSB sim parity drift (41 px without it, ~600–645 px with heavy
  residue, all ≤9/255). Suspect the `traceA[x] = (uint8_t)(a + 0.5f)` + `(traceA[x] * rowW) >> 8` integer
  path vs the sim's float alpha; worth a bit-exact LUT if the parity bar tightens.
- `tools/device.py` cannot recover when the board re-enumerates: the Windows COM bridge dies
  (`RuntimeError: bridge died`) and every later call fails. A reconnect/retry in `Device.raw` would make
  crash hunting far less painful.
- `ambientLight` desaturates only what is brighter than the diffuse body, so over-driven emissive
  presets (glow/xenon: body luma already ≥ display max) are untouched. If those should also go
  "ambient", the knob would need a second stage that compresses the body toward an ambient level —
  overlaps with brightness/liquidBright, left out.
