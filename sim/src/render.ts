// Renderer: draws into an RGB565 framebuffer (Uint16Array, PANEL_W*PANEL_H) with only
// operations that port 1:1 to the MCU: per-row horizontal spans, a per-row colour LUT,
// a few filled ellipses/dots. Mirrored 1:1 by firmware/src/render.cpp.
import {
  PANEL_W, PANEL_H, TUBE_LENGTH_PX, TUBE_HEIGHT_MAX,
  rgb565, rgb565to888,
} from '@spec/layout';
import type { Params } from './params';
import { columnLen, type TubeState } from './physics';

export const fb = new Uint16Array(PANEL_W * PANEL_H);
const lensScratch = new Uint16Array(PANEL_W * TUBE_HEIGHT_MAX);

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
  tubeBackRows: Uint16Array; // tube-back colour with glass shading per row
  body: number; tubeBack: number; bubbleRim: number; bubbleIn: Uint16Array;
}

/** Top row of the highlight band for highlight angle `lightDeg` (TubeState.light):
 *  the cylinder surface point whose normal makes that angle with the screen normal. */
export function highlightTop(p: Params, H: number, lightDeg: number): number {
  const yc = (H - 1) / 2;
  return Math.round(yc - yc * Math.sin((lightDeg * Math.PI) / 180) - (p.highlightH - 1) / 2);
}

/** Step 0: build the per-row colour LUT. Firmware rebuilds it when the light moves.
 *  Shading blends (lightPhys) a stylised top light (bright at 1/3, dark at the bottom) with a
 *  Lambert cylinder lit from direction 2*light in the cross-section (world-up when physical).
 *  The highlight band sits at `light` in both. The acrylic rod over the panel supplies the real specular. */
export function buildPalette(p: Params, lightDeg = 0): Palette {
  const body = hexToRgb(p.liquid), hi = hexToRgb(p.liquidHi), lo = hexToRgb(p.liquidLo);
  const br = p.brightness * p.liquidBright;   // tube back stays on the panel dimmer alone
  const H = tubeLayout(p).H, yc = (H - 1) / 2;
  const lightRad = (2 * lightDeg * Math.PI) / 180;
  /** Lambert weight 0..1 of row y under the physical light. */
  const lambert = (y: number): number => Math.max(0, Math.cos(Math.asin(Math.max(-1, Math.min(1, (yc - y) / yc))) - lightRad));
  const rows = new Uint16Array(H);
  const bubbleIn = new Uint16Array(H);
  const tubeBackRows = new Uint16Array(H);
  const tubeBack = hexToRgb(p.tubeBack), tubeBack2 = hexToRgb(p.tubeBack2), ghi = hexToRgb(p.glassHi);
  const liquidHiScaled = scale(hi, br), glassHiScaled = scale(ghi, p.brightness);
  /** Glass wall shading weight 0..1 for a row: specular tent on the top wall, a faint band on the
   *  lower wall, brighter outermost rows. */
  const glassW = (y: number): number => {
    const t = y / (H - 1);
    // ambient: style = cylinder lit from above (brightest near 1/3, darkest near 2/3, lifting again at the bottom)
    const amb = 0.5 + 0.5 * Math.cos((t - 0.3) * Math.PI * 1.6);
    let w = p.glassBody * (amb + (lambert(y) - amb) * p.lightPhys);
    if (y >= hiTop && y < hiTop + p.highlightH)
      w += p.glassHiBright * Math.pow(1 - Math.abs((y - hiTop) / Math.max(1, p.highlightH - 1) - 0.5) * 2, p.highlightSharp);
    const d = (t - 0.82) / 0.07;
    w += p.glassReflect * Math.exp(-d * d);
    const rim = Math.min(y, H - 1 - y);
    if (rim < 2) w += p.glassRim * (rim === 0 ? 1 : 0.4);
    return Math.min(1, w);
  };
  const hiTop = highlightTop(p, H, lightDeg);
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const gradient = Math.round(p.tubeBackGradient);
    const backMix = gradient === 1 ? t : gradient === 2 ? 1 - Math.abs(t * 2 - 1)
      : gradient === 3 ? Math.abs(t * 2 - 1) : 0;
    const back = mix(tubeBack, tubeBack2, backMix);
    // style shading: brightest around 1/3 from top, darkest at the bottom
    let c: [number, number, number];
    if (t < 0.33) c = mix(mix(body, lo, 0.25), body, t / 0.33);
    else c = mix(body, lo, ((t - 0.33) / 0.67) * p.shadeDepth);
    if (p.lightPhys > 0) c = mix(c, mix(lo, body, 1 - p.shadeDepth * (1 - lambert(y))), p.lightPhys);
    // A transparent liquid shows the tube back through it: blend the lit liquid toward the
    // (panel-dimmed) back. The highlight is a reflection off the liquid surface, so it goes on
    // after that (undiluted), and the glass wall over both.
    c = scale(c, br);
    c = mix(c, scale(back, p.brightness), p.liquidTransparency);
    if (y >= hiTop && y < hiTop + p.highlightH) {
      const k = Math.pow(1 - Math.abs((y - hiTop) / Math.max(1, p.highlightH - 1) - 0.5) * 2, p.highlightSharp); // tent
      c = mix(c, liquidHiScaled, Math.min(1, (0.35 + 0.65 * k) * p.highlightBright));
    }
    const gw = glassW(y);
    const glassWet = gw * (p.glassOverLiquid + (1 - p.glassOverLiquid) * p.liquidTransparency);
    tubeBackRows[y] = q(scale(mix(back, ghi, gw), p.brightness));
    // Glass shading over the liquid: `glassOverLiquid` of the dry-side weight for an opaque liquid,
    // rising to the full dry-side weight as the liquid turns transparent (the lower reflection
    // band must run continuously across the meniscus of a clear liquid).
    c = mix(c, glassHiScaled, glassWet);
    rows[y] = q(c);
    bubbleIn[y] = q(mix(c, [0, 0, 0], p.bubbleDark));
  }
  return {
    rows, tubeBackRows, body: q(scale(body, br)), tubeBack: q(scale(tubeBack, p.brightness)),
    bubbleRim: q(scale(hexToRgb(p.bubbleRim), br)), bubbleIn,
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
export const SPRITE_FONT = FONTS.length; // digitFont value that selects the image-based glyphs

/** Image-based glyph sheet (AI-generated metal digits, see tools/make-digit-sprites.py).
 *  Firmware equivalent: one pre-scaled RGB565+A8 table per tube size, generated offline. */
export interface SpriteSheet { cellW: number; cellH: number; widths: number[]; data: Uint8ClampedArray; w: number; h: number; }
interface ScaledGlyph { w: number; h: number; c: Uint16Array; a: Uint8Array; } // a = 0..255 coverage
/** Sheet names in digitFont order starting at SPRITE_FONT (files live in public/assets/<name>.png[.json]). */
export const SPRITE_SHEETS = [
  'digits-steel',
  'digits-brass-steampunk',
  'digits-copper-gauge',
  'digits-forged-iron',
  'digits-ivory-enamel',
  'digits-carved-slate',
  'digits-amber-resin',
];
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
function scaledGlyphs(sheet: number, bw: number, bh: number, brightness: number, tint: [number, number, number], tintAmt: number, tone: number): ScaledGlyph[] | null {
  const sprite = sprites[sheet]; if (!sprite) return null;
  const key = `${sheet}:${bw}x${bh}@${brightness}/${tint}/${tintAmt}/${tone}`; const hit = scaledCache.get(key); if (hit) return hit;
  const out: ScaledGlyph[] = [];
  // tint = multiply by colour (greyscale sheets become bronze/gold/etc.), blended by tintAmt
  const tm = (v: number, ch: number) => v * (1 - tintAmt) + v * (tint[ch] / 255) * tintAmt;
  const t = Math.max(-1, Math.min(1, tone));
  const tn = (v: number) => t < 0 ? v * (1 + t) : v + (255 - v) * t;
  const sy = bh / sprite.cellH;
  for (let d = 0; d < 10; d++) {
    const gw = Math.max(1, Math.round(sprite.widths[d] * bw / sprite.cellW));
    const sx = gw / sprite.widths[d], cx0 = d * sprite.cellW + (sprite.cellW - sprite.widths[d]) / 2;
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
      if (al > 0) { c[k] = q(scale([tn(tm(r / al, 0)), tn(tm(g / al, 1)), tn(tm(b / al, 2))], brightness)); a[k] = Math.round(al / n); }
    }
    out.push({ w: gw, h: bh, c, a });
  }
  scaledCache.set(key, out);
  return out;
}
/** Composites one mark (tick / label) pixel; `cov` is glyph anti-alias coverage 0..1.
 *  `rel` = +1 / -1 draws the emboss highlight / shadow of body colour `c`. */
