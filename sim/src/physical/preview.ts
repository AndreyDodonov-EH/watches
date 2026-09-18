import { PANEL_W as W, PANEL_H } from '@spec/layout';
import type { PhysicalParams } from './model';
import { physicalLayout } from './geometry';
import { refract } from './optics';
import { blendLinear565 } from './output';
/** Geometry-only hardware preview: R=3 mm, flat face on the display, nominal PMMA n=1.49.
 * Actual room reflections/cover-glass/contact layers are uncalibrated and are not painted in.
 */
export class RodPreview {
  private readonly output = new Uint16Array(W * PANEL_H);
  apply(pixels: Uint16Array, p: PhysicalParams): Uint16Array {
    this.output.set(pixels);
    const { H, yH, yM } = physicalLayout(p);
    for (const y0 of [yH, yM]) {
      // Hardware radius stays fixed when the virtual tube diameter changes.
      const center = y0 + H / 2, R = 3;
      const first = Math.max(0, Math.floor(center - R / 0.083));
      const last = Math.min(PANEL_H, Math.ceil(center + R / 0.083));
      for (let row = first; row < last; row++) {
        const y = (row + 0.5 - center) * 0.083;
        if (Math.abs(y) >= R) continue;
        const z = Math.sqrt(R * R - y * y);
        const d = refract({ y: 0, z: -1 }, { y: y / R, z: z / R }, 1, 1.49)!;
        const source = (y - z * d.y / d.z) / 0.083 + center - 0.5;
        const a = Math.max(0, Math.min(PANEL_H - 1, Math.floor(source)));
        const b = Math.min(PANEL_H - 1, a + 1), k = Math.max(0, Math.min(1, source - a));
        for (let x = 0; x < W; x++) {
          this.output[row * W + x] = blendLinear565(pixels[a * W + x], pixels[b * W + x], k);
        }
      }
    }
    return this.output;
  }
}
