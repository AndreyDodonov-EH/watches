# Liquid tube render routine (for mechanical port to firmware)

Source of truth: `sim/src/render.ts` (`drawTube`, `buildPalette`, `edgeX`) and `sim/src/physics.ts` (`stepTube`).
Parameters: `sim/params.json` (exported from the sim; keys documented in `sim/src/params.ts`).
Layout constants: `spec/layout.h` / `spec/layout.ts`.

Everything below uses only: horizontal spans (`hspan`), single pixels (`px`), and a 72-entry per-row colour
LUT. Colours are RGB565; blends happen only on a handful of edge pixels per row and can be done with a tiny
565 lerp.

## Per param-change (not per frame): palette
`buildPalette(p, acrossShift)` → for each tube row `ry` (0..71):
1. `t = ry/71`. Cylinder shading: for `t < 0.33` lerp from `mix(body, lo, 0.25)` to `body`;
   else lerp `body → lo` by `((t-0.33)/0.67) * shadeDepth`.
2. Highlight band rows `hiTop .. hiTop+highlightH` (`hiTop = round(2 + acrossShift)`): tent weight
   `k = 1 - |((ry-hiTop)/(highlightH-1)) - 0.5|*2`; `c = mix(c, hi, 0.35 + 0.65k)`.
3. Multiply by `brightness`, quantise to 565 → `rows[ry]`. Also `bubbleIn[ry] = rows[ry]` darkened by `bubbleDark`.
   (Note `acrossShift` moves the highlight by a few px — on firmware either rebuild the LUT when it changes
   by ≥1 px or just index `rows[ry - shift]`.)

## Per frame, per tube (`y0` = 24 for hours, 144 for minutes; `L=536`, `H=72`)
Inputs from physics: `fillTarget` (0..1), `fillPos` (px slosh offset), `angle` (deg), `acrossShift` (px),
`edgeLight` (-1..1 slow along-tilt follower).
`xe = fillTarget*L + fillPos` is the fill-edge centre.

1. **Background**: fill rows `y0..y0+H-1`, x `0..L` with `glass` (pure black by default).
2. _(ticks and digits moved to step 4b — they are drawn after the column so they can show through it)_
3. **Column**: for each row `ry`:
   - `edge = edgeX(ry)`:  `yc = 35.5`, `d = (ry-yc)/yc`, `t = edgeLight` (smoothed along-tilt, -1..1),
     `asymEff = meniscusAsym * clamp(0.4 - 0.6*t, 0, 1)`,
     `depth = meniscusDepth * (1 + meniscusTiltGain*t) * (1 - asymEff*d)`,
     `edge = xe + tan(angle)*(ry-yc) + depth * |d|^meniscusPow`.
     Tilt reshapes the drop end: end down (+t) -> pressure fills the cap into a deeper, rounder,
     symmetric bulge; end up (-t) -> the drop drains/flattens and the remainder clings to the bottom
     wall (thin tail); at rest a mild bottom-cling remains (liquid always sags onto the lower wall).
     The front brightening is weighted by `luma(rows[ry])/max` so the dark bottom wall stays dark
     near the cap (otherwise the light reads as a false bottom bulge).
   - left cap `x0 = 0` (or circle cut if `cornerR > 0`).
   - `hspan(y0+ry, x0, floor(edge), rows[ry])`.
   - Edge AA (`edgeSoft` px): pixel `floor(edge)+k` = `blend(glass, rows[ry], frac-k)`.
   - **Front brightening** (`frontBright` px before the edge): pixel `xi-k` = `blend(rows[ry], hi, min(1, (1-k/frontBright)^2 * 0.85 * lightK))`.
   - **Glow** (`edgeGlow` px after the edge): pixel `k` = `blend(glass, rows[ry], min(1, (1-k/edgeGlow)^2 * glowStrength * lightK))`.
   - `lightK = max(0.25, 1 + edgeLightGain * edgeLight)` — tilt changes the LIGHT at the edge, not the
     column: gravity pressing the liquid into the right end brightens the cap, draining away dims it.
4. **Highlight inset** (rows of the highlight band only): over the last `highlightInset` px before the edge and
   the first `highlightInset` px from the left, blend the highlight row colour toward the body colour
   (`rows[hiTop+highlightH+1]`) linearly so the highlight does not touch the meniscus / end cap.
