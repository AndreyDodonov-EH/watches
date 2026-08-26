// All tunables live here. Colours are RGB888 hex strings but are quantised to RGB565 at render time.
// Export/import as JSON from the control panel; the exported file is the contract for Phase 3 (spec/params.h).

export interface Params {
  v: number;             // params schema version (not shown in the UI); bumped when a key changes meaning
  // --- colours (hex "#rrggbb"); quantised to RGB565 before drawing ---
  liquid: string;        // body colour
  liquidHi: string;      // specular highlight strip
  liquidLo: string;      // bottom shade (cylinder shading)
  tubeBack: string;      // colour behind the liquid and glass layers (very dark; 0 = AMOLED off)
  // --- glass tube shading (empty part; specular also over the liquid) ---
  glassHi: string;       // specular colour of the glass wall
  glassBody: number;     // 0..1 ambient cylinder shade of the empty wall (0 = pure black, AMOLED off)
  glassHiBright: number; // 0..1 strength of the specular band (same rows as the liquid highlight)
  glassReflect: number;  // 0..1 faint second reflection on the lower wall
  glassRim: number;      // 0..1 brightening of the outermost rows (wall edges catch light)
  glassOverLiquid: number; // 0..1 how much of the glass specular is laid over the liquid too
  lens: number;          // -1..1 vertical distortion; negative compresses, positive magnifies
  lensCurve: number;     // -3..3 profile; negative reverses the distortion direction
  bubbleRim: string;
  // --- layout (px) ---
  tubeHeight: number;    // across-tube size, ≤ TUBE_HEIGHT_MAX
  hoursY: number;        // top row of the hours tube
  minutesY: number;      // top row of the minutes tube
  // --- shape ---
  remaining: boolean;    // true = liquid at the right end, draining as time passes; false = fills from the left
  highlightH: number;    // px, height of highlight strip at top of column
  highlightInset: number;
  highlightBright: number; // 0..1.5 strength of the specular band
  highlightSharp: number;  // 0.3..4 band profile exponent (high = narrow, glossy)
  shadeDepth: number;    // 0..1, how dark the bottom rows get (cylinder shading)
  meniscusDepth: number; // px, how far the liquid climbs the wall at top/bottom vs centre (>0 concave)
  meniscusPow: number;   // curve exponent (2 = parabola)
  meniscusTiltGain: number; // 0..1: tilt into the end bulges the drop (deeper meniscus), away flattens it
  meniscusAsym: number;  // 0..1: across-tilt sags the bulge onto the low wall (its contact line extends, the high one retracts)
  edgeSoft: number;      // px, anti-aliased edge width (0 = hard pixel edge)
  frontBright: number;   // px, band just behind the fill edge blended toward liquidHi (bright convex cap look)
  edgeGlow: number;      // px, dim glow fading out past the fill edge (0 = off)
  glowStrength: number;  // 0..1 brightness of the glow at the edge
  cornerR: number;       // px, rounding of the column's left end (tube end cap)
  edgeLightGain: number; // 0..1, how much along-tilt brightens (+) / dims (-) the fill-edge light
  // --- bubble ---
  bubble: boolean;
  bubbleW: number;       // px
  bubbleH: number;       // px
  bubbleGap: number;     // px, distance from fill edge to bubble centre
  bubbleY: number;       // 0..1 vertical position in the tube (0.5 = centre, like a spirit level)
  bubbleDark: number;    // 0..1, darkening of bubble interior
  bubbleRollGain: number; // 0..2 bubble rise toward the high wall per g of across-tilt (1 = follows the wall)
  bubbleTiltGain: number; // px the bubble slides toward the high end per g of along-tilt
  // --- fizz (small drifting bubbles, like the reference photo) ---
  fizz: boolean;
  fizzCount: number;
  fizzSize: number;      // px (1..8)
  fizzSizeVar: number;   // 0..1, per-bubble size spread (bigger ones rise faster)
  fizzShadeOff: number;  // 0..1, dark core offset toward lower-right, fraction of radius
  fizzSpeed: number;
  fizzDriftGain: number; // 0..2 steering: fraction of rise speed that goes toward the high end per g of along-tilt
  fizzAcrossGain: number; // 0..2, across-tilt → on-screen rise direction (1 = rises toward the physically high edge)
  fizzFlatRise: number;   // 0..1, on-screen rise speed when the face points up (bubbles rise toward the viewer)
  fizzSquash: number;     // 0.5..2, extra vertical pre-squash on fizz discs at mid-height, fading to 1 at the edges
  // --- ticks, hours tube (units = hours) ---
  ticksH: boolean;
  tickStepH: number;       // minor tick every N hours
  tickMajorEveryH: number; // major tick every N hours (0 = none) — in units, not "every N-th minor"
  tickMinorHeightH: number;// px
  tickMajorHeightH: number;// px
  tickMinorWidthH: number; // px
  tickMajorWidthH: number; // px
  tickColorH: string;      // minor
  tickMajorColorH: string;
  tickPosH: number;        // 0 top, 1 bottom, 2 both
  // --- ticks, minutes tube (units = minutes) ---
  ticksM: boolean;
  tickStepM: number;
  tickMajorEveryM: number; // major tick every N minutes (0 = none)
  tickMinorHeightM: number;
  tickMajorHeightM: number;
  tickMinorWidthM: number;
  tickMajorWidthM: number;
  tickColorM: string;
  tickMajorColorM: string;
  tickPosM: number;
  ticksOnTop: boolean;   // false rear/bottom surface, true curved front/top surface
  tickLens: number;      // 0..1 cylinder depth warp before the whole-tube lens
  tickParallax: number;  // px rear-surface shift per g of tilt
  tickDryLens: number;   // -1..1 cylinder warp for rear ticks behind air (no liquid); negative stretches the edges
  tickEmboss: number;    // 0..1 glass-cut edge strength
  // --- digits along the bottom of the tube (3x5 pixel font) ---
  digits: boolean;
  digitColor: string;    // top of glyph
  digitColor2: string;   // bottom of glyph (vertical gradient → metallic look; set equal for flat)
  digitShadow: boolean;  // 1 px darker copy offset down-right (emboss)
  digitShadowColor: string;
  digitTint: string;     // sprite fonts only: multiply colour (e.g. #cd7f32 bronze)
  digitTintAmount: number; // 0 = untinted sheet, 1 = fully tinted
  digitTone: number;     // sprite fonts only: -1 = black, 0 = source, 1 = white
  digitFont: number;     // 0..4 bitmap, 5..11 image sprites
  digitScaleX: number;   // hours tube: horizontal scale (0.5..6, fractional OK — nearest-neighbour)
  digitScaleY: number;   // hours tube: vertical scale — keep lower than X to counter the vial's vertical stretch
  digitScaleXMin: number; // minutes tube
  digitScaleYMin: number;
  digitBottomMin: number; // minutes tube baseline (px from bottom edge)
  digitBottom: number;   // hours tube: px from the tube's bottom edge to the digit baseline
  digitsOnTop: boolean;  // true = printed on the glass (fully opaque over the liquid); false = behind the liquid, seen through it by liquidTransparency
  bottomLens: number;    // 0..1 depth warp for digits printed behind the liquid
  digitDryLens: number;  // -1..1 depth warp for rear digits behind air; negative stretches the edges
  topLens: number;       // -1..1 pre-distortion for digits printed on top; negative compensates physical glass magnification
  topParallax: number;   // px across-shift of top digits per g of across-tilt; counters the apparent shift under the physical lens
  liquidTransparency: number; // 0..1 how much of ticks/digits shows through the liquid (0 = opaque liquid)
  markContrast: number;  // min luma difference a tick/digit must keep from the liquid behind it (0 = off)
  digitsLeadingZero: boolean; // minutes as 05,10,... instead of 5,10,...
  digitMinuteStep: number; // label every N minutes (5,10,15,20,30)
  digitHourStep: number;   // label every N hours (1..6)
  digitHourStart: number;  // first labelled hour (0 = step); step 2 + start 1 = odd hours
  digitMinuteStart: number; // first labelled minute (0 = step)
  digitsLastOnlyH: boolean; // hours: one label only, the last passed hour (none before 1)
  digitsLastOnlyM: boolean; // minutes: one label only, last passed multiple of digitMinuteStep
  // --- physics (fixed-step 50 Hz) ---
  fillK: number;         // spring stiffness of fill-edge position (1/s^2)
  fillDamp: number;      // damping ratio-ish (1/s)
  fillSloshGain: number; // px per g of along-tube acceleration
  angleK: number;        // spring stiffness of surface angle
  angleDamp: number;
  angleTiltGain: number; // deg of in-plane front skew per g of across-tube tilt (static response)
  angleGyroGain: number; // fill-edge kick per dps of rotation about the across axis (flicks)
  angleMax: number;      // deg clamp
  lightPhys: number;     // 0..1: 0 = fixed style light at lightAngle, 1 = world-up light from the IMU (highlight row, cylinder shading)
  lightAngle: number;    // deg, style highlight angle: 0 = centre row, 90 = top wall
  acrossK: number;       // spring stiffness of the light (roll) swing
  acrossDamp: number;
  acrossGyroGain: number; // deg impulse per dps of roll rate (gyro about the tube axis)
  shakeGain: number;     // 0..2 agitation sensitivity to gyro energy (fizz speed, edge glow)
  deadzone: number;      // g, ignore tiny accelerations
  // --- IMU conditioning (applied to board / phone input before the springs; ported to firmware) ---
  accelLpHz: number;     // low-pass cutoff for accel (gravity direction), Hz
  gyroHpHz: number;      // high-pass cutoff for gyro: removes bias and slow rotations, keeps flicks
  gyroDeadzone: number;  // dps, ignore gyro below this after filtering
  gyroMax: number;       // dps, clamp
  inputGain: number;     // overall multiplier on tilt input (0.1..2)
  // --- display ---
  // brightness is the panel-wide dimmer; the three below are per-layer trims on top of it, so the
  // liquid can glow while the printed scale sits back in the shadow at the bottom wall of the tube.
  brightness: number;    // 0..1 global multiplier (emulates cmd 0x51)
  liquidBright: number;  // liquid only: body / highlight / shade, and the bubble + fizz derived from them
  tickBright: number;    // tick ladder only
  digitBright: number;   // numeric labels only (glyph gradient, emboss shadow and image sheets)
}

