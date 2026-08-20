# Liquid Watch — STATUS

_Last update: 2026-08-20 (session 1, Phase 1 bring-up)_

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
  framebuffer in PSRAM, pushed in 40-row bands through an internal DMA bounce buffer.
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
`firmware/` @ this commit. Boots into the **calibration face** (two #5DCAA5 rectangles at the spec tube
coordinates with white centre-lines). Serial commands @115200: `h` hello/orientation test, `c` calibration
face, `f` fps benchmark, `i` toggle 50 Hz IMU CSV stream, `b<0-255>` brightness, `r` reboot.

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
- [ ] IMU axis mapping to tube length — needs the board tilted along the tube while streaming `i`.
      Not yet documented.
- [~] #5DCAA5 reads as mint/turquoise on the AMOLED — channel order verified correct, so this is the spec colour
      itself. Final shade tuning deferred to Phase 2/3 (serial palette-nudge mode).

## Next step
Phase 1 acceptance: photo of calibration face, tilt test for axis mapping → then Phase 2 (browser sim).