4b. **Scale = tick ladder + labels** (`N = 12` hours / `60` minutes). The labels are **laid out first**
   (measured, not drawn) so the tick pass can leave a gap under each number instead of drawing a line
   through it; then ticks are drawn, then the labels.

   _Label layout_ (per tube; hours use `digitScaleX/Y`, `digitBottom`, minutes `digitScaleXMin/YMin`, `digitBottomMin`):
   font `FONTS[digitFont]` (3×5, 4×6, 5×7 round, 5×7 seven-segment, 6×8 bold) scaled to
   `bw = round(gw*scaleX)` × `bh = round(gh*scaleY)` by nearest-neighbour (`src = floor(dst*g/box)`),
   inter-glyph gap `max(1, round(scaleX))`, box centred on `x = round(i*L/N)` for `i` in steps of
   `digitHourStep` / `digitMinuteStep`, `0 < i < N`; rows `yTop..yBase` with `yBase = y0+H-1-digitBottom`,
   `yTop = yBase-bh+1`; glyph rows coloured by a `digitColor→digitColor2` gradient, optional 1 px
   `digitShadowColor` copy offset (+1,+1) drawn first (which also widens/deepens the box by 1 px).

   _Ticks_ (per tube: `tick*H` for hours, `tick*M` for minutes): for `i = step, 2·step, … < N`, `x = round(i*L/N)`;
   tick `i` is **major** when `tickMajorEvery > 0 && i % tickMajorEvery == 0` — note this counts **units**
   (hours / minutes), not "every n-th minor tick", so majors stay put when `tickStep` changes.
   (A major can only land where a minor exists, so keep `tickMajorEvery` a multiple of `tickStep`.)
   Major → `tickMajorHeight` rows, `tickMajorWidth` px wide (centred on `x`), colour `tickMajorColor`;
   minor → `tickMinorHeight` rows, always 1 px, `tickColor`. Drawn from the top row down (`tickPos` 0 or 2)
   and/or from the bottom row up (1 or 2). A tick is **skipped on the side where it would hit a label** —
   i.e. when its column is within `[x0-1, x1+1]` of a label box *and* its rows overlap `[yTop, yBase]`.

   _Compositing_ (both ticks and labels, every pixel): outside the liquid (`x >= edge(ry)`) the colour is
   written as-is. Inside, it is seen through the liquid:
   `c = blend(liquid[ry], colour, liquidTransparency)`, and then, if `|luma(c) - luma(liquid[ry])| < floor`,
   `c` is pushed away from the liquid's luma (down by scaling, up by blending toward white) until it clears
   the floor. `floor = markContrast * tickBright` for ticks and `markContrast * digitBright` for labels —
   scaling it by the layer's trim is what lets a dimmed layer actually stay dim over the liquid instead of
   being pushed back up to legibility. Without that floor a mid-grey tick vanishes into the highlight band, which covers most of
   the upper half of the tube. `ticksOnTop` (ticks, both tubes) and `digitsOnTop` (labels) skip the whole
   liquid path and write the colour as-is everywhere — the mark is printed on the glass *in front of* the
   liquid rather than seen through it, so the ladder keeps one appearance across liquid and empty glass.
   Image-glyph coverage `a_img` (0..1) multiplies the final write.
   **Firmware:** the liquid behind a mark is always the per-row LUT colour, so the blend + contrast push
   collapses into one extra `H`-entry table per mark colour (minor, major, each digit gradient row), rebuilt
   only when params change — no per-pixel luma maths at run time.

   **Image digits** (`digitFont` ≥ 5: 5 steel, 6 brass steampunk, 7 copper gauge): glyphs come from a 64 px-high RGBA sheet
   (`sim/public/assets/digits-*.png` + `.json` with per-glyph widths, produced from the AI sheets in `images/digits/` by
   `sim/tools/make-digit-sprites.py`). The glyph box is the same nominal 5×7 em: `bw = round(5*scaleX)`, `bh = round(7*scaleY)`;
   each glyph is box-filtered to `round(width_d * bw/cellW)` × `bh`, proportional spacing with gap `round(bw/5)`, optional
   multiply-tint `digitTint` × `digitTintAmount` (turns the greyscale steel sheet bronze/gold), then `brightness`.
   **Firmware:** the box-filter runs offline — generate one `RGB565 + A8` table per
   (sheet, hours box, minutes box) from `params.json` and blit it the same way; ~2-4 KB per table, no runtime scaling.
