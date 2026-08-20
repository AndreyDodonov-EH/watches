// All tunables live here. Colours are RGB888 hex strings but are quantised to RGB565 at render time.
// Export/import as JSON from the control panel; the exported file is the contract for Phase 3 (spec/params.h).

export interface Params {
  // --- colours (hex "#rrggbb"); quantised to RGB565 before drawing ---
  liquid: string;        // body colour
  liquidHi: string;      // specular highlight strip
  liquidLo: string;      // bottom shade (cylinder shading)
  glass: string;         // empty part of the tube (very dark; 0 = off for AMOLED power)
  bubbleRim: string;
  // --- shape ---
  highlightH: number;    // px, height of highlight strip at top of column
  highlightInset: number;// px, highlight starts this far from left and ends this far before the edge
  shadeDepth: number;    // 0..1, how dark the bottom rows get (cylinder shading)
  meniscusDepth: number; // px, how far the liquid climbs the wall at top/bottom vs centre (>0 concave)
  meniscusPow: number;   // curve exponent (2 = parabola)
  edgeSoft: number;      // px, anti-aliased edge width (0 = hard pixel edge)
  frontBright: number;   // px, band just behind the fill edge blended toward liquidHi (bright convex cap look)
  edgeGlow: number;      // px, dim glow fading out past the fill edge (0 = off)
  glowStrength: number;  // 0..1 brightness of the glow at the edge
  cornerR: number;       // px, rounding of the column's left end (tube end cap)
  // --- bubble ---
  bubble: boolean;
  bubbleW: number;       // px
  bubbleH: number;       // px
  bubbleGap: number;     // px, distance from fill edge to bubble centre
  bubbleY: number;       // 0..1 vertical position in the tube (0.5 = centre, like a spirit level)
  bubbleDark: number;    // 0..1, darkening of bubble interior
  // --- fizz (small drifting bubbles, like the reference photo) ---
  fizz: boolean;
  fizzCount: number;
  fizzSize: number;      // px (1..3)
  fizzSpeed: number;     // px/s upward drift
  // --- ticks, hours tube (units = hours) ---
  ticksH: boolean;
  tickStepH: number;       // minor tick every N hours
  tickMajorEveryH: number; // every N-th minor tick is major (0 = none)
  tickMinorHeightH: number;// px
  tickMajorHeightH: number;// px
  tickColorH: string;      // minor
  tickMajorColorH: string;
  tickPosH: number;        // 0 top, 1 bottom, 2 both
  // --- ticks, minutes tube (units = minutes) ---
  ticksM: boolean;
  tickStepM: number;
  tickMajorEveryM: number;
  tickMinorHeightM: number;
  tickMajorHeightM: number;
  tickColorM: string;
  tickMajorColorM: string;
  tickPosM: number;
  // --- digits along the bottom of the tube (3x5 pixel font) ---
  digits: boolean;
  digitColor: string;    // top of glyph
  digitColor2: string;   // bottom of glyph (vertical gradient → metallic look; set equal for flat)
  digitShadow: boolean;  // 1 px darker copy offset down-right (emboss)
  digitShadowColor: string;
  digitFont: number;     // 0 = 3x5, 1 = 4x6 narrow, 2 = 5x7 round, 3 = 5x7 seven-segment, 4 = 6x8 bold
  digitScaleX: number;   // hours tube: horizontal scale (0.5..6, fractional OK — nearest-neighbour)
  digitScaleY: number;   // hours tube: vertical scale — keep lower than X to counter the vial's vertical stretch
  digitScaleXMin: number; // minutes tube
  digitScaleYMin: number;
  digitBottomMin: number; // minutes tube baseline (px from bottom edge)
  digitBottom: number;   // hours tube: px from the tube's bottom edge to the digit baseline
  digitsOnTop: boolean;  // true = printed on the glass (fully opaque over the liquid); false = behind the liquid, seen through it by liquidTransparency
  liquidTransparency: number; // 0..1 how much of ticks/digits shows through the liquid (0 = opaque liquid)
  digitsLeadingZero: boolean; // minutes as 05,10,... instead of 5,10,...
  digitMinuteStep: number; // label every N minutes (5,10,15,20,30)
  digitHourStep: number;   // label every N hours (1..6)
  // --- physics (fixed-step 50 Hz) ---
  fillK: number;         // spring stiffness of fill-edge position (1/s^2)
  fillDamp: number;      // damping ratio-ish (1/s)
  fillSloshGain: number; // px per g of along-tube acceleration
  angleK: number;        // spring stiffness of surface angle
  angleDamp: number;
  angleTiltGain: number; // deg of surface tilt per g of along-tube tilt (static response)
  angleGyroGain: number; // deg impulse per (dps) of along-axis rotation rate
  angleMax: number;      // deg clamp
  acrossShiftGain: number; // px vertical shift of highlight per g of across-tube tilt
  deadzone: number;      // g, ignore tiny accelerations
  // --- IMU conditioning (applied to board / phone input before the springs; ported to firmware) ---
  accelLpHz: number;     // low-pass cutoff for accel (gravity direction), Hz
  gyroHpHz: number;      // high-pass cutoff for gyro: removes bias and slow rotations, keeps flicks
  gyroDeadzone: number;  // dps, ignore gyro below this after filtering
  gyroMax: number;       // dps, clamp
  inputGain: number;     // overall multiplier on tilt input (0.1..2)
  // --- display ---
  brightness: number;    // 0..1 global multiplier (emulates cmd 0x51)
}

