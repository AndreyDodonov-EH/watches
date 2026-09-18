// Small native harness for the physical firmware renderer.
// It has fixed-size storage and no Arduino or heap dependency.
#include "../src/physical/render.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace {
constexpr int W = 536;
constexpr int MAX_H = 80;
constexpr int PANEL_H = 240;
constexpr int CANARY = 0xA55A;
static uint16_t stripH[W * MAX_H + 16];
static uint16_t stripM[W * MAX_H + 16];
static uint16_t before[W * MAX_H];
static uint16_t after[W * MAX_H];

bool parseNumber(const char *text, float &out) {
  char *end = nullptr;
  out = std::strtof(text, &end);
  return end != text && *end == '\0' && std::isfinite(out);
}

bool setField(physical::Params &params, const char *name, float value) {
  for (std::size_t i = 0; i < physical::FIELD_COUNT; ++i) {
    const physical::Field &field = physical::FIELDS[i];
    if (std::strcmp(name, field.name) == 0) {
      params.*(field.member) = value;
      return true;
    }
  }
  return false;
}

bool canariesIntact(const uint16_t *buffer, int height) {
  for (int i = 0; i < 8; ++i) if (buffer[i] != CANARY) return false;
  for (int i = 8 + W * height; i < W * MAX_H + 16; ++i) if (buffer[i] != CANARY) return false;
  return true;
}

bool cacheAndCanaryCheck() {
  physical::Params p = physical::defaults();
  if (!physical::validate(p) || !physical::init()) return false;
  const int h = physical::layout(p).H;
  std::fill_n(stripH, W * MAX_H + 16, (uint16_t)CANARY);
  std::fill_n(stripM, W * MAX_H + 16, (uint16_t)CANARY);
  physical::renderTube(0, 0.43f, p, 1, stripH + 8);
  physical::renderTube(1, 0.57f, p, 1, stripM + 8);
  if (!canariesIntact(stripH, h) || !canariesIntact(stripM, h)) return false;
  std::memcpy(before, stripH + 8, sizeof(before));
  physical::renderTube(0, 0.43f, p, 1, stripH + 8);
  if (std::memcmp(before, stripH + 8, sizeof(before)) != 0) return false;
  p.exposure = 3.0f;
  if (!physical::validate(p)) return false;
  physical::renderTube(0, 0.43f, p, 2, stripH + 8);
  std::memcpy(after, stripH + 8, sizeof(after));
  return std::memcmp(before, after, sizeof(before)) != 0 && canariesIntact(stripH, h);
}

int frame(const physical::Params &params, float fillH, float fillM) {
  if (!physical::validate(params)) {
    std::fprintf(stderr, "invalid physical parameters\n");
    return 2;
  }
  if (!physical::init()) {
    std::fprintf(stderr, "physical renderer init failed\n");
    return 2;
  }
  const int h = physical::layout(params).H;
  static uint16_t outputH[W * MAX_H];
  static uint16_t outputM[W * MAX_H];
  physical::renderTube(0, fillH, params, 1, outputH);
  physical::renderTube(1, fillM, params, 1, outputM);
  if (std::fwrite(outputH, sizeof(uint16_t), W * h, stdout) != (std::size_t)(W * h)) return 3;
  if (std::fwrite(outputM, sizeof(uint16_t), W * h, stdout) != (std::size_t)(W * h)) return 3;
  return 0;
}
} // namespace

int main(int argc, char **argv) {
  if (argc == 2 && std::strcmp(argv[1], "--self-test") == 0) {
    if (!cacheAndCanaryCheck()) {
      std::fprintf(stderr, "physical cache/canary check failed\n");
      return 1;
    }
    std::puts("physical native cache/canary: ok");
    return 0;
  }
  physical::Params params = physical::defaults();
  float fillH = 0.43f, fillM = 0.57f;
  const bool layoutOnly = argc > 1 && std::strcmp(argv[1], "--layout") == 0;
  const int firstArgument = layoutOnly ? 2 : 1;
  for (int i = firstArgument; i < argc; ++i) {
    const char *equals = std::strchr(argv[i], '=');
    if (!equals) {
      std::fprintf(stderr, "expected name=value, got %s\n", argv[i]);
      return 2;
    }
    const std::size_t nameLength = (std::size_t)(equals - argv[i]);
    if (nameLength == 0 || nameLength >= 64) return 2;
    char name[64];
    std::memcpy(name, argv[i], nameLength);
    name[nameLength] = '\0';
    float value = 0;
    if (!parseNumber(equals + 1, value)) return 2;
    if (std::strcmp(name, "hoursFill") == 0) fillH = value;
    else if (std::strcmp(name, "minutesFill") == 0) fillM = value;
    else if (!setField(params, name, value)) {
      std::fprintf(stderr, "unknown physical field %s\n", name);
      return 2;
    }
  }
  if (layoutOnly) {
    if (!physical::validate(params)) return 2;
    std::printf("%d\n", physical::layout(params).H);
    return 0;
  }
  return frame(params, fillH, fillM);
}
