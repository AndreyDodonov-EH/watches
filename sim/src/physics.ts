// Fixed-timestep (50 Hz) liquid dynamics — two spring-dampers per tube.
// Mirrors what the firmware will run. No rendering here.
import type { Params } from './params';
import { TUBE_LENGTH_PX } from '../../spec/layout';

export const PHYS_HZ = 50;
export const PHYS_DT = 1 / PHYS_HZ;

/** Input in the tube's frame (already mapped from IMU axes via spec/layout IMU_* constants). */
export interface TiltInput {
  along: number;  // g, +1 = right end of the tube is down (liquid wants to flow right)
  across: number; // g, +1 = far (top) edge up
  gyroAlong: number; // deg/s rotation rate about the along-tube axis... (rolling the tube)
  gyroAcross: number; // deg/s rotation about the across axis (tilting left/right end up/down) — drives slosh
}

// The liquid is a viscous column pinned by capillarity in a thin sealed tube: tilting and
// shaking may only nudge the fill edge and shift the light, never relocate the column.
// These are hard caps applied on top of whatever the params say, so no gain/filter tuning
// can ever make the liquid run off the end of the tube. Ported to firmware as-is.
export const FILL_SLOSH_MAX_PX = 30;  // |fillPos| cap
export const ANGLE_HARD_MAX_DEG = 20; // |angle| cap (params.angleMax tightens it, never widens)
export const LIGHT_MAX_DEG = 85;      // |light| cap
export const CAP_DYN_MAX_PX = 12;     // |cap| cap: dynamic meniscus bulge / hollow
export const FILM_FULL_PX_S = 25;     // edge speed (px/s) at which the trailing wet film is fully drawn
export const TRACE_DEPOSIT_MAX_PX = 32; // max px of newly exposed glass per tick that gets a fresh deposit
export const TRACE_FULL = 0xff00;      // fresh deposit (8.8 fixed point; the high byte is what renders)
export const TRACE_MIN = 2 << 8;       // residue below this counts as dry (buffer empties)
export const TRACE_FOLLOW_REF_PX = 25; // distance at which traceFollow is the drain-back rate (1/s)
export const TRACE_TILT_DRY = 4;       // drying accelerates up to (1 + this)× as |along-tilt| → 1 (film drains when tilted)
export const TRACE_THIN_REF_PX_S = 100; // edge speed at which traceThin halves the deposit (film stretches thin when smeared fast)

export interface TubeState {
  fillTarget: number;  // 0..1 from time
  fillPos: number;     // px offset of the edge relative to target (slosh), spring toward 0
  fillVel: number;
  angle: number;       // deg, in-plane front skew (+ = bottom contact line leads); follows across-tilt
  angleVel: number;
  light: number;       // deg, highlight surface-normal angle in the tube cross-section (0 = centre row, + = toward the top edge); spring toward lightRest()
  lightVel: number;
  agitation: number;   // 0..1, gyro energy with fast attack / slow decay: fizz speed, edge glow
  edgeLight: number;   // -1..1, slow along-tilt follower — brightens/dims the fill edge (render only)
  acrossTilt: number;  // -1..1, slow across-tilt follower — meniscus sag toward the low wall (render only)
  // Meniscus dynamics: the wall contact lines are pinned by capillarity, the free surface between
  // them is not. `cap` = px the surface centre leads the contact lines in +x (panel frame): an
  // impulse bulges it ahead (inertia), a moving edge drags its contact lines behind (hysteresis).
  cap: number;
  capVel: number;
  // Trailing wet film 0..1 left on the glass by a receding edge (drains away in ~0.5 s).
  filmFree: number;    // the time edge receding toward its home end
  filmHome: number;    // the home edge (free-liquid only) receding toward the time edge
  // Dried traces: residue 0..TRACE_FULL (8.8 fixed point) per panel-frame column, deposited where
  // an edge receded (blood smears the wall, syrup coats it); its wet part drains back toward the
  // liquid, the stain dries out (params.traceFollow / traceDry).
  // Owned by the tube (newTube allocates; firmware: one static buffer per tube).
  trace: Uint16Array;
  traceLo: number;     // occupied residue columns [traceLo, traceHi): deposits widen, decay shrinks.
  traceHi: number;     // lo >= hi = empty; physics and render skip the buffer entirely then.
  xtPrev: number;      // panel-frame time-edge x at the previous tick (deposit tracking)
  xhPrev: number;      // panel-frame home-edge x at the previous tick
  traceInit: boolean;  // false until the first step primed the prev positions
  // Free liquid: the column is a slug that slides along the tube; `slugPos` = px of its home-end
  // edge from the tube's left end (panel frame), 0 when pinned. `reading` 1 = the pose pull holds
  // it home so the time edge is true; 0 = free.
  slugPos: number;
  slugVel: number;
  reading: number;
  motion: number;      // 0..1 gyro-energy follower with slow decay: "a turn was just made"
  armed: boolean;      // a turn was made and not yet consumed by a read
  readTimer: number;   // s left of the current read
}

