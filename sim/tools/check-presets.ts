// Coherence check for the signature presets: every preset declares a Material and the numbers
// must sit inside that material's ranges (presets/PRESETS.md). Run: npm run check:presets
declare const process: any;
import { PRESETS, presetParams, type Material, type Params } from '../src/params';

type Range = [number, number];
const VISC: Record<Material['viscosity'], Record<string, Range>> = {
  // free slug (gravity / drag / end bounce), surface spring, hysteresis, film, static skew and flick kick
  watery:  { freeDamp: [0.4, 1.5], freeBounce: [0.15, 0.35], meniscusK: [400, 550], meniscusDamp: [3, 16], contactLag: [1.5, 3], wetFilm: [8, 15], angleTiltGain: [5, 9], angleGyroGain: [0.3, 0.55] },
  medium:  { freeDamp: [1.5, 4], freeBounce: [0.05, 0.15], meniscusK: [200, 350], meniscusDamp: [12, 25], contactLag: [2, 3], wetFilm: [12, 20], angleTiltGain: [3, 5], angleGyroGain: [0.15, 0.35] },
  viscous: { freeDamp: [6, 14], freeBounce: [0, 0], meniscusK: [60, 150], meniscusDamp: [25, 50], contactLag: [3, 3], wetFilm: [20, 30], angleTiltGain: [0.5, 2.5], angleGyroGain: [0.02, 0.12] },
  metal:   { freeDamp: [0.8, 1.5], freeBounce: [0.4, 0.7], meniscusK: [500, 800], meniscusDamp: [8, 16], contactLag: [0, 0.3], wetFilm: [0, 0], angleTiltGain: [1.5, 3], angleGyroGain: [0.3, 0.5] },
  plasma:  { fillSloshGain: [0, 1], angleTiltGain: [0, 1], angleGyroGain: [0, 0.06], contactLag: [0, 0], wetFilm: [0, 0] },
};

const hex = (s: string): [number, number, number] => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const luma = (s: string): number => { const [r, g, b] = hex(s); return 0.299 * r + 0.587 * g + 0.114 * b; };
const sat = (s: string): number => { const c = hex(s), mx = Math.max(...c), mn = Math.min(...c); return mx === 0 ? 0 : (mx - mn) / mx; };

