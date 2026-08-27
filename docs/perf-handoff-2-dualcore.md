# Perf hand-off 2/4 — one tube per core

_Series: 1 math → **2 dual-core** → 3 layer cache → 4 dirty-region._

## Goal
Hours and minutes tubes are independent; render them at the same time on core 0 and core 1. Up to 2×
on render time. No pixel changes.

## Do
1. Move all renderer working state (framebuffer pointer, strip geometry, edge arrays, palette, labels,
   fizz snapshot) into a per-tube context struct. Nothing file-static except per-slot caches.
2. Pinned worker task on core 0 renders the hours tube; the main loop renders minutes; hand-shake with
   a task notification. Both strips must be idle (DMA finished) before the frame starts.
3. Inputs are snapshotted per frame (tube states, params copy or generation, fizz positions) — serial
   param writes and the physics step must not touch what the worker is reading.
4. BLE lives on core 0: keep the worker below the controller's priority and measure with a central
   connected. Consider pinning the NimBLE host to core 1.

## Verify
- Parity unchanged (`compare-device.py`); `x` dump still works through the same path.
- `f`: render ms roughly halves. Shake with `d60` for a minute: no watchdog, no torn frames.

## Not now
Triple buffering, physics on core 0, a separate fizz task (→ KAIZEN).

## Done when
Concurrent render measured and recorded, no shared mutable statics left.