export const DEFAULT_PARAMS: Params = {
  liquid: '#346a2a',
  liquidHi: '#b6ffa0',
  liquidLo: '#1e7515',
  glass: '#000000',
  bubbleRim: '#b0c7a9',
  highlightH: 30,
  highlightInset: 0,
  shadeDepth: 0.7,
  meniscusDepth: -8.5,
  meniscusPow: 1.6,
  edgeSoft: 2.7,
  frontBright: 32,
  edgeGlow: 25,
  glowStrength: 0.47,
  cornerR: 0,
  bubble: false,
  bubbleW: 14,
  bubbleH: 8,
  bubbleGap: 18,
  bubbleY: 0.5,
  bubbleDark: 0.55,
  fizz: true,
  fizzCount: 10,
  fizzSize: 2,
  fizzSpeed: 14,
  ticksH: true, tickStepH: 1, tickMajorEveryH: 3, tickMinorHeightH: 3, tickMajorHeightH: 6, tickColorH: '#303030', tickMajorColorH: '#484848', tickPosH: 2,
  ticksM: true, tickStepM: 1, tickMajorEveryM: 5, tickMinorHeightM: 3, tickMajorHeightM: 6, tickColorM: '#303030', tickMajorColorM: '#484848', tickPosM: 2,
  digits: true,
  digitColor: '#9a9a9a',
  digitColor2: '#4a4a4a',
  digitShadow: true,
  digitShadowColor: '#101010',
  digitFont: 2,
  digitScaleX: 2,
  digitScaleY: 1.5,
  digitScaleXMin: 1.5,
  digitScaleYMin: 1.25,
  digitBottomMin: 2,
  digitBottom: 2,
  digitsOnTop: false,
  liquidTransparency: 0.45,
  digitsLeadingZero: true,
  digitMinuteStep: 10,
  digitHourStep: 1,
  fillK: 28,
  fillDamp: 3.5,
  fillSloshGain: 25,
  angleK: 35,
  angleDamp: 4,
  angleTiltGain: 20,
  angleGyroGain: 0.03,
  angleMax: 40,
  acrossShiftGain: 6,
  deadzone: 0.02,
  accelLpHz: 3,
  gyroHpHz: 0.7,
  gyroDeadzone: 10,
  gyroMax: 400,
  inputGain: 1,
  brightness: 1,
};

/** Neon preset close to images/reference-liquid.jpg */
export const PRESET_NEON: Partial<Params> = {
  liquid: '#39ff14', liquidHi: '#b6ffa0', liquidLo: '#158f08', bubbleRim: '#d8ffcc', glass: '#061006',
  fizz: true,
};
/** Concept-art preset (images/concept-cuff.jpg): rounded ends, convex bright front, neon. */
export const PRESET_CONCEPT: Partial<Params> = {
  ...PRESET_NEON, meniscusDepth: -14, meniscusPow: 2.2, cornerR: 36, frontBright: 16, edgeGlow: 18, glowStrength: 0.45,
  highlightH: 14, highlightInset: 30, bubble: false, fizz: true, fizzCount: 10, fizzSize: 2, shadeDepth: 0.7,
};
/** User-tuned look (2026-08-20): deep green body, wide highlight, convex bright front, fizz. */
export const PRESET_USER_V1: Partial<Params> = {
  liquid: '#346a2a', liquidHi: '#b6ffa0', liquidLo: '#1e7515', glass: '#000000', bubbleRim: '#b0c7a9',
  highlightH: 30, highlightInset: 0, shadeDepth: 0.7, meniscusDepth: -8.5, meniscusPow: 1.6, edgeSoft: 2.7,
  frontBright: 32, edgeGlow: 25, glowStrength: 0.47, cornerR: 0, bubble: false, fizz: true, fizzCount: 10, fizzSize: 2, fizzSpeed: 14,
};
export const PRESET_MINT: Partial<Params> = {
  liquid: '#5dcaa5', liquidHi: '#9fe1cb', liquidLo: '#1f6b52', bubbleRim: '#bff5dc', glass: '#000000',
  fizz: false,
};