export function newTube(): TubeState {
  return { fillTarget: 0, fillPos: 0, fillVel: 0, angle: 0, angleVel: 0, light: 0, lightVel: 0, agitation: 0, edgeLight: 0, acrossTilt: 0,
    cap: 0, capVel: 0, filmFree: 0, filmHome: 0,
    trace: new Uint16Array(TUBE_LENGTH_PX), traceLo: TUBE_LENGTH_PX, traceHi: 0, xtPrev: 0, xhPrev: 0, traceInit: false,
    slugPos: 0, slugVel: 0, reading: 1, motion: 0, armed: false, readTimer: 0 };
}

/** Per-column unevenness of the dried traces: the high 16 bits scatter the decay rates, the low 16
 *  the stain floor. The integer hash must match firmware/src/physics.cpp exactly (and is salted
 *  differently from the renderer's traceStreak, so opacity striations and dissolve don't line up). */
function traceUneven(n: number): number {
  let h = (Math.imul(n ^ 0x27d4eb2f, 2654435761) + 0x9e3779b9) | 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
  return h >>> 0;
}

/** Length of the liquid column, px. */
export function columnLen(fillTarget: number, p: Params): number {
  return (p.remaining ? 1 - fillTarget : fillTarget) * TUBE_LENGTH_PX;
}

/** Highlight angle the light settles at. Physical: the light is world-up; its direction in the
 *  tube cross-section is atan2(across, normal) and a specular seen along the normal sits at half
 *  that angle. Face up → centre row; roll toward the top edge → highlight climbs toward it.
 *  Blended with the fixed style angle `lightAngle` by `lightPhys`. */
export function lightRest(along: number, across: number, p: Params): number {
  const n = Math.sqrt(Math.max(0, 1 - along * along - across * across));
  const phys = (Math.atan2(across, n) * 180) / Math.PI / 2;
  return p.lightAngle + (phys - p.lightAngle) * p.lightPhys;
}

function dz(v: number, d: number): number {
  return Math.abs(v) < d ? 0 : v - Math.sign(v) * d;
}