export const PARAMS_VERSION = 12;

export const DEFAULT_PARAMS: Params = {
  v: PARAMS_VERSION,
  tubeHeight: 72,
  hoursY: 0,
  minutesY: 168,
  remaining: false,
  liquid: '#346a2a',
  liquidHi: '#b6ffa0',
  liquidLo: '#1e7515',
  tubeBack: '#000000',
  glassHi: '#a8c0c8',
  glassBody: 0.1,
  glassHiBright: 0.55,
  glassReflect: 0.22,
  glassRim: 0.4,
  glassOverLiquid: 0.4,
  lens: 0.6,
  lensCurve: 1,
  bubbleRim: '#b0c7a9',
  highlightH: 11,
  highlightBright: 1,
  highlightSharp: 1,
  highlightInset: 0,
  shadeDepth: 0.49,
  meniscusDepth: -12,
  meniscusPow: 3.2,
  meniscusTiltGain: 0.55,
  meniscusAsym: 0.5,
  edgeSoft: 2.6,
  frontBright: 21,
  edgeGlow: 15,
  glowStrength: 0.25,
  cornerR: 0,
  edgeLightGain: 1,
  bubble: false,
  bubbleW: 16,
  bubbleH: 19,
  bubbleGap: 22,
  bubbleY: 0.2,
  bubbleRollGain: 0.5,
  bubbleTiltGain: 0,
  bubbleDark: 1,
  fizz: true,
  fizzCount: 10,
  fizzSize: 2,
  fizzSizeVar: 0.5,
  fizzShadeOff: 0.3,
  fizzDriftGain: 1,
  fizzAcrossGain: 1,
  fizzFlatRise: 0.3,
  fizzSquash: 1,
  fizzSpeed: 14,
  ticksH: true, tickStepH: 1, tickMajorEveryH: 3, tickMinorHeightH: 27, tickMajorHeightH: 16, tickMinorWidthH: 1, tickMajorWidthH: 2, tickColorH: '#303030', tickMajorColorH: '#303030', tickPosH: 2,
  ticksM: true, tickStepM: 5, tickMajorEveryM: 3, tickMinorHeightM: 27, tickMajorHeightM: 16, tickMinorWidthM: 1, tickMajorWidthM: 2, tickColorM: '#303030', tickMajorColorM: '#303030', tickPosM: 2,
  ticksOnTop: false,
  tickLens: 0.35,
  tickParallax: 3,
  tickDryLens: -0.4,
  tickEmboss: 0.25,
  digits: true,
  digitColor: '#e3e3e3',
  digitColor2: '#20312f',
  digitShadow: true,
  digitShadowColor: '#101010',
  digitFont: 5,
  digitTint: '#6d6617',
  digitTintAmount: 0.65,
  digitTone: 0,
  digitScaleX: 6,
  digitScaleY: 5,
  digitScaleXMin: 3.75,
  digitScaleYMin: 4.5,
  digitBottomMin: 19,
  digitBottom: 16,
  digitsOnTop: false,
  bottomLens: 0.35,
  digitDryLens: -0.4,
  topLens: 0,
  topParallax: 0,
  liquidTransparency: 0.17,
  markContrast: 0,
  digitsLeadingZero: false,
  digitMinuteStep: 15,
  digitHourStep: 3,
  digitHourStart: 0,
  digitMinuteStart: 0,
  digitsLastOnlyH: false,
  digitsLastOnlyM: false,
  fillK: 246,
  fillDamp: 14.8,
  fillSloshGain: 5.5,
  angleK: 207,
  angleDamp: 17.6,
  angleTiltGain: 5.5,
  angleGyroGain: 0.37,
  angleMax: 6,
  lightPhys: 0,
  lightAngle: 53,
  acrossK: 200,
  acrossDamp: 20,
  acrossGyroGain: 0,
  shakeGain: 0,
  deadzone: 0,
  accelLpHz: 15.2,
  gyroHpHz: 5,
  gyroDeadzone: 31,
  gyroMax: 470,
  inputGain: 1,
  brightness: 0.92,
  liquidBright: 1.29,
  tickBright: 1.2,
  digitBright: 0.82,
};

/** Neon preset close to images/reference-liquid.jpg */
export const PRESET_NEON: Partial<Params> = {
  liquid: '#39ff14', liquidHi: '#b6ffa0', liquidLo: '#158f08', bubbleRim: '#d8ffcc', tubeBack: '#061006',
  fizz: true,
};
/** Concept-art preset (images/concept-cuff.jpg): rounded ends, convex bright front, neon. */
export const PRESET_CONCEPT: Partial<Params> = {
  ...PRESET_NEON, meniscusDepth: -14, meniscusPow: 2.2, cornerR: 36, frontBright: 16, edgeGlow: 18, glowStrength: 0.45,
  highlightH: 14, highlightInset: 30, bubble: false, fizz: true, fizzCount: 10, fizzSize: 2, shadeDepth: 0.7,
};
/** User-tuned look (2026-08-20): deep green body, wide highlight, convex bright front, fizz. */
export const PRESET_USER_V1: Partial<Params> = {
  liquid: '#346a2a', liquidHi: '#b6ffa0', liquidLo: '#1e7515', tubeBack: '#000000', bubbleRim: '#b0c7a9',
  highlightH: 30, highlightInset: 0, shadeDepth: 0.7, meniscusDepth: -8.5, meniscusPow: 1.6, edgeSoft: 2.7,
  frontBright: 32, edgeGlow: 25, glowStrength: 0.47, cornerR: 0, bubble: false, fizz: true, fizzCount: 10, fizzSize: 2, fizzSpeed: 14,
};
export const PRESET_MINT: Partial<Params> = {
  liquid: '#5dcaa5', liquidHi: '#9fe1cb', liquidLo: '#1f6b52', bubbleRim: '#bff5dc', tubeBack: '#000000',
  fizz: false,
};

// ---------------------------------------------------------------------------
// Signature presets. Each one is a whole look: liquid optics, glass, scale,
// labels and the physics that go with that liquid's density and viscosity.
// Applied over DEFAULT_PARAMS (see applyPreset), so they are reproducible.
// ---------------------------------------------------------------------------

