// Liquid Watch — Phase 1 bring-up firmware.
// Serial commands (115200, USB CDC):
//   h  hello / orientation test      c  calibration face (two tube rectangles)
//   f  fps benchmark (full-frame)    i  toggle IMU stream (50 Hz CSV)
//   b<n> brightness 0..255           r  reboot
#include <Arduino.h>
#include <Adafruit_GFX.h>
#include "esp_heap_caps.h"
#include "layout.h"
#include "display.h"
#include "imu.h"

#ifndef BOOT_MODE
#define BOOT_MODE 'c'   // default boot face: calibration (handoff: keep available forever)
#endif

// GFXcanvas16 with the pixel buffer in PSRAM
class PsramCanvas : public Adafruit_GFX {
 public:
  uint16_t *buf;
  PsramCanvas(int w, int h) : Adafruit_GFX(w, h) {
    buf = (uint16_t *)heap_caps_malloc((size_t)w * h * 2, MALLOC_CAP_SPIRAM);
  }
  void drawPixel(int16_t x, int16_t y, uint16_t c) override {
    if (x < 0 || y < 0 || x >= _width || y >= _height) return;
    buf[(size_t)y * _width + x] = c;
  }
  void fillScreen(uint16_t c) override {
    uint32_t cc = (uint32_t)c | ((uint32_t)c << 16);
    uint32_t *p = (uint32_t *)buf;
    for (size_t i = 0; i < (size_t)_width * _height / 2; i++) p[i] = cc;
  }
  void fillRect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t c) override {
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > _width) w = _width - x;
    if (y + h > _height) h = _height - y;
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

static void face_hello() {
  fb.fillScreen(0);
  fb.drawRect(0, 0, PANEL_W, PANEL_H, 0xFFFF);
  fb.setTextColor(0xFFFF); fb.setTextSize(4);
  fb.setCursor(120, 90); fb.print("hello liquid");
  fb.setTextSize(2);
  fb.setCursor(8, 8);   fb.print("<- LEFT (USB-C here?)");
  fb.setCursor(8, 216); fb.print("bottom-left");
  fb.setCursor(400, 216); fb.print("bottom-right");
  // color swatches
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
  // centre lines for alignment
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
  // tube strips only (dirty-rect estimate)
  t0 = millis();
  for (int i = 0; i < N; i++) {
    display_push_rows(fb.buf, HOURS_TUBE_Y, HOURS_TUBE_Y + TUBE_HEIGHT_PX);
    display_push_rows(fb.buf, MINUTES_TUBE_Y, MINUTES_TUBE_Y + TUBE_HEIGHT_PX);
  }
  dt = millis() - t0;
  Serial.printf("fps: two-strips-only %.1f fps\n", N * 1000.0f / dt);
}

static void show(char m) {
  mode = m;
  switch (m) {
    case 'h': face_hello(); break;
    case 'c': face_calibration(); break;
    case 'f': bench_fps(); face_calibration(); mode = 'c'; break;
  }
}

void setup() {
  Serial.begin(115200);
  uint32_t t = millis();
  while (!Serial && millis() - t < 2500) delay(10);
  Serial.printf("\nliquid-watch bring-up | cpu %lu MHz | psram %u KB | heap %u KB\n",
                getCpuFrequencyMhz(), ESP.getPsramSize() / 1024, ESP.getFreeHeap() / 1024);
  if (!fb.buf) { Serial.println("FATAL: framebuffer alloc failed"); }
  if (!display_init()) Serial.println("display init FAILED");
  have_imu = imu_init();
  Serial.printf("imu: %s\n", have_imu ? "ok" : "NOT FOUND");
  show(BOOT_MODE);
  Serial.println("ready. cmds: h c f i b<0-255> r");
}

void loop() {
  if (Serial.available()) {
    char c = Serial.read();
    switch (c) {
      case 'h': case 'c': case 'f': show(c); break;
      case 'i': imu_stream = !imu_stream; Serial.printf("imu stream %s\n", imu_stream ? "on (t_ms,ax,ay,az,gx,gy,gz)" : "off"); break;
      case 'b': { int v = Serial.parseInt(); display_set_brightness(constrain(v, 0, 255)); Serial.printf("brightness %d\n", v); break; }
      case 'r': ESP.restart(); break;
      default: break;
    }
  }
  static uint32_t next = 0;
  if (imu_stream && have_imu && millis() >= next) {
    next += 20;  // 50 Hz
    if (next < millis()) next = millis() + 20;
    ImuSample s;
    if (imu_read(s))
      Serial.printf("%lu,%.3f,%.3f,%.3f,%.1f,%.1f,%.1f\n", millis(), s.ax, s.ay, s.az, s.gx, s.gy, s.gz);
  }
  delay(1);
}