4c. **Brightness**: `brightness` is the panel-wide dimmer (it stands in for display command 0x51) and
   multiplies everything. On top of it each layer has its own trim, applied wherever that layer's colours
   are quantised: `liquidBright` on `liquid` / `liquidHi` / `liquidLo` — hence on the row LUT, the front
   brightening, the edge glow, and the bubble + fizz colours derived from the LUT; `tickBright` on
   `tickColor` / `tickMajorColor`; `digitBright` on the `digitColor→digitColor2` gradient, the emboss
   `digitShadowColor` and the image-sheet glyphs. `glass` takes the panel dimmer only, so the empty part of
   the tube does not drift when the liquid is boosted. Products are clamped to 0..255 before the RGB565
   quantise, so a trim above 1 saturates the highlight band toward white rather than wrapping.
   **Firmware:** all of this is LUT-build time, not per-pixel.
5. **Fizz** (optional, `fizz`): `fizzCount` dots of size `fizzSize` px at (`fx = x*(xe-6)`, `fy`) drawn in
   `bubbleRim` colour (3×3+ get a `bubbleIn` centre); they drift up `fizzSpeed` px/s and wrap.
   Only drawn when inside the liquid (`fx < edgeX(fy) - 2`).
6. **Bubble** (optional): ellipse centre `(xe - bubbleGap, (H-1)*bubbleY - acrossShift/2)`, radii
   `bubbleW/2 × bubbleH/2`; per row: span in `bubbleIn[row]`, end pixels in `bubbleRim`; top and bottom rows get
   a short `bubbleRim` span of width `0.45*bubbleW`. Skipped when the bubble would poke out of the left end.

Nothing is ever drawn in `y 96..143` (bridge) or outside the tube strips; the full-frame path clears to black
first, the dirty-strip path only pushes rows `24..95` and `144..215`.

## Physics (fixed 50 Hz, `stepTube`)
The liquid is modelled as capillary-pinned in a thin sealed tube: tilt/shake only nudge the fill edge and
the light, never relocate the column. **Hard caps** (constants in `physics.ts`, ported verbatim; params can
tighten them, never widen): `FILL_SLOSH_MAX_PX = 14` on `|fillPos|` (rest offset AND integrated state, with
outward velocity zeroed on clamp) and `ANGLE_HARD_MAX_DEG = 12` on `|angle|` (`aMax = min(angleMax, 12)`).
Input per tube frame: `along` (g, + = right end down), `across` (g), `gyroAcross` (dps). Deadzone `deadzone` g.
- fill slosh: `rest = clamp(along*fillSloshGain, ±14)`; `a = -fillK*(fillPos-rest) - fillDamp*fillVel + gyroAcross*angleGyroGain*4`; clamp pos to ±14.
- surface angle: `rest = clamp(along*angleTiltGain, ±aMax)`;
  `a = -angleK*(angle-rest) - angleDamp*angleVel + gyroAcross*angleGyroGain*10`; clamp to `±aMax`.
- `acrossShift += (across*acrossShiftGain - acrossShift) * min(1, 8*dt)`.
- `edgeLight += (clamp(along, ±1) - edgeLight) * min(1, 5*dt)` — feeds the render `lightK` (step 3).
Semi-implicit Euler (`vel += a*dt; pos += vel*dt`).
Fill targets: `hours = (h%12 + (m + s/60)/60)/12`, `minutes = (m + s/60)/60`.
IMU conditioning (`ImuFilter`, before the springs): tilt input clipped to ±1.2 g (a gravity direction can
never exceed 1 g — the excess is linear acceleration); accel low-pass = **two cascaded** one-poles at
`accelLpHz` (`a = 1-exp(-2π f dt)`, 12 dB/oct — one pole lets wrist-jerk spikes kick the springs); gyro
one-pole high-pass at `gyroHpHz` (`k = rc/(rc+dt)`, `y = k(y_prev + x - x_prev)`) → removes bias and slow
rotation, then deadzone `gyroDeadzone` dps and clamp `±gyroMax`; all × `inputGain`.
IMU → tube frame: `along = IMU_ALONG_TUBE_SIGN * a[IMU_AXIS_ALONG_TUBE] / n`, etc. (see `spec/layout.h`),
where `n` is **not** this sample's `|a|` but a slow EMA of it (`GravityNorm`, tau ≈ 2 s, floored at 0.5):
instantaneous `|a|` collapses during jerks/free-fall and would amplify transients 3-5×.
Regression: `cd sim && npm run check:imu` replays rest / wrist-wave / 3 g flick / free-fall / ±90° /
shake traces through the exact pipeline and asserts the edge never strays past its budget.