export function stepTube(s: TubeState, inp: TiltInput, p: Params, dt = PHYS_DT): void {
  const along = dz(inp.along, p.deadzone);
  const across = dz(inp.across, p.deadzone);

  // Fill-edge slosh: static offset proportional to along-tilt; spring returns to rest.
  const fillRest = Math.max(-FILL_SLOSH_MAX_PX, Math.min(FILL_SLOSH_MAX_PX, along * p.fillSloshGain));
  const fillKick = inp.gyroAcross * p.angleGyroGain * 4; // quick flicks kick the edge
  const fillAcc = -p.fillK * (s.fillPos - fillRest) - p.fillDamp * s.fillVel + fillKick;
  s.fillVel += fillAcc * dt;
  s.fillPos += s.fillVel * dt;
  if (s.fillPos > FILL_SLOSH_MAX_PX) { s.fillPos = FILL_SLOSH_MAX_PX; s.fillVel = Math.min(0, s.fillVel); }
  if (s.fillPos < -FILL_SLOSH_MAX_PX) { s.fillPos = -FILL_SLOSH_MAX_PX; s.fillVel = Math.max(0, s.fillVel); }

  // Reading gesture: a turn (gyro energy above readTurn) followed by the reading pose — face up,
  // tube level — starts a read of readHold seconds; leaving the pose ends it. readTurn <= 0: the
  // pose alone reads. Pinned liquid is always "reading".
  const turn = Math.abs(inp.gyroAlong) + Math.abs(inp.gyroAcross);
  const motionT = p.readTurn <= 0 ? 1 : Math.min(1, turn / p.readTurn);
  s.motion += (motionT - s.motion) * Math.min(1, (motionT > s.motion ? 20 : 1.5) * dt);
  const faceUp = Math.sqrt(Math.max(0, 1 - along * along - across * across));
  const inPose = faceUp >= p.readFaceUp && Math.abs(along) <= p.readAlongMax;
  if (s.motion > 0.5) s.armed = true;
  if (!inPose) s.readTimer = 0;
  else if (s.armed && s.motion < 0.25) { s.armed = false; s.readTimer = p.readHold; }
  s.readTimer = Math.max(0, s.readTimer - dt);
  s.reading += ((!p.freeLiquid || s.readTimer > 0 ? 1 : 0) - s.reading) * Math.min(1, 4 * dt);

  // Free liquid: the slug slides under the along component of gravity with viscous drag and
  // bounces off the tube ends; while reading, a critically damped pull parks it at its home end.
  const travel = Math.max(0, TUBE_LENGTH_PX - columnLen(s.fillTarget, p));
  const home = p.remaining ? travel : 0;
  let slugAcc = 0;
  if (!p.freeLiquid) { s.slugPos = home; s.slugVel = 0; }
  else {
    slugAcc = along * p.freeGain - p.freeDamp * s.slugVel
      + s.reading * (-p.freeHomeK * (s.slugPos - home) - 2 * Math.sqrt(p.freeHomeK) * s.slugVel);
    const v0 = s.slugVel;
    s.slugVel += slugAcc * dt;
    s.slugPos += s.slugVel * dt;
    // At an end the wall carries the load (no forcing on the surface); the hit itself is an impulse.
    if (s.slugPos <= 0 || s.slugPos >= travel) {
      const hit = s.slugPos <= 0 ? s.slugVel < 0 : s.slugVel > 0;
      s.slugPos = s.slugPos <= 0 ? 0 : travel;
      if (hit) s.slugVel = -s.slugVel * p.freeBounce;
      slugAcc = hit ? (s.slugVel - v0) / dt * 0.25 : 0;
    }
  }

  // Meniscus dynamics (panel frame, +x): the surface centre is pushed ahead of the pinned contact
  // lines by the forcing on the edge — the flick kick and the slug's acceleration, not the fill
  // spring's own restoring force, which is what keeps the column pinned — and by the edge's velocity
  // (contact-angle hysteresis: an advancing line lags, a receding one clings); springs back with a wobble.
  const edgeVel = s.fillVel + s.slugVel, edgeAcc = fillKick + slugAcc;
  const capRest = p.contactLag * edgeVel * 0.1;
  const capAcc = -p.meniscusK * (s.cap - capRest) - p.meniscusDamp * s.capVel + p.meniscusInertia * edgeAcc;
  s.capVel += capAcc * dt;
  s.cap += s.capVel * dt;
  if (s.cap > CAP_DYN_MAX_PX) { s.cap = CAP_DYN_MAX_PX; s.capVel = Math.min(0, s.capVel); }
  if (s.cap < -CAP_DYN_MAX_PX) { s.cap = -CAP_DYN_MAX_PX; s.capVel = Math.max(0, s.capVel); }

  // Wet film: fast attack while an edge recedes (moves toward the liquid), slow drain.
  const recede = p.remaining ? 1 : -1;   // panel-frame direction the time edge moves when receding
  const filmT = (v: number): number => Math.max(0, Math.min(1, v / FILM_FULL_PX_S));
  const follow = (cur: number, target: number): number => cur + (target - cur) * Math.min(1, (target > cur ? 15 : 2) * dt);
  s.filmFree = follow(s.filmFree, filmT(recede * edgeVel));
  s.filmHome = follow(s.filmHome, p.freeLiquid ? filmT(-recede * s.slugVel) : 0);

  // Dried traces: the mid-row edges the renderer draws (meniscus detail skipped — the residue is
  // behind the contact line anyway), in the panel frame. An edge that receded deposits saturated
  // residue on the columns it uncovered. The wet part of that smear (value above a per-column stain
  // floor) then drains back toward the liquid — pull rate grows with distance from the liquid span,
  // so the tail of the band collapses first and the residue visibly follows a receded edge — and
  // the stain it leaves dries out over traceDry. A per-column hash scatters both the rates and the
  // stain floor: the smear dissolves unevenly, patches linger. Toggling off empties the buffer.
  if (p.traces) {
    const len = columnLen(s.fillTarget, p);
    const fp = Math.max(-len, Math.min(len, s.fillPos));
    const xt = p.remaining ? s.slugPos + fp : (p.freeLiquid ? s.slugPos : 0) + len + fp;
    const xh = p.remaining ? len + s.slugPos : p.freeLiquid ? s.slugPos : 0;
    if (!s.traceInit) s.traceInit = true;
    else {
      // the time edge recedes toward -x when filling (!remaining), toward +x when draining;
      // the home edge only moves for a free slug and recedes the opposite way. The deposit thins
      // with the edge's speed (traceThin): a fast sweep stretches the film, so the far end of a
      // slosh smear comes out faint and the residue densifies toward where the edge slowed down —
      // i.e. toward the liquid.
      const dep = (a: number, b: number): void => {
        if (b <= a) return;
        const v = Math.max(TRACE_MIN + 1, Math.round(TRACE_FULL / (1 + p.traceThin * ((b - a) / dt) / TRACE_THIN_REF_PX_S)));
        const lo = Math.max(0, Math.round(a)), hi = Math.min(TUBE_LENGTH_PX, Math.round(a + Math.min(b - a, TRACE_DEPOSIT_MAX_PX)));
        for (let x = lo; x < hi; x++) s.trace[x] = v;
        if (hi > lo) { if (lo < s.traceLo) s.traceLo = lo; if (hi > s.traceHi) s.traceHi = hi; }
      };
      if (p.remaining) dep(s.xtPrev, xt); else dep(xt, s.xtPrev);
      if (p.freeLiquid) { if (p.remaining) dep(xh, s.xhPrev); else dep(s.xhPrev, xh); }
    }
    s.xtPrev = xt; s.xhPrev = xh;
    // Linearised rates (dt·rate ≪ 1 always: caps below). Math.floor, not round-to-nearest — with a
    // slow traceDry the per-tick decrement is under half an LSB and rounding would stall forever;
    // floor keeps the decay monotone (worst case 1 LSB/tick ⇒ even the faintest stain clears).
    const lo = Math.min(xt, xh), hi = Math.max(xt, xh);
    const dryTilt = 1 + TRACE_TILT_DRY * Math.abs(along);   // a tilted tube drains its film faster
    const dryK = Math.min(0.5, dt * dryTilt / Math.max(0.05, p.traceDry)), folK = p.traceFollow * dt / TRACE_FOLLOW_REF_PX;
    let nLo = TUBE_LENGTH_PX, nHi = 0;   // the occupied range re-tightens as columns dry out
    for (let x = s.traceLo; x < s.traceHi; x++) {
      let v = s.trace[x];
      if (!v) continue;
      const h = traceUneven(x), u = 0.75 + 0.5 * ((h >>> 16) / 65535);
      const stain = TRACE_FULL * p.traceStain * (0.7 + 0.3 * ((h & 0xffff) / 65535));
      const dist = x < lo ? lo - x : x > hi ? x - hi : 0;
      // two phases: the wet excess settles ONTO the stain (drain-back + drying), and only the
      // stain itself dries toward zero — so traceStain is the plateau the fade visibly pauses at
      if (v > stain) v = stain + (v - stain) * Math.max(0, 1 - u * (folK * dist + dryK));
      else v *= 1 - u * dryK;
      if (v < TRACE_MIN) { s.trace[x] = 0; continue; }
      s.trace[x] = Math.floor(v);
      if (x < nLo) nLo = x;
      nHi = x + 1;
    }
    s.traceLo = nLo; s.traceHi = nHi;
  } else if (s.traceInit) { s.traceInit = false; s.trace.fill(0); s.traceLo = TUBE_LENGTH_PX; s.traceHi = 0; }

  // Front skew: the screen is the tube's cross-section plane, so only the across component of
  // gravity (the one fizz rises against) tilts the front on screen. Along-tilt is out of plane.
  const aMax = Math.min(p.angleMax, ANGLE_HARD_MAX_DEG);
  const angleRest = Math.max(-aMax, Math.min(aMax, across * p.angleTiltGain));
  const angleAcc = -p.angleK * (s.angle - angleRest) - p.angleDamp * s.angleVel;
  s.angleVel += angleAcc * dt;
  s.angle += s.angleVel * dt;
  if (s.angle > aMax) { s.angle = aMax; s.angleVel = Math.min(0, s.angleVel); }
  if (s.angle < -aMax) { s.angle = -aMax; s.angleVel = Math.max(0, s.angleVel); }

  // Light: a full-bore pinned column does not move under roll; roll moves only the light.
  // Spring toward the rest angle, kicked by roll rate (gyro about the tube axis).
  const rest = lightRest(along, across, p);
  const lightAcc = -p.acrossK * (s.light - rest) - p.acrossDamp * s.lightVel + inp.gyroAlong * p.acrossGyroGain * 10;
  s.lightVel += lightAcc * dt;
  s.light += s.lightVel * dt;
  if (s.light > LIGHT_MAX_DEG) { s.light = LIGHT_MAX_DEG; s.lightVel = Math.min(0, s.lightVel); }
  if (s.light < -LIGHT_MAX_DEG) { s.light = -LIGHT_MAX_DEG; s.lightVel = Math.max(0, s.lightVel); }

  // Agitation: fast attack on gyro energy, slow decay.
  const shake = Math.min(1, ((Math.abs(inp.gyroAcross) + Math.abs(inp.gyroAlong)) / 200) * p.shakeGain);
  s.agitation += (shake - s.agitation) * Math.min(1, (shake > s.agitation ? 20 : 2) * dt);

  // Edge light: slow follower of along-tilt. +1 = gravity presses the liquid into the right
  // end (edge glows brighter), -1 = drains away from it (edge dims). Consumed by the renderer.
  s.edgeLight += (Math.max(-1, Math.min(1, along)) - s.edgeLight) * Math.min(1, 5 * dt);
  s.acrossTilt += (Math.max(-1, Math.min(1, across)) - s.acrossTilt) * Math.min(1, 5 * dt);
}

