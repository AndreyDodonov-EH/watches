#!/usr/bin/env python3
"""Compare complete firmware strips against a saved reference render.cpp (native C++).

Usage: python3 firmware/tools/check_render_frames.py --reference /tmp/render-before.cpp
Host-only ESP stubs; no board, firmware allocation changes, or checked-in golden images.
"""
from pathlib import Path
import argparse
import os
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SCENES = 4000
FRAME_BYTES = 536 * 80 * 2

HARNESS = r'''
#include <cstdio>
#include <cstdlib>
#include "render.h"
static uint16_t strip[536*80], trace[536];
static uint32_t rng=721;
static float randf() { rng=rng*1664525u+1013904223u; return (rng>>8)*(1.0f/16777216.0f); }
int main() {
  if (!render_init()) return 1;
  for(int i=0;i<4000;i++) {
    Params p=PRESET_DEFAULT;
    p.fizz=i%3 != 0; p.bubble=i%5 == 0; p.digitFont=i%9;
    p.digitsOnTop=i%7 == 0; p.ticksOnTop=i%5 == 0;
    p.digitShadow=i%3 != 0; p.digitScaleX=p.digitScaleXMin=1+(i%7)*0.5f;
    p.digitScaleY=p.digitScaleYMin=1+(i%5)*0.5f;
    p.digitParallax=(i%13)-6; p.tickParallax=(i%31)-15;
    p.tickMinorHeightH=p.tickMinorHeightM=i%40;
    p.tickMajorHeightH=p.tickMajorHeightM=i%31;
    p.tickMajorEveryH=3; p.tickMajorEveryM=5;
    p.tickStepH=1; p.tickStepM=5;
    p.tickMinorWidthH=p.tickMinorWidthM=1+i%4;
    p.tickEmboss=(i%5)*0.25f; p.markContrast=(i%3)*25;
    p.liquidTransparency=(i%17)/16.0f;
    p.tickPosH=p.tickPosM=i%3;
    p.lens=(i%9-4)*0.2f; p.lensCurve=(i%7-3)*0.25f;
    p.tickLens=(i%9-4)*0.25f; p.tickDryLens=(i%7-3)*0.25f;
    p.tubeHeight=4+(i*17)%77;
    p.remaining=i&1; p.freeLiquid=(i>>1)&1;
    p.traces=true; p.traceAmount=(i%17)*0.25f; p.traceFilm=(i%11)*0.1f;
    p.wetFilm=i%31; p.edgeSoft=i%5;
    p.meniscusDepth=(i%25)-12; p.meniscusAsym=2;
    TubeState s; s.fillTarget=randf(); s.fillPos=randf()*20-10; s.angle=randf()*12-6;
    s.slugPos=randf()*(536-columnLen(s.fillTarget,p)); s.cap=randf()*20-10;
    s.light=randf()*85; s.edgeLight=randf()*2-1; s.acrossTilt=randf()*2-1;
    if (i%4==0) s.edgeLight=s.acrossTilt=0;
    if (i%4==1) { s.edgeLight=1; s.acrossTilt=-1; }
    s.filmFree=i%7 ? randf() : 0; s.filmHome=i%9 ? randf() : 0;
    s.trace=trace; s.traceLo=i%200; s.traceHi=536-i%99;
    for(int x=0;x<536;x++) trace[x]=x<s.traceLo||x>=s.traceHi ? 0 : (uint16_t)(randf()*TRACE_FULL);
    renderTube(i&1,s,p,i+1,strip);
    // Fixed output size to make mismatches easy to locate; padding is deterministic.
    int n=tubeLayout(p).H*536;
    for(int x=n;x<536*80;x++) strip[x]=0;
    if (std::fwrite(strip,sizeof(strip),1,stdout)!=1) return 2;
  }
}
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference', required=True, type=Path)
    parser.add_argument('--tolerance', type=int, default=0,
                        help='max per-channel difference (RGB888 steps) still accepted; 0 = byte-identical (default)')
    args = parser.parse_args()
    reference = args.reference.resolve(strict=True)
    with tempfile.TemporaryDirectory(prefix='watches-frames-') as tmp:
        tmp = Path(tmp)
        (tmp / 'esp_heap_caps.h').write_text(
            '#pragma once\n#include <cstdlib>\n#define MALLOC_CAP_SPIRAM 0\n'
            'inline void *heap_caps_malloc(size_t n, int) { return std::malloc(n); }\n')
        (tmp / 'esp_random.h').write_text(
            '#pragma once\n#include <cstdint>\n'
            'inline uint32_t esp_random() { return 0xabcdef01; }\n')
        cpp = tmp / 'frames.cpp'
        cpp.write_text(HARNESS)
        outputs = []
        for name, source in [('reference', reference), ('current', ROOT / 'firmware/src/render.cpp')]:
            exe, output = tmp / name, tmp / (name + '.bin')
            subprocess.run([os.environ.get('CXX', 'c++'), '-std=c++17', '-O2',
                            '-ffp-contract=off', '-fsanitize=undefined,float-cast-overflow', '-fno-sanitize-recover=all',
                            '-I', str(tmp), '-I', str(ROOT / 'firmware/src'), '-I', str(ROOT / 'spec'),
                            str(cpp), str(source), str(ROOT / 'firmware/src/physics.cpp'),
                            '-o', str(exe)], check=True)
            with output.open('wb') as stream:
                subprocess.run([str(exe)], stdout=stream, check=True)
            outputs.append(output)
        scenes_differing = pixels_differing = worst = 0
        with outputs[0].open('rb') as before, outputs[1].open('rb') as after:
            for scene in range(SCENES):
                a, b = before.read(FRAME_BYTES), after.read(FRAME_BYTES)
                if len(a) != FRAME_BYTES or len(b) != FRAME_BYTES:
                    raise SystemExit(f'incomplete output at scene {scene}')
                if a == b:
                    continue
                if not args.tolerance:
                    pixel = next(i for i, (x, y) in enumerate(zip(a, b)) if x != y) // 2
                    raise SystemExit(f'scene {scene}: different pixel at x={pixel % 536}, row={pixel // 536}')
                scenes_differing += 1
                pa, pb = memoryview(a).cast('H'), memoryview(b).cast('H')   # strip words are byte-swapped 565; equal-or-not is layout-agnostic
                for i in range(len(pa)):
                    if pa[i] == pb[i]:
                        continue
                    pixels_differing += 1
                    d = channel_delta(pa[i], pb[i])
                    if d > worst:
                        worst = d
                    if d > args.tolerance:
                        raise SystemExit(f'scene {scene}: pixel x={i % 536}, row={i // 536} differs by {d} > {args.tolerance} (RGB888 steps)')
            if before.read(1) or after.read(1):
                raise SystemExit('unexpected trailing frame data')
        if not scenes_differing:
            print(f'{SCENES} complete render strips are byte-identical; UBSan passed')
        else:
            print(f'{SCENES} render strips within {args.tolerance} RGB888 steps: {scenes_differing} scenes / '
                  f'{pixels_differing} pixels differ, worst {worst}; UBSan passed')


def channel_delta(a, b):
    """Largest per-channel RGB888 difference between two byte-swapped RGB565 strip words."""
    a, b = ((a & 0xff) << 8) | (a >> 8), ((b & 0xff) << 8) | (b >> 8)
    def expand(c):
        r5, g6, b5 = c >> 11, (c >> 5) & 63, c & 31
        return (r5 << 3) | (r5 >> 2), (g6 << 2) | (g6 >> 4), (b5 << 3) | (b5 >> 2)
    return max(abs(x - y) for x, y in zip(expand(a), expand(b)))


if __name__ == '__main__':
    main()
