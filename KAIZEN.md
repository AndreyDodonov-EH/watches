# Kaizen — continuous-improvement backlog

- Host parity checks: sandboxed Node `spawnSync` can hang or report EPERM despite child output;
  the approved run outside the sandbox completes normally.

## Visual / layout
- Tilt pose currently uses the two in-plane gravity axes; face-down horizontal is indistinguishable
  from face-up. Carry signed normal gravity through the input pipeline if upside-down release is wanted.
- Rear ticks still round their parallax to whole pixels (each tick at its own depth, so the ladder steps one tick at a time); the digits now glide sub-pixel. The same bilinear placement would smooth the ticks.
- `digitParallax` shifts a rear label as a block; the ticks bow through the rear-half depth. A per-row depth factor
  (digits are ~centre row on every preset, so ≈1) would only matter for digits pushed toward a wall.
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
- Glass wall band is drawn in the palette (pre-lens), so a strong `lens` curve squeezes/stretches the
  band with the rest of the tube; a post-lens rim would keep it a fixed px width, but needs post-lens
  edge bounds (the earlier post-lens rim pass indexed pre-lens `bounds` rows — removed for that).
- `liquidThin` is a Beer-Lambert cue; opaque or self-lit presets (blood, milk, molten, xenon) inherit
  the 0.4 default and could set it to 0 if the greyed silhouette rows look wrong on the device.
- Physical lab's area-light highlight is a broad Gaussian band at 2·(light angle); the legacy tent
  highlight (`highlightH`/`highlightSharp`) could take that profile to match the lab look further.

## Tooling / firmware
- Push all writes fields one at a time, so the board renders transient combinations (e.g. new
  `tubeHeight` with the old fizz positions, which used to hit the task watchdog). A `Pbegin`/`Pcommit`
  transaction like the physical renderer's would apply a whole preset atomically.
- Internal heap on the board idles at ~19 KB free (`s`: heap 19676) with the physical renderer's
  343 KB resident; watch it before adding anything that allocates at runtime (BLE, NVS writes).
- A task-wdt reboot while the browser holds the serial port leaves the panel black until a manual
  reset (host DTR/RTS state during re-enumeration); the sim could detect the boot banner and reconnect.
  Same root as the close-reset: on the S3's USB-serial-JTAG, DTR low with RTS high is a reset.
- A host harness for the legacy renderer (stub `esp_heap_caps.h`/`esp_random.h`, replay `name=value`
  writes with physics steps) reproduces push-all sequences without the board; worth keeping in tools/.
- Existing `scaledGlyphs()` silently drops glyphs when `GLYPH_POOL_PX` overflows; report the unsupported
  size visibly instead of leaving missing digits. Found during the physical-renderer planning audit.
- `f` now includes whole-frame p95; physics, IMU I2C and serial poll still lack separate cost figures.
- Fixed clock (`d0` + `t`/`T`) can sit milliseconds before the requested second because demo offset
  advances on fixed physics ticks; at a minute boundary `s` can consequently show the preceding minute.
- COM6 bridge reopen reverted volatile physical mode to legacy during testing; capture/select in one
  connection. Audit the Windows driver's close/open reset behavior separately.
- Firmware autosaves every `p` write after 2 s, so tooling pins (`bench.py` `inputGain 0`, the `x` dump's
  `fizz 0`) reach NVS mid-run and survive if the session closes before the restore is flushed. A volatile
  write (`p~name=value`, no autosave) would make pins safe by construction.
