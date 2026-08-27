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
struct RGB { float r, g, b; };
static inline float jround(float x) { return floorf(x + 0.5f); }           // JS Math.round
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
// jround(a + (b-a)*t) (arithmetic shift == floor, +128 == round-half-up).
static inline void expand565(uint16_t c, int &r, int &g, int &b) {
  int r5 = (c >> 11) & 0x1f, g6 = (c >> 5) & 0x3f, b5 = c & 0x1f;
  r = (r5 << 3) | (r5 >> 2); g = (g6 << 2) | (g6 >> 4); b = (b5 << 3) | (b5 >> 2);
}
static inline uint16_t blend565(uint16_t a, uint16_t b, float t) {
  int T = (int)(t * 256 + 0.5f);
  if (T <= 0) return a;
  if (T >= 256) return b;
  int ar, ag, ab, br, bg, bb;
  expand565(a, ar, ag, ab); expand565(b, br, bg, bb);
  return rgb565(ar + (((br - ar) * T + 128) >> 8), ag + (((bg - ag) * T + 128) >> 8), ab + (((bb - ab) * T + 128) >> 8));
}
// Same blend with the 1/256 fraction already quantised (T = (int)(t * 256 + 0.5f)).
static inline uint16_t blend565T(uint16_t a, uint16_t b, int T) {
  if (T <= 0) return a;
  if (T >= 256) return b;
  int ar, ag, ab, br, bg, bb;
  expand565(a, ar, ag, ab); expand565(b, br, bg, bb);
  return rgb565(ar + (((br - ar) * T + 128) >> 8), ag + (((bg - ag) * T + 128) >> 8), ab + (((bb - ab) * T + 128) >> 8));
}
static inline int alphaT(float t) { return (int)(t * 256 + 0.5f); }
static inline float luma(RGB c) { return 0.299f * c.r + 0.587f * c.g + 0.114f * c.b; }

