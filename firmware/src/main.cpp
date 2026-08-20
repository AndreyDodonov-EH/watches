// Liquid Watch firmware — liquid face (port of the sim) + Phase 1 bring-up faces.
// Serial commands (115200, USB CDC):
//   l  liquid face (default)          c  calibration face        h  hello / orientation test
//   f  fps benchmark                  i  toggle IMU stream (50 Hz CSV)
//   t HH:MM[:SS]  set clock           d<N>  demo time speed ×N (d1 = real time, d0 = freeze)
//   p<name>=<value>  set a param (e.g. p liquid=#39ff14, p fizz=0, p meniscusDepth=-10)
//   p?  dump params as JSON           p!  reset params to the built-in preset
//   b<n> brightness 0..255            r  reboot
#include <Arduino.h>
#include <Adafruit_GFX.h>
#include <sys/time.h>
#include "esp_heap_caps.h"
#include "layout.h"
#include "display.h"
#include "imu.h"
#include "physics.h"
#include "render.h"
#include "gen/params_gen.h"

#ifndef BOOT_MODE
#define BOOT_MODE 'l'
#endif

// GFXcanvas16 with the pixel buffer in PSRAM. Pixels are stored byte-swapped (panel is
// big-endian RGB565) so the display push is a straight memcpy; callers use normal RGB565.
class PsramCanvas : public Adafruit_GFX {
 public:
  uint16_t *buf;
  PsramCanvas(int w, int h) : Adafruit_GFX(w, h) {
    buf = (uint16_t *)heap_caps_malloc((size_t)w * h * 2, MALLOC_CAP_SPIRAM);
  }
  void drawPixel(int16_t x, int16_t y, uint16_t c) override {
    if (x < 0 || y < 0 || x >= _width || y >= _height) return;
    buf[(size_t)y * _width + x] = __builtin_bswap16(c);
  }
  void fillScreen(uint16_t c) override {
    c = __builtin_bswap16(c);
    uint32_t cc = (uint32_t)c | ((uint32_t)c << 16);
    uint32_t *p = (uint32_t *)buf;
    for (size_t i = 0; i < (size_t)_width * _height / 2; i++) p[i] = cc;
  }
  void fillRect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t c) override {
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > _width) w = _width - x;
    if (y + h > _height) h = _height - y;
    c = __builtin_bswap16(c);
    for (int yy = y; yy < y + h; yy++) {
      uint16_t *row = buf + (size_t)yy * _width + x;
      for (int xx = 0; xx < w; xx++) row[xx] = c;
    }
  }
};

static PsramCanvas fb(PANEL_W, PANEL_H);
static char mode = BOOT_MODE;
static bool imu_stream = false;
static bool have_imu = false;

// ---- liquid face state ----
static Params params = PRESET_DEFAULT;
static TubeState tubeH, tubeM;
static GravityNorm gnorm;
static ImuFilter imuFilter;
static TiltInput rawTilt = {0, 0, 0, 0};
static float demoSpeed = 1;          // time multiplier (d<N>)
static double clockSec = 10 * 3600 + 9 * 60 + 30;  // seconds since midnight (until `t` sets it)
static uint32_t lastPhysUs = 0, frames = 0, fpsT0 = 0;
static float fps = 0;
// Tube strips (owned by display.cpp, internal DMA RAM): the panel DMA reads them directly while the
// other tube renders.
static uint16_t *strip[2] = {nullptr, nullptr};

static void renderBoth() {
  renderTube(0, tubeH, params, strip[0]);
  display_wait_all();                       // previous frame's minutes strip must be done before hours goes out
  display_push_strip_async(strip[0], HOURS_TUBE_Y, TUBE_HEIGHT_PX);
  renderTube(1, tubeM, params, strip[1]);
  display_wait_all();
  display_push_strip_async(strip[1], MINUTES_TUBE_Y, TUBE_HEIGHT_PX);
}