/** Venous blood in a graduated syringe: opaque, viscous, matte, clinical print on the glass. */
export const PRESET_BLOOD: Partial<Params> = {
  liquid: '#8c0f1c', liquidHi: '#d94a45', liquidLo: '#2a040b', tubeBack: '#050203', bubbleRim: '#e08a80',
  glassHi: '#93a2ae', glassBody: 0.07, glassHiBright: 0.34, glassReflect: 0.14, glassRim: 0.5, glassOverLiquid: 0.22,
  highlightH: 8, highlightBright: 0.9, highlightSharp: 2.6, highlightInset: 0, shadeDepth: 0.86,
  meniscusDepth: 6, meniscusPow: 2, meniscusTiltGain: 0.4, meniscusAsym: 0.75,
  edgeSoft: 1.6, frontBright: 8, edgeGlow: 0, glowStrength: 0, cornerR: 0, edgeLightGain: 0.5,
  bubble: false, fizz: false,
  liquidTransparency: 0.05, markContrast: 0,
  ticksOnTop: true, tickEmboss: 0, tickLens: 0, tickParallax: 0,
  ticksH: true, tickStepH: 1, tickMajorEveryH: 3, tickMinorHeightH: 7, tickMajorHeightH: 13, tickMajorWidthH: 2,
  tickColorH: '#9aa4ac', tickMajorColorH: '#e8eef2', tickPosH: 0,
  ticksM: true, tickStepM: 5, tickMajorEveryM: 15, tickMinorHeightM: 7, tickMajorHeightM: 13, tickMajorWidthM: 2,
  tickColorM: '#9aa4ac', tickMajorColorM: '#e8eef2', tickPosM: 0,
  digits: true, digitFont: 1, digitsOnTop: true, digitShadow: false,
  digitColor: '#eef3f6', digitColor2: '#aab6be', digitShadowColor: '#101010',
  digitScaleX: 3.5, digitScaleY: 3.5, digitBottom: 4, digitHourStep: 3,
  digitScaleXMin: 2.5, digitScaleYMin: 2.5, digitBottomMin: 4, digitMinuteStep: 15, digitsLeadingZero: true,
  fillK: 170, fillDamp: 22, fillSloshGain: 3, angleK: 220, angleDamp: 24, angleTiltGain: 3, angleGyroGain: 0.15, angleMax: 4,
  lightPhys: 0.2, lightAngle: 48,
  brightness: 0.9, liquidBright: 1.05, tickBright: 1, digitBright: 1,
};

/** Sparkling mineral water in a lab cylinder: near-clear, printed graduations, constant fizz. */
export const PRESET_SPARKLING: Partial<Params> = {
  liquid: '#79b6c9', liquidHi: '#f2ffff', liquidLo: '#22596c', tubeBack: '#03080a', bubbleRim: '#eaffff',
  glassHi: '#d3e9f2', glassBody: 0.15, glassHiBright: 0.7, glassReflect: 0.3, glassRim: 0.75, glassOverLiquid: 0.55,
  highlightH: 5, highlightBright: 1.25, highlightSharp: 3.2, highlightInset: 0, shadeDepth: 0.55,
  meniscusDepth: 9, meniscusPow: 1.8, meniscusTiltGain: 0.5, meniscusAsym: 0.45,
  edgeSoft: 2, frontBright: 14, edgeGlow: 6, glowStrength: 0.12, cornerR: 0, edgeLightGain: 0.9,
  bubble: false, fizz: true, fizzCount: 46, fizzSize: 1, fizzSpeed: 40, fizzFlatRise: 0.5, fizzDriftGain: 1, fizzAcrossGain: 1,
  liquidTransparency: 0.72, markContrast: 26,
  ticksOnTop: true, tickEmboss: 0, tickLens: 0, tickParallax: 0,
  ticksH: true, tickStepH: 1, tickMajorEveryH: 3, tickMinorHeightH: 8, tickMajorHeightH: 16, tickMajorWidthH: 2,
  tickColorH: '#8fb3bf', tickMajorColorH: '#ffffff', tickPosH: 0,
  ticksM: true, tickStepM: 1, tickMajorEveryM: 5, tickMinorHeightM: 6, tickMajorHeightM: 13, tickMajorWidthM: 2,
  tickColorM: '#7fa3af', tickMajorColorM: '#ffffff', tickPosM: 0,
  digits: true, digitFont: 1, digitsOnTop: true, digitShadow: false,
  digitColor: '#ffffff', digitColor2: '#cfe6ef',
  digitScaleX: 3.25, digitScaleY: 3.25, digitBottom: 5, digitHourStep: 3,
  digitScaleXMin: 2.25, digitScaleYMin: 2.25, digitBottomMin: 5, digitMinuteStep: 15, digitsLeadingZero: false,
  fillK: 300, fillDamp: 9, fillSloshGain: 12, angleK: 190, angleDamp: 12, angleTiltGain: 9, angleGyroGain: 0.6, angleMax: 10,
  lightPhys: 0.35, lightAngle: 55,
  brightness: 0.95, liquidBright: 1.15, tickBright: 1.1, digitBright: 1.05,
};

/** Xenon discharge tube: violet plasma, no slosh, glow past the column end, seven-segment scale. */
export const PRESET_XENON: Partial<Params> = {
  liquid: '#6a3cf5', liquidHi: '#d9c8ff', liquidLo: '#1a0570', tubeBack: '#05020c', bubbleRim: '#d8ccff',
  glassHi: '#a394d8', glassBody: 0.13, glassHiBright: 0.5, glassReflect: 0.2, glassRim: 0.6, glassOverLiquid: 0.6,
  highlightH: 12, highlightBright: 0.85, highlightSharp: 1.5, highlightInset: 0, shadeDepth: 0.42,
  meniscusDepth: -6, meniscusPow: 2, meniscusTiltGain: 0, meniscusAsym: 0,
  edgeSoft: 0, frontBright: 22, edgeGlow: 26, glowStrength: 0.6, cornerR: 20, edgeLightGain: 0.3,
  bubble: false, fizz: false,
  liquidTransparency: 0.5, markContrast: 34,
  ticksOnTop: false, tickLens: 0.4, tickParallax: 2, tickEmboss: 0.4,
  ticksH: true, tickStepH: 1, tickMajorEveryH: 3, tickMinorHeightH: 10, tickMajorHeightH: 20, tickMajorWidthH: 2,
  tickColorH: '#3a2a6a', tickMajorColorH: '#9a86ff', tickPosH: 2,
  ticksM: true, tickStepM: 5, tickMajorEveryM: 15, tickMinorHeightM: 10, tickMajorHeightM: 20, tickMajorWidthM: 2,
  tickColorM: '#3a2a6a', tickMajorColorM: '#9a86ff', tickPosM: 2,
  digits: true, digitFont: 4, digitsOnTop: true, bottomLens: 0.35, digitShadow: false,
  digitColor: '#00e5ff', digitColor2: '#00708f',
  digitScaleX: 4.5, digitScaleY: 4, digitBottom: 14, digitHourStep: 3,
  digitScaleXMin: 3.25, digitScaleYMin: 3.75, digitBottomMin: 17, digitMinuteStep: 15, digitsLeadingZero: false,
  fillK: 260, fillDamp: 22, fillSloshGain: 0.5, angleK: 300, angleDamp: 26, angleTiltGain: 0.5, angleGyroGain: 0.05, angleMax: 2,
  lightPhys: 0, lightAngle: 40,
  brightness: 1, liquidBright: 1.18, tickBright: 1, digitBright: 0.9,
};

