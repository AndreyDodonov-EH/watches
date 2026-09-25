// Full-render regression checks. Invoked by firmware/tools/check_meniscus.py.
const fs = require('fs');
const assert = require('assert/strict');
const path = require('path');
const [cache, out, root] = process.argv.slice(2);
const R = require(path.join(cache, 'sim/src/render.js'));
const { DEFAULT_PARAMS, migrateParams } = require(path.join(cache, 'sim/src/params.js'));
// Contact angle whose spherical cap has wall depth `depth` px in the 61 px test tube (R = 30).
const ang = (depth) => 90 - 2 * Math.atan(depth / 30) * 180 / Math.PI;
const { newTube } = require(path.join(cache, 'sim/src/physics.js'));
const jobs = [];
const base = { ...DEFAULT_PARAMS, tubeHeight: 61, hoursY: 0, minutesY: 100,
  freeLiquid: true, remaining: false, contactAngle: ang(12), contactHyst: 0, contactDyn: 0,
  meniscusLens: 0, surfaceBand: 0.8, surfaceRim: 0.8,
  surfaceWidth: 4, surfaceTone: 0, edgeSoft: 4, frontBright: 0, edgeGlow: 0,
  wetFilm: 0, traces: false, bubble: false, fizz: false, glassReflect: 0,
  lens: 0, highlightInset: 0, digits: false, ticksH: false, ticksM: false,
  liquid: '#226688', liquidHi: '#eeffff', liquidLo: '#113344',
  tubeBack: '#ffffff', tubeBack2: '#ffffff' };
function render(name, changes = {}, state = {}, preset = base, residue = false) {
  const p = { ...preset, ...changes };
  const s = { ...newTube(), fillTarget: 0.5, slugPos: 134, ...state };
  if (residue) { s.trace.fill(0xff00); s.traceLo = 0; s.traceHi = 536; }
  R.fb.fill(0);
  R.drawTube(0, 0, s, p, R.buildPalette(p, s.light), 12);
  const frame = R.fb.slice(0, 536 * R.tubeLayout(p).H);
  fs.writeFileSync(path.join(out, name + '.bin'), Buffer.from(frame.buffer));
  const params = Object.fromEntries(Object.entries(p).filter(([k, v]) => v !== DEFAULT_PARAMS[k]));
  jobs.push({ name, params, state: { fillTarget: 0.5, slugPos: 134, ...state }, residue, height: R.tubeLayout(p).H });
  return frame;
}
function rgb(v) { return [(v >> 11) * 255 / 31, ((v >> 5) & 63) * 255 / 63, (v & 31) * 255 / 31]; }
function delta(a, b) { let d = 0; for (let i = 0; i < a.length; i++) {
  const A = rgb(a[i]), B = rgb(b[i]); for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A[c] - B[c]));
} return d; }
const symmetric = render('symmetric');
for (let y = 0; y < 61; y++) for (let x = 100; x < 170; x++)
  assert.equal(symmetric[y * 536 + x], symmetric[y * 536 + 535 - x], `mirror row ${y}, x ${x}`);
