// Liquid Watch — single source of truth for panel layout (TS mirror of spec/layout.h).
// KEEP IN SYNC with spec/layout.h. Landscape 536x240, origin top-left.

export const PANEL_W = 536;
export const PANEL_H = 240;

export const TUBE_LENGTH_PX = 536; // full width; leather may mask the outer ~10px
export const TUBE_HEIGHT_PX = 72;  // ≈ 6 mm at ~0.083 mm/px
export const HOURS_TUBE_Y = 24;    // tube spans y 24..96
export const MINUTES_TUBE_Y = 144; // tube spans y 144..216
export const BRIDGE_Y0 = 96;       // bridge zone y 96..144 must stay pure black
export const BRIDGE_Y1 = 144;

export const LIQUID_RGB888 = 0x5dcaa5;
export const LIQUID_HI_RGB888 = 0x9fe1cb;
export const BG_RGB888 = 0x000000;

export const MM_PER_PX = 0.083;

export function rgb565(r: number, g: number, b: number): number {
  return ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
}
export function rgb888to565(rgb: number): number {
  return rgb565((rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff);
}
/** Expand RGB565 back to 8-bit channels exactly as the panel will show them. */
export function rgb565to888(c: number): [number, number, number] {
  const r5 = (c >> 11) & 0x1f, g6 = (c >> 5) & 0x3f, b5 = c & 0x1f;
  return [(r5 << 3) | (r5 >> 2), (g6 << 2) | (g6 >> 4), (b5 << 3) | (b5 >> 2)];
}

// ---- IMU axis mapping (QMI8658, measured 2026-08-20 with USB_LEFT=1) ----
export const IMU_AXIS_ALONG_TUBE = 1;   // 0=x 1=y 2=z
export const IMU_ALONG_TUBE_SIGN = -1;  // tilt_along = sign * ay → positive = right end down
export const IMU_AXIS_ACROSS_TUBE = 0;
export const IMU_ACROSS_TUBE_SIGN = -1; // positive = far edge down