export type ParamKey = keyof Params;

/** Map keys from older exports (shared tick settings, digitScale, digitFontBig) onto the current schema. */
export function migrateParams(o: Record<string, unknown>): Partial<Params> {
  const r: Record<string, unknown> = { ...o };
  if ('ticks' in r) { r.ticksH = r.ticksM = r.ticks; delete r.ticks; }
  if ('tickMajorH' in r) { r.tickMajorHeightH = r.tickMajorHeightM = r.tickMajorH; delete r.tickMajorH; }
  if ('tickMinorH' in r) { r.tickMinorHeightH = r.tickMinorHeightM = r.tickMinorH; delete r.tickMinorH; }
  if ('tick' in r) { r.tickColorH = r.tickColorM = r.tickMajorColorH = r.tickMajorColorM = r.tick; delete r.tick; }
  if ('digitScale' in r) { r.digitScaleX = r.digitScaleY = r.digitScaleXMin = r.digitScaleYMin = r.digitScale; delete r.digitScale; }
  if ('digitFontBig' in r) { r.digitFont = r.digitFontBig ? 2 : 0; delete r.digitFontBig; }
  for (const k of Object.keys(r)) if (!(k in DEFAULT_PARAMS)) delete r[k];
  return r as Partial<Params>;
}

/** UI metadata: [min, max, step] for numeric params; grouping for the panel. */
export const PARAM_META: Record<string, { group: string; label?: string; min?: number; max?: number; step?: number }> = {
  liquid: { group: 'Colour' }, liquidHi: { group: 'Colour' }, liquidLo: { group: 'Colour' },
  glass: { group: 'Colour' }, bubbleRim: { group: 'Colour' },
  brightness: { group: 'Colour', min: 0.1, max: 1, step: 0.01 },
  highlightH: { group: 'Shape', min: 0, max: 30, step: 1 },
  highlightInset: { group: 'Shape', min: 0, max: 40, step: 1 },
  shadeDepth: { group: 'Shape', min: 0, max: 1, step: 0.01 },
  meniscusDepth: { group: 'Shape', min: -12, max: 20, step: 0.5 },
  meniscusPow: { group: 'Shape', min: 1, max: 4, step: 0.1 },
  edgeSoft: { group: 'Shape', min: 0, max: 4, step: 0.1 },
  frontBright: { group: 'Shape', min: 0, max: 40, step: 1 },
  edgeGlow: { group: 'Shape', min: 0, max: 40, step: 1 },
  glowStrength: { group: 'Shape', min: 0, max: 1, step: 0.01 },
  cornerR: { group: 'Shape', min: 0, max: 36, step: 1 },
  bubble: { group: 'Bubble' },
  bubbleW: { group: 'Bubble', min: 2, max: 40, step: 1 },
  bubbleH: { group: 'Bubble', min: 2, max: 30, step: 1 },
  bubbleGap: { group: 'Bubble', min: 0, max: 80, step: 1 },
  bubbleY: { group: 'Bubble', min: 0.1, max: 0.9, step: 0.01 },
  bubbleDark: { group: 'Bubble', min: 0, max: 1, step: 0.01 },
  fizz: { group: 'Bubble' },
  fizzCount: { group: 'Bubble', min: 0, max: 60, step: 1 },
  fizzSize: { group: 'Bubble', min: 1, max: 4, step: 1 },
  fizzSpeed: { group: 'Bubble', min: 0, max: 60, step: 1 },
  ticksH: { group: 'Ticks · hours', label: 'show ticks' },
  tickStepH: { group: 'Ticks · hours', label: 'minor every N h', min: 1, max: 6, step: 1 },
  tickMajorEveryH: { group: 'Ticks · hours', label: 'major every N minors', min: 0, max: 12, step: 1 },
  tickMinorHeightH: { group: 'Ticks · hours', label: 'minor height', min: 0, max: 36, step: 1 },
  tickMajorHeightH: { group: 'Ticks · hours', label: 'major height', min: 0, max: 36, step: 1 },
  tickColorH: { group: 'Ticks · hours', label: 'minor colour' },
  tickMajorColorH: { group: 'Ticks · hours', label: 'major colour' },
  tickPosH: { group: 'Ticks · hours', label: 'position (0 top · 1 bottom · 2 both)', min: 0, max: 2, step: 1 },
  ticksM: { group: 'Ticks · minutes', label: 'show ticks' },
  tickStepM: { group: 'Ticks · minutes', label: 'minor every N min', min: 1, max: 30, step: 1 },
  tickMajorEveryM: { group: 'Ticks · minutes', label: 'major every N minors', min: 0, max: 30, step: 1 },
  tickMinorHeightM: { group: 'Ticks · minutes', label: 'minor height', min: 0, max: 36, step: 1 },
  tickMajorHeightM: { group: 'Ticks · minutes', label: 'major height', min: 0, max: 36, step: 1 },
  tickColorM: { group: 'Ticks · minutes', label: 'minor colour' },
  tickMajorColorM: { group: 'Ticks · minutes', label: 'major colour' },
  tickPosM: { group: 'Ticks · minutes', label: 'position (0 top · 1 bottom · 2 both)', min: 0, max: 2, step: 1 },
  liquidTransparency: { group: 'Shape', min: 0, max: 1, step: 0.01 },
  // digits — shared
  digits: { group: 'Digits', label: 'show digits' },
  digitFont: { group: 'Digits', label: 'font (0 3x5 · 1 4x6 · 2 5x7 · 3 7-seg · 4 6x8 bold)', min: 0, max: 4, step: 1 },
  digitColor: { group: 'Digits', label: 'colour top' },
  digitColor2: { group: 'Digits', label: 'colour bottom' },
  digitShadow: { group: 'Digits', label: 'emboss shadow' },
  digitShadowColor: { group: 'Digits', label: 'shadow colour' },
  digitsOnTop: { group: 'Digits', label: 'print on top of liquid' },
  // digits — hours tube
  digitHourStep: { group: 'Digits · hours', label: 'label every N h', min: 1, max: 6, step: 1 },
  digitScaleX: { group: 'Digits · hours', label: 'scale X', min: 0.5, max: 6, step: 0.25 },
  digitScaleY: { group: 'Digits · hours', label: 'scale Y', min: 0.5, max: 6, step: 0.25 },
  digitBottom: { group: 'Digits · hours', label: 'baseline from bottom', min: 0, max: 40, step: 1 },
  // digits — minutes tube
  digitMinuteStep: { group: 'Digits · minutes', label: 'label every N min', min: 5, max: 30, step: 5 },
  digitsLeadingZero: { group: 'Digits · minutes', label: 'leading zero (05)' },
  digitScaleXMin: { group: 'Digits · minutes', label: 'scale X', min: 0.5, max: 6, step: 0.25 },
  digitScaleYMin: { group: 'Digits · minutes', label: 'scale Y', min: 0.5, max: 6, step: 0.25 },
  digitBottomMin: { group: 'Digits · minutes', label: 'baseline from bottom', min: 0, max: 40, step: 1 },
  fillK: { group: 'Physics', min: 1, max: 400, step: 1 },
  fillDamp: { group: 'Physics', min: 0, max: 40, step: 0.1 },
  fillSloshGain: { group: 'Physics', min: 0, max: 200, step: 1 },
  angleK: { group: 'Physics', min: 1, max: 400, step: 1 },
  angleDamp: { group: 'Physics', min: 0, max: 40, step: 0.1 },
  angleTiltGain: { group: 'Physics', min: 0, max: 90, step: 1 },
  angleGyroGain: { group: 'Physics', min: 0, max: 1, step: 0.005 },
  angleMax: { group: 'Physics', min: 0, max: 80, step: 1 },
  acrossShiftGain: { group: 'Physics', min: 0, max: 30, step: 0.5 },
  deadzone: { group: 'Physics', min: 0, max: 0.2, step: 0.005 },
  accelLpHz: { group: 'IMU filter', min: 0.2, max: 25, step: 0.1 },
  gyroHpHz: { group: 'IMU filter', min: 0, max: 5, step: 0.05 },
  gyroDeadzone: { group: 'IMU filter', min: 0, max: 60, step: 1 },
  gyroMax: { group: 'IMU filter', min: 50, max: 1000, step: 10 },
  inputGain: { group: 'IMU filter', min: 0.1, max: 2, step: 0.05 },
};
