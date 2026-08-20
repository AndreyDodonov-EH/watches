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

export interface TubeState {
  fillTarget: number;  // 0..1 from time
  fillPos: number;     // px offset of the edge relative to target (slosh), spring toward 0
  fillVel: number;
  angle: number;       // deg, surface tilt (+ = top of meniscus further right)
  angleVel: number;
  acrossShift: number; // px, low-passed vertical offset for highlight/depth
}

export function newTube(): TubeState {
  return { fillTarget: 0, fillPos: 0, fillVel: 0, angle: 0, angleVel: 0, acrossShift: 0 };
}

function dz(v: number, d: number): number {
  return Math.abs(v) < d ? 0 : v - Math.sign(v) * d;
}

export function stepTube(s: TubeState, inp: TiltInput, p: Params, dt = PHYS_DT): void {
  const along = dz(inp.along, p.deadzone);
  const across = dz(inp.across, p.deadzone);

  // Fill-edge slosh: static offset proportional to along-tilt; spring returns to rest.
  const fillRest = along * p.fillSloshGain;
  const fillAcc = -p.fillK * (s.fillPos - fillRest) - p.fillDamp * s.fillVel
    + inp.gyroAcross * p.angleGyroGain * 4; // quick flicks kick the edge
  s.fillVel += fillAcc * dt;
  s.fillPos += s.fillVel * dt;

  // Surface angle: rest angle follows along-tilt; gyro about the across axis gives impulses.
  const angleRest = Math.max(-p.angleMax, Math.min(p.angleMax, along * p.angleTiltGain));
  const angleAcc = -p.angleK * (s.angle - angleRest) - p.angleDamp * s.angleVel
    + inp.gyroAcross * p.angleGyroGain * 10;
  s.angleVel += angleAcc * dt;
  s.angle += s.angleVel * dt;
  if (s.angle > p.angleMax) { s.angle = p.angleMax; s.angleVel = Math.min(0, s.angleVel); }
  if (s.angle < -p.angleMax) { s.angle = -p.angleMax; s.angleVel = Math.max(0, s.angleVel); }

  // Across tilt: low-pass
  const target = across * p.acrossShiftGain;
  s.acrossShift += (target - s.acrossShift) * Math.min(1, 8 * dt);
}

/** Continuous fill levels per the layout spec. */
export function fillLevels(d: Date): { hours: number; minutes: number } {
  const h = d.getHours() % 12, m = d.getMinutes(), s = d.getSeconds() + d.getMilliseconds() / 1000;
  return { hours: (h + (m + s / 60) / 60) / 12, minutes: (m + s / 60) / 60 };
}