/** Mercury column: non-wetting convex bead, mirror specular that follows real gravity, etched glass scale. */
export const PRESET_MERCURY: Partial<Params> = {
  liquid: '#b7c1c8', liquidHi: '#ffffff', liquidLo: '#333c44', tubeBack: '#04060a', bubbleRim: '#e8f0f5',
  glassHi: '#e2edf5', glassBody: 0.13, glassHiBright: 0.6, glassReflect: 0.35, glassRim: 0.78, glassOverLiquid: 0.5,
  highlightH: 6, highlightBright: 1.45, highlightSharp: 3.6, highlightInset: 0, shadeDepth: 0.95,
  meniscusDepth: -11, meniscusPow: 2.4, meniscusTiltGain: 0.35, meniscusAsym: 0.15,
  edgeSoft: 1, frontBright: 30, edgeGlow: 0, glowStrength: 0, cornerR: 0, edgeLightGain: 0.7,
  bubble: false, fizz: false,
  liquidTransparency: 0, markContrast: 55,
  ticksOnTop: true, tickLens: 0, tickParallax: 0, tickEmboss: 0.35,
  ticksH: true, tickStepH: 1, tickMajorEveryH: 3, tickMinorHeightH: 8, tickMajorHeightH: 16, tickMajorWidthH: 2,
  tickColorH: '#8b959d', tickMajorColorH: '#e6eef4', tickPosH: 0,
  ticksM: true, tickStepM: 5, tickMajorEveryM: 15, tickMinorHeightM: 8, tickMajorHeightM: 16, tickMajorWidthM: 2,
  tickColorM: '#8b959d', tickMajorColorM: '#e6eef4', tickPosM: 0,
  digits: true, digitFont: 10, digitsOnTop: false, bottomLens: 0.5,
  digitTint: '#dfe9f0', digitTintAmount: 0.6, digitTone: 0.3,
  digitScaleX: 5, digitScaleY: 4.25, digitBottom: 12, digitHourStep: 3,
  digitScaleXMin: 3.5, digitScaleYMin: 4, digitBottomMin: 14, digitMinuteStep: 15, digitsLeadingZero: false,
  fillK: 120, fillDamp: 8, fillSloshGain: 9, angleK: 260, angleDamp: 14, angleTiltGain: 2, angleGyroGain: 0.5, angleMax: 5,
  lightPhys: 0.8, lightAngle: 50,
  brightness: 0.88, liquidBright: 1.1, tickBright: 1.05, digitBright: 1.15,
};

/** Single malt in cut crystal: warm amber, alcohol clings to the wall, brass numerals under the liquid. */
export const PRESET_MALT: Partial<Params> = {
  liquid: '#b3600f', liquidHi: '#ffcf7a', liquidLo: '#431a04', tubeBack: '#0a0603', bubbleRim: '#f0c88a',
  glassHi: '#f2e0b4', glassBody: 0.16, glassHiBright: 0.65, glassReflect: 0.35, glassRim: 0.8, glassOverLiquid: 0.45,
  highlightH: 12, highlightBright: 1, highlightSharp: 1.4, highlightInset: 0, shadeDepth: 0.8,
  meniscusDepth: 7, meniscusPow: 2.2, meniscusTiltGain: 0.6, meniscusAsym: 0.8,
  edgeSoft: 2.6, frontBright: 18, edgeGlow: 10, glowStrength: 0.22, cornerR: 0, edgeLightGain: 1,
  bubble: false, fizz: false,
  liquidTransparency: 0.45, markContrast: 34,
  ticksOnTop: false, tickLens: 0.4, tickParallax: 3, tickEmboss: 0.5,
  ticksH: true, tickStepH: 1, tickMajorEveryH: 3, tickMinorHeightH: 10, tickMajorHeightH: 18, tickMajorWidthH: 2,
  tickColorH: '#6b4a1f', tickMajorColorH: '#d9a441', tickPosH: 2,
  ticksM: true, tickStepM: 5, tickMajorEveryM: 15, tickMinorHeightM: 10, tickMajorHeightM: 18, tickMajorWidthM: 2,
  tickColorM: '#6b4a1f', tickMajorColorM: '#d9a441', tickPosM: 2,
  digits: true, digitFont: 6, digitsOnTop: false, bottomLens: 0.35,
  digitTint: '#c08a2a', digitTintAmount: 0.35, digitTone: 0.2,
  digitScaleX: 6, digitScaleY: 5, digitBottom: 16, digitHourStep: 3,
  digitScaleXMin: 3.75, digitScaleYMin: 4.5, digitBottomMin: 19, digitMinuteStep: 15, digitsLeadingZero: false,
  fillK: 200, fillDamp: 13, fillSloshGain: 7, angleK: 200, angleDamp: 16, angleTiltGain: 6, angleGyroGain: 0.3, angleMax: 8,
  lightPhys: 0.25, lightAngle: 52,
  brightness: 0.85, liquidBright: 1.15, tickBright: 1, digitBright: 1.1,
};

/** Molten iron in a sooted vial: emissive, opaque, slow and heavy, forged numerals. */
export const PRESET_MOLTEN: Partial<Params> = {
  liquid: '#ff5a00', liquidHi: '#ffd98a', liquidLo: '#5e0e00', tubeBack: '#0b0300', bubbleRim: '#ffd08a',
  glassHi: '#c08a60', glassBody: 0.09, glassHiBright: 0.4, glassReflect: 0.18, glassRim: 0.45, glassOverLiquid: 0.3,
  highlightH: 8, highlightBright: 0.85, highlightSharp: 1.2, highlightInset: 0, shadeDepth: 0.78,
  meniscusDepth: -4, meniscusPow: 2, meniscusTiltGain: 0.5, meniscusAsym: 0.5,
  edgeSoft: 0, frontBright: 20, edgeGlow: 26, glowStrength: 0.6, cornerR: 0, edgeLightGain: 1,
  bubble: false, fizz: true, fizzCount: 12, fizzSize: 2, fizzSpeed: 8, fizzFlatRise: 0.25, fizzDriftGain: 0.6, fizzAcrossGain: 0.8,
  liquidTransparency: 0.06, markContrast: 44,
  ticksOnTop: false, tickLens: 0.35, tickParallax: 2, tickEmboss: 0.35,
  ticksH: true, tickStepH: 1, tickMajorEveryH: 3, tickMinorHeightH: 10, tickMajorHeightH: 18, tickMajorWidthH: 3,
  tickColorH: '#4a3a34', tickMajorColorH: '#9a8478', tickPosH: 2,
  ticksM: true, tickStepM: 5, tickMajorEveryM: 15, tickMinorHeightM: 10, tickMajorHeightM: 18, tickMajorWidthM: 3,
  tickColorM: '#4a3a34', tickMajorColorM: '#9a8478', tickPosM: 2,
  digits: true, digitFont: 8, digitsOnTop: false, bottomLens: 0.35,
  digitTint: '#b06a34', digitTintAmount: 0.45, digitTone: 0.3,
  digitScaleX: 6, digitScaleY: 5, digitBottom: 15, digitHourStep: 3,
  digitScaleXMin: 3.75, digitScaleYMin: 4.5, digitBottomMin: 18, digitMinuteStep: 15, digitsLeadingZero: false,
  fillK: 140, fillDamp: 20, fillSloshGain: 4, angleK: 180, angleDamp: 22, angleTiltGain: 3, angleGyroGain: 0.15, angleMax: 5,
  lightPhys: 0.15, lightAngle: 45,
  brightness: 0.95, liquidBright: 1.2, tickBright: 1, digitBright: 1.1,
};

/** Cryogenic oxygen: pale blue, boiling hard, frosted wall, very low viscosity. */
export const PRESET_CRYO: Partial<Params> = {
  liquid: '#5fb4e8', liquidHi: '#ffffff', liquidLo: '#0e3f66', tubeBack: '#03070c', bubbleRim: '#f0fbff',
  glassHi: '#e2f4ff', glassBody: 0.2, glassHiBright: 0.5, glassReflect: 0.28, glassRim: 0.85, glassOverLiquid: 0.6,
  highlightH: 9, highlightBright: 1.1, highlightSharp: 1.6, highlightInset: 0, shadeDepth: 0.6,
  meniscusDepth: 10, meniscusPow: 1.6, meniscusTiltGain: 0.5, meniscusAsym: 0.4,
  edgeSoft: 3, frontBright: 12, edgeGlow: 12, glowStrength: 0.2, cornerR: 0, edgeLightGain: 0.9,
  bubble: false, fizz: true, fizzCount: 55, fizzSize: 1, fizzSpeed: 52, fizzFlatRise: 0.6, fizzDriftGain: 1.2, fizzAcrossGain: 1,
  liquidTransparency: 0.6, markContrast: 40,
  ticksOnTop: true, tickEmboss: 0, tickLens: 0, tickParallax: 0,
  ticksH: true, tickStepH: 1, tickMajorEveryH: 3, tickMinorHeightH: 7, tickMajorHeightH: 12, tickMajorWidthH: 2,
  tickColorH: '#9ec4d6', tickMajorColorH: '#ffffff', tickPosH: 2,
  ticksM: true, tickStepM: 5, tickMajorEveryM: 15, tickMinorHeightM: 7, tickMajorHeightM: 12, tickMajorWidthM: 2,
  tickColorM: '#9ec4d6', tickMajorColorM: '#ffffff', tickPosM: 2,
  digits: true, digitFont: 5, digitsOnTop: false, bottomLens: 0.35,
  digitTint: '#a6d8ff', digitTintAmount: 0.6, digitTone: 0.15,
  digitScaleX: 5.5, digitScaleY: 4.75, digitBottom: 15, digitHourStep: 3,
  digitScaleXMin: 3.5, digitScaleYMin: 4.25, digitBottomMin: 18, digitMinuteStep: 15, digitsLeadingZero: false,
  fillK: 320, fillDamp: 7, fillSloshGain: 14, angleK: 170, angleDamp: 10, angleTiltGain: 11, angleGyroGain: 0.7, angleMax: 12,
  lightPhys: 0.4, lightAngle: 58,
  brightness: 0.95, liquidBright: 1.2, tickBright: 1.1, digitBright: 0.95,
};

