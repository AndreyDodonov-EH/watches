# Renderer benchmark on STM32H573I-DK

## Context
We estimated that an STM32H573 (Cortex-M33 at 250 MHz, 640 KB SRAM) would render about as fast as the ESP32-S3 (±25%) at roughly a third of the MCU power per frame. The user has an STM32H573I-DK, which carries the exact chip, so we can replace those estimates with measurements.

**Goal:** a bare-metal benchmark firmware that runs the unchanged `firmware/src/render.cpp` and `physics.cpp` on the DK, in the same pinned scene the S3 is benched in. It produces:
1. **Render time and fps**, measured by the existing `tools/bench.py`, including the per-stage cost table.
2. **Pixel parity** against the sim, checked by the existing `tools/compare-device.py`.
3. **MCU current**, measured on the DK's IDD jumper while rendering flat-out, capped at 30 fps and idle.

This is a measurement tool, not a product port. There is no BLE, no IMU and no AMOLED. The ESP firmware is not touched.

## Hand-off notes (for an agent starting cold)
- **Environment:**
  - Repo root: `/home/andrey/_PROJECTS/watches`. It runs in WSL2 and the boards stay attached to the Windows side.
  - Board tooling reaches Windows through `powershell.exe` / `python.exe`; see `firmware/tools/device.py` and `flash-win.sh`.
  - Not installed yet: `gh`, any ARM toolchain, any STM32 flasher.
- **Rules:** follow `CLAUDE.md` (static memory; side ideas go in `KAIZEN.md`, laconically). Don't edit `firmware/src/*`: the benchmark must run the shipping renderer byte-for-byte.
- **S3 reference numbers** (`docs/perf-core-balance.md`):
  - Bare build (no IMU): 34.9 fps / 21.4 ms. Normal build: 29.4 fps / 25.7 ms.
  - Spritz sample: `cores h 16.15 / m 27.31 ms`.
  - Re-measure on the day (step 4 of Verification) instead of quoting these.
- **Chip figures for the comparison:**

  | Chip | Condition | Current |
  |---|---|---|
  | ESP32-S3 at 240 MHz (datasheet v2.2, Table 5-9) | dual core, 32-bit access, periph clocks off / on | 66.2 / 81.3 mA |
  | | dual core, 128-bit access, off / on | 91.7 / 107.9 mA |
  | | WAITI, off / on | 32.9 / 47.6 mA |
  | STM32H573 at 250 MHz, VOS0, run from flash (DS14121 Table 29) | SMPS / LDO, peripherals off | 17.5 / 32.1 mA |
  | | Sleep, SMPS / LDO | 4.2 / 7.3 mA |

  CoreMark: S3 1329.92 for both cores; H573 1023.
- **DK hardware in use:**
  - USART1 on PA9/PA10 is the ST-LINK virtual COM port.
  - LEDs through the BSP.
  - The IDD jumper is JP6 (check against UM3143).
  - LCD (step 5 only): ST7789H2 on a 16-bit FMC bus, cmd at 0x60000000, data at 0x60000002; LCD power PC6 (low = on), reset PH13, backlight PI3. The BSP drives all of these.
  - OCTOSPI1 is taken by the onboard NOR flash and is not used here.

## Step 0: board check (before writing any code)
1. On Windows, the DK (ST-LINK USB) shows up as a COM port (VID 0483) and a mass-storage drive (label `DIS_H573*`, or similar).
2. The factory demo or a CubeH5 template runs, and a VCP terminal at 115200 opens without errors.
3. JP6 is fitted (MCU powered) and the TrustZone state is disabled (the factory default; check with STM32CubeProgrammer if in doubt).

Record the COM port and drive letter. Every later step uses them.

## Approach

### Layout: new sibling directory `firmware-h5/`, no copies of the renderer
```
firmware-h5/
  Makefile                 arm-none-eabi-g++; sources = ../firmware/src/{render,physics}.cpp + src/*
  port/esp_heap_caps.h     shim: bump allocator over a static arena (see Memory)
  port/esp_random.h        shim: xorshift32 PRNG (deterministic; fizz positions only)
  src/main.cpp             boot, frame loop (mirror of liquid_tick), serial protocol
  src/board.c              SystemClock_Config (250 MHz), ICACHE, DWT, USART1 + RX IRQ ring, _write, SysTick
  src/stm32h5xx_hal_conf.h only RCC/PWR/GPIO/UART/CORTEX (+FMC/SRAM in the LCD step)
  src/lcd.c                (step 5) 240x240 window of the panel on the DK's ST7789H2
  tools/fetch-deps.sh      pinned ST sources -> firmware-h5/vendor/ (gitignored)
  tools/flash.sh           make + copy .bin to the ST-LINK USB drive (Windows side, via powershell.exe)
```
- **Include paths:** `-I port -I ../firmware/src -I ../spec`. `render.cpp` includes `<esp_heap_caps.h>`/`<esp_random.h>`; the `port/` shims satisfy them. This mirrors the host-harness stubs in `firmware/tools/check_meniscus.py:18-70`.
- **`.gitignore`:** add `firmware-h5/build/` and `firmware-h5/vendor/`.

