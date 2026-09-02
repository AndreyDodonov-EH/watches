#!/usr/bin/env python3
"""fps benchmark on the board, in a pinned scene so runs are comparable.

  tools/bench.py [--scene 10:09:30] [--samples 5] [--stages] [--stage name=value ...] [--label TEXT]

Pins: clock fixed (`t`), demo frozen (`d0`), IMU influence off (`pinputGain=0`), waits for the physics
to settle, then reads `f` once per 2 s window and reports the median fps / render ms / push-wait ms.
--stages additionally turns rendering stages off one at a time (digits, ticks, fizz, glow, ...) and
prints what each costs. Every param it touched is restored from a `p?` snapshot at the end (not `p!`,
which would also overwrite NVS-tuned params) and demo speed goes back to x1.
"""
import argparse, json, os, statistics, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from device import Device

DEFAULT_STAGES = [  # name -> "off" value; the measured delta is that stage's cost
    ('digits', 0), ('digitShadow', 0), ('ticksH', 0), ('ticksM', 0), ('fizz', 0),
    ('edgeGlow', 0), ('frontBright', 0), ('meniscusDepth', 0), ('lens', 0), ('wetFilm', 0), ('traces', 0),
    ('glassBody', 0), ('glassRim', 0), ('liquidTransparency', 1),
]

def fmt(v):
    if isinstance(v, bool): return '1' if v else '0'
    if isinstance(v, float) and v.is_integer(): return str(int(v))
    return str(v)

def sample(d, n, settle):
    time.sleep(settle)
    rows = []
    for _ in range(n):
        time.sleep(2.1)
        r = d.talk('f')      # "fps 19.8  render 46.48 ms  push-wait 0.02 ms  (...)"
        t = r.split()
        rows.append((float(t[1]), float(t[3]), float(t[6])))
    med = lambda i: statistics.median(r[i] for r in rows)
    return med(0), med(1), med(2), rows

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port'); ap.add_argument('--scene', default='10:09:30')
    ap.add_argument('--samples', type=int, default=5); ap.add_argument('--settle', type=float, default=4)
    ap.add_argument('--stages', action='store_true'); ap.add_argument('--stage', action='append', default=[])
    ap.add_argument('--label', default=''); ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    d = Device(a.port)
    snap = json.loads(d.talk('p?').splitlines()[-1])
    touched = set()
    def setp(k, v): d.talk(f'p{k}={fmt(v)}'); touched.add(k)
    result = {'scene': a.scene, 'label': a.label}
    try:
        d.talk('l'); d.talk(f't {a.scene}'); d.talk('d0'); setp('inputGain', 0)
        fps, ren, wait, rows = sample(d, a.samples, a.settle)
        result.update(fps=fps, render_ms=ren, wait_ms=wait, samples=rows)
        print(f'{a.label + ": " if a.label else ""}fps {fps:.1f}  render {ren:.2f} ms  push-wait {wait:.2f} ms  '
              f'(scene {a.scene}, median of {a.samples}; spread {min(r[0] for r in rows):.1f}–{max(r[0] for r in rows):.1f})')
        stages = list(DEFAULT_STAGES) if a.stages else []
        for s in a.stage:
            k, v = s.split('=', 1); stages.append((k, v))
        if stages:
            print(f'{"stage off":22} {"fps":>6} {"render":>8} {"cost ms":>8}')
            result['stages'] = {}
            for k, v in stages:
                if k not in snap: print(f'{k:22} (unknown param)'); continue
                if fmt(snap[k]) == fmt(v): print(f'{k:22} already {fmt(v)}'); continue
                setp(k, v)
                f2, r2, w2, _ = sample(d, max(3, a.samples - 2), 1.5)
                setp(k, snap[k])
                result['stages'][k] = {'fps': f2, 'render_ms': r2, 'cost_ms': ren - r2}
                print(f'{k + "=" + fmt(v):22} {f2:6.1f} {r2:8.2f} {ren - r2:+8.2f}')
    finally:
        for k in touched: d.talk(f'p{k}={fmt(snap[k])}')
        d.talk('d1'); d.close()
    if a.json: print(json.dumps(result))

if __name__ == '__main__': main()