static void face_hello() {
  fb.fillScreen(0);
  fb.drawRect(0, 0, PANEL_W, PANEL_H, 0xFFFF);
  fb.setTextColor(0xFFFF); fb.setTextSize(4);
  fb.setCursor(120, 90); fb.print("hello liquid");
  fb.setTextSize(2);
  fb.setCursor(8, 8);   fb.print("<- LEFT (USB-C here?)");
  fb.setCursor(8, 216); fb.print("bottom-left");
  fb.setCursor(400, 216); fb.print("bottom-right");
  fb.fillRect(20, 150, 60, 40, 0xF800);
  fb.fillRect(90, 150, 60, 40, 0x07E0);
  fb.fillRect(160, 150, 60, 40, 0x001F);
  fb.fillRect(230, 150, 60, 40, LIQUID_RGB565);
  fb.fillRect(300, 150, 60, 40, LIQUID_HI_RGB565);
  display_push_frame(fb.buf);
}

static void face_calibration() {
  fb.fillScreen(0);
  fb.fillRect(0, HOURS_TUBE_Y,   TUBE_LENGTH_PX, TUBE_HEIGHT_PX, LIQUID_RGB565);
  fb.fillRect(0, MINUTES_TUBE_Y, TUBE_LENGTH_PX, TUBE_HEIGHT_PX, LIQUID_RGB565);
  fb.drawFastHLine(0, HOURS_TUBE_Y + TUBE_HEIGHT_PX / 2,   PANEL_W, 0xFFFF);
  fb.drawFastHLine(0, MINUTES_TUBE_Y + TUBE_HEIGHT_PX / 2, PANEL_W, 0xFFFF);
  fb.drawFastVLine(PANEL_W / 2, HOURS_TUBE_Y, TUBE_HEIGHT_PX, 0xFFFF);
  fb.drawFastVLine(PANEL_W / 2, MINUTES_TUBE_Y, TUBE_HEIGHT_PX, 0xFFFF);
  display_push_frame(fb.buf);
}

static void bench_fps() {
  Serial.println("fps: full-frame 536x240 RGB565, 60 frames...");
  uint32_t t0 = millis();
  const int N = 60;
  for (int i = 0; i < N; i++) {
    fb.fillScreen(0);
    int x = (i * 9) % (PANEL_W - 40);
    fb.fillRect(x, HOURS_TUBE_Y, 40, TUBE_HEIGHT_PX, LIQUID_RGB565);
    fb.fillRect(PANEL_W - 40 - x, MINUTES_TUBE_Y, 40, TUBE_HEIGHT_PX, LIQUID_RGB565);
    display_push_frame(fb.buf);
  }
  uint32_t dt = millis() - t0;
  Serial.printf("fps: %d frames in %lu ms = %.1f fps (render+push)\n", N, dt, N * 1000.0f / dt);
  t0 = millis();
  for (int i = 0; i < N; i++) display_push_frame(fb.buf);
  dt = millis() - t0;
  Serial.printf("fps: push-only %.1f fps\n", N * 1000.0f / dt);
  t0 = millis();
  for (int i = 0; i < N; i++) { renderTube(0, tubeH, params, strip[0]); renderTube(1, tubeM, params, strip[1]); }
  dt = millis() - t0;
  Serial.printf("fps: liquid render-only %.1f fps\n", N * 1000.0f / dt);
  t0 = millis();
  for (int i = 0; i < N; i++) renderBoth();
  display_wait_all();
  dt = millis() - t0;
  Serial.printf("fps: liquid render+async push %.1f fps\n", N * 1000.0f / dt);
}

// ---- liquid face ----
static void liquid_start() {
  fb.fillScreen(0);
  display_push_frame(fb.buf);
  display_set_brightness(255);   // params.brightness is applied in the render LUTs
  lastPhysUs = micros(); frames = 0; fpsT0 = millis();
}

