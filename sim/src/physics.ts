// Fixed-timestep (50 Hz) liquid dynamics — two spring-dampers per tube.
// Mirrors what the firmware will run. No rendering here.
import type { Params } from './params';

export const PHYS_HZ = 50;
export const PHYS_DT = 1 / PHYS_HZ;

/** Input in the tube's frame (already mapped from IMU axes via spec/layout IMU_* constants). */
export interface TiltInput {
  along: number;  // g, +1 = right end of the tube is down (liquid wants to flow right)
  across: number; // g, +1 = far (top) edge down
  gyroAlong: number; // deg/s rotation rate about the along-tube axis... (rolling the tube)
  gyroAcross: number; // deg/s rotation about the across axis (tilting left/right end up/down) — drives slosh
}

// The liquid is a viscous column pinned by capillarity in a thin sealed tube: tilting and
// shaking may only nudge the fill edge and shift the light, never relocate the column.
// These are hard caps applied on top of whatever the params say, so no gain/filter tuning
// can ever make the liquid run off the end of the tube. Ported to firmware as-is.
export const FILL_SLOSH_MAX_PX = 30;  // |fillPos| cap
export const ANGLE_HARD_MAX_DEG = 20; // |angle| cap (params.angleMax tightens it, never widens)
export const ACROSS_MAX_PX = 40;      // |acrossShift| cap

export interface TubeState {
  fillTarget: number;  // 0..1 from time
  fillPos: number;     // px offset of the edge relative to target (slosh), spring toward 0
  fillVel: number;
  angle: number;       // deg, surface tilt (+ = top of meniscus further right)
  angleVel: number;
  acrossShift: number; // px, spring-damped roll swing: highlight, shading, bubble height
  acrossVel: number;
  agitation: number;   // 0..1, gyro energy with fast attack / slow decay: fizz speed, edge glow
  edgeLight: number;   // -1..1, slow along-tilt follower — brightens/dims the fill edge (render only)
}

export function newTube(): TubeState {
  return { fillTarget: 0, fillPos: 0, fillVel: 0, angle: 0, angleVel: 0, acrossShift: 0, acrossVel: 0, agitation: 0, edgeLight: 0 };
}

function dz(v: number, d: number): number {
  return Math.abs(v) < d ? 0 : v - Math.sign(v) * d;
}

export function stepTube(s: TubeState, inp: TiltInput, p: Params, dt = PHYS_DT): void {
  const along = dz(inp.along, p.deadzone);
  const across = dz(inp.across, p.deadzone);

  // Fill-edge slosh: static offset proportional to along-tilt; spring returns to rest.
  const fillRest = Math.max(-FILL_SLOSH_MAX_PX, Math.min(FILL_SLOSH_MAX_PX, along * p.fillSloshGain));
  const fillAcc = -p.fillK * (s.fillPos - fillRest) - p.fillDamp * s.fillVel
    + inp.gyroAcross * p.angleGyroGain * 4; // quick flicks kick the edge
  s.fillVel += fillAcc * dt;
  s.fillPos += s.fillVel * dt;
  if (s.fillPos > FILL_SLOSH_MAX_PX) { s.fillPos = FILL_SLOSH_MAX_PX; s.fillVel = Math.min(0, s.fillVel); }
  if (s.fillPos < -FILL_SLOSH_MAX_PX) { s.fillPos = -FILL_SLOSH_MAX_PX; s.fillVel = Math.max(0, s.fillVel); }

  // Surface angle: rest angle follows along-tilt; gyro about the across axis gives impulses.
  const aMax = Math.min(p.angleMax, ANGLE_HARD_MAX_DEG);
  const lever = along * Math.sqrt(Math.max(0, 1 - along * along));   // gravity torque on the front: 0 when vertical
  const angleRest = Math.max(-aMax, Math.min(aMax, lever * p.angleTiltGain));
  const angleAcc = -p.angleK * (s.angle - angleRest) - p.angleDamp * s.angleVel
    + inp.gyroAcross * p.angleGyroGain * 10;
  s.angleVel += angleAcc * dt;
  s.angle += s.angleVel * dt;
  if (s.angle > aMax) { s.angle = aMax; s.angleVel = Math.min(0, s.angleVel); }
  if (s.angle < -aMax) { s.angle = -aMax; s.angleVel = Math.max(0, s.angleVel); }

  // Roll: the liquid swings around the tube axis — spring toward the across-tilt rest, kicked by roll rate.
  const acrossRest = across * p.acrossShiftGain;
  const acrossAcc = -p.acrossK * (s.acrossShift - acrossRest) - p.acrossDamp * s.acrossVel
    + inp.gyroAlong * p.acrossGyroGain * 10;
  s.acrossVel += acrossAcc * dt;
  s.acrossShift += s.acrossVel * dt;
  if (s.acrossShift > ACROSS_MAX_PX) { s.acrossShift = ACROSS_MAX_PX; s.acrossVel = Math.min(0, s.acrossVel); }
  if (s.acrossShift < -ACROSS_MAX_PX) { s.acrossShift = -ACROSS_MAX_PX; s.acrossVel = Math.max(0, s.acrossVel); }

  // Agitation: fast attack on gyro energy, slow decay.
  const shake = Math.min(1, ((Math.abs(inp.gyroAcross) + Math.abs(inp.gyroAlong)) / 200) * p.shakeGain);
  s.agitation += (shake - s.agitation) * Math.min(1, (shake > s.agitation ? 20 : 2) * dt);

  // Edge light: slow follower of along-tilt. +1 = gravity presses the liquid into the right
  // end (edge glows brighter), -1 = drains away from it (edge dims). Consumed by the renderer.
  s.edgeLight += (Math.max(-1, Math.min(1, along)) - s.edgeLight) * Math.min(1, 5 * dt);
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
