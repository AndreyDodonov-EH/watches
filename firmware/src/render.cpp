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
static inline float luma(RGB c) { return 0.299f * c.r + 0.587f * c.g + 0.114f * c.b; }

TubeLayout tubeLayout(const Params &p) {
  int H = (int)jround(p.tubeHeight); H = H < 4 ? 4 : H > TUBE_HEIGHT_MAX ? TUBE_HEIGHT_MAX : H;
  auto y = [&](float v) { int r = (int)jround(v); return r < 0 ? 0 : r > PANEL_H - H ? PANEL_H - H : r; };
  return { H, y(p.hoursY), y(p.minutesY) };
}

// The current tube is drawn into an H x PANEL_W strip buffer (H ≤ TUBE_HEIGHT_MAX); panel-row y maps
// to strip row y - baseY. Anything outside the strip is clipped (the sim never draws there either).
static uint16_t *FB = nullptr;
static int baseY = 0, H = TUBE_HEIGHT_PX;
static const int L = TUBE_LENGTH_PX;

static inline bool inStrip(int x, int y) { return x >= 0 && x < PANEL_W && y >= baseY && y < baseY + H; }
static inline uint16_t rd(int x, int y) { return __builtin_bswap16(FB[(y - baseY) * PANEL_W + x]); }
static inline void wr(int x, int y, uint16_t c) { FB[(y - baseY) * PANEL_W + x] = __builtin_bswap16(c); }
static void hspan(int y, int x0, int x1, uint16_t c) {
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
static inline void px(int x, int y, uint16_t c) { if (inStrip(x, y)) wr(x, y, c); }
static inline void pxa(int x, int y, uint16_t c, float t) {
  if (!inStrip(x, y)) return;
  wr(x, y, t >= 1 ? c : blend565(rd(x, y), c, t));
}

// ---------------------------------------------------------------------------------------------
// palette
// ---------------------------------------------------------------------------------------------
struct Palette { uint16_t rows[TUBE_HEIGHT_MAX]; uint16_t bubbleIn[TUBE_HEIGHT_MAX]; uint16_t tubeBackRows[TUBE_HEIGHT_MAX]; uint16_t body, tubeBack, bubbleRim; };

// Glass wall shading weight 0..1 per row (sim: glassW): ambient cylinder shade, specular tent on the
// top wall, faint band on the lower wall, brighter outermost rows.
static float glassW(const Params &p, int y, int hiTop, float lam) {
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
static int highlightTop(const Params &p, float lightDeg) {
  float yc = (H - 1) / 2.0f;
  return (int)jround(yc - yc * sinf(lightDeg * (float)M_PI / 180) - (p.highlightH - 1) / 2);
}

// Style top light blended (lightPhys) with a Lambert cylinder lit from 2*light (sim buildPalette).
static void buildPalette(const Params &p, float lightDeg, Palette &pal) {
  RGB body = hexToRgb(p.liquid), hi = hexToRgb(p.liquidHi), lo = hexToRgb(p.liquidLo);
  RGB tubeBack = hexToRgb(p.tubeBack), ghi = hexToRgb(p.glassHi);
  float br = p.brightness * p.liquidBright;
  float yc = (H - 1) / 2.0f, lightRad = 2 * lightDeg * (float)M_PI / 180;
  int hiTop = highlightTop(p, lightDeg);
  for (int y = 0; y < H; y++) {
    float t = (float)y / (H - 1);
    float lam = fmaxf(0, cosf(asinf(clampf((yc - y) / yc, -1, 1)) - lightRad));
    RGB c;
    if (t < 0.33f) c = mix(mix(body, lo, 0.25f), body, t / 0.33f);
    else c = mix(body, lo, ((t - 0.33f) / 0.67f) * p.shadeDepth);
    if (p.lightPhys > 0) c = mix(c, mix(lo, body, 1 - p.shadeDepth * (1 - lam)), p.lightPhys);
    if (y >= hiTop && y < hiTop + p.highlightH) {
      float k = powf(1 - fabsf((y - hiTop) / fmaxf(1, p.highlightH - 1) - 0.5f) * 2, p.highlightSharp);
      c = mix(c, hi, fminf(1, (0.35f + 0.65f * k) * p.highlightBright));
    }
    float gw = glassW(p, y, hiTop, lam);
    pal.tubeBackRows[y] = q(scale(mix(tubeBack, ghi, gw), p.brightness));
    c = mix(c, ghi, gw * p.glassOverLiquid);
    pal.rows[y] = q(scale(c, br));
    pal.bubbleIn[y] = q(scale(mix(c, {0, 0, 0}, p.bubbleDark), br));
  }
  pal.body = q(scale(body, br));
  pal.tubeBack = q(scale(tubeBack, p.brightness));
  pal.bubbleRim = q(scale(hexToRgb(p.bubbleRim), br));
}

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
struct ScaledGlyph { int w, h; uint16_t *c; uint8_t *a; };
struct ScaledSet {
  int sheet = -1, bw = 0, bh = 0; float brightness = -1, tintAmt = -1, tone = 0; uint32_t tint = 0;
  ScaledGlyph g[10] = {};
};
static ScaledSet scaledSets[2];   // 0 = hours, 1 = minutes

static ScaledGlyph *scaledGlyphs(int slot, int sheetIdx, int bw, int bh, float brightness, uint32_t tintHex, float tintAmt, float tone) {
  if (sheetIdx < 0 || sheetIdx >= NUM_SPRITE_SHEETS) return nullptr;
  ScaledSet &S = scaledSets[slot];
  if (S.sheet == sheetIdx && S.bw == bw && S.bh == bh && S.brightness == brightness && S.tint == tintHex && S.tintAmt == tintAmt && S.tone == tone) return S.g;
  const SpriteSheet &sp = *SPRITE_SHEETS[sheetIdx];
  RGB tint = hexToRgb(tintHex);
  auto tm = [&](float v, float ch) { return v * (1 - tintAmt) + v * (ch / 255.0f) * tintAmt; };
  float t = fmaxf(-1, fminf(1, tone));
  auto tn = [&](float v) { return t < 0 ? v * (1 + t) : v + (255 - v) * t; };
  float sy = (float)bh / sp.cellH;
  for (int d = 0; d < 10; d++) {
    int gw = (int)fmaxf(1, jround(sp.widths[d] * (float)bw / sp.cellW));
    float sx = (float)gw / sp.widths[d], cx0 = d * sp.cellW + (sp.cellW - sp.widths[d]) / 2.0f;
    free(S.g[d].c); free(S.g[d].a);
    S.g[d].w = gw; S.g[d].h = bh;
    S.g[d].c = (uint16_t *)heap_caps_calloc(gw * bh, 2, MALLOC_CAP_SPIRAM);
    S.g[d].a = (uint8_t *)heap_caps_calloc(gw * bh, 1, MALLOC_CAP_SPIRAM);
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

// ---------------------------------------------------------------------------------------------
// marks (ticks + labels) seen through the liquid
// ---------------------------------------------------------------------------------------------
// Integer version of the sim's throughLiquid (luma in 1/1000 units, blend fractions in 1/256).
static uint16_t throughLiquid(uint16_t bg, uint16_t mark, const Params &p, float contrast) {
  int Br, Bg, Bb, Mr, Mg, Mb;
  expand565(bg, Br, Bg, Bb); expand565(mark, Mr, Mg, Mb);
  int T = (int)(p.liquidTransparency * 256 + 0.5f); if (T < 0) T = 0; if (T > 256) T = 256;
  int cr = Br + (((Mr - Br) * T + 128) >> 8), cg = Bg + (((Mg - Bg) * T + 128) >> 8), cb = Bb + (((Mb - Bb) * T + 128) >> 8);
  int lb = 299 * Br + 587 * Bg + 114 * Bb, lc = 299 * cr + 587 * cg + 114 * cb, d = lc - lb;
  int C = (int)(contrast * 1000 + 0.5f);
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
struct Mark {
  int y0; const float *edges; const Params *p; bool onTop; float contrast;
  void operator()(int x, int y, uint16_t c, float cov = 1, int rel = 0) const {
    int ry = y - y0;
    bool inside = p->remaining ? x >= edges[ry] : x < edges[ry];
    if (!onTop && inStrip(x, y) && inside)
      c = throughLiquid(rd(x, y), c, *p, contrast);
    if (rel > 0) c = q(mix(to888(c), {255, 255, 255}, 0.7f));
    else if (rel < 0) c = q(scale(to888(c), 0.25f));
    pxa(x, y, c, cov);
  }
};

struct Label { int x0; char text[3]; int len; int adv[2]; };
struct Labels {
  Label list[12]; int n; int bw, bh, ry0, ry1, yTop; ScaledGlyph *sprite; const Font *font; int gap;
  uint16_t rows[96]; int16_t sourceRows[TUBE_HEIGHT_MAX]; int shadow;
};

static void markSourceRows(int height, float lens, int16_t *out) {
  float k = clampf(lens, 0, 1);
  for (int yd = 0; yd < height; yd++) {
    float d = (yd + 0.5f - height / 2.0f) / (height / 2.0f), u = fabsf(d);
    float s = (d < 0 ? -1 : 1) * ((1 - k) * u + k * u * u * u);
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

static bool layoutLabels(int slot, int y0, const Params &p, int ticksN, Labels &lb) {
  if (!p.digits) return false;
  bool minutes = ticksN == 60;
  int every = (int)fmaxf(1, jround(minutes ? p.digitMinuteStep : p.digitHourStep));
  float kx = minutes ? p.digitScaleXMin : p.digitScaleX, ky = minutes ? p.digitScaleYMin : p.digitScaleY;
  float bottom = minutes ? p.digitBottomMin : p.digitBottom;
  int idx = (int)jround(p.digitFont); bool useSprite = idx >= SPRITE_FONT;
  const Font *font = &FONTS[idx < 0 ? 0 : idx >= NUM_FONTS ? NUM_FONTS - 1 : idx];
  int bw = (int)fmaxf(1, jround((useSprite ? 5 : font->w) * kx));
  int bh = (int)fmaxf(1, jround((useSprite ? 7 : font->h) * ky));
  if (bh > 96) bh = 96;
  ScaledGlyph *sprite = useSprite ? scaledGlyphs(slot, idx - SPRITE_FONT, bw, bh, p.brightness * p.digitBright, p.digitTint, p.digitTintAmount, p.digitTone) : nullptr;
  int gap = sprite ? (int)fmaxf(1, jround(bw / 5.0f)) : (int)fmaxf(1, jround(kx));
  int shadow = !sprite && p.digitShadow ? q(scale(hexToRgb(p.digitShadowColor), p.brightness * p.digitBright)) : -1;
  int yBase = y0 + H - 1 - (int)bottom, yTop = yBase - bh + 1;
  // NB: sim uses yBase = y0+H-1-bottom with fractional `bottom` possible; presets use integers.
  markSourceRows(H, p.digitsOnTop ? 0 : p.bottomLens, lb.sourceRows);
  int sourceRy0 = yTop - y0, sourceRy1 = yBase - y0 + (shadow >= 0 ? 1 : 0);
  lb.ry0 = H; lb.ry1 = -1;
  for (int ry = 0; ry < H; ry++) if (lb.sourceRows[ry] >= sourceRy0 && lb.sourceRows[ry] <= sourceRy1) {
    if (ry < lb.ry0) lb.ry0 = ry;
    if (ry > lb.ry1) lb.ry1 = ry;
  }
  lb.n = 0;
  for (int i = every; i < ticksN && lb.n < 12; i += every) {
    Label &l = lb.list[lb.n++];
    if (minutes && p.digitsLeadingZero) { l.text[0] = '0' + i / 10; l.text[1] = '0' + i % 10; l.len = 2; }
    else if (i >= 10) { l.text[0] = '0' + i / 10; l.text[1] = '0' + i % 10; l.len = 2; }
    else { l.text[0] = '0' + i; l.len = 1; }
    int w = -gap;
    for (int k = 0; k < l.len; k++) { l.adv[k] = sprite ? sprite[l.text[k] - '0'].w : bw; w += l.adv[k] + gap; }
    l.x0 = (int)jround((float)i * L / ticksN - w / 2.0f);
  }
  lb.bw = bw; lb.bh = bh; lb.yTop = yTop;
  lb.sprite = sprite; lb.font = font; lb.gap = gap; lb.shadow = shadow;
  digitRowColors(p, bh, lb.rows);
  return true;
}

static void drawSpriteGlyph(const ScaledGlyph &g, int x, int y0, const Labels &lb, const Mark &mark) {
  int sourceTop = lb.yTop - y0;
  for (int ry = lb.ry0; ry <= lb.ry1; ry++) {
    int dy = lb.sourceRows[ry] - sourceTop; if (dy < 0 || dy >= g.h) continue;
    for (int dx = 0; dx < g.w; dx++) {
      uint8_t a = g.a[dy * g.w + dx]; if (!a) continue;
      mark(x + dx, y0 + ry, g.c[dy * g.w + dx], a / 255.0f);
    }
  }
}
static void drawBitmapGlyph(const Font &f, int d, int x, int y0, const Labels &lb, const Mark &mark) {
  const uint8_t *g = f.g[d];
  int msb = 1 << (f.w - 1);
  for (int pass = lb.shadow >= 0 ? 0 : 1; pass < 2; pass++) {
    int off = pass == 0 ? 1 : 0;
    int sourceTop = lb.yTop - y0 + off;
    for (int ry = lb.ry0; ry <= lb.ry1; ry++) {
      int dy = lb.sourceRows[ry] - sourceTop; if (dy < 0 || dy >= lb.bh) continue;
      int row = g[(dy * f.h / lb.bh) < f.h - 1 ? dy * f.h / lb.bh : f.h - 1];
      for (int dx = 0; dx < lb.bw; dx++) {
        int col = (dx * f.w / lb.bw) < f.w - 1 ? dx * f.w / lb.bw : f.w - 1;
        if (!(row & (msb >> col))) continue;
        mark(x + dx + off, y0 + ry, pass == 0 ? (uint16_t)lb.shadow : lb.rows[dy]);
      }
    }
  }
}
static void drawLabels(int y0, const Labels &lb, const Mark &mark) {
  for (int i = 0; i < lb.n; i++) {
    const Label &l = lb.list[i]; int x = l.x0;
    for (int k = 0; k < l.len; k++) {
      int d = l.text[k] - '0';
      if (lb.sprite) drawSpriteGlyph(lb.sprite[d], x, y0, lb, mark);
      else drawBitmapGlyph(*lb.font, d, x, y0, lb, mark);
      x += l.adv[k] + lb.gap;
    }
  }
}

static void drawTicks(int y0, const Params &p, int ticksN, const int16_t *sourceRows, const Mark &mark,
                      float dx = 0, float dy = 0) {
  bool minutes = ticksN == 60;
  if (!(minutes ? p.ticksM : p.ticksH)) return;
  int step = (int)fmaxf(1, jround(minutes ? p.tickStepM : p.tickStepH));
  int majorEvery = (int)fmaxf(0, jround(minutes ? p.tickMajorEveryM : p.tickMajorEveryH));
  int hMin = (int)fmaxf(0, jround(minutes ? p.tickMinorHeightM : p.tickMinorHeightH));
  int hMaj = (int)fmaxf(0, jround(minutes ? p.tickMajorHeightM : p.tickMajorHeightH));
  int wMaj = (int)fmaxf(1, jround(minutes ? p.tickMajorWidthM : p.tickMajorWidthH));
  float br = p.brightness * p.tickBright;
  uint16_t cMin = q(scale(hexToRgb(minutes ? p.tickColorM : p.tickColorH), br));
  uint16_t cMaj = q(scale(hexToRgb(minutes ? p.tickMajorColorM : p.tickMajorColorH), br));
  int pos = (int)jround(minutes ? p.tickPosM : p.tickPosH);
  auto warpedRange = [&](int sourceA, int sourceB, int &a, int &b) {
    a = H; b = -1;
    for (int ry = 0; ry < H; ry++) if (sourceRows[ry] >= sourceA && sourceRows[ry] <= sourceB) {
      if (ry < a) a = ry;
      if (ry > b) b = ry;
    }
  };
  float emboss = clampf(p.tickEmboss, 0, 1);
  auto drawSegment = [&](int x0, int w, uint16_t c, int rangeA, int rangeB, bool top) {
    if (rangeB < 0) return;
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
      if (emboss > 0) { mark(x - 1, y0 + ry, c, emboss, 1); mark(x + w, y0 + ry, c, emboss, -1); }
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
  for (int i = step; i < ticksN; i += step) {
    int xc = (int)jround((float)i * L / ticksN);
    bool major = majorEvery > 0 && i % majorEvery == 0;
    int h = major ? hMaj : hMin; if (h <= 0) continue;
    int w = major ? wMaj : 1, x0 = xc - ((w - 1) >> 1); uint16_t c = major ? cMaj : cMin;
    int topA, topB, botA, botB;
    warpedRange(0, h - 1, topA, topB); warpedRange(H - h, H - 1, botA, botB);
    if (pos != 1) drawSegment(x0, w, c, topA, topB, true);
    if (pos != 0) drawSegment(x0, w, c, botA, botB, false);
  }
}

// ---------------------------------------------------------------------------------------------
// fizz
// ---------------------------------------------------------------------------------------------
#define MAX_FIZZ 64
struct Fizz { float x, y, v; };
static Fizz fizz[2][MAX_FIZZ];
static int fizzN[2] = {0, 0};
static inline float frand() { return (esp_random() >> 8) / 16777216.0f; }
static void ensureFizz(int i, const Params &p, float fill, float agitation) {
  int want = (int)floorf(p.fizzCount * fill * (1 + (agitation < 0.05f ? 0 : agitation))); if (want > MAX_FIZZ) want = MAX_FIZZ; if (want < 0) want = 0;
  while (fizzN[i] < want) { fizz[i][fizzN[i]++] = { frand(), frand() * H, 0.5f + frand() }; }
  fizzN[i] = want;
}
void stepFizz(const Params &p, float dt, float along, float across, float agitation) {
  if (p.remaining) along = -along;   // fizz lives in the mirrored liquid frame (see drawTube)
  const float speed = p.fizzSpeed * (1 + 3 * agitation);
  const float up = sqrtf(fmaxf(0.0f, 1 - along * along - across * across));
  const float a = clampf(across * p.fizzAcrossGain, -1, 1);
  const float rise = (1 - fabsf(a)) * up * p.fizzFlatRise + a;   // screen-up; across + = top edge up
  const float vx = (-along * p.fizzDriftGain * speed) / L;
  for (int i = 0; i < 2; i++) for (int k = 0; k < fizzN[i]; k++) {
    Fizz &f = fizz[i][k];
    f.y -= speed * f.v * rise * dt;
    f.x += vx * f.v * dt;
    if (f.y < 3 || f.y >= H) { f.y = rise >= 0 ? H - 3 : 3; f.x = frand(); f.v = 0.5f + frand(); }
    else if (f.x < 0 || f.x > 1) { f.x = vx < 0 ? 1 : 0; f.y = 3 + frand() * (H - 6); f.v = 0.5f + frand(); }
  }
}

// ---------------------------------------------------------------------------------------------
// tube
// ---------------------------------------------------------------------------------------------
// tilt = along follower (edgeLight), side = across follower (acrossTilt); see sim edgeX.
static float edgeX(int ry, float xe, float angleDeg, const Params &p, float tilt, float side) {
  const float yc = (H - 1) / 2.0f;
  float d = (ry - yc) / yc;
  float skew = tanf(angleDeg * (float)M_PI / 180) * (ry - yc);
  float asymEff = p.meniscusAsym * side * clampf(1 - tilt, 0, 1.5f);
  float depth = p.meniscusDepth * (1 + p.meniscusTiltGain * tilt) * (1 - asymEff * d);
  return xe + skew + depth * powf(fabsf(d), p.meniscusPow);
}

static void applyLens(const Params &p) {
  float lens = clampf(p.lens, 0, 1), curve = clampf(p.lensCurve, 0.3f, 3);
  if (lens <= 0) return;
  auto sourceRow = [&](int yd) {
    float d = (yd + 0.5f - H / 2.0f) / (H / 2.0f), u = fabsf(d);
    float s = (d < 0 ? -1 : 1) * ((1 - lens) * u + lens * powf(u, 1 + curve * 2));
    return (int)clampf(floorf(H / 2.0f + s * H / 2.0f), 0, H - 1);
  };
  for (int yd = 0; yd < H / 2; yd++) {
    int sy = sourceRow(yd);
    if (sy != yd) memcpy(FB + (size_t)yd * PANEL_W, FB + (size_t)sy * PANEL_W, PANEL_W * 2);
  }
  for (int yd = H - 1; yd >= H / 2; yd--) {
    int sy = sourceRow(yd);
    if (sy != yd) memcpy(FB + (size_t)yd * PANEL_W, FB + (size_t)sy * PANEL_W, PANEL_W * 2);
  }
}

// `remaining`: liquid at the right end, draining. Its base is rendered in a mirrored frame, then
// flipped before panel-coordinate marks and bubbles are composited.
static void drawTube(int idx, int y0, const TubeState &st, const Params &p, const Palette &pal, int ticksN) {
  TubeState s = st;
  if (p.remaining) { s.fillPos = -st.fillPos; s.edgeLight = -st.edgeLight; }
  float angle = s.angle;
  float xe = (p.remaining ? 1 - s.fillTarget : s.fillTarget) * L + s.fillPos;
  float lightK = fmaxf(0.25f, 1 + p.edgeLightGain * s.edgeLight) * (1 + s.agitation);
  ensureFizz(idx, p, clampf(xe / L, 0, 1), s.agitation);

  // 1 + 3: tube back and liquid column
  static float edges[TUBE_HEIGHT_MAX];
  for (int ry = 0; ry < H; ry++) {
    float ex = edgeX(ry, xe, angle, p, s.edgeLight, s.acrossTilt);
    edges[ry] = ex;
    int x0 = 0;
    if (p.cornerR > 0) {
      float r = fminf(p.cornerR, H / 2.0f), yc = (H - 1) / 2.0f, dy = fabsf(ry - yc);
      if (dy > yc - r) { float k = (dy - (yc - r)) / r; x0 = (int)jround(r - sqrtf(fmaxf(0, 1 - k * k)) * r); }
    }
    int xi = (int)floorf(ex); float frac = ex - xi;
    if (x0 > 0) hspan(y0 + ry, 0, x0, pal.tubeBackRows[ry]);
    hspan(y0 + ry, x0 > xi ? x0 : xi, L, pal.tubeBackRows[ry]);
    hspan(y0 + ry, x0, xi, pal.rows[ry]);
    if (p.edgeSoft > 0) {
      int w = (int)fmaxf(1, jround(p.edgeSoft));
      for (int k = 0; k < w; k++) {
        float t = clampf((frac - k) + (w > 1 ? 0.5f : 0), 0, 1);
        if (xi + k >= x0) px(xi + k, y0 + ry, blend565(pal.tubeBackRows[ry], pal.rows[ry], t));
      }
    } else if (frac >= 0.5f) px(xi, y0 + ry, pal.rows[ry]);
  }

  // 3a: front brightening, weighted by row luma
  if (p.frontBright > 0) {
    uint16_t hiC = q(scale(hexToRgb(p.liquidHi), p.brightness * p.liquidBright));
    float w[TUBE_HEIGHT_MAX]; float lmax = 1;
    for (int ry = 0; ry < H; ry++) { w[ry] = luma(to888(pal.rows[ry])); lmax = fmaxf(lmax, w[ry]); }
    for (int ry = 0; ry < H; ry++) {
      int xi = (int)floorf(edges[ry]); float rowK = w[ry] / lmax;
      for (int k = 1; k <= p.frontBright; k++) {
        int x = xi - k; if (x < 0) break;
        float t = 1 - k / p.frontBright;
        px(x, y0 + ry, blend565(pal.rows[ry], hiC, fminf(1, t * t * 0.85f * lightK * rowK)));
      }
    }
  }

  // 3b: edge glow
  if (p.edgeGlow > 0 && p.glowStrength > 0) {
    for (int ry = 0; ry < H; ry++) {
      int xs = (int)ceilf(edges[ry] + (p.edgeSoft > 0 ? jround(p.edgeSoft) : 0));
      for (int k = 0; k < p.edgeGlow; k++) {
        float t = 1 - k / p.edgeGlow;
        uint16_t c = blend565(pal.tubeBackRows[ry], pal.rows[ry], fminf(1, t * t * p.glowStrength * lightK));
        if (xs + k < L) px(xs + k, y0 + ry, c);
      }
    }
  }

  // 4: highlight inset
  if (p.highlightInset > 0) {
    int hiTop = highlightTop(p, s.light);
    for (int ry = hiTop; ry < hiTop + p.highlightH && ry < H; ry++) {
      if (ry < 0) continue;
      float ex = edges[ry];
      int bi = hiTop + (int)p.highlightH + 1; if (bi > H - 1) bi = H - 1;
      uint16_t bodyRow = pal.rows[bi];
      for (int x = (int)floorf(ex - p.highlightInset); x < (int)floorf(ex); x++) {
        if (x < 0) continue;
        float t = (x - (ex - p.highlightInset)) / p.highlightInset;
        px(x, y0 + ry, blend565(pal.rows[ry], bodyRow, t));
      }
      for (int x = 0; x < p.highlightInset && x < ex; x++) {
        float t = 1 - x / p.highlightInset;
        px(x, y0 + ry, blend565(pal.rows[ry], bodyRow, t));
      }
    }
  }

  if (p.remaining) {
    for (int ry = 0; ry < H; ry++) {
      uint16_t *row = FB + ry * PANEL_W;
      for (int a = 0, b = L - 1; a < b; a++, b--) { uint16_t t = row[a]; row[a] = row[b]; row[b] = t; }
      edges[ry] = L - edges[ry];
    }
  }

  // Rear marks are composited through the liquid, before bubbles.
  static Labels labels;
  bool haveLabels = layoutLabels(idx, y0, p, ticksN, labels);
  auto drawTickLayer = [&](bool onTop) {
    if (p.ticksOnTop == onTop) {
      int16_t rows[TUBE_HEIGHT_MAX];
      markSourceRows(H, p.tickLens, rows);
      Mark tickMark { y0, edges, &p, onTop, p.markContrast * p.tickBright };
      float dx = onTop ? 0 : -st.edgeLight * p.tickParallax;
      float dy = onTop ? 0 : st.acrossTilt * p.tickParallax;
      drawTicks(y0, p, ticksN, rows, tickMark, dx, dy);
    }
  };
  auto drawDigitLayer = [&](bool onTop) {
    if (haveLabels && p.digitsOnTop == onTop) {
      Mark digitMark { y0, edges, &p, onTop, p.markContrast * p.digitBright };
      drawLabels(y0, labels, digitMark);
    }
  };
  drawTickLayer(false);
  drawDigitLayer(false);
  auto mapX = [&](int x) { return p.remaining ? L - 1 - x : x; };
  auto span = [&](int y, int xa, int xb, uint16_t c) {
    if (p.remaining) hspan(y, L - 1 - xb, L - xa, c);
    else hspan(y, xa, xb + 1, c);
  };

  // 5: fizz
  if (p.fizz) for (int k = 0; k < fizzN[idx]; k++) {
    const Fizz &f = fizz[idx][k];
    int fx = (int)jround(f.x * (xe - 6)), fy = (int)jround(f.y);
    if (fy < 0 || fy >= H) continue;
    if (fx < 2 || fx >= edgeX(fy, xe, angle, p, s.edgeLight, s.acrossTilt) - 2) continue;
    int sz = (int)p.fizzSize;
    for (int dy = 0; dy < sz; dy++) for (int dx = 0; dx < sz; dx++) {
      bool inner = sz >= 3 && dx > 0 && dy > 0 && dx < sz - 1 && dy < sz - 1;
      px(mapX(fx + dx), y0 + fy + dy, inner ? pal.bubbleIn[fy] : pal.bubbleRim);
    }
  }

  // 6: bubble
  if (p.bubble) {
    float bx = xe - p.bubbleGap - s.edgeLight * p.bubbleTiltGain, by = (H - 1) * p.bubbleY - (H - 1) / 2.0f * s.acrossTilt * p.bubbleRollGain;
    float rx = p.bubbleW / 2, ry_ = p.bubbleH / 2;
    if (bx - rx > 2) {
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


void renderTube(int idx, const TubeState &s, const Params &p, uint16_t *strip) {
  static Palette pal;
  TubeLayout lay = tubeLayout(p);
  FB = strip; H = lay.H; baseY = idx == 0 ? lay.yH : lay.yM;
  buildPalette(p, s.light, pal);
  drawTube(idx, baseY, s, p, pal, idx == 0 ? 12 : 60);
}