type MarkFn = (x: number, y: number, c: number, cov?: number, rel?: number) => void;
const embossOf = (c: number, rel: number): number =>
  rel > 0 ? q(mix(rgb565to888(c), [255, 255, 255], 0.7)) : q(scale(rgb565to888(c), 0.25));

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
/** Mark compositor for one tube. `onTop` marks ignore the liquid and are drawn opaque.
 *  Emboss pixels derive from the body's through-liquid colour so the relief survives the contrast floor. */
function markFn(y0: number, edges: Edges, p: Params, onTop: boolean, contrast: number): MarkFn {
  const H = edges.hi.length;
  return (x, y, c, cov = 1, rel = 0) => {
    const ry = y - y0;
    const inside = x >= edges.lo[ry] && x < edges.hi[ry];
    if (!onTop && ry >= 0 && ry < H && x >= 0 && x < PANEL_W && y >= 0 && y < PANEL_H && inside)
      c = throughLiquid(fb[y * PANEL_W + x], c, p, contrast);
    if (rel !== 0) c = embossOf(c, rel);
    pxa(x, y, c, cov);
  };
}

/** Compact rear-wall markings. They are deliberately code-drawn so their cost is a few dozen
 *  pixels, and use the same through-liquid compositor as the rear scale. */
function drawTubeBackDecal(idx: number, y0: number, H: number, p: Params, mark: MarkFn): void {
  const mode = Math.round(p.tubeBackDecal), opacity = Math.max(0, Math.min(1, p.tubeBackDecalOpacity));
  if (mode < 1 || mode > 2 || opacity <= 0 || H < 15) return;
  const c = q(scale(hexToRgb(p.tubeBackDecalColor), p.brightness));
  const glyph = (rows: number[], bits: number, x0: number, yy0: number, s: number): void => {
    for (let gy = 0; gy < rows.length; gy++) for (let gx = 0; gx < bits; gx++)
      if (rows[gy] & (1 << (bits - 1 - gx)))
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) mark(x0 + gx * s + dx, yy0 + gy * s + dy, c, opacity);
  };
  const frame = (x0: number, yy0: number, w: number, h: number): void => {
    const a = opacity * 0.65;
    for (let x = x0 + 2; x < x0 + w - 2; x++) { mark(x, yy0, c, a); mark(x, yy0 + h - 1, c, a); }
    for (let y = yy0 + 2; y < yy0 + h - 2; y++) { mark(x0, y, c, a); mark(x0 + w - 1, y, c, a); }
    mark(x0 + 1, yy0 + 1, c, a); mark(x0 + w - 2, yy0 + 1, c, a);
    mark(x0 + 1, yy0 + h - 2, c, a); mark(x0 + w - 2, yy0 + h - 2, c, a);
  };
  const s = H >= 28 ? 2 : 1;
  if (mode === 1) {
    const rows = idx === 0
      ? [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001]
      : [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001];
    const w = 5 * s + 8, h = 7 * s + 8, x0 = TUBE_LENGTH_PX - w - 7, yy0 = y0 + Math.floor((H - h) / 2);
    frame(x0, yy0, w, h); glyph(rows, 5, x0 + 4, yy0 + 4, s);
  } else {
    const digits = idx === 0 ? [1, 2] : [6, 0];
    const w = 7 * s + 8, h = 5 * s + 8, x0 = TUBE_LENGTH_PX - w - 7, yy0 = y0 + Math.floor((H - h) / 2);
    frame(x0, yy0, w, h);
    glyph(FONT_3x5.g[digits[0]], 3, x0 + 4, yy0 + 4, s);
    glyph(FONT_3x5.g[digits[1]], 3, x0 + 4 + 4 * s, yy0 + 4, s);
    mark(x0 - 2, yy0 + (h >> 1), c, opacity * 0.55); mark(x0 + w + 1, yy0 + (h >> 1), c, opacity * 0.55);
  }
}

// ---------------------------------------------------------------------------
// Scale = tick ladder + numeric labels, both laid out from the same `ticksN` grid.
// ---------------------------------------------------------------------------

/** One numeric label: its text, the glyph advances, and the box it occupies. */
interface Label { text: string; x0: number; adv: number[]; }
/** Everything the draw pass and the tick pass need to know about a tube's labels. */
interface Labels {
  list: Label[]; bw: number; bh: number; ry0: number; ry1: number; y0: number; yTop: number; sourceRows: Int16Array;
  /** Rear digits behind air (see `digitDryLens`); same as the wet tables for digits on top. */
  drySourceRows: Int16Array; dryRy0: number; dryRy1: number;
  sprite: ScaledGlyph[] | null; font: Font; gap: number; rows: Uint16Array; shadow: number;
}

