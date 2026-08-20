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
Inputs from physics: `fillTarget` (0..1), `fillPos` (px slosh offset), `angle` (deg), `acrossShift` (px).
`xe = fillTarget*L + fillPos` is the fill-edge centre.

1. **Background**: fill rows `y0..y0+H-1`, x `0..L` with `glass` (pure black by default).
2. **Ticks** (if `ticks`): `N = 12` (hours) or `60` (minutes); for `i in 1..N-1`, `x = round(i*L/N)`;
   height `tickMajorH` when `i % (N==60 ? 5 : 3) == 0` else `tickMinorH`; draw that many pixels of `tick`
   colour from the top row down and from the bottom row up.
3. **Column**: for each row `ry`:
   - `edge = edgeX(ry)`:  `yc = 35.5`, `d = (ry-yc)/yc`,
     `edge = xe + tan(angle)*(ry-yc) + meniscusDepth * |d|^meniscusPow`.
   - left cap `x0 = 0` (or circle cut if `cornerR > 0`).
   - `hspan(y0+ry, x0, floor(edge), rows[ry])`.
   - Edge AA (`edgeSoft` px): pixel `floor(edge)+k` = `blend(glass, rows[ry], frac-k)`.
   - **Glow** (`edgeGlow` px after the edge): pixel `k` = `blend(glass, rows[ry], (1-k/edgeGlow)^2 * glowStrength)`.
4. **Highlight inset** (rows of the highlight band only): over the last `highlightInset` px before the edge and
   the first `highlightInset` px from the left, blend the highlight row colour toward the body colour
   (`rows[hiTop+highlightH+1]`) linearly so the highlight does not touch the meniscus / end cap.
5. **Fizz** (optional, `fizz`): `fizzCount` dots of size `fizzSize` px at (`fx = x*(xe-6)`, `fy`) drawn in
   `bubbleRim` colour (3×3+ get a `bubbleIn` centre); they drift up `fizzSpeed` px/s and wrap.
   Only drawn when inside the liquid (`fx < edgeX(fy) - 2`).
6. **Bubble** (optional): ellipse centre `(xe - bubbleGap, (H-1)*bubbleY - acrossShift/2)`, radii
   `bubbleW/2 × bubbleH/2`; per row: span in `bubbleIn[row]`, end pixels in `bubbleRim`; top and bottom rows get
   a short `bubbleRim` span of width `0.45*bubbleW`. Skipped when the bubble would poke out of the left end.

Nothing is ever drawn in `y 96..143` (bridge) or outside the tube strips; the full-frame path clears to black
first, the dirty-strip path only pushes rows `24..95` and `144..215`.

## Physics (fixed 50 Hz, `stepTube`)
Input per tube frame: `along` (g, + = right end down), `across` (g), `gyroAcross` (dps). Deadzone `deadzone` g.
- fill slosh: `rest = along*fillSloshGain`; `a = -fillK*(fillPos-rest) - fillDamp*fillVel + gyroAcross*angleGyroGain*4`.
- surface angle: `rest = clamp(along*angleTiltGain, ±angleMax)`;
  `a = -angleK*(angle-rest) - angleDamp*angleVel + gyroAcross*angleGyroGain*10`; clamp to `±angleMax`.
- `acrossShift += (across*acrossShiftGain - acrossShift) * min(1, 8*dt)`.
Semi-implicit Euler (`vel += a*dt; pos += vel*dt`).
Fill targets: `hours = (h%12 + (m + s/60)/60)/12`, `minutes = (m + s/60)/60`.
IMU → tube frame: `along = IMU_ALONG_TUBE_SIGN * a[IMU_AXIS_ALONG_TUBE] / |a|`, etc. (see `spec/layout.h`).