static void liquid_tick() {
  // physics at 50 Hz, catch up if a render took longer than one step
  uint32_t now = micros();
  int steps = 0;
  while ((int32_t)(now - lastPhysUs) >= (int32_t)(1000000 / PHYS_HZ) && steps < 5) {
    lastPhysUs += 1000000 / PHYS_HZ; steps++;
    clockSec += PHYS_DT * demoSpeed;
    if (clockSec >= 86400) clockSec -= 86400;
    if (clockSec < 0) clockSec += 86400;
    TiltInput in = have_imu ? imuFilter.step(rawTilt, params) : TiltInput{0, 0, 0, 0};
    double m = fmod(clockSec / 60.0, 60.0), h = fmod(clockSec / 3600.0, 12.0);
    tubeH.fillTarget = (float)(h / 12.0);
    tubeM.fillTarget = (float)(m / 60.0);
    stepTube(tubeH, in, params);
    stepTube(tubeM, in, params);
    stepFizz(params, PHYS_DT);
  }
  renderBoth();
  frames++;
  if (millis() - fpsT0 >= 2000) { fps = frames * 1000.0f / (millis() - fpsT0); frames = 0; fpsT0 = millis(); }
}

static void imu_poll() {
  if (!have_imu) return;
  ImuSample s;
  if (!imu_read(s)) return;
  float a[3] = {s.ax, s.ay, s.az}, g[3] = {s.gx, s.gy, s.gz};
  float n = gnorm.update(sqrtf(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]));
  rawTilt.along = IMU_ALONG_TUBE_SIGN * a[IMU_AXIS_ALONG_TUBE] / n;
  rawTilt.across = IMU_ACROSS_TUBE_SIGN * a[IMU_AXIS_ACROSS_TUBE] / n;
  rawTilt.gyroAlong = g[IMU_AXIS_ALONG_TUBE];
  rawTilt.gyroAcross = g[IMU_AXIS_ACROSS_TUBE];
  static uint32_t next = 0;
  if (imu_stream && millis() >= next) {
    next = millis() + 20;
    Serial.printf("%lu,%.3f,%.3f,%.3f,%.1f,%.1f,%.1f\n", millis(), s.ax, s.ay, s.az, s.gx, s.gy, s.gz);
  }
}

// ---- param access by name (serial now; GATT / Wi-Fi later reuse this) ----
static const ParamField *findField(const char *name) {
  for (int i = 0; i < PARAMS_NUM_FIELDS; i++) if (!strcmp(PARAM_FIELDS[i].name, name)) return &PARAM_FIELDS[i];
  return nullptr;
}
static bool setParam(const char *name, const char *val) {
  const ParamField *f = findField(name); if (!f) return false;
  uint8_t *p = (uint8_t *)&params + f->off;
  switch (f->type) {
    case 'f': *(float *)p = atof(val); break;
    case 'i': *(int *)p = atoi(val); break;
    case 'b': *(bool *)p = !(val[0] == '0' || val[0] == 'f' || val[0] == 'F' || val[0] == 'n'); break;
    case 'c': *(uint32_t *)p = strtoul(val[0] == '#' ? val + 1 : val, nullptr, 16); break;
  }
  return true;
}
static void dumpParams() {
  Serial.print("{");
  for (int i = 0; i < PARAMS_NUM_FIELDS; i++) {
    const ParamField &f = PARAM_FIELDS[i]; const uint8_t *p = (const uint8_t *)&params + f.off;
    Serial.printf("%s\"%s\":", i ? "," : "", f.name);
    switch (f.type) {
      case 'f': Serial.printf("%g", *(const float *)p); break;
      case 'i': Serial.printf("%d", *(const int *)p); break;
      case 'b': Serial.print(*(const bool *)p ? "true" : "false"); break;
      case 'c': Serial.printf("\"#%06lx\"", (unsigned long)*(const uint32_t *)p); break;
    }
  }
  Serial.println("}");
}

static void show(char m) {
  display_wait_all();
  mode = m;
  switch (m) {
    case 'h': face_hello(); break;
    case 'c': face_calibration(); break;
    case 'l': liquid_start(); break;
    case 'f': bench_fps(); liquid_start(); mode = 'l'; break;
  }
}

