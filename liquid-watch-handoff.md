# Liquid Watch — Agent Handoff

## Project context

We are building a wristwatch prototype where **hours and minutes are displayed as two horizontal "liquid tubes"** — like the glass vials of a spirit level — set into a wide leather cuff. The screen simulates glowing green liquid columns; real hydraulics may come in a later version. Curved acrylic half-round rods will sit over two slots cut in the leather, so only two narrow horizontal strips of the display are ever visible.

**Hardware (already purchased, on hand):**
- 2× **Waveshare ESP32-S3-AMOLED-1.91**, non-touch, no pre-soldered header (Waveshare SKU 28872)
  - ESP32-S3, 240 MHz, 16 MB flash, 8 MB PSRAM
  - 1.91" AMOLED, **536×240**, driver **RM67162 over QSPI**, active area ≈ 44.3 × 19.8 mm (~0.083 mm/px)
  - **QMI8658** 6-axis IMU (accelerometer + gyroscope) on I2C
  - RTC, TF card slot, USB-C, MX1.25 battery connector
- Only ONE board is the target; the second is a spare. Single-board design: both tubes rendered on one panel, leather bridge covers the middle.

**Authoritative references — fetch these, do not guess pins:**
- Waveshare wiki: https://www.waveshare.com/wiki/ESP32-S3-AMOLED-1.91 (pinout, schematic, demo code download)
- Waveshare demo repo / examples linked from the wiki (contains working RM67162 init sequence and QMI8658 driver)
- If using Arduino: `Arduino_GFX` (moononournation) supports RM67162 QSPI; LVGL 9.x optional on top

## Target visual layout (final, from design discussion)

All coordinates in native panel space, **landscape 536×240**, origin top-left:

```
tube_length_px   = 536   (full width; leather may mask the outer ~10px)
tube_height_px   = 72    (≈ 6 mm)
hours_tube_y     = 24    (top edge; tube spans y 24..96)
minutes_tube_y   = 144   (top edge; tube spans y 144..216)
bridge_zone      = y 96..144  — must stay pure black (covered by leather, but AMOLED black = 0 power)
background       = pure black #000000 everywhere outside liquid
liquid_color     = green, reference #5DCAA5 body with lighter #9FE1CB specular strip along top of the column
fill_direction   = left to right
hours_fill       = (hour % 12 + minute/60) / 12       — continuous, not stepped
minutes_fill     = (minute + second/60) / 60          — continuous
```

Visual details that sell the illusion (implement in Phase 2, port in Phase 3):
- **Meniscus**: the right edge of each liquid column is not a flat vertical line but a curved meniscus (concave, liquid climbing the tube wall slightly at top/bottom).
- **Bubble**: optionally a small air bubble near the fill edge, like a spirit level — a subtle dark ellipse with a bright rim.
- **Slosh physics**: liquid responds to IMU. Tilt along the tube axis shifts the liquid surface angle; quick movements cause a damped oscillation (spring-damper on surface angle and on fill-edge position). When the wrist is still, liquid settles level within ~1 s.
- **Tick marks**: faint scale marks along each tube (like the vial graduations), rendered as dim gray, optional/toggleable.

## Multi-session conventions

This work spans at least three chat sessions. To keep continuity:
- Maintain a `STATUS.md` in the repo root: what works, what's flashed on the board right now, open problems, next step. Update it at the end of every session.
- Keep all magic numbers from "Target visual layout" above in ONE shared constants file (`spec/layout.h` for firmware, mirrored in `spec/layout.ts` or generated — see Phase 3).
- Commit working states before experiments.

---

## Phase 1 — Board bring-up + arbitrary visuals

**Goal:** we can flash the board and draw whatever we want on it, and read the IMU.

1. Fetch the Waveshare wiki page and download their demo package. Identify: display data/clock pins (QSPI), reset/CS, backlight/power enable if any, I2C pins for QMI8658, IMU address, battery ADC pin if present.
2. Choose toolchain: prefer **PlatformIO with Arduino core** (fast iteration) unless demos only build under ESP-IDF; then use ESP-IDF. Record the choice and exact board config in STATUS.md.
3. Milestone 1a: full-screen color fill + "hello" text at correct orientation (landscape, USB-C to the left — confirm with user which side the connector should face in the cuff; default: left).
4. Milestone 1b: render two static green rectangles at the exact tube coordinates from the layout spec. This is also the **leather calibration face** — keep it available forever as a build flag or boot mode, the user will align the leather slot cutting against it.
5. Milestone 1c: stream QMI8658 accel+gyro readings over serial at ≥50 Hz; verify axes (which physical axis is along the tube length — document the mapping in STATUS.md).
6. Milestone 1d: measure achievable full-frame update rate with the chosen driver (target ≥30 fps; QSPI RM67162 typically manages 40–60 fps at 536×240×16bpp). Record it.
7. Set CPU to 240 MHz for now; power optimization is a later phase, do not spend time on it.