- `device.py` now dwells 2.5 s on close after any `p` write (NVS autosave) and drops RTS before DTR on
  close (no reset). Other serial clients (the browser's Web Serial) still reset the board on close, so
  a preset pushed from the sim and closed within 2 s is lost the same way.
- `device.py` `close()` waits 5 s for the Windows bridge to exit; once it took longer and `bench.py`
  died with TimeoutExpired after its work was done, which aborted `e2e.sh` before the parity step.
  Treat a slow bridge exit as non-fatal (or lengthen the wait).
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
- Residue opacity parity: firmware clamps `traceAmount` before wall attenuation; sim clamps after it,
  so amounts above 1 (including olive oil) can render stronger at mid-height in the sim.
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
- Panel HBM (RM67162 B0h bit1): enabling it turns the liquid face bright cyan and a lit face trips the
  ESP32-S3 brownout detector (USB supply sags). Not a usable brightness step; 0x51=0xFF is the ceiling.
  The HBM bit survives the RESX line and a reflash; init now writes B0h=0x04 explicitly.
  `H1` serial command left in for experiments only. QSPI register readback (opcode 0x03) returns 0x00
  for everything with the sh8601 panel_io; needs dummy-cycle config if ever wanted.
- Fizz now hides behind the wall band (clipped by dryT, turnaround at wall-r): with a wide band (glassWall 10 @ H 60) each bubble spends ~wall-r rows invisible per pass, so perceived density drops a little; scale fizzCount by bore/H if that reads as thin.
- Any `p<name>=<value>` write persists: `paramsTouch()` + `paramsFlush()` store the whole blob to NVS
  2 s later (device.py even sleeps 2.5 s on close to let it land), so `p!` is not the only destructive
  command — a plain param set silently replaces the saved copy too. A read-only "try this value without
  saving" path (or a `--no-save`/session-only flag in device.py) would make board experiments safe.
- Thin dark curved arcs run across the olive-oil tubes at fixed columns (visible with traces off, so not
  residue); source not identified — check the glass / lens overlays.
- The residue wet band tapers linearly over `wetFilm` px; a preset wanting a longer fade than its film
  would need its own width param.
- Sim `blend565`/`pxa` allocate three tuples per pixel; the residue pass calls it for every dry-side
  column of the residue range every frame. An integer 565 blend (like the firmware's `blend565T`)
  would cut the GC churn when a smear covers the whole tube.
- `tools/device.py` close from WSL: the python.exe bridge does not exit within `wait(5)` after stdin
  closes, so every session ends in `TimeoutExpired` (params were already restored; unclear whether the
  port then closes with the RTS-then-DTR order). Make the bridge exit on EOF, or kill it and re-check
  the reset banner.
- `tools/bench.py` cannot measure the dried-trace stage: the pinned scene (d0, inputGain 0) has no
  receding edge, so the residue dries out within `traceDry` and `--stage traces=0` reads ~0. A residue
  scene needs `traceDry` pinned high and a demo-speed drain first (see the scratch tracepin.py recipe).
- `traceFilm` (permanent film) costs ~9 ms per fully dry tube (every dry pixel goes through the
  blend: ~57 cycles/px, close to the loop's op count; the 5.7 ms "fully smeared" figure was helped
  by the opaque fast path). Cheaper design if the film becomes always-on: bake it into the tube
  back — a per-row film-over-back LUT keyed by a quantized streak level (8 levels x H), paint the
  back with it in step 1 and blend only pixels that are not the plain back (marks). Needs the sim
  mirrored; ~0 per-pixel cost.
- `x` pixel dumps over the Windows bridge can be incomplete despite an `END` marker
  (108/120 complete rows during the 2026-09-22 residue benchmark); reject incomplete
  captures before comparing pixels. The existing bridge-close timeout also recurred after
  settings were successfully restored and verified.
- Parallel PlatformIO builds in the same output directory removed objects during compilation;
  use distinct `PLATFORMIO_BUILD_DIR` paths for concurrent builds.
- `ble.cpp`: `NimBLEService::start()` is deprecated and now a no-op; remove separately.
- Digit shadow bake (2026-09-22) only covers sprite fonts; bitmap fonts (`digitFont` < SPRITE_FONT) still
  draw the shadow as a second glyph pass. Bake them the same way if anyone uses them with a shadow.
- Baked shadow approximations, both sim and firmware alike: in the wall-band fade rows behind air the
  two layers used to be scaled per row before compositing (worst ~50/255 on a few edge texels of the
  host scene set); with `markContrast` > 0 the luma floor now acts on the composite instead of per
  layer (presets free / cola / champagne / malt / cryo). Revisit only if someone sees it on the panel.
- Step 3e convex nose still calls newlib `sqrtf` (bit-by-bit software, ~250 cycles) per nose pixel. Only
  convex presets pay it; `sqrtApprox` (fizz ring) would do if 1/256 alpha steps are acceptable there.
- Meniscus `surfaceWidth` is not derived from the tube diameter; `-big` presets may want a wider band.
- Sim drawTube allocates `strokeR/strokeL` (and the compositor bounds) per frame like `edges`; fold into
  one reused scratch set if GC churn ever shows.
- Concave presets with `meniscusTiltGain·|meniscusDepth|` > `meniscusDepth` (user preset: 2.6 × 4 vs 4)
  are convex at full tilt, and the dynamic `cap` (±12 px) flips the ring lead's sign through every
  kick; an underdamped meniscus spring (frizzante: K 475, damp 8) rings the stroke concave↔convex for
  ~1 s after a stop. Physically the surface does slosh, but the two branches are drawn differently
  (stroke outside vs nose inside). The renderer now fades below 1 px at the branch transition;
  revisit the dynamics only if the physical wobble itself is excessive.

- Residue-enabled hard-edge glow now blends over the live backing instead of its clean-glass LUT;
  measure its on-device cost before considering a different cache. No new buffers allocated.
- Rear digits crossed by a fast-moving edge (user preset, `remaining`, `digitParallax` on, transparency
  0.17) show a dark jagged sliver along the contact line for a few frames: the per-pixel plane switch of
  the baked shadow (behind air vs behind liquid) lands on the parallax-offset shadow texels. Reproduces
  with `surfaceBand` 0, so it is the shadow-bake compositor, not the surface stroke. Not pursued.
- `traceFilm` on a black tube back: the film carries the liquid's specular highlight band
  (`traceRows` mixes `liquidHi` at the highlight rows) along the whole dry tube, and its
  desaturation uses the full `ambientLight` (not transparency-scaled like the body). Reads as a
  glossy coating; acceptable, but a dried film has no liquid surface to reflect. Not pursued.
- Rear ticks/digits behind air are composited opaque over the film, so the film reads as sitting
  behind the rear-wall marks; physically the inner-wall film is in front of them (should tint them
  like it tints the tube back). Only visible with `traceFilm` and a black back. Not pursued.
- Foam (parked fizz) is pushed back by a receding surface; the reference photo also shows foam left
  stuck to the wet glass behind it. Would need parked bubbles drawn outside the liquid over the residue
  and a short strand life. Not pursued.
- Fizz nucleating on the glass (bubbles that sit still until a random detach time) is the other cheap
  touch from the photo; a zero-speed state in the stepper. Not pursued.
- In `remaining` + `freeLiquid` with `freeHomeK` 0 the slug rests against the near end, so the visible
  meniscus is the *home* edge (`edgeXL`) and the time edge sits at the panel border; edge-specific
  effects (edge glow, frontBright, surface band) are tuned per edge and may look mismatched there.
- `fizzEdgeRise` default 0.3 with the default 8 bubbles at 14 px/s parks a bubble only every minute
  or so (the vertical wrap re-randomises x); a full ring needs fizzy-preset counts/speeds.

- `render-ref.ts` can't show fizz/foam (one frame, fizz off); a headless "step fizz N s then dump" mode
  would make foam checks reproducible (used a throwaway copy for the meniscus-foam fix). The run-sim
  shot (300 ms) is too short for foam to gather.
- `ensureFizz` column length is `xe − xs − 6`: the 6 px cut predates the meniscus and no longer matches
  the surface profile (spawn range / home-side respawn). Not pursued.

- Perf pass 2026-09-23 leftovers (bench scene, per-core ms from a cycle-counter probe): rear digits 10.2 (H) /
  8.1 (M) = drawGlyph bilinear taps + Mark per pixel, the largest stage; dry-tube `traceFilm` 6.4 ms on the
  short minutes column (film-into-back bake idea above); glow ramp ~170 and surface band ~370 cycles/px
  (three quantised blends per band pixel; one combined blend would halve it, not bit-exact).
- A stage profiler (esp_cpu_get_cycle_count around drawTube stages, `F` serial command) was a throwaway
  scratchpad patch; worth keeping behind `-DRENDER_PROF` for the next pass.
- Not possible now: IRAM for hot render code (free internal heap is ~5 KB with BLE up) and a 32 KB I-cache
  (the prebuilt Arduino libs fix it at 16 KB; needs a custom sdkconfig build).
- physics.cpp still uses libm fminf/fmaxf/floorf (50 Hz, negligible); switch if it ever matters.
- Home edge (edgeXL) reuses the time edge's skew sign, so a free slug under across-tilt leans as a
  parallelogram; hydrostatics says a trapezoid (bottom leads at both ends). Only the sag term is mirrored.
- meniscusAsym only moves the contact lines (d·|d|^pow). Hydrostatic Young–Laplace adds a mid-height
  term ∝ y(1−y²) (lower half bulges past the chord, upper half flattens); could replace/extend it.
- Headless Chromium fails at `sandbox_host_linux.cc` in this workspace; preset review used the static
  `render-ref.ts` frame instead. That preview cannot assess animated fizz or foam.
- Tinted liquids go khaki/pastel above ~0.4 `liquidTransparency`: the rear marks are a straight mix toward
  the back, not a multiply (colour filtering). A multiply would let tinted liquids be clear *and* saturated.
- `check-presets` class ranges (freeGain 570, watery freeDamp ≤ 1.5, meniscusK ≤ 550, readTilt 20/50) no
  longer match the user-tuned look (840 / 7 / 685 / 0–1); pinot and olive-oil are exempt for that reason.
- Headless Chromium worked on 2026-09-23 (run-sim shot.mjs); the sandbox note above may be stale.
