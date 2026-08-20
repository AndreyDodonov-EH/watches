// Renderer: draws into an RGB565 framebuffer (Uint16Array, PANEL_W*PANEL_H) with only
// operations that port 1:1 to the MCU: per-row horizontal spans, a per-row colour LUT,
// a few filled ellipses/dots. Documented step-by-step in docs/render-routine.md.
import {
  PANEL_W, PANEL_H, TUBE_LENGTH_PX, TUBE_HEIGHT_PX, HOURS_TUBE_Y, MINUTES_TUBE_Y,
  rgb565, rgb565to888,
} from '@spec/layout';
import type { Params } from './params';
import type { TubeState } from './physics';

export const fb = new Uint16Array(PANEL_W * PANEL_H);

function hexToRgb(h: string): [number, number, number] {
  const v = parseInt(h.replace('#', ''), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}
function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function scale(a: [number, number, number], k: number): [number, number, number] {
  return [a[0] * k, a[1] * k, a[2] * k];
}
function q(c: [number, number, number]): number {
  return rgb565(Math.round(Math.max(0, Math.min(255, c[0]))), Math.round(Math.max(0, Math.min(255, c[1]))),
    Math.round(Math.max(0, Math.min(255, c[2]))));
}
/** Blend two RGB565 colours (t in 0..1) — used only for edge anti-aliasing (edgeSoft). */
function blend565(a: number, b: number, t: number): number {
  const A = rgb565to888(a), B = rgb565to888(b);
  return q(mix(A, B, t));
}

export interface Palette {
  rows: Uint16Array;     // TUBE_HEIGHT_PX colours: body shade per row incl. highlight band
  rowsHi: Uint16Array;   // same but for the "highlight on" region (inset-aware): identical to rows
  body: number; glass: number; digit: number; bubbleRim: number; bubbleIn: Uint16Array; bg: number;
}

/** Step 0: build the per-row colour LUT. Firmware does this once per param change. */
export function buildPalette(p: Params, acrossShift = 0): Palette {
  const body = hexToRgb(p.liquid), hi = hexToRgb(p.liquidHi), lo = hexToRgb(p.liquidLo);
  const br = p.brightness;
  const rows = new Uint16Array(TUBE_HEIGHT_PX);
  const bubbleIn = new Uint16Array(TUBE_HEIGHT_PX);
  const hiTop = Math.round(2 + acrossShift);
  for (let y = 0; y < TUBE_HEIGHT_PX; y++) {
    // cylinder shading: brightest around 1/3 from top, darkest at the bottom
    const t = y / (TUBE_HEIGHT_PX - 1);
    let c: [number, number, number];
    if (t < 0.33) c = mix(mix(body, lo, 0.25), body, t / 0.33);
    else c = mix(body, lo, ((t - 0.33) / 0.67) * p.shadeDepth);
    if (y >= hiTop && y < hiTop + p.highlightH) {
      const k = 1 - Math.abs((y - hiTop) / Math.max(1, p.highlightH - 1) - 0.5) * 2; // tent
      c = mix(c, hi, 0.35 + 0.65 * k);
    }
    rows[y] = q(scale(c, br));
    bubbleIn[y] = q(scale(mix(c, [0, 0, 0], p.bubbleDark), br));
  }
  return {
    rows, rowsHi: rows, body: q(scale(body, br)), glass: q(scale(hexToRgb(p.glass), br)),
    digit: q(scale(hexToRgb(p.digitColor), br)), bubbleRim: q(scale(hexToRgb(p.bubbleRim), br)), bubbleIn, bg: 0,
  };
}

function hspan(y: number, x0: number, x1: number, c: number): void {
  if (y < 0 || y >= PANEL_H) return;
  x0 = Math.max(0, x0); x1 = Math.min(PANEL_W, x1);
  if (x1 <= x0) return;
  fb.fill(c, y * PANEL_W + x0, y * PANEL_W + x1);
}
/** Blend colour c over the existing pixel with opacity t (1 = replace). */
function pxa(x: number, y: number, c: number, t: number): void {
  if (x < 0 || y < 0 || x >= PANEL_W || y >= PANEL_H) return;
  const i = y * PANEL_W + x;
  fb[i] = t >= 1 ? c : blend565(fb[i], c, t);
}
function px(x: number, y: number, c: number): void {
  if (x < 0 || y < 0 || x >= PANEL_W || y >= PANEL_H) return;
  fb[y * PANEL_W + x] = c;
}

// Bitmap digit fonts 0-9; rows top→bottom, w bits per row (MSB = left). Selected by params.digitFont.
interface Font { w: number; h: number; g: number[][]; name: string }
const FONT_3x5: Font = { name: '3x5', w: 3, h: 5, g: [
  [0b111,0b101,0b101,0b101,0b111], [0b010,0b110,0b010,0b010,0b111], [0b111,0b001,0b111,0b100,0b111],
  [0b111,0b001,0b111,0b001,0b111], [0b101,0b101,0b111,0b001,0b001], [0b111,0b100,0b111,0b001,0b111],
  [0b111,0b100,0b111,0b101,0b111], [0b111,0b001,0b001,0b001,0b001], [0b111,0b101,0b111,0b101,0b111],
  [0b111,0b101,0b111,0b001,0b111] ] };
const FONT_4x6: Font = { name: '4x6 narrow', w: 4, h: 6, g: [
  [0b0110,0b1001,0b1001,0b1001,0b1001,0b0110], [0b0010,0b0110,0b0010,0b0010,0b0010,0b0111],
  [0b0110,0b1001,0b0001,0b0010,0b0100,0b1111], [0b1110,0b0001,0b0110,0b0001,0b1001,0b0110],
  [0b0010,0b0110,0b1010,0b1111,0b0010,0b0010], [0b1111,0b1000,0b1110,0b0001,0b1001,0b0110],
  [0b0110,0b1000,0b1110,0b1001,0b1001,0b0110], [0b1111,0b0001,0b0010,0b0100,0b0100,0b0100],
  [0b0110,0b1001,0b0110,0b1001,0b1001,0b0110], [0b0110,0b1001,0b1001,0b0111,0b0001,0b0110] ] };
const FONT_5x7: Font = { name: '5x7 round', w: 5, h: 7, g: [
  [0b01110,0b10001,0b10011,0b10101,0b11001,0b10001,0b01110], [0b00100,0b01100,0b00100,0b00100,0b00100,0b00100,0b01110],
  [0b01110,0b10001,0b00001,0b00010,0b00100,0b01000,0b11111], [0b11111,0b00010,0b00100,0b00010,0b00001,0b10001,0b01110],
  [0b00010,0b00110,0b01010,0b10010,0b11111,0b00010,0b00010], [0b11111,0b10000,0b11110,0b00001,0b00001,0b10001,0b01110],
  [0b00110,0b01000,0b10000,0b11110,0b10001,0b10001,0b01110], [0b11111,0b00001,0b00010,0b00100,0b01000,0b01000,0b01000],
  [0b01110,0b10001,0b10001,0b01110,0b10001,0b10001,0b01110], [0b01110,0b10001,0b10001,0b01111,0b00001,0b00010,0b01100] ] };
const FONT_7SEG: Font = { name: '5x7 seven-segment', w: 5, h: 7, g: [
  [0b11111,0b10001,0b10001,0b10001,0b10001,0b10001,0b11111], [0b00001,0b00001,0b00001,0b00001,0b00001,0b00001,0b00001],
  [0b11111,0b00001,0b00001,0b11111,0b10000,0b10000,0b11111], [0b11111,0b00001,0b00001,0b11111,0b00001,0b00001,0b11111],
  [0b10001,0b10001,0b10001,0b11111,0b00001,0b00001,0b00001], [0b11111,0b10000,0b10000,0b11111,0b00001,0b00001,0b11111],
  [0b11111,0b10000,0b10000,0b11111,0b10001,0b10001,0b11111], [0b11111,0b00001,0b00001,0b00001,0b00001,0b00001,0b00001],
  [0b11111,0b10001,0b10001,0b11111,0b10001,0b10001,0b11111], [0b11111,0b10001,0b10001,0b11111,0b00001,0b00001,0b11111] ] };
const FONT_6x8B: Font = { name: '6x8 bold', w: 6, h: 8, g: [
  [0b011110,0b110011,0b110011,0b110011,0b110011,0b110011,0b110011,0b011110], [0b001100,0b011100,0b001100,0b001100,0b001100,0b001100,0b001100,0b111111],
  [0b011110,0b110011,0b000011,0b000110,0b001100,0b011000,0b110000,0b111111], [0b111110,0b000011,0b000011,0b011110,0b000011,0b000011,0b110011,0b011110],
  [0b000110,0b001110,0b011110,0b110110,0b111111,0b000110,0b000110,0b000110], [0b111111,0b110000,0b110000,0b111110,0b000011,0b000011,0b110011,0b011110],
  [0b011110,0b110000,0b110000,0b111110,0b110011,0b110011,0b110011,0b011110], [0b111111,0b000011,0b000110,0b001100,0b011000,0b011000,0b011000,0b011000],
  [0b011110,0b110011,0b110011,0b011110,0b110011,0b110011,0b110011,0b011110], [0b011110,0b110011,0b110011,0b011111,0b000011,0b000011,0b000011,0b011110] ] };
export const FONTS: Font[] = [FONT_3x5, FONT_4x6, FONT_5x7, FONT_7SEG, FONT_6x8B];
type AlphaFn = (x: number, y: number) => number;
function drawDigits(text: string, xc: number, yBase: number, kx: number, ky: number, f: Font,
  rowColors: Uint16Array, shadow: number, alpha: AlphaFn): void {
  const font = f.g, gw = f.w, gh = f.h, msb = 1 << (gw - 1);
  // Glyph box in device pixels (nearest-neighbour scaled); gap = 1 source column.
  const bw = Math.max(1, Math.round(gw * kx)), bh = Math.max(1, Math.round(gh * ky)), gap = Math.max(1, Math.round(kx));
  const w = text.length * (bw + gap) - gap;
  const x0 = Math.round(xc - w / 2);
  const yTop = yBase - bh + 1;
  for (let pass = shadow >= 0 ? 0 : 1; pass < 2; pass++) {
    const off = pass === 0 ? 1 : 0;
    let x = x0;
    for (const ch of text) {
      const g = font[ch.charCodeAt(0) - 48]; if (!g) { x += bw + gap; continue; }
      for (let dy = 0; dy < bh; dy++) {
        const r = Math.min(gh - 1, Math.floor((dy * gh) / bh)), row = g[r];
        for (let dx = 0; dx < bw; dx++) {
          const col = Math.min(gw - 1, Math.floor((dx * gw) / bw));
          if (row & (msb >> col)) { const xx = x + dx + off, yy = yTop + dy + off; pxa(xx, yy, pass === 0 ? shadow : rowColors[dy], alpha(xx, yy)); }
        }
      }
      x += bw + gap;
    }
  }
}
function digitRowColors(p: Params, gh: number, ky: number): Uint16Array {
  const n = Math.max(1, Math.round(gh * ky)), out = new Uint16Array(n);
  const a = hexToRgb(p.digitColor), b = hexToRgb(p.digitColor2);
  for (let i = 0; i < n; i++) {
    // metallic: bright top, darker middle-low, slight kick back up at the very bottom
    const t = n === 1 ? 0 : i / (n - 1); const u = t < 0.8 ? t / 0.8 : 1 - (t - 0.8) / 0.2 * 0.35;
    out[i] = q(scale(mix(a, b, u), p.brightness));
  }
  return out;
}
function drawTubeDigits(y0: number, p: Params, pal: Palette, ticksN: number, alpha: AlphaFn): void {
  const L = TUBE_LENGTH_PX, H = TUBE_HEIGHT_PX; void pal;
  const every = Math.max(1, Math.round(ticksN === 60 ? p.digitMinuteStep : p.digitHourStep));
  const f = FONTS[Math.max(0, Math.min(FONTS.length - 1, Math.round(p.digitFont)))];
  const minutes = ticksN === 60;
  const kx = minutes ? p.digitScaleXMin : p.digitScaleX, ky = minutes ? p.digitScaleYMin : p.digitScaleY;
  const bottom = minutes ? p.digitBottomMin : p.digitBottom;
  const rows = digitRowColors(p, f.h, ky);
  const shadow = p.digitShadow ? q(scale(hexToRgb(p.digitShadowColor), p.brightness)) : -1;
  for (let i = every; i < ticksN; i += every) {
    const x = Math.round((i * L) / ticksN);
    const t = ticksN === 60 && p.digitsLeadingZero ? String(i).padStart(2, '0') : String(i);
    drawDigits(t, x, y0 + H - 1 - bottom, kx, ky, f, rows, shadow, alpha);
  }
}

export interface Fizz { x: number; y: number; v: number; }
export const fizz: Fizz[][] = [[], []];

function ensureFizz(i: number, p: Params): void {
  const arr = fizz[i];
  while (arr.length < p.fizzCount) arr.push({ x: Math.random(), y: Math.random() * TUBE_HEIGHT_PX, v: 0.5 + Math.random() });
  if (arr.length > p.fizzCount) arr.length = p.fizzCount;
}
export function stepFizz(p: Params, dt: number): void {
  for (let i = 0; i < 2; i++) for (const f of fizz[i]) {
    f.y -= p.fizzSpeed * f.v * dt;
    if (f.y < 3) { f.y = TUBE_HEIGHT_PX - 3; f.x = Math.random(); f.v = 0.5 + Math.random(); }
  }
}

/** Fill-edge x for tube-row `ry` (0..H-1), given edge centre `xe`, angle and meniscus. */
export function edgeX(ry: number, xe: number, angleDeg: number, p: Params): number {
  const H = TUBE_HEIGHT_PX, yc = (H - 1) / 2;
  const d = (ry - yc) / yc;                  // -1..1
  const tilt = Math.tan((angleDeg * Math.PI) / 180) * (ry - yc);
  const men = p.meniscusDepth * Math.pow(Math.abs(d), p.meniscusPow); // liquid climbs the wall
  return xe + tilt + men;
}

/** Draw one tube. y0 = top of tube in panel coords. */
export function drawTube(idx: number, y0: number, s: TubeState, p: Params, pal: Palette, ticksN: number): void {
  const H = TUBE_HEIGHT_PX, L = TUBE_LENGTH_PX;
  const xe = s.fillTarget * L + s.fillPos;   // edge centre
  ensureFizz(idx, p);

  // Step 1: glass background (empty tube) — whole strip
  if (pal.glass !== 0) for (let ry = 0; ry < H; ry++) hspan(y0 + ry, 0, L, pal.glass);
  else for (let ry = 0; ry < H; ry++) hspan(y0 + ry, 0, L, 0);

  // Step 3: liquid column — per row a horizontal span from the left cap to the (curved) edge.
  const edges = new Float32Array(H);
  for (let ry = 0; ry < H; ry++) {
    const ex = edgeX(ry, xe, s.angle, p);
    edges[ry] = ex;
    let x0 = 0;
    if (p.cornerR > 0) { // rounded left end cap
      const r = Math.min(p.cornerR, H / 2), yc = (H - 1) / 2, dy = Math.abs(ry - yc);
      if (dy > yc - r) { const k = (dy - (yc - r)) / r; x0 = Math.round(r - Math.sqrt(Math.max(0, 1 - k * k)) * r); }
    }
    const xi = Math.floor(ex), frac = ex - xi;
    hspan(y0 + ry, x0, xi, pal.rows[ry]);
    if (p.edgeSoft > 0) {  // anti-aliased edge pixel(s)
      const w = Math.max(1, Math.round(p.edgeSoft));
      for (let k = 0; k < w; k++) {
        const t = Math.max(0, Math.min(1, (frac - k) / 1 + (w > 1 ? 0.5 : 0)));
        if (xi + k >= x0) px(xi + k, y0 + ry, blend565(pal.glass, pal.rows[ry], t));
      }
    } else if (frac >= 0.5) px(xi, y0 + ry, pal.rows[ry]);
  }

  // Step 3a: front brightening — last `frontBright` px before the edge lerp toward the highlight colour (per row).
  if (p.frontBright > 0) {
    const hiC = q(scale(hexToRgb(p.liquidHi), p.brightness));
    for (let ry = 0; ry < H; ry++) {
      const ex = edges[ry]; const xi = Math.floor(ex);
      for (let k = 1; k <= p.frontBright; k++) {
        const x = xi - k; if (x < 0) break;
        const t = (1 - k / p.frontBright); px(x, y0 + ry, blend565(pal.rows[ry], hiC, t * t * 0.85));
      }
    }
  }

  // Step 3b: edge glow — a few px past the edge fade from (body*glowStrength) to glass. Ported as a short span of LUT colours.
  if (p.edgeGlow > 0 && p.glowStrength > 0) {
    for (let ry = 0; ry < H; ry++) {
      const ex = edges[ry]; const xs = Math.ceil(ex + (p.edgeSoft > 0 ? Math.round(p.edgeSoft) : 0));
      for (let k = 0; k < p.edgeGlow; k++) {
        const t = (1 - k / p.edgeGlow); const c = blend565(pal.glass, pal.rows[ry], t * t * p.glowStrength);
        if (xs + k < L) px(xs + k, y0 + ry, c);
      }
    }
  }

  // Step 4: highlight inset — erase highlight near the edge so it reads as a cylinder (optional)
  // (handled by LUT; inset applied by drawing glass over highlight rows past xe - inset? simpler: skip)
  if (p.highlightInset > 0) {
    const hiTop = Math.round(2 + s.acrossShift);
    for (let ry = hiTop; ry < hiTop + p.highlightH && ry < H; ry++) {
      const ex = edges[ry];
      // fade the highlight into the body colour over the last `inset` px
      const bodyRow = pal.rows[Math.min(H - 1, hiTop + p.highlightH + 1)];
      for (let x = Math.floor(ex - p.highlightInset); x < Math.floor(ex); x++) {
        if (x < 0) continue;
        const t = (x - (ex - p.highlightInset)) / p.highlightInset; // 0..1 toward edge
        px(x, y0 + ry, blend565(pal.rows[ry], bodyRow, t));
      }
      for (let x = 0; x < p.highlightInset && x < ex; x++) {
        const t = 1 - x / p.highlightInset;
        px(x, y0 + ry, blend565(pal.rows[ry], bodyRow, t));
      }
    }
  }

  // Step 4b: ticks and digits. Outside the liquid: opaque. Inside: blended by liquidTransparency
  // (digitsOnTop forces opaque digits). Uses `edges` from step 3 to test inside/outside per row.
  const inside = (x: number, y: number): boolean => { const ry = y - y0; return ry >= 0 && ry < H && x < edges[ry]; };
  const tickAlpha: AlphaFn = (x, y) => (inside(x, y) ? p.liquidTransparency : 1);
  const digitAlpha: AlphaFn = p.digitsOnTop ? () => 1 : tickAlpha;
  {
    const minutes = ticksN === 60;
    const on = minutes ? p.ticksM : p.ticksH;
    if (on) {
      const step = Math.max(1, Math.round(minutes ? p.tickStepM : p.tickStepH));
      const majorEvery = Math.round(minutes ? p.tickMajorEveryM : p.tickMajorEveryH);
      const hMin = minutes ? p.tickMinorHeightM : p.tickMinorHeightH, hMaj = minutes ? p.tickMajorHeightM : p.tickMajorHeightH;
      const cMin = q(scale(hexToRgb(minutes ? p.tickColorM : p.tickColorH), p.brightness));
      const cMaj = q(scale(hexToRgb(minutes ? p.tickMajorColorM : p.tickMajorColorH), p.brightness));
      const pos = Math.round(minutes ? p.tickPosM : p.tickPosH);
      for (let i = step, n = 1; i < ticksN; i += step, n++) {
        const x = Math.round((i * L) / ticksN);
        const major = majorEvery > 0 && n % majorEvery === 0;
        const h = major ? hMaj : hMin, c = major ? cMaj : cMin;
        for (let ry = 0; ry < h; ry++) {
          if (pos !== 1) pxa(x, y0 + ry, c, tickAlpha(x, y0 + ry));
          if (pos !== 0) pxa(x, y0 + H - 1 - ry, c, tickAlpha(x, y0 + H - 1 - ry));
        }
      }
    }
  }
  if (p.digits) drawTubeDigits(y0, p, pal, ticksN, digitAlpha);

  // Step 5: fizz dots (inside liquid only)
  if (p.fizz) for (const f of fizz[idx]) {
    const fx = Math.round(f.x * (xe - 6)), fy = Math.round(f.y);
    if (fx < 2 || fx >= edgeX(fy, xe, s.angle, p) - 2) continue;
    const c = pal.bubbleRim;
    for (let dy = 0; dy < p.fizzSize; dy++) for (let dx = 0; dx < p.fizzSize; dx++) {
      const inner = p.fizzSize >= 3 && dx > 0 && dy > 0 && dx < p.fizzSize - 1 && dy < p.fizzSize - 1;
      px(fx + dx, y0 + fy + dy, inner ? pal.bubbleIn[fy] : c);
    }
  }

  // Step 6: spirit-level bubble — filled ellipse (darkened body) with 1 px bright rim
  if (p.bubble) {
    const bx = xe - p.bubbleGap, by = (H - 1) * p.bubbleY - s.acrossShift * 0.5;
    const rx = p.bubbleW / 2, ry_ = p.bubbleH / 2;
    if (bx - rx > 2) {
      for (let yy = Math.floor(by - ry_); yy <= Math.ceil(by + ry_); yy++) {
        const dy = (yy - by) / ry_;
        if (Math.abs(dy) > 1) continue;
        const hw = Math.sqrt(1 - dy * dy) * rx;
        const xa = Math.round(bx - hw), xb = Math.round(bx + hw);
        const ryi = Math.max(0, Math.min(H - 1, yy));
        hspan(y0 + yy, xa, xb + 1, pal.bubbleIn[ryi]);
        px(xa, y0 + yy, pal.bubbleRim); px(xb, y0 + yy, pal.bubbleRim);
      }
      // top/bottom rim rows
      const yt = Math.round(by - ry_), yb = Math.round(by + ry_);
      hspan(y0 + yt, Math.round(bx - rx * 0.45), Math.round(bx + rx * 0.45) + 1, pal.bubbleRim);
      hspan(y0 + yb, Math.round(bx - rx * 0.45), Math.round(bx + rx * 0.45) + 1, pal.bubbleRim);
    }
  }
}

/** Full frame. Bridge zone and margins stay black (we never draw there). */
export function renderFrame(hours: TubeState, minutes: TubeState, p: Params): void {
  fb.fill(0);
  const palH = buildPalette(p, hours.acrossShift);
  const palM = hours.acrossShift === minutes.acrossShift ? palH : buildPalette(p, minutes.acrossShift);
  drawTube(0, HOURS_TUBE_Y, hours, p, palH, 12);
  drawTube(1, MINUTES_TUBE_Y, minutes, p, palM, 60);
}

/** Blit RGB565 framebuffer to a canvas ImageData (exact 565 expansion). */
export function blit(img: ImageData): void {
  const d = img.data;
  for (let i = 0, j = 0; i < fb.length; i++, j += 4) {
    const c = fb[i];
    const r5 = (c >> 11) & 0x1f, g6 = (c >> 5) & 0x3f, b5 = c & 0x1f;
    d[j] = (r5 << 3) | (r5 >> 2); d[j + 1] = (g6 << 2) | (g6 >> 4); d[j + 2] = (b5 << 3) | (b5 >> 2); d[j + 3] = 255;
  }
}
