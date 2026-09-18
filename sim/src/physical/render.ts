import { PANEL_W as W, PANEL_H, TUBE_HEIGHT_MAX as MAX_H } from '@spec/layout';
import { PHYSICAL_META, validatePhysicalParams, type PhysicalParams } from './model';
import { physicalLayout, traceRow } from './geometry';
import { beer, type RGB } from './optics';
import { backingLight } from './lighting';
import { markAt } from './marks';
import { blendLinear565, quantize } from './output';
import { decode } from './optics';
import { DEFAULT_PHYSICAL_APPEARANCE, type PhysicalAppearance } from './appearance';

/** Same fixed maximum layer capacity as firmware; no material-dependent pool growth. */
export class PhysicalRenderer {
  readonly fb = new Uint16Array(W * PANEL_H);
  readonly layers = new Uint16Array(2 * 2 * W * MAX_H);
  private key = '';
  lastRebuildMs = 0;
  private rebuild(p: PhysicalParams, appearance: PhysicalAppearance): void {
    const { H } = physicalLayout(p), R = p.innerRadiusMm + p.wallThicknessMm;
    const irradiance = backingLight(p);
    const srgb = (hex: string): RGB => {
      const value = Number.parseInt(hex.slice(1), 16);
      return {
        r: decode(((value >> 16) & 255) / 255),
        g: decode(((value >> 8) & 255) / 255),
        b: decode((value & 255) / 255),
      };
    };
    const background = srgb(appearance.background), digits = srgb(appearance.digits);
    for (let medium = 0; medium < 2; medium++) for (let y = 0; y < H; y++) {
      const path = traceRow(((y + 0.5) / H * 2 - 1) * R, medium === 1, p);
      const gain = path.transmission * irradiance;
      const colour = (albedo: number, tint: RGB): RGB => ({
        r: p.exposure * (path.reflection + gain * albedo * tint.r * beer(p.absorptionR, path.distance)),
        g: p.exposure * (path.reflection + gain * albedo * tint.g * beer(p.absorptionG, path.distance)),
        b: p.exposure * (path.reflection + gain * albedo * tint.b * beer(p.absorptionB, path.distance)),
      });
      const bg = quantize(colour(p.backingReflectance, background));
      const mark = quantize(colour(p.marksReflectance, digits));
      const sy = (path.backY / R + 1) * H * 0.5;
      for (let tube = 0; tube < 2; tube++) {
        const offset = (tube * 2 + medium) * W * MAX_H + y * W;
        for (let x = 0; x < W; x++) this.layers[offset + x] = path.transmission > 0 && markAt(x, sy, H, tube) ? mark : bg;
      }
    }
  }
  render(p: PhysicalParams, hoursFill: number, minutesFill: number,
         appearance: PhysicalAppearance = DEFAULT_PHYSICAL_APPEARANCE): Uint16Array {
    const key = PHYSICAL_META.map(f => p[f.key]).join(',') + `|${appearance.background}|${appearance.digits}`;
    this.lastRebuildMs = 0;
    if (key !== this.key) {
      validatePhysicalParams(p);
      const t = performance.now(); this.rebuild(p, appearance); this.lastRebuildMs = performance.now() - t; this.key = key;
    }
    const { H, yH, yM } = physicalLayout(p);
    this.fb.fill(0);
    for (let tube = 0; tube < 2; tube++) {
      const fill = tube ? minutesFill : hoursFill;
      if (!Number.isFinite(fill)) throw new Error('Non-finite physical fill');
      const edge = Math.max(0, Math.min(1, fill)) * W, xi = Math.floor(edge), alpha = edge - xi;
      const y0 = tube ? yM : yH, dry = tube * 2 * W * MAX_H, wet = dry + W * MAX_H;
      for (let y = 0; y < H; y++) {
        const dst = (y0 + y) * W, row = y * W;
        this.fb.set(this.layers.subarray(wet + row, wet + row + xi), dst);
        this.fb.set(this.layers.subarray(dry + row + xi, dry + row + W), dst + xi);
        if (xi < W && alpha > 0) this.fb[dst + xi] = blendLinear565(this.layers[dry + row + xi], this.layers[wet + row + xi], alpha);
      }
    }
    return this.fb;
  }
}