/** Destination tube row to source row for independently warped marks. */
function markSourceRows(H: number, lens: number, curve = 1): Int16Array {
  const out = new Int16Array(H), strength = Math.abs(Math.max(-1, Math.min(1, lens)));
  const signedCurve = lens < 0 ? -Math.max(-3, Math.min(3, curve)) : Math.max(-3, Math.min(3, curve));
  const exponent = signedCurve > 0 ? 1 + signedCurve * 2 : 1 / (1 - signedCurve * 2);
  for (let yd = 0; yd < H; yd++) {
    const d = (yd + 0.5 - H / 2) / (H / 2), u = Math.abs(d);
    const warped = signedCurve === 0 ? u : (1 - strength) * u + strength * Math.pow(u, exponent);
    const s = Math.sign(d) * warped;
    out[yd] = Math.max(0, Math.min(H - 1, Math.floor(H / 2 + s * H / 2)));
  }
  return out;
}

/** Measure (but do not draw) the labels of one tube. Returns null when digits are off. */
function layoutLabels(y0: number, p: Params, ticksN: number, acrossTilt: number, fill: number): Labels | null {
  if (!p.digits) return null;
  const minutes = ticksN === 60;
  const every = Math.max(1, Math.round(minutes ? p.digitMinuteStep : p.digitHourStep));
  const kx = minutes ? p.digitScaleXMin : p.digitScaleX, ky = minutes ? p.digitScaleYMin : p.digitScaleY;
  const bottom = (minutes ? p.digitBottomMin : p.digitBottom) + (p.digitsOnTop ? Math.round(acrossTilt * p.topParallax) : 0);
  const idx = Math.round(p.digitFont), useSprite = idx >= SPRITE_FONT;
  const font = FONTS[Math.max(0, Math.min(FONTS.length - 1, idx))];
  // sprite glyphs use the same nominal 5x7 em as the bitmap fonts so the scale sliders mean the same thing
  const bw = Math.max(1, Math.round((useSprite ? 5 : font.w) * kx));
  const bh = Math.max(1, Math.round((useSprite ? 7 : font.h) * ky));
  const sprite = useSprite
    ? scaledGlyphs(idx - SPRITE_FONT, bw, bh, p.brightness * p.digitBright, hexToRgb(p.digitTint), p.digitTintAmount, p.digitTone)
    : null;
  const gap = sprite ? Math.max(1, Math.round(bw / 5)) : Math.max(1, Math.round(kx));
  const shadow = !sprite && p.digitShadow ? q(scale(hexToRgb(p.digitShadowColor), p.brightness * p.digitBright)) : -1;
  const yBase = y0 + tubeLayout(p).H - 1 - bottom, yTop = yBase - bh + 1;
  const H = tubeLayout(p).H;
  const sourceRows = p.digitsOnTop ? markSourceRows(H, p.topLens, p.lensCurve) : markSourceRows(H, p.bottomLens);
  const drySourceRows = p.digitsOnTop ? sourceRows : markSourceRows(H, p.digitDryLens);
  const sourceRy0 = yTop - y0, sourceRy1 = yBase - y0 + (shadow >= 0 ? 1 : 0);
  const rowSpan = (rows: Int16Array): [number, number] => {
    let a = H, b = -1;
    for (let ry = 0; ry < H; ry++) if (rows[ry] >= sourceRy0 && rows[ry] <= sourceRy1) { a = Math.min(a, ry); b = Math.max(b, ry); }
    return [a, b];
  };
  const [ry0, ry1] = rowSpan(sourceRows), [dryRy0, dryRy1] = rowSpan(drySourceRows);
  const list: Label[] = [];
  const start = Math.round(minutes ? p.digitMinuteStart : p.digitHourStart) || every;
  const push = (i: number) => {
    const text = minutes && p.digitsLeadingZero ? String(i).padStart(2, '0') : String(i);
    const adv = [...text].map((ch) => sprite?.[ch.charCodeAt(0) - 48]?.w ?? bw);
    const w = adv.reduce((a, b) => a + b + gap, -gap);
    const m = Math.round(p.cornerR);
    const x0 = Math.max(m, Math.min(TUBE_LENGTH_PX - w - m, Math.round((i * TUBE_LENGTH_PX) / ticksN - w / 2)));
    list.push({ text, x0, adv });
  };
  if (minutes ? p.digitsLastOnlyM : p.digitsLastOnlyH) { const s = minutes ? every : 1, i = Math.floor(Math.min(ticksN - 1e-6, Math.max(0, fill) * ticksN) / s) * s; if (i > 0) push(i); }
  else for (let i = start; i < ticksN; i += every) push(i);
  return { list, bw, bh, y0, yTop, ry0, ry1, sourceRows, drySourceRows, dryRy0, dryRy1, sprite, font, gap, rows: digitRowColors(p, bh), shadow };
}

/** Liquid column bounds per tube row in panel coordinates: liquid where lo <= x < hi. */
export interface Edges { lo: Float32Array; hi: Float32Array; }
/** Which column is behind liquid: `wet(x)`; always true when digits are on top or edges are unknown. */
type WetFn = (x: number) => boolean;
/** Image glyph: per-pixel coverage from the pre-scaled sheet, column by column so each column can
 *  take the wet or dry warp. */