const a = render('subpixel-before', {}, { fillPos: 0.49 });
const b = render('subpixel-after', {}, { fillPos: 0.51 });
assert(delta(a, b) <= 17, 'surface/rim must move without a one-pixel brightness jump');
const flatA = render('flatten-before', { contactAngle: ang(0.49) });
const flatB = render('flatten-after', { contactAngle: ang(0.51) });
assert(delta(flatA, flatB) <= 17, 'flattening surface must not pop at half a pixel');
const clean = render('band-disabled', { surfaceBand: 0, traces: true, traceAmount: 2 }, {}, base, true);
const faint = render('band-faint', { surfaceBand: 0.005, traces: true, traceAmount: 2 }, {}, base, true);
assert(delta(clean, faint) <= 9, 'faint band must not cut a hole in residue');
const marks = { digits: true, digitFont: 0, digitParallax: 4, liquidTransparency: 0 };
const marksOff = render('marks-disabled', { ...marks, surfaceBand: 0 });
const marksFaint = render('marks-faint', { ...marks, surfaceBand: 0.005 });
assert(delta(marksOff, marksFaint) <= 9, 'faint band must not switch rear marks to a different plane');
const receding = render('receding', {}, { filmFree: 1, filmHome: 1 });
assert.equal(delta(receding, symmetric), 0, 'wet film must not fade the concave surface: it only changes shape');
// Receding at speed (dynamic contact angle ~0): the outer dish runs into the trail, no rim or outline
// past the body's AA ramp; the same edge at rest has its full band back at once, film or not.
const trail = { traces: true, traceAmount: 2 };
const fast = render('receding-fast', trail, { fillVel: -30, filmFree: 1 }, base, true);
const fastOff = render('receding-fast-disabled', { ...trail, surfaceBand: 0 }, { fillVel: -30, filmFree: 1 }, base, true);
for (let x = 405; x < 409; x++) assert(delta([fast[30 * 536 + x]], [fastOff[30 * 536 + x]]) <= 9, 'receding surface must not outline the trail');
const stopped = render('receding-stopped', trail, { filmFree: 1 }, base, true);
assert(delta(stopped.slice(30 * 536 + 403, 30 * 536 + 409), fastOff.slice(30 * 536 + 403, 30 * 536 + 409)) > 9, 'stopped edge must show its band');
// Rear marks under the concave band are composited per pixel by the dish's own layer opacities (no
// >= 0.5 threshold): with an opaque liquid a settled opaque band hides the mark behind it exactly like the
// body; a fast-receding edge's band thins into its trail and shows it; a flattening band (ring a fraction
// of a px off the profile) is barely there and shows it; the rim keeps most of its colour over a dark
// mark; fill 0.49 -> 0.51 moves nothing by more than a rounding step. Both edges, both fill directions.
// Wide black ticks the full tube height make the whole rear wall a mark; contrast 0 lets the through-
// liquid colour vanish at transparency 0.
const markScene = { ...marks, digits: false, markContrast: 0, ticksH: true, tickStepH: 1, tickMinorWidthH: 60, tickMajorWidthH: 60,
  tickMinorHeightH: 61, tickMajorHeightH: 61, tickColorH: '#000000', tickMajorColorH: '#000000' };
