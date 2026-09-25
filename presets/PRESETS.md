# Signature presets — list and acceptance rules

Every preset is one real liquid in one real vessel, declared with a *material* (`mat` in
`sim/src/params.ts`), and the numbers must agree with that material. `npm run check:presets`
(`sim/tools/check-presets.ts`) enforces the rules below; `npm run dump:presets` writes the JSONs here.

## The list

| id | name | material | vessel / scale |
|---|---|---|---|
| frizzante | Frizzante | clear, watery, wetting, carbonated | lab cylinder, white print on the glass |
| alpine | Alpine spring | clear, watery, wetting, carbonated | pale ceramic backing, rear slate scale, fine bead |
| pinot | Pinot noir | translucent ruby, watery, wetting, legs (2026-09-23), exempt from material ranges | parchment backing, bronze numerals behind the liquid |
| spritz | Aperol spritz | vivid orange-red aperitivo (translucent), watery, wetting, carbonated with a foam ring (2026-09-23), exempt from material ranges | white bar-glass backing, navy enamel numerals behind the liquid |
| cuvee | Cuvée | straw-gold sparkling wine, wetting, carbonated (2026-09-23), exempt from historical material ranges | ivory backing, bronze rear numerals, pale bead, restrained reflections |
| nocturne | Nocturne | opaque blue-black ink, medium viscosity, wetting, no gas | smoked glass, silver front markings, draining residue |
| tide | Bioluminescent tide | dark teal night-sea water, self-lit cyan edge, watery, wetting, plankton sparks (2026-09-23), exempt from material ranges | near-black vial, dim steel graduations and digits behind the glass |
| phosphor | Phosphor sample | pale green watery solution (translucent), wetting, no gas (2026-09-23) | clear lab vial on white paper, marker labels on the glass; see-through meniscus (`surfaceFill` 0.25, `surfaceBlick` 0.8) |
| urine | Urine sample | tinted amber (translucent), watery, wetting | specimen cup graduations on the glass |
| blood | Blood | opaque venous red, medium viscosity, wetting | syringe print on the glass |
| milk | Milk | opaque white colloid, medium-thin, wetting | printed scale on the glass |
| mercury | Mercury | opaque liquid metal, non-wetting, stiff surface | thermometer, etched glass scale |
| honey | Honey | translucent amber, viscous, wetting, trapped air | brass numerals behind the liquid |
| olive-oil | Olive oil | user-tuned olive green (2026-09-18), exempt from material ranges | pale numerals behind the liquid, lingering residue |
| cola | Cola | translucent dark, watery, carbonated | enamel numerals behind the liquid |
| malt | Single malt | translucent amber, medium-thin, clings (legs) | brass numerals behind the liquid |
| champagne | Champagne | tinted pale gold (translucent), watery, fine bead | amber-resin numerals behind the liquid |
| cryo | Cryo oxygen | clear pale blue, superfluid-thin, boiling | frosted wall, steel numerals behind |
| ink | India ink | opaque black, medium viscosity | enamel numerals on the glass |
| glow | Glow stick | emissive green, medium viscosity, translucent | seven-segment print on the glass |
| xenon | Xenon | emissive plasma, no inertia | rear ticks, bold print |
| molten | Molten iron | emissive opaque metal, non-wetting, gas bubbles | forged numerals behind (dry side only) |
| free | Free liquid | user-tuned slug (2026-08-26), exempt from the checker | copper numerals |