/** Continuous fill levels per the layout spec. */
export function fillLevels(d: Date): { hours: number; minutes: number } {
  const h = d.getHours() % 12, m = d.getMinutes(), s = d.getSeconds() + d.getMilliseconds() / 1000;
  return { hours: (h + (m + s / 60) / 60) / 12, minutes: (m + s / 60) / 60 };
}

/** Tracks the magnitude of gravity as the sensor reports it (this QMI8658 reads ~0.94 g at rest).
 *  Normalising each sample by its own instantaneous |a| amplifies transients enormously — |a| dips
 *  toward 0 during the jerk/free-fall phase of any hand movement, so dividing by it multiplies the
 *  noise 3-5x. Divide by this slow EMA instead, floored so the divisor can never blow the signal up.
 *  Same maths goes into the firmware. */
export class GravityNorm {
  private mag = 1;
  private init = false;
  reset(): void { this.init = false; }
  /** Feed |a| of the current sample, get the divisor to use for it. */
  update(n: number): number {
    if (!this.init) { this.mag = n > 0.5 ? n : 1; this.init = true; }
    else this.mag += (n - this.mag) * 0.01; // tau ~2 s at 50 Hz: tracks sensor scale error, not motion
    return Math.max(0.5, this.mag);
  }
}

/** IMU conditioning: accel low-pass (gravity), gyro high-pass + deadzone + clamp (transients only).
 *  The accel path is two cascaded one-poles (12 dB/oct): a single pole lets enough of a sharp
 *  wrist-jerk spike through to visibly kick the springs. One-pole maths; same goes into firmware. */