const black = 0;
for (const remaining of [false, true]) for (const home of [false, true]) {
  const recede = remaining ? 1 : -1;
  const moving = home ? { slugVel: -recede * 30 } : { fillVel: recede * 30 };
  const side = home ? 1 : 0, tag = `${remaining}/${home}`;
  // Band geometry at row 30 from the settled band-on frame (the edge does not move between these shots):
  // the 3 fully covered px past the profile, and the outer px where the rim sits (rimCoverage 1).
  render(`marks-${remaining}-${home}-geometry`, { ...markScene, remaining }, {});
  const b = R.markBounds[0].band, xm = b.xm[side][30], w0 = b.w[side][30];
  const dir = side === 0 ? 1 : -1, first = side === 0 ? Math.ceil(xm) : Math.ceil(xm) - 1;
  const at = (f, xr) => f[30 * 536 + (b.mirror ? b.L - 1 - xr : xr)];
  const shot = (changes, state) => {
    const f = render(`marks-${remaining}-${home}-${JSON.stringify(state)}-${JSON.stringify(changes)}`, { ...markScene, remaining, ...changes }, state);
    return { f, zone: [0, 1, 2].map((i) => at(f, first + dir * i)), rim: at(f, side === 0 ? Math.ceil(xm + 2.5) : Math.floor(xm - 3.5)) };
  };
  const zoneDelta = (a, b) => Math.max(...a.zone.map((v, i) => delta([v], [b.zone[i]])));
  const bare = shot({ surfaceBand: 0 }, {}), bareNoTicks = shot({ surfaceBand: 0, ticksH: false }, {});
  assert(zoneDelta(bare, bareNoTicks) > 150, `test scene must put a mark under the band (${tag})`);
  const rest = shot({}, {}), restNoTicks = shot({ ticksH: false }, {});
  assert(w0 >= 3.5, `settled band must reach its full width at the centre row (${tag}: ${w0})`);
  assert.equal(zoneDelta(rest, restNoTicks), 0, `settled opaque band must hide rear marks like the body (${tag})`);
  const pulled = shot({}, moving), pulledNoTicks = shot({ ticksH: false }, moving);
  assert(zoneDelta(pulled, pulledNoTicks) > 100, `receding band thinning into its trail must not hide rear marks (${tag})`);
  for (const depth of [0.2, 0.45]) {
    const contactAngle = ang(depth);
    const flat = shot({ contactAngle }, {}), flatNoTicks = shot({ contactAngle, ticksH: false }, {});
    assert(delta([flat.zone[0]], [flatNoTicks.zone[0]]) > 150, `flattening band must not hide rear marks (${tag}, depth ${depth})`);
  }
  // See-through dish (surfaceFill 0): the rim is drawn over the mark, not erased by it.
  const open = shot({ surfaceFill: 0 }, {}), openNoTicks = shot({ surfaceFill: 0, ticksH: false }, {});
  const kept = delta([open.rim], [openNoTicks.rim]), tick = delta([openNoTicks.rim], [black]);
  assert(tick > 100 && kept < 0.4 * tick, `rim must stay on top of rear marks (${tag}: moved ${kept} of ${tick})`);
  const fillA = shot({ surfaceFill: 0.49 }, {}), fillB = shot({ surfaceFill: 0.51 }, {});
  assert(delta(fillA.f, fillB.f) <= 17, `rear marks must follow the fill opacity without a jump (${tag})`);
  // The band overlaps the body by edgeSoft/2: the blick on the first body pixel inside the profile is also
  // kept over a black mark, whatever the liquid's transparency. The blick tent is taller than the body's
  // highlight strip, so it shows on that pixel a few rows off the highlight row: take the row where it does.
  const glossy = { surfaceFill: 0, surfaceRim: 0, surfaceBlick: 1, liquidTransparency: 1 };
  const innerAt = (f, row) => { const xmr = b.xm[side][row], xr = side === 0 ? Math.ceil(xmr) - 1 : Math.ceil(xmr); return f[row * 536 + (b.mirror ? b.L - 1 - xr : xr)]; };
  const gl = shot(glossy, {}), glNoTicks = shot({ ...glossy, ticksH: false }, {}), glNoBlick = shot({ ...glossy, ticksH: false, surfaceBlick: 0 }, {});
  let row = 30, blick = 0;
  for (let r = 15; r <= 45; r++) { const d = delta([innerAt(glNoTicks.f, r)], [innerAt(glNoBlick.f, r)]); if (d > blick) { blick = d; row = r; } }
  const inner = (sh) => innerAt(sh.f, row);
  const keptB = delta([inner(gl)], [inner(glNoTicks)]), tickB = delta([inner(glNoTicks)], [black]);
  assert(blick > 30, `test scene must put a blick on the first body pixel (${tag}: ${blick})`);
  assert(keptB < 0.75 * tickB, `blick must stay on top of rear marks inside the softened edge (${tag}: moved ${keptB} of ${tickB})`);
}
// Parity scenes with the blick and a see-through fill over ordinary marks (both edges' bands over ticks and
// digits): the mark compositor's wet/dry mix must round once, like the firmware.
for (const remaining of [false, true])
  render(`marks-blick-${remaining}`, { ...marks, ticksH: true, ticksM: true, tickStepH: 1, remaining,
    surfaceFill: 0.35, surfaceBlick: 0.8, liquidTransparency: 0.5 });
render('marks-blick-moving', { ...marks, ticksH: true, ticksM: true, tickStepH: 1, surfaceFill: 0.35, surfaceBlick: 0.8, liquidTransparency: 0.5 },
  { edgeLight: 0.4, acrossTilt: -0.2, cap: 3, fillVel: -30 });
const gradient = render('gradient', { surfaceRim: 0 });
assert(new Set(gradient.slice(30 * 536 + 400, 30 * 536 + 406)).size >= 4, 'surface needs shading across its width');
const covered = render('opaque-residue', { traces: true, traceAmount: 2 }, {}, base, true);
for (let x = 400; x < 406; x++) assert.equal(covered[30 * 536 + x], symmetric[30 * 536 + x], 'opaque surface must cover residue');
for (const film of [0.1, 0.5, 0.9]) render('settling-' + film, { traces: true, wetFilm: 15 }, { filmFree: film, filmHome: film }, base, true);
for (const angle of [0, 45, 89.9, 90, 90.1, 140, 180]) for (const remaining of [false, true])
  render(`angle-${angle}-${remaining}`, { contactAngle: angle, remaining }, { edgeLight: 0.4, acrossTilt: -0.2, cap: 3 });
// Hysteresis band under tilt pressure, and moving lines (advancing / receding, Cox–Voinov) at both ends.
for (const angle of [30, 140]) for (const remaining of [false, true])
  for (const [tag, state] of [['tilt', { edgeLight: 0.6, acrossTilt: 0.5 }], ['slide', { slugVel: 40, fillVel: -10, cap: -2 }]])
    render(`contact-${angle}-${remaining}-${tag}`, { contactAngle: angle, contactHyst: 12, contactDyn: 20, remaining }, state);
