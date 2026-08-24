// Nordic UART Service bridge: same line protocol as USB serial. `out` fans Serial output out to
// the connected central too (notifications chunked at MTU-3, flushed on '\n').
#pragma once
#include <Arduino.h>

void ble_init(const char *name);
/** Bytes received from the central, queued for loop(); -1 when empty. */
int ble_read();

class DualOut : public Print {
 public:
  using Print::write;
  size_t write(uint8_t c) override;
  size_t write(const uint8_t *buf, size_t n) override;
  int available() { return Serial.available(); }
  int read() { return Serial.read(); }
  operator bool() { return (bool)Serial; }
};
extern DualOut out;
