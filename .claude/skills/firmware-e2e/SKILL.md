---
name: firmware-e2e
description: Measure fps / stage costs and check sim parity on the real Liquid Watch board (build → flash → bench → compare). Use for any firmware perf step, before/after numbers, "does it still match the sim", or when a reboot/crash needs a reset reason.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
---

# Firmware e2e (all commands from `firmware/`)

## The one-liner
```bash
tools/e2e.sh --label "hand-off 1 step 2"            # build → flash → pinned bench → parity, appended to .compare/e2e.log
tools/e2e.sh --stages                                # + per-stage cost table (digits, ticks, fizz, glow, …), ~2 min
tools/e2e.sh --no-flash                              # measure what is already flashed
tools/e2e.sh --no-ble                                # -DNO_BLE build (baseline: BLE costs ~0 ms)
```
Pass = fps not lower than the previous log entry AND `mismatched pixels` not higher, `>12/255 off: 0`.
Baseline @ f0a3de7: **20.6 fps, render 44.4 ms**, digits 20.7 ms of it; parity ~200 px ≤1 LSB.

## Pieces
- `tools/device.py CMD…` — one-off serial (`f` fps, `s` status, `p?` params, `pname=v`, `t HH:MM`, `d0` freeze, `r` reboot).
  Auto-detects `/dev/ttyACM*` (usbipd-attached) or Windows COMx. Prints `BOARD REBOOTED (<reason>)` if a
  boot banner shows up — reasons: poweron/sw/panic/task-wdt/brownout/usb.
- `tools/bench.py [--stages] [--stage name=v] [--samples N]` — pinned scene (`t 10:09:30`, `d0`, `inputGain=0`),
  median fps. Never compare unpinned `f` numbers: fps swings 19–25 with fill level/tilt.
- `tools/compare-device.py` — device strips vs `sim/tools/render-ref.ts`; writes `.compare/{device,ref,diff}.png`.
  Read `diff.png` when mismatches grow (yellow = >12/255).
- `tools/flash.sh` / `flash-win.sh` — app-only flash, NVS-tuned params survive; the clock resets to 10:09:30.
- `python.exe "$(wslpath -w tools/ble-session.py)" s f` — same protocol over BLE from the Windows radio.

## Rules
- Scripts restore params from a `p?` snapshot; never send `p!` (it overwrites NVS 2 s later).
- Open serial with DTR=RTS=1 (device.py does) — clearing them can reset the ESP32-S3.
- One serial client at a time; the port is exclusive.