for (const n of ['cryo', 'olive-oil', 'blood', 'mercury']) {
  const preset = { ...DEFAULT_PARAMS, ...migrateParams(JSON.parse(fs.readFileSync(path.join(root, 'presets', n + '.json')))),
    fizz: false, bubble: false, digits: false, ticksH: false, ticksM: false, hoursY: 0 };
  render(n + '-settled', {}, {}, preset);
  render(n + '-moving', {}, { edgeLight: 0.4, cap: 2, filmHome: 0.6 }, preset, true);
}
for (const H of [4, 80]) for (const fill of [0, 0.001, 1])
  render(`limit-${H}-${fill}`, { tubeHeight: H }, { fillTarget: fill, slugPos: 0 });
// Reported white trailing crescent: white tube back, strong tilt bulge, remaining mode.
// A reversal can make the receding edge convex while the previous wet film is still up.
const trailingPreset = { ...DEFAULT_PARAMS,
  ...migrateParams(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/meniscus-trailing.json')))),
  fizz: false, bubble: false, digits: false, ticksH: false, ticksM: false };
// If the wet film is fully developed, the inner half of the body AA and the film
// are the same liquid colour. Their junction must not expose the white tube back.
for (const remaining of [false, true]) {
  const changes = { remaining, surfaceBand: 0, lens: 0 };
  const p = { ...trailingPreset, ...changes };
  const joined = render(`wet-junction-${remaining}`, changes, { filmHome: 1, filmFree: 1 }, trailingPreset, true);
  const pal = R.buildPalette(p, 0);
  for (const row of [15, 25, 30, 40]) {
    const left = Math.floor(R.edgeXL(row, 134, 0, p) - 0.5) + 1;
    const right = Math.ceil(R.edgeX(row, 402, 0, p) - 0.5) - 1;
    for (const x of [left, right]) assert.equal(joined[row * 536 + (remaining ? 535 - x : x)], pal.rows[row],
      'liquid/wet-film junction must not leak white background through overlapping alpha ramps');
  }
}
function half(frame, right) {
  const a = [];
  for (let y = 0; y < trailingPreset.tubeHeight; y++)
    for (let x = right ? 268 : 0; x < (right ? 536 : 268); x++) a.push(frame[y * 536 + x]);
  return a;
}
// A wide glow must not move the nose's backing off the wet trail (the sample is taken before the glow).
for (const remaining of [false, true]) for (const home of [false, true]) for (const edgeGlow of [0, 12]) {
  const sign = (remaining ? -1 : 1) * (home ? -1 : 1);
  const state = { edgeLight: sign * 0.65, cap: sign * 12, acrossTilt: 0.25, angle: 3,
    slugVel: -sign * 80, filmHome: home ? 1 : 0, filmFree: home ? 0 : 1 };
  const key = `trailing-${remaining}-${home}-glow${edgeGlow}`, glow = { edgeGlow, glowStrength: 0.6 };
  const on = render(key, { remaining, ...glow }, state, trailingPreset, true);
  const off = render(key + '-disabled', { remaining, ...glow, surfaceBand: 0 }, state, trailingPreset, true);
  const right = home === remaining;
  // The nose stays (motion never fades a surface) but thins toward the wet film behind it, not
  // the white back: only the clear liquid's faint highlight tint may remain.
  assert(delta(half(on, right), half(off, right)) <= 9,
    'receding convex surface must not add a white crescent over the wet film');
  assert(delta(half(on, !right), half(off, !right)) > 9, 'advancing surface must remain visible');
}
for (const remaining of [false, true]) for (const edgeGlow of [0, 5]) {
  const bead = render(`wet-bead-${remaining}-${edgeGlow}`,
    { remaining, edgeGlow, traces: true, traceFilm: 0, contactAngle: 90, surfaceBand: 0 },
    { fillTarget: remaining ? 1 - 2 / 536 : 2 / 536, slugPos: 267 }, base);
  for (let y = 0; y < 61; y++) for (let x = 263; x < 268; x++)
    assert.equal(bead[y * 536 + x], bead[y * 536 + 535 - x], 'overlapping AA ramps must composite a bead symmetrically');
}
fs.writeFileSync(path.join(out, 'jobs.json'), JSON.stringify(jobs));
console.log(`Meniscus: symmetry, subpixel motion, flattening, residue, receding edge, gradient passed; ${jobs.length} parity scenes.`);