function drawSpriteGlyph(g: ScaledGlyph | undefined, x: number, lb: Labels, wet: WetFn, mark: MarkFn): void {
  if (!g) return;
  const sourceTop = lb.yTop - lb.y0;
  for (let dx = 0; dx < g.w; dx++) {
    const w = wet(x + dx);
    const rows = w ? lb.sourceRows : lb.drySourceRows, a0 = w ? lb.ry0 : lb.dryRy0, a1 = w ? lb.ry1 : lb.dryRy1;
    for (let ry = a0; ry <= a1; ry++) {
      const dy = rows[ry] - sourceTop; if (dy < 0 || dy >= g.h) continue;
      const a = g.a[dy * g.w + dx]; if (!a) continue;
      mark(x + dx, lb.y0 + ry, g.c[dy * g.w + dx], a / 255);
    }
  }
}
/** Bitmap glyph, nearest-neighbour scaled into bw x bh, optional 1 px emboss shadow. */
function drawBitmapGlyph(f: Font, d: number, x: number, lb: Labels, wet: WetFn, mark: MarkFn): void {
  const g = f.g[d]; if (!g) return;
  const msb = 1 << (f.w - 1);
  for (let pass = lb.shadow >= 0 ? 0 : 1; pass < 2; pass++) {
    const off = pass === 0 ? 1 : 0;
    const sourceTop = lb.yTop - lb.y0 + off;
    for (let dx = 0; dx < lb.bw; dx++) {
      const col = Math.min(f.w - 1, Math.floor((dx * f.w) / lb.bw));
      const w = wet(x + dx + off);
      const rows = w ? lb.sourceRows : lb.drySourceRows, a0 = w ? lb.ry0 : lb.dryRy0, a1 = w ? lb.ry1 : lb.dryRy1;
      for (let ry = a0; ry <= a1; ry++) {
        const dy = rows[ry] - sourceTop; if (dy < 0 || dy >= lb.bh) continue;
        const row = g[Math.min(f.h - 1, Math.floor((dy * f.h) / lb.bh))];
        if (!(row & (msb >> col))) continue;
        mark(x + dx + off, lb.y0 + ry, pass === 0 ? lb.shadow : lb.rows[dy]);
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
/** `edges` null = digits on top: everything uses the wet (whole-tube) tables. */
function drawLabels(lb: Labels, _p: Params, edges: Edges | null, mark: MarkFn): void {
  const mid = edges ? edges.hi.length >> 1 : 0;
  const lo = edges ? edges.lo[mid] : 0, hi = edges ? edges.hi[mid] : 0;
  const wet: WetFn = edges ? (x) => x >= lo && x < hi : () => true;
  for (const l of lb.list) {
    let x = l.x0;
    for (let i = 0; i < l.text.length; i++) {
      const d = l.text.charCodeAt(i) - 48;
      if (lb.sprite) drawSpriteGlyph(lb.sprite[d], x, lb, wet, mark);
      else drawBitmapGlyph(lb.font, d, x, lb, wet, mark);
      x += l.adv[i] + lb.gap;
    }
  }
}

/** Tick ladder. Majors are both longer AND wider than minors, and are placed every
 *  `tickMajorEvery` UNITS (hours / minutes), not every N-th minor, so they stay put
 *  when the minor step changes. */
/** `wetRows`/`dryRows`: source-row tables for ticks behind liquid vs behind air (a liquid-filled
 *  cylinder lenses far more than an empty one). `edges` null = every tick uses `wetRows` and full parallax. */
function drawTicks(y0: number, p: Params, ticksN: number, wetRows: Int16Array, dryRows: Int16Array,
  edges: Edges | null, mark: MarkFn, dxFull = 0, dyFull = 0): void {
  const minutes = ticksN === 60;
  if (!(minutes ? p.ticksM : p.ticksH)) return;
  const H = tubeLayout(p).H, L = TUBE_LENGTH_PX;
  const step = Math.max(1, Math.round(minutes ? p.tickStepM : p.tickStepH));
  const majorEvery = Math.max(0, Math.round(minutes ? p.tickMajorEveryM : p.tickMajorEveryH));
  const hMin = Math.max(0, Math.round(minutes ? p.tickMinorHeightM : p.tickMinorHeightH));
  const hMaj = Math.max(0, Math.round(minutes ? p.tickMajorHeightM : p.tickMajorHeightH));
  const wMin = Math.max(1, Math.round(minutes ? p.tickMinorWidthM : p.tickMinorWidthH));
  const wMaj = Math.max(1, Math.round(minutes ? p.tickMajorWidthM : p.tickMajorWidthH));
  const br = p.brightness * p.tickBright;
  const cMin = q(scale(hexToRgb(minutes ? p.tickColorM : p.tickColorH), br));
  const cMaj = q(scale(hexToRgb(minutes ? p.tickMajorColorM : p.tickMajorColorH), br));
  const pos = Math.round(minutes ? p.tickPosM : p.tickPosH);
  const edgeLo = edges ? edges.lo[H >> 1] : 0, edgeHi = edges ? edges.hi[H >> 1] : 0;
  const warpedRange = (sourceRows: Int16Array, sourceA: number, sourceB: number): [number, number] => {
    let a = H, b = -1;
    for (let ry = 0; ry < H; ry++) if (sourceRows[ry] >= sourceA && sourceRows[ry] <= sourceB) {
      a = Math.min(a, ry); b = Math.max(b, ry);
    }
    return [a, b];
  };
  const emboss = Math.max(0, Math.min(1, p.tickEmboss));
  const drawSegment = (x0: number, w: number, c: number, range: [number, number], top: boolean, k: number): void => {
    if (range[1] < 0) return;
    const dx = dxFull * k, dy = dyFull * k;
    const outer = top ? 0 : H - 1;
    const inner = Math.max(0, Math.min(H - 1, top ? range[1] : range[0]));
    const dir = inner >= outer ? 1 : -1;
    const radius = Math.max(1, (H - 1) / 2), centre = (H - 1) / 2;
    const point = (baseY: number): [number, number] => {
      const qy = (baseY - centre) / radius;
      const depth = Math.sqrt(Math.max(0, 1 - qy * qy));
      return [x0 + Math.round(dx * depth), baseY + Math.round(dy * depth)];
    };
    const plot = (x: number, ry: number): void => {
      if (ry < 0 || ry >= H) return;
      if (emboss > 0) { mark(x - 1, y0 + ry, c, emboss, 1); mark(x + w, y0 + ry, c, emboss, -1); }
      for (let k = 0; k < w; k++) mark(x + k, y0 + ry, c);
    };
    let [px0, py0] = point(outer); plot(px0, py0);
    if (outer === inner) return;
    for (let baseY = outer + dir; ; baseY += dir) {
      const [px1, py1] = point(baseY);
      const n = Math.max(1, Math.abs(px1 - px0), Math.abs(py1 - py0));
      for (let j = 1; j <= n; j++) plot(Math.round(px0 + (px1 - px0) * j / n), Math.round(py0 + (py1 - py0) * j / n));
      px0 = px1; py0 = py1;
      if (baseY === inner) break;
    }
  };
  for (let i = step; i < ticksN; i += step) {
    const xc = Math.round((i * L) / ticksN);
    const major = majorEvery > 0 && i % majorEvery === 0;
    const h = major ? hMaj : hMin; if (h <= 0) continue;
    const w = major ? wMaj : wMin, x0 = xc - ((w - 1) >> 1), c = major ? cMaj : cMin;
    const wet = !edges || (xc >= edgeLo && xc < edgeHi);
    const rows = wet ? wetRows : dryRows, k = wet ? 1 : 0;   // air refracts nothing: no parallax
    const topRange = warpedRange(rows, 0, h - 1), botRange = warpedRange(rows, H - h, H - 1);
    if (pos !== 1) drawSegment(x0, w, c, topRange, true, k);
    if (pos !== 0) drawSegment(x0, w, c, botRange, false, k);
  }
}

export interface Fizz { x: number; y: number; v: number; }   // px in the liquid frame; v = size/speed factor
export const fizz: Fizz[][] = [[], []];
const fizzLen = [0, 0];   // liquid length px per tube, set by drawTube

/** `fizzCount` is the count for a full tube; density stays constant as the column shortens.
 *  Shake nucleates bubbles: up to 2x with agitation, shrinking back as it decays. */
function ensureFizz(i: number, p: Params, len: number, agitation = 0): void {
  const arr = fizz[i];
  fizzLen[i] = len;
  const want = Math.min(64, Math.floor(p.fizzCount * (len / TUBE_LENGTH_PX) * (1 + (agitation < 0.05 ? 0 : agitation))));
  const H = tubeLayout(p).H;
  while (arr.length < want) arr.push({ x: Math.random() * len, y: Math.random() * H, v: 0.5 + Math.random() });
  if (arr.length > want) arr.length = want;
}
/** Fizz rises against the in-plane gravity (`along`, `across`) at `fizzSpeed` px/s on both axes:
 *  along-tilt drives it toward the high end (`fizzDriftGain`), across-tilt toward the high edge (`fizzAcrossGain`).
 *  Out-of-plane gravity (face up) reads as a slow screen-up rise (`fizzFlatRise`); shake speeds everything up.
 *  A bubble leaving the liquid on either axis respawns at the low side of that axis. */
export function stepFizz(p: Params, dt: number, along = 0, across = 0, agitation = 0): void {
  if (p.remaining) along = -along; // fizz lives in the mirrored liquid frame (see drawTube)
  const speed = p.fizzSpeed * (1 + 3 * agitation);
  const up = Math.sqrt(Math.max(0, 1 - along * along - across * across));
  const a = Math.max(-1, Math.min(1, across * p.fizzAcrossGain));
  const vy = -speed * ((1 - Math.abs(a)) * up * p.fizzFlatRise + a);   // screen up = -y
  const vx = -speed * Math.max(-1, Math.min(1, along * p.fizzDriftGain));
  const H = tubeLayout(p).H;
  for (let i = 0; i < 2; i++) {
    const len = fizzLen[i];
    for (const f of fizz[i]) {
      f.y += vy * f.v * dt;
      f.x += vx * f.v * dt;
      if (f.y < 3 || f.y >= H) { f.y = vy <= 0 ? H - 3 : 3; f.x = Math.random() * len; f.v = 0.5 + Math.random(); }
      else if (f.x < 0 || f.x > len) { f.x = vx < 0 ? len : 0; f.y = 3 + Math.random() * (H - 6); f.v = 0.5 + Math.random(); }
    }
  }
}

/** Fill-edge x for tube-row `ry` (0..H-1), given edge centre `xe`, angle and meniscus.
 *  `tilt` = smoothed along-tilt (TubeState.edgeLight): end down (+) -> pressure fills the cap
 *  (deeper, rounder); end up (-) -> the drop drains and flattens.
 *  `side` = smoothed across-tilt (TubeState.acrossTilt, + = top edge up): the drop sags onto the
 *  low wall — that contact line extends, the high one retracts; stronger while draining.
 *  Face up (side = 0) the sag is toward the back glass and invisible: symmetric cap. */
/** Row coordinate -1..1 seen through the physical glass: the cap profile is evaluated where the
 *  row will appear, so the rod's vertical magnification does not flatten it (same warp as topLens). */
function lensRow(d: number, p: Params): number {
  const lens = Math.max(-1, Math.min(1, p.meniscusLens)), strength = Math.abs(lens);
  const signedCurve = lens < 0 ? -Math.max(-3, Math.min(3, p.lensCurve)) : Math.max(-3, Math.min(3, p.lensCurve));
  if (strength === 0 || signedCurve === 0) return d;
  const exponent = signedCurve > 0 ? 1 + signedCurve * 2 : 1 / (1 - signedCurve * 2);
  const u = Math.abs(d);
  return Math.sign(d) * ((1 - strength) * u + strength * Math.pow(u, exponent));
}
/** Cap profile: px the contact line at tube-row `ry` leads the surface centre, along +x. Two shapes:
 *  the capillary wall climb `meniscusDepth · |d|^meniscusPow` (thin horns at high powers), and the
 *  pressure bulge — gravity into this end (tilt > 0), the flick/slide inertia `cap` — which pushes the
 *  whole surface centre outward as a circular cap, whatever the wall-climb sign; draining hollows it.
 *  `cap` = TubeState.cap in the edge's own +x sense (the centre leading its contact lines). */
function edgeCap(ry: number, p: Params, tilt: number, side: number, cap: number): number {
  const H = tubeLayout(p).H, yc = (H - 1) / 2;
  const d = lensRow((ry - yc) / yc, p), u = Math.abs(d);   // -1..1, as seen through the glass
  const asymEff = p.meniscusAsym * side * Math.max(0, Math.min(1.5, 1 - tilt)) * Math.sign(p.meniscusDepth);
  const climb = p.meniscusDepth * (1 - asymEff * d) * Math.pow(u, p.meniscusPow);
  const bulge = p.meniscusTiltGain * tilt * Math.abs(p.meniscusDepth) + cap;   // px the centre leads the walls
  return climb - bulge * (1 - Math.sqrt(Math.max(0, 1 - u * u)));               // circular cap: 0 centre, 1 wall
}
/** Meniscus amplitude limiter: the caps of a column `len` px long may not exceed half of it in total
 *  (a short slug is a bead, not two crossing scoops). 1 for any column longer than the features. */
export function capScale(len: number, p: Params, tilt: number, cap: number): number {
  const feat = Math.abs(p.meniscusDepth) * (1 + Math.abs(p.meniscusTiltGain * tilt)) + Math.abs(cap);
  return Math.min(1, Math.max(0, len) / 2 / Math.max(1, feat));
}
export function edgeX(ry: number, xe: number, angleDeg: number, p: Params, tilt = 0, side = 0, cap = 0, k = 1): number {
  const yc = (tubeLayout(p).H - 1) / 2;
  const skew = Math.tan((angleDeg * Math.PI) / 180) * (ry - yc);
  return xe + skew + k * edgeCap(ry, p, tilt, side, cap);
}
/** Home-end edge of a free slug whose centre sits at `xs`: the mirror image of edgeX (gravity
 *  presses the opposite way, the centre leads in -x). Flattens onto the end cap over the last 8 px. */
export function edgeXL(ry: number, xs: number, angleDeg: number, p: Params, tilt = 0, side = 0, cap = 0, k = 1): number {
  const yc = (tubeLayout(p).H - 1) / 2;
  const skew = Math.tan((angleDeg * Math.PI) / 180) * (ry - yc);
  return xs + Math.min(1, xs / 8) * (skew - k * edgeCap(ry, p, -tilt, side, -cap));
}

/** Draw one tube. y0 = top of tube in panel coords.
 *  `remaining` mode: the liquid sits at the right end and drains as time passes. The liquid layer is
 *  rendered in a mirrored frame (edge from the right, along-axis signs flipped), then flipped before
 *  panel-coordinate marks and bubbles are composited. */
export function drawTube(idx: number, y0: number, state: TubeState, p: Params, pal: Palette, ticksN: number,
                         lensEffect = true, lensSmooth = false): void {
  const H = pal.rows.length, L = TUBE_LENGTH_PX;
  // Mirroring flips along-axis quantities only; across-axis ones (angle, light, acrossTilt) are invariant.
  const s = p.remaining ? { ...state, fillPos: -state.fillPos, edgeLight: -state.edgeLight, cap: -state.cap } : state;
  const angle = s.angle;
  const len = columnLen(s.fillTarget, p);
  const xs = p.freeLiquid ? (p.remaining ? L - len - s.slugPos : s.slugPos) : 0; // home-end edge centre
  const xe = xs + len + Math.max(-len, Math.min(len, s.fillPos));              // time-edge centre; slosh can't exceed the volume
  // Tilt changes the LIGHT at the fill edge, not the liquid itself: gravity pressing the
  // liquid into the right end brightens the cap glow, draining away from it dims it.
  const lightK = Math.max(0.25, 1 + p.edgeLightGain * s.edgeLight) * (1 + s.agitation);
  const lightKL = Math.max(0.25, 1 - p.edgeLightGain * s.edgeLight) * (1 + s.agitation);
  const xsI = Math.round(xs);
  const capK = capScale(len, p, s.edgeLight, s.cap);
  const hasLiquid = xe - xs >= 0.5;   // an empty column draws nothing, not even an anti-aliased sliver
  ensureFizz(idx, p, Math.max(0, Math.min(L, xe - xs - 6)), s.agitation);

  // Step 1: tube back — whole strip
  for (let ry = 0; ry < H; ry++) hspan(y0 + ry, 0, L, pal.tubeBackRows[ry]);

  // Step 3: liquid column — per row a horizontal span between the two (curved) edges. The
  // home edge `edgesL` sits on the end cap (x <= 0) unless the liquid is free.
  const edges = new Float32Array(H), edgesL = new Float32Array(H), capX0 = new Int16Array(H);
  for (let ry = 0; ry < H; ry++) {
    const ex = edgeX(ry, xe, angle, p, s.edgeLight, s.acrossTilt, s.cap, capK);
    const exL = p.freeLiquid ? edgeXL(ry, xs, angle, p, s.edgeLight, s.acrossTilt, s.cap, capK) : 0;
    edges[ry] = ex; edgesL[ry] = exL;
    let x0 = 0;
    if (p.cornerR > 0) { // rounded left end cap
      const r = Math.min(p.cornerR, H / 2), yc = (H - 1) / 2, dy = Math.abs(ry - yc);
      if (dy > yc - r) { const k = (dy - (yc - r)) / r; x0 = Math.round(r - Math.sqrt(Math.max(0, 1 - k * k)) * r); }
    }
    capX0[ry] = x0;
    if (!hasLiquid) continue;
    const xi = Math.floor(ex), frac = ex - xi;
    const xiL = Math.floor(exL), fracL = exL - xiL;
    const xa = Math.max(x0, xiL + 1);
    hspan(y0 + ry, xa, xi, pal.rows[ry]);
    if (p.edgeSoft > 0) {  // anti-aliased edge pixel(s), both edges
      const w = Math.max(1, Math.round(p.edgeSoft));
      for (let k = 0; k < w; k++) {
        const t = Math.max(0, Math.min(1, (frac - k) / 1 + (w > 1 ? 0.5 : 0)));
        if (xi + k >= x0) px(xi + k, y0 + ry, blend565(pal.tubeBackRows[ry], pal.rows[ry], t));
        const tL = Math.max(0, Math.min(1, (1 - fracL - k) + (w > 1 ? 0.5 : 0)));
        if (xiL - k >= x0 && xiL - k < xi) px(xiL - k, y0 + ry, blend565(pal.tubeBackRows[ry], pal.rows[ry], tL));
      }
    } else {
      if (frac >= 0.5) px(xi, y0 + ry, pal.rows[ry]);
      if (fracL < 0.5 && xiL >= x0) px(xiL, y0 + ry, pal.rows[ry]);
    }
  }

  // Step 3a: front brightening — last `frontBright` px before the edge lerp toward the highlight colour (per row).
  if (hasLiquid && p.frontBright > 0) {
    const hiC = q(scale(hexToRgb(p.liquidHi), p.brightness * p.liquidBright));
    // Brighten RELATIVE to each row's shade (weight = row luma / max luma): the flat highlight
    // colour would light up the dark bottom wall near the cap and read as the drop bulging
    // along the bottom. Firmware: the weights fold into the per-row LUT.
    const w = new Float32Array(H); let lmax = 1;
    for (let ry = 0; ry < H; ry++) { w[ry] = luma(rgb565to888(pal.rows[ry])); lmax = Math.max(lmax, w[ry]); }
    for (let ry = 0; ry < H; ry++) {
      const ex = edges[ry]; const xi = Math.floor(ex); const rowK = w[ry] / lmax;
      const xiL = Math.floor(edgesL[ry]);
      for (let k = 1; k <= p.frontBright; k++) {
        const x = xi - k; if (x < 0) break;
        if (x >= L) continue;
        const t = (1 - k / p.frontBright); px(x, y0 + ry, blend565(fb[(y0 + ry) * PANEL_W + x], hiC, Math.min(1, t * t * 0.85 * lightK * rowK)));
      }
      if (!p.freeLiquid) continue;
      for (let k = 1; k <= p.frontBright; k++) {   // home edge: lit by the opposite tilt
        const x = xiL + k; if (x >= xi - p.frontBright) break;
        if (x < 0 || x >= L) continue;
        const t = (1 - k / p.frontBright); px(x, y0 + ry, blend565(fb[(y0 + ry) * PANEL_W + x], hiC, Math.min(1, t * t * 0.85 * lightKL * rowK)));
      }
    }
  }

  // Step 3b: edge glow — a few px past the edge fade from liquid to the tube back.
  const softW = p.edgeSoft > 0 ? Math.round(p.edgeSoft) : 0;
  if (hasLiquid && p.edgeGlow > 0 && p.glowStrength > 0) {
    for (let ry = 0; ry < H; ry++) {
      const xg = Math.ceil(edges[ry] + softW), xgL = Math.floor(edgesL[ry]) - softW;
      for (let k = 0; k < p.edgeGlow; k++) {
        const t = (1 - k / p.edgeGlow), xr = xg + k, xl = xgL - k;
        if (xr < L) px(xr, y0 + ry, blend565(pal.tubeBackRows[ry], pal.rows[ry], Math.min(1, t * t * p.glowStrength * lightK)));
        if (p.freeLiquid && xl >= capX0[ry]) px(xl, y0 + ry, blend565(pal.tubeBackRows[ry], pal.rows[ry], Math.min(1, t * t * p.glowStrength * lightKL)));
      }
    }
  }

  // Step 3c: wet film — a receding edge leaves liquid on the glass past its contact lines: a faint
  // liquid-coloured trail over the glow, strongest at the wall rows, fading with TubeState.film*.
  if (hasLiquid && p.wetFilm > 0 && (s.filmFree > 0.02 || (p.freeLiquid && s.filmHome > 0.02))) {
    const yc = (H - 1) / 2;
    for (let ry = 0; ry < H; ry++) {
      const d = (ry - yc) / yc, rowW = 0.4 + 0.6 * d * d;
      const nR = Math.round(p.wetFilm * s.filmFree), nL = p.freeLiquid ? Math.round(p.wetFilm * s.filmHome) : 0;
      const xg = Math.ceil(edges[ry] + softW), xgL = Math.floor(edgesL[ry]) - softW;
      for (let k = 0; k < nR; k++) if (xg + k < L) pxa(xg + k, y0 + ry, pal.rows[ry], 0.35 * s.filmFree * rowW * (1 - k / nR));
      for (let k = 0; k < nL; k++) if (xgL - k >= capX0[ry]) pxa(xgL - k, y0 + ry, pal.rows[ry], 0.35 * s.filmHome * rowW * (1 - k / nL));
    }
  }

  // Step 4: highlight inset — erase highlight near the edge so it reads as a cylinder (optional)
  // (handled by LUT; inset applied by drawing glass over highlight rows past xe - inset? simpler: skip)
  if (hasLiquid && p.highlightInset > 0) {
    const hiTop = highlightTop(p, H, s.light);
    for (let ry = Math.max(0, hiTop); ry < hiTop + p.highlightH && ry < H; ry++) {
      const ex = edges[ry];
      // fade the highlight into the body colour over the last `inset` px
      const bodyRow = pal.rows[Math.min(H - 1, hiTop + p.highlightH + 1)];
      const exL = edgesL[ry], xl = Math.max(0, Math.floor(exL));   // home edge (0 unless the liquid is free)
      for (let x = Math.floor(ex - p.highlightInset); x < Math.floor(ex); x++) {
        if (x < xl) continue;   // never outside the column
        const t = (x - (ex - p.highlightInset)) / p.highlightInset; // 0..1 toward edge
        px(x, y0 + ry, blend565(pal.rows[ry], bodyRow, t));
      }
      for (let x = xl; x < xl + p.highlightInset && x < ex; x++) {
        const t = 1 - (x - xl) / p.highlightInset;
        px(x, y0 + ry, blend565(pal.rows[ry], bodyRow, t));
      }
    }
  }

  // Panel-frame column bounds for the mark compositor (liquid where lo <= x < hi).
  const bounds: Edges = p.remaining ? { lo: new Float32Array(H), hi: new Float32Array(H) } : { lo: edgesL, hi: edges };
  if (p.remaining) {
    for (let ry = 0; ry < H; ry++) {
      const row = (y0 + ry) * PANEL_W;
      for (let a = 0, b = L - 1; a < b; a++, b--) { const t = fb[row + a]; fb[row + a] = fb[row + b]; fb[row + b] = t; }
      bounds.lo[ry] = L - edges[ry]; bounds.hi[ry] = L - edgesL[ry];
    }
  }

  // Rear marks are composited through the liquid, before bubbles.
  drawTubeBackDecal(idx, y0, H, p, markFn(y0, bounds, p, false, p.markContrast * p.tubeBackDecalOpacity));
  const labels = layoutLabels(y0, p, ticksN, state.acrossTilt, state.fillTarget);
  const drawTickLayer = (onTop: boolean): void => {
    if (p.ticksOnTop === onTop) {
      const wetRows = markSourceRows(H, p.tickLens);
      const dryRows = onTop ? wetRows : markSourceRows(H, p.tickDryLens);
      const dx = onTop ? 0 : -state.edgeLight * p.tickParallax;
      const dy = onTop ? 0 : state.acrossTilt * p.tickParallax;
      drawTicks(y0, p, ticksN, wetRows, dryRows, onTop ? null : bounds,
        markFn(y0, bounds, p, onTop, p.markContrast * p.tickBright), dx, dy);
    }
  };
  const drawDigitLayer = (onTop: boolean): void => {
    if (labels && p.digitsOnTop === onTop)
      drawLabels(labels, p, onTop ? null : bounds, markFn(y0, bounds, p, onTop, p.markContrast * p.digitBright));
  };
  drawTickLayer(false);
  drawDigitLayer(false);
  const mapX = (x: number): number => p.remaining ? L - 1 - x : x;
  const span = (y: number, xa: number, xb: number, c: number): void => {
    if (p.remaining) hspan(y, L - 1 - xb, L - xa, c);
    else hspan(y, xa, xb + 1, c);
  };

  // Step 5: fizz — anti-aliased discs at float positions, squashed vertically by the local lens
  // magnification so they come out round after applyLens (size >= 3: darker interior, bright rim).
  if (p.fizz) {
    const mag = lensMagRows(H, p);
    for (const f of fizz[idx]) {
      const fy = Math.max(0, Math.min(H - 1, Math.round(f.y)));
      if (f.x + xs < edgesL[fy] + 2 || f.x + xs >= edges[fy] - 2) continue;   // render-frame edges
      const r = p.fizzSize / 2 * (1 + (f.v - 1) * p.fizzSizeVar);
      const m = mag[fy], ry = r / m, off = r * p.fizzShadeOff;   // dark core shifted lower-right (in lens-squashed space)
      for (let iy = Math.floor(f.y - ry - 1); iy <= Math.ceil(f.y + ry); iy++) {
        if (iy < 0 || iy >= H) continue;
        for (let ix = Math.floor(f.x - r - 1); ix <= Math.ceil(f.x + r); ix++) {
          const dx = ix + 0.5 - f.x, dy = (iy + 0.5 - f.y) * m;
          const d = Math.sqrt(dx * dx + dy * dy), cov = Math.min(1, r + 0.5 - d);
          if (cov <= 0) continue;
          const cx = dx - off, cy = dy - off, dc = Math.sqrt(cx * cx + cy * cy);
          pxa(mapX(ix + xsI), y0 + iy, r >= 1.5 && dc < r - 1 - off ? pal.bubbleIn[fy] : pal.bubbleRim, cov);
        }
      }
    }
  }

  // Step 6: spirit-level bubble — filled ellipse (darkened body) with 1 px bright rim
  if (p.bubble) {
    const bx = xe - p.bubbleGap - s.edgeLight * p.bubbleTiltGain, by = (H - 1) * p.bubbleY - (H - 1) / 2 * s.acrossTilt * p.bubbleRollGain;   // bubble rises toward the high wall
    const rx = p.bubbleW / 2, ry_ = p.bubbleH / 2;
    if (bx - rx > xs + 2) {
      for (let yy = Math.floor(by - ry_); yy <= Math.ceil(by + ry_); yy++) {
        const dy = (yy - by) / ry_;
        if (Math.abs(dy) > 1) continue;
        const hw = Math.sqrt(1 - dy * dy) * rx;
        const xa = Math.round(bx - hw), xb = Math.round(bx + hw);
        const ryi = Math.max(0, Math.min(H - 1, yy));
        span(y0 + yy, xa, xb, pal.bubbleIn[ryi]);
        px(mapX(xa), y0 + yy, pal.bubbleRim); px(mapX(xb), y0 + yy, pal.bubbleRim);
      }
      // top/bottom rim rows
      const yt = Math.round(by - ry_), yb = Math.round(by + ry_);
      span(y0 + yt, Math.round(bx - rx * 0.45), Math.round(bx + rx * 0.45), pal.bubbleRim);
      span(y0 + yb, Math.round(bx - rx * 0.45), Math.round(bx + rx * 0.45), pal.bubbleRim);
    }
  }
  drawTickLayer(true);
  if (lensEffect) applyLens(y0, H, p, lensSmooth);
  drawDigitLayer(true);
}

/** Dest rows per source row under the rendered lens plus the physical glass (`topLens`), times a
 *  center-weighted `fizzSquash`, so pre-lens sprites can be pre-squashed. */
let lensMagCache: { key: string; rows: Float32Array } | null = null;
function lensMagRows(H: number, p: Params): Float32Array {
  const key = `${H}:${p.lens}:${p.topLens}:${p.lensCurve}:${p.fizzSquash}`;
  if (lensMagCache && lensMagCache.key === key) return lensMagCache.rows;
  const rows = new Float32Array(H).fill(1);
  const lens = Math.max(-1, Math.min(1, p.lens + p.topLens)), curve = Math.max(-3, Math.min(3, p.lensCurve));
  const signedCurve = lens < 0 ? -curve : curve, strength = Math.abs(lens);
  if (strength !== 0 && signedCurve !== 0) {
    const e = signedCurve > 0 ? 1 + signedCurve * 2 : 1 / (1 - signedCurve * 2);
    rows.fill(0);
    for (let yd = 0; yd < H; yd++) {
      const d = (yd + 0.5 - H / 2) / (H / 2), u = Math.max(1e-3, Math.abs(d));
      const s = Math.sign(d) * ((1 - strength) * u + strength * Math.pow(u, e));
      const src = Math.max(0, Math.min(H - 1, Math.floor(H / 2 + s * H / 2)));
      rows[src] = Math.max(0.2, Math.min(5, 1 / ((1 - strength) + strength * e * Math.pow(u, e - 1))));
    }
    let last = 0;
    for (let y = 0; y < H; y++) if (rows[y] > 0) { last = rows[y]; break; }
    for (let y = 0; y < H; y++) rows[y] > 0 ? (last = rows[y]) : (rows[y] = last);
  }
  // Extra squash is center-weighted: full fizzSquash at mid-height, ~1 at the top/bottom edges.
  for (let y = 0; y < H; y++) { const d = (y + 0.5 - H / 2) / (H / 2); rows[y] *= 1 + (p.fizzSquash - 1) * (1 - d * d); }
  lensMagCache = { key, rows };
  return rows;
}

function applyLens(y0: number, H: number, p: Params, smooth: boolean): void {
  const lens = Math.max(-1, Math.min(1, p.lens));
  const curve = Math.max(-3, Math.min(3, p.lensCurve));
  const signedCurve = lens < 0 ? -curve : curve;
  const strength = Math.abs(lens);
  if (strength === 0 || signedCurve === 0) return;
  const exponent = signedCurve > 0 ? 1 + signedCurve * 2 : 1 / (1 - signedCurve * 2);
  if (smooth) lensScratch.set(fb.subarray(y0 * PANEL_W, (y0 + H) * PANEL_W));
  const sourceRow = (yd: number): number => {
    const d = (yd + 0.5 - H / 2) / (H / 2), u = Math.abs(d);
    const s = Math.sign(d) * ((1 - strength) * u + strength * Math.pow(u, exponent));
    return Math.max(0, Math.min(H - 1, H / 2 + s * H / 2 - (smooth ? 0.5 : 0)));
  };
  const copyRow = (yd: number): void => {
    const sy = sourceRow(yd);
    const dst = (y0 + yd) * PANEL_W;
    if (!smooth) {
      const src = (y0 + Math.floor(sy)) * PANEL_W;
      if (src !== dst) fb.copyWithin(dst, src, src + PANEL_W);
      return;
    }
    const a = Math.floor(sy), b = Math.min(H - 1, a + 1), t = sy - a;
    const rowA = a * PANEL_W, rowB = b * PANEL_W;
    for (let x = 0; x < PANEL_W; x++) fb[dst + x] = blend565(lensScratch[rowA + x], lensScratch[rowB + x], t);
  };
  const mid = Math.floor(H / 2);
  if (signedCurve > 0) {
    for (let yd = 0; yd < mid; yd++) copyRow(yd);
    for (let yd = H - 1; yd >= mid; yd--) copyRow(yd);
  } else {
    for (let yd = mid - 1; yd >= 0; yd--) copyRow(yd);
    for (let yd = mid; yd < H; yd++) copyRow(yd);
  }
}

/** Full frame. Bridge zone and margins stay black (we never draw there). */
export function renderFrame(hours: TubeState, minutes: TubeState, p: Params, lensEffect = true, lensSmooth = false): void {
  fb.fill(0);
  const palH = buildPalette(p, hours.light);
  const palM = hours.light === minutes.light ? palH : buildPalette(p, minutes.light);
  const lay = tubeLayout(p);
  drawTube(0, lay.yH, hours, p, palH, 12, lensEffect, lensSmooth);
  drawTube(1, lay.yM, minutes, p, palM, 60, lensEffect, lensSmooth);
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
