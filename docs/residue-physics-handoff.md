# Residue physics hand-off — deposit, colour, drainage

_Follows the 2026-10-02 "imminent residue" change (render-only, step 3d). That change made the smear
right behind a receding line follow the contact line and hand over to the liquid; it deliberately left
the residue's own physics alone. This pass fixes that physics. Sim first, firmware mirrors._

## Step 0
- `cd sim && npm run check:meniscus` passes (337 scenes, max channel delta 9/255) before you touch anything.
- Sim dev server (`.claude/skills/run-sim`). Repro: `NOFIZZ=1 node ../docs/residue-physics/tiltshot.mjs
  /tmp/r ../docs/residue-physics/preset.json 1.0 1.6 2.6` (the user's preset: vertical, free liquid,
  `traceAmount 2`, `traceStain 1`, `traceThin 2.1`, liquid `#40c51b` at `liquidTransparency 0.58`). Upscale
  shots ×4–6 before judging; the tube is ~60 px wide.
- Board (optional until the end): `/dev/ttyACM0`, `.claude/skills/firmware-e2e`. Delegate runs to an Opus agent.

## What is physically backwards (current model)
1. **Deposit vs speed** — `sim/src/physics.ts` `dep()` (~line 272), firmware `physics.cpp` ~153:
   `v = TRACE_FULL / (1 + traceThin·U/100)`, fast recession deposits *less*. A receding meniscus entrains
   a film that is *thicker* when faster (Bretherton/LLD in a tube): `h/R = 1.34 Ca^⅔ / (1 + 3.35 Ca^⅔)`,
   `Ca = Ca25·U/25`, `Ca25 = θ_dyn³/(9·9.2)` from `contactDyn` — the same law as `filmEta()` in
   `sim/src/render.ts` and `contactDyn` in `material/derive.ts:388`. Syrup saturates (thick whatever the
   speed), water scales with `U^⅔`.
2. **Dried colour** — `buildPalette` `traceRows` = opaque-liquid shading × 0.85, alpha `traceAmount·gamma·rowW`.
   With `traceAmount 2` the smear is darker than the liquid column it came from. A dried dye stain is a
   transparent tint: Beer–Lambert against the back in linear light, `B·(C/B)^τ`, τ = deposited amount relative
   to the bulk chord (the film code has the LUTs: `FILM_LG` / `FILM_EX` / `filmMix`). A scattering pigment
   (blood?) would need coverage / Kubelka–Munk instead — decide per material, not per preset.
3. **Tilt drying** — `TRACE_TILT_DRY` makes a tilted tube dry up to 5× faster. Gravity *moves* a wet film,
   it does not evaporate it: a conservative signed flux toward the low end, `q ∝ along·h³` per column,
   mass that reaches the meniscus rejoins the liquid; evaporation (`traceDry`) stays tilt-independent.
4. **Drain-back by distance** — `traceFollow` pulls the wet excess back toward *either* edge by distance;
   with item 3 it should follow gravity's sign (and capillary pull near the line, if wanted).

## The trap
Flipping `traceThin` alone (1) with `traceAmount 2` paints the whole smear opaque green: (2) is still in
place, so a denser deposit just means more opaque pigment. Do (2) first, judge, then (1), then (3)/(4).

## Constraints
- Params change ⇒ `firmware/tools/gen_params.py` FIELDS, render.cpp / physics.cpp, `presets/1.json`,
  `npm run dump:presets`, `python3 firmware/tools/gen_params.py presets/1.json`, `pio run`. Grep the repo.
  Retire or repurpose `traceThin` rather than keeping a knob whose physics is inverted.
- Material layer: `material/derive.ts` 95–97 / 399–405 and `coherence.ts` 87–100 derive / bound the trace
  params from viscosity and solids; keep `check:materials` green. Presets migrate mechanically, no re-tuning.
- Firmware: no lazy allocation; per-column state is `L × u16` per tube — internal RAM has ~1.9 KB free,
  put new buffers in PSRAM at boot (`render_init` / `traceBuf`). Two tubes render on two cores: no shared
  mutable scratch. Per-pixel `powf` / `expf` / division are calls on the S3: LUTs and reciprocals.
- Keep the imminent-residue invariants: near a receding line the residue hands over **monotonically** to the
  body colour (no band lighter than both — the user caught one); the smear follows the contact line;
  `check-meniscus.cjs` junction / gate / short-slug regressions stay green.
- The device `x` dump carries `trace[]` for `compare-device.py`: a new per-column state needs dumping too.

## Verify
- `npm run check:meniscus`, `check:presets`, `check:materials`, `check:imu`; `python3 firmware/tools/check_residue.py`;
  `check_render_frames.py --reference <HEAD render.cpp> --list-diffs` (its random group always has residue).
- Visual: the repro above, plus honey (`presets/honey.json` with `vertical/freeLiquid` on) — syrup coats, water
  barely stains; a fast drop leaves a denser coat than a slow one; an upright tube's film runs down.
- Board: `tools/e2e.sh --ref HEAD --preset <preset with traceFilm 0.3> --runs 3`; stress = `device.py w6`
  + `tools/tilt.py --hold 40 '-0.7,0.7'` + `device.py w0` (sweep persists in NVS). Reference 2026-10-02:
  at rest 22.15 ms render / 30.9 fps; stress minutes core median 20.34 ms (HEAD before the imminent change 18.03).

## Done when
A fast drop leaves its densest residue next to the liquid, no smear reads denser than the column, an upright
tube's wet film drains toward the meniscus instead of vanishing, sim and board agree (0 px > 12/255), no
render regression at rest, KAIZEN "Imminent residue" items 2–3 ticked.