### Toolchain and dependencies (no sudo)
- **Compiler:** xPack `arm-none-eabi-gcc` release tarball, installed to `~/.local/xpacks/`. Makefile variable `ARM_GCC ?= ~/.local/xpacks/.../bin`.
- **`fetch-deps.sh`:** shallow-clones pinned tags from github.com/STMicroelectronics:
  - `stm32h5xx_hal_driver` v1.7.0
  - `cmsis_device_h5` v1.7.0, which provides `startup_stm32h573xx.s`, `system_stm32h5xx.c` and the linker script
  - `cmsis-core` v5.9.0_20250520, for `Core/Include`
  - For step 5: `stm32h573i-discovery-bsp` at the commit the CubeH5 superproject pins (`92b219d`), and `stm32-st7789h2` v2.0.4
- **Flags:**
  - Target: `-mcpu=cortex-m33 -mthumb -mfpu=fpv5-sp-d16 -mfloat-abi=hard`
  - Same optimisation as the ESP env: `-O2 -std=gnu++17 -fno-exceptions -fno-rtti -ffunction-sections -fdata-sections`
  - Link: `-Wl,--gc-sections --specs=nano.specs -u _printf_float -DSTM32H573xx -DUSE_HAL_DRIVER`
  - Diagnostics: `-fstack-usage`, plus `-Wl,--print-memory-usage` so the RAM/flash budget shows on every build.

### Boot (`board.c`)
1. `HAL_Init()`, then ICACHE on. The C-bus cache covers code and the const sprite data in flash.
2. `SystemClock_Config` copied from CubeH5 `Projects/STM32H573I-DK/Templates/TrustZoneDisabled/Src/main.c`: VOS0, HSE digital bypass, PLL1 M5 N100 P/Q/R 2, `FLASH_LATENCY_5`, 250 MHz.
   - The template does not set the supply. Before VOS0, call `HAL_PWREx_ConfigSupply(PWR_SMPS_SUPPLY)`, because the DK's part is the SMPS variant.
   - Print the resulting `PWR->SCCR`, since the power numbers depend on it.
3. DWT CYCCNT enabled. `micros()` is a 64-bit accumulation of CYCCNT deltas divided by 250.
4. USART1 on the BSP's COM1 pins (PA9/PA10, the ST-LINK VCP) at 115200 8N1.
   - TX: polled `_write`.
   - RX: RXNE interrupt into a static 256-B ring. Polling between 20-ms frames would drop bytes: that is about 230 B per frame against an 8-B FIFO.
5. Banner: `h573 bench: sysclk <Hz> supply <SMPS|LDO> icache on arena <used>/<cap> B`.

### Memory (CLAUDE.md: static and deterministic)
- **Strips:** `static uint16_t strip[2][PANEL_W * TUBE_HEIGHT_MAX]` in .bss, about 171.5 KB.
- **`heap_caps_malloc` shim:** a bump allocator over `static uint8_t g_arena[ARENA_BYTES]` (8-byte aligned). It returns `nullptr` on overflow, so `render_init()` returns false, and `main` prints `render init FAILED (arena)` and halts with the red LED on.
  - `render_init` (`firmware/src/render.cpp:2211-2223`) allocates only compile-time sizes (about 101 KB per tube). `ARENA_BYTES` is set to that exact sum and checked by the boot banner.
  - There is no `free` and no fallback.
- **Budget:** about 375 KB of the 640 KB of contiguous SRAM1-3. The roughly 712 KB of sprites and the code go in the 2 MB of flash. `--print-memory-usage` confirms both.