function check(id: string, p: Params, m: Material): string[] {
  const bad: string[] = [];
  const inR = (key: string, v: number, r: Range | undefined): void => {
    if (r && (v < r[0] || v > r[1])) bad.push(`${key} = ${v} not in [${r[0]}, ${r[1]}] for ${m.viscosity}`);
  };
  const want = (cond: boolean, msg: string): void => { if (!cond) bad.push(msg); };

  // viscosity
  const V = VISC[m.viscosity];
  if (m.viscosity === 'plasma') want(!p.freeLiquid, 'plasma is not a slug: freeLiquid must be off');
  else want(p.freeLiquid, 'a liquid is a free slug: freeLiquid must be on');
  for (const k of ['fillSloshGain', 'angleTiltGain', 'angleGyroGain', 'meniscusDamp', 'freeDamp', 'freeBounce'] as const) inR(k, p[k], V[k]);
  if (p.freeLiquid) want(p.freeGain >= 500 && p.freeGain <= 800, `freeGain ${p.freeGain} is gravity, the same for every liquid: 500–800`);
  // a wetting liquid's surface follows its viscosity class; a non-wetting one is surface-tension
  // dominated (stiff cap, no hysteresis, no film) whatever its bulk viscosity — checked below
  if (m.wetting) { inR('wetFilm', p.wetFilm, V.wetFilm); inR('contactLag', p.contactLag, V.contactLag); inR('meniscusK', p.meniscusK, V.meniscusK); }
  else if (m.viscosity !== 'plasma') inR('meniscusK (non-wetting)', p.meniscusK, [350, 800]);
  if (m.viscosity === 'plasma') {
    want(p.meniscusInertia === 0 && p.meniscusTiltGain === 0 && p.meniscusAsym === 0, 'plasma has no meniscus dynamics (inertia/tiltGain/asym must be 0)');
    want(p.angleMax <= 3, 'plasma: angleMax ≤ 3');
  }

  // opacity
  const t = p.liquidTransparency, rear = !p.ticksOnTop || !p.digitsOnTop;
  if (m.opacity === 'opaque') {
    want(t <= 0.12, `opaque: liquidTransparency ${t} > 0.12`);
    want(!rear || p.markContrast === 0, 'opaque: rear marks would be faked by markContrast — print them on top or set markContrast 0');
    want(p.shadeDepth >= 0.5 && p.shadeDepth <= 0.95, `opaque: shadeDepth ${p.shadeDepth} not in [0.5, 0.95]`);
  } else if (m.opacity === 'translucent') {
    want(t >= 0.25 && t <= 0.55, `translucent: liquidTransparency ${t} not in [0.25, 0.55]`);
    want(p.shadeDepth >= 0.4 && p.shadeDepth <= 0.85, `translucent: shadeDepth ${p.shadeDepth} not in [0.4, 0.85]`);
  } else {
    want(t >= 0.7, `clear: liquidTransparency ${t} < 0.7`);
    want(p.shadeDepth >= 0.3 && p.shadeDepth <= 0.55, `clear: shadeDepth ${p.shadeDepth} not in [0.3, 0.55]`);
    want(sat(p.liquidHi) < 0.2, `clear: liquidHi ${p.liquidHi} is a white surface reflection (saturation ${sat(p.liquidHi).toFixed(2)} ≥ 0.2)`);
    want(p.glassOverLiquid >= 0.5, `clear: glassOverLiquid ${p.glassOverLiquid} < 0.5`);
    want(!rear || p.markContrast >= 16, `clear rear marks: markContrast ${p.markContrast} < 16`);
  }

  // light
  if (m.emissive) {
    want(p.glowStrength >= 0.4 && p.glowStrength <= 0.8, `emissive: glowStrength ${p.glowStrength} not in [0.4, 0.8]`);
    want(p.edgeGlow >= 18 && p.edgeGlow <= 34, `emissive: edgeGlow ${p.edgeGlow} not in [18, 34]`);
    want(p.lightPhys === 0, 'emissive: lightPhys must be 0 (it is its own light)');
    want(p.glassOverLiquid <= 0.4, `emissive: glassOverLiquid ${p.glassOverLiquid} > 0.4`);
    want(p.liquidBright >= 1.15 && p.liquidBright <= 1.5, `emissive: liquidBright ${p.liquidBright} not in [1.15, 1.5]`);
    want(luma(p.tubeBack) < 16, `emissive: tube back luma ${luma(p.tubeBack).toFixed(0)} ≥ 16`);
  } else {
    want(p.glowStrength <= 0.25, `not emissive: glowStrength ${p.glowStrength} > 0.25`);
    want(p.lightPhys >= 0.2, `not emissive: lightPhys ${p.lightPhys} < 0.2`);
  }

  // wetting
  if (m.wetting) want(p.meniscusDepth > 0, `wetting: meniscusDepth ${p.meniscusDepth} must be concave (> 0)`);
  else {
    want(p.meniscusDepth < 0, `non-wetting: meniscusDepth ${p.meniscusDepth} must be convex (< 0)`);
    want(p.wetFilm === 0, `non-wetting: wetFilm ${p.wetFilm} must be 0`);
    want(p.contactLag <= 0.3, `non-wetting: contactLag ${p.contactLag} > 0.3`);
  }

  // gas
  if (m.gas === 'none') want(!p.fizz, 'no gas: fizz must be off');
  else {
    want(p.fizz, `${m.gas}: fizz must be on`);
    const G: Record<string, { size: Range; speed: Range; count: Range }> = {
      carbonated: { size: [1, 2], speed: [30, 55], count: [30, 60] },
      boiling: { size: [1, 1.5], speed: [45, 60], count: [45, 60] },
      trapped: { size: [2, 4], speed: [0, 8], count: [0, 12] },
    };
    const g = G[m.gas];
    inR('fizzSize', p.fizzSize, g.size); inR('fizzSpeed', p.fizzSpeed, g.speed); inR('fizzCount', p.fizzCount, g.count);
    if (m.gas === 'carbonated') want(m.viscosity === 'watery', 'carbonated implies watery');
  }

  // colour & scale
  want(luma(p.liquid) < luma(p.liquidHi), 'luma(liquid) < luma(liquidHi)');
  const back = luma(p.tubeBack);
  if (p.ticksOnTop) for (const k of ['tickColorH', 'tickMajorColorH', 'tickColorM', 'tickMajorColorM'] as const)
    want(Math.abs(luma(p[k]) - back) >= 40, `on-top ${k} ${p[k]} is < 40 luma from the tube back (invisible on the dry side)`);
  if (p.digitsOnTop && p.digitFont < 5) want(Math.abs(luma(p.digitColor) - back) >= 40, `on-top digitColor ${p.digitColor} < 40 luma from the tube back`);
  if (p.digitFont >= 5) want(p.digitScaleY <= p.digitScaleX && p.digitBottom + 8 * p.digitScaleY <= p.tubeHeight, 'sprite font, hours tube: digitScaleY ≤ digitScaleX and baseline + 8·scaleY ≤ tubeHeight (glyph must fit the tube)');
  if (m.viscosity !== 'metal' && !m.emissive) want(p.highlightBright * p.liquidBright <= 1.3, `highlightBright × liquidBright = ${(p.highlightBright * p.liquidBright).toFixed(2)} > 1.3 burns a white stripe`);
  want(p.liquidBright >= 0.9 && p.liquidBright <= 2, `liquidBright ${p.liquidBright} not in [0.9, 2]`);
  want(p.tickBright >= 0.8 && p.tickBright <= 1.3, `tickBright ${p.tickBright} not in [0.8, 1.3]`);
  want(p.digitBright >= 0.8 && p.digitBright <= 1.8, `digitBright ${p.digitBright} not in [0.8, 1.8]`);
  return bad;
}

let fails = 0;
for (const e of PRESETS) {
  if (!e.mat) { console.log(`${e.id}: (no material — skipped)`); continue; }
  const bad = check(e.id, presetParams(e), e.mat);
  console.log(`${e.id}: ${bad.length ? 'FAIL' : 'ok'}`);
  for (const b of bad) console.log(`  - ${b}`);
  fails += bad.length;
}
if (fails) { console.log(`${fails} violation(s)`); process.exit(1); }