The original signature presets also exist as `<id>-big` for the second, wider physical rod (`bigLens()` in `params.ts`, from
`examples/urine_big.json`): 72 px tubes at y 11 / 144, `lens` −0.05 with curve −3, marks moved with the tube
(thin presets take the example's hand-tuned mark values, wider ones scale theirs by 72 / tubeHeight), and
front digits drop their `topLens` pre-warp. `urine-big` reproduces the example exactly. Alpine spring,
Pinot noir, Aperol spritz, Cuvée, Nocturne, Bioluminescent tide and Phosphor sample are standard-rod only.

Removed: `user1`, `mint`, `neon`, `concept` (legacy colour-only looks; superseded by `glow`/`frizzante`).

## Base look (from `examples/`)

All liquids are built over `MODERN_BASE` in `params.ts` (= `examples/nice_meniscus.json` minus its colours
and bubbles): 46 px tubes at y 12 / 185 (or `LAYOUT_WIDE` 55 px at 7 / 224), `lens` −0.5 + `topLens` 0.35
for the rod, physical light with a broad soft highlight, dark body × high `liquidBright` for a saturated tint
at ~0.5 transparency, sprite digits behind the liquid every hour / 5 min at a mid-tube baseline, dark rear
ticks on both edges, hysteretic wetting meniscus (contact lag 3, film 15, hard edge, faint caustic glow) and
the **tilt-controlled slug** (time held below 20°, smoothly released by 50°; deliberate back-and-forth
tilts keep it free for `playHold`, default 5 s). Opaque liquids and lab glassware use
`FRONT_PRINT` instead (marks on the glass). Xenon is the only pinned column — plasma is not a slug.

## Acceptance rules (checked)

`freeGain` is gravity (570 for every slug); viscosity class → slug drag/bounce, surface spring, hysteresis, film, static skew, flick kick:

| class | freeDamp | freeBounce | meniscusK | meniscusDamp | wetFilm | skew °/g | gyro kick |
|---|---|---|---|---|---|---|---|
| watery | 0.4–1.5 | 0.15–0.35 | 400–550 | 3–16 | 8–15 | 5–9 | 0.3–0.55 |
| medium | 1.5–4 | 0.05–0.15 | 200–350 | 12–25 | 12–20 | 3–5 | 0.15–0.35 |
| viscous | 6–14 | 0 | 60–150 | 25–50 | 20–30 | 0.5–2.5 | 0.02–0.12 |
| metal | 0.8–1.5 | 0.4–0.7 | 500–800 | 8–16 | 0 | 1.5–3 | 0.3–0.5 |
| plasma | pinned (freeLiquid off) | | any | any | 0 | 0–1 | 0–0.06 |

Non-wetting liquids (mercury, molten, xenon) take the metal-like surface rule (meniscusK 350–800, film 0) whatever their bulk class.

Traces (residue on the glass where an edge receded — blood smear, syrup coating, legs — whose wet part drains back after the liquid before its stain dries): need a wetting liquid — non-wetting and plasma presets must have `traces` off. A wetting preset that leaves it on keeps `traceAmount` 0.2–2 (>1 boosts opacity through the streak/height attenuation, blood 1.1), `traceDry` 0.1–2 s — the flat-watch drying time constant; tilting along the tube dries up to 5× faster (blood 1.5, honey 2, ink 1.2, malt 0.6) — `traceFollow` 0–1 tracking viscosity — watery liquids snap back (≥ 0.2, ink 0.5), viscous ones barely crawl (≤ 0.15, honey 0.08) — and `traceStain` 0.05–0.7 for how intense the leftover stain is (thick coatings high: honey 0.45; thin legs low: malt 0.2). `traceThin` 0–3 thins the deposit with edge speed (fast smears come out faint, dense near the liquid): thin liquids high (ink 1.5), syrup low (honey 0.3). `traceFilm` 0–1 is a permanent film over the whole glass as a residue level (0 = bare glass between smears; 0.03–0.1 reads as a lightly coated tube): coating liquids (blood, honey, olive oil) may carry one, watery ones stay near 0.

Opacity (`liquidTransparency`):
- Dried residue retains its shaded pigment colour independently of bulk transparency; `traceAmount`, `traceStain`, and drying control its visibility.
- opaque ≤ 0.12: ticks and digits printed on top (rear marks would be invisible or faked by `markContrast`); shadeDepth 0.5–0.95.
- translucent 0.25–0.55: rear marks allowed (bright sprite digits need no markContrast floor); shadeDepth 0.5–0.85.
- clear ≥ 0.7 (colourless liquids only — a tinted liquid mixed 70 % toward the dark back turns khaki, so tinted ones are translucent): shadeDepth 0.3–0.55; liquidHi is a white surface reflection (saturation < 0.2); glassOverLiquid ≥ 0.5; rear marks need markContrast ≥ 16.

Light:
- emissive: glowStrength 0.4–0.8, edgeGlow 18–34, lightPhys 0 (it is its own light), glassOverLiquid ≤ 0.4, liquidBright 1.15–1.35, tube back luma < 16.
- not emissive: glowStrength ≤ 0.25 (a caustic at most); lightPhys ≥ 0.2.
- edgeSoft is a coverage ramp centred on the edge (0 = hard edge, 1 = classic 1-px AA, ≥ 2 a visibly soft meniscus); with a soft edge the glow folds into the same per-pixel alpha (min(1, cov + glow)) — seamless at any width, and the edge moves sub-pixel smooth.

Wetting:
- The meniscus is a contact-angle model (`contactAngle`, `contactHyst`, `contactDyn`, `capLength`): both ends are spherical caps set by
  their angle; tilt pressure moves it within the hysteresis band, a moving line sits at the advancing / receding angle (Cox–Voinov on top).
- wetting: `contactAngle + contactHyst` < 90° (concave at both ends), wetFilm per class.
- non-wetting: `contactAngle − contactHyst` > 90° (convex bead), wetFilm 0.
- plasma: no meniscus dynamics (`meniscusInertia`, `contactHyst`, `contactDyn` all 0).

Gas:
- none: fizz off.
- carbonated: fizz on, size 1–2 px, speed 30–55, count 30–60 (watery only).
- boiling: fizz on, size 1–1.5, speed 45–60, count 45–60.
- trapped (viscous / molten): fizz on, size 2–4, speed ≤ 8, count ≤ 12.

Colour & scale:
- luma(liquid) < luma(liquidHi) (liquidLo is the Lambert dark under physical light and may sit above a very dark body).
- on-top ticks/digits must differ ≥ 40 luma from the tube back (they sit on the dry side too; dark-on-light is fine).
- highlightBright × liquidBright ≤ 1.3 for non-metal, non-emissive liquids (else the specular burns to a white stripe).
- sprite fonts, hours tube: digitScaleY ≤ digitScaleX (vial stretch) and baseline + 8·scaleY ≤ tubeHeight (glyph fits).
- trims: liquidBright 0.9–2 (1.15–1.5 if emissive), tickBright 0.8–1.3, digitBright 0.8–1.8.

## Cuvée — current renderer (2026-09-23)

Select **Cuvée** in the simulator, open `?fresh=1&preset=cuvee&t=7:23&settle=1`,
or import `cuvee.json`. One standard-rod preset: 54 px tubes at y 0 / 185.

Uses the two `perfect_*` reference exports for glass geometry and damped surface motion.
Warm straw colour, an ivory backing, bronze rear markings and pale bubble rims give depth
without emissive glow. A short-lived bead collects at the meniscus. The 20–50° reading
band and home spring keep the time legible at rest, releasing the slug under strong tilt.
The JSON contains the complete v20 configuration, including inactive controls.

The current renderer uses 3.8 px bubble diameters, 0.48 transparency and the references'
685 / 38 meniscus spring/damping; this look is exempt from the historical material ranges,
like Pinot noir and Aperol spritz. Preview: `images/presets/cuvee.png`.

## Nocturne — current renderer (2026-09-23)

Select **Nocturne**, open `?fresh=1&preset=nocturne&t=7:23&settle=1`, or import
`nocturne.json`. One standard-rod preset: 54 px tubes at y 0 / 185.

Blue-black ink fills from the left against smoked grey glass. Silver numerals and
fine graduations sit on the front glass so they remain readable over opaque ink.
A soft reflection and a concave meniscus define the column; after a tilt, a wet
smear drains back and fades. No bubbles or glow. The reading pose holds the time,
while strong tilt releases the liquid. Best viewed with the black cuff.

The complete v20 JSON matches the picker. Its declared medium, opaque, wetting
material is covered by `npm run check:presets`. Preview: `images/presets/nocturne.png`.

## Bioluminescent tide — current renderer (2026-09-23)

Select **Bioluminescent tide**, open `?fresh=1&preset=tide&t=7:23&settle=1`, or import
`tide.json`. One standard-rod preset: 54 px tubes at y 0 / 185.

A night-sea sample in a near-black vial. The water is dark teal in bulk and lights itself
cyan where the path is short: a glow past the fill edge, a lit concave cap and a bright
rim, with a faint physical highlight so the vial still reads as glass. Tiny bright sparks
drift slowly through the column and are stirred by motion; they never form a foam. Dim
steel graduations every hour / 5 min and sprite digits every 3 h / 15 min sit behind the
glass and are lit through the water. No residue. The slug is always free, on the current
tuned physics, and is exempt from the material ranges. Preview: `images/presets/tide.png`.
