// Renderer: draws into an RGB565 framebuffer (Uint16Array, PANEL_W*PANEL_H) with only
// operations that port 1:1 to the MCU: per-row horizontal spans, a per-row colour LUT,
// a few filled ellipses/dots. Documented step-by-step in docs/render-routine.md.
import {
  PANEL_W, PANEL_H, TUBE_LENGTH_PX, TUBE_HEIGHT_MAX,
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

export interface TubeLayout { H: number; yH: number; yM: number; }
/** Tube geometry from params, clamped to the panel and the strip buffer. */
export function tubeLayout(p: Params): TubeLayout {
  const H = Math.max(4, Math.min(TUBE_HEIGHT_MAX, Math.round(p.tubeHeight)));
  const y = (v: number) => Math.max(0, Math.min(PANEL_H - H, Math.round(v)));
  return { H, yH: y(p.hoursY), yM: y(p.minutesY) };
}

export interface Palette {
  rows: Uint16Array;     // H colours: body shade per row incl. highlight band
  glassRows: Uint16Array; // empty-tube shade per row
  body: number; glass: number; bubbleRim: number; bubbleIn: Uint16Array;
}

/** Step 0: build the per-row colour LUT. Firmware does this once per param change. */
export function buildPalette(p: Params, acrossShift = 0): Palette {
  const body = hexToRgb(p.liquid), hi = hexToRgb(p.liquidHi), lo = hexToRgb(p.liquidLo);
  const br = p.brightness * p.liquidBright;   // glass stays on the panel dimmer alone (see below)
  const H = tubeLayout(p).H;
  const rows = new Uint16Array(H);
  const bubbleIn = new Uint16Array(H);
  const glassRows = new Uint16Array(H);
  const glass = hexToRgb(p.glass), ghi = hexToRgb(p.glassHi);
  /** Glass wall shading weight 0..1 for a row: specular tent on the top wall, a faint band on the
   *  lower wall, brighter outermost rows. */
  const glassW = (y: number): number => {
    const t = y / (H - 1);
    // ambient: cylinder lit from above — brightest near 1/3, darkest near 2/3, lifting again at the bottom
    let w = p.glassBody * (0.5 + 0.5 * Math.cos((t - 0.3) * Math.PI * 1.6));
    if (y >= hiTop && y < hiTop + p.highlightH)
      w += p.glassHiBright * Math.pow(1 - Math.abs((y - hiTop) / Math.max(1, p.highlightH - 1) - 0.5) * 2, p.highlightSharp);
    const d = (t - 0.82) / 0.07;
    w += p.glassReflect * Math.exp(-d * d);
    const rim = Math.min(y, H - 1 - y);
    if (rim < 2) w += p.glassRim * (rim === 0 ? 1 : 0.4);
    return Math.min(1, w);
  };
  const hiTop = Math.round(2 + acrossShift);
  const roll = acrossShift * p.shadeRollGain;   // rows the shading rotates with roll
  for (let y = 0; y < H; y++) {
    // cylinder shading: brightest around 1/3 from top, darkest at the bottom
    const t = Math.max(0, Math.min(1, (y - roll) / (H - 1)));
    let c: [number, number, number];
    if (t < 0.33) c = mix(mix(body, lo, 0.25), body, t / 0.33);
    else c = mix(body, lo, ((t - 0.33) / 0.67) * p.shadeDepth);
    if (y >= hiTop && y < hiTop + p.highlightH) {
      const k = Math.pow(1 - Math.abs((y - hiTop) / Math.max(1, p.highlightH - 1) - 0.5) * 2, p.highlightSharp); // tent
      c = mix(c, hi, Math.min(1, (0.35 + 0.65 * k) * p.highlightBright));
    }
    const gw = glassW(y);
    glassRows[y] = q(scale(mix(glass, ghi, gw), p.brightness));
    c = mix(c, ghi, gw * p.glassOverLiquid);
    rows[y] = q(scale(c, br));
    bubbleIn[y] = q(scale(mix(c, [0, 0, 0], p.bubbleDark), br));
  }
  return { rows, glassRows, body: q(scale(body, br)), glass: q(scale(glass, p.brightness)), bubbleRim: q(scale(hexToRgb(p.bubbleRim), br)), bubbleIn };
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
export const SPRITE_FONT = FONTS.length; // digitFont value that selects the image-based glyphs

/** Image-based glyph sheet (AI-generated metal digits, see tools/make-digit-sprites.py).
 *  Firmware equivalent: one pre-scaled RGB565+A8 table per tube size, generated offline. */
export interface SpriteSheet { cellW: number; cellH: number; widths: number[]; data: Uint8ClampedArray; w: number; h: number; }
interface ScaledGlyph { w: number; h: number; c: Uint16Array; a: Uint8Array; } // a = 0..255 coverage
/** Sheet names in digitFont order starting at SPRITE_FONT (files live in public/assets/<name>.png[.json]). */
export const SPRITE_SHEETS = ['digits-steel', 'digits-brass-steampunk', 'digits-copper-gauge'];
const sprites: (SpriteSheet | null)[] = SPRITE_SHEETS.map(() => null);
const scaledCache = new Map<string, ScaledGlyph[]>();
/** Inject a decoded sheet directly (headless tests / node reference renders). */
export function setSprite(i: number, sheet: SpriteSheet): void { sprites[i] = sheet; scaledCache.clear(); }
export function loadSprites(base: string): void {
  SPRITE_SHEETS.forEach((n, i) => loadSprite(base + n + '.png').then(sh => { sprites[i] = sh; scaledCache.clear(); })
    .catch(e => console.warn('digit sprite not loaded', n, e)));
}
function loadSprite(url: string): Promise<SpriteSheet> {
  return Promise.all([
    fetch(url + '.json').then(r => r.json()),
    new Promise<HTMLImageElement>((ok, err) => { const im = new Image(); im.onload = () => ok(im); im.onerror = err; im.src = url; }),
  ]).then(([meta, im]) => {
    const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
    const ctx = cv.getContext('2d')!; ctx.drawImage(im, 0, 0);
    return { cellW: meta.cellW, cellH: meta.cellH, widths: meta.widths, data: ctx.getImageData(0, 0, im.width, im.height).data, w: im.width, h: im.height };
  });
}
/** Box-filter the sheet glyph d into bw x bh device pixels (once per size; firmware ships the result). */
function scaledGlyphs(sheet: number, bw: number, bh: number, brightness: number, tint: [number, number, number], tintAmt: number): ScaledGlyph[] | null {
  const sprite = sprites[sheet]; if (!sprite) return null;
  const key = `${sheet}:${bw}x${bh}@${brightness}/${tint}/${tintAmt}`; const hit = scaledCache.get(key); if (hit) return hit;
  const out: ScaledGlyph[] = [];
  // tint = multiply by colour (greyscale sheets become bronze/gold/etc.), blended by tintAmt
  const tm = (v: number, ch: number) => v * (1 - tintAmt) + v * (tint[ch] / 255) * tintAmt;
  const sy = bh / sprite.cellH;
  for (let d = 0; d < 10; d++) {
    const gw = Math.max(1, Math.round(sprite.widths[d] * bw / sprite.cellW));
    const sx = gw / sprite.cellW, cx0 = d * sprite.cellW + (sprite.cellW - sprite.widths[d]) / 2;
    const c = new Uint16Array(gw * bh), a = new Uint8Array(gw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < gw; x++) {
      const X0 = Math.floor(cx0 + x / sx), X1 = Math.max(X0 + 1, Math.floor(cx0 + (x + 1) / sx));
      const Y0 = Math.floor(y / sy), Y1 = Math.max(Y0 + 1, Math.floor((y + 1) / sy));
      let r = 0, g = 0, b = 0, al = 0, n = 0;
      for (let Y = Y0; Y < Y1; Y++) for (let X = X0; X < X1; X++) {
        const i = (Y * sprite.w + X) * 4, pa = sprite.data[i + 3];
        r += sprite.data[i] * pa; g += sprite.data[i + 1] * pa; b += sprite.data[i + 2] * pa; al += pa; n++;
      }
      const k = y * gw + x;
      if (al > 0) { c[k] = q(scale([tm(r / al, 0), tm(g / al, 1), tm(b / al, 2)], brightness)); a[k] = Math.round(al / n); }
    }
    out.push({ w: gw, h: bh, c, a });
  }
  scaledCache.set(key, out);
  return out;
}
/** Composites one mark (tick / label) pixel; `cov` is glyph anti-alias coverage 0..1. */
type MarkFn = (x: number, y: number, c: number, cov?: number) => void;

const luma = (c: [number, number, number]): number => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
/** Colour of a mark seen through the liquid: alpha-blended by `liquidTransparency`, then pushed
 *  away from the liquid behind it until the two differ by at least `contrast` in luma.
 *  Without that floor a mid-grey tick is invisible against the highlight band (which covers most
 *  of the upper half of the tube) and against the shaded body alike. `contrast` is `markContrast`
 *  scaled by the layer's brightness trim, so dimming a layer also relaxes its legibility floor —
 *  otherwise the floor would simply undo the dimming wherever the mark sits over liquid.
 *  Firmware note: the liquid behind a mark is the per-row LUT colour, so this whole function
 *  collapses into one extra H-row table per mark colour, built when params change. */
function throughLiquid(bg: number, mark: number, p: Params, contrast: number): number {
  const B = rgb565to888(bg);
  let c = mix(B, rgb565to888(mark), p.liquidTransparency);
  const lb = luma(B), lc = luma(c), d = lc - lb;
  if (Math.abs(d) >= contrast) return q(c);
  const dir = d !== 0 ? Math.sign(d) : lb > 110 ? -1 : 1;      // no room to darken a near-black row: go up
  const target = Math.max(0, Math.min(255, lb + dir * contrast));
  c = dir < 0 ? scale(c, target / Math.max(1, lc))
    : mix(c, [255, 255, 255], Math.min(1, (target - lc) / Math.max(1, 255 - lc)));
  return q(c);
}
/** Mark compositor for one tube. `onTop` marks ignore the liquid and are drawn opaque. */
function markFn(y0: number, edges: Float32Array, p: Params, onTop: boolean, contrast: number): MarkFn {
  const H = edges.length;
  return (x, y, c, cov = 1) => {
    const ry = y - y0;
    const inside = p.remaining ? x >= edges[ry] : x < edges[ry];
    if (!onTop && ry >= 0 && ry < H && x >= 0 && x < PANEL_W && y >= 0 && y < PANEL_H && inside)
      c = throughLiquid(fb[y * PANEL_W + x], c, p, contrast);
    pxa(x, y, c, cov);
  };
}

// ---------------------------------------------------------------------------
// Scale = tick ladder + numeric labels. Both are laid out from the same
// `ticksN` grid, so the labels are measured FIRST and their pixel boxes are
// handed to the tick pass: a tick that would run through a number is dropped,
// leaving a clean gap instead of a line drawn across the glyph.
// ---------------------------------------------------------------------------

/** One numeric label: its text, the glyph advances, and the box it occupies. */
interface Label { text: string; x0: number; x1: number; adv: number[]; }
/** Everything the draw pass and the tick pass need to know about a tube's labels. */
interface Labels {
  list: Label[]; bw: number; bh: number; ry0: number; ry1: number; yTop: number;
  sprite: ScaledGlyph[] | null; font: Font; gap: number; rows: Uint16Array; shadow: number;
}

/** Measure (but do not draw) the labels of one tube. Returns null when digits are off. */
function layoutLabels(y0: number, p: Params, ticksN: number): Labels | null {
  if (!p.digits) return null;
  const minutes = ticksN === 60;
  const every = Math.max(1, Math.round(minutes ? p.digitMinuteStep : p.digitHourStep));
  const kx = minutes ? p.digitScaleXMin : p.digitScaleX, ky = minutes ? p.digitScaleYMin : p.digitScaleY;
  const bottom = minutes ? p.digitBottomMin : p.digitBottom;
  const idx = Math.round(p.digitFont), useSprite = idx >= SPRITE_FONT;
  const font = FONTS[Math.max(0, Math.min(FONTS.length - 1, idx))];
  // sprite glyphs use the same nominal 5x7 em as the bitmap fonts so the scale sliders mean the same thing
  const bw = Math.max(1, Math.round((useSprite ? 5 : font.w) * kx));
  const bh = Math.max(1, Math.round((useSprite ? 7 : font.h) * ky));
  const sprite = useSprite
    ? scaledGlyphs(idx - SPRITE_FONT, bw, bh, p.brightness * p.digitBright, hexToRgb(p.digitTint), p.digitTintAmount)
    : null;
  const gap = sprite ? Math.max(1, Math.round(bw / 5)) : Math.max(1, Math.round(kx));
  const shadow = !sprite && p.digitShadow ? q(scale(hexToRgb(p.digitShadowColor), p.brightness * p.digitBright)) : -1;
  const yBase = y0 + tubeLayout(p).H - 1 - bottom, yTop = yBase - bh + 1;
  const list: Label[] = [];
  for (let i = every; i < ticksN; i += every) {
    const text = minutes && p.digitsLeadingZero ? String(i).padStart(2, '0') : String(i);
    const adv = [...text].map((ch) => sprite?.[ch.charCodeAt(0) - 48]?.w ?? bw);
    const w = adv.reduce((a, b) => a + b + gap, -gap);
    const x0 = Math.round((i * TUBE_LENGTH_PX) / ticksN - w / 2);
    list.push({ text, x0, x1: x0 + w - 1 + (shadow >= 0 ? 1 : 0), adv });
  }
  return { list, bw, bh, yTop, ry0: yTop - y0, ry1: yBase - y0 + (shadow >= 0 ? 1 : 0), sprite, font, gap, rows: digitRowColors(p, bh), shadow };
}

/** Image glyph: per-pixel coverage from the pre-scaled sheet. */
function drawSpriteGlyph(g: ScaledGlyph | undefined, x: number, yTop: number, mark: MarkFn): void {
  if (!g) return;
  for (let dy = 0; dy < g.h; dy++) for (let dx = 0; dx < g.w; dx++) {
    const a = g.a[dy * g.w + dx]; if (!a) continue;
    mark(x + dx, yTop + dy, g.c[dy * g.w + dx], a / 255);
  }
}
/** Bitmap glyph, nearest-neighbour scaled into bw x bh, optional 1 px emboss shadow. */
function drawBitmapGlyph(f: Font, d: number, x: number, yTop: number, bw: number, bh: number,
  rowColors: Uint16Array, shadow: number, mark: MarkFn): void {
  const g = f.g[d]; if (!g) return;
  const msb = 1 << (f.w - 1);
  for (let pass = shadow >= 0 ? 0 : 1; pass < 2; pass++) {
    const off = pass === 0 ? 1 : 0;
    for (let dy = 0; dy < bh; dy++) {
      const row = g[Math.min(f.h - 1, Math.floor((dy * f.h) / bh))];
      for (let dx = 0; dx < bw; dx++) {
        const col = Math.min(f.w - 1, Math.floor((dx * f.w) / bw));
        if (!(row & (msb >> col))) continue;
        mark(x + dx + off, yTop + dy + off, pass === 0 ? shadow : rowColors[dy]);
      }
    }
  }
}
function digitRowColors(p: Params, bh: number): Uint16Array {
  const n = Math.max(1, bh), out = new Uint16Array(n);
  const a = hexToRgb(p.digitColor), b = hexToRgb(p.digitColor2);
  for (let i = 0; i < n; i++) {
    // metallic: bright top, darker middle-low, slight kick back up at the very bottom
    const t = n === 1 ? 0 : i / (n - 1); const u = t < 0.8 ? t / 0.8 : 1 - (t - 0.8) / 0.2 * 0.35;
    out[i] = q(scale(mix(a, b, u), p.brightness * p.digitBright));
  }
  return out;
}
function drawLabels(lb: Labels, mark: MarkFn): void {
  for (const l of lb.list) {
    let x = l.x0;
    for (let i = 0; i < l.text.length; i++) {
      const d = l.text.charCodeAt(i) - 48;
      if (lb.sprite) drawSpriteGlyph(lb.sprite[d], x, lb.yTop, mark);
      else drawBitmapGlyph(lb.font, d, x, lb.yTop, lb.bw, lb.bh, lb.rows, lb.shadow, mark);
      x += l.adv[i] + lb.gap;
    }
  }
}

/** Tick ladder. Majors are both longer AND wider than minors, and are placed every
 *  `tickMajorEvery` UNITS (hours / minutes), not every N-th minor, so they stay put
 *  when the minor step changes. Ticks that would collide with a label are skipped. */
function drawTicks(y0: number, p: Params, ticksN: number, lb: Labels | null, mark: MarkFn): void {
  const minutes = ticksN === 60;
  if (!(minutes ? p.ticksM : p.ticksH)) return;
  const H = tubeLayout(p).H, L = TUBE_LENGTH_PX;
  const step = Math.max(1, Math.round(minutes ? p.tickStepM : p.tickStepH));
  const majorEvery = Math.max(0, Math.round(minutes ? p.tickMajorEveryM : p.tickMajorEveryH));
  const hMin = Math.max(0, Math.round(minutes ? p.tickMinorHeightM : p.tickMinorHeightH));
  const hMaj = Math.max(0, Math.round(minutes ? p.tickMajorHeightM : p.tickMajorHeightH));
  const wMaj = Math.max(1, Math.round(minutes ? p.tickMajorWidthM : p.tickMajorWidthH));
  const br = p.brightness * p.tickBright;
  const cMin = q(scale(hexToRgb(minutes ? p.tickColorM : p.tickColorH), br));
  const cMaj = q(scale(hexToRgb(minutes ? p.tickMajorColorM : p.tickMajorColorH), br));
  const pos = Math.round(minutes ? p.tickPosM : p.tickPosH);
  // A tick is dropped only where it would actually touch a label — same columns AND same rows.
  const hitsLabel = (x: number, ryA: number, ryB: number): boolean =>
    !!lb && ryB >= lb.ry0 && ryA <= lb.ry1 && lb.list.some((l) => x >= l.x0 - 1 && x <= l.x1 + 1);
  for (let i = step; i < ticksN; i += step) {
    const xc = Math.round((i * L) / ticksN);
    const major = majorEvery > 0 && i % majorEvery === 0;
    const h = major ? hMaj : hMin; if (h <= 0) continue;
    const w = major ? wMaj : 1, x0 = xc - ((w - 1) >> 1), c = major ? cMaj : cMin;
    const topHit = hitsLabel(xc, 0, h - 1), botHit = hitsLabel(xc, H - h, H - 1);
    for (let k = 0; k < w; k++) for (let ry = 0; ry < h; ry++) {
      const x = x0 + k;
      if (pos !== 1 && !topHit) mark(x, y0 + ry, c);
      if (pos !== 0 && !botHit) mark(x, y0 + H - 1 - ry, c);
    }
  }
}

export interface Fizz { x: number; y: number; v: number; }
export const fizz: Fizz[][] = [[], []];

/** `fizzCount` is the count for a full tube; density stays constant as the column shortens (`fill` = liquid
 *  length / L). Shake nucleates bubbles: up to 2x with agitation, shrinking back as it decays. */
function ensureFizz(i: number, p: Params, fill: number, agitation = 0): void {
  const arr = fizz[i];
  const want = Math.min(64, Math.floor(p.fizzCount * fill * (1 + (agitation < 0.05 ? 0 : agitation))));
  const H = tubeLayout(p).H;
  while (arr.length < want) arr.push({ x: Math.random(), y: Math.random() * H, v: 0.5 + Math.random() });
  if (arr.length > want) arr.length = want;
}
/** Fizz rises against gravity: along-tilt steers it toward the high end (`fizzDriftGain` = steering gain),
 *  roll tips the rise out of the screen plane (slower on-screen rise), shake (`agitation`) speeds it up. */
export function stepFizz(p: Params, dt: number, along = 0, across = 0, agitation = 0): void {
  const speed = p.fizzSpeed * (1 + 3 * agitation);
  const up = Math.sqrt(Math.max(0.05, 1 - along * along - across * across));
  const vx = (-along * p.fizzDriftGain * speed) / TUBE_LENGTH_PX;
  const H = tubeLayout(p).H;
  for (let i = 0; i < 2; i++) for (const f of fizz[i]) {
    f.y -= speed * f.v * up * dt;
    f.x = Math.max(0, Math.min(1, f.x + vx * f.v * dt));
    if (f.y < 3 || f.y >= H) { f.y = H - 3; f.x = Math.random(); f.v = 0.5 + Math.random(); }
  }
}

/** Fill-edge x for tube-row `ry` (0..H-1), given edge centre `xe`, angle and meniscus.
 *  `tilt` is the smoothed along-tilt (TubeState.edgeLight, -1..1) and reshapes the drop end:
 *  end down (+) -> hydrostatic pressure fills the cap: deeper, rounder, symmetric bulge;
 *  end up (-) -> the drop drains and flattens, and what remains clings to the BOTTOM wall
 *  (a thin tail: bottom contact line extends, top retracts). At rest a mild bottom-cling
 *  remains — liquid in a horizontal tube always sags onto the lower wall. */
export function edgeX(ry: number, xe: number, angleDeg: number, p: Params, tilt = 0): number {
  const H = tubeLayout(p).H, yc = (H - 1) / 2;
  const d = (ry - yc) / yc;                  // -1..1
  const skew = Math.tan((angleDeg * Math.PI) / 180) * (ry - yc);
  const asymEff = p.meniscusAsym * Math.max(0, Math.min(1, 0.4 - 0.6 * tilt));
  const depth = p.meniscusDepth * (1 + p.meniscusTiltGain * tilt) * (1 - asymEff * d);
  return xe + skew + depth * Math.pow(Math.abs(d), p.meniscusPow); // liquid climbs the wall
}

/** Draw one tube. y0 = top of tube in panel coords.
 *  `remaining` mode: the liquid sits at the right end and drains as time passes. The liquid layer is
 *  rendered in a mirrored frame (edge from the right, along-axis signs flipped), the tube rows are then
 *  flipped in place, and the scale is drawn last in panel coordinates. */
export function drawTube(idx: number, y0: number, state: TubeState, p: Params, pal: Palette, ticksN: number): void {
  const H = pal.rows.length, L = TUBE_LENGTH_PX;
  const s = p.remaining ? { ...state, fillPos: -state.fillPos, angle: -state.angle, edgeLight: -state.edgeLight } : state;
  const xe = (p.remaining ? 1 - s.fillTarget : s.fillTarget) * L + s.fillPos;   // edge centre
  // Tilt changes the LIGHT at the fill edge, not the liquid itself: gravity pressing the
  // liquid into the right end brightens the cap glow, draining away from it dims it.
  const lightK = Math.max(0.25, 1 + p.edgeLightGain * s.edgeLight) * (1 + s.agitation);
  ensureFizz(idx, p, Math.max(0, Math.min(1, xe / L)), s.agitation);

  // Step 1: glass background (empty tube) — whole strip
  for (let ry = 0; ry < H; ry++) hspan(y0 + ry, 0, L, pal.glassRows[ry]);

  // Step 3: liquid column — per row a horizontal span from the left cap to the (curved) edge.
  const edges = new Float32Array(H);
  for (let ry = 0; ry < H; ry++) {
    const ex = edgeX(ry, xe, s.angle, p, s.edgeLight);
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
        if (xi + k >= x0) px(xi + k, y0 + ry, blend565(pal.glassRows[ry], pal.rows[ry], t));
      }
    } else if (frac >= 0.5) px(xi, y0 + ry, pal.rows[ry]);
  }

  // Step 3a: front brightening — last `frontBright` px before the edge lerp toward the highlight colour (per row).
  if (p.frontBright > 0) {
    const hiC = q(scale(hexToRgb(p.liquidHi), p.brightness * p.liquidBright));
    // Brighten RELATIVE to each row's shade (weight = row luma / max luma): the flat highlight
    // colour would light up the dark bottom wall near the cap and read as the drop bulging
    // along the bottom. Firmware: the weights fold into the per-row LUT.
    const w = new Float32Array(H); let lmax = 1;
    for (let ry = 0; ry < H; ry++) { w[ry] = luma(rgb565to888(pal.rows[ry])); lmax = Math.max(lmax, w[ry]); }
    for (let ry = 0; ry < H; ry++) {
      const ex = edges[ry]; const xi = Math.floor(ex); const rowK = w[ry] / lmax;
      for (let k = 1; k <= p.frontBright; k++) {
        const x = xi - k; if (x < 0) break;
        const t = (1 - k / p.frontBright); px(x, y0 + ry, blend565(pal.rows[ry], hiC, Math.min(1, t * t * 0.85 * lightK * rowK)));
      }
    }
  }

  // Step 3b: edge glow — a few px past the edge fade from (body*glowStrength) to glass. Ported as a short span of LUT colours.
  if (p.edgeGlow > 0 && p.glowStrength > 0) {
    for (let ry = 0; ry < H; ry++) {
      const ex = edges[ry]; const xs = Math.ceil(ex + (p.edgeSoft > 0 ? Math.round(p.edgeSoft) : 0));
      for (let k = 0; k < p.edgeGlow; k++) {
        const t = (1 - k / p.edgeGlow); const c = blend565(pal.glassRows[ry], pal.rows[ry], Math.min(1, t * t * p.glowStrength * lightK));
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

  // Step 4b: scale (ticks + labels). Outside the liquid they are opaque; inside they are blended by
  // liquidTransparency and held to markContrast — unless ticksOnTop / digitsOnTop print them on the
  // glass in front of the liquid instead. `edges` from step 3 gives inside/outside.
  const drawScale = (): void => {
    const mark = (onTop: boolean, trim: number): MarkFn => markFn(y0, edges, p, onTop, p.markContrast * trim);
    const labels = layoutLabels(y0, p, ticksN);
    drawTicks(y0, p, ticksN, labels, mark(p.ticksOnTop, p.tickBright));
    if (labels) drawLabels(labels, mark(p.digitsOnTop, p.digitBright));
  };
  if (!p.remaining) drawScale();

  // Step 5: fizz dots (inside liquid only)
  if (p.fizz) for (const f of fizz[idx]) {
    const fx = Math.round(f.x * (xe - 6)), fy = Math.round(f.y);
    if (fx < 2 || fx >= edgeX(fy, xe, s.angle, p, s.edgeLight) - 2) continue;
    const c = pal.bubbleRim;
    for (let dy = 0; dy < p.fizzSize; dy++) for (let dx = 0; dx < p.fizzSize; dx++) {
      const inner = p.fizzSize >= 3 && dx > 0 && dy > 0 && dx < p.fizzSize - 1 && dy < p.fizzSize - 1;
      px(fx + dx, y0 + fy + dy, inner ? pal.bubbleIn[fy] : c);
    }
  }

  // Step 6: spirit-level bubble — filled ellipse (darkened body) with 1 px bright rim
  if (p.bubble) {
    const bx = xe - p.bubbleGap - s.edgeLight * p.bubbleTiltGain, by = (H - 1) * p.bubbleY - s.acrossShift * p.bubbleRollGain;
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

  if (p.remaining) {  // flip liquid layer into panel frame, then the scale on top
    for (let ry = 0; ry < H; ry++) {
      const row = (y0 + ry) * PANEL_W;
      for (let a = 0, b = L - 1; a < b; a++, b--) { const t = fb[row + a]; fb[row + a] = fb[row + b]; fb[row + b] = t; }
      edges[ry] = L - edges[ry];
    }
    drawScale();
  }
}

/** Full frame. Bridge zone and margins stay black (we never draw there). */
export function renderFrame(hours: TubeState, minutes: TubeState, p: Params): void {
  fb.fill(0);
  const palH = buildPalette(p, hours.acrossShift);
  const palM = hours.acrossShift === minutes.acrossShift ? palH : buildPalette(p, minutes.acrossShift);
  const lay = tubeLayout(p);
  drawTube(0, lay.yH, hours, p, palH, 12);
  drawTube(1, lay.yM, minutes, p, palM, 60);
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