/** India ink: matte black body, almost every pixel off, enamel numerals printed on the glass. */
export const PRESET_INK: Partial<Params> = {
  liquid: '#141d36', liquidHi: '#6178a8', liquidLo: '#03040c', tubeBack: '#000000', bubbleRim: '#4a5a78',
  glassHi: '#8c9bb5', glassBody: 0.06, glassHiBright: 0.3, glassReflect: 0.22, glassRim: 0.45, glassOverLiquid: 0.3,
  highlightH: 5, highlightBright: 1.1, highlightSharp: 2.6, highlightInset: 0, shadeDepth: 0.9,
  meniscusDepth: 5, meniscusPow: 2.2, meniscusTiltGain: 0.4, meniscusAsym: 0.6,
  edgeSoft: 2, frontBright: 16, edgeGlow: 0, glowStrength: 0, cornerR: 0, edgeLightGain: 0.6,
  bubble: false, fizz: false,
  liquidTransparency: 0, markContrast: 0,
  ticksOnTop: true, tickEmboss: 0, tickLens: 0, tickParallax: 0,
  ticksH: true, tickStepH: 1, tickMajorEveryH: 3, tickMinorHeightH: 6, tickMajorHeightH: 14, tickMajorWidthH: 1,
  tickColorH: '#5c6470', tickMajorColorH: '#e8e4d8', tickPosH: 0,
  ticksM: true, tickStepM: 5, tickMajorEveryM: 15, tickMinorHeightM: 6, tickMajorHeightM: 14, tickMajorWidthM: 1,
  tickColorM: '#5c6470', tickMajorColorM: '#e8e4d8', tickPosM: 0,
  digits: true, digitFont: 9, digitsOnTop: true,
  digitTint: '#efe7d2', digitTintAmount: 0.5, digitTone: 0.1,
  digitScaleX: 5.5, digitScaleY: 4.75, digitBottom: 14, digitHourStep: 3,
  digitScaleXMin: 3.5, digitScaleYMin: 4.25, digitBottomMin: 17, digitMinuteStep: 15, digitsLeadingZero: false,
  fillK: 180, fillDamp: 18, fillSloshGain: 5, angleK: 210, angleDamp: 20, angleTiltGain: 4, angleGyroGain: 0.2, angleMax: 5,
  lightPhys: 0.2, lightAngle: 50,
  brightness: 0.8, liquidBright: 1.15, tickBright: 1.2, digitBright: 1.1,
};

/** Champagne flute: pale gold, dense fine bead, amber-resin numerals read through the wine. */
export const PRESET_CHAMPAGNE: Partial<Params> = {
  liquid: '#d8ae55', liquidHi: '#fff8dc', liquidLo: '#6f4a0c', tubeBack: '#080602', bubbleRim: '#fff4cc',
  glassHi: '#f6ecd0', glassBody: 0.15, glassHiBright: 0.68, glassReflect: 0.32, glassRim: 0.8, glassOverLiquid: 0.5,
  highlightH: 7, highlightBright: 0.95, highlightSharp: 2.4, highlightInset: 0, shadeDepth: 0.6,
  meniscusDepth: 8, meniscusPow: 1.8, meniscusTiltGain: 0.55, meniscusAsym: 0.6,
  edgeSoft: 2.2, frontBright: 16, edgeGlow: 8, glowStrength: 0.18, cornerR: 0, edgeLightGain: 1,
  bubble: false, fizz: true, fizzCount: 60, fizzSize: 1, fizzSpeed: 46, fizzFlatRise: 0.45, fizzDriftGain: 1, fizzAcrossGain: 1,
  liquidTransparency: 0.6, markContrast: 30,
  ticksOnTop: false, tickLens: 0.35, tickParallax: 3, tickEmboss: 0.45,
  ticksH: true, tickStepH: 1, tickMajorEveryH: 3, tickMinorHeightH: 6, tickMajorHeightH: 16, tickMajorWidthH: 2,
  tickColorH: '#7a6320', tickMajorColorH: '#f0dca0', tickPosH: 2,
  ticksM: true, tickStepM: 5, tickMajorEveryM: 15, tickMinorHeightM: 6, tickMajorHeightM: 16, tickMajorWidthM: 2,
  tickColorM: '#7a6320', tickMajorColorM: '#f0dca0', tickPosM: 2,
  digits: true, digitFont: 11, digitsOnTop: false, bottomLens: 0.35,
  digitTint: '#e0b45a', digitTintAmount: 0.4, digitTone: 0.1,
  digitScaleX: 5.75, digitScaleY: 4.75, digitBottom: 15, digitHourStep: 3,
  digitScaleXMin: 3.5, digitScaleYMin: 4.25, digitBottomMin: 18, digitMinuteStep: 15, digitsLeadingZero: false,
  fillK: 280, fillDamp: 8, fillSloshGain: 11, angleK: 185, angleDamp: 11, angleTiltGain: 9, angleGyroGain: 0.55, angleMax: 10,
  lightPhys: 0.3, lightAngle: 55,
  brightness: 0.95, liquidBright: 1.05, tickBright: 1, digitBright: 0.95,
};

export interface PresetEntry { id: string; name: string; note: string; p: Partial<Params>; legacy?: boolean }

/** Everything the preset picker and `?preset=<id>` offer. */
export const PRESETS: PresetEntry[] = [
  { id: 'blood', name: 'Blood', note: 'opaque venous red, viscous, syringe print', p: PRESET_BLOOD },
  { id: 'sparkling', name: 'Mineral water', note: 'clear, carbonated, lab graduations', p: PRESET_SPARKLING },
  { id: 'xenon', name: 'Xenon', note: 'violet discharge tube, glowing ends, no slosh', p: PRESET_XENON },
  { id: 'mercury', name: 'Mercury', note: 'convex bead, mirror specular, etched scale', p: PRESET_MERCURY },
  { id: 'malt', name: 'Single malt', note: 'amber, clings to the wall, brass numerals', p: PRESET_MALT },
  { id: 'molten', name: 'Molten iron', note: 'emissive orange, heavy, forged numerals', p: PRESET_MOLTEN },
  { id: 'cryo', name: 'Cryo oxygen', note: 'pale blue, boiling, frosted wall', p: PRESET_CRYO },
  { id: 'ink', name: 'India ink', note: 'matte black, enamel numerals, panel mostly off', p: PRESET_INK },
  { id: 'champagne', name: 'Champagne', note: 'pale gold, dense bead, amber resin numerals', p: PRESET_CHAMPAGNE },
  { id: 'user1', name: 'User v1', note: 'legacy: deep green, wide highlight', p: PRESET_USER_V1, legacy: true },
  { id: 'mint', name: 'Mint (spec)', note: 'legacy: spec colour', p: PRESET_MINT, legacy: true },
  { id: 'neon', name: 'Neon (ref photo)', note: 'legacy: reference photo green', p: PRESET_NEON, legacy: true },
  { id: 'concept', name: 'Concept art', note: 'legacy: rounded ends, convex front', p: PRESET_CONCEPT, legacy: true },
];

