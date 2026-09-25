/** Linear-light dielectric optics. Units: mm, radians, relative radiance. */
// Optical kernel of the material layer (docs/physical-renderer.md): Fresnel/Snell/Beer–Lambert, the
// cylinder trace (geometry.ts) and the extended light (lighting.ts). Read by material/optical.ts.

/** Inputs of the trace and the light model (the phase-1 lab's parameter set; material/optical.ts builds
 *  it from a Material). backingReflectance, marksReflectance, hoursY and minutesY are not read here. */
export interface PhysicalParams {
  innerRadiusMm: number;
  wallThicknessMm: number;
  liquidIor: number;
  wallIor: number;
  absorptionR: number;
  absorptionG: number;
  absorptionB: number;
  lightAngleDeg: number;
  lightSizeDeg: number;
  lightIntensity: number;
  ambientIntensity: number;
  backingReflectance: number;
  marksReflectance: number;
  exposure: number;
  hoursY: number;
  minutesY: number;
}
export interface Vec { y: number; z: number }
export interface RGB { r: number; g: number; b: number }
export const dot = (a: Vec, b: Vec): number => a.y * b.y + a.z * b.z;
export function fresnel(cosI: number, n1: number, n2: number): number {
  if (n1 === n2) return 0;
  const c = Math.max(0, Math.min(1, cosI));
  const sinT2 = (n1 / n2) ** 2 * (1 - c * c);
  if (sinT2 >= 1) return 1;
  const ct = Math.sqrt(1 - sinT2);
  const rs = (n1 * c - n2 * ct) / (n1 * c + n2 * ct);
  const rp = (n2 * c - n1 * ct) / (n2 * c + n1 * ct);
  return (rs * rs + rp * rp) * 0.5;
}
/** Normal points into the incident medium. Null denotes total internal reflection. */
export function refract(d: Vec, normal: Vec, n1: number, n2: number): Vec | null {
  const c = Math.max(0, Math.min(1, -dot(d, normal))), eta = n1 / n2;
  const k = 1 - eta * eta * (1 - c * c);
  if (k < 0) return null;
  const a = eta * c - Math.sqrt(k);
  return { y: eta * d.y + a * normal.y, z: eta * d.z + a * normal.z };
}
export function beer(sigma: number, distance: number): number { return Math.exp(-sigma * distance); }
export function decode(v: number): number { return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }
export function encode(v: number): number {
  v = Math.max(0, Math.min(1, v));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}
