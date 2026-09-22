#!/usr/bin/env python3
"""Check the firmware's packed blends against scalar RGB888 interpolation.

Uses the actual traceFillRow and shared blend source; requires native C++, no board.
Run: python3 firmware/tools/check_residue.py
"""
from pathlib import Path
import os
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]


def function(source, name):
    start = source.rfind('\n', 0, source.index(name + '(')) + 1
    brace = source.index('{', start)
    depth = 1
    end = brace + 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end]


HARNESS = r'''
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <algorithm>
__HELPERS__

static uint16_t reference(uint16_t bg, uint16_t fg, int t) {
  if (t <= 0) return bg;
  if (t >= 256) return fg;
  int out[3];
  const int shift[3] = {11, 5, 0}, bits[3] = {5, 6, 5};
  for (int i = 0; i < 3; ++i) {
    int mask = (1 << bits[i]) - 1;
    int a = (bg >> shift[i]) & mask, b = (fg >> shift[i]) & mask;
    a = (a << (8 - bits[i])) | (a >> (2 * bits[i] - 8));
    b = (b << (8 - bits[i])) | (b >> (2 * bits[i] - 8));
    out[i] = (a * (256 - t) + b * t + 128) / 256;
  }
  return (uint16_t)(((out[0] & 248) << 8) | ((out[1] & 252) << 3) | (out[2] >> 3));
}
static void check(uint16_t gotBE, uint16_t bg, uint16_t fg, int t) {
  uint16_t want = reference(bg, fg, t);
  if (blend565T(bg, fg, t) != want || blend565(bg, fg, t * (1.0f / 256)) != want) {
    std::fprintf(stderr, "shared blend: bg=%04x fg=%04x alpha=%d want=%04x\n", bg, fg, t, want);
    std::exit(1);
  }
  if (__builtin_bswap16(gotBE) != want) {
    std::fprintf(stderr, "bg=%04x fg=%04x alpha=%d got=%04x want=%04x\n",
                 bg, fg, t, __builtin_bswap16(gotBE), want);
    std::exit(1);
  }
}
int main() {
  uint16_t row[259], alpha[259];
  for (int i = 0; i < 259; ++i) alpha[i] = (uint16_t)(i ? i - 1 : 0);
  // Every RGB565 colour in both roles, every fractional alpha, and opposing packed
  // lanes (including borrows from red into blue). Guard both ends of each span.
  const uint16_t anchors[] = {0, 0xffff, 0xf800, 0x07e0, 0x001f, 0x07ff, 0xf81f, 0xffe0};
  uint64_t count = 0;
  for (uint16_t anchor : anchors) for (unsigned c = 0; c < 65536; ++c) {
    for (int reverse = 0; reverse < 2; ++reverse) {
      uint16_t bg = reverse ? anchor : c, fg = reverse ? c : anchor;
      std::fill_n(row, 259, __builtin_bswap16(bg));
      traceFillRow(row, alpha, 1, 258, 256, fg);
      check(row[0], bg, fg, 0); check(row[258], bg, fg, 0);
      for (int i = 1; i < 258; ++i) check(row[i], bg, fg, i - 1);
      count += 257;
    }
  }
  // Full uint16 alpha headroom, all row weights, and nontrivial foregrounds/backgrounds.
  for (int weight = 0; weight <= 256; ++weight) {
    for (unsigned a = 0; a < 65536; ++a) {
      uint16_t bg = (uint16_t)(a * 40503u), fg = (uint16_t)(a * 17389u + weight * 97u);
      row[0] = __builtin_bswap16(bg); alpha[0] = a;
      traceFillRow(row, alpha, 0, 1, weight, fg);
      check(row[0], bg, fg, (a * weight) >> 8);
      ++count;
    }
  }
  row[0] = 0xa55a;
  traceFillRow(row, alpha, 0, 0, 256, 0xffff);
  if (row[0] != 0xa55a) return 1;
  check(__builtin_bswap16((uint16_t)0x1234), 0x1234, 0xabcd, -1);
  std::printf("shared and residue blends: %llu scalar cases passed; span guards intact\n",
              (unsigned long long)count);
}
'''


def main():
    source = (ROOT / 'firmware/src/render.cpp').read_text()
    helpers = '\n'.join(function(source, name) for name in ('expand565', 'blend565T', 'blend565', 'traceFillRow'))
    with tempfile.TemporaryDirectory(prefix='watches-residue-') as tmp:
        cpp, exe = Path(tmp) / 'check.cpp', Path(tmp) / 'check'
        cpp.write_text(HARNESS.replace('__HELPERS__', helpers))
        subprocess.run([os.environ.get('CXX', 'c++'), '-std=c++17', '-O2', '-Wall', '-Wextra',
                        '-fsanitize=undefined', str(cpp), '-o', str(exe)], check=True)
        subprocess.run([str(exe)], check=True)


if __name__ == '__main__':
    main()