/** Presets are whole looks: apply over the defaults, not over the current edit. */
export function presetParams(e: PresetEntry): Params {
  return { ...structuredClone(DEFAULT_PARAMS), ...e.p };
}

export type ParamKey = keyof Params;

/** Map keys from older exports (shared tick settings, digitScale, digitFontBig) onto the current schema. */
export function migrateParams(o: Record<string, unknown>): Partial<Params> {
  const r: Record<string, unknown> = { ...o };
  const from = typeof r.v === 'number' ? r.v : 1;
  if ('glass' in r) { if (!('tubeBack' in r)) r.tubeBack = r.glass; delete r.glass; }
  if ('ticks' in r) { r.ticksH = r.ticksM = r.ticks; delete r.ticks; }
  if ('tickMajorH' in r) { r.tickMajorHeightH = r.tickMajorHeightM = r.tickMajorH; delete r.tickMajorH; }
  if ('tickMinorH' in r) { r.tickMinorHeightH = r.tickMinorHeightM = r.tickMinorH; delete r.tickMinorH; }
  if ('tick' in r) { r.tickColorH = r.tickColorM = r.tickMajorColorH = r.tickMajorColorM = r.tick; delete r.tick; }
  if ('digitScale' in r) { r.digitScaleX = r.digitScaleY = r.digitScaleXMin = r.digitScaleYMin = r.digitScale; delete r.digitScale; }
  if ('digitFontBig' in r) { r.digitFont = r.digitFontBig ? 2 : 0; delete r.digitFontBig; }
  if ('tickLayer' in r) { r.ticksOnTop = r.tickLayer === 1; delete r.tickLayer; }
  if (!('tickLens' in r) && typeof r.bottomLens === 'number') r.tickLens = r.bottomLens;
  // older presets: same warp behind air as behind liquid, as before
  if (!('tickDryLens' in r) && typeof r.tickLens === 'number') r.tickDryLens = r.tickLens;
  if (!('digitDryLens' in r) && typeof r.bottomLens === 'number') r.digitDryLens = r.bottomLens;
  if (from < 2) {
    // v1 counted "major every N-th minor tick"; v2 counts units (hours / minutes).
    for (const [every, step] of [['tickMajorEveryH', 'tickStepH'], ['tickMajorEveryM', 'tickStepM']] as const) {
      const e = r[every], k = r[step] ?? 1;
      if (typeof e === 'number' && typeof k === 'number') r[every] = e * k;
    }
  }
  if (from < 3) {
    // v3 re-modelled the liquid as capillary-pinned: hard caps in physics.ts plus much softer
    // response defaults. Old physics/IMU tunings produced runaway visuals on real accelerometer
    // input, so drop them and fall back to the new defaults instead of carrying them over.
    for (const k of ['fillK', 'fillDamp', 'fillSloshGain', 'angleK', 'angleDamp', 'angleTiltGain',
      'angleGyroGain', 'angleMax', 'acrossK', 'acrossDamp', 'acrossGyroGain', 'shakeGain', 'deadzone', 'accelLpHz', 'gyroHpHz',
      'gyroDeadzone', 'gyroMax', 'inputGain']) delete r[k];
  }
  for (const k of Object.keys(r)) if (!(k in DEFAULT_PARAMS)) delete r[k];
  r.v = PARAMS_VERSION;
  return r as Partial<Params>;
}

