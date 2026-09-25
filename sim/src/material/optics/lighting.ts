import type { PhysicalParams, Vec } from './optics';
/** An extended white source with a Gaussian angular radiance profile; width is FWHM. */
export function environment(direction: Vec, p: PhysicalParams): number {
  const angle = Math.atan2(direction.y, direction.z) * 180 / Math.PI;
  let delta = angle - p.lightAngleDeg;
  delta = ((delta + 540) % 360) - 180;
  const sigma = p.lightSizeDeg / 2.355;
  return p.ambientIntensity + p.lightIntensity * Math.exp(-0.5 * (delta / sigma) ** 2);
}
/** Diffuse backing illumination: 2D projected-area approximation. */
export function backingLight(p: PhysicalParams): number {
  return p.ambientIntensity + p.lightIntensity * Math.max(0, Math.cos(p.lightAngleDeg * Math.PI / 180)) * Math.sin(p.lightSizeDeg * Math.PI / 360);
}
