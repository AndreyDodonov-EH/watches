// Headless IMU replay check. Feeds realistic QMI8658 traces (rest bias as measured on the
// board 2026-08-20, wrist waves, hard flicks, free-fall dips, sustained 90° tilt, shaking)
// through the exact pipeline the sim uses on Web Serial input:
//   raw sample → axis map + GravityNorm (serial.ts) → ImuFilter → stepTube
// and asserts the liquid can never go crazy: edge deviation from the time-true fill stays
// inside a small window, angle/fillPos respect the hard caps, nothing goes non-finite.
//
// Run:  cd sim && npx tsc tools/replay-check.ts --outDir /tmp/replay-check --module commonjs \
//         --target es2021 --moduleResolution node --esModuleInterop \
//       && node /tmp/replay-check/tools/replay-check.js
// (compiled outside sim/ so package.json "type":"module" doesn't bite the CJS output)
import {
  ANGLE_HARD_MAX_DEG, FILL_SLOSH_MAX_PX, GravityNorm, ImuFilter, PHYS_DT,
  newTube, stepTube, type TiltInput,
} from '../src/physics';
import { DEFAULT_PARAMS } from '../src/params';

// Constants copied from spec/layout.ts + render.ts edgeX so this file needs no '@spec' alias.
const TUBE_LENGTH_PX = 536, TUBE_HEIGHT_PX = 72;
// axis map (spec/layout.ts): along = -ay, across = -ax, gyroAcross = gx
const mapSample = (s: number[], d: number): TiltInput =>
  ({ along: -s[1] / d, across: -s[0] / d, gyroAlong: s[4], gyroAcross: s[3] });
function edgeX(ry: number, xe: number, angleDeg: number, tilt: number): number {
  const yc = (TUBE_HEIGHT_PX - 1) / 2, d = (ry - yc) / yc, P = DEFAULT_PARAMS;
  const asymEff = P.meniscusAsym * Math.max(0, Math.min(1, 0.4 - 0.6 * tilt));
  const depth = P.meniscusDepth * (1 + P.meniscusTiltGain * tilt) * (1 - asymEff * d);
  return xe + Math.tan((angleDeg * Math.PI) / 180) * (ry - yc) + depth * Math.pow(Math.abs(d), P.meniscusPow);
}

// deterministic noise
let seed = 42;
const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };

// Samples are [ax, ay, az, gx, gy, gz] in g / dps, 50 Hz, matching the board's CSV.
// Board at rest (STATUS.md): a ≈ (-0.19, -0.06, +0.92) g (|a| ≈ 0.94), gyro bias ≈ (-1.4, 0, 0.4) dps.
const REST = [-0.19, -0.06, 0.92], GBIAS = [-1.4, 0, 0.4];
const noisy = (a: number[], g: number[], an = 0.01, gn = 0.6): number[] =>
  [a[0] + rnd() * an, a[1] + rnd() * an, a[2] + rnd() * an, g[0] + rnd() * gn, g[1] + rnd() * gn, g[2] + rnd() * gn];

function scenario(name: string, seconds: number, f: (t: number) => number[]): [string, number[][]] {
  const out: number[][] = [];
  for (let i = 0; i < seconds * 50; i++) out.push(f(i * PHYS_DT));
  return [name, out];
}

const scenarios: [string, number[][]][] = [
  scenario('rest 5 s (bias + noise)', 5, () => noisy(REST, GBIAS)),
  // wrist wave: ±50° about the across axis at 1.2 Hz — gravity swings along the tube
  scenario('wrist wave ±50° @1.2 Hz', 6, (t) => {
    const th = (50 * Math.PI / 180) * Math.sin(2 * Math.PI * 1.2 * t);
    const dth = 50 * 2 * Math.PI * 1.2 * Math.cos(2 * Math.PI * 1.2 * t); // deg/s
    return noisy([-0.19, -0.94 * Math.sin(th), 0.94 * Math.cos(th)], [GBIAS[0] + dth, 0, 0.4]);
  }),
  // hard flicks: 60 ms bursts of ±3 g linear accel + ±600 dps once a second
  scenario('flicks 3 g / 600 dps', 6, (t) => {
    const burst = t % 1 < 0.06 ? (Math.floor(t) % 2 ? 1 : -1) : 0;
    return noisy([REST[0], REST[1] + 3 * burst, REST[2]], [GBIAS[0] + 600 * burst, 0, 0.4]);
  }),
  // drop: 150 ms of ~free fall (|a| → 0.05 g) then a 2.5 g catch spike — the case that used
  // to explode with per-sample |a| normalisation
  scenario('free-fall dip + catch', 4, (t) => {
    const ph = t % 2;
    if (ph < 0.15) return noisy([0.01, 0.01, 0.05], [80 * rnd(), 0, 0], 0.005, 20);
    if (ph < 0.21) return noisy([0.3, -2.5, 1.2], [300 * rnd(), 0, 0], 0.05, 30);
    return noisy(REST, GBIAS);
  }),
  // sustained vertical: tube pointing straight down then straight up, 4 s each
  scenario('sustained ±90° tilt', 8, (t) =>
    noisy([-0.1, t < 4 ? -0.94 : 0.94, 0.05], GBIAS)),
  // vigorous shake: 8 Hz ±1.5 g along, ±0.5 g across
  scenario('shake 8 Hz ±1.5 g', 3, (t) =>
    noisy([REST[0] + 0.5 * Math.sin(2 * Math.PI * 8 * t + 1), REST[1] + 1.5 * Math.sin(2 * Math.PI * 8 * t), REST[2]],
      [GBIAS[0] + 200 * Math.cos(2 * Math.PI * 8 * t), 0, 0.4], 0.02, 5)),
];

