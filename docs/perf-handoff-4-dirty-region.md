# Perf hand-off 4/4 — inter-frame dirty regions

_Series: 1 math → 2 dual-core → 3 layer cache → **4 dirty-region**. Builds on 3 (layers are the pristine
restore source). KAIZEN levers 1, 2, 5. Payoff is mainly power; fps follows._

## Goal
Frame N reuses frame N-1's strip. Only pixels that can differ are restored and redrawn, and only the
dirty rectangle is pushed. At rest with fizz off: nothing rendered, nothing pushed.

## What is dirty
- Time edge (and home edge for free liquid): per row, old ∪ new edge position widened by every effect's
  reach (soft edge, glow, front-bright, film, meniscus band/rim, highlight inset).
- Fizz discs and the bubble: old ∪ new boxes.
- Any cache-key change (params, light, parallax): whole strip → full path of hand-off 3.
- Lens: a dirty span on a destination row implies the same span on its source row and vice versa;
  keep a pre-lens working strip and lens-copy dirty spans into the DMA strip.

## Per frame
Compute new edges and boxes → union with last frame's → restore those spans from WET/DRY → rerun all
live passes clipped to the spans, in normal order → lens-copy → push the bounding window only (panel
accepts arbitrary windows) → remember edges/boxes for next frame.

## The one rule
Blending passes leave residue, so a dirty span is always **restored from the layers first**, never
re-blended. Over-widen bands by a couple of px rather than risk a smear.

## Fizz
Forces continuous repaint. Animate it at 10–15 Hz, default off on battery, or accept — decide on
measured draw.

## Verify
- Debug self-check: render incrementally and fully, compare buffers, report mismatches while shaking
  every preset. Must be 0.
- `f`/`s` gain frames-rendered and frames-pushed counters; at rest both → 0.
- Ten minutes of tilting: no smears at the glow or meniscus band.

## Not now
Dropping the PSRAM canvas or second strip (KAIZEN 6), sleep modes, Wi-Fi memory.

## Done when
Rest costs nothing, self-check clean across presets under motion, numbers in STATUS.md, KAIZEN
levers 1/2/5 ticked.
