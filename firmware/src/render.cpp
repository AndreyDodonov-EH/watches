#include "render.h"
#include "gen/sprites_gen.h"
#include "layout.h"
#include <math.h>
#include <string.h>
#include <stdlib.h>
#include <esp_heap_caps.h>
#include <esp_random.h>

// ---------------------------------------------------------------------------------------------
// helpers — same maths as the sim (colours are float RGB triplets, quantised to 565 at the end)
// ---------------------------------------------------------------------------------------------
// The ESP32-S3 FPU has no min/max/floor/ceil (nor divide or sqrt) instructions: libm fminf/fmaxf/floorf/ceilf
// are out-of-line calls, a dozen per pixel in the edge loops. These inline forms return the same value for
// every non-NaN input (floor/ceil keep NaN; ffloor(-0) is +0, which no caller can tell apart).
static inline float fmn(float a, float b) { return b < a ? b : a; }
static inline float fmx(float a, float b) { return a < b ? b : a; }
static inline float ffloor(float x) {
  if (!(fabsf(x) < 8388608.0f)) return x;   // |x| >= 2^23 is already integral (or inf / NaN)
  const float t = (float)(int)x;
  return t > x ? t - 1 : t;
}
static inline float fceil(float x) {
  if (!(fabsf(x) < 8388608.0f)) return x;
  const float t = (float)(int)x;
  return t < x ? t + 1 : t;
}
struct RGB { float r, g, b; };
static inline float jround(float x) { return ffloor(x + 0.5f); }           // JS Math.round
static inline float clampf(float v, float lo, float hi) { return v < lo ? lo : v > hi ? hi : v; }
static inline RGB hexToRgb(uint32_t v) { return { (float)((v >> 16) & 0xff), (float)((v >> 8) & 0xff), (float)(v & 0xff) }; }
static inline RGB mix(RGB a, RGB b, float t) { return { a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t }; }
static inline RGB scale(RGB a, float k) { return { a.r * k, a.g * k, a.b * k }; }
static inline uint16_t rgb565(int r, int g, int b) { return (uint16_t)(((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3)); }
static inline uint16_t q(RGB c) {
  return rgb565((int)jround(clampf(c.r, 0, 255)), (int)jround(clampf(c.g, 0, 255)), (int)jround(clampf(c.b, 0, 255)));
}
static inline RGB to888(uint16_t c) {
  int r5 = (c >> 11) & 0x1f, g6 = (c >> 5) & 0x3f, b5 = c & 0x1f;
  return { (float)((r5 << 3) | (r5 >> 2)), (float)((g6 << 2) | (g6 >> 4)), (float)((b5 << 3) | (b5 >> 2)) };
}
// Integer lerp between two 565 colours. t is quantised to 1/256; rounding matches the sim's
// jround(a + (b-a)*t), expanding channels to RGB888 and using +128 for round-half-up.
static inline void expand565(uint16_t c, int &r, int &g, int &b) {
  int r5 = (c >> 11) & 0x1f, g6 = (c >> 5) & 0x3f, b5 = c & 0x1f;
  r = (r5 << 3) | (r5 >> 2); g = (g6 << 2) | (g6 >> 4); b = (b5 << 3) | (b5 >> 2);
}
// Same exact RGB888 interpolation, with red and blue in separate 16-bit lanes.
static inline uint16_t blend565T(uint16_t a, uint16_t b, int T) {
  if (T <= 0) return a;
  if (T >= 256) return b;
  const uint32_t a5 = ((a >> 8) & 0xf8u) | ((uint32_t)(a & 31) << 19);
  const uint32_t b5 = ((b >> 8) & 0xf8u) | ((uint32_t)(b & 31) << 19);
  const uint32_t arb = a5 | ((a5 >> 5) & 0x00070007u), brb = b5 | ((b5 >> 5) & 0x00070007u);
  const uint32_t ag6 = (a >> 5) & 63, bg6 = (b >> 5) & 63;
  const uint32_t ag = (ag6 << 2) | (ag6 >> 4), bg = (bg6 << 2) | (bg6 >> 4);
  // A lane never exceeds 255*256+128. Unsigned wrap preserves packed-lane borrows.
  const uint32_t rb = (arb << 8) + (brb - arb) * (uint32_t)T + 0x00800080u;
  const uint32_t g = (ag << 8) + (bg - ag) * (uint32_t)T + 128;
  return (uint16_t)((rb & 0xf800u) | ((g >> 5) & 0x07e0u) | (rb >> 27));
}
static inline uint16_t blend565(uint16_t a, uint16_t b, float t) {
  return blend565T(a, b, (int)(t * 256 + 0.5f));
}
// Dried-trace fill of one strip row over [x0, x1): one colour, alpha traceA[x] * rowW / 256 per
// column. Bit-identical to pxaT/blend565T — a + (((b - a) * T + 128) >> 8) equals
// floor((a * (256 - T) + b * T + 128) / 256) — at a fraction of the work: r and b ride as two 16-bit
// lanes of one 32-bit word (a lane peaks at 255 * 256 + 128, never carrying into the other), the
// foreground expands once, and the pixel is read and written in the strip's byte-swapped layout
// (r5 at bits 3-7, b5 at 8-12, g6 split: low 3 bits at 13-15, high 3 at 0-2), so no bswap per pixel.
// noinline: inside drawTube the loop shared a register file with hundreds of locals and spilled every
// iteration; on its own it stays in registers (17.8 -> 5.7 ms for a fully smeared tube).
static void __attribute__((noinline)) traceFillRow(uint16_t *row, const uint16_t *traceA, int x0, int x1, int rowW, uint16_t fg) {
  const uint16_t fgBE = __builtin_bswap16(fg);
  int fr, fgg, fb; expand565(fg, fr, fgg, fb);
  const uint32_t frb = (uint32_t)fr | ((uint32_t)fb << 16), fgG = (uint32_t)fgg;
  for (int x = x0; x < x1; x++) {
    const int T = (traceA[x] * rowW) >> 8;   // sim: min(1, traceA * rowW)
    if (T >= 256) { row[x] = fgBE; continue; }
    if (!T) continue;
    const uint32_t w = row[x];
    const uint32_t g6 = ((w & 7) << 3) | (w >> 13);
    // Position both 5-bit channels together, then replicate their high bits in parallel.
    const uint32_t rb5 = (w & 0xf8u) | (((w >> 8) & 0x1fu) << 19);
    const uint32_t rb = rb5 | ((rb5 >> 5) & 0x00070007u);
    const uint32_t g = (g6 << 2) | (g6 >> 4);
    // a*(256-T)+b*T == (a<<8)+(b-a)*T, including unsigned wrap of the packed lanes.
    // One multiply per packed colour instead of two; final lanes and rounding are unchanged.
    const uint32_t rbo = (rb << 8) + (frb - rb) * (uint32_t)T + 0x00800080u;
    const uint32_t go = ((g << 8) + (fgG - g) * (uint32_t)T + 128) >> 8;
    row[x] = (uint16_t)(((rbo >> 8) & 0xF8) | ((rbo >> 27) << 8) | (go >> 5) | (((go >> 2) & 7) << 13));
  }
}
static inline int alphaT(float t) { return (int)(t * 256 + 0.5f); }
// Per-row edge loops of drawTube, noinline for the same reason as traceFillRow (register pressure in the
// giant function). `row` is the strip row (byte-swapped 565); each is the exact loop it replaced.
static inline void rowPxa(uint16_t *row, int x, uint16_t c, float t) {   // Tube::pxa on a strip row
  row[x] = __builtin_bswap16(t >= 1 ? c : blend565(__builtin_bswap16(row[x]), c, t));
}
// Step 3 soft-edge AA ramp plus folded glow, time edge: rightwards from a0 until the alpha reaches 0.
static void __attribute__((noinline)) rampRowR(uint16_t *row, int a0, int aEnd, float ex, float hw, float invW, float invGlow,
                                               bool glow, float glowStrength, float lightK, int x0, int solidLo, int solidHi,
                                               bool trace, uint16_t back, uint16_t fg) {
  for (int x = a0; x <= aEnd; x++) {
    float t = glow ? fmx(0, 1 - (x + 0.5f - ex) * invGlow) : 0;
    float a = fmn(1, clampf((ex + hw - x - 0.5f) * invW, 0, 1) + t * t * glowStrength * lightK);
    if (a <= 0) break;
    if (a >= 1 && x >= solidLo && x < solidHi) continue;   // the span already drew it full
    if (x >= x0 && x < PANEL_W) {
      if (trace) rowPxa(row, x, fg, a);
      else row[x] = __builtin_bswap16(blend565(back, fg, a));
    }
  }
}
// Same, home edge: leftwards from xStart; only [x0, xi) is drawn.
static void __attribute__((noinline)) rampRowL(uint16_t *row, int xStart, int bEnd, float exL, float hw, float invW, float invGlow,
                                               bool glow, float glowStrength, float lightKL, int x0, int xi, int solidLo, int solidHi,
                                               bool trace, uint16_t back, uint16_t fg) {
  if (bEnd < x0) bEnd = x0;   // walking left: every x < x0 is skipped anyway
  for (int x = xStart; x >= bEnd; x--) {
    float t = glow ? fmx(0, 1 - (exL - (x + 0.5f)) * invGlow) : 0;
    float a = fmn(1, clampf((x + 0.5f - exL + hw) * invW, 0, 1) + t * t * glowStrength * lightKL);
    if (a <= 0) break;
    if (x < x0 || x >= xi || x >= PANEL_W) continue;
    if (a >= 1 && x >= solidLo && x < solidHi) continue;
    if (trace) rowPxa(row, x, fg, a);
    else row[x] = __builtin_bswap16(blend565(back, fg, a));
  }
}
// newlib's sqrtf is a bit-by-bit software loop here. Reciprocal-sqrt seed + 3 Newton steps: relative error <= 2.1e-7
// against sqrtf for 1e-30 <= x < 1200 (below that it returns < 1e-10); as an 8-bit coverage it moved 1 step in
// 2.5e-7 of the samples. Not for values that must match the sim bit for bit.
static inline float sqrtApprox(float x) {
  uint32_t i; memcpy(&i, &x, 4); i = 0x5f3759dfu - (i >> 1);
  float y; memcpy(&y, &i, 4);
  const float hx = 0.5f * x;
  y = y * (1.5f - hx * y * y); y = y * (1.5f - hx * y * y); y = y * (1.5f - hx * y * y);
  return x * y;
}
// Step 5 fizz: one row of an AA bubble disc (see drawTube). Coverage and core are decided from squared distances
// with a 1e-4 relative margin that float rounding cannot cross; a root is taken only in the anti-aliased ring
// (approximate, see sqrtApprox) and in the core's margin (exact).
struct DiscRow {
  float fx, dy, r, in2, out2, off, kc, core2Lo, core2Hi, wallT;
  float sR, sL, bR, bL, veilA, pullR, pullL;   // surface fronts, band widths, FOAM_VEIL x stroke opacity, pulls
  bool core, mirror; int xsI, L; uint16_t cIn, cRim;
};
static void __attribute__((noinline)) discRow(uint16_t *row, int ixa, int ixb, const DiscRow &d) {
  const float fx = d.fx, dy = d.dy, dy2 = dy * dy, r = d.r, in2 = d.in2, out2 = d.out2, off = d.off, wallT = d.wallT;
  const float sR = d.sR, sL = d.sL, bR = d.bR, bL = d.bL;
  for (int ix = ixa; ix <= ixb; ix++) {
    const float dx = ix + 0.5f - fx;
    const float d2 = dx * dx + dy2;
    if (d2 >= out2) continue;   // d > r + 0.5: no coverage
    float cov = (d2 <= in2 ? 1.0f : fmn(1, r + 0.5f - sqrtApprox(d2))) * wallT;
    if (cov <= 0) continue;
    // Veil by the pixel's footprint over each band [profile, profile +- width]: continuous as the edge moves.
    if (ix + 1 > sR && bR > 0) { const float a1 = fmn(ix + 1, sR + bR), a0 = fmx(ix, sR);
      if (a1 > a0) { const float q = ((a0 + a1) / 2 - sR) / bR; cov *= 1 - d.veilA * (a1 - a0) * (1 - q) * (1 - d.pullR * q); } }
    if (ix < sL && bL > 0) { const float a1 = fmn(ix + 1, sL), a0 = fmx(ix, sL - bL);
      if (a1 > a0) { const float q = (sL - (a0 + a1) / 2) / bL; cov *= 1 - d.veilA * (a1 - a0) * (1 - q) * (1 - d.pullL * q); } }
    const float cx = dx - off, cy = dy - off, dc2 = cx * cx + cy * cy;
    const bool inCore = d.core && (dc2 < d.core2Lo || (dc2 <= d.core2Hi && sqrtf(dc2) < d.kc));
    const int x = d.mirror ? d.L - 1 - (ix + d.xsI) : ix + d.xsI;
    if (x >= 0 && x < PANEL_W) rowPxa(row, x, inCore ? d.cIn : d.cRim, cov);
  }
}
// Step 3e concave surface band over [xa, xb): pixel-footprint stroke from the inner shoulder to the outer
// colour at interior opacity `fill` (surfaceFill), thinned by the receding pull, the blick (`blickK`: this
// row's specular weight, peaking mid-dish) and the lit rim. See sim.
static void __attribute__((noinline)) bandRow(uint16_t *row, int xa, int xb, float xm, int dir, float hw, float wEff, float invWidth,
                                              float a, float fill, float blickK, float pull, float rimK, uint16_t inner, uint16_t outer, uint16_t liquid, uint16_t hiC, uint16_t rimC) {
  if (xa < 0) xa = 0; if (xb > PANEL_W) xb = PANEL_W;
  const float rimLo = fmx(0, wEff - 1);
  for (int x = xa; x < xb; x++) {
    const float t = dir * (x + 0.5f - xm);
    const float lo = fmx(t - 0.5f, -hw), hi = fmn(t + 0.5f, wEff);
    const float coverage = fmx(0, hi - lo);
    if (coverage <= 0) continue;
    const float u = clampf(((lo + hi) * 0.5f + hw) * invWidth, 0, 1);
    const float us = u * u * (3 - 2 * u);
    const uint16_t c = blend565(inner, outer, us);
    const float af = a * fill * coverage * (1 - pull * us);
    const float ab = a * blickK * coverage * 4 * u * (1 - u);
    const float rimCoverage = fmx(0, hi - fmx(lo, rimLo));
    const float ar = a * rimK * rimCoverage;
    // fill, blick and rim composite as ONE write per pixel (premultiplied sum), so the fixed-point
    // rounding is taken once; a single layer takes the plain path (see sim). The division runs only
    // on multi-layer pixels: the 1-2 rim px per row and the blick rows.
    RGB P{0, 0, 0}; float A = 0; int nL = 0; uint16_t cLast = 0;
    auto layer = [&](uint16_t col, float al) {
      if (al < 1 / 255.0f) return;
      const RGB C = to888(col); const float k = 1 - al;
      P.r = P.r * k + C.r * al; P.g = P.g * k + C.g * al; P.b = P.b * k + C.b * al;
      A = A * k + al; nL++; cLast = col;
    };
    layer(pull > 0 ? blend565(c, liquid, pull) : c, af); layer(hiC, fmn(1, ab)); layer(rimC, fmn(1, ar));
    if (nL == 1) rowPxa(row, x, cLast, A);
    else if (nL > 1) { const float inv = 1 / A; rowPxa(row, x, q({P.r * inv, P.g * inv, P.b * inv}), A); }
  }
}
static inline float luma(RGB c) { return 0.299f * c.r + 0.587f * c.g + 0.114f * c.b; }

// Ambient-light desaturation (params.ambientLight, sim ambientize): a colour brighter than the
// diffuse body luma reads as a reflection of the neutral room light — grey of the same luma —
// instead of the liquid glowing brighter in its own colour. Full desaturation at twice the body luma.
// Callers scale amt by the liquid's opacity (ambientAmt): bright areas of a transparent liquid are
// mostly light transmitted through it (tinted), so full desaturation would leave it colourless.
static inline RGB ambientize(RGB c, float bodyL, float amt) {
  if (amt <= 0) return c;
  float l = luma(c);
  float k = amt * fmn(1, fmx(0, (l - bodyL) / bodyL));
  return k > 0 ? mix(c, RGB{l, l, l}, k) : c;
}
// Diffuse body luma: the ambientize reference (sim ambientBodyL).
static inline float ambientBodyL(const Params &p) {
  return fmx(1, luma(scale(hexToRgb(p.liquid), p.brightness * p.liquidBright)));
}
// Effective ambientize amount: the knob, scaled down by transparency (sim ambientAmt).
static inline float ambientAmt(const Params &p) {
  return p.ambientLight * (1 - clampf(p.liquidTransparency, 0, 1));
}

// Per-column streak factor 0.82..1 for the dried traces (subtle texture, not stripes) — the same
// integer hash as the sim's traceStreak, so both smears show identical striations (no shimmer).
static inline float traceStreak(uint32_t n) {
  uint32_t h = n * 2654435761u + 0x9E3779B9u;
  h ^= h >> 15; h *= 2246822519u; h ^= h >> 13;
  return 0.82f + 0.18f * ((h >> 16) * (1.0f / 65535.0f));
}
// Value→alpha gamma for the traces (must match sim render.ts): lifts the mid values so a dried
// stain (~0.2–0.5 of full) stays clearly visible instead of drowning in the opacity stack.
// Applied through a lerped 256-entry LUT (built in buildLuts) — powf per column per frame is too
// hot, and the sim indexes the same table, so the two smears stay bit-close.
#define TRACE_GAMMA 0.65f
static float LUT_traceGamma[256];
static inline float traceGamma(float t) {   // t in 0..1
  const float sc = t * 255.0f;
  const int i = sc >= 254.0f ? 254 : (int)sc;
  const float f = sc - i;
  return LUT_traceGamma[i] + f * (LUT_traceGamma[i + 1] - LUT_traceGamma[i]);
}

// Per-channel LUTs built once with the exact float formulas they replace (bit-exact with the sim):
// sprite alpha 0..255 -> blend fraction; tick emboss highlight / shadow of an expanded 565 channel.
static uint16_t LUT_alphaT16[256];
static uint8_t LUT_embHi[256], LUT_embLo[256];
static void buildLuts() {
  for (int v = 0; v < 256; v++) {
    LUT_alphaT16[v] = (uint16_t)alphaT(v / 255.0f);
    LUT_embHi[v] = (uint8_t)jround(clampf((float)v + (255.0f - (float)v) * 0.7f, 0, 255));
    LUT_embLo[v] = (uint8_t)jround(clampf((float)v * 0.25f, 0, 255));
    LUT_traceGamma[v] = powf(v * (1.0f / 255.0f), TRACE_GAMMA);
  }
}
static inline uint16_t embossHi(uint16_t c) { int r, g, b; expand565(c, r, g, b); return rgb565(LUT_embHi[r], LUT_embHi[g], LUT_embHi[b]); }
static inline uint16_t embossLo(uint16_t c) { int r, g, b; expand565(c, r, g, b); return rgb565(LUT_embLo[r], LUT_embLo[g], LUT_embLo[b]); }

TubeLayout tubeLayout(const Params &p) {
  int H = (int)jround(p.tubeHeight); H = H < 4 ? 4 : H > TUBE_HEIGHT_MAX ? TUBE_HEIGHT_MAX : H;
  auto y = [&](float v) { int r = (int)jround(v); return r < 0 ? 0 : r > PANEL_H - H ? PANEL_H - H : r; };
  return { H, y(p.hoursY), y(p.minutesY) };
}

// Each tube is drawn into an H x PANEL_W strip buffer (H ≤ TUBE_HEIGHT_MAX); panel-row y maps to
// strip row y - baseY. Anything outside the strip is clipped (the sim never draws there either).
// All working state lives in a per-tube `Tube` context (below) so the two tubes can render on
// different cores at the same time; nothing in this file is file-static and mutable per frame.
static const int L = TUBE_LENGTH_PX;
struct Tube;

// ---------------------------------------------------------------------------------------------
// palette
// ---------------------------------------------------------------------------------------------
struct Palette {
  uint16_t rows[TUBE_HEIGHT_MAX], bubbleIn[TUBE_HEIGHT_MAX], tubeBackRows[TUBE_HEIGHT_MAX];
  uint16_t traceRows[TUBE_HEIGHT_MAX]; // dried pigment, independent of bulk liquid transparency
  uint16_t body, tubeBack, bubbleRim;
  float rowK[TUBE_HEIGHT_MAX];   // luma weight per row for front brightening (sim step 3a)
  uint16_t dryT[TUBE_HEIGHT_MAX]; // 1/256: what an empty tube transmits of the back per row (0 inside the wall band); fades rear marks behind air
  uint32_t gen = 0; int H = 0; float light = 0; bool valid = false;   // cache key (light is exact: hit while the tube is at rest)
};

// ---------------------------------------------------------------------------------------------
// bitmap fonts (digitFont 0..4)
// ---------------------------------------------------------------------------------------------
struct Font { uint8_t w, h; uint8_t g[10][8]; };
static const Font FONTS[] = {
  {3, 5, {{7,5,5,5,7},{2,6,2,2,7},{7,1,7,4,7},{7,1,7,1,7},{5,5,7,1,1},{7,4,7,1,7},{7,4,7,5,7},{7,1,1,1,1},{7,5,7,5,7},{7,5,7,1,7}}},
  {4, 6, {{6,9,9,9,9,6},{2,6,2,2,2,7},{6,9,1,2,4,15},{14,1,6,1,9,6},{2,6,10,15,2,2},{15,8,14,1,9,6},{6,8,14,9,9,6},{15,1,2,4,4,4},{6,9,6,9,9,6},{6,9,9,7,1,6}}},
  {5, 7, {{14,17,19,21,25,17,14},{4,12,4,4,4,4,14},{14,17,1,2,4,8,31},{31,2,4,2,1,17,14},{2,6,10,18,31,2,2},{31,16,30,1,1,17,14},{6,8,16,30,17,17,14},{31,1,2,4,8,8,8},{14,17,17,14,17,17,14},{14,17,17,15,1,2,12}}},
  {5, 7, {{31,17,17,17,17,17,31},{1,1,1,1,1,1,1},{31,1,1,31,16,16,31},{31,1,1,31,1,1,31},{17,17,17,31,1,1,1},{31,16,16,31,1,1,31},{31,16,16,31,17,17,31},{31,1,1,1,1,1,1},{31,17,17,31,17,17,31},{31,17,17,31,1,1,31}}},
  {6, 8, {{30,51,51,51,51,51,51,30},{12,28,12,12,12,12,12,63},{30,51,3,6,12,24,48,63},{62,3,3,30,3,3,51,30},{6,14,30,54,63,6,6,6},{63,48,48,62,3,3,51,30},{30,48,48,62,51,51,51,30},{63,3,6,12,24,24,24,24},{30,51,51,30,51,51,51,30},{30,51,51,31,3,3,3,30}}},
};
static const int NUM_FONTS = sizeof(FONTS) / sizeof(FONTS[0]);
static const int SPRITE_FONT = NUM_FONTS;

// ---------------------------------------------------------------------------------------------
// sprite glyphs: box-filtered from the flash sheet into the device box, cached per tube
// ---------------------------------------------------------------------------------------------
// Fixed pool per tube (3 B/px), allocated once at boot (render_init) in PSRAM: deterministic footprint, no
// heap traffic on param changes. Internal RAM cannot take it: the two DMA strips + BT controller leave
// <60 KB there. GLYPH_POOL_PX is sized for the sliders' worst case (sim PARAM_META): 10 glyphs of at most
// bw x bh = (5 * 6) x (7 * 6) texels, each grown by the largest shadow offset (4) on the right and below,
// two planes (behind air / behind liquid) when the shadow is baked in — 31280 texels, ~92 KB per tube.
// A set that does not fit (values pushed past the sliders over serial) drops the glyphs past the budget
// (visible, not silent).
#define GLYPH_POOL_PX (10 * 2 * (5 * 6 + 4) * (7 * 6 + 4))
// w x h texels (body plus the baked shadow margin); `adv` is the body width the layout advances by.
// c/a: the glyph as drawn behind air; cw/aw: as drawn behind liquid (the shadow composite depends on the
// liquid's transparency, see bakeShadow). Without a shadow both pairs alias the same plane.
struct ScaledGlyph { int w, h, adv; uint16_t *c, *cw; uint8_t *a, *aw; };
struct ScaledSet {
  int sheet = -1, bw = 0, bh = 0; float brightness = -1, tintAmt = -1, tone = 0; uint32_t tint = 0;
  int shadow = -2, shadowOff = 0; float shadowA = -1, transK = -1;
  ScaledGlyph g[10] = {};
  uint16_t *poolC = nullptr; uint8_t *poolA = nullptr;
};
// ---------------------------------------------------------------------------------------------
// marks (ticks + labels) seen through the liquid
// ---------------------------------------------------------------------------------------------
// Integer version of the sim's throughLiquid (luma in 1/1000 units, blend fractions in 1/256).
// T = liquidTransparency in 1/256, C = contrast in 1/1000 (both hoisted into Mark).
static uint16_t throughLiquid(uint16_t bg, uint16_t mark, int T, int C) {
  if (C <= 0) return blend565T(bg, mark, T);   // no contrast floor: skip both luminance calculations
  int Br, Bg, Bb, Mr, Mg, Mb;
  expand565(bg, Br, Bg, Bb); expand565(mark, Mr, Mg, Mb);
  int cr = Br + (((Mr - Br) * T + 128) >> 8), cg = Bg + (((Mg - Bg) * T + 128) >> 8), cb = Bb + (((Mb - Bb) * T + 128) >> 8);
  int lb = 299 * Br + 587 * Bg + 114 * Bb, lc = 299 * cr + 587 * cg + 114 * cb, d = lc - lb;
  if (abs(d) >= C) return rgb565(cr, cg, cb);
  int dir = d != 0 ? (d > 0 ? 1 : -1) : (lb > 110000 ? -1 : 1);
  int target = lb + dir * C; if (target < 0) target = 0; if (target > 255000) target = 255000;
  if (dir < 0) {
    int den = lc < 1000 ? 1000 : lc;   // scale toward black
    cr = (cr * target + den / 2) / den; cg = (cg * target + den / 2) / den; cb = (cb * target + den / 2) / den;
  } else {
    int den = 255000 - lc; if (den < 1000) den = 1000;   // mix toward white
    int K = (target - lc) * 256 / den; if (K > 256) K = 256; if (K < 0) K = 0;
    cr += ((255 - cr) * K + 128) >> 8; cg += ((255 - cg) * K + 128) >> 8; cb += ((255 - cb) * K + 128) >> 8;
  }
  if (cr > 255) cr = 255; if (cg > 255) cg = 255; if (cb > 255) cb = 255;
  return rgb565(cr, cg, cb);
}

// rel = +1 / -1: emboss highlight / shadow of body colour c, derived after the liquid pass.
// Liquid column bounds per tube row in panel coordinates: liquid where lo <= x < hi.
// Concave surface band of one tube for the rear-mark compositor (render frame, before the `remaining`
// mirror; 0 = time edge, dir +1, 1 = home edge, dir -1): per row the profile x, the outward stroke width
// (0 = no band) and the fill / blick / rim weights, stroke opacity included. See sim BandInfo / markFn.
struct BandInfo { const float *xm[2], *w[2], *fill[2], *blick[2], *rim[2]; float pull[2], hw; bool mirror; int L; };
// Liquid body bounds per tube row (panel frame) plus, when drawn, the surface band past them.
struct Edges { const float *lo, *hi; const BandInfo *band = nullptr; };
struct Mark {
  Tube &t; int y0; Edges edges; bool onTop; int T, C;   // T: transparency 1/256, C: contrast 1/1000
  bool bakedT;   // the mark's coverage already includes the liquid's transparency (sprite digits with a baked shadow, see bakeShadow)
  Mark(Tube &t_, int y0_, Edges e, const Params &p, bool onTop_, float contrast, bool bakedT_ = false) : t(t_), y0(y0_), edges(e), onTop(onTop_), bakedT(bakedT_) {
    T = (int)(p.liquidTransparency * 256 + 0.5f); if (T < 0) T = 0; if (T > 256) T = 256;
    C = (int)(contrast * 1000 + 0.5f);
  }
  // covT: coverage in 1/256 (256 = opaque)
  inline void operator()(int x, int y, uint16_t c, int covT = 256, int rel = 0) const;
  // A rear mark within the concave surface band's footprint (see sim markFn); false when the pixel is outside
  // it, or inside the body where the band lets everything through — the plain paths then apply.
  bool bandMark(int x, int y, int ry, uint16_t c, int covT, int rel, bool inside) const;
  // Whether the mark at (x, tube row ry) is composited through the liquid — the same test operator() applies.
  inline bool inLiquid(int x, int ry) const { return !onTop && x >= edges.lo[ry] && x < edges.hi[ry]; }
};

struct Label { int x0; char text[3]; int len; int adv[2]; };
struct Labels {
  Label list[12]; int n; int bw, bh, ry0, ry1, yTop; ScaledGlyph *sprite; const Font *font; int gap;
  uint16_t rows[96]; int16_t sourceRows[TUBE_HEIGHT_MAX]; int shadow, shadowT, shadowOff;   // shadow colour (-1 = none), opacity 1/256, px offset
  int16_t drySourceRows[TUBE_HEIGHT_MAX]; int dryRy0, dryRy1;   // rear digits behind air (digitDryLens)
  float wetDx = 0, wetDy = 0;   // fractional refraction shift of the columns behind liquid (digitParallax); 0 behind air / on top
  // cache key: everything above is a function of (params gen, H) plus these motion-derived ints (the shifts
  // are applied at draw time; only floor(wetDy) enters the key, through the wet row span)
  uint32_t gen = 0; int H = 0, bottomOff = 0, first = -1, keyWetDy = 0; bool valid = false, have = false;
};

static void markSourceRows(int height, float lens, int16_t *out, float curve = 1) {
  float strength = fabsf(clampf(lens, -1, 1));
  float signedCurve = lens < 0 ? -clampf(curve, -3, 3) : clampf(curve, -3, 3);
  float exponent = signedCurve > 0 ? 1 + signedCurve * 2 : 1 / (1 - signedCurve * 2);
  for (int yd = 0; yd < height; yd++) {
    float d = (yd + 0.5f - height / 2.0f) / (height / 2.0f), u = fabsf(d);
    float warped = signedCurve == 0 ? u : (1 - strength) * u + strength * powf(u, exponent);
    float s = (d < 0 ? -1 : 1) * warped;
    out[yd] = (int16_t)clampf(ffloor(height / 2.0f + s * height / 2.0f), 0, height - 1);
  }
}

static void digitRowColors(const Params &p, int bh, uint16_t *out) {
  int n = bh < 1 ? 1 : bh; if (n > 96) n = 96;
  RGB a = hexToRgb(p.digitColor), b = hexToRgb(p.digitColor2);
  for (int i = 0; i < n; i++) {
    float t = n == 1 ? 0 : (float)i / (n - 1); float u = t < 0.8f ? t / 0.8f : 1 - (t - 0.8f) / 0.2f * 0.35f;
    out[i] = q(scale(mix(a, b, u), p.brightness * p.digitBright));
  }
}

// Which column is behind liquid; edges null (digits on top) = all wet.
struct Wet {
  bool all; float lo, hi;
  Wet(const Edges *e, int H) : all(!e), lo(e ? e->lo[H >> 1] : 0), hi(e ? e->hi[H >> 1] : 0) {}
  bool operator()(int x) const { return all || (x >= lo && x < hi); }
};

// ---------------------------------------------------------------------------------------------
// per-tube render context
// ---------------------------------------------------------------------------------------------
// Bubbles per tube (sim FIZZ_MAX): the sliders' worst case, fizzCount 120 doubled by full agitation (<= 1). A
// count pushed past the sliders over serial is capped and reported (fizzOverflow), not silently dropped.
#define MAX_FIZZ 240
static int fizzOverflowPeak = 0;   // largest count requested past MAX_FIZZ (0 = everything fitted), see fizzOverflow()
// px in the liquid frame; life != 0 = parked under a surface, |life| s left before it pops: > 0 under the time
// edge, < 0 under the home edge of a free slug.
struct Fizz { float x, y, v, life; };
// Foam constants (mirror sim/src/render.ts): pop swell + fade time, slide speed along the surface as a
// fraction of fizzSpeed per px/row of meniscus slope, lag rate behind an advancing surface (also how a caught
// bubble glides onto the surface), how far short of the profile a free bubble's rim is caught (or recycled, at
// a surface foam can't form on), how much a concave surface band veils the foam behind it at the profile.
#define FOAM_POP_T 0.3f
#define FOAM_SLIDE 0.5f
#define FOAM_FOLLOW 6.0f
#define FOAM_CATCH 2.0f
#define FOAM_VEIL 0.7f
#define BLICK_H 0.18f   // surface blick tent half-height / tube height (sim BLICK_H)
#define FOAM_RELAX 3   // packing sweeps per step

// Everything that depends only on (params, H): rebuilt when the generation counter moves.
struct RowCache {
  uint32_t gen = 0; int H = 0; bool valid = false;
  int16_t tickWet[TUBE_HEIGHT_MAX], tickDry[TUBE_HEIGHT_MAX];   // tick source-row warps
  int16_t lensSrc[TUBE_HEIGHT_MAX]; bool lensOn; bool lensPos;   // applyLens row map
  float mag[TUBE_HEIGHT_MAX];                                    // lensMagRows (fizz squash)
  int16_t capX0[TUBE_HEIGHT_MAX];                                // rounded-corner mask
  // edge profile terms (sim edgeCap): d = lensRow(row), climbPow = |d|^meniscusPow, bulge = 1 - sqrt(1 - d^2)
  float rowD[TUBE_HEIGHT_MAX], rowClimbPow[TUBE_HEIGHT_MAX], rowBulge[TUBE_HEIGHT_MAX];
  uint16_t hiC;                                                  // front-bright colour
  uint16_t lensC;                                                // concave surface stroke colour (sim lensC)
  uint16_t darkC;                                                // deep liquid colour (sim darkC): dark tone target, unlit stroke shade
  uint16_t toneC; int toneT;                                     // surfaceTone target colour and blend 1/256 (sim toneC/toneK)
};
// Edge-effect blend tables: (row, k) -> 565, a function of the palette and lightK only. Rebuilt when
// lightK moves (exact compare: at rest it is constant, in motion it changes every frame anyway).
#define EFFECT_MAX 16
struct EffectTable { uint32_t gen = 0; int H = 0; float lightK = -1; bool valid = false; uint16_t c[TUBE_HEIGHT_MAX * EFFECT_MAX]; };

// All mutable state of one tube's renderer (hours = tubes[0], minutes = tubes[1]). Two of these are
// static (fixed footprint, ~9 KB each); the strip pointer / geometry are set per call by renderTube.
// Nothing here is shared between the two, so the tubes can render concurrently on both cores.
struct Tube {
  uint16_t *FB = nullptr; int baseY = 0, H = TUBE_HEIGHT_PX; int idx = 0;
  Palette pal; RowCache rc; Labels labels; ScaledSet set;
  EffectTable glowT[2];                                       // 0 = time edge, 1 = home edge
  float edges[TUBE_HEIGHT_MAX], edgesL[TUBE_HEIGHT_MAX];      // render-frame liquid edges per row
  float boundLo[TUBE_HEIGHT_MAX], boundHi[TUBE_HEIGHT_MAX];   // panel-frame bounds for the mark compositor (edges + surface stroke)
  float strokeR[TUBE_HEIGHT_MAX], strokeL[TUBE_HEIGHT_MAX];   // outward extent of the concave surface stroke per edge (sim strokeR/L)
  float bandFill[2][TUBE_HEIGHT_MAX], bandBlick[2][TUBE_HEIGHT_MAX], bandRim[2][TUBE_HEIGHT_MAX];   // its layer weights per row, 0 = time edge, 1 = home: rear-mark compositor (sim BandInfo)
  uint16_t backR[TUBE_HEIGHT_MAX], backL[TUBE_HEIGHT_MAX];    // local backing past each edge before body/glow: convex nose (sim backR/L)
  Fizz fizz[MAX_FIZZ]; int fizzN = 0; float fizzLen = 0;      // liquid length px, set by drawTube
  float fizzSurf[TUBE_HEIGHT_MAX], fizzSurfL[TUBE_HEIGHT_MAX]; // liquid-frame surface front per row (profile = edges - xs, the inner rim of a surface band), time / home edge, set by drawTube: where foam parks
  uint8_t fizzExposed = 0;                                    // bit 1 = time edge short of the far end, bit 2 = home edge of a free slug off the near end
  uint16_t traceA[TUBE_LENGTH_PX];                            // dried-trace residue alpha per column, 1/256 with headroom (traceAmount > 1)
  uint16_t traceRaw[TUBE_LENGTH_PX];                          // render-frame residue copy, input to the taper blur

  inline bool inStrip(int x, int y) const { return x >= 0 && x < PANEL_W && y >= baseY && y < baseY + H; }
  inline uint16_t rd(int x, int y) const { return __builtin_bswap16(FB[(y - baseY) * PANEL_W + x]); }
  inline void wr(int x, int y, uint16_t c) const { FB[(y - baseY) * PANEL_W + x] = __builtin_bswap16(c); }
  void hspan(int y, int x0, int x1, uint16_t c) const {
    if (y < baseY || y >= baseY + H) return;
    if (x0 < 0) x0 = 0; if (x1 > PANEL_W) x1 = PANEL_W;
    if (x1 <= x0) return;
    uint16_t s = __builtin_bswap16(c);
    uint16_t *p = FB + (y - baseY) * PANEL_W + x0;
    int n = x1 - x0;
    if (((uintptr_t)p & 2) && n) { *p++ = s; n--; }
    uint32_t ss = (uint32_t)s | ((uint32_t)s << 16);
    uint32_t *p32 = (uint32_t *)p;
    for (; n >= 2; n -= 2) *p32++ = ss;
    if (n) *(uint16_t *)p32 = s;
  }
  inline void px(int x, int y, uint16_t c) const { if (inStrip(x, y)) wr(x, y, c); }
  inline void pxa(int x, int y, uint16_t c, float t) const {
    if (!inStrip(x, y)) return;
    wr(x, y, t >= 1 ? c : blend565(rd(x, y), c, t));
  }
  inline void pxaT(int x, int y, uint16_t c, int T) const {
    if (!inStrip(x, y)) return;
    wr(x, y, T >= 256 ? c : blend565T(rd(x, y), c, T));
  }

  float glassW(const Params &p, int y, int hiTop, float lam) const;
  int highlightTop(const Params &p, float lightDeg) const;
  void buildPalette(const Params &p, float lightDeg, Palette &pal) const;
  ScaledGlyph *scaledGlyphs(int sheetIdx, int bw, int bh, float brightness, uint32_t tintHex, float tintAmt, float tone, int shadow, float shadowA, int shadowOff, float transK);
  bool layoutLabels(int y0, const Params &p, uint32_t gen, int ticksN, float acrossTilt, float edgeLight, float fill, Labels &lb);
  void drawSpriteGlyph(const ScaledGlyph &g, int x, int y0, const Labels &lb, const Wet &wet, const Mark &mark) const;
  void drawBitmapGlyph(const Font &f, int d, int x, int y0, const Labels &lb, const Wet &wet, const Mark &mark) const;
  void drawLabels(int y0, const Labels &lb, const Wet &wet, const Mark &mark) const;
  void drawTicks(int y0, const Params &p, int ticksN, const int16_t *wetRows, const int16_t *dryRows,
                 const Edges *edges, const Mark &mark, float dxFull = 0, float dyFull = 0) const;
  void ensureFizz(const Params &p, float len, float agitation);
  inline float fizzSquashRow(const Params &p, int y) const;
  void lensMagRows(const Params &p, float *rows) const;
  inline float edgeCap(int ry, const Params &p, float tilt, float side, float cap) const;
  inline float wallCap(int ry, const Params &p, float tilt, float side, float cap) const;
  inline float wallX(int ry, float xe, float tanA, const Params &p, float tilt, float side, float cap, float k) const;
  inline float wallXL(int ry, float xs, float tanA, const Params &p, float tilt, float side, float cap, float k) const;
  inline float edgeX(int ry, float xe, float tanA, const Params &p, float tilt, float side, float cap, float k) const;
  inline float edgeXL(int ry, float xs, float tanA, const Params &p, float tilt, float side, float cap, float k) const;
  void buildRowCache(const Params &p, uint32_t gen);
  void applyLens(const Params &p);
  const uint16_t *effectTable(EffectTable &T, const Params &p, const Palette &pal, uint32_t gen, float lightK, bool glow) const;
  void drawTube(int y0, const TubeState &st, const Params &p, uint32_t gen, int ticksN);
};
static Tube tubes[2];

inline void Mark::operator()(int x, int y, uint16_t c, int covT, int rel) const {
  if (!t.inStrip(x, y)) return;
  int ry = y - y0;
  const bool inside = !onTop && x >= edges.lo[ry] && x < edges.hi[ry];
  if (!onTop && edges.band && bandMark(x, y, ry, c, covT, rel, inside)) return;
  if (inside) {
    c = throughLiquid(t.rd(x, y), c, bakedT ? 256 : T, C);   // bakedT: transparency already in the coverage, only the contrast floor applies
    if (rel) { covT = covT * T >> 8; if (covT <= 0) return; }   // rear relief fades with the liquid's opacity (sim markFn)
  } else if (!onTop) { covT = covT * t.pal.dryT[ry] >> 8; if (covT <= 0) return; }   // rear marks vanish behind the wall band
  if (rel > 0) c = embossHi(c);
  else if (rel < 0) c = embossLo(c);
  t.wr(x, y, covT >= 256 ? c : blend565T(t.rd(x, y), c, covT));
}
// The concave surface band's footprint at a rear-mark pixel — it overlaps the body by hw inside the profile:
// its rim and blick stay on top of the mark (the write is scaled by what they let through; approximation as
// in the sim: the layers' own colour also yields by that share). Past the body the rear wall is seen through
// the dish: the mark is liquid-tinted as far as the fill is opaque there (its own per-pixel opacity, no
// threshold), dry for the rest; the band's plane is the behind-air one, so the coverage never has the
// transparency baked in and the wet part applies it itself. The wet/dry colour mix and the blend over the
// pixel are taken in 888 and rounded ONCE (parity with the sim). Out of the hot operator (noinline): the
// divisions run only on the few mark pixels under a band.
bool __attribute__((noinline)) Mark::bandMark(int x, int y, int ry, uint16_t c, int covT, int rel, bool inside) const {
  const BandInfo &b = *edges.band;
  const int xr = b.mirror ? b.L - 1 - x : x;
  const float hw = b.hw;
  // the edge whose footprint (hw inside the profile to the stroke width past it) can hold this pixel
  const int side = xr + 0.5f > b.xm[0][ry] - hw ? 0 : 1;
  const float wEff = b.w[side][ry];   // 0: no band on that side; a far pixel gets no coverage below
  if (wEff <= 0) return false;
  const float tt = (side == 0 ? 1 : -1) * (xr + 0.5f - b.xm[side][ry]);
  const float lo = fmx(tt - 0.5f, -hw), hi = fmn(tt + 0.5f, wEff), coverage = hi - lo;
  if (coverage <= 0) return false;
  const float u = clampf(((lo + hi) * 0.5f + hw) / (wEff + hw), 0, 1), us = u * u * (3 - 2 * u);
  const float ab = fmn(1, b.blick[side][ry] * coverage * 4 * u * (1 - u));
  const float ar = fmn(1, b.rim[side][ry] * fmx(0, hi - fmx(lo, fmx(0, wEff - 1))));
  const float through = (1 - ab) * (1 - ar);
  if (inside) {
    if (through >= 1) return false;   // nothing on top here: the plain body path, byte-identical
    c = throughLiquid(t.rd(x, y), c, bakedT ? 256 : T, C);
    if (rel) covT = covT * T >> 8;
    covT = (int)(covT * through + 0.5f); if (covT <= 0) return true;
    if (rel > 0) c = embossHi(c); else if (rel < 0) c = embossLo(c);
    t.wr(x, y, covT >= 256 ? c : blend565T(t.rd(x, y), c, covT));
    return true;
  }
  const float wet = fmn(1, b.fill[side][ry] * coverage * (1 - b.pull[side] * us));
  const float cov = covT * (1 / 256.0f);
  const float aw = cov * wet * (rel ? T * (1 / 256.0f) : 1), ad = cov * (1 - wet) * (t.pal.dryT[ry] * (1 / 256.0f));
  const float al = (aw + ad) * through;
  if (al < 1 / 255.0f) return true;
  const uint16_t bg = t.rd(x, y);
  RGB M = to888(c);
  if (aw > 0) {
    const RGB CT = to888(throughLiquid(bg, c, T, C));
    M = ad > 0 ? mix(M, CT, aw / (aw + ad)) : CT;
  }
  if (rel > 0) M = to888(embossHi(q(M))); else if (rel < 0) M = to888(embossLo(q(M)));
  t.wr(x, y, al >= 1 ? q(M) : q(mix(to888(bg), M, al)));
  return true;
}

// Glass wall shading weight 0..1 per row (sim: glassW): ambient cylinder shade, specular tent on the
// top wall, faint band on the lower wall. The wall band and rim live in buildPalette.
float Tube::glassW(const Params &p, int y, int hiTop, float lam) const {
  float t = (float)y / (H - 1);
  float amb = 0.5f + 0.5f * cosf((t - 0.3f) * (float)M_PI * 1.6f);
  float w = p.glassBody * (amb + (lam - amb) * p.lightPhys);
  if (y >= hiTop && y < hiTop + p.highlightH)
    w += p.glassHiBright * powf(1 - fabsf((y - hiTop) / fmx(1, p.highlightH - 1) - 0.5f) * 2, p.highlightSharp);
  float d = (t - 0.82f) / 0.07f;
  w += p.glassReflect * expf(-d * d);
  return fmn(1, w);
}

// Top row of the highlight band for highlight angle lightDeg (sim highlightTop).
int Tube::highlightTop(const Params &p, float lightDeg) const {
  float yc = (H - 1) / 2.0f;
  return (int)jround(yc - yc * sinf(lightDeg * (float)M_PI / 180) - (p.highlightH - 1) / 2);
}

// Style top light blended (lightPhys) with a Lambert cylinder lit from 2*light (sim buildPalette).
void Tube::buildPalette(const Params &p, float lightDeg, Palette &pal) const {
  RGB body = hexToRgb(p.liquid), hi = hexToRgb(p.liquidHi), lo = hexToRgb(p.liquidLo);
  RGB tubeBack = hexToRgb(p.tubeBack), tubeBack2 = hexToRgb(p.tubeBack2), ghi = hexToRgb(p.glassHi);
  float br = p.brightness * p.liquidBright;
  RGB liquidHiScaled = scale(hi, br), glassHiScaled = scale(ghi, p.brightness);
  float bodyL = ambientBodyL(p), ambAmt = ambientAmt(p);
  float yc = (H - 1) / 2.0f, lightRad = 2 * lightDeg * (float)M_PI / 180;
  int hiTop = highlightTop(p, lightDeg);
  // Wall band (sim buildPalette): rows whose ray misses the bore never reach the back (dryT 0),
  // ramping up over a few rows inside; the liquid still shows through there. A neutral grazing
  // rim rises toward the silhouette on both sides (glassRim). glassWall 0 keeps a one-row rim.
  float wallU = 1 - 2 * fmx(1, p.glassWall) / H;
  RGB glassEdge = scale(mix(ghi, {180, 190, 195}, 0.72f), p.brightness);
  for (int y = 0; y < H; y++) {
    float t = (float)y / (H - 1);
    float u = (y + 0.5f - H / 2.0f) / (H / 2.0f), au = fabsf(u);
    float rim = p.glassRim * powf(fmx(0, (au - wallU) / (1 - wallU)), 2.5f);
    // Wall glow (sim glowW/wallW): light piped along the wall lights the band itself; plateau with a
    // short ramp starting just inside the band, the grazing rim on top.
    float glow = p.glassWallGlow * clampf(0.4f + 3 * (au - wallU) / (1 - wallU), 0, 1);
    rim = glow + rim - glow * rim;
    float dryT = p.glassWall <= 0 ? 1 : au >= wallU ? 0 : 1 - expf(-(wallU - au) / 0.04f);
    pal.dryT[y] = (uint16_t)(dryT * 256 + 0.5f);
    int gradient = (int)jround(p.tubeBackGradient);
    float backMix = gradient == 1 ? t : gradient == 2 ? 1 - fabsf(t * 2 - 1)
      : gradient == 3 ? fabsf(t * 2 - 1) : 0;
    RGB back = mix(tubeBack, tubeBack2, backMix);
    float lam = fmx(0, cosf(asinf(clampf((yc - y) / yc, -1, 1)) - lightRad));
    RGB c;
    if (t < 0.33f) c = mix(mix(body, lo, 0.25f), body, t / 0.33f);
    else c = mix(body, lo, ((t - 0.33f) / 0.67f) * p.shadeDepth);
    if (p.lightPhys > 0) c = mix(c, mix(lo, body, 1 - p.shadeDepth * (1 - lam)), p.lightPhys);
    // Thin edge: shorter chord toward the walls absorbs less, the colour drifts to a grey of its
    // own peak channel, strongest on the outermost rows.
    if (p.liquidThin > 0) {
      float chord = sqrtf(fmx(0, 1 - u * u)), m = fmx(c.r, fmx(c.g, c.b));
      c = mix(c, {m, m, m}, p.liquidThin * (1 - chord) * (1 - chord));
    }
    // Transparent liquid shows the per-row tube-back gradient. The highlight remains a surface
    // reflection and goes on after it.
    c = scale(c, br);
    RGB residue = c;
    c = mix(c, scale(back, p.brightness), p.liquidTransparency);
    if (y >= hiTop && y < hiTop + p.highlightH) {
      float k = powf(1 - fabsf((y - hiTop) / fmx(1, p.highlightH - 1) - 0.5f) * 2, p.highlightSharp);
      c = mix(c, liquidHiScaled, fmn(1, (0.35f + 0.65f * k) * p.highlightBright));
      residue = mix(residue, liquidHiScaled, fmn(1, (0.35f + 0.65f * k) * p.highlightBright));
    }
    float gw = glassW(p, y, hiTop, lam);
    float wetK = p.glassOverLiquid + (1 - p.glassOverLiquid) * p.liquidTransparency, glassWet = gw * wetK;
    // Empty tube: back only where the ray reaches it (wall band dark), glass over it, rim on top.
    pal.tubeBackRows[y] = q(mix(scale(mix(scale(back, dryT), ghi, gw), p.brightness), glassEdge, rim));
    c = ambientize(mix(mix(c, glassHiScaled, glassWet), glassEdge, rim * wetK), bodyL, ambAmt);   // glass weight rises to the dry-side one with transparency
    // Dried pigment uses opaque-liquid shading; traceAmount / drying supply its coverage.
    residue = ambientize(mix(mix(residue, glassHiScaled, gw * p.glassOverLiquid), glassEdge, rim * p.glassOverLiquid), bodyL, p.ambientLight);
    pal.traceRows[y] = q(scale(to888(q(residue)), 0.85f));
    pal.rows[y] = q(c);
    pal.bubbleIn[y] = q(mix(c, {0, 0, 0}, p.bubbleDark));
  }
  pal.body = q(scale(body, br));
  pal.tubeBack = q(scale(tubeBack, p.brightness));
  pal.bubbleRim = q(ambientize(scale(hexToRgb(p.bubbleRim), br), bodyL, ambAmt));
  float lmax = 1;
  for (int y = 0; y < H; y++) { pal.rowK[y] = luma(to888(pal.rows[y])); lmax = fmx(lmax, pal.rowK[y]); }
  for (int y = 0; y < H; y++) pal.rowK[y] /= lmax;
}


// Bake the digit shadow into one plane (w x h texels c/a holding the body at the top-left, see sim
// bakeShadow): the shadow copy, offset `off` px down-right in the shadow colour at `shadowA`, composited
// UNDER the body. The draw pass used to blend the two copies one after the other, each at its coverage
// times the factor k the compositor applies to a mark behind liquid (liquidTransparency; 1 behind air):
// out = bg(1 - k*s)(1 - k*b) + shadowC*k*s*(1 - k*b) + bodyC*k*b. That is one blend of the composite with
// alpha A = 1 - (1 - k*s)(1 - k*b) and colour (shadowC*k*s*(1 - k*b) + bodyC*k*b) / A — the transparency
// INCLUDED, because two layers at k reach an opacity (up to 1 - (1-k)^2) a single mark at k never could.
// So a plane is baked per context: behind air with k = 1, behind liquid with k = transparency, and the
// Mark skips its own transparency step for these glyphs (Mark::bakedT). Exact to within one quantisation
// step at half the per-frame work; the approximations are the wall-band fade rows behind air (their
// factor varies per row) and a non-zero markContrast (floored on the composite instead of per layer).
// Texels are visited bottom-right to top-left so the body texel a shadow sample reads, (x-off, y-off),
// has not been rewritten yet.
static void bakeShadow(uint16_t *c, uint8_t *a, int w, int h, int bw, int bh, int off, uint16_t shadowC, float shadowA, float k) {
  const RGB sc = to888(shadowC);
  for (int y = h - 1; y >= 0; y--) for (int x = w - 1; x >= 0; x--) {
    const int i = y * w + x;
    const int as = x >= off && y >= off ? a[(y - off) * w + (x - off)] : 0;
    const int ab = x < bw && y < bh ? a[i] : 0;
    if (!as && (!ab || k >= 1)) continue;                // empty, or a body-only texel behind air: unchanged
    const float s = as * shadowA * (1.0f / 255) * k, b = ab * (1.0f / 255) * k, A = 1 - (1 - s) * (1 - b);
    if (A <= 0) { c[i] = 0; a[i] = 0; continue; }        // fully transparent (k = 0: opaque liquid hides the mark)
    const float ws = s * (1 - b) / A, wb = b / A;
    const RGB bc = ab ? to888(c[i]) : RGB{ 0, 0, 0 };
    c[i] = q({ sc.r * ws + bc.r * wb, sc.g * ws + bc.g * wb, sc.b * ws + bc.b * wb });
    a[i] = (uint8_t)jround(A * 255);
  }
}

// shadow: 565 colour of the baked digit shadow (-1 = none), shadowA its opacity, shadowOff its px offset,
// transK the liquid transparency the behind-liquid plane is baked for (clamped float, as in the sim).
ScaledGlyph *Tube::scaledGlyphs(int sheetIdx, int bw, int bh, float brightness, uint32_t tintHex, float tintAmt, float tone,
                                int shadow, float shadowA, int shadowOff, float transK) {
  if (sheetIdx < 0 || sheetIdx >= NUM_SPRITE_SHEETS) return nullptr;
  ScaledSet &S = set;
  if (!S.poolC || !S.poolA) return nullptr;
  if (S.sheet == sheetIdx && S.bw == bw && S.bh == bh && S.brightness == brightness && S.tint == tintHex && S.tintAmt == tintAmt && S.tone == tone
      && S.shadow == shadow && S.shadowA == shadowA && S.shadowOff == shadowOff && S.transK == transK) return S.g;
  const int off = shadow >= 0 ? shadowOff : 0;   // baked shadow margin (right and bottom)
  const SpriteSheet &sp = *SPRITE_SHEETS[sheetIdx];
  RGB tint = hexToRgb(tintHex);
  auto tm = [&](float v, float ch) { return v * (1 - tintAmt) + v * (ch / 255.0f) * tintAmt; };
  float t = fmx(-1, fmn(1, tone));
  auto tn = [&](float v) { return t < 0 ? v * (1 + t) : v + (255 - v) * t; };
  int used = 0;
  for (int d = 0; d < 10; d++) {
    int gw = (int)fmx(1, jround(sp.widths[d] * (float)bw / sp.cellW));
    float cx0 = d * sp.cellW + (sp.cellW - sp.widths[d]) / 2.0f;
    const int tw = gw + off, th = bh + off, planes = off > 0 ? 2 : 1;
    if (used + planes * tw * th > GLYPH_POOL_PX) { S.g[d] = { 0, 0, 0, S.poolC, S.poolC, S.poolA, S.poolA }; continue; }   // over budget: glyph dropped
    S.g[d].w = tw; S.g[d].h = th; S.g[d].adv = gw;
    S.g[d].c = S.poolC + used; S.g[d].a = S.poolA + used; used += tw * th;
    if (planes == 2) { S.g[d].cw = S.poolC + used; S.g[d].aw = S.poolA + used; used += tw * th; }
    else { S.g[d].cw = S.g[d].c; S.g[d].aw = S.g[d].a; }
    memset(S.g[d].c, 0, tw * th * 2); memset(S.g[d].a, 0, tw * th);
    // Box bounds as exact ratios (x * width / gw, not x / sx): the reciprocal form lands a hair below an
    // integer in float and a hair above in the sim's doubles, dropping the glyph's last sheet column here.
    for (int y = 0; y < bh; y++) for (int x = 0; x < gw; x++) {
      int X0 = (int)ffloor(cx0 + (float)(x * sp.widths[d]) / gw), X1 = (int)fmx(X0 + 1, ffloor(cx0 + (float)((x + 1) * sp.widths[d]) / gw));
      int Y0 = (int)ffloor((float)(y * sp.cellH) / bh), Y1 = (int)fmx(Y0 + 1, ffloor((float)((y + 1) * sp.cellH) / bh));
      float r = 0, g = 0, b = 0, al = 0; int n = 0;
      for (int Y = Y0; Y < Y1; Y++) for (int X = X0; X < X1; X++) {
        if (X < 0 || X >= sp.w || Y < 0 || Y >= sp.h) { n++; continue; }
        const uint8_t *px4 = sp.rgba + ((size_t)Y * sp.w + X) * 4; float pa = px4[3];
        r += px4[0] * pa; g += px4[1] * pa; b += px4[2] * pa; al += pa; n++;
      }
      int k = y * tw + x;
      if (al > 0) {
        S.g[d].c[k] = q(scale({ tn(tm(r / al, tint.r)), tn(tm(g / al, tint.g)), tn(tm(b / al, tint.b)) }, brightness));
        S.g[d].a[k] = (uint8_t)jround(al / n);
      }
    }
    if (planes == 2) {
      memcpy(S.g[d].cw, S.g[d].c, tw * th * 2); memcpy(S.g[d].aw, S.g[d].a, tw * th);
      bakeShadow(S.g[d].c, S.g[d].a, tw, th, gw, bh, off, (uint16_t)shadow, shadowA, 1.0f);
      bakeShadow(S.g[d].cw, S.g[d].aw, tw, th, gw, bh, off, (uint16_t)shadow, shadowA, transK);
    }
  }
  S.sheet = sheetIdx; S.bw = bw; S.bh = bh; S.brightness = brightness; S.tint = tintHex; S.tintAmt = tintAmt; S.tone = tone;
  S.shadow = shadow; S.shadowA = shadowA; S.shadowOff = shadowOff; S.transK = transK;
  return S.g;
}


bool Tube::layoutLabels(int y0, const Params &p, uint32_t gen, int ticksN, float acrossTilt, float edgeLight, float fill, Labels &lb) {
  bool minutes = ticksN == 60;
  int every = (int)fmx(1, jround(minutes ? p.digitMinuteStep : p.digitHourStep));
  // Motion-dependent parts of the layout, folded into the cache key.
  int bottomOff = p.digitsOnTop ? (int)jround(acrossTilt * p.topParallax) : 0;
  // Liquid refracts the rear wall: the wet columns slide with tilt (same sign convention as the ticks).
  // Fractional: the wet copy is resampled at draw time so it glides rather than steps.
  lb.wetDx = p.digitsOnTop ? 0 : -edgeLight * p.digitParallax;
  lb.wetDy = p.digitsOnTop ? 0 : acrossTilt * p.digitParallax;
  int wetDy = (int)ffloor(lb.wetDy);
  int start = (int)jround(minutes ? p.digitMinuteStart : p.digitHourStart); if (start <= 0) start = every;
  int first = start, last = ticksN - 1;
  if (minutes ? p.digitsLastOnlyM : p.digitsLastOnlyH) {
    float f = fill < 0 ? 0 : fill * ticksN; if (f > ticksN - 1e-3f) f = ticksN - 1e-3f;
    int s = minutes ? every : 1; first = last = (int)f / s * s;
    if (first == 0) first = 1;
  }
  if (lb.valid && lb.gen == gen && lb.H == H && lb.bottomOff == bottomOff && lb.first == first && lb.keyWetDy == wetDy) return lb.have;
  lb.valid = true; lb.gen = gen; lb.H = H; lb.bottomOff = bottomOff; lb.first = first; lb.keyWetDy = wetDy; lb.have = false;
  if (!p.digits) return false;
  float kx = minutes ? p.digitScaleXMin : p.digitScaleX, ky = minutes ? p.digitScaleYMin : p.digitScaleY;
  float bottom = (minutes ? p.digitBottomMin : p.digitBottom) + bottomOff;
  int idx = (int)jround(p.digitFont); bool useSprite = idx >= SPRITE_FONT;
  const Font *font = &FONTS[idx < 0 ? 0 : idx >= NUM_FONTS ? NUM_FONTS - 1 : idx];
  int bw = (int)fmx(1, jround((useSprite ? 5 : font->w) * kx));
  int bh = (int)fmx(1, jround((useSprite ? 7 : font->h) * ky));
  if (bh > 96) bh = 96;
  float shadowA = clampf(p.digitShadowStrength, 0, 1); int shadowOff = (int)fmx(1, jround(p.digitShadowOffset));
  int shadow = p.digitShadow && shadowA > 0 ? q(scale(hexToRgb(p.digitShadowColor), p.brightness * p.digitBright)) : -1;
  // Sprite glyphs carry the shadow baked in (one draw pass); bitmap glyphs still draw it as a second pass.
  // The behind-liquid plane is baked for the liquid transparency itself (the Mark skips its own step for
  // these glyphs): the unquantised float, as in the sim, so both bakes round the same way.
  ScaledGlyph *sprite = useSprite ? scaledGlyphs(idx - SPRITE_FONT, bw, bh, p.brightness * p.digitBright, p.digitTint, p.digitTintAmount, p.digitTone, shadow, shadowA, shadowOff, clampf(p.liquidTransparency, 0, 1)) : nullptr;
  int gap = sprite ? (int)fmx(1, jround(bw / 5.0f)) : (int)fmx(1, jround(kx));
  int yBase = y0 + H - 1 - (int)bottom, yTop = yBase - bh + 1;
  // NB: sim uses yBase = y0+H-1-bottom with fractional `bottom` possible; presets use integers.
  if (p.digitsOnTop) { markSourceRows(H, p.topLens, lb.sourceRows, p.lensCurve); memcpy(lb.drySourceRows, lb.sourceRows, sizeof(lb.sourceRows)); }
  else { markSourceRows(H, p.bottomLens, lb.sourceRows); markSourceRows(H, p.digitDryLens, lb.drySourceRows); }
  int sourceRy0 = yTop - y0, sourceRy1 = yBase - y0 + (shadow >= 0 ? shadowOff : 0);
  lb.ry0 = H; lb.ry1 = -1; lb.dryRy0 = H; lb.dryRy1 = -1;
  for (int ry = 0; ry < H; ry++) {
    if (lb.sourceRows[ry] >= sourceRy0 + wetDy && lb.sourceRows[ry] <= sourceRy1 + wetDy + 1) {   // +1: fractional overhang
      if (ry < lb.ry0) lb.ry0 = ry;
      if (ry > lb.ry1) lb.ry1 = ry;
    }
    if (lb.drySourceRows[ry] >= sourceRy0 && lb.drySourceRows[ry] <= sourceRy1) {
      if (ry < lb.dryRy0) lb.dryRy0 = ry;
      if (ry > lb.dryRy1) lb.dryRy1 = ry;
    }
  }
  lb.n = 0;
  for (int i = first; i <= last && lb.n < 12; i += every) {
    Label &l = lb.list[lb.n++];
    if (minutes && p.digitsLeadingZero) { l.text[0] = '0' + i / 10; l.text[1] = '0' + i % 10; l.len = 2; }
    else if (i >= 10) { l.text[0] = '0' + i / 10; l.text[1] = '0' + i % 10; l.len = 2; }
    else { l.text[0] = '0' + i; l.len = 1; }
    int w = -gap;
    for (int k = 0; k < l.len; k++) { l.adv[k] = sprite ? sprite[l.text[k] - '0'].adv : bw; w += l.adv[k] + gap; }
    int x0 = (int)jround((float)i * L / ticksN - w / 2.0f);
    int m = (int)jround(p.cornerR);
    l.x0 = x0 < m ? m : x0 > L - w - m ? L - w - m : x0;
  }
  lb.bw = bw; lb.bh = bh; lb.yTop = yTop;
  lb.sprite = sprite; lb.font = font; lb.gap = gap; lb.shadow = shadow; lb.shadowT = alphaT(shadowA); lb.shadowOff = shadowOff;
  digitRowColors(p, bh, lb.rows);
  lb.have = true;
  return true;
}

// Coverage (0..255) and colour of glyph pixel (cx, cy); both only defined inside w x h.
struct SpriteSampler {
  const ScaledGlyph &g; int w, h;
  explicit SpriteSampler(const ScaledGlyph &gg) : g(gg), w(gg.w), h(gg.h) {}
  int a(int cx, int cy) const { return g.a[cy * g.w + cx]; }
  uint16_t c(int cx, int cy) const { return g.c[cy * g.w + cx]; }
  int aw(int cx, int cy) const { return g.aw[cy * g.w + cx]; }        // behind-liquid plane
  uint16_t cw(int cx, int cy) const { return g.cw[cy * g.w + cx]; }
};
struct BitmapSampler {
  const uint8_t *g; const Font &f; const Labels &lb; int w, h, msb;
  BitmapSampler(const Font &ff, int d, const Labels &l) : g(ff.g[d]), f(ff), lb(l), w(l.bw), h(l.bh), msb(1 << (ff.w - 1)) {}
  int a(int cx, int cy) const {
    int col = cx * f.w / w; if (col > f.w - 1) col = f.w - 1;
    int row = cy * f.h / h; if (row > f.h - 1) row = f.h - 1;
    return (g[row] & (msb >> col)) ? 255 : 0;
  }
  uint16_t c(int, int cy) const { return lb.rows[cy]; }
  int aw(int cx, int cy) const { return a(cx, cy); }                  // no baked shadow: one plane
  uint16_t cw(int cx, int cy) const { return c(cx, cy); }
};
// Draw one glyph (see sim drawGlyph). A panel column shows the wet image where it is behind liquid and the dry
// one where it is behind air, so a source column may feed both and every panel column gets exactly one; a
// label straddling the fill edge breaks there like a refracted image. The dry copy is unshifted. The wet copy
// sits at the fractional refraction shift (wetDx, wetDy) and is bilinearly resampled (weights in 1/256) so it
// glides with tilt instead of stepping a whole pixel; its colour comes from the tap contributing the most
// coverage. Rows outer (glyph memory is row-major); every pixel is written at most once.
template <class S>
static void drawGlyph(const S &s, int x, int y0, const Labels &lb, const Wet &wet, const Mark &mark, bool shadowPass) {
  int off = shadowPass ? lb.shadowOff : 0, xg = x + off, sourceTop = lb.yTop - y0 + off;
  auto covT = [&](int a) { return shadowPass ? LUT_alphaT16[a] * lb.shadowT >> 8 : LUT_alphaT16[a]; };   // shadow copy at its own opacity
  bool dcol[129], wcol[129]; int gw = s.w > 128 ? 128 : s.w;
  bool anyDry = false, anyWet = false;
  int ix = (int)ffloor(lb.wetDx), iy = (int)ffloor(lb.wetDy);
  int wx1 = (int)((lb.wetDx - ix) * 256 + 0.5f), wx0 = 256 - wx1, wy1 = (int)((lb.wetDy - iy) * 256 + 0.5f), wy0 = 256 - wy1;
  const int w00 = wx0 * wy0, w10 = wx1 * wy0, w01 = wx0 * wy1, w11 = wx1 * wy1;
  for (int cx = 0; cx <= gw; cx++) {
    dcol[cx] = cx < gw && !wet(xg + cx); if (dcol[cx]) anyDry = true;
    wcol[cx] = wet(xg + ix + cx); if (wcol[cx]) anyWet = true;
  }
  // Plane per PIXEL: the behind-liquid plane (aw/cw) exactly where the Mark composites through the liquid,
  // the behind-air plane elsewhere. The wet/dry column split above decides which copy (shifted or not) a
  // column shows and is taken at the middle row; the meniscus makes the rows near the walls differ from it,
  // and there the compositor's per-row test wins — as it did when the shadow was a second pass.
  auto A = [&](bool L, int cx, int cy) -> int { return L ? s.aw(cx, cy) : s.a(cx, cy); };
  auto Cc = [&](bool L, int cx, int cy) -> uint16_t { return L ? s.cw(cx, cy) : s.c(cx, cy); };
  auto tap = [&](bool L, int cx, int cy) -> int { return cx < 0 || cy < 0 || cx >= s.w || cy >= s.h ? 0 : A(L, cx, cy); };
  int a0 = lb.dryRy0 < lb.ry0 ? lb.dryRy0 : lb.ry0, a1 = lb.dryRy1 > lb.ry1 ? lb.dryRy1 : lb.ry1;
  for (int ry = a0; ry <= a1; ry++) {
    int y = y0 + ry;
    int cyD = lb.drySourceRows[ry] - sourceTop;
    if (anyDry && ry >= lb.dryRy0 && ry <= lb.dryRy1 && cyD >= 0 && cyD < s.h) {
      for (int cx = 0; cx < gw; cx++) {
        if (!dcol[cx]) continue;
        const bool L = mark.inLiquid(xg + cx, ry); int a = A(L, cx, cyD); if (!a) continue;
        mark(xg + cx, y, shadowPass ? (uint16_t)lb.shadow : Cc(L, cx, cyD), covT(a));
      }
    }
    int cy = lb.sourceRows[ry] - sourceTop - iy;
    if (anyWet && ry >= lb.ry0 && ry <= lb.ry1 && cy >= 0 && cy <= s.h) {
      // Integer refraction shift: only the current tap contributes, with its original colour.
      if (wx1 == 0 && wy1 == 0) {
        if (cy >= s.h) continue;
        for (int cx = 0; cx < gw; cx++) {
          if (!wcol[cx]) continue;
          const bool L = mark.inLiquid(xg + ix + cx, ry); int a = A(L, cx, cy); if (!a) continue;
          mark(xg + ix + cx, y, shadowPass ? (uint16_t)lb.shadow : Cc(L, cx, cy), covT(a));
        }
        continue;
      }
      for (int cx = 0; cx <= gw; cx++) {                    // one extra column: the fractional overhang
        if (!wcol[cx]) continue;
        // destination (cx, cy) samples source (cx - fx, cy - fy): taps at columns cx / cx-1, rows cy / cy-1
        const bool L = mark.inLiquid(xg + ix + cx, ry);
        int a00 = tap(L, cx, cy) * w00, a10 = tap(L, cx - 1, cy) * w10;
        int a01 = tap(L, cx, cy - 1) * w01, a11 = tap(L, cx - 1, cy - 1) * w11;
        int a = (a00 + a10 + a01 + a11 + 32768) >> 16; if (!a) continue;
        uint16_t c;
        if (shadowPass) c = (uint16_t)lb.shadow;
        else {
          int m = a00; if (a10 > m) m = a10; if (a01 > m) m = a01; if (a11 > m) m = a11;
          c = m == a00 ? Cc(L, cx, cy) : m == a10 ? Cc(L, cx - 1, cy) : m == a01 ? Cc(L, cx, cy - 1) : Cc(L, cx - 1, cy - 1);
        }
        mark(xg + ix + cx, y, c, covT(a));
      }
    }
  }
}
void Tube::drawSpriteGlyph(const ScaledGlyph &g, int x, int y0, const Labels &lb, const Wet &wet, const Mark &mark) const {
  SpriteSampler s(g);
  drawGlyph(s, x, y0, lb, wet, mark, false);   // the shadow is baked into the sprite (scaledGlyphs)
}
void Tube::drawBitmapGlyph(const Font &f, int d, int x, int y0, const Labels &lb, const Wet &wet, const Mark &mark) const {
  BitmapSampler s(f, d, lb);
  if (lb.shadow >= 0) drawGlyph(s, x, y0, lb, wet, mark, true);   // 1 px shadow copy offset down-right, then the body
  drawGlyph(s, x, y0, lb, wet, mark, false);
}
void Tube::drawLabels(int y0, const Labels &lb, const Wet &wet, const Mark &mark) const {
  for (int i = 0; i < lb.n; i++) {
    const Label &l = lb.list[i]; int x = l.x0;
    for (int k = 0; k < l.len; k++) {
      int d = l.text[k] - '0';
      if (lb.sprite) drawSpriteGlyph(lb.sprite[d], x, y0, lb, wet, mark);
      else drawBitmapGlyph(*lb.font, d, x, y0, lb, wet, mark);
      x += l.adv[k] + lb.gap;
    }
  }
}

// wetRows/dryRows: source-row tables behind liquid vs behind air; edges null = all wet. Parallax is liquid-only.
void Tube::drawTicks(int y0, const Params &p, int ticksN, const int16_t *wetRows, const int16_t *dryRows,
                     const Edges *edges, const Mark &mark, float dxFull, float dyFull) const {
  bool minutes = ticksN == 60;
  if (!(minutes ? p.ticksM : p.ticksH)) return;
  int step = (int)fmx(1, jround(minutes ? p.tickStepM : p.tickStepH));
  int majorEvery = (int)fmx(0, jround(minutes ? p.tickMajorEveryM : p.tickMajorEveryH));
  int hMin = (int)fmx(0, jround(minutes ? p.tickMinorHeightM : p.tickMinorHeightH));
  int hMaj = (int)fmx(0, jround(minutes ? p.tickMajorHeightM : p.tickMajorHeightH));
  int wMin = (int)fmx(1, jround(minutes ? p.tickMinorWidthM : p.tickMinorWidthH));
  int wMaj = (int)fmx(1, jround(minutes ? p.tickMajorWidthM : p.tickMajorWidthH));
  float br = p.brightness * p.tickBright;
  uint16_t cMin = q(scale(hexToRgb(minutes ? p.tickColorM : p.tickColorH), br));
  uint16_t cMaj = q(scale(hexToRgb(minutes ? p.tickMajorColorM : p.tickMajorColorH), br));
  int pos = (int)jround(minutes ? p.tickPosM : p.tickPosH);
  float edgeLo = edges ? edges->lo[H >> 1] : 0, edgeHi = edges ? edges->hi[H >> 1] : 0;
  auto warpedRange = [&](const int16_t *sourceRows, int sourceA, int sourceB, int &a, int &b) {
    a = H; b = -1;
    for (int ry = 0; ry < H; ry++) if (sourceRows[ry] >= sourceA && sourceRows[ry] <= sourceB) {
      if (ry < a) a = ry;
      if (ry > b) b = ry;
    }
  };
  int embT = alphaT(clampf(p.tickEmboss, 0, 1));
  bool emboss = p.tickEmboss > 0;
  auto drawSegment = [&](int x0, int w, uint16_t c, int rangeA, int rangeB, bool top, float k) {
    if (rangeB < 0) return;
    float dx = dxFull * k, dy = dyFull * k;
    int outer = top ? 0 : H - 1;
    int inner = top ? rangeB : rangeA; if (inner < 0) inner = 0; if (inner >= H) inner = H - 1;
    int dir = inner >= outer ? 1 : -1;
    float radius = fmx(1, (H - 1) / 2.0f), centre = (H - 1) / 2.0f;
    auto point = [&](int baseY, int &x, int &y) {
      float qy = (baseY - centre) / radius;
      float depth = sqrtf(fmx(0, 1 - qy * qy));
      x = x0 + (int)jround(dx * depth); y = baseY + (int)jround(dy * depth);
    };
    auto plot = [&](int x, int ry) {
      if (ry < 0 || ry >= H) return;
      if (emboss) { mark(x - 1, y0 + ry, c, embT, 1); mark(x + w, y0 + ry, c, embT, -1); }
      for (int k = 0; k < w; k++) mark(x + k, y0 + ry, c);
    };
    // Without parallax every segment is vertical: no lens-depth or line interpolation needed.
    if (dx == 0 && dy == 0) {
      for (int ry = outer;; ry += dir) {
        plot(x0, ry);
        if (ry == inner) break;
      }
      return;
    }
    int px0, py0; point(outer, px0, py0); plot(px0, py0);
    if (outer == inner) return;
    for (int baseY = outer + dir;; baseY += dir) {
      int px1, py1; point(baseY, px1, py1);
      int n = abs(px1 - px0); if (abs(py1 - py0) > n) n = abs(py1 - py0); if (n < 1) n = 1;
      if (n == 1) plot(px1, py1);   // the endpoint is already integral (also preserves repeated points)
      else for (int j = 1; j <= n; j++) plot((int)jround(px0 + (float)(px1 - px0) * j / n), (int)jround(py0 + (float)(py1 - py0) * j / n));
      px0 = px1; py0 = py1;
      if (baseY == inner) break;
    }
  };
  // Warped row ranges depend only on (wet/dry table, minor/major height): 8 ranges, computed once.
  int rng[2][2][4];   // [wet][major][topA, topB, botA, botB]
  for (int wi = 0; wi < 2; wi++) for (int mj = 0; mj < 2; mj++) {
    const int16_t *rows = wi ? wetRows : dryRows; int h = mj ? hMaj : hMin;
    if (h <= 0) continue;
    warpedRange(rows, 0, h - 1, rng[wi][mj][0], rng[wi][mj][1]); warpedRange(rows, H - h, H - 1, rng[wi][mj][2], rng[wi][mj][3]);
  }
  for (int i = step; i < ticksN; i += step) {
    int xc = (int)jround((float)i * L / ticksN);
    bool major = majorEvery > 0 && i % majorEvery == 0;
    int h = major ? hMaj : hMin; if (h <= 0) continue;
    int w = major ? wMaj : wMin, x0 = xc - ((w - 1) >> 1); uint16_t c = major ? cMaj : cMin;
    bool wet = !edges || (xc >= edgeLo && xc < edgeHi);
    float k = wet ? 1 : 0;   // air refracts nothing: no parallax
    const int *R = rng[wet ? 1 : 0][major ? 1 : 0];
    int topA = R[0], topB = R[1], botA = R[2], botB = R[3];
    if (pos != 1) drawSegment(x0, w, c, topA, topB, true, k);
    if (pos != 0) drawSegment(x0, w, c, botA, botB, false, k);
  }
}

// ---------------------------------------------------------------------------------------------
// fizz
// ---------------------------------------------------------------------------------------------
static inline float frand() { return (esp_random() >> 8) / 16777216.0f; }
static inline float fizzR(const Params &p, float v) { return p.fizzSize / 2 * (1 + (v - 1) * p.fizzSizeVar); }
static inline float fizzWall(const Params &p) { return p.glassWall > 0 ? fmx(1, p.glassWall) : 0; }   // band px per side (buildPalette wallU)
// Row where a bubble of size v is fully behind the wall band (respawn/turnaround bound); 3 px without a band.
static inline float fizzHideY(const Params &p, float v) { float w = fizzWall(p); return w > 0 ? fmx(0, w - fizzR(p, v)) : 3; }
// Random row with the whole bubble in the bore, so bubbles never sit half behind the wall.
static inline float fizzSpawnY(const Params &p, int H, float v) { float lo = fizzWall(p) + fizzR(p, v), hi = H - lo; return hi <= lo ? H / 2.0f : lo + frand() * (hi - lo); }
void Tube::ensureFizz(const Params &p, float len, float agitation) {
  fizzLen = len;
  int want = (int)ffloor(p.fizzCount * (len / L) * (1 + (agitation < 0.05f ? 0 : agitation))); if (want < 0) want = 0;
  if (want > MAX_FIZZ) { if (want > fizzOverflowPeak) fizzOverflowPeak = want; want = MAX_FIZZ; }
  while (fizzN < want) { float v = 0.5f + frand(); fizz[fizzN++] = { frand() * len, fizzSpawnY(p, H, v), v, 0 }; }
  fizzN = want;
}
// Surface front `surf` (liquid frame) at float row y, in u = side * x: where a parked bubble's centre sits.
static float foamFront(const float *surf, int H, float y, int side) {
  const float yc = clampf(y, 0, H - 1); const int i = (int)ffloor(yc), j = i + 1 < H ? i + 1 : H - 1;
  return side * (surf[i] + (surf[j] - surf[i]) * (yc - i));
}
// Furthest centre (in u = side * x) a bubble of radius r at row y can take with its whole disc inside the
// surface `surf` (liquid frame): the tightest row of the disc. See sim discFit.
static float discFit(const float *surf, int H, float y, float r, int side) {
  const int a = (int)fmx(0, fceil(y - r)), b = (int)fmn(H - 1, ffloor(y + r));
  if (a > b) return foamFront(surf, H, y, side) - r;
  float u = INFINITY;
  for (int iy = a; iy <= b; iy++) { const float dy = iy - y; u = fmn(u, side * surf[iy] - sqrtf(fmx(0, r * r - dy * dy))); }
  return u;
}
// A free bubble f (radius r) touching foam parked on `side` — not foam on the other edge, nor foam this tick is
// still to release (its life still carries the old side).
static bool touchesFoam(const Tube &t, const Fizz &f, float r, const Params &p, int side) {
  for (int j = 0; j < t.fizzN; j++) {
    const Fizz &g = t.fizz[j];
    if (g.life * side <= 0) continue;
    const float m = r + fizzR(p, g.v) + 0.5f, dx = g.x - f.x, dy = g.y - f.y;
    if (fabsf(dx) < m && fabsf(dy) < m && dx * dx + dy * dy < m * m) return true;
  }
  return false;
}
// Respawn x in the liquid of the bubble's (new) row: at < 0 random, 0 just inside the time edge, > 0 just
// inside the home edge (the side the flow comes from). See sim stepFizz respawn.
static void fizzRespawnX(const Tube &t, const Params &p, Fizz &f, int at) {
  const float r = fizzR(p, f.v);
  const float lo = -discFit(t.fizzSurfL, t.H, f.y, r, -1) + FOAM_CATCH, hi = discFit(t.fizzSurf, t.H, f.y, r, 1) - FOAM_CATCH;
  f.x = hi <= lo ? (lo + hi) / 2 : at < 0 ? lo + frand() * (hi - lo) : at > 0 ? lo : hi;
}
// Parked bubbles: sit centred on the surface front — foam floats half out of the liquid — lagging behind an
// advance (and gliding on after being caught) no faster than the rise, pushed back by a recession; slide along
// the meniscus toward the higher contact line (the corners: the foam ring) and pack, late arrivals filling the
// meniscus from its front backward. Works in u = side * x, so the home edge (side -1) is the time edge mirrored.
// See sim settleFoam.
static int16_t foamOrder[MAX_FIZZ];   // the packing sweep order (parked, front first); one tube at a time
static void settleFoam(Tube &t, const Params &p, float speed, const float *surf, int side, float dt) {
  const int H = t.H; const float wall = fizzWall(p), follow = fmn(1, FOAM_FOLLOW * dt);
  auto place = [&](Fizz &f, float u, float y) {   // in the bore and not past the front of its row
    const float lo = wall + fizzR(p, f.v), hi = H - lo;
    f.y = hi <= lo ? H / 2.0f : clampf(y, lo, hi);
    f.x = side * fmn(u, foamFront(surf, H, f.y, side));
  };
  for (int i = 0; i < t.fizzN; i++) {
    Fizz &f = t.fizz[i];
    if (f.life == 0) continue;
    const float r = fizzR(p, f.v);
    const int fy = (int)clampf(jround(f.y), 0, H - 1);
    const float tu = foamFront(surf, H, f.y, side);
    float u = side * f.x;
    u = u < tu ? u + fmn((tu - u) * follow, speed * dt) : tu;   // buoyancy: no faster than the rise
    const float slope = side * (surf[fy + 1 < H ? fy + 1 : H - 1] - surf[fy > 0 ? fy - 1 : 0]) / 2;   // px per row
    float slide = FOAM_SLIDE * speed * clampf(2 * slope, -1, 1) * dt;
    for (int j = 0; j < t.fizzN; j++) {   // touching a neighbour on the slide side: line up along the surface
      const Fizz &g = t.fizz[j];
      if (j == i || g.life == 0 || slide * (g.y - f.y) <= 0) continue;
      const float m = r + fizzR(p, g.v) + 0.5f, du = side * g.x - u, dy = g.y - f.y;
      if (du * du + dy * dy < m * m) { slide = 0; break; }
    }
    place(f, u, f.y + slide);
  }
  // Pack: pairwise relaxation swept front to back; an overlapping pair is pushed apart, clamped to the bore
  // and the front, and whatever overlap the clamps leave the rear one takes by stepping back. See sim.
  int n = 0;
  for (int i = 0; i < t.fizzN; i++) if (t.fizz[i].life != 0) foamOrder[n++] = (int16_t)i;
  for (int it = 0; it < FOAM_RELAX; it++) {
    for (int a = 1; a < n; a++) {   // insertion sort: nearly sorted from the last step
      const int16_t k = foamOrder[a]; const float uk = side * t.fizz[k].x; int b = a - 1;
      while (b >= 0 && side * t.fizz[foamOrder[b]].x < uk) { foamOrder[b + 1] = foamOrder[b]; b--; }
      foamOrder[b + 1] = k;
    }
    for (int a = 0; a < n; a++) {
      Fizz &f = t.fizz[foamOrder[a]]; const float rf = fizzR(p, f.v);
      for (int b = a + 1; b < n; b++) {
        Fizz &g = t.fizz[foamOrder[b]];
        const float m = rf + fizzR(p, g.v) + 0.5f;
        float du = side * (g.x - f.x), dy = g.y - f.y;
        if (fabsf(du) >= m || fabsf(dy) >= m || du * du + dy * dy >= m * m) continue;
        const float d = sqrtf(du * du + dy * dy), k = (m - d) / 2;
        const float nu = d > 1e-4f ? du / d : -1, ny = d > 1e-4f ? dy / d : 0;   // coincident: g (later in the sweep) steps back
        place(f, side * f.x - k * nu, f.y - k * ny);
        place(g, side * g.x + k * nu, g.y + k * ny);
        du = side * (g.x - f.x); dy = g.y - f.y;
        if (du * du + dy * dy >= m * m) continue;
        Fizz &front = du > 0 ? g : f, &rear = du > 0 ? f : g;
        place(rear, side * front.x - sqrtf(fmx(0, m * m - dy * dy)), rear.y);
      }
    }
  }
}
// Rises against in-plane gravity at fizzSpeed px/s on both axes; face up = slow screen-up rise plus a drift
// toward the exposed surface (the time edge, or the home edge of a free slug whose time edge sits against
// the far end). While the rise points at an exposed surface and fizzFoamLife > 0, a bubble reaching it parks
// in its meniscus (settleFoam) and pops later; otherwise it respawns at the far side. See sim stepFizz.
int fizzOverflow() { return fizzOverflowPeak; }

void stepFizz(const Params &p, float dt, float along, float across, float agitation) {
  if (p.remaining) along = -along;   // fizz lives in the mirrored liquid frame (see drawTube)
  const float speed = p.fizzSpeed * (1 + 3 * agitation);
  const float up = sqrtf(fmx(0.0f, 1 - along * along - across * across));
  const float a = clampf(across * p.fizzAcrossGain, -1, 1);
  const float vy = -speed * ((1 - fabsf(a)) * up * p.fizzFlatRise + a);
  const float vxTilt = -speed * clampf(along * p.fizzDriftGain, -1, 1);
  for (int i = 0; i < 2; i++) {
    Tube &t = tubes[i]; const float len = t.fizzLen; const int H = t.H; const int exposed = t.fizzExposed;
    if (len <= 0) continue;   // no liquid drawn yet: no surfaces
    const int dir = exposed & 1 ? 1 : exposed & 2 ? -1 : 0;   // +x = the time edge
    const float vx = vxTilt + speed * up * p.fizzEdgeRise * dir;
    // The surface the rise heads for, if exposed and foam is on: +1 time edge, -1 home edge, 0 none.
    const int side = p.fizzFoamLife <= 0 ? 0 : vx > 0 && (exposed & 1) ? 1 : vx < 0 && (exposed & 2) ? -1 : 0;
    for (int k = 0; k < t.fizzN; k++) {
      Fizz &f = t.fizz[k];
      if (f.life != 0) {
        const int was = f.life > 0 ? 1 : -1;
        if (was != side) {   // the surface tilted away: the foam releases into the flow, from where it is drawn
          f.x = was * fmn(was * f.x, foamFront(was > 0 ? t.fizzSurf : t.fizzSurfL, H, f.y, was));
          f.life = 0;
        }
        else {
          const float left = fabsf(f.life) - dt * (1 + 3 * agitation);   // shaking pops the foam
          if (left <= 0) { f.life = 0; f.v = 0.5f + frand(); f.y = fizzSpawnY(p, H, f.v); fizzRespawnX(t, p, f, -1); }
          else f.life = side * left;
          continue;
        }
      }
      f.y += vy * f.v * dt;
      f.x += vx * f.v * dt;
      // Vertical exit: once fully behind the wall band, respawn fully behind the opposite one and rise out of it.
      const float hide = fizzHideY(p, f.v);
      if (f.y < hide || f.y >= H - hide) { f.v = 0.5f + frand(); const float h = fizzHideY(p, f.v); f.y = vy <= 0 ? H - h : h; fizzRespawnX(t, p, f, -1); continue; }
      // The flow carrying its rim within FOAM_CATCH of a surface (the whole disc, so big bubbles never poke
      // through), or into the foam already there (it joins at the back): at the surface the rise heads for it
      // parks (settleFoam); anywhere else it is recycled at the side the flow comes from. A bubble the flow does
      // not carry into a surface only rides it, centre held inside, floating half out like the foam.
      const float r = fizzR(p, f.v);
      const bool outR = vx > 0 && f.x > discFit(t.fizzSurf, H, f.y, r, 1) - FOAM_CATCH, outL = vx < 0 && -f.x > discFit(t.fizzSurfL, H, f.y, r, -1) - FOAM_CATCH;
      if ((side > 0 && outR) || (side < 0 && outL) || (side != 0 && touchesFoam(t, f, r, p, side))) f.life = side * p.fizzFoamLife * (0.5f + frand());
      else if (outR || outL) { f.v = 0.5f + frand(); f.y = fizzSpawnY(p, H, f.v); fizzRespawnX(t, p, f, vx < 0 ? 0 : 1); }
      else f.x = fmx(-foamFront(t.fizzSurfL, H, f.y, -1), fmn(foamFront(t.fizzSurf, H, f.y, 1), f.x));
    }
    if (side != 0) settleFoam(t, p, speed, side > 0 ? t.fizzSurf : t.fizzSurfL, side, dt);
  }
}

// Magnification for a bubble of radius r at float row y: mean of the row table over the rows the
// pre-squashed sprite covers, iterated once (see sim fizzMag). Single-row reads snap between rows.
static float fizzMag(const float *mag, int H, float y, float r) {
  float m = 1;
  for (int it = 0; it < 2; it++) {
    // Clamp into the tube with a <= b: a bubble stranded past a shrunken tube (tubeHeight pushed while fizz
    // is on) otherwise gets an empty range, magnification 0 and an unbounded draw loop (task-wdt on core 0).
    float ry = r / m;
    int a = (int)fmn(H - 1, fmx(0, ffloor(y - ry))), b = (int)fmx(a, fmn(H - 1, fceil(y + ry)));
    float s = 0; for (int i = a; i <= b; i++) s += mag[i];
    m = s / (b - a + 1);
  }
  return m;
}
// Lens magnification per row: rendered lens (supersampled row map, per source row) x physical glass
// (topLens, continuous) x center-weighted fizzSquash. See sim lensMagRows.
inline float Tube::fizzSquashRow(const Params &p, int y) const {
  float d = (y + 0.5f - H / 2.0f) / (H / 2.0f);   // full fizzSquash at mid-height, ~1 at the edges
  return 1 + (p.fizzSquash - 1) * (1 - d * d);
}
static bool lensExponent(float lens, float curve, float &strength, float &e) {
  float signedCurve = lens < 0 ? -curve : curve; strength = fabsf(lens);
  if (strength == 0 || signedCurve == 0) return false;
  e = signedCurve > 0 ? 1 + signedCurve * 2 : 1 / (1 - signedCurve * 2);
  return true;
}
void Tube::lensMagRows(const Params &p, float *rows) const {
  for (int y = 0; y < H; y++) rows[y] = 1;
  float curve = clampf(p.lensCurve, -3, 3), strength, e;
  if (lensExponent(clampf(p.lens, -1, 1), curve, strength, e)) {
    // Supersampled row map averaged per source row (see sim); dropped rows inherit the previous row.
    const int N = 8;
    float sum[TUBE_HEIGHT_MAX] = {0}, cnt[TUBE_HEIGHT_MAX] = {0};
    for (int i = 0; i < H * N; i++) {
      float d = ((i + 0.5f) / N - H / 2.0f) / (H / 2.0f), u = fabsf(d);
      float s = (d < 0 ? -1 : 1) * ((1 - strength) * u + strength * powf(u, e));
      int src = (int)clampf(ffloor(H / 2.0f + s * H / 2.0f), 0, H - 1);
      sum[src] += 1 / ((1 - strength) + strength * e * powf(u, e - 1)); cnt[src]++;
    }
    float last = 1;
    for (int y = 0; y < H; y++) if (cnt[y] > 0) { last = sum[y] / cnt[y]; break; }
    for (int y = 0; y < H; y++) rows[y] = cnt[y] > 0 ? (last = sum[y] / cnt[y]) : last;
  }
  if (lensExponent(clampf(p.topLens, -1, 1), curve, strength, e)) {
    for (int y = 0; y < H; y++) {
      float u = fmx(1.0f / H, fabsf((y + 0.5f - H / 2.0f) / (H / 2.0f)));
      rows[y] /= (1 - strength) + strength * e * powf(u, e - 1);
    }
  }
  for (int y = 0; y < H; y++) rows[y] = clampf(rows[y] * fizzSquashRow(p, y), 0.2f, 5);
}

// ---------------------------------------------------------------------------------------------
// tube
// ---------------------------------------------------------------------------------------------
// Row coordinate -1..1 as seen through the physical glass (meniscusLens, same warp as topLens).
static float lensRow(float d, const Params &p) {
  float lens = clampf(p.meniscusLens, -1, 1), strength = fabsf(lens);
  float curve = clampf(p.lensCurve, -3, 3), signedCurve = lens < 0 ? -curve : curve;
  if (strength == 0 || signedCurve == 0) return d;
  float exponent = signedCurve > 0 ? 1 + signedCurve * 2 : 1 / (1 - signedCurve * 2);
  float u = fabsf(d);
  return (d < 0 ? -1 : 1) * ((1 - strength) * u + strength * powf(u, exponent));
}
// Cap profile: px the contact line at row ry leads the surface centre along +x. cap = dynamic
// centre lead in the edge's own +x sense. tilt = along follower (edgeLight), side = across follower.
// Capillary wall climb (|d|^meniscusPow) plus a circular pressure/inertia bulge (tilt, cap); see sim edgeCap.
// Everything that depends only on (params, H): rebuilt when the generation counter moves.
// Per-row terms come from RowCache (param-only); the scalars are per tube per frame.
inline float Tube::edgeCap(int ry, const Params &p, float tilt, float side, float cap) const {
  float d = rc.rowD[ry];
  float asymEff = p.meniscusAsym * side * clampf(1 - tilt, 0, 1.5f) * (p.meniscusDepth < 0 ? -1 : 1);
  float climb = p.meniscusDepth * (1 + asymEff * d) * rc.rowClimbPow[ry];
  float bulge = p.meniscusTiltGain * tilt * fabsf(p.meniscusDepth) + cap;
  return climb - bulge * rc.rowBulge[ry];
}
// Caps of a column len px long may not exceed half of it in total (short slug = bead). See sim capScale.
static float capScale(float len, const Params &p, float tilt, float cap) {
  float feat = fabsf(p.meniscusDepth) * (1 + fabsf(p.meniscusTiltGain * tilt)) + fabsf(cap);
  return fmn(1, fmx(0, len) / 2 / fmx(1, feat));
}
// tanA = tan(angle) hoisted per tube (was recomputed per row).
inline float Tube::edgeX(int ry, float xe, float tanA, const Params &p, float tilt, float side, float cap, float k) const {
  const float yc = (H - 1) / 2.0f;
  float skew = tanA * (ry - yc);
  return xe + skew + k * edgeCap(ry, p, tilt, side, cap);
}
// Home-end edge of a free slug centred at xs: mirror image of edgeX, flattening onto the end cap.
inline float Tube::edgeXL(int ry, float xs, float tanA, const Params &p, float tilt, float side, float cap, float k) const {
  const float yc = (H - 1) / 2.0f;
  float skew = tanA * (ry - yc);
  return xs + fmn(1, xs / 8) * (skew - k * edgeCap(ry, p, -tilt, side, -cap));
}
// Wall-ring lead: the contact ring all round the bore (edgeCap at u = 1, across sag interpolated
// by the row's d) — one x per row seen side-on; the visible surface at a row is the lens between
// edgeCap (the mid-depth section) and this. Meets edgeCap at the wall rows. See sim wallCap.
inline float Tube::wallCap(int ry, const Params &p, float tilt, float side, float cap) const {
  float d = rc.rowD[ry];
  float asymEff = p.meniscusAsym * side * clampf(1 - tilt, 0, 1.5f) * (p.meniscusDepth < 0 ? -1 : 1);
  float bulge = p.meniscusTiltGain * tilt * fabsf(p.meniscusDepth) + cap;
  return p.meniscusDepth * (1 + asymEff * d) - bulge;
}
inline float Tube::wallX(int ry, float xe, float tanA, const Params &p, float tilt, float side, float cap, float k) const {
  const float yc = (H - 1) / 2.0f;
  return xe + tanA * (ry - yc) + k * wallCap(ry, p, tilt, side, cap);
}
inline float Tube::wallXL(int ry, float xs, float tanA, const Params &p, float tilt, float side, float cap, float k) const {
  const float yc = (H - 1) / 2.0f;
  return xs + fmn(1, xs / 8) * (tanA * (ry - yc) - k * wallCap(ry, p, -tilt, side, -cap));
}


void Tube::buildRowCache(const Params &p, uint32_t gen) {
  if (rc.valid && rc.gen == gen && rc.H == H) return;
  rc.valid = true; rc.gen = gen; rc.H = H;
  markSourceRows(H, p.tickLens, rc.tickWet);
  markSourceRows(H, p.tickDryLens, rc.tickDry);
  lensMagRows(p, rc.mag);
  {
    float lens = clampf(p.lens, -1, 1), curve = clampf(p.lensCurve, -3, 3);
    float signedCurve = lens < 0 ? -curve : curve, strength = fabsf(lens);
    rc.lensOn = !(strength == 0 || signedCurve == 0); rc.lensPos = signedCurve > 0;
    float exponent = signedCurve > 0 ? 1 + signedCurve * 2 : 1 / (1 - signedCurve * 2);
    for (int yd = 0; yd < H; yd++) {
      float d = (yd + 0.5f - H / 2.0f) / (H / 2.0f), u = fabsf(d);
      float s = (d < 0 ? -1 : 1) * ((1 - strength) * u + strength * powf(u, exponent));
      rc.lensSrc[yd] = (int16_t)clampf(ffloor(H / 2.0f + s * H / 2.0f), 0, H - 1);
    }
  }
  const float yc = (H - 1) / 2.0f;
  for (int ry = 0; ry < H; ry++) {
    int x0 = 0;
    if (p.cornerR > 0) {
      float r = fmn(p.cornerR, H / 2.0f), dy = fabsf(ry - yc);
      if (dy > yc - r) { float k = (dy - (yc - r)) / r; x0 = (int)jround(r - sqrtf(fmx(0, 1 - k * k)) * r); }
    }
    rc.capX0[ry] = x0;
    float d = lensRow((ry - yc) / yc, p), u = fabsf(d);
    rc.rowD[ry] = d; rc.rowClimbPow[ry] = powf(u, p.meniscusPow); rc.rowBulge[ry] = 1 - sqrtf(fmx(0, 1 - u * u));
  }
  RGB hi888 = ambientize(scale(hexToRgb(p.liquidHi), p.brightness * p.liquidBright), ambientBodyL(p), ambientAmt(p));
  rc.hiC = q(hi888);
  // pure liquid colour (no transparency mix) halfway to the highlight: brighter and more saturated than the body
  RGB liquid888 = scale(hexToRgb(p.liquid), p.brightness * p.liquidBright);
  rc.lensC = q(mix(liquid888, hi888, 0.55f));
  rc.darkC = q(scale(liquid888, 0.35f));
  rc.toneC = p.surfaceTone < 0 ? rc.darkC : rc.hiC; rc.toneT = alphaT(fmn(1, fabsf(p.surfaceTone)));
}

void Tube::applyLens(const Params &p) {
  if (!rc.lensOn) return;
  auto copyRow = [&](int yd) {
    int sy = rc.lensSrc[yd];
    if (sy != yd) memcpy(FB + (size_t)yd * PANEL_W, FB + (size_t)sy * PANEL_W, PANEL_W * 2);
  };
  if (rc.lensPos) {
    for (int yd = 0; yd < H / 2; yd++) copyRow(yd);
    for (int yd = H - 1; yd >= H / 2; yd--) copyRow(yd);
  } else {
    for (int yd = H / 2 - 1; yd >= 0; yd--) copyRow(yd);
    for (int yd = H / 2; yd < H; yd++) copyRow(yd);
  }
}

// `remaining`: liquid at the right end, draining. Its base is rendered in a mirrored frame, then
// flipped before panel-coordinate marks and bubbles are composited.
// Edge-effect blend tables: (row, k) -> 565, a function of the palette and lightK only. Rebuilt when
// lightK moves (exact compare: at rest it is constant, in motion it changes every frame anyway).
// Front brightening has no table (frontBright is wider than EFFECT_MAX in practice); it takes the direct path below.
// glow: blend(tubeBack, row, min(1, t*t*glowStrength*lightK)) as 565; front: alphaT(min(1, t*t*0.85*lightK*rowK)).
// Index [ry * EFFECT_MAX + k]. Returns nullptr when the effect is wider than the table (caller computes directly).
const uint16_t *Tube::effectTable(EffectTable &T, const Params &p, const Palette &pal, uint32_t gen, float lightK, bool glow) const {
  int n = glow ? (int)fceil(p.edgeGlow) : (int)p.frontBright;
  if (n > EFFECT_MAX) return nullptr;
  if (T.valid && T.gen == gen && T.H == H && T.lightK == lightK) return T.c;
  T.valid = true; T.gen = gen; T.H = H; T.lightK = lightK;
  for (int ry = 0; ry < H; ry++) for (int k = 0; k < n; k++) {
    uint16_t *o = T.c + ry * EFFECT_MAX + k;
    if (glow) { float t = 1 - k / p.edgeGlow; *o = blend565(pal.tubeBackRows[ry], pal.rows[ry], fmn(1, t * t * p.glowStrength * lightK)); }
    else { float t = 1 - (k + 1) / p.frontBright; *o = (uint16_t)alphaT(fmn(1, t * t * 0.85f * lightK * pal.rowK[ry])); }
  }
  return T.c;
}

void Tube::drawTube(int y0, const TubeState &st, const Params &p, uint32_t gen, int ticksN) {
  TubeState s = st;
  if (p.remaining) { s.fillPos = -st.fillPos; s.edgeLight = -st.edgeLight; s.cap = -st.cap; }
  float angle = s.angle;
  float len = columnLen(s.fillTarget, p);
  float xs = p.freeLiquid ? (p.remaining ? L - len - s.slugPos : s.slugPos) : 0;   // home-end edge centre
  float xe = xs + len + clampf(s.fillPos, -len, len);                                // time-edge centre; slosh can't exceed the volume
  float lightK = fmx(0.25f, 1 + p.edgeLightGain * s.edgeLight) * (1 + s.agitation);
  float lightKL = fmx(0.25f, 1 - p.edgeLightGain * s.edgeLight) * (1 + s.agitation);
  int xsI = (int)jround(xs);
  float capK = capScale(len, p, s.edgeLight, s.cap);
  float tanA = tanf(angle * (float)M_PI / 180);
  const bool hasLiquid = xe - xs >= 0.5f;   // an empty column draws nothing, not even an AA sliver
  ensureFizz(p, clampf(xe - xs - 6, 0, L), s.agitation);
  fizzExposed = (xe < L - 0.5f ? 1 : 0) | (p.freeLiquid && xs > 0.5f ? 2 : 0);

  int softW = p.edgeSoft > 0 ? (int)fmx(1, jround(p.edgeSoft)) : 0;
  const bool traceMode = p.traces && p.traceAmount > 0 && st.trace;

  // Tube back and cached edge geometry, before the residue backing and liquid body.
  const int16_t *capX0 = rc.capX0;
  for (int ry = 0; ry < H; ry++) {
    float ex = edgeX(ry, xe, tanA, p, s.edgeLight, s.acrossTilt, s.cap, capK);
    float exL = p.freeLiquid ? edgeXL(ry, xs, tanA, p, s.edgeLight, s.acrossTilt, s.cap, capK) : 0;
    edges[ry] = ex; edgesL[ry] = exL;
    fizzSurf[ry] = ex - xs; fizzSurfL[ry] = exL - xs;   // surface fronts for stepFizz (foam parks on the profile)
    hspan(y0 + ry, 0, L, pal.tubeBackRows[ry]);
  }

  // Residue and wet film form the backing UNDER the liquid. Paint them first, then
  // blend the body AA over that backing once. Masking residue by (1 - coverage)
  // over an already-AA body leaks the bare tube colour at their junction.
  if (traceMode) {
    const float yc = (H - 1) / 2.0f, hw = softW * 0.5f;
    const int N = p.wetFilm > 0 ? (int)fmx(1, jround(p.wetFilm)) : 0;
    const bool bandR = hasLiquid && N > 0 && s.filmFree > 0.02f;
    const bool bandL = hasLiquid && N > 0 && p.freeLiquid && s.filmHome > 0.02f;
    const float invSoftW = softW > 0 ? 1.0f / softW : 0.0f;
    const float invN = N > 0 ? 1.0f / N : 0.0f;
    // Columns that may receive residue or band: the occupied residue range (physics keeps
    // [traceLo, traceHi) tight) mirrored into the render frame, plus each band's reach over all rows.
    // Permanent film (traceFilm, see sim): every column carries residue of at least that level, so
    // the range is the whole tube and the per-column value floors at the film's gamma-lifted alpha,
    // capped (after traceAmount) at the body's opacity 1 - liquidTransparency so a clear liquid
    // never reads thinner than its own film.
    const float filmCap = 1 - clampf(p.liquidTransparency, 0, 1);
    const float filmG = p.traceFilm > 0 ? fmn(traceGamma(fmn(1.0f, p.traceFilm)), filmCap / p.traceAmount) : 0.0f;
    int lo = L, hi = 0;
    if (filmG > 0) { lo = 0; hi = L; }
    else if (st.traceHi > st.traceLo) { lo = p.remaining ? L - st.traceHi : st.traceLo; hi = p.remaining ? L - st.traceLo : st.traceHi; }
    if (bandL || bandR) for (int ry = 0; ry < H; ry++) {
      if (bandL) { int a = (int)ffloor(edgesL[ry] - N), b = (int)fceil(edgesL[ry] + hw) + 1; if (a < lo) lo = a; if (b > hi) hi = b; }
      if (bandR) { int a = (int)ffloor(edges[ry] - hw), b = (int)fceil(edges[ry] + N) + 1; if (a < lo) lo = a; if (b > hi) hi = b; }
    }
    if (hi > lo) {
      // widened +-4 for the blur reach (and 4 more for the columns the blur reads); columns outside
      // the residue range are guaranteed zero and the band only reads its own columns.
      const int a0 = lo - 4 < 0 ? 0 : lo - 4, a1 = hi + 4 > L ? L : hi + 4;
      const int c0 = a0 - 4 < 0 ? 0 : a0 - 4, c1 = a1 + 4 > L ? L : a1 + 4;
      for (int x = c0; x < c1; x++) traceRaw[x] = st.trace[p.remaining ? L - 1 - x : x];
      // +-4 px triangular blur before the streak texture (see sim): tapers the smear's outer end
      // (dense turnaround deposit next to bare glass) into a tide mark instead of a 1-px cliff
      for (int x = a0; x < a1; x++) {
        uint32_t acc = 5u * traceRaw[x];
        for (int d = 1; d <= 4; d++) {
          const int m = x < d ? 0 : x - d, q2 = x > L - 1 - d ? L - 1 : x + d;
          acc += (uint32_t)(5 - d) * (traceRaw[m] + traceRaw[q2]);
        }
        const float v = acc * (1.0f / 25.0f);
        // 1/256 units with headroom: traceAmount may exceed 1 (opacity boost) and the sim clamps only
        // AFTER the row weight below, so the column value keeps the excess (a uint8 cap here made
        // heavy residue lighter on the board than in the sim)
        const float g = fmx(v > 0 ? traceGamma(v * (1.0f / TRACE_FULL)) : 0.0f, filmG);
        float a = g > 0 ? g * 256.0f * p.traceAmount * traceStreak(x + (uint32_t)idx * 6151u) : 0.0f;
        traceA[x] = (uint16_t)(fmn(65535.0f, a) + 0.5f);
      }
      for (int ry = 0; ry < H; ry++) {
        float d = (ry - yc) / yc;
        int rowW = (int)((0.4f + 0.6f * d * d) * 256.0f + 0.5f), y = y0 + ry;
        const float ex = edges[ry], exL = edgesL[ry], xm = (ex + exL) * 0.5f;
        const int xr = (int)jround(ex), xrL = (int)jround(exL);   // hard edge: liquid where xrL <= x < xr
        // Row split into segments so the per-pixel coverage/band math only runs near the edges (see
        // sim): [a0, pl1) plain residue . [zl0, zl1) home-edge zone . [zl1, zr0) fully covered,
        // skipped . [zr0, zr1) time-edge zone . [pr0, a1) plain residue.
        int pl1 = a1, zl0 = a1, zl1 = a1, zr0 = a1, zr1 = a1, pr0 = a1;
        if (hasLiquid) {
          const float dl = bandL ? fmx(N, hw) : hw, dr = bandR ? fmx(N, hw) : hw;
          auto clampx = [a0, a1](int v) { return v < a0 ? a0 : v > a1 ? a1 : v; };
          pl1 = clampx((int)ffloor(exL - dl - 0.5f) + 1);
          const int sk0 = clampx(softW > 0 ? (int)fceil(exL + hw - 0.5f) : xrL);       // first fully covered column
          const int sk1 = clampx(softW > 0 ? (int)ffloor(ex - hw - 0.5f) + 1 : xr);   // one past the last
          pr0 = clampx((int)fceil(ex + dr - 0.5f));
          zl0 = pl1; zl1 = sk0 < pr0 ? sk0 : pr0; zr0 = sk1 > zl1 ? sk1 : zl1; zr1 = pr0;
        }
        // Plain residue is the hot loop of a smeared tube (up to L x H blends a frame): it writes the
        // strip row directly — y is inside the strip (drawTube's y0 is baseY), [a0, a1) inside [0, PANEL_W).
        static_assert(TUBE_LENGTH_PX <= PANEL_W, "trace columns index the strip row directly");
        uint16_t *const row = FB + ry * PANEL_W;
        traceFillRow(row, traceA, a0, pl1, rowW, pal.traceRows[ry]);
        traceFillRow(row, traceA, pr0, a1, rowW, pal.traceRows[ry]);
        for (int seg = 0; seg < 2; seg++) {
          const int z0 = seg ? zr0 : zl0, z1 = seg ? zr1 : zl1;
          for (int x = z0; x < z1; x++) {
            // liquid coverage the body pass will paint: full inside, the soft-edge ramp across each edge
            // Both coverage ramps share a width: take the smaller numerator before scaling and
            // clamp once. Reciprocals above avoid software float division in this pixel loop.
            const float cr = ex + hw - x - 0.5f, cl = x + 0.5f - exL + hw;
            const float cov = softW > 0
              ? clampf((cr < cl ? cr : cl) * invSoftW, 0, 1)
              : (x >= xrL && x < xr ? 1.0f : 0.0f);
            if (cov >= 1) continue;
            // wet band on each edge's own half: 1 at (and inside) the contact line, 0 at N px out
            const float b = x + 0.5f < xm
              ? (bandL ? s.filmHome * clampf(1 - (exL - x - 0.5f) * invN, 0, 1) : 0.0f)
              : (bandR ? s.filmFree * clampf(1 - (x + 0.5f - ex) * invN, 0, 1) : 0.0f);
            float a = (float)traceA[x] * rowW * (1.0f / 65536.0f);
            uint16_t c = pal.traceRows[ry];
            if (b > 0) { a += (1 - a) * b; c = blend565(c, pal.rows[ry], b); }
            if (a >= 1.0f / 255) pxa(x, y, c, fmn(1, a));
          }
        }
      }
    }
  }

  // Local backing per row and edge for the convex nose (3e): first pixel past the soft ramp, before the
  // body and glow paint it, plus the first pixel of the 3c wet film. See sim.
  if (hasLiquid) {
    const float hw = softW * 0.5f, yc = (H - 1) / 2.0f;
    const bool film3c = !traceMode && p.wetFilm > 0;
    for (int ry = 0; ry < H; ry++) {
      const int y = y0 + ry; const float d = (ry - yc) / yc, rowW = 0.4f + 0.6f * d * d;
      const int xr = (int)ffloor(edges[ry] + hw - 0.5f) + 1, xl = (int)fceil(edgesL[ry] - hw - 0.5f) - 1;
      uint16_t bR = xr >= 0 && xr < L && inStrip(xr, y) ? rd(xr, y) : pal.tubeBackRows[ry];
      uint16_t bL = xl >= capX0[ry] && xl < L && inStrip(xl, y) ? rd(xl, y) : pal.tubeBackRows[ry];
      if (film3c && s.filmFree > 0.02f && jround(p.wetFilm * s.filmFree) > 0) bR = blend565(bR, pal.rows[ry], 0.35f * s.filmFree * rowW);
      if (film3c && p.freeLiquid && s.filmHome > 0.02f && jround(p.wetFilm * s.filmHome) > 0) bL = blend565(bL, pal.rows[ry], 0.35f * s.filmHome * rowW);
      backR[ry] = bR; backL[ry] = bL;
    }
  }

  // Liquid body and its soft edge, over the residue backing.
  for (int ry = 0; ry < H; ry++) {
    const float ex = edges[ry], exL = edgesL[ry];
    const int x0 = capX0[ry];
    if (!hasLiquid) continue;
    int xi = (int)ffloor(ex); float frac = ex - xi;
    int xiL = (int)ffloor(exL); float fracL = exL - xiL;
    int xa = x0 > xiL + 1 ? x0 : xiL + 1;
    // Preserve the underlay in partially covered pixels until the AA pass blends them.
    const int solidLo = traceMode && softW > 0 ? (int)fmx(xa, fceil(exL + softW * 0.5f - 0.5f)) : xa;
    const int solidHi = traceMode && softW > 0 ? (int)fmn(xi, ffloor(ex - softW * 0.5f - 0.5f) + 1) : xi;
    hspan(y0 + ry, solidLo, solidHi, pal.rows[ry]);
    if (p.edgeSoft > 0) {  // soft edge: a coverage ramp `w` px wide centred on the geometric edge.
      // The glow (if any) folds into the same per-pixel alpha min(1, cov + g), anchored to the
      // sub-pixel edge: no integer snapping, so no seam before the glow and no 1-px stepping
      // while the edge moves. alpha is monotone in x by construction (cov and g both decline).
      int w = (int)fmx(1, jround(p.edgeSoft)); float hw = w * 0.5f;
      bool glow = p.edgeGlow > 0 && p.glowStrength > 0;
      const float invW = 1.0f / w, invGlow = glow ? 1 / p.edgeGlow : 0;   // no FP divide unit: multiply in the pixel loops
      // A bead shorter than the two AA ramps composites once using their intersection.
      if (traceMode && ex - exL < w) {
        const float reach = hw + (glow ? p.edgeGlow : 0);
        const int first = (int)fmx(x0, ffloor(exL - reach)), end = (int)fmn(L, fceil(ex + reach));
        for (int x = first; x < end; x++) {
          const float gr = glow ? fmx(0, 1 - (x + 0.5f - ex) * invGlow) : 0;
          const float gl = glow ? fmx(0, 1 - (exL - x - 0.5f) * invGlow) : 0;
          const float ar = fmx(0, (ex + hw - x - 0.5f) * invW) + gr * gr * p.glowStrength * lightK;
          const float al = fmx(0, (x + 0.5f - exL + hw) * invW) + gl * gl * p.glowStrength * lightKL;
          const float a = fmn(1, fmn(ar, al));
          if (a > 0) pxa(x, y0 + ry, pal.rows[ry], a);
        }
        continue;
      }
      int a0 = (int)ffloor(ex - hw - 0.5f) + 1;
      int aEnd = glow ? (int)fceil(ex + hw - 0.5f + p.edgeGlow) : (int)fceil(ex + hw - 0.5f) - 1;
      uint16_t *const row = FB + ry * PANEL_W;
      rampRowR(row, a0, aEnd, ex, hw, invW, invGlow, glow, p.glowStrength, lightK, x0, solidLo, solidHi,
               traceMode, pal.tubeBackRows[ry], pal.rows[ry]);
      int b0 = (int)ffloor(exL - hw - 0.5f) + 1;
      int bEnd = glow ? (int)ffloor(exL - hw - 0.5f - p.edgeGlow) : b0;  // home edge: glow to the left
      rampRowL(row, (int)fceil(exL + hw - 0.5f) - 1, bEnd, exL, hw, invW, invGlow, glow, p.glowStrength, lightKL, x0, xi,
               solidLo, solidHi, traceMode, pal.tubeBackRows[ry], pal.rows[ry]);
    } else {
      if (frac >= 0.5f) px(xi, y0 + ry, pal.rows[ry]);
      if (fracL < 0.5f && xiL >= x0) px(xiL, y0 + ry, pal.rows[ry]);
    }
  }

  // 3a: front brightening, weighted by row luma
  if (hasLiquid && p.frontBright > 0) {
    const float invFront = 1 / p.frontBright;
    const uint16_t hiC = rc.hiC;
    const uint16_t *fT = nullptr, *fTL = nullptr; const bool tab = false;
    for (int ry = 0; ry < H; ry++) {
      int xi = (int)ffloor(edges[ry]); float rowK = pal.rowK[ry];
      int xiL = (int)ffloor(edgesL[ry]);
      for (int k = 1; k <= p.frontBright; k++) {
        int x = xi - k; if (x < 0) break;
        if (x >= L) continue;
        int T; if (tab) T = fT[ry * EFFECT_MAX + k - 1]; else { float t = 1 - k * invFront; T = alphaT(fmn(1, t * t * 0.85f * lightK * rowK)); }
        px(x, y0 + ry, blend565T(rd(x, y0 + ry), hiC, T));
      }
      if (!p.freeLiquid) continue;
      for (int k = 1; k <= p.frontBright; k++) {   // home edge: lit by the opposite tilt
        int x = xiL + k; if (x >= xi - p.frontBright) break;
        if (x < 0 || x >= L) continue;
        int T; if (tab) T = fTL[ry * EFFECT_MAX + k - 1]; else { float t = 1 - k * invFront; T = alphaT(fmn(1, t * t * 0.85f * lightKL * rowK)); }
        px(x, y0 + ry, blend565T(rd(x, y0 + ry), hiC, T));
      }
    }
  }

  // 3b: edge glow — a few px past the edge. Hard-edge path only (edgeSoft = 0); with a soft
  // edge the glow is folded into the step-3 per-pixel alpha.
  if (hasLiquid && p.edgeSoft <= 0 && p.edgeGlow > 0 && p.glowStrength > 0) {
    const float invGlow = 1 / p.edgeGlow;
    const uint16_t *gT = traceMode ? nullptr : effectTable(glowT[0], p, pal, gen, lightK, true);
    const uint16_t *gTL = !traceMode && p.freeLiquid ? effectTable(glowT[1], p, pal, gen, lightKL, true) : nullptr;
    const bool tab = gT && (!p.freeLiquid || gTL);
    for (int ry = 0; ry < H; ry++) {
      // glow starts at the first px past the RENDERED hard edge (round(ex)), never leaving a
      // 1-px tube-back gap that flickers as frac crosses 0.5
      int xg = (int)jround(edges[ry]), xgL = (int)jround(edgesL[ry]) - 1;
      for (int k = 0; k < p.edgeGlow; k++) {
        int xr = xg + k, xl = xgL - k;
        if (xr < L) {
          if (traceMode) { float t = 1 - k * invGlow; pxa(xr, y0 + ry, pal.rows[ry], fmn(1, t * t * p.glowStrength * lightK)); }
          else {
            uint16_t c; if (tab) c = gT[ry * EFFECT_MAX + k]; else { float t = 1 - k * invGlow; c = blend565(pal.tubeBackRows[ry], pal.rows[ry], fmn(1, t * t * p.glowStrength * lightK)); }
            px(xr, y0 + ry, c);
          }
        }
        if (p.freeLiquid && xl >= capX0[ry]) {
          if (traceMode) { float t = 1 - k * invGlow; pxa(xl, y0 + ry, pal.rows[ry], fmn(1, t * t * p.glowStrength * lightKL)); }
          else {
            uint16_t c; if (tab) c = gTL[ry * EFFECT_MAX + k]; else { float t = 1 - k * invGlow; c = blend565(pal.tubeBackRows[ry], pal.rows[ry], fmn(1, t * t * p.glowStrength * lightKL)); }
            px(xl, y0 + ry, c);
          }
        }
      }
    }
  }

  // 3c: wet film left by a receding edge (see sim step 3c). In trace mode the film is the wet band
  // of 3d instead (full liquid at the edge, thinning into the residue), so this faint one is skipped.
  if (!traceMode && hasLiquid && p.wetFilm > 0 && (s.filmFree > 0.02f || (p.freeLiquid && s.filmHome > 0.02f))) {
    const float yc = (H - 1) / 2.0f;
    for (int ry = 0; ry < H; ry++) {
      float d = (ry - yc) / yc, rowW = 0.4f + 0.6f * d * d;
      int nR = (int)jround(p.wetFilm * s.filmFree), nL = p.freeLiquid ? (int)jround(p.wetFilm * s.filmHome) : 0;
      int xg = softW > 0 ? (int)fceil(edges[ry] + softW * 0.5f - 0.5f) : (int)fceil(edges[ry]);
      int xgL = softW > 0 ? (int)ffloor(edgesL[ry] - softW * 0.5f - 0.5f) : (int)ffloor(edgesL[ry]);
      for (int k = 0; k < nR; k++) if (xg + k < L) pxa(xg + k, y0 + ry, pal.rows[ry], 0.35f * s.filmFree * rowW * (1 - (float)k / nR));
      for (int k = 0; k < nL; k++) if (xgL - k >= capX0[ry]) pxa(xgL - k, y0 + ry, pal.rows[ry], 0.35f * s.filmHome * rowW * (1 - (float)k / nL));
    }
  }

  // 4: highlight inset
  if (hasLiquid && p.highlightInset > 0) {
    int hiTop = highlightTop(p, s.light);
    for (int ry = hiTop; ry < hiTop + p.highlightH && ry < H; ry++) {
      if (ry < 0) continue;
      float ex = edges[ry];
      int bi = hiTop + (int)p.highlightH + 1; if (bi > H - 1) bi = H - 1;
      uint16_t bodyRow = pal.rows[bi];
      int xl = (int)fmx(0, ffloor(edgesL[ry]));   // home edge (0 unless the liquid is free)
      for (int x = (int)ffloor(ex - p.highlightInset); x < (int)ffloor(ex); x++) {
        if (x < xl) continue;   // never outside the column
        float t = (x - (ex - p.highlightInset)) / p.highlightInset;
        px(x, y0 + ry, blend565(pal.rows[ry], bodyRow, t));
      }
      for (int x = xl; x < xl + p.highlightInset && x < ex; x++) {
        float t = 1 - (float)(x - xl) / p.highlightInset;
        px(x, y0 + ry, blend565(pal.rows[ry], bodyRow, t));
      }
    }
  }

  // 3e: meniscus surface, over residue and the inset highlight. Concave bands grade from
  // a dark inner shoulder to a lit rim with subpixel coverage; convex noses shade inward.
  // Alpha-over blends the stroke over the actual smear. Both branches fade as the ring
  // meets the profile. See sim step 3e. No extra buffers or allocations.
  for (int ry = 0; ry < H; ry++) {
    strokeR[ry] = strokeL[ry] = 0;
    bandFill[0][ry] = bandFill[1][ry] = bandBlick[0][ry] = bandBlick[1][ry] = bandRim[0][ry] = bandRim[1][ry] = 0;
  }
  float strokeA = 0, pullR = 0, pullL = 0, veilA = 0;   // the stroke's opacity; receding pull per edge; foam veil opacity
  if (hasLiquid && p.surfaceBand > 0) {
    const float hw = softW * 0.5f, transK = clampf(p.liquidTransparency, 0, 1);
    // opaque from surfaceBand ~0.6 whatever the light; the unlit edge gets a darker stroke; motion
    // never fades it, only reshapes the dish through TubeState.cap (see sim)
    strokeA = fmn(1, 1.6f * p.surfaceBand);
    // dynamic contact angle: a receding line (~0° by half the full-film speed) is liquid thinning into
    // its film — liquid colour, no shoulder or rim; instantaneous edge speed, so both are back once the
    // line stops (see sim)
    const float recede = p.remaining ? 1 : -1;
    pullR = clampf(2 * recede * (s.fillVel + s.slugVel) / FILM_FULL_PX_S, 0, 1);
    pullL = p.freeLiquid ? clampf(-2 * recede * s.slugVel / FILM_FULL_PX_S, 0, 1) : 0.0f;
    // interior opacity of the dish (surfaceFill; rim and blick keep their own) and the blick's per-row
    // weight: a tent centred at the light angle's highlight row, BLICK_H of the tube tall (see sim blickRow)
    const float fill = clampf(p.surfaceFill, 0, 1);
    veilA = FOAM_VEIL * strokeA * fill;
    const float yc = (H - 1) / 2.0f, blickY = yc - yc * sinf(s.light * (float)M_PI / 180), blickInvH = 1 / fmx(2, BLICK_H * H);
    auto blickRow = [&](int ry) -> float {
      return p.surfaceBlick > 0 ? p.surfaceBlick * fmx(0, 1 - fabsf(ry - blickY) * blickInvH) : 0.0f; };
    const uint16_t hiC = rc.hiC;
    auto tone = [&](uint16_t c) -> uint16_t { return rc.toneT > 0 ? blend565T(c, rc.toneC, rc.toneT) : c; };
    auto surface = [&](int ry, float xm, float xw, int dir, float lk, int xlo, int xhi) -> float {
      const int y = y0 + ry; const float tw = dir * (xw - xm);   // ring lead in the edge's own outward sense
      if (tw == 0) return 0;
      const float lo = fmn(xm, xw), hi = fmx(xm, xw);   // pixel centres in [lo, hi)
      int x0 = (int)fceil(lo - 0.5f), x1 = (int)fceil(hi - 0.5f); if (x0 < xlo) x0 = xlo; if (x1 > xhi) x1 = xhi;
      if (tw > 0) {   // concave: shaded surfaceWidth-px band, clipped to the wall ring
        // Overlap the body's AA ramp so it joins the shoulder without a bare-glass seam.
        const float a = strokeA * fmn(1, tw);
        if (a < 1 / 255.0f) return 0;   // below visible opacity: no stroke, rim or band for the marks
        const float shade = 0.6f * (1 - fmn(1, lk));   // unlit edge: toward the deep liquid colour
        const uint16_t inner = tone(blend565(pal.rows[ry], rc.darkC, 0.3f));
        const uint16_t outer = tone(blend565(blend565(rc.lensC, pal.rows[ry], 0.2f), rc.darkC, shade));
        const float wEff = fmn(p.surfaceWidth, tw);
        const float invWidth = 1 / (wEff + hw);
        const float pull = dir > 0 ? pullR : pullL;
        const float blickK = blickRow(ry) * fmn(1, lk) * (1 - pull);
        // the ring is a thin liquid lens: lit (light side, row shaded) over a dark back, a deep liquid tone
        // at light-independent opacity over a light one; backK blends the two (sim rimK / rimC). Float
        // mixes once per row, like the sim's blend565.
        const float backK = fmn(1, luma(to888(pal.tubeBackRows[ry])) / 255.0f);
        const float rimK = p.surfaceRim * fmn(1, wEff / 2) * (1 - pull) * ((1 - backK) * (0.5f + 0.5f * pal.rowK[ry]) * fmn(1, lk) + backK);
        const uint16_t rimC = q(mix(to888(hiC), to888(q(mix(to888(pal.rows[ry]), to888(rc.darkC), 0.75f))), backK));
        const int side = dir > 0 ? 0 : 1;   // layer weights for the rear-mark compositor (Mark::bandMark)
        bandFill[side][ry] = a * fill; bandBlick[side][ry] = a * blickK; bandRim[side][ry] = a * rimK;
        // Pixel-footprint coverage for the stroke and rim; no integer-column snapping. See sim.
        const float cLo = dir > 0 ? xm - hw : xm - wEff, cHi = dir > 0 ? xm + wEff : xm + hw;
        int xa = (int)ffloor(cLo), xb = (int)fceil(cHi); if (xa < xlo) xa = xlo; if (xb > xhi) xb = xhi;
        bandRow(FB + ry * PANEL_W, xa, xb, xm, dir, hw, wEff, invWidth, a, fill, blickK, pull, rimK, inner, outer, pal.rows[ry], hiC, rimC);
        return wEff;
      } else {   // convex: thin nose inside the profile back to the ring
        // The thin nose shows the local backing sampled before body and glow (bare back, or a receding
        // edge's liquid-coloured film / residue: no pale crescent). Motion never fades it. See sim.
        const float noseK = p.surfaceBand;
        const uint16_t back = dir > 0 ? backR[ry] : backL[ry];
        const uint16_t c = tone(blend565(blend565(pal.rows[ry], back, 0.55f), hiC, 0.5f * transK));
        const float invTw = 1 / tw;
        for (int x = x0; x < x1; x++) {
          float t = dir * (x + 0.5f - xm); if (t > -hw) continue;
          float a = noseK * fmn(1, -tw) * (1 - sqrtf(fmx(0, t * invTw)));   // t/tw: 1 at the ring, 0 at the tip
          if (a >= 1 / 255.0f) pxa(x, y, c, fmn(1, a));
        }
        return 0;
      }
    };
    for (int ry = 0; ry < H; ry++) {
      int xi = (int)ffloor(edges[ry]), xa = (int)ffloor(edgesL[ry]) + 1; if (xa < capX0[ry]) xa = capX0[ry];
      strokeR[ry] = surface(ry, edges[ry], wallX(ry, xe, tanA, p, s.edgeLight, s.acrossTilt, s.cap, capK), 1, lightK, xa, L);
      if (p.freeLiquid) strokeL[ry] = surface(ry, edgesL[ry], wallXL(ry, xs, tanA, p, s.edgeLight, s.acrossTilt, s.cap, capK), -1, lightKL, capX0[ry], xi);
    }
  }

  // Panel-frame column bounds for the mark compositor (liquid where lo <= x < hi): the body only. The
  // concave band past it is composited per pixel by its own layer opacities (Mark::bandMark, render
  // frame), so a faint or receding band never hides a mark as liquid and there is no threshold (see sim).
  const BandInfo band{{edges, edgesL}, {strokeR, strokeL}, {bandFill[0], bandFill[1]}, {bandBlick[0], bandBlick[1]},
                      {bandRim[0], bandRim[1]}, {pullR, pullL}, softW * 0.5f, p.remaining, L};
  Edges bounds{boundLo, boundHi, hasLiquid && p.surfaceBand > 0 ? &band : nullptr};
  for (int ry = 0; ry < H; ry++) {
    float lo = edgesL[ry], hi = edges[ry];
    if (p.remaining) {
      uint16_t *row = FB + ry * PANEL_W;
      for (int a = 0, b = L - 1; a < b; a++, b--) { uint16_t t = row[a]; row[a] = row[b]; row[b] = t; }
      boundLo[ry] = L - hi; boundHi[ry] = L - lo;
    } else { boundLo[ry] = lo; boundHi[ry] = hi; }
  }

  // Scale marks, all before bubbles.
  bool haveLabels = layoutLabels(y0, p, gen, ticksN, st.acrossTilt, st.edgeLight, st.fillTarget, labels);
  auto drawTickLayer = [&](bool onTop) {
    if (p.ticksOnTop == onTop) {
      Mark tickMark(*this, y0, bounds, p, onTop, p.markContrast * p.tickBright);
      float dx = onTop ? 0 : -st.edgeLight * p.tickParallax;
      float dy = onTop ? 0 : st.acrossTilt * p.tickParallax;
      drawTicks(y0, p, ticksN, rc.tickWet, onTop ? rc.tickWet : rc.tickDry, onTop ? nullptr : &bounds, tickMark, dx, dy);
    }
  };
  auto drawDigitLayer = [&](bool onTop) {
    if (haveLabels && p.digitsOnTop == onTop) {
      Mark digitMark(*this, y0, bounds, p, onTop, p.markContrast * p.digitBright, labels.sprite && labels.shadow >= 0);
      drawLabels(y0, labels, Wet(onTop ? nullptr : &bounds, H), digitMark);
    }
  };
  drawTickLayer(false);
  drawDigitLayer(false);
  auto mapX = [&](int x) { return p.remaining ? L - 1 - x : x; };
  auto span = [&](int y, int xa, int xb, uint16_t c) {
    if (p.remaining) hspan(y, L - 1 - xb, L - xa, c);
    else hspan(y, xa, xb + 1, c);
  };

  // 5: fizz — AA discs, pre-squashed by the local lens magnification (see sim step 5)
  if (p.fizz) {
    const float *mag = rc.mag;
    for (int k = 0; k < fizzN; k++) {
      const Fizz &f = fizz[k];
      int fy = (int)clampf(jround(f.y), 0, H - 1);
      // Centres stay inside this frame's surfaces (the stepper ran on an older one, so a receding surface pushes
      // them back here): whatever touches a surface floats at most half out of it, like the foam.
      const float fx = fmx(-foamFront(fizzSurfL, H, f.y, -1), fmn(foamFront(fizzSurf, H, f.y, 1), f.x));
      // A parked bubble in its last FOAM_POP_T s pops: swells and fades out, breaking the surface.
      const float pop = f.life != 0 && fabsf(f.life) < FOAM_POP_T ? fabsf(f.life) / FOAM_POP_T : 1;
      const float r = fizzR(p, f.v) * (1 + 0.6f * (1 - pop));
      const float m = fizzMag(mag, H, f.y, r), ry = r / m, off = r * p.fizzShadeOff;   // dark core shifted lower-right (in lens-squashed space)
      const float rIn = r - 0.5f, rOut = r + 0.5f, kc = r - 1 - off;
      DiscRow d;
      d.fx = fx; d.r = r; d.off = off; d.kc = kc;
      d.in2 = rIn >= 1 ? rIn * rIn * (1 - 1e-4f) : -1; d.out2 = rOut * rOut * (1 + 1e-4f);
      d.core = r >= 1.5f && kc > 0; d.core2Lo = kc * kc * (1 - 1e-4f); d.core2Hi = kc * kc * (1 + 1e-4f);
      d.veilA = veilA; d.pullR = pullR; d.pullL = pullL;
      d.mirror = p.remaining; d.xsI = xsI; d.L = L; d.cIn = pal.bubbleIn[fy]; d.cRim = pal.bubbleRim;
      const int ixa = (int)ffloor(fx - r - 1), ixb = (int)fceil(fx + r);
      for (int iy = (int)ffloor(f.y - ry - 1); iy <= (int)fceil(f.y + ry); iy++) {
        if (iy < 0 || iy >= H) continue;
        d.wallT = pal.dryT[iy] / 256.0f * pop;   // bubbles live in the bore: invisible where the ray only sees the wall band
        if (d.wallT <= 0) continue;
        // Past the profile a bubble is seen through the concave band's front-glass wedge, thickest at the
        // profile and gone at the band's outer rim.
        d.sR = fizzSurf[iy]; d.sL = fizzSurfL[iy]; d.bR = strokeR[iy]; d.bL = strokeL[iy];   // stroke widths: 0 where no band is drawn
        d.dy = (iy + 0.5f - f.y) * m;
        discRow(FB + iy * PANEL_W, ixa, ixb, d);
      }
    }
  }

  // 6: bubble
  if (p.bubble) {
    float bx = xe - p.bubbleGap - s.edgeLight * p.bubbleTiltGain, by = (H - 1) * p.bubbleY - (H - 1) / 2.0f * s.acrossTilt * p.bubbleRollGain;
    float rx = p.bubbleW / 2, ry_ = p.bubbleH / 2;
    if (bx - rx > xs + 2) {
      for (int yy = (int)ffloor(by - ry_); yy <= (int)fceil(by + ry_); yy++) {
        float dy = (yy - by) / ry_;
        if (fabsf(dy) > 1) continue;
        float hw = sqrtf(1 - dy * dy) * rx;
        int xa = (int)jround(bx - hw), xb = (int)jround(bx + hw);
        int ryi = yy < 0 ? 0 : yy > H - 1 ? H - 1 : yy;
        span(y0 + yy, xa, xb, pal.bubbleIn[ryi]);
        px(mapX(xa), y0 + yy, pal.bubbleRim); px(mapX(xb), y0 + yy, pal.bubbleRim);
      }
      int yt = (int)jround(by - ry_), yb = (int)jround(by + ry_);
      span(y0 + yt, (int)jround(bx - rx * 0.45f), (int)jround(bx + rx * 0.45f), pal.bubbleRim);
      span(y0 + yb, (int)jround(bx - rx * 0.45f), (int)jround(bx + rx * 0.45f), pal.bubbleRim);
    }
  }
  drawTickLayer(true);
  applyLens(p);
  drawDigitLayer(true);
}


bool render_init() {
  buildLuts();
  bool ok = true;
  for (int i = 0; i < 2; i++) {
    tubes[i].set.poolC = (uint16_t *)heap_caps_malloc(GLYPH_POOL_PX * 2, MALLOC_CAP_SPIRAM);
    tubes[i].set.poolA = (uint8_t *)heap_caps_malloc(GLYPH_POOL_PX, MALLOC_CAP_SPIRAM);
    ok = ok && tubes[i].set.poolC && tubes[i].set.poolA;
  }
  return ok;
}

// Safe to call for idx 0 and 1 concurrently from different tasks: each touches only tubes[idx] and its
// own strip; params / state are read-only for the duration of the call.
void renderTube(int idx, const TubeState &s, const Params &p, uint32_t gen, uint16_t *strip) {
  Tube &t = tubes[idx & 1];
  TubeLayout lay = tubeLayout(p);
  t.FB = strip; t.H = lay.H; t.baseY = idx == 0 ? lay.yH : lay.yM; t.idx = idx & 1;
  t.buildRowCache(p, gen);
  Palette &pal = t.pal;
  if (!(pal.valid && pal.gen == gen && pal.H == t.H && pal.light == s.light)) {
    t.buildPalette(p, s.light, pal);
    pal.valid = true; pal.gen = gen; pal.H = t.H; pal.light = s.light;
  }
  t.drawTube(t.baseY, s, p, gen, idx == 0 ? 12 : 60);
}
