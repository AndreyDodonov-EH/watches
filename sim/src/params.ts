// All tunables live here. Colours are RGB888 hex strings but are quantised to RGB565 at render time.
// Export/import as JSON from the control panel; the exported file is the contract for Phase 3 (spec/params.h).

export interface Params {
  // --- colours (hex "#rrggbb"); quantised to RGB565 before drawing ---
  liquid: string;        // body colour
  liquidHi: string;      // specular highlight strip
  liquidLo: string;      // bottom shade (cylinder shading)
  glass: string;         // empty part of the tube (very dark; 0 = off for AMOLED power)
  tick: string;          // tick-mark colour
  bubbleRim: string;
  // --- shape ---
  highlightH: number;    // px, height of highlight strip at top of column
  highlightInset: number;// px, highlight starts this far from left and ends this far before the edge
  shadeDepth: number;    // 0..1, how dark the bottom rows get (cylinder shading)
  meniscusDepth: number; // px, how far the liquid climbs the wall at top/bottom vs centre (>0 concave)
  meniscusPow: number;   // curve exponent (2 = parabola)
  edgeSoft: number;      // px, anti-aliased edge width (0 = hard pixel edge)
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
  // --- ticks ---
  ticks: boolean;
  tickMajorH: number;    // px
  tickMinorH: number;    // px
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
  // --- display ---
  brightness: number;    // 0..1 global multiplier (emulates cmd 0x51)
}

export const DEFAULT_PARAMS: Params = {
  liquid: '#5dcaa5',
  liquidHi: '#9fe1cb',
  liquidLo: '#1f6b52',
  glass: '#000000',
  tick: '#303030',
  bubbleRim: '#bff5dc',
  highlightH: 12,
  highlightInset: 6,
  shadeDepth: 0.6,
  meniscusDepth: 6,
  meniscusPow: 2,
  edgeSoft: 1.5,
  edgeGlow: 10,
  glowStrength: 0.35,
  cornerR: 0,
  bubble: true,
  bubbleW: 14,
  bubbleH: 8,
  bubbleGap: 18,
  bubbleY: 0.5,
  bubbleDark: 0.55,
  fizz: false,
  fizzCount: 12,
  fizzSize: 2,
  fizzSpeed: 14,
  ticks: true,
  tickMajorH: 6,
  tickMinorH: 3,
  fillK: 60,
  fillDamp: 6,
  fillSloshGain: 40,
  angleK: 80,
  angleDamp: 7,
  angleTiltGain: 35,
  angleGyroGain: 0.08,
  angleMax: 40,
  acrossShiftGain: 6,
  deadzone: 0.02,
  brightness: 1,
};

/** Neon preset close to images/reference-liquid.jpg */
export const PRESET_NEON: Partial<Params> = {
  liquid: '#39ff14', liquidHi: '#b6ffa0', liquidLo: '#158f08', bubbleRim: '#d8ffcc', glass: '#061006',
  fizz: true,
};
export const PRESET_MINT: Partial<Params> = {
  liquid: '#5dcaa5', liquidHi: '#9fe1cb', liquidLo: '#1f6b52', bubbleRim: '#bff5dc', glass: '#000000',
  fizz: false,
};

export type ParamKey = keyof Params;

/** UI metadata: [min, max, step] for numeric params; grouping for the panel. */
export const PARAM_META: Record<string, { group: string; min?: number; max?: number; step?: number }> = {
  liquid: { group: 'Colour' }, liquidHi: { group: 'Colour' }, liquidLo: { group: 'Colour' },
  glass: { group: 'Colour' }, tick: { group: 'Colour' }, bubbleRim: { group: 'Colour' },
  brightness: { group: 'Colour', min: 0.1, max: 1, step: 0.01 },
  highlightH: { group: 'Shape', min: 0, max: 30, step: 1 },
  highlightInset: { group: 'Shape', min: 0, max: 40, step: 1 },
  shadeDepth: { group: 'Shape', min: 0, max: 1, step: 0.01 },
  meniscusDepth: { group: 'Shape', min: -12, max: 20, step: 0.5 },
  meniscusPow: { group: 'Shape', min: 1, max: 4, step: 0.1 },
  edgeSoft: { group: 'Shape', min: 0, max: 4, step: 0.1 },
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
  ticks: { group: 'Ticks' },
  tickMajorH: { group: 'Ticks', min: 0, max: 30, step: 1 },
  tickMinorH: { group: 'Ticks', min: 0, max: 30, step: 1 },
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
};