/** UI metadata: [min, max, step] for numeric params; grouping for the panel. */
export const PARAM_META: Record<string, { group: string; label?: string; help?: string; min?: number; max?: number; step?: number; options?: readonly string[] }> = {
  liquid: { help: 'Body colour of the liquid.', group: 'Colour' }, liquidHi: { help: 'Specular highlight strip colour.', group: 'Colour' }, liquidLo: { help: 'Bottom shade colour (cylinder shading).', group: 'Colour' },
  tubeBack: { help: 'Colour behind the liquid and glass layers. #000000 = AMOLED pixels off.', group: 'Colour', label: 'tube back' }, bubbleRim: { help: 'Rim colour of the spirit-level bubble and fizz.', group: 'Colour' },
  glassHi: { help: 'Specular colour of the glass wall.', group: 'Glass', label: 'specular colour' },
  glassBody: { help: 'Ambient cylinder shade of the empty wall. 0 = pure black.', group: 'Glass', label: 'ambient body', min: 0, max: 0.5, step: 0.01 },
  glassHiBright: { help: 'Strength of the glass specular band (same rows as the liquid highlight).', group: 'Glass', label: 'specular', min: 0, max: 1, step: 0.01 },
  glassReflect: { help: 'Faint second reflection on the lower wall.', group: 'Glass', label: 'lower reflection', min: 0, max: 1, step: 0.01 },
  glassRim: { help: 'Brightening of the outermost rows (wall edges catch light).', group: 'Glass', label: 'wall rims', min: 0, max: 1, step: 0.01 },
  glassOverLiquid: { help: 'How much of the glass specular is laid over the liquid too.', group: 'Glass', label: 'specular over liquid', min: 0, max: 1, step: 0.01 },
  brightness: { help: 'Global panel dimmer (emulates cmd 0x51).', group: 'Colour', label: 'brightness (panel)', min: 0.1, max: 1, step: 0.01 },
  liquidBright: { help: 'Per-layer trim on top of brightness: liquid body, highlight, shade, bubble, fizz.', group: 'Colour', label: '· liquid trim', min: 0, max: 2, step: 0.01 },
  tickBright: { help: 'Per-layer trim on top of brightness: tick ladder only.', group: 'Colour', label: '· ticks trim', min: 0, max: 2, step: 0.01 },
  digitBright: { help: 'Per-layer trim on top of brightness: digit labels only.', group: 'Colour', label: '· digits trim', min: 0, max: 2, step: 0.01 },
  tubeHeight: { help: 'Across-tube size, px.', group: 'Layout', label: 'tube height', min: 16, max: 80, step: 1 },
  hoursY: { help: 'Top row of the hours tube, px.', group: 'Layout', label: 'hours tube y', min: 0, max: 224, step: 1 },
  minutesY: { help: 'Top row of the minutes tube, px.', group: 'Layout', label: 'minutes tube y', min: 0, max: 224, step: 1 },
  remaining: { help: 'On: liquid sits at the right end and drains as time passes. Off: fills from the left.', group: 'Shape', label: 'liquid = remaining' },
  highlightH: { help: 'Height of the specular strip at the top of the column, px.', group: 'Shape', min: 0, max: 30, step: 1 },
  highlightInset: { help: 'Inset of the highlight from the fill edge, px.', group: 'Shape', min: 0, max: 40, step: 1 },
  highlightBright: { help: 'Strength of the specular band.', group: 'Shape', min: 0, max: 1.5, step: 0.05 },
  highlightSharp: { help: 'Band profile exponent. High = narrow, glossy.', group: 'Shape', min: 0.3, max: 4, step: 0.1 },
  shadeDepth: { help: 'How dark the bottom rows get (cylinder shading).', group: 'Shape', min: 0, max: 1, step: 0.01 },
  meniscusDepth: { help: 'How far the liquid climbs the wall at top/bottom vs centre, px. >0 concave, <0 convex.', group: 'Shape', min: -30, max: 40, step: 0.5 },
  meniscusPow: { help: 'Meniscus curve exponent. 2 = parabola.', group: 'Shape', min: 0.5, max: 6, step: 0.1 },
  meniscusTiltGain: { help: 'Tilt into the end bulges the drop (deeper meniscus); away flattens it.', group: 'Shape', label: 'meniscus bulge vs tilt', min: -1, max: 3, step: 0.05 },
  meniscusAsym: { help: 'Across-tilt sags the bulge onto the low wall: its contact line extends, the high one retracts.', group: 'Shape', label: 'meniscus sag per g across', min: 0, max: 2, step: 0.05 },
  edgeSoft: { help: 'Anti-aliased edge width, px. 0 = hard pixel edge.', group: 'Shape', min: 0, max: 4, step: 0.1 },
  frontBright: { help: 'Band just behind the fill edge blended toward liquidHi (bright convex cap), px.', group: 'Shape', min: 0, max: 40, step: 1 },
  edgeGlow: { help: 'Dim glow fading out past the fill edge, px. 0 = off.', group: 'Shape', min: 0, max: 40, step: 1 },
  glowStrength: { help: 'Brightness of the glow at the edge.', group: 'Shape', min: 0, max: 1, step: 0.01 },
  cornerR: { help: 'Rounding of the column left end (tube end cap), px.', group: 'Shape', min: 0, max: 36, step: 1 },
  edgeLightGain: { help: 'How much along-tilt brightens (+) / dims (-) the fill-edge light.', group: 'Shape', label: 'edge light vs tilt', min: -1, max: 2, step: 0.05 },
  bubbleDark: { help: 'Darkening of bubble and fizz interiors.', group: 'Bubble', label: 'bubble & fizz dark', min: 0, max: 1, step: 0.01 },
  bubble: { help: 'Show the spirit-level bubble.', group: 'Bubble' },
  bubbleW: { help: 'Bubble width, px.', group: 'Bubble', min: 2, max: 40, step: 1 },
  bubbleH: { help: 'Bubble height, px.', group: 'Bubble', min: 2, max: 30, step: 1 },
  bubbleGap: { help: 'Distance from fill edge to bubble centre, px.', group: 'Bubble', min: 0, max: 80, step: 1 },
  bubbleY: { help: 'Vertical position in the tube. 0.5 = centre.', group: 'Bubble', min: 0.1, max: 0.9, step: 0.01 },
  bubbleRollGain: { help: 'Bubble rise toward the high wall per g of across-tilt. 1 = follows the wall.', group: 'Bubble', label: 'bubble rise vs across tilt', min: 0, max: 2, step: 0.05 },
  bubbleTiltGain: { help: 'Bubble slides toward the high end per g of along-tilt, px.', group: 'Bubble', label: 'bubble slides to high end px/g', min: 0, max: 80, step: 1 },
  fizz: { help: 'Small drifting bubbles.', group: 'Bubble' },
  fizzCount: { help: 'Number of fizz bubbles in a full tube.', group: 'Bubble', label: 'fizz count (full tube)', min: 0, max: 60, step: 1 },
  fizzSize: { help: 'Fizz bubble size, px.', group: 'Bubble', min: 1, max: 8, step: 0.5 },
  fizzSizeVar: { help: 'Per-bubble size spread. 0 = all equal; 1 = 0.5x..1.5x. Bigger bubbles rise faster.', group: 'Bubble', label: 'fizz size spread', min: 0, max: 1, step: 0.05 },
  fizzShadeOff: { help: 'Offset of the dark core toward lower-right, as a fraction of radius. Thickens the rim on the lit side.', group: 'Bubble', label: 'fizz shade offset', min: 0, max: 1, step: 0.05 },
  fizzSpeed: { help: 'Fizz rise speed, px/s.', group: 'Bubble', min: 0, max: 60, step: 1 },
  fizzDriftGain: { help: 'Fraction of rise speed steered toward the high end per g of along-tilt.', group: 'Bubble', label: 'fizz steers to high end', min: 0, max: 2, step: 0.05 },
  fizzAcrossGain: { help: 'Across-tilt → on-screen rise direction. 1 = rises toward the physically high edge.', group: 'Bubble', label: 'fizz rises vs across-tilt', min: 0, max: 2, step: 0.05 },
  fizzFlatRise: { help: 'On-screen rise speed when the face points up (bubbles rise toward the viewer).', group: 'Bubble', label: 'fizz rise when face up', min: 0, max: 1, step: 0.05 },
  fizzSquash: { help: 'Extra vertical pre-squash on fizz discs at mid-height (fades to none at top/bottom), on top of lens + topLens compensation. >1 flattens the center on screen so the stronger glass magnification there rounds them.', group: 'Bubble', label: 'fizz squash', min: 0.5, max: 2, step: 0.05 },
  ticksOnTop: { help: 'Off: rear/bottom surface. On: opaque front/top surface. Both follow the cylinder and whole-tube lens.', group: 'Ticks', label: 'ticks on top' },
  tickLens: { help: 'Cylinder depth warp for ticks before the whole-tube lens.', group: 'Ticks', label: 'cylinder lens', min: 0, max: 1, step: 0.05 },
  tickDryLens: { help: 'Cylinder warp for rear ticks where the tube is empty. Liquid magnifies the middle; air barely lenses, and negative stretches the edges instead, so the scale visibly jumps at the fill edge. Rear parallax is liquid-only.', group: 'Ticks', label: 'dry-side lens', min: -1, max: 1, step: 0.05 },
  tickParallax: { help: 'Rear tick displacement at the tube centre per g of tilt. Circular depth bows the mark while its edge stays attached to the silhouette.', group: 'Ticks', label: 'rear parallax px/g', min: 0, max: 10, step: 0.25 },
  tickEmboss: { help: 'Highlight and shadow around ticks, like grooves cut into glass. 0 = flat.', group: 'Ticks', label: 'glass-cut emboss', min: 0, max: 1, step: 0.05 },
  ticksH: { help: 'Show the hours tick ladder.', group: 'Ticks · hours', label: 'show ticks' },
  tickStepH: { help: 'Minor tick every N hours.', group: 'Ticks · hours', label: 'minor every N h', min: 1, max: 6, step: 1 },
  tickMajorEveryH: { help: 'Major tick every N hours (units, not every N-th minor). 0 = none.', group: 'Ticks · hours', label: 'major every N h (0 = none)', min: 0, max: 12, step: 1 },
  tickMinorHeightH: { help: 'Minor tick height, px.', group: 'Ticks · hours', label: 'minor height', min: 0, max: 36, step: 1 },
  tickMajorHeightH: { help: 'Major tick height, px.', group: 'Ticks · hours', label: 'major height', min: 0, max: 36, step: 1 },
  tickMinorWidthH: { help: 'Minor tick width, px.', group: 'Ticks · hours', label: 'minor width', min: 1, max: 5, step: 1 },
  tickMajorWidthH: { help: 'Major tick width, px.', group: 'Ticks · hours', label: 'major width', min: 1, max: 5, step: 1 },
  tickColorH: { help: 'Minor tick colour.', group: 'Ticks · hours', label: 'minor colour' },
  tickMajorColorH: { help: 'Major tick colour.', group: 'Ticks · hours', label: 'major colour' },
  tickPosH: { help: 'Tube edge used by the hours ladder.', group: 'Ticks · hours', label: 'edge', min: 0, max: 2, step: 1, options: ['top', 'bottom', 'both'] },
  ticksM: { help: 'Show the minutes tick ladder.', group: 'Ticks · minutes', label: 'show ticks' },
  tickStepM: { help: 'Minor tick every N minutes.', group: 'Ticks · minutes', label: 'minor every N min', min: 1, max: 30, step: 1 },
  tickMajorEveryM: { help: 'Major tick every N minutes. 0 = none.', group: 'Ticks · minutes', label: 'major every N min (0 = none)', min: 0, max: 30, step: 1 },
  tickMinorHeightM: { help: 'Minor tick height, px.', group: 'Ticks · minutes', label: 'minor height', min: 0, max: 36, step: 1 },
  tickMajorHeightM: { help: 'Major tick height, px.', group: 'Ticks · minutes', label: 'major height', min: 0, max: 36, step: 1 },
  tickMinorWidthM: { help: 'Minor tick width, px.', group: 'Ticks · minutes', label: 'minor width', min: 1, max: 5, step: 1 },
  tickMajorWidthM: { help: 'Major tick width, px.', group: 'Ticks · minutes', label: 'major width', min: 1, max: 5, step: 1 },
  tickColorM: { help: 'Minor tick colour.', group: 'Ticks · minutes', label: 'minor colour' },
  tickMajorColorM: { help: 'Major tick colour.', group: 'Ticks · minutes', label: 'major colour' },
  tickPosM: { help: 'Tube edge used by the minutes ladder.', group: 'Ticks · minutes', label: 'edge', min: 0, max: 2, step: 1, options: ['top', 'bottom', 'both'] },
  liquidTransparency: { help: 'How much of ticks/digits shows through the liquid. 0 = opaque liquid.', group: 'Shape', min: 0, max: 1, step: 0.01 },
  markContrast: { help: 'Min luma difference a tick/digit keeps from the liquid behind it. 0 = off.', group: 'Shape', label: 'mark contrast in liquid', min: 0, max: 120, step: 2 },
  // digits — shared
  digits: { help: 'Show numeric labels along the bottom of the tube.', group: 'Digits', label: 'show digits' },
  digitFont: {
    help: 'Bitmap fonts are code-rendered. Image fonts preserve rendered material, bevel, and texture.',
    group: 'Digits',
    label: 'font',
    min: 0, max: 11, step: 1,
    options: ['3×5 bitmap', '4×6 narrow bitmap', '5×7 round bitmap', '5×7 seven-segment', '6×8 bold bitmap',
      'Steel', 'Brass steampunk', 'Copper gauge', 'Forged iron', 'Ivory enamel', 'Carved slate', 'Amber resin'],
  },
  digitTint: { help: 'Sprite fonts only: multiply colour.', group: 'Digits', label: 'image tint colour' },
  digitTintAmount: { help: 'Sprite fonts only: 0 = untinted sheet, 1 = fully tinted.', group: 'Digits', label: 'image tint amount', min: 0, max: 1, step: 0.05 },
  digitTone: { help: 'Sprite fonts only: darken toward black or lighten toward white after tinting.', group: 'Digits', label: 'image tone', min: -1, max: 1, step: 0.05 },
  digitColor: { help: 'Top of glyph (vertical gradient; set equal to bottom for flat).', group: 'Digits', label: 'colour top' },
  digitColor2: { help: 'Bottom of glyph.', group: 'Digits', label: 'colour bottom' },
  digitShadow: { help: '1 px darker copy offset down-right (emboss).', group: 'Digits', label: 'emboss shadow' },
  digitShadowColor: { help: 'Emboss shadow colour.', group: 'Digits', label: 'shadow colour' },
  digitsOnTop: { help: 'Printed on the glass, opaque and excluded from the whole-tube lens. Off: behind the liquid, seen through it and depth-warped.', group: 'Digits', label: 'print on top of liquid' },
  bottomLens: { help: 'Depth warp for digits behind the liquid.', group: 'Digits', label: 'rear lens', min: 0, max: 1, step: 0.05 },
  digitDryLens: { help: 'Depth warp for rear digits where the tube is empty, chosen per pixel column. Negative stretches the edges instead of magnifying the middle.', group: 'Digits', label: 'rear lens behind air', min: -1, max: 1, step: 0.05 },
  topParallax: { help: 'Across-shift of top digits per g of across-tilt, countering the apparent shift under the physical lens. Sign flips direction.', group: 'Digits', label: 'front parallax px/g', min: -10, max: 10, step: 0.25 },
  // digits — hours tube
  digitHourStep: { help: 'Label every N hours.', group: 'Digits · hours', label: 'label every N h', min: 1, max: 6, step: 1 },
  digitsLastOnlyH: { help: 'Show only the last passed hour.', group: 'Digits · hours', label: 'last passed only' },
  digitHourStart: { help: 'First labelled hour; 0 = same as step. Step 2 + start 1 = odd hours.', group: 'Digits · hours', label: 'first label h', min: 0, max: 11, step: 1 },
  digitScaleX: { help: 'Hours tube horizontal scale (nearest-neighbour).', group: 'Digits · hours', label: 'scale X', min: 0.5, max: 6, step: 0.25 },
  digitScaleY: { help: 'Hours tube vertical scale. Keep below X to counter the vial vertical stretch.', group: 'Digits · hours', label: 'scale Y', min: 0.5, max: 6, step: 0.25 },
  digitBottom: { help: 'Hours tube: px from the tube bottom edge to the digit baseline.', group: 'Digits · hours', label: 'baseline from bottom', min: 0, max: 40, step: 1 },
  // digits — minutes tube
  digitMinuteStep: { help: 'Label every N minutes.', group: 'Digits · minutes', label: 'label every N min', min: 5, max: 30, step: 5 },
  digitsLastOnlyM: { help: 'Show only the last passed multiple of the step.', group: 'Digits · minutes', label: 'last passed only' },
  digitMinuteStart: { help: 'First labelled minute; 0 = same as step.', group: 'Digits · minutes', label: 'first label min', min: 0, max: 55, step: 5 },
  digitsLeadingZero: { help: 'Minutes as 05, 10 instead of 5, 10.', group: 'Digits · minutes', label: 'leading zero (05)' },
  digitScaleXMin: { help: 'Minutes tube horizontal scale.', group: 'Digits · minutes', label: 'scale X', min: 0.5, max: 6, step: 0.25 },
  digitScaleYMin: { help: 'Minutes tube vertical scale.', group: 'Digits · minutes', label: 'scale Y', min: 0.5, max: 6, step: 0.25 },
  digitBottomMin: { help: 'Minutes tube: px from the tube bottom edge to the digit baseline.', group: 'Digits · minutes', label: 'baseline from bottom', min: 0, max: 40, step: 1 },
  fillK: { help: 'Spring stiffness of fill-edge position, 1/s².', group: 'Physics', min: 1, max: 800, step: 1 },
  fillDamp: { help: 'Damping of the fill-edge spring, 1/s.', group: 'Physics', min: 0, max: 40, step: 0.1 },
  fillSloshGain: { help: 'Fill-edge shift per g of along-tube acceleration, px.', group: 'Physics', label: 'slosh px/g (capped 30)', min: 0, max: 30, step: 0.5 },
  angleK: { help: 'Spring stiffness of the surface angle.', group: 'Physics', min: 1, max: 800, step: 1 },
  angleDamp: { help: 'Damping of the surface-angle spring.', group: 'Physics', min: 0, max: 40, step: 0.1 },
  angleTiltGain: { help: 'In-plane front skew per g of across-tube tilt, deg (static).', group: 'Physics', label: 'skew deg/g across', min: 0, max: 20, step: 0.5 },
  angleGyroGain: { help: 'Fill-edge kick per dps of rotation about the across axis (flicks).', group: 'Physics', min: 0, max: 3, step: 0.005 },
  angleMax: { help: 'Surface angle clamp, deg.', group: 'Physics', label: 'angle clamp (hard cap 20)', min: 0, max: 20, step: 1 },
  lightPhys: { help: '0 = fixed style light at lightAngle; 1 = world-up light from the IMU (highlight row, cylinder shading).', group: 'Shape', label: 'light: style 0 .. physical 1', min: 0, max: 1, step: 0.05 },
  lightAngle: { help: 'Style highlight angle, deg. 0 = centre row, 90 = top wall.', group: 'Shape', label: 'style light angle (deg)', min: -85, max: 85, step: 1 },
  acrossK: { help: 'Spring stiffness of the light (roll) swing.', group: 'Physics', label: 'light spring K', min: 1, max: 800, step: 1 },
  acrossDamp: { help: 'Damping of the light swing.', group: 'Physics', label: 'light damping', min: 0, max: 40, step: 0.1 },
  acrossGyroGain: { help: 'Light impulse per dps of roll rate (gyro about the tube axis), deg.', group: 'Physics', label: 'light kick deg/dps', min: 0, max: 2, step: 0.01 },
  shakeGain: { help: 'Agitation sensitivity to gyro energy: fizz speed, edge glow.', group: 'Physics', label: 'shake → fizz/glow', min: 0, max: 2, step: 0.05 },
  deadzone: { help: 'Ignore accelerations below this, g.', group: 'Physics', min: 0, max: 0.2, step: 0.005 },
  accelLpHz: { help: 'Low-pass cutoff for accel (gravity direction), Hz.', group: 'IMU filter', min: 0.2, max: 25, step: 0.1 },
  gyroHpHz: { help: 'High-pass cutoff for gyro: removes bias and slow rotations, keeps flicks. Hz.', group: 'IMU filter', min: 0, max: 5, step: 0.05 },
  gyroDeadzone: { help: 'Ignore gyro below this after filtering, dps.', group: 'IMU filter', min: 0, max: 60, step: 1 },
  gyroMax: { help: 'Gyro clamp, dps.', group: 'IMU filter', min: 50, max: 1000, step: 10 },
  inputGain: { help: 'Overall multiplier on tilt input.', group: 'IMU filter', min: 0.1, max: 2, step: 0.05 },
};