const p = { ...DEFAULT_PARAMS };
// Max distance the drawn edge may ever sit from the time-true fill edge (px):
// hard slosh cap + tan(hard angle cap)·(H/2) + |meniscus| + 1 px slack.
const EDGE_BUDGET = FILL_SLOSH_MAX_PX + Math.tan((ANGLE_HARD_MAX_DEG * Math.PI) / 180) * (TUBE_HEIGHT_PX / 2)
  + Math.abs(DEFAULT_PARAMS.meniscusDepth) * (1 + DEFAULT_PARAMS.meniscusTiltGain) * (1 + DEFAULT_PARAMS.meniscusAsym) + 1;

let failures = 0;
const fail = (msg: string): void => { failures++; console.error('  FAIL', msg); };

for (const [name, samples] of scenarios) {
  const norm = new GravityNorm(), filt = new ImuFilter();
  const tubes = [newTube(), newTube()];
  tubes[0].fillTarget = 0.5; tubes[1].fillTarget = 0.02; // mid-tube and the fragile near-empty case
  let maxDev = 0, maxAngle = 0, maxFill = 0, maxIn = 0;
  for (const s of samples) {
    const d = norm.update(Math.hypot(s[0], s[1], s[2]));
    const inp = filt.step(mapSample(s, d), p);
    maxIn = Math.max(maxIn, Math.abs(inp.along), Math.abs(inp.across));
    for (const tube of tubes) {
      stepTube(tube, inp, p);
      if (!(isFinite(tube.fillPos) && isFinite(tube.angle) && isFinite(tube.acrossShift) && isFinite(tube.edgeLight)))
        { fail(`${name}: non-finite state`); break; }
      for (const ry of [0, TUBE_HEIGHT_PX >> 1, TUBE_HEIGHT_PX - 1]) {
        const dev = Math.abs(edgeX(ry, tube.fillTarget * TUBE_LENGTH_PX + tube.fillPos, tube.angle, tube.edgeLight) - tube.fillTarget * TUBE_LENGTH_PX);
        maxDev = Math.max(maxDev, dev);
      }
      maxAngle = Math.max(maxAngle, Math.abs(tube.angle));
      maxFill = Math.max(maxFill, Math.abs(tube.fillPos));
    }
  }
  if (maxFill > FILL_SLOSH_MAX_PX + 1e-9) fail(`${name}: fillPos ${maxFill.toFixed(1)} px exceeds cap ${FILL_SLOSH_MAX_PX}`);
  if (maxAngle > ANGLE_HARD_MAX_DEG + 1e-9) fail(`${name}: angle ${maxAngle.toFixed(1)}° exceeds cap ${ANGLE_HARD_MAX_DEG}`);
  if (maxDev > EDGE_BUDGET) fail(`${name}: edge deviation ${maxDev.toFixed(1)} px exceeds budget ${EDGE_BUDGET.toFixed(1)}`);
  if (maxIn > 1.2 * p.inputGain + 1e-9) fail(`${name}: filtered tilt ${maxIn.toFixed(2)} g exceeds clip`);
  console.log(`${failures ? '' : 'ok  '}${name}: edge dev ${maxDev.toFixed(1)} px (budget ${EDGE_BUDGET.toFixed(1)}), angle ${maxAngle.toFixed(1)}°, slosh ${maxFill.toFixed(1)} px, tilt in ${maxIn.toFixed(2)} g`);
}
if (failures) throw new Error(`${failures} failure(s)`);
console.log('all scenarios within bounds');
