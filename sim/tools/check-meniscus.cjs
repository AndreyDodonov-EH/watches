// Full-render regression checks. Invoked by firmware/tools/check_meniscus.py.
const fs = require('fs');
const assert = require('assert/strict');
const path = require('path');
const [cache, out, root] = process.argv.slice(2);
const R = require(path.join(cache, 'sim/src/render.js'));
const { DEFAULT_PARAMS } = require(path.join(cache, 'sim/src/params.js'));
const { newTube } = require(path.join(cache, 'sim/src/physics.js'));
const jobs = [];
const base = { ...DEFAULT_PARAMS, tubeHeight: 61, hoursY: 0, minutesY: 100,
  freeLiquid: true, remaining: false, meniscusDepth: 12, meniscusPow: 2,
  meniscusLens: 0, meniscusTiltGain: 1, surfaceBand: 0.8, surfaceRim: 0.8,
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
const flatA = render('flatten-before', { meniscusDepth: 0.49 });
const flatB = render('flatten-after', { meniscusDepth: 0.51 });
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
// Rear marks: a band counts as liquid for the mark compositor only where it is >= 0.5 opaque. At rest
// the whole stroke does; a fast-receding edge's band thins into its trail and must not. Both edges,
// both fill directions (bounds are in the panel frame, mirrored when remaining).
const markScene = { ...marks, ticksH: true, ticksM: true, tickStepH: 1, digitParallax: 4 };
for (const remaining of [false, true]) for (const home of [false, true]) {
  const recede = remaining ? 1 : -1;
  const moving = home ? { slugVel: -recede * 30 } : { fillVel: recede * 30 };
  const ext = (changes, state) => {
    render(`marks-${remaining}-${home}-${JSON.stringify(state)}-${JSON.stringify(changes)}`, { ...markScene, remaining, ...changes }, state);
    return { lo: R.markBounds[0].lo[30], hi: R.markBounds[0].hi[30] };
  };
  const side = (b) => (home !== remaining ? -b.lo : b.hi);   // bound of the edge under test, outward positive
  const noBand = side(ext({ surfaceBand: 0 }, moving)), rest = side(ext({}, {})) - side(ext({ surfaceBand: 0 }, {}));
  const pulled = side(ext({}, moving)) - noBand;
  assert(rest > 3, `settled band must count as liquid for rear marks (${remaining}/${home}: ${rest})`);
  assert(pulled <= 1.5, `receding band thinning into its trail must not hide rear marks (${remaining}/${home}: ${pulled})`);
  // Flattening (meniscus wobble): with the ring a fraction of a px off the profile the band is drawn at
  // opacity strokeA·tw < 0.5 — no visible colour — so it must not count as liquid for the marks either.
  for (const meniscusDepth of [0.2, 0.45]) {
    const flat = side(ext({ meniscusDepth }, {})) - side(ext({ meniscusDepth, surfaceBand: 0 }, {}));
    assert.equal(flat, 0, `flattening band must not hide rear marks (${remaining}/${home}, depth ${meniscusDepth})`);
  }
}
const gradient = render('gradient', { surfaceRim: 0 });
assert(new Set(gradient.slice(30 * 536 + 400, 30 * 536 + 406)).size >= 4, 'surface needs shading across its width');
const covered = render('opaque-residue', { traces: true, traceAmount: 2 }, {}, base, true);
for (let x = 400; x < 406; x++) assert.equal(covered[30 * 536 + x], symmetric[30 * 536 + x], 'opaque surface must cover residue');
for (const film of [0.1, 0.5, 0.9]) render('settling-' + film, { traces: true, wetFilm: 15 }, { filmFree: film, filmHome: film }, base, true);
for (const depth of [-30, -0.1, 0, 0.1, 40]) for (const remaining of [false, true])
  render(`depth-${depth}-${remaining}`, { meniscusDepth: depth, remaining }, { edgeLight: 0.4, acrossTilt: -0.2, cap: 3 });
for (const n of ['cryo', 'olive-oil', 'blood', 'mercury']) {
  const preset = { ...DEFAULT_PARAMS, ...JSON.parse(fs.readFileSync(path.join(root, 'presets', n + '.json'))),
    fizz: false, bubble: false, digits: false, ticksH: false, ticksM: false, hoursY: 0 };
  render(n + '-settled', {}, {}, preset);
  render(n + '-moving', {}, { edgeLight: 0.4, cap: 2, filmHome: 0.6 }, preset, true);
}
for (const H of [4, 80]) for (const fill of [0, 0.001, 1])
  render(`limit-${H}-${fill}`, { tubeHeight: H }, { fillTarget: fill, slugPos: 0 });
// Reported white trailing crescent: white tube back, strong tilt bulge, remaining mode.
// A reversal can make the receding edge convex while the previous wet film is still up.
const trailingPreset = { ...DEFAULT_PARAMS,
  ...JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/meniscus-trailing.json'))),
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
    { remaining, edgeGlow, traces: true, traceFilm: 0, meniscusDepth: 0, surfaceBand: 0 },
    { fillTarget: remaining ? 1 - 2 / 536 : 2 / 536, slugPos: 267 }, base);
  for (let y = 0; y < 61; y++) for (let x = 263; x < 268; x++)
    assert.equal(bead[y * 536 + x], bead[y * 536 + 535 - x], 'overlapping AA ramps must composite a bead symmetrically');
}
fs.writeFileSync(path.join(out, 'jobs.json'), JSON.stringify(jobs));
console.log(`Meniscus: symmetry, subpixel motion, flattening, residue, receding edge, gradient passed; ${jobs.length} parity scenes.`);
