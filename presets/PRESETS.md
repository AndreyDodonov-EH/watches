# Signature presets — list and acceptance rules

Every preset is one real liquid in one real vessel, declared with a *material* (`mat` in
`sim/src/params.ts`), and the numbers must agree with that material. `npm run check:presets`
(`sim/tools/check-presets.ts`) enforces the rules below; `npm run dump:presets` writes the JSONs here.

## The list

| id | name | material | vessel / scale |
|---|---|---|---|
| frizzante | Frizzante | clear, watery, wetting, carbonated | lab cylinder, white print on the glass |
| urine | Urine sample | tinted amber (translucent), watery, wetting | specimen cup graduations on the glass |
| blood | Blood | opaque venous red, medium viscosity, wetting | syringe print on the glass |
| milk | Milk | opaque white colloid, medium-thin, wetting | printed scale on the glass |
| mercury | Mercury | opaque liquid metal, non-wetting, stiff surface | thermometer, etched glass scale |
| honey | Honey | translucent amber, viscous, wetting, trapped air | brass numerals behind the liquid |
| cola | Cola | translucent dark, watery, carbonated | enamel numerals behind the liquid |
| malt | Single malt | translucent amber, medium-thin, clings (legs) | brass numerals behind the liquid |
| champagne | Champagne | tinted pale gold (translucent), watery, fine bead | amber-resin numerals behind the liquid |
| cryo | Cryo oxygen | clear pale blue, superfluid-thin, boiling | frosted wall, steel numerals behind |
| ink | India ink | opaque black, medium viscosity | enamel numerals on the glass |
| glow | Glow stick | emissive green, medium viscosity, translucent | seven-segment print on the glass |
| xenon | Xenon | emissive plasma, no inertia | rear ticks, bold print |
| molten | Molten iron | emissive opaque metal, non-wetting, gas bubbles | forged numerals behind (dry side only) |
| free | Free liquid | user-tuned slug (2026-08-26), exempt from the checker | copper numerals |

Every preset also exists as `<id>-big` for the second, wider physical rod (`bigLens()` in `params.ts`, from
`examples/urine_big.json`): 72 px tubes at y 11 / 144, `lens` −0.05 with curve −3, marks moved with the tube
(thin presets take the example's hand-tuned mark values, wider ones scale theirs by 72 / tubeHeight), and
front digits drop their `topLens` pre-warp. `urine-big` reproduces the example exactly.

Removed: `user1`, `mint`, `neon`, `concept` (legacy colour-only looks; superseded by `glow`/`frizzante`).

## Base look (from `examples/`)

All liquids are built over `MODERN_BASE` in `params.ts` (= `examples/nice_meniscus.json` minus its colours
and bubbles): 46 px tubes at y 12 / 185 (or `LAYOUT_WIDE` 55 px at 7 / 224), `lens` −0.5 + `topLens` 0.35
for the rod, physical light with a broad soft highlight, dark body × high `liquidBright` for a saturated tint
at ~0.5 transparency, sprite digits behind the liquid every hour / 5 min at a mid-tube baseline, dark rear
ticks on both edges, hysteretic wetting meniscus (contact lag 3, film 15, hard edge, faint caustic glow) and
the **free slug** (`readFaceUp` 1, `readTurn` 125, `readHold` 11). Opaque liquids and lab glassware use
`FRONT_PRINT` instead (marks on the glass). Xenon is the only pinned column — plasma is not a slug.

## Acceptance rules (checked)

`freeGain` is gravity (570 for every slug); viscosity class → slug drag/bounce, surface spring, hysteresis, film, static skew, flick kick:

| class | freeDamp | freeBounce | meniscusK | meniscusDamp | contactLag | wetFilm | skew °/g | gyro kick |
|---|---|---|---|---|---|---|---|---|
| watery | 0.4–1.5 | 0.15–0.35 | 400–550 | 3–16 | 1.5–3 | 8–15 | 5–9 | 0.3–0.55 |
| medium | 1.5–4 | 0.05–0.15 | 200–350 | 12–25 | 2–3 | 12–20 | 3–5 | 0.15–0.35 |
| viscous | 6–14 | 0 | 60–150 | 25–50 | 3 | 20–30 | 0.5–2.5 | 0.02–0.12 |
| metal | 0.8–1.5 | 0.4–0.7 | 500–800 | 8–16 | 0–0.3 | 0 | 1.5–3 | 0.3–0.5 |
| plasma | pinned (freeLiquid off) | | any | any | 0 | 0 | 0–1 | 0–0.06 |

Non-wetting liquids (mercury, molten, xenon) take the metal-like surface rule (meniscusK 350–800, lag ≤ 0.3, film 0) whatever their bulk class.

Opacity (`liquidTransparency`):
- opaque ≤ 0.12: ticks and digits printed on top (rear marks would be invisible or faked by `markContrast`); shadeDepth 0.5–0.95.
- translucent 0.25–0.55: rear marks allowed (bright sprite digits need no markContrast floor); shadeDepth 0.5–0.85.
- clear ≥ 0.7 (colourless liquids only — a tinted liquid mixed 70 % toward the dark back turns khaki, so tinted ones are translucent): shadeDepth 0.3–0.55; liquidHi is a white surface reflection (saturation < 0.2); glassOverLiquid ≥ 0.5; rear marks need markContrast ≥ 16.

Light:
- emissive: glowStrength 0.4–0.8, edgeGlow 18–34, lightPhys 0 (it is its own light), glassOverLiquid ≤ 0.4, liquidBright 1.15–1.35, tube back luma < 16.
- not emissive: glowStrength ≤ 0.25 (a caustic at most); lightPhys ≥ 0.2.
- edgeSoft is a coverage ramp centred on the edge (0 = hard edge, 1 = classic 1-px AA, ≥ 2 a visibly soft meniscus); with a soft edge the glow folds into the same per-pixel alpha (min(1, cov + glow)) — seamless at any width, and the edge moves sub-pixel smooth.

Wetting:
- wetting: meniscusDepth > 0 (concave), wetFilm per class.
- non-wetting: meniscusDepth < 0 (convex bead), wetFilm 0, contactLag ≤ 0.3.

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