static void handleLine(char *line) {
  while (*line == ' ') line++;
  char c = line[0]; char *arg = line + 1; while (*arg == ' ') arg++;
  switch (c) {
    case 'h': case 'c': case 'f': case 'l': show(c); break;
    case 'i': imu_stream = !imu_stream; Serial.printf("imu stream %s\n", imu_stream ? "on (t_ms,ax,ay,az,gx,gy,gz)" : "off"); break;
    case 'b': { int v = atoi(arg); display_set_brightness(constrain(v, 0, 255)); Serial.printf("brightness %d\n", v); break; }
    case 't': { int hh = 0, mm = 0, ss = 0; if (sscanf(arg, "%d:%d:%d", &hh, &mm, &ss) >= 2) { clockSec = hh * 3600 + mm * 60 + ss; Serial.printf("time %02d:%02d:%02d\n", hh, mm, ss); } else Serial.println("usage: t HH:MM[:SS]"); break; }
    case 'd': demoSpeed = atof(arg); Serial.printf("demo speed x%g\n", demoSpeed); break;
    case 'p': {
      if (arg[0] == '?') dumpParams();
      else if (arg[0] == '!') { params = PRESET_DEFAULT; Serial.println("params reset"); }
      else { char *eq = strchr(arg, '='); if (!eq) { Serial.println("usage: p<name>=<value> | p? | p!"); break; }
        *eq = 0; Serial.println(setParam(arg, eq + 1) ? "ok" : "unknown param"); }
      break; }
    case 'x': {  // dump state + both strips (hex) for offline comparison with the sim
      display_wait_all();
      renderTube(0, tubeH, params, strip[0]); renderTube(1, tubeM, params, strip[1]);
      Serial.printf("STATE %.6f %.6f %.6f %.6f %.6f %.6f %.6f %.6f %.6f %.6f\n",
                    tubeH.fillTarget, tubeH.fillPos, tubeH.angle, tubeH.acrossShift, tubeH.edgeLight,
                    tubeM.fillTarget, tubeM.fillPos, tubeM.angle, tubeM.acrossShift, tubeM.edgeLight);
      static char hex[PANEL_W * 4 + 2];
      for (int t = 0; t < 2; t++) for (int y = 0; y < TUBE_HEIGHT_PX; y++) {
        const uint16_t *row = strip[t] + y * PANEL_W; char *o = hex;
        for (int x = 0; x < PANEL_W; x++) { uint16_t c = __builtin_bswap16(row[x]); o += sprintf(o, "%04x", c); }
        *o++ = '\n'; *o = 0; Serial.write(hex);
      }
      Serial.println("END");
      break; }
    case 's': Serial.printf("mode %c fps %.1f clock %02d:%02d:%02d along %.3f across %.3f gyro %.1f fillH %.3f fillM %.3f heap %u\n",
                 mode, fps, (int)clockSec / 3600, ((int)clockSec / 60) % 60, (int)clockSec % 60,
                 rawTilt.along, rawTilt.across, rawTilt.gyroAcross, tubeH.fillTarget, tubeM.fillTarget, ESP.getFreeHeap()); break;
    case 'r': ESP.restart(); break;
    case '?': Serial.println("cmds: l c h f i s b<0-255> t HH:MM d<N> p<name>=<v> p? p! r"); break;
    default: break;
  }
}

void setup() {
  Serial.begin(115200);
  uint32_t t = millis();
  while (!Serial && millis() - t < 2500) delay(10);
  Serial.printf("\nliquid-watch | cpu %lu MHz | psram %u KB | heap %u KB\n",
                getCpuFrequencyMhz(), ESP.getPsramSize() / 1024, ESP.getFreeHeap() / 1024);
  if (!fb.buf) { Serial.println("FATAL: framebuffer alloc failed"); }
  if (!display_init()) Serial.println("display init FAILED");
  strip[0] = display_strip(0); strip[1] = display_strip(1);
  have_imu = imu_init();
  Serial.printf("imu: %s\n", have_imu ? "ok" : "NOT FOUND");
  show(BOOT_MODE);
  Serial.println("ready. ? for commands");
}

void loop() {
  static char line[96]; static int n = 0;
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') { Serial.println(); if (n) { line[n] = 0; handleLine(line); n = 0; } }
    else if (c == 8 || c == 127) { if (n) { n--; Serial.print("\b \b"); } }   // backspace
    else if (c >= 32 && n < (int)sizeof(line) - 1) { line[n++] = c; Serial.write(c); }  // echo
  }
  imu_poll();
  if (mode == 'l') liquid_tick(); else delay(1);
}
