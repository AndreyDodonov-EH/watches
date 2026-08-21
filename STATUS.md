# Liquid Watch — STATUS

_Last update: 2026-08-21 (Phase 3: liquid face and expanded digit sprites)_

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
to the preset, `b<0-255>` panel dimmer, `r` reboot, `?` help.

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
- Inputs: sliders / drag on the panel, phone DeviceOrientation, **Web Serial to the board's `i` stream** (Chrome).
- Time: real / demo (×N) / set HH:MM. Leather-cuff overlay with slot inset, acrylic-vial lens remap and gloss
  (presentation only, not ported). Layout-grid toggle shows the bridge zone.
- All tunables in `sim/src/params.ts` (`DEFAULT_PARAMS`), live panel, presets Mint (spec) / Neon (ref photo
  `images/reference-liquid.jpg`), export/import JSON. Current defaults: `sim/params.json`.
- Brightness is layered: `brightness` = panel dimmer (0x51), plus per-layer trims `liquidBright` /
  `tickBright` / `digitBright` in the Colour group. Dimming the digits sits them in the shadow at the bottom
  wall of the tube; the trim also scales that layer's `markContrast` floor, so the shadow survives over the
  liquid. `tubeBack` follows the panel dimmer only.
- Digits include five bitmap fonts and seven generated image fonts: steel, brass steampunk, copper gauge,
  forged iron, ivory enamel, carved slate, and amber resin. Image fonts remain behind the liquid/glass layers
  and support brightness, tint, and black-to-white tone controls in the simulator and firmware.
- **Autosave** (`sim/src/persist.ts`): every edit — params *and* view state (zoom, cuff/lens/gloss, layout grid,
  pause, time mode, tilt) — is written to `localStorage['liquid-watch-session-v1']`, debounced 250 ms, flushed on
  pagehide. One delegated `input` listener on `#app` covers every control. Nothing is lost on reload, so
  **Export JSON is only for checkpointing a finished look into `sim/params.json`**, and it still exports params
  only — view state never pollutes the firmware contract. `reset view` button restores the view defaults.
  Caveat: a stored value always beats a changed `DEFAULT_PARAMS`, so after editing defaults in code open
  **`?fresh=1`** to see them (it ignores the store without clearing it). Input source (device / serial) is not
  persisted — those need a user gesture.
- Scale majors are longer, wider (`tickMajorWidth*`) and placed every N **units**
  (`tickMajorEvery*` counts hours/minutes, migrated from the old "every N-th minor" via `params.v`);
  marks inside the liquid keep a minimum luma distance from it (`markContrast`) so the ladder survives
  the highlight band, or are printed in front of it entirely (`ticksOnTop` / `digitsOnTop`). Contract: `throughLiquid` in `sim/src/render.ts`.
- Layer order is bottom ticks → bottom digits → bubbles/fizz → top ticks → top digits. Ticks are never dropped for label bounds; later marks overwrite only intersecting pixels. Bottom marks share the sim/firmware `bottomLens` warp, while top marks stay flat. The acrylic lens remains a simulation-only view overlay.
- URL params, applied on top of the restored session: `?fresh=1&preset=neon&t=10:09&along=0.3&across=0&settle=1&cuff=0&lens=0.6&lenscurve=1&lenssmooth=1&leather=black&grid=1&scale=3&demo=120&p.<key>=<v>`.
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
  becomes `PRESET_DEFAULT`). Re-run after exporting a new preset or adding a key to `params.ts` (also add it
  to `FIELDS` in the generator). The field table is what the later Wi-Fi / GATT / JSON control will use.
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
- Not ported: nothing rendering-wise. Fizz uses `esp_random()`. Clock is software-only (set with `t`).
- Next: Wi-Fi SoftAP / BLE GATT param control + preset select using `PARAM_FIELDS`; NVS-persist params
  and clock; real RTC/NTP. Plan: `docs/companion-handoff.md`. Long-term backlog (power/incremental
  rendering): `KAIZEN.md`.