// Per-channel LUTs built once with the exact float formulas they replace (bit-exact with the sim):
// sprite alpha 0..255 -> blend fraction; tick emboss highlight / shadow of an expanded 565 channel.
static uint16_t LUT_alphaT16[256];
static uint8_t LUT_embHi[256], LUT_embLo[256];
static void buildLuts() {
  for (int v = 0; v < 256; v++) {
    LUT_alphaT16[v] = (uint16_t)alphaT(v / 255.0f);
    LUT_embHi[v] = (uint8_t)jround(clampf((float)v + (255.0f - (float)v) * 0.7f, 0, 255));
    LUT_embLo[v] = (uint8_t)jround(clampf((float)v * 0.25f, 0, 255));
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
  uint16_t body, tubeBack, bubbleRim;
  float rowK[TUBE_HEIGHT_MAX];   // luma weight per row for front brightening (sim step 3a)
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
// <60 KB there. GLYPH_POOL_PX covers the 10 glyphs of a set up to ~4.5x scale (18 KB per tube); a set
// that does not fit drops the glyphs past the budget (visible, not silent).
#define GLYPH_POOL_PX 6144
struct ScaledGlyph { int w, h; uint16_t *c; uint8_t *a; };
struct ScaledSet {
  int sheet = -1, bw = 0, bh = 0; float brightness = -1, tintAmt = -1, tone = 0; uint32_t tint = 0;
  ScaledGlyph g[10] = {};
  uint16_t *poolC = nullptr; uint8_t *poolA = nullptr;
};
// ---------------------------------------------------------------------------------------------
// marks (ticks + labels) seen through the liquid
// ---------------------------------------------------------------------------------------------
// Integer version of the sim's throughLiquid (luma in 1/1000 units, blend fractions in 1/256).
// T = liquidTransparency in 1/256, C = contrast in 1/1000 (both hoisted into Mark).
static uint16_t throughLiquid(uint16_t bg, uint16_t mark, int T, int C) {
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
struct Edges { const float *lo, *hi; };
struct Mark {
  Tube &t; int y0; Edges edges; bool onTop; int T, C;   // T: transparency 1/256, C: contrast 1/1000
  Mark(Tube &t_, int y0_, Edges e, const Params &p, bool onTop_, float contrast) : t(t_), y0(y0_), edges(e), onTop(onTop_) {
    T = (int)(p.liquidTransparency * 256 + 0.5f); if (T < 0) T = 0; if (T > 256) T = 256;
    C = (int)(contrast * 1000 + 0.5f);
  }
  // covT: coverage in 1/256 (256 = opaque)
  inline void operator()(int x, int y, uint16_t c, int covT = 256, int rel = 0) const;
};

struct Label { int x0; char text[3]; int len; int adv[2]; };
struct Labels {
  Label list[12]; int n; int bw, bh, ry0, ry1, yTop; ScaledGlyph *sprite; const Font *font; int gap;
  uint16_t rows[96]; int16_t sourceRows[TUBE_HEIGHT_MAX]; int shadow;
  int16_t drySourceRows[TUBE_HEIGHT_MAX]; int dryRy0, dryRy1;   // rear digits behind air (digitDryLens)
  // cache key: everything above is a function of (params gen, H) plus these two motion-derived ints
  uint32_t gen = 0; int H = 0, bottomOff = 0, first = -1; bool valid = false, have = false;
};

static void markSourceRows(int height, float lens, int16_t *out, float curve = 1) {
  float strength = fabsf(clampf(lens, -1, 1));
  float signedCurve = lens < 0 ? -clampf(curve, -3, 3) : clampf(curve, -3, 3);
  float exponent = signedCurve > 0 ? 1 + signedCurve * 2 : 1 / (1 - signedCurve * 2);
  for (int yd = 0; yd < height; yd++) {
    float d = (yd + 0.5f - height / 2.0f) / (height / 2.0f), u = fabsf(d);
    float warped = signedCurve == 0 ? u : (1 - strength) * u + strength * powf(u, exponent);
    float s = (d < 0 ? -1 : 1) * warped;
    out[yd] = (int16_t)clampf(floorf(height / 2.0f + s * height / 2.0f), 0, height - 1);
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
#define MAX_FIZZ 64
struct Fizz { float x, y, v; };   // px in the liquid frame

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
};
// Edge-effect blend tables: (row, k) -> 565, a function of the palette and lightK only. Rebuilt when
// lightK moves (exact compare: at rest it is constant, in motion it changes every frame anyway).
#define EFFECT_MAX 16
struct EffectTable { uint32_t gen = 0; int H = 0; float lightK = -1; bool valid = false; uint16_t c[TUBE_HEIGHT_MAX * EFFECT_MAX]; };

// All mutable state of one tube's renderer (hours = tubes[0], minutes = tubes[1]). Two of these are
// static (fixed footprint, ~9 KB each); the strip pointer / geometry are set per call by renderTube.
// Nothing here is shared between the two, so the tubes can render concurrently on both cores.
struct Tube {
  uint16_t *FB = nullptr; int baseY = 0, H = TUBE_HEIGHT_PX;
  Palette pal; RowCache rc; Labels labels; ScaledSet set;
  EffectTable glowT[2];                                       // 0 = time edge, 1 = home edge
  float edges[TUBE_HEIGHT_MAX], edgesL[TUBE_HEIGHT_MAX];      // render-frame liquid edges per row
  float boundLo[TUBE_HEIGHT_MAX], boundHi[TUBE_HEIGHT_MAX];   // panel-frame bounds when `remaining`
  Fizz fizz[MAX_FIZZ]; int fizzN = 0; float fizzLen = 0;      // liquid length px, set by drawTube

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
  ScaledGlyph *scaledGlyphs(int sheetIdx, int bw, int bh, float brightness, uint32_t tintHex, float tintAmt, float tone);
  bool layoutLabels(int y0, const Params &p, uint32_t gen, int ticksN, float acrossTilt, float fill, Labels &lb);
  void drawSpriteGlyph(const ScaledGlyph &g, int x, int y0, const Labels &lb, const Wet &wet, const Mark &mark) const;
  void drawBitmapGlyph(const Font &f, int d, int x, int y0, const Labels &lb, const Wet &wet, const Mark &mark) const;
  void drawLabels(int y0, const Labels &lb, const Wet &wet, const Mark &mark) const;
  void drawTicks(int y0, const Params &p, int ticksN, const int16_t *wetRows, const int16_t *dryRows,
                 const Edges *edges, const Mark &mark, float dxFull = 0, float dyFull = 0) const;
  void ensureFizz(const Params &p, float len, float agitation);
  inline float fizzSquashRow(const Params &p, int y) const;
  void lensMagRows(const Params &p, float *rows) const;
  inline float edgeCap(int ry, const Params &p, float tilt, float side, float cap) const;
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
  if (!onTop && x >= edges.lo[ry] && x < edges.hi[ry])
    c = throughLiquid(t.rd(x, y), c, T, C);
  if (rel > 0) c = embossHi(c);
  else if (rel < 0) c = embossLo(c);
  t.wr(x, y, covT >= 256 ? c : blend565T(t.rd(x, y), c, covT));
}

// Glass wall shading weight 0..1 per row (sim: glassW): ambient cylinder shade, specular tent on the
// top wall, faint band on the lower wall, brighter outermost rows.
float Tube::glassW(const Params &p, int y, int hiTop, float lam) const {
  float t = (float)y / (H - 1);
  float amb = 0.5f + 0.5f * cosf((t - 0.3f) * (float)M_PI * 1.6f);
  float w = p.glassBody * (amb + (lam - amb) * p.lightPhys);
  if (y >= hiTop && y < hiTop + p.highlightH)
    w += p.glassHiBright * powf(1 - fabsf((y - hiTop) / fmaxf(1, p.highlightH - 1) - 0.5f) * 2, p.highlightSharp);
  float d = (t - 0.82f) / 0.07f;
  w += p.glassReflect * expf(-d * d);
  int rim = y < H - 1 - y ? y : H - 1 - y;
  if (rim < 2) w += p.glassRim * (rim == 0 ? 1 : 0.4f);
  return fminf(1, w);
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
  float yc = (H - 1) / 2.0f, lightRad = 2 * lightDeg * (float)M_PI / 180;
  int hiTop = highlightTop(p, lightDeg);
  for (int y = 0; y < H; y++) {
    float t = (float)y / (H - 1);
    int gradient = (int)jround(p.tubeBackGradient);
    float backMix = gradient == 1 ? t : gradient == 2 ? 1 - fabsf(t * 2 - 1)
      : gradient == 3 ? fabsf(t * 2 - 1) : 0;
    RGB back = mix(tubeBack, tubeBack2, backMix);
    float lam = fmaxf(0, cosf(asinf(clampf((yc - y) / yc, -1, 1)) - lightRad));
    RGB c;
    if (t < 0.33f) c = mix(mix(body, lo, 0.25f), body, t / 0.33f);
    else c = mix(body, lo, ((t - 0.33f) / 0.67f) * p.shadeDepth);
    if (p.lightPhys > 0) c = mix(c, mix(lo, body, 1 - p.shadeDepth * (1 - lam)), p.lightPhys);
    // Transparent liquid shows the per-row tube-back gradient. The highlight remains a surface
    // reflection and goes on after it.
    c = scale(c, br);
    c = mix(c, scale(back, p.brightness), p.liquidTransparency);
    if (y >= hiTop && y < hiTop + p.highlightH) {
      float k = powf(1 - fabsf((y - hiTop) / fmaxf(1, p.highlightH - 1) - 0.5f) * 2, p.highlightSharp);
      c = mix(c, liquidHiScaled, fminf(1, (0.35f + 0.65f * k) * p.highlightBright));
    }
    float gw = glassW(p, y, hiTop, lam);
    float glassWet = gw * (p.glassOverLiquid + (1 - p.glassOverLiquid) * p.liquidTransparency);
    pal.tubeBackRows[y] = q(scale(mix(back, ghi, gw), p.brightness));
    c = mix(c, glassHiScaled, glassWet);   // glass weight rises to the dry-side one with transparency
    pal.rows[y] = q(c);
    pal.bubbleIn[y] = q(mix(c, {0, 0, 0}, p.bubbleDark));
  }
  pal.body = q(scale(body, br));
  pal.tubeBack = q(scale(tubeBack, p.brightness));
  pal.bubbleRim = q(scale(hexToRgb(p.bubbleRim), br));
  float lmax = 1;
  for (int y = 0; y < H; y++) { pal.rowK[y] = luma(to888(pal.rows[y])); lmax = fmaxf(lmax, pal.rowK[y]); }
  for (int y = 0; y < H; y++) pal.rowK[y] /= lmax;
}


ScaledGlyph *Tube::scaledGlyphs(int sheetIdx, int bw, int bh, float brightness, uint32_t tintHex, float tintAmt, float tone) {
  if (sheetIdx < 0 || sheetIdx >= NUM_SPRITE_SHEETS) return nullptr;
  ScaledSet &S = set;
  if (!S.poolC || !S.poolA) return nullptr;
  if (S.sheet == sheetIdx && S.bw == bw && S.bh == bh && S.brightness == brightness && S.tint == tintHex && S.tintAmt == tintAmt && S.tone == tone) return S.g;
  const SpriteSheet &sp = *SPRITE_SHEETS[sheetIdx];
  RGB tint = hexToRgb(tintHex);
  auto tm = [&](float v, float ch) { return v * (1 - tintAmt) + v * (ch / 255.0f) * tintAmt; };
  float t = fmaxf(-1, fminf(1, tone));
  auto tn = [&](float v) { return t < 0 ? v * (1 + t) : v + (255 - v) * t; };
  float sy = (float)bh / sp.cellH;
  int used = 0;
  for (int d = 0; d < 10; d++) {
    int gw = (int)fmaxf(1, jround(sp.widths[d] * (float)bw / sp.cellW));
    float sx = (float)gw / sp.widths[d], cx0 = d * sp.cellW + (sp.cellW - sp.widths[d]) / 2.0f;
    if (used + gw * bh > GLYPH_POOL_PX) { S.g[d] = { 0, 0, S.poolC, S.poolA }; continue; }   // over budget: glyph dropped
    S.g[d].w = gw; S.g[d].h = bh;
    S.g[d].c = S.poolC + used; S.g[d].a = S.poolA + used; used += gw * bh;
    memset(S.g[d].c, 0, gw * bh * 2); memset(S.g[d].a, 0, gw * bh);
    for (int y = 0; y < bh; y++) for (int x = 0; x < gw; x++) {
      int X0 = (int)floorf(cx0 + x / sx), X1 = (int)fmaxf(X0 + 1, floorf(cx0 + (x + 1) / sx));
      int Y0 = (int)floorf(y / sy), Y1 = (int)fmaxf(Y0 + 1, floorf((y + 1) / sy));
      float r = 0, g = 0, b = 0, al = 0; int n = 0;
      for (int Y = Y0; Y < Y1; Y++) for (int X = X0; X < X1; X++) {
        if (X < 0 || X >= sp.w || Y < 0 || Y >= sp.h) { n++; continue; }
        const uint8_t *px4 = sp.rgba + ((size_t)Y * sp.w + X) * 4; float pa = px4[3];
        r += px4[0] * pa; g += px4[1] * pa; b += px4[2] * pa; al += pa; n++;
      }
      int k = y * gw + x;
      if (al > 0) {
        S.g[d].c[k] = q(scale({ tn(tm(r / al, tint.r)), tn(tm(g / al, tint.g)), tn(tm(b / al, tint.b)) }, brightness));
        S.g[d].a[k] = (uint8_t)jround(al / n);
      }
    }
  }
  S.sheet = sheetIdx; S.bw = bw; S.bh = bh; S.brightness = brightness; S.tint = tintHex; S.tintAmt = tintAmt; S.tone = tone;
  return S.g;
}


bool Tube::layoutLabels(int y0, const Params &p, uint32_t gen, int ticksN, float acrossTilt, float fill, Labels &lb) {
  bool minutes = ticksN == 60;
  int every = (int)fmaxf(1, jround(minutes ? p.digitMinuteStep : p.digitHourStep));
  // Motion-dependent parts of the layout, folded into the cache key.
  int bottomOff = p.digitsOnTop ? (int)jround(acrossTilt * p.topParallax) : 0;
  int start = (int)jround(minutes ? p.digitMinuteStart : p.digitHourStart); if (start <= 0) start = every;
  int first = start, last = ticksN - 1;
  if (minutes ? p.digitsLastOnlyM : p.digitsLastOnlyH) {
    float f = fill < 0 ? 0 : fill * ticksN; if (f > ticksN - 1e-3f) f = ticksN - 1e-3f;
    int s = minutes ? every : 1; first = last = (int)f / s * s;
    if (first == 0) first = 1;
  }
  if (lb.valid && lb.gen == gen && lb.H == H && lb.bottomOff == bottomOff && lb.first == first) return lb.have;
  lb.valid = true; lb.gen = gen; lb.H = H; lb.bottomOff = bottomOff; lb.first = first; lb.have = false;
  if (!p.digits) return false;
  float kx = minutes ? p.digitScaleXMin : p.digitScaleX, ky = minutes ? p.digitScaleYMin : p.digitScaleY;
  float bottom = (minutes ? p.digitBottomMin : p.digitBottom) + bottomOff;
  int idx = (int)jround(p.digitFont); bool useSprite = idx >= SPRITE_FONT;
  const Font *font = &FONTS[idx < 0 ? 0 : idx >= NUM_FONTS ? NUM_FONTS - 1 : idx];
  int bw = (int)fmaxf(1, jround((useSprite ? 5 : font->w) * kx));
  int bh = (int)fmaxf(1, jround((useSprite ? 7 : font->h) * ky));
  if (bh > 96) bh = 96;
  ScaledGlyph *sprite = useSprite ? scaledGlyphs(idx - SPRITE_FONT, bw, bh, p.brightness * p.digitBright, p.digitTint, p.digitTintAmount, p.digitTone) : nullptr;
  int gap = sprite ? (int)fmaxf(1, jround(bw / 5.0f)) : (int)fmaxf(1, jround(kx));
  int shadow = !sprite && p.digitShadow ? q(scale(hexToRgb(p.digitShadowColor), p.brightness * p.digitBright)) : -1;
  int yBase = y0 + H - 1 - (int)bottom, yTop = yBase - bh + 1;
  // NB: sim uses yBase = y0+H-1-bottom with fractional `bottom` possible; presets use integers.
  if (p.digitsOnTop) { markSourceRows(H, p.topLens, lb.sourceRows, p.lensCurve); memcpy(lb.drySourceRows, lb.sourceRows, sizeof(lb.sourceRows)); }
  else { markSourceRows(H, p.bottomLens, lb.sourceRows); markSourceRows(H, p.digitDryLens, lb.drySourceRows); }
  int sourceRy0 = yTop - y0, sourceRy1 = yBase - y0 + (shadow >= 0 ? 1 : 0);
  lb.ry0 = H; lb.ry1 = -1; lb.dryRy0 = H; lb.dryRy1 = -1;
  for (int ry = 0; ry < H; ry++) {
    if (lb.sourceRows[ry] >= sourceRy0 && lb.sourceRows[ry] <= sourceRy1) {
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
    for (int k = 0; k < l.len; k++) { l.adv[k] = sprite ? sprite[l.text[k] - '0'].w : bw; w += l.adv[k] + gap; }
    int x0 = (int)jround((float)i * L / ticksN - w / 2.0f);
    int m = (int)jround(p.cornerR);
    l.x0 = x0 < m ? m : x0 > L - w - m ? L - w - m : x0;
  }
  lb.bw = bw; lb.bh = bh; lb.yTop = yTop;
  lb.sprite = sprite; lb.font = font; lb.gap = gap; lb.shadow = shadow;
  digitRowColors(p, bh, lb.rows);
  lb.have = true;
  return true;
}

// Column by column so each column can take the wet or dry warp.
// Rows outer (glyph memory is row-major); each column still takes its own wet/dry warp. Every pixel is
// written at most once so the order is invisible in the output.
void Tube::drawSpriteGlyph(const ScaledGlyph &g, int x, int y0, const Labels &lb, const Wet &wet, const Mark &mark) const {
  int sourceTop = lb.yTop - y0;
  bool wcol[128]; int gw = g.w > 128 ? 128 : g.w;
  bool anyWet = false, anyDry = false;
  for (int dx = 0; dx < gw; dx++) { wcol[dx] = wet(x + dx); if (wcol[dx]) anyWet = true; else anyDry = true; }
  int a0 = H, a1 = -1;
  if (anyWet) { a0 = lb.ry0; a1 = lb.ry1; }
  if (anyDry) { if (lb.dryRy0 < a0) a0 = lb.dryRy0; if (lb.dryRy1 > a1) a1 = lb.dryRy1; }
  for (int ry = a0; ry <= a1; ry++) {
    int dyW = lb.sourceRows[ry] - sourceTop, dyD = lb.drySourceRows[ry] - sourceTop;
    bool okW = ry >= lb.ry0 && ry <= lb.ry1 && dyW >= 0 && dyW < g.h;
    bool okD = ry >= lb.dryRy0 && ry <= lb.dryRy1 && dyD >= 0 && dyD < g.h;
    if (!okW && !okD) continue;
    const uint8_t *aW = g.a + dyW * g.w, *aD = g.a + dyD * g.w;
    const uint16_t *cW = g.c + dyW * g.w, *cD = g.c + dyD * g.w;
    int y = y0 + ry;
    for (int dx = 0; dx < gw; dx++) {
      if (wcol[dx]) { if (!okW) continue; uint8_t a = aW[dx]; if (!a) continue; mark(x + dx, y, cW[dx], LUT_alphaT16[a]); }
      else          { if (!okD) continue; uint8_t a = aD[dx]; if (!a) continue; mark(x + dx, y, cD[dx], LUT_alphaT16[a]); }
    }
  }
}
void Tube::drawBitmapGlyph(const Font &f, int d, int x, int y0, const Labels &lb, const Wet &wet, const Mark &mark) const {
  const uint8_t *g = f.g[d];
  int msb = 1 << (f.w - 1);
  for (int pass = lb.shadow >= 0 ? 0 : 1; pass < 2; pass++) {
    int off = pass == 0 ? 1 : 0;
    int sourceTop = lb.yTop - y0 + off;
    for (int dx = 0; dx < lb.bw; dx++) {
      int col = (dx * f.w / lb.bw) < f.w - 1 ? dx * f.w / lb.bw : f.w - 1;
      bool w = wet(x + dx + off);
      const int16_t *rows = w ? lb.sourceRows : lb.drySourceRows; int a0 = w ? lb.ry0 : lb.dryRy0, a1 = w ? lb.ry1 : lb.dryRy1;
      for (int ry = a0; ry <= a1; ry++) {
        int dy = rows[ry] - sourceTop; if (dy < 0 || dy >= lb.bh) continue;
        int row = g[(dy * f.h / lb.bh) < f.h - 1 ? dy * f.h / lb.bh : f.h - 1];
        if (!(row & (msb >> col))) continue;
        mark(x + dx + off, y0 + ry, pass == 0 ? (uint16_t)lb.shadow : lb.rows[dy]);
      }
    }
  }
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
  int step = (int)fmaxf(1, jround(minutes ? p.tickStepM : p.tickStepH));
  int majorEvery = (int)fmaxf(0, jround(minutes ? p.tickMajorEveryM : p.tickMajorEveryH));
  int hMin = (int)fmaxf(0, jround(minutes ? p.tickMinorHeightM : p.tickMinorHeightH));
  int hMaj = (int)fmaxf(0, jround(minutes ? p.tickMajorHeightM : p.tickMajorHeightH));
  int wMin = (int)fmaxf(1, jround(minutes ? p.tickMinorWidthM : p.tickMinorWidthH));
  int wMaj = (int)fmaxf(1, jround(minutes ? p.tickMajorWidthM : p.tickMajorWidthH));
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
    float radius = fmaxf(1, (H - 1) / 2.0f), centre = (H - 1) / 2.0f;
    auto point = [&](int baseY, int &x, int &y) {
      float qy = (baseY - centre) / radius;
      float depth = sqrtf(fmaxf(0, 1 - qy * qy));
      x = x0 + (int)jround(dx * depth); y = baseY + (int)jround(dy * depth);
    };
    auto plot = [&](int x, int ry) {
      if (ry < 0 || ry >= H) return;
      if (emboss) { mark(x - 1, y0 + ry, c, embT, 1); mark(x + w, y0 + ry, c, embT, -1); }
      for (int k = 0; k < w; k++) mark(x + k, y0 + ry, c);
    };
    int px0, py0; point(outer, px0, py0); plot(px0, py0);
    if (outer == inner) return;
    for (int baseY = outer + dir;; baseY += dir) {
      int px1, py1; point(baseY, px1, py1);
      int n = abs(px1 - px0); if (abs(py1 - py0) > n) n = abs(py1 - py0); if (n < 1) n = 1;
      for (int j = 1; j <= n; j++) plot((int)jround(px0 + (float)(px1 - px0) * j / n), (int)jround(py0 + (float)(py1 - py0) * j / n));
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
void Tube::ensureFizz(const Params &p, float len, float agitation) {
  fizzLen = len;
  int want = (int)floorf(p.fizzCount * (len / L) * (1 + (agitation < 0.05f ? 0 : agitation))); if (want > MAX_FIZZ) want = MAX_FIZZ; if (want < 0) want = 0;
  while (fizzN < want) { fizz[fizzN++] = { frand() * len, frand() * H, 0.5f + frand() }; }
  fizzN = want;
}
// Rises against in-plane gravity at fizzSpeed px/s on both axes; face up = slow screen-up rise. See sim stepFizz.
void stepFizz(const Params &p, float dt, float along, float across, float agitation) {
  if (p.remaining) along = -along;   // fizz lives in the mirrored liquid frame (see drawTube)
  const float speed = p.fizzSpeed * (1 + 3 * agitation);
  const float up = sqrtf(fmaxf(0.0f, 1 - along * along - across * across));
  const float a = clampf(across * p.fizzAcrossGain, -1, 1);
  const float vy = -speed * ((1 - fabsf(a)) * up * p.fizzFlatRise + a);
  const float vx = -speed * clampf(along * p.fizzDriftGain, -1, 1);
  for (int i = 0; i < 2; i++) {
    Tube &t = tubes[i]; const float len = t.fizzLen; const int H = t.H;
    for (int k = 0; k < t.fizzN; k++) {
      Fizz &f = t.fizz[k];
      f.y += vy * f.v * dt;
      f.x += vx * f.v * dt;
      if (f.y < 3 || f.y >= H) { f.y = vy <= 0 ? H - 3 : 3; f.x = frand() * len; f.v = 0.5f + frand(); }
      else if (f.x < 0 || f.x > len) { f.x = vx < 0 ? len : 0; f.y = 3 + frand() * (H - 6); f.v = 0.5f + frand(); }
    }
  }
}

// Dest rows per source row under rendered lens + glass (topLens), times center-weighted fizzSquash. See sim lensMagRows.
inline float Tube::fizzSquashRow(const Params &p, int y) const {
  float d = (y + 0.5f - H / 2.0f) / (H / 2.0f);   // full fizzSquash at mid-height, ~1 at the edges
  return 1 + (p.fizzSquash - 1) * (1 - d * d);
}
void Tube::lensMagRows(const Params &p, float *rows) const {
  for (int y = 0; y < H; y++) rows[y] = fizzSquashRow(p, y);
  float lens = clampf(p.lens + p.topLens, -1, 1), curve = clampf(p.lensCurve, -3, 3);
  float signedCurve = lens < 0 ? -curve : curve, strength = fabsf(lens);
  if (strength == 0 || signedCurve == 0) return;
  float e = signedCurve > 0 ? 1 + signedCurve * 2 : 1 / (1 - signedCurve * 2);
  for (int y = 0; y < H; y++) rows[y] = 0;
  for (int yd = 0; yd < H; yd++) {
    float d = (yd + 0.5f - H / 2.0f) / (H / 2.0f), u = fmaxf(1e-3f, fabsf(d));
    float s = (d < 0 ? -1 : 1) * ((1 - strength) * u + strength * powf(u, e));
    int src = (int)clampf(floorf(H / 2.0f + s * H / 2.0f), 0, H - 1);
    rows[src] = clampf(1 / ((1 - strength) + strength * e * powf(u, e - 1)), 0.2f, 5);
  }
  float last = 0;
  for (int y = 0; y < H; y++) if (rows[y] > 0) { last = rows[y]; break; }
  for (int y = 0; y < H; y++) { if (rows[y] > 0) last = rows[y]; else rows[y] = last; rows[y] *= fizzSquashRow(p, y); }
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
  float climb = p.meniscusDepth * (1 - asymEff * d) * rc.rowClimbPow[ry];
  float bulge = p.meniscusTiltGain * tilt * fabsf(p.meniscusDepth) + cap;
  return climb - bulge * rc.rowBulge[ry];
}
// Caps of a column len px long may not exceed half of it in total (short slug = bead). See sim capScale.
static float capScale(float len, const Params &p, float tilt, float cap) {
  float feat = fabsf(p.meniscusDepth) * (1 + fabsf(p.meniscusTiltGain * tilt)) + fabsf(cap);
  return fminf(1, fmaxf(0, len) / 2 / fmaxf(1, feat));
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
  return xs + fminf(1, xs / 8) * (skew - k * edgeCap(ry, p, -tilt, side, -cap));
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
      rc.lensSrc[yd] = (int16_t)clampf(floorf(H / 2.0f + s * H / 2.0f), 0, H - 1);
    }
  }
  const float yc = (H - 1) / 2.0f;
  for (int ry = 0; ry < H; ry++) {
    int x0 = 0;
    if (p.cornerR > 0) {
      float r = fminf(p.cornerR, H / 2.0f), dy = fabsf(ry - yc);
      if (dy > yc - r) { float k = (dy - (yc - r)) / r; x0 = (int)jround(r - sqrtf(fmaxf(0, 1 - k * k)) * r); }
    }
    rc.capX0[ry] = x0;
    float d = lensRow((ry - yc) / yc, p), u = fabsf(d);
    rc.rowD[ry] = d; rc.rowClimbPow[ry] = powf(u, p.meniscusPow); rc.rowBulge[ry] = 1 - sqrtf(fmaxf(0, 1 - u * u));
  }
  rc.hiC = q(scale(hexToRgb(p.liquidHi), p.brightness * p.liquidBright));
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
  int n = glow ? (int)ceilf(p.edgeGlow) : (int)p.frontBright;
  if (n > EFFECT_MAX) return nullptr;
  if (T.valid && T.gen == gen && T.H == H && T.lightK == lightK) return T.c;
  T.valid = true; T.gen = gen; T.H = H; T.lightK = lightK;
  for (int ry = 0; ry < H; ry++) for (int k = 0; k < n; k++) {
    uint16_t *o = T.c + ry * EFFECT_MAX + k;
    if (glow) { float t = 1 - k / p.edgeGlow; *o = blend565(pal.tubeBackRows[ry], pal.rows[ry], fminf(1, t * t * p.glowStrength * lightK)); }
    else { float t = 1 - (k + 1) / p.frontBright; *o = (uint16_t)alphaT(fminf(1, t * t * 0.85f * lightK * pal.rowK[ry])); }
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
  float lightK = fmaxf(0.25f, 1 + p.edgeLightGain * s.edgeLight) * (1 + s.agitation);
  float lightKL = fmaxf(0.25f, 1 - p.edgeLightGain * s.edgeLight) * (1 + s.agitation);
  int xsI = (int)jround(xs);
  float capK = capScale(len, p, s.edgeLight, s.cap);
  float tanA = tanf(angle * (float)M_PI / 180);
  const bool hasLiquid = xe - xs >= 0.5f;   // an empty column draws nothing, not even an AA sliver
  ensureFizz(p, clampf(xe - xs - 6, 0, L), s.agitation);

  // 1 + 3: tube back and liquid column between the two edges (home edge on the end cap unless free)
  const int16_t *capX0 = rc.capX0;
  for (int ry = 0; ry < H; ry++) {
    float ex = edgeX(ry, xe, tanA, p, s.edgeLight, s.acrossTilt, s.cap, capK);
    float exL = p.freeLiquid ? edgeXL(ry, xs, tanA, p, s.edgeLight, s.acrossTilt, s.cap, capK) : 0;
    edges[ry] = ex; edgesL[ry] = exL;
    int x0 = capX0[ry];
    hspan(y0 + ry, 0, L, pal.tubeBackRows[ry]);
    if (!hasLiquid) continue;
    int xi = (int)floorf(ex); float frac = ex - xi;
    int xiL = (int)floorf(exL); float fracL = exL - xiL;
    int xa = x0 > xiL + 1 ? x0 : xiL + 1;
    hspan(y0 + ry, xa, xi, pal.rows[ry]);
    if (p.edgeSoft > 0) {
      int w = (int)fmaxf(1, jround(p.edgeSoft));
      for (int k = 0; k < w; k++) {
        float t = clampf((frac - k) + (w > 1 ? 0.5f : 0), 0, 1);
        if (xi + k >= x0) px(xi + k, y0 + ry, blend565(pal.tubeBackRows[ry], pal.rows[ry], t));
        float tL = clampf((1 - fracL - k) + (w > 1 ? 0.5f : 0), 0, 1);
        if (xiL - k >= x0 && xiL - k < xi) px(xiL - k, y0 + ry, blend565(pal.tubeBackRows[ry], pal.rows[ry], tL));
      }
    } else {
      if (frac >= 0.5f) px(xi, y0 + ry, pal.rows[ry]);
      if (fracL < 0.5f && xiL >= x0) px(xiL, y0 + ry, pal.rows[ry]);
    }
  }

  // 3a: front brightening, weighted by row luma
  if (hasLiquid && p.frontBright > 0) {
    const uint16_t hiC = rc.hiC;
    const uint16_t *fT = nullptr, *fTL = nullptr; const bool tab = false;
    for (int ry = 0; ry < H; ry++) {
      int xi = (int)floorf(edges[ry]); float rowK = pal.rowK[ry];
      int xiL = (int)floorf(edgesL[ry]);
      for (int k = 1; k <= p.frontBright; k++) {
        int x = xi - k; if (x < 0) break;
        if (x >= L) continue;
        int T; if (tab) T = fT[ry * EFFECT_MAX + k - 1]; else { float t = 1 - k / p.frontBright; T = alphaT(fminf(1, t * t * 0.85f * lightK * rowK)); }
        px(x, y0 + ry, blend565T(rd(x, y0 + ry), hiC, T));
      }
      if (!p.freeLiquid) continue;
      for (int k = 1; k <= p.frontBright; k++) {   // home edge: lit by the opposite tilt
        int x = xiL + k; if (x >= xi - p.frontBright) break;
        if (x < 0 || x >= L) continue;
        int T; if (tab) T = fTL[ry * EFFECT_MAX + k - 1]; else { float t = 1 - k / p.frontBright; T = alphaT(fminf(1, t * t * 0.85f * lightKL * rowK)); }
        px(x, y0 + ry, blend565T(rd(x, y0 + ry), hiC, T));
      }
    }
  }

  // 3b: edge glow
  int softW = p.edgeSoft > 0 ? (int)jround(p.edgeSoft) : 0;
  if (hasLiquid && p.edgeGlow > 0 && p.glowStrength > 0) {
    const uint16_t *gT = effectTable(glowT[0], p, pal, gen, lightK, true);
    const uint16_t *gTL = p.freeLiquid ? effectTable(glowT[1], p, pal, gen, lightKL, true) : nullptr;
    const bool tab = gT && (!p.freeLiquid || gTL);
    for (int ry = 0; ry < H; ry++) {
      int xg = (int)ceilf(edges[ry] + softW), xgL = (int)floorf(edgesL[ry]) - softW;
      for (int k = 0; k < p.edgeGlow; k++) {
        int xr = xg + k, xl = xgL - k;
        if (xr < L) {
          uint16_t c; if (tab) c = gT[ry * EFFECT_MAX + k]; else { float t = 1 - k / p.edgeGlow; c = blend565(pal.tubeBackRows[ry], pal.rows[ry], fminf(1, t * t * p.glowStrength * lightK)); }
          px(xr, y0 + ry, c);
        }
        if (p.freeLiquid && xl >= capX0[ry]) {
          uint16_t c; if (tab) c = gTL[ry * EFFECT_MAX + k]; else { float t = 1 - k / p.edgeGlow; c = blend565(pal.tubeBackRows[ry], pal.rows[ry], fminf(1, t * t * p.glowStrength * lightKL)); }
          px(xl, y0 + ry, c);
        }
      }
    }
  }

  // 3c: wet film left by a receding edge (see sim step 3c)
  if (hasLiquid && p.wetFilm > 0 && (s.filmFree > 0.02f || (p.freeLiquid && s.filmHome > 0.02f))) {
    const float yc = (H - 1) / 2.0f;
    for (int ry = 0; ry < H; ry++) {
      float d = (ry - yc) / yc, rowW = 0.4f + 0.6f * d * d;
      int nR = (int)jround(p.wetFilm * s.filmFree), nL = p.freeLiquid ? (int)jround(p.wetFilm * s.filmHome) : 0;
      int xg = (int)ceilf(edges[ry] + softW), xgL = (int)floorf(edgesL[ry]) - softW;
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
      int xl = (int)fmaxf(0, floorf(edgesL[ry]));   // home edge (0 unless the liquid is free)
      for (int x = (int)floorf(ex - p.highlightInset); x < (int)floorf(ex); x++) {
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

  // Panel-frame column bounds for the mark compositor (liquid where lo <= x < hi).
  Edges bounds = p.remaining ? Edges{boundLo, boundHi} : Edges{edgesL, edges};
  if (p.remaining) {
    for (int ry = 0; ry < H; ry++) {
      uint16_t *row = FB + ry * PANEL_W;
      for (int a = 0, b = L - 1; a < b; a++, b--) { uint16_t t = row[a]; row[a] = row[b]; row[b] = t; }
      boundLo[ry] = L - edges[ry]; boundHi[ry] = L - edgesL[ry];
    }
  }

  // Scale marks, all before bubbles.
  bool haveLabels = layoutLabels(y0, p, gen, ticksN, st.acrossTilt, st.fillTarget, labels);
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
      Mark digitMark(*this, y0, bounds, p, onTop, p.markContrast * p.digitBright);
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
    const float r = p.fizzSize / 2;
    for (int k = 0; k < fizzN; k++) {
      const Fizz &f = fizz[k];
      int fy = (int)clampf(jround(f.y), 0, H - 1);
      if (f.x + xs < edgesL[fy] + 2 || f.x + xs >= edges[fy] - 2) continue;   // render-frame edges
      const float m = mag[fy], ry = r / m;
      for (int iy = (int)floorf(f.y - ry - 1); iy <= (int)ceilf(f.y + ry); iy++) {
        if (iy < 0 || iy >= H) continue;
        for (int ix = (int)floorf(f.x - r - 1); ix <= (int)ceilf(f.x + r); ix++) {
          float dx = ix + 0.5f - f.x, dy = (iy + 0.5f - f.y) * m;
          float d = sqrtf(dx * dx + dy * dy), cov = fminf(1, r + 0.5f - d);
          if (cov <= 0) continue;
          pxa(mapX(ix + xsI), y0 + iy, r >= 1.5f && d < r - 1 ? pal.bubbleIn[fy] : pal.bubbleRim, cov);
        }
      }
    }
  }

  // 6: bubble
  if (p.bubble) {
    float bx = xe - p.bubbleGap - s.edgeLight * p.bubbleTiltGain, by = (H - 1) * p.bubbleY - (H - 1) / 2.0f * s.acrossTilt * p.bubbleRollGain;
    float rx = p.bubbleW / 2, ry_ = p.bubbleH / 2;
    if (bx - rx > xs + 2) {
      for (int yy = (int)floorf(by - ry_); yy <= (int)ceilf(by + ry_); yy++) {
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
  t.FB = strip; t.H = lay.H; t.baseY = idx == 0 ? lay.yH : lay.yM;
  t.buildRowCache(p, gen);
  Palette &pal = t.pal;
  if (!(pal.valid && pal.gen == gen && pal.H == t.H && pal.light == s.light)) {
    t.buildPalette(p, s.light, pal);
    pal.valid = true; pal.gen = gen; pal.H = t.H; pal.light = s.light;
  }
  t.drawTube(t.baseY, s, p, gen, idx == 0 ? 12 : 60);
}
