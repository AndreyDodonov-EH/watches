# Perf hand-off 3/4 — WET / DRY layer cache

_Series: 1 math → 2 dual-core → **3 layer cache** → 4 dirty-region. Needs the generation counter from 1.
This is KAIZEN "incrementality" lever 3._

## Goal
Everything static — tube back, liquid body, ticks, digits seen through liquid or air, glass — is
rendered once per param change into two per-tube composites. A frame is then per-row memcpy splits at
the edges plus the live effects. Removes marks and palette (the bulk) from the hot path.

## Why it works
Mark compositing already decides "behind liquid or behind air" per column, so a pixel's colour is a
function of (row, column, wet?) only — not of where the edge is.

## Layers per tube
- **WET**: liquid fill + rear ticks/digits with the wet warp and through-liquid contrast.
- **DRY**: tube-back fill + rear ticks/digits with the dry warp, no contrast pass.
- **TOP**: on-top ticks (pre-lens) and on-top digits (post-lens) as a sparse alpha list.
Rebuild key: generation counter, tube height, light angle (½°), tick parallax (½ px). If parallax churn
during tilt costs too much, draw ticks live and cache only digits. `remaining` renders the layers
mirrored once.

## Per frame
Row split DRY | WET | DRY at the two edges → edge anti-aliasing → live passes as today (meniscus
band/rim, front-bright, glow, wet film, highlight inset) → fizz, bubble → TOP ticks → lens → TOP digits.

## Exactness
Identical except in the meniscus band, where today's mid-row wet test and per-row contrast test can
disagree; with layers both follow the per-row edge. Accept, record the mismatch count.

## Verify
- `compare-device.py`: mismatches only in meniscus columns (check diff.png).
- `f` with digits on vs off is now the same.
- One rebuild per param edit (log it). Presets: sprite digits, digits/ticks on top, remaining, free
  liquid, lens.

## Done when
Marks and palette out of the per-frame path; rebuilds only on key change; numbers and mismatch note in
STATUS.md; KAIZEN lever 3 ticked.