export const GYRO_LP_HZ = 12; // smooths both gyro outputs: sensor noise otherwise twitches fizz/agitation
export class ImuFilter {
  private lpAlong = 0; private lpAcross = 0;   // stage 1
  private lpAlong2 = 0; private lpAcross2 = 0; // stage 2
  private hpPrevIn = 0; private hpPrevOut = 0;
  private lpGyroAcross = 0; private lpGyroAlong = 0;
  private init = false;
  reset(): void { this.init = false; this.hpPrevIn = this.hpPrevOut = 0; this.lpGyroAcross = this.lpGyroAlong = 0; }
  step(raw: TiltInput, p: Params, dt = PHYS_DT): TiltInput {
    // A tilt (gravity direction) can never exceed 1 g — anything beyond is linear acceleration.
    // Clip before filtering so a hard knock carries bounded energy into the springs.
    const inAlong = Math.max(-1.2, Math.min(1.2, raw.along));
    const inAcross = Math.max(-1.2, Math.min(1.2, raw.across));
    if (!this.init) {
      this.lpAlong = this.lpAlong2 = inAlong; this.lpAcross = this.lpAcross2 = inAcross;
      this.hpPrevIn = raw.gyroAcross; this.init = true;
    }
    const a = 1 - Math.exp(-2 * Math.PI * p.accelLpHz * dt);
    this.lpAlong += (inAlong - this.lpAlong) * a;
    this.lpAcross += (inAcross - this.lpAcross) * a;
    this.lpAlong2 += (this.lpAlong - this.lpAlong2) * a;
    this.lpAcross2 += (this.lpAcross - this.lpAcross2) * a;
    let g: number;
    if (p.gyroHpHz <= 0) g = raw.gyroAcross;
    else {
      const rc = 1 / (2 * Math.PI * p.gyroHpHz), k = rc / (rc + dt);
      g = k * (this.hpPrevOut + raw.gyroAcross - this.hpPrevIn);
      this.hpPrevIn = raw.gyroAcross; this.hpPrevOut = g;
    }
    const cond = (v: number): number => {
      v = Math.abs(v) < p.gyroDeadzone ? 0 : v - Math.sign(v) * p.gyroDeadzone;
      return Math.max(-p.gyroMax, Math.min(p.gyroMax, v));
    };
    const gl = 1 - Math.exp(-2 * Math.PI * GYRO_LP_HZ * dt);
    this.lpGyroAcross += (cond(g) - this.lpGyroAcross) * gl;
    this.lpGyroAlong += (cond(raw.gyroAlong) - this.lpGyroAlong) * gl;
    return { along: this.lpAlong2 * p.inputGain, across: this.lpAcross2 * p.inputGain, gyroAlong: this.lpGyroAlong * p.inputGain, gyroAcross: this.lpGyroAcross * p.inputGain };
  }
}