### Frame loop (`main.cpp`), a mirror of `firmware/src/main.cpp:237-278`
- **State:** `Params params = PRESET_1` (from `gen/params_gen.h`; the same preset the S3 falls back to). `tubeH`/`tubeM` get `trace = traceBuf(i)`.
- **Clock:** `clockSec = base + elapsed * demoSpeed`. The `t` command sets `base`; `d0` freezes the clock, as on the S3. Fill targets come from `updateTimeTargets`, the same formula as `main.cpp:99-105`.
- **Physics:** fixed 50 Hz with catch-up of up to 5 steps (same loop), `TiltInput{0,0,0,0}` (matches the S3's `NO_IMU`), then `stepFizz(params, PHYS_DT, 0, 0, tubeH.agitation)`.
- **Render:** `renderTube(0, …, strip[0])`, then `renderTube(1, …, strip[1])`, one after the other, each timed with DWT.
  - `render` is the wall time of both. The S3's `render` is the wall time of its concurrent two-core section, so fps compares directly.
  - `cores h / m` holds the per-tube times.
- **Stats:** a 2-s window with fps, render, h, m and frame-p95. The code is lifted from `liquid_tick`.

### Serial protocol: just enough for `bench.py` and `compare-device.py` to run unchanged
- **Echo and prompts:** each command line is echoed first, as on the S3, and replies use the S3's formats:
  - `f`: `fps X  render Y ms  push-wait 0.00 ms  cores h A / m B ms  (mode l, transp T)  frame-p95 N ms`. `bench.py` reads tokens 1, 3 and 6.
  - `p?` and `p<name>=<v>` → `ok <name>`: `setParam`/`dumpParams` over `PARAM_FIELDS`, copied from `firmware/src/main.cpp:297-325` (about 30 lines). `paramsGen++` runs on every write. There is no NVS.
  - `l` resets the stats window. `t HH:MM[:SS]` sets the clock. `d<N>` sets the demo speed.
  - `s`: `mode l fps X clock HH:MM:SS along 0.000 across 0.000 gyro 0.0 …`. The IMU reads as dead, so bench runs pass `--allow-dead-imu`.
  - `x`: `STATE`/`TRACE`/hex rows/`END`, byte-for-byte the format of `main.cpp:361-382`.
  - `r` → `NVIC_SystemReset()`.
- **Power modes (new):** `w0` renders flat-out (default). `w<N>` caps at N fps, with `__WFI()` between frame slots and SysTick at 1 kHz as the wake source. `w-1` idles: no rendering, WFI only.
- **Port:** the ST-LINK VCP is a Windows COM port (VID 0483). `device.py`'s auto-detect looks for Espressif's 303A, so every call passes `--port COMx` (or sets `LW_PORT`). No change to `device.py`.

### Flashing (`tools/flash.sh`)
- `make`, then `powershell.exe` finds the ST-LINK mass-storage volume (label `DIS_H573*`) and `Copy-Item`s `build/bench.bin` onto it. This matches the `flash-win.sh` pattern: the board stays on the Windows side and no flasher needs installing.
- If the drive refuses the image (option bytes or TrustZone state), fall back to `STM32_Programmer_CLI.exe` on Windows. Record it in KAIZEN rather than engineering around it.

### Step 5 (after the numbers exist): LCD sanity view
- **Init:** `BSP_LCD_Init` from `stm32h573i-discovery-bsp` with the `st7789h2` component (240x240, 16-bit FMC).
- **Frame:** after each frame, copy a 240-px-wide window at column `x0` of both strips, at their panel rows. The panel is 240 tall, so the rows are 1:1. Pixels are un-byte-swapped row by row through a static 240-px line buffer.
- **Commands:** `v<x0>` turns it on at column x0; `v-1` turns it off (default).
- **Timing:** reported as `lcd ms` in `f`, outside `render`. It is off for all timing and power runs.

## Critical files
- **New:** everything under `firmware-h5/` above, plus `docs/h573-bench.md` for the results.
- **Edited:** `.gitignore`. `KAIZEN.md` gets entries only for side findings: shared param-IO file, `device.py` VID list, a faster VCP baud rate for `x` dumps, `-fno-math-errno` on both targets, clock-scaling energy sweep.
- **Reused as-is:**
  - `firmware/src/render.cpp`, `physics.cpp`, `gen/*`, `spec/layout.h`
  - `firmware/tools/device.py`, `bench.py`, `compare-device.py`
  - The shim pattern from `check_meniscus.py`

## Verification
1. **Build:** `make -C firmware-h5` succeeds with no warnings from the port files. `--print-memory-usage` shows RAM under 640 KB and flash under 2 MB. The `.su` files show the deepest render stack fits `_Min_Stack_Size` (set to 16 KB).
2. **Boot:** `tools/device.py --port COMx s` shows sysclk 250000000, supply SMPS, and arena used == cap.
3. **Speed, H5:** from `firmware/`:
   `tools/bench.py --port COMx --allow-dead-imu --preset ../presets/1.json --runs 3 --stages`
4. **Speed, S3 baseline:** the same scene and preset on the S3 `--bare` build (`tools/e2e.sh --bare --preset ../presets/1.json --runs 3 --stages`), so both have zero tilt. Put both into one table in `docs/h573-bench.md`: fps, render ms, h/m ms, per-stage costs.
5. **Parity:** `tools/compare-device.py --port COMx`. The H5 dump is checked against the sim. The >12/255 count should be in the same range as the S3's for the same params (memory: that count swings ±50 px with the liquid position). This proves the H5 renders the same image, so its timings are real.
6. **Power:** the IDD jumper (JP6 per UM3143; confirm the silkscreen) goes to an ammeter in series. Read mA in `w0`, `w30` and `w-1`, with the LCD off. Compute mJ/frame = I × 3.3 V × frame time. Compare with the S3 datasheet figures (66–108 mA dual-core at 240 MHz) × the S3's measured frame time. A plain DMM is fine for `w0` and `w-1`. For `w30`, check the DMM reading against the duty-cycle model: idle + (run − idle) × 30 × frame time.
7. **Board runs:** delegate steps 2–6 (flash, bench and parity) to an Opus subagent, per the e2e memory. The user does the jumper and the meter reading.