**Acceptance:** photo/video of the calibration face on the panel; serial log of IMU data; measured fps in STATUS.md.

## Phase 2 — PC simulation of the liquid rendering

**Goal:** a browser-based sandbox where the liquid look and physics are tuned until the user is happy, with parameters that transfer 1:1 to firmware.

1. Single-page TypeScript + Canvas app (Vite; user's normal stack is Lit/TS/Vite). Canvas fixed at **536×240 logical pixels**, scaled up 2–3× for viewing, plus a leather-mask overlay toggle that blacks out everything except the two tube slots (to preview the real look).
2. Simulate liquid per tube:
   - State: `fillLevel` (0..1 target from time), `surfaceAngle`, `surfacePos` with spring-damper dynamics driven by input tilt/accel.
   - Input: mouse drag or device-orientation API simulates wrist tilt; sliders for direct control.
   - Render: filled column with meniscus curve at the fill edge, specular highlight strip, optional bubble, optional tick marks. Pixel-art friendly: no effects that can't be reproduced with plain rect/polygon/gradient fills on the MCU.
3. Every tunable (spring k, damping, meniscus curvature, highlight height, colors as RGB565-safe values, bubble size...) lives in a single `params.ts` object, adjustable live via a small control panel, exportable as JSON.
4. Add a "demo time" mode (fast clock) to see fill levels move.
5. Keep the physics update fixed-timestep (e.g. 50 Hz) and rendering decoupled — the same structure the firmware will use.

**Acceptance:** user signs off on the look; exported `params.json` committed; the render routine is documented step-by-step (draw order, shapes, colors) so it can be ported mechanically.

## Phase 3 — Port simulation to the board

**Goal:** the tuned rendering runs on the AMOLED, driven by real RTC time and real IMU data.

1. Generate/translate `params.json` + layout spec into a C header (`spec/params.h`). One source of truth; if hand-copied, add a comment with the JSON commit hash.
2. Port the fixed-timestep physics (it is a few dozen lines: two spring-dampers per tube) and the render routine. Render into a full-frame RGB565 buffer in PSRAM, push over QSPI each frame; optimize only if fps < 30 (dirty-rect the tube strips — the bridge zone and margins never change).
3. IMU integration: map QMI8658 axes per the Phase 1 mapping, low-pass accel for gravity direction, gyro for fast transients. Clamp/deadzone so the liquid is calm when the arm is calm.
4. Time: RTC keeps time across resets; NTP sync on boot over Wi-Fi if credentials are set (menuconfig/params), otherwise a serial command to set time. No touch input exists — do not build UI for setting time on-device.
5. Side-by-side check: PC sim and board running simultaneously with same params should look the same to the eye. Fix discrepancies in the firmware, not by re-tuning params.
6. Power pass (only after visuals accepted): drop to 80 MHz if fps allows, cap fps at 30, then implement QMI8658 wake-on-motion + light sleep + wrist-raise wake (screen off after 10 s idle). Battery: 3.7 V LiPo on MX1.25 — verify connector polarity against the wiki BEFORE first battery connect.

**Acceptance:** video of the board showing live time as liquid tubes reacting to tilt; STATUS.md updated with power figures (mA screen-on / sleep).

## Known constraints & gotchas

- AMOLED: never render static bright content in the bridge zone or margins — wasted power and burn-in risk. Pure black background is both the aesthetic and the battery strategy.
- RM67162 panels usually require a specific init sequence — take it verbatim from the Waveshare demo, do not improvise.
- QSPI display + PSRAM share bandwidth; if tearing appears, use the driver's async DMA transfer and double-buffer in PSRAM.
- RGB565: the reference greens are #5DCAA5 → RGB565 0x5E54 approx; verify visually, AMOLED gamma differs from sRGB monitor. A small on-device color-tweak mode (serial commands nudging the palette) will save a lot of reflash cycles.
- The user's hardware colleague handles the leather/mechanical side; firmware only needs to provide the calibration face.
