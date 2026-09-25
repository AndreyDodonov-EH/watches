import { dot, fresnel, refract, type PhysicalParams, type Vec } from './optics';
import { environment } from './lighting';

export function circleDistance(o: Vec, d: Vec, radius: number): number {
  const b = dot(o, d), c = dot(o, o) - radius * radius, disc = b * b - c;
  if (disc < 0) return -1;
  const q = Math.sqrt(disc), near = -b - q, far = -b + q;
  return near > 1e-5 ? near : far > 1e-5 ? far : -1;
}
const advance = (o: Vec, d: Vec, t: number): Vec => ({ y: o.y + d.y * t, z: o.z + d.z * t });
export interface OpticalPath { distance: number; transmission: number; reflection: number; backY: number }
/** traceRow plus the Fresnel reflectances at the two far interfaces the ray crosses on its way out:
 *  `farInner` (bore medium → wall) and `farOuter` (wall → air), at the ray's actual incidence; 0 where
 *  the path ends before reaching that interface. */
export interface OpticalPathDetail extends OpticalPath { farInner: number; farOuter: number }
/** Single transmitted path through an infinite cylinder cross-section (max four interfaces).
 * Front-surface reflection samples the environment. Internal reflected paths are omitted,
 * not reassigned to transmission. At TIR that path terminates; no artificial light is added.
 */
export function traceRow(y: number, wet: boolean, p: PhysicalParams): OpticalPath {
  const { distance, transmission, reflection, backY } = traceRowDetail(y, wet, p);
  return { distance, transmission, reflection, backY };
}
/** traceRow with the far-interface Fresnel factors exposed (material/optical.ts far-wall term). */
export function traceRowDetail(y: number, wet: boolean, p: PhysicalParams): OpticalPathDetail {
  const R = p.innerRadiusMm + p.wallThicknessMm, r = p.innerRadiusMm;
  const path: OpticalPathDetail = { distance: 0, transmission: 0, reflection: 0, backY: 0, farInner: 0, farOuter: 0 };
  if (Math.abs(y) >= R) return path;
  let o: Vec = { y, z: Math.sqrt(R * R - y * y) }, d: Vec = { y: 0, z: -1 };
  let normal = { y: o.y / R, z: o.z / R };
  const F = fresnel(-dot(d, normal), 1, p.wallIor);
  const reflected = { y: d.y - 2 * dot(d, normal) * normal.y, z: d.z - 2 * dot(d, normal) * normal.z };
  path.reflection = F * environment(reflected, p);
  let next = refract(d, normal, 1, p.wallIor);
  if (!next) return path;
  d = next; let through = 1 - F;
  const entry = circleDistance(o, d, r);
  if (entry > 0) {
    o = advance(o, d, entry); normal = { y: o.y / r, z: o.z / r };
    const n = wet ? p.liquidIor : 1;
    through *= 1 - fresnel(-dot(d, normal), p.wallIor, n);
    next = refract(d, normal, p.wallIor, n);
    if (!next) return path;
    d = next;
    const exit = circleDistance(o, d, r);
    if (exit <= 0) return path;
    if (wet) path.distance = exit;
    o = advance(o, d, exit); normal = { y: -o.y / r, z: -o.z / r };
    path.farInner = fresnel(-dot(d, normal), n, p.wallIor);
    through *= 1 - path.farInner;
    next = refract(d, normal, n, p.wallIor);
    if (!next) return path;
    d = next;
  }
  const exit = circleDistance(o, d, R);
  if (exit <= 0) return path;
  o = advance(o, d, exit); normal = { y: -o.y / R, z: -o.z / R };
  path.farOuter = fresnel(-dot(d, normal), p.wallIor, 1);
  through *= 1 - path.farOuter;
  next = refract(d, normal, p.wallIor, 1);
  if (!next || next.z >= -1e-5) return path;
  d = next;
  const t = (-R - o.z) / d.z;
  if (t < 0) return path;
  path.backY = o.y + d.y * t;
  path.transmission = through;
  return path;
}
