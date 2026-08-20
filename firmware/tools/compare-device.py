#!/usr/bin/env python3
"""Pixel-compare the board's rendered tube strips with the browser sim's renderer.

  python3 firmware/tools/compare-device.py [--port /dev/ttyACM0] [--out DIR]

Sends `x` to the firmware (dumps TubeState + both strips), renders the same state through
sim/src/render.ts in node (tools/render-ref.ts) with the params currently in the firmware (`p?`),
and writes device.png / ref.png / diff.png plus a mismatch summary. Fizz is switched off on the
device for the dump (random positions) and restored afterwards.
"""
import argparse, json, os, subprocess, sys, time
import serial
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SIM = os.path.join(ROOT, 'sim')
W, H, TH, Y0 = 536, 240, 72, (24, 144)
SHEETS = ['digits-steel', 'digits-brass-steampunk', 'digits-copper-gauge']

def talk(s, cmd, end=b'\n', timeout=10):
    s.reset_input_buffer(); s.write((cmd + '\n').encode()); s.flush()
    t0 = time.time(); out = b''
    while time.time() - t0 < timeout:
        c = s.read(65536); out += c
        if end in out: break
    return out.decode(errors='replace')

def to_img(px):  # list of (W*H) 565 ints -> RGB image, exact 565 expansion
    im = Image.new('RGB', (W, H)); d = []
    for c in px:
        r5, g6, b5 = (c >> 11) & 31, (c >> 5) & 63, c & 31
        d.append(((r5 << 3) | (r5 >> 2), (g6 << 2) | (g6 >> 4), (b5 << 3) | (b5 >> 2)))
    im.putdata(d); return im

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--port', default='/dev/ttyACM0'); ap.add_argument('--out', default=os.path.join(ROOT, 'firmware', '.compare'))
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    s = serial.Serial(a.port, 115200, timeout=0.3); time.sleep(0.3)
    params = json.loads(talk(s, 'p?').strip().splitlines()[-1])
    fizz_was = params['fizz']
    if fizz_was: talk(s, 'pfizz=0'); params['fizz'] = False
    dump = talk(s, 'x', b'END', timeout=60)
    if fizz_was: talk(s, 'pfizz=1')
    lines = [l.strip() for l in dump.splitlines() if l.strip()]
    st = [l for l in lines if l.startswith('STATE')][0].split()[1:]
    rows = [l for l in lines if len(l) == W * 4]
    assert len(rows) == 2 * TH, f'got {len(rows)} rows'
    dev = [0] * (W * H)
    for t in range(2):
        for y in range(TH):
            r = rows[t * TH + y]
            dev[(Y0[t] + y) * W:(Y0[t] + y + 1) * W] = [int(r[i:i + 4], 16) for i in range(0, W * 4, 4)]
    f = list(map(float, st))
    key = ['fillTarget', 'fillPos', 'angle', 'acrossShift', 'edgeLight']
    hours = dict(zip(key, f[:5]), fillVel=0, angleVel=0); minutes = dict(zip(key, f[5:]), fillVel=0, angleVel=0)
    job = {'params': params, 'hours': hours, 'minutes': minutes}
    font = int(round(params['digitFont']))
    if font >= 5:
        name = SHEETS[font - 5]; base = os.path.join(SIM, 'public', 'assets', name + '.png')
        im = Image.open(base).convert('RGBA'); meta = json.load(open(base + '.json'))
        rgba = os.path.join(a.out, 'sheet.rgba'); open(rgba, 'wb').write(im.tobytes())
        job['sprite'] = {'i': font - 5, 'w': im.width, 'h': im.height, 'cellW': meta['cellW'], 'cellH': meta['cellH'], 'widths': meta['widths'], 'rgbaFile': rgba}
    jobf = os.path.join(a.out, 'job.json'); json.dump(job, open(jobf, 'w'))
    outdir = os.path.join(SIM, 'node_modules', '.cache', 'render-ref')
    subprocess.check_call(['npx', 'tsc', '-p', 'tools/render-ref.tsconfig.json'], cwd=SIM)
    open(os.path.join(outdir, 'package.json'), 'w').write('{}')
    # tsc keeps the '@spec/layout' specifier; alias it for node
    spec_dir = os.path.join(outdir, 'node_modules', '@spec'); os.makedirs(spec_dir, exist_ok=True)
    import shutil; shutil.copy(os.path.join(outdir, 'spec', 'layout.js'), os.path.join(spec_dir, 'layout.js'))
    ref_bin = os.path.join(a.out, 'ref.bin')
    subprocess.check_call(['node', os.path.join(outdir, 'sim', 'tools', 'render-ref.js'), jobf, ref_bin])
    raw = open(ref_bin, 'rb').read(); ref = [raw[i] | (raw[i + 1] << 8) for i in range(0, len(raw), 2)]
    to_img(dev).save(os.path.join(a.out, 'device.png')); to_img(ref).save(os.path.join(a.out, 'ref.png'))
    diff = Image.new('RGB', (W, H)); dd = []; n = 0; big = 0
    for i in range(W * H):
        if dev[i] == ref[i]: dd.append((0, 0, 0)); continue
        n += 1
        A, B = to_img([dev[i]]).getpixel((0, 0)), to_img([ref[i]]).getpixel((0, 0))
        e = max(abs(A[k] - B[k]) for k in range(3)); big += e > 12
        dd.append((255, 255, 0) if e > 12 else (90, 0, 0))
    diff.putdata(dd); diff.save(os.path.join(a.out, 'diff.png'))
    print(f'state hours={hours} minutes={minutes}')
    print(f'mismatched pixels: {n} of {2 * W * TH} ({100 * n / (2 * W * TH):.2f}%), >12/255 off: {big}')
    print('wrote', a.out)

if __name__ == '__main__': main()
