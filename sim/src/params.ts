// All tunables live here. Colours are RGB888 hex strings but are quantised to RGB565 at render time.
// Export/import as JSON from the control panel; the exported file is the contract for Phase 3 (spec/params.h).

export interface Params {
  v: number;             // params schema version (not shown in the UI); bumped when a key changes meaning
  // --- colours (hex "#rrggbb"); quantised to RGB565 before drawing ---
  liquid: string;        // body colour
  liquidHi: string;      // specular highlight strip
  liquidLo: string;      // bottom shade (cylinder shading)
  tubeBack: string;      // colour behind the liquid and glass layers (very dark; 0 = AMOLED off)
  tubeBack2: string;     // second colour used by the tube-back gradient
  tubeBackGradient: number; // 0 solid, 1 top-to-bottom, 2 centre band, 3 edge bands
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
  meniscusTiltGain: number; // tilt into the end pushes the surface centre out (convex bulge), away hollows it; × |meniscusDepth|
  meniscusAsym: number;  // 0..1: across-tilt sags the bulge onto the low wall (its contact line extends, the high one retracts)
  meniscusLens: number;  // -1..1 pre-warp of the cap profile against the physical glass (like topLens); negative compensates magnification
  meniscusK: number;     // 1/s^2 spring of the free surface between the pinned contact lines
  meniscusDamp: number;  // 1/s damping of that spring (low = visible wobble after a flick)
  meniscusInertia: number; // 0..10 how much edge forcing (flick kick, slug acceleration) bulges the surface centre ahead of the contact lines
  contactLag: number;    // 0..3 contact-angle hysteresis: px the contact lines trail the centre per 10 px/s of edge speed
  wetFilm: number;       // px trailing wet film a receding edge leaves on the glass
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
  digitShadow: boolean;  // 1 px darker copy offset down-right (emboss); bitmap and sprite fonts
  digitShadowColor: string;
  digitShadowStrength: number; // 0..1 shadow opacity
  digitShadowOffset: number;   // px, down-right
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
  // --- free liquid: the column slides as a slug; a wrist turn into the reading pose parks it home ---
  freeLiquid: boolean;   // false = pinned column (time always shown)
  freeGain: number;      // px/s^2 per g of along-tilt
  freeDamp: number;      // 1/s viscous drag
  freeBounce: number;    // 0..1 restitution at the tube ends
  freeHomeK: number;     // 1/s^2 pull toward the home end while reading (critically damped)
  readFaceUp: number;    // 0..1 min face-up gravity component of the reading pose
  readAlongMax: number;  // g, max |along| of the reading pose
  readTurn: number;      // dps of gyro energy that counts as a wrist turn (0 = pose alone reads)
  readHold: number;      // s the time stays shown after the turn, while the pose holds
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

export const PARAMS_VERSION = 15;

export const DEFAULT_PARAMS: Params = {
  v: PARAMS_VERSION,
  tubeHeight: 72,
  hoursY: 0,
  minutesY: 168,
  remaining: false,
  liquid: '#346a2a',
  liquidHi: '#b6ffa0',
  liquidLo: '#1e7515',
  tubeBack: '#090d10',
  tubeBack2: '#253039',
  tubeBackGradient: 2,
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
  meniscusLens: 0,
  meniscusK: 180,
  meniscusDamp: 9,
  meniscusInertia: 6,
  contactLag: 0.5,
  wetFilm: 6,
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
  digitShadowStrength: 1,
  digitShadowOffset: 1,
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
  freeLiquid: false,
  freeGain: 500,
  freeDamp: 1.5,
  freeBounce: 0.25,
  freeHomeK: 30,
  readFaceUp: 0.7,
  readAlongMax: 0.3,
  readTurn: 80,
  readHold: 5,
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

/** Explicitly keep non-material presets plain when DEFAULT_PARAMS uses a textured backing. */
const PLAIN_TUBE_BACK: Partial<Params> = {
  tubeBack2: '#18212a', tubeBackGradient: 0,
};

// ---------------------------------------------------------------------------
// Signature presets. Each one is a real liquid in a real vessel: optics, glass,
// scale, labels and the physics of that liquid's viscosity, wetting and density.
// The `mat` descriptor on each PRESETS entry is the contract the numbers must
// satisfy — see presets/PRESETS.md and tools/check-presets.ts.
// Applied over DEFAULT_PARAMS (see presetParams), so they are reproducible.
// ---------------------------------------------------------------------------

/** What the preset claims to be; check-presets.ts derives the allowed ranges from it. */
export interface Material {
  viscosity: 'watery' | 'medium' | 'viscous' | 'metal' | 'plasma';
  opacity: 'opaque' | 'translucent' | 'clear';
  emissive: boolean;
  wetting: boolean;   // concave meniscus + wet film vs convex bead
  gas: 'none' | 'carbonated' | 'boiling' | 'trapped';
}

/** The modern base every liquid preset is built on (from examples/nice_meniscus.json, 2026-08-27):
 *  thin tubes spread to the panel edges, lens −0.5 + topLens 0.35 for the physical rod, physical light
 *  with a broad soft highlight, rear sprite digits every hour / 5 min, dark rear ticks on both edges,
 *  a hysteretic wetting meniscus (contact lag, film, hard edge, faint caustic) and the free slug. */
const MODERN_BASE: Partial<Params> = {
  tubeHeight: 46, hoursY: 12, minutesY: 185,
  tubeBack: '#000000', tubeBack2: '#000000', tubeBackGradient: 1,
  glassHi: '#859093', glassBody: 0.04, glassHiBright: 0.34, glassReflect: 0.2, glassRim: 0.52, glassOverLiquid: 0.4,
  lens: -0.5, lensCurve: -0.05,
  highlightH: 17, highlightBright: 0.35, highlightSharp: 2, highlightInset: 0, shadeDepth: 0.68,
  meniscusDepth: 4.5, meniscusPow: 3.6, meniscusTiltGain: 0.9, meniscusAsym: 1.05, meniscusLens: 0,
  meniscusK: 475, meniscusDamp: 15.5, meniscusInertia: 2.1, contactLag: 3, wetFilm: 15,
  edgeSoft: 0, frontBright: 0, edgeGlow: 19, glowStrength: 0.06, cornerR: 0, edgeLightGain: 0.55,
  bubble: false, bubbleW: 27, bubbleH: 20, bubbleGap: 28, bubbleY: 0.28, bubbleTiltGain: 14, bubbleDark: 0.91,
  fizz: false, fizzCount: 10, fizzSize: 2, fizzSizeVar: 0.5, fizzShadeOff: 0.3, fizzSpeed: 14,
  fizzDriftGain: 0.85, fizzAcrossGain: 1.05, fizzFlatRise: 0.45, fizzSquash: 2,
  ticksOnTop: false, tickLens: 0.4, tickParallax: 4.75, tickDryLens: 1, tickEmboss: 0.3,
  ticksH: true, tickStepH: 1, tickMajorEveryH: 0, tickMinorHeightH: 11, tickMajorHeightH: 22, tickMinorWidthH: 2, tickMajorWidthH: 3,
  tickColorH: '#404040', tickMajorColorH: '#4d4d4d', tickPosH: 2,
  ticksM: true, tickStepM: 5, tickMajorEveryM: 0, tickMinorHeightM: 10, tickMajorHeightM: 28, tickMinorWidthM: 2, tickMajorWidthM: 2,
  tickColorM: '#383838', tickMajorColorM: '#4d4d4d', tickPosM: 2,
  digits: true, digitFont: 7, digitsOnTop: false, digitShadow: true, digitColor: '#e3e3e3', digitColor2: '#20312f', digitShadowColor: '#101010',
  digitTint: '#827c40', digitTintAmount: 0.9, digitTone: -0.4,
  digitScaleX: 3.5, digitScaleY: 3.25, digitBottom: 15, digitHourStep: 1, digitHourStart: 0, digitsLastOnlyH: false,
  digitScaleXMin: 2.5, digitScaleYMin: 2.75, digitBottomMin: 13, digitMinuteStep: 5, digitMinuteStart: 0, digitsLeadingZero: false, digitsLastOnlyM: false,
  bottomLens: 0.45, digitDryLens: 0.1, topLens: 0.35, topParallax: -10,
  liquidTransparency: 0.52, markContrast: 0,
  freeLiquid: true, freeGain: 570, freeDamp: 0.8, freeBounce: 0.15, freeHomeK: 150, readFaceUp: 1, readAlongMax: 0.3, readTurn: 125, readHold: 11,
  fillK: 756, fillDamp: 40, fillSloshGain: 5.5, angleK: 207, angleDamp: 17.6, angleTiltGain: 5.5, angleGyroGain: 0.37, angleMax: 6,
  lightPhys: 1, lightAngle: 73,
  brightness: 1, liquidBright: 2, tickBright: 1.2, digitBright: 1.75,
};

/** Wider tubes pushed to the panel edges (examples/frizzante_slightly_fixed.json). */
const LAYOUT_WIDE: Partial<Params> = { tubeHeight: 55, hoursY: 7, minutesY: 224 };

/** Print on the front of the glass: no cylinder lens, no parallax, opaque over the liquid. Used for opaque
 *  liquids (nothing shows through) and lab glassware. Light tick colours so the ladder reads on the dry side. */
const FRONT_PRINT: Partial<Params> = {
  ticksOnTop: true, tickEmboss: 0, tickLens: 0, tickParallax: 0,
  tickMinorWidthH: 1, tickMajorWidthH: 2, tickMinorWidthM: 1, tickMajorWidthM: 2,
  tickMinorHeightH: 7, tickMajorHeightH: 14, tickMinorHeightM: 6, tickMajorHeightM: 12,
  tickMajorEveryH: 3, tickMajorEveryM: 15,
  tickColorH: '#9aa4ac', tickMajorColorH: '#e8eef2', tickColorM: '#9aa4ac', tickMajorColorM: '#e8eef2',
  tickPosH: 0, tickPosM: 0,
  digitsOnTop: true, digitShadow: false,
};

// Viscosity classes on top of the base (checker ranges in tools/check-presets.ts).
const WATERY: Partial<Params> = { freeDamp: 0.8, freeBounce: 0.2, meniscusK: 475, meniscusDamp: 8, meniscusInertia: 3, contactLag: 2, wetFilm: 10, angleTiltGain: 6.5, angleGyroGain: 0.42 };
const MEDIUM: Partial<Params> = { freeDamp: 2.5, freeBounce: 0.1, meniscusK: 280, meniscusDamp: 16, meniscusInertia: 2, contactLag: 2.6, wetFilm: 15, angleTiltGain: 4, angleGyroGain: 0.25 };
const VISCOUS: Partial<Params> = { freeDamp: 9, freeBounce: 0, meniscusK: 90, meniscusDamp: 34, meniscusInertia: 1, contactLag: 3, wetFilm: 26, angleTiltGain: 1.5, angleGyroGain: 0.06 };
const METAL: Partial<Params> = { freeDamp: 1, freeBounce: 0.55, meniscusK: 650, meniscusDamp: 12, meniscusInertia: 4, contactLag: 0.1, wetFilm: 0, angleTiltGain: 2, angleGyroGain: 0.4 };

/** Sparkling mineral water in a lab cylinder: the water itself is colourless — what you see is the
 *  back through it, a white surface reflection, the meniscus and a constant fine bead. */
export const PRESET_FRIZZANTE: Partial<Params> = {
  ...MODERN_BASE, ...LAYOUT_WIDE, ...FRONT_PRINT, ...WATERY,
  liquid: '#5d6c72', liquidHi: '#f4ffff', liquidLo: '#2b3438', tubeBack: '#0a0e10', tubeBack2: '#1c2529', tubeBackGradient: 2,
  bubbleRim: '#f4ffff',
  glassHi: '#dfeef4', glassBody: 0.12, glassHiBright: 0.55, glassReflect: 0.28, glassRim: 0.75, glassOverLiquid: 0.7,
  highlightH: 8, highlightBright: 0.9, highlightSharp: 3, shadeDepth: 0.45,
  meniscusDepth: 6, meniscusPow: 2.4,
  fizz: true, fizzCount: 50, fizzSize: 1, fizzSizeVar: 0.4, fizzSpeed: 42, fizzFlatRise: 0.5, fizzSquash: 1.3,
  liquidTransparency: 0.85, markContrast: 20,
  tickStepM: 1, tickMajorEveryM: 5, tickColorH: '#9fb8c2', tickMajorColorH: '#ffffff', tickColorM: '#8fa9b4', tickMajorColorM: '#ffffff',
  digitFont: 9, digitTintAmount: 0, digitTone: 0,
  digitScaleX: 3.25, digitScaleY: 3.25, digitBottom: 5, digitHourStep: 3,
  digitScaleXMin: 2.25, digitScaleYMin: 2.25, digitBottomMin: 16, digitMinuteStep: 15,
  liquidBright: 1.3, tickBright: 1.1, digitBright: 1.1,
};

/** Urine in a specimen cup: tinted amber (translucent, not colourless), watery, no bead
 *  (examples/urine_1.json + nice_meniscus.json, minus the bubbles). */
export const PRESET_URINE: Partial<Params> = {
  ...MODERN_BASE, ...WATERY,
  liquid: '#6d6112', liquidHi: '#809419', liquidLo: '#79792a', bubbleRim: '#322606',
  meniscusDepth: 4.5, meniscusPow: 3.6, meniscusK: 475, meniscusDamp: 15.5, meniscusInertia: 2.1, contactLag: 3, wetFilm: 15,
  fizz: false, liquidTransparency: 0.52,
};

/** Venous blood in a graduated syringe: opaque, a few times thicker than water, coats the glass. */
export const PRESET_BLOOD: Partial<Params> = {
  ...MODERN_BASE, ...LAYOUT_WIDE, ...FRONT_PRINT, ...MEDIUM,
  liquid: '#6e0b16', liquidHi: '#c8443f', liquidLo: '#1c0306', tubeBack: '#050203', tubeBack2: '#0a0405', bubbleRim: '#e08a80',
  glassHi: '#93a2ae', glassBody: 0.06, glassHiBright: 0.3, glassReflect: 0.14, glassRim: 0.5, glassOverLiquid: 0.22,
  highlightH: 10, highlightBright: 0.5, highlightSharp: 2, shadeDepth: 0.86,
  meniscusDepth: 5, meniscusPow: 2.6,
  liquidTransparency: 0.05,
  digitFont: 9, digitTintAmount: 0, digitTone: 0,
  digitScaleX: 3.25, digitScaleY: 3.25, digitBottom: 5, digitHourStep: 3,
  digitScaleXMin: 2.25, digitScaleYMin: 2.25, digitBottomMin: 16, digitMinuteStep: 15, digitsLeadingZero: true,
  liquidBright: 1.4, tickBright: 1, digitBright: 1.1,
};

/** Milk: an opaque scattering colloid — soft wide highlight, gentle shading, a little thicker than water. */
export const PRESET_MILK: Partial<Params> = {
  ...MODERN_BASE, ...LAYOUT_WIDE, ...FRONT_PRINT, ...MEDIUM,
  liquid: '#c9c5ba', liquidHi: '#ffffff', liquidLo: '#7a7568', tubeBack: '#0a0a0a', tubeBack2: '#101010', bubbleRim: '#ffffff',
  glassHi: '#d8dde0', glassBody: 0.08, glassHiBright: 0.4, glassReflect: 0.18, glassRim: 0.5, glassOverLiquid: 0.35,
  highlightH: 16, highlightBright: 0.4, highlightSharp: 0.8, shadeDepth: 0.5,
  meniscusDepth: 4, meniscusPow: 2.6,
  liquidTransparency: 0.03,
  tickColorH: '#7aa3bd', tickMajorColorH: '#5b8db0', tickColorM: '#7aa3bd', tickMajorColorM: '#5b8db0',
  digitFont: 10, digitTint: '#4f86ab', digitTintAmount: 0.8, digitTone: -0.1,
  digitScaleX: 3.25, digitScaleY: 3.25, digitBottom: 5, digitHourStep: 3,
  digitScaleXMin: 2.25, digitScaleYMin: 2.25, digitBottomMin: 16, digitMinuteStep: 15,
  liquidBright: 1.2, tickBright: 1.1, digitBright: 1.3,
};

/** Mercury thermometer: opaque non-wetting bead with a mirror specular that follows real gravity;
 *  the scale is etched on the glass because nothing shows through the metal. */
export const PRESET_MERCURY: Partial<Params> = {
  ...MODERN_BASE, ...LAYOUT_WIDE, ...FRONT_PRINT, ...METAL,
  liquid: '#8f9aa2', liquidHi: '#ffffff', liquidLo: '#232b31',
  tubeBack: '#3a444c', tubeBack2: '#6a7880', tubeBackGradient: 2,
  bubbleRim: '#e8f0f5',
  glassHi: '#e2edf5', glassBody: 0.13, glassHiBright: 0.6, glassReflect: 0.35, glassRim: 0.78, glassOverLiquid: 0.5,
  highlightH: 7, highlightBright: 1.3, highlightSharp: 3.6, shadeDepth: 0.95,
  meniscusDepth: -8, meniscusPow: 2.4, meniscusTiltGain: 0.35, meniscusAsym: 0.15,
  frontBright: 22, edgeGlow: 0, glowStrength: 0, edgeLightGain: 0.7,
  liquidTransparency: 0,
  tickEmboss: 0.35, tickColorH: '#0e1418', tickMajorColorH: '#060a0c', tickColorM: '#0e1418', tickMajorColorM: '#060a0c',
  digitFont: 10, digitTint: '#1e262c', digitTintAmount: 0.6, digitTone: -0.6,
  digitScaleX: 3.5, digitScaleY: 3.25, digitBottom: 6, digitHourStep: 3,
  digitScaleXMin: 2.5, digitScaleYMin: 2.5, digitBottomMin: 16, digitMinuteStep: 15,
  liquidBright: 1.35, tickBright: 1.05, digitBright: 1,
};

/** Honey: translucent amber syrup — overdamped, climbs and clings, a few slow trapped bubbles,
 *  brass numerals seen through it. */
export const PRESET_HONEY: Partial<Params> = {
  ...MODERN_BASE, ...VISCOUS,
  liquid: '#7a4206', liquidHi: '#f0c060', liquidLo: '#3d1c03', tubeBack: '#0c0703', tubeBack2: '#1c1208', bubbleRim: '#ffd890',
  glassHi: '#f0dcb0', glassBody: 0.08, glassHiBright: 0.45, glassReflect: 0.25, glassRim: 0.6,
  highlightH: 14, highlightBright: 0.4, highlightSharp: 1.8, shadeDepth: 0.78,
  meniscusDepth: 9, meniscusPow: 2.2,
  fizz: true, fizzCount: 5, fizzSize: 3, fizzSizeVar: 0.6, fizzShadeOff: 0.5, fizzSpeed: 3, fizzFlatRise: 0.15, fizzDriftGain: 0.4, fizzAcrossGain: 0.8, fizzSquash: 1.4,
  liquidTransparency: 0.32,
  tickColorH: '#4a3210', tickMajorColorH: '#5a3e14', tickColorM: '#4a3210', tickMajorColorM: '#5a3e14',
  digitFont: 6, digitTint: '#d4923a', digitTintAmount: 0.5, digitTone: 0,
  liquidBright: 1.8, tickBright: 1.1, digitBright: 1.5,
};

/** Cola: dark but translucent in a thin tube, watery, lively bead; cream enamel numerals behind. */
export const PRESET_COLA: Partial<Params> = {
  ...MODERN_BASE, ...WATERY,
  liquid: '#3a1206', liquidHi: '#e8b890', liquidLo: '#120602', tubeBack: '#070403', tubeBack2: '#140c07', bubbleRim: '#f0d8c4',
  glassHi: '#e8dcd2', glassBody: 0.08, glassHiBright: 0.5, glassReflect: 0.25, glassRim: 0.6, glassOverLiquid: 0.5,
  highlightH: 9, highlightBright: 0.5, highlightSharp: 3, shadeDepth: 0.7,
  meniscusDepth: 5, meniscusPow: 2.6,
  fizz: true, fizzCount: 40, fizzSize: 1.5, fizzSizeVar: 0.6, fizzSpeed: 36, fizzFlatRise: 0.45, fizzSquash: 1.3,
  liquidTransparency: 0.38, markContrast: 24,
  tickColorH: '#4a3e32', tickMajorColorH: '#5a4a3c', tickColorM: '#4a3e32', tickMajorColorM: '#5a4a3c',
  digitFont: 9, digitTint: '#f3e6c8', digitTintAmount: 0.4, digitTone: 0,
  liquidBright: 1.7, tickBright: 1.1, digitBright: 1.4,
};

/** Single malt in cut crystal: warm amber, a shade thicker than water, alcohol legs on the wall,
 *  brass numerals under the liquid, ticks cut into the glass. */
export const PRESET_MALT: Partial<Params> = {
  ...MODERN_BASE, ...MEDIUM,
  liquid: '#7a4e14', liquidHi: '#ffe0a8', liquidLo: '#2e1704', tubeBack: '#0a0603', tubeBack2: '#160e05', bubbleRim: '#f0c88a',
  glassHi: '#f2e0b4', glassBody: 0.1, glassHiBright: 0.5, glassReflect: 0.3, glassRim: 0.7, glassOverLiquid: 0.45,
  highlightH: 12, highlightBright: 0.5, highlightSharp: 1.6, shadeDepth: 0.78,
  meniscusDepth: 7, meniscusPow: 2.4, wetFilm: 18,
  liquidTransparency: 0.42, markContrast: 24,
  ticksOnTop: true, tickLens: 0, tickParallax: 0, tickEmboss: 0.5,
  tickMinorWidthH: 1, tickMajorWidthH: 2, tickMinorWidthM: 1, tickMajorWidthM: 2, tickMajorEveryH: 3, tickMajorEveryM: 15,
  tickColorH: '#6a5a40', tickMajorColorH: '#b09660', tickColorM: '#6a5a40', tickMajorColorM: '#b09660',
  digitFont: 6, digitTint: '#c08a2a', digitTintAmount: 0.4, digitTone: 0.1,
  liquidBright: 1.8, tickBright: 0.9, digitBright: 1.4,
};

/** Champagne flute: tinted pale gold (translucent), watery, dense fine bead, amber-resin numerals. */
export const PRESET_CHAMPAGNE: Partial<Params> = {
  ...MODERN_BASE, ...WATERY,
  liquid: '#8a7228', liquidHi: '#fff8dc', liquidLo: '#4a3808', tubeBack: '#080602', tubeBack2: '#161004', bubbleRim: '#fff4cc',
  glassHi: '#f6ecd0', glassBody: 0.1, glassHiBright: 0.55, glassReflect: 0.3, glassRim: 0.7, glassOverLiquid: 0.55,
  highlightH: 9, highlightBright: 0.55, highlightSharp: 2.6, shadeDepth: 0.55,
  meniscusDepth: 5, meniscusPow: 2.6,
  fizz: true, fizzCount: 60, fizzSize: 1, fizzSizeVar: 0.4, fizzSpeed: 46, fizzFlatRise: 0.45, fizzSquash: 1.3,
  liquidTransparency: 0.5, markContrast: 24,
  tickColorH: '#4a3e18', tickMajorColorH: '#5a4c20', tickColorM: '#4a3e18', tickMajorColorM: '#5a4c20',
  digitFont: 11, digitTint: '#e0b45a', digitTintAmount: 0.2, digitTone: 0,
  liquidBright: 1.8, tickBright: 1.1, digitBright: 1.1,
};

/** Cryogenic oxygen: clear pale blue, thinner than water, boiling hard, frosted wall. */
export const PRESET_CRYO: Partial<Params> = {
  ...MODERN_BASE, ...WATERY,
  liquid: '#3a7aa8', liquidHi: '#ffffff', liquidLo: '#0e3f66', tubeBack: '#03070c', tubeBack2: '#0c1620', bubbleRim: '#f0fbff',
  glassHi: '#e2f4ff', glassBody: 0.16, glassHiBright: 0.45, glassReflect: 0.28, glassRim: 0.85, glassOverLiquid: 0.6,
  highlightH: 10, highlightBright: 0.45, highlightSharp: 1.8, shadeDepth: 0.45,
  meniscusDepth: 6, meniscusPow: 2.2, meniscusK: 520, meniscusDamp: 4, meniscusInertia: 4, contactLag: 1.5, wetFilm: 8,
  freeDamp: 0.5, freeBounce: 0.3, angleTiltGain: 8, angleGyroGain: 0.5,
  fizz: true, fizzCount: 55, fizzSize: 1, fizzSizeVar: 0.5, fizzSpeed: 52, fizzFlatRise: 0.6, fizzDriftGain: 1.2, fizzSquash: 1.3,
  liquidTransparency: 0.72, markContrast: 20,
  tickColorH: '#3a5060', tickMajorColorH: '#465e70', tickColorM: '#3a5060', tickMajorColorM: '#465e70',
  digitFont: 5, digitTint: '#a6d8ff', digitTintAmount: 0.6, digitTone: 0.15,
  liquidBright: 1.6, tickBright: 1.1, digitBright: 1.3,
};

/** India ink: matte black body, almost every pixel off, enamel numerals printed on the glass. */
export const PRESET_INK: Partial<Params> = {
  ...MODERN_BASE, ...LAYOUT_WIDE, ...FRONT_PRINT, ...MEDIUM,
  liquid: '#0e1428', liquidHi: '#5a70a0', liquidLo: '#03040c', tubeBack: '#000000', tubeBack2: '#000000', bubbleRim: '#4a5a78',
  glassHi: '#8c9bb5', glassBody: 0.05, glassHiBright: 0.3, glassReflect: 0.2, glassRim: 0.45, glassOverLiquid: 0.3,
  highlightH: 7, highlightBright: 0.8, highlightSharp: 2.6, shadeDepth: 0.9,
  meniscusDepth: 4, meniscusPow: 2.6,
  liquidTransparency: 0,
  tickMinorWidthH: 1, tickMajorWidthH: 1, tickMinorWidthM: 1, tickMajorWidthM: 1,
  tickColorH: '#5c6470', tickMajorColorH: '#e8e4d8', tickColorM: '#5c6470', tickMajorColorM: '#e8e4d8',
  digitFont: 9, digitTint: '#efe7d2', digitTintAmount: 0.5, digitTone: 0.1,
  digitScaleX: 3.25, digitScaleY: 3.25, digitBottom: 5, digitHourStep: 3,
  digitScaleXMin: 2.25, digitScaleYMin: 2.25, digitBottomMin: 16, digitMinuteStep: 15,
  brightness: 0.85, liquidBright: 1.3, tickBright: 1.2, digitBright: 1.1,
};

/** Glow stick: fluorescent green ester, its own light source — glow past the cap, no world light,
 *  a shade thicker than water; seven-segment print on the tube. */
export const PRESET_GLOW: Partial<Params> = {
  ...MODERN_BASE, ...LAYOUT_WIDE, ...FRONT_PRINT, ...MEDIUM,
  liquid: '#5ad81e', liquidHi: '#e4ffc8', liquidLo: '#1f7a08', tubeBack: '#020602', tubeBack2: '#061006', bubbleRim: '#dfffc0',
  glassHi: '#a8d8a0', glassBody: 0.06, glassHiBright: 0.35, glassReflect: 0.15, glassRim: 0.4, glassOverLiquid: 0.4,
  highlightH: 14, highlightBright: 0.6, highlightSharp: 1.2, shadeDepth: 0.55,
  meniscusDepth: 5, meniscusPow: 2.6,
  edgeSoft: 0, frontBright: 14, edgeGlow: 28, glowStrength: 0.7, edgeLightGain: 0.3,
  liquidTransparency: 0.35, markContrast: 30,
  tickPosH: 2, tickPosM: 2, tickColorH: '#4f8a3e', tickMajorColorH: '#c6ffb0', tickColorM: '#4f8a3e', tickMajorColorM: '#c6ffb0',
  digitFont: 3, digitColor: '#e6ffd6', digitColor2: '#8fe070',
  digitScaleX: 3.5, digitScaleY: 3.25, digitBottom: 10, digitHourStep: 3,
  digitScaleXMin: 2.5, digitScaleYMin: 2.75, digitBottomMin: 14, digitMinuteStep: 15,
  lightPhys: 0, lightAngle: 45,
  liquidBright: 1.3, tickBright: 1, digitBright: 1,
};

/** Xenon discharge tube: violet plasma has no inertia — no slosh, no meniscus dynamics, no film, no slug —
 *  glow past the column end, bold print. */
export const PRESET_XENON: Partial<Params> = {
  ...MODERN_BASE, ...LAYOUT_WIDE,
  liquid: '#5a30d8', liquidHi: '#d9c8ff', liquidLo: '#1a0570', tubeBack: '#05020c', tubeBack2: '#0a0418', bubbleRim: '#d8ccff',
  glassHi: '#a394d8', glassBody: 0.1, glassHiBright: 0.5, glassReflect: 0.2, glassRim: 0.6, glassOverLiquid: 0.4,
  highlightH: 14, highlightBright: 0.7, highlightSharp: 1.5, shadeDepth: 0.42,
  meniscusDepth: -5, meniscusPow: 2, meniscusTiltGain: 0, meniscusAsym: 0,
  meniscusK: 400, meniscusDamp: 30, meniscusInertia: 0, contactLag: 0, wetFilm: 0,
  edgeSoft: 0, frontBright: 18, edgeGlow: 26, glowStrength: 0.6, cornerR: 14, edgeLightGain: 0.3,
  liquidTransparency: 0.5, markContrast: 34,
  tickMajorEveryH: 3, tickMajorEveryM: 15, tickColorH: '#3a2a6a', tickMajorColorH: '#9a86ff', tickColorM: '#3a2a6a', tickMajorColorM: '#9a86ff',
  digitFont: 4, digitsOnTop: true, digitShadow: false, digitColor: '#00e5ff', digitColor2: '#00708f',
  digitScaleX: 3.5, digitScaleY: 3.25, digitBottom: 10, digitHourStep: 3,
  digitScaleXMin: 2.5, digitScaleYMin: 2.75, digitBottomMin: 14, digitMinuteStep: 15,
  freeLiquid: false, fillK: 260, fillDamp: 22, fillSloshGain: 0.5, angleK: 300, angleDamp: 26, angleTiltGain: 0.5, angleGyroGain: 0.03, angleMax: 2,
  lightPhys: 0, lightAngle: 40,
  liquidBright: 1.3, tickBright: 1, digitBright: 0.9,
};

/** Molten iron in a sooted vial: emissive, opaque, dense, does not wet the wall, slow gas bubbles;
 *  forged numerals printed on the glass. */
export const PRESET_MOLTEN: Partial<Params> = {
  ...MODERN_BASE, ...LAYOUT_WIDE, ...FRONT_PRINT, ...MEDIUM,
  liquid: '#e04c00', liquidHi: '#ffd98a', liquidLo: '#5e0e00', tubeBack: '#0b0300', tubeBack2: '#160600', bubbleRim: '#ffd08a',
  glassHi: '#c08a60', glassBody: 0.07, glassHiBright: 0.4, glassReflect: 0.18, glassRim: 0.45, glassOverLiquid: 0.3,
  highlightH: 10, highlightBright: 0.6, highlightSharp: 1.2, shadeDepth: 0.78,
  meniscusDepth: -4, meniscusPow: 2, meniscusK: 400, meniscusDamp: 14, meniscusInertia: 4, contactLag: 0.2, wetFilm: 0,
  freeDamp: 2.5, freeBounce: 0.05,
  edgeSoft: 0, frontBright: 16, edgeGlow: 26, glowStrength: 0.6, edgeLightGain: 1,
  fizz: true, fizzCount: 10, fizzSize: 2.5, fizzSizeVar: 0.5, fizzShadeOff: 0.4, fizzSpeed: 7, fizzFlatRise: 0.25, fizzDriftGain: 0.6, fizzAcrossGain: 0.8, fizzSquash: 1.4,
  liquidTransparency: 0.06,
  tickEmboss: 0.35, tickPosH: 2, tickPosM: 2, tickColorH: '#6a5248', tickMajorColorH: '#b39a8c', tickColorM: '#6a5248', tickMajorColorM: '#b39a8c',
  digitFont: 8, digitTint: '#b06a34', digitTintAmount: 0.45, digitTone: 0.3,
  digitScaleX: 3.5, digitScaleY: 3.25, digitBottom: 6, digitHourStep: 3,
  digitScaleXMin: 2.5, digitScaleYMin: 2.5, digitBottomMin: 16, digitMinuteStep: 15,
  lightPhys: 0, lightAngle: 45,
  liquidBright: 1.3, tickBright: 1, digitBright: 1.1,
};

/** Free liquid: the column slides as a slug and only parks to show the time on a wrist turn into the reading pose
 *  (readFaceUp 1 = never, i.e. always free — lower it to ~0.75 to enable reads). Dark bottle green, low-climb wetting
 *  liquid with a watery surface (K 460, ζ≈0.12), copper gauge numerals behind the liquid. Saved 2026-08-26. */
const PRESET_FREE: Partial<Params> = {
  ...PLAIN_TUBE_BACK,
  tubeHeight: 56, hoursY: 9, minutesY: 180, liquid: '#1f602f', liquidHi: '#1a6528', liquidLo: '#214002',
  tubeBack: '#10140f', glassBody: 0.03, glassHiBright: 0.15, glassReflect: 0.11, glassRim: 0.13,
  glassOverLiquid: 0.25, lens: -0.4, lensCurve: 0.6, bubbleRim: '#255917', highlightH: 26, highlightBright: 0.15,
  highlightSharp: 3, highlightInset: 31, shadeDepth: 0.74, meniscusDepth: 3.5, meniscusPow: 3.6,
  meniscusTiltGain: 0.9, meniscusAsym: 1.05, meniscusK: 460, meniscusDamp: 5, meniscusInertia: 2, contactLag: 0.9,
  wetFilm: 15, edgeSoft: 0.7, frontBright: 23, edgeGlow: 40, glowStrength: 0.21, edgeLightGain: 0.55, bubbleW: 28,
  bubbleH: 20, bubbleGap: 18, bubbleY: 0.28, bubbleTiltGain: 14, bubbleDark: 0.55, fizzCount: 19, fizzSize: 4.5,
  fizzSizeVar: 0.7, fizzShadeOff: 0.55, fizzDriftGain: 0.85, fizzAcrossGain: 1.05, fizzFlatRise: 0.45, fizzSquash: 2,
  fizzSpeed: 13, tickMajorEveryH: 0, tickMinorHeightH: 11, tickMajorHeightH: 22, tickMinorWidthH: 2,
  tickMajorWidthH: 3, tickColorH: '#243120', tickMajorColorH: '#243120', tickPosH: 1, tickMajorEveryM: 0,
  tickMinorHeightM: 5, tickMajorHeightM: 28, tickMinorWidthM: 2, tickColorM: '#243120', tickMajorColorM: '#243120',
  tickPosM: 1, tickLens: 0.3, tickParallax: 4.75, tickDryLens: 1, tickEmboss: 0.55, digitFont: 7,
  digitTint: '#827c40', digitTintAmount: 0.9, digitTone: -0.1, digitScaleX: 3.5, digitScaleY: 3.25,
  digitScaleXMin: 2.5, digitScaleYMin: 3, digitBottomMin: 17, digitBottom: 17, bottomLens: 0.45, digitDryLens: 0.35,
  topLens: 0.35, topParallax: -10, liquidTransparency: 0.47, markContrast: 34, digitMinuteStep: 5, digitHourStep: 1,
  freeLiquid: true, freeGain: 990, freeDamp: 0.8, freeHomeK: 150, readFaceUp: 1, readTurn: 125, readHold: 11,
  fillK: 756, fillDamp: 40, lightPhys: 1, brightness: 1, liquidBright: 2, digitBright: 1.53,
};

export interface PresetEntry { id: string; name: string; note: string; p: Partial<Params>; mat?: Material; legacy?: boolean; big?: boolean }

/** Big-lens twin of a preset (examples/urine_big.json, 2026-08-27): the second physical rod is wider and
 *  barely magnifies, so the tubes grow to 72 px at y 11 / 144, `lens` drops to −0.05 with a −3 curve, and
 *  the marks move with the tube. Thin (46 px) presets take the example's hand-tuned mark values; wider ones
 *  scale their own by 72 / tubeHeight. */
export function bigLens(p: Partial<Params>): Partial<Params> {
  const base = { ...DEFAULT_PARAMS, ...p };
  const out: Partial<Params> = { ...p, tubeHeight: 72, hoursY: 11, minutesY: 144, lens: -0.05, lensCurve: -3 };
  // front digits were pre-warped against the thin rod's magnification; the big rod hardly magnifies
  if (base.digitsOnTop) Object.assign(out, { topLens: 0, topParallax: -3 });
  if (base.tubeHeight === MODERN_BASE.tubeHeight) {
    Object.assign(out, { tickMinorHeightH: 21, tickMinorHeightM: 16, digitScaleYMin: 3, digitBottom: 25, digitBottomMin: 26 });
    if (!base.ticksOnTop) Object.assign(out, { tickLens: 0.45, tickParallax: 3.75, tickDryLens: 0.45, tickEmboss: 0.25 });
  } else {
    const k = 72 / base.tubeHeight;
    for (const key of ['tickMinorHeightH', 'tickMajorHeightH', 'tickMinorHeightM', 'tickMajorHeightM', 'digitBottom', 'digitBottomMin'] as const)
      out[key] = Math.round(base[key] * k);
  }
  return out;
}

const M = (viscosity: Material['viscosity'], opacity: Material['opacity'], emissive: boolean, wetting: boolean, gas: Material['gas']): Material =>
  ({ viscosity, opacity, emissive, wetting, gas });

/** Everything the preset picker and `?preset=<id>` offer. */
export const PRESETS: PresetEntry[] = [
  { id: 'frizzante', name: 'Frizzante', note: 'colourless sparkling water, lab print, fine bead', p: PRESET_FRIZZANTE, mat: M('watery', 'clear', false, true, 'carbonated') },
  { id: 'urine', name: 'Urine sample', note: 'clear amber, watery, specimen-cup graduations', p: PRESET_URINE, mat: M('watery', 'translucent', false, true, 'none') },
  { id: 'blood', name: 'Blood', note: 'opaque venous red, coats the glass, syringe print', p: PRESET_BLOOD, mat: M('medium', 'opaque', false, true, 'none') },
  { id: 'milk', name: 'Milk', note: 'opaque white colloid, soft highlight, printed scale', p: PRESET_MILK, mat: M('medium', 'opaque', false, true, 'none') },
  { id: 'mercury', name: 'Mercury', note: 'convex bead, mirror specular, etched scale', p: PRESET_MERCURY, mat: M('metal', 'opaque', false, false, 'none') },
  { id: 'honey', name: 'Honey', note: 'amber syrup, overdamped, clings, trapped air', p: PRESET_HONEY, mat: M('viscous', 'translucent', false, true, 'trapped') },
  { id: 'cola', name: 'Cola', note: 'dark translucent, lively bead, enamel numerals', p: PRESET_COLA, mat: M('watery', 'translucent', false, true, 'carbonated') },
  { id: 'malt', name: 'Single malt', note: 'amber, legs on the wall, brass numerals', p: PRESET_MALT, mat: M('medium', 'translucent', false, true, 'none') },
  { id: 'champagne', name: 'Champagne', note: 'pale gold, dense bead, amber resin numerals', p: PRESET_CHAMPAGNE, mat: M('watery', 'translucent', false, true, 'carbonated') },
  { id: 'cryo', name: 'Cryo oxygen', note: 'pale blue, boiling, frosted wall', p: PRESET_CRYO, mat: M('watery', 'clear', false, true, 'boiling') },
  { id: 'ink', name: 'India ink', note: 'matte black, enamel numerals, panel mostly off', p: PRESET_INK, mat: M('medium', 'opaque', false, true, 'none') },
  { id: 'glow', name: 'Glow stick', note: 'fluorescent green, glows past the cap, seven-segment print', p: PRESET_GLOW, mat: M('medium', 'translucent', true, true, 'none') },
  { id: 'xenon', name: 'Xenon', note: 'violet discharge tube, glowing ends, no inertia', p: PRESET_XENON, mat: M('plasma', 'translucent', true, false, 'none') },
  { id: 'molten', name: 'Molten iron', note: 'emissive orange, dense, non-wetting, forged numerals', p: PRESET_MOLTEN, mat: M('medium', 'opaque', true, false, 'trapped') },
  { id: 'free', name: 'Free liquid', note: 'bottle green slug that slides with the wrist; parks to show time on a raise', p: PRESET_FREE },
];
// Every preset also exists for the big rod: `<id>-big`.
PRESETS.push(...PRESETS.map((e) => ({ ...e, id: e.id + '-big', name: e.name + ' (big lens)', p: bigLens(e.p), big: true })));

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
  tubeBack: { help: 'First tube-back colour. #000000 = AMOLED pixels off when the gradient is Solid.', group: 'Colour', label: 'tube back colour 1' },
  tubeBack2: { help: 'Second colour used by the tube-back gradient.', group: 'Colour', label: 'tube back colour 2' },
  tubeBackGradient: {
    help: 'Fast two-colour gradient across the short axis of the tube. It is folded into the existing per-row colour table.',
    group: 'Colour', label: 'tube back gradient', min: 0, max: 3, step: 1,
    options: ['Solid colour 1', 'Colour 1 → colour 2', 'Colour 2 centre band', 'Colour 2 edge bands'],
  },
  bubbleRim: { help: 'Rim colour of the spirit-level bubble and fizz.', group: 'Colour' },
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
  meniscusTiltGain: { help: 'Gravity pressing the liquid into this end pushes the surface centre outward (convex bulge), draining hollows it — for concave and convex liquids alike. In px of |meniscusDepth| per g. With free liquid the two ends get opposite signs: the lower end bulges, the upper end hollows.', group: 'Shape', label: 'meniscus bulge vs tilt', min: -1, max: 3, step: 0.05 },
  meniscusAsym: { help: 'Across-tilt sags the bulge onto the low wall: its contact line extends, the high one retracts.', group: 'Shape', label: 'meniscus sag per g across', min: 0, max: 2, step: 0.05 },
  meniscusLens: { help: 'Pre-warp of the cap profile against the physical glass, same convention as the front-digits lens: negative undoes the vertical magnification so the drawn cap keeps its shape through the rod. Set it equal to topLens.', group: 'Shape', label: 'meniscus vs glass lens', min: -1, max: 1, step: 0.05 },
  meniscusK: { help: 'Spring of the free surface between the pinned contact lines, 1/s². Lower = slower, larger wobble.', group: 'Meniscus dynamics', label: 'surface spring K', min: 10, max: 800, step: 5 },
  meniscusDamp: { help: 'Damping of the surface wobble, 1/s. Below ~2·√K it rings after a flick.', group: 'Meniscus dynamics', label: 'surface damping', min: 0, max: 60, step: 0.5 },
  meniscusInertia: { help: 'How much the forcing on the edge (flick kick, free-slug acceleration) bulges the surface centre ahead of the contact lines: a flick makes the cap bulge, then ring at the surface spring. Hard-capped at 12 px.', group: 'Meniscus dynamics', label: 'bulge per edge forcing', min: 0, max: 10, step: 0.1 },
  contactLag: { help: 'Contact-angle hysteresis: an advancing edge drags its contact lines behind the centre, a receding one leaves them clinging. px per 10 px/s of edge speed.', group: 'Meniscus dynamics', label: 'contact-line lag', min: 0, max: 3, step: 0.05 },
  wetFilm: { help: 'Trailing wet film a receding edge leaves on the glass, px at full speed (25 px/s); brightest at the walls, drains in ~0.5 s.', group: 'Meniscus dynamics', label: 'wet film px', min: 0, max: 30, step: 1 },
  edgeSoft: { help: 'Soft edge: anti-aliased ramp width in px, centred on the edge (0 = hard pixel edge, 1 = classic 1-px AA).', group: 'Shape', min: 0, max: 4, step: 0.1 },
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
  digitShadow: { help: 'Darker copy offset down-right (emboss), so glyphs read as physical pieces on the glass.', group: 'Digits', label: 'emboss shadow' },
  digitShadowColor: { help: 'Emboss shadow colour.', group: 'Digits', label: 'shadow colour' },
  digitShadowStrength: { help: 'Shadow opacity. 0 = invisible.', group: 'Digits', label: 'shadow strength', min: 0, max: 1, step: 0.05 },
  digitShadowOffset: { help: 'Shadow offset in pixels, down-right.', group: 'Digits', label: 'shadow offset', min: 1, max: 4, step: 1 },
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
  freeLiquid: { help: 'The column is a free slug that slides along the tube under gravity. A wrist turn into the reading pose (face up, tube level) parks it at its home end for readHold seconds so the time edge is true; otherwise it goes where gravity takes it.', group: 'Free liquid', label: 'free liquid' },
  freeGain: { help: 'Slug acceleration per g of along-tilt, px/s².', group: 'Free liquid', label: 'gravity px/s²/g', min: 0, max: 2000, step: 10 },
  freeDamp: { help: 'Viscous drag on the slug, 1/s. Higher = syrup.', group: 'Free liquid', label: 'drag', min: 0, max: 20, step: 0.1 },
  freeBounce: { help: 'Restitution when the slug hits a tube end. 0 = splat, 1 = elastic.', group: 'Free liquid', label: 'end bounce', min: 0, max: 1, step: 0.05 },
  freeHomeK: { help: 'Pull toward the home end while reading, 1/s² (critically damped).', group: 'Free liquid', label: 'home pull K', min: 1, max: 300, step: 1 },
  readFaceUp: { help: 'Reading pose: minimum face-up component of gravity (1 = perfectly flat).', group: 'Free liquid', label: 'pose: face-up min', min: 0, max: 1, step: 0.05 },
  readAlongMax: { help: 'Reading pose: maximum along-tube tilt, g.', group: 'Free liquid', label: 'pose: |along| max g', min: 0, max: 1, step: 0.05 },
  readTurn: { help: 'Gyro energy (dps, both axes) that counts as the wrist turn which arms a read. 0 = the pose alone reads (sliders have no gyro: use the raise-wrist button or 0).', group: 'Free liquid', label: 'turn dps to arm', min: 0, max: 400, step: 5 },
  readHold: { help: 'Seconds the time stays shown after the turn while the pose holds.', group: 'Free liquid', label: 'read hold s', min: 0.5, max: 30, step: 0.5 },
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
