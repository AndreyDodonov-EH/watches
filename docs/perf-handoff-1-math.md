# Perf hand-off 1/4 — math collapse + build flags

_Series: **1 math** → 2 dual-core → 3 layer cache → 4 dirty-region. Face at ~18 fps (2026-08-27)._

## Goal
Stop recomputing, every row and every frame, things that depend only on params. Bit-exact with the sim.
Expected 1.3–1.5×.

## First: baseline
- `f` over serial → fps, render ms, push-wait ms. Confirm render-bound.
- Stage costs via `p<name>=0` toggles: digits, ticks, frontBright, edgeGlow, meniscusBand/Rim, fizz, lens.
- Same build without BLE — know what BLE costs before hand-off 2.
- Record all of it in STATUS.md.

## Do
1. Build with `-O2` instead of the default `-Os`. No `-ffast-math`.
2. Edge loop: hoist the per-tube constants (skew tangent) and precompute the per-row, param-only
   tables (lens-warped row coordinate, meniscus power/bulge terms, corner mask) once per param change.
3. Cache every other param-only table: palette, mark source-row warps, lens magnification, lens row
   map, digit colours, label layout. Key them on a params generation counter (+ tube height, +
   light angle quantised to ½°).
4. Per-pixel mark path in integers only: emboss, alpha blend (take the 8-bit alpha, not a float),
   tick warped-range computed once instead of per tick.
5. Scaled sprite glyphs into internal RAM, not PSRAM.

## Params generation counter
One `uint32_t` bumped on every param write / preset load / NVS restore, passed to the renderer.
All caches in hand-offs 1, 3, 4 compare against it.

## Verify
`compare-device.py` mismatches must not grow after each step; `f` numbers per step into STATUS.md.
Eyeball presets with free liquid, meniscus band, lens, sprite digits, `remaining`.

## Done when
Merged, parity clean, before/after numbers recorded, generation counter in place.
