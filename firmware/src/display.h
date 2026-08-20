#pragma once
#include <stdint.h>
#include <stdbool.h>

// RM67162 AMOLED 536x240 over QSPI, via Waveshare's esp_lcd_sh8601 driver
// (same command set; init sequence taken verbatim from Waveshare demo).
bool display_init(void);
// Push a full 536x240 RGB565 frame (buffer may live in PSRAM). Blocking.
void display_push_frame(const uint16_t *fb);
// Push a horizontal band [y0, y1) of a full-width framebuffer. y0/y1 must be even.
void display_push_rows(const uint16_t *fb, int y0, int y1);
void display_set_brightness(uint8_t v);   // 0..255 (cmd 0x51)
