# Residue loop math (2026-09-22)

Small firmware-only changes to the existing residue compositor; no new buffers, caches,
allocations, baked backgrounds, or changes to the rendering stages. The simulator remains
the reference for the appearance.

- Expand the packed red and blue channels together.
- Replace `a*(256-T) + b*T` with `(a<<8) + (b-a)*T`. Unsigned arithmetic preserves the
  packed result, including borrows between lanes; channel rounding is unchanged.
- Extract the output bit fields directly. The ESP32-S3 partial-alpha loop drops from
  55 to 47 instructions, five multiplies to three (including the alpha multiply), and
  loses its per-pixel stack store/load.
- In the wet-edge loop, hoist the reciprocal soft-edge and wet-film widths, take the
  smaller coverage numerator, and clamp once. This removes the per-pixel software
  divisions and four `fminf`/`fmaxf` calls. Reciprocal multiplication can differ from
  division at float rounding boundaries; the complete-frame checks below found no
  resulting pixel changes.

## Device measurements

ESP32-S3, 240 MHz, existing `-O2` build. User's current olive-oil settings: H=60,
`traceFilm=0.17`, `traceAmount=2`, `wetFilm=19`, `edgeSoft=4`, `remaining=1`.
For repeatability: `d0`, `inputGain=0`, `fizz=0`, `freeLiquid=0`; clear traces while
the new clock position settles, then enable them. Five samples per case, 2.15 s
apart, median reported. Repeat with `traceAmount=0` to measure the residue cost.
All changed parameters were restored and read back, and the clock resumed afterward.

| Scene | FPS before → after | Render ms before → after | Residue ms before → after |
| --- | --- | --- | --- |
| Nearly empty, film across glass (`11:59:59`) | 35.3 → 36.9 | 20.78 → 19.56 | 9.12 → 7.89 |
| Half-filled (`06:30:00`) | 26.4 → 27.2 | 30.26 → 29.17 | 6.35 → 5.18 |

Residue cost falls 13.5% / 18.4%; whole-frame FPS improves 4.5% / 3.0%.
Residue-off render times were 11.66 → 11.67 ms and 23.91 → 23.99 ms.
These are stationary scenes; no separate moving wet-band FPS claim is made.

## Verification

- Firmware build and application flash succeeded; saved settings were preserved.
- `python3 firmware/tools/check_residue.py`: 286,326,784 scalar blend comparisons,
  including all RGB565 colours in both roles against eight colour anchors at every
  fractional alpha, all uint16 alpha values at every row weight, and span guards.
  Compiled with undefined-behaviour sanitization; passed.
- Native before/after rendering of 2,000 deterministic scenes: identical strip bytes.
  Varied height 4–80, both orientations, fixed/free liquid, partial trace ranges,
  film floor, opacity headroom, wet bands, hard/soft edges, tilt, and meniscus shape.
  Comparison used the pre-optimization working source, preserving the existing
  gradual-residue and full-tube-film changes.
